import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, runDataverseCli } from "./lib/environment-safety.mjs";

const SOLUTION = "CRMAIGatewayDemo";
const SOLUTION_DISPLAY_NAME = "CRM AI Gateway Demo";
const PUBLISHER_PREFIX = "aigw";
const TARGET_HOSTNAME = ["org91f5f65f", "crm5", "dynamics", "com"].join(".");
const PRODUCTION_HOSTNAME = ["lcn-crm", "crm7", "dynamics", "com"].join(".");
const AUTHORIZATION = "CONFIRM_D365_TEST_WRITE_PHASE_1C_5R2E_2D4B";
const TABLE = "aigw_polpodlocation";
const TABLE_SCHEMA = "aigw_PolPodLocation";
const PRIMARY_NAME = "aigw_keycode";
const PRIMARY_SCHEMA = "aigw_KeyCode";
const VIEW_NAME = "POL/POD Lookup View - AI Demo";
const FORM_ID = "97a1555b-0903-408a-ac63-d63aed65b14a";
const PROTECTED_FORM_ID = "8db60b46-b976-f111-ab0e-00224817cb31";
const POL_POD_SECTION = "aigw_fr_summary_pol_pod";
const BPF_ID = "7325b274-6b7c-f111-ab0e-70a8a50388b9";
const LOOKUPS = [
  { logicalName: "aigw_sealandpollookup", schemaName: "aigw_SeaLandPolLookup", label: "海运/陆运装货港", relationship: "aigw_opportunity_sealandpollookup", old: "aigw_sealandpol", control: "aigw_fullreplica_aigw_sealandpol_3ac9f750" },
  { logicalName: "aigw_sealandpodlookup", schemaName: "aigw_SeaLandPodLookup", label: "海运/陆运卸货港", relationship: "aigw_opportunity_sealandpodlookup", old: "aigw_sealandpod", control: "aigw_fullreplica_aigw_sealandpod_4b1bf40c" },
  { logicalName: "aigw_airpollookup", schemaName: "aigw_AirPolLookup", label: "空运装货港", relationship: "aigw_opportunity_airpollookup", old: "aigw_airpol", control: "aigw_fullreplica_aigw_airpol_a2f97f58" },
  { logicalName: "aigw_airpodlookup", schemaName: "aigw_AirPodLookup", label: "空运卸货港", relationship: "aigw_opportunity_airpodlookup", old: "aigw_airpod", control: "aigw_fullreplica_aigw_airpod_f9aae213" },
];
const TARGET_FIELDS = new Set(LOOKUPS.map((item) => item.logicalName));
const OLD_FIELDS = new Set(LOOKUPS.map((item) => item.old));

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lower = (value) => String(value || "").toLowerCase();
const normalizeId = (value) => String(value || "").replace(/[{}]/g, "").toLowerCase();
const is404 = (error) => Number(error?.status) === 404;

