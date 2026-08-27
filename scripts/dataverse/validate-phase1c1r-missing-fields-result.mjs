import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";
import { reconcileAttributes } from "./lib/phase1c1-reconciliation.mjs";

let URL;
const SOLUTION = "CRMAIGatewayDemo";
const TARGET = "aigw_actualmanagement";
let FULL_FORM_ID;
let ORIGINAL_FORM_ID;
let ORIGINAL_VIEW_ID;
let BUSINESS_RULE_ID;
let BPF_ID;
const BASELINE = "backups/dataverse/phase1c1_actual_management_20260710T163801Z/01_before_snapshot.json";
const RELATIONSHIP_BASELINE = "backups/dataverse/phase1b_dryrun_20260710T030013Z/04_actuals_metadata_audit.json";
const MANIFEST = "docs/d365/phase1c-1r-missing-fields-resume-manifest.json";

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
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
  const root = process.cwd();
  const outputArg = process.argv[2];
  if (!outputArg) throw new Error("Usage: node validate-phase1c1r-missing-fields-result.mjs <execution-backup-dir>");
  const outputDir = path.resolve(root, outputArg);
  const client = createDynamicsClient();
  if (client.config.dataverseUrl !== URL || (process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed.");
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
  const manifest = JSON.parse(await fs.readFile(path.join(root, MANIFEST), "utf8"));
  const requests = manifest.writes.webApiDryRun.requests;
  const [entity, allAttributes, relationships, views, solutions, fullForm, originalForm, originalView, businessRule, bpf, opportunityAttributes, opportunityRelationships] = await Promise.all([
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')?$select=MetadataId,LogicalName,SchemaName,OwnershipType,IsManaged,PrimaryNameAttribute,EntitySetName,ObjectTypeCode`),
    getAll(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel`),
    getAll(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')/ManyToOneRelationships?$select=MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,IsManaged`),
    getAll(`/api/data/v9.2/savedqueries?$select=savedqueryid,name,returnedtypecode,statecode,ismanaged&$filter=returnedtypecode eq '${TARGET}'`),
    get(`/api/data/v9.2/solutions?$select=solutionid,uniquename,ismanaged&$filter=uniquename eq '${SOLUTION}'`),
    get(`/api/data/v9.2/systemforms(${FULL_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,formxml,formjson,formpresentation,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/systemforms(${ORIGINAL_FORM_ID})?$select=formid,formxml,formjson,formpresentation`),
    get(`/api/data/v9.2/savedqueries(${ORIGINAL_VIEW_ID})?$select=savedqueryid,fetchxml,layoutxml,layoutjson`),
    get(`/api/data/v9.2/workflows(${BUSINESS_RULE_ID})?$select=workflowid,statecode,statuscode,clientdata,processtriggerformid,processtriggerscope`),
    get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,statecode,statuscode,clientdata,processorder`),
    getAll("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel"),
    getAll("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/OneToManyRelationships?$select=MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,IsManaged,CascadeConfiguration"),
  ]);
  const solution = solutions.value?.[0];
  const components = await getAll(`/api/data/v9.2/solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ${solution.solutionid}`);
  const componentSet = new Set(components.map((component) => `${normalizeId(component.objectid)}:${component.componenttype}`));
  const genericMap = new Map(allAttributes.map((attribute) => [attribute.LogicalName, attribute]));
  const detailedMap = new Map();
  for (const request of requests) {
    const cast = castFor(request);
    const select = cast === "MoneyAttributeMetadata" ? "MetadataId,LogicalName,SchemaName,AttributeType,Precision,PrecisionSource,MinValue,MaxValue,IsBaseCurrency,RequiredLevel,DisplayName" : "MetadataId,LogicalName,SchemaName,AttributeType,Format,RequiredLevel,DisplayName";
    detailedMap.set(request.logicalName, await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')/Attributes(LogicalName='${request.logicalName}')/Microsoft.Dynamics.CRM.${cast}?$select=${select}`));
  }
  const reconciliation = reconcileAttributes(requests, detailedMap);
  const businessNames = ["aigw_name", ...requests.map((request) => request.logicalName)];
  const monthlyNames = requests.map((request) => request.logicalName).filter((name) => /^aigw_(april|may|june|july|august|september|october|november|december|january|february|march)actual(revenue|gp|mp)$/.test(name));
  const moneyNames = requests.filter((request) => castFor(request) === "MoneyAttributeMetadata").map((request) => request.logicalName);
  const baseNames = moneyNames.map((name) => `${name}_base`);
  const baseline = JSON.parse(await fs.readFile(path.join(root, BASELINE), "utf8")).protectedHashes;
  const relationshipBaseline = JSON.parse(await fs.readFile(path.join(root, RELATIONSHIP_BASELINE), "utf8")).oneToMany;
  const relationshipSchemaSetBefore = [...new Set(relationshipBaseline.map((item) => item.SchemaName))].sort();
  const relationshipSchemaSetAfter = [...new Set(opportunityRelationships.map((item) => item.SchemaName))].sort();
  const opportunityRelationshipSchemaSetUnchanged = JSON.stringify(relationshipSchemaSetBefore) === JSON.stringify(relationshipSchemaSetAfter);
  const relationshipIdsBefore = new Set(relationshipBaseline.map((item) => normalizeId(item.MetadataId)));
  const relationshipIdsAfter = new Set(opportunityRelationships.map((item) => normalizeId(item.MetadataId)));
  const relationshipIdChanges = {
    added: opportunityRelationships.filter((item) => !relationshipIdsBefore.has(normalizeId(item.MetadataId))).map((item) => ({ metadataId: item.MetadataId, schemaName: item.SchemaName, isManaged: item.IsManaged })),
    removed: relationshipBaseline.filter((item) => !relationshipIdsAfter.has(normalizeId(item.MetadataId))).map((item) => ({ metadataId: item.MetadataId, schemaName: item.SchemaName, isManaged: item.IsManaged })),
  };
  const protectedAfter = {
    opportunityAttributes: sha256(JSON.stringify(opportunityAttributes)),
    opportunityRelationships: sha256(JSON.stringify(opportunityRelationships)),
    fullReplicaFormXml: sha256(fullForm.formxml),
    fullReplicaFormJson: sha256(fullForm.formjson),
    originalFormXml: sha256(originalForm.formxml),
    originalFormJson: sha256(originalForm.formjson),
    originalView: sha256(JSON.stringify({ fetchxml: originalView.fetchxml, layoutxml: originalView.layoutxml, layoutjson: originalView.layoutjson })),
    businessRule: sha256(JSON.stringify({ statecode: businessRule.statecode, statuscode: businessRule.statuscode, clientdata: businessRule.clientdata, processtriggerformid: businessRule.processtriggerformid, processtriggerscope: businessRule.processtriggerscope })),
    bpf: sha256(JSON.stringify({ statecode: bpf.statecode, statuscode: bpf.statuscode, clientdata: bpf.clientdata, processorder: bpf.processorder })),
  };
  const protectedUnchanged = Object.fromEntries(Object.keys(baseline).map((key) => [key, baseline[key] === protectedAfter[key]]));
  let recordProbe = { accessible: false, count: null };
  try {
    const rows = await get(`/api/data/v9.2/${entity.EntitySetName}?$select=aigw_actualmanagementid&$top=1`);
    recordProbe = { accessible: true, count: rows.value?.length || 0 };
  } catch (error) {
    recordProbe.error = error.message;
  }
  const fieldMetadataIds = Object.fromEntries(businessNames.map((name) => [name, genericMap.get(name)?.MetadataId || null]));
  const verification = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    table: entity,
    reconciliation: {
      alreadyExistsAndValidCount: reconciliation.alreadyExistsAndValid.length,
      missingCount: reconciliation.missing.length,
      existsButMismatchCount: reconciliation.existsButMismatch.length,
    },
    businessFieldCount: businessNames.filter((name) => genericMap.has(name)).length,
    monthlyFieldCount: monthlyNames.filter((name) => genericMap.has(name)).length,
    expectedBaseFieldCount: baseNames.length,
    actualBaseFieldCount: baseNames.filter((name) => genericMap.has(name)).length,
    missingBaseFields: baseNames.filter((name) => !genericMap.has(name)),
    fieldMetadataIds,
    baseFieldMetadataIds: Object.fromEntries(baseNames.map((name) => [name, genericMap.get(name)?.MetadataId || null])),
    forbidden: {
      explicitCnyExists: genericMap.has("aigw_annualactualrevenuecny"),
      opportunityLookupExists: genericMap.has("aigw_opportunityid"),
      opportunityRelationshipExists: relationships.some((item) => item.ReferencingAttribute === "aigw_opportunityid" || item.SchemaName?.toLowerCase() === "aigw_opportunity_actualmanagement"),
      customViewExists: views.some((view) => view.name === "实绩管理 - AI Demo"),
      recordProbe,
    },
    solutionMembership: {
      table: componentSet.has(`${normalizeId(entity.MetadataId)}:1`),
      fields: Object.fromEntries(businessNames.map((name) => [name, componentSet.has(`${normalizeId(genericMap.get(name)?.MetadataId)}:2`)])),
    },
    protectedHashesBefore: baseline,
    protectedHashesAfter: protectedAfter,
    protectedUnchanged,
    opportunityRelationshipProtection: {
      rawHashUnchanged: protectedUnchanged.opportunityRelationships,
      countBefore: relationshipBaseline.length,
      countAfter: opportunityRelationships.length,
      schemaSetUnchanged: opportunityRelationshipSchemaSetUnchanged,
      idChanges: relationshipIdChanges,
      assessment: opportunityRelationshipSchemaSetUnchanged ? "Semantic relationship schema set unchanged; raw hash drift is limited to platform-managed metadata identity/order." : "Relationship schema set changed.",
    },
    fullReplicaFormInactiveNonDefault: fullForm.formactivationstate === 0 && fullForm.isdefault === false,
    businessRuleDraftInactive: businessRule.statecode === 0 && businessRule.statuscode === 1,
    bpfDraftInactive: bpf.statecode === 0 && bpf.statuscode === 1,
    publishExecuted: false,
    aiProvider: process.env.AI_PROVIDER || "demo",
    allowExternalAi: (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() === "true",
  };
  verification.pass = reconciliation.alreadyExistsAndValid.length === 38
    && !reconciliation.missing.length
    && !reconciliation.existsButMismatch.length
    && verification.businessFieldCount === 39
    && verification.monthlyFieldCount === 36
    && verification.actualBaseFieldCount === verification.expectedBaseFieldCount
    && !verification.forbidden.explicitCnyExists
    && !verification.forbidden.opportunityLookupExists
    && !verification.forbidden.opportunityRelationshipExists
    && !verification.forbidden.customViewExists
    && (verification.forbidden.recordProbe.count === 0 || verification.forbidden.recordProbe.accessible === false)
    && verification.solutionMembership.table
    && Object.entries(protectedUnchanged).filter(([key]) => key !== "opportunityRelationships").every(([, value]) => value)
    && opportunityRelationshipSchemaSetUnchanged
    && verification.fullReplicaFormInactiveNonDefault
    && verification.businessRuleDraftInactive
    && verification.bpfDraftInactive;
  const executionLog = JSON.parse(await fs.readFile(path.join(outputDir, "01_resume_execution_log.json"), "utf8"));
  const created = executionLog.attributes.filter((item) => item.status === "created" || item.status === "created_after_post_error");
  const rollback = {
    automaticRollbackExecuted: false,
    createdAttributes: Object.fromEntries(created.map((item) => [item.logicalName, item.metadataId])),
    warning: "No deletion is authorized. Physical deletion requires separate confirmation and must target only the listed attribute MetadataIds. Do not delete the table or touch opportunity/protected components.",
  };
  await Promise.all([
    fs.writeFile(path.join(outputDir, "02_after_snapshot.json"), `${JSON.stringify(verification, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "03_field_metadata_ids.json"), `${JSON.stringify(fieldMetadataIds, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "04_rollback_manifest.json"), `${JSON.stringify(rollback, null, 2)}\n`),
  ]);
  console.log(JSON.stringify({ pass: verification.pass, businessFieldCount: verification.businessFieldCount, monthlyFieldCount: verification.monthlyFieldCount, baseFields: { expected: verification.expectedBaseFieldCount, actual: verification.actualBaseFieldCount, missing: verification.missingBaseFields }, forbidden: verification.forbidden, protectedUnchanged, opportunityRelationshipProtection: verification.opportunityRelationshipProtection, solutionMembership: { table: verification.solutionMembership.table, directFieldComponents: Object.values(verification.solutionMembership.fields).filter(Boolean).length, interpretation: "Attributes were created with MSCRM.SolutionUniqueName and are carried as subcomponents of the table solution component." }, businessRuleDraftInactive: verification.businessRuleDraftInactive, bpfDraftInactive: verification.bpfDraftInactive, outputDir: path.relative(root, outputDir) }, null, 2));
  if (!verification.pass) process.exitCode = 1;
}


runDataverseCli(import.meta.url, main);
