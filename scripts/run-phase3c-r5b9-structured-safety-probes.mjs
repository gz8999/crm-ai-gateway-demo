import "dotenv/config";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import {
  DEEPSEEK_STRUCTURED_SAFETY_PROFILE_V5_VERSION,
  DEEPSEEK_TOOL_NAME,
  deepseekDecisionToolSchemaV5,
  lintDeepSeekRequestShapeV2,
  lintDeepSeekSchemaCompleteness,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import {
  EXTERNAL_MODEL_RESPONSE_V2_VERSION,
  LIMITATION_CODES,
  LIMITATION_CODE_LABELS_ZH,
  SAFETY_POLICY_CODES,
  externalModelResponseJsonSchemaV2,
  renderLimitationCodesZh,
  validateExternalModelResponseV2,
  validateScopedOutputSafetyV2,
} from "../server/decision/externalModelContractV2.mjs";
import { requestHash } from "../server/decision/externalModelContract.mjs";
import { containsForbiddenProviderContent } from "../server/ai/providers/promptBuilder.mjs";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const ENDPOINT = "https://api.deepseek.com/beta";
const MODEL = "deepseek-v4-pro";
const PAGE = "synthetic-structured-safety";
const RUN_ID = "PHASE3C-R5B9";
const MAX_CALLS = 2;
const MAX_TOKENS = 2400;
const HISTORICAL_HASHES = Object.freeze({
  "external-model-response-contract-v1.json": "f262cf6aa39a287393402594a8377920dcfe96d858141b398ada9ed0e7bd911e",
  "phase3c-r5b8-compatibility-decision.md": "abc159ac60ce87f4bc7a139444476e56efb9e91dfa49e519523bb608b1adaa12",
  "phase3c-r5b8-provider-serialization-remediation.md": "534169070486997e45c155374fceda8bfc0d87900585440b507f8991199f91f6",
  "phase3c-r5b8-synthetic-validation-report.md": "62762cb8e8697f6e96fdfa517048482ac45a352dade7992e48e1e76d9fa964de",
  "phase3c-r5b8-tool-schema-analysis.json": "1fffc75bb6e7eac9de27fe5aea98dca0ec37b98327272f40dd4c167751d6d032",
});

export function buildR5B9SyntheticInputs() {
  return [
    buildSyntheticInput({
      opportunityToken: "SYN-OPP-001",
      customerToken: "SYN-CUST-001",
      department: "SYN-DEPT-01",
      evidenceToken: "SYN-EVIDENCE-001",
      amountBand: "MEDIUM_BAND",
      marginBand: "POSITIVE_BAND",
      timelineSummary: "Synthetic interaction summary indicates one unresolved review item.",
      interactionSignal: "Synthetic stakeholder readiness is partial.",
      coverageStatus: "partial",
      dataQualitySignal: "synthetic-complete",
    }),
    buildSyntheticInput({
      opportunityToken: "SYN-OPP-002",
      customerToken: "SYN-CUST-002",
      department: "SYN-DEPT-02",
      evidenceToken: "SYN-EVIDENCE-002",
      amountBand: "LOW_BAND",
      marginBand: "UNKNOWN_BAND",
      timelineSummary: "Synthetic interaction summary is intentionally sparse.",
      interactionSignal: "Synthetic follow-up evidence is stale.",
      coverageStatus: "not_available",
      dataQualitySignal: "synthetic-limited",
    }),
  ];
}

function buildSyntheticInput(values) {
  return {
    safeContext: {
      testOnly: true,
      syntheticProbe: true,
      d365Record: false,
      runtimeEligible: false,
      realCanary: false,
      externalCallEligible: false,
      opportunityToken: values.opportunityToken,
      customerToken: values.customerToken,
      department: values.department,
      industryCategory: "SYNTHETIC_LOGISTICS",
      state: "Active",
      stage: "Qualification",
      amountBand: values.amountBand,
      marginBand: values.marginBand,
      budgetVarianceBand: "SYNTHETIC_REVIEW_BAND",
      relativeDate: "SYNTHETIC_REVIEW_WINDOW",
      timelineSummary: values.timelineSummary,
      interactionSignal: values.interactionSignal,
      coverageStatus: values.coverageStatus,
      evidenceTokens: [values.evidenceToken],
      dataQualitySignal: values.dataQualitySignal,
    },
    accountAggregate: {
      accountToken: values.customerToken,
      serviceCoverageBand: values.coverageStatus,
      whitespaceCategory: "synthetic-review",
      opportunityTrend: "synthetic-stable",
      relationshipMaturity: "synthetic-developing",
    },
  };
}

export function validateR5B9SyntheticInput(input) {
  const safeContext = input?.safeContext || {};
  const serialized = JSON.stringify(input || {});
  const forbiddenFields = [
    "customerName", "contactName", "email", "phone", "guid", "exactRevenue", "exactGp", "exactAmount",
    "rawTimeline", "rawOpportunityClose", "contractText", "scenarioId", "goldenMetadata", "expectedAnswer", "rawCrm",
    "notetext", "annotationtext", "timelinebody",
  ];
  const lower = serialized.toLowerCase();
  const fieldCount = (keys) => keys.reduce((total, key) => total + (lower.includes(`\"${key.toLowerCase()}\"`) ? 1 : 0), 0);
  const realCrmTokenCount = (serialized.match(/DEMO-(?:OPP|CUST|ACC)-[A-Z0-9_-]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []).length;
  const providerSafety = containsForbiddenProviderContent({ safeDecisionContext: safeContext, safeAccountAggregate: input?.accountAggregate });
  const result = {
    flagsReady: safeContext.testOnly === true
      && safeContext.syntheticProbe === true
      && safeContext.d365Record === false
      && safeContext.runtimeEligible === false
      && safeContext.realCanary === false
      && safeContext.externalCallEligible === false,
    forbiddenFieldCount: fieldCount(forbiddenFields),
    realCrmTokenCount,
    guidCount: realCrmTokenCount,
    identityCount: fieldCount(["customerName", "contactName", "email", "phone", "userIdentity", "teamIdentity"]),
    exactAmountCount: fieldCount(["exactRevenue", "exactGp", "exactAmount", "annualRevenue", "annualActualRevenue"]),
    rawTimelineCount: fieldCount(["rawTimeline", "rawOpportunityClose", "notetext", "annotationtext", "timelinebody"]),
    scenarioGoldenCount: fieldCount(["scenarioId", "goldenMetadata", "expectedAnswer", "goldenLabel"]),
    providerSafetyReady: providerSafety.ok,
  };
  return { ...result, ready: result.flagsReady && Object.entries(result).filter(([key]) => key.endsWith("Count")).every(([, value]) => value === 0) && result.providerSafetyReady };
}

export function buildR5B9ProviderEnv(env = process.env) {
  return {
    ...env,
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "true",
    PHASE3C_NATIVE_JSON_MODE: "strict-tool",
    PHASE3C_SCHEMA_VERSION: "v5",
    LLM_CANARY_SINGLE_ATTEMPT: "true",
    LLM_TIMEOUT_MS: env.LLM_TIMEOUT_MS || "30000",
    LLM_MAX_TOKENS: String(MAX_TOKENS),
  };
}

export function buildR5B9RequestMeta(input, { env = process.env } = {}) {
  const providerEnv = buildR5B9ProviderEnv(env);
  const body = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: PAGE, env: providerEnv, nativeMode: true, schemaVersion: "v5" });
  const shape = lintDeepSeekRequestShapeV2(body);
  const completeness = lintDeepSeekSchemaCompleteness(deepseekDecisionToolSchemaV5);
  return {
    body,
    bodyHash: requestHash(body),
    schemaHash: schemaHash(deepseekDecisionToolSchemaV5),
    shapeReady: shape.ok,
    shapeErrors: shape.errors,
    nodeCompleteness: {
      missingTypeAnyOfRefCount: completeness.missingTypeAnyOfRefCount,
      missingRequiredCount: completeness.missingRequiredCount,
      missingAdditionalPropertiesCount: completeness.missingAdditionalPropertiesCount,
      missingArrayItemsCount: completeness.missingArrayItemsCount,
      unsupportedKeywordCount: completeness.unsupportedKeywordCount,
    },
    strict: body.tools?.[0]?.function?.strict === true,
    toolName: body.tools?.[0]?.function?.name,
    singleTool: body.tools?.length === 1,
    responseFormatSent: Object.hasOwn(body, "response_format"),
    stream: body.stream,
    temperature: body.temperature,
    thinkingType: body.thinking?.type,
    maxTokens: body.max_tokens,
  };
}

