import "dotenv/config";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildComparisonRequestBody } from "../server/decision/comparisonProvider.mjs";
import {
  DEEPSEEK_TOOL_NAME,
  deepseekDecisionToolSchemaV2,
  deepseekDecisionToolSchemaV5,
  lintDeepSeekRequestShapeV2,
  mapDeepSeekToolArgumentsToCanonicalV2,
  mapDeepSeekToolArgumentsToCanonicalV5,
  schemaHash,
  validateDeepSeekToolArgumentsV2,
  validateDeepSeekToolArgumentsV5,
} from "../server/decision/deepseekStrictSchema.mjs";
import { requestHash, validateExternalModelResponse } from "../server/decision/externalModelContract.mjs";
import { validateExternalModelResponseV2, validateScopedOutputSafetyV2 } from "../server/decision/externalModelContractV2.mjs";
import { containsForbiddenProviderContent } from "../server/ai/providers/promptBuilder.mjs";
import { observeProviderError } from "../server/decision/providerErrorObservability.mjs";
import { extractStrictToolArguments, parseProviderSuccessEnvelope, parseStrictToolArguments } from "../server/decision/providerSuccessObservability.mjs";
import {
  R5B10_CAPTURE_DIR,
  diagnoseToolArguments,
  finalizeSyntheticToolArgumentQuarantine,
  writeSyntheticToolArgumentQuarantine,
} from "../server/decision/toolArgumentsQuarantine.mjs";
import { buildR5B9SyntheticInputs, validateR5B9SyntheticInput } from "./run-phase3c-r5b9-structured-safety-probes.mjs";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const ENDPOINT = "https://api.deepseek.com/beta";
const MODEL = "deepseek-v4-pro";
const MAX_TOKENS = 2400;
const MAX_CALLS = 4;
const MAX_RESPONSE_BYTES = 64 * 1024;
const PAGE = "synthetic-serialization-isolation";
const HISTORICAL_HASHES = Object.freeze({
  "external-model-response-contract-v1.json": "f262cf6aa39a287393402594a8377920dcfe96d858141b398ada9ed0e7bd911e",
  "external-model-response-contract-v2.json": "0d0d932b0a552fae01d7522668892963b9c1bd14beef9095534793e2c395e241",
  "phase3c-r5b8-compatibility-decision.md": "abc159ac60ce87f4bc7a139444476e56efb9e91dfa49e519523bb608b1adaa12",
  "phase3c-r5b9-runtime-manifest.json": "603917aea6ad1d78012b18c82944120d9ec58cac42d907da3422caf5ad12aa10",
});

export function buildR5B10SharedInput() {
  return structuredClone(buildR5B9SyntheticInputs()[0]);
}

function providerEnv(env, schemaVersion) {
  return {
    ...env,
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "true",
    PHASE3C_NATIVE_JSON_MODE: "strict-tool",
    PHASE3C_SCHEMA_VERSION: schemaVersion,
    LLM_CANARY_SINGLE_ATTEMPT: "true",
    LLM_TIMEOUT_MS: env.LLM_TIMEOUT_MS || "30000",
    LLM_MAX_TOKENS: String(MAX_TOKENS),
  };
}

export function buildR5B10Variants({ input = buildR5B10SharedInput(), env = process.env } = {}) {
  const common = {
    safeContext: input.safeContext,
    accountAggregate: input.accountAggregate,
    page: PAGE,
    nativeMode: true,
  };
  const knownGood = buildComparisonRequestBody({ ...common, env: providerEnv(env, "v4"), schemaVersion: "v4" });
  const current = buildComparisonRequestBody({ ...common, env: providerEnv(env, "v5"), schemaVersion: "v5" });
  const variants = [
    { id: "A", name: "Known-Good Control", promptProfile: "R5B8", schemaProfile: "R5B8", canonicalProfile: "v1", body: knownGood },
    { id: "B", name: "Prompt Delta Only", promptProfile: "R5B9", schemaProfile: "R5B8", canonicalProfile: "v1", body: { ...knownGood, messages: structuredClone(current.messages) } },
    { id: "C", name: "Schema Delta Only", promptProfile: "R5B8", schemaProfile: "R5B9", canonicalProfile: "v2", body: { ...knownGood, tools: structuredClone(current.tools) } },
    { id: "D", name: "Full R5B9 Envelope", promptProfile: "R5B9", schemaProfile: "R5B9", canonicalProfile: "v2", body: current },
  ];
  return variants.map((variant) => ({ ...variant, requestBodyHash: requestHash(variant.body), sharedSyntheticInputHash: requestHash(input) }));
}

