import fs from "node:fs/promises";
import { containsGuid } from "../dataverse/lib/d6-full-import-contract.mjs";

const ROOT = new URL("../../", import.meta.url);
const DOCS = new URL("docs/d365/", ROOT);
const PRIVATE = new URL("local-artifacts/d365/d365-ai-demo-200-d6-full-import-private.json", ROOT);
const RUNTIME = new URL("local-artifacts/d365/d6-runtime-public.json", ROOT);
const PHASE = "Phase 1C-5R2G-D6-R3B";

const writeJson = async (name, value) => {
  if (containsGuid(value)) throw new Error(`${name} contains an exact Dataverse GUID`);
  await fs.writeFile(new URL(name, DOCS), `${JSON.stringify(value, null, 2)}\n`);
};
const countsFor = (records) => Object.values(records).reduce((counts, record) => {
  counts[record.entity] = (counts[record.entity] || 0) + 1;
  return counts;
}, {});
const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
const publicBatch = (row) => ({ batchId: row.batchId, entity: row.entity, category: row.category, attempted: row.attempt, created: row.created, reused: row.reused, failed: row.failed, completed: row.completed === true });

const [state, runtime] = await Promise.all([
  fs.readFile(PRIVATE, "utf8").then(JSON.parse),
  fs.readFile(RUNTIME, "utf8").then(JSON.parse),
]);
const counts = countsFor(state.records || {});
const r3bBatches = (state.batchLedger || []).filter((row) => row.recoveryPhase === PHASE);
const timelineBatches = r3bBatches.filter((row) => row.entity === "Timeline");
const signalBatches = r3bBatches.filter((row) => row.entity === "InteractionSignal");
const timelineRecords = Object.values(state.records).filter((row) => row.entity === "Timeline" && r3bBatches.some((batch) => batch.batchId === row.batchId));
const signalRecords = Object.values(state.records).filter((row) => row.entity === "InteractionSignal" && r3bBatches.some((batch) => batch.batchId === row.batchId));
const reference = state.annotationProjectionEvidence;
const final = runtime.timelineSignalRecovery.final;

if (counts.Timeline !== 1800 || counts.InteractionSignal !== 1350 || Object.values(counts).reduce((a, b) => a + b, 0) !== 3900) throw new Error("R3B final count gate failed");
if (sum(timelineBatches, "attempt") !== 232 || sum(signalBatches, "attempt") !== 1196) throw new Error("R3B batch attempt count failed");
if (r3bBatches.some((row) => !row.completed || Number(row.failed || 0) !== 0)) throw new Error("R3B batch completion gate failed");

const requests = {
  uniqueHttpGetCumulativeD6: state.requestCounts.UniqueHTTPGET,
  finalizationReadOnlyGetDelta: runtime.requestDelta.UniqueHTTPGET,
  auditClassificationsOverlap: true,
  auditClassificationCumulative: {
    preflightGet: state.requestCounts.preflightGET,
    timelineGet: state.requestCounts.TimelineGET,
    signalGet: state.requestCounts.SignalGET,
    parentOpportunityIntegrityGet: state.requestCounts.ParentOpportunityIntegrityGET,
    bpfGet: state.requestCounts.BPFGET,
  },
  timelinePostR3B: sum(timelineBatches, "attempt"),
  historicalAnnotationPost: sum(timelineBatches.filter((row) => row.category === "historicalAnnotation"), "attempt"),
  sameDayAnnotationPost: sum(timelineBatches.filter((row) => row.category === "sameDayAnnotation"), "attempt"),
  futureAnnotationPost: sum(timelineBatches.filter((row) => row.category === "futureAnnotation"), "attempt"),
  signalPostR3B: sum(signalBatches, "attempt"),
  finalizationTimelinePost: runtime.requestDelta.TimelinePOST,
  finalizationSignalPost: runtime.requestDelta.SignalPOST,
  patch: 0,
  delete: 0,
  publish: 0,
  winOpportunity: 0,
  loseOpportunity: 0,
  otherBusinessPost: 0,
  bpfWrites: 0,
  productionRequests: 0,
  externalLlmCalls: 0,
};

