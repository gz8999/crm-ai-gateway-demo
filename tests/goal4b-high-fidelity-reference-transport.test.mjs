import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHighFidelityReferenceRequest,
  buildHighFidelityReferenceSchema,
  mapHighFidelitySelection,
  runHighFidelityExternal,
  validateHighFidelityReferenceSelection,
} from "../server/ai/deepAnalysis/highFidelityProvider.mjs";
import { HIGH_FIDELITY_MODE } from "../server/ai/deepAnalysis/highFidelityContext.mjs";

const ENV = {
  AI_PROVIDER: "openai-compatible",
  ALLOW_EXTERNAL_AI: "true",
  DEEP_ANALYSIS_HIGH_FIDELITY_TRANSPORT: "reference-only",
  LLM_BASE_URL: "https://provider.test.invalid/beta",
  LLM_API_KEY: "local-test-secret",
  LLM_MODEL: "deepseek-v4-flash",
  LLM_TIMEOUT_MS: "1000",
  LLM_DEEP_ANALYSIS_MAX_TOKENS: "1200",
};

test("reference-only high fidelity schema contains no free-text string nodes", () => {
  const schema = buildHighFidelityReferenceSchema(["E01", "E02"]);
  const freeText = [];
  walk(schema, "#", (node, path) => {
    if (node.type === "string" && !Array.isArray(node.enum)) freeText.push(path);
  });
  assert.deepEqual(freeText, []);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, Object.keys(schema.properties));
});

test("reference-only schema documents bounded selection cardinality without unsupported keywords", () => {
  const schema = buildHighFidelityReferenceSchema(["E01", "E02"]);
  assert.equal(schema.properties.themeCode1.enum.includes("NEXT_STEP"), true);
  assert.equal(schema.properties.themeCode1.enum.includes("OBJECTION"), true);
  assert.equal(schema.properties.themeCode2.enum[0], "NONE");
  assert.equal(schema.properties.themeCode3.enum[0], "NONE");
  assert.equal(schema.properties.representativeEvidenceAlias1.enum.includes("NONE"), false);
  assert.equal(schema.properties.representativeEvidenceAlias2.enum[0], "NONE");
  assert.equal(Object.values(schema.properties).some((property) => property.type === "array"), false);
});

