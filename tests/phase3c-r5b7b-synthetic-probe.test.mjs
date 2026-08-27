import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildR5B7BConfigDiff,
  buildR5B7BRequestMeta,
  executeR5B7BProbe,
} from "../scripts/run-phase3c-r5b7b-synthetic-probe.mjs";
import { DEEPSEEK_TOOL_NAME } from "../server/decision/deepseekStrictSchema.mjs";

const env = {
  LLM_BASE_URL: "https://api.deepseek.com/beta",
  LLM_MODEL: "deepseek-v4-pro",
  LLM_API_KEY: "synthetic-only",
  LLM_TIMEOUT_MS: "1000",
  LLM_MAX_TOKENS: "2400",
};

const validArguments = {
  facts: [{ label: "Synthetic priority", value: "Monitor", evidenceToken: "SYN-EVID-001" }],
  inferences: [{ inference: "Synthetic evidence supports a review.", evidenceTokens: ["SYN-EVID-001"] }],
  evidence: [{ evidenceToken: "SYN-EVID-001", value: "Synthetic evidence only" }],
  confidence: { level: "High", reason: "Synthetic evidence is present." },
  recommendedActions: [{ action: "Review synthetic signal", ownerRole: "synthetic-owner", dueWindow: "synthetic-window", basis: "SYN-EVID-001", draftStatus: "Draft only" }],
  priority: "Monitor",
  riskCategories: [],
  provider: "openai-compatible",
  model: "deepseek-v4-pro",
  modelVersion: "deepseek-v4-pro",
  fallback: { state: "not_applicable", reason: "Synthetic probe." },
  safety: { customerIdentityMasked: true, exactAmountSentToModel: false, rawTimelineSent: false, crmWritebackEnabled: false },
  limitations: ["Synthetic probe only"],
};

function responseFor(argumentsText, finishReason = "tool_calls") {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id: "synthetic-r5b7b-response",
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 },
      choices: [{ finish_reason: finishReason, message: { tool_calls: [{ type: "function", function: { name: DEEPSEEK_TOOL_NAME, arguments: argumentsText } }] } }],
    }),
  };
}

function fakeFetch(response) {
  let calls = 0;
  return { fetchImpl: async () => { calls += 1; return response; }, calls: () => calls };
}

test("R5B7B request is byte-stable with R5B6 and has no configuration changes", () => {
  const diff = buildR5B7BConfigDiff({ env });
  const request = buildR5B7BRequestMeta({ env });
  assert.deepEqual(diff.changedFields, []);
  assert.deepEqual(diff.unexpectedChangedFields, []);
  assert.equal(diff.stableFieldsEqual, true);
  assert.equal(diff.maxTokens, 2400);
  assert.equal(request.schemaHash, "476cecc436dc452abc50988d337d779398159e8e0a4003bc8aa6153cbdab22b7");
  assert.equal(request.strict, true);
  assert.equal(request.maxTokens, 2400);
  assert.equal(request.thinkingType, "disabled");
  assert.equal(request.temperature, 0);
  assert.equal(request.stream, false);
  assert.equal(request.responseFormatSent, false);
  assert.deepEqual(request.nodeCompleteness, { missingTypeAnyOfRefCount: 0, missingRequiredCount: 0, missingAdditionalPropertiesCount: 0, unsupportedKeywordCount: 0 });
});
test("R5B7B stops after one invalid-JSON response and quarantines then deletes raw arguments", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "r5b7b-probe-"));
  try {
    const fake = fakeFetch(responseFor("{\"facts\":["));
    const result = await executeR5B7BProbe({ env, fetchImpl: fake.fetchImpl, repoRoot, now: () => new Date("2026-07-19T00:00:00.000Z") });
    assert.equal(fake.calls(), 1);
    assert.equal(result.status, "stopped-safety");
    assert.equal(result.externalLlmCalls, 1);
    assert.equal(result.jsonParseAttempts, 1);
    assert.equal(result.jsonParseSuccess, 0);
    assert.equal(result.failureCategory, "ARGUMENT_JSON_INVALID");
    assert.equal(result.writeCount, 1);
    assert.equal(result.deleteCount, 1);
    assert.equal(result.rawFileExistsAfterDelete, false);
    assert.equal(result.providerRequestCompatibilityReady, false);
    assert.equal(result.phase3cR5B7BComplete, false);
    assert.equal(result.d365Get, 0);
    assert.equal(result.crmWriteback, false);
    assert.equal(result.retryCount, 0);
    assert.equal(result.fixtureFallbackCount, 0);
    assert.equal(result.diagnostics.syntaxCategory, "MISMATCHED_BRACKET");
    const directory = path.join(repoRoot, "local-artifacts/gateway/phase3c-r5b7");
    await assert.rejects(fs.stat(path.join(directory, "arguments.raw.txt")));
    const privateManifest = JSON.parse(await fs.readFile(path.join(directory, "parse-diagnostics.private.json"), "utf8"));
    assert.equal(privateManifest.lifecycle, "deleted");
    assert.equal(privateManifest.rawFileExistsAfterDeletion, false);
    assert.equal(JSON.stringify(result).includes("facts\":["), false);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test("R5B7B successful local Tool Call still performs one parse and no quarantine", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "r5b7b-success-"));
  try {
    const fake = fakeFetch(responseFor(JSON.stringify(validArguments)));
    const result = await executeR5B7BProbe({ env, fetchImpl: fake.fetchImpl, repoRoot });
    assert.equal(fake.calls(), 1);
    assert.equal(result.status, "completed");
    assert.equal(result.jsonParseAttempts, 1);
    assert.equal(result.jsonParseSuccess, 1);
    assert.equal(result.schemaValidCount, 1);
    assert.equal(result.writeCount, 0);
    assert.equal(result.deleteCount, 0);
    assert.equal(result.providerRequestCompatibilityReady, true);
    assert.equal(result.phase3cR5B7BComplete, true);
    await assert.rejects(fs.stat(path.join(repoRoot, "local-artifacts/gateway/phase3c-r5b7")).then(() => { throw new Error("unexpected quarantine"); }));
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test("R5B7B is offline from D365, CRM writes, browser provider, and secrets", async () => {
  const source = await fs.readFile(new URL("../scripts/run-phase3c-r5b7b-synthetic-probe.mjs", import.meta.url), "utf8");
  assert.equal(/org91f5f65\.crm5\.dynamics\.com|lcn-crm\.crm7\.dynamics\.com/i.test(source), false);
  assert.equal(/sk-[A-Za-z0-9]{20,}/.test(source), false);
  const fake = fakeFetch(responseFor(JSON.stringify(validArguments)));
  const result = await executeR5B7BProbe({ env, fetchImpl: fake.fetchImpl });
  assert.equal(result.d365Get, 0);
  assert.equal(result.crmWriteback, false);
  assert.equal(result.productionRequests, 0);
  assert.equal(result.browserExternalRequests, 0);
});
