import { createHash } from "node:crypto";

export const D5_R5_EXPECTED = Object.freeze({
  explicitRecords: 427,
  entities: Object.freeze({
    Account: 7,
    Contact: 9,
    Opportunity: 24,
    ServiceCoverage: 15,
    ActualManagement: 12,
    Timeline: 206,
    InteractionSignal: 154,
  }),
  states: Object.freeze({ Won: 7, Active: 16, Lost: 1 }),
  opportunityClose: Object.freeze({ Win: 7, Lose: 1, Total: 8 }),
  bpf: Object.freeze({ targetInstances: 24, initialStage: 24, duplicate: 0, unexpected: 0, processOrder: 0 }),
  plugin: Object.freeze({ enabled: 7, disabled: 0 }),
});

export const D5_R5_UI_SAMPLES = Object.freeze([
  Object.freeze({ token: "DEMO-OPP-015", department: "06: FF", expectedState: "Won", service: "FF" }),
  Object.freeze({ token: "DEMO-OPP-026", department: "06: FF", expectedState: "Lost", service: "FF" }),
  Object.freeze({ token: "DEMO-OPP-133", department: "01: Dept1(Industry)", expectedState: "Active", service: "Warehouse" }),
  Object.freeze({ token: "DEMO-OPP-038", department: "02: Dept1(Distribution)", expectedState: "Won", service: "Warehouse" }),
  Object.freeze({ token: "DEMO-OPP-194", department: "03: Dept2(LCMS)", expectedState: "Active", service: "LCMS" }),
  Object.freeze({ token: "DEMO-OPP-085", department: "04: Dept3(Project Cargo)", expectedState: "Active", service: "Project Cargo" }),
  Object.freeze({ token: "DEMO-OPP-081", department: "05: Dept3(Dangerous Goods)", expectedState: "Active", service: "Dangerous Goods" }),
  Object.freeze({ token: "DEMO-OPP-056", department: "91: Others", expectedState: "Active", service: "Other" }),
]);

export const D5_R5_SCENARIOS = Object.freeze([
  "stalled-high-value",
  "budget-actual-gap",
  "data-contradiction",
  "growth-opportunity",
  "location-route-risk",
  "meeting-prep",
  "multi-risk-priority",
  "healthy-control",
]);

const MONTHLY_ACTUAL_REVENUE_FIELDS = Object.freeze([
  "aigw_aprilactualrevenue", "aigw_mayactualrevenue", "aigw_juneactualrevenue", "aigw_julyactualrevenue",
  "aigw_augustactualrevenue", "aigw_septemberactualrevenue", "aigw_octoberactualrevenue", "aigw_novemberactualrevenue",
  "aigw_decemberactualrevenue", "aigw_januaryactualrevenue", "aigw_februaryactualrevenue", "aigw_marchactualrevenue",
]);

const SAFE_CONTEXT_KEYS = new Set([
  "opportunityToken", "accountToken", "department", "state", "status", "bpfStage", "amountBands", "varianceBand",
  "coverageCategories", "interactionSignals", "timelineEvidence", "relativeDateSignals", "evidenceTokens", "closeEvidence", "safety",
]);

const FORBIDDEN_CONTEXT_KEY = /(scenario|golden|customername|contact|owner|team|userid|systemuser|guid|exactamount|rawtimeline|timelinebody|notetext|description|opportunityclosebody)/i;
const GUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function normalizeId(value) {
  return String(value || "").replace(/[{}]/g, "").toLowerCase();
}

export function classifyAmountBand(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "none";
  if (amount < 100_000) return "under-100k";
  if (amount < 500_000) return "100k-500k";
  if (amount < 2_000_000) return "500k-2m";
  return "over-2m";
}

export function classifyVarianceBand(budget, actual) {
  const safeBudget = Number(budget || 0);
  const safeActual = Number(actual || 0);
  if (safeBudget <= 0) return "not-applicable";
  const ratio = (safeActual - safeBudget) / safeBudget;
  if (ratio <= -0.4) return "material-negative";
  if (ratio <= -0.15) return "negative";
  if (ratio >= 0.15) return "positive";
  return "on-plan";
}

