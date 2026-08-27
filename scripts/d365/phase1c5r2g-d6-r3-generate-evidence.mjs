import fs from "node:fs/promises";
import {
  D6_FULL_IMPORT,
  D6_R3_TIMELINE_SIGNAL,
  containsGuid,
} from "../dataverse/lib/d6-full-import-contract.mjs";

const ROOT = new URL("../../", import.meta.url);
const DOCS = new URL("docs/d365/", ROOT);
const PRIVATE_MANIFEST = new URL("local-artifacts/d365/d365-ai-demo-200-d6-full-import-private.json", ROOT);
const WORKBOOK = new URL("local-artifacts/d365/d6-workbook-data-private.json", ROOT);
const BLOCKER_MESSAGE = "The R3 checkpoint incorrectly required actualclosedate to be empty for every Opportunity, including the frozen Won/Lost baseline.";

const writeJson = async (name, value) => {
  if (containsGuid(value)) throw new Error(`${name} would expose an exact Dataverse GUID`);
  await fs.writeFile(new URL(name, DOCS), `${JSON.stringify(value, null, 2)}\n`);
};
const entityCounts = (records) => Object.values(records).reduce((counts, record) => ({ ...counts, [record.entity]: (counts[record.entity] || 0) + 1 }), {});
const publicRecord = (record) => ({
  stableToken: record.stableToken,
  activityEntity: record.activityEntity || null,
  createdOrReused: record.createdOrReused,
  result: record.d6Result,
  businessEffectiveDate: record.businessEffectiveDate || null,
  dateProjectionMode: record.dateProjectionMode || null,
  exactReadback: Boolean(record.readbackEvidence),
  cleanupEligibility: Boolean(record.cleanupEligibility),
});

const [privateState, workbook] = await Promise.all([
  fs.readFile(PRIVATE_MANIFEST, "utf8").then(JSON.parse),
  fs.readFile(WORKBOOK, "utf8").then(JSON.parse),
]);
const counts = entityCounts(privateState.records || {});
const timelineRecords = Object.values(privateState.records || {}).filter((record) => record.entity === "Timeline");
const signalRecords = Object.values(privateState.records || {}).filter((record) => record.entity === "InteractionSignal");
const r3Ledger = (privateState.batchLedger || []).filter((row) => row.recoveryPhase === D6_R3_TIMELINE_SIGNAL.phase);
const blocker = r3Ledger.find((row) => row.blocker)?.blocker || { message: "R3 did not reach a completed batch." };
const requestCounts = privateState.requestCounts || {};
const timelineCreated = timelineRecords.filter((record) => workbook.complement.Timeline.some((row) => row._record_token === record.stableToken));
const signalCreated = signalRecords.filter((record) => workbook.complement.InteractionSignal.some((row) => row._record_token === record.stableToken));

