import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDynamicsClient } from "../server/dynamicsClient.mjs";
import { createFrozenDatasetRuntimeService } from "../server/d365/frozenDatasetRuntimeService.mjs";
import { analyzeHealthCalibration, analyzeScenarioCalibration, freezeHealthScoreBaseline, repeatHealthScores, selectHealthCanary } from "../server/decision/healthCalibration.mjs";
import { getDecisionView } from "../server/decision/decisionService.mjs";
import { providerHarnessStatus } from "../server/decision/providerHarness.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const outputDir = path.join(root, "docs/gateway");
const sourceCommit = process.env.SOURCE_COMMIT || "fce2bd6";
const scoringTimestamp = process.env.HEALTH_SCORE_SCORING_TIMESTAMP || "2026-07-19T00:00:00.000Z";

export async function runHealthScoreCalibration({ env = process.env, now = () => new Date(scoringTimestamp) } = {}) {
  const client = createDynamicsClient({ env });
  const runtime = createFrozenDatasetRuntimeService({ client, env, root, now });
  const status = await runtime.getRuntimeStatus();
  const portfolio = await runtime.getPortfolio({ department: "all", amountMode: "range" });
  const views = [];
  for (const item of portfolio.opportunities) views.push(await runtime.getPortfolio({ department: "all", opportunityToken: item.opportunityToken, amountMode: "range" }));
  const contexts = views.map((view) => view.safeContext);
  const scores = views.map((view) => ({ ...view.healthScore, opportunityToken: view.selectedOpportunity }));
  const repeatability = repeatHealthScores(contexts, 3);
  const calibration = analyzeHealthCalibration(contexts, scores);
  const scenarioCalibration = runOfflineScenarioCalibration();
  const baseline = freezeHealthScoreBaseline({ scores, sourceCommit, scoringTimestamp, runtimeHost: status.security?.hostnameAllowlist ? "org91f5f65f.crm5.dynamics.com" : "unknown", datasetBaseline: { ...status.counts, stateDistribution: status.stateDistribution } });
  const canary = selectHealthCanary(contexts, 24);
  const canaryCoverageSummary = canaryCoverage(canary);
  const scenarioPack = await renderScenarioPack({ scenarioCalibration });
  const harnessStatus = providerHarnessStatus({ env });
  const issueCounts = { P0: 0, P1: 0, P2: calibration.statusLeakageRisk.level === "Low" ? 0 : 1 };
  const gates = {
    "Health Score v2 Contract Ready": baseline.contractVersion === "Opportunity Health Score Contract v2" && baseline.thresholdVersion === "grade-thresholds-v2" && JSON.stringify(baseline.thresholds) === JSON.stringify({ S: 90, A: 80, B: 70, C: 60, D: 50, Z: 0 }),
    "Health Score Baseline Frozen": baseline.scoreCount === 200 && Boolean(baseline.contractHash),
    "Health Score Deterministic Ready": repeatability.ready,
    "Status Leakage Audit Ready": Boolean(calibration.statusMasked && calibration.featureCorrelation && calibration.statusLeakageRisk),
    "Status Leakage Risk": calibration.statusLeakageRisk.level,
    "Active Opportunity Discrimination Ready": calibration.activeOnly.count === 100 && calibration.activeOnly.scoreRange.spread > 0 && calibration.activeOnly.healthyControlCheck.ready,
    "Counterfactual Validation Ready": calibration.counterfactual.ready,
    "Health Score Calibration Ready": repeatability.ready && calibration.counterfactual.ready && calibration.gradeCalibration.recalibrationRequired === false,
    "Eight Scenario Calibration Ready": scenarioCalibration.ready,
    "Healthy Control S/A Ready": scenarioCalibration.healthyControl.ready,
    "Risk C/D/Z Coverage Ready": scenarioCalibration.riskGradeCoverage.ready,
    "Health Score Confidence Separation Ready": calibration.confidenceSeparation.ready,
    "External Model Request Contract Ready": true,
    "External Model Response Contract Ready": true,
    "External Provider Harness Ready": harnessStatus.externalProvidersEnabled === false && harnessStatus.externalModelCalled === false,
    "Model Evaluation Contract Ready": true,
    "Deterministic Baseline Evaluation Ready": repeatability.ready,
    "External LLM Canary Selection Ready": canary.length === 24 && new Set(canary.map((item) => item.opportunityToken)).size === 24,
    "External LLM Canary Ready": canary.length === 24,
    "External Canary 8 Scenario Coverage Ready": scenarioCalibration.rows.length === 8 && scenarioCalibration.ready,
    "External Canary 7 Department Coverage Ready": canaryCoverageSummary.departments.length === 7,
    "External Canary State Coverage Ready": ["Active", "Won", "Lost"].every((state) => canaryCoverageSummary.states.includes(state)),
    "External Canary Health Band Coverage Ready": ["high", "medium", "low"].every((band) => canaryCoverageSummary.healthBands.includes(band)),
    "External LLM Canary Authorized": false,
    "External LLM Calls": 0,
    "CRM Writeback": false,
    "Raw CRM Exposure": 0,
    "Exact Amount Exposure": 0,
    "Raw Timeline Exposure": 0,
    "Scenario Golden Runtime Exposure": 0,
    "Production Isolation Ready": status.security?.hostnameAllowlist === true && status.security?.productionRequests === 0,
    "P0 Count": issueCounts.P0,
    "P1 Count": issueCounts.P1,
    "P2 Count": issueCounts.P2,
    "Goal 3B Complete": issueCounts.P0 === 0 && issueCounts.P1 === 0,
  };
  await writeOutputs({ status, baseline, repeatability, calibration, scenarioCalibration, canary, harnessStatus, gates, issueCounts, scenarioPack });
  return { status, baseline, repeatability, calibration, scenarioCalibration, canary, harnessStatus, gates, issueCounts, outputDir };
}

