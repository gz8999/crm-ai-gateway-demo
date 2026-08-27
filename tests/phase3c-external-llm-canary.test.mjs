import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { callComparisonProvider, buildComparisonPayload } from "../server/decision/comparisonProvider.mjs";
import { validateUnifiedOutput } from "../server/decision/comparisonSchema.mjs";
import { auditExternalOutput, estimateCost, validateSafeProviderInput } from "../scripts/run-phase3c-external-llm-canary.mjs";

const selectionPath = new URL("../docs/gateway/external-llm-canary-selection-v3.json", import.meta.url);

test("Phase 3C frozen selection contains exactly 24 unique canaries", async () => {
  const selection = JSON.parse(await fs.readFile(selectionPath, "utf8"));
  assert.equal(selection.count, 24);
  assert.equal(selection.records.length, 24);
  assert.equal(new Set(selection.records.map((row) => row.opportunityToken)).size, 24);
  assert.equal(selection.providerInputScenarioIds, false);
});

test("Phase 3C provider input contains Safe Context only", () => {
  const safeContext = { opportunityToken: "DEMO-OPP-001", priority: "Monitor", amountBand: "100K-1M", accountAggregate: { accountToken: "DEMO-ACC-001", whitespaceCategory: "none" } };
  const payload = buildComparisonPayload({ safeContext, accountAggregate: safeContext.accountAggregate, page: "risk" });
  const serialized = JSON.stringify(payload.providerInput).toLowerCase();
  assert.equal(validateSafeProviderInput(payload.providerInput).ok, true);
  assert.equal(serialized.includes("scenarioid"), false);
  assert.equal(serialized.includes("golden"), false);
  assert.equal(serialized.includes("raw_crm"), false);
  assert.equal(serialized.includes("exact_amount"), false);
});

test("Phase 3C single-attempt gate prevents retry after provider error", async () => {
  let calls = 0;
  const result = await callComparisonProvider({
    safeContext: { opportunityToken: "DEMO-OPP-001", priority: "Monitor" },
    accountAggregate: { accountToken: "DEMO-ACC-001" },
    page: "risk",
    env: { AI_PROVIDER: "openai-compatible", ALLOW_EXTERNAL_AI: "true", LLM_BASE_URL: "https://api.deepseek.com", LLM_MODEL: "deepseek-v4-pro", LLM_API_KEY: "test-only", LLM_CANARY_SINGLE_ATTEMPT: "true" },
    fetchImpl: async () => { calls += 1; return { ok: false, status: 503 }; },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider_unavailable");
});

test("Phase 3C successful response records sanitized usage and model", async () => {
  const output = { id: "risk-DEMO-OPP-001", title: "Risk", fact: [{ label: "Priority", value: "Monitor", source: "safeContext.priority" }], inference: "Continue monitoring based on the supplied safe signals.", evidence: [{ label: "Priority", value: "Monitor", source: "safeContext.priority" }], confidence: { level: "High", reason: "Safe signal is clear." }, recommendedAction: [{ title: "Monitor cadence", reason: "Continue the current review cadence.", owner: "Owner token", due: "Next review", status: "Draft only" }], priority: "Monitor" };
  let calls = 0;
  let requestBody;
  const result = await callComparisonProvider({
    safeContext: { opportunityToken: "DEMO-OPP-001", priority: "Monitor" },
    accountAggregate: { accountToken: "DEMO-ACC-001" },
    page: "risk",
    env: { AI_PROVIDER: "openai-compatible", ALLOW_EXTERNAL_AI: "true", LLM_BASE_URL: "https://api.deepseek.com", LLM_MODEL: "deepseek-v4-pro", LLM_API_KEY: "test-only", LLM_CANARY_SINGLE_ATTEMPT: "true" },
    fetchImpl: async (_url, options) => { calls += 1; requestBody = JSON.parse(options.body); return { ok: true, status: 200, text: async () => JSON.stringify({ model: "deepseek-v4-pro", usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140, ignored_secret: "never kept" }, choices: [{ message: { content: JSON.stringify(output) } }] }) }; },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.deepEqual(result.usage, { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 });
  assert.equal(result.providerModel, "deepseek-v4-pro");
  assert.deepEqual(requestBody.thinking, { type: "disabled" });
  assert.match(requestBody.messages[0].content, /valid JSON object/i);
  assert.equal(validateUnifiedOutput(result.output).ok, true);
  assert.equal(estimateCost(result.usage), 0.0000783);
});

test("Phase 3C hallucination audit rejects unsupported evidence and healthy escalation", () => {
  const input = { context: { priority: "Monitor" }, offlineEvaluationLenses: ["healthy-control"] };
  const high = { fact: [{ label: "Priority", value: "Monitor", source: "safeContext.priority" }], evidence: [{ label: "External", value: "A market disruption occurred.", source: "external.market" }], priority: "High" };
  const result = auditExternalOutput({ output: high, input });
  assert.equal(result.ok, false);
});

test("Phase 3C safe context rejects forbidden identity and raw-content keys", () => {
  assert.equal(validateSafeProviderInput({ opportunityToken: "DEMO-OPP-001", contact_name: "synthetic" }).ok, false);
  assert.equal(validateSafeProviderInput({ opportunityToken: "DEMO-OPP-001", timeline: "raw timeline" }).ok, false);
});
