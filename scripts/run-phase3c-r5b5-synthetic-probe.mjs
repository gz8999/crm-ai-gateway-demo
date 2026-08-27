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
import { buildR5B3ProviderEnv, buildR5B3RequestMeta, buildR5B3SyntheticInput, validateR5B3SyntheticInput } from "./run-phase3c-r5b3-synthetic-probe.mjs";

const OUTPUT_DIR = path.join(process.cwd(), "docs", "gateway");
const RUN_ID = "PHASE3C-R5B5";
const REQUEST_TOKEN = "R5B5-SYNTH-V2-001";
const ENDPOINT = "https://api.deepseek.com/beta";
const MODEL = "deepseek-v4-pro";
const SYNTHETIC_EVIDENCE = "SYN-EVID-001";
const EXPECTED_SCHEMA_HASH = "476cecc436dc452abc50988d337d779398159e8e0a4003bc8aa6153cbdab22b7";
const MAX_CALLS = 1;

export async function executeR5B5Probe({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const input = buildR5B3SyntheticInput();
  const inputSafety = validateR5B3SyntheticInput(input);
  const providerEnv = buildR5B3ProviderEnv(env);
  const requestMeta = buildR5B5RequestMeta({ input, env });
  const endpoint = String(providerEnv.LLM_BASE_URL || "").replace(/\/$/, "");
  const preflight = {
    ...inputSafety,
    serverSideSecretReady: Boolean(providerEnv.LLM_API_KEY),
    configReady: endpoint === ENDPOINT && providerEnv.LLM_MODEL === MODEL && Boolean(providerEnv.LLM_API_KEY),
    requestHashReady: /^[0-9a-f]{64}$/.test(requestMeta.requestBodyHash),
    requestSchemaHashReady: requestMeta.requestSchemaHash === EXPECTED_SCHEMA_HASH,
    requestMeta,
  };
  const base = {
    phase: RUN_ID,
    requestToken: REQUEST_TOKEN,
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
    request: requestMeta,
    realCanaryAuthorized: false,
    remainingCanaryExecutionAuthorized: false,
    phase3cComplete: false,
  };
  if (!preflight.serverSideSecretReady || !preflight.configReady || !preflight.flagsReady || preflight.forbiddenFieldCount !== 0 || preflight.realCrmTokenCount !== 0 || preflight.identityCount !== 0 || preflight.exactAmountCount !== 0 || preflight.rawTimelineCount !== 0 || preflight.scenarioGoldenCount !== 0 || !preflight.providerSafetyReady || !preflight.requestHashReady || !preflight.requestSchemaHashReady || !requestMeta.shapeReady || Object.values(requestMeta.nodeCompleteness).some((value) => value !== 0)) {
    return finish({ ...base, status: "stopped-safety", stopReason: "synthetic_request_preflight_failed" }, now);
  }

  let fetchCount = 0;
  const countedFetch = async (...args) => {
    fetchCount += 1;
    if (fetchCount > MAX_CALLS) throw new Error("R5B5 single-call limit exceeded");
    return fetchImpl(...args);
  };
  const callStarted = Date.now();
  const providerResult = await callComparisonProvider({
    safeContext: input.safeContext,
    accountAggregate: input.accountAggregate,
    page: "synthetic-probe",
    env: providerEnv,
    fetchImpl: countedFetch,
    requestCorrelation: REQUEST_TOKEN,
  });
  const resultBase = {
    ...base,
    externalLlmCalls: fetchCount,
    retryCount: Math.max(0, fetchCount - 1),
    httpStatus: providerResult.httpStatus || null,
    tokenUsage: providerResult.usage || observedUsage(providerResult.successResponseObservation),
    estimatedCostUsd: estimateCost(providerResult.usage || observedUsage(providerResult.successResponseObservation)),
    latencyMs: Date.now() - callStarted,
    successResponseObservation: providerResult.successResponseObservation || null,
  };
  if (fetchCount !== 1) return finish({ ...resultBase, status: "stopped-safety", stopReason: "single_external_call_violation" }, now);
  if (!providerResult.ok) return finish({ ...resultBase, status: "stopped-safety", stopReason: providerResult.diagnosticCategory || providerResult.reason || "provider_failed", failureCategory: providerResult.diagnosticCategory || null, response: safeProviderFailure(providerResult) }, now);

  const response = validateSyntheticResponse(providerResult.output, providerResult, input);
  const success = response.httpSuccess && response.finishReasonReady && response.toolCallReady && response.argumentStringReady && response.jsonReady && response.schemaV2Ready && response.canonicalMappingReady && response.evidenceValidationReady && response.unsupportedClaimCount === 0 && response.safetyReady;
  return finish({ ...resultBase, status: success ? "completed" : "stopped-safety", stopReason: success ? null : "synthetic_response_validation_failed", response }, now);
}

export function buildR5B5RequestMeta({ input = buildR5B3SyntheticInput(), env = process.env } = {}) {
  const providerEnv = buildR5B3ProviderEnv(env);
  const body = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: "synthetic-probe", env: providerEnv, nativeMode: true, schemaVersion: "v2" });
  const completeness = lintDeepSeekSchemaCompleteness(deepseekDecisionToolSchemaV2);
  const shape = lintDeepSeekRequestShapeV2(body);
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
    retryCount: 0,
    requestSchemaHash: schemaHash(deepseekDecisionToolSchemaV2),
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

