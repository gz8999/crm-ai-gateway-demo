import crypto from "node:crypto";

export const D5_R2_WIN_CANARY = Object.freeze({
  phase: "Phase 1C-5R2G-D5-R2",
  opportunityToken: "DEMO-OPP-015",
  actualToken: "ACT-008",
  status: 3,
  actualEnd: "2026-05-01",
  subject: "[AI-DEMO] Win DEMO-OPP-015",
  description: "[AI-DEMO] DEMO-OPP-015 synthetic won reason: 02: 成本(运营).",
  expectedActualRevenue: 3898,
  maxActionAttempts: 1,
});

const GUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const FORBIDDEN_DESCRIPTION_PATTERN = /@|\b(?:phone|email|timeline|bpf|ai inference)\b/i;

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  const input = Buffer.isBuffer(value) || value instanceof Uint8Array ? value : typeof value === "string" ? value : canonicalJson(value);
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function normalizeId(value) {
  return String(value || "").replace(/[{}]/g, "").toLowerCase();
}

export function buildWinOpportunityPayload({ opportunityId, actualRevenue }) {
  const exactId = normalizeId(opportunityId);
  if (!/^[0-9a-f-]{36}$/.test(exactId)) throw new Error("Exact Opportunity ID is required");
  if (Number(actualRevenue) !== D5_R2_WIN_CANARY.expectedActualRevenue) throw new Error("Frozen Actual Revenue mismatch");

  const payload = {
    OpportunityClose: {
      "opportunityid@odata.bind": `/opportunities(${exactId})`,
      subject: D5_R2_WIN_CANARY.subject,
      actualrevenue: Number(actualRevenue),
      actualend: `${D5_R2_WIN_CANARY.actualEnd}T00:00:00Z`,
      description: D5_R2_WIN_CANARY.description,
    },
    Status: D5_R2_WIN_CANARY.status,
  };
  assertWinOpportunityPayload(payload);
  return payload;
}

export function assertWinOpportunityPayload(payload) {
  const close = payload?.OpportunityClose || {};
  if (Number(payload?.Status) !== D5_R2_WIN_CANARY.status) throw new Error("Win status must be 3");
  if (Number(close.actualrevenue) !== D5_R2_WIN_CANARY.expectedActualRevenue) throw new Error("Actual Revenue must use the frozen Actual value");
  if (String(close.actualend || "").slice(0, 10) !== D5_R2_WIN_CANARY.actualEnd) throw new Error("Actual End mismatch");
  if (close.subject !== D5_R2_WIN_CANARY.subject) throw new Error("Subject mismatch");
  if (close.description !== D5_R2_WIN_CANARY.description) throw new Error("Description mismatch");
  if (GUID_PATTERN.test(close.subject) || GUID_PATTERN.test(close.description)) throw new Error("Public text must not contain a GUID");
  if (FORBIDDEN_DESCRIPTION_PATTERN.test(close.description)) throw new Error("Description contains forbidden content");
  if (Object.keys(payload).some((key) => /^statecode$|^statuscode$|^actualclosedate$/i.test(key))) throw new Error("Direct close-field mutation is forbidden");
  return true;
}

export function protectedOpportunityBusinessHash(record, protectedFields) {
  const snapshot = Object.fromEntries(protectedFields.map((field) => [field, record?.[field] ?? null]));
  return sha256(snapshot);
}

export function classifyBpfCloseSideEffect(before, after) {
  if (!after || Number(after.instanceCount) !== 1 || Number(after.duplicateCount) !== 0 || Number(after.unexpectedProcessCount) !== 0) {
    return { code: "D", label: "BPF instance missing, duplicated, or unexpected process", severity: "P1", ready: false };
  }
  if (normalizeId(before.instanceId) !== normalizeId(after.instanceId)) {
    return { code: "D", label: "BPF instance identity changed", severity: "P1", ready: false };
  }
  if (normalizeId(before.activeStageId) !== normalizeId(after.activeStageId) || String(before.traversedPath || "") !== String(after.traversedPath || "")) {
    return { code: "C", label: "BPF stage or traversed path changed", severity: "P1", ready: false };
  }
  const platformStateChanged = Number(before.statecode) !== Number(after.statecode) || Number(before.statuscode) !== Number(after.statuscode) || String(before.modifiedon || "") !== String(after.modifiedon || "");
  if (platformStateChanged) return { code: "B", label: "Same instance; platform state/status/timestamp only", severity: "P2", ready: true };
  return { code: "A", label: "BPF Close Side Effect=None", severity: null, ready: true };
}

export function requestStatsAreSafe(stats) {
  return Number(stats.WinOpportunityAttempts) <= 1
    && Number(stats.LoseOpportunity || 0) === 0
    && Number(stats.PATCH || 0) === 0
    && Number(stats.DELETE || 0) === 0
    && Number(stats.Publish || 0) === 0
    && Number(stats.BPFWrites || 0) === 0
    && Number(stats.OtherStateActions || 0) === 0
    && Number(stats.ProductionRequests || 0) === 0
    && Number(stats.ExternalLLMCalls || 0) === 0;
}
