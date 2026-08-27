import { buildTimelineExecutiveSynthesis } from "../../decision/timelineDigest.mjs";

const DELAY_MS = 35;

export async function runDeepAnalysisDemo({ payload, requestId, signal }) {
  await cancellableDelay(DELAY_MS, signal);
  const context = payload.safeDecisionContext;
  const facts = factsFor(payload.templateCode, context);
  const timelineExecutiveAnalysis = buildTimelineExecutiveSynthesis({ evidence: context.timelineContentEvidence || [], digest: context.timelineDigest || {} });
  const timelineFacts = timelineExecutiveAnalysis.aggregateFacts.map((item) => fact(item.label, item.value, item.evidenceToken));
  const allFacts = [...facts, ...timelineFacts];
  const inference = inferenceFor(payload.templateCode, context);
  const timelineRefs = timelineExecutiveAnalysis.representativeEvidenceTokens;
  const timelineActions = timelineExecutiveAnalysis.managementActions.map((item) => ({ action: item.statement, reason: "该行动来自全量 Timeline 综合分析。", suggestedRole: "待人工指定", suggestedHorizon: "待人工确定（管理层草案，非 CRM 正式期限）", evidenceRefs: item.evidenceTokens, source: "AI 推断", status: "Draft" }));
  return {
    requestId,
    templateCode: payload.templateCode,
    templateVersion: payload.templateVersion,
    title: titleFor(payload.templateCode),
    executiveSummary: inference.summary,
    crmFacts: facts,
    timelineFacts,
    timelineFindings: [],
    timelineExecutiveSynthesis: timelineExecutiveAnalysis,
    timelineEvidence: timelineExecutiveAnalysis.representativeEvidence,
    customerHistoryFacts: [],
    externalFacts: [],
    internalCapabilityFacts: [],
    aiInferences: [{ label: "AI 推断，不是 CRM 事实", statement: inference.statement, evidenceRefs: allFacts.map((item) => item.source) }],
    risks: inference.risks,
    opportunities: inference.opportunities,
    scenarios: scenariosFor(inference.direction),
    recommendedActions: [...inference.actions.map((item) => ({ action: item.action, reason: item.reason, suggestedRole: "待人工指定", suggestedHorizon: `${item.horizon}（模型建议，非 CRM 正式期限）`, evidenceRefs: allFacts.map((fact) => fact.source), source: "AI 推断", status: "Draft" })), ...timelineActions],
    confidence: { level: inference.confidence, reason: "基于确定性 Demo 规则和当前 Safe Context 分类信号。" },
    limitations: ["客户历史尚未接入", "外部行业与市场情报尚未启用", "公司内部能力知识尚未接入", "本次仅基于 CRM Safe Context", "未生成精确金额、概率或日期"],
    sources: allFacts.map((item) => ({ type: item.source.startsWith("safeContext.timeline.") ? "Timeline Executive Synthesis" : "当前 CRM", ref: item.source })),
    provider: { used: "demo", policy: "deterministic-demo-only", externalModelCalled: false },
    safety: { safeContextUsed: true, rawDataSent: false, exactAmountSentToModel: false, timelineRawTextSent: false, sanitizedTimelineEvidenceSent: timelineRefs.length > 0, customerIdentitySent: false, crmWritebackEnabled: false, externalLlmEnabled: false },
  };
}

function factsFor(code, context) {
  const common = [fact("当前阶段", context.stage, "safeContext.stage"), fact("推进状态", context.stagnationBand, "safeContext.stagnationBand")];
  if (code === "DA-03") return [fact("预算区间", context.budgetBand, "safeContext.budgetBand"), fact("实绩区间", context.actualBand, "safeContext.actualBand"), fact("预算实绩偏差", context.varianceCategory, "safeContext.varianceCategory"), fact("毛利率区间", context.marginBand, "safeContext.marginBand")];
  if (code === "DA-06") return [fact("运输方式", context.transportMode, "safeContext.transportMode"), fact("路线一致性", context.routeConsistency, "safeContext.routeConsistency")];
  if (code === "DA-07") return [fact("会议窗口", context.meetingWindow, "safeContext.meetingWindow"), fact("关键角色覆盖", context.stakeholderCoverage, "safeContext.stakeholderCoverage"), fact("待确认问题数", String(context.openQuestionCount), "safeContext.openQuestionCount"), fact("决策准备度", context.decisionReadiness, "safeContext.decisionReadiness")];
  return [...common, fact("安全优先级", context.priority, "safeContext.priority"), fact("数据质量信号", context.dataQualityCodes.join(", ") || "clear", "safeContext.dataQualityCodes")];
}

