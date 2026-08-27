import { PILOT_EXPECTED_COUNTS, resolvePilotDepartment, normalizeId } from "./pilotContract.mjs";
import { buildTimelineDigest, buildTimelineContentEvidence } from "../decision/timelineDigest.mjs";

const FORMATTED = "@OData.Community.Display.V1.FormattedValue";
const ACTUAL_MONTHS = ["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"];

export function buildPilotScope(snapshot, { department = "all", now = new Date() } = {}) {
  const departmentDefinition = resolvePilotDepartment(department);
  const tokens = manifestTokenMaps(snapshot.entries);
  const allOpportunities = snapshot.opportunities.map((row) => normalizeOpportunity(row, tokens));
  const accountNames = new Map(snapshot.accounts.map((row) => [normalizeId(row.accountid), String(row.name || "")]));
  const scopedOpportunities = allOpportunities.filter((item) => departmentDefinition.choiceValue === null || item.departmentValue === departmentDefinition.choiceValue);
  if (!scopedOpportunities.length) throw new Error("The selected department has no authorized Pilot opportunities.");

  const scopedOpportunityIds = new Set(scopedOpportunities.map((item) => item.id));
  const scopedAccountIds = new Set(scopedOpportunities.map((item) => item.accountId));
  const actuals = snapshot.actuals.filter((row) => scopedOpportunityIds.has(normalizeId(row._aigw_opportunityid_value)));
  const coverages = snapshot.coverages.filter((row) => scopedAccountIds.has(normalizeId(row._aigw_accountid_value)));
  const signals = snapshot.signals.filter((row) => scopedOpportunityIds.has(normalizeId(row._aigw_opportunityid_value)));
  const activities = snapshot.timeline.activities.filter((row) => scopedOpportunityIds.has(normalizeId(row._regardingobjectid_value)));
  const annotations = snapshot.timeline.annotations.filter((row) => scopedOpportunityIds.has(normalizeId(row._objectid_value)));
  const closes = snapshot.closes.filter((row) => scopedOpportunityIds.has(normalizeId(row._opportunityid_value)));
  const bpfRows = snapshot.bpfRows.filter((row) => scopedOpportunityIds.has(normalizeId(row._bpf_opportunityid_value)));
  const contacts = snapshot.contacts.filter((row) => scopedAccountIds.has(normalizeId(row._parentcustomerid_value)));

  const contexts = scopedOpportunities.map((opportunity) => {
    const opportunitySignals = signals.filter((row) => normalizeId(row._aigw_opportunityid_value) === opportunity.id);
    const actual = actuals.find((row) => normalizeId(row._aigw_opportunityid_value) === opportunity.id) || null;
    const accountCoverage = coverages.filter((row) => normalizeId(row._aigw_accountid_value) === opportunity.accountId);
    const accountOpportunities = scopedOpportunities.filter((item) => item.accountId === opportunity.accountId);
    const accountSignals = signals.filter((row) => normalizeId(row._aigw_accountid_value) === opportunity.accountId);
    const accountContacts = contacts.filter((row) => normalizeId(row._parentcustomerid_value) === opportunity.accountId);
    const opportunityActivities = activities.filter((row) => normalizeId(row._regardingobjectid_value) === opportunity.id);
    const opportunityAnnotations = annotations.filter((row) => normalizeId(row._objectid_value) === opportunity.id);
    const opportunityTimelineEntries = snapshot.entries.Timeline.filter((item) => normalizeId(item.parentId) === opportunity.id);
    const closeCount = closes.filter((row) => normalizeId(row._opportunityid_value) === opportunity.id).length;
    const bpf = bpfRows.filter((row) => normalizeId(row._bpf_opportunityid_value) === opportunity.id);
    if (bpf.length !== 1) throw new Error(`Pilot BPF uniqueness failed for ${opportunity.token}.`);
    return buildContext({ opportunity, actual, accountCoverage, accountOpportunities, opportunitySignals, accountSignals, accountContacts, opportunityActivities, opportunityAnnotations, opportunityTimelineEntries, accountNames, closeCount, bpf: bpf[0], now });
  });

  return {
    department: departmentDefinition,
    contexts,
    exactAmounts: new Map(scopedOpportunities.map((opportunity) => [opportunity.token, exactAmountView(opportunity, actuals)])),
    counts: {
      opportunity: scopedOpportunities.length,
      account: scopedAccountIds.size,
      contact: contacts.length,
      actual: actuals.length,
      coverage: coverages.length,
      timeline: activities.length + annotations.length,
      signal: signals.length,
      opportunityClose: closes.length,
      bpf: bpfRows.length,
    },
    stateDistribution: stateDistribution(scopedOpportunities),
  };
}

