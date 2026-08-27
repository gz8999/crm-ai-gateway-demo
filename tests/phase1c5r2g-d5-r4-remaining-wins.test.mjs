import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  D5_R4_REMAINING_WINS,
  assertRemainingWinPayload,
  buildRemainingWinPayload,
  classifyBpfCloseSideEffect,
  nextWinMayRun,
  remainingWinRequestStatsAreSafe,
  selectRemainingWinCandidates,
} from "../scripts/dataverse/lib/d5-r4-remaining-win-contract.mjs";

const root = new URL("../", import.meta.url);
const readText = async (path) => readFile(new URL(path, root), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));
const privateOpportunityId = "11111111-1111-4111-8111-111111111111";
const expected = [
  ["DEMO-OPP-028", "ACT-017", 45871, "2026-04-07", 2, "02: 成本(运营)"],
  ["DEMO-OPP-038", "ACT-021", 2102671, "2026-05-11", 11, "11: 系统(WMS/TMS/其他)"],
  ["DEMO-OPP-130", "ACT-084", 5634, "2026-07-08", 11, "11: 系统(WMS/TMS/其他)"],
  ["DEMO-OPP-135", "ACT-087", 4073, "2026-06-27", 10, "10: 物流质量"],
  ["DEMO-OPP-181", "ACT-117", 10872, "2026-08-19", 4, "04: 成本(FF)"],
  ["DEMO-OPP-199", "ACT-129", 183875, "2026-09-18", 12, "12: DX/可视化"],
];
const allWon = [
  ["DEMO-OPP-015", "ACT-008", 3898, "2026-05-01", 2, "02: 成本(运营)"],
  ...expected,
];
const isoToExcel = (date) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000) + 25569;

function frozenInputs() {
  const opportunityRows = allWon.map(([token, , , date, reason]) => ({
    _record_token: token,
    _desired_state: "赢单",
    _actual_close_date_for_action: isoToExcel(date),
    parentaccountid_token: `A-${token.slice(-3)}`,
    parentcontactid_token: `C-${token.slice(-3)}`,
    ownerid_token: "OWNER-DEMO-01",
    aigw_salesdepartment_choice: 6,
    aigw_wonreason_choice: reason,
  }));
  const opportunityDisplayRows = allWon.map(([token, , , , , reasonLabel]) => ({
    _import_token: token,
    "状态": "赢单",
    "受注理由": reasonLabel,
  }));
  const actualRows = allWon.map(([token, actualToken, revenue]) => ({
    _record_token: actualToken,
    aigw_opportunityid_token: token,
    aigw_aprilactualrevenue: revenue,
  }));
  const currentStateByToken = Object.fromEntries(allWon.map(([token]) => [token, {
    statecode: token === "DEMO-OPP-015" ? 1 : 0,
    statuscode: token === "DEMO-OPP-015" ? 3 : 1,
    actualclosedate: token === "DEMO-OPP-015" ? "2026-05-01" : null,
    opportunityCloseCount: token === "DEMO-OPP-015" ? 1 : 0,
  }]));
  return {
    stateActionPlan: { groups: [{ stateGroup: "Won", action: "WinOpportunity", count: 91 }] },
    pilotSelection: { opportunityTokens: [...allWon.map(([token]) => token), "DEMO-OPP-026"] },
    opportunityRows,
    opportunityDisplayRows,
    actualRows,
    statusOptions: [{ value: 3, state: 1, labels: { "2052": "赢单" } }],
    currentStateByToken,
  };
}

test("R4 selects exactly six remaining frozen Win candidates", () => {
  assert.equal(selectRemainingWinCandidates(frozenInputs()).length, 6);
});

test("R4 excludes the completed Win and Lose Canaries", () => {
  const candidates = selectRemainingWinCandidates(frozenInputs());
  assert.equal(candidates.some((row) => row.opportunityToken === "DEMO-OPP-015"), false);
  assert.equal(candidates.some((row) => row.opportunityToken === "DEMO-OPP-026"), false);
});

test("R4 executes candidates in stable token order", () => {
  const candidates = selectRemainingWinCandidates(frozenInputs());
  assert.deepEqual(candidates.map((row) => row.opportunityToken), expected.map(([token]) => token));
});

