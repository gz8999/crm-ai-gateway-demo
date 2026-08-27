import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import { validateExternalModelResponse, requestHash } from "../server/decision/externalModelContract.mjs";
import {
  DEEPSEEK_STRICT_TOOL_SCHEMA_V2_VERSION,
  DEEPSEEK_TOOL_NAME,
  deepseekDecisionToolSchemaV2,
  lintDeepSeekRequestShapeV2,
  lintDeepSeekSchemaCompleteness,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import { containsForbiddenProviderContent } from "../server/ai/providers/promptBuilder.mjs";
import { buildR5B3ProviderEnv, buildR5B3SyntheticInput, validateR5B3SyntheticInput } from "./run-phase3c-r5b3-synthetic-probe.mjs";

const OUTPUT_DIR = path.join(process.cwd(), "docs", "gateway");
const RUN_ID = "PHASE3C-R5B6";
const REQUEST_TOKEN = "R5B6-SYNTH-V2-001";
const REQUEST_CORRELATION = "R5B6-SYNTH-V2-001";
const ENDPOINT = "https://api.deepseek.com/beta";
const MODEL = "deepseek-v4-pro";
const SYNTHETIC_EVIDENCE = "SYN-EVID-001";
const R5B5_MAX_TOKENS = 1200;
const R5B6_MAX_TOKENS = 2400;
const EXPECTED_SCHEMA_HASH = "476cecc436dc452abc50988d337d779398159e8e0a4003bc8aa6153cbdab22b7";
const MAX_CALLS = 1;

export function buildR5B6ProviderEnv(env = process.env) {
  return { ...buildR5B3ProviderEnv(env), LLM_MAX_TOKENS: String(R5B6_MAX_TOKENS) };
}

export function buildR5B6ConfigDiff({ input = buildR5B3SyntheticInput(), env = process.env } = {}) {
  const r5b5Env = { ...buildR5B3ProviderEnv(env), LLM_MAX_TOKENS: String(R5B5_MAX_TOKENS) };
  const r5b6Env = buildR5B6ProviderEnv(env);
  const r5b5Body = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: "synthetic-probe", env: r5b5Env, nativeMode: true, schemaVersion: "v2" });
  const r5b6Body = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: "synthetic-probe", env: r5b6Env, nativeMode: true, schemaVersion: "v2" });
  const changedFields = diffPaths(r5b5Body, r5b6Body);
  const unexpectedChangedFields = changedFields.filter((field) => field !== "max_tokens");
  return {
    baselineRun: "PHASE3C-R5B5",
    currentRun: RUN_ID,
    changedFields,
    unexpectedChangedFields,
    maxTokensBefore: r5b5Body.max_tokens,
    maxTokensAfter: r5b6Body.max_tokens,
    stableFieldsEqual: unexpectedChangedFields.length === 0,
    r5b5RequestBodyHash: requestHash(r5b5Body),
    r5b6RequestBodyHash: requestHash(r5b6Body),
  };
}

export function buildR5B6RequestMeta({ input = buildR5B3SyntheticInput(), env = process.env } = {}) {
  const providerEnv = buildR5B6ProviderEnv(env);
  const body = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: "synthetic-probe", env: providerEnv, nativeMode: true, schemaVersion: "v2" });
  const completeness = lintDeepSeekSchemaCompleteness(deepseekDecisionToolSchemaV2);
  const shape = lintDeepSeekRequestShapeV2(body);
  const configDiff = buildR5B6ConfigDiff({ input, env });
  return {
    provider: "openai-compatible",
    endpointAlias: "deepseek-beta",
    modelAlias: MODEL,
    toolName: DEEPSEEK_TOOL_NAME,
    schemaVersion: DEEPSEEK_STRICT_TOOL_SCHEMA_V2_VERSION,
    strict: body.tools?.[0]?.function?.strict === true,
    singleTool: body.tools?.length === 1,
    additionalPropertiesFalse: body.tools?.[0]?.function?.parameters?.additionalProperties === false,
    thinkingType: body.thinking?.type || null,
    temperature: body.temperature,
    toolChoice: body.tool_choice,
    stream: body.stream,
    responseFormatSent: Object.hasOwn(body, "response_format"),
    maxTokens: body.max_tokens,
    retryCount: 0,
    requestSchemaHash: schemaHash(deepseekDecisionToolSchemaV2),
    requestBodyHash: requestHash(body),
    shapeReady: shape.ok,
    shapeErrors: shape.errors,
    configDiff,
    nodeCompleteness: {
      missingTypeAnyOfRefCount: completeness.missingTypeAnyOfRefCount,
      missingRequiredCount: completeness.missingRequiredCount,
      missingAdditionalPropertiesCount: completeness.missingAdditionalPropertiesCount,
      unsupportedKeywordCount: completeness.unsupportedKeywordCount,
    },
  };
}

