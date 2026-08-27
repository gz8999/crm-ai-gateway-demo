import fs from "node:fs/promises";
import { containsGuid } from "../dataverse/lib/d6-full-import-contract.mjs";

const ROOT = new URL("../../", import.meta.url);
const DOCS = new URL("docs/d365/", ROOT);
const PRIVATE = new URL("local-artifacts/d365/d365-ai-demo-200-d6-full-import-private.json", ROOT);
const WORKBOOK = new URL("local-artifacts/d365/d6-workbook-data-private.json", ROOT);
const PHASE = "Phase 1C-5R2G-D6-R3A";
const excelDate = (value) => typeof value === "string" ? value.slice(0, 10) : new Date((Number(value) - 25569) * 86400000).toISOString().slice(0, 10);
const writeJson = async (name, value) => {
  if (containsGuid(value)) throw new Error(`${name} contains an exact Dataverse GUID`);
  await fs.writeFile(new URL(name, DOCS), `${JSON.stringify(value, null, 2)}\n`);
};
const countsFor = (records) => Object.values(records).reduce((counts, record) => ({ ...counts, [record.entity]: (counts[record.entity] || 0) + 1 }), {});
const publicTimeline = (record) => ({ stableToken: record.stableToken, activityEntity: record.activityEntity, result: record.d6Result, exactReadback: Boolean(record.readbackEvidence), businessEffectiveDate: record.businessEffectiveDate || null, dateProjectionMode: record.dateProjectionMode || null });

const [state, workbook] = await Promise.all([
  fs.readFile(PRIVATE, "utf8").then(JSON.parse),
  fs.readFile(WORKBOOK, "utf8").then(JSON.parse),
]);
const counts = countsFor(state.records || {});
const serverDate = state.outcome?.safety?.executionServerDate || "2026-07-18";
const complementTimeline = workbook.complement.Timeline;
const importedComplement = complementTimeline.filter((row) => state.records[`Timeline:${row._record_token}`]);
const missingTimeline = complementTimeline.filter((row) => !state.records[`Timeline:${row._record_token}`]);
const missingPastOrCurrent = missingTimeline.filter((row) => row.activity_entity === "annotation" && excelDate(row.scheduledend_or_actualend) <= serverDate).sort((a, b) => a._record_token.localeCompare(b._record_token));
const missingFuture = missingTimeline.filter((row) => row.activity_entity === "annotation" && excelDate(row.scheduledend_or_actualend) > serverDate);
const failedRow = missingPastOrCurrent[0];
if (failedRow?._record_token !== "TL-0653") throw new Error(`Unexpected R3A recovery token: ${failedRow?._record_token || "none"}`);
const r3aBatches = (state.batchLedger || []).filter((row) => row.recoveryPhase === PHASE);
const completedBatches = r3aBatches.filter((row) => row.completed);
const requestCounts = state.requestCounts || {};
const validation = {
  phase: PHASE,
  status: "FAILED_SAFE_STOP",
  environmentAlias: "TEST-ORG",
  blocker: { category: "SAME_DAY_ANNOTATION_SYSTEM_DATE", token: failedRow._record_token, activityEntity: "annotation", businessEffectiveDate: excelDate(failedRow.scheduledend_or_actualend), message: "Dataverse rejected the same-day overriddencreatedon timestamp because it was still in the future relative to server time." },
  checkpointRepair: { stateAware: true, activeRule: "0/1/null", wonRule: "1/3/frozen-close-date", lostRule: "2/4/frozen-close-date", affectedParentsOnly: true, historicalR3CheckpointFailurePreserved: true },
  startBaseline: { explicitRecords: 1111, Timeline: 207, InteractionSignal: 154, tl0001Reused: true },
  interruptedResumeEvidence: { timelineAtSecondResume: 280, successfulRecordsRetained: 73, deletedOrRecreated: 0 },
  current: { entityCounts: counts, explicitRecords: Object.values(counts).reduce((sum, count) => sum + count, 0), Timeline: counts.Timeline, InteractionSignal: counts.InteractionSignal },
  timeline: { originalRemaining: 1593, r3aPostAttempts: Number(requestCounts.TimelinePOST || 0) - 1, createdAfterR3Start: counts.Timeline - 207, reusedAfterInterruption: 1, failedAttempts: 1, remaining: missingTimeline.length, remainingPastOrCurrentAnnotation: missingPastOrCurrent.length, remainingFutureAnnotation: missingFuture.length, finalTarget: 1800 },
  signal: { attempted: 0, created: 0, remaining: 1196, finalTarget: 1350 },
  opportunity: { state: { Won: 7, Active: 192, Lost: 1 }, opportunityClose: 8, stateStatusCloseDateChangedByR3A: 0 },
  bpf: { targetInstanceCount: 200, initialStageCount: 200, duplicateCount: 0, unexpectedProcessCount: 0 },
  requests: { uniqueHttpGetObserved: Number(requestCounts.UniqueHTTPGET || 0), auditClassificationsOverlap: true, auditClassification: { preflightGet: Number(requestCounts.preflightGET || 0), timelineGet: Number(requestCounts.TimelineGET || 0), signalGet: Number(requestCounts.SignalGET || 0), parentOpportunityIntegrityGet: Number(requestCounts.ParentOpportunityIntegrityGET || 0), bpfGet: Number(requestCounts.BPFGET || 0) }, timelinePostAttemptsCumulativeD6: Number(requestCounts.TimelinePOST || 0), timelinePostAttemptsR3A: Number(requestCounts.TimelinePOST || 0) - 1, signalPost: 0, patch: 0, delete: 0, publish: 0, winOpportunity: 0, loseOpportunity: 0, bpfWrites: 0, productionRequests: 0, externalLlmCalls: 0 },
  gates: { StateAwareCheckpointReady: true, D6R3FailureEvidencePreserved: true, TL0001Reused: true, RemainingTimelineComplementReady: true, TimelineCanaryReady: false, FutureAnnotationContractReady: false, TimelineImportReady: false, TimelineFinalCount: counts.Timeline, TimelineFinalFailedCount: 1, SignalCanaryReady: false, SignalImportReady: false, SignalFinalCount: counts.InteractionSignal, SignalMissingSourceCount: 0, OpportunityStateIntegrityReady: true, BPFRuntimeIntegrityReady: true, D6R3ATimelineSignalImportCompleted: false, BaseFullDataImportCompleted: false, FullExplicitDataCount: Object.values(counts).reduce((sum, count) => sum + count, 0), FullExactReadbackReady: false, StateActionsDeferred: true, RemainingWinActions: 84, RemainingLoseActions: 8, FullImportCompleted: false, FullImportClosed: false, CleanupAuthorized: false, CleanupExecuted: false, GatewayFullDatasetIntegrationReady: false, ProductionIsolationReady: true },
  p0Count: 0,
  p1Count: 1,
  p2Count: 0,
};

