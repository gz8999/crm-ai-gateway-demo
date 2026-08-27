import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import { deepseekDecisionToolSchema, DEEPSEEK_TOOL_NAME, lintDeepSeekRequestShape, schemaHash } from "../server/decision/deepseekStrictSchema.mjs";
import { validateExternalModelResponse, requestHash } from "../server/decision/externalModelContract.mjs";
import { containsForbiddenProviderContent } from "../server/ai/providers/promptBuilder.mjs";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const RUN_ID = "PHASE3C-R5B1";
const REQUEST_TOKEN = "R5B1-SYNTH-TOOL-001";
const ENDPOINT = "https://api.deepseek.com/beta";
const MODEL = "deepseek-v4-pro";
const PAGE = "synthetic-probe";
const SYNTHETIC_EVIDENCE = "SYN-EVID-001";
const MAX_CALLS = 1;

export function buildSyntheticProbeInput() {
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

export function validateSyntheticProbeInput(input = buildSyntheticProbeInput()) {
  const safeContext = input.safeContext || {};
  const accountAggregate = input.accountAggregate || {};
  const serialized = JSON.stringify({ safeContext, accountAggregate });
  const forbiddenFields = [
    "customerName", "contactName", "email", "phone", "guid", "exactRevenue", "exactGp", "rawTimeline",
    "rawOpportunityClose", "contractText", "scenarioId", "goldenMetadata", "expectedAnswer", "rawCrm",
  ];
  const lower = serialized.toLowerCase();
  const forbiddenFieldCount = forbiddenFields.filter((field) => lower.includes(`"${field.toLowerCase()}"`)).length;
  const realCrmTokenCount = (serialized.match(/DEMO-(?:OPP|CUST|ACC)-[A-Z0-9_-]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []).length;
  const requiredFlags = safeContext.testOnly === true
    && safeContext.d365Record === false
    && safeContext.runtimeEligible === false
    && safeContext.realCanary === false
    && safeContext.syntheticProbe === true;
  const providerSafety = containsForbiddenProviderContent({ safeDecisionContext: safeContext, safeAccountAggregate: accountAggregate });
  return {
    requiredFlags,
    forbiddenFieldCount,
    realCrmTokenCount,
    providerSafetyReady: providerSafety.ok,
    providerSafetyReason: providerSafety.ok ? "" : providerSafety.reason,
    syntheticTokens: [safeContext.opportunityToken, safeContext.customerToken, SYNTHETIC_EVIDENCE],
    safeContextKeys: Object.keys(safeContext).sort(),
    accountAggregateKeys: Object.keys(accountAggregate).sort(),
  };
}

export function buildSyntheticRequestMeta({ input = buildSyntheticProbeInput(), env = process.env } = {}) {
  const providerEnv = buildProviderEnv(env);
  const body = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: PAGE, env: providerEnv, nativeMode: true });
  const shape = lintDeepSeekRequestShape(body);
  return {
    provider: "openai-compatible",
    endpointAlias: "deepseek-beta",
    modelAlias: MODEL,
    toolName: DEEPSEEK_TOOL_NAME,
    strict: body.tools?.[0]?.function?.strict === true,
    additionalPropertiesFalse: body.tools?.[0]?.function?.parameters?.additionalProperties === false,
    toolChoice: body.tool_choice,
    stream: body.stream,
    responseFormatSent: Object.hasOwn(body, "response_format"),
    requestSchemaHash: schemaHash(deepseekDecisionToolSchema),
    requestBodyHash: requestHash(body),
    shapeReady: shape.ok,
    shapeErrors: shape.errors,
  };
}