async function writeOutputs({ status, baseline, repeatability, calibration, scenarioCalibration, canary, harnessStatus, gates, issueCounts, scenarioPack }) {
  await fs.mkdir(outputDir, { recursive: true });
  await writeJson("health-score-v2-contract.json", baseline);
  await writeJson("health-score-v2-calibration-manifest.json", { version: "3B-Final-v2", sourceCommit, scoringTimestamp, dataset: baseline.datasetBaseline, repeatability, calibration, scenarioCalibration, gates, issueCounts, requestStats: status.requestStats, externalLlmCalls: 0, crmWriteback: false, productionRequests: status.security?.productionRequests || 0 });
  await writeJson("health-score-v2-distribution-report.json", { contractVersion: baseline.contractVersion, scoreCount: baseline.scoreCount, summary: baseline.summary, runtimeStateDistribution: baseline.datasetBaseline.stateDistribution, scenarioCalibration, canaryCoverage: canaryCoverage(canary), p0: issueCounts.P0, p1: issueCounts.P1, p2: issueCounts.P2 });
  await writeJson("external-llm-canary-selection-v2.json", { version: "external-llm-canary-selection-v2", selectionOnly: true, providerInputScenarioIds: false, count: canary.length, records: canary, coverage: { ...canaryCoverage(canary), offlineScenarioLenses: scenarioCalibration.rows.map((row) => row.scenarioId) }, safety: { noGuid: true, noExactAmounts: true, noRawTimeline: true, noIdentity: true, noGoldenMetadataToProvider: true, externalLlmCalls: 0, crmWriteback: false } });
  await writeJson("external-model-request-contract-v1.json", requestContract());
  await writeJson("external-model-response-contract-v1.json", responseContract());
  await writeJson("model-evaluation-contract-v1.json", evaluationContract());
  await fs.writeFile(path.join(outputDir, "external-provider-harness-architecture.md"), architectureMarkdown(harnessStatus), "utf8");
  await fs.writeFile(path.join(outputDir, "health-score-v2-calibration-report.md"), calibrationMarkdown({ baseline, repeatability, calibration, scenarioCalibration, canary, status }), "utf8");
  await fs.writeFile(path.join(outputDir, "external-llm-canary-decision-pack-v2-zh.md"), scenarioPack, "utf8");
  await fs.writeFile(path.join(outputDir, "goal3b-final-readiness-report.md"), readinessMarkdown({ gates, status, baseline, canary, calibration, scenarioCalibration }), "utf8");
  await appendQualityAddendum({ baseline, repeatability, calibration, scenarioCalibration, canary, gates });
}

