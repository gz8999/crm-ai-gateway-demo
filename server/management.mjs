import { marginBand, relativeDateStatus, revenueBand } from "./logisticsFields.mjs";
import { buildActionBoardModel } from "./ai/actionBoardModel.mjs";
import { generateDemoResponse } from "./ai/demoProvider.mjs";
import { buildInsightAggregate, buildOpportunityInsight } from "./ai/insightRules.mjs";
import { buildRiskRadarModel } from "./ai/riskRadarModel.mjs";
import { buildSafeOpportunityContext } from "./fieldMapping/safeTransforms.mjs";

const stages = ["L1 Initial Contact", "L2 Need Confirmed", "L3 Proposal", "L4 Quotation", "L5 Won"];
const riskLevels = ["Low", "Medium", "High", "Critical"];
const stageProbabilities = {
  "L1 Initial Contact": 0.1,
  "L2 Need Confirmed": 0.25,
  "L3 Proposal": 0.45,
  "L4 Quotation": 0.65,
  "L5 Won": 1,
};

export function buildManagementDashboard(opportunities, filters = {}, now = new Date()) {
  const source = Array.isArray(opportunities) ? opportunities : [];
  const filterEntries = buildFilterEntries(source, now);
  const filteredEntries = filterEntries.filter((entry) => matchesOpportunityFilters(entry, filters));
  const filtered = filteredEntries.map((entry) => entry.item);
  const open = filtered.filter((item) => item.stage !== "L5 Won");
  const won = filtered.filter((item) => item.stage === "L5 Won");
  const highRisk = open.filter((item) => ["High", "Critical"].includes(item.risk_level));
  const overdue = open.filter((item) => dateDiffDays(item.expected_order_date, now) < 0);
  const weightedForecastValue = open.reduce((sum, item) => sum + Number(item.exact_revenue || 0) * probabilityFor(item.stage), 0);
  const wonRevenueValue = won.reduce((sum, item) => sum + Number(item.exact_revenue || 0), 0);
  const openPipelineValue = open.reduce((sum, item) => sum + Number(item.exact_revenue || 0), 0);
  const highRiskValue = highRisk.reduce((sum, item) => sum + Number(item.exact_revenue || 0), 0);
  const forecastTarget = 18000000;
  const safeContexts = filteredEntries.map((entry) => entry.safe);
  const aiInsightSummary = buildInsightAggregate(safeContexts);
  const aiInsightsByOpportunity = Object.fromEntries(safeContexts.map((safe) => [
    safe.opportunityToken,
    buildOpportunityInsight(safe),
  ]));
  const riskRadar = buildRiskRadarModel(safeContexts);
  const actionBoard = buildActionBoardModel(safeContexts);

  return {
    filters: buildFilterOptions(filterEntries),
    appliedFilters: filters,
    filteredOpportunityIds: filtered.map((item) => item.id),
    filteredCount: filtered.length,
    totalDemoCount: source.length,
    summaryPayload: {
      record_count: filtered.length,
      open_cases: open.length,
      won_revenue_band: aggregateBand(wonRevenueValue),
      open_pipeline_band: aggregateBand(openPipelineValue),
      weighted_forecast_band: aggregateBand(weightedForecastValue),
      forecast_achievement: percent(wonRevenueValue / forecastTarget),
      high_risk_pipeline_band: aggregateBand(highRiskValue),
      overdue_opportunities: overdue.length,
      data_quality_score: dataQualityScore(filtered),
      top_risk_count: highRisk.length,
      stage_mix: stages.map((stage) => ({ stage, count: filtered.filter((item) => item.stage === stage).length })),
      risk_mix: riskLevels.map((risk) => ({ risk_level: risk, count: filtered.filter((item) => item.risk_level === risk).length })),
      business_segment_mix: topCounts(filtered, (item) => item.business_segment),
      transport_mode_mix: topCounts(filtered, (item) => item.transport_mode),
      customer_tier_mix: topCounts(filtered, (item) => item.customer_tier),
      data_source_mix: topCounts(filtered, (item) => item.source || "mock"),
      ai_insight_summary: aiInsightSummary,
    },
    kpis: [
      kpi("Won Revenue", aggregateBand(wonRevenueValue), `${won.length} won cases`, "Revenue already closed in selected scope"),
      kpi("Open Pipeline", aggregateBand(openPipelineValue), `${open.length} open cases`, "Open opportunity value grouped as a safe aggregate"),
      kpi("Weighted Forecast", aggregateBand(weightedForecastValue), "Probability adjusted", "Open pipeline multiplied by stage probability"),
      kpi("Forecast Achievement", percent(wonRevenueValue / forecastTarget), "Target 18M demo benchmark", "Closed revenue compared with demo target"),
      kpi("High Risk Pipeline", aggregateBand(highRiskValue), `${highRisk.length} high / critical cases`, "Open high-risk value requiring management action"),
      kpi("Overdue Opportunities", String(overdue.length), "Expected order date passed", "Open opportunities with overdue expected order status"),
      kpi("Data Quality Score", `${dataQualityScore(filtered)}/100`, "Gateway readiness", "Completeness and safety readiness score"),
    ],
    pipelineHealth: stages.map((stage) => stageHealth(stage, filtered, now)),
    riskHeatmap: riskHeatmap(filtered),
    topRiskOpportunities: topRiskOpportunities(open, now),
    ownerActionBoard: ownerActionBoard(open, now),
    customerPortfolio: customerPortfolio(filtered),
    aiInsightSummary,
    aiInsightsByOpportunity,
    riskRadar,
    actionBoard,
  };
}

