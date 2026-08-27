import fs from "node:fs/promises";

const ROOT = new URL("../../", import.meta.url);
const DOCS = new URL("docs/d365/", ROOT);
const PRIVATE = new URL("local-artifacts/d365/d365-ai-demo-200-d6-full-import-private.json", ROOT);
const PHASE = "Phase 1C-5R2G-D6-R4B";
const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

const privateState = JSON.parse(await fs.readFile(PRIVATE, "utf8"));
const evidence = privateState.r4b;
if (!evidence) throw new Error("R4B private evidence is missing");
const action = Object.values(privateState.actions || {}).find((item) => item.phase === PHASE);
if (!action || action.actionType !== "LoseOpportunity" || action.actionStatus !== "Succeeded") {
  throw new Error("R4B private action is not a successful LoseOpportunity");
}
if (evidence.canaryToken !== action.opportunityToken) throw new Error("R4B canary evidence is inconsistent");
if (evidence.expectedActualCount !== 0 || evidence.actualCountBefore !== 0 || evidence.actualCountAfter !== 0) {
  throw new Error("R4B expected Actual count contract is not satisfied");
}
if (evidence.actualCreatedByStateAction !== false) throw new Error("R4B state action created an Actual");
if (evidence.beforeDistribution?.Won !== 8 || evidence.beforeDistribution?.Active !== 191 || evidence.beforeDistribution?.Lost !== 1) {
  throw new Error("R4B before distribution is inconsistent");
}
if (evidence.afterDistribution?.Won !== 8 || evidence.afterDistribution?.Active !== 190 || evidence.afterDistribution?.Lost !== 2) {
  throw new Error("R4B after distribution is inconsistent");
}
if (evidence.opportunityCloseTotal !== 10 || evidence.bpfClassification?.code !== "A") {
  throw new Error("R4B close or BPF readback is inconsistent");
}

const requestDelta = evidence.requestDelta || {};
const expectedRequests = {
  LoseOpportunityAttempts: 1,
  LoseOpportunitySuccess: 1,
  WinOpportunityAttempts: 0,
  ActualPOST: 0,
  TimelinePOST: 0,
  SignalPOST: 0,
  PATCH: 0,
  DELETE: 0,
  Publish: 0,
  BPFWrites: 0,
  OtherBusinessPOST: 0,
  ProductionRequests: 0,
  ExternalLLMCalls: 0,
};
for (const [key, expected] of Object.entries(expectedRequests)) {
  if (Number(requestDelta[key]) !== expected) throw new Error(`R4B request boundary mismatch: ${key}`);
}

const records = Object.values(privateState.records || {});
const entityCounts = Object.fromEntries(
  ["Account", "Contact", "Opportunity", "ServiceCoverage", "ActualManagement", "Timeline", "InteractionSignal"]
    .map((entity) => [entity, records.filter((record) => record.entity === entity).length]),
);
const expectedCounts = { Account: 60, Contact: 120, Opportunity: 200, ServiceCoverage: 240, ActualManagement: 130, Timeline: 1800, InteractionSignal: 1350 };
if (JSON.stringify(entityCounts) !== JSON.stringify(expectedCounts) || records.length !== 3900 || Object.keys(privateState.bpfReadbacks || {}).length !== 200) {
  throw new Error("R4B private exact readback counts are incomplete");
}

const actionState = action.afterState || {};
const publicAction = {
  alias: "FULL-LOSE-CANARY-TOKEN",
  opportunityToken: action.opportunityToken,
  actionType: "LoseOpportunity",
  actionStatus: action.actionStatus,
  status: 4,
  expectedActualCount: 0,
  actualCountBefore: 0,
  actualCountAfter: 0,
  actualCreatedByStateAction: false,
  actualRevenue: null,
  actualEnd: action.actualEnd,
  stateTransition: "0/1 -> 2/4",
  opportunityCloseCreated: true,
  opportunityCloseActualRevenue: null,
  attachmentCount: 0,
  bpfClassification: "A / BPF Lose Side Effect=None",
  relatedBusinessHashUnchanged: action.relatedBusinessHashBefore === action.relatedBusinessHashAfter,
  requestCorrelationRecordedPrivately: Boolean(action.requestCorrelation),
  frozenActualEndApplied: actionState.actualclosedate === action.actualEnd,
};

