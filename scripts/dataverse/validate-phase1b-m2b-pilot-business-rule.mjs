import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION = "CRMAIGatewayDemo";
let FORM_ID;
let ORIGINAL_FORM_ID;
const RULE_NAME = "AI Gateway Full Replica - Required - Opportunity";

const sha256 = (value) => createHash("sha256").update(String(value || "")).digest("hex");
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

function allBindings(clientdata) {
  const text = String(clientdata || "");
  const values = new Set();
  const patterns = [
    /attributes\.get\(['"]([^'"]+)['"]\)/g,
    /(?:dataFieldName|fieldName|attributeName|attribute)\s*[:=]\s*['"]([^'"]+)['"]/g,
    /["'](?:dataFieldName|fieldName|attributeName|attribute)["']\s*:\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) values.add(match[1]);
  return [...values].sort();
}

function actionHints(clientdata) {
  const text = String(clientdata || "");
  return {
    containsDataCondition: /ContainsData|contains\s*data|operator[^\n]{0,100}contains/i.test(text),
    setBusinessRequired: /SetBusinessRequired|BusinessRequired|setRequiredLevel/i.test(text),
    specificForm: new RegExp(FORM_ID, "i").test(text),
  };
}

export async function main() {
  EXPECTED_URL = getDataverseUrl();
  FORM_ID = getRequiredEnvironmentId("D365_FULL_REPLICA_FORM_ID");
  ORIGINAL_FORM_ID = getRequiredEnvironmentId("D365_ORIGINAL_FORM_ID");
  const root = process.cwd();
  const client = createDynamicsClient();
  const get = async (url) => (await client.dataverseGet(url)).body;
  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: unexpected Dataverse URL");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: AI provider must remain demo and external AI disabled");

  const [solutionResponse, rulesResponse, targetForm, originalForm, parentAccountMetadata] = await Promise.all([
    get(`/api/data/v9.2/solutions?$select=solutionid,friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
    get("/api/data/v9.2/workflows?$select=workflowid,name,uniquename,category,primaryentity,statecode,statuscode,ismanaged,clientdata,componentstate,createdon,modifiedon,formid,scope,processtriggerformid,processtriggerscope&$filter=primaryentity eq 'opportunity' and category eq 2"),
    get(`/api/data/v9.2/systemforms(${FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,formxml,formjson,isdefault,formactivationstate,versionnumber`),
    get(`/api/data/v9.2/systemforms(${ORIGINAL_FORM_ID})?$select=formid,formxml,formjson,versionnumber`),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='parentaccountid')?$select=LogicalName,SchemaName,RequiredLevel,DisplayName,AttributeType"),
  ]);
  const solution = solutionResponse.value?.[0];
  if (!solution || solution.friendlyname !== "CRM AI Gateway Demo" || solution.ismanaged !== false) throw new Error("Safety gate failed: expected unmanaged CRMAIGatewayDemo solution");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Safety gate failed: publisher prefix must be aigw");
  if (targetForm.isdefault !== false || targetForm.formactivationstate !== 0) throw new Error("Safety gate failed: target form must remain inactive and non-default");
  const businessRules = rulesResponse.value || [];
  const exactNameRules = businessRules.filter((item) => item.name === RULE_NAME);
  const pilotCandidates = businessRules.filter((item) => item.ismanaged === false && item.statecode === 0 && item.statuscode === 1 && allBindings(item.clientdata).includes("name") && allBindings(item.clientdata).includes("parentaccountid"));
  if (exactNameRules.length > 1 || (!exactNameRules.length && pilotCandidates.length !== 1)) throw new Error(`Pilot rule cannot be uniquely identified: exact-name=${exactNameRules.length}, binding-candidates=${pilotCandidates.length}`);
  const rule = exactNameRules[0] || pilotCandidates[0];
  const bindings = allBindings(rule.clientdata);
  const hints = actionHints(rule.clientdata);
  const componentResponse = await get(`/api/data/v9.2/solutioncomponents?$select=solutioncomponentid,componenttype,objectid&$filter=_solutionid_value eq ${solution.solutionid} and objectid eq ${rule.workflowid}`);
  const previousAudit = JSON.parse(await fs.readFile(path.join(root, "docs", "d365", "phase1b-m2b-form-required-dry-run.json"), "utf8"));
  const previousParentAccount = previousAudit.fields.find((item) => item.logicalName === "parentaccountid");
  const componentTypes = (componentResponse.value || []).map((item) => item.componenttype);
  const exactName = rule.name === RULE_NAME;
  // For a form-scoped Business Rule, Dataverse stores the target in the
  // process trigger fields. workflow.formid remains null for this rule type.
  const actualSpecificForm = rule.processtriggerformid === FORM_ID && rule.processtriggerscope === 1;
  const containsDataCondition = hints.containsDataCondition || (bindings.includes("name") && /getValue\(\)[\s\S]*?!==\s*""/.test(String(rule.clientdata || "")));

  const result = {
    readOnly: true,
    generatedAt: new Date().toISOString(),
    safety: { dataverseUrl: EXPECTED_URL, solution: SOLUTION, publisherPrefix: publisher.customizationprefix, aiProvider: "demo", allowExternalAi: false },
    workflow: {
      workflowId: rule.workflowid,
      name: rule.name,
      expectedName: RULE_NAME,
      exactName,
      uniqueName: rule.uniquename,
      category: rule.category,
      primaryEntity: rule.primaryentity,
      statecode: rule.statecode,
      statuscode: rule.statuscode,
      componentState: rule.componentstate,
      isManaged: Boolean(rule.ismanaged),
      draftInactive: rule.statecode === 0 && rule.statuscode === 1,
      scope: rule.scope,
      formId: rule.formid || null,
      processTriggerFormId: rule.processtriggerformid || null,
      clientdataHash: sha256(rule.clientdata),
      bindings,
      validationHints: hints,
    },
    scope: { expectedFormId: FORM_ID, targetFormIdFound: rule.processtriggerformid || null, specificForm: actualSpecificForm, workflowOwnershipScope: rule.scope, actualProcessTriggerScope: rule.processtriggerscope, processTriggerScopeMeaning: rule.processtriggerscope === 1 ? "Form" : "Entity" },
    condition: { expectedLogicalName: "name", actualLogicalNameFound: bindings.includes("name"), expectedOperator: "Contains Data", operatorPatternFound: containsDataCondition },
    action: { expectedLogicalName: "parentaccountid", actualLogicalNameFound: bindings.includes("parentaccountid"), noUnexpectedTargetBindings: bindings.filter((name) => !["name", "parentaccountid"].includes(name)), setBusinessRequiredPatternFound: hints.setBusinessRequired },
    solutionMembership: { found: componentTypes.length > 0, componentTypes, expectedWorkflowComponentType: 29 },
    parentAccountRequiredLevel: { before: previousParentAccount?.columnRequiredLevel || "unknown", after: parentAccountMetadata.RequiredLevel?.Value || "unknown", unchanged: previousParentAccount?.columnRequiredLevel === parentAccountMetadata.RequiredLevel?.Value },
    formProtection: { targetFormInactive: targetForm.formactivationstate === 0, targetFormNonDefault: targetForm.isdefault === false, originalFormHashes: { formxml: sha256(originalForm.formxml), formjson: sha256(originalForm.formjson) }, targetFormHashes: { formxml: sha256(targetForm.formxml), formjson: sha256(targetForm.formjson) } },
    noPublishOrActivationObserved: { ruleInactive: rule.statecode === 0 && rule.statuscode === 1, targetFormInactive: targetForm.formactivationstate === 0, note: "This read-only check did not issue any PublishXml or activation request. Workflow componentstate is a component lifecycle flag and does not mean the Draft Business Rule is activated." },
  };
  result.success = result.workflow.exactName && result.workflow.draftInactive && result.scope.specificForm && result.condition.actualLogicalNameFound && result.condition.operatorPatternFound && result.action.actualLogicalNameFound && result.action.noUnexpectedTargetBindings.length === 0 && result.action.setBusinessRequiredPatternFound && result.solutionMembership.found && result.parentAccountRequiredLevel.unchanged;

  const backupDir = path.join(root, "backups", "dataverse", `phase1b_m2b_pilot_validation_${stamp()}`);
  await fs.mkdir(backupDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(root, "docs", "d365", "phase1b-m2b-pilot-validation.json"), JSON.stringify(result, null, 2)),
    fs.writeFile(path.join(backupDir, "01_pilot_validation.json"), JSON.stringify(result, null, 2)),
    fs.writeFile(path.join(backupDir, "02_target_form_unpublished_formxml.xml"), targetForm.formxml),
    fs.writeFile(path.join(backupDir, "03_original_form_formxml.xml"), originalForm.formxml),
  ]);
  console.log(JSON.stringify({ success: result.success, workflow: result.workflow, scope: result.scope, condition: result.condition, action: result.action, solutionMembership: result.solutionMembership, parentAccountRequiredLevel: result.parentAccountRequiredLevel, noPublishOrActivationObserved: result.noPublishOrActivationObserved, report: "docs/d365/phase1b-m2b-pilot-validation.json", backup: path.relative(root, backupDir) }, null, 2));
  if (!result.success) process.exitCode = 2;
}


runDataverseCli(import.meta.url, main);