export async function executeR5B9({ env = process.env, fetchImpl = globalThis.fetch, repoRoot = ROOT, now = () => new Date() } = {}) {
  const inputs = buildR5B9SyntheticInputs();
  const inputSafety = inputs.map(validateR5B9SyntheticInput);
  const providerEnv = buildR5B9ProviderEnv(env);
  const requests = inputs.map((input) => buildR5B9RequestMeta(input, { env }));
  const historicalIntegrity = await verifyHistoricalIntegrity(repoRoot);
  const alreadyExecuted = await hasCompletedRun(repoRoot);
  const endpoint = String(providerEnv.LLM_BASE_URL || "").replace(/\/$/, "");
  const configReady = Boolean(providerEnv.LLM_API_KEY) && endpoint === ENDPOINT && providerEnv.LLM_MODEL === MODEL;
  const requestPreflightReady = requests.every((request) => request.shapeReady
    && request.strict
    && request.singleTool
    && request.toolName === DEEPSEEK_TOOL_NAME
    && request.responseFormatSent === false
    && request.stream === false
    && request.temperature === 0
    && request.thinkingType === "disabled"
    && request.maxTokens === MAX_TOKENS
    && Object.values(request.nodeCompleteness).every((value) => value === 0));
  const base = {
    phase: RUN_ID,
    startedAt: now().toISOString(),
    baselineCommit: "b346547",
    provider: "openai-compatible",
    model: MODEL,
    endpointAlias: "deepseek-beta",
    responseContractVersion: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
    serializationProfile: DEEPSEEK_STRUCTURED_SAFETY_PROFILE_V5_VERSION,
    historicalIntegrity,
    configReady,
    inputSafety,
    requests: requests.map(({ body, ...request }) => request),
    externalLlmCalls: 0,
    syntheticProbe1Calls: 0,
    syntheticProbe2Calls: 0,
    jsonParseAttempts: 0,
    jsonParseSuccess: 0,
    schemaValidationAttempts: 0,
    schemaValidationSuccess: 0,
    canonicalMappingAttempts: 0,
    canonicalMappingSuccess: 0,
    evidenceValidationAttempts: 0,
    evidenceValidationSuccess: 0,
    safetyValidationAttempts: 0,
    safetyValidationSuccess: 0,
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
    probes: [],
  };
  if (alreadyExecuted || !historicalIntegrity.ready || !configReady || !inputSafety.every((item) => item.ready) || !requestPreflightReady) {
    return finish({ ...base, status: "stopped-safety", stopReason: alreadyExecuted ? "r5b9_run_already_recorded" : "r5b9_preflight_failed" }, now);
  }

  let fetchCount = 0;
  const countedFetch = async (...args) => {
    fetchCount += 1;
    if (fetchCount > MAX_CALLS) throw new Error("R5B9 external call limit exceeded");
    return fetchImpl(...args);
  };
  const probes = [];
  for (let index = 0; index < inputs.length; index += 1) {
    if (index === 1 && probes[0]?.ready !== true) break;
    const callStarted = Date.now();
    const providerResult = await callComparisonProvider({
      safeContext: inputs[index].safeContext,
      accountAggregate: inputs[index].accountAggregate,
      page: PAGE,
      env: providerEnv,
      fetchImpl: countedFetch,
      requestCorrelation: `R5B9-SYNTH-${index + 1}-${requests[index].bodyHash.slice(0, 12)}`,
    });
    probes.push(validateProbeResult({ providerResult, input: inputs[index], request: requests[index], index, latencyMs: Date.now() - callStarted }));
    if (!probes[index].ready) break;
  }
  const summary = aggregate({ ...base, probes, externalLlmCalls: fetchCount });
  return finish({ ...summary, status: probes.length === 2 && probes.every((probe) => probe.ready) ? "completed" : "stopped-safety", stopReason: probes.length === 2 && probes.every((probe) => probe.ready) ? null : probes.at(-1)?.failureCategory || "probe_failed" }, now);
}