function labels(english, chinese = english) {
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.Label",
    LocalizedLabels: [
      { "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: english, LanguageCode: 1033 },
      { "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: chinese, LanguageCode: 2052 },
    ],
  };
}

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeODataString(value) {
  return String(value).replaceAll("'", "''");
}

function parseCsvRows(text) {
  const lines = String(text).replace(/^\uFEFF/, "").trimEnd().split(/\r?\n/);
  if (lines.length < 2 || lines[0].trim() !== '"Key Code","Record ID"') throw new Error("CSV must contain exactly the Key Code and Record ID headers.");
  return lines.slice(1).map((line, index) => {
    const match = /^"((?:[^"]|"")*)","((?:[^"]|"")*)"$/.exec(line);
    if (!match) throw new Error(`CSV row ${index + 2} is not a two-column quoted row.`);
    return { keyCode: match[1].replaceAll('""', '"'), ignoredRecordId: match[2].replaceAll('""', '"') };
  });
}

function validateCsvRows(rows) {
  const keys = rows.map((row) => row.keyCode);
  const duplicates = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
  const blanks = keys.filter((key) => !key.trim());
  if (rows.length !== 2072) throw new Error(`CSV row count mismatch: expected 2072, got ${rows.length}.`);
  if (blanks.length || duplicates.length || !keys.includes("9999: OTR")) throw new Error(`CSV validation failed: blanks=${blanks.length}, duplicates=${duplicates.length}, otr=${keys.includes("9999: OTR")}.`);
  return { rowCount: rows.length, blankCount: blanks.length, duplicateCount: duplicates.length, containsOtr: true, recordIdIgnored: true, keyCodeSha256: sha256(keys.join("\n")) };
}

function buildTablePayload() {
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
    SchemaName: TABLE_SCHEMA,
    DisplayName: labels("POL/POD Location"),
    DisplayCollectionName: labels("POL/POD Location"),
    OwnershipType: "OrganizationOwned",
    IsActivity: false,
    HasActivities: false,
    HasNotes: false,
    IsAuditEnabled: { Value: true },
    Attributes: [{
      "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
      AttributeType: "String",
      AttributeTypeName: { Value: "StringType" },
      SchemaName: PRIMARY_SCHEMA,
      DisplayName: labels("Key Code"),
      RequiredLevel: { Value: "ApplicationRequired", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
      MaxLength: 200,
      FormatName: { Value: "Text" },
      IsPrimaryName: true,
    }],
  };
}

function buildKeyPayload() {
  return {
    SchemaName: "aigw_PolPodLocationKey",
    DisplayName: labels("POL/POD Location Key"),
    KeyAttributes: [PRIMARY_NAME],
  };
}

function buildLookupRelationshipPayload(item) {
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
    SchemaName: item.relationship,
    ReferencedEntity: TABLE,
    ReferencingEntity: "opportunity",
    CascadeConfiguration: {
      Assign: "NoCascade",
      Delete: "Restrict",
      Merge: "NoCascade",
      Reparent: "NoCascade",
      Share: "NoCascade",
      Unshare: "NoCascade",
      RollupView: "NoCascade",
    },
    Lookup: {
      "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
      SchemaName: item.schemaName,
      DisplayName: labels(item.label),
      RequiredLevel: { Value: "ApplicationRequired", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
    },
  };
}

function buildViewPayload(objectTypeCode) {
  const fetchXml = `<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false"><entity name="${TABLE}"><attribute name="${PRIMARY_NAME}" /><order attribute="${PRIMARY_NAME}" descending="false" /></entity></fetch>`;
  const layoutXml = `<grid name="resultset" object="${objectTypeCode}" jump="${PRIMARY_NAME}" select="1" icon="1" preview="1"><row name="result" id="${TABLE}id"><cell name="${PRIMARY_NAME}" width="300" /></row></grid>`;
  return { name: VIEW_NAME, returnedtypecode: TABLE, querytype: 0, isquickfindquery: false, fetchxml: fetchXml, layoutxml: layoutXml };
}

function normalizeViewFetchXml(fetchXml) {
  return String(fetchXml || "").replace(/\s+savedqueryid="[^"]*"/i, "");
}

function replaceAttributeInTag(tag, attribute, value) {
  const escaped = escapeXml(value);
  const pattern = new RegExp(`\\b${attribute}="[^"]*"`);
  return pattern.test(tag) ? tag.replace(pattern, `${attribute}="${escaped}"`) : tag.replace(/\s*\/?>(\s*)$/, ` ${attribute}="${escaped}"$&`);
}

function controlTokens(section) {
  return [...section.matchAll(/<control\b[^>]*?(?:\/>|>[\s\S]*?<\/control>)/g)].map((match) => match[0]);
}

function controlAttribute(control, name) {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(control)?.[1] || "";
}

function replaceLookupControl(section, oldField, newField, viewId) {
  const controls = controlTokens(section).filter((control) => controlAttribute(control, "datafieldname") === oldField);
  if (controls.length === 0) {
    const existing = controlTokens(section).filter((control) => controlAttribute(control, "datafieldname") === newField);
    if (existing.length === 1) return { xml: section, controlId: controlAttribute(existing[0], "id"), alreadyTarget: true };
  }
  if (controls.length !== 1) throw new Error(`Expected exactly one ${oldField} or ${newField} control in ${POL_POD_SECTION}; got old=${controls.length}.`);
  const control = controls[0];
  const opening = /^<control\b[^>]*>/i.exec(control)?.[0] || control;
  let replacement = replaceAttributeInTag(opening, "datafieldname", newField);
  replacement = replacement.replace(/\s*\/>$/i, "");
  const parameters = `<parameters><ViewId>{${viewId.toUpperCase()}}</ViewId><ViewIds>{${viewId.toUpperCase()}}</ViewIds></parameters>`;
  replacement = `${replacement}>${parameters}</control>`;
  return { xml: section.replace(control, replacement), controlId: controlAttribute(control, "id") };
}

function patchPolPodFormXml(formXml, viewId) {
  const sectionMatch = /<section\b[^>]*\bname="aigw_fr_summary_pol_pod"[^>]*>[\s\S]*?<\/section>/i.exec(String(formXml));
  if (!sectionMatch) throw new Error(`Target section ${POL_POD_SECTION} was not found.`);
  let section = sectionMatch[0];
  const changedControls = [];
  for (const item of LOOKUPS) {
    const result = replaceLookupControl(section, item.old, item.logicalName, viewId);
    section = result.xml;
    changedControls.push({ old: item.old, logicalName: item.logicalName, controlId: result.controlId });
  }
  const sectionLabels = /^<section\b[^>]*>\s*(<labels>[\s\S]*?<\/labels>)/i.exec(section)?.[1];
  const desiredLabel = "POL&POD（不适用的情况下，请输入「9999: OTR」）";
  const encoded = escapeXml(desiredLabel);
  if (!sectionLabels) throw new Error("POL/POD section labels are missing.");
  const withChinese = /languagecode="2052"/.test(sectionLabels)
    ? sectionLabels.replace(/(<label\b[^>]*description=")[^"]*("[^>]*languagecode="2052"[^>]*\/>)/i, `$1${encoded}$2`)
    : sectionLabels.replace(/(<label\b[^>]*description=")[^"]*("[^>]*languagecode="1033"[^>]*\/>)/i, `$1${encoded}$2`);
  section = section.replace(sectionLabels, withChinese);
  return { formXml: String(formXml).replace(sectionMatch[0], section), changedControls, sectionLabel2052: desiredLabel };
}

function analyzeFormXml(formXml, formJson = "") {
  const xml = String(formXml || "");
  const tabs = [...xml.matchAll(/<tab\b[^>]*\bname="([^"]+)"/g)].map((match) => match[1]);
  const sections = [...xml.matchAll(/<section\b[^>]*\bname="([^"]+)"/g)].map((match) => match[1]);
  const controls = [...xml.matchAll(/<control\b/g)].length;
  const fields = [...xml.matchAll(/<control\b[^>]*\bdatafieldname="([^"]+)"/g)].map((match) => match[1]);
  const jsonText = typeof formJson === "string" ? formJson : JSON.stringify(formJson || "");
  const polPodSectionLabels = /<section\b[^>]*\bname="aigw_fr_summary_pol_pod"[^>]*>\s*<labels>([\s\S]*?)<\/labels>/i.exec(xml)?.[1] || "";
  const sectionLabelMatch2052 = /<label description="([^"]*)" languagecode="2052"/i.exec(polPodSectionLabels);
  const sectionLabelMatch1033 = /<label description="([^"]*)" languagecode="1033"/i.exec(polPodSectionLabels);
  return {
    hashes: { formXml: sha256(xml), formJson: sha256(formJson) },
    counts: { tabs: tabs.length, sections: sections.length, controls, uniqueBoundFields: new Set(fields).size },
    oldControls: Object.fromEntries([...OLD_FIELDS].map((field) => [field, fields.filter((item) => item === field).length])),
    lookupControls: Object.fromEntries([...TARGET_FIELDS].map((field) => [field, fields.filter((item) => item === field).length])),
    sectionLabel: (sectionLabelMatch2052?.[1] || sectionLabelMatch1033?.[1] || "").replaceAll("&amp;", "&").replaceAll("&quot;", "\""),
    json: {
      present: Boolean(jsonText),
      containsNewLookups: [...TARGET_FIELDS].every((field) => new RegExp(`(?:DataFieldName|datafieldname)[\\\":=]+\\\"?${field}\\\"?`, "i").test(jsonText)),
      containsOldStrings: [...OLD_FIELDS].some((field) => new RegExp(`(?:DataFieldName|datafieldname)[\\\":=]+\\\"?${field}(?:\\\"|[,}])`, "i").test(jsonText)),
    },
    hasUndefined: /undefined/i.test(xml) || /undefined/i.test(jsonText),
  };
}

function buildUpsertPath(entitySetName, keyCode) {
  return `/api/data/v9.2/${entitySetName}(${PRIMARY_NAME}='${escapeODataString(keyCode)}')`;
}

export async function main() {
  const args = process.argv.slice(2);
  const confirmIndex = args.indexOf("--confirm");
  const confirmed = confirmIndex >= 0 && args[confirmIndex + 1] === AUTHORIZATION;
  const safety = assertDataverseScriptGate({ mode: "publish/deploy-capable" });
  if (!confirmed) throw new Error(`Explicit --confirm ${AUTHORIZATION} is required.`);
  if (safety.dataverseUrl !== `https://${TARGET_HOSTNAME}`) throw new Error("Safety gate failed: only the approved test hostname is allowed.");
  if (new URL(safety.dataverseUrl).hostname === PRODUCTION_HOSTNAME) throw new Error("Production hostname is blocked.");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("AI safety gate failed: provider must be demo and external AI disabled.");
  const csvPath = String(process.env.POLPOD_CSV_PATH || "").trim();
  if (!csvPath || !path.isAbsolute(csvPath)) throw new Error("POLPOD_CSV_PATH must be an absolute path to the user-supplied CSV.");
  console.error("POL/POD preflight: safety gate passed for approved test environment.");

  const root = process.cwd();
  const auditDir = path.join(root, "local-artifacts", "d365", "polpod", `phase1c5r2e2d4b_${stamp()}`);
  await fs.mkdir(auditDir, { recursive: true });
  const auditPath = path.join(auditDir, "audit.json");
  const audit = {
    phase: "1C-5R2E-2D4B",
    targetEnvironment: safety.dataverseUrl,
    solution: SOLUTION,
    csv: { sourceOutsideRepository: true, pathRecorded: false },
    requestCounts: { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, businessWrites: 0, productionRequests: 0 },
    created: { table: false, key: false, view: false, lookups: [], formPatched: false },
    skipped: { existingTable: false, existingKey: false, existingView: false, existingLookups: [], existingRecords: 0 },
    import: { created: 0, skipped: 0, failed: 0, total: 0, remaining: 0 },
    protectedComponents: { timeline: "not modified", bpf: "not modified", plugin: "not modified", app: "not modified" },
    status: "running",
  };
  const persist = async () => fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
  await persist();

  const client = createDynamicsClient({ env: { ...process.env, DATAVERSE_TIMEOUT_MS: process.env.POLPOD_TIMEOUT_MS || "60000" } });
  const request = async (method, endpoint, body, options = {}) => {
    if (new URL(safety.dataverseUrl).hostname !== TARGET_HOSTNAME) {
      audit.requestCounts.productionRequests += 1;
      throw new Error("Production request blocked.");
    }
    if (method === "GET") audit.requestCounts.GET += 1;
    if (method === "POST") audit.requestCounts.POST += 1;
    if (method === "PATCH") { audit.requestCounts.PATCH += 1; audit.requestCounts.businessWrites += endpoint.includes("opportunities") ? 0 : 0; }
    if (method === "DELETE") audit.requestCounts.DELETE += 1;
    return client.dataverseRequest(method, endpoint, body, options);
  };
  const get = async (endpoint) => (await request("GET", endpoint)).body;
  const getAll = async (endpoint) => {
    const rows = [];
    let next = endpoint;
    while (next) {
      const body = await get(next);
      rows.push(...(body.value || []));
      next = body["@odata.nextLink"] || "";
    }
    return rows;
  };
  const post = async (endpoint, body, headers = {}) => request("POST", endpoint, body, { headers: { "MSCRM.SolutionUniqueName": SOLUTION, ...headers } });
  const patch = async (endpoint, body, headers = {}) => request("PATCH", endpoint, body, { headers: { "MSCRM.SolutionUniqueName": SOLUTION, ...headers } });
  const maybe = async (endpoint) => { try { return await get(endpoint); } catch (error) { if (is404(error)) return null; throw error; } };
  console.error("POL/POD preflight: reading solution.");
  const solutionRows = await get(`/api/data/v9.2/solutions?$select=solutionid,uniquename,friendlyname,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`);
  if (solutionRows.value?.length !== 1 || solutionRows.value[0].friendlyname !== SOLUTION_DISPLAY_NAME || solutionRows.value[0].ismanaged !== false) throw new Error("Solution gate failed.");
  const solution = solutionRows.value[0];
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`);
  if (publisher.customizationprefix !== PUBLISHER_PREFIX) throw new Error("Publisher prefix gate failed.");
  console.error("POL/POD preflight: solution and publisher validated.");

  const csvRows = parseCsvRows(await fs.readFile(csvPath, "utf8"));
  audit.csv.validation = validateCsvRows(csvRows);
  audit.csv.pathRecorded = false;
  audit.import.total = csvRows.length;
  await fs.writeFile(path.join(auditDir, "csv-validation.json"), `${JSON.stringify(audit.csv.validation, null, 2)}\n`);
  console.error(`POL/POD preflight: CSV validated (${csvRows.length} rows).`);

  const readEntity = () => get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TABLE}')?$select=MetadataId,LogicalName,SchemaName,OwnershipType,IsManaged,PrimaryNameAttribute,EntitySetName,ObjectTypeCode`);
  let entity = await maybe(`/api/data/v9.2/EntityDefinitions(LogicalName='${TABLE}')?$select=MetadataId,LogicalName,SchemaName,OwnershipType,IsManaged,PrimaryNameAttribute,EntitySetName,ObjectTypeCode`);
  if (!entity) {
    const response = await post("/api/data/v9.2/EntityDefinitions", buildTablePayload());
    audit.created.table = true;
    audit.tableCreateResponse = { status: response.status, bodyKeys: Object.keys(response.body || {}) };
    for (let attempt = 0; attempt < 12 && !entity; attempt += 1) { await sleep(attempt ? 1500 : 0); entity = await maybe(`/api/data/v9.2/EntityDefinitions(LogicalName='${TABLE}')?$select=MetadataId,LogicalName,SchemaName,OwnershipType,IsManaged,PrimaryNameAttribute,EntitySetName,ObjectTypeCode`); }
    if (!entity) throw new Error("Created table was not readable after write.");
  } else audit.skipped.existingTable = true;
  if (entity.LogicalName !== TABLE || entity.SchemaName !== TABLE_SCHEMA || entity.OwnershipType !== "OrganizationOwned" || entity.IsManaged !== false || entity.PrimaryNameAttribute !== PRIMARY_NAME) throw new Error("Existing table definition mismatch.");
  const primary = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TABLE}')/Attributes(LogicalName='${PRIMARY_NAME}')/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,AttributeType,MaxLength,RequiredLevel,IsManaged`);
  if (primary.LogicalName !== PRIMARY_NAME || primary.SchemaName !== PRIMARY_SCHEMA || primary.AttributeType !== "String" || primary.MaxLength !== 200 || primary.IsManaged !== false || primary.RequiredLevel?.Value !== "ApplicationRequired") throw new Error("Primary Key Code attribute definition mismatch.");
  audit.table = { ...entity, primaryAttribute: primary };
  await fs.writeFile(path.join(auditDir, "table-before-or-after.json"), `${JSON.stringify(audit.table, null, 2)}\n`);

  const keysEndpoint = `/api/data/v9.2/EntityDefinitions(LogicalName='${TABLE}')/Keys`;
  let keys = await getAll(`${keysEndpoint}?$select=MetadataId,LogicalName,SchemaName,KeyAttributes,EntityKeyIndexStatus,IsManaged`);
  let key = keys.find((item) => item.SchemaName?.toLowerCase() === "aigw_polpodlocationkey");
  if (!key) {
    const response = await post(keysEndpoint, buildKeyPayload());
    audit.created.key = true;
    audit.keyCreateResponse = { status: response.status, bodyKeys: Object.keys(response.body || {}) };
    for (let attempt = 0; attempt < 16; attempt += 1) { await sleep(attempt ? 2000 : 500); keys = await getAll(`${keysEndpoint}?$select=MetadataId,LogicalName,SchemaName,KeyAttributes,EntityKeyIndexStatus,IsManaged`); key = keys.find((item) => item.SchemaName?.toLowerCase() === "aigw_polpodlocationkey"); if (key && (!["Pending", "InProgress"].includes(String(key.EntityKeyIndexStatus))) && String(key.EntityKeyIndexStatus || "Active") !== "Failed") break; }
    if (!key) throw new Error("Created alternate key was not readable after write.");
  } else audit.skipped.existingKey = true;
  if (!key.KeyAttributes?.some((item) => lower(item) === PRIMARY_NAME) || key.IsManaged === true || String(key.EntityKeyIndexStatus || "Active") === "Failed") throw new Error("Alternate key definition mismatch or failed index.");
  audit.key = key;
  await persist();

  const opportunityAttrEndpoint = "/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes";
  const opportunityRelations = await getAll("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/ManyToOneRelationships?$select=MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,IsManaged,CascadeConfiguration");
  const readLookup = async (logicalName) => {
    const matches = await getAll(`${opportunityAttrEndpoint}?$select=LogicalName&$filter=LogicalName eq '${logicalName}'`);
    if (!matches.length) return null;
    return get(`${opportunityAttrEndpoint}(LogicalName='${logicalName}')/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,AttributeType,RequiredLevel,Targets,IsManaged,IsValidForForm,IsValidForRead,IsValidForCreate,IsValidForUpdate`);
  };
  for (const item of LOOKUPS) {
    const existing = await readLookup(item.logicalName);
    if (existing) {
      if (existing.AttributeType !== "Lookup" || existing.SchemaName !== item.schemaName || existing.IsManaged === true || existing.RequiredLevel?.Value !== "ApplicationRequired" || !existing.Targets?.some((target) => lower(target) === TABLE)) throw new Error(`Lookup ${item.logicalName} definition mismatch.`);
      const relation = opportunityRelations.find((row) => lower(row.SchemaName) === lower(item.relationship));
      if (!relation || lower(relation.ReferencedEntity) !== TABLE || lower(relation.ReferencingEntity) !== "opportunity" || lower(relation.ReferencingAttribute) !== item.logicalName || relation.IsManaged === true) throw new Error(`Relationship ${item.relationship} definition mismatch.`);
      audit.skipped.existingLookups.push(item.logicalName);
      audit.lookups = [...(audit.lookups || []), { ...item, metadata: existing, relationship: relation }];
      continue;
    }
    const relation = opportunityRelations.find((row) => lower(row.SchemaName) === lower(item.relationship));
    if (relation) throw new Error(`Relationship ${item.relationship} exists without its expected lookup; refusing to guess.`);
    const response = await post("/api/data/v9.2/RelationshipDefinitions", buildLookupRelationshipPayload(item));
    audit.created.lookups.push(item.logicalName);
    audit.lookupCreateResponses = [...(audit.lookupCreateResponses || []), { logicalName: item.logicalName, status: response.status }];
    let metadata;
    let relationshipAfter;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await sleep(attempt ? 1000 : 0);
      metadata = await readLookup(item.logicalName);
      relationshipAfter = (await getAll("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/ManyToOneRelationships?$select=MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,IsManaged,CascadeConfiguration")).find((row) => lower(row.SchemaName) === lower(item.relationship));
      if (metadata && relationshipAfter) break;
    }
    if (!metadata || !relationshipAfter) throw new Error(`Lookup/relationship ${item.logicalName} was not readable after write.`);
    if (metadata.AttributeType !== "Lookup" || metadata.SchemaName !== item.schemaName || metadata.RequiredLevel?.Value !== "ApplicationRequired" || !metadata.Targets?.some((target) => lower(target) === TABLE)) throw new Error(`Created lookup ${item.logicalName} failed definition validation.`);
    audit.lookups = [...(audit.lookups || []), { ...item, metadata, relationship: relationshipAfter }];
  }
  await persist();

  const entitySet = entity.EntitySetName;
  const existingRows = await getAll(`/api/data/v9.2/${entitySet}?$select=${PRIMARY_NAME}`);
  const inputKeys = new Set(csvRows.map((row) => row.keyCode));
  const existingKeys = new Set(existingRows.map((row) => row[PRIMARY_NAME]).filter(Boolean));
  const extraKeys = [...existingKeys].filter((value) => !inputKeys.has(value));
  if (extraKeys.length) throw new Error(`Existing table contains ${extraKeys.length} Key Code values outside the approved CSV; refusing to delete or overwrite them.`);
  audit.import.existingBefore = existingKeys.size;
  const pendingRows = [];
  for (const row of csvRows) {
    if (existingKeys.has(row.keyCode)) audit.import.skipped += 1;
    else pendingRows.push(row);
  }
  const configuredConcurrency = Number(process.env.POLPOD_CONCURRENCY || 8);
  const concurrency = Number.isInteger(configuredConcurrency) ? Math.max(1, Math.min(configuredConcurrency, 12)) : 8;
  let nextRowIndex = 0;
  let stopRequested = false;
  let firstFailure = null;
  const worker = async () => {
    while (!stopRequested) {
      const row = pendingRows[nextRowIndex++];
      if (!row) return;
      try {
        await patch(buildUpsertPath(entitySet, row.keyCode), { [PRIMARY_NAME]: row.keyCode });
        const check = await get(`${buildUpsertPath(entitySet, row.keyCode)}?$select=${PRIMARY_NAME}`);
        if (check[PRIMARY_NAME] !== row.keyCode) throw new Error("Read-after-write Key Code mismatch.");
        audit.import.created += 1;
        if (audit.import.created % 250 === 0) console.error(`POL/POD upsert progress: ${audit.import.created}/${csvRows.length}`);
      } catch (error) {
        stopRequested = true;
        firstFailure = { error, keyCodeHash: sha256(row.keyCode) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, pendingRows.length || 1) }, () => worker()));
  if (firstFailure) {
    audit.import.failed += 1;
    audit.import.failedKeyCodeHash = firstFailure.keyCodeHash;
    await persist();
    throw firstFailure.error;
  }
  audit.import.remaining = csvRows.length - audit.import.created - audit.import.skipped;
  if (audit.import.failed || audit.import.remaining) throw new Error("POL/POD import did not complete.");
  const finalRows = await getAll(`/api/data/v9.2/${entitySet}?$select=${PRIMARY_NAME}`);
  const otr = await getAll(`/api/data/v9.2/${entitySet}?$select=${PRIMARY_NAME}&$filter=${PRIMARY_NAME} eq '9999: OTR'`);
  if (finalRows.length !== 2072 || new Set(finalRows.map((row) => row[PRIMARY_NAME])).size !== 2072 || otr.length !== 1) throw new Error("Final POL/POD row validation failed.");
  audit.import.finalRowCount = finalRows.length;
  audit.import.otrCount = otr.length;
  await persist();

  const viewFetch = await getAll(`/api/data/v9.2/savedqueries?$select=savedqueryid,name,returnedtypecode,querytype,isquickfindquery,fetchxml,layoutxml,layoutjson,statecode,statuscode,ismanaged&$filter=returnedtypecode eq '${TABLE}' and name eq '${VIEW_NAME.replaceAll("'", "''")}'`);
  const viewPayload = buildViewPayload(entity.ObjectTypeCode);
  let view = viewFetch[0];
  if (viewFetch.length > 1) throw new Error("Duplicate POL/POD lookup views found.");
  if (view) {
    if (view.returnedtypecode !== TABLE || view.querytype !== 0 || view.isquickfindquery !== false || normalizeViewFetchXml(view.fetchxml) !== normalizeViewFetchXml(viewPayload.fetchxml) || view.layoutxml !== viewPayload.layoutxml || view.ismanaged === true) throw new Error("Existing POL/POD lookup view definition mismatch.");
    audit.skipped.existingView = true;
  } else {
    const response = await post("/api/data/v9.2/savedqueries", viewPayload);
    audit.created.view = true;
    view = (await getAll(`/api/data/v9.2/savedqueries?$select=savedqueryid,name,returnedtypecode,querytype,isquickfindquery,fetchxml,layoutxml,layoutjson,statecode,statuscode,ismanaged&$filter=returnedtypecode eq '${TABLE}' and name eq '${VIEW_NAME.replaceAll("'", "''")}'`))[0];
    if (!view) throw new Error("Created POL/POD view was not readable after write.");
    audit.viewCreateResponse = { status: response.status };
  }
  if (!view.savedqueryid || view.statecode !== 0 || view.statuscode !== 1) throw new Error("POL/POD view is not active.");
  audit.view = { savedqueryid: view.savedqueryid, name: view.name, returnedtypecode: view.returnedtypecode, fetchxml: view.fetchxml, layoutxml: view.layoutxml, layoutjsonHash: sha256(view.layoutjson), statecode: view.statecode, statuscode: view.statuscode, ismanaged: view.ismanaged };
  await persist();

  const unpublishedEndpoint = `/api/data/v9.2/systemforms(${FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,formxml,formjson,formactivationstate,isdefault,componentstate`;
  const protectedEndpoint = `/api/data/v9.2/systemforms(${PROTECTED_FORM_ID})?$select=formid,name,formxml,formjson`;
  const beforeForm = await get(unpublishedEndpoint);
  const beforeProtected = await get(protectedEndpoint);
  const beforeAnalysis = analyzeFormXml(beforeForm.formxml, beforeForm.formjson);
  if (beforeForm.name !== "AI Gateway Opportunity Demo - Full Replica" || beforeForm.formactivationstate !== 1 || beforeForm.isdefault !== false) throw new Error("Full Replica state gate failed.");
  if (beforeAnalysis.counts.tabs !== 5 || beforeAnalysis.counts.sections !== 19 || beforeAnalysis.counts.controls !== 114) throw new Error(`Full Replica structure gate failed before patch: ${JSON.stringify(beforeAnalysis)}`);
  const sourceFormReady = LOOKUPS.every((item) => beforeAnalysis.oldControls[item.old] === 1 && beforeAnalysis.lookupControls[item.logicalName] === 0);
  const bindingsAlreadyTarget = LOOKUPS.every((item) => beforeAnalysis.oldControls[item.old] === 0 && beforeAnalysis.lookupControls[item.logicalName] === 1);
  const targetFormReady = bindingsAlreadyTarget && beforeAnalysis.sectionLabel === "POL&POD（不适用的情况下，请输入「9999: OTR」）";
  if (!sourceFormReady && !bindingsAlreadyTarget) throw new Error(`Full Replica POL/POD controls are in an unsafe mixed state: ${JSON.stringify(beforeAnalysis)}`);
  const needsFormPatch = sourceFormReady || (bindingsAlreadyTarget && !targetFormReady);
  const patched = targetFormReady ? { formXml: beforeForm.formxml, changedControls: [], sectionLabel2052: beforeAnalysis.sectionLabel } : patchPolPodFormXml(beforeForm.formxml, view.savedqueryid);
  const afterAnalysis = analyzeFormXml(patched.formXml, beforeForm.formjson);
  if (afterAnalysis.counts.tabs !== 5 || afterAnalysis.counts.sections !== 19 || afterAnalysis.counts.controls !== 114 || !LOOKUPS.every((item) => afterAnalysis.lookupControls[item.logicalName] === 1) || !LOOKUPS.every((item) => afterAnalysis.oldControls[item.old] === 0) || afterAnalysis.hasUndefined || afterAnalysis.sectionLabel !== patched.sectionLabel2052) throw new Error(`Full Replica form patch validation failed: ${JSON.stringify(afterAnalysis)}`);
  audit.form = { before: beforeAnalysis, protectedBefore: { formXml: sha256(beforeProtected.formxml), formJson: sha256(beforeProtected.formjson) }, patch: { section: POL_POD_SECTION, changedControls: patched.changedControls, sectionLabel2052: patched.sectionLabel2052, targetViewId: view.savedqueryid } };
  await fs.writeFile(path.join(auditDir, "form-before.xml"), beforeForm.formxml);
  await fs.writeFile(path.join(auditDir, "form-draft-after.xml"), patched.formXml);
  await persist();
  if (needsFormPatch) {
    await patch(`/api/data/v9.2/systemforms(${FORM_ID})`, { formxml: patched.formXml });
    audit.form.patchReason = sourceFormReady ? "replace-string-controls" : "align-section-label";
    audit.created.formPatched = true;
  } else audit.skipped.formAlreadyValid = true;
  const afterForm = await get(unpublishedEndpoint);
  const afterRead = analyzeFormXml(afterForm.formxml, afterForm.formjson);
  if (afterRead.counts.tabs !== 5 || afterRead.counts.sections !== 19 || afterRead.counts.controls !== 114 || !LOOKUPS.every((item) => afterRead.lookupControls[item.logicalName] === 1) || !LOOKUPS.every((item) => afterRead.oldControls[item.old] === 0) || afterRead.hasUndefined || afterRead.sectionLabel !== patched.sectionLabel2052) throw new Error(`Full Replica form read-back validation failed: ${JSON.stringify(afterRead)}`);
  audit.form.afterPatch = afterRead;
  audit.form.formJsonSynchronized = afterRead.json.containsNewLookups && !afterRead.json.containsOldStrings;
  if (!audit.form.formJsonSynchronized) throw new Error("FormJSON did not synchronize with the FormXML lookup replacement; publish was not attempted.");
  await persist();

  const publish = async (entityName) => {
    audit.requestCounts.POST += 1;
    audit.requestCounts.Publish += 1;
    return client.dataversePost("/api/data/v9.2/PublishXml", { ParameterXml: `<importexportxml><entities><entity>${entityName}</entity></entities></importexportxml>` });
  };
  await publish(TABLE);
  const tableAfterPublish = await readEntity();
  if (tableAfterPublish.LogicalName !== TABLE) throw new Error("POL/POD table was not readable after targeted publish.");
  await publish("opportunity");
  const publishedForm = await get(`/api/data/v9.2/systemforms(${FORM_ID})?$select=formid,name,formxml,formjson,formactivationstate,isdefault,componentstate`);
  const publishedProtected = await get(protectedEndpoint);
  const publishedAnalysis = analyzeFormXml(publishedForm.formxml, publishedForm.formjson);
  const protectedAfter = { formXml: sha256(publishedProtected.formxml), formJson: sha256(publishedProtected.formjson) };
  if (publishedAnalysis.counts.tabs !== 5 || publishedAnalysis.counts.sections !== 19 || publishedAnalysis.counts.controls !== 114 || !LOOKUPS.every((item) => publishedAnalysis.lookupControls[item.logicalName] === 1) || !LOOKUPS.every((item) => publishedAnalysis.oldControls[item.old] === 0) || publishedForm.formactivationstate !== 1 || publishedForm.isdefault !== false) throw new Error("Published Full Replica validation failed.");
  if (protectedAfter.formXml !== audit.form.protectedBefore.formXml || protectedAfter.formJson !== audit.form.protectedBefore.formJson) throw new Error("Protected Form hash changed unexpectedly.");
  audit.form.published = publishedAnalysis;
  audit.form.publishedState = { formactivationstate: publishedForm.formactivationstate, isdefault: publishedForm.isdefault, componentstate: publishedForm.componentstate };
  audit.form.protectedAfter = protectedAfter;
  audit.publish = { table: TABLE, opportunity: "opportunity", executed: true };
  audit.status = "success";
  audit.completedAt = new Date().toISOString();
  await persist();
  console.log(JSON.stringify({ status: audit.status, table: { metadataId: entity.MetadataId, logicalName: entity.LogicalName, objectTypeCode: entity.ObjectTypeCode, entitySetName: entity.EntitySetName }, primaryName: primary.MetadataId, key: { metadataId: key.MetadataId, schemaName: key.SchemaName, status: key.EntityKeyIndexStatus || "Active" }, view: { savedqueryid: view.savedqueryid, name: view.name }, lookups: audit.lookups.map((item) => ({ logicalName: item.logicalName, metadataId: item.metadata?.MetadataId, relationship: item.relationship?.SchemaName, relationshipMetadataId: item.relationship?.MetadataId })), import: audit.import, form: { before: audit.form.before.hashes, afterPatch: audit.form.afterPatch.hashes, published: audit.form.published.hashes, protectedBefore: audit.form.protectedBefore, protectedAfter }, requestCounts: audit.requestCounts, auditDir: path.relative(root, auditDir), ready: true }, null, 2));
}

runDataverseCli(import.meta.url, main);

export { analyzeFormXml, buildKeyPayload, buildLookupRelationshipPayload, buildTablePayload, buildUpsertPath, buildViewPayload, parseCsvRows, patchPolPodFormXml, validateCsvRows };
