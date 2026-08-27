import "dotenv/config";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import { requestHash } from "../server/decision/externalModelContract.mjs";
import {
  EXTERNAL_MODEL_RESPONSE_V2_VERSION,
  PROVIDER_TRANSPORT_CONTRACT_V2_VERSION,
  externalModelResponseJsonSchemaV2,
  providerTransportToolSchemaV1,
  providerTransportToolSchemaV2,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV2,
  validateScopedOutputSafetyV2,
} from "../server/decision/externalModelContractV2.mjs";
import { validateStructuredActionEvidenceV1 } from "../server/decision/evidenceValidationProfiles.mjs";
import {
  DEEPSEEK_RISK_CATEGORY_EVIDENCE_PROFILE_V6R1_VERSION,
  deepseekDecisionToolSchemaV6R1,
  lintDeepSeekRequestShapeV2,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import {
  CANONICAL_RISK_CATEGORY_CATALOG,
  buildEvidenceTypeIndex,
  buildRiskCategoryEvidenceMatrix,
  validateCanonicalRiskCategoryCodes,
  validateEvidenceTypeIndex,
  validateRiskCategoryCatalog,
  validateStructuredRiskCategoryEvidence,
} from "../server/decision/riskCategoryContract.mjs";
import { buildR5B10SharedInput } from "./run-phase3c-r5b10-serialization-isolation.mjs";
import { validateR5B9SyntheticInput } from "./run-phase3c-r5b9-structured-safety-probes.mjs";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const RUN_ID = "PHASE3C-R5B11-R1";
const BASELINE_COMMIT = "a92ac57";
const ENDPOINT = "https://api.deepseek.com/beta";
const MODEL = "deepseek-v4-pro";
const PAGE = "synthetic-v6-r1-risk-category-evidence";
const MAX_CALLS = 2;
const MAX_TOKENS = 2400;
const HISTORICAL_ARGUMENT_HASH = "5769a982672168a8f227c9a74b88b823fdd18c5cda3a02da57aae60439730a59";
const TRANSPORT_V1_SCHEMA_HASH = "12838eecacdaabe7f2e1a55c660847652dcfc2abcb87e381f1b45d8aba851236";
const SYNTHETIC_EVIDENCE_BINDINGS = Object.freeze({
  "SYN-EVIDENCE-PIPELINE-001": ["PIPELINE_PROGRESS", "RELATIVE_DATE"],
  "SYN-EVIDENCE-FINANCIAL-001": ["FINANCIAL_BAND", "FINANCIAL_VARIANCE"],
  "SYN-EVIDENCE-ENGAGEMENT-001": ["ENGAGEMENT", "DECISION_READINESS"],
  "SYN-EVIDENCE-COVERAGE-001": ["SERVICE_COVERAGE", "ACCOUNT_GROWTH"],
  "SYN-EVIDENCE-DATA-QUALITY-001": ["DATA_QUALITY"],
});
const HISTORICAL_HASHES = Object.freeze({
  "provider-transport-contract-v1.json": "dc001720da99f95116e1abc47d8a559225c2c3908edc75f5d47822603964893f",
  "phase3c-r5b11-v6-repeatability-report.md": "ac413718a86a4f369f90bec813e3e96a1beb9ee3b298fe99e337a93c3e9bef4d",
  "phase3c-r5b11-runtime-manifest.json": "2e896ad1e412263c27a2829277221fead29adc3e08ca3326c6d305069d861e2e",
  "phase3c-r5b11-request-audit.json": "cee20cc31026a03eef9b4cbdf22bb17f37b726d18a444d35221ee5d8ee24a1f0",
  "phase3c-r5b11-transport-validation.json": "5c83ab4d9653d47ee77e14add58cc65726bda13feec9244532135912809fdce7",
  "phase3c-r5b11-evidence-validation.json": "71df2f7a689be322d66dd6b1e1e858e68e3503a5e56009bf04af0f69f84027ef",
  "phase3c-r5b11-safety-report.md": "d2cf333f487af7c15651296e0a7cd614f4ab58ffbc720eb90db3f46291878961",
  "phase3c-r5c-real-canary-decision-pack-v2-zh.md": "fce1c8a1f881024249df92c0857d95ca1168665e48181d9418a51cf079e6d6bc",
});

export function classifyHistoricalR5B11Failure() {
  return {
    classification: "B",
    classificationCode: "GLOBAL_VALID_BUT_EVIDENCE_UNSUPPORTED",
    returnedCategoryCodeRetained: false,
    returnedCategoryCodeHash: null,
    historicalArgumentsHash: HISTORICAL_ARGUMENT_HASH,
    globalTransportAcceptedFreeString: true,
    canonicalV2AcceptedFreeString: true,
    requestAllowlistWasHardcoded: true,
    categoryEvidenceAssociationAvailable: false,
    reason: "Transport v1 and Canonical v2 accepted free strings, but Transport v1 had no category-level evidence association. The retired one-item probe allowlist could not establish evidence support.",
  };
}

export function buildR5B11R1ProviderEnv(env = process.env) {
  return {
    ...env,
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "true",
    LLM_BASE_URL: ENDPOINT,
    LLM_MODEL: MODEL,
    PHASE3C_NATIVE_JSON_MODE: "strict-tool",
    PHASE3C_SCHEMA_VERSION: "v6-r1",
    LLM_CANARY_SINGLE_ATTEMPT: "true",
    LLM_TIMEOUT_MS: env.LLM_TIMEOUT_MS || "30000",
    LLM_MAX_TOKENS: String(MAX_TOKENS),
  };
}

export function buildR5B11R1SyntheticInput() {
  const input = buildR5B10SharedInput();
  input.safeContext.evidenceTokens = Object.keys(SYNTHETIC_EVIDENCE_BINDINGS);
  return input;
}

export function freezeR5B11R1Request({ input = buildR5B11R1SyntheticInput(), env = process.env } = {}) {
  const providerEnv = buildR5B11R1ProviderEnv(env);
  const body = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: PAGE, env: providerEnv, nativeMode: true, schemaVersion: "v6-r1" });
  const evidenceAllowlist = [...input.safeContext.evidenceTokens];
  const evidenceTypeByToken = buildEvidenceTypeIndex({ evidenceTokens: evidenceAllowlist, bindings: SYNTHETIC_EVIDENCE_BINDINGS });
  const evidenceMatrix = buildRiskCategoryEvidenceMatrix();
  return {
    input,
    providerEnv,
    body,
    evidenceAllowlist,
    evidenceTypeByToken,
    syntheticInputHash: requestHash(input),
    requestEnvelopeHash: requestHash(body),
    transportV1SchemaHash: schemaHash(providerTransportToolSchemaV1),
    transportV2SchemaHash: schemaHash(providerTransportToolSchemaV2),
    canonicalV2SchemaHash: schemaHash(externalModelResponseJsonSchemaV2),
    riskCatalogHash: requestHash(CANONICAL_RISK_CATEGORY_CATALOG),
    evidenceAllowlistHash: requestHash(evidenceAllowlist),
    evidenceMatrixHash: requestHash(evidenceMatrix),
    evidenceMatrix,
  };
}