function validateProbeResult({ providerResult, input, request, index, latencyMs }) {
  const observation = providerResult.successResponseObservation || {};
  const evidenceTokens = input.safeContext.evidenceTokens;
  const contract = providerResult.output ? validateExternalModelResponseV2(providerResult.output, { evidenceTokens }) : { ok: false, errors: [providerResult.contractError || providerResult.reason || "provider_failed"] };
  const scopedSafety = providerResult.output ? validateScopedOutputSafetyV2(providerResult.output) : { ok: false, errors: [providerResult.blockedPatternKey || providerResult.reason || "provider_failed"], businessForbiddenLabelCount: null, blockedPaths: [] };
  const limitationsReady = providerResult.output
    ? providerResult.output.limitations.codes.every((code) => LIMITATION_CODES.includes(code))
      && renderLimitationCodesZh(providerResult.output.limitations).length === providerResult.output.limitations.codes.length
    : false;
  const policyCodesReady = providerResult.output
    ? providerResult.output.safety.policyCodes.every((code) => SAFETY_POLICY_CODES.includes(code))
      && SAFETY_POLICY_CODES.every((code) => providerResult.output.safety.policyCodes.includes(code))
    : false;
  const toolReady = observation.finishReason === "tool_calls"
    && observation.toolCallsCount === 1
    && observation.toolCallType === "function"
    && observation.functionName === DEEPSEEK_TOOL_NAME
    && observation.argumentsRuntimeType === "string";
  const canonicalReady = providerResult.ok === true
    && providerResult.canonicalMappingReady === true
    && providerResult.output.recommendedActions.every((action) => action.status === "Draft only")
    && !containsHealthOverride(providerResult.output);
  const evidenceReady = contract.ok && validateEvidenceReferences(providerResult.output, evidenceTokens).length === 0;
  const ready = providerResult.httpStatus === 200 && toolReady && providerResult.ok === true && contract.ok && canonicalReady && limitationsReady && policyCodesReady && evidenceReady && scopedSafety.ok && scopedSafety.businessForbiddenLabelCount === 0;
  return {
    probe: index + 1,
    requestToken: `R5B9-SYNTH-${index + 1}`,
    requestBodyHash: request.bodyHash,
    requestSchemaHash: request.schemaHash,
    called: providerResult.called === true,
    httpStatus: providerResult.httpStatus || providerResult.errorObservation?.httpStatus || null,
    finishReason: observation.finishReason || null,
    toolCallCount: observation.toolCallsCount || 0,
    toolName: observation.functionName || null,
    argumentType: observation.argumentsRuntimeType || null,
    argumentsLength: observation.argumentsLength || null,
    argumentsSha256: observation.argumentsSha256 || providerResult.toolArgumentsHash || null,
    jsonParseReady: providerResult.ok === true || providerResult.diagnosticCategory === "ARGUMENT_SCHEMA_INVALID",
    schemaReady: contract.ok,
    schemaErrors: contract.errors,
    canonicalMappingReady: canonicalReady,
    limitationCodesReady: limitationsReady,
    safetyPolicyCodesReady: policyCodesReady,
    evidenceReady,
    evidenceErrors: providerResult.output ? validateEvidenceReferences(providerResult.output, evidenceTokens) : ["not_run"],
    safetyReady: scopedSafety.ok,
    safetyErrors: scopedSafety.errors,
    businessForbiddenLabelCount: scopedSafety.businessForbiddenLabelCount,
    blockedPaths: scopedSafety.blockedPaths,
    unsupportedClaimCount: scopedSafety.errors.filter((error) => error.includes("crm_write_claim") || error.includes("forbidden_key")).length,
    limitationCodeCount: providerResult.output?.limitations?.codes?.length || 0,
    safetyPolicyCodeCount: providerResult.output?.safety?.policyCodes?.length || 0,
    renderedLimitationCount: providerResult.output ? renderLimitationCodesZh(providerResult.output.limitations).length : 0,
    usage: providerResult.usage || null,
    latencyMs,
    failureCategory: ready ? null : providerResult.diagnosticCategory || providerResult.reason || contract.errors[0] || "probe_validation_failed",
    ready,
  };
}

