import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import { validateProviderTransportToolArgumentsV6 } from "../server/decision/externalModelContractV2.mjs";
import { validateJsonSchemaWithDiagnostics } from "../server/decision/jsonSchemaDiagnostics.mjs";
import {
  R6_CAPTURE_DIR,
  finalizeSyntheticToolArgumentQuarantine,
  writeSyntheticToolArgumentQuarantine,
} from "../server/decision/toolArgumentsQuarantine.mjs";
import {
  auditTransportV6Schema,
  buildR6FrozenContract,
  buildValidTransportSample,
  runInvalidCorpus,
  runValidCorpus,
  validateR6Transport,
} from "../scripts/run-phase3c-r6-transport-schema-recovery.mjs";
import { createCallBudget } from "../scripts/run-phase3c-fast-demo-validation.mjs";

const frozen = buildR6FrozenContract({ LLM_API_KEY: "local-test-only" });

test("R6 schema diagnostics include path and keyword without actual values", () => {
  const value = buildValidTransportSample(frozen, 0);
  value.priority = "SENSITIVE-ACTUAL-VALUE";
  const result = validateR6Transport(value, frozen);
  assert.equal(result.ready, false);
  assert.equal(result.diagnostics.some((item) => item.instancePath === "/priority" && item.keyword === "enum"), true);
  const serialized = JSON.stringify(result.diagnostics);
  assert.equal(serialized.includes("SENSITIVE-ACTUAL-VALUE"), false);
  assert.equal(serialized.includes("actualValue"), false);
  assert.equal(serialized.includes("rawArguments"), false);
});

test("generic diagnostics report missing required and unexpected properties safely", () => {
  const schema = { type: "object", properties: { state: { type: "string", enum: ["Ready"] } }, required: ["state"], additionalProperties: false };
  const missing = validateJsonSchemaWithDiagnostics({}, schema);
  const extra = validateJsonSchemaWithDiagnostics({ state: "Ready", surprise: true }, schema);
  assert.equal(missing.errors[0].instancePath, "");
  assert.equal(missing.errors[0].keyword, "required");
  assert.equal(missing.errors[0].missingProperty, "state");
  assert.equal(extra.errors[0].keyword, "additionalProperties");
  assert.equal(extra.errors[0].unexpectedProperty, "surprise");
});

test("Transport v6 Tool and Runtime schemas share one authoritative builder", () => {
  const audit = auditTransportV6Schema(frozen);
  assert.equal(audit.ready, true);
  assert.equal(audit.schemaGeneratorSingleSourceReady, true);
  assert.equal(audit.canonicalMappingCoverage, 100);
  assert.deepEqual(audit.unmappedTransportFields, []);
  assert.deepEqual(audit.missingCanonicalRequirements, []);
});

test("1000 valid Transport v6 samples pass every offline gate", () => {
  const corpus = runValidCorpus(frozen, 1000);
  assert.equal(corpus.ready, true);
  assert.equal(corpus.passed, 1000);
  assert.equal(corpus.unexpectedFailureCount, 0);
  assert.equal(corpus.deterministicMappingMismatchCount, 0);
  assert.equal(corpus.coverageReady, true);
});

test("all 17 invalid Transport v6 samples fail closed", () => {
  const corpus = runInvalidCorpus(frozen);
  assert.equal(corpus.ready, true);
  assert.equal(corpus.caseCount, 17);
  assert.equal(corpus.rejectedCount, 17);
  assert.equal(corpus.unexpectedPassCount, 0);
});

test("unknown enums and missing properties are never added or completed", () => {
  const unknown = buildValidTransportSample(frozen, 1);
  unknown.priority = "UnknownPriority";
  const missing = buildValidTransportSample(frozen, 2);
  delete missing.confidence;
  assert.equal(validateR6Transport(unknown, frozen).ready, false);
  assert.equal(validateR6Transport(missing, frozen).ready, false);
  assert.equal(Object.hasOwn(missing, "confidence"), false);
  assert.equal(frozen.schema.properties.priority.enum.includes("UnknownPriority"), false);
});

