import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertFutureAnnotationPayload,
  buildAnnotationPayload,
  buildPlannedAnnotationBody,
  classifyTimelineRow,
  hasSystemDateField,
} from "../scripts/dataverse/lib/d5-r1a-annotation-contract.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const validationPath = "docs/d365/d365-ai-demo-200-d5-r1a-validation-manifest.json";
const publicPaths = [
  "docs/d365/d365-ai-demo-200-d5-r1a-annotation-date-repair.md",
  validationPath,
  "docs/d365/d365-ai-demo-200-d5-r1a-timeline-ledger-public.json",
  "docs/d365/d365-ai-demo-200-d5-r1a-signal-ledger-public.json",
  "docs/d365/d365-ai-demo-200-d5-r1a-base-import-readback.json",
  "docs/d365/d365-ai-demo-200-d5-r1a-bpf-integrity-summary.json",
  "docs/d365/d365-ai-demo-200-d5-r1a-cleanup-contract.json",
  "docs/d365/d365-ai-demo-200-d5-r2-state-action-decision-pack-zh.md",
];

test("D5-R1A future Annotation payload contains only body, subject, and one parent binding", () => {
  const payload = buildAnnotationPayload({
    subject: "Synthetic note",
    originalBody: "冻结业务正文",
    businessDate: "2026-07-30",
    executionServerDate: "2026-07-17",
    parentNavigation: "objectid_opportunity",
    parentEntitySet: "opportunities",
    parentId: "PRIVATE-ID",
  });

  assert.equal(assertFutureAnnotationPayload(payload), true);
  assert.equal(hasSystemDateField(payload), false);
  assert.equal("createdon" in payload, false);
  assert.equal("overriddencreatedon" in payload, false);
  assert.deepEqual(Object.keys(payload).sort(), ["notetext", "objectid_opportunity@odata.bind", "subject"]);
  assert.equal(payload.notetext, "【计划节点日期】\n2026-07-30\n\n【记录内容】\n冻结业务正文");
});

test("D5-R1A planned-date marker is idempotent and past Annotation behavior is retained", () => {
  const body = buildPlannedAnnotationBody({ businessDate: "2026-07-30", originalBody: "冻结业务正文" });
  assert.equal(buildPlannedAnnotationBody({ businessDate: "2026-07-30", originalBody: body }), body);
  assert.equal(body.split("【计划节点日期】").length - 1, 1);
  assert.equal(classifyTimelineRow({ activity_entity: "annotation", scheduledend_or_actualend: "2026-07-30" }, "2026-07-17"), "future-annotation");
  assert.equal(classifyTimelineRow({ activity_entity: "annotation", scheduledend_or_actualend: "2026-07-16" }, "2026-07-17"), "past-or-current-annotation");

  const past = buildAnnotationPayload({
    subject: "Historical note",
    originalBody: "历史正文",
    businessDate: "2026-07-16",
    executionServerDate: "2026-07-17",
    parentNavigation: "objectid_opportunity",
    parentEntitySet: "opportunities",
    parentId: "PRIVATE-ID",
  });
  assert.equal(past.overriddencreatedon, "2026-07-16T09:00:00Z");
  assert.equal(past.notetext, "历史正文");
  assert.equal(past.isdocument, false);
});

test("D5-R1A retains TL-1630 identity and completes all 206 Timeline records", async () => {
  const validation = await readJson(validationPath);
  const timeline = await readJson("docs/d365/d365-ai-demo-200-d5-r1a-timeline-ledger-public.json");
  const tl1630 = timeline.records.find((row) => row.stableToken === "TL-1630");

  assert.equal(timeline.logicalCount, 206);
  assert.equal(timeline.records.length, 206);
  assert.equal(timeline.finalFailedCount, 0);
  assert.equal(timeline.historicalRejectionCount, 1);
  assert.deepEqual(timeline.historicalRejectedAttempts, [{ stableToken: "TL-1630", activityType: "annotation", HTTPStatus: 400, reasonAlias: "FUTURE_SYSTEM_DATE_REJECTED", residualRecordCount: 0 }]);
  assert.equal(validation.timeline.createdThisPhase, 28);
  assert.equal(validation.timeline.reusedThisPhase, 178);
  assert.equal(tl1630.parentOpportunityToken, "DEMO-OPP-181");
  assert.equal(tl1630.businessEffectiveDate, "2026-07-30");
  assert.equal(tl1630.dateProjectionMode, "BodyPlannedDate");
  assert.equal(tl1630.systemDateFieldSent, false);
  const future = validation.futureAnnotations.find((row) => row.token === "TL-1630");
  assert.equal(future.ownerReadbackReady, true);
  assert.equal(future.attachmentAbsent, true);
  assert.equal(future.systemCreatedOnReady, true);
  assert.equal(validation.gates.tl1630CanaryReady, true);
});

