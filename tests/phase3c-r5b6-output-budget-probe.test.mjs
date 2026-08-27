import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  buildR5B6ConfigDiff,
  buildR5B6RequestMeta,
  executeR5B6Probe,
} from "../scripts/run-phase3c-r5b6-output-budget-probe.mjs";
import {
  buildR5B3SyntheticInput,
  validateR5B3SyntheticInput,
} from "../scripts/run-phase3c-r5b3-synthetic-probe.mjs";
import { DEEPSEEK_TOOL_NAME } from "../server/decision/deepseekStrictSchema.mjs";

const env = {
  LLM_BASE_URL: "https://api.deepseek.com/beta",
  LLM_MODEL: "deepseek-v4-pro",
  LLM_API_KEY: "synthetic-only",
  LLM_TIMEOUT_MS: "1000",
  LLM_MAX_TOKENS: "1200",
};

const validArguments = {
  facts: [{ label: "Synthetic priority", value: "Monitor", evidenceToken: "SYN-EVID-001" }],
  inferences: [{ inference: "Synthetic evidence supports a review.", evidenceTokens: ["SYN-EVID-001"] }],
  evidence: [{ evidenceToken: "SYN-EVID-001", value: "Synthetic evidence only" }],
  confidence: { level: "High", reason: "Synthetic evidence is present." },
  recommendedActions: [{ action: "Review synthetic signal", ownerRole: "synthetic-owner", dueWindow: "synthetic-window", basis: "SYN-EVID-001", draftStatus: "Draft only" }],
  priority: "Monitor",
  riskCategories: [],
  provider: "openai-compatible",
  model: "deepseek-v4-pro",
  modelVersion: "deepseek-v4-pro",
  fallback: { state: "not_applicable", reason: "Synthetic probe." },
  safety: { customerIdentityMasked: true, exactAmountSentToModel: false, rawTimelineSent: false, crmWritebackEnabled: false },
  limitations: ["Synthetic probe only"],
};

function responseFor(argumentsText = JSON.stringify(validArguments), finishReason = "tool_calls") {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id: "synthetic-r5b6-response",
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 },
      choices: [{ finish_reason: finishReason, message: { content: "ignored", tool_calls: [{ type: "function", function: { name: DEEPSEEK_TOOL_NAME, arguments: argumentsText } }] } }],
    }),
  };
}

function fakeFetch(response) {
  let calls = 0;
  return {
    fetchImpl: async () => {
      calls += 1;
      return response;
    },
    calls: () => calls,
  };
}

test("R5B6 changes only max_tokens from the R5B5 request contract", () => {
  const input = buildR5B3SyntheticInput();
  const diff = buildR5B6ConfigDiff({ input, env });
  const request = buildR5B6RequestMeta({ input, env });
  const safety = validateR5B3SyntheticInput(input);

  assert.deepEqual(diff.changedFields, ["max_tokens"]);
  assert.deepEqual(diff.unexpectedChangedFields, []);
  assert.equal(diff.maxTokensBefore, 1200);
  assert.equal(diff.maxTokensAfter, 2400);
  assert.equal(diff.stableFieldsEqual, true);
  assert.equal(request.maxTokens, 2400);
  assert.equal(request.requestSchemaHash, "476cecc436dc452abc50988d337d779398159e8e0a4003bc8aa6153cbdab22b7");
  assert.equal(request.shapeReady, true);
  assert.equal(request.strict, true);
  assert.equal(request.singleTool, true);
  assert.equal(request.toolName, DEEPSEEK_TOOL_NAME);
  assert.deepEqual(request.toolChoice, { type: "function", function: { name: DEEPSEEK_TOOL_NAME } });
  assert.equal(request.thinkingType, "disabled");
  assert.equal(request.temperature, 0);
  assert.equal(request.stream, false);
  assert.equal(request.responseFormatSent, false);
  assert.equal(request.retryCount, 0);
  assert.deepEqual(request.nodeCompleteness, { missingTypeAnyOfRefCount: 0, missingRequiredCount: 0, missingAdditionalPropertiesCount: 0, unsupportedKeywordCount: 0 });
  assert.equal(safety.forbiddenFieldCount, 0);
  assert.equal(safety.realCrmTokenCount, 0);
  assert.equal(safety.exactAmountCount, 0);
  assert.equal(safety.rawTimelineCount, 0);
});

