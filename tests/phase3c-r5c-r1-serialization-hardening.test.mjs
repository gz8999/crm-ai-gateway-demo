import assert from "node:assert/strict";
import test from "node:test";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import {
  PROVIDER_TRANSPORT_CONTRACT_V4_VERSION,
  buildProviderTransportToolSchemaV4,
  mapProviderTransportV4ToCanonicalV2,
  providerTransportToolSchemaV1,
  providerTransportToolSchemaV2,
  validateProviderTransportToolArgumentsV4,
} from "../server/decision/externalModelContractV2.mjs";
import {
  buildDeepseekDecisionToolSchemaV6R3,
  lintDeepSeekRequestShapeV2,
  lintDeepSeekSchemaCompleteness,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import { publicProviderSuccessObservation } from "../server/decision/providerSuccessObservability.mjs";

const TOKENS = Object.freeze([
  "safeContext.dataQualityCodes",
  "safeContext.decisionReadiness",
  "safeContext.priority",
  "safeContext.stagnationBand",
  "safeContext.varianceCategory",
]);
const TYPES = Object.freeze({
  "safeContext.dataQualityCodes": ["DATA_QUALITY"],
  "safeContext.decisionReadiness": ["DECISION_READINESS", "ENGAGEMENT"],
  "safeContext.priority": ["PIPELINE_PROGRESS", "PORTFOLIO_SCOPE"],
  "safeContext.stagnationBand": ["PIPELINE_PROGRESS"],
  "safeContext.varianceCategory": ["FINANCIAL_VARIANCE"],
});
const OPTIONS = Object.freeze({ evidenceTokens: TOKENS, evidenceTypeByToken: TYPES, provider: "openai-compatible", model: "deepseek-v4-pro", modelVersion: "deepseek-v4-pro" });
const ENV = Object.freeze({
  AI_PROVIDER: "openai-compatible",
  ALLOW_EXTERNAL_AI: "true",
  LLM_BASE_URL: "https://api.deepseek.com/beta",
  LLM_MODEL: "deepseek-v4-pro",
  LLM_API_KEY: "local-test-secret",
  LLM_TIMEOUT_MS: "1000",
  LLM_MAX_TOKENS: "2400",
  PHASE3C_NATIVE_JSON_MODE: "strict-tool",
  PHASE3C_SCHEMA_VERSION: "v6-r3",
});

function transportOutput() {
  return {
    facts: [{ label: "推进状态", value: "近期推进偏慢", evidenceToken: "safeContext.stagnationBand" }],
    inferences: [{ inference: "当前需要人工核实推进阻塞原因", evidenceTokens: ["safeContext.stagnationBand", "safeContext.decisionReadiness"] }],
    evidence: [{ evidenceToken: "safeContext.stagnationBand", value: "近期推进偏慢" }],
    confidence: { level: "Medium", reason: "现有安全证据支持中等置信度判断" },
    recommendedActions: [{
      action: "核实下一步推进条件",
      ownerRole: "待人工指定",
      dueWindow: "待人工确定",
      basis: "推进和决策准备信号需要人工复核",
      draftStatus: "Draft only",
      evidenceTokens: ["safeContext.stagnationBand", "safeContext.decisionReadiness"],
    }],
    priority: "High",
    riskCategories: [{ code: "stalled", evidenceTokens: ["safeContext.stagnationBand"] }],
    provider: "openai-compatible",
    model: "deepseek-v4-pro",
    modelVersion: "deepseek-v4-pro",
    fallback: { state: "not_applicable", reason: "NONE" },
    safety: {
      identityMasked: true,
      exactAmountWithheld: true,
      rawTimelineWithheld: true,
      crmWritebackPerformed: false,
      policyAssertions: {
        SAFE_CONTEXT_ONLY: true,
        NO_RAW_CRM: true,
        NO_IDENTITY: true,
        NO_EXACT_AMOUNT: true,
        NO_RAW_TIMELINE: true,
        NO_CRM_WRITEBACK: true,
      },
    },
    limitations: { codes: ["IDENTITY_MASKED", "EXACT_AMOUNT_WITHHELD", "RAW_TIMELINE_WITHHELD"] },
  };
}

function safeContext() {
  return {
    opportunityToken: "SYN-OPP-SERIALIZATION-001",
    dataQualityCodes: ["REVIEW_REQUIRED"],
    decisionReadiness: "partial",
    priority: "High",
    stagnationBand: "recently-slow",
    varianceCategory: "within-band",
    evidenceTokens: [...TOKENS],
  };
}

function response(argumentsText) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id: "synthetic-r5c-r1-response",
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 120, completion_tokens: 90, total_tokens: 210 },
      choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: argumentsText } }] } }],
    }),
  };
}

test("Transport v4 is opt-in and preserves historical v1 and v2 schema hashes", () => {
  assert.equal(PROVIDER_TRANSPORT_CONTRACT_V4_VERSION, "Provider Transport Contract v4");
  assert.equal(schemaHash(providerTransportToolSchemaV1), "12838eecacdaabe7f2e1a55c660847652dcfc2abcb87e381f1b45d8aba851236");
  assert.equal(schemaHash(providerTransportToolSchemaV2), "69083368d8ea37beb074441a723eb274cfbcebb6ef86b5a429ff90695e74869d");
  assert.notEqual(schemaHash(buildProviderTransportToolSchemaV4(OPTIONS)), "9f60da6a132df46cd44d12efaf49d516ac989f79446b32b22d3ab6da60a3f5eb");
});

