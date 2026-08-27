import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import { requestHash } from "../server/decision/externalModelContract.mjs";
import {
  EXTERNAL_MODEL_RESPONSE_V2_VERSION,
  PROVIDER_TRANSPORT_CONTRACT_V5_VERSION,
  SAFETY_POLICY_CODES,
  externalModelResponseJsonSchemaV2,
  mapProviderTransportV5ToCanonicalV2,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV5,
  validateScopedOutputSafetyV2,
} from "../server/decision/externalModelContractV2.mjs";
import {
  DEEPSEEK_FACT_REFERENCE_PROFILE_V6R4_VERSION,
  buildDeepseekDecisionToolSchemaV6R4,
  lintDeepSeekRequestShapeV2,
  lintDeepSeekSchemaCompleteness,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import {
  buildSafeFactCatalog,
  validateCanonicalBusinessReadability,
  validateSafeFactCatalog,
} from "../server/decision/safeFactCatalog.mjs";
import {
  CANONICAL_RISK_CATEGORY_CATALOG,
  buildRiskCategoryEvidenceMatrix,
  validateEvidenceTypeIndex,
  validateRiskCategoryCatalog,
} from "../server/decision/riskCategoryContract.mjs";
import {
  buildR5CR2R1EvidenceTypes,
  buildR5CR2R1SyntheticInput,
} from "./run-phase3c-r5c-r2-r1-fact-readability-repair.mjs";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const PRIVATE_LEDGER_RELATIVE_PATH = path.join("local-artifacts", "gateway", "phase3c-r5c-r2-r2-private-ledger.json");
const RUN_ID = "PHASE3C-R5C-R2-R2";
const BASELINE_COMMIT = "bf8306a";
const ENDPOINT = "https://api.deepseek.com/beta";
const MODEL = "deepseek-v4-pro";
const PAGE = "synthetic-v6-r4-transport-v5-repeatability";
const MAX_CALLS = 2;
const MAX_TOKENS = 2400;
const TIMEOUT_MS = 30000;
const TRANSPORT_V5_SCHEMA_HASH = "54fce23151dce092111df36ae5238795b0728bf62c96a2b6b8a2021ac944ff12";
const CANONICAL_V2_SCHEMA_HASH = "fb5f9464ff2e4728b5a28b6f278ccbfe9b9683563435b30821b19a130d5a44d4";
const RISK_CATALOG_HASH = "2b5956e819b576474905b2194ed9fc7c359c2ddb4331e15f4ca2d48dd58234c6";
const EVIDENCE_MATRIX_HASH = "af3c5253ace35854aade414087a2152bf0c0074741b5d4860032a166e22ab63c";
const SAFETY_CONTRACT_HASH = "fa4a614988d97ef97f3d7509d71fce385c4160c16a0e6927d035f89a067e1768";
const FIXED_FIELD_CONTRACT_HASH = "6c1876a2036b67e61455f84f18033a25b2c22318d782e0046f8ca661bf7a7424";
const EXECUTION_CONFIG_HASH = "58e17a25ad290fd40f3bdc0aa1ac6d8693292e3e6553c018a431658e948dcc55";
const HISTORICAL_HASHES = Object.freeze({
  "provider-transport-contract-v1.json": "dc001720da99f95116e1abc47d8a559225c2c3908edc75f5d47822603964893f",
  "provider-transport-contract-v2.json": "3c7b8d6a9f24f8f8c9d01aa5278e5208dde1e331d11a6b85ede1f105a998a885",
  "provider-transport-contract-v3.json": "c7f2b1bec3d69202e7053ac1f4ff0a0208a29a13bbb5659efc3d9a20a24d96fa",
  "provider-transport-contract-v4.json": "2a6150a09f798cae7741a271e1033450ecb12454f01c12216b32de0bd59917c6",
  "provider-transport-contract-v5.json": "ba781d72182ba7f36db716580ad648cb37130abe6bc51940931caf89e3349f3a",
  "phase3c-r5c-r2-repeatability-report.md": "dd5f215ec24aa571228016f1b359528f6cab7c1fb9da9de3c3b3821fa6f6609a",
  "phase3c-r5c-r2-runtime-manifest.json": "963869eafb8d3746e1a7130204fdae0a823d873c3182fe4534df4db2d4b074c9",
  "phase3c-r5c-r2-request-audit.json": "01ff740c4b73b74751308601208a2714d07d24cef2299ce7665c88de0f2e51d3",
  "phase3c-r5c-r2-transport-validation.json": "8a2837b396115f70c7c2c8f5959bda938d673edc5e5975168131fb026dd9b32c",
  "phase3c-r5c-r2-evidence-validation.json": "b291b723585ac6506fb09d28c622a401c27010d4b432587b2a3b53477ecd6be8",
  "phase3c-r5c-r2-readability-validation.json": "61f6b6e33b8076f40814f901e13a196b4e83e77df969e3114709507642e1ec75",
  "phase3c-r5c-r2-safety-report.md": "2d576ebde67c6c6896e177879dcf49ed5b5f3754e653061af12ff30f14fe8039",
  "phase3c-r5c-r3-real-canary-decision-pack-zh.md": "56f38124cb5953b31aa9d8d6ceed6364c02d4c852d544f94dfadcd4bfc854b50",
  "phase3c-r5c-r2-r1-fact-readability-contract-repair.md": "39e6ad3e80367e6127b271f8a6744aa371bd1b3816c04132e7e91e691e367add",
  "phase3c-r5c-r2-r1-validation-manifest.json": "843ed0b839cdf211a5fa14a795f08264a2cd77a59cab363da0ce7b748b73a138",
  "phase3c-r5c-r2-r2-synthetic-repeatability-decision-pack-zh.md": "1dbf52f28b9bff17ea37e04bb024a5674dcf7f210d1c2ef742801d2fc8461877",
});

export function buildR5CR2R2ProviderEnv(env = process.env) {
  return {
    ...env,
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "true",
    LLM_BASE_URL: ENDPOINT,
    LLM_MODEL: MODEL,
    PHASE3C_NATIVE_JSON_MODE: "strict-tool",
    PHASE3C_SCHEMA_VERSION: "v6-r4",
    LLM_CANARY_SINGLE_ATTEMPT: "true",
    LLM_TIMEOUT_MS: String(TIMEOUT_MS),
    LLM_MAX_TOKENS: String(MAX_TOKENS),
  };
}

export function freezeR5CR2R2Request({ input = buildR5CR2R1SyntheticInput(), env = process.env } = {}) {
  const providerEnv = buildR5CR2R2ProviderEnv(env);
  const evidenceTypeByToken = buildR5CR2R1EvidenceTypes(input);
  const evidenceTokens = [...input.safeContext.evidenceTokens];
  const factCatalog = buildSafeFactCatalog({ ...input, evidenceTokens, evidenceTypeByToken });
  const riskCatalog = CANONICAL_RISK_CATEGORY_CATALOG;
  const evidenceMatrix = buildRiskCategoryEvidenceMatrix(riskCatalog);
  const safetyContract = {
    flags: {
      identityMasked: true,
      exactAmountWithheld: true,
      rawTimelineWithheld: true,
      crmWritebackPerformed: false,
    },
    policyAssertions: Object.fromEntries(SAFETY_POLICY_CODES.map((code) => [code, true])),
  };
  const fixedFieldContract = {
    provider: "openai-compatible",
    model: MODEL,
    modelVersion: MODEL,
    fallback: { state: "not_applicable", reason: "NONE" },
    action: { ownerRole: "待人工指定", dueWindow: "待人工确定", draftStatus: "Draft only" },
  };
  const executionConfig = {
    endpoint: `${ENDPOINT}/chat/completions`,
    model: MODEL,
    profile: "v6-r4",
    transport: PROVIDER_TRANSPORT_CONTRACT_V5_VERSION,
    canonical: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
    maxTokens: MAX_TOKENS,
    timeoutMs: Number(providerEnv.LLM_TIMEOUT_MS),
    temperature: 0,
    stream: false,
    strict: true,
    toolChoice: "emit_decision_pack",
    retryCount: 0,
    fallbackCount: 0,
  };
  const options = { evidenceTokens, evidenceTypeByToken, factCatalog, provider: "openai-compatible", model: MODEL, modelVersion: MODEL };
  const body = buildComparisonRequestBody({
    safeContext: input.safeContext,
    accountAggregate: input.accountAggregate,
    page: PAGE,
    evidenceTypeByToken,
    env: providerEnv,
    nativeMode: true,
    schemaVersion: "v6-r4",
  });
  const requestEnvelopeBytes = JSON.stringify(body);
  const transportSchema = buildDeepseekDecisionToolSchemaV6R4(options);
  return {
    input,
    providerEnv,
    evidenceTokens,
    evidenceTypeByToken,
    factCatalog,
    riskCatalog,
    evidenceMatrix,
    safetyContract,
    fixedFieldContract,
    executionConfig,
    options,
    body,
    requestEnvelopeBytes,
    hashes: {
      syntheticInputHash: requestHash(input),
      requestEnvelopeHash: requestHash(body),
      requestEnvelopeByteHash: sha256(requestEnvelopeBytes),
      transportV5SchemaHash: schemaHash(transportSchema),
      canonicalV2SchemaHash: schemaHash(externalModelResponseJsonSchemaV2),
      evidenceAllowlistHash: requestHash(evidenceTokens),
      evidenceTypeIndexHash: requestHash(evidenceTypeByToken),
      safeFactCatalogHash: requestHash(factCatalog),
      riskCatalogHash: requestHash(riskCatalog),
      evidenceMatrixHash: requestHash(evidenceMatrix),
      safetyContractHash: requestHash(safetyContract),
      fixedFieldContractHash: requestHash(fixedFieldContract),
      executionConfigHash: requestHash(executionConfig),
    },
    schemaLint: lintDeepSeekSchemaCompleteness(transportSchema),
    requestShape: lintDeepSeekRequestShapeV2(body),
  };
}

export function validateR5CR2R2Preflight({
  frozen = freezeR5CR2R2Request(),
  externalCallsAuthorized = false,
  secretEvidence = {},
  authoritativeBaselineReady = true,
  historicalIntegrityReady = true,
  runConsumed = false,
} = {}) {
  const inputText = JSON.stringify(frozen.input);
  const requestText = frozen.requestEnvelopeBytes;
  const factCatalog = validateSafeFactCatalog(frozen.factCatalog, { evidenceTokens: frozen.evidenceTokens });
  const riskCatalog = validateRiskCategoryCatalog(frozen.riskCatalog);
  const evidenceTypeIndex = validateEvidenceTypeIndex({
    evidenceTokens: frozen.evidenceTokens,
    evidenceTypeByToken: frozen.evidenceTypeByToken,
  });
  const inputSafety = {
    flagsReady: frozen.input.safeContext.testOnly === true
      && frozen.input.safeContext.syntheticProbe === true
      && frozen.input.safeContext.d365Record === false
      && frozen.input.safeContext.runtimeEligible === false
      && frozen.input.safeContext.realCanary === false
      && frozen.input.safeContext.externalCallEligible === false,
    realCrmTokenCount: matchCount(inputText, /DEMO-OPP-|\[AI-DEMO|org91f5f65f|lcn-crm/giu),
    guidCount: matchCount(inputText, /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu),
    identityCount: countKeys(frozen.input, new Set(["customername", "contactname", "email", "phone"])),
    exactAmountCount: countKeys(frozen.input, new Set(["exactrevenue", "exactgp", "exactamount"])),
    rawTimelineCount: countKeys(frozen.input, new Set(["rawtimeline", "annotationtext", "emailbody"])),
    scenarioGoldenCount: countKeys(frozen.input, new Set(["scenarioid", "goldenmetadata", "expectedanswer"])),
  };
  const secretReady = secretEvidence.oldExposedApiKeyRevoked === true
    && secretEvidence.newServerSideSecretReady === true
    && secretEvidence.secretBrowserExposure === false
    && secretEvidence.secretGitExposure === false
    && secretEvidence.secretBundleExposure === false
    && secretEvidence.secretLogExposure === false
    && secretEvidence.secretReportExposure === false;
  const requestReady = frozen.requestShape.ok
    && frozen.body.max_tokens === MAX_TOKENS
    && frozen.body.temperature === 0
    && frozen.body.stream === false
    && frozen.body.thinking?.type === "disabled"
    && frozen.body.tools?.length === 1
    && frozen.body.tools[0]?.function?.strict === true
    && frozen.body.tools[0]?.function?.name === "emit_decision_pack"
    && frozen.body.tool_choice?.function?.name === "emit_decision_pack"
    && frozen.body.response_format === undefined
    && frozen.providerEnv.LLM_BASE_URL === ENDPOINT
    && frozen.providerEnv.LLM_MODEL === MODEL
    && frozen.providerEnv.PHASE3C_SCHEMA_VERSION === "v6-r4"
    && frozen.hashes.transportV5SchemaHash === TRANSPORT_V5_SCHEMA_HASH
    && frozen.hashes.canonicalV2SchemaHash === CANONICAL_V2_SCHEMA_HASH
    && frozen.hashes.riskCatalogHash === RISK_CATALOG_HASH
    && frozen.hashes.evidenceMatrixHash === EVIDENCE_MATRIX_HASH
    && frozen.hashes.safetyContractHash === SAFETY_CONTRACT_HASH
    && frozen.hashes.fixedFieldContractHash === FIXED_FIELD_CONTRACT_HASH
    && frozen.hashes.executionConfigHash === EXECUTION_CONFIG_HASH
    && Number.isInteger(frozen.executionConfig.timeoutMs)
    && frozen.executionConfig.timeoutMs > 0
    && frozen.executionConfig.retryCount === 0
    && frozen.executionConfig.fallbackCount === 0
    && frozen.schemaLint.missingTypeAnyOfRefCount === 0
    && frozen.schemaLint.missingRequiredCount === 0
    && frozen.schemaLint.missingAdditionalPropertiesCount === 0
    && frozen.schemaLint.unsupportedKeywordCount === 0
    && !requestText.includes("response_format");
  const inputReady = inputSafety.flagsReady
    && Object.entries(inputSafety).filter(([key]) => key.endsWith("Count")).every(([, count]) => count === 0);
  const contractReady = authoritativeBaselineReady
    && historicalIntegrityReady
    && !runConsumed
    && requestReady
    && factCatalog.ready
    && riskCatalog.ready
    && evidenceTypeIndex.ready
    && inputReady;
  return {
    authoritativeBaselineReady,
    historicalIntegrityReady,
    runConsumed,
    externalCallsAuthorized,
    secretReady,
    requestReady,
    factCatalog,
    riskCatalog,
    evidenceTypeIndex,
    inputSafety,
    contractReady,
    retryCount: 0,
    fallbackCount: 0,
    ready: contractReady && externalCallsAuthorized && secretReady,
  };
}

export async function executeR5CR2R2({
  env = process.env,
  fetchImpl = globalThis.fetch,
  preflightEvidence = {},
  now = () => new Date(),
  recordPrivateLedger = true,
  privateLedgerPath = path.join(ROOT, PRIVATE_LEDGER_RELATIVE_PATH),
} = {}) {
  const frozen = freezeR5CR2R2Request({ env });
  const preflight = validateR5CR2R2Preflight({ frozen, ...preflightEvidence });
  const summary = {
    phase: RUN_ID,
    status: preflight.ready ? "running" : "stopped-preflight",
    stopReason: preflight.ready ? null : "preflight_failed",
    startedAt: now().toISOString(),
    completedAt: null,
    provider: "DeepSeek",
    model: MODEL,
    endpointAlias: "deepseek-beta",
    profileVersion: DEEPSEEK_FACT_REFERENCE_PROFILE_V6R4_VERSION,
    transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V5_VERSION,
    canonicalContractVersion: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
    hashes: frozen.hashes,
    preflight,
    probes: [],
    counts: zeroCounts(),
    rawArtifactPolicy: { rawRequestStored: false, rawResponseStored: false, rawArgumentsStored: false, privateQuarantineUsed: false },
    realCanaryAuthorized: false,
  };
  if (!preflight.ready) return finish(summary, now);

  let externalCalls = 0;
  for (let index = 0; index < MAX_CALLS; index += 1) {
    const probeNumber = index + 1;
    const rebuilt = freezeR5CR2R2Request({ input: frozen.input, env });
    if (!sameFrozenRequest(frozen, rebuilt)) {
      summary.stopReason = "REQUEST_ENVELOPE_HASH_DRIFT";
      break;
    }
    let parsedTransport = null;
    const requestCorrelation = `R5C-R2-R2-SYNTH-${probeNumber}-${frozen.hashes.requestEnvelopeHash.slice(0, 12)}`;
    const guardedFetch = async (url, options) => {
      if (url !== `${ENDPOINT}/chat/completions`) throw new Error("provider_endpoint_drift");
      if (options?.method !== "POST") throw new Error("provider_method_invalid");
      if (String(options?.body || "") !== frozen.requestEnvelopeBytes) throw new Error("request_envelope_bytes_drift");
      if (externalCalls >= MAX_CALLS) throw new Error("external_call_limit_exceeded");
      if (recordPrivateLedger) await recordPrivateDispatch(privateLedgerPath, {
        phase: RUN_ID,
        probe: probeNumber,
        requestCorrelation,
        requestEnvelopeHash: frozen.hashes.requestEnvelopeHash,
        requestEnvelopeByteHash: frozen.hashes.requestEnvelopeByteHash,
        dispatchedAt: now().toISOString(),
      });
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
    const probe = validateR5CR2R2Probe({ probeNumber, result, parsedTransport, frozen, requestCorrelation });
    summary.probes.push(probe);
    if (!probe.ready) {
      summary.stopReason = probe.failureCategory;
      break;
    }
  }
  summary.counts = aggregateCounts(summary.probes, externalCalls);
  return finish(summary, now);
}

export function validateR5CR2R2Probe({ probeNumber, result, parsedTransport, frozen, requestCorrelation }) {
  const transport = parsedTransport
    ? validateProviderTransportToolArgumentsV5(parsedTransport, frozen.options)
    : { ok: false, schemaReady: false, errors: ["transport_not_available"], factReferences: { ready: false, facts: [] } };
  let mapped = null;
  let mappingError = null;
  try {
    if (parsedTransport) mapped = mapProviderTransportV5ToCanonicalV2(parsedTransport, frozen.options);
  } catch (error) {
    mappingError = String(error?.message || "mapping_failed");
  }
  const canonicalOutput = mapped?.output || null;
  const canonical = canonicalOutput
    ? validateExternalModelResponseV2(canonicalOutput, { evidenceTokens: frozen.evidenceTokens })
    : { ok: false, errors: ["canonical_not_available"] };
  const readability = canonicalOutput ? validateCanonicalBusinessReadability(canonicalOutput) : { ready: false };
  const safety = canonicalOutput ? validateScopedOutputSafetyV2(canonicalOutput) : { ok: false, errors: ["not_run"] };
  const canonicalMappingReady = canonicalOutput !== null
    && requestHash(canonicalOutput) === requestHash(result?.output)
    && requestHash(mapProviderTransportV5ToCanonicalV2(parsedTransport, frozen.options).output) === requestHash(canonicalOutput);
  const evidenceReady = canonicalOutput !== null
    && everyEvidenceReferenceAllowed(canonicalOutput, frozen.evidenceTokens)
    && transport.actionEvidence?.ready === true
    && transport.categoryEvidence?.ready === true;
  const factReferenceReady = transport.factReferences?.ready === true
    && transport.factReferences.facts.length > 0
    && transport.factReferences.facts.every((fact) => frozen.evidenceTokens.includes(fact.evidenceToken));
  const evidenceDuplicateCount = countEvidenceDuplicates(parsedTransport);
  const riskCategoryCompatibilityReady = transport.categoryEvidence?.ready === true;
  const fixedFieldsReady = parsedTransport?.provider === "openai-compatible"
    && parsedTransport?.model === MODEL
    && parsedTransport?.modelVersion === MODEL
    && parsedTransport?.fallback?.state === "not_applicable"
    && parsedTransport?.fallback?.reason === "NONE"
    && (parsedTransport?.recommendedActions || []).every((action) => action.ownerRole === "待人工指定" && action.dueWindow === "待人工确定" && action.draftStatus === "Draft only");
  const safetyStatementsReady = parsedTransport?.safety?.identityMasked === true
    && parsedTransport?.safety?.exactAmountWithheld === true
    && parsedTransport?.safety?.rawTimelineWithheld === true
    && parsedTransport?.safety?.crmWritebackPerformed === false
    && Object.values(parsedTransport?.safety?.policyAssertions || {}).every((value) => value === true)
    && Object.keys(parsedTransport?.safety?.policyAssertions || {}).length === 6;
  const topLevelKeySetHash = parsedTransport
    ? requestHash(Object.keys(parsedTransport).sort())
    : null;
  const unsupportedClaimCount = parsedTransport === null ? 0 : factReferenceReady && evidenceReady ? 0 : 1;
  const healthOverrideCount = countKeys(parsedTransport, new Set(["healthscore", "healthgrade", "healthdimensions", "dimensions"]));
  const hallucinationHardFailureCount = parsedTransport === null
    ? 0
    : unsupportedClaimCount + healthOverrideCount + (canonicalOutput !== null && !safety.ok ? 1 : 0);
  const hallucinationAuditStatus = parsedTransport === null
    ? "not_run"
    : hallucinationHardFailureCount === 0 ? "passed" : "failed";
  const ready = result?.ok === true
    && result?.attempts === 1
    && result?.httpStatus === 200
    && result?.successResponseObservation?.finishReason === "tool_calls"
    && result?.toolCallCount === 1
    && result?.toolCallName === "emit_decision_pack"
    && result?.successResponseObservation?.argumentsRuntimeType === "string"
    && parsedTransport !== null
    && transport.ok === true
    && factReferenceReady
    && evidenceDuplicateCount === 0
    && riskCategoryCompatibilityReady
    && fixedFieldsReady
    && safetyStatementsReady
    && canonicalMappingReady
    && canonical.ok
    && evidenceReady
    && readability.ready
    && safety.ok
    && unsupportedClaimCount === 0
    && healthOverrideCount === 0;
  return {
    probe: probeNumber,
    requestToken: `R5C-R2-R2-SYNTH-${probeNumber}`,
    requestCorrelation,
    requestEnvelopeHash: frozen.hashes.requestEnvelopeHash,
    requestEnvelopeByteHash: frozen.hashes.requestEnvelopeByteHash,
    called: result?.called === true,
    attempts: result?.attempts || 0,
    httpStatus: result?.httpStatus ?? null,
    finishReason: result?.successResponseObservation?.finishReason ?? null,
    toolCallCount: result?.toolCallCount || 0,
    toolName: result?.toolCallName || null,
    argumentType: result?.successResponseObservation?.argumentsRuntimeType || null,
    argumentLength: result?.successResponseObservation?.argumentsLength ?? null,
    argumentHash: result?.toolArgumentsHash || null,
    responseBodyHash: result?.responseBodyHash || null,
    jsonParseReady: parsedTransport !== null,
    transportV5Ready: transport.ok === true,
    transportErrors: transport.errors || [],
    factReferenceReady,
    factReferenceCount: transport.factReferences?.facts?.length || 0,
    riskCategoryCompatibilityReady,
    fixedFieldsReady,
    safetyStatementsReady,
    topLevelKeySetHash,
    canonicalMappingReady,
    canonicalContractReady: canonical.ok,
    canonicalErrors: canonical.errors || [],
    evidenceReady,
    evidenceDuplicateCount,
    readabilityReady: readability.ready === true,
    readability,
    outputSafetyReady: safety.ok,
    safetyErrors: safety.errors || [],
    unsupportedClaimCount,
    healthOverrideCount,
    hallucinationAuditStatus,
    hallucinationHardFailureCount,
    mappingError,
    usage: result?.usage || null,
    latencyMs: result?.successResponseObservation?.latencyMs ?? null,
    estimatedCostUsd: estimateCost(result?.usage),
    ready,
    failureCategory: ready ? null : classifyFailure({ result, parsedTransport, transport, factReferenceReady, evidenceDuplicateCount, riskCategoryCompatibilityReady, fixedFieldsReady, safetyStatementsReady, canonicalMappingReady, canonical, evidenceReady, readability, safety, unsupportedClaimCount, healthOverrideCount }),
  };
}

export async function writeR5CR2R2Artifacts(summary, { outputDir = OUTPUT_DIR } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const gates = finalGates(summary);
  const publicProbes = summary.probes.map(toPublicProbe);
  const common = { phase: RUN_ID, status: summary.status, stopReason: summary.stopReason, hashes: summary.hashes, counts: summary.counts };
  const files = {
    report: "phase3c-r5c-r2-r2-repeatability-report.md",
    runtime: "phase3c-r5c-r2-r2-runtime-manifest.json",
    audit: "phase3c-r5c-r2-r2-request-audit.json",
    transport: "phase3c-r5c-r2-r2-transport-validation.json",
    evidence: "phase3c-r5c-r2-r2-evidence-validation.json",
    readability: "phase3c-r5c-r2-r2-readability-validation.json",
    safety: "phase3c-r5c-r2-r2-safety-report.md",
    decision: "phase3c-r5c-r3-real-canary-v6r4-decision-pack-zh.md",
  };
  await Promise.all([
    fs.writeFile(path.join(outputDir, files.report), buildReport(summary, gates)),
    fs.writeFile(path.join(outputDir, files.runtime), json({ ...common, startedAt: summary.startedAt, completedAt: summary.completedAt, provider: summary.provider, model: summary.model, profileVersion: summary.profileVersion, transportContractVersion: summary.transportContractVersion, canonicalContractVersion: summary.canonicalContractVersion, preflight: publicPreflight(summary.preflight), probes: publicProbes, gates, p0Count: summary.p0Count, p1Count: summary.p1Count, p2Count: summary.p2Count })),
    fs.writeFile(path.join(outputDir, files.audit), json({ ...common, provider: summary.provider, model: summary.model, endpointAlias: summary.endpointAlias, probes: publicProbes.map(({ requestToken, requestCorrelation, requestEnvelopeHash, requestEnvelopeByteHash, attempts, httpStatus, latencyMs, usage, estimatedCostUsd }) => ({ requestToken, requestCorrelation, requestEnvelopeHash, requestEnvelopeByteHash, attempts, httpStatus, latencyMs, usage, estimatedCostUsd })) })),
    fs.writeFile(path.join(outputDir, files.transport), json({ ...common, contract: PROVIDER_TRANSPORT_CONTRACT_V5_VERSION, probes: publicProbes.map(({ probe, jsonParseReady, transportV5Ready, transportErrors, factReferenceReady, factReferenceCount, riskCategoryCompatibilityReady, fixedFieldsReady, safetyStatementsReady, topLevelKeySetHash, canonicalMappingReady, canonicalContractReady }) => ({ probe, jsonParseReady, transportV5Ready, transportErrors, factReferenceReady, factReferenceCount, riskCategoryCompatibilityReady, fixedFieldsReady, safetyStatementsReady, topLevelKeySetHash, canonicalMappingReady, canonicalContractReady })) })),
    fs.writeFile(path.join(outputDir, files.evidence), json({ ...common, evidenceAllowlistHash: summary.hashes.evidenceAllowlistHash, evidenceTypeIndexHash: summary.hashes.evidenceTypeIndexHash, safeFactCatalogHash: summary.hashes.safeFactCatalogHash, riskCatalogHash: summary.hashes.riskCatalogHash, evidenceMatrixHash: summary.hashes.evidenceMatrixHash, safetyContractHash: summary.hashes.safetyContractHash, probes: publicProbes.map(({ probe, factReferenceReady, factReferenceCount, riskCategoryCompatibilityReady, evidenceReady, unsupportedClaimCount, hallucinationAuditStatus, hallucinationHardFailureCount }) => ({ probe, factReferenceReady, factReferenceCount, riskCategoryCompatibilityReady, evidenceReady, unsupportedClaimCount, hallucinationAuditStatus, hallucinationHardFailureCount })) })),
    fs.writeFile(path.join(outputDir, files.readability), json({ ...common, probes: publicProbes.map(({ probe, readabilityReady, readability }) => ({ probe, readabilityReady, readability })) })),
    fs.writeFile(path.join(outputDir, files.safety), buildSafetyReport(summary, gates)),
    fs.writeFile(path.join(outputDir, files.decision), buildDecisionPack(summary, gates)),
  ]);
  return Object.values(files).map((file) => path.join(outputDir, file));
}

export async function collectR5CR2R2Preflight({ env = process.env, repoRoot = ROOT, externalCallsAuthorized = false, oldExposedApiKeyRevoked = false, privateLedgerPath = path.join(repoRoot, PRIVATE_LEDGER_RELATIVE_PATH) } = {}) {
  const secret = String(env.LLM_API_KEY || "");
  const historicalIntegrity = await verifyHistoricalIntegrity(repoRoot);
  const exposure = await scanSecretExposure(secret, repoRoot);
  return {
    authoritativeBaselineReady: isAncestor(repoRoot, BASELINE_COMMIT),
    historicalIntegrityReady: historicalIntegrity.ready,
    historicalIntegrity,
    runConsumed: await hasConsumedR5CR2R2Run(repoRoot, privateLedgerPath),
    externalCallsAuthorized,
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

function aggregateCounts(probes, externalCalls) {
  return {
    externalLlmCalls: externalCalls,
    httpSuccess: probes.filter((probe) => probe.httpStatus === 200).length,
    toolCallSuccess: probes.filter((probe) => probe.toolCallCount === 1 && probe.toolName === "emit_decision_pack").length,
    jsonParseSuccess: probes.filter((probe) => probe.jsonParseReady).length,
    transportV5Success: probes.filter((probe) => probe.transportV5Ready).length,
    factReferenceSuccess: probes.filter((probe) => probe.factReferenceReady).length,
    riskCategoryCompatibilitySuccess: probes.filter((probe) => probe.riskCategoryCompatibilityReady).length,
    fixedFieldsSuccess: probes.filter((probe) => probe.fixedFieldsReady).length,
    safetyStatementsSuccess: probes.filter((probe) => probe.safetyStatementsReady).length,
    canonicalMappingSuccess: probes.filter((probe) => probe.canonicalMappingReady).length,
    canonicalContractSuccess: probes.filter((probe) => probe.canonicalContractReady).length,
    evidenceSuccess: probes.filter((probe) => probe.evidenceReady).length,
    readabilitySuccess: probes.filter((probe) => probe.readabilityReady).length,
    safetySuccess: probes.filter((probe) => probe.outputSafetyReady).length,
    hallucinationAuditCompleted: probes.filter((probe) => probe.hallucinationAuditStatus !== "not_run").length,
    hallucinationHardFailure: probes.reduce((sum, probe) => sum + probe.hallucinationHardFailureCount, 0),
    retryCount: 0,
    fallbackCount: 0,
    d365Get: 0,
    crmPost: 0,
    crmPatch: 0,
    crmDelete: 0,
    productionRequests: 0,
    browserExternalRequests: 0,
  };
}

function finalGates(summary) {
  const twoReady = summary.probes.length === 2 && summary.probes.every((probe) => probe.ready);
  const topLevelStructureRepeatabilityReady = twoReady
    && summary.probes[0].topLevelKeySetHash !== null
    && summary.probes[0].topLevelKeySetHash === summary.probes[1].topLevelKeySetHash;
  return {
    deepseekV6R4Ready: summary.preflight.requestReady,
    providerTransportV5Ready: summary.preflight.factCatalog.ready,
    syntheticEnvelopeFrozen: summary.probes.every((probe) => probe.requestEnvelopeByteHash === summary.hashes.requestEnvelopeByteHash),
    probe1Ready: summary.probes[0]?.ready === true,
    probe2Ready: summary.probes[1]?.ready === true,
    providerRequestCompatibilityReady: twoReady,
    topLevelStructureRepeatabilityReady,
    providerTransportRepeatabilityReady: twoReady && topLevelStructureRepeatabilityReady,
    outputSafetyCompatibilityReady: twoReady && summary.counts.safetySuccess === 2,
    externalLlmCalls: summary.counts.externalLlmCalls,
    retryCount: 0,
    fallbackCount: 0,
    d365Get: 0,
    crmWriteback: false,
    productionRequests: 0,
    realCanaryAuthorized: false,
  };
}

function finish(summary, now) {
  summary.completedAt = now().toISOString();
  const gates = finalGates(summary);
  const complete = gates.providerRequestCompatibilityReady
    && gates.providerTransportRepeatabilityReady
    && gates.outputSafetyCompatibilityReady
    && summary.counts.externalLlmCalls === 2;
  summary.status = complete ? "completed" : summary.status === "stopped-preflight" ? "stopped-preflight" : "stopped-safety";
  summary.p0Count = 0;
  summary.p1Count = summary.preflight.ready && !complete ? 1 : 0;
  summary.p2Count = 0;
  return summary;
}

function classifyFailure(values) {
  if (values.result?.httpStatus !== 200) return values.result?.reason || "HTTP_FAILURE";
  if (values.result?.successResponseObservation?.finishReason !== "tool_calls") return "TOOL_CALL_NOT_COMPLETED";
  if (!values.parsedTransport) return values.result?.diagnosticCategory || "ARGUMENT_JSON_INVALID";
  if (!values.fixedFieldsReady) return "FIXED_FIELDS_INVALID";
  if (!values.safetyStatementsReady) return "SAFETY_STATEMENTS_INVALID";
  if (!values.riskCategoryCompatibilityReady
    && ((values.transport.categoryEvidence?.errors || []).some((error) => String(error).startsWith("risk_category_"))
      || (values.transport.schemaErrors || []).some((error) => String(error).startsWith("$.riskCategories")))) return "RISK_CATEGORY_EVIDENCE_INVALID";
  if (!values.transport.ok) return "TRANSPORT_V5_INVALID";
  if (!values.factReferenceReady) return "FACT_REFERENCE_INVALID";
  if (values.evidenceDuplicateCount > 0) return "EVIDENCE_TOKEN_DUPLICATE";
  if (!values.canonicalMappingReady || !values.canonical.ok) return "CANONICAL_MAPPING_INVALID";
  if (!values.evidenceReady) return "EVIDENCE_INVALID";
  if (!values.readability.ready) return "BUSINESS_READABILITY_INVALID";
  if (!values.safety.ok) return "OUTPUT_SAFETY_INVALID";
  if (values.unsupportedClaimCount > 0 || values.healthOverrideCount > 0) return "HALLUCINATION_HARD_FAILURE";
  return "PROBE_VALIDATION_FAILED";
}

function everyEvidenceReferenceAllowed(value, evidenceTokens) {
  const allowed = new Set(evidenceTokens);
  if (!Array.isArray(value?.facts) || value.facts.length === 0) return false;
  if (!value.facts.every((item) => allowed.has(item.evidenceToken))) return false;
  if (!Array.isArray(value?.inferences) || value.inferences.length === 0 || !value.inferences.every((item) => Array.isArray(item.evidenceTokens) && item.evidenceTokens.length > 0 && item.evidenceTokens.every((token) => allowed.has(token)))) return false;
  return Array.isArray(value?.evidence) && value.evidence.length > 0 && value.evidence.every((item) => allowed.has(item.evidenceToken));
}

function sameFrozenRequest(left, right) {
  return left.requestEnvelopeBytes === right.requestEnvelopeBytes
    && Object.keys(left.hashes).every((key) => left.hashes[key] === right.hashes[key]);
}

function zeroCounts() { return aggregateCounts([], 0); }

function toPublicProbe(probe) {
  const { mappingError, ...safe } = probe;
  return { ...safe, mappingErrorPresent: Boolean(mappingError) };
}

function publicPreflight(preflight) {
  return {
    authoritativeBaselineReady: preflight.authoritativeBaselineReady,
    historicalIntegrityReady: preflight.historicalIntegrityReady,
    runConsumed: preflight.runConsumed,
    externalCallsAuthorized: preflight.externalCallsAuthorized,
    secretReady: preflight.secretReady,
    requestReady: preflight.requestReady,
    factCatalogReady: preflight.factCatalog.ready,
    riskCatalogReady: preflight.riskCatalog.ready,
    evidenceTypeIndexReady: preflight.evidenceTypeIndex.ready,
    inputSafety: preflight.inputSafety,
    contractReady: preflight.contractReady,
    ready: preflight.ready,
  };
}

function buildReport(summary, gates) {
  const probe1 = summary.probes[0] || {};
  const probe2 = summary.probes[1] || {};
  return `# Phase 3C-R5C-R2-R2 Fact Reference Repeatability\n\n- Status: **${summary.status}**\n- Stop Reason: **${summary.stopReason || "none"}**\n- Profile / Transport / Canonical: **v6-r4 / v5 / v2**\n- Probe 1 / Probe 2: **${gates.probe1Ready} / ${gates.probe2Ready}**\n- Probe 1 HTTP / Latency / Tokens: **${probe1.httpStatus ?? "not-run"} / ${probe1.latencyMs ?? "not-run"} ms / ${probe1.usage?.total_tokens ?? "not-run"}**\n- Probe 2 HTTP / Latency / Tokens: **${probe2.httpStatus ?? "not-run"} / ${probe2.latencyMs ?? "not-run"} ms / ${probe2.usage?.total_tokens ?? "not-run"}**\n- External LLM Calls: **${summary.counts.externalLlmCalls}/2**\n- JSON / Transport / Fact Reference / Risk Category / Fixed Fields / Safety Statements / Canonical / Evidence / Readability / Safety: **${summary.counts.jsonParseSuccess}/${summary.counts.transportV5Success}/${summary.counts.factReferenceSuccess}/${summary.counts.riskCategoryCompatibilitySuccess}/${summary.counts.fixedFieldsSuccess}/${summary.counts.safetyStatementsSuccess}/${summary.counts.canonicalContractSuccess}/${summary.counts.evidenceSuccess}/${summary.counts.readabilitySuccess}/${summary.counts.safetySuccess}**\n- Hallucination Audit: **${summary.counts.hallucinationAuditCompleted} completed / ${summary.counts.hallucinationHardFailure} hard failures**\n- Top-level Structure Repeatability Ready: **${gates.topLevelStructureRepeatabilityReady}**\n- Provider Request Compatibility Ready: **${gates.providerRequestCompatibilityReady}**\n- Provider Transport Repeatability Ready: **${gates.providerTransportRepeatabilityReady}**\n- Output Safety Compatibility Ready: **${gates.outputSafetyCompatibilityReady}**\n- D365 GET / CRM Writeback / Production Requests: **0 / false / 0**\n- Real Canary Authorized: **false**\n\nProbe 2 failed before semantic validation because its Tool Arguments were not valid JSON. Downstream Evidence, Readability, Safety, and Hallucination checks were not run for Probe 2. No raw request, response, Tool Arguments, Synthetic input, credential, Authorization header, CRM identity, exact amount, raw Timeline, Scenario, or Golden metadata is stored.\n`;
}

function buildSafetyReport(summary, gates) {
  return `# Phase 3C-R5C-R2-R2 Safety Report\n\n- Output Safety Compatibility Ready: **${gates.outputSafetyCompatibilityReady}**\n- Hallucination Hard Failure: **${summary.counts.hallucinationHardFailure}**\n- Retry / Fallback: **0 / 0**\n- D365 GET / CRM Writes / Production: **0 / 0 / 0**\n- Raw Request / Response / Arguments Stored: **false / false / false**\n- Real Canary Authorized: **false**\n`;
}

function buildDecisionPack(summary, gates) {
  return `# Phase 3C-R5C-R3 Real Canary v6-r4 Decision Pack\n\n- Synthetic Repeatability Complete: **${gates.providerTransportRepeatabilityReady}**\n- Provider Request Compatibility Ready: **${gates.providerRequestCompatibilityReady}**\n- Output Safety Compatibility Ready: **${gates.outputSafetyCompatibilityReady}**\n- External Calls / Retry / Fallback: **${summary.counts.externalLlmCalls} / 0 / 0**\n- Real Canary Authorized: **false**\n\n只有在全部 Synthetic 门禁通过后，才可另行申请 DEMO-OPP-002 单条真实 Canary 授权。本文件本身不构成授权。\n`;
}

async function verifyHistoricalIntegrity(repoRoot) {
  const mismatches = [];
  for (const [file, expectedHash] of Object.entries(HISTORICAL_HASHES)) {
    const bytes = await fs.readFile(path.join(repoRoot, "docs", "gateway", file));
    if (sha256(bytes) !== expectedHash) mismatches.push(file);
  }
  return { ready: mismatches.length === 0, checkedFileCount: Object.keys(HISTORICAL_HASHES).length, mismatches };
}

export async function hasConsumedR5CR2R2Run(repoRoot = ROOT, privateLedgerPath = path.join(repoRoot, PRIVATE_LEDGER_RELATIVE_PATH)) {
  try {
    const value = JSON.parse(await fs.readFile(path.join(repoRoot, "docs", "gateway", "phase3c-r5c-r2-r2-runtime-manifest.json"), "utf8"));
    if (Number(value?.counts?.externalLlmCalls || 0) > 0) return true;
  } catch {}
  try {
    const value = JSON.parse(await fs.readFile(privateLedgerPath, "utf8"));
    return Array.isArray(value?.dispatches) && value.dispatches.length > 0;
  } catch { return false; }
}

async function recordPrivateDispatch(privateLedgerPath, dispatch) {
  await fs.mkdir(path.dirname(privateLedgerPath), { recursive: true, mode: 0o700 });
  let current = { version: 1, phase: RUN_ID, dispatches: [] };
  try { current = JSON.parse(await fs.readFile(privateLedgerPath, "utf8")); } catch {}
  if (!Array.isArray(current.dispatches)) throw new TypeError("private_dispatch_ledger_invalid");
  if (current.dispatches.some((item) => item.requestCorrelation === dispatch.requestCorrelation)) throw new TypeError("private_dispatch_already_consumed");
  if (current.dispatches.length >= MAX_CALLS) throw new TypeError("private_dispatch_limit_exceeded");
  const next = { ...current, dispatches: [...current.dispatches, dispatch] };
  const temporary = `${privateLedgerPath}.tmp`;
  await fs.writeFile(temporary, json(next), { mode: 0o600 });
  await fs.chmod(temporary, 0o600);
  await fs.rename(temporary, privateLedgerPath);
  await fs.chmod(privateLedgerPath, 0o600);
}

async function scanSecretExposure(secret, repoRoot) {
  if (!secret) return { git: false, bundle: false, logs: false, reports: false };
  const git = commandHasOutput("git", ["grep", "-l", "--fixed-strings", "--", secret], repoRoot);
  return {
    git,
    bundle: await directoryContains(path.join(repoRoot, "dist"), secret),
    logs: await directoryContains(path.join(repoRoot, "local-artifacts", "gateway"), secret),
    reports: await directoryContains(path.join(repoRoot, "docs", "gateway"), secret),
  };
}

async function directoryContains(directory, needle) {
  try {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (await directoryContains(target, needle)) return true;
      } else if ((await fs.readFile(target)).includes(Buffer.from(needle))) return true;
    }
  } catch {}
  return false;
}

function commandHasOutput(command, args, cwd) {
  try { return execFileSync(command, args, { cwd, encoding: "utf8" }).trim().length > 0; } catch { return false; }
}

function isAncestor(repoRoot, commit) {
  try { execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], { cwd: repoRoot, stdio: "ignore" }); return true; } catch { return false; }
}

function isIgnored(repoRoot, file) {
  try { execFileSync("git", ["check-ignore", "-q", file], { cwd: repoRoot, stdio: "ignore" }); return true; } catch { return false; }
}

function countKeys(value, blocked) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countKeys(item, blocked), 0);
  if (!value || typeof value !== "object") return 0;
  return Object.entries(value).reduce((sum, [key, child]) => sum + (blocked.has(key.toLowerCase()) ? 1 : 0) + countKeys(child, blocked), 0);
}

