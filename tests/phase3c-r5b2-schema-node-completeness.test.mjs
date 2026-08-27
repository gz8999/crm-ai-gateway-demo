import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  DEEPSEEK_TOOL_NAME,
  deepseekDecisionToolSchema,
  deepseekDecisionToolSchemaV2,
  lintDeepSeekSchemaCompleteness,
  mapDeepSeekToolArgumentsToCanonicalV2,
  validateDeepSeekToolArgumentsV2,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";

const fixturePath = new URL("./fixtures/phase3c-r5a-deepseek-tool-fixtures.json", import.meta.url);
const schemaDocPath = new URL("../docs/gateway/deepseek-strict-tool-schema-v2.json", import.meta.url);

async function minimalValid() {
  const fixture = JSON.parse(await fs.readFile(fixturePath, "utf8"));
  return fixture.minimalValid;
}

test("V1 audit identifies every enum-only node while V2 is complete", () => {
  const v1 = lintDeepSeekSchemaCompleteness(deepseekDecisionToolSchema);
  const v2 = lintDeepSeekSchemaCompleteness(deepseekDecisionToolSchemaV2);
  assert.deepEqual(v1.missingTypeAnyOfRefPaths, [
    "#/properties/confidence/properties/level",
    "#/properties/recommendedActions/items/properties/draftStatus",
    "#/properties/priority",
    "#/properties/fallback/properties/state",
    "#/properties/safety/properties/customerIdentityMasked",
    "#/properties/safety/properties/exactAmountSentToModel",
    "#/properties/safety/properties/rawTimelineSent",
    "#/properties/safety/properties/crmWritebackEnabled",
  ]);
  assert.equal(v2.missingTypeAnyOfRefCount, 0);
  assert.equal(v2.missingRequiredCount, 0);
  assert.equal(v2.missingAdditionalPropertiesCount, 0);
  assert.equal(v2.unsupportedKeywordCount, 0);
  assert.equal(v2.totalSchemaNodeCount, 41);
  assert.equal(v2.typedNodeCount, 41);
});

test("committed V2 schema document matches the runtime schema", async () => {
  const document = JSON.parse(await fs.readFile(schemaDocPath, "utf8"));
  assert.equal(document.schemaVersion, "DeepSeek Decision Tool Schema v2");
  assert.equal(document.tool.function.name, DEEPSEEK_TOOL_NAME);
  assert.equal(document.tool.function.strict, true);
  assert.deepEqual(document.tool.function.parameters, deepseekDecisionToolSchemaV2);
  assert.equal(document.lint.schemaHash, schemaHash(deepseekDecisionToolSchemaV2));
});

test("recursive completeness linter rejects enum-only, array item, anyOf, and $defs gaps", () => {
  const typedEnum = lintDeepSeekSchemaCompleteness({ type: "string", enum: ["High", "Low"] });
  assert.equal(typedEnum.missingTypeAnyOfRefCount, 0);
  const cases = [
    ["enum-only", { type: "object", properties: { priority: { enum: ["High"] } }, required: ["priority"], additionalProperties: false }, "#/properties/priority"],
    ["array-item", { type: "object", properties: { values: { type: "array", items: { enum: ["x"] } } }, required: ["values"], additionalProperties: false }, "#/properties/values/items"],
    ["anyOf-branch", { type: "object", properties: { value: { anyOf: [{ enum: ["x"] }, { type: "string" }] } }, required: ["value"], additionalProperties: false }, "#/properties/value/anyOf/0"],
    ["defs-node", { type: "object", properties: { value: { $ref: "#/$defs/value" } }, required: ["value"], additionalProperties: false, $defs: { value: { enum: ["x"] } } }, "#/$defs/value"],
  ];
  for (const [name, schema, path] of cases) {
    const result = lintDeepSeekSchemaCompleteness(schema);
    assert.equal(result.missingTypeAnyOfRefCount, 1, name);
    assert.deepEqual(result.missingTypeAnyOfRefPaths, [path], name);
  }
});

test("pure $ref nodes are valid and target nodes are audited", () => {
  const schema = {
    type: "object",
    properties: { value: { $ref: "#/$defs/value" } },
    required: ["value"],
    additionalProperties: false,
    $defs: {
      value: { type: "string" },
    },
  };
  const result = lintDeepSeekSchemaCompleteness(schema);
  assert.equal(result.missingTypeAnyOfRefCount, 0);
  assert.equal(result.refNodeCount, 1);
  assert.equal(result.typedNodeCount, 2);
});