export function analyzeR5B10EnvelopeDiff({ input = buildR5B10SharedInput(), env = process.env } = {}) {
  const variants = buildR5B10Variants({ input, env });
  const a = variants[0];
  const d = variants[3];
  const schemaA = a.body.tools[0].function.parameters;
  const schemaD = d.body.tools[0].function.parameters;
  const allPaths = diffPaths(a.body, d.body);
  return {
    sharedSyntheticInputHash: requestHash(input),
    sharedSyntheticInputHashConsistent: variants.every((variant) => variant.sharedSyntheticInputHash === requestHash(input)),
    changedJsonPaths: allPaths,
    systemPromptDiffPaths: diffPaths(a.body.messages[0], d.body.messages[0], "$.messages[0]"),
    userPromptDiffPaths: diffPaths(a.body.messages[1], d.body.messages[1], "$.messages[1]"),
    toolNameDiffPaths: diffPaths(a.body.tools[0].function.name, d.body.tools[0].function.name, "$.tools[0].function.name"),
    toolDescriptionDiffPaths: diffPaths(a.body.tools[0].function.description, d.body.tools[0].function.description, "$.tools[0].function.description"),
    toolParameterDiffPaths: diffPaths(schemaA, schemaD, "$.tools[0].function.parameters"),
    requiredDiffPaths: diffKeyword(schemaA, schemaD, "required"),
    enumDiffPaths: diffKeyword(schemaA, schemaD, "enum"),
    stats: {
      r5b8: envelopeStats(a.body),
      r5b9: envelopeStats(d.body),
    },
    requestBodyHashes: Object.fromEntries(variants.map((variant) => [variant.id, variant.requestBodyHash])),
    variantVariableCheck: validateVariantVariables(variants),
  };
}

export function validateVariantVariables(variants = buildR5B10Variants()) {
  const byId = Object.fromEntries(variants.map((variant) => [variant.id, variant]));
  const approved = {
    AtoB: diffPaths(byId.A.body, byId.B.body),
    AtoC: diffPaths(byId.A.body, byId.C.body),
    BtoD: diffPaths(byId.B.body, byId.D.body),
    CtoD: diffPaths(byId.C.body, byId.D.body),
  };
  const onlyPrefix = (paths, prefixes) => paths.every((entry) => prefixes.some((prefix) => entry.startsWith(prefix)));
  return {
    ...approved,
    aToBPromptOnly: onlyPrefix(approved.AtoB, ["$.messages"]),
    aToCSchemaOnly: onlyPrefix(approved.AtoC, ["$.tools"]),
    bToDSchemaOnly: onlyPrefix(approved.BtoD, ["$.tools"]),
    cToDPromptOnly: onlyPrefix(approved.CtoD, ["$.messages"]),
    allBodiesShareCommonRuntimeSettings: variants.every((variant) => sameRuntimeSettings(byId.A.body, variant.body)),
    allSharedInputHashesMatch: variants.every((variant) => variant.sharedSyntheticInputHash === byId.A.sharedSyntheticInputHash),
  };
}

export async function executeR5B10({ env = process.env, fetchImpl = globalThis.fetch, repoRoot = ROOT, now = () => new Date() } = {}) {
  const input = buildR5B10SharedInput();
  const inputSafety = validateR5B9SyntheticInput(input);
  const variants = buildR5B10Variants({ input, env });
  const envelopeDiff = analyzeR5B10EnvelopeDiff({ input, env });
  const historicalIntegrity = await verifyHistoricalIntegrity(repoRoot);
  const alreadyExecuted = await hasConsumedRun(repoRoot);
  const endpoint = String(env.LLM_BASE_URL || "").replace(/\/$/, "");
  const shapeChecks = variants.map((variant) => lintDeepSeekRequestShapeV2(variant.body));
  const configReady = Boolean(env.LLM_API_KEY) && endpoint === ENDPOINT && env.LLM_MODEL === MODEL;
  const preflightReady = historicalIntegrity.ready
    && !alreadyExecuted
    && inputSafety.ready
    && configReady
    && envelopeDiff.sharedSyntheticInputHashConsistent
    && envelopeDiff.variantVariableCheck.aToBPromptOnly
    && envelopeDiff.variantVariableCheck.aToCSchemaOnly
    && envelopeDiff.variantVariableCheck.bToDSchemaOnly
    && envelopeDiff.variantVariableCheck.cToDPromptOnly
    && envelopeDiff.variantVariableCheck.allBodiesShareCommonRuntimeSettings
    && shapeChecks.every((shape) => shape.ok);
  const base = {
    phase: "PHASE3C-R5B10",
    baselineCommit: "7a63588196a4c078ad984c22e20ca4e6ed098181",
    startedAt: now().toISOString(),
    provider: "openai-compatible",
    model: MODEL,
    endpointAlias: "deepseek-beta",
    sharedSyntheticInputHash: envelopeDiff.sharedSyntheticInputHash,
    inputSafety,
    historicalIntegrity,
    envelopeDiff,
    variantRequestHashes: envelopeDiff.requestBodyHashes,
    variants: [],
    externalLlmCalls: 0,
    retryCount: 0,
    fixtureFallbackCount: 0,
    d365Get: 0,
    crmPost: 0,
    crmPatch: 0,
    crmDelete: 0,
    crmWriteback: false,
    productionRequests: 0,
    browserExternalRequests: 0,
    realCanaryAuthorized: false,
  };
  if (!preflightReady) return finish({ ...base, status: "stopped-safety", stopReason: alreadyExecuted ? "r5b10_run_already_recorded" : "r5b10_preflight_failed" }, now);

  let callCount = 0;
  for (const variant of variants) {
    if (base.variants.length && base.variants.at(-1).ready !== true) break;
    callCount += 1;
    if (callCount > MAX_CALLS) throw new Error("R5B10 external call limit exceeded");
    const result = await executeVariant({
      variant,
      input,
      env,
      fetchImpl,
      repoRoot,
      now,
      requestCorrelation: `R5B10-${variant.id}-${variant.requestBodyHash.slice(0, 12)}`,
    });
    base.variants.push(result);
    if (!result.ready) break;
  }
  return finish({ ...base, status: base.variants.length === 4 && base.variants.every((variant) => variant.ready) ? "completed" : "stopped-safety", stopReason: base.variants.at(-1)?.ready ? null : base.variants.at(-1)?.failureCategory || "variant_failed", externalLlmCalls: callCount }, now);
}

