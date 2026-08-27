import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION = "CRMAIGatewayDemo";
const EXPECTED_NAME = "销售流程 - AI Demo Full Replica";
const EXPECTED_UNIQUE_NAME = "aigw_ai_demo_full_replica";
const MANAGED_SALES_PROCESS = "opportunitysalesprocess";
const EXPECTED_STAGES = [
  { name: "授予资格", fields: [
    ["parentaccountid", true], ["aigw_organizationgroup_choice", true], ["aigw_salesdepartment_choice", true], ["aigw_opportunitytype", true], ["aigw_opportunitydetailtype", false],
  ] },
  { name: "案件关闭", fields: [
    ["aigw_winprobabilityrank", false], ["statuscode", false], ["aigw_wonreason_choice", false], ["aigw_lostreason_choice", false], ["actualclosedate", false],
  ] },
];
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

function findStages(node, result = []) {
  if (!node || typeof node !== "object") return result;
  if (String(node.__class || "").includes("StageStep")) result.push(node);
  for (const value of Object.values(node)) findStages(value, result);
  return result;
}
function stageFields(stage) {
  const found = [];
  const visit = (node, required = false) => {
    if (!node || typeof node !== "object") return;
    const isRequired = required || node.isProcessRequired === true;
    if (node.dataFieldName) found.push({ logicalName: node.dataFieldName, required: isRequired, displayLabel: node.controlDisplayName || node.dataFieldName });
    for (const value of Object.values(node)) visit(value, isRequired);
  };
  visit(stage);
  return [...new Map(found.map((field) => [field.logicalName, field])).values()];
}
export async function main() {
  EXPECTED_URL = getDataverseUrl();
  const root = process.cwd(); const client = createDynamicsClient(); const get = async (url) => (await client.dataverseGet(url)).body;
  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: unexpected Dataverse URL");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: AI provider must remain demo and external AI disabled");
  const [solutions, workflows] = await Promise.all([
    get(`/api/data/v9.2/solutions?$select=solutionid,friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
    get("/api/data/v9.2/workflows?$select=workflowid,name,uniquename,category,primaryentity,statecode,statuscode,ismanaged,clientdata,processorder,modifiedon&$filter=primaryentity eq 'opportunity' and category eq 4"),
  ]);
  const solution = solutions.value?.[0];
  if (!solution || solution.friendlyname !== "CRM AI Gateway Demo" || solution.ismanaged !== false) throw new Error("Safety gate failed: expected unmanaged CRMAIGatewayDemo solution");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Safety gate failed: publisher prefix must be aigw");
  const candidates = (workflows.value || []).filter((workflow) => workflow.uniquename === EXPECTED_UNIQUE_NAME);
  if (candidates.length !== 1) throw new Error(`Expected exactly one BPF with unique name ${EXPECTED_UNIQUE_NAME}, found ${candidates.length}`);
  const workflow = candidates[0]; let parsed; try { parsed = JSON.parse(workflow.clientdata || "{}"); } catch { throw new Error("Draft BPF clientdata is not JSON"); }
  const stageNodes = findStages(parsed); const actualStages = stageNodes.map((stage, index) => ({ order: index + 1, stageId: stage.stageId || null, name: stage.stepLabels?.list?.find((item) => item.languageCode === 1033)?.description || stage.description || "", nextStageId: stage.nextStageId || null, fields: stageFields(stage) }));
  const processStagesResponse = await get(`/api/data/v9.2/processstages?$select=processstageid,stagename,stagecategory,_processid_value&$filter=_processid_value eq ${workflow.workflowid}`);
  const components = await get(`/api/data/v9.2/solutioncomponents?$select=solutioncomponentid,componenttype,objectid&$filter=_solutionid_value eq ${solution.solutionid} and objectid eq ${workflow.workflowid}`);
  const expectedByStage = EXPECTED_STAGES.map((expected, index) => {
    const actual = actualStages[index] || { fields: [] }; const actualFields = actual.fields.map((field) => field.logicalName);
    return { stage: expected.name, order: index + 1, stageNameMatches: actual.name === expected.name, actualFields, expectedFields: expected.fields.map(([logicalName]) => logicalName), presentFields: expected.fields.filter(([logicalName]) => actualFields.includes(logicalName)).map(([logicalName, required]) => ({ logicalName, required, actualRequired: actual.fields.find((field) => field.logicalName === logicalName)?.required })), missingFields: expected.fields.filter(([logicalName]) => !actualFields.includes(logicalName)).map(([logicalName, required]) => ({ logicalName, required })), unexpectedFields: actual.fields.filter((field) => !expected.fields.some(([logicalName]) => logicalName === field.logicalName)) };
  });
  let instanceAudit;
  try {
    const definition = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${EXPECTED_UNIQUE_NAME}')?$select=LogicalName,EntitySetName`);
    const fetch = `<fetch aggregate="true"><entity name="${EXPECTED_UNIQUE_NAME}"><attribute name="businessprocessflowinstanceid" alias="record_count" aggregate="count" /><link-entity name="opportunity" from="opportunityid" to="opportunityid"><filter><condition attribute="name" operator="like" value="[[]AI-DEMO]%" /></filter></link-entity></entity></fetch>`;
    const instances = await get(`/api/data/v9.2/${definition.EntitySetName}?fetchXml=${encodeURIComponent(fetch)}`);
    instanceAudit = { instanceTableExists: true, entitySetName: definition.EntitySetName, demoInstanceCount: Number(instances.value?.[0]?.record_count || 0) };
  } catch (error) { instanceAudit = { instanceTableExists: false, demoInstanceCount: 0, note: "No BPF instance table is available for this inactive Draft process.", error: error.message }; }
  const managedSales = (workflows.value || []).find((item) => item.uniquename === MANAGED_SALES_PROCESS);
  const report = { readOnly: true, generatedAt: new Date().toISOString(), safety: { dataverseUrl: EXPECTED_URL, solution: SOLUTION, publisherPrefix: publisher.customizationprefix, aiProvider: "demo", allowExternalAi: false }, workflow: { workflowId: workflow.workflowid, name: workflow.name, expectedName: EXPECTED_NAME, nameMatches: workflow.name === EXPECTED_NAME, uniqueName: workflow.uniquename, category: workflow.category, primaryEntity: workflow.primaryentity, draftInactive: workflow.statecode === 0 && workflow.statuscode === 1, statecode: workflow.statecode, statuscode: workflow.statuscode, isManaged: Boolean(workflow.ismanaged), processOrder: workflow.processorder }, solutionMembership: { found: (components.value || []).length > 0, componentTypes: (components.value || []).map((item) => item.componenttype) }, stages: actualStages, processstageRows: processStagesResponse.value || [], expectedStepAudit: expectedByStage, managedSalesProcess: managedSales ? { workflowId: managedSales.workflowid, name: managedSales.name, uniqueName: managedSales.uniquename, isManaged: Boolean(managedSales.ismanaged), statecode: managedSales.statecode, statuscode: managedSales.statuscode, processOrder: managedSales.processorder } : null, demoInstanceAudit: instanceAudit, forbiddenMutationsObserved: { publish: false, activation: workflow.statecode === 1, processOrderChange: workflow.processorder !== 100, appIntegration: false, securityRoleChange: false, recordSwitch: instanceAudit.demoInstanceCount > 0 }, conclusion: "Draft only. Missing BPF steps remain intentionally unconfigured because same-name fields were skipped; do not activate." };
  const docs = path.join(root, "docs", "d365"); const backup = path.join(root, "backups", "dataverse", `phase1b_m3c_draft_bpf_${stamp()}`); await fs.mkdir(docs, { recursive: true }); await fs.mkdir(backup, { recursive: true });
  await Promise.all([fs.writeFile(path.join(docs, "phase1b-m3c-draft-bpf-validation.json"), JSON.stringify(report, null, 2)), fs.writeFile(path.join(backup, "01_m3c_draft_bpf_validation.json"), JSON.stringify(report, null, 2)), fs.writeFile(path.join(backup, "02_m3c_clientdata.json"), JSON.stringify(parsed, null, 2))]);
  console.log(JSON.stringify({ readOnly: true, workflow: report.workflow, solutionMembership: report.solutionMembership, stages: report.stages, expectedStepAudit: report.expectedStepAudit, processstageRows: report.processstageRows, managedSalesProcess: report.managedSalesProcess, demoInstanceAudit: report.demoInstanceAudit, report: "docs/d365/phase1b-m3c-draft-bpf-validation.json", backup: path.relative(root, backup) }, null, 2));
}

runDataverseCli(import.meta.url, main);
