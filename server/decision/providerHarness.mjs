import { randomUUID } from "node:crypto";
import { buildScenarioDecisionPack } from "./deterministicProvider.mjs";

export const PROVIDER_NAMES = Object.freeze(["deterministic", "openai-compatible", "azure-openai", "anthropic-compatible", "disabled-external"]);

export function createDecisionProvider({ name = "deterministic", env = process.env, externalCanaryAuthorized = false } = {}) {
  if (name === "deterministic") return deterministicProvider();
  if (!PROVIDER_NAMES.includes(name)) throw new TypeError(`Unknown DecisionProvider: ${name}`);
  return disabledExternalProvider({ name, env, externalCanaryAuthorized });
}

export function providerHarnessStatus({ env = process.env, externalCanaryAuthorized = false } = {}) {
  return {
    provider: "deterministic",
    deterministicEnabled: true,
    externalProvidersEnabled: false,
    externalCanaryAuthorized: Boolean(externalCanaryAuthorized),
    externalModelCalled: false,
    crmWritebackEnabled: false,
    rawDataSent: false,
    fallbackReason: "External LLM Canary is not authorized in Goal 3B.",
    configuredExternalProvider: Boolean(env.AI_MODEL || env.LLM_BASE_URL || env.LLM_API_KEY),
  };
}

function deterministicProvider() {
  return {
    name: "deterministic",
    enabled: true,
    external: false,
    async complete({ contexts, selectedContext, requestId = randomUUID(), signal } = {}) {
      if (signal?.aborted) return rejected("request_cancelled", requestId);
      if (!Array.isArray(contexts) || !selectedContext) return rejected("safe_context_required", requestId);
      const pack = buildScenarioDecisionPack(contexts, selectedContext);
      return { ok: true, provider: "deterministic", model: "health-score-rules-v1", requestId, pack, metadata: metadata({ requestId, provider: "deterministic", fallbackReason: "", latencyMs: 0 }) };
    },
  };
}

function disabledExternalProvider({ name, externalCanaryAuthorized }) {
  return {
    name,
    enabled: false,
    external: true,
    async complete({ requestId = randomUUID() } = {}) {
      return rejected(externalCanaryAuthorized ? "external_provider_disabled_for_goal" : "external_canary_not_authorized", requestId, name);
    },
  };
}

function rejected(reason, requestId, provider = "deterministic") {
  return { ok: false, provider, model: "", requestId, error: reason, metadata: metadata({ requestId, provider, fallbackReason: reason, latencyMs: 0 }) };
}

function metadata({ requestId, provider, fallbackReason, latencyMs }) {
  return { requestId, provider, modelVersion: provider === "deterministic" ? "health-score-rules-v1" : "not-executed", tokenUsage: null, estimatedCost: null, latencyMs, safetyStatus: "safe", retryPolicy: { maxRetries: 0, retryable: false }, fallbackReason, externalModelCalled: false, crmWritebackEnabled: false };
}
