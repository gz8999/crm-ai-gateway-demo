import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION = "CRMAIGatewayDemo";
let FORM_ID;
const RULE_NAME = "AI Gateway Full Replica - Required - Opportunity";
const TARGET_FIELDS = [
  "parentaccountid", "aigw_organizationgroup_choice", "aigw_bookingdepartment_choice", "aigw_opportunitytype", "aigw_casestage", "aigw_salesdepartment_choice", "aigw_opportunitydetailtype", "aigw_startdate", "aigw_opportunityplace", "description", "aigw_opportunitylist_bool",
  "aigw_budgetstatus", "aigw_researchbackground_choice", "aigw_decider_choice", "aigw_customerneed_choice", "aigw_proposalcontent_choice",
  "aigw_globalinitiative", "aigw_alpscooperation", "aigw_goodshandled", "aigw_projectsize", "aigw_projectsizeunit", "aigw_warehousescale", "aigw_transportmode", "aigw_spotcontinuous", "aigw_sealandpol", "aigw_sealandpod", "aigw_airpol", "aigw_airpod", "estimatedclosedate", "aigw_winprobabilityrank",
];
const label = (metadata, lcid) => metadata.DisplayName?.LocalizedLabels?.find((item) => item.LanguageCode === lcid)?.Label || "";
const q = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = (rows, keys) => `${keys.join(",")}\n${rows.map((row) => keys.map((key) => q(Array.isArray(row[key]) ? row[key].join(" | ") : row[key])).join(",")).join("\n")}\n`;
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const bindings = (clientdata) => [...new Set([...String(clientdata || "").matchAll(/attributes\.get\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]))].sort();
function formLabels(xml) {
  const result = new Map();
  for (const cell of String(xml || "").matchAll(/<cell\b[^>]*>([\s\S]*?)<\/cell>/g)) {
    const field = /<control\b[^>]*\bdatafieldname="([^"]+)"/.exec(cell[1])?.[1];
    if (!field) continue;
    result.set(field, Object.fromEntries([...cell[1].matchAll(/<label\b[^>]*\bdescription="([^"]*)"\s+languagecode="(\d+)"[^>]*\/>/g)].map((match) => [match[2], match[1]])));
  }
  return result;
}