export function assertFullPilotScope(scope) {
  for (const [key, expected] of Object.entries(PILOT_EXPECTED_COUNTS)) {
    if (scope.counts[key] !== expected) throw new Error(`Pilot ${key} count drifted: expected ${expected}, found ${scope.counts[key]}.`);
  }
  const state = scope.stateDistribution;
  if (state.won !== 7 || state.active !== 16 || state.lost !== 1) throw new Error("Pilot Opportunity state distribution drifted.");
  if (scope.contexts.some((item) => item.stage !== "Qualify")) throw new Error("Pilot BPF active stage drifted from the approved initial stage.");
}

function buildContext({ opportunity, actual, accountCoverage, accountOpportunities, opportunitySignals, accountSignals, accountContacts, opportunityActivities, opportunityAnnotations, opportunityTimelineEntries, accountNames, closeCount, bpf, now }) {
  const budget = number(opportunity.row.aigw_yearrevenuebudget);
  const budgetMargin = number(opportunity.row.aigw_yeargpmpbudget);
  const actualRevenue = number(opportunity.row.aigw_yearrevenueactual ?? actual?.aigw_annualactualrevenue);
  const actualGp = ACTUAL_MONTHS.reduce((sum, month) => sum + number(actual?.[`aigw_${month}actualgp`]), 0);
  const unresolvedObjections = opportunitySignals.filter((row) => row.aigw_objectionpresent === true).length;
  const unresolvedIssues = opportunitySignals.filter((row) => row.aigw_serviceissuecategory != null && row.aigw_issueresolved !== true).length;
  const incompleteCommitments = opportunitySignals.filter((row) => row.aigw_commitmentmade === true && row.aigw_commitmentcompleted !== true).length;
  const openQuestionCount = unresolvedObjections + unresolvedIssues + incompleteCommitments;
  const hasDecisionMaker = opportunitySignals.some((row) => row.aigw_decisionmakerinvolved === true);
  const relativeDateStatus = dateStatus(opportunity.row.estimatedclosedate, now, opportunity.state);
  const routeConsistency = routeStatus(opportunity.row);
  const missingCodes = [
    !opportunity.contactId ? "missing-contact-role" : "",
    opportunity.state === "Active" && !opportunity.row.aigw_nextaction && !opportunity.row.aigw_nextactiondate ? "missing-next-action" : "",
    opportunitySignals.length === 0 ? "missing-interaction-signal" : "",
  ].filter(Boolean);
  const contradictionCodes = [
    opportunity.row.aigw_budgetstatus === true && budget <= 0 ? "budget-status-without-budget" : "",
    opportunity.state === "Active" && closeCount > 0 ? "active-state-with-close" : "",
    opportunity.state !== "Active" && closeCount !== 1 ? "closed-state-without-single-close" : "",
  ].filter(Boolean);
  const priority = riskPriority({ state: opportunity.state, relativeDateStatus, routeConsistency, openQuestionCount, missingCodes, contradictionCodes });
  const revenueReference = Math.max(number(opportunity.row.estimatedvalue), budget, actualRevenue, number(opportunity.row.actualvalue));
  const variance = varianceCategory(actualRevenue, budget, opportunity.state);
  const marginVariance = varianceCategory(actualGp, budgetMargin, opportunity.state);
  const decisionReadiness = hasDecisionMaker && openQuestionCount === 0 ? "high" : hasDecisionMaker || openQuestionCount <= 2 ? "medium" : "low";
  const timelineContentEvidence = buildTimelineContentEvidence({
    activities: opportunityActivities,
    annotations: opportunityAnnotations,
    signals: opportunitySignals,
    timelineEntries: opportunityTimelineEntries,
    identityValues: [opportunity.row.name, accountNames.get(opportunity.accountId)],
    routeValues: [opportunity.row.aigw_opportunitylocation, opportunity.row.aigw_sealandpollookup, opportunity.row.aigw_sealandpodlookup, opportunity.row.aigw_airpollookup, opportunity.row.aigw_airpodlookup],
    now,
  });
  return {
    opportunityToken: opportunity.token,
    customerToken: `CUSTOMER-${opportunity.accountToken}`,
    accountToken: opportunity.accountToken,
    ownerToken: "OWNER-PILOT",
    salesDepartment: opportunity.department,
    opportunityState: opportunity.state,
    stage: bpfStage(bpf),
    priority,
    forecastCategory: opportunity.state === "Won" ? "Won" : opportunity.state === "Lost" ? "Lost" : priority === "Monitor" ? "Upside" : "Pipeline",
    relativeDateStatus,
    stagnationBand: opportunity.state !== "Active" ? "active" : relativeDateStatus === "overdue" ? "severe" : openQuestionCount ? "watch" : "active",
    revenueBand: amountBand(revenueReference),
    marginBand: marginBand(budgetMargin, budget),
    budgetBand: amountBand(budget),
    actualBand: amountBand(actualRevenue),
    amountBand: amountBand(number(opportunity.row.estimatedvalue)),
    annualRevenueBand: amountBand(Math.max(budget, actualRevenue)),
    annualMarginBand: amountBand(Math.max(budgetMargin, actualGp)),
    varianceCategory: variance,
    budgetVarianceBand: variance,
    marginVarianceBand: marginVariance,
    trend: accountTrend(accountOpportunities),
    elapsedPeriodCategory: opportunity.state === "Active" ? relativeDateStatus : "closed",
    dataQualityCodes: [...new Set([...missingCodes, ...contradictionCodes])],
    missingCodes,
    contradictionCodes,
    transportMode: formatted(opportunity.row, "aigw_transportmode") || (opportunity.row.aigw_transportmode == null ? "not-recorded" : `mode-${opportunity.row.aigw_transportmode}`),
    routeConsistency,
    needSummary: opportunity.row.aigw_customerneed_choice == null ? "need-category-missing" : "need-category-recorded",
    proposalSummary: opportunity.row.aigw_proposalcontent_choice == null ? "proposal-category-missing" : "proposal-category-recorded",
    progressSummary: `${opportunity.state.toLowerCase()}-${relativeDateStatus}`,
    meetingWindow: meetingWindow(opportunitySignals, now),
    stakeholderCoverage: hasDecisionMaker && accountContacts.length >= 2 ? "complete" : accountContacts.length ? "partial" : "limited",
    openQuestionCount,
    decisionReadiness,
    closeFact: closeCount === 1 ? "present" : "none",
    timelineSignalCount: opportunitySignals.length,
    timelineDigest: buildTimelineDigest({ activities: opportunityActivities, annotations: opportunityAnnotations, signals: opportunitySignals, now }),
    timelineContentEvidence,
    coverageCategory: coverageBand(accountCoverage.length),
    accountAggregate: {
      accountToken: opportunity.accountToken,
      serviceCoverageBand: coverageBand(accountCoverage.length),
      whitespaceCategory: whitespaceCategory(accountCoverage),
      opportunityTrend: accountTrend(accountOpportunities),
      relationshipMaturity: relationshipMaturity(accountOpportunities, accountCoverage, accountSignals),
    },
  };
}