async function executeVariant({ variant, input, env, fetchImpl, repoRoot, now, requestCorrelation }) {
  const started = Date.now();
  const requestSchemaHash = schemaHash(variant.body.tools[0].function.parameters);
  const configuredTimeout = Number.parseInt(String(env.LLM_TIMEOUT_MS || "30000"), 10);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 30000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${String(env.LLM_BASE_URL).replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify(variant.body),
      signal: controller.signal,
    });
  } catch (error) {
    return failedVariant(variant, { failureCategory: "PROVIDER_NETWORK_ERROR", latencyMs: Date.now() - started });
  } finally {
    clearTimeout(timeout);
  }
  const latencyMs = Date.now() - started;
  if (!response.ok) {
    const errorObservation = await observeProviderError(response, {
      requestCorrelation,
      endpointAlias: "deepseek-beta",
      modelAlias: MODEL,
      requestSchemaHash,
      requestBodyHash: variant.requestBodyHash,
    });
    return failedVariant(variant, { httpStatus: response.status, failureCategory: `PROVIDER_HTTP_${response.status}`, latencyMs, errorObservation });
  }
  const rawEnvelope = await response.text();
  if (Buffer.byteLength(rawEnvelope) > MAX_RESPONSE_BYTES) return failedVariant(variant, { httpStatus: response.status, failureCategory: "RESPONSE_TOO_LARGE", latencyMs });
  const parsedEnvelope = parseProviderSuccessEnvelope(rawEnvelope, { maxTokens: MAX_TOKENS, requestCorrelation, latencyMs });
  if (!parsedEnvelope.ok) return failedVariant(variant, { httpStatus: response.status, failureCategory: "SUCCESS_RESPONSE_JSON_INVALID", latencyMs, responseObservation: parsedEnvelope.observation });
  const extracted = extractStrictToolArguments(parsedEnvelope.envelope, { toolName: DEEPSEEK_TOOL_NAME, observation: { ...parsedEnvelope.observation, httpStatus: response.status } });
  if (!extracted.ok) return failedVariant(variant, { httpStatus: response.status, failureCategory: extracted.category, latencyMs, responseObservation: extracted.observation });

  let parseFailure = null;
  const parsedArguments = parseStrictToolArguments(extracted.argumentsText, {
    observation: extracted.observation,
    onParseFailure: ({ error }) => { parseFailure = error; },
  });
  const diagnostics = diagnoseToolArguments(extracted.argumentsText, { parseOutcome: parsedArguments.ok ? { ok: true, value: parsedArguments.value } : parseFailure });
  let quarantine = { writeCount: 0, deleteCount: 0, rawFileExistsAfterDelete: false };
  if (!parsedArguments.ok) {
    const eligibility = quarantineEligibility(input);
    const written = await writeSyntheticToolArgumentQuarantine({
      argumentsText: extracted.argumentsText,
      eligibility,
      parseOutcome: parseFailure,
      repoRoot,
      captureDir: R5B10_CAPTURE_DIR,
      phase: `Phase 3C-R5B10 Variant ${variant.id}`,
      diagnosticsMetadata: { requestSchemaHash, requestBodyHash: variant.requestBodyHash, toolSchemaHash: requestHash(variant.body.tools[0]) },
      now,
    });
    const deleted = await finalizeSyntheticToolArgumentQuarantine({ repoRoot, captureDir: R5B10_CAPTURE_DIR, now });
    quarantine = { writeCount: 1, deleteCount: 1, rawFileExistsAfterDelete: deleted.rawFileExistsAfterDeletion, diagnostics: written.publicDiagnostics };
    return failedVariant(variant, {
      httpStatus: response.status,
      failureCategory: parsedArguments.category,
      latencyMs,
      responseObservation: extracted.observation,
      diagnostics: written.publicDiagnostics,
      quarantine,
    });
  }

  const evidenceTokens = input.safeContext.evidenceTokens;
  const toolValidation = variant.canonicalProfile === "v2"
    ? validateDeepSeekToolArgumentsV5(parsedArguments.value, { evidenceTokens })
    : validateDeepSeekToolArgumentsV2(parsedArguments.value, { evidenceTokens });
  if (!toolValidation.ok) return failedVariant(variant, {
    httpStatus: response.status,
    failureCategory: "ARGUMENT_SCHEMA_INVALID",
    latencyMs,
    responseObservation: extracted.observation,
    diagnostics: diagnostics.publicDiagnostics,
    jsonParseReady: true,
    schemaErrors: toolValidation.errors,
  });

  let output;
  try {
    output = variant.canonicalProfile === "v2"
      ? mapDeepSeekToolArgumentsToCanonicalV5(parsedArguments.value, { evidenceTokens })
      : mapDeepSeekToolArgumentsToCanonicalV2(parsedArguments.value, { evidenceTokens });
  } catch (error) {
    return failedVariant(variant, {
      httpStatus: response.status,
      failureCategory: "CANONICAL_MAPPING_INVALID",
      latencyMs,
      responseObservation: extracted.observation,
      diagnostics: diagnostics.publicDiagnostics,
      jsonParseReady: true,
      schemaReady: true,
    });
  }
  const contract = variant.canonicalProfile === "v2"
    ? validateExternalModelResponseV2(output, { evidenceTokens })
    : validateExternalModelResponse(output, { evidenceTokens });
  const evidenceErrors = validateEvidence(output, evidenceTokens);
  const safety = variant.canonicalProfile === "v2"
    ? validateScopedOutputSafetyV2(output)
    : containsForbiddenProviderContent(output);
  const ready = contract.ok && evidenceErrors.length === 0 && safety.ok && !containsHealthOverride(output);
  return {
    id: variant.id,
    name: variant.name,
    promptProfile: variant.promptProfile,
    schemaProfile: variant.schemaProfile,
    requestBodyHash: variant.requestBodyHash,
    requestSchemaHash,
    called: true,
    httpStatus: response.status,
    finishReason: extracted.observation.finishReason,
    toolCallCount: extracted.observation.toolCallsCount,
    toolName: extracted.observation.functionName,
    argumentType: extracted.observation.argumentsRuntimeType,
    diagnostics: diagnostics.publicDiagnostics,
    jsonParseReady: true,
    schemaReady: toolValidation.ok,
    schemaErrors: toolValidation.errors,
    canonicalMappingReady: true,
    canonicalContractReady: contract.ok,
    canonicalErrors: contract.errors,
    evidenceReady: evidenceErrors.length === 0,
    evidenceErrors,
    safetyReady: safety.ok,
    safetyErrors: safety.errors || (safety.ok ? [] : [safety.reason || safety.blockedPatternKey || "safety_failed"]),
    unsupportedClaimCount: countUnsupportedClaims(safety),
    usage: sanitizeUsage(parsedEnvelope.envelope.usage),
    latencyMs,
    responseBodyHash: sha256(rawEnvelope),
    quarantine,
    ready,
    failureCategory: ready ? null : !contract.ok ? "CANONICAL_CONTRACT_INVALID" : evidenceErrors.length ? "EVIDENCE_INVALID" : "OUTPUT_SAFETY_INVALID",
  };
}

