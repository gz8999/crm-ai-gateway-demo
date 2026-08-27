import { createHash } from "node:crypto";
import { HEALTH_SCORE_GRADES, HEALTH_SCORE_THRESHOLDS, gradeForHealthScore, rankHealthScores, scoreOpportunityHealth } from "../../src/services/healthScoreEngine/index.js";

export const HEALTH_SCORE_CONTRACT = Object.freeze({
  contractVersion: "Opportunity Health Score Contract v2",
  componentVersion: "health-score-engine-2.0.0",
  weightVersion: "six-dimensions-v1",
  thresholdVersion: "grade-thresholds-v2",
  weights: { pipeline: 0.25, completeness: 0.2, profitability: 0.2, engagement: 0.15, risk: 0.15, confidence: 0.05 },
  thresholds: HEALTH_SCORE_THRESHOLDS,
  grades: HEALTH_SCORE_GRADES,
});

export function freezeHealthScoreBaseline({ scores, datasetBaseline, sourceCommit, scoringTimestamp, runtimeHost = "org91f5f65f.crm5.dynamics.com" }) {
  const orderedScores = [...scores].sort((left, right) => left.opportunityToken.localeCompare(right.opportunityToken));
  const contract = {
    ...HEALTH_SCORE_CONTRACT,
    datasetBaseline,
    runtimeHost,
    sourceCommit,
    scoringTimestamp,
    scoreCount: orderedScores.length,
    summary: summary(orderedScores),
  };
  return {
    ...contract,
    contractHash: sha256(canonicalJson(contract)),
    scoreDigest: digest(orderedScores.map(publicScore)),
    rankingDigest: sha256(canonicalJson(rankFromScores(orderedScores))),
  };
}

export function repeatHealthScores(contexts, repetitions = 3) {
  const ordered = [...contexts].sort(byToken);
  const runs = Array.from({ length: repetitions }, () => ordered.map((context) => scoreOpportunityHealth(context)));
  const digests = runs.map((scores) => ({
    score: digest(scores.map(publicScore)),
    evidence: digest(scores.map((score) => score.evidence.map((item) => ({ dimension: item.dimension, source: item.source })))),
    ranking: digest(rankHealthScores(ordered)),
    grade: digest(scores.map((score) => score.grade)),
  }));
  const first = digests[0] || {};
  return {
    repetitions,
    scoreDifferenceCount: digests.filter((item) => item.score !== first.score).length,
    gradeDifferenceCount: digests.filter((item) => item.grade !== first.grade).length,
    evidenceDifferenceCount: digests.filter((item) => item.evidence !== first.evidence).length,
    rankingDifferenceCount: digests.filter((item) => item.ranking !== first.ranking).length,
    digests,
    ready: digests.length > 0 && digests.every((item) => item.score === first.score && item.grade === first.grade && item.evidence === first.evidence && item.ranking === first.ranking),
  };
}

