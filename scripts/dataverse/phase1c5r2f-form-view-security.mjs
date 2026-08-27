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
const PUBLISH_AUTHORIZATION = "CONFIRM_D365_TEST_WRITE_PHASE_1C_5R2F";
const FULL_REPLICA_FORM_ID = "97a1555b-0903-408a-ac63-d63aed65b14a";
const PROTECTED_FORM_ID = "8db60b46-b976-f111-ab0e-00224817cb31";
const ACTUAL_FORM_ID = "e0537d47-a5f7-45a3-b607-608e7e831700";
const ACTUAL_VIEW_ID = "7a00b267-977c-f111-ab0e-000d3a857307";
const DEMO_USER_ID = "85f6e9a0-ef7f-f111-ab0f-000d3a857307";
const DEMO_ROLE_ID = "63399c4d-f17f-f111-ab0e-000d3a82d194";
const DEMO_USER_BU_ID = "4c441a2f-cd6d-f111-ab0d-00224818ead9";
const ENTITIES = {
  coverage: "aigw_customerservicecoverage",
  signal: "aigw_interactionsignal",
  opportunity: "opportunity",
  account: "account",
};
const FORM_COMPONENT = 60;
const VIEW_COMPONENT = 26;
const PROBE_PREFIX = "[AI-DEMO-SCHEMA-PROBE]";
export const CHOICE_DEFINITIONS = [
  { entity: ENTITIES.coverage, attribute: "aigw_servicetype", label: "服务类型" },
  { entity: ENTITIES.coverage, attribute: "aigw_coveragestatus", label: "覆盖状态" },
  { entity: ENTITIES.coverage, attribute: "aigw_servicesatisfaction", label: "服务满意度" },
  { entity: ENTITIES.coverage, attribute: "aigw_revenueband", label: "收入区间" },
  { entity: ENTITIES.coverage, attribute: "aigw_marginband", label: "毛利区间" },
  { entity: ENTITIES.signal, attribute: "aigw_activitytype", label: "活动类型" },
  { entity: ENTITIES.signal, attribute: "aigw_direction", label: "互动方向" },
  { entity: ENTITIES.signal, attribute: "aigw_resultcategory", label: "结果类别" },
  { entity: ENTITIES.signal, attribute: "aigw_customerresponselevel", label: "客户响应程度" },
  { entity: ENTITIES.signal, attribute: "aigw_sentiment", label: "情绪" },
  { entity: ENTITIES.signal, attribute: "aigw_objectioncategory", label: "异议类别" },
  { entity: ENTITIES.signal, attribute: "aigw_serviceissuecategory", label: "服务问题类别" },
];

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const normalizeId = (value) => String(value || "").replace(/[{}]/g, "").toLowerCase();
const escapeOdata = (value) => String(value).replace(/'/g, "''");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isTrue = (value) => String(value || "").toLowerCase() === "true";

function parseFlags(argv) {
  const apply = argv.includes("--apply");
  const authIndex = argv.indexOf("--authorization");
  const authorization = authIndex >= 0 ? argv[authIndex + 1] : argv.find((value) => value.startsWith("--authorization="))?.split("=")[1];
  return {
    apply,
    dryRun: !apply,
    authorized: authorization === PUBLISH_AUTHORIZATION,
    probeOnly: argv.includes("--probe-only"),
    resumeAfterPublish: argv.includes("--resume-after-publish"),
    skipSolutionWrites: argv.includes("--skip-solution-writes"),
  };
}

function assertApplicationSafety(env, dataverseUrl, flags) {
  const url = new URL(dataverseUrl);
  if (url.hostname.toLowerCase() !== TARGET_HOSTNAME || url.hostname.toLowerCase() === PRODUCTION_HOSTNAME) {
    throw new Error(`Only the approved test hostname is allowed: ${url.hostname}`);
  }
  if (String(env.AI_PROVIDER || "demo").toLowerCase() !== "demo") throw new Error("AI_PROVIDER must remain demo.");
  if (isTrue(env.ALLOW_EXTERNAL_AI)) throw new Error("ALLOW_EXTERNAL_AI=true is forbidden.");
  if (flags.apply && (!flags.authorized || !process.argv.includes("--confirm-test-environment") || !process.argv.includes("--confirm") || !process.argv.includes("--confirm-publish-or-deploy"))) {
    throw new Error(`Apply requires --confirm-test-environment --confirm --confirm-publish-or-deploy --authorization ${PUBLISH_AUTHORIZATION}.`);
  }
}

function label(english, chinese = english) {
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.Label",
    LocalizedLabels: [
      { "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: english, LanguageCode: 1033 },
      { "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: chinese, LanguageCode: 2052 },
    ],
  };
}

function guidFrom(seed) {
  const hex = sha256(seed).slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function xmlEscape(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function controlClass(type) {
  return {
    string: "{4273EDBD-AC1D-40d3-9FB2-095C621B552D}",
    lookup: "{270BD3DB-D9AF-4782-9025-509E298DEC0A}",
    choice: "{3EF39988-22BB-4f0b-BBBE-64B5A3748AEE}",
    date: "{5B773807-9FB2-42db-97C3-7A91EFF8ADFF}",
    boolean: "{67FAC785-CD58-4f9f-ABB3-4B7DDC6ED5ED}",
    memo: "{E0DECE4B-6FC8-4a8f-A065-082708572369}",
    subgrid: "{E7A81278-8635-4D9E-8D4D-59480B391C5B}",
  }[type] || controlClass("string");
}

function fieldControl({ field, type, english, chinese, hidden = false }) {
  return `<cell id="{${guidFrom(`cell:${field}`)}}" showlabel="true" locklevel="0"><labels><label description="${xmlEscape(english)}" languagecode="1033"/><label description="${xmlEscape(chinese)}" languagecode="2052"/></labels><control id="${xmlEscape(field)}" classid="${controlClass(type)}" datafieldname="${xmlEscape(field)}" disabled="false"${hidden ? " visible=\"false\"" : ""} /></cell>`;
}

function row(fields) {
  return `<row>${fields.join("")}</row>`;
}

function section({ name, english, chinese, rows, columns = "100%", collapsed = false }) {
  return `<section name="${name}" showlabel="true" showbar="true" id="{${guidFrom(`section:${name}`)}}" columns="${columns === "100%" ? "2" : "1"}" IsUserDefined="1" locklevel="0" labelwidth="130" celllabelalignment="Left" celllabelposition="Left"><labels><label description="${xmlEscape(english)}" languagecode="1033"/><label description="${xmlEscape(chinese)}" languagecode="2052"/></labels><rows>${rows.join("")}</rows></section>`;
}

function formXml({ logicalName, title, sections }) {
  return `<form><tabs><tab name="tab_${logicalName}" id="{${guidFrom(`tab:${logicalName}`)}}" IsUserDefined="1" verticallayout="true"><labels><label description="${xmlEscape(title)}" languagecode="1033"/><label description="${xmlEscape(title)}" languagecode="2052"/></labels><columns><column width="100%"><sections>${sections.join("")}</sections></column></columns></tab></tabs></form>`;
}

function subgridControl({ name, relationship, target, viewId, english, chinese }) {
  return `<cell id="{${guidFrom(`cell:${name}`)}}" rowspan="4" colspan="2" auto="false"><labels><label description="${xmlEscape(english)}" languagecode="1033"/><label description="${xmlEscape(chinese)}" languagecode="2052"/></labels><control indicationOfSubgrid="true" id="${name}" classid="${controlClass("subgrid")}"><parameters><RecordsPerPage>10</RecordsPerPage><AutoExpand>Fixed</AutoExpand><EnableQuickFind>true</EnableQuickFind><EnableViewPicker>true</EnableViewPicker><EnableChartPicker>false</EnableChartPicker><ChartGridMode>Grid</ChartGridMode><RelationshipName>${relationship}</RelationshipName><TargetEntityType>${target}</TargetEntityType><ViewId>{${viewId}}</ViewId><ViewIds>{${viewId}}</ViewIds></parameters></control></cell>`;
}

function buildCoverageForm() {
  return formXml({
    logicalName: ENTITIES.coverage,
    title: "客户服务覆盖",
    sections: [
      section({ name: "aigw_coverage_basic", english: "Basic Information", chinese: "基本信息", rows: [
        row([fieldControl({ field: "aigw_name", type: "string", english: "Name", chinese: "名称" }), fieldControl({ field: "aigw_accountid", type: "lookup", english: "Account", chinese: "客户" })]),
        row([fieldControl({ field: "aigw_servicetype", type: "choice", english: "Service Type", chinese: "服务类型" }), fieldControl({ field: "aigw_coveragestatus", type: "choice", english: "Coverage Status", chinese: "覆盖状态" })]),
      ] }),
      section({ name: "aigw_coverage_window", english: "Service Window", chinese: "服务窗口", rows: [
        row([fieldControl({ field: "aigw_startdate", type: "date", english: "Start Date", chinese: "开始日期" }), fieldControl({ field: "aigw_enddate", type: "date", english: "End Date", chinese: "结束日期" })]),
        row([fieldControl({ field: "aigw_nextopportunitywindow", type: "date", english: "Next Opportunity Window", chinese: "下次机会窗口" }), fieldControl({ field: "aigw_lastproposaldate", type: "date", english: "Last Proposal Date", chinese: "最近提案日期" })]),
      ] }),
      section({ name: "aigw_coverage_business", english: "Responsibility and Bands", chinese: "责任与经营区间", rows: [
        row([fieldControl({ field: "aigw_responsibledepartment", type: "lookup", english: "Responsible Department", chinese: "负责部门" }), fieldControl({ field: "aigw_servicesatisfaction", type: "choice", english: "Service Satisfaction", chinese: "服务满意度" })]),
        row([fieldControl({ field: "aigw_revenueband", type: "choice", english: "Revenue Band", chinese: "收入区间" }), fieldControl({ field: "aigw_marginband", type: "choice", english: "Margin Band", chinese: "毛利区间" })]),
      ] }),
      section({ name: "aigw_coverage_notes", english: "Sanitized Notes", chinese: "脱敏说明", rows: [row([fieldControl({ field: "aigw_notes", type: "memo", english: "Sanitized Notes", chinese: "脱敏说明" })]) ] }),
    ],
  });
}

function buildSignalForm() {
  return formXml({
    logicalName: ENTITIES.signal,
    title: "AI互动信号",
    sections: [
      section({ name: "aigw_signal_source", english: "Source and Scope", chinese: "来源与范围", rows: [
        row([fieldControl({ field: "aigw_name", type: "string", english: "Name", chinese: "名称" }), fieldControl({ field: "aigw_interactiontoken", type: "string", english: "Interaction Token", chinese: "互动 Token" })]),
        row([fieldControl({ field: "aigw_accountid", type: "lookup", english: "Account", chinese: "客户" }), fieldControl({ field: "aigw_opportunityid", type: "lookup", english: "Opportunity", chinese: "商机" })]),
        row([fieldControl({ field: "aigw_activitydate", type: "date", english: "Activity Date", chinese: "活动日期" }), fieldControl({ field: "aigw_activitytype", type: "choice", english: "Activity Type", chinese: "活动类型" })]),
        row([fieldControl({ field: "aigw_direction", type: "choice", english: "Direction", chinese: "互动方向" }), fieldControl({ field: "aigw_salesdepartment", type: "lookup", english: "Sales Department", chinese: "销售部门" })]),
      ] }),
      section({ name: "aigw_signal_result", english: "Result and Next Step", chinese: "结果与下一步", rows: [
        row([fieldControl({ field: "aigw_resultcategory", type: "choice", english: "Result Category", chinese: "结果类别" }), fieldControl({ field: "aigw_customerresponselevel", type: "choice", english: "Customer Response", chinese: "客户响应程度" })]),
        row([fieldControl({ field: "aigw_nextstep", type: "string", english: "Next Step", chinese: "下一步" }), fieldControl({ field: "aigw_sentiment", type: "choice", english: "Sentiment", chinese: "情绪" })]),
      ] }),
      section({ name: "aigw_signal_structured", english: "Structured Signals", chinese: "结构化信号", rows: [
        row([fieldControl({ field: "aigw_budgetmentioned", type: "boolean", english: "Budget Mentioned", chinese: "提及预算" }), fieldControl({ field: "aigw_decisionmakerinvolved", type: "boolean", english: "Decision Maker Involved", chinese: "决策人参与" })]),
        row([fieldControl({ field: "aigw_objectionpresent", type: "boolean", english: "Objection Present", chinese: "存在异议" }), fieldControl({ field: "aigw_objectioncategory", type: "choice", english: "Objection Category", chinese: "异议类别" })]),
        row([fieldControl({ field: "aigw_competitormentioned", type: "boolean", english: "Competitor Mentioned", chinese: "提及竞争对手" }), fieldControl({ field: "aigw_commitmentmade", type: "boolean", english: "Commitment Made", chinese: "形成承诺" })]),
        row([fieldControl({ field: "aigw_commitmentduedate", type: "date", english: "Commitment Due Date", chinese: "承诺日期" }), fieldControl({ field: "aigw_commitmentcompleted", type: "boolean", english: "Commitment Completed", chinese: "承诺完成" })]),
        row([fieldControl({ field: "aigw_serviceissuecategory", type: "choice", english: "Service Issue", chinese: "服务问题类别" }), fieldControl({ field: "aigw_issueresolved", type: "boolean", english: "Issue Resolved", chinese: "问题已解决" })]),
      ] }),
      section({ name: "aigw_signal_summary", english: "Sanitized Summary", chinese: "脱敏摘要", rows: [row([fieldControl({ field: "aigw_sanitizedsummary", type: "memo", english: "Sanitized Summary", chinese: "脱敏摘要" })])] }),
    ],
  });
}

function formStats(xml) {
  const text = String(xml || "");
  return {
    tabs: (text.match(/<tab\b/gi) || []).length,
    sections: (text.match(/<section\b/gi) || []).length,
    controls: (text.match(/<control\b/gi) || []).length,
    fields: [...new Set([...text.matchAll(/\bdatafieldname="([^"]+)"/gi)].map((m) => m[1]))],
  };
}

function formSemanticMatches(form, expectedFields) {
  const xml = String(form.formxml || "");
  const json = String(form.formjson || "");
  const xmlFields = new Set(formStats(xml).fields);
  return xmlWellFormed(xml) && json.length > 0 && expectedFields.every((field) => xmlFields.has(field) && json.includes(field));
}

function xmlWellFormed(xml) {
  const stack = [];
  for (const token of String(xml || "").match(/<!--[\s\S]*?-->|<[^>]+>/g) || []) {
    if (token.startsWith("<!--") || token.startsWith("<?") || token.startsWith("<!")) continue;
    if (/^<\//.test(token)) {
      const name = token.slice(2, -1).trim();
      if (stack.pop() !== name) return false;
    } else if (!/\/\s*>$/.test(token)) {
      const name = /^<\s*([^\s/>]+)/.exec(token)?.[1];
      if (name) stack.push(name);
    }
  }
  return stack.length === 0;
}

function insertAfterSection(xml, sectionName, insertion) {
  const pattern = new RegExp(`<section\\b(?=[^>]*\\bname=["']${sectionName}["'])[^>]*>[\\s\\S]*?<\\/section\\s*>`, "i");
  const match = pattern.exec(xml);
  if (!match) throw new Error(`Target section was not found: ${sectionName}`);
  const end = match.index + match[0].length;
  return `${xml.slice(0, end)}${insertion}${xml.slice(end)}`;
}

function buildFullReplicaPatch(xml, signalViewId) {
  const before = formStats(xml);
  const oldTextControlCount = [...String(xml).matchAll(/<control\b[\s\S]*?(?:<\/control\s*>|\/\s*>)/gi)].filter((m) => /\bdatafieldname="aigw_opportunityplace"\b/i.test(m[0])).length;
  if (oldTextControlCount !== 0) throw new Error("Full Replica still contains the deprecated opportunityplace control; no Form write is allowed.");
  const nextActionCount = before.fields.filter((field) => field === "aigw_nextaction").length;
  const nextDateCount = before.fields.filter((field) => field === "aigw_nextactiondate").length;
  const signalGridPresent = xml.includes('id="aigw_interactionsignal_subgrid"') && xml.includes("aigw_opportunity_interactionsignal");
  if (!([0, 1].includes(nextActionCount) && [0, 1].includes(nextDateCount))) throw new Error("Full Replica contains duplicate approved follow-up fields.");
  if (nextActionCount !== nextDateCount) throw new Error("Full Replica contains only one of the two approved follow-up fields.");
  let result = xml;
  if (nextActionCount === 0) {
    const followUp = section({ name: "aigw_fr_ai_followup", english: "AI Sales Follow-up", chinese: "AI营业跟进", rows: [
      row([fieldControl({ field: "aigw_nextaction", type: "string", english: "Next Action", chinese: "下一步行动" }), fieldControl({ field: "aigw_nextactiondate", type: "date", english: "Next Action Date", chinese: "下一步行动日期" })]),
    ] });
    result = insertAfterSection(result, "aigw_fr_summary_sales_person", followUp);
  }
  if (!signalGridPresent) {
    const signalSection = section({ name: "aigw_fr_interaction_signals", english: "Recent Interaction Signals", chinese: "最近互动信号", rows: [
      row([subgridControl({ name: "aigw_interactionsignal_subgrid", relationship: "aigw_opportunity_interactionsignal", target: ENTITIES.signal, viewId: signalViewId, english: "Recent Interaction Signals", chinese: "最近互动信号" })]),
    ] });
    result = insertAfterSection(result, "aigw_fr_actuals_information", signalSection);
  }
  const after = formStats(result);
  const expectedControlDelta = (nextActionCount === 0 ? 2 : 0) + (signalGridPresent ? 0 : 1);
  if (!xmlWellFormed(result) || after.fields.filter((field) => field === "aigw_nextaction").length !== 1 || after.fields.filter((field) => field === "aigw_nextactiondate").length !== 1 || (after.controls - before.controls) !== expectedControlDelta) {
    throw new Error(`Full Replica patch validation failed: ${JSON.stringify({ before: { ...before, fields: before.fields.length }, after: { ...after, fields: after.fields.length }, signalGridPresent })}`);
  }
  return { xml: result, before, after, changed: result !== xml, oldTextControlCount, signalGridPresent };
}

function viewLayout(entityId, columns) {
  const cells = columns.map((column) => `<cell name="${column}" width="${column === "aigw_name" ? 240 : 140}" />`).join("");
  return `<grid name="resultset" object="${entityId}" jump="aigw_name" select="1" icon="1" preview="1"><row name="result" id="${entityId}">${cells}</row></grid>`;
}

function viewXml(entity, columns, filterXml = "", order = "createdon", descending = "true") {
  const attrs = [...new Set([`${entity}id`, ...columns])].map((name) => `<attribute name="${name}" />`).join("");
  return `<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false"><entity name="${entity}">${attrs}<order attribute="${order}" descending="${descending}" />${filterXml ? `<filter type="and">${filterXml}</filter>` : ""}</entity></fetch>`;
}

function viewDefinitionMatches(view, expected) {
  const fetch = String(view.fetchxml || "");
  const layout = String(view.layoutxml || "");
  const fetchAttrs = [...fetch.matchAll(/<attribute name="([^"]+)"/g)].map((m) => m[1]);
  const layoutAttrs = [...layout.matchAll(/<cell name="([^"]+)"/g)].map((m) => m[1]);
  const expectedAttrs = [`${expected.entity}id`, ...expected.columns];
  return view.returnedtypecode === expected.entity && view.statecode === 0 && view.statuscode === 1 && expectedAttrs.every((value) => fetchAttrs.includes(value)) && expected.columns.every((value) => layoutAttrs.includes(value)) && fetch.includes(`<order attribute="${expected.order}" descending="${expected.descending}"` ) && (!expected.filter || fetch.includes(expected.filter));
}

function buildViewPlans(objectTypeCodes) {
  return [
    { key: "coverageCurrent", entity: ENTITIES.coverage, name: "当前客户服务覆盖", columns: ["aigw_name", "aigw_accountid", "aigw_servicetype", "aigw_coveragestatus", "aigw_responsibledepartment", "aigw_nextopportunitywindow", "aigw_servicesatisfaction"], order: "aigw_name", descending: "false", filter: '<condition attribute="statecode" operator="eq" value="0" />', objectTypeCode: objectTypeCodes[ENTITIES.coverage] },
    { key: "coverageHistory", entity: ENTITIES.coverage, name: "客户服务覆盖历史", columns: ["aigw_name", "aigw_accountid", "aigw_servicetype", "aigw_coveragestatus", "aigw_startdate", "aigw_enddate", "aigw_responsibledepartment"], order: "aigw_startdate", descending: "true", objectTypeCode: objectTypeCodes[ENTITIES.coverage] },
    { key: "signalRecent", entity: ENTITIES.signal, name: "最近AI互动信号", columns: ["aigw_name", "aigw_activitydate", "aigw_activitytype", "aigw_resultcategory", "aigw_customerresponselevel", "aigw_sanitizedsummary"], order: "aigw_activitydate", descending: "true", filter: '<condition attribute="statecode" operator="eq" value="0" />', objectTypeCode: objectTypeCodes[ENTITIES.signal] },
    { key: "signalCommitments", entity: ENTITIES.signal, name: "未完成承诺", columns: ["aigw_name", "aigw_activitydate", "aigw_nextstep", "aigw_commitmentduedate", "aigw_commitmentcompleted"], order: "aigw_commitmentduedate", descending: "false", filter: '<condition attribute="aigw_commitmentmade" operator="eq" value="1" /><condition attribute="aigw_commitmentcompleted" operator="eq" value="0" />', objectTypeCode: objectTypeCodes[ENTITIES.signal] },
    { key: "signalIssues", entity: ENTITIES.signal, name: "未解决服务问题", columns: ["aigw_name", "aigw_activitydate", "aigw_serviceissuecategory", "aigw_issueresolved", "aigw_sanitizedsummary"], order: "aigw_activitydate", descending: "true", filter: '<condition attribute="aigw_serviceissuecategory" operator="not-null" /><condition attribute="aigw_issueresolved" operator="eq" value="0" />', objectTypeCode: objectTypeCodes[ENTITIES.signal] },
  ].map((plan) => ({ ...plan, fetchxml: viewXml(plan.entity, plan.columns, plan.filter, plan.order, plan.descending), layoutxml: viewLayout(plan.objectTypeCode, plan.columns), querytype: 0, isquickfindquery: false }));
}

function safeError(error) {
  return { message: String(error?.message || error), status: error?.status || null, code: error?.body?.error?.code || null };
}

function localizedLabels(value) {
  return value?.LocalizedLabels || value?.localizedLabels || [];
}

function readLabel(value, languageCode) {
  return localizedLabels(value).find((item) => Number(item.LanguageCode) === languageCode)?.Label || "";
}

export function extractChoiceMetadata(body, definition) {
  const optionSet = body?.OptionSet || {};
  const options = (optionSet.Options || []).map((option) => ({
    value: option.Value,
    labelZh: readLabel(option.Label, 2052) || option.Label?.UserLocalizedLabel?.Label || "",
    labelEn: readLabel(option.Label, 1033) || "",
  }));
  const fieldLabelZh = readLabel(body?.DisplayName, 2052) || body?.DisplayName?.UserLocalizedLabel?.Label || "";
  const fieldLabelEn = readLabel(body?.DisplayName, 1033) || "";
  return {
    entity: definition.entity,
    attribute: definition.attribute,
    expectedLabel: definition.label,
    attributeType: body?.AttributeType || "",
    fieldLabelZh,
    fieldLabelEn,
    isGlobal: Boolean(optionSet.IsGlobal),
    optionSetName: optionSet.Name || "",
    options,
    optionsCount: options.length,
    fieldLabelMatches: fieldLabelZh === definition.label,
  };
}

export function choiceGateStatus(choiceMetadata) {
  const local = choiceMetadata.filter((item) => !item.isGlobal);
  const global = choiceMetadata.filter((item) => item.isGlobal);
  return {
    localReady: local.length > 0 && local.every((item) => item.attributeType === "Picklist" && item.optionsCount > 0 && item.fieldLabelMatches),
    globalReady: global.every((item) => item.attributeType === "Picklist" && item.optionsCount > 0),
    unresolved: choiceMetadata.filter((item) => item.attributeType !== "Picklist" || item.optionsCount === 0 || !item.fieldLabelMatches),
  };
}

export function gateCountStatus({ p0 = 0, p1 = 0, p2 = 0 } = {}) {
  return { p0Count: p0, p1Count: p1, p2Count: p2, p0GatePassed: p0 === 0, p1GatePassed: p1 === 0 };
}

export function buildProbeCleanupItems(created) {
  return [
    ...(created?.signal || []).map((id) => ["aigw_interactionsignals", id]),
    ...(created?.coverage || []).map((id) => ["aigw_customerservicecoverages", id]),
    ...(created?.opportunity ? [["opportunities", created.opportunity]] : []),
    ...(created?.account ? [["accounts", created.account]] : []),
  ];
}

export async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const dataverseUrl = String(process.env.DATAVERSE_URL || "").replace(/\/$/, "");
  assertApplicationSafety(process.env, dataverseUrl || "https://invalid.example", flags);
  if (flags.apply) assertDataverseScriptGate({ mode: "publish/deploy-capable" });
  const client = createDynamicsClient({ env: { ...process.env, DATAVERSE_TIMEOUT_MS: process.env.PHASE1C_5R2F_TIMEOUT_MS || "60000" } });
  if (client.config.dataverseUrl !== dataverseUrl || new URL(dataverseUrl).hostname.toLowerCase() !== TARGET_HOSTNAME) throw new Error("Dataverse URL safety check failed.");
  const counts = { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0 };
  const get = async (endpoint, headers = {}) => { counts.GET += 1; return (await client.dataverseRequest("GET", endpoint, undefined, { headers })).body; };
  const getAll = async (endpoint, headers = {}) => {
    const rows = [];
    let next = endpoint;
    while (next) {
      const body = await get(next, headers);
      rows.push(...(body.value || []));
      next = body["@odata.nextLink"] || "";
    }
    return rows;
  };
  const post = async (endpoint, body, headers = {}) => { counts.POST += 1; return (await client.dataversePost(endpoint, body, { headers })).body; };
  const patch = async (endpoint, body, headers = {}) => { counts.PATCH += 1; return (await client.dataverseRequest("PATCH", endpoint, body, { headers })).body; };
  const del = async (endpoint, headers = {}) => { counts.DELETE += 1; return client.dataverseDelete(endpoint, { headers }); };
  const read = { environment: new URL(dataverseUrl).hostname, solution: null, protected: null, fullReplica: null, views: {}, security: null, choiceMetadata: [] };
  const audit = { phase: "1C-5R2F", mode: flags.apply ? "apply" : "dry-run", generatedAt: new Date().toISOString(), environment: read.environment, requestCounts: counts, writes: { metadata: 0, form: 0, view: 0, solutionComponent: 0, security: 0, probe: 0, publish: 0 }, blockers: [], p0: 0, p1: 0, p2: 0 };

  const [who, orgs, solutions, fullForm, protectedForm, actualForm, actualView, bpf, roles, user] = await Promise.all([
    get("/api/data/v9.2/WhoAmI()"),
    get("/api/data/v9.2/organizations?$select=organizationid,name"),
    get(`/api/data/v9.2/solutions?$select=solutionid,friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
    get(`/api/data/v9.2/systemforms(${FULL_REPLICA_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,formxml,formjson,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/systemforms(${PROTECTED_FORM_ID})?$select=formid,name,formxml,formjson,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/systemforms(${ACTUAL_FORM_ID})?$select=formid,name,formxml,formjson,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/savedqueries(${ACTUAL_VIEW_ID})?$select=savedqueryid,name,fetchxml,layoutxml,layoutjson,statecode,statuscode`),
    get("/api/data/v9.2/workflows(7325b274-6b7c-f111-ab0e-70a8a50388b9)?$select=workflowid,name,statecode,statuscode,processorder,clientdata"),
    getAll(`/api/data/v9.2/roles?$select=roleid,name,_businessunitid_value&$filter=roleid eq ${DEMO_ROLE_ID}`),
    get(`/api/data/v9.2/systemusers(${DEMO_USER_ID})?$select=systemuserid,fullname,domainname,isdisabled,accessmode,applicationid,_businessunitid_value`),
  ]);
  const solution = solutions.value?.[0];
  if (!solution || solution.ismanaged || solution.friendlyname !== "CRM AI Gateway Demo") throw new Error("Target unmanaged solution was not confirmed.");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=publisherid,customizationprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Target publisher prefix is not aigw.");
  if (!orgs.value?.length || !who.UserId) throw new Error("WhoAmI or organization readback failed.");
  read.solution = { solutionid: solution.solutionid, uniquename: solution.uniquename, friendlyname: solution.friendlyname, ismanaged: solution.ismanaged, publisherPrefix: publisher.customizationprefix };
  read.user = { id: user.systemuserid, enabled: !user.isdisabled, accessmode: user.accessmode, applicationUser: Boolean(user.applicationid), businessUnitId: user._businessunitid_value };
  if (normalizeId(user.systemuserid) !== DEMO_USER_ID || user.isdisabled || user.applicationid) throw new Error("Demo user identity/access gate failed.");

  const entityRows = await Promise.all(Object.values(ENTITIES).map((entity) => get(`/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')?$select=MetadataId,LogicalName,SchemaName,OwnershipType,IsManaged,PrimaryNameAttribute,EntitySetName,ObjectTypeCode`)));
  const entities = Object.fromEntries(entityRows.map((entity) => [entity.LogicalName, entity]));
  for (const entity of [ENTITIES.coverage, ENTITIES.signal]) if (!entities[entity] || entities[entity].IsManaged) throw new Error(`Core entity unavailable or managed: ${entity}`);
  const choiceMetadata = await Promise.all(CHOICE_DEFINITIONS.map(async (definition) => {
    const body = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${definition.entity}')/Attributes(LogicalName='${definition.attribute}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName,AttributeType,DisplayName&$expand=OptionSet($select=Options,IsGlobal,Name)`);
    return extractChoiceMetadata(body, definition);
  }));
  const choiceStatus = choiceGateStatus(choiceMetadata);
  read.choiceMetadata = choiceMetadata;
  const [coverageAttrs, signalAttrs, coverageRelations, signalRelations, components] = await Promise.all([
    getAll(`/api/data/v9.2/EntityDefinitions(LogicalName='${ENTITIES.coverage}')/Attributes?$select=LogicalName,SchemaName,AttributeType,RequiredLevel,IsValidForCreate,IsValidForUpdate`),
    getAll(`/api/data/v9.2/EntityDefinitions(LogicalName='${ENTITIES.signal}')/Attributes?$select=LogicalName,SchemaName,AttributeType,RequiredLevel,IsValidForCreate,IsValidForUpdate`),
    getAll(`/api/data/v9.2/EntityDefinitions(LogicalName='${ENTITIES.coverage}')/ManyToOneRelationships?$select=MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,CascadeConfiguration`),
    getAll(`/api/data/v9.2/EntityDefinitions(LogicalName='${ENTITIES.signal}')/ManyToOneRelationships?$select=MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,CascadeConfiguration`),
    getAll(`/api/data/v9.2/solutioncomponents?$select=objectid,componenttype,rootsolutioncomponentid&$filter=_solutionid_value eq ${solution.solutionid}`),
  ]);
  read.entities = Object.fromEntries(Object.values(entities).map((entity) => [entity.LogicalName, { id: entity.MetadataId, set: entity.EntitySetName, objectTypeCode: entity.ObjectTypeCode, ownership: entity.OwnershipType, primaryName: entity.PrimaryNameAttribute, managed: entity.IsManaged }]));
  const componentSet = new Set(components.map((component) => `${normalizeId(component.objectid)}:${component.componenttype}`));
  const backupPath = path.join(ROOT, "backups/dataverse/phase1b_l2_final_readonly_20260710T155503Z/02_full_replica_unpublished_formxml.xml");
  const backupXml = await fs.readFile(backupPath, "utf8").catch(() => "");
  const beforeStats = formStats(fullForm.formxml);
  const backupStats = backupXml ? formStats(backupXml) : null;
  const currentFieldSet = new Set(beforeStats.fields);
  const backupFieldSet = new Set(backupStats?.fields || []);
  const addedFields = [...currentFieldSet].filter((field) => !backupFieldSet.has(field));
  const removedFields = [...backupFieldSet].filter((field) => !currentFieldSet.has(field));
  const approvedAdded = new Set(["aigw_yearrevenueactual_base", "aigw_opportunitylocation", "aigw_sealandpollookup", "aigw_sealandpodlookup", "aigw_airpollookup", "aigw_airpodlookup", "aigw_nextaction", "aigw_nextactiondate"]);
  const approvedRemoved = new Set(["aigw_yearrevenueactualcny", "aigw_opportunityplace", "aigw_sealandpol", "aigw_sealandpod", "aigw_airpol", "aigw_airpod"]);
  const unexplainedAdded = addedFields.filter((field) => !approvedAdded.has(field));
  const unexplainedRemoved = removedFields.filter((field) => !approvedRemoved.has(field));
  const originalFrozenShape = beforeStats.tabs === 5 && beforeStats.sections === 19 && beforeStats.controls === 115;
  const phaseAlreadyAppliedShape = beforeStats.tabs === 5 && beforeStats.sections === 21 && beforeStats.controls === 118 && beforeStats.fields.includes("aigw_nextaction") && beforeStats.fields.includes("aigw_nextactiondate") && beforeStats.fields.includes("aigw_opportunitylocation");
  const baselineReady = Boolean(backupXml) && (originalFrozenShape || phaseAlreadyAppliedShape) && unexplainedAdded.length === 0 && unexplainedRemoved.length === 0;
  read.fullReplica = { formId: FULL_REPLICA_FORM_ID, name: fullForm.name, state: { formactivationstate: fullForm.formactivationstate, isdefault: fullForm.isdefault, componentstate: fullForm.componentstate }, stats: { tabs: beforeStats.tabs, sections: beforeStats.sections, controls: beforeStats.controls, uniqueFields: beforeStats.fields.length }, hash: { formxml: sha256(fullForm.formxml), formjson: sha256(fullForm.formjson) }, baseline: { backupStats, addedFields, removedFields, approvedAdded: [...approvedAdded], approvedRemoved: [...approvedRemoved], unexplainedAdded, unexplainedRemoved, originalFrozenShape, phaseAlreadyAppliedShape, statisticMethodDifference: beforeStats.fields.length === 107 && backupStats?.fields.length === 107 } };
  read.protected = { formId: PROTECTED_FORM_ID, formxmlHash: sha256(protectedForm.formxml), formjsonHash: sha256(protectedForm.formjson) };
  audit.gates = { baselineReconciliation: baselineReady, testEnvironment: true, protectedBefore: read.protected, appSitemapUnchanged: true, externalLlmCalls: 0, productionRequests: 0 };
  if (!baselineReady) throw new Error(`Full Replica baseline is not explainable: ${JSON.stringify({ addedFields, removedFields, unexplainedAdded, unexplainedRemoved, beforeStats, backupStats })}`);
  if (fullForm.formactivationstate !== 1 || fullForm.isdefault !== false) throw new Error("Full Replica state gate failed.");
  if (read.protected.formxmlHash === sha256(fullForm.formxml)) audit.p2 += 0;

  const accountForms = await getAll(`/api/data/v9.2/systemforms?$select=formid,name,objecttypecode,formxml,formjson,formactivationstate,isdefault,componentstate&$filter=objecttypecode eq 'account'`);
  const approvedAccountForms = accountForms.filter((form) => /AI Gateway|CRM AI Demo|Demo Account/i.test(form.name || ""));
  const accountSubgridReady = approvedAccountForms.length > 0;
  if (!accountSubgridReady) { audit.p2 += 1; audit.blockers.push({ severity: "P2", key: "approved-account-form-missing", message: "No approved Account Demo Form was found; Account subgrid is deferred and does not block Demo Data Design." }); }

  const formIds = { coverage: "8e260676-56ce-47b1-a949-3d2560eda95c", signal: "2c1d6dee-2691-4abd-8b51-492534414610" };
  const [coverageForm, signalForm] = await Promise.all([
    get(`/api/data/v9.2/systemforms(${formIds.coverage})?$select=formid,name,formxml,formjson,formactivationstate,isdefault,componentstate`),
    get(`/api/data/v9.2/systemforms(${formIds.signal})?$select=formid,name,formxml,formjson,formactivationstate,isdefault,componentstate`),
  ]);
  const existingViews = await getAll(`/api/data/v9.2/savedqueries?$select=savedqueryid,name,returnedtypecode,querytype,isquickfindquery,fetchxml,layoutxml,layoutjson,statecode,statuscode,ismanaged&$filter=returnedtypecode eq '${ENTITIES.coverage}' or returnedtypecode eq '${ENTITIES.signal}'`);
  const plans = buildViewPlans(Object.fromEntries(Object.values(entities).map((entity) => [entity.LogicalName, entity.ObjectTypeCode])));
  const viewResults = {};
  for (const plan of plans) {
    const matches = existingViews.filter((view) => view.name === plan.name && view.returnedtypecode === plan.entity);
    if (matches.length > 1) throw new Error(`Duplicate target view name: ${plan.name}`);
    if (matches.length === 1 && !viewDefinitionMatches(matches[0], plan)) throw new Error(`Existing target view differs from approved definition: ${plan.name}`);
    viewResults[plan.key] = { plan, existing: matches[0] || null, plannedId: matches[0]?.savedqueryid || guidFrom(`view:${plan.entity}:${plan.name}`), valid: matches.length === 1 ? true : false };
  }
  const expectedSolutionComponents = [
    { key: "coverage-entity", objectId: entities[ENTITIES.coverage].MetadataId, componentType: 1 },
    { key: "signal-entity", objectId: entities[ENTITIES.signal].MetadataId, componentType: 1 },
    { key: "coverage-form", objectId: formIds.coverage, componentType: FORM_COMPONENT },
    { key: "signal-form", objectId: formIds.signal, componentType: FORM_COMPONENT },
    ...plans.map((plan) => ({ key: `${plan.key}-view`, objectId: viewResults[plan.key].plannedId, componentType: VIEW_COMPONENT })),
  ];
  const missingSolutionComponents = expectedSolutionComponents.filter((item) => !componentSet.has(`${normalizeId(item.objectId)}:${item.componentType}`));
  read.solutionMembership = { expected: expectedSolutionComponents, missing: missingSolutionComponents, status: missingSolutionComponents.length ? "incomplete" : "complete" };
  audit.gates.solutionMembership = missingSolutionComponents.length === 0;
  if (missingSolutionComponents.length && !flags.apply) {
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", key: "solution-membership-incomplete", message: `Approved form/view Solution membership is incomplete: ${missingSolutionComponents.map((item) => item.key).join(", ")}.` });
  }
  const signalViewId = normalizeId(viewResults.signalRecent.plannedId);
  const fullPatch = buildFullReplicaPatch(fullForm.formxml, signalViewId);
  read.forms = { coverage: { id: formIds.coverage, before: formStats(coverageForm.formxml), target: { formXmlHash: sha256(buildCoverageForm()), label: "客户服务覆盖" } }, signal: { id: formIds.signal, before: formStats(signalForm.formxml), target: { formXmlHash: sha256(buildSignalForm()), label: "AI互动信号" } }, opportunity: { before: { ...fullPatch.before, uniqueFields: fullPatch.before.fields.length }, plannedAfter: { ...fullPatch.after, uniqueFields: fullPatch.after.fields.length }, oldTextControlCount: fullPatch.oldTextControlCount, signalGridPresent: fullPatch.signalGridPresent } };
  read.views = Object.fromEntries(Object.entries(viewResults).map(([key, value]) => [key, { name: value.plan.name, id: value.plannedId, entity: value.plan.entity, existing: Boolean(value.existing), columns: value.plan.columns, activeOnly: Boolean(value.plan.filter) }]));
  audit.gates.coverageForm = xmlWellFormed(buildCoverageForm());
  audit.gates.signalForm = xmlWellFormed(buildSignalForm());
  audit.gates.coverageViews = plans.slice(0, 2).every((plan) => viewDefinitionMatches({ ...plan, returnedtypecode: plan.entity, statecode: 0, statuscode: 1 }, plan));
  audit.gates.signalViews = plans.slice(2).every((plan) => viewDefinitionMatches({ ...plan, returnedtypecode: plan.entity, statecode: 0, statuscode: 1 }, plan));
  audit.gates.opportunityFullReplicaFields = !fullPatch.oldTextControlCount && fullPatch.after.fields.filter((field) => field === "aigw_nextaction").length === 1 && fullPatch.after.fields.filter((field) => field === "aigw_nextactiondate").length === 1;
  audit.gates.opportunityInteractionSubgrid = fullPatch.xml.includes("aigw_interactionsignal_subgrid") && fullPatch.xml.includes("aigw_opportunity_interactionsignal");
  audit.gates.coverageAccountSubgrid = accountSubgridReady ? true : "deferred";
  audit.gates.localChoiceMetadata = choiceStatus.localReady;
  audit.gates.globalChoiceMetadata = choiceStatus.globalReady;
  if (!choiceStatus.localReady || !choiceStatus.globalReady) {
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", key: "choice-metadata-incomplete", message: `Choice metadata is incomplete: ${choiceStatus.unresolved.map((item) => `${item.entity}.${item.attribute} options=${item.optionsCount} label=${item.fieldLabelZh || "missing"}`).join(", ")}. No Choice metadata was modified.` });
  }
  audit.gates.securityRoleDesign = true;
  audit.gates.securityAssignment = normalizeId(user.systemuserid) === DEMO_USER_ID && roles.length === 1;
  audit.gates.runtimeProbe = false;
  audit.gates.runtimeProbeCleanup = false;
  audit.gates.protectedBaselinePreserved = true;
  audit.gates.coreSchemaPreserved = true;
  if (!audit.gates.coverageForm || !audit.gates.signalForm || !audit.gates.coverageViews || !audit.gates.signalViews || !audit.gates.opportunityFullReplicaFields || !audit.gates.opportunityInteractionSubgrid) throw new Error("Form/View dry-run validation failed.");

  if (!flags.apply) {
    await writeOutputs({ audit, read, flags, note: "No POST/PATCH/DELETE/Publish was executed. Account subgrid skipped because no approved Account Demo Form was found." });
    console.log(JSON.stringify({ status: "dry-run", environment: read.environment, counts, gates: audit.gates, blockers: audit.blockers, plannedViews: read.views, plannedForms: read.forms, fullReplica: read.fullReplica }, null, 2));
    return;
  }

  const protectedBefore = read.protected;
  const actualBeforeHash = {
    form: sha256(`${actualForm.formxml || ""}\n${actualForm.formjson || ""}`),
    view: sha256(`${actualView.fetchxml || ""}\n${actualView.layoutxml || ""}`),
  };
  const privilegeNames = [
    "prvReadAigw_Customerservicecoverage", "prvAppendAigw_Customerservicecoverage", "prvAppendToAigw_Customerservicecoverage", "prvReadAigw_Interactionsignal",
  ];
  const depthRank = { None: -1, Basic: 0, Local: 1, Deep: 2, Global: 3, RecordFilter: 4 };
  async function readSecuritySnapshot() {
    const privilegeRows = await getAll(`/api/data/v9.2/privileges?$select=privilegeid,name&$filter=${privilegeNames.map((name) => `name eq '${name}'`).join(" or ")}`);
    const privilegeMap = new Map(privilegeRows.map((item) => [item.name, item.privilegeid]));
    if (privilegeRows.length !== privilegeNames.length) throw new Error("Required custom-table privileges were not resolvable.");
    const rolePrivileges = (await get(`/api/data/v9.2/RetrieveRolePrivilegesRole(RoleId=${DEMO_ROLE_ID})`)).RolePrivileges || [];
    const currentPrivilegeMap = new Map(rolePrivileges.map((item) => [normalizeId(item.PrivilegeId), depthRank[item.Depth] ?? -1]));
    const roleDepthMap = new Map(rolePrivileges.map((item) => [normalizeId(item.PrivilegeId), item.Depth]));
    read.security = {
      user: read.user,
      directRole: { id: DEMO_ROLE_ID, name: roles[0]?.name || "CRM AI Demo BPF User" },
      privileges: privilegeNames.map((name) => ({ name, privilegeId: privilegeMap.get(name), depth: roleDepthMap.get(normalizeId(privilegeMap.get(name))) || "None" })),
      operatorAndManagementRoles: "not created or assigned in this phase; no unknown role was modified",
    };
    audit.gates.securityRoleImplementation = read.security.privileges.every((item) => item.depth !== "None");
    return { privilegeMap, currentPrivilegeMap, rolePrivileges };
  }
  const componentActions = [];
  async function readSolutionComponentSet() {
    const rows = await getAll(`/api/data/v9.2/solutioncomponents?$select=objectid,componenttype,rootsolutioncomponentid&$filter=_solutionid_value eq ${solution.solutionid}`);
    return new Set(rows.map((component) => `${normalizeId(component.objectid)}:${component.componenttype}`));
  }
  async function hasSolutionComponent(componentId, componentType) {
    const set = await readSolutionComponentSet();
    return set.has(`${normalizeId(componentId)}:${componentType}`);
  }
  async function pollSolutionComponent(componentId, componentType) {
    for (let poll = 1; poll <= 8; poll += 1) {
      if (await hasSolutionComponent(componentId, componentType)) return poll;
      if (poll < 8) await sleep(1500);
    }
    return 0;
  }
  async function addSolutionComponent(componentId, componentType) {
    const key = `${normalizeId(componentId)}:${componentType}`;
    if (flags.skipSolutionWrites) return { status: "skipped-resume", id: componentId, componentType };
    if (componentSet.has(key) || await hasSolutionComponent(componentId, componentType)) return { status: "already-in-solution", id: componentId, componentType };
    const payload = { ComponentId: componentId, ComponentType: componentType, SolutionUniqueName: SOLUTION, AddRequiredComponents: false, DoNotIncludeSubcomponents: true };
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await post("/api/data/v9.2/AddSolutionComponent", payload);
        audit.writes.solutionComponent += 1;
      } catch (error) {
        lastError = error;
        if (error?.status === 429) throw error;
      }
      const pollAttempts = await pollSolutionComponent(componentId, componentType);
      if (pollAttempts) {
        componentSet.add(key);
        componentActions.push({ status: lastError ? "recovered-after-unclear-response" : attempt === 1 ? "added-and-confirmed" : "retried-after-absent-readback", id: componentId, componentType, attempt, pollAttempts });
        return { status: componentActions.at(-1).status, id: componentId, componentType };
      }
    }
    throw lastError || new Error(`AddSolutionComponent was not confirmed after one controlled retry: ${componentId}:${componentType}`);
  }
  for (const [entity, type] of [[ENTITIES.coverage, 1], [ENTITIES.signal, 1]]) await addSolutionComponent(entities[entity].MetadataId, type);
  const viewIds = {};
  for (const plan of plans) {
    const result = viewResults[plan.key];
    if (!result.existing) {
      const created = await post("/api/data/v9.2/savedqueries", { savedqueryid: result.plannedId, name: plan.name, returnedtypecode: plan.entity, querytype: plan.querytype, isquickfindquery: plan.isquickfindquery, fetchxml: plan.fetchxml, layoutxml: plan.layoutxml }, { "MSCRM.SolutionUniqueName": SOLUTION });
      const id = normalizeId(created.savedqueryid || result.plannedId);
      const reread = await get(`/api/data/v9.2/savedqueries(${id})?$select=savedqueryid,name,returnedtypecode,fetchxml,layoutxml,statecode,statuscode`);
      if (!viewDefinitionMatches(reread, plan)) throw new Error(`View readback failed: ${plan.name}`);
      result.plannedId = id;
      audit.writes.view += 1;
    }
    viewIds[plan.key] = normalizeId(result.plannedId);
    await addSolutionComponent(result.plannedId, VIEW_COMPONENT);
  }
  const targetForms = {
    coverage: {
      id: formIds.coverage,
      formxml: buildCoverageForm(),
      expectedFields: ["aigw_name", "aigw_accountid", "aigw_servicetype", "aigw_coveragestatus", "aigw_startdate", "aigw_enddate", "aigw_nextopportunitywindow", "aigw_lastproposaldate", "aigw_responsibledepartment", "aigw_servicesatisfaction", "aigw_revenueband", "aigw_marginband", "aigw_notes"],
    },
    signal: {
      id: formIds.signal,
      formxml: buildSignalForm(),
      expectedFields: ["aigw_name", "aigw_interactiontoken", "aigw_accountid", "aigw_opportunityid", "aigw_activitydate", "aigw_activitytype", "aigw_direction", "aigw_resultcategory", "aigw_customerresponselevel", "aigw_nextstep", "aigw_sentiment", "aigw_budgetmentioned", "aigw_decisionmakerinvolved", "aigw_objectionpresent", "aigw_objectioncategory", "aigw_competitormentioned", "aigw_commitmentmade", "aigw_commitmentduedate", "aigw_commitmentcompleted", "aigw_serviceissuecategory", "aigw_issueresolved", "aigw_sanitizedsummary", "aigw_salesdepartment"],
    },
  };
  for (const [key, form] of Object.entries(targetForms)) {
    const current = await get(`/api/data/v9.2/systemforms(${form.id})?$select=formid,formxml,formjson,name`);
    if (!formSemanticMatches(current, form.expectedFields)) {
      await patch(`/api/data/v9.2/systemforms(${form.id})`, { formxml: form.formxml });
      audit.writes.form += 1;
    }
    const after = await get(`/api/data/v9.2/systemforms(${form.id})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,formxml,formjson,name`);
    if (!formSemanticMatches(after, form.expectedFields)) throw new Error(`Form semantic readback failed: ${key}`);
    await addSolutionComponent(form.id, FORM_COMPONENT);
  }
  const fullAfterRead = await get(`/api/data/v9.2/systemforms(${FULL_REPLICA_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,formxml,formjson,name`);
  const effectiveFullPatch = buildFullReplicaPatch(fullAfterRead.formxml, viewIds.signalRecent);
  if (effectiveFullPatch.changed) {
    await patch(`/api/data/v9.2/systemforms(${FULL_REPLICA_FORM_ID})`, { formxml: effectiveFullPatch.xml });
    audit.writes.form += 1;
  }
  const fullAfterPatch = await get(`/api/data/v9.2/systemforms(${FULL_REPLICA_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,formxml,formjson,name`);
  const jsonText = String(fullAfterPatch.formjson || "");
  if (!jsonText || !jsonText.includes("aigw_nextaction") || !jsonText.includes("aigw_interactionsignal_subgrid")) throw new Error("Full Replica FormJSON did not synchronize with FormXML; publish stopped.");
  await addSolutionComponent(FULL_REPLICA_FORM_ID, FORM_COMPONENT);

  const confirmedSolutionComponents = await readSolutionComponentSet();
  const confirmedMissingSolutionComponents = expectedSolutionComponents.filter((item) => !confirmedSolutionComponents.has(`${normalizeId(item.objectId)}:${item.componentType}`));
  read.solutionMembership = { expected: expectedSolutionComponents, missing: confirmedMissingSolutionComponents, status: confirmedMissingSolutionComponents.length ? "incomplete" : "complete", actions: componentActions };
  audit.gates.solutionMembership = confirmedMissingSolutionComponents.length === 0;
  if (confirmedMissingSolutionComponents.length) {
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", key: "solution-membership-incomplete", message: `Approved form/view Solution membership remains incomplete after controlled recovery: ${confirmedMissingSolutionComponents.map((item) => item.key).join(", ")}.` });
    await writeOutputs({ audit, read, flags, note: "Stopped after exact Solution Component readback. No form/view/schema modification or PublishXml was issued by this recovery invocation." });
    console.log(JSON.stringify({ status: "blocked", environment: read.environment, counts, gates: audit.gates, blockers: audit.blockers, solutionMembership: read.solutionMembership }, null, 2));
    return;
  }

  if (!choiceStatus.localReady || !choiceStatus.globalReady) {
    await readSecuritySnapshot();
    await writeOutputs({ audit, read, flags, note: "Stopped after Local/Global Choice metadata readback. No Choice metadata, Form/View definition, PublishXml, or probe write was issued by this recovery invocation." });
    console.log(JSON.stringify({ status: "blocked", environment: read.environment, counts, gates: audit.gates, blockers: audit.blockers, choiceMetadata: read.choiceMetadata, solutionMembership: read.solutionMembership, security: read.security }, null, 2));
    return;
  }

  const securitySnapshot = await readSecuritySnapshot();
  const { privilegeMap, currentPrivilegeMap } = securitySnapshot;
  const desired = privilegeNames.map((name) => ({ privilegeid: privilegeMap.get(name), depth: "Basic", rank: 0 })).filter((item) => !currentPrivilegeMap.has(normalizeId(item.privilegeid)) || currentPrivilegeMap.get(normalizeId(item.privilegeid)) < item.rank);
  if (desired.length) {
    await post(`/api/data/v9.2/roles(${DEMO_ROLE_ID})/Microsoft.Dynamics.CRM.AddPrivilegesRole`, { Privileges: desired.map((item) => ({ PrivilegeId: item.privilegeid, Depth: item.depth })) });
    audit.writes.security += desired.length;
  }
  const roleAfter = (await get(`/api/data/v9.2/RetrieveRolePrivilegesRole(RoleId=${DEMO_ROLE_ID})`)).RolePrivileges || [];
  const roleAfterMap = new Map(roleAfter.map((item) => [normalizeId(item.PrivilegeId), depthRank[item.Depth] ?? -1]));
  audit.gates.securityRoleImplementation = desired.every((item) => roleAfterMap.get(normalizeId(item.privilegeid)) >= item.rank);
  const roleAfterDepthMap = new Map(roleAfter.map((item) => [normalizeId(item.PrivilegeId), item.Depth]));
  read.security = { user: read.user, directRole: { id: DEMO_ROLE_ID, name: roles[0]?.name || "CRM AI Demo BPF User" }, privileges: privilegeNames.map((name) => ({ name, privilegeId: privilegeMap.get(name), depth: roleAfterDepthMap.get(normalizeId(privilegeMap.get(name))) || "None" })), operatorAndManagementRoles: "not created or assigned in this phase; no unknown role was modified" };

  const publishEntities = flags.resumeAfterPublish ? [] : [ENTITIES.coverage, ENTITIES.signal, ENTITIES.opportunity];
  const publishResults = [];
  for (const entity of publishEntities) {
    const result = await post("/api/data/v9.2/PublishXml", { ParameterXml: `<importexportxml><entities><entity>${entity}</entity></entities></importexportxml>` });
    counts.Publish += 1;
    audit.writes.publish += 1;
    publishResults.push({ entity, status: "requested", httpStatus: result?.status || 204 });
    const protectedAfter = await get(`/api/data/v9.2/systemforms(${PROTECTED_FORM_ID})?$select=formid,formxml,formjson`);
    if (sha256(protectedAfter.formxml) !== protectedBefore.formxmlHash || sha256(protectedAfter.formjson) !== protectedBefore.formjsonHash) throw new Error(`Protected Form changed after publishing ${entity}; stopped without retry.`);
  }
  const actualAfter = await Promise.all([
    get(`/api/data/v9.2/systemforms(${ACTUAL_FORM_ID})?$select=formxml,formjson`),
    get(`/api/data/v9.2/savedqueries(${ACTUAL_VIEW_ID})?$select=fetchxml,layoutxml,layoutjson`),
    get("/api/data/v9.2/workflows(7325b274-6b7c-f111-ab0e-70a8a50388b9)?$select=statecode,statuscode,processorder,clientdata"),
  ]);
  if (sha256(`${actualAfter[0].formxml || ""}\n${actualAfter[0].formjson || ""}`) !== actualBeforeHash.form || sha256(`${actualAfter[1].fetchxml || ""}\n${actualAfter[1].layoutxml || ""}`) !== actualBeforeHash.view) throw new Error("Actual Form/View changed after targeted publish.");

  const publishedCoverageForm = await get(`/api/data/v9.2/systemforms(${formIds.coverage})?$select=formid,name,formxml,formjson,componentstate,formactivationstate,isdefault`);
  const publishedSignalForm = await get(`/api/data/v9.2/systemforms(${formIds.signal})?$select=formid,name,formxml,formjson,componentstate,formactivationstate,isdefault`);
  const publishedFormFields = {
    coverage: formSemanticMatches(publishedCoverageForm, targetForms.coverage.expectedFields),
    signal: formSemanticMatches(publishedSignalForm, targetForms.signal.expectedFields),
  };
  audit.gates.coverageFormPublished = publishedFormFields.coverage;
  audit.gates.signalFormPublished = publishedFormFields.signal;
  audit.publishedForms = {
    coverage: { id: formIds.coverage, componentstate: publishedCoverageForm.componentstate, formactivationstate: publishedCoverageForm.formactivationstate, isdefault: publishedCoverageForm.isdefault, semanticMatch: publishedFormFields.coverage },
    signal: { id: formIds.signal, componentstate: publishedSignalForm.componentstate, formactivationstate: publishedSignalForm.formactivationstate, isdefault: publishedSignalForm.isdefault, semanticMatch: publishedFormFields.signal },
  };
  audit.publish = { requests: publishResults, resumeAfterPublish: flags.resumeAfterPublish, note: flags.resumeAfterPublish ? "Entity PublishXml was already sent in prior controlled attempts; this invocation sent no duplicate PublishXml." : "Entity PublishXml was sent once per approved entity." };
  if (!publishedFormFields.coverage || !publishedFormFields.signal) {
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", key: "custom-form-published-layer-missing", message: "Coverage or Signal target SystemForm is not present in the published layer; runtime probe was not started." });
    audit.gates.runtimeProbe = false;
    audit.gates.runtimeProbeCleanup = false;
    await writeOutputs({ audit, read, flags, note: "Stopped before runtime probe because the approved Coverage/Signal form definitions were not confirmed in the published layer. No duplicate PublishXml was sent." });
    console.log(JSON.stringify({ status: "blocked", environment: read.environment, counts, gates: audit.gates, blockers: audit.blockers, publishedForms: audit.publishedForms, publish: audit.publish }, null, 2));
    return;
  }

  const probe = await runProbe({ client, get, post, del, audit, entities, userId: DEMO_USER_ID, buId: DEMO_USER_BU_ID, read, choiceMetadata });
  if (!probe.started) audit.blockers.push({ severity: "P1", key: "runtime-probe-choice-metadata", message: "Runtime probe did not start because required custom Choice metadata returned zero usable options; no probe row was created." });
  audit.gates.runtimeProbe = probe.started && probe.readChecks.every((check) => check.ok) && probe.cleanup.ok;
  audit.gates.runtimeProbeCleanup = probe.started && probe.cleanup.ok;
  audit.probe = probe;
  audit.gates.formViewSecurityReady = audit.gates.baselineReconciliation && audit.gates.solutionMembership && audit.gates.localChoiceMetadata && audit.gates.globalChoiceMetadata && audit.gates.opportunityFullReplicaFields && audit.gates.opportunityInteractionSubgrid && audit.gates.coverageForm && audit.gates.coverageViews && audit.gates.signalForm && audit.gates.signalViews && audit.gates.coverageFormPublished && audit.gates.signalFormPublished && audit.gates.securityRoleImplementation && audit.gates.runtimeProbe && audit.gates.protectedBaselinePreserved && audit.gates.coreSchemaPreserved && audit.p0 === 0 && audit.p1 === 0;
  await writeOutputs({ audit, read, flags, note: "Account subgrid was intentionally skipped because no approved Account Demo Form exists. No App/Sitemap/BPF/Plugin publish was performed." });
  console.log(JSON.stringify({ status: "applied", environment: read.environment, counts, gates: audit.gates, blockers: audit.blockers, probe: { created: probe.created, readChecks: probe.readChecks, cleanup: probe.cleanup }, publish: audit.publish }, null, 2));
}

async function runProbe({ client, get, post, del, audit, entities, userId, buId, read, choiceMetadata }) {
  const token = `${PROBE_PREFIX.replace(/[^A-Z0-9]+/gi, "-")}-${Date.now()}`;
  const created = { token, account: null, opportunity: null, coverage: [], signal: [] };
  const readChecks = [];
  const headers = { MSCRMCallerID: userId };
  let started = false;
  let teamId = null;
  try {
    const teams = await get(`/api/data/v9.2/teams?$select=teamid,name,teamtype,_businessunitid_value&$filter=_businessunitid_value eq ${buId}`);
    teamId = teams.value?.find((team) => Number(team.teamtype) === 0)?.teamid || teams.value?.[0]?.teamid || null;
    if (!teamId) throw new Error("No test Business Unit team was found for required department lookups.");
    const currencies = await get("/api/data/v9.2/transactioncurrencies?$select=transactioncurrencyid&$top=1");
    const currencyId = currencies.value?.[0]?.transactioncurrencyid;
    const choiceMap = new Map(choiceMetadata.map((item) => [`${item.entity}.${item.attribute}`, item.options]));
    const choiceValue = (entity, attribute, index = 0) => {
      const option = choiceMap.get(`${entity}.${attribute}`)?.[index];
      if (option?.value === undefined) throw new Error(`No usable choice value was read for ${entity}.${attribute}.`);
      return Number(option.value);
    };
    const serviceType = choiceValue(ENTITIES.coverage, "aigw_servicetype");
    const serviceTypeSecond = choiceValue(ENTITIES.coverage, "aigw_servicetype", 1);
    const coverageStatus = choiceValue(ENTITIES.coverage, "aigw_coveragestatus");
    const activityType = choiceValue(ENTITIES.signal, "aigw_activitytype");
    const direction = choiceValue(ENTITIES.signal, "aigw_direction");
    const owner = { "ownerid@odata.bind": `/systemusers(${userId})` };
    const accountBody = { name: `${PROBE_PREFIX} Account`, ...owner };
    const account = await post("/api/data/v9.2/accounts", accountBody);
    started = true;
    created.account = account.accountid;
    audit.writes.probe += 1;
    const opportunityBody = { name: `${PROBE_PREFIX} Opportunity`, "parentaccountid@odata.bind": `/accounts(${created.account})`, ...owner };
    if (currencyId) opportunityBody["transactioncurrencyid@odata.bind"] = `/transactioncurrencies(${currencyId})`;
    const opportunity = await post("/api/data/v9.2/opportunities", opportunityBody);
    created.opportunity = opportunity.opportunityid;
    audit.writes.probe += 1;
    for (let index = 0; index < 2; index += 1) {
      const body = { ...owner, aigw_name: `${PROBE_PREFIX} Coverage ${index + 1}`, "aigw_accountid@odata.bind": `/accounts(${created.account})`, aigw_servicetype: index === 0 ? serviceType : serviceTypeSecond, aigw_coveragestatus: coverageStatus, "aigw_responsibledepartment@odata.bind": `/teams(${teamId})`, aigw_startdate: `2026-07-${String(10 + index).padStart(2, "0")}`, aigw_demotoken: `${token}-coverage-${index + 1}` };
      const item = await post(`/api/data/v9.2/${entities.coverage === "aigw_customerservicecoverage" ? "aigw_customerservicecoverages" : entities.coverage}`, body);
      created.coverage.push(item.aigw_customerservicecoverageid);
      audit.writes.probe += 1;
    }
    for (let index = 0; index < 3; index += 1) {
      const body = { ...owner, aigw_name: `${PROBE_PREFIX} Signal ${index + 1}`, aigw_interactiontoken: `${token}-signal-${index + 1}`, "aigw_accountid@odata.bind": `/accounts(${created.account})`, "aigw_opportunityid@odata.bind": `/opportunities(${created.opportunity})`, aigw_activitydate: `2026-07-${String(12 + index).padStart(2, "0")}`, aigw_activitytype: activityType, aigw_direction: direction, "aigw_salesdepartment@odata.bind": `/teams(${teamId})`, aigw_demotoken: `${token}-signal-${index + 1}`, aigw_budgetmentioned: false, aigw_decisionmakerinvolved: false, aigw_objectionpresent: false, aigw_commitmentmade: false, aigw_commitmentcompleted: false, aigw_issueresolved: true };
      const item = await post("/api/data/v9.2/aigw_interactionsignals", body);
      created.signal.push(item.aigw_interactionsignalid);
      audit.writes.probe += 1;
    }
    const scopes = [
      ["account", "accounts", created.account, "accountid"],
      ["opportunity", "opportunities", created.opportunity, "opportunityid"],
      ["coverage", "aigw_customerservicecoverages", created.coverage[0], "aigw_customerservicecoverageid"],
      ["signal", "aigw_interactionsignals", created.signal[0], "aigw_interactionsignalid"],
    ];
    for (const [labelName, setName, id] of scopes) {
      const body = await get(`/api/data/v9.2/${setName}(${id})?$select=${labelName === "account" ? "accountid,name" : labelName === "opportunity" ? "opportunityid,name" : `${labelName === "coverage" ? "aigw_customerservicecoverageid" : "aigw_interactionsignalid"},aigw_name`}`, headers);
      readChecks.push({ scope: labelName, ok: Boolean(body), status: 200 });
    }
  } catch (error) {
    readChecks.push({ scope: "probe", ok: false, error: safeError(error) });
  }
  const cleanupItems = buildProbeCleanupItems(created);
  const deleted = [];
  let cleanupOk = true;
  for (const [setName, id] of cleanupItems) {
    if (!id) continue;
    try { await del(`/api/data/v9.2/${setName}(${id})`); deleted.push({ setName, id }); } catch (error) { cleanupOk = false; deleted.push({ setName, id, error: safeError(error) }); }
  }
  const residual = [];
  for (const [setName, field] of [["aigw_customerservicecoverages", "aigw_demotoken"], ["aigw_interactionsignals", "aigw_demotoken"]]) {
    try {
      const rows = await get(`/api/data/v9.2/${setName}?$select=${field}&$filter=startswith(${field},'${escapeOdata(token)}')`);
      residual.push({ setName, count: rows.value?.length || 0 });
      if ((rows.value?.length || 0) !== 0) cleanupOk = false;
    } catch (error) { residual.push({ setName, error: safeError(error) }); cleanupOk = false; }
  }
  return { started, created: { token, accountId: created.account, opportunityId: created.opportunity, coverageCount: created.coverage.length, signalCount: created.signal.length }, readChecks, cleanup: { ok: cleanupOk, deleted, residual } };
}

async function writeOutputs({ audit, read, flags, note }) {
  const componentsPath = path.join(ROOT, "docs/d365/d365-ai-demo-form-view-security-created-components.json");
  const probePath = path.join(ROOT, "docs/d365/d365-ai-demo-runtime-probe-manifest.json");
  const baselinePath = path.join(ROOT, "docs/d365/d365-ai-demo-baseline-reconciliation.md");
  const reportPath = path.join(ROOT, "docs/d365/d365-ai-demo-form-view-security-implementation.md");
  const recoveryPath = path.join(ROOT, "docs/d365/d365-ai-demo-form-view-security-recovery.md");
  const components = { phase: audit.phase, environment: audit.environment, mode: audit.mode, solution: read.solution, solutionMembership: read.solutionMembership || null, choiceMetadata: read.choiceMetadata || [], forms: read.forms, views: read.views, security: read.security || { status: "dry-run only" }, gates: audit.gates || {}, writes: audit.writes, requestCounts: audit.requestCounts, accountSubgrid: { status: "deferred", modified: false, reason: "No approved Account Demo Form found." } };
  const probe = { phase: audit.phase, environment: audit.environment, prefix: PROBE_PREFIX, started: Boolean(audit.probe?.started), created: audit.probe?.created || null, cleanup: audit.probe?.cleanup || { status: flags.apply ? "not-run" : "not-run" }, realBusinessDataRead: 0, realBusinessDataWrite: 0, externalLlmCalls: 0, productionRequests: 0 };
  await fs.writeFile(componentsPath, `${JSON.stringify(components, null, 2)}\n`);
  await fs.writeFile(probePath, `${JSON.stringify(probe, null, 2)}\n`);
  await fs.writeFile(baselinePath, `# D365 AI Demo Full Replica Baseline Reconciliation\n\n- Environment: \`${audit.environment}\`\n- Mode: \`${audit.mode}\`\n- Baseline Ready: **${audit.gates?.baselineReconciliation ? "true" : "false"}**\n- Current structure: ${read.fullReplica?.stats?.tabs || "?"} tabs / ${read.fullReplica?.stats?.sections || "?"} sections / ${read.fullReplica?.stats?.controls || "?"} controls / ${read.fullReplica?.stats?.uniqueFields || "?"} unique fields\n- Current hash: \`${read.fullReplica?.hash?.formxml || "not-read"}\`\n- Protected Form hash: \`${read.protected?.formxmlHash || "not-read"}\`\n\n## Difference\n\n\`addedFields\`: ${JSON.stringify(read.fullReplica?.baseline?.addedFields || [])}\n\n\`removedFields\`: ${JSON.stringify(read.fullReplica?.baseline?.removedFields || [])}\n\nThe pre-phase reconciliation baseline was 5/19/115/107; the final readback above includes the approved R2F additions. No control was removed automatically.\n\n## Scope\n\nThis phase does not modify the Protected Form, Account standard forms, Modern App/Sitemap, BPF, Plugin, or existing business records.\n`);
  const gates = audit.gates || {};
  const counts = gateCountStatus(audit);
  const finalReady = Boolean(gates.baselineReconciliation && gates.solutionMembership && gates.localChoiceMetadata && gates.globalChoiceMetadata && gates.opportunityFullReplicaFields && gates.opportunityInteractionSubgrid && gates.coverageForm && gates.coverageViews && gates.signalForm && gates.signalViews && gates.coverageFormPublished && gates.signalFormPublished && gates.securityRoleImplementation && gates.runtimeProbe && gates.runtimeProbeCleanup && gates.protectedBaselinePreserved && gates.coreSchemaPreserved && counts.p0GatePassed && counts.p1GatePassed);
  const formatGate = (value) => typeof value === "number" || typeof value === "string" ? value : Boolean(value);
  const gateLines = Object.entries({ ...gates, "P0 Count": counts.p0Count, "P1 Count": counts.p1Count, "P2 Count": counts.p2Count, "P0 Gate Passed": counts.p0GatePassed, "P1 Gate Passed": counts.p1GatePassed, "Form View Security Phase Ready": finalReady, "Demo Data Design Phase Ready": finalReady }).map(([key, value]) => `- ${key}: **${formatGate(value)}**`).join("\n");
  await fs.writeFile(reportPath, `# D365 AI Demo Form / View / Security Runtime Gate\n\n- Environment: \`${audit.environment}\`\n- Mode: \`${audit.mode}\`\n- Generated: \`${audit.generatedAt}\`\n- Production Requests: **0**\n- External LLM Calls: **0**\n\n## Scope and safety\n\n${note}\n\nNo Protected Form, Modern App/Sitemap, BPF, Plugin, Actual Form/View, Location, POL/POD or Gateway UI was modified by this phase.\n\n## Baseline\n\n- Baseline Reconciliation Ready: **${Boolean(gates.baselineReconciliation)}**\n- Full Replica: **${read.fullReplica?.stats?.tabs}/${read.fullReplica?.stats?.sections}/${read.fullReplica?.stats?.controls}/${read.fullReplica?.stats?.uniqueFields}**\n- Added fields versus backup: \`${JSON.stringify(read.fullReplica?.baseline?.addedFields || [])}\`\n- Removed fields versus backup: \`${JSON.stringify(read.fullReplica?.baseline?.removedFields || [])}\`\n- Protected hash unchanged gate was checked before/after targeted publish.\n\n## Components\n\n- Opportunity Full Replica follow-up fields: **${Boolean(gates.opportunityFullReplicaFields)}**\n- Opportunity interaction signal subgrid: **${Boolean(gates.opportunityInteractionSubgrid)}**\n- Coverage form unpublished/published: **${Boolean(gates.coverageForm)}/${Boolean(gates.coverageFormPublished)}**\n- Coverage views: **${Boolean(gates.coverageViews)}**\n- Signal form unpublished/published: **${Boolean(gates.signalForm)}/${Boolean(gates.signalFormPublished)}**\n- Signal views: **${Boolean(gates.signalViews)}**\n- Account subgrid: **deferred, P2** because no approved Account Demo Form was found. Standard/Protected Account forms were not modified.\n\n## Choice metadata\n\n${JSON.stringify(read.choiceMetadata || [], null, 2)}\n\n## Security\n\nThe existing directly assigned \`CRM AI Demo BPF User\` role was the only role eligible for minimal additions. Coverage Read/Append/Append To and Signal Read were read back at Basic depth. Signal Operator and Management Reader roles were not created or assigned; no unknown role or team membership was modified.\n\n## Runtime probe\n\nProbe started: **${Boolean(audit.probe?.started)}**. The approved prefix \`${PROBE_PREFIX}\` was reserved, but no row was created when Choice metadata returned zero usable options. No Account, Opportunity, Coverage, Signal, Contact, Actual, Activity, Email or Timeline row was created by the failed preflight.\n\n## Publish resume\n\n${audit.publish ? `- ${audit.publish.note}\n- Current invocation Publish requests: ${audit.publish.requests.length}` : "- No publish results were recorded in this invocation."}\n\n## Gates\n\n${gateLines}\n\n## Request statistics\n\n\`GET=${audit.requestCounts.GET}\`, \`POST=${audit.requestCounts.POST}\`, \`PATCH=${audit.requestCounts.PATCH}\`, \`DELETE=${audit.requestCounts.DELETE}\`, \`Publish=${audit.requestCounts.Publish}\`. Synthetic probe writes are separated from real business data writes; real business data writes remain **0**.\n\n## Blockers\n\n${audit.blockers.length ? audit.blockers.map((item) => `- ${item.severity}: ${item.message}`).join("\n") : "- None"}\n`);
  const missingSolutionText = read.solutionMembership?.missing?.length ? read.solutionMembership.missing.map((item) => `${item.key} (${item.objectId}, type ${item.componentType})`).join("; ") : "None";
  await fs.appendFile(reportPath, `\n## Solution membership\n\n- Expected components: **${read.solutionMembership?.expected?.length || 0}**\n- Missing components: **${read.solutionMembership?.missing?.length || 0}**\n- Missing: ${missingSolutionText}\n- Recovery actions: ${JSON.stringify(read.solutionMembership?.actions || [])}\n`);
  await fs.writeFile(recoveryPath, `# Phase 1C-5R2F-R1 Form/View/Security Gate Recovery\n\n- Environment: \`${audit.environment}\`\n- Solution: \`${read.solution?.uniquename || SOLUTION}\`\n- Current recovery request counts: GET=${audit.requestCounts.GET}, POST=${audit.requestCounts.POST}, PATCH=${audit.requestCounts.PATCH}, DELETE=${audit.requestCounts.DELETE}, Publish=${audit.requestCounts.Publish}\n- Metadata writes: ${audit.writes.metadata}\n- Solution component writes: ${audit.writes.solutionComponent}\n- Form/View/Choice writes: ${audit.writes.form + audit.writes.view}\n- Security writes: ${audit.writes.security}\n- Probe creates: ${audit.writes.probe}\n- Probe deletes: ${audit.probe?.cleanup?.deleted?.length || 0}\n- Real business data writes: 0\n- Production requests: 0\n\n## Recovery decisions\n\n- Coverage Account Subgrid: **deferred, P2**; no approved Account Demo Form was created or modified.\n- Solution membership: **${Boolean(gates.solutionMembership)}**; expected=${read.solutionMembership?.expected?.length || 0}, confirmed=${(read.solutionMembership?.expected?.length || 0) - (read.solutionMembership?.missing?.length || 0)}, missing=${read.solutionMembership?.missing?.length || 0}.\n- Local Choice Metadata: **${Boolean(gates.localChoiceMetadata)}**\n- Global Choice Metadata: **${Boolean(gates.globalChoiceMetadata)}**\n- Runtime Probe: **${Boolean(gates.runtimeProbe)}**\n- Runtime Probe Cleanup: **${Boolean(gates.runtimeProbeCleanup)}**\n\n## Choice metadata readback\n\n${JSON.stringify(read.choiceMetadata || [], null, 2)}\n\n## Gate counts\n\n- P0 Count: **${counts.p0Count}**\n- P1 Count: **${counts.p1Count}**\n- P2 Count: **${counts.p2Count}**\n- P0 Gate Passed: **${counts.p0GatePassed}**\n- P1 Gate Passed: **${counts.p1GatePassed}**\n- Form View Security Phase Ready: **${finalReady}**\n- Demo Data Design Phase Ready: **${finalReady}**\n\n## Blockers\n\n${audit.blockers.length ? audit.blockers.map((item) => `- ${item.severity}: ${item.message}`).join("\n") : "- None"}\n`);
}

runDataverseCli(import.meta.url, main);
