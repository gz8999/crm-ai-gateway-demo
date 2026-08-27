import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_NARRATIVE_CONTRACT_VERSION,
  DEMO_NARRATIVE_TOOL_NAME,
  buildDemoNarrativeRequest,
  buildDemoNarrativeSchema,
  buildNarrativeProviderInput,
  expandDemoNarrative,
  narrativeRequestHash,
  validateDemoNarrative,
  validateNarrativeProviderInput,
} from "../server/narrative/narrativeContract.mjs";
import { callDemoNarrativeProvider } from "../server/narrative/narrativeProvider.mjs";
import { createNarrativeService, validateSnapshot } from "../server/narrative/narrativeService.mjs";

const aliases = ["E01", "E02", "E03"];
const selection = {
  summaryCode: "REVIEW_REQUIRED",
  riskExplanationCodes: ["STALLED_PROGRESS"],
  actionCodes: ["CONFIRM_NEXT_STEP"],
  evidenceAliases: ["E01"],
  limitationCodes: ["IDENTITY_MASKED", "EXACT_AMOUNT_WITHHELD", "RAW_TIMELINE_WITHHELD", "DETERMINISTIC_SCORE_AUTHORITY", "HUMAN_REVIEW_REQUIRED"],
  confidenceBand: "MEDIUM",
};
const view = {
  safeContext: {
    opportunityToken: "DEMO-OPP-002",
    salesDepartment: "FF",
    opportunityState: "Active",
    stage: "授予资格",
    priority: "High",
    amountBand: "medium",
    marginBand: "medium",
    varianceCategory: "stable",
    relativeDate: "current",
    coverageStatus: "partial",
    interactionSignal: { routeConsistency: "review-required" },
    dataQualitySignals: { missingCodes: [] },
    evidenceTokens: ["safeContext.stagnationBand", "safeContext.priority", "safeContext.coverageStatus"],
  },
  healthScore: { healthScore: 72, grade: "B", dimensions: { pipeline: 58, completeness: 80 } },
};

test("Demo LLM Narrative Contract is compact, strict, and fully typed", () => {
  const schema = buildDemoNarrativeSchema(aliases);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["summaryCode", "riskExplanationCodes", "actionCodes", "evidenceAliases", "limitationCodes", "confidenceBand"]);
  assert.equal(schema.properties.summaryCode.type, "string");
  assert.equal(schema.properties.evidenceAliases.items.type, "string");
  assert.equal(validateDemoNarrative(selection, { evidenceAliases: aliases }).ok, true);
  assert.equal(validateDemoNarrative({ ...selection, evidenceAliases: ["E01", "E01"] }, { evidenceAliases: aliases }).ok, false);
  assert.equal(validateDemoNarrative({ ...selection, evidenceAliases: ["E99"] }, { evidenceAliases: aliases }).ok, false);
  assert.equal(validateDemoNarrative({ ...selection, unknown: "x" }, { evidenceAliases: aliases }).ok, false);
});

test("server expands codes deterministically without inventing business facts", () => {
  const output = expandDemoNarrative({ selection, safeContext: view.safeContext, healthScore: view.healthScore, evidenceByAlias: { E01: "safeContext.stagnationBand" } });
  assert.equal(validateSnapshot(output).ok, true);
  assert.equal(output.label, "Validated LLM Analysis Snapshot");
  assert.equal(output.recommendedActionDraft[0].ownerRole, "待人工指定");
  assert.equal(output.recommendedActionDraft[0].dueWindow, "待人工确定");
  assert.equal(output.externalModelCalled, true);
  assert.equal(output.crmWriteback, false);
  const first = narrativeRequestHash(output);
  for (let index = 0; index < 1000; index += 1) assert.equal(narrativeRequestHash(output), first);
  assert.doesNotMatch(JSON.stringify(output), /scenario|golden|guid|exactrevenue|rawtimeline/i);
});

test("synthetic input is safe and rejects forbidden runtime values", () => {
  const safe = buildNarrativeProviderInput({ safeContext: { ...view.safeContext, opportunityToken: "SYN-OPP-001" }, healthScore: view.healthScore, evidenceAliases: aliases, testOnly: true, syntheticProbe: true, d365Record: false, runtimeEligible: false, realCanary: false });
  assert.equal(validateNarrativeProviderInput(safe).ok, true);
  assert.equal(validateNarrativeProviderInput({ ...safe, customerName: "forbidden" }).ok, false);
  assert.equal(validateNarrativeProviderInput({ ...safe, d365Record: true }).ok, false);
  assert.equal(validateNarrativeProviderInput({ ...safe, interactionSignal: "phonecall" }).ok, true);
  assert.equal(validateNarrativeProviderInput({ ...safe, contactPhone: "+86 138 1234 5678" }).ok, false);
});

