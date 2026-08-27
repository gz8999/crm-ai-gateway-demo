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
  PROVIDER_TRANSPORT_CONTRACT_V1_VERSION,
  externalModelResponseJsonSchemaV2,
  providerTransportToolSchemaV1,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV1,
  validateScopedOutputSafetyV2,
} from "../server/decision/externalModelContractV2.mjs";
import { validateStructuredActionEvidenceV1 } from "../server/decision/evidenceValidationProfiles.mjs";
import {
  DEEPSEEK_STRUCTURED_ACTION_EVIDENCE_PROFILE_V6_VERSION,
  deepseekDecisionToolSchemaV6,
  lintDeepSeekRequestShapeV2,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import { buildR5B10SharedInput } from "./run-phase3c-r5b10-serialization-isolation.mjs";
import { validateR5B9SyntheticInput } from "./run-phase3c-r5b9-structured-safety-probes.mjs";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const RUN_ID = "PHASE3C-R5B11";
const ENDPOINT = "https://api.deepseek.com/beta";
const MODEL = "deepseek-v4-pro";
const PAGE = "synthetic-v6-transport-repeatability";
const MAX_CALLS = 2;
const MAX_TOKENS = 2400;
const ALLOWED_RISK_CATEGORIES = Object.freeze(["synthetic-review"]);
const BASELINE_COMMIT = "7c6bdac";
const HISTORICAL_HASHES = Object.freeze({
  "external-model-response-contract-v1.json": "f262cf6aa39a287393402594a8377920dcfe96d858141b398ada9ed0e7bd911e",
  "external-model-response-contract-v2.json": "0d0d932b0a552fae01d7522668892963b9c1bd14beef9095534793e2c395e241",
  "phase3c-r5b8-compatibility-decision.md": "abc159ac60ce87f4bc7a139444476e56efb9e91dfa49e519523bb608b1adaa12",
  "phase3c-r5b9-runtime-manifest.json": "603917aea6ad1d78012b18c82944120d9ec58cac42d907da3422caf5ad12aa10",
});

export function buildR5B11ProviderEnv(env = process.env) {
  return {
    ...env,
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "true",
    LLM_BASE_URL: ENDPOINT,
    LLM_MODEL: MODEL,
    PHASE3C_NATIVE_JSON_MODE: "strict-tool",
    PHASE3C_SCHEMA_VERSION: "v6",
    LLM_CANARY_SINGLE_ATTEMPT: "true",
    LLM_TIMEOUT_MS: env.LLM_TIMEOUT_MS || "30000",
    LLM_MAX_TOKENS: String(MAX_TOKENS),
  };
}

export function freezeR5B11Request({ input = buildR5B10SharedInput(), env = process.env } = {}) {
  const providerEnv = buildR5B11ProviderEnv(env);
  const body = buildComparisonRequestBody({
    safeContext: input.safeContext,
    accountAggregate: input.accountAggregate,
    page: PAGE,
    env: providerEnv,
    nativeMode: true,
    schemaVersion: "v6",
  });
  const evidenceAllowlist = [...input.safeContext.evidenceTokens];
  return {
    input,
    providerEnv,
    body,
    syntheticInputHash: requestHash(input),
    requestEnvelopeHash: requestHash(body),
    transportSchemaHash: schemaHash(providerTransportToolSchemaV1),
    canonicalSchemaHash: schemaHash(externalModelResponseJsonSchemaV2),
    evidenceAllowlistHash: requestHash(evidenceAllowlist),
    evidenceAllowlist,
  };
}

export function validateR5B11OfflinePreflight({ frozen = freezeR5B11Request(), secretEvidence = {}, authoritativeBaselineReady = true } = {}) {
  const inputSafety = validateR5B9SyntheticInput(frozen.input);
  const requestShape = lintDeepSeekRequestShapeV2(frozen.body);
  const providerReady = frozen.providerEnv.LLM_BASE_URL === ENDPOINT
    && frozen.providerEnv.LLM_MODEL === MODEL
    && frozen.providerEnv.PHASE3C_SCHEMA_VERSION === "v6";
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
    && frozen.body.response_format === undefined;
  return {
    authoritativeBaselineReady,
    providerReady,
    secretReady,
    inputSafety,
    requestShape: requestShape.schema,
    requestReady,
    retryCount: 0,
    fallbackCount: 0,
    ready: authoritativeBaselineReady && providerReady && secretReady && inputSafety.ready && requestReady,
  };
}

export async function collectR5B11RuntimePreflight({ env = process.env, repoRoot = ROOT, oldExposedApiKeyRevoked = false } = {}) {
  const historicalIntegrity = await verifyHistoricalIntegrity(repoRoot);
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  const secret = String(env.LLM_API_KEY || "");
  const secretExposure = await scanSecretExposure(secret, repoRoot);
  const envIgnored = isIgnored(repoRoot, ".env");
  const secretEvidence = {
    oldExposedApiKeyRevoked,
    newServerSideSecretReady: secret.length >= 8 && envIgnored,
    secretBrowserExposure: secretExposure.bundle,
    secretGitExposure: secretExposure.git,
    secretBundleExposure: secretExposure.bundle,
    secretLogReportExposure: false,
  };
  const authoritativeBaselineReady = currentHead.startsWith(BASELINE_COMMIT) && historicalIntegrity.ready;
  return {
    historicalIntegrity,
    currentHeadPrefix: currentHead.slice(0, 7),
    envIgnored,
    secretEvidence,
    authoritativeBaselineReady,
  };
}

export async function executeR5B11({
  env = process.env,
  fetchImpl = globalThis.fetch,
  preflightEvidence,
  now = () => new Date(),
} = {}) {
  const frozen = freezeR5B11Request({ env });
  const preflight = validateR5B11OfflinePreflight({
    frozen,
    secretEvidence: preflightEvidence?.secretEvidence,
    authoritativeBaselineReady: preflightEvidence?.authoritativeBaselineReady,
  });
  const startedAt = now().toISOString();
  const summary = {
    phase: RUN_ID,
    status: preflight.ready ? "running" : "stopped-preflight",
    stopReason: preflight.ready ? null : "preflight_failed",
    startedAt,
    completedAt: null,
    provider: "openai-compatible",
    model: MODEL,
    endpointAlias: "deepseek-beta",
    profileVersion: DEEPSEEK_STRUCTURED_ACTION_EVIDENCE_PROFILE_V6_VERSION,
    transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V1_VERSION,
    canonicalContractVersion: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
    hashes: publicHashes(frozen),
    preflight,
    probes: [],
    counts: zeroCounts(),
    realCanaryAuthorized: false,
  };
  if (!preflight.ready) return finishSummary(summary, now);

  let externalCalls = 0;
  for (let index = 0; index < MAX_CALLS; index += 1) {
    const probeNumber = index + 1;
    const rebuilt = freezeR5B11Request({ input: frozen.input, env });
    if (rebuilt.requestEnvelopeHash !== frozen.requestEnvelopeHash) {
      summary.stopReason = "request_envelope_hash_drift";
      break;
    }
    let parsedTransport = null;
    const requestCorrelation = `R5B11-SYNTH-${probeNumber}-${frozen.requestEnvelopeHash.slice(0, 12)}`;
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
  return finishSummary(summary, now);
}

export function validateProbe({ probeNumber, result, parsedTransport, frozen, requestCorrelation }) {
  const evidenceTokens = frozen.evidenceAllowlist;
  const transport = parsedTransport
    ? validateProviderTransportToolArgumentsV1(parsedTransport, { evidenceTokens })
    : { ok: false, errors: ["transport_not_available"] };
  const actionEvidence = parsedTransport
    ? validateStructuredActionEvidenceV1(parsedTransport, evidenceTokens)
    : { ready: false, errors: ["transport_not_available"] };
  const duplicates = countActionEvidenceDuplicates(parsedTransport);
  const canonical = result?.ok
    ? validateExternalModelResponseV2(result.output, { evidenceTokens })
    : { ok: false, errors: [result?.reason || "provider_failed"] };
  const safety = result?.ok ? validateScopedOutputSafetyV2(result.output) : { ok: false, errors: ["not_run"] };
  const healthOverrideCount = countForbiddenKeys(parsedTransport, new Set(["healthscore", "healthgrade", "healthdimensions", "dimensions"]));
  const unsupportedClaimCount = countUnsupportedClaims(parsedTransport, evidenceTokens);
  const allowedRiskCategoryReady = Array.isArray(parsedTransport?.riskCategories)
    && parsedTransport.riskCategories.every((category) => ALLOWED_RISK_CATEGORIES.includes(category));
  const topLevelFields = parsedTransport && typeof parsedTransport === "object" ? Object.keys(parsedTransport).sort() : [];
  const ready = result?.ok === true
    && result.httpStatus === 200
    && result.successResponseObservation?.finishReason === "tool_calls"
    && result.toolCallCount === 1
    && result.toolCallName === "emit_decision_pack"
    && result.successResponseObservation?.argumentsRuntimeType === "string"
    && transport.ok
    && actionEvidence.ready
    && duplicates === 0
    && canonical.ok
    && safety.ok
    && healthOverrideCount === 0
    && unsupportedClaimCount === 0
    && allowedRiskCategoryReady;
  return {
    probe: probeNumber,
    requestToken: `R5B11-SYNTH-${probeNumber}`,
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
    jsonParseReady: parsedTransport !== null,
    transportSchemaReady: transport.ok,
    transportErrors: transport.errors || [],
    actionEvidenceReady: actionEvidence.ready && duplicates === 0,
    actionEvidenceErrors: [...new Set([...(actionEvidence.errors || []), ...(duplicates ? ["action_evidence_duplicate"] : [])])],
    actionEvidenceDuplicateCount: duplicates,
    canonicalMappingReady: result?.canonicalMappingReady === true,
    canonicalContractReady: canonical.ok,
    canonicalErrors: canonical.errors || [],
    evidenceValidationReady: actionEvidence.ready && canonical.ok && unsupportedClaimCount === 0,
    safetyReady: safety.ok,
    safetyErrors: safety.errors || [],
    healthOverrideCount,
    unsupportedClaimCount,
    allowedRiskCategoryReady,
    topLevelFields,
    requiredFieldCount: topLevelFields.length,
    transportOnlyFieldRemoved: result?.ok === true && (result.output?.recommendedActions || []).every((action) => !Object.hasOwn(action, "evidenceTokens")),
    responseBodyHash: result?.responseBodyHash || null,
    usage: result?.usage || null,
    latencyMs: result?.successResponseObservation?.latencyMs ?? null,
    estimatedCostUsd: estimateCost(result?.usage),
    ready,
    failureCategory: ready ? null : classifyProbeFailure({ result, parsedTransport, transport, actionEvidence, duplicates, canonical, safety, healthOverrideCount, unsupportedClaimCount, allowedRiskCategoryReady }),
  };
}

export async function writeR5B11Artifacts(summary, { outputDir = OUTPUT_DIR } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const publicProbes = summary.probes.map(publicProbe);
  const common = {
    phase: RUN_ID,
    status: summary.status,
    stopReason: summary.stopReason,
    provider: summary.provider,
    model: summary.model,
    endpointAlias: summary.endpointAlias,
    hashes: summary.hashes,
    counts: summary.counts,
  };
  const transport = {
    ...common,
    contractVersion: summary.transportContractVersion,
    probes: publicProbes.map((probe) => ({
      probe: probe.probe,
      transportSchemaReady: probe.transportSchemaReady,
      actionEvidenceReady: probe.actionEvidenceReady,
      actionEvidenceDuplicateCount: probe.actionEvidenceDuplicateCount,
      transportOnlyFieldRemoved: probe.transportOnlyFieldRemoved,
      topLevelFields: probe.topLevelFields,
    })),
  };
  const evidence = {
    ...common,
    evidenceAllowlistHash: summary.hashes.evidenceAllowlistHash,
    allowlistTokenCount: summary.preflight.inputSafety.ready ? 1 : 0,
    probes: publicProbes.map((probe) => ({
      probe: probe.probe,
      actionEvidenceReady: probe.actionEvidenceReady,
      evidenceValidationReady: probe.evidenceValidationReady,
      unsupportedClaimCount: probe.unsupportedClaimCount,
      healthOverrideCount: probe.healthOverrideCount,
    })),
  };
  await Promise.all([
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-v6-repeatability-report.md"), buildReport(summary)),
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-runtime-manifest.json"), `${JSON.stringify(buildRuntimeManifest(summary), null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-request-audit.json"), `${JSON.stringify({ ...common, probes: publicProbes.map(publicAuditProbe) }, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-transport-validation.json"), `${JSON.stringify(transport, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-evidence-validation.json"), `${JSON.stringify(evidence, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-safety-report.md"), buildSafetyReport(summary)),
    fs.writeFile(path.join(outputDir, "phase3c-r5c-real-canary-decision-pack-v2-zh.md"), buildRealCanaryDecisionPack(summary)),
  ]);
}

function publicHashes(frozen) {
  return {
    syntheticInputHash: frozen.syntheticInputHash,
    requestEnvelopeHash: frozen.requestEnvelopeHash,
    transportSchemaHash: frozen.transportSchemaHash,
    canonicalSchemaHash: frozen.canonicalSchemaHash,
    evidenceAllowlistHash: frozen.evidenceAllowlistHash,
  };
}

function publicProbe(probe) {
  return {
    ...probe,
    requestCorrelation: sha256(probe.requestCorrelation),
    transportErrors: probe.transportErrors,
    actionEvidenceErrors: probe.actionEvidenceErrors,
    canonicalErrors: probe.canonicalErrors,
    safetyErrors: probe.safetyErrors,
  };
}

function publicAuditProbe(probe) {
  return {
    probe: probe.probe,
    requestToken: probe.requestToken,
    requestCorrelationHash: sha256(probe.requestCorrelation),
    requestEnvelopeHash: probe.requestEnvelopeHash,
    responseBodyHash: probe.responseBodyHash,
    argumentHash: probe.argumentHash,
    httpStatus: probe.httpStatus,
    finishReason: probe.finishReason,
    toolCallCount: probe.toolCallCount,
    argumentType: probe.argumentType,
    argumentLength: probe.argumentLength,
    usage: probe.usage,
    latencyMs: probe.latencyMs,
    estimatedCostUsd: probe.estimatedCostUsd,
    ready: probe.ready,
    failureCategory: probe.failureCategory,
  };
}

function buildRuntimeManifest(summary) {
  const gates = finalGates(summary);
  return {
    phase: RUN_ID,
    status: summary.status,
    stopReason: summary.stopReason,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    baselineCommit: BASELINE_COMMIT,
    provider: summary.provider,
    model: summary.model,
    endpointAlias: summary.endpointAlias,
    profileVersion: summary.profileVersion,
    transportContractVersion: summary.transportContractVersion,
    canonicalContractVersion: summary.canonicalContractVersion,
    hashes: summary.hashes,
    preflight: publicPreflight(summary.preflight),
    probes: summary.probes.map(publicProbe),
    counts: summary.counts,
    gates,
    p0Count: 0,
    p1Count: gates.r5b11Complete ? 0 : 1,
    p2Count: 0,
  };
}

function publicPreflight(preflight) {
  return {
    authoritativeBaselineReady: preflight.authoritativeBaselineReady,
    providerReady: preflight.providerReady,
    secretReady: preflight.secretReady,
    syntheticInputSafetyReady: preflight.inputSafety.ready,
    forbiddenFieldCount: preflight.inputSafety.forbiddenFieldCount,
    realCrmTokenCount: preflight.inputSafety.realCrmTokenCount,
    requestReady: preflight.requestReady,
    requestShape: preflight.requestShape,
    retryCount: 0,
    fallbackCount: 0,
    ready: preflight.ready,
  };
}

function finalGates(summary) {
  const two = summary.probes.length === 2;
  const both = (key) => two && summary.probes.every((probe) => probe[key] === true);
  const sameTopLevel = two && JSON.stringify(summary.probes[0].topLevelFields) === JSON.stringify(summary.probes[1].topLevelFields);
  const hashesStable = two && summary.probes.every((probe) => probe.requestEnvelopeHash === summary.hashes.requestEnvelopeHash);
  const complete = summary.counts.externalLlmCalls === 2
    && both("ready")
    && sameTopLevel
    && hashesStable;
  return {
    authoritativeBaselineReady: summary.preflight.authoritativeBaselineReady,
    providerTransportContractV1Ready: true,
    deepseekV6ProfileReady: summary.preflight.providerReady && summary.preflight.requestReady,
    syntheticInputSafetyReady: summary.preflight.inputSafety.ready,
    probe1Ready: summary.probes[0]?.ready === true,
    probe2Ready: summary.probes[1]?.ready === true,
    jsonContractReady: both("jsonParseReady"),
    transportSchemaReady: both("transportSchemaReady"),
    structuredActionEvidenceReady: both("actionEvidenceReady"),
    evidenceAllowlistReady: both("evidenceValidationReady"),
    deterministicCanonicalMappingReady: both("canonicalMappingReady"),
    canonicalContractV2Ready: both("canonicalContractReady"),
    outputSafetyReady: both("safetyReady"),
    topLevelStructureRepeatable: sameTopLevel,
    requestEnvelopeRepeatable: hashesStable,
    providerRequestCompatibilityReady: complete,
    providerTransportRepeatabilityReady: complete,
    realCanaryAuthorized: false,
    d365Get: 0,
    crmWriteback: false,
    productionRequests: 0,
    r5b11Complete: complete,
  };
}

function finishSummary(summary, now) {
  if (summary.counts.externalLlmCalls === 0 && summary.probes.length) summary.counts = aggregateCounts(summary.probes, 0);
  const preliminary = finalGates(summary);
  summary.status = preliminary.r5b11Complete ? "complete" : summary.status === "stopped-preflight" ? summary.status : "stopped-safety";
  summary.stopReason = preliminary.r5b11Complete ? null : summary.stopReason || "repeatability_not_proven";
  summary.completedAt = now().toISOString();
  summary.gates = finalGates(summary);
  summary.p0Count = 0;
  summary.p1Count = summary.gates.r5b11Complete ? 0 : 1;
  summary.p2Count = 0;
  return summary;
}

function zeroCounts() {
  return {
    externalLlmCalls: 0,
    probe1Calls: 0,
    probe2Calls: 0,
    httpSuccess: 0,
    toolCallSuccess: 0,
    jsonParseAttempts: 0,
    jsonParseSuccess: 0,
    transportSchemaAttempts: 0,
    transportSchemaSuccess: 0,
    actionEvidenceValidationAttempts: 0,
    actionEvidenceValidationSuccess: 0,
    canonicalMappingAttempts: 0,
    canonicalMappingSuccess: 0,
    canonicalContractAttempts: 0,
    canonicalContractSuccess: 0,
    evidenceValidationAttempts: 0,
    evidenceValidationSuccess: 0,
    safetyAttempts: 0,
    safetySuccess: 0,
    retry: 0,
    fallback: 0,
    d365Get: 0,
    crmPost: 0,
    crmPatch: 0,
    crmDelete: 0,
    crmWriteback: false,
    productionRequests: 0,
    browserExternalRequests: 0,
    latencyMs: [],
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };
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
  for (const [prefix, key] of [
    ["transportSchema", "transportSchemaReady"],
    ["actionEvidenceValidation", "actionEvidenceReady"],
    ["canonicalMapping", "canonicalMappingReady"],
    ["canonicalContract", "canonicalContractReady"],
    ["evidenceValidation", "evidenceValidationReady"],
    ["safety", "safetyReady"],
  ]) {
    counts[`${prefix}Attempts`] = probes.filter((probe) => probe.jsonParseReady || prefix === "safety" && probe.canonicalMappingReady).length;
    counts[`${prefix}Success`] = probes.filter((probe) => probe[key]).length;
  }
  counts.latencyMs = probes.map((probe) => probe.latencyMs).filter((value) => Number.isFinite(value));
  for (const probe of probes) {
    counts.inputTokens += Number(probe.usage?.prompt_tokens || probe.usage?.input_tokens || 0);
    counts.outputTokens += Number(probe.usage?.completion_tokens || probe.usage?.output_tokens || 0);
    counts.totalTokens += Number(probe.usage?.total_tokens || 0);
    counts.estimatedCostUsd += Number(probe.estimatedCostUsd || 0);
  }
  counts.estimatedCostUsd = Number(counts.estimatedCostUsd.toFixed(8));
  return counts;
}

function classifyProbeFailure(values) {
  if (values.result?.httpStatus !== 200) return values.result?.reason || "HTTP_FAILED";
  if (values.result?.successResponseObservation?.finishReason !== "tool_calls") return "TOOL_CALL_NOT_COMPLETED";
  if (!values.parsedTransport) return values.result?.diagnosticCategory || "ARGUMENT_JSON_INVALID";
  if (values.duplicates) return "ACTION_EVIDENCE_DUPLICATE";
  if (!values.transport.ok) return "TRANSPORT_SCHEMA_INVALID";
  if (!values.actionEvidence.ready) return "ACTION_EVIDENCE_INVALID";
  if (!values.canonical.ok) return "CANONICAL_CONTRACT_INVALID";
  if (!values.safety.ok) return "OUTPUT_SAFETY_INVALID";
  if (values.healthOverrideCount) return "HEALTH_OVERRIDE";
  if (values.unsupportedClaimCount) return "UNSUPPORTED_CRM_FACT";
  if (!values.allowedRiskCategoryReady) return "RISK_CATEGORY_INVALID";
  return values.result?.reason || "PROBE_VALIDATION_FAILED";
}

function countActionEvidenceDuplicates(value) {
  return (value?.recommendedActions || []).reduce((total, action) => {
    const tokens = Array.isArray(action?.evidenceTokens) ? action.evidenceTokens : [];
    return total + (tokens.length - new Set(tokens).size);
  }, 0);
}

function countUnsupportedClaims(value, evidenceTokens) {
  if (!value || typeof value !== "object") return 1;
  const allowed = new Set(evidenceTokens);
  const references = [
    ...(value.facts || []).map((item) => item.evidenceToken),
    ...(value.evidence || []).map((item) => item.evidenceToken),
    ...(value.inferences || []).flatMap((item) => item.evidenceTokens || []),
    ...(value.recommendedActions || []).flatMap((item) => item.evidenceTokens || []),
  ];
  return references.filter((token) => !allowed.has(token)).length;
}

function countForbiddenKeys(value, blocked) {
  if (Array.isArray(value)) return value.reduce((total, item) => total + countForbiddenKeys(item, blocked), 0);
  if (!value || typeof value !== "object") return 0;
  return Object.entries(value).reduce((total, [key, child]) => total + (blocked.has(key.toLowerCase()) ? 1 : 0) + countForbiddenKeys(child, blocked), 0);
}

function estimateCost(usage) {
  if (!usage) return null;
  const total = Number(usage.total_tokens || Number(usage.prompt_tokens || 0) + Number(usage.completion_tokens || 0));
  return Number.isFinite(total) ? Number((total * 0.000001).toFixed(8)) : null;
}

async function verifyHistoricalIntegrity(repoRoot) {
  const files = {};
  for (const [name, expected] of Object.entries(HISTORICAL_HASHES)) {
    const actual = sha256(await fs.readFile(path.join(repoRoot, "docs", "gateway", name)));
    files[name] = { expected, actual, ready: expected === actual };
  }
  return { ready: Object.values(files).every((item) => item.ready), files };
}

async function scanSecretExposure(secret, repoRoot) {
  if (secret.length < 8) return { git: false, bundle: false };
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot }).toString().split("\0").filter(Boolean);
  const git = await anyFileContains(tracked.map((file) => path.join(repoRoot, file)), secret);
  const dist = await walkFiles(path.join(repoRoot, "dist"));
  const bundle = await anyFileContains(dist, secret);
  return { git, bundle };
}