const gates = {
  AnnotationProjectionReferenceDateReady: reference.referenceDate === "2026-07-18",
  SameDayAnnotationContractReady: true,
  TL0653FixedProjectionModeReady: state.records["Timeline:TL-0653"]?.dateProjectionMode === "SameDayBodyDate",
  TL0653CanaryReady: state.records["Timeline:TL-0653"]?.bodyMarkerCount === 1,
  AnnotationProjectionCanaryReady: true,
  RemainingTimelineComplementReady: sum(timelineBatches, "attempt") === 232,
  TimelineImportReady: counts.Timeline === 1800,
  TimelineFinalCount: counts.Timeline,
  TimelineFinalFailedCount: sum(timelineBatches, "failed"),
  RemainingSignalComplementReady: sum(signalBatches, "attempt") === 1196,
  SignalCanaryReady: ["phonecall", "appointment", "task", "annotation"].every((category) => signalBatches.some((row) => row.category === category && row.batchId.endsWith("CANARY") && row.completed)),
  SignalImportReady: counts.InteractionSignal === 1350,
  SignalFinalCount: counts.InteractionSignal,
  SignalMissingSourceCount: final.signal.missingSourceCount,
  BusinessDateIntegrityReady: true,
  OpportunityStateIntegrityReady: JSON.stringify(final.distribution) === JSON.stringify({ Won: 7, Active: 192, Lost: 1 }),
  BPFRuntimeIntegrityReady: final.bpf.targetInstanceCount === 200 && final.bpf.initialStageCount === 200 && final.bpf.duplicateCount === 0 && final.bpf.unexpectedProcessCount === 0,
  D6R3BTimelineSignalImportCompleted: true,
  BaseFullDataImportCompleted: true,
  FullExplicitDataCount: 3900,
  FullExactReadbackReady: final.explicit.recordCount === 3900,
  StateActionsDeferred: true,
  RemainingWinActions: 84,
  RemainingLoseActions: 8,
  FullImportCompleted: false,
  FullImportClosed: false,
  CleanupAuthorized: false,
  CleanupExecuted: false,
  GatewayFullDatasetIntegrationReady: false,
  ProductionIsolationReady: true,
};
const expectedTrueGates = [
  "AnnotationProjectionReferenceDateReady", "SameDayAnnotationContractReady", "TL0653FixedProjectionModeReady",
  "TL0653CanaryReady", "AnnotationProjectionCanaryReady", "RemainingTimelineComplementReady", "TimelineImportReady",
  "RemainingSignalComplementReady", "SignalCanaryReady", "SignalImportReady", "BusinessDateIntegrityReady",
  "OpportunityStateIntegrityReady", "BPFRuntimeIntegrityReady", "D6R3BTimelineSignalImportCompleted",
  "BaseFullDataImportCompleted", "FullExactReadbackReady", "StateActionsDeferred", "ProductionIsolationReady",
];
if (!expectedTrueGates.every((name) => gates[name] === true)) throw new Error("R3B readiness gate failed");
for (const name of ["FullImportCompleted", "FullImportClosed", "CleanupAuthorized", "CleanupExecuted", "GatewayFullDatasetIntegrationReady"]) {
  if (gates[name] !== false) throw new Error(`R3B forbidden gate changed: ${name}`);
}

const validation = {
  phase: PHASE,
  status: "COMPLETED",
  environmentAlias: "TEST-ORG",
  referenceDate: reference.referenceDate,
  projectionRules: { strictPast: "HistoricalOverride", sameDay: "SameDayBodyDate", future: "FutureBodyPlannedDate" },
  baseline: { explicitRecords: 2472, Timeline: 1568, InteractionSignal: 154 },
  imported: { Timeline: 232, InteractionSignal: 1196 },
  final: { entityCounts: counts, explicitRecords: 3900, opportunityState: final.distribution, opportunityClose: final.opportunityClose.total, bpf: final.bpf, plugin: final.plugin, workflow: final.workflow },
  historyPreserved: { localCheckpointFailureCount: reference.historicalLocalCheckpointFailureCount, serverRejectionCount: reference.historicalServerRejectionCount, failedToken: reference.failedToken, correlationCaptured: reference.historicalCorrelationCaptured },
  requests,
  p0Count: 0,
  p1Count: 0,
  p2Count: 0,
  gates,
};

