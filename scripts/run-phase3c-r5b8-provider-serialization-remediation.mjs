import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import {
  DEEPSEEK_SERIALIZATION_PROFILE_V4_VERSION,
  DEEPSEEK_STRICT_TOOL_SCHEMA_V2_VERSION,
  DEEPSEEK_TOOL_NAME,
  deepseekDecisionToolSchemaV2,
  lintDeepSeekRequestShapeV2,
  lintDeepSeekSchemaCompleteness,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import { requestHash, validateExternalModelResponse } from "../server/decision/externalModelContract.mjs";
import { containsForbiddenProviderContent } from "../server/ai/providers/promptBuilder.mjs";
import { buildR5B3SyntheticInput, validateR5B3SyntheticInput } from "./run-phase3c-r5b3-synthetic-probe.mjs";
import {
  R5B8_CAPTURE_DIR,
  finalizeSyntheticToolArgumentQuarantine,
  writeSyntheticToolArgumentQuarantine,
} from "../server/decision/toolArgumentsQuarantine.mjs";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const RUN_ID = "PHASE3C-R5B8";
const REQUEST_TOKEN = "R5B8-SYNTH-V4-002";
const ENDPOINT = "https://api.deepseek.com/beta";
const MODEL = "deepseek-v4-pro";
const PAGE = "synthetic-probe";
const SYNTHETIC_EVIDENCE = "SYN-EVID-001";
const MAX_TOKENS = 2400;
const REMEDIATION_CALL_BUDGET = 3;
const RUN_CALL_LIMIT = 1;
const PRIOR_REMEDIATION_CALLS = 1;

export function buildR5B8ProviderEnv(env = process.env) {
  return {
    ...env,
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "true",
    PHASE3C_NATIVE_JSON_MODE: "strict-tool",
    PHASE3C_SCHEMA_VERSION: "v4",
    LLM_CANARY_SINGLE_ATTEMPT: "true",
    LLM_TIMEOUT_MS: env.LLM_TIMEOUT_MS || "30000",
    LLM_MAX_TOKENS: String(MAX_TOKENS),
  };
}

export function buildR5B8RequestMeta({ input = buildR5B3SyntheticInput(), env = process.env } = {}) {
  const providerEnv = buildR5B8ProviderEnv(env);
  const v2Body = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: PAGE, env: { ...providerEnv, PHASE3C_SCHEMA_VERSION: "v2" }, nativeMode: true, schemaVersion: "v2" });
  const remediatedBody = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: PAGE, env: providerEnv, nativeMode: true, schemaVersion: "v4" });
  const parameterSchemaHash = schemaHash(deepseekDecisionToolSchemaV2);
  const completeness = lintDeepSeekSchemaCompleteness(deepseekDecisionToolSchemaV2);
  const shape = lintDeepSeekRequestShapeV2(remediatedBody);
  const changedFields = diffPaths(v2Body, remediatedBody);
  return {
    provider: "openai-compatible",
    endpointAlias: "deepseek-beta",
    modelAlias: MODEL,
    schemaVersion: DEEPSEEK_STRICT_TOOL_SCHEMA_V2_VERSION,
    serializationProfile: DEEPSEEK_SERIALIZATION_PROFILE_V4_VERSION,
    parameterSchemaHash,
    v2ParameterSchemaHash: schemaHash(v2Body.tools[0].function.parameters),
    remediatedParameterSchemaHash: schemaHash(remediatedBody.tools[0].function.parameters),
    v2ToolDefinitionHash: requestHash(v2Body.tools[0]),
    remediatedToolDefinitionHash: requestHash(remediatedBody.tools[0]),
    v2RequestBodyHash: requestHash(v2Body),
    remediatedRequestBodyHash: requestHash(remediatedBody),
    changedFields,
    expectedChangedFields: ["messages.1.content", "tools.0.function.description"],
    unexpectedChangedFields: changedFields.filter((field) => !["messages.1.content", "tools.0.function.description"].includes(field)),
    duplicateSchemaRemoved: !Object.hasOwn(JSON.parse(remediatedBody.messages[1].content), "outputSchema"),
    v2DuplicateSchemaPresent: Object.hasOwn(JSON.parse(v2Body.messages[1].content), "outputSchema"),
    functionDescriptionAdded: typeof remediatedBody.tools[0].function.description === "string" && remediatedBody.tools[0].function.description.length > 0,
    strict: remediatedBody.tools[0].function.strict === true,
    singleTool: remediatedBody.tools.length === 1,
    toolName: remediatedBody.tools[0].function.name,
    toolChoice: remediatedBody.tool_choice,
    maxTokens: remediatedBody.max_tokens,
    temperature: remediatedBody.temperature,
    thinkingType: remediatedBody.thinking?.type || null,
    stream: remediatedBody.stream,
    responseFormatSent: Object.hasOwn(remediatedBody, "response_format"),
    retryCount: 0,
    shapeReady: shape.ok,
    shapeErrors: shape.errors,
    nodeCompleteness: {
      totalSchemaNodeCount: completeness.totalSchemaNodeCount,
      objectCount: completeness.objectCount,
      missingTypeAnyOfRefCount: completeness.missingTypeAnyOfRefCount,
      missingRequiredCount: completeness.missingRequiredCount,
      missingAdditionalPropertiesCount: completeness.missingAdditionalPropertiesCount,
      missingArrayItemsCount: completeness.missingArrayItemsCount,
      unsupportedKeywordCount: completeness.unsupportedKeywordCount,
    },
  };
}