function normalizeOpportunity(row, tokens) {
  const id = normalizeId(row.opportunityid);
  const accountId = normalizeId(row._parentaccountid_value);
  const contactId = normalizeId(row._parentcontactid_value);
  const token = tokens.Opportunity.get(id);
  const accountToken = tokens.Account.get(accountId);
  if (!token || !accountToken) throw new Error("Pilot Opportunity parent mapping is incomplete.");
  const stateCode = Number(row.statecode);
  return {
    id, accountId, contactId, token, accountToken, row,
    departmentValue: Number(row.aigw_salesdepartment_choice),
    department: departmentLabel(Number(row.aigw_salesdepartment_choice)),
    state: stateCode === 1 ? "Won" : stateCode === 2 ? "Lost" : "Active",
  };
}

function exactAmountView(opportunity, actuals) {
  const actual = actuals.find((row) => normalizeId(row._aigw_opportunityid_value) === opportunity.id) || null;
  return {
    currency: "CNY",
    estimatedValue: number(opportunity.row.estimatedvalue),
    annualBudgetRevenue: number(opportunity.row.aigw_yearrevenuebudget),
    annualBudgetMargin: number(opportunity.row.aigw_yeargpmpbudget),
    annualActualRevenue: number(opportunity.row.aigw_yearrevenueactual ?? actual?.aigw_annualactualrevenue),
    actualValue: number(opportunity.row.actualvalue),
  };
}

function manifestTokenMaps(entries) {
  return Object.fromEntries(Object.entries(entries).map(([entity, rows]) => [entity, new Map(rows.map((item) => [item.id, item.token]))]));
}

