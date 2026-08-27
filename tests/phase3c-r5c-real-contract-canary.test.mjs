import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SAFETY_POLICY_CODES } from "../server/decision/externalModelContractV2.mjs";
import {
  buildR5CEvidenceTypeIndex,
  buildR5CEvidenceValueIndex,
  executeR5CCall,
  freezeR5CRequest,
  validateR5COfflinePreflight,
  validateR5CResponseSemantics,
  validateR5CSafeContext,
  writeR5CArtifacts,
} from "../scripts/run-phase3c-r5c-real-contract-canary.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const env = { LLM_API_KEY: "local-test-secret", LLM_TIMEOUT_MS: "1000" };
const readySecret = {
  oldExposedApiKeyRevoked: true,
  newServerSideSecretReady: true,
  secretBrowserExposure: false,
  secretGitExposure: false,
  secretBundleExposure: false,
  secretLogExposure: false,
  secretReportExposure: false,
};

function safeContext() {
  return {
    opportunityToken: "DEMO-OPP-002",
    customerToken: "CUSTOMER-A-001",
    accountToken: "A-001",
    ownerToken: "OWNER-PILOT",
    salesDepartment: "FF",
    opportunityState: "Active",
    stage: "Qualify",
    priority: "Monitor",
    forecastCategory: "Upside",
    relativeDateStatus: "future",
    stagnationBand: "active",
    revenueBand: "100k-500k",
    marginBand: "8-12-percent",
    budgetBand: "100k-500k",
    actualBand: "none",
    amountBand: "100k-500k",
    annualRevenueBand: "100k-500k",
    annualMarginBand: "under-100k",
    varianceCategory: "not-applicable",
    budgetVarianceBand: "not-applicable",
    marginVarianceBand: "not-applicable",
    trend: "stable",
    elapsedPeriodCategory: "future",
    dataQualityCodes: [],
    missingCodes: [],
    contradictionCodes: [],
    transportMode: "mode-1",
    routeConsistency: "consistent",
    needSummary: "need-category-recorded",
    proposalSummary: "proposal-category-recorded",
    progressSummary: "active-future",
    meetingWindow: "within-30-days",
    stakeholderCoverage: "complete",
    openQuestionCount: 0,
    decisionReadiness: "high",
    closeFact: "none",
    timelineSignalCount: 4,
    coverageCategory: "broad",
    accountAggregate: { accountToken: "A-001", serviceCoverageBand: "broad", whitespaceCategory: "limited-whitespace", opportunityTrend: "stable", relationshipMaturity: "established" },
  };
}

function view(token = "DEMO-OPP-002") {
  const context = { ...safeContext(), opportunityToken: token };
  return {
    selectedOpportunity: token,
    safeContext: context,
    pack: {
      risk: {
        fact: [{ label: "Progress", value: "active", source: "safeContext.stagnationBand" }],
        evidence: [{ label: "Data quality", value: "clear", source: "safeContext.dataQualityCodes" }],
        recommendedAction: [{ title: "Maintain cadence", reason: "Evidence is clear.", owner: "Owner token", due: "Next review", status: "Draft only" }],
        priority: "Monitor",
        confidence: { level: "High", reason: "Clear evidence." },
      },
    },
    healthScore: {
      version: "2.0",
      healthScore: 91,
      grade: "S",
      dimensions: { pipeline: 95, completeness: 100, profitability: 78, engagement: 95, risk: 100, confidence: 100 },
      dataQualityStatus: "clear",
      evidence: [
        { source: "safeContext.stagnationBand" },
        { source: "safeContext.dataQualityCodes" },
        { source: "safeContext.varianceCategory" },
        { source: "safeContext.decisionReadiness" },
        { source: "safeContext.priority" },
        { source: "safeContext.dataQualityCodes" },
      ],
    },
  };
}

