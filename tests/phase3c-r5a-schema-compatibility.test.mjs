import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import { validateExternalModelResponse } from "../server/decision/externalModelContract.mjs";
import {
  DEEPSEEK_TOOL_NAME,
  deepseekDecisionToolSchema,
  lintDeepSeekRequestShape,
  lintDeepSeekSchema,
  mapDeepSeekToolArgumentsToCanonical,
  validateDeepSeekToolArguments,
} from "../server/decision/deepseekStrictSchema.mjs";

const fixturePath = new URL("./fixtures/phase3c-r5a-deepseek-tool-fixtures.json", import.meta.url);
const schemaDocPath = new URL("../docs/gateway/deepseek-strict-tool-schema-v1.json", import.meta.url);
const r4RuntimePath = new URL("../docs/gateway/external-llm-canary-r4-runtime-manifest.json", import.meta.url);
const r4AuditPath = new URL("../docs/gateway/external-llm-canary-r4-request-audit.json", import.meta.url);

async function fixtures() { return JSON.parse(await fs.readFile(fixturePath, "utf8")); }

test("R4 HTTP 400 evidence is preserved and response body observability gap is explicit", async () => {
  const runtime = JSON.parse(await fs.readFile(r4RuntimePath, "utf8"));
  const audit = JSON.parse(await fs.readFile(r4AuditPath, "utf8"));
  assert.equal(runtime.stopReason, "provider_http_400");
  assert.equal(runtime.provider.externalCalls, 1);
  assert.equal(audit.records[0].opportunityToken, "DEMO-OPP-002");
  assert.equal(audit.records[0].httpStatus, 400);
  assert.equal(Object.hasOwn(audit.records[0], "responseBody"), false);
});

test("DeepSeek strict schema has complete required coverage and no unsupported keywords", () => {
  const result = lintDeepSeekSchema(deepseekDecisionToolSchema);
  assert.equal(result.serializable, true);
  assert.equal(result.objectCount, 8);
  assert.equal(result.requiredCoverageCount, 8);
  assert.equal(result.missingRequiredCount, 0);
  assert.equal(result.missingAdditionalPropertiesCount, 0);
  assert.equal(result.missingArrayItemsCount, 0);
  assert.equal(result.unsupportedKeywordCount, 0);
  assert.match(result.schemaHash, /^[0-9a-f]{64}$/);
});

test("committed schema document matches the runtime schema hash", async () => {
  const document = JSON.parse(await fs.readFile(schemaDocPath, "utf8"));
  const result = lintDeepSeekSchema(document.tool.function.parameters);
  assert.equal(document.schemaVersion, "DeepSeek Decision Tool Schema v1");
  assert.equal(document.tool.function.name, DEEPSEEK_TOOL_NAME);
  assert.equal(document.tool.function.strict, true);
  assert.deepEqual(document.lint.schemaHash, result.schemaHash);
  assert.deepEqual(document.lint.unsupportedKeywordCount, result.unsupportedKeywordCount);
});

test("schema linter rejects every R5A unsupported keyword class", () => {
  const forbidden = ["minLength", "maxLength", "minItems", "maxItems", "nullable", "oneOf", "allOf", "not", "dependentRequired", "unevaluatedProperties", "patternProperties", "propertyNames", "contains", "const"];
  for (const key of forbidden) {
    const copy = JSON.parse(JSON.stringify(deepseekDecisionToolSchema));
    copy[key] = key === "nullable" ? true : key === "const" ? true : key === "oneOf" || key === "allOf" ? [] : 1;
    const result = lintDeepSeekSchema(copy);
    assert.equal(result.unsupportedKeywords.includes(key), true, key);
  }
  const nullType = JSON.parse(JSON.stringify(deepseekDecisionToolSchema));
  nullType.properties.priority = { type: null };
  assert.equal(lintDeepSeekSchema(nullType).unsupportedKeywords.includes("type:null"), true);
});

