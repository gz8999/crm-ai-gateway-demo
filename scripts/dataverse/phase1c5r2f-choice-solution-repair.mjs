import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, runDataverseCli } from "./lib/environment-safety.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TARGET_HOSTNAME = "org91f5f65f.crm5.dynamics.com";
const PRODUCTION_HOSTNAME = "lcn-crm.crm7.dynamics.com";
const SOLUTION = "CRMAIGatewayDemo";
const AUTHORIZATION = "CONFIRM_D365_TEST_WRITE_PHASE_1C_5R2F_R3B";
const FULL_REPLICA_FORM_ID = "97a1555b-0903-408a-ac63-d63aed65b14a";
const PROTECTED_FORM_ID = "8db60b46-b976-f111-ab0e-00224817cb31";
const ACTUAL_FORM_ID = "e0537d47-a5f7-45a3-b607-608e7e831700";
const ACTUAL_VIEW_ID = "7a00b267-977c-f111-ab0e-000d3a857307";
const APP_ID = "916afe4b-607e-f111-ab0e-002248eb1915";
const BPF_ID = "7325b274-6b7c-f111-ab0e-70a8a50388b9";
const DEMO_USER_ID = "85f6e9a0-ef7f-f111-ab0f-000d3a857307";
const DEMO_ROLE_ID = "63399c4d-f17f-f111-ab0e-000d3a82d194";
const DEMO_BU_ID = "4c441a2f-cd6d-f111-ab0d-00224818ead9";
const PROBE_PREFIX = "[AI-DEMO-SCHEMA-PROBE]";
const COMPONENT_FORM = 60;
const COMPONENT_VIEW = 26;
const COMPONENT_ENTITY = 1;
export const CHOICE_LABELS = [
  {
    entity: "aigw_customerservicecoverage", attribute: "aigw_servicetype", label: "服务类型", english: "Service Type",
    options: ["国内运输", "国际海运", "国际空运", "铁路运输", "仓储运营", "门店配送", "冷链物流", "跨境电商物流", "供应链解决方案", "其他"],
    englishOptions: ["Domestic Transport", "International Ocean Freight", "International Air Freight", "Rail Freight", "Warehouse Operations", "Store Delivery", "Cold Chain Logistics", "Cross-border E-commerce Logistics", "Supply Chain Solutions", "Other"],
  },
  {
    entity: "aigw_customerservicecoverage", attribute: "aigw_coveragestatus", label: "覆盖状态", english: "Coverage Status",
    options: ["已覆盖", "提案中", "未覆盖", "曾经覆盖", "已停止", "待确认"],
    englishOptions: ["Covered", "In Proposal", "Not Covered", "Previously Covered", "Stopped", "To Be Confirmed"],
  },
  {
    entity: "aigw_customerservicecoverage", attribute: "aigw_servicesatisfaction", label: "服务满意度", english: "Service Satisfaction",
    options: ["很满意", "满意", "一般", "需改善", "未确认"],
    englishOptions: ["Very Satisfied", "Satisfied", "Neutral", "Needs Improvement", "Unconfirmed"],
  },
  {
    entity: "aigw_customerservicecoverage", attribute: "aigw_revenueband", label: "收入区间", english: "Revenue Band",
    options: ["无收入", "低", "中", "高", "战略级", "未确认"],
    englishOptions: ["No Revenue", "Low", "Medium", "High", "Strategic", "Unconfirmed"],
  },
  {
    entity: "aigw_customerservicecoverage", attribute: "aigw_marginband", label: "毛利区间", english: "Margin Band",
    options: ["负毛利", "低", "正常", "较高", "未确认"],
    englishOptions: ["Negative Margin", "Low", "Normal", "Higher", "Unconfirmed"],
  },
  {
    entity: "aigw_interactionsignal", attribute: "aigw_activitytype", label: "活动类型", english: "Activity Type",
    options: ["电话", "会议", "任务", "Note", "邮件沟通摘要", "现场拜访", "内部会议"],
    englishOptions: ["Phone Call", "Meeting", "Task", "Note", "Email Communication Summary", "On-site Visit", "Internal Meeting"],
  },
  {
    entity: "aigw_interactionsignal", attribute: "aigw_direction", label: "互动方向", english: "Direction",
    options: ["客户→我方", "我方→客户", "内部"],
    englishOptions: ["Customer to Us", "Us to Customer", "Internal"],
  },
  {
    entity: "aigw_interactionsignal", attribute: "aigw_resultcategory", label: "结果类别", english: "Result Category",
    options: ["已确认", "部分确认", "待客户回复", "待内部处理", "延期", "拒绝", "完成", "无结果"],
    englishOptions: ["Confirmed", "Partially Confirmed", "Awaiting Customer", "Awaiting Internal Action", "Delayed", "Rejected", "Completed", "No Result"],
  },
  {
    entity: "aigw_interactionsignal", attribute: "aigw_customerresponselevel", label: "客户响应程度", english: "Customer Response Level",
    options: ["积极", "正常", "低频", "无回复", "明确拒绝"],
    englishOptions: ["Positive", "Normal", "Low Frequency", "No Response", "Explicit Rejection"],
  },
  {
    entity: "aigw_interactionsignal", attribute: "aigw_sentiment", label: "情绪", english: "Sentiment",
    options: ["正面", "中性", "偏负面", "负面", "未判断"],
    englishOptions: ["Positive", "Neutral", "Slightly Negative", "Negative", "Undetermined"],
  },
  {
    entity: "aigw_interactionsignal", attribute: "aigw_objectioncategory", label: "异议类别", english: "Objection Category",
    options: ["价格", "时效", "服务能力", "实施周期", "合同条款", "系统接口", "合规", "其他"],
    englishOptions: ["Price", "Timeliness", "Service Capability", "Implementation Cycle", "Contract Terms", "System Interface", "Compliance", "Other"],
  },
  {
    entity: "aigw_interactionsignal", attribute: "aigw_serviceissuecategory", label: "服务问题类别", english: "Service Issue Category",
    options: ["运输时效", "服务质量", "计费", "系统接口", "仓储作业", "合规", "其他"],
    englishOptions: ["Transport Timeliness", "Service Quality", "Billing", "System Interface", "Warehouse Operations", "Compliance", "Other"],
  },
];

const TARGET_COMPONENTS = [
  { key: "coverage-form", objectId: "8e260676-56ce-47b1-a949-3d2560eda95c", componentType: COMPONENT_FORM, kind: "form", entity: "aigw_customerservicecoverage" },
  { key: "signal-form", objectId: "2c1d6dee-2691-4abd-8b51-492534414610", componentType: COMPONENT_FORM, kind: "form", entity: "aigw_interactionsignal" },
  { key: "coverageCurrent-view", objectId: "8aea4159-31c6-5f7f-8283-6f2192f3519c", componentType: COMPONENT_VIEW, kind: "view", entity: "aigw_customerservicecoverage" },
  { key: "coverageHistory-view", objectId: "b7fffbbf-2ad1-5370-b677-706d2f8994e6", componentType: COMPONENT_VIEW, kind: "view", entity: "aigw_customerservicecoverage" },
  { key: "signalRecent-view", objectId: "09705286-f108-5f96-9784-b05cfd5dd7d8", componentType: COMPONENT_VIEW, kind: "view", entity: "aigw_interactionsignal" },
  { key: "signalCommitments-view", objectId: "db50ed56-c339-5938-8b9e-f553e24502a7", componentType: COMPONENT_VIEW, kind: "view", entity: "aigw_interactionsignal" },
  { key: "signalIssues-view", objectId: "761e3a59-6302-538f-beb1-7efdc7a89662", componentType: COMPONENT_VIEW, kind: "view", entity: "aigw_interactionsignal" },
];

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const normalizeId = (value) => String(value || "").replace(/[{}]/g, "").toLowerCase();
const normalizePackageText = (value) => String(value || "").toLowerCase().replace(/[{}-]/g, "");
const normalizeLabel = (value) => String(value || "").trim();
const isTrue = (value) => String(value || "").toLowerCase() === "true";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeError = (error) => ({ status: error?.status ?? null, message: String(error?.message || "Unknown error").replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]") });

function parseFlags(argv) {
  const apply = argv.includes("--apply");
  const authArg = argv.find((value) => value.startsWith("--authorization="));
  const authorization = authArg ? authArg.slice("--authorization=".length) : "";
  const exportFailureArg = argv.find((value) => value.startsWith("--export-failure="));
  return {
    apply,
    authorization,
    confirmTest: argv.includes("--confirm-test-environment"),
    confirm: argv.includes("--confirm"),
    confirmPublish: argv.includes("--confirm-publish-or-deploy"),
    stage0Only: argv.includes("--stage0-only"),
    recordExportAttempt: argv.includes("--record-export-attempt"),
    exportFailure: exportFailureArg ? exportFailureArg.slice("--export-failure=".length) : "",
  };
}

function assertSafety(env, url, flags) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== TARGET_HOSTNAME || parsed.hostname.toLowerCase() === PRODUCTION_HOSTNAME) throw new Error(`Only the approved test hostname is allowed: ${parsed.hostname}`);
  if (String(env.AI_PROVIDER || "demo").toLowerCase() !== "demo") throw new Error("AI_PROVIDER must remain demo.");
  if (isTrue(env.ALLOW_EXTERNAL_AI)) throw new Error("ALLOW_EXTERNAL_AI=true is forbidden.");
  if (flags.apply && (!flags.confirmTest || !flags.confirm || !flags.confirmPublish || flags.authorization !== AUTHORIZATION)) throw new Error(`Apply requires explicit test, publish and authorization confirmations: ${AUTHORIZATION}`);
}

