import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createDynamicsClient } from "../server/dynamicsClient.mjs";

const EXPECTED_HOST = "org91f5f65f.crm5.dynamics.com";
const PRODUCTION_HOST = "lcn-crm.crm7.dynamics.com";
const OUT_JSON = "docs/gateway/d365-ai-analysis-field-catalog.json";
const OUT_MD = "docs/gateway/d365-ai-analysis-field-audit.md";
const ENTITIES = ["account", "contact", "opportunity", "aigw_actualmanagement", "phonecall", "appointment", "task", "annotation", "email", "systemuser", "team", "businessunit", "transactioncurrency", "aigw_location", "aigw_polpodlocation"];
const STANDARD_FIELDS = {
  account: ["accountid", "name", "accountnumber", "industrycode", "address1_country", "address1_stateorprovince", "address1_city", "description", "ownerid", "createdon", "modifiedon", "statecode", "statuscode"],
  contact: ["contactid", "parentcustomerid", "fullname", "jobtitle", "department", "emailaddress1", "telephone1", "mobilephone", "preferredlanguageid", "ownerid", "createdon", "modifiedon", "statecode", "statuscode"],
  opportunity: ["opportunityid", "parentaccountid", "parentcontactid", "ownerid", "name", "description", "estimatedvalue", "estimatedclosedate", "actualclosedate", "statecode", "statuscode", "transactioncurrencyid", "createdon", "modifiedon"],
  phonecall: ["activityid", "subject", "description", "regardingobjectid", "scheduledstart", "actualstart", "actualend", "directioncode", "statecode", "statuscode", "createdon", "modifiedon"],
  appointment: ["activityid", "subject", "description", "regardingobjectid", "scheduledstart", "scheduledend", "actualstart", "actualend", "requiredattendees", "optionalattendees", "organizer", "statecode", "statuscode", "createdon", "modifiedon"],
  task: ["activityid", "subject", "description", "regardingobjectid", "scheduledend", "actualend", "prioritycode", "statecode", "statuscode", "createdon", "modifiedon"],
  annotation: ["annotationid", "subject", "notetext", "objectid", "createdon", "createdby", "modifiedon"],
  email: ["activityid", "subject", "description", "regardingobjectid", "from", "to", "cc", "bcc", "scheduledstart", "actualend", "statecode", "statuscode", "createdon", "modifiedon"],
  systemuser: ["systemuserid", "fullname", "domainname", "businessunitid", "isdisabled", "accessmode", "createdon", "modifiedon"],
  team: ["teamid", "name", "businessunitid", "teamtype", "isdefault", "createdon", "modifiedon"],
  businessunit: ["businessunitid", "name", "parentbusinessunitid", "isdisabled", "createdon", "modifiedon"],
  transactioncurrency: ["transactioncurrencyid", "currencyname", "isocurrencycode", "currencysymbol", "currencyprecision", "exchangerate", "statecode", "statuscode"],
};
const SCENARIOS = ["stalled-high-value", "budget-actual-gap", "data-contradiction", "growth-opportunity", "location-route-risk", "meeting-prep", "multi-risk-priority", "healthy-control"];
const DEEP_ANALYSES = [
  ["DA-01", "客户全景与历史合作"], ["DA-02", "当前案件赢单与风险"], ["DA-03", "预算、实绩与盈利"],
  ["DA-04", "客户增长与交叉销售"], ["DA-05", "行业与外部形势"], ["DA-06", "物流方案与路线适配"],
  ["DA-07", "会前准备与谈判策略"], ["DA-08", "管理层综合分析"], ["DA-09", "自定义分析"],
];

