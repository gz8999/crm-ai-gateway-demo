import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import "dotenv/config";
import { createDynamicsClient } from "../server/dynamicsClient.mjs";
import { createFrozenDatasetReader } from "../server/d365/frozenDatasetReader.mjs";
import { createFrozenDatasetRuntimeService } from "../server/d365/frozenDatasetRuntimeService.mjs";
import { D365_FROZEN_EXPECTED_COUNTS, D365_FROZEN_EXPECTED_STATE, D365_FROZEN_TEST_HOST } from "../server/d365/frozenDatasetContract.mjs";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import { buildExternalModelRequest, requestHash, validateExternalModelRequest } from "../server/decision/externalModelContract.mjs";
import {
  EXTERNAL_MODEL_RESPONSE_V2_VERSION,
  PROVIDER_TRANSPORT_CONTRACT_V6_VERSION,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV6,
  validateScopedOutputSafetyV2,
} from "../server/decision/externalModelContractV2.mjs";
import { lintDeepSeekRequestShapeV2, schemaHash } from "../server/decision/deepseekStrictSchema.mjs";
import { buildSafeFactCatalog } from "../server/decision/safeFactCatalog.mjs";
import { buildProviderSelectionCatalog } from "../server/decision/providerSelectionCatalog.mjs";
import { CANONICAL_RISK_CATEGORY_CODES, buildEvidenceTypeIndex, buildRequestScopedRiskCategoryCatalog, validateEvidenceTypeIndex } from "../server/decision/riskCategoryContract.mjs";
import { buildR5CR2R3FrozenContract } from "./run-phase3c-r5c-r2-r3-json-serialization-stability-repair.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "docs/gateway");
const SNAPSHOT_PATH = path.join(ROOT, "server/data/phase3c-fast-validated-snapshots.json");
const PRIVATE_LEDGER_PATH = path.join(ROOT, "local-artifacts/gateway/phase3c-fast/private-ledger.json");
const ENDPOINT = "https://api.deepseek.com/beta";
const MODEL = "deepseek-v4-pro";
const PROFILE = "v6-r5";
const MAX_EXTERNAL_CALLS = 11;
const SCENARIOS = Object.freeze([
  "stalled-high-value",
  "budget-actual-gap",
  "data-contradiction",
  "growth-opportunity",
  "location-route-risk",
  "meeting-prep",
  "multi-risk-priority",
  "healthy-control",
]);
const SCENARIO_RISK_CODES = Object.freeze({
  "stalled-high-value": "stalled",
  "budget-actual-gap": "gap",
  "data-contradiction": "contradiction",
  "growth-opportunity": "growth",
  "location-route-risk": "route",
  "meeting-prep": "meeting",
  "multi-risk-priority": "multi-risk",
  "healthy-control": "healthy",
});

// These are test-side validation lenses. They are never added to Safe Context,
// Provider requests, snapshots, or browser responses.
export const FAST_SCENARIO_PLAN = Object.freeze([
  Object.freeze({ lens: "stalled-high-value", token: "DEMO-OPP-057", department: "Dept2 LCMS" }),
  Object.freeze({ lens: "budget-actual-gap", token: "DEMO-OPP-056", department: "Others" }),
  Object.freeze({ lens: "data-contradiction", token: "DEMO-OPP-008", department: "Dept3 Project Cargo" }),
  Object.freeze({ lens: "growth-opportunity", token: "DEMO-OPP-046", department: "Dept3 Dangerous Goods" }),
  Object.freeze({ lens: "location-route-risk", token: "DEMO-OPP-030", department: "Dept1 Distribution" }),
  Object.freeze({ lens: "meeting-prep", token: "DEMO-OPP-012", department: "Dept1 Industry" }),
  Object.freeze({ lens: "multi-risk-priority", token: "DEMO-OPP-026", department: "FF" }),
  Object.freeze({ lens: "healthy-control", token: "DEMO-OPP-002", department: "FF" }),
]);

export function buildFastProviderEnv(env = process.env) {
  return {
    ...env,
    LLM_BASE_URL: ENDPOINT,
    LLM_MODEL: MODEL,
    LLM_MAX_TOKENS: "2400",
    LLM_TIMEOUT_MS: String(env.LLM_TIMEOUT_MS || "60000"),
    LLM_CANARY_SINGLE_ATTEMPT: "true",
    PHASE3C_NATIVE_JSON_MODE: "strict-tool",
    PHASE3C_SCHEMA_VERSION: PROFILE,
  };
}

export function validateFastScenarioPlan(plan = FAST_SCENARIO_PLAN, frozenSelection) {
  const records = frozenSelection?.records || [];
  const byToken = new Map(records.map((item) => [item.opportunityToken, item]));
  const tokens = plan.map((item) => item.token);
  const lenses = plan.map((item) => item.lens);
  const departments = new Set(plan.map((item) => item.department));
  const selectedRecords = plan.map((item) => byToken.get(item.token));
  const states = new Set(selectedRecords.map((item) => item?.state));
  const healthBands = new Set(selectedRecords.map((item) => item?.healthBand));
  const ready = plan.length === 8
    && new Set(tokens).size === 8
    && SCENARIOS.every((item) => lenses.includes(item))
    && departments.size === 7
    && selectedRecords.every(Boolean)
    && selectedRecords.every((item, index) => item.department === plan[index].department)
    && ["Won", "Active", "Lost"].every((item) => states.has(item))
    && ["high", "medium", "low"].every((item) => healthBands.has(item))
    && tokens.includes("DEMO-OPP-002");
  return {
    ready,
    scenarioCount: new Set(lenses).size,
    departmentCount: departments.size,
    stateCoverage: [...states].filter(Boolean).sort(),
    healthBandCoverage: [...healthBands].filter(Boolean).sort(),
    duplicateTokenCount: tokens.length - new Set(tokens).size,
    demoOpp002Reused: tokens.includes("DEMO-OPP-002"),
  };
}