test("minimal and full synthetic Tool Arguments fixtures validate", async () => {
  const value = await fixtures();
  const allowed = ["safeContext.priority", "safeContext.dataQualityStatus"];
  assert.equal(validateDeepSeekToolArguments(value.minimalValid, { evidenceTokens: allowed }).ok, true);
  assert.equal(validateDeepSeekToolArguments(value.fullValid, { evidenceTokens: allowed }).ok, true);
  const canonical = mapDeepSeekToolArgumentsToCanonical(value.minimalValid, { evidenceTokens: allowed });
  assert.equal(canonical.recommendedActions[0].status, "Draft only");
  assert.equal(Object.hasOwn(canonical.recommendedActions[0], "draftStatus"), false);
  assert.equal(validateExternalModelResponse(canonical, { evidenceTokens: allowed }).ok, true);
});

test("synthetic invalid fixtures fail closed", async () => {
  const { minimalValid } = await fixtures();
  const cases = [
    ["nested_extra", () => ({ ...minimalValid, confidence: { ...minimalValid.confidence, extra: true } }), "$.confidence:extra"],
    ["missing_required", () => { const copy = { ...minimalValid }; delete copy.limitations; return copy; }, "$:missing:limitations"],
    ["wrong_type", () => ({ ...minimalValid, priority: 3 }), "$.priority:enum"],
    ["bad_evidence", () => ({ ...minimalValid, facts: [{ ...minimalValid.facts[0], evidenceToken: "safeContext.unknown" }] }), "fact:evidence"],
    ["invalid_confidence", () => ({ ...minimalValid, confidence: { ...minimalValid.confidence, level: "Certain" } }), "confidence_level"],
    ["invalid_priority", () => ({ ...minimalValid, priority: "Urgent" }), "priority"],
    ["empty_limitations", () => ({ ...minimalValid, limitations: [] }), "limitations_required"],
    ["action_missing", () => ({ ...minimalValid, recommendedActions: [{ ...minimalValid.recommendedActions[0], draftStatus: undefined }] }), "action_fields"],
  ];
  for (const [name, build, expected] of cases) {
    const result = validateDeepSeekToolArguments(build(), { evidenceTokens: ["safeContext.priority"] });
    assert.equal(result.ok, false, name);
    assert.equal(result.errors.some((error) => error.includes(expected)), true, `${name}: ${result.errors.join(",")}`);
  }
});

test("strict Tool Calling request shape is provider-compatible and has no response_format", async () => {
  const { minimalValid } = await fixtures();
  let requestBody;
  const result = await callComparisonProvider({
    safeContext: { opportunityToken: "SYNTH-001", priority: "Monitor" },
    accountAggregate: { accountToken: "SYNTH-ACCOUNT-001" },
    page: "cockpit",
    env: { AI_PROVIDER: "openai-compatible", ALLOW_EXTERNAL_AI: "true", LLM_BASE_URL: "https://api.deepseek.com/beta", LLM_MODEL: "deepseek-v4-pro", LLM_API_KEY: "test-only", LLM_CANARY_SINGLE_ATTEMPT: "true", PHASE3C_NATIVE_JSON_MODE: "strict-tool" },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true, status: 200, text: async () => JSON.stringify({ model: "deepseek-v4-pro", choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: DEEPSEEK_TOOL_NAME, arguments: JSON.stringify(minimalValid) } }] } }] }) };
    },
  });
  const shape = lintDeepSeekRequestShape(requestBody);
  assert.equal(shape.ok, true, shape.errors.join(","));
  assert.deepEqual(Object.keys(requestBody).sort(), ["max_tokens", "messages", "model", "stream", "temperature", "thinking", "tool_choice", "tools"].sort());
  assert.equal(requestBody.response_format, undefined);
  assert.equal(requestBody.tools.length, 1);
  assert.equal(requestBody.tools[0].function.name, DEEPSEEK_TOOL_NAME);
  assert.equal(requestBody.tools[0].function.strict, true);
  assert.equal(result.ok, true);
  assert.equal(result.output.recommendedActions[0].status, "Draft only");
});

test("R5A has no new external-call authorization or runtime selection", async () => {
  const runtime = JSON.parse(await fs.readFile(r4RuntimePath, "utf8"));
  assert.equal(runtime.provider.externalCalls, 1);
  assert.equal(runtime.execution.requestedCount, 1);
  assert.equal(runtime.execution.completedCount, 0);
  assert.equal(runtime.execution.remainingCount, 23);
});
