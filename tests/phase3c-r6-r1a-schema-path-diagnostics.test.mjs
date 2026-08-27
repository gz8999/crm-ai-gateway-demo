import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import { DECISION_PACK_CARDINALITY_CONTRACT_HASH } from "../server/decision/decisionPackCardinalityContract.mjs";
import { validateJsonSchemaWithDiagnostics } from "../server/decision/jsonSchemaDiagnostics.mjs";
import {
  SAFE_SCHEMA_DIAGNOSTIC_FIELDS,
  SAFE_SCHEMA_FAILURE_CLASSES,
  buildSafeSchemaPathDiagnostics,
} from "../server/decision/safeSchemaPathDiagnostics.mjs";
import {
  R6_CAPTURE_DIR,
  finalizeSyntheticToolArgumentQuarantine,
  writeSyntheticToolArgumentQuarantine,
} from "../server/decision/toolArgumentsQuarantine.mjs";
import { createCallBudget } from "../scripts/run-phase3c-fast-demo-validation.mjs";
import {
  buildR6R1FrozenContract,
  buildValidR6R1Sample,
} from "../scripts/run-phase3c-r6-r1-cardinality-repair.mjs";
import {
  buildR6R1AOfflineSummary,
  runR6R1ADiagnosticCorpus,
} from "../scripts/run-phase3c-r6-r1a-schema-path-diagnostics.mjs";

const EXPECTED_CARDINALITY_HASH = "fce9a5277979b6c35d515395720892857ae7afcb756d627cfac6b1811792376b";
const frozen = buildR6R1FrozenContract({ LLM_API_KEY: "local-test-only" });

test("R6-R1A classifies every local diagnostic sample with exact paths and keywords", () => {
  const corpus = runR6R1ADiagnosticCorpus(frozen);
  assert.equal(corpus.ready, true);
  assert.equal(corpus.caseCount >= 14, true);
  assert.equal(corpus.passed, corpus.caseCount);
  assert.equal(corpus.classificationAccuracy, 100);
  assert.equal(corpus.results.every((item) => item.actualPath === item.expectedPath && item.actualKeyword === item.expectedKeyword), true);
});

test("safe diagnostics record instance schema keyword and missing property", () => {
  const schema = { type: "object", properties: { inferences: { type: "object", properties: {}, required: [], additionalProperties: false } }, required: ["inferences"], additionalProperties: false };
  const validation = validateJsonSchemaWithDiagnostics({}, schema);
  const result = buildSafeSchemaPathDiagnostics({ schemaDiagnostics: validation, parsedValue: {} });
  assert.equal(result.primaryFailureClass, "MISSING_REQUIRED_PROPERTY");
  assert.equal(result.errors[0].instancePath, "");
  assert.equal(result.errors[0].schemaPath, "#/required");
  assert.equal(result.errors[0].keyword, "required");
  assert.equal(result.errors[0].missingProperty, "inferences");
});

test("safe diagnostics record additional property name but never its value", () => {
  const secretValue = "PRIVATE-ACTUAL-FIELD-VALUE";
  const schema = { type: "object", properties: {}, required: [], additionalProperties: false };
  const validation = validateJsonSchemaWithDiagnostics({ healthScore: secretValue }, schema);
  const result = buildSafeSchemaPathDiagnostics({ schemaDiagnostics: validation, parsedValue: { healthScore: secretValue } });
  const serialized = JSON.stringify(result);
  assert.equal(result.primaryFailureClass, "UNEXPECTED_PROPERTY");
  assert.equal(result.errors[0].additionalProperty, "healthScore");
  assert.equal(serialized.includes(secretValue), false);
});

test("Evidence diagnostics expose only counts and hashes", () => {
  const value = buildValidR6R1Sample(frozen, 0);
  const unknown = "SYN-PRIVATE-EVIDENCE-VALUE";
  value.inferences.item01.evidenceTokens.item01 = unknown;
  const envelope = validateJsonSchemaWithDiagnostics(value, frozen.schema);
  const result = buildSafeSchemaPathDiagnostics({ schemaDiagnostics: envelope, parsedValue: value, evidenceTokens: frozen.evidenceTokens });
  const serialized = JSON.stringify(result);
  assert.equal(result.primaryFailureClass, "EVIDENCE_NOT_ALLOWLISTED");
  assert.equal(result.evidence.unknownTokenCount >= 1, true);
  assert.equal(serialized.includes(unknown), false);
  assert.equal(serialized.includes(frozen.evidenceTokens[0]), false);
});

