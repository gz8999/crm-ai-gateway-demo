import { createHash } from "node:crypto";

export const PROVIDER_SUCCESS_OBSERVABILITY_VERSION = "Provider Success Response Observability Contract v1";
export const STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES = Object.freeze({
  OUTPUT_TRUNCATED: "OUTPUT_TRUNCATED",
  TOOL_CALL_NOT_COMPLETED: "TOOL_CALL_NOT_COMPLETED",
  TOOL_CALL_SHAPE_INVALID: "TOOL_CALL_SHAPE_INVALID",
  TOOL_NAME_INVALID: "TOOL_NAME_INVALID",
  ARGUMENT_TYPE_INVALID: "ARGUMENT_TYPE_INVALID",
  ARGUMENT_EMPTY: "ARGUMENT_EMPTY",
  ARGUMENT_JSON_INVALID: "ARGUMENT_JSON_INVALID",
  ARGUMENT_SCHEMA_INVALID: "ARGUMENT_SCHEMA_INVALID",
});

export function parseProviderSuccessEnvelope(raw, {
  maxTokens = null,
  requestCorrelation = "not-issued",
  latencyMs = null,
  responseTimestamp = new Date().toISOString(),
} = {}) {
  const text = typeof raw === "string" ? raw : "";
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      envelope: null,
      observation: buildObservation({
        envelope: null,
        maxTokens,
        requestCorrelation,
        latencyMs,
        responseTimestamp,
        jsonParseErrorType: error?.name || "SyntaxError",
        jsonParseErrorPosition: parseErrorPosition(error),
      }),
    };
  }
  return {
    ok: true,
    envelope,
    observation: buildObservation({ envelope, maxTokens, requestCorrelation, latencyMs, responseTimestamp }),
  };
}

export function observeProviderSuccessResponse(raw, options = {}) {
  return parseProviderSuccessEnvelope(raw, options).observation;
}

export function publicProviderSuccessObservation(observation = {}) {
  return {
    providerSuccessObservabilityVersion: observation.providerSuccessObservabilityVersion || PROVIDER_SUCCESS_OBSERVABILITY_VERSION,
    httpStatus: finiteNumber(observation.httpStatus),
    choiceCount: finiteNumber(observation.choiceCount),
    selectedChoiceIndex: finiteNumber(observation.selectedChoiceIndex),
    finishReason: safeValue(observation.finishReason),
    messageContentPresent: observation.messageContentPresent === true,
    reasoningContentPresent: observation.reasoningContentPresent === true,
    toolCallsCount: finiteNumber(observation.toolCallsCount),
    toolCallType: safeValue(observation.toolCallType),
    functionName: safeValue(observation.functionName),
    argumentsRuntimeType: safeValue(observation.argumentsRuntimeType),
    argumentsLength: finiteNumber(observation.argumentsLength),
    argumentsSha256: sha256OrNull(observation.argumentsSha256),
    firstNonWhitespaceCharacterCategory: safeValue(observation.firstNonWhitespaceCharacterCategory),
    lastNonWhitespaceCharacterCategory: safeValue(observation.lastNonWhitespaceCharacterCategory),
    leftBraceCount: finiteNumber(observation.leftBraceCount),
    rightBraceCount: finiteNumber(observation.rightBraceCount),
    leftBracketCount: finiteNumber(observation.leftBracketCount),
    rightBracketCount: finiteNumber(observation.rightBracketCount),
    jsonParseErrorType: safeValue(observation.jsonParseErrorType),
    jsonParseErrorPosition: finiteNumber(observation.jsonParseErrorPosition),
    completionTokens: finiteNumber(observation.completionTokens),
    maxTokens: finiteNumber(observation.maxTokens),
    responseIdHash: typeof observation.responseId === "string" ? sha256(observation.responseId) : null,
    requestCorrelationHash: typeof observation.requestCorrelationToken === "string" ? sha256(observation.requestCorrelationToken) : null,
    latencyMs: finiteNumber(observation.latencyMs),
  };
}