export async function executeR5B6Probe({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const input = buildR5B3SyntheticInput();
  const inputSafety = validateR5B3SyntheticInput(input);
  const providerEnv = buildR5B6ProviderEnv(env);
  const request = buildR5B6RequestMeta({ input, env });
  const endpoint = String(providerEnv.LLM_BASE_URL || "").replace(/\/$/, "");
  const configDiffReady = request.configDiff.changedFields.length === 1
    && request.configDiff.changedFields[0] === "max_tokens"
    && request.configDiff.unexpectedChangedFields.length === 0
    && request.configDiff.maxTokensBefore === R5B5_MAX_TOKENS
    && request.configDiff.maxTokensAfter === R5B6_MAX_TOKENS;
  const preflight = {
    ...inputSafety,
    serverSideSecretReady: Boolean(providerEnv.LLM_API_KEY),
    configReady: endpoint === ENDPOINT && providerEnv.LLM_MODEL === MODEL && Boolean(providerEnv.LLM_API_KEY),
    requestHashReady: /^[0-9a-f]{64}$/.test(request.requestBodyHash),
    requestSchemaHashReady: request.requestSchemaHash === EXPECTED_SCHEMA_HASH,
    configDiffReady,
    request,
  };
  const base = {
    phase: RUN_ID,
    requestToken: REQUEST_TOKEN,
    requestCorrelation: REQUEST_CORRELATION,
    startedAt: now().toISOString(),
    provider: "openai-compatible",
    model: MODEL,
    endpointAlias: "deepseek-beta",
    contextVersion: "Synthetic Safe Context v2",
    schemaVersion: DEEPSEEK_STRICT_TOOL_SCHEMA_V2_VERSION,
    externalLlmCalls: 0,
    retryCount: 0,
    fixtureFallbackCount: 0,
    d365Get: 0,
    crmWriteback: false,
    productionRequests: 0,
    browserExternalProviderRequests: 0,
    inputSafety: preflight,
    request,
    configDiff: request.configDiff,
    realCanaryAuthorized: false,
    remainingCanaryExecutionAuthorized: false,
    phase3cComplete: false,
  };
  const preflightFailed = !preflight.serverSideSecretReady
    || !preflight.configReady
    || !preflight.flagsReady
    || preflight.forbiddenFieldCount !== 0
    || preflight.realCrmTokenCount !== 0
    || preflight.identityCount !== 0
    || preflight.exactAmountCount !== 0
    || preflight.rawTimelineCount !== 0
    || preflight.scenarioGoldenCount !== 0
    || !preflight.providerSafetyReady
    || !preflight.requestHashReady
    || !preflight.requestSchemaHashReady
    || !preflight.configDiffReady
    || !request.shapeReady
    || request.maxTokens !== R5B6_MAX_TOKENS
    || request.responseFormatSent
    || Object.values(request.nodeCompleteness).some((value) => value !== 0);
  if (preflightFailed) return finish({ ...base, status: "stopped-safety", stopReason: "r5b6_preflight_failed" }, now);

  let fetchCount = 0;
  const countedFetch = async (...args) => {
    fetchCount += 1;
    if (fetchCount > MAX_CALLS) throw new Error("R5B6 single-call limit exceeded");
    return fetchImpl(...args);
  };
  const callStarted = Date.now();
  const providerResult = await callComparisonProvider({
    safeContext: input.safeContext,
    accountAggregate: input.accountAggregate,
    page: "synthetic-probe",
    env: providerEnv,
    fetchImpl: countedFetch,
    requestCorrelation: REQUEST_CORRELATION,
  });
  const observed = providerResult.successResponseObservation || null;
  const usage = providerResult.usage || observedUsage(observed);
  const resultBase = {
    ...base,
    externalLlmCalls: fetchCount,
    retryCount: Math.max(0, fetchCount - 1),
    httpStatus: providerResult.httpStatus || null,
    tokenUsage: usage,
    estimatedCostUsd: estimateCost(usage),
    latencyMs: Date.now() - callStarted,
    successResponseObservation: observed,
  };
  if (fetchCount !== 1) return finish({ ...resultBase, status: "stopped-safety", stopReason: "single_external_call_violation", response: safeProviderFailure(providerResult) }, now);
  if (!providerResult.ok) return finish({ ...resultBase, status: "stopped-safety", stopReason: providerResult.diagnosticCategory || providerResult.reason || "provider_failed", failureCategory: providerResult.diagnosticCategory || null, response: safeProviderFailure(providerResult) }, now);

  const response = validateSyntheticResponse(providerResult.output, providerResult);
  const success = response.httpSuccess
    && response.choiceCountReady
    && response.finishReasonReady
    && response.toolCallReady
    && response.argumentStringReady
    && response.jsonReady
    && response.schemaV2Ready
    && response.canonicalMappingReady
    && response.evidenceValidationReady
    && response.unsupportedClaimCount === 0
    && response.safetyReady;
  return finish({ ...resultBase, status: success ? "completed" : "stopped-safety", stopReason: success ? null : "synthetic_response_validation_failed", response }, now);
}

function validateSyntheticResponse(output, providerResult) {
  const observation = providerResult.successResponseObservation || {};
  const schema = validateExternalModelResponse(output, { evidenceTokens: [SYNTHETIC_EVIDENCE] });
  const evidence = validateEvidence(output, [SYNTHETIC_EVIDENCE]);
  const safety = auditSyntheticOutput(output);
  return {
    httpSuccess: providerResult.httpStatus === 200,
    choiceCountReady: observation.choiceCount === 1 && observation.selectedChoiceIndex === 0,
    finishReasonReady: observation.finishReason === "tool_calls",
    toolCallReady: observation.toolCallsCount === 1 && observation.toolCallType === "function" && observation.functionName === DEEPSEEK_TOOL_NAME,
    argumentStringReady: observation.argumentsRuntimeType === "string",
    jsonReady: true,
    schemaV2Ready: schema.ok,
    schemaErrors: schema.errors,
    canonicalMappingReady: providerResult.canonicalMappingReady === true && output.recommendedActions.every((action) => action.status === "Draft only"),
    evidenceValidationReady: evidence.ok,
    evidenceErrors: evidence.errors,
    unsupportedClaimCount: safety.unsupportedClaimCount,
    safetyReady: safety.ok,
    safetyErrors: safety.errors,
    hallucinationAuditReady: safety.unsupportedClaimCount === 0 && evidence.ok,
  };
}

function validateEvidence(output, allowedTokens) {
  const allowed = new Set(allowedTokens);
  const errors = [];
  for (const item of output?.facts || []) if (!allowed.has(item.evidenceToken)) errors.push("fact:evidence");
  for (const item of output?.evidence || []) if (!allowed.has(item.evidenceToken)) errors.push("evidence:source");
  for (const item of output?.inferences || []) for (const token of item.evidenceTokens || []) if (!allowed.has(token)) errors.push("inference:evidence");
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function auditSyntheticOutput(output) {
  const serialized = JSON.stringify(output);
  const forbiddenKeys = ["customerName", "contactName", "email", "phone", "guid", "exactRevenue", "exactGp", "rawOpportunityClose", "contractText", "scenarioId", "goldenMetadata", "expectedAnswer", "rawCrm", "客户姓名", "联系人姓名", "精确金额", "精确收入", "精确毛利"];
  const errors = [];
  for (const key of forbiddenKeys) if (serialized.toLowerCase().includes(`"${key.toLowerCase()}"`)) errors.push(`forbidden:${key}`);
  if (/DEMO-(?:OPP|CUST|ACC)-|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serialized)) errors.push("real_crm_token");
  if (output?.safety?.customerIdentityMasked !== true || output?.safety?.exactAmountSentToModel !== false || output?.safety?.rawTimelineSent !== false || output?.safety?.crmWritebackEnabled !== false) errors.push("safety_flags");
  const providerSafety = containsForbiddenProviderContent(output);
  if (!providerSafety.ok) errors.push(providerSafety.blockedPatternKey || "provider_safety");
  return { ok: errors.length === 0, errors: [...new Set(errors)], unsupportedClaimCount: errors.filter((item) => item.startsWith("forbidden:") || item === "real_crm_token").length };
}

function safeProviderFailure(providerResult) {
  const observation = providerResult.successResponseObservation || {};
  return {
    httpSuccess: Number.isInteger(providerResult.httpStatus) && providerResult.httpStatus >= 200 && providerResult.httpStatus < 300,
    choiceCountReady: observation.choiceCount === 1 && observation.selectedChoiceIndex === 0,
    finishReasonReady: observation.finishReason === "tool_calls",
    toolCallReady: observation.toolCallsCount === 1 && observation.toolCallType === "function" && observation.functionName === DEEPSEEK_TOOL_NAME && observation.finishReason === "tool_calls",
    argumentStringReady: observation.argumentsRuntimeType === "string",
    jsonReady: false,
    schemaV2Ready: false,
    schemaErrors: [],
    canonicalMappingReady: false,
    evidenceValidationReady: false,
    evidenceErrors: [],
    unsupportedClaimCount: 0,
    safetyReady: false,
    safetyErrors: [providerResult.diagnosticCategory || providerResult.reason || "provider_failed"],
    hallucinationAuditReady: false,
  };
}

function finish(summary, now) {
  const completed = summary.status === "completed";
  return {
    ...summary,
    completedAt: now().toISOString(),
    syntheticProbeExecuted: summary.externalLlmCalls === 1,
    httpTransportReady: summary.response?.httpSuccess === true,
    finishReasonReady: summary.response?.finishReasonReady === true,
    toolCallReady: summary.response?.toolCallReady === true,
    argumentStringReady: summary.response?.argumentStringReady === true,
    jsonReady: summary.response?.jsonReady === true,
    schemaV2Ready: summary.response?.schemaV2Ready === true,
    canonicalMappingReady: summary.response?.canonicalMappingReady === true,
    evidenceValidationReady: summary.response?.evidenceValidationReady === true,
    safetyReady: summary.response?.safetyReady === true,
    providerRequestCompatibilityReady: completed,
    phase3cR5B6Complete: completed,
    phase3cComplete: false,
    realCanaryAuthorized: false,
    remainingCanaryExecutionAuthorized: false,
  };
}

function observedUsage(observation) {
  if (!observation || !Number.isFinite(Number(observation.completionTokens))) return null;
  return { completion_tokens: Number(observation.completionTokens) };
}

function estimateCost(usage) {
  if (!usage) return null;
  const total = Number(usage.total_tokens || Number(usage.prompt_tokens || 0) + Number(usage.completion_tokens || 0));
  return Number.isFinite(total) ? Number((total * 0.000001).toFixed(8)) : null;
}

function publicObservation(observation) {
  if (!observation || typeof observation !== "object") return null;
  return {
    providerSuccessObservabilityVersion: observation.providerSuccessObservabilityVersion,
    httpStatus: observation.httpStatus,
    choiceCount: observation.choiceCount,
    selectedChoiceIndex: observation.selectedChoiceIndex,
    finishReason: observation.finishReason,
    messageContentPresent: observation.messageContentPresent,
    reasoningContentPresent: observation.reasoningContentPresent,
    toolCallsCount: observation.toolCallsCount,
    toolCallType: observation.toolCallType,
    functionName: observation.functionName,
    argumentsRuntimeType: observation.argumentsRuntimeType,
    argumentsLength: observation.argumentsLength,
    argumentsSha256: observation.argumentsSha256,
    firstNonWhitespaceCharacterCategory: observation.firstNonWhitespaceCharacterCategory,
    lastNonWhitespaceCharacterCategory: observation.lastNonWhitespaceCharacterCategory,
    leftBraceCount: observation.leftBraceCount,
    rightBraceCount: observation.rightBraceCount,
    leftBracketCount: observation.leftBracketCount,
    rightBracketCount: observation.rightBracketCount,
    jsonParseErrorType: observation.jsonParseErrorType,
    jsonParseErrorPosition: observation.jsonParseErrorPosition,
    completionTokens: observation.completionTokens,
    maxTokens: observation.maxTokens,
    responseId: observation.responseId,
    requestCorrelationToken: observation.requestCorrelationToken,
    responseTimestamp: observation.responseTimestamp,
    latencyMs: observation.latencyMs,
  };
}

async function writeArtifacts(summary) {
  const response = summary.response || {};
  const observation = publicObservation(summary.successResponseObservation);
  const runtimeManifest = {
    phase: RUN_ID,
    requestToken: REQUEST_TOKEN,
    requestCorrelation: REQUEST_CORRELATION,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    provider: summary.provider,
    model: summary.model,
    endpointAlias: summary.endpointAlias,
    contextVersion: summary.contextVersion,
    schemaVersion: summary.schemaVersion,
    externalLlmCalls: summary.externalLlmCalls,
    retryCount: summary.retryCount,
    fixtureFallbackCount: summary.fixtureFallbackCount,
    d365Get: summary.d365Get,
    crmWriteback: false,
    productionRequests: 0,
    browserExternalProviderRequests: 0,
    serverSideSecretReady: summary.inputSafety.serverSideSecretReady,
    secretExposure: 0,
    rawInputStored: false,
    rawRequestStored: false,
    rawResponseStored: false,
    syntheticProbeExecuted: summary.syntheticProbeExecuted,
    status: summary.status,
    stopReason: summary.stopReason || null,
    failureCategory: summary.failureCategory || null,
    configDiff: summary.configDiff,
    request: summary.request,
    successObservation: observation,
    response,
    httpTransportReady: summary.httpTransportReady,
    finishReasonReady: summary.finishReasonReady,
    toolCallReady: summary.toolCallReady,
    argumentStringReady: summary.argumentStringReady,
    jsonReady: summary.jsonReady,
    schemaV2Ready: summary.schemaV2Ready,
    canonicalMappingReady: summary.canonicalMappingReady,
    evidenceValidationReady: summary.evidenceValidationReady,
    safetyReady: summary.safetyReady,
    providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady,
    phase3cR5B6Complete: summary.phase3cR5B6Complete,
    phase3cComplete: false,
    realCanaryAuthorized: false,
    remainingCanaryExecutionAuthorized: false,
    p0Count: 0,
    p1Count: summary.status === "completed" ? 0 : 1,
    p2Count: 0,
  };
  const requestAudit = {
    phase: RUN_ID,
    records: [{
      requestToken: REQUEST_TOKEN,
      requestCorrelation: REQUEST_CORRELATION,
      provider: summary.provider,
      model: summary.model,
      endpointAlias: summary.endpointAlias,
      contextVersion: summary.contextVersion,
      schemaVersion: summary.schemaVersion,
      requestSchemaHash: summary.request.requestSchemaHash,
      requestBodyHash: summary.request.requestBodyHash,
      configDiff: summary.configDiff,
      latencyMs: summary.latencyMs || null,
      tokenUsage: summary.tokenUsage,
      estimatedCostUsd: summary.estimatedCostUsd,
      httpStatus: summary.httpStatus || null,
      diagnosticCategory: summary.failureCategory || null,
      contractResult: response.schemaV2Ready ? "pass" : "not-run",
      evidenceResult: response.evidenceValidationReady ? "pass" : "not-run",
      safetyResult: response.safetyReady ? "pass" : "not-run",
      rawArguments: false,
      rawRequestBody: false,
      rawResponseBody: false,
      syntheticInputStored: false,
      secretStored: false,
      successObservation: observation,
    }],
    externalLlmCalls: summary.externalLlmCalls,
    retryCount: summary.retryCount,
    fixtureFallbackCount: summary.fixtureFallbackCount,
    d365Get: summary.d365Get,
    crmWriteback: false,
    productionRequests: 0,
    browserExternalProviderRequests: 0,
  };
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b6-output-budget-probe-report.md"), buildReport(summary, observation)),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b6-config-diff.json"), `${JSON.stringify(summary.configDiff, null, 2)}\n`),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b6-runtime-manifest.json"), `${JSON.stringify(runtimeManifest, null, 2)}\n`),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b6-request-audit.json"), `${JSON.stringify(requestAudit, null, 2)}\n`),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b6-response-validation.json"), `${JSON.stringify({ phase: RUN_ID, requestToken: REQUEST_TOKEN, ...response, status: summary.status, stopReason: summary.stopReason || null, providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady }, null, 2)}\n`),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b6-safety-report.md"), buildSafetyReport(summary, observation)),
  ]);
}

