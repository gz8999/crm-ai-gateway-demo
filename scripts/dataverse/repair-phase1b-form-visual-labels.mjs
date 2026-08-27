import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
let FORM_ID;
let ORIGINAL_FORM_ID;
const FORM_NAME = "AI Gateway Opportunity Demo - Full Replica";
const DOCS = "docs/d365";

const TAB_LABELS = {
  aigw_fr_tab_summary: ["摘要", "Summary"], aigw_fr_tab_budget: ["预算", "Budget"], aigw_fr_tab_actuals: ["实绩", "Actuals"],
  Product_Line_Items: ["产品", "Products"], documents_sharepoint: ["文件", "Files"],
};
const SECTION_LABELS = {
  aigw_fr_summary_opportunity_info: ["商机信息", "Opportunity Information"], aigw_fr_summary_overview: ["汇总信息", "Summary Information"],
  aigw_fr_summary_budget: ["预算", "Budget"], aigw_fr_summary_annual_budget: ["年度预算", "Annual Budget"], aigw_fr_summary_actuals: ["实绩", "Actuals"],
  aigw_fr_summary_sales_person: ["Sales Person Info", "Sales Person Info"], aigw_fr_summary_business_details: ["商机详细信息", "Opportunity Details"],
  aigw_fr_summary_pol_pod: ["POL&POD", "POL&POD"], aigw_fr_summary_timeline: ["Timeline", "Timeline"],
  aigw_fr_budget_q1: ["1Q", "1Q"], aigw_fr_budget_q2: ["2Q", "2Q"], aigw_fr_budget_q3: ["3Q", "3Q"], aigw_fr_budget_q4: ["4Q", "4Q"],
  aigw_fr_actuals_information: ["实绩", "Actuals"],
};
const STANDARD_LABELS = {
  name: ["案件名称", "Opportunity Name"], parentaccountid: ["客户", "Customer"], parentcontactid: ["联系人1", "Contact 1"], statuscode: ["状态描述", "Status Description"],
  transactioncurrencyid: ["货币", "Currency"], description: ["说明", "Description"], estimatedclosedate: ["预计下单日", "Estimated Order Date"],
  estimatedvalue: ["预算金额", "Budget Amount"], actualclosedate: ["受注日期", "Order Date"], actualvalue: ["受注金额", "Order Amount"], ownerid: ["负责人", "Owner"],
};
const LEFT = ["aigw_fr_summary_opportunity_info", "aigw_fr_summary_sales_person", "aigw_fr_summary_business_details", "aigw_fr_summary_pol_pod"];
const RIGHT = ["aigw_fr_summary_overview", "aigw_fr_summary_budget", "aigw_fr_summary_annual_budget", "aigw_fr_summary_actuals", "aigw_fr_summary_timeline"];
const confirm = process.argv.includes("--confirm");
const preflightIndex = process.argv.indexOf("--preflight");
const preflightArg = preflightIndex >= 0 ? process.argv[preflightIndex + 1] : "";
const hash = (value) => createHash("sha256").update(String(value || "")).digest("hex");
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const attr = (tag, key) => new RegExp(`\\b${key}="([^"]*)"`).exec(tag)?.[1] || "";

