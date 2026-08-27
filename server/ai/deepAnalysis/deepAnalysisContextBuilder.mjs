import { safeContextHash } from "../../decision/comparisonEvaluation.mjs";
import { getDecisionView } from "../../decision/decisionService.mjs";
import { buildTimelineExecutiveSynthesis } from "../../decision/timelineDigest.mjs";
import { DEEP_ANALYSIS_SCHEMA_VERSION } from "./deepAnalysisSchema.mjs";
import { HIGH_FIDELITY_MODE, STANDARD_SAFE_MODE } from "./highFidelityContext.mjs";

const PREVIEW_TEXT = Object.freeze({
  "zh-CN": {
    neverSent: ["客户名称", "联系人姓名", "电话和邮箱", "CRM GUID", "精确地址", "精确金额", "未脱敏 Timeline 原文", "合同原文", "报价原文", "Location/POL/POD 原值", "Scenario ID", "Golden metadata", "Raw fixture"],
    limitations: ["客户历史尚未接入", "外部行业与市场情报尚未启用", "公司内部能力知识尚未接入", "本次仅基于 CRM Safe Context"],
    categories: ["当前 Opportunity Safe Context", "Safe Account Aggregate", "金额区间", "预算/实绩偏差类别"],
    timelineSignals: "Timeline 结构化互动信号", timelineAnalysis: "Timeline 管理层综合分析包", marginBand: "毛利率区间", stage: "当前阶段", route: "安全路线一致性派生信号", meeting: "Meeting 安全派生信号",
    departmentPending: "CRM 部门字段待接入", pipelineRange: "当前 Pipeline 快照", aggregateRange: "当前安全快照与 12 个月聚合类别", amountMode: "仅金额区间",
    highAvailable: ["当前 CRM 业务事实原文（身份脱敏）", "Timeline 业务原文（身份脱敏）", "精确金额与业务日期", "路线、报价及商务条件", "客户异议与承诺", "内部业务判断和行动结果", "Interaction Signal 与服务覆盖"],
    highPolicy: "仅外部模型；单条 Opportunity；用户二次确认；只读；不自动重试", highRange: "当前授权 Opportunity 的完整 CRM 业务快照", highAmount: "高保真：精确业务金额仅发送至已确认外部模型",
    highNeverSent: ["客户公司/法人/品牌名称", "联系人姓名、邮箱、电话、地址", "Account/Contact ID、Dataverse GUID、客户编号", "未脱敏身份字段、凭据、Authorization", "附件", "CRM 写回指令"],
    highLimitations: ["仅分析当前一条 Opportunity，不执行 200 条批量分析", "输出为 Draft Recommendation，需人工复核", "客户历史与外部行业情报仍未接入"],
  },
  "ja-JP": {
    neverSent: ["顧客名", "担当者名", "電話とメール", "CRM GUID", "正確な住所", "正確な金額", "未匿名化 Timeline 原文", "契約原文", "見積原文", "Location/POL/POD 原値", "Scenario ID", "Golden metadata", "Raw fixture"],
    limitations: ["顧客履歴は未接続", "外部業界・市場情報は未有効化", "社内能力ナレッジは未接続", "今回は CRM Safe Context のみを使用"],
    categories: ["現在の Opportunity Safe Context", "Safe Account Aggregate", "金額帯", "予算・実績差異区分"],
    timelineSignals: "Timeline 構造化インタラクション信号", timelineAnalysis: "Timeline 経営層総合分析パック", marginBand: "粗利率帯", stage: "現在のステージ", route: "安全なルート整合性派生信号", meeting: "Meeting 安全派生信号",
    departmentPending: "CRM 部門項目は未接続", pipelineRange: "現在の Pipeline スナップショット", aggregateRange: "現在の安全スナップショットと12か月集計区分", amountMode: "金額帯のみ",
    highAvailable: ["現在の CRM 業務原文（ID匿名化）", "Timeline 業務原文（ID匿名化）", "正確な金額と業務日付", "ルート・見積・商取引条件", "顧客の異議とコミットメント", "社内判断とアクション結果", "Interaction Signal とサービスカバレッジ"],
    highPolicy: "外部モデルのみ・単一 Opportunity・二次確認・読み取り専用・自動再試行なし", highRange: "現在許可された Opportunity の完全な CRM 業務スナップショット", highAmount: "高精度：正確な業務金額は確認済み外部モデルにのみ送信",
    highNeverSent: ["顧客会社・法人・ブランド名", "担当者名・メール・電話・住所", "Account/Contact ID・Dataverse GUID・顧客番号", "未匿名化ID項目・資格情報・Authorization", "添付ファイル", "CRM 書き戻し指示"],
    highLimitations: ["現在の1 Opportunity のみを分析し、200件一括分析は実行しません", "出力は Draft Recommendation で人手確認が必要です", "顧客履歴と外部業界情報は未接続です"],
  },
  "en-US": {
    neverSent: ["Customer name", "Contact name", "Phone and email", "CRM GUID", "Exact address", "Exact amount", "Unredacted Timeline original", "Contract text", "Quotation text", "Raw Location/POL/POD", "Scenario ID", "Golden metadata", "Raw fixture"],
    limitations: ["Customer history is not connected", "External industry and market intelligence is not enabled", "Internal capability knowledge is not connected", "This run uses CRM Safe Context only"],
    categories: ["Current Opportunity Safe Context", "Safe Account Aggregate", "Amount band", "Budget/actual variance category"],
    timelineSignals: "Structured Timeline interaction signals", timelineAnalysis: "Timeline executive-analysis pack", marginBand: "Margin-rate band", stage: "Current stage", route: "Safe route-consistency derived signal", meeting: "Safe Meeting-derived signals",
    departmentPending: "CRM department field not connected", pipelineRange: "Current Pipeline snapshot", aggregateRange: "Current safe snapshot and 12-month aggregate categories", amountMode: "Amount bands only",
    highAvailable: ["Current CRM business original (identity redacted)", "Timeline business original (identity redacted)", "Exact amounts and business dates", "Routes, quotations, and commercial terms", "Customer objections and commitments", "Internal business judgments and action outcomes", "Interaction Signals and service coverage"],
    highPolicy: "External model only; one Opportunity; second confirmation; read-only; no automatic retry", highRange: "Complete CRM business snapshot for the currently authorized Opportunity", highAmount: "High fidelity: exact business amounts are sent only to the confirmed external model",
    highNeverSent: ["Customer company, legal entity, or brand name", "Contact name, email, phone, or address", "Account/Contact ID, Dataverse GUID, or customer number", "Unredacted identity fields, credentials, or Authorization", "Attachments", "CRM writeback instructions"],
    highLimitations: ["Analyzes one current Opportunity only, not all 200 records", "Output is a Draft Recommendation and requires human review", "Customer history and external industry intelligence are not connected"],
  },
});

