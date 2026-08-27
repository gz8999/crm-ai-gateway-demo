import { dueLabel, evidenceFor, findSafeOpportunity, metadata } from "./actionUtils.mjs";

export function buildOpportunityBrief({ context, opportunity_id } = {}) {
  const item = findSafeOpportunity(context, opportunity_id);
  if (!item) return { ...metadata(), type: "opportunity-brief", empty: true, message: "当前筛选范围内没有可生成 360 Brief 的案件。" };
  const missing = missingInfo(item);
  const needsEscalation = ["High", "Critical"].includes(item.risk_level) || String(item.expected_order_status).startsWith("overdue");
  return {
    ...metadata(),
    type: "opportunity-brief",
    opportunity_token: item.opportunity_token,
    customer_token: item.customer_token,
    one_line_summary: `该案件为 ${item.customer_token} 的 ${item.business_segment} / ${item.transport_mode} 机会，当前处于 ${item.stage}，收入区间为 ${item.revenue_band}。`,
    stage_judgement: `当前阶段为 ${item.stage}，forecast category 为 ${item.forecast_category}。`,
    main_risks: item.risk_reason || `${item.risk_level} risk`,
    missing_information: missing,
    customer_strategy: `围绕 ${item.business_segment} 和 ${item.trade_lane} 需求确认客户决策时间、服务范围和竞争报价情况。`,
    next_actions: [
      `${item.owner_token} 在${dueLabel(item)}前确认客户决策时间。`,
      "复核报价边界、服务范围和毛利区间。",
      needsEscalation ? "建议管理层参与下一轮关键沟通。" : "保持例行跟进并更新 CRM next step。",
    ],
    management_escalation: needsEscalation ? "Yes" : "No",
    evidence: evidenceFor(item),
    crm_next_step_draft: `本周确认客户决策时间及竞争报价情况，同时复核 ${item.business_segment} 服务范围和报价毛利。`,
  };
}

function missingInfo(item) {
  const missing = [];
  if (String(item.expected_order_status || "").startsWith("overdue")) missing.push("客户最终决策时间");
  if (!item.trade_lane || item.trade_lane === "Unspecified") missing.push("trade lane");
  if (!item.cargo_type || item.cargo_type === "Unspecified") missing.push("cargo type");
  if (["<5%", "5%-10%"].includes(item.margin_band)) missing.push("报价边界 / 目标毛利确认");
  if (missing.length === 0) missing.push("暂无明显缺失信息，建议保持 next step 更新。");
  return missing;
}
