import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, runDataverseCli } from "./lib/environment-safety.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EXPECTED_TEST_HOSTNAME = ["org91f5f65f", "crm5", "dynamics", "com"].join(".");
const ORG_NAME = "org91f5f65f";
const SOLUTION = "CRMAIGatewayDemo";
const SOLUTION_DISPLAY_NAME = "CRM AI Gateway Demo";
const PUBLISHER_PREFIX = "aigw";
const PRIMARY_ENTITY = "aigw_actualmanagement";
const ASSEMBLY_NAME = "CrmAiGateway.ActualTotals.Plugin";
const DLL_NAME = "CrmAiGateway.ActualTotals.Plugin.dll";
const EXPECTED_TOKEN = "0350f79ae25dc991";
const EXPECTED_SHA256 = "a02db984606827396467b7311f3024b586e33f4d3a024e3cb240e39ba91c6b7d";
const MANIFEST_PATH = path.join(ROOT, "docs/d365/phase1c-5r2b-plugin-registration-manifest.json");
const COMPONENT_TYPES = { pluginType: 90, pluginAssembly: 91, step: 92, image: 93 };
const EXPECTED_PLUGIN_TYPE_NAMES = [
  "CrmAiGateway.ActualTotals.Plugin.ActualTotalsPreValidationPlugin",
  "CrmAiGateway.ActualTotals.Plugin.ActualTotalsPreOperationPlugin",
  "CrmAiGateway.ActualTotals.Plugin.ActualTotalsPostOperationPlugin",
];
const READ_AFTER_WRITE_DELAYS_MS = [1000, 2000, 3000, 5000, 8000];

const isGuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
const stamp = () => new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/, "Z");
const lower = (value) => String(value || "").toLowerCase();
const unique = (items) => [...new Set(items)];
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function extractId(response, logicalName) {
  const header = response?.headers?.get?.("odata-entityid") || response?.headers?.get?.("OData-EntityId") || "";
  const headerMatch = /\(([0-9a-f-]{36})\)/i.exec(header);
  const headerId = headerMatch?.[1] || null;
  const primaryKey = `${logicalName}id`;
  const bodyId = response?.body?.[primaryKey];
  if (bodyId !== undefined && !isGuid(bodyId)) throw new Error(`Invalid ${primaryKey} in Dataverse create response.`);
  if (headerId && bodyId && lower(headerId) !== lower(bodyId)) throw new Error(`${primaryKey} differs between OData-EntityId and response body.`);
  if (headerId) return headerId;
  if (bodyId) return bodyId;
  throw new Error(`No ${primaryKey} returned by Dataverse create response; unique IDs are not valid substitutes.`);
}

function errorSummary(error) {
  return {
    status: error?.status ?? null,
    message: error?.message || "Unknown Dataverse error",
    code: error?.body?.error?.code || null,
  };
}

