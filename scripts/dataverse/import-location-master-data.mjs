import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, runDataverseCli } from "./lib/environment-safety.mjs";

const TARGET_HOSTNAME = ["org91f5f65f", "crm5", "dynamics", "com"].join(".");
const TABLE = "aigw_location";
const PRIMARY_NAME = "aigw_name";

const normalizeName = (value) => String(value ?? "").trim().toLowerCase();
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export function parseArguments(argv = []) {
  const sourceIndex = argv.indexOf("--source");
  const source = sourceIndex >= 0 ? argv[sourceIndex + 1] : "";
  const apply = argv.includes("--apply");
  const explicitDryRun = argv.includes("--dry-run");
  if (!source || source.startsWith("--")) throw new Error("--source is required.");
  if (!path.isAbsolute(source)) throw new Error("--source must be an absolute external file path.");
  if (apply && explicitDryRun) throw new Error("Choose either --dry-run or --apply, not both.");
  return { source, apply, dryRun: !apply };
}

export function parseCsv(text) {
  const input = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted value.");
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function duplicateCount(values, keyFactory) {
  const seen = new Set();
  let duplicates = 0;
  for (const value of values) {
    const key = keyFactory(value);
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

export function validateLocationCsv(text) {
  const rows = parseCsv(text);
  const header = rows[0] || [];
  const nameIndex = header.indexOf("Name");
  const dataRows = rows.slice(1);
  const blankRows = dataRows.filter((item) => item.every((value) => !String(value).trim()));
  const nonblankRows = dataRows.filter((item) => !item.every((value) => !String(value).trim()));
  const names = nameIndex < 0 ? [] : nonblankRows.map((item) => String(item[nameIndex] ?? "").trim());
  const emptyNameCount = names.filter((name) => !name).length;
  const exactDuplicateCount = duplicateCount(names.filter(Boolean), (name) => name);
  const normalizedDuplicateCount = duplicateCount(names.filter(Boolean), normalizeName);
  const rowColumnMismatchCount = nonblankRows.filter((item) => item.length !== 1).length;
  const headerValid = header.length === 1 && header[0] === "Name";
  const violations = [];
  if (!headerValid) violations.push("header must be exactly one column named Name");
  if (rowColumnMismatchCount) violations.push("data rows contain extra columns");
  if (emptyNameCount) violations.push("empty names are not allowed");
  if (exactDuplicateCount) violations.push("exact duplicate names are not allowed");
  if (normalizedDuplicateCount) violations.push("trimmed case-insensitive duplicate names are not allowed");
  return {
    originalRowCount: rows.length,
    dataRowCount: dataRows.length,
    validNameCount: names.filter(Boolean).length,
    blankRowCount: blankRows.length,
    emptyNameCount,
    exactDuplicateCount,
    normalizedDuplicateCount,
    header,
    headerValid,
    extraColumnCount: Math.max(0, header.length - 1),
    rowColumnMismatchCount,
    names: names.filter(Boolean),
    ready: violations.length === 0,
    violations,
  };
}

export function validateTargetEnvironment(dataverseUrl) {
  const parsed = new URL(dataverseUrl);
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== TARGET_HOSTNAME || parsed.pathname !== "/") {
    throw new Error("Only the approved test Dataverse organization root is allowed.");
  }
  return parsed.origin;
}

export function buildLocationPayload(name) {
  return { [PRIMARY_NAME]: String(name).trim() };
}

export function classifyLocations(names, existingRows, primaryId = "aigw_locationid") {
  const byName = new Map();
  for (const row of existingRows) {
    const key = normalizeName(row[PRIMARY_NAME]);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  }
  const result = { existingActive: [], existingInactive: [], missing: [], ambiguousDuplicate: [] };
  for (const name of names) {
    const rows = byName.get(normalizeName(name)) || [];
    if (rows.length === 0) result.missing.push({ name });
    else if (rows.length > 1) result.ambiguousDuplicate.push({ name, recordIds: rows.map((row) => row[primaryId]) });
    else if (Number(rows[0].statecode) === 0) result.existingActive.push({ name, recordId: rows[0][primaryId] });
    else result.existingInactive.push({ name, recordId: rows[0][primaryId], statecode: rows[0].statecode });
  }
  return result;
}

function labelsByLanguage(displayName) {
  return Object.fromEntries((displayName?.LocalizedLabels || []).map((item) => [String(item.LanguageCode), item.Label]));
}

export function findOpportunityLocationLookups(attributes) {
  return attributes
    .map((attribute) => ({
      logicalName: attribute.LogicalName,
      schemaName: attribute.SchemaName,
      displayNames: labelsByLanguage(attribute.DisplayName),
      targets: attribute.Targets || [],
      isValidForRead: attribute.IsValidForRead,
    }))
    .filter((attribute) => attribute.logicalName === "aigw_opportunitylocation");
}

function requiredUserFields(attributes) {
  return attributes.filter((attribute) =>
    attribute.LogicalName !== PRIMARY_NAME
    && attribute.RequiredLevel?.Value === "ApplicationRequired"
    && attribute.IsValidForCreate === true);
}

function parseCreatedId(response, primaryId) {
  const bodyId = response?.body?.[primaryId];
  if (bodyId) return String(bodyId).replace(/[{}]/g, "").toLowerCase();
  const entityId = response?.headers?.get?.("odata-entityid") || response?.headers?.get?.("OData-EntityId") || "";
  const match = /\(([0-9a-f-]{36})\)/i.exec(entityId);
  return match?.[1]?.toLowerCase() || null;
}

async function writeAudit(audit) {
  const directory = path.join(process.cwd(), "local-artifacts", "d365", "location-import", `phase1c5r2e2f1_${stamp()}`);
  await fs.mkdir(directory, { recursive: true });
  const output = path.join(directory, "audit.json");
  await fs.writeFile(output, `${JSON.stringify(audit, null, 2)}\n`);
  return output;
}

export async function main({ argv = process.argv.slice(2), env = process.env } = {}) {
  const options = parseArguments(argv);
  const csvText = await fs.readFile(options.source, "utf8");
  const csv = validateLocationCsv(csvText);
  const audit = {
    phase: "1C-5R2E-2F1",
    mode: options.apply ? "apply" : "dry-run",
    source: { fileName: path.basename(options.source), external: true, absolutePathRecorded: false },
    csv: { ...csv, names: csv.names },
    metadata: null,
    lookupCandidates: [],
    before: null,
    classification: null,
    created: [],
    failed: [],
    after: null,
    requestCounts: { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, businessWrites: 0, productionRequests: 0 },
    status: "running",
  };

  if (!csv.ready) {
    audit.status = "blocked_csv_validation";
    const output = await writeAudit(audit);
    console.log(JSON.stringify({ status: audit.status, csv: { ...csv, names: undefined }, requestCounts: audit.requestCounts, output }, null, 2));
    throw new Error(`CSV validation blocked import: ${csv.violations.join("; ")}`);
  }

  const dataverseUrl = validateTargetEnvironment(getDataverseUrl(env));
  if (options.apply) assertDataverseScriptGate({ mode: "write-capable" });
  const client = createDynamicsClient({ env });
  if (validateTargetEnvironment(client.config.dataverseUrl) !== dataverseUrl) throw new Error("Dataverse client URL mismatch.");

  const request = async (method, endpoint, body) => {
    if (new URL(dataverseUrl).hostname.toLowerCase() !== TARGET_HOSTNAME) {
      audit.requestCounts.productionRequests += 1;
      throw new Error("Production request blocked.");
    }
    audit.requestCounts[method] += 1;
    if (method === "GET") return client.dataverseGet(endpoint);
    if (method === "POST") return client.dataversePost(endpoint, body);
    throw new Error(`Unsupported method ${method}.`);
  };
  const get = async (endpoint) => (await request("GET", endpoint)).body;
  const getAll = async (endpoint) => {
    const rows = [];
    let next = endpoint;
    while (next) {
      const body = await get(next);
      rows.push(...(body.value || []));
      next = body["@odata.nextLink"] || null;
    }
    return rows;
  };

  const entity = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TABLE}')?$select=LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,MetadataId`);
  if (entity.LogicalName !== TABLE || !entity.EntitySetName || !entity.PrimaryIdAttribute || entity.PrimaryNameAttribute !== PRIMARY_NAME) {
    audit.status = "blocked_metadata_mismatch";
    audit.metadata = entity;
    const output = await writeAudit(audit);
    console.log(JSON.stringify({ status: audit.status, metadata: entity, requestCounts: audit.requestCounts, output }, null, 2));
    throw new Error("Location metadata does not match the required contract.");
  }

  const attributes = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TABLE}')/Attributes?$select=LogicalName,SchemaName,AttributeType,RequiredLevel,IsValidForCreate,IsValidForRead`);
  const primaryName = (attributes.value || []).find((attribute) => attribute.LogicalName === PRIMARY_NAME);
  const extraRequired = requiredUserFields(attributes.value || []);
  if (!primaryName || primaryName.IsValidForCreate !== true || primaryName.IsValidForRead !== true || extraRequired.length) {
    audit.status = "blocked_attribute_contract";
    audit.metadata = { entity, primaryName, extraRequired };
    const output = await writeAudit(audit);
    console.log(JSON.stringify({ status: audit.status, metadata: audit.metadata, requestCounts: audit.requestCounts, output }, null, 2));
    throw new Error("Location attribute contract is not safe for name-only creation.");
  }

  const opportunityLookups = await get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,SchemaName,DisplayName,Targets,IsValidForRead");
  const lookupCandidates = findOpportunityLocationLookups(opportunityLookups.value || []);
  audit.lookupCandidates = lookupCandidates;
  if (lookupCandidates.length !== 1 || lookupCandidates[0].logicalName !== "aigw_opportunitylocation" || !lookupCandidates[0].targets.includes(TABLE)) {
    audit.status = "blocked_lookup_mapping";
    const output = await writeAudit(audit);
    console.log(JSON.stringify({ status: audit.status, lookupCandidates, requestCounts: audit.requestCounts, output }, null, 2));
    throw new Error("Opportunity case-location Lookup mapping is not uniquely confirmed.");
  }

  const entitySetName = entity.EntitySetName;
  const primaryId = entity.PrimaryIdAttribute;
  const readLocations = () => getAll(`/api/data/v9.2/${entitySetName}?$select=${primaryId},${PRIMARY_NAME},statecode,statuscode&$top=5000`);
  const beforeRows = await readLocations();
  const classification = classifyLocations(csv.names, beforeRows, primaryId);
  audit.metadata = { entity, primaryName, extraRequiredCount: 0 };
  audit.before = { totalRecords: beforeRows.length };
  audit.classification = classification;
  const conflictCount = classification.existingInactive.length + classification.ambiguousDuplicate.length;
  if (conflictCount) {
    audit.status = "blocked_existing_conflict";
    const output = await writeAudit(audit);
    console.log(JSON.stringify({ status: audit.status, classification, requestCounts: audit.requestCounts, output }, null, 2));
    throw new Error("Inactive or ambiguous existing Location conflicts block the entire import.");
  }

  if (!options.apply) {
    audit.status = "dry_run_ready";
    const output = await writeAudit(audit);
    console.log(JSON.stringify({ status: audit.status, csvValidCount: csv.validNameCount, existingActive: classification.existingActive.length, missing: classification.missing.length, toCreate: classification.missing.map((item) => item.name), skipped: classification.existingActive.map((item) => item.name), requestCounts: audit.requestCounts, output }, null, 2));
    return audit;
  }

  for (const item of classification.missing) {
    const currentRows = await readLocations();
    const current = classifyLocations([item.name], currentRows, primaryId);
    if (current.existingInactive.length || current.ambiguousDuplicate.length) {
      audit.failed.push({ name: item.name, reason: "concurrent conflict detected" });
      break;
    }
    if (current.existingActive.length) continue;
    try {
      const response = await request("POST", `/api/data/v9.2/${entitySetName}`, buildLocationPayload(item.name));
      const recordId = parseCreatedId(response, primaryId);
      if (!recordId) throw new Error(`Create response did not contain ${primaryId}.`);
      audit.requestCounts.businessWrites += 1;
      audit.created.push({ name: item.name, recordId, httpStatus: response.status });
    } catch (error) {
      audit.failed.push({ name: item.name, reason: error.message, status: error.status || null });
      break;
    }
  }

  const afterRows = await readLocations();
  const afterClassification = classifyLocations(csv.names, afterRows, primaryId);
  const residualMismatchCount = afterClassification.missing.length + afterClassification.existingInactive.length + afterClassification.ambiguousDuplicate.length;
  audit.after = { totalRecords: afterRows.length, classification: afterClassification, residualMismatchCount };
  audit.status = audit.failed.length || residualMismatchCount ? "partial_or_failed" : "complete";
  const output = await writeAudit(audit);
  console.log(JSON.stringify({ status: audit.status, created: audit.created, failed: audit.failed, skipped: afterClassification.existingActive.length - audit.created.length, residualMismatchCount, requestCounts: audit.requestCounts, output }, null, 2));
  if (audit.status !== "complete") throw new Error("Location import did not complete; inspect the audit log before rerunning.");
  return audit;
}

runDataverseCli(import.meta.url, main);