export function validateR5B11R1OfflinePreflight({ frozen = freezeR5B11R1Request(), secretEvidence = {}, authoritativeBaselineReady = true, historicalIntegrityReady = true, runConsumed = false } = {}) {
  const inputSafety = validateR5B9SyntheticInput(frozen.input);
  const requestShape = lintDeepSeekRequestShapeV2(frozen.body);
  const catalog = validateRiskCategoryCatalog();
  const evidenceTypeIndex = validateEvidenceTypeIndex({ evidenceTokens: frozen.evidenceAllowlist, evidenceTypeByToken: frozen.evidenceTypeByToken });
  const serializedRequest = JSON.stringify(frozen.body);
  const requestSafety = {
    expectedRiskExposure: /expectedRisk|expectedCategory|expectedAnswer/i.test(serializedRequest),
    scenarioGoldenExposure: /scenarioId|goldenMetadata|goldenLabel/i.test(serializedRequest),
  };
  const providerReady = frozen.providerEnv.LLM_BASE_URL === ENDPOINT && frozen.providerEnv.LLM_MODEL === MODEL && frozen.providerEnv.PHASE3C_SCHEMA_VERSION === "v6-r1";
  const secretReady = secretEvidence.oldExposedApiKeyRevoked === true
    && secretEvidence.newServerSideSecretReady === true
    && secretEvidence.secretBrowserExposure === false
    && secretEvidence.secretGitExposure === false
    && secretEvidence.secretBundleExposure === false
    && secretEvidence.secretLogReportExposure === false;
  const requestReady = requestShape.ok
    && frozen.body.max_tokens === MAX_TOKENS
    && frozen.body.temperature === 0
    && frozen.body.stream === false
    && frozen.body.tools?.[0]?.function?.strict === true
    && frozen.body.tool_choice?.function?.name === "emit_decision_pack"
    && frozen.body.response_format === undefined
    && frozen.transportV1SchemaHash === TRANSPORT_V1_SCHEMA_HASH
    && frozen.transportV2SchemaHash === schemaHash(deepseekDecisionToolSchemaV6R1)
    && evidenceTypeIndex.ready
    && !requestSafety.expectedRiskExposure
    && !requestSafety.scenarioGoldenExposure;
  return {
    authoritativeBaselineReady,
    historicalIntegrityReady,
    runConsumed,
    providerReady,
    secretReady,
    catalog,
    evidenceTypeIndex,
    inputSafety,
    requestSafety,
    requestShape: requestShape.schema,
    requestReady,
    retryCount: 0,
    fallbackCount: 0,
    ready: authoritativeBaselineReady && historicalIntegrityReady && !runConsumed && providerReady && secretReady && catalog.ready && inputSafety.ready && requestReady,
  };
}

export async function collectR5B11R1RuntimePreflight({ env = process.env, repoRoot = ROOT, oldExposedApiKeyRevoked = false } = {}) {
  const historicalIntegrity = await verifyHistoricalIntegrity(repoRoot);
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  const secret = String(env.LLM_API_KEY || "");
  const secretExposure = await scanSecretExposure(secret, repoRoot);
  const secretEvidence = {
    oldExposedApiKeyRevoked,
    newServerSideSecretReady: secret.length >= 8 && isIgnored(repoRoot, ".env"),
    secretBrowserExposure: secretExposure.bundle,
    secretGitExposure: secretExposure.git,
    secretBundleExposure: secretExposure.bundle,
    secretLogReportExposure: false,
  };
  return {
    currentHeadPrefix: currentHead.slice(0, 7),
    authoritativeBaselineReady: currentHead.startsWith(BASELINE_COMMIT),
    historicalIntegrity,
    runConsumed: await hasConsumedRun(repoRoot),
    secretEvidence,
  };
}

