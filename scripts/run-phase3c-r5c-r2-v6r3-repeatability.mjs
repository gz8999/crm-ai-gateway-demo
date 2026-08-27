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
  PROVIDER_TRANSPORT_CONTRACT_V4_VERSION,
  SAFETY_POLICY_CODES,
  externalModelResponseJsonSchemaV2,
  mapProviderTransportV4ToCanonicalV2,
  providerTransportToolSchemaV1,
  providerTransportToolSchemaV2,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV4,
  validateScopedOutputSafetyV2,
} from "../server/decision/externalModelContractV2.mjs";
import { validateStructuredActionEvidenceV1 } from "../server/decision/evidenceValidationProfiles.mjs";
import {
  DEEPSEEK_SERIALIZATION_HARDENED_PROFILE_V6R3_VERSION,
  buildDeepseekDecisionToolSchemaV6R3,
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
const RUN_ID = "PHASE3C-R5C-R2";
const BASELINE_COMMIT = "f6064a5";
const ENDPOINT = "https://api.deepseek.com/beta";
const MODEL = "deepseek-v4-pro";
const PAGE = "synthetic-v6-r3-transport-v4-repeatability";
const MAX_CALLS = 2;
const MAX_TOKENS = 2400;
const TRANSPORT_V1_SCHEMA_HASH = "12838eecacdaabe7f2e1a55c660847652dcfc2abcb87e381f1b45d8aba851236";
const TRANSPORT_V2_SCHEMA_HASH = "69083368d8ea37beb074441a723eb274cfbcebb6ef86b5a429ff90695e74869d";
const TRANSPORT_V4_SCHEMA_HASH = "be549893663c8f2cf420a021c4ef1b2fccd1c95e0f335591e353a3920484de2b";
const CANONICAL_V2_SCHEMA_HASH = "fb5f9464ff2e4728b5a28b6f278ccbfe9b9683563435b30821b19a130d5a44d4";
const HISTORICAL_HASHES = Object.freeze({
  "provider-transport-contract-v1.json": "dc001720da99f95116e1abc47d8a559225c2c3908edc75f5d47822603964893f",
  "provider-transport-contract-v2.json": "3c7b8d6a9f24f8f8c9d01aa5278e5208dde1e331d11a6b85ede1f105a998a885",
  "provider-transport-contract-v3.json": "c7f2b1bec3d69202e7053ac1f4ff0a0208a29a13bbb5659efc3d9a20a24d96fa",
  "provider-transport-contract-v4.json": "2a6150a09f798cae7741a271e1033450ecb12454f01c12216b32de0bd59917c6",
  "phase3c-r5c-r1-serialization-hardening.md": "cc38a6bb61686bb65756ea338247cc1790ecf35954f635f18ad4637990234238",
  "phase3c-r5c-r1-validation-manifest.json": "455cf92b9823e81858719f9b532849e25f4ef4f5606d6953485558348f916ebd",
  "phase3c-r5c-r2-synthetic-probe-decision-pack-zh.md": "e3c439341cbaf8cc46d7a49dda92e9e6b00bc3bc5bf76877716d5bd7555539be",
});

export function buildR5CR2ProviderEnv(env = process.env) {
  return {
    ...env,
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "true",
    LLM_BASE_URL: ENDPOINT,
    LLM_MODEL: MODEL,
    PHASE3C_NATIVE_JSON_MODE: "strict-tool",
    PHASE3C_SCHEMA_VERSION: "v6-r3",
    LLM_CANARY_SINGLE_ATTEMPT: "true",
    LLM_TIMEOUT_MS: env.LLM_TIMEOUT_MS || "30000",
    LLM_MAX_TOKENS: String(MAX_TOKENS),
  };
}

export function buildR5CR2SyntheticInput() {
  return structuredClone(buildR5B11R1SyntheticInput());
}

export function freezeR5CR2Request({ input = buildR5CR2SyntheticInput(), env = process.env } = {}) {
  const providerEnv = buildR5CR2ProviderEnv(env);
  const priorFreeze = freezeR5B11R1Request({ input, env });
  const evidenceAllowlist = [...priorFreeze.evidenceAllowlist];
  const evidenceTypeByToken = structuredClone(priorFreeze.evidenceTypeByToken);
  const evidenceOptions = {
    evidenceTokens: evidenceAllowlist,
    evidenceTypeByToken,
    provider: "openai-compatible",
    model: MODEL,
    modelVersion: MODEL,
  };
  const body = buildComparisonRequestBody({
    safeContext: input.safeContext,
    accountAggregate: input.accountAggregate,
    page: PAGE,
    evidenceTypeByToken,
    env: providerEnv,
    nativeMode: true,
    schemaVersion: "v6-r3",
  });
  const transportV4Schema = buildDeepseekDecisionToolSchemaV6R3(evidenceOptions);
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
    transportV4SchemaHash: schemaHash(transportV4Schema),
    canonicalV2SchemaHash: schemaHash(externalModelResponseJsonSchemaV2),
    riskCatalogHash: requestHash(CANONICAL_RISK_CATEGORY_CATALOG),
    evidenceAllowlistHash: requestHash(evidenceAllowlist),
    evidenceMatrixHash: requestHash(evidenceMatrix),
    safetyContractHash: requestHash(safetyContract),
  };
}