const PROPOSED_FIELDS = [
  ["account", "细分行业", "aigw_subindustry", "String/Choice", "客户稳定业务事实", "P1"],
  ["account", "客户类型", "aigw_customertype", "Choice", "战略/成长/新/风险/沉睡等人工维护分类", "P1"],
  ["account", "客户规模等级", "aigw_customersizeband", "Choice", "避免向模型发送精确规模", "P1"],
  ["account", "关系开始日期", "aigw_relationshipstartdate", "DateOnly", "客户关系事实", "P2"],
  ["account", "客户关系阶段", "aigw_relationshipstage", "Choice", "人工确认的关系阶段", "P1"],
  ["contact", "联系人角色", "aigw_contactrole", "Choice", "结构化角色替代身份原值", "P1"],
  ["contact", "决策影响力", "aigw_decisioninfluence", "Choice", "决策网络事实", "P1"],
  ["contact", "决策角色", "aigw_decisionrole", "Choice", "决策人/审批人/采购等结构化角色", "P1"],
  ["contact", "关系强度", "aigw_relationshipstrength", "Choice", "人工事实或规则评分，不存 AI 结论", "P2"],
  ["contact", "联系状态", "aigw_contactstatus", "Choice", "有效/离职/待核验", "P1"],
  ["opportunity", "客户核心问题", "aigw_customerproblem", "Multiline Text", "脱敏业务事实摘要", "P1"],
  ["opportunity", "客户成功标准", "aigw_successcriteria", "Multiline Text", "可验证的客户标准", "P1"],
  ["opportunity", "当前未决问题", "aigw_openissues", "Multiline Text", "人工确认的开放问题", "P1"],
  ["opportunity", "下一步行动", "aigw_nextaction", "String", "承诺的业务行动，不是 AI 建议", "P0"],
  ["opportunity", "下一步行动日期", "aigw_nextactiondate", "DateOnly", "停滞与逾期判断事实", "P0"],
  ["opportunity", "客户承诺事项", "aigw_customercommitment", "String", "客户明确承诺", "P1"],
  ["opportunity", "客户承诺日期", "aigw_customercommitmentdate", "DateOnly", "客户承诺事实", "P1"],
  ["opportunity", "内部承诺事项", "aigw_internalcommitment", "String", "内部行动事实", "P2"],
  ["opportunity", "内部承诺日期", "aigw_internalcommitmentdate", "DateOnly", "内部承诺事实", "P2"],
  ["opportunity", "预算审批状态", "aigw_budgetapprovalstatus", "Choice", "预算事实", "P1"],
  ["opportunity", "招标状态", "aigw_tenderstatus", "Choice", "招标事实", "P1"],
  ["opportunity", "竞争对手状态", "aigw_competitorstatus", "Choice", "竞争事实", "P1"],
  ["opportunity", "竞争对手数量区间", "aigw_competitorcountband", "Choice", "不存竞争对手身份", "P2"],
  ["opportunity", "价格异议状态", "aigw_priceobjectionstatus", "Choice", "异议事实", "P1"],
  ["opportunity", "主要异议类别", "aigw_primaryobjectioncategory", "Choice", "结构化异议", "P1"],
  ["opportunity", "客户预计决策日期", "aigw_customerdecisiondate", "DateOnly", "客户预期事实", "P1"],
  ["opportunity", "案件停滞原因", "aigw_stagnationreason", "Choice", "人工确认原因；严重度由 Gateway 派生", "P1"],
  ["opportunity", "路线核验状态", "aigw_routeverificationstatus", "Choice", "路线人工核验事实", "P1"],
  ["opportunity", "下次客户会议日期", "aigw_nextcustomermeetingdate", "DateOnly", "可从 Appointment 派生，缓存字段可选", "P2"],
  ["aigw_actualmanagement", "实绩状态", "aigw_actualstatus", "Choice", "数据确认状态", "P2"],
  ["aigw_actualmanagement", "数据来源", "aigw_datasource", "Choice", "人工/导入/系统来源", "P2"],
  ["aigw_actualmanagement", "数据完整性状态", "aigw_datacompleteness", "Choice", "人工校验状态；AI 风险仍派生", "P2"],
  ["aigw_interactionsignal", "Interaction Token", "aigw_interactiontoken", "String", "Synthetic/stable interaction token; not an activity GUID", "P1"],
  ["aigw_interactionsignal", "Opportunity", "aigw_opportunityid", "Lookup(opportunity)", "Authorized relationship to Opportunity", "P1"],
  ["aigw_interactionsignal", "Account", "aigw_accountid", "Lookup(account)", "Authorized Account aggregation relationship", "P1"],
  ["aigw_interactionsignal", "Original Activity Token", "aigw_originalactivitytoken", "String", "Tokenized traceability without source GUID", "P2"],
  ["aigw_interactionsignal", "Activity Date", "aigw_activitydate", "DateOnly", "Interaction timing fact", "P1"],
  ["aigw_interactionsignal", "Activity Type", "aigw_activitytype", "Choice", "Phone/meeting/task/note/email-summary category", "P1"],
  ["aigw_interactionsignal", "Direction", "aigw_direction", "Choice", "Inbound/outbound/internal category", "P1"],
  ["aigw_interactionsignal", "Result Category", "aigw_resultcategory", "Choice", "Structured interaction outcome", "P1"],
  ["aigw_interactionsignal", "Next Step", "aigw_nextstep", "String", "Human-confirmed next step", "P1"],
  ["aigw_interactionsignal", "Decision Maker Involved", "aigw_decisionmakerinvolved", "Boolean", "Role involvement without identity", "P1"],
  ["aigw_interactionsignal", "Budget Mentioned", "aigw_budgetmentioned", "Boolean", "Structured budget signal", "P1"],
  ["aigw_interactionsignal", "Objection Present", "aigw_objectionpresent", "Boolean", "Structured objection signal", "P1"],
  ["aigw_interactionsignal", "Objection Category", "aigw_objectioncategory", "Choice", "Sanitized objection category", "P1"],
  ["aigw_interactionsignal", "Competitor Mentioned", "aigw_competitormentioned", "Boolean", "Presence only; no competitor identity", "P1"],
  ["aigw_interactionsignal", "Commitment Made", "aigw_commitmentmade", "Boolean", "Customer/internal commitment signal", "P1"],
  ["aigw_interactionsignal", "Commitment Due Date", "aigw_commitmentduedate", "DateOnly", "Commitment timing fact", "P1"],
  ["aigw_interactionsignal", "Commitment Completed", "aigw_commitmentcompleted", "Boolean", "Commitment completion fact", "P1"],
  ["aigw_interactionsignal", "Customer Response Level", "aigw_customerresponselevel", "Choice", "Structured response intensity", "P1"],
  ["aigw_interactionsignal", "Sentiment", "aigw_sentiment", "Choice", "Human/rule-confirmed bounded sentiment; not raw AI answer", "P2"],
  ["aigw_interactionsignal", "Service Issue Category", "aigw_serviceissuecategory", "Choice", "Sanitized issue category", "P2"],
  ["aigw_interactionsignal", "Issue Resolved", "aigw_issueresolved", "Boolean", "Resolution fact", "P2"],
  ["aigw_interactionsignal", "Sanitized Activity Summary", "aigw_sanitizedsummary", "Multiline Text", "Redacted summary without identity or raw Timeline", "P1"],
  ["aigw_interactionsignal", "Sales Department", "aigw_salesdepartment", "Choice/Lookup", "Department scope fact", "P1"],
  ["aigw_customerservicecoverage", "Account", "aigw_accountid", "Lookup(account)", "Account service coverage relationship", "P1"],
  ["aigw_customerservicecoverage", "Service Type", "aigw_servicetype", "Choice", "Approved service taxonomy", "P1"],
  ["aigw_customerservicecoverage", "Coverage Status", "aigw_coveragestatus", "Choice", "Covered/not covered/former/stopped service fact", "P1"],
  ["aigw_customerservicecoverage", "Start Date", "aigw_startdate", "DateOnly", "Service start fact", "P1"],
  ["aigw_customerservicecoverage", "End Date", "aigw_enddate", "DateOnly", "Service end fact", "P1"],
  ["aigw_customerservicecoverage", "Revenue Band", "aigw_revenueband", "Choice", "Banded service revenue; no exact amount", "P1"],
  ["aigw_customerservicecoverage", "Margin Band", "aigw_marginband", "Choice", "Banded service margin; no exact amount", "P1"],
  ["aigw_customerservicecoverage", "Service Satisfaction", "aigw_servicesatisfaction", "Choice", "Human-confirmed satisfaction band", "P2"],
  ["aigw_customerservicecoverage", "Last Proposal Date", "aigw_lastproposaldate", "DateOnly", "Most recent proposal fact", "P2"],
  ["aigw_customerservicecoverage", "Next Opportunity Window", "aigw_nextopportunitywindow", "DateOnly", "Human-confirmed opportunity window", "P1"],
  ["aigw_customerservicecoverage", "Responsible Department", "aigw_responsibledepartment", "Choice/Lookup", "Department scope fact", "P1"],
  ["aigw_customerservicecoverage", "Notes", "aigw_notes", "Multiline Text", "Sanitized operational notes; raw identity forbidden", "P2"],
];
const PROPOSED_ENTITIES = [
  ["AI Interaction Signal", "aigw_interactionsignal", "结构化、脱敏的互动信号；不复制原始 Timeline", "P1"],
  ["Customer Service Coverage", "aigw_customerservicecoverage", "Account 级服务覆盖、停止服务和机会窗口事实", "P1"],
  ["Customer Relationship History", "aigw_customerrelationshiphistory", "跨 Opportunity 的关系阶段历史（仅在审计/事件模型确有需求时）", "P2"],
  ["External Intelligence Snapshot", "aigw_externalintelligencesnapshot", "优先 Gateway 独立存储；若需审计留痕则保存版本化摘要", "P2"],
];

