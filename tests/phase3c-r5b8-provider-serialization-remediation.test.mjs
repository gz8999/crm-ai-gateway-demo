import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildR5B8RequestMeta,
  executeR5B8Remediation,
  validateR5B8SyntheticInput,
} from "../scripts/run-phase3c-r5b8-provider-serialization-remediation.mjs";
import { buildR5B3SyntheticInput } from "../scripts/run-phase3c-r5b3-synthetic-probe.mjs";

const env = {
  LLM_BASE_URL: "https://api.deepseek.com/beta",
  LLM_MODEL: "deepseek-v4-pro",
  LLM_API_KEY: "synthetic-only",
  LLM_TIMEOUT_MS: "1000",
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

function responseFor(argumentsText) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id: "synthetic-r5b8-response",
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 },
      choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: argumentsText } }] } }],
    }),
  };
}

function fakeFetch(response) {
  let calls = 0;
  return { fetchImpl: async () => { calls += 1; return response; }, calls: () => calls };
}

test("R5B8 preserves V2 parameters and changes only schema duplication plus Tool description", () => {
  const request = buildR5B8RequestMeta({ env });
  assert.equal(request.v2ParameterSchemaHash, request.remediatedParameterSchemaHash);
  assert.equal(request.parameterSchemaHash, request.remediatedParameterSchemaHash);
  assert.deepEqual(request.changedFields, ["messages.1.content", "tools.0.function.description"]);
  assert.deepEqual(request.unexpectedChangedFields, []);
  assert.equal(request.duplicateSchemaRemoved, true);
  assert.equal(request.v2DuplicateSchemaPresent, true);
  assert.equal(request.functionDescriptionAdded, true);
  assert.equal(request.strict, true);
  assert.equal(request.responseFormatSent, false);
  assert.equal(request.nodeCompleteness.missingRequiredCount, 0);
  assert.equal(request.nodeCompleteness.missingAdditionalPropertiesCount, 0);
  assert.equal(request.nodeCompleteness.missingArrayItemsCount, 0);
  assert.equal(request.nodeCompleteness.unsupportedKeywordCount, 0);
});

test("R5B8 synthetic input remains non-CRM and forbidden-field free", () => {
  const result = validateR5B8SyntheticInput(buildR5B3SyntheticInput());
  assert.equal(result.flagsReady, true);
  assert.equal(result.realCrmTokenCount, 0);
  assert.equal(result.forbiddenFieldCount, 0);
  assert.equal(result.identityCount, 0);
  assert.equal(result.exactAmountCount, 0);
  assert.equal(result.rawTimelineCount, 0);
  assert.equal(result.scenarioGoldenCount, 0);
});