export function buildDeepAnalysisPreview({ template, mode, scenarioId, opportunityToken, role = "demo-full-access", provider = "demo", externalModelAvailable = false, highFidelityAvailable = externalModelAvailable, responseLocale = "zh-CN", decisionView = null, analysisContextMode = STANDARD_SAFE_MODE, highFidelityContext = null }) {
  const view = decisionView || getDecisionView({ mode, scenarioId, opportunityToken });
  if (!view) throw new TypeError("Deep analysis opportunity not found in scope");
  const locale = normalizeResponseLocale(responseLocale);
  const text = PREVIEW_TEXT[locale];
  if (analysisContextMode === HIGH_FIDELITY_MODE) return buildHighFidelityPreview({ template, mode, opportunityToken, role, provider, externalModelAvailable, highFidelityAvailable, responseLocale: locale, view, highFidelityContext });
  const timelineExecutiveAnalysis = buildTimelineExecutiveSynthesis({ evidence: view.safeContext.timelineContentEvidence || [], digest: view.safeContext.timelineDigest || {} });
  const availableData = availableCategories(template.code, view.safeContext, text);
  const input = {
    templateCode: template.code,
    templateVersion: template.version,
    safeDecisionContext: view.safeContext,
    safeAccountAggregate: view.safeContext.accountAggregate,
    derivedSignals: derivedSignals(template.code, view.safeContext),
    timelineExecutiveAnalysisPack: timelineExecutiveAnalysis,
    schemaVersion: DEEP_ANALYSIS_SCHEMA_VERSION,
    responseLocale: locale,
    instruction: "Analyze only the full aggregated Timeline Executive Analysis Pack and its representative evidence. Separate CRM facts from AI inference. Do not create precise predictions or CRM actions.",
  };
  return {
    templateCode: template.code,
    templateVersion: template.version,
    opportunityToken: view.safeContext.opportunityToken,
    accountToken: view.safeContext.accountToken,
    role,
    departmentScopeStatus: view.runtime?.department?.label || text.departmentPending,
    dataSource: view.runtime?.sourceLabel || "Local Fixture",
    mode: view.mode,
    dataTimeRange: view.safeContext.elapsedPeriodCategory === "pipeline" ? text.pipelineRange : text.aggregateRange,
    amountMode: text.amountMode,
    availableData,
    missingDependencies: [...template.unavailableDependencies],
    providerPolicy: template.providerPolicy,
    provider,
    externalModelAvailable,
    externalModelCalled: false,
    safeContextUsed: true,
    rawDataSent: false,
    exactAmountSentToModel: false,
    timelineRawTextSent: false,
    sanitizedTimelineEvidenceSent: Boolean(view.safeContext.timelineContentEvidence?.length),
    timelineExecutiveAnalysis,
    safeContextHash: safeContextHash({ safeContext: view.safeContext, accountAggregate: view.safeContext.accountAggregate }),
    neverSent: text.neverSent,
    currentLimitations: text.limitations,
    analysisContextMode: STANDARD_SAFE_MODE,
    highFidelityAvailable: highFidelityAvailable && view.runtime?.dataSource === "d365-pilot",
    responseLocale: locale,
    providerInput: input,
  };
}