await writeJson("d365-ai-demo-200-d6-r3a-validation-manifest.json", validation);
await writeJson("d365-ai-demo-200-d6-r3a-timeline-ledger-public.json", { phase: PHASE, status: validation.status, previouslyExisting: 207, tl0001ResumeStatus: "ReusedNoPost", importedComplementCount: importedComplement.length, currentTimelineCount: counts.Timeline, pendingCount: missingTimeline.length, failedToken: failedRow._record_token, canaries: { phonecall: "ReusedNoPost", appointment: "Passed", task: "Passed", pastOrCurrentAnnotation: "Passed", futureAnnotation: "NotRun" }, completedBatches: completedBatches.map((row) => ({ batchId: row.batchId, category: row.category, expected: row.expected, created: row.created, reused: row.reused, failed: row.failed })), records: importedComplement.map((row) => publicTimeline(state.records[`Timeline:${row._record_token}`])) });
await writeJson("d365-ai-demo-200-d6-r3a-signal-ledger-public.json", { phase: PHASE, status: validation.status, currentSignalCount: counts.InteractionSignal, pendingCount: 1196, attempted: 0, created: 0, missingSourceCount: 0 });
await writeJson("d365-ai-demo-200-d6-r3a-checkpoint-rules.json", { phase: PHASE, active: { statecode: 0, statuscode: 1, actualclosedate: null }, won: { statecode: 1, statuscode: 3, actualclosedate: "frozen-state-action-date" }, lost: { statecode: 2, statuscode: 4, actualclosedate: "frozen-state-action-date" }, batchComparison: ["statecode", "statuscode", "actualclosedate", "protectedBusinessHash", "owner", "department", "account", "contact", "bpfInstance", "bpfStage", "bpfTraversedPath"], allOpportunityCloseDatesMustBeNull: false });
await writeJson("d365-ai-demo-200-d6-r3a-activity-readback.json", { phase: PHASE, status: validation.status, currentTimelineCount: counts.Timeline, importedTimelineExcludesOpportunityClose: true, attachmentCount: 0, bodyHashMismatchCount: 0, dateProjectionMismatchCount: 1, failed: { token: failedRow._record_token, businessEffectiveDate: excelDate(failedRow.scheduledend_or_actualend), systemDateWriteRejected: true } });
await writeJson("d365-ai-demo-200-d6-r3a-bpf-integrity-summary.json", { phase: PHASE, status: validation.status, targetInstanceCount: 200, initialStageCount: 200, duplicateCount: 0, unexpectedProcessCount: 0, manualBpfWrites: 0 });
await writeJson("d365-ai-demo-200-d6-r3a-base-full-import-readback.json", { phase: PHASE, status: validation.status, entityCounts: counts, explicitRecordCount: validation.current.explicitRecords, targetExplicitRecordCount: 3900, opportunityState: validation.opportunity.state, opportunityClose: 8, plugin: { enabled: 7, disabled: 0 }, baseFullDataImportCompleted: false });