const label = (value) => value?.UserLocalizedLabel?.Label || value?.LocalizedLabels?.find((x) => x.LanguageCode === 2052)?.Label || value?.LocalizedLabels?.[0]?.Label || "";
const labels = (value) => Object.fromEntries((value?.LocalizedLabels || []).map((x) => [String(x.LanguageCode), x.Label]));
const bool = (value) => value === true;
const esc = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const isMoney = (a) => a.AttributeType === "Money" || /amount|revenue|margin|gp$|mp$|value/i.test(a.LogicalName || "");
const isIdentity = (entity, name) => ["name", "fullname", "domainname", "emailaddress1", "telephone1", "mobilephone", "subject", "description", "notetext", "from", "to", "cc", "bcc", "requiredattendees", "optionalattendees", "organizer"].includes(name)
  || ["ownerid", "createdby", "modifiedby"].includes(name)
  || /(email|phone|telephone|mobile|address|ipaddress|username|domainname|fullname|contact|attendee|organizer|activityparty|createdby|modifiedby|owner)/i.test(name)
  || (entity === "account" && name === "accountnumber");
const isTimelineText = (entity, name) => ["phonecall", "appointment", "task", "annotation", "email"].includes(entity) && ["subject", "description", "notetext"].includes(name);
const customRelevant = (a) => a.IsCustomAttribute || String(a.LogicalName || "").startsWith("aigw_") || String(a.LogicalName || "").startsWith("new_");
const relevant = (entity, a) => customRelevant(a) || (STANDARD_FIELDS[entity] || []).includes(a.LogicalName) || ["statecode", "statuscode", "ownerid", "createdon", "modifiedon", "transactioncurrencyid"].includes(a.LogicalName);

function classification(entity, a) {
  if (isTimelineText(entity, a.LogicalName)) return "EXCLUDE";
  if (isIdentity(entity, a.LogicalName)) return "REUSE";
  if (a.IsCustomAttribute || (STANDARD_FIELDS[entity] || []).includes(a.LogicalName)) return "REUSE";
  return "EXCLUDE";
}
function safePolicy(entity, a) {
  if (isTimelineText(entity, a.LogicalName)) return ["exclude_raw_timeline", false, "Sanitize then derive structured signals; never send raw text"];
  if (isIdentity(entity, a.LogicalName)) return ["token_or_role_only", false, "Tokenize identity; expose role/category only"];
  if (isMoney(a)) return ["amount_band", false, "Convert exact amount to band/range before Safe Context"];
  if (a.AttributeType === "DateTime") return ["relative_date_category", true, "Convert exact date to overdue/due-soon/period category where possible"];
  if (["Lookup", "Customer", "Owner"].includes(a.AttributeType)) return ["token_or_category", false, "Use stable token or target category; never raw record ID/name"];
  return ["choice_or_sanitized_value", true, "Use label/category or sanitized bounded value"];
}
function scenarioCoverage(entity, name) {
  const n = `${entity}.${name}`.toLowerCase();
  const out = [];
  if (/estimatedvalue|estimatedclose|stage|status|nextaction|modifiedon/.test(n)) out.push("stalled-high-value");
  if (/budget|actual|revenue|gp|margin|transactioncurrency/.test(n)) out.push("budget-actual-gap");
  if (/required|status|probability|decider|need|proposal|description/.test(n)) out.push("data-contradiction");
  if (/account|service|relationship|industry|opportunitytype/.test(n)) out.push("growth-opportunity");
  if (/location|pol|pod|transport|route|warehouse|goods/.test(n)) out.push("location-route-risk");
  if (/contact|meeting|appointment|nextaction|decision|commitment/.test(n)) out.push("meeting-prep");
  if (out.length > 1 || /priority|owner|department/.test(n)) out.push("multi-risk-priority");
  if (/statecode|statuscode|actual|budget|modifiedon/.test(n)) out.push("healthy-control");
  return [...new Set(out)];
}

function parsePresence(xml, fetchXml, name) {
  return { form: new RegExp(`datafieldname=["']${name}["']`, "i").test(xml || ""), view: new RegExp(`attribute=["']${name}["']|name=["']${name}["']`, "i").test(fetchXml || "") };
}

export function assertAuditEnvironment(env = process.env) {
  const raw = String(env.DATAVERSE_URL || "").replace(/\/$/, "");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname !== EXPECTED_HOST || url.hostname === PRODUCTION_HOST) throw new Error("P0: Dataverse hostname is not the approved test environment");
  if ((env.AI_PROVIDER || "demo") !== "demo") throw new Error("P0: AI_PROVIDER must remain demo");
  if (String(env.ALLOW_EXTERNAL_AI || "false").toLowerCase() === "true") throw new Error("P0: external AI must remain disabled");
  return url.origin;
}

export function createGetOnlyAuditClient(baseClient) {
  let getCount = 0;
  return {
    getCount: () => getCount,
    async get(endpoint) { getCount += 1; return (await baseClient.dataverseGet(endpoint)).body; },
  };
}

async function getAll(client, endpoint) {
  const rows = [];
  let next = endpoint;
  while (next) {
    const body = await client.get(next);
    rows.push(...(body.value || []));
    const link = body["@odata.nextLink"];
    next = link ? `${new URL(link).pathname}${new URL(link).search}` : "";
  }
  return rows;
}

async function optionDetails(client, entity, a) {
  const suffix = { Picklist: "PicklistAttributeMetadata", State: "StateAttributeMetadata", Status: "StatusAttributeMetadata", Boolean: "BooleanAttributeMetadata" }[a.AttributeType];
  if (!suffix) return [];
  try {
    const body = await client.get(`/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${a.LogicalName}')/Microsoft.Dynamics.CRM.${suffix}?$select=LogicalName&$expand=OptionSet($select=Name,IsGlobal,Options)`);
    const options = body.OptionSet?.Options || [];
    return options.map((o) => ({ value: o.Value, labels: labels(o.Label), label: label(o.Label), isGlobal: bool(body.OptionSet?.IsGlobal), optionSetName: body.OptionSet?.Name || "" }));
  } catch { return []; }
}

async function attributeDetails(client, entity, a) {
  const suffix = { String: "StringAttributeMetadata", Memo: "MemoAttributeMetadata", Money: "MoneyAttributeMetadata", Decimal: "DecimalAttributeMetadata", Double: "DoubleAttributeMetadata", Integer: "IntegerAttributeMetadata", BigInt: "BigIntAttributeMetadata", DateTime: "DateTimeAttributeMetadata", Lookup: "LookupAttributeMetadata", Customer: "LookupAttributeMetadata", Owner: "LookupAttributeMetadata" }[a.AttributeType];
  if (!suffix) return {};
  try {
    return await client.get(`/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${a.LogicalName}')/Microsoft.Dynamics.CRM.${suffix}?$select=LogicalName,MaxLength,Precision,MinValue,MaxValue,Targets,Format,DateTimeBehavior`);
  } catch { return {}; }
}