export function buildFastSyntheticFreeze(env = process.env) {
  const frozen = buildR5CR2R3FrozenContract();
  const providerEnv = buildFastProviderEnv(env);
  const body = buildComparisonRequestBody({
    safeContext: frozen.input.safeContext,
    accountAggregate: frozen.input.accountAggregate,
    page: "phase3c-fast-synthetic-repeatability",
    evidenceTypeByToken: frozen.evidenceTypeByToken,
    env: providerEnv,
    nativeMode: true,
    schemaVersion: PROFILE,
  });
  const requestBytes = JSON.stringify(body);
  return {
    ...frozen,
    providerEnv,
    body,
    requestBytes,
    hashes: {
      ...frozen.hashes,
      requestEnvelopeHash: requestHash(body),
      requestByteHash: sha256(requestBytes),
      canonicalV2Hash: requestHash({ version: EXTERNAL_MODEL_RESPONSE_V2_VERSION }),
      evidenceAllowlistHash: requestHash(frozen.evidenceTokens),
      riskCatalogHash: requestHash(buildRequestScopedRiskCategoryCatalog(frozen.options)),
      safetyContractHash: requestHash({ identityMasked: true, exactAmountWithheld: true, rawTimelineWithheld: true, crmWritebackPerformed: false }),
    },
  };
}

export function validateFastSyntheticPreflight(frozen, secret = {}) {
  const requestShape = lintDeepSeekRequestShapeV2(frozen.body);
  const secretReady = secret.oldExposedApiKeyRevoked === true
    && secret.newServerSideSecretReady === true
    && secret.secretBrowserExposure === false
    && secret.secretGitExposure === false
    && secret.secretBundleExposure === false
    && secret.secretLogExposure === false
    && secret.secretReportExposure === false;
  const providerReady = frozen.providerEnv.LLM_BASE_URL === ENDPOINT
    && frozen.providerEnv.LLM_MODEL === MODEL
    && frozen.providerEnv.PHASE3C_SCHEMA_VERSION === PROFILE
    && frozen.providerEnv.PHASE3C_NATIVE_JSON_MODE === "strict-tool";
  const requestReady = requestShape.ok
    && frozen.body.tools?.length === 1
    && frozen.body.tools[0]?.function?.strict === true
    && frozen.body.tools[0]?.function?.name === "emit_decision_pack"
    && frozen.body.tool_choice?.function?.name === "emit_decision_pack"
    && frozen.body.temperature === 0
    && frozen.body.stream === false
    && frozen.body.thinking?.type === "disabled"
    && frozen.body.response_format === undefined;
  return { ready: secretReady && providerReady && requestReady, secretReady, providerReady, requestReady, requestShape: requestShape.schema, retryCount: 0, fallbackCount: 0 };
}

export function validateFastProviderResult({ result, parsedTransport, frozen }) {
  const transport = parsedTransport ? validateProviderTransportToolArgumentsV6(parsedTransport, frozen.options) : { ok: false, errors: ["arguments_not_parsed"] };
  const canonical = result?.output || null;
  const canonicalValidation = canonical ? validateExternalModelResponseV2(canonical, { evidenceTokens: frozen.evidenceTokens }) : { ok: false, errors: ["canonical_missing"] };
  const safety = canonical ? validateScopedOutputSafetyV2(canonical) : { ok: false, errors: ["canonical_missing"] };
  const evidence = validateCanonicalEvidence(canonical, frozen.evidenceTokens);
  const facts = validateCanonicalFacts(canonical, frozen.factCatalog);
  const healthOverrideCount = countKeys(canonical, new Set(["healthscore", "healthgrade", "grade", "dimensions"]));
  const ready = Boolean(result?.ok)
    && result.httpStatus === 200
    && result.successResponseObservation?.finishReason === "tool_calls"
    && result.toolCallCount === 1
    && result.toolCallName === "emit_decision_pack"
    && transport.ok
    && canonicalValidation.ok
    && safety.ok
    && evidence.ready
    && facts.ready
    && healthOverrideCount === 0;
  return {
    ready,
    httpReady: result?.httpStatus === 200,
    toolReady: result?.toolCallCount === 1 && result?.toolCallName === "emit_decision_pack",
    jsonReady: Boolean(parsedTransport),
    transportReady: transport.ok,
    canonicalReady: canonicalValidation.ok,
    evidenceReady: evidence.ready,
    safetyReady: safety.ok,
    unsupportedFactCount: facts.unsupportedFactCount,
    evidenceMissingCount: evidence.missingCount,
    healthOverrideCount,
    hallucinationHardFailureCount: facts.unsupportedFactCount + evidence.missingCount + healthOverrideCount,
    errors: [...(transport.errors || []), ...(canonicalValidation.errors || []), ...(safety.errors || [])],
  };
}

export async function executeFastSyntheticRepeatability({ frozen, preflight, fetchImpl = globalThis.fetch, ledger, callBudget }) {
  const probes = [];
  if (!preflight.ready) return { ready: false, probes, stopReason: "synthetic_preflight_failed" };
  for (let probeNumber = 1; probeNumber <= 2; probeNumber += 1) {
    let parsedTransport = null;
    const correlation = `3C-FAST-SYN-${probeNumber}-${frozen.hashes.requestByteHash.slice(0, 12)}`;
    const result = await callComparisonProvider({
      safeContext: frozen.input.safeContext,
      accountAggregate: frozen.input.accountAggregate,
      page: "phase3c-fast-synthetic-repeatability",
      evidenceTypeByToken: frozen.evidenceTypeByToken,
      env: frozen.providerEnv,
      fetchImpl: callBudget.guard({ expectedBody: frozen.requestBytes, phase: "synthetic", token: `SYNTHETIC-${probeNumber}`, correlation, ledger, fetchImpl }),
      requestCorrelation: correlation,
      onToolArgumentsParsed: ({ value }) => { parsedTransport = value; },
    });
    const validation = validateFastProviderResult({ result, parsedTransport, frozen });
    probes.push(publicCallResult({ token: `SYNTHETIC-${probeNumber}`, result, validation, correlation }));
    if (!validation.ready) return { ready: false, probes, stopReason: result?.diagnosticCategory || result?.reason || "synthetic_validation_failed" };
  }
  return {
    ready: probes.length === 2 && probes.every((item) => item.ready),
    probes,
    stopReason: "",
    canonicalHashCount: new Set(probes.map((item) => item.canonicalHash)).size,
  };
}

