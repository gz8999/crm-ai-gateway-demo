import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import {
  DECISION_PACK_CARDINALITY_CONTRACT,
  DECISION_PACK_CARDINALITY_CONTRACT_HASH,
  collectionCardinality,
} from "../server/decision/decisionPackCardinalityContract.mjs";
import {
  PROVIDER_TRANSPORT_CONTRACT_V7_VERSION,
  mapProviderTransportV7ToCanonicalV2,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV7,
  validateScopedOutputSafetyV2,
} from "../server/decision/externalModelContractV2.mjs";
import { lintDeepSeekRequestShapeV2, lintDeepSeekSchemaCompleteness, schemaHash } from "../server/decision/deepseekStrictSchema.mjs";
import { validateCanonicalBusinessReadability } from "../server/decision/safeFactCatalog.mjs";
import {
  auditR6R1Cardinality,
  buildR6R1FrozenContract,
  buildValidR6R1Sample,
  runR6R1InvalidCorpus,
  runR6R1ValidCorpus,
} from "../scripts/run-phase3c-r6-r1-cardinality-repair.mjs";
import { createCallBudget } from "../scripts/run-phase3c-fast-demo-validation.mjs";

const frozen = buildR6R1FrozenContract({ LLM_API_KEY: "local-test-only" });

test("R6-R1 cardinality contract is the single versioned source", () => {
  assert.equal(DECISION_PACK_CARDINALITY_CONTRACT.version, "Decision Pack Cardinality Contract v1");
  assert.match(DECISION_PACK_CARDINALITY_CONTRACT_HASH, /^[0-9a-f]{64}$/u);
  assert.equal(DECISION_PACK_CARDINALITY_CONTRACT.collections.inferences.minItems, 1);
  assert.equal(DECISION_PACK_CARDINALITY_CONTRACT.evidenceReferences.inference.minItems, 1);
});

test("Tool and Runtime schemas have identical hashes and no cardinality drift", () => {
  const audit = auditR6R1Cardinality(frozen);
  assert.equal(audit.ready, true);
  assert.equal(audit.toolSchemaHash, audit.runtimeSchemaHash);
  assert.equal(audit.schemaCardinalityMismatchCount, 0);
  assert.equal(audit.runtimeOnlyCardinalityRules, 0);
  assert.equal(audit.toolOnlyCardinalityRules, 0);
  assert.equal(audit.independentCardinalityConstants, 0);
});

test("DeepSeek v6-r6 request uses the exact runtime schema and supported keywords", () => {
  const schema = frozen.body.tools[0].function.parameters;
  assert.equal(schemaHash(schema), frozen.hashes.schemaHash);
  assert.equal(lintDeepSeekRequestShapeV2(frozen.body).ok, true);
  const lint = lintDeepSeekSchemaCompleteness(schema);
  assert.equal(lint.missingTypeAnyOfRefCount, 0);
  assert.equal(lint.missingRequiredCount, 0);
  assert.equal(lint.missingAdditionalPropertiesCount, 0);
  assert.equal(lint.unsupportedKeywordCount, 0);
});

test("inference count below the authoritative minimum fails in Tool Schema", () => {
  const value = buildValidR6R1Sample(frozen, 0);
  value.inferences = {};
  const result = validateProviderTransportToolArgumentsV7(value, frozen.options);
  assert.equal(result.ok, false);
  assert.equal(result.schemaReady, false);
  assert.equal(result.schemaDiagnostics.errors.some((item) => item.instancePath === "/inferences"), true);
});

test("inference without evidence slot fails closed", () => {
  const value = buildValidR6R1Sample(frozen, 0);
  delete value.inferences.item01.evidenceTokens;
  assert.equal(validateProviderTransportToolArgumentsV7(value, frozen.options).ok, false);
});

test("empty inference evidence slots fail in Tool Schema", () => {
  const value = buildValidR6R1Sample(frozen, 0);
  value.inferences.item01.evidenceTokens = {};
  const result = validateProviderTransportToolArgumentsV7(value, frozen.options);
  assert.equal(result.ok, false);
  assert.equal(result.schemaReady, false);
});

test("unknown evidence token is never guessed or normalized", () => {
  const value = buildValidR6R1Sample(frozen, 0);
  value.inferences.item01.evidenceTokens.item01 = "SYN-EVIDENCE-UNKNOWN";
  const before = structuredClone(value);
  assert.equal(validateProviderTransportToolArgumentsV7(value, frozen.options).ok, false);
  assert.deepEqual(value, before);
});

