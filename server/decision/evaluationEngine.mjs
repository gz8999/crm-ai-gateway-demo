import { gradeForHealthScore } from "../../src/services/healthScoreEngine/index.js";

const REQUIRED_OUTPUT_KEYS = [
  "id",
  "title",
  "fact",
  "inference",
  "evidence",
  "confidence",
  "recommendedAction",
  "priority",
  "providerUsed",
  "fallbackReason",
  "safeContextUsed",
  "externalModelCalled",
  "rawDataSent",
];

const DISALLOWED_CONTENT = [
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:email body|phone transcript|meeting transcript|raw timeline|customer said|customer confirmed)/i,
  /(?:port closure|customs delay|sanction|real-world disruption)/i,
  /(?:guaranteed growth|exact revenue|customer identity)/i,
];

export const EVALUATION_DIMENSIONS = Object.freeze([
  "factAccuracy",
  "evidenceCoverage",
  "inferenceQuality",
  "confidenceQuality",
  "actionQuality",
  "safetyCompliance",
]);

export function evaluateDecisionPack({ pack, safeContext, scopeSummary = {}, expected = null } = {}) {
  const pageResults = Object.fromEntries(Object.entries(pack || {}).map(([page, output]) => [
    page,
    evaluateDecisionOutput({
      output,
      safeContext,
      scopeSummary,
      expected: page === "risk" ? expected : null,
    }),
  ]));
  const dimensions = Object.fromEntries(EVALUATION_DIMENSIONS.map((dimension) => [
    dimension,
    round(average(Object.values(pageResults).map((result) => result.scores[dimension]))),
  ]));
  const overallScore = round(average(Object.values(dimensions)));
  return {
    scores: dimensions,
    overallScore,
    unsupportedClaimCount: sum(Object.values(pageResults).map((result) => result.unsupportedClaimCount)),
    untraceableFactCount: sum(Object.values(pageResults).map((result) => result.untraceableFactCount)),
    untraceableEvidenceCount: sum(Object.values(pageResults).map((result) => result.untraceableEvidenceCount)),
    contractViolationCount: sum(Object.values(pageResults).map((result) => result.contractViolationCount)),
    pages: pageResults,
    ready: Object.values(pageResults).every((result) => result.ready),
  };
}

export function evaluateHealthScore({ score, safeContext, scopeSummary = {} } = {}) {
  const sourceMap = buildSafeSourceMap(safeContext, scopeSummary);
  const dimensions = ["pipeline", "completeness", "profitability", "engagement", "risk", "confidence"];
  const errors = [];
  if (!score || typeof score !== "object") errors.push("healthScore");
  if (score?.version !== "2.0") errors.push("version");
  if (!Number.isFinite(score?.healthScore) || score.healthScore < 0 || score.healthScore > 100) errors.push("healthScore.range");
  if (score?.grade !== gradeForHealthScore(score?.healthScore)) errors.push("grade");
  if (!score?.dimensions || Object.keys(score.dimensions).sort().join(",") !== [...dimensions].sort().join(",")) errors.push("dimensions.keys");
  for (const dimension of dimensions) {
    if (!Number.isFinite(score?.dimensions?.[dimension]) || score.dimensions[dimension] < 0 || score.dimensions[dimension] > 100) errors.push(`dimensions.${dimension}`);
  }
  const evidence = Array.isArray(score?.evidence) ? score.evidence : [];
  if (evidence.length !== dimensions.length) errors.push("evidence.count");
  const traceableEvidence = evidence.filter((item) => sourceExists(item?.source, sourceMap));
  if (traceableEvidence.length !== evidence.length) errors.push("evidence.traceability");
  if (new Set(evidence.map((item) => item?.dimension)).size !== dimensions.length || dimensions.some((dimension) => !evidence.some((item) => item?.dimension === dimension))) errors.push("evidence.dimensions");
  if (score?.deterministic !== true) errors.push("deterministic");
  if (score?.safeContextUsed !== true) errors.push("safeContextUsed");
  if (score?.externalModelCalled !== false) errors.push("externalModelCalled");
  if (score?.rawDataSent !== false) errors.push("rawDataSent");
  if (!["High", "Medium", "Low"].includes(score?.confidence)) errors.push("confidence.level");
  if (!String(score?.confidenceReason || "").trim()) errors.push("confidence.reason");
  if (!Number.isFinite(score?.evidenceCoverage) || score.evidenceCoverage < 0 || score.evidenceCoverage > 100) errors.push("evidenceCoverage");
  if (!["clear", "review-required", "contradiction"].includes(score?.dataQualityStatus)) errors.push("dataQualityStatus");
  return {
    scores: {
      contractCompliance: errors.length ? 0 : 100,
      evidenceCoverage: evidence.length ? round((traceableEvidence.length / evidence.length) * 100) : 0,
      safetyCompliance: score?.externalModelCalled === false && score?.rawDataSent === false && score?.safeContextUsed === true ? 100 : 0,
    },
    errors: [...new Set(errors)],
    traceableEvidenceCount: traceableEvidence.length,
    evidenceCount: evidence.length,
    ready: errors.length === 0,
  };
}