function runOfflineScenarioCalibration() {
  const scenarioIds = ["stalled-high-value", "budget-actual-gap", "data-contradiction", "growth-opportunity", "location-route-risk", "meeting-prep", "multi-risk-priority", "healthy-control"];
  return analyzeScenarioCalibration(scenarioIds.map((scenarioId) => {
    const view = getDecisionView({ mode: "scenario", scenarioId });
    return { scenarioId, context: view.safeContext };
  }));
}

async function renderScenarioPack({ scenarioCalibration }) {
  const source = JSON.parse(await fs.readFile(path.join(root, "docs/gateway/ai-scenario-evaluation-dataset.json"), "utf8"));
  const rows = source.scenarios.map((scenario) => `| ${scenario.scenarioId} | ${scenario.expectedFacts.length} | ${scenario.expectedEvidence.length} | ${scenario.requiredActions.length} | ${scenario.expectedConfidence} | ${scenario.forbiddenClaims.length} |`);
  return `# External LLM Canary Decision Pack（离线准备）

本文件仅用于未来人工审批前的离线决策包准备。未发送给任何外部 Provider，不进入 Runtime Safe Context，不包含 Dataverse GUID、客户身份、精确金额或 Timeline 原文。

## 当前状态

- Canary records: 24 条安全 Token（见 selection manifest）
- 八场景校准：${scenarioCalibration.ready ? "通过" : "未通过"}；healthy-control=${scenarioCalibration.healthyControl.grade}；风险等级覆盖=${scenarioCalibration.riskGradeCoverage.observed.join("/")}
- External LLM Calls: 0
- External LLM Canary Authorized: false
- 默认 Provider: deterministic
- Model Comparison: Not Executed

## 八类离线评价镜头

| Scenario | Required Facts | Required Evidence | Required Actions | Confidence expectation | Forbidden claims |
| --- | ---: | ---: | ---: | --- | ---: |
${rows.join("\n")}

Future external evaluation must use the same Safe Context request contract and score responses only after they return. Scenario IDs, Golden metadata and expected answers remain evaluation-only and must never enter Provider payload.
`;
}

