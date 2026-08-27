import {
  canonicalJson,
  normalizeId,
  protectedOpportunityBusinessHash,
  sha256,
} from "./d5-r2-win-canary-contract.mjs";

export { canonicalJson, normalizeId, protectedOpportunityBusinessHash, sha256 };

export const D5_R3_LOSE_CANARY = Object.freeze({
  phase: "Phase 1C-5R2G-D5-R3",
  desiredState: "丢单",
  actionType: "LoseOpportunity",
  initialStatus: 1,
  expectedLostState: 2,
  subjectPrefix: "[AI-DEMO] Lose ",
  maxActionAttempts: 1,
});

const GUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const FORBIDDEN_DESCRIPTION_PATTERN = /@|\b(?:phone|email|timeline|bpf|ai inference)\b/i;

export function excelDateToIsoDate(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial)) throw new Error("Frozen planned close date is required");
  return new Date((serial - 25569) * 86400000).toISOString().slice(0, 10);
}

export function selectFrozenLostCandidate({ stateActionPlan, pilotSelection, opportunityRows, opportunityDisplayRows, statusOptions }) {
  const lostGroups = (stateActionPlan?.groups || []).filter((group) => group.stateGroup === "Lost" && group.action === "LoseOpportunity");
  if (lostGroups.length !== 1 || Number(lostGroups[0].count) !== 9) throw new Error("Frozen State Action Plan Lost group mismatch");

  const pilotTokens = new Set(pilotSelection?.opportunityTokens || []);
  const candidates = (opportunityRows || []).filter((row) => pilotTokens.has(row._record_token) && row._desired_state === D5_R3_LOSE_CANARY.desiredState);
  if (candidates.length !== 1) throw new Error(`Lost Candidate Count must be 1, received ${candidates.length}`);
  const row = candidates[0];
  const display = (opportunityDisplayRows || []).find((item) => item._import_token === row._record_token);
  if (!display) throw new Error("Frozen display row is missing for Lost candidate");

  const statusMatches = (statusOptions || []).filter((option) => Number(option.state) === D5_R3_LOSE_CANARY.expectedLostState && option.labels?.["2052"] === row._desired_status);
  if (statusMatches.length !== 1) throw new Error("Lost Status Metadata Value is not unique");
  if (!Number.isFinite(Number(row.aigw_lostreason_choice)) || display["失注理由"] == null) throw new Error("Frozen lost reason is missing");
  if (display["状态"] !== D5_R3_LOSE_CANARY.desiredState || display["状态描述"] !== row._desired_status) throw new Error("Frozen Lost labels are inconsistent");

  return Object.freeze({
    opportunityToken: row._record_token,
    status: Number(statusMatches[0].value),
    statusLabel: row._desired_status,
    lostReasonValue: Number(row.aigw_lostreason_choice),
    lostReasonLabel: String(display["失注理由"]),
    actualEnd: excelDateToIsoDate(row.estimatedclosedate),
    actualEndSource: "estimatedclosedate",
    accountToken: row.parentaccountid_token,
    contactToken: row.parentcontactid_token,
    ownerToken: row.ownerid_token,
    departmentValue: Number(row.aigw_salesdepartment_choice),
  });
}

export function buildLoseOpportunityPayload({ opportunityId, candidate }) {
  const exactId = normalizeId(opportunityId);
  if (!/^[0-9a-f-]{36}$/.test(exactId)) throw new Error("Exact Opportunity ID is required");
  const subject = `${D5_R3_LOSE_CANARY.subjectPrefix}${candidate.opportunityToken}`;
  const description = `[AI-DEMO] ${candidate.opportunityToken} synthetic lost reason: ${candidate.lostReasonLabel}.`;
  const payload = {
    OpportunityClose: {
      "opportunityid@odata.bind": `/opportunities(${exactId})`,
      subject,
      actualend: `${candidate.actualEnd}T00:00:00Z`,
      description,
    },
    Status: Number(candidate.status),
  };
  assertLoseOpportunityPayload(payload, candidate);
  return payload;
}

export function assertLoseOpportunityPayload(payload, candidate) {
  const close = payload?.OpportunityClose || {};
  if (Number(payload?.Status) !== Number(candidate.status) || Number(candidate.status) <= 0) throw new Error("Lost status mismatch");
  if (String(close.actualend || "").slice(0, 10) !== candidate.actualEnd) throw new Error("Actual End mismatch");
  if (close.subject !== `${D5_R3_LOSE_CANARY.subjectPrefix}${candidate.opportunityToken}`) throw new Error("Subject mismatch");
  if (close.description !== `[AI-DEMO] ${candidate.opportunityToken} synthetic lost reason: ${candidate.lostReasonLabel}.`) throw new Error("Description mismatch");
  if (GUID_PATTERN.test(close.subject) || GUID_PATTERN.test(close.description)) throw new Error("Public text must not contain a GUID");
  if (FORBIDDEN_DESCRIPTION_PATTERN.test(close.description)) throw new Error("Description contains forbidden content");
  if ("actualrevenue" in close) throw new Error("LoseOpportunity must not invent Actual Revenue");
  if (Object.keys(payload).some((key) => /^statecode$|^statuscode$|^actualclosedate$/i.test(key))) throw new Error("Direct close-field mutation is forbidden");
  return true;
}

export function classifyBpfLoseSideEffect(before, after) {
  if (!after || Number(after.instanceCount) !== 1 || Number(after.duplicateCount) !== 0 || Number(after.unexpectedProcessCount) !== 0) {
    return { code: "D", label: "BPF instance missing, duplicated, or unexpected process", severity: "P1", ready: false };
  }
  if (normalizeId(before.instanceId) !== normalizeId(after.instanceId)) {
    return { code: "D", label: "BPF instance identity changed", severity: "P1", ready: false };
  }
  if (normalizeId(before.activeStageId) !== normalizeId(after.activeStageId) || String(before.traversedPath || "") !== String(after.traversedPath || "")) {
    return { code: "C", label: "BPF stage or traversed path changed", severity: "P1", ready: false };
  }
  const platformStateChanged = Number(before.statecode) !== Number(after.statecode)
    || Number(before.statuscode) !== Number(after.statuscode)
    || String(before.modifiedon || "") !== String(after.modifiedon || "");
  if (platformStateChanged) return { code: "B", label: "Same instance; platform state/status/timestamp only", severity: "P2", ready: true };
  return { code: "A", label: "BPF Lose Side Effect=None", severity: null, ready: true };
}

export function loseRequestStatsAreSafe(stats) {
  return Number(stats.LoseOpportunityAttempts) <= 1
    && Number(stats.WinOpportunity || 0) === 0
    && Number(stats.PATCH || 0) === 0
    && Number(stats.DELETE || 0) === 0
    && Number(stats.Publish || 0) === 0
    && Number(stats.BPFWrites || 0) === 0
    && Number(stats.OtherStateActions || 0) === 0
    && Number(stats.ProductionRequests || 0) === 0
    && Number(stats.ExternalLLMCalls || 0) === 0;
}
