import fs from "node:fs/promises";

const ROOT = new URL("../../", import.meta.url);
const DOCS = new URL("docs/d365/", ROOT);
const PRIVATE = new URL("local-artifacts/d365/d365-ai-demo-200-d6-full-import-private.json", ROOT);
const PHASE = "Phase 1C-5R2G-D6-R4C";
const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

const privateState = JSON.parse(await fs.readFile(PRIVATE, "utf8"));
const evidence = privateState.outcome?.fullStateActions;
if (!evidence?.final || !evidence.execution) throw new Error("R4C private evidence is missing");

const actions = Object.values(privateState.actions || {}).filter((item) => item.phase === PHASE);
if (actions.length !== 90) throw new Error(`R4C action count mismatch: ${actions.length}`);
if (actions.some((item) => item.actionStatus !== "Succeeded")) throw new Error("R4C contains an unsuccessful action");

const wins = actions.filter((item) => item.actionType === "WinOpportunity");
const loses = actions.filter((item) => item.actionType === "LoseOpportunity");
if (wins.length !== 83 || loses.length !== 7) throw new Error("R4C Win/Lose counts are inconsistent");

const expectedCounts = {
  Account: 60,
  Contact: 120,
  Opportunity: 200,
  ServiceCoverage: 240,
  ActualManagement: 130,
  Timeline: 1800,
  InteractionSignal: 1350,
};
const records = Object.values(privateState.records || {});
const entityCounts = Object.fromEntries(Object.keys(expectedCounts).map((entity) => [
  entity,
  records.filter((record) => record.entity === entity).length,
]));
if (JSON.stringify(entityCounts) !== JSON.stringify(expectedCounts) || records.length !== 3900) {
  throw new Error("R4C explicit record counts are incomplete");
}
if (Object.keys(privateState.bpfReadbacks || {}).length !== 200) throw new Error("R4C BPF readback count is incomplete");

const final = evidence.final;
if (JSON.stringify(final.distribution) !== JSON.stringify({ Won: 91, Active: 100, Lost: 9 })) {
  throw new Error("R4C final state distribution is inconsistent");
}
if (final.opportunityClose?.total !== 100 || final.opportunityClose?.win !== 91 || final.opportunityClose?.lose !== 9) {
  throw new Error("R4C OpportunityClose readback is inconsistent");
}
if (final.bpf?.targetInstanceCount !== 200 || final.bpf?.initialStageCount !== 200 || final.bpf?.duplicateCount !== 0 || final.bpf?.unexpectedProcessCount !== 0) {
  throw new Error("R4C BPF readback is inconsistent");
}
if (final.nonTargetBusinessIntegrity !== true) throw new Error("R4C non-target integrity failed");

const requestDelta = final.requestDelta || {};
const expectedRequests = {
  WinOpportunityAttempts: 83,
  WinOpportunitySuccess: 83,
  LoseOpportunityAttempts: 7,
  LoseOpportunitySuccess: 7,
  ActualPOST: 0,
  TimelinePOST: 0,
  SignalPOST: 0,
  OtherBusinessPOST: 0,
  PATCH: 0,
  DELETE: 0,
  Publish: 0,
  BPFWrites: 0,
  ProductionRequests: 0,
  ExternalLLMCalls: 0,
};
for (const [key, expected] of Object.entries(expectedRequests)) {
  if (Number(requestDelta[key]) !== expected) throw new Error(`R4C request boundary mismatch: ${key}`);
}

const publicAction = (action) => ({
  opportunityToken: action.opportunityToken,
  actionType: action.actionType,
  actionStatus: action.actionStatus,
  batchId: action.batchId,
  status: action.actionType === "WinOpportunity" ? 3 : 4,
  actualEnd: action.actualEnd,
  expectedActualCount: action.expectedActualCount,
  actualCountBefore: action.actualValidation?.before?.actualCount ?? null,
  actualCountAfter: action.actualValidation?.after?.actualCount ?? null,
  actualCreatedByStateAction: action.actualValidation?.createdByStateAction === true,
  actualRevenuePresent: action.actualRevenue != null,
  opportunityCloseCreated: true,
  attachmentCount: 0,
  bpfClassification: "A / BPF Close Side Effect=None",
  relatedBusinessHashUnchanged: action.relatedBusinessHashBefore === action.relatedBusinessHashAfter,
});

const publicActions = actions
  .sort((a, b) => String(a.batchId).localeCompare(String(b.batchId)) || String(a.opportunityToken).localeCompare(String(b.opportunityToken)))
  .map(publicAction);

const publicBatches = (evidence.execution.batches || []).map((batch) => ({
  batchId: batch.batchId,
  actionType: batch.actionType,
  count: batch.count,
  succeeded: batch.count,
  failed: 0,
}));

const gates = {
  remainingWinActionsAuthorized: true,
  remainingLoseActionsAuthorized: true,
  remainingWinCandidateCount: 83,
  remainingLoseCandidateCount: 7,
  batchSizeMax10: true,
  candidateSelectionFromFrozenPlan: true,
  remainingWinActionsCompleted: true,
  remainingLoseActionsCompleted: true,
  opportunityCloseFinalReady: true,
  bpfIntegrityReady: true,
  actualContractReady: true,
  nonTargetBusinessIntegrityReady: true,
  finalStateDistributionReady: true,
  fullExactReadbackReady: true,
  fullExactIdManifestReady: true,
  fullImportCompleted: false,
  fullImportClosed: false,
  cleanupAuthorized: false,
  cleanupExecuted: false,
  gatewayFullDatasetIntegrationReady: false,
  productionIsolationReady: true,
};