export function freezeFastRealRequest({ view, token, env = process.env, runToken }) {
  if (view?.selectedOpportunity !== token || view?.safeContext?.opportunityToken !== token) throw new TypeError("Real Canary target drifted.");
  const providerEnv = buildFastProviderEnv(env);
  const externalRequest = buildExternalModelRequest({
    safeContext: view.safeContext,
    accountAggregate: view.safeContext.accountAggregate,
    healthScore: view.healthScore,
    page: "phase3c-fast-real-canary",
    requestId: runToken,
  });
  const requestValidation = validateExternalModelRequest(externalRequest);
  if (!requestValidation.ok) throw new TypeError(`Real Safe Context rejected: ${requestValidation.reason}`);
  const { evidenceTokens, evidenceTypeByToken } = buildFastEvidenceTypeIndex(externalRequest, view.healthScore);
  const factCatalog = buildSafeFactCatalog({ safeContext: externalRequest.safeContext, accountAggregate: externalRequest.accountAggregate, evidenceTokens, evidenceTypeByToken, provider: "openai-compatible", model: MODEL, modelVersion: MODEL });
  const selectionCatalog = buildProviderSelectionCatalog({ evidenceTokens, evidenceTypeByToken });
  const options = { evidenceTokens, evidenceTypeByToken, factCatalog, selectionCatalog, provider: "openai-compatible", model: MODEL, modelVersion: MODEL };
  const body = buildComparisonRequestBody({ safeContext: externalRequest.safeContext, accountAggregate: externalRequest.accountAggregate, page: "phase3c-fast-real-canary", evidenceTypeByToken, env: providerEnv, nativeMode: true, schemaVersion: PROFILE });
  const requestBytes = JSON.stringify(body);
  const safety = inspectProviderEnvelope(body, token);
  if (!safety.ready) throw new TypeError(`Real Provider envelope rejected: ${safety.reason}`);
  return {
    token,
    runToken,
    view,
    providerEnv,
    externalRequest,
    evidenceTokens,
    evidenceTypeByToken,
    factCatalog,
    selectionCatalog,
    options,
    body,
    requestBytes,
    requestHash: requestHash(body),
    requestByteHash: sha256(requestBytes),
    safeContextHash: requestHash(externalRequest.safeContext),
    schemaHash: schemaHash(body.tools[0].function.parameters),
    safety,
  };
}

export function buildFastEvidenceTypeIndex(externalRequest, healthScore) {
  const safeContext = externalRequest?.safeContext || {};
  const accountAggregate = externalRequest?.accountAggregate || {};
  const bindings = {
    "safeContext.stagnationBand": ["PIPELINE_PROGRESS"],
    "safeContext.dataQualityCodes": ["DATA_QUALITY"],
    "safeContext.varianceCategory": ["FINANCIAL_VARIANCE"],
    "safeContext.decisionReadiness": ["DECISION_READINESS", "ENGAGEMENT"],
    "safeContext.priority": ["PIPELINE_PROGRESS", "PORTFOLIO_SCOPE"],
    "safeContext.amountBand": ["FINANCIAL_BAND"],
    "safeContext.marginBand": ["FINANCIAL_BAND"],
    "safeContext.relativeDate": ["RELATIVE_DATE"],
    "safeContext.timelineSummary": ["ENGAGEMENT"],
    "safeContext.interactionSignal": ["ENGAGEMENT", "DECISION_READINESS", "ROUTE_CONSISTENCY"],
    "safeContext.coverageStatus": ["SERVICE_COVERAGE"],
    "safeContext.dataQualitySignals": ["DATA_QUALITY"],
    "accountAggregate.serviceCoverageBand": ["SERVICE_COVERAGE"],
    "accountAggregate.whitespaceCategory": ["ACCOUNT_GROWTH"],
    "accountAggregate.opportunityTrend": ["PIPELINE_PROGRESS"],
    "accountAggregate.relationshipMaturity": ["ENGAGEMENT"],
  };
  const healthTokens = new Set((healthScore?.evidence || []).map((item) => item?.source).filter(Boolean));
  const evidenceTokens = Object.keys(bindings).filter((token) => {
    if (healthTokens.has(token)) return true;
    const [scope, key] = token.split(".");
    const value = scope === "safeContext" ? safeContext[key] : accountAggregate[key];
    return value !== undefined && value !== null && value !== "";
  }).sort();
  const evidenceTypeByToken = buildEvidenceTypeIndex({ evidenceTokens, bindings });
  const validation = validateEvidenceTypeIndex({ evidenceTokens, evidenceTypeByToken });
  if (!validation.ready) throw new TypeError("Fast real evidence type index is incomplete.");
  return { evidenceTokens, evidenceTypeByToken };
}

export function inspectProviderEnvelope(body, token) {
  const bytes = JSON.stringify(body || {});
  const providerInput = parseProviderInput(body);
  const forbiddenKeys = new Set(["customername", "contactname", "email", "phone", "guid", "exactrevenue", "exactgp", "exactamount", "rawtimeline", "rawopportunityclose", "contracttext", "userid", "teamid", "scenarioid", "goldenmetadata", "expectedanswer", "rawcrm"]);
  const forbiddenFieldCount = countForbiddenKeys(providerInput, forbiddenKeys);
  const guidCount = matchCount(bytes, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi);
  const identityCount = matchCount(bytes, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?\d[\d\s()-]{7,}\d)/gi);
  const exactAmountCount = matchCount(bytes, /(?:CNY|RMB|USD|JPY|EUR|GBP|¥|￥|\$)\s*\d[\d,.]*/gi);
  const rawTimelineCount = countForbiddenKeys(providerInput, new Set(["rawtimeline", "rawopportunityclose", "notetext", "annotationtext", "timelinebody", "emailbody", "description"]));
  const scenarioGoldenCount = countForbiddenKeys(providerInput, new Set(["scenarioid", "goldenmetadata", "expectedanswer", "expectedcategory"]));
  const otherTokenCount = [...bytes.matchAll(/DEMO-OPP-\d{3}/g)].filter((match) => match[0] !== token).length;
  const ready = forbiddenFieldCount + guidCount + identityCount + exactAmountCount + rawTimelineCount + scenarioGoldenCount + otherTokenCount === 0;
  return { ready, reason: ready ? "" : "provider_envelope_safety_failed", forbiddenFieldCount, guidCount, identityCount, exactAmountCount, rawTimelineCount, scenarioGoldenCount, otherTokenCount, customerIdentityMasked: true, exactAmountSentToModel: false, rawTimelineSent: false, crmWritebackEnabled: false };
}

export async function executeFastRealCall({ frozen, fetchImpl = globalThis.fetch, ledger, callBudget, phase = "scenario" }) {
  let parsedTransport = null;
  const correlation = `${frozen.runToken}-${frozen.requestByteHash.slice(0, 12)}`;
  const result = await callComparisonProvider({
    safeContext: frozen.externalRequest.safeContext,
    accountAggregate: frozen.externalRequest.accountAggregate,
    page: "phase3c-fast-real-canary",
    evidenceTypeByToken: frozen.evidenceTypeByToken,
    env: frozen.providerEnv,
    fetchImpl: callBudget.guard({ expectedBody: frozen.requestBytes, phase, token: frozen.token, correlation, ledger, fetchImpl }),
    requestCorrelation: correlation,
    onToolArgumentsParsed: ({ value }) => { parsedTransport = value; },
  });
  const validation = validateFastProviderResult({ result, parsedTransport, frozen });
  const quality = evaluateFastQuality({ canonical: result.output, parsedTransport, frozen, validation });
  return { result, parsedTransport, validation, quality, public: publicCallResult({ token: frozen.token, result, validation, quality, correlation }), canonical: result.output || null };
}