function riskPriority({ state, relativeDateStatus, routeConsistency, openQuestionCount, missingCodes, contradictionCodes }) {
  if (state === "Won") return "Monitor";
  if (state === "Lost") return "Medium";
  if (contradictionCodes.length > 1 || (relativeDateStatus === "overdue" && openQuestionCount >= 3)) return "Critical";
  if (relativeDateStatus === "overdue" || openQuestionCount >= 3 || routeConsistency === "review-required") return "High";
  if (openQuestionCount || missingCodes.length) return "Medium";
  return "Monitor";
}

function amountBand(value) {
  if (!value) return "none";
  if (value < 100_000) return "under-100k";
  if (value < 500_000) return "100k-500k";
  if (value < 1_000_000) return "500k-1m";
  if (value < 5_000_000) return "1m-5m";
  return "over-5m";
}

function marginBand(margin, revenue) {
  if (!revenue || !margin) return "not-recorded";
  const rate = margin / revenue;
  if (rate < 0.08) return "5-8-percent";
  if (rate < 0.12) return "8-12-percent";
  return "12-15-percent";
}

function varianceCategory(actual, budget, state) {
  if (!budget || (!actual && state === "Active")) return "not-applicable";
  const ratio = actual / budget;
  if (ratio < 0.5) return "material-negative";
  if (ratio < 0.85) return "negative";
  if (ratio <= 1.15) return "on-plan";
  return "positive";
}

function dateStatus(value, now, state) {
  if (state !== "Active") return "closed";
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "not-recorded";
  const days = (date.getTime() - now.getTime()) / 86_400_000;
  return days < 0 ? "overdue" : days <= 30 ? "near-term" : "future";
}

function meetingWindow(signals, now) {
  const futureDays = signals.map((row) => new Date(row.aigw_activitydate || "")).filter((date) => !Number.isNaN(date.getTime())).map((date) => (date.getTime() - now.getTime()) / 86_400_000).filter((days) => days >= 0).sort((a, b) => a - b);
  if (!futureDays.length) return "no-meeting";
  return futureDays[0] <= 7 ? "within-7-days" : futureDays[0] <= 30 ? "within-30-days" : "no-meeting";
}

function routeStatus(row) {
  const mode = Number(row.aigw_transportmode);
  const hasSea = Boolean(row._aigw_sealandpollookup_value && row._aigw_sealandpodlookup_value);
  const hasAir = Boolean(row._aigw_airpollookup_value && row._aigw_airpodlookup_value);
  if ([1, 2].includes(mode)) return hasAir ? "consistent" : "review-required";
  if ([3, 4].includes(mode)) return hasSea ? "consistent" : "review-required";
  return "consistent";
}

function coverageBand(count) { return count >= 3 ? "broad" : count >= 2 ? "moderate" : "narrow"; }
function whitespaceCategory(rows) { return rows.length <= 1 ? "cross-sell-potential" : rows.length <= 2 ? "selective-whitespace" : "limited-whitespace"; }
function accountTrend(rows) { const won = rows.filter((item) => item.state === "Won").length; const active = rows.filter((item) => item.state === "Active").length; return won && active ? "expanding" : active ? "stable" : "quiet"; }
function relationshipMaturity(opportunities, coverages, signals) { const score = opportunities.length + coverages.length + Math.min(signals.length, 3); return score >= 7 ? "established" : score >= 3 ? "developing" : "new"; }
function departmentLabel(value) { return ({ 1: "Dept1 Industry", 2: "Dept1 Distribution", 3: "Dept2 LCMS", 4: "Dept3 Project Cargo", 5: "Dept3 Dangerous Goods", 6: "FF", 91: "Others" })[value] || "Unknown"; }
function formatted(row, field) { return String(row?.[`${field}${FORMATTED}`] || ""); }
function bpfStage(row) {
  const label = formatted(row, "_activestageid_value");
  if (!label || label === "授予资格" || label.toLowerCase() === "qualify") return "Qualify";
  if (label === "案件关闭" || label.toLowerCase() === "close") return "Close";
  throw new Error("Pilot BPF active stage is not recognized.");
}
function number(value) { const parsed = Number(value || 0); return Number.isFinite(parsed) ? parsed : 0; }

function stateDistribution(opportunities) {
  return { active: opportunities.filter((item) => item.state === "Active").length, won: opportunities.filter((item) => item.state === "Won").length, lost: opportunities.filter((item) => item.state === "Lost").length };
}
