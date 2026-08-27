import assert from "node:assert/strict";
import test from "node:test";
import { buildDeepAnalysisFactCatalog } from "../server/ai/deepAnalysis/deepAnalysisExternalProvider.mjs";
import { createDeepAnalysisService } from "../server/ai/deepAnalysis/deepAnalysisService.mjs";
import { validateDeepAnalysisOutput } from "../server/ai/deepAnalysis/deepAnalysisSchema.mjs";
import { buildDeepAnalysisPreview } from "../server/ai/deepAnalysis/deepAnalysisContextBuilder.mjs";
import { getDeepAnalysisTemplate } from "../server/ai/deepAnalysis/templateRegistry.mjs";

const baseInput = Object.freeze({ role: "demo-full-access", templateCode: "DA-02", mode: "portfolio", scenarioId: "", opportunityToken: "DEMO-6C-OPP-075" });
const externalEnv = Object.freeze({ FEATURE_DEEP_ANALYSIS: "true", AI_PROVIDER: "openai-compatible", ALLOW_EXTERNAL_AI: "true", LLM_BASE_URL: "https://api.example.test/beta", LLM_API_KEY: "test-only-secret", LLM_MODEL: "deepseek-v4-pro", LLM_TIMEOUT_MS: "1000" });

test("external deep analysis uses JSON transport and maps only Safe Context evidence", async () => {
  let calls = 0;
  let requestBody;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    requestBody = JSON.parse(options.body);
    const requestInput = JSON.parse(requestBody.messages[1].content.slice(requestBody.messages[1].content.indexOf("{")));
    const pack = requestInput.timelineExecutiveAnalysisPack;
    const tokens = requestInput.safeFacts.map((item) => item.evidenceToken);
    const selection = {
      summaryCode: "HIGH_RISK_REVIEW",
      riskCodes: ["MULTI_RISK_REVIEW"],
      actionCodes: ["RECONCILE_FACTS"],
      evidenceTokens: tokens.slice(0, 2),
      timelineOverallCode: pack.overallCode,
      timelineMomentumCode: pack.momentumTrend.code,
      timelineCustomerPositionCode: pack.customerPosition.code,
      timelineDecisionClarityCode: pack.decisionClarity.code,
      timelineStakeholderCodes: [pack.stakeholderDynamics.code],
      timelineThemeCodes: pack.supportedCodes.themes.slice(0, 3),
      timelineBlockerCodes: pack.supportedCodes.blockers.slice(0, 3),
      timelineCommitmentCode: pack.commitmentSummary.code,
      timelineContradictionCodes: pack.supportedCodes.contradictions.slice(0, 3),
      timelineOpportunityCodes: pack.supportedCodes.opportunities.slice(0, 3),
      timelineManagementActionCodes: pack.supportedCodes.managementActions.slice(0, 3),
      timelineConfidenceBand: pack.confidence.level,
      timelineCoverageBand: pack.coverage.level,
      timelineRepresentativeEvidenceTokens: pack.representativeEvidenceTokens.slice(0, 8),
      timelineLimitationCodes: ["RAW_TIMELINE_WITHHELD"],
      limitationCodes: ["IDENTITY_MASKED", "EXACT_AMOUNT_WITHHELD", "RAW_TIMELINE_WITHHELD", "DETERMINISTIC_SCORE_AUTHORITY", "HUMAN_REVIEW_REQUIRED"],
      confidenceBand: "MEDIUM",
    };
    return new Response(JSON.stringify({ id: "response-test-1", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(selection) } }], usage: { prompt_tokens: 40, completion_tokens: 80, total_tokens: 120 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const service = createDeepAnalysisService({ env: externalEnv, fetchImpl });
  const result = await service.run({ ...baseInput, requestId: "external-deep-001", confirmed: true, responseLocale: "en-US" });
  assert.equal(calls, 1);
  assert.equal(result.output.provider.used, "openai-compatible");
  assert.equal(result.output.provider.externalModelCalled, true);
  assert.equal(result.output.safety.crmWritebackEnabled, false);
  assert.equal(validateDeepAnalysisOutput(result.output).ok, true);
  assert.equal(requestBody.stream, false);
  assert.equal(requestBody.thinking.type, "disabled");
  assert.equal(requestBody.max_tokens, 2400);
  assert.deepEqual(requestBody.response_format, { type: "json_object" });
  assert.equal(Object.hasOwn(requestBody, "tools"), false);
  assert.equal(Object.hasOwn(requestBody, "tool_choice"), false);
  const requestInput = JSON.parse(requestBody.messages[1].content.slice(requestBody.messages[1].content.indexOf("{")));
  assert.equal(requestInput.responseLocale, "en-US");
  assert.equal(result.output.title, "Win Probability and Risk Analysis");
  assert.match(result.output.executiveSummary, /Current safe signals|Timeline/u);
  assert.equal(result.output.recommendedActions[0].suggestedRole, "To be assigned by a person");
  assert.equal(result.output.scenarios[0].name, "Baseline scenario");
  const timelineProperties = requestBody.selectionSchema.properties;
  assert.deepEqual(timelineProperties.timelineOverallCode.enum, [requestInput.timelineExecutiveAnalysisPack.overallCode]);
  assert.deepEqual(timelineProperties.timelineMomentumCode.enum, [requestInput.timelineExecutiveAnalysisPack.momentumTrend.code]);
  assert.deepEqual(timelineProperties.timelineCustomerPositionCode.enum, [requestInput.timelineExecutiveAnalysisPack.customerPosition.code]);
  assert.deepEqual(timelineProperties.timelineDecisionClarityCode.enum, [requestInput.timelineExecutiveAnalysisPack.decisionClarity.code]);
  for (const [property, supported] of [["timelineThemeCodes", requestInput.timelineExecutiveAnalysisPack.supportedCodes.themes], ["timelineBlockerCodes", requestInput.timelineExecutiveAnalysisPack.supportedCodes.blockers]]) {
    assert.ok(supported.every((code) => timelineProperties[property].items.enum.includes(code)));
    if (supported.length) assert.deepEqual(timelineProperties[property].items.enum, supported);
  }
  const opportunityCandidates = requestInput.timelineExecutiveAnalysisPack.opportunitySignals.map((item) => item.code);
  const expectedOpportunityCandidates = opportunityCandidates.length ? opportunityCandidates.slice(0, 3) : requestInput.timelineExecutiveAnalysisPack.supportedCodes.opportunities.slice(0, 3);
  assert.deepEqual(timelineProperties.timelineOpportunityCodes.items.enum, expectedOpportunityCandidates);
  assert.ok(timelineProperties.timelineOpportunityCodes.items.enum.length <= 3);
  assert.ok(requestInput.timelineExecutiveAnalysisPack);
  assert.ok(Array.isArray(requestInput.timelineExecutiveAnalysisPack.representativeEvidence));
  assert.ok(requestInput.timelineExecutiveAnalysisPack.representativeEvidence.length <= 8);
  const requestText = JSON.stringify(requestBody);
  assert.doesNotMatch(requestText, /test-only-secret|customerName|contactName|exactAmount|rawTimeline|scenarioId|golden/i);
});

test("external deep analysis fails closed without Demo fallback", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return new Response(JSON.stringify({ error: { code: "bad_request", message: "synthetic failure" } }), { status: 400 }); };
  const service = createDeepAnalysisService({ env: externalEnv, fetchImpl });
  await assert.rejects(() => service.run({ ...baseInput, requestId: "external-deep-002", confirmed: true }), /External deep analysis failed/);
  assert.equal(calls, 1);
  assert.equal(service.listAudit()[0].provider, "openai-compatible");
});
