const DIMENSIONS = Object.freeze(["pipeline", "completeness", "profitability", "engagement", "risk", "confidence"]);
const WEIGHTS = Object.freeze({ pipeline: 0.25, completeness: 0.2, profitability: 0.2, engagement: 0.15, risk: 0.15, confidence: 0.05 });
export const HEALTH_SCORE_VERSION = "2.0";
export const HEALTH_SCORE_THRESHOLDS = Object.freeze({ S: 90, A: 80, B: 70, C: 60, D: 50, Z: 0 });
export const HEALTH_SCORE_GRADES = Object.freeze(["S", "A", "B", "C", "D", "Z"]);
const FORBIDDEN_INPUT_KEYS = new Set([
  "estimatedValue", "actualValue", "annualBudgetRevenue", "annualActualRevenue", "monthly",
  "timelineText", "description", "customerName", "contactName", "email", "phone", "guid",
]);

export function scoreOpportunityHealth(safeContext) {
  assertSafeInput(safeContext);
  const dimensions = {
    pipeline: pipelineScore(safeContext),
    completeness: completenessScore(safeContext),
    profitability: profitabilityScore(safeContext),
    engagement: engagementScore(safeContext),
    risk: riskHealthScore(safeContext),
    confidence: confidenceScore(safeContext),
  };
  const healthScore = round(DIMENSIONS.reduce((total, dimension) => total + dimensions[dimension] * WEIGHTS[dimension], 0));
  const confidence = confidenceAssessment(safeContext);
  return {
    version: HEALTH_SCORE_VERSION,
    healthScore,
    grade: gradeForHealthScore(healthScore),
    dimensions,
    keyStrengths: strengths(safeContext, dimensions),
    keyRisks: risks(safeContext, dimensions),
    recommendedActions: actions(safeContext, dimensions),
    evidence: dimensionEvidence(safeContext, dimensions),
    confidence: confidence.level,
    confidenceReason: confidence.reason,
    evidenceCoverage: confidence.evidenceCoverage,
    dataQualityStatus: confidence.dataQualityStatus,
    deterministic: true,
    safeContextUsed: true,
    externalModelCalled: false,
    rawDataSent: false,
  };
}