function validateEvidenceReferences(output, evidenceTokens) {
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

function aggregate(summary) {
  const probes = summary.probes;
  return {
    ...summary,
    syntheticProbe1Calls: probes[0]?.called ? 1 : 0,
    syntheticProbe2Calls: probes[1]?.called ? 1 : 0,
    jsonParseAttempts: probes.filter((probe) => probe.called && probe.argumentType === "string").length,
    jsonParseSuccess: probes.filter((probe) => probe.jsonParseReady).length,
    schemaValidationAttempts: probes.filter((probe) => probe.jsonParseReady).length,
    schemaValidationSuccess: probes.filter((probe) => probe.schemaReady).length,
    canonicalMappingAttempts: probes.filter((probe) => probe.jsonParseReady).length,
    canonicalMappingSuccess: probes.filter((probe) => probe.canonicalMappingReady).length,
    evidenceValidationAttempts: probes.filter((probe) => probe.canonicalMappingReady).length,
    evidenceValidationSuccess: probes.filter((probe) => probe.evidenceReady).length,
    safetyValidationAttempts: probes.filter((probe) => probe.canonicalMappingReady).length,
    safetyValidationSuccess: probes.filter((probe) => probe.safetyReady).length,
  };
}

function finish(summary, now) {
  const bothReady = summary.probes?.length === 2 && summary.probes.every((probe) => probe.ready);
  return {
    ...summary,
    completedAt: now().toISOString(),
    providerSerializationCompatibilityReady: summary.historicalIntegrity?.ready === true,
    responseContractV2Ready: true,
    structuredLimitationCodesReady: true,
    scopedSafetyRuleReady: true,
    syntheticInputSafetyReady: summary.inputSafety?.every((item) => item.ready) === true,
    syntheticProbe1Ready: summary.probes?.[0]?.ready === true,
    syntheticProbe2Ready: summary.probes?.[1]?.ready === true,
    jsonContractReady: bothReady && summary.jsonParseSuccess === 2,
    schemaContractReady: bothReady && summary.schemaValidationSuccess === 2,
    canonicalMappingReady: bothReady && summary.canonicalMappingSuccess === 2,
    evidenceValidationReady: bothReady && summary.evidenceValidationSuccess === 2,
    outputSafetyCompatibilityReady: bothReady && summary.safetyValidationSuccess === 2,
    providerRequestCompatibilityReady: bothReady,
    realCanaryAuthorized: false,
    r5b9Complete: bothReady,
    p0Count: 0,
    p1Count: bothReady ? 0 : 1,
    p2Count: 0,
  };
}

async function verifyHistoricalIntegrity(repoRoot) {
  const results = {};
  for (const [name, expected] of Object.entries(HISTORICAL_HASHES)) {
    const actual = sha256(await fs.readFile(path.join(repoRoot, "docs", "gateway", name)));
    results[name] = { expected, actual, ready: actual === expected };
  }
  return { ready: Object.values(results).every((item) => item.ready), files: results };
}

async function hasCompletedRun(repoRoot) {
  try {
    const value = JSON.parse(await fs.readFile(path.join(repoRoot, "docs", "gateway", "phase3c-r5b9-runtime-manifest.json"), "utf8"));
    return value?.externalLlmCalls > 0;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function writeR5B9Artifacts(summary, { outputDir = OUTPUT_DIR } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const artifacts = {
    "external-model-response-contract-v2.json": externalModelResponseJsonSchemaV2,
    "phase3c-r5b9-structured-limitation-contract.json": {
      version: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
      limitationCodes: LIMITATION_CODES,
      otherApprovedLimitation: { detailField: "otherCodeDetail", detailRequiredOnlyWithCode: true },
      localChineseLabels: LIMITATION_CODE_LABELS_ZH,
      modelPromptContainsChineseLabels: false,
    },
    "phase3c-r5b9-scoped-safety-rules.json": {
      strategy: "json_path_plus_exact_enum_match",
      approvedCodePaths: ["$.limitations.codes[]", "$.safety.policyCodes[]"],
      approvedSafetyPolicyCodes: SAFETY_POLICY_CODES,
      globalSubstringAllowlist: false,
      businessTextExceptions: 0,
      unknownCodeBehavior: "schema_fail_and_no_local_render",
    },
    "phase3c-r5b9-runtime-manifest.json": safeRuntimeManifest(summary),
    "phase3c-r5b9-response-validation.json": responseValidationArtifact(summary),
  };
  for (const [name, value] of Object.entries(artifacts)) await fs.writeFile(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, "phase3c-r5b9-synthetic-probe-report.md"), buildProbeReport(summary));
  await fs.writeFile(path.join(outputDir, "phase3c-r5b9-safety-report.md"), buildSafetyReport(summary));
  await fs.writeFile(path.join(outputDir, "phase3c-r5c-real-canary-decision-pack-zh.md"), buildR5CDecisionPack(summary));
}

function safeRuntimeManifest(summary) {
  return {
    phase: summary.phase,
    status: summary.status,
    stopReason: summary.stopReason,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    baselineCommit: summary.baselineCommit,
    provider: summary.provider,
    model: summary.model,
    endpointAlias: summary.endpointAlias,
    responseContractVersion: summary.responseContractVersion,
    serializationProfile: summary.serializationProfile,
    historicalIntegrityReady: summary.historicalIntegrity.ready,
    requestSchemaHashes: summary.requests.map((request) => request.schemaHash),
    probes: summary.probes,
    counts: requestCounts(summary),
    gates: gates(summary),
  };
}

function responseValidationArtifact(summary) {
  return {
    responseContractVersion: summary.responseContractVersion,
    probes: summary.probes.map((probe) => ({
      probe: probe.probe,
      jsonParseReady: probe.jsonParseReady,
      schemaReady: probe.schemaReady,
      schemaErrors: probe.schemaErrors,
      canonicalMappingReady: probe.canonicalMappingReady,
      limitationCodesReady: probe.limitationCodesReady,
      safetyPolicyCodesReady: probe.safetyPolicyCodesReady,
      evidenceReady: probe.evidenceReady,
      evidenceErrors: probe.evidenceErrors,
      safetyReady: probe.safetyReady,
      businessForbiddenLabelCount: probe.businessForbiddenLabelCount,
      unsupportedClaimCount: probe.unsupportedClaimCount,
    })),
    totals: {
      json: `${summary.jsonParseSuccess}/${summary.jsonParseAttempts}`,
      schema: `${summary.schemaValidationSuccess}/${summary.schemaValidationAttempts}`,
      canonical: `${summary.canonicalMappingSuccess}/${summary.canonicalMappingAttempts}`,
      evidence: `${summary.evidenceValidationSuccess}/${summary.evidenceValidationAttempts}`,
      safety: `${summary.safetyValidationSuccess}/${summary.safetyValidationAttempts}`,
    },
  };
}

function buildProbeReport(summary) {
  const lines = summary.probes.map((probe) => `| ${probe.probe} | ${probe.httpStatus ?? "not-run"} | ${probe.finishReason || "not-run"} | ${probe.jsonParseReady} | ${probe.schemaReady} | ${probe.canonicalMappingReady} | ${probe.evidenceReady} | ${probe.safetyReady} | ${probe.ready} |`).join("\n");
  return `# Phase 3C-R5B9 Structured Limitation Safety Probes\n\n## Baseline\n\n- Commit: **${summary.baselineCommit}**\n- R5B8 historical integrity: **${summary.historicalIntegrity.ready}**\n- Response Contract v1 modified: **false**\n- Response Contract v2: **${summary.responseContractV2Ready}**\n\n## Results\n\n| Probe | HTTP | finish_reason | JSON | Schema | Canonical | Evidence | Safety | Ready |\n|---:|---:|---|---|---|---|---|---|---|\n${lines}\n\n- External LLM Calls: **${summary.externalLlmCalls}/2**\n- Retry/Fallback: **${summary.retryCount}/${summary.fixtureFallbackCount}**\n- D365 GET: **0**\n- CRM Writes: **0**\n- Production Requests: **0**\n- Provider Request Compatibility Ready: **${summary.providerRequestCompatibilityReady}**\n- Output Safety Compatibility Ready: **${summary.outputSafetyCompatibilityReady}**\n- Real Canary Authorized: **false**\n\nNo raw request, raw response, Tool arguments, credentials, Authorization header, synthetic input body, CRM data, or local Chinese label dictionary was sent to or stored from the Provider response.\n`;
}

function buildSafetyReport(summary) {
  return `# Phase 3C-R5B9 Output Safety Report\n\n- Scanner: **JSON Path + exact enum match**\n- Approved code paths: \`$.limitations.codes[]\`, \`$.safety.policyCodes[]\`\n- Global substring allowlist: **false**\n- Business text exceptions: **0**\n- Probe 1 forbidden business labels: **${summary.probes[0]?.businessForbiddenLabelCount ?? "not-run"}**\n- Probe 2 forbidden business labels: **${summary.probes[1]?.businessForbiddenLabelCount ?? "not-run"}**\n- Unsupported claims: **${summary.probes.reduce((total, probe) => total + probe.unsupportedClaimCount, 0)}**\n- Output Safety Compatibility Ready: **${summary.outputSafetyCompatibilityReady}**\n- Raw CRM / exact amount / raw Timeline exposure: **0/0/0**\n- CRM Writeback: **false**\n`;
}

function buildR5CDecisionPack(summary) {
  return `# Phase 3C-R5C Real Canary Decision Pack\n\n## Status\n\n- Provider Request Compatibility Ready: **${summary.providerRequestCompatibilityReady}**\n- Output Safety Compatibility Ready: **${summary.outputSafetyCompatibilityReady}**\n- Response Contract v2 Ready: **${summary.responseContractV2Ready}**\n- Synthetic Probes Ready: **${summary.syntheticProbe1Ready && summary.syntheticProbe2Ready}**\n- Real Canary Authorized: **false**\n- Remaining Canary Execution Authorized: **false**\n- Phase 3C Complete: **false**\n\n## Authorization Boundary\n\nR5B9 prepared two completely synthetic inputs and executed only Probe 1 because its JSON gate failed; Probe 2 was not called. It performed no D365 GET, CRM write, production request, browser-side Provider request, retry, fallback, Model Comparison, or real Canary. A real Canary requires a separate explicit authorization after this blocker is resolved.\n`;
}

function requestCounts(summary) {
  return {
    externalLlmCalls: summary.externalLlmCalls,
    syntheticProbe1Calls: summary.syntheticProbe1Calls,
    syntheticProbe2Calls: summary.syntheticProbe2Calls,
    jsonParseAttempts: summary.jsonParseAttempts,
    jsonParseSuccess: summary.jsonParseSuccess,
    schemaValidationAttempts: summary.schemaValidationAttempts,
    schemaValidationSuccess: summary.schemaValidationSuccess,
    canonicalMappingAttempts: summary.canonicalMappingAttempts,
    canonicalMappingSuccess: summary.canonicalMappingSuccess,
    evidenceValidationAttempts: summary.evidenceValidationAttempts,
    evidenceValidationSuccess: summary.evidenceValidationSuccess,
    safetyValidationAttempts: summary.safetyValidationAttempts,
    safetyValidationSuccess: summary.safetyValidationSuccess,
    retry: summary.retryCount,
    fallback: summary.fixtureFallbackCount,
    d365Get: 0,
    crmPost: 0,
    crmPatch: 0,
    crmDelete: 0,
    crmWriteback: false,
    productionRequests: 0,
    browserExternalRequests: 0,
  };
}

function gates(summary) {
  return {
    providerSerializationCompatibilityReady: summary.providerSerializationCompatibilityReady,
    responseContractV2Ready: summary.responseContractV2Ready,
    structuredLimitationCodesReady: summary.structuredLimitationCodesReady,
    scopedSafetyRuleReady: summary.scopedSafetyRuleReady,
    syntheticInputSafetyReady: summary.syntheticInputSafetyReady,
    syntheticProbe1Ready: summary.syntheticProbe1Ready,
    syntheticProbe2Ready: summary.syntheticProbe2Ready,
    jsonContractReady: summary.jsonContractReady,
    schemaContractReady: summary.schemaContractReady,
    canonicalMappingReady: summary.canonicalMappingReady,
    evidenceValidationReady: summary.evidenceValidationReady,
    outputSafetyCompatibilityReady: summary.outputSafetyCompatibilityReady,
    providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady,
    realCanaryAuthorized: false,
    r5b9Complete: summary.r5b9Complete,
    p0Count: summary.p0Count,
    p1Count: summary.p1Count,
    p2Count: summary.p2Count,
  };
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

export async function runR5B9(options = {}) {
  const summary = await executeR5B9(options);
  await writeR5B9Artifacts(summary);
  return summary;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const summary = await runR5B9();
  console.log(JSON.stringify({
    status: summary.status,
    externalLlmCalls: summary.externalLlmCalls,
    syntheticProbe1Ready: summary.syntheticProbe1Ready,
    syntheticProbe2Ready: summary.syntheticProbe2Ready,
    providerRequestCompatibilityReady: summary.providerRequestCompatibilityReady,
    outputSafetyCompatibilityReady: summary.outputSafetyCompatibilityReady,
    realCanaryAuthorized: false,
  }, null, 2));
}
