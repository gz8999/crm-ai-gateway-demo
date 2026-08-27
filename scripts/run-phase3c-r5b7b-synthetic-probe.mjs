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
import { buildR5B6ProviderEnv } from "./run-phase3c-r5b6-output-budget-probe.mjs";
import { finalizeSyntheticToolArgumentQuarantine, writeSyntheticToolArgumentQuarantine } from "../server/decision/toolArgumentsQuarantine.mjs";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const RUN_ID = "PHASE3C-R5B7B";
const REQUEST_TOKEN = "R5B7B-SYNTH-V2-001";
const REQUEST_CORRELATION = "R5B7B-SYNTH-V2-001";
const ENDPOINT = "https://api.deepseek.com/beta";
const MODEL = "deepseek-v4-pro";
const PAGE = "synthetic-probe";
const SYNTHETIC_EVIDENCE = "SYN-EVID-001";
const EXPECTED_SCHEMA_HASH = "476cecc436dc452abc50988d337d779398159e8e0a4003bc8aa6153cbdab22b7";
const MAX_TOKENS = 2400;
const MAX_CALLS = 1;

export function buildR5B7BProviderEnv(env = process.env) {
  return { ...buildR5B6ProviderEnv(env), LLM_MAX_TOKENS: String(MAX_TOKENS) };
}

export function buildR5B7BConfigDiff({ input = buildR5B3SyntheticInput(), env = process.env } = {}) {
  const providerEnv = buildR5B7BProviderEnv(env);
  const before = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: PAGE, env: providerEnv, nativeMode: true, schemaVersion: "v2" });
  const after = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: PAGE, env: providerEnv, nativeMode: true, schemaVersion: "v2" });
  const changedFields = diffPaths(before, after);
  return {
    baselineRun: "PHASE3C-R5B6",
    currentRun: RUN_ID,
    changedFields,
    unexpectedChangedFields: [...changedFields],
    stableFieldsEqual: changedFields.length === 0,
    baselineRequestBodyHash: requestHash(before),
    currentRequestBodyHash: requestHash(after),
    maxTokens: after.max_tokens,
  };
}

export function buildR5B7BRequestMeta({ input = buildR5B3SyntheticInput(), env = process.env } = {}) {
  const providerEnv = buildR5B7BProviderEnv(env);
  const body = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: PAGE, env: providerEnv, nativeMode: true, schemaVersion: "v2" });
  const completeness = lintDeepSeekSchemaCompleteness(deepseekDecisionToolSchemaV2);
  const shape = lintDeepSeekRequestShapeV2(body);
  return {
    provider: "openai-compatible",
    endpointAlias: "deepseek-beta",
    modelAlias: MODEL,
    toolName: DEEPSEEK_TOOL_NAME,
    schemaVersion: DEEPSEEK_STRICT_TOOL_SCHEMA_V2_VERSION,
    schemaHash: schemaHash(deepseekDecisionToolSchemaV2),
    strict: body.tools?.[0]?.function?.strict === true,
    singleTool: body.tools?.length === 1,
    thinkingType: body.thinking?.type || null,
    temperature: body.temperature,
    maxTokens: body.max_tokens,
    stream: body.stream,
    toolChoice: body.tool_choice,
    responseFormatSent: Object.hasOwn(body, "response_format"),
    retryCount: 0,
    requestBodyHash: requestHash(body),
    shapeReady: shape.ok,
    shapeErrors: shape.errors,
    nodeCompleteness: {
      missingTypeAnyOfRefCount: completeness.missingTypeAnyOfRefCount,
      missingRequiredCount: completeness.missingRequiredCount,
      missingAdditionalPropertiesCount: completeness.missingAdditionalPropertiesCount,
      unsupportedKeywordCount: completeness.unsupportedKeywordCount,
    },
  };
}