export function generateManagementSummary(summaryPayload) {
  const validation = validateManagementPayload(summaryPayload || {});
  if (!validation.ok) return { blocked: true, error: validation.reason };
  return generateDemoResponse({ functionName: "management-summary", payload: summaryPayload, language: "zh-CN" });
}

export function validateManagementPayload(payload) {
  const serialized = JSON.stringify(payload).toLowerCase();
  const blocked = ["customer_name", "contact_name", "contact_email", "phone", "address", "detailed_address", "exact_revenue", "exact_margin", "supplier_cost", "contract_text", "contract_price", "meeting_transcript", "@"]
    .find((item) => serialized.includes(item));
  if (blocked) return { ok: false, reason: `Blocked sensitive content in management summary payload: ${blocked}` };
  return { ok: true };
}

export function applyOpportunityFilters(items, filters = {}, now = new Date()) {
  return buildFilterEntries(items, now)
    .filter((entry) => matchesOpportunityFilters(entry, filters))
    .map((entry) => entry.item);
}

function buildFilterEntries(items, now) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const safe = buildSafeOpportunityContext(item, { now }).safeOpportunityContext;
    const insight = buildOpportunityInsight(safe);
    return { item, safe, insight };
  });
}

function matchesOpportunityFilters(entry, filters = {}) {
  const checks = {
    opportunityStage: opportunityStage(entry),
    winProbability: entry.safe.winProbability,
    riskLevel: riskLevelCategory(entry),
    priority: entry.safe.priority,
    salesDepartment: entry.safe.salesDepartment || entry.item.department,
    bookingDepartment: entry.safe.bookingDepartment,
    organizationGroup: entry.safe.organizationGroup,
    opportunityType: entry.safe.opportunityType,
    customerNeed: entry.safe.customerNeed,
    proposalContent: entry.safe.proposalContent,
    transportMode: entry.safe.transportMode || entry.item.transport_mode,
    spotContinuous: entry.safe.oneTimeOrContinuous || entry.item.recurring_type,
    expectedOrderStatus: expectedOrderCategory(entry.safe.expectedOrderStatus),
    amountBand: amountBandCategory(entry.safe.estimatedQuoteBand || entry.safe.budgetAmountBand || entry.item.revenue_band),
    ownerToken: entry.safe.ownerToken,
  };
  return Object.entries(filters || {}).every(([key, value]) => {
    if (!value) return true;
    return normalizeFilterValue(checks[key]) === normalizeFilterValue(value);
  });
}

function buildFilterOptions(entries) {
  const source = Array.isArray(entries) ? entries : [];
  return {
    scopeLabel: "[AI-DEMO] only",
    stages: unique(source.map(opportunityStage)),
    winProbabilities: unique(source.map((entry) => entry.safe.winProbability)),
    riskLevels: ["High", "Medium", "Low"],
    priorities: unique(source.map((entry) => entry.safe.priority)),
    salesDepartments: unique(source.map((entry) => entry.safe.salesDepartment || entry.item.department)),
    bookingDepartments: unique(source.map((entry) => entry.safe.bookingDepartment)),
    organizationGroups: unique(source.map((entry) => entry.safe.organizationGroup)),
    opportunityTypes: unique(source.map((entry) => entry.safe.opportunityType)),
    customerNeeds: unique(source.map((entry) => entry.safe.customerNeed)),
    proposalContents: unique(source.map((entry) => entry.safe.proposalContent)),
    transportModes: unique(source.map((entry) => entry.safe.transportMode || entry.item.transport_mode)),
    spotContinuousOptions: unique(source.map((entry) => entry.safe.oneTimeOrContinuous || entry.item.recurring_type)),
    expectedOrderStatuses: ["overdue", "due soon", "future", "unknown"],
    amountBands: unique(source.map((entry) => amountBandCategory(entry.safe.estimatedQuoteBand || entry.safe.budgetAmountBand || entry.item.revenue_band))),
    ownerTokens: unique(source.map((entry) => entry.safe.ownerToken)),
  };
}