test("semantic reference failure does not erase a successful structural schema result", () => {
  const frozen = buildR6FrozenContract({});
  const value = buildValidTransportSample(frozen, 0);
  value.inferences = [];
  const result = validateProviderTransportToolArgumentsV6(value, frozen.options);
  assert.equal(result.ok, false);
  assert.equal(result.schemaErrors.length, 0);
  assert.equal(result.schemaReady, true);
  assert.equal(result.schemaDiagnostics.ok, true);
});

test("Provider local mock exposes sanitized Transport v6 diagnostics", async () => {
  const output = buildValidTransportSample(frozen, 0);
  delete output.facts;
  const envelope = {
    id: "synthetic-response",
    model: "deepseek-v4-pro",
    choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: JSON.stringify(output) } }] } }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  };
  const result = await callComparisonProvider({
    safeContext: frozen.input.safeContext,
    accountAggregate: frozen.input.accountAggregate,
    page: "phase3c-r6-local-mock",
    evidenceTypeByToken: frozen.evidenceTypeByToken,
    env: frozen.providerEnv,
    fetchImpl: async () => new Response(JSON.stringify(envelope), { status: 200, headers: { "content-type": "application/json" } }),
    requestCorrelation: "synthetic-local-correlation",
  });
  assert.equal(result.called, true);
  assert.equal(result.diagnosticCategory, "ARGUMENT_SCHEMA_INVALID");
  assert.equal(result.schemaDiagnostics.errors.some((item) => item.keyword === "required" && item.missingProperty === "facts"), true);
  assert.equal(JSON.stringify(result).includes(JSON.stringify(output)), false);
});

test("R6 private quarantine uses 0700 and 0600 then deletes raw arguments", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "phase3c-r6-quarantine-"));
  try {
    const eligibility = { testOnly: true, syntheticProbe: true, d365Record: false, runtimeEligible: false, realCanary: false, realCrmTokenCount: 0, forbiddenFieldCount: 0 };
    await writeSyntheticToolArgumentQuarantine({ argumentsText: "{}", eligibility, repoRoot, captureDir: R6_CAPTURE_DIR, phase: "Phase 3C-R6" });
    const directory = path.join(repoRoot, R6_CAPTURE_DIR);
    assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(path.join(directory, "arguments.raw.txt"))).mode & 0o777, 0o600);
    const deleted = await finalizeSyntheticToolArgumentQuarantine({ repoRoot, captureDir: R6_CAPTURE_DIR });
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.rawFileExistsAfterDeletion, false);
    await assert.rejects(fs.stat(path.join(directory, "arguments.raw.txt")));
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test("R6 external call budget is exactly one with no retry or fallback", async () => {
  const budget = createCallBudget(1);
  let calls = 0;
  const guard = budget.guard({ expectedBody: "{}", phase: "synthetic", token: "SYN-R6", correlation: "local", ledger: { record: async () => undefined }, fetchImpl: async () => { calls += 1; return new Response("{}", { status: 200 }); } });
  await guard("https://api.deepseek.com/beta/chat/completions", { method: "POST", body: "{}" });
  await assert.rejects(guard("https://api.deepseek.com/beta/chat/completions", { method: "POST", body: "{}" }), /external_call_limit_exceeded/u);
  assert.equal(calls, 1);
  assert.equal(budget.stats().total, 1);
});

test("R6 synthetic request contains no real Canary token and deterministic demo stays independent", async () => {
  const request = JSON.stringify(frozen.body);
  assert.equal(request.includes("DEMO-OPP-002"), false);
  assert.equal(request.includes("DEMO-OPP-"), false);
  const source = await fs.readFile(new URL("../scripts/run-phase3c-r6-transport-schema-recovery.mjs", import.meta.url), "utf8");
  assert.equal(source.includes("createDynamicsClient"), false);
  assert.equal(source.includes("evaluate:quality"), false);
  assert.equal(source.includes("crmWriteback: false"), true);
  assert.equal(source.includes("executiveDemoDeterministicModeReady: true"), true);
});