test("synthetic narrative snapshots validate only in the synthetic execution path", () => {
  const synthetic = expandDemoNarrative({ selection, safeContext: { ...view.safeContext, opportunityToken: "SYN-OPP-001" }, healthScore: view.healthScore, evidenceByAlias: { E01: "safeContext.stagnationBand" } });
  assert.equal(validateSnapshot(synthetic).ok, false);
  assert.equal(validateSnapshot(synthetic, { allowSynthetic: true }).ok, true);
});

test("provider extracts one strict tool call and parses arguments once", async () => {
  let calls = 0;
  const input = buildNarrativeProviderInput({ safeContext: { ...view.safeContext, opportunityToken: "SYN-OPP-001" }, healthScore: view.healthScore, evidenceAliases: aliases, testOnly: true, syntheticProbe: true, d365Record: false, runtimeEligible: false, realCanary: false });
  const result = await callDemoNarrativeProvider({
    providerInput: input,
    evidenceAliases: aliases,
    env: { ALLOW_EXTERNAL_AI: "true", LLM_API_KEY: "test-only", LLM_BASE_URL: "https://mock.invalid", LLM_MODEL: "deepseek-v4-pro" },
    fetchImpl: async (_url, options) => {
      calls += 1;
      const body = JSON.parse(options.body);
      assert.equal(body.tools[0].function.name, DEMO_NARRATIVE_TOOL_NAME);
      assert.equal(body.tools[0].function.strict, true);
      assert.equal(body.response_format, undefined);
      return new Response(JSON.stringify({ id: "mock", choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: DEMO_NARRATIVE_TOOL_NAME, arguments: JSON.stringify(selection) } }] } }], usage: { total_tokens: 20 } }), { status: 200 });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.selection.summaryCode, "REVIEW_REQUIRED");
  assert.equal(result.observation.argumentsType, "string");
});

test("narrative service serves server-only snapshots and limits live to one approved call", async () => {
  let calls = 0;
  const service = createNarrativeService({
    env: { ALLOW_EXTERNAL_AI: "true", LLM_MODEL: "deepseek-v4-pro" },
    snapshotPath: "/tmp/goal4a-narrative-missing.json",
    frozenOpportunityLoader: async () => view,
    provider: async () => { calls += 1; return { ok: true, selection, requestBodyHash: "a".repeat(64), observation: { responseBodyHash: "b".repeat(64), latencyMs: 1, tokenUsage: { total_tokens: 10 } } }; },
  });
  const first = await service.runLive({ confirmed: true, token: "DEMO-OPP-002" });
  assert.equal(first.ok, true);
  assert.equal((await service.status()).validatedSnapshotCount, 1);
  const second = await service.runLive({ confirmed: true, token: "DEMO-OPP-002" });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "live_call_already_used");
  assert.equal(calls, 1);
  assert.equal((await service.runLive({ confirmed: true, token: "DEMO-OPP-001" })).reason, "live_call_already_used");
});

test("request contract keeps provider metadata server-side and uses the narrative schema", () => {
  const body = buildDemoNarrativeRequest({ providerInput: { testOnly: true, syntheticProbe: true, d365Record: false, runtimeEligible: false, realCanary: false, opportunityToken: "SYN-OPP-001", evidenceAliases: aliases }, evidenceAliases: aliases, env: { LLM_MODEL: "deepseek-v4-pro" } });
  assert.equal(body.tools.length, 1);
  assert.equal(body.tools[0].function.parameters.additionalProperties, false);
  assert.equal(body.tool_choice.function.name, DEMO_NARRATIVE_TOOL_NAME);
  assert.equal(body.messages[1].content.includes("SYN-OPP-001"), true);
  assert.equal(body.messages[1].content.includes("API_KEY"), false);
  assert.equal(DEMO_NARRATIVE_CONTRACT_VERSION, "Demo LLM Narrative Contract v1");
});
