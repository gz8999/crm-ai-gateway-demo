import {
  canonicalJson,
  classifyBpfCloseSideEffect,
  normalizeId,
  protectedOpportunityBusinessHash,
  sha256,
} from "./d5-r2-win-canary-contract.mjs";

export { canonicalJson, classifyBpfCloseSideEffect, normalizeId, protectedOpportunityBusinessHash, sha256 };

export const D5_R4_REMAINING_WINS = Object.freeze({
  phase: "Phase 1C-5R2G-D5-R4",
  desiredState: "赢单",
  status: 3,
  maxActionAttempts: 6,
  completedCanaryTokens: Object.freeze(["DEMO-OPP-015", "DEMO-OPP-026"]),
});

export const ACTUAL_REVENUE_FIELDS = Object.freeze([
  "aigw_aprilactualrevenue",
  "aigw_mayactualrevenue",
  "aigw_juneactualrevenue",
  "aigw_julyactualrevenue",
  "aigw_augustactualrevenue",
  "aigw_septemberactualrevenue",
  "aigw_octoberactualrevenue",
  "aigw_novemberactualrevenue",
  "aigw_decemberactualrevenue",
  "aigw_januaryactualrevenue",
  "aigw_februaryactualrevenue",
  "aigw_marchactualrevenue",
]);

const GUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const FORBIDDEN_DESCRIPTION_PATTERN = /@|\b(?:phone|email|timeline|bpf|ai inference)\b/i;

export function excelDateToIsoDate(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial)) throw new Error("Frozen Actual End is required");
  return new Date((serial - 25569) * 86400000).toISOString().slice(0, 10);
}

export function frozenAnnualActualRevenue(actualRow) {
  if (!actualRow) throw new Error("Frozen Actual row is required");
  const values = ACTUAL_REVENUE_FIELDS.map((field) => Number(actualRow[field] ?? 0));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Frozen Actual Revenue contains an invalid month");
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) throw new Error("Frozen Actual Revenue must be positive");
  return total;
}

export function selectRemainingWinCandidates({
  stateActionPlan,
  pilotSelection,
  opportunityRows,
  opportunityDisplayRows,
  actualRows,
  statusOptions,
  currentStateByToken,
}) {
  const wonGroups = (stateActionPlan?.groups || []).filter((group) => group.stateGroup === "Won" && group.action === "WinOpportunity");
  if (wonGroups.length !== 1 || Number(wonGroups[0].count) !== 91) throw new Error("Frozen State Action Plan Won group mismatch");
  const wonStatus = (statusOptions || []).filter((option) => Number(option.value) === D5_R4_REMAINING_WINS.status && Number(option.state) === 1);
  if (wonStatus.length !== 1) throw new Error("Won Status Metadata Value must uniquely resolve to 3");

  const pilotTokens = new Set(pilotSelection?.opportunityTokens || []);
  const planned = (opportunityRows || [])
    .filter((row) => pilotTokens.has(row._record_token) && row._desired_state === D5_R4_REMAINING_WINS.desiredState)
    .sort((a, b) => a._record_token.localeCompare(b._record_token));
  if (planned.length !== 7) throw new Error(`Frozen Pilot Won candidate count must be 7, received ${planned.length}`);

  const candidates = planned.filter((row) => {
    const state = currentStateByToken?.[row._record_token];
    return Number(state?.statecode) === 0
      && Number(state?.statuscode) === 1
      && state?.actualclosedate == null
      && Number(state?.opportunityCloseCount) === 0;
  }).map((row) => {
    if (D5_R4_REMAINING_WINS.completedCanaryTokens.includes(row._record_token)) throw new Error(`Completed Canary remained eligible: ${row._record_token}`);
    const matchingActuals = (actualRows || []).filter((actual) => actual.aigw_opportunityid_token === row._record_token);
    if (matchingActuals.length !== 1) throw new Error(`Frozen Actual Count must be 1 for ${row._record_token}`);
    const display = (opportunityDisplayRows || []).find((item) => item._import_token === row._record_token);
    if (!display || display["状态"] !== D5_R4_REMAINING_WINS.desiredState || !display["受注理由"]) throw new Error(`Frozen Win display facts are missing for ${row._record_token}`);
    const actual = matchingActuals[0];
    return Object.freeze({
      opportunityToken: row._record_token,
      actualToken: actual._record_token,
      actualRevenue: frozenAnnualActualRevenue(actual),
      actualEnd: excelDateToIsoDate(row._actual_close_date_for_action),
      actualEndSource: "_actual_close_date_for_action",
      wonReasonValue: Number(row.aigw_wonreason_choice),
      wonReasonLabel: String(display["受注理由"]),
      accountToken: row.parentaccountid_token,
      contactToken: row.parentcontactid_token,
      ownerToken: row.ownerid_token,
      departmentValue: Number(row.aigw_salesdepartment_choice),
      status: D5_R4_REMAINING_WINS.status,
    });
  });

  if (candidates.length !== 6) throw new Error(`Remaining Win Candidate Count must be 6, received ${candidates.length}`);
  return Object.freeze(candidates);
}

