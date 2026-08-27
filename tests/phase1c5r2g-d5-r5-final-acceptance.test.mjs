import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  D5_R5_EXPECTED,
  D5_R5_SCENARIOS,
  D5_R5_UI_SAMPLES,
  assertSafeContext,
  classifyAmountBand,
  classifyVarianceBand,
  readOnlyRequestStatsAreSafe,
} from "../scripts/dataverse/lib/d5-r5-final-acceptance-contract.mjs";

const runtimePath = new URL("../docs/d365/d365-ai-demo-200-d5-r5-runtime-snapshot.json", import.meta.url);
const uiPath = new URL("../docs/d365/d365-ai-demo-200-d5-r5-ui-evidence-manifest.json", import.meta.url);
const safePath = new URL("../docs/gateway/d365-pilot-safe-context-preflight.json", import.meta.url);

test("R5 frozen counts sum to 427 explicit Pilot records", () => {
  assert.equal(Object.values(D5_R5_EXPECTED.entities).reduce((sum, count) => sum + count, 0), 427);
  assert.deepEqual(D5_R5_EXPECTED.states, { Won: 7, Active: 16, Lost: 1 });
  assert.deepEqual(D5_R5_EXPECTED.opportunityClose, { Win: 7, Lose: 1, Total: 8 });
});

test("R5 UI samples cover eight records and seven departments", () => {
  assert.equal(D5_R5_UI_SAMPLES.length, 8);
  assert.equal(new Set(D5_R5_UI_SAMPLES.map((row) => row.token)).size, 8);
  assert.equal(new Set(D5_R5_UI_SAMPLES.map((row) => row.department)).size, 7);
  assert.equal(D5_R5_UI_SAMPLES.find((row) => row.token === "DEMO-OPP-015")?.expectedState, "Won");
  assert.equal(D5_R5_UI_SAMPLES.find((row) => row.token === "DEMO-OPP-026")?.expectedState, "Lost");
});

test("R5 scenario contract contains all eight distinct scenarios", () => {
  assert.equal(D5_R5_SCENARIOS.length, 8);
  assert.equal(new Set(D5_R5_SCENARIOS).size, 8);
});

test("amount mapping emits bands and variance categories, not exact amounts", () => {
  assert.equal(classifyAmountBand(50_000), "under-100k");
  assert.equal(classifyAmountBand(750_000), "500k-2m");
  assert.equal(classifyVarianceBand(100, 50), "material-negative");
  assert.equal(classifyVarianceBand(100, 100), "on-plan");
});

test("Safe Context accepts only the approved privacy contract", () => {
  const safe = {
    opportunityToken: "DEMO-OPP-015",
    accountToken: "DEMO-ACC-001",
    department: "06: FF",
    state: "Won",
    status: 3,
    bpfStage: "授予资格",
    amountBands: { budget: "under-100k", actual: "under-100k" },
    varianceBand: "on-plan",
    coverageCategories: [],
    interactionSignals: [],
    timelineEvidence: [],
    relativeDateSignals: { estimatedClose: "historical", lastInteraction: "recent-past" },
    evidenceTokens: [],
    closeEvidence: { present: true, outcome: "Win" },
    safety: {
      customerIdentityMasked: true,
      exactAmountSentToModel: false,
      rawTimelineSent: false,
      crmWritebackEnabled: false,
      externalLlmEnabled: false,
    },
  };
  assert.equal(assertSafeContext(safe), true);
  assert.throws(() => assertSafeContext({ ...safe, customerName: "forbidden" }), /Unexpected Safe Context key/);
});

test("R5 request boundary is GET-only", () => {
  const safe = { GET: 1063, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, WinOpportunity: 0, LoseOpportunity: 0, BPFWrites: 0, Cleanup: 0, FullImport: 0, ProductionRequests: 0, ExternalLLMCalls: 0, CRMWriteback: 0 };
  assert.equal(readOnlyRequestStatsAreSafe(safe), true);
  assert.equal(readOnlyRequestStatsAreSafe({ ...safe, POST: 1 }), false);
  assert.equal(readOnlyRequestStatsAreSafe({ ...safe, ProductionRequests: 1 }), false);
});

test("public R5 artifacts match the frozen runtime and retain evidence caveats", async () => {
  const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
  const ui = JSON.parse(await readFile(uiPath, "utf8"));
  const safe = JSON.parse(await readFile(safePath, "utf8"));

  assert.equal(runtime.explicitPilotData.total, 427);
  assert.deepEqual(runtime.opportunity.stateDistribution, { Won: 7, Active: 16, Lost: 1 });
  assert.equal(runtime.gates.pilotFinalAcceptanceReady, true);
  assert.equal(runtime.gates.fullImportReady, false);
  assert.equal(ui.directlyVisibleOpportunityTokens.length, 3);
  assert.equal(ui.coverageBasis.userAttestedEightSampleReadOnlyReview, true);
  assert.deepEqual(ui.console.rawDevToolsCountersVisible, { errors: 8, warnings: 24 });
  assert.equal(safe.scope.opportunityCount, 24);
  assert.equal(safe.scenarioCoverage.length, 8);
  assert.equal(safe.safety.exactAmountSentToModel, false);
  assert.equal(safe.safety.rawTimelineSent, false);
});

test("public R5 artifacts contain no Dataverse GUID or email address", async () => {
  const files = await Promise.all([runtimePath, uiPath, safePath].map((url) => readFile(url, "utf8")));
  const text = files.join("\n");
  assert.doesNotMatch(text, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
  assert.doesNotMatch(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
});