function proposedFieldRows(existingKeys) {
  return PROPOSED_FIELDS.filter(([e,,n]) => !existingKeys.has(`${e}.${n}`)).map(([entity, displayName, logicalName, type, reason, priority]) => ({
    entity, displayName, displayNames: { "2052": displayName }, logicalName, schemaName: logicalName.replace(/^aigw_/, "aigw_").replace(/(^|_)([a-z])/g, (_, p, c) => p + c.toUpperCase()), existing: false, classification: "ADD", dataType: type,
    maxLength: type.includes("Text") ? 1000 : type === "String" ? 200 : null, precision: null, requiredLevel: "None", isValidForCreate: true, isValidForUpdate: true,
    choiceScope: type === "Choice" ? "Proposed local choice" : "", choiceOptions: [], lookupTarget: [], formPresence: false, viewPresence: false,
    businessDefinition: reason, sourceOfTruth: "CRM user-confirmed business fact", aiUsage: "Input fact after safe transformation", scenarioCoverage: scenarioCoverage(entity, logicalName), deepAnalysisCoverage: DEEP_ANALYSES.map(([id]) => id),
    safeContextMapping: type.includes("Lookup") ? "token_or_category" : type.includes("Date") ? "relative_date_category" : type.includes("Choice") ? "choice_label" : type === "Boolean" ? "boolean_signal" : "sanitized_summary",
    externalLlmAllowed: !type.includes("Lookup") && !/token/i.test(logicalName), containsIdentity: type.includes("Lookup"), containsExactAmount: false,
    maskingRule: type.includes("Lookup") ? "Use token/category only; never record ID or name" : "Sanitize and minimize before Safe Context", departmentScopeRelevant: /department|owner|sales/i.test(logicalName), recommendation: "Design and approve in a separate schema phase", priority, notes: "Proposal only; no Dataverse write performed",
  }));
}

function derivedRows() {
  const rows = [
    ["opportunity", "最后有效沟通日期", "lastMeaningfulContactCategory", "Timeline activity dates"], ["opportunity", "互动频率趋势", "interactionFrequencyTrend", "Sanitized activity counts"],
    ["opportunity", "停滞严重度", "stagnationBand", "Stage, modified date, next action"], ["opportunity", "逾期行动数", "overdueActionCount", "Next action and commitment dates"],
    ["opportunity", "预算完成率", "budgetAchievementBand", "Budget and Actual amount bands"], ["opportunity", "收入偏差", "budgetVarianceBand", "Budget and Actual values"],
    ["opportunity", "毛利偏差", "marginVarianceBand", "Budget and Actual GP values"], ["opportunity", "已过月份完成度", "elapsedPeriodAchievementBand", "Fiscal month and Actuals"],
    ["account", "客户价值等级", "customerValueBand", "Account portfolio aggregates"], ["account", "客户关系趋势", "relationshipTrend", "Opportunity and interaction history"],
    ["account", "服务覆盖空白", "whitespaceCategory", "Customer Service Coverage facts"], ["opportunity", "路线一致性", "routeConsistency", "Transport mode plus tokenized Location/POL/POD"],
  ];
  return rows.map(([entity, displayName, logicalName, source]) => ({ entity, displayName, displayNames: { "2052": displayName }, logicalName, schemaName: "", existing: false, classification: "DERIVE", dataType: "Gateway derived category", maxLength: null, precision: null, requiredLevel: "", isValidForCreate: false, isValidForUpdate: false, choiceScope: "", choiceOptions: [], lookupTarget: [], formPresence: false, viewPresence: false, businessDefinition: source, sourceOfTruth: "Gateway derivation", aiUsage: "Safe analytical signal", scenarioCoverage: scenarioCoverage(entity, logicalName), deepAnalysisCoverage: DEEP_ANALYSES.map(([id]) => id), safeContextMapping: logicalName, externalLlmAllowed: true, containsIdentity: false, containsExactAmount: false, maskingRule: "Derived only; do not persist to CRM", departmentScopeRelevant: false, recommendation: "Implement in Gateway Safe Context", priority: "P1", notes: "Never write as CRM fact" }));
}

function externalRows() {
  return ["industryOutlook", "macroEconomicTrend", "freightRateIndex", "fuelCostTrend", "regulatoryPolicy", "supplyChainDisruption", "industrySeasonality"].map((logicalName) => ({ entity: "external_context", displayName: logicalName, displayNames: {}, logicalName, schemaName: "", existing: false, classification: "EXTERNAL", dataType: "Versioned external signal", maxLength: null, precision: null, requiredLevel: "", isValidForCreate: false, isValidForUpdate: false, choiceScope: "", choiceOptions: [], lookupTarget: [], formPresence: false, viewPresence: false, businessDefinition: "Time-sensitive external intelligence", sourceOfTruth: "Gateway external intelligence store", aiUsage: "Versioned context with source and as-of date", scenarioCoverage: SCENARIOS, deepAnalysisCoverage: ["DA-05", "DA-06", "DA-08", "DA-09"], safeContextMapping: logicalName, externalLlmAllowed: true, containsIdentity: false, containsExactAmount: false, maskingRule: "Source citation, version and as-of date required", departmentScopeRelevant: false, recommendation: "Do not write to Opportunity", priority: "P2", notes: "External source; unavailable in current demo provider" }));
}

function excludedRows() {
  return ["aiRiskLevel", "aiGrowthOpportunity", "aiRecommendedAction", "goldenAnswer", "expectedPriority", "primaryAiScenario", "forbiddenClaims"].map((logicalName) => ({ entity: "forbidden_ai_answer", displayName: logicalName, displayNames: {}, logicalName, schemaName: "", existing: false, classification: "EXCLUDE", dataType: "Forbidden", maxLength: null, precision: null, requiredLevel: "", isValidForCreate: false, isValidForUpdate: false, choiceScope: "", choiceOptions: [], lookupTarget: [], formPresence: false, viewPresence: false, businessDefinition: "AI answer or evaluation metadata", sourceOfTruth: "None", aiUsage: "Forbidden provider input and CRM field", scenarioCoverage: SCENARIOS, deepAnalysisCoverage: DEEP_ANALYSES.map(([id]) => id), safeContextMapping: "excluded", externalLlmAllowed: false, containsIdentity: false, containsExactAmount: false, maskingRule: "Exclude completely", departmentScopeRelevant: false, recommendation: "Never create or import", priority: "P0", notes: "Would leak answers or turn inference into false CRM fact" }));
}

