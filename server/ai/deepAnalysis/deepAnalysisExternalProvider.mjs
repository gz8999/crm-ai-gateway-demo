import { createHash } from "node:crypto";
import { observeProviderError } from "../../decision/providerErrorObservability.mjs";
import { openAiCompatibleThinking } from "../providers/openaiCompatibleOptions.mjs";
import { validateDeepAnalysisProviderPayload } from "./deepAnalysisSafety.mjs";
import {
  TIMELINE_EXECUTIVE_CODES,
  timelineExecutiveSynthesisFacts,
} from "../../decision/timelineDigest.mjs";
import { deepAnalysisText, localizedContradictionText, localizedStakeholderText, localizedTimelineText, normalizeDeepAnalysisLocale } from "./deepAnalysisLocalization.mjs";

export const DEEP_ANALYSIS_EXTERNAL_CONTRACT = "deep-analysis-external-v1";

const SUMMARY_CODES = ["STABLE_PROGRESS", "REVIEW_REQUIRED", "HIGH_RISK_REVIEW", "GROWTH_POTENTIAL"];
const RISK_CODES = ["STALLED_PROGRESS", "FINANCIAL_VARIANCE", "DATA_CONTRADICTION", "ROUTE_REVIEW", "MULTI_RISK_REVIEW", "MEETING_PREPARATION"];
const ACTION_CODES = ["CONTINUE_MONITORING", "CONFIRM_NEXT_STEP", "RECONCILE_FACTS", "REVIEW_BUDGET_ACTUAL", "PREPARE_CUSTOMER_MEETING", "CONFIRM_ROUTE_AND_COVERAGE", "ALIGN_STAKEHOLDERS"];
const LIMITATION_CODES = ["IDENTITY_MASKED", "EXACT_AMOUNT_WITHHELD", "RAW_TIMELINE_WITHHELD", "DETERMINISTIC_SCORE_AUTHORITY", "HUMAN_REVIEW_REQUIRED"];
const CONFIDENCE_BANDS = ["HIGH", "MEDIUM", "LOW"];

export function buildDeepAnalysisSelectionSchema(evidenceTokens = [], timelinePack = {}) {
  const tokens = [...new Set(evidenceTokens)].sort();
  if (!tokens.length) throw new TypeError("Deep analysis requires request-scoped evidence tokens");
  const timelineTokens = tokens.filter((token) => token.startsWith("safeContext.timeline.content."));
  const timelineEvidenceTokens = timelineTokens.length ? timelineTokens : ["safeContext.timeline.content.none"];
  const timelineCodes = requestScopedTimelineCodes(timelinePack);
  return strictObject({
    summaryCode: enumSchema(SUMMARY_CODES),
    riskCodes: arraySchema(RISK_CODES),
    actionCodes: arraySchema(ACTION_CODES),
    evidenceTokens: arraySchema(tokens),
    timelineOverallCode: enumSchema(timelineCodes.overall),
    timelineMomentumCode: enumSchema(timelineCodes.momentum),
    timelineCustomerPositionCode: enumSchema(timelineCodes.customerPosition),
    timelineDecisionClarityCode: enumSchema(timelineCodes.decisionClarity),
    timelineStakeholderCodes: arraySchema(timelineCodes.stakeholder),
    timelineThemeCodes: arraySchema(timelineCodes.themes),
    timelineBlockerCodes: arraySchema(timelineCodes.blockers),
    timelineCommitmentCode: enumSchema(timelineCodes.commitment),
    timelineContradictionCodes: arraySchema(timelineCodes.contradictions),
    timelineOpportunityCodes: arraySchema(timelineCodes.opportunities),
    timelineManagementActionCodes: arraySchema(timelineCodes.actions),
    timelineConfidenceBand: enumSchema(timelineCodes.confidence),
    timelineCoverageBand: enumSchema(timelineCodes.confidence),
    timelineRepresentativeEvidenceTokens: arraySchema(timelineEvidenceTokens),
    timelineLimitationCodes: arraySchema(LIMITATION_CODES),
    limitationCodes: arraySchema(LIMITATION_CODES),
    confidenceBand: enumSchema(CONFIDENCE_BANDS),
  });
}

