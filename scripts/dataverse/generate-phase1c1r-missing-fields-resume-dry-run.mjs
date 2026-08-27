import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";
import { compareEntityMetadata, comparePrimaryAttribute, reconcileAttributes } from "./lib/phase1c1-reconciliation.mjs";

let EXPECTED_URL;
const SOLUTION = "CRMAIGatewayDemo";
const TARGET = "aigw_actualmanagement";
let ENTITY_METADATA_ID;
const SOURCE_MANIFEST = "docs/d365/phase1c-1-table-fields-manifest.json";
const RESUME_MANIFEST = "docs/d365/phase1c-1r-missing-fields-resume-manifest.json";
const AUTHORIZATION = "CONFIRM_D365_TEST_WRITE_PHASE_1C_1R_MISSING_FIELDS";

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export async function main() {
  EXPECTED_URL = getDataverseUrl();
  ENTITY_METADATA_ID = getRequiredEnvironmentId("D365_ACTUAL_MANAGEMENT_ENTITY_METADATA_ID");
  const root = process.cwd();
  const client = createDynamicsClient();
  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: Dataverse URL mismatch.");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: AI must remain demo/disabled.");
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

  const sourceText = await fs.readFile(path.join(root, SOURCE_MANIFEST), "utf8");
  const source = JSON.parse(sourceText);
  const plannedRequests = source.writes.webApiDryRun.requests.filter((request) => request.endpoint === `/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')/Attributes`);
  if (plannedRequests.length !== 38 || plannedRequests.some((request) => request.logicalName === "aigw_name" || request.logicalName === "aigw_opportunityid")) throw new Error("Source manifest boundary mismatch.");

  const [entity, genericAttributes, solutions] = await Promise.all([
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')?$select=MetadataId,LogicalName,SchemaName,OwnershipType,IsManaged,PrimaryNameAttribute,EntitySetName,ObjectTypeCode`),
    getAll(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,IsManaged,RequiredLevel`),
    get(`/api/data/v9.2/solutions?$select=solutionid,uniquename,friendlyname,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
  ]);
  const solution = solutions.value?.[0];
  if (!solution || solution.ismanaged !== false || solution.friendlyname !== "CRM AI Gateway Demo") throw new Error("Safety gate failed: solution mismatch.");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Safety gate failed: publisher mismatch.");
  const components = await getAll(`/api/data/v9.2/solutioncomponents?$select=objectid,componenttype,solutioncomponentid&$filter=_solutionid_value eq ${solution.solutionid}`);
  const tableInSolution = components.some((component) => String(component.objectid).toLowerCase() === String(entity.MetadataId).toLowerCase() && component.componenttype === 1);

  const entityMismatches = compareEntityMetadata(entity, { metadataId: ENTITY_METADATA_ID, logicalName: TARGET, schemaName: "aigw_ActualManagement", ownershipType: "OrganizationOwned", primaryNameAttribute: "aigw_name" });
  const primary = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')/Attributes(LogicalName='aigw_name')/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,AttributeType,MaxLength,RequiredLevel,DisplayName`);
  const primaryMismatches = comparePrimaryAttribute(primary, { logicalName: "aigw_name", schemaName: "aigw_Name", requiredLevel: "ApplicationRequired", maxLength: 200, labels: { "1033": "Actual Name", "2052": "实绩名称" } });

  const genericMap = new Map(genericAttributes.map((attribute) => [attribute.LogicalName, attribute]));
  const detailedMap = new Map();
  for (const request of plannedRequests) {
    if (!genericMap.has(request.logicalName)) continue;
    const expectedType = String(request.payload["@odata.type"]);
    const cast = expectedType.endsWith("MoneyAttributeMetadata") ? "MoneyAttributeMetadata" : expectedType.endsWith("DateTimeAttributeMetadata") ? "DateTimeAttributeMetadata" : "";
    if (!cast) throw new Error(`Unsupported planned type: ${request.logicalName}`);
    const select = cast === "MoneyAttributeMetadata" ? "MetadataId,LogicalName,SchemaName,AttributeType,Precision,PrecisionSource,MinValue,MaxValue,IsBaseCurrency,RequiredLevel,DisplayName" : "MetadataId,LogicalName,SchemaName,AttributeType,Format,RequiredLevel,DisplayName";
    detailedMap.set(request.logicalName, await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')/Attributes(LogicalName='${request.logicalName}')/Microsoft.Dynamics.CRM.${cast}?$select=${select}`));
  }
  const reconciliation = reconcileAttributes(plannedRequests, detailedMap);
  const blockedReasons = [];
  if (entityMismatches.length) blockedReasons.push({ target: "entity", mismatches: entityMismatches });
  if (primaryMismatches.length) blockedReasons.push({ target: "aigw_name", mismatches: primaryMismatches });
  if (!tableInSolution) blockedReasons.push({ target: "solution_membership", mismatches: ["table_not_in_solution"] });
  if (reconciliation.existsButMismatch.length) blockedReasons.push(...reconciliation.existsButMismatch.map((item) => ({ target: item.request.logicalName, mismatches: item.mismatches })));
  const blocked = blockedReasons.length > 0;
  const missingRequests = blocked ? [] : reconciliation.missing.map((request) => ({ ...request, headers: { "MSCRM.SolutionUniqueName": SOLUTION } }));
  const manifest = {
    phase: "1C-1R",
    title: "Existing Actual Management table missing-only attribute resume",
    dryRun: true,
    executable: !blocked,
    blocked,
    blockedReasons,
    authorizationPhrase: AUTHORIZATION,
    targetEnvironment: EXPECTED_URL,
    solution: SOLUTION,
    entityAlreadyExistsAndValid: !entityMismatches.length && !primaryMismatches.length && tableInSolution,
    entity: { metadataId: entity.MetadataId, logicalName: entity.LogicalName, schemaName: entity.SchemaName, ownershipType: entity.OwnershipType, isManaged: entity.IsManaged, primaryNameAttribute: entity.PrimaryNameAttribute, entitySetName: entity.EntitySetName, objectTypeCode: entity.ObjectTypeCode, tableInSolution },
    primaryAttribute: { metadataId: primary.MetadataId, logicalName: primary.LogicalName, schemaName: primary.SchemaName, type: primary.AttributeType, requiredLevel: primary.RequiredLevel?.Value, maxLength: primary.MaxLength, mismatches: primaryMismatches },
    reconciliation: {
      alreadyExistsAndValidCount: reconciliation.alreadyExistsAndValid.length,
      missingCount: reconciliation.missing.length,
      existsButMismatchCount: reconciliation.existsButMismatch.length,
      alreadyExistsAndValid: reconciliation.alreadyExistsAndValid.map((item) => ({ logicalName: item.request.logicalName, metadataId: item.metadata.MetadataId })),
      missing: reconciliation.missing.map((request) => request.logicalName),
      existsButMismatch: reconciliation.existsButMismatch.map((item) => ({ logicalName: item.request.logicalName, metadataId: item.metadata.MetadataId, mismatches: item.mismatches })),
    },
    writes: {
      entityRequests: [],
      primaryAttributeRequests: [],
      webApiDryRun: { headers: { "MSCRM.SolutionUniqueName": SOLUTION }, endpoint: `/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')/Attributes`, requestCount: missingRequests.length, requests: missingRequests },
    },
    timeoutPolicy: { requestTimeoutMs: 60000, postRetries: 0, metadataPollAttempts: 8, metadataPollIntervalMs: 1500, behavior: "After any POST error or timeout, poll metadata first. Treat a matching server-created attribute as success. Never retry POST in the same run. A later run may include the field only after metadata confirms it is still absent." },
    forbidden: ["EntityDefinitions table POST", "aigw_name", "Lookup", "RelationshipDefinitions", "savedqueries", "systemforms", "FormXML/FormJSON", "records", "PublishXml", "metadata deletion"],
    rollback: "No automatic deletion. Log each newly created MetadataId. Any physical field/table deletion requires separate authorization; repeated runs only create fields still classified missing.",
  };
  const requestJson = JSON.stringify(missingRequests);
  const boundaryChecks = {
    noEntityCreate: !requestJson.includes('"/api/data/v9.2/EntityDefinitions"'),
    noPrimaryName: !requestJson.includes("aigw_name"),
    noLookup: !requestJson.includes("LookupAttributeMetadata") && !requestJson.includes("aigw_opportunityid"),
    noRelationship: !requestJson.includes("RelationshipDefinitions"),
    noViewFormDataPublish: ["savedqueries", "systemforms", "formxml", "formjson", "PublishXml", "/aigw_actualmanagements"].every((token) => !requestJson.includes(token)),
    fixedEndpoint: missingRequests.every((request) => request.endpoint === `/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')/Attributes`),
    solutionHeaderEveryRequest: missingRequests.every((request) => request.headers?.["MSCRM.SolutionUniqueName"] === SOLUTION),
    explicitCnyAbsent: !requestJson.includes("aigw_annualactualrevenuecny"),
    baseFieldsAbsent: !missingRequests.some((request) => request.logicalName.endsWith("_base")),
  };
  if (!Object.values(boundaryChecks).every(Boolean)) throw new Error(`Resume manifest boundary failed: ${JSON.stringify(boundaryChecks)}`);
  manifest.boundaryChecks = boundaryChecks;

  const backup = path.join(root, "backups", "dataverse", `phase1c1r_missing_fields_${stamp()}`);
  await fs.mkdir(path.dirname(path.join(root, RESUME_MANIFEST)), { recursive: true });
  await fs.mkdir(backup, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(root, RESUME_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`),
    fs.writeFile(path.join(backup, "01_resume_dry_run_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    fs.writeFile(path.join(backup, "02_current_attributes.json"), `${JSON.stringify(genericAttributes, null, 2)}\n`),
    fs.writeFile(path.join(backup, "03_source_manifest_hash.json"), `${JSON.stringify({ path: SOURCE_MANIFEST, sha256: sha256(sourceText) }, null, 2)}\n`),
  ]);
  console.log(JSON.stringify({ readOnly: true, blocked, entityAlreadyExistsAndValid: manifest.entityAlreadyExistsAndValid, reconciliation: manifest.reconciliation, requestCount: missingRequests.length, manifest: RESUME_MANIFEST, backup: path.relative(root, backup), boundaryChecks }, null, 2));
}


runDataverseCli(import.meta.url, main);
