import { createHash } from "node:crypto";
import { openAiCompatibleThinking } from "../ai/providers/openaiCompatibleOptions.mjs";

export const DEMO_NARRATIVE_CONTRACT_VERSION = "Demo LLM Narrative Contract v1";
export const DEMO_NARRATIVE_PROVIDER_PROFILE = "DeepSeek Pro Minimal Narrative v1";
export const DEMO_NARRATIVE_TOOL_NAME = "emit_demo_narrative";

export const NARRATIVE_SUMMARY_CODES = Object.freeze([
  "STABLE_PROGRESS",
  "REVIEW_REQUIRED",
  "HIGH_RISK_REVIEW",
  "GROWTH_POTENTIAL",
]);
export const NARRATIVE_RISK_CODES = Object.freeze([
  "NO_MATERIAL_RISK",
  "STALLED_PROGRESS",
  "FINANCIAL_VARIANCE",
  "DATA_CONTRADICTION",
  "ROUTE_REVIEW",
  "MULTI_RISK_REVIEW",
  "MEETING_PREPARATION",
]);
export const NARRATIVE_ACTION_CODES = Object.freeze([
  "CONTINUE_MONITORING",
  "CONFIRM_NEXT_STEP",
  "RECONCILE_FACTS",
  "REVIEW_BUDGET_ACTUAL",
  "PREPARE_CUSTOMER_MEETING",
  "CONFIRM_ROUTE_AND_COVERAGE",
  "ALIGN_STAKEHOLDERS",
]);
export const NARRATIVE_LIMITATION_CODES = Object.freeze([
  "IDENTITY_MASKED",
  "EXACT_AMOUNT_WITHHELD",
  "RAW_TIMELINE_WITHHELD",
  "DETERMINISTIC_SCORE_AUTHORITY",
  "HUMAN_REVIEW_REQUIRED",
]);
export const NARRATIVE_CONFIDENCE_BANDS = Object.freeze(["HIGH", "MEDIUM", "LOW"]);

const objectSchema = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const enumSchema = (values) => ({ type: "string", enum: [...values] });
const arraySchema = (values) => ({ type: "array", items: enumSchema(values) });

export function buildDemoNarrativeSchema(evidenceAliases = []) {
  const aliases = [...new Set(evidenceAliases)].sort();
  if (!aliases.length) throw new TypeError("Narrative contract requires request-scoped Evidence Alias");
  return objectSchema({
    summaryCode: enumSchema(NARRATIVE_SUMMARY_CODES),
    riskExplanationCodes: arraySchema(NARRATIVE_RISK_CODES),
    actionCodes: arraySchema(NARRATIVE_ACTION_CODES),
    evidenceAliases: arraySchema(aliases),
    limitationCodes: arraySchema(NARRATIVE_LIMITATION_CODES),
    confidenceBand: enumSchema(NARRATIVE_CONFIDENCE_BANDS),
  });
}

export function buildDemoNarrativeTool(evidenceAliases = []) {
  return {
    type: "function",
    function: {
      name: DEMO_NARRATIVE_TOOL_NAME,
      description: "Return only approved narrative selection codes and exact supplied Evidence Aliases. Do not output free text or CRM facts.",
      strict: true,
      parameters: buildDemoNarrativeSchema(evidenceAliases),
    },
  };
}

