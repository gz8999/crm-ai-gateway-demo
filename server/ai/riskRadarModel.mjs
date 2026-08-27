import { buildOpportunityInsight, insightBadgeLabels } from "./insightRules.mjs";

const driverOrder = [
  "Overdue",
  "Low Win Probability",
  "Cost Pressure",
  "Decision Maker Unclear",
  "Needs Follow-up",
  "Executive Attention",
];

const riskWeights = {
  "High Risk": 120,
  Overdue: 95,
  "Executive Attention": 80,
  "Needs Follow-up": 60,
  "Cost Pressure": 50,
  "Decision Maker Unclear": 45,
  "Low Win Probability": 35,
};

export function buildRiskRadarModel(safeOpportunities = []) {
  const source = Array.isArray(safeOpportunities) ? safeOpportunities : [];
  const cases = source.map((safe) => buildRiskCase(safe));
  const sortedCases = [...cases].sort((a, b) => b.score - a.score || a.opportunityToken.localeCompare(b.opportunityToken));

  return {
    totalCount: source.length,
    driverSummary: driverOrder.map((driver) => ({
      driver,
      count: cases.filter((item) => item.badges.includes(driver)).length,
      mitigation: mitigationFor([driver])[0],
    })),
    matrix: buildRiskMatrix(cases),
    riskCases: sortedCases,
    topRiskCases: sortedCases.slice(0, 20),
  };
}

function buildRiskCase(safe) {
  const insight = buildOpportunityInsight(safe);
  const badges = insight.badges || [];
  const riskLevel = riskLevelFor(badges);
  const riskReason = insight.main_risks?.[0] || "当前未发现需要立即升级处理的明显风险。";
  return {
    opportunityToken: safe.opportunityToken || insight.opportunity_token || "OPP-UNKNOWN",
    customerToken: safe.customerToken || insight.customer_token || "CUST-UNKNOWN",
    ownerToken: safe.ownerToken || insight.owner_token || "OWNER-UNKNOWN",
    opportunityStage: safe.opportunityStage || safe.stage || parseStage(insight.current_status),
    winProbability: safe.winProbability || "未填写",
    priority: safe.priority || "未填写",
    estimatedQuoteBand: safe.estimatedQuoteBand || safe.budgetAmountBand || "未填写",
    budgetAmountBand: safe.budgetAmountBand || "未填写",
    riskLevel,
    badges,
    riskReason,
    finding: findingFor(badges),
    reason: riskReason,
    evidence: evidenceFor(safe, insight),
    recommendedMitigation: mitigationFor(badges),
    safety: "Safety: raw CRM data not sent",
    score: badges.reduce((sum, badge) => sum + (riskWeights[badge] || 10), 0),
  };
}

function buildRiskMatrix(cases) {
  const stages = [...new Set(cases.map((item) => item.opportunityStage || "Unknown"))].sort();
  return stages.flatMap((stage) => ["high", "medium", "low"].map((riskLevel) => ({
    stage,
    riskLevel,
    count: cases.filter((item) => item.opportunityStage === stage && item.riskLevel === riskLevel).length,
  })));
}

function riskLevelFor(badges) {
  if (badges.some((badge) => ["High Risk", "Overdue", "Executive Attention"].includes(badge))) return "high";
  if (badges.some((badge) => ["Cost Pressure", "Decision Maker Unclear", "Needs Follow-up", "Low Win Probability"].includes(badge))) return "medium";
  return "low";
}

function findingFor(badges) {
  if (badges.includes("High Risk")) return "高优先级案件正在变危险，需要管理层优先关注。";
  if (badges.includes("Overdue")) return "预计下单状态已逾期，需要尽快复盘客户反馈。";
  if (badges.includes("Executive Attention")) return "金额区间较高，建议纳入管理层风险雷达。";
  if (badges.includes("Cost Pressure")) return "客户需求或提案内容显示成本压力。";
  if (badges.includes("Decision Maker Unclear")) return "决裁者或决策流程不清，推进路径存在不确定性。";
  if (badges.includes("Low Win Probability")) return "受注确度偏低，需要判断是否继续投入资源。";
  if (badges.includes("Needs Follow-up")) return "进展摘要显示仍需本周跟进闭环。";
  return "当前风险较低，保持常规跟进。";
}

function mitigationFor(badges = []) {
  const actions = [];
  if (badges.includes("Cost Pressure")) actions.push("准备成本拆分表和替代方案。");
  if (badges.includes("Decision Maker Unclear")) actions.push("确认决裁人和决策流程。");
  if (badges.includes("Overdue") || badges.includes("High Risk")) actions.push("本周内安排复盘或客户反馈确认。");
  if (badges.includes("Low Win Probability")) actions.push("判断是否继续投入资源，必要时调整报价策略。");
  if (badges.includes("Executive Attention")) actions.push("建议管理层介入并确认推进策略。");
  if (badges.includes("Needs Follow-up")) actions.push("安排二次沟通，关闭客户反馈和下一步行动。");
  return actions.length ? [...new Set(actions)] : ["保持例行跟进，更新 CRM 下一步行动。"];
}

function evidenceFor(safe, insight) {
  return [
    `Stage: ${safe.opportunityStage || safe.stage || "Unknown"}`,
    `Win probability: ${safe.winProbability || "未填写"}`,
    `Amount band: ${safe.estimatedQuoteBand || safe.budgetAmountBand || "未填写"}`,
    insight.badges?.length ? `Badges: ${insight.badges.join(", ")}` : "Badges: Normal",
    safe.sanitizedProgressSummary ? `Progress summary: ${safe.sanitizedProgressSummary}` : "",
  ].filter(Boolean).join(" · ");
}

function parseStage(status = "") {
  const text = String(status);
  const match = text.match(/阶段\s*([^·]+)/);
  return match?.[1]?.trim() || "Unknown";
}

export { driverOrder, insightBadgeLabels };
