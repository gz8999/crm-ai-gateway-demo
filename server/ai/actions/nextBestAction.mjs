import { dueLabel, emptyResult, evidenceFor, metadata, topRiskOpportunities } from "./actionUtils.mjs";

export function buildNextBestActions({ context, filters = {} } = {}) {
  const candidates = topRiskOpportunities(context, 12)
    .filter((item) => !filters.owner || item.owner_token === filters.owner)
    .filter((item) => !filters.stage || item.stage === filters.stage)
    .filter((item) => !filters.risk_level || item.risk_level === filters.risk_level)
    .slice(0, 5);
  if (candidates.length === 0) return { ...metadata(), ...emptyResult("next-best-actions") };
  return {
    ...metadata(),
    type: "next-best-actions",
    items: candidates.map((item, index) => ({
      priority: `P${index + 1}`,
      action: actionFor(item),
      opportunity_token: item.opportunity_token,
      customer_token: item.customer_token,
      owner: item.owner_token,
      due: dueLabel(item),
      reason: reasonFor(item),
      evidence: evidenceFor(item),
      expected_impact: impactFor(item),
      draft_crm_update: `已安排${dueLabel(item)}前跟进 ${item.customer_token}，确认客户决策时间、报价反馈和下一步行动。`,
    })),
  };
}

function actionFor(item) {
  if (String(item.expected_order_status || "").startsWith("overdue")) return "确认客户决策时间";
  if (["<5%", "5%-10%"].includes(item.margin_band)) return "复核报价边界";
  if (item.risk_level === "Critical") return "升级管理层介入";
  return "确认下一步行动";
}

function reasonFor(item) {
  return `${item.stage}，${item.risk_level}，${item.expected_order_status}`;
}

function impactFor(item) {
  if (item.revenue_band === "5M+") return "避免高金额 pipeline 延迟或丢失。";
  if (["<5%", "5%-10%"].includes(item.margin_band)) return "降低低毛利报价风险。";
  return "提升 forecast 准确性和客户推进节奏。";
}