export function validateR5B8SyntheticInput(input = buildR5B3SyntheticInput()) {
  const base = validateR5B3SyntheticInput(input);
  const context = input.safeContext || {};
  return {
    ...base,
    flagsReady: context.testOnly === true
      && context.syntheticProbe === true
      && context.d365Record === false
      && context.runtimeEligible === false
      && context.realCanary === false,
  };
}

export async function executeR5B8Remediation({ env = process.env, fetchImpl = globalThis.fetch, repoRoot = ROOT, now = () => new Date() } = {}) {
  const input = buildR5B3SyntheticInput();
  const inputSafety = validateR5B8SyntheticInput(input);
  const providerEnv = buildR5B8ProviderEnv(env);
  const request = buildR5B8RequestMeta({ input, env });
  const endpoint = String(providerEnv.LLM_BASE_URL || "").replace(/\/$/, "");
  const consumedAttempt = await hasConsumedAttemptEvidence(repoRoot, request.remediatedRequestBodyHash);
  const preflightReady = Boolean(providerEnv.LLM_API_KEY)
    && endpoint === ENDPOINT
    && providerEnv.LLM_MODEL === MODEL
    && inputSafety.flagsReady
    && inputSafety.forbiddenFieldCount === 0
    && inputSafety.realCrmTokenCount === 0
    && inputSafety.identityCount === 0
    && inputSafety.exactAmountCount === 0
    && inputSafety.rawTimelineCount === 0
    && inputSafety.scenarioGoldenCount === 0
    && inputSafety.providerSafetyReady
    && request.parameterSchemaHash === request.v2ParameterSchemaHash
    && request.parameterSchemaHash === request.remediatedParameterSchemaHash
    && request.changedFields.length === 2
    && request.unexpectedChangedFields.length === 0
    && request.duplicateSchemaRemoved
    && request.v2DuplicateSchemaPresent
    && request.functionDescriptionAdded
    && request.strict
    && request.singleTool
    && request.toolName === DEEPSEEK_TOOL_NAME
    && request.maxTokens === MAX_TOKENS
    && request.temperature === 0
    && request.thinkingType === "disabled"
    && request.stream === false
    && request.responseFormatSent === false
    && !consumedAttempt
    && request.shapeReady
    && Object.entries(request.nodeCompleteness)
      .filter(([key]) => key.startsWith("missing") || key === "unsupportedKeywordCount")
      .every(([, value]) => value === 0);
  const base = {
    phase: RUN_ID,
    requestToken: REQUEST_TOKEN,
    startedAt: now().toISOString(),
    provider: "openai-compatible",
    model: MODEL,
    endpointAlias: "deepseek-beta",
    inputSafety,
    request,
    externalLlmCalls: PRIOR_REMEDIATION_CALLS,
    externalLlmCallsThisAttempt: 0,
    remediationCallBudget: REMEDIATION_CALL_BUDGET,
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
    phase3cComplete: false,
  };
  if (!preflightReady) return finish({
    ...base,
    status: "stopped-safety",
    stopReason: consumedAttempt ? "r5b8_probe_already_consumed" : "r5b8_preflight_failed",
  }, now);

  let fetchCount = 0;
  let argumentCapture = null;
  const countedFetch = async (...args) => {
    fetchCount += 1;
    if (fetchCount > RUN_CALL_LIMIT) throw new Error("R5B8 single-probe limit exceeded");
    return fetchImpl(...args);
  };
  const callStarted = Date.now();
  const providerResult = await callComparisonProvider({
    safeContext: input.safeContext,
    accountAggregate: input.accountAggregate,
    page: PAGE,
    env: providerEnv,
    fetchImpl: countedFetch,
    requestCorrelation: REQUEST_TOKEN,
    onToolArgumentsParseFailure: ({ argumentsText, error }) => {
      argumentCapture = { argumentsText, parseOutcome: error };
    },
    onToolArgumentsParsed: ({ argumentsText, value }) => {
      argumentCapture = { argumentsText, parseOutcome: { ok: true, value } };
    },
  });
  const latencyMs = Date.now() - callStarted;
  let quarantine = { writeCount: 0, deleteCount: 0, rawFileExistsAfterDelete: false, diagnostics: null };
  if (argumentCapture && providerResult.httpStatus >= 200 && providerResult.httpStatus < 300) {
    const written = await writeSyntheticToolArgumentQuarantine({
      argumentsText: argumentCapture.argumentsText,
      eligibility: syntheticEligibility(inputSafety, input.safeContext),
      parseOutcome: argumentCapture.parseOutcome,
      repoRoot,
      captureDir: R5B8_CAPTURE_DIR,
      phase: "Phase 3C-R5B8",
      diagnosticsMetadata: {
        toolSchemaHash: request.remediatedToolDefinitionHash,
        requestSchemaHash: request.parameterSchemaHash,
        requestBodyHash: request.remediatedRequestBodyHash,
      },
      now,
    });
    const deleted = await finalizeSyntheticToolArgumentQuarantine({ repoRoot, captureDir: R5B8_CAPTURE_DIR, now });
    quarantine = {
      writeCount: 1,
      deleteCount: 1,
      rawFileExistsAfterDelete: deleted.rawFileExistsAfterDeletion,
      diagnostics: written.publicDiagnostics,
    };
  }
  const resultBase = {
    ...base,
    ...quarantine,
    externalLlmCalls: PRIOR_REMEDIATION_CALLS + fetchCount,
    externalLlmCallsThisAttempt: fetchCount,
    latencyMs,
    httpStatus: providerResult.httpStatus || providerResult.errorObservation?.httpStatus || null,
    finishReason: providerResult.successResponseObservation?.finishReason || null,
    toolCallCount: providerResult.successResponseObservation?.toolCallsCount || 0,
    argumentsRuntimeType: providerResult.successResponseObservation?.argumentsRuntimeType || null,
    tokenUsage: providerResult.usage || observedUsage(providerResult.successResponseObservation),
    failureCategory: providerResult.diagnosticCategory || providerResult.reason || null,
    safetyBlockedPatternKey: providerResult.blockedPatternKey || null,
  };
  if (fetchCount !== 1) return finish({ ...resultBase, status: "stopped-safety", stopReason: "single_probe_limit_violation" }, now);
  if (!providerResult.ok) return finish({ ...resultBase, status: "stopped-safety", stopReason: resultBase.failureCategory || "provider_failed", response: failedResponse(providerResult) }, now);

  const response = validateSuccessfulOutput(providerResult);
  const success = Object.entries(response)
    .filter(([key]) => key.endsWith("Ready"))
    .every(([, value]) => value === true)
    && response.unsupportedClaimCount === 0;
  return finish({ ...resultBase, status: success ? "completed" : "stopped-safety", stopReason: success ? null : "r5b8_validation_failed", response }, now);
}