export function extractStrictToolArguments(envelope, {
  toolName = "emit_decision_pack",
  observation = buildObservation({ envelope }),
} = {}) {
  const choice = Array.isArray(envelope?.choices) ? envelope.choices[0] : undefined;
  const message = choice?.message;
  const toolCalls = message?.tool_calls;
  const finishReason = choice?.finish_reason;
  if (finishReason === "length") return failure(STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.OUTPUT_TRUNCATED, observation);
  if (finishReason !== "tool_calls") return failure(STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.TOOL_CALL_NOT_COMPLETED, observation);
  if (!Array.isArray(toolCalls) || toolCalls.length !== 1) return failure(STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.TOOL_CALL_SHAPE_INVALID, observation);
  const toolCall = toolCalls[0];
  if (toolCall?.type !== "function" || !toolCall?.function || typeof toolCall.function !== "object") {
    return failure(STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.TOOL_CALL_SHAPE_INVALID, observation);
  }
  if (toolCall.function.name !== toolName) return failure(STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.TOOL_NAME_INVALID, observation);
  const argumentsValue = toolCall.function.arguments;
  if (typeof argumentsValue !== "string") return failure(STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.ARGUMENT_TYPE_INVALID, observation);
  const normalized = normalizeArguments(argumentsValue);
  if (!normalized) return failure(STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.ARGUMENT_EMPTY, observation);
  return { ok: true, category: null, argumentsText: argumentsValue, normalizedArguments: normalized, observation };
}

// Synthetic quarantine callers may observe the approved path without receiving a
// raw value from the general-purpose response observer. The callback is the
// only escape hatch and is never invoked for an invalid Tool Call shape.
export function inspectStrictToolArgumentPath(envelope, {
  toolName = "emit_decision_pack",
  onArguments = null,
} = {}) {
  const choice = Array.isArray(envelope?.choices) ? envelope.choices[0] : undefined;
  const message = choice?.message;
  const toolCalls = message?.tool_calls;
  const finishReason = choice?.finish_reason;
  if (finishReason !== "tool_calls") return { ok: false, reason: "finish_reason_not_tool_calls" };
  if (!Array.isArray(toolCalls) || toolCalls.length !== 1) return { ok: false, reason: "tool_call_shape_invalid" };
  const toolCall = toolCalls[0];
  if (toolCall?.type !== "function" || !toolCall?.function || typeof toolCall.function !== "object") return { ok: false, reason: "tool_call_shape_invalid" };
  if (toolCall.function.name !== toolName) return { ok: false, reason: "tool_name_invalid" };
  const argumentsValue = toolCall.function.arguments;
  if (typeof argumentsValue !== "string") return { ok: false, reason: "arguments_type_invalid", runtimeType: runtimeType(argumentsValue) };
  if (typeof onArguments === "function") onArguments(argumentsValue);
  return { ok: true, runtimeType: "string", length: argumentsValue.length };
}

export function parseStrictToolArguments(argumentsText, { observation = null, onParseFailure = null, onParseSuccess = null } = {}) {
  if (typeof argumentsText !== "string") return { ok: false, category: STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.ARGUMENT_TYPE_INVALID, value: null, observation };
  const normalized = normalizeArguments(argumentsText);
  if (!normalized) return { ok: false, category: STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.ARGUMENT_EMPTY, value: null, observation: withParseError(observation, null, null) };
  try {
    const value = JSON.parse(normalized);
    onParseSuccess?.({ value, normalizedArguments: normalized });
    return { ok: true, category: null, value, normalizedArguments: normalized, observation: withParseError(observation, null, null) };
  } catch (error) {
    onParseFailure?.({ error, normalizedArguments: normalized });
    return {
      ok: false,
      category: STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.ARGUMENT_JSON_INVALID,
      value: null,
      observation: withParseError(observation, error?.name || "SyntaxError", parseErrorPosition(error)),
    };
  }
}

