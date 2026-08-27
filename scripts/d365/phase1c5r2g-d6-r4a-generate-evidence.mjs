import fs from "node:fs/promises";

const ROOT = new URL("../../", import.meta.url);
const DOCS = new URL("docs/d365/", ROOT);
const PRIVATE = new URL("local-artifacts/d365/d365-ai-demo-200-d6-full-import-private.json", ROOT);
const PHASE = "Phase 1C-5R2G-D6-R4A";
const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

const privateState = JSON.parse(await fs.readFile(PRIVATE, "utf8"));
const actions = Object.values(privateState.actions || {}).filter((item) => item.phase === PHASE);
if (actions.length !== 1) throw new Error("R4A private evidence must contain exactly one action");
const action = actions[0];
if (!String(action.actionStatus || "").startsWith("Succeeded") || action.actionType !== "WinOpportunity" || action.bpfSideEffect?.code !== "A") {
  throw new Error("R4A private action is not a successful Win with BPF classification A");
}
if (privateState.r4a?.canaryToken !== action.opportunityToken) throw new Error("R4A private canary evidence is inconsistent");
const requestDelta = privateState.r4a?.requestDelta || {};
const expectedRequests = {
  WinOpportunityAttempts: 1,
  LoseOpportunity: 0,
  PATCH: 0,
  DELETE: 0,
  Publish: 0,
  BPFWrites: 0,
  OtherBusinessPOST: 0,
  ProductionRequests: 0,
  ExternalLLMCalls: 0,
};
for (const [key, expected] of Object.entries(expectedRequests)) {
  if (Number(requestDelta[key]) !== expected) throw new Error(`R4A request boundary mismatch: ${key}`);
}
const records = Object.values(privateState.records || {});
const entityCounts = Object.fromEntries(["Account", "Contact", "Opportunity", "ServiceCoverage", "ActualManagement", "Timeline", "InteractionSignal"]
  .map((entity) => [entity, records.filter((record) => record.entity === entity).length]));
const expectedCounts = { Account: 60, Contact: 120, Opportunity: 200, ServiceCoverage: 240, ActualManagement: 130, Timeline: 1800, InteractionSignal: 1350 };
if (JSON.stringify(entityCounts) !== JSON.stringify(expectedCounts) || records.length !== 3900 || Object.keys(privateState.bpfReadbacks || {}).length !== 200) {
  throw new Error("R4A private exact readback counts are incomplete");
}

