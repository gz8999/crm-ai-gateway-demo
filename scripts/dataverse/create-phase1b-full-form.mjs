import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION = "CRMAIGatewayDemo";
const SOLUTION_NAME = "CRM AI Gateway Demo";
const PREFIX = "aigw";
let SOURCE_FORM_ID;
const SOURCE_FORM_NAME = "AI Gateway Opportunity Demo";
const TARGET_FORM_NAME = "AI Gateway Opportunity Demo - Full Replica";
const DOCS = "docs/d365";

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const preflightIndex = args.indexOf("--preflight");
const suppliedPreflight = preflightIndex >= 0 ? args[preflightIndex + 1] : "";

function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function stamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
function guid() { return `{${randomUUID().toUpperCase()}}`; }
function esc(value) { return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function formSnapshot(form) { return { formxml: hash(form.formxml || ""), formjson: hash(form.formjson || ""), formpresentation: hash(form.formpresentation || "") }; }

function topLevelElements(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "g");
  const output = []; let match; let depth = 0; let start = -1;
  while ((match = re.exec(xml))) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0 && start >= 0) output.push(xml.slice(start, re.lastIndex));
    } else if (depth++ === 0) start = match.index;
  }
  return output;
}

function attr(element, name) { return new RegExp(`\\b${name}="([^"]*)"`).exec(element)?.[1] || ""; }
function getElement(xml, tag, predicate = () => true) { return topLevelElements(xml, tag).find(predicate); }
function xmlWellFormed(xml) {
  const stack = [];
  for (const token of String(xml).replace(/<!--[\s\S]*?-->/g, "").match(/<[^>]+>/g) || []) {
    if (/^<\//.test(token)) { const name = token.slice(2, -1).trim(); if (stack.pop() !== name) return { ok: false, error: `Mismatched closing tag: ${name}` }; }
    else if (!/^<!/.test(token) && !/\/>$/.test(token)) stack.push((/^<\s*([^\s/>]+)/.exec(token) || [])[1]);
  }
  return stack.length ? { ok: false, error: `Unclosed tag: ${stack.at(-1)}` } : { ok: true };
}

function validateWithXmllint(xml) {
  try {
    execFileSync("xmllint", ["--noout", "-"], { input: xml, stdio: ["pipe", "pipe", "pipe"] });
    return { ok: true };
  } catch (error) { return { ok: false, error: String(error.stderr || error.message).trim() }; }
}

function controlClassByField(xml, field) {
  const match = new RegExp(`<control\\b(?=[^>]*\\bdatafieldname="${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}")[^>]*\\bclassid="([^"]+)"[^>]*/?>`).exec(xml)
    || new RegExp(`<control\\b(?=[^>]*\\bclassid="([^"]+)")(?=[^>]*\\bdatafieldname="${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}")[^>]*/?>`).exec(xml);
  return match?.[1] || "";
}

function getClassMap(xml) {
  const examples = {
    text: "name", lookup: "parentaccountid", choice: "aigw_opportunitytype", boolean: "aigw_budgetstatus",
    money: "estimatedvalue", decimal: "aigw_projectsize", date: "aigw_startdate", memo: "description", status: "statuscode"
  };
  const classes = Object.fromEntries(Object.entries(examples).map(([key, field]) => [key, controlClassByField(xml, field)]));
  if (!classes.status) classes.status = classes.choice;
  if (!classes.money) classes.money = controlClassByField(xml, "budgetamount");
  if (!classes.decimal) classes.decimal = classes.money;
  if (!classes.boolean || !classes.choice || !classes.text || !classes.lookup || !classes.date || !classes.memo || !classes.money || !classes.decimal) {
    throw new Error(`Unable to reuse all required control templates: ${JSON.stringify(classes)}`);
  }
  return classes;
}

function controlKind(row) {
  const control = String(row.specialControl || "").toLowerCase();
  if (control.includes("lookup")) return "lookup";
  if (control.includes("boolean")) return "boolean";
  if (control.includes("currency") || control.includes("money")) return "money";
  if (control.includes("decimal")) return "decimal";
  if (control.includes("date")) return "date";
  if (control.includes("textarea") || control.includes("memo")) return "memo";
  if (row.targetLogicalName === "statuscode") return "status";
  if (control.includes("choice") || control.includes("option")) return "choice";
  return "text";
}

function fieldCell(row, classes) {
  const kind = controlKind(row); const id = `aigw_fullreplica_${row.targetLogicalName.replace(/[^A-Za-z0-9_]/g, "_")}_${randomUUID().slice(0, 8)}`;
  return `<cell id="${guid()}" showlabel="true" locklevel="0"><labels><label description="${esc(row.targetLabel || row.sourceLabel)}" languagecode="1033" /></labels><control id="${id}" classid="${classes[kind]}" datafieldname="${row.targetLogicalName}" disabled="${row.disabled === true ? "true" : "false"}" /></cell>`;
}

function blankCell() { return `<cell id="${guid()}" showlabel="false" locklevel="0" />`; }
function section(name, rows, columns, classes, { empty = false } = {}) {
  const grouped = new Map();
  for (const row of rows) { const key = Number(row.rowIndex || 0); if (!grouped.has(key)) grouped.set(key, []); grouped.get(key)[Number(row.columnIndex || 0)] = row; }
  const content = empty ? `<rows><row>${blankCell()}</row></rows>` : `<rows>${[...grouped.entries()].sort(([a], [b]) => a - b).map(([, cells]) => `<row>${Array.from({ length: columns }, (_, index) => cells[index] ? fieldCell(cells[index], classes) : blankCell()).join("")}</row>`).join("")}</rows>`;
  return `<section name="aigw_fullreplica_${name.replace(/[^A-Za-z0-9_]/g, "_")}" showlabel="true" showbar="true" id="${guid()}" columns="${columns}" IsUserDefined="1" locklevel="0" labelwidth="130" celllabelalignment="Left" celllabelposition="Left"><labels><label description="${esc(name)}" languagecode="1033" /></labels>${content}</section>`;
}

function tab(name, columns) {
  return `<tab name="${esc(name)}" verticallayout="true" id="${guid()}" IsUserDefined="1" expanded="true" locklevel="0" showlabel="true"><labels><label description="${esc(name)}" languagecode="1033" /></labels><columns>${columns.map((sections, index) => `<column width="${Math.floor(100 / columns.length)}%"><sections>${sections}</sections></column>`).join("")}</columns></tab>`;
}

function replaceElement(xml, tag, replacement) {
  const element = getElement(xml, tag); if (!element) throw new Error(`Source FormXML does not contain <${tag}>`);
  return xml.replace(element, replacement);
}

function replaceHeader(xml, matrix, classes) {
  const header = getElement(xml, "header"); if (!header) throw new Error("Source FormXML does not contain a header");
  const headerRows = matrix.filter((row) => row.headerPlacement === true);
  const cells = headerRows.map((row) => fieldCell(row, classes)).join("");
  const next = `<header id="${guid()}" celllabelposition="Top" columns="${"1".repeat(headerRows.length)}" labelwidth="115"><rows><row>${cells}</row></rows></header>`;
  return xml.replace(header, next);
}

function buildFormXml(sourceXml, matrix) {
  const classes = getClassMap(sourceXml);
  const existingTabs = topLevelElements(getElement(sourceXml, "tabs") || "", "tab");
  const product = existingTabs.find((item) => attr(item, "name") === "Product_Line_Items");
  const documents = existingTabs.find((item) => attr(item, "name") === "documents_sharepoint");
  if (!product || !documents) throw new Error("Source FormXML is missing Product_Line_Items or documents_sharepoint system tab");
  const matrixRows = matrix.filter((row) => row.targetExists && !row.metadataOnly && row.targetFormTab);
  const summarySections = ["商机信息", "汇总信息", "预算摘要", "年度预算摘要", "实绩摘要", "Sales Person Info", "商机详细信息", "POL&POD"];
  const bySection = (tabName, sectionName) => matrixRows.filter((row) => row.targetFormTab === tabName && row.targetSection === sectionName).sort((a, b) => Number(a.displayOrder) - Number(b.displayOrder));
  const sourceSummary = existingTabs.find((item) => attr(item, "name") === "Summary");
  const sourceTimeline = getElement(sourceSummary || "", "section", (item) => attr(item, "name") === "aigw_summary_timeline") || section("Timeline", [], 1, classes, { empty: true });
  const summary = tab("Summary", [
    [section("商机信息", bySection("摘要", "商机信息"), 2, classes), section("Sales Person Info", bySection("摘要", "Sales Person Info"), 2, classes), section("商机详细信息", bySection("摘要", "商机详细信息"), 2, classes), section("POL&POD", bySection("摘要", "POL&POD"), 2, classes), sourceTimeline].join(""),
    [section("汇总信息", bySection("摘要", "汇总信息"), 2, classes), section("预算摘要", bySection("摘要", "预算摘要"), 2, classes), section("年度预算摘要", bySection("摘要", "年度预算摘要"), 2, classes), section("实绩摘要", bySection("摘要", "实绩摘要"), 2, classes)].join("")
  ]);
  const budget = tab("Budget", [
    ["1Q", "2Q", "3Q", "4Q"].map((quarter) => section(quarter, bySection("预算", quarter), 3, classes)).join("")
  ]);
  const actuals = tab("Actuals", [section("实绩管理（Phase 1C 支撑表待创建）", [], 1, classes, { empty: true })]);
  const tabs = `<tabs>${summary}${budget}${actuals}${product}${documents}</tabs>`;
  let output = replaceElement(sourceXml, "tabs", tabs);
  output = replaceHeader(output, matrix, classes);
  return { formxml: output, classes };
}

function validateFormXml(formxml, matrix, attributeNames) {
  const controlIds = [...formxml.matchAll(/<control\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  const tabIds = [...formxml.matchAll(/<tab\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  const sectionIds = [...formxml.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  const fields = [...formxml.matchAll(/<control\b[^>]*\bdatafieldname="([^"]+)"/g)].map((match) => match[1]);
  const expected = matrix.filter((row) => row.targetExists && !row.metadataOnly && row.targetFormTab).map((row) => row.targetLogicalName);
  const budgetFields = matrix.filter((row) => row.targetFormTab === "预算" && row.targetExists && !row.metadataOnly).map((row) => row.targetLogicalName);
  const budgetTab = topLevelElements(getElement(formxml, "tabs") || "", "tab").find((item) => attr(item, "name") === "Budget") || "";
  const budgetBound = [...budgetTab.matchAll(/datafieldname="([^"]+)"/g)].map((match) => match[1]);
  const unique = (values) => new Set(values).size === values.length;
  const missingMetadata = [...new Set(fields.filter((field) => !attributeNames.has(field)))];
  const actualsTab = topLevelElements(getElement(formxml, "tabs") || "", "tab").find((item) => attr(item, "name") === "Actuals") || "";
  return {
    xml: xmlWellFormed(formxml), xmllint: validateWithXmllint(formxml), controlIdsUnique: unique(controlIds), tabIdsUnique: unique(tabIds), sectionIdsUnique: unique(sectionIds),
    uniqueBoundFields: new Set(fields).size, boundControls: fields.length, missingExpectedControls: expected.filter((field) => !fields.includes(field)), missingMetadata,
    budgetFieldsExpected: budgetFields.length, budgetFieldsInBudgetTab: budgetFields.filter((field) => budgetBound.includes(field)).length,
    budgetFieldsOutsideBudgetTab: budgetFields.filter((field) => fields.includes(field) && !budgetBound.includes(field)),
    actualsHasSubgrid: actualsTab.includes('indicationOfSubgrid="true"'), actualsHasPlaceholder: /actuals_subgrid_placeholder/i.test(actualsTab),
    hasQuotesTab: /<tab\b[^>]*\bname="QUOTES"/.test(formxml), hasAiGatewayTab: /<tab\b[^>]*\bname="AI_Gateway_Demo"/.test(formxml),
    hasProductTab: /<tab\b[^>]*\bname="Product_Line_Items"/.test(formxml), hasDocumentsTab: /<tab\b[^>]*\bname="documents_sharepoint"/.test(formxml),
    hasHeaderFields: ["aigw_winprobabilityrank", "aigw_budgetstatus", "ownerid"].every((field) => new RegExp(`<header[\\s\\S]*?datafieldname="${field}"`).test(formxml)),
    tabs: [...formxml.matchAll(/<tab\b/g)].length, sections: [...formxml.matchAll(/<section\b/g)].length, containsSecret: /(?:api[_-]?key|client_secret|BEGIN PRIVATE KEY)/i.test(formxml)
  };
}

function formJsonReflectsTarget(formjson) {
  const value = String(formjson || "");
  return Boolean(value) && ["Budget", "1Q", "2Q", "3Q", "4Q", "aigw_m4revenuebudget", "aigw_winprobabilityrank", "aigw_budgetstatus"].every((term) => value.includes(term));
}

export async function main() {
  EXPECTED_URL = getDataverseUrl();
  SOURCE_FORM_ID = getRequiredEnvironmentId("D365_ORIGINAL_FORM_ID");
  assertDataverseScriptGate({ mode: "write-capable" });
  const root = process.cwd(); const client = createDynamicsClient(); const get = async (p) => (await client.dataverseGet(p)).body;
  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: unexpected Dataverse URL");
  if ((process.env.AI_PROVIDER || "demo") !== "demo") throw new Error("Safety gate failed: AI_PROVIDER must be demo");
  if ((process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: ALLOW_EXTERNAL_AI must be false");
  const [solutionData, source, attributes] = await Promise.all([
    get(`/api/data/v9.2/solutions?$select=solutionid,friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
    get(`/api/data/v9.2/systemforms(${SOURCE_FORM_ID})?$select=formid,name,type,objecttypecode,isdefault,formactivationstate,formxml,formjson,formpresentation`),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=LogicalName,AttributeType")
  ]);
  const solution = solutionData.value?.[0];
  if (!solution || solution.ismanaged || solution.friendlyname !== SOLUTION_NAME) throw new Error("Safety gate failed: unmanaged target solution not confirmed");
  const publisher = await get(`/api/data/v9.2/publishers?$select=customizationprefix&$filter=publisherid eq ${solution._publisherid_value}`);
  if (publisher.value?.[0]?.customizationprefix !== PREFIX) throw new Error("Safety gate failed: publisher prefix is not aigw");
  if (source.formid !== SOURCE_FORM_ID || source.name !== SOURCE_FORM_NAME || source.type !== 2 || source.objecttypecode !== "opportunity") throw new Error("Safety gate failed: protected source Form no longer matches");
  const matrixDocument = JSON.parse(await fs.readFile(path.join(root, DOCS, "phase1b-form-field-placement.json"), "utf8"));
  const matrix = matrixDocument.matrix; if (!Array.isArray(matrix) || matrix.length !== 117) throw new Error("Dry-run field matrix is incomplete");
  const formDraft = await fs.readFile(path.join(root, DOCS, "phase1b-full-replica-formxml-draft.xml",), "utf8");
  const manifest = JSON.parse(await fs.readFile(path.join(root, DOCS, "phase1b-write-manifest.json"), "utf8"));
  if (manifest.dryRun !== true || !formDraft.includes(TARGET_FORM_NAME)) throw new Error("Dry-run Form inputs are invalid");
  const output = buildFormXml(source.formxml, matrix); const attributeNames = new Set((attributes.value || []).map((item) => item.LogicalName));
  const validation = validateFormXml(output.formxml, matrix, attributeNames);
  const failed = !validation.xml.ok || !validation.xmllint.ok || !validation.controlIdsUnique || !validation.tabIdsUnique || !validation.sectionIdsUnique || validation.missingExpectedControls.length || validation.missingMetadata.length || validation.budgetFieldsExpected !== 36 || validation.budgetFieldsInBudgetTab !== 36 || validation.budgetFieldsOutsideBudgetTab.length || validation.actualsHasSubgrid || validation.actualsHasPlaceholder || validation.hasQuotesTab || validation.hasAiGatewayTab || !validation.hasProductTab || !validation.hasDocumentsTab || !validation.hasHeaderFields || validation.containsSecret;
  if (failed) throw new Error(`FormXML preflight validation failed: ${JSON.stringify(validation)}`);
  const dir = suppliedPreflight ? path.dirname(path.resolve(suppliedPreflight)) : path.join(root, "backups", "dataverse", `phase1b_form_${stamp()}`);
  await fs.mkdir(dir, { recursive: true }); const preflightPath = suppliedPreflight ? path.resolve(suppliedPreflight) : path.join(dir, "01_create_preflight.json");
  const sourceHash = formSnapshot(source);
  if (!confirm) {
    const preview = {
      dryRun: true, createdAt: new Date().toISOString(), backupDir: path.relative(root, dir), sourceFormId: SOURCE_FORM_ID, sourceHash, targetName: TARGET_FORM_NAME,
      copyEndpoint: `/api/data/v9.2/systemforms(${SOURCE_FORM_ID})/Microsoft.Dynamics.CRM.CopySystemForm`, requestHeaders: { "MSCRM.SolutionUniqueName": SOLUTION },
      copyPayload: { Target: { name: TARGET_FORM_NAME, isdefault: false, formactivationstate: 0 } },
      activationFallback: { endpoint: "/api/data/v9.2/systemforms(<new-form-id>)", payload: { formactivationstate: 0 }, allowedOnlyForNewForm: true },
      plannedPatch: ["formxml"], publish: { executed: false, reason: "Phase 1B-2A explicitly forbids PublishXml" }, formXmlSha256: hash(output.formxml), validation,
      solutionFallback: { endpoint: "/api/data/v9.2/AddSolutionComponent", payload: { ComponentId: "<new-form-id>", ComponentType: 60, SolutionUniqueName: SOLUTION, AddRequiredComponents: false, DoNotIncludeSubcomponents: true } }
    };
    await Promise.all([
      fs.writeFile(path.join(dir, "00_source_form_before.json"), JSON.stringify(source, null, 2)), fs.writeFile(path.join(dir, "02_target_formxml.xml"), output.formxml),
      fs.writeFile(path.join(dir, "03_dryrun_formxml_description.xml"), formDraft), fs.writeFile(path.join(dir, "04_field_matrix.json"), JSON.stringify(matrixDocument, null, 2)),
      fs.writeFile(preflightPath, JSON.stringify(preview, null, 2))
    ]);
    console.log(JSON.stringify(preview, null, 2)); return;
  }
  const preflight = JSON.parse(await fs.readFile(preflightPath, "utf8"));
  if (JSON.stringify(preflight.sourceHash) !== JSON.stringify(sourceHash)) throw new Error("Protected source Form changed since preflight; no write performed");
  const copy = await client.dataversePost(`/api/data/v9.2/systemforms(${SOURCE_FORM_ID})/Microsoft.Dynamics.CRM.CopySystemForm`, preflight.copyPayload, { headers: { "MSCRM.SolutionUniqueName": SOLUTION } });
  const newFormId = copy.body?.formid;
  if (!newFormId) throw new Error("CopySystemForm did not return a new Form ID");
  let created = await get(`/api/data/v9.2/systemforms(${newFormId})?$select=formid,name,type,objecttypecode,isdefault,formactivationstate,formxml,formjson,formpresentation`);
  if (created.formactivationstate !== 0) {
    await client.dataversePatch(`/api/data/v9.2/systemforms(${newFormId})`, { formactivationstate: 0 });
    created = await get(`/api/data/v9.2/systemforms(${newFormId})?$select=formid,name,type,objecttypecode,isdefault,formactivationstate,formxml,formjson,formpresentation`);
  }
  if (created.formactivationstate !== 0 || created.isdefault !== false) {
    await fs.writeFile(path.join(dir, "05_activation_stop.json"), JSON.stringify({ newFormId, created, rollbackDeleteEndpoint: `/api/data/v9.2/systemforms(${newFormId})`, reason: "New Form is not inactive and non-default; no FormXML PATCH, solution fallback, or publish performed" }, null, 2));
    throw new Error("New Form activation/default gate failed; no FormXML write performed");
  }
  let components = await get(`/api/data/v9.2/solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ${solution.solutionid} and componenttype eq 60`);
  let inSolution = (components.value || []).some((component) => String(component.objectid).toLowerCase() === String(newFormId).toLowerCase()); let solutionFallbackUsed = false;
  if (!inSolution) {
    await client.dataversePost("/api/data/v9.2/AddSolutionComponent", { ComponentId: newFormId, ComponentType: 60, SolutionUniqueName: SOLUTION, AddRequiredComponents: false, DoNotIncludeSubcomponents: true });
    solutionFallbackUsed = true; components = await get(`/api/data/v9.2/solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ${solution.solutionid} and componenttype eq 60`);
    inSolution = (components.value || []).some((component) => String(component.objectid).toLowerCase() === String(newFormId).toLowerCase());
  }
  if (!inSolution) throw new Error("New Form was created but could not be associated with target solution; no FormXML PATCH or publish performed");
  await client.dataversePatch(`/api/data/v9.2/systemforms(${newFormId})`, { formxml: output.formxml });
  const normal = await get(`/api/data/v9.2/systemforms(${newFormId})?$select=formid,name,type,objecttypecode,isdefault,formactivationstate,formxml,formjson,formpresentation`);
  const unpublished = await get(`/api/data/v9.2/systemforms(${newFormId})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,type,objecttypecode,isdefault,formactivationstate,formxml,formjson,formpresentation`);
  const unpublishedMultiple = await get(`/api/data/v9.2/systemforms/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple?$select=formid,name,formxml,formjson&$filter=formid eq ${newFormId}`);
  const originalAfter = await get(`/api/data/v9.2/systemforms(${SOURCE_FORM_ID})?$select=formid,name,formxml,formjson,formpresentation`);
  const unpublishedValidation = validateFormXml(unpublished.formxml || "", matrix, attributeNames);
  const formJsonSynced = formJsonReflectsTarget(unpublished.formjson) && formJsonReflectsTarget(normal.formjson);
  const outputResult = {
    newFormId, copyStatus: copy.status, inSolution, solutionFallbackUsed, target: { type: normal.type, objecttypecode: normal.objecttypecode, isdefault: normal.isdefault, formactivationstate: normal.formactivationstate },
    formXmlSha256: hash(unpublished.formxml || ""), normalFormXmlMatchesUnpublished: normal.formxml === unpublished.formxml, unpublishedMultipleFound: (unpublishedMultiple.value || []).some((item) => String(item.formid).toLowerCase() === String(newFormId).toLowerCase()),
    unpublishedValidation, formJson: { normalNonEmpty: Boolean(normal.formjson), unpublishedNonEmpty: Boolean(unpublished.formjson), reflectsTarget: formJsonSynced, status: formJsonSynced ? "synchronized" : "FormXML/FormJSON synchronization blocked" },
    originalUnchanged: JSON.stringify(formSnapshot(originalAfter)) === JSON.stringify(sourceHash), publishExecuted: false,
    rollback: { deleteEndpoint: `/api/data/v9.2/systemforms(${newFormId})`, deleteRequiresSeparateConfirmation: true }
  };
  await fs.writeFile(path.join(dir, "06_execution_result.json"), JSON.stringify(outputResult, null, 2));
  if (!formJsonSynced) throw new Error(`FormXML/FormJSON synchronization blocked for new Form ${newFormId}; no PublishXml executed`);
  if (!outputResult.originalUnchanged || !outputResult.unpublishedMultipleFound || normal.formactivationstate !== 0 || normal.isdefault !== false || normal.type !== 2 || normal.objecttypecode !== "opportunity") throw new Error("Post-write verification failed; no PublishXml executed");
  console.log(JSON.stringify(outputResult, null, 2));
}


runDataverseCli(import.meta.url, main);
