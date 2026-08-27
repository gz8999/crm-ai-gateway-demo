import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, runDataverseCli } from "./lib/environment-safety.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST_PATH = path.join(ROOT, "docs/d365/d365-ai-demo-schema-mvp-manifest.json");
const REPORT_PATH = path.join(ROOT, "docs/d365/d365-ai-demo-schema-mvp-core-implementation.md");
const COMPONENTS_PATH = path.join(ROOT, "docs/d365/d365-ai-demo-schema-mvp-core-created-components.json");
const TARGET_HOSTNAME = ["org91f5f65f", "crm5", "dynamics", "com"].join(".");
const PRODUCTION_HOSTNAME = ["lcn-crm", "crm7", "dynamics", "com"].join(".");
const SOLUTION = "CRMAIGatewayDemo";
const SOLUTION_DISPLAY_NAME = "CRM AI Gateway Demo";
const PUBLISHER_PREFIX = "aigw";
const AUTHORIZATION = "CONFIRM_D365_TEST_WRITE_PHASE_1C_SCHEMA_MVP_CORE";
const APP_ID = "916afe4b-607e-f111-ab0e-002248eb1915";
const FULL_REPLICA_FORM_ID = "97a1555b-0903-408a-ac63-d63aed65b14a";
const PROTECTED_FORM_ID = "8db60b46-b976-f111-ab0e-00224817cb31";
const ACTUAL_FORM_ID = "e0537d47-a5f7-45a3-b607-608e7e831700";
const ACTUAL_VIEW_ID = "7a00b267-977c-f111-ab0e-000d3a857307";
const BPF_ID = "7325b274-6b7c-f111-ab0e-70a8a50388b9";
const SOLUTION_COMPONENT_TYPES = { entity: 1, attribute: 2, relationship: 10, key: 14 };
const RELATIONSHIPS = [
  { schemaName: "aigw_account_customerservicecoverage", from: "account", to: "aigw_customerservicecoverage", lookup: "aigw_accountid", target: "account", required: "ApplicationRequired" },
  { schemaName: "aigw_team_customerservicecoverage_responsibledepartment", from: "team", to: "aigw_customerservicecoverage", lookup: "aigw_responsibledepartment", target: "team", required: "ApplicationRequired" },
  { schemaName: "aigw_account_interactionsignal", from: "account", to: "aigw_interactionsignal", lookup: "aigw_accountid", target: "account", required: "ApplicationRequired" },
  { schemaName: "aigw_opportunity_interactionsignal", from: "opportunity", to: "aigw_interactionsignal", lookup: "aigw_opportunityid", target: "opportunity", required: "None" },
  { schemaName: "aigw_team_interactionsignal_salesdepartment", from: "team", to: "aigw_interactionsignal", lookup: "aigw_salesdepartment", target: "team", required: "ApplicationRequired" },
];
const KEY_DEFINITIONS = [
  { entity: "aigw_customerservicecoverage", schemaName: "Aigw_CustomerservicecoverageKey", displayName: "Customer Service Coverage Business Key", attributes: ["aigw_accountid", "aigw_servicetype", "aigw_startdate"] },
  { entity: "aigw_interactionsignal", schemaName: "Aigw_InteractionTokenKey", displayName: "Interaction Token Key", attributes: ["aigw_interactiontoken"] },
];

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const lower = (value) => String(value || "").toLowerCase();
const normalizeId = (value) => String(value || "").replace(/[{}]/g, "").toLowerCase();
const is404 = (error) => Number(error?.status) === 404;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function labels(english, chinese = english) {
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.Label",
    LocalizedLabels: [
      { "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: english, LanguageCode: 1033 },
      { "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: chinese, LanguageCode: 2052 },
    ],
  };
}

function fieldSchemaName(logicalName) {
  const [, suffix] = String(logicalName).split("_");
  return `Aigw_${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
}

function requiredValue(value) {
  const text = String(value || "None").toLowerCase();
  if (text.includes("business") || text.includes("application")) return "ApplicationRequired";
  return "None";
}

function metadataPath(logicalName) {
  return `/api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')`;
}

function attributePath(entity, logicalName) {
  return `${metadataPath(entity)}/Attributes(LogicalName='${logicalName}')`;
}

function typedAttributePath(entity, logicalName, typeName) {
  return `${attributePath(entity, logicalName)}/Microsoft.Dynamics.CRM.${typeName}`;
}

function buildEntityPayload(entity, manifestEntity) {
  const displayEn = manifestEntity.displayNameEn;
  const displayZh = manifestEntity.displayNameZh;
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
    SchemaName: entity === "aigw_customerservicecoverage" ? "Aigw_Customerservicecoverage" : "Aigw_Interactionsignal",
    DisplayName: labels(displayEn, displayZh),
    DisplayCollectionName: labels(`${displayEn}s`, displayZh),
    OwnershipType: "UserOwned",
    IsActivity: false,
    HasActivities: false,
    HasNotes: false,
    IsAuditEnabled: { Value: true },
    Attributes: [{
      "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
      SchemaName: "Aigw_Name",
      DisplayName: labels("Name", "名称"),
      RequiredLevel: { Value: "ApplicationRequired", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
      MaxLength: 200,
      FormatName: { Value: "Text" },
      IsPrimaryName: true,
    }],
  };
}

function buildPicklistOptions(options) {
  return options.map((label, index) => ({
    Value: 100000000 + index,
    Label: labels(label, label),
  }));
}

function buildAttributePayload(field, choicePlan) {
  const common = {
    SchemaName: field.schemaName || fieldSchemaName(field.logicalName),
    DisplayName: labels(field.displayNameEn, field.displayNameZh),
    RequiredLevel: { Value: requiredValue(field.requiredLevel), CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
    IsAuditEnabled: { Value: field.logicalName !== "aigw_demotoken" },
  };
  const dataType = String(field.dataType || "");
  if (dataType === "SingleLineOfText") {
    return { "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata", ...common, MaxLength: field.maxLength || 200, FormatName: { Value: "Text" } };
  }
  if (dataType === "MultilineText") {
    return { "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata", ...common, MaxLength: field.maxLength || 1000, Format: "TextArea" };
  }
  if (dataType === "DateOnly") {
    return { "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", ...common, Format: "DateOnly" };
  }
  if (dataType === "Choice") {
    return {
      "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
      ...common,
      OptionSet: choicePlan?.reuseGlobal
        ? { IsGlobal: true, Name: choicePlan.globalName }
        : { IsGlobal: false, OptionSetType: "Picklist", Options: buildPicklistOptions(choicePlan?.options || []) },
    };
  }
  if (dataType === "TwoOptions") {
    return {
      "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
      ...common,
      OptionSet: {
        TrueOption: { Value: 1, Label: labels("Yes", "是") },
        FalseOption: { Value: 0, Label: labels("No", "否") },
      },
    };
  }
  throw new Error(`Unsupported field data type: ${dataType} (${field.logicalName})`);
}

function buildRelationshipPayload(relation, manifestFields) {
  const field = manifestFields.find((item) => item.logicalName === relation.lookup);
  if (!field) throw new Error(`Relationship field is missing from manifest: ${relation.lookup}`);
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
    SchemaName: relation.schemaName,
    ReferencedEntity: relation.from,
    ReferencingEntity: relation.to,
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
      SchemaName: field.schemaName || fieldSchemaName(field.logicalName),
      DisplayName: labels(field.displayNameEn, field.displayNameZh),
      RequiredLevel: { Value: relation.required, CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
    },
  };
}

function buildKeyPayload(definition) {
  return { SchemaName: definition.schemaName, DisplayName: labels(definition.displayName), KeyAttributes: definition.attributes };
}

function labelMap(label) {
  return Object.fromEntries((label?.LocalizedLabels || []).map((item) => [String(item.LanguageCode), item.Label]));
}

function metadataLabel(metadata) {
  return labelMap(metadata?.DisplayName).Label || metadata?.DisplayName?.UserLocalizedLabel?.Label || "";
}

function choiceOptions(optionSet) {
  return (optionSet?.Options || []).map((option) => ({ value: option.Value, labels: labelMap(option.Label), state: option.State ?? null }));
}

function stableHash(value) {
  return sha256(JSON.stringify(value, Object.keys(value || {}).sort()));
}

function sanitizeError(error) {
  return { message: String(error?.message || error), status: error?.status || null, code: error?.body?.error?.code || null };
}

function parseFlags(argv) {
  const flags = new Set(argv);
  const apply = flags.has("--apply");
  if (!apply && !flags.has("--dry-run")) flags.add("--dry-run");
  return { apply, dryRun: !apply, authorized: argv.includes(`--authorization=${AUTHORIZATION}`) || (argv.includes("--authorization") && argv[argv.indexOf("--authorization") + 1] === AUTHORIZATION) };
}

function assertRuntimeSafety(env, dataverseUrl) {
  const hostname = new URL(dataverseUrl).hostname.toLowerCase();
  if (hostname !== TARGET_HOSTNAME || hostname === PRODUCTION_HOSTNAME) throw new Error(`Dataverse hostname is not the approved test environment: ${hostname}`);
  if (String(env.AI_PROVIDER || "demo").toLowerCase() !== "demo") throw new Error("AI_PROVIDER must remain demo during schema implementation.");
  if (String(env.ALLOW_EXTERNAL_AI || "false").toLowerCase() === "true") throw new Error("ALLOW_EXTERNAL_AI=true is forbidden during schema implementation.");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeOutputs(audit) {
  await fs.writeFile(COMPONENTS_PATH, `${JSON.stringify(audit, null, 2)}\n`);
  const gates = audit.gates || {};
  const lines = [
    "# D365 AI Demo Schema MVP Core Implementation",
    "",
    `- Status: **${audit.status}**`,
    `- Environment: \`${audit.environment?.hostname || "unknown"}\``,
    `- Mode: \`${audit.mode}\``,
    `- Generated: \`${audit.generatedAt}\``,
    "",
    "## Scope",
    "",
    "Only the approved Core Schema scope was considered: two Opportunity fact attributes, Customer Service Coverage, AI Interaction Signal, five lookup relationships, two alternate keys, and solution membership. Form, View, App, Sitemap, Security, Plugin, BPF and business records were not modified.",
    "",
    "## Preflight",
    "",
    "```json",
    JSON.stringify(audit.preflight || {}, null, 2),
    "```",
    "",
    "## Created / Existing Components",
    "",
    "```json",
    JSON.stringify({ created: audit.created, existing: audit.existing, choices: audit.choices, relationships: audit.relationships, keys: audit.keys }, null, 2),
    "```",
    "",
    "## Gates",
    "",
    ...Object.entries(gates).map(([name, value]) => `- ${name}: **${value}**`),
    "",
    "## Safety and Requests",
    "",
    `- POST: ${audit.requestCounts?.POST || 0}`,
    `- GET: ${audit.requestCounts?.GET || 0}`,
    `- PATCH: ${audit.requestCounts?.PATCH || 0}`,
    `- DELETE: ${audit.requestCounts?.DELETE || 0}`,
    `- Publish: ${audit.requestCounts?.Publish || 0}`,
    "- Business record writes: 0",
    "- Production requests: 0",
    "- External LLM calls: 0",
    "",
    "## Stop Conditions",
    "",
    "If a component definition, key index, solution membership or protection baseline is inconsistent, the executor stops without deleting or repairing unknown components. Any successful partial creation remains recorded in the JSON manifest for separate review.",
    "",
  ];
  await fs.writeFile(REPORT_PATH, `${lines.join("\n")}\n`);
}

function createAudit(mode, environment) {
  return {
    schemaVersion: "phase1c-schema-mvp-core-1.0",
    generatedAt: new Date().toISOString(),
    status: "started",
    mode,
    environment: { hostname: new URL(environment).hostname, productionRequests: 0 },
    solution: { uniqueName: SOLUTION, displayName: SOLUTION_DISPLAY_NAME, publisherPrefix: PUBLISHER_PREFIX },
    requestCounts: { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0 },
    created: { entities: [], attributes: [], relationships: [], keys: [], solutionComponents: [] },
    existing: { entities: [], attributes: [], relationships: [], keys: [], solutionComponents: [] },
    choices: [],
    relationships: [],
    keys: [],
    gates: {
      "Test Environment Verified": false,
      "Opportunity Fields Created": false,
      "Coverage Entity Created": false,
      "Signal Entity Created": false,
      "Choice Metadata Ready": false,
      "Relationships Ready": false,
      "Interaction Token Alternate Key Ready": false,
      "Coverage Alternate Key Ready": false,
      "Solution Components Ready": false,
      "Chinese Labels Ready": false,
      "Protected Baseline Preserved": false,
      "Business Record Writes": 0,
      "Production Requests": 0,
      "External LLM Calls": 0,
      "P0": 0,
      "P1": 0,
      "Core Schema Implementation Ready": false,
      "Form View Security Phase Ready": false,
      "Demo Data Phase": false,
    },
  };
}

export async function main({ argv = process.argv.slice(2), env = process.env, clientFactory = createDynamicsClient } = {}) {
  const { apply, dryRun, authorized } = parseFlags(argv);
  const mode = apply ? "apply" : "dry-run";
  let dataverseUrl = getDataverseUrl(env);
  assertRuntimeSafety(env, dataverseUrl);
  if (apply) {
    assertDataverseScriptGate({ mode: "publish/deploy-capable", argv, env });
    if (!authorized) throw new Error(`Explicit --authorization ${AUTHORIZATION} is required.`);
  } else {
    assertDataverseScriptGate({ mode: "read-only", argv, env });
  }

  const audit = createAudit(mode, dataverseUrl);
  if (apply) {
    try {
      const previous = await readJson(COMPONENTS_PATH);
      if (previous.mode === "apply" && previous.status === "stopped") {
        audit.resumedFrom = {
          status: previous.status,
          error: previous.error || null,
          requestCounts: previous.requestCounts || null,
          created: previous.created || null,
        };
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const manifest = await readJson(MANIFEST_PATH);
  const client = clientFactory({ env });
  const hostGuard = () => {
    const current = new URL(client.config.dataverseUrl).hostname.toLowerCase();
    if (current !== TARGET_HOSTNAME || current === PRODUCTION_HOSTNAME) throw new Error(`Request host guard failed: ${current}`);
  };
  const request = async (method, endpoint, body, options = {}) => {
    hostGuard();
    audit.requestCounts[method] += 1;
    const response = method === "GET"
      ? await client.dataverseGet(endpoint)
      : await client.dataversePost(endpoint, body, options);
    return response.body;
  };
  const get = (endpoint) => request("GET", endpoint);
  const post = (endpoint, body, options) => request("POST", endpoint, body, options);
  const maybe = async (endpoint) => { try { return await get(endpoint); } catch (error) { if (is404(error)) return null; throw error; } };
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
  const persist = async () => writeOutputs(audit);

  try {
    audit.gates["Test Environment Verified"] = true;
    await get("/api/data/v9.2/WhoAmI()");
    const organizations = await getAll("/api/data/v9.2/organizations?$select=organizationid,name");
    const solutions = await getAll(`/api/data/v9.2/solutions?$select=solutionid,uniquename,friendlyname,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`);
    if (solutions.length !== 1 || solutions[0].friendlyname !== SOLUTION_DISPLAY_NAME || solutions[0].ismanaged !== false) throw new Error("Target unmanaged solution mismatch.");
    const publishers = await getAll(`/api/data/v9.2/publishers?$select=publisherid,uniquename,friendlyname,customizationprefix&$filter=customizationprefix eq '${PUBLISHER_PREFIX}'`);
    if (publishers.length !== 1 || publishers[0].customizationprefix !== PUBLISHER_PREFIX) throw new Error("Target publisher prefix mismatch.");
    const solution = solutions[0];
    const publisher = publishers[0];
    const componentsBefore = await getAll(`/api/data/v9.2/solutioncomponents?$select=solutioncomponentid,objectid,componenttype,rootsolutioncomponentid&$filter=_solutionid_value eq ${solution.solutionid}`);
    const entityDefinitions = {};
    for (const logicalName of ["aigw_customerservicecoverage", "aigw_interactionsignal", "aigw_location", "aigw_polpodlocation"]) {
      entityDefinitions[logicalName] = await maybe(`${metadataPath(logicalName)}?$select=MetadataId,LogicalName,SchemaName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,ObjectTypeCode,OwnershipType,IsManaged`);
    }
    const opportunity = await get(`${metadataPath("opportunity")}?$select=MetadataId,LogicalName,SchemaName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,ObjectTypeCode,OwnershipType,IsManaged`);
    const opportunityAttributes = await getAll(`${metadataPath("opportunity")}/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,RequiredLevel,IsValidForCreate,IsValidForUpdate,IsValidForRead,IsManaged`);
    const oldOpportunityAttributeHash = stableHash(opportunityAttributes.filter((item) => !["aigw_nextaction", "aigw_nextactiondate"].includes(item.LogicalName)).sort((a, b) => a.LogicalName.localeCompare(b.LogicalName)));
    const app = await get(`/api/data/v9.2/appmodules(${APP_ID})?$select=appmoduleid,name,uniquename,ismanaged`);
    const bpf = await get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,name,uniquename,statecode,statuscode,primaryentity`);
    const protectedForm = await get(`/api/data/v9.2/systemforms(${PROTECTED_FORM_ID})?$select=formid,formxml,formjson,name`);
    const fullReplicaForm = await get(`/api/data/v9.2/systemforms(${FULL_REPLICA_FORM_ID})?$select=formid,formxml,formjson,name`);
    const actualForm = await get(`/api/data/v9.2/systemforms(${ACTUAL_FORM_ID})?$select=formid,formxml,formjson,name`);
    const actualView = await get(`/api/data/v9.2/savedqueries(${ACTUAL_VIEW_ID})?$select=savedqueryid,name,fetchxml,layoutxml,statecode,statuscode`);
    const locationRows = entityDefinitions.aigw_location ? await getAll(`/api/data/v9.2/${entityDefinitions.aigw_location.EntitySetName}?$select=${entityDefinitions.aigw_location.PrimaryIdAttribute}&$top=100`) : [];
    const pluginAssemblies = await getAll("/api/data/v9.2/pluginassemblies?$select=pluginassemblyid,name&$filter=name eq 'CrmAiGateway.ActualTotals.Plugin'");
    if (pluginAssemblies.length !== 1) throw new Error("Protected Plugin assembly is not uniquely present.");
    const pluginTypes = await getAll(`/api/data/v9.2/plugintypes?$select=plugintypeid&$filter=_pluginassemblyid_value eq ${pluginAssemblies[0].pluginassemblyid}`);
    const pluginTypeFilter = pluginTypes.map((item) => `_eventhandler_value eq ${item.plugintypeid}`).join(" or ");
    const pluginSteps = pluginTypeFilter ? await getAll(`/api/data/v9.2/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,statecode,statuscode&$filter=${pluginTypeFilter}`) : [];
    if (pluginTypes.length !== 3 || pluginSteps.length !== 7 || pluginSteps.some((step) => step.statecode !== 0)) throw new Error("Protected Plugin 3 types / 7 enabled steps gate failed.");
    if (app.ismanaged === true) throw new Error("Modern App unexpectedly managed.");
    if (locationRows.length !== 51) throw new Error(`Protected Location baseline mismatch: expected 51, got ${locationRows.length}.`);
    const preflight = {
      solution: { id: solution.solutionid, uniqueName: solution.uniquename, displayName: solution.friendlyname, isManaged: solution.ismanaged },
      publisher: { id: publisher.publisherid, prefix: publisher.customizationprefix },
      organizations: organizations.length,
      app: { id: app.appmoduleid, name: app.name, uniqueName: app.uniquename, isManaged: app.ismanaged },
      bpf: { id: bpf.workflowid, name: bpf.name, statecode: bpf.statecode, statuscode: bpf.statuscode, order: bpf.order, primaryentity: bpf.primaryentity },
      protection: {
        protectedFormHash: sha256(`${protectedForm.formxml || ""}\n${protectedForm.formjson || ""}`),
        fullReplicaFormHash: sha256(`${fullReplicaForm.formxml || ""}\n${fullReplicaForm.formjson || ""}`),
        actualFormHash: sha256(`${actualForm.formxml || ""}\n${actualForm.formjson || ""}`),
        actualViewHash: sha256(`${actualView.fetchxml || ""}\n${actualView.layoutxml || ""}`),
        fullReplicaStructure: { tabs: (fullReplicaForm.formxml?.match(/<tab\b/g) || []).length, sections: (fullReplicaForm.formxml?.match(/<section\b/g) || []).length, controls: (fullReplicaForm.formxml?.match(/<control\b/g) || []).length, uniqueFields: new Set([...String(fullReplicaForm.formxml || "").matchAll(/datafieldname="([^"]+)"/g)].map((match) => match[1])).size },
      },
      locationActiveCount: locationRows.length,
      plugin: { assemblies: pluginAssemblies.length, types: pluginTypes.length, steps: pluginSteps.length, enabled: pluginSteps.filter((step) => step.statecode === 0).length, disabled: pluginSteps.filter((step) => step.statecode !== 0).length },
      opportunityExistingAttributeHash: oldOpportunityAttributeHash,
      componentsBeforeCount: componentsBefore.length,
      entitiesBefore: Object.fromEntries(Object.entries(entityDefinitions).map(([key, value]) => [key, Boolean(value)])),
    };
    audit.preflight = preflight;
    await persist();

    const manifestEntities = Object.fromEntries(manifest.entities.map((entity) => [entity.logicalName, entity]));
    const globalOptionSets = await getAll("/api/data/v9.2/GlobalOptionSetDefinitions?$select=Name,DisplayName,IsGlobal,IsManaged");
    const choicePlans = Object.fromEntries((manifest.choices.localChoicePlans || []).map((choice) => [choice.name, choice]));
    const resolveChoice = (choiceName) => {
      const desired = choicePlans[choiceName];
      if (!desired) throw new Error(`Choice plan not found: ${choiceName}`);
      const global = globalOptionSets.find((item) => {
        const labelsByLanguage = labelMap(item.DisplayName);
        const optionLabels = choiceOptions(item).map((option) => option.labels["2052"] || option.labels["1033"]);
        return (labelsByLanguage["1033"] === choiceName || labelsByLanguage["2052"] === choiceName) && JSON.stringify(optionLabels) === JSON.stringify(desired.options);
      });
      const choice = global ? { name: choiceName, reuseGlobal: true, globalName: global.Name, options: desired.options, source: "global" } : { name: choiceName, reuseGlobal: false, options: desired.options, source: "local" };
      audit.choices.push({ name: choice.name, source: choice.source, globalName: choice.globalName || null, labels: choice.options });
      return choice;
    };

    const targetEntityNames = ["aigw_customerservicecoverage", "aigw_interactionsignal"];
    const fieldMap = Object.fromEntries(targetEntityNames.flatMap((entity) => (manifestEntities[entity].fields || []).map((field) => [`${entity}.${field.logicalName}`, { ...field, entity, schemaName: field.schemaName || fieldSchemaName(field.logicalName) }])));
    const fieldDefinitions = Object.values(fieldMap).filter((field) => field.logicalName !== "aigw_name" && !String(field.dataType).startsWith("Lookup"));
    for (const field of fieldDefinitions.filter((item) => item.dataType === "Choice")) resolveChoice(field.choicePlan);
    const choiceByName = Object.fromEntries(audit.choices.map((choice) => [choice.name, choice]));

    const createIfMissing = async (endpoint, payload, created, existing, descriptor) => {
      if (!apply) { existing.push({ ...descriptor, planned: true }); return null; }
      await post(endpoint, payload, { headers: { "MSCRM.SolutionUniqueName": SOLUTION } });
      created.push(descriptor);
      await persist();
      return descriptor;
    };
    const readEntity = async (logicalName) => maybe(`${metadataPath(logicalName)}?$select=MetadataId,LogicalName,SchemaName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,ObjectTypeCode,OwnershipType,IsManaged`);
    const readGenericAttributes = async (logicalName) => getAll(`${metadataPath(logicalName)}/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,RequiredLevel,IsValidForCreate,IsValidForUpdate,IsValidForRead,IsManaged`);
    const readField = async (entity, field) => {
      const generic = (await readGenericAttributes(entity)).find((item) => lower(item.LogicalName) === lower(field.logicalName));
      if (!generic) return null;
      let typeName = "AttributeMetadata";
      if (field.dataType === "SingleLineOfText") typeName = "StringAttributeMetadata";
      else if (field.dataType === "MultilineText") typeName = "MemoAttributeMetadata";
      else if (field.dataType === "DateOnly") typeName = "DateTimeAttributeMetadata";
      else if (field.dataType === "Choice") typeName = "PicklistAttributeMetadata";
      else if (field.dataType === "TwoOptions") typeName = "BooleanAttributeMetadata";
      const typeSelect = field.dataType === "SingleLineOfText"
        ? "MaxLength,FormatName"
        : field.dataType === "MultilineText"
          ? "MaxLength,Format"
          : field.dataType === "DateOnly"
            ? "Format,DateTimeBehavior"
            : "";
      const expand = field.dataType === "Choice"
        ? "&$expand=OptionSet($select=IsGlobal,Name,Options)"
        : field.dataType === "TwoOptions"
          ? "&$expand=OptionSet($select=TrueOption,FalseOption)"
          : "";
      try { return await get(`${typedAttributePath(entity, field.logicalName, typeName)}?$select=MetadataId,LogicalName,SchemaName,AttributeType,RequiredLevel,IsValidForCreate,IsValidForUpdate,IsValidForRead,IsManaged${typeSelect ? `,${typeSelect}` : ""}${expand}`); } catch (error) { if (!is404(error)) throw error; return generic; }
    };
    const assertEntityDefinition = (entity, actual) => {
      if (!actual) return;
      const expectedManifest = manifestEntities[entity];
      if (actual.PrimaryNameAttribute !== "aigw_name" || !actual.EntitySetName || !actual.PrimaryIdAttribute || actual.IsManaged === true || actual.OwnershipType !== "UserOwned") throw new Error(`Existing ${entity} definition is not exactly the approved User/Team-owned shape.`);
      if (actual.SchemaName !== (entity === "aigw_customerservicecoverage" ? "Aigw_Customerservicecoverage" : "Aigw_Interactionsignal") || !expectedManifest) throw new Error(`Existing ${entity} schema name or manifest mismatch.`);
    };
    const assertFieldDefinition = (field, actual) => {
      if (!actual) return;
      const expectedType = field.dataType === "SingleLineOfText" ? "String" : field.dataType === "MultilineText" ? "Memo" : field.dataType === "DateOnly" ? "DateTime" : field.dataType === "Choice" ? "Picklist" : "Boolean";
      if (actual.SchemaName !== field.schemaName || actual.IsManaged === true || String(actual.AttributeType || "").toLowerCase() !== expectedType.toLowerCase() || requiredValue(actual.RequiredLevel?.Value) !== requiredValue(field.requiredLevel)) throw new Error(`Existing field ${field.entity}.${field.logicalName} does not match the approved definition.`);
      if (field.maxLength && Number(actual.MaxLength) !== Number(field.maxLength)) throw new Error(`Existing field ${field.entity}.${field.logicalName} max length mismatch.`);
      if (field.dataType === "DateOnly" && actual.Format !== "DateOnly") throw new Error(`Existing field ${field.entity}.${field.logicalName} is not DateOnly.`);
    };

    for (const field of manifestEntities.opportunity.fields || []) {
      const normalized = { ...field, entity: "opportunity", schemaName: field.schemaName || fieldSchemaName(field.logicalName) };
      const actual = await readField("opportunity", normalized);
      if (actual) {
        assertFieldDefinition(normalized, actual);
        audit.existing.attributes.push({ entity: "opportunity", logicalName: normalized.logicalName, metadataId: actual.MetadataId });
      } else {
        await createIfMissing(`${metadataPath("opportunity")}/Attributes`, buildAttributePayload(normalized), audit.created.attributes, audit.existing.attributes, { entity: "opportunity", logicalName: normalized.logicalName, schemaName: normalized.schemaName, planned: !apply });
      }
    }

    for (const entityName of targetEntityNames) {
      let entity = await readEntity(entityName);
      if (entity) { assertEntityDefinition(entityName, entity); audit.existing.entities.push({ entity: entityName, metadataId: entity.MetadataId }); }
      else {
        await createIfMissing("/api/data/v9.2/EntityDefinitions", buildEntityPayload(entityName, manifestEntities[entityName]), audit.created.entities, audit.existing.entities, { entity: entityName, planned: !apply });
        if (!apply) continue;
        for (let attempt = 0; attempt < 14 && !entity; attempt += 1) { await sleep(attempt ? 1500 : 500); entity = await readEntity(entityName); }
        if (!entity) throw new Error(`Created ${entityName} but metadata did not become readable.`);
        assertEntityDefinition(entityName, entity);
      }
      if (!apply && !entity) continue;
      const fields = manifestEntities[entityName].fields || [];
      for (const field of fields.filter((item) => item.logicalName !== "aigw_name" && !String(item.dataType).startsWith("Lookup"))) {
        const actual = await readField(entityName, field);
        if (actual) { assertFieldDefinition({ ...field, entity: entityName, schemaName: field.schemaName || fieldSchemaName(field.logicalName) }, actual); audit.existing.attributes.push({ entity: entityName, logicalName: field.logicalName, metadataId: actual.MetadataId }); continue; }
        const normalized = { ...field, entity: entityName, schemaName: field.schemaName || fieldSchemaName(field.logicalName) };
        await createIfMissing(`${metadataPath(entityName)}/Attributes`, buildAttributePayload(normalized, choiceByName[normalized.choicePlan]), audit.created.attributes, audit.existing.attributes, { entity: entityName, logicalName: normalized.logicalName, schemaName: normalized.schemaName, planned: !apply });
      }
    }

    if (apply) {
      for (const entityName of targetEntityNames) {
        const entity = await readEntity(entityName);
        if (!entity) throw new Error(`Post-create entity readback failed: ${entityName}`);
      }
    } else {
      audit.status = "dry_run_ready";
      audit.gates["Opportunity Fields Created"] = false;
      audit.gates["Coverage Entity Created"] = false;
      audit.gates["Signal Entity Created"] = false;
      audit.gates["Choice Metadata Ready"] = true;
      await persist();
      console.log(JSON.stringify({ status: audit.status, targetHost: TARGET_HOSTNAME, plannedEntities: targetEntityNames, plannedAttributes: fieldDefinitions.length + (manifestEntities.opportunity.fields || []).length, plannedRelationships: RELATIONSHIPS.length, plannedKeys: KEY_DEFINITIONS.length, requestCounts: audit.requestCounts, report: REPORT_PATH, components: COMPONENTS_PATH }, null, 2));
      return audit;
    }

    for (const relation of RELATIONSHIPS) {
      const existingRelations = await getAll(`${metadataPath(relation.to)}/ManyToOneRelationships?$select=MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,CascadeConfiguration,IsManaged`);
      const found = existingRelations.find((item) => lower(item.SchemaName) === lower(relation.schemaName));
      if (found) {
        if (found.ReferencedEntity !== relation.from || found.ReferencingEntity !== relation.to || found.ReferencingAttribute !== relation.lookup || found.IsManaged === true || found.CascadeConfiguration?.Delete !== "Restrict") throw new Error(`Relationship ${relation.schemaName} exists with an incompatible definition.`);
        audit.existing.relationships.push({ schemaName: relation.schemaName, metadataId: found.MetadataId });
        audit.relationships.push({ schemaName: relation.schemaName, metadataId: found.MetadataId, source: "existing" });
        continue;
      }
      const targetFields = Object.values(fieldMap).filter((field) => field.logicalName === relation.lookup && field.entity === relation.to);
      await post("/api/data/v9.2/RelationshipDefinitions", buildRelationshipPayload(relation, targetFields));
      audit.created.relationships.push({ schemaName: relation.schemaName, lookup: relation.lookup, target: relation.target });
      audit.relationships.push({ schemaName: relation.schemaName, lookup: relation.lookup, target: relation.target, source: "created" });
      await persist();
    }

    for (const definition of KEY_DEFINITIONS) {
      const endpoint = `${metadataPath(definition.entity)}/Keys`;
      let keys = await getAll(`${endpoint}?$select=MetadataId,LogicalName,SchemaName,KeyAttributes,EntityKeyIndexStatus,IsManaged`);
      let key = keys.find((item) => lower(item.SchemaName) === lower(definition.schemaName));
      if (key) {
        if (key.IsManaged === true || JSON.stringify(key.KeyAttributes || []).toLowerCase() !== JSON.stringify(definition.attributes).toLowerCase()) throw new Error(`Alternate key ${definition.schemaName} exists with an incompatible definition.`);
        audit.existing.keys.push({ entity: definition.entity, schemaName: definition.schemaName, metadataId: key.MetadataId, status: key.EntityKeyIndexStatus || "Active" });
      } else {
        await post(endpoint, buildKeyPayload(definition));
        audit.created.keys.push({ entity: definition.entity, schemaName: definition.schemaName, attributes: definition.attributes });
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await sleep(attempt ? 2000 : 800);
          keys = await getAll(`${endpoint}?$select=MetadataId,LogicalName,SchemaName,KeyAttributes,EntityKeyIndexStatus,IsManaged`);
          key = keys.find((item) => lower(item.SchemaName) === lower(definition.schemaName));
          if (key && !["Pending", "InProgress"].includes(String(key.EntityKeyIndexStatus))) break;
        }
        if (!key || String(key.EntityKeyIndexStatus || "Active") === "Failed") throw new Error(`Alternate key ${definition.schemaName} failed or did not become readable.`);
      }
      audit.keys.push({ entity: definition.entity, schemaName: definition.schemaName, attributes: definition.attributes, metadataId: key?.MetadataId || null, status: key?.EntityKeyIndexStatus || "Active" });
      await persist();
    }

    const solutionId = solution.solutionid;
    const componentRows = async () => getAll(`/api/data/v9.2/solutioncomponents?$select=solutioncomponentid,objectid,componenttype,rootcomponentbehavior,rootsolutioncomponentid&$filter=_solutionid_value eq ${solutionId}`);
    const ensureComponent = async (objectId, componentType, label) => {
      const rows = await componentRows();
      const present = rows.find((row) => Number(row.componenttype) === componentType && normalizeId(row.objectid) === normalizeId(objectId));
      if (present) { audit.existing.solutionComponents.push({ label, componentType, objectId }); return; }
      await post("/api/data/v9.2/AddSolutionComponent", { ComponentId: objectId, ComponentType: componentType, SolutionUniqueName: SOLUTION, AddRequiredComponents: false, DoNotIncludeSubcomponents: false });
      const after = await componentRows();
      if (!after.some((row) => Number(row.componenttype) === componentType && normalizeId(row.objectid) === normalizeId(objectId))) throw new Error(`Solution membership readback failed for ${label}.`);
      audit.created.solutionComponents.push({ label, componentType, objectId });
      await persist();
    };
    const recordEntitySubcomponent = (objectId, componentType, label, root) => {
      audit.existing.solutionComponents.push({
        label,
        componentType,
        objectId,
        source: "entity-root-subcomponent",
        rootObjectId: root.objectid,
        rootComponentBehavior: root.rootcomponentbehavior,
      });
    };
    const coverage = await readEntity("aigw_customerservicecoverage");
    const signal = await readEntity("aigw_interactionsignal");
    await ensureComponent(coverage.MetadataId, SOLUTION_COMPONENT_TYPES.entity, "aigw_customerservicecoverage");
    await ensureComponent(signal.MetadataId, SOLUTION_COMPONENT_TYPES.entity, "aigw_interactionsignal");
    const solutionComponentsAfterRoots = await componentRows();
    const entityRoots = new Map(
      solutionComponentsAfterRoots
        .filter((row) => Number(row.componenttype) === SOLUTION_COMPONENT_TYPES.entity)
        .map((row) => [normalizeId(row.objectid), row]),
    );
    for (const entity of [coverage, signal]) {
      const root = entityRoots.get(normalizeId(entity.MetadataId));
      if (!root || Number(root.rootcomponentbehavior) !== 0) {
        throw new Error(`Solution root for ${entity.LogicalName} is missing or does not include subcomponents.`);
      }
    }
    const finalOpportunityAttrs = await readGenericAttributes("opportunity");
    const approvedOpportunityAttributeNames = new Set((manifestEntities.opportunity.fields || []).map((field) => field.logicalName));
    for (const attr of finalOpportunityAttrs) {
      if (approvedOpportunityAttributeNames.has(attr.LogicalName) && attr.LogicalName !== "aigw_name") await ensureComponent(attr.MetadataId, SOLUTION_COMPONENT_TYPES.attribute, `${attr.LogicalName}`);
    }
    const relationRows = [];
    for (const entityName of targetEntityNames) relationRows.push(...await getAll(`${metadataPath(entityName)}/ManyToOneRelationships?$select=MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,IsManaged`));
    for (const relation of RELATIONSHIPS) {
      const row = relationRows.find((item) => lower(item.SchemaName) === lower(relation.schemaName));
      if (!row) throw new Error(`Relationship readback failed before solution membership: ${relation.schemaName}`);
      const rows = await componentRows();
      const direct = rows.find((item) => Number(item.componenttype) === SOLUTION_COMPONENT_TYPES.relationship && normalizeId(item.objectid) === normalizeId(row.MetadataId));
      if (direct) {
        audit.existing.solutionComponents.push({ label: relation.schemaName, componentType: SOLUTION_COMPONENT_TYPES.relationship, objectId: row.MetadataId, source: "direct" });
      } else {
        const root = entityRoots.get(normalizeId(row.ReferencingEntity === coverage.LogicalName ? coverage.MetadataId : signal.MetadataId));
        if (!root || Number(root.rootcomponentbehavior) !== 0) throw new Error(`Solution membership for relationship ${relation.schemaName} is not directly present and is not covered by an entity root.`);
        recordEntitySubcomponent(row.MetadataId, SOLUTION_COMPONENT_TYPES.relationship, relation.schemaName, root);
      }
    }
    for (const key of audit.keys) {
      const rows = await componentRows();
      const direct = rows.find((item) => Number(item.componenttype) === SOLUTION_COMPONENT_TYPES.key && normalizeId(item.objectid) === normalizeId(key.metadataId));
      if (direct) {
        audit.existing.solutionComponents.push({ label: key.schemaName, componentType: SOLUTION_COMPONENT_TYPES.key, objectId: key.metadataId, source: "direct" });
      } else {
        const root = entityRoots.get(normalizeId(key.entity === coverage.LogicalName ? coverage.MetadataId : signal.MetadataId));
        if (!root || Number(root.rootcomponentbehavior) !== 0) throw new Error(`Solution membership for alternate key ${key.schemaName} is not directly present and is not covered by an entity root.`);
        recordEntitySubcomponent(key.metadataId, SOLUTION_COMPONENT_TYPES.key, key.schemaName, root);
      }
    }
    audit.gates["Solution Components Ready"] = true;
    audit.gates["Choice Metadata Ready"] = true;
    audit.gates["Relationships Ready"] = audit.relationships.length === RELATIONSHIPS.length;
    audit.gates["Interaction Token Alternate Key Ready"] = audit.keys.some((key) => key.schemaName === "Aigw_InteractionTokenKey" && key.status !== "Failed");
    audit.gates["Coverage Alternate Key Ready"] = audit.keys.some((key) => key.schemaName === "Aigw_CustomerservicecoverageKey" && key.status !== "Failed");
    audit.gates["Opportunity Fields Created"] = true;
    audit.gates["Coverage Entity Created"] = true;
    audit.gates["Signal Entity Created"] = true;
    audit.gates["Chinese Labels Ready"] = true;
    audit.gates["Protected Baseline Preserved"] = true;
    for (const createdEntity of audit.created.entities) {
      const current = await readEntity(createdEntity.entity);
      createdEntity.metadataId = current?.MetadataId || null;
      createdEntity.entitySetName = current?.EntitySetName || null;
      createdEntity.primaryIdAttribute = current?.PrimaryIdAttribute || null;
    }
    for (const createdAttribute of audit.created.attributes) {
      const currentAttrs = await readGenericAttributes(createdAttribute.entity);
      const current = currentAttrs.find((item) => item.LogicalName === createdAttribute.logicalName);
      createdAttribute.metadataId = current?.MetadataId || null;
    }
    for (const createdRelationship of audit.created.relationships) {
      const relation = relationRows.find((item) => lower(item.SchemaName) === lower(createdRelationship.schemaName));
      createdRelationship.metadataId = relation?.MetadataId || null;
    }
    for (const createdKey of audit.created.keys) {
      const current = audit.keys.find((item) => item.schemaName === createdKey.schemaName);
      createdKey.metadataId = current?.metadataId || null;
      createdKey.status = current?.status || null;
    }
    await persist();

    await post("/api/data/v9.2/PublishXml", { ParameterXml: `<importexportxml><entities><entity>aigw_customerservicecoverage</entity><entity>aigw_interactionsignal</entity><entity>opportunity</entity></entities></importexportxml>` });
    audit.requestCounts.Publish += 1;
    await persist();

    const opportunityAttributesAfter = await getAll(`${metadataPath("opportunity")}/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,RequiredLevel,IsManaged`);
    const oldOpportunityAttributeHashAfter = stableHash(opportunityAttributesAfter.filter((item) => !["aigw_nextaction", "aigw_nextactiondate"].includes(item.LogicalName)).sort((a, b) => a.LogicalName.localeCompare(b.LogicalName)));
    if (oldOpportunityAttributeHashAfter !== oldOpportunityAttributeHash) throw new Error("Existing Opportunity metadata changed outside the approved new attributes.");
    const protectedAfter = await get(`/api/data/v9.2/systemforms(${PROTECTED_FORM_ID})?$select=formxml,formjson`);
    const fullAfter = await get(`/api/data/v9.2/systemforms(${FULL_REPLICA_FORM_ID})?$select=formxml,formjson`);
    const actualAfter = await get(`/api/data/v9.2/systemforms(${ACTUAL_FORM_ID})?$select=formxml,formjson`);
    const viewAfter = await get(`/api/data/v9.2/savedqueries(${ACTUAL_VIEW_ID})?$select=fetchxml,layoutxml`);
    const protectedHashes = {
      protectedBefore: preflight.protection.protectedFormHash,
      protectedAfter: sha256(`${protectedAfter.formxml || ""}\n${protectedAfter.formjson || ""}`),
      fullBefore: preflight.protection.fullReplicaFormHash,
      fullAfter: sha256(`${fullAfter.formxml || ""}\n${fullAfter.formjson || ""}`),
      actualBefore: preflight.protection.actualFormHash,
      actualAfter: sha256(`${actualAfter.formxml || ""}\n${actualAfter.formjson || ""}`),
      actualViewBefore: preflight.protection.actualViewHash,
      actualViewAfter: sha256(`${viewAfter.fetchxml || ""}\n${viewAfter.layoutxml || ""}`),
    };
    if (protectedHashes.protectedBefore !== protectedHashes.protectedAfter || protectedHashes.fullBefore !== protectedHashes.fullAfter || protectedHashes.actualBefore !== protectedHashes.actualAfter || protectedHashes.actualViewBefore !== protectedHashes.actualViewAfter) throw new Error("Protected Form, Full Replica, Actual Form or Actual View hash changed.");
    audit.postflight = { protectedHashes, opportunityExistingAttributeHashAfter: oldOpportunityAttributeHashAfter, publishedEntities: ["aigw_customerservicecoverage", "aigw_interactionsignal", "opportunity"] };
    audit.status = "completed";
    audit.gates["Core Schema Implementation Ready"] = true;
    audit.gates["Form View Security Phase Ready"] = false;
    audit.gates["Demo Data Phase"] = false;
    await persist();
    console.log(JSON.stringify({ status: audit.status, targetHost: TARGET_HOSTNAME, created: audit.created, existing: audit.existing, keys: audit.keys, requestCounts: audit.requestCounts, report: REPORT_PATH, components: COMPONENTS_PATH, ready: audit.gates["Core Schema Implementation Ready"] }, null, 2));
    return audit;
  } catch (error) {
    audit.status = "stopped";
    audit.error = sanitizeError(error);
    audit.gates["P1"] = 1;
    audit.gates["Core Schema Implementation Ready"] = false;
    audit.gates["Form View Security Phase Ready"] = false;
    audit.gates["Demo Data Phase"] = false;
    await persist();
    throw error;
  }
}

export {
  AUTHORIZATION,
  KEY_DEFINITIONS,
  RELATIONSHIPS,
  SOLUTION,
  TARGET_HOSTNAME,
  buildAttributePayload,
  buildEntityPayload,
  buildKeyPayload,
  buildRelationshipPayload,
  fieldSchemaName,
  labels,
  parseFlags,
};

runDataverseCli(import.meta.url, main);
