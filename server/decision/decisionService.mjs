import { buildScenarioDecisionPack } from "./deterministicProvider.mjs";
import { buildSafePortfolio } from "./safeContext.mjs";
import { rankHealthScores, scoreOpportunityHealth } from "../../src/services/healthScoreEngine/index.js";
import rawPortfolio from "../data/decision-portfolio.json" with { type: "json" };
const safePortfolio = buildSafePortfolio(rawPortfolio);

export const scenarioDescriptors = [
  descriptor("stalled-high-value", "Stalled high value", "High-value opportunities with severe progress delay.", "DEMO-6C-OPP-001"),
  descriptor("budget-actual-gap", "Budget vs actual gap", "Material negative variance requiring recovery review.", "DEMO-6C-OPP-016"),
  descriptor("data-contradiction", "Data contradiction", "Conflicting forecast and readiness signals.", "DEMO-6C-OPP-031"),
  descriptor("growth-opportunity", "Growth opportunity", "Account-level whitespace hypothesis.", "DEMO-6C-OPP-043"),
  descriptor("location-route-risk", "Location and route review", "Internal route consistency needs verification.", "DEMO-6C-OPP-055"),
  descriptor("meeting-prep", "Meeting preparation", "Derived meeting-readiness signals.", "DEMO-6C-OPP-065"),
  descriptor("multi-risk-priority", "Multi-risk priority", "Critical cases with multiple reinforcing signals.", "DEMO-6C-OPP-075"),
  descriptor("healthy-control", "Healthy control", "Aligned signals with no manufactured escalation.", "DEMO-6C-OPP-091"),
].map((item) => ({ ...item, count: rawPortfolio.opportunities.filter((opportunity) => opportunity.primaryScenario === item.id).length }));

export const portfolioDefaultOpportunity = "DEMO-6C-OPP-075";

export function listDecisionScenarios() {
  return { defaultMode: "portfolio", portfolioDefaultOpportunity, scenarios: scenarioDescriptors };
}

export function getDecisionView({ mode, scenarioId, opportunityToken }) {
  const scope = resolveScope(mode, scenarioId);
  const defaultOpportunity = mode === "portfolio" ? portfolioDefaultOpportunity : scenarioDescriptors.find((item) => item.id === scenarioId).defaultOpportunity;
  const selectedToken = opportunityToken || defaultOpportunity;
  const selectedContext = scope.contexts.find((item) => item.opportunityToken === selectedToken);
  if (!selectedContext) return null;
  const pack = buildScenarioDecisionPack(scope.contexts, selectedContext);
  const healthScore = scoreOpportunityHealth(selectedContext);
  const healthRanking = rankHealthScores(scope.contexts);
  return {
    mode,
    scenario: mode === "scenario" ? scenarioDescriptors.find((item) => item.id === scenarioId) : null,
    scopeSummary: summarize(scope.contexts),
    defaultOpportunity,
    selectedOpportunity: selectedToken,
    opportunities: scope.contexts.map((item) => {
      const ranking = healthRanking.find((entry) => entry.opportunityToken === item.opportunityToken);
      return { opportunityToken: item.opportunityToken, ownerToken: item.ownerToken, stage: item.stage, priority: item.priority, healthScore: ranking.healthScore, healthGrade: ranking.grade, healthRank: ranking.rank, reviewRequired: item.routeConsistency === "review-required" || item.dataQualityCodes.length > 0 };
    }),
    safeContext: selectedContext,
    safeContextKeys: Object.keys(selectedContext).filter((key) => key !== "accountAggregate"),
    pack,
    healthScore,
    healthRanking,
  };
}

export function getDecisionOpportunity({ mode, scenarioId, opportunityToken }) {
  const view = getDecisionView({ mode, scenarioId, opportunityToken });
  if (!view) return null;
  return { mode: view.mode, scenario: view.scenario, safeContext: view.safeContext, accountAggregate: view.safeContext.accountAggregate, opportunity360: view.pack.opportunity360, healthScore: view.healthScore };
}

export function getDecisionPortfolioForTests() {
  return { rawPortfolio, safePortfolio };
}

function resolveScope(mode, scenarioId) {
  if (mode === "portfolio") return { contexts: safePortfolio.contexts };
  if (mode !== "scenario" || !scenarioDescriptors.some((item) => item.id === scenarioId)) throw new TypeError("Unknown decision mode or scenario");
  const allowed = new Set(rawPortfolio.opportunities.filter((item) => item.primaryScenario === scenarioId).map((item) => item.id));
  return { contexts: safePortfolio.contexts.filter((item) => allowed.has(item.opportunityToken)) };
}

function summarize(contexts) {
  return {
    scopeCount: contexts.length,
    criticalCount: contexts.filter((item) => item.priority === "Critical").length,
    highCount: contexts.filter((item) => item.priority === "High").length,
    reviewRequiredCount: contexts.filter((item) => item.routeConsistency === "review-required" || item.dataQualityCodes.length).length,
  };
}

function descriptor(id, title, summary, defaultOpportunity) { return { id, title, summary, defaultOpportunity }; }
