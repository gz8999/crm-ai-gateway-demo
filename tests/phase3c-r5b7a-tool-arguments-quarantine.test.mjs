import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  TOOL_ARGUMENT_SYNTAX_CATEGORIES,
  captureSyntheticToolArguments,
  diagnoseToolArguments,
  finalizeSyntheticToolArgumentQuarantine,
  validateSyntheticQuarantineEligibility,
} from "../server/decision/toolArgumentsQuarantine.mjs";

const eligible = {
  testOnly: true,
  syntheticProbe: true,
  d365Record: false,
  runtimeEligible: false,
  realCanary: false,
  realCrmTokenCount: 0,
  forbiddenFieldCount: 0,
};

function envelope(argumentsValue = "{\"facts\":[]}") {
  return {
    choices: [{
      finish_reason: "tool_calls",
      message: { tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: argumentsValue } }] },
    }],
  };
}

test("Synthetic quarantine requires every flag and zero forbidden counts", () => {
  assert.equal(validateSyntheticQuarantineEligibility(eligible).eligible, true);
  assert.equal(validateSyntheticQuarantineEligibility({ ...eligible, realCanary: true }).eligible, false);
  assert.equal(validateSyntheticQuarantineEligibility({ ...eligible, realCrmTokenCount: 1 }).eligible, false);
  assert.equal(validateSyntheticQuarantineEligibility({ ...eligible, forbiddenFieldCount: 1 }).eligible, false);
});

test("all R5B7A JSON syntax categories are deterministic and local", () => {
  const cases = [
    ["{\"a\":1,}", TOOL_ARGUMENT_SYNTAX_CATEGORIES.TRAILING_COMMA],
    ["{\"a\":\"line\nbreak\"}", TOOL_ARGUMENT_SYNTAX_CATEGORIES.UNESCAPED_CONTROL_CHARACTER],
    ["{\"a\":\"x}", TOOL_ARGUMENT_SYNTAX_CATEGORIES.UNTERMINATED_STRING],
    ["{\"a\":\"\\q\"}", TOOL_ARGUMENT_SYNTAX_CATEGORIES.INVALID_ESCAPE],
    ["{'a':1}", TOOL_ARGUMENT_SYNTAX_CATEGORIES.SINGLE_QUOTED_KEY_OR_VALUE],
    ["note {\"a\":1}", TOOL_ARGUMENT_SYNTAX_CATEGORIES.LEADING_OR_TRAILING_TEXT],
    ["{\"a\":1} note", TOOL_ARGUMENT_SYNTAX_CATEGORIES.LEADING_OR_TRAILING_TEXT],
    ["{\"a\":01}", TOOL_ARGUMENT_SYNTAX_CATEGORIES.INVALID_NUMBER],
    ["{\"a\":[1}", TOOL_ARGUMENT_SYNTAX_CATEGORIES.MISMATCHED_BRACKET],
    ["```json\n{}\n```", TOOL_ARGUMENT_SYNTAX_CATEGORIES.MARKDOWN_FENCE],
    [JSON.stringify(JSON.stringify({ a: 1 })), TOOL_ARGUMENT_SYNTAX_CATEGORIES.DOUBLE_ENCODED_JSON],
  ];
  for (const [value, expected] of cases) {
    const result = diagnoseToolArguments(value);
    assert.equal(result.publicDiagnostics.syntaxCategory, expected, value);
    assert.equal(result.publicDiagnostics.argumentsLength, value.length);
    assert.match(result.publicDiagnostics.argumentsSha256, /^[0-9a-f]{64}$/);
    assert.equal(typeof result.privateDiagnostics.escapedErrorWindow, "string");
  }
  const valid = diagnoseToolArguments("\uFEFF {\"a\":1} ");
  assert.equal(valid.publicDiagnostics.bomPresent, true);
  assert.equal(valid.publicDiagnostics.syntaxCategory, null);
});

test("diagnostics expose offset and private escaped window without exposing raw content publicly", () => {
  const result = diagnoseToolArguments("{\"secretField\":\"x}");
  assert.equal(result.publicDiagnostics.parseErrorType, "SyntaxError");
  assert.ok(result.publicDiagnostics.parseErrorOffset === null || Number.isInteger(result.publicDiagnostics.parseErrorOffset));
  assert.ok(result.publicDiagnostics.parseErrorLine === null || result.publicDiagnostics.parseErrorLine >= 1);
  assert.equal(Object.hasOwn(result.publicDiagnostics, "escapedErrorWindow"), false);
  assert.equal(JSON.stringify(result.publicDiagnostics).includes("secretField"), false);
  assert.equal(result.privateDiagnostics.escapedErrorWindow.includes("secretField"), true);
});

test("quarantine writes only eligible synthetic arguments with private permissions and supports deletion lifecycle", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "r5b7a-quarantine-"));
  try {
    const captured = await captureSyntheticToolArguments({
      envelope: envelope("{\"facts\":[}") ,
      eligibility: eligible,
      repoRoot,
      now: () => new Date("2026-07-19T00:00:00.000Z"),
    });
    assert.equal(captured.captured, true);
    const directory = path.join(repoRoot, "local-artifacts/gateway/phase3c-r5b7");
    const rawPath = path.join(directory, "arguments.raw.txt");
    const hashPath = path.join(directory, "arguments.sha256");
    const privatePath = path.join(directory, "parse-diagnostics.private.json");
    assert.equal((await fs.stat(rawPath)).mode & 0o777, 0o600);
    assert.equal((await fs.stat(hashPath)).mode & 0o777, 0o600);
    assert.equal((await fs.stat(privatePath)).mode & 0o777, 0o600);
    assert.equal((await fs.readFile(rawPath, "utf8")), "{\"facts\":[}");
    const lifecycle = await finalizeSyntheticToolArgumentQuarantine({ repoRoot, now: () => new Date("2026-07-19T00:01:00.000Z") });
    assert.equal(lifecycle.deleted, true);
    await assert.rejects(fs.stat(rawPath));
    const privateManifest = JSON.parse(await fs.readFile(privatePath, "utf8"));
    assert.equal(privateManifest.lifecycle, "deleted");
    assert.equal(privateManifest.rawFileExistsAfterDeletion, false);
    assert.match(privateManifest.rawArgumentsHashBeforeDeletion, /^[0-9a-f]{64}$/);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test("non-synthetic and real-canary inputs cannot capture arguments", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "r5b7a-ineligible-"));
  try {
    const nonSynthetic = await captureSyntheticToolArguments({ envelope: envelope(), eligibility: { ...eligible, testOnly: false }, repoRoot });
    const realCanary = await captureSyntheticToolArguments({ envelope: envelope(), eligibility: { ...eligible, realCanary: true }, repoRoot });
    assert.equal(nonSynthetic.captured, false);
    assert.equal(realCanary.captured, false);
    await assert.rejects(fs.stat(path.join(repoRoot, "local-artifacts/gateway/phase3c-r5b7")));
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test("R5B7A quarantine code stays offline, ignored, and free of secret sinks", async () => {
  const root = path.resolve(new URL("..", import.meta.url).pathname);
  const source = await fs.readFile(path.join(root, "server/decision/toolArgumentsQuarantine.mjs"), "utf8");
  const gitignore = await fs.readFile(path.join(root, ".gitignore"), "utf8");
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("console."), false);
  assert.equal(source.includes("Authorization"), false);
  assert.equal(source.includes("sk-"), false);
  assert.match(gitignore, /^local-artifacts\/$/m);
});