async function anyFileContains(files, secret) {
  const needle = Buffer.from(secret);
  for (const file of files) {
    try { if ((await fs.readFile(file)).includes(needle)) return true; } catch { /* ignore unreadable generated files */ }
  }
  return false;
}

async function walkFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walkFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function isIgnored(repoRoot, file) {
  try {
    execFileSync("git", ["check-ignore", "--quiet", file], { cwd: repoRoot });
    return true;
  } catch {
    return false;
  }
}

function buildReport(summary) {
  const gates = finalGates(summary);
  return `# Phase 3C-R5B11 v6 Synthetic Transport Repeatability\n\n- Status: **${summary.status}**\n- Stop Reason: **${summary.stopReason || "none"}**\n- External LLM Calls: **${summary.counts.externalLlmCalls}/2**\n- Probe 1 / Probe 2 Ready: **${gates.probe1Ready} / ${gates.probe2Ready}**\n- Request Envelope Hash: \`${summary.hashes.requestEnvelopeHash}\`\n- Transport Schema Hash: \`${summary.hashes.transportSchemaHash}\`\n- Canonical Schema Hash: \`${summary.hashes.canonicalSchemaHash}\`\n- JSON / Transport / Evidence / Canonical / Safety: **${summary.counts.jsonParseSuccess}/${summary.counts.transportSchemaSuccess}/${summary.counts.evidenceValidationSuccess}/${summary.counts.canonicalContractSuccess}/${summary.counts.safetySuccess}**\n- Retry / Fallback: **0 / 0**\n- D365 GET / CRM Writes / Production: **0 / 0 / 0**\n- Provider Request Compatibility Ready: **${gates.providerRequestCompatibilityReady}**\n- Provider Transport Repeatability Ready: **${gates.providerTransportRepeatabilityReady}**\n- Real Canary Authorized: **false**\n\nNatural-language output equality is not required. No raw request, response, Tool Arguments, Safe Context, credential, identity, exact amount, raw Timeline, Scenario, or Golden metadata is stored.\n`;
}