function failedVariant(variant, values = {}) {
  return {
    id: variant.id,
    name: variant.name,
    promptProfile: variant.promptProfile,
    schemaProfile: variant.schemaProfile,
    requestBodyHash: variant.requestBodyHash,
    called: true,
    httpStatus: values.httpStatus ?? null,
    finishReason: values.responseObservation?.finishReason ?? null,
    toolCallCount: values.responseObservation?.toolCallsCount ?? 0,
    toolName: values.responseObservation?.functionName ?? null,
    argumentType: values.responseObservation?.argumentsRuntimeType ?? null,
    diagnostics: values.diagnostics || null,
    jsonParseReady: values.jsonParseReady === true,
    schemaReady: values.schemaReady === true,
    schemaErrors: values.schemaErrors || [],
    canonicalMappingReady: false,
    canonicalContractReady: false,
    canonicalErrors: [],
    evidenceReady: null,
    evidenceErrors: [],
    safetyReady: null,
    safetyErrors: [],
    unsupportedClaimCount: 0,
    usage: values.usage || null,
    latencyMs: values.latencyMs ?? null,
    quarantine: values.quarantine || { writeCount: 0, deleteCount: 0, rawFileExistsAfterDelete: false },
    errorObservation: values.errorObservation || null,
    ready: false,
    failureCategory: values.failureCategory || "VARIANT_FAILED",
  };
}

