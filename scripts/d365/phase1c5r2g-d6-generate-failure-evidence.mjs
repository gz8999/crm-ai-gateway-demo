import crypto from "node:crypto";
import fs from "node:fs/promises";
import { containsGuid, D6_FULL_IMPORT, stableJson } from "../dataverse/lib/d6-full-import-contract.mjs";

const ROOT = new URL("../../", import.meta.url);
const DOCS = new URL("docs/d365/", ROOT);
const WORKBOOK = new URL("artifacts/d365/CRM_AI_Gateway_D365_Demo_200_Remaining176_v1.xlsx", ROOT);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const writeJson = (name, value) => fs.writeFile(new URL(name, DOCS), `${JSON.stringify(value, null, 2)}\n`);
const tokenFor = (entity, row) => row._record_token;

const [workbookData, privateState, partial, references, workbookBytes] = await Promise.all([
  fs.readFile(new URL("local-artifacts/d365/d6-workbook-data-private.json", ROOT), "utf8").then(JSON.parse),
  fs.readFile(new URL("local-artifacts/d365/d365-ai-demo-200-d6-full-import-private.json", ROOT), "utf8").then(JSON.parse),
  fs.readFile(new URL("local-artifacts/d365/d6-partial-readback-public.json", ROOT), "utf8").then(JSON.parse),
  fs.readFile(new URL("local-artifacts/d365/d6-reference-recovery-readback-public.json", ROOT), "utf8").then(JSON.parse),
  fs.readFile(WORKBOOK),
]);

const workbook = { path: "artifacts/d365/CRM_AI_Gateway_D365_Demo_200_Remaining176_v1.xlsx", bytes: workbookBytes.length, sha256: sha256(workbookBytes) };
const tokenManifest = Object.fromEntries(D6_FULL_IMPORT.entities.map((entity) => {
  const tokens = workbookData.complement[entity].map((row) => tokenFor(entity, row)).sort();
  return [entity, { count: tokens.length, tokenSetSha256: sha256(stableJson(tokens)), tokens }];
}));
const complementManifest = {
  phase: D6_FULL_IMPORT.phase,
  generationRun: D6_FULL_IMPORT.generationRun,
  sourceRule: "Formal Projection exact token set MINUS Compact Pilot exact token set",
  workbook,
  counts: D6_FULL_IMPORT.remainingCounts,
  explicitRecordCount: D6_FULL_IMPORT.explicitRemaining,
  pilotTokenOverlapCount: 0,
  missingFormalTokenCount: 0,
  duplicateRemainingTokenCount: 0,
  parentTokenMissingCount: 0,
  tokenManifest,
  ready: true,
};

const batchLedger = {
  phase: D6_FULL_IMPORT.phase,
  status: "STOPPED_AT_FIRST_FAILURE",
  batches: privateState.batchLedger.map((batch) => ({
    batchId: batch.batchId,
    entity: batch.entity,
    expected: batch.expected,
    attempt: batch.attempt,
    created: batch.created,
    reused: batch.reused,
    failed: batch.failed,
    completed: batch.completed,
    blocker: batch.blocker || null,
  })),
  nextRecoveryBatch: "O1",
  nextRecoveryToken: "DEMO-OPP-005",
  automaticRollbackExecuted: false,
};