export async function executeSyntheticProbe({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const input = buildSyntheticProbeInput();
  const inputSafety = validateSyntheticProbeInput(input);
  const requestMeta = buildSyntheticRequestMeta({ input, env });
  const preflight = {
    ...inputSafety,
    requestHashReady: /^[0-9a-f]{64}$/.test(requestMeta.requestBodyHash),
    requestSchemaHashReady: /^[0-9a-f]{64}$/.test(requestMeta.requestSchemaHash),
    requestMeta,
  };
  const providerEnv = buildProviderEnv(env);
  const base = {
    phase: RUN_ID,
    requestToken: REQUEST_TOKEN,
    startedAt: now().toISOString(),
    provider: requestMeta.provider,
    model: MODEL,
    contextVersion: "Synthetic Safe Context v1",
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
  };
  if (!inputSafety.requiredFlags || inputSafety.forbiddenFieldCount !== 0 || inputSafety.realCrmTokenCount !== 0 || !inputSafety.providerSafetyReady || !requestMeta.shapeReady || !preflight.requestHashReady) {
    return finish({ ...base, status: "stopped-safety", stopReason: "synthetic_input_or_request_preflight_failed" }, now);
  }
  if (!providerEnv.LLM_API_KEY) return finish({ ...base, status: "stopped-safety", stopReason: "server_side_provider_secret_missing" }, now);

  let fetchCount = 0;
  const countedFetch = async (...args) => {
    fetchCount += 1;
    if (fetchCount > MAX_CALLS) throw new Error("R5B1 single-call limit exceeded");
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
    providerModel: providerResult.providerModel || MODEL,
    toolArgumentsHash: providerResult.toolArgumentsHash || null,
  };
  const success = response.httpSuccess && response.toolCallReady && response.jsonReady && response.schemaReady && response.canonicalMappingReady && response.evidenceReady && response.unsupportedClaimCount === 0 && response.safetyReady;
  return finish({ ...resultBase, status: success ? "completed" : "stopped-safety", stopReason: success ? null : "synthetic_response_validation_failed", response }, now);
}

function buildProviderEnv(env) {
  return {
    ...env,
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "true",
    LLM_BASE_URL: ENDPOINT,
    LLM_MODEL: MODEL,
    PHASE3C_NATIVE_JSON_MODE: "strict-tool",
    LLM_CANARY_SINGLE_ATTEMPT: "true",
    LLM_TIMEOUT_MS: env.LLM_TIMEOUT_MS || "30000",
    LLM_MAX_TOKENS: env.LLM_MAX_TOKENS || "1200",
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
  const lower = serialized.toLowerCase();
  const errors = [];
  const forbidden = ["customername", "contactname", "email", "phone", "guid", "exactrevenue", "exactgp", "rawtimeline", "scenarioid", "goldenmetadata", "expectedanswer", "rawcrm", "客户姓名", "联系人姓名", "精确金额", "精确收入", "精确毛利"];
  for (const key of forbidden) if (new RegExp(`\\b${key}\\b`, "i").test(lower)) errors.push(`forbidden:${key}`);
  if (/DEMO-(?:OPP|CUST|ACC)-|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serialized)) errors.push("real_crm_token");
  if (!validateEvidence(output, allowedTokens).ok) errors.push("unsupported_evidence_token");
  if (output?.safety?.customerIdentityMasked !== true || output?.safety?.exactAmountSentToModel !== false || output?.safety?.rawTimelineSent !== false || output?.safety?.crmWritebackEnabled !== false) errors.push("safety_flags");
  if (input.safeContext.realCanary !== false || input.safeContext.d365Record !== false) errors.push("synthetic_flags");
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
    syntheticProbeExecuted: summary.externalLlmCalls === 1,
    httpSuccess: completed && summary.response?.httpSuccess === true,
    providerRequestCompatibilityReady: completed,
    syntheticStrictToolProbeComplete: completed,
    realCanaryAuthorized: false,
    remainingCanaryExecutionAuthorized: false,
    phase3cComplete: false,
  };
}

export async function runR5B1({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const summary = await executeSyntheticProbe({ env, fetchImpl, now });
  await writeArtifacts(summary);
  return summary;
}

async function writeArtifacts(summary) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b1-runtime-manifest.json"), `${JSON.stringify(summary, null, 2)}\n`),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b1-request-audit.json"), `${JSON.stringify(buildRequestAudit(summary), null, 2)}\n`),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b1-response-validation.json"), `${JSON.stringify(buildResponseValidation(summary), null, 2)}\n`),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b1-synthetic-probe-report.md"), buildReport(summary)),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5b1-safety-report.md"), buildSafetyReport(summary)),
    fs.writeFile(path.join(OUTPUT_DIR, "phase3c-r5c-real-canary-decision-pack-zh.md"), buildR5CDecisionPack(summary)),
  ]);
}

function buildRequestAudit(summary) {
  const error = summary.errorObservation || null;
  return {
    phase: RUN_ID,
    records: [{
      requestToken: REQUEST_TOKEN,
      provider: summary.provider,
      model: summary.model,
      endpointAlias: "deepseek-beta",
      contextVersion: summary.contextVersion,
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
      errorObservation: error,
      rawRequestBody: false,
      rawResponseBody: false,
      safeContextStored: false,
    }],
    externalLlmCalls: summary.externalLlmCalls,
    retryCount: summary.retryCount,
    fixtureFallbackCount: summary.fixtureFallbackCount,
    stopReason: summary.stopReason,
    crmWriteback: false,
    productionRequests: 0,
  };
}

function buildResponseValidation(summary) {
  return {
    phase: RUN_ID,
    requestToken: REQUEST_TOKEN,
    httpSuccess: summary.response?.httpSuccess === true,
    toolCallReady: summary.response?.toolCallReady === true,
    jsonReady: summary.response?.jsonReady === true,
    schemaReady: summary.response?.schemaReady === true,
    schemaErrors: summary.response?.schemaErrors || [],
    canonicalMappingReady: summary.response?.canonicalMappingReady === true,
    evidenceReady: summary.response?.evidenceReady === true,
    evidenceErrors: summary.response?.evidenceErrors || [],
    unsupportedClaimCount: summary.response?.unsupportedClaimCount || 0,
    safetyReady: summary.response?.safetyReady === true,
    safetyErrors: summary.response?.safetyErrors || [],
    status: summary.status,
    stopReason: summary.stopReason,
    providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady,
    rawOutputStored: false,
  };
}

