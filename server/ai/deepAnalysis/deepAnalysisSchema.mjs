export const DEEP_ANALYSIS_SCHEMA_VERSION = "deep-analysis-output-v1";

export const deepAnalysisOutputSchema = Object.freeze({
  version: DEEP_ANALYSIS_SCHEMA_VERSION,
  required: ["requestId", "templateCode", "templateVersion", "title", "executiveSummary", "crmFacts", "timelineFacts", "timelineFindings", "timelineExecutiveSynthesis", "timelineEvidence", "customerHistoryFacts", "externalFacts", "internalCapabilityFacts", "aiInferences", "risks", "opportunities", "scenarios", "recommendedActions", "confidence", "limitations", "sources", "provider", "safety"],
});

const INFERENCE_LABELS = ["AI 推断，不是 CRM 事实", "外部模型推断，不是 CRM 事实", "External-model inference, not a CRM fact", "外部モデルの推論であり、CRM事実ではありません"];
const SCENARIO_NAMES = ["基准情景", "乐观情景", "风险情景", "Baseline scenario", "Upside scenario", "Risk scenario", "基準シナリオ", "楽観シナリオ", "リスクシナリオ"];
const SCENARIO_DIRECTIONS = ["低", "中", "中高", "高", "改善", "稳定", "恶化", "Stable", "Improving", "Deteriorating", "安定", "悪化"];
const CONFIDENCE_LEVELS = ["高", "中", "低", "High", "Medium", "Low"];
const ACTION_ROLES = ["待人工指定", "To be assigned by a person", "人手で指定"];
const ACTION_SOURCES = ["AI 推断", "外部模型推断", "External-model inference", "外部モデル推論"];

const SAFE_OUTPUT_VALIDATION_REASONS = new Set([
  "output_not_object",
  "invalid_identity",
  "unavailable_facts_must_be_empty",
  "invalid_crm_fact",
  "invalid_timeline_fact",
  "deprecated_timeline_findings_must_be_empty",
  "invalid_timeline_evidence",
  "invalid_timeline_executive_synthesis",
  "invalid_ai_inference",
  "invalid_scenario",
  "invalid_action",
  "invalid_confidence",
  "invalid_provider",
  "invalid_safety",
  "invalid_high_fidelity_safety",
  "external_provider_safety_missing",
  "demo_provider_safety_invalid",
]);

const SAFE_OUTPUT_VALIDATION_KEYS = new Set([
  ...deepAnalysisOutputSchema.required,
  "crmFacts",
  "timelineFacts",
  "timelineFindings",
  "timelineEvidence",
  "customerHistoryFacts",
  "externalFacts",
  "internalCapabilityFacts",
  "aiInferences",
  "risks",
  "opportunities",
  "scenarios",
  "recommendedActions",
  "limitations",
  "sources",
]);

export function publicDeepAnalysisOutputValidationReason(validation) {
  const reason = typeof validation?.reason === "string" ? validation.reason : "";
  if (SAFE_OUTPUT_VALIDATION_REASONS.has(reason)) return reason;
  for (const prefix of ["missing_", "invalid_"]) {
    if (reason.startsWith(prefix) && SAFE_OUTPUT_VALIDATION_KEYS.has(reason.slice(prefix.length))) return reason;
  }
  return "output_contract_invalid";
}