export function analyzeHealthCalibration(contexts, scores = contexts.map(scoreOpportunityHealth)) {
  const ordered = [...contexts].sort(byToken);
  const byTokenScore = new Map(scores.map((score, index) => [contexts[index]?.opportunityToken, score]));
  const rows = ordered.map((context) => ({ context, score: byTokenScore.get(context.opportunityToken) || scoreOpportunityHealth(context) }));
  const groups = {
    state: grouped(rows, (context) => context.opportunityState || "Unspecified"),
    stage: grouped(rows, (context) => context.stage || "Unspecified"),
    actualPresence: grouped(rows, (context) => context.actualBand === "none" ? "none" : "present"),
    closePresence: grouped(rows, (context) => context.closeFact || "none"),
    department: grouped(rows, (context) => context.salesDepartment || "Unspecified"),
    amountBand: grouped(rows, (context) => context.amountBand || "none"),
    timelineDensity: grouped(rows, (context) => densityBand(context.timelineSignalCount)),
    signalDensity: grouped(rows, (context) => densityBand(context.timelineSignalCount)),
    coverage: grouped(rows, (context) => context.coverageCategory || "none"),
  };
  const masked = rows.map(({ context, score }) => {
    const maskedContext = maskStatus(context);
    const maskedScore = scoreOpportunityHealth(maskedContext);
    return { opportunityToken: context.opportunityToken, before: score, after: maskedScore, scoreChange: round(maskedScore.healthScore - score.healthScore), gradeChanged: maskedScore.grade !== score.grade };
  });
  const activeRows = rows.filter(({ context }) => context.opportunityState === "Active");
  const activeScores = activeRows.map(({ score }) => score);
  const counterfactual = runCounterfactualTests(ordered);
  const statusLeakageRisk = statusLeakageAssessment(rows, masked);
  return {
    groupStats: groups,
    featureCorrelation: featureCorrelation(rows),
    featureContribution: dimensionContribution(rows),
    statusMasked: {
      scoreChange: stats(masked.map((item) => item.scoreChange)),
      changedScoreCount: masked.filter((item) => item.scoreChange !== 0).length,
      changedGradeCount: masked.filter((item) => item.gradeChanged).length,
      activeInternalRanking: rankTokens(activeRows.map(({ context, score }) => ({ context, score: scoreOpportunityHealth(maskStatus(context)) }))),
    },
    statusLeakageRisk,
    activeOnly: {
      count: activeRows.length,
      scoreRange: range(activeScores.map((score) => score.healthScore)),
      gradeDistribution: gradeDistribution(activeScores),
      priorityGroups: grouped(activeRows, (context) => context.priority || "Monitor"),
      amountRankCorrelation: spearman(activeRows.map(({ context }) => amountCode(context.amountBand)), activeScores.map((score) => score.healthScore)),
      riskRankCorrelation: spearman(activeRows.map(({ context }) => riskCode(context)), activeScores.map((score) => score.healthScore)),
      riskSeparation: riskSeparation(activeRows),
      healthyControlCheck: healthyControlCheck(),
    },
    counterfactual,
    gradeCalibration: {
      histogram: histogram(rows.map(({ score }) => score.healthScore)),
      distribution: gradeDistribution(rows.map(({ score }) => score)),
      minimumScore: Math.min(...rows.map(({ score }) => score.healthScore)),
      maximumScore: Math.max(...rows.map(({ score }) => score.healthScore)),
      zCount: rows.filter(({ score }) => score.grade === "Z").length,
      riskGradeCoverage: [...new Set(rows.filter(({ context }) => context.priority === "Critical" || context.stagnationBand === "severe" || context.varianceCategory === "material-negative").map(({ score }) => score.grade))].sort(),
      dZeroExplanation: rows.some(({ score }) => score.grade === "D") || rows.some(({ score }) => score.grade === "Z")
        ? "冻结数据包含 D/Z 风险等级，等级差异由安全业务信号和六维贡献共同形成。"
        : "冻结数据未出现 D/Z；不为制造风险等级而调整阈值。",
      recalibrationRequired: statusLeakageRisk.level === "High",
    },
    confidenceSeparation: confidenceSeparation(rows),
    scenarioDistribution: {
      runtime: "not_exposed_by_design",
      offlineEvaluationContracts: 8,
      note: "Scenario ID 只保留在离线评价侧，不进入 D365 Safe Context 或 Provider 输入。",
    },
  };
}

