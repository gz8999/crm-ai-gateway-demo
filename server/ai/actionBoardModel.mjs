import { buildOpportunityInsight } from "./insightRules.mjs";
import { buildRiskRadarModel } from "./riskRadarModel.mjs";

const actionTypeSubtitles = {
  "Prepare Cost Breakdown": "准备成本拆分",
  "Confirm Decision Maker": "确认决裁人",
  "Schedule Second Discussion": "安排二次沟通",
  "Follow Overdue Quote": "跟进逾期报价",
  "Review Low Win Probability": "复盘低受注概率案件",
  "Escalate to Management": "管理层介入",
  "Update CRM Progress Summary": "更新案件进展摘要",
};

const actionTypes = Object.keys(actionTypeSubtitles);

const priorityRanks = ["Must Win", "Rescue Needed", "Follow-up Now", "Monitor", "Low Priority"];

const actionWeights = {
  "Escalate to Management": 120,
  "Follow Overdue Quote": 110,
  "Prepare Cost Breakdown": 85,
  "Confirm Decision Maker": 75,
  "Schedule Second Discussion": 65,
  "Review Low Win Probability": 45,
  "Update CRM Progress Summary": 20,
};

export function buildActionBoardModel(safeOpportunities = []) {
  const source = Array.isArray(safeOpportunities) ? safeOpportunities : [];
  const riskRadar = buildRiskRadarModel(source);
  const actions = source.flatMap((safe) => buildActionsForOpportunity(safe));
  const sortedActions = actions.sort((a, b) => b.score - a.score || a.opportunityToken.localeCompare(b.opportunityToken) || a.actionType.localeCompare(b.actionType));

  return {
    summary: {
      totalActions: sortedActions.length,
      urgentThisWeek: sortedActions.filter((item) => item.urgency === "This week").length,
      executiveEscalations: sortedActions.filter((item) => item.actionType === "Escalate to Management").length,
      costBreakdownNeeded: sortedActions.filter((item) => item.actionType === "Prepare Cost Breakdown").length,
      decisionMakerConfirmationNeeded: sortedActions.filter((item) => item.actionType === "Confirm Decision Maker").length,
      overdueFollowUpNeeded: sortedActions.filter((item) => item.actionType === "Follow Overdue Quote").length,
    },
    ownerGroups: groupByOwner(sortedActions),
    actionTypeGroups: groupByActionType(sortedActions),
    priorityRanks: groupByPriorityRank(riskRadar.riskCases, sortedActions),
    actions: sortedActions,
  };
}

function buildActionsForOpportunity(safe) {
  const insight = buildOpportunityInsight(safe);
  const badges = insight.badges || [];
  const base = {
    opportunityToken: safe.opportunityToken || insight.opportunity_token || "OPP-UNKNOWN",
    customerToken: safe.customerToken || insight.customer_token || "CUST-UNKNOWN",
    ownerToken: safe.ownerToken || insight.owner_token || "OWNER-UNKNOWN",
    expectedOrderStatus: safe.expectedOrderStatus || "未填写",
    priority: safe.priority || "未填写",
    winProbability: safe.winProbability || "未填写",
    customerNeed: safe.customerNeed || "未填写",
    proposalContent: safe.proposalContent || "未填写",
    estimatedQuoteBand: safe.estimatedQuoteBand || safe.budgetAmountBand || "未填写",
    decisionMakerStatus: safe.decisionMakerStatus || "未填写",
    relatedBadges: badges,
    priorityRank: priorityRankFor(safe, badges),
    evidence: evidenceFor(safe, badges),
    safety: "Safety: raw CRM data not sent",
  };

  const actions = [];
  if (badges.includes("Cost Pressure")) actions.push(action(base, "Prepare Cost Breakdown", "准备成本拆分表", "补充成本拆分、替代方案和服务范围边界，回应客户价格压力。"));
  if (badges.includes("Decision Maker Unclear")) actions.push(action(base, "Confirm Decision Maker", "确认决裁人", "确认决裁人、审批路径和客户内部决策节奏。"));
  if (badges.includes("Needs Follow-up")) actions.push(action(base, "Schedule Second Discussion", "安排二次沟通", "安排二次沟通，关闭客户反馈和下一步行动。"));
  if (badges.includes("Overdue") || badges.includes("High Risk")) actions.push(action(base, "Follow Overdue Quote", "跟进逾期报价", "本周内复盘报价反馈、预计下单日和客户下一步。"));
  if (badges.includes("Low Win Probability")) actions.push(action(base, "Review Low Win Probability", "复盘低受注概率", "判断是否继续投入资源，必要时调整报价或退出策略。"));
  if (badges.includes("Executive Attention")) actions.push(action(base, "Escalate to Management", "升级管理层关注", "准备管理层简报，确认高金额案件推进策略。"));
  if (!actions.length) actions.push(action(base, "Update CRM Progress Summary", "更新 CRM 进展摘要", "补充最新客户反馈、下一步行动和预计更新时间。"));
  return actions;
}

function action(base, actionType, actionTitle, actionDetail) {
  const urgency = urgencyFor(actionType, base.relatedBadges);
  return {
    ...base,
    id: `${base.opportunityToken}:${actionType}`,
    actionType,
    actionSubtitle: actionTypeSubtitles[actionType] || "行动建议",
    actionTitle,
    actionDetail,
    actionReason: actionDetail,
    urgency,
    dueWindow: dueWindowFor(urgency, actionType),
    suggestedCrmUpdateDraft: draftFor(base, actionType),
    score: (actionWeights[actionType] || 10) + rankBoost(base.priorityRank),
  };
}

