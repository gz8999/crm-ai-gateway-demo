import assert from "node:assert/strict";
import test from "node:test";

import { getDecisionView } from "../server/decision/decisionService.mjs";
import { evaluateHealthScore, summarizeHealthEvaluation } from "../server/decision/evaluationEngine.mjs";
import { gradeForHealthScore, rankHealthScores, scoreOpportunityHealth, summarizeHealthScores } from "../src/services/healthScoreEngine/index.js";

test("health score is deterministic, weighted, safe, and evidence-backed", () => {
  const context = safeContext();
  const first = scoreOpportunityHealth(context);
  const second = scoreOpportunityHealth(context);
  assert.deepEqual(first, second);
  assert.equal(Object.keys(first.dimensions).length, 6);
  assert.equal(first.evidence.length, 6);
  assert.equal(first.deterministic, true);
  assert.equal(first.version, "2.0");
  assert.equal(first.safeContextUsed, true);
  assert.equal(first.externalModelCalled, false);
  assert.equal(first.rawDataSent, false);
  assert.equal(evaluateHealthScore({ score: first, safeContext: context }).ready, true);
});

test("health score grade boundaries are stable", () => {
  assert.equal(gradeForHealthScore(100), "S");
  assert.equal(gradeForHealthScore(90), "S");
  assert.equal(gradeForHealthScore(89.99), "A");
  assert.equal(gradeForHealthScore(80), "A");
  assert.equal(gradeForHealthScore(79.99), "B");
  assert.equal(gradeForHealthScore(70), "B");
  assert.equal(gradeForHealthScore(69.99), "C");
  assert.equal(gradeForHealthScore(60), "C");
  assert.equal(gradeForHealthScore(59.99), "D");
  assert.equal(gradeForHealthScore(50), "D");
  assert.equal(gradeForHealthScore(49.99), "Z");
});

test("health score rejects exact or raw CRM inputs", () => {
  assert.throws(() => scoreOpportunityHealth({ ...safeContext(), actualValue: 100 }), /forbidden raw field/);
  assert.throws(() => scoreOpportunityHealth({ ...safeContext(), opportunityToken: "00000000-0000-0000-0000-000000000001" }), /Dataverse identifier/);
});

test("200 safe contexts receive deterministic ranked scores without external or CRM writes", () => {
  const contexts = Array.from({ length: 200 }, (_, index) => ({ ...safeContext(), opportunityToken: `DEMO-HEALTH-${String(index + 1).padStart(3, "0")}`, openQuestionCount: index % 5 }));
  const ranking = rankHealthScores(contexts);
  const scores = contexts.map(scoreOpportunityHealth);
  const summary = summarizeHealthScores(scores);
  assert.equal(ranking.length, 200);
  assert.deepEqual(ranking.map((item) => item.rank), Array.from({ length: 200 }, (_, index) => index + 1));
  assert.equal(summary.count, 200);
  assert.equal(summary.deterministic, true);
  assert.equal(summary.safety.externalModelCalled, false);
  assert.equal(summary.safety.rawDataSent, false);
});

test("Decision View and evaluation framework expose health scores for the selected opportunity and full local scope", () => {
  const view = getDecisionView({ mode: "portfolio" });
  assert.equal(view.healthRanking.length, 100);
  assert.equal(view.healthScore.healthScore, view.healthRanking.find((item) => item.opportunityToken === view.selectedOpportunity).healthScore);
  const evaluation = evaluateHealthScore({ score: view.healthScore, safeContext: view.safeContext, scopeSummary: view.scopeSummary });
  assert.equal(evaluation.ready, true);
  assert.deepEqual(summarizeHealthEvaluation([evaluation]), { count: 1, readyCount: 1, contractReady: true, evidenceReady: true, safetyReady: true, errorCount: 0 });
});

test("healthy control remains a high-confidence non-risk health result", () => {
  const view = getDecisionView({ mode: "scenario", scenarioId: "healthy-control" });
  assert.ok(["S", "A"].includes(view.healthScore.grade));
  assert.ok(view.healthScore.healthScore >= 80);
  assert.equal(view.healthScore.keyRisks.length, 0);
  assert.equal(view.healthScore.externalModelCalled, false);
});

function safeContext(overrides = {}) {
  return {
    opportunityToken: "DEMO-HEALTH-001",
    customerToken: "CUSTOMER-DEMO-001",
    accountToken: "DEMO-ACCOUNT-001",
    ownerToken: "OWNER-DEMO-001",
    salesDepartment: "FF",
    opportunityState: "Active",
    stage: "Develop",
    priority: "Medium",
    forecastCategory: "Pipeline",
    relativeDateStatus: "future",
    stagnationBand: "active",
    revenueBand: "100k-500k",
    marginBand: "8-12-percent",
    budgetBand: "100k-500k",
    actualBand: "none",
    amountBand: "100k-500k",
    annualRevenueBand: "100k-500k",
    annualMarginBand: "8-12-percent",
    varianceCategory: "not-applicable",
    budgetVarianceBand: "not-applicable",
    marginVarianceBand: "not-applicable",
    trend: "stable",
    elapsedPeriodCategory: "future",
    dataQualityCodes: [],
    missingCodes: [],
    contradictionCodes: [],
    transportMode: "air",
    routeConsistency: "consistent",
    needSummary: "need-category-recorded",
    proposalSummary: "proposal-category-recorded",
    progressSummary: "active-future",
    meetingWindow: "within-30-days",
    stakeholderCoverage: "complete",
    openQuestionCount: 0,
    decisionReadiness: "high",
    closeFact: "none",
    timelineSignalCount: 4,
    coverageCategory: "broad",
    accountAggregate: {
      accountToken: "DEMO-ACCOUNT-001",
      serviceCoverageBand: "broad",
      whitespaceCategory: "selective-whitespace",
      opportunityTrend: "stable",
      relationshipMaturity: "established",
    },
    ...overrides,
  };
}
