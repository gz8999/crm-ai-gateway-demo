import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTimelineContentEvidence,
  buildTimelineEventExtraction,
  buildTimelineExecutiveSynthesis,
} from "../server/decision/timelineDigest.mjs";

const NOW = new Date("2027-01-15T00:00:00Z");

test("five executive samples produce a bounded full-Timeline synthesis", () => {
  const samples = [
    ["DEMO-OPP-075", richEvidence(), { madeCount: 3, completedCount: 1, openCount: 2 }],
    ["rich-high-risk", richEvidence("RICH"), { madeCount: 3, completedCount: 0, openCount: 3 }],
    ["healthy-control", healthyEvidence(), { madeCount: 1, completedCount: 1, openCount: 0 }],
    ["contradiction", contradictionEvidence(), { madeCount: 2, completedCount: 1, openCount: 1 }],
    ["sparse-timeline", sparseEvidence(), { madeCount: 0, completedCount: 0, openCount: 0 }],
  ];

  for (const [sample, evidence, commitments] of samples) {
    const synthesis = buildTimelineExecutiveSynthesis({
      evidence,
      digest: { totalActivityCount: evidence.length, commitmentStatus: commitments },
    });
    assert.ok(synthesis.overallConclusion, sample);
    assert.ok(synthesis.momentumTrend.statement, sample);
    assert.ok(synthesis.customerPosition.statement, sample);
    assert.ok(synthesis.decisionClarity.statement, sample);
    assert.ok(synthesis.stakeholderDynamics.statement, sample);
    assert.ok(synthesis.keyThemes.length <= 3, `${sample}: key themes`);
    assert.ok(synthesis.topBlockers.length <= 3, `${sample}: blockers`);
    assert.ok(synthesis.contradictions.length <= 3, `${sample}: contradictions`);
    assert.ok(synthesis.opportunitySignals.length <= 3, `${sample}: opportunities`);
    assert.ok(synthesis.managementActions.length <= 3, `${sample}: actions`);
    assert.ok(synthesis.representativeEvidence.length <= 8, `${sample}: evidence`);
    assert.equal(new Set(synthesis.keyThemes.map((item) => item.code)).size, synthesis.keyThemes.length, `${sample}: themes dedupe`);
    assert.equal(new Set(synthesis.representativeEvidenceTokens).size, synthesis.representativeEvidenceTokens.length, `${sample}: evidence dedupe`);
    assert.equal(synthesis.managementActions.every((item) => item.status === "Draft"), true, `${sample}: draft actions`);
    assert.doesNotMatch(JSON.stringify(synthesis), /raw customer|john@example|1,234,567|2027-01-15/iu, `${sample}: unsafe content`);
  }
});

test("DEMO-OPP-075 and rich cases synthesize cross-record blockers, while healthy control stays non-critical", () => {
  const highRisk = buildTimelineExecutiveSynthesis({ evidence: richEvidence(), digest: { totalActivityCount: 6, commitmentStatus: { madeCount: 3, completedCount: 1, openCount: 2 } } });
  assert.equal(highRisk.overallCode, "REVIEW_REQUIRED");
  assert.ok(highRisk.topBlockers.length >= 2);
  assert.equal(highRisk.commitmentSummary.code, "OVERDUE_COMMITMENTS");

  const healthy = buildTimelineExecutiveSynthesis({ evidence: healthyEvidence(), digest: { totalActivityCount: 4, commitmentStatus: { madeCount: 1, completedCount: 1, openCount: 0 } } });
  assert.equal(healthy.overallCode, "PROGRESSING");
  assert.notEqual(healthy.overallCode, "REVIEW_REQUIRED");
  assert.equal(healthy.topBlockers.some((item) => item.code === "DECISION_GAP"), false);
  assert.equal(healthy.contradictions.length, 0);
  assert.equal(healthy.commitmentSummary.code, "COMPLETED_COMMITMENTS");
});

test("contradictory and sparse timelines lower confidence and retain explicit limitations", () => {
  const contradictory = buildTimelineExecutiveSynthesis({ evidence: contradictionEvidence(), digest: { totalActivityCount: 6, commitmentStatus: { madeCount: 2, completedCount: 1, openCount: 1 } } });
  assert.ok(contradictory.contradictions.length > 0);
  assert.equal(contradictory.confidence.level, "MEDIUM");

  const sparse = buildTimelineExecutiveSynthesis({ evidence: sparseEvidence(), digest: { totalActivityCount: 5, commitmentStatus: { madeCount: 0, completedCount: 0, openCount: 0 } } });
  assert.equal(sparse.confidence.level, "LOW");
  assert.equal(sparse.coverage.level, "LOW");
  assert.ok(sparse.limitations.some((item) => item.includes("记录较少")));
});

test("event extraction preserves stable actor roles and relative order while external evidence stays bounded", () => {
  const evidence = [
    event("E-2", "客户决策人确认方案并等待下一步", { rank: 2, direction: "inbound", customerResponse: "positive", decisionMakerInvolved: true }),
    event("E-1", "客户决策人提出顾虑并等待回应", { rank: 1, direction: "inbound", customerResponse: "negative", objectionCategory: "commercial" }),
  ];
  const extraction = buildTimelineEventExtraction({ evidence, digest: {} });
  assert.deepEqual(extraction.events.map((item) => item.evidenceToken), ["safeContext.timeline.content.E-1", "safeContext.timeline.content.E-2"]);
  assert.equal(extraction.events[0].actorRole, "CUSTOMER-DECISION-MAKER-A");
  assert.equal(extraction.events[1].actorRole, "CUSTOMER-DECISION-MAKER-A");
  assert.equal(extraction.events.every((item) => item.relativeTime && item.evidenceToken), true);
  assert.equal(extraction.events.every((item) => !Object.hasOwn(item, "customerName") && !Object.hasOwn(item, "guid")), true);
});