export function excelDateToIso(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return new Date((value - 25569) * 86400000).toISOString().slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function relativeDateCategory(value, businessDate = "2027-01-15") {
  const iso = excelDateToIso(value);
  if (!iso) return "unknown";
  const days = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${businessDate}T00:00:00Z`)) / 86400000);
  if (days < -30) return "historical";
  if (days < 0) return "recent-past";
  if (days <= 14) return "near-term";
  return "future";
}

export function validateCoverageWindows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.aigw_accountid_token}|${row.aigw_servicetype}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const conflicts = [];
  for (const [key, items] of groups) {
    const dated = items
      .map((row) => ({ token: row._record_token, start: excelDateToIso(row.aigw_startdate), end: excelDateToIso(row.aigw_enddate) }))
      .filter((row) => row.start)
      .sort((a, b) => a.start.localeCompare(b.start));
    for (let index = 1; index < dated.length; index += 1) {
      const prior = dated[index - 1];
      const current = dated[index];
      if (!prior.end || current.start <= prior.end) conflicts.push({ key, firstToken: prior.token, secondToken: current.token });
    }
  }
  return { ready: conflicts.length === 0, conflictCount: conflicts.length, conflicts };
}

export function buildPilotSafeContexts({ workbook, pilotTokens, scenarioByToken, runtime }) {
  const tokenSet = new Set(pilotTokens);
  const opportunityRows = indexRows(workbook.sheets.Opportunity.formalRows, "_record_token");
  const opportunityDisplay = indexRows(workbook.sheets.Opportunity.pilotRows, "_import_token");
  const actualRows = groupRows(workbook.sheets.ActualManagement.formalRows, "aigw_opportunityid_token");
  const coverageRows = groupRows(workbook.sheets.ServiceCoverage.pilotRows, "account_token");
  const timelineRows = groupRows(workbook.sheets.Timeline.pilotRows, "regarding_opportunity_token");
  const signalRows = groupRows(workbook.sheets.InteractionSignal.pilotRows, "opportunity_token");
  const stateByToken = new Map((runtime.states || []).map((row) => [row.token, row]));
  const bpfByToken = new Map((runtime.bpfRows || []).map((row) => [row.token, row]));
  const closeByToken = new Map((runtime.closeRows || []).map((row) => [row.token, row]));
  const contexts = [];

  for (const token of [...tokenSet].sort()) {
    const opportunity = opportunityRows.get(token);
    const display = opportunityDisplay.get(token);
    if (!opportunity || !display) throw new Error(`Frozen Opportunity row missing: ${token}`);
    const accountToken = opportunity.parentaccountid_token;
    const actual = actualRows.get(token)?.[0] || null;
    const budget = Number(opportunity.aigw_yearrevenuebudget || 0);
    const actualTotal = actual ? MONTHLY_ACTUAL_REVENUE_FIELDS.reduce((sum, field) => sum + Number(actual[field] || 0), 0) : 0;
    const state = stateByToken.get(token);
    const bpf = bpfByToken.get(token);
    const close = closeByToken.get(token);
    const timeline = timelineRows.get(token) || [];
    const signals = signalRows.get(token) || [];
    const coverage = coverageRows.get(accountToken) || [];
    const stateLabel = Number(state?.statecode) === 1 ? "Won" : Number(state?.statecode) === 2 ? "Lost" : "Active";
    const context = {
      opportunityToken: token,
      accountToken,
      department: display["销售部门"],
      state: stateLabel,
      status: Number(state?.statuscode),
      bpfStage: bpf?.activeStageAlias || "unknown",
      amountBands: { budget: classifyAmountBand(budget), actual: classifyAmountBand(actualTotal) },
      varianceBand: classifyVarianceBand(budget, actualTotal),
      coverageCategories: coverage.map((row) => ({
        evidenceToken: row._import_token,
        serviceType: row._service_type_metadata_label,
        coverageStatus: row._coverage_status_metadata_label,
        revenueBand: row._revenue_band_metadata_label,
        marginBand: row._margin_band_metadata_label,
      })),
      interactionSignals: signals.map((row) => ({
        evidenceToken: row._import_token,
        sourceActivityToken: row.source_activity_token,
        activityType: row.activity_type,
        resultCategory: row.result_category,
        responseLevel: row.customer_response_level,
        sentiment: row.sentiment,
        budgetMentioned: Boolean(row.budget_mentioned),
        decisionMakerInvolved: Boolean(row.decision_maker_involved),
        objectionPresent: Boolean(row.objection_present),
        competitorMentioned: Boolean(row.competitor_mentioned),
        commitmentMade: Boolean(row.commitment_made),
      })),
      timelineEvidence: timeline.map((row) => ({
        evidenceToken: row._import_token,
        activityType: row.activity_type,
        relativeDateCategory: relativeDateCategory(row.activity_date),
      })),
      relativeDateSignals: {
        estimatedClose: relativeDateCategory(opportunity.estimatedclosedate),
        lastInteraction: relativeDateCategory(timeline.at(-1)?.activity_date),
      },
      evidenceTokens: [...coverage.map((row) => row._import_token), ...signals.map((row) => row._import_token), ...timeline.map((row) => row._import_token)],
      closeEvidence: { present: Boolean(close?.count), outcome: close?.outcome || "none" },
      safety: {
        customerIdentityMasked: true,
        exactAmountSentToModel: false,
        rawTimelineSent: false,
        crmWritebackEnabled: false,
        externalLlmEnabled: false,
      },
    };
    assertSafeContext(context);
    contexts.push(context);
  }

  const scenarioCoverage = buildScenarioCoverage({ contexts, scenarioByToken });
  return { contexts, scenarioCoverage };
}

export function buildScenarioCoverage({ contexts, scenarioByToken }) {
  const byToken = new Map(contexts.map((context) => [context.opportunityToken, context]));
  return D5_R5_SCENARIOS.map((scenarioId) => {
    const tokens = Object.entries(scenarioByToken)
      .filter(([token, scenario]) => scenario === scenarioId && byToken.has(token))
      .map(([token]) => token)
      .sort();
    return {
      scenarioId,
      opportunityTokens: tokens,
      evidenceReady: tokens.some((token) => scenarioEvidenceReady(scenarioId, byToken.get(token))),
    };
  });
}

export function scenarioEvidenceReady(scenarioId, context) {
  if (!context) return false;
  if (scenarioId === "stalled-high-value") return context.amountBands.budget !== "none" && context.relativeDateSignals.estimatedClose !== "unknown";
  if (scenarioId === "budget-actual-gap") return context.amountBands.budget !== "none" && context.varianceBand !== "not-applicable";
  if (scenarioId === "data-contradiction") return context.interactionSignals.length > 0;
  if (scenarioId === "growth-opportunity") return context.coverageCategories.length > 0;
  if (scenarioId === "location-route-risk") return context.timelineEvidence.length > 0 && context.department.length > 0;
  if (scenarioId === "meeting-prep") return context.timelineEvidence.length > 0 && context.interactionSignals.length > 0;
  if (scenarioId === "multi-risk-priority") return context.timelineEvidence.length > 0 && context.coverageCategories.length > 0 && context.interactionSignals.length > 0;
  if (scenarioId === "healthy-control") return context.state === "Active" && context.timelineEvidence.length > 0;
  return false;
}

export function assertSafeContext(context) {
  for (const key of Object.keys(context)) {
    if (!SAFE_CONTEXT_KEYS.has(key)) throw new Error(`Unexpected Safe Context key: ${key}`);
  }
  const serialized = JSON.stringify(context);
  if (GUID_PATTERN.test(serialized)) throw new Error("Safe Context contains a Dataverse GUID");
  if (containsForbiddenKey(context)) throw new Error("Safe Context contains a forbidden key");
  if (context.safety?.customerIdentityMasked !== true) throw new Error("Customer identity must be masked");
  if (context.safety?.exactAmountSentToModel !== false) throw new Error("Exact amounts must remain excluded");
  if (context.safety?.rawTimelineSent !== false) throw new Error("Raw Timeline must remain excluded");
  if (context.safety?.crmWritebackEnabled !== false) throw new Error("CRM writeback must remain disabled");
  if (context.safety?.externalLlmEnabled !== false) throw new Error("External LLM must remain disabled");
  return true;
}

export function readOnlyRequestStatsAreSafe(requests) {
  return Number(requests.POST || 0) === 0
    && Number(requests.PATCH || 0) === 0
    && Number(requests.DELETE || 0) === 0
    && Number(requests.Publish || 0) === 0
    && Number(requests.WinOpportunity || 0) === 0
    && Number(requests.LoseOpportunity || 0) === 0
    && Number(requests.BPFWrites || 0) === 0
    && Number(requests.Cleanup || 0) === 0
    && Number(requests.FullImport || 0) === 0
    && Number(requests.ProductionRequests || 0) === 0
    && Number(requests.ExternalLLMCalls || 0) === 0
    && Number(requests.CRMWriteback || 0) === 0;
}

function containsForbiddenKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  return Object.entries(value).some(([key, nested]) => {
    if ((key === "exactAmountSentToModel" || key === "rawTimelineSent") && nested === false) return false;
    return FORBIDDEN_CONTEXT_KEY.test(key) || containsForbiddenKey(nested);
  });
}

function indexRows(rows, key) {
  return new Map(rows.map((row) => [row[key], row]));
}

function groupRows(rows, key) {
  const groups = new Map();
  for (const row of rows) groups.set(row[key], [...(groups.get(row[key]) || []), row]);
  return groups;
}