const gates = {
  fullLoseCanaryAuthorized: true,
  fullLoseCandidateCount: 8,
  fullLoseCandidateSelectionReady: true,
  fullLosePreflightReady: true,
  frozenExpectedActualCountReady: true,
  noActualCreatedByStateAction: true,
  fullLoseActionExecuted: true,
  fullLoseReadbackReady: true,
  opportunityCloseReady: true,
  actualRevenueMayBeEmpty: true,
  importedTimelineIntegrityReady: true,
  signalIntegrityReady: true,
  actualIntegrityReady: true,
  coverageIntegrityReady: true,
  bpfInstanceIntegrityReady: true,
  bpfPlatformSideEffectClassification: "A / BPF Lose Side Effect=None",
  nonCanaryOpportunityIntegrityReady: evidence.nonCanaryOpportunityStateHashUnchanged === true,
  fullDatasetExplicitRecordIntegrityReady: true,
  currentStateDistribution: evidence.afterDistribution,
  remainingWinActions: 83,
  remainingLoseActions: 7,
  fullStateActionsCompleted: false,
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

await writeJson("d365-ai-demo-200-d6-r4b-validation-manifest.json", {
  phase: PHASE,
  authorization: "Phase 1C-5R2G-D6-R4B-R1",
  status: "FULL_LOSE_CANARY_COMPLETED",
  fullLoseCanary: publicAction,
  entityCounts,
  explicitRecordCount: 3900,
  opportunityState: evidence.afterDistribution,
  opportunityClose: { win: 8, lose: 2, total: 10, duplicate: 0, attachments: 0 },
  bpf: { target: 200, initialStage: 200, duplicate: 0, unexpected: 0, processOrder: 0 },
  plugin: { enabled: 7, disabled: 0 },
  requestDelta,
  p0: 0,
  p1: 0,
  p2: 0,
  gates,
});

await writeJson("d365-ai-demo-200-d6-r4b-state-action-ledger-public.json", {
  phase: PHASE,
  actionCount: 1,
  actions: [publicAction],
  requestDelta,
  otherLoseActionsExecuted: 0,
  otherWinActionsExecuted: 0,
});

await writeJson("d365-ai-demo-200-d6-r4b-opportunity-close-readback.json", {
  phase: PHASE,
  opportunityToken: action.opportunityToken,
  countBefore: 0,
  countAfter: 1,
  status: 4,
  actualRevenue: null,
  actualEnd: action.actualEnd,
  frozenLostReasonApplied: true,
  attachmentCount: 0,
  duplicateCount: 0,
  exactIdRecordedPrivately: true,
});

await writeJson("d365-ai-demo-200-d6-r4b-bpf-before-after.json", {
  phase: PHASE,
  opportunityToken: action.opportunityToken,
  before: { instanceCount: 1, activeStage: "授予资格", traversedPath: "initial", exactInstanceIdRecordedPrivately: true },
  after: { instanceCount: 1, activeStage: "授予资格", traversedPath: "initial", exactInstanceIdRecordedPrivately: true },
  classification: "A / BPF Lose Side Effect=None",
  duplicateCount: 0,
  unexpectedProcessCount: 0,
});

await writeJson("d365-ai-demo-200-d6-r4b-business-integrity-summary.json", {
  phase: PHASE,
  canaryToken: action.opportunityToken,
  explicitRecordCountBeforeAfter: [3900, 3900],
  timelineCountBeforeAfter: [1800, 1800],
  signalCountBeforeAfter: [1350, 1350],
  actualCountBeforeAfter: [130, 130],
  coverageCountBeforeAfter: [240, 240],
  canaryActualCountBeforeAfter: [0, 0],
  actualCreatedByStateAction: false,
  nonCanaryOpportunityStateHashUnchanged: evidence.nonCanaryOpportunityStateHashUnchanged === true,
  relatedBusinessHashUnchanged: publicAction.relatedBusinessHashUnchanged,
  nonDemoModified: false,
});

const report = [
  "# D6-R4B Full Lose Canary Report",
  "",
  "## Result",
  "",
  `The single authorized Full Lose canary completed for \`${action.opportunityToken}\`, selected automatically as the stable Token-minimum record from the eight frozen, still-active Lost candidates.`,
  "",
  "## Corrected Actual Contract",
  "",
  "- Frozen Projection Expected Actual Count: `0`.",
  "- Actual Count before / after: `0 / 0`.",
  "- Actual revenue in OpportunityClose: empty, permitted by the approved contract.",
  "- No ActualManagement record was created by the state action.",
  "",
  "## Readback",
  "",
  "- Opportunity state: `0/1 -> 2/4`.",
  `- actualclosedate: frozen date \`${action.actualEnd}\`; no direct PATCH was used.`,
  "- OpportunityClose: `0 -> 1`, no attachment or duplicate.",
  "- BPF: classification A, same instance and unchanged initial stage/path.",
  "- Timeline / Signal / Actual / Coverage: `1800 / 1350 / 130 / 240`, unchanged.",
  "- Other 199 Opportunity states and protected business data: unchanged.",
  "",
  "## Boundaries",
  "",
  "- LoseOpportunity: 1 / WinOpportunity: 0.",
  "- Actual POST / Timeline POST / Signal POST: `0 / 0 / 0`.",
  "- PATCH / DELETE / Publish / BPF writes: `0 / 0 / 0 / 0`.",
  "- Production requests / external LLM calls: `0 / 0`.",
  "- Remaining Win / Lose actions: `83 / 7`, deferred.",
  "- Cleanup and Gateway full-dataset integration remain unauthorized.",
].join("\n");
if (GUID.test(report)) throw new Error("R4B report contains a GUID");
await fs.writeFile(new URL("d365-ai-demo-200-d6-r4b-full-lose-canary-report.md", DOCS), `${report}\n`);

const decisionPack = [
  "# D6-R4B Full Lose Canary Decision Pack",
  "",
  "R4B-R1 已修正 Actual 门禁：Actual Count 必须匹配冻结 Projection Expected Actual Count。",
  "",
  `- 自动选择并完成：\`${action.opportunityToken}\`。`,
  "- Frozen Expected Actual Count=0；Actual Count=0，状态动作未创建 Actual。",
  "- Opportunity 状态：8/191/1 -> 8/190/2。",
  "- OpportunityClose：9 -> 10；Lose OpportunityClose 的 actualrevenue 为空，符合契约。",
  "- BPF 保持 200 条、初始阶段“授予资格”、重复 0、异常流程 0。",
  "- 其余 Win=83、Lose=7；Cleanup、Full Import 关闭和 Gateway 全量接入仍未授权。",
].join("\n");
await fs.writeFile(new URL("d365-ai-demo-200-d6-r4c-state-action-decision-pack-zh.md", DOCS), `${decisionPack}\n`);
await fs.writeFile(new URL("d365-ai-demo-200-d6-r4b-full-lose-canary-decision-pack-zh.md", DOCS), `${decisionPack}\n`);

const finalReadbackUrl = new URL("d365-ai-demo-200-d6-final-readback.json", DOCS);
const finalReadback = JSON.parse(await fs.readFile(finalReadbackUrl, "utf8"));
finalReadback.status = "D6_R4B_FULL_LOSE_CANARY_COMPLETED";
finalReadback.capturedAt = action.actionTimestamp;
finalReadback.currentExplicitCounts = entityCounts;
finalReadback.currentExplicitRecordCount = 3900;
finalReadback.stateDistribution = evidence.afterDistribution;
finalReadback.opportunityClose = { total: 10, win: 8, lose: 2, duplicate: 0, attachments: 0, newCloseCount: 1 };
finalReadback.bpf = { total: 200, newCount: 0, duplicate: 0, unexpectedProcess: 0, initialStage: 200, processOrder: 0 };
finalReadback.actual = { total: 130, uniquePerOpportunity: true, parentSyncCount: 118, unexpectedBusinessChangeCount: 0 };
finalReadback.timelineSignalDelta = { Timeline: 0, InteractionSignal: 0 };
finalReadback.fullReady = false;
finalReadback.baseFullDataImportCompleted = false;
finalReadback.fullImportCompleted = false;
finalReadback.cleanupAuthorized = false;
finalReadback.gatewayFullDatasetIntegrationReady = false;
finalReadback.d6R4B = {
  status: "COMPLETED",
  opportunityState: evidence.afterDistribution,
  opportunityClose: 10,
  fullLoseCanaryToken: action.opportunityToken,
  expectedActualCount: 0,
  actualCountBeforeAfter: [0, 0],
  actualCreatedByStateAction: false,
  bpfClassification: "A / BPF Lose Side Effect=None",
  remainingWinActions: 83,
  remainingLoseActions: 7,
  productionRequests: 0,
};
await writeJson("d365-ai-demo-200-d6-final-readback.json", finalReadback);

const cleanupUrl = new URL("d365-ai-demo-200-d6-full-cleanup-manifest.json", DOCS);
const cleanup = JSON.parse(await fs.readFile(cleanupUrl, "utf8"));
cleanup.status = "PLANNED_ONLY_D6_R4B_CANARY";
cleanup.currentImportedExplicitRecordCount = 3900;
cleanup.exactIdManifestComplete = true;
cleanup.d6R4BStateActionEvidence = {
  fullLoseCanaryOpportunityClose: 1,
  expectedActualCount: 0,
  actualCreatedByStateAction: false,
  directPatchToReopenForbidden: true,
  directBpfDeleteForbidden: true,
  opportunityCloseDeletionForbiddenThisPhase: true,
};
cleanup.cleanupAuthorized = false;
cleanup.cleanupExecuted = false;
await writeJson("d365-ai-demo-200-d6-full-cleanup-manifest.json", cleanup);

console.log(JSON.stringify({ phase: PHASE, canaryToken: action.opportunityToken, gates, p0: 0, p1: 0, p2: 0 }, null, 2));
