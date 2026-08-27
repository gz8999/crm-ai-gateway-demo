import test from "node:test";
import assert from "node:assert/strict";
import { buildHighFidelityTimelinePack, buildHighFidelityRequest, highFidelityTransport, mapHighFidelitySelection } from "../server/ai/deepAnalysis/highFidelityProvider.mjs";
import { buildTimelineContentEvidence } from "../server/decision/timelineDigest.mjs";

test("high fidelity Timeline pack joins normalized source tokens and preserves structured signal counts", () => {
  const pack = buildHighFidelityTimelinePack({
    timelineBusinessRecords: [
      { evidenceToken: "TL-001", activityToken: "TL-001", activityType: "appointment", businessDate: "2026-07-11", subject: "港口确认", businessText: "客户要求确认港口安排。" },
      { evidenceToken: "TL-002", activityToken: "TL-002", activityType: "task", businessDate: "2026-07-12", subject: "报价跟进", businessText: "等待报价回复。" },
    ],
    interactionSignals: [
      { activityToken: " tl-001 ", activityDate: "2026-07-11", activityType: "4201", direction: "客户", responseLevel: "积极", commitmentMade: "1", commitmentCompleted: "0", decisionMakerInvolved: "1" },
      { activityToken: "UNRELATED", activityDate: "2026-07-12", activityType: "task", direction: "内部", responseLevel: "等待", objectionPresent: true, issueCategory: "报价" },
    ],
  });

  assert.equal(pack.coverage.activityCount, 2);
  assert.equal(pack.coverage.structuredSignalCount, 2);
  assert.equal(pack.commitmentSummary.madeCount, 1);
  assert.equal(pack.commitmentSummary.openCount, 1);
  assert.equal(pack.stakeholderDynamics.statement.includes("决策"), true);
  assert.ok(pack.keyThemes.some((item) => item.code === "COMMITMENT" || item.code === "DECISION"));
});

test("Timeline content evidence falls back to a unique normalized date and activity type", () => {
  const evidence = buildTimelineContentEvidence({
    activities: [{ activityid: "activity-1", activitytypecode: "4201", subject: "路线确认", description: "客户确认下一步。", scheduledstart: "2026-07-11T10:00:00Z" }],
    signals: [{ aigw_sourceactivitytoken: "different-token", aigw_activitydate: "2026-07-11", aigw_activitytype: "appointment", aigw_commitmentmade: true, aigw_customerresponselevel: "积极" }],
    timelineEntries: [{ id: "activity-1", token: "TL-001" }],
    now: new Date("2026-07-15T00:00:00Z"),
  });

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].commitmentMade, true);
  assert.match(evidence[0].signalSummary, /客户响应=.*积极/u);
});

test("high fidelity transport defaults to full JSON and keeps reference-only explicit", () => {
  assert.equal(highFidelityTransport({}), "json");
  assert.equal(highFidelityTransport({ DEEP_ANALYSIS_HIGH_FIDELITY_TRANSPORT: "json" }), "json");
  assert.equal(highFidelityTransport({ DEEP_ANALYSIS_HIGH_FIDELITY_TRANSPORT: "reference-only" }), "reference-only");
});

test("full high fidelity request uses JSON output transport and discourages repeated Timeline prose", () => {
  const payload = {
    responseLocale: "zh-CN",
    highFidelityContext: {
      timelineBusinessRecords: [{ evidenceToken: "TL-001", activityType: "appointment", businessDate: "2026-07-11", subject: "路线确认", businessText: "客户确认下一步。" }],
      interactionSignals: [],
    },
  };
  const request = buildHighFidelityRequest({ payload, env: { LLM_MODEL: "deepseek-v4-flash", LLM_DEEP_ANALYSIS_MAX_TOKENS: "2400" } });
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.equal(Object.hasOwn(request, "tools"), false);
  assert.match(request.messages[0].content, /Do not repeat the same sentence/u);
});

test("mapped high fidelity output uses linked Timeline signals and removes duplicate model items", () => {
  const payload = {
    responseLocale: "zh-CN",
    templateCode: "DA-02",
    templateVersion: "1.0",
    highFidelityContext: {
      timelineBusinessRecords: [
        { evidenceToken: "TL-001", activityType: "appointment", businessDate: "2026-07-11", subject: "路线确认", businessText: "客户确认下一步。" },
        { evidenceToken: "TL-002", activityType: "task", businessDate: "2026-07-12", subject: "报价跟进", businessText: "等待报价回复。" },
      ],
      interactionSignals: [
        { activityToken: " tl-001 ", activityDate: "2026-07-11", activityType: "4201", direction: "客户", responseLevel: "积极", commitmentMade: true, commitmentCompleted: false, decisionMakerInvolved: true },
        { activityToken: "UNRELATED", activityDate: "2026-07-12", activityType: "task", direction: "内部", responseLevel: "等待", objectionPresent: true, issueCategory: "报价" },
      ],
      businessFacts: [],
      financialFacts: [],
      routeAndCommercialTerms: [],
    },
  };
  const selection = {
    timelineConclusion: "Timeline 已发现等待点。",
    executiveSummary: "客户回应积极，但报价仍待推进。",
    customerPosition: "客户已回应，下一步仍需确认。客户已回应，下一步仍需确认。",
    decisionClarity: "部分明确。",
    keyThemes: [
      { title: "客户回应", analysis: "重复文案", safeEvidenceTokens: ["TL-001"] },
      { title: "重复", analysis: "重复文案", safeEvidenceTokens: ["TL-002"] },
    ],
    blockers: [],
    contradictions: [],
    opportunities: [],
    recommendedActions: [],
    risks: [],
    safeEvidenceTokens: ["TL-001"],
    confidenceBand: "MEDIUM",
    limitations: [],
  };

  const mapped = mapHighFidelitySelection({ selection, payload, requestId: "hf-map-001" });
  assert.equal(mapped.timelineExecutiveSynthesis.commitmentSummary.madeCount, 1);
  assert.equal(mapped.timelineExecutiveSynthesis.commitmentSummary.openCount, 1);
  assert.equal(mapped.timelineExecutiveSynthesis.keyThemes.length, 1);
  assert.equal(mapped.timelineExecutiveSynthesis.customerPosition.statement, "客户已回应，下一步仍需确认。");
  assert.match(mapped.timelineEvidence[0].summary, /积极/u);
});
