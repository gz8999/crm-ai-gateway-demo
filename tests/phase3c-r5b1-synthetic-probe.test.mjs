import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  buildSyntheticProbeInput,
  buildSyntheticRequestMeta,
  executeSyntheticProbe,
} from "../scripts/run-phase3c-r5b1-synthetic-probe.mjs";
import { DEEPSEEK_TOOL_NAME } from "../server/decision/deepseekStrictSchema.mjs";
import { callComparisonProvider } from "../server/decision/comparisonProvider.mjs";

const testEnv = {
  AI_PROVIDER: "demo",
  ALLOW_EXTERNAL_AI: "false",
  LLM_API_KEY: "synthetic-placeholder",
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

function responseFor(argumentsValue = validArguments, functionName = DEEPSEEK_TOOL_NAME) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 10, completion_tokens: 12 },
      choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: functionName, arguments: JSON.stringify(argumentsValue) } }] } }],
    }),
  };
}

function fakeFetch(response) {
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    assert.equal(options.method, "POST");
    const body = JSON.parse(options.body);
    assert.equal(body.response_format, undefined);
    assert.equal(body.tools.length, 1);
    assert.equal(body.tools[0].function.strict, true);
    assert.equal(body.tools[0].function.parameters.additionalProperties, false);
    assert.deepEqual(body.tool_choice, { type: "function", function: { name: DEEPSEEK_TOOL_NAME } });
    return typeof response === "function" ? response(body) : response;
  };
  return { fetchImpl, calls: () => calls };
}

test("synthetic probe input is explicitly non-D365 and the request is strict-tool compatible", () => {
  const input = buildSyntheticProbeInput();
  assert.deepEqual(
    [input.safeContext.testOnly, input.safeContext.d365Record, input.safeContext.runtimeEligible, input.safeContext.realCanary, input.safeContext.syntheticProbe],
    [true, false, false, false, true],
  );
  assert.deepEqual(input.safeContext.evidenceTokens, ["SYN-EVID-001"]);
  assert.equal(JSON.stringify(input).includes("DEMO-OPP-"), false);
  assert.equal(JSON.stringify(input).includes("DEMO-CUST-"), false);
  const request = buildSyntheticRequestMeta({ input, env: testEnv });
  assert.equal(request.shapeReady, true);
  assert.equal(request.strict, true);
  assert.equal(request.additionalPropertiesFalse, true);
  assert.equal(request.responseFormatSent, false);
  assert.deepEqual(request.toolChoice, { type: "function", function: { name: DEEPSEEK_TOOL_NAME } });
});

test("successful synthetic strict Tool Calling probe uses exactly one local fake call", async () => {
  const fake = fakeFetch(responseFor());
  const result = await executeSyntheticProbe({ env: testEnv, fetchImpl: fake.fetchImpl, now: () => new Date("2026-07-19T00:00:00.000Z") });
  assert.equal(fake.calls(), 1);
  assert.equal(result.status, "completed");
  assert.equal(result.externalLlmCalls, 1);
  assert.equal(result.retryCount, 0);
  assert.equal(result.fixtureFallbackCount, 0);
  assert.equal(result.response.httpSuccess, true);
  assert.equal(result.response.toolCallReady, true);
  assert.equal(result.response.schemaReady, true);
  assert.equal(result.response.canonicalMappingReady, true);
  assert.equal(result.response.evidenceReady, true);
  assert.equal(result.response.safetyReady, true);
  assert.equal(result.crmWriteback, false);
  assert.equal(result.d365Get, 0);
  assert.equal(result.productionRequests, 0);
});

test("wrong Tool name stops after one call without fallback or retry", async () => {
  const fake = fakeFetch(responseFor(validArguments, "wrong_function"));
  const result = await executeSyntheticProbe({ env: testEnv, fetchImpl: fake.fetchImpl });
  assert.equal(fake.calls(), 1);
  assert.equal(result.status, "stopped-safety");
  assert.equal(result.externalLlmCalls, 1);
  assert.equal(result.response.reason, "tool_call_name_invalid");
  assert.equal(result.retryCount, 0);
  assert.equal(result.fixtureFallbackCount, 0);
});

test("strict Schema and Evidence failures stop the synthetic probe after one call", async () => {
  const extra = { ...validArguments, extra: true };
  const schemaFake = fakeFetch(responseFor(extra));
  const schemaResult = await executeSyntheticProbe({ env: testEnv, fetchImpl: schemaFake.fetchImpl });
  assert.equal(schemaFake.calls(), 1);
  assert.equal(schemaResult.status, "stopped-safety");
  assert.equal(schemaResult.response.reason, "output_contract_invalid");

  const badEvidence = { ...validArguments, facts: [{ ...validArguments.facts[0], evidenceToken: "SYN-EVID-999" }] };
  const evidenceFake = fakeFetch(responseFor(badEvidence));
  const evidenceResult = await executeSyntheticProbe({ env: testEnv, fetchImpl: evidenceFake.fetchImpl });
  assert.equal(evidenceFake.calls(), 1);
  assert.equal(evidenceResult.status, "stopped-safety");
  assert.equal(evidenceResult.response.evidenceReady, false);
  assert.equal(evidenceResult.response.safetyReady, false);
});

test("non-2xx synthetic response uses safe error observation and never stores raw body", async () => {
  const fake = fakeFetch({
    ok: false,
    status: 400,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({ error: { code: "synthetic_error", message: "synthetic failure", secret: "must-not-store" } }),
  });
  const result = await executeSyntheticProbe({ env: testEnv, fetchImpl: fake.fetchImpl });
  assert.equal(fake.calls(), 1);
  assert.equal(result.status, "stopped-safety");
  assert.equal(result.httpStatus, 400);
  assert.equal(result.errorObservation.providerErrorCode, "synthetic_error");
  assert.equal(result.errorObservation.sanitizedErrorMessage, "synthetic failure");
  assert.equal(result.errorObservation.bodyAvailable, true);
  assert.match(result.errorObservation.responseBodyHash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(result).includes("must-not-store"), false);
  assert.equal(JSON.stringify(result).includes("rawBody"), false);
});

test("synthetic JSON errors are parsed when the provider uses an octet-stream content type", async () => {
  const result = await callComparisonProvider({
    safeContext: { opportunityToken: "SYNTH-OCTET-001", priority: "Low" },
    accountAggregate: { accountToken: "SYNTH-ACCOUNT-OCTET-001" },
    page: "cockpit",
    env: testEnv,
    fetchImpl: async () => ({ ok: false, status: 400, headers: new Headers({ "content-type": "application/octet-stream" }), text: async () => JSON.stringify({ error: { message: "Schema rejected", type: "invalid_request_error", param: "tools", code: "invalid_request" } }) }),
  });
  assert.equal(result.errorObservation.providerErrorCode, "invalid_request");
  assert.equal(result.errorObservation.providerErrorType, "invalid_request_error");
  assert.equal(result.errorObservation.providerErrorParam, "tools");
  assert.equal(result.errorObservation.sanitizedErrorMessage, "Schema rejected");
});

test("synthetic probe runner does not import D365 or real Canary runtime sources", async () => {
  const source = await fs.readFile(new URL("../scripts/run-phase3c-r5b1-synthetic-probe.mjs", import.meta.url), "utf8");
  assert.equal(/from ["'].*(?:dataverse|d365).*?["']/i.test(source), false);
  assert.equal(/lcn-crm\.crm7\.dynamics\.com|org91f5f65\.crm5\.dynamics\.com/i.test(source), false);
});
