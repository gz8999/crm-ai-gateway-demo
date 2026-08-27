import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const sha = async (path) => crypto.createHash("sha256").update(await readFile(new URL(path, root))).digest("hex");

const validationPath = "docs/d365/d365-ai-demo-200-d5-pilot-import-validation-manifest.json";
const publicPaths = [
  "docs/d365/d365-ai-demo-200-d5-pilot-import-report.md",
  validationPath,
  "docs/d365/d365-ai-demo-200-d5-write-ledger-public.json",
  "docs/d365/d365-ai-demo-200-d5-readback-summary.json",
  "docs/d365/d365-ai-demo-200-d5-state-action-summary.json",
  "docs/d365/d365-ai-demo-200-d5-pilot-cleanup-manifest.json",
  "docs/d365/d365-ai-demo-200-d5-failure-recovery-plan-zh.md",
];

test("D5 preserves the authorized Compact Pilot scope and workbook identity", async () => {
  const validation = await readJson(validationPath);
  const selection = await readJson("docs/d365/d365-ai-demo-200-pilot-selection-final.json");

  assert.deepEqual(validation.expectedCounts, {
    Account: 7,
    Contact: 9,
    Opportunity: 24,
    ServiceCoverage: 15,
    ActualManagement: 12,
    Timeline: 206,
    InteractionSignal: 154,
  });
  assert.deepEqual(validation.expectedCounts, selection.counts);
  assert.equal(await sha("artifacts/d365/CRM_AI_Gateway_D365_Demo_200_ImportProjection_v1.xlsx"), validation.workbooks.formal.sha256);
  assert.equal(await sha("artifacts/d365/CRM_AI_Gateway_D365_Demo_200_CompactPilot_v1.xlsx"), validation.workbooks.pilot.sha256);
  assert.equal(validation.workbooks.formal.bytes, 570890);
  assert.equal(validation.workbooks.pilot.bytes, 90392);
});

test("D5 records the Canary stop without continuing child imports or state actions", async () => {
  const validation = await readJson(validationPath);
  const readback = await readJson("docs/d365/d365-ai-demo-200-d5-readback-summary.json");
  const state = await readJson("docs/d365/d365-ai-demo-200-d5-state-action-summary.json");

  assert.deepEqual(validation.stageStats.Account, { attempt: 1, created: 1, reused: 0, failed: 0 });
  assert.deepEqual(validation.stageStats.Contact, { attempt: 1, created: 1, reused: 0, failed: 0 });
  assert.deepEqual(validation.stageStats.Opportunity, { attempt: 1, created: 1, reused: 0, failed: 0 });
  for (const entity of ["ServiceCoverage", "ActualManagement", "Timeline", "InteractionSignal"]) {
    assert.deepEqual(validation.stageStats[entity], { attempt: 0, created: 0, reused: 0, failed: 0 }, entity);
  }
  assert.equal(validation.partialCreatedRecordCount, 3);
  assert.equal(validation.unexpectedBpfInstanceCount, 1);
  assert.equal(readback.bpfInstanceCount, 1);
  assert.equal(readback.canaryRelationshipReadbackReady, true);
  assert.equal(readback.choiceReadbackReady, true);
  assert.deepEqual(readback.canaryOpportunityState, { statecode: 0, statuscode: 1, actualclosedateBlank: true });
  assert.deepEqual(state.planned, { Active: 16, Won: 7, Lost: 1 });
  assert.deepEqual(state.actions, []);
  assert.equal(state.finalDistribution, null);
  assert.deepEqual(state.requestCounts, { WinOpportunity: 0, LoseOpportunity: 0, PATCH: 0 });
});

test("D5 keeps forbidden writes, production traffic, and scope expansion at zero", async () => {
  const validation = await readJson(validationPath);
  const requests = validation.requestCounts;

  assert.equal(requests.AccountPOST, 1);
  assert.equal(requests.ContactPOST, 1);
  assert.equal(requests.OpportunityPOST, 1);
  for (const key of [
    "CoveragePOST",
    "ActualPOST",
    "TimelinePOST",
    "SignalPOST",
    "WinOpportunity",
    "LoseOpportunity",
    "PATCH",
    "DELETE",
    "Publish",
    "teamRoleMembershipChanges",
    "productionRequests",
    "externalLLMCalls",
  ]) assert.equal(requests[key], 0, key);

  assert.equal(validation.gates.pilotScopeExceeded, false);
  assert.equal(validation.gates.existingBusinessDataModified, false);
  assert.equal(validation.gates.fullImportStarted, false);
  assert.equal(validation.gates.fullImportReady, false);
  assert.equal(validation.gates.fullImportAuthorized, false);
  assert.equal(validation.gates.productionIsolationReady, true);
});

test("D5 preserves exact failure gates and an unauthorized reverse-order cleanup manifest", async () => {
  const validation = await readJson(validationPath);
  const cleanup = await readJson("docs/d365/d365-ai-demo-200-d5-pilot-cleanup-manifest.json");
  const ledger = await readJson("docs/d365/d365-ai-demo-200-d5-write-ledger-public.json");

  assert.deepEqual([validation.p0, validation.p1, validation.p2], [0, 1, 0]);
  assert.equal(validation.gates.pilotPreflightReady, true);
  assert.equal(validation.gates.canaryReady, false);
  assert.equal(validation.gates.pilotImportCompleted, false);
  assert.equal(validation.gates.pilotExactReadbackReady, false);
  assert.equal(validation.gates.partialExactIdManifestReady, true);
  assert.equal(cleanup.cleanupReady, false);
  assert.equal(cleanup.cleanupAuthorized, false);
  assert.equal(cleanup.cleanupExecuted, false);
  assert.deepEqual(cleanup.reverseOrder.map((row) => row.entity), [
    "InteractionSignal",
    "Timeline",
    "ActualManagement",
    "ServiceCoverage",
    "Opportunity",
    "Contact",
    "Account",
  ]);
  assert.deepEqual(ledger.records.map((row) => [row.entity, row.token]), [
    ["Account", "A-050"],
    ["Contact", "C-099"],
    ["Opportunity", "DEMO-OPP-015"],
  ]);
  assert.equal(cleanup.unexpectedPlatformSideEffects.targetBpfInstanceRows, 1);
  assert.equal(cleanup.unexpectedPlatformSideEffects.includedInCleanup, false);
});

test("D5 keeps exact IDs private and public artifacts free of sensitive material", async () => {
  const privatePath = "local-artifacts/d365/d365-ai-demo-200-d5-pilot-import-private.json";
  await access(new URL(privatePath, root));
  const ignored = execFileSync("git", ["check-ignore", "-q", privatePath], { cwd: new URL(root) });
  assert.equal(ignored.length, 0);

  const forbidden = [
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    /lcn-crm\.crm7\.dynamics\.com/i,
    /org91f5f65f\.crm5\.dynamics\.com/i,
    /Authorization\s*:/i,
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /client[_ -]?secret|refresh[_ -]?token|access[_ -]?token/i,
  ];
  for (const path of publicPaths) {
    const content = await readFile(new URL(path, root), "utf8");
    for (const pattern of forbidden) assert.doesNotMatch(content, pattern, `${path} matched ${pattern}`);
  }
});