export function rankHealthScores(safeContexts) {
  return [...safeContexts]
    .map((safeContext) => {
      const score = scoreOpportunityHealth(safeContext);
      return {
        opportunityToken: safeContext.opportunityToken,
        opportunityState: safeContext.opportunityState || "Active",
        priority: safeContext.priority || "Monitor",
        healthScore: score.healthScore,
        grade: score.grade,
      };
    })
    .sort((left, right) => left.healthScore - right.healthScore || left.opportunityToken.localeCompare(right.opportunityToken))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export function healthGradeLabel(grade) {
  return ({ S: "卓越", A: "健康", B: "稳定", C: "需关注", D: "高风险", Z: "严重风险" })[grade] || "未评估";
}

export function gradeForHealthScore(score) {
  if (score >= HEALTH_SCORE_THRESHOLDS.S) return "S";
  if (score >= HEALTH_SCORE_THRESHOLDS.A) return "A";
  if (score >= HEALTH_SCORE_THRESHOLDS.B) return "B";
  if (score >= HEALTH_SCORE_THRESHOLDS.C) return "C";
  if (score >= HEALTH_SCORE_THRESHOLDS.D) return "D";
  return "Z";
}

export function summarizeHealthScores(scores) {
  const values = scores.filter(Boolean);
  const distribution = Object.fromEntries(HEALTH_SCORE_GRADES.map((grade) => [grade, values.filter((item) => item.grade === grade).length]));
  return {
    count: values.length,
    averageScore: round(values.length ? values.reduce((sum, item) => sum + item.healthScore, 0) / values.length : 0),
    minimumScore: values.length ? Math.min(...values.map((item) => item.healthScore)) : 0,
    maximumScore: values.length ? Math.max(...values.map((item) => item.healthScore)) : 0,
    distribution,
    deterministic: values.every((item) => item.deterministic === true),
    safety: {
      rawDataSent: values.some((item) => item.rawDataSent !== false),
      externalModelCalled: values.some((item) => item.externalModelCalled !== false),
    },
  };
}

function pipelineScore(context) {
  if (context.opportunityState === "Won") return 95;
  if (context.opportunityState === "Lost") return 35;
  let score = 85;
  score += ({ Close: 8, Propose: 5, Develop: 2, Qualify: 0 }[context.stage] || 0);
  score -= ({ overdue: 28, "near-term": 10, "not-recorded": 12, future: 0 }[context.relativeDateStatus] || 0);
  score -= ({ severe: 28, watch: 12, active: 0 }[context.stagnationBand] || 0);
  if ((context.missingCodes || []).includes("missing-next-action")) score -= 15;
  if (Number(context.timelineSignalCount || 0) === 0) score -= 12;
  return clamp(score);
}

function completenessScore(context) {
  let score = 100;
  score -= (context.missingCodes || []).length * 18;
  score -= (context.contradictionCodes || []).length * 16;
  score -= ({ complete: 0, partial: 10, limited: 22 }[context.stakeholderCoverage] || 10);
  score -= ({ high: 0, medium: 8, low: 18 }[context.decisionReadiness] || 10);
  return clamp(score);
}

function profitabilityScore(context) {
  const margin = ({ "12-15-percent": 95, "8-12-percent": 85, "5-8-percent": 68, "not-recorded": 50 }[context.marginBand] || 70);
  const variance = ({ positive: 98, "on-plan": 92, negative: 68, "material-negative": 38, "not-applicable": 78 }[context.varianceCategory] || 65);
  const actualAvailability = context.actualBand === "none" && context.opportunityState === "Active" ? 72 : 90;
  return round((margin + variance + actualAvailability) / 3);
}

function engagementScore(context) {
  let score = 50;
  const signalCount = Number(context.timelineSignalCount || 0);
  if (signalCount >= 4) score += 22;
  else if (signalCount >= 1) score += 12;
  if (context.stakeholderCoverage === "complete") score += 18;
  else if (context.stakeholderCoverage === "partial") score += 9;
  if (context.decisionReadiness === "high") score += 16;
  else if (context.decisionReadiness === "medium") score += 8;
  if (Number(context.openQuestionCount || 0) === 0) score += 10;
  else if (Number(context.openQuestionCount || 0) >= 3) score -= 20;
  else score -= 8;
  if (context.meetingWindow === "within-7-days") score += 4;
  if (context.meetingWindow === "no-meeting") score -= 5;
  return clamp(score);
}

function riskHealthScore(context) {
  let score = 100;
  if (context.opportunityState === "Lost") score -= 42;
  if (context.priority === "Critical") score -= 28;
  else if (context.priority === "High") score -= 18;
  else if (context.priority === "Medium") score -= 8;
  if (context.stagnationBand === "severe") score -= 20;
  else if (context.stagnationBand === "watch") score -= 8;
  if (context.relativeDateStatus === "overdue") score -= 15;
  if (context.varianceCategory === "material-negative") score -= 20;
  else if (context.varianceCategory === "negative") score -= 8;
  score -= (context.contradictionCodes || []).length * 12;
  score -= (context.missingCodes || []).length * 8;
  if (context.routeConsistency === "review-required") score -= 8;
  return clamp(score);
}

function confidenceScore(context) {
  let score = 100;
  score -= (context.dataQualityCodes || []).length * 12;
  score -= (context.contradictionCodes || []).length * 16;
  if ((context.missingCodes || []).length) score -= (context.missingCodes || []).length * 8;
  if (Number(context.timelineSignalCount || 0) === 0) score -= 15;
  if (context.coverageCategory === "narrow") score -= 8;
  return clamp(score);
}

function confidenceAssessment(context) {
  const missingCount = (context.missingCodes || []).length;
  const contradictionCount = (context.contradictionCodes || []).length;
  const qualityCount = (context.dataQualityCodes || []).length;
  let evidenceCoverage = 100;
  evidenceCoverage -= missingCount * 15;
  evidenceCoverage -= contradictionCount * 20;
  evidenceCoverage -= qualityCount * 5;
  if (Number(context.timelineSignalCount || 0) === 0) evidenceCoverage -= 15;
  if (context.coverageCategory === "narrow") evidenceCoverage -= 10;
  evidenceCoverage = clamp(evidenceCoverage);
  const dataQualityStatus = contradictionCount ? "contradiction" : qualityCount || missingCount ? "review-required" : "clear";
  const level = evidenceCoverage >= 85 ? "High" : evidenceCoverage >= 65 ? "Medium" : "Low";
  const reason = dataQualityStatus === "clear"
    ? "安全字段覆盖充分，未发现缺失或矛盾信号。"
    : dataQualityStatus === "contradiction"
      ? "存在矛盾信号，健康度与判断置信度需分开解读。"
      : "存在缺失或覆盖不足信号，不能把健康度当作高置信结论。";
  return { level, reason, evidenceCoverage, dataQualityStatus };
}

function strengths(context, dimensions) {
  const result = [];
  if (dimensions.pipeline >= 85) result.push(insight("推进节奏稳定", "当前阶段和相对日期未形成明显停滞信号。", "safeContext.stagnationBand"));
  if (dimensions.profitability >= 85) result.push(insight("盈利区间健康", "毛利区间与预算实绩偏差未形成明显负向信号。", "safeContext.marginBand"));
  if (dimensions.engagement >= 85) result.push(insight("互动覆盖充分", "互动数量、关键人覆盖和决策准备度形成正向组合。", "safeContext.decisionReadiness"));
  if (dimensions.confidence >= 90) result.push(insight("数据证据充分", "当前安全质量信号未显示明显缺失或矛盾。", "safeContext.dataQualityCodes"));
  return result.slice(0, 3);
}

function risks(context, dimensions) {
  const result = [];
  if (dimensions.pipeline < 70) result.push(insight("推进风险", "停滞、逾期或缺少下一步信号降低了推进健康度。", "safeContext.relativeDateStatus"));
  if (dimensions.completeness < 70) result.push(insight("事实完整度不足", "缺失或矛盾的业务事实需要在依赖预测前补核。", "safeContext.dataQualityCodes"));
  if (dimensions.profitability < 70) result.push(insight("盈利风险", "预算与实绩区间或毛利区间存在负向信号。", "safeContext.varianceCategory"));
  if (dimensions.engagement < 70) result.push(insight("客户互动风险", "关键人、互动或待确认问题信号不足。", "safeContext.decisionReadiness"));
  if (dimensions.risk < 70) result.push(insight("综合风险暴露", "多个安全风险信号叠加，需要按证据优先复核。", "safeContext.priority"));
  if (dimensions.confidence < 70) result.push(insight("数据置信度不足", "证据覆盖或安全数据质量信号不足。", "safeContext.dataQualityCodes"));
  return result.slice(0, 4);
}

function actions(context, dimensions) {
  const result = [];
  if (dimensions.pipeline < 70) result.push(action("确认下一推进节点", "核实下一步和逾期状态，避免在未确认条件下继续推进。", "safeContext.relativeDateStatus"));
  if (dimensions.completeness < 80) result.push(action("补齐关键业务事实", "先处理缺失或矛盾信号，再使用预测结论。", "safeContext.dataQualityCodes"));
  if (dimensions.profitability < 75) result.push(action("复核预算与实绩区间", "围绕区间偏差核对恢复假设，不使用精确金额。", "safeContext.varianceCategory"));
  if (dimensions.engagement < 75) result.push(action("确认关键人和下一步", "根据安全准备度信号补充人工确认。", "safeContext.decisionReadiness"));
  if (dimensions.risk < 75) result.push(action("开展风险证据复核", "按主要风险信号排序，保留人工判断和只读边界。", "safeContext.priority"));
  if (!result.length) result.push(action("保持当前推进节奏", "安全证据支持常规监测，不制造额外行动期限。", "safeContext.decisionReadiness"));
  return result.slice(0, 3);
}

function dimensionEvidence(context, dimensions) {
  return [
    evidence("pipeline", "推进信号", `${context.stage || "未记录"} · ${context.stagnationBand || "未记录"} · ${context.relativeDateStatus || "未记录"}`, "safeContext.stagnationBand", dimensions.pipeline),
    evidence("completeness", "事实完整度", `${(context.missingCodes || []).length} 项缺失 · ${(context.contradictionCodes || []).length} 项矛盾`, "safeContext.dataQualityCodes", dimensions.completeness),
    evidence("profitability", "盈利信号", `${context.marginBand || "未记录"} · ${context.varianceCategory || "未记录"}`, "safeContext.varianceCategory", dimensions.profitability),
    evidence("engagement", "互动信号", `${context.stakeholderCoverage || "未记录"} · ${context.decisionReadiness || "未记录"} · ${Number(context.openQuestionCount || 0)} 项待确认`, "safeContext.decisionReadiness", dimensions.engagement),
    evidence("risk", "风险暴露", `${context.priority || "未记录"} · ${context.routeConsistency || "未记录"}`, "safeContext.priority", dimensions.risk),
    evidence("confidence", "数据置信度", `${(context.dataQualityCodes || []).length} 项质量信号 · ${Number(context.timelineSignalCount || 0)} 条互动信号`, "safeContext.dataQualityCodes", dimensions.confidence),
  ];
}

function insight(label, detail, source) { return { label, detail, source }; }
function action(title, reason, source) { return { title, reason, source, status: "Draft only" }; }
function evidence(dimension, label, value, source, score) { return { dimension, label, value, source, score }; }

function assertSafeInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Health Score requires a Safe Context object.");
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_INPUT_KEYS.has(key)) throw new TypeError(`Health Score received forbidden raw field: ${key}.`);
  }
  if (JSON.stringify(value).match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i)) throw new TypeError("Health Score received a Dataverse identifier.");
}

function clamp(value) { return Math.max(0, Math.min(100, round(value))); }
function round(value) { return Math.round(Number(value || 0) * 100) / 100; }