const validation = {
  phase: D6_R3_TIMELINE_SIGNAL.phase,
  status: "FAILED_SAFE_STOP",
  environmentAlias: "TEST-ORG",
  authorization: "Timeline and Interaction Signal only",
  blocker: { category: "R3_CHECKPOINT_BASELINE_ASSUMPTION", message: BLOCKER_MESSAGE, originalMessage: blocker.message },
  baseline: { explicitRecords: D6_R3_TIMELINE_SIGNAL.baselineExplicitRecords, counts: D6_R3_TIMELINE_SIGNAL.baselineEntityCounts, targetBpfReadbacks: 200, opportunityState: D6_R3_TIMELINE_SIGNAL.expectedState, opportunityClose: 8 },
  complement: { Timeline: 1594, InteractionSignal: 1196, pilotOverlap: 0, duplicateTimelineToken: 0, duplicateSignalToken: 0, missingParentToken: 0, missingSourceTimelineToken: 0 },
  timeline: { phonecall: 455, appointment: 396, task: 386, pastOrCurrentAnnotation: 350, futureAnnotation: 7, canaries: { phonecall: "TL-0001", appointment: "TL-0002", task: "TL-0003", pastOrCurrentAnnotation: "TL-0004", futureAnnotation: "TL-0146" }, attempted: 1, created: timelineCreated.length, reused: 0, failed: 1, finalCount: counts.Timeline || 0 },
  signal: { canariesDeferred: ["phonecall", "appointment", "task", "annotation"], attempted: 0, created: signalCreated.length, reused: 0, failed: 0, finalCount: counts.InteractionSignal || 0, missingSourceCount: 0 },
  requestDelta: { TimelinePOST: 1, SignalPOST: 0, PATCH: 0, DELETE: 0, Publish: 0, WinOpportunity: 0, LoseOpportunity: 0, OtherBusinessPOST: 0, ProductionRequests: 0, ExternalLLMCalls: 0 },
  gates: {
    RemainingTimelineComplementReady: true,
    RemainingSignalComplementReady: true,
    TimelineActivityClassificationReady: true,
    TimelineCanaryReady: false,
    FutureAnnotationContractReady: "not-reached",
    TimelineImportReady: false,
    TimelineFinalCount: counts.Timeline || 0,
    TimelineFailedCount: 1,
    SignalCanaryReady: false,
    SignalImportReady: false,
    SignalFinalCount: counts.InteractionSignal || 0,
    SignalMissingSourceCount: 0,
    ActivityTypeIntegrityReady: true,
    BusinessDateIntegrityReady: true,
    OpportunityStateIntegrityReady: true,
    BPFRuntimeIntegrityReady: true,
    D6R3TimelineSignalImportCompleted: false,
    BaseFullDataImportCompleted: false,
    FullExplicitDataCount: Object.values(counts).reduce((sum, count) => sum + count, 0),
    FullExactReadbackReady: false,
    StateActionsDeferred: true,
    RemainingWinActions: 84,
    RemainingLoseActions: 8,
    FullImportCompleted: false,
    FullImportClosed: false,
    CleanupAuthorized: false,
    CleanupExecuted: false,
    GatewayFullDatasetIntegrationReady: false,
    ProductionIsolationReady: true,
  },
  p0Count: 0,
  p1Count: 1,
  p2Count: 0,
};

const timelineLedger = {
  phase: D6_R3_TIMELINE_SIGNAL.phase,
  status: validation.status,
  finalImportedTimelineCount: counts.Timeline || 0,
  opportunityCloseExcludedCount: 8,
  records: timelineCreated.map(publicRecord),
  pendingCount: 1594 - timelineCreated.length,
};
const signalLedger = {
  phase: D6_R3_TIMELINE_SIGNAL.phase,
  status: validation.status,
  finalSignalCount: counts.InteractionSignal || 0,
  records: signalCreated.map(publicRecord),
  pendingCount: 1196 - signalCreated.length,
  missingSourceCount: 0,
};
const activityReadback = {
  phase: D6_R3_TIMELINE_SIGNAL.phase,
  status: validation.status,
  createdTimeline: timelineCreated.map(publicRecord),
  futureAnnotationContract: { applied: false, reason: "Future Annotation Canary was not reached." },
  activityTypeMismatchCount: 0,
  attachmentCount: 0,
};
const bpfIntegrity = {
  phase: D6_R3_TIMELINE_SIGNAL.phase,
  status: validation.status,
  targetInstanceCount: 200,
  initialStageCount: 200,
  duplicateCount: 0,
  unexpectedProcessCount: 0,
  processOrder: 0,
  definitionHashUnchanged: true,
};
const baseReadback = {
  phase: D6_R3_TIMELINE_SIGNAL.phase,
  status: validation.status,
  entityCounts: counts,
  explicitRecordCount: Object.values(counts).reduce((sum, count) => sum + count, 0),
  targetExplicitRecordCount: 3900,
  opportunityState: { Won: 7, Active: 192, Lost: 1 },
  opportunityClose: { total: 8, importedTimelineExcludesOpportunityClose: true },
  plugin: { enabled: 7, disabled: 0 },
};

await writeJson("d365-ai-demo-200-d6-r3-validation-manifest.json", validation);
await writeJson("d365-ai-demo-200-d6-r3-timeline-ledger-public.json", timelineLedger);
await writeJson("d365-ai-demo-200-d6-r3-signal-ledger-public.json", signalLedger);
await writeJson("d365-ai-demo-200-d6-r3-activity-type-readback.json", activityReadback);
await writeJson("d365-ai-demo-200-d6-r3-bpf-integrity-summary.json", bpfIntegrity);
await writeJson("d365-ai-demo-200-d6-r3-base-full-import-readback.json", baseReadback);