function finish(summary, now) {
  const results = Object.fromEntries((summary.variants || []).map((variant) => [variant.id, variant]));
  const aReady = results.A?.ready === true;
  const bReady = results.B?.ready === true;
  const cReady = results.C?.ready === true;
  const dReady = results.D?.ready === true;
  const promptDeltaSuspected = aReady && results.B && !bReady;
  const schemaDeltaSuspected = aReady && bReady && results.C && !cReady;
  const promptSchemaInteractionSuspected = aReady && bReady && cReady && results.D && !dReady;
  const providerOutputStabilityReady = aReady;
  const currentEnvelopeSinglePassReady = aReady && bReady && cReady && dReady;
  const regressionClassified = Boolean(results.A) && (!aReady || promptDeltaSuspected || schemaDeltaSuspected || promptSchemaInteractionSuspected || currentEnvelopeSinglePassReady);
  const counts = aggregateCounts(summary.variants || [], summary.externalLlmCalls || 0);
  const p1 = ((results.A && !aReady)
    || (results.D && !dReady)
    || (summary.variants || []).some((variant) => variant.schemaReady === false && variant.jsonParseReady === true)
    || (summary.variants || []).some((variant) => variant.safetyReady === false)) ? 1 : 0;
  const p2 = regressionClassified ? 1 : 0;
  return {
    ...summary,
    completedAt: now().toISOString(),
    counts,
    knownGoodControlReproduced: aReady,
    promptDeltaVariantReady: bReady,
    schemaDeltaVariantReady: cReady,
    combinedEnvelopeVariantReady: dReady,
    serializationRegressionClassified: regressionClassified,
    regressionClassification: !aReady
      ? "Provider Output Stability Not Proven"
      : promptDeltaSuspected
        ? "Prompt Delta Suspected"
        : schemaDeltaSuspected
          ? "Schema Delta Suspected"
          : promptSchemaInteractionSuspected
            ? "Prompt Schema Interaction Suspected"
            : currentEnvelopeSinglePassReady
              ? "Current Envelope Single-Pass Ready"
              : "Not Classified",
    promptDeltaSuspected,
    schemaDeltaSuspected,
    promptSchemaInteractionSuspected,
    providerOutputStabilityReady,
    currentEnvelopeSinglePassReady,
    currentProviderEnvelopeSerializationReady: currentEnvelopeSinglePassReady,
    jsonDiagnosticsReady: true,
    strictSchemaPreserved: true,
    canonicalContractPreserved: true,
    providerTransportContractRequired: schemaDeltaSuspected,
    outputSafetyCompatibilityReady: dReady && results.D.safetyReady === true,
    realCanaryAuthorized: false,
    p0Count: 0,
    p1Count: p1,
    p2Count: p2,
    r5b10Complete: regressionClassified,
  };
}

function aggregateCounts(variants, calls) {
  const attempted = (key) => variants.filter((variant) => variant[key] !== null && variant[key] !== undefined);
  return {
    externalLlmCalls: calls,
    variantACalls: variants.some((variant) => variant.id === "A") ? 1 : 0,
    variantBCalls: variants.some((variant) => variant.id === "B") ? 1 : 0,
    variantCCalls: variants.some((variant) => variant.id === "C") ? 1 : 0,
    variantDCalls: variants.some((variant) => variant.id === "D") ? 1 : 0,
    httpSuccess: variants.filter((variant) => variant.httpStatus === 200).length,
    toolCallSuccess: variants.filter((variant) => variant.finishReason === "tool_calls" && variant.toolCallCount === 1 && variant.toolName === DEEPSEEK_TOOL_NAME).length,
    jsonParseAttempts: variants.filter((variant) => variant.argumentType === "string").length,
    jsonParseSuccess: variants.filter((variant) => variant.jsonParseReady).length,
    schemaAttempts: variants.filter((variant) => variant.jsonParseReady).length,
    schemaSuccess: variants.filter((variant) => variant.schemaReady).length,
    canonicalAttempts: variants.filter((variant) => variant.schemaReady).length,
    canonicalSuccess: variants.filter((variant) => variant.canonicalMappingReady).length,
    evidenceAttempts: attempted("evidenceReady").filter((variant) => variant.canonicalMappingReady).length,
    evidenceSuccess: variants.filter((variant) => variant.evidenceReady === true).length,
    safetyAttempts: attempted("safetyReady").filter((variant) => variant.canonicalMappingReady).length,
    safetySuccess: variants.filter((variant) => variant.safetyReady === true).length,
    retry: 0,
    fallback: 0,
    d365Get: 0,
    crmPost: 0,
    crmPatch: 0,
    crmDelete: 0,
    crmWriteback: false,
    productionRequests: 0,
    browserExternalRequests: 0,
  };
}

function validateEvidence(output, evidenceTokens) {
  const allowed = new Set(evidenceTokens);
  const errors = [];
  for (const fact of output?.facts || []) if (!allowed.has(fact.evidenceToken)) errors.push("fact_evidence_invalid");
  for (const evidence of output?.evidence || []) if (!allowed.has(evidence.evidenceToken)) errors.push("evidence_reference_invalid");
  for (const inference of output?.inferences || []) for (const token of inference.evidenceTokens || []) if (!allowed.has(token)) errors.push("inference_evidence_invalid");
  for (const action of output?.recommendedActions || []) if (![...allowed].some((token) => action.basis.includes(token))) errors.push("action_basis_invalid");
  return [...new Set(errors)];
}

