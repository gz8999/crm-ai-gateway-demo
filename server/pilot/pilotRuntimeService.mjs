import { buildScenarioDecisionPack } from "../decision/deterministicProvider.mjs";
import { rankHealthScores, scoreOpportunityHealth } from "../../src/services/healthScoreEngine/index.js";
import { createPilotDataverseReader } from "./pilotDataverseReader.mjs";
import { assertFullPilotScope, buildPilotScope } from "./pilotSafeContext.mjs";
import { PILOT_DEFAULT_OPPORTUNITY, PILOT_DEPARTMENTS, PILOT_EXPECTED_COUNTS, hasGuid, resolvePilotDepartment } from "./pilotContract.mjs";

export function createPilotRuntimeService({ client, env = process.env, root = process.cwd(), now = () => new Date(), reader, buildScope = buildPilotScope, assertScope = assertFullPilotScope, defaultOpportunity = PILOT_DEFAULT_OPPORTUNITY, departments = PILOT_DEPARTMENTS, expectedCounts = PILOT_EXPECTED_COUNTS, sourceLabel = "D365 Pilot", showcaseTokens = [], startupDiagnostics = null } = {}) {
  const source = reader || createPilotDataverseReader({ client, env, root, now });
  const showcaseTokenSet = new Set(showcaseTokens);
  const runtimeTimeoutMs = resolveRuntimeTimeout(env);
  let snapshotPromise = null;
  let snapshotError = null;
  let runtimeState = "idle";

  async function snapshot() {
    if (runtimeState === "failed") throw snapshotError;
    if (!snapshotPromise) {
      runtimeState = "starting";
      startupDiagnostics?.runtimeStarting();
      snapshotPromise = withTimeout(Promise.resolve().then(() => source.read()), runtimeTimeoutMs)
        .then((data) => { runtimeState = "ready"; startupDiagnostics?.runtimeReady(); return data; })
        .catch((error) => { runtimeState = "failed"; snapshotError = error; startupDiagnostics?.runtimeFailed(); throw error; });
    }
    return snapshotPromise;
  }

  function initialize() { return snapshot(); }
  function retry() {
    if (runtimeState !== "failed") return snapshotPromise || snapshot();
    invalidate();
    return snapshot();
  }

  async function scope(department = "all") {
    const data = await snapshot();
    const result = buildScope(data, { department, now: now() });
    if (department === "all") assertScope(result);
    return { data, scope: result };
  }

  async function getPortfolio({ department = "all", opportunityToken = "", amountMode = "range", includeTimelineContent = false } = {}) {
    if (!new Set(["range", "exact"]).has(amountMode)) throw new TypeError("Unknown amount display mode.");
    const { data, scope: current } = await scope(department);
    const stableDefaultOpportunity = current.contexts.some((item) => item.opportunityToken === defaultOpportunity)
      ? defaultOpportunity
      : [...current.contexts].sort((left, right) => left.opportunityToken.localeCompare(right.opportunityToken))[0].opportunityToken;
    const selectedToken = opportunityToken || stableDefaultOpportunity;
    const selectedContext = current.contexts.find((item) => item.opportunityToken === selectedToken);
    if (!selectedContext) return null;
    const publicContext = includeTimelineContent ? selectedContext : withoutTimelineContent(selectedContext);
    const pack = buildScenarioDecisionPack(current.contexts, selectedContext);
    const healthScore = scoreOpportunityHealth(selectedContext);
    const healthRanking = rankHealthScores(current.contexts);
    const view = {
      mode: "portfolio",
      scenario: null,
      scopeSummary: summarize(current.contexts),
      defaultOpportunity: stableDefaultOpportunity,
      selectedOpportunity: selectedToken,
      opportunities: [...current.contexts].sort((left, right) => left.opportunityToken.localeCompare(right.opportunityToken)).map((item) => {
        const ranking = healthRanking.find((entry) => entry.opportunityToken === item.opportunityToken);
        const score = scoreOpportunityHealth(item);
        return {
          opportunityToken: item.opportunityToken,
          ownerToken: item.ownerToken,
          stage: item.stage,
          priority: item.priority,
          opportunityState: item.opportunityState,
          salesDepartment: item.salesDepartment,
          healthScore: ranking.healthScore,
          healthGrade: ranking.grade,
          healthRank: ranking.rank,
          mainDeductionDimension: lowestDimension(score.dimensions),
          scoreShowcase: showcaseTokenSet.has(item.opportunityToken),
          reviewRequired: item.routeConsistency === "review-required" || item.dataQualityCodes.length > 0,
        };
      }),
      safeContext: publicContext,
      safeContextKeys: Object.keys(publicContext).filter((key) => key !== "accountAggregate"),
      pack,
      healthScore,
      healthRanking,
      amountDisplay: buildAmountDisplay(current.exactAmounts.get(selectedToken), selectedContext, amountMode),
      runtime: runtimeMetadata(data, current, sourceLabel),
    };
    assertPublicResponse(view, { allowExactAmounts: amountMode === "exact" });
    return view;
  }

  async function getOpportunity({ opportunityToken, department = "all", amountMode = "range", includeTimelineContent = false } = {}) {
    const view = await getPortfolio({ department, opportunityToken, amountMode, includeTimelineContent });
    if (!view) return null;
    return {
      mode: view.mode,
      scenario: null,
      safeContext: view.safeContext,
      accountAggregate: view.safeContext.accountAggregate,
      opportunity360: view.pack.opportunity360,
      healthScore: view.healthScore,
      amountDisplay: view.amountDisplay,
      runtime: view.runtime,
    };
  }

  // Server-internal analysis path. This never backs a public route and is used
  // only after the deep-analysis service has applied its explicit mode gate.
  async function getAnalysisContext({ opportunityToken, department = "all" } = {}) {
    const { data, scope: current } = await scope(department);
    if (!current.contexts.some((item) => item.opportunityToken === opportunityToken)) return null;
    return { data, scope: current, opportunityToken };
  }

  async function getSafeContext({ opportunityToken, department = "all" } = {}) {
    const view = await getPortfolio({ department, opportunityToken, amountMode: "range" });
    if (!view) return null;
    const response = {
      opportunityToken: view.selectedOpportunity,
      safeContext: view.safeContext,
      safety: {
        customerIdentityMasked: true,
        exactAmountSentToModel: false,
        rawTimelineSent: false,
        crmWritebackEnabled: false,
        externalLlmEnabled: false,
      },
    };
    assertPublicResponse(response);
    return response;
  }

  async function getDecisionPack({ opportunityToken, department = "all" } = {}) {
    const view = await getPortfolio({ department, opportunityToken, amountMode: "range" });
    if (!view) return null;
    const response = { opportunityToken: view.selectedOpportunity, pack: view.pack, provider: "demo", externalModelCalled: false, crmWritebackEnabled: false };
    assertPublicResponse(response);
    return response;
  }

  async function getRuntimeStatus({ wait = true } = {}) {
    if (!wait && runtimeState !== "ready") {
      if (runtimeState === "idle") void snapshot().catch(() => undefined);
      return pendingRuntimeStatus({ sourceLabel, expectedCounts, departments, source, runtimeState: runtimeState === "idle" ? "starting" : runtimeState });
    }
    const { data, scope: all } = await scope("all");
    const departmentCounts = [];
    for (const department of departments) {
      const current = department.id === "all" ? all : buildScope(data, { department: department.id, now: now() });
      departmentCounts.push({ id: department.id, label: department.label, opportunityCount: current.counts.opportunity, stateDistribution: current.stateDistribution });
    }
    const response = {
      dataSource: "d365-pilot",
      label: sourceLabel,
      available: true,
      runtimeState,
      lastSyncTime: data.loadedAt,
      recordCount: all.counts.opportunity,
      counts: all.counts,
      stateDistribution: all.stateDistribution,
      departments: departmentCounts,
      expectedCounts,
      security: {
        hostnameAllowlist: true,
        pilotTokenAllowlist: true,
        getOnly: true,
        fallbackStatus: "disabled",
        customerIdentityMasked: true,
        exactAmountSentToModel: false,
        rawTimelineSent: false,
        crmWritebackEnabled: false,
        externalLlmEnabled: false,
        productionRequests: data.requestStats.ProductionRequests,
      },
      requestStats: data.requestStats,
    };
    assertPublicResponse(response);
    return response;
  }

  function invalidate() { snapshotPromise = null; snapshotError = null; runtimeState = "idle"; }
  return { getAnalysisContext, getDecisionPack, getOpportunity, getPortfolio, getRuntimeStatus, getSafeContext, initialize, invalidate, retry };
}

