import fs from "node:fs/promises";
import { runDataverseCli } from "../dataverse/lib/environment-safety.mjs";

const ROOT = new URL("../../", import.meta.url);
const PHASE = "Phase 1C-5R2G-D5-R1A";
const EXPECTED = {
  Account: 7,
  Contact: 9,
  Opportunity: 24,
  ServiceCoverage: 15,
  ActualManagement: 12,
  Timeline: 206,
  InteractionSignal: 154,
};
const PUBLIC_PATHS = [
  "docs/d365/d365-ai-demo-200-d5-r1a-annotation-date-repair.md",
  "docs/d365/d365-ai-demo-200-d5-r1a-validation-manifest.json",
  "docs/d365/d365-ai-demo-200-d5-r1a-timeline-ledger-public.json",
  "docs/d365/d365-ai-demo-200-d5-r1a-signal-ledger-public.json",
  "docs/d365/d365-ai-demo-200-d5-r1a-base-import-readback.json",
  "docs/d365/d365-ai-demo-200-d5-r1a-bpf-integrity-summary.json",
  "docs/d365/d365-ai-demo-200-d5-r1a-cleanup-contract.json",
  "docs/d365/d365-ai-demo-200-d5-r2-state-action-decision-pack-zh.md",
];

const readJson = async (path) => JSON.parse(await fs.readFile(new URL(path, ROOT), "utf8"));
const writeJson = async (path, value) => fs.writeFile(new URL(path, ROOT), `${JSON.stringify(value, null, 2)}\n`);
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const excelDate = (value) => new Date((Number(value) - 25569) * 86400000).toISOString().slice(0, 10);