export async function main() {
  EXPECTED_URL = getDataverseUrl();
  FORM_ID = getRequiredEnvironmentId("D365_FULL_REPLICA_FORM_ID");
  const root = process.cwd(); const client = createDynamicsClient(); const get = async (url) => (await client.dataverseGet(url)).body;
  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: unexpected Dataverse URL");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: AI provider must remain demo and external AI disabled");
  const [solutions, form, attrs, rules] = await Promise.all([
    get(`/api/data/v9.2/solutions?$select=friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
    get(`/api/data/v9.2/systemforms(${FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,isdefault,formactivationstate,formxml`),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=LogicalName,SchemaName,DisplayName,AttributeType,IsManaged,IsCustomAttribute"),
    get("/api/data/v9.2/workflows?$select=workflowid,name,statecode,statuscode,ismanaged,clientdata,processtriggerformid,processtriggerscope&$filter=primaryentity eq 'opportunity' and category eq 2"),
  ]);
  const solution = solutions.value?.[0];
  if (!solution || solution.friendlyname !== "CRM AI Gateway Demo" || solution.ismanaged !== false) throw new Error("Safety gate failed: expected unmanaged CRMAIGatewayDemo solution");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`);
  if (publisher.customizationprefix !== "aigw" || form.isdefault !== false || form.formactivationstate !== 0) throw new Error("Safety gate failed: publisher/form state mismatch");
  const all = attrs.value || []; const byLogical = new Map(all.map((item) => [item.LogicalName, item])); const labels2052 = new Map();
  for (const attr of all) { const text = label(attr, 2052).trim(); if (text) labels2052.set(text, [...(labels2052.get(text) || []), attr]); }
  const controls = formLabels(form.formxml);
  const rows = TARGET_FIELDS.map((logicalName) => {
    const target = byLogical.get(logicalName); if (!target) throw new Error(`Missing target metadata: ${logicalName}`);
    const displayName2052 = label(target, 2052); const conflicts = (labels2052.get(displayName2052) || []).filter((item) => item.LogicalName !== logicalName);
    const formLabel2052 = controls.get(logicalName)?.["2052"] || ""; const formLabel1033 = controls.get(logicalName)?.["1033"] || "";
    const differentLabel = Boolean((formLabel2052 || formLabel1033) && (formLabel2052 || formLabel1033) !== displayName2052);
    const classification = conflicts.length ? "Ambiguous" : differentLabel ? "DifferentLabel" : "Safe";
    return { logicalName, displayName2052, attributeType: target.AttributeType, isManaged: Boolean(target.IsManaged), isCustomAttribute: Boolean(target.IsCustomAttribute), formLabel1033, formLabel2052, sameDisplayNameLogicalNames: conflicts.map((item) => item.LogicalName).sort(), sameDisplayNameFields: conflicts.map((item) => ({ logicalName: item.LogicalName, attributeType: item.AttributeType, isManaged: Boolean(item.IsManaged), isCustomAttribute: Boolean(item.IsCustomAttribute) })), designerUnambiguous: !conflicts.length, classification, manualGuidance: conflicts.length ? "Do not select manually in the legacy Designer." : differentLabel ? `Designer shows metadata label '${displayName2052}', while Full Replica shows '${formLabel2052 || formLabel1033}'. Select the metadata label.` : `Select '${displayName2052}'.` };
  });
  const pilotRules = (rules.value || []).filter((rule) => rule.name === RULE_NAME);
  const pilot = pilotRules.length === 1 ? pilotRules[0] : null;
  const currentBindings = bindings(pilot?.clientdata);
  const report = { readOnly: true, generatedAt: new Date().toISOString(), safety: { dataverseUrl: EXPECTED_URL, solution: SOLUTION, publisherPrefix: publisher.customizationprefix, aiProvider: "demo", allowExternalAi: false, formId: FORM_ID }, fields: rows, summary: { total: rows.length, safe: rows.filter((row) => row.classification === "Safe").length, ambiguous: rows.filter((row) => row.classification === "Ambiguous").length, differentLabel: rows.filter((row) => row.classification === "DifferentLabel").length, safeManualFields: rows.filter((row) => row.classification !== "Ambiguous").map((row) => row.logicalName), deferredFields: rows.filter((row) => row.classification === "Ambiguous").map((row) => row.logicalName) }, currentPilotRule: pilot ? { workflowId: pilot.workflowid, name: pilot.name, draftInactive: pilot.statecode === 0 && pilot.statuscode === 1, formScoped: pilot.processtriggerformid === FORM_ID && pilot.processtriggerscope === 1, bindings: currentBindings, expectedOnlyParentAccount: JSON.stringify(currentBindings) === JSON.stringify(["name", "parentaccountid"]), unexpectedActionBindings: currentBindings.filter((name) => !["name", "parentaccountid"].includes(name)) } : { found: false }, recommendation: "Only fields classified Safe or DifferentLabel can be selected with reasonable confidence in the legacy Designer. Do not add Ambiguous fields until a separately authorized metadata-label/publish strategy or a safer Designer path is approved." };
  const docs = path.join(root, "docs", "d365"); const backup = path.join(root, "backups", "dataverse", `phase1b_m2b_duplicate_label_audit_${stamp()}`); await fs.mkdir(docs, { recursive: true }); await fs.mkdir(backup, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(docs, "phase1b-m2b-duplicate-label-audit.json"), JSON.stringify(report, null, 2)),
    fs.writeFile(path.join(docs, "phase1b-m2b-duplicate-label-audit.csv"), csv(rows, ["logicalName", "displayName2052", "attributeType", "isManaged", "isCustomAttribute", "formLabel1033", "formLabel2052", "sameDisplayNameLogicalNames", "designerUnambiguous", "classification", "manualGuidance"])),
    fs.writeFile(path.join(backup, "01_duplicate_label_audit.json"), JSON.stringify(report, null, 2)),
  ]);
  console.log(JSON.stringify({ readOnly: true, summary: report.summary, currentPilotRule: report.currentPilotRule, reportFiles: ["docs/d365/phase1b-m2b-duplicate-label-audit.json", "docs/d365/phase1b-m2b-duplicate-label-audit.csv"], backup: path.relative(root, backup) }, null, 2));
}

runDataverseCli(import.meta.url, main);
