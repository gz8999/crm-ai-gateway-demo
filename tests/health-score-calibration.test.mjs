import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { getDecisionView } from "../server/decision/decisionService.mjs";
import { analyzeHealthCalibration, analyzeScenarioCalibration, repeatHealthScores, runCounterfactualTests, selectHealthCanary } from "../server/decision/healthCalibration.mjs";
import { buildExternalModelRequest, validateExternalModelRequest, validateExternalModelResponse } from "../server/decision/externalModelContract.mjs";
import { createDecisionProvider, providerHarnessStatus } from "../server/decision/providerHarness.mjs";
import { evaluateModelResponse } from "../server/decision/modelEvaluation.mjs";
import { scoreOpportunityHealth } from "../src/services/healthScoreEngine/index.js";

test("200 safe contexts repeat identically and keep evidence digests stable", () => {
  const contexts = calibrationContexts();
  const result = repeatHealthScores(contexts, 3);
  assert.equal(result.ready, true);
  assert.equal(result.scoreDifferenceCount, 0);
  assert.equal(result.gradeDifferenceCount, 0);
  assert.equal(result.evidenceDifferenceCount, 0);
  assert.equal(result.rankingDifferenceCount, 0);
});

test("status masking runs and Active-only scoring has usable separation", () => {
  const contexts = calibrationContexts();
  const result = analyzeHealthCalibration(contexts);
  assert.equal(result.statusMasked.activeInternalRanking.length, result.activeOnly.count);
  assert.ok(result.activeOnly.scoreRange.spread > 0);
  assert.ok(["Medium", "High"].includes(result.statusLeakageRisk.level));
  assert.equal(result.counterfactual.monotonicityViolationCount, 0);
});

test("counterfactual risks move health in the expected direction", () => {
  const contexts = calibrationContexts();
  const result = runCounterfactualTests(contexts);
  assert.equal(result.ready, true);
  assert.equal(result.monotonicityViolationCount, 0);
  assert.ok(result.stateVariants.won >= result.stateVariants.active);
  assert.ok(result.stateVariants.lost <= result.stateVariants.active);
});

test("v2 scenario calibration keeps healthy control at S/A and exposes C/D/Z risk", () => {
  const scenarioIds = ["stalled-high-value", "budget-actual-gap", "data-contradiction", "growth-opportunity", "location-route-risk", "meeting-prep", "multi-risk-priority", "healthy-control"];
  const result = analyzeScenarioCalibration(scenarioIds.map((scenarioId) => {
    const view = getDecisionView({ mode: "scenario", scenarioId });
    return { scenarioId, context: view.safeContext };
  }));
  assert.equal(result.ready, true);
  assert.equal(result.count, 8);
  assert.equal(result.healthyControl.ready, true);
  assert.equal(result.riskGradeCoverage.ready, true);
  assert.deepEqual(result.riskGradeCoverage.required, ["C", "D", "Z"]);
});

test("confidence is a separate, evidence-aware output", () => {
  const base = { ...calibrationContexts()[1], missingCodes: [], contradictionCodes: [], dataQualityCodes: [] };
  const clear = scoreOpportunityHealth(base);
  const incomplete = scoreOpportunityHealth({ ...base, missingCodes: ["missing-next-action"], dataQualityCodes: ["missing-next-action"] });
  assert.notEqual(typeof clear.healthScore, "undefined");
  assert.notEqual(clear.confidence, clear.healthScore);
  assert.ok(incomplete.evidenceCoverage < clear.evidenceCoverage);
  assert.notEqual(incomplete.confidence, "High");
  assert.equal(incomplete.dataQualityStatus, "review-required");
});

test("Canary selection is 24 unique safe tokens with multi-dimensional coverage", () => {
  const contexts = calibrationContexts();
  const canary = selectHealthCanary(contexts, 24);
  assert.equal(canary.length, 24);
  assert.equal(new Set(canary.map((item) => item.opportunityToken)).size, 24);
  assert.equal(new Set(canary.map((item) => item.department)).size, 7);
  assert.ok(canary.every((item) => !item.opportunityToken.match(/[0-9a-f]{8}-[0-9a-f-]{27}/i)));
});

