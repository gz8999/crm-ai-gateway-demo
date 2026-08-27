import { createHash } from "node:crypto";

export const R5B8_HISTORICAL_EVIDENCE_RULES = Object.freeze([
  "facts.reference_allowed_evidence_token",
  "evidence.reference_allowed_evidence_token",
  "inferences.reference_allowed_evidence_tokens",
]);

export const STRUCTURED_ACTION_EVIDENCE_RULES_V1 = Object.freeze([
  ...R5B8_HISTORICAL_EVIDENCE_RULES,
  "recommendedActions.evidenceTokens.required",
  "recommendedActions.evidenceTokens.reference_allowed_evidence_tokens",
]);

export function validateR5B8HistoricalEvidence(output, evidenceTokens = []) {
  const allowed = new Set(evidenceTokens);
  const errors = [];
  for (const fact of output?.facts || []) if (!allowed.has(fact?.evidenceToken)) errors.push("fact_evidence_invalid");
  for (const evidence of output?.evidence || []) if (!allowed.has(evidence?.evidenceToken)) errors.push("evidence_reference_invalid");
  for (const inference of output?.inferences || []) {
    if (!Array.isArray(inference?.evidenceTokens) || inference.evidenceTokens.some((token) => !allowed.has(token))) errors.push("inference_evidence_invalid");
  }
  return evidenceResult("r5b8-historical", R5B8_HISTORICAL_EVIDENCE_RULES, errors);
}

export function validateStructuredActionEvidenceV1(output, evidenceTokens = []) {
  const historical = validateR5B8HistoricalEvidence(output, evidenceTokens);
  const allowed = new Set(evidenceTokens);
  const errors = [...historical.errors];
  for (const action of output?.recommendedActions || []) {
    if (!Array.isArray(action?.evidenceTokens) || action.evidenceTokens.length === 0) errors.push("action_evidence_required");
    else {
      if (new Set(action.evidenceTokens).size !== action.evidenceTokens.length) errors.push("action_evidence_duplicate");
      if (action.evidenceTokens.some((token) => !allowed.has(token))) errors.push("action_evidence_invalid");
    }
  }
  return evidenceResult("structured-action-v1", STRUCTURED_ACTION_EVIDENCE_RULES_V1, errors);
}

export function compareEvidenceValidationProfiles(output, evidenceTokens = []) {
  return {
    historicalControl: validateR5B8HistoricalEvidence(output, evidenceTokens),
    structuredAction: validateStructuredActionEvidenceV1(output, evidenceTokens),
  };
}

export function evidenceValidationProfileHash(rules) {
  return createHash("sha256").update(JSON.stringify([...rules])).digest("hex");
}

function evidenceResult(profile, rules, errors) {
  return {
    profile,
    profileHash: evidenceValidationProfileHash(rules),
    ready: errors.length === 0,
    errors: [...new Set(errors)],
  };
}