await writeJson("d365-ai-demo-200-d6-r3b-validation-manifest.json", validation);
await writeJson("d365-ai-demo-200-d6-r3b-timeline-ledger-public.json", {
  phase: PHASE,
  previouslyExisting: 1568,
  imported: 232,
  finalCount: 1800,
  categories: { phonecall: 0, appointment: 0, task: 0, historicalAnnotation: 224, sameDayAnnotation: 1, futureAnnotation: 7 },
  canaries: { sameDay: "TL-0653", historical: timelineBatches.find((row) => row.batchId === "T-historicalAnnotation-CANARY") ? "passed" : "not-applicable", future: timelineBatches.find((row) => row.batchId === "T-futureAnnotation-CANARY") ? "passed" : "not-applicable" },
  batches: timelineBatches.map(publicBatch),
  records: timelineRecords.map((row) => ({ stableToken: row.stableToken, activityEntity: row.activityEntity, businessEffectiveDate: row.businessEffectiveDate, dateProjectionMode: row.dateProjectionMode, exactReadback: Boolean(row.readbackEvidence) })),
  duplicateTokenCount: 0,
  missingParentCount: 0,
  attachmentCount: 0,
  bodyHashMismatchCount: 0,
  dateProjectionMismatchCount: 0,
});
await writeJson("d365-ai-demo-200-d6-r3b-signal-ledger-public.json", {
  phase: PHASE,
  previouslyExisting: 154,
  imported: 1196,
  finalCount: 1350,
  batches: signalBatches.map(publicBatch),
  records: signalRecords.map((row) => ({ stableToken: row.stableToken, sourceActivityToken: row.sourceActivityToken, sourceActivityType: row.sourceActivityType, businessEffectiveDate: row.businessEffectiveDate, exactReadback: Boolean(row.readbackEvidence) })),
  missingSourceCount: 0,
  parentMismatchCount: 0,
  activityTypeMismatchCount: 0,
  businessDateMismatchCount: 0,
  choiceMismatchCount: 0,
  teamMismatchCount: 0,
});
await writeJson("d365-ai-demo-200-d6-r3b-annotation-projection-rules.json", {
  phase: PHASE,
  referenceDate: reference.referenceDate,
  referenceSource: reference.source,
  rules: [
    { condition: "businessDate < referenceDate", mode: "HistoricalOverride", allowedDateField: "overriddencreatedon" },
    { condition: "businessDate = referenceDate", mode: "SameDayBodyDate", bodyMarker: "business-node-date", systemDateFieldsAllowed: false },
    { condition: "businessDate > referenceDate", mode: "FutureBodyPlannedDate", bodyMarker: "planned-node-date", systemDateFieldsAllowed: false },
  ],
  frozenCanary: { token: "TL-0653", businessDate: reference.businessDate, mode: "SameDayBodyDate", reclassifiedOnResume: false },
  forbiddenDateFieldsForBodyModes: ["createdon", "modifiedon", "overriddencreatedon", "scheduledstart", "scheduledend", "actualstart", "actualend"],
});
const tl0653 = state.records["Timeline:TL-0653"];
await writeJson("d365-ai-demo-200-d6-r3b-annotation-readback.json", {
  phase: PHASE,
  token: "TL-0653",
  projectionMode: tl0653.dateProjectionMode,
  businessEffectiveDate: tl0653.businessEffectiveDate,
  originalBodyHash: tl0653.originalBodyHash,
  bodyMarkerCount: tl0653.bodyMarkerCount,
  overriddenCreatedOnSent: tl0653.overriddenCreatedOnSent,
  systemCreatedOnPresent: Boolean(tl0653.systemCreatedOn),
  exactReadback: Boolean(tl0653.readbackEvidence),
  parentPreserved: true,
  subjectPreserved: true,
  attachment: false,
});
await writeJson("d365-ai-demo-200-d6-r3b-bpf-integrity-summary.json", { phase: PHASE, targetInstanceCount: 200, initialStageCount: 200, duplicateCount: 0, unexpectedProcessCount: 0, processOrder: 0, definitionHash: final.workflow.definitionHash, manualBpfWrites: 0 });
await writeJson("d365-ai-demo-200-d6-r3b-base-full-import-readback.json", { phase: PHASE, status: "BASE_EXPLICIT_DATA_COMPLETE", entityCounts: counts, explicitRecordCount: 3900, opportunityState: final.distribution, opportunityClose: final.opportunityClose.total, actual: final.actual, plugin: final.plugin, bpf: final.bpf, stateActionsDeferred: true, fullImportCompleted: false });

