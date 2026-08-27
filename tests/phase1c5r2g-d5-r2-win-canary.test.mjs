import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import {
  D5_R2_WIN_CANARY,
  assertWinOpportunityPayload,
  buildWinOpportunityPayload,
  classifyBpfCloseSideEffect,
  requestStatsAreSafe,
} from "../scripts/dataverse/lib/d5-r2-win-canary-contract.mjs";

const privateOpportunityId = "11111111-1111-4111-8111-111111111111";
const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const validationPath = "docs/d365/d365-ai-demo-200-d5-r2-validation-manifest.json";
const publicPaths = [
  "docs/d365/d365-ai-demo-200-d5-r2-win-canary-report.md",
  validationPath,
  "docs/d365/d365-ai-demo-200-d5-r2-state-action-ledger-public.json",
  "docs/d365/d365-ai-demo-200-d5-r2-opportunity-close-readback.json",
  "docs/d365/d365-ai-demo-200-d5-r2-bpf-before-after.json",
  "docs/d365/d365-ai-demo-200-d5-r2-business-integrity-summary.json",
  "docs/d365/d365-ai-demo-200-d5-r2-state-action-decision-pack-zh.md",
  "docs/d365/d365-ai-demo-200-d5-r3-bulk-state-action-decision-pack-zh.md",
];