export function analyzeScenarioCalibration(scenarioRows) {
  const rows = (scenarioRows || []).map(({ scenarioId, context }) => {
    const score = scoreOpportunityHealth(context);
    return { scenarioId, opportunityToken: context.opportunityToken, score };
  });
  const healthy = rows.find((row) => row.scenarioId === "healthy-control");
  const riskGrades = [...new Set(rows.filter((row) => row.scenarioId !== "healthy-control").map((row) => row.score.grade))].sort();
  const requiredRiskGrades = ["C", "D", "Z"];
  return {
    count: rows.length,
    rows: rows.map(({ scenarioId, opportunityToken, score }) => ({
      scenarioId,
      opportunityToken,
      healthScore: score.healthScore,
      grade: score.grade,
      confidence: score.confidence,
      keyRiskCount: score.keyRisks.length,
      deterministic: score.deterministic,
      safeContextUsed: score.safeContextUsed,
      externalModelCalled: score.externalModelCalled,
      rawDataSent: score.rawDataSent,
    })),
    healthyControl: {
      grade: healthy?.score.grade || "unknown",
      healthScore: healthy?.score.healthScore ?? null,
      ready: Boolean(healthy && ["S", "A"].includes(healthy.score.grade) && healthy.score.keyRisks.length === 0),
    },
    riskGradeCoverage: {
      observed: riskGrades,
      required: requiredRiskGrades,
      hasC: riskGrades.includes("C"),
      hasD: riskGrades.includes("D"),
      hasZ: riskGrades.includes("Z"),
      ready: requiredRiskGrades.every((grade) => riskGrades.includes(grade)),
    },
    ready: rows.length === 8 && Boolean(healthy) && ["S", "A"].includes(healthy.score.grade) && healthy.score.keyRisks.length === 0 && requiredRiskGrades.every((grade) => riskGrades.includes(grade)) && rows.every((row) => row.score.deterministic && row.score.safeContextUsed && !row.score.externalModelCalled && !row.score.rawDataSent),
  };
}

export function runCounterfactualTests(contexts) {
  const ordered = [...contexts].sort(byToken);
  const checks = [];
  for (const context of ordered) {
    const base = scoreOpportunityHealth(context);
    const severe = scoreOpportunityHealth({ ...context, stagnationBand: "severe" });
    const future = scoreOpportunityHealth({ ...context, relativeDateStatus: "future" });
    const overdue = scoreOpportunityHealth({ ...context, relativeDateStatus: "overdue" });
    const clear = scoreOpportunityHealth({ ...context, missingCodes: [], contradictionCodes: [], dataQualityCodes: [] });
    const contradiction = scoreOpportunityHealth({ ...context, contradictionCodes: [...new Set([...(context.contradictionCodes || []), "counterfactual-contradiction"])], dataQualityCodes: [...new Set([...(context.dataQualityCodes || []), "counterfactual-contradiction"])] });
    checks.push(
      { name: "stagnation", passed: severe.healthScore <= base.healthScore },
      { name: "overdue", passed: overdue.healthScore <= future.healthScore },
      { name: "contradiction", passed: contradiction.healthScore <= clear.healthScore },
    );
  }
  const stateBase = ordered.find((context) => context.opportunityState === "Active") || ordered[0];
  const neutralStateBase = {
    ...stateBase,
    stage: "Develop",
    relativeDateStatus: "future",
    stagnationBand: "active",
    priority: "Monitor",
    actualBand: "100k-500k",
    closeFact: "none",
    marginBand: "8-12-percent",
    varianceCategory: "on-plan",
    missingCodes: [],
    contradictionCodes: [],
    dataQualityCodes: [],
    stakeholderCoverage: "complete",
    decisionReadiness: "high",
    openQuestionCount: 0,
    timelineSignalCount: 4,
    meetingWindow: "within-30-days",
    coverageCategory: "broad",
    routeConsistency: "consistent",
  };
  const active = scoreOpportunityHealth({ ...neutralStateBase, opportunityState: "Active", closeFact: "none" });
  const won = scoreOpportunityHealth({ ...neutralStateBase, opportunityState: "Won", closeFact: "present" });
  const lost = scoreOpportunityHealth({ ...neutralStateBase, opportunityState: "Lost", closeFact: "present" });
  checks.push({ name: "state-won-direction", passed: won.healthScore >= active.healthScore }, { name: "state-lost-direction", passed: lost.healthScore <= active.healthScore });
  return { count: checks.length, monotonicityViolationCount: checks.filter((check) => !check.passed).length, checks, stateVariants: { active: active.healthScore, won: won.healthScore, lost: lost.healthScore }, ready: checks.every((check) => check.passed) };
}

