import assert from "node:assert/strict";
import test from "node:test";
import { buildTimelineContentEvidence, buildTimelineDigest, buildTimelineExecutiveSynthesis, deriveTimelineAnalysis, timelineContentFacts, timelineDigestFacts } from "../server/decision/timelineDigest.mjs";
import { buildDeepAnalysisFactCatalog } from "../server/ai/deepAnalysis/deepAnalysisExternalProvider.mjs";

test("Timeline Digest preserves structured interaction meaning without raw content", () => {
  const digest = buildTimelineDigest({
    now: new Date("2027-01-15T00:00:00Z"),
    activities: [
      { activitytypecode: "phonecall", actualstart: "2027-01-14T00:00:00Z" },
      { activitytypecode: "appointment", scheduledstart: "2027-01-18T00:00:00Z" },
      { activitytypecode: "task", scheduledstart: "2026-12-20T00:00:00Z" },
    ],
    annotations: [{ annotationid: "should-not-escape", createdon: "2027-01-10T00:00:00Z", notetext: "customer identity and raw note" }],
    signals: [
      { aigw_activitydate: "2027-01-14T00:00:00Z", aigw_direction: 1, aigw_resultcategory: 2, aigw_customerresponselevel: 3, aigw_sentiment: 1, aigw_decisionmakerinvolved: true, aigw_commitmentmade: true, aigw_commitmentcompleted: false, aigw_commitmentduedate: "2027-01-20T00:00:00Z", aigw_objectionpresent: true, aigw_objectioncategory: 4, aigw_competitormentioned: false, aigw_serviceissuecategory: 5, aigw_issueresolved: false },
      { aigw_activitydate: "2027-01-12T00:00:00Z", aigw_direction: 1, aigw_resultcategory: 2, aigw_customerresponselevel: 3, aigw_sentiment: 1, aigw_decisionmakerinvolved: false, aigw_commitmentmade: true, aigw_commitmentcompleted: true, aigw_commitmentduedate: "2027-01-13T00:00:00Z", aigw_objectionpresent: false, aigw_competitormentioned: true },
    ],
  });
  assert.deepEqual(digest.activityMix, { phonecall: 1, appointment: 1, task: 1, annotation: 1 });
  assert.equal(digest.totalActivityCount, 4);
  assert.equal(digest.structuredSignalCount, 2);
  assert.equal(digest.lastActivityBand, "upcoming-within-7-days");
  assert.equal(digest.commitmentStatus.openCount, 1);
  assert.equal(digest.commitmentStatus.completedCount, 1);
  assert.equal(digest.commitmentStatus.dueBand, "overdue");
  assert.equal(digest.objectionStatus.status, "present");
  assert.equal(digest.serviceIssueStatus.status, "open");
  const serialized = JSON.stringify(digest);
  assert.equal(serialized.includes("should-not-escape"), false);
  assert.equal(serialized.includes("raw note"), false);
  assert.equal(serialized.includes("customer identity"), false);
});

test("Timeline Digest facts are request-scoped and safe for external analysis", () => {
  const digest = buildTimelineDigest({ now: new Date("2027-01-15T00:00:00Z"), activities: [{ activitytypecode: "phonecall", actualstart: "2027-01-14T00:00:00Z" }], signals: [{ aigw_commitmentmade: true, aigw_commitmentcompleted: false }] });
  const facts = timelineDigestFacts(digest);
  assert.ok(facts.some((item) => item.evidenceToken === "safeContext.timeline.commitmentStatus"));
  assert.ok(facts.every((item) => item.evidenceToken.startsWith("safeContext.timeline.")));
  const synthesis = buildTimelineExecutiveSynthesis({ evidence: [], digest });
  const catalog = buildDeepAnalysisFactCatalog({ safeDecisionContext: { timelineDigest: digest }, timelineExecutiveAnalysisPack: synthesis });
  assert.ok(catalog.some((item) => item.evidenceToken === "safeContext.timeline.executive.coverage"));
  const serialized = JSON.stringify(catalog);
  assert.doesNotMatch(serialized, /notetext|annotationid|customer identity|raw note/i);
});

test("Timeline content becomes redacted evidence excerpts with model-readable findings", () => {
  const evidence = buildTimelineContentEvidence({
    now: new Date("2027-01-15T00:00:00Z"),
    timelineEntries: [{ id: "tl-1", token: "TL-001", parentId: "opp-1" }],
    activities: [{ activityid: "tl-1", activitytypecode: "phonecall", subject: "客户确认下一步", description: "张三 john@example.com 将于 2027-02-01 跟进合同，金额 CNY 1,234,567。" }],
    signals: [{ aigw_sourceactivitytoken: "TL-001", aigw_activitydate: "2027-01-14", aigw_direction: "客户", aigw_resultcategory: "确认", aigw_commitmentmade: true, aigw_commitmentcompleted: false }],
  });
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].evidenceToken, "safeContext.timeline.content.TL-001");
  assert.match(evidence[0].excerpt, /下一步/);
  assert.doesNotMatch(evidence[0].excerpt, /john@example.com|1,234,567|张三|description/iu);
  assert.doesNotMatch(JSON.stringify(evidence), /activityid|timeline-1|notetext|description/iu);
  const facts = timelineContentFacts(evidence);
  assert.equal(facts.length, 1);
  const analysis = deriveTimelineAnalysis(evidence, { commitmentStatus: { openCount: 1 } });
  assert.ok(analysis.findingCodes.includes("NEXT_STEP_EXPLICIT"));
  assert.ok(analysis.findingCodes.includes("COMMITMENT_OPEN"));
  assert.ok(analysis.actionCodes.includes("CLOSE_OPEN_COMMITMENT"));
});