test("every public error is constrained to the diagnostic allowlist", () => {
  const validation = validateJsonSchemaWithDiagnostics("x", { type: "string", minLength: 2 });
  const result = buildSafeSchemaPathDiagnostics({ schemaDiagnostics: validation, parsedValue: "x" });
  assert.deepEqual(Object.keys(result.errors[0]), [...SAFE_SCHEMA_DIAGNOSTIC_FIELDS]);
  assert.equal(result.errors[0].stringLength, 1);
  assert.equal(result.errors[0].minLength, 2);
  assert.equal(result.primaryFailureClass, "STRING_MIN_LENGTH");
});

test("diagnostic class catalog covers every approved class", () => {
  for (const required of ["MISSING_REQUIRED_PROPERTY", "UNEXPECTED_PROPERTY", "TYPE_MISMATCH", "ENUM_MISMATCH", "CONST_MISMATCH", "ARRAY_MIN_ITEMS", "ARRAY_MAX_ITEMS", "STRING_MIN_LENGTH", "STRING_MAX_LENGTH", "PATTERN_MISMATCH", "ONE_OF_MISMATCH", "EVIDENCE_NOT_ALLOWLISTED", "EVIDENCE_DUPLICATE", "CATEGORY_EVIDENCE_INCOMPATIBLE", "CARDINALITY_MISMATCH", "UNKNOWN_SCHEMA_FAILURE"]) {
    assert.equal(SAFE_SCHEMA_FAILURE_CLASSES.includes(required), true);
  }
});

test("Provider local mock exposes precise safe schema path diagnostics", async () => {
  const output = buildValidR6R1Sample(frozen, 0);
  delete output.inferences;
  const envelope = {
    id: "synthetic-r6-r1a-response",
    model: "deepseek-v4-pro",
    choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: JSON.stringify(output) } }] } }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  };
  let parsed = null;
  const result = await callComparisonProvider({
    safeContext: frozen.input.safeContext,
    accountAggregate: frozen.input.accountAggregate,
    page: "phase3c-r6-r1a-local-mock",
    evidenceTypeByToken: frozen.evidenceTypeByToken,
    env: frozen.providerEnv,
    fetchImpl: async () => new Response(JSON.stringify(envelope), { status: 200, headers: { "content-type": "application/json" } }),
    requestCorrelation: "synthetic-r6-r1a-local",
    onToolArgumentsParsed: ({ value }) => { parsed = value; },
  });
  const safe = buildSafeSchemaPathDiagnostics({ schemaDiagnostics: result.schemaDiagnostics, parsedValue: parsed, evidenceTokens: frozen.evidenceTokens });
  assert.equal(result.diagnosticCategory, "ARGUMENT_SCHEMA_INVALID");
  assert.equal(safe.primaryFailureClass, "MISSING_REQUIRED_PROPERTY");
  assert.equal(safe.primarySchemaPath, "#/required");
  assert.equal(JSON.stringify(safe).includes(JSON.stringify(output)), false);
});

test("Tool Runtime parity and Cardinality hash remain frozen", async () => {
  const summary = await buildR6R1AOfflineSummary({ env: {} });
  assert.equal(DECISION_PACK_CARDINALITY_CONTRACT_HASH, EXPECTED_CARDINALITY_HASH);
  assert.equal(summary.cardinalityPreserved, true);
  assert.equal(summary.schemaParity.toolSchemaHash, summary.schemaParity.runtimeSchemaHash);
  assert.equal(summary.schemaParity.schemaCardinalityMismatchCount, 0);
  assert.equal(summary.schemaParity.runtimeOnlyCardinalityRules, 0);
  assert.equal(summary.schemaParity.toolOnlyCardinalityRules, 0);
  assert.equal(summary.validCorpus.passed, 1000);
  assert.equal(summary.invalidCorpus.rejectedCount, summary.invalidCorpus.caseCount);
});

