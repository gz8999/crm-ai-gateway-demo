import { findSafeOpportunity, metadata } from "./actionUtils.mjs";
import { buildOpportunityBrief } from "./opportunityBrief.mjs";

export function buildDraftPack({ context, opportunity_id } = {}) {
  const item = findSafeOpportunity(context, opportunity_id);
  if (!item) return { ...metadata(), type: "draft-pack", empty: true, message: "当前筛选范围内没有可生成 Draft Pack 的案件。" };
  const brief = buildOpportunityBrief({ context, opportunity_id: item.opportunity_token });
  return {
    ...metadata(),
    type: "draft-pack",
    opportunity_token: item.opportunity_token,
    customer_token: item.customer_token,
    drafts: {
      customer_follow_up_email: [
        `主题：关于 ${item.transport_mode} / ${item.business_segment} 提案的后续确认`,
        `${item.customer_token} 您好，`,
        `感谢您审阅我们的提案。我们希望进一步确认服务范围、时间计划以及下一步决策安排，以便确保方案与贵司物流需求保持一致。`,
        "如方便，我们建议安排一次简短沟通，确认后续推进事项。",
      ].join("\n\n"),
      internal_management_report: `内部汇报：${item.opportunity_token} 当前处于 ${item.stage}，风险为 ${item.risk_level}，收入区间 ${item.revenue_band}，毛利区间 ${item.margin_band}。建议关注：${brief.main_risks}。`,
      meeting_question_list: [
        "下次客户会议需确认：",
        "- 客户最终决策时间",
        "- 是否存在竞争报价",
        "- 服务范围和目标开始日期",
        "- 是否需要仓储 / 配送 / 报关一体化方案",
        "- 报价边界和后续审批流程",
      ].join("\n"),
      crm_next_step_draft: brief.crm_next_step_draft,
      risk_explanation: `内部风险说明：${item.risk_reason}。证据包括 stage=${item.stage}、expected_order_status=${item.expected_order_status}、revenue_band=${item.revenue_band}、margin_band=${item.margin_band}。`,
      japanese_hq_report_placeholder: "Japanese HQ Report placeholder: future phase will generate a Japanese summary after i18n / JP template approval.",
    },
  };
}