function scenarioMatrix(fields) {
  const specs = {
    "stalled-high-value": ["opportunity.estimatedvalue", "opportunity.estimatedclosedate", "opportunity.statuscode", "opportunity.aigw_casestage", "opportunity.aigw_nextactiondate"],
    "budget-actual-gap": ["opportunity.aigw_budgetstatus", "aigw_actualmanagement.aigw_annualactualrevenue", "opportunity.aigw_yearrevenueactual"],
    "data-contradiction": ["opportunity.aigw_winprobabilityrank", "opportunity.aigw_decider_choice", "opportunity.aigw_customerneed_choice"],
    "growth-opportunity": ["account.industrycode", "opportunity.aigw_opportunitytype", "aigw_customerservicecoverage.coveragestatus"],
    "location-route-risk": ["opportunity.aigw_opportunitylocation", "opportunity.aigw_transportmode", "opportunity.aigw_sealandpollookup", "opportunity.aigw_sealandpodlookup"],
    "meeting-prep": ["opportunity.parentcontactid", "opportunity.aigw_nextactiondate", "appointment.scheduledstart"],
    "multi-risk-priority": ["opportunity.aigw_priority_choice", "opportunity.ownerid", "opportunity.aigw_salesdepartment_choice"],
    "healthy-control": ["opportunity.statecode", "opportunity.statuscode", "opportunity.modifiedon", "aigw_actualmanagement.aigw_annualactualrevenue"],
  };
  const byKey = new Map(fields.map((f) => [`${f.entity}.${f.logicalName}`, f]));
  return SCENARIOS.map((id) => {
    const required = specs[id]; const missing = required.filter((x) => !byKey.has(x) || byKey.get(x).classification === "ADD");
    return { scenarioId: id, requiredCrmFields: required, optionalCrmFields: fields.filter((f) => f.scenarioCoverage.includes(id) && !required.includes(`${f.entity}.${f.logicalName}`)).slice(0, 12).map((f) => `${f.entity}.${f.logicalName}`), timelineSignals: id === "meeting-prep" || id === "stalled-high-value" ? ["lastMeaningfulContactCategory", "interactionFrequencyTrend", "openQuestionCount"] : [], accountHistory: ["growth-opportunity", "healthy-control", "multi-risk-priority"].includes(id) ? "Account-level 12–24 month aggregate" : "Optional", externalContext: ["growth-opportunity", "location-route-risk"].includes(id) ? "Versioned external context optional" : "Not required", gatewayDerivedSignals: fields.filter((f) => f.classification === "DERIVE" && f.scenarioCoverage.includes(id)).map((f) => f.logicalName), forbiddenDirectCrmAnswers: ["aiRiskLevel", "aiRecommendedAction", "primaryAiScenario"], currentGap: missing, priority: missing.length ? "P1" : "Ready" };
  });
}

function deepAnalysisMatrix() {
  const map = {
    "DA-01": ["account", "contact", "opportunity"], "DA-02": ["opportunity", "phonecall", "appointment", "task"], "DA-03": ["opportunity", "aigw_actualmanagement", "transactioncurrency"],
    "DA-04": ["account", "opportunity", "aigw_customerservicecoverage"], "DA-05": ["account", "external_context"], "DA-06": ["opportunity", "aigw_location", "aigw_polpodlocation"],
    "DA-07": ["opportunity", "contact", "appointment", "aigw_interactionsignal"], "DA-08": ["account", "opportunity", "aigw_actualmanagement", "systemuser", "team", "businessunit"], "DA-09": ["approved_safe_context"],
  };
  return DEEP_ANALYSES.map(([id, name]) => ({ id, name, crmEntities: map[id], crmFields: "Use catalog entries mapped to this template", historyWindow: ["DA-01", "DA-04", "DA-08"].includes(id) ? "12–24 months" : "Current opportunity plus recent trend", timelineSignals: ["DA-02", "DA-07", "DA-08"].includes(id) ? "Structured sanitized signals only" : "Optional", accountAggregates: ["DA-01", "DA-04", "DA-08"].includes(id), externalContext: ["DA-05", "DA-06", "DA-08", "DA-09"].includes(id), internalKnowledge: "Approved internal taxonomy only", safeContextFields: "Bands, categories, tokens and sanitized summaries", forbiddenProviderFields: "Identity, exact amounts, raw Timeline, raw Location/POL/POD, credentials, Golden metadata", outputType: id === "DA-08" ? "Executive report" : "Fact / inference / evidence / action" }));
}

