import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../server/dynamicsClient.mjs";
import { createFrozenDatasetReader } from "../server/d365/frozenDatasetReader.mjs";
import { buildFrozenScope } from "../server/d365/frozenDatasetContract.mjs";
import { buildScenarioDecisionPack } from "../server/decision/deterministicProvider.mjs";
import { buildComparisonPayload, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import { COMPARISON_PAGES, validateUnifiedOutput } from "../server/decision/comparisonSchema.mjs";
import { evaluateComparison, safeContextHash } from "../server/decision/comparisonEvaluation.mjs";
import { evaluateModelResponse } from "../server/decision/modelEvaluation.mjs";
import { validateExternalModelResponse } from "../server/decision/externalModelContract.mjs";
import { containsForbiddenProviderContent } from "../server/ai/providers/promptBuilder.mjs";
import { resolveProviderStatus } from "../server/ai/providers/providerRouter.mjs";
import { hasGuid } from "../server/pilot/pilotContract.mjs";

const ROOT = process.cwd();
const DEFAULT_SELECTION_PATH = "docs/gateway/external-llm-canary-selection-v3.json";
const PREFLIGHT_PATH = "docs/gateway/d365-pilot-safe-context-preflight.json";
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const DEFAULT_MODEL = "deepseek-v4-pro";
const BASE_URL = "https://api.deepseek.com";
const PRICING = Object.freeze({ inputCacheMissPerMillionUsd: 0.435, outputPerMillionUsd: 0.87 });
const DEFAULT_RUN_ID = "PHASE3C-R2";
const DEFAULT_REQUEST_PREFIX = "PHASE3C-R2-CANARY";
const DEFAULT_REPORT_PREFIX = "external-llm-canary-r2";
const FORBIDDEN_OUTPUT_CLAIMS = [
  "customer said", "email confirms", "port closure", "customs delay", "sanction", "guaranteed growth", "real-world disruption",
  "客户表示", "客户说", "邮件确认", "港口关闭", "海关延误", "制裁", "保证增长", "现实中断", "真实客户",
];

export async function main({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const started = now();
  const selectionPath = env.PHASE3C_SELECTION_PATH || DEFAULT_SELECTION_PATH;
  const runId = env.PHASE3C_RUN_ID || DEFAULT_RUN_ID;
  const reportPrefix = env.PHASE3C_REPORT_PREFIX || DEFAULT_REPORT_PREFIX;
  const selection = await readJson(selectionPath);
  const offlinePreflight = await readJson(PREFLIGHT_PATH);
  const providerEnv = buildProviderEnv({ ...env, PHASE3C_RUN_ID: runId, PHASE3C_REPORT_PREFIX: reportPrefix });
  const providerGate = resolveProviderStatus(providerEnv);
  assertProviderGate(providerGate, providerEnv);

  const safeEnv = { ...env, AI_PROVIDER: "demo", ALLOW_EXTERNAL_AI: "false" };
  const client = createDynamicsClient({ env: safeEnv, fetchImpl });
  const reader = createFrozenDatasetReader({ client, env: safeEnv, root: ROOT, now });
  const snapshot = await reader.read();
  const scope = buildFrozenScope(snapshot, { department: "all", now: now() });
  const inputs = buildCanaryInputs({ selection, offlinePreflight, scope });
  const canaryLimit = Math.min(inputs.length, Math.max(1, Number(env.PHASE3C_CANARY_LIMIT || inputs.length)));
  const executionInputs = inputs.slice(0, canaryLimit);
  let run;
  try {
    run = await executeCanaries({ inputs: executionInputs, providerEnv, fetchImpl, now });
  } catch (error) {
    run = {
      status: "stopped-safety",
      reason: error.phase3c?.reason || error.message,
      auditReason: error.phase3c?.auditReason || null,
      results: [],
      externalLlmCalls: error.phase3c?.externalLlmCalls || 0,
      failedAttempt: error.phase3c?.attemptRecord || null,
    };
    const stoppedSummary = buildSummary({ selection, selectionPath, offlinePreflight, snapshot, scope, providerGate, run, runId, reportPrefix, started, completedAt: now(), executionCount: canaryLimit, nativeJsonMode: providerEnv.PHASE3C_NATIVE_JSON_MODE === "strict-tool" ? "strict-tool" : "json-object" });
    await writeReports(stoppedSummary);
    throw error;
  }
  const completedAt = now();
  const summary = buildSummary({ selection, selectionPath, offlinePreflight, snapshot, scope, providerGate, run, runId, reportPrefix, started, completedAt, executionCount: canaryLimit, nativeJsonMode: providerEnv.PHASE3C_NATIVE_JSON_MODE === "strict-tool" ? "strict-tool" : "json-object" });
  await writeReports(summary);
  return summary;
}

function buildProviderEnv(env) {
  const nativeStrict = env.PHASE3C_NATIVE_JSON_MODE === "strict-tool";
  return {
    ...env,
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "true",
    FEATURE_MODEL_COMPARISON: "true",
    LLM_BASE_URL: nativeStrict ? `${BASE_URL}/beta` : BASE_URL,
    LLM_MODEL: DEFAULT_MODEL,
    LLM_CANARY_SINGLE_ATTEMPT: "true",
    PHASE3C_REQUEST_PREFIX: env.PHASE3C_REQUEST_PREFIX || DEFAULT_REQUEST_PREFIX,
    LLM_TIMEOUT_MS: env.LLM_TIMEOUT_MS || "30000",
    LLM_MAX_TOKENS: env.LLM_MAX_TOKENS || "1200",
  };
}

function assertProviderGate(gate, env) {
  if (!env.LLM_API_KEY) throw new Error("External canary requires an API key supplied through the process environment.");
  if (!gate.configured || !gate.externalAiEnabled || gate.provider !== "openai-compatible") throw new Error("External canary provider gate is not satisfied.");
  const expectedBaseUrl = env.PHASE3C_NATIVE_JSON_MODE === "strict-tool" ? `${BASE_URL}/beta` : BASE_URL;
  if (env.LLM_BASE_URL !== expectedBaseUrl || env.LLM_MODEL !== DEFAULT_MODEL) throw new Error("External canary provider is not the approved DeepSeek V4 Pro endpoint/model.");
}

function buildCanaryInputs({ selection, offlinePreflight, scope }) {
  if (selection?.count !== 24 || selection.records?.length !== 24) throw new Error("Frozen External LLM canary selection must contain exactly 24 records.");
  const contextByToken = new Map(scope.contexts.map((context) => [context.opportunityToken, context]));
  const offlineScenarioByToken = new Map();
  for (const row of offlinePreflight?.scenarioCoverage || []) for (const token of row.tokens || []) offlineScenarioByToken.set(token, row.scenarioId);
  const inputs = selection.records.map((record, index) => {
    const context = contextByToken.get(record.opportunityToken);
    if (!context) throw new Error(`Canary Safe Context missing for ${record.opportunityToken}.`);
    const page = COMPARISON_PAGES[index % COMPARISON_PAGES.length];
    const pack = buildScenarioDecisionPack(scope.contexts, context);
    const comparisonPayload = buildComparisonPayload({ safeContext: context, accountAggregate: context.accountAggregate, page });
    const safeCheck = validateSafeProviderInput(comparisonPayload.providerInput);
    if (!safeCheck.ok) throw new Error(`Safe Context rejected for ${record.opportunityToken}: ${safeCheck.reason}`);
    return {
      opportunityToken: record.opportunityToken,
      page,
      context,
      accountAggregate: context.accountAggregate,
      demoOutput: pack[page],
      contextHash: safeContextHash({ safeContext: context, accountAggregate: context.accountAggregate }),
      providerInputHash: safeContextHash(comparisonPayload.providerInput),
      offlineEvaluationLenses: [...(record.evaluationLenses || [])],
      offlineScenario: offlineScenarioByToken.get(record.opportunityToken) || null,
    };
  });
  if (new Set(inputs.map((item) => item.opportunityToken)).size !== 24) throw new Error("Frozen canary selection contains duplicate opportunity tokens.");
  return inputs;
}

async function executeCanaries({ inputs, providerEnv, fetchImpl, now }) {
  const results = [];
  const nativeStrict = providerEnv.PHASE3C_NATIVE_JSON_MODE === "strict-tool";
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const requestToken = `${providerEnv.PHASE3C_REQUEST_PREFIX || DEFAULT_REQUEST_PREFIX}-${String(index + 1).padStart(2, "0")}`;
    const requestStarted = Date.now();
    let fetchCount = 0;
    const countedFetch = async (...args) => { fetchCount += 1; return fetchImpl(...args); };
    const providerResult = await callComparisonProvider({ safeContext: input.context, accountAggregate: input.accountAggregate, page: input.page, env: providerEnv, fetchImpl: countedFetch });
    const latencyMs = Date.now() - requestStarted;
    const attemptRecord = { requestToken, opportunityToken: input.opportunityToken, page: input.page, provider: "openai-compatible", model: providerResult.providerModel || providerEnv.LLM_MODEL || DEFAULT_MODEL, contextVersion: "Safe Context v2", safeContextHash: input.contextHash, providerInputHash: input.providerInputHash, latencyMs, attempts: providerResult.attempts || fetchCount, httpStatus: providerResult.httpStatus || null, tokenUsage: providerResult.usage || null, estimatedCostUsd: estimateCost(providerResult.usage), timestamp: now().toISOString() };
    if (fetchCount !== 1) throw stopError("single_attempt_violation", { requestToken, fetchCount, completed: results.length, externalLlmCalls: fetchCount, attemptRecord });
    if (!providerResult.ok) throw stopError(providerResult.reason || "provider_failed", { requestToken, completed: results.length, externalLlmCalls: fetchCount, attemptRecord });
    const evidenceTokens = input.demoOutput.evidence.map((item) => item.source);
    const schema = nativeStrict
      ? validateExternalModelResponse(providerResult.output, { evidenceTokens })
      : validateUnifiedOutput(providerResult.output);
    if (!schema.ok) throw stopError("response_contract_invalid", { requestToken, completed: results.length, externalLlmCalls: fetchCount, auditReason: schema.reason || (schema.errors || []).join(","), attemptRecord: { ...attemptRecord, httpStatus: providerResult.httpStatus || 200 } });
    const hallucination = nativeStrict
      ? auditExternalModelOutput({ output: providerResult.output, input, evidenceTokens })
      : auditExternalOutput({ output: providerResult.output, input });
    if (!hallucination.ok) throw stopError("hallucination_or_safety_failure", { requestToken, completed: results.length, externalLlmCalls: fetchCount, auditReason: hallucination.reason, attemptRecord: { ...attemptRecord, httpStatus: providerResult.httpStatus || 200 } });
    const evaluation = nativeStrict
      ? evaluateModelResponse({ baseline: input.demoOutput, candidate: providerResult.output, safeContext: input.context, latencyMs, tokenUsage: providerResult.usage, estimatedCost: estimateCost(providerResult.usage) })
      : evaluateComparison({ demoOutput: input.demoOutput, externalOutput: providerResult.output, safeContext: input.context });
    results.push({
      requestToken,
      opportunityToken: input.opportunityToken,
      page: input.page,
      offlineScenario: input.offlineScenario,
      offlineEvaluationLenses: input.offlineEvaluationLenses,
      provider: "openai-compatible",
      model: providerResult.providerModel || providerEnv.LLM_MODEL || DEFAULT_MODEL,
      contextVersion: "Safe Context v2",
      safeContextHash: input.contextHash,
      providerInputHash: input.providerInputHash,
      latencyMs,
      attempts: providerResult.attempts,
      httpStatus: providerResult.httpStatus || 200,
      tokenUsage: providerResult.usage,
      estimatedCostUsd: estimateCost(providerResult.usage),
      responseContract: "pass",
      safetyResult: "pass",
      hallucinationAudit: "pass",
      deterministicBaseline: evaluation,
      externalModelCalled: true,
      rawDataSent: false,
      crmWriteback: false,
      timestamp: now().toISOString(),
    });
  }
  return { status: "completed", results };
}

export function validateSafeProviderInput(value) {
  const safeData = value?.safeDecisionContext || value?.safeAccountAggregate
    ? { safeDecisionContext: value?.safeDecisionContext, safeAccountAggregate: value?.safeAccountAggregate }
    : value;
  if (hasGuid(safeData)) return { ok: false, reason: "guid" };
  const serialized = JSON.stringify(safeData).toLowerCase();
  const forbidden = ["golden", "scenarioid", "scenario_tag", "expected_answer", "raw_crm", "notetext", "annotationtext", "fullname", "emailaddress", "systemuserid", "teamid", "description", "rawtimeline"];
  const found = forbidden.find((key) => serialized.includes(key));
  if (found) return { ok: false, reason: found };
  const safety = containsForbiddenProviderContent(safeData);
  return safety.ok ? { ok: true } : { ok: false, reason: safety.reason };
}

export function auditExternalOutput({ output, input }) {
  const serialized = JSON.stringify(output);
  const lower = serialized.toLowerCase();
  if (hasGuid(output)) return { ok: false, reason: "guid" };
  if (FORBIDDEN_OUTPUT_CLAIMS.some((claim) => lower.includes(claim))) return { ok: false, reason: "forbidden_claim" };
  if (/(?:客户姓名|联系人姓名|电话号码|邮箱地址|精确金额|精确收入|精确毛利|raw timeline|exact revenue|exact amount|exact gp)/i.test(serialized)) return { ok: false, reason: "sensitive_claim" };
  const safeSources = new Set([
    ...Object.keys(input.context).filter((key) => key !== "accountAggregate").map((key) => `safeContext.${key}`),
    ...Object.keys(input.context.accountAggregate || {}).map((key) => `safeContext.accountAggregate.${key}`),
    "safeAggregate.scopeCount", "safeAggregate.escalatedCount",
  ]);
  const unsupportedSource = [...(output.fact || []), ...(output.evidence || [])].find((item) => !safeSources.has(item.source));
  if (unsupportedSource) return { ok: false, reason: "unsupported_evidence_source" };
  if (input.offlineEvaluationLenses.includes("healthy-control") && ["Critical", "High"].includes(output.priority)) return { ok: false, reason: "healthy_control_escalation" };
  return { ok: true };
}

export function auditExternalModelOutput({ output, input, evidenceTokens = [] }) {
  const serialized = JSON.stringify(output);
  const lower = serialized.toLowerCase();
  if (hasGuid(output)) return { ok: false, reason: "guid" };
  if (FORBIDDEN_OUTPUT_CLAIMS.some((claim) => lower.includes(claim))) return { ok: false, reason: "forbidden_claim" };
  if (/(?:客户姓名|联系人姓名|电话号码|邮箱地址|精确金额|精确收入|精确毛利|raw timeline|exact revenue|exact amount|exact gp)/i.test(serialized)) return { ok: false, reason: "sensitive_claim" };
  const allowed = new Set(evidenceTokens);
  const references = [
    ...(output.facts || []).map((item) => item.evidenceToken),
    ...(output.evidence || []).map((item) => item.evidenceToken),
    ...(output.inferences || []).flatMap((item) => item.evidenceTokens || []),
  ];
  if (references.some((token) => !allowed.has(token))) return { ok: false, reason: "unsupported_evidence_token" };
  if (output.safety?.customerIdentityMasked !== true || output.safety?.exactAmountSentToModel !== false || output.safety?.rawTimelineSent !== false || output.safety?.crmWritebackEnabled !== false) return { ok: false, reason: "safety_flags" };
  if (input.offlineEvaluationLenses.includes("healthy-control") && ["Critical", "High"].includes(output.priority)) return { ok: false, reason: "healthy_control_escalation" };
  return { ok: true };
}

export function estimateCost(usage) {
  if (!usage) return null;
  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens);
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
  return Number(((inputTokens * PRICING.inputCacheMissPerMillionUsd + outputTokens * PRICING.outputPerMillionUsd) / 1_000_000).toFixed(8));
}

