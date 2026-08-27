import { CANONICAL_RISK_CATEGORY_BY_CODE } from "./riskCategoryContract.mjs";

const PAGE_TITLES = {
  cockpit: "Executive decision summary",
  risk: "Risk and priority finding",
  opportunity360: "Opportunity 360 assessment",
  action: "Recommended action plan",
  meeting: "Meeting preparation",
  portfolio: "Portfolio intelligence",
};

export function buildScenarioDecisionPack(contexts, selectedContext) {
  if (!contexts.length || !selectedContext) throw new Error("Safe decision context is required");
  const signal = classifySignals(contexts, selectedContext);
  return Object.fromEntries(Object.keys(PAGE_TITLES).map((page) => [page, buildOutput(page, signal, selectedContext, contexts)]));
}

function buildOutput(page, signal, context, contexts) {
  const content = contentFor(signal, page, context, contexts);
  return {
    id: `${page}-${context.opportunityToken}`,
    title: PAGE_TITLES[page],
    fact: content.fact,
    inference: content.inference,
    evidence: content.evidence,
    confidence: { level: content.confidence, reason: content.confidenceReason },
    recommendedAction: content.actions.map((item) => ({ ...item, status: "Draft only" })),
    priority: content.priority,
    providerUsed: "demo",
    fallbackReason: "",
    safeContextUsed: true,
    externalModelCalled: false,
    rawDataSent: false,
  };
}

export function classifyDecisionRiskCategory(contexts, selected) {
  if (selected.priority === "Critical" && selected.stagnationBand === "severe") return category("multi-risk");
  if (selected.stagnationBand === "severe" && selected.revenueBand === "over-5m") return category("stalled");
  if (selected.routeConsistency === "review-required") return category("route");
  if (selected.meetingWindow === "within-7-days") return category("meeting");
  if (selected.varianceCategory === "material-negative") return category("gap");
  if (selected.contradictionCodes.length || selected.missingCodes.length) return category("contradiction");
  if (selected.forecastCategory === "Upside" && ["cross-sell-potential", "selective-whitespace"].includes(selected.accountAggregate.whitespaceCategory)) return category("growth");
  if (contexts.some((item) => item.priority === "Critical")) return category("portfolio-priority");
  return category("healthy");
}

const classifySignals = classifyDecisionRiskCategory;

function category(code) {
  if (!CANONICAL_RISK_CATEGORY_BY_CODE.has(code)) throw new TypeError(`Unknown canonical risk category: ${code}`);
  return code;
}

function contentFor(signal, page, context, contexts) {
  const base = detailsForSignal(signal, context, contexts);
  if (page === "meeting") return meetingContent(context);
  if (page === "portfolio") return portfolioContent(contexts, base);
  if (page === "action") return { ...base, inference: `Action sequencing: ${base.inference}` };
  if (page === "opportunity360") return { ...base, fact: [...base.fact, fact("Stage", context.stage, "safeContext.stage")] };
  if (page === "cockpit") return { ...base, inference: `Management view: ${base.inference}` };
  return base;
}