function responseSummary(response) {
  return {
    status: response?.status ?? null,
    id: Object.entries(response?.body || {}).find(([key, value]) => (key === "id" || key.toLowerCase().endsWith("id")) && isGuid(value))?.[1] || null,
    entityIdHeaderPresent: Boolean(response?.headers?.get?.("odata-entityid") || response?.headers?.get?.("OData-EntityId")),
  };
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function sha256(file) {
  const data = await fs.readFile(file);
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function querySingle(get, endpoint, description) {
  const body = await get(endpoint);
  const rows = Array.isArray(body.value) ? body.value : (body && typeof body === "object" && !body.error ? [body] : []);
  assert(rows.length === 1, `${description} expected exactly one row, got ${rows.length}`);
  return rows[0];
}

async function readAfterWriteById(get, endpoint, description, { delays = READ_AFTER_WRITE_DELAYS_MS, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let attempts = 0;
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    attempts += 1;
    try {
      const body = await get(endpoint);
      const row = Array.isArray(body.value) ? (body.value.length === 1 ? body.value[0] : null) : body;
      if (row && typeof row === "object" && Object.keys(row).length > 0) return { row, attempts, delayed: attempts > 1 };
    } catch (error) {
      if (Number(error?.status) !== 404) throw error;
    }
  }
  return { row: null, attempts, delayed: false, description };
}

function classifyPluginTypes(definitions, rows, assemblyId) {
  const existing = [];
  const missing = [];
  const conflicting = [];
  for (const definition of definitions) {
    const matches = rows.filter((row) => row.typename === definition.typename);
    const exact = matches.filter((row) => row.name === definition.name
      && row.friendlyname === definition.friendlyName
      && lower(row._pluginassemblyid_value) === lower(assemblyId));
    if (matches.length === 0) {
      missing.push(definition);
    } else if (matches.length === 1 && exact.length === 1) {
      existing.push({ definition, row: matches[0] });
    } else {
      conflicting.push({ definition, rows: matches });
    }
  }
  return { existing, missing, conflicting };
}

async function findPluginTypeByDefinition(get, definition, assemblyId) {
  const rows = (await get(`/api/data/v9.2/plugintypes?$select=plugintypeid,typename,name,friendlyname,_pluginassemblyid_value&$filter=typename eq '${escapeODataString(definition.typename)}'`)).value || [];
  const exact = rows.filter((row) => row.name === definition.name && row.friendlyname === definition.friendlyName && lower(row._pluginassemblyid_value) === lower(assemblyId));
  if (rows.length > 1 || (rows.length === 1 && exact.length !== 1)) throw new Error(`Blocked: Plugin Type conflict for ${definition.typename}.`);
  return exact[0] || null;
}

async function resolvePluginTypeAfterWrite(get, id, definition, assemblyId, options = {}) {
  const result = await readAfterWriteById(get, `/api/data/v9.2/plugintypes(${id})?$select=plugintypeid,typename,name,friendlyname,_pluginassemblyid_value`, `Plugin Type ${definition.typename}`, options);
  if (result.row) return { row: result.row, status: "created", readAfterWrite: result };
  const collectionRow = await findPluginTypeByDefinition(get, definition, assemblyId);
  return { row: collectionRow, status: collectionRow ? "created-after-read-delay" : null, readAfterWrite: result };
}

function recordReadAfterWrite(audit, kind, label, result) {
  audit.readAfterWrite.totalAttempts += result.attempts;
  if (result.delayed) audit.readAfterWrite.delayedVerifications += 1;
  audit.readAfterWrite.records.push({ kind, label, attempts: result.attempts, delayed: result.delayed });
}

function escapeODataString(value) {
  return String(value).replaceAll("'", "''");
}

function buildStepPayload(step, messageId, filterId, pluginTypeId) {
  const payload = {
    name: step.displayName,
    description: step.businessPurpose,
    stage: step.stage,
    mode: step.mode,
    rank: step.rank,
    supporteddeployment: step.deploymentCode,
    asyncautodelete: false,
    canbebypassed: false,
    "sdkmessageid@odata.bind": `/sdkmessages(${messageId})`,
    "sdkmessagefilterid@odata.bind": `/sdkmessagefilters(${filterId})`,
    "plugintypeid@odata.bind": `/plugintypes(${pluginTypeId})`,
    "eventhandler_plugintype@odata.bind": `/plugintypes(${pluginTypeId})`,
  };
  if (Array.isArray(step.filteringAttributes)) payload.filteringattributes = step.filteringAttributes.join(",");
  return payload;
}

function validatePluginTypeDefinition(definition) {
  assert(definition && typeof definition === "object", "Plugin Type definition is required.");
  assert(typeof definition.typename === "string" && definition.typename.length > 0, "Plugin Type typename is required.");
  assert(typeof definition.name === "string" && definition.name.length > 0, `Plugin Type name is required for ${definition.typename || "unknown"}.`);
  assert(typeof definition.friendlyName === "string" && definition.friendlyName.trim().length > 0, `Plugin Type friendlyName is required for ${definition.typename || "unknown"}.`);
  return definition;
}

function validatePluginTypeDefinitions(definitions) {
  assert(Array.isArray(definitions) && definitions.length === 3, "Manifest must define exactly three Plugin Types.");
  for (const definition of definitions) validatePluginTypeDefinition(definition);
  assert(unique(definitions.map((definition) => definition.typename)).length === definitions.length, "Plugin Type typenames must be unique.");
  assert(unique(definitions.map((definition) => definition.name)).length === definitions.length, "Plugin Type names must be unique.");
  assert(unique(definitions.map((definition) => definition.friendlyName)).length === definitions.length, "Plugin Type friendlyNames must be unique.");
  return definitions;
}

function buildPluginTypePayload(definition, assemblyId) {
  assert(isGuid(assemblyId), "Plugin Type binding requires the primary pluginassemblyid.");
  validatePluginTypeDefinition(definition);
  return {
    typename: definition.typename,
    name: definition.name,
    friendlyname: definition.friendlyName,
    "pluginassemblyid@odata.bind": `/pluginassemblies(${assemblyId})`,
  };
}

function buildResumePlan({ assemblyCount, existingPluginTypeCount, missingPluginTypeCount, conflictingPluginTypeCount, existingStepCount = 0, missingStepCount = 7, conflictingStepCount = 0, existingImageCount = 0, missingImageCount = 6, conflictingImageCount = 0, stepCount, imageCount }) {
  assert(assemblyCount === 1, `Resume requires exactly one existing Assembly, got ${assemblyCount}.`);
  assert(Number.isInteger(existingPluginTypeCount) && existingPluginTypeCount >= 0, "Resume requires an existing Plugin Type count.");
  assert(Number.isInteger(missingPluginTypeCount) && missingPluginTypeCount >= 0, "Resume requires a missing Plugin Type count.");
  assert(Number.isInteger(conflictingPluginTypeCount) && conflictingPluginTypeCount >= 0, "Resume requires a conflicting Plugin Type count.");
  assert(conflictingPluginTypeCount === 0, `Blocked: conflicting Plugin Types=${conflictingPluginTypeCount}.`);
  assert(existingPluginTypeCount + missingPluginTypeCount === 3, "Resume Plugin Type classification must account for all three definitions.");
  const resolvedExistingStepCount = stepCount === undefined ? existingStepCount : stepCount;
  const resolvedExistingImageCount = imageCount === undefined ? existingImageCount : imageCount;
  assert(resolvedExistingStepCount + missingStepCount === 7, "Resume Step classification must account for all seven definitions.");
  assert(resolvedExistingImageCount + missingImageCount === 6, "Resume Image classification must account for all six definitions.");
  assert(conflictingStepCount === 0, `Blocked: conflicting Steps=${conflictingStepCount}.`);
  assert(conflictingImageCount === 0, `Blocked: conflicting Images=${conflictingImageCount}.`);
  return {
    resumeExistingAssembly: true,
    createAssembly: false,
    updateAssembly: false,
    deleteAssembly: false,
    plannedPluginTypes: 3,
    plannedPluginTypeCreates: missingPluginTypeCount,
    plannedPluginTypeUpdates: 0,
    plannedPluginTypeDeletes: 0,
    plannedSteps: 7,
    plannedStepCreates: missingStepCount,
    plannedStepUpdates: 0,
    plannedStepDeletes: 0,
    plannedImages: 6,
    plannedImageCreates: missingImageCount,
    plannedImageUpdates: 0,
    plannedImageDeletes: 0,
    plannedEnabledSteps: 0,
  };
}

function buildImagePayload(image, stepId) {
  return buildImagePayloadForMessage(image, stepId, "Update");
}

function messagePropertyNameForMessage(message) {
  return message === "Create" ? "Id" : "Target";
}

function buildImagePayloadForMessage(image, stepId, message) {
  return {
    name: image.name,
    entityalias: image.alias,
    imagetype: image.type === "PreImage" ? 0 : 1,
    attributes: image.fields.join(","),
    messagepropertyname: messagePropertyNameForMessage(message),
    "sdkmessageprocessingstepid@odata.bind": `/sdkmessageprocessingsteps(${stepId})`,
  };
}

function normalizeFilteringAttributes(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function sameStringList(left, right) {
  return JSON.stringify(normalizeFilteringAttributes(left).slice().sort()) === JSON.stringify(normalizeFilteringAttributes(right).slice().sort());
}

function classifySteps(definitions, rows, pluginTypeByName) {
  const existing = [];
  const missing = [];
  const conflicting = [];
  for (const definition of definitions) {
    const matches = rows.filter((row) => row.name === definition.displayName);
    const expectedPluginTypeId = pluginTypeByName[definition.pluginType];
    const exact = matches.filter((row) => Number(row.stage) === definition.stage
      && Number(row.mode) === definition.mode
      && Number(row.rank) === definition.rank
      && sameStringList(row.filteringattributes, definition.filteringAttributes)
      && lower(row._plugintypeid_value) === lower(expectedPluginTypeId));
    if (matches.length === 0) missing.push(definition);
    else if (matches.length === 1 && exact.length === 1) existing.push({ definition, row: matches[0] });
    else conflicting.push({ definition, rows: matches });
  }
  return { existing, missing, conflicting };
}

function classifyImages(definitions, rows, stepIdByLogicalIdentifier) {
  const existing = [];
  const missing = [];
  const conflicting = [];
  for (const step of definitions) {
    const stepId = stepIdByLogicalIdentifier[step.logicalIdentifier];
    for (const image of step.images) {
      const matches = rows.filter((row) => lower(row._sdkmessageprocessingstepid_value) === lower(stepId) && row.name === image.name);
      const expectedType = image.type === "PreImage" ? 0 : 1;
      const exact = matches.filter((row) => row.entityalias === image.alias
        && Number(row.imagetype) === expectedType
        && row.attributes === image.fields.join(",")
        && row.messagepropertyname === messagePropertyNameForMessage(step.message));
      if (matches.length === 0) missing.push({ step, image });
      else if (matches.length === 1 && exact.length === 1) existing.push({ step, image, row: matches[0] });
      else conflicting.push({ step, image, rows: matches });
    }
  }
  return { existing, missing, conflicting };
}

export async function main(argv = process.argv.slice(2)) {
  const resumeExistingAssembly = argv.includes("--resume-existing-assembly");
  assert(resumeExistingAssembly, "Resume-only executor requires --resume-existing-assembly; no Assembly create path is available.");
  const dryRun = argv.includes("--dry-run");
  if (!dryRun) assert(argv.includes("--confirm-phase1c5r2d1"), "Missing --confirm-phase1c5r2d1; no Dataverse writes were attempted.");
  const gate = dryRun
    ? assertDataverseScriptGate({ mode: "read-only", argv })
    : assertDataverseScriptGate({ mode: "write-capable" });
  const manifest = await readJson(MANIFEST_PATH);
  assert(manifest.solution === SOLUTION && manifest.primaryEntity === PRIMARY_ENTITY, "Registration manifest target mismatch.");
  assert(manifest.pluginTypes?.length === 3 && manifest.steps?.length === 7, "Registration manifest must contain 3 Plugin Types and 7 Steps.");
  const pluginTypeDefinitions = validatePluginTypeDefinitions(manifest.pluginTypes);
  const expectedPluginTypeNames = pluginTypeDefinitions.map((definition) => definition.typename);
  assert(manifest.artifact?.publicKeyToken === EXPECTED_TOKEN, "Manifest public key token mismatch.");
  assert(manifest.artifact?.sha256 === EXPECTED_SHA256, "Manifest DLL SHA-256 mismatch.");
  assert(manifest.artifact?.source && !path.isAbsolute(manifest.artifact.source), "Artifact source must be a project-relative path.");

  const artifactPath = path.resolve(ROOT, manifest.artifact.source);
  assert(await sha256(artifactPath) === EXPECTED_SHA256, "Frozen DLL SHA-256 mismatch.");
  const [buildManifest, assemblyInspection] = await Promise.all([
    readJson(path.join(path.dirname(artifactPath), "build-manifest.json")),
    readJson(path.join(path.dirname(artifactPath), "assembly-inspection.json")),
  ]);
  assert(buildManifest.deployable === true, "Frozen build manifest is not deployable.");
  assert(buildManifest.publicKeyToken === EXPECTED_TOKEN && assemblyInspection.publicKeyToken === EXPECTED_TOKEN, "Frozen public key token mismatch.");
  assert(assemblyInspection.assemblyName === ASSEMBLY_NAME && assemblyInspection.passed === true, "Frozen assembly inspection failed.");
  assert(unique(assemblyInspection.expectedPluginTypes || []).sort().join("|") === EXPECTED_PLUGIN_TYPE_NAMES.slice().sort().join("|"), "Frozen plugin type list mismatch.");

  const auditDir = path.join(ROOT, "local-artifacts/d365/plugin-registration", `phase1c5r2d1_${stamp()}`);
  await fs.mkdir(auditDir, { recursive: true });
  const audit = {
    phase: "1C-5R2D-1D",
    startedAtUtc: new Date().toISOString(),
    targetEnvironment: null,
    organizationName: ORG_NAME,
    solution: SOLUTION,
    publisherPrefix: PUBLISHER_PREFIX,
    dll: { file: DLL_NAME, sha256: EXPECTED_SHA256, publicKeyToken: EXPECTED_TOKEN },
    readRequests: 0,
    writeRequests: 0,
    writeCounts: { pluginAssemblyPost: 0, pluginTypePost: 0, stepPost: 0, stepPatch: 0, imagePost: 0, solutionComponentPost: 0 },
    errors: [],
    readAfterWrite: { totalAttempts: 0, delayedVerifications: 0, records: [] },
    expected: { pluginTypes: pluginTypeDefinitions, steps: manifest.steps.map((step) => step.logicalIdentifier), images: manifest.steps.flatMap((step) => step.images.map((image) => `${step.logicalIdentifier}:${image.name}`)) },
    actual: { pluginAssembly: null, pluginTypes: [], steps: [], images: [], solutionComponents: [] },
    publishExecuted: false,
    businessDataWrites: 0,
    productionRequests: 0,
    rollback: { automaticDeletion: false, requiresSeparateAuthorization: true },
    resumeExistingAssembly,
    createAssembly: false,
    updateAssembly: false,
    deleteAssembly: false,
  };
  const saveAudit = async (name = "registration-audit.json") => fs.writeFile(path.join(auditDir, name), JSON.stringify(audit, null, 2));

  const client = createDynamicsClient();
  const config = client.config;
  assert(new URL(config.dataverseUrl).hostname === EXPECTED_TEST_HOSTNAME, "Safety gate failed: target hostname is not the approved test environment.");
  audit.targetEnvironment = gate.dataverseUrl;
  assert((process.env.AI_PROVIDER || "demo") === "demo", "Safety gate failed: AI_PROVIDER must be demo.");
  assert((process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() === "false", "Safety gate failed: ALLOW_EXTERNAL_AI must be false.");
  const get = async (endpoint) => { audit.readRequests += 1; return (await client.dataverseGet(endpoint)).body; };
  const post = async (endpoint, payload, kind, headers = { "MSCRM.SolutionUniqueName": SOLUTION }) => {
    audit.writeRequests += 1;
    audit.writeCounts[kind] += 1;
    try {
      const response = await client.dataversePost(endpoint, payload, { headers });
      return response;
    } catch (error) {
      audit.errors.push({ operation: "POST", endpoint, kind, error: errorSummary(error) });
      throw error;
    }
  };
  const patch = async (endpoint, payload, kind) => {
    audit.writeRequests += 1;
    audit.writeCounts[kind] += 1;
    try {
      return await client.dataversePatch(endpoint, payload);
    } catch (error) {
      audit.errors.push({ operation: "PATCH", endpoint, kind, error: errorSummary(error) });
      throw error;
    }
  };

  try {
    const who = await client.testConnection();
    audit.identity = { whoAmI: who.ok === true };
    const org = await querySingle(get, "/api/data/v9.2/organizations?$select=name,organizationid", "organization");
    assert(org.name === ORG_NAME, `Organization mismatch: ${org.name}`);
    const solution = await querySingle(get, `/api/data/v9.2/solutions?$select=solutionid,friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`, "solution");
    assert(solution.friendlyname === SOLUTION_DISPLAY_NAME && solution.uniquename === SOLUTION && solution.ismanaged === false, "Solution safety gate failed.");
    const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`);
    assert(publisher.customizationprefix === PUBLISHER_PREFIX, "Publisher prefix safety gate failed.");
    audit.solutionId = solution.solutionid;

    const assemblyRows = (await get(`/api/data/v9.2/pluginassemblies?$select=pluginassemblyid,pluginassemblyidunique,name,version,publickeytoken,isolationmode,sourcetype,ismanaged&$filter=name eq '${escapeODataString(ASSEMBLY_NAME)}'`)).value || [];
    const typeRows = (await get(`/api/data/v9.2/plugintypes?$select=plugintypeid,typename,name,friendlyname,_pluginassemblyid_value&$filter=${expectedPluginTypeNames.map((name) => `typename eq '${escapeODataString(name)}'`).join(" or ")}`)).value || [];
    const stepRows = (await get(`/api/data/v9.2/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,stage,mode,statecode,statuscode,rank,filteringattributes,_plugintypeid_value,_sdkmessageid_value,_sdkmessagefilterid_value&$filter=${manifest.steps.map((step) => `name eq '${escapeODataString(step.displayName)}'`).join(" or ")}`)).value || [];
    assert(assemblyRows.length === 1, `Resume requires exactly one matching Plugin Assembly, got ${assemblyRows.length}.`);
    const assemblyId = assemblyRows[0].pluginassemblyid;
    const typeClassification = classifyPluginTypes(pluginTypeDefinitions, typeRows, assemblyId);
    assert(typeClassification.conflicting.length === 0, `Blocked: conflicting Plugin Types=${typeClassification.conflicting.length}.`);
    const preflightPluginTypeByName = Object.fromEntries(typeClassification.existing.map(({ definition, row }) => [definition.typename, row.plugintypeid]));
    const stepClassification = classifySteps(manifest.steps, stepRows, preflightPluginTypeByName);
    assert(stepClassification.conflicting.length === 0, `Blocked: conflicting Steps=${stepClassification.conflicting.length}.`);
    const preflightStepIdByLogicalIdentifier = Object.fromEntries(stepClassification.existing.map(({ definition, row }) => [definition.logicalIdentifier, row.sdkmessageprocessingstepid]));
    const existingStepIds = Object.values(preflightStepIdByLogicalIdentifier);
    const imageRows = existingStepIds.length
      ? (await get(`/api/data/v9.2/sdkmessageprocessingstepimages?$select=sdkmessageprocessingstepimageid,name,entityalias,imagetype,attributes,messagepropertyname,_sdkmessageprocessingstepid_value&$filter=${existingStepIds.map((id) => `_sdkmessageprocessingstepid_value eq ${id}`).join(" or ")}`)).value || []
      : [];
    const imageClassification = classifyImages(manifest.steps, imageRows, preflightStepIdByLogicalIdentifier);
    assert(imageClassification.conflicting.length === 0, `Blocked: conflicting Images=${imageClassification.conflicting.length}.`);
    const resumePlan = buildResumePlan({
      assemblyCount: assemblyRows.length,
      existingPluginTypeCount: typeClassification.existing.length,
      missingPluginTypeCount: typeClassification.missing.length,
      conflictingPluginTypeCount: typeClassification.conflicting.length,
      existingStepCount: stepClassification.existing.length,
      missingStepCount: stepClassification.missing.length,
      conflictingStepCount: stepClassification.conflicting.length,
      existingImageCount: imageClassification.existing.length,
      missingImageCount: imageClassification.missing.length,
      conflictingImageCount: imageClassification.conflicting.length,
    });
    audit.plan = resumePlan;
    audit.preflight = {
      existingAssemblyCount: assemblyRows.length,
      existingPluginTypes: typeClassification.existing.map(({ definition, row }) => ({ definition, id: row.plugintypeid, assemblyLookup: row._pluginassemblyid_value })),
      missingPluginTypes: typeClassification.missing,
      conflictingPluginTypes: typeClassification.conflicting,
      existingSteps: stepClassification.existing.map(({ definition, row }) => ({ logicalIdentifier: definition.logicalIdentifier, id: row.sdkmessageprocessingstepid, statecode: row.statecode, statuscode: row.statuscode })),
      missingSteps: stepClassification.missing.map((step) => step.logicalIdentifier),
      conflictingSteps: stepClassification.conflicting,
      existingImages: imageClassification.existing.map(({ step, image, row }) => ({ logicalIdentifier: step.logicalIdentifier, name: image.name, id: row.sdkmessageprocessingstepimageid })),
      missingImages: imageClassification.missing.map(({ step, image }) => `${step.logicalIdentifier}:${image.name}`),
      conflictingImages: imageClassification.conflicting,
      assembly: { pluginassemblyid: assemblyRows[0].pluginassemblyid, pluginassemblyidunique: assemblyRows[0].pluginassemblyidunique, name: assemblyRows[0].name, version: assemblyRows[0].version, publickeytoken: assemblyRows[0].publickeytoken, isolationmode: assemblyRows[0].isolationmode, sourcetype: assemblyRows[0].sourcetype, ismanaged: assemblyRows[0].ismanaged },
    };
    assert(isGuid(assemblyRows[0].pluginassemblyid), "Existing Assembly primary pluginassemblyid is invalid.");
    assert(assemblyRows[0].name === ASSEMBLY_NAME && assemblyRows[0].publickeytoken === EXPECTED_TOKEN && Number(assemblyRows[0].isolationmode) === 2 && Number(assemblyRows[0].sourcetype) === 0 && assemblyRows[0].ismanaged === false, "Existing Assembly identity does not match the frozen artifact.");
    audit.actual.pluginAssembly = { id: assemblyId, pluginassemblyidunique: assemblyRows[0].pluginassemblyidunique, status: "reused_existing_assembly" };

    const messages = (await get("/api/data/v9.2/sdkmessages?$select=sdkmessageid,name&$filter=name eq 'Create' or name eq 'Update' or name eq 'Delete'")).value || [];
    const messageByName = Object.fromEntries(messages.map((message) => [message.name, message.sdkmessageid]));
    assert(["Create", "Update", "Delete"].every((name) => isGuid(messageByName[name])), "Required SDK messages are unavailable.");
    const filters = (await get(`/api/data/v9.2/sdkmessagefilters?$select=sdkmessagefilterid,primaryobjecttypecode,_sdkmessageid_value&$filter=primaryobjecttypecode eq '${PRIMARY_ENTITY}'`)).value || [];
    const filterByMessageId = Object.fromEntries(filters.map((filter) => [filter._sdkmessageid_value, filter.sdkmessagefilterid]));
    assert(["Create", "Update", "Delete"].every((name) => isGuid(filterByMessageId[messageByName[name]])), "Required SDK Message Filters are unavailable.");

    if (dryRun) {
      audit.status = "dry-run";
      audit.completedAtUtc = new Date().toISOString();
      await saveAudit("resume-dry-run.json");
      console.log(JSON.stringify({ status: "dry-run", auditDir, existingAssemblyId: assemblyId, plan: resumePlan, existingPluginTypes: typeClassification.existing.length, missingPluginTypes: typeClassification.missing.length, conflictingPluginTypes: typeClassification.conflicting.length, preflight: audit.preflight, readRequests: audit.readRequests, writeRequests: 0, networkRequests: audit.readRequests, writesExecuted: false }, null, 2));
      return;
    }

    let pluginTypes = typeClassification.existing.map(({ row }) => row);
    audit.actual.pluginTypes = pluginTypes.map((type) => ({ id: type.plugintypeid, typename: type.typename, name: type.name, friendlyname: type.friendlyname, assemblyLookup: type._pluginassemblyid_value, status: "existing-and-matching" }));
    const verifyTypeDefinition = (row, definition) => {
      assert(row.typename === definition.typename && row.name === definition.name && row.friendlyname === definition.friendlyName && lower(row._pluginassemblyid_value) === lower(assemblyId), `Plugin Type readback mismatch for ${definition.typename}.`);
    };
    for (const definition of typeClassification.missing) {
      let response;
      let status = "created";
      try {
        response = await post("/api/data/v9.2/plugintypes", buildPluginTypePayload(definition, assemblyId), "pluginTypePost");
      } catch (error) {
        const recovered = await findPluginTypeByDefinition(get, definition, assemblyId);
        if (recovered) {
          status = error.status === 409 ? "reused-after-duplicate" : "created-after-post-error";
          pluginTypes.push(recovered);
          audit.actual.pluginTypes.push({ id: recovered.plugintypeid, typename: recovered.typename, name: recovered.name, friendlyname: recovered.friendlyname, assemblyLookup: recovered._pluginassemblyid_value, status });
          continue;
        }
        throw error;
      }
      const id = extractId(response, "plugintype");
      const resolved = await resolvePluginTypeAfterWrite(get, id, definition, assemblyId);
      recordReadAfterWrite(audit, "PluginType", definition.typename, resolved.readAfterWrite);
      const created = resolved.row;
      if (resolved.status) status = resolved.status;
      assert(created, `Plugin Type ${definition.typename} was not visible after read-after-write retry; no POST retry was attempted.`);
      verifyTypeDefinition(created, definition);
      pluginTypes.push(created);
      audit.actual.pluginTypes.push({ id: created.plugintypeid, typename: created.typename, name: created.name, friendlyname: created.friendlyname, assemblyLookup: created._pluginassemblyid_value, status });
    }
    assert(pluginTypes.length === pluginTypeDefinitions.length, `Blocked: expected 3 Plugin Types, got ${pluginTypes.length}.`);
    assert(unique(pluginTypes.map((type) => type.typename)).sort().join("|") === expectedPluginTypeNames.slice().sort().join("|"), "Plugin Type names mismatch after assembly registration.");
    const pluginTypeByName = Object.fromEntries(pluginTypes.map((type) => [type.typename, type.plugintypeid]));
    audit.actual.pluginTypes = pluginTypes.map((type) => ({ id: type.plugintypeid, typename: type.typename, name: type.name, friendlyname: type.friendlyname, assemblyLookup: type._pluginassemblyid_value, status: audit.actual.pluginTypes.find((item) => item.id === type.plugintypeid)?.status || "verified" }));

    const stepIdByLogicalIdentifier = Object.fromEntries(stepClassification.existing.map(({ definition, row }) => [definition.logicalIdentifier, row.sdkmessageprocessingstepid]));
    for (const { definition: step, row } of stepClassification.existing) {
      let verified = row;
      let status = "existing-and-matching";
      if (!(Number(verified.statecode) === 1 && Number(verified.statuscode) === 2)) {
        await patch(`/api/data/v9.2/sdkmessageprocessingsteps(${verified.sdkmessageprocessingstepid})`, { statecode: 1, statuscode: 2 }, "stepPatch");
        const result = await readAfterWriteById(get, `/api/data/v9.2/sdkmessageprocessingsteps(${verified.sdkmessageprocessingstepid})?$select=sdkmessageprocessingstepid,name,stage,mode,statecode,statuscode,rank,filteringattributes,_plugintypeid_value,_sdkmessageid_value,_sdkmessagefilterid_value`, `disabled existing step ${step.logicalIdentifier}`);
        recordReadAfterWrite(audit, "StepDisabled", step.logicalIdentifier, result);
        verified = result.row;
        assert(verified, `Disabled existing Step ${step.logicalIdentifier} was not visible after read-after-write retry.`);
        status = "existing-disabled";
      }
      assert(Number(verified.statecode) === 1 && Number(verified.statuscode) === 2, `Step ${step.logicalIdentifier} is not Disabled.`);
      audit.actual.steps.push({ id: verified.sdkmessageprocessingstepid, logicalIdentifier: step.logicalIdentifier, name: verified.name, message: step.message, stage: verified.stage, mode: verified.mode, rank: verified.rank, statecode: verified.statecode, statuscode: verified.statuscode, filteringattributes: verified.filteringattributes, status });
    }
    for (const step of stepClassification.missing) {
      const pluginTypeId = pluginTypeByName[step.pluginType];
      const messageId = messageByName[step.message];
      const filterId = filterByMessageId[messageId];
      assert(isGuid(pluginTypeId) && isGuid(messageId) && isGuid(filterId), `Missing registration dependency for ${step.logicalIdentifier}.`);
      const payload = buildStepPayload(step, messageId, filterId, pluginTypeId);
      let response;
      try {
        response = await post("/api/data/v9.2/sdkmessageprocessingsteps", payload, "stepPost");
      } catch (error) {
        await saveAudit("registration-audit-failed.json");
        throw error;
      }
      const stepId = extractId(response, "sdkmessageprocessingstep");
      let result = await readAfterWriteById(get, `/api/data/v9.2/sdkmessageprocessingsteps(${stepId})?$select=sdkmessageprocessingstepid,name,stage,mode,statecode,statuscode,rank,filteringattributes,_plugintypeid_value,_sdkmessageid_value,_sdkmessagefilterid_value`, `step ${step.logicalIdentifier}`);
      recordReadAfterWrite(audit, "Step", step.logicalIdentifier, result);
      let verified = result.row;
      assert(verified, `Step ${step.logicalIdentifier} was not visible after read-after-write retry; no POST retry was attempted.`);
      if (!(Number(verified.statecode) === 1 && Number(verified.statuscode) === 2)) {
        await patch(`/api/data/v9.2/sdkmessageprocessingsteps(${stepId})`, { statecode: 1, statuscode: 2 }, "stepPatch");
        result = await readAfterWriteById(get, `/api/data/v9.2/sdkmessageprocessingsteps(${stepId})?$select=sdkmessageprocessingstepid,name,stage,mode,statecode,statuscode,rank,filteringattributes,_plugintypeid_value,_sdkmessageid_value,_sdkmessagefilterid_value`, `disabled step ${step.logicalIdentifier}`);
        recordReadAfterWrite(audit, "StepDisabled", step.logicalIdentifier, result);
        verified = result.row;
        assert(verified, `Disabled Step ${step.logicalIdentifier} was not visible after read-after-write retry.`);
      }
      assert(Number(verified.statecode) === 1 && Number(verified.statuscode) === 2, `Step ${step.logicalIdentifier} is not Disabled after create.`);
      stepIdByLogicalIdentifier[step.logicalIdentifier] = stepId;
      audit.actual.steps.push({ id: stepId, logicalIdentifier: step.logicalIdentifier, name: verified.name, message: step.message, stage: verified.stage, mode: verified.mode, rank: verified.rank, statecode: verified.statecode, statuscode: verified.statuscode, filteringattributes: verified.filteringattributes });
    }
    assert(Object.keys(stepIdByLogicalIdentifier).length === manifest.steps.length, `Blocked: expected ${manifest.steps.length} Steps, got ${Object.keys(stepIdByLogicalIdentifier).length}.`);

    for (const { step, image, row } of imageClassification.existing) {
      audit.actual.images.push({ id: row.sdkmessageprocessingstepimageid, step: step.logicalIdentifier, name: row.name, alias: row.entityalias, imageType: row.imagetype, attributes: row.attributes, messagePropertyName: row.messagepropertyname, status: "existing-and-matching" });
    }
    for (const { step, image } of imageClassification.missing) {
      const stepId = stepIdByLogicalIdentifier[step.logicalIdentifier];
      const payload = buildImagePayloadForMessage(image, stepId, step.message);
      let response;
      try {
        response = await post("/api/data/v9.2/sdkmessageprocessingstepimages", payload, "imagePost");
      } catch (error) {
        await saveAudit("registration-audit-failed.json");
        throw error;
      }
      const imageId = extractId(response, "sdkmessageprocessingstepimage");
      const imageResult = await readAfterWriteById(get, `/api/data/v9.2/sdkmessageprocessingstepimages(${imageId})?$select=sdkmessageprocessingstepimageid,name,entityalias,imagetype,attributes,messagepropertyname,_sdkmessageprocessingstepid_value`, `image ${step.logicalIdentifier}:${image.name}`);
      recordReadAfterWrite(audit, "Image", `${step.logicalIdentifier}:${image.name}`, imageResult);
      const imageRow = imageResult.row;
      assert(imageRow, `Image ${step.logicalIdentifier}:${image.name} was not visible after read-after-write retry; no POST retry was attempted.`);
      assert(imageRow.name === image.name && imageRow.entityalias === image.alias && Number(imageRow.imagetype) === (image.type === "PreImage" ? 0 : 1) && imageRow.attributes === image.fields.join(",") && imageRow.messagepropertyname === messagePropertyNameForMessage(step.message) && lower(imageRow._sdkmessageprocessingstepid_value) === lower(stepId), `Image readback mismatch for ${step.logicalIdentifier}:${image.name}.`);
      audit.actual.images.push({ id: imageId, step: step.logicalIdentifier, name: imageRow.name, alias: imageRow.entityalias, imageType: imageRow.imagetype, attributes: imageRow.attributes, messagePropertyName: imageRow.messagepropertyname, status: "created" });
    }
    assert(audit.actual.images.length === manifest.steps.flatMap((step) => step.images).length, `Blocked: expected ${manifest.steps.flatMap((step) => step.images).length} Images, got ${audit.actual.images.length}.`);

    const assemblyComponents = (await get(`/api/data/v9.2/solutioncomponents?$select=solutioncomponentid,componenttype,objectid,rootcomponentbehavior,rootsolutioncomponentid&$filter=_solutionid_value eq ${solution.solutionid} and componenttype eq ${COMPONENT_TYPES.pluginAssembly} and objectid eq ${assemblyId}`)).value || [];
    assert(assemblyComponents.length === 1 && Number(assemblyComponents[0].rootcomponentbehavior) === 0, "Blocked: Plugin Assembly root must include subcomponents before Plugin Types can be considered contained.");
    audit.actual.solutionComponents.push(...pluginTypes.map((type) => ({ component: `pluginType:${type.typename}`, componentId: type.plugintypeid, componentType: COMPONENT_TYPES.pluginType, status: "includedAsAssemblySubcomponent", rootSolutionComponentId: assemblyComponents[0].solutioncomponentid })));
    const imageIds = audit.actual.images.map((image) => image.id);
    const directImageComponents = imageIds.length
      ? (await get(`/api/data/v9.2/solutioncomponents?$select=solutioncomponentid,componenttype,objectid,rootcomponentbehavior,rootsolutioncomponentid&$filter=_solutionid_value eq ${solution.solutionid} and componenttype eq ${COMPONENT_TYPES.image} and (${imageIds.map((id) => `objectid eq ${id}`).join(" or ")})`)).value || []
      : [];
    const directImageIds = new Set(directImageComponents.map((component) => lower(component.objectid)));
    const imagesMissingDirectMembership = audit.actual.images.filter((image) => !directImageIds.has(lower(image.id)));
    const stepsNeedingSubcomponents = new Set(imagesMissingDirectMembership.map((image) => image.step));
    const componentTargets = [
      { type: COMPONENT_TYPES.pluginAssembly, id: assemblyId, label: "pluginAssembly", doNotIncludeSubcomponents: true },
      ...Object.entries(stepIdByLogicalIdentifier).map(([logicalIdentifier, id]) => ({ type: COMPONENT_TYPES.step, id, label: `step:${logicalIdentifier}`, doNotIncludeSubcomponents: !stepsNeedingSubcomponents.has(logicalIdentifier) })),
    ];
    for (const component of componentTargets) {
      const existing = (await get(`/api/data/v9.2/solutioncomponents?$select=solutioncomponentid,componenttype,objectid,rootcomponentbehavior,rootsolutioncomponentid&$filter=_solutionid_value eq ${solution.solutionid} and componenttype eq ${component.type} and objectid eq ${component.id}`)).value || [];
      if (existing.length === 0) {
        const response = await post("/api/data/v9.2/AddSolutionComponent", { ComponentId: component.id, ComponentType: component.type, SolutionUniqueName: SOLUTION, AddRequiredComponents: false, DoNotIncludeSubcomponents: component.doNotIncludeSubcomponents }, "solutionComponentPost", {});
        audit.actual.solutionComponents.push({ component: component.label, componentId: component.id, componentType: component.type, status: "added", response: responseSummary(response) });
      } else if (existing.length === 1) {
        if (component.type === COMPONENT_TYPES.step && component.doNotIncludeSubcomponents === false && Number(existing[0].rootcomponentbehavior) === 0) {
          const response = await post("/api/data/v9.2/AddSolutionComponent", { ComponentId: component.id, ComponentType: component.type, SolutionUniqueName: SOLUTION, AddRequiredComponents: false, DoNotIncludeSubcomponents: false }, "solutionComponentPost", {});
          audit.actual.solutionComponents.push({ component: component.label, componentId: component.id, componentType: component.type, status: "updatedToIncludeSubcomponents", solutionComponentId: existing[0].solutioncomponentid, response: responseSummary(response) });
        } else {
          audit.actual.solutionComponents.push({ component: component.label, componentId: component.id, componentType: component.type, status: "alreadyExistsAndValid", solutionComponentId: existing[0].solutioncomponentid });
        }
      } else {
        throw new Error(`Blocked: duplicate solution components for ${component.label}.`);
      }
    }
    const finalImageComponents = imageIds.length
      ? (await get(`/api/data/v9.2/solutioncomponents?$select=solutioncomponentid,componenttype,objectid,rootcomponentbehavior,rootsolutioncomponentid&$filter=_solutionid_value eq ${solution.solutionid} and componenttype eq ${COMPONENT_TYPES.image} and (${imageIds.map((id) => `objectid eq ${id}`).join(" or ")})`)).value || []
      : [];
    const finalStepComponents = (await get(`/api/data/v9.2/solutioncomponents?$select=solutioncomponentid,componenttype,objectid,rootcomponentbehavior,rootsolutioncomponentid&$filter=_solutionid_value eq ${solution.solutionid} and componenttype eq ${COMPONENT_TYPES.step} and (${Object.values(stepIdByLogicalIdentifier).map((id) => `objectid eq ${id}`).join(" or ")})`)).value || [];
    const stepRootById = new Map(finalStepComponents.map((component) => [lower(component.objectid), component]));
    const directImageIdSet = new Set(finalImageComponents.map((component) => lower(component.objectid)));
    const unresolvedImages = audit.actual.images.filter((image) => !directImageIdSet.has(lower(image.id)) && Number(stepRootById.get(lower(stepIdByLogicalIdentifier[image.step]))?.rootcomponentbehavior) !== 0);
    assert(unresolvedImages.length === 0, `Blocked: Image solution containment unresolved for ${unresolvedImages.map((image) => `${image.step}:${image.name}`).join(", ")}.`);
    audit.actual.imageSolutionContainment = { directCount: finalImageComponents.length, expectedCount: imageIds.length, viaStepRootCount: imageIds.length - finalImageComponents.length, stepRootIncludesSubcomponents: finalStepComponents.filter((component) => Number(component.rootcomponentbehavior) === 0).length };

    const finalAssembly = await querySingle(get, `/api/data/v9.2/pluginassemblies(${assemblyId})?$select=pluginassemblyid,name,version,publickeytoken,isolationmode,sourcetype,ismanaged`, "final plugin assembly");
    const finalTypes = (await get(`/api/data/v9.2/plugintypes?$select=plugintypeid,typename,name,friendlyname,_pluginassemblyid_value&$filter=_pluginassemblyid_value eq ${assemblyId}`)).value || [];
    const finalSteps = (await get(`/api/data/v9.2/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,stage,mode,statecode,statuscode,rank,filteringattributes,_plugintypeid_value,_sdkmessageid_value,_sdkmessagefilterid_value&$filter=_plugintypeid_value eq ${pluginTypeByName[manifest.steps[0].pluginType]}`)).value || [];
    const finalImages = [];
    for (const stepId of Object.values(stepIdByLogicalIdentifier)) {
      finalImages.push(...((await get(`/api/data/v9.2/sdkmessageprocessingstepimages?$select=sdkmessageprocessingstepimageid,name,entityalias,imagetype,attributes,messagepropertyname,_sdkmessageprocessingstepid_value&$filter=_sdkmessageprocessingstepid_value eq ${stepId}`)).value || []));
    }
    audit.actual.final = { assembly: finalAssembly, pluginTypes: finalTypes, steps: finalSteps, images: finalImages };
    audit.completedAtUtc = new Date().toISOString();
    audit.status = "success";
    await saveAudit();
    console.log(JSON.stringify({ status: "success", auditDir, assemblyId, pluginTypes: finalTypes.map((type) => ({ id: type.plugintypeid, typename: type.typename, name: type.name, friendlyname: type.friendlyname, assemblyLookup: type._pluginassemblyid_value })), stepIds: audit.actual.steps.map((step) => ({ id: step.id, logicalIdentifier: step.logicalIdentifier, statecode: step.statecode, statuscode: step.statuscode })), imageCount: finalImages.length, writeRequests: audit.writeRequests, writeCounts: audit.writeCounts, publishExecuted: false, businessDataWrites: 0, productionRequests: 0 }, null, 2));
  } catch (error) {
    audit.status = "blocked";
    audit.completedAtUtc = new Date().toISOString();
    audit.errors.push({ operation: "run", error: errorSummary(error) });
    await saveAudit("registration-audit-failed.json");
    throw error;
  }
}

runDataverseCli(import.meta.url, main);

export { buildImagePayloadForMessage, buildPluginTypePayload, buildResumePlan, buildStepPayload, classifyImages, classifyPluginTypes, classifySteps, extractId, findPluginTypeByDefinition, readAfterWriteById, resolvePluginTypeAfterWrite, validatePluginTypeDefinitions };