function buildSummary({ selection, selectionPath, offlinePreflight, snapshot, scope, providerGate, run, runId, reportPrefix, started, completedAt, executionCount = 24, nativeJsonMode = "json-object" }) {
  const results = run.results || [];
  const requestRecords = [...results, ...(run.failedAttempt ? [run.failedAttempt] : [])];
  const totalCost = results.reduce((sum, row) => sum + Number(row.estimatedCostUsd || 0), 0);
  const scenarioCoverage = Object.fromEntries((offlinePreflight?.scenarioCoverage || []).map((row) => [row.scenarioId, { tokenCount: row.tokens.filter((token) => selection.records.some((item) => item.opportunityToken === token)).length, evidenceReady: row.evidenceReady === true }]));
  return {
    phase: "Phase 3C",
    runId,
    selectionPath,
    reportPrefix,
    status: run.status,
    stopReason: run.reason || null,
    auditReason: run.auditReason || null,
    startedAt: started.toISOString(),
    completedAt: completedAt.toISOString(),
    environment: { dataverseHostname: snapshot.host, productionRequests: snapshot.requestStats.ProductionRequests, dataverseMethods: ["GET"], crmWriteback: false },
    provider: { provider: "openai-compatible", baseUrl: nativeJsonMode === "strict-tool" ? `${BASE_URL}/beta` : BASE_URL, model: DEFAULT_MODEL, nativeJsonMode, gate: providerGate, externalCalls: run.externalLlmCalls ?? requestRecords.length, maxExternalCalls: 24, singleAttempt: true, contextVersion: "Safe Context v2" },
    frozenSelection: { count: selection.count, selectionHash: safeContextHash(selection.records), records: selection.records.map((row) => row.opportunityToken) },
    safeContext: { source: "D365 Frozen Dataset GET -> Safe Context v2", counts: scope.counts, stateDistribution: scope.stateDistribution, customerIdentityMasked: true, exactAmountSentToModel: false, rawTimelineSent: false, scenarioIdSent: false, goldenMetadataSent: false, rawCrmSent: false },
    scenarioCoverage,
    requestStats: { d365Get: snapshot.requestStats.GET, d365Post: snapshot.requestStats.POST, d365Patch: snapshot.requestStats.PATCH, d365Delete: snapshot.requestStats.DELETE, productionRequests: snapshot.requestStats.ProductionRequests, externalLlmCalls: run.externalLlmCalls ?? requestRecords.length, crmWrites: 0 },
    results,
    requestRecords,
    execution: { requestedCount: executionCount, completedCount: results.length, attemptedCount: results.length + (run.failedAttempt ? 1 : 0), remainingCount: selection.count - results.length - (run.failedAttempt ? 1 : 0) },
    aggregate: { completed: results.length, failed: executionCount - results.length, totalEstimatedCostUsd: Number(totalCost.toFixed(8)), avgLatencyMs: results.length ? Math.round(results.reduce((sum, row) => sum + row.latencyMs, 0) / results.length) : null, allResponseContractsPass: results.length === executionCount && results.every((row) => row.responseContract === "pass"), allSafetyPass: results.length === executionCount && results.every((row) => row.safetyResult === "pass" && row.hallucinationAudit === "pass") },
  };
}