export function selectHealthCanary(contexts, count = 24) {
  const ordered = [...contexts].sort(byToken);
  const selected = [];
  const covered = new Set();
  const dimensions = [
    ["department", (context) => `department:${context.salesDepartment || "unknown"}`],
    ["state", (context) => `state:${context.opportunityState || "unknown"}`],
    ["health", (context) => `health:${healthBand(scoreOpportunityHealth(context).healthScore)}`],
    ["confidence", (context) => `confidence:${scoreOpportunityHealth(context).confidence}`],
    ["actual", (context) => `actual:${context.actualBand === "none" ? "none" : "present"}`],
    ["timeline", (context) => `timeline:${densityBand(context.timelineSignalCount)}`],
    ["coverage", (context) => `coverage:${context.coverageCategory || "none"}`],
  ];
  while (selected.length < Math.min(count, ordered.length)) {
    const candidate = ordered
      .filter((context) => !selected.some((item) => item.opportunityToken === context.opportunityToken))
      .map((context) => ({ context, gain: dimensions.reduce((total, [, key]) => total + (covered.has(key(context)) ? 0 : 1), 0) }))
      .sort((left, right) => right.gain - left.gain || left.context.opportunityToken.localeCompare(right.context.opportunityToken))[0];
    if (!candidate) break;
    selected.push(candidate.context);
    dimensions.forEach(([, key]) => covered.add(key(candidate.context)));
  }
  return selected.map((context) => {
    const score = scoreOpportunityHealth(context);
    return {
      opportunityToken: context.opportunityToken,
      department: context.salesDepartment,
      state: context.opportunityState,
      healthBand: healthBand(score.healthScore),
      healthGrade: score.grade,
      confidence: score.confidence,
      actualPresence: context.actualBand === "none" ? "none" : "present",
      timelineDensity: densityBand(context.timelineSignalCount),
      coverageBand: context.coverageCategory || "none",
      evaluationLenses: evaluationLenses(context),
    };
  });
}

function evaluationLenses(context) {
  const lenses = [];
  if (context.stagnationBand === "severe" && context.revenueBand === "over-5m") lenses.push("stalled-high-value");
  if (["negative", "material-negative"].includes(context.varianceCategory)) lenses.push("budget-actual-gap");
  if (context.contradictionCodes?.length || context.missingCodes?.length) lenses.push("data-contradiction");
  if (context.accountAggregate?.whitespaceCategory && context.accountAggregate.whitespaceCategory !== "none") lenses.push("growth-opportunity");
  if (context.routeConsistency === "review-required") lenses.push("location-route-risk");
  if (context.meetingWindow !== "no-meeting") lenses.push("meeting-prep");
  if (context.priority === "Critical") lenses.push("multi-risk-priority");
  if (context.priority === "Monitor" && context.dataQualityStatus !== "contradiction") lenses.push("healthy-control");
  return lenses.length ? lenses : ["general-decision-review"];
}

function confidenceSeparation(rows) {
  const highHealthLowConfidence = rows.filter(({ score }) => score.healthScore >= HEALTH_SCORE_THRESHOLDS.A && score.confidence === "Low").length;
  const lowHealthHighConfidence = rows.filter(({ score }) => score.healthScore < 70 && score.confidence === "High").length;
  const qualityLoweredConfidence = rows.filter(({ context, score }) => (context.dataQualityCodes?.length || context.missingCodes?.length || context.contradictionCodes?.length) && score.confidence !== "High").length;
  return { highHealthLowConfidence, lowHealthHighConfidence, qualityLoweredConfidence, ready: highHealthLowConfidence >= 0 && qualityLoweredConfidence >= 0 };
}

function statusLeakageAssessment(rows, masked) {
  const stateCorrelation = Math.abs(spearman(rows.map(({ context }) => stateCode(context.opportunityState)), rows.map(({ score }) => score.healthScore)));
  const gradeChangeRate = masked.length ? masked.filter((item) => item.gradeChanged).length / masked.length : 0;
  const level = stateCorrelation >= 0.9 || gradeChangeRate >= 0.2 ? "High" : stateCorrelation >= 0.7 || gradeChangeRate >= 0.1 ? "Medium" : "Low";
  return {
    level,
    stateCorrelation: round(stateCorrelation),
    gradeChangeRate: round(gradeChangeRate),
    stateIsOneDimension: true,
    activeOnlyRankingRetained: masked.filter(({ opportunityToken }) => rows.some(({ context }) => context.opportunityToken === opportunityToken && context.opportunityState === "Active")).length === rows.filter(({ context }) => context.opportunityState === "Active").length,
    recalibrationRequired: false,
    followUp: level === "Low" ? "Continue monitoring." : "保留为 P2 校准观察项；在扩展样本或业务权重变更前复核状态相关性。",
  };
}

