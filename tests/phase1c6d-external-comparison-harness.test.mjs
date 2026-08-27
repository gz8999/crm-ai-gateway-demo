import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createApp } from "../server/app.mjs";
import { createComparisonHarness } from "../server/decision/comparisonHarness.mjs";
import { buildComparisonPayload } from "../server/decision/comparisonProvider.mjs";
import { getDecisionView } from "../server/decision/decisionService.mjs";
import { validateUnifiedOutput } from "../server/decision/comparisonSchema.mjs";

const goldensPath = new URL("./fixtures/decision-scenario-goldens.json", import.meta.url);

test("comparison payload contains only Safe Context, account aggregate, schema, and generic page instruction", () => {
  const view = getDecisionView({ mode: "scenario", scenarioId: "multi-risk-priority" });
  const payload = buildComparisonPayload({ safeContext: view.safeContext, accountAggregate: view.safeContext.accountAggregate, page: "risk" });
  assert.deepEqual(Object.keys(payload.providerInput), ["safeDecisionContext", "safeAccountAggregate", "requestedPage", "outputSchemaVersion", "outputSchema"]);
  const serialized = JSON.stringify(payload);
  for (const forbidden of ["primaryScenario", "secondarySignals", "locationCode", "polCode", "podCode", "monthly", "customer_name", "timeline", "decision-scenario-goldens", "tests/fixtures"]) assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  assert.equal(serialized.includes("multi-risk-priority"), false);
});

test("explicit gate prevents calls unless feature, provider, configuration, and confirmation all pass", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("must not call"); };
  const disabled = createComparisonHarness({ env: {}, fetchImpl });
  assert.equal((await disabled.compare({ confirmed: true, scenarioId: "multi-risk-priority", opportunityToken: "DEMO-6C-OPP-075", page: "risk" })).status, "fallback_demo");
  const configured = createComparisonHarness({ env: comparisonEnv("http://127.0.0.1:1"), fetchImpl });
  assert.equal((await configured.compare({ confirmed: false, scenarioId: "multi-risk-priority", opportunityToken: "DEMO-6C-OPP-075", page: "risk" })).fallbackReason, "需要用户主动确认");
  assert.equal(calls, 0);
});

test("local OpenAI-compatible mock covers success, failures, retry, safety, and reset", async () => {
  const mock = await startMockProvider();
  try {
    const scenarios = [
      ["success", "completed"], ["timeout", "fallback_demo"], ["unauthorized", "fallback_demo"],
      ["rate-limit", "fallback_demo"], ["server-error", "fallback_demo"], ["non-json", "fallback_demo"],
      ["schema-invalid", "fallback_demo"], ["sensitive", "fallback_demo"], ["large-response", "fallback_demo"],
      ["forbidden", "completed"], ["retry-success", "fallback_demo"],
    ];
    for (const [mode, expected] of scenarios) {
      mock.state.mode = mode; mock.state.calls = 0;
      const view = getDecisionView({ mode: "scenario", scenarioId: "multi-risk-priority" });
      mock.state.output = externalOutput(view.pack.risk, mode === "forbidden" ? { inference: "A port closure is confirmed." } : {});
      const harness = createComparisonHarness({ env: comparisonEnv(mock.baseUrl, { LLM_TIMEOUT_MS: mode === "timeout" ? "100" : "1000" }) });
      const result = await harness.compare({ confirmed: true, scenarioId: "multi-risk-priority", opportunityToken: "DEMO-6C-OPP-075", page: "risk" });
      assert.equal(result.status, expected, mode);
      assert.ok(mock.state.calls <= 2, mode);
      if (mode === "retry-success") assert.equal(mock.state.calls, 1);
      if (mode === "forbidden") assert.equal(result.evaluation.scores.claimSafety, 0);
      if (mode === "success") {
        assert.equal(mock.state.lastRequest.response_format.type, "json_object");
        assert.equal(mock.state.lastRequest.max_tokens, 1200);
        assert.equal(mock.state.lastRequest.stream, false);
      }
      const audit = harness.listAudit()[0];
      for (const key of ["requestId", "safeContextHash", "provider", "model", "scopeCount", "latencyMs", "schemaStatus", "safetyStatus", "citationStatus", "fallbackReason", "evaluationScore"]) assert.ok(Object.hasOwn(audit, key), `${mode}:${key}`);
      const auditText = JSON.stringify(audit);
      for (const secret of ["mock-credential-placeholder", mock.baseUrl, "authorization", "safeDecisionContext", "externalOutput"]) assert.equal(auditText.includes(secret), false, `${mode}:${secret}`);
      harness.reset();
      assert.equal(harness.listAudit().length, 0);
    }
  } finally { await mock.close(); }
});