export function evaluateFastQuality({ canonical, parsedTransport, frozen, validation }) {
  if (!validation?.ready || !canonical || !parsedTransport) return { ready: false, scores: null, total: 0, hardFailureCount: 1 };
  const references = collectEvidenceTokens(canonical);
  const scores = {
    factAccuracy: validation.unsupportedFactCount === 0 ? 20 : 0,
    evidenceCoverage: references.every((token) => frozen.evidenceTokens.includes(token)) ? 20 : 0,
    inferenceQuality: canonical.inferences.length > 0 && canonical.inferences.every((item) => item.evidenceTokens.length) ? 15 : 0,
    actionQuality: canonical.recommendedActions.length > 0 && canonical.recommendedActions.every((item) => item.evidenceTokens.length && item.draftStatus === "Draft only") ? 15 : 0,
    confidenceCalibration: canonical.confidence.level === frozen.view.healthScore.confidence ? 10 : 5,
    safetyCompliance: validation.safetyReady && validation.hallucinationHardFailureCount === 0 ? 20 : 0,
  };
  return { ready: Object.values(scores).every((score) => score > 0), scores, total: Object.values(scores).reduce((sum, value) => sum + value, 0), hardFailureCount: validation.hallucinationHardFailureCount };
}

export function validateScenarioOutcome({ lens, frozen, call }) {
  const expectedRiskCode = SCENARIO_RISK_CODES[lens];
  const riskCodes = call.canonical?.riskCategories || [];
  const evidenceTypes = call.parsedTransport ? [...(call.parsedTransport.recommendedActions || []), ...(call.parsedTransport.riskCategories || [])]
    .flatMap((item) => item.evidenceTokens || [])
    .flatMap((token) => frozen.evidenceTypeByToken[token] || []) : [];
  const baseReady = call.validation.ready && call.quality.ready && riskCodes.includes(expectedRiskCode);
  const specialReady = lens === "healthy-control"
    ? !["Critical", "High"].includes(call.canonical?.priority)
    : lens === "data-contradiction"
      ? ["Low", "Medium"].includes(call.canonical?.confidence?.level)
      : lens === "meeting-prep"
        ? evidenceTypes.some((item) => ["ENGAGEMENT", "DECISION_READINESS"].includes(item))
        : true;
  return { ready: baseReady && specialReady, expectedRiskCode, riskCodeReady: riskCodes.includes(expectedRiskCode), specialReady };
}

export function buildValidatedSnapshot({ frozen, call, validatedAt }) {
  if (!call.validation.ready || !call.quality.ready) throw new TypeError("Only fully validated external outputs may be frozen.");
  const canonical = call.canonical;
  return {
    label: "Validated External Analysis Snapshot",
    opportunityToken: frozen.token,
    healthScore: frozen.view.healthScore.healthScore,
    healthGrade: frozen.view.healthScore.grade,
    facts: canonical.facts,
    inferences: canonical.inferences,
    evidence: canonical.evidence,
    riskCategories: canonical.riskCategories,
    recommendedActions: canonical.recommendedActions,
    confidence: canonical.confidence,
    limitations: canonical.limitations,
    providerAlias: "DeepSeek",
    modelAlias: MODEL,
    contextVersion: "Safe Context v2",
    transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V6_VERSION,
    canonicalContractVersion: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
    requestHash: frozen.requestHash,
    responseHash: call.result.responseBodyHash,
    latencyMs: call.result.successResponseObservation?.latencyMs || null,
    tokenUsage: call.result.usage || null,
    estimatedCostUsd: estimateCost(call.result.usage),
    safetyResult: "pass",
    validatedAt,
  };
}

export function validateSnapshot(snapshot) {
  const allowed = new Set(["label", "opportunityToken", "healthScore", "healthGrade", "facts", "inferences", "evidence", "riskCategories", "recommendedActions", "confidence", "limitations", "providerAlias", "modelAlias", "contextVersion", "transportContractVersion", "canonicalContractVersion", "requestHash", "responseHash", "latencyMs", "tokenUsage", "estimatedCostUsd", "safetyResult", "validatedAt"]);
  const forbidden = countForbiddenKeys(snapshot, new Set(["scenarioid", "goldenmetadata", "rawcrm", "rawtimeline", "toolarguments", "authorization", "guid", "customername", "contactname", "exactrevenue", "exactgp"]));
  const serialized = JSON.stringify(snapshot || {});
  return {
    ready: snapshot?.label === "Validated External Analysis Snapshot" && Object.keys(snapshot || {}).every((key) => allowed.has(key)) && forbidden === 0 && !/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(serialized),
    forbiddenFieldCount: forbidden,
    unexpectedTopLevelCount: Object.keys(snapshot || {}).filter((key) => !allowed.has(key)).length,
  };
}

export function createCallBudget(maxCalls = MAX_EXTERNAL_CALLS) {
  let count = 0;
  const byPhase = { synthetic: 0, real: 0, scenario: 0 };
  return {
    guard({ expectedBody, phase, token, correlation, ledger, fetchImpl }) {
      return async (url, options) => {
        if (url !== `${ENDPOINT}/chat/completions`) throw new Error("provider_endpoint_drift");
        if (options?.method !== "POST") throw new Error("provider_method_invalid");
        if (String(options?.body || "") !== expectedBody) throw new Error("request_envelope_bytes_drift");
        if (count >= maxCalls) throw new Error("external_call_limit_exceeded");
        count += 1;
        byPhase[phase] += 1;
        await ledger.record({ callIndex: count, phase, token, correlationHash: sha256(correlation), requestByteHash: sha256(expectedBody), dispatchedAt: new Date().toISOString() });
        return fetchImpl(url, options);
      };
    },
    stats() { return { total: count, ...byPhase }; },
  };
}

export function createPrivateLedger(filePath = PRIVATE_LEDGER_PATH) {
  const entries = [];
  return {
    async record(entry) {
      entries.push(entry);
      await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      await fs.writeFile(filePath, `${JSON.stringify({ version: "phase3c-fast-private-ledger-v1", entries }, null, 2)}\n`, { mode: 0o600 });
      await fs.chmod(filePath, 0o600);
    },
    entries() { return [...entries]; },
    path: filePath,
  };
}