export function validateDeepAnalysisOutput(value) {
  if (!isRecord(value)) return fail("output_not_object");
  for (const key of deepAnalysisOutputSchema.required) if (!Object.hasOwn(value, key)) return fail(`missing_${key}`);
  if (!text(value.requestId) || !/^DA-0[1-9]$/.test(value.templateCode) || !text(value.templateVersion) || !text(value.title) || !text(value.executiveSummary)) return fail("invalid_identity");
  for (const key of ["crmFacts", "timelineFacts", "timelineFindings", "timelineEvidence", "customerHistoryFacts", "externalFacts", "internalCapabilityFacts", "aiInferences", "risks", "opportunities", "scenarios", "recommendedActions", "limitations", "sources"]) if (!Array.isArray(value[key])) return fail(`invalid_${key}`);
  if (value.customerHistoryFacts.length || value.externalFacts.length || value.internalCapabilityFacts.length) return fail("unavailable_facts_must_be_empty");
  if (!value.crmFacts.every((item) => fact(item, "crm_current"))) return fail("invalid_crm_fact");
  const highFidelity = value.safety?.analysisContextMode === "high_fidelity_identity_redacted";
  if (!value.timelineFacts.every((item) => fact(item, "crm_current") && (highFidelity ? item.source.startsWith("highFidelity.timeline.") : item.source.startsWith("safeContext.timeline.executive.")))) return fail("invalid_timeline_fact");
  if (value.timelineFindings.length) return fail("deprecated_timeline_findings_must_be_empty");
  if (value.timelineEvidence.length > 8 || !value.timelineEvidence.every((item) => isRecord(item) && text(item.evidenceToken) && text(item.relativeTime) && text(item.activityType) && text(item.summary) && Array.isArray(item.supports))) return fail("invalid_timeline_evidence");
  if (!validateTimelineSynthesis(value.timelineExecutiveSynthesis)) return fail("invalid_timeline_executive_synthesis");
  if (!value.aiInferences.every((item) => isRecord(item) && INFERENCE_LABELS.includes(item.label) && text(item.statement) && Array.isArray(item.evidenceRefs))) return fail("invalid_ai_inference");
  if (!value.scenarios.every((item) => isRecord(item) && SCENARIO_NAMES.includes(item.name) && SCENARIO_DIRECTIONS.includes(item.direction) && text(item.summary))) return fail("invalid_scenario");
  if (!value.recommendedActions.every(action)) return fail("invalid_action");
  if (!isRecord(value.confidence) || !CONFIDENCE_LEVELS.includes(value.confidence.level) || !text(value.confidence.reason)) return fail("invalid_confidence");
  if (!isRecord(value.provider) || !["demo", "openai-compatible"].includes(value.provider.used) || value.provider.externalModelCalled !== (value.provider.used === "openai-compatible")) return fail("invalid_provider");
  if (!isRecord(value.safety) || value.safety.safeContextUsed !== true || value.safety.customerIdentitySent !== false || value.safety.crmWritebackEnabled !== false) return fail("invalid_safety");
  if (highFidelity) {
    if (value.safety.crmBusinessTextIncluded !== true || value.safety.timelineBusinessTextIncluded !== true || value.safety.exactAmountIncluded !== true || value.safety.exactDateIncluded !== true || value.safety.routeAndCommercialTermsIncluded !== true || value.safety.customerCompanyMasked !== true || value.safety.customerContactMasked !== true || value.safety.rawUnredactedCustomerIdentitySent !== false || value.safety.identityRedactedBusinessTextSent !== true) return fail("invalid_high_fidelity_safety");
  } else if (value.safety.rawDataSent !== false || value.safety.exactAmountSentToModel !== false || value.safety.timelineRawTextSent !== false) return fail("invalid_safety");
  if (value.provider.used === "openai-compatible" && value.safety.externalLlmEnabled !== true) return fail("external_provider_safety_missing");
  if (value.provider.used === "demo" && value.safety.externalLlmEnabled !== false) return fail("demo_provider_safety_invalid");
  return { ok: true, status: "pass", schemaVersion: DEEP_ANALYSIS_SCHEMA_VERSION };
}

function fact(item, sourceType) { return isRecord(item) && text(item.label) && text(item.value) && text(item.source) && item.sourceType === sourceType; }
function action(item) { return isRecord(item) && text(item.action) && text(item.reason) && ACTION_ROLES.includes(item.suggestedRole) && text(item.suggestedHorizon) && /(?:非 CRM 正式期限|not a CRM due date|CRM正式期限ではありません)/u.test(item.suggestedHorizon) && Array.isArray(item.evidenceRefs) && ACTION_SOURCES.includes(item.source) && ["仅草案", "Draft"].includes(item.status); }
function validateTimelineSynthesis(value) {
  if (!isRecord(value) || !text(value.overallConclusion) || !isRecord(value.momentumTrend) || !text(value.momentumTrend.statement) || !isRecord(value.customerPosition) || !text(value.customerPosition.statement) || !isRecord(value.decisionClarity) || !text(value.decisionClarity.statement) || !isRecord(value.stakeholderDynamics) || !text(value.stakeholderDynamics.statement)) return false;
  if (!Array.isArray(value.keyThemes) || value.keyThemes.length > 3 || !value.keyThemes.every(synthesisItem)) return false;
  if (!Array.isArray(value.topBlockers) || value.topBlockers.length > 3 || !value.topBlockers.every(synthesisItem)) return false;
  if (!isRecord(value.commitmentSummary) || !text(value.commitmentSummary.statement)) return false;
  if (!Array.isArray(value.contradictions) || value.contradictions.length > 3 || !value.contradictions.every(synthesisItem)) return false;
  if (!Array.isArray(value.opportunitySignals) || value.opportunitySignals.length > 3 || !value.opportunitySignals.every(synthesisItem)) return false;
  if (!Array.isArray(value.managementActions) || value.managementActions.length > 3 || !value.managementActions.every((item) => synthesisItem(item) && item.status === "Draft")) return false;
  if (!isRecord(value.confidence) || !text(value.confidence.level) || !text(value.confidence.reason) || !isRecord(value.coverage) || !text(value.coverage.level) || !Array.isArray(value.representativeEvidenceTokens) || value.representativeEvidenceTokens.length > 8 || !Array.isArray(value.limitations)) return false;
  return true;
}
function synthesisItem(item) { return isRecord(item) && text(item.code) && text(item.label || item.statement) && Array.isArray(item.evidenceTokens); }
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function text(value) { return typeof value === "string" && value.length > 0 && value.length <= 3000; }
function fail(reason) { return { ok: false, status: "invalid_schema", reason, schemaVersion: DEEP_ANALYSIS_SCHEMA_VERSION }; }
