import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import {
  PROVIDER_TRANSPORT_CONTRACT_V1_VERSION,
  mapProviderTransportToCanonicalV2,
  providerTransportToolSchemaV1,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV1,
} from "../server/decision/externalModelContractV2.mjs";
import {
  R5B8_HISTORICAL_EVIDENCE_RULES,
  STRUCTURED_ACTION_EVIDENCE_RULES_V1,
  compareEvidenceValidationProfiles,
  evidenceValidationProfileHash,
} from "../server/decision/evidenceValidationProfiles.mjs";
import {
  deepseekDecisionToolSchemaV6,
  lintDeepSeekRequestShapeV2,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import { buildR5B10SharedInput } from "../scripts/run-phase3c-r5b10-serialization-isolation.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const EVIDENCE = "SYN-EVIDENCE-001";
const env = {
  LLM_BASE_URL: "https://api.deepseek.com/beta",
  LLM_MODEL: "deepseek-v4-pro",
  LLM_API_KEY: "test-only",
  LLM_TIMEOUT_MS: "1000",
  LLM_MAX_TOKENS: "2400",
  PHASE3C_NATIVE_JSON_MODE: "strict-tool",
  PHASE3C_SCHEMA_VERSION: "v6",
};

function transportOutput(evidenceToken = EVIDENCE) {
  return {
    facts: [{ label: "Synthetic fact", value: "Synthetic evidence is available.", evidenceToken }],
    inferences: [{ inference: "Synthetic evidence supports review.", evidenceTokens: [evidenceToken] }],
    evidence: [{ evidenceToken, value: "Synthetic evidence only." }],
    confidence: { level: "Medium", reason: "One synthetic evidence reference is available." },
    recommendedActions: [{
      action: "Review the synthetic signal",
      ownerRole: "synthetic-reviewer",
      dueWindow: "synthetic-window",
      basis: "Review is supported by the supplied synthetic evidence.",
      draftStatus: "Draft only",
      evidenceTokens: [evidenceToken],
    }],
    priority: "Monitor",
    riskCategories: ["synthetic-review"],
    provider: "openai-compatible",
    model: "deepseek-v4-pro",
    modelVersion: "deepseek-v4-pro",
    fallback: { state: "not_applicable", reason: "Synthetic strict Tool response." },
    safety: {
      identityMasked: true,
      exactAmountWithheld: true,
      rawTimelineWithheld: true,
      crmWritebackPerformed: false,
      policyCodes: ["SAFE_CONTEXT_ONLY", "NO_RAW_CRM", "NO_IDENTITY", "NO_EXACT_AMOUNT", "NO_RAW_TIMELINE", "NO_CRM_WRITEBACK"],
    },
    limitations: { codes: ["IDENTITY_MASKED", "EXACT_AMOUNT_WITHHELD", "RAW_TIMELINE_WITHHELD"] },
  };
}

function localProviderResponse(output) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id: "synthetic-r5b10-r1-response",
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: JSON.stringify(output) } }] } }],
    }),
  };
}

test("historical R5B8 and structured Action Evidence gates are reported separately", () => {
  const output = transportOutput();
  delete output.recommendedActions[0].evidenceTokens;
  const result = compareEvidenceValidationProfiles(output, [EVIDENCE]);
  assert.equal(result.historicalControl.ready, true);
  assert.equal(result.structuredAction.ready, false);
  assert.deepEqual(result.structuredAction.errors, ["action_evidence_required"]);
});

test("evidence validation profile fingerprints are stable and distinct", () => {
  const historical = evidenceValidationProfileHash(R5B8_HISTORICAL_EVIDENCE_RULES);
  const structured = evidenceValidationProfileHash(STRUCTURED_ACTION_EVIDENCE_RULES_V1);
  assert.match(historical, /^[0-9a-f]{64}$/);
  assert.match(structured, /^[0-9a-f]{64}$/);
  assert.notEqual(historical, structured);
});

test("Provider Transport Contract requires structured Action evidence tokens", () => {
  const action = providerTransportToolSchemaV1.properties.recommendedActions.items;
  assert.equal(action.additionalProperties, false);
  assert.ok(action.required.includes("evidenceTokens"));
  assert.deepEqual(action.properties.evidenceTokens, { type: "array", items: { type: "string" } });
});

