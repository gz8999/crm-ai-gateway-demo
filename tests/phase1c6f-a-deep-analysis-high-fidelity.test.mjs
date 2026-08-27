import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildHighFidelityContext, buildStableIdentityDictionary, scanRedactedContext, HIGH_FIDELITY_MODE } from "../server/ai/deepAnalysis/highFidelityContext.mjs";
import { buildHighFidelityRequest, runHighFidelityExternal, validateHighFidelitySelection } from "../server/ai/deepAnalysis/highFidelityProvider.mjs";
import { validateHighFidelityProviderPayload } from "../server/ai/deepAnalysis/deepAnalysisSafety.mjs";
import { validateDeepAnalysisOutput } from "../server/ai/deepAnalysis/deepAnalysisSchema.mjs";
import { createDeepAnalysisService } from "../server/ai/deepAnalysis/deepAnalysisService.mjs";
import { getDeepAnalysisTemplate } from "../server/ai/deepAnalysis/templateRegistry.mjs";

const externalEnv = {
  FEATURE_DEEP_ANALYSIS: "true",
  AI_PROVIDER: "openai-compatible",
  ALLOW_EXTERNAL_AI: "true",
  LLM_BASE_URL: "https://provider.test.invalid/beta",
  LLM_API_KEY: "local-test-secret",
  LLM_MODEL: "deepseek-v4-pro",
  LLM_TIMEOUT_MS: "1000",
  DATAVERSE_URL: "https://org91f5f65f.crm5.dynamics.com",
};

test("high fidelity context keeps business text and exact facts while redacting stable identities", () => {
  const data = rawData();
  data.opportunities[0].description += " 合同编号：CN-ACCT-001，访问 https://example.test/customer=CUST-001。";
  data.opportunities[0].aigw_customernamecn = "华北客户集团品牌";
  const context = buildHighFidelityContext({ data, scope: scope(), opportunityToken: "DEMO-OPP-075", now: new Date("2026-07-20T00:00:00Z") });
  const serialized = JSON.stringify(context);
  assert.equal(context.analysisContextMode, HIGH_FIDELITY_MODE);
  assert.equal(context.customerCompanyMasked, true);
  assert.equal(context.customerContactMasked, true);
  assert.equal(context.exactAmountIncluded, true);
  assert.match(serialized, /人民币 1280000 元/u);
  assert.match(serialized, /CUSTOMER-COMPANY-A/u);
  assert.match(serialized, /CUSTOMER-PROCUREMENT-A/u);
  assert.match(serialized, /2026-07-11/u);
  assert.equal(context.financialFacts.annualActualGrossProfit, 12000);
  assert.equal(context.financialFacts.annualBudgetMarginRate, 0.12);
  assert.equal(context.financialFacts.annualActualMarginRate, 0.015);
  assert.doesNotMatch(serialized, /华北客户集团|华北客户集团品牌|张三|zhangsan@example\.test|13912345678|CN-ACCT-001|customer=CUST-001/iu);
  assert.equal(context.residualScan.rawValueMatchCount, 0);
  assert.equal(context.residualScan.guidCount, 0);
  assert.equal(context.residualScan.emailCount, 0);
  assert.equal(context.residualScan.phoneCount, 0);
});

test("identity pseudonyms remain stable for aliases and contact roles across records", () => {
  const data = rawData();
  data.opportunities.push({ opportunityid: "opp-2", _parentaccountid_value: "account-1", aigw_customernamecn: "华北客户集团品牌" });
  const dictionary = buildStableIdentityDictionary(data);
  assert.equal(dictionary.rawToPseudonym.get("华北客户集团"), "CUSTOMER-COMPANY-A");
  assert.equal(dictionary.rawToPseudonym.get("华北客户集团品牌"), "CUSTOMER-COMPANY-A");
  assert.equal(dictionary.rawToPseudonym.get("张三"), "CUSTOMER-PROCUREMENT-A");
});

