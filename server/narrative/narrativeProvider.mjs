import { createHash } from "node:crypto";
import { observeProviderError } from "../decision/providerErrorObservability.mjs";
import {
  buildDemoNarrativeRequest,
  DEMO_NARRATIVE_TOOL_NAME,
  narrativeRequestHash,
  validateNarrativeProviderInput,
  validateDemoNarrative,
} from "./narrativeContract.mjs";

export async function callDemoNarrativeProvider({ providerInput, evidenceAliases, env = process.env, fetchImpl = globalThis.fetch, requestCorrelation = "not-issued" } = {}) {
  const inputValidation = validateInput(providerInput, evidenceAliases);
  if (!inputValidation.ok) return { ok: false, called: false, reason: "narrative_input_rejected", errors: inputValidation.errors };
  const body = buildDemoNarrativeRequest({ providerInput, evidenceAliases, env });
  const requestBodyHash = narrativeRequestHash(body);
  const requestSchemaHash = narrativeRequestHash(body.tools[0].function.parameters);
  const baseUrl = String(env.LLM_BASE_URL || "").replace(/\/$/u, "");
  if (!baseUrl || !env.LLM_API_KEY || String(env.ALLOW_EXTERNAL_AI).toLowerCase() !== "true") {
    return { ok: false, called: false, reason: "narrative_provider_not_authorized", requestBodyHash, requestSchemaHash };
  }
  const timeoutMs = boundedNumber(env.LLM_TIMEOUT_MS, 60000, 100, 60000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify(body),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const errorObservation = await observeProviderError(response, {
        requestCorrelation,
        endpointAlias: "deepseek-beta",
        modelAlias: env.LLM_MODEL || "deepseek-v4-pro",
        requestSchemaHash,
        requestBodyHash,
      });
      return { ok: false, called: true, httpStatus: response.status, reason: `provider_http_${response.status}`, errorObservation, requestBodyHash, requestSchemaHash, latencyMs };
    }
    const rawResponse = await response.text();
    const responseBodyHash = sha256(rawResponse);
    let envelope;
    try { envelope = JSON.parse(rawResponse); } catch { return { ok: false, called: true, httpStatus: response.status, reason: "provider_response_not_json", responseBodyHash, requestBodyHash, requestSchemaHash, latencyMs }; }
    const choices = Array.isArray(envelope?.choices) ? envelope.choices : [];
    const message = choices[0]?.message;
    const toolCalls = message?.tool_calls;
    const functionCall = Array.isArray(toolCalls) ? toolCalls[0]?.function : null;
    const observation = {
      httpStatus: response.status,
      choiceCount: choices.length,
      finishReason: choices[0]?.finish_reason || "",
      toolCallsCount: Array.isArray(toolCalls) ? toolCalls.length : 0,
      toolCallType: toolCalls?.[0]?.type || "",
      functionName: functionCall?.name || "",
      argumentsType: typeof functionCall?.arguments,
      argumentsLength: typeof functionCall?.arguments === "string" ? functionCall.arguments.length : 0,
      argumentsHash: typeof functionCall?.arguments === "string" ? sha256(functionCall.arguments) : "",
      responseBodyHash,
      responseId: typeof envelope?.id === "string" ? envelope.id : "",
      latencyMs,
      tokenUsage: sanitizeUsage(envelope?.usage),
    };
    if (observation.finishReason !== "tool_calls") return { ok: false, called: true, reason: "tool_call_not_completed", diagnosticCategory: "TOOL_CALL_NOT_COMPLETED", observation, requestBodyHash, requestSchemaHash };
    if (!Array.isArray(toolCalls) || toolCalls.length !== 1 || observation.toolCallType !== "function") return { ok: false, called: true, reason: "tool_call_shape_invalid", diagnosticCategory: "TOOL_CALL_SHAPE_INVALID", observation, requestBodyHash, requestSchemaHash };
    if (observation.functionName !== DEMO_NARRATIVE_TOOL_NAME) return { ok: false, called: true, reason: "tool_name_invalid", diagnosticCategory: "TOOL_NAME_INVALID", observation, requestBodyHash, requestSchemaHash };
    if (observation.argumentsType !== "string" || !functionCall.arguments.trim()) return { ok: false, called: true, reason: observation.argumentsType !== "string" ? "argument_type_invalid" : "argument_empty", diagnosticCategory: observation.argumentsType !== "string" ? "ARGUMENT_TYPE_INVALID" : "ARGUMENT_EMPTY", observation, requestBodyHash, requestSchemaHash };
    let selection;
    try { selection = JSON.parse(functionCall.arguments.replace(/^\uFEFF/u, "").trim()); } catch { return { ok: false, called: true, reason: "argument_json_invalid", diagnosticCategory: "ARGUMENT_JSON_INVALID", observation, requestBodyHash, requestSchemaHash }; }
    const validation = validateDemoNarrative(selection, { evidenceAliases });
    if (!validation.ok) return { ok: false, called: true, reason: "argument_schema_invalid", diagnosticCategory: "ARGUMENT_SCHEMA_INVALID", observation, validation, requestBodyHash, requestSchemaHash };
    return { ok: true, called: true, selection, validation, observation, requestBodyHash, requestSchemaHash };
  } catch (error) {
    return { ok: false, called: true, reason: error?.name === "AbortError" ? "provider_timeout" : "provider_network_error", requestBodyHash, requestSchemaHash, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function validateInput(input, aliases) {
  if (!input || typeof input !== "object" || !Array.isArray(aliases) || aliases.length === 0) return { ok: false, errors: ["missing_input_or_evidence"] };
  const validation = validateNarrativeProviderInput(input);
  return validation.ok ? validation : { ok: false, errors: validation.errors };
}
function sanitizeUsage(value) { if (!value || typeof value !== "object") return null; const keys = ["prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens"]; const output = Object.fromEntries(keys.filter((key) => Number.isFinite(Number(value[key]))).map((key) => [key, Number(value[key])])); return Object.keys(output).length ? output : null; }
function sha256(value) { return createHash("sha256").update(String(value), "utf8").digest("hex"); }
function boundedNumber(value, fallback, min, max) { const n = Number(value || fallback); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