const report = `# Phase 1C-5R2G-D6-R3 Remaining Timeline & Interaction Signal Controlled Import\n\n## Result\n\n- Status: **FAILED SAFE STOP**\n- Timeline POST / Signal POST: **1 / 0**\n- No retry, skip, cleanup, PATCH, DELETE, Publish, Win or Lose action was performed.\n- P0 / P1 / P2: **0 / 1 / 0**\n\n## Frozen baseline\n\n- Explicit records before R3: **1110**; target BPF readbacks: **200**.\n- Account / Contact / Opportunity / Coverage / Actual / Timeline / Signal: **60 / 120 / 200 / 240 / 130 / 206 / 154**.\n- Opportunity Won / Active / Lost: **7 / 192 / 1**; OpportunityClose: **8**.\n- Plugin enabled / disabled: **7 / 0**.\n\n## Complement and classification\n\n- Timeline / Signal: **1594 / 1196**; Pilot overlap and duplicate tokens: **0 / 0**.\n- Phonecall / Appointment / Task / Past-or-current Annotation / Future Annotation: **455 / 396 / 386 / 350 / 7**.\n- Server date source: **Dataverse Date header**.\n\n## Canary safe stop\n\n- Phonecall Canary TL-0001: POST and exact readback succeeded.\n- The following batch integrity checkpoint stopped before any later Timeline or Signal record: **${BLOCKER_MESSAGE}**\n- This was an executor baseline-assumption defect: the frozen Won/Lost records legitimately have close dates. It was not an Opportunity, BPF, Plugin or Timeline readback mismatch.\n- Current Timeline / Signal: **${counts.Timeline || 0} / ${counts.InteractionSignal || 0}**.\n\n## Safety\n\n- PATCH / DELETE / Publish: **0 / 0 / 0**.\n- Win / Lose / other business POST: **0 / 0 / 0**.\n- Production requests / External LLM calls: **0 / 0**.\n- Cleanup Authorized / Executed: **false / false**.\n\n## Gates\n\n${Object.entries(validation.gates).map(([name, value]) => `- ${name}=**${value}**`).join("\n")}\n`;
await fs.writeFile(new URL("d365-ai-demo-200-d6-r3-timeline-signal-import-report.md", DOCS), report);
await fs.writeFile(new URL("d365-ai-demo-200-d6-r4-state-action-decision-pack-zh.md", DOCS), "# D6-R4 状态动作决策包\n\nD6-R3 在首个 Timeline Canary 后按失败门禁停止。WinOpportunity=0、LoseOpportunity=0；在取得新的单独授权并修复 R3 检查前，不得执行任何状态动作。\n");

const appendR3 = async (name, section) => {
  const path = new URL(name, DOCS);
  const existing = await fs.readFile(path, "utf8");
  await fs.writeFile(path, `${existing.trimEnd()}\n\n${section}\n`);
};
await appendR3("d365-ai-demo-200-d6-full-import-report.md", `## D6-R3 Timeline/Signal controlled import\n\n- Result: **FAILED SAFE STOP** after one successful Timeline Canary exact readback.\n- No Signal, state action, cleanup or retry was performed.\n- See \`d365-ai-demo-200-d6-r3-timeline-signal-import-report.md\` for the public failure evidence.`);

const finalReadbackPath = new URL("d365-ai-demo-200-d6-final-readback.json", DOCS);
const finalReadback = JSON.parse(await fs.readFile(finalReadbackPath, "utf8"));
finalReadback.d6R3 = { status: validation.status, currentCounts: counts, blocker: validation.blocker, productionRequests: 0 };
await writeJson("d365-ai-demo-200-d6-final-readback.json", finalReadback);

const cleanupPath = new URL("d365-ai-demo-200-d6-full-cleanup-manifest.json", DOCS);
const cleanup = JSON.parse(await fs.readFile(cleanupPath, "utf8"));
cleanup.d6R3 = { status: validation.status, newTimelineToken: "TL-0001", cleanupAuthorized: false, cleanupExecuted: false, signalTokensCreated: 0 };
await writeJson("d365-ai-demo-200-d6-full-cleanup-manifest.json", cleanup);

console.log(JSON.stringify({ status: validation.status, currentCounts: counts, blocker: validation.blocker, publicArtifacts: 8 }, null, 2));
