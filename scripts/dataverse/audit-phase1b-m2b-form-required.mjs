import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION = "CRMAIGatewayDemo";
let FORM_ID;
let ORIGINAL_FORM_ID;
const REQUIRED_FIELDS = [
  "name", "parentaccountid", "aigw_organizationgroup_choice", "aigw_bookingdepartment_choice", "aigw_opportunitytype", "aigw_casestage", "aigw_salesdepartment_choice", "aigw_opportunitydetailtype", "aigw_startdate", "aigw_opportunityplace", "description", "aigw_opportunitylist_bool", "transactioncurrencyid",
  "aigw_budgetstatus", "aigw_researchbackground_choice", "aigw_decider_choice", "aigw_customerneed_choice", "aigw_proposalcontent_choice",
  "aigw_globalinitiative", "aigw_alpscooperation", "aigw_goodshandled", "aigw_projectsize", "aigw_projectsizeunit", "aigw_warehousescale", "aigw_transportmode", "aigw_spotcontinuous", "aigw_sealandpol", "aigw_sealandpod", "aigw_airpol", "aigw_airpod",
  "estimatedclosedate", "aigw_winprobabilityrank",
];
const EXCLUDED_FIELDS = ["actualvalue", "statuscode", "parentcontactid", "aigw_customercontact2", "aigw_customercontact3", "aigw_customercontact4", "aigw_customercontact5", "aigw_wonreason_choice", "aigw_lostreason_choice", "actualclosedate"];
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const label = (metadata) => metadata?.DisplayName?.UserLocalizedLabel?.Label || metadata?.DisplayName?.LocalizedLabels?.[0]?.Label || "";
const q = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = (rows, keys) => [keys.join(","), ...rows.map((row) => keys.map((key) => q(row[key])).join(","))].join("\n") + "\n";
const formFields = (xml) => new Set([...String(xml || "").matchAll(/<control\b[^>]*\bdatafieldname="([^"]+)"/g)].map((match) => match[1]));
const formRequiredTokens = (xml) => [...String(xml || "").matchAll(/\b(?:required|requiredlevel|requirementlevel|isrequired)="[^"]*"/gi)].map((match) => match[0]);
const hasValue = (row, field, metadata) => {
  const keys = [field];
  if (["Lookup", "Customer", "Owner"].includes(metadata?.AttributeType)) keys.push(`_${field}_value`);
  return keys.some((key) => Object.hasOwn(row, key) && row[key] !== null);
};

export async function main() {
  EXPECTED_URL = getDataverseUrl();
  FORM_ID = getRequiredEnvironmentId("D365_FULL_REPLICA_FORM_ID");
  ORIGINAL_FORM_ID = getRequiredEnvironmentId("D365_ORIGINAL_FORM_ID");
  const root = process.cwd(); const client = createDynamicsClient(); const get = async (url) => (await client.dataverseGet(url)).body;
  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: unexpected Dataverse URL");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: AI provider must remain demo and external AI disabled");
  const [solutionResponse, form, original, attrsResponse, rulesResponse] = await Promise.all([
    get(`/api/data/v9.2/solutions?$select=friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
    get(`/api/data/v9.2/systemforms(${FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,isdefault,formactivationstate,formxml,formjson,versionnumber`),
    get(`/api/data/v9.2/systemforms(${ORIGINAL_FORM_ID})?$select=formid,formxml,formjson,versionnumber`),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=LogicalName,DisplayName,AttributeType,RequiredLevel,SourceType,IsValidForCreate,IsValidForUpdate"),
    get("/api/data/v9.2/workflows?$select=workflowid,name,category,statecode,statuscode,ismanaged,clientdata&$filter=primaryentity eq 'opportunity' and category eq 2"),
  ]);
  const solution = solutionResponse.value?.[0];
  if (!solution || solution.friendlyname !== "CRM AI Gateway Demo" || solution.ismanaged !== false) throw new Error("Safety gate failed: target solution is not unmanaged CRMAIGatewayDemo");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Safety gate failed: publisher prefix is not aigw");
  if (form.isdefault !== false || form.formactivationstate !== 0) throw new Error("Safety gate failed: Full Replica Form must remain inactive and non-default");
  const metadata = new Map((attrsResponse.value || []).map((item) => [item.LogicalName, item]));
  const formBound = formFields(form.formxml);
  const ruleRefs = new Set((rulesResponse.value || []).flatMap((rule) => [...String(rule.clientdata || "").matchAll(/attributes\.get\(['"]([^'"]+)['"]\)/g)].map((match) => match[1])));
  const fetch = `<fetch><entity name="opportunity"><attribute name="opportunityid" />${REQUIRED_FIELDS.map((field) => `<attribute name="${field}" />`).join("")}<filter><condition attribute="name" operator="like" value="[[]AI-DEMO]%" /></filter></entity></fetch>`;
  const demoRows = (await get(`/api/data/v9.2/opportunities?fetchXml=${encodeURIComponent(fetch)}`)).value || [];
  if (demoRows.length !== 100) throw new Error(`Expected 100 [AI-DEMO] rows, found ${demoRows.length}`);
  const rows = REQUIRED_FIELDS.map((field) => {
    const item = metadata.get(field); if (!item) throw new Error(`Required-form target field is missing: ${field}`);
    const nullCount = demoRows.filter((row) => !hasValue(row, field, item)).length;
    const columnRequiredLevel = item.RequiredLevel?.Value || "None";
    const columnAlreadyRequired = ["ApplicationRequired", "SystemRequired"].includes(columnRequiredLevel);
    return { logicalName: field, displayLabel: label(item), targetType: item.AttributeType, columnRequiredLevel, formRequiredState: "notExpressedInUnpublishedFormXml", formVisible: formBound.has(field), businessRuleControlled: ruleRefs.has(field), currentDemoNullCount: nullCount, alreadyCompliant: columnAlreadyRequired, recommendedAction: columnAlreadyRequired ? "retain_global_requirement" : "specific_form_business_rule_set_required", risk: nullCount ? "data_not_ready" : "ready_for_form_specific_requirement" };
  });
  const excluded = EXCLUDED_FIELDS.map((field) => ({ logicalName: field, columnRequiredLevel: metadata.get(field)?.RequiredLevel?.Value || "missing", formVisible: formBound.has(field), action: "explicitly_excluded_from_M2B" }));
  if (rows.some((row) => !row.formVisible || row.currentDemoNullCount !== 0)) throw new Error("At least one target field is missing from Full Replica Form or has demo nulls; no manifest generated.");
  const buildSheet = {
    implementation: "Specific Form Business Rule",
    name: "AI Gateway Full Replica - Required Fields",
    scope: { type: "Specific form", formId: FORM_ID, formName: "AI Gateway Opportunity Demo - Full Replica" },
    condition: { field: "name", operator: "Contains Data", reason: "name is already platform-required; this avoids a global column requirement while applying once a record is being edited on this specific form." },
    actions: rows.filter((row) => !row.alreadyCompliant).map((row) => ({ action: "Set Business Required", logicalName: row.logicalName, displayLabel: row.displayLabel })),
    excluded: EXCLUDED_FIELDS,
    createState: "Draft/inactive first; do not activate or publish in the same authorization.",
  };
  const manifest = { dryRun: true, target: { dataverseUrl: EXPECTED_URL, solution: SOLUTION, entity: "opportunity", formId: FORM_ID }, recommendedImplementation: { optionA: "Rejected: current unpublished FormXML has no stable form-level requirement representation and direct XML patch risks FormJSON/Designer normalization.", optionB: "Recommended: one Specific Form Business Rule, scoped to the Full Replica Form only.", optionC: "Not recommended: the designer's column requirement setting can alter global RequiredLevel and would require a separate metadata audit." }, formXmlDiff: "None. M2-B must not PATCH FormXML or FormJSON.", formJsonImpact: "None from the recommended Business Rule approach.", designerSave: "No Form Designer Save is required for the existing Form. A separate Business Rule designer save creates its own process metadata.", fields: rows, exclusions: excluded, buildSheet, writeSequence: ["M2B-1: create Specific Form Business Rule as draft/inactive after separate authorization", "M2B-2: read-only validate workflow scope/action fields", "M2B-3: separately authorize activation/publish only after validation"], publish: "No publish in this dry-run. Activating a Business Rule is a separate future stage; do not use broad PublishXml.", rollback: "Deactivate or delete only the newly created Specific Form Business Rule after separate authorization. Do not change column RequiredLevel or other Forms." };
  const dir = path.join(root, "backups", "dataverse", `phase1b_m2b_form_required_${stamp()}`); await fs.mkdir(dir, { recursive: true }); await fs.mkdir(path.join(root, "docs", "d365"), { recursive: true });
  const keys = ["logicalName", "displayLabel", "targetType", "columnRequiredLevel", "formRequiredState", "formVisible", "businessRuleControlled", "currentDemoNullCount", "alreadyCompliant", "recommendedAction", "risk"];
  await Promise.all([
    fs.writeFile(path.join(root, "docs", "d365", "phase1b-m2b-form-required-dry-run.json"), JSON.stringify(manifest, null, 2)),
    fs.writeFile(path.join(root, "docs", "d365", "phase1b-m2b-form-required-fields.csv"), csv(rows, keys)),
    fs.writeFile(path.join(root, "docs", "d365", "phase1b-m2b-business-rule-build-sheet.md"), `# M2-B Specific Form Business Rule Build Sheet\n\n- Name: \`${buildSheet.name}\`\n- Scope: Specific form -> \`${buildSheet.scope.formName}\`\n- Form ID: \`${FORM_ID}\`\n- Condition: \`${buildSheet.condition.field}\` ${buildSheet.condition.operator}\n- Create as: Draft/inactive only\n\n## Actions\n\n${buildSheet.actions.map((item, index) => `${index + 1}. Set Business Required: \`${item.logicalName}\` (${item.displayLabel})`).join("\n")}\n\n## Explicit exclusions\n\n${EXCLUDED_FIELDS.map((field) => `- \`${field}\``).join("\n")}\n`),
    fs.writeFile(path.join(dir, "00_full_replica_unpublished_formxml.xml"), form.formxml),
    fs.writeFile(path.join(dir, "01_full_replica_unpublished_formjson.json"), form.formjson),
    fs.writeFile(path.join(dir, "02_m2b_dry_run_manifest.json"), JSON.stringify(manifest, null, 2)),
  ]);
  console.log(JSON.stringify({ dryRun: true, targetFields: rows.length, alreadyCompliant: rows.filter((row) => row.alreadyCompliant).map((row) => row.logicalName), businessRuleActions: buildSheet.actions.length, allDemoFieldsNonNull: rows.every((row) => row.currentDemoNullCount === 0), formXmlRequiredTokens: formRequiredTokens(form.formxml), existingBusinessRules: (rulesResponse.value || []).map((rule) => rule.name), docs: ["docs/d365/phase1b-m2b-form-required-dry-run.json", "docs/d365/phase1b-m2b-form-required-fields.csv", "docs/d365/phase1b-m2b-business-rule-build-sheet.md"], backup: path.relative(root, dir) }, null, 2));
}


runDataverseCli(import.meta.url, main);