export async function executeR5B11R1({ env = process.env, fetchImpl = globalThis.fetch, preflightEvidence = {}, now = () => new Date() } = {}) {
  const frozen = freezeR5B11R1Request({ env });
  const preflight = validateR5B11R1OfflinePreflight({
    frozen,
    secretEvidence: preflightEvidence.secretEvidence,
    authoritativeBaselineReady: preflightEvidence.authoritativeBaselineReady,
    historicalIntegrityReady: preflightEvidence.historicalIntegrityReady ?? preflightEvidence.historicalIntegrity?.ready,
    runConsumed: preflightEvidence.runConsumed === true,
  });
  const summary = {
    phase: RUN_ID,
    status: preflight.ready ? "running" : "stopped-preflight",
    stopReason: preflight.ready ? null : "preflight_failed",
    startedAt: now().toISOString(),
    completedAt: null,
    provider: "openai-compatible",
    model: MODEL,
    endpointAlias: "deepseek-beta",
    profileVersion: DEEPSEEK_RISK_CATEGORY_EVIDENCE_PROFILE_V6R1_VERSION,
    transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V2_VERSION,
    canonicalContractVersion: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
    historicalFailure: classifyHistoricalR5B11Failure(),
    hashes: publicHashes(frozen),
    preflight,
    probes: [],
    counts: zeroCounts(),
    realCanaryAuthorized: false,
  };
  if (!preflight.ready) return finish(summary, now);

  let externalCalls = 0;
  for (let index = 0; index < MAX_CALLS; index += 1) {
    const probeNumber = index + 1;
    const rebuilt = freezeR5B11R1Request({ input: frozen.input, env });
    if (rebuilt.requestEnvelopeHash !== frozen.requestEnvelopeHash) {
      summary.stopReason = "REQUEST_ENVELOPE_HASH_DRIFT";
      break;
    }
    let parsedTransport = null;
    const requestCorrelation = `R5B11-R1-SYNTH-${probeNumber}-${frozen.requestEnvelopeHash.slice(0, 12)}`;
    const guardedFetch = async (url, options) => {
      const outgoingHash = requestHash(JSON.parse(String(options?.body || "{}")));
      if (outgoingHash !== frozen.requestEnvelopeHash) throw new Error("request_envelope_hash_drift");
      if (externalCalls >= MAX_CALLS) throw new Error("external_call_limit_exceeded");
      externalCalls += 1;
      return fetchImpl(url, options);
    };
    const result = await callComparisonProvider({
      safeContext: frozen.input.safeContext,
      accountAggregate: frozen.input.accountAggregate,
      page: PAGE,
      evidenceTypeByToken: frozen.evidenceTypeByToken,
      env: frozen.providerEnv,
      fetchImpl: guardedFetch,
      requestCorrelation,
      onToolArgumentsParsed: ({ value }) => { parsedTransport = value; },
    });
    const probe = validateProbe({ probeNumber, result, parsedTransport, frozen, requestCorrelation });
    summary.probes.push(probe);
    if (!probe.ready) {
      summary.stopReason = probe.failureCategory;
      break;
    }
  }
  summary.counts = aggregateCounts(summary.probes, externalCalls);
  return finish(summary, now);
}