test("R4 freezes Actual tokens, revenue, dates, reasons, and Status 3", () => {
  const candidates = selectRemainingWinCandidates(frozenInputs());
  assert.deepEqual(candidates.map((row) => [row.opportunityToken, row.actualToken, row.actualRevenue, row.actualEnd, row.wonReasonValue, row.wonReasonLabel]), expected);
  assert.ok(candidates.every((candidate) => candidate.status === 3));
});

test("R4 rejects an eligible completed Canary", () => {
  const input = frozenInputs();
  input.currentStateByToken["DEMO-OPP-015"] = { statecode: 0, statuscode: 1, actualclosedate: null, opportunityCloseCount: 0 };
  assert.throws(() => selectRemainingWinCandidates(input), /Completed Canary/);
});

test("R4 rejects a missing or duplicate frozen Actual", () => {
  const missing = frozenInputs();
  missing.actualRows = missing.actualRows.filter((row) => row._record_token !== "ACT-017");
  assert.throws(() => selectRemainingWinCandidates(missing), /Actual Count/);
  const duplicate = frozenInputs();
  duplicate.actualRows.push({ ...duplicate.actualRows.find((row) => row._record_token === "ACT-017"), _record_token: "ACT-DUP" });
  assert.throws(() => selectRemainingWinCandidates(duplicate), /Actual Count/);
});

test("R4 rejects ambiguous Won status metadata", () => {
  const input = frozenInputs();
  input.statusOptions.push({ value: 3, state: 1, labels: { "2052": "赢单" } });
  assert.throws(() => selectRemainingWinCandidates(input), /uniquely/);
});

test("R4 official action payload contains only OpportunityClose and Status", () => {
  const candidate = selectRemainingWinCandidates(frozenInputs())[0];
  const payload = buildRemainingWinPayload({ opportunityId: privateOpportunityId, candidate });
  assert.equal(assertRemainingWinPayload(payload, candidate), true);
  assert.deepEqual(Object.keys(payload).sort(), ["OpportunityClose", "Status"]);
});

test("R4 never directly patches close fields", () => {
  const candidate = selectRemainingWinCandidates(frozenInputs())[0];
  const payload = buildRemainingWinPayload({ opportunityId: privateOpportunityId, candidate });
  for (const field of ["statecode", "statuscode", "actualclosedate"]) assert.equal(field in payload, false);
});

test("R4 permits no more than six Win attempts and no other writes", () => {
  const safe = { WinOpportunityAttempts: 6, LoseOpportunity: 0, BusinessRecordPOST: 0, PATCH: 0, DELETE: 0, Publish: 0, BPFWrites: 0, OtherStateActions: 0, ProductionRequests: 0, ExternalLLMCalls: 0 };
  assert.equal(remainingWinRequestStatsAreSafe(safe), true);
  for (const mutation of [{ WinOpportunityAttempts: 7 }, { LoseOpportunity: 1 }, { BusinessRecordPOST: 1 }, { PATCH: 1 }, { DELETE: 1 }, { Publish: 1 }, { BPFWrites: 1 }, { ProductionRequests: 1 }, { ExternalLLMCalls: 1 }]) {
    assert.equal(remainingWinRequestStatsAreSafe({ ...safe, ...mutation }), false);
  }
});

test("R4 continues only after an A-class complete readback", () => {
  const bpf = { instanceId: privateOpportunityId, activeStageId: privateOpportunityId, traversedPath: privateOpportunityId, statecode: 0, statuscode: 1, modifiedon: "same", instanceCount: 1, duplicateCount: 0, unexpectedProcessCount: 0 };
  const a = classifyBpfCloseSideEffect(bpf, bpf);
  const b = classifyBpfCloseSideEffect(bpf, { ...bpf, statecode: 1, statuscode: 2 });
  assert.equal(nextWinMayRun({ gates: { readback: true, integrity: true }, bpfClassification: a }), true);
  assert.equal(nextWinMayRun({ gates: { readback: true, integrity: true }, bpfClassification: b }), false);
  assert.equal(nextWinMayRun({ gates: { readback: false }, bpfClassification: a }), false);
});

test("public ledger records six one-attempt HTTP 204 A-class successes", async () => {
  const ledger = await readJson("docs/d365/d365-ai-demo-200-d5-r4-state-action-ledger-public.json");
  assert.equal(ledger.actions.length, 6);
  assert.ok(ledger.actions.every((row) => row.attemptCount === 1 && row.httpStatus === 204 && row.success === true && row.bpfClassification === "A"));
});

