import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { EXECUTIVE_DEMO_SCENARIOS, EXTERNAL_AI_RELEASE_STATUS, SCORE_SHOWCASE_TOKENS } from "../server/decision/executiveDemoContract.mjs";
import { getDecisionView } from "../server/decision/decisionService.mjs";

const read = (path) => readFile(path, "utf8");
const json = async (path) => JSON.parse(await read(path));

test("formal executive portfolio is the 200-record D365 Frozen Dataset with no automatic fixture fallback", async () => {
  const [contract, app, locales] = await Promise.all([read("server/d365/frozenDatasetContract.mjs"), read("src/App.tsx"), read("src/i18n/productLocales.ts")]);
  assert.match(contract, /opportunity:\s*200/);
  assert.match(contract, /active:\s*100, won:\s*91, lost:\s*9/);
  assert.match(app, /INITIAL_DATA_SOURCE[^\n]+d365-pilot/);
  assert.match(app, /D365 Runtime Temporarily Unavailable/);
  assert.match(app, /app\.status\.d365ReadFailed/);
  assert.match(locales, /未切换 Local Fixture/);
});

test("Score Showcase reuses 24 D365 records and isolates all synthetic score fixtures", async () => {
  const manifest = await json("docs/demo/score-showcase-manifest.json");
  assert.equal(SCORE_SHOWCASE_TOKENS.length, 24);
  assert.equal(new Set(SCORE_SHOWCASE_TOKENS).size, 24);
  assert.deepEqual(manifest.showcaseTokens, SCORE_SHOWCASE_TOKENS);
  assert.equal(manifest.classification.d365FrozenRecords.duplicateRecordsCreated, 0);
  assert.equal(manifest.classification.syntheticScoreFixtures.testOnly, true);
  assert.equal(manifest.classification.syntheticScoreFixtures.d365Record, false);
  assert.equal(manifest.classification.syntheticScoreFixtures.includedInPortfolioKpi, false);
  assert.equal(manifest.classification.syntheticScoreFixtures.externalCallEligible, false);
  assert.equal(manifest.classification.syntheticScoreFixtures.runtimeVisible, false);
});

test("eight offline scenario demonstrations cover seven departments, all states, and S through D", async () => {
  const [selection, canary] = await Promise.all([
    json("docs/demo/executive-demo-opportunity-selection.json"),
    json("docs/gateway/external-llm-canary-selection-v2.json"),
  ]);
  assert.deepEqual(selection.records.map((item) => item.scenario).sort(), [...EXECUTIVE_DEMO_SCENARIOS].sort());
  assert.equal(new Set(selection.records.map((item) => item.opportunityToken)).size, 8);
  const selectedTokens = new Set(selection.records.map((item) => item.opportunityToken));
  assert.equal(selection.records.every((item) => SCORE_SHOWCASE_TOKENS.includes(item.opportunityToken)), true);
  const selectedFacts = canary.records.filter((item) => selectedTokens.has(item.opportunityToken));
  assert.deepEqual(new Set(canary.records.map((item) => item.department)).size, 7);
  assert.deepEqual(new Set(selectedFacts.map((item) => item.state)), new Set(["Won", "Active", "Lost"]));
  assert.equal(["S", "A", "B", "C", "D"].every((grade) => canary.records.some((item) => item.healthGrade === grade)), true);
  assert.equal(selection.runtimeScenarioMetadata, false);
});

test("healthy control stays healthy and six-dimensional deterministic score explanation remains complete", () => {
  const view = getDecisionView({ mode: "scenario", scenarioId: "healthy-control" });
  assert.ok(["S", "A"].includes(view.healthScore.grade));
  assert.equal(view.healthScore.keyRisks.length, 0);
  assert.deepEqual(Object.keys(view.healthScore.dimensions).sort(), ["completeness", "confidence", "engagement", "pipeline", "profitability", "risk"]);
  assert.equal(view.healthScore.evidence.length, 6);
  assert.equal(view.healthScore.externalModelCalled, false);
});

test("risk, action, meeting, cockpit, and audit UI expose the deterministic executive contract", async () => {
  const [workspace, decisionUi, audit, externalUi] = await Promise.all([
    read("src/decision/DecisionWorkspace.tsx"),
    read("src/decision/DecisionUi.tsx"),
    read("src/decision/AuditSafetyPage.tsx"),
    read("src/decision/externalModelUi.ts"),
  ]);
  for (const label of ["Grade", "状态", "高风险场景", "Score Showcase"]) assert.match(workspace, new RegExp(label));
  for (const label of ["主要扣分", "确定性 Decision Pack", "Draft Only", "CRM Writeback Disabled", "互动安全摘要"]) assert.match(workspace, new RegExp(label));
  for (const label of ["当前 CRM 事实", "核心证据"]) assert.match(decisionUi, new RegExp(label));
  for (const label of ["D365 Data Source", "D365 GET-only", "CRM Writeback", "External LLM Auto Run", "Customer Identity Masked", "Exact Amount Sent", "Raw Timeline Sent", "Production Access"]) assert.match(audit, new RegExp(label));
  assert.match(externalUi, /controlled_validation_pending/);
  assert.equal(EXTERNAL_AI_RELEASE_STATUS.en, "Controlled Validation Pending");
});

test("all deterministic action outputs remain evidence-backed and meeting guidance excludes raw Timeline", () => {
  for (const scenarioId of EXECUTIVE_DEMO_SCENARIOS) {
    const view = getDecisionView({ mode: "scenario", scenarioId });
    for (const output of Object.values(view.pack)) {
      if (output.recommendedAction.length) assert.ok(output.evidence.length > 0, `${scenarioId}/${output.id} lacks evidence`);
      assert.equal(output.externalModelCalled, false);
      assert.equal(output.rawDataSent, false);
    }
    assert.equal(JSON.stringify(view.pack.meeting).includes("timelineText"), false);
  }
});

test("runtime and demo artifacts contain no Scenario/Golden payload, GUID, identity, exact amount, or raw Timeline exposure", async () => {
  const [runtime, selection, safety] = await Promise.all([
    read("server/pilot/pilotRuntimeService.mjs"),
    read("docs/demo/executive-demo-opportunity-selection.json"),
    read("docs/demo/executive-demo-safety-statement.md"),
  ]);
  assert.doesNotMatch(runtime, /ScenarioManifest|Golden Assertions|Expected AI Answer/);
  assert.match(selection, /"runtimeScenarioMetadata": false/);
  assert.match(safety, /Customer and contact identities/);
  assert.match(safety, /exact amounts/);
  assert.match(safety, /raw Timeline/);
});

test("release artifacts and boundaries preserve zero external calls, writeback, and production requests", async () => {
  const paths = [
    "executive-demo-readiness-report.md", "executive-demo-script-zh.md", "executive-demo-runbook.md",
    "executive-demo-opportunity-selection.json", "score-showcase-manifest.json", "executive-demo-safety-statement.md",
    "external-ai-deferred-technical-backlog.md", "executive-demo-browser-validation.md", "executive-demo-final-acceptance.md",
  ];
  for (const path of paths) assert.ok((await read(`docs/demo/${path}`)).length > 40, path);
  const combined = await Promise.all(paths.map((path) => read(`docs/demo/${path}`))).then((items) => items.join("\n"));
  assert.match(combined, /External LLM Calls=0/);
  assert.match(combined, /CRM Writeback=false/);
  assert.match(combined, /Production Requests=0/);
});