export function buildDeepAnalysisFactCatalog(payload = {}) {
  const context = payload.safeDecisionContext || {};
  const aggregate = payload.safeAccountAggregate || {};
  const specs = [
    ["safeContext.stage", "流程阶段", context.stage],
    ["safeContext.priority", "安全优先级", context.priority],
    ["safeContext.forecastCategory", "预测类别", context.forecastCategory],
    ["safeContext.relativeDateStatus", "相对时间窗口", context.relativeDateStatus],
    ["safeContext.stagnationBand", "推进状态", context.stagnationBand],
    ["safeContext.revenueBand", "收入区间", context.revenueBand],
    ["safeContext.marginBand", "毛利区间", context.marginBand],
    ["safeContext.budgetBand", "预算区间", context.budgetBand],
    ["safeContext.actualBand", "实绩区间", context.actualBand],
    ["safeContext.varianceCategory", "预算实绩偏差", context.varianceCategory],
    ["safeContext.transportMode", "运输方式", context.transportMode],
    ["safeContext.routeConsistency", "路线一致性", context.routeConsistency],
    ["safeContext.meetingWindow", "会议窗口", context.meetingWindow],
    ["safeContext.stakeholderCoverage", "关键角色覆盖", context.stakeholderCoverage],
    ["safeContext.openQuestionCount", "待确认问题数", context.openQuestionCount],
    ["safeContext.decisionReadiness", "决策准备度", context.decisionReadiness],
    ["safeContext.dataQualityCodes", "数据质量信号", context.dataQualityCodes?.length ? "存在数据质量信号" : "当前未见数据质量信号"],
    ["safeContext.contradictionCodes", "事实一致性", context.contradictionCodes?.length ? "存在事实矛盾待核对" : "当前未见事实矛盾"],
    ...timelineExecutiveSynthesisFacts(payload.timelineExecutiveAnalysisPack).map((item) => [item.evidenceToken, item.label, item.value]),
    ["safeContext.accountAggregate.serviceCoverageBand", "客户服务覆盖", aggregate.serviceCoverageBand],
    ["safeContext.accountAggregate.whitespaceCategory", "交叉销售空间", aggregate.whitespaceCategory],
    ["safeContext.accountAggregate.opportunityTrend", "商机趋势", aggregate.opportunityTrend],
    ["safeContext.accountAggregate.relationshipMaturity", "客户关系成熟度", aggregate.relationshipMaturity],
  ];
  return specs.filter(([, , value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([evidenceToken, label, value]) => ({ evidenceToken, label, value: humanizeSafeValue(String(value)) }));
}

export function buildDeepAnalysisRequest({ payload, factCatalog, env = process.env } = {}) {
  const evidenceTokens = factCatalog.map((item) => item.evidenceToken);
  const selectionSchema = buildDeepAnalysisSelectionSchema(evidenceTokens, payload.timelineExecutiveAnalysisPack);
  const safeInput = {
    templateCode: payload.templateCode,
    templateVersion: payload.templateVersion,
    responseLocale: payload.responseLocale || "zh-CN",
    safeFacts: factCatalog,
    derivedSignals: payload.derivedSignals,
    timelineExecutiveAnalysisPack: providerTimelinePack(payload.timelineExecutiveAnalysisPack),
    boundaries: ["仅使用所列安全事实", "金额只保留区间", "Timeline 只使用全量聚合后的 Executive Analysis Pack 和最多8条代表证据，不得还原或补造原文", "不要生成客户身份、精确金额、日期或外部事实", "Health Score 由确定性引擎负责"],
  };
  return {
    model: String(env.LLM_MODEL || "deepseek-v4-pro"),
    messages: [
      { role: "system", content: `Return ONLY a valid JSON object for deep-analysis selection. Never output prose, markdown, or extra keys. Locale hint: ${payload.responseLocale || "zh-CN"}.` },
      { role: "user", content: `Return deep-analysis selection JSON only from this safe input:\n${JSON.stringify(safeInput)}` },
    ],
    response_format: { type: "json_object" },
    ...openAiCompatibleThinking(env),
    temperature: 0,
    max_tokens: boundedNumber(env.LLM_DEEP_ANALYSIS_MAX_TOKENS || 2400, 2400, 800, 4000),
    stream: false,
    selectionSchema,
  };
}

export async function runDeepAnalysisExternal({ payload, requestId, env = process.env, fetchImpl = globalThis.fetch, signal } = {}) {
  const factCatalog = buildDeepAnalysisFactCatalog(payload);
  const safeValidation = validateDeepAnalysisProviderPayload({ ...payload, safeFactCatalog: factCatalog });
  if (!safeValidation.ok) return fail("safe_context_blocked", { validation: safeValidation });
  const requestBody = buildDeepAnalysisRequest({ payload, factCatalog, env });
  const requestBodyHash = sha256(JSON.stringify(requestBody));
  const requestSchemaHash = sha256(JSON.stringify(requestBody.selectionSchema));
  const baseUrl = String(env.LLM_BASE_URL || "").replace(/\/$/u, "");
  if (!baseUrl || !env.LLM_API_KEY) return fail("external_provider_not_configured", { requestBodyHash, requestSchemaHash });
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timeoutMs = boundedNumber(env.LLM_TIMEOUT_MS || 60000, 60000, 100, 60000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify(requestBody),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const errorObservation = await observeProviderError(response, { requestCorrelation: requestId, endpointAlias: "deepseek-beta", modelAlias: env.LLM_MODEL || "deepseek-v4-pro", requestSchemaHash, requestBodyHash });
      return fail(`provider_http_${response.status}`, { called: true, httpStatus: response.status, errorObservation, requestBodyHash, requestSchemaHash, latencyMs });
    }
    const rawResponse = await response.text();
    const responseBodyHash = sha256(rawResponse);
    let envelope;
    try { envelope = JSON.parse(rawResponse); } catch { return fail("provider_response_not_json", { called: true, httpStatus: response.status, responseBodyHash, requestBodyHash, requestSchemaHash, latencyMs }); }
    const choices = Array.isArray(envelope?.choices) ? envelope.choices : [];
    const message = choices[0]?.message;
    const observation = {
      httpStatus: response.status,
      modelAlias: typeof envelope?.model === "string" ? envelope.model : (env.LLM_MODEL || "deepseek-v4-pro"),
      choiceCount: choices.length,
      finishReason: choices[0]?.finish_reason || "",
      toolCallsCount: 0,
      toolCallType: "",
      functionName: "",
      argumentsType: typeof message?.content,
      argumentsLength: typeof message?.content === "string" ? message.content.length : 0,
      argumentsHash: typeof message?.content === "string" ? sha256(message.content) : "",
      responseBodyHash,
      responseId: typeof envelope?.id === "string" ? envelope.id : "",
      latencyMs,
      tokenUsage: sanitizeUsage(envelope?.usage),
    };
    if (typeof message?.content !== "string") return fail("response_content_type_invalid", { called: true, diagnosticCategory: "ARGUMENT_TYPE_INVALID", observation, requestBodyHash, requestSchemaHash });
    if (!message.content.trim()) return fail("response_content_empty", { called: true, diagnosticCategory: "ARGUMENT_EMPTY", observation, requestBodyHash, requestSchemaHash });
    let selection;
    try { selection = JSON.parse(message.content.replace(/^\uFEFF/u, "").trim()); } catch {
      return fail("response_json_invalid", { called: true, diagnosticCategory: "ARGUMENT_JSON_INVALID", observation, requestBodyHash, requestSchemaHash });
    }
    const validation = validateSelection(selection, factCatalog.map((item) => item.evidenceToken), payload.timelineExecutiveAnalysisPack);
    if (!validation.ok) return fail("argument_schema_invalid", { called: true, diagnosticCategory: "ARGUMENT_SCHEMA_INVALID", observation, validation, requestBodyHash, requestSchemaHash });
    return { ok: true, called: true, selection, factCatalog, validation, observation, requestBodyHash, requestSchemaHash, requestId };
  } catch (error) {
    return fail(error?.name === "AbortError" ? "provider_timeout" : "provider_network_error", { called: true, requestBodyHash, requestSchemaHash, latencyMs: Date.now() - started });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function validateSelection(value, evidenceTokens = [], timelinePack = {}) {
  const errors = [];
  const keys = ["summaryCode", "riskCodes", "actionCodes", "evidenceTokens", "timelineOverallCode", "timelineMomentumCode", "timelineCustomerPositionCode", "timelineDecisionClarityCode", "timelineStakeholderCodes", "timelineThemeCodes", "timelineBlockerCodes", "timelineCommitmentCode", "timelineContradictionCodes", "timelineOpportunityCodes", "timelineManagementActionCodes", "timelineConfidenceBand", "timelineCoverageBand", "timelineRepresentativeEvidenceTokens", "timelineLimitationCodes", "limitationCodes", "confidenceBand"];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, errors: ["output_not_object"] };
  if (Object.keys(value).sort().join(",") !== keys.slice().sort().join(",")) errors.push("output_shape_invalid");
  if (!SUMMARY_CODES.includes(value.summaryCode)) errors.push("summary_code_invalid");
  if (!arrayOfKnown(value.riskCodes, RISK_CODES)) errors.push("risk_code_invalid");
  if (!arrayOfKnown(value.actionCodes, ACTION_CODES) || !value.actionCodes.length) errors.push("action_code_invalid");
  if (!TIMELINE_EXECUTIVE_CODES.overall.includes(value.timelineOverallCode)) errors.push("timeline_overall_code_invalid");
  if (!TIMELINE_EXECUTIVE_CODES.momentum.includes(value.timelineMomentumCode)) errors.push("timeline_momentum_code_invalid");
  if (!TIMELINE_EXECUTIVE_CODES.customerPosition.includes(value.timelineCustomerPositionCode)) errors.push("timeline_customer_position_code_invalid");
  if (!TIMELINE_EXECUTIVE_CODES.decisionClarity.includes(value.timelineDecisionClarityCode)) errors.push("timeline_decision_clarity_code_invalid");
  if (!arrayOfKnown(value.timelineStakeholderCodes, TIMELINE_EXECUTIVE_CODES.stakeholder) || value.timelineStakeholderCodes.length > 2) errors.push("timeline_stakeholder_code_invalid");
  if (!arrayOfKnown(value.timelineThemeCodes, TIMELINE_EXECUTIVE_CODES.themes) || value.timelineThemeCodes.length > 3) errors.push("timeline_theme_code_invalid");
  if (!arrayOfKnown(value.timelineBlockerCodes, TIMELINE_EXECUTIVE_CODES.blockers) || value.timelineBlockerCodes.length > 3) errors.push("timeline_blocker_code_invalid");
  if (!TIMELINE_EXECUTIVE_CODES.commitment.includes(value.timelineCommitmentCode)) errors.push("timeline_commitment_code_invalid");
  if (!arrayOfKnown(value.timelineContradictionCodes, TIMELINE_EXECUTIVE_CODES.contradictions) || value.timelineContradictionCodes.length > 3) errors.push("timeline_contradiction_code_invalid");
  if (!arrayOfKnown(value.timelineOpportunityCodes, TIMELINE_EXECUTIVE_CODES.opportunities) || value.timelineOpportunityCodes.length > 3) errors.push("timeline_opportunity_code_invalid");
  if (!arrayOfKnown(value.timelineManagementActionCodes, TIMELINE_EXECUTIVE_CODES.actions) || value.timelineManagementActionCodes.length > 3) errors.push("timeline_management_action_code_invalid");
  if (!TIMELINE_EXECUTIVE_CODES.confidence.includes(value.timelineConfidenceBand)) errors.push("timeline_confidence_band_invalid");
  if (!TIMELINE_EXECUTIVE_CODES.confidence.includes(value.timelineCoverageBand)) errors.push("timeline_coverage_band_invalid");
  if (!arrayOfKnown(value.timelineRepresentativeEvidenceTokens, [...evidenceTokens.filter((token) => token.startsWith("safeContext.timeline.")), "safeContext.timeline.content.none"]) || value.timelineRepresentativeEvidenceTokens.length > 8) errors.push("timeline_representative_evidence_invalid");
  if (!arrayOfKnown(value.timelineLimitationCodes, LIMITATION_CODES) || value.timelineLimitationCodes.length > 5) errors.push("timeline_limitation_code_invalid");
  if (!arrayOfKnown(value.limitationCodes, LIMITATION_CODES)) errors.push("limitation_code_invalid");
  if (!CONFIDENCE_BANDS.includes(value.confidenceBand)) errors.push("confidence_band_invalid");
  if (!arrayOfKnown(value.evidenceTokens, evidenceTokens) || !value.evidenceTokens.length) errors.push("evidence_token_invalid");
  for (const key of ["riskCodes", "actionCodes", "timelineStakeholderCodes", "timelineThemeCodes", "timelineBlockerCodes", "timelineContradictionCodes", "timelineOpportunityCodes", "timelineManagementActionCodes", "timelineRepresentativeEvidenceTokens", "timelineLimitationCodes", "limitationCodes", "evidenceTokens"]) if (Array.isArray(value[key]) && new Set(value[key]).size !== value[key].length) errors.push(`${key}_duplicate`);
  const supported = timelinePack?.supportedCodes || {};
  const supportedKeyMap = { timelineThemeCodes: "themes", timelineBlockerCodes: "blockers", timelineContradictionCodes: "contradictions", timelineOpportunityCodes: "opportunities", timelineManagementActionCodes: "managementActions" };
  for (const key of Object.keys(supportedKeyMap)) {
    const supportedKey = supportedKeyMap[key];
    if (Array.isArray(value[key]) && Array.isArray(supported[supportedKey]) && value[key].some((code) => !supported[supportedKey].includes(code))) errors.push(`${key}_unsupported_by_pack`);
  }
  if (timelinePack?.overallCode && value.timelineOverallCode !== timelinePack.overallCode) errors.push("timeline_overall_not_supported_by_pack");
  if (timelinePack?.momentumTrend?.code && value.timelineMomentumCode !== timelinePack.momentumTrend.code) errors.push("timeline_momentum_not_supported_by_pack");
  if (timelinePack?.customerPosition?.code && value.timelineCustomerPositionCode !== timelinePack.customerPosition.code) errors.push("timeline_customer_position_not_supported_by_pack");
  if (timelinePack?.decisionClarity?.code && value.timelineDecisionClarityCode !== timelinePack.decisionClarity.code) errors.push("timeline_decision_clarity_not_supported_by_pack");
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function mapDeepAnalysisSelection({ selection, payload, requestId, factCatalog, observation, model = "deepseek-v4-pro" } = {}) {
  const locale = normalizeDeepAnalysisLocale(payload.responseLocale);
  const text = deepAnalysisText(locale);
  const sourceFacts = new Map(factCatalog.map((item) => [item.evidenceToken, item]));
  const allFacts = factCatalog.map((item) => ({ label: item.label, value: item.value, source: item.evidenceToken, sourceType: "crm_current" }));
  const selectedFacts = selection.evidenceTokens.map((token) => sourceFacts.get(token)).filter(Boolean).map((item) => ({ label: item.label, value: item.value, source: item.evidenceToken, sourceType: "crm_current" }));
  const timelineFacts = allFacts.filter((item) => item.source.startsWith("safeContext.timeline.executive."));
  const timelinePack = payload.timelineExecutiveAnalysisPack || {};
  const timelineContentRefs = selection.timelineRepresentativeEvidenceTokens.filter((token) => token !== "safeContext.timeline.content.none");
  const selectedRepresentativeEvidence = (timelinePack.representativeEvidence || []).filter((item) => timelineContentRefs.includes(item.evidenceToken)).slice(0, 8);
  const timelineExecutiveSynthesis = mapTimelineExecutiveSynthesis({ selection, timelinePack, timelineContentRefs, selectedRepresentativeEvidence, timelineFacts, locale });
  const riskText = selection.riskCodes.map((code) => text.risk[code]);
  const opportunityText = selection.actionCodes.includes("CONTINUE_MONITORING") ? [text.stableOpportunity] : selection.summaryCode === "GROWTH_POTENTIAL" ? [text.growthOpportunity] : [];
  const summary = text.summary[selection.summaryCode];
  const evidenceRefs = selectedFacts.map((item) => item.source);
  const actions = [...selection.actionCodes.map((code) => ({ action: text.action[code], reason: riskText[0] || summary, suggestedRole: text.pendingRole, suggestedHorizon: text.pendingHorizon, evidenceRefs, source: text.source, status: "Draft" })), ...timelineExecutiveSynthesis.managementActions.map((item) => ({ action: item.statement, reason: text.timelineActionReason, suggestedRole: text.pendingRole, suggestedHorizon: text.pendingHorizon, evidenceRefs: item.evidenceTokens, source: text.source, status: "Draft" }))];
  return {
    requestId,
    templateCode: payload.templateCode,
    templateVersion: payload.templateVersion,
    title: text.title[payload.templateCode] || text.defaultTitle,
    executiveSummary: `${summary} ${timelineExecutiveSynthesis.overallConclusion}`,
    crmFacts: selectedFacts.filter((item) => !item.source.startsWith("safeContext.timeline.")),
    timelineFacts,
    timelineFindings: [],
    timelineExecutiveSynthesis,
    timelineEvidence: selectedRepresentativeEvidence,
    customerHistoryFacts: [],
    externalFacts: [],
    internalCapabilityFacts: [],
    aiInferences: [{ label: text.inferenceLabel, statement: buildInference(payload.templateCode, selection, riskText, text), evidenceRefs }],
    risks: riskText,
    opportunities: opportunityText,
    scenarios: scenariosFor(selection.summaryCode, selection.confidenceBand, text),
    recommendedActions: actions,
    confidence: { level: confidenceText(selection.confidenceBand, text), reason: text.confidenceReason },
    limitations: [...selection.limitationCodes.map((code) => text.limitation[code]), ...timelineExecutiveSynthesis.limitations].filter((item, index, list) => list.indexOf(item) === index),
    sources: allFacts.map((item) => ({ type: item.source.startsWith("safeContext.timeline.") ? text.timelineSource : text.currentCrmSource, ref: item.source })),
    provider: { used: "openai-compatible", policy: "server-side-json-object-external", model, externalModelCalled: true },
    safety: { safeContextUsed: true, rawDataSent: false, exactAmountSentToModel: false, timelineRawTextSent: false, sanitizedTimelineEvidenceSent: timelineContentRefs.length > 0, customerIdentitySent: false, crmWritebackEnabled: false, externalLlmEnabled: true },
  };
}

function mapTimelineExecutiveSynthesis({ selection, timelinePack, timelineContentRefs, selectedRepresentativeEvidence, timelineFacts, locale }) {
  const timelineText = localizedTimelineText(locale);
  const text = deepAnalysisText(locale);
  const mapLabels = (codes, group) => codes.map((code) => ({ code, label: timelineText[group]?.[code] || code, evidenceTokens: timelineContentRefs.slice(0, 3) }));
  const supportedConfidence = selection.timelineConfidenceBand === "HIGH" && selection.timelineCoverageBand !== "HIGH" ? "MEDIUM" : selection.timelineConfidenceBand;
  return {
    overallConclusion: timelineText.overall[selection.timelineOverallCode],
    overallCode: selection.timelineOverallCode,
    momentumTrend: { code: selection.timelineMomentumCode, statement: timelineText.momentum[selection.timelineMomentumCode] },
    customerPosition: { code: selection.timelineCustomerPositionCode, statement: timelineText.customerPosition[selection.timelineCustomerPositionCode] },
    decisionClarity: { code: selection.timelineDecisionClarityCode, statement: timelineText.decisionClarity[selection.timelineDecisionClarityCode] },
    stakeholderDynamics: { code: selection.timelineStakeholderCodes[0] || "INSUFFICIENT", statement: localizedStakeholderText(selection.timelineStakeholderCodes[0], locale), roles: timelinePack.stakeholderDynamics?.roles || [] },
    keyThemes: mapLabels(selection.timelineThemeCodes.slice(0, 3), "themes"),
    topBlockers: mapLabels(selection.timelineBlockerCodes.slice(0, 3), "blockers"),
    commitmentSummary: { code: selection.timelineCommitmentCode, statement: timelineText.commitment[selection.timelineCommitmentCode], madeCount: timelinePack.commitmentSummary?.madeCount || 0, completedCount: timelinePack.commitmentSummary?.completedCount || 0, openCount: timelinePack.commitmentSummary?.openCount || 0 },
    contradictions: selection.timelineContradictionCodes.filter((code) => code !== "NONE").slice(0, 3).map((code) => ({ code, statement: localizedContradictionText(code, locale), evidenceTokens: timelineContentRefs.slice(0, 3) })),
    opportunitySignals: selection.timelineOpportunityCodes.filter((code) => code !== "NONE").slice(0, 3).map((code) => ({ code, statement: timelineText.opportunities[code], evidenceTokens: timelineContentRefs.slice(0, 3) })),
    managementActions: selection.timelineManagementActionCodes.slice(0, 3).map((code) => ({ code, statement: timelineText.actions[code], status: "Draft", evidenceTokens: timelineContentRefs.slice(0, 3) })),
    confidence: { level: confidenceText(supportedConfidence, text), reason: text.timelineConfidenceReason(timelineContentRefs.length) },
    coverage: timelinePack.coverage || { level: selection.timelineCoverageBand, activityCount: 0, eventCount: 0, representativeEvidenceCount: timelineContentRefs.length },
    representativeEvidenceTokens: timelineContentRefs,
    limitations: selection.timelineLimitationCodes.map((code) => text.limitation[code]).filter(Boolean),
    representativeEvidence: selectedRepresentativeEvidence,
    aggregateFacts: timelineFacts,
  };
}

function buildInference(templateCode, selection, risks, text) {
  const focus = text.focus[templateCode] || text.defaultTitle;
  return text.inference(focus, text.summary[selection.summaryCode], risks.join(" "), text.noExtraRisk);
}
function scenariosFor(summaryCode, confidenceBand, text) { const base = summaryCode === "HIGH_RISK_REVIEW" ? text.scenario.worsen : summaryCode === "GROWTH_POTENTIAL" ? text.scenario.improve : text.scenario.stable; return [{ name: text.scenario.baseline, direction: base, summary: text.scenario.baselineText }, { name: text.scenario.optimistic, direction: text.scenario.improve, summary: text.scenario.optimisticText }, { name: text.scenario.risk, direction: text.scenario.worsen, summary: text.scenario.riskText(confidenceText(confidenceBand, text)) }]; }
function confidenceText(value, text) { return text.confidence[value] || text.confidence.MEDIUM; }
function strictObject(properties) { return { type: "object", properties, required: Object.keys(properties), additionalProperties: false }; }
function enumSchema(values) { return { type: "string", enum: [...values] }; }
function arraySchema(values) { return { type: "array", items: enumSchema(values) }; }
function requestScopedTimelineCodes(pack = {}) {
  const supported = pack?.supportedCodes || {};
  const scalar = (value, allowed) => typeof value === "string" && allowed.includes(value) ? [value] : allowed;
  const codesFrom = (value) => Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : item?.code).filter((item) => typeof item === "string") : [];
  const list = (primary, fallback, allowed) => {
    const values = [...new Set(codesFrom(primary))].filter((item) => allowed.includes(item));
    if (values.length) return values.slice(0, 3);
    const fallbackValues = [...new Set(codesFrom(fallback))].filter((item) => allowed.includes(item));
    return fallbackValues.length ? fallbackValues.slice(0, 3) : allowed;
  };
  return {
    overall: scalar(pack?.overallCode, TIMELINE_EXECUTIVE_CODES.overall),
    momentum: scalar(pack?.momentumTrend?.code, TIMELINE_EXECUTIVE_CODES.momentum),
    customerPosition: scalar(pack?.customerPosition?.code, TIMELINE_EXECUTIVE_CODES.customerPosition),
    decisionClarity: scalar(pack?.decisionClarity?.code, TIMELINE_EXECUTIVE_CODES.decisionClarity),
    stakeholder: scalar(pack?.stakeholderDynamics?.code, TIMELINE_EXECUTIVE_CODES.stakeholder),
    themes: list(pack?.keyThemes, supported.themes, TIMELINE_EXECUTIVE_CODES.themes),
    blockers: list(pack?.topBlockers, supported.blockers, TIMELINE_EXECUTIVE_CODES.blockers),
    commitment: scalar(pack?.commitmentSummary?.code, TIMELINE_EXECUTIVE_CODES.commitment),
    contradictions: list(pack?.contradictions, supported.contradictions, TIMELINE_EXECUTIVE_CODES.contradictions),
    opportunities: list(pack?.opportunitySignals, supported.opportunities, TIMELINE_EXECUTIVE_CODES.opportunities),
    actions: list(pack?.managementActions, supported.managementActions, TIMELINE_EXECUTIVE_CODES.actions),
    confidence: TIMELINE_EXECUTIVE_CODES.confidence,
  };
}
function arrayOfKnown(value, allowed) { return Array.isArray(value) && value.every((item) => allowed.includes(item)); }
function humanizeSafeValue(value) { return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase()); }
function sha256(value) { return createHash("sha256").update(String(value), "utf8").digest("hex"); }
function sanitizeUsage(value) { if (!value || typeof value !== "object") return null; const keys = ["prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens"]; const output = Object.fromEntries(keys.filter((key) => Number.isFinite(Number(value[key]))).map((key) => [key, Number(value[key])])); return Object.keys(output).length ? output : null; }
function boundedNumber(value, fallback, min, max) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback; }
function fail(reason, extra = {}) { return { ok: false, ...extra, reason }; }

