import { emptyResult, evidenceFor, metadata } from "./actionUtils.mjs";

export function buildDataDoctor({ context } = {}) {
  const opportunities = context.safeOpportunityContext || [];
  const issues = opportunities.flatMap((item) => issueRules(item)).slice(0, 20);
  const severityWeight = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  issues.sort((a, b) => (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0));
  if (issues.length === 0) {
    return {
      ...metadata(),
      ...emptyResult("data-doctor", "当前筛选范围内未发现明显 CRM 数据质量问题。"),
      score: dataQualityScore(opportunities),
      distribution: [],
      repair_plan: "保持 CRM next step、预计下单日期、阶段和 forecast category 定期更新。",
    };
  }
  return {
    ...metadata(),
    type: "data-doctor",
    score: dataQualityScore(opportunities),
    distribution: issueDistribution(issues),
    issues,
    repair_plan: `优先修复 ${issues.slice(0, 5).map((item) => item.opportunity_token).join(", ")} 的阶段、预计下单日、forecast category 和物流字段。`,
  };
}

function dataQualityScore(items) {
  if (items.length === 0) return 100;
  const issueCount = items.reduce((sum, item) => sum + (Array.isArray(item.data_quality_flags) ? item.data_quality_flags.length : 0), 0);
  const structuralPenalty = items.filter((item) => !item.business_segment || !item.transport_mode || !item.trade_lane).length * 5;
  return Math.max(0, Math.min(100, 100 - issueCount * 4 - structuralPenalty));
}

function issueRules(item) {
  const issues = [];
  const overdue = String(item.expected_order_status || "").startsWith("overdue");
  if (overdue && item.stage !== "L5 Won") issues.push(issue(item, "Overdue Expected Close", "High", "预计下单日已过期但案件仍未关闭", "影响本月 forecast 准确性", "更新预计下单日或调整 forecast category"));
  if (item.stage === "L5 Won" && item.forecast_category !== "Commit") issues.push(issue(item, "Won Stage Inconsistency", "Medium", "L5/Won 与 forecast category 不一致", "影响 won pipeline 解释", "复核 close 状态和 forecast category"));
  if (item.forecast_category === "Commit" && ["High", "Critical"].includes(item.risk_level)) issues.push(issue(item, "Commit With High Risk", "High", "Commit 案件仍为高风险", "影响管理层 forecast 判断", "复核风险原因或调整 commit 判断"));
  if (["<5%", "5%-10%"].includes(item.margin_band) && (!item.risk_reason || item.risk_reason === "monitor")) issues.push(issue(item, "Low Margin Without Risk Reason", "Medium", "低毛利但缺少风险原因", "影响报价审批", "补充报价边界和风险说明"));
  for (const field of ["business_segment", "transport_mode", "trade_lane"]) {
    if (!item[field] || item[field] === "Unspecified") issues.push(issue(item, "Missing Logistics Field", "Medium", `${field} 缺失`, "影响物流维度分析", `补齐 ${field}`));
  }
  if (Array.isArray(item.data_quality_flags) && item.data_quality_flags.length > 0) {
    issues.push(issue(item, "CRM Data Quality Flag", "Medium", item.data_quality_flags.join(" / "), "影响 AI 建议可信度", "补齐 CRM 缺失字段并复核字段格式"));
  }
  if (["Strategic", "Key"].includes(item.customer_tier) && overdue) issues.push(issue(item, "Key Customer Stale Action", "High", "重点客户存在逾期机会", "影响重点客户关系管理", "安排 owner 更新下一步行动"));
  return issues;
}

function issue(item, type, severity, evidence, impact, fix) {
  return {
    issue_type: type,
    severity,
    opportunity_token: item.opportunity_token,
    customer_token: item.customer_token,
    owner: item.owner_token,
    evidence: [...evidenceFor(item), evidence],
    business_impact: impact,
    suggested_fix: fix,
    draft_crm_update: `${fix}。当前证据：${evidence}。`,
  };
}

function issueDistribution(issues) {
  return Object.entries(issues.reduce((map, item) => {
    map[item.issue_type] = (map[item.issue_type] || 0) + 1;
    return map;
  }, {})).map(([issue_type, count]) => ({ issue_type, count }));
}