function buildReport(summary, observation) {
  const response = summary.response || {};
  return [
    "# Phase 3C-R5B6 Increased Output Budget Synthetic Strict Tool Probe",
    "",
    `- Status: **${summary.status}**`,
    `- External LLM Calls: **${summary.externalLlmCalls}/1**`,
    `- HTTP Status: **${summary.httpStatus || "not-recorded"}**`,
    `- Finish reason: **${observation?.finishReason || "not-recorded"}**`,
    `- Retry: **${summary.retryCount}**`,
    `- Fixture fallback: **${summary.fixtureFallbackCount}**`,
    `- D365 GET: **${summary.d365Get}**`,
    "- CRM Writeback: **false**",
    "- Production Requests: **0**",
    `- Provider Request Compatibility Ready: **${summary.providerRequestCompatibilityReady}**`,
    "",
    "## Configuration Diff",
    "",
    `- Changed Fields: **${JSON.stringify(summary.configDiff.changedFields)}**`,
    `- Unexpected Changed Fields: **${JSON.stringify(summary.configDiff.unexpectedChangedFields)}**`,
    `- max_tokens: **${summary.configDiff.maxTokensBefore} -> ${summary.configDiff.maxTokensAfter}**`,
    "",
    "## Preflight",
    "",
    `- Server-side secret ready: **${summary.inputSafety.serverSideSecretReady}**`,
    `- Schema Hash: ${summary.request.requestSchemaHash}`,
    `- Missing Type/AnyOf/Ref: **${summary.request.nodeCompleteness.missingTypeAnyOfRefCount}**`,
    `- Missing Required: **${summary.request.nodeCompleteness.missingRequiredCount}**`,
    `- Missing additionalProperties: **${summary.request.nodeCompleteness.missingAdditionalPropertiesCount}**`,
    `- Unsupported Keywords: **${summary.request.nodeCompleteness.unsupportedKeywordCount}**`,
    `- Synthetic forbidden fields: **${summary.inputSafety.forbiddenFieldCount}**`,
    `- Real CRM tokens: **${summary.inputSafety.realCrmTokenCount}**`,
    "",
    "## Observable Response",
    "",
    `- Choices: **${observation?.choiceCount ?? "not-recorded"}**`,
    `- Tool Calls: **${observation?.toolCallsCount ?? "not-recorded"}**`,
    `- Tool type/name: **${observation?.toolCallType ?? "not-recorded"} / ${observation?.functionName ?? "not-recorded"}**`,
    `- Arguments type/length: **${observation?.argumentsRuntimeType ?? "not-recorded"} / ${observation?.argumentsLength ?? "not-recorded"}**`,
    `- Arguments SHA-256: ${observation?.argumentsSha256 || "not-recorded"}`,
    `- Completion tokens: **${observation?.completionTokens ?? "not-recorded"}** / max **${observation?.maxTokens ?? "not-recorded"}**`,
    `- Latency: **${summary.latencyMs ?? "not-recorded"} ms**`,
    `- Estimated cost: **${summary.estimatedCostUsd ?? "not-recorded"} USD**`,
    "",
    "## Validation",
    "",
    `- HTTP Transport: **${response.httpSuccess === true}**`,
    `- Finish Reason: **${response.finishReasonReady === true}**`,
    `- Tool Call: **${response.toolCallReady === true}**`,
    `- Argument String: **${response.argumentStringReady === true}**`,
    `- JSON: **${response.jsonReady === true}**`,
    `- Schema V2: **${response.schemaV2Ready === true}**`,
    `- Canonical Mapping: **${response.canonicalMappingReady === true}**`,
    `- Evidence: **${response.evidenceValidationReady === true}**`,
    `- Safety: **${response.safetyReady === true}**`,
    `- Unsupported Claim Count: **${response.unsupportedClaimCount || 0}**`,
    "",
    "No raw arguments, request body, response body, Synthetic input, Safe Context, credentials, or authorization header is stored. Real Canary Authorized=false and Phase 3C Complete=false.",
    "",
  ].join("\n");
}

