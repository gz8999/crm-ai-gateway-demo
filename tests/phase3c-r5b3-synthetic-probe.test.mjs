import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  buildR5B3RequestMeta,
  buildR5B3SyntheticInput,
  executeR5B3Probe,
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

function responseFor(argumentsValue = validArguments, functionName = DEEPSEEK_TOOL_NAME) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({ model: "deepseek-v4-pro", choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: functionName, arguments: typeof argumentsValue === "string" ? argumentsValue : JSON.stringify(argumentsValue) } }] } }] }),
  };
}

function fakeFetch(response) {
  let calls = 0;
  return {
    fetchImpl: async () => { calls += 1; return typeof response === "function" ? response() : response; },
    calls: () => calls,
  };
}

test("R5B3 synthetic input and V2 request preflight are complete", () => {
  const input = buildR5B3SyntheticInput();
  const safety = validateR5B3SyntheticInput(input);
  assert.equal(safety.flagsReady, true);
  assert.equal(safety.d365Record, false);
  assert.equal(safety.runtimeEligible, false);
  assert.equal(safety.realCanary, false);
  assert.equal(safety.forbiddenFieldCount, 0);
  assert.equal(safety.realCrmTokenCount, 0);
  assert.equal(safety.identityCount, 0);
  assert.equal(safety.exactAmountCount, 0);
  assert.equal(safety.rawTimelineCount, 0);
  assert.equal(safety.scenarioGoldenCount, 0);
  const request = buildR5B3RequestMeta({ input, env });
  assert.equal(request.requestSchemaHash, "476cecc436dc452abc50988d337d779398159e8e0a4003bc8aa6153cbdab22b7");
  assert.equal(request.shapeReady, true);
  assert.equal(request.singleTool, true);
  assert.equal(request.strict, true);
  assert.equal(request.responseFormatSent, false);
  assert.equal(request.retryCount, 0);
  assert.deepEqual(request.nodeCompleteness, { missingTypeAnyOfRefCount: 0, missingRequiredCount: 0, missingAdditionalPropertiesCount: 0, unsupportedKeywordCount: 0 });
});

test("successful R5B3 probe uses one local fake Tool Calling response and maps canonically", async () => {
  const fake = fakeFetch(responseFor());
  const result = await executeR5B3Probe({ env, fetchImpl: fake.fetchImpl, now: () => new Date("2026-07-19T00:00:00.000Z") });
  assert.equal(fake.calls(), 1);
  assert.equal(result.status, "completed");
  assert.equal(result.externalLlmCalls, 1);
  assert.equal(result.retryCount, 0);
  assert.equal(result.fixtureFallbackCount, 0);
  assert.equal(result.providerRequestCompatibilityReady, true);
  assert.equal(result.response.toolCallReady, true);
  assert.equal(result.response.schemaReady, true);
  assert.equal(result.response.canonicalMappingReady, true);
  assert.equal(result.response.evidenceReady, true);
  assert.equal(result.response.safetyReady, true);
  assert.equal(result.response.unsupportedClaimCount, 0);
  assert.equal(result.d365Get, 0);
  assert.equal(result.crmWriteback, false);
  assert.equal(result.productionRequests, 0);
});

test("Tool, JSON, Schema, Evidence and transport failures stop after one local fake call", async () => {
  const cases = [
    ["missing-tool", { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), text: async () => JSON.stringify({ choices: [{ message: {} }] }) }, "tool_call_count_invalid"],
    ["wrong-tool", responseFor(validArguments, "wrong_function"), "tool_call_name_invalid"],
    ["invalid-json", responseFor("not-json"), "output_not_json"],
    ["extra-property", responseFor({ ...validArguments, extra: true }), "output_contract_invalid"],
    ["bad-evidence", responseFor({ ...validArguments, facts: [{ ...validArguments.facts[0], evidenceToken: "SYN-EVID-999" }] }), "synthetic_response_validation_failed"],
  ];
  for (const [name, response, expectedReason] of cases) {
    const fake = fakeFetch(response);
    const result = await executeR5B3Probe({ env, fetchImpl: fake.fetchImpl });
    assert.equal(fake.calls(), 1, name);
    assert.equal(result.externalLlmCalls, 1, name);
    assert.equal(result.retryCount, 0, name);
    assert.equal(result.fixtureFallbackCount, 0, name);
    assert.equal(result.status, "stopped-safety", name);
    assert.equal(result.stopReason, expectedReason, name);
    assert.equal(result.providerRequestCompatibilityReady, false, name);
  }
});

test("non-2xx R5B3 response keeps only safe error observation", async () => {
  const rawBody = JSON.stringify({ error: { code: "synthetic_error", message: "synthetic failure", secret: "must-not-store" } });
  const fake = fakeFetch({ ok: false, status: 400, headers: new Headers({ "content-type": "application/json" }), text: async () => rawBody });
  const result = await executeR5B3Probe({ env, fetchImpl: fake.fetchImpl });
  assert.equal(fake.calls(), 1);
  assert.equal(result.status, "stopped-safety");
  assert.equal(result.errorObservation.providerErrorCode, "synthetic_error");
  assert.equal(result.errorObservation.bodyAvailable, true);
  assert.equal(JSON.stringify(result).includes("must-not-store"), false);
  assert.equal(JSON.stringify(result).includes("rawBody"), false);
});

test("R5B3 executor has no D365 path, no retry path, and no secret or CRM write output", async () => {
  const source = await fs.readFile(new URL("../scripts/run-phase3c-r5b3-synthetic-probe.mjs", import.meta.url), "utf8");
  assert.equal(/from ["'][^"']*(?:dataverse|d365)[^"']*["']/i.test(source), false);
  assert.equal(/CRM POST/i.test(source), false);
  assert.equal(/lcn-crm\.crm7\.dynamics\.com|org91f5f65\.crm5\.dynamics\.com/i.test(source), false);
  assert.equal(/sk-[A-Za-z0-9]{20,}/.test(source), false);
  assert.equal(source.includes("MAX_CALLS = 1"), true);
  const result = await executeR5B3Probe({ env, fetchImpl: fakeFetch(responseFor()).fetchImpl });
  assert.equal(result.crmWriteback, false);
  assert.equal(result.d365Get, 0);
  assert.equal(result.productionRequests, 0);
});