const originalRequests = privateState.requestCounts;
const recoveryRequests = { referenceReadbackGET: references.requestCounts.GET, partialReadbackGET: partial.requestCounts.GET * 2 };
const totalOriginalGET = originalRequests.businessCRMGET + originalRequests.platformGET + originalRequests.securityGET + originalRequests.opportunityCloseGET;
const requestCounts = {
  preflightGET: originalRequests.preflightGET,
  businessCRMGET: originalRequests.businessCRMGET,
  platformGET: originalRequests.platformGET,
  securityGET: originalRequests.securityGET,
  opportunityCloseGET: originalRequests.opportunityCloseGET,
  recoveryGET: recoveryRequests.referenceReadbackGET + recoveryRequests.partialReadbackGET,
  totalGET: totalOriginalGET + recoveryRequests.referenceReadbackGET + recoveryRequests.partialReadbackGET,
  AccountPOST: originalRequests.AccountPOST,
  ContactPOST: originalRequests.ContactPOST,
  OpportunityPOSTAttempts: originalRequests.OpportunityPOST,
  OpportunityPOSTSuccess: 4,
  OpportunityPOSTFailed: 1,
  CoveragePOST: originalRequests.CoveragePOST,
  ActualPOST: originalRequests.ActualPOST,
  TimelinePOST: originalRequests.TimelinePOST,
  SignalPOST: originalRequests.SignalPOST,
  WinOpportunityAttempts: originalRequests.WinOpportunityAttempts,
  WinOpportunitySuccess: originalRequests.WinOpportunitySuccess,
  LoseOpportunityAttempts: originalRequests.LoseOpportunityAttempts,
  LoseOpportunitySuccess: originalRequests.LoseOpportunitySuccess,
  PATCH: originalRequests.PATCH,
  DELETE: originalRequests.DELETE,
  Publish: originalRequests.Publish,
  BPFWrites: originalRequests.BPFWrites,
  TeamRoleMembershipChanges: originalRequests.TeamRoleMembershipChanges,
  ProductionRequests: originalRequests.ProductionRequests,
  ExternalLLMCalls: originalRequests.ExternalLLMCalls,
};

const bpfSummary = {
  phase: D6_FULL_IMPORT.phase,
  expectedNew: 176,
  expectedFinal: 200,
  currentNew: partial.bpf.newCount,
  currentTotal: partial.bpf.total,
  initialStageCount: partial.bpf.initialStage,
  duplicateCount: partial.bpf.duplicate,
  unexpectedProcessCount: partial.bpf.unexpectedProcess,
  manualBpfWrites: 0,
  processOrder: 0,
  exactPartialReadbackReady: partial.bpfRows.every((row) => row.ready),
  fullReady: false,
};
const stateSummary = {
  phase: D6_FULL_IMPORT.phase,
  expectedRemaining: { win: 84, lose: 8 },
  attempted: { win: 0, lose: 0 },
  succeeded: { win: 0, lose: 0 },
  currentDistribution: partial.stateDistribution,
  finalTargetDistribution: D6_FULL_IMPORT.finalState,
  currentOpportunityClose: partial.opportunityClose,
  finalOpportunityCloseTarget: 100,
  statePatchCount: 0,
  completed: false,
};
const finalReadback = {
  phase: D6_FULL_IMPORT.phase,
  status: "PARTIAL_STOPPED",
  capturedAt: partial.capturedAt,
  partialExactReadbackReady: partial.ready,
  currentExplicitCounts: partial.partialExplicitCounts,
  currentExplicitRecordCount: partial.partialExplicitRecordCount,
  finalTargetCounts: D6_FULL_IMPORT.formalCounts,
  finalTargetExplicitRecordCount: D6_FULL_IMPORT.explicitFinal,
  stateDistribution: partial.stateDistribution,
  opportunityClose: partial.opportunityClose,
  bpf: partial.bpf,
  failedTokenResidualCount: partial.failedTokenResidualCount,
  references: {
    ready: references.ready,
    requiredLocationCount: references.requiredLocationCount,
    requiredPolpodCount: references.requiredPolpodCount,
    suzhouResolvedExactlyOnce: references.suzhouResolvedExactlyOnce,
    missingLocationCount: references.missingLocationCount,
    duplicateLocationCount: references.duplicateLocationCount,
    missingPolpodCount: references.missingPolpodCount,
    duplicatePolpodCount: references.duplicatePolpodCount,
  },
  requestCounts,
  fullReady: false,
};

