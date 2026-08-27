export const insightBadgeLabels = [
  "High Risk",
  "Overdue",
  "Executive Attention",
  "Needs Follow-up",
  "Cost Pressure",
  "Decision Maker Unclear",
  "Low Win Probability",
];

export function buildOpportunityInsight(safe = {}) {
  const badges = buildInsightBadges(safe);
  const isHighRisk = badges.includes("High Risk");
  const needsExecutive = badges.includes("Executive Attention");
  const costPressure = badges.includes("Cost Pressure");
  const decisionUnclear = badges.includes("Decision Maker Unclear");
  const lowProbability = badges.includes("Low Win Probability");
  const followUpNeeded = badges.includes("Needs Follow-up");

  const risks = [
    isHighRisk ? "预计下单状态已逾期且案件优先级较高，需要优先处理。" : "",
    lowProbability ? "受注确度偏低，需要重新确认客户决策条件。" : "",
    costPressure ? "客户需求与提案内容显示竞争性报价或降本压力，需要准备成本拆分和替代方案。" : "",
    decisionUnclear ? "决裁者信息不明确，需要确认决策人和审批路径。" : "",
    followUpNeeded ? "进展摘要显示客户反馈或二次沟通未闭环，需要本周明确跟进动作。" : "",
    needsExecutive ? "金额区间较高，建议纳入管理层关注清单。" : "",
  ].filter(Boolean);

  const nextActions = [
    costPressure ? "准备成本拆分表、降本说明、替代方案和服务范围边界。" : "",
    decisionUnclear ? "补充决裁者和决策流程信息。" : "",
    isHighRisk ? "本周内确认客户反馈、预计下单日和下一步行动。" : "",
    followUpNeeded ? "安排二次沟通，确认客户对价格、方案和决策流程的最新反馈。" : "",
    lowProbability ? "复盘输赢要素，确认是否需要调整报价策略。" : "",
  ].filter(Boolean);

  return {
    opportunity_token: safe.opportunityToken || safe.opportunity_token || "OPP-UNKNOWN",
    customer_token: safe.customerToken || safe.customer_token || "CUST-UNKNOWN",
    owner_token: safe.ownerToken || safe.owner_token || "OWNER-UNKNOWN",
    badges,
    case_summary: summaryFor(safe),
    current_status: `阶段 ${safe.opportunityStage || safe.stage || "Unknown"} · 受注确度 ${safe.winProbability || "未填写"} · 预计下单 ${safe.expectedOrderStatus || safe.expected_order_status || "未填写"}`,
    main_risks: risks.length ? risks : ["当前未发现需要立即升级处理的明显风险。"],
    next_best_actions: nextActions.length ? nextActions : ["保持例行跟进，更新下一步行动和客户反馈。"],
    materials_to_prepare: materialsFor({ costPressure, decisionUnclear, followUpNeeded, needsExecutive, lowProbability }),
    executive_intervention: needsExecutive || isHighRisk,
    executive_intervention_reason: needsExecutive || isHighRisk
      ? "建议管理层关注金额、逾期、优先级或关键决策不确定性。"
      : "暂不需要管理层介入，销售负责人可继续推进。",
  };
}

export function buildInsightBadges(safe = {}) {
  const badges = [];
  if (isOverdue(safe.expectedOrderStatus || safe.expected_order_status)) badges.push("Overdue");
  if (isOverdue(safe.expectedOrderStatus || safe.expected_order_status) && isHighPriority(safe.priority)) badges.push("High Risk");
  if (isHighAmount(safe.estimatedQuoteBand || safe.budgetAmountBand || safe.revenue_band)) badges.push("Executive Attention");
  if (needsFollowUp(safe)) badges.push("Needs Follow-up");
  if (hasCostPressure(safe)) badges.push("Cost Pressure");
  if (isDecisionMakerUnclear(safe.decisionMakerStatus)) badges.push("Decision Maker Unclear");
  if (isLowProbability(safe.winProbability)) badges.push("Low Win Probability");
  return [...new Set(badges)];
}