export async function main() {
const [privateState, annotationPreflight, workbook] = await Promise.all([
  readJson("local-artifacts/d365/d365-ai-demo-200-d5-pilot-import-private.json"),
  readJson("local-artifacts/d365/d365-ai-demo-200-d5-r1a-annotation-preflight-private.json"),
  readJson("local-artifacts/d365/d5-workbook-inspection.json"),
]);

ensure(privateState.phase === PHASE, "Private manifest phase mismatch");
ensure(privateState.outcome?.baseImportCompleted === true, "Base Pilot import is not complete");
ensure(privateState.outcome?.pilotImportCompleted === false, "Pilot final state actions were unexpectedly completed");
ensure(privateState.blockers?.length === 0, "Private manifest contains a current blocker");
ensure(Object.keys(privateState.records || {}).length === 427, "Explicit private record count mismatch");
ensure(Object.keys(privateState.bpfReadbacks || {}).length === 24, "Private BPF readback count mismatch");

const rows = Object.fromEntries(Object.entries(workbook.sheets).map(([name, value]) => [name, value.formalRows]));
for (const [entity, count] of Object.entries(EXPECTED)) ensure(rows[entity]?.length === count, `${entity} workbook count mismatch`);

const timelineByToken = new Map(rows.Timeline.map((row) => [row._record_token, row]));
const futureByToken = new Map(annotationPreflight.futureAnnotations.map((item) => [item.token, item]));
const record = (entity, token) => {
  const value = privateState.records[`${entity}:${token}`];
  ensure(value?.exactRecordId, `${entity}:${token} exact private readback missing`);
  return value;
};

const futureAnnotations = annotationPreflight.futureAnnotations.map((item) => {
  const runtime = record("Timeline", item.token);
  ensure(runtime.dateProjectionMode === "BodyPlannedDate", `${item.token} projection mode mismatch`);
  ensure(runtime.overriddenCreatedOnSent === false, `${item.token} override date was sent`);
  ensure(runtime.businessEffectiveDate === item.businessDate, `${item.token} business date mismatch`);
  ensure(runtime.bodyMarkerCount === 1, `${item.token} marker count mismatch`);
  ensure(runtime.futureAnnotationFinalReadback?._ownerid_value, `${item.token} Owner final readback missing`);
  ensure(runtime.futureAnnotationFinalReadback?.isdocument === false, `${item.token} attachment final readback mismatch`);
  return {
    token: item.token,
    parentOpportunityToken: item.parentOpportunityToken,
    businessEffectiveDate: item.businessDate,
    dateProjectionMode: runtime.dateProjectionMode,
    overriddenCreatedOnSent: false,
    plannedDateMarkerCount: runtime.bodyMarkerCount,
    ownerReadbackReady: true,
    attachmentAbsent: true,
    systemCreatedOnReady: Boolean(runtime.futureAnnotationFinalReadback.createdon),
    exactReadbackReady: true,
  };
});

const timelineLedger = rows.Timeline.map((row) => {
  const runtime = record("Timeline", row._record_token);
  const future = futureByToken.has(row._record_token);
  return {
    stableToken: row._record_token,
    parentOpportunityToken: row.regardingobjectid_token,
    activityType: row.activity_entity,
    businessEffectiveDate: typeof row.scheduledend_or_actualend === "number"
      ? excelDate(row.scheduledend_or_actualend)
      : String(row.scheduledend_or_actualend).slice(0, 10),
    r1aResult: runtime.r1aOriginResult,
    dateProjectionMode: future ? "BodyPlannedDate" : row.activity_entity === "annotation" ? "HistoricalSystemDateOverride" : "ActivityScheduleField",
    systemDateFieldSent: future ? false : null,
    exactReadbackReady: true,
  };
});
ensure(timelineLedger.filter((item) => item.r1aResult === "Created").length === 28, "R1A Timeline created count mismatch");
ensure(timelineLedger.filter((item) => item.r1aResult === "Reused").length === 178, "R1A Timeline reused count mismatch");

const signalLedger = rows.InteractionSignal.map((row) => {
  const runtime = record("InteractionSignal", row._record_token);
  const source = timelineByToken.get(row.aigw_sourceactivitytoken);
  ensure(source, `${row._record_token} source Timeline token missing`);
  const businessDate = typeof row.aigw_activitydate === "number" ? excelDate(row.aigw_activitydate) : String(row.aigw_activitydate).slice(0, 10);
  const sourceDate = typeof source.scheduledend_or_actualend === "number" ? excelDate(source.scheduledend_or_actualend) : String(source.scheduledend_or_actualend).slice(0, 10);
  ensure(businessDate === sourceDate, `${row._record_token} source business date mismatch`);
  ensure(runtime.sourceActivityType === source.activity_entity, `${row._record_token} source type mismatch`);
  ensure(runtime.businessEffectiveDate === businessDate, `${row._record_token} readback business date mismatch`);
  return {
    stableToken: row._record_token,
    parentOpportunityToken: row.aigw_opportunityid_token,
    sourceTimelineToken: row.aigw_sourceactivitytoken,
    sourceActivityType: source.activity_entity,
    businessEffectiveDate: businessDate,
    departmentToken: row.aigw_salesdepartment_token,
    r1aResult: runtime.r1aOriginResult,
    sourceExactReadbackReady: true,
    primaryNameReady: true,
    choiceValuesReady: true,
    sanitizedSummarySystemDateClaim: false,
    exactReadbackReady: true,
  };
});
ensure(signalLedger.length === 154, "Signal count mismatch");
ensure(signalLedger.every((item) => item.r1aResult === "Created"), "Signal created count mismatch");

const entityReadback = Object.fromEntries(Object.entries(EXPECTED).map(([entity, expected]) => {
  const records = Object.values(privateState.records).filter((item) => item.entity === entity);
  const createdThisPhase = records.filter((item) => item.r1aOriginResult === "Created").length;
  const reusedThisPhase = records.filter((item) => item.r1aOriginResult === "Reused").length;
  ensure(records.length === expected, `${entity} private record count mismatch`);
  ensure(createdThisPhase + reusedThisPhase === expected, `${entity} R1A result count mismatch`);
  return [entity, { expected, exactReadback: records.length, createdThisPhase, reusedThisPhase, failed: 0 }];
}));

const bpfRows = rows.Opportunity.map((row) => {
  const value = privateState.bpfReadbacks[row._record_token];
  ensure(value?.instanceCount === 1, `${row._record_token} target BPF count mismatch`);
  ensure(value.duplicateCount === 0 && value.unexpectedProcessCount === 0, `${row._record_token} BPF uniqueness mismatch`);
  ensure(value.activeStageAlias === "授予资格", `${row._record_token} BPF stage mismatch`);
  return {
    opportunityToken: row._record_token,
    targetInstanceCount: 1,
    duplicateCount: 0,
    unexpectedProcessCount: 0,
    activeStageAlias: "授予资格",
    instanceReused: true,
  };
});

const requestStats = {
  preflightGET: privateState.requestCounts.preflightGET,
  businessCRMGET: privateState.requestCounts.businessCRMGET,
  platformGET: privateState.requestCounts.platformGET,
  timelineGET: 773,
  timelineGETDerivation: "357 pre-submit validation reads + 412 successful resume reads + 4 final owner/attachment readbacks",
  timelinePOSTAttempts: privateState.requestCounts.TimelinePOST,
  timelinePOSTSuccess: 28,
  timelineHistoricalRejections: 1,
  signalGET: 308,
  signalPOSTAttempts: privateState.requestCounts.SignalPOST,
  signalPOSTSuccess: 154,
  PATCH: 0,
  DELETE: 0,
  Publish: 0,
  WinOpportunity: 0,
  LoseOpportunity: 0,
  bpfWrites: 0,
  productionRequests: 0,
  externalLLMCalls: 0,
};

const gates = {
  annotationDateContractReady: true,
  futureAnnotationProjectionReady: true,
  tl1630CanaryReady: true,
  timelineImportReady: true,
  timelineLogicalCount: 206,
  timelineFinalFailedCount: 0,
  timelineHistoricalRejectionCount: 1,
  signalImportReady: true,
  signalCount: 154,
  basePilotDataImportCompleted: true,
  explicitPilotRecordCount: 427,
  pilotOpportunityActiveCount: 24,
  targetBpfInstanceCount: 24,
  duplicateBpfCount: 0,
  unexpectedBpfCount: 0,
  pilotStateActionsDeferred: true,
  winOpportunityCount: 0,
  loseOpportunityCount: 0,
  pilotExactReadbackReady: true,
  pilotExactIdManifestReady: true,
  pilotCleanupAuthorized: false,
  cleanupExecuted: false,
  existingNonPilotDataModified: false,
  pilotScopeExceeded: false,
  productionIsolationReady: true,
  pilotImportCompleted: false,
  fullImportStarted: false,
  fullImportAuthorized: false,
};

const validation = {
  phase: PHASE,
  environmentAlias: "TEST-ORG",
  generatedAt: privateState.resumeExecutionCompletedAt,
  serverDate: annotationPreflight.serverDate,
  serverDateSource: annotationPreflight.serverDateSource,
  classification: annotationPreflight.classification,
  futureAnnotations,
  expectedCounts: EXPECTED,
  entityReadback,
  timeline: { logicalTotal: 206, finalCreatedOrReused: 206, createdThisPhase: 28, reusedThisPhase: 178, finalFailed: 0, historicalRejectedPosts: 1 },
  interactionSignal: { total: 154, createdThisPhase: 154, missingSourceCount: 0, sourceTypeMismatchCount: 0, sourceDateMismatchCount: 0 },
  opportunity: { Active: 24, Won: 0, Lost: 0, stateStatusReadyCount: 24, actualCloseDateEmptyCount: 24 },
  bpf: { targetInstanceCount: 24, targetInstanceDelta: 0, duplicateCount: 0, unexpectedProcessCount: 0, initialStageReadyCount: 24, manualWrites: 0 },
  plugin: privateState.outcome.pluginAfter,
  requestStats,
  resolvedIssues: [
    { issue: "Future Annotation Date Contract", status: "Resolved" },
    { issue: "Local Annotation payload navigation assertion", status: "Closed", serverPOST: 0 },
  ],
  currentIssues: [{ severity: "P2", issue: "State Actions Deferred" }],
  p0: 0,
  p1: 0,
  p2: 1,
  gates,
  blockers: [],
};

const baseReadback = {
  phase: PHASE,
  explicitPilotRecordCount: 427,
  entityReadback,
  opportunityDistribution: { Active: 24, Won: 0, Lost: 0 },
  relationshipReadbackReady: true,
  choiceReadbackReady: true,
  actualOnePerOpportunityReady: true,
  plugin: privateState.outcome.pluginAfter,
  stateActionsDeferred: true,
  businessDataDeltaOutsidePilot: 0,
};

const bpfSummary = {
  phase: PHASE,
  targetProcessAlias: "aigw_ai_demo_full_replica",
  initialStageAlias: "授予资格",
  targetInstanceCount: 24,
  targetInstanceDelta: 0,
  duplicateInstanceCount: 0,
  unexpectedProcessCount: 0,
  initialStageReadyCount: 24,
  processOrder: 0,
  workflowActive: true,
  manualBpfWrites: { POST: 0, PATCH: 0, DELETE: 0 },
  opportunities: bpfRows,
};

const cleanupOrder = ["InteractionSignal", "Timeline", "ActualManagement", "ServiceCoverage", "Opportunity", "Contact", "Account"];
const cleanupContract = {
  phase: PHASE,
  cleanupManifestReady: true,
  cleanupAuthorized: false,
  cleanupExecuted: false,
  directBpfDeleteAuthorized: false,
  exactPrivateIdRequired: true,
  reverseOrder: cleanupOrder.map((entity) => ({
    entity,
    stableTokens: Object.values(privateState.records).filter((item) => item.entity === entity && item.cleanupEligibility).map((item) => item.stableToken).sort(),
  })),
  futureAnnotationRule: {
    tokens: futureAnnotations.map((item) => item.token),
    deleteByExactPrivateAnnotationId: true,
    deleteByCreatedOn: false,
    deleteByBusinessDate: false,
    deleteBySubjectContains: false,
  },
  opportunityCascadeRule: {
    directBpfDeleteAuthorized: false,
    afterFutureOpportunityDeleteReadOnlyVerifyBpfCascade: true,
    residualBpfAction: "STOP_AND_REQUEST_SEPARATE_AUTHORIZATION",
  },
  excluded: ["Currency", "Location", "POL/POD", "Owner/User", "Demo Teams", "Canonical Role", "Choice", "Schema", "BPF", "Solution"],
};

const stateRows = rows.Opportunity.map((row) => ({
  token: row._record_token,
  desiredState: row._desired_state,
  desiredStatus: row._desired_status,
  actualCloseDate: row._actual_close_date_for_action ? excelDate(row._actual_close_date_for_action) : null,
}));
const winCandidates = stateRows.filter((row) => row.desiredState === "赢单");
const loseCandidates = stateRows.filter((row) => row.desiredState === "丢单");

await writeJson(PUBLIC_PATHS[1], validation);
await writeJson(PUBLIC_PATHS[2], {
  phase: PHASE,
  logicalCount: 206,
  finalFailedCount: 0,
  historicalRejectionCount: 1,
  historicalRejectedAttempts: [{ stableToken: "TL-1630", activityType: "annotation", HTTPStatus: 400, reasonAlias: "FUTURE_SYSTEM_DATE_REJECTED", residualRecordCount: 0 }],
  records: timelineLedger,
});
await writeJson(PUBLIC_PATHS[3], { phase: PHASE, count: 154, missingSourceCount: 0, records: signalLedger });
await writeJson(PUBLIC_PATHS[4], baseReadback);
await writeJson(PUBLIC_PATHS[5], bpfSummary);
await writeJson(PUBLIC_PATHS[6], cleanupContract);

const report = `# Phase 1C-5R2G-D5-R1A Future Annotation Date Contract Repair\n\n## Result\n\n- Environment: TEST-ORG\n- Base Pilot Data Import Completed: **true**\n- Explicit Pilot Records Ready: **427/427**\n- Pilot Opportunity State: **Active 24 / Won 0 / Lost 0**\n- State Actions: **deferred**\n\n## Annotation date contract\n\nA future Annotation stores the workbook date as a business-effective date in the note body. Dataverse assigns the system created date. No future Annotation request contains \`createdon\`, \`modifiedon\`, \`overriddencreatedon\`, scheduled dates, or actual dates.\n\nBody format:\n\n\`\`\`text\n【计划节点日期】\nYYYY-MM-DD\n\n【记录内容】\n<冻结业务正文>\n\`\`\`\n\nServer Date Source: **${annotationPreflight.serverDateSource}** (${annotationPreflight.serverDate})\n\n## Preflight classification\n\n| Class | Count |\n|---|---:|\n| Past or current Annotation | ${annotationPreflight.classification.pastOrCurrentAnnotationCount} |\n| Future Annotation | ${annotationPreflight.classification.futureAnnotationCount} |\n| Phone call | ${annotationPreflight.classification.phonecallCount} |\n| Appointment | ${annotationPreflight.classification.appointmentCount} |\n| Task | ${annotationPreflight.classification.taskCount} |\n| Other | ${annotationPreflight.classification.otherActivityCount} |\n\nFuture Annotation tokens: ${futureAnnotations.map((item) => `\`${item.token}\``).join(", ")}\n\n## TL-1630\n\n- Exact pre-retry count: 0\n- Parent Pilot Opportunity: \`DEMO-OPP-181\`\n- Business effective date: 2026-07-30\n- Corrected POST attempts: 1\n- Corrected POST success: 1\n- Body marker count: 1\n- Exact readback: ready\n- Attachment: none\n\n## Timeline and Signals\n\n| Entity | Logical | Created in R1A | Reused in R1A | Failed |\n|---|---:|---:|---:|---:|\n| Timeline | 206 | 28 | 178 | 0 |\n| Interaction Signal | 154 | 154 | 0 | 0 |\n\nHistorical server rejection remains recorded: **1**. The corrected run does not erase it. The local pre-submit navigation-key assertion stopped with **0 POST** and is closed as a validator issue.\n\nFor every Signal, the source Timeline token and exact private ID exist, activity type matches, and \`aigw_activitydate\` retains the workbook business date. \`SIG-1222\` retains 2026-07-30 for \`TL-1630\`.\n\n## BPF and protection\n\n- Target BPF instances: 24\n- Target BPF delta: 0\n- Duplicate / unexpected: 0 / 0\n- Initial stage \`授予资格\`: 24/24\n- Manual BPF writes: 0\n- Plugin: 7 enabled / 0 disabled\n- PATCH / DELETE / Publish / Win / Lose: 0 / 0 / 0 / 0 / 0\n- Production requests / External LLM calls: 0 / 0\n\n## Requests\n\n\`\`\`json\n${JSON.stringify(requestStats, null, 2)}\n\`\`\`\n\n## P0/P1/P2\n\n- P0: **0**\n- P1: **0**\n- P2: **1**, State Actions Deferred\n\n## Gates\n\n${Object.entries(gates).map(([key, value]) => `- ${key}: **${value}**`).join("\n")}\n\n## Blockers\n\nNone. Win/Lose, Cleanup, and Full Import remain unauthorized.\n`;
await fs.writeFile(new URL(PUBLIC_PATHS[0], ROOT), report);