function buildSafetyReport(summary, observation) {
  const response = summary.response || {};
  return [
    "# Phase 3C-R5B6 Safety Report",
    "",
    "- Synthetic input only: **true**",
    "- Raw CRM Exposure: **0**",
    "- Exact Amount Exposure: **0**",
    "- Raw Timeline Exposure: **0**",
    "- Secret Exposure: **0**",
    "- Raw Arguments Stored: **false**",
    "- Raw Request Stored: **false**",
    "- Raw Response Stored: **false**",
    "- Browser External Provider Requests: **0**",
    "- CRM Writeback: **false**",
    "- Production Requests: **0**",
    "- D365 GET: **0**",
    `- Retry Count: **${summary.retryCount}**`,
    `- Fixture Fallback Count: **${summary.fixtureFallbackCount}**`,
    `- Observed finish reason: **${observation?.finishReason || "not-recorded"}**`,
    `- Safety Ready: **${response.safetyReady === true}**`,
    `- Failure category: **${summary.failureCategory || "none"}**`,
    "",
  ].join("\n");
}

function diffPaths(left, right, prefix = "") {
  if (Object.is(left, right)) return [];
  if (Array.isArray(left) || Array.isArray(right)) {
    if (JSON.stringify(left) === JSON.stringify(right)) return [];
    return [prefix || "root"];
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].sort().flatMap((key) => diffPaths(left[key], right[key], prefix ? `${prefix}.${key}` : key));
  }
  return [prefix || "root"];
}

export async function runR5B6({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const summary = await executeR5B6Probe({ env, fetchImpl, now });
  await writeArtifacts(summary);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const summary = await runR5B6();
  console.log(JSON.stringify({
    status: summary.status,
    externalLlmCalls: summary.externalLlmCalls,
    httpStatus: summary.httpStatus || null,
    finishReason: summary.successResponseObservation?.finishReason || null,
    failureCategory: summary.failureCategory || null,
    providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady,
    phase3cR5B6Complete: summary.phase3cR5B6Complete,
  }, null, 2));
}
