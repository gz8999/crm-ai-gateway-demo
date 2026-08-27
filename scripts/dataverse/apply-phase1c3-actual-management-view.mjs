import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";
import { compareLookup, compareRelationship } from "./lib/phase1c2-reconciliation.mjs";
import { compareViewDefinition, createViewWithReadback, parseFetchXml, parseLayoutXml, phase1c3ExpectedColumns, phase1c3ExpectedWidths } from "./lib/phase1c3-view-reconciliation.mjs";

let URL;
const SOLUTION = "CRMAIGatewayDemo";
const TARGET = "aigw_actualmanagement";
const VIEW_NAME = "实绩管理 - AI Demo";
const DEMO_ONLY_VIEW_NAME = "实绩管理 - AI Demo Only";
const MANIFEST_PATH = "docs/d365/phase1c-3-view-manifest.json";
const FETCH_PATH = "docs/d365/phase1c0-actual-management-view-fetchxml-draft.xml";
const LAYOUT_PATH = "docs/d365/phase1c0-actual-management-view-layoutxml-draft.xml";
const AUTHORIZATION = "CONFIRM_D365_TEST_WRITE_PHASE_1C_3_VIEW";
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
  const client = createDynamicsClient({ env: { ...process.env, DATAVERSE_TIMEOUT_MS: process.env.PHASE1C_VIEW_TIMEOUT_MS || "60000" } });
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
  const readTargetViews = async () => (await getAll(`/api/data/v9.2/savedqueries?$select=${viewSelect}&$filter=returnedtypecode eq '${TARGET}'`)).filter((view) => view.name === VIEW_NAME);

  if (client.config.dataverseUrl !== URL) throw new Error("Safety gate failed: Dataverse URL mismatch.");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: AI must remain demo/disabled.");

  const [manifestText, fetchXml, layoutDraft] = await Promise.all([
    fs.readFile(path.join(root, MANIFEST_PATH), "utf8"),
    fs.readFile(path.join(root, FETCH_PATH), "utf8"),
    fs.readFile(path.join(root, LAYOUT_PATH), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  const requests = manifest?.writes?.webApiDryRun?.requests || [];
  const request = requests[0];
  const manifestValid = manifest.phase === "1C-3"
    && manifest.authorizationPhrase === AUTHORIZATION
    && manifest.targetEnvironment === URL
    && manifest.solution === SOLUTION
    && requests.length === 1
    && request.method === "POST"
    && request.endpoint === "/api/data/v9.2/savedqueries"
    && request.payload?.name === VIEW_NAME
    && request.payload?.returnedtypecode === TARGET
    && request.payload?.querytype === 0
    && request.payload?.isquickfindquery === false
    && request.payload?.fetchxml === fetchXml
    && request.payload?.layoutxml === layoutDraft
    && manifest.writes.webApiDryRun.headers?.["MSCRM.SolutionUniqueName"] === SOLUTION
    && !JSON.stringify(request).includes("PublishXml")
    && !JSON.stringify(request).includes("systemform")
    && !JSON.stringify(request).includes("Subgrid");
  if (!manifestValid) throw new Error("Safety gate failed: Phase 1C-3 manifest/files mismatch.");

  const [entity, attributes, relationships, solutions, allViewsBefore, fullForm, originalForm, originalView, businessRule, bpf, opportunityAttributes] = await Promise.all([
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')?$select=MetadataId,LogicalName,SchemaName,OwnershipType,IsManaged,PrimaryNameAttribute,EntitySetName,ObjectTypeCode`),
    getAll(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel`),
    getAll(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')/ManyToOneRelationships?$select=MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,IsManaged,CascadeConfiguration`),
    get(`/api/data/v9.2/solutions?$select=solutionid,uniquename,friendlyname,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
    getAll(`/api/data/v9.2/savedqueries?$select=${viewSelect}&$filter=returnedtypecode eq '${TARGET}'`),
    get(`/api/data/v9.2/systemforms(${FULL_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,formxml,formjson,formpresentation,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/systemforms(${ORIGINAL_FORM_ID})?$select=formid,formxml,formjson,formpresentation`),
    get(`/api/data/v9.2/savedqueries(${ORIGINAL_VIEW_ID})?$select=savedqueryid,fetchxml,layoutxml,layoutjson`),
    get(`/api/data/v9.2/workflows(${BUSINESS_RULE_ID})?$select=workflowid,statecode,statuscode,clientdata,processtriggerformid,processtriggerscope`),
    get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,statecode,statuscode,clientdata,processorder`),
    getAll("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel"),
  ]);
  const solution = solutions.value?.[0];
  if (!solution || solution.friendlyname !== "CRM AI Gateway Demo" || solution.ismanaged !== false) throw new Error("Safety gate failed: solution mismatch.");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Safety gate failed: publisher prefix mismatch.");
  const componentsBefore = await getAll(`/api/data/v9.2/solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ${solution.solutionid}`);
  const tableInSolution = componentsBefore.some((item) => normalizeId(item.objectid) === normalizeId(entity.MetadataId) && item.componenttype === 1);
  if (entity.LogicalName !== TARGET || entity.OwnershipType !== "OrganizationOwned" || entity.IsManaged !== false || entity.PrimaryNameAttribute !== "aigw_name" || !tableInSolution) throw new Error("Safety gate failed: target table mismatch.");
  const attributeMap = new Map(attributes.map((attribute) => [attribute.LogicalName, attribute]));
  const requiredBusinessFields = ["aigw_name", "aigw_opportunityid", "aigw_expectedorderdate", "aigw_annualactualrevenue", ...["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"].flatMap((month) => [`aigw_${month}actualrevenue`, `aigw_${month}actualgp`, `aigw_${month}actualmp`])];
  if (requiredBusinessFields.length !== 40 || requiredBusinessFields.some((name) => !attributeMap.has(name)) || !attributeMap.has("aigw_annualactualrevenue_base")) throw new Error("Safety gate failed: 40 business fields or annual base field missing.");
  const lookup = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')/Attributes(LogicalName='aigw_opportunityid')/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel,DisplayName,Targets`);
  const relationship = relationships.find((item) => item.SchemaName?.toLowerCase() === "aigw_opportunity_actualmanagement");
  if (compareLookup(lookup).length || compareRelationship(relationship).length) throw new Error("Safety gate failed: C2 lookup/relationship mismatch.");

  const fetch = parseFetchXml(fetchXml);
  const layoutXml = layoutDraft.replace("{ACTUAL_MANAGEMENT_OBJECT_TYPE_CODE}", String(entity.ObjectTypeCode));
  if (layoutXml.includes("{ACTUAL_MANAGEMENT_OBJECT_TYPE_CODE}")) throw new Error("Safety gate failed: LayoutXML object placeholder unresolved.");
  const layout = parseLayoutXml(layoutXml);
  const structureValid = fetch.entity === TARGET
    && JSON.stringify(fetch.attributes) === JSON.stringify(phase1c3ExpectedColumns)
    && !fetch.hasFilter
    && !fetch.hasLinkEntity
    && fetch.order.attribute === "modifiedon"
    && fetch.order.descending === "true"
    && layout.objectTypeCode === entity.ObjectTypeCode
    && layout.jump === "aigw_name"
    && JSON.stringify(layout.cells.map((cell) => cell.name)) === JSON.stringify(phase1c3ExpectedColumns)
    && JSON.stringify(layout.cells.map((cell) => cell.width)) === JSON.stringify(phase1c3ExpectedWidths)
    && phase1c3ExpectedColumns.every((name) => attributeMap.has(name));
  if (!structureValid) throw new Error(`Safety gate failed: View XML structure mismatch: ${JSON.stringify({ fetch, layout })}`);

  const targetViewsBefore = allViewsBefore.filter((view) => view.name === VIEW_NAME);
  if (targetViewsBefore.length > 1) throw new Error("Safety gate failed: duplicate target View names.");
  if (targetViewsBefore.length === 1) {
    const mismatches = compareViewDefinition(targetViewsBefore[0], entity.ObjectTypeCode);
    if (mismatches.length) throw new Error(`Safety gate failed: existing target View differs: ${mismatches.join(",")}`);
  }
  if (allViewsBefore.some((view) => view.name === DEMO_ONLY_VIEW_NAME)) throw new Error("Safety gate failed: deferred Demo-only View unexpectedly exists.");
  if (fullForm.formactivationstate !== 0 || fullForm.isdefault !== false || businessRule.statecode !== 0 || businessRule.statuscode !== 1 || bpf.statecode !== 0 || bpf.statuscode !== 1) throw new Error("Safety gate failed: protected draft state mismatch.");
  const existingViewHashes = Object.fromEntries(allViewsBefore.map((view) => [normalizeId(view.savedqueryid), viewHash(view)]));
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
  let recordProbeBefore = { accessible: false, count: null };
  try {
    const rows = await get(`/api/data/v9.2/${entity.EntitySetName}?$select=aigw_actualmanagementid&$top=1`);
    recordProbeBefore = { accessible: true, count: rows.value?.length || 0 };
  } catch (error) {
    recordProbeBefore.error = error.message;
  }
  if (recordProbeBefore.accessible && recordProbeBefore.count !== 0) throw new Error("Safety gate failed: actual records exist.");

  const payload = { ...request.payload, fetchxml: fetchXml, layoutxml: layoutXml };
  const backupDir = path.join(root, "backups", "dataverse", `phase1c3_actual_management_view_${stamp()}`);
  await fs.mkdir(backupDir, { recursive: true });
  const beforeSnapshot = { generatedAt: new Date().toISOString(), confirmed, entity, businessFieldCount: 40, lookupMetadataId: lookup.MetadataId, relationshipMetadataId: relationship.MetadataId, targetViewCount: targetViewsBefore.length, platformViewCount: allViewsBefore.length, existingViewHashes, recordProbe: recordProbeBefore, viewDefinition: { fetch, layout }, manifest: { path: MANIFEST_PATH, sha256: sha256(manifestText), requestCount: 1 }, protectedHashes: protectedBefore, publishExecuted: false };
  await Promise.all([
    fs.writeFile(path.join(backupDir, "00_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    fs.writeFile(path.join(backupDir, "01_before_snapshot.json"), `${JSON.stringify(beforeSnapshot, null, 2)}\n`),
    fs.writeFile(path.join(backupDir, "02_effective_fetchxml.xml"), fetchXml),
    fs.writeFile(path.join(backupDir, "03_effective_layoutxml.xml"), layoutXml),
  ]);
  if (!confirmed) {
    console.log(JSON.stringify({ status: "dry-run", backupDir: path.relative(root, backupDir), targetViewExists: targetViewsBefore.length === 1, objectTypeCode: entity.ObjectTypeCode, columns: phase1c3ExpectedColumns, widths: phase1c3ExpectedWidths }, null, 2));
    return;
  }

  const log = { startedAt: new Date().toISOString(), authorization: AUTHORIZATION, status: "pending", postRetried: false, publishExecuted: false };
  const logPath = path.join(backupDir, "04_write_log.json");
  const persist = () => fs.writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`);
  await persist();
  let result;
  if (targetViewsBefore.length === 1) {
    result = { status: "alreadyExistsAndValid", view: targetViewsBefore[0], pollAttemptsUsed: 0, postRetried: false };
  } else {
    try {
      result = await createViewWithReadback({
        postView: () => client.dataversePost(request.endpoint, payload, { headers: { "MSCRM.SolutionUniqueName": SOLUTION } }),
        readViews: readTargetViews,
        objectTypeCode: entity.ObjectTypeCode,
        sleep,
        pollAttempts: 8,
        pollIntervalMs: 1500,
      });
    } catch (error) {
      log.status = error.code || "failed";
      log.error = error.message;
      log.postRetried = false;
      log.completedAt = new Date().toISOString();
      await persist();
      throw error;
    }
  }
  log.status = result.status;
  log.savedqueryid = result.view.savedqueryid;
  log.postError = result.postError || null;
  log.pollAttemptsUsed = result.pollAttemptsUsed;
  log.completedAt = new Date().toISOString();
  await persist();

  const savedQueryId = normalizeId(result.view.savedqueryid);
  const [viewAfter, allViewsAfter, componentsAfter, fullFormAfter, originalFormAfter, originalViewAfter, businessRuleAfter, bpfAfter, opportunityAttributesAfter, fetchExecution, savedQueryExecution] = await Promise.all([
    get(`/api/data/v9.2/savedqueries(${savedQueryId})?$select=${viewSelect}`),
    getAll(`/api/data/v9.2/savedqueries?$select=${viewSelect}&$filter=returnedtypecode eq '${TARGET}'`),
    getAll(`/api/data/v9.2/solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ${solution.solutionid}`),
    get(`/api/data/v9.2/systemforms(${FULL_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,formxml,formjson,formpresentation,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/systemforms(${ORIGINAL_FORM_ID})?$select=formid,formxml,formjson,formpresentation`),
    get(`/api/data/v9.2/savedqueries(${ORIGINAL_VIEW_ID})?$select=savedqueryid,fetchxml,layoutxml,layoutjson`),
    get(`/api/data/v9.2/workflows(${BUSINESS_RULE_ID})?$select=workflowid,statecode,statuscode,clientdata,processtriggerformid,processtriggerscope`),
    get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,statecode,statuscode,clientdata,processorder`),
    getAll("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel"),
    get(`/api/data/v9.2/${entity.EntitySetName}?fetchXml=${encodeURIComponent(fetchXml)}`),
    get(`/api/data/v9.2/${entity.EntitySetName}?savedQuery=${savedQueryId}`),
  ]);
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
  const existingViewsAfterMap = new Map(allViewsAfter.filter((view) => normalizeId(view.savedqueryid) !== savedQueryId).map((view) => [normalizeId(view.savedqueryid), viewHash(view)]));
  const existingViewsUnchanged = Object.entries(existingViewHashes).every(([id, hash]) => existingViewsAfterMap.get(id) === hash);
  const componentSet = new Set(componentsAfter.map((item) => `${normalizeId(item.objectid)}:${item.componenttype}`));
  const definitionMismatches = compareViewDefinition(viewAfter, entity.ObjectTypeCode);
  const verification = {
    generatedAt: new Date().toISOString(),
    savedQuery: viewAfter,
    definitionMismatches,
    structure: { fetch: parseFetchXml(viewAfter.fetchxml), layout: parseLayoutXml(viewAfter.layoutxml) },
    state: { active: viewAfter.statecode === 0 && viewAfter.statuscode === 1, unmanaged: viewAfter.ismanaged === false },
    solutionMembership: componentSet.has(`${savedQueryId}:26`),
    queryExecution: { fetchXmlSucceeded: Array.isArray(fetchExecution.value), savedQuerySucceeded: Array.isArray(savedQueryExecution.value), fetchXmlResultCount: fetchExecution.value?.length || 0, savedQueryResultCount: savedQueryExecution.value?.length || 0 },
    existingPlatformViews: { beforeCount: allViewsBefore.length, afterExcludingNewCount: allViewsAfter.filter((view) => normalizeId(view.savedqueryid) !== savedQueryId).length, unchanged: existingViewsUnchanged },
    forbidden: { demoOnlyViewExists: allViewsAfter.some((view) => view.name === DEMO_ONLY_VIEW_NAME), subgridAdded: protectedBefore.fullReplicaFormXml !== protectedAfter.fullReplicaFormXml, actualRecordCount: savedQueryExecution.value?.length || 0 },
    protectedHashesBefore: protectedBefore,
    protectedHashesAfter: protectedAfter,
    protectedUnchanged,
    businessRuleDraftInactive: businessRuleAfter.statecode === 0 && businessRuleAfter.statuscode === 1,
    bpfDraftInactive: bpfAfter.statecode === 0 && bpfAfter.statuscode === 1,
    publishExecuted: false,
    aiProvider: process.env.AI_PROVIDER || "demo",
    allowExternalAi: (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() === "true",
  };
  verification.pass = !definitionMismatches.length
    && verification.state.active
    && verification.state.unmanaged
    && verification.solutionMembership
    && verification.queryExecution.fetchXmlSucceeded
    && verification.queryExecution.savedQuerySucceeded
    && verification.existingPlatformViews.unchanged
    && !verification.forbidden.demoOnlyViewExists
    && !verification.forbidden.subgridAdded
    && verification.forbidden.actualRecordCount === 0
    && Object.values(protectedUnchanged).every(Boolean)
    && verification.businessRuleDraftInactive
    && verification.bpfDraftInactive;
  const rollback = { automaticRollbackExecuted: false, savedQueryId, deletionAuthorized: false, endpoint: `/api/data/v9.2/savedqueries(${savedQueryId})`, warning: "Physical deletion requires separate authorization. Do not modify the seven pre-existing platform Views or any Form/App metadata." };
  await Promise.all([
    fs.writeFile(path.join(backupDir, "05_after_snapshot.json"), `${JSON.stringify(verification, null, 2)}\n`),
    fs.writeFile(path.join(backupDir, "06_rollback_manifest.json"), `${JSON.stringify(rollback, null, 2)}\n`),
  ]);
  console.log(JSON.stringify({ status: verification.pass ? "success" : "verification_failed", result: log.status, savedQueryId, state: verification.state, solutionMembership: verification.solutionMembership, definitionMismatches, queryExecution: verification.queryExecution, existingPlatformViews: verification.existingPlatformViews, protectedUnchanged, businessRuleDraftInactive: verification.businessRuleDraftInactive, bpfDraftInactive: verification.bpfDraftInactive, publishExecuted: false, backupDir: path.relative(root, backupDir) }, null, 2));
  if (!verification.pass) process.exitCode = 1;
}


runDataverseCli(import.meta.url, main);