function transportOutput(frozen = freezeR5CRequest({ view: view(), contexts: [safeContext()], env })) {
  const dataQuality = "safeContext.dataQualityCodes";
  return {
    facts: [{ label: "Data quality", value: "No issue flags are present.", evidenceToken: dataQuality }],
    inferences: [{ inference: "Routine monitoring is supported by the supplied safe evidence.", evidenceTokens: [dataQuality] }],
    evidence: [{ evidenceToken: dataQuality, value: "clear" }],
    confidence: { level: "High", reason: "The supplied evidence is internally aligned." },
    recommendedActions: [{ action: "Maintain routine review", ownerRole: "authorized owner role", dueWindow: "next review window", basis: "The safe evidence supports routine monitoring.", draftStatus: "Draft only", evidenceTokens: [dataQuality] }],
    priority: "Monitor",
    riskCategories: [{ code: "healthy", evidenceTokens: [dataQuality] }],
    provider: "openai-compatible",
    model: "deepseek-v4-pro",
    modelVersion: "deepseek-v4-pro",
    fallback: { state: "not_applicable", reason: "No fallback was used." },
    safety: {
      identityMasked: true,
      exactAmountWithheld: true,
      rawTimelineWithheld: true,
      crmWritebackPerformed: false,
      policyAssertions: Object.fromEntries(SAFETY_POLICY_CODES.map((code) => [code, true])),
    },
    limitations: { codes: ["IDENTITY_MASKED", "EXACT_AMOUNT_WITHHELD", "RAW_TIMELINE_WITHHELD"] },
  };
}

function providerResponse(output) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id: "local-r5c-response",
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 },
      choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: JSON.stringify(output) } }] } }],
    }),
  };
}

function providerInvalidJsonResponse() {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id: "local-r5c-invalid-json",
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 },
      choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: '{"facts":[' } }] } }],
    }),
  };
}

function preflight(frozen) {
  return validateR5COfflinePreflight({
    frozen,
    secretEvidence: readySecret,
    authoritativeBaselineReady: true,
    runConsumed: false,
    d365Preflight: { ready: true },
  });
}

test("R5C freezes only DEMO-OPP-002 and includes every evidence-bound safe value", () => {
  assert.throws(() => freezeR5CRequest({ view: view("DEMO-OPP-003"), contexts: [safeContext()], env }), /DEMO-OPP-002/);
  const frozen = freezeR5CRequest({ view: view(), contexts: [safeContext()], env });
  const safety = validateR5CSafeContext({ frozen });
  assert.equal(safety.ready, true);
  assert.equal(safety.otherRealOpportunityCount, 0);
  assert.equal(safety.forbiddenFieldCount, 0);
  assert.equal(safety.guidCount, 0);
  assert.equal(safety.exactAmountCount, 0);
  assert.equal(safety.rawTimelineCount, 0);
  assert.equal(safety.scenarioGoldenCount, 0);
  assert.equal(safety.evidenceFieldMissingCount, 0);
  for (const token of frozen.evidenceAllowlist) assert.equal(Object.hasOwn(frozen.evidenceValueByToken, token), true, token);
});

test("R5C evidence type and value indices fail closed on unknown sources", () => {
  assert.deepEqual(buildR5CEvidenceTypeIndex(view().healthScore).evidenceTokens, [
    "safeContext.dataQualityCodes",
    "safeContext.decisionReadiness",
    "safeContext.priority",
    "safeContext.stagnationBand",
    "safeContext.varianceCategory",
  ]);
  assert.throws(() => buildR5CEvidenceTypeIndex({ evidence: [{ source: "safeContext.unknown" }] }), /not classified/);
  assert.throws(() => buildR5CEvidenceValueIndex({}, ["safeContext.priority"]), /does not contain/);
});

test("R5C performs one valid Tool call with no retry or fallback", async () => {
  const frozen = freezeR5CRequest({ view: view(), contexts: [safeContext()], env });
  let calls = 0;
  const summary = await executeR5CCall({
    frozen,
    preflight: preflight(frozen),
    d365Get: 12,
    fetchImpl: async () => { calls += 1; return providerResponse(transportOutput(frozen)); },
  });
  assert.equal(calls, 1);
  assert.equal(summary.counts.externalLlmCalls, 1);
  assert.equal(summary.counts.retry, 0);
  assert.equal(summary.counts.fallback, 0);
  assert.equal(summary.counts.crmPost, 0);
  assert.equal(summary.counts.crmPatch, 0);
  assert.equal(summary.counts.crmDelete, 0);
  assert.equal(summary.counts.crmWriteback, false);
  assert.equal(summary.gates.realContractCanaryComplete, true);
  assert.equal(summary.gates.remainingCanaryExecutionAuthorized, false);
});