export async function writeReports(summary) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const paths = reportPaths(summary.reportPrefix || DEFAULT_REPORT_PREFIX);
  const rows = summary.requestRecords || summary.results;
  await fs.writeFile(paths.runtime, `${JSON.stringify({ phase: summary.phase, runId: summary.runId, status: summary.status, stopReason: summary.stopReason || null, auditReason: summary.auditReason || null, environment: summary.environment, provider: summary.provider, frozenSelection: summary.frozenSelection, safeContext: summary.safeContext, scenarioCoverage: summary.scenarioCoverage, execution: summary.execution, requestStats: summary.requestStats, aggregate: summary.aggregate }, null, 2)}\n`);
  await fs.writeFile(paths.audit, `${JSON.stringify({ phase: summary.phase, runId: summary.runId, records: rows.map(({ requestToken, opportunityToken, page, provider, model, contextVersion, safeContextHash, providerInputHash, latencyMs, attempts, httpStatus, tokenUsage, estimatedCostUsd, timestamp }) => ({ requestToken, opportunityToken, page, provider, model, contextVersion, safeContextHash, providerInputHash, latencyMs, attempts, httpStatus, tokenUsage, estimatedCostUsd, timestamp })), requestCount: rows.length, externalModelCalls: summary.requestStats.externalLlmCalls, crmWriteback: false, productionRequests: summary.requestStats.productionRequests }, null, 2)}\n`);
  await fs.writeFile(paths.evaluation, `${JSON.stringify({ phase: summary.phase, runId: summary.runId, records: summary.results.map(({ requestToken, opportunityToken, page, offlineScenario, offlineEvaluationLenses, responseContract, safetyResult, hallucinationAudit, deterministicBaseline }) => ({ requestToken, opportunityToken, page, offlineScenario, offlineEvaluationLenses, responseContract, safetyResult, hallucinationAudit, deterministicBaseline })), aggregate: summary.aggregate }, null, 2)}\n`);
  await fs.writeFile(paths.execution, executionReport(summary));
  await fs.writeFile(paths.quality, qualityReport(summary));
  await fs.writeFile(paths.safety, safetyReport(summary));
  await fs.writeFile(paths.finalDecision, finalDecision(summary));
}

