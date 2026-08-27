import { applyOpportunityFilters, buildManagementDashboard } from "../management.mjs";
import { marginBand, relativeDateStatus, revenueBand } from "../logisticsFields.mjs";
import { buildSafeOpportunityContext } from "../fieldMapping/safeTransforms.mjs";

export const blockedContextKeys = [
  "raw_dataverse_row",
  "customer_name",
  "contact_name",
  "contact_email",
  "phone",
  "address",
  "detailed_address",
  "exact_revenue",
  "exact_margin",
  "supplier_cost",
  "contract_text",
  "contract_price",
  "meeting_transcript",
  "raw_account_name",
  "raw_contact_name",
  "account_name",
];

export function buildAiDemoContext({
  opportunities = [],
  filters = {},
  dynamicsStatus = {},
  now = new Date(),
} = {}) {
  const source = Array.isArray(opportunities) ? opportunities : [];
  const filtered = applyOpportunityFilters(source, filters, now);
  const dashboard = buildManagementDashboard(filtered, {}, now);
  const safeOpportunityContext = filtered.map((item) => toSafeOpportunity(item, now));
  const safeAggregateContext = {
    total_opportunities: safeOpportunityContext.length,
    dynamics_record_count: safeOpportunityContext.filter((item) => item.data_source === "dynamics").length,
    mock_record_count: safeOpportunityContext.filter((item) => item.data_source !== "dynamics").length,
    context_source: dynamicsStatus.dataSource || "mock",
    stage_distribution: dashboard.summaryPayload.stage_mix || [],
    risk_distribution: dashboard.summaryPayload.risk_mix || [],
    business_segment_distribution: dashboard.summaryPayload.business_segment_mix || [],
    transport_mode_distribution: dashboard.summaryPayload.transport_mode_mix || [],
    top_risk_opportunities: dashboard.topRiskOpportunities.map((item) => ({
      opportunity_token: item.opportunity_id,
      customer_token: item.customer_token,
      owner_role: item.owner_label,
      stage: item.stage,
      business_segment: item.business_segment,
      transport_mode: item.transport_mode,
      revenue_band: item.revenue_band,
      margin_band: item.margin_band,
      risk_level: item.risk_level,
      risk_reason: item.reason,
      ai_suggested_action: item.ai_suggested_action,
    })),
    owner_action_summary: dashboard.ownerActionBoard,
    customer_portfolio_summary: dashboard.customerPortfolio,
    overdue_count: dashboard.summaryPayload.overdue_opportunities || 0,
    high_risk_count: dashboard.summaryPayload.top_risk_count || 0,
    ai_insight_summary: dashboard.aiInsightSummary || {},
    data_quality_score: dashboard.summaryPayload.data_quality_score || 100,
  };
  const context = {
    safeAggregateContext,
    safeOpportunityContext,
    contextSummary: {
      data_source: dynamicsStatus.dataSource || "mock",
      dynamics_records: Number(dynamicsStatus.recordCount || 0),
      total_opportunities: safeOpportunityContext.length,
      safe_context_enabled: true,
      last_refresh_time: dynamicsStatus.lastRefreshTime || "",
    },
  };
  const validation = validateSafeContext(context);
  return { ...context, validation };
}

export function buildProviderContext(context = {}) {
  const providerContext = {
    safeOpportunityContext: Array.isArray(context.safeOpportunityContext) ? context.safeOpportunityContext : [],
  };
  const validation = validateSafeContext(providerContext);
  return { ...providerContext, validation };
}

export function validateSafeContext(context) {
  const serialized = JSON.stringify(context).toLowerCase();
  const blockedKey = blockedContextKeys.find((key) => serialized.includes(`"${key.toLowerCase()}"`));
  if (blockedKey) return { ok: false, reason: `Blocked sensitive key in Safe CRM Demo Context: ${blockedKey}` };
  const blockedValueHints = ["@", "+86", "+1", "+34", "contract text", "supplier_cost", "exact_revenue", "exact_margin", "contract_price", "detailed address"];
  const blockedHint = blockedValueHints.find((hint) => serialized.includes(hint));
  if (blockedHint) return { ok: false, reason: `Blocked sensitive value pattern in Safe CRM Demo Context: ${blockedHint}` };
  return { ok: true };
}

function toSafeOpportunity(item, now) {
  const mapped = buildSafeOpportunityContext(item, { now }).safeOpportunityContext;
  return {
    opportunity_token: item.id,
    customer_token: item.customer_code || customerToken(item.id),
    owner_token: item.owner_id || "OWNER-UNKNOWN",
    stage: item.stage || "Unknown",
    business_segment: item.business_segment || "Unspecified",
    transport_mode: item.transport_mode || "Unspecified",
    trade_lane: item.trade_lane || "Unspecified",
    cargo_type: item.cargo_type || "Unspecified",
    revenue_band: item.revenue_band || revenueBand(Number(item.exact_revenue || 0)),
    margin_band: item.margin_band || marginBand(Number(item.exact_margin || 0)),
    forecast_category: item.forecast_category || "Pipeline",
    recurring_type: item.recurring_type || "One-time",
    customer_tier: item.customer_tier || "Growth",
    risk_level: item.risk_level || "Low",
    risk_reason: item.risk_reason || "monitor",
    expected_order_status: relativeDateStatus(item.expected_order_date, now),
    ai_suggested_action: item.ai_suggested_action || "Confirm next action in CRM.",
    data_quality_flags: Array.isArray(item.data_quality_flags) ? item.data_quality_flags : [],
    data_source: item.source || "mock",
    logistics_field_sources: item.source === "dynamics" ? "deterministic_mapping" : "mock_demo_data",
    ...mapped,
  };
}

function customerToken(id = "OPP-001") {
  return `CUST-${String(id).split("-")[1] || "001"}`;
}