function validateSyntheticResponse(output, providerResult, input) {
  const observation = providerResult.successResponseObservation || {};
  const schema = validateExternalModelResponse(output, { evidenceTokens: [SYNTHETIC_EVIDENCE] });
  const evidence = validateEvidence(output, [SYNTHETIC_EVIDENCE]);
  const safety = auditSyntheticOutput(output, input, [SYNTHETIC_EVIDENCE]);
  return {
    httpSuccess: providerResult.httpStatus === 200,
    choiceCountReady: observation.choiceCount === 1 && observation.selectedChoiceIndex === 0,
    finishReasonReady: observation.finishReason === "tool_calls",
    toolCallReady: observation.toolCallsCount === 1 && observation.toolCallType === "function" && observation.functionName === DEEPSEEK_TOOL_NAME,
    argumentStringReady: observation.argumentsRuntimeType === "string",
    jsonReady: true,
    schemaV2Ready: schema.ok,
    schemaErrors: schema.errors,
    canonicalMappingReady: providerResult.canonicalMappingReady === true && output.recommendedActions.every((action) => action.status === "Draft only" && !Object.hasOwn(action, "draftStatus")),
    evidenceValidationReady: evidence.ok,
    evidenceErrors: evidence.errors,
    unsupportedClaimCount: safety.unsupportedClaimCount,
    safetyReady: safety.ok,
    safetyErrors: safety.errors,
    hallucinationAuditReady: safety.unsupportedClaimCount === 0 && evidence.ok,
  };
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

function validateEvidence(output, allowedTokens) {
  const allowed = new Set(allowedTokens);
  const errors = [];
  for (const item of output?.facts || []) if (!allowed.has(item.evidenceToken)) errors.push("fact:evidence");
  for (const item of output?.evidence || []) if (!allowed.has(item.evidenceToken)) errors.push("evidence:source");
  for (const item of output?.inferences || []) for (const token of item.evidenceTokens || []) if (!allowed.has(token)) errors.push("inference:evidence");
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function auditSyntheticOutput(output, input, allowedTokens) {
  const serialized = JSON.stringify(output);
  const forbiddenKeys = ["customerName", "contactName", "email", "phone", "guid", "exactRevenue", "exactGp", "rawOpportunityClose", "contractText", "scenarioId", "goldenMetadata", "expectedAnswer", "rawCrm", "客户姓名", "联系人姓名", "精确金额", "精确收入", "精确毛利"];
  const errors = [];
  for (const key of forbiddenKeys) if (serialized.toLowerCase().includes(`\"${key.toLowerCase()}\"`)) errors.push(`forbidden:${key}`);
  if (/DEMO-(?:OPP|CUST|ACC)-|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serialized)) errors.push("real_crm_token");
  if (!validateEvidence(output, allowedTokens).ok) errors.push("unsupported_evidence_token");
  if (input.safeContext.realCanary !== false || input.safeContext.d365Record !== false) errors.push("synthetic_flags");
  if (output?.safety?.customerIdentityMasked !== true || output?.safety?.exactAmountSentToModel !== false || output?.safety?.rawTimelineSent !== false || output?.safety?.crmWritebackEnabled !== false) errors.push("safety_flags");
  return { ok: errors.length === 0, errors: [...new Set(errors)], unsupportedClaimCount: errors.filter((item) => item.startsWith("forbidden:") || item === "real_crm_token").length };
}

function finish(summary, now) {
  const completed = summary.status === "completed";
  return {
    ...summary,
    completedAt: now().toISOString(),
    syntheticProbeExecuted: summary.externalLlmCalls === 1,
    httpTransportReady: completed && summary.response?.httpSuccess === true,
    providerRequestCompatibilityReady: completed,
    phase3cR5B5Complete: completed,
    phase3cComplete: false,
    realCanaryAuthorized: false,
    remainingCanaryExecutionAuthorized: false,
  };
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
    successObservation: observation,
    response: response,
    providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady,
    phase3cR5B5Complete: summary.phase3cR5B5Complete,
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
      provider: summary.provider,
      model: summary.model,
      endpointAlias: summary.endpointAlias,
      contextVersion: summary.contextVersion,
      schemaVersion: summary.schemaVersion,
      requestSchemaHash: summary.request.requestSchemaHash,
      requestBodyHash: summary.request.requestBodyHash,
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
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b5-synthetic-probe-report.md"), buildReport(summary, observation)),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b5-runtime-manifest.json"), `${JSON.stringify(runtimeManifest, null, 2)}\n`),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b5-request-audit.json"), `${JSON.stringify(requestAudit, null, 2)}\n`),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b5-response-validation.json"), `${JSON.stringify({ phase: RUN_ID, requestToken: REQUEST_TOKEN, ...response, status: summary.status, stopReason: summary.stopReason || null, providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady }, null, 2)}\n`),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b5-safety-report.md"), buildSafetyReport(summary, observation)),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5c-real-canary-decision-pack-zh.md"), buildDecisionPack(summary)),
  ]);
}

