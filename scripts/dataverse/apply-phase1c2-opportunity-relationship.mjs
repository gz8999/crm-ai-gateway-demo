import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";
import { reconcileAttributes } from "./lib/phase1c1-reconciliation.mjs";
import { compareLookup, compareRelationship, createAtomicRelationshipWithReadback } from "./lib/phase1c2-reconciliation.mjs";

let URL;
const SOLUTION = "CRMAIGatewayDemo";
const TARGET = "aigw_actualmanagement";
const LOOKUP = "aigw_opportunityid";
const RELATIONSHIP = "aigw_opportunity_actualmanagement";
const MANIFEST_PATH = "docs/d365/phase1c-2-relationship-manifest.json";
const FIELD_MANIFEST_PATH = "docs/d365/phase1c-1r-missing-fields-resume-manifest.json";
const AUTHORIZATION = "CONFIRM_D365_TEST_WRITE_PHASE_1C_2_RELATIONSHIP";
let FULL_FORM_ID;
let ORIGINAL_FORM_ID;
let ORIGINAL_VIEW_ID;
let BUSINESS_RULE_ID;
let BPF_ID;
const ATTRIBUTE_ENDPOINT = `/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')/Attributes`;

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const normalizeId = (value) => String(value || "").replace(/[{}]/g, "").toLowerCase();