test("V2 arguments keep strict extra-key and required-field failures", async () => {
  const value = await minimalValid();
  const extra = validateDeepSeekToolArgumentsV2({ ...value, extra: true }, { evidenceTokens: ["safeContext.priority"] });
  assert.equal(extra.ok, false);
  assert.ok(extra.errors.some((error) => error.includes("extra")));
  const missing = { ...value };
  delete missing.limitations;
  const missingResult = validateDeepSeekToolArgumentsV2(missing, { evidenceTokens: ["safeContext.priority"] });
  assert.equal(missingResult.ok, false);
  assert.ok(missingResult.errors.some((error) => error.includes("limitations")));
});

test("V2 canonical mapping validates evidence and does not invent facts", async () => {
  const value = await minimalValid();
  const evidenceTokens = ["safeContext.priority"];
  const mapped = mapDeepSeekToolArgumentsToCanonicalV2(value, { evidenceTokens });
  assert.deepEqual(mapped.facts, value.facts);
  assert.equal(mapped.recommendedActions[0].status, "Draft only");
  assert.equal(Object.hasOwn(mapped.recommendedActions[0], "draftStatus"), false);
  const unknownEvidence = { ...value, facts: [{ ...value.facts[0], evidenceToken: "safeContext.unknown" }] };
  const rejected = validateDeepSeekToolArgumentsV2(unknownEvidence, { evidenceTokens });
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.includes("fact:evidence"));
});

test("V2 schema is an explicit opt-in request shape and remains local-testable", async () => {
  const value = await minimalValid();
  const request = buildComparisonRequestBody({
    safeContext: { opportunityToken: "SYNTH-001", priority: "Monitor" },
    accountAggregate: { accountToken: "SYNTH-ACCOUNT-001" },
    page: "cockpit",
    env: { LLM_MODEL: "synthetic-model" },
    nativeMode: true,
    schemaVersion: "v2",
  });
  assert.equal(request.tools[0].function.name, DEEPSEEK_TOOL_NAME);
  assert.equal(request.tools[0].function.parameters.properties.priority.type, "string");
  assert.equal(request.tools[0].function.parameters.properties.safety.properties.exactAmountSentToModel.type, "boolean");
  assert.equal(JSON.parse(request.messages[1].content).outputSchema.properties.priority.type, "string");
  assert.equal(JSON.stringify(value).includes("sk-"), false);
});

test("V2 provider path is opt-in and passes only a local fake response", async () => {
  const value = await minimalValid();
  let calls = 0;
  const result = await callComparisonProvider({
    safeContext: { opportunityToken: "SYNTH-001", priority: "Monitor" },
    accountAggregate: { accountToken: "SYNTH-ACCOUNT-001" },
    page: "cockpit",
    env: { AI_PROVIDER: "openai-compatible", ALLOW_EXTERNAL_AI: "true", LLM_BASE_URL: "http://127.0.0.1:9", LLM_MODEL: "synthetic-model", LLM_API_KEY: "synthetic-only", PHASE3C_NATIVE_JSON_MODE: "strict-tool", PHASE3C_SCHEMA_VERSION: "v2" },
    fetchImpl: async (_url, options) => {
      calls += 1;
      const body = JSON.parse(options.body);
      assert.equal(body.tools[0].function.parameters.properties.priority.type, "string");
      return { ok: true, status: 200, text: async () => JSON.stringify({ model: "synthetic-model", choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: DEEPSEEK_TOOL_NAME, arguments: JSON.stringify(value) } }] } }] }) };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.output.recommendedActions[0].status, "Draft only");
});

test("R5B2 remains offline and has no production or secret source markers", async () => {
  const providerSource = await fs.readFile(new URL("../server/decision/comparisonProvider.mjs", import.meta.url), "utf8");
  const schemaSource = await fs.readFile(new URL("../server/decision/deepseekStrictSchema.mjs", import.meta.url), "utf8");
  assert.equal(/lcn-crm\.crm7\.dynamics\.com|org91f5f65\.crm5\.dynamics\.com/i.test(`${providerSource}\n${schemaSource}`), false);
  assert.equal(/sk-[A-Za-z0-9]{12,}/.test(`${providerSource}\n${schemaSource}`), false);
  assert.equal(/fetch\s*\(/.test(schemaSource), false);
  assert.equal(/POST|PATCH|DELETE|Publish/.test(schemaSource), false);
});
