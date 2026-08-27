import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { buildComparisonPayload, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import { externalModelJsonSchema, validateExternalModelResponse } from "../server/decision/externalModelContract.mjs";
import { buildR4Env, validateR4Freeze } from "../scripts/run-phase3c-r4-contract-canary.mjs";

const freezePath = new URL("../docs/gateway/external-llm-canary-r3-freeze-manifest.json", import.meta.url);

function response() {
  return {
    facts: [{ label: "Priority", value: "Monitor", evidenceToken: "safeContext.priority" }],
    inferences: [{ inference: "Continue monitoring the supplied signals.", evidenceTokens: ["safeContext.priority"] }],
    evidence: [{ evidenceToken: "safeContext.priority", value: "Monitor" }],
    confidence: { level: "High", reason: "The supplied signal is clear." },
    recommendedActions: [{ action: "Maintain review cadence", ownerRole: "待人工指定", dueWindow: "待人工确定", basis: "safeContext.priority", draftStatus: "Draft only" }],
    priority: "Monitor",
    riskCategories: [],
    provider: "openai-compatible",
    model: "deepseek-v4-pro",
    modelVersion: "deepseek-v4-pro",
    fallback: { state: "not_applicable", reason: "No fallback used." },
    safety: { customerIdentityMasked: true, exactAmountSentToModel: false, rawTimelineSent: false, crmWritebackEnabled: false },
    limitations: ["Safe Context only"],
  };
}

test("R3 freeze excludes consumed canary and has one replacement", async () => {
  const freeze = JSON.parse(await fs.readFile(freezePath, "utf8"));
  const tokens = freeze.records.map((row) => row.opportunityToken);
  assert.equal(freeze.count, 24);
  assert.equal(tokens.length, 24);
  assert.equal(tokens.includes("DEMO-OPP-001"), false);
  assert.deepEqual(freeze.excludedConsumedTokens, ["DEMO-OPP-001"]);
  assert.deepEqual(freeze.replacementTokens, ["DEMO-OPP-028"]);
  assert.equal(new Set(tokens).size, 24);
  assert.equal(freeze.contractCanaryToken, "DEMO-OPP-002");
});

test("R3 uses DeepSeek strict native Tool Calling instead of prompt-only JSON", async () => {
  let requestUrl = "";
  let requestBody;
  const result = await callComparisonProvider({
    safeContext: { opportunityToken: "DEMO-OPP-002", priority: "Monitor" },
    accountAggregate: { accountToken: "A-002" },
    page: "risk",
    env: { AI_PROVIDER: "openai-compatible", ALLOW_EXTERNAL_AI: "true", LLM_BASE_URL: "https://api.deepseek.com/beta", LLM_MODEL: "deepseek-v4-pro", LLM_API_KEY: "test-only", LLM_CANARY_SINGLE_ATTEMPT: "true", PHASE3C_NATIVE_JSON_MODE: "strict-tool" },
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestBody = JSON.parse(options.body);
      return { ok: true, status: 200, text: async () => JSON.stringify({ model: "deepseek-v4-pro", usage: { prompt_tokens: 10, completion_tokens: 20 }, choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: JSON.stringify(response()) } }] } }] }) };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.nativeJsonMode, "strict-tool");
  assert.equal(requestUrl, "https://api.deepseek.com/beta/chat/completions");
  assert.equal(requestBody.response_format, undefined);
  assert.deepEqual(requestBody.thinking, { type: "disabled" });
  assert.equal(requestBody.tools[0].function.strict, true);
  assert.equal(requestBody.tools[0].function.parameters.additionalProperties, false);
  assert.deepEqual(requestBody.tool_choice, { type: "function", function: { name: "emit_decision_pack" } });
  assert.equal(validateExternalModelResponse(result.output, { evidenceTokens: ["safeContext.priority"] }).ok, true);
});

test("R3 native tool arguments still fail closed when not JSON", async () => {
  let calls = 0;
  const result = await callComparisonProvider({
    safeContext: { opportunityToken: "DEMO-OPP-002", priority: "Monitor" },
    accountAggregate: { accountToken: "A-002" },
    page: "risk",
    env: { AI_PROVIDER: "openai-compatible", ALLOW_EXTERNAL_AI: "true", LLM_BASE_URL: "https://api.deepseek.com/beta", LLM_MODEL: "deepseek-v4-pro", LLM_API_KEY: "test-only", LLM_CANARY_SINGLE_ATTEMPT: "true", PHASE3C_NATIVE_JSON_MODE: "strict-tool" },
    fetchImpl: async () => { calls += 1; return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: "```json{}" } }] } }] }) }; },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "output_not_json");
});

test("R3 response contract rejects extra keys", () => {
  const invalid = { ...response(), unexpected: true };
  const result = validateExternalModelResponse(invalid, { evidenceTokens: ["safeContext.priority"] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("additional_properties"));
  assert.equal(externalModelJsonSchema.additionalProperties, false);
});

test("R4 limits execution to the contract canary and keeps the remaining set pending", async () => {
  const freeze = JSON.parse(await fs.readFile(freezePath, "utf8"));
  const gate = validateR4Freeze(freeze);
  assert.deepEqual(gate, { count: true, consumedExcluded: true, contractToken: true, unique: true });
  const env = buildR4Env({ LLM_API_KEY: "test-only", PHASE3C_OLD_KEY_REVOKED: "true", PHASE3C_NEW_KEY_CONFIGURED: "true" });
  assert.equal(env.PHASE3C_CANARY_LIMIT, "1");
  assert.equal(env.PHASE3C_REQUEST_PREFIX, "PHASE3C-R4-CONTRACT");
  assert.equal(env.LLM_CANARY_SINGLE_ATTEMPT, "true");
});