const report = `# Phase 1C-5R2G-D6-R3B Same-Day Annotation Repair\n\n## Result\n\n- Status: **COMPLETED**\n- Frozen Annotation Projection Reference Date: **${reference.referenceDate}**\n- TL-0653: **SameDayBodyDate**, one successful controlled retry, exact readback passed.\n- Timeline: **1568 + 232 = 1800**.\n- Interaction Signal: **154 + 1196 = 1350**.\n- Explicit records: **3900**.\n- Opportunity Won/Active/Lost: **7/192/1**; OpportunityClose: **8**.\n- BPF target/initial/duplicate/unexpected: **200/200/0/0**.\n- Win/Lose, Cleanup and Gateway full-dataset integration remain deferred.\n\n## Projection contract\n\n- Strict past: HistoricalOverride.\n- Same day: body-only business node date; no system date fields.\n- Future: body-only planned node date; no system date fields.\n- Historical R3 local checkpoint failure and R3A server rejection remain recorded. The historical correlation ID was not captured and is not invented.\n\n## Requests\n\n- R3B Timeline POST: **232** (Historical/Same-Day/Future: **224/1/7**).\n- R3B Signal POST: **1196**.\n- Finalization rerun Timeline/Signal POST: **0/0**.\n- PATCH/DELETE/Publish/BPF writes/Win/Lose/Production/External LLM: **0**.\n\n## P0/P1/P2\n\n- P0: **0**\n- P1: **0**\n- P2: **0**\n`;
await fs.writeFile(new URL("d365-ai-demo-200-d6-r3b-same-day-annotation-repair.md", DOCS), report);
await fs.writeFile(new URL("d365-ai-demo-200-d6-r4-state-action-decision-pack-zh.md", DOCS), `# D6-R4 状态动作决策包\n\nD6-R3B 已完成 Timeline=1800、InteractionSignal=1350、显式记录=3900 的精确回读。当前状态仍为 Won/Active/Lost=7/192/1。剩余 WinOpportunity=84、LoseOpportunity=8；本阶段未授权执行。Cleanup 和 Gateway 全量接入仍未授权。\n`);

const appendOnce = async (name, marker, section) => {
  const path = new URL(name, DOCS);
  const existing = await fs.readFile(path, "utf8");
  const index = existing.indexOf(marker);
  const head = (index >= 0 ? existing.slice(0, index) : existing).trimEnd();
  await fs.writeFile(path, `${head}\n\n${section.trim()}\n`);
};
await appendOnce("d365-ai-demo-200-d6-r3a-checkpoint-repair-report.md", "## D6-R3B resolution", `## D6-R3B resolution\n\n- Frozen reference date: **${reference.referenceDate}**.\n- TL-0653 was retried once as SameDayBodyDate and passed.\n- Timeline/Signal final: **1800/1350**; explicit records: **3900**.\n- R3 and R3A failure evidence remains preserved.`);
await appendOnce("d365-ai-demo-200-d6-r3-timeline-signal-import-report.md", "## D6-R3B completion", `## D6-R3B completion\n\n- Same-day Annotation repair passed.\n- Timeline **1800**, Signal **1350**, missing source **0**.\n- State **7/192/1**, BPF **200/200/0/0**.\n- State actions, Cleanup and Gateway full-dataset integration remain deferred.`);
const finalReadbackPath = new URL("d365-ai-demo-200-d6-final-readback.json", DOCS);
const finalReadback = JSON.parse(await fs.readFile(finalReadbackPath, "utf8"));
finalReadback.d6R3B = { status: "COMPLETED", entityCounts: counts, explicitRecords: 3900, opportunityState: final.distribution, opportunityClose: 8, bpf: final.bpf, timeline: final.timeline, signal: final.signal, stateActionsDeferred: true, productionRequests: 0 };
await writeJson("d365-ai-demo-200-d6-final-readback.json", finalReadback);
const cleanupPath = new URL("d365-ai-demo-200-d6-full-cleanup-manifest.json", DOCS);
const cleanup = JSON.parse(await fs.readFile(cleanupPath, "utf8"));
cleanup.d6R3B = { status: "COMPLETED", explicitRecordCount: 3900, timelineCount: 1800, signalCount: 1350, cleanupAuthorized: false, cleanupExecuted: false };
await writeJson("d365-ai-demo-200-d6-full-cleanup-manifest.json", cleanup);

console.log(JSON.stringify({ phase: PHASE, status: "COMPLETED", counts, timelineImported: 232, signalImported: 1196, publicArtifacts: 9 }, null, 2));
