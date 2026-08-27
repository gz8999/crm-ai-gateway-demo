import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  D5_R3_LOSE_CANARY,
  assertLoseOpportunityPayload,
  buildLoseOpportunityPayload,
  classifyBpfLoseSideEffect,
  loseRequestStatsAreSafe,
  selectFrozenLostCandidate,
} from "../scripts/dataverse/lib/d5-r3-lose-canary-contract.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const privateOpportunityId = "11111111-1111-4111-8111-111111111111";
const publicArtifacts = [
  "docs/d365/d365-ai-demo-200-d5-r3-lose-canary-report.md",
  "docs/d365/d365-ai-demo-200-d5-r3-validation-manifest.json",
  "docs/d365/d365-ai-demo-200-d5-r3-state-action-ledger-public.json",
  "docs/d365/d365-ai-demo-200-d5-r3-opportunity-close-readback.json",
  "docs/d365/d365-ai-demo-200-d5-r3-bpf-before-after.json",
  "docs/d365/d365-ai-demo-200-d5-r3-business-integrity-summary.json",
  "docs/d365/d365-ai-demo-200-d5-r4-remaining-win-decision-pack-zh.md",
];
const guidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

async function frozenInputs() {
  const [stateActionPlan, pilotSelection, workbook, metadata] = await Promise.all([
    readJson("docs/d365/d365-ai-demo-200-state-action-plan.json"),
    readJson("docs/d365/d365-ai-demo-200-pilot-selection-final.json"),
    readJson("local-artifacts/d365/d5-workbook-inspection.json"),
    readJson("local-artifacts/d365/d365-ai-demo-200-d5-preflight-private.json"),
  ]);
  return {
    stateActionPlan,
    pilotSelection,
    opportunityRows: workbook.sheets.Opportunity.formalRows,
    opportunityDisplayRows: workbook.sheets.Opportunity.pilotRows,
    statusOptions: metadata.statusOptions,
  };
}

test("D5-R3 selects the sole Lost candidate from the frozen plan and Pilot", async () => {
  const candidate = selectFrozenLostCandidate(await frozenInputs());
  assert.deepEqual(candidate, {
    opportunityToken: "DEMO-OPP-026",
    status: 4,
    statusLabel: "已取消",
    lostReasonValue: 7,
    lostReasonLabel: "07: 提案细节",
    actualEnd: "2026-05-18",
    actualEndSource: "estimatedclosedate",
    accountToken: "A-040",
    contactToken: "C-080",
    ownerToken: "OWNER-DEMO-02",
    departmentValue: 6,
  });
  assert.equal(D5_R3_LOSE_CANARY.maxActionAttempts, 1);
});

test("D5-R3 blocks zero or multiple Lost candidates and non-unique status metadata", async () => {
  const input = await frozenInputs();
  assert.throws(() => selectFrozenLostCandidate({ ...input, opportunityRows: input.opportunityRows.filter((row) => row._record_token !== "DEMO-OPP-026") }), /Lost Candidate Count/);
  const duplicate = input.opportunityRows.find((row) => row._record_token === "DEMO-OPP-026");
  assert.throws(() => selectFrozenLostCandidate({ ...input, opportunityRows: [...input.opportunityRows, { ...duplicate, _record_token: "DEMO-OPP-X" }], pilotSelection: { opportunityTokens: [...input.pilotSelection.opportunityTokens, "DEMO-OPP-X"] } }), /Lost Candidate Count/);
  assert.throws(() => selectFrozenLostCandidate({ ...input, statusOptions: [...input.statusOptions, { value: 999, state: 2, labels: { "2052": "已取消" } }] }), /not unique/);
});

test("D5-R3 builds only the official LoseOpportunity payload", async () => {
  const candidate = selectFrozenLostCandidate(await frozenInputs());
  const payload = buildLoseOpportunityPayload({ opportunityId: privateOpportunityId, candidate });
  assert.equal(assertLoseOpportunityPayload(payload, candidate), true);
  assert.equal(payload.Status, 4);
  assert.equal(payload.OpportunityClose.actualend, "2026-05-18T00:00:00Z");
  assert.equal("actualrevenue" in payload.OpportunityClose, false);
  assert.deepEqual(Object.keys(payload).sort(), ["OpportunityClose", "Status"]);
  assert.deepEqual(Object.keys(payload.OpportunityClose).sort(), ["actualend", "description", "opportunityid@odata.bind", "subject"]);
  for (const field of ["statecode", "statuscode", "actualclosedate"]) assert.equal(field in payload, false);
});

test("D5-R3 BPF and request policies block duplicate instances and forbidden writes", () => {
  const before = { instanceId: privateOpportunityId, activeStageId: privateOpportunityId, traversedPath: privateOpportunityId, statecode: 0, statuscode: 1, modifiedon: "before" };
  assert.equal(classifyBpfLoseSideEffect(before, { ...before, instanceCount: 1, duplicateCount: 0, unexpectedProcessCount: 0 }).code, "A");
  assert.equal(classifyBpfLoseSideEffect(before, { ...before, statecode: 1, statuscode: 2, modifiedon: "after", instanceCount: 1, duplicateCount: 0, unexpectedProcessCount: 0 }).code, "B");
  assert.equal(classifyBpfLoseSideEffect(before, { ...before, activeStageId: "22222222-2222-4222-8222-222222222222", instanceCount: 1, duplicateCount: 0, unexpectedProcessCount: 0 }).code, "C");
  assert.equal(classifyBpfLoseSideEffect(before, { ...before, instanceCount: 2, duplicateCount: 1, unexpectedProcessCount: 0 }).code, "D");
  const safe = { LoseOpportunityAttempts: 1, WinOpportunity: 0, PATCH: 0, DELETE: 0, Publish: 0, BPFWrites: 0, OtherStateActions: 0, ProductionRequests: 0, ExternalLLMCalls: 0 };
  assert.equal(loseRequestStatsAreSafe(safe), true);
  assert.equal(loseRequestStatsAreSafe({ ...safe, LoseOpportunityAttempts: 2 }), false);
  assert.equal(loseRequestStatsAreSafe({ ...safe, WinOpportunity: 1 }), false);
  assert.equal(loseRequestStatsAreSafe({ ...safe, PATCH: 1 }), false);
});