function buildReport(summary) {
  const r = summary.response || {};
  return `# Phase 3C-R5B1 Synthetic Strict Tool Probe\n\n- Status: **${summary.status}**\n- External LLM Calls R5B1: **${summary.externalLlmCalls}/1**\n- Request token: \`${REQUEST_TOKEN}\`\n- Input: completely synthetic, non-CRM, non-D365\n- Retry: **${summary.retryCount}**\n- Fixture fallback: **${summary.fixtureFallbackCount}**\n- D365 GET: **${summary.d365Get}**\n- CRM Writeback: **false**\n- Production Requests: **0**\n\n## Synthetic Input\n\n- testOnly=true\n- d365Record=false\n- runtimeEligible=false\n- realCanary=false\n- syntheticProbe=true\n- Forbidden Field Count: **${summary.inputSafety.forbiddenFieldCount}**\n- Real CRM Token Count: **${summary.inputSafety.realCrmTokenCount}**\n- Request Hash Ready: **${summary.inputSafety.requestHashReady}**\n\n## Provider Request\n\n- Provider: **${summary.provider}**\n- Model: **${summary.model}**\n- Endpoint Alias: **deepseek-beta**\n- Single Tool: **${summary.request.toolName}**\n- strict=true: **${summary.request.strict}**\n- additionalProperties=false: **${summary.request.additionalPropertiesFalse}**\n- Forced tool choice: **${JSON.stringify(summary.request.toolChoice)}**\n- stream=false: **${summary.request.stream}**\n- response_format sent: **${summary.request.responseFormatSent}**\n- Request Schema Hash: \`${summary.request.requestSchemaHash}\`\n- Request Body Hash: \`${summary.request.requestBodyHash}\`\n\n## Validation\n\n- HTTP Success: **${r.httpSuccess === true}**\n- Tool Call: **${r.toolCallReady === true}** (${r.toolCallName || "none"})\n- JSON: **${r.jsonReady === true}**\n- Schema: **${r.schemaReady === true}**\n- Canonical Mapping: **${r.canonicalMappingReady === true}**\n- Evidence: **${r.evidenceReady === true}**\n- Unsupported Claim Count: **${r.unsupportedClaimCount || 0}**\n- Safety: **${r.safetyReady === true}**\n\nNo raw request, Safe Context, API key, Authorization header or raw response body is stored. Real Canary execution remains unauthorized.\n`;
}

function buildSafetyReport(summary) {
  const r = summary.response || {};
  return `# Phase 3C-R5B1 Safety Report\n\n- Synthetic input only: **true**\n- Raw CRM Exposure: **0**\n- Exact Amount Exposure: **0**\n- Raw Timeline Exposure: **0**\n- Secret Exposure: **0**\n- Browser External Provider Requests: **0**\n- CRM Writeback: **false**\n- Production Requests: **0**\n- Retry Count: **${summary.retryCount}**\n- Fixture Fallback Count: **${summary.fixtureFallbackCount}**\n- Safety Ready: **${r.safetyReady === true}**\n- Error observation: ${summary.errorObservation ? "safe allowlist only" : "not applicable; HTTP success"}\n`;
}

function buildR5CDecisionPack(summary) {
  return `# Phase 3C-R5C Real Canary Decision Pack\n\n## Status\n\n- Real Canary Authorized=false\n- Remaining Canary Execution Authorized=false\n- Phase 3C Complete=false\n- R5B1 Synthetic Probe: **${summary.syntheticStrictToolProbeComplete}**\n\n## Evidence\n\nR5B1 used exactly one completely synthetic input and one strict Tool Calling request. It did not read D365, select a real Canary, write CRM, use a browser-side Provider, or compare multiple models.\n\n## Next Authorization Boundary\n\nAny real Canary requires a separate explicit authorization, a fresh Safe Context review, a new request budget, and a new stop-on-first-failure decision. R5B1 does not authorize real Canary execution or Model Comparison.\n`;
}

function estimateCost(usage) {
  if (!usage) return null;
  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens);
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
  return Number(((inputTokens * 0.435 + outputTokens * 0.87) / 1_000_000).toFixed(8));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  runR5B1()
    .then((summary) => console.log(JSON.stringify({ status: summary.status, externalLlmCalls: summary.externalLlmCalls, httpStatus: summary.httpStatus || null, syntheticStrictToolProbeComplete: summary.syntheticStrictToolProbeComplete, providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady }, null, 2)))
    .catch(() => { process.exitCode = 1; });
}