test("external request contract strips unsafe source classes and keeps safety flags", () => {
  const view = getDecisionView({ mode: "portfolio" });
  const request = buildExternalModelRequest({ safeContext: view.safeContext, accountAggregate: view.safeContext.accountAggregate, healthScore: view.healthScore, page: "risk", requestId: "calibration-request-001" });
  assert.equal(validateExternalModelRequest(request).ok, true);
  const serialized = JSON.stringify(request).toLowerCase();
  for (const forbidden of ["customername", "contactname", "email", "phone", "scenarioid", "goldenmetadata", "expectedanswer"]) assert.equal(serialized.includes(forbidden), false, forbidden);
  assert.equal(request.safety.customerIdentityMasked, true);
  assert.equal(request.safety.exactAmountSentToModel, false);
  assert.equal(request.safety.rawTimelineSent, false);
  assert.equal(request.safety.crmWritebackEnabled, false);
  for (const field of ["customerToken", "priority", "stagnationBand", "dataQualityCodes", "varianceCategory", "decisionReadiness"]) {
    assert.equal(Object.hasOwn(request.safeContext, field), true, field);
  }
  for (const token of request.safeContext.evidenceTokens) {
    assert.equal(Object.hasOwn(request.safeContext, token.replace(/^safeContext\./, "")), true, token);
  }
});

