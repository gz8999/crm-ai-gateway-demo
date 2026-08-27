import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let URL;
const SOLUTION = "CRMAIGatewayDemo";
let FORM_ID;
let ORIGINAL_FORM_ID;
const OLD_FIELD = "aigw_yearrevenueactualcny";
const NEW_FIELD = "aigw_yearrevenueactual_base";
const NEW_CONTROL_ID = "aigw_fullreplica_aigw_yearrevenueactual_base_f18d5047";
const TARGET_LABEL = "年度收入实绩总金额（CNY）";
const sha = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");
const attr = (tag, key) => new RegExp(`\\b${key}="([^"]*)"`).exec(tag)?.[1] || "";
function elements(xml, tag) { const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "g"); let match; let depth = 0; let start = -1; const result = []; while ((match = re.exec(xml))) { if (match[0].startsWith("</")) { if (--depth === 0 && start >= 0) result.push(xml.slice(start, re.lastIndex)); } else if (depth++ === 0) start = match.index; } return result; }
const start = (xml) => /^<[^>]+>/.exec(xml)?.[0] || "";
const count = (text, token) => text.split(token).length - 1;

export async function main() {
  URL = getDataverseUrl();
  FORM_ID = getRequiredEnvironmentId("D365_FULL_REPLICA_FORM_ID");
  ORIGINAL_FORM_ID = getRequiredEnvironmentId("D365_ORIGINAL_FORM_ID");
  const root = process.cwd();
  const client = createDynamicsClient();
  if (client.config.dataverseUrl !== URL) throw new Error("Dataverse URL safety gate failed");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("AI safety gate failed");
  const get = async (uri) => (await client.dataverseGet(uri)).body;
  const [solutions, form, originalForm, baseMetadata, oldMetadata, workflows] = await Promise.all([
    get(`/api/data/v9.2/solutions?$select=solutionid,uniquename,friendlyname,ismanaged&$filter=uniquename eq '${SOLUTION}'`),
    get(`/api/data/v9.2/systemforms(${FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,formxml,formjson,formactivationstate,isdefault,componentstate,versionnumber`),
    get(`/api/data/v9.2/systemforms(${ORIGINAL_FORM_ID})?$select=formid,name,formxml,formjson,formpresentation,versionnumber`),
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='${NEW_FIELD}')/Microsoft.Dynamics.CRM.MoneyAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,AttributeType,SourceType,IsValidForCreate,IsValidForUpdate,IsValidForRead,IsValidForForm,IsManaged,CalculationOf,DisplayName`),
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='${OLD_FIELD}')/Microsoft.Dynamics.CRM.MoneyAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,AttributeType,SourceType,IsValidForCreate,IsValidForUpdate,IsValidForRead,IsValidForForm,IsManaged,CalculationOf,DisplayName`),
    get("/api/data/v9.2/workflows?$select=workflowid,name,category,statecode,statuscode,clientdata,xaml&$filter=primaryentity eq 'opportunity'"),
  ]);
  const solution = solutions.value?.[0];
  if (!solution || solution.friendlyname !== "CRM AI Gateway Demo" || solution.ismanaged !== false) throw new Error("Solution gate failed");
  if (form.formactivationstate !== 0 || form.isdefault !== false) throw new Error("Form state gate failed");
  const tabs = elements(elements(form.formxml, "tabs")[0] || "", "tab");
  let located;
  for (const tab of tabs) for (const section of elements(tab, "section")) for (const cell of elements(section, "cell")) {
    const control = (cell.match(new RegExp(`<control\\b[^>]*datafieldname="${OLD_FIELD}"[^>]*>`)) || [])[0];
    if (control) located = { tab, section, cell, control };
  }
  if (!located) throw new Error("Current CNY control was not found");
  const oldControlId = attr(located.control, "id");
  const label = [...located.cell.matchAll(/<label\b[^>]*description="([^"]*)"[^>]*languagecode="(1033|2052)"[^>]*\/>/g)].map((match) => ({ description: match[1], languageCode: Number(match[2]) }));
  const controlReplacement = located.control
    .replace(`id="${oldControlId}"`, `id="${NEW_CONTROL_ID}"`)
    .replace(`datafieldname="${OLD_FIELD}"`, `datafieldname="${NEW_FIELD}"`)
    .replace(/disabled="(?:true|false)"/, 'disabled="true"');
  const draftCell = located.cell.replace(located.control, controlReplacement).replaceAll('description="年度收入实绩总金额(CNY)"', `description="${TARGET_LABEL}"`);
  const draftXml = form.formxml.replace(located.cell, draftCell);
  const boundFields = (xml) => [...new Set([...xml.matchAll(/<control\b[^>]*datafieldname="([^"]+)"/g)].map((match) => match[1]))];
  const dependencyTokens = [OLD_FIELD, oldControlId];
  const workflowReferences = (workflows.value || []).filter((workflow) => dependencyTokens.some((token) => `${workflow.clientdata || ""}${workflow.xaml || ""}`.includes(token))).map((workflow) => ({ workflowId: workflow.workflowid, name: workflow.name, category: workflow.category, statecode: workflow.statecode, statuscode: workflow.statuscode, references: dependencyTokens.filter((token) => `${workflow.clientdata || ""}${workflow.xaml || ""}`.includes(token)) }));
  const formEventArea = `${elements(form.formxml, "events").join("")}${elements(form.formxml, "formLibraries").join("")}`;
  const audit = {
    phase: "1C-5R0-F1",
    dryRun: true,
    writesExecuted: false,
    environment: URL,
    solution: SOLUTION,
    current: {
      formId: FORM_ID,
      formName: form.name,
      inactive: form.formactivationstate === 0,
      nonDefault: form.isdefault === false,
      componentState: form.componentstate,
      formXmlSha256: sha(form.formxml),
      formJsonSha256: sha(form.formjson),
      location: { tabName: attr(start(located.tab), "name"), tabId: attr(start(located.tab), "id"), sectionName: attr(start(located.section), "name"), sectionId: attr(start(located.section), "id"), cellId: attr(start(located.cell), "id"), controlId: oldControlId, controlTag: located.control, labels: label, disabled: attr(located.control, "disabled") === "true" },
      oldFieldControlCount: count(form.formxml, `datafieldname="${OLD_FIELD}"`),
      baseFieldControlCount: count(form.formxml, `datafieldname="${NEW_FIELD}"`),
      uniqueBoundFields: boundFields(form.formxml).length,
    },
    metadata: { base: baseMetadata, deprecatedIndependentCny: oldMetadata },
    dependencies: { workflowReferences, formEventOrLibraryReferences: dependencyTokens.filter((token) => formEventArea.includes(token)), formJsonOldFieldReferences: count(form.formjson, OLD_FIELD), formJsonOldControlIdReferences: count(form.formjson, oldControlId), conclusion: workflowReferences.length || dependencyTokens.some((token) => formEventArea.includes(token)) ? "Review required" : "No Business Rule/workflow clientdata, Form event, or library dependency on the old field/control was found. FormJSON contains the expected current control representation only." },
    draft: { formXmlSha256: sha(draftXml), newControlId: NEW_CONTROL_ID, oldControlIdRetained: false, sameCellId: true, semanticLabelPreserved: true, labelTextNormalizedTo: TARGET_LABEL, disabled: true, oldFieldControlCount: count(draftXml, `datafieldname="${OLD_FIELD}"`), baseFieldControlCount: count(draftXml, `datafieldname="${NEW_FIELD}"`), uniqueBoundFields: boundFields(draftXml).length, controlCount: (draftXml.match(/<control\b/g) || []).length, formJsonModified: false },
    protectedOriginal: { formId: ORIGINAL_FORM_ID, formXmlSha256: sha(originalForm.formxml), formJsonSha256: sha(originalForm.formjson), formPresentationSha256: sha(originalForm.formpresentation) },
  };
  const valid = audit.current.location.tabName === "aigw_fr_tab_summary" && audit.current.location.sectionName === "aigw_fr_summary_actuals" && audit.current.oldFieldControlCount === 1 && audit.current.baseFieldControlCount === 0 && baseMetadata.IsValidForForm === true && baseMetadata.IsValidForRead === true && baseMetadata.IsValidForCreate === false && baseMetadata.IsValidForUpdate === false && baseMetadata.CalculationOf === "aigw_yearrevenueactual" && audit.draft.oldFieldControlCount === 0 && audit.draft.baseFieldControlCount === 1 && audit.current.uniqueBoundFields === 106 && audit.draft.uniqueBoundFields === 106;
  if (!valid) throw new Error(`Dry-run validation blocked: ${JSON.stringify(audit)}`);
  const manifest = {
    phase: "1C-5R0-F1",
    dryRun: true,
    executable: false,
    authorizationRequiredForFutureWrite: true,
    targetEnvironment: URL,
    solution: SOLUTION,
    formId: FORM_ID,
    expectedBaseline: { formXmlSha256: audit.current.formXmlSha256, formJsonSha256: audit.current.formJsonSha256, inactive: true, nonDefault: true, oldControlId, cellId: audit.current.location.cellId },
    change: { tab: audit.current.location.tabName, section: audit.current.location.sectionName, cellId: audit.current.location.cellId, removeControlBinding: OLD_FIELD, addControlBinding: NEW_FIELD, proposedNewControlId: NEW_CONTROL_ID, currentLabels: label, targetLabels: [{ languageCode: 1033, description: TARGET_LABEL }, { languageCode: 2052, description: TARGET_LABEL }], readOnly: true, preserveCellAndPosition: true, deprecatedColumnRetained: true },
    recommendedMethod: "Power Apps Form Designer: remove the old visible field, add the generated base field in the same position, set the custom label, then Save only. Accept a Designer-generated control ID.",
    formXmlFallback: { authorized: false, draftFile: "docs/d365/phase1c-5r0-f1-full-replica-formxml-draft.xml", patchFields: ["formxml"], formJsonMustNotBeWritten: true, designerSaveOnlyRequiredAfterPatch: true },
    expectedAfter: { tabs: 5, sections: 19, controls: 114, uniqueBoundFields: 106, oldFieldControls: 0, baseFieldControls: 1, actualManagementSubgrids: 1 },
    forbidden: ["original Form", "aigw_yearrevenueactualcny metadata", "Column deletion", "Subgrid changes", "Business Rule/BPF changes", "data writes", "PublishXml", "external AI"],
    rollback: { method: "Designer remove the base field and re-add aigw_yearrevenueactualcny to the same cell/position with the original label, then Save only", exactBaselineBackupRequired: true, physicalColumnDeletion: false },
    postSaveValidation: ["RetrieveUnpublished FormXML/FormJSON", "Exactly one base field control and zero old CNY controls", "Base control is read-only", "Cell/section/tab and visible order are unchanged", "5 tabs, 19 sections, 114 controls, 106 unique bound fields", "Actual Management Subgrid parameters unchanged", "Business Rule/BPF remain Draft/Inactive", "Original Form/View hashes unchanged", "Normal published form remains unchanged"]
  };
  const diff = `# Phase 1C-5R0-F1 Form Rebind Dry-run\n\n## Current control\n\n- Tab: \`${audit.current.location.tabName}\` / \`${audit.current.location.tabId}\`\n- Section: \`${audit.current.location.sectionName}\` / \`${audit.current.location.sectionId}\`\n- Cell: \`${audit.current.location.cellId}\`\n- Control: \`${oldControlId}\`\n- Current field: \`${OLD_FIELD}\`\n- Current disabled: \`${audit.current.location.disabled}\`\n- Current labels: ${label.map((item) => `${item.languageCode}=${item.description}`).join(", ")}\n- Target labels: 1033/2052=${TARGET_LABEL}\n\n## FormXML fallback diff\n\n\`\`\`diff\n- ${located.control}\n+ ${controlReplacement}\n\`\`\`\n\nThe fallback keeps the same cell, row, section and tab. It normalizes the visible label from ASCII parentheses to the requested full-width Chinese parentheses, uses a new semantic control ID, and marks the generated base field disabled/read-only. No FormJSON is generated or modified.\n\n## Recommendation\n\nUse Power Apps Form Designer. Remove the old visible field, add \`${NEW_FIELD}\` in the same location, set the visible label to ${TARGET_LABEL}, and execute Save only. This is the lowest FormJSON-drift option. The Designer may generate a new cell/control ID; preserving the old ID is neither required nor desirable because it embeds the deprecated field name.\n`;
  await Promise.all([
    fs.writeFile(path.join(root, "docs", "d365", "phase1c-5r0-f1-form-rebind-audit.json"), JSON.stringify(audit, null, 2)),
    fs.writeFile(path.join(root, "docs", "d365", "phase1c-5r0-f1-formxml-diff.md"), diff),
    fs.writeFile(path.join(root, "docs", "d365", "phase1c-5r0-f1-full-replica-formxml-draft.xml"), draftXml),
    fs.writeFile(path.join(root, "docs", "d365", "phase1c-5r0-f1-write-manifest.json"), JSON.stringify(manifest, null, 2)),
  ]);
  console.log(JSON.stringify({ writesExecuted: false, current: audit.current, baseMetadata: { logicalName: baseMetadata.LogicalName, isValidForForm: baseMetadata.IsValidForForm, isValidForRead: baseMetadata.IsValidForRead, isValidForCreate: baseMetadata.IsValidForCreate, isValidForUpdate: baseMetadata.IsValidForUpdate, calculationOf: baseMetadata.CalculationOf }, dependencies: audit.dependencies, draft: audit.draft, files: ["docs/d365/phase1c-5r0-f1-form-rebind-audit.json", "docs/d365/phase1c-5r0-f1-formxml-diff.md", "docs/d365/phase1c-5r0-f1-full-replica-formxml-draft.xml", "docs/d365/phase1c-5r0-f1-write-manifest.json"] }, null, 2));
}


runDataverseCli(import.meta.url, main);
