import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";
import {
  compareEntityMetadata,
  comparePrimaryAttribute,
  createAttributeWithReadback,
  reconcileAttributes,
} from "./lib/phase1c1-reconciliation.mjs";

let EXPECTED_URL;
const SOLUTION = "CRMAIGatewayDemo";
const TARGET = "aigw_actualmanagement";
let ENTITY_METADATA_ID;
const MANIFEST_PATH = "docs/d365/phase1c-1r-missing-fields-resume-manifest.json";
const AUTHORIZATION = "CONFIRM_D365_TEST_WRITE_PHASE_1C_1R_MISSING_FIELDS";
const ATTRIBUTE_ENDPOINT = `/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')/Attributes`;
const POLL_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 1500;

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function castFor(request) {
  const type = String(request.payload?.["@odata.type"] || "");
  if (type.endsWith("MoneyAttributeMetadata")) return "MoneyAttributeMetadata";
  if (type.endsWith("DateTimeAttributeMetadata")) return "DateTimeAttributeMetadata";
  throw new Error(`Unsupported resume attribute type: ${request.logicalName}`);
}

function selectFor(request) {
  return castFor(request) === "MoneyAttributeMetadata"
    ? "MetadataId,LogicalName,SchemaName,AttributeType,Precision,PrecisionSource,MinValue,MaxValue,IsBaseCurrency,RequiredLevel,DisplayName"
    : "MetadataId,LogicalName,SchemaName,AttributeType,Format,RequiredLevel,DisplayName";
}