test("high fidelity residual scan allows explicit Safe Context tokens without allowing raw identity values", () => {
  const data = rawData();
  data.accounts[0].accountnumber = "CUSTOMER-ACCT-001";
  const currentScope = scope();
  currentScope.contexts[0].safeContext.timelineContentEvidence = [{ excerpt: "张三确认客户路线", semanticExcerpt: "张三仍待确认" }];
  const context = buildHighFidelityContext({ data, scope: currentScope, opportunityToken: "DEMO-OPP-075" });
  assert.equal(context.residualScan.rawValueMatchCount, 0);
  assert.equal(context.residualScan.customerCompanyResidual, 0);
  assert.equal(context.residualScan.allowlistedSafeTokenCount, 3);
  assert.doesNotMatch(JSON.stringify(context.safeDecisionContext), /张三/u);

  const dictionary = buildStableIdentityDictionary(rawData());
  const unsafe = scanRedactedContext({ customer: "华北客户集团" }, dictionary, { allowedIdentityValues: ["DEMO-OPP-075"] });
  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.reason, "raw_identity_value");
});

test("high fidelity provider payload is strict, identity-redacted, and preserves Timeline business text", () => {
  const context = buildHighFidelityContext({ data: rawData(), scope: scope(), opportunityToken: "DEMO-OPP-075" });
  const payload = { analysisContextMode: HIGH_FIDELITY_MODE, templateCode: "DA-07", templateVersion: "v1", redactionRuleVersion: context.redactionRuleVersion, highFidelityContext: context, instruction: "Analyze" };
  assert.equal(validateHighFidelityProviderPayload(payload).ok, true);
  const request = buildHighFidelityRequest({ payload, env: externalEnv });
  const body = JSON.parse(request.messages[1].content);
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.equal(Object.hasOwn(request, "tools"), false);
  assert.equal(Object.hasOwn(request, "tool_choice"), false);
  assert.match(JSON.stringify(body.context), /客户要求在2026-07-11前确认港口安排/u);
  assert.doesNotMatch(JSON.stringify(body.context), /华北客户集团|张三|zhangsan@example\.test/iu);
  assert.doesNotMatch(JSON.stringify(body.context), /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu);
  assert.doesNotMatch(JSON.stringify(body.context), /TL-001|highFidelity\.crm\.business/iu);
  assert.match(JSON.stringify(body.context), /evidenceAlias/u);
  assert.match(request.messages[0].content, /one JSON object only/u);
  assert.match(request.messages[0].content, /valid JSON escaping/u);
  assert.match(request.messages[0].content, /second JSON encoding/u);
  assert.match(request.messages[0].content, /evidenceAliases/u);
  assert.match(request.messages[0].content, /exact output shape/u);
  assert.match(request.messages[0].content, /"additionalProperties":false/u);
});