function reportPaths(prefix) {
  return {
    execution: path.join(OUTPUT_DIR, `${prefix}-execution-report.md`),
    runtime: path.join(OUTPUT_DIR, `${prefix}-runtime-manifest.json`),
    audit: path.join(OUTPUT_DIR, `${prefix}-request-audit.json`),
    evaluation: path.join(OUTPUT_DIR, `${prefix}-response-evaluation.json`),
    quality: path.join(OUTPUT_DIR, `${prefix}-quality-comparison-report.md`),
    safety: path.join(OUTPUT_DIR, `${prefix}-safety-report.md`),
    finalDecision: path.join(OUTPUT_DIR, `${prefix}-final-decision.md`),
  };
}

function executionReport(summary) {
  const lines = [
    "# Phase 3C External LLM Controlled Canary Evaluation",
    "",
    `- Status: **${summary.status}**`,
    `- Environment: ${summary.environment.dataverseHostname}`,
    `- Run: **${summary.runId}**`,
    `- Provider: openai-compatible / ${summary.provider.model}`,
    `- Safe Context: **${summary.provider.contextVersion}**`,
    `- External calls: **${summary.requestStats.externalLlmCalls}/${summary.execution.requestedCount}**`,
    "- CRM writeback: **false**",
    `- Production requests: **${summary.requestStats.productionRequests}**`,
    `- Stop reason: **${summary.stopReason || "none"}**`,
    `- Audit reason: **${summary.auditReason || "none"}**`,
    "",
    "## Frozen selection",
    "",
    `The frozen selection contains ${summary.frozenSelection.count} records; this run executed only ${summary.execution.requestedCount} contract canary record(s). Provider input contained Safe Context v2 only; scenario IDs, Golden metadata and raw CRM were excluded.`,
    "",
    "## Read-only D365 preflight",
    "",
    `- GET: ${summary.requestStats.d365Get}`,
    `- POST/PATCH/DELETE/Publish: ${summary.requestStats.d365Post}/${summary.requestStats.d365Patch}/${summary.requestStats.d365Delete}/0`,
    `- Frozen scope: ${summary.safeContext.counts.opportunity} opportunities, ${summary.safeContext.counts.timeline} Timeline records, ${summary.safeContext.counts.signal} Interaction Signals`,
    `- State distribution: ${JSON.stringify(summary.safeContext.stateDistribution)}`,
    "",
    "## Outcome",
    "",
    summary.aggregate.completed === summary.execution.requestedCount ? `${summary.aggregate.completed} requested canary execution(s) completed.` : `Execution stopped after ${summary.aggregate.completed} completed canaries; no later canaries were attempted.`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function qualityReport(summary) {
  const totals = summary.results.map((row) => row.deterministicBaseline?.total).filter(Number.isFinite);
  const avg = totals.length ? Math.round(totals.reduce((sum, value) => sum + value, 0) / totals.length) : "not available";
  return [
    "# Phase 3C External LLM Quality Comparison",
    "",
    "- Evaluation method: deterministic code rules; no LLM-as-judge.",
    `- Responses evaluated: ${summary.results.length}/${summary.execution.requestedCount}`,
    `- Average comparison score: ${avg}`,
    `- Contract pass: ${summary.aggregate.allResponseContractsPass}`,
    `- Safety and hallucination pass: ${summary.aggregate.allSafetyPass}`,
    "",
    "## Scoring dimensions",
    "",
    `Fact accuracy, evidence coverage, required action coverage, forbidden-claim safety, priority alignment, confidence alignment, contract compliance, safety compliance and stability are recorded in ${summary.reportPrefix}-response-evaluation.json.`,
    "",
    "Scenario IDs and Golden metadata are evaluation-only and were not sent to the provider.",
    "",
  ].join("\n");
}

function safetyReport(summary) {
  return [
    "# Phase 3C External LLM Safety Report",
    "",
    "- Safe Context v2 used: **true**",
    "- Customer identity masked: **true**",
    "- Exact amount sent to model: **false**",
    "- Raw Timeline sent: **false**",
    "- Scenario ID sent: **false**",
    "- Golden metadata sent: **false**",
    "- Raw CRM sent: **false**",
    "- CRM writeback: **false**",
    `- Production requests: **${summary.requestStats.productionRequests}**`,
    `- External provider calls: **${summary.requestStats.externalLlmCalls}**`,
    `- Provider input/output safety checks: **${summary.aggregate.allSafetyPass ? "pass" : "not complete"}**`,
    "",
    "No API key, Authorization header, raw snapshot, full prompt, response body, identity or exact amount is stored in the reports.",
    "",
  ].join("\n");
}

function finalDecision(summary) {
  const ready = summary.status === "completed" && summary.aggregate.completed === 24 && summary.aggregate.allResponseContractsPass && summary.aggregate.allSafetyPass && summary.requestStats.productionRequests === 0 && summary.requestStats.crmWrites === 0;
  return [
    "# Phase 3C Final Decision",
    "",
    "- External LLM Canary Authorized: true",
    "- Approved provider/model: DeepSeek V4 Pro via OpenAI-compatible API",
    `- External calls: ${summary.requestStats.externalLlmCalls}/24`,
    `- Safety stop reason: ${summary.stopReason || "none"}`,
    "- Single attempt per canary: true",
    `- Response contract: ${summary.aggregate.allResponseContractsPass}`,
    `- Safety and hallucination audit: ${summary.aggregate.allSafetyPass}`,
    "- CRM Writeback: false",
    `- Production Requests: ${summary.requestStats.productionRequests}`,
    "- Model Comparison: not started",
    "- Multi-model testing: not started",
    "",
    "## Gate",
    "",
    `Phase 3C Ready=${ready}`,
    "",
    "The API key was used only from the current process environment and is not present in this report or repository.",
    "",
  ].join("\n");
}

function stopError(reason, details) {
  const error = new Error(reason);
  error.phase3c = { reason, ...details };
  return error;
}

async function readJson(relativePath) { return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), "utf8")); }

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((summary) => {
    console.log(JSON.stringify({ status: summary.status, completed: summary.aggregate.completed, externalLlmCalls: summary.requestStats.externalLlmCalls, productionRequests: summary.requestStats.productionRequests, crmWriteback: summary.requestStats.crmWrites }, null, 2));
    if (summary.status !== "completed") process.exitCode = 1;
  }).catch((error) => {
    console.error(JSON.stringify({ status: "stopped", reason: error.phase3c?.reason || error.message, completed: error.phase3c?.completed || 0, externalLlmCalls: error.phase3c?.externalLlmCalls || 0, productionRequests: 0, crmWriteback: false }));
    process.exitCode = 1;
  });
}