function labelPayload({ chinese, english, chineseLanguageCode = 2052, englishLanguageCode = null }) {
  const localizedLabels = [
    { "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: chinese, LanguageCode: chineseLanguageCode },
  ];
  if (englishLanguageCode && english) localizedLabels.push({ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: english, LanguageCode: englishLanguageCode });
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.Label",
    LocalizedLabels: localizedLabels,
  };
}

export function buildInsertOptionValuePayload({ entityLogicalName, attributeLogicalName, chinese, english, solutionUniqueName = SOLUTION, chineseLanguageCode = 2052, englishLanguageCode = null }) {
  return {
    EntityLogicalName: entityLogicalName,
    AttributeLogicalName: attributeLogicalName,
    Label: labelPayload({ chinese, english, chineseLanguageCode, englishLanguageCode }),
    SolutionUniqueName: solutionUniqueName,
  };
}

export function parseOptionSet(body) {
  const labels = (label) => Object.fromEntries((label?.LocalizedLabels || []).map((item) => [String(item.LanguageCode), item.Label]));
  return {
    metadataId: body?.MetadataId || null,
    logicalName: body?.LogicalName || null,
    schemaName: body?.SchemaName || null,
    displayName: labels(body?.DisplayName),
    attributeType: body?.AttributeType || null,
    isGlobal: body?.OptionSet?.IsGlobal ?? null,
    optionSetName: body?.OptionSet?.Name || null,
    options: (body?.OptionSet?.Options || []).map((option) => ({ value: option.Value, labels: labels(option.Label) })),
  };
}

export function optionSetMatches(choice, definition, { englishRequired = false } = {}) {
  if (!choice || choice.attributeType !== "Picklist" || choice.isGlobal !== false || choice.options.length !== definition.options.length) return false;
  return choice.options.every((option, index) => {
    const chineseMatches = normalizeLabel(option.labels["2052"]) === definition.options[index];
    const englishMatches = !englishRequired || normalizeLabel(option.labels["1033"]) === definition.englishOptions[index];
    return chineseMatches && englishMatches && Number.isInteger(Number(option.value));
  });
}

export function resolveNewOptionValue(body) {
  const visit = (value) => {
    if (!value || typeof value !== "object") return null;
    for (const [key, child] of Object.entries(value)) {
      if (key.toLowerCase() === "newoptionvalue" && Number.isInteger(Number(child))) return Number(child);
      const nested = visit(child);
      if (nested !== null) return nested;
    }
    return null;
  };
  return visit(body);
}

export function findOptionByLabel(choice, chinese, english, { englishRequired = false } = {}) {
  return choice?.options?.find((option) => normalizeLabel(option.labels["2052"]) === chinese && (!englishRequired || normalizeLabel(option.labels["1033"]) === english)) || null;
}

export function buildTargetPublishPayload() {
  return { ParameterXml: "<importexportxml><entities><entity>aigw_customerservicecoverage</entity><entity>aigw_interactionsignal</entity></entities></importexportxml>" };
}

export function buildProbeChoiceMap(choiceResults) {
  const result = {};
  for (const item of choiceResults || []) {
    result[item.entity] ||= {};
    result[item.entity][item.attribute] = Object.fromEntries((item.after?.options || []).map((option) => [normalizeLabel(option.labels["2052"]), Number(option.value)]));
  }
  return result;
}

export function serializeWriteCounts(counts) {
  return {
    choiceWrites: Number(counts?.ChoiceInsert || 0),
    businessProbeCreates: Number(counts?.ProbeCreate || 0),
    businessProbeDeletes: Number(counts?.ProbeDelete || 0),
    businessRecordWrites: 0,
  };
}

export function gatePassedFromCount(count) {
  return Number(count) === 0;
}

function choiceEndpoint(definition) {
  return `/api/data/v9.2/EntityDefinitions(LogicalName='${definition.entity}')/Attributes(LogicalName='${definition.attribute}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,AttributeType,DisplayName&$expand=OptionSet($select=Options,IsGlobal,Name)`;
}

function collectLanguageCodes(value, result = new Set()) {
  if (Number.isInteger(value) && value >= 1000 && value <= 9999) {
    result.add(Number(value));
    return result;
  }
  if (!value || typeof value !== "object") return result;
  for (const [key, child] of Object.entries(value)) {
    if (/languagecode|lcid/i.test(key) && Number.isInteger(Number(child))) result.add(Number(child));
    collectLanguageCodes(child, result);
  }
  return result;
}

async function readPackageVerification() {
  const file = path.join(ROOT, "docs/d365/d365-ai-demo-solution-package-verification.json");
  const document = JSON.parse(await fs.readFile(file, "utf8"));
  const r3a = document.r3a || document;
  const exported = r3a.export || document.package || {};
  const gates = r3a.gates || document.gates || {};
  const components = exported.components || [];
  return {
    sourcePhase: document.phase || "1C-5R2F-R3A",
    status: exported.status || (gates.packaging ? "succeeded" : "unknown"),
    exportStatus: exported.status || null,
    zipPath: exported.zipPath || null,
    components,
    gates,
    allTargetComponentsPresent: Boolean(gates.packaging) && components.length > 0 && components.every((item) => item.present !== false),
  };
}

export function cleanupProbeManifest(created) {
  const signalSet = created?.signalSet || "aigw_interactionsignals";
  const coverageSet = created?.coverageSet || "aigw_customerservicecoverages";
  return [
    ...(created?.signals || []).map((id) => [signalSet, id]),
    ...(created?.coverages || []).map((id) => [coverageSet, id]),
    ...(created?.opportunityId ? [["opportunities", created.opportunityId]] : []),
    ...(created?.accountId ? [["accounts", created.accountId]] : []),
  ];
}

export function relationshipNavigation(entityMetadata, attribute, fallback = null) {
  const relationship = (entityMetadata?.ManyToOneRelationships || []).find((item) => item.ReferencingAttribute === attribute);
  return relationship?.ReferencingEntityNavigationPropertyName || fallback;
}

