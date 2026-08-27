const businessSegments = ["Freight Forwarding", "Warehousing", "Customs", "Domestic Delivery", "Contract Logistics"];
const transportModes = ["OE", "OI", "AE", "AI", "Domestic", "Warehousing", "Customs"];
const tradeLanes = ["Shanghai-Tokyo", "Shanghai-Singapore", "Shenzhen-Seoul", "Domestic East China", "South China Export", "Japan Import", "Southeast Asia Lane"];
const cargoTypes = ["Apparel", "Food", "Machinery", "Electronics", "Retail", "Auto Parts", "Consumer Goods"];
const customerNeeds = ["Competitive quotation", "Cost reduction", "Annual tender", "New lane setup", "Warehouse solution", "Renewal", "Service improvement"];
const proposalTypes = ["Cost reduction", "Lead time improvement", "Integrated solution", "Renewal", "Network optimization"];
const forecastCategories = ["Commit", "Best Case", "Pipeline"];
const recurringTypes = ["One-time", "Recurring", "Annual Tender"];
const customerTiers = ["Strategic", "Key", "Growth", "Spot"];
const decisionMakerTypes = ["Logistics", "Procurement", "Finance", "Management"];

export function enrichLogisticsOpportunity(base, index = 0, now = new Date()) {
  const seed = `${base.id || ""}|${base.opportunity_name || ""}|${base.customer_code || ""}|${index}`;
  const profile = logisticsProfile(seed);
  const exactRevenue = Number(base.exact_revenue || 0);
  const exactMargin = Number(base.exact_margin || 0);
  const riskLevel = base.risk_level || deriveRiskLevel(base, now);
  const enriched = {
    ...base,
    business_segment: base.business_segment || profile.business_segment,
    transport_mode: base.transport_mode || profile.transport_mode,
    trade_lane: base.trade_lane || profile.trade_lane,
    cargo_type: base.cargo_type || profile.cargo_type,
    customer_need: base.customer_need || profile.customer_need,
    proposal_type: base.proposal_type || profile.proposal_type,
    proposal_content: base.proposal_content || proposalContent(profile),
    revenue_band: base.revenue_band || revenueBand(exactRevenue),
    margin_band: base.margin_band || marginBand(exactMargin),
    forecast_category: base.forecast_category || forecastCategory(base.stage, riskLevel, profile.forecast_category),
    recurring_type: base.recurring_type || profile.recurring_type,
    customer_tier: base.customer_tier || profile.customer_tier,
    decision_maker_type: base.decision_maker_type || profile.decision_maker_type,
    risk_level: riskLevel,
    source: base.source || "mock",
  };

  enriched.risk_reason = base.risk_reason || riskReason(enriched, now);
  enriched.ai_suggested_action = base.ai_suggested_action || suggestedAction(enriched, now);
  enriched.data_quality_flags = Array.isArray(base.data_quality_flags)
    ? base.data_quality_flags
    : dataQualityFlags(enriched, now);
  return enriched;
}

export function stableTokenFragment(value, length = 6) {
  return hashString(String(value || "token")).toString(36).toUpperCase().padStart(length, "0").slice(0, length);
}

export function revenueBand(value) {
  if (value < 1000000) return "<1M";
  if (value < 3000000) return "1M-3M";
  if (value < 5000000) return "3M-5M";
  return "5M+";
}

export function marginBand(value) {
  if (value < 0.05) return "<5%";
  if (value < 0.1) return "5%-10%";
  if (value < 0.15) return "10%-15%";
  return "15%+";
}

export function relativeDateStatus(dateString, now = new Date()) {
  const days = dateDiffDays(dateString, now);
  if (days < 0) return `overdue_${Math.abs(days)}_days`;
  if (days === 0) return "due_today";
  return `due_in_${days}_days`;
}

function logisticsProfile(seed) {
  return {
    business_segment: pick(businessSegments, `${seed}|segment`),
    transport_mode: pick(transportModes, `${seed}|mode`),
    trade_lane: pick(tradeLanes, `${seed}|lane`),
    cargo_type: pick(cargoTypes, `${seed}|cargo`),
    customer_need: pick(customerNeeds, `${seed}|need`),
    proposal_type: pick(proposalTypes, `${seed}|proposal`),
    forecast_category: pick(forecastCategories, `${seed}|forecast`),
    recurring_type: pick(recurringTypes, `${seed}|recurring`),
    customer_tier: pick(customerTiers, `${seed}|tier`),
    decision_maker_type: pick(decisionMakerTypes, `${seed}|decision`),
  };
}

function pick(values, seed) {
  return values[hashString(seed) % values.length];
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function proposalContent(profile) {
  return `${profile.proposal_type} proposal for ${profile.business_segment} on ${profile.trade_lane}, covering ${profile.cargo_type} operations.`;
}

function forecastCategory(stage, riskLevel, fallback) {
  if (stage === "L5 Won") return "Commit";
  if (["Critical", "High"].includes(riskLevel)) return "Pipeline";
  if (stage === "L4 Quotation") return "Best Case";
  return fallback;
}

function deriveRiskLevel(item, now) {
  const revenue = Number(item.exact_revenue || 0);
  const margin = Number(item.exact_margin || 0);
  const overdue = dateDiffDays(item.expected_order_date, now) < 0;
  if (item.stage !== "L5 Won" && overdue && revenue >= 5000000) return "Critical";
  if (item.stage !== "L5 Won" && (overdue || margin < 0.08 || revenue >= 5000000)) return "High";
  if (item.stage !== "L5 Won" && margin < 0.1) return "Medium";
  return "Low";
}

function riskReason(item, now) {
  const reasons = [];
  if (["High", "Critical"].includes(item.risk_level)) reasons.push(`${item.risk_level} risk`);
  if (dateDiffDays(item.expected_order_date, now) < 0) reasons.push(relativeDateStatus(item.expected_order_date, now));
  if (Number(item.exact_margin || 0) < 0.08) reasons.push("low margin band");
  if (Number(item.exact_revenue || 0) >= 5000000) reasons.push("high value");
  if ((item.data_quality_flags || []).length > 0) reasons.push("data quality attention");
  return reasons.join(" · ") || "monitor";
}

function suggestedAction(item, now) {
  if (dateDiffDays(item.expected_order_date, now) < 0) return "Confirm customer decision date and update next action this week.";
  if (Number(item.exact_margin || 0) < 0.08) return "Review quotation boundary and escalation approval before final offer.";
  if (item.recurring_type === "Annual Tender") return "Prepare management review for tender strategy and renewal assumptions.";
  if (item.business_segment === "Warehousing") return "Validate site capacity, contract term, and cross-sell potential.";
  return "Keep next milestone visible and confirm owner follow-up in CRM.";
}

function dataQualityFlags(item, now) {
  const flags = [];
  for (const field of ["customer_code", "owner_id", "stage", "expected_order_date", "transport_mode"]) {
    if (!item[field]) flags.push(`missing_${field}`);
  }
  if (dateDiffDays(item.modified_on || item.expected_order_date, now) < -30 && item.stage !== "L5 Won") flags.push("stale_activity");
  if (Number(item.exact_margin || 0) <= 0) flags.push("missing_margin");
  return flags;
}

function dateDiffDays(dateString, now) {
  const date = new Date(`${dateString || new Date().toISOString().slice(0, 10)}T00:00:00`);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}