function buildHighFidelityPreview({ template, mode, opportunityToken, role, provider, externalModelAvailable, highFidelityAvailable, responseLocale, view, highFidelityContext }) {
  if (!highFidelityContext) throw new TypeError("High fidelity context is not configured.");
  const text = PREVIEW_TEXT[responseLocale];
  const providerInput = {
    analysisContextMode: HIGH_FIDELITY_MODE,
    templateCode: template.code,
    templateVersion: template.version,
    responseLocale,
    redactionRuleVersion: highFidelityContext.redactionRuleVersion,
    highFidelityContext,
    instruction: "Analyze the complete identity-redacted CRM business text for this single opportunity. Preserve exact business dates and amounts when useful. Cite evidence tokens and label recommendations as Draft Recommendation.",
  };
  return {
    templateCode: template.code,
    templateVersion: template.version,
    opportunityToken: view.safeContext.opportunityToken,
    accountToken: view.safeContext.accountToken,
    role,
    departmentScopeStatus: view.runtime?.department?.label || text.departmentPending,
    dataSource: "D365 Frozen Dataset",
    mode,
    dataTimeRange: text.highRange,
    amountMode: text.highAmount,
    availableData: text.highAvailable,
    missingDependencies: [...template.unavailableDependencies],
    providerPolicy: text.highPolicy,
    provider,
    externalModelAvailable,
    externalModelCalled: false,
    safeContextUsed: true,
    analysisContextMode: HIGH_FIDELITY_MODE,
    highFidelityAvailable,
    responseLocale,
    highFidelityConfirmationRequired: true,
    crmBusinessTextIncluded: true,
    timelineBusinessTextIncluded: Boolean(highFidelityContext.timelineBusinessTextIncluded),
    exactAmountIncluded: true,
    exactDateIncluded: true,
    routeAndCommercialTermsIncluded: true,
    customerCompanyMasked: true,
    customerContactMasked: true,
    redactionRuleVersion: highFidelityContext.redactionRuleVersion,
    rawUnredactedCustomerIdentitySent: false,
    identityRedactedBusinessTextSent: true,
    crmWritebackEnabled: false,
    neverSent: text.highNeverSent,
    currentLimitations: text.highLimitations,
    safeContextHash: safeContextHash({ safeContext: view.safeContext, redactionRuleVersion: highFidelityContext.redactionRuleVersion, opportunityToken }),
    providerInput,
  };
}

export function normalizeResponseLocale(value) {
  return ["zh-CN", "ja-JP", "en-US"].includes(value) ? value : "zh-CN";
}

export function publicDeepAnalysisPreview(preview) {
  const { providerInput: _providerInput, ...publicPreview } = preview;
  return publicPreview;
}

function availableCategories(code, context, text) {
  const categories = [...text.categories];
  if (context.timelineDigest) categories.push(text.timelineSignals);
  if (context.timelineContentEvidence?.length) categories.push(text.timelineAnalysis);
  if (["DA-02", "DA-03"].includes(code)) categories.push(text.marginBand, text.stage);
  if (code === "DA-06") categories.push(text.route);
  if (code === "DA-07") categories.push(text.meeting);
  return categories.filter((item) => item !== text.categories[3] || context.varianceCategory);
}

function derivedSignals(code, context) {
  if (code === "DA-07") return { meetingWindow: context.meetingWindow, stakeholderCoverage: context.stakeholderCoverage, openQuestionCount: context.openQuestionCount, decisionReadiness: context.decisionReadiness };
  if (code === "DA-06") return { transportMode: context.transportMode, routeConsistency: context.routeConsistency };
  return { stage: context.stage, priority: context.priority, stagnationBand: context.stagnationBand, amountBand: context.revenueBand, varianceCategory: context.varianceCategory, marginBand: context.marginBand, ratioBucket: context.marginBand };
}
