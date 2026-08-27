import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  EXTERNAL_MODEL_RESPONSE_V2_VERSION,
  PROVIDER_TRANSPORT_CONTRACT_V1_VERSION,
  PROVIDER_TRANSPORT_CONTRACT_V2_VERSION,
  PROVIDER_TRANSPORT_CONTRACT_V3_VERSION,
  PROVIDER_TRANSPORT_CONTRACT_V4_VERSION,
  PROVIDER_TRANSPORT_CONTRACT_V5_VERSION,
  PROVIDER_TRANSPORT_CONTRACT_V6_VERSION,
} from "../server/decision/externalModelContractV2.mjs";
import { buildR5CR2R3TransportFixture } from "../scripts/run-phase3c-r5c-r2-r3-json-serialization-stability-repair.mjs";
import {
  FAST_SCENARIO_PLAN,
  buildFastEvidenceTypeIndex,
  buildFastSyntheticFreeze,
  createCallBudget,
  executeFastSyntheticRepeatability,
  inspectProviderEnvelope,
  validateFastScenarioPlan,
  validateFastSyntheticPreflight,
  validateSnapshot,
} from "../scripts/run-phase3c-fast-demo-validation.mjs";

const SECRET_READY = Object.freeze({ oldExposedApiKeyRevoked: true, newServerSideSecretReady: true, secretBrowserExposure: false, secretGitExposure: false, secretBundleExposure: false, secretLogExposure: false, secretReportExposure: false });

test("3C-FAST keeps v6-r5 explicit and preserves Transport v1-v6 contracts", () => {
  const frozen = buildFastSyntheticFreeze({ LLM_MODEL: "deepseek-v4-pro" });
  assert.equal(frozen.providerEnv.PHASE3C_SCHEMA_VERSION, "v6-r5");
  assert.equal(frozen.providerEnv.PHASE3C_NATIVE_JSON_MODE, "strict-tool");
  assert.equal(frozen.body.tools[0].function.strict, true);
  assert.deepEqual([
    PROVIDER_TRANSPORT_CONTRACT_V1_VERSION,
    PROVIDER_TRANSPORT_CONTRACT_V2_VERSION,
    PROVIDER_TRANSPORT_CONTRACT_V3_VERSION,
    PROVIDER_TRANSPORT_CONTRACT_V4_VERSION,
    PROVIDER_TRANSPORT_CONTRACT_V5_VERSION,
    PROVIDER_TRANSPORT_CONTRACT_V6_VERSION,
  ], ["Provider Transport Contract v1", "Provider Transport Contract v2", "Provider Transport Contract v3", "Provider Transport Contract v4", "Provider Transport Contract v5", "Provider Transport Contract v6"]);
  assert.equal(EXTERNAL_MODEL_RESPONSE_V2_VERSION, "Decision Pack Model Response v2");
});

test("Synthetic probes use byte-identical envelopes and pass 2/2 with no retry or fallback", async () => {
  const frozen = buildFastSyntheticFreeze({ LLM_MODEL: "deepseek-v4-pro", LLM_API_KEY: "local-test-only" });
  const preflight = validateFastSyntheticPreflight(frozen, SECRET_READY);
  const fixture = buildR5CR2R3TransportFixture(frozen);
  const response = providerResponse(fixture);
  const bodies = [];
  const result = await executeFastSyntheticRepeatability({
    frozen,
    preflight,
    fetchImpl: async (_url, options) => { bodies.push(options.body); return response.clone(); },
    ledger: { record: async () => undefined },
    callBudget: createCallBudget(),
  });
  assert.equal(result.ready, true);
  assert.equal(result.probes.length, 2);
  assert.equal(new Set(bodies).size, 1);
  assert.equal(bodies[0], frozen.requestBytes);
  assert.equal(result.probes.every((item) => item.jsonReady && item.transportReady && item.canonicalReady && item.evidenceReady && item.safetyReady), true);
  assert.equal(result.probes.every((item) => item.hallucinationHardFailureCount === 0), true);
});

test("Probe 1 failure prevents Probe 2 and the global call budget fails closed", async () => {
  const frozen = buildFastSyntheticFreeze({ LLM_MODEL: "deepseek-v4-pro", LLM_API_KEY: "local-test-only" });
  let calls = 0;
  const failed = await executeFastSyntheticRepeatability({
    frozen,
    preflight: validateFastSyntheticPreflight(frozen, SECRET_READY),
    fetchImpl: async () => { calls += 1; return new Response(JSON.stringify({ error: { message: "mock" } }), { status: 400, headers: { "content-type": "application/json" } }); },
    ledger: { record: async () => undefined },
    callBudget: createCallBudget(),
  });
  assert.equal(failed.ready, false);
  assert.equal(failed.probes.length, 1);
  assert.equal(calls, 1);

  const budget = createCallBudget(1);
  const guard = budget.guard({ expectedBody: "{}", phase: "synthetic", token: "SYN", correlation: "x", ledger: { record: async () => undefined }, fetchImpl: async () => new Response("{}") });
  await guard("https://api.deepseek.com/beta/chat/completions", { method: "POST", body: "{}" });
  await assert.rejects(() => guard("https://api.deepseek.com/beta/chat/completions", { method: "POST", body: "{}" }), /external_call_limit_exceeded/);
});

