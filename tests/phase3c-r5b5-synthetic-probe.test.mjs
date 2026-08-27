import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  buildR5B5RequestMeta,
  executeR5B5Probe,
} from "../scripts/run-phase3c-r5b5-synthetic-probe.mjs";
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

function responseFor(argumentsText = JSON.stringify(validArguments), { finishReason = "tool_calls", functionName = DEEPSEEK_TOOL_NAME } = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id: "synthetic-response-r5b5",
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 10, completion_tokens: 12 },
      choices: [{ finish_reason: finishReason, message: { content: "ignored", tool_calls: [{ type: "function", function: { name: functionName, arguments: argumentsText } }] } }],
    }),
  };
}

function fakeFetch(response) {
  let calls = 0;
  return {
    fetchImpl: async () => {
      calls += 1;
      return typeof response === "function" ? response() : response;
    },
    calls: () => calls,
  };
}

test("R5B5 preflight is synthetic-only and uses the frozen V2 request shape", () => {
  const input = buildR5B3SyntheticInput();
  const inputSafety = validateR5B3SyntheticInput(input);
  const request = buildR5B5RequestMeta({ input, env });

  assert.equal(inputSafety.flagsReady, true);
  assert.equal(inputSafety.forbiddenFieldCount, 0);
  assert.equal(inputSafety.realCrmTokenCount, 0);
  assert.equal(inputSafety.identityCount, 0);
  assert.equal(inputSafety.exactAmountCount, 0);
  assert.equal(inputSafety.rawTimelineCount, 0);
  assert.equal(inputSafety.scenarioGoldenCount, 0);
  assert.equal(request.requestSchemaHash, "476cecc436dc452abc50988d337d779398159e8e0a4003bc8aa6153cbdab22b7");
  assert.equal(request.shapeReady, true);
  assert.equal(request.singleTool, true);
  assert.equal(request.toolName, DEEPSEEK_TOOL_NAME);
  assert.equal(request.strict, true);
  assert.equal(request.additionalPropertiesFalse, true);
  assert.equal(request.thinkingType, "disabled");
  assert.equal(request.temperature, 0);
  assert.deepEqual(request.toolChoice, { type: "function", function: { name: DEEPSEEK_TOOL_NAME } });
  assert.equal(request.stream, false);
  assert.equal(request.responseFormatSent, false);
  assert.equal(request.retryCount, 0);
  assert.deepEqual(request.nodeCompleteness, {
    missingTypeAnyOfRefCount: 0,
    missingRequiredCount: 0,
    missingAdditionalPropertiesCount: 0,
    unsupportedKeywordCount: 0,
  });
});

test("R5B5 accepts one local synthetic strict Tool Call and exposes only safe observation", async () => {
  const fake = fakeFetch(responseFor());
  const result = await executeR5B5Probe({ env, fetchImpl: fake.fetchImpl, now: () => new Date("2026-07-19T00:00:00.000Z") });

  assert.equal(fake.calls(), 1);
  assert.equal(result.status, "completed");
  assert.equal(result.syntheticProbeExecuted, true);
  assert.equal(result.externalLlmCalls, 1);
  assert.equal(result.retryCount, 0);
  assert.equal(result.fixtureFallbackCount, 0);
  assert.equal(result.d365Get, 0);
  assert.equal(result.crmWriteback, false);
  assert.equal(result.productionRequests, 0);
  assert.equal(result.providerRequestCompatibilityReady, true);
  assert.equal(result.phase3cR5B5Complete, true);
  assert.equal(result.realCanaryAuthorized, false);
  assert.equal(result.response.httpSuccess, true);
  assert.equal(result.response.finishReasonReady, true);
  assert.equal(result.response.toolCallReady, true);
  assert.equal(result.response.argumentStringReady, true);
  assert.equal(result.response.jsonReady, true);
  assert.equal(result.response.schemaV2Ready, true);
  assert.equal(result.response.canonicalMappingReady, true);
  assert.equal(result.response.evidenceValidationReady, true);
  assert.equal(result.response.safetyReady, true);
  assert.equal(result.response.unsupportedClaimCount, 0);
  assert.equal(result.successResponseObservation.argumentsRuntimeType, "string");
  assert.match(result.successResponseObservation.argumentsSha256, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(result).includes("Synthetic priority"), false);
  assert.equal(JSON.stringify(result).includes("SYN-CUST-001"), false);
});

test("R5B5 stops on invalid Tool Arguments JSON after exactly one call", async () => {
  const fake = fakeFetch(responseFor("{\"facts\":["));
  const result = await executeR5B5Probe({ env, fetchImpl: fake.fetchImpl });

  assert.equal(fake.calls(), 1);
  assert.equal(result.status, "stopped-safety");
  assert.equal(result.externalLlmCalls, 1);
  assert.equal(result.retryCount, 0);
  assert.equal(result.fixtureFallbackCount, 0);
  assert.equal(result.failureCategory, "ARGUMENT_JSON_INVALID");
  assert.equal(result.providerRequestCompatibilityReady, false);
  assert.equal(result.phase3cR5B5Complete, false);
  assert.equal(result.response.httpSuccess, true);
  assert.equal(result.response.finishReasonReady, true);
  assert.equal(result.response.toolCallReady, true);
  assert.equal(result.response.argumentStringReady, true);
  assert.equal(result.response.jsonReady, false);
  assert.deepEqual(result.tokenUsage, { completion_tokens: 12 });
  assert.equal(result.estimatedCostUsd, 0.000012);
  assert.equal(result.successResponseObservation.argumentsRuntimeType, "string");
  assert.equal(JSON.stringify(result).includes("{\\\"facts\\\":["), false);
});

test("R5B5 executor has no CRM or browser provider path and no embedded secret", async () => {
  const source = await fs.readFile(new URL("../scripts/run-phase3c-r5b5-synthetic-probe.mjs", import.meta.url), "utf8");
  assert.equal(/lcn-crm\.crm7\.dynamics\.com|org91f5f65\.crm5\.dynamics\.com/i.test(source), false);
  assert.equal(/sk-[A-Za-z0-9]{20,}/.test(source), false);
  assert.equal(source.includes("MAX_CALLS = 1"), true);
  assert.equal(source.includes("browserExternalProviderRequests: 0"), true);
  const result = await executeR5B5Probe({ env, fetchImpl: fakeFetch(responseFor()).fetchImpl });
  assert.equal(result.browserExternalProviderRequests, 0);
  assert.equal(result.crmWriteback, false);
  assert.equal(result.d365Get, 0);
  assert.equal(result.productionRequests, 0);
});