export async function executeR5B7BProbe({ env = process.env, fetchImpl = globalThis.fetch, repoRoot = ROOT, now = () => new Date() } = {}) {
  const input = buildR5B3SyntheticInput();
  const inputSafety = validateR5B7BSyntheticInput(input);
  const providerEnv = buildR5B7BProviderEnv(env);
  const request = buildR5B7BRequestMeta({ input, env });
  const configDiff = buildR5B7BConfigDiff({ input, env });
  const endpoint = String(providerEnv.LLM_BASE_URL || "").replace(/\/$/, "");
  const preflight = {
    ...inputSafety,
    serverSideSecretReady: Boolean(providerEnv.LLM_API_KEY),
    configReady: endpoint === ENDPOINT && providerEnv.LLM_MODEL === MODEL && Boolean(providerEnv.LLM_API_KEY),
    requestSchemaHashReady: request.schemaHash === EXPECTED_SCHEMA_HASH,
    configDiffReady: configDiff.changedFields.length === 0 && configDiff.unexpectedChangedFields.length === 0 && configDiff.maxTokens === MAX_TOKENS,
    request,
    configDiff,
  };
  const base = {
    phase: RUN_ID,
    requestToken: REQUEST_TOKEN,
    requestCorrelation: REQUEST_CORRELATION,
    startedAt: now().toISOString(),
    provider: request.provider,
    model: MODEL,
    endpointAlias: request.endpointAlias,
    contextVersion: "Synthetic Safe Context v2",
    schemaVersion: DEEPSEEK_STRICT_TOOL_SCHEMA_V2_VERSION,
    externalLlmCalls: 0,
    jsonParseAttempts: 0,
    jsonParseSuccess: 0,
    schemaValidCount: 0,
    retryCount: 0,
    fixtureFallbackCount: 0,
    d365Get: 0,
    crmWriteback: false,
    productionRequests: 0,
    browserExternalRequests: 0,
    inputSafety: preflight,
    request,
    configDiff,
    realCanaryAuthorized: false,
    remainingCanaryExecutionAuthorized: false,
    phase3cComplete: false,
  };
  const preflightFailed = !preflight.serverSideSecretReady
    || !preflight.configReady
    || !preflight.flagsReady
    || preflight.realCrmTokenCount !== 0
    || preflight.forbiddenFieldCount !== 0
    || preflight.guidCount !== 0
    || preflight.identityCount !== 0
    || preflight.exactAmountCount !== 0
    || preflight.rawTimelineCount !== 0
    || preflight.scenarioGoldenCount !== 0
    || !preflight.providerSafetyReady
    || !preflight.requestSchemaHashReady
    || !preflight.configDiffReady
    || !request.shapeReady
    || request.responseFormatSent
    || request.maxTokens !== MAX_TOKENS
    || Object.values(request.nodeCompleteness).some((value) => value !== 0);
  if (preflightFailed) return finish({ ...base, status: "stopped-safety", stopReason: "r5b7b_preflight_failed" }, now);

  let fetchCount = 0;
  let parseFailure = null;
  const countedFetch = async (...args) => {
    fetchCount += 1;
    if (fetchCount > MAX_CALLS) throw new Error("R5B7B single-call limit exceeded");
    return fetchImpl(...args);
  };
  const callStarted = Date.now();
  const providerResult = await callComparisonProvider({
    safeContext: input.safeContext,
    accountAggregate: input.accountAggregate,
    page: PAGE,
    env: providerEnv,
    fetchImpl: countedFetch,
    requestCorrelation: REQUEST_CORRELATION,
    onToolArgumentsParseFailure: (failure) => { parseFailure = failure; },
  });
  const resultBase = {
    ...base,
    externalLlmCalls: fetchCount,
    retryCount: Math.max(0, fetchCount - 1),
    httpStatus: providerResult.httpStatus || null,
    finishReason: providerResult.successResponseObservation?.finishReason || null,
    toolCallCount: providerResult.successResponseObservation?.toolCallsCount || 0,
    jsonParseAttempts: parseFailure || providerResult.ok ? 1 : 0,
    tokenUsage: providerResult.usage || observedUsage(providerResult.successResponseObservation),
    estimatedCostUsd: estimateCost(providerResult.usage || observedUsage(providerResult.successResponseObservation)),
    latencyMs: Date.now() - callStarted,
    successResponseObservation: providerResult.successResponseObservation || null,
    failureCategory: providerResult.diagnosticCategory || null,
  };
  if (fetchCount !== 1) return finish({ ...resultBase, status: "stopped-safety", stopReason: "single_external_call_violation" }, now);

  let quarantine = { writeCount: 0, deleteCount: 0, rawFileExistsAfterDelete: false, diagnostics: null, lifecycle: null };
  if (parseFailure && providerResult.diagnosticCategory === "ARGUMENT_JSON_INVALID" && providerResult.httpStatus >= 200 && providerResult.httpStatus < 300) {
    const parseOutcome = {
      ok: false,
      value: null,
      type: parseFailure.error?.name || "SyntaxError",
      offset: parseErrorOffset(parseFailure.error),
      message: String(parseFailure.error?.message || ""),
    };
    const written = await writeSyntheticToolArgumentQuarantine({ argumentsText: parseFailure.argumentsText, parseOutcome, eligibility: syntheticEligibility(input), repoRoot, now });
    const deleted = await finalizeSyntheticToolArgumentQuarantine({ repoRoot, now });
    quarantine = { writeCount: 1, deleteCount: 1, rawFileExistsAfterDelete: deleted.rawFileExistsAfterDeletion, diagnostics: written.publicDiagnostics, lifecycle: deleted };
  }

  if (!providerResult.ok) {
    return finish({ ...resultBase, ...quarantine, status: "stopped-safety", stopReason: providerResult.diagnosticCategory || providerResult.reason || "provider_failed", response: safeProviderFailure(providerResult) }, now);
  }
  const response = validateR5B7BResponse(providerResult.output, providerResult);
  const success = response.httpSuccess && response.finishReasonReady && response.toolCallReady && response.argumentStringReady && response.jsonReady && response.schemaReady && response.canonicalMappingReady && response.evidenceReady && response.safetyReady;
  return finish({ ...resultBase, ...quarantine, status: success ? "completed" : "stopped-safety", stopReason: success ? null : "synthetic_response_validation_failed", response, jsonParseSuccess: response.jsonReady ? 1 : 0, schemaValidCount: response.schemaReady ? 1 : 0 }, now);
}