test("R5B6 succeeds with one local synthetic strict Tool Call at the increased budget", async () => {
  const fake = fakeFetch(responseFor());
  const result = await executeR5B6Probe({ env, fetchImpl: fake.fetchImpl, now: () => new Date("2026-07-19T00:00:00.000Z") });

  assert.equal(fake.calls(), 1);
  assert.equal(result.status, "completed");
  assert.equal(result.externalLlmCalls, 1);
  assert.equal(result.retryCount, 0);
  assert.equal(result.fixtureFallbackCount, 0);
  assert.equal(result.providerRequestCompatibilityReady, true);
  assert.equal(result.phase3cR5B6Complete, true);
  assert.equal(result.realCanaryAuthorized, false);
  assert.equal(result.httpTransportReady, true);
  assert.equal(result.finishReasonReady, true);
  assert.equal(result.toolCallReady, true);
  assert.equal(result.argumentStringReady, true);
  assert.equal(result.jsonReady, true);
  assert.equal(result.schemaV2Ready, true);
  assert.equal(result.canonicalMappingReady, true);
  assert.equal(result.evidenceValidationReady, true);
  assert.equal(result.safetyReady, true);
  assert.deepEqual(result.tokenUsage, { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 });
  assert.equal(result.estimatedCostUsd, 0.000022);
  assert.equal(result.successResponseObservation.maxTokens, 2400);
  assert.equal(JSON.stringify(result).includes("Synthetic priority"), false);
  assert.equal(JSON.stringify(result).includes("SYN-CUST-001"), false);
});

test("R5B6 stops on truncation after one call and does not retry or fallback", async () => {
  const fake = fakeFetch(responseFor(JSON.stringify(validArguments), "length"));
  const result = await executeR5B6Probe({ env, fetchImpl: fake.fetchImpl });

  assert.equal(fake.calls(), 1);
  assert.equal(result.status, "stopped-safety");
  assert.equal(result.externalLlmCalls, 1);
  assert.equal(result.retryCount, 0);
  assert.equal(result.fixtureFallbackCount, 0);
  assert.equal(result.failureCategory, "OUTPUT_TRUNCATED");
  assert.equal(result.providerRequestCompatibilityReady, false);
  assert.equal(result.phase3cR5B6Complete, false);
  assert.equal(result.response.httpSuccess, true);
  assert.equal(result.response.finishReasonReady, false);
  assert.equal(result.response.toolCallReady, false);
  assert.equal(result.response.argumentStringReady, true);
  assert.equal(result.response.jsonReady, false);
  assert.equal(result.httpTransportReady, true);
  assert.equal(result.finishReasonReady, false);
  assert.equal(result.toolCallReady, false);
  assert.equal(result.argumentStringReady, true);
  assert.deepEqual(result.tokenUsage, { completion_tokens: 12 });
  assert.equal(result.estimatedCostUsd, 0.000012);
});

test("R5B6 executor is isolated from CRM, production, browser provider, and embedded secrets", async () => {
  const source = await fs.readFile(new URL("../scripts/run-phase3c-r5b6-output-budget-probe.mjs", import.meta.url), "utf8");
  assert.equal(/lcn-crm\.crm7\.dynamics\.com|org91f5f65\.crm5\.dynamics\.com/i.test(source), false);
  assert.equal(/sk-[A-Za-z0-9]{20,}/.test(source), false);
  assert.equal(source.includes("R5B5-SYNTH-V2-001"), false);
  assert.equal(source.includes("MAX_CALLS = 1"), true);
  const result = await executeR5B6Probe({ env, fetchImpl: fakeFetch(responseFor()).fetchImpl });
  assert.equal(result.d365Get, 0);
  assert.equal(result.crmWriteback, false);
  assert.equal(result.productionRequests, 0);
  assert.equal(result.browserExternalProviderRequests, 0);
});
