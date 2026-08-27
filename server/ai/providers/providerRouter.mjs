import { DEMO_PROVIDER } from "../demoProvider.mjs";
import { providerAuditMetadata } from "./auditLogger.mjs";
import { callOpenAiCompatibleProvider } from "./openaiCompatibleProvider.mjs";
import { guardProviderOutput, renderGuardedOutput } from "./outputGuard.mjs";
import { buildProviderPromptPayload } from "./promptBuilder.mjs";

export const OPENAI_COMPATIBLE_PROVIDER = "openai-compatible";

export function resolveProviderStatus(env = process.env) {
  const requested = env.AI_PROVIDER || DEMO_PROVIDER;
  if (requested !== OPENAI_COMPATIBLE_PROVIDER) {
    return {
      provider: DEMO_PROVIDER,
      providerRequested: requested,
      externalAiEnabled: false,
      configured: false,
      safeContextOnly: true,
      rawDataSent: false,
      fallbackReason: "AI_PROVIDER is not openai-compatible.",
    };
  }
  if (String(env.ALLOW_EXTERNAL_AI).toLowerCase() !== "true") {
    return {
      provider: DEMO_PROVIDER,
      providerRequested: requested,
      externalAiEnabled: false,
      configured: false,
      safeContextOnly: true,
      rawDataSent: false,
      fallbackReason: "ALLOW_EXTERNAL_AI is not true.",
    };
  }
  const missing = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"].filter((key) => !env[key]);
  if (missing.length > 0) {
    return {
      provider: DEMO_PROVIDER,
      providerRequested: requested,
      externalAiEnabled: false,
      configured: false,
      safeContextOnly: true,
      rawDataSent: false,
      fallbackReason: `Missing external LLM config: ${missing.join(", ")}`,
    };
  }
  return {
    provider: OPENAI_COMPATIBLE_PROVIDER,
    providerRequested: requested,
    externalAiEnabled: true,
    configured: true,
    safeContextOnly: true,
    rawDataSent: false,
    fallbackReason: "",
  };
}

export async function runProviderCompletion({
  functionName,
  safePayload = {},
  question = "",
  language = "zh-CN",
  env = process.env,
  demoFallback,
  fetchImpl = globalThis.fetch,
  minimalJson = false,
} = {}) {
  const started = Date.now();
  const timeoutMs = Number(env.LLM_TIMEOUT_MS || 20000);
  const status = resolveProviderStatus(env);
  const promptPayload = buildProviderPromptPayload({ safePayload, language, functionName, question, minimalJson });
  const safePayloadCharCount = JSON.stringify(promptPayload.providerPayload || {}).length;

  if (status.provider !== OPENAI_COMPATIBLE_PROVIDER || !promptPayload.validation.ok) {
    const reason = promptPayload.validation.ok ? status.fallbackReason : promptPayload.validation.reason;
    return fallbackResult({ demoFallback, functionName, language, status, reason, started, timeoutMs, safePayloadKeys: promptPayload.safePayloadKeys, safePayloadCharCount, blockedPatternKey: promptPayload.validation.blockedPatternKey });
  }

  const providerResponse = await callOpenAiCompatibleProvider({ messages: promptPayload.messages, env, fetchImpl });
  if (providerResponse.error) {
    return fallbackResult({
      demoFallback,
      functionName,
      language,
      status,
      reason: providerResponse.error,
      started,
      timeoutMs,
      safePayloadKeys: promptPayload.safePayloadKeys,
      safePayloadCharCount,
      externalModelCalled: true,
      responseFormatRequested: providerResponse.responseFormatRequested,
      responseFormatRetryUsed: providerResponse.responseFormatRetryUsed,
      externalResponsePreviewSanitized: providerResponse.responsePreviewSanitized,
      externalResponseParseError: providerResponse.parseError,
    });
  }

  const guarded = guardProviderOutput(providerResponse.content);
  if (!guarded.ok) {
    return fallbackResult({
      demoFallback,
      functionName,
      language,
      status,
      reason: guarded.reason,
      started,
      timeoutMs,
      safePayloadKeys: promptPayload.safePayloadKeys,
      safePayloadCharCount,
      externalModelCalled: true,
      outputGuardStatus: guarded.status,
      responseFormatRequested: providerResponse.responseFormatRequested,
      responseFormatRetryUsed: providerResponse.responseFormatRetryUsed,
      externalResponsePreviewSanitized: providerResponse.responsePreviewSanitized,
      externalResponseParseError: guarded.reason,
      blockedPatternKey: guarded.blockedPatternKey,
    });
  }

  const output = renderGuardedOutput(guarded.value);
  const durationMs = Date.now() - started;
  return {
    result: {
      blocked: false,
      mode: "External AI",
      provider: OPENAI_COMPATIBLE_PROVIDER,
      external_model_called: true,
      language,
      functionName,
      title: guarded.value.summary || "AI Insight",
      output,
      answer: output,
      jsonOutput: guarded.value,
      usedPayloadKeys: promptPayload.safePayloadKeys,
    },
    audit: providerAuditMetadata({
      providerRequested: status.providerRequested,
      providerUsed: OPENAI_COMPATIBLE_PROVIDER,
      externalModelCalled: true,
      fallbackUsed: false,
      safePayloadKeys: promptPayload.safePayloadKeys,
      safePayloadCharCount,
      responseCharCount: String(providerResponse.content || "").length,
      durationMs,
      timeoutMs,
      language,
      outputGuardStatus: "pass",
      responseFormatRequested: providerResponse.responseFormatRequested,
      responseFormatRetryUsed: providerResponse.responseFormatRetryUsed,
      externalResponsePreviewSanitized: providerResponse.responsePreviewSanitized,
      externalResponseParseError: "",
    }),
  };
}

function fallbackResult({
  demoFallback,
  functionName,
  language,
  status,
  reason,
  started,
  timeoutMs,
  safePayloadKeys = [],
  safePayloadCharCount = 0,
  externalModelCalled = false,
  outputGuardStatus = "fallback",
  responseFormatRequested = false,
  responseFormatRetryUsed = false,
  externalResponsePreviewSanitized = "",
  externalResponseParseError = "",
  blockedPatternKey = "",
}) {
  const fallback = demoFallback();
  return {
    result: {
      ...fallback,
      provider: DEMO_PROVIDER,
      external_model_called: false,
      language,
      functionName,
    },
    audit: providerAuditMetadata({
      providerRequested: status.providerRequested || status.provider || DEMO_PROVIDER,
      providerUsed: DEMO_PROVIDER,
      externalModelCalled,
      fallbackUsed: Boolean(reason && status.providerRequested === OPENAI_COMPATIBLE_PROVIDER),
      fallbackReason: reason || "",
      safePayloadKeys: safePayloadKeys.length > 0 ? safePayloadKeys : fallback.usedPayloadKeys || [],
      safePayloadCharCount,
      responseCharCount: String(fallback.output || fallback.answer || "").length,
      durationMs: Date.now() - started,
      timeoutMs,
      language,
      outputGuardStatus,
      blockedReason: "",
      responseFormatRequested,
      responseFormatRetryUsed,
      externalResponsePreviewSanitized,
      externalResponseParseError,
      blockedPatternKey,
    }),
  };
}
