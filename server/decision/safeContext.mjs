const MONTHS = ["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"];

export function buildSafePortfolio(rawPortfolio) {
  const actualByOpportunity = new Map(rawPortfolio.actuals.map((item) => [item.opportunityId, item]));
  const opportunitiesByAccount = groupBy(rawPortfolio.opportunities, (item) => item.accountId);
  const accountAggregates = new Map(rawPortfolio.accounts.map((account) => [account.id, buildSafeAccountAggregate(account, opportunitiesByAccount.get(account.id) || [])]));
  const contexts = rawPortfolio.opportunities.map((opportunity) => buildSafeDecisionContext(opportunity, actualByOpportunity.get(opportunity.id), accountAggregates.get(opportunity.accountId)));
  return { contexts, accountAggregates };
}

export function buildSafeDecisionContext(opportunity, actual, accountAggregate) {
  const totals = MONTHS.reduce((sum, month) => {
    const row = actual.monthly[month];
    sum.budgetRevenue += row.budgetRevenue;
    sum.actualRevenue += row.actualRevenue;
    sum.actualGrossProfit += row.actualGrossProfit;
    return sum;
  }, { budgetRevenue: 0, actualRevenue: 0, actualGrossProfit: 0 });
  const variance = totals.budgetRevenue ? (totals.actualRevenue - totals.budgetRevenue) / totals.budgetRevenue : 0;
  const contradictionCodes = opportunity.dataQualityFlags.filter((item) => item.includes("contradiction") || item.includes("conflict"));
  return {
    opportunityToken: opportunity.id,
    customerToken: opportunity.accountId,
    accountToken: opportunity.accountId,
    ownerToken: opportunity.ownerId,
    stage: opportunity.stage,
    priority: opportunity.priority,
    forecastCategory: opportunity.forecastCategory,
    relativeDateStatus: opportunity.expectedOrderOffsetDays < 0 ? "overdue" : opportunity.expectedOrderOffsetDays <= 14 ? "near-term" : "future",
    stagnationBand: opportunity.daysSinceProgress >= 60 ? "severe" : opportunity.daysSinceProgress >= 30 ? "watch" : "active",
    revenueBand: band(opportunity.estimatedRevenue, [500000, 1500000, 5000000], ["under-500k", "500k-1.5m", "1.5m-5m", "over-5m"]),
    marginBand: `${actual.marginPercent}%`,
    budgetBand: band(totals.budgetRevenue, [1, 600000, 1200000], ["none", "under-600k", "600k-1.2m", "over-1.2m"]),
    actualBand: band(totals.actualRevenue, [1, 300000, 900000], ["none", "under-300k", "300k-900k", "over-900k"]),
    varianceCategory: totals.budgetRevenue === 0 ? "not-applicable" : variance <= -0.4 ? "material-negative" : variance <= -0.15 ? "negative" : variance >= 0.15 ? "positive" : "on-plan",
    elapsedPeriodCategory: opportunity.forecastCategory === "Pipeline" ? "pipeline" : "actuals-recorded",
    dataQualityCodes: [...opportunity.dataQualityFlags],
    missingCodes: opportunity.dataQualityFlags.filter((item) => item.startsWith("missing-")),
    contradictionCodes,
    transportMode: opportunity.transportMode,
    routeConsistency: opportunity.secondarySignals.includes("route-inconsistency") ? "review-required" : "consistent",
    needSummary: sanitizeSummary(opportunity.needSummary),
    proposalSummary: sanitizeSummary(opportunity.proposalSummary),
    progressSummary: sanitizeSummary(opportunity.progressSummary),
    meetingWindow: opportunity.meetingWindow,
    stakeholderCoverage: opportunity.stakeholderCoverage,
    openQuestionCount: opportunity.openQuestionCount,
    decisionReadiness: opportunity.decisionReadiness,
    accountAggregate,
  };
}

function buildSafeAccountAggregate(account, opportunities) {
  const activeServices = account.activeServiceCount;
  const mature = account.relationshipAgeMonths >= 48;
  const advancing = opportunities.filter((item) => ["Propose", "Develop"].includes(item.stage)).length;
  return {
    accountToken: account.id,
    serviceCoverageBand: activeServices >= 4 ? "broad" : activeServices >= 2 ? "moderate" : "narrow",
    whitespaceCategory: activeServices <= 1 ? "cross-sell-potential" : activeServices <= 3 ? "selective-whitespace" : "limited-whitespace",
    opportunityTrend: advancing >= 3 ? "expanding" : advancing === 0 ? "quiet" : "stable",
    relationshipMaturity: mature ? "established" : account.relationshipAgeMonths >= 18 ? "developing" : "new",
  };
}

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return groups;
}

function band(value, thresholds, labels) {
  const index = thresholds.findIndex((threshold) => value < threshold);
  return labels[index === -1 ? labels.length - 1 : index];
}

function sanitizeSummary(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

export const safeDecisionContextKeys = [
  "opportunityToken", "customerToken", "accountToken", "ownerToken", "stage", "priority", "forecastCategory", "relativeDateStatus",
  "stagnationBand", "revenueBand", "marginBand", "budgetBand", "actualBand", "varianceCategory", "elapsedPeriodCategory", "dataQualityCodes",
  "missingCodes", "contradictionCodes", "transportMode", "routeConsistency", "needSummary", "proposalSummary", "progressSummary", "meetingWindow",
  "stakeholderCoverage", "openQuestionCount", "decisionReadiness", "accountAggregate", "salesDepartment", "opportunityState", "amountBand",
  "annualRevenueBand", "annualMarginBand", "budgetVarianceBand", "marginVarianceBand", "trend", "closeFact", "timelineSignalCount", "timelineDigest", "coverageCategory",
  "timelineContentEvidence",
];