test("identical repeated output receives a deterministic stability score without automatic calls", async () => {
  const mock = await startMockProvider();
  try {
    const view = getDecisionView({ mode: "scenario", scenarioId: "data-contradiction" });
    mock.state.output = externalOutput(view.pack.risk);
    const harness = createComparisonHarness({ env: comparisonEnv(mock.baseUrl) });
    assert.equal(mock.state.calls, 0);
    const input = { confirmed: true, scenarioId: "data-contradiction", opportunityToken: view.defaultOpportunity, page: "risk" };
    const first = await harness.compare(input);
    const second = await harness.compare(input);
    assert.equal(first.evaluation.scores.stability, null);
    assert.equal(second.evaluation.scores.stability, 100);
    assert.equal(mock.state.calls, 2);
  } finally { await mock.close(); }
});

test("three required scenarios use the same safe input and test-only post-response assertions", async () => {
  const mock = await startMockProvider();
  try {
    const completed = [];
    for (const scenarioId of ["multi-risk-priority", "data-contradiction", "healthy-control"]) {
      const view = getDecisionView({ mode: "scenario", scenarioId });
      mock.state.mode = "success"; mock.state.output = externalOutput(view.pack.risk); mock.state.calls = 0; mock.state.lastRequest = null;
      const harness = createComparisonHarness({ env: comparisonEnv(mock.baseUrl) });
      const result = await harness.compare({ confirmed: true, scenarioId, opportunityToken: view.defaultOpportunity, page: "risk" });
      assert.equal(result.status, "completed", scenarioId);
      completed.push({ scenarioId, result });
      const requestText = JSON.stringify(mock.state.lastRequest);
      assert.equal(requestText.includes(scenarioId), false);
      for (const testOnlyKey of ["requiredText", "forbiddenClaims", "defaultOpportunity"]) assert.equal(requestText.includes(testOnlyKey), false, `${scenarioId}:${testOnlyKey}`);
    }
    const goldens = JSON.parse(await readFile(goldensPath, "utf8"));
    for (const { scenarioId, result } of completed) {
      assert.equal(result.externalOutput.priority, goldens[scenarioId].priority);
      assert.equal(result.externalOutput.confidence.level, goldens[scenarioId].confidence);
    }
    const healthy = getDecisionView({ mode: "scenario", scenarioId: "healthy-control" });
    mock.state.mode = "success"; mock.state.output = externalOutput(healthy.pack.risk, { priority: "High" });
    const blocked = await createComparisonHarness({ env: comparisonEnv(mock.baseUrl) }).compare({ confirmed: true, scenarioId: "healthy-control", opportunityToken: healthy.defaultOpportunity, page: "risk" });
    assert.equal(blocked.status, "fallback_demo");
    assert.equal(blocked.fallbackReason, "健康对照不得升级为高风险");
  } finally { await mock.close(); }
});