function inferenceFor(code, context) {
  if (code === "DA-03") {
    const risk = ["material-negative", "negative"].includes(context.varianceCategory);
    return result(risk ? "预算与实绩类别显示需要人工复核恢复假设。" : "预算与实绩类别未显示升级信号。", risk ? "偏差类别支持开展预算恢复复核。" : "当前区间信号支持维持常规复核。", risk ? ["预算实绩偏差需复核"] : [], risk ? [] : ["保持当前预算复核节奏"], risk ? "恶化" : "稳定", risk ? "中" : "高", "复核预算与实绩假设", "下一次人工复核前");
  }
  if (code === "DA-06") {
    const review = context.routeConsistency === "review-required";
    return result(review ? "安全路线一致性信号需要授权人员核验。" : "安全路线一致性信号当前未显示异常。", review ? "仅能确认内部一致性待复核，不能推断现实延误或外部事件。" : "当前仅支持维持常规路线核验。", review ? ["路线一致性待核验"] : [], [], review ? "中" : "稳定", "中", "核验安全路线组合", "报价或方案确认前");
  }
  if (code === "DA-07") {
    const questions = context.openQuestionCount > 0;
    return result(questions ? "会前应优先覆盖待确认问题和关键角色。" : "会议安全派生信号显示准备度稳定。", questions ? "会议议程需要围绕安全问题数量组织，不读取沟通原文。" : "当前没有安全信号支持新增高风险判断。", questions ? ["仍有待确认问题"] : [], ["形成问题导向的会议议程"], questions ? "中" : "改善", context.stakeholderCoverage === "complete" ? "高" : "中", "准备问题导向议程", "会议开始前");
  }
  const elevated = context.priority === "Critical" || context.stagnationBand === "severe" || context.dataQualityCodes.length > 0;
  return result(elevated ? "当前商机包含需要人工优先复核的安全信号。" : "当前商机信号支持常规跟进。", elevated ? "推进、优先级或数据质量分类共同支持开展赢单风险复核。" : "未发现足以支持升级的安全分类信号。", elevated ? ["推进或数据质量信号需复核"] : [], elevated ? [] : ["保持正常跟进节奏"], elevated ? "中高" : "稳定", elevated ? "中" : "高", "开展赢单证据复核", "下一次管理复核前");
}

function result(summary, statement, risks, opportunities, direction, confidence, action, horizon) { return { summary, statement, risks, opportunities, direction, confidence, actions: [{ action, reason: statement, horizon }] }; }
function fact(label, value, source) { return { label, value: String(value), source, sourceType: "crm_current" }; }
function titleFor(code) { return ({ "DA-02": "当前案件赢单与风险分析", "DA-03": "预算、实绩与盈利分析", "DA-06": "物流方案与路线适配分析", "DA-07": "会前准备与谈判策略" })[code] || "深度分析"; }
function scenariosFor(direction) { return [{ name: "基准情景", direction: "稳定", summary: "保持当前安全分类信号并由人工持续复核。" }, { name: "乐观情景", direction: "改善", summary: "关键待确认项得到核实，安全信号改善。" }, { name: "风险情景", direction: ["恶化", "中高"].includes(direction) ? "恶化" : "中", summary: "关键待确认项未解决，保持人工升级复核。" }]; }
function cancellableDelay(ms, signal) { return new Promise((resolve, reject) => { if (signal?.aborted) return reject(abortError()); const timer = setTimeout(resolve, ms); signal?.addEventListener("abort", () => { clearTimeout(timer); reject(abortError()); }, { once: true }); }); }
function abortError() { const error = new Error("Deep analysis cancelled"); error.name = "AbortError"; return error; }