const cleanupManifest = {
  phase: D6_FULL_IMPORT.phase,
  status: "PLANNED_ONLY_PARTIAL_IMPORT",
  cleanupAuthorized: false,
  cleanupExecuted: false,
  exactIdManifestComplete: false,
  currentImportedExplicitRecordCount: partial.partialExplicitRecordCount,
  finalTargetExplicitRecordCount: D6_FULL_IMPORT.explicitFinal,
  reverseOrder: ["InteractionSignal", "Timeline", "ActualManagement", "ServiceCoverage", "Opportunity", "Contact", "Account"],
  records: Object.fromEntries(["InteractionSignal", "Timeline", "ActualManagement", "ServiceCoverage", "Opportunity", "Contact", "Account"].map((entity) => [entity, {
    targetTokenCount: workbookData.formal[entity].length,
    tokens: workbookData.formal[entity].map((row) => row._record_token).sort(),
    exactIdsAvailableOnlyInPrivateManifest: true,
  }])),
  neverCleanup: ["Currency", "Location", "POL/POD", "Owner/User", "Demo Teams", "Canonical Role", "Choice", "Schema", "BPF Definition", "Solution Components"],
  opportunityCloseRule: "Do not delete directly; validate future Opportunity cascade under separate authorization.",
  bpfRule: "Do not delete directly; stop on residual instance and request separate authorization.",
};

const gates = {
  FullImportAuthorized: true,
  ComplementManifestReady: true,
  RemainingTokenOverlapCount: 0,
  RemainingExplicitRecordCount: D6_FULL_IMPORT.explicitRemaining,
  AccountImportReady: partial.partialExplicitCounts.Account === 60,
  ContactImportReady: partial.partialExplicitCounts.Contact === 120,
  OpportunityImportReady: false,
  NewOpportunityCount: 4,
  NewTargetBPFCount: 4,
  TotalTargetBPFCount: partial.bpf.total,
  CoverageImportReady: false,
  ActualImportReady: false,
  TimelineImportReady: false,
  SignalImportReady: false,
  BaseFullDataImportCompleted: false,
  RemainingWinCandidateCount: 84,
  RemainingLoseCandidateCount: 8,
  RemainingStateActionsCompleted: false,
  FinalStateDistributionReady: false,
  OpportunityCloseFinalReady: false,
  FullExactReadbackReady: false,
  PartialExactReadbackReady: partial.ready,
  FullExactIDManifestReady: false,
  PartialExactIDManifestReady: true,
  FullCleanupManifestReady: false,
  CleanupAuthorized: false,
  CleanupExecuted: false,
  ExistingNonDemoDataModified: false,
  ProductionIsolationReady: requestCounts.ProductionRequests === 0,
  GatewayFullDatasetIntegrationReady: false,
  FullImportCompleted: false,
  FullImportClosed: false,
};
const validationManifest = {
  phase: D6_FULL_IMPORT.phase,
  generatedAt: new Date().toISOString(),
  status: "FAILED_SAFE_STOP",
  p0Count: 0,
  p1Count: 1,
  p2Count: 0,
  blocker: {
    token: "DEMO-OPP-005",
    batch: "O1",
    category: "REFERENCE_CACHE_SCOPE_DEFECT",
    rootCause: "The executor loaded only Pilot Location references; the Formal token 29: Suzhou therefore produced an empty Lookup bind.",
    referenceMasterMissing: false,
    failedRecordResidualCount: partial.failedTokenResidualCount,
    recoveryReferenceReadbackReady: references.ready,
    resumeRequiresNewAuthorization: true,
  },
  workbook,
  requestCounts,
  gates,
};

for (const [name, value] of Object.entries({ complementManifest, batchLedger, bpfSummary, stateSummary, finalReadback, cleanupManifest, validationManifest })) {
  if (containsGuid(value)) throw new Error(`${name} contains an exact GUID`);
}