export async function main() {
  EXPECTED_URL = getDataverseUrl();
  ENTITY_METADATA_ID = getRequiredEnvironmentId("D365_ACTUAL_MANAGEMENT_ENTITY_METADATA_ID");
  assertDataverseScriptGate({ mode: "write-capable" });
  const root = process.cwd();
  const args = process.argv.slice(2);
  const confirmIndex = args.indexOf("--confirm");
  const confirmed = confirmIndex >= 0 && args[confirmIndex + 1] === AUTHORIZATION;
  const client = createDynamicsClient({
    env: { ...process.env, DATAVERSE_TIMEOUT_MS: process.env.PHASE1C_ATTRIBUTE_TIMEOUT_MS || "60000" },
  });
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
  const readDetailedAttribute = async (request) => {
    const rows = await getAll(`${ATTRIBUTE_ENDPOINT}?$select=LogicalName&$filter=LogicalName eq '${request.logicalName}'`);
    if (!rows.length) return null;
    return get(`${ATTRIBUTE_ENDPOINT}(LogicalName='${request.logicalName}')/Microsoft.Dynamics.CRM.${castFor(request)}?$select=${selectFor(request)}`);
  };

  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: Dataverse URL mismatch.");
  if ((process.env.AI_PROVIDER || "demo") !== "demo") throw new Error("Safety gate failed: AI_PROVIDER must be demo.");
  if ((process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: ALLOW_EXTERNAL_AI must be false.");

  const manifest = JSON.parse(await fs.readFile(path.join(root, MANIFEST_PATH), "utf8"));
  const requests = manifest?.writes?.webApiDryRun?.requests || [];
  const serialized = JSON.stringify(requests);
  const manifestValid = manifest.phase === "1C-1R"
    && manifest.authorizationPhrase === AUTHORIZATION
    && manifest.executable === true
    && requests.length === 38
    && requests.every((request) => request.method === "POST" && request.endpoint === ATTRIBUTE_ENDPOINT)
    && requests.every((request) => request.headers?.["MSCRM.SolutionUniqueName"] === SOLUTION)
    && new Set(requests.map((request) => request.logicalName)).size === 38
    && !serialized.includes("aigw_name")
    && !serialized.includes("aigw_opportunityid")
    && !serialized.includes("LookupAttributeMetadata")
    && !serialized.includes("RelationshipDefinitions")
    && !serialized.includes("savedqueries")
    && !serialized.includes("systemforms")
    && !serialized.includes("PublishXml")
    && !requests.some((request) => request.logicalName.endsWith("_base"));
  if (!manifestValid) throw new Error("Safety gate failed: resume manifest boundary mismatch.");

  const [entity, primary, solutionRows] = await Promise.all([
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET}')?$select=MetadataId,LogicalName,SchemaName,OwnershipType,IsManaged,PrimaryNameAttribute,EntitySetName,ObjectTypeCode`),
    get(`${ATTRIBUTE_ENDPOINT}(LogicalName='aigw_name')/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,AttributeType,MaxLength,RequiredLevel,DisplayName`),
    get(`/api/data/v9.2/solutions?$select=solutionid,uniquename,friendlyname,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
  ]);
  const solution = solutionRows.value?.[0];
  if (!solution || solution.ismanaged !== false || solution.friendlyname !== "CRM AI Gateway Demo") throw new Error("Safety gate failed: solution mismatch.");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Safety gate failed: publisher prefix mismatch.");
  const components = await getAll(`/api/data/v9.2/solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ${solution.solutionid}`);
  const tableInSolution = components.some((component) => String(component.objectid).toLowerCase() === String(entity.MetadataId).toLowerCase() && component.componenttype === 1);
  const entityMismatches = compareEntityMetadata(entity, {
    metadataId: ENTITY_METADATA_ID,
    logicalName: TARGET,
    schemaName: "aigw_ActualManagement",
    ownershipType: "OrganizationOwned",
    primaryNameAttribute: "aigw_name",
  });
  const primaryMismatches = comparePrimaryAttribute(primary, {
    logicalName: "aigw_name",
    schemaName: "aigw_Name",
    requiredLevel: "ApplicationRequired",
    maxLength: 200,
    labels: { "1033": "Actual Name", "2052": "实绩名称" },
  });
  if (entityMismatches.length || primaryMismatches.length || !tableInSolution) {
    throw new Error(`Safety gate failed: existing table mismatch: ${JSON.stringify({ entityMismatches, primaryMismatches, tableInSolution })}`);
  }

  const detailedMap = new Map();
  for (const request of requests) {
    const metadata = await readDetailedAttribute(request);
    if (metadata) detailedMap.set(request.logicalName, metadata);
  }
  const reconciliation = reconcileAttributes(requests, detailedMap);
  if (reconciliation.blocked) {
    throw new Error(`Safety gate failed: attribute definition mismatch: ${JSON.stringify(reconciliation.existsButMismatch.map((item) => ({ logicalName: item.request.logicalName, mismatches: item.mismatches })))}`);
  }

  const backupDir = path.join(root, "backups", "dataverse", `phase1c1r_missing_fields_resume_${stamp()}`);
  await fs.mkdir(backupDir, { recursive: true });
  const log = {
    phase: "1C-1R",
    mode: confirmed ? "confirmed" : "dry-run",
    entityAlreadyExistsAndValid: true,
    reconciliation: {
      alreadyExistsAndValid: reconciliation.alreadyExistsAndValid.map((item) => item.request.logicalName),
      missing: reconciliation.missing.map((request) => request.logicalName),
      existsButMismatch: [],
    },
    attributes: [],
    publishExecuted: false,
    metadataDeleted: false,
  };
  const logPath = path.join(backupDir, "01_resume_execution_log.json");
  const persist = () => fs.writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`);
  await persist();

  if (!confirmed) {
    console.log(JSON.stringify({ status: "dry-run", authorized: false, backupDir: path.relative(root, backupDir), ...log.reconciliation }, null, 2));
    return;
  }

  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index];
    const current = await readDetailedAttribute(request);
    if (current) {
      const one = reconcileAttributes([request], new Map([[request.logicalName, current]]));
      if (one.blocked) {
        log.stopped = true;
        log.error = { logicalName: request.logicalName, reason: "definition_mismatch", mismatches: one.existsButMismatch[0].mismatches };
        log.notExecuted = requests.slice(index + 1).map((item) => item.logicalName);
        await persist();
        throw new Error(`Attribute drift detected before POST: ${request.logicalName}`);
      }
      log.attributes.push({ logicalName: request.logicalName, status: "alreadyExistsAndValid", metadataId: current.MetadataId });
      await persist();
      continue;
    }

    try {
      const result = await createAttributeWithReadback({
        request,
        postAttribute: (item) => client.dataversePost(item.endpoint, item.payload, { headers: item.headers }),
        readAttribute: () => readDetailedAttribute(request),
        sleep,
        pollAttempts: POLL_ATTEMPTS,
        pollIntervalMs: POLL_INTERVAL_MS,
      });
      log.attributes.push({
        logicalName: request.logicalName,
        status: result.status,
        metadataId: result.metadata.MetadataId,
        postError: result.postError,
        pollAttemptsUsed: result.pollAttemptsUsed,
        postRetried: false,
      });
      await persist();
    } catch (error) {
      log.stopped = true;
      log.error = { logicalName: request.logicalName, code: error.code || "attribute_create_failed", message: error.message, postRetried: false };
      log.notExecuted = requests.slice(index + 1).map((item) => item.logicalName);
      await persist();
      throw error;
    }
  }

  const finalMap = new Map();
  for (const request of requests) {
    const metadata = await readDetailedAttribute(request);
    if (metadata) finalMap.set(request.logicalName, metadata);
  }
  const finalReconciliation = reconcileAttributes(requests, finalMap);
  log.completedAt = new Date().toISOString();
  log.final = {
    alreadyExistsAndValidCount: finalReconciliation.alreadyExistsAndValid.length,
    missingCount: finalReconciliation.missing.length,
    existsButMismatchCount: finalReconciliation.existsButMismatch.length,
  };
  await persist();
  if (finalReconciliation.missing.length || finalReconciliation.blocked) throw new Error("Final attribute reconciliation failed.");
  console.log(JSON.stringify({ status: "success", backupDir: path.relative(root, backupDir), ...log.final, publishExecuted: false }, null, 2));
}


runDataverseCli(import.meta.url, main);