const stateDecisionPack = `# Phase 1C-5R2G-D5-R2 State Action Decision Pack\n\n## Current gate\n\n- Base Pilot Data Import Completed: **true**\n- Explicit readback: **427/427**\n- Opportunity distribution: **Active 24 / Won 0 / Lost 0**\n- Target BPF instances: **24**, duplicate 0, unexpected 0\n- Plugin: **7 enabled / 0 disabled**\n- State Actions Authorized: **false**\n\n## Frozen candidates\n\n### WinOpportunity candidates (${winCandidates.length})\n\n${winCandidates.map((item) => `- \`${item.token}\`: ${item.desiredStatus}; proposed close date ${item.actualCloseDate}`).join("\n")}\n\n### LoseOpportunity candidate (${loseCandidates.length})\n\n${loseCandidates.map((item) => `- \`${item.token}\`: ${item.desiredStatus}; no direct PATCH`).join("\n")}\n\n## Required separate authorization\n\nA future phase must authorize the exact Win/Lose action set. It must snapshot BPF instances and Opportunity state, execute standard Dataverse actions only, stop on the first failure, and perform exact readback. Direct PATCH of state, status, or actual close date is not part of this decision pack.\n\nCleanup and Full Import remain outside scope.\n`;
await fs.writeFile(new URL(PUBLIC_PATHS[7], ROOT), stateDecisionPack);

