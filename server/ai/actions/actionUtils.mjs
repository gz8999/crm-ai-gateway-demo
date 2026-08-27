export function findSafeOpportunity(context, opportunityId) {
  const opportunities = context.safeOpportunityContext || [];
  return opportunities.find((item) => item.opportunity_token === opportunityId) || opportunities[0] || null;
}

export function topRiskOpportunities(context, limit = 5) {
  return [...(context.safeOpportunityContext || [])]
    .filter((item) => ["High", "Critical"].includes(item.risk_level) || String(item.expected_order_status || "").startsWith("overdue"))
    .sort((a, b) => riskScore(b) - riskScore(a))
    .slice(0, limit);
}

export function riskScore(item) {
  const riskWeight = { Low: 1, Medium: 2, High: 4, Critical: 5 }[item.risk_level] || 1;
  const overdueWeight = String(item.expected_order_status || "").startsWith("overdue") ? 3 : 0;
  const marginWeight = ["<5%", "5%-10%"].includes(item.margin_band) ? 2 : 0;
  const valueWeight = item.revenue_band === "5M+" ? 2 : 0;
  return riskWeight + overdueWeight + marginWeight + valueWeight;
}

export function dueLabel(item) {
  if (String(item.expected_order_status || "").startsWith("overdue")) return "本周五";
  if (item.risk_level === "Critical" || item.risk_level === "High") return "48小时内";
  return "下次客户会议前";
}

export function evidenceFor(item) {
  return [
    `stage = ${item.stage}`,
    `risk_level = ${item.risk_level}`,
    `expected_order_status = ${item.expected_order_status}`,
    `revenue_band = ${item.revenue_band}`,
    `margin_band = ${item.margin_band}`,
  ];
}

export function emptyResult(type, message = "当前筛选范围内没有发现相关案件。") {
  return { type, items: [], message };
}

export function metadata() {
  return {
    based_on: "Safe CRM Context",
    provider: "demo",
    external_model_called: false,
  };
}

export function lineList(values) {
  return values.filter(Boolean).join("\n");
}