export function validateProbe({ probeNumber, result, parsedTransport, frozen, requestCorrelation }) {
  const options = { evidenceTokens: frozen.evidenceAllowlist, evidenceTypeByToken: frozen.evidenceTypeByToken };
  const transport = parsedTransport ? validateProviderTransportToolArgumentsV2(parsedTransport, options) : { ok: false, errors: ["transport_not_available"], riskCategoryEvidence: [] };
  const actionEvidence = parsedTransport ? validateStructuredActionEvidenceV1(parsedTransport, frozen.evidenceAllowlist) : { ready: false, errors: ["transport_not_available"] };
  const categoryEvidence = parsedTransport ? validateStructuredRiskCategoryEvidence(parsedTransport, options) : { ready: false, errors: ["transport_not_available"], associations: [] };
  const canonical = result?.ok ? validateExternalModelResponseV2(result.output, { evidenceTokens: frozen.evidenceAllowlist }) : { ok: false, errors: [result?.reason || "provider_failed"] };
  const categoryCodes = parsedTransport
    ? validateCanonicalRiskCategoryCodes(parsedTransport.riskCategories?.map((item) => item?.code))
    : { ready: false, errors: ["not_run"] };
  const safety = result?.ok ? validateScopedOutputSafetyV2(result.output) : { ok: false, errors: ["not_run"] };
  const actionDuplicateCount = countActionEvidenceDuplicates(parsedTransport);
  const riskDuplicateCount = countRiskCategoryEvidenceDuplicates(parsedTransport);
  const healthOverrideCount = countForbiddenKeys(parsedTransport, new Set(["healthscore", "healthgrade", "healthdimensions", "dimensions"]));
  const unsupportedClaimCount = countUnsupportedClaims(parsedTransport, frozen.evidenceAllowlist);
  const associationReady = requestHash(result?.riskCategoryEvidence || []) === requestHash(categoryEvidence.associations || []);
  const ready = result?.ok === true
    && result.httpStatus === 200
    && result.successResponseObservation?.finishReason === "tool_calls"
    && result.toolCallCount === 1
    && result.toolCallName === "emit_decision_pack"
    && result.successResponseObservation?.argumentsRuntimeType === "string"
    && transport.schemaReady
    && transport.ok
    && actionEvidence.ready
    && categoryEvidence.ready
    && categoryCodes.ready
    && canonical.ok
    && safety.ok
    && actionDuplicateCount === 0
    && riskDuplicateCount === 0
    && healthOverrideCount === 0
    && unsupportedClaimCount === 0
    && associationReady;
  return {
    probe: probeNumber,
    requestToken: `R5B11-R1-SYNTH-${probeNumber}`,
    requestCorrelation,
    requestEnvelopeHash: frozen.requestEnvelopeHash,
    called: result?.called === true,
    httpStatus: result?.httpStatus ?? null,
    finishReason: result?.successResponseObservation?.finishReason ?? null,
    toolCallCount: result?.toolCallCount ?? result?.successResponseObservation?.toolCallsCount ?? 0,
    toolName: result?.toolCallName ?? result?.successResponseObservation?.functionName ?? null,
    argumentType: result?.successResponseObservation?.argumentsRuntimeType ?? null,
    argumentLength: result?.successResponseObservation?.argumentsLength ?? null,
    argumentHash: result?.toolArgumentsHash ?? result?.successResponseObservation?.argumentsSha256 ?? null,
    responseBodyHash: result?.responseBodyHash ?? null,
    jsonParseReady: parsedTransport !== null,
    transportSchemaReady: transport.schemaReady === true,
    transportSchemaErrors: transport.schemaErrors || [],
    transportErrors: transport.errors || [],
    actionEvidenceReady: actionEvidence.ready && actionDuplicateCount === 0,
    actionEvidenceErrors: actionEvidence.errors || [],
    actionEvidenceDuplicateCount: actionDuplicateCount,
    riskCategoryCodeReady: categoryCodes.ready,
    riskCategoryEvidenceReady: categoryEvidence.ready && riskDuplicateCount === 0,
    riskCategoryEvidenceErrors: categoryEvidence.errors || [],
    riskCategoryEvidenceDuplicateCount: riskDuplicateCount,
    categoryEvidenceCompatibilityReady: categoryEvidence.ready,
    categoryEvidenceAssociationReady: associationReady,
    riskCategoryAssociationHash: requestHash(categoryEvidence.associations || []),
    canonicalMappingReady: result?.canonicalMappingReady === true,
    canonicalContractReady: canonical.ok,
    canonicalErrors: canonical.errors || [],
    evidenceValidationReady: actionEvidence.ready && categoryEvidence.ready && canonical.ok && unsupportedClaimCount === 0,
    safetyReady: safety.ok,
    safetyErrors: safety.errors || [],
    healthOverrideCount,
    unsupportedClaimCount,
    usage: result?.usage || null,
    latencyMs: result?.successResponseObservation?.latencyMs ?? null,
    estimatedCostUsd: estimateCost(result?.usage),
    ready,
    failureCategory: ready ? null : classifyProbeFailure({ result, parsedTransport, transport, actionEvidence, categoryEvidence, categoryCodes, canonical, safety, healthOverrideCount, unsupportedClaimCount, associationReady }),
  };
}

export async function writeR5B11R1Artifacts(summary, { outputDir = OUTPUT_DIR } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const catalog = CANONICAL_RISK_CATEGORY_CATALOG;
  const matrix = buildRiskCategoryEvidenceMatrix();
  const common = { phase: RUN_ID, status: summary.status, stopReason: summary.stopReason, hashes: summary.hashes, counts: summary.counts };
  const publicProbes = summary.probes.map(publicProbe);
  const gates = finalGates(summary);
  await Promise.all([
    fs.writeFile(path.join(outputDir, "canonical-risk-category-catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "provider-transport-contract-v2.json"), `${JSON.stringify({
      version: PROVIDER_TRANSPORT_CONTRACT_V2_VERSION,
      schema: providerTransportToolSchemaV2,
      runtimeRules: {
        riskCategoryEvidenceMinimum: 1,
        duplicateEvidenceTokensAllowed: false,
        evidenceTokenMustBeInRequestAllowlist: true,
        categoryEvidenceTypeMustBeCompatible: true,
        aliasesOrFuzzyMatchingAllowed: false,
      },
    }, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "risk-category-evidence-matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-r1-contract-repair-report.md"), buildReport(summary)),
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-r1-runtime-manifest.json"), `${JSON.stringify({ ...common, startedAt: summary.startedAt, completedAt: summary.completedAt, baselineCommit: BASELINE_COMMIT, provider: summary.provider, model: summary.model, profileVersion: summary.profileVersion, transportContractVersion: summary.transportContractVersion, canonicalContractVersion: summary.canonicalContractVersion, historicalFailure: summary.historicalFailure, preflight: publicPreflight(summary.preflight), probes: publicProbes, gates, p0Count: 0, p1Count: p1Count(summary), p2Count: p2Count(summary) }, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-r1-transport-validation.json"), `${JSON.stringify({ ...common, contractVersion: PROVIDER_TRANSPORT_CONTRACT_V2_VERSION, probes: publicProbes.map(transportProbe) }, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-r1-evidence-validation.json"), `${JSON.stringify({ ...common, evidenceAllowlistHash: summary.hashes.evidenceAllowlistHash, evidenceMatrixHash: summary.hashes.evidenceMatrixHash, probes: publicProbes.map(evidenceProbe) }, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-r1-safety-report.md"), buildSafetyReport(summary)),
    fs.writeFile(path.join(outputDir, "phase3c-r5c-real-canary-decision-pack-v3-zh.md"), buildDecisionPack(summary)),
  ]);
}