function detailsForSignal(signal, context, contexts) {
  const common = { confidence: "Medium", confidenceReason: "Deterministic assessment from sanitized categorical signals." };
  if (signal === "multi-risk" || signal === "portfolio-priority") return {
    ...common, priority: "Critical", fact: [fact("Priority", context.priority, "safeContext.priority"), fact("Progress", context.stagnationBand, "safeContext.stagnationBand")],
    inference: "Multiple safe signals indicate that this case should lead the management review queue.",
    evidence: [evidence("Progress signal", context.stagnationBand, "safeContext.stagnationBand"), evidence("Data quality", context.dataQualityCodes.join(", ") || "clear", "safeContext.dataQualityCodes")],
    actions: [action("Run an evidence review", "Resolve the highest-impact safe signals before changing the forecast.", "Owner token", "Within 2 days")],
  };
  if (signal === "stalled") return {
    priority: "High", confidence: "High", confidenceReason: "High-value and severe-stagnation bands are both present.",
    fact: [fact("Revenue band", context.revenueBand, "safeContext.revenueBand"), fact("Progress", context.stagnationBand, "safeContext.stagnationBand")],
    inference: "A high-value opportunity appears stalled and warrants a focused unblock review.",
    evidence: [evidence("Date status", context.relativeDateStatus, "safeContext.relativeDateStatus")],
    actions: [action("Confirm the next decision milestone", "A dated milestone can test whether the opportunity remains actionable.", "Owner token", "Within 3 days")],
  };
  if (signal === "gap") return {
    priority: "High", confidence: "High", confidenceReason: "The material variance category is derived from complete monthly aggregates.",
    fact: [fact("Budget band", context.budgetBand, "safeContext.budgetBand"), fact("Actual band", context.actualBand, "safeContext.actualBand")],
    inference: "Actual performance is materially below the sanitized budget range.",
    evidence: [evidence("Variance", context.varianceCategory, "safeContext.varianceCategory")],
    actions: [action("Review the recovery assumptions", "Reconcile the budget cadence with recorded actual bands.", "Owner token", "This week")],
  };
  if (signal === "contradiction") return {
    priority: "Medium", confidence: "Low", confidenceReason: "Contradictory or missing safe fields reduce decision confidence.",
    fact: [fact("Forecast", context.forecastCategory, "safeContext.forecastCategory"), fact("Readiness", context.decisionReadiness, "safeContext.decisionReadiness")],
    inference: "The forecast signal should be treated cautiously until the data contradiction is resolved.",
    evidence: [evidence("Contradictions", context.contradictionCodes.join(", ") || "none", "safeContext.contradictionCodes")],
    actions: [action("Resolve the flagged fields", "Improve data quality before relying on the forecast.", "Owner token", "Before forecast review")],
  };
  if (signal === "route") return {
    priority: "Medium", confidence: "Medium", confidenceReason: "Only internal route-consistency metadata is available.",
    fact: [fact("Mode", context.transportMode, "safeContext.transportMode"), fact("Route consistency", context.routeConsistency, "safeContext.routeConsistency")],
    inference: "The internal route configuration needs verification; no external disruption is asserted.",
    evidence: [evidence("Route check", context.routeConsistency, "safeContext.routeConsistency")],
    actions: [action("Verify routing master data", "Confirm the sanitized route combination with an authorized operator.", "Owner token", "Before quotation")],
  };
  if (signal === "growth") return growthContent(context);
  if (signal === "meeting") return meetingContent(context);
  return {
    priority: "Monitor", confidence: "High", confidenceReason: "Safe indicators are aligned and no escalation signal is present.",
    fact: [fact("Progress", context.stagnationBand, "safeContext.stagnationBand"), fact("Readiness", context.decisionReadiness, "safeContext.decisionReadiness")],
    inference: "The opportunity is progressing at a healthy cadence; continue normal monitoring.",
    evidence: [evidence("Data quality", context.dataQualityCodes.length ? "review" : "clear", "safeContext.dataQualityCodes")],
    actions: [action("Maintain the current cadence", "No risk escalation is supported by the safe evidence.", "Owner token", "Next scheduled review")],
  };
}

function growthContent(context) {
  const aggregate = context.accountAggregate;
  return {
    priority: "Medium", confidence: "Medium", confidenceReason: "Growth is a hypothesis based on account-level safe aggregates.",
    fact: [fact("Service coverage", aggregate.serviceCoverageBand, "safeContext.accountAggregate.serviceCoverageBand"), fact("Relationship", aggregate.relationshipMaturity, "safeContext.accountAggregate.relationshipMaturity")],
    inference: "Hypothesis: the account may support a targeted cross-sell conversation; validate with the account owner.",
    evidence: [evidence("Whitespace", aggregate.whitespaceCategory, "safeContext.accountAggregate.whitespaceCategory"), evidence("Trend", aggregate.opportunityTrend, "safeContext.accountAggregate.opportunityTrend")],
    actions: [action("Validate the whitespace hypothesis", "Use account planning to confirm whether the inferred service gap is real.", "Owner token", "Next account review")],
  };
}

function meetingContent(context) {
  return {
    priority: context.decisionReadiness === "low" ? "High" : "Medium",
    confidence: context.stakeholderCoverage === "complete" ? "High" : "Medium",
    confidenceReason: "Meeting guidance uses derived readiness signals only and excludes communication content.",
    fact: [fact("Meeting window", context.meetingWindow, "safeContext.meetingWindow"), fact("Stakeholder coverage", context.stakeholderCoverage, "safeContext.stakeholderCoverage")],
    inference: context.openQuestionCount ? "The meeting should focus on unresolved decision questions and stakeholder alignment." : "The meeting appears prepared; preserve the current agenda.",
    evidence: [evidence("Open questions", String(context.openQuestionCount), "safeContext.openQuestionCount"), evidence("Decision readiness", context.decisionReadiness, "safeContext.decisionReadiness")],
    actions: [action("Prepare a question-led agenda", "Address the safe open-question count without using communication transcripts.", "Owner token", "Before meeting")],
  };
}

function portfolioContent(contexts, base) {
  const critical = contexts.filter((item) => item.priority === "Critical").length;
  return {
    ...base,
    fact: [fact("Scoped opportunities", String(contexts.length), "safeAggregate.scopeCount"), fact("Escalated priority", String(critical), "safeAggregate.escalatedCount")],
    inference: critical ? "The scoped portfolio contains escalated cases that should be sequenced ahead of routine monitoring." : "The scoped portfolio has no escalation signal.",
    evidence: [evidence("Scope count", String(contexts.length), "safeAggregate.scopeCount"), evidence("Escalated count", String(critical), "safeAggregate.escalatedCount")],
  };
}

function fact(label, value, source) { return { label, value: String(value), source }; }
function evidence(label, value, source) { return { label, value: String(value), source }; }
function action(title, reason, owner, due) { return { title, reason, owner, due }; }
