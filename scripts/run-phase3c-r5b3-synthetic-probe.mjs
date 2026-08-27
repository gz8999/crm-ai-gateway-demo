import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import {
  DEEPSEEK_STRICT_TOOL_SCHEMA_V2_VERSION,
  DEEPSEEK_TOOL_NAME,
  deepseekDecisionToolSchemaV2,
  lintDeepSeekRequestShapeV2,
  lintDeepSeekSchemaCompleteness,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import { validateExternalModelResponse, requestHash } from "../server/decision/externalModelContract.mjs";
import { containsForbiddenProviderContent } from "../server/ai/providers/promptBuilder.mjs";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const RUN_ID = "PHASE3C-R5B3";
const REQUEST_TOKEN = "R5B3-SYNTH-V2-001";
const ENDPOINT = "https://api.deepseek.com/beta";
const MODEL = "deepseek-v4-pro";
const PAGE = "synthetic-probe";
const SYNTHETIC_EVIDENCE = "SYN-EVID-001";
const EXPECTED_SCHEMA_HASH = "476cecc436dc452abc50988d337d779398159e8e0a4003bc8aa6153cbdab22b7";
const MAX_CALLS = 1;

export function buildR5B3SyntheticInput() {
  return {
    safeContext: {
      testOnly: true,
      d365Record: false,
      runtimeEligible: false,
      realCanary: false,
      syntheticProbe: true,
      opportunityToken: "SYN-OPP-001",
      customerToken: "SYN-CUST-001",
      department: "SYN-DEPT-01",
      industryCategory: "SYN-LOGISTICS",
      state: "Active",
      stage: "Qualification",
      amountBand: "100K-1M",
      marginBand: "5%-15%",
      budgetVarianceBand: "within-band",
      healthScoreV2: 82,
      healthGrade: "A",
      healthDimensions: { momentum: 84, dataQuality: 80, stakeholder: 82, economics: 81, routeFit: 83, readiness: 82 },
      relativeDate: "review-window",
      timelineSummary: "Synthetic meeting signal summary only; no source text.",
      interactionSignal: "Synthetic stakeholder coverage is partial; one open question remains.",
      coverageStatus: "partial",
      evidenceTokens: [SYNTHETIC_EVIDENCE],
      dataQualitySignal: "synthetic-complete",
    },
    accountAggregate: {
      accountToken: "SYN-CUST-001",
      serviceCoverageBand: "partial",
      whitespaceCategory: "review",
      opportunityTrend: "stable",
      relationshipMaturity: "developing",
    },
  };
}

export function validateR5B3SyntheticInput(input = buildR5B3SyntheticInput()) {
  const safeContext = input.safeContext || {};
  const accountAggregate = input.accountAggregate || {};
  const serialized = JSON.stringify({ safeContext, accountAggregate });
  const forbiddenFields = [
    "customerName", "contactName", "email", "phone", "guid", "exactRevenue", "exactGp", "exactAmount",
    "rawTimeline", "rawOpportunityClose", "contractText", "scenarioId", "goldenMetadata", "expectedAnswer", "rawCrm",
    "notetext", "annotationtext", "timelinebody",
  ];
  const lower = serialized.toLowerCase();
  const fieldCount = (keys) => keys.reduce((total, key) => total + (lower.includes(`"${key.toLowerCase()}"`) ? 1 : 0), 0);
  const realCrmTokenCount = (serialized.match(/DEMO-(?:OPP|CUST|ACC)-[A-Z0-9_-]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []).length;
  const identityCount = fieldCount(["customerName", "contactName", "email", "phone", "userIdentity", "teamIdentity"]);
  const exactAmountCount = fieldCount(["exactRevenue", "exactGp", "exactAmount", "annualRevenue", "annualActualRevenue"]);
  const rawTimelineCount = fieldCount(["rawTimeline", "rawOpportunityClose", "notetext", "annotationtext", "timelinebody"]);
  const scenarioGoldenCount = fieldCount(["scenarioId", "goldenMetadata", "expectedAnswer", "goldenLabel"]);
  const forbiddenFieldCount = fieldCount(forbiddenFields);
  const providerSafety = containsForbiddenProviderContent({ safeDecisionContext: safeContext, safeAccountAggregate: accountAggregate });
  const flagsReady = safeContext.testOnly === true
    && safeContext.syntheticProbe === true
    && safeContext.d365Record === false
    && safeContext.runtimeEligible === false
    && safeContext.realCanary === false;
  return {
    testOnly: safeContext.testOnly === true,
    syntheticProbe: safeContext.syntheticProbe === true,
    d365Record: safeContext.d365Record === true,
    runtimeEligible: safeContext.runtimeEligible === true,
    realCanary: safeContext.realCanary === true,
    flagsReady,
    forbiddenFieldCount,
    realCrmTokenCount,
    guidCount: realCrmTokenCount,
    identityCount,
    exactAmountCount,
    rawTimelineCount,
    scenarioGoldenCount,
    providerSafetyReady: providerSafety.ok,
    providerSafetyReason: providerSafety.ok ? "" : providerSafety.reason,
    safeContextKeyCount: Object.keys(safeContext).length,
    accountAggregateKeyCount: Object.keys(accountAggregate).length,
  };
}

export function buildR5B3ProviderEnv(env = process.env) {
  return {
    ...env,
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "true",
    PHASE3C_NATIVE_JSON_MODE: "strict-tool",
    PHASE3C_SCHEMA_VERSION: "v2",
    LLM_CANARY_SINGLE_ATTEMPT: "true",
    LLM_TIMEOUT_MS: env.LLM_TIMEOUT_MS || "30000",
    LLM_MAX_TOKENS: env.LLM_MAX_TOKENS || "1200",
  };
}

export function buildR5B3RequestMeta({ input = buildR5B3SyntheticInput(), env = process.env } = {}) {
  const providerEnv = buildR5B3ProviderEnv(env);
  const body = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: PAGE, env: providerEnv, nativeMode: true, schemaVersion: "v2" });
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

export async function executeR5B3Probe({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const input = buildR5B3SyntheticInput();
  const inputSafety = validateR5B3SyntheticInput(input);
  const providerEnv = buildR5B3ProviderEnv(env);
  const endpoint = String(providerEnv.LLM_BASE_URL || "").replace(/\/$/, "");
  const configReady = endpoint === ENDPOINT && providerEnv.LLM_MODEL === MODEL && Boolean(providerEnv.LLM_API_KEY);
  const requestMeta = buildR5B3RequestMeta({ input, env });
  const preflight = {
    ...inputSafety,
    configReady,
    requestHashReady: /^[0-9a-f]{64}$/.test(requestMeta.requestBodyHash),
    requestSchemaHashReady: requestMeta.requestSchemaHash === EXPECTED_SCHEMA_HASH,
    requestMeta,
  };
  const base = {
    phase: RUN_ID,
    requestToken: REQUEST_TOKEN,
    startedAt: now().toISOString(),
    provider: requestMeta.provider,
    model: MODEL,
    endpointAlias: requestMeta.endpointAlias,
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
  if (!inputSafety.flagsReady || inputSafety.forbiddenFieldCount !== 0 || inputSafety.realCrmTokenCount !== 0 || inputSafety.identityCount !== 0 || inputSafety.exactAmountCount !== 0 || inputSafety.rawTimelineCount !== 0 || inputSafety.scenarioGoldenCount !== 0 || !inputSafety.providerSafetyReady || !configReady || !requestMeta.shapeReady || requestMeta.requestSchemaHash !== EXPECTED_SCHEMA_HASH || Object.values(requestMeta.nodeCompleteness).some((value) => value !== 0)) {
    return finish({ ...base, status: "stopped-safety", stopReason: "synthetic_or_v2_request_preflight_failed" }, now);
  }

  let fetchCount = 0;
  const countedFetch = async (...args) => {
    fetchCount += 1;
    if (fetchCount > MAX_CALLS) throw new Error("R5B3 single-call limit exceeded");
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
  });
  const latencyMs = Date.now() - callStarted;
  const resultBase = {
    ...base,
    externalLlmCalls: fetchCount,
    retryCount: Math.max(0, fetchCount - 1),
    httpStatus: providerResult.httpStatus || providerResult.errorObservation?.httpStatus || null,
    responseBodyHash: providerResult.responseBodyHash || providerResult.errorObservation?.responseBodyHash || null,
    tokenUsage: providerResult.usage || null,
    estimatedCostUsd: estimateCost(providerResult.usage),
    latencyMs,
  };
  if (fetchCount !== 1) return finish({ ...resultBase, status: "stopped-safety", stopReason: "single_external_call_violation", response: safeProviderFailure(providerResult) }, now);
  if (!providerResult.ok) return finish({ ...resultBase, status: "stopped-safety", stopReason: providerResult.reason || "provider_failed", response: safeProviderFailure(providerResult), errorObservation: providerResult.errorObservation || null }, now);

  const evidenceTokens = [SYNTHETIC_EVIDENCE];
  const schema = validateExternalModelResponse(providerResult.output, { evidenceTokens });
  const evidence = validateEvidence(providerResult.output, evidenceTokens);
  const safety = auditSyntheticOutput(providerResult.output, input, evidenceTokens);
  const canonicalMapping = providerResult.canonicalMappingReady === true
    && providerResult.output.recommendedActions.every((action) => action.status === "Draft only" && !Object.hasOwn(action, "draftStatus"));
  const response = {
    httpSuccess: providerResult.httpStatus === 200,
    toolCallReady: providerResult.toolCallCount === 1 && providerResult.toolCallName === DEEPSEEK_TOOL_NAME,
    toolCallCount: providerResult.toolCallCount || 0,
    toolCallName: providerResult.toolCallName || null,
    jsonReady: true,
    schemaReady: schema.ok,
    schemaErrors: schema.errors,
    canonicalMappingReady: canonicalMapping,
    evidenceReady: evidence.ok,
    evidenceErrors: evidence.errors,
    unsupportedClaimCount: safety.unsupportedClaimCount,
    safetyReady: safety.ok,
    safetyErrors: safety.errors,
    hallucinationAuditReady: safety.unsupportedClaimCount === 0 && evidence.ok,
    providerModel: providerResult.providerModel || MODEL,
    toolArgumentsHash: providerResult.toolArgumentsHash || null,
  };
  const success = response.httpSuccess && response.toolCallReady && response.jsonReady && response.schemaReady && response.canonicalMappingReady && response.evidenceReady && response.unsupportedClaimCount === 0 && response.safetyReady;
  return finish({ ...resultBase, status: success ? "completed" : "stopped-safety", stopReason: success ? null : "synthetic_response_validation_failed", response }, now);
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

function safeProviderFailure(result) {
  return {
    reason: result.reason || "provider_failed",
    httpStatus: result.httpStatus || null,
    attempts: result.attempts || 1,
    requestBodyHash: result.requestBodyHash || result.errorObservation?.requestBodyHash || null,
    requestSchemaHash: result.requestSchemaHash || result.errorObservation?.requestSchemaHash || null,
    responseBodyHash: result.responseBodyHash || result.errorObservation?.responseBodyHash || null,
    toolCallCount: result.toolCallCount || 0,
    toolCallName: result.toolCallName || null,
  };
}

function finish(summary, now) {
  const completed = summary.status === "completed";
  return {
    ...summary,
    completedAt: now().toISOString(),
    syntheticProbeAuthorized: true,
    syntheticProbeExecuted: summary.externalLlmCalls === 1,
    httpSuccess: completed && summary.response?.httpSuccess === true,
    providerRequestCompatibilityReady: completed,
    syntheticStrictToolProbeComplete: completed,
    phase3cComplete: false,
    realCanaryAuthorized: false,
    remainingCanaryExecutionAuthorized: false,
  };
}

export async function runR5B3({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const summary = await executeR5B3Probe({ env, fetchImpl, now });
  await writeArtifacts(summary);
  return summary;
}

async function writeArtifacts(summary) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b3-runtime-manifest.json"), `${JSON.stringify(summary, null, 2)}\n`),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b3-request-audit.json"), `${JSON.stringify(buildRequestAudit(summary), null, 2)}\n`),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b3-response-validation.json"), `${JSON.stringify(buildResponseValidation(summary), null, 2)}\n`),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b3-synthetic-probe-report.md"), buildReport(summary)),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b3-safety-report.md"), buildSafetyReport(summary)),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5c-real-canary-decision-pack-zh.md"), buildR5CDecisionPack(summary)),
  ]);
}

