import { randomUUID } from "node:crypto";
import { resolveProviderStatus } from "../ai/providers/providerRouter.mjs";
import { getDecisionView } from "./decisionService.mjs";
import { COMPARISON_PAGES, UNIFIED_OUTPUT_SCHEMA_VERSION, validateUnifiedOutput } from "./comparisonSchema.mjs";
import { evaluateComparison, safeContextHash } from "./comparisonEvaluation.mjs";
import { callComparisonProvider } from "./comparisonProvider.mjs";

export function createComparisonHarness({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const results = new Map();
  const signatures = new Map();
  const audit = [];

  function status() {
    const provider = resolveProviderStatus(env);
    const featureEnabled = String(env.FEATURE_MODEL_COMPARISON).toLowerCase() === "true";
    return {
      featureEnabled,
      available: featureEnabled && provider.provider === "openai-compatible" && provider.externalAiEnabled && provider.configured,
      provider: provider.provider,
      providerRequested: provider.providerRequested,
      configured: provider.configured,
      externalAiEnabled: provider.externalAiEnabled,
      model: env.LLM_MODEL || "",
      fallbackReason: featureEnabled ? provider.fallbackReason || "" : "FEATURE_MODEL_COMPARISON is not true.",
      schemaVersion: UNIFIED_OUTPUT_SCHEMA_VERSION,
    };
  }

  async function compare({ scenarioId, opportunityToken, page, confirmed, signal } = {}) {
    const started = Date.now();
    const requestId = randomUUID();
    const gate = status();
    if (!confirmed) return fallback({ requestId, reason: "explicit_confirmation_required", gate, started });
    if (!gate.available) return fallback({ requestId, reason: gate.fallbackReason || "comparison_unavailable", gate, started });
    if (!COMPARISON_PAGES.includes(page)) return fallback({ requestId, reason: "invalid_comparison_page", gate, started });
    let view;
    try { view = getDecisionView({ mode: "scenario", scenarioId, opportunityToken }); } catch { return fallback({ requestId, reason: "invalid_comparison_scope", gate, started }); }
    if (!view) return fallback({ requestId, reason: "comparison_opportunity_not_found", gate, started });
    const demoOutput = view.pack[page];
    const contextHash = safeContextHash({ safeContext: view.safeContext, accountAggregate: view.safeContext.accountAggregate });
    const providerResult = await callComparisonProvider({ safeContext: view.safeContext, accountAggregate: view.safeContext.accountAggregate, page, env, fetchImpl, signal, requestCorrelation: requestId });
    if (!providerResult.ok) return fallback({ requestId, reason: providerResult.reason, gate, started, contextHash, externalCalled: providerResult.called, demoOutput, scenarioScopeCount: view.scopeSummary.scopeCount, schemaStatus: "not-run", safetyStatus: providerResult.safetyStatus, errorObservation: providerResult.errorObservation || null });
    const schema = validateUnifiedOutput(providerResult.output);
    if (!schema.ok) return fallback({ requestId, reason: schema.reason, gate, started, contextHash, externalCalled: true, demoOutput, scenarioScopeCount: view.scopeSummary.scopeCount, schemaStatus: schema.status, safetyStatus: providerResult.safetyStatus });
    if (demoOutput.priority === "Monitor" && ["Critical", "High"].includes(providerResult.output.priority)) return fallback({ requestId, reason: "healthy_control_escalation", gate, started, contextHash, externalCalled: true, demoOutput, scenarioScopeCount: view.scopeSummary.scopeCount, schemaStatus: "pass", safetyStatus: "pass" });
    const signatureKey = `${contextHash}|${page}|${gate.model}`;
    const evaluation = evaluateComparison({ demoOutput, externalOutput: providerResult.output, safeContext: view.safeContext, previousSignature: signatures.get(signatureKey) || "" });
    signatures.set(signatureKey, evaluation.signature);
    const result = {
      requestId, status: "completed", page, opportunityToken, demoOutput,
      externalOutput: { ...providerResult.output, providerUsed: "openai-compatible", fallbackReason: "", safeContextUsed: true, externalModelCalled: true, rawDataSent: false },
      provider: "openai-compatible", model: gate.model, latencyMs: Date.now() - started,
      schemaStatus: "pass", safetyStatus: "pass", citationStatus: citationStatus(providerResult.output), fallbackReason: "", evaluation: { scores: evaluation.scores, total: evaluation.total },
    };
    results.set(requestId, result);
    pushAudit({ requestId, contextHash, gate, scopeCount: view.scopeSummary.scopeCount, result, started });
    return result;
  }

  function fallback({ requestId, reason, gate, started, contextHash = "not-created", externalCalled = false, demoOutput = null, scenarioScopeCount = 0, schemaStatus = "not-run", safetyStatus = "not-run", errorObservation = null }) {
    const result = { requestId, status: "fallback_demo", demoOutput, externalOutput: null, provider: "demo", model: gate.model || "", latencyMs: Date.now() - started, schemaStatus, safetyStatus, citationStatus: "not-run", fallbackReason: publicReason(reason), evaluation: null, externalModelCalled: externalCalled, errorObservation };
    results.set(requestId, result);
    pushAudit({ requestId, contextHash, gate, scopeCount: scenarioScopeCount, result, started });
    return result;
  }

  function pushAudit({ requestId, contextHash, gate, scopeCount, result, started }) {
    audit.unshift({ requestId, safeContextHash: contextHash, provider: result.provider, model: gate.model || "", scopeCount, latencyMs: Date.now() - started, schemaStatus: result.schemaStatus, safetyStatus: result.safetyStatus, citationStatus: result.citationStatus, fallbackReason: result.fallbackReason, evaluationScore: result.evaluation?.total ?? null, errorObservation: result.errorObservation || null, timestamp: now().toISOString() });
    if (audit.length > 50) audit.length = 50;
  }

  return { status, compare, reset: () => { results.clear(); audit.length = 0; }, listAudit: () => audit.map((item) => ({ ...item })), getResult: (id) => results.get(id) || null };
}

function citationStatus(output) { return [...output.fact, ...output.evidence].every((item) => /^safe(Context|Aggregate)\./.test(item.source)) ? "pass" : "fail"; }
function publicReason(reason) {
  const labels = { provider_unauthorized: "外部模型认证失败", provider_rate_limited: "外部模型请求受限", provider_unavailable: "外部模型暂不可用", provider_timeout: "外部模型请求超时", provider_network_error: "外部模型网络错误", provider_response_not_json: "外部模型响应格式无效", output_not_json: "外部模型输出不是 JSON", output_contract_invalid: "外部输出未通过结构校验", sensitive_output_rejected: "外部输出未通过安全校验", response_too_large: "外部响应超过安全限制", request_cancelled: "用户已取消对比", explicit_confirmation_required: "需要用户主动确认", invalid_comparison_page: "无效的对比页面", invalid_comparison_scope: "无效的对比范围", comparison_opportunity_not_found: "脱敏商机不在当前范围", safe_context_rejected: "Safe Context 未通过安全校验", healthy_control_escalation: "健康对照不得升级为高风险" };
  if (labels[reason]) return labels[reason];
  if (String(reason).startsWith("missing_")) return "外部输出未通过结构校验";
  if (String(reason).startsWith("FEATURE_") || String(reason).includes("AI_PROVIDER") || String(reason).includes("ALLOW_EXTERNAL_AI") || String(reason).includes("Missing external")) return "外部模型对比未启用或配置不完整";
  return "外部模型对比未完成，已安全回退 Demo";
}