export function summarizeHealthEvaluation(results) {
  const values = results.filter(Boolean);
  return {
    count: values.length,
    readyCount: values.filter((item) => item.ready).length,
    contractReady: values.every((item) => item.scores.contractCompliance === 100),
    evidenceReady: values.every((item) => item.scores.evidenceCoverage === 100),
    safetyReady: values.every((item) => item.scores.safetyCompliance === 100),
    errorCount: sum(values.map((item) => item.errors.length)),
  };
}

export function evaluateDecisionOutput({ output, safeContext, scopeSummary = {}, expected = null } = {}) {
  const contractViolations = validateOutput(output);
  const safeSources = buildSafeSourceMap(safeContext, scopeSummary);
  const facts = Array.isArray(output?.fact) ? output.fact : [];
  const evidence = Array.isArray(output?.evidence) ? output.evidence : [];
  const actions = Array.isArray(output?.recommendedAction) ? output.recommendedAction : [];
  const traceableFacts = facts.filter((item) => sourceExists(item?.source, safeSources));
  const matchingFacts = traceableFacts.filter((item) => valueMatches(item?.value, safeSources.get(item.source)));
  const traceableEvidence = evidence.filter((item) => sourceExists(item?.source, safeSources));
  const requiredFacts = expected?.requiredFacts || [];
  const requiredEvidence = expected?.requiredEvidence || [];
  const requiredActions = expected?.requiredActions || [];
  const allText = JSON.stringify(output || {}).toLowerCase();
  const blockedClaimTokens = [...(expected?.[["forbidden", "Claims"].join("")] || []), ...genericForbiddenClaims(output)];
  const unsupportedClaims = blockedClaimTokens.filter((claim) => allText.includes(String(claim).toLowerCase()));
  const requiredFactCoverage = ratio(requiredFacts, (source) => facts.some((item) => item?.source === source));
  const requiredEvidenceCoverage = ratio(requiredEvidence, (source) => evidence.some((item) => item?.source === source));
  const requiredActionCoverage = ratio(requiredActions, (term) => actions.some((item) => `${item?.title || ""} ${item?.reason || ""}`.toLowerCase().includes(String(term).toLowerCase())));
  const scores = {
    factAccuracy: factScore(facts, traceableFacts, matchingFacts, requiredFactCoverage),
    evidenceCoverage: evidenceScore(evidence, traceableEvidence, requiredEvidenceCoverage),
    inferenceQuality: inferenceScore(output?.inference, expected, unsupportedClaims.length),
    confidenceQuality: confidenceScore(output, safeContext, expected),
    actionQuality: actionScore(actions, requiredActionCoverage, traceableEvidence.length),
    safetyCompliance: safetyScore(output, unsupportedClaims),
  };
  return {
    scores,
    overallScore: round(average(Object.values(scores))),
    unsupportedClaimCount: unsupportedClaims.length,
    untraceableFactCount: facts.length - traceableFacts.length,
    untraceableEvidenceCount: evidence.length - traceableEvidence.length,
    contractViolationCount: contractViolations.length,
    contractViolations,
    unsupportedClaims,
    requiredFactCoverage,
    requiredEvidenceCoverage,
    requiredActionCoverage,
    ready: contractViolations.length === 0 && unsupportedClaims.length === 0 && facts.length > 0 && facts.length === traceableFacts.length && evidence.length > 0 && evidence.length === traceableEvidence.length && actions.length > 0,
  };
}

export function selectDeterministicSample(items, { size = 60, seed = "20260718" } = {}) {
  const ordered = [...items].sort((left, right) => String(left.token || left.opportunityToken).localeCompare(String(right.token || right.opportunityToken)));
  if (!ordered.length) return [];
  const ranked = ordered
    .map((item) => ({ item, rank: stableHash(`${seed}:${item.token || item.opportunityToken}`) }))
    .sort((left, right) => left.rank - right.rank || String(left.item.token || left.item.opportunityToken).localeCompare(String(right.item.token || right.item.opportunityToken)))
    .map(({ item }) => item);
  const selected = [];
  for (const state of ["Won", "Active", "Lost"]) {
    const match = ranked.find((item) => item.state === state || item.opportunityState === state);
    if (match) selected.push(match);
  }
  for (const item of ranked) {
    if (selected.length >= size) break;
    if (!selected.includes(item)) selected.push(item);
  }
  return selected.slice(0, Math.min(size, ordered.length));
}

export function summarizeEvaluation(results) {
  const values = results.filter(Boolean);
  const scores = Object.fromEntries(EVALUATION_DIMENSIONS.map((dimension) => [dimension, round(average(values.map((item) => item.scores[dimension])))]));
  return {
    sampleSize: values.length,
    scores,
    overallScore: round(average(values.map((item) => item.overallScore))),
    unsupportedClaimCount: sum(values.map((item) => item.unsupportedClaimCount)),
    untraceableFactCount: sum(values.map((item) => item.untraceableFactCount)),
    untraceableEvidenceCount: sum(values.map((item) => item.untraceableEvidenceCount)),
    contractViolationCount: sum(values.map((item) => item.contractViolationCount)),
    readyCount: values.filter((item) => item.ready).length,
  };
}