test("caller cancellation aborts the external request and returns a safe Demo fallback", async () => {
  const mock = await startMockProvider();
  try {
    mock.state.mode = "timeout";
    const controller = new AbortController();
    const harness = createComparisonHarness({ env: comparisonEnv(mock.baseUrl, { LLM_TIMEOUT_MS: "1000" }) });
    const pending = harness.compare({ confirmed: true, scenarioId: "multi-risk-priority", opportunityToken: "DEMO-6C-OPP-075", page: "risk", signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    const result = await pending;
    assert.equal(result.status, "fallback_demo");
    assert.equal(result.fallbackReason, "用户已取消对比");
  } finally { await mock.close(); }
});

test("comparison API is explicit, in-memory, resettable, and exposes no credentials", async () => {
  const mock = await startMockProvider();
  const view = getDecisionView({ mode: "scenario", scenarioId: "data-contradiction" });
  mock.state.output = externalOutput(view.pack.risk);
  const app = createApp({ env: comparisonEnv(mock.baseUrl) });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const status = await getJson(`${base}/api/decision-comparison/status`);
    assert.equal(status.data.available, true);
    assert.equal(JSON.stringify(status).includes("mock-credential-placeholder"), false);
    assert.equal(mock.state.calls, 0);
    const run = await getJson(`${base}/api/decision-comparison/run`, { method: "POST", body: JSON.stringify({ confirmed: true, scenarioId: "data-contradiction", opportunityToken: view.defaultOpportunity, page: "risk" }) });
    assert.equal(run.data.status, "completed");
    assert.equal(mock.state.calls, 1);
    assert.equal((await getJson(`${base}/api/decision-comparison/audit`)).data.length, 1);
    await getJson(`${base}/api/decision-comparison/reset`, { method: "POST", body: "{}" });
    assert.equal((await getJson(`${base}/api/decision-comparison/audit`)).data.length, 0);
  } finally { server.close(); await mock.close(); }
});

test("Unified output validation rejects non-JSON contract shapes and accepts strict output", () => {
  const view = getDecisionView({ mode: "scenario", scenarioId: "data-contradiction" });
  assert.equal(validateUnifiedOutput(externalOutput(view.pack.risk)).ok, true);
  assert.equal(validateUnifiedOutput({ title: "missing" }).ok, false);
  assert.equal(validateUnifiedOutput({ ...externalOutput(view.pack.risk), unexpected: true }).ok, false);
});

test("existing Audit UI activates only with client flag and server availability and never auto-runs", async () => {
  const [audit, app, api, features] = await Promise.all([
    readFile(new URL("../src/decision/AuditSafetyPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/config/features.ts", import.meta.url), "utf8"),
  ]);
  assert.match(audit, /PRODUCT_FEATURES\.modelComparison && providerStatus\?\.comparisonAvailable === true/);
  assert.match(audit, /开始安全对比/);
  assert.match(audit, /AbortController/);
  assert.match(audit, /取消/);
  assert.match(audit, /重置/);
  assert.match(audit, /runDecisionComparison\(\{ scenarioId, opportunityToken, page \}, next\.signal\)/);
  assert.doesNotMatch(app, /runDecisionComparison|startComparison/);
  assert.match(api, /method: "POST"/);
  assert.match(features, /VITE_FEATURE_MODEL_COMPARISON === "true"/);
});

function comparisonEnv(baseUrl, extra = {}) { return { FEATURE_MODEL_COMPARISON: "true", ALLOW_EXTERNAL_AI: "true", AI_PROVIDER: "openai-compatible", LLM_BASE_URL: baseUrl, LLM_API_KEY: "mock-credential-placeholder", LLM_MODEL: "mock-model", LLM_TIMEOUT_MS: "1000", LLM_MAX_TOKENS: "1200", ...extra }; }
function externalOutput(output, overrides = {}) { const { providerUsed, fallbackReason, safeContextUsed, externalModelCalled, rawDataSent, ...contract } = output; return { ...contract, ...overrides }; }
async function getJson(url, options) { const response = await fetch(url, { headers: { "content-type": "application/json" }, ...options }); assert.equal(response.ok, true, `${response.status}:${url}`); return response.json(); }

async function startMockProvider() {
  const state = { mode: "success", output: null, calls: 0, lastRequest: null };
  const server = createServer(async (request, response) => {
    state.calls += 1;
    let body = ""; for await (const chunk of request) body += chunk;
    state.lastRequest = JSON.parse(body || "{}");
    if (state.mode === "timeout") { setTimeout(() => respond(response, 200, envelope(state.output)), 300); return; }
    if (state.mode === "unauthorized") return respond(response, 401, { error: "unauthorized" });
    if (state.mode === "rate-limit") return respond(response, 429, { error: "limited" });
    if (state.mode === "server-error") return respond(response, 503, { error: "unavailable" });
    if (state.mode === "non-json") { response.writeHead(200, { "content-type": "text/plain" }); response.end("not-json"); return; }
    if (state.mode === "schema-invalid") return respond(response, 200, envelope({ title: "invalid" }));
    if (state.mode === "sensitive") return respond(response, 200, envelope({ ...state.output, inference: "Contact john@example.com" }));
    if (state.mode === "large-response") return respond(response, 200, envelope({ ...state.output, inference: "x".repeat(70 * 1024) }));
    if (state.mode === "retry-success" && state.calls === 1) return respond(response, 429, { error: "retry" });
    return respond(response, 200, envelope(state.output));
  });
  server.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  return { state, baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}
function envelope(output) { return { choices: [{ message: { content: JSON.stringify(output) } }] }; }
function respond(response, status, value) { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); }