function containsHealthOverride(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => ["healthscore", "healthgrade", "healthdimensions", "dimensions"].includes(key.toLowerCase()) || containsHealthOverride(child));
}

function quarantineEligibility(input) {
  const safety = validateR5B9SyntheticInput(input);
  return {
    testOnly: input.safeContext.testOnly,
    syntheticProbe: input.safeContext.syntheticProbe,
    d365Record: input.safeContext.d365Record,
    runtimeEligible: input.safeContext.runtimeEligible,
    realCanary: input.safeContext.realCanary,
    realCrmTokenCount: safety.realCrmTokenCount,
    forbiddenFieldCount: safety.forbiddenFieldCount,
  };
}

function envelopeStats(body) {
  const schema = body.tools[0].function.parameters;
  const stats = schemaStats(schema);
  return {
    requestBodyHash: requestHash(body),
    schemaHash: schemaHash(schema),
    schemaCharacterLength: JSON.stringify(schema).length,
    systemPromptCharacterLength: body.messages[0].content.length,
    userPromptCharacterLength: body.messages[1].content.length,
    promptCharacterLength: body.messages.reduce((total, message) => total + message.content.length, 0),
    toolName: body.tools[0].function.name,
    toolDescriptionCharacterLength: body.tools[0].function.description?.length || 0,
    ...stats,
  };
}

function schemaStats(schema) {
  const stats = { nestedDepth: 0, objectCount: 0, arrayCount: 0, additionalPropertiesFalseCount: 0, requiredNodeCount: 0, enumNodeCount: 0 };
  function walk(node, depth) {
    if (!node || typeof node !== "object") return;
    stats.nestedDepth = Math.max(stats.nestedDepth, depth);
    if (node.type === "object") stats.objectCount += 1;
    if (node.type === "array") stats.arrayCount += 1;
    if (node.additionalProperties === false) stats.additionalPropertiesFalseCount += 1;
    if (Array.isArray(node.required)) stats.requiredNodeCount += 1;
    if (Array.isArray(node.enum)) stats.enumNodeCount += 1;
    for (const child of Object.values(node)) if (child && typeof child === "object") {
      if (Array.isArray(child)) child.forEach((item) => walk(item, depth + 1));
      else walk(child, depth + 1);
    }
  }
  walk(schema, 0);
  return stats;
}

function diffKeyword(left, right, keyword) {
  const leftValues = collectKeyword(left, keyword);
  const rightValues = collectKeyword(right, keyword);
  const paths = new Set([...Object.keys(leftValues), ...Object.keys(rightValues)]);
  return [...paths].sort().filter((entry) => JSON.stringify(leftValues[entry]) !== JSON.stringify(rightValues[entry])).map((entry) => ({ path: entry, r5b8: leftValues[entry] ?? null, r5b9: rightValues[entry] ?? null }));
}

function collectKeyword(value, keyword, pathValue = "$.tools[0].function.parameters", result = {}) {
  if (!value || typeof value !== "object") return result;
  if (Object.hasOwn(value, keyword)) result[`${pathValue}.${keyword}`] = value[keyword];
  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === "object") {
      if (Array.isArray(child)) child.forEach((item, index) => collectKeyword(item, keyword, `${pathValue}.${key}[${index}]`, result));
      else collectKeyword(child, keyword, `${pathValue}.${key}`, result);
    }
  }
  return result;
}

function diffPaths(left, right, prefix = "$") {
  if (Object.is(left, right)) return [];
  if (Array.isArray(left) || Array.isArray(right)) {
    const length = Math.max(left?.length || 0, right?.length || 0);
    return Array.from({ length }, (_, index) => index).flatMap((index) => diffPaths(left?.[index], right?.[index], `${prefix}[${index}]`));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].sort().flatMap((key) => diffPaths(left[key], right[key], `${prefix}.${key}`));
  }
  return [prefix];
}

function sameRuntimeSettings(left, right) {
  return ["model", "thinking", "max_tokens", "temperature", "stream", "tool_choice"].every((key) => JSON.stringify(left[key]) === JSON.stringify(right[key]));
}

function countUnsupportedClaims(safety) {
  const errors = safety?.errors || [];
  return errors.filter((error) => /forbidden_key|crm_write_claim|unsupported/i.test(error)).length;
}

function sanitizeUsage(value) {
  if (!value || typeof value !== "object") return null;
  return Object.fromEntries(["prompt_tokens", "completion_tokens", "total_tokens"].filter((key) => Number.isFinite(Number(value[key]))).map((key) => [key, Number(value[key])]));
}

