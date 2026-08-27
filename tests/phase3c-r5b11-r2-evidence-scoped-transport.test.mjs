import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import {
  SAFETY_POLICY_CODES,
  buildProviderTransportToolSchemaV3,
  mapProviderTransportV3ToCanonicalV2,
  providerTransportToolSchemaV1,
  providerTransportToolSchemaV2,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV2,
  validateProviderTransportToolArgumentsV3,
} from "../server/decision/externalModelContractV2.mjs";
import { lintDeepSeekRequestShapeV2, schemaHash } from "../server/decision/deepseekStrictSchema.mjs";
import { buildSafeEvidenceCatalog, buildRequestScopedRiskCategoryCatalog } from "../server/decision/riskCategoryContract.mjs";
import { buildR5B11R1SyntheticInput, freezeR5B11R1Request } from "../scripts/run-phase3c-r5b11-r1-risk-category-revalidation.mjs";

const DATA_QUALITY = "SYN-EVIDENCE-DATA-QUALITY-001";
const FINANCIAL = "SYN-EVIDENCE-FINANCIAL-001";
const env = {
  AI_PROVIDER: "openai-compatible",
  ALLOW_EXTERNAL_AI: "true",
  LLM_API_KEY: "synthetic-test-secret",
  LLM_BASE_URL: "https://api.deepseek.com/beta",
  LLM_MODEL: "deepseek-v4-pro",
  LLM_MAX_TOKENS: "2400",
  LLM_TIMEOUT_MS: "1000",
  PHASE3C_NATIVE_JSON_MODE: "strict-tool",
  PHASE3C_SCHEMA_VERSION: "v6-r2",
};

function fixture() {
  const frozen = freezeR5B11R1Request({ env });
  return {
    input: buildR5B11R1SyntheticInput(),
    evidenceTokens: frozen.evidenceAllowlist,
    evidenceTypeByToken: frozen.evidenceTypeByToken,
  };
}

function transportOutput({ category = "contradiction", categoryEvidence = [DATA_QUALITY] } = {}) {
  return {
    facts: [{ label: "Synthetic fact", value: "A synthetic review signal is present.", evidenceToken: DATA_QUALITY }],
    inferences: [{ inference: "The synthetic evidence supports review.", evidenceTokens: [DATA_QUALITY] }],
    evidence: [{ evidenceToken: DATA_QUALITY, value: "Synthetic evidence only." }],
    confidence: { level: "Medium", reason: "One synthetic evidence reference is available." },
    recommendedActions: [{
      action: "Review the synthetic signal",
      ownerRole: "synthetic-reviewer",
      dueWindow: "synthetic-window",
      basis: "The supplied synthetic evidence supports review.",
      draftStatus: "Draft only",
      evidenceTokens: [DATA_QUALITY],
    }],
    priority: "Monitor",
    riskCategories: [{ code: category, evidenceTokens: categoryEvidence }],
    provider: "openai-compatible",
    model: "deepseek-v4-pro",
    modelVersion: "deepseek-v4-pro",
    fallback: { state: "not_applicable", reason: "Synthetic strict Tool response." },
    safety: {
      identityMasked: true,
      exactAmountWithheld: true,
      rawTimelineWithheld: true,
      crmWritebackPerformed: false,
      policyAssertions: Object.fromEntries(SAFETY_POLICY_CODES.map((code) => [code, true])),
    },
    limitations: { codes: ["IDENTITY_MASKED", "EXACT_AMOUNT_WITHHELD", "RAW_TIMELINE_WITHHELD"] },
  };
}

function providerResponse(output) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id: "synthetic-response",
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 },
      choices: [{
        finish_reason: "tool_calls",
        message: { tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: JSON.stringify(output) } }] },
      }],
    }),
  };
}

test("Transport v1 and v2 historical schema hashes remain unchanged", () => {
  assert.equal(schemaHash(providerTransportToolSchemaV1), "12838eecacdaabe7f2e1a55c660847652dcfc2abcb87e381f1b45d8aba851236");
  assert.equal(schemaHash(providerTransportToolSchemaV2), "69083368d8ea37beb074441a723eb274cfbcebb6ef86b5a429ff90695e74869d");
});