test("Provider Transport Contract is strict-schema complete", () => {
  const input = buildR5B10SharedInput();
  const body = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: "synthetic-contract-repair", env, nativeMode: true, schemaVersion: "v6" });
  const lint = lintDeepSeekRequestShapeV2(body);
  assert.equal(lint.ok, true);
  assert.equal(lint.schema.missingTypeAnyOfRefCount, 0);
  assert.equal(lint.schema.missingRequiredCount, 0);
  assert.equal(lint.schema.missingAdditionalPropertiesCount, 0);
  assert.equal(lint.schema.unsupportedKeywordCount, 0);
});

test("valid structured Action evidence maps deterministically to Canonical v2", () => {
  const value = transportOutput();
  assert.equal(validateProviderTransportToolArgumentsV1(value, { evidenceTokens: [EVIDENCE] }).ok, true);
  const canonical = mapProviderTransportToCanonicalV2(value, { evidenceTokens: [EVIDENCE] });
  assert.equal(canonical.recommendedActions[0].basis, `[${EVIDENCE}] ${value.recommendedActions[0].basis}`);
  assert.equal(canonical.recommendedActions[0].status, "Draft only");
  assert.equal(Object.hasOwn(canonical.recommendedActions[0], "evidenceTokens"), false);
  assert.equal(validateExternalModelResponseV2(canonical, { evidenceTokens: [EVIDENCE] }).ok, true);
});

test("missing Action evidence tokens fail closed", () => {
  const value = transportOutput();
  delete value.recommendedActions[0].evidenceTokens;
  const result = validateProviderTransportToolArgumentsV1(value, { evidenceTokens: [EVIDENCE] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("action_evidence_required"));
});

test("unknown Action evidence tokens fail closed", () => {
  const value = transportOutput("SYN-EVIDENCE-UNKNOWN");
  const result = validateProviderTransportToolArgumentsV1(value, { evidenceTokens: [EVIDENCE] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("action_evidence_invalid"));
});

test("empty Action evidence token arrays fail closed", () => {
  const value = transportOutput();
  value.recommendedActions[0].evidenceTokens = [];
  const result = validateProviderTransportToolArgumentsV1(value, { evidenceTokens: [EVIDENCE] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("action_evidence_required"));
});

test("extra Transport properties fail closed", () => {
  const value = transportOutput();
  value.recommendedActions[0].unapproved = true;
  const result = validateProviderTransportToolArgumentsV1(value, { evidenceTokens: [EVIDENCE] });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(","), /recommendedActions\[0\]:extra:unapproved/);
});

test("Transport mapper preserves facts and Action meaning without invention", () => {
  const value = transportOutput();
  const canonical = mapProviderTransportToCanonicalV2(value, { evidenceTokens: [EVIDENCE] });
  assert.deepEqual(canonical.facts, value.facts);
  assert.equal(canonical.recommendedActions[0].action, value.recommendedActions[0].action);
  assert.equal(canonical.recommendedActions[0].ownerRole, value.recommendedActions[0].ownerRole);
  assert.equal(canonical.recommendedActions[0].dueWindow, value.recommendedActions[0].dueWindow);
});

test("v6 request explicitly instructs structured Action Evidence and keeps strict Tool Calling", () => {
  const input = buildR5B10SharedInput();
  const body = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: "synthetic-contract-repair", env, nativeMode: true, schemaVersion: "v6" });
  assert.match(body.messages[0].content, /recommended action.*evidenceTokens/i);
  assert.equal(body.tools[0].function.strict, true);
  assert.equal(body.tools[0].function.parameters, deepseekDecisionToolSchemaV6);
  assert.equal(body.response_format, undefined);
  assert.equal(body.tool_choice.function.name, "emit_decision_pack");
  const user = JSON.parse(body.messages[1].content);
  assert.equal(user.providerTransportContractVersion, PROVIDER_TRANSPORT_CONTRACT_V1_VERSION);
});

