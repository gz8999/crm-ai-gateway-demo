import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import {
  STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES,
  extractStrictToolArguments,
  observeProviderSuccessResponse,
  parseProviderSuccessEnvelope,
  parseStrictToolArguments,
} from "../server/decision/providerSuccessObservability.mjs";

const env = {
  AI_PROVIDER: "openai-compatible",
  ALLOW_EXTERNAL_AI: "true",
  LLM_BASE_URL: "https://api.deepseek.com/beta",
  LLM_MODEL: "deepseek-v4-pro",
  LLM_API_KEY: "synthetic-only",
  LLM_MAX_TOKENS: "1200",
  PHASE3C_NATIVE_JSON_MODE: "strict-tool",
};

const validArguments = {
  facts: [{ label: "Synthetic fact", value: "Monitor", evidenceToken: "SYN-EVID-001" }],
  inferences: [{ inference: "Synthetic inference", evidenceTokens: ["SYN-EVID-001"] }],
  evidence: [{ evidenceToken: "SYN-EVID-001", value: "Synthetic evidence" }],
  confidence: { level: "High", reason: "Synthetic only" },
  recommendedActions: [{ action: "Review", ownerRole: "synthetic-owner", dueWindow: "synthetic-window", basis: "SYN-EVID-001", draftStatus: "Draft only" }],
  priority: "Monitor",
  riskCategories: [],
  provider: "openai-compatible",
  model: "deepseek-v4-pro",
  modelVersion: "deepseek-v4-pro",
  fallback: { state: "not_applicable", reason: "Synthetic only" },
  safety: { customerIdentityMasked: true, exactAmountSentToModel: false, rawTimelineSent: false, crmWritebackEnabled: false },
  limitations: ["Synthetic only"],
};

function toolCall(argumentsValue = JSON.stringify(validArguments), { type = "function", name = "emit_decision_pack" } = {}) {
  return { type, function: { name, arguments: argumentsValue } };
}

function envelope({ finishReason = "tool_calls", toolCalls = [toolCall()], content, reasoningContent, id = "synthetic-response-001" } = {}) {
  const message = { tool_calls: toolCalls };
  if (content !== undefined) message.content = content;
  if (reasoningContent !== undefined) message.reasoning_content = reasoningContent;
  return { id, usage: { prompt_tokens: 10, completion_tokens: 12 }, choices: [{ finish_reason: finishReason, message }] };
}

function responseFor(value) {
  return { ok: true, status: 200, text: async () => JSON.stringify(value) };
}

async function providerResult(value) {
  let fakeCalls = 0;
  const result = await callComparisonProvider({
    safeContext: { opportunityToken: "SYN-OPP-001", priority: "Monitor" },
    accountAggregate: { accountToken: "SYN-CUST-001" },
    page: "synthetic-probe",
    env,
    requestCorrelation: "R5B4-MOCK-001",
    fetchImpl: async () => { fakeCalls += 1; return responseFor(value); },
  });
  return { result, fakeCalls };
}

test("success observation uses only the approved extraction path and no raw content", () => {
  const observation = observeProviderSuccessResponse(JSON.stringify(envelope({ content: "ignored", reasoningContent: "ignored" })), { maxTokens: 1200, requestCorrelation: "R5B4-MOCK-001", latencyMs: 17 });
  assert.equal(observation.httpStatus, null);
  assert.equal(observation.choiceCount, 1);
  assert.equal(observation.selectedChoiceIndex, 0);
  assert.equal(observation.finishReason, "tool_calls");
  assert.equal(observation.messageContentPresent, true);
  assert.equal(observation.reasoningContentPresent, true);
  assert.equal(observation.toolCallsCount, 1);
  assert.equal(observation.toolCallType, "function");
  assert.equal(observation.functionName, "emit_decision_pack");
  assert.equal(observation.argumentsRuntimeType, "string");
  assert.match(observation.argumentsSha256, /^[0-9a-f]{64}$/);
  assert.equal(observation.firstNonWhitespaceCharacterCategory, "left-brace");
  assert.equal(observation.lastNonWhitespaceCharacterCategory, "right-brace");
  assert.ok(observation.leftBraceCount > 0);
  assert.ok(observation.rightBraceCount > 0);
  assert.equal(observation.jsonParseErrorType, null);
  assert.equal(observation.completionTokens, 12);
  assert.equal(observation.maxTokens, 1200);
  assert.equal(observation.responseId, "synthetic-response-001");
  assert.equal(observation.requestCorrelationToken, "R5B4-MOCK-001");
  assert.equal(observation.latencyMs, 17);
  assert.equal(JSON.stringify(observation).includes("Synthetic fact"), false);
});