function opportunityStage(entry) {
  return entry.safe.opportunityStage || entry.item.stage || "Unknown";
}

function riskLevelCategory(entry) {
  const badges = entry.insight?.badges || [];
  if (badges.some((badge) => ["High Risk", "Overdue", "Executive Attention"].includes(badge))) return "High";
  if (badges.some((badge) => ["Cost Pressure", "Decision Maker Unclear", "Needs Follow-up", "Low Win Probability"].includes(badge))) return "Medium";
  if (["Critical", "High"].includes(entry.item.risk_level)) return "High";
  if (entry.item.risk_level === "Medium") return "Medium";
  return "Low";
}

function expectedOrderCategory(value) {
  const text = String(value || "").toLowerCase();
  if (!text || ["not provided", "not_provided", "unknown", "未填写"].includes(text)) return "unknown";
  if (text.includes("overdue")) return "overdue";
  if (text.includes("due_in")) return "due soon";
  if (text.includes("future")) return "future";
  return "unknown";
}

function amountBandCategory(value) {
  const text = String(value || "").toLowerCase().replace(/\s+/g, "");
  if (!text || ["not_provided", "unknown", "未填写"].includes(text)) return "";
  if (text.includes("10m") || text.includes("5m+") || text.includes("5m-10m") || text.includes("5m")) return "5M+";
  if (text.includes("<1m") || text.includes("0-1m")) return "<1M";
  if (text.includes("1m") || text.includes("3m")) return "1M-5M";
  return "";
}

function normalizeFilterValue(value) {
  return String(value || "").trim().toLowerCase();
}

function kpi(label, value, meta, description) {
  return { label, value, meta, description };
}

function stageHealth(stage, items, now) {
  const stageItems = items.filter((item) => item.stage === stage);
  const riskItems = stageItems.filter((item) => ["High", "Critical"].includes(item.risk_level));
  const revenue = stageItems.reduce((sum, item) => sum + Number(item.exact_revenue || 0), 0);
  const weighted = stageItems.reduce((sum, item) => sum + Number(item.exact_revenue || 0) * probabilityFor(item.stage), 0);
  const riskValue = riskItems.reduce((sum, item) => sum + Number(item.exact_revenue || 0), 0);
  return {
    stage,
    count: stageItems.length,
    revenue_band: aggregateBand(revenue),
    weighted_forecast_band: aggregateBand(weighted),
    risk_amount_band: aggregateBand(riskValue),
    overdue_count: stageItems.filter((item) => dateDiffDays(item.expected_order_date, now) < 0).length,
    health_score: Math.max(45, 95 - riskItems.length * 7 - stageItems.filter((item) => dateDiffDays(item.expected_order_date, now) < 0).length * 5),
  };
}

function topRiskOpportunities(items, now) {
  return [...items]
    .map((item) => ({
      opportunity_id: item.id,
      opportunity_name: item.opportunity_name,
      customer_token: item.customer_code || customerToken(item.id),
      owner_label: ownerLabel(item.owner_id),
      stage: item.stage,
      business_segment: item.business_segment,
      transport_mode: item.transport_mode,
      revenue_band: item.revenue_band || revenueBand(Number(item.exact_revenue || 0)),
      margin_band: item.margin_band || marginBand(Number(item.exact_margin || 0)),
      risk_level: item.risk_level,
      expected_order_status: relativeDateStatus(item.expected_order_date, now),
      reason: item.risk_reason || riskReason(item, now),
      ai_suggested_action: item.ai_suggested_action,
      score: riskScore(item, now),
    }))
    .filter((item) => item.risk_level !== "Low" || item.expected_order_status.startsWith("overdue"))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item, index) => ({ priority: index + 1, ...item }));
}

function ownerActionBoard(items, now) {
  const grouped = groupBy(items, (item) => ownerLabel(item.owner_id));
  return Object.entries(grouped).map(([owner, ownerItems]) => {
    const high = ownerItems.filter((item) => ["High", "Critical"].includes(item.risk_level));
    const overdue = ownerItems.filter((item) => dateDiffDays(item.expected_order_date, now) < 0);
    return {
      owner_label: owner,
      open_cases: ownerItems.length,
      high_risk: high.length,
      overdue: overdue.length,
      weighted_forecast_band: aggregateBand(ownerItems.reduce((sum, item) => sum + Number(item.exact_revenue || 0) * probabilityFor(item.stage), 0)),
      ai_comment: overdue.length > 0
        ? "优先关闭逾期报价反馈，并同步更新预计成单状态。"
        : high.length > 0
          ? "建议管理层介入高风险案件，确认价格、舱位和客户决策路径。"
          : "案件节奏健康，保持例行跟进和下阶段推进。",
    };
  }).sort((a, b) => b.high_risk - a.high_risk || b.overdue - a.overdue);
}

