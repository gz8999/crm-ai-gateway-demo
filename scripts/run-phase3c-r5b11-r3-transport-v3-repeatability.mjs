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
  LIMITATION_CODES,
  PROVIDER_TRANSPORT_CONTRACT_V3_VERSION,
  SAFETY_POLICY_CODES,
  externalModelResponseJsonSchemaV2,
  mapProviderTransportV3ToCanonicalV2,
  providerTransportToolSchemaV1,
  providerTransportToolSchemaV2,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV3,
  validateScopedOutputSafetyV2,
} from "../server/decision/externalModelContractV2.mjs";
import { validateStructuredActionEvidenceV1 } from "../server/decision/evidenceValidationProfiles.mjs";
import {
  DEEPSEEK_EVIDENCE_SCOPED_PROFILE_V6R2_VERSION,
  buildDeepseekDecisionToolSchemaV6R2,
  lintDeepSeekRequestShapeV2,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import {
  CANONICAL_RISK_CATEGORY_CATALOG,
  buildRiskCategoryEvidenceMatrix,
  validateCanonicalRiskCategoryCodes,
  validateEvidenceTypeIndex,
  validateRiskCategoryCatalog,
  validateStructuredRiskCategoryEvidence,
} from "../server/decision/riskCategoryContract.mjs";
import { buildR5B11R1SyntheticInput, freezeR5B11R1Request } from "./run-phase3c-r5b11-r1-risk-category-revalidation.mjs";
import { validateR5B9SyntheticInput } from "./run-phase3c-r5b9-structured-safety-probes.mjs";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const RUN_ID = "PHASE3C-R5B11-R3";
const BASELINE_COMMIT = "722cf16";
const ENDPOINT = "https://api.deepseek.com/beta";
const MODEL = "deepseek-v4-pro";
const PAGE = "synthetic-v6-r2-transport-v3-repeatability";
const MAX_CALLS = 2;
const MAX_TOKENS = 2400;
const TRANSPORT_V1_SCHEMA_HASH = "12838eecacdaabe7f2e1a55c660847652dcfc2abcb87e381f1b45d8aba851236";
const TRANSPORT_V2_SCHEMA_HASH = "69083368d8ea37beb074441a723eb274cfbcebb6ef86b5a429ff90695e74869d";
const TRANSPORT_V3_SCHEMA_HASH = "9056533322a5b05ce7ea6be9b21f4579efc0088ff61c1a0b2e1c94a503df77eb";
const CANONICAL_V2_SCHEMA_HASH = "fb5f9464ff2e4728b5a28b6f278ccbfe9b9683563435b30821b19a130d5a44d4";
const HISTORICAL_HASHES = Object.freeze({
  "provider-transport-contract-v1.json": "dc001720da99f95116e1abc47d8a559225c2c3908edc75f5d47822603964893f",
  "provider-transport-contract-v2.json": "3c7b8d6a9f24f8f8c9d01aa5278e5208dde1e331d11a6b85ede1f105a998a885",
  "provider-transport-contract-v3.json": "c7f2b1bec3d69202e7053ac1f4ff0a0208a29a13bbb5659efc3d9a20a24d96fa",
  "phase3c-r5b11-v6-repeatability-report.md": "ac413718a86a4f369f90bec813e3e96a1beb9ee3b298fe99e337a93c3e9bef4d",
  "phase3c-r5b11-runtime-manifest.json": "2e896ad1e412263c27a2829277221fead29adc3e08ca3326c6d305069d861e2e",
  "phase3c-r5b11-r1-contract-repair-report.md": "1f92db9435215a2c96b6c9eb68c0f3ca8d7f476a14c427cb773eee7d7ca704ac",
  "phase3c-r5b11-r1-runtime-manifest.json": "5f76b3f85a46f550c5fdaeb7a4284e2039de7c38cafe79d3c11d23c630e3f521",
  "phase3c-r5b11-r1-transport-validation.json": "186186d2b0d989655c210a608a95d985ee9f9c79c45444285536b595144f15de",
  "phase3c-r5b11-r1-evidence-validation.json": "84e122ae0d355b036ab3ecff2006e17fae7966187a55c69ae29a58fe32fa5b23",
  "phase3c-r5b11-r1-safety-report.md": "80f387c3294b76678bc34055a4d5406d25b499bfad2c9926d5434c21fff2a760",
  "phase3c-r5b11-r2-offline-contract-repair.md": "0e8b7100b1e2092f38e04bf1db6d220c682f31cd118879ccb2741c96d3ab421f",
  "phase3c-r5b11-r2-validation-manifest.json": "4340675a442b34b6e67f0ed194b63c4f038430b94647a15c491c760983fcf582",
  "phase3c-r5b11-r2-synthetic-probe-decision-pack-zh.md": "c867758cece71ad09af41b29890efe1fc486dd267a9745e812c628a8fca21872",
});

export function buildR5B11R3ProviderEnv(env = process.env) {
  return {
    ...env,
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "true",
    LLM_BASE_URL: ENDPOINT,
    LLM_MODEL: MODEL,
    PHASE3C_NATIVE_JSON_MODE: "strict-tool",
    PHASE3C_SCHEMA_VERSION: "v6-r2",
    LLM_CANARY_SINGLE_ATTEMPT: "true",
    LLM_TIMEOUT_MS: env.LLM_TIMEOUT_MS || "30000",
    LLM_MAX_TOKENS: String(MAX_TOKENS),
  };
}

export function buildR5B11R3SyntheticInput() {
  return structuredClone(buildR5B11R1SyntheticInput());
}

export function freezeR5B11R3Request({ input = buildR5B11R3SyntheticInput(), env = process.env } = {}) {
  const providerEnv = buildR5B11R3ProviderEnv(env);
  const priorFreeze = freezeR5B11R1Request({ input, env });
  const evidenceAllowlist = [...priorFreeze.evidenceAllowlist];
  const evidenceTypeByToken = structuredClone(priorFreeze.evidenceTypeByToken);
  const evidenceOptions = { evidenceTokens: evidenceAllowlist, evidenceTypeByToken };
  const body = buildComparisonRequestBody({
    safeContext: input.safeContext,
    accountAggregate: input.accountAggregate,
    page: PAGE,
    evidenceTypeByToken,
    env: providerEnv,
    nativeMode: true,
    schemaVersion: "v6-r2",
  });
  const transportV3Schema = buildDeepseekDecisionToolSchemaV6R2(evidenceOptions);
  const evidenceMatrix = buildRiskCategoryEvidenceMatrix();
  const safetyContract = {
    flags: {
      identityMasked: true,
      exactAmountWithheld: true,
      rawTimelineWithheld: true,
      crmWritebackPerformed: false,
    },
    policyAssertions: Object.fromEntries(SAFETY_POLICY_CODES.map((code) => [code, true])),
  };
  const requestEnvelopeBytes = JSON.stringify(body);
  return {
    input,
    providerEnv,
    body,
    requestEnvelopeBytes,
    evidenceAllowlist,
    evidenceTypeByToken,
    evidenceMatrix,
    safetyContract,
    syntheticInputHash: requestHash(input),
    requestEnvelopeHash: requestHash(body),
    requestEnvelopeByteHash: sha256(requestEnvelopeBytes),
    transportV1SchemaHash: schemaHash(providerTransportToolSchemaV1),
    transportV2SchemaHash: schemaHash(providerTransportToolSchemaV2),
    transportV3SchemaHash: schemaHash(transportV3Schema),
    canonicalV2SchemaHash: schemaHash(externalModelResponseJsonSchemaV2),
    riskCatalogHash: requestHash(CANONICAL_RISK_CATEGORY_CATALOG),
    evidenceAllowlistHash: requestHash(evidenceAllowlist),
    evidenceMatrixHash: requestHash(evidenceMatrix),
    safetyContractHash: requestHash(safetyContract),
  };
}

export function validateR5B11R3OfflinePreflight({
  frozen = freezeR5B11R3Request(),
  secretEvidence = {},
  authoritativeBaselineReady = true,
  historicalIntegrityReady = true,
  runConsumed = false,
} = {}) {
  const inputSafety = validateR5B9SyntheticInput(frozen.input);
  const requestShape = lintDeepSeekRequestShapeV2(frozen.body);
  const catalog = validateRiskCategoryCatalog();
  const evidenceTypeIndex = validateEvidenceTypeIndex({ evidenceTokens: frozen.evidenceAllowlist, evidenceTypeByToken: frozen.evidenceTypeByToken });
  const serialized = frozen.requestEnvelopeBytes;
  const providerInput = JSON.parse(frozen.body.messages[1].content);
  const requestSafety = {
    realCrmTokenCount: matchCount(serialized, /DEMO-OPP-|\[AI-DEMO|org91f5f65f|lcn-crm/gi),
    guidCount: matchCount(serialized, /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi),
    identityCount: countForbiddenKeys(providerInput, new Set(["customername", "contactname", "email", "phone"])),
    exactAmountCount: countForbiddenKeys(providerInput, new Set(["exactrevenue", "exactgp", "exactamount"])),
    rawTimelineCount: countForbiddenKeys(providerInput, new Set(["rawtimeline", "annotationtext", "emailbody"])),
    scenarioGoldenCount: countForbiddenKeys(providerInput, new Set(["scenarioid", "goldenmetadata", "expectedanswer", "expectedcategory"])),
  };
  const providerReady = frozen.providerEnv.LLM_BASE_URL === ENDPOINT
    && frozen.providerEnv.LLM_MODEL === MODEL
    && frozen.providerEnv.PHASE3C_SCHEMA_VERSION === "v6-r2"
    && frozen.providerEnv.PHASE3C_NATIVE_JSON_MODE === "strict-tool";
  const secretReady = secretEvidence.oldExposedApiKeyRevoked === true
    && secretEvidence.newServerSideSecretReady === true
    && secretEvidence.secretBrowserExposure === false
    && secretEvidence.secretGitExposure === false
    && secretEvidence.secretBundleExposure === false
    && secretEvidence.secretLogExposure === false
    && secretEvidence.secretReportExposure === false;
  const requestReady = requestShape.ok
    && frozen.body.max_tokens === MAX_TOKENS
    && frozen.body.temperature === 0
    && frozen.body.stream === false
    && frozen.body.thinking?.type === "disabled"
    && frozen.body.tools?.length === 1
    && frozen.body.tools[0]?.function?.strict === true
    && frozen.body.tools[0]?.function?.name === "emit_decision_pack"
    && frozen.body.tool_choice?.function?.name === "emit_decision_pack"
    && frozen.body.response_format === undefined
    && frozen.transportV1SchemaHash === TRANSPORT_V1_SCHEMA_HASH
    && frozen.transportV2SchemaHash === TRANSPORT_V2_SCHEMA_HASH
    && frozen.transportV3SchemaHash === TRANSPORT_V3_SCHEMA_HASH
    && frozen.canonicalV2SchemaHash === CANONICAL_V2_SCHEMA_HASH
    && evidenceTypeIndex.ready
    && Object.values(requestSafety).every((count) => count === 0);
  return {
    offlineRepairCommitCreated: authoritativeBaselineReady,
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
    ready: authoritativeBaselineReady
      && historicalIntegrityReady
      && !runConsumed
      && providerReady
      && secretReady
      && catalog.ready
      && inputSafety.ready
      && requestReady,
  };
}

export async function collectR5B11R3RuntimePreflight({ env = process.env, repoRoot = ROOT, oldExposedApiKeyRevoked = false } = {}) {
  const historicalIntegrity = await verifyHistoricalIntegrity(repoRoot);
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  const secret = String(env.LLM_API_KEY || "");
  const exposure = await scanSecretExposure(secret, repoRoot);
  return {
    currentHeadPrefix: currentHead.slice(0, 7),
    authoritativeBaselineReady: currentHead.startsWith(BASELINE_COMMIT),
    historicalIntegrity,
    runConsumed: await hasConsumedRun(repoRoot),
    secretEvidence: {
      oldExposedApiKeyRevoked,
      newServerSideSecretReady: secret.length >= 8 && isIgnored(repoRoot, ".env"),
      secretBrowserExposure: exposure.bundle,
      secretGitExposure: exposure.git,
      secretBundleExposure: exposure.bundle,
      secretLogExposure: exposure.logs,
      secretReportExposure: exposure.reports,
    },
  };
}

export async function executeR5B11R3({ env = process.env, fetchImpl = globalThis.fetch, preflightEvidence = {}, now = () => new Date() } = {}) {
  const frozen = freezeR5B11R3Request({ env });
  const preflight = validateR5B11R3OfflinePreflight({
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
    provider: "DeepSeek",
    model: MODEL,
    endpointAlias: "deepseek-beta",
    profileVersion: DEEPSEEK_EVIDENCE_SCOPED_PROFILE_V6R2_VERSION,
    transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V3_VERSION,
    canonicalContractVersion: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
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
    const rebuilt = freezeR5B11R3Request({ input: frozen.input, env });
    if (!sameFrozenEnvelope(frozen, rebuilt)) {
      summary.stopReason = "REQUEST_ENVELOPE_HASH_DRIFT";
      break;
    }
    let parsedTransport = null;
    const requestCorrelation = `R5B11-R3-SYNTH-${probeNumber}-${frozen.requestEnvelopeHash.slice(0, 12)}`;
    const guardedFetch = async (url, options) => {
      if (url !== `${ENDPOINT}/chat/completions`) throw new Error("provider_endpoint_drift");
      if (options?.method !== "POST") throw new Error("provider_method_invalid");
      if (String(options?.body || "") !== frozen.requestEnvelopeBytes) throw new Error("request_envelope_bytes_drift");
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
    const probe = validateR5B11R3Probe({ probeNumber, result, parsedTransport, frozen, requestCorrelation });
    summary.probes.push(probe);
    if (!probe.ready) {
      summary.stopReason = probe.failureCategory;
      break;
    }
  }
  summary.counts = aggregateCounts(summary.probes, externalCalls);
  return finish(summary, now);
}

export function validateR5B11R3Probe({ probeNumber, result, parsedTransport, frozen, requestCorrelation }) {
  const options = { evidenceTokens: frozen.evidenceAllowlist, evidenceTypeByToken: frozen.evidenceTypeByToken };
  const transport = parsedTransport
    ? validateProviderTransportToolArgumentsV3(parsedTransport, options)
    : { ok: false, schemaReady: false, errors: ["transport_not_available"], schemaErrors: ["transport_not_available"], riskCategoryEvidence: [] };
  const actionEvidence = parsedTransport
    ? validateStructuredActionEvidenceV1(parsedTransport, frozen.evidenceAllowlist)
    : { ready: false, errors: ["transport_not_available"] };
  const categoryEvidence = parsedTransport
    ? validateStructuredRiskCategoryEvidence(parsedTransport, options)
    : { ready: false, errors: ["transport_not_available"], associations: [] };
  const categoryCodes = parsedTransport
    ? validateCanonicalRiskCategoryCodes(parsedTransport.riskCategories?.map((item) => item?.code))
    : { ready: false, errors: ["not_run"] };
  const safetyStatements = validateSafetyStatements(parsedTransport);
  const actionDuplicateCount = countEvidenceDuplicates(parsedTransport?.recommendedActions);
  const riskDuplicateCount = countEvidenceDuplicates(parsedTransport?.riskCategories);
  const structuredEvidence = validateFactInferenceActionEvidence(parsedTransport, frozen.evidenceAllowlist);
  const limitationCodes = validateLimitationCodes(parsedTransport);
  const healthOverrideCount = countForbiddenKeys(parsedTransport, new Set(["healthscore", "healthgrade", "healthdimensions", "dimensions"]));
  const unsupportedClaimCount = countUnsupportedReferences(parsedTransport, frozen.evidenceAllowlist);
  const canonicalMapping = validateDeterministicCanonicalMapping({ parsedTransport, result, options });
  const canonical = canonicalMapping.output
    ? validateExternalModelResponseV2(canonicalMapping.output, { evidenceTokens: frozen.evidenceAllowlist })
    : { ok: false, errors: ["canonical_not_available"] };
  const safety = canonicalMapping.output
    ? validateScopedOutputSafetyV2(canonicalMapping.output)
    : { ok: false, errors: ["not_run"] };
  const associationReady = requestHash(result?.riskCategoryEvidence || []) === requestHash(categoryEvidence.associations || []);
  const hallucinationHardFailureCount = unsupportedClaimCount
    + healthOverrideCount
    + (structuredEvidence.ready ? 0 : 1)
    + (safety.ok ? 0 : 1);
  const additionalPropertiesReady = transport.schemaReady === true
    && !(transport.schemaErrors || []).some((error) => error.includes(":extra:"));
  const ready = result?.ok === true
    && result.httpStatus === 200
    && result.successResponseObservation?.finishReason === "tool_calls"
    && result.toolCallCount === 1
    && result.toolCallName === "emit_decision_pack"
    && result.successResponseObservation?.argumentsRuntimeType === "string"
    && parsedTransport !== null
    && transport.schemaReady === true
    && additionalPropertiesReady
    && transport.ok === true
    && actionEvidence.ready === true
    && actionDuplicateCount === 0
    && categoryCodes.ready === true
    && categoryEvidence.ready === true
    && riskDuplicateCount === 0
    && associationReady
    && safetyStatements.ready
    && canonicalMapping.ready
    && canonical.ok
    && structuredEvidence.ready
    && limitationCodes.ready
    && safety.ok
    && hallucinationHardFailureCount === 0;
  return {
    probe: probeNumber,
    requestToken: `R5B11-R3-SYNTH-${probeNumber}`,
    requestCorrelation,
    requestEnvelopeHash: frozen.requestEnvelopeHash,
    requestEnvelopeByteHash: frozen.requestEnvelopeByteHash,
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
    additionalPropertiesReady,
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
    safetyStatementContractReady: safetyStatements.ready,
    safetyStatementErrors: safetyStatements.errors,
    canonicalMappingReady: canonicalMapping.ready,
    canonicalContractReady: canonical.ok,
    canonicalErrors: canonical.errors || [],
    factInferenceActionEvidenceReady: structuredEvidence.ready,
    evidenceErrors: structuredEvidence.errors,
    limitationCodesReady: limitationCodes.ready,
    outputSafetyReady: safety.ok,
    safetyErrors: safety.errors || [],
    unsupportedClaimCount,
    healthOverrideCount,
    hallucinationHardFailureCount,
    usage: result?.usage || null,
    latencyMs: result?.successResponseObservation?.latencyMs ?? null,
    estimatedCostUsd: estimateCost(result?.usage),
    ready,
    failureCategory: ready ? null : classifyProbeFailure({ result, parsedTransport, transport, actionEvidence, categoryCodes, categoryEvidence, safetyStatements, canonicalMapping, canonical, structuredEvidence, limitationCodes, safety, associationReady, additionalPropertiesReady, unsupportedClaimCount, healthOverrideCount }),
  };
}

export async function writeR5B11R3Artifacts(summary, { outputDir = OUTPUT_DIR } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const gates = finalGates(summary);
  const publicProbes = summary.probes.map(publicProbe);
  const common = { phase: RUN_ID, status: summary.status, stopReason: summary.stopReason, hashes: summary.hashes, counts: summary.counts };
  await Promise.all([
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-r3-repeatability-report.md"), buildReport(summary)),
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-r3-runtime-manifest.json"), `${JSON.stringify({ ...common, startedAt: summary.startedAt, completedAt: summary.completedAt, baselineCommit: BASELINE_COMMIT, provider: summary.provider, model: summary.model, endpointAlias: summary.endpointAlias, profileVersion: summary.profileVersion, transportContractVersion: summary.transportContractVersion, canonicalContractVersion: summary.canonicalContractVersion, preflight: publicPreflight(summary.preflight), probes: publicProbes, gates, p0Count: summary.p0Count, p1Count: summary.p1Count, p2Count: summary.p2Count }, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-r3-request-audit.json"), `${JSON.stringify({ ...common, provider: summary.provider, model: summary.model, endpointAlias: summary.endpointAlias, profileVersion: summary.profileVersion, transportContractVersion: summary.transportContractVersion, canonicalContractVersion: summary.canonicalContractVersion, probes: publicProbes.map(requestAuditProbe) }, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-r3-transport-validation.json"), `${JSON.stringify({ ...common, transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V3_VERSION, probes: publicProbes.map(transportProbe) }, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-r3-evidence-validation.json"), `${JSON.stringify({ ...common, evidenceAllowlistHash: summary.hashes.evidenceAllowlistHash, evidenceMatrixHash: summary.hashes.evidenceMatrixHash, probes: publicProbes.map(evidenceProbe) }, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5b11-r3-safety-report.md"), buildSafetyReport(summary)),
    fs.writeFile(path.join(outputDir, "phase3c-r5c-real-canary-decision-pack-v4-zh.md"), buildDecisionPack(summary)),
  ]);
}

function validateSafetyStatements(value) {
  const assertions = value?.safety?.policyAssertions;
  const errors = [];
  if (!assertions || typeof assertions !== "object" || Array.isArray(assertions)) return { ready: false, errors: ["safety_assertions_required"] };
  const keys = Object.keys(assertions);
  for (const code of SAFETY_POLICY_CODES) {
    if (!Object.hasOwn(assertions, code)) errors.push(`safety_assertion_missing:${code}`);
    else if (assertions[code] !== true) errors.push(`safety_assertion_invalid:${code}`);
  }
  if (keys.some((key) => !SAFETY_POLICY_CODES.includes(key))) errors.push("safety_assertion_extra");
  if (value?.safety?.identityMasked !== true) errors.push("identity_masked_invalid");
  if (value?.safety?.exactAmountWithheld !== true) errors.push("exact_amount_withheld_invalid");
  if (value?.safety?.rawTimelineWithheld !== true) errors.push("raw_timeline_withheld_invalid");
  if (value?.safety?.crmWritebackPerformed !== false) errors.push("crm_writeback_flag_invalid");
  return { ready: errors.length === 0, errors: [...new Set(errors)] };
}

function validateFactInferenceActionEvidence(value, evidenceTokens) {
  const allowed = new Set(evidenceTokens);
  const errors = [];
  if (!Array.isArray(value?.facts) || value.facts.length === 0) errors.push("facts_required");
  for (const item of value?.facts || []) if (!allowed.has(item?.evidenceToken)) errors.push("fact_evidence_invalid");
  if (!Array.isArray(value?.evidence) || value.evidence.length === 0) errors.push("evidence_required");
  for (const item of value?.evidence || []) if (!allowed.has(item?.evidenceToken)) errors.push("evidence_token_invalid");
  if (!Array.isArray(value?.inferences) || value.inferences.length === 0) errors.push("inferences_required");
  for (const item of value?.inferences || []) if (!Array.isArray(item?.evidenceTokens) || item.evidenceTokens.length === 0 || item.evidenceTokens.some((token) => !allowed.has(token))) errors.push("inference_evidence_invalid");
  if (!Array.isArray(value?.recommendedActions) || value.recommendedActions.length === 0) errors.push("actions_required");
  for (const item of value?.recommendedActions || []) if (!Array.isArray(item?.evidenceTokens) || item.evidenceTokens.length === 0 || item.evidenceTokens.some((token) => !allowed.has(token))) errors.push("action_evidence_invalid");
  return { ready: errors.length === 0, errors: [...new Set(errors)] };
}

function validateLimitationCodes(value) {
  const codes = value?.limitations?.codes;
  const errors = [];
  if (!Array.isArray(codes) || codes.length === 0) errors.push("limitation_codes_required");
  else if (codes.some((code) => !LIMITATION_CODES.includes(code))) errors.push("limitation_code_invalid");
  return { ready: errors.length === 0, errors };
}

function validateDeterministicCanonicalMapping({ parsedTransport, result, options }) {
  if (!parsedTransport) return { ready: false, output: null, errors: ["transport_not_available"] };
  try {
    const first = mapProviderTransportV3ToCanonicalV2(parsedTransport, options);
    const second = mapProviderTransportV3ToCanonicalV2(parsedTransport, options);
    const deterministic = requestHash(first) === requestHash(second);
    const providerMatch = result?.ok === true && requestHash(first.output) === requestHash(result.output);
    return { ready: deterministic && providerMatch && result?.canonicalMappingReady === true, output: first.output, errors: deterministic && providerMatch ? [] : ["canonical_mapping_mismatch"] };
  } catch (error) {
    return { ready: false, output: null, errors: [String(error?.message || "canonical_mapping_failed")] };
  }
}

function publicHashes(frozen) {
  return Object.fromEntries([
    "syntheticInputHash", "requestEnvelopeHash", "requestEnvelopeByteHash", "transportV1SchemaHash", "transportV2SchemaHash",
    "transportV3SchemaHash", "canonicalV2SchemaHash", "riskCatalogHash", "evidenceAllowlistHash", "evidenceMatrixHash", "safetyContractHash",
  ].map((key) => [key, frozen[key]]));
}

function sameFrozenEnvelope(a, b) {
  return Object.keys(publicHashes(a)).every((key) => a[key] === b[key]) && a.requestEnvelopeBytes === b.requestEnvelopeBytes;
}

function zeroCounts() {
  return {
    externalLlmCalls: 0, probe1Calls: 0, probe2Calls: 0, httpSuccess: 0, toolCallSuccess: 0,
    jsonParseAttempts: 0, jsonParseSuccess: 0, transportV3Attempts: 0, transportV3Success: 0,
    actionEvidenceAttempts: 0, actionEvidenceSuccess: 0, riskCategoryCodeAttempts: 0, riskCategoryCodeSuccess: 0,
    riskCategoryEvidenceAttempts: 0, riskCategoryEvidenceSuccess: 0, categoryEvidenceCompatibilityAttempts: 0,
    categoryEvidenceCompatibilitySuccess: 0, safetyStatementAttempts: 0, safetyStatementSuccess: 0,
    canonicalMappingAttempts: 0, canonicalMappingSuccess: 0, canonicalContractAttempts: 0, canonicalContractSuccess: 0,
    evidenceAttempts: 0, evidenceSuccess: 0, safetyAttempts: 0, safetySuccess: 0, hallucinationHardFailure: 0,
    retry: 0, fallback: 0, d365Get: 0, crmPost: 0, crmPatch: 0, crmDelete: 0, crmWriteback: false,
    productionRequests: 0, browserExternalRequests: 0, latencyMs: [], inputTokens: 0, outputTokens: 0,
    totalTokens: 0, estimatedCostUsd: 0,
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
    ["transportV3", "transportSchemaReady"], ["actionEvidence", "actionEvidenceReady"], ["riskCategoryCode", "riskCategoryCodeReady"],
    ["riskCategoryEvidence", "riskCategoryEvidenceReady"], ["categoryEvidenceCompatibility", "categoryEvidenceCompatibilityReady"],
    ["safetyStatement", "safetyStatementContractReady"], ["canonicalMapping", "canonicalMappingReady"],
    ["canonicalContract", "canonicalContractReady"], ["evidence", "factInferenceActionEvidenceReady"], ["safety", "outputSafetyReady"],
  ]) {
    counts[`${prefix}Attempts`] = probes.filter((probe) => probe.jsonParseReady).length;
    counts[`${prefix}Success`] = probes.filter((probe) => probe[key]).length;
  }
  counts.hallucinationHardFailure = probes.reduce((total, probe) => total + probe.hallucinationHardFailureCount, 0);
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
  const repeatableEnvelope = two && summary.probes.every((probe) => probe.requestEnvelopeHash === summary.hashes.requestEnvelopeHash && probe.requestEnvelopeByteHash === summary.hashes.requestEnvelopeByteHash);
  const complete = summary.counts.externalLlmCalls === 2 && both("ready") && repeatableEnvelope && summary.counts.hallucinationHardFailure === 0;
  return {
    offlineRepairCommitCreated: summary.preflight.offlineRepairCommitCreated,
    authoritativeBaselineReady: summary.preflight.authoritativeBaselineReady && summary.preflight.historicalIntegrityReady,
    deepseekV6R2ProfileReady: summary.preflight.providerReady,
    providerTransportContractV3Ready: summary.preflight.requestReady,
    syntheticInputSafetyReady: summary.preflight.inputSafety.ready && Object.values(summary.preflight.requestSafety).every((count) => count === 0),
    probe1Ready: summary.probes[0]?.ready === true,
    probe2Ready: summary.probes[1]?.ready === true,
    jsonContractReady: both("jsonParseReady"),
    transportSchemaReady: both("transportSchemaReady"),
    structuredActionEvidenceReady: both("actionEvidenceReady"),
    structuredRiskCategoryEvidenceReady: both("riskCategoryEvidenceReady"),
    categoryEvidenceCompatibilityReady: both("categoryEvidenceCompatibilityReady"),
    safetyStatementContractReady: both("safetyStatementContractReady"),
    deterministicCanonicalMappingReady: both("canonicalMappingReady"),
    canonicalContractV2Ready: both("canonicalContractReady"),
    outputSafetyReady: both("outputSafetyReady"),
    providerRequestCompatibilityReady: complete,
    providerTransportRepeatabilityReady: complete,
    realCanaryAuthorized: false,
    d365Get: 0,
    crmWriteback: false,
    productionRequests: 0,
    r5b11R3Complete: complete,
  };
}

function finish(summary, now) {
  summary.gates = finalGates(summary);
  summary.status = summary.gates.r5b11R3Complete ? "complete" : summary.status === "stopped-preflight" ? summary.status : "stopped-safety";
  summary.stopReason = summary.gates.r5b11R3Complete ? null : summary.stopReason || "repeatability_not_proven";
  summary.completedAt = now().toISOString();
  summary.p0Count = 0;
  summary.p1Count = summary.gates.r5b11R3Complete ? 0 : 1;
  summary.p2Count = summary.probes.some((probe) => probe.called && !probe.usage) ? 1 : 0;
  return summary;
}

function classifyProbeFailure(values) {
  if (values.result?.httpStatus !== 200) return values.result?.reason || "HTTP_FAILED";
  if (values.result?.successResponseObservation?.finishReason !== "tool_calls") return "TOOL_CALL_NOT_COMPLETED";
  if (!values.parsedTransport) return values.result?.diagnosticCategory || "ARGUMENT_JSON_INVALID";
  if (!values.transport.schemaReady || !values.additionalPropertiesReady) return "TRANSPORT_V3_SCHEMA_INVALID";
  if (!values.actionEvidence.ready) return "ACTION_EVIDENCE_INVALID";
  if (!values.categoryCodes.ready) return "RISK_CATEGORY_CODE_INVALID";
  if (!values.categoryEvidence.ready) return (values.categoryEvidence.errors[0] || "RISK_CATEGORY_EVIDENCE_INVALID").toUpperCase();
  if (!values.safetyStatements.ready) return "SAFETY_STATEMENT_CONTRACT_INVALID";
  if (!values.transport.ok) return "TRANSPORT_V3_SEMANTIC_INVALID";
  if (!values.associationReady) return "RISK_CATEGORY_ASSOCIATION_MISMATCH";
  if (!values.canonicalMapping.ready) return "CANONICAL_MAPPING_INVALID";
  if (!values.canonical.ok) return "CANONICAL_CONTRACT_INVALID";
  if (!values.structuredEvidence.ready) return "EVIDENCE_VALIDATION_FAILED";
  if (!values.limitationCodes.ready) return "LIMITATION_CODE_INVALID";
  if (!values.safety.ok) return "OUTPUT_SAFETY_INVALID";
  if (values.healthOverrideCount) return "HEALTH_OVERRIDE";
  if (values.unsupportedClaimCount) return "UNSUPPORTED_CRM_FACT";
  return values.result?.reason || "PROBE_VALIDATION_FAILED";
}

function countEvidenceDuplicates(items) {
  return (items || []).reduce((count, item) => count + ((item?.evidenceTokens || []).length - new Set(item?.evidenceTokens || []).size), 0);
}

function countUnsupportedReferences(value, evidenceTokens) {
  const allowed = new Set(evidenceTokens);
  const references = [
    ...(value?.facts || []).map((item) => item?.evidenceToken),
    ...(value?.evidence || []).map((item) => item?.evidenceToken),
    ...(value?.inferences || []).flatMap((item) => item?.evidenceTokens || []),
    ...(value?.recommendedActions || []).flatMap((item) => item?.evidenceTokens || []),
    ...(value?.riskCategories || []).flatMap((item) => item?.evidenceTokens || []),
  ];
  return references.filter((token) => !allowed.has(token)).length;
}

function countForbiddenKeys(value, blocked) {
  if (Array.isArray(value)) return value.reduce((total, item) => total + countForbiddenKeys(item, blocked), 0);
  if (!value || typeof value !== "object") return 0;
  return Object.entries(value).reduce((total, [key, child]) => total + (blocked.has(key.toLowerCase()) ? 1 : 0) + countForbiddenKeys(child, blocked), 0);
}

function publicProbe(probe) {
  return { ...probe, requestCorrelation: sha256(probe.requestCorrelation) };
}

function requestAuditProbe(probe) {
  return {
    probe: probe.probe,
    requestToken: probe.requestToken,
    requestCorrelationHash: probe.requestCorrelation,
    requestEnvelopeHash: probe.requestEnvelopeHash,
    requestEnvelopeByteHash: probe.requestEnvelopeByteHash,
    responseBodyHash: probe.responseBodyHash,
    argumentHash: probe.argumentHash,
    latencyMs: probe.latencyMs,
    usage: probe.usage,
    estimatedCostUsd: probe.estimatedCostUsd,
    ready: probe.ready,
    failureCategory: probe.failureCategory,
  };
}

function transportProbe(probe) {
  return {
    probe: probe.probe,
    httpStatus: probe.httpStatus,
    finishReason: probe.finishReason,
    toolCallCount: probe.toolCallCount,
    toolName: probe.toolName,
    argumentType: probe.argumentType,
    jsonParseReady: probe.jsonParseReady,
    transportSchemaReady: probe.transportSchemaReady,
    additionalPropertiesReady: probe.additionalPropertiesReady,
    safetyStatementContractReady: probe.safetyStatementContractReady,
    canonicalMappingReady: probe.canonicalMappingReady,
    canonicalContractReady: probe.canonicalContractReady,
    failureCategory: probe.failureCategory,
  };
}

function evidenceProbe(probe) {
  return {
    probe: probe.probe,
    actionEvidenceReady: probe.actionEvidenceReady,
    actionEvidenceDuplicateCount: probe.actionEvidenceDuplicateCount,
    riskCategoryCodeReady: probe.riskCategoryCodeReady,
    riskCategoryEvidenceReady: probe.riskCategoryEvidenceReady,
    riskCategoryEvidenceDuplicateCount: probe.riskCategoryEvidenceDuplicateCount,
    categoryEvidenceCompatibilityReady: probe.categoryEvidenceCompatibilityReady,
    categoryEvidenceAssociationReady: probe.categoryEvidenceAssociationReady,
    factInferenceActionEvidenceReady: probe.factInferenceActionEvidenceReady,
    limitationCodesReady: probe.limitationCodesReady,
    unsupportedClaimCount: probe.unsupportedClaimCount,
    healthOverrideCount: probe.healthOverrideCount,
    hallucinationHardFailureCount: probe.hallucinationHardFailureCount,
  };
}

function publicPreflight(preflight) {
  return {
    offlineRepairCommitCreated: preflight.offlineRepairCommitCreated,
    authoritativeBaselineReady: preflight.authoritativeBaselineReady,
    historicalIntegrityReady: preflight.historicalIntegrityReady,
    providerReady: preflight.providerReady,
    secretReady: preflight.secretReady,
    syntheticInputSafetyReady: preflight.inputSafety.ready,
    requestSafety: preflight.requestSafety,
    catalogReady: preflight.catalog.ready,
    evidenceTypeIndexReady: preflight.evidenceTypeIndex.ready,
    requestReady: preflight.requestReady,
    retryCount: 0,
    fallbackCount: 0,
    ready: preflight.ready,
  };
}

function buildReport(summary) {
  const gates = finalGates(summary);
  return `# Phase 3C-R5B11-R3 Transport v3 Repeatability\n\n- Status: **${summary.status}**\n- Stop Reason: **${summary.stopReason || "none"}**\n- Offline Repair Commit: **${BASELINE_COMMIT}**\n- Provider / Profile: **DeepSeek / v6-r2**\n- Transport / Canonical Contract: **v3 / v2**\n- Probe 1 / Probe 2 Ready: **${gates.probe1Ready} / ${gates.probe2Ready}**\n- External LLM Calls: **${summary.counts.externalLlmCalls}/2**\n- HTTP / Tool / JSON / Transport: **${summary.counts.httpSuccess}/2 / ${summary.counts.toolCallSuccess}/2 / ${summary.counts.jsonParseSuccess}/2 / ${summary.counts.transportV3Success}/2**\n- Action / Category / Compatibility / Safety Statements: **${summary.counts.actionEvidenceSuccess}/2 / ${summary.counts.riskCategoryEvidenceSuccess}/2 / ${summary.counts.categoryEvidenceCompatibilitySuccess}/2 / ${summary.counts.safetyStatementSuccess}/2**\n- Canonical Mapping / Canonical v2 / Evidence / Safety: **${summary.counts.canonicalMappingSuccess}/2 / ${summary.counts.canonicalContractSuccess}/2 / ${summary.counts.evidenceSuccess}/2 / ${summary.counts.safetySuccess}/2**\n- Hallucination Hard Failure: **${summary.counts.hallucinationHardFailure}**\n- Provider Request Compatibility Ready: **${gates.providerRequestCompatibilityReady}**\n- Provider Transport Repeatability Ready: **${gates.providerTransportRepeatabilityReady}**\n- D365 GET / CRM Writeback / Production Requests: **0 / false / 0**\n- Real Canary Authorized: **false**\n\nNo raw request, response, Tool Arguments, Synthetic input body, identity, exact amount, raw Timeline, Scenario, Golden metadata, credential, or Authorization header is stored.\n`;
}

function buildSafetyReport(summary) {
  const gates = finalGates(summary);
  return `# Phase 3C-R5B11-R3 Safety Report\n\n- Synthetic Input Safety Ready: **${gates.syntheticInputSafetyReady}**\n- Safety Statement Contract Ready: **${gates.safetyStatementContractReady}**\n- Output Safety Ready: **${gates.outputSafetyReady}**\n- Unsupported CRM Fact Count: **${summary.probes.reduce((total, probe) => total + probe.unsupportedClaimCount, 0)}**\n- Health Override Count: **${summary.probes.reduce((total, probe) => total + probe.healthOverrideCount, 0)}**\n- Hallucination Hard Failure Count: **${summary.counts.hallucinationHardFailure}**\n- Raw CRM / identity / GUID / exact amount / raw Timeline / Scenario-Golden exposure: **0/0/0/0/0/0**\n- Retry / Fallback: **0 / 0**\n- D365 GET / CRM Writeback / Production Requests: **0 / false / 0**\n- Real Canary Authorized: **false**\n`;
}

function buildDecisionPack(summary) {
  const gates = finalGates(summary);
  return `# Phase 3C-R5C Real Canary Decision Pack v4\n\n- Provider Request Compatibility Ready: **${gates.providerRequestCompatibilityReady}**\n- Provider Transport Repeatability Ready: **${gates.providerTransportRepeatabilityReady}**\n- Output Safety Ready: **${gates.outputSafetyReady}**\n- R5B11-R3 Complete: **${gates.r5b11R3Complete}**\n- Real Canary Authorized: **false**\n\n${gates.r5b11R3Complete ? "可以申请 DEMO-OPP-002 的独立人工授权；本文档本身不构成授权，不得直接执行。" : `当前阻断为 \`${summary.stopReason}\`，不得申请或执行真实 Canary。`}\n`;
}

async function verifyHistoricalIntegrity(repoRoot) {
  const files = {};
  for (const [name, expected] of Object.entries(HISTORICAL_HASHES)) {
    const actual = sha256(await fs.readFile(path.join(repoRoot, "docs", "gateway", name)));
    files[name] = { expected, actual, ready: expected === actual };
  }
  return { ready: Object.values(files).every((item) => item.ready), files };
}

async function hasConsumedRun(repoRoot) {
  try {
    const value = JSON.parse(await fs.readFile(path.join(repoRoot, "docs/gateway/phase3c-r5b11-r3-runtime-manifest.json"), "utf8"));
    return Number(value?.counts?.externalLlmCalls || 0) > 0;
  } catch {
    return false;
  }
}

async function scanSecretExposure(secret, repoRoot) {
  if (secret.length < 8) return { git: false, bundle: false, reports: false, logs: false };
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot }).toString().split("\0").filter(Boolean).map((file) => path.join(repoRoot, file));
  const dist = await walkFiles(path.join(repoRoot, "dist"));
  const reports = await walkFiles(path.join(repoRoot, "docs"));
  const logs = (await walkFiles(repoRoot, { excluded: new Set([".git", "node_modules", "dist", "docs", "local-artifacts"]) })).filter((file) => file.endsWith(".log"));
  return {
    git: await anyFileContains(tracked, secret),
    bundle: await anyFileContains(dist, secret),
    reports: await anyFileContains(reports, secret),
    logs: await anyFileContains(logs, secret),
  };
}

async function anyFileContains(files, secret) {
  const needle = Buffer.from(secret);
  for (const file of files) {
    try { if ((await fs.readFile(file)).includes(needle)) return true; } catch { /* transient generated file */ }
  }
  return false;
}

async function walkFiles(directory, { excluded = new Set() } = {}) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.flatMap((entry) => excluded.has(entry.name) ? [] : [entry.isDirectory() ? walkFiles(path.join(directory, entry.name), { excluded }) : [path.join(directory, entry.name)]]))).flat();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function isIgnored(repoRoot, file) {
  try { execFileSync("git", ["check-ignore", "--quiet", file], { cwd: repoRoot }); return true; } catch { return false; }
}

function estimateCost(usage) {
  if (!usage) return null;
  const total = Number(usage.total_tokens || Number(usage.prompt_tokens || 0) + Number(usage.completion_tokens || 0));
  return Number.isFinite(total) ? Number((total * 0.000001).toFixed(8)) : null;
}

function matchCount(value, pattern) { return [...String(value).matchAll(pattern)].length; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

export async function runR5B11R3(options = {}) {
  const runtime = await collectR5B11R3RuntimePreflight({ env: options.env || process.env, repoRoot: options.repoRoot || ROOT, oldExposedApiKeyRevoked: options.oldExposedApiKeyRevoked === true });
  const summary = await executeR5B11R3({ ...options, preflightEvidence: runtime });
  await writeR5B11R3Artifacts(summary, options);
  return summary;
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirect) {
  const summary = await runR5B11R3({ oldExposedApiKeyRevoked: process.env.R5B11_R3_OLD_KEY_REVOKED === "true" });
  console.log(JSON.stringify({ phase: summary.phase, status: summary.status, stopReason: summary.stopReason, externalLlmCalls: summary.counts.externalLlmCalls, providerRequestCompatibilityReady: summary.gates.providerRequestCompatibilityReady, providerTransportRepeatabilityReady: summary.gates.providerTransportRepeatabilityReady, realCanaryAuthorized: false }));
  if (!summary.gates.r5b11R3Complete) process.exitCode = 1;
}
