import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";
import { compareViewDefinition } from "./lib/phase1c3-view-reconciliation.mjs";

let URL;
const SOLUTION = "CRMAIGatewayDemo";
const TARGET = "aigw_actualmanagement";
const VIEW_NAME = "实绩管理 - AI Demo";
let VIEW_ID;
const AUTHORIZATION = "CONFIRM_D365_TEST_WRITE_PHASE_1C_3A_ADD_VIEW_TO_SOLUTION";
let FULL_FORM_ID;
let ORIGINAL_FORM_ID;
let ORIGINAL_VIEW_ID;
let BUSINESS_RULE_ID;
let BPF_ID;

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const normalizeId = (value) => String(value || "").replace(/[{}]/g, "").toLowerCase();
const viewHash = (view) => sha256(JSON.stringify({ name: view.name, fetchxml: view.fetchxml, layoutxml: view.layoutxml, layoutjson: view.layoutjson, statecode: view.statecode, statuscode: view.statuscode, ismanaged: view.ismanaged }));

export async function main() {
  URL = getDataverseUrl();
  VIEW_ID = getRequiredEnvironmentId("D365_ACTUAL_MANAGEMENT_VIEW_ID");
  FULL_FORM_ID = getRequiredEnvironmentId("D365_FULL_REPLICA_FORM_ID");
  ORIGINAL_FORM_ID = getRequiredEnvironmentId("D365_ORIGINAL_FORM_ID");
  ORIGINAL_VIEW_ID = getRequiredEnvironmentId("D365_ORIGINAL_VIEW_ID");
  BUSINESS_RULE_ID = getRequiredEnvironmentId("D365_BUSINESS_RULE_ID");
  BPF_ID = getRequiredEnvironmentId("D365_BPF_ID");
  assertDataverseScriptGate({ mode: "write-capable" });
  const root = process.cwd();
  const args = process.argv.slice(2);
  const confirmIndex = args.indexOf("--confirm");
  const confirmed = confirmIndex >= 0 && args[confirmIndex + 1] === AUTHORIZATION;
  const client = createDynamicsClient({ env: { ...process.env, DATAVERSE_TIMEOUT_MS: process.env.PHASE1C_SOLUTION_TIMEOUT_MS || "60000" } });
  const get = async (url) => (await client.dataverseGet(url)).body;
  const getAll = async (url) => {
    const rows = [];
    let next = url;
    while (next) {
      const body = await get(next);
      rows.push(...(body.value || []));
      next = body["@odata.nextLink"] || "";
    }
    return rows;
  };
  const viewSelect = "savedqueryid,name,returnedtypecode,querytype,isquickfindquery,fetchxml,layoutxml,layoutjson,statecode,statuscode,ismanaged";
  const readComponents = (solutionId) => getAll(`/api/data/v9.2/solutioncomponents?$select=solutioncomponentid,objectid,componenttype&$filter=_solutionid_value eq ${solutionId}`);

  if (client.config.dataverseUrl !== URL) throw new Error("Safety gate failed: Dataverse URL mismatch.");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: AI must remain demo/disabled.");

  const [entity, view, allViews, solutions, fullForm, originalForm, originalView, businessRule, bpf, opportunityAttributes] = await Promise.all([
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')?$select=MetadataId,LogicalName,ObjectTypeCode,IsManaged`),
    get(`/api/data/v9.2/savedqueries(${VIEW_ID})?$select=${viewSelect}`),
    getAll(`/api/data/v9.2/savedqueries?$select=${viewSelect}&$filter=returnedtypecode eq '${TARGET}'`),
    get(`/api/data/v9.2/solutions?$select=solutionid,uniquename,friendlyname,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
    get(`/api/data/v9.2/systemforms(${FULL_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,formxml,formjson,formpresentation,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/systemforms(${ORIGINAL_FORM_ID})?$select=formid,formxml,formjson,formpresentation`),
    get(`/api/data/v9.2/savedqueries(${ORIGINAL_VIEW_ID})?$select=savedqueryid,fetchxml,layoutxml,layoutjson`),
    get(`/api/data/v9.2/workflows(${BUSINESS_RULE_ID})?$select=workflowid,statecode,statuscode,clientdata,processtriggerformid,processtriggerscope`),
    get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,statecode,statuscode,clientdata,processorder`),
    getAll("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel"),
  ]);
  const solution = solutions.value?.[0];
  if (!solution || solution.friendlyname !== "CRM AI Gateway Demo" || solution.ismanaged !== false) throw new Error("Safety gate failed: unmanaged solution mismatch.");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Safety gate failed: publisher prefix mismatch.");
  if (entity.LogicalName !== TARGET || entity.IsManaged !== false || entity.ObjectTypeCode !== 11722) throw new Error("Safety gate failed: target table mismatch.");
  if (normalizeId(view.savedqueryid) !== VIEW_ID || view.name !== VIEW_NAME) throw new Error("Safety gate failed: target SavedQuery mismatch.");
  const definitionMismatches = compareViewDefinition(view, entity.ObjectTypeCode);
  if (definitionMismatches.length) throw new Error(`Safety gate failed: View definition changed: ${definitionMismatches.join(",")}`);
  const sameNameViews = allViews.filter((item) => item.name === VIEW_NAME);
  if (sameNameViews.length !== 1 || normalizeId(sameNameViews[0].savedqueryid) !== VIEW_ID) throw new Error("Safety gate failed: duplicate or mismatched same-name View.");
  if (fullForm.formactivationstate !== 0 || fullForm.isdefault !== false || businessRule.statecode !== 0 || businessRule.statuscode !== 1 || bpf.statecode !== 0 || bpf.statuscode !== 1) throw new Error("Safety gate failed: protected draft state mismatch.");

  const componentsBefore = await readComponents(solution.solutionid);
  const membershipBefore = componentsBefore.find((item) => item.componenttype === 26 && normalizeId(item.objectid) === VIEW_ID) || null;
  const protectedBefore = {
    opportunityAttributes: sha256(JSON.stringify(opportunityAttributes)),
    fullReplicaFormXml: sha256(fullForm.formxml),
    fullReplicaFormJson: sha256(fullForm.formjson),
    originalFormXml: sha256(originalForm.formxml),
    originalFormJson: sha256(originalForm.formjson),
    originalView: sha256(JSON.stringify({ fetchxml: originalView.fetchxml, layoutxml: originalView.layoutxml, layoutjson: originalView.layoutjson })),
    businessRule: sha256(JSON.stringify({ statecode: businessRule.statecode, statuscode: businessRule.statuscode, clientdata: businessRule.clientdata, processtriggerformid: businessRule.processtriggerformid, processtriggerscope: businessRule.processtriggerscope })),
    bpf: sha256(JSON.stringify({ statecode: bpf.statecode, statuscode: bpf.statuscode, clientdata: bpf.clientdata, processorder: bpf.processorder })),
  };
  const platformViewsBefore = Object.fromEntries(allViews.filter((item) => normalizeId(item.savedqueryid) !== VIEW_ID).map((item) => [normalizeId(item.savedqueryid), viewHash(item)]));
  const payload = { ComponentId: VIEW_ID, ComponentType: 26, SolutionUniqueName: SOLUTION, AddRequiredComponents: false };
  const backupDir = path.join(root, "backups", "dataverse", `phase1c3a_add_view_to_solution_${stamp()}`);
  await fs.mkdir(backupDir, { recursive: true });
  const beforeSnapshot = { generatedAt: new Date().toISOString(), confirmed, environment: URL, solution: { id: solution.solutionid, uniqueName: solution.uniquename, unmanaged: !solution.ismanaged, publisherPrefix: publisher.customizationprefix }, view: { id: view.savedqueryid, name: view.name, hash: viewHash(view), definitionMismatches }, membershipExists: Boolean(membershipBefore), solutionComponentId: membershipBefore?.solutioncomponentid || null, platformViewHashes: platformViewsBefore, protectedHashes: protectedBefore, request: { method: "POST", endpoint: "/api/data/v9.2/AddSolutionComponent", payload }, publishExecuted: false };
  await fs.writeFile(path.join(backupDir, "01_before_snapshot.json"), `${JSON.stringify(beforeSnapshot, null, 2)}\n`);
  if (!confirmed) {
    console.log(JSON.stringify({ status: "dry-run", backupDir: path.relative(root, backupDir), membershipExists: Boolean(membershipBefore), viewHash: beforeSnapshot.view.hash, payload }, null, 2));
    return;
  }

  const log = { startedAt: new Date().toISOString(), authorization: AUTHORIZATION, status: membershipBefore ? "alreadyExistsAndValid" : "pending", postCalls: 0, postRetried: false, publishExecuted: false };
  const logPath = path.join(backupDir, "02_write_log.json");
  const persist = () => fs.writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`);
  await persist();
  let membership = membershipBefore;
  if (!membership) {
    let postError = null;
    try {
      log.postCalls = 1;
      await client.dataversePost("/api/data/v9.2/AddSolutionComponent", payload);
    } catch (error) {
      postError = error;
    }
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      membership = (await readComponents(solution.solutionid)).find((item) => item.componenttype === 26 && normalizeId(item.objectid) === VIEW_ID) || null;
      if (membership) {
        log.status = postError ? "added_after_post_error" : "added";
        log.postError = postError?.message || null;
        log.pollAttemptsUsed = attempt;
        break;
      }
      if (attempt < 8) await sleep(1500);
    }
    if (!membership) {
      log.status = "stopped_without_retry";
      log.postError = postError?.message || null;
      log.completedAt = new Date().toISOString();
      await persist();
      throw new Error(postError ? `AddSolutionComponent failed and membership remains absent: ${postError.message}` : "AddSolutionComponent returned but membership remains absent");
    }
  }
  log.solutionComponentId = membership.solutioncomponentid;
  log.completedAt = new Date().toISOString();
  await persist();

  const [viewAfter, allViewsAfter, fullFormAfter, originalFormAfter, originalViewAfter, businessRuleAfter, bpfAfter, opportunityAttributesAfter] = await Promise.all([
    get(`/api/data/v9.2/savedqueries(${VIEW_ID})?$select=${viewSelect}`),
    getAll(`/api/data/v9.2/savedqueries?$select=${viewSelect}&$filter=returnedtypecode eq '${TARGET}'`),
    get(`/api/data/v9.2/systemforms(${FULL_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,formxml,formjson,formpresentation,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/systemforms(${ORIGINAL_FORM_ID})?$select=formid,formxml,formjson,formpresentation`),
    get(`/api/data/v9.2/savedqueries(${ORIGINAL_VIEW_ID})?$select=savedqueryid,fetchxml,layoutxml,layoutjson`),
    get(`/api/data/v9.2/workflows(${BUSINESS_RULE_ID})?$select=workflowid,statecode,statuscode,clientdata,processtriggerformid,processtriggerscope`),
    get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,statecode,statuscode,clientdata,processorder`),
    getAll("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel"),
  ]);
  const componentsAfter = await readComponents(solution.solutionid);
  const membershipAfter = componentsAfter.find((item) => item.componenttype === 26 && normalizeId(item.objectid) === VIEW_ID) || null;
  const protectedAfter = {
    opportunityAttributes: sha256(JSON.stringify(opportunityAttributesAfter)),
    fullReplicaFormXml: sha256(fullFormAfter.formxml),
    fullReplicaFormJson: sha256(fullFormAfter.formjson),
    originalFormXml: sha256(originalFormAfter.formxml),
    originalFormJson: sha256(originalFormAfter.formjson),
    originalView: sha256(JSON.stringify({ fetchxml: originalViewAfter.fetchxml, layoutxml: originalViewAfter.layoutxml, layoutjson: originalViewAfter.layoutjson })),
    businessRule: sha256(JSON.stringify({ statecode: businessRuleAfter.statecode, statuscode: businessRuleAfter.statuscode, clientdata: businessRuleAfter.clientdata, processtriggerformid: businessRuleAfter.processtriggerformid, processtriggerscope: businessRuleAfter.processtriggerscope })),
    bpf: sha256(JSON.stringify({ statecode: bpfAfter.statecode, statuscode: bpfAfter.statuscode, clientdata: bpfAfter.clientdata, processorder: bpfAfter.processorder })),
  };
  const protectedUnchanged = Object.fromEntries(Object.keys(protectedBefore).map((key) => [key, protectedBefore[key] === protectedAfter[key]]));
  const platformViewsAfter = new Map(allViewsAfter.filter((item) => normalizeId(item.savedqueryid) !== VIEW_ID).map((item) => [normalizeId(item.savedqueryid), viewHash(item)]));
  const platformViewsUnchanged = Object.entries(platformViewsBefore).every(([id, hash]) => platformViewsAfter.get(id) === hash);
  const verification = { generatedAt: new Date().toISOString(), result: log.status, solutionComponent: membershipAfter, membershipValid: Boolean(membershipAfter && membershipAfter.componenttype === 26 && normalizeId(membershipAfter.objectid) === VIEW_ID), view: { id: viewAfter.savedqueryid, hashBefore: beforeSnapshot.view.hash, hashAfter: viewHash(viewAfter), hashUnchanged: beforeSnapshot.view.hash === viewHash(viewAfter), definitionMismatches: compareViewDefinition(viewAfter, entity.ObjectTypeCode) }, platformViews: { beforeCount: Object.keys(platformViewsBefore).length, afterCount: platformViewsAfter.size, unchanged: platformViewsUnchanged }, protectedHashesBefore: protectedBefore, protectedHashesAfter: protectedAfter, protectedUnchanged, businessRuleDraftInactive: businessRuleAfter.statecode === 0 && businessRuleAfter.statuscode === 1, bpfDraftInactive: bpfAfter.statecode === 0 && bpfAfter.statuscode === 1, fullReplicaFormInactiveNonDefault: fullFormAfter.formactivationstate === 0 && fullFormAfter.isdefault === false, publishExecuted: false, aiProvider: process.env.AI_PROVIDER || "demo", allowExternalAi: (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() === "true" };
  verification.pass = verification.membershipValid && verification.view.hashUnchanged && !verification.view.definitionMismatches.length && platformViewsUnchanged && Object.values(protectedUnchanged).every(Boolean) && verification.businessRuleDraftInactive && verification.bpfDraftInactive && verification.fullReplicaFormInactiveNonDefault;
  const rollback = { automaticRollbackExecuted: false, solutionComponentId: membershipAfter.solutioncomponentid, savedQueryId: VIEW_ID, viewDeletionAuthorized: false, rollbackAuthorizationRequired: true, note: "Removing the solution component or deleting the View requires separate authorization. The SavedQuery definition was not modified by Phase 1C-3A." };
  await Promise.all([
    fs.writeFile(path.join(backupDir, "03_after_snapshot.json"), `${JSON.stringify(verification, null, 2)}\n`),
    fs.writeFile(path.join(backupDir, "04_rollback_manifest.json"), `${JSON.stringify(rollback, null, 2)}\n`),
  ]);
  console.log(JSON.stringify({ status: verification.pass ? "success" : "verification_failed", result: log.status, solutionComponentId: membershipAfter.solutioncomponentid, membershipValid: verification.membershipValid, viewHashBefore: verification.view.hashBefore, viewHashAfter: verification.view.hashAfter, viewDefinitionMismatches: verification.view.definitionMismatches, platformViews: verification.platformViews, protectedUnchanged, businessRuleDraftInactive: verification.businessRuleDraftInactive, bpfDraftInactive: verification.bpfDraftInactive, publishExecuted: false, backupDir: path.relative(root, backupDir) }, null, 2));
  if (!verification.pass) process.exitCode = 1;
}


runDataverseCli(import.meta.url, main);