test("R5C hard-fails an unsupported fact after one call", async () => {
  const frozen = freezeR5CRequest({ view: view(), contexts: [safeContext()], env });
  const output = transportOutput(frozen);
  output.facts[0].value = "A material negative variance exists.";
  let calls = 0;
  const summary = await executeR5CCall({ frozen, preflight: preflight(frozen), fetchImpl: async () => { calls += 1; return providerResponse(output); } });
  assert.equal(calls, 1);
  assert.equal(summary.external.semantics.unsupportedFactCount, 1);
  assert.equal(summary.gates.realContractCanaryComplete, false);
  assert.equal(summary.businessEvaluation.ready, false);
  assert.equal(summary.counts.retry, 0);
});

test("R5C hard-fails a CRM operation claim and never evaluates quality", () => {
  const frozen = freezeR5CRequest({ view: view(), contexts: [safeContext()], env });
  const output = transportOutput(frozen);
  output.inferences[0].inference = "Updated CRM and contacted the customer.";
  const semantics = validateR5CResponseSemantics({ parsedTransport: output, canonical: { confidence: output.confidence }, frozen });
  assert.ok(semantics.crmWriteClaimCount > 0);
  assert.equal(semantics.ready, false);
});

test("R5C preflight failure performs zero external calls", async () => {
  const frozen = freezeR5CRequest({ view: view(), contexts: [safeContext()], env });
  let calls = 0;
  const blocked = { ...preflight(frozen), ready: false };
  const summary = await executeR5CCall({ frozen, preflight: blocked, fetchImpl: async () => { calls += 1; return providerResponse(transportOutput(frozen)); } });
  assert.equal(calls, 0);
  assert.equal(summary.counts.externalLlmCalls, 0);
  assert.equal(summary.gates.realContractCanaryComplete, false);
});

test("R5C JSON failure leaves downstream contract and hallucination checks not run", async () => {
  const frozen = freezeR5CRequest({ view: view(), contexts: [safeContext()], env });
  const summary = await executeR5CCall({ frozen, preflight: preflight(frozen), fetchImpl: async () => providerInvalidJsonResponse() });
  assert.equal(summary.stopReason, "ARGUMENT_JSON_INVALID");
  assert.equal(summary.counts.jsonParseAttempts, 1);
  assert.equal(summary.counts.jsonParseSuccess, 0);
  assert.equal(summary.counts.transportV3Attempts, 0);
  assert.equal(summary.counts.actionEvidenceAttempts, 0);
  assert.equal(summary.counts.canonicalMappingAttempts, 0);
  assert.equal(summary.counts.safetyAttempts, 0);
  assert.equal(summary.counts.hallucinationAuditExecuted, false);
  assert.equal(summary.counts.hallucinationHardFailure, 0);
  assert.equal(summary.businessEvaluation.hardFailureCount, 0);
});

test("R5C writes exactly ten sanitized public artifacts", async () => {
  const frozen = freezeR5CRequest({ view: view(), contexts: [safeContext()], env });
  const summary = await executeR5CCall({ frozen, preflight: preflight(frozen), fetchImpl: async () => providerResponse(transportOutput(frozen)) });
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "r5c-artifacts-"));
  try {
    await writeR5CArtifacts(summary, { outputDir });
    const files = (await fs.readdir(outputDir)).sort();
    assert.equal(files.length, 10);
    const text = (await Promise.all(files.map((file) => fs.readFile(path.join(outputDir, file), "utf8")))).join("\n");
    assert.doesNotMatch(text, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
    assert.doesNotMatch(text, /local-test-secret|No issue flags are present|safe evidence supports routine monitoring/i);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("R5C source uses the formal read chain and contains no CRM write path", async () => {
  const source = await fs.readFile(path.join(ROOT, "scripts/run-phase3c-r5c-real-contract-canary.mjs"), "utf8");
  assert.match(source, /createFrozenDatasetReader/);
  assert.match(source, /createFrozenDatasetRuntimeService/);
  assert.match(source, /buildExternalModelRequest/);
  assert.doesNotMatch(source, /dataversePost|dataversePatch|dataverseDelete|WinOpportunity|LoseOpportunity/);
  assert.doesNotMatch(source, /jsonrepair|stripMarkdown|secondParse|tolerantParser/i);
});
