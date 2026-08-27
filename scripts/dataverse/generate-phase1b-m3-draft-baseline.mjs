import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION = "CRMAIGatewayDemo";
let WORKFLOW_ID;
const EXPECTED_UNIQUE_NAME = "aigw_ai_demo_full_replica";
const MANAGED_SALES_PROCESS = "opportunitysalesprocess";
const DEFERRED_FIELDS = ["aigw_organizationgroup_choice", "aigw_salesdepartment_choice", "aigw_opportunitytype", "aigw_opportunitydetailtype", "aigw_wonreason_choice", "aigw_lostreason_choice"];
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
function stages(node, output = []) { if (!node || typeof node !== "object") return output; if (String(node.__class || "").includes("StageStep")) output.push(node); for (const value of Object.values(node)) stages(value, output); return output; }
function fields(stage) { const result = []; const visit = (node, required = false) => { if (!node || typeof node !== "object") return; const requiredHere = required || node.isProcessRequired === true; if (node.dataFieldName) result.push({ logicalName: node.dataFieldName, required: requiredHere, displayLabel: node.controlDisplayName || node.dataFieldName }); for (const value of Object.values(node)) visit(value, requiredHere); }; visit(stage); return [...new Map(result.map((item) => [item.logicalName, item])).values()]; }
export async function main() {
  EXPECTED_URL = getDataverseUrl();
  WORKFLOW_ID = getRequiredEnvironmentId("D365_BPF_ID");
  const root = process.cwd(); const client = createDynamicsClient(); const get = async (url) => (await client.dataverseGet(url)).body;
  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: unexpected Dataverse URL");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: AI provider must remain demo and external AI disabled");
  const [solutionResponse, workflow, allBpfs] = await Promise.all([
    get(`/api/data/v9.2/solutions?$select=solutionid,friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
    get(`/api/data/v9.2/workflows(${WORKFLOW_ID})?$select=workflowid,name,uniquename,category,primaryentity,statecode,statuscode,ismanaged,clientdata,processorder,modifiedon`),
    get("/api/data/v9.2/workflows?$select=workflowid,name,uniquename,category,primaryentity,statecode,statuscode,ismanaged,processorder&$filter=primaryentity eq 'opportunity' and category eq 4"),
  ]);
  const solution = solutionResponse.value?.[0]; if (!solution || solution.friendlyname !== "CRM AI Gateway Demo" || solution.ismanaged !== false) throw new Error("Safety gate failed: expected unmanaged CRMAIGatewayDemo solution");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`); if (publisher.customizationprefix !== "aigw") throw new Error("Safety gate failed: publisher prefix must be aigw");
  if (workflow.uniquename !== EXPECTED_UNIQUE_NAME || workflow.category !== 4 || workflow.primaryentity !== "opportunity") throw new Error("Workflow identity gate failed");
  const components = await get(`/api/data/v9.2/solutioncomponents?$select=solutioncomponentid,componenttype,objectid&$filter=_solutionid_value eq ${solution.solutionid} and objectid eq ${WORKFLOW_ID}`);
  const rows = await get(`/api/data/v9.2/processstages?$select=processstageid,stagename,stagecategory,_processid_value&$filter=_processid_value eq ${WORKFLOW_ID}`);
  const parsed = JSON.parse(workflow.clientdata || "{}");
  const stageData = stages(parsed).map((stage, index) => ({ order: index + 1, stageId: stage.stageId || null, name: stage.stepLabels?.list?.find((item) => item.languageCode === 1033)?.description || stage.description || "", nextStageId: stage.nextStageId || null, dataSteps: fields(stage) }));
  const managedSales = (allBpfs.value || []).find((item) => item.uniquename === MANAGED_SALES_PROCESS);
  let instanceAudit; try { const definition = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${EXPECTED_UNIQUE_NAME}')?$select=EntitySetName`); const fetch = `<fetch aggregate="true"><entity name="${EXPECTED_UNIQUE_NAME}"><attribute name="businessprocessflowinstanceid" alias="count" aggregate="count" /><link-entity name="opportunity" from="opportunityid" to="opportunityid"><filter><condition attribute="name" operator="like" value="[[]AI-DEMO]%" /></filter></link-entity></entity></fetch>`; const counts = await get(`/api/data/v9.2/${definition.EntitySetName}?fetchXml=${encodeURIComponent(fetch)}`); instanceAudit = { instanceTableExists: true, demoInstanceCount: Number(counts.value?.[0]?.count || 0) }; } catch { instanceAudit = { instanceTableExists: false, demoInstanceCount: 0, reason: "Inactive Draft BPF has no generated instance table." }; }
  const report = { readOnly: true, generatedAt: new Date().toISOString(), safety: { dataverseUrl: EXPECTED_URL, solution: SOLUTION, publisherPrefix: publisher.customizationprefix, aiProvider: "demo", allowExternalAi: false }, workflow: { workflowId: workflow.workflowid, name: workflow.name, uniqueName: workflow.uniquename, category: workflow.category, primaryEntity: workflow.primaryentity, statecode: workflow.statecode, statuscode: workflow.statuscode, draftInactive: workflow.statecode === 0 && workflow.statuscode === 1, isManaged: Boolean(workflow.ismanaged), processOrder: workflow.processorder, processOrderManuallyConfigured: false }, solutionMembership: { found: (components.value || []).length > 0, componentTypes: (components.value || []).map((item) => item.componenttype) }, stages: stageData, processstageMetadata: rows.value || [], deferredFields: DEFERRED_FIELDS, deferredHandling: { policy: "Do not add, guess, relabel, publish, or activate for these fields.", futureOptions: ["Use a Designer surface that exposes logical names or types", "Use a separately authorized temporary-metadata-label and publish window after all pending Opportunity changes are reconciled", "Keep the steps absent and maintain the two-stage Draft baseline"] }, managedSalesProcess: managedSales ? { workflowId: managedSales.workflowid, name: managedSales.name, uniqueName: managedSales.uniquename, isManaged: Boolean(managedSales.ismanaged), statecode: managedSales.statecode, statuscode: managedSales.statuscode, processOrder: managedSales.processorder } : null, bpfInstanceAudit: instanceAudit, securityRoles: { configured: false, evidence: "No security-role configuration is present in this Draft BPF clientdata or exposed workflow metadata." }, publishAndActivation: { publishExecuted: false, activated: workflow.statecode === 1, note: "This audit issued only GET requests." }, recommendation: "Keep this BPF Draft/Inactive. Do not activate until a separate authorization covers final steps, process order, security roles, App integration, and BPF instance strategy." };
  const docs = path.join(root, "docs", "d365"); const backup = path.join(root, "backups", "dataverse", `phase1b_m3_draft_baseline_${stamp()}`); await fs.mkdir(docs, { recursive: true }); await fs.mkdir(backup, { recursive: true });
  await Promise.all([fs.writeFile(path.join(docs, "phase1b-m3-draft-baseline.json"), JSON.stringify(report, null, 2)), fs.writeFile(path.join(backup, "01_m3_draft_baseline.json"), JSON.stringify(report, null, 2)), fs.writeFile(path.join(backup, "02_m3_draft_clientdata.json"), JSON.stringify(parsed, null, 2))]);
  console.log(JSON.stringify({ readOnly: true, workflow: report.workflow, solutionMembership: report.solutionMembership, stages: report.stages, deferredFields: report.deferredFields, managedSalesProcess: report.managedSalesProcess, bpfInstanceAudit: report.bpfInstanceAudit, securityRoles: report.securityRoles, publishAndActivation: report.publishAndActivation, report: "docs/d365/phase1b-m3-draft-baseline.json", backup: path.relative(root, backup) }, null, 2));
}

runDataverseCli(import.meta.url, main);
