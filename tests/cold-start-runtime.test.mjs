import assert from "node:assert/strict";
import test from "node:test";
import { createRequestLimiter } from "../server/d365/frozenDatasetReader.mjs";
import { awaitWithTimeout } from "../server/dynamicsClient.mjs";
import { createApp } from "../server/app.mjs";
import { createPilotRuntimeService } from "../server/pilot/pilotRuntimeService.mjs";
import { createStartupDiagnostics } from "../server/startup/startupDiagnostics.mjs";

test("Frozen runtime initializes once while status stays explicitly starting", async () => {
  let readCount = 0;
  let releaseRead;
  const pendingRead = new Promise((resolve) => { releaseRead = resolve; });
  const diagnostics = createStartupDiagnostics({
    processStartedAt: 100,
    env: {
      GATEWAY_ENV_BASE_LOADED: "true",
      GATEWAY_ENV_EXTERNAL_LOCAL_LOADED: "true",
      GATEWAY_D365_CREDENTIALS_CONFIGURED: "true",
    },
    now: () => 200,
  });
  const service = createPilotRuntimeService({
    reader: {
      requestStats: { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, ProductionRequests: 0, ExternalLLMCalls: 0, CRMWrites: 0 },
      read: async () => { readCount += 1; return pendingRead; },
    },
    departments: [{ id: "all", label: "全部部门" }],
    expectedCounts: { opportunity: 200 },
    buildScope: (_data, { department }) => ({
      department: { id: department },
      contexts: [],
      exactAmounts: new Map(),
      counts: { opportunity: 200 },
      stateDistribution: { active: 100, won: 91, lost: 9 },
    }),
    assertScope: () => undefined,
    startupDiagnostics: diagnostics,
  });

  const starting = await service.getRuntimeStatus({ wait: false });
  assert.equal(starting.available, false);
  assert.equal(starting.runtimeState, "starting");
  assert.equal(readCount, 1);

  const sameInitialization = service.initialize();
  releaseRead({
    loadedAt: "2027-01-15T00:00:00.000Z",
    requestStats: { GET: 1, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, ProductionRequests: 0, ExternalLLMCalls: 0, CRMWrites: 0 },
  });
  await sameInitialization;

  const ready = await service.getRuntimeStatus();
  assert.equal(ready.available, true);
  assert.equal(ready.runtimeState, "ready");
  assert.equal(readCount, 1);
  assert.equal(diagnostics.snapshot().runtimeInitializationCount, 1);
  assert.equal(diagnostics.snapshot().runtimeState, "ready");
});

test("Frozen Dataset reader limiter never exceeds its configured GET concurrency", async () => {
  const limit = createRequestLimiter(2);
  let active = 0;
  let peak = 0;
  const results = await Promise.all(Array.from({ length: 7 }, (_, value) => limit(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value;
  })));
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(peak, 2);
  assert.throws(() => createRequestLimiter(0), /positive integer/);
});

test("Frozen runtime records a synchronous reader failure without blocking API startup", async () => {
  const diagnostics = createStartupDiagnostics({ now: () => 250 });
  const service = createPilotRuntimeService({
    reader: { read: () => { throw new Error("D365 configuration is unavailable."); } },
    startupDiagnostics: diagnostics,
  });
  await assert.rejects(service.initialize(), /configuration is unavailable/);
  const status = await service.getRuntimeStatus({ wait: false });
  assert.equal(status.runtimeState, "failed");
  assert.equal(status.available, false);
  assert.equal(diagnostics.snapshot().runtimeState, "failed");
});

test("OAuth deadline fails instead of leaving cold start pending", async () => {
  await assert.rejects(
    awaitWithTimeout(new Promise(() => {}), 5, "Dataverse OAuth token acquisition timed out."),
    /OAuth token acquisition timed out/,
  );
});

test("Frozen status routes are non-blocking and startup diagnostics expose no environment values", async () => {
  const diagnostics = createStartupDiagnostics({
    env: {
      GATEWAY_ENV_BASE_LOADED: "true",
      GATEWAY_ENV_EXTERNAL_LOCAL_LOADED: "true",
      GATEWAY_D365_CREDENTIALS_CONFIGURED: "true",
      CLIENT_SECRET: "must-not-be-exposed",
    },
  });
  let initializeCount = 0;
  let retryCount = 0;
  const calls = [];
  const pending = {
    dataSource: "d365-pilot",
    label: "D365 Frozen Dataset",
    available: false,
    runtimeState: "starting",
    lastSyncTime: "unknown",
    recordCount: 0,
    counts: {},
    stateDistribution: { active: 0, won: 0, lost: 0 },
    departments: [],
    expectedCounts: {},
    security: { hostnameAllowlist: true, pilotTokenAllowlist: true, getOnly: true, fallbackStatus: "disabled", customerIdentityMasked: true, exactAmountSentToModel: false, rawTimelineSent: false, crmWritebackEnabled: false, externalLlmEnabled: false, productionRequests: 0 },
    requestStats: { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, ProductionRequests: 0, ExternalLLMCalls: 0, CRMWrites: 0 },
  };
  const app = createApp({
    env: { AI_PROVIDER: "demo", ALLOW_EXTERNAL_AI: "false" },
    startupDiagnostics: diagnostics,
    frozenDatasetService: {
      initialize: async () => { initializeCount += 1; },
      retry: async () => { retryCount += 1; },
      getRuntimeStatus: async (options) => { calls.push(options); return pending; },
    },
  });

  await app.locals.initializeFrozenRuntime();
  assert.equal(initializeCount, 1);
  const runtime = await invokeGet(app, "/api/d365-frozen/runtime-status");
  const crm = await invokeGet(app, "/api/runtime/crm-status");
  await invokeGet(app, "/api/d365-frozen/runtime-status", { retry: "true" });
  const startup = await invokeGet(app, "/api/runtime/startup-diagnostics");
  assert.deepEqual(calls, [{ wait: false }, { wait: false }, { wait: false }]);
  assert.equal(retryCount, 1);
  assert.equal(runtime.body.data.runtimeState, "starting");
  assert.equal(crm.body.data.connectionStatus, "unknown");
  assert.equal(startup.body.data.d365CredentialsConfigured, true);
  assert.equal(JSON.stringify(startup.body).includes("must-not-be-exposed"), false);
});

async function invokeGet(app, path, query = {}) {
  const layer = app._router.stack.find((entry) => entry.route?.path === path);
  assert.ok(layer, `Missing ${path}`);
  const response = {
    statusCode: 200,
    headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await layer.route.stack[0].handle({ query, params: {} }, response);
  return response;
}