function providerTimelinePack(pack = {}) {
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) return null;
  const representativeEvidence = Array.isArray(pack.representativeEvidence) ? pack.representativeEvidence.slice(0, 8).map((item) => ({
    evidenceToken: item.evidenceToken,
    relativeTime: item.relativeTime,
    activityType: item.activityType,
    summary: item.summary,
    supports: Array.isArray(item.supports) ? item.supports.slice(0, 3) : [],
  })) : [];
  return {
    overallCode: pack.overallCode,
    overallConclusion: pack.overallConclusion,
    momentumTrend: pack.momentumTrend,
    customerPosition: pack.customerPosition,
    decisionClarity: pack.decisionClarity,
    stakeholderDynamics: pack.stakeholderDynamics,
    keyThemes: Array.isArray(pack.keyThemes) ? pack.keyThemes.slice(0, 3) : [],
    topBlockers: Array.isArray(pack.topBlockers) ? pack.topBlockers.slice(0, 3) : [],
    commitmentSummary: pack.commitmentSummary,
    contradictions: Array.isArray(pack.contradictions) ? pack.contradictions.slice(0, 3) : [],
    opportunitySignals: Array.isArray(pack.opportunitySignals) ? pack.opportunitySignals.slice(0, 3) : [],
    managementActions: Array.isArray(pack.managementActions) ? pack.managementActions.slice(0, 3) : [],
    confidence: pack.confidence,
    coverage: pack.coverage,
    representativeEvidenceTokens: Array.isArray(pack.representativeEvidenceTokens) ? pack.representativeEvidenceTokens.slice(0, 8) : [],
    representativeEvidence,
    limitations: Array.isArray(pack.limitations) ? pack.limitations.slice(0, 5) : [],
    supportedCodes: pack.supportedCodes,
  };
}