test("D5-R3 exact readback proves one close, unchanged imported Timeline and one activity delta", async () => {
  const runtime = await readJson("local-artifacts/d365/d5-r3-lose-canary-runtime-private.json");
  assert.equal(runtime.actionSucceeded, true);
  assert.equal(runtime.responseStatus, 204);
  assert.equal(runtime.before.opportunityClose.count, 0);
  assert.equal(runtime.after.opportunityClose.count, 1);
  assert.equal(runtime.after.opportunityClose.attachmentCount, 0);
  assert.equal(runtime.before.importedTimeline.count, 10);
  assert.equal(runtime.after.importedTimeline.count, 10);
  assert.equal(runtime.before.importedTimeline.hash, runtime.after.importedTimeline.hash);
  assert.equal(runtime.after.activityAggregate.count - runtime.before.activityAggregate.count, 1);
  assert.equal(runtime.before.interactionSignal.hash, runtime.after.interactionSignal.hash);
  assert.equal(runtime.before.actual.hash, runtime.after.actual.hash);
  assert.equal(runtime.before.coverage.hash, runtime.after.coverage.hash);
});

test("D5-R3 preserves BPF identity, prior Win Canary and all other Opportunities", async () => {
  const runtime = await readJson("local-artifacts/d365/d5-r3-lose-canary-runtime-private.json");
  assert.equal(runtime.bpfClassification.code, "A");
  assert.equal(runtime.before.bpf.instanceId, runtime.after.bpf.instanceId);
  assert.equal(runtime.before.bpf.activeStageId, runtime.after.bpf.activeStageId);
  assert.equal(runtime.before.bpf.traversedPath, runtime.after.bpf.traversedPath);
  assert.equal(runtime.after.bpf.duplicateCount, 0);
  assert.equal(runtime.after.bpf.unexpectedProcessCount, 0);
  assert.equal(runtime.after.winCanary.statecode, 1);
  assert.equal(runtime.after.winCanary.statuscode, 3);
  assert.equal(runtime.after.winCanary.opportunityCloseCount, 1);
  assert.equal(runtime.before.winCanary.priorActionHash, runtime.after.winCanary.priorActionHash);
  const others = runtime.after.opportunities.filter((row) => !["DEMO-OPP-015", "DEMO-OPP-026"].includes(row.token));
  assert.equal(others.length, 22);
  assert.ok(others.every((row) => row.statecode === 0 && row.statuscode === 1 && row.actualclosedate === null));
  assert.equal(runtime.before.explicit.nonCanaryBusinessHash, runtime.after.explicit.nonCanaryBusinessHash);
});

test("D5-R3 private ledger records one attempt and remains ignored", async () => {
  const privateManifest = await readJson("local-artifacts/d365/d365-ai-demo-200-d5-pilot-import-private.json");
  const action = privateManifest.stateActions.d5R3LoseCanary;
  assert.equal(action.actionType, "LoseOpportunity");
  assert.equal(action.opportunityToken, "DEMO-OPP-026");
  assert.equal(action.actionAttemptCount, 1);
  assert.equal(action.actionStatus, "SucceededByExactReadback");
  assert.equal(action.opportunityCloseExactId != null, true);
  const ignored = execFileSync("git", ["check-ignore", "local-artifacts/d365/d365-ai-demo-200-d5-pilot-import-private.json"], { cwd: new URL("../", import.meta.url), encoding: "utf8" });
  assert.match(ignored, /local-artifacts/);
});

test("D5-R3 public artifacts expose no GUID and publish all required gates", async () => {
  for (const path of publicArtifacts) {
    const text = await readFile(new URL(path, root), "utf8");
    assert.equal(guidPattern.test(text), false, `${path} contains a GUID`);
  }
  const manifest = await readJson("docs/d365/d365-ai-demo-200-d5-r3-validation-manifest.json");
  assert.equal(manifest.candidate.opportunityToken, "DEMO-OPP-026");
  assert.equal(manifest.candidate.lostCandidateCount, 1);
  assert.equal(manifest.candidate.lostStatusValue, 4);
  assert.equal(manifest.candidate.actualEnd, "2026-05-18");
  assert.equal(manifest.before.pilotStateDistribution.won, 1);
  assert.equal(manifest.after.pilotStateDistribution.active, 22);
  assert.equal(manifest.after.pilotStateDistribution.lost, 1);
  assert.equal(manifest.requests.loseOpportunityAttempts, 1);
  assert.equal(manifest.requests.winOpportunity, 0);
  assert.equal(manifest.requests.patch, 0);
  assert.equal(manifest.requests.delete, 0);
  assert.equal(manifest.requests.publish, 0);
  assert.equal(manifest.requests.productionRequests, 0);
  assert.equal(manifest.gates.remainingWinActionsAuthorized, false);
  assert.equal(manifest.gates.cleanupExecuted, false);
});
