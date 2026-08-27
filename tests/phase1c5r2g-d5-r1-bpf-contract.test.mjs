import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const validationPath = "docs/d365/d365-ai-demo-200-d5-r1-validation-manifest.json";
const publicPaths = [
  "docs/d365/d365-ai-demo-200-d5-r1-bpf-contract-reconciliation.md",
  validationPath,
  "docs/d365/d365-ai-demo-200-d5-r1-write-ledger-public.json",
  "docs/d365/d365-ai-demo-200-d5-r1-bpf-readback-summary.json",
  "docs/d365/d365-ai-demo-200-d5-r1-base-import-summary.json",
  "docs/d365/d365-ai-demo-200-d5-r1-cleanup-contract.json",
  "docs/d365/d365-ai-demo-200-d5-r1-state-action-decision-pack-zh.md",
];

test("D5-R1 accepts the platform BPF contract and reuses the Canary", async () => {
  const validation = await readJson(validationPath);
  assert.equal(validation.gates.bpfAutoInstanceContractReady, true);
  assert.equal(validation.gates.canaryBpfIntegrityReady, true);
  assert.equal(validation.gates.canaryReady, true);
  assert.equal(validation.gates.canaryRecordsReused, true);
  assert.deepEqual(validation.expectedCounts, {
    Account: 7,
    Contact: 9,
    Opportunity: 24,
    ServiceCoverage: 15,
    ActualManagement: 12,
    Timeline: 206,
    InteractionSignal: 154,
  });
  assert.equal(validation.contract.explicitPilotRecords, 427);
  assert.equal(validation.contract.expectedPlatformBpfInstances, 24);
});

test("D5-R1 verifies exactly one target BPF at the initial stage for all Opportunities", async () => {
  const validation = await readJson(validationPath);
  const bpf = await readJson("docs/d365/d365-ai-demo-200-d5-r1-bpf-readback-summary.json");

  assert.equal(bpf.targetInstanceCount, 24);
  assert.equal(bpf.duplicateInstanceCount, 0);
  assert.equal(bpf.unexpectedProcessCount, 0);
  assert.equal(bpf.initialStageReadyCount, 24);
  assert.equal(bpf.initialStageAlias, "授予资格");
  assert.equal(bpf.opportunities.length, 24);
  for (const row of bpf.opportunities) {
    assert.equal(row.targetInstanceCount, 1, row.opportunityToken);
    assert.equal(row.duplicateCount, 0, row.opportunityToken);
    assert.equal(row.unexpectedProcessCount, 0, row.opportunityToken);
    assert.equal(row.activeStageAlias, "授予资格", row.opportunityToken);
  }
  assert.deepEqual(bpf.manualBpfWrites, { POST: 0, PATCH: 0, DELETE: 0 });
  assert.deepEqual(validation.bpfSummary, {
    targetInstanceCount: 24,
    duplicateInstanceCount: 0,
    unexpectedProcessCount: 0,
    initialStageReadyCount: 24,
  });
});

test("D5-R1 stops at the future Annotation without misreporting pending records", async () => {
  const validation = await readJson(validationPath);
  const base = await readJson("docs/d365/d365-ai-demo-200-d5-r1-base-import-summary.json");
  const ledger = await readJson("docs/d365/d365-ai-demo-200-d5-r1-write-ledger-public.json");

  assert.equal(validation.explicitPilotRecordCount, 245);
  assert.equal(ledger.records.length, 245);
  assert.equal(ledger.rejectedAttempts.length, 1);
  assert.deepEqual(ledger.rejectedAttempts[0], {
    entity: "Timeline",
    token: "TL-1630",
    type: "annotation",
    result: "Rejected",
    status: 400,
    residualRecordCount: 0,
  });
  assert.deepEqual(validation.stageStats.Timeline, { attempt: 179, created: 178, reused: 0, failed: 1, pending: 27 });
  assert.deepEqual(validation.stageStats.InteractionSignal, { attempt: 0, created: 0, reused: 0, failed: 0, pending: 154 });
  assert.deepEqual(base.finalOpportunityDistribution, { Active: 24, Won: 0, Lost: 0 });
  assert.equal(validation.gates.timelineImportReady, false);
  assert.equal(validation.gates.signalImportReady, false);
  assert.equal(validation.gates.basePilotDataImportCompleted, false);
  assert.equal(validation.gates.partialExactIdManifestReady, true);
  assert.deepEqual([validation.p0, validation.p1, validation.p2], [0, 1, 1]);
});

test("D5-R1 performs no state action, manual BPF write, cleanup, or production request", async () => {
  const validation = await readJson(validationPath);
  const requests = validation.requestCounts;
  for (const key of [
    "BpfInstancePOST",
    "BpfInstancePATCH",
    "BpfInstanceDELETE",
    "WinOpportunity",
    "LoseOpportunity",
    "PATCH",
    "DELETE",
    "Publish",
    "teamRoleMembershipChanges",
    "productionRequests",
    "externalLLMCalls",
  ]) assert.equal(requests[key], 0, key);
  assert.equal(validation.gates.winOpportunityCount, 0);
  assert.equal(validation.gates.loseOpportunityCount, 0);
  assert.equal(validation.gates.pilotStateActionsDeferred, true);
  assert.equal(validation.gates.cleanupExecuted, false);
  assert.equal(validation.gates.fullImportStarted, false);
  assert.equal(validation.gates.productionIsolationReady, true);
});

test("D5-R1 keeps exact IDs private and public artifacts sanitized", async () => {
  const privatePath = "local-artifacts/d365/d365-ai-demo-200-d5-pilot-import-private.json";
  await access(new URL(privatePath, root));
  execFileSync("git", ["check-ignore", "-q", privatePath], { cwd: new URL(root) });

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