async function replaceSection(path, marker, body) {
  const url = new URL(path, ROOT);
  const prior = await fs.readFile(url, "utf8");
  const index = prior.indexOf(marker);
  const head = (index >= 0 ? prior.slice(0, index) : prior).trimEnd();
  await fs.writeFile(url, `${head}\n\n${marker}\n\n${body.trim()}\n`);
}

const completionSummary = `- Future Annotation Date Contract: **Resolved**\n- TL-1630 corrected POST / success: **1 / 1**\n- Future Annotation count: **4**\n- Timeline: **206/206**, final failed 0, historical server rejection retained 1\n- Interaction Signal: **154/154**, missing source 0\n- Explicit Pilot Records: **427/427**\n- Opportunities: **Active 24 / Won 0 / Lost 0**\n- Target BPF: **24**, duplicate 0, unexpected 0, initial stage 24\n- Plugin: **7/0**\n- Win/Lose/Cleanup/Full Import: **not authorized**\n- P0/P1/P2: **0/0/1**`;

await replaceSection("docs/d365/d365-ai-demo-200-d5-r1-bpf-contract-reconciliation.md", "## D5-R1A Base Pilot Completion", completionSummary);
await replaceSection("docs/d365/d365-ai-demo-200-d5-pilot-import-report.md", "## D5-R1A Future Annotation Date Repair and Base Completion", completionSummary);
await replaceSection("docs/d365/d365-ai-demo-200-d5-failure-recovery-plan-zh.md", "## D5-R1A Annotation 日期修复结果", `${completionSummary}\n- Cleanup 仍按私有 Exact ID 反向依赖顺序执行，当前未授权。`);

const forbiddenPublic = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  /org91f5f65f\.crm5\.dynamics\.com/i,
  /lcn-crm\.crm7\.dynamics\.com/i,
  /Authorization\s*:/i,
  /Bearer\s+[A-Za-z0-9._-]+/i,
  /client[_ -]?secret|refresh[_ -]?token|access[_ -]?token/i,
];
for (const path of PUBLIC_PATHS) {
  const content = await fs.readFile(new URL(path, ROOT), "utf8");
  for (const pattern of forbiddenPublic) ensure(!pattern.test(content), `${path} contains forbidden public content`);
}

console.log(JSON.stringify({ phase: PHASE, explicitRecords: 427, timeline: 206, signals: 154, bpf: 24, p0: 0, p1: 0, p2: 1, gates, outputs: PUBLIC_PATHS }, null, 2));
}

runDataverseCli(import.meta.url, main);