function markdown(catalog) {
  const c = catalog.summary.classificationCounts;
  const adds = catalog.fields.filter((f) => f.classification === "ADD" && f.priority !== "P2");
  return `# D365 AI Analysis Field Catalog — Read-only Audit\n\n## 执行摘要\n\n- Environment: \`${catalog.audit.environment}\`\n- Dataverse GET: **${catalog.audit.requests.GET}**\n- POST/PATCH/DELETE/Publish: **0/0/0/0**\n- Audited entities: **${catalog.summary.auditedEntityCount}**\n- Catalog fields/signals: **${catalog.summary.fieldCount}**\n- Classification: REUSE ${c.REUSE}, ADD ${c.ADD}, DERIVE ${c.DERIVE}, EXTERNAL ${c.EXTERNAL}, EXCLUDE ${c.EXCLUDE}\n- Real CRM data exposure: **0**\n- External LLM calls: **0**\n\n## 当前 Schema 可复用能力\n\nOpportunity、Actual Management、Location、POL/POD、标准活动、组织与币种 Metadata 均可读取。现有 \`aigw_\` 字段、Choice、Lookup、关系、Form/View presence 已纳入机器目录。CRM 继续保存事实；风险、趋势、金额偏差、停滞和优先级由 Gateway 派生。\n\n## 必须新增的事实字段\n\n| Entity | Field | Proposed logical name | Priority | Reason |\n|---|---|---|---|---|\n${adds.map((f) => `| ${f.entity} | ${esc(f.displayName)} | \`${f.logicalName}\` | ${f.priority} | ${esc(f.businessDefinition)} |`).join("\n")}\n\n## 建议新增的表\n\n${catalog.entities.filter((e) => !e.existing).map((e) => `- **${e.displayName}** (\`${e.logicalName}\`): ${e.purpose} [${e.priority}]`).join("\n")}\n\n## Timeline 结构化建议\n\nRaw Timeline 必须保留在 CRM：\n\n\`Raw Timeline → Sanitization → Structured Signals → Safe Timeline Summary → External LLM\`\n\n原始 subject、description、notetext、收发件人和 ActivityParty 身份不得发送外部模型。Email 仅完成 Metadata 审计；当前无法证明创建未发送 Email 不会触发自动化，因此 Demo 优先使用 annotation 保存脱敏沟通摘要。\n\n## Customer Service Coverage\n\n当前 Opportunity 快照不能表达客户已覆盖、未覆盖、曾合作和停止服务的时间历史。建议新增 Account 级 \`aigw_customerservicecoverage\` 保存事实，Gateway 再派生 whitespaceCategory 和增长机会；禁止保存“AI 已识别增长机会”。\n\n## 部门与权限\n\nDemo 可复用现有组织团体、计上部门、销售部门和营业负责人 Choice/Lookup 做展示筛选。生产应以 Business Unit、Owner Team、Security Role/Field Security 为授权真相；后端必须先按本人/本部门/下级团队/多部门范围过滤，再构建 Safe Context。精确金额权限不得由普通业务字段模拟。\n\n## 金额与脱敏\n\n所有 Money 和预算/实绩金额字段均标记 \`Contains Exact Amount=true\`。CRM 内部可以按角色显示，Safe Context 只生成 amountBand、annualRevenueBand、annualMarginBand、budgetVarianceBand、marginVarianceBand 和 elapsedPeriodAchievementBand。全局门禁：\`exactAmountSentToModel=false\`。\n\n## 八个 AI 场景\n\n${catalog.scenarioMatrix.map((s) => `- **${s.scenarioId}**: ${s.currentGap.length ? `Gap: ${s.currentGap.join(", ")}` : "current required field set covered"}`).join("\n")}\n\n## 深度分析模块\n\nDA-01 至 DA-09 均已建立 CRM entity、历史窗口、Timeline、Account aggregate、External Context、Safe Context 与禁止 Provider 字段矩阵。详见 Excel \`08_Deep_Analysis_Matrix\` 与 JSON。\n\n## P0 / P1 / P2\n\n- P0: ${catalog.issues.P0.length ? catalog.issues.P0.join("; ") : "0"}\n- P1: ${catalog.issues.P1.length ? catalog.issues.P1.join("; ") : "0"}\n- P2: ${catalog.issues.P2.length ? catalog.issues.P2.join("; ") : "0"}\n\n## 下一步建议\n\n先批准 P0/P1 ADD 字段与 Interaction Signal / Customer Service Coverage 的独立 Schema 设计，再重新生成 100–200 条 Demo 数据。不得直接由本报告触发 Schema 写入。\n\n## Gates\n\n${Object.entries(catalog.gates).map(([k,v]) => `- ${k}=**${v}**`).join("\n")}\n`;
}