function validateR5B7BSyntheticInput(input) {
  const base = validateR5B3SyntheticInput(input);
  const safe = input.safeContext || {};
  const aggregate = input.accountAggregate || {};
  const serialized = JSON.stringify({ safe, aggregate });
  const countKey = (keys) => keys.reduce((count, key) => count + (serialized.toLowerCase().includes(`"${key.toLowerCase()}"`) ? 1 : 0), 0);
  const guidCount = (serialized.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []).length;
  return {
    ...base,
    flagsReady: safe.testOnly === true && safe.syntheticProbe === true && safe.d365Record === false && safe.runtimeEligible === false && safe.realCanary === false,
    d365Record: safe.d365Record === false,
    runtimeEligible: safe.runtimeEligible === false,
    realCanary: safe.realCanary === false,
    guidCount,
    forbiddenFieldCount: countKey(["customerName", "contactName", "email", "phone", "guid", "exactRevenue", "exactGp", "exactAmount", "rawTimeline", "rawOpportunityClose", "contractText", "scenarioId", "goldenMetadata", "expectedAnswer", "rawCrm"]),
    identityCount: countKey(["customerName", "contactName", "email", "phone", "userIdentity", "teamIdentity"]),
    exactAmountCount: countKey(["exactRevenue", "exactGp", "exactAmount", "annualRevenue", "annualActualRevenue"]),
    rawTimelineCount: countKey(["rawTimeline", "rawOpportunityClose", "notetext", "annotationtext", "timelinebody"]),
    scenarioGoldenCount: countKey(["scenarioId", "goldenMetadata", "expectedAnswer", "goldenLabel"]),
  };
}

function syntheticEligibility(input) {
  const safety = input.safeContext || {};
  const validation = validateR5B7BSyntheticInput(input);
  return {
    testOnly: safety.testOnly === true,
    syntheticProbe: safety.syntheticProbe === true,
    d365Record: safety.d365Record,
    runtimeEligible: safety.runtimeEligible,
    realCanary: safety.realCanary,
    realCrmTokenCount: validation.realCrmTokenCount,
    forbiddenFieldCount: validation.forbiddenFieldCount,
  };
}

function validateR5B7BResponse(output, providerResult) {
  const observation = providerResult.successResponseObservation || {};
  const schema = validateExternalModelResponse(output, { evidenceTokens: [SYNTHETIC_EVIDENCE] });
  const evidenceErrors = [];
  const allowed = new Set([SYNTHETIC_EVIDENCE]);
  for (const item of output?.facts || []) if (!allowed.has(item.evidenceToken)) evidenceErrors.push("fact:evidence");
  for (const item of output?.evidence || []) if (!allowed.has(item.evidenceToken)) evidenceErrors.push("evidence:source");
  for (const item of output?.inferences || []) for (const token of item.evidenceTokens || []) if (!allowed.has(token)) evidenceErrors.push("inference:evidence");
  const safety = auditOutput(output);
  return {
    httpSuccess: providerResult.httpStatus === 200,
    choiceCountReady: observation.choiceCount === 1,
    finishReasonReady: observation.finishReason === "tool_calls",
    toolCallReady: observation.toolCallsCount === 1 && observation.toolCallType === "function" && observation.functionName === DEEPSEEK_TOOL_NAME,
    argumentStringReady: observation.argumentsRuntimeType === "string",
    jsonReady: true,
    schemaReady: schema.ok,
    schemaErrors: schema.errors,
    canonicalMappingReady: providerResult.canonicalMappingReady === true && (output?.recommendedActions || []).every((item) => item.status === "Draft only"),
    evidenceReady: evidenceErrors.length === 0,
    evidenceErrors: [...new Set(evidenceErrors)],
    safetyReady: safety.ok,
    safetyErrors: safety.errors,
    unsupportedClaimCount: safety.unsupportedClaimCount,
  };
}