test("Transport v2 behavior remains unchanged while v3 requires a risk category", () => {
  const options = fixture();
  const output = transportOutput();
  output.riskCategories = [];
  const v2Output = structuredClone(output);
  v2Output.safety = {
    identityMasked: true,
    exactAmountWithheld: true,
    rawTimelineWithheld: true,
    crmWritebackPerformed: false,
    policyCodes: [...SAFETY_POLICY_CODES],
  };
  assert.equal(validateProviderTransportToolArgumentsV2(v2Output, options).ok, true);
  assert.equal(validateProviderTransportToolArgumentsV3(output, options).errors.includes("risk_category_required"), true);
});

test("request-scoped catalog derives categories only from compatible safe evidence", () => {
  const options = fixture();
  const catalog = buildRequestScopedRiskCategoryCatalog(options);
  assert.equal(catalog.some((item) => item.code === "route"), false);
  assert.deepEqual(catalog.find((item) => item.code === "gap")?.compatibleEvidenceTokens, [FINANCIAL]);
  assert.deepEqual(catalog.find((item) => item.code === "meeting")?.compatibleEvidenceTokens, ["SYN-EVIDENCE-ENGAGEMENT-001"]);
});

test("Safe Evidence Catalog contains only tokens and safe type codes", () => {
  const options = fixture();
  const catalog = buildSafeEvidenceCatalog(options);
  assert.equal(catalog.length, options.evidenceTokens.length);
  assert.deepEqual(Object.keys(catalog[0]), ["evidenceToken", "evidenceTypes"]);
  assert.equal(/expected|scenario|golden|customerName|exactAmount|rawTimeline/i.test(JSON.stringify(catalog)), false);
});

test("Transport v3 strict schema is complete and binds categories to compatible tokens", () => {
  const options = fixture();
  const schema = buildProviderTransportToolSchemaV3(options);
  const body = buildComparisonRequestBody({
    safeContext: options.input.safeContext,
    accountAggregate: options.input.accountAggregate,
    evidenceTypeByToken: options.evidenceTypeByToken,
    page: "synthetic",
    env,
    nativeMode: true,
    schemaVersion: "v6-r2",
  });
  const lint = lintDeepSeekRequestShapeV2(body);
  assert.equal(lint.ok, true);
  assert.equal(lint.schema.missingTypeAnyOfRefCount, 0);
  assert.equal(lint.schema.missingRequiredCount, 0);
  assert.equal(lint.schema.missingAdditionalPropertiesCount, 0);
  assert.equal(lint.schema.unsupportedKeywordCount, 0);
  assert.equal(schemaHash(body.tools[0].function.parameters), schemaHash(schema));
  const gap = schema.properties.riskCategories.items.anyOf.find((branch) => branch.properties.code.enum[0] === "gap");
  assert.deepEqual(gap.properties.evidenceTokens.items.enum, [FINANCIAL]);
});

test("Transport v3 rejects a globally valid category with incompatible evidence", () => {
  const options = fixture();
  const result = validateProviderTransportToolArgumentsV3(transportOutput({ category: "gap", categoryEvidence: [DATA_QUALITY] }), options);
  assert.equal(result.ok, false);
  assert.ok(result.schemaErrors.includes("$.riskCategories[0]:anyOf"));
  assert.ok(result.errors.includes("risk_category_evidence_incompatible"));
});

test("Transport v3 rejects unavailable route category before canonical mapping", () => {
  const options = fixture();
  const result = validateProviderTransportToolArgumentsV3(transportOutput({ category: "route", categoryEvidence: [DATA_QUALITY] }), options);
  assert.equal(result.ok, false);
  assert.ok(result.schemaErrors.includes("$.riskCategories[0]:anyOf"));
});

test("Transport v3 requires every fixed Safety assertion", () => {
  const options = fixture();
  const missing = transportOutput();
  delete missing.safety.policyAssertions.NO_RAW_CRM;
  const missingResult = validateProviderTransportToolArgumentsV3(missing, options);
  assert.equal(missingResult.ok, false);
  assert.ok(missingResult.schemaErrors.includes("$.safety.policyAssertions:missing:NO_RAW_CRM"));

  const falseAssertion = transportOutput();
  falseAssertion.safety.policyAssertions.NO_EXACT_AMOUNT = false;
  const falseResult = validateProviderTransportToolArgumentsV3(falseAssertion, options);
  assert.equal(falseResult.ok, false);
  assert.ok(falseResult.schemaErrors.includes("$.safety.policyAssertions.NO_EXACT_AMOUNT:enum"));
});