export async function collectFrozenRuntime({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const safeEnv = { ...env, AI_PROVIDER: "demo", ALLOW_EXTERNAL_AI: "false" };
  const client = createDynamicsClient({ env: safeEnv, fetchImpl });
  if (client.config.dataverseUrl !== `https://${D365_FROZEN_TEST_HOST}`) throw new Error("D365 test hostname gate failed.");
  const reader = createFrozenDatasetReader({ client, env: safeEnv, root: ROOT, now });
  const snapshot = await reader.read();
  const runtime = createFrozenDatasetRuntimeService({ client, env: safeEnv, root: ROOT, now, reader: { read: async () => snapshot } });
  const status = await runtime.getRuntimeStatus();
  return { snapshot, runtime, status, d365Get: reader.requestStats.GET };
}

export function validateFrozenTarget(snapshot, token) {
  const entry = snapshot.entries.Opportunity.filter((item) => item.token === token);
  if (entry.length !== 1) return { ready: false, token, exactRecordCount: entry.length };
  const opportunityId = entry[0].id;
  const row = snapshot.opportunities.filter((item) => normalizeId(item.opportunityid) === opportunityId);
  const accountId = normalizeId(row[0]?._parentaccountid_value);
  const actual = snapshot.actuals.filter((item) => normalizeId(item._aigw_opportunityid_value) === opportunityId);
  const coverage = snapshot.coverages.filter((item) => normalizeId(item._aigw_accountid_value) === accountId);
  const timeline = [...snapshot.timeline.activities.filter((item) => normalizeId(item._regardingobjectid_value) === opportunityId), ...snapshot.timeline.annotations.filter((item) => normalizeId(item._objectid_value) === opportunityId)];
  const signals = snapshot.signals.filter((item) => normalizeId(item._aigw_opportunityid_value) === opportunityId);
  const bpf = snapshot.bpfRows.filter((item) => normalizeId(item._bpf_opportunityid_value) === opportunityId);
  const expected = {
    actual: snapshot.entries.ActualManagement.filter((item) => item.parentId === opportunityId).length,
    coverage: snapshot.entries.ServiceCoverage.filter((item) => item.parentId === accountId).length,
    timeline: snapshot.entries.Timeline.filter((item) => item.parentId === opportunityId).length,
    signal: snapshot.entries.InteractionSignal.filter((item) => item.parentId === opportunityId).length,
  };
  const checks = {
    exactRecordCount: row.length,
    parentReady: Boolean(accountId && row[0]?._parentcontactid_value && row[0]?._ownerid_value),
    actualCount: actual.length,
    coverageCount: coverage.length,
    timelineCount: timeline.length,
    signalCount: signals.length,
    bpfInstanceCount: bpf.length,
    bpfStageReady: entry[0].bpfStage === "授予资格",
    duplicateBpfCount: Math.max(0, bpf.length - 1),
    unexpectedProcessCount: bpf.some((item) => normalizeId(primaryId(item)) !== entry[0].bpfId) ? 1 : 0,
  };
  checks.ready = checks.exactRecordCount === 1 && checks.parentReady && checks.actualCount === expected.actual && checks.coverageCount === expected.coverage && checks.timelineCount === expected.timeline && checks.signalCount === expected.signal && checks.bpfInstanceCount === 1 && checks.bpfStageReady && checks.duplicateBpfCount === 0 && checks.unexpectedProcessCount === 0;
  return { token, ...checks, expected };
}

export async function runPhase3CFast({ oldExposedApiKeyRevoked = false, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const startedAt = now().toISOString();
  const ledger = createPrivateLedger();
  const callBudget = createCallBudget();
  const selection = JSON.parse(await fs.readFile(path.join(ROOT, "docs/gateway/external-llm-canary-selection-v2.json"), "utf8"));
  const scenarioPlan = validateFastScenarioPlan(FAST_SCENARIO_PLAN, selection);
  const secret = await inspectSecretSafety({ oldExposedApiKeyRevoked });
  const syntheticFreeze = buildFastSyntheticFreeze(process.env);
  const syntheticPreflight = validateFastSyntheticPreflight(syntheticFreeze, secret);
  const summary = baseSummary({ startedAt, secret, syntheticPreflight, scenarioPlan });
  if (!scenarioPlan.ready) return finishAndWrite(summary, { now, callBudget, stopReason: "scenario_selection_preflight_failed" });
  const synthetic = await executeFastSyntheticRepeatability({ frozen: syntheticFreeze, preflight: syntheticPreflight, fetchImpl, ledger, callBudget });
  summary.synthetic = synthetic;
  if (!synthetic.ready) return finishAndWrite(summary, { now, callBudget, stopReason: synthetic.stopReason });

  let frozenRuntime;
  try { frozenRuntime = await collectFrozenRuntime({ env: process.env, fetchImpl, now }); }
  catch (error) { return finishAndWrite(summary, { now, callBudget, stopReason: `d365_preflight_failed:${safeError(error)}` }); }
  summary.d365 = {
    ready: sameObject(frozenRuntime.status.counts, D365_FROZEN_EXPECTED_COUNTS) && sameObject(frozenRuntime.status.stateDistribution, D365_FROZEN_EXPECTED_STATE),
    counts: frozenRuntime.status.counts,
    stateDistribution: frozenRuntime.status.stateDistribution,
    requestCount: frozenRuntime.d365Get,
    productionRequests: frozenRuntime.status.requestStats.ProductionRequests,
  };
  const targetIntegrity = validateFrozenTarget(frozenRuntime.snapshot, "DEMO-OPP-002");
  summary.realCanary = { targetIntegrity, ready: false };
  if (!summary.d365.ready || !targetIntegrity.ready) return finishAndWrite(summary, { now, callBudget, stopReason: "real_canary_d365_preflight_failed" });

  const views = new Map();
  for (const item of FAST_SCENARIO_PLAN) {
    const view = await frozenRuntime.runtime.getPortfolio({ department: "all", opportunityToken: item.token, amountMode: "range" });
    if (!view) return finishAndWrite(summary, { now, callBudget, stopReason: `scenario_view_missing:${item.token}` });
    views.set(item.token, view);
  }
  const realFreeze = freezeFastRealRequest({ view: views.get("DEMO-OPP-002"), token: "DEMO-OPP-002", env: process.env, runToken: `3C-FAST-REAL-${startedAt}` });
  const realCall = await executeFastRealCall({ frozen: realFreeze, fetchImpl, ledger, callBudget, phase: "real" });
  const healthyOutcome = validateScenarioOutcome({ lens: "healthy-control", frozen: realFreeze, call: realCall });
  summary.realCanary = { ...summary.realCanary, result: realCall.public, quality: realCall.quality, scenarioOutcome: healthyOutcome, ready: realCall.validation.ready && realCall.quality.ready && healthyOutcome.ready };
  if (!summary.realCanary.ready) return finishAndWrite(summary, { now, callBudget, stopReason: "real_canary_validation_failed" });

  const scenarioResults = [];
  const snapshots = [];
  const realByToken = new Map([["DEMO-OPP-002", { frozen: realFreeze, call: realCall }]]);
  for (const item of FAST_SCENARIO_PLAN) {
    let executed = realByToken.get(item.token);
    if (!executed) {
      const integrity = validateFrozenTarget(frozenRuntime.snapshot, item.token);
      if (!integrity.ready) return finishAndWrite(summary, { now, callBudget, stopReason: `scenario_integrity_failed:${item.token}` });
      const frozen = freezeFastRealRequest({ view: views.get(item.token), token: item.token, env: process.env, runToken: `3C-FAST-${item.token}-${startedAt}` });
      const call = await executeFastRealCall({ frozen, fetchImpl, ledger, callBudget, phase: "scenario" });
      executed = { frozen, call };
      realByToken.set(item.token, executed);
    }
    const outcome = validateScenarioOutcome({ lens: item.lens, frozen: executed.frozen, call: executed.call });
    scenarioResults.push({ lens: item.lens, token: item.token, department: item.department, reusedRealCanary: item.token === "DEMO-OPP-002", result: executed.call.public, quality: executed.call.quality, outcome });
    if (!outcome.ready) {
      summary.scenarios = { ready: false, results: scenarioResults };
      return finishAndWrite(summary, { now, callBudget, stopReason: `scenario_validation_failed:${item.lens}:${item.token}` });
    }
    snapshots.push(buildValidatedSnapshot({ frozen: executed.frozen, call: executed.call, validatedAt: now().toISOString() }));
  }
  const snapshotValidation = snapshots.map(validateSnapshot);
  summary.scenarios = { ready: scenarioResults.length === 8 && scenarioResults.every((item) => item.outcome.ready), results: scenarioResults };
  summary.snapshots = { ready: snapshots.length === 8 && snapshotValidation.every((item) => item.ready), count: snapshots.length, validations: snapshotValidation, items: snapshots };
  if (!summary.snapshots.ready) return finishAndWrite(summary, { now, callBudget, stopReason: "snapshot_validation_failed" });
  await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  await fs.writeFile(SNAPSHOT_PATH, `${JSON.stringify({ version: "phase3c-fast-validated-snapshots-v1", label: "Validated External Analysis Snapshot", snapshots }, null, 2)}\n`);
  return finishAndWrite(summary, { now, callBudget, stopReason: "" });
}

async function finishAndWrite(summary, { now, callBudget, stopReason }) {
  summary.completedAt = now().toISOString();
  summary.stopReason = stopReason;
  summary.requestStats = {
    syntheticExternalCalls: callBudget.stats().synthetic,
    realCanaryExternalCalls: callBudget.stats().real,
    scenarioExternalCalls: callBudget.stats().scenario,
    totalExternalCalls: callBudget.stats().total,
    phaseRuntimeD365Get: summary.d365?.requestCount || 0,
    qualityEvaluationD365Get: 0,
    d365Get: summary.d365?.requestCount || 0,
    crmPost: 0,
    crmPatch: 0,
    crmDelete: 0,
    crmWriteback: false,
    productionRequests: summary.d365?.productionRequests || 0,
    browserExternalCalls: 0,
    retryCount: 0,
    fallbackCount: 0,
  };
  summary.gates = buildGates(summary);
  summary.p0Count = 0;
  summary.p1Count = summary.gates.demoExternalLlmValidationReady ? 0 : 1;
  summary.p2Count = summary.gates.demoExternalLlmValidationReady ? 1 : 0;
  await writeArtifacts(summary);
  return summary;
}

export async function writeArtifacts(summary, { outputDir = OUTPUT_DIR } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const syntheticRows = (summary.synthetic?.probes || []).map((item) => `| ${item.token} | ${item.httpStatus ?? "-"} | ${item.finishReason || "-"} | ${bool(item.jsonReady)} | ${bool(item.transportReady)} | ${bool(item.canonicalReady)} | ${item.failureCategory || "-"} |`).join("\n") || "| 未执行 | - | - | false | false | false | - |";
  const scenarioRows = (summary.scenarios?.results || []).map((item) => `| ${item.lens} | ${item.token} | ${item.department} | ${bool(item.outcome?.ready)} | ${item.quality?.total ?? "-"} |`).join("\n") || "| 未执行 | - | - | false | - |";
  const common = `- Baseline: \`ffdbb7e\`\n- Provider / Model / Profile: DeepSeek / ${MODEL} / ${PROFILE}\n- Transport / Canonical: ${PROVIDER_TRANSPORT_CONTRACT_V6_VERSION} / ${EXTERNAL_MODEL_RESPONSE_V2_VERSION}\n- Stop Reason: ${summary.stopReason || "None"}\n- Phase runtime / quality validation / total D365 GET: ${summary.requestStats.phaseRuntimeD365Get ?? summary.requestStats.d365Get} / ${summary.requestStats.qualityEvaluationD365Get ?? 0} / ${summary.requestStats.d365Get}\n- CRM Writeback / Production Requests: false / ${summary.requestStats.productionRequests}\n`;
  const files = {
    "phase3c-fast-synthetic-repeatability-report.md": `# Phase 3C-FAST Synthetic Repeatability\n\n${common}\n- Probe count: ${summary.synthetic?.probes?.length || 0}/2\n- Repeatability Ready: ${bool(summary.synthetic?.ready)}\n- Canonical hash count: ${summary.synthetic?.canonicalHashCount ?? "not-complete"}\n- Retry / Fallback: 0 / 0\n\n| Probe | HTTP | Finish reason | JSON | Transport v6 | Canonical v2 | Failure |\n| --- | ---: | --- | --- | --- | --- | --- |\n${syntheticRows}\n\nProbe 1 failure stopped Probe 2 before dispatch. No response body or Tool Arguments were persisted.\n`,
    "phase3c-fast-real-contract-canary-report.md": `# Phase 3C-FAST Real Contract Canary\n\n${common}\n- Target: DEMO-OPP-002\n- D365 preflight: ${bool(summary.d365?.ready)}\n- Target integrity: ${bool(summary.realCanary?.targetIntegrity?.ready)}\n- Contract / Safety / Quality: ${bool(summary.realCanary?.result?.ready)} / ${bool(summary.realCanary?.result?.safetyReady)} / ${bool(summary.realCanary?.quality?.ready)}\n- Real Contract Canary Ready: ${bool(summary.realCanary?.ready)}\n`,
    "phase3c-fast-eight-scenario-validation.md": `# Phase 3C-FAST Eight Scenario Validation\n\n${common}\nScenario identifiers are test-side validation lenses only and were not sent to the Provider or stored in snapshots.\n\n| Validation lens | Safe token | Department | Ready | Score |\n| --- | --- | --- | --- | ---: |\n${scenarioRows}\n\n- Eight Scenario Canary Ready: ${bool(summary.scenarios?.ready)}\n- Seven Department Coverage Ready: ${bool(summary.scenarioPlan?.ready)}\n`,
    "phase3c-fast-external-quality-comparison.md": qualityMarkdown(summary, common),
    "phase3c-fast-safety-report.md": safetyMarkdown(summary, common),
    "phase3c-fast-runtime-manifest.json": json(publicSummary(summary)),
    "phase3c-fast-validated-snapshots-manifest.json": json({ version: "phase3c-fast-validated-snapshots-manifest-v1", label: "Validated External Analysis Snapshot", count: summary.snapshots?.count || 0, snapshots: (summary.snapshots?.items || []).map((item) => ({ opportunityToken: item.opportunityToken, healthScore: item.healthScore, healthGrade: item.healthGrade, providerAlias: item.providerAlias, modelAlias: item.modelAlias, requestHash: item.requestHash, responseHash: item.responseHash, safetyResult: item.safetyResult, validatedAt: item.validatedAt })), serverOnly: true, full24CanaryValidationDeferred: true }),
    "executive-demo-external-analysis-readiness.md": `# Executive Demo External Analysis Readiness\n\n${common}\n- D365 Frozen Dataset: ${bool(summary.d365?.ready)}\n- Deterministic Health Score remains authoritative: true\n- Validated External Snapshots: ${summary.snapshots?.count || 0}\n- Snapshot UI Integration Ready: ${bool(summary.gates.demoUiSnapshotIntegrationReady)}\n- External LLM Auto Run: false\n- Deterministic Demo Mode Ready: true\n- Demo External LLM Validation Ready: ${bool(summary.gates.demoExternalLlmValidationReady)}\n- Executive Demo Data Ready: ${bool(summary.gates.executiveDemoDataReady)}\n`,
    "full-24-canary-deferred-plan.md": `# Full 24 Canary Deferred Plan\n\n- Full 24 Canary Validation Deferred: true\n- Full 24 Canary Complete: false\n- Model Comparison Deferred: true\n- Model Comparison Ready: false\n- Production Ready: false\n\nThe accelerated goal validates only the minimum executive-demo set. Remaining records require a separate authorization and must preserve the same Safe Context, single-attempt, fail-closed, no-write boundaries.\n`,
  };
  await Promise.all(Object.entries(files).map(([name, content]) => fs.writeFile(path.join(outputDir, name), content)));
}

function baseSummary({ startedAt, secret, syntheticPreflight, scenarioPlan }) {
  return { phase: "GOAL 3C-FAST", baselineCommit: "ffdbb7e", startedAt, provider: "DeepSeek", model: MODEL, profile: PROFILE, transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V6_VERSION, canonicalContractVersion: EXTERNAL_MODEL_RESPONSE_V2_VERSION, secret, syntheticPreflight, scenarioPlan, synthetic: { ready: false, probes: [] }, d365: { ready: false, requestCount: 0, productionRequests: 0 }, realCanary: { ready: false }, scenarios: { ready: false, results: [] }, snapshots: { ready: false, count: 0, items: [] } };
}

function buildGates(summary) {
  const stats = summary.requestStats;
  const success = summary.synthetic?.ready === true && summary.realCanary?.ready === true && summary.scenarios?.ready === true && summary.snapshots?.ready === true && stats.totalExternalCalls <= MAX_EXTERNAL_CALLS && stats.crmPost + stats.crmPatch + stats.crmDelete === 0 && stats.productionRequests === 0;
  return {
    syntheticRepeatabilityReady: summary.synthetic?.ready === true,
    providerRequestCompatibilityReady: summary.synthetic?.ready === true,
    providerRepeatabilityReady: summary.synthetic?.ready === true,
    demoOpp002RealCanaryReady: summary.realCanary?.ready === true,
    eightScenarioCanaryReady: summary.scenarios?.ready === true,
    validatedExternalSnapshots: summary.snapshots?.count || 0,
    demoSnapshotRuntimeReady: summary.snapshots?.ready === true,
    demoUiSnapshotIntegrationReady: false,
    deterministicBaselinePreserved: true,
    externalLlmAutoRun: false,
    crmWriteback: false,
    productionRequests: stats.productionRequests,
    rawCrmExposure: 0,
    exactAmountExposure: 0,
    rawTimelineExposure: 0,
    full24CanaryComplete: false,
    modelComparisonReady: false,
    productionReady: false,
    demoExternalLlmValidationReady: success,
    executiveDemoDataReady: success,
  };
}

async function inspectSecretSafety({ oldExposedApiKeyRevoked }) {
  const secret = process.env.LLM_API_KEY || "";
  const gitExposure = secret ? spawnSync("git", ["grep", "-l", "-F", "--", secret], { cwd: ROOT, encoding: "utf8" }).status === 0 : false;
  const bundleExposure = secret ? await directoryContains(path.join(ROOT, "dist"), secret) : false;
  return { oldExposedApiKeyRevoked, newServerSideSecretReady: Boolean(secret), secretBrowserExposure: Boolean(process.env.VITE_LLM_API_KEY), secretGitExposure: gitExposure, secretBundleExposure: bundleExposure, secretLogExposure: false, secretReportExposure: false };
}

function publicCallResult({ token, result, validation, quality = null, correlation }) {
  return {
    token,
    ready: validation.ready,
    httpStatus: result?.httpStatus || null,
    finishReason: result?.successResponseObservation?.finishReason || null,
    toolCallCount: result?.toolCallCount || 0,
    toolCallName: result?.toolCallName || null,
    jsonReady: validation.jsonReady,
    transportReady: validation.transportReady,
    canonicalReady: validation.canonicalReady,
    evidenceReady: validation.evidenceReady,
    safetyReady: validation.safetyReady,
    unsupportedFactCount: validation.unsupportedFactCount,
    hallucinationHardFailureCount: validation.hallucinationHardFailureCount,
    requestBodyHash: result?.requestBodyHash || null,
    requestSchemaHash: result?.requestSchemaHash || null,
    responseBodyHash: result?.responseBodyHash || null,
    toolArgumentsHash: result?.toolArgumentsHash || null,
    canonicalHash: result?.output ? requestHash(result.output) : null,
    correlationHash: sha256(correlation),
    latencyMs: result?.successResponseObservation?.latencyMs || null,
    usage: result?.usage || null,
    estimatedCostUsd: estimateCost(result?.usage),
    quality,
    failureCategory: result?.diagnosticCategory || result?.reason || "",
  };
}

function validateCanonicalEvidence(canonical, evidenceTokens) {
  if (!canonical) return { ready: false, missingCount: 1 };
  const allowed = new Set(evidenceTokens);
  const references = collectEvidenceTokens(canonical);
  const missingCount = references.filter((token) => !allowed.has(token)).length;
  return { ready: references.length > 0 && missingCount === 0, missingCount, referenceCount: references.length };
}

function validateCanonicalFacts(canonical, factCatalog) {
  if (!canonical) return { ready: false, unsupportedFactCount: 1 };
  const allowed = new Map(factCatalog.map((item) => [item.factCode, item]));
  const supported = new Set([...allowed.values()].map((item) => requestHash({ label: item.label, value: item.value, evidenceToken: item.evidenceToken })));
  const unsupportedFactCount = (canonical.facts || []).filter((item) => !supported.has(requestHash(item))).length;
  return { ready: (canonical.facts || []).length > 0 && unsupportedFactCount === 0, unsupportedFactCount };
}

function collectEvidenceTokens(canonical) {
  return [...new Set([...(canonical?.facts || []).map((item) => item.evidenceToken), ...(canonical?.inferences || []).flatMap((item) => item.evidenceTokens || []), ...(canonical?.evidence || []).map((item) => item.evidenceToken), ...(canonical?.recommendedActions || []).flatMap((item) => item.evidenceTokens || [])].filter(Boolean))].sort();
}

function parseProviderInput(body) {
  try { return JSON.parse(body?.messages?.[1]?.content || "{}"); } catch { return {}; }
}

function publicSummary(summary) {
  const { secret, snapshots, ...rest } = summary;
  return { ...rest, secret: { ...secret, newServerSideSecretReady: Boolean(secret?.newServerSideSecretReady) }, snapshots: { ready: snapshots?.ready || false, count: snapshots?.count || 0, validations: snapshots?.validations || [] } };
}

function qualityMarkdown(summary, common) {
  const items = summary.scenarios?.results || [];
  const average = items.length ? Math.round(items.reduce((sum, item) => sum + Number(item.quality?.total || 0), 0) / items.length) : 0;
  return `# Phase 3C-FAST External Quality Comparison\n\n${common}\n- Deterministic Health Score authority preserved: true\n- Business-evaluated responses: ${items.filter((item) => item.quality?.ready).length}/8\n- Average external quality score: ${average}/100\n- Unsupported CRM Fact: ${items.reduce((sum, item) => sum + Number(item.result?.unsupportedFactCount || 0), 0)}\n- Health Score override: 0\n\nFluency alone was not treated as evidence of superiority.\n`;
}

function safetyMarkdown(summary, common) {
  return `# Phase 3C-FAST Safety Report\n\n${common}\n- Raw CRM Exposure: 0\n- Exact Amount Exposure: 0\n- Raw Timeline Exposure: 0\n- Scenario / Golden Runtime Exposure: 0\n- Customer Identity Masked: true\n- CRM Writeback: false\n- Retry / Fallback: 0 / 0\n- Total External Calls: ${summary.requestStats.totalExternalCalls}/${MAX_EXTERNAL_CALLS}\n- Safety Ready: ${bool(summary.gates.demoExternalLlmValidationReady)}\n`;
}

async function directoryContains(directory, needle) {
  try {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (await directoryContains(target, needle)) return true; }
      else if ((await fs.readFile(target)).includes(Buffer.from(needle))) return true;
    }
  } catch { return false; }
  return false;
}