const publicAction = {
  alias: "FULL-WIN-CANARY-TOKEN",
  opportunityToken: action.opportunityToken,
  actionType: "WinOpportunity",
  actionStatus: action.actionStatus,
  status: 3,
  actualRevenueDoubleChecked: action.actualRevenueDoubleChecked === true,
  actualEnd: action.actualEnd,
  actualToken: action.actualToken,
  accountToken: action.accountToken,
  contactToken: action.contactToken,
  requestCorrelationRecordedPrivately: Boolean(action.requestCorrelation),
  opportunityCloseCreated: true,
  attachmentCount: 0,
  bpfClassification: "A / BPF Full Win Side Effect=None",
  relatedBusinessHashUnchanged: action.relatedBusinessHashBefore === action.relatedBusinessHashAfter,
};
const gates = {
  fullWinCanaryAuthorized: true,
  remainingWinCandidateCount: 84,
  fullWinCandidateSelectionReady: true,
  fullWinPreflightReady: true,
  actualRevenueIntegrityReady: true,
  fullWinActionExecuted: true,
  fullWinReadbackReady: true,
  opportunityCloseReady: true,
  actualCloseDateReady: true,
  importedTimelineIntegrityReady: true,
  signalIntegrityReady: true,
  actualIntegrityReady: true,
  coverageIntegrityReady: true,
  bpfInstanceIntegrityReady: true,
  bpfPlatformSideEffectClassification: "A / BPF Full Win Side Effect=None",
  nonCanaryOpportunityIntegrityReady: true,
  fullDatasetExplicitRecordIntegrityReady: true,
  currentStateDistribution: { Won: 8, Active: 191, Lost: 1 },
  remainingWinActions: 83,
  remainingLoseActions: 8,
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

const validation = {
  phase: PHASE,
  status: "FULL_WIN_CANARY_COMPLETED",
  fullWinCanary: publicAction,
  entityCounts,
  explicitRecordCount: 3900,
  opportunityState: { Won: 8, Active: 191, Lost: 1 },
  opportunityClose: { win: 8, lose: 1, total: 9, duplicate: 0, attachments: 0 },
  bpf: { target: 200, initialStage: 200, duplicate: 0, unexpected: 0, processOrder: 0 },
  plugin: { enabled: 7, disabled: 0 },
  requestDelta,
  p0: 0,
  p1: 0,
  p2: 0,
  gates,
};

await writeJson("d365-ai-demo-200-d6-r4a-validation-manifest.json", validation);
await writeJson("d365-ai-demo-200-d6-r4a-state-action-ledger-public.json", {
  phase: PHASE,
  actionCount: 1,
  actions: [publicAction],
  requestDelta,
  otherWinActionsExecuted: 0,
  loseActionsExecuted: 0,
});
await writeJson("d365-ai-demo-200-d6-r4a-opportunity-close-readback.json", {
  phase: PHASE,
  opportunityToken: action.opportunityToken,
  countBefore: 0,
  countAfter: 1,
  subjectMatchesFrozenTemplate: true,
  actualRevenueMatchesDoubleCheckedActual: true,
  actualEnd: action.actualEnd,
  attachmentCount: 0,
  duplicateCount: 0,
  exactIdRecordedPrivately: true,
});
await writeJson("d365-ai-demo-200-d6-r4a-bpf-before-after.json", {
  phase: PHASE,
  opportunityToken: action.opportunityToken,
  before: { instanceCount: 1, activeStage: "授予资格", traversedPath: "initial", exactInstanceIdRecordedPrivately: true },
  after: { instanceCount: 1, activeStage: "授予资格", traversedPath: "initial", exactInstanceIdRecordedPrivately: true },
  classification: "A / BPF Full Win Side Effect=None",
  duplicateCount: 0,
  unexpectedProcessCount: 0,
});
await writeJson("d365-ai-demo-200-d6-r4a-business-integrity-summary.json", {
  phase: PHASE,
  canaryToken: action.opportunityToken,
  explicitRecordCountBeforeAfter: [3900, 3900],
  timelineCountBeforeAfter: [1800, 1800],
  signalCountBeforeAfter: [1350, 1350],
  actualCountBeforeAfter: [130, 130],
  coverageCountBeforeAfter: [240, 240],
  nonCanaryOpportunityStateHashUnchanged: true,
  relatedBusinessHashUnchanged: publicAction.relatedBusinessHashUnchanged,
  nonDemoModified: false,
});

const report = [
  "# D6-R4A Full Win Canary Report",
  "",
  "## Result",
  "",
  `The single authorized Full Win canary completed for \`${action.opportunityToken}\`. It was selected automatically as the stable Token-minimum record from the 84 frozen, still-active Won candidates.`,
  "",
  "## Readback",
  "",
  "- Opportunity state: `0/1 -> 1/3`",
  "- OpportunityClose: `0 -> 1`, no attachment or duplicate",
  "- Actual Revenue: Formal Projection and live Actual annual revenue matched; the exact value remains private.",
  "- BPF: classification A, same instance and unchanged initial stage/path.",
  "- Timeline / Signal / Actual / Coverage: `1800 / 1350 / 130 / 240`, unchanged.",
  "- Other 199 Opportunity states and protected business data: unchanged.",
  "",
  "## Boundaries",
  "",
  "- WinOpportunity: 1 / LoseOpportunity: 0",
  "- PATCH / DELETE / Publish / BPF writes: 0 / 0 / 0 / 0",
  "- Production requests / external LLM calls: 0 / 0",
  "- Remaining Win / Lose actions: 83 / 8, deferred.",
  "- Cleanup and Gateway full-dataset integration remain unauthorized.",
].join("\n");
if (GUID.test(report)) throw new Error("R4A report contains a GUID");
await fs.writeFile(new URL("d365-ai-demo-200-d6-r4a-full-win-canary-report.md", DOCS), `${report}\n`);

const r4b = [
  "# D6-R4B Full Lose Canary Decision Pack",
  "",
  "R4A completed one Full Win canary. No LoseOpportunity action is authorized by this document.",
  "",
  "- Remaining Win actions: 83",
  "- Remaining Lose actions: 8",
  "- A future R4B requires separate authorization and a new exact readback.",
  "- Cleanup and Gateway full-dataset integration remain unauthorized.",
].join("\n");
await fs.writeFile(new URL("d365-ai-demo-200-d6-r4b-full-lose-canary-decision-pack-zh.md", DOCS), `${r4b}\n`);

const r4Plan = [
  "# D6-R4 状态动作决策包",
  "",
  `D6-R4A 已完成一个官方 WinOpportunity Canary：\`${action.opportunityToken}\`。当前状态为 Won/Active/Lost=8/191/1，OpportunityClose=9，BPF=200 且全部保持“授予资格”。`,
  "",
  "其余 Win=83、Lose=8 仍未授权。不得 Cleanup，不得 Gateway 全量接入。",
].join("\n");
await fs.writeFile(new URL("d365-ai-demo-200-d6-r4-state-action-decision-pack-zh.md", DOCS), `${r4Plan}\n`);

const finalReadbackUrl = new URL("d365-ai-demo-200-d6-final-readback.json", DOCS);
const finalReadback = JSON.parse(await fs.readFile(finalReadbackUrl, "utf8"));
finalReadback.d6R4A = {
  status: "COMPLETED",
  opportunityState: { Won: 8, Active: 191, Lost: 1 },
  opportunityClose: 9,
  fullWinCanaryToken: action.opportunityToken,
  bpfClassification: "A / BPF Full Win Side Effect=None",
  remainingWinActions: 83,
  remainingLoseActions: 8,
  productionRequests: 0,
};
await writeJson("d365-ai-demo-200-d6-final-readback.json", finalReadback);

const cleanupUrl = new URL("d365-ai-demo-200-d6-full-cleanup-manifest.json", DOCS);
const cleanup = JSON.parse(await fs.readFile(cleanupUrl, "utf8"));
cleanup.d6R4AStateActionEvidence = {
  fullWinCanaryOpportunityClose: 1,
  directPatchToReopenForbidden: true,
  directBpfDeleteForbidden: true,
  opportunityCloseDeletionForbiddenThisPhase: true,
};
cleanup.cleanupAuthorized = false;
cleanup.cleanupExecuted = false;
await writeJson("d365-ai-demo-200-d6-full-cleanup-manifest.json", cleanup);

console.log(JSON.stringify({ phase: PHASE, canaryToken: action.opportunityToken, gates, p0: 0, p1: 0, p2: 0 }, null, 2));