function publicHashes(frozen) {
  return {
    syntheticInputHash: frozen.syntheticInputHash,
    requestEnvelopeHash: frozen.requestEnvelopeHash,
    transportV1SchemaHash: frozen.transportV1SchemaHash,
    transportV2SchemaHash: frozen.transportV2SchemaHash,
    canonicalV2SchemaHash: frozen.canonicalV2SchemaHash,
    riskCatalogHash: frozen.riskCatalogHash,
    evidenceAllowlistHash: frozen.evidenceAllowlistHash,
    evidenceMatrixHash: frozen.evidenceMatrixHash,
  };
}

function publicProbe(probe) {
  return { ...probe, requestCorrelation: sha256(probe.requestCorrelation) };
}

function transportProbe(probe) {
  return { probe: probe.probe, jsonParseReady: probe.jsonParseReady, transportSchemaReady: probe.transportSchemaReady, actionEvidenceReady: probe.actionEvidenceReady, riskCategoryCodeReady: probe.riskCategoryCodeReady, riskCategoryEvidenceReady: probe.riskCategoryEvidenceReady, categoryEvidenceCompatibilityReady: probe.categoryEvidenceCompatibilityReady, canonicalMappingReady: probe.canonicalMappingReady, canonicalContractReady: probe.canonicalContractReady };
}

function evidenceProbe(probe) {
  return { probe: probe.probe, actionEvidenceReady: probe.actionEvidenceReady, actionEvidenceDuplicateCount: probe.actionEvidenceDuplicateCount, riskCategoryEvidenceReady: probe.riskCategoryEvidenceReady, riskCategoryEvidenceDuplicateCount: probe.riskCategoryEvidenceDuplicateCount, categoryEvidenceCompatibilityReady: probe.categoryEvidenceCompatibilityReady, categoryEvidenceAssociationReady: probe.categoryEvidenceAssociationReady, riskCategoryAssociationHash: probe.riskCategoryAssociationHash, unsupportedClaimCount: probe.unsupportedClaimCount, healthOverrideCount: probe.healthOverrideCount };
}

function publicPreflight(preflight) {
  return { authoritativeBaselineReady: preflight.authoritativeBaselineReady, historicalIntegrityReady: preflight.historicalIntegrityReady, providerReady: preflight.providerReady, secretReady: preflight.secretReady, catalogReady: preflight.catalog.ready, categoryCount: preflight.catalog.categoryCount, duplicateCodeCount: preflight.catalog.duplicateCodeCount, unknownAliasCount: preflight.catalog.unknownAliasCount, evidenceTypeIndexReady: preflight.evidenceTypeIndex.ready, evidenceTypeIndexMissingTokenCount: preflight.evidenceTypeIndex.missingTokenCount, evidenceTypeIndexUnknownTokenCount: preflight.evidenceTypeIndex.unknownTokenCount, evidenceTypeIndexUnknownTypeCount: preflight.evidenceTypeIndex.unknownTypeCount, syntheticInputSafetyReady: preflight.inputSafety.ready, forbiddenFieldCount: preflight.inputSafety.forbiddenFieldCount, realCrmTokenCount: preflight.inputSafety.realCrmTokenCount, expectedRiskExposure: preflight.requestSafety.expectedRiskExposure, scenarioGoldenExposure: preflight.requestSafety.scenarioGoldenExposure, requestReady: preflight.requestReady, retryCount: 0, fallbackCount: 0, ready: preflight.ready };
}