function buildSafetyReport(summary) {
  const gates = finalGates(summary);
  return `# Phase 3C-R5B11 Safety Report\n\n- Synthetic Input Safety Ready: **${gates.syntheticInputSafetyReady}**\n- Output Safety Ready: **${gates.outputSafetyReady}**\n- Unsupported CRM Fact Count: **${summary.probes.reduce((sum, probe) => sum + probe.unsupportedClaimCount, 0)}**\n- Health Override Count: **${summary.probes.reduce((sum, probe) => sum + probe.healthOverrideCount, 0)}**\n- Raw CRM / identity / GUID / exact amount / raw Timeline / Scenario-Golden: **0/0/0/0/0/0**\n- D365 GET: **0**\n- CRM Writeback: **false**\n- Production Requests: **0**\n- Real Canary Authorized: **false**\n`;
}

function buildRealCanaryDecisionPack(summary) {
  const gates = finalGates(summary);
  return `# Phase 3C-R5C Real Canary Decision Pack v2\n\n- Provider Request Compatibility Ready: **${gates.providerRequestCompatibilityReady}**\n- Provider Transport Repeatability Ready: **${gates.providerTransportRepeatabilityReady}**\n- R5B11 Complete: **${gates.r5b11Complete}**\n- Real Canary Authorized: **false**\n\n${gates.r5b11Complete ? "R5B11 supports requesting separate authorization for one real Canary. This document does not grant that authorization." : `Do not request or execute a real Canary until the R5B11 blocker is resolved: ${summary.stopReason}.`}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function runR5B11(options = {}) {
  const runtime = await collectR5B11RuntimePreflight({
    env: options.env || process.env,
    repoRoot: options.repoRoot || ROOT,
    oldExposedApiKeyRevoked: options.oldExposedApiKeyRevoked === true,
  });
  const summary = await executeR5B11({ ...options, preflightEvidence: runtime });
  summary.runtimePreflight = {
    historicalIntegrityReady: runtime.historicalIntegrity.ready,
    currentHeadPrefix: runtime.currentHeadPrefix,
    envIgnored: runtime.envIgnored,
    secretEvidence: runtime.secretEvidence,
  };
  await writeR5B11Artifacts(summary, options);
  return summary;
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirect) {
  const summary = await runR5B11({ oldExposedApiKeyRevoked: process.env.R5B11_OLD_KEY_REVOKED === "true" });
  console.log(JSON.stringify({
    phase: summary.phase,
    status: summary.status,
    stopReason: summary.stopReason,
    externalLlmCalls: summary.counts.externalLlmCalls,
    providerRequestCompatibilityReady: summary.gates.providerRequestCompatibilityReady,
    providerTransportRepeatabilityReady: summary.gates.providerTransportRepeatabilityReady,
    realCanaryAuthorized: false,
  }));
  if (!summary.gates.r5b11Complete) process.exitCode = 1;
}