test("v6 local Provider response maps successfully with no retry", async () => {
  const input = buildR5B10SharedInput();
  let calls = 0;
  const result = await callComparisonProvider({
    safeContext: input.safeContext,
    accountAggregate: input.accountAggregate,
    page: "synthetic-contract-repair",
    env,
    fetchImpl: async () => { calls += 1; return localProviderResponse(transportOutput()); },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 1);
  assert.equal(result.transportContractVersion, PROVIDER_TRANSPORT_CONTRACT_V1_VERSION);
  assert.equal(result.output.recommendedActions[0].basis.startsWith(`[${EVIDENCE}]`), true);
});

test("Provider Transport profile is opt-in and does not change v5", () => {
  const input = buildR5B10SharedInput();
  const v5 = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: "synthetic-contract-repair", env: { ...env, PHASE3C_SCHEMA_VERSION: "v5" }, nativeMode: true, schemaVersion: "v5" });
  const v6 = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: "synthetic-contract-repair", env, nativeMode: true, schemaVersion: "v6" });
  assert.equal(Object.hasOwn(v5.tools[0].function.parameters.properties.recommendedActions.items.properties, "evidenceTokens"), false);
  assert.equal(Object.hasOwn(v6.tools[0].function.parameters.properties.recommendedActions.items.properties, "evidenceTokens"), true);
});

test("historical Contract and R5B8 R5B9 evidence hashes remain unchanged", async () => {
  const expected = {
    "external-model-response-contract-v1.json": "f262cf6aa39a287393402594a8377920dcfe96d858141b398ada9ed0e7bd911e",
    "external-model-response-contract-v2.json": "0d0d932b0a552fae01d7522668892963b9c1bd14beef9095534793e2c395e241",
    "phase3c-r5b8-compatibility-decision.md": "abc159ac60ce87f4bc7a139444476e56efb9e91dfa49e519523bb608b1adaa12",
    "phase3c-r5b9-runtime-manifest.json": "603917aea6ad1d78012b18c82944120d9ec58cac42d907da3422caf5ad12aa10",
  };
  for (const [name, hash] of Object.entries(expected)) {
    const value = await fs.readFile(path.join(ROOT, "docs", "gateway", name));
    assert.equal(createHash("sha256").update(value).digest("hex"), hash);
  }
});

test("repair remains offline and contains no D365 CRM write or embedded secret", async () => {
  const files = [
    "server/decision/externalModelContractV2.mjs",
    "server/decision/evidenceValidationProfiles.mjs",
    "server/decision/deepseekStrictSchema.mjs",
    "server/decision/comparisonProvider.mjs",
  ];
  const source = (await Promise.all(files.map((file) => fs.readFile(path.join(ROOT, file), "utf8")))).join("\n");
  assert.equal(/org91f5f65\.crm5\.dynamics\.com|lcn-crm\.crm7\.dynamics\.com/i.test(source), false);
  assert.equal(/sk-[A-Za-z0-9_-]{20,}/.test(source), false);
  assert.equal(/WinOpportunity|LoseOpportunity|\bPATCH\b|\bDELETE\b|Publish/i.test(source), false);
});

test("Provider Transport schema hash is stable within the runtime", () => {
  assert.equal(schemaHash(providerTransportToolSchemaV1), schemaHash(deepseekDecisionToolSchemaV6));
  assert.match(schemaHash(providerTransportToolSchemaV1), /^[0-9a-f]{64}$/);
});

test("committed Provider Transport Contract document matches the runtime schema", async () => {
  const document = JSON.parse(await fs.readFile(path.join(ROOT, "docs/gateway/provider-transport-contract-v1.json"), "utf8"));
  assert.equal(document.version, PROVIDER_TRANSPORT_CONTRACT_V1_VERSION);
  assert.equal(document.schemaHash, schemaHash(providerTransportToolSchemaV1));
  assert.deepEqual(document.schema, providerTransportToolSchemaV1);
});

test("repair manifest matches runtime fingerprints and preserves offline gates", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(ROOT, "docs/gateway/phase3c-r5b10-r1-validation-manifest.json"), "utf8"));
  assert.equal(manifest.providerTransportContract.schemaHash, schemaHash(providerTransportToolSchemaV1));
  assert.equal(manifest.validationProfiles.r5b8Historical.hash, evidenceValidationProfileHash(R5B8_HISTORICAL_EVIDENCE_RULES));
  assert.equal(manifest.validationProfiles.structuredActionV1.hash, evidenceValidationProfileHash(STRUCTURED_ACTION_EVIDENCE_RULES_V1));
  assert.deepEqual(manifest.requests, {
    externalLlmCalls: 0,
    d365Get: 0,
    crmPost: 0,
    crmPatch: 0,
    crmDelete: 0,
    crmWriteback: false,
    productionRequests: 0,
    retry: 0,
    fallback: 0,
  });
  assert.equal(manifest.gates.providerRequestCompatibilityReady, false);
  assert.equal(manifest.gates.realCanaryAuthorized, false);
});