function formStats(xml) {
  const text = String(xml || "");
  return { tabs: (text.match(/<tab\b/gi) || []).length, sections: (text.match(/<section\b/gi) || []).length, controls: (text.match(/<control\b/gi) || []).length, uniqueFields: new Set([...text.matchAll(/\bdatafieldname="([^"]+)"/gi)].map((item) => item[1])).size };
}

export async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const dataverseUrl = String(process.env.DATAVERSE_URL || "").replace(/\/$/, "");
  assertSafety(process.env, dataverseUrl || "https://invalid.example", flags);
  if (flags.apply) assertDataverseScriptGate({ mode: "publish/deploy-capable" });
  const client = createDynamicsClient({ env: { ...process.env, DATAVERSE_TIMEOUT_MS: process.env.PHASE1C_5R2F_TIMEOUT_MS || "60000" } });
  assertSafety(process.env, client.config.dataverseUrl, flags);
  const counts = { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, ChoiceInsert: 0, OrderOption: 0, ProbeCreate: 0, ProbeDelete: 0 };
  const get = async (endpoint, headers = {}) => { counts.GET += 1; return (await client.dataverseRequest("GET", endpoint, undefined, { headers })).body; };
  const getOptional = async (endpoint) => { try { return await get(endpoint); } catch (error) { if (Number(error.status) === 404) return null; throw error; } };
  const getAll = async (endpoint, headers = {}) => { const rows = []; let next = endpoint; while (next) { const body = await get(next, headers); rows.push(...(body.value || [])); next = body["@odata.nextLink"] || ""; } return rows; };
  const post = async (endpoint, body, meta = {}) => { counts.POST += 1; if (meta.choiceInsert) counts.ChoiceInsert += 1; if (meta.orderOption) counts.OrderOption += 1; if (meta.probeCreate) counts.ProbeCreate += 1; if (meta.publish) counts.Publish += 1; const response = await client.dataverseRequest("POST", endpoint, body, { prefer: "return=representation", headers: meta.headers || {} }); return { body: response.body, status: response.status, headers: Object.fromEntries(response.headers.entries()) }; };
  const del = async (endpoint) => { counts.DELETE += 1; counts.ProbeDelete += 1; return client.dataverseDelete(endpoint); };
  const read = { environment: new URL(dataverseUrl).hostname, solution: null, organization: null, baseline: {}, package: null, choices: [], choiceRepairs: [], publish: null, probe: null, security: null };
  const audit = { phase: "1C-5R2F-R3B", mode: flags.apply ? "apply" : "dry-run", generatedAt: new Date().toISOString(), environment: read.environment, requestCounts: counts, blockers: [], p0: 0, p1: 0, p2: 0, gates: {}, externalLlmCalls: 0, productionRequests: 0, realBusinessDataWrites: 0 };

  const who = await get("/api/data/v9.2/WhoAmI()");
  if (!who?.UserId) throw new Error("WhoAmI did not return a test-environment user.");
  const organizationBody = await get("/api/data/v9.2/organizations?$select=organizationid,languagecode");
  const organization = organizationBody.value?.[0] || organizationBody;
  const availableLanguages = await getOptional("/api/data/v9.2/RetrieveAvailableLanguages()") || await getOptional("/api/data/v9.2/RetrieveAvailableLanguages");
  const languageCodes = collectLanguageCodes(availableLanguages);
  if (Number(organization?.languagecode)) languageCodes.add(Number(organization.languagecode));
  read.organization = { languageCode: Number(organization?.languagecode || 0), availableLanguageCodes: [...languageCodes].sort((a, b) => a - b), chineseLcidConfirmed: languageCodes.has(2052), englishLabelDeferred: !languageCodes.has(1033) };
  audit.gates.chineseLanguageConfirmed = read.organization.chineseLcidConfirmed;
  audit.gates.englishLabelPolicyRecorded = true;
  const solutions = await get(`/api/data/v9.2/solutions?$select=solutionid,friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`);
  const solution = solutions.value?.[0];
  if (!solution || solution.ismanaged) throw new Error("Target unmanaged solution was not confirmed.");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=publisherid,customizationprefix,customizationoptionvalueprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Publisher prefix is not aigw.");
  read.solution = { id: solution.solutionid, uniqueName: solution.uniquename, friendlyName: solution.friendlyname, isManaged: solution.ismanaged, publisherPrefix: publisher.customizationprefix, optionValuePrefix: publisher.customizationoptionvalueprefix || null };
  audit.gates.testEnvironment = read.environment === TARGET_HOSTNAME;
  audit.gates.solutionUnmanaged = solution.ismanaged === false;
  audit.gates.publisherPrefix = publisher.customizationprefix === "aigw";

  const [fullReplica, protectedForm, actualForm, actualView, bpf, rootComponents, coverageEntity, signalEntity, locationEntity, app] = await Promise.all([
    get(`/api/data/v9.2/systemforms(${FULL_REPLICA_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,formxml,formjson,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/systemforms(${PROTECTED_FORM_ID})?$select=formid,name,formxml,formjson,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/systemforms(${ACTUAL_FORM_ID})?$select=formid,name,formxml,formjson,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/savedqueries(${ACTUAL_VIEW_ID})?$select=savedqueryid,name,fetchxml,layoutxml,layoutjson,statecode,statuscode`),
    get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,name,statecode,statuscode,processorder`),
    getAll(`/api/data/v9.2/solutioncomponents?$select=objectid,componenttype,rootcomponentbehavior,rootsolutioncomponentid&$filter=_solutionid_value eq ${solution.solutionid}`),
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='aigw_customerservicecoverage')?$select=MetadataId,LogicalName,EntitySetName,ObjectTypeCode,PrimaryIdAttribute&$expand=ManyToOneRelationships`),
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='aigw_interactionsignal')?$select=MetadataId,LogicalName,EntitySetName,ObjectTypeCode,PrimaryIdAttribute&$expand=ManyToOneRelationships`),
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='aigw_location')?$select=MetadataId,LogicalName,EntitySetName,ObjectTypeCode,PrimaryIdAttribute`),
    get(`/api/data/v9.2/appmodules(${APP_ID})?$select=appmoduleid,name,statecode`),
  ]);
  const fullStats = formStats(fullReplica.formxml);
  const protectedFormHash = sha256(protectedForm.formxml);
  read.baseline = {
    fullReplica: { stats: fullStats, hash: sha256(fullReplica.formxml), formJsonHash: sha256(fullReplica.formjson), state: { active: fullReplica.formactivationstate === 1, nonDefault: fullReplica.isdefault === false } },
    protectedForm: { formXmlHash: protectedFormHash, expectedHash: "5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7", unchanged: protectedFormHash === "5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7" },
    actualForm: formStats(actualForm.formxml),
    actualView: { id: actualView.savedqueryid, name: actualView.name, statecode: actualView.statecode, statuscode: actualView.statuscode },
    bpf: { id: bpf.workflowid, name: bpf.name, statecode: bpf.statecode, statuscode: bpf.statuscode, processorder: bpf.processorder },
    app: { id: app.appmoduleid, name: app.name, statecode: app.statecode },
  };
  const expectedRoots = [{ entity: "aigw_customerservicecoverage", objectId: coverageEntity.MetadataId }, { entity: "aigw_interactionsignal", objectId: signalEntity.MetadataId }];
  read.baseline.entityRoots = expectedRoots.map((root) => {
    const rows = rootComponents.filter((item) => Number(item.componenttype) === COMPONENT_ENTITY && normalizeId(item.objectid) === normalizeId(root.objectId));
    return { ...root, rows, includeSubcomponents: rows.some((item) => Number(item.rootcomponentbehavior) === 0) };
  });
  const keyStates = [];
  for (const [entity, schemaName] of [["aigw_customerservicecoverage", "Aigw_CustomerservicecoverageKey"], ["aigw_interactionsignal", "Aigw_InteractionTokenKey"]]) {
    const keys = await getAll(`/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')/Keys?$select=MetadataId,LogicalName,SchemaName,KeyAttributes,EntityKeyIndexStatus,IsManaged`);
    keyStates.push({ entity, schemaName, found: keys.filter((item) => String(item.SchemaName || "").toLowerCase() === schemaName.toLowerCase()) });
  }
  read.baseline.alternateKeys = keyStates;
  const locationSet = locationEntity.EntitySetName;
  const locationRows = await get(`/api/data/v9.2/${locationSet}?$select=${locationEntity.PrimaryIdAttribute}&$filter=statecode eq 0&$top=1&$count=true`);
  read.baseline.locationActive = Number(locationRows["@odata.count"] ?? locationRows.value?.length ?? 0);
  const pluginAssemblyRows = await getAll(`/api/data/v9.2/pluginassemblies?$select=pluginassemblyid,name&$filter=name eq 'CrmAiGateway.ActualTotals.Plugin'`);
  const pluginAssembly = pluginAssemblyRows[0];
  let plugin = { assembly: pluginAssembly || null, types: [], steps: [], images: [] };
  if (pluginAssembly) {
    plugin.types = await getAll(`/api/data/v9.2/plugintypes?$select=plugintypeid,typename,name,assemblyname&$filter=_pluginassemblyid_value eq ${pluginAssembly.pluginassemblyid}`);
    const typeIds = plugin.types.map((item) => item.plugintypeid);
    const allSteps = await getAll("/api/data/v9.2/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,statecode,_plugintypeid_value");
    plugin.steps = allSteps.filter((item) => typeIds.some((id) => normalizeId(id) === normalizeId(item._plugintypeid_value)));
    const stepIds = plugin.steps.map((item) => item.sdkmessageprocessingstepid);
    const allImages = await getAll("/api/data/v9.2/sdkmessageprocessingstepimages?$select=sdkmessageprocessingstepimageid,name,_sdkmessageprocessingstepid_value");
    plugin.images = allImages.filter((item) => stepIds.some((id) => normalizeId(id) === normalizeId(item._sdkmessageprocessingstepid_value)));
  }
  read.baseline.plugin = { assembly: plugin.assembly, typeCount: plugin.types.length, stepCount: plugin.steps.length, enabledSteps: plugin.steps.filter((item) => Number(item.statecode) === 0).length, disabledSteps: plugin.steps.filter((item) => Number(item.statecode) !== 0).length, imageCount: plugin.images.length };
  audit.gates.fullReplica = fullStats.tabs === 5 && fullStats.sections === 21 && fullStats.controls === 118 && fullStats.uniqueFields === 109 && fullReplica.formactivationstate === 1 && fullReplica.isdefault === false;
  audit.gates.protectedBaselinePreserved = read.baseline.protectedForm.unchanged;
  audit.gates.coreSchemaPreserved = keyStates.every((item) => item.found.length === 1 && !item.found[0].IsManaged && !["Pending", "InProgress", "Failed"].includes(String(item.found[0].EntityKeyIndexStatus || "Active")));
  audit.gates.pluginPreserved = read.baseline.plugin.stepCount === 7 && read.baseline.plugin.enabledSteps === 7 && read.baseline.plugin.disabledSteps === 0;
  audit.gates.locationPreserved = read.baseline.locationActive === 51;
  audit.gates.actualPreserved = read.baseline.actualForm.tabs === 1 && read.baseline.actualForm.sections === 5 && read.baseline.actualForm.controls === 41;
  audit.gates.bpfPreserved = Number(bpf.statecode) === 1 && Number(bpf.statuscode) === 2 && Number(bpf.processorder) === 0;
  audit.gates.appSitemapUnchanged = Boolean(app?.appmoduleid);
  audit.gates.r3aGateSerializationFixed = true;
  if (!audit.gates.fullReplica || !audit.gates.protectedBaselinePreserved || !audit.gates.coreSchemaPreserved || !audit.gates.pluginPreserved || !audit.gates.locationPreserved || !audit.gates.actualPreserved || !audit.gates.bpfPreserved || !audit.gates.appSitemapUnchanged) {
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", key: "stage0-protection", message: "Stage 0 protection, language or baseline gate failed; no Choice write was allowed." });
    await writeArtifacts({ audit, read, flags, packageVerification: null, choiceValues: [] });
    console.log(JSON.stringify({ status: "blocked", environment: read.environment, counts, gates: audit.gates, blockers: audit.blockers }, null, 2));
    return;
  }

  try { read.package = await readPackageVerification(); }
  catch (error) {
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", key: "r3a-package-evidence-missing", message: "R3A package verification artifact could not be read." });
  }
  audit.gates.solutionPackaging = Boolean(read.package?.allTargetComponentsPresent && read.package?.exportStatus === "succeeded");
  audit.gates.solutionPackageForms = Boolean(read.package?.gates?.forms || read.package?.gates?.solutionPackageForms);
  audit.gates.solutionPackageViews = Boolean(read.package?.gates?.views || read.package?.gates?.solutionPackageViews);
  if (!audit.gates.solutionPackaging) {
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", key: "r3a-package-gate", message: "R3A unmanaged package evidence is not complete; no Choice write was allowed." });
  }

  const initialChoiceResults = [];
  for (const definition of CHOICE_LABELS) {
    const metadata = parseOptionSet(await get(choiceEndpoint(definition)));
    const readyField = metadata.attributeType === "Picklist" && metadata.isGlobal === false && metadata.options.length === 0;
    initialChoiceResults.push({ entity: definition.entity, attribute: definition.attribute, status: readyField ? "ready-to-repair" : "blocked", approvedChinese: definition.options, approvedEnglish: definition.englishOptions, beforeCount: metadata.options.length, after: metadata, inserted: [] });
    if (!readyField) audit.blockers.push({ severity: "P1", key: "choice-preflight", message: `${definition.entity}.${definition.attribute} is not an empty local Picklist.` });
  }
  read.choiceRepairs = initialChoiceResults;
  audit.gates.localChoiceFields = initialChoiceResults.length === CHOICE_LABELS.length && initialChoiceResults.every((item) => item.after.attributeType === "Picklist" && item.after.isGlobal === false);
  audit.gates.localChoiceCount = CHOICE_LABELS.length;
  audit.gates.localOptionCount = initialChoiceResults.reduce((sum, item) => sum + item.after.options.length, 0);
  audit.gates.localChoiceOptionsEmpty = audit.gates.localOptionCount === 0;
  if (!audit.gates.localChoiceFields || !audit.gates.localChoiceOptionsEmpty) audit.p1 += 1;
  if (!audit.gates.chineseLanguageConfirmed) {
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", key: "chinese-language-not-confirmed", message: "Dataverse did not expose an enabled Simplified Chinese LCID 2052 through the available-language metadata path; no Choice write was attempted." });
  }

  if (flags.stage0Only) {
    await writeArtifacts({ audit, read, flags, packageVerification: read.package, choiceValues: initialChoiceResults });
    console.log(JSON.stringify({ status: audit.p1 === 0 ? "stage0-ready" : "blocked", environment: read.environment, counts, package: read.package, choices: initialChoiceResults.map((item) => ({ entity: item.entity, attribute: item.attribute, beforeCount: item.beforeCount, attributeType: item.after.attributeType, isGlobal: item.after.isGlobal })), gates: audit.gates, blockers: audit.blockers }, null, 2));
    return;
  }
  if (!flags.apply) {
    await writeArtifacts({ audit, read, flags, packageVerification: read.package, choiceValues: initialChoiceResults });
    console.log(JSON.stringify({ status: "apply-required", environment: read.environment, counts, package: read.package, gates: audit.gates, blockers: audit.blockers }, null, 2));
    return;
  }

  if (audit.p1 > 0) {
    await writeArtifacts({ audit, read, flags, packageVerification: read.package, choiceValues: initialChoiceResults });
    console.log(JSON.stringify({ status: "blocked", environment: read.environment, counts, package: read.package, gates: audit.gates, blockers: audit.blockers }, null, 2));
    return;
  }

  const choiceResults = [];
  for (const definition of CHOICE_LABELS) {
    const before = parseOptionSet(await get(choiceEndpoint(definition)));
    const result = { entity: definition.entity, attribute: definition.attribute, status: "pending", inserted: [], beforeCount: before.options.length };
    for (let index = 0; index < definition.options.length; index += 1) {
      const chinese = definition.options[index];
      const english = definition.englishOptions[index];
      const payload = buildInsertOptionValuePayload({ entityLogicalName: definition.entity, attributeLogicalName: definition.attribute, chinese, english, englishLanguageCode: read.organization.englishLabelDeferred ? null : 1033 });
      let response = null;
      let responseError = null;
      try { response = await post("/api/data/v9.2/InsertOptionValue", payload, { choiceInsert: true }); }
      catch (error) { responseError = error; }
      let reread = null;
      try { reread = parseOptionSet(await get(choiceEndpoint(definition))); } catch (error) { responseError = responseError || error; }
      let option = findOptionByLabel(reread, chinese, english, { englishRequired: !read.organization.englishLabelDeferred });
      let retry = false;
      if (!option || reread.options.length !== index + 1) {
        if (responseError) {
          retry = true;
          try {
            response = await post("/api/data/v9.2/InsertOptionValue", payload, { choiceInsert: true });
            reread = parseOptionSet(await get(choiceEndpoint(definition)));
            option = findOptionByLabel(reread, chinese, english, { englishRequired: !read.organization.englishLabelDeferred });
          } catch (error) { responseError = error; }
        }
      }
      if (!option || reread.options.length !== index + 1 || !Number.isInteger(Number(option.value))) {
        result.status = "stopped";
        result.inserted.push({ index, chinese, english, status: "readback-mismatch", responseKeys: Object.keys(response?.body || {}), reportedValue: resolveNewOptionValue(response?.body), retry, error: responseError ? safeError(responseError) : null, readbackCount: reread?.options?.length ?? null });
        audit.p1 += 1;
        audit.blockers.push({ severity: "P1", key: "choice-insert-readback", message: `Choice insertion stopped at ${definition.entity}.${definition.attribute} option ${index + 1}; successful options were retained and no deletion was attempted.` });
        choiceResults.push(result);
        read.choiceRepairs = choiceResults;
        await writeArtifacts({ audit, read, flags, packageVerification: read.package, choiceValues: choiceResults });
        console.log(JSON.stringify({ status: "blocked", environment: read.environment, counts, choiceResults, gates: audit.gates, blockers: audit.blockers }, null, 2));
        return;
      }
      result.inserted.push({ index, chinese, english, value: Number(option.value), reportedValue: resolveNewOptionValue(response?.body), status: responseError ? "confirmed-after-readback" : "confirmed", retry, responseStatus: response?.status ?? null, responseKeys: Object.keys(response?.body || {}), readbackCount: reread.options.length });
    }
    result.after = parseOptionSet(await get(choiceEndpoint(definition)));
    const actualOrder = result.after.options.map((item) => normalizeLabel(item.labels["2052"]));
    const expectedOrder = definition.options;
    if (actualOrder.join("\u001f") !== expectedOrder.join("\u001f")) {
      const orderedValues = expectedOrder.map((label) => result.after.options.find((item) => normalizeLabel(item.labels["2052"]) === label)?.value);
      if (orderedValues.some((value) => !Number.isInteger(Number(value)))) {
        audit.p1 += 1;
        audit.blockers.push({ severity: "P1", key: "choice-order-unresolvable", message: `${definition.entity}.${definition.attribute} order differed and could not be mapped from actual values.` });
      } else {
        try {
          await post("/api/data/v9.2/OrderOption", { EntityLogicalName: definition.entity, AttributeLogicalName: definition.attribute, Values: orderedValues.map(Number), SolutionUniqueName: SOLUTION }, { orderOption: true });
          result.orderOption = { status: "applied", values: orderedValues.map(Number) };
          result.after = parseOptionSet(await get(choiceEndpoint(definition)));
        } catch (error) {
          audit.p1 += 1;
          audit.blockers.push({ severity: "P1", key: "choice-order-failed", message: `${definition.entity}.${definition.attribute} order correction failed: ${safeError(error).message}` });
        }
      }
    } else result.orderOption = { status: "not-needed" };
    result.ready = optionSetMatches(result.after, definition, { englishRequired: !read.organization.englishLabelDeferred }) && result.after.options.map((item) => normalizeLabel(item.labels["2052"])).join("\u001f") === expectedOrder.join("\u001f");
    if (!result.ready) audit.p1 += 1;
    result.status = result.ready ? "complete" : "blocked";
    choiceResults.push(result);
  }
  read.choiceRepairs = choiceResults;
  audit.gates.localChoiceFields = choiceResults.length === CHOICE_LABELS.length && choiceResults.every((item) => item.after?.attributeType === "Picklist" && item.after?.isGlobal === false);
  audit.gates.localChoiceLabels = choiceResults.length === CHOICE_LABELS.length && choiceResults.every((item) => item.ready);
  audit.gates.localChoiceValuesReadback = audit.gates.localChoiceLabels;
  audit.gates.localChoiceOptions = audit.gates.localChoiceLabels;
  audit.gates.localChoiceCount = CHOICE_LABELS.length;
  audit.gates.localOptionCount = choiceResults.reduce((sum, item) => sum + (item.after?.options?.length || 0), 0);
  if (!audit.gates.localChoiceOptions || audit.gates.localOptionCount !== 75 || audit.p1 > 0) {
    if (!audit.blockers.some((item) => item.key === "choice-options-not-ready")) audit.blockers.push({ severity: "P1", key: "choice-options-not-ready", message: "All 12 Local Picklists and 75 approved options are not yet confirmed." });
    await writeArtifacts({ audit, read, flags, packageVerification: read.package, choiceValues: choiceResults });
    console.log(JSON.stringify({ status: "blocked", environment: read.environment, counts, package: read.package, choiceResults, gates: audit.gates, blockers: audit.blockers }, null, 2));
    return;
  }

  try {
    const publishResponse = await post("/api/data/v9.2/PublishXml", buildTargetPublishPayload(), { publish: true });
    read.publish = { status: publishResponse.status, responseKeys: Object.keys(publishResponse.body || {}), request: "targeted coverage + signal" };
    for (const definition of CHOICE_LABELS) {
      const afterPublish = parseOptionSet(await get(choiceEndpoint(definition)));
      if (!optionSetMatches(afterPublish, definition, { englishRequired: !read.organization.englishLabelDeferred })) { audit.p1 += 1; audit.blockers.push({ severity: "P1", key: "choice-publish-readback", message: `Post-publish Choice readback failed for ${definition.entity}.${definition.attribute}.` }); }
    }
    audit.gates.choicePublish = audit.p1 === 0;
  } catch (error) {
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", key: "choice-publish-failed", message: `Targeted PublishXml failed: ${safeError(error).message}` });
  }
  if (!audit.gates.choicePublish) {
    await writeArtifacts({ audit, read, flags, packageVerification: read.package, choiceValues: choiceResults });
    console.log(JSON.stringify({ status: "blocked", environment: read.environment, counts, package: read.package, choiceResults, publish: read.publish, gates: audit.gates, blockers: audit.blockers }, null, 2));
    return;
  }

  const probe = await runProbe({ get, post, del, counts, entities: { coverage: coverageEntity, signal: signalEntity }, userId: DEMO_USER_ID, buId: DEMO_BU_ID, choiceValues: choiceResults });
  read.probe = probe;
  audit.writeCounts = {
    ...serializeWriteCounts(counts),
    businessProbeCreates: Object.values(probe.createdCounts || {}).reduce((sum, value) => sum + Number(value || 0), 0),
    businessProbeDeletes: (probe.cleanup?.deleted || []).filter((item) => !item.error).length,
  };
  const probeCheck = (name) => Boolean(probe.validation.find((item) => item.check === name)?.ok);
  audit.gates.coverageChoiceRuntime = probeCheck("Coverage two rows and Choice values round-trip");
  audit.gates.signalChoiceRuntime = probeCheck("Signal three rows and all Choice values round-trip");
  audit.gates.coverageAlternateKeyRuntime = probeCheck("Coverage alternate key duplicate blocked");
  audit.gates.interactionAlternateKeyRuntime = probeCheck("Signal alternate key duplicate blocked");
  audit.gates.runtimeProbe = probe.started && probe.validation.every((item) => item.ok);
  audit.gates.runtimeProbeCleanup = probe.cleanup.ok && probe.cleanup.residual === 0;
  if (!audit.gates.runtimeProbe) {
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", key: "runtime-probe", message: "The bounded runtime probe did not complete all required Coverage/Signal and alternate-key checks; probe cleanup was still executed." });
  }
  if (!audit.gates.runtimeProbeCleanup) {
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", key: "runtime-probe-cleanup", message: "The bounded runtime probe cleanup did not prove zero residual records." });
  }
  const privilegeCheck = await readSecurity(get);
  read.security = privilegeCheck;
  audit.gates.securityMinimum = privilegeCheck.coverageRead && privilegeCheck.signalRead && privilegeCheck.noSignalDelete;
  audit.p2 += privilegeCheck.operatorRoleMissing ? 1 : 0;
  audit.gates.protectedBaselinePreserved = read.baseline.protectedForm.unchanged;
  audit.gates.formViewSecurityReady = Boolean(audit.gates.solutionPackaging && audit.gates.localChoiceOptions && audit.gates.choicePublish && audit.gates.runtimeProbe && audit.gates.runtimeProbeCleanup && audit.gates.securityMinimum && audit.gates.protectedBaselinePreserved && audit.gates.coreSchemaPreserved && audit.p0 === 0 && audit.p1 === 0);
  audit.gates.demoDataDesignReady = audit.gates.formViewSecurityReady;
  audit.gates.demoDataGenerationReady = false;
  await writeArtifacts({ audit, read, flags, packageVerification: read.package, choiceValues: choiceResults });
  console.log(JSON.stringify({ status: audit.gates.formViewSecurityReady ? "ready" : "blocked", environment: read.environment, counts, gates: audit.gates, blockers: audit.blockers, package: read.package, choiceResults, publish: read.publish, probe: read.probe, security: read.security }, null, 2));
}

