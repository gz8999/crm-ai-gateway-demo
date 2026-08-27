import { createHash } from "node:crypto";

export const EXTERNAL_MODEL_REQUEST_VERSION = "External Model Request Contract v1";
export const EXTERNAL_MODEL_RESPONSE_VERSION = "Decision Pack Model Response v1";

export const externalModelJsonSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["facts", "inferences", "evidence", "confidence", "recommendedActions", "priority", "riskCategories", "provider", "model", "modelVersion", "fallback", "safety", "limitations"],
  properties: {
    facts: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["label", "value", "evidenceToken"], properties: { label: { type: "string" }, value: { type: "string" }, evidenceToken: { type: "string" } } } },
    inferences: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["inference", "evidenceTokens"], properties: { inference: { type: "string" }, evidenceTokens: { type: "array", minItems: 1, items: { type: "string" } } } } },
    evidence: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["evidenceToken", "value"], properties: { evidenceToken: { type: "string" }, value: { type: "string" } } } },
    confidence: { type: "object", additionalProperties: false, required: ["level", "reason"], properties: { level: { enum: ["High", "Medium", "Low"] }, reason: { type: "string" } } },
    recommendedActions: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", additionalProperties: false, required: ["action", "ownerRole", "dueWindow", "basis", "status"], properties: { action: { type: "string" }, ownerRole: { type: "string" }, dueWindow: { type: "string" }, basis: { type: "string" }, status: { const: "Draft only" } } } },
    priority: { enum: ["Critical", "High", "Medium", "Low", "Monitor"] },
    riskCategories: { type: "array", items: { type: "string" } },
    provider: { type: "string" },
    model: { type: "string" },
    modelVersion: { type: "string" },
    fallback: { anyOf: [{ type: "object", additionalProperties: false }, { type: "null" }] },
    safety: { type: "object", additionalProperties: false, required: ["customerIdentityMasked", "exactAmountSentToModel", "rawTimelineSent", "crmWritebackEnabled"], properties: { customerIdentityMasked: { const: true }, exactAmountSentToModel: { const: false }, rawTimelineSent: { const: false }, crmWritebackEnabled: { const: false } } },
    limitations: { type: "array", items: { type: "string" } },
  },
});

const FORBIDDEN_KEYS = Object.freeze([
  "customerName", "contactName", "email", "phone", "guid", "exactRevenue", "exactGp", "rawTimeline", "rawOpportunityClose", "contractText", "userIdentity", "teamIdentity", "scenarioId", "goldenMetadata", "expectedAnswer", "credentials", "authorization",
]);

export function buildExternalModelRequest({ safeContext, accountAggregate, healthScore, page, requestId = "not-issued" } = {}) {
  const evidenceTokens = (healthScore?.evidence || []).map((item) => item.source).filter((source) => typeof source === "string");
  const request = {
    contractVersion: EXTERNAL_MODEL_REQUEST_VERSION,
    requestId,
    page: String(page || "decision"),
    safeContext: {
      opportunityToken: safeContext?.opportunityToken,
      customerToken: safeContext?.customerToken,
      accountToken: safeContext?.accountToken,
      department: safeContext?.salesDepartment,
      state: safeContext?.opportunityState,
      stage: safeContext?.stage,
      priority: safeContext?.priority,
      stagnationBand: safeContext?.stagnationBand,
      dataQualityCodes: safeContext?.dataQualityCodes || [],
      varianceCategory: safeContext?.varianceCategory,
      decisionReadiness: safeContext?.decisionReadiness,
      amountBand: safeContext?.amountBand,
      marginBand: safeContext?.marginBand,
      budgetActualDeviationBand: safeContext?.varianceCategory,
      relativeDate: safeContext?.relativeDateStatus,
      timelineSummary: { signalCount: safeContext?.timelineSignalCount, meetingWindow: safeContext?.meetingWindow },
      interactionSignal: { stakeholderCoverage: safeContext?.stakeholderCoverage, openQuestionCount: safeContext?.openQuestionCount, decisionReadiness: safeContext?.decisionReadiness, routeConsistency: safeContext?.routeConsistency },
      coverageStatus: safeContext?.coverageCategory,
      evidenceTokens: [...new Set(evidenceTokens)].sort(),
      deterministicHealthComponents: healthScore ? { version: healthScore.version, healthScore: healthScore.healthScore, grade: healthScore.grade, dimensions: healthScore.dimensions } : null,
      dataQualitySignals: { missingCodes: safeContext?.missingCodes || [], contradictionCodes: safeContext?.contradictionCodes || [], dataQualityStatus: healthScore?.dataQualityStatus || "unknown" },
    },
    accountAggregate: accountAggregate ? { serviceCoverageBand: accountAggregate.serviceCoverageBand, whitespaceCategory: accountAggregate.whitespaceCategory, opportunityTrend: accountAggregate.opportunityTrend, relationshipMaturity: accountAggregate.relationshipMaturity } : null,
    safety: { customerIdentityMasked: true, exactAmountSentToModel: false, rawTimelineSent: false, crmWritebackEnabled: false },
    outputContract: EXTERNAL_MODEL_RESPONSE_VERSION,
  };
  const safety = validateExternalModelRequest(request);
  if (!safety.ok) throw new TypeError(`External model request rejected: ${safety.reason}`);
  return request;
}