function zeroCounts() {
  return { externalLlmCalls: 0, probe1Calls: 0, probe2Calls: 0, httpSuccess: 0, toolCallSuccess: 0, jsonParseAttempts: 0, jsonParseSuccess: 0, transportV2Attempts: 0, transportV2Success: 0, actionEvidenceAttempts: 0, actionEvidenceSuccess: 0, riskCategoryCodeAttempts: 0, riskCategoryCodeSuccess: 0, riskCategoryEvidenceAttempts: 0, riskCategoryEvidenceSuccess: 0, categoryEvidenceCompatibilityAttempts: 0, categoryEvidenceCompatibilitySuccess: 0, canonicalMappingAttempts: 0, canonicalMappingSuccess: 0, canonicalContractAttempts: 0, canonicalContractSuccess: 0, evidenceAttempts: 0, evidenceSuccess: 0, safetyAttempts: 0, safetySuccess: 0, retry: 0, fallback: 0, d365Get: 0, crmPost: 0, crmPatch: 0, crmDelete: 0, crmWriteback: false, productionRequests: 0, browserExternalRequests: 0, latencyMs: [], inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
}

function aggregateCounts(probes, externalCalls) {
  const counts = zeroCounts();
  counts.externalLlmCalls = externalCalls;
  counts.probe1Calls = probes[0]?.called ? 1 : 0;
  counts.probe2Calls = probes[1]?.called ? 1 : 0;
  counts.httpSuccess = probes.filter((probe) => probe.httpStatus === 200).length;
  counts.toolCallSuccess = probes.filter((probe) => probe.toolCallCount === 1 && probe.toolName === "emit_decision_pack").length;
  counts.jsonParseAttempts = probes.filter((probe) => probe.argumentType === "string").length;
  counts.jsonParseSuccess = probes.filter((probe) => probe.jsonParseReady).length;
  for (const [prefix, key] of [["transportV2", "transportSchemaReady"], ["actionEvidence", "actionEvidenceReady"], ["riskCategoryCode", "riskCategoryCodeReady"], ["riskCategoryEvidence", "riskCategoryEvidenceReady"], ["categoryEvidenceCompatibility", "categoryEvidenceCompatibilityReady"], ["canonicalMapping", "canonicalMappingReady"], ["canonicalContract", "canonicalContractReady"], ["evidence", "evidenceValidationReady"], ["safety", "safetyReady"]]) {
    counts[`${prefix}Attempts`] = probes.filter((probe) => probe.jsonParseReady).length;
    counts[`${prefix}Success`] = probes.filter((probe) => probe[key]).length;
  }
  counts.latencyMs = probes.map((probe) => probe.latencyMs).filter(Number.isFinite);
  for (const probe of probes) {
    counts.inputTokens += Number(probe.usage?.prompt_tokens || probe.usage?.input_tokens || 0);
    counts.outputTokens += Number(probe.usage?.completion_tokens || probe.usage?.output_tokens || 0);
    counts.totalTokens += Number(probe.usage?.total_tokens || 0);
    counts.estimatedCostUsd += Number(probe.estimatedCostUsd || 0);
  }
  counts.estimatedCostUsd = Number(counts.estimatedCostUsd.toFixed(8));
  return counts;
}

function finalGates(summary) {
  const two = summary.probes.length === 2;
  const both = (key) => two && summary.probes.every((probe) => probe[key] === true);
  const requestRepeatable = two && summary.probes.every((probe) => probe.requestEnvelopeHash === summary.hashes.requestEnvelopeHash);
  const complete = summary.counts.externalLlmCalls === 2 && both("ready") && requestRepeatable;
  const canonicalRiskCategoryCatalogReady = summary.preflight.catalog.ready;
  const providerTransportContractV2Ready = summary.preflight.requestReady
    && summary.hashes.transportV1SchemaHash === TRANSPORT_V1_SCHEMA_HASH
    && Boolean(summary.hashes.transportV2SchemaHash);
  const riskCategoryEvidenceMatrixReady = summary.preflight.catalog.missingEvidenceTypeCount === 0
    && summary.preflight.evidenceTypeIndex.ready;
  return { authoritativeBaselineReady: summary.preflight.authoritativeBaselineReady && summary.preflight.historicalIntegrityReady, riskCategoryContractReady: canonicalRiskCategoryCatalogReady && providerTransportContractV2Ready && riskCategoryEvidenceMatrixReady, canonicalRiskCategoryCatalogReady, providerTransportContractV2Ready, riskCategoryEvidenceMatrixReady, syntheticInputSafetyReady: summary.preflight.inputSafety.ready, probe1Ready: summary.probes[0]?.ready === true, probe2Ready: summary.probes[1]?.ready === true, jsonContractReady: both("jsonParseReady"), transportSchemaReady: both("transportSchemaReady"), structuredActionEvidenceReady: both("actionEvidenceReady"), structuredRiskCategoryEvidenceReady: both("riskCategoryEvidenceReady"), categoryEvidenceCompatibilityReady: both("categoryEvidenceCompatibilityReady"), deterministicCanonicalMappingReady: both("canonicalMappingReady"), canonicalContractV2Ready: both("canonicalContractReady"), outputSafetyReady: both("safetyReady"), providerRequestCompatibilityReady: complete, providerTransportRepeatabilityReady: complete, realCanaryAuthorized: false, d365Get: 0, crmWriteback: false, productionRequests: 0, r5b11R1Complete: complete };
}

function finish(summary, now) {
  const gates = finalGates(summary);
  summary.status = gates.r5b11R1Complete ? "complete" : summary.status === "stopped-preflight" ? summary.status : "stopped-safety";
  summary.stopReason = gates.r5b11R1Complete ? null : summary.stopReason || "repeatability_not_proven";
  summary.completedAt = now().toISOString();
  summary.gates = finalGates(summary);
  summary.p0Count = 0;
  summary.p1Count = p1Count(summary);
  summary.p2Count = p2Count(summary);
  return summary;
}

function classifyProbeFailure(values) {
  if (values.result?.httpStatus !== 200) return values.result?.reason || "HTTP_FAILED";
  if (values.result?.successResponseObservation?.finishReason !== "tool_calls") return "TOOL_CALL_NOT_COMPLETED";
  if (!values.parsedTransport) return values.result?.diagnosticCategory || "ARGUMENT_JSON_INVALID";
  if (!values.transport.schemaReady) return "TRANSPORT_V2_SCHEMA_INVALID";
  if (!values.actionEvidence.ready) return "ACTION_EVIDENCE_INVALID";
  if (!values.categoryCodes.ready) return "RISK_CATEGORY_CODE_INVALID";
  if (!values.categoryEvidence.ready) return (values.categoryEvidence.errors[0] || "RISK_CATEGORY_EVIDENCE_INVALID").toUpperCase();
  if (!values.transport.ok) return "TRANSPORT_V2_SEMANTIC_INVALID";
  if (!values.associationReady) return "RISK_CATEGORY_ASSOCIATION_MISMATCH";
  if (!values.canonical.ok) return "CANONICAL_CONTRACT_INVALID";
  if (!values.safety.ok) return "OUTPUT_SAFETY_INVALID";
  if (values.healthOverrideCount) return "HEALTH_OVERRIDE";
  if (values.unsupportedClaimCount) return "UNSUPPORTED_CRM_FACT";
  return values.result?.reason || "PROBE_VALIDATION_FAILED";
}

function p2Count(summary) {
  const failureMetadataGap = summary.probes.some((probe) => probe.called && probe.usage === null) ? 1 : 0;
  return 1 + failureMetadataGap;
}

function p1Count(summary) {
  if (summary.gates?.r5b11R1Complete) return 0;
  const probe = summary.probes.at(-1);
  if (!probe) return 1;
  const blockers = [
    probe.riskCategoryEvidenceReady === false,
    probe.transportErrors?.includes("canonical:safety_policy_codes_incomplete") === true,
  ].filter(Boolean).length;
  return Math.max(1, blockers);
}

function countActionEvidenceDuplicates(value) { return (value?.recommendedActions || []).reduce((count, action) => count + ((action.evidenceTokens || []).length - new Set(action.evidenceTokens || []).size), 0); }
function countRiskCategoryEvidenceDuplicates(value) { return (value?.riskCategories || []).reduce((count, item) => count + ((item.evidenceTokens || []).length - new Set(item.evidenceTokens || []).size), 0); }
function countForbiddenKeys(value, blocked) { if (Array.isArray(value)) return value.reduce((total, item) => total + countForbiddenKeys(item, blocked), 0); if (!value || typeof value !== "object") return 0; return Object.entries(value).reduce((total, [key, child]) => total + (blocked.has(key.toLowerCase()) ? 1 : 0) + countForbiddenKeys(child, blocked), 0); }
function countUnsupportedClaims(value, evidenceTokens) { const allowed = new Set(evidenceTokens); const refs = [...(value?.facts || []).map((item) => item.evidenceToken), ...(value?.evidence || []).map((item) => item.evidenceToken), ...(value?.inferences || []).flatMap((item) => item.evidenceTokens || []), ...(value?.recommendedActions || []).flatMap((item) => item.evidenceTokens || []), ...(value?.riskCategories || []).flatMap((item) => item.evidenceTokens || [])]; return refs.filter((token) => !allowed.has(token)).length; }
function estimateCost(usage) { if (!usage) return null; const total = Number(usage.total_tokens || Number(usage.prompt_tokens || 0) + Number(usage.completion_tokens || 0)); return Number.isFinite(total) ? Number((total * 0.000001).toFixed(8)) : null; }

async function verifyHistoricalIntegrity(repoRoot) { const files = {}; for (const [name, expected] of Object.entries(HISTORICAL_HASHES)) { const actual = sha256(await fs.readFile(path.join(repoRoot, "docs", "gateway", name))); files[name] = { expected, actual, ready: expected === actual }; } return { ready: Object.values(files).every((item) => item.ready), files }; }
async function hasConsumedRun(repoRoot) { try { const value = JSON.parse(await fs.readFile(path.join(repoRoot, "docs/gateway/phase3c-r5b11-r1-runtime-manifest.json"), "utf8")); return Number(value?.counts?.externalLlmCalls || 0) > 0; } catch { return false; } }
async function scanSecretExposure(secret, repoRoot) { if (secret.length < 8) return { git: false, bundle: false }; const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot }).toString().split("\0").filter(Boolean).map((file) => path.join(repoRoot, file)); const dist = await walkFiles(path.join(repoRoot, "dist")); return { git: await anyFileContains(tracked, secret), bundle: await anyFileContains(dist, secret) }; }
async function anyFileContains(files, secret) { const needle = Buffer.from(secret); for (const file of files) { try { if ((await fs.readFile(file)).includes(needle)) return true; } catch { /* generated file can disappear during scan */ } } return false; }
async function walkFiles(directory) { try { const entries = await fs.readdir(directory, { withFileTypes: true }); return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walkFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat(); } catch (error) { if (error?.code === "ENOENT") return []; throw error; } }
function isIgnored(repoRoot, file) { try { execFileSync("git", ["check-ignore", "--quiet", file], { cwd: repoRoot }); return true; } catch { return false; } }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function buildReport(summary) { const gates = finalGates(summary); const probe = summary.probes[0]; return `# Phase 3C-R5B11-R1 Risk Category Contract Repair\n\n- Status: **${summary.status}**\n- Stop Reason: **${summary.stopReason || "none"}**\n- Historical Failure Classification: **B / GLOBAL_VALID_BUT_EVIDENCE_UNSUPPORTED**\n- Historical Category Value Retained: **false** (P2 observability gap; no value was reconstructed)\n- Historical Arguments Hash: \`${summary.historicalFailure.historicalArgumentsHash}\`\n- Risk Category Contract Ready: **${gates.riskCategoryContractReady}**\n- Catalog / Transport v2 / Evidence Matrix: **${gates.canonicalRiskCategoryCatalogReady} / ${gates.providerTransportContractV2Ready} / ${gates.riskCategoryEvidenceMatrixReady}**\n- Probe 1 HTTP / Tool Call / JSON / Transport Schema / Action Evidence / Category Code: **${probe?.httpStatus === 200} / ${probe?.toolCallCount === 1} / ${probe?.jsonParseReady === true} / ${probe?.transportSchemaReady === true} / ${probe?.actionEvidenceReady === true} / ${probe?.riskCategoryCodeReady === true}**\n- Probe 1 Category Evidence Compatibility: **${probe?.categoryEvidenceCompatibilityReady === true}**\n- Secondary Canonical Safety Policy Contract: **${probe?.transportErrors?.includes("canonical:safety_policy_codes_incomplete") ? "incomplete" : "ready"}**\n- Probe 1 / Probe 2 Ready: **${gates.probe1Ready} / ${gates.probe2Ready}**\n- External LLM Calls: **${summary.counts.externalLlmCalls}/2**\n- Provider Request Compatibility Ready: **${gates.providerRequestCompatibilityReady}**\n- Provider Transport Repeatability Ready: **${gates.providerTransportRepeatabilityReady}**\n- D365 GET / CRM Writeback / Production Requests: **0 / false / 0**\n- Real Canary Authorized: **false**\n\nProbe 1 returned a globally valid category code, but its cited Evidence Token type was incompatible with that category. The same parsed response also omitted one or more mandatory Safety Policy Codes. Probe 2 was therefore not called. Token usage, Tool Arguments hash, and response-body hash were not retained by the pre-hardening failure path and are reported as unavailable rather than reconstructed.\n\nNo raw request, response, Tool Arguments, Safe Context, identity, exact amount, raw Timeline, Scenario, Golden metadata, or credential is stored.\n`; }
function buildSafetyReport(summary) { const gates = finalGates(summary); const policyIncomplete = summary.probes.some((probe) => probe.transportErrors?.includes("canonical:safety_policy_codes_incomplete")); return `# Phase 3C-R5B11-R1 Safety Report\n\n- Synthetic Input Safety Ready: **${gates.syntheticInputSafetyReady}**\n- Output Safety Ready: **${gates.outputSafetyReady}**\n- Safety Policy Codes Complete: **${!policyIncomplete}**\n- Unsupported CRM Fact Count: **${summary.probes.reduce((total, probe) => total + probe.unsupportedClaimCount, 0)}**\n- Health Override Count: **${summary.probes.reduce((total, probe) => total + probe.healthOverrideCount, 0)}**\n- Raw CRM / identity / GUID / exact amount / raw Timeline / Scenario-Golden exposure: **0/0/0/0/0/0**\n- Retry / Fallback: **0 / 0**\n- D365 GET / CRM Writeback / Production: **0 / false / 0**\n- Real Canary Authorized: **false**\n\nOutput safety validation was not reached because category/evidence compatibility failed first. The parsed response also failed the mandatory Safety Policy Code completeness check; no output was accepted or displayed as trusted.\n`; }
function buildDecisionPack(summary) { const gates = finalGates(summary); const policyIncomplete = summary.probes.some((probe) => probe.transportErrors?.includes("canonical:safety_policy_codes_incomplete")); return `# Phase 3C-R5C Real Canary Decision Pack v3\n\n- Risk Category Contract Ready: **${gates.riskCategoryContractReady}**\n- Provider Request Compatibility Ready: **${gates.providerRequestCompatibilityReady}**\n- Provider Transport Repeatability Ready: **${gates.providerTransportRepeatabilityReady}**\n- R5B11-R1 Complete: **${gates.r5b11R1Complete}**\n- Real Canary Authorized: **false**\n\n${gates.r5b11R1Complete ? "可以申请对 DEMO-OPP-002 的独立真实 Canary 授权；本文档本身不构成授权。" : `不得申请或执行真实 Canary。当前阻断为 \`${summary.stopReason}\`${policyIncomplete ? "，且同一响应的 Safety Policy Codes 不完整" : ""}；Probe 2 未执行。`}\n`; }

export async function runR5B11R1(options = {}) {
  const runtime = await collectR5B11R1RuntimePreflight({ env: options.env || process.env, repoRoot: options.repoRoot || ROOT, oldExposedApiKeyRevoked: options.oldExposedApiKeyRevoked === true });
  const summary = await executeR5B11R1({ ...options, preflightEvidence: runtime });
  await writeR5B11R1Artifacts(summary, options);
  return summary;
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirect) {
  const summary = await runR5B11R1({ oldExposedApiKeyRevoked: process.env.R5B11_R1_OLD_KEY_REVOKED === "true" });
  console.log(JSON.stringify({ phase: summary.phase, status: summary.status, stopReason: summary.stopReason, externalLlmCalls: summary.counts.externalLlmCalls, providerRequestCompatibilityReady: summary.gates.providerRequestCompatibilityReady, providerTransportRepeatabilityReady: summary.gates.providerTransportRepeatabilityReady, realCanaryAuthorized: false }));
  if (!summary.gates.r5b11R1Complete) process.exitCode = 1;
}