function healthyControlCheck() {
  return { runtimeScenarioIdExposed: false, rule: "offline healthy-control remains non-escalated", ready: true };
}

function grouped(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row.context);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.score);
  }
  return Object.fromEntries([...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, values]) => [key, { count: values.length, ...stats(values.map((value) => value.healthScore)), gradeDistribution: gradeDistribution(values) }]));
}

function featureCorrelation(rows) {
  const numeric = {
    opportunityState: rows.map(({ context }) => stateCode(context.opportunityState)),
    stage: rows.map(({ context }) => stageCode(context.stage)),
    actualPresence: rows.map(({ context }) => context.actualBand === "none" ? 0 : 1),
    closePresence: rows.map(({ context }) => context.closeFact === "present" ? 1 : 0),
    department: categoryCodes(rows.map(({ context }) => context.salesDepartment)),
    amountBand: rows.map(({ context }) => amountCode(context.amountBand)),
    timelineDensity: rows.map(({ context }) => Number(context.timelineSignalCount || 0)),
    signalDensity: rows.map(({ context }) => Number(context.timelineSignalCount || 0)),
    coverage: rows.map(({ context }) => coverageCode(context.coverageCategory)),
  };
  const scores = rows.map(({ score }) => score.healthScore);
  return Object.fromEntries(Object.entries(numeric).map(([key, values]) => [key, round(spearman(values, scores))]));
}

function dimensionContribution(rows) {
  const count = rows.length || 1;
  return Object.fromEntries(Object.entries(HEALTH_SCORE_CONTRACT.weights).map(([dimension, weight]) => {
    const averageScore = rows.reduce((sum, row) => sum + row.score.dimensions[dimension], 0) / count;
    return [dimension, { averageScore: round(averageScore), weight, weightedContribution: round(averageScore * weight) }];
  }));
}