function customerPortfolio(items) {
  const grouped = groupBy(items, (item) => item.customer_code || customerToken(item.id));
  return Object.entries(grouped).map(([customerTokenValue, customerItems]) => {
    const revenue = customerItems.reduce((sum, item) => sum + Number(item.exact_revenue || 0), 0);
    const avgMargin = customerItems.reduce((sum, item) => sum + Number(item.exact_margin || 0), 0) / Math.max(1, customerItems.length);
    const highRiskCount = customerItems.filter((item) => ["High", "Critical"].includes(item.risk_level)).length;
    const mainBusiness = topCounts(customerItems, (item) => item.business_segment)[0]?.value || "Mixed";
    return {
      customer_token: customerTokenValue,
      cases: customerItems.length,
      won_cases: customerItems.filter((item) => item.stage === "L5 Won").length,
      revenue_grade: aggregateBand(revenue),
      margin_grade: marginBand(avgMargin),
      main_business: mainBusiness,
      ai_recommendation: highRiskCount > 1
        ? "高风险集中，建议客户层面统一复盘。"
        : avgMargin < 0.08
          ? "毛利偏低，建议优化报价边界和服务范围。"
          : "组合健康，可推进续约和交叉销售。",
    };
  }).sort((a, b) => b.cases - a.cases).slice(0, 10);
}

function riskHeatmap(items) {
  return stages.flatMap((stage) => riskLevels.map((risk) => ({
    stage,
    risk_level: risk,
    count: items.filter((item) => item.stage === stage && item.risk_level === risk).length,
  })));
}

function riskReason(item, now) {
  const reasons = [];
  if (["High", "Critical"].includes(item.risk_level)) reasons.push(`${item.risk_level} risk`);
  if (dateDiffDays(item.expected_order_date, now) < 0) reasons.push(relativeDateStatus(item.expected_order_date, now));
  if (Number(item.exact_margin || 0) < 0.08) reasons.push("low margin band");
  if (Number(item.exact_revenue || 0) >= 5000000) reasons.push("high value");
  return reasons.join(" · ") || "monitor";
}

function riskScore(item, now) {
  const riskWeight = { Low: 1, Medium: 2, High: 4, Critical: 5 }[item.risk_level] || 1;
  const overdueWeight = dateDiffDays(item.expected_order_date, now) < 0 ? 3 : 0;
  const marginWeight = Number(item.exact_margin || 0) < 0.08 ? 2 : 0;
  const valueWeight = Number(item.exact_revenue || 0) >= 5000000 ? 2 : 0;
  return riskWeight + overdueWeight + marginWeight + valueWeight;
}

function dataQualityScore(items) {
  if (items.length === 0) return 100;
  const required = ["id", "company", "customer_code", "expected_order_date", "owner_id", "department", "stage", "risk_level", "transport_mode", "exact_revenue", "exact_margin"];
  const missing = items.reduce((sum, item) => sum + required.filter((field) => item[field] === undefined || item[field] === "").length, 0);
  return Math.max(72, Math.round(100 - (missing / (items.length * required.length)) * 100));
}

function dateDiffDays(dateString, now) {
  const date = new Date(`${dateString}T00:00:00`);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function probabilityFor(stage) {
  return stageProbabilities[stage] || 0.3;
}

function aggregateBand(value) {
  if (value < 1000000) return "<1M";
  if (value < 3000000) return "1M-3M";
  if (value < 5000000) return "3M-5M";
  if (value < 10000000) return "5M-10M";
  if (value < 25000000) return "10M-25M";
  if (value < 50000000) return "25M-50M";
  return "50M+";
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function ownerLabel(ownerId = "OWNER-001") {
  return ownerId.replace("OWNER-", "Owner ");
}

function customerToken(id = "OPP-001") {
  return `CUST-${id.split("-")[1] || "001"}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function topCounts(items, getKey) {
  return Object.entries(groupBy(items, (item) => getKey(item) || "Unspecified"))
    .map(([value, group]) => ({ value, count: group.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function groupBy(items, getKey) {
  return items.reduce((map, item) => {
    const key = getKey(item);
    map[key] ||= [];
    map[key].push(item);
    return map;
  }, {});
}