export function buildObservation({
  envelope,
  maxTokens = null,
  requestCorrelation = "not-issued",
  latencyMs = null,
  responseTimestamp = new Date().toISOString(),
  jsonParseErrorType = null,
  jsonParseErrorPosition = null,
} = {}) {
  const choices = Array.isArray(envelope?.choices) ? envelope.choices : [];
  const choice = choices[0];
  const message = choice?.message;
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const toolCall = toolCalls[0];
  const argumentsValue = toolCall?.function?.arguments;
  const usage = envelope?.usage && typeof envelope.usage === "object" ? envelope.usage : {};
  return {
    providerSuccessObservabilityVersion: PROVIDER_SUCCESS_OBSERVABILITY_VERSION,
    httpStatus: null,
    choiceCount: choices.length,
    selectedChoiceIndex: choice ? 0 : null,
    finishReason: safeValue(choice?.finish_reason),
    messageContentPresent: Object.hasOwn(message || {}, "content"),
    reasoningContentPresent: Object.hasOwn(message || {}, "reasoning_content"),
    toolCallsCount: toolCalls.length,
    toolCallType: safeValue(toolCall?.type),
    functionName: safeValue(toolCall?.function?.name),
    argumentsRuntimeType: runtimeType(argumentsValue),
    argumentsLength: typeof argumentsValue === "string" ? argumentsValue.length : 0,
    argumentsSha256: typeof argumentsValue === "string" ? sha256(argumentsValue) : null,
    firstNonWhitespaceCharacterCategory: characterCategory(argumentsValue, "first"),
    lastNonWhitespaceCharacterCategory: characterCategory(argumentsValue, "last"),
    leftBraceCount: countCharacter(argumentsValue, "{"),
    rightBraceCount: countCharacter(argumentsValue, "}"),
    leftBracketCount: countCharacter(argumentsValue, "["),
    rightBracketCount: countCharacter(argumentsValue, "]"),
    jsonParseErrorType,
    jsonParseErrorPosition,
    completionTokens: finiteNumber(usage.completion_tokens ?? usage.output_tokens),
    maxTokens: finiteNumber(maxTokens),
    responseId: safeValue(envelope?.id),
    requestCorrelationToken: safeValue(requestCorrelation),
    responseTimestamp: String(responseTimestamp),
    latencyMs: finiteNumber(latencyMs),
  };
}

function failure(category, observation) { return { ok: false, category, argumentsText: null, normalizedArguments: null, observation }; }
function withParseError(observation, type, position) { return { ...(observation || {}), jsonParseErrorType: type, jsonParseErrorPosition: position }; }
function normalizeArguments(value) { return value.replace(/^\uFEFF/, "").trim(); }
function parseErrorPosition(error) {
  const match = String(error?.message || "").match(/(?:position|column)\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}
function runtimeType(value) { return value === null ? "null" : typeof value; }
function finiteNumber(value) { return value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null; }
function safeValue(value) { return typeof value === "string" ? value.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 120) : null; }
function countCharacter(value, character) { return typeof value === "string" ? [...value].filter((item) => item === character).length : 0; }
function characterCategory(value, position) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const character = position === "last" ? trimmed.at(-1) : trimmed[0];
  if (character === "{") return "left-brace";
  if (character === "}") return "right-brace";
  if (character === "[") return "left-bracket";
  if (character === "]") return "right-bracket";
  if (character === '"') return "quote";
  if (/\d/.test(character)) return "digit";
  if (/[A-Za-z]/.test(character)) return "ascii-letter";
  if (/\p{L}/u.test(character)) return "letter";
  return "other";
}
function sha256(value) { return createHash("sha256").update(String(value), "utf8").digest("hex"); }
function sha256OrNull(value) { return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : null; }