test("strict extraction rejects finish, shape, name and argument type failures with stable categories", () => {
  const cases = [
    [envelope({ finishReason: "length" }), STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.OUTPUT_TRUNCATED],
    [envelope({ finishReason: "stop" }), STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.TOOL_CALL_NOT_COMPLETED],
    [envelope({ toolCalls: [] }), STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.TOOL_CALL_SHAPE_INVALID],
    [envelope({ toolCalls: [toolCall(), toolCall()] }), STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.TOOL_CALL_SHAPE_INVALID],
    [envelope({ toolCalls: [toolCall(JSON.stringify(validArguments), { type: "custom" })] }), STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.TOOL_CALL_SHAPE_INVALID],
    [envelope({ toolCalls: [toolCall(JSON.stringify(validArguments), { name: "other_tool" })] }), STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.TOOL_NAME_INVALID],
    [envelope({ toolCalls: [toolCall(validArguments)] }), STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.ARGUMENT_TYPE_INVALID],
    [envelope({ toolCalls: [toolCall("   ")] }), STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.ARGUMENT_EMPTY],
  ];
  for (const [value, expected] of cases) {
    const parsed = parseProviderSuccessEnvelope(JSON.stringify(value));
    const result = extractStrictToolArguments(parsed.envelope, { observation: parsed.observation });
    assert.equal(result.ok, false, expected);
    assert.equal(result.category, expected, expected);
  }
});

test("arguments parser permits only BOM/whitespace normalization and one JSON.parse", () => {
  const valid = parseStrictToolArguments(`\uFEFF  ${JSON.stringify(validArguments)}  `);
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.value, validArguments);

  const markdown = parseStrictToolArguments("```json\n{}\n```");
  assert.equal(markdown.category, STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.ARGUMENT_JSON_INVALID);
  assert.equal(markdown.observation.jsonParseErrorType, "SyntaxError");
  assert.ok(markdown.observation.jsonParseErrorPosition === null || typeof markdown.observation.jsonParseErrorPosition === "number");

  const truncated = parseStrictToolArguments('{"facts":[');
  assert.equal(truncated.category, STRICT_TOOL_ARGUMENT_FAILURE_CATEGORIES.ARGUMENT_JSON_INVALID);
  assert.ok(truncated.observation.jsonParseErrorPosition === null || typeof truncated.observation.jsonParseErrorPosition === "number");

  const doubleEncoded = parseStrictToolArguments(JSON.stringify(JSON.stringify(validArguments)));
  assert.equal(doubleEncoded.ok, true);
  assert.equal(typeof doubleEncoded.value, "string");
});

test("provider diagnostics classify JSON and Schema failures without retaining raw arguments", async () => {
  const invalidJson = await providerResult(envelope({ toolCalls: [toolCall('{"facts":[')], content: JSON.stringify(validArguments), reasoningContent: JSON.stringify(validArguments) }));
  assert.equal(invalidJson.fakeCalls, 1);
  assert.equal(invalidJson.result.diagnosticCategory, "ARGUMENT_JSON_INVALID");
  assert.equal(invalidJson.result.reason, "output_not_json");
  assert.match(invalidJson.result.successResponseObservation.argumentsSha256, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(invalidJson.result).includes('{"facts"'), false);

  const schemaInvalid = await providerResult(envelope({ toolCalls: [toolCall(JSON.stringify({ ...validArguments, extra: true }))] }));
  assert.equal(schemaInvalid.fakeCalls, 1);
  assert.equal(schemaInvalid.result.diagnosticCategory, "ARGUMENT_SCHEMA_INVALID");
  assert.equal(schemaInvalid.result.reason, "output_contract_invalid");
  assert.equal(schemaInvalid.result.successResponseObservation.argumentsRuntimeType, "string");
});

test("R5B4 diagnostics are local-only and preserve the write and retry boundaries", async () => {
  const source = await fs.readFile(new URL("../server/decision/providerSuccessObservability.mjs", import.meta.url), "utf8");
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("Authorization"), false);
  const result = await providerResult(envelope());
  assert.equal(result.fakeCalls, 1);
  assert.equal(result.result.attempts, 1);
  assert.equal(result.result.safetyStatus, "pass");
  assert.equal(JSON.stringify(result.result).includes("SYN-OPP-001"), false);
  assert.equal(JSON.stringify(result.result).includes("SYN-CUST-001"), false);
});