test("D5-R2 freezes the single WinOpportunity canary contract", () => {
  assert.deepEqual(D5_R2_WIN_CANARY, {
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
});

test("D5-R2 builds only the official WinOpportunity payload", () => {
  const payload = buildWinOpportunityPayload({ opportunityId: privateOpportunityId, actualRevenue: 3898 });
  assert.equal(assertWinOpportunityPayload(payload), true);
  assert.equal(payload.Status, 3);
  assert.equal(payload.OpportunityClose.actualend, "2026-05-01T00:00:00Z");
  assert.deepEqual(Object.keys(payload).sort(), ["OpportunityClose", "Status"]);
  assert.deepEqual(Object.keys(payload.OpportunityClose).sort(), ["actualend", "actualrevenue", "description", "opportunityid@odata.bind", "subject"]);
  for (const field of ["statecode", "statuscode", "actualclosedate"]) assert.equal(field in payload, false);
  assert.throws(() => buildWinOpportunityPayload({ opportunityId: privateOpportunityId, actualRevenue: 4274 }), /Frozen Actual Revenue mismatch/);
});

test("D5-R2 BPF side-effect classification preserves instance and stage integrity", () => {
  const before = { instanceId: privateOpportunityId, activeStageId: privateOpportunityId, traversedPath: privateOpportunityId, statecode: 0, statuscode: 1, modifiedon: "before" };
  const unchanged = { ...before, instanceCount: 1, duplicateCount: 0, unexpectedProcessCount: 0 };
  assert.equal(classifyBpfCloseSideEffect(before, unchanged).code, "A");
  assert.deepEqual(classifyBpfCloseSideEffect(before, { ...before, statecode: 1, statuscode: 2, modifiedon: "after", instanceCount: 1, duplicateCount: 0, unexpectedProcessCount: 0 }), {
    code: "B",
    label: "Same instance; platform state/status/timestamp only",
    severity: "P2",
    ready: true,
  });
  assert.equal(classifyBpfCloseSideEffect(before, { ...before, activeStageId: "22222222-2222-4222-8222-222222222222", instanceCount: 1, duplicateCount: 0, unexpectedProcessCount: 0 }).code, "C");
  assert.equal(classifyBpfCloseSideEffect(before, { ...before, instanceCount: 2, duplicateCount: 1, unexpectedProcessCount: 0 }).code, "D");
});

test("D5-R2 request policy permits at most one Win action and no other write", () => {
  const safe = { WinOpportunityAttempts: 1, LoseOpportunity: 0, PATCH: 0, DELETE: 0, Publish: 0, BPFWrites: 0, OtherStateActions: 0, ProductionRequests: 0, ExternalLLMCalls: 0 };
  assert.equal(requestStatsAreSafe(safe), true);
  assert.equal(requestStatsAreSafe({ ...safe, WinOpportunityAttempts: 2 }), false);
  assert.equal(requestStatsAreSafe({ ...safe, PATCH: 1 }), false);
  assert.equal(requestStatsAreSafe({ ...safe, BPFWrites: 1 }), false);
});

test("D5-R2 records exactly one successful official WinOpportunity action", async () => {
  const validation = await readJson(validationPath);
  const ledger = await readJson("docs/d365/d365-ai-demo-200-d5-r2-state-action-ledger-public.json");

  assert.equal(validation.authorization.opportunityToken, "DEMO-OPP-015");
  assert.deepEqual([validation.action.attempts, validation.action.successes, validation.action.httpStatus], [1, 1, 204]);
  assert.equal(validation.action.status, 3);
  assert.equal(validation.action.actualRevenue, 3898);
  assert.match(validation.action.actualRevenueSource, /ACT-008.*frozen projection.*CRM readback/i);
  assert.equal(validation.action.actualEnd, "2026-05-01");
  assert.equal(validation.action.directCloseFieldPatch, false);
  assert.equal(ledger.actions.length, 1);
  assert.equal(ledger.actions[0].actionType, "WinOpportunity");
  assert.equal(ledger.actions[0].directPatchUsed, false);
});

test("D5-R2 adds one OpportunityClose without changing imported Timeline", async () => {
  const close = await readJson("docs/d365/d365-ai-demo-200-d5-r2-opportunity-close-readback.json");

  assert.deepEqual([close.before.opportunityCloseCount, close.after.opportunityCloseCount, close.after.delta], [0, 1, 1]);
  assert.equal(close.after.actualRevenue, 3898);
  assert.equal(close.after.actualEnd, "2026-05-01");
  assert.equal(close.after.attachmentCount, 0);
  assert.deepEqual([close.importedTimeline.beforeCount, close.importedTimeline.afterCount, close.importedTimeline.unchanged], [12, 12, true]);
  assert.deepEqual([close.activityAggregate.beforeCount, close.activityAggregate.afterCount, close.activityAggregate.expectedPlatformDelta], [9, 10, 1]);
});

test("D5-R2 preserves the target BPF instance and all other Opportunity states", async () => {
  const validation = await readJson(validationPath);
  const bpf = await readJson("docs/d365/d365-ai-demo-200-d5-r2-bpf-before-after.json");
  const integrity = await readJson("docs/d365/d365-ai-demo-200-d5-r2-business-integrity-summary.json");

  assert.equal(bpf.comparison.sameInstance, true);
  assert.equal(bpf.comparison.activeStageUnchanged, true);
  assert.equal(bpf.comparison.traversedPathUnchanged, true);
  assert.equal(bpf.after.duplicateCount, 0);
  assert.equal(bpf.after.unexpectedProcessCount, 0);
  assert.equal(bpf.classification.code, "A");
  assert.deepEqual(integrity.stateDistribution, { Won: 1, Active: 23, Lost: 0 });
  assert.equal(integrity.hashChecks.nonCanaryOpportunityBusinessData.unchanged, true);
  assert.equal(validation.after.targetBpfInstanceCount, 1);
  assert.equal(validation.after.targetBpfDuplicateCount, 0);
});

test("D5-R2 leaves imported child records and protected business data unchanged", async () => {
  const integrity = await readJson("docs/d365/d365-ai-demo-200-d5-r2-business-integrity-summary.json");
  const requiredHashes = [
    "explicitPilotRecordSet",
    "nonCanaryOpportunityBusinessData",
    "canaryProtectedBusinessFields",
    "actualManagement",
    "importedTimeline",
    "interactionSignal",
    "serviceCoverage",
    "account",
    "contact",
    "annotation",
  ];

  for (const key of requiredHashes) assert.equal(integrity.hashChecks[key].unchanged, true, key);
  assert.equal(integrity.counts.explicitPilotRecords, 427);
  assert.deepEqual(
    [integrity.counts.canaryActualManagement, integrity.counts.canaryImportedTimeline, integrity.counts.canaryInteractionSignal, integrity.counts.canaryServiceCoverage],
    [1, 12, 9, 2],
  );
  assert.equal(integrity.existingNonPilotDataModified, false);
});

test("D5-R2 private exact action evidence remains ignored", async () => {
  const privatePath = "local-artifacts/d365/d365-ai-demo-200-d5-pilot-import-private.json";
  await access(new URL(privatePath, root));
  execFileSync("git", ["check-ignore", "-q", privatePath], { cwd: new URL(root) });
  const manifest = await readJson(privatePath);
  const action = manifest.stateActions.d5R2WinCanary;

  assert.equal(action.actionType, "WinOpportunity");
  assert.equal(action.opportunityToken, "DEMO-OPP-015");
  assert.equal(action.actionAttemptCount, 1);
  assert.match(action.exactOpportunityId, /^[0-9a-f-]{36}$/i);
  assert.match(action.opportunityCloseExactId, /^[0-9a-f-]{36}$/i);
  assert.equal(action.beforeSnapshot.explicit.recordCount, 427);
  assert.equal(action.afterSnapshot.explicit.recordCount, 427);
});

test("D5-R2 forbids every non-authorized write and preserves production isolation", async () => {
  const validation = await readJson(validationPath);
  const requests = validation.requests;

  assert.equal(requestStatsAreSafe(requests), true);
  assert.equal(requests.WinOpportunityAttempts, 1);
  assert.equal(requests.WinOpportunitySuccess, 1);
  for (const key of ["LoseOpportunity", "PATCH", "DELETE", "Publish", "BPFWrites", "OtherStateActions", "ProductionRequests", "ExternalLLMCalls"]) {
    assert.equal(requests[key], 0, key);
  }
  assert.equal(validation.gates.remainingWinActionsAuthorized, false);
  assert.equal(validation.gates.loseActionAuthorized, false);
  assert.equal(validation.gates.pilotCleanupAuthorized, false);
  assert.equal(validation.gates.cleanupExecuted, false);
  assert.equal(validation.gates.fullImportStarted, false);
  assert.deepEqual(validation.issues, { p0: 0, p1: 0, p2: 0 });
});

test("D5-R2 public artifacts contain no exact ID, environment hostname, or credential", async () => {
  const forbidden = [
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    /org91f5f65f\.crm5\.dynamics\.com/i,
    /lcn-crm\.crm7\.dynamics\.com/i,
    /(?:^|\n)Authorization\s*:/i,
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /client[_ -]?secret|refresh[_ -]?token|access[_ -]?token/i,
  ];
  for (const path of publicPaths) {
    const content = await readFile(new URL(path, root), "utf8");
    for (const pattern of forbidden) assert.doesNotMatch(content, pattern, `${path} matched ${pattern}`);
  }
});
