const SCENARIOS = [
  ["stalled-high-value", 15],
  ["budget-actual-gap", 15],
  ["data-contradiction", 12],
  ["growth-opportunity", 12],
  ["location-route-risk", 10],
  ["meeting-prep", 10],
  ["multi-risk-priority", 16],
  ["healthy-control", 10],
];

const MARGINS = [5, 8, 10, 12, 15];
const MONTHS = ["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"];

export function generateDecisionPortfolio() {
  const accounts = Array.from({ length: 20 }, (_, index) => ({
    id: token("ACCOUNT", index + 1),
    name: `Synthetic Account ${String(index + 1).padStart(2, "0")}`,
    relationshipAgeMonths: 6 + index * 4,
    activeServiceCount: 1 + (index % 4),
  }));
  const contacts = accounts.map((account, index) => ({
    id: token("CONTACT", index + 1),
    accountId: account.id,
    name: `Synthetic Contact ${String(index + 1).padStart(2, "0")}`,
  }));
  const owners = Array.from({ length: 10 }, (_, index) => ({
    id: token("OWNER", index + 1),
    name: `Synthetic Owner ${String(index + 1).padStart(2, "0")}`,
  }));
  const assignments = SCENARIOS.flatMap(([scenarioId, count]) => Array.from({ length: count }, () => scenarioId));
  const opportunities = assignments.map((primaryScenario, index) => buildOpportunity(index, primaryScenario, accounts, contacts, owners));
  const actuals = opportunities.map((opportunity, index) => buildActual(opportunity, index));
  return { version: "phase1c-6c-v1", seed: "decision-portfolio-2026-07-15", accounts, contacts, owners, opportunities, actuals };
}

function buildOpportunity(index, primaryScenario, accounts, contacts, owners) {
  const number = index + 1;
  const account = accounts[index % accounts.length];
  const contact = contacts[index % contacts.length];
  const owner = owners[index % owners.length];
  const base = {
    id: token("OPP", number),
    accountId: account.id,
    contactId: contact.id,
    ownerId: owner.id,
    name: `[AI-DEMO-6C] Decision Case ${String(number).padStart(3, "0")}`,
    primaryScenario,
    secondarySignals: [],
    stage: "Develop",
    priority: "Medium",
    forecastCategory: "Pipeline",
    expectedOrderOffsetDays: 30,
    daysSinceProgress: 12,
    budgetStatus: number % 3 === 0 ? "Outside" : "Inside",
    estimatedRevenue: 180000 + number * 7300,
    winProbability: 55,
    transportMode: number % 2 ? "Ocean" : "Air",
    locationCode: `LOC-${String((index % 20) + 1).padStart(2, "0")}`,
    polCode: `POL-${String((index % 12) + 1).padStart(2, "0")}`,
    podCode: `POD-${String(((index + 3) % 12) + 1).padStart(2, "0")}`,
    needSummary: "Synthetic service need with sanitized commercial context.",
    proposalSummary: "Synthetic proposal prepared for internal decision support.",
    progressSummary: "Synthetic progress summary without communication content.",
    meetingWindow: "none",
    stakeholderCoverage: "adequate",
    openQuestionCount: 1,
    decisionReadiness: "medium",
    dataQualityFlags: [],
  };

  if (primaryScenario === "stalled-high-value") Object.assign(base, { estimatedRevenue: 5200000 + number * 10000, daysSinceProgress: 75, expectedOrderOffsetDays: -18, priority: "High", winProbability: 65 });
  if (primaryScenario === "budget-actual-gap") Object.assign(base, { budgetStatus: "Inside", estimatedRevenue: 900000, daysSinceProgress: 18, secondarySignals: ["variance"] });
  if (primaryScenario === "data-contradiction") Object.assign(base, { winProbability: 85, forecastCategory: "Commit", expectedOrderOffsetDays: -7, dataQualityFlags: ["missing-decision-maker", "date-stage-contradiction"], decisionReadiness: "low" });
  if (primaryScenario === "growth-opportunity") Object.assign(base, { stage: "Qualify", forecastCategory: "Upside", daysSinceProgress: 8, winProbability: 50, secondarySignals: ["account-whitespace"] });
  if (primaryScenario === "location-route-risk") Object.assign(base, { transportMode: "Ocean", daysSinceProgress: 20, secondarySignals: ["route-inconsistency"], proposalSummary: "Synthetic route proposal requires internal master-data verification." });
  if (primaryScenario === "meeting-prep") Object.assign(base, { meetingWindow: "within-7-days", stakeholderCoverage: number % 2 ? "partial" : "adequate", openQuestionCount: 3 + (number % 3), decisionReadiness: "medium" });
  if (primaryScenario === "multi-risk-priority") Object.assign(base, { estimatedRevenue: 6800000 + number * 12000, daysSinceProgress: 91, expectedOrderOffsetDays: -25, priority: "Critical", winProbability: 78, dataQualityFlags: ["missing-decision-maker", "forecast-progress-conflict"], meetingWindow: "within-7-days", stakeholderCoverage: "partial", openQuestionCount: 5, decisionReadiness: "low", secondarySignals: ["variance", "route-inconsistency"] });
  if (primaryScenario === "healthy-control") Object.assign(base, { stage: "Propose", priority: "Low", forecastCategory: "Commit", expectedOrderOffsetDays: 45, daysSinceProgress: 4, budgetStatus: "Inside", winProbability: 72, meetingWindow: "within-30-days", stakeholderCoverage: "complete", openQuestionCount: 0, decisionReadiness: "high", dataQualityFlags: [] });
  return base;
}

function buildActual(opportunity, index) {
  const marginPercent = MARGINS[index % MARGINS.length];
  const annualBudget = opportunity.budgetStatus === "Inside" ? 600000 + (index % 8) * 120000 : 0;
  const actualFactor = opportunity.primaryScenario === "budget-actual-gap" ? 0.42 : opportunity.primaryScenario === "healthy-control" ? 0.92 : opportunity.forecastCategory === "Pipeline" ? 0.25 : 0.68;
  const annualActual = Math.round(annualBudget ? annualBudget * actualFactor : opportunity.estimatedRevenue * actualFactor);
  const monthly = Object.fromEntries(MONTHS.map((month, monthIndex) => {
    const budgetRevenue = annualBudget ? Math.round(annualBudget / 12) : 0;
    const actualRevenue = opportunity.forecastCategory === "Pipeline" && monthIndex > 3 ? 0 : Math.round(annualActual / (opportunity.forecastCategory === "Pipeline" ? 4 : 12));
    return [month, {
      budgetRevenue,
      budgetGrossProfit: Math.round(budgetRevenue * marginPercent / 100),
      actualRevenue,
      actualGrossProfit: Math.round(actualRevenue * marginPercent / 100),
    }];
  }));
  return { id: token("ACTUAL", index + 1), opportunityId: opportunity.id, marginPercent, monthly };
}

function token(kind, number) {
  return `DEMO-6C-${kind}-${String(number).padStart(3, "0")}`;
}

export const decisionPortfolioConstants = { scenarios: SCENARIOS, months: MONTHS, margins: MARGINS };