test("D5-R1A completes 154 Signals and preserves the TL-1630 business-effective date", async () => {
  const signals = await readJson("docs/d365/d365-ai-demo-200-d5-r1a-signal-ledger-public.json");
  const linked = signals.records.find((row) => row.sourceTimelineToken === "TL-1630");

  assert.equal(signals.count, 154);
  assert.equal(signals.records.length, 154);
  assert.equal(signals.missingSourceCount, 0);
  assert.ok(linked);
  assert.equal(linked.stableToken, "SIG-1222");
  assert.equal(linked.sourceActivityType, "annotation");
  assert.equal(linked.businessEffectiveDate, "2026-07-30");
  assert.equal(linked.sourceExactReadbackReady, true);
  assert.equal(linked.sanitizedSummarySystemDateClaim, false);
});

test("D5-R1A exact private manifest contains 427 business records and 24 BPF readbacks", async () => {
  const privatePath = "local-artifacts/d365/d365-ai-demo-200-d5-pilot-import-private.json";
  await access(new URL(privatePath, root));
  execFileSync("git", ["check-ignore", "-q", privatePath], { cwd: new URL(root) });
  const manifest = await readJson(privatePath);

  assert.equal(Object.keys(manifest.records).length, 427);
  assert.equal(Object.keys(manifest.bpfReadbacks).length, 24);
  assert.equal(Object.values(manifest.records).every((row) => /^[0-9a-f-]{36}$/i.test(row.exactRecordId)), true);
  assert.equal(manifest.records["Timeline:TL-1630"].stableToken, "TL-1630");
  assert.equal(manifest.records["Timeline:TL-1630"].businessEffectiveDate, "2026-07-30");
  assert.equal(manifest.records["Timeline:TL-1630"].overriddenCreatedOnSent, false);
});

test("D5-R1A BPF and Opportunity integrity remain unchanged", async () => {
  const validation = await readJson(validationPath);
  const bpf = await readJson("docs/d365/d365-ai-demo-200-d5-r1a-bpf-integrity-summary.json");
  const base = await readJson("docs/d365/d365-ai-demo-200-d5-r1a-base-import-readback.json");

  assert.deepEqual(base.opportunityDistribution, { Active: 24, Won: 0, Lost: 0 });
  assert.equal(bpf.targetInstanceCount, 24);
  assert.equal(bpf.targetInstanceDelta, 0);
  assert.equal(bpf.duplicateInstanceCount, 0);
  assert.equal(bpf.unexpectedProcessCount, 0);
  assert.equal(bpf.initialStageReadyCount, 24);
  assert.equal(bpf.opportunities.length, 24);
  assert.equal(bpf.opportunities.every((row) => row.targetInstanceCount === 1 && row.activeStageAlias === "授予资格"), true);
  assert.deepEqual(bpf.manualBpfWrites, { POST: 0, PATCH: 0, DELETE: 0 });
  assert.deepEqual(validation.plugin, { enabled: 7, disabled: 0, ready: true });
});

test("D5-R1A performs no state action, cleanup, forbidden write, production request, or external call", async () => {
  const validation = await readJson(validationPath);
  const requests = validation.requestStats;
  for (const key of ["PATCH", "DELETE", "Publish", "WinOpportunity", "LoseOpportunity", "bpfWrites", "productionRequests", "externalLLMCalls"]) {
    assert.equal(requests[key], 0, key);
  }
  assert.equal(requests.timelinePOSTAttempts, 28);
  assert.equal(requests.timelinePOSTSuccess, 28);
  assert.equal(requests.timelineHistoricalRejections, 1);
  assert.equal(requests.signalPOSTAttempts, 154);
  assert.equal(requests.signalPOSTSuccess, 154);
  assert.deepEqual([validation.p0, validation.p1, validation.p2], [0, 0, 1]);
  assert.equal(validation.gates.pilotCleanupAuthorized, false);
  assert.equal(validation.gates.cleanupExecuted, false);
  assert.equal(validation.gates.pilotImportCompleted, false);
  assert.equal(validation.gates.fullImportStarted, false);
  assert.equal(validation.gates.fullImportAuthorized, false);
});

test("D5-R1A public artifacts contain no GUID, environment hostname, or credential", async () => {
  const forbidden = [
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    /org91f5f65f\.crm5\.dynamics\.com/i,
    /lcn-crm\.crm7\.dynamics\.com/i,
    /Authorization\s*:/i,
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /client[_ -]?secret|refresh[_ -]?token|access[_ -]?token/i,
  ];
  for (const path of publicPaths) {
    const content = await readFile(new URL(path, root), "utf8");
    for (const pattern of forbidden) assert.doesNotMatch(content, pattern, `${path} matched ${pattern}`);
  }
});