/*
function buildReport(summary, observation) {
  const response = summary.response || {};
  return `# Phase 3C-R5B5 Observable Synthetic Strict Tool Probe\n\n- Status: **${summary.status}**\n- External LLM Calls: **${summary.externalLlmCalls}/1**\n- HTTP Status: **${summary.httpStatus || "not-recorded"}**\n- Retry: **${summary.retryCount}**\n- Fixture fallback: **${summary.fixtureFallbackCount}**\n- D365 GET: **${summary.d365Get}**\n- CRM Writeback: **false**\n- Production Requests: **0**\n- Provider Request Compatibility Ready: **${summary.providerRequestCompatibilityReady}**\n\n## Preflight\n\n- Server-side secret ready: **${summary.inputSafety.serverSideSecretReady}**\n- Schema hash: `${summary.request.requestSchemaHash}`\n- Missing Type/AnyOf/Ref: **${summary.request.nodeCompleteness.missingTypeAnyOfRefCount}**\n- Missing Required: **${summary.request.nodeCompleteness.missingRequiredCount}**\n- Missing additionalProperties: **${summary.request.nodeCompleteness.missingAdditionalPropertiesCount}**\n- Unsupported keywords: **${summary.request.nodeCompleteness.unsupportedKeywordCount}**\n- Synthetic forbidden fields: **${summary.inputSafety.forbiddenFieldCount}**\n- Real CRM tokens: **${summary.inputSafety.realCrmTokenCount}**\n\n## Observable Response\n\n- Choice count: **${observation?.choiceCount ?? "not-recorded"}**\n- Finish reason: **${observation?.finishReason ?? "not-recorded"}**\n- Tool Calls: **${observation?.toolCallsCount ?? "not-recorded"}**\n- Tool type/name: **${observation?.toolCallType ?? "not-recorded"} / ${observation?.functionName ?? "not-recorded"}**\n- Arguments type/length: **${observation?.argumentsRuntimeType ?? "not-recorded"} / ${observation?.argumentsLength ?? "not-recorded"}**\n- Arguments SHA-256: `${observation?.argumentsSha256 || "not-recorded"}`\n- Parse error: **${observation?.jsonParseErrorType || "none"}** at **${observation?.jsonParseErrorPosition ?? "not-recorded"}**\n\n## Validation\n\n- Transport: **${response.httpSuccess === true}**\n- Finish reason: **${response.finishReasonReady === true}**\n- Tool Call: **${response.toolCallReady === true}**\n- Argument string: **${response.argumentStringReady === true}**\n- JSON: **${response.jsonReady === true}**\n- Schema V2: **${response.schemaV2Ready === true}**\n- Canonical Mapping: **${response.canonicalMappingReady === true}**\n- Evidence: **${response.evidenceValidationReady === true}**\n- Safety: **${response.safetyReady === true}**\n- Unsupported Claim Count: **${response.unsupportedClaimCount || 0}**\n\nNo raw arguments, response body, request body, Synthetic input, Safe Context, credentials, or authorization header is stored. Real Canary Authorized=false and Phase 3C Complete=false.\n`;
}
*/