function elements(xml, tag) { const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "g"); let m; let depth = 0; let start = -1; const out = []; while ((m = re.exec(xml))) { if (m[0].startsWith("</")) { if (--depth === 0 && start >= 0) out.push(xml.slice(start, re.lastIndex)); } else if (depth++ === 0) start = m.index; } return out; }
function startTag(xml) { return /^<[^>]+>/.exec(xml)?.[0] || ""; }
function labels(zh, en) { return `<labels><label description="${esc(en)}" languagecode="1033" /><label description="${esc(zh)}" languagecode="2052" /></labels>`; }
function replaceDirectLabels(element, zh, en) { const open = startTag(element); const rest = element.slice(open.length); const replaced = rest.replace(/^\s*<labels>[\s\S]*?<\/labels>/, labels(zh, en)); return open + replaced; }
function replaceByName(xml, tag, mapping, { showLabel } = {}) {
  let output = xml;
  for (const [name, [zh, en]] of Object.entries(mapping)) {
    const target = elements(output, tag).filter((element) => attr(startTag(element), "name") === name);
    if (target.length !== 1) throw new Error(`Expected one ${tag} named ${name}; found ${target.length}`);
    let replacement = replaceDirectLabels(target[0], zh, en);
    if (showLabel) replacement = replacement.replace(/\bshowlabel="(?:true|false)"/, 'showlabel="true"');
    output = output.replace(target[0], replacement);
  }
  return output;
}
function fieldLabels(matrix) {
  const map = new Map(Object.entries(STANDARD_LABELS));
  for (const row of matrix) {
    if (!row.targetLogicalName || map.has(row.targetLogicalName)) continue;
    const zh = row.sourceLabel || row.targetLabel || row.targetLogicalName;
    const en = row.targetLabel || row.sourceLabel || row.targetLogicalName;
    map.set(row.targetLogicalName, [zh, en]);
  }
  return map;
}
function replaceControlLabels(xml, map) {
  return xml.replace(/<cell\b[^>]*>[\s\S]*?<\/cell>/g, (cell) => {
    const field = /<control\b[^>]*\bdatafieldname="([^"]+)"/.exec(cell)?.[1];
    const pair = field && map.get(field); if (!pair) return cell;
    return replaceDirectLabels(cell, pair[0], pair[1]);
  });
}
function reorderSummary(xml) {
  const tabs = elements(elements(xml, "tabs")[0] || "", "tab"); const summary = tabs.find((tab) => attr(startTag(tab), "name") === "aigw_fr_tab_summary");
  if (!summary) throw new Error("Summary tab not found"); const cols = elements(summary, "column"); if (cols.length !== 2) throw new Error(`Expected two Summary columns; found ${cols.length}`);
  const allSections = cols.flatMap((column) => elements(column, "section")); const byName = new Map(allSections.map((section) => [attr(startTag(section), "name"), section]));
  for (const name of [...LEFT, ...RIGHT]) if (!byName.has(name)) throw new Error(`Summary section ${name} not found`);
  const wrap = (column, names) => `${startTag(column).replace(/\bwidth="[^"]*"/, 'width="50%"')}<sections>${names.map((name) => byName.get(name)).join("")}</sections></column>`;
  const newColumns = `<columns>${wrap(cols[0], LEFT)}${wrap(cols[1], RIGHT)}</columns>`;
  const next = summary.replace(/<columns>[\s\S]*?<\/columns>/, newColumns);
  return xml.replace(summary, next);
}
function analyze(xml, matrix) {
  const tabs = elements(elements(xml, "tabs")[0] || "", "tab"); const sections = tabs.flatMap((tab) => elements(tab, "section")); const fields = [...xml.matchAll(/<control\b[^>]*\bdatafieldname="([^"]+)"/g)].map((m) => m[1]);
  const summary = tabs.find((tab) => attr(startTag(tab), "name") === "aigw_fr_tab_summary") || ""; const columns = elements(summary, "column");
  const labelsFor = (element) => [...(element.match(/<labels>([\s\S]*?)<\/labels>/)?.[1] || "").matchAll(/<label description="([^"]*)" languagecode="(\d+)"/g)].map((m) => ({ description: m[1], languagecode: m[2] }));
  const tabData = tabs.map((tab) => ({ name: attr(startTag(tab), "name"), id: attr(startTag(tab), "id"), labels: labelsFor(tab) }));
  const sectionData = sections.map((section) => ({ name: attr(startTag(section), "name"), id: attr(startTag(section), "id"), showlabel: attr(startTag(section), "showlabel"), labels: labelsFor(section) }));
  const monthly = [4,5,6,7,8,9,10,11,12,1,2,3].flatMap((n) => ["revenuebudget", "gpmpbudget", "volumebudget"].map((kind) => `aigw_m${n}${kind}`)); const budget = tabs.find((tab) => attr(startTag(tab), "name") === "aigw_fr_tab_budget") || "";
  const ids = (tag) => elements(xml, tag).map((item) => attr(startTag(item), "id")); const idsUnique = (tag) => new Set(ids(tag)).size === ids(tag).length;
  const visibleBound = [...xml.matchAll(/<cell\b[^>]*>[\s\S]*?<\/cell>/g)].filter((m) => /datafieldname=/.test(m[0])); const missingControlLabels = visibleBound.map((m) => ({ field: /datafieldname="([^"]+)"/.exec(m[0])?.[1], labels: labelsFor(m[0]) })).filter((item) => !item.labels.some((x) => x.languagecode === "2052" && x.description) || !item.labels.some((x) => x.languagecode === "1033" && x.description));
  const names = sectionData.map((item) => item.name); const tnames = tabData.map((item) => item.name);
  return { hash: hash(xml), counts: { tabs: tabs.length, sections: sections.length, controls: elements(xml, "control").length, uniqueBoundFields: new Set(fields).size }, tabData, sectionData, summaryColumns: columns.map((column) => ({ width: attr(startTag(column), "width"), sections: elements(column, "section").map((section) => attr(startTag(section), "name")) })), labels: { emptyTabs: tabData.filter((item) => !item.labels.some((x) => x.languagecode === "2052" && x.description) || !item.labels.some((x) => x.languagecode === "1033" && x.description)).map((item) => item.name), emptyBusinessSections: sectionData.filter((item) => SECTION_LABELS[item.name] && (!item.labels.some((x) => x.languagecode === "2052" && x.description) || !item.labels.some((x) => x.languagecode === "1033" && x.description) || item.showlabel !== "true")).map((item) => item.name), missingControlLabels }, invariants: { namesUnique: new Set(tnames).size === tnames.length && new Set(names).size === names.length, targetBusinessFields: new Set(fields).size >= 98, monthlyInBudget: monthly.filter((field) => budget.includes(`datafieldname="${field}"`)).length, monthlyOutsideBudget: monthly.filter((field) => xml.replace(budget, "").includes(`datafieldname="${field}"`)).length, header: ["aigw_winprobabilityrank", "aigw_budgetstatus", "ownerid"].filter((field) => (elements(xml, "header")[0] || "").includes(`datafieldname="${field}"`)), idsUnique: ["tab", "section", "cell", "control"].every(idsUnique), hasTimeline: xml.includes('name="aigw_fr_summary_timeline"'), hasProduct: xml.includes('name="Product_Line_Items"'), hasDocuments: xml.includes('name="documents_sharepoint"'), hasNavigation: /<Navigation\b/.test(xml), hasQuotes: xml.includes('name="QUOTES"'), hasAiGateway: xml.includes('name="AI_Gateway_Demo"'), actualsSubgrid: (tabs.find((tab) => attr(startTag(tab), "name") === "aigw_fr_tab_actuals") || "").includes('indicationOfSubgrid="true"') } };
}
export async function main() {
  EXPECTED_URL = getDataverseUrl();
  FORM_ID = getRequiredEnvironmentId("D365_FULL_REPLICA_FORM_ID");
  ORIGINAL_FORM_ID = getRequiredEnvironmentId("D365_ORIGINAL_FORM_ID");
  assertDataverseScriptGate({ mode: "write-capable" });
  const root = process.cwd(); const client = createDynamicsClient(); const get = async (url) => (await client.dataverseGet(url)).body;
  if (client.config.dataverseUrl !== EXPECTED_URL || (process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed");
  const [current, original, matrixDoc] = await Promise.all([get(`/api/data/v9.2/systemforms(${FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,description,isdefault,formactivationstate,formxml`),get(`/api/data/v9.2/systemforms(${ORIGINAL_FORM_ID})?$select=formid,formxml`),fs.readFile(path.join(root, DOCS, "phase1b-form-field-placement.json"), "utf8").then(JSON.parse)]);
  if (current.name !== FORM_NAME || current.formactivationstate !== 0 || current.isdefault !== false) throw new Error("Target Form state gate failed");
  const originalHash = hash(original.formxml); const map = fieldLabels(matrixDoc.matrix || []); let repaired = replaceByName(current.formxml, "tab", TAB_LABELS); repaired = replaceByName(repaired, "section", SECTION_LABELS, { showLabel: true }); repaired = replaceControlLabels(repaired, map); repaired = reorderSummary(repaired);
  const before = analyze(current.formxml, matrixDoc.matrix || []); const after = analyze(repaired, matrixDoc.matrix || []); const bad = after.counts.tabs !== 5 || after.counts.sections !== 19 || !after.invariants.namesUnique || after.labels.emptyTabs.length || after.labels.emptyBusinessSections.length || after.labels.missingControlLabels.length || after.invariants.monthlyInBudget !== 36 || after.invariants.monthlyOutsideBudget !== 0 || after.invariants.header.length !== 3 || !after.invariants.idsUnique || !after.invariants.hasTimeline || !after.invariants.hasProduct || !after.invariants.hasDocuments || !after.invariants.hasNavigation || after.invariants.hasQuotes || after.invariants.hasAiGateway || after.invariants.actualsSubgrid || JSON.stringify(after.summaryColumns.map((x) => x.sections)) !== JSON.stringify([LEFT, RIGHT]);
  if (bad) throw new Error(`Visual repair preflight failed: ${JSON.stringify({ before, after })}`);
  const dir = preflightArg ? path.dirname(path.resolve(preflightArg)) : path.join(root, "backups", "dataverse", `phase1b_form_visual_repair_${stamp()}`); await fs.mkdir(dir, { recursive: true }); const preflightPath = preflightArg ? path.resolve(preflightArg) : path.join(dir, "01_visual_repair_preflight.json");
  if (!confirm) { const preview = { dryRun: true, targetFormId: FORM_ID, beforeHash: before.hash, originalFormHash: originalHash, before, after, nodeChanges: { tabs: 5, businessSections: 14, boundControlLabels: after.counts.uniqueBoundFields }, patch: { endpoint: `/api/data/v9.2/systemforms(${FORM_ID})`, fields: ["formxml"], publishExecuted: false } }; await Promise.all([fs.writeFile(path.join(dir, "00_unpublished_before.xml"), current.formxml),fs.writeFile(path.join(dir, "02_repaired_unpublished_formxml.xml"), repaired),fs.writeFile(preflightPath, JSON.stringify(preview, null, 2))]); console.log(JSON.stringify(preview, null, 2)); return; }
  const preflight = JSON.parse(await fs.readFile(preflightPath, "utf8")); if (preflight.beforeHash !== before.hash || preflight.originalFormHash !== originalHash) throw new Error("Form changed since preflight; no PATCH performed");
  await client.dataversePatch(`/api/data/v9.2/systemforms(${FORM_ID})`, { formxml: repaired });
  const [afterForm, originalAfter] = await Promise.all([get(`/api/data/v9.2/systemforms(${FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,description,isdefault,formactivationstate,formxml`),get(`/api/data/v9.2/systemforms(${ORIGINAL_FORM_ID})?$select=formid,formxml`)]);
  const final = analyze(afterForm.formxml, matrixDoc.matrix || []); const result = { formId: FORM_ID, beforeHash: before.hash, afterHash: final.hash, labels: final.labels, summaryColumns: final.summaryColumns, validation: final.invariants, counts: final.counts, originalUnchanged: hash(originalAfter.formxml) === originalHash, publishExecuted: false, rollback: { restoreFormXmlFrom: path.join(dir, "00_unpublished_before.xml"), requiresSeparateConfirmation: true } }; await fs.writeFile(path.join(dir, "03_visual_repair_result.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
}

runDataverseCli(import.meta.url, main);