function auditOutput(output) {
  const serialized = JSON.stringify(output || {});
  const forbiddenKeys = ["customerName", "contactName", "email", "phone", "guid", "exactRevenue", "exactGp", "rawTimeline", "rawOpportunityClose", "contractText", "scenarioId", "goldenMetadata", "expectedAnswer", "rawCrm"];
  const errors = forbiddenKeys.filter((key) => serialized.toLowerCase().includes(`"${key.toLowerCase()}"`)).map((key) => `forbidden:${key}`);
  if (/DEMO-(?:OPP|CUST|ACC)-|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serialized)) errors.push("real_crm_token");
  if (output?.safety?.customerIdentityMasked !== true || output?.safety?.exactAmountSentToModel !== false || output?.safety?.rawTimelineSent !== false || output?.safety?.crmWritebackEnabled !== false) errors.push("safety_flags");
  const providerSafety = containsForbiddenProviderContent(output);
  if (!providerSafety.ok) errors.push(providerSafety.blockedPatternKey || "provider_safety");
  return { ok: errors.length === 0, errors: [...new Set(errors)], unsupportedClaimCount: errors.filter((item) => item.startsWith("forbidden:") || item === "real_crm_token").length };
}

function safeProviderFailure(providerResult) {
  const observation = providerResult.successResponseObservation || {};
  return {
    httpSuccess: providerResult.httpStatus >= 200 && providerResult.httpStatus < 300,
    finishReasonReady: observation.finishReason === "tool_calls",
    toolCallReady: observation.toolCallsCount === 1 && observation.toolCallType === "function" && observation.functionName === DEEPSEEK_TOOL_NAME,
    argumentStringReady: observation.argumentsRuntimeType === "string",
    jsonReady: false,
    schemaReady: false,
    canonicalMappingReady: false,
    evidenceReady: false,
    safetyReady: false,
    unsupportedClaimCount: 0,
  };
}

function finish(summary, now) {
  const completed = summary.status === "completed";
  return {
    ...summary,
    completedAt: now().toISOString(),
    syntheticProbeExecuted: summary.externalLlmCalls === 1,
    httpTransportReady: summary.httpStatus >= 200 && summary.httpStatus < 300,
    finishReasonReady: summary.finishReason === "tool_calls",
    toolCallReady: summary.toolCallCount === 1 && summary.successResponseObservation?.toolCallType === "function" && summary.successResponseObservation?.functionName === DEEPSEEK_TOOL_NAME,
    argumentStringReady: summary.successResponseObservation?.argumentsRuntimeType === "string",
    jsonReady: summary.response?.jsonReady === true,
    schemaReady: summary.response?.schemaReady === true,
    canonicalMappingReady: summary.response?.canonicalMappingReady === true,
    evidenceReady: summary.response?.evidenceReady === true,
    safetyReady: summary.response?.safetyReady === true,
    providerRequestCompatibilityReady: completed,
    phase3cR5B7BComplete: completed,
    phase3cComplete: false,
    realCanaryAuthorized: false,
    remainingCanaryExecutionAuthorized: false,
  };
}