function buildReport(summary, observation) {
  const response = summary.response || {};
  const lines = [
    "# Phase 3C-R5B5 Observable Synthetic Strict Tool Probe",
    "",
    `- Status: **${summary.status}**`,
    `- External LLM Calls: **${summary.externalLlmCalls}/1**`,
    `- HTTP Status: **${summary.httpStatus || "not-recorded"}**`,
    `- Retry: **${summary.retryCount}**`,
    `- Fixture fallback: **${summary.fixtureFallbackCount}**`,
    `- D365 GET: **${summary.d365Get}**`,
    "- CRM Writeback: **false**",
    "- Production Requests: **0**",
    `- Provider Request Compatibility Ready: **${summary.providerRequestCompatibilityReady}**`,
    "",
    "## Preflight",
    "",
    `- Server-side secret ready: **${summary.inputSafety.serverSideSecretReady}**`,
    `- Schema hash: ${summary.request.requestSchemaHash}`,
    `- Missing Type/AnyOf/Ref: **${summary.request.nodeCompleteness.missingTypeAnyOfRefCount}**`,
    `- Missing Required: **${summary.request.nodeCompleteness.missingRequiredCount}**`,
    `- Missing additionalProperties: **${summary.request.nodeCompleteness.missingAdditionalPropertiesCount}**`,
    `- Unsupported keywords: **${summary.request.nodeCompleteness.unsupportedKeywordCount}**`,
    `- Synthetic forbidden fields: **${summary.inputSafety.forbiddenFieldCount}**`,
    `- Real CRM tokens: **${summary.inputSafety.realCrmTokenCount}**`,
    "",
    "## Observable Response",
    "",
    `- Choice count: **${observation?.choiceCount ?? "not-recorded"}**`,
    `- Finish reason: **${observation?.finishReason ?? "not-recorded"}**`,
    `- Tool Calls: **${observation?.toolCallsCount ?? "not-recorded"}**`,
    `- Tool type/name: **${observation?.toolCallType ?? "not-recorded"} / ${observation?.functionName ?? "not-recorded"}**`,
    `- Arguments type/length: **${observation?.argumentsRuntimeType ?? "not-recorded"} / ${observation?.argumentsLength ?? "not-recorded"}**`,
    `- Arguments SHA-256: ${observation?.argumentsSha256 || "not-recorded"}`,
    `- Parse error: **${observation?.jsonParseErrorType || "none"}** at **${observation?.jsonParseErrorPosition ?? "not-recorded"}**`,
    `- Completion tokens: **${observation?.completionTokens ?? "not-recorded"}** / max **${observation?.maxTokens ?? "not-recorded"}**`,
    `- Latency: **${summary.latencyMs ?? "not-recorded"} ms**`,
    `- Estimated cost: **${summary.estimatedCostUsd ?? "not-recorded"} USD**`,
    "",
    "## Validation",
    "",
    `- Transport: **${response.httpSuccess === true}**`,
    `- Finish reason: **${response.finishReasonReady === true}**`,
    `- Tool Call: **${response.toolCallReady === true}**`,
    `- Argument string: **${response.argumentStringReady === true}**`,
    `- JSON: **${response.jsonReady === true}**`,
    `- Schema V2: **${response.schemaV2Ready === true}**`,
    `- Canonical Mapping: **${response.canonicalMappingReady === true}**`,
    `- Evidence: **${response.evidenceValidationReady === true}**`,
    `- Safety: **${response.safetyReady === true}**`,
    `- Unsupported Claim Count: **${response.unsupportedClaimCount || 0}**`,
    "",
    "No raw arguments, response body, request body, Synthetic input, Safe Context, credentials, or authorization header is stored. Real Canary Authorized=false and Phase 3C Complete=false.",
    "",
  ];
  return lines.join("\n");
}