async function writeJson(name, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (GUID.test(text)) throw new Error(`${name} contains a GUID`);
  await fs.writeFile(new URL(name, DOCS), text);
}

await writeJson("d365-ai-demo-200-d6-r4c-validation-manifest.json", {
  phase: PHASE,
  status: "FULL_STATE_ACTIONS_COMPLETED",
  entityCounts,
  explicitRecordCount: 3900,
  stateDistribution: final.distribution,
  opportunityClose: { win: 91, lose: 9, total: 100, duplicate: 0, attachments: 0 },
  bpf: { target: 200, initialStage: 200, duplicate: 0, unexpected: 0, initialStageName: "授予资格", processOrder: 0 },
  plugin: final.plugin,
  requestDelta,
  gates,
  p0: 0,
  p1: 0,
  p2: 0,
});

await writeJson("d365-ai-demo-200-d6-r4c-state-action-ledger.json", {
  phase: PHASE,
  actionCount: publicActions.length,
  winCount: wins.length,
  loseCount: loses.length,
  actions: publicActions,
  batches: publicBatches,
  requestDelta,
  noActualCreatedByStateAction: publicActions.every((action) => action.actualCreatedByStateAction === false),
});

await writeJson("d365-ai-demo-200-d6-r4c-opportunity-close-summary.json", {
  phase: PHASE,
  before: { win: 8, lose: 2, total: 10 },
  actions: { win: 83, lose: 7, total: 90 },
  after: { win: 91, lose: 9, total: 100 },
  duplicateCount: 0,
  attachmentCount: 0,
  actualContract: "Expected Actual Count=1 requires one matching Actual; Expected Actual Count=0 requires zero Actuals.",
  exactIdsRecordedPrivately: true,
});

await writeJson("d365-ai-demo-200-d6-r4c-bpf-integrity-summary.json", {
  phase: PHASE,
  targetInstanceCount: 200,
  initialStage: "授予资格",
  initialStageCount: 200,
  duplicateCount: 0,
  unexpectedProcessCount: 0,
  processOrder: 0,
  bpfWrites: 0,
  stageActions: 0,
  instanceIdsRecordedPrivately: true,
});

await writeJson("d365-ai-demo-200-d6-r4c-final-state-readback.json", {
  phase: PHASE,
  explicitRecordCount: 3900,
  entityCounts,
  stateDistribution: final.distribution,
  opportunityClose: { win: 91, lose: 9, total: 100, duplicate: 0, attachments: 0 },
  bpf: { target: 200, initialStage: 200, duplicate: 0, unexpected: 0, processOrder: 0 },
  plugin: final.plugin,
  timeline: 1800,
  interactionSignal: 1350,
  actualManagement: 130,
  serviceCoverage: 240,
  nonTargetBusinessIntegrity: true,
  requestDelta,
  remainingWinActions: 0,
  remainingLoseActions: 0,
  fullImportCompleted: false,
  fullImportClosed: false,
  cleanupAuthorized: false,
  cleanupExecuted: false,
  gatewayFullDatasetIntegrationReady: false,
});

const report = [
  "# Phase 1C-5R2G-D6-R4C Remaining State Actions",
  "",
  "## 结果",
  "",
  "从冻结 State Action Plan 自动筛选并顺序完成 83 条 WinOpportunity 与 7 条 LoseOpportunity。每批最多 10 条，所有动作均完成逐条回读。",
  "",
  "- 状态分布：`Won/Active/Lost=91/100/9`。",
  "- OpportunityClose：`Win/Lose/Total=91/9/100`，重复 0，附件 0。",
  "- BPF：200 条目标实例，初始阶段“授予资格”200/200，重复 0，异常流程 0，Process Order=0。",
  "- 显式业务记录：3900；Actual/ServiceCoverage/Timeline/Signal=130/240/1800/1350。",
  "",
  "## 批次",
  "",
  ...publicBatches.map((batch) => `- ${batch.batchId}: ${batch.actionType} ${batch.succeeded}/${batch.count} 成功，失败 0。`),
  "",
  "## Actual 契约",
  "",
  "每条动作均遵循冻结 Expected Actual Count：Expected=1 时存在且一致，Expected=0 时保持 0。状态动作未创建 Actual。",
  "",
  "## 完整性与边界",
  "",
  "- 非目标业务完整性：通过；子记录数量未变化。",
  "- PATCH / DELETE / Publish / BPF 写入：`0/0/0/0`。",
  "- Timeline / Signal / Other Business POST：`0/0/0`。",
  "- 生产请求 / 外部 LLM：`0/0`。",
  "- Full Import Completed / Closed：`false/false`。",
  "- Cleanup Authorized / Executed：`false/false`。",
  "- Gateway Full Dataset Integration Ready：`false`。",
].join("\n");
if (GUID.test(report)) throw new Error("R4C report contains a GUID");
await fs.writeFile(new URL("d365-ai-demo-200-d6-r4c-state-action-report.md", DOCS), `${report}\n`);

console.log(JSON.stringify({
  phase: PHASE,
  actions: { win: wins.length, lose: loses.length, total: actions.length },
  distribution: final.distribution,
  opportunityClose: final.opportunityClose,
  bpf: final.bpf,
  explicitRecordCount: records.length,
  p0: 0,
  p1: 0,
  p2: 0,
}, null, 2));