test("external call budget remains exactly one", async () => {
  const budget = createCallBudget(1);
  let calls = 0;
  const guarded = budget.guard({ expectedBody: "{}", phase: "synthetic", token: "SYN-R6-R1A", correlation: "local", ledger: { record: async () => undefined }, fetchImpl: async () => { calls += 1; return new Response("{}", { status: 200 }); } });
  await guarded("https://api.deepseek.com/beta/chat/completions", { method: "POST", body: "{}" });
  await assert.rejects(guarded("https://api.deepseek.com/beta/chat/completions", { method: "POST", body: "{}" }), /external_call_limit_exceeded/u);
  assert.equal(calls, 1);
  assert.equal(budget.stats().total, 1);
});

test("private quarantine uses private permissions and deletes raw content", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "phase3c-r6-r1a-quarantine-"));
  try {
    const eligibility = { testOnly: true, syntheticProbe: true, d365Record: false, runtimeEligible: false, realCanary: false, realCrmTokenCount: 0, forbiddenFieldCount: 0 };
    await writeSyntheticToolArgumentQuarantine({ argumentsText: "{}", eligibility, repoRoot, captureDir: R6_CAPTURE_DIR, phase: "Phase 3C-R6-R1A" });
    const directory = path.join(repoRoot, R6_CAPTURE_DIR);
    assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(path.join(directory, "arguments.raw.txt"))).mode & 0o777, 0o600);
    const deleted = await finalizeSyntheticToolArgumentQuarantine({ repoRoot, captureDir: R6_CAPTURE_DIR });
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.rawFileExistsAfterDeletion, false);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test("R6-R1A executor has no D365 CRM write retry fallback or real Canary path", async () => {
  const source = await fs.readFile(new URL("../scripts/run-phase3c-r6-r1a-schema-path-diagnostics.mjs", import.meta.url), "utf8");
  assert.equal(source.includes("createDynamicsClient"), false);
  assert.equal(source.includes("DEMO-OPP-002"), false);
  assert.equal(source.includes("WinOpportunity"), false);
  assert.equal(source.includes("LoseOpportunity"), false);
  assert.equal(source.includes("method: \"PATCH\""), false);
  assert.equal(source.includes("method: \"DELETE\""), false);
  assert.equal(source.includes("retryCount: 0"), true);
  assert.equal(source.includes("fallbackCount: 0"), true);
});

test("all eight R6-R1A public artifacts exist without raw arguments or secrets", async () => {
  const files = [
    "phase3c-r6-r1a-schema-diagnostics-contract.json",
    "phase3c-r6-r1a-diagnostic-validation-report.md",
    "phase3c-r6-r1a-schema-error-catalog.json",
    "phase3c-r6-r1a-synthetic-probe-report.md",
    "phase3c-r6-r1a-runtime-manifest.json",
    "phase3c-r6-r1a-safety-report.md",
    "phase3c-r6-r2-final-repeatability-decision-pack-zh.md",
    "executive-demo-deterministic-status.md",
  ];
  for (const file of files) {
    const content = await fs.readFile(new URL(`../docs/gateway/${file}`, import.meta.url), "utf8");
    assert.equal(/sk-[A-Za-z0-9_-]{16,}/u.test(content), false);
    assert.equal(content.includes("rawArgumentsText"), false);
    assert.equal(content.includes("SYN-PRIVATE-EVIDENCE-VALUE"), false);
  }
});

test("deterministic Executive Demo remains independent of external validation", async () => {
  const content = await fs.readFile(new URL("../docs/gateway/executive-demo-deterministic-status.md", import.meta.url), "utf8");
  assert.match(content, /Executive Demo Deterministic Mode Ready: \*\*true\*\*/u);
  assert.match(content, /External LLM Required for Demo: \*\*false\*\*/u);
  assert.match(content, /Controlled Validation Pending/u);
});
