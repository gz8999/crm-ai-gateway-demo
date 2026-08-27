import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import {
  PROVIDER_TRANSPORT_CONTRACT_V6_VERSION,
  mapProviderTransportV6ToCanonicalV2,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV6,
  validateScopedOutputSafetyV2,
} from "../server/decision/externalModelContractV2.mjs";
import {
  DEEPSEEK_REFERENCE_ONLY_PROFILE_V6R5_VERSION,
  lintDeepSeekRequestShapeV2,
  lintDeepSeekSchemaCompleteness,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import { requestHash } from "../server/decision/externalModelContract.mjs";
import { validateProviderSelectionCatalog } from "../server/decision/providerSelectionCatalog.mjs";
import { validateCanonicalBusinessReadability } from "../server/decision/safeFactCatalog.mjs";
import {
  buildR5CR2R3FrozenContract,
  buildR5CR2R3Summary,
  buildR5CR2R3TransportFixture,
} from "../scripts/run-phase3c-r5c-r2-r3-json-serialization-stability-repair.mjs";

const ROOT = process.cwd();
const ENV = Object.freeze({
  AI_PROVIDER: "openai-compatible",
  ALLOW_EXTERNAL_AI: "true",
  LLM_BASE_URL: "https://api.deepseek.com/beta",
  LLM_MODEL: "deepseek-v4-pro",
  LLM_API_KEY: "local-test-secret",
  LLM_TIMEOUT_MS: "1000",
  LLM_MAX_TOKENS: "2400",
  PHASE3C_NATIVE_JSON_MODE: "strict-tool",
  PHASE3C_SCHEMA_VERSION: "v6-r5",
});

test("v6-r5 is explicit opt-in and preserves v6-r4 while removing every free-text schema node", () => {
  const frozen = buildR5CR2R3FrozenContract();
  assert.equal(DEEPSEEK_REFERENCE_ONLY_PROFILE_V6R5_VERSION, "DeepSeek Decision Tool Reference Only Profile v6-r5");
  assert.equal(PROVIDER_TRANSPORT_CONTRACT_V6_VERSION, "Provider Transport Contract v6");
  assert.equal(schemaHash(frozen.schemaV5), "54fce23151dce092111df36ae5238795b0728bf62c96a2b6b8a2021ac944ff12");
  assert.equal(schemaHash(frozen.schemaV6), "44d6a254afecd0e2e2a91ed05207582705e1fc98d5c2cddb04e355129e4c78bc");
  assert.equal(countFreeTextNodes(frozen.schemaV5), 6);
  assert.equal(countFreeTextNodes(frozen.schemaV6), 0);
  assert.equal(allStringNodesAreEnums(frozen.schemaV6), true);
});

test("v6-r5 strict schema and request use only supported DeepSeek shapes", () => {
  const frozen = buildR5CR2R3FrozenContract();
  const lint = lintDeepSeekSchemaCompleteness(frozen.schemaV6);
  const request = lintDeepSeekRequestShapeV2(frozen.request);
  assert.equal(lint.missingTypeAnyOfRefCount, 0);
  assert.equal(lint.missingRequiredCount, 0);
  assert.equal(lint.missingAdditionalPropertiesCount, 0);
  assert.equal(lint.unsupportedKeywordCount, 0);
  assert.equal(request.ok, true);
  assert.equal(frozen.request.tools[0].function.strict, true);
  assert.equal(frozen.request.response_format, undefined);
  assert.equal(frozen.request.temperature, 0);
  assert.equal(frozen.request.stream, false);
});

test("selection catalogs are request-scoped, readable, and contain no real CRM values", () => {
  const frozen = buildR5CR2R3FrozenContract();
  const validation = validateProviderSelectionCatalog(frozen.selectionCatalog, { evidenceTokens: frozen.evidenceTokens });
  const text = JSON.stringify(frozen.selectionCatalog);
  assert.equal(validation.ready, true);
  assert.deepEqual(validation.counts, { inferences: 5, actions: 5, confidence: 3, evidence: 5 });
  assert.doesNotMatch(text, /DEMO-OPP|org91f5f65f|lcn-crm|@[A-Z0-9.-]+\.|\b[0-9a-f]{8}-[0-9a-f]{4}-/iu);
});

test("reference-only transport expands deterministically to readable Canonical v2", () => {
  const frozen = buildR5CR2R3FrozenContract();
  const fixture = buildR5CR2R3TransportFixture(frozen);
  const validation = validateProviderTransportToolArgumentsV6(fixture, frozen.options);
  const mapped = mapProviderTransportV6ToCanonicalV2(fixture, frozen.options);
  assert.equal(validation.ok, true);
  assert.equal(validateExternalModelResponseV2(mapped.output, { evidenceTokens: frozen.evidenceTokens }).ok, true);
  assert.equal(validateCanonicalBusinessReadability(mapped.output).ready, true);
  assert.equal(validateScopedOutputSafetyV2(mapped.output).ok, true);
  assert.equal(mapped.output.facts.length, 14);
  assert.equal(mapped.output.inferences.length, 1);
  assert.equal(mapped.output.recommendedActions.length, 1);
  assert.match(mapped.output.recommendedActions[0].basis, /^\[SYN-EVIDENCE-/u);
});

test("unknown duplicate or incompatible references fail closed", () => {
  const frozen = buildR5CR2R3FrozenContract();
  const cases = [
    (value) => { value.inferences[0].inferenceCode = "INF-UNKNOWN"; },
    (value) => { value.recommendedActions[0].actionCode = "ACT-UNKNOWN"; },
    (value) => { value.inferences[0].evidenceTokens = ["SYN-EVIDENCE-FINANCIAL-001"]; },
    (value) => { value.facts.push({ ...value.facts[0] }); },
    (value) => { value.limitations.codes = ["IDENTITY_MASKED"]; },
  ];
  for (const mutate of cases) {
    const value = structuredClone(buildR5CR2R3TransportFixture(frozen));
    mutate(value);
    assert.equal(validateProviderTransportToolArgumentsV6(value, frozen.options).ok, false);
  }
});

test("one thousand local serializations produce one canonical hash", () => {
  const frozen = buildR5CR2R3FrozenContract();
  const fixture = buildR5CR2R3TransportFixture(frozen);
  const hashes = new Set();
  for (let index = 0; index < 1000; index += 1) {
    const parsed = JSON.parse(JSON.stringify(fixture));
    hashes.add(requestHash(mapProviderTransportV6ToCanonicalV2(parsed, frozen.options).output));
  }
  assert.equal(hashes.size, 1);
});

test("comparison provider accepts one valid v6-r5 mock Tool Call and does not retry", async () => {
  const frozen = buildR5CR2R3FrozenContract();
  const fixture = buildR5CR2R3TransportFixture(frozen);
  let calls = 0;
  const result = await callComparisonProvider({
    safeContext: frozen.input.safeContext,
    accountAggregate: frozen.input.accountAggregate,
    page: "synthetic-reference-only-serialization-stability",
    evidenceTypeByToken: frozen.evidenceTypeByToken,
    env: ENV,
    fetchImpl: async () => { calls += 1; return providerResponse(JSON.stringify(fixture)); },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 1);
  assert.equal(result.transportContractVersion, PROVIDER_TRANSPORT_CONTRACT_V6_VERSION);
  assert.equal(validateCanonicalBusinessReadability(result.output).ready, true);
});

test("invalid v6-r5 Tool Arguments fail after one parse without retry or repair", async () => {
  const frozen = buildR5CR2R3FrozenContract();
  let calls = 0;
  const result = await callComparisonProvider({
    safeContext: frozen.input.safeContext,
    accountAggregate: frozen.input.accountAggregate,
    page: "synthetic-reference-only-serialization-stability",
    evidenceTypeByToken: frozen.evidenceTypeByToken,
    env: ENV,
    fetchImpl: async () => { calls += 1; return providerResponse('{"facts":['); },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.attempts, 1);
  assert.equal(result.diagnosticCategory, "ARGUMENT_JSON_INVALID");
  assert.equal(result.safetyStatus, "not-run");
});

test("offline repair keeps Provider compatibility and real Canary gates closed", async () => {
  const summary = await buildR5CR2R3Summary();
  assert.equal(summary.status, "completed-offline");
  assert.equal(summary.gates.historicalR5CR2R2EvidenceUnchanged, true);
  assert.equal(summary.gates.referenceOnlyOutputReady, true);
  assert.equal(summary.gates.deterministicExpansionReady, true);
  assert.equal(summary.gates.providerRequestCompatibilityReady, false);
  assert.equal(summary.gates.realCanaryAuthorized, false);
  assert.equal(summary.counts.externalLlmCalls, 0);
  assert.equal(summary.counts.d365Get, 0);
  assert.equal(summary.counts.crmPost + summary.counts.crmPatch + summary.counts.crmDelete, 0);
});

test("public repair artifacts contain no raw arguments requests credentials or CRM payload", async () => {
  const files = [
    "docs/gateway/provider-transport-contract-v6.json",
    "docs/gateway/phase3c-r5c-r2-r3-validation-manifest.json",
    "docs/gateway/phase3c-r5c-r2-r3-json-serialization-stability-repair.md",
    "docs/gateway/phase3c-r5c-r2-r4-reference-only-probe-decision-pack-zh.md",
  ];
  const text = (await Promise.all(files.map((file) => fs.readFile(path.join(ROOT, file), "utf8")))).join("\n");
  assert.doesNotMatch(text, /"arguments"\s*:|"safeContext"\s*:|"rawRequest"\s*:|authorization\s*:\s*Bearer|sk-[A-Za-z0-9_-]{12,}/iu);
  assert.doesNotMatch(text, /org91f5f65f|lcn-crm|DEMO-OPP/iu);
});

function providerResponse(argumentsText) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id: "local-r5c-r2-r3-response",
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 120, completion_tokens: 90, total_tokens: 210 },
      choices: [{
        finish_reason: "tool_calls",
        message: { tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: argumentsText } }] },
      }],
    }),
  };
}

function countFreeTextNodes(schema) {
  let count = 0;
  walkSchema(schema, (node) => { if (node.type === "string" && !Array.isArray(node.enum)) count += 1; });
  return count;
}

function allStringNodesAreEnums(schema) {
  let ready = true;
  walkSchema(schema, (node) => { if (node.type === "string" && !Array.isArray(node.enum)) ready = false; });
  return ready;
}

function walkSchema(node, visit) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  visit(node);
  if (node.properties) for (const child of Object.values(node.properties)) walkSchema(child, visit);
  if (node.items) walkSchema(node.items, visit);
  if (node.anyOf) for (const child of node.anyOf) walkSchema(child, visit);
}