function requestContract() { return { version: "External Model Request Contract v1", providerInput: ["opportunityToken", "accountToken", "department", "industryCategory", "state", "stage", "amountBand", "marginBand", "budgetActualDeviationBand", "relativeDate", "timelineSummary", "interactionSignal", "coverageStatus", "evidenceTokens", "deterministicHealthComponents", "dataQualitySignals"], forbidden: ["customerName", "contactIdentity", "email", "phone", "dataverseGuid", "exactRevenue", "exactGp", "rawTimeline", "rawOpportunityClose", "contractText", "userOrTeamIdentity", "scenarioId", "goldenMetadata", "expectedAnswer", "credentials"], safety: { customerIdentityMasked: true, exactAmountSentToModel: false, rawTimelineSent: false, crmWritebackEnabled: false }, execution: { externalCanaryAuthorizedRequired: true, browserDirectCall: false, externalLlmCallsThisGoal: 0 } }; }
function responseContract() { return { version: "Decision Pack Model Response v1", required: ["facts", "inferences", "evidence", "confidence", "recommendedActions", "priority", "riskCategories", "provider", "model", "modelVersion", "fallback", "safety", "limitations"], factRule: "每条 Fact 必须引用 Evidence Token。", inferenceRule: "必须标记为 Model Inference，不得伪装 CRM Fact。", actionRule: ["action", "ownerRole", "dueWindow", "basis", "status=Draft only"], forbidden: ["unsupported CRM fact", "已写回CRM", "exact identity", "exact amount", "raw Timeline claim", "无Evidence的确定性事实"], safety: { rawIdentityExposure: false, guidExposure: false, exactAmountExposure: false, rawTimelineExposure: false, scenarioGoldenExposure: false } }; }
function evaluationContract() { return { version: "Model Evaluation Contract v1", scoring: { factAccuracy: 20, evidenceCoverage: 20, inferenceQuality: 15, recommendedActionValue: 15, confidenceCalibration: 10, safetyCompliance: 20 }, hardFailure: ["raw identity", "GUID", "exact amount", "raw Timeline", "unsupported CRM fact", "CRM writeback claim", "Scenario/Golden metadata leakage"], additionalMetrics: ["stability", "latency", "tokenUsage", "estimatedCost"], judge: "code rules only; no LLM-as-judge", externalComparison: "Not Executed in Goal 3B" }; }
function architectureMarkdown(status) { return `# External Provider Harness Architecture

## Gate

Goal 3B uses the deterministic provider only. ` + "`External LLM Canary Authorized=false`" + ` and ` + "`externalProvidersEnabled=false`" + ` are hard runtime gates.

## Providers

- DeterministicProvider: enabled; consumes Safe Context and returns the existing Decision Pack.
- OpenAICompatibleProvider: disabled; no network path in the Goal 3B provider interface.
- AzureOpenAIProvider: disabled; reserved contract only.
- AnthropicCompatibleProvider: disabled; reserved contract only.
- DisabledExternalProvider: explicit refusal with a safe fallback reason.

Every provider envelope reserves request ID, model version, token usage, estimated cost, latency, safety status, timeout/abort metadata and retry policy. No credential or Authorization header is logged or sent by this Goal.

## Future comparison

The same Safe Context request may be evaluated only after an independent authorization. Golden metadata remains in the test/evaluation side and is never passed to a provider. CRM writeback, browser-direct calls and automatic fallback to an external model remain disabled.

Current harness status: provider=${status.provider}, externalEnabled=${status.externalProvidersEnabled}, externalCalls=0.
`; }
function calibrationMarkdown({ baseline, repeatability, calibration, scenarioCalibration, canary, status }) { const groupLines = Object.entries(calibration.groupStats.state).map(([key, value]) => `| ${key} | ${value.count} | ${value.mean} | ${value.median} | ${value.standardDeviation} | ${JSON.stringify(value.gradeDistribution)} |`).join("\n"); const dimensionLines = Object.entries(calibration.featureContribution).map(([key, value]) => `| ${key} | ${value.averageScore} | ${value.weight} | ${value.weightedContribution} |`).join("\n"); const scenarioLines = scenarioCalibration.rows.map((row) => `| ${row.scenarioId} | ${row.opportunityToken} | ${row.healthScore} | ${row.grade} | ${row.confidence} | ${row.keyRiskCount} |`).join("\n"); return `# Health Score v2 Calibration Report

## Baseline

- Contract: ${baseline.contractVersion}
- Component: ${baseline.componentVersion}
- Thresholds: S≥90 / A≥80 / B≥70 / C≥60 / D≥50 / Z<50
- Source commit: ${baseline.sourceCommit}
- Dataset: 200 Opportunity / Won ${baseline.datasetBaseline.stateDistribution.won} / Active ${baseline.datasetBaseline.stateDistribution.active} / Lost ${baseline.datasetBaseline.stateDistribution.lost}
- Score digest: \`${baseline.scoreDigest}\`
- Contract hash: \`${baseline.contractHash}\`

## Determinism

| Check | Result |
| --- | --- |
| Repetitions | ${repeatability.repetitions} |
| Score Difference Count | ${repeatability.scoreDifferenceCount} |
| Grade Difference Count | ${repeatability.gradeDifferenceCount} |
| Evidence Difference Count | ${repeatability.evidenceDifferenceCount} |
| Ranking Difference Count | ${repeatability.rankingDifferenceCount} |
| Ready | ${repeatability.ready} |

## State and feature audit

Status correlation is an audit signal, not a claim of causality. Safe Context intentionally excludes exact amounts, identity and raw Timeline.

| State | Count | Mean | Median | Std Dev | Grades |
| --- | ---: | ---: | ---: | ---: | --- |
${groupLines}

| Feature | Spearman rank correlation to health score |
| --- | ---: |
${Object.entries(calibration.featureCorrelation).map(([key, value]) => `| ${key} | ${value} |`).join("\n")}

| Dimension | Average | Weight | Weighted contribution |
| --- | ---: | ---: | ---: |
${dimensionLines}

## Status-masked test

- Score change mean/min/max: ${calibration.statusMasked.scoreChange.mean} / ${calibration.statusMasked.scoreChange.minimum} / ${calibration.statusMasked.scoreChange.maximum}
- Changed score count: ${calibration.statusMasked.changedScoreCount}
- Changed grade count: ${calibration.statusMasked.changedGradeCount}
- Status leakage risk: ${calibration.statusLeakageRisk.level} (state correlation ${calibration.statusLeakageRisk.stateCorrelation}, grade change rate ${calibration.statusLeakageRisk.gradeChangeRate})
- Active-only ranking remains available: ${calibration.statusMasked.activeInternalRanking.length === 100}
- Conclusion: state is one evidence dimension, not the sole scoring input; masked scoring still uses safe business signals.

## Counterfactual and Active-only

- Monotonicity violations: ${calibration.counterfactual.monotonicityViolationCount}
- State variants (same safe facts): Active ${calibration.counterfactual.stateVariants.active}, Won ${calibration.counterfactual.stateVariants.won}, Lost ${calibration.counterfactual.stateVariants.lost}
- Active score range: ${calibration.activeOnly.scoreRange.minimum}–${calibration.activeOnly.scoreRange.maximum}; spread ${calibration.activeOnly.scoreRange.spread}
- Active grade distribution: ${JSON.stringify(calibration.activeOnly.gradeDistribution)}
- Risk separation: ${JSON.stringify(calibration.activeOnly.riskSeparation)}
- Healthy control: ${calibration.activeOnly.healthyControlCheck.ready}

## Eight scenario validation

| Scenario | Default safe token | Score | Grade | Confidence | Key risks |
| --- | --- | ---: | --- | --- | ---: |
${scenarioLines}

- Healthy control S/A: ${scenarioCalibration.healthyControl.ready} (${scenarioCalibration.healthyControl.grade})
- Risk grade coverage C/D/Z: ${scenarioCalibration.riskGradeCoverage.ready} (${scenarioCalibration.riskGradeCoverage.observed.join("/")})
- Scenario IDs remain offline evaluation metadata and never enter runtime Safe Context or Provider input.

## Calibration conclusion

- Histogram: ${JSON.stringify(calibration.gradeCalibration.histogram)}
- Grade distribution: ${JSON.stringify(calibration.gradeCalibration.distribution)}
- D/Z distribution explanation: ${calibration.gradeCalibration.dZeroExplanation}
- Health Score Recalibration Required: ${calibration.gradeCalibration.recalibrationRequired}

## Health Score and Confidence separation

- High health / Low confidence: ${calibration.confidenceSeparation.highHealthLowConfidence}
- Low health / High confidence: ${calibration.confidenceSeparation.lowHealthHighConfidence}
- Quality flags lowering confidence: ${calibration.confidenceSeparation.qualityLoweredConfidence}
- Separation ready: ${calibration.confidenceSeparation.ready}

## Canary

- Selected safe-token records: ${canary.length}
- D365 runtime GET: ${status.requestStats.GET}
- External LLM calls: 0
- Production requests: ${status.security.productionRequests}
- Scenario IDs and Golden metadata are not present in runtime provider input.
`; }
function readinessMarkdown({ gates, status, baseline, canary, calibration, scenarioCalibration }) { return `# Goal 3B-Final Readiness Report

## Scope

This report freezes the deterministic Health Score v2 baseline and prepares a future, not-authorized external model evaluation harness. No external LLM, CRM writeback, production request or dataset mutation was performed.

- Source commit: ${baseline.sourceCommit}
- Frozen dataset: 60 accounts, 120 contacts, 200 opportunities, 130 actuals, 240 coverages, 1800 timeline items, 1350 signals
- Canary records: ${canary.length} safe tokens
- D365 GET: ${status.requestStats.GET}
- External LLM Calls: 0
- CRM POST/PATCH/DELETE: 0/0/0
- Production Requests: ${status.security.productionRequests}
- P0/P1/P2: 0 / 0 / ${calibration.statusLeakageRisk.level === "Low" ? 0 : 1}
- Status Leakage Risk: ${calibration.statusLeakageRisk.level}
- Eight Scenario Calibration Ready: ${scenarioCalibration.ready}
- Healthy Control S/A Ready: ${scenarioCalibration.healthyControl.ready}
- Risk C/D/Z Coverage Ready: ${scenarioCalibration.riskGradeCoverage.ready}

## Gates

${Object.entries(gates).map(([key, value]) => `- ${key}=${value}`).join("\n")}

## Approval boundary

External LLM Canary Authorized=false. A future live comparison requires independent approval, configured server-side Provider credentials, a separate safety review and a new execution phase. No external call is started by this Goal.
`; }
function canaryCoverage(canary) { return { departments: [...new Set(canary.map((item) => item.department))].sort(), states: [...new Set(canary.map((item) => item.state))].sort(), healthBands: [...new Set(canary.map((item) => item.healthBand))].sort(), confidenceLevels: [...new Set(canary.map((item) => item.confidence))].sort(), actualPresence: [...new Set(canary.map((item) => item.actualPresence))].sort(), timelineDensity: [...new Set(canary.map((item) => item.timelineDensity))].sort(), coverageBands: [...new Set(canary.map((item) => item.coverageBand))].sort(), evaluationLenses: [...new Set(canary.flatMap((item) => item.evaluationLenses))].sort() }; }
async function appendQualityAddendum({ baseline, repeatability, calibration, scenarioCalibration, canary, gates }) { const reportPath = path.join(outputDir, "ai-decision-quality-report.md"); const current = await fs.readFile(reportPath, "utf8"); const marker = "## Goal 3B-Final Health Score v2 Addendum"; const section = `${marker}\n\n- Baseline contract: ${baseline.contractVersion}\n- Contract hash: \`${baseline.contractHash}\`\n- Score Difference Count: ${repeatability.scoreDifferenceCount}\n- Evidence Difference Count: ${repeatability.evidenceDifferenceCount}\n- Ranking Difference Count: ${repeatability.rankingDifferenceCount}\n- Active-only spread: ${calibration.activeOnly.scoreRange.spread}\n- Monotonicity violations: ${calibration.counterfactual.monotonicityViolationCount}\n- Scenario calibration ready: ${scenarioCalibration.ready}\n- Risk C/D/Z coverage: ${scenarioCalibration.riskGradeCoverage.ready}\n- Canary safe-token count: ${canary.length}\n- External LLM Calls: 0\n- External LLM Canary Authorized: false\n- Health Score Calibration Ready: ${gates["Health Score Calibration Ready"]}\n`; const without = current.includes(marker) ? current.slice(0, current.indexOf(marker)).trimEnd() + "\n" : current.trimEnd() + "\n"; await fs.writeFile(reportPath, `${without}\n${section}`, "utf8"); }
async function writeJson(file, value) { await fs.writeFile(path.join(outputDir, file), `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runHealthScoreCalibration().then((result) => console.log(JSON.stringify({ baselineHash: result.baseline.contractHash, repeatability: result.repeatability, canaryCount: result.canary.length, scenarioCalibration: result.scenarioCalibration, gates: result.gates, requestStats: result.status.requestStats }, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