async function verifyHistoricalIntegrity(repoRoot) {
  const files = {};
  for (const [name, expected] of Object.entries(HISTORICAL_HASHES)) {
    const actual = sha256(await fs.readFile(path.join(repoRoot, "docs", "gateway", name)));
    files[name] = { expected, actual, ready: expected === actual };
  }
  return { ready: Object.values(files).every((file) => file.ready), files };
}

async function hasConsumedRun(repoRoot) {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, "docs", "gateway", "phase3c-r5b10-variant-manifest.json"), "utf8"));
    return Number(manifest?.counts?.externalLlmCalls || 0) > 0;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function writeR5B10Artifacts(summary, { outputDir = OUTPUT_DIR } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonArtifacts = {
    "phase3c-r5b10-envelope-diff.json": summary.envelopeDiff,
    "phase3c-r5b10-json-diagnostics-contract.json": diagnosticsContract(),
    "phase3c-r5b10-variant-manifest.json": safeVariantManifest(summary),
    "phase3c-r5b10-response-validation.json": responseValidation(summary),
  };
  for (const [name, value] of Object.entries(jsonArtifacts)) await fs.writeFile(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, "phase3c-r5b10-synthetic-probe-report.md"), probeReport(summary));
  await fs.writeFile(path.join(outputDir, "phase3c-r5b10-safety-report.md"), safetyReport(summary));
  await fs.writeFile(path.join(outputDir, "phase3c-r5b10-root-cause-decision.md"), rootCauseDecision(summary));
  await fs.writeFile(path.join(outputDir, "phase3c-r5b11-repeatability-decision-pack-zh.md"), repeatabilityDecision(summary));
}

function diagnosticsContract() {
  return {
    version: "Tool Arguments Serialization Diagnostics v1",
    parsePolicy: "single_standard_json_parse_no_repair",
    publicFields: ["argumentsLength", "argumentsSha256", "utf8Valid", "bomPresent", "firstCharacterCategory", "lastCharacterCategory", "braceBalance", "bracketBalance", "stringStateAtEnd", "firstInvalidControlCharacterType", "invalidEscapeType", "parseErrorMessage", "parseErrorOffset", "parseErrorLine", "parseErrorColumn", "surroundingCodePointClasses", "trailingDataPresent", "truncationIndicators", "syntaxCategory"],
    prohibitedPublicFields: ["rawArguments", "rawWindow", "requestBody", "responseBody", "syntheticInput"],
    quarantine: { directory: R5B10_CAPTURE_DIR, directoryMode: "0700", fileMode: "0600", rawDeletedAfterDiagnosis: true },
    repairAllowed: false,
  };
}

function safeVariantManifest(summary) {
  return {
    phase: summary.phase,
    status: summary.status,
    stopReason: summary.stopReason,
    baselineCommit: summary.baselineCommit,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    provider: summary.provider,
    model: summary.model,
    endpointAlias: summary.endpointAlias,
    sharedSyntheticInputHash: summary.sharedSyntheticInputHash,
    historicalIntegrityReady: summary.historicalIntegrity.ready,
    variants: summary.variants,
    counts: summary.counts,
    gates: gates(summary),
  };
}

function responseValidation(summary) {
  return {
    variants: ["A", "B", "C", "D"].map((id) => {
      const result = summary.variants.find((variant) => variant.id === id);
      return result ? {
        id,
        jsonParseReady: result.jsonParseReady,
        schemaReady: result.schemaReady,
        canonicalMappingReady: result.canonicalMappingReady,
        canonicalContractReady: result.canonicalContractReady,
        evidenceReady: result.evidenceReady,
        safetyReady: result.safetyReady,
        ready: result.ready,
        failureCategory: result.failureCategory,
      } : { id, status: "Not Executed" };
    }),
    counts: summary.counts,
  };
}

function probeReport(summary) {
  const rows = ["A", "B", "C", "D"].map((id) => {
    const result = summary.variants.find((variant) => variant.id === id);
    return result ? `| ${id} | ${result.httpStatus ?? "n/a"} | ${result.jsonParseReady} | ${result.schemaReady} | ${result.canonicalMappingReady} | ${result.evidenceReady ?? "Not Executed"} | ${result.safetyReady ?? "Not Executed"} | ${result.ready} |` : `| ${id} | Not Executed | Not Executed | Not Executed | Not Executed | Not Executed | Not Executed | false |`;
  }).join("\n");
  return `# Phase 3C-R5B10 Serialization Isolation\n\n- Shared Synthetic Input Hash: \`${summary.sharedSyntheticInputHash}\`\n- External LLM Calls: **${summary.externalLlmCalls}/4**\n- Retry/Fallback: **0/0**\n- D365 GET / CRM Writes / Production: **0/0/0**\n\n| Variant | HTTP | JSON | Schema | Canonical | Evidence | Safety | Ready |\n|---|---:|---|---|---|---|---|---|\n${rows}\n\n- Classification: **${summary.regressionClassification}**\n- Current Envelope Single-Pass Ready: **${summary.currentEnvelopeSinglePassReady}**\n- Real Canary Authorized: **false**\n`;
}