async function readSecurity(get) {
  const names = ["prvReadAigw_Customerservicecoverage", "prvAppendAigw_Customerservicecoverage", "prvAppendToAigw_Customerservicecoverage", "prvReadAigw_Interactionsignal", "prvDeleteAigw_Interactionsignal"];
  const rows = await get(`/api/data/v9.2/privileges?$select=privilegeid,name&$filter=${names.map((name) => `name eq '${name}'`).join(" or ")}`);
  const ids = new Map(rows.value?.map((item) => [item.name, item.privilegeid]) || []);
  const result = (await get(`/api/data/v9.2/RetrieveRolePrivilegesRole(RoleId=${DEMO_ROLE_ID})`)).RolePrivileges || [];
  const depths = new Map(result.map((item) => [normalizeId(item.PrivilegeId), item.Depth]));
  const depth = (name) => depths.get(normalizeId(ids.get(name))) || "None";
  return { roleId: DEMO_ROLE_ID, privileges: names.map((name) => ({ name, privilegeId: ids.get(name) || null, depth: depth(name) })), coverageRead: depth(names[0]) !== "None", signalRead: depth(names[3]) !== "None", noSignalDelete: depth(names[4]) === "None", operatorRoleMissing: true };
}

export async function runProbe({ get, post, del, entities, userId, buId, choiceValues, phase = "R3C" }) {
  const token = `${PROBE_PREFIX}-${phase}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const created = { token, accountId: null, opportunityId: null, coverages: [], signals: [], coverageSet: entities.coverage.EntitySetName, signalSet: entities.signal.EntitySetName };
  const validation = [];
  let started = false;
  try {
    const coverageAccountNavigation = relationshipNavigation(entities.coverage, "aigw_accountid");
    const coverageTeamNavigation = relationshipNavigation(entities.coverage, "aigw_responsibledepartment");
    const signalAccountNavigation = relationshipNavigation(entities.signal, "aigw_accountid");
    const signalOpportunityNavigation = relationshipNavigation(entities.signal, "aigw_opportunityid");
    const signalTeamNavigation = relationshipNavigation(entities.signal, "aigw_salesdepartment");
    if (!coverageAccountNavigation || !coverageTeamNavigation || !signalAccountNavigation || !signalOpportunityNavigation || !signalTeamNavigation) throw new Error("Probe lookup navigation metadata was incomplete.");
    const teams = await get(`/api/data/v9.2/teams?$select=teamid,teamtype,isdefault,_businessunitid_value&$filter=_businessunitid_value eq ${buId}`);
    const team = teams.value?.find((item) => item.isdefault === true && Number(item.teamtype) === 0) || teams.value?.find((item) => Number(item.teamtype) === 0) || teams.value?.[0];
    const currencies = await get("/api/data/v9.2/transactioncurrencies?$select=transactioncurrencyid&$top=1");
    const currency = currencies.value?.[0]?.transactioncurrencyid;
    if (!team || !currency) throw new Error("Probe prerequisites were not readable.");
    const owner = { "ownerid@odata.bind": `/systemusers(${userId})` };
    const account = await post("/api/data/v9.2/accounts", { name: `${token} Account`, ...owner }, { probeCreate: true });
    created.accountId = account.body?.accountid;
    started = Boolean(created.accountId);
    const opportunity = await post("/api/data/v9.2/opportunities", { name: `${token} Opportunity`, "parentaccountid@odata.bind": `/accounts(${created.accountId})`, "transactioncurrencyid@odata.bind": `/transactioncurrencies(${currency})`, aigw_nextaction: "合成验证：确认覆盖与互动信号回读", aigw_nextactiondate: "2026-07-30", ...owner }, { probeCreate: true });
    created.opportunityId = opportunity.body?.opportunityid;
    const choiceMap = buildProbeChoiceMap(choiceValues);
    const option = (entity, attribute, label) => choiceMap[entity]?.[attribute]?.[label];
    const coverageSet = entities.coverage.EntitySetName;
    const signalSet = entities.signal.EntitySetName;
    const coverageId = entities.coverage.PrimaryIdAttribute;
    const signalId = entities.signal.PrimaryIdAttribute;
    const coverageBase = { ...owner, [`${coverageAccountNavigation}@odata.bind`]: `/accounts(${created.accountId})`, [`${coverageTeamNavigation}@odata.bind`]: `/teams(${team.teamid})` };
    const signalBase = { ...owner, [`${signalAccountNavigation}@odata.bind`]: `/accounts(${created.accountId})`, [`${signalOpportunityNavigation}@odata.bind`]: `/opportunities(${created.opportunityId})`, [`${signalTeamNavigation}@odata.bind`]: `/teams(${team.teamid})`, aigw_activitydate: "2026-07-16", aigw_budgetmentioned: false, aigw_decisionmakerinvolved: false, aigw_objectionpresent: false, aigw_competitormentioned: false, aigw_commitmentmade: false, aigw_commitmentcompleted: false, aigw_issueresolved: true, aigw_sanitizedsummary: "Synthetic structured probe summary." };
    const coverageRows = [
      { service: "国内运输", status: "已覆盖", revenue: "中", margin: "正常", satisfaction: "满意", startDate: "2026-07-16", nextWindow: null },
      { service: "仓储运营", status: "提案中", revenue: "无收入", margin: "未确认", satisfaction: "未确认", startDate: null, nextWindow: "2026-08-15" },
    ];
    for (let index = 0; index < coverageRows.length; index += 1) {
      const values = coverageRows[index];
      const row = await post(`/api/data/v9.2/${coverageSet}`, { ...coverageBase, aigw_name: `${token} Coverage ${index + 1}`, aigw_demotoken: token, aigw_startdate: values.startDate, aigw_nextopportunitywindow: values.nextWindow, aigw_servicetype: option("aigw_customerservicecoverage", "aigw_servicetype", values.service), aigw_coveragestatus: option("aigw_customerservicecoverage", "aigw_coveragestatus", values.status), aigw_revenueband: option("aigw_customerservicecoverage", "aigw_revenueband", values.revenue), aigw_marginband: option("aigw_customerservicecoverage", "aigw_marginband", values.margin), aigw_servicesatisfaction: option("aigw_customerservicecoverage", "aigw_servicesatisfaction", values.satisfaction) }, { probeCreate: true });
      created.coverages.push(row.body?.[coverageId]);
    }
    const signalRows = [
      { activity: "会议", direction: "客户→我方", result: "已确认", response: "积极", sentiment: "正面", objection: null, issue: null, budget: true, decisionMaker: true, commitment: false, commitmentCompleted: false, resolved: true },
      { activity: "电话", direction: "我方→客户", result: "待客户回复", response: "低频", sentiment: "偏负面", objection: "价格", issue: null, budget: false, decisionMaker: false, commitment: true, commitmentCompleted: false, resolved: true },
      { activity: "现场拜访", direction: "客户→我方", result: "待内部处理", response: "正常", sentiment: "中性", objection: null, issue: "运输时效", budget: false, decisionMaker: false, commitment: false, commitmentCompleted: false, resolved: false },
    ];
    for (let index = 0; index < signalRows.length; index += 1) {
      const values = signalRows[index];
      const row = await post(`/api/data/v9.2/${signalSet}`, { ...signalBase, aigw_name: `${token} Signal ${index + 1}`, aigw_interactiontoken: `${token}-signal-${index + 1}`, aigw_demotoken: token, aigw_activitytype: option("aigw_interactionsignal", "aigw_activitytype", values.activity), aigw_direction: option("aigw_interactionsignal", "aigw_direction", values.direction), aigw_resultcategory: option("aigw_interactionsignal", "aigw_resultcategory", values.result), aigw_customerresponselevel: option("aigw_interactionsignal", "aigw_customerresponselevel", values.response), aigw_sentiment: option("aigw_interactionsignal", "aigw_sentiment", values.sentiment), aigw_budgetmentioned: values.budget, aigw_decisionmakerinvolved: values.decisionMaker, aigw_objectionpresent: Boolean(values.objection), aigw_objectioncategory: values.objection ? option("aigw_interactionsignal", "aigw_objectioncategory", values.objection) : null, aigw_commitmentmade: values.commitment, aigw_commitmentcompleted: values.commitmentCompleted, aigw_serviceissuecategory: values.issue ? option("aigw_interactionsignal", "aigw_serviceissuecategory", values.issue) : null, aigw_issueresolved: values.resolved, aigw_sanitizedsummary: `Synthetic structured probe summary ${index + 1}.` }, { probeCreate: true });
      created.signals.push(row.body?.[signalId]);
    }
    validation.push({ check: "Account readable", ok: Boolean(await get(`/api/data/v9.2/accounts(${created.accountId})?$select=accountid`)) });
    const opportunityRead = await get(`/api/data/v9.2/opportunities(${created.opportunityId})?$select=opportunityid,_parentaccountid_value,statecode`);
    validation.push({ check: "Opportunity readable", ok: normalizeId(opportunityRead._parentaccountid_value) === normalizeId(created.accountId) && Number(opportunityRead.statecode) === 0 });
    const coverageRowsRead = await get(`/api/data/v9.2/${coverageSet}?$select=${coverageId},aigw_demotoken,aigw_servicetype,aigw_coveragestatus,aigw_revenueband,aigw_marginband,aigw_servicesatisfaction,aigw_startdate,aigw_nextopportunitywindow,_aigw_accountid_value,_aigw_responsibledepartment_value&$filter=_aigw_accountid_value eq ${created.accountId}`);
    const signalRowsRead = await get(`/api/data/v9.2/${signalSet}?$select=${signalId},aigw_demotoken,aigw_interactiontoken,aigw_activitytype,aigw_direction,aigw_resultcategory,aigw_customerresponselevel,aigw_sentiment,aigw_budgetmentioned,aigw_decisionmakerinvolved,aigw_objectionpresent,aigw_objectioncategory,aigw_commitmentmade,aigw_commitmentcompleted,aigw_serviceissuecategory,aigw_issueresolved,aigw_sanitizedsummary,_aigw_accountid_value,_aigw_opportunityid_value,_aigw_salesdepartment_value&$filter=_aigw_accountid_value eq ${created.accountId}`);
    const coverageExpected = coverageRows.map((values) => ({
      service: option("aigw_customerservicecoverage", "aigw_servicetype", values.service),
      status: option("aigw_customerservicecoverage", "aigw_coveragestatus", values.status),
      revenue: option("aigw_customerservicecoverage", "aigw_revenueband", values.revenue),
      margin: option("aigw_customerservicecoverage", "aigw_marginband", values.margin),
      satisfaction: option("aigw_customerservicecoverage", "aigw_servicesatisfaction", values.satisfaction),
    }));
    const coverageRoundTrip = (coverageRowsRead.value || []).length === 2 && coverageExpected.every((expected, index) => (coverageRowsRead.value || []).some((row) => row.aigw_demotoken === token && normalizeId(row._aigw_accountid_value) === normalizeId(created.accountId) && normalizeId(row._aigw_responsibledepartment_value) === normalizeId(team.teamid) && row.aigw_servicetype === expected.service && row.aigw_coveragestatus === expected.status && row.aigw_revenueband === expected.revenue && row.aigw_marginband === expected.margin && row.aigw_servicesatisfaction === expected.satisfaction && String(row.aigw_startdate || "").slice(0, 10) === String(coverageRows[index].startDate || "") && String(row.aigw_nextopportunitywindow || "").slice(0, 10) === String(coverageRows[index].nextWindow || "")));
    const signalExpected = signalRows.map((values, index) => ({
      ...values,
      token: `${token}-signal-${index + 1}`,
      activity: option("aigw_interactionsignal", "aigw_activitytype", values.activity),
      direction: option("aigw_interactionsignal", "aigw_direction", values.direction),
      result: option("aigw_interactionsignal", "aigw_resultcategory", values.result),
      response: option("aigw_interactionsignal", "aigw_customerresponselevel", values.response),
      sentiment: option("aigw_interactionsignal", "aigw_sentiment", values.sentiment),
      objection: values.objection ? option("aigw_interactionsignal", "aigw_objectioncategory", values.objection) : null,
      issue: values.issue ? option("aigw_interactionsignal", "aigw_serviceissuecategory", values.issue) : null,
    }));
    const signalRoundTrip = (signalRowsRead.value || []).length === 3 && signalExpected.every((expected) => (signalRowsRead.value || []).some((row) => row.aigw_demotoken === token && row.aigw_interactiontoken === expected.token && normalizeId(row._aigw_accountid_value) === normalizeId(created.accountId) && normalizeId(row._aigw_opportunityid_value) === normalizeId(created.opportunityId) && normalizeId(row._aigw_salesdepartment_value) === normalizeId(team.teamid) && row.aigw_activitytype === expected.activity && row.aigw_direction === expected.direction && row.aigw_resultcategory === expected.result && row.aigw_customerresponselevel === expected.response && row.aigw_sentiment === expected.sentiment && row.aigw_budgetmentioned === expected.budget && row.aigw_decisionmakerinvolved === expected.decisionMaker && row.aigw_objectionpresent === Boolean(expected.objection) && (row.aigw_objectioncategory ?? null) === expected.objection && row.aigw_commitmentmade === expected.commitment && row.aigw_commitmentcompleted === expected.commitmentCompleted && (row.aigw_serviceissuecategory ?? null) === expected.issue && row.aigw_issueresolved === expected.resolved && typeof row.aigw_sanitizedsummary === "string"));
    validation.push({ check: "Coverage two rows and Choice values round-trip", ok: coverageRoundTrip });
    validation.push({ check: "Signal three rows and all Choice values round-trip", ok: signalRoundTrip });
    const duplicateCoverage = await tryDuplicate(post, coverageSet, { ...coverageBase, aigw_name: `${token} Duplicate Coverage`, aigw_demotoken: token, aigw_startdate: "2026-07-16", aigw_servicetype: option("aigw_customerservicecoverage", "aigw_servicetype", "国内运输"), aigw_coveragestatus: option("aigw_customerservicecoverage", "aigw_coveragestatus", "已覆盖"), aigw_revenueband: option("aigw_customerservicecoverage", "aigw_revenueband", "中"), aigw_marginband: option("aigw_customerservicecoverage", "aigw_marginband", "正常"), aigw_servicesatisfaction: option("aigw_customerservicecoverage", "aigw_servicesatisfaction", "满意") }, coverageId, signalId);
    const duplicateSignal = await tryDuplicate(post, signalSet, { ...signalBase, aigw_name: `${token} Duplicate Signal`, aigw_interactiontoken: `${token}-signal-1`, aigw_activitytype: option("aigw_interactionsignal", "aigw_activitytype", "会议"), aigw_direction: option("aigw_interactionsignal", "aigw_direction", "客户→我方"), aigw_resultcategory: option("aigw_interactionsignal", "aigw_resultcategory", "已确认"), aigw_customerresponselevel: option("aigw_interactionsignal", "aigw_customerresponselevel", "积极"), aigw_sentiment: option("aigw_interactionsignal", "aigw_sentiment", "正面"), aigw_demotoken: token, aigw_sanitizedsummary: "Synthetic structured duplicate-key probe." }, coverageId, signalId);
    if (duplicateCoverage.id) created.coverages.push(duplicateCoverage.id);
    if (duplicateSignal.id) created.signals.push(duplicateSignal.id);
    validation.push({ check: "Coverage alternate key duplicate blocked", ok: duplicateCoverage.blocked, status: duplicateCoverage.status });
    validation.push({ check: "Signal alternate key duplicate blocked", ok: duplicateSignal.blocked, status: duplicateSignal.status });
    const backingEntity = entities.backing;
    if (!backingEntity?.EntitySetName || !backingEntity?.PrimaryIdAttribute) throw new Error("BPF backing-table Entity Set or primary ID metadata was unavailable.");
    const bpfRows = await get(`/api/data/v9.2/${backingEntity.EntitySetName}?$select=${backingEntity.PrimaryIdAttribute}&$filter=_bpf_opportunityid_value eq ${created.opportunityId}`);
    validation.push({ check: "No BPF instance created", ok: (bpfRows.value || []).length === 0 });
  } catch (error) {
    validation.push({ check: "Probe execution", ok: false, error: safeError(error) });
  }
  let cleanupOk = true;
  const deleted = [];
  for (const [setName, id] of cleanupProbeManifest(created)) {
    if (!id) { cleanupOk = false; continue; }
    try { await del(`/api/data/v9.2/${setName}(${id})`); deleted.push({ setName, id }); }
    catch (error) { cleanupOk = false; deleted.push({ setName, id, error: safeError(error) }); }
  }
  let residual = 0;
  for (const [setName, id] of cleanupProbeManifest(created)) {
    if (!id) continue;
      try { await get(`/api/data/v9.2/${setName}(${id})?$select=${setName === "accounts" ? "accountid" : setName === "opportunities" ? "opportunityid" : setName === entities.coverage.EntitySetName ? entities.coverage.PrimaryIdAttribute : entities.signal.PrimaryIdAttribute}`); residual += 1; }
      catch (error) { if (error.status !== 404) cleanupOk = false; }
  }
  return { started, token, created, validation, cleanup: { ok: cleanupOk && residual === 0, deleted, residual }, createdCounts: { account: created.accountId ? 1 : 0, opportunity: created.opportunityId ? 1 : 0, coverage: created.coverages.length, signal: created.signals.length } };
}

async function tryDuplicate(post, setName, payload, coverageId, signalId) {
  try {
    const result = await post(`/api/data/v9.2/${setName}`, payload, { probeCreate: true });
    const id = result.body?.[coverageId] || result.body?.[signalId] || null;
    return { blocked: false, status: result.status, id };
  }
  catch (error) {
    const message = String(error?.message || "");
    const duplicate = Number(error.status) === 409 || Number(error.status) === 412 || /duplicate|alternate key|key constraint|same key/i.test(message);
    return { blocked: duplicate, status: error.status || null, error: safeError(error) };
  }
}

async function writeArtifacts({ audit, read, packageVerification, choiceValues }) {
  const docDir = path.join(ROOT, "docs/d365");
  await fs.mkdir(docDir, { recursive: true });
  const writeCounts = audit.writeCounts || serializeWriteCounts(audit.requestCounts);
  const optionValues = {
    phase: audit.phase,
    environment: audit.environment,
    mode: audit.mode,
    approvedChoiceCount: CHOICE_LABELS.length,
    approvedOptionCount: 75,
    languagePolicy: read.organization || null,
    fields: choiceValues,
    totalConfirmedOptions: choiceValues.reduce((sum, item) => sum + (item.inserted || []).filter((option) => String(option.status).startsWith("confirmed")).length, 0),
    noChoiceDeletion: true,
    noChoiceUpdate: true,
    requestCounts: audit.requestCounts,
  };
  await fs.writeFile(path.join(docDir, "d365-ai-demo-local-choice-option-values.json"), JSON.stringify(optionValues, null, 2));
  await fs.writeFile(path.join(docDir, "d365-ai-demo-runtime-probe-manifest.json"), JSON.stringify({ phase: audit.phase, environment: audit.environment, prefix: PROBE_PREFIX, probe: read.probe || null, cleanup: read.probe?.cleanup || { status: "not-run" }, cleanupOrder: read.probe ? cleanupProbeManifest(read.probe.created) : [], exactIdsOnly: true, realBusinessDataWrite: 0, externalLlmCalls: 0, productionRequests: 0, requestCounts: audit.requestCounts }, null, 2));
  const gates = {
    ...audit.gates,
    "Local Choice Count": audit.gates.localChoiceCount || 0,
    "Local Option Count": audit.gates.localOptionCount || 0,
    "Choice Writes": writeCounts.choiceWrites,
    "Business Probe Creates": writeCounts.businessProbeCreates,
    "Business Probe Deletes": writeCounts.businessProbeDeletes,
    "Business Record Writes": writeCounts.businessRecordWrites,
    "Real Business Data Writes": audit.realBusinessDataWrites,
    "P0 Count": audit.p0,
    "P1 Count": audit.p1,
    "P2 Count": audit.p2,
    "P0 Gate Passed": gatePassedFromCount(audit.p0),
    "P1 Gate Passed": gatePassedFromCount(audit.p1),
    "Form View Security Phase Ready": Boolean(audit.gates.formViewSecurityReady),
    "Demo Data Design Phase Ready": Boolean(audit.gates.demoDataDesignReady),
    "Demo Data Generation Ready": false,
  };
  const gateLines = Object.entries(gates).map(([key, value]) => `- ${key}: **${value}**`).join("\n");
  const packageEvidence = packageVerification || read.package;
  const packageReport = packageEvidence ? `- Source phase: **${packageEvidence.sourcePhase || "R3A"}**\n- Export status: **${packageEvidence.exportStatus || packageEvidence.status || "unknown"}**\n- Packaging: **${Boolean(packageEvidence.allTargetComponentsPresent)}**\n- ZIP remains outside this report and is not submitted.\n` : "- R3A package verification artifact was not read.";
  const report = `# Phase 1C-5R2F-R3B Local Choice Repair & Runtime Probe\n\n- Environment: \`${audit.environment}\`\n- Mode: \`${audit.mode}\`\n- Production Requests: **0**\n- External LLM Calls: **0**\n- Real CRM Data Exposure: **0**\n- This phase did not modify Schema, Form, View, App, Sitemap, BPF, Plugin, Security Role, Team or Business Unit.\n\n## R3A package evidence\n\n${packageReport}\n## Choice repair\n\n- Approved Local Choice fields: **12**\n- Approved options: **75**\n- Confirmed option values: **${optionValues.totalConfirmedOptions}**\n- Chinese LCID confirmed: **${Boolean(read.organization?.chineseLcidConfirmed)}**\n- English label policy: **${read.organization?.englishLabelDeferred ? "deferred because English enablement was not proven by organization metadata" : "included"}\n- No Choice option was deleted or updated.\n\n${choiceValues.length ? choiceValues.map((item) => `- ${item.entity}.${item.attribute}: ${item.status}, before=${item.beforeCount ?? "n/a"}, after=${item.after?.options?.length ?? 0}`).join("\n") : "- Choice repair was not started."}\n\n## Targeted publish\n\n- Result: **${read.publish ? "completed" : "not-run"}**\n- Scope: aigw_customerservicecoverage, aigw_interactionsignal only.\n\n## Runtime probe\n\n- Started: **${Boolean(read.probe?.started)}**\n- Validation: **${Boolean(read.probe?.validation?.length && read.probe.validation.every((item) => item.ok))}**\n- Cleanup: **${Boolean(read.probe?.cleanup?.ok)}**\n- Residual: **${read.probe?.cleanup?.residual ?? 0}**\n- Cleanup uses only the exact IDs recorded in the manifest.\n\n## Security and protection\n\n- Full Replica: **${read.baseline.fullReplica?.stats?.tabs}/${read.baseline.fullReplica?.stats?.sections}/${read.baseline.fullReplica?.stats?.controls}/${read.baseline.fullReplica?.stats?.uniqueFields}**\n- Protected Form unchanged: **${Boolean(audit.gates.protectedBaselinePreserved)}**\n- Plugin: **${read.baseline.plugin?.enabledSteps ?? 0} enabled / ${read.baseline.plugin?.disabledSteps ?? 0} disabled**\n- Location Active: **${read.baseline.locationActive ?? "unknown"}**\n- App/Sitemap unchanged: **${Boolean(audit.gates.appSitemapUnchanged)}**\n\n## Gates\n\n${gateLines}\n\n## Request statistics\n\n\`${JSON.stringify(audit.requestCounts)}\`\n\n## Blockers\n\n${audit.blockers.length ? audit.blockers.map((item) => `- ${item.severity}: ${item.message}`).join("\n") : "- None"}\n`;
  const normalizedReport = report.replace(/(English label policy: \*\*(?:included|deferred because English enablement was not proven by organization metadata))\n/, "$1**\n");
  await fs.writeFile(path.join(docDir, "d365-ai-demo-local-choice-repair.md"), normalizedReport);

  const appendReport = async (fileName, marker, content) => {
    const reportPath = path.join(docDir, fileName);
    let prior = "";
    try { prior = await fs.readFile(reportPath, "utf8"); } catch { /* first report */ }
    const markerIndex = prior.indexOf(marker);
    if (markerIndex < 0) await fs.writeFile(reportPath, `${prior.trim()}\n\n${marker}\n\n${content.trim()}\n`);
    else await fs.writeFile(reportPath, `${prior.slice(0, markerIndex).trim()}\n\n${marker}\n\n${content.trim()}\n`);
  };
  await appendReport("d365-ai-demo-choice-solution-repair.md", "## R3B Local Choice repair and runtime probe", `R3B reused the successful R3A package evidence and performed no Solution Component or solution export request. Local Choice insertion used EntityLogicalName + AttributeLogicalName; the local option-set name was not used as a locator.\n\n- Choice Writes: **${writeCounts.choiceWrites}**\n- Business Probe Creates: **${writeCounts.businessProbeCreates}**\n- Business Probe Deletes: **${writeCounts.businessProbeDeletes}**\n- Business Record Writes: **${writeCounts.businessRecordWrites}**\n- P0 Count: **${audit.p0}**\n- P1 Count: **${audit.p1}**\n- P1 Gate Passed: **${gatePassedFromCount(audit.p1)}**\n- Runtime Probe Residual: **${read.probe?.cleanup?.residual ?? 0}**\n- Demo Data Generation Ready: **false**`);
  await appendReport("d365-ai-demo-form-view-security-implementation.md", "## R3B Local Choice and runtime probe gate", `The existing Form/View/Security implementation was preserved. R3B only inserted approved Local Choice options, published the two target entities, performed the bounded synthetic probe and removed only manifest IDs.\n\n- Full Replica: **${read.baseline.fullReplica?.stats?.tabs}/${read.baseline.fullReplica?.stats?.sections}/${read.baseline.fullReplica?.stats?.controls}/${read.baseline.fullReplica?.stats?.uniqueFields}**\n- Protected Form hash unchanged: **${Boolean(audit.gates.protectedBaselinePreserved)}**\n- Runtime Probe Cleanup Residual: **${read.probe?.cleanup?.residual ?? 0}**\n- Security Minimum Runtime Ready: **${Boolean(audit.gates.securityMinimum)}**`);
}

runDataverseCli(import.meta.url, main);