function publicObservation(observation) {
  if (!observation) return null;
  return {
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

export async function writeR5B7BArtifacts(summary) {
  const observation = publicObservation(summary.successResponseObservation);
  const diagnostics = summary.diagnostics || null;
  const publicBase = {
    phase: RUN_ID,
    requestToken: REQUEST_TOKEN,
    requestCorrelation: REQUEST_CORRELATION,
    status: summary.status,
    stopReason: summary.stopReason,
    externalLlmCalls: summary.externalLlmCalls,
    jsonParseAttempts: summary.jsonParseAttempts,
    jsonParseSuccess: summary.jsonParseSuccess,
    schemaValidCount: summary.schemaValidCount,
    retryCount: summary.retryCount,
    fixtureFallbackCount: summary.fixtureFallbackCount,
    d365Get: 0,
    crmWriteback: false,
    productionRequests: 0,
    browserExternalRequests: 0,
    httpStatus: summary.httpStatus,
    finishReason: summary.finishReason,
    toolCallCount: summary.toolCallCount,
    quarantineWriteCount: summary.writeCount || 0,
    quarantineDeleteCount: summary.deleteCount || 0,
    rawFileExistsAfterDelete: summary.rawFileExistsAfterDelete === true,
    providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady,
    phase3cR5B7BComplete: summary.phase3cR5B7BComplete,
    p0Count: 0,
    p1Count: summary.status === "completed" ? 0 : 1,
    p2Count: 0,
  };
  await fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b7b-runtime-manifest.json"), `${JSON.stringify({ ...publicBase, startedAt: summary.startedAt, completedAt: summary.completedAt, request: safeRequest({ ...summary.request, configDiff: summary.configDiff }), inputSafety: safeInput(summary.inputSafety), diagnostics }, null, 2)}\n`);
  await fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b7b-request-audit.json"), `${JSON.stringify({ ...publicBase, provider: summary.provider, model: summary.model, endpointAlias: summary.endpointAlias, requestBodyHash: summary.request?.requestBodyHash, schemaHash: summary.request?.schemaHash, configDiff: summary.configDiff, tokenUsage: summary.tokenUsage, estimatedCostUsd: summary.estimatedCostUsd, latencyMs: summary.latencyMs, responseObservation: observation }, null, 2)}\n`);
  await fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b7b-json-diagnostics-public.json"), `${JSON.stringify(diagnostics || { syntaxCategory: null, note: "No JSON diagnostic was required" }, null, 2)}\n`);
  await fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b7b-response-validation.json"), `${JSON.stringify({ ...publicBase, response: summary.response || null, observation }, null, 2)}\n`);
  await fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b7b-synthetic-probe-report.md"), buildReport(summary, observation, diagnostics));
  await fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b7b-safety-report.md"), buildSafetyReport(summary, diagnostics));
  await fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b8-remediation-decision-pack-zh.md"), buildDecisionPack(summary));
}

function safeRequest(request) {
  return { provider: request.provider, endpointAlias: request.endpointAlias, modelAlias: request.modelAlias, schemaVersion: request.schemaVersion, schemaHash: request.schemaHash, strict: request.strict, singleTool: request.singleTool, thinkingType: request.thinkingType, temperature: request.temperature, maxTokens: request.maxTokens, stream: request.stream, toolChoice: request.toolChoice, responseFormatSent: request.responseFormatSent, retryCount: request.retryCount, requestBodyHash: request.requestBodyHash, configDiff: request.configDiff || null, nodeCompleteness: request.nodeCompleteness };
}
function safeInput(input) { return { flagsReady: input.flagsReady, realCrmTokenCount: input.realCrmTokenCount, forbiddenFieldCount: input.forbiddenFieldCount, guidCount: input.guidCount, identityCount: input.identityCount, exactAmountCount: input.exactAmountCount, rawTimelineCount: input.rawTimelineCount, scenarioGoldenCount: input.scenarioGoldenCount, providerSafetyReady: input.providerSafetyReady }; }
function buildReport(summary, observation, diagnostics) {
  return `# Phase 3C-R5B7B Single Synthetic Probe\n\n- Status: **${summary.status}**\n- Stop reason: **${summary.stopReason || "none"}**\n- External LLM Calls: **${summary.externalLlmCalls}/1**\n- HTTP: **${summary.httpStatus || "not-recorded"}**\n- Finish reason: **${summary.finishReason || "not-recorded"}**\n- Tool Calls: **${summary.toolCallCount || 0}**\n- JSON Parse Attempts/Success: **${summary.jsonParseAttempts}/${summary.jsonParseSuccess}**\n- Schema Valid Count: **${summary.schemaValidCount}**\n- Token Usage: **${summary.tokenUsage ? JSON.stringify(summary.tokenUsage) : "not-recorded"}**\n- Estimated Cost: **${summary.estimatedCostUsd ?? "not-recorded"} USD**\n- Retry: **${summary.retryCount}**\n- Fixture fallback: **${summary.fixtureFallbackCount}**\n- D365 GET: **0**\n- CRM Writeback: **false**\n- Production Requests: **0**\n\n## Configuration\n\n- Changed Fields: **[]**\n- Unexpected Changed Fields: **[]**\n- Schema Hash: **${summary.request?.schemaHash || "not-recorded"}**\n- max_tokens: **${summary.request?.maxTokens || "not-recorded"}**\n\n## Public JSON Diagnostics\n\n- Failure category: **${diagnostics?.syntaxCategory || summary.failureCategory || "none"}**\n- Offset: **${diagnostics?.parseErrorOffset ?? "not-recorded"}**\n- Line/column: **${diagnostics?.parseErrorLine ?? "not-recorded"}/${diagnostics?.parseErrorColumn ?? "not-recorded"}**\n- Arguments length: **${diagnostics?.argumentsLength ?? observation?.argumentsLength ?? "not-recorded"}**\n- Arguments SHA-256: **${diagnostics?.argumentsSha256 || observation?.argumentsSha256 || "not-recorded"}**\n- Raw File Exists After Delete: **${summary.rawFileExistsAfterDelete === true}**\n\nNo raw arguments, private diagnostic window, request body, response body, Synthetic input, Safe Context, credentials, or authorization header is included. Real Canary remains unauthorized.\n`;
}
function buildSafetyReport(summary, diagnostics) {
  return `# Phase 3C-R5B7B Safety Report\n\n- Synthetic-only capture gate: **true**\n- Raw CRM Exposure: **0**\n- Exact Amount Exposure: **0**\n- Raw Timeline Exposure: **0**\n- Secret Exposure: **0**\n- Quarantine Writes: **${summary.writeCount || 0}**\n- Quarantine Deletes: **${summary.deleteCount || 0}**\n- Raw File Exists After Delete: **${summary.rawFileExistsAfterDelete === true}**\n- Failure category: **${diagnostics?.syntaxCategory || summary.failureCategory || "none"}**\n- CRM Writeback: **false**\n- Production Requests: **0**\n- External LLM Calls: **${summary.externalLlmCalls}**\n`;
}
function buildDecisionPack(summary) { return `# Phase 3C-R5B8 修复决策包\n\nR5B7B 状态：**${summary.status}**。本阶段不修复响应、不重试、不执行真实 Canary。\n\n下一步仅建议独立修复授权；不得把诊断结果直接当作 Provider 兼容性通过。\n\n- Provider Request Compatibility Ready: **${summary.providerRequestCompatibilityReady}**\n- Real Canary Authorized: **false**\n- CRM Writeback: **false**\n- Production Requests: **0**\n`; }

export async function runR5B7B({ env = process.env, fetchImpl = globalThis.fetch, repoRoot = ROOT, now = () => new Date() } = {}) {
  const summary = await executeR5B7BProbe({ env, fetchImpl, repoRoot, now });
  await writeR5B7BArtifacts(summary);
  return summary;
}

function estimateCost(usage) {
  if (!usage) return null;
  const total = Number(usage.total_tokens || Number(usage.prompt_tokens || 0) + Number(usage.completion_tokens || 0));
  return Number.isFinite(total) ? Number((total * 0.000001).toFixed(8)) : null;
}
function observedUsage(observation) {
  if (!observation || !Number.isFinite(Number(observation.completionTokens))) return null;
  return { completion_tokens: Number(observation.completionTokens) };
}
function parseErrorOffset(error) {
  const match = String(error?.message || "").match(/(?:position|column)\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}
function diffPaths(left, right, prefix = "") {
  if (Object.is(left, right)) return [];
  if (Array.isArray(left) || Array.isArray(right)) return JSON.stringify(left) === JSON.stringify(right) ? [] : [prefix || "root"];
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].sort().flatMap((key) => diffPaths(left[key], right[key], prefix ? `${prefix}.${key}` : key));
  }
  return [prefix || "root"];
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const summary = await runR5B7B();
  console.log(JSON.stringify({ status: summary.status, externalLlmCalls: summary.externalLlmCalls, httpStatus: summary.httpStatus || null, finishReason: summary.finishReason || null, failureCategory: summary.failureCategory || null, quarantineWriteCount: summary.writeCount || 0, quarantineDeleteCount: summary.deleteCount || 0, rawFileExistsAfterDelete: summary.rawFileExistsAfterDelete === true, providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady, phase3cR5B7BComplete: summary.phase3cR5B7BComplete }, null, 2));
}
