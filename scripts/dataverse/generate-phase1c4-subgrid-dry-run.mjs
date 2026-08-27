import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let URL;
let FORM_ID;
let VIEW_ID;
const TAB_NAME = "aigw_fr_tab_actuals";
const SECTION_NAME = "aigw_fr_actuals_information";
const CONTROL_ID = "aigw_actualmanagement_subgrid";
const CELL_ID = "{A1C40001-7C11-4F31-9D42-1C4A00000001}";
const UNIQUE_ID = "{A1C40002-7C11-4F31-9D42-1C4A00000002}";
const sha = (value) => crypto.createHash("sha256").update(value || "").digest("hex");
const stamp = () => new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");

function element(xml, tag, predicate) {
  const re = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "g");
  return [...xml.matchAll(re)].map((m) => m[0]).find(predicate) || "";
}
const attr = (xml, name) => xml.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || "";
const count = (xml, tag) => (xml.match(new RegExp(`<${tag}\\b`, "g")) || []).length;

export async function main() {
  URL = getDataverseUrl();
  FORM_ID = getRequiredEnvironmentId("D365_FULL_REPLICA_FORM_ID");
  VIEW_ID = getRequiredEnvironmentId("D365_ACTUAL_MANAGEMENT_VIEW_ID");
  const root = process.cwd();
  const docs = path.join(root, "docs", "d365");
  const localArtifacts = path.join(root, "local-artifacts", "d365", "docs", "d365");
  const backup = path.join(root, "backups", "dataverse", `phase1c4_subgrid_dry_run_${stamp()}`);
  const client = createDynamicsClient();
  if (client.config.dataverseUrl !== URL) throw new Error("Dataverse URL safety gate failed");
  if ((process.env.AI_PROVIDER || "demo") !== "demo") throw new Error("AI_PROVIDER safety gate failed");
  if ((process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("ALLOW_EXTERNAL_AI safety gate failed");
  const get = async (uri) => (await client.dataverseGet(uri)).body;
  const [form, relationship, view] = await Promise.all([
    get(`/api/data/v9.2/systemforms(${FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,formxml,formjson,formactivationstate,isdefault,versionnumber`),
    get("/api/data/v9.2/RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata?$select=MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute&$filter=SchemaName eq 'aigw_opportunity_actualmanagement'"),
    get(`/api/data/v9.2/savedqueries(${VIEW_ID})?$select=savedqueryid,name,returnedtypecode,fetchxml,layoutxml,statecode,statuscode`),
  ]);
  if (form.formactivationstate !== 0 || form.isdefault !== false) throw new Error("Target Form is not inactive/non-default");
  if (relationship.value?.length !== 1 || view.name !== "实绩管理 - AI Demo") throw new Error("Relationship or View gate failed");

  const tab = element(form.formxml, "tab", (x) => attr(x, "name") === TAB_NAME);
  const section = element(tab, "section", (x) => attr(x, "name") === SECTION_NAME);
  if (!tab || !section) throw new Error("Actuals target location not found");
  const existingRows = element(section, "rows", () => true);
  const emptyPlaceholder = /<cell\b[^>]*>\s*<labels>\s*<label\b[^>]*description=""[^>]*\/>\s*<\/labels>\s*<\/cell>/.test(section);
  const subgridDraft = `<row><cell id="${CELL_ID}" showlabel="true" locklevel="0" rowspan="10"><labels><label description="Actual Management" languagecode="1033" /><label description="实绩管理" languagecode="2052" /></labels><control id="${CONTROL_ID}" classid="{F9A8A302-114E-466A-B582-6771B2AE0D92}" uniqueid="${UNIQUE_ID}" indicationOfSubgrid="true"><parameters><TargetEntityType>aigw_actualmanagement</TargetEntityType><ViewId>{${VIEW_ID.toUpperCase()}}</ViewId><RelationshipName>aigw_opportunity_actualmanagement</RelationshipName><AutoExpand>Fixed</AutoExpand><EnableQuickFind>true</EnableQuickFind><EnableViewPicker>true</EnableViewPicker><EnableJumpBar>false</EnableJumpBar><RecordsPerPage>10</RecordsPerPage><MaxRowsBeforeScroll>10</MaxRowsBeforeScroll><HeaderColorCode>#F3F3F3</HeaderColorCode><IsUserView>false</IsUserView><ViewIds>{${VIEW_ID.toUpperCase()}}</ViewIds><ChartGridMode>Grid</ChartGridMode><VisualizationId /><IsUserChart>false</IsUserChart><EnableChartPicker>false</EnableChartPicker><EnableCommandBar>true</EnableCommandBar></parameters></control></cell></row>`;
  const draftSection = section.replace(existingRows, `<rows>${subgridDraft}</rows>`);
  const draftXml = form.formxml.replace(section, draftSection);
  const bound = [...form.formxml.matchAll(/<control\b[^>]*datafieldname="([^"]+)"/g)].map((m) => m[1]);
  const audit = {
    readOnly: true,
    environment: URL,
    form: { id: FORM_ID, name: form.name, inactive: true, nonDefault: true, hashes: { formxml: sha(form.formxml), formjson: sha(form.formjson) } },
    baseline: { tabs: count(form.formxml, "tab"), sections: count(form.formxml, "section"), controls: count(form.formxml, "control"), uniqueBoundFields: new Set(bound).size },
    location: { tabName: TAB_NAME, tabId: attr(tab, "id"), sectionName: SECTION_NAME, sectionId: attr(section, "id"), existingRows: count(section, "row"), emptyPlaceholder, insertion: "Replace the single empty placeholder row inside the existing section; preserve tab and section IDs." },
    conflicts: { controlIdExists: form.formxml.includes(`id="${CONTROL_ID}"`), cellIdExists: form.formxml.includes(`id="${CELL_ID}"`), uniqueIdExists: form.formxml.includes(`uniqueid="${UNIQUE_ID}"`), relationshipSubgridExists: form.formxml.includes("<RelationshipName>aigw_opportunity_actualmanagement</RelationshipName>") },
    target: { table: "aigw_actualmanagement", relationship: "aigw_opportunity_actualmanagement", lookup: "aigw_opportunityid", viewId: VIEW_ID, viewName: view.name, controlId: CONTROL_ID, cellId: CELL_ID, uniqueId: UNIQUE_ID, records: "Only related records", rows: 10, autoExpand: false, search: true, index: false, chart: false, viewSelector: true, commandBar: true, allowCreate: "Enabled when the command bar is visible and the user has Create privilege", allowDelete: "Not encoded as a FormXML flag; keep Delete privilege unavailable for the applicable security role or configure the command bar in a separately authorized phase" },
    draft: { formxmlHash: sha(draftXml), counts: { tabs: count(draftXml, "tab"), sections: count(draftXml, "section"), controls: count(draftXml, "control"), uniqueBoundFields: new Set([...draftXml.matchAll(/<control\b[^>]*datafieldname="([^"]+)"/g)].map((m) => m[1])).size }, formJsonModified: false },
    validations: { baselineMatchesExpected: count(form.formxml, "tab") === 5 && count(form.formxml, "section") === 19 && count(form.formxml, "control") === 113 && new Set(bound).size === 106, noExistingActualsSubgrid: !form.formxml.includes("<RelationshipName>aigw_opportunity_actualmanagement</RelationshipName>"), targetIdsUnique: !form.formxml.includes(CELL_ID) && !form.formxml.includes(UNIQUE_ID), nodesPreserved: count(draftXml, "tab") === count(form.formxml, "tab") && count(draftXml, "section") === count(form.formxml, "section"), onlyOneControlAdded: count(draftXml, "control") === count(form.formxml, "control") + 1, boundFieldsUnchanged: new Set(bound).size === new Set([...draftXml.matchAll(/<control\b[^>]*datafieldname="([^"]+)"/g)].map((m) => m[1])).size },
  };
  if (!Object.values(audit.validations).every(Boolean) || Object.values(audit.conflicts).some(Boolean)) throw new Error(`Dry-run validation failed: ${JSON.stringify({ conflicts: audit.conflicts, validations: audit.validations })}`);

  const manifest = {
    phase: "1C-4A",
    status: "dry-run-only",
    target: { environment: URL, solution: "CRMAIGatewayDemo", formId: FORM_ID, formName: form.name, tabName: TAB_NAME, tabId: audit.location.tabId, sectionName: SECTION_NAME, sectionId: audit.location.sectionId },
    preconditions: { expectedUnpublishedFormXmlSha256: audit.form.hashes.formxml, expectedUnpublishedFormJsonSha256: audit.form.hashes.formjson, formInactive: true, formNonDefault: true, relationshipMetadataId: relationship.value[0].MetadataId, savedQueryId: VIEW_ID, aiProvider: "demo", allowExternalAi: false },
    recommendedWriteMethod: "Power Apps Form Designer manual related-records Subgrid, Save only, no Publish",
    fallbackPatch: { authorized: false, endpoint: `/api/data/v9.2/systemforms(${FORM_ID})`, method: "PATCH", fields: ["formxml"], payloadSource: "local-artifacts/d365/docs/d365/phase1c4-full-replica-formxml-draft.xml", formJsonMustNotBeWritten: true },
    subgrid: audit.target,
    protected: ["original Opportunity Form", "original View", "App", "Business Rule", "BPF", "Opportunity data", "Actual Management data", "FormJSON"],
    publish: { requiredForSaveOnly: false, executed: false, futureGate: "Publish only the new Full Replica systemform component under a separate authorization; never broad PublishXml or opportunity entity publish." },
    rollback: { beforeBackup: "backups/dataverse/<this-run>/00_unpublished_form_before.xml", manualDesigner: "Remove only aigw_actualmanagement_subgrid before Publish", apiFallback: "Restore exact pre-1C-4 unpublished FormXML only under separate authorization" },
    phases: [
      { id: "1C-4A", action: "Generate diff and manifest", write: false },
      { id: "1C-4B", action: "Add related-records Subgrid to unpublished Full Replica", write: true, separateAuthorizationRequired: true },
      { id: "1C-4C", action: "Power Apps Designer Save only to synchronize platform representation", publish: false },
      { id: "1C-4D", action: "Read-only FormXML/FormJSON and relationship/view validation", write: false },
      { id: "1C-4E", action: "Separate targeted publish gate", separateAuthorizationRequired: true }
    ]
  };
  const md = `# Phase 1C-4 Actual Management Subgrid Dry-run\n\n## Current location\n\n- Tab: \`${TAB_NAME}\` / \`${audit.location.tabId}\`\n- Section: \`${SECTION_NAME}\` / \`${audit.location.sectionId}\`\n- Current content: one empty placeholder row; no real Subgrid.\n- Baseline: ${audit.baseline.tabs} tabs, ${audit.baseline.sections} sections, ${audit.baseline.controls} controls, ${audit.baseline.uniqueBoundFields} unique bound fields.\n\n## Target design\n\n- Related table: \`aigw_actualmanagement\`\n- Relationship: \`aigw_opportunity_actualmanagement\`\n- Default View: \`${VIEW_ID}\`\n- Records: only related records\n- Rows: 10; auto-expand off; search on; index off; chart off; view selector on; command bar on.\n- Create is available only when the user has Create privilege. Delete is not represented by a reliable FormXML switch and must remain controlled by table privilege or a separately authorized command-bar rule.\n\n## Recommended method\n\nUse Power Apps Form Designer to add the related-records Subgrid and execute **Save only**. This is safer than PATCHing FormXML because the Designer maintains FormXML/FormJSON together. Direct FormXML PATCH is retained only as a reviewed fallback draft and still requires a Designer Save-only synchronization gate. There is no supported public API contract for independently authoring FormJSON.\n\n## FormXML delta\n\nThe existing empty row in the existing Actuals section is replaced by the row in \`phase1c0-actual-management-subgrid-formxml-draft.xml\`. No tab, section, bound field, or existing control is removed.\n\n## Publish impact\n\nSave-only does not publish. A later publish must be separately authorized and targeted to the new Full Replica form component; publishing the whole opportunity entity is neither required nor authorized.\n`;
  await fs.mkdir(backup, { recursive: true });
  await fs.mkdir(docs, { recursive: true });
  await fs.mkdir(localArtifacts, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(backup, "00_unpublished_form_before.xml"), form.formxml),
    fs.writeFile(path.join(backup, "01_unpublished_formjson_before.json"), form.formjson),
    fs.writeFile(path.join(backup, "02_readonly_audit.json"), JSON.stringify(audit, null, 2)),
    fs.writeFile(path.join(localArtifacts, "phase1c0-actual-management-subgrid-formxml-draft.xml"), `${subgridDraft}\n`),
    fs.writeFile(path.join(localArtifacts, "phase1c4-full-replica-formxml-draft.xml"), draftXml),
    fs.writeFile(path.join(localArtifacts, "phase1c4-subgrid-formxml-diff.md"), md),
    fs.writeFile(path.join(docs, "phase1c-4-subgrid-manifest.json"), JSON.stringify(manifest, null, 2)),
  ]);
  console.log(JSON.stringify({ backup, audit, files: ["local-artifacts/d365/docs/d365/phase1c0-actual-management-subgrid-formxml-draft.xml", "local-artifacts/d365/docs/d365/phase1c4-full-replica-formxml-draft.xml", "local-artifacts/d365/docs/d365/phase1c4-subgrid-formxml-diff.md", "docs/d365/phase1c-4-subgrid-manifest.json"] }, null, 2));
}


runDataverseCli(import.meta.url, main);