test("Eight test-side lenses cover eight scenarios, seven departments, states, and health bands without duplicate calls", async () => {
  const selection = JSON.parse(await fs.readFile("docs/gateway/external-llm-canary-selection-v2.json", "utf8"));
  const result = validateFastScenarioPlan(FAST_SCENARIO_PLAN, selection);
  assert.equal(result.ready, true);
  assert.equal(result.scenarioCount, 8);
  assert.equal(result.departmentCount, 7);
  assert.equal(result.duplicateTokenCount, 0);
  assert.equal(result.demoOpp002Reused, true);
  assert.deepEqual(result.stateCoverage, ["Active", "Lost", "Won"]);
  assert.deepEqual(result.healthBandCoverage, ["high", "low", "medium"]);
});

test("Provider envelope rejects Scenario, Golden, GUID, exact amounts, and raw Timeline", () => {
  const frozen = buildFastSyntheticFreeze({ LLM_MODEL: "deepseek-v4-pro" });
  assert.equal(inspectProviderEnvelope(frozen.body, "SYN-OPP-REF-001").ready, true);
  const unsafe = structuredClone(frozen.body);
  const providerInput = JSON.parse(unsafe.messages[1].content);
  providerInput.scenarioId = "healthy-control";
  providerInput.rawTimeline = "body";
  unsafe.messages[1].content = JSON.stringify(providerInput);
  const result = inspectProviderEnvelope(unsafe, "SYN-OPP-REF-001");
  assert.equal(result.ready, false);
  assert.equal(result.scenarioGoldenCount > 0, true);
  assert.equal(result.rawTimelineCount > 0, true);
});

test("real evidence mapping makes growth and route categories evidence-compatible without changing Safe Context", () => {
  const externalRequest = {
    safeContext: {
      stagnationBand: "review",
      dataQualityCodes: [],
      varianceCategory: "review",
      decisionReadiness: "partial",
      priority: "Medium",
      amountBand: "medium",
      marginBand: "medium",
      relativeDate: "future",
      timelineSummary: { signalCount: 2 },
      interactionSignal: { routeConsistency: "review-required" },
      coverageStatus: "partial",
      dataQualitySignals: { missingCodes: [] },
    },
    accountAggregate: {
      serviceCoverageBand: "partial",
      whitespaceCategory: "growth-space",
      opportunityTrend: "stable",
      relationshipMaturity: "developing",
    },
  };
  const original = structuredClone(externalRequest);
  const result = buildFastEvidenceTypeIndex(externalRequest, { evidence: [{ source: "safeContext.stagnationBand" }] });
  assert.deepEqual(externalRequest, original);
  assert.equal(result.evidenceTypeByToken["safeContext.interactionSignal"].includes("ROUTE_CONSISTENCY"), true);
  assert.equal(result.evidenceTypeByToken["accountAggregate.whitespaceCategory"].includes("ACCOUNT_GROWTH"), true);
  assert.equal(result.evidenceTokens.includes("safeContext.stagnationBand"), true);
});

test("validated snapshot candidates contain only allowlisted Canonical content", () => {
  const snapshot = safeSnapshot();
  assert.equal(validateSnapshot(snapshot).ready, true);
  assert.equal(validateSnapshot({ ...snapshot, scenarioId: "healthy-control" }).ready, false);
  assert.equal(validateSnapshot({ ...snapshot, rawTimeline: "forbidden" }).ready, false);
});

function providerResponse(argumentsValue) {
  return new Response(JSON.stringify({ id: "mock-response", model: "deepseek-v4-pro", choices: [{ index: 0, finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "emit_decision_pack", arguments: JSON.stringify(argumentsValue) } }] } }], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } }), { status: 200, headers: { "content-type": "application/json" } });
}

function safeSnapshot() {
  return {
    label: "Validated External Analysis Snapshot",
    opportunityToken: "DEMO-OPP-002",
    healthScore: 75,
    healthGrade: "B",
    facts: [{ label: "推进状态", value: "需复核", evidenceToken: "safeContext.stagnationBand" }],
    inferences: [{ inference: "推进状态需要人工核实", evidenceTokens: ["safeContext.stagnationBand"] }],
    evidence: [{ evidenceToken: "safeContext.stagnationBand", value: "已提供脱敏的推进状态证据" }],
    riskCategories: ["stalled"],
    recommendedActions: [{ action: "确认下一步推进条件", ownerRole: "待人工指定", dueWindow: "待人工确定", basis: "依据推进证据人工确认", draftStatus: "Draft only", evidenceTokens: ["safeContext.stagnationBand"] }],
    confidence: { level: "Medium", reason: "当前证据支持判断但仍需人工核实" },
    limitations: ["Identity masked"],
    providerAlias: "DeepSeek",
    modelAlias: "deepseek-v4-pro",
    contextVersion: "Safe Context v2",
    transportContractVersion: "Provider Transport Contract v6",
    canonicalContractVersion: "Decision Pack Model Response v2",
    requestHash: "a".repeat(64),
    responseHash: "b".repeat(64),
    latencyMs: 100,
    tokenUsage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 },
    estimatedCostUsd: 0.001,
    safetyResult: "pass",
    validatedAt: "2026-07-19T00:00:00.000Z",
  };
}