function buildSafetyReport(summary, observation) {
  const response = summary.response || {};
  return `# Phase 3C-R5B5 Safety Report\n\n- Synthetic input only: **true**\n- Raw CRM Exposure: **0**\n- Exact Amount Exposure: **0**\n- Raw Timeline Exposure: **0**\n- Secret Exposure: **0**\n- Raw Arguments Stored: **false**\n- Raw Response Stored: **false**\n- Browser External Provider Requests: **0**\n- CRM Writeback: **false**\n- Production Requests: **0**\n- D365 GET: **0**\n- Retry Count: **${summary.retryCount}**\n- Fixture Fallback Count: **${summary.fixtureFallbackCount}**\n- Safety Ready: **${response.safetyReady === true}**\n- Observed finish reason: **${observation?.finishReason || "not-recorded"}**\n- Failure category: **${summary.failureCategory || "none"}**\n`;
}

function buildDecisionPackLegacy(summary) {
  return `# Phase 3C-R5C Real Canary Decision Pack\n\n- Real Canary Authorized=false\n- Remaining Canary Execution Authorized=false\n- Phase 3C Complete=false\n- R5B5 Synthetic Probe: **${summary.phase3R5B5Complete}**\n- Provider Request Compatibility Ready: **${summary.providerRequestCompatibilityReady}**\n\nR5B5 used one fully synthetic Safe Context v2 input and at most one DeepSeek V2 strict Tool Calling request. It did not read D365, select a real Canary, write CRM, use a browser-side Provider, or compare models.\n\nA real Canary requires a separate authorization, fresh Safe Context review, a new request budget, and stop-on-first-failure execution.\n`;
}

function buildDecisionPack(summary) {
  return [
    "# Phase 3C-R5C Real Canary Decision Pack",
    "",
    "- Real Canary Authorized=false",
    "- Remaining Canary Execution Authorized=false",
    "- Phase 3C Complete=false",
    `- R5B5 Synthetic Probe: **${summary.phase3cR5B5Complete}**`,
    `- Provider Request Compatibility Ready: **${summary.providerRequestCompatibilityReady}**`,
    "",
    "R5B5 used one fully synthetic Safe Context v2 input and at most one DeepSeek V2 strict Tool Calling request. It did not read D365, select a real Canary, write CRM, use a browser-side Provider, or compare models.",
    "",
    "A real Canary requires a separate authorization, fresh Safe Context review, a new request budget, and stop-on-first-failure execution.",
    "",
  ].join("\n");
}

export async function runR5B5({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const summary = await executeR5B5Probe({ env, fetchImpl, now });
  await writeArtifacts(summary);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const summary = await runR5B5();
  console.log(JSON.stringify({
    status: summary.status,
    externalLlmCalls: summary.externalLlmCalls,
    httpStatus: summary.httpStatus || null,
    failureCategory: summary.failureCategory || null,
    providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady,
    phase3cR5B5Complete: summary.phase3cR5B5Complete,
  }, null, 2));
}