test("duplicate evidence token fails closed", () => {
  const value = buildValidR6R1Sample(frozen, 0);
  value.inferences.item01.evidenceTokens.item02 = value.inferences.item01.evidenceTokens.item01;
  assert.equal(validateProviderTransportToolArgumentsV7(value, frozen.options).ok, false);
});

test("evidence type incompatible with a risk category fails closed", () => {
  const value = buildValidR6R1Sample(frozen, 0);
  value.riskCategories.item01 = { code: "route", evidenceTokens: { item01: "SYN-EVIDENCE-PIPELINE-001" } };
  assert.equal(validateProviderTransportToolArgumentsV7(value, frozen.options).ok, false);
});

test("unknown inference catalog code fails without fuzzy matching", () => {
  const value = buildValidR6R1Sample(frozen, 0);
  value.inferences.item01.inferenceCode = "INF-PIPELINE-STALL-TYPO";
  assert.equal(validateProviderTransportToolArgumentsV7(value, frozen.options).ok, false);
});

test("extra output fields fail closed", () => {
  const value = buildValidR6R1Sample(frozen, 0);
  value.healthScore = 99;
  assert.equal(validateProviderTransportToolArgumentsV7(value, frozen.options).ok, false);
});

test("wrong collection representation fails closed", () => {
  const value = buildValidR6R1Sample(frozen, 0);
  value.facts = [];
  assert.equal(validateProviderTransportToolArgumentsV7(value, frozen.options).ok, false);
});

test("empty action selection fails directly in Tool Schema", () => {
  const value = buildValidR6R1Sample(frozen, 0);
  value.recommendedActions = {};
  const result = validateProviderTransportToolArgumentsV7(value, frozen.options);
  assert.equal(result.ok, false);
  assert.equal(result.schemaReady, false);
});

test("limitations below their authoritative minimum fail directly in Tool Schema", () => {
  const value = buildValidR6R1Sample(frozen, 0);
  value.limitations.codes = {};
  assert.equal(validateProviderTransportToolArgumentsV7(value, frozen.options).ok, false);
});

test("mapper accepts only valid Transport v7 and creates no unsupported fact", () => {
  const value = buildValidR6R1Sample(frozen, 3);
  const before = structuredClone(value);
  const mapped = mapProviderTransportV7ToCanonicalV2(value, frozen.options);
  assert.deepEqual(value, before);
  const allowed = new Set(frozen.factCatalog.map((item) => JSON.stringify({ label: item.label, value: item.value, evidenceToken: item.evidenceToken })));
  assert.equal(mapped.output.facts.every((item) => allowed.has(JSON.stringify(item))), true);
});

test("mapped output passes Canonical v2 Evidence Readability and Safety", () => {
  const mapped = mapProviderTransportV7ToCanonicalV2(buildValidR6R1Sample(frozen, 4), frozen.options).output;
  assert.equal(validateExternalModelResponseV2(mapped, { evidenceTokens: frozen.evidenceTokens }).ok, true);
  assert.equal(validateCanonicalBusinessReadability(mapped).ready, true);
  assert.equal(validateScopedOutputSafetyV2(mapped).ok, true);
});

test("mapping is deterministic across JSON serialization", () => {
  const value = buildValidR6R1Sample(frozen, 9);
  const first = mapProviderTransportV7ToCanonicalV2(value, frozen.options).output;
  const second = mapProviderTransportV7ToCanonicalV2(JSON.parse(JSON.stringify(value)), frozen.options).output;
  assert.deepEqual(first, second);
});

test("1000 valid samples pass Transport Selection Canonical Evidence and Safety", () => {
  const corpus = runR6R1ValidCorpus(frozen, 1000);
  assert.equal(corpus.ready, true);
  assert.equal(corpus.passed, 1000);
  assert.equal(corpus.unexpectedFailureCount, 0);
  assert.equal(corpus.deterministicHashMismatchCount, 0);
  assert.equal(corpus.coverageReady, true);
});

test("all invalid sample families fail closed", () => {
  const corpus = runR6R1InvalidCorpus(frozen);
  assert.equal(corpus.ready, true);
  assert.equal(corpus.caseCount >= 14, true);
  assert.equal(corpus.rejectedCount, corpus.caseCount);
  assert.equal(corpus.unexpectedPassCount, 0);
});

test("maximum inference cardinality comes only from the contract", () => {
  const bound = collectionCardinality("inferences", { maximum: frozen.selectionCatalog.inferences.length });
  assert.deepEqual(bound, { minItems: 1, maxItems: 3, maximumSource: 3 });
});