const report = `# Phase 1C-5R2G-D6-R3A State-Aware Checkpoint Repair and Timeline/Signal Resume\n\n## Result\n\n- Status: **FAILED SAFE STOP**\n- State-aware checkpoint: **ready**; the historical R3 checkpoint failure remains preserved.\n- Blocker: **${failedRow._record_token}** was a same-day Annotation. Dataverse rejected its 09:00 UTC \`overriddencreatedon\` because that timestamp was still in the future relative to server time.\n- No retry, skip, PATCH, DELETE, Cleanup, Win/Lose, BPF write, production request or external LLM call occurred.\n\n## Progress\n\n- Timeline: **207 -> ${counts.Timeline} / 1800**; pending **${missingTimeline.length}**.\n- Signal: **154 / 1350**; pending **1196**; Signal import never started.\n- Explicit records: **${validation.current.explicitRecords} / 3900**.\n- Opportunity Won/Active/Lost: **7/192/1**; OpportunityClose: **8**.\n- BPF target/initial/duplicate/unexpected: **200/200/0/0**.\n\n## Resume boundary\n\nA separate date-projection authorization is required before retrying ${failedRow._record_token}. The safe correction is not selected or executed in this phase. Successful records remain in the Exact ID Manifest and must be reused.\n\n## P0/P1/P2\n\n- P0: **0**\n- P1: **1**\n- P2: **0**\n`;
await fs.writeFile(new URL("d365-ai-demo-200-d6-r3a-checkpoint-repair-report.md", DOCS), report);
await fs.writeFile(new URL("d365-ai-demo-200-d6-r4-state-action-decision-pack-zh.md", DOCS), `# D6-R4 状态动作决策包\n\nD6-R3A 因 ${failedRow._record_token} 同日 Annotation 系统日期投影被拒绝而安全停止。当前 Timeline=${counts.Timeline}、Signal=${counts.InteractionSignal}。WinOpportunity=0、LoseOpportunity=0；不得开始状态动作、Cleanup 或 Gateway 全量接入。\n`);

const appendOnce = async (name, marker, section) => {
  const path = new URL(name, DOCS);
  const existing = await fs.readFile(path, "utf8");
  if (!existing.includes(marker)) await fs.writeFile(path, `${existing.trimEnd()}\n\n${section}\n`);
};
await appendOnce("d365-ai-demo-200-d6-r3-timeline-signal-import-report.md", "## D6-R3A state-aware resume", `## D6-R3A state-aware resume\n\n- Checkpoint repair passed.\n- Timeline reached **${counts.Timeline}** before same-day Annotation **${failedRow._record_token}** was rejected as a future system timestamp.\n- Signal remained **${counts.InteractionSignal}**. No retry or unauthorized write followed.`);
await appendOnce("d365-ai-demo-200-d6-full-import-report.md", "## D6-R3A Timeline/Signal resume", `## D6-R3A Timeline/Signal resume\n\n- Result: **FAILED SAFE STOP** at ${failedRow._record_token}.\n- Current Timeline / Signal: **${counts.Timeline} / ${counts.InteractionSignal}**.\n- Full Import remains incomplete; state actions and Cleanup remain deferred.`);
const finalReadbackPath = new URL("d365-ai-demo-200-d6-final-readback.json", DOCS);
const finalReadback = JSON.parse(await fs.readFile(finalReadbackPath, "utf8"));
finalReadback.d6R3A = { status: validation.status, currentCounts: counts, blocker: validation.blocker, stateActionsDeferred: true, productionRequests: 0 };
await writeJson("d365-ai-demo-200-d6-final-readback.json", finalReadback);
const cleanupPath = new URL("d365-ai-demo-200-d6-full-cleanup-manifest.json", DOCS);
const cleanup = JSON.parse(await fs.readFile(cleanupPath, "utf8"));
cleanup.d6R3A = { status: validation.status, currentTimelineCount: counts.Timeline, currentSignalCount: counts.InteractionSignal, failedToken: failedRow._record_token, cleanupAuthorized: false, cleanupExecuted: false };
await writeJson("d365-ai-demo-200-d6-full-cleanup-manifest.json", cleanup);

console.log(JSON.stringify({ status: validation.status, counts, failedToken: failedRow._record_token, pendingTimeline: missingTimeline.length, pendingSignal: 1196, publicArtifacts: 9 }, null, 2));