test("reference-only transport sends redacted context and deterministically expands a compact selection", async () => {
  let calls = 0;
  let requestBody;
  let requestPayload;
  const result = await runHighFidelityExternal({
    payload: payload(),
    requestId: "hf-reference-001",
    env: ENV,
    fetchImpl: async (_url, options) => {
      calls += 1;
      requestBody = JSON.parse(options.body);
      requestPayload = JSON.parse(requestBody.messages[1].content);
      const timelineAlias = requestPayload.selectionCatalog.timelineEvidenceAliases[0];
      const selection = {
        overallCode: "REVIEW_REQUIRED",
        momentumCode: "MIXED",
        customerPositionCode: "CONCERNED",
        decisionClarityCode: "PARTIAL",
        stakeholderCode1: "DECISION_ROLE_PRESENT",
        stakeholderCode2: "NONE",
        stakeholderCode3: "NONE",
        themeCode1: "NEXT_STEP",
        themeCode2: "OBJECTION",
        themeCode3: "NONE",
        blockerCode1: "OBJECTION",
        blockerCode2: "NONE",
        blockerCode3: "NONE",
        commitmentCode: "OPEN_COMMITMENTS",
        contradictionCode1: "NONE",
        contradictionCode2: "NONE",
        contradictionCode3: "NONE",
        riskCode1: "OBJECTION",
        riskCode2: "NONE",
        riskCode3: "NONE",
        opportunityCode1: "CUSTOMER_DEMAND",
        opportunityCode2: "NONE",
        opportunityCode3: "NONE",
        actionCode1: "RESOLVE_OBJECTION",
        actionCode2: "CONFIRM_NEXT_STEP",
        actionCode3: "NONE",
        representativeEvidenceAlias1: timelineAlias,
        representativeEvidenceAlias2: "NONE",
        representativeEvidenceAlias3: "NONE",
        representativeEvidenceAlias4: "NONE",
        representativeEvidenceAlias5: "NONE",
        representativeEvidenceAlias6: "NONE",
        representativeEvidenceAlias7: "NONE",
        representativeEvidenceAlias8: "NONE",
        confidenceBand: "MEDIUM",
        limitationCode1: "HUMAN_REVIEW_REQUIRED",
        limitationCode2: "NONE",
        limitationCode3: "NONE",
        limitationCode4: "NONE",
        limitationCode5: "NONE",
        limitationCode6: "NONE",
        limitationCode7: "NONE",
        limitationCode8: "NONE",
      };
      return response(JSON.stringify(selection));
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.referenceOnlyTransport, true);
  assert.equal(result.observation.argumentsType, "string");
  assert.equal(result.observation.finishReason, "tool_calls");
  assert.match(result.selection.executiveSummary, /推进|Timeline/u);
  assert.equal(result.selection.recommendedActions.length, 2);
  assert.deepEqual(result.selection.safeEvidenceTokens, ["TL-001"]);
  assert.equal(requestBody.response_format, undefined);
  assert.equal(requestBody.tools.length, 1);
  assert.equal(requestBody.tools[0].function.strict, true);
  assert.equal(requestBody.tool_choice.function.name, "emit_high_fidelity_deep_analysis");
  assert.match(requestBody.messages[0].content, /themeCode1 is required/u);
  assert.match(requestBody.tools[0].function.description, /themeCode1 is required/u);
  assert.equal(requestPayload.slotContract.themeCode1, "required theme code");
  assert.equal(requestPayload.slotContract.representativeEvidenceAlias2, "alias or NONE");

  const mapped = mapHighFidelitySelection({ selection: result.selection, payload: payload(), requestId: "hf-reference-001", model: ENV.LLM_MODEL });
  assert.match(mapped.timelineExecutiveSynthesis.overallConclusion, /Timeline/u);
  assert.equal(mapped.recommendedActions[0].status, "Draft");
});

test("reference-only selection rejects unknown aliases and duplicate codes fail closed", () => {
  const valid = {
    overallCode: "PROGRESSING",
    momentumCode: "STABLE",
    customerPositionCode: "SUPPORTIVE",
    decisionClarityCode: "CLEAR",
    stakeholderCodes: [],
    themeCodes: ["PROGRESS"],
    blockerCodes: [],
    commitmentCode: "NO_COMMITMENTS",
    contradictionCodes: ["NONE"],
    riskCodes: [],
    opportunityCodes: ["PROGRESS"],
    actionCodes: [],
    representativeEvidenceAliases: ["E01"],
    confidenceBand: "HIGH",
    limitationCodes: [],
  };
  assert.equal(validateHighFidelityReferenceSelection(valid, { aliases: ["E01"], timelineAliases: ["E01"] }).ok, true);
  assert.equal(validateHighFidelityReferenceSelection({ ...valid, representativeEvidenceAliases: ["E99"] }, { aliases: ["E01"], timelineAliases: ["E01"] }).ok, false);
  assert.equal(validateHighFidelityReferenceSelection({ ...valid, themeCodes: ["PROGRESS", "PROGRESS"] }, { aliases: ["E01"], timelineAliases: ["E01"] }).ok, false);
  assert.equal(validateHighFidelityReferenceSelection({ ...valid, themeCodes: ["PROGRESS", "NEXT_STEP", "OBJECTION", "CONCERN"] }, { aliases: ["E01"], timelineAliases: ["E01"] }).errors.includes("max:themeCodes"), true);
});

test("reference-only malformed JSON uses one parse and never repairs", async () => {
  let calls = 0;
  const result = await runHighFidelityExternal({
    payload: payload(),
    requestId: "hf-reference-invalid-001",
    env: ENV,
    fetchImpl: async () => { calls += 1; return response('{"overallCode":'); },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.diagnosticCategory, "ARGUMENT_JSON_INVALID");
  assert.equal(Object.hasOwn(result, "selection"), false);
});

function payload() {
  return {
    analysisContextMode: HIGH_FIDELITY_MODE,
    templateCode: "DA-02",
    templateVersion: "v1",
    responseLocale: "zh-CN",
    highFidelityContext: {
      analysisContextMode: HIGH_FIDELITY_MODE,
      redactionRuleVersion: "identity-redaction-v1",
      customerCompanyMasked: true,
      customerContactMasked: true,
      crmBusinessTextIncluded: true,
      exactAmountIncluded: true,
      exactDateIncluded: true,
      routeAndCommercialTermsIncluded: true,
      businessFacts: { opportunitySubject: "CUSTOMER-COMPANY-A 方案" },
      financialFacts: { currency: "CNY", estimatedValue: 1200000 },
      routeAndCommercialTerms: { transportMode: "海运" },
      timelineBusinessRecords: [{ evidenceToken: "TL-001", activityType: "phonecall", businessDate: "2026-07-10", subject: "路线确认", businessText: "客户提出下一步港口确认要求。" }],
      interactionSignals: [{ activityToken: "TL-001", direction: "outbound", responseLevel: "medium", sentiment: "neutral", commitmentMade: true, commitmentCompleted: false, decisionMakerInvolved: true, objectionPresent: true, issueCategory: "" }],
      residualScan: { rawValueMatchCount: 0, customerCompanyResidual: 0, customerContactResidual: 0, emailResidual: 0, phoneResidual: 0, guidResidual: 0, credentialResidual: 0, guidCount: 0, emailCount: 0, phoneCount: 0, credentialCount: 0, forbiddenKeyCount: 0 },
    },
  };
}

function response(argumentsText) {
  return new Response(JSON.stringify({
    id: "hf-reference-response",
    model: "deepseek-v4-flash",
    choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "emit_high_fidelity_deep_analysis", arguments: argumentsText } }] } }],
    usage: { prompt_tokens: 100, completion_tokens: 60, total_tokens: 160 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function walk(node, path, visit) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  visit(node, path);
  if (node.properties) for (const [key, child] of Object.entries(node.properties)) walk(child, `${path}/properties/${key}`, visit);
  if (node.items) walk(node.items, `${path}/items`, visit);
  if (Array.isArray(node.anyOf)) node.anyOf.forEach((child, index) => walk(child, `${path}/anyOf/${index}`, visit));
}