function buildRequestAudit(summary) {
  return {
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
      responseBodyHash: summary.responseBodyHash,
      toolArgumentsHash: summary.response?.toolArgumentsHash || null,
      latencyMs: summary.latencyMs,
      tokenUsage: summary.tokenUsage,
      estimatedCostUsd: summary.estimatedCostUsd,
      httpStatus: summary.httpStatus,
      contractResult: summary.response?.schemaReady ? "pass" : "not-run",
      safetyResult: summary.response?.safetyReady ? "pass" : "not-run",
      evidenceResult: summary.response?.evidenceReady ? "pass" : "not-run",
      hallucinationAudit: summary.response?.hallucinationAuditReady ? "pass" : "not-run",
      errorObservation: summary.errorObservation || null,
      rawRequestBody: false,
      rawResponseBody: false,
      safeContextStored: false,
      secretStored: false,
    }],
    externalLlmCalls: summary.externalLlmCalls,
    retryCount: summary.retryCount,
    fixtureFallbackCount: summary.fixtureFallbackCount,
    d365Get: summary.d365Get,
    crmWriteback: false,
    productionRequests: 0,
    browserExternalProviderRequests: 0,
  };
}

function buildResponseValidation(summary) {
  const response = summary.response || {};
  return {
    phase: RUN_ID,
    requestToken: REQUEST_TOKEN,
    httpSuccess: response.httpSuccess === true,
    toolCallReady: response.toolCallReady === true,
    jsonReady: response.jsonReady === true,
    schemaV2Ready: response.schemaReady === true,
    schemaErrors: response.schemaErrors || [],
    canonicalMappingReady: response.canonicalMappingReady === true,
    evidenceReady: response.evidenceReady === true,
    evidenceErrors: response.evidenceErrors || [],
    unsupportedClaimCount: response.unsupportedClaimCount || 0,
    hallucinationAuditReady: response.hallucinationAuditReady === true,
    safetyReady: response.safetyReady === true,
    safetyErrors: response.safetyErrors || [],
    status: summary.status,
    stopReason: summary.stopReason,
    providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady,
    rawOutputStored: false,
  };
}