function safetyReport(summary) {
  const quarantine = summary.variants.filter((variant) => variant.quarantine?.writeCount).map((variant) => ({ id: variant.id, writeCount: variant.quarantine.writeCount, deleteCount: variant.quarantine.deleteCount, rawFileExistsAfterDelete: variant.quarantine.rawFileExistsAfterDelete, diagnostics: variant.diagnostics }));
  return `# Phase 3C-R5B10 Safety Report\n\n- Synthetic Input Safety Ready: **${summary.inputSafety.ready}**\n- Raw CRM / identity / GUID / exact amount / raw Timeline / Scenario-Golden: **0/0/0/0/0/0**\n- Quarantine events: **${quarantine.length}**\n- Raw files remaining: **${quarantine.filter((item) => item.rawFileExistsAfterDelete).length}**\n- Retry/Fallback: **0/0**\n- D365 GET: **0**\n- CRM Writeback: **false**\n- Production Requests: **0**\n- Output Safety Compatibility Ready: **${summary.outputSafetyCompatibilityReady}**\n\nPublic evidence contains no raw Tool Arguments or private diagnostic windows.\n`;
}

function rootCauseDecision(summary) {
  return `# Phase 3C-R5B10 Root Cause Decision\n\n- Serialization Regression Classified: **${summary.serializationRegressionClassified}**\n- Classification: **${summary.regressionClassification}**\n- Prompt Delta Suspected: **${summary.promptDeltaSuspected}**\n- Schema Delta Suspected: **${summary.schemaDeltaSuspected}**\n- Prompt/Schema Interaction Suspected: **${summary.promptSchemaInteractionSuspected}**\n- Provider Output Stability Ready: **${summary.providerOutputStabilityReady}**\n- Current Envelope Single-Pass Ready: **${summary.currentEnvelopeSinglePassReady}**\n- Provider Transport Contract Required: **${summary.providerTransportContractRequired}**\n- Real Canary Authorized: **false**\n\nA single isolation sequence cannot establish repeatability. No JSON repair, retry, Schema relaxation, alternate Provider, real CRM input, or writeback was used.\n`;
}

function repeatabilityDecision(summary) {
  return `# Phase 3C-R5B11 Repeatability Decision Pack\n\n- R5B10 Current Envelope Single-Pass Ready: **${summary.currentEnvelopeSinglePassReady}**\n- Output Safety Compatibility Ready: **${summary.outputSafetyCompatibilityReady}**\n- Independent 2/2 Repeatability Authorized: **false**\n- Real Canary Authorized: **false**\n\n${summary.currentEnvelopeSinglePassReady ? "R5B10 completed A/B/C/D once. A separate authorization is required for two repeatability probes using the unchanged final envelope before any real Canary can be considered." : `R5B10 stopped at Variant ${summary.variants.at(-1)?.id || "preflight"} with ${summary.stopReason}. Resolve the classified blocker before requesting repeatability verification.`}\n`;
}

function gates(summary) {
  return {
    knownGoodControlReproduced: summary.knownGoodControlReproduced,
    promptDeltaVariantReady: summary.promptDeltaVariantReady,
    schemaDeltaVariantReady: summary.schemaDeltaVariantReady,
    combinedEnvelopeVariantReady: summary.combinedEnvelopeVariantReady,
    serializationRegressionClassified: summary.serializationRegressionClassified,
    promptDeltaSuspected: summary.promptDeltaSuspected,
    schemaDeltaSuspected: summary.schemaDeltaSuspected,
    promptSchemaInteractionSuspected: summary.promptSchemaInteractionSuspected,
    providerOutputStabilityReady: summary.providerOutputStabilityReady,
    currentEnvelopeSinglePassReady: summary.currentEnvelopeSinglePassReady,
    jsonDiagnosticsReady: summary.jsonDiagnosticsReady,
    strictSchemaPreserved: summary.strictSchemaPreserved,
    canonicalContractPreserved: summary.canonicalContractPreserved,
    providerTransportContractRequired: summary.providerTransportContractRequired,
    realCanaryAuthorized: false,
    d365Get: 0,
    crmWriteback: false,
    productionRequests: 0,
    p0Count: summary.p0Count,
    p1Count: summary.p1Count,
    p2Count: summary.p2Count,
    r5b10Complete: summary.r5b10Complete,
  };
}

export async function runR5B10(options = {}) {
  const summary = await executeR5B10(options);
  await writeR5B10Artifacts(summary);
  return summary;
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const summary = await runR5B10();
  console.log(JSON.stringify({
    status: summary.status,
    externalLlmCalls: summary.externalLlmCalls,
    regressionClassification: summary.regressionClassification,
    currentEnvelopeSinglePassReady: summary.currentEnvelopeSinglePassReady,
    outputSafetyCompatibilityReady: summary.outputSafetyCompatibilityReady,
    realCanaryAuthorized: false,
  }, null, 2));
}