test("all external providers are disabled until an independent canary authorization", async () => {
  const status = providerHarnessStatus({ env: { AI_MODEL: "configured-but-not-authorized" } });
  assert.equal(status.externalProvidersEnabled, false);
  assert.equal(status.externalModelCalled, false);
  const provider = createDecisionProvider({ name: "openai-compatible", env: { ALLOW_EXTERNAL_AI: "true" } });
  const result = await provider.complete({ requestId: "disabled-provider-001" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "external_canary_not_authorized");
});

test("response contract and evaluation hard-fail unsupported facts", () => {
  const view = getDecisionView({ mode: "portfolio" });
  const baseline = view.pack.risk;
  const safeResponse = {
    facts: baseline.fact.map((item) => ({ fact: item.value, evidenceToken: baseline.evidence[0].source })),
    inferences: [{ inference: "Model inference only", evidenceTokens: [baseline.evidence[0].source] }],
    evidence: baseline.evidence.map((item) => ({ evidenceToken: item.source, value: item.value })),
    confidence: { level: baseline.confidence.level, reason: "Evidence-aligned." },
    recommendedActions: baseline.recommendedAction.map((item) => ({ action: item.title, ownerRole: "Owner role", dueWindow: item.due, basis: item.reason, status: "Draft only" })),
    priority: baseline.priority,
    riskCategories: [], provider: "external", model: "not-executed", modelVersion: "not-executed", fallback: null,
    safety: { customerIdentityMasked: true, exactAmountSentToModel: false, rawTimelineSent: false, crmWritebackEnabled: false }, limitations: ["Not executed"],
  };
  assert.equal(validateExternalModelResponse(safeResponse, { evidenceTokens: baseline.evidence.map((item) => item.source) }).ok, true);
  const unsafe = { ...safeResponse, inferences: [{ inference: "Customer john@example.com confirmed exact revenue.", evidenceTokens: [] }] };
  const evaluation = evaluateModelResponse({ baseline, candidate: unsafe, safeContext: view.safeContext });
  assert.equal(evaluation.ready, false);
  assert.ok(evaluation.hardFailures.length > 0);
});

test("Goal 3B artifacts freeze the baseline, safety gates, and canary selection", async () => {
  const root = path.resolve(new URL("..", import.meta.url).pathname);
  const readJson = async (name) => JSON.parse(await fs.readFile(path.join(root, "docs/gateway", name), "utf8"));
  const baseline = await readJson("health-score-v2-contract.json");
  const manifest = await readJson("health-score-v2-calibration-manifest.json");
  const distribution = await readJson("health-score-v2-distribution-report.json");
  const canary = await readJson("external-llm-canary-selection-v2.json");
  const requestContract = await readJson("external-model-request-contract-v1.json");
  const responseContract = await readJson("external-model-response-contract-v1.json");
  const readiness = await fs.readFile(path.join(root, "docs/gateway/goal3b-readiness-report.md"), "utf8");
  assert.equal(baseline.scoreCount, 200);
  assert.equal(baseline.contractVersion, "Opportunity Health Score Contract v2");
  assert.deepEqual(baseline.thresholds, { S: 90, A: 80, B: 70, C: 60, D: 50, Z: 0 });
  assert.deepEqual(baseline.datasetBaseline.stateDistribution, { active: 100, won: 91, lost: 9 });
  assert.equal(manifest.issueCounts.P0, 0);
  assert.equal(manifest.issueCounts.P1, 0);
  assert.equal(manifest.requestStats.POST, 0);
  assert.equal(manifest.requestStats.ExternalLLMCalls, 0);
  assert.equal(canary.count, 24);
  assert.equal(distribution.scenarioCalibration.ready, true);
  assert.equal(distribution.scenarioCalibration.healthyControl.ready, true);
  assert.equal(distribution.scenarioCalibration.riskGradeCoverage.ready, true);
  assert.equal(new Set(canary.records.map((item) => item.opportunityToken)).size, 24);
  assert.doesNotMatch(JSON.stringify(canary.records), /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
  assert.equal(requestContract.safety.exactAmountSentToModel, false);
  assert.equal(responseContract.safety.rawTimelineExposure, false);
  assert.match(readiness, /Goal 3B Complete=true/);
});

function calibrationContexts() {
  const departments = ["Dept1 Industry", "Dept1 Distribution", "Dept2 LCMS", "Dept3 Project Cargo", "Dept3 Dangerous Goods", "FF", "Others"];
  const states = ["Active", "Won", "Lost"];
  return Array.from({ length: 200 }, (_, index) => {
    const state = index < 100 ? states[0] : index < 150 ? states[1] : states[2];
    const missingCodes = index % 11 === 0 ? ["missing-next-action"] : [];
    const contradictionCodes = index % 17 === 0 ? ["forecast-contradiction"] : [];
    const accountToken = `CAL-ACCOUNT-${String(index % 20 + 1).padStart(2, "0")}`;
    return {
      opportunityToken: `CAL-${String(index + 1).padStart(3, "0")}`,
      accountToken,
      salesDepartment: departments[index % departments.length],
      opportunityState: state,
      stage: ["Qualify", "Develop", "Propose", "Close"][index % 4],
      priority: index % 13 === 0 ? "Critical" : index % 5 === 0 ? "High" : index % 2 === 0 ? "Medium" : "Monitor",
      relativeDateStatus: index % 9 === 0 ? "overdue" : index % 4 === 0 ? "near-term" : "future",
      stagnationBand: index % 13 === 0 ? "severe" : index % 5 === 0 ? "watch" : "active",
      actualBand: index % 4 === 0 || state === "Won" ? "100k-500k" : "none",
      closeFact: state === "Active" ? "none" : "present",
      amountBand: ["under-100k", "100k-500k", "500k-1m", "1m-5m", "over-5m"][index % 5],
      revenueBand: ["under-100k", "100k-500k", "500k-1m", "1m-5m", "over-5m"][index % 5],
      marginBand: ["5-8-percent", "8-12-percent", "12-15-percent"][index % 3],
      varianceCategory: index % 10 === 0 ? "material-negative" : index % 3 === 0 ? "negative" : "on-plan",
      missingCodes,
      contradictionCodes,
      dataQualityCodes: [...missingCodes, ...contradictionCodes],
      routeConsistency: index % 8 === 0 ? "review-required" : "consistent",
      stakeholderCoverage: index % 6 === 0 ? "limited" : "complete",
      decisionReadiness: index % 6 === 0 ? "low" : "high",
      openQuestionCount: index % 7 === 0 ? 3 : 0,
      meetingWindow: index % 4 === 0 ? "within-7-days" : "within-30-days",
      timelineSignalCount: index % 6 === 0 ? 0 : 4,
      coverageCategory: index % 5 === 0 ? "narrow" : "broad",
      accountAggregate: {
        accountToken,
        serviceCoverageBand: index % 5 === 0 ? "narrow" : "broad",
        whitespaceCategory: index % 7 === 0 ? "cross-sell-potential" : "none",
        opportunityTrend: "stable",
        relationshipMaturity: "established",
      },
    };
  });
}