export function buildInsightAggregate(safeOpportunities = []) {
  const insights = safeOpportunities.map(buildOpportunityInsight);
  return {
    demo_opportunity_count: safeOpportunities.length,
    high_risk_count: insights.filter((item) => item.badges.includes("High Risk")).length,
    overdue_count: insights.filter((item) => item.badges.includes("Overdue")).length,
    high_amount_count: insights.filter((item) => item.badges.includes("Executive Attention")).length,
    executive_attention_count: insights.filter((item) => item.executive_intervention).length,
    follow_up_this_week_count: insights.filter((item) => item.badges.includes("Needs Follow-up")).length,
    sales_department_distribution: topCounts(safeOpportunities, (item) => item.salesDepartment),
    stage_distribution: topCounts(safeOpportunities, (item) => item.opportunityStage || item.stage),
    customer_need_distribution: topCounts(safeOpportunities, (item) => item.customerNeed),
    proposal_content_distribution: topCounts(safeOpportunities, (item) => item.proposalContent),
    badge_distribution: insightBadgeLabels.map((badge) => ({
      value: badge,
      count: insights.filter((item) => item.badges.includes(badge)).length,
    })),
  };
}

function summaryFor(safe) {
  const need = safe.customerNeed ? `客户需求为 ${safe.customerNeed}` : "客户需求未完整填写";
  const proposal = safe.proposalContent ? `提案方向为 ${safe.proposalContent}` : "提案内容未完整填写";
  const amount = safe.estimatedQuoteBand || safe.budgetAmountBand || "金额区间未填写";
  const progress = safe.sanitizedProgressSummary || safe.sanitizedDescription || "暂无进展摘要";
  return `${need}，${proposal}，金额区间 ${amount}。当前进展：${progress}`;
}

function materialsFor({ costPressure, decisionUnclear, followUpNeeded, needsExecutive, lowProbability }) {
  const materials = ["最新客户反馈", "下一步行动计划"];
  if (costPressure) materials.push("成本拆分表", "替代方案和服务范围说明");
  if (decisionUnclear) materials.push("决策链路和决裁者确认清单");
  if (followUpNeeded) materials.push("客户反馈复盘记录", "二次沟通议程");
  if (needsExecutive) materials.push("管理层汇报摘要", "风险升级说明");
  if (lowProbability) materials.push("报价策略复盘材料");
  return [...new Set(materials)];
}

function isHighPriority(value = "") {
  const text = String(value).toLowerCase();
  return text.includes("high") || text.includes("important") || text.includes("高") || text.includes("重要");
}

function isLowProbability(value = "") {
  const text = String(value).toUpperCase();
  return ["C", "D", "Y"].some((item) => text === item || text.includes(` ${item}`) || text.endsWith(item));
}

function isOverdue(value = "") {
  return String(value).toLowerCase().includes("overdue");
}

function isHighAmount(value = "") {
  const text = String(value);
  return text.includes("5M+") || text.includes("5M-10M") || text.includes("10M") || text.includes("25M") || text.includes("50M");
}

function hasCostPressure(safe = {}) {
  const text = `${safe.customerNeed || ""} ${safe.proposalContent || ""} ${safe.sanitizedProgressSummary || ""}`.toLowerCase();
  return ["竞争性报价", "降低成本", "价格偏高", "cost", "price", "报价"].some((hint) => text.includes(hint.toLowerCase()));
}

function isDecisionMakerUnclear(value = "") {
  const text = String(value).toLowerCase();
  return !text || text.includes("其他") || text.includes("other") || text.includes("unclear") || text.includes("not provided");
}

function needsFollowUp(safe = {}) {
  const status = safe.expectedOrderStatus || safe.expected_order_status || "";
  const progress = `${safe.sanitizedProgressSummary || ""} ${safe.ai_suggested_action || ""}`.toLowerCase();
  const followUpHints = ["follow", "反馈", "确认", "价格偏高", "二次沟通", "决裁人未明确", "等待客户反馈"];
  return isOverdue(status) || followUpHints.some((hint) => progress.includes(hint.toLowerCase()));
}

function topCounts(items, getKey) {
  return Object.entries(items.reduce((acc, item) => {
    const key = getKey(item) || "Unspecified";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {}))
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 8);
}