function pendingRuntimeStatus({ sourceLabel, expectedCounts, departments, source, runtimeState }) {
  return {
    dataSource: "d365-pilot",
    label: sourceLabel,
    available: false,
    runtimeState,
    lastSyncTime: "unknown",
    recordCount: 0,
    counts: {},
    stateDistribution: { active: 0, won: 0, lost: 0 },
    departments: departments.map((department) => ({ id: department.id, label: department.label, opportunityCount: 0, stateDistribution: { active: 0, won: 0, lost: 0 } })),
    expectedCounts,
    security: {
      hostnameAllowlist: true,
      pilotTokenAllowlist: true,
      getOnly: true,
      fallbackStatus: "disabled",
      customerIdentityMasked: true,
      exactAmountSentToModel: false,
      rawTimelineSent: false,
      crmWritebackEnabled: false,
      externalLlmEnabled: false,
      productionRequests: Number(source.requestStats?.ProductionRequests || 0),
    },
    requestStats: { ...(source.requestStats || {}) },
  };
}

function resolveRuntimeTimeout(env) {
  const value = Number(env.D365_FROZEN_RUNTIME_TIMEOUT_MS || 45000);
  return Number.isFinite(value) && value >= 1000 ? value : 45000;
}

function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error("D365 Frozen Dataset runtime initialization timed out.")), timeoutMs); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function lowestDimension(dimensions) {
  return Object.entries(dimensions).sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))[0][0];
}