test("one valid local Provider Tool Call maps through Transport v7 without retry", async () => {
  const output = buildValidR6R1Sample(frozen, 2);
  const envelope = {
    id: "synthetic-response",
    model: "deepseek-v4-pro",
    choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: JSON.stringify(output) } }] } }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  };
  let calls = 0;
  const result = await callComparisonProvider({
    safeContext: frozen.input.safeContext,
    accountAggregate: frozen.input.accountAggregate,
    page: "phase3c-r6-r1-local-mock",
    evidenceTypeByToken: frozen.evidenceTypeByToken,
    env: frozen.providerEnv,
    fetchImpl: async () => { calls += 1; return new Response(JSON.stringify(envelope), { status: 200, headers: { "content-type": "application/json" } }); },
    requestCorrelation: "synthetic-local-correlation",
  });
  assert.equal(result.ok, true);
  assert.equal(result.transportContractVersion, PROVIDER_TRANSPORT_CONTRACT_V7_VERSION);
  assert.equal(result.attempts, 1);
  assert.equal(calls, 1);
});

test("an empty inference local Provider output stops before canonical mapping", async () => {
  const output = buildValidR6R1Sample(frozen, 0);
  output.inferences = {};
  const envelope = { id: "synthetic-response", model: "deepseek-v4-pro", choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: JSON.stringify(output) } }] } }], usage: {} };
  const result = await callComparisonProvider({
    safeContext: frozen.input.safeContext,
    accountAggregate: frozen.input.accountAggregate,
    page: "phase3c-r6-r1-local-empty",
    evidenceTypeByToken: frozen.evidenceTypeByToken,
    env: frozen.providerEnv,
    fetchImpl: async () => new Response(JSON.stringify(envelope), { status: 200, headers: { "content-type": "application/json" } }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.diagnosticCategory, "ARGUMENT_SCHEMA_INVALID");
  assert.equal(result.canonicalMappingReady, false);
});

test("external call budget remains exactly one", async () => {
  const budget = createCallBudget(1);
  let calls = 0;
  const guard = budget.guard({ expectedBody: "{}", phase: "synthetic", token: "SYN-R6-R1", correlation: "local", ledger: { record: async () => undefined }, fetchImpl: async () => { calls += 1; return new Response("{}", { status: 200 }); } });
  await guard("https://api.deepseek.com/beta/chat/completions", { method: "POST", body: "{}" });
  await assert.rejects(guard("https://api.deepseek.com/beta/chat/completions", { method: "POST", body: "{}" }), /external_call_limit_exceeded/u);
  assert.equal(calls, 1);
  assert.equal(budget.stats().total, 1);
});

test("synthetic request contains no real Canary token D365 path or write authorization", async () => {
  const request = JSON.stringify(frozen.body);
  assert.equal(request.includes("DEMO-OPP-002"), false);
  assert.equal(request.includes("DEMO-OPP-"), false);
  const source = await fs.readFile(new URL("../scripts/run-phase3c-r6-r1-cardinality-repair.mjs", import.meta.url), "utf8");
  assert.equal(source.includes("createDynamicsClient"), false);
  assert.equal(source.includes("evaluate:quality"), false);
  assert.equal(source.includes("crmWriteback: false"), true);
  assert.equal(source.includes("realCanaryAuthorized: false"), true);
});

test("public R6-R1 artifacts expose no raw arguments secret or real CRM token", async () => {
  const names = [
    "decision-pack-cardinality-contract-v1.json",
    "phase3c-r6-r1-cardinality-analysis.md",
    "phase3c-r6-r1-schema-parity.json",
    "phase3c-r6-r1-valid-invalid-corpus.json",
    "phase3c-r6-r1-synthetic-probe-report.md",
    "phase3c-r6-r1-runtime-manifest.json",
    "phase3c-r6-r1-safety-report.md",
    "phase3c-r6-r2-repeatability-decision-pack-zh.md",
  ];
  const text = (await Promise.all(names.map((name) => fs.readFile(new URL(`../docs/gateway/${name}`, import.meta.url), "utf8")))).join("\n");
  assert.equal(/sk-[A-Za-z0-9_-]{12,}/u.test(text), false);
  assert.equal(/DEMO-OPP-\d+/u.test(text), false);
  assert.equal(text.includes("arguments.raw.txt"), false);
  assert.equal(text.includes("Authorization: Bearer"), false);
});