export function validateExternalModelRequest(value) {
  const serialized = JSON.stringify(value || {});
  const forbiddenKey = FORBIDDEN_KEYS.find((key) => serializedKey(value, key));
  if (forbiddenKey) return { ok: false, reason: `forbidden_key:${forbiddenKey}` };
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(serialized)) return { ok: false, reason: "dataverse_guid" };
  if (/(?:estimatedvalue|actualvalue|annualactualrevenue|annualbudgetrevenue|exactamount)"?\s*:\s*\d/i.test(serialized)) return { ok: false, reason: "exact_amount" };
  if (/(?:\bnotetext\b|\bannotationtext\b|\btimelinebody\b|"rawTimeline"\s*:|"rawOpportunityClose"\s*:)/i.test(serialized)) return { ok: false, reason: "raw_timeline_or_close" };
  if (value?.safety?.customerIdentityMasked !== true || value?.safety?.exactAmountSentToModel !== false || value?.safety?.rawTimelineSent !== false || value?.safety?.crmWritebackEnabled !== false) return { ok: false, reason: "safety_flags" };
  return { ok: true, reason: "" };
}

export function validateExternalModelResponse(value, { evidenceTokens = [] } = {}) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) errors.push("object");
  for (const key of ["facts", "inferences", "evidence", "confidence", "recommendedActions", "priority", "riskCategories", "provider", "model", "modelVersion", "fallback", "safety", "limitations"]) if (!Object.hasOwn(value || {}, key)) errors.push(`missing:${key}`);
  if (!Array.isArray(value?.facts) || !value.facts.length) errors.push("facts");
  if (!Array.isArray(value?.inferences) || !value.inferences.length) errors.push("inferences");
  if (!Array.isArray(value?.evidence) || !value.evidence.length) errors.push("evidence");
  if (!Array.isArray(value?.recommendedActions) || !value.recommendedActions.length) errors.push("recommendedActions");
  if (!value?.confidence || !["High", "Medium", "Low"].includes(value.confidence.level)) errors.push("confidence");
  const allowedEvidence = new Set(evidenceTokens);
  for (const fact of value?.facts || []) if (!fact?.evidenceToken || !allowedEvidence.has(fact.evidenceToken)) errors.push("fact:evidence");
  for (const evidence of value?.evidence || []) if (!evidence?.evidenceToken || !allowedEvidence.has(evidence.evidenceToken)) errors.push("evidence:source");
  for (const action of value?.recommendedActions || []) if (!action?.action || !action?.ownerRole || !action?.dueWindow || !action?.basis || action?.status !== "Draft only") errors.push("action:contract");
  if (Object.keys(value || {}).some((key) => !Object.hasOwn(externalModelJsonSchema.properties, key))) errors.push("additional_properties");
  if (value?.safety?.customerIdentityMasked !== true || value?.safety?.exactAmountSentToModel !== false || value?.safety?.rawTimelineSent !== false || value?.safety?.crmWritebackEnabled !== false) errors.push("safety:flags");
  const safety = validateExternalModelRequest({ ...value, safety: value?.safety });
  if (!safety.ok) errors.push(`safety:${safety.reason}`);
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function requestHash(request) { return createHash("sha256").update(canonicalJson(request)).digest("hex"); }
export function canonicalJson(value) { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function serializedKey(value, key) { if (!value || typeof value !== "object") return false; return Object.entries(value).some(([entryKey, child]) => entryKey.toLowerCase() === key.toLowerCase() || serializedKey(child, key)); }