await writeJson("d365-ai-demo-200-d6-complement-manifest.json", complementManifest);
await writeJson("d365-ai-demo-200-d6-validation-manifest.json", validationManifest);
await writeJson("d365-ai-demo-200-d6-batch-ledger-public.json", batchLedger);
await writeJson("d365-ai-demo-200-d6-bpf-readback-summary.json", bpfSummary);
await writeJson("d365-ai-demo-200-d6-state-action-summary.json", stateSummary);
await writeJson("d365-ai-demo-200-d6-final-readback.json", finalReadback);
await writeJson("d365-ai-demo-200-d6-full-cleanup-manifest.json", cleanupManifest);

const report = `# Phase 1C-5R2G-D6 Remaining 176 Full Import\n\n## Result\n\n- Status: **FAILED SAFE STOP**\n- Full Import Authorized: **true**\n- Full Import Completed / Closed: **false / false**\n- P0 / P1 / P2: **0 / 1 / 0**\n- Cleanup Authorized / Executed: **false / false**\n- Production Requests / External LLM Calls: **0 / 0**\n\n## Complement\n\n- Exact set rule: Formal Projection minus Compact Pilot\n- Counts: Account 53, Contact 111, Opportunity 176, Coverage 225, Actual 118, Timeline 1594, Signal 1196\n- Explicit complement: 3473\n- Pilot overlap / missing Formal token / duplicate token / missing parent: 0 / 0 / 0 / 0\n- Remaining workbook: ${workbook.path}\n- Size / SHA-256: ${workbook.bytes} / ${workbook.sha256}\n\n## Execution\n\n| Object | Attempt | Created | Reused | Failed | Current exact total |\n|---|---:|---:|---:|---:|---:|\n| Account | 53 | 53 | 0 | 0 | 60 |\n| Contact | 111 | 111 | 0 | 0 | 120 |\n| Opportunity | 5 | 4 | 0 | 1 | 28 |\n| ServiceCoverage | 0 | 0 | 0 | 0 | 15 |\n| ActualManagement | 0 | 0 | 0 | 0 | 12 |\n| Timeline | 0 | 0 | 0 | 0 | 206 |\n| InteractionSignal | 0 | 0 | 0 | 0 | 154 |\n\nA1, A2 and C1-C4 completed. O1 stopped on its fifth token. No later batch or state action ran.\n\n## Blocker and recovery evidence\n\n- Failed token: **DEMO-OPP-005**\n- Root cause: the executor reused the Pilot-only Location cache. The Formal Location '29: Suzhou' was not in that cache, producing an empty Lookup reference.\n- Failed-token residual records: **0**\n- Reference master result: **17/17 Location and 11/11 POL/POD resolve exactly once**\n- '29: Suzhou': **resolved exactly once**\n- Executor repair: Formal-wide dynamic reference readback plus exact-cardinality and non-empty bind gates.\n- Resume status: **not authorized in this execution**. A new controlled recovery approval is required.\n\n## Partial exact readback\n\n- Explicit records: **595**\n- Account / Contact / Opportunity / Coverage / Actual / Timeline / Signal: **60 / 120 / 28 / 15 / 12 / 206 / 154**\n- Opportunity state Won / Active / Lost: **7 / 20 / 1**\n- OpportunityClose Win / Lose / Total: **7 / 1 / 8**\n- BPF Target / initial stage / duplicate / unexpected: **28 / 28 / 0 / 0**\n- New OpportunityClose: **0**\n\n## Requests and safety\n\n- GET total: ${requestCounts.totalGET} (preflight is a tagged subset, not added twice)\n- Account / Contact / Opportunity POST attempts: ${requestCounts.AccountPOST} / ${requestCounts.ContactPOST} / ${requestCounts.OpportunityPOSTAttempts}\n- Opportunity POST success / failed: ${requestCounts.OpportunityPOSTSuccess} / ${requestCounts.OpportunityPOSTFailed}\n- Coverage / Actual / Timeline / Signal POST: 0 / 0 / 0 / 0\n- Win / Lose: 0 / 0\n- PATCH / DELETE / Publish / BPF writes / Team-Role changes: 0 / 0 / 0 / 0 / 0\n- Production requests / External LLM calls: 0 / 0\n- Existing non-Demo data modified: **false**\n- Gateway files modified: **false**\n\n## Gates\n\n${Object.entries(gates).map(([key, value]) => `- ${key}=**${value}**`).join("\n")}\n`;
await fs.writeFile(new URL("d365-ai-demo-200-d6-full-import-report.md", DOCS), report);