test("v6-r3 schema is complete and uses only DeepSeek-supported strict keywords", () => {
  const schema = buildDeepseekDecisionToolSchemaV6R3(OPTIONS);
  const lint = lintDeepSeekSchemaCompleteness(schema);
  assert.equal(lint.missingTypeAnyOfRefCount, 0);
  assert.equal(lint.missingRequiredCount, 0);
  assert.equal(lint.missingAdditionalPropertiesCount, 0);
  assert.equal(lint.unsupportedKeywordCount, 0);
  assert.equal(schema.properties.facts.items.properties.label.pattern.length > 0, true);
});

test("every evidence reference is bound to the request allowlist in the schema", () => {
  const schema = buildProviderTransportToolSchemaV4(OPTIONS);
  const expected = [...TOKENS].sort();
  assert.deepEqual(schema.properties.facts.items.properties.evidenceToken.enum, expected);
  assert.deepEqual(schema.properties.inferences.items.properties.evidenceTokens.items.enum, expected);
  assert.deepEqual(schema.properties.evidence.items.properties.evidenceToken.enum, expected);
  assert.deepEqual(schema.properties.recommendedActions.items.properties.evidenceTokens.items.enum, expected);
  for (const branch of schema.properties.riskCategories.items.anyOf) {
    assert.equal(branch.properties.evidenceTokens.items.enum.every((token) => expected.includes(token)), true);
  }
});

test("free text is single-line bounded and excludes quote backslash and control characters", () => {
  assert.equal(validateProviderTransportToolArgumentsV4(transportOutput(), OPTIONS).ok, true);
  for (const invalidValue of ['包含"引号', "包含\\反斜杠", "包含\n换行", "x".repeat(241)]) {
    const invalid = transportOutput();
    invalid.facts[0].label = invalidValue;
    const result = validateProviderTransportToolArgumentsV4(invalid, OPTIONS);
    assert.equal(result.ok, false);
    assert.equal(result.schemaErrors.some((error) => error.endsWith(":pattern")), true);
  }
});

test("owner due provider model fallback and evidence tokens are schema-fixed", () => {
  for (const mutate of [
    (value) => { value.recommendedActions[0].ownerRole = "销售负责人"; },
    (value) => { value.recommendedActions[0].dueWindow = "两天内"; },
    (value) => { value.provider = "other"; },
    (value) => { value.model = "other"; },
    (value) => { value.fallback.reason = "free text"; },
    (value) => { value.facts[0].evidenceToken = "safeContext.unknown"; },
  ]) {
    const invalid = transportOutput();
    mutate(invalid);
    assert.equal(validateProviderTransportToolArgumentsV4(invalid, OPTIONS).ok, false);
  }
});

test("v6-r3 maps deterministically to the unchanged Canonical v2 contract", () => {
  const first = mapProviderTransportV4ToCanonicalV2(transportOutput(), OPTIONS);
  const second = mapProviderTransportV4ToCanonicalV2(transportOutput(), OPTIONS);
  assert.deepEqual(first, second);
  assert.equal(first.output.recommendedActions[0].ownerRole, "待人工指定");
  assert.equal(first.output.recommendedActions[0].dueWindow, "待人工确定");
  assert.match(first.output.recommendedActions[0].basis, /safeContext\.stagnationBand/);
});

test("v6-r3 request is strict complete and contains no response format fallback", () => {
  const body = buildComparisonRequestBody({ safeContext: safeContext(), accountAggregate: {}, page: "risk", evidenceTypeByToken: TYPES, env: ENV, nativeMode: true, schemaVersion: "v6-r3" });
  const lint = lintDeepSeekRequestShapeV2(body);
  assert.equal(lint.ok, true);
  assert.equal(body.response_format, undefined);
  assert.equal(body.tools[0].function.strict, true);
  assert.equal(body.tools[0].function.parameters.properties.provider.enum[0], "openai-compatible");
  assert.equal(body.tools[0].function.parameters.properties.model.enum[0], "deepseek-v4-pro");
});

test("valid local v6-r3 Tool response passes with one parse and no retry", async () => {
  let calls = 0;
  const result = await callComparisonProvider({
    safeContext: safeContext(),
    accountAggregate: {},
    page: "risk",
    evidenceTypeByToken: TYPES,
    env: ENV,
    fetchImpl: async () => { calls += 1; return response(JSON.stringify(transportOutput())); },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 1);
  assert.equal(result.transportContractVersion, PROVIDER_TRANSPORT_CONTRACT_V4_VERSION);
  assert.equal(result.canonicalMappingReady, true);
});

test("invalid JSON remains fail-closed but retains content-free diagnostics", async () => {
  let calls = 0;
  const result = await callComparisonProvider({
    safeContext: safeContext(),
    accountAggregate: {},
    page: "risk",
    evidenceTypeByToken: TYPES,
    env: ENV,
    fetchImpl: async () => { calls += 1; return response('{"facts":[}'); },
  });
  const observation = publicProviderSuccessObservation(result.successResponseObservation);
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.diagnosticCategory, "ARGUMENT_JSON_INVALID");
  assert.equal(result.responseBodyHash.length, 64);
  assert.equal(result.toolArgumentsHash.length, 64);
  assert.equal(result.usage.total_tokens, 210);
  assert.equal(observation.argumentsLength, 11);
  assert.equal(observation.argumentsSha256.length, 64);
  assert.equal(observation.leftBraceCount, 1);
  assert.equal(observation.rightBraceCount, 1);
  assert.equal(observation.jsonParseErrorType, "SyntaxError");
  assert.equal(Object.hasOwn(observation, "argumentsText"), false);
  assert.equal(Object.hasOwn(observation, "responseBody"), false);
  assert.equal(JSON.stringify(observation).includes('{"facts":[}'), false);
});