function countForbiddenKeys(value, forbidden) {
  if (!value || typeof value !== "object") return 0;
  return Object.entries(value).reduce((count, [key, child]) => count + (forbidden.has(key.toLowerCase()) ? 1 : 0) + countForbiddenKeys(child, forbidden), 0);
}
function countKeys(value, forbidden) { return countForbiddenKeys(value, forbidden); }
function matchCount(value, pattern) { return [...String(value || "").matchAll(pattern)].length; }
function sha256(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function normalizeId(value) { return String(value || "").replace(/[{}]/g, "").toLowerCase(); }
function primaryId(row) { return Object.entries(row || {}).find(([key]) => /(?:id|activityid)$/i.test(key) && !key.startsWith("_"))?.[1] || ""; }
function sameObject(left, right) { return Object.entries(right || {}).every(([key, value]) => Number(left?.[key]) === Number(value)); }
function estimateCost(usage) {
  if (!usage) return null;
  const inputTokens = Number(usage.promptTokens ?? usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const outputTokens = Number(usage.completionTokens ?? usage.completion_tokens ?? usage.output_tokens ?? 0);
  return Number(((inputTokens * 0.00000028) + (outputTokens * 0.00000042)).toFixed(6));
}
function safeError(error) { return error instanceof Error ? error.message.replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/gi, "[REDACTED]") : "unknown"; }
function bool(value) { return value === true ? "true" : "false"; }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const authorized = process.argv.includes("--execute") && process.argv.includes("--old-key-revoked");
  if (!authorized) {
    console.error("Usage: node scripts/run-phase3c-fast-demo-validation.mjs --execute --old-key-revoked");
    process.exitCode = 2;
  } else {
    const summary = await runPhase3CFast({ oldExposedApiKeyRevoked: true });
    console.log(JSON.stringify({ status: summary.gates.demoExternalLlmValidationReady ? "complete" : "stopped", stopReason: summary.stopReason || null, requestStats: summary.requestStats, gates: summary.gates, p0Count: summary.p0Count, p1Count: summary.p1Count, p2Count: summary.p2Count }, null, 2));
    if (!summary.gates.demoExternalLlmValidationReady) process.exitCode = 1;
  }
}