const recovery = `# D6 失败恢复计划\n\n## 冻结状态\n\n- 已完成：A1、A2、C1-C4。\n- 部分批次：O1 已创建 DEMO-OPP-001 至 DEMO-OPP-004；DEMO-OPP-005 创建失败且残留为 0。\n- 当前精确记录数：595；BPF 28；OpportunityClose 8。\n- 本轮不回滚、不删除、不继续后续批次。\n\n## 根因与修复\n\n原执行器从 Pilot 预检缓存加载 Location，只覆盖 12 条 Pilot 引用。Formal Projection 需要 17 条，DEMO-OPP-005 的 '29: Suzhou' 未进入缓存，导致空 Lookup bind。修复后，执行器在首个 Opportunity 写入前读取全部 Active Location/POL-POD，并对 Formal 所需 17/11 个 Token 做精确一条校验；所有 OData bind 同时拒绝空值或非法 ID。\n\n## 恢复前强制门禁\n\n1. 取得新的 D6 Recovery 明确授权。\n2. 再次只读确认 Pilot + D6 partial 的 595 条显式记录和 28 条 BPF。\n3. 再次确认 17/17 Location、11/11 POL/POD，缺失和重复均为 0。\n4. 从 O1 / DEMO-OPP-005 恢复；A/C 和 DEMO-OPP-001..004 必须 read-before-write 后 Reused。\n5. 任一不一致立即停止，不执行 Coverage、Actual、Timeline、Signal 或状态动作。\n6. 全部 3900 条显式记录通过前，Win/Lose 必须保持 0。\n\n## 禁止\n\n不自动回滚，不删除，不 PATCH，不修改 BPF、Schema、Choice、权限或 Gateway，不访问生产，不执行 Cleanup。\n`;
await fs.writeFile(new URL("d365-ai-demo-200-d6-failure-recovery-plan-zh.md", DOCS), recovery);

const acceptance = `# D6 最终验收计划\n\nD6 当前未完成。恢复执行后仅在以下全部成立时才可关闭：\n\n- Explicit Records=3900；对象数量 60/120/200/240/130/1800/1350。\n- Target BPF=200，初始阶段 200，Duplicate/Unexpected=0/0。\n- 基础数据完成时状态为 7/192/1。\n- 官方 Win/Lose 剩余动作 84/8 全部逐条成功。\n- 最终状态 Won/Active/Lost=91/100/9。\n- OpportunityClose Win/Lose/Total=91/9/100，Duplicate/Attachment=0/0。\n- PATCH/DELETE/Publish/BPF writes/Team-Role changes/Production/External LLM=0。\n- Non-Demo data delta=0；Gateway allowlist 和源码不变。\n- Full Exact ID Manifest、Full Cleanup Manifest、测试和 XLSX 校验全部通过。\n\n在此之前：Full Import Completed=false，Full Import Closed=false，Cleanup Authorized=false，Gateway Full Dataset Integration Ready=false。\n`;
await fs.writeFile(new URL("d365-ai-demo-200-d6-final-acceptance-plan-zh.md", DOCS), acceptance);

console.log(JSON.stringify({ workbook, current: partial.partialExplicitCounts, p0: 0, p1: 1, p2: 0, gates }, null, 2));