test("Transport v3 mapper deterministically supplies complete Canonical safety codes", () => {
  const options = fixture();
  const a = mapProviderTransportV3ToCanonicalV2(transportOutput(), options);
  const b = mapProviderTransportV3ToCanonicalV2(transportOutput(), options);
  assert.deepEqual(a, b);
  assert.deepEqual(a.output.safety.policyCodes, SAFETY_POLICY_CODES);
  assert.equal(Object.hasOwn(a.output.safety, "policyAssertions"), false);
  assert.deepEqual(a.output.riskCategories, ["contradiction"]);
  assert.equal(Object.hasOwn(a.output.recommendedActions[0], "evidenceTokens"), false);
  assert.equal(validateExternalModelResponseV2(a.output, { evidenceTokens: options.evidenceTokens }).ok, true);
});

test("v6-r2 request exposes evidence types but no expected answer or runtime metadata", () => {
  const options = fixture();
  const body = buildComparisonRequestBody({ safeContext: options.input.safeContext, accountAggregate: options.input.accountAggregate, evidenceTypeByToken: options.evidenceTypeByToken, page: "synthetic", env, nativeMode: true, schemaVersion: "v6-r2" });
  const userInput = JSON.parse(body.messages[1].content);
  const serialized = JSON.stringify(userInput);
  assert.equal(userInput.providerTransportContractVersion, "Provider Transport Contract v3");
  assert.equal(Array.isArray(userInput.safeEvidenceCatalog), true);
  assert.equal(/expectedRisk|expectedCategory|expectedAnswer|scenarioId|goldenMetadata|DEMO-OPP/i.test(serialized), false);
});

test("v6-r2 local provider response passes schema mapping evidence and safety once", async () => {
  const options = fixture();
  let calls = 0;
  const result = await callComparisonProvider({
    safeContext: options.input.safeContext,
    accountAggregate: options.input.accountAggregate,
    evidenceTypeByToken: options.evidenceTypeByToken,
    page: "synthetic",
    env,
    fetchImpl: async () => { calls += 1; return providerResponse(transportOutput()); },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.transportContractVersion, "Provider Transport Contract v3");
  assert.deepEqual(result.output.safety.policyCodes, SAFETY_POLICY_CODES);
  assert.equal(result.safetyStatus, "pass");
});

test("v6-r2 mapping failure retains safe usage and response hashes without retry", async () => {
  const options = fixture();
  let calls = 0;
  const result = await callComparisonProvider({
    safeContext: options.input.safeContext,
    accountAggregate: options.input.accountAggregate,
    evidenceTypeByToken: options.evidenceTypeByToken,
    page: "synthetic",
    env,
    fetchImpl: async () => { calls += 1; return providerResponse(transportOutput({ category: "gap", categoryEvidence: [DATA_QUALITY] })); },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.diagnosticCategory, "ARGUMENT_SCHEMA_INVALID");
  assert.deepEqual(result.usage, { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 });
  assert.match(result.responseBodyHash, /^[0-9a-f]{64}$/);
  assert.match(result.toolArgumentsHash, /^[0-9a-f]{64}$/);
});

test("v6-r2 fails before a provider call when the Evidence Type index is incomplete", async () => {
  const options = fixture();
  const incomplete = structuredClone(options.evidenceTypeByToken);
  delete incomplete[options.evidenceTokens[0]];
  let calls = 0;
  const result = await callComparisonProvider({
    safeContext: options.input.safeContext,
    accountAggregate: options.input.accountAggregate,
    evidenceTypeByToken: incomplete,
    page: "synthetic",
    env,
    fetchImpl: async () => { calls += 1; return providerResponse(transportOutput()); },
  });
  assert.equal(calls, 0);
  assert.equal(result.called, false);
  assert.equal(result.reason, "evidence_type_index_invalid");
});

test("offline repair source contains no real Canary executor or D365 request", async () => {
  const files = [
    "server/decision/riskCategoryContract.mjs",
    "server/decision/externalModelContractV2.mjs",
    "server/decision/deepseekStrictSchema.mjs",
    "server/decision/comparisonProvider.mjs",
  ];
  const source = (await Promise.all(files.map((file) => fs.readFile(new URL(`../${file}`, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /DEMO-OPP-002|WinOpportunity|LoseOpportunity|api\/data\/v9|crm\.dynamics\.com/);
});