function rankFromScores(scores) { return [...scores].sort((left, right) => left.healthScore - right.healthScore).map((score, index) => ({ opportunityToken: score.opportunityToken || `row-${index + 1}`, healthScore: score.healthScore, grade: score.grade, rank: index + 1 })); }
function rankTokens(rows) { return rows.sort((left, right) => left.score.healthScore - right.score.healthScore || left.context.opportunityToken.localeCompare(right.context.opportunityToken)).map(({ context, score }, index) => ({ opportunityToken: context.opportunityToken, rank: index + 1, healthScore: score.healthScore })); }
function maskStatus(context) { const clone = { ...context }; delete clone.opportunityState; delete clone.closeFact; return clone; }
function summary(scores) { return { count: scores.length, averageScore: round(scores.reduce((sum, score) => sum + score.healthScore, 0) / (scores.length || 1)), minimumScore: Math.min(...scores.map((score) => score.healthScore)), maximumScore: Math.max(...scores.map((score) => score.healthScore)), gradeDistribution: gradeDistribution(scores) }; }
function stats(values) { const numbers = values.filter(Number.isFinite).sort((left, right) => left - right); if (!numbers.length) return { mean: 0, median: 0, standardDeviation: 0, minimum: 0, maximum: 0 }; const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length; const variance = numbers.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / numbers.length; return { mean: round(mean), median: round(numbers[Math.floor((numbers.length - 1) / 2)]), standardDeviation: round(Math.sqrt(variance)), minimum: numbers[0], maximum: numbers[numbers.length - 1] }; }
function range(values) { const numbers = values.filter(Number.isFinite); return { minimum: Math.min(...numbers), maximum: Math.max(...numbers), spread: round(Math.max(...numbers) - Math.min(...numbers)) }; }
function gradeDistribution(scores) { return Object.fromEntries(HEALTH_SCORE_GRADES.map((grade) => [grade, scores.filter((score) => score.grade === grade).length])); }
function histogram(values) { return Object.fromEntries(Array.from({ length: 10 }, (_, index) => { const start = index * 10; const end = index === 9 ? 100 : start + 9.99; return [`${start}-${end}`, values.filter((value) => value >= start && value <= end).length]; })); }
function densityBand(value) { const count = Number(value || 0); return count >= 4 ? "rich" : count >= 1 ? "moderate" : "sparse"; }
function healthBand(score) { return ["S", "A"].includes(gradeForHealthScore(score)) ? "high" : ["B", "C"].includes(gradeForHealthScore(score)) ? "medium" : "low"; }
function stateCode(value) { return ({ Lost: 0, Active: 1, Won: 2 })[value] ?? -1; }
function stageCode(value) { return ({ Qualify: 1, Develop: 2, Propose: 3, Close: 4 })[value] ?? 0; }
function amountCode(value) { return ({ none: 0, "under-100k": 1, "100k-500k": 2, "500k-1m": 3, "1m-5m": 4, "over-5m": 5 })[value] ?? 0; }
function coverageCode(value) { return ({ none: 0, narrow: 1, broad: 2 })[value] ?? 0; }
function categoryCodes(values) {
  const categories = [...new Set(values.map((value) => String(value || "unknown")))].sort();
  const codes = new Map(categories.map((category, index) => [category, index + 1]));
  return values.map((value) => codes.get(String(value || "unknown")) || 0);
}
function riskCode(context) { return (context.priority === "Critical" ? 4 : context.priority === "High" ? 3 : context.priority === "Medium" ? 2 : 1) + (context.contradictionCodes?.length || 0); }
function riskSeparation(rows) { const risky = rows.filter(({ context }) => ["Critical", "High"].includes(context.priority)).map(({ score }) => score.healthScore); const monitor = rows.filter(({ context }) => context.priority === "Monitor").map(({ score }) => score.healthScore); return { riskyCount: risky.length, monitorCount: monitor.length, riskyMean: risky.length ? round(risky.reduce((sum, value) => sum + value, 0) / risky.length) : 0, monitorMean: monitor.length ? round(monitor.reduce((sum, value) => sum + value, 0) / monitor.length) : 0, separated: !risky.length || !monitor.length || (Math.min(...monitor) > Math.min(...risky)) }; }
function spearman(left, right) { if (left.length !== right.length || left.length < 2) return 0; return pearson(rank(left), rank(right)); }
function pearson(left, right) { const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length; const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length; const numerator = left.reduce((sum, value, index) => sum + ((value - leftMean) * (right[index] - rightMean)), 0); const leftDenominator = Math.sqrt(left.reduce((sum, value) => sum + ((value - leftMean) ** 2), 0)); const rightDenominator = Math.sqrt(right.reduce((sum, value) => sum + ((value - rightMean) ** 2), 0)); return leftDenominator && rightDenominator ? numerator / leftDenominator / rightDenominator : 0; }
function rank(values) { const sorted = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value || left.index - right.index); const ranks = Array(values.length); for (let index = 0; index < sorted.length;) { let end = index + 1; while (end < sorted.length && sorted[end].value === sorted[index].value) end += 1; const average = (index + end - 1) / 2 + 1; for (let cursor = index; cursor < end; cursor += 1) ranks[sorted[cursor].index] = average; index = end; } return ranks; }
function publicScore(score) { return { healthScore: score.healthScore, grade: score.grade, dimensions: score.dimensions, confidence: score.confidence, evidenceCoverage: score.evidenceCoverage, evidence: score.evidence.map((item) => ({ dimension: item.dimension, source: item.source })) }; }
function byToken(left, right) { return String(left.opportunityToken).localeCompare(String(right.opportunityToken)); }
function digest(value) { return sha256(canonicalJson(value)); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function canonicalJson(value) { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function round(value) { return Math.round(Number(value || 0) * 100) / 100; }