test("OpportunityClose final ledger is seven Win plus one Lose without attachments", async () => {
  const close = await readJson("docs/d365/d365-ai-demo-200-d5-r4-opportunity-close-readback.json");
  assert.deepEqual(close.summary, { winCloseCount: 7, loseCloseCount: 1, totalCloseCount: 8, attachmentCount: 0, duplicateCloseCount: 0, exactIdsStoredOnlyInPrivateManifest: true });
});

test("final Pilot distribution is Won 7, Active 16, Lost 1", async () => {
  const final = await readJson("docs/d365/d365-ai-demo-200-d5-r4-final-pilot-readback.json");
  assert.deepEqual(final.opportunityStateDistribution, { won: 7, active: 16, lost: 1 });
});

test("final imported Timeline, Signal, Actual, Coverage, and explicit counts remain frozen", async () => {
  const final = await readJson("docs/d365/d365-ai-demo-200-d5-r4-final-pilot-readback.json");
  assert.equal(final.explicitPilotRecords, 427);
  assert.deepEqual(final.entityCounts, { account: 7, contact: 9, opportunity: 24, serviceCoverage: 15, actualManagement: 12, timeline: 206, interactionSignal: 154 });
});

test("all 24 BPF instances retain identity cardinality and initial stage", async () => {
  const bpf = await readJson("docs/d365/d365-ai-demo-200-d5-r4-bpf-integrity-summary.json");
  assert.deepEqual(bpf.after, { targetInstanceCount: 24, duplicateCount: 0, unexpectedProcessCount: 0, initialStageCount: 24 });
  assert.equal(bpf.definitionHashBefore, bpf.definitionHashAfter);
  assert.equal(bpf.processOrder, 0);
});

test("non-target protected business hash and Plugin remain unchanged", async () => {
  const final = await readJson("docs/d365/d365-ai-demo-200-d5-r4-final-pilot-readback.json");
  assert.equal(final.protectedBusinessHash.before, final.protectedBusinessHash.after);
  assert.equal(final.protectedBusinessHash.mismatchCount, 0);
  assert.deepEqual(final.plugin, { enabled: 7, disabled: 0 });
});

test("cleanup contract covers all eight closes but remains unauthorized", async () => {
  const cleanup = await readJson("docs/d365/d365-ai-demo-200-d5-r1a-cleanup-contract.json");
  assert.equal(cleanup.stateActionArtifacts.currentOpportunityCloseCount, 8);
  assert.equal(cleanup.stateActionArtifacts.records.length, 8);
  assert.equal(cleanup.cleanupAuthorized, false);
  assert.equal(cleanup.cleanupExecuted, false);
});

test("private manifest path is ignored and public R4 artifacts contain no GUID", async () => {
  const gitignore = await readText(".gitignore");
  assert.match(gitignore, /^local-artifacts\/$/m);
  const files = [
    "docs/d365/d365-ai-demo-200-d5-r4-remaining-win-report.md",
    "docs/d365/d365-ai-demo-200-d5-r4-validation-manifest.json",
    "docs/d365/d365-ai-demo-200-d5-r4-state-action-ledger-public.json",
    "docs/d365/d365-ai-demo-200-d5-r4-opportunity-close-readback.json",
    "docs/d365/d365-ai-demo-200-d5-r4-bpf-integrity-summary.json",
    "docs/d365/d365-ai-demo-200-d5-r4-final-pilot-readback.json",
    "docs/d365/d365-ai-demo-200-d5-r5-final-acceptance-plan-zh.md",
  ];
  const text = (await Promise.all(files.map(readText))).join("\n");
  assert.doesNotMatch(text, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
});

test("validation manifest proves production isolation and leaves Full Import false", async () => {
  const manifest = await readJson("docs/d365/d365-ai-demo-200-d5-r4-validation-manifest.json");
  assert.equal(manifest.requests.productionRequests, 0);
  assert.equal(manifest.requests.externalLlmCalls, 0);
  assert.equal(manifest.requests.patch, 0);
  assert.equal(manifest.requests.delete, 0);
  assert.equal(manifest.requests.publish, 0);
  assert.equal(manifest.gates.pilotImportCompleted, true);
  assert.equal(manifest.gates.pilotCleanupAuthorized, false);
  assert.equal(manifest.gates.fullImportStarted, false);
  assert.equal(manifest.gates.fullImportReady, false);
});
