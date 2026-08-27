import { metadata } from "./actionUtils.mjs";

const growthOptions = ["Warehousing", "Domestic Delivery", "Customs", "Contract Logistics", "Freight Forwarding"];

export function buildCustomerGrowth({ context, customer_token } = {}) {
  const opportunities = context.safeOpportunityContext || [];
  const customer = customer_token || opportunities[0]?.customer_token || "";
  const history = opportunities.filter((item) => item.customer_token === customer);
  if (!customer || history.length === 0) {
    return { ...metadata(), type: "customer-growth", empty: true, message: "当前筛选范围内没有可分析的客户组合数据。" };
  }
  const segments = unique(history.map((item) => item.business_segment));
  const modes = unique(history.map((item) => item.transport_mode));
  const missingSegments = growthOptions.filter((item) => !segments.includes(item)).slice(0, 3);
  return {
    ...metadata(),
    type: "customer-growth",
    customer_token: customer,
    customer_profile: `${customer} 当前共有 ${history.length} 个机会，主要业务为 ${segments.join(" / ")}，运输模式为 ${modes.join(" / ")}。`,
    main_business_types: segments,
    potential_growth_directions: missingSegments.length > 0 ? missingSegments : ["Integrated solution", "Service improvement"],
    recommendation_reason: `该客户已有 ${modes.join(" / ")} 相关需求，且存在 ${unique(history.map((item) => item.recurring_type)).join(" / ")} 类型机会，适合探索一体化服务。`,
    suggested_talk_track: "基于贵司目前物流需求，我们希望进一步了解仓储、报关和国内配送环节是否存在降本或时效优化空间。",
    next_action: `${history[0].owner_token} 在下一次客户沟通中确认是否存在 ${missingSegments[0] || "一体化物流"} 需求。`,
    evidence: history.slice(0, 5).map((item) => ({
      opportunity_token: item.opportunity_token,
      business_segment: item.business_segment,
      transport_mode: item.transport_mode,
      recurring_type: item.recurring_type,
      revenue_band: item.revenue_band,
      margin_band: item.margin_band,
    })),
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