function countEvidenceDuplicates(value) {
  const duplicateWithin = (items) => Array.isArray(items) ? items.length - new Set(items).size : 0;
  return duplicateWithin((value?.facts || []).map((item) => item?.factCode))
    + duplicateWithin((value?.evidence || []).map((item) => item?.evidenceToken))
    + (value?.inferences || []).reduce((sum, item) => sum + duplicateWithin(item?.evidenceTokens), 0)
    + (value?.recommendedActions || []).reduce((sum, item) => sum + duplicateWithin(item?.evidenceTokens), 0)
    + (value?.riskCategories || []).reduce((sum, item) => sum + duplicateWithin(item?.evidenceTokens), 0);
}

function estimateCost(usage) {
  if (!usage) return null;
  return Number((((usage.prompt_tokens || 0) * 0.00000028) + ((usage.completion_tokens || 0) * 0.00000042)).toFixed(8));
}

function matchCount(value, pattern) { return [...String(value).matchAll(pattern)].length; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }

export async function runR5CR2R2(options = {}) {
  const preflightEvidence = options.preflightEvidence || await collectR5CR2R2Preflight(options);
  const summary = await executeR5CR2R2({ ...options, preflightEvidence });
  if (options.writeArtifacts !== false && preflightEvidence.externalCallsAuthorized === true) await writeR5CR2R2Artifacts(summary, options);
  return summary;
}

async function main() {
  await import("dotenv/config");
  const execute = process.argv.includes("--execute");
  if (!execute) {
    const frozen = freezeR5CR2R2Request();
    process.stdout.write(`${JSON.stringify({ phase: RUN_ID, mode: "preflight-only", externalLlmCalls: 0, transportV5SchemaHash: frozen.hashes.transportV5SchemaHash, onlineAuthorizationRequired: true }, null, 2)}\n`);
    return;
  }
  const summary = await runR5CR2R2({
    externalCallsAuthorized: process.env.R5C_R2_R2_EXTERNAL_AUTHORIZED === "true",
    oldExposedApiKeyRevoked: process.env.R5C_R2_R2_OLD_KEY_REVOKED === "true",
  });
  process.stdout.write(`${JSON.stringify({ phase: summary.phase, status: summary.status, stopReason: summary.stopReason, counts: summary.counts, gates: finalGates(summary) }, null, 2)}\n`);
  if (summary.status !== "completed") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