test("R5B8 valid local Tool arguments pass once and are privately diagnosed then deleted", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "r5b8-valid-"));
  try {
    const fake = fakeFetch(responseFor(JSON.stringify(validArguments)));
    const result = await executeR5B8Remediation({ env, fetchImpl: fake.fetchImpl, repoRoot, now: () => new Date("2026-07-19T00:00:00.000Z") });
    assert.equal(fake.calls(), 1);
    assert.equal(result.status, "completed");
    assert.equal(result.externalLlmCalls, 2);
    assert.equal(result.externalLlmCallsThisAttempt, 1);
    assert.equal(result.response.jsonParseReady, true);
    assert.equal(result.response.schemaValidationReady, true);
    assert.equal(result.response.canonicalMappingReady, true);
    assert.equal(result.response.evidenceValidationReady, true);
    assert.equal(result.response.safetyValidationReady, true);
    assert.equal(result.providerRequestCompatibilityReady, true);
    assert.equal(result.writeCount, 1);
    assert.equal(result.deleteCount, 1);
    assert.equal(result.rawFileExistsAfterDelete, false);
    assert.equal(result.retryCount, 0);
    const directory = path.join(repoRoot, "local-artifacts/gateway/phase3c-r5b8");
    await assert.rejects(fs.stat(path.join(directory, "arguments.raw.txt")));
    const privateManifest = JSON.parse(await fs.readFile(path.join(directory, "parse-diagnostics.private.json"), "utf8"));
    assert.equal(privateManifest.lifecycle, "deleted");
    assert.equal(privateManifest.rawFileExistsAfterDeletion, false);
    assert.equal(privateManifest.diagnosticsMetadata.toolSchemaHash, result.request.remediatedToolDefinitionHash);
    assert.equal(privateManifest.diagnosticsMetadata.requestSchemaHash, result.request.parameterSchemaHash);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test("R5B8 invalid JSON stops after one call with no repair or fallback", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "r5b8-invalid-"));
  try {
    const fake = fakeFetch(responseFor('{"facts":[{"label":"x" "value":"y"}]}'));
    const result = await executeR5B8Remediation({ env, fetchImpl: fake.fetchImpl, repoRoot });
    assert.equal(fake.calls(), 1);
    assert.equal(result.status, "stopped-safety");
    assert.equal(result.externalLlmCalls, 2);
    assert.equal(result.externalLlmCallsThisAttempt, 1);
    assert.equal(result.response.jsonParseReady, false);
    assert.equal(result.providerRequestCompatibilityReady, false);
    assert.equal(result.retryCount, 0);
    assert.equal(result.fixtureFallbackCount, 0);
    assert.equal(result.writeCount, 1);
    assert.equal(result.deleteCount, 1);
    assert.equal(result.rawFileExistsAfterDelete, false);
    assert.equal(Number.isInteger(result.diagnostics.parseErrorOffset), true);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test("R5B8 safety rejection preserves Tool, JSON, and strict mapping evidence", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "r5b8-safety-"));
  try {
    const unsafeArguments = { ...validArguments, limitations: ["raw timeline was not provided"] };
    const fake = fakeFetch(responseFor(JSON.stringify(unsafeArguments)));
    const result = await executeR5B8Remediation({ env, fetchImpl: fake.fetchImpl, repoRoot });
    assert.equal(fake.calls(), 1);
    assert.equal(result.status, "stopped-safety");
    assert.equal(result.failureCategory, "sensitive_output_rejected");
    assert.equal(result.safetyBlockedPatternKey, "raw_timeline");
    assert.equal(result.response.finishReasonReady, true);
    assert.equal(result.response.toolCallReady, true);
    assert.equal(result.response.argumentStringReady, true);
    assert.equal(result.response.jsonParseReady, true);
    assert.equal(result.response.schemaValidationReady, true);
    assert.equal(result.response.canonicalMappingReady, true);
    assert.equal(result.response.safetyValidationReady, false);
    assert.equal(result.providerRequestCompatibilityReady, true);
    assert.equal(result.phase3cR5B8Complete, true);
    assert.equal(result.outputSafetyHold, true);
    assert.equal(result.realCanaryAuthorized, false);
    assert.equal(result.retryCount, 0);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test("R5B8 refuses to execute the same consumed request body twice", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "r5b8-consumed-"));
  try {
    const first = fakeFetch(responseFor(JSON.stringify(validArguments)));
    const firstResult = await executeR5B8Remediation({ env, fetchImpl: first.fetchImpl, repoRoot });
    assert.equal(firstResult.status, "completed");
    assert.equal(first.calls(), 1);

    const second = fakeFetch(responseFor(JSON.stringify(validArguments)));
    const secondResult = await executeR5B8Remediation({ env, fetchImpl: second.fetchImpl, repoRoot });
    assert.equal(secondResult.status, "stopped-safety");
    assert.equal(secondResult.stopReason, "r5b8_probe_already_consumed");
    assert.equal(second.calls(), 0);
    assert.equal(secondResult.externalLlmCallsThisAttempt, 0);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test("R5B8 source has no D365, CRM write, production, or embedded secret path", async () => {
  const source = await fs.readFile(new URL("../scripts/run-phase3c-r5b8-provider-serialization-remediation.mjs", import.meta.url), "utf8");
  assert.equal(/org91f5f65\.crm5\.dynamics\.com|lcn-crm\.crm7\.dynamics\.com/i.test(source), false);
  assert.equal(/sk-[A-Za-z0-9]{20,}/.test(source), false);
  assert.equal(/WinOpportunity|LoseOpportunity|\bPATCH\b|\bDELETE\b|Publish/i.test(source), false);
});
