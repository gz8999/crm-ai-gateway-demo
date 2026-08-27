import { validateManagementPayload } from "../management.mjs";
import { validateSafePayload } from "../gateway.mjs";
import { DEMO_PROVIDER, generateDemoChatAnswer, generateDemoResponse } from "./demoProvider.mjs";
import { buildProviderContext, validateSafeContext } from "./contextBuilder.mjs";
import { resolveProviderStatus, runProviderCompletion } from "./providers/providerRouter.mjs";

export const DEFAULT_LANGUAGE = "zh-CN";
export const DEFAULT_LLM_PROVIDER = "demo";

export async function runAi({
  functionName,
  safePayload = {},
  role = "Sales Owner",
  opportunity_id = "",
  language = DEFAULT_LANGUAGE,
  provider = process.env.AI_PROVIDER || DEFAULT_LLM_PROVIDER,
  env = process.env,
  fetchImpl = globalThis.fetch,
  minimalJson = false,
} = {}) {
  const providerEnv = { ...env, AI_PROVIDER: provider || env.AI_PROVIDER };
  const providerStatus = resolveProviderStatus(providerEnv);
  const validation = functionName === "management-summary"
    ? validateManagementPayload(safePayload)
    : validateSafePayload(safePayload);

  if (!validation.ok) {
    return {
      result: {
        blocked: true,
        error: validation.reason,
        provider: DEMO_PROVIDER,
        external_model_called: false,
        language: language || DEFAULT_LANGUAGE,
      },
      audit: auditMetadata({
        role,
        opportunity_id,
        functionName,
        status: "blocked",
        blocked_reason: validation.reason,
        provider: DEMO_PROVIDER,
        providerAudit: {
          provider_requested: providerStatus.providerRequested || provider,
          provider_used: DEMO_PROVIDER,
          external_model_called: false,
          fallback_used: false,
          fallback_reason: "",
          raw_data_sent: false,
          safe_context_used: true,
          safe_payload_keys: Object.keys(safePayload),
          safe_payload_char_count: JSON.stringify(safePayload || {}).length,
          response_char_count: 0,
          request_id: "",
          duration_ms: 0,
          timeout_ms: Number(providerEnv.LLM_TIMEOUT_MS || 20000),
          language: language || DEFAULT_LANGUAGE,
          output_guard_status: "blocked",
        },
      }),
    };
  }

  const routed = await runProviderCompletion({
    functionName,
    safePayload,
    language: language || DEFAULT_LANGUAGE,
    env: providerEnv,
    fetchImpl,
    minimalJson,
    demoFallback: () => generateDemoResponse({
      functionName,
      payload: safePayload,
      language: language || DEFAULT_LANGUAGE,
    }),
  });

  return {
    result: routed.result,
    audit: auditMetadata({
      role,
      opportunity_id,
      functionName,
      status: routed.result.blocked ? "blocked" : "generated",
      blocked_reason: routed.result.error || "",
      provider: routed.result.provider || DEMO_PROVIDER,
      output_summary: routed.result.output?.slice(0, 140) || "",
      used_payload_keys: routed.result.usedPayloadKeys || Object.keys(safePayload),
      providerAudit: routed.audit,
    }),
  };
}

export async function runAiDemoChat({
  question = "",
  context = {},
  role = "management",
  language = DEFAULT_LANGUAGE,
  provider = process.env.AI_PROVIDER || DEFAULT_LLM_PROVIDER,
  env = process.env,
  fetchImpl = globalThis.fetch,
  minimalJson = false,
} = {}) {
  const providerEnv = { ...env, AI_PROVIDER: provider || env.AI_PROVIDER };
  const providerStatus = resolveProviderStatus(providerEnv);
  const providerContext = buildProviderContext(context);
  const validation = validateSafeContext(providerContext);
  const providerPayload = { safeOpportunityContext: providerContext.safeOpportunityContext };
  if (!validation.ok) {
    return {
      result: {
        blocked: true,
        answer: "",
        error: validation.reason,
        provider: DEMO_PROVIDER,
        external_model_called: false,
        language: language || DEFAULT_LANGUAGE,
      },
      audit: auditMetadata({
        role,
        opportunity_id: "ai-demo-chat",
        functionName: "ai-demo-chat",
        status: "blocked",
        blocked_reason: validation.reason,
        provider: DEMO_PROVIDER,
        providerAudit: {
          provider_requested: providerStatus.providerRequested || provider,
          provider_used: DEMO_PROVIDER,
          external_model_called: false,
          fallback_used: false,
          fallback_reason: "",
          raw_data_sent: false,
          safe_context_used: true,
          safe_payload_keys: ["safeOpportunityContext"],
          safe_payload_char_count: JSON.stringify(providerPayload).length,
          response_char_count: 0,
          request_id: "",
          duration_ms: 0,
          timeout_ms: Number(providerEnv.LLM_TIMEOUT_MS || 20000),
          language: language || DEFAULT_LANGUAGE,
          output_guard_status: "blocked",
        },
      }),
    };
  }

  const routed = await runProviderCompletion({
    functionName: "ai-demo-chat",
    safePayload: providerPayload,
    question,
    language: language || DEFAULT_LANGUAGE,
    env: providerEnv,
    fetchImpl,
    minimalJson,
    demoFallback: () => generateDemoChatAnswer({
      question,
      context: providerPayload,
      language: language || DEFAULT_LANGUAGE,
    }),
  });
  const result = routed.result;
  return {
    result,
    audit: auditMetadata({
      role,
      opportunity_id: "ai-demo-chat",
      functionName: "ai-demo-chat",
      status: result.blocked ? "blocked" : "generated",
      blocked_reason: result.error || "",
      provider: result.provider || DEMO_PROVIDER,
      output_summary: (result.answer || result.output || "").slice(0, 140),
      used_payload_keys: result.usedPayloadKeys || ["safeOpportunityContext"],
      context_source: context.contextSummary?.data_source || "mock",
      providerAudit: routed.audit,
    }),
  };
}

function auditMetadata({
  role,
  opportunity_id,
  functionName,
  status,
  blocked_reason = "",
  provider,
  output_summary = "",
  used_payload_keys = [],
  context_source = "",
  providerAudit = {},
}) {
  return {
    type: "ai_call",
    role,
    opportunity_id: opportunity_id || (functionName === "management-summary" ? "management-dashboard" : ""),
    intent: functionName,
    functionName,
    status,
    blocked_reason,
    removed_fields: [],
    safe_payload_keys: used_payload_keys,
    context_source,
    provider,
    external_model_called: false,
    output_summary,
    ...providerAudit,
  };
}