function castFor(request) {
  return String(request.payload["@odata.type"]).endsWith("MoneyAttributeMetadata") ? "MoneyAttributeMetadata" : "DateTimeAttributeMetadata";
}

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
  const client = createDynamicsClient({ env: { ...process.env, DATAVERSE_TIMEOUT_MS: process.env.PHASE1C_RELATIONSHIP_TIMEOUT_MS || "60000" } });
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
  const readLookup = async () => {
    const matches = await getAll(`${ATTRIBUTE_ENDPOINT}?$select=LogicalName&$filter=LogicalName eq '${LOOKUP}'`);
    if (!matches.length) return null;
    return get(`${ATTRIBUTE_ENDPOINT}(LogicalName='${LOOKUP}')/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel,DisplayName,Targets`);
  };
  const readRelationships = () => getAll(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')/ManyToOneRelationships?$select=MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,IsManaged,CascadeConfiguration`);
  const readRelationship = async () => (await readRelationships()).find((item) => item.SchemaName?.toLowerCase() === RELATIONSHIP) || null;

  if (client.config.dataverseUrl !== URL) throw new Error("Safety gate failed: Dataverse URL mismatch.");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: AI must remain demo/disabled.");

  const manifestText = await fs.readFile(path.join(root, MANIFEST_PATH), "utf8");
  const manifest = JSON.parse(manifestText);
  const requests = manifest?.writes?.webApiDryRun?.requests || [];
  const request = requests[0];
  const payloadText = JSON.stringify(request?.payload || {});
  const manifestValid = manifest.phase === "1C-2"
    && manifest.authorizationPhrase === AUTHORIZATION
    && manifest.targetEnvironment === URL
    && manifest.solution === SOLUTION
    && manifest.writes?.atomicWrite === true
    && requests.length === 1
    && request.method === "POST"
    && request.endpoint === "/api/data/v9.2/RelationshipDefinitions"
    && request.payload?.["@odata.type"] === "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
    && request.payload?.SchemaName === RELATIONSHIP
    && request.payload?.ReferencedEntity === "opportunity"
    && request.payload?.ReferencingEntity === TARGET
    && request.payload?.Lookup?.["@odata.type"] === "Microsoft.Dynamics.CRM.LookupAttributeMetadata"
    && request.payload?.Lookup?.SchemaName === "aigw_OpportunityId"
    && request.payload?.Lookup?.RequiredLevel?.Value === "ApplicationRequired"
    && !payloadText.includes("PublishXml")
    && !payloadText.includes("savedquery")
    && !payloadText.includes("systemform");
  if (!manifestValid) throw new Error("Safety gate failed: Phase 1C-2 manifest mismatch.");

  const fieldManifest = JSON.parse(await fs.readFile(path.join(root, FIELD_MANIFEST_PATH), "utf8"));
  const fieldRequests = fieldManifest.writes.webApiDryRun.requests;
  if (fieldRequests.length !== 38) throw new Error("Safety gate failed: expected 38 Phase 1C-1 field definitions.");
  const [entity, genericAttributes, relationshipsBefore, solutions, fullForm, originalForm, originalView, businessRule, bpf, opportunityAttributes, views] = await Promise.all([
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')?$select=MetadataId,LogicalName,SchemaName,OwnershipType,IsManaged,PrimaryNameAttribute,EntitySetName,ObjectTypeCode`),
    getAll(`${ATTRIBUTE_ENDPOINT}?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel`),
    readRelationships(),
    get(`/api/data/v9.2/solutions?$select=solutionid,uniquename,friendlyname,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
    get(`/api/data/v9.2/systemforms(${FULL_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,formxml,formjson,formpresentation,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/systemforms(${ORIGINAL_FORM_ID})?$select=formid,formxml,formjson,formpresentation`),
    get(`/api/data/v9.2/savedqueries(${ORIGINAL_VIEW_ID})?$select=savedqueryid,fetchxml,layoutxml,layoutjson`),
    get(`/api/data/v9.2/workflows(${BUSINESS_RULE_ID})?$select=workflowid,statecode,statuscode,clientdata,processtriggerformid,processtriggerscope`),
    get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,statecode,statuscode,clientdata,processorder`),
    getAll("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel"),
    getAll(`/api/data/v9.2/savedqueries?$select=savedqueryid,name,returnedtypecode,statecode,ismanaged&$filter=returnedtypecode eq '${TARGET}'`),
  ]);
  const solution = solutions.value?.[0];
  if (!solution || solution.friendlyname !== "CRM AI Gateway Demo" || solution.ismanaged !== false) throw new Error("Safety gate failed: solution mismatch.");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Safety gate failed: publisher prefix mismatch.");
  const componentsBefore = await getAll(`/api/data/v9.2/solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ${solution.solutionid}`);
  const tableInSolution = componentsBefore.some((item) => normalizeId(item.objectid) === normalizeId(entity.MetadataId) && item.componenttype === 1);
  if (entity.LogicalName !== TARGET || entity.SchemaName !== "aigw_ActualManagement" || entity.OwnershipType !== "OrganizationOwned" || entity.IsManaged !== false || entity.PrimaryNameAttribute !== "aigw_name" || !tableInSolution) throw new Error("Safety gate failed: table definition or solution membership mismatch.");

  const genericMap = new Map(genericAttributes.map((item) => [item.LogicalName, item]));
  const detailedMap = new Map();
  for (const fieldRequest of fieldRequests) {
    if (!genericMap.has(fieldRequest.logicalName)) continue;
    const cast = castFor(fieldRequest);
    const select = cast === "MoneyAttributeMetadata" ? "MetadataId,LogicalName,SchemaName,AttributeType,Precision,PrecisionSource,MinValue,MaxValue,IsBaseCurrency,RequiredLevel,DisplayName" : "MetadataId,LogicalName,SchemaName,AttributeType,Format,RequiredLevel,DisplayName";
    detailedMap.set(fieldRequest.logicalName, await get(`${ATTRIBUTE_ENDPOINT}(LogicalName='${fieldRequest.logicalName}')/Microsoft.Dynamics.CRM.${cast}?$select=${select}`));
  }
  const fields = reconcileAttributes(fieldRequests, detailedMap);
  if (fields.alreadyExistsAndValid.length !== 38 || fields.missing.length || fields.existsButMismatch.length || !genericMap.has("aigw_name")) throw new Error("Safety gate failed: Phase 1C-1 fields are not fully valid.");

  const lookupBefore = await readLookup();
  const relationshipBefore = relationshipsBefore.find((item) => item.SchemaName?.toLowerCase() === RELATIONSHIP) || null;
  const sameTablePair = relationshipsBefore.filter((item) => item.ReferencedEntity === "opportunity" && item.ReferencingEntity === TARGET);
  if ((lookupBefore && !relationshipBefore) || (!lookupBefore && relationshipBefore)) throw new Error("Safety gate failed: pre-existing partial lookup/relationship state.");
  if (lookupBefore && relationshipBefore) {
    const lookupMismatches = compareLookup(lookupBefore);
    const relationshipMismatches = compareRelationship(relationshipBefore);
    if (lookupMismatches.length || relationshipMismatches.length) throw new Error(`Safety gate failed: existing C2 metadata mismatch: ${JSON.stringify({ lookupMismatches, relationshipMismatches })}`);
  }
  if (!relationshipBefore && sameTablePair.length) throw new Error(`Safety gate failed: duplicate opportunity relationship pair exists: ${JSON.stringify(sameTablePair)}`);
  if (fullForm.formactivationstate !== 0 || fullForm.isdefault !== false || businessRule.statecode !== 0 || businessRule.statuscode !== 1 || bpf.statecode !== 0 || bpf.statuscode !== 1) throw new Error("Safety gate failed: protected draft/inactive state mismatch.");

  let recordProbeBefore = { accessible: false, count: null };
  try {
    const rows = await get(`/api/data/v9.2/${entity.EntitySetName}?$select=aigw_actualmanagementid&$top=1`);
    recordProbeBefore = { accessible: true, count: rows.value?.length || 0 };
  } catch (error) {
    recordProbeBefore.error = error.message;
  }
  if (recordProbeBefore.accessible && recordProbeBefore.count !== 0) throw new Error("Safety gate failed: actual management records already exist.");
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
  const backupDir = path.join(root, "backups", "dataverse", `phase1c2_opportunity_relationship_${stamp()}`);
  await fs.mkdir(backupDir, { recursive: true });
  const beforeSnapshot = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    confirmed,
    entity,
    businessFieldCount: 39,
    lookupExists: Boolean(lookupBefore),
    relationshipExists: Boolean(relationshipBefore),
    duplicateRelationshipPairCount: sameTablePair.length,
    recordProbe: recordProbeBefore,
    customViewExists: views.some((view) => view.name === "实绩管理 - AI Demo"),
    solution: { id: solution.solutionid, unmanaged: !solution.ismanaged, publisherPrefix: publisher.customizationprefix, tableInSolution },
    protectedHashes: protectedBefore,
    manifest: { path: MANIFEST_PATH, sha256: sha256(manifestText), requestCount: 1 },
    publishExecuted: false,
  };
  await Promise.all([
    fs.writeFile(path.join(backupDir, "00_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    fs.writeFile(path.join(backupDir, "01_before_snapshot.json"), `${JSON.stringify(beforeSnapshot, null, 2)}\n`),
  ]);
  if (!confirmed) {
    console.log(JSON.stringify({ status: "dry-run", backupDir: path.relative(root, backupDir), beforeSnapshot }, null, 2));
    return;
  }

  const log = { startedAt: new Date().toISOString(), authorization: AUTHORIZATION, status: "pending", postRetried: false, publishExecuted: false };
  const logPath = path.join(backupDir, "02_write_log.json");
  const persist = () => fs.writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`);
  await persist();
  let result;
  if (lookupBefore && relationshipBefore) {
    result = { status: "skippedAlreadyValid", lookup: lookupBefore, relationship: relationshipBefore, postRetried: false, pollAttemptsUsed: 0 };
  } else {
    try {
      result = await createAtomicRelationshipWithReadback({
        postRelationship: () => client.dataversePost(request.endpoint, request.payload, { headers: { "MSCRM.SolutionUniqueName": SOLUTION } }),
        readLookup,
        readRelationship,
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
  log.lookupMetadataId = result.lookup.MetadataId;
  log.relationshipMetadataId = result.relationship.MetadataId;
  log.postError = result.postError || null;
  log.pollAttemptsUsed = result.pollAttemptsUsed;
  log.completedAt = new Date().toISOString();
  await persist();

  const [lookupAfter, relationshipAfter, attributesAfter, relationshipsAfter, componentsAfter, fullFormAfter, originalFormAfter, originalViewAfter, businessRuleAfter, bpfAfter, opportunityAttributesAfter, viewsAfter] = await Promise.all([
    readLookup(),
    readRelationship(),
    getAll(`${ATTRIBUTE_ENDPOINT}?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel`),
    readRelationships(),
    getAll(`/api/data/v9.2/solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ${solution.solutionid}`),
    get(`/api/data/v9.2/systemforms(${FULL_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,formxml,formjson,formpresentation,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/systemforms(${ORIGINAL_FORM_ID})?$select=formid,formxml,formjson,formpresentation`),
    get(`/api/data/v9.2/savedqueries(${ORIGINAL_VIEW_ID})?$select=savedqueryid,fetchxml,layoutxml,layoutjson`),
    get(`/api/data/v9.2/workflows(${BUSINESS_RULE_ID})?$select=workflowid,statecode,statuscode,clientdata,processtriggerformid,processtriggerscope`),
    get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,statecode,statuscode,clientdata,processorder`),
    getAll("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel"),
    getAll(`/api/data/v9.2/savedqueries?$select=savedqueryid,name,returnedtypecode,statecode,ismanaged&$filter=returnedtypecode eq '${TARGET}'`),
  ]);
  const lookupMismatches = compareLookup(lookupAfter);
  const relationshipMismatches = compareRelationship(relationshipAfter);
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
  const componentSet = new Set(componentsAfter.map((item) => `${normalizeId(item.objectid)}:${item.componenttype}`));
  const directMembership = { lookup: componentSet.has(`${normalizeId(lookupAfter.MetadataId)}:2`), relationship: componentSet.has(`${normalizeId(relationshipAfter.MetadataId)}:10`) };
  let recordProbeAfter = { accessible: false, count: null };
  try {
    const rows = await get(`/api/data/v9.2/${entity.EntitySetName}?$select=aigw_actualmanagementid&$top=1`);
    recordProbeAfter = { accessible: true, count: rows.value?.length || 0 };
  } catch (error) {
    recordProbeAfter.error = error.message;
  }
  const businessNames = ["aigw_name", ...fieldRequests.map((item) => item.logicalName), LOOKUP];
  const attributeMapAfter = new Map(attributesAfter.map((item) => [item.LogicalName, item]));
  const verification = {
    generatedAt: new Date().toISOString(),
    lookup: lookupAfter,
    relationship: relationshipAfter,
    lookupMismatches,
    relationshipMismatches,
    cascade: relationshipAfter.CascadeConfiguration,
    businessFieldCount: businessNames.filter((name) => attributeMapAfter.has(name)).length,
    targetRelationshipCount: relationshipsAfter.filter((item) => item.SchemaName?.toLowerCase() === RELATIONSHIP).length,
    solutionMembership: { table: componentSet.has(`${normalizeId(entity.MetadataId)}:1`), direct: directMembership, carriedByTableSubcomponents: !directMembership.lookup || !directMembership.relationship },
    forbidden: { customViewExists: viewsAfter.some((view) => view.name === "实绩管理 - AI Demo"), recordProbe: recordProbeAfter },
    protectedHashesBefore: protectedBefore,
    protectedHashesAfter: protectedAfter,
    protectedUnchanged,
    businessRuleDraftInactive: businessRuleAfter.statecode === 0 && businessRuleAfter.statuscode === 1,
    bpfDraftInactive: bpfAfter.statecode === 0 && bpfAfter.statuscode === 1,
    fullReplicaFormInactiveNonDefault: fullFormAfter.formactivationstate === 0 && fullFormAfter.isdefault === false,
    publishExecuted: false,
    aiProvider: process.env.AI_PROVIDER || "demo",
    allowExternalAi: (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() === "true",
  };
  verification.pass = !lookupMismatches.length
    && !relationshipMismatches.length
    && verification.businessFieldCount === 40
    && verification.targetRelationshipCount === 1
    && verification.solutionMembership.table
    && !verification.forbidden.customViewExists
    && (recordProbeAfter.count === 0 || !recordProbeAfter.accessible)
    && Object.values(protectedUnchanged).every(Boolean)
    && verification.businessRuleDraftInactive
    && verification.bpfDraftInactive
    && verification.fullReplicaFormInactiveNonDefault;
  const rollback = {
    automaticRollbackExecuted: false,
    lookupMetadataId: lookupAfter.MetadataId,
    relationshipMetadataId: relationshipAfter.MetadataId,
    deletionAuthorized: false,
    warning: "Physical rollback requires separate authorization. Do not delete or patch either metadata object automatically; relationship/lookup rollback must account for their atomic dependency.",
  };
  await Promise.all([
    fs.writeFile(path.join(backupDir, "03_after_snapshot.json"), `${JSON.stringify(verification, null, 2)}\n`),
    fs.writeFile(path.join(backupDir, "04_rollback_manifest.json"), `${JSON.stringify(rollback, null, 2)}\n`),
  ]);
  console.log(JSON.stringify({ status: verification.pass ? "success" : "verification_failed", result: log.status, lookupMetadataId: lookupAfter.MetadataId, relationshipMetadataId: relationshipAfter.MetadataId, cascade: verification.cascade, solutionMembership: verification.solutionMembership, businessFieldCount: verification.businessFieldCount, protectedUnchanged, businessRuleDraftInactive: verification.businessRuleDraftInactive, bpfDraftInactive: verification.bpfDraftInactive, publishExecuted: false, backupDir: path.relative(root, backupDir) }, null, 2));
  if (!verification.pass) process.exitCode = 1;
}


runDataverseCli(import.meta.url, main);