function buildReport(summary) {
  const response = summary.response || {};
  return `# Phase 3C-R5B3 DeepSeek V2 Synthetic Strict Tool Probe\n\n- Status: **${summary.status}**\n- External LLM Calls R5B3: **${summary.externalLlmCalls}/1**\n- Request token: \`${REQUEST_TOKEN}\`\n- Input: completely synthetic, non-CRM, non-D365\n- Retry: **${summary.retryCount}**\n- Fixture fallback: **${summary.fixtureFallbackCount}**\n- D365 GET: **${summary.d365Get}**\n- CRM Writeback: **false**\n- Production Requests: **0**\n\n## Synthetic Input Safety\n\n- testOnly=true\n- syntheticProbe=true\n- d365Record=false\n- runtimeEligible=false\n- realCanary=false\n- Forbidden Field Count: **${summary.inputSafety.forbiddenFieldCount}**\n- Real CRM Token Count: **${summary.inputSafety.realCrmTokenCount}**\n- Identity Count: **${summary.inputSafety.identityCount}**\n- Exact Amount Count: **${summary.inputSafety.exactAmountCount}**\n- Raw Timeline Count: **${summary.inputSafety.rawTimelineCount}**\n- Scenario/Golden Count: **${summary.inputSafety.scenarioGoldenCount}**\n\n## V2 Request\n\n- Provider: **${summary.provider}**\n- Model Alias: **${summary.model}**\n- Endpoint Alias: **deepseek-beta**\n- Schema: **${summary.schemaVersion}**\n- Schema Hash: \`${summary.request.requestSchemaHash}\`\n- Single Tool: **${summary.request.singleTool}**\n- Tool Name: **${summary.request.toolName}**\n- strict=true: **${summary.request.strict}**\n- additionalProperties=false: **${summary.request.additionalPropertiesFalse}**\n- Forced tool choice: **${JSON.stringify(summary.request.toolChoice)}**\n- stream=false: **${summary.request.stream}**\n- response_format sent: **${summary.request.responseFormatSent}**\n- Retry: **0**\n\n## Validation\n\n- HTTP Success: **${response.httpSuccess === true}**\n- Tool Call: **${response.toolCallReady === true}**\n- JSON: **${response.jsonReady === true}**\n- Schema V2: **${response.schemaReady === true}**\n- Canonical Mapping: **${response.canonicalMappingReady === true}**\n- Evidence: **${response.evidenceReady === true}**\n- Hallucination Audit: **${response.hallucinationAuditReady === true}**\n- Unsupported Claim Count: **${response.unsupportedClaimCount || 0}**\n- Safety: **${response.safetyReady === true}**\n\n## Boundary\n\nProvider Request Compatibility Ready: **${summary.providerRequestCompatibilityReady}**. Real Canary Authorized=false, Remaining Canary Execution Authorized=false, Phase 3C Complete=false. No raw request, Safe Context, Secret, Authorization header or raw response body is stored.\n`;
}