function groupByOwner(actions) {
  return Object.values(actions.reduce((acc, item) => {
    const key = item.ownerToken || "OWNER-UNKNOWN";
    acc[key] = acc[key] || { ownerToken: key, actionCount: 0, urgentCount: 0, executiveEscalationCount: 0, actions: [] };
    acc[key].actionCount += 1;
    if (item.urgency === "This week") acc[key].urgentCount += 1;
    if (item.actionType === "Escalate to Management") acc[key].executiveEscalationCount += 1;
    acc[key].actions.push(item);
    return acc;
  }, {})).sort((a, b) => b.urgentCount - a.urgentCount || b.actionCount - a.actionCount || a.ownerToken.localeCompare(b.ownerToken));
}

function groupByActionType(actions) {
  return actionTypes.map((actionType) => {
    const items = actions.filter((item) => item.actionType === actionType);
    return {
      actionType,
      actionSubtitle: actionTypeSubtitles[actionType] || "行动建议",
      count: items.length,
      topOpportunities: items.slice(0, 5).map((item) => item.opportunityToken),
      suggestedOwnerTokens: [...new Set(items.slice(0, 5).map((item) => item.ownerToken))],
    };
  });
}

function groupByPriorityRank(riskCases, actions) {
  return priorityRanks.map((rank) => {
    const cases = riskCases.filter((item) => priorityRankFor(item, item.badges || []) === rank);
    const rankActions = actions.filter((item) => item.priorityRank === rank);
    return {
      rank,
      count: cases.length,
      actionCount: rankActions.length,
      topOpportunities: cases.slice(0, 5).map((item) => item.opportunityToken),
    };
  });
}

function priorityRankFor(safe, badges = []) {
  const textPriority = String(safe.priority || "").toLowerCase();
  const lowPriority = textPriority.includes("low") || textPriority.includes("04");
  if (badges.includes("Executive Attention") && isHighAmount(safe.estimatedQuoteBand || safe.budgetAmountBand)) return "Must Win";
  if (badges.includes("High Risk") && badges.includes("Overdue")) return "Rescue Needed";
  if (badges.includes("Needs Follow-up") || badges.includes("Cost Pressure")) return "Follow-up Now";
  if (badges.includes("Low Win Probability") && lowPriority) return "Low Priority";
  return "Monitor";
}

function urgencyFor(actionType, badges = []) {
  if (["Follow Overdue Quote", "Escalate to Management"].includes(actionType) || badges.includes("High Risk")) return "This week";
  if (["Prepare Cost Breakdown", "Confirm Decision Maker", "Schedule Second Discussion"].includes(actionType)) return "Next 7 days";
  return "Before next pipeline review";
}

function dueWindowFor(urgency, actionType) {
  if (urgency === "This week") return "本周内";
  if (urgency === "Next 7 days") return "7天内";
  if (actionType === "Update CRM Progress Summary") return "下次 pipeline review 前";
  return "下次管理会议前";
}

function evidenceFor(safe, badges) {
  return [
    `Expected order: ${safe.expectedOrderStatus || "未填写"}`,
    `Priority: ${safe.priority || "未填写"}`,
    `Win probability: ${safe.winProbability || "未填写"}`,
    `Customer need: ${safe.customerNeed || "未填写"}`,
    `Proposal: ${safe.proposalContent || "未填写"}`,
    `Amount band: ${safe.estimatedQuoteBand || safe.budgetAmountBand || "未填写"}`,
    `Decision maker: ${safe.decisionMakerStatus || "未填写"}`,
    badges.length ? `Badges: ${badges.join(", ")}` : "Badges: Normal",
    safe.sanitizedProgressSummary ? `Progress summary: ${safe.sanitizedProgressSummary}` : "",
  ].filter(Boolean).join(" · ");
}

function draftFor(base, actionType) {
  const actionPhrase = {
    "Prepare Cost Breakdown": "本周补充成本拆分表和替代方案",
    "Confirm Decision Maker": "确认客户决裁人和决策流程",
    "Schedule Second Discussion": "安排二次沟通并关闭客户反馈",
    "Follow Overdue Quote": "复盘逾期报价反馈并确认预计下单节奏",
    "Review Low Win Probability": "复盘低受注概率并判断是否继续投入资源",
    "Escalate to Management": "准备管理层简报并确认推进策略",
    "Update CRM Progress Summary": "更新客户反馈和下一步行动",
  }[actionType] || "更新下一步行动";
  return `建议更新进展摘要：当前案件 ${base.opportunityToken} 的安全上下文显示 ${base.evidence}。建议${actionPhrase}，负责人 ${base.ownerToken}，处理窗口 ${dueWindowFor(urgencyFor(actionType, base.relatedBadges), actionType)}。`;
}

function isHighAmount(value = "") {
  const text = String(value);
  return text.includes("5M+") || text.includes("5M-10M") || text.includes("10M") || text.includes("25M") || text.includes("50M");
}

function rankBoost(rank) {
  return {
    "Must Win": 40,
    "Rescue Needed": 35,
    "Follow-up Now": 20,
    Monitor: 5,
    "Low Priority": 0,
  }[rank] || 0;
}

export { actionTypes, actionTypeSubtitles, priorityRanks };