export function validateDemoNarrative(value, { evidenceAliases = [] } = {}) {
  const errors = [];
  const aliasSet = new Set(evidenceAliases);
  if (!isRecord(value)) return { ok: false, errors: ["output_not_object"] };
  if (!NARRATIVE_SUMMARY_CODES.includes(value.summaryCode)) errors.push("summary_code_invalid");
  if (!arrayOfKnown(value.riskExplanationCodes, NARRATIVE_RISK_CODES)) errors.push("risk_code_invalid");
  if (!arrayOfKnown(value.actionCodes, NARRATIVE_ACTION_CODES)) errors.push("action_code_invalid");
  if (!arrayOfKnown(value.limitationCodes, NARRATIVE_LIMITATION_CODES)) errors.push("limitation_code_invalid");
  if (!NARRATIVE_CONFIDENCE_BANDS.includes(value.confidenceBand)) errors.push("confidence_band_invalid");
  if (!Array.isArray(value.evidenceAliases) || !value.evidenceAliases.length) errors.push("evidence_alias_required");
  if (Array.isArray(value.evidenceAliases)) {
    if (new Set(value.evidenceAliases).size !== value.evidenceAliases.length) errors.push("evidence_alias_duplicate");
    if (value.evidenceAliases.some((alias) => !aliasSet.has(alias))) errors.push("evidence_alias_unknown");
  }
  const knownKeys = ["summaryCode", "riskExplanationCodes", "actionCodes", "evidenceAliases", "limitationCodes", "confidenceBand"];
  for (const key of Object.keys(value)) if (!knownKeys.includes(key)) errors.push(`unknown_property:${key}`);
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function buildDemoNarrativeRequest({ providerInput, evidenceAliases, env = process.env }) {
  const tool = buildDemoNarrativeTool(evidenceAliases);
  const body = {
    model: String(env.LLM_MODEL || "deepseek-v4-pro"),
    messages: [
      {
        role: "system",
        content: "Return exactly one emit_demo_narrative tool call. Use only the supplied enum values and exact Evidence Aliases. Never output free text, CRM facts, identity, amounts, dates, or timeline content.",
      },
      { role: "user", content: JSON.stringify(providerInput) },
    ],
    ...openAiCompatibleThinking(env),
    temperature: 0,
    max_tokens: boundedNumber(env.LLM_NARRATIVE_MAX_TOKENS || 420, 420, 160, 1200),
    stream: false,
    tools: [tool],
    tool_choice: { type: "function", function: { name: DEMO_NARRATIVE_TOOL_NAME } },
  };
  return body;
}

export function narrativeRequestHash(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export function buildNarrativeProviderInput({ safeContext = {}, healthScore = {}, evidenceAliases = [], testOnly = false, syntheticProbe = false, d365Record = true, runtimeEligible = true, realCanary = true } = {}) {
  const dimensions = healthScore?.dimensions && typeof healthScore.dimensions === "object"
    ? Object.fromEntries(Object.entries(healthScore.dimensions).map(([key, value]) => [key, scoreBand(value)]))
    : {};
  return {
    testOnly,
    syntheticProbe,
    d365Record,
    runtimeEligible,
    realCanary,
    opportunityToken: String(safeContext.opportunityToken || ""),
    department: String(safeContext.salesDepartment || ""),
    opportunityState: String(safeContext.opportunityState || ""),
    stage: String(safeContext.stage || ""),
    priority: String(safeContext.priority || ""),
    healthGrade: String(healthScore.grade || ""),
    healthDimensionBands: dimensions,
    amountBand: String(safeContext.amountBand || ""),
    marginBand: String(safeContext.marginBand || ""),
    varianceCategory: String(safeContext.varianceCategory || ""),
    relativeDate: String(safeContext.relativeDate || ""),
    relativeDateStatus: String(safeContext.relativeDateStatus || ""),
    stagnationBand: String(safeContext.stagnationBand || ""),
    routeConsistency: String(safeContext.routeConsistency || ""),
    decisionReadiness: String(safeContext.decisionReadiness || ""),
    meetingWindow: String(safeContext.meetingWindow || ""),
    coverageCategory: String(safeContext.coverageCategory || ""),
    opportunityTrend: String(safeContext.accountAggregate?.opportunityTrend || safeContext.trend || ""),
    relationshipMaturity: String(safeContext.accountAggregate?.relationshipMaturity || ""),
    actualAvailability: String(safeContext.actualBand || ""),
    riskSignals: [...new Set([...(safeContext.dataQualityCodes || []), ...(safeContext.contradictionCodes || [])])].sort(),
    coverageStatus: String(safeContext.coverageStatus || ""),
    interactionSignal: safeCategory(safeContext.interactionSignal),
    dataQualitySignals: safeCategory(safeContext.dataQualitySignals),
    evidenceAliases: [...new Set(evidenceAliases)].sort(),
  };
}

export function validateNarrativeProviderInput(value) {
  if (!isRecord(value)) return { ok: false, errors: ["input_not_object"] };
  const errors = [];
  if (value.testOnly !== true && value.syntheticProbe === true) errors.push("synthetic_flags_invalid");
  if (value.syntheticProbe === true && (value.d365Record !== false || value.runtimeEligible !== false || value.realCanary !== false)) errors.push("synthetic_runtime_flags_invalid");
  if (!Array.isArray(value.evidenceAliases) || !value.evidenceAliases.length) errors.push("input_evidence_alias_required");
  const forbiddenKeys = new Set(["customername", "contactname", "email", "emailaddress", "phone", "telephone", "guid", "exactrevenue", "exactgp", "rawtimeline", "rawopportunityclose", "scenarioid", "golden", "expectedanswer", "notetext", "description"]);
  for (const key of collectKeys(value)) if (forbiddenKeys.has(key.toLowerCase())) errors.push(`forbidden_input:${key.toLowerCase()}`);
  const serialized = JSON.stringify(value);
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(serialized)) errors.push("guid_exposure");
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized)) errors.push("identity_email_exposure");
  if (/(?:^|[^\d])(?:\+?\d[\d\s().-]{8,}\d)(?:$|[^\d])/u.test(serialized) && !/\b(?:19|20)\d{2}[-/]\d{2}[-/]\d{2}\b/u.test(serialized)) errors.push("identity_phone_exposure");
  if (/(?:¥|￥|\$|CNY|RMB)\s*\d[\d,.]*/i.test(serialized)) errors.push("exact_amount_exposure");
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function expandDemoNarrative({ selection, safeContext, healthScore, evidenceByAlias = {}, provider = "DeepSeek", model = "deepseek-v4-pro", requestMeta = {} }) {
  const evidenceAliases = [...new Set(selection.evidenceAliases)].sort();
  const evidence = evidenceAliases.map((alias) => ({ alias, token: evidenceByAlias[alias] || alias }));
  const summary = {
    STABLE_PROGRESS: "当前进展总体稳定，可按既定节奏跟进。",
    REVIEW_REQUIRED: "当前需要人工复核关键事实与下一步条件。",
    HIGH_RISK_REVIEW: "当前存在较高优先级风险，应先完成事实核对。",
    GROWTH_POTENTIAL: "当前存在可进一步验证的增长机会。",
  }[selection.summaryCode];
  const riskMap = {
    NO_MATERIAL_RISK: "当前证据未支持新增重大风险。",
    STALLED_PROGRESS: "推进停滞信号需要优先复核。",
    FINANCIAL_VARIANCE: "预算与实绩偏差需要核对。",
    DATA_CONTRADICTION: "现有业务事实存在矛盾，需要先完成数据确认。",
    ROUTE_REVIEW: "路线与服务覆盖需要复核。",
    MULTI_RISK_REVIEW: "多个风险维度同时需要管理层关注。",
    MEETING_PREPARATION: "会议前需要围绕已识别信号准备问题。",
  };
  const actionMap = {
    CONTINUE_MONITORING: "继续按现有节奏监控",
    CONFIRM_NEXT_STEP: "确认下一步推进条件",
    RECONCILE_FACTS: "核对并统一关键业务事实",
    REVIEW_BUDGET_ACTUAL: "复核预算与实绩差异",
    PREPARE_CUSTOMER_MEETING: "准备客户会议问题清单",
    CONFIRM_ROUTE_AND_COVERAGE: "确认路线与服务覆盖",
    ALIGN_STAKEHOLDERS: "对齐相关决策参与方",
  };
  const limitationMap = {
    IDENTITY_MASKED: "客户及联系人身份已脱敏。",
    EXACT_AMOUNT_WITHHELD: "模型仅接收金额区间，不接收精确金额。",
    RAW_TIMELINE_WITHHELD: "未向模型提供原始活动记录正文。",
    DETERMINISTIC_SCORE_AUTHORITY: "Health Score 与 Grade 由确定性引擎负责。",
    HUMAN_REVIEW_REQUIRED: "输出为分析草案，仍需人工确认。",
  };
  return {
    label: "Validated LLM Analysis Snapshot",
    opportunityToken: safeContext.opportunityToken,
    healthScore: healthScore.healthScore,
    healthGrade: healthScore.grade,
    executiveSummary: summary,
    riskExplanation: selection.riskExplanationCodes.map((code) => riskMap[code]),
    recommendedActionDraft: selection.actionCodes.map((code) => ({ action: actionMap[code], basis: "由服务器根据确定性代码和安全证据展开", evidence: evidenceAliases, ownerRole: "待人工指定", dueWindow: "待人工确定", status: "Draft" })),
    limitationStatement: selection.limitationCodes.map((code) => limitationMap[code]),
    confidenceBand: selection.confidenceBand,
    evidence,
    providerAlias: provider,
    modelAlias: model,
    contractVersion: DEMO_NARRATIVE_CONTRACT_VERSION,
    providerProfile: DEMO_NARRATIVE_PROVIDER_PROFILE,
    requestHash: requestMeta.requestHash || "",
    responseHash: requestMeta.responseHash || "",
    contextVersion: "Safe Context v2",
    validatedAt: requestMeta.validatedAt || new Date().toISOString(),
    latencyMs: Number(requestMeta.latencyMs || 0),
    tokenUsage: requestMeta.tokenUsage || null,
    estimatedCostUsd: Number(requestMeta.estimatedCostUsd || 0),
    safetyResult: "pass",
    externalModelCalled: true,
    crmWriteback: false,
  };
}

function safeCategory(value) {
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : "category").slice(0, 8);
  if (!value || typeof value !== "object") return String(value || "");
  return Object.fromEntries(Object.entries(value).slice(0, 12).map(([key, item]) => [key, typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? item : "category"]));
}
function scoreBand(value) { const n = Number(value); return !Number.isFinite(n) ? "unknown" : n >= 90 ? "very-high" : n >= 75 ? "high" : n >= 60 ? "medium" : "low"; }
function arrayOfKnown(value, allowed) { return Array.isArray(value) && value.every((item) => allowed.includes(item)); }
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function collectKeys(value, output = []) {
  if (Array.isArray(value)) { for (const item of value) collectKeys(item, output); return output; }
  if (!isRecord(value)) return output;
  for (const [key, item] of Object.entries(value)) { output.push(key); collectKeys(item, output); }
  return output;
}
function boundedNumber(value, fallback, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
