import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION = "CRMAIGatewayDemo";
const FIELD = "aigw_organizationgroup_choice";
let ORIGINAL_FORM_ID;
let FULL_REPLICA_FORM_ID;
const TEMPORARY_2052_LABEL = "组织团体（AI Demo Choice）";
const RESTORE_2052_LABEL = "组织团体";
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

function labels(metadata) {
  return Object.fromEntries((metadata.DisplayName?.LocalizedLabels || []).map((item) => [item.LanguageCode, item.Label]));
}
function formControlReferences(xml, field) {
  const refs = [];
  for (const match of String(xml || "").matchAll(/<cell\b[^>]*>([\s\S]*?)<\/cell>/g)) {
    const cell = match[1];
    if (!new RegExp(`<control\\b[^>]*\\bdatafieldname="${field}"`).test(cell)) continue;
    refs.push({ labels: Object.fromEntries([...cell.matchAll(/<label\b[^>]*\bdescription="([^"]*)"\s+languagecode="(\d+)"[^>]*\/>/g)].map((label) => [label[2], label[1]])), explicitLabels: /<label\b/.test(cell) });
  }
  return refs;
}

export async function main() {
  EXPECTED_URL = getDataverseUrl();
  ORIGINAL_FORM_ID = getRequiredEnvironmentId("D365_ORIGINAL_FORM_ID");
  FULL_REPLICA_FORM_ID = getRequiredEnvironmentId("D365_FULL_REPLICA_FORM_ID");
  const root = process.cwd();
  const client = createDynamicsClient();
  const get = async (url) => (await client.dataverseGet(url)).body;
  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: unexpected Dataverse URL");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: AI provider must remain demo and external AI disabled");

  const [solutionResponse, target, duplicate, formsResponse, viewsResponse] = await Promise.all([
    get(`/api/data/v9.2/solutions?$select=solutionid,friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='${FIELD}')?$select=LogicalName,SchemaName,DisplayName,AttributeType,RequiredLevel,IsManaged,IsCustomAttribute`),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='aigw_organizationgroup')?$select=LogicalName,SchemaName,DisplayName,AttributeType,RequiredLevel,IsManaged,IsCustomAttribute"),
    get("/api/data/v9.2/systemforms?$select=formid,name,type,objecttypecode,formxml,isdefault,formactivationstate&$filter=objecttypecode eq 'opportunity'"),
    get("/api/data/v9.2/savedqueries?$select=savedqueryid,name,returnedtypecode,fetchxml,layoutxml,layoutjson&$filter=returnedtypecode eq 'opportunity'"),
  ]);
  const solution = solutionResponse.value?.[0];
  if (!solution || solution.friendlyname !== "CRM AI Gateway Demo" || solution.ismanaged !== false) throw new Error("Safety gate failed: expected unmanaged CRMAIGatewayDemo solution");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Safety gate failed: publisher prefix must be aigw");
  const forms = (formsResponse.value || []).map((form) => ({ formId: form.formid, name: form.name, type: form.type, active: form.formactivationstate, default: form.isdefault, references: formControlReferences(form.formxml, FIELD) })).filter((form) => form.references.length);
  const views = (viewsResponse.value || []).filter((view) => [view.fetchxml, view.layoutxml, view.layoutjson].some((text) => String(text || "").includes(FIELD))).map((view) => ({ viewId: view.savedqueryid, name: view.name, fetchxml: String(view.fetchxml || "").includes(FIELD), layoutxml: String(view.layoutxml || "").includes(FIELD), layoutjson: String(view.layoutjson || "").includes(FIELD) }));
  const manifest = {
    dryRun: true,
    safety: { dataverseUrl: EXPECTED_URL, solution: SOLUTION, publisherPrefix: publisher.customizationprefix, aiProvider: "demo", allowExternalAi: false },
    target: { logicalName: target.LogicalName, schemaName: target.SchemaName, attributeType: target.AttributeType, currentLabels: labels(target), temporary2052Label: TEMPORARY_2052_LABEL, restore2052Label: RESTORE_2052_LABEL, columnRequiredLevel: target.RequiredLevel?.Value, isManaged: target.IsManaged, isCustomAttribute: target.IsCustomAttribute },
    duplicate: { logicalName: duplicate.LogicalName, schemaName: duplicate.SchemaName, labels: labels(duplicate), type: duplicate.AttributeType, untouched: true },
    impactAudit: { formReferences: forms, viewReferences: views, fullReplicaControlLabels: forms.find((form) => form.formId === FULL_REPLICA_FORM_ID)?.references || [], originalFormReferences: forms.find((form) => form.formId === ORIGINAL_FORM_ID)?.references || [] },
    minimumWritePlan: {
      operation: "UpdateAttribute metadata only",
      targetEntity: "opportunity",
      targetAttribute: FIELD,
      allowedChange: { displayName: { languageCode: 2052, before: RESTORE_2052_LABEL, after: TEMPORARY_2052_LABEL }, mergeLabels: true },
      explicitlyExcluded: ["logicalName", "schemaName", "option values", "RequiredLevel", "FormXML", "FormJSON", "views", "records"],
      solutionUniqueName: SOLUTION,
      publish: { requiredForModelDrivenClientVisibility: true, allowedThisRound: false, risk: "Publishing opportunity can publish other pending opportunity customizations; do not rely on an unpublished metadata label being visible in the legacy Business Rule Designer." },
      rollback: { operation: "UpdateAttribute metadata only", displayName: { languageCode: 2052, before: TEMPORARY_2052_LABEL, after: RESTORE_2052_LABEL }, mergeLabels: true, requiresSeparateAuthorization: true },
    },
    recommendation: "Do not use this temporary-label approach while Opportunity has unpublished Form/View work. It changes column metadata visible beyond the Full Replica Form and needs a targeted Opportunity publish for reliable Designer/client visibility. Keep the Draft rule inactive; use a separately authorized metadata/publish window only if this workaround remains necessary.",
  };
  const docs = path.join(root, "docs", "d365");
  const backup = path.join(root, "backups", "dataverse", `phase1b_m2b_temporary_display_name_${stamp()}`);
  await fs.mkdir(docs, { recursive: true }); await fs.mkdir(backup, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(docs, "phase1b-m2b-temporary-display-name-dry-run.json"), JSON.stringify(manifest, null, 2)),
    fs.writeFile(path.join(backup, "01_temporary_display_name_manifest.json"), JSON.stringify(manifest, null, 2)),
  ]);
  console.log(JSON.stringify({ dryRun: true, target: manifest.target, formReferenceCount: forms.length, viewReferenceCount: views.length, fullReplicaControlLabels: manifest.impactAudit.fullReplicaControlLabels, publishRequiredForReliableVisibility: manifest.minimumWritePlan.publish.requiredForModelDrivenClientVisibility, recommendation: manifest.recommendation, report: "docs/d365/phase1b-m2b-temporary-display-name-dry-run.json", backup: path.relative(root, backup) }, null, 2));
}


runDataverseCli(import.meta.url, main);