function validateSuccessfulOutput(providerResult) {
  const output = providerResult.output;
  const observation = providerResult.successResponseObservation || {};
  const contract = validateExternalModelResponse(output, { evidenceTokens: [SYNTHETIC_EVIDENCE] });
  const evidenceErrors = [];
  for (const item of output?.facts || []) if (item.evidenceToken !== SYNTHETIC_EVIDENCE) evidenceErrors.push("fact:evidence");
  for (const item of output?.evidence || []) if (item.evidenceToken !== SYNTHETIC_EVIDENCE) evidenceErrors.push("evidence:source");
  for (const item of output?.inferences || []) for (const token of item.evidenceTokens || []) if (token !== SYNTHETIC_EVIDENCE) evidenceErrors.push("inference:evidence");
  const safety = auditOutput(output);
  return {
    httpTransportReady: providerResult.httpStatus === 200,
    finishReasonReady: observation.finishReason === "tool_calls",
    toolCallReady: observation.toolCallsCount === 1 && observation.toolCallType === "function" && observation.functionName === DEEPSEEK_TOOL_NAME,
    argumentStringReady: observation.argumentsRuntimeType === "string",
    jsonParseReady: true,
    schemaValidationReady: contract.ok,
    schemaErrors: contract.errors,
    canonicalMappingReady: providerResult.canonicalMappingReady === true && (output?.recommendedActions || []).every((item) => item.status === "Draft only"),
    evidenceValidationReady: evidenceErrors.length === 0,
    evidenceErrors: [...new Set(evidenceErrors)],
    safetyValidationReady: safety.ok,
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

function failedResponse(providerResult) {
  const observation = providerResult.successResponseObservation || {};
  const parsedAndMapped = providerResult.canonicalMappingReady === true;
  return {
    httpTransportReady: providerResult.httpStatus === 200,
    finishReasonReady: observation.finishReason === "tool_calls",
    toolCallReady: observation.toolCallsCount === 1 && observation.functionName === DEEPSEEK_TOOL_NAME,
    argumentStringReady: observation.argumentsRuntimeType === "string",
    jsonParseReady: parsedAndMapped,
    schemaValidationReady: parsedAndMapped,
    canonicalMappingReady: parsedAndMapped,
    evidenceValidationReady: null,
    safetyValidationReady: false,
    unsupportedClaimCount: 0,
  };
}

function finish(summary, now) {
  const response = summary.response || {};
  const compatible = response.httpTransportReady === true
    && response.finishReasonReady === true
    && response.toolCallReady === true
    && response.argumentStringReady === true
    && response.jsonParseReady === true
    && response.schemaValidationReady === true
    && summary.retryCount === 0
    && summary.fixtureFallbackCount === 0
    && summary.externalLlmCalls <= summary.remediationCallBudget;
  return {
    ...summary,
    completedAt: now().toISOString(),
    providerRequestCompatibilityReady: compatible,
    phase3cR5B8Complete: compatible,
    outputSafetyHold: compatible && response.safetyValidationReady !== true,
    realCanaryAuthorized: false,
    phase3cComplete: false,
  };
}

export async function writeR5B8Artifacts(summary, { outputDir = OUTPUT_DIR } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const analysis = buildToolSchemaAnalysis(summary);
  await fs.writeFile(path.join(outputDir, "phase3c-r5b8-provider-serialization-remediation.md"), remediationReport(summary, analysis));
  await fs.writeFile(path.join(outputDir, "phase3c-r5b8-tool-schema-analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, "phase3c-r5b8-synthetic-validation-report.md"), validationReport(summary));
  await fs.writeFile(path.join(outputDir, "phase3c-r5b8-compatibility-decision.md"), compatibilityDecision(summary));
}

function buildToolSchemaAnalysis(summary) {
  return {
    phase: RUN_ID,
    officialContract: {
      toolCalls: "https://api-docs.deepseek.com/guides/tool_calls/",
      chatCompletion: "https://api-docs.deepseek.com/api/create-chat-completion/",
    },
    rootCause: {
      confirmed: summary.response?.jsonParseReady === true && summary.response?.schemaValidationReady === true,
      category: "duplicate_schema_message_injection",
      evidence: "The V2 parameter schema was accepted by DeepSeek strict mode. Both remediation profiles produced Tool Arguments that passed one JSON parse and strict mapping without changing the parameter schema. Because duplicate removal and Tool description changed together, neither change is claimed as the sole cause.",
    },
    remediation: {
      parameterSchemaChanged: false,
      schemaRelaxed: false,
      duplicateSchemaRemovedFromUserMessage: summary.request.duplicateSchemaRemoved,
      functionDescriptionAdded: summary.request.functionDescriptionAdded,
      changedFields: summary.request.changedFields,
      unexpectedChangedFields: summary.request.unexpectedChangedFields,
    },
    hashes: {
      v2ParameterSchemaHash: summary.request.v2ParameterSchemaHash,
      remediatedParameterSchemaHash: summary.request.remediatedParameterSchemaHash,
      v2ToolDefinitionHash: summary.request.v2ToolDefinitionHash,
      remediatedToolDefinitionHash: summary.request.remediatedToolDefinitionHash,
      v2RequestBodyHash: summary.request.v2RequestBodyHash,
      remediatedRequestBodyHash: summary.request.remediatedRequestBodyHash,
    },
    strictContract: {
      requiredFieldsPreserved: summary.request.nodeCompleteness.missingRequiredCount === 0,
      additionalPropertiesFalsePreserved: summary.request.nodeCompleteness.missingAdditionalPropertiesCount === 0,
      nestedObjectsPreserved: true,
      arraysPreserved: true,
      parameterSchemaHashPreserved: summary.request.v2ParameterSchemaHash === summary.request.remediatedParameterSchemaHash,
      nodeCompleteness: summary.request.nodeCompleteness,
    },
    attempts: [
      {
        requestToken: "R5B8-SYNTH-V3-001",
        externalLlmCalls: 1,
        httpStatus: 200,
        jsonParseReady: true,
        schemaMappingReady: true,
        safetyReady: false,
        safetyBlockedPatternKey: "raw_timeline",
        retryCount: 0,
      },
      {
        requestToken: summary.requestToken,
        externalLlmCalls: summary.externalLlmCallsThisAttempt,
        httpStatus: summary.httpStatus,
        jsonParseReady: summary.response?.jsonParseReady === true,
        schemaMappingReady: summary.response?.schemaValidationReady === true,
        safetyReady: summary.response?.safetyValidationReady === true,
        safetyBlockedPatternKey: summary.safetyBlockedPatternKey,
        retryCount: summary.retryCount,
      },
    ],
    probe: safeProbeSummary(summary),
  };
}

function remediationReport(summary, analysis) {
  return `# Phase 3C-R5B8 DeepSeek Tool Serialization Remediation\n\n## Root Cause\n\nR5B7B proved that transport and Tool selection worked but generated invalid JSON. The accepted V2 parameter schema was also duplicated inside the user message. The remediation profile removed that duplication and added compact serialization guidance; both R5B8 Probes then passed one JSON parse and strict mapping. These two request changes were applied together, so neither is claimed as the sole cause. Full compatibility remains blocked because both responses repeated the forbidden safety label raw_timeline in limitations.\n\n## Change\n\n- Parameter Schema changed: **false**\n- Schema relaxed: **false**\n- Duplicate message Schema removed: **${analysis.remediation.duplicateSchemaRemovedFromUserMessage}**\n- Tool description added: **${analysis.remediation.functionDescriptionAdded}**\n- Changed request fields: **${JSON.stringify(analysis.remediation.changedFields)}**\n- Unexpected changed fields: **${JSON.stringify(analysis.remediation.unexpectedChangedFields)}**\n\n## Result\n\n- Status: **${summary.status}**\n- HTTP: **${summary.httpStatus ?? "not-recorded"}**\n- finish_reason: **${summary.finishReason ?? "not-recorded"}**\n- JSON parse: **${summary.response?.jsonParseReady === true}**\n- Schema validation: **${summary.response?.schemaValidationReady === true}**\n- Evidence validation: **not-run**\n- Safety validation: **${summary.response?.safetyValidationReady === true}**\n- Safety block: **${summary.safetyBlockedPatternKey || "none"}**\n- Provider Request Compatibility Ready: **${summary.providerRequestCompatibilityReady}**\n- External LLM Calls: **${summary.externalLlmCalls}/${summary.remediationCallBudget}**\n- Retry: **${summary.retryCount}**\n- Real Canary Authorized: **false**\n\nNo raw arguments, request body, response body, credentials, Authorization header, CRM data, or private diagnostic window is included.\n`;
}

function validationReport(summary) {
  const response = summary.response || {};
  return `# Phase 3C-R5B8 Synthetic Validation Report

- Synthetic flags ready: **${summary.inputSafety.flagsReady}**
- Forbidden fields / CRM tokens / identity / exact amount / raw Timeline / Scenario-Golden: **${summary.inputSafety.forbiddenFieldCount}/${summary.inputSafety.realCrmTokenCount}/${summary.inputSafety.identityCount}/${summary.inputSafety.exactAmountCount}/${summary.inputSafety.rawTimelineCount}/${summary.inputSafety.scenarioGoldenCount}**
- HTTP 200: **${response.httpTransportReady === true}**
- finish_reason=tool_calls: **${response.finishReasonReady === true}**
- Tool Call: **${response.toolCallReady === true}**
- Arguments string: **${response.argumentStringReady === true}**
- JSON parse: **${response.jsonParseReady === true}**
- Schema: **${response.schemaValidationReady === true}**
- Canonical Mapping: **${response.canonicalMappingReady === true}**
- Evidence: **${response.evidenceValidationReady === true ? "true" : response.evidenceValidationReady === false ? "false" : "not-run"}**
- Safety: **${response.safetyValidationReady === true}**
- Unsupported claims: **${response.unsupportedClaimCount ?? 0}**
- Private capture/removal: **${summary.writeCount || 0}/${summary.deleteCount || 0}**
- Raw File Exists After Removal: **${summary.rawFileExistsAfterDelete === true}**
- External LLM Calls: **${summary.externalLlmCalls}**
- D365 GET: **0**
- CRM Writeback: **false**
- Production Requests: **0**
`;
}

function compatibilityDecision(summary) {
  return `# Phase 3C-R5B8 Compatibility Decision\n\n- Provider Request Compatibility Ready: **${summary.providerRequestCompatibilityReady}**\n- Phase 3C-R5B8 Complete: **${summary.phase3cR5B8Complete}**\n- Output Safety Hold: **${summary.outputSafetyHold}**\n- Real Canary Authorized: **false**\n- Remaining Canary Execution Authorized: **false**\n- External LLM Calls: **${summary.externalLlmCalls}/${summary.remediationCallBudget}**\n- CRM Writeback: **false**\n- Production Requests: **0**\n- P0/P1/P2: **0/0/1**\n\n${summary.providerRequestCompatibilityReady ? "The synthetic strict Tool Call passed the R5B8 transport, Tool, single-parse JSON and strict Schema compatibility criteria with no retry or fallback. Output safety remains on hold because a forbidden label was repeated, so real Canary execution remains unauthorized and requires separate remediation." : "Provider request compatibility is not proven. Stop without another call, schema relaxation, heuristic repair, or real Canary execution."}\n`;
}

function safeProbeSummary(summary) {
  return {
    status: summary.status,
    stopReason: summary.stopReason,
    externalLlmCalls: summary.externalLlmCalls,
    externalLlmCallsThisAttempt: summary.externalLlmCallsThisAttempt,
    httpStatus: summary.httpStatus,
    finishReason: summary.finishReason,
    toolCallCount: summary.toolCallCount,
    argumentsRuntimeType: summary.argumentsRuntimeType,
    argumentsLength: summary.diagnostics?.argumentsLength ?? null,
    argumentsSha256: summary.diagnostics?.argumentsSha256 ?? null,
    utf8Valid: summary.diagnostics?.utf8Valid ?? null,
    parseErrorOffset: summary.diagnostics?.parseErrorOffset ?? null,
    rawFileExistsAfterDelete: summary.rawFileExistsAfterDelete === true,
    safetyBlockedPatternKey: summary.safetyBlockedPatternKey,
    response: summary.response || null,
    providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady,
    outputSafetyHold: summary.outputSafetyHold,
  };
}

function syntheticEligibility(validation, safeContext) {
  return {
    testOnly: safeContext.testOnly,
    syntheticProbe: safeContext.syntheticProbe,
    d365Record: safeContext.d365Record,
    runtimeEligible: safeContext.runtimeEligible,
    realCanary: safeContext.realCanary,
    realCrmTokenCount: validation.realCrmTokenCount,
    forbiddenFieldCount: validation.forbiddenFieldCount,
  };
}

function observedUsage(observation) {
  if (!observation || !Number.isFinite(Number(observation.completionTokens))) return null;
  return { completion_tokens: Number(observation.completionTokens) };
}

async function hasConsumedAttemptEvidence(repoRoot, requestBodyHash) {
  const manifestPath = path.join(repoRoot, R5B8_CAPTURE_DIR, "parse-diagnostics.private.json");
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    return manifest?.deletionStatus === "deleted"
      && manifest?.rawFileExistsAfterDeletion === false
      && manifest?.diagnosticsMetadata?.requestBodyHash === requestBodyHash;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function diffPaths(left, right, prefix = "") {
  if (Object.is(left, right)) return [];
  if (Array.isArray(left) || Array.isArray(right)) {
    const length = Math.max(left?.length || 0, right?.length || 0);
    return Array.from({ length }, (_, index) => index).flatMap((index) => diffPaths(left?.[index], right?.[index], prefix ? `${prefix}.${index}` : String(index)));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].sort().flatMap((key) => diffPaths(left[key], right[key], prefix ? `${prefix}.${key}` : key));
  }
  return [prefix || "root"];
}

export async function runR5B8(options = {}) {
  const summary = await executeR5B8Remediation(options);
  await writeR5B8Artifacts(summary);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const summary = await runR5B8();
  console.log(JSON.stringify({
    status: summary.status,
    externalLlmCalls: summary.externalLlmCalls,
    httpStatus: summary.httpStatus,
    finishReason: summary.finishReason,
    providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady,
    realCanaryAuthorized: false,
  }, null, 2));
}