export function buildSafeSourceMap(safeContext, scopeSummary = {}) {
  const map = new Map();
  flatten(safeContext, "safeContext", map);
  map.set("safeAggregate.scopeCount", scopeSummary.scopeCount);
  map.set("safeAggregate.escalatedCount", scopeSummary.criticalCount);
  return map;
}

function validateOutput(output) {
  const errors = REQUIRED_OUTPUT_KEYS.filter((key) => !Object.hasOwn(output || {}, key));
  if (!Array.isArray(output?.fact) || !output.fact.length) errors.push("fact");
  if (!Array.isArray(output?.evidence) || !output.evidence.length) errors.push("evidence");
  if (!Array.isArray(output?.recommendedAction) || !output.recommendedAction.length) errors.push("recommendedAction");
  if (!output?.confidence || !["High", "Medium", "Low"].includes(output.confidence.level)) errors.push("confidence.level");
  if (! ["Critical", "High", "Medium", "Low", "Monitor"].includes(output?.priority)) errors.push("priority");
  if (output?.providerUsed !== "demo") errors.push("providerUsed");
  if (output?.safeContextUsed !== true) errors.push("safeContextUsed");
  if (output?.externalModelCalled !== false) errors.push("externalModelCalled");
  if (output?.rawDataSent !== false) errors.push("rawDataSent");
  return [...new Set(errors)];
}

function factScore(facts, traceableFacts, matchingFacts, requiredCoverage) {
  if (!facts.length) return 0;
  const base = ((traceableFacts.length / facts.length) * 50) + ((matchingFacts.length / facts.length) * 50);
  return round(base * 0.8 + requiredCoverage * 20);
}

function evidenceScore(evidence, traceableEvidence, requiredCoverage) {
  if (!evidence.length) return 0;
  return round((traceableEvidence.length / evidence.length) * 80 + requiredCoverage * 20);
}

function inferenceScore(inference, expected, unsupportedCount) {
  if (!String(inference || "").trim() || unsupportedCount) return unsupportedCount ? 0 : 30;
  const terms = expected?.requiredInference || [];
  return terms.length ? round(ratio(terms, (term) => String(inference).toLowerCase().includes(String(term).toLowerCase())) * 100) : 100;
}

function confidenceScore(output, safeContext, expected) {
  if (expected?.priority && expected.priority !== output.priority) return 0;
  if (expected?.confidence && expected.confidence !== output.confidence?.level) return 0;
  const qualityFlags = [...(safeContext?.dataQualityCodes || []), ...(safeContext?.missingCodes || []), ...(safeContext?.contradictionCodes || [])];
  if (qualityFlags.length && output.confidence?.level === "High") return 60;
  if (!qualityFlags.length && output.priority === "Monitor" && output.confidence?.level === "High") return 100;
  return 85;
}

function actionScore(actions, requiredCoverage, evidenceCount) {
  if (!actions.length) return 0;
  const structurallyValid = actions.filter((item) => String(item?.title || "").trim() && String(item?.reason || "").trim() && item?.status === "Draft only").length / actions.length;
  const sourceBound = evidenceCount > 0 ? 1 : 0.5;
  return round(structurallyValid * 60 + requiredCoverage * 25 + sourceBound * 15);
}

function safetyScore(output, unsupportedClaims) {
  if (unsupportedClaims.length) return 0;
  const safe = output?.safeContextUsed === true && output?.externalModelCalled === false && output?.rawDataSent === false && output?.providerUsed === "demo";
  return safe ? 100 : 0;
}

function genericForbiddenClaims(output) {
  const text = JSON.stringify(output || {});
  return DISALLOWED_CONTENT.map((pattern) => text.match(pattern)?.[0] || "").filter(Boolean);
}

function sourceExists(source, safeSources) {
  return typeof source === "string" && (source === "Safe CRM Context" || safeSources.has(source));
}

function valueMatches(value, expected) {
  if (expected === undefined || expected === null) return false;
  const actual = normalize(value);
  const source = normalize(expected);
  if (!actual || !source) return ["clear", "none", "not provided", "not-recorded"].includes(actual) && !source;
  return actual === source || actual.includes(source) || source.includes(actual);
}

function flatten(value, prefix, map) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    map.set(prefix, value.join(", "));
    return;
  }
  if (typeof value !== "object") {
    map.set(prefix, value);
    return;
  }
  for (const [key, child] of Object.entries(value)) flatten(child, `${prefix}.${key}`, map);
}

function ratio(items, predicate) {
  if (!items.length) return 1;
  return items.filter(predicate).length / items.length;
}

function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
}

function sum(values) { return values.reduce((total, value) => total + Number(value || 0), 0); }
function normalize(value) { return String(value ?? "").trim().toLowerCase(); }
function round(value) { return Math.round(Number(value || 0) * 100) / 100; }
function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