function buildSafetyReport(summary) {
  const response = summary.response || {};
  return `# Phase 3C-R5B3 Safety Report\n\n- Synthetic input only: **true**\n- Raw CRM Exposure: **0**\n- Exact Amount Exposure: **0**\n- Raw Timeline Exposure: **0**\n- Secret Exposure: **0**\n- Browser External Provider Requests: **0**\n- CRM Writeback: **false**\n- Production Requests: **0**\n- D365 GET: **0**\n- Retry Count: **${summary.retryCount}**\n- Fixture Fallback Count: **${summary.fixtureFallbackCount}**\n- Safety Ready: **${response.safetyReady === true}**\n- Error observation: ${summary.errorObservation ? "safe allowlist only" : "not applicable; HTTP success"}\n`;
}

function buildR5CDecisionPack(summary) {
  return `# Phase 3C-R5C Real Canary Decision Pack\n\n## Status\n\n- Real Canary Authorized=false\n- Remaining Canary Execution Authorized=false\n- Phase 3C Complete=false\n- R5B3 Synthetic Probe: **${summary.syntheticStrictToolProbeComplete}**\n- Provider Request Compatibility Ready: **${summary.providerRequestCompatibilityReady}**\n\n## Evidence\n\nR5B3 used exactly one completely synthetic Safe Context v2 input and one DeepSeek V2 strict Tool Calling request. It did not read D365, select a real Canary, write CRM, use a browser-side Provider, or compare multiple models.\n\n## Next Authorization Boundary\n\nAny real Canary requires separate explicit authorization, fresh Safe Context review, a new request budget, and a new stop-on-first-failure decision. R5B3 does not authorize real Canary execution or Model Comparison.\n`;
}

function estimateCost(usage) {
  if (!usage) return null;
  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens);
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
  return Number(((inputTokens * 0.435 + outputTokens * 0.87) / 1_000_000).toFixed(8));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runR5B3({ env: process.env })
    .then((summary) => console.log(JSON.stringify({
      status: summary.status,
      externalLlmCalls: summary.externalLlmCalls,
      httpStatus: summary.httpStatus || null,
      providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady,
      syntheticStrictToolProbeComplete: summary.syntheticStrictToolProbeComplete,
      stopReason: summary.stopReason || null,
    }, null, 2)))
    .catch(() => { process.exitCode = 1; });
}