export function buildRemainingWinPayload({ opportunityId, candidate }) {
  const exactId = normalizeId(opportunityId);
  if (!/^[0-9a-f-]{36}$/.test(exactId)) throw new Error("Exact Opportunity ID is required");
  const payload = {
    OpportunityClose: {
      "opportunityid@odata.bind": `/opportunities(${exactId})`,
      subject: `[AI-DEMO] Win ${candidate.opportunityToken}`,
      actualrevenue: Number(candidate.actualRevenue),
      actualend: `${candidate.actualEnd}T00:00:00Z`,
      description: `[AI-DEMO] ${candidate.opportunityToken} synthetic won reason: ${candidate.wonReasonLabel}.`,
    },
    Status: D5_R4_REMAINING_WINS.status,
  };
  assertRemainingWinPayload(payload, candidate);
  return payload;
}

export function assertRemainingWinPayload(payload, candidate) {
  const close = payload?.OpportunityClose || {};
  if (Number(payload?.Status) !== 3 || Number(candidate.status) !== 3) throw new Error("Win Status must be 3");
  if (Number(close.actualrevenue) !== Number(candidate.actualRevenue)) throw new Error("Actual Revenue must use the frozen Actual value");
  if (String(close.actualend || "").slice(0, 10) !== candidate.actualEnd) throw new Error("Actual End must use the frozen action date");
  if (close.subject !== `[AI-DEMO] Win ${candidate.opportunityToken}`) throw new Error("Subject mismatch");
  if (close.description !== `[AI-DEMO] ${candidate.opportunityToken} synthetic won reason: ${candidate.wonReasonLabel}.`) throw new Error("Description mismatch");
  if (GUID_PATTERN.test(close.subject) || GUID_PATTERN.test(close.description)) throw new Error("Public text must not contain a GUID");
  if (FORBIDDEN_DESCRIPTION_PATTERN.test(close.description)) throw new Error("Description contains forbidden content");
  if (Object.keys(payload).some((key) => /^(?:statecode|statuscode|actualclosedate)$/i.test(key))) throw new Error("Direct close-field mutation is forbidden");
  return true;
}

export function remainingWinRequestStatsAreSafe(stats) {
  return Number(stats.WinOpportunityAttempts || 0) <= D5_R4_REMAINING_WINS.maxActionAttempts
    && Number(stats.LoseOpportunity || 0) === 0
    && Number(stats.BusinessRecordPOST || 0) === 0
    && Number(stats.PATCH || 0) === 0
    && Number(stats.DELETE || 0) === 0
    && Number(stats.Publish || 0) === 0
    && Number(stats.BPFWrites || 0) === 0
    && Number(stats.OtherStateActions || 0) === 0
    && Number(stats.ProductionRequests || 0) === 0
    && Number(stats.ExternalLLMCalls || 0) === 0;
}

export function nextWinMayRun({ gates, bpfClassification }) {
  return Object.values(gates || {}).every(Boolean) && bpfClassification?.code === "A";
}