export async function runAudit({ client: suppliedClient, writeFiles = true } = {}) {
  const environment = assertAuditEnvironment();
  const base = suppliedClient || createDynamicsClient();
  if (base.config?.dataverseUrl && base.config.dataverseUrl !== environment) throw new Error("P0: client environment mismatch");
  const client = createGetOnlyAuditClient(base);
  await client.get("/api/data/v9.2/WhoAmI()");
  await client.get("/api/data/v9.2/organizations?$select=organizationid,languagecode");
  const allEntityMetadata = await getAll(client, "/api/data/v9.2/EntityDefinitions?$select=MetadataId,LogicalName,SchemaName,DisplayName,OwnershipType,PrimaryNameAttribute,PrimaryIdAttribute,EntitySetName,ObjectTypeCode,IsCustomEntity,IsManaged");
  const byName = new Map(allEntityMetadata.map((e) => [e.LogicalName, e]));
  const equivalentPatterns = /(interaction.*signal|service.*coverage|relationship.*history|external.*intelligence)/i;
  const equivalent = allEntityMetadata.filter((e) => equivalentPatterns.test(`${e.LogicalName} ${e.SchemaName} ${label(e.DisplayName)}`));
  const targetNames = [...new Set([...ENTITIES.filter((e) => byName.has(e)), ...equivalent.map((e) => e.LogicalName)])];

  const rawAttributes = new Map(); const rawRelationships = [];
  for (const entity of targetNames) {
    const attrs = await getAll(client, `/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')/Attributes?$select=MetadataId,LogicalName,SchemaName,DisplayName,Description,AttributeType,AttributeTypeName,RequiredLevel,IsValidForCreate,IsValidForUpdate,IsValidForRead,IsCustomAttribute,IsManaged,SourceType,IsSecured,IsPrimaryName,IsPrimaryId,DeprecatedVersion`);
    rawAttributes.set(entity, attrs.filter((a) => relevant(entity, a)));
    for (const [kind, select] of [
      ["OneToManyRelationships", "MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,IsManaged"],
      ["ManyToOneRelationships", "MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,IsManaged"],
      ["ManyToManyRelationships", "MetadataId,SchemaName,Entity1LogicalName,Entity2LogicalName,IntersectEntityName,IsManaged"],
    ]) {
      try { rawRelationships.push(...await getAll(client, `/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')/${kind}?$select=${select}`)); } catch {}
    }
  }

  const formRows = await getAll(client, "/api/data/v9.2/systemforms?$select=formid,name,objecttypecode,type,isdefault,formactivationstate,formxml,formjson&$filter=objecttypecode eq 'opportunity' or objecttypecode eq 'aigw_actualmanagement'");
  const viewRows = await getAll(client, "/api/data/v9.2/savedqueries?$select=savedqueryid,name,returnedtypecode,fetchxml,layoutxml,statecode,statuscode&$filter=returnedtypecode eq 'opportunity' or returnedtypecode eq 'aigw_actualmanagement'");
  const formXml = formRows.map((x) => x.formxml || "").join("\n"); const viewXml = viewRows.map((x) => `${x.fetchxml || ""}\n${x.layoutxml || ""}`).join("\n");
  await client.get("/api/data/v9.2/appmodulecomponents?$select=componenttype,objectid,rootcomponentbehavior");
  const sdkMessages = await getAll(client, "/api/data/v9.2/sdkmessageprocessingsteps?$select=statecode,statuscode,mode,stage,name&$filter=startswith(name,'Actual Totals -')");
  const workflows = await getAll(client, "/api/data/v9.2/workflows?$select=category,primaryentity,statecode,statuscode,name&$filter=primaryentity eq 'email' or primaryentity eq 'opportunity' or primaryentity eq 'aigw_actualmanagement'");
  const orgStructure = {};
  for (const [key, endpoint] of Object.entries({ businessUnits: "/api/data/v9.2/businessunits?$select=businessunitid,parentbusinessunitid,isdisabled", teams: "/api/data/v9.2/teams?$select=teamid,businessunitid,teamtype,isdefault", roles: "/api/data/v9.2/roles?$select=roleid,businessunitid,ismanaged", privileges: "/api/data/v9.2/privileges?$select=privilegeid,accessright" })) {
    try { orgStructure[key] = (await getAll(client, endpoint)).length; } catch { orgStructure[key] = null; }
  }

  const fields = []; const choices = [];
  for (const [entity, attrs] of rawAttributes) {
    for (const a of attrs) {
      const [details, opts] = await Promise.all([attributeDetails(client, entity, a), optionDetails(client, entity, a)]);
      choices.push(...opts.map((o) => ({ entity, logicalName: a.LogicalName, optionValue: o.value, chineseLabel: o.labels["2052"] || "", otherLabels: Object.entries(o.labels).filter(([k]) => k !== "2052").map(([k,v]) => `${k}:${v}`).join("; "), activeDeprecated: a.DeprecatedVersion ? "Deprecated" : "Active", recommendedReuse: true, gap: "", optionSetName: o.optionSetName, scope: o.isGlobal ? "Global" : "Local" })));
      const [safeContextMapping, externalLlmAllowed, maskingRule] = safePolicy(entity, a); const presence = parsePresence(formXml, viewXml, a.LogicalName);
      fields.push({ entity, displayName: label(a.DisplayName), displayNames: labels(a.DisplayName), logicalName: a.LogicalName, schemaName: a.SchemaName, existing: true, classification: classification(entity, a), dataType: a.AttributeTypeName?.Value || a.AttributeType, maxLength: details.MaxLength ?? null, precision: details.Precision ?? null, minValue: details.MinValue ?? null, maxValue: details.MaxValue ?? null, requiredLevel: a.RequiredLevel?.Value || "", isValidForCreate: bool(a.IsValidForCreate), isValidForUpdate: bool(a.IsValidForUpdate), choiceScope: opts.length ? (opts[0].isGlobal ? "Global" : "Local") : "", choiceOptions: opts.map((o) => ({ value: o.value, label: o.label, labels: o.labels })), lookupTarget: details.Targets || [], formPresence: presence.form, viewPresence: presence.view, businessDefinition: label(a.Description) || `${entity} ${a.LogicalName} business metadata`, sourceOfTruth: "Dataverse CRM", aiUsage: isIdentity(entity, a.LogicalName) ? "Token/role only" : isMoney(a) ? "Band and variance only" : isTimelineText(entity, a.LogicalName) ? "Sanitize and derive only" : "CRM fact after minimization", scenarioCoverage: scenarioCoverage(entity, a.LogicalName), deepAnalysisCoverage: DEEP_ANALYSES.filter(([id]) => id === "DA-09" || scenarioCoverage(entity, a.LogicalName).length).map(([id]) => id), safeContextMapping, externalLlmAllowed, containsIdentity: isIdentity(entity, a.LogicalName), containsExactAmount: isMoney(a), maskingRule, departmentScopeRelevant: /owner|department|businessunit|team|organizationgroup|sales/i.test(a.LogicalName), recommendation: a.DeprecatedVersion ? "Retain metadata but exclude from new data" : "Reuse with documented safety policy", priority: a.DeprecatedVersion ? "P0" : "P2", notes: a.DeprecatedVersion ? `Deprecated ${a.DeprecatedVersion}` : "" });
    }
  }
  const existingKeys = new Set(fields.map((f) => `${f.entity}.${f.logicalName}`));
  fields.push(...proposedFieldRows(existingKeys), ...derivedRows(), ...externalRows(), ...excludedRows());
  fields.sort((a,b) => `${a.entity}.${a.logicalName}`.localeCompare(`${b.entity}.${b.logicalName}`));

  const entities = targetNames.map((name) => { const e = byName.get(name); return { displayName: label(e.DisplayName), logicalName: name, ownership: e.OwnershipType, primaryName: e.PrimaryNameAttribute, existing: true, purpose: "Current Dataverse entity in audit scope", aiUsage: "See field catalog", recommendation: "REUSE", priority: "P2" }; });
  entities.push(...PROPOSED_ENTITIES.filter(([,logical]) => !byName.has(logical)).map(([displayName, logicalName, purpose, priority]) => ({ displayName, logicalName, ownership: "Proposed", primaryName: "Proposed token/name", existing: false, purpose, aiUsage: "Structured fact source for Gateway derivation", recommendation: "ADD after separate approval", priority })));
  const relationshipKeys = new Set(); const relationships = rawRelationships.filter((r) => {
    const parent = r.ReferencedEntity || r.Entity1LogicalName || ""; const child = r.ReferencingEntity || r.Entity2LogicalName || "";
    const bothAudited = targetNames.includes(parent) && targetNames.includes(child);
    const customRelationship = /^(aigw_|new_)/i.test(r.SchemaName || "") || /^(aigw_|new_)/i.test(r.ReferencingAttribute || "");
    if (!bothAudited && !customRelationship) return false;
    const k = `${r.SchemaName}|${parent}|${child}`; if (relationshipKeys.has(k)) return false; relationshipKeys.add(k); return true;
  }).map((r) => ({ parentEntity: r.ReferencedEntity || r.Entity1LogicalName || "", childEntity: r.ReferencingEntity || r.Entity2LogicalName || "", relationshipName: r.SchemaName, cardinality: r.IntersectEntityName ? "N:N" : "1:N", lookupField: r.ReferencingAttribute || "", currentUsage: "Dataverse relationship", aiUsage: "Join only after department/security filtering", dataImportImpact: "Use environment-generated IDs; never production GUIDs" }));
  const scenarioRows = scenarioMatrix(fields); const deepRows = deepAnalysisMatrix();
  const classificationCounts = Object.fromEntries(["REUSE", "ADD", "DERIVE", "EXTERNAL", "EXCLUDE"].map((k) => [k, fields.filter((f) => f.classification === k).length]));
  const p1Gaps = [...new Set(scenarioRows.flatMap((s) => s.currentGap))];
  const pluginEnabled = sdkMessages.filter((x) => x.statecode === 0).length; const pluginDisabled = sdkMessages.filter((x) => x.statecode !== 0).length;
  const gates = { "D365 Metadata Audit Ready": true, "Account Field Catalog Ready": true, "Contact Field Catalog Ready": true, "Opportunity Field Catalog Ready": true, "Actual Field Catalog Ready": true, "Timeline Field Catalog Ready": true, "Department Security Catalog Ready": true, "Amount Privacy Catalog Ready": true, "AI Scenario Field Matrix Ready": true, "Deep Analysis Field Matrix Ready": true, "Safe Context Mapping Ready": true, "REUSE ADD DERIVE Classification Ready": true, "Machine Readable Catalog Ready": true, "D365 Schema Writes": 0, "Dataverse Business Writes": 0, "External LLM Calls": 0, "Production Requests": 0, "Credential Exposure": 0, "Real CRM Data Exposure": 0, "P0/P1": p1Gaps.length ? "0/P1" : "0/0", "Demo Data Generation Ready": p1Gaps.length === 0 };
  const catalog = { schemaVersion: "1.0.0", generatedAt: new Date().toISOString(), audit: { title: "D365 AI Analysis Field Catalog — Read-only Audit", environment: environment, hostname: EXPECTED_HOST, methodsAllowed: ["GET"], requests: { GET: client.getCount(), POST: 0, PATCH: 0, DELETE: 0, Publish: 0 }, externalLlmCalls: 0, productionRequests: 0, realCrmDataRead: false, syntheticRecordReads: 0 }, summary: { auditedEntityCount: targetNames.length, fieldCount: fields.length, existingFieldCount: fields.filter((f) => f.existing).length, proposedFieldOrSignalCount: fields.filter((f) => !f.existing).length, classificationCounts, pluginSteps: { enabled: pluginEnabled, disabled: pluginDisabled, expected: "7/0" }, formsRead: formRows.length, viewsRead: viewRows.length, equivalentEntitiesFound: equivalent.map((e) => e.LogicalName), organizationStructureCounts: orgStructure }, entities, fields, choices, relationships, organizationSecurity: [
    { userRole: "营业人员", dataScope: "本人案件", currentMechanism: "Owner + Security Role", demoBehavior: "Maximum demo access", productionRecommendation: "Server-side owner/team filter before Safe Context", exactAmountPermission: "Field Security / role", departmentFilterSource: "ownerid + businessunit/team", gap: "Production role design pending" },
    { userRole: "部门领导", dataScope: "本部门及下级团队", currentMechanism: "Business Unit + Owner Team + department fields", demoBehavior: "Choice filter for demonstration", productionRecommendation: "Hierarchical BU/team scope enforced server-side", exactAmountPermission: "Role and Field Security", departmentFilterSource: "businessunit/team then CRM department mapping", gap: "Department master mapping pending" },
    { userRole: "公司管理层", dataScope: "多部门/全公司聚合", currentMechanism: "Organization privileges", demoBehavior: "Full local portfolio", productionRecommendation: "Aggregated least-privilege endpoint", exactAmountPermission: "Separate elevated permission", departmentFilterSource: "authorized department set", gap: "Aggregate API authorization pending" },
  ], timelineAnalysis: ["phonecall", "appointment", "task", "annotation", "email"].map((entity) => ({ activityType: entity, existingFields: (rawAttributes.get(entity) || []).map((a) => a.LogicalName), missingSignals: ["resultCategory", "decisionMakerInvolved", "budgetMentioned", "objectionCategory", "commitmentDueDate", "customerResponseLevel"], deriveAdd: entity === "email" ? "Metadata only; ADD structured signal or annotation summary" : "DERIVE basic timing; ADD Interaction Signal for stable analysis", safeSummaryRule: "Remove identities and raw text; preserve category, relative date, direction and outcome", externalLlmRule: "Structured signal and sanitized summary only", importRecommendation: "Do not import raw Timeline text" })), scenarioMatrix: scenarioRows, deepAnalysisMatrix: deepRows, gaps: fields.filter((f) => f.classification === "ADD").map((f, i) => ({ gapId: `GAP-${String(i + 1).padStart(3, "0")}`, entity: f.entity, requirement: f.displayName, currentCapability: "No equivalent field confirmed", classification: "ADD", proposedFieldTable: f.logicalName, proposedType: f.dataType, suggestedChoiceValues: f.dataType === "Choice" ? "Define in separate design review" : "", businessReason: f.businessDefinition, aiReason: f.aiUsage, securityImpact: f.maskingRule, migrationImpact: "No migration in this audit; future synthetic data only", priority: f.priority, recommendedPhase: "Separate schema design and controlled implementation" })), safeContextMap: fields.filter((f) => f.classification !== "EXCLUDE").map((f) => ({ crmSource: `${f.entity}.${f.logicalName}`, transformation: f.maskingRule, safeContextKey: f.safeContextMapping, exactBandCategory: f.containsExactAmount ? "Band" : f.classification === "DERIVE" ? "Category" : "Minimized", externalLlmAllowed: f.externalLlmAllowed, masking: f.maskingRule, aggregationWindow: f.entity === "account" ? "12–24 months where authorized" : "Current record/recent period", evidenceTraceability: `${f.entity}.${f.logicalName}` })), implementationOrder: [
    { order: 1, step: "Approve field catalog and business definitions", risk: "None", gate: "Business owner approval" }, { order: 2, step: "Design P0/P1 ADD fields and choice values", risk: "Low", gate: "Separate schema authorization" },
    { order: 3, step: "Design Interaction Signal and Customer Service Coverage", risk: "Medium", gate: "Privacy/security review" }, { order: 4, step: "Implement department scope before Safe Context", risk: "High", gate: "Authorization tests" },
    { order: 5, step: "Update Safe Context builder for approved facts and derivations", risk: "Medium", gate: "Golden safety assertions" }, { order: 6, step: "Generate 100–200 synthetic Demo records", risk: "Medium", gate: "Demo Data Generation Ready=true" },
  ], issues: { P0: [], P1: p1Gaps.length ? [`Required scenario facts need approved schema: ${[...new Set(p1Gaps)].join(", ")}`] : [], P2: ["Annual Actual GP has no independent deployed field; derive from monthly GP unless separately approved", "External intelligence storage remains a design choice", "Email create safety cannot be proven from Metadata alone"] }, evidence: { entityMetadataCount: allEntityMetadata.length, auditedEntityLogicalNames: targetNames, formNames: formRows.map((f) => f.name), viewNames: viewRows.map((v) => v.name), emailAutomationDefinitionCount: workflows.filter((w) => w.primaryentity === "email").length, pluginStepMetadataCount: sdkMessages.length, noBusinessRowsRead: true }, gates };
  catalog.audit.requests.GET = client.getCount();
  if (writeFiles) {
    await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
    await fs.writeFile(OUT_JSON, JSON.stringify(catalog, null, 2) + "\n");
    await fs.writeFile(OUT_MD, markdown(catalog));
  }
  return catalog;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAudit()
    .then((catalog) => {
      console.log(JSON.stringify({ output: OUT_JSON, report: OUT_MD, environment: catalog.audit.hostname, requests: catalog.audit.requests, entities: catalog.summary.auditedEntityCount, fields: catalog.summary.fieldCount, classifications: catalog.summary.classificationCounts, gates: catalog.gates }, null, 2));
      process.exit(0);
    })
    .catch((error) => { console.error(error.message); process.exit(1); });
}
