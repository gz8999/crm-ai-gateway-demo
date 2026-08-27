import { evidenceFor, findSafeOpportunity, metadata, topRiskOpportunities } from "./actionUtils.mjs";

export function buildRiskSummary({ context, opportunity_id } = {}) {
  const item = findSafeOpportunity(context, opportunity_id);
  if (!item) return { ...metadata(), type: "risk-summary", empty: true, message: "当前筛选范围内没有可生成风险摘要的案件。" };
  const portfolioRisks = topRiskOpportunities(context, 5);
  return {
    ...metadata(),
    type: "risk-summary",
    opportunity_token: item.opportunity_token,
    customer_token: item.customer_token,
    risk_level: item.risk_level,
    risk_summary: `${item.opportunity_token} 当前风险为 ${item.risk_level}，阶段为 ${item.stage}，预计下单状态为 ${item.expected_order_status}。`,
    key_drivers: [
      `Stage: ${item.stage}`,
      `Expected order status: ${item.expected_order_status}`,
      `Revenue band: ${item.revenue_band}`,
      `Margin band: ${item.margin_band}`,
      `Risk reason: ${item.risk_reason}`,
    ],
    management_attention: ["High", "Critical"].includes(item.risk_level) || String(item.expected_order_status || "").startsWith("overdue")
      ? "需要销售负责人和管理层确认客户决策时间、报价边界和下一步行动。"
      : "保持常规跟进，确保 CRM next step 和预计下单状态持续更新。",
    portfolio_reference: portfolioRisks.map((riskItem) => ({
      opportunity_token: riskItem.opportunity_token,
      customer_token: riskItem.customer_token,
      risk_level: riskItem.risk_level,
      expected_order_status: riskItem.expected_order_status,
    })),
    evidence: evidenceFor(item),
  };
}
