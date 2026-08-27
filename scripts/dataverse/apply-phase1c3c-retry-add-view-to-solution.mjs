import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";
import { compareViewDefinition } from "./lib/phase1c3-view-reconciliation.mjs";

let URL;
const SOLUTION = "CRMAIGatewayDemo";
const TABLE = "aigw_actualmanagement";
const VIEW_NAME = "实绩管理 - AI Demo";
let VIEW_ID;
const MANIFEST_PATH = "docs/d365/phase1c-3b-add-view-to-solution-retry-manifest.json";
const AUTHORIZATION = "CONFIRM_D365_TEST_WRITE_PHASE_1C_3C_RETRY_ADD_VIEW_TO_SOLUTION";
let FULL_FORM_ID;
let ORIGINAL_FORM_ID;
let ORIGINAL_VIEW_ID;
let BUSINESS_RULE_ID;
let BPF_ID;
const EXPECTED_PAYLOAD = { ComponentId: VIEW_ID, ComponentType: 26, SolutionUniqueName: SOLUTION, AddRequiredComponents: false, DoNotIncludeSubcomponents: true };

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const normalizeId = (value) => String(value || "").replace(/[{}]/g, "").toLowerCase();
const viewHash = (view) => sha256(JSON.stringify({ name: view.name, fetchxml: view.fetchxml, layoutxml: view.layoutxml, layoutjson: view.layoutjson, statecode: view.statecode, statuscode: view.statuscode, ismanaged: view.ismanaged }));
const selectedHeaders = (headers) => Object.fromEntries(["content-type", "request-id", "x-ms-service-request-id", "x-ms-correlation-request-id", "activity-id", "odata-version", "location"].map((name) => [name, headers?.get?.(name) || null]));

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
  const componentSelect = "solutioncomponentid,objectid,componenttype,_solutionid_value,rootcomponentbehavior,rootsolutioncomponentid";
  const readComponents = (solutionId) => getAll(`/api/data/v9.2/solutioncomponents?$select=${componentSelect}&$filter=_solutionid_value eq ${solutionId}`);
  const viewSelect = "savedqueryid,name,returnedtypecode,querytype,isquickfindquery,fetchxml,layoutxml,layoutjson,statecode,statuscode,ismanaged";

  if (client.config.dataverseUrl !== URL) throw new Error("Safety gate failed: URL mismatch.");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: AI must remain demo/disabled.");
  const manifest = JSON.parse(await fs.readFile(path.join(root, MANIFEST_PATH), "utf8"));
  if (!manifest.dryRun || manifest.targetEnvironment !== URL || manifest.solution !== SOLUTION || manifest.savedQueryId !== VIEW_ID || manifest.request?.method !== "POST" || manifest.request?.endpoint !== "/api/data/v9.2/AddSolutionComponent" || JSON.stringify(manifest.request.payload) !== JSON.stringify(EXPECTED_PAYLOAD)) throw new Error("Safety gate failed: retry manifest mismatch.");

  const [solutionRows, entity, view, allViews, fullForm, originalForm, originalView, businessRule, bpf, opportunityAttributes] = await Promise.all([
    get(`/api/data/v9.2/solutions?$select=solutionid,uniquename,friendlyname,ismanaged&$filter=uniquename eq '${SOLUTION}'`),
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TABLE}')?$select=MetadataId,LogicalName,ObjectTypeCode,IsManaged,EntitySetName`),
    get(`/api/data/v9.2/savedqueries(${VIEW_ID})?$select=${viewSelect}`),
    getAll(`/api/data/v9.2/savedqueries?$select=${viewSelect}&$filter=returnedtypecode eq '${TABLE}'`),
    get(`/api/data/v9.2/systemforms(${FULL_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,formxml,formjson,formpresentation,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/systemforms(${ORIGINAL_FORM_ID})?$select=formid,formxml,formjson,formpresentation`),
    get(`/api/data/v9.2/savedqueries(${ORIGINAL_VIEW_ID})?$select=savedqueryid,fetchxml,layoutxml,layoutjson`),
    get(`/api/data/v9.2/workflows(${BUSINESS_RULE_ID})?$select=workflowid,statecode,statuscode,clientdata,processtriggerformid,processtriggerscope`),
    get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,statecode,statuscode,clientdata,processorder`),
    getAll("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel"),
  ]);
  const solution = solutionRows.value?.[0];
  if (!solution || solution.uniquename !== SOLUTION || solution.ismanaged !== false) throw new Error("Safety gate failed: unmanaged solution mismatch.");
  if (entity.LogicalName !== TABLE || entity.IsManaged !== false || entity.ObjectTypeCode !== 11722) throw new Error("Safety gate failed: table mismatch.");
  if (view.name !== VIEW_NAME || normalizeId(view.savedqueryid) !== VIEW_ID || compareViewDefinition(view, entity.ObjectTypeCode).length) throw new Error("Safety gate failed: SavedQuery changed.");
  const sameName = allViews.filter((item) => item.name === VIEW_NAME);
  if (sameName.length !== 1 || normalizeId(sameName[0].savedqueryid) !== VIEW_ID) throw new Error("Safety gate failed: duplicate same-name View.");
  if (fullForm.formactivationstate !== 0 || fullForm.isdefault !== false || businessRule.statecode !== 0 || businessRule.statuscode !== 1 || bpf.statecode !== 0 || bpf.statuscode !== 1) throw new Error("Safety gate failed: protected state mismatch.");

  const componentsBefore = await readComponents(solution.solutionid);
  const membershipBefore = componentsBefore.find((item) => item.componenttype === 26 && normalizeId(item.objectid) === VIEW_ID) || null;
  const platformViewsBefore = Object.fromEntries(allViews.filter((item) => normalizeId(item.savedqueryid) !== VIEW_ID).map((item) => [normalizeId(item.savedqueryid), viewHash(item)]));
  const protectedBefore = {
    opportunityAttributes: sha256(JSON.stringify(opportunityAttributes)),
    fullReplicaFormXml: sha256(fullForm.formxml), fullReplicaFormJson: sha256(fullForm.formjson),
    originalFormXml: sha256(originalForm.formxml), originalFormJson: sha256(originalForm.formjson),
    originalView: sha256(JSON.stringify({ fetchxml: originalView.fetchxml, layoutxml: originalView.layoutxml, layoutjson: originalView.layoutjson })),
    businessRule: sha256(JSON.stringify({ statecode: businessRule.statecode, statuscode: businessRule.statuscode, clientdata: businessRule.clientdata, processtriggerformid: businessRule.processtriggerformid, processtriggerscope: businessRule.processtriggerscope })),
    bpf: sha256(JSON.stringify({ statecode: bpf.statecode, statuscode: bpf.statuscode, clientdata: bpf.clientdata, processorder: bpf.processorder })),
  };
  const backupDir = path.join(root, "backups", "dataverse", `phase1c3c_retry_add_view_to_solution_${stamp()}`);
  await fs.mkdir(backupDir, { recursive: true });
  const before = { generatedAt: new Date().toISOString(), confirmed, environment: URL, solution, view: { id: view.savedqueryid, name: view.name, hash: viewHash(view) }, membershipExists: Boolean(membershipBefore), solutionComponentId: membershipBefore?.solutioncomponentid || null, platformViewHashes: platformViewsBefore, protectedHashes: protectedBefore, request: { timestamp: null, method: "POST", endpoint: "/api/data/v9.2/AddSolutionComponent", payload: EXPECTED_PAYLOAD }, publishExecuted: false };
  await Promise.all([fs.writeFile(path.join(backupDir, "01_before_snapshot.json"), `${JSON.stringify(before, null, 2)}\n`), fs.writeFile(path.join(backupDir, "00_retry_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)]);
  if (!confirmed) {
    console.log(JSON.stringify({ status: "dry-run", backupDir: path.relative(root, backupDir), membershipExists: Boolean(membershipBefore), viewHash: before.view.hash, payload: EXPECTED_PAYLOAD }, null, 2));
    return;
  }

  const log = { authorization: AUTHORIZATION, status: membershipBefore ? "alreadyExistsAndValid" : "pending", postCalls: 0, postRetried: false, requestTimestamp: null, requestPayload: EXPECTED_PAYLOAD, response: null, publishExecuted: false };
  const logPath = path.join(backupDir, "02_action_response.json");
  const persist = () => fs.writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`);
  await persist();
  let actionResponse = null;
  let actionError = null;
  if (!membershipBefore) {
    log.requestTimestamp = new Date().toISOString();
    log.postCalls = 1;
    try {
      actionResponse = await client.dataversePost("/api/data/v9.2/AddSolutionComponent", EXPECTED_PAYLOAD);
      log.response = { status: actionResponse.status, body: actionResponse.body, id: actionResponse.body?.id || null, headers: selectedHeaders(actionResponse.headers), rawSerializedBody: actionResponse.rawBody || JSON.stringify(actionResponse.body || {}) };
    } catch (error) {
      actionError = error;
      log.response = { status: error.status || null, body: error.body || null, id: error.body?.id || null, headers: selectedHeaders(error.headers), rawSerializedBody: error.rawBody || (error.body ? JSON.stringify(error.body) : ""), error: error.message };
    }
    await persist();
  }

  let responseIdComponent = null;
  const responseId = normalizeId(log.response?.id);
  if (responseId) {
    try { responseIdComponent = await get(`/api/data/v9.2/solutioncomponents(${responseId})?$select=${componentSelect}`); }
    catch (error) { responseIdComponent = { readError: error.message }; }
  }
  let membership = membershipBefore;
  for (let attempt = 1; !membership && attempt <= 8; attempt += 1) {
    membership = (await readComponents(solution.solutionid)).find((item) => item.componenttype === 26 && normalizeId(item.objectid) === VIEW_ID) || null;
    if (membership) { log.pollAttemptsUsed = attempt; break; }
    if (attempt < 8) await sleep(1500);
  }
  const methodA = (await readComponents(solution.solutionid)).filter((item) => item.componenttype === 26 && normalizeId(item.objectid) === VIEW_ID);
  const methodBAllType26 = (await readComponents(solution.solutionid)).filter((item) => item.componenttype === 26);
  const methodCNavigation = (await getAll(`/api/data/v9.2/solutions(${solution.solutionid})/solution_solutioncomponent?$select=${componentSelect}`)).filter((item) => item.componenttype === 26 && normalizeId(item.objectid) === VIEW_ID);
  const responseMismatch = Boolean(responseId && (!responseIdComponent || responseIdComponent.readError || responseIdComponent.componenttype !== 26 || normalizeId(responseIdComponent.objectid) !== VIEW_ID || normalizeId(responseIdComponent._solutionid_value) !== normalizeId(solution.solutionid)));
  if (membershipBefore) log.status = "alreadyExistsAndValid";
  else if (responseMismatch) log.status = "blocked_response_mismatch";
  else if (membership && actionError) log.status = "added_after_post_error";
  else if (membership) log.status = "created";
  else log.status = "stopped_without_retry";
  log.responseIdComponent = responseIdComponent;
  log.membershipQueries = { exact: methodA, allType26Count: methodBAllType26.length, navigation: methodCNavigation };
  log.completedAt = new Date().toISOString();
  await persist();

  const [viewAfter, allViewsAfter, fullFormAfter, originalFormAfter, originalViewAfter, businessRuleAfter, bpfAfter, opportunityAttributesAfter] = await Promise.all([
    get(`/api/data/v9.2/savedqueries(${VIEW_ID})?$select=${viewSelect}`),
    getAll(`/api/data/v9.2/savedqueries?$select=${viewSelect}&$filter=returnedtypecode eq '${TABLE}'`),
    get(`/api/data/v9.2/systemforms(${FULL_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,formxml,formjson,formpresentation,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/systemforms(${ORIGINAL_FORM_ID})?$select=formid,formxml,formjson,formpresentation`),
    get(`/api/data/v9.2/savedqueries(${ORIGINAL_VIEW_ID})?$select=savedqueryid,fetchxml,layoutxml,layoutjson`),
    get(`/api/data/v9.2/workflows(${BUSINESS_RULE_ID})?$select=workflowid,statecode,statuscode,clientdata,processtriggerformid,processtriggerscope`),
    get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,statecode,statuscode,clientdata,processorder`),
    getAll("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel"),
  ]);
  const protectedAfter = {
    opportunityAttributes: sha256(JSON.stringify(opportunityAttributesAfter)),
    fullReplicaFormXml: sha256(fullFormAfter.formxml), fullReplicaFormJson: sha256(fullFormAfter.formjson),
    originalFormXml: sha256(originalFormAfter.formxml), originalFormJson: sha256(originalFormAfter.formjson),
    originalView: sha256(JSON.stringify({ fetchxml: originalViewAfter.fetchxml, layoutxml: originalViewAfter.layoutxml, layoutjson: originalViewAfter.layoutjson })),
    businessRule: sha256(JSON.stringify({ statecode: businessRuleAfter.statecode, statuscode: businessRuleAfter.statuscode, clientdata: businessRuleAfter.clientdata, processtriggerformid: businessRuleAfter.processtriggerformid, processtriggerscope: businessRuleAfter.processtriggerscope })),
    bpf: sha256(JSON.stringify({ statecode: bpfAfter.statecode, statuscode: bpfAfter.statuscode, clientdata: bpfAfter.clientdata, processorder: bpfAfter.processorder })),
  };
  const protectedUnchanged = Object.fromEntries(Object.keys(protectedBefore).map((key) => [key, protectedBefore[key] === protectedAfter[key]]));
  const platformViewsAfter = new Map(allViewsAfter.filter((item) => normalizeId(item.savedqueryid) !== VIEW_ID).map((item) => [normalizeId(item.savedqueryid), viewHash(item)]));
  const platformViewsUnchanged = Object.entries(platformViewsBefore).every(([id, hash]) => platformViewsAfter.get(id) === hash);
  let recordCount = null;
  try { recordCount = (await get(`/api/data/v9.2/${entity.EntitySetName}?$select=aigw_actualmanagementid&$top=1`)).value?.length || 0; } catch {}
  const after = { generatedAt: new Date().toISOString(), classification: log.status, response: log.response, responseIdComponent, membership: { exact: methodA, allType26Count: methodBAllType26.length, navigation: methodCNavigation }, view: { hashBefore: before.view.hash, hashAfter: viewHash(viewAfter), hashUnchanged: before.view.hash === viewHash(viewAfter), definitionMismatches: compareViewDefinition(viewAfter, entity.ObjectTypeCode) }, platformViews: { beforeCount: Object.keys(platformViewsBefore).length, afterCount: platformViewsAfter.size, unchanged: platformViewsUnchanged }, protectedHashesBefore: protectedBefore, protectedHashesAfter: protectedAfter, protectedUnchanged, businessRuleDraftInactive: businessRuleAfter.statecode === 0 && businessRuleAfter.statuscode === 1, bpfDraftInactive: bpfAfter.statecode === 0 && bpfAfter.statuscode === 1, fullReplicaFormInactiveNonDefault: fullFormAfter.formactivationstate === 0 && fullFormAfter.isdefault === false, actualRecordCount: recordCount, publishExecuted: false, aiProvider: process.env.AI_PROVIDER || "demo", allowExternalAi: (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() === "true" };
  after.pass = ["created", "added_after_post_error", "alreadyExistsAndValid"].includes(log.status) && methodA.length === 1 && methodCNavigation.length === 1 && after.view.hashUnchanged && !after.view.definitionMismatches.length && platformViewsUnchanged && Object.values(protectedUnchanged).every(Boolean) && after.businessRuleDraftInactive && after.bpfDraftInactive && after.fullReplicaFormInactiveNonDefault && (recordCount === 0 || recordCount === null);
  const rollback = { automaticRollbackExecuted: false, solutionComponentId: membership?.solutioncomponentid || null, savedQueryId: VIEW_ID, deletionAuthorized: false, note: "Removing membership or deleting the View requires separate authorization. No automatic rollback is allowed." };
  await Promise.all([fs.writeFile(path.join(backupDir, "03_after_snapshot.json"), `${JSON.stringify(after, null, 2)}\n`), fs.writeFile(path.join(backupDir, "04_rollback_manifest.json"), `${JSON.stringify(rollback, null, 2)}\n`)]);
  console.log(JSON.stringify({ status: after.pass ? "success" : log.status, classification: log.status, response: log.response, responseIdComponent, solutionComponentId: membership?.solutioncomponentid || null, membershipQueries: { exactCount: methodA.length, allType26Count: methodBAllType26.length, navigationCount: methodCNavigation.length }, viewHashBefore: after.view.hashBefore, viewHashAfter: after.view.hashAfter, platformViews: after.platformViews, protectedUnchanged, publishExecuted: false, backupDir: path.relative(root, backupDir) }, null, 2));
  if (!after.pass) process.exitCode = 1;
}


runDataverseCli(import.meta.url, main);
