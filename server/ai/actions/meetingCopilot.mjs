import { metadata, topRiskOpportunities } from "./actionUtils.mjs";
import { buildNextBestActions } from "./nextBestAction.mjs";
import { buildDataDoctor } from "./dataDoctor.mjs";

export function buildMeetingCopilot({ context } = {}) {
  const opportunities = context.safeOpportunityContext || [];
  const aggregate = {
    total_opportunities: opportunities.length,
    high_risk_count: opportunities.filter((item) => ["High", "Critical"].includes(item.risk_level)).length,
    overdue_count: opportunities.filter((item) => String(item.expected_order_status || "").startsWith("overdue")).length,
  };
  const risks = topRiskOpportunities(context, 5);
  const actions = buildNextBestActions({ context }).items || [];
  const doctor = buildDataDoctor({ context });
  const noRisk = risks.length === 0;
  return {
    ...metadata(),
    type: "meeting-copilot",
    markdown: [
      "# 营业会议摘要",
      "## 一、总体判断",
      noRisk
        ? "当前筛选范围内未发现高风险案件，建议继续关注 Pipeline 阶段推进和 CRM 数据更新。"
        : `当前 Pipeline 共 ${aggregate.total_opportunities ?? 0} 个机会，高风险 ${aggregate.high_risk_count ?? 0} 个，逾期 ${aggregate.overdue_count ?? 0} 个。高风险主要集中在需要报价反馈和预计下单日更新的案件。`,
      "## 二、需要管理层介入事项",
      noRisk ? "- 当前筛选范围内未发现需要管理层介入的高风险案件。" : risks.map((item, index) => `${index + 1}. ${item.customer_token} / ${item.opportunity_token}：${item.risk_reason}，建议确认客户决策进度。`).join("\n"),
      "## 三、本周行动清单",
      actions.length === 0 ? "- 暂无优先行动。" : actions.map((item) => `- ${item.owner}：${item.action}，${item.opportunity_token}，${item.due}。`).join("\n"),
      "## 四、下周检查点",
      "- L4 高风险案件是否减少\n- Commit 案件是否更新预计下单日\n- Strategic / Key customer 是否完成下一步行动\n- CRM Data Doctor issues 是否关闭",
    ].join("\n\n"),
    top_risk_opportunities: risks,
    next_best_actions: actions,
    data_quality_issues: doctor.issues || [],
  };
}