test("high fidelity provider uses one strict parser and exposes only safe JSON diagnostics", async () => {
  const context = buildHighFidelityContext({ data: rawData(), scope: scope(), opportunityToken: "DEMO-OPP-075" });
  const payload = { analysisContextMode: HIGH_FIDELITY_MODE, templateCode: "DA-07", templateVersion: "v1", redactionRuleVersion: context.redactionRuleVersion, highFidelityContext: context, instruction: "Analyze" };
  const result = await runHighFidelityExternal({
    payload,
    requestId: "high-parser-001",
    env: externalEnv,
    fetchImpl: async () => new Response(JSON.stringify({
      id: "high-parser-response",
      model: "deepseek-v4-flash",
      choices: [{ finish_reason: "stop", message: { content: '{"executiveSummary":"broken",}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "message_content_json_invalid");
  assert.equal(result.diagnosticCategory, "MESSAGE_CONTENT_JSON_INVALID");
  assert.equal(result.observation.jsonParseErrorType, "SyntaxError");
  assert.equal(typeof result.observation.jsonParseErrorPosition, "number");
  assert.equal(Object.hasOwn(result, "selection"), false);
  assert.equal(JSON.stringify(result).includes("broken"), false);
});

test("high fidelity JSON output fails closed for non-string or empty message content without fallback", async () => {
  const context = buildHighFidelityContext({ data: rawData(), scope: scope(), opportunityToken: "DEMO-OPP-075" });
  const payload = { analysisContextMode: HIGH_FIDELITY_MODE, templateCode: "DA-07", templateVersion: "v1", redactionRuleVersion: context.redactionRuleVersion, highFidelityContext: context, instruction: "Analyze" };
  let calls = 0;
  const run = (content) => runHighFidelityExternal({
    payload,
    requestId: "high-json-boundary-001",
    env: externalEnv,
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const objectResult = await run({ executiveSummary: "not accepted" });
  assert.equal(objectResult.ok, false);
  assert.equal(objectResult.reason, "message_content_type_invalid");
  const emptyResult = await run("");
  assert.equal(emptyResult.ok, false);
  assert.equal(emptyResult.reason, "message_content_empty");
  assert.equal(calls, 2);
  assert.equal(Object.hasOwn(objectResult, "selection"), false);
  assert.equal(Object.hasOwn(emptyResult, "selection"), false);
});

test("high fidelity service requires an independent second confirmation and maps a local strict response", async () => {
  const loaded = { data: rawData(), scope: scope(), opportunityToken: "DEMO-OPP-075" };
  let providerCalls = 0;
  const service = createDeepAnalysisService({
    env: externalEnv,
    contextLoader: async () => decisionView(),
    highFidelityContextLoader: async () => loaded,
    fetchImpl: async (_url, options) => {
      providerCalls += 1;
      const request = JSON.parse(options.body);
      const context = JSON.parse(request.messages[1].content).context;
      const timelineAlias = context.timelineBusinessRecords.find((item) => item.evidenceAlias)?.evidenceAlias || request.messages[1].content.match(/E\d{2}/u)?.[0] || "E01";
      const selection = {
        executiveSummary: "Timeline 显示客户在业务日期前提出港口确认要求，当前推进依赖决策人对下一步的明确承诺。",
        timelineConclusion: "Timeline 形成了从需求确认、路线讨论到待决策事项的连续链路。",
        customerPosition: "客户对方案保持兴趣，但在港口和交付安排上仍要求确认。",
        decisionClarity: "决策条件已部分明确，仍需完成下一步业务承诺的确认。",
        keyThemes: [{ title: "路线与交付节点", analysis: "路线与交付节点是连续讨论主题。", evidenceAliases: [timelineAlias] }],
        blockers: [{ analysis: "港口安排仍是主要阻力。", evidenceAliases: [timelineAlias] }],
        contradictions: [],
        risks: [{ analysis: "路线确认延迟可能影响推进窗口。", evidenceAliases: [timelineAlias] }],
        opportunities: [{ analysis: "若按业务日期完成确认，可继续验证方案推进条件。", evidenceAliases: [timelineAlias] }],
        recommendedActions: [{ action: "在业务日期节点前确认港口与交付责任边界", reason: "Timeline 原文显示该事项尚未形成完整承诺。", evidenceAliases: [timelineAlias] }],
        evidenceAliases: [timelineAlias],
        confidenceBand: "MEDIUM",
        limitations: ["客户历史未接入。"],
      };
      return new Response(JSON.stringify({ id: "local-high-001", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(selection) } }], usage: { prompt_tokens: 100, completion_tokens: 120, total_tokens: 220 } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const base = { templateCode: "DA-07", mode: "portfolio", scenarioId: "", opportunityToken: "DEMO-OPP-075", role: "demo-full-access", dataSource: "d365-pilot", department: "all", analysisContextMode: HIGH_FIDELITY_MODE };
  await assert.rejects(() => service.run({ ...base, confirmed: true }), /second confirmation|required/iu);
  assert.equal(providerCalls, 0);
  const preview = await service.preview(base);
  assert.equal(preview.analysisContextMode, HIGH_FIDELITY_MODE);
  assert.equal(preview.highFidelityConfirmationRequired, true);
  const result = await service.run({ ...base, confirmed: true, highFidelityConfirmed: true, requestId: "high-fidelity-001" });
  assert.equal(result.output.provider.externalModelCalled, true);
  assert.equal(result.output.safety.identityRedactedBusinessTextSent, true);
  assert.equal(result.output.safety.rawUnredactedCustomerIdentitySent, false);
  assert.equal(result.output.safety.exactAmountIncluded, true);
  assert.equal(result.output.timelineEvidence.length, 1);
  assert.equal(result.output.recommendedActions[0].status, "Draft");
  assert.match(result.output.timelineEvidence[0].summary, /港口安排/u);
  assert.equal(validateDeepAnalysisOutput(result.output).ok, true);
  const audit = service.listAudit()[0];
  assert.equal(audit.analysisContextMode, HIGH_FIDELITY_MODE);
  assert.equal(audit.crmBusinessTextIncluded, true);
  assert.equal(audit.timelineBusinessTextIncluded, true);
  assert.equal(audit.exactAmountIncluded, true);
  assert.equal(audit.exactDateIncluded, true);
  assert.equal(audit.routeAndCommercialTermsIncluded, true);
  assert.equal(audit.customerCompanyMasked, true);
  assert.equal(audit.customerContactMasked, true);
  assert.equal(audit.crmWritebackEnabled, false);
  assert.doesNotMatch(JSON.stringify(audit), /华北客户集团|张三|1280000|港口安排/iu);
});

test("high fidelity selection rejects unknown evidence and cannot invent a reference", () => {
  const valid = { executiveSummary: "a", timelineConclusion: "b", customerPosition: "c", decisionClarity: "d", keyThemes: [{ title: "t", analysis: "a", evidenceAliases: ["E01"] }], blockers: [], contradictions: [], risks: [], opportunities: [], recommendedActions: [], evidenceAliases: ["E01"], confidenceBand: "LOW", limitations: [] };
  assert.equal(validateHighFidelitySelection(valid, { aliases: ["E01"] }).ok, true);
  const invalid = validateHighFidelitySelection({ ...valid, evidenceAliases: ["E99"] }, { aliases: ["E01"] });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.unknownAliasCount, 1);
  assert.equal(invalid.diagnostics[0].reasonCode, "UNKNOWN_ALIAS");
});

test("high fidelity mode blocks when CRM Writeback is enabled", async () => {
  const service = createDeepAnalysisService({
    env: { ...externalEnv, CRM_WRITEBACK_ENABLED: "true" },
    contextLoader: async () => decisionView(),
    highFidelityContextLoader: async () => ({ data: rawData(), scope: scope(), opportunityToken: "DEMO-OPP-075" }),
  });
  await assert.rejects(() => service.preview({ templateCode: "DA-07", mode: "portfolio", scenarioId: "", opportunityToken: "DEMO-OPP-075", role: "demo-full-access", dataSource: "d365-pilot", department: "all", analysisContextMode: HIGH_FIDELITY_MODE }), /Writeback=false/iu);
});

test("high fidelity Timeline uses an Annotation business date marker instead of createdon", () => {
  const data = rawData();
  data.entries.Timeline.push({ id: "annotation-1", token: "TL-002", parentId: "opp-1", isAnnotation: true });
  data.timeline.annotations.push({ annotationid: "annotation-1", subject: "计划节点", notetext: "【计划节点日期】2026-08-03\n【记录内容】确认后续窗口", _objectid_value: "opp-1", createdon: "2026-07-20T10:00:00Z", isdocument: false });
  const context = buildHighFidelityContext({ data, scope: scope(), opportunityToken: "DEMO-OPP-075" });
  const annotation = context.timelineBusinessRecords.find((item) => item.evidenceToken === "TL-002");
  assert.equal(annotation.businessDate, "2026-08-03");
  assert.match(annotation.businessText, /【计划节点日期】2026-08-03/u);
});

test("UI keeps high fidelity off by default and requires the independent consent phrase", async () => {
  const [page, confirmation, rail, api, locales] = await Promise.all([
    readFile(new URL("../src/deepAnalysis/DeepAnalysisPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/deepAnalysis/AnalysisConfirmation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/deepAnalysis/DeepAnalysisSafetyRail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/i18n/productLocales.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /analysisContextMode: "standard_safe"/u);
  assert.match(page, /highFidelityConfirmed/u);
  assert.match(confirmation, /deepAnalysis\.highFidelityToggle/u);
  assert.match(confirmation, /deepAnalysis\.highFidelityConfirmText/u);
  assert.match(confirmation, /deepAnalysis\.confirmStartHigh/u);
  assert.match(rail, /deepAnalysis\.crmBusinessOriginalLabel/u);
  assert.match(rail, /deepAnalysis\.exactDateLabel/u);
  assert.match(rail, /deepAnalysis\.customerIdentityLabel/u);
  assert.match(locales, /deepAnalysis\.crmBusinessOriginalLabel[^\n]*CRM business original/u);
  assert.match(locales, /deepAnalysis\.exactDateLabel[^\n]*Exact date/u);
  assert.match(locales, /deepAnalysis\.customerIdentityLabel[^\n]*Customer identity/u);
  assert.match(api, /highFidelityConfirmed/u);
});

function decisionView() {
  return { mode: "portfolio", safeContext: scope().contexts[0].safeContext, runtime: { sourceLabel: "D365 Frozen Dataset", dataSource: "d365-pilot", department: { label: "全部部门" } } };
}

function scope() {
  return { contexts: [{ opportunityToken: "DEMO-OPP-075", accountToken: "ACCT-001", customerToken: "CUSTOMER-ACCT-001", salesDepartment: "FF", stage: "Qualify", opportunityState: "Active", priority: "High", forecastCategory: "Pipeline", transportMode: "海运", relativeDateStatus: "near-term", stagnationBand: "watch", timelineContentEvidence: [], timelineDigest: {}, accountAggregate: {}, safeContext: { opportunityToken: "DEMO-OPP-075", accountToken: "ACCT-001", customerToken: "CUSTOMER-ACCT-001", salesDepartment: "FF", stage: "Qualify", opportunityState: "Active", priority: "High", timelineDigest: {}, timelineContentEvidence: [] } }] };
}

function rawData() {
  return {
    entries: { Account: [{ id: "account-1", token: "ACCT-001" }], Contact: [{ id: "contact-1", token: "CONTACT-001" }], Opportunity: [{ id: "opp-1", token: "DEMO-OPP-075" }], Timeline: [{ id: "timeline-1", token: "TL-001", parentId: "opp-1" }] },
    accounts: [{ accountid: "account-1", accountnumber: "CUST-001", name: "华北客户集团", industrycode: 1 }],
    contacts: [{ contactid: "contact-1", fullname: "张三", jobtitle: "采购负责人", emailaddress1: "zhangsan@example.test", telephone1: "13912345678", _parentcustomerid_value: "account-1" }],
    opportunities: [{ opportunityid: "opp-1", name: "华北客户集团 海运方案", description: "客户要求在2026-07-11前确认港口安排", statecode: 0, statuscode: 1, _parentaccountid_value: "account-1", _parentcontactid_value: "contact-1", aigw_salesdepartment_choice: 6, aigw_nextaction: "确认港口与交付责任", aigw_nextactiondate: "2026-07-11", estimatedclosedate: "2026-08-01", estimatedvalue: 1280000, actualvalue: 0, aigw_yearrevenuebudget: 1500000, aigw_yeargpmpbudget: 180000, aigw_transportmode: 3, "aigw_transportmode@OData.Community.Display.V1.FormattedValue": "海运", "_aigw_opportunitylocation_value@OData.Community.Display.V1.FormattedValue": "上海", "_aigw_sealandpollookup_value@OData.Community.Display.V1.FormattedValue": "上海港", "_aigw_sealandpodlookup_value@OData.Community.Display.V1.FormattedValue": "汉堡港", aigw_customerneed_choice: 1, "aigw_customerneed_choice@OData.Community.Display.V1.FormattedValue": "交付稳定", aigw_proposalcontent_choice: 1, "aigw_proposalcontent_choice@OData.Community.Display.V1.FormattedValue": "路线方案" }],
    actuals: [{ _aigw_opportunityid_value: "opp-1", aigw_annualactualrevenue: 800000, aigw_aprilactualrevenue: 100000, aigw_aprilactualgp: 12000 }],
    coverages: [{ _aigw_accountid_value: "account-1", aigw_servicetype: 1, "aigw_servicetype@OData.Community.Display.V1.FormattedValue": "海运", aigw_coveragestatus: 1, "aigw_coveragestatus@OData.Community.Display.V1.FormattedValue": "已覆盖", aigw_startdate: "2026-01-01", aigw_enddate: "2026-12-31", aigw_nextopportunitywindow: "2026-Q3", aigw_servicesatisfaction: 1, "aigw_servicesatisfaction@OData.Community.Display.V1.FormattedValue": "良好" }],
    signals: [{ _aigw_opportunityid_value: "opp-1", _aigw_accountid_value: "account-1", aigw_sourceactivitytoken: "TL-001", aigw_activitydate: "2026-07-11", aigw_activitytype: 1, aigw_direction: 1, aigw_resultcategory: 1, aigw_nextstep: "确认港口", aigw_decisionmakerinvolved: true, aigw_commitmentmade: true, aigw_commitmentduedate: "2026-07-11", aigw_customerresponselevel: 1, aigw_sentiment: 1 }],
    timeline: { activities: [{ activityid: "timeline-1", activitytypecode: "appointment", subject: "张三确认华北客户集团路线", description: "客户要求在2026-07-11前确认港口安排，预算为人民币 1280000 元。", _regardingobjectid_value: "opp-1", scheduledstart: "2026-07-11T10:00:00Z" }], annotations: [] },
  };
}