export function validateR5CR2OfflinePreflight({
  frozen = freezeR5CR2Request(),
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
    && frozen.providerEnv.PHASE3C_SCHEMA_VERSION === "v6-r3"
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
    && frozen.transportV4SchemaHash === TRANSPORT_V4_SCHEMA_HASH
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

export async function collectR5CR2RuntimePreflight({ env = process.env, repoRoot = ROOT, oldExposedApiKeyRevoked = false } = {}) {
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

export async function executeR5CR2({ env = process.env, fetchImpl = globalThis.fetch, preflightEvidence = {}, now = () => new Date() } = {}) {
  const frozen = freezeR5CR2Request({ env });
  const preflight = validateR5CR2OfflinePreflight({
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
    profileVersion: DEEPSEEK_SERIALIZATION_HARDENED_PROFILE_V6R3_VERSION,
    transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V4_VERSION,
    canonicalContractVersion: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
    hashes: publicHashes(frozen),
    preflight,
    probes: [],
    counts: zeroCounts(),
    rawArtifactPolicy: {
      rawRequestStored: false,
      rawResponseStored: false,
      rawArgumentsStored: false,
      privateQuarantineUsed: false,
      rawFileExistsAfterDelete: false,
    },
    realCanaryAuthorized: false,
  };
  if (!preflight.ready) return finish(summary, now);

  let externalCalls = 0;
  for (let index = 0; index < MAX_CALLS; index += 1) {
    const probeNumber = index + 1;
    const rebuilt = freezeR5CR2Request({ input: frozen.input, env });
    if (!sameFrozenEnvelope(frozen, rebuilt)) {
      summary.stopReason = "REQUEST_ENVELOPE_HASH_DRIFT";
      break;
    }
    let parsedTransport = null;
    const requestCorrelation = `R5C-R2-SYNTH-${probeNumber}-${frozen.requestEnvelopeHash.slice(0, 12)}`;
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
    const probe = validateR5CR2Probe({ probeNumber, result, parsedTransport, frozen, requestCorrelation });
    summary.probes.push(probe);
    if (!probe.ready) {
      summary.stopReason = probe.failureCategory;
      break;
    }
  }
  summary.counts = aggregateCounts(summary.probes, externalCalls);
  return finish(summary, now);
}

export function validateR5CR2Probe({ probeNumber, result, parsedTransport, frozen, requestCorrelation }) {
  const options = {
    evidenceTokens: frozen.evidenceAllowlist,
    evidenceTypeByToken: frozen.evidenceTypeByToken,
    provider: "openai-compatible",
    model: MODEL,
    modelVersion: MODEL,
  };
  const transport = parsedTransport
    ? validateProviderTransportToolArgumentsV4(parsedTransport, options)
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
  const evidenceDuplicateCount = countAllEvidenceDuplicates(parsedTransport);
  const structuredEvidence = validateFactInferenceActionEvidence(parsedTransport, frozen.evidenceAllowlist);
  const fixedFields = validateFixedFields(parsedTransport);
  const readability = validateR5CR2Readability(parsedTransport);
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
    && evidenceDuplicateCount === 0
    && categoryCodes.ready === true
    && categoryEvidence.ready === true
    && riskDuplicateCount === 0
    && associationReady
    && safetyStatements.ready
    && fixedFields.ready
    && readability.ready
    && canonicalMapping.ready
    && canonical.ok
    && structuredEvidence.ready
    && limitationCodes.ready
    && safety.ok
    && hallucinationHardFailureCount === 0;
  return {
    probe: probeNumber,
    requestToken: `R5C-R2-SYNTH-${probeNumber}`,
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
    argumentFirstCharacterCategory: result?.successResponseObservation?.firstNonWhitespaceCharacterCategory ?? null,
    argumentLastCharacterCategory: result?.successResponseObservation?.lastNonWhitespaceCharacterCategory ?? null,
    leftBraceCount: result?.successResponseObservation?.leftBraceCount ?? 0,
    rightBraceCount: result?.successResponseObservation?.rightBraceCount ?? 0,
    leftBracketCount: result?.successResponseObservation?.leftBracketCount ?? 0,
    rightBracketCount: result?.successResponseObservation?.rightBracketCount ?? 0,
    jsonParseErrorType: result?.successResponseObservation?.jsonParseErrorType ?? null,
    jsonParseErrorPosition: result?.successResponseObservation?.jsonParseErrorPosition ?? null,
    responseBodyHash: result?.responseBodyHash ?? null,
    jsonParseReady: parsedTransport !== null,
    topLevelKeyCount: parsedTransport && typeof parsedTransport === "object" ? Object.keys(parsedTransport).length : 0,
    topLevelKeyHash: parsedTransport && typeof parsedTransport === "object" ? requestHash(Object.keys(parsedTransport).sort()) : null,
    transportSchemaReady: transport.schemaReady === true,
    additionalPropertiesReady,
    transportErrors: transport.errors || [],
    actionEvidenceReady: actionEvidence.ready && actionDuplicateCount === 0,
    actionEvidenceErrors: actionEvidence.errors || [],
    actionEvidenceDuplicateCount: actionDuplicateCount,
    evidenceDuplicateCount,
    riskCategoryCodeReady: categoryCodes.ready,
    riskCategoryEvidenceReady: categoryEvidence.ready && riskDuplicateCount === 0,
    riskCategoryEvidenceErrors: categoryEvidence.errors || [],
    riskCategoryEvidenceDuplicateCount: riskDuplicateCount,
    categoryEvidenceCompatibilityReady: categoryEvidence.ready,
    categoryEvidenceAssociationReady: associationReady,
    safetyStatementContractReady: safetyStatements.ready,
    safetyStatementErrors: safetyStatements.errors,
    fixedFieldsReady: fixedFields.ready,
    fixedFieldErrors: fixedFields.errors,
    readabilityReady: readability.ready,
    readability,
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
    failureCategory: ready ? null : classifyProbeFailure({ result, parsedTransport, transport, actionEvidence, evidenceDuplicateCount, categoryCodes, categoryEvidence, safetyStatements, fixedFields, readability, canonicalMapping, canonical, structuredEvidence, limitationCodes, safety, associationReady, additionalPropertiesReady, unsupportedClaimCount, healthOverrideCount }),
  };
}

export async function writeR5CR2Artifacts(summary, { outputDir = OUTPUT_DIR } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const gates = finalGates(summary);
  const publicProbes = summary.probes.map(publicProbe);
  const common = { phase: RUN_ID, status: summary.status, stopReason: summary.stopReason, hashes: summary.hashes, counts: summary.counts };
  await Promise.all([
    fs.writeFile(path.join(outputDir, "phase3c-r5c-r2-repeatability-report.md"), buildReport(summary)),
    fs.writeFile(path.join(outputDir, "phase3c-r5c-r2-runtime-manifest.json"), `${JSON.stringify({ ...common, startedAt: summary.startedAt, completedAt: summary.completedAt, baselineCommit: BASELINE_COMMIT, provider: summary.provider, model: summary.model, endpointAlias: summary.endpointAlias, profileVersion: summary.profileVersion, transportContractVersion: summary.transportContractVersion, canonicalContractVersion: summary.canonicalContractVersion, rawArtifactPolicy: summary.rawArtifactPolicy, preflight: publicPreflight(summary.preflight), probes: publicProbes, gates, p0Count: summary.p0Count, p1Count: summary.p1Count, p2Count: summary.p2Count }, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5c-r2-request-audit.json"), `${JSON.stringify({ ...common, provider: summary.provider, model: summary.model, endpointAlias: summary.endpointAlias, profileVersion: summary.profileVersion, transportContractVersion: summary.transportContractVersion, canonicalContractVersion: summary.canonicalContractVersion, probes: publicProbes.map(requestAuditProbe) }, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5c-r2-transport-validation.json"), `${JSON.stringify({ ...common, transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V4_VERSION, probes: publicProbes.map(transportProbe) }, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5c-r2-evidence-validation.json"), `${JSON.stringify({ ...common, evidenceAllowlistHash: summary.hashes.evidenceAllowlistHash, evidenceMatrixHash: summary.hashes.evidenceMatrixHash, probes: publicProbes.map(evidenceProbe) }, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5c-r2-readability-validation.json"), `${JSON.stringify({ ...common, probes: publicProbes.map(readabilityProbe) }, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5c-r2-safety-report.md"), buildSafetyReport(summary)),
    fs.writeFile(path.join(outputDir, "phase3c-r5c-r3-real-canary-decision-pack-zh.md"), buildDecisionPack(summary)),
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

export function validateR5CR2Readability(value) {
  const groups = {
    facts: (value?.facts || []).flatMap((item) => [item?.label, item?.value]),
    inferences: (value?.inferences || []).map((item) => item?.inference),
    evidence: (value?.evidence || []).map((item) => item?.value),
    confidence: [value?.confidence?.reason],
    actions: (value?.recommendedActions || []).flatMap((item) => [item?.action, item?.basis]),
  };
  const strings = Object.values(groups).flat();
  const emptyTextCount = strings.filter((item) => typeof item !== "string" || item.trim() === "").length;
  const overlongTextCount = strings.filter((item) => typeof item === "string" && [...item].length > 240).length;
  const forbiddenCharacterCount = strings.filter((item) => typeof item === "string" && /["\\\u0000-\u001f]/u.test(item)).length;
  const truncatedTextCount = strings.filter((item) => typeof item === "string" && ([...item].length === 240 || /(?:…|\.{3})\s*$/u.test(item))).length;
  const meaninglessTextCount = strings.filter((item) => typeof item === "string" && isMeaninglessText(item)).length;
  const factReadableCount = (value?.facts || []).filter((item) => isReadableText(item?.label) && isReadableText(item?.value)).length;
  const inferenceReadableCount = (value?.inferences || []).filter((item) => isReadableText(item?.inference)).length;
  const actionReadableCount = (value?.recommendedActions || []).filter((item) => isReadableText(item?.action) && isReadableText(item?.basis)).length;
  const meaningLossCount = meaninglessTextCount + truncatedTextCount;
  return {
    ready: emptyTextCount === 0
      && overlongTextCount === 0
      && forbiddenCharacterCount === 0
      && truncatedTextCount === 0
      && meaninglessTextCount === 0
      && factReadableCount === (value?.facts || []).length
      && inferenceReadableCount === (value?.inferences || []).length
      && actionReadableCount === (value?.recommendedActions || []).length,
    totalTextCount: strings.length,
    emptyTextCount,
    overlongTextCount,
    forbiddenCharacterCount,
    truncatedTextCount,
    meaninglessTextCount,
    meaningLossCount,
    factCount: (value?.facts || []).length,
    factReadableCount,
    inferenceCount: (value?.inferences || []).length,
    inferenceReadableCount,
    actionCount: (value?.recommendedActions || []).length,
    actionReadableCount,
  };
}

export function validateR5CR2FixedFields(value) {
  return validateFixedFields(value);
}

function validateFixedFields(value) {
  const errors = [];
  for (const item of value?.recommendedActions || []) {
    if (item?.ownerRole !== "待人工指定") errors.push("owner_role_invalid");
    if (item?.dueWindow !== "待人工确定") errors.push("due_window_invalid");
    if (item?.draftStatus !== "Draft only") errors.push("draft_status_invalid");
  }
  if (value?.provider !== "openai-compatible") errors.push("provider_invalid");
  if (value?.model !== MODEL) errors.push("model_invalid");
  if (value?.modelVersion !== MODEL) errors.push("model_version_invalid");
  if (value?.fallback?.state !== "not_applicable") errors.push("fallback_state_invalid");
  if (value?.fallback?.reason !== "NONE") errors.push("fallback_reason_invalid");
  return { ready: errors.length === 0, errors: [...new Set(errors)] };
}

function isReadableText(value) {
  return typeof value === "string"
    && value.trim().length > 0
    && [...value].length <= 240
    && !/["\\\u0000-\u001f]/u.test(value)
    && !isMeaninglessText(value)
    && !/(?:…|\.{3})\s*$/u.test(value);
}

function isMeaninglessText(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  if (/^(?:N\/?A|NONE|UNKNOWN|NULL|TBD|待定|未知|无)$/iu.test(text)) return true;
  if (/^[A-Z0-9_:-]+$/u.test(text)) return true;
  const letters = text.match(/[\p{L}\p{N}]/gu) || [];
  return letters.length < 2;
}

function countAllEvidenceDuplicates(value) {
  const duplicateWithin = (tokens) => (tokens || []).length - new Set(tokens || []).size;
  return (value?.inferences || []).reduce((count, item) => count + duplicateWithin(item?.evidenceTokens), 0)
    + (value?.recommendedActions || []).reduce((count, item) => count + duplicateWithin(item?.evidenceTokens), 0)
    + (value?.riskCategories || []).reduce((count, item) => count + duplicateWithin(item?.evidenceTokens), 0);
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
    const first = mapProviderTransportV4ToCanonicalV2(parsedTransport, options);
    const second = mapProviderTransportV4ToCanonicalV2(parsedTransport, options);
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
    "transportV4SchemaHash", "canonicalV2SchemaHash", "riskCatalogHash", "evidenceAllowlistHash", "evidenceMatrixHash", "safetyContractHash",
  ].map((key) => [key, frozen[key]]));
}

function sameFrozenEnvelope(a, b) {
  return Object.keys(publicHashes(a)).every((key) => a[key] === b[key]) && a.requestEnvelopeBytes === b.requestEnvelopeBytes;
}

function zeroCounts() {
  return {
    externalLlmCalls: 0, probe1Calls: 0, probe2Calls: 0, httpSuccess: 0, toolCallSuccess: 0,
    jsonParseAttempts: 0, jsonParseSuccess: 0, transportV4Attempts: 0, transportV4Success: 0,
    actionEvidenceAttempts: 0, actionEvidenceSuccess: 0, riskCategoryCodeAttempts: 0, riskCategoryCodeSuccess: 0,
    riskCategoryEvidenceAttempts: 0, riskCategoryEvidenceSuccess: 0, categoryEvidenceCompatibilityAttempts: 0,
    categoryEvidenceCompatibilitySuccess: 0, safetyStatementAttempts: 0, safetyStatementSuccess: 0,
    canonicalMappingAttempts: 0, canonicalMappingSuccess: 0, canonicalContractAttempts: 0, canonicalContractSuccess: 0,
    evidenceAttempts: 0, evidenceSuccess: 0, fixedFieldsAttempts: 0, fixedFieldsSuccess: 0,
    readabilityAttempts: 0, readabilitySuccess: 0, safetyAttempts: 0, safetySuccess: 0, hallucinationHardFailure: 0,
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
    ["transportV4", "transportSchemaReady"], ["actionEvidence", "actionEvidenceReady"], ["riskCategoryCode", "riskCategoryCodeReady"],
    ["riskCategoryEvidence", "riskCategoryEvidenceReady"], ["categoryEvidenceCompatibility", "categoryEvidenceCompatibilityReady"],
    ["safetyStatement", "safetyStatementContractReady"], ["canonicalMapping", "canonicalMappingReady"],
    ["canonicalContract", "canonicalContractReady"], ["evidence", "factInferenceActionEvidenceReady"],
    ["fixedFields", "fixedFieldsReady"], ["readability", "readabilityReady"], ["safety", "outputSafetyReady"],
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
  const repeatableTopLevelShape = two && summary.probes[0].topLevelKeyHash !== null && summary.probes[0].topLevelKeyHash === summary.probes[1].topLevelKeyHash;
  const complete = summary.counts.externalLlmCalls === 2
    && both("ready")
    && both("fixedFieldsReady")
    && both("readabilityReady")
    && repeatableEnvelope
    && repeatableTopLevelShape
    && summary.counts.hallucinationHardFailure === 0;
  return {
    offlineRepairCommitCreated: summary.preflight.offlineRepairCommitCreated,
    authoritativeBaselineReady: summary.preflight.authoritativeBaselineReady && summary.preflight.historicalIntegrityReady,
    deepseekV6R3ProfileReady: summary.preflight.providerReady,
    providerTransportContractV4Ready: summary.preflight.requestReady,
    syntheticInputSafetyReady: summary.preflight.inputSafety.ready && Object.values(summary.preflight.requestSafety).every((count) => count === 0),
    probe1Ready: summary.probes[0]?.ready === true,
    probe2Ready: summary.probes[1]?.ready === true,
    jsonContractReady: both("jsonParseReady"),
    transportSchemaReady: both("transportSchemaReady"),
    structuredActionEvidenceReady: both("actionEvidenceReady"),
    structuredRiskCategoryEvidenceReady: both("riskCategoryEvidenceReady"),
    categoryEvidenceCompatibilityReady: both("categoryEvidenceCompatibilityReady"),
    safetyStatementContractReady: both("safetyStatementContractReady"),
    fixedFieldsReady: both("fixedFieldsReady"),
    outputReadabilityReady: both("readabilityReady"),
    frozenRequestEnvelopeReady: repeatableEnvelope,
    outputTopLevelShapeRepeatabilityReady: repeatableTopLevelShape,
    deterministicCanonicalMappingReady: both("canonicalMappingReady"),
    canonicalContractV2Ready: both("canonicalContractReady"),
    outputSafetyReady: both("outputSafetyReady"),
    outputSafetyCompatibilityReady: complete,
    providerRequestCompatibilityReady: complete,
    providerTransportRepeatabilityReady: complete,
    realCanaryAuthorized: false,
    d365Get: 0,
    crmWriteback: false,
    productionRequests: 0,
    phase3cR5CR2Complete: complete,
  };
}

function finish(summary, now) {
  summary.gates = finalGates(summary);
  summary.status = summary.gates.phase3cR5CR2Complete ? "complete" : summary.status === "stopped-preflight" ? summary.status : "stopped-safety";
  summary.stopReason = summary.gates.phase3cR5CR2Complete ? null : summary.stopReason || "repeatability_not_proven";
  summary.completedAt = now().toISOString();
  summary.p0Count = 0;
  summary.p1Count = summary.gates.phase3cR5CR2Complete ? 0 : 1;
  summary.p2Count = summary.probes.some((probe) => probe.called && !probe.usage) ? 1 : 0;
  return summary;
}

function classifyProbeFailure(values) {
  if (values.result?.httpStatus !== 200) return values.result?.reason || "HTTP_FAILED";
  if (values.result?.successResponseObservation?.finishReason !== "tool_calls") return "TOOL_CALL_NOT_COMPLETED";
  if (!values.parsedTransport) return values.result?.diagnosticCategory || "ARGUMENT_JSON_INVALID";
  if (!values.transport.schemaReady || !values.additionalPropertiesReady) return "TRANSPORT_V4_SCHEMA_INVALID";
  if (!values.actionEvidence.ready) return "ACTION_EVIDENCE_INVALID";
  if (values.evidenceDuplicateCount) return "EVIDENCE_TOKEN_DUPLICATE";
  if (!values.categoryCodes.ready) return "RISK_CATEGORY_CODE_INVALID";
  if (!values.categoryEvidence.ready) return (values.categoryEvidence.errors[0] || "RISK_CATEGORY_EVIDENCE_INVALID").toUpperCase();
  if (!values.safetyStatements.ready) return "SAFETY_STATEMENT_CONTRACT_INVALID";
  if (!values.fixedFields.ready) return "FIXED_FIELD_CONTRACT_INVALID";
  if (!values.readability.ready) return "OUTPUT_READABILITY_INVALID";
  if (!values.transport.ok) return "TRANSPORT_V4_SEMANTIC_INVALID";
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
    topLevelKeyCount: probe.topLevelKeyCount,
    topLevelKeyHash: probe.topLevelKeyHash,
    argumentFirstCharacterCategory: probe.argumentFirstCharacterCategory,
    argumentLastCharacterCategory: probe.argumentLastCharacterCategory,
    leftBraceCount: probe.leftBraceCount,
    rightBraceCount: probe.rightBraceCount,
    leftBracketCount: probe.leftBracketCount,
    rightBracketCount: probe.rightBracketCount,
    jsonParseErrorType: probe.jsonParseErrorType,
    jsonParseErrorPosition: probe.jsonParseErrorPosition,
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
    argumentLength: probe.argumentLength,
    argumentHash: probe.argumentHash,
    argumentFirstCharacterCategory: probe.argumentFirstCharacterCategory,
    argumentLastCharacterCategory: probe.argumentLastCharacterCategory,
    leftBraceCount: probe.leftBraceCount,
    rightBraceCount: probe.rightBraceCount,
    leftBracketCount: probe.leftBracketCount,
    rightBracketCount: probe.rightBracketCount,
    jsonParseErrorType: probe.jsonParseErrorType,
    jsonParseErrorPosition: probe.jsonParseErrorPosition,
    jsonParseReady: probe.jsonParseReady,
    transportSchemaReady: probe.transportSchemaReady,
    additionalPropertiesReady: probe.additionalPropertiesReady,
    safetyStatementContractReady: probe.safetyStatementContractReady,
    fixedFieldsReady: probe.fixedFieldsReady,
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
    evidenceDuplicateCount: probe.evidenceDuplicateCount,
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

function readabilityProbe(probe) {
  return {
    probe: probe.probe,
    readabilityReady: probe.readabilityReady,
    ...probe.readability,
    fixedFieldsReady: probe.fixedFieldsReady,
    fixedFieldErrors: probe.fixedFieldErrors,
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
  return `# Phase 3C-R5C-R2 v6-r3 Transport v4 Online Compatibility\n\n- Status: **${summary.status}**\n- Stop Reason: **${summary.stopReason || "none"}**\n- Baseline Commit: **${BASELINE_COMMIT}**\n- Provider / Profile: **DeepSeek / v6-r3**\n- Transport / Canonical Contract: **v4 / v2**\n- Frozen Envelope Hash / Byte Hash: **${summary.hashes.requestEnvelopeHash} / ${summary.hashes.requestEnvelopeByteHash}**\n- Probe 1 / Probe 2 Ready: **${gates.probe1Ready} / ${gates.probe2Ready}**\n- External LLM Calls: **${summary.counts.externalLlmCalls}/2**\n- HTTP / Tool / JSON / Transport v4: **${summary.counts.httpSuccess}/2 / ${summary.counts.toolCallSuccess}/2 / ${summary.counts.jsonParseSuccess}/2 / ${summary.counts.transportV4Success}/2**\n- Action / Category / Compatibility / Safety Statements: **${summary.counts.actionEvidenceSuccess}/2 / ${summary.counts.riskCategoryEvidenceSuccess}/2 / ${summary.counts.categoryEvidenceCompatibilitySuccess}/2 / ${summary.counts.safetyStatementSuccess}/2**\n- Canonical / Evidence / Readability / Safety: **${summary.counts.canonicalMappingSuccess}/2 / ${summary.counts.evidenceSuccess}/2 / ${summary.counts.readabilitySuccess}/2 / ${summary.counts.safetySuccess}/2**\n- Hallucination Hard Failure: **${summary.counts.hallucinationHardFailure}**\n- Provider Request Compatibility Ready: **${gates.providerRequestCompatibilityReady}**\n- Provider Transport Repeatability Ready: **${gates.providerTransportRepeatabilityReady}**\n- Output Safety Compatibility Ready: **${gates.outputSafetyCompatibilityReady}**\n- D365 GET / CRM Writeback / Production Requests: **0 / false / 0**\n- Real Canary Authorized: **false**\n\nNo raw request, response, Tool Arguments, Synthetic input body, identity, exact amount, raw Timeline, Scenario, Golden metadata, credential, or Authorization header is stored.\n`;
}

function buildSafetyReport(summary) {
  const gates = finalGates(summary);
  return `# Phase 3C-R5C-R2 Safety Report\n\n- Synthetic Input Safety Ready: **${gates.syntheticInputSafetyReady}**\n- Safety Statement Contract Ready: **${gates.safetyStatementContractReady}**\n- Fixed Fields Ready: **${gates.fixedFieldsReady}**\n- Output Readability Ready: **${gates.outputReadabilityReady}**\n- Output Safety Compatibility Ready: **${gates.outputSafetyCompatibilityReady}**\n- Unsupported CRM Fact Count: **${summary.probes.reduce((total, probe) => total + probe.unsupportedClaimCount, 0)}**\n- Duplicate Evidence Token Count: **${summary.probes.reduce((total, probe) => total + probe.evidenceDuplicateCount, 0)}**\n- Health Override Count: **${summary.probes.reduce((total, probe) => total + probe.healthOverrideCount, 0)}**\n- Hallucination Hard Failure Count: **${summary.counts.hallucinationHardFailure}**\n- Meaning Loss Count: **${summary.probes.reduce((total, probe) => total + Number(probe.readability?.meaningLossCount || 0), 0)}**\n- Raw CRM / identity / GUID / exact amount / raw Timeline / Scenario-Golden exposure: **0/0/0/0/0/0**\n- Raw Request / Response / Arguments Stored: **false / false / false**\n- Retry / Fallback: **0 / 0**\n- D365 GET / CRM Writeback / Production Requests: **0 / false / 0**\n- Real Canary Authorized: **false**\n`;
}

function buildDecisionPack(summary) {
  const gates = finalGates(summary);
  return `# Phase 3C-R5C-R3 Real Canary Decision Pack\n\n- Provider Request Compatibility Ready: **${gates.providerRequestCompatibilityReady}**\n- Provider Transport Repeatability Ready: **${gates.providerTransportRepeatabilityReady}**\n- Output Safety Compatibility Ready: **${gates.outputSafetyCompatibilityReady}**\n- Phase 3C-R5C-R2 Complete: **${gates.phase3cR5CR2Complete}**\n- Real Canary Authorized: **false**\n\n${gates.phase3cR5CR2Complete ? "可以提交下一阶段真实 Canary 的独立人工授权申请；本文档本身不构成授权，不得直接执行。" : `当前阻断为 \`${summary.stopReason}\`，不得申请或执行真实 Canary。`}\n`;
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
    const value = JSON.parse(await fs.readFile(path.join(repoRoot, "docs/gateway/phase3c-r5c-r2-runtime-manifest.json"), "utf8"));
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

export async function runR5CR2(options = {}) {
  const runtime = await collectR5CR2RuntimePreflight({ env: options.env || process.env, repoRoot: options.repoRoot || ROOT, oldExposedApiKeyRevoked: options.oldExposedApiKeyRevoked === true });
  const summary = await executeR5CR2({ ...options, preflightEvidence: runtime });
  await writeR5CR2Artifacts(summary, options);
  return summary;
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirect) {
  const summary = await runR5CR2({ oldExposedApiKeyRevoked: process.env.R5C_R2_OLD_KEY_REVOKED === "true" });
  console.log(JSON.stringify({ phase: summary.phase, status: summary.status, stopReason: summary.stopReason, externalLlmCalls: summary.counts.externalLlmCalls, providerRequestCompatibilityReady: summary.gates.providerRequestCompatibilityReady, providerTransportRepeatabilityReady: summary.gates.providerTransportRepeatabilityReady, realCanaryAuthorized: false }));
  if (!summary.gates.phase3cR5CR2Complete) process.exitCode = 1;
}