function runtimeMetadata(snapshot, scope, sourceLabel) {
  const department = resolvePilotDepartment(scope.department.id);
  return {
    dataSource: "d365-pilot",
    sourceLabel,
    lastSyncTime: snapshot.loadedAt,
    recordCount: scope.counts.opportunity,
    fallbackStatus: "disabled",
    securityStatus: "safe-read-only",
    department: { id: department.id, label: department.label },
    completePilotScope: department.id === "all",
    counts: scope.counts,
    stateDistribution: scope.stateDistribution,
  };
}

function buildAmountDisplay(exact, context, mode) {
  if (mode === "exact") return { mode, currency: exact.currency, values: { estimatedValue: exact.estimatedValue, annualBudgetRevenue: exact.annualBudgetRevenue, annualBudgetMargin: exact.annualBudgetMargin, annualActualRevenue: exact.annualActualRevenue, actualValue: exact.actualValue } };
  return { mode, currency: "band", values: { estimatedValue: context.amountBand, annualBudgetRevenue: context.budgetBand, annualBudgetMargin: context.annualMarginBand, annualActualRevenue: context.actualBand, actualValue: context.actualBand } };
}

function summarize(contexts) {
  return {
    scopeCount: contexts.length,
    criticalCount: contexts.filter((item) => item.priority === "Critical").length,
    highCount: contexts.filter((item) => item.priority === "High").length,
    reviewRequiredCount: contexts.filter((item) => item.routeConsistency === "review-required" || item.dataQualityCodes.length).length,
  };
}

function withoutTimelineContent(context = {}) {
  const { timelineContentEvidence: _timelineContentEvidence, ...publicContext } = context;
  return publicContext;
}

function assertPublicResponse(value, { allowExactAmounts = false } = {}) {
  if (hasGuid(value)) throw new Error("Pilot response contains a Dataverse identifier.");
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ["primaryscenario", "golden", "annotationtext", "notetext", "description", "fullname", "emailaddress", "systemuserid", "teamid"]) {
    if (serialized.includes(forbidden)) throw new Error(`Pilot response contains forbidden runtime content: ${forbidden}.`);
  }
  if (!allowExactAmounts && /"(?:estimatedvalue|annualbudgetrevenue|annualbudgetmargin|annualactualrevenue|actualvalue)":\d/.test(serialized)) {
    throw new Error("Pilot Safe Context response contains an exact amount.");
  }
}