test("semantic redaction keeps business meaning without exposing identity, exact amount, or exact date", () => {
  const evidence = buildTimelineContentEvidence({
    now: NOW,
    timelineEntries: [{ id: "activity-1", token: "TL-SEM-001", parentId: "opp-1" }, { id: "activity-2", token: "TL-SEM-002", parentId: "opp-1" }],
    activities: [
      { activityid: "activity-1", activitytypecode: "phonecall", subject: "客户甲确认下一步", description: "客户甲将在2027-02-01确认路线，金额 CNY 1,234,567。" },
      { activityid: "activity-2", activitytypecode: "phonecall", subject: "客户甲提出采购顾虑", description: "客户甲等待报价回复。" },
    ],
    signals: [
      { aigw_sourceactivitytoken: "TL-SEM-001", aigw_activitydate: "2027-01-14", aigw_direction: "客户", aigw_customerresponselevel: "积极", aigw_decisionmakerinvolved: true },
      { aigw_sourceactivitytoken: "TL-SEM-002", aigw_activitydate: "2027-01-13", aigw_direction: "客户", aigw_customerresponselevel: "消极", aigw_objectionpresent: true, aigw_objectioncategory: "采购" },
    ],
    identityValues: ["客户甲"],
  });
  assert.equal(evidence.length, 2);
  assert.ok(evidence.every((item) => item.relativeTime && item.semanticExcerpt));
  assert.ok(evidence.every((item) => item.semanticExcerpt.includes("CUSTOMER-")));
  assert.doesNotMatch(JSON.stringify(evidence), /客户甲|1,234,567|2027-02-01|activity-1|description/iu);
});

function event(token, semanticExcerpt, extra = {}) {
  return {
    evidenceToken: `safeContext.timeline.content.${token}`,
    activityToken: token,
    activityType: extra.activityType || "phonecall",
    activityTypeLabel: "Phonecall",
    relativeTime: extra.relativeTime || "近7天前",
    relativeTimeRank: extra.rank || 1,
    semanticExcerpt,
    excerpt: semanticExcerpt,
    signalSummary: extra.signalSummary || "",
    direction: extra.direction || "",
    customerResponse: extra.customerResponse || "",
    sentiment: extra.sentiment || "",
    commitmentMade: extra.commitmentMade || false,
    commitmentCompleted: extra.commitmentCompleted || false,
    commitmentDueBand: extra.commitmentDueBand || "not-recorded",
    objectionCategory: extra.objectionCategory || "",
    serviceIssueCategory: extra.serviceIssueCategory || "",
    decisionMakerInvolved: extra.decisionMakerInvolved || false,
    competitorMentioned: extra.competitorMentioned || false,
  };
}

function richEvidence(prefix = "075") {
  return [
    event(`${prefix}-1`, "客户决策人确认下一步并通过方案", { rank: 1, direction: "inbound", customerResponse: "positive", decisionMakerInvolved: true }),
    event(`${prefix}-2`, "采购角色提出采购顾虑并等待报价", { rank: 2, direction: "inbound", customerResponse: "negative", objectionCategory: "price", commitmentMade: true, commitmentDueBand: "overdue" }),
    event(`${prefix}-3`, "我方销售承诺跟进路线方案但未完成", { rank: 3, direction: "outbound", commitmentMade: true, commitmentDueBand: "overdue" }),
    event(`${prefix}-4`, "客户决策人确认会议安排", { rank: 4, direction: "inbound", customerResponse: "positive", decisionMakerInvolved: true }),
    event(`${prefix}-5`, "内部运营反馈服务问题仍未解决", { rank: 5, direction: "outbound", serviceIssueCategory: "delay" }),
    event(`${prefix}-6`, "采购角色等待最终确认", { rank: 6, direction: "inbound", customerResponse: "low" }),
  ];
}

function healthyEvidence() {
  return [
    event("healthy-1", "客户决策人确认方案并同意下一步", { rank: 1, direction: "inbound", customerResponse: "positive", decisionMakerInvolved: true }),
    event("healthy-2", "我方销售已完成报价确认", { rank: 2, direction: "outbound" }),
    event("healthy-3", "客户决策人通过并安排后续", { rank: 3, direction: "inbound", customerResponse: "positive", decisionMakerInvolved: true }),
    event("healthy-4", "我方销售已完成跟进", { rank: 4, direction: "outbound" }),
  ];
}

function contradictionEvidence() {
  return [
    event("contradiction-1", "客户确认方案并同意推进", { rank: 1, direction: "inbound", customerResponse: "positive" }),
    event("contradiction-2", "客户提出异议并等待回应", { rank: 2, direction: "inbound", customerResponse: "negative", objectionCategory: "service", commitmentMade: true, commitmentCompleted: false }),
    event("contradiction-3", "我方已完成一次承诺", { rank: 3, direction: "outbound", commitmentMade: true, commitmentCompleted: true }),
    event("contradiction-4", "客户确认下一步", { rank: 4, direction: "inbound", customerResponse: "positive" }),
    event("contradiction-5", "服务问题仍未解决", { rank: 5, direction: "outbound", serviceIssueCategory: "delay" }),
    event("contradiction-6", "客户等待再次确认", { rank: 6, direction: "inbound", customerResponse: "low" }),
  ];
}

function sparseEvidence() {
  return [event("sparse-1", "客户等待回应", { rank: 1, direction: "inbound", customerResponse: "low" })];
}
