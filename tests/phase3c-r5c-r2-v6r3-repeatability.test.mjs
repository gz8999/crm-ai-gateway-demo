import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateProviderTransportToolArgumentsV4 } from "../server/decision/externalModelContractV2.mjs";
import { lintDeepSeekRequestShapeV2, lintDeepSeekSchemaCompleteness, schemaHash } from "../server/decision/deepseekStrictSchema.mjs";
import {
  buildR5CR2ProviderEnv,
  buildR5CR2SyntheticInput,
  executeR5CR2,
  freezeR5CR2Request,
  validateR5CR2FixedFields,
  validateR5CR2OfflinePreflight,
  validateR5CR2Readability,
  writeR5CR2Artifacts,
} from "../scripts/run-phase3c-r5c-r2-v6r3-repeatability.mjs";

const ENV = Object.freeze({
  AI_PROVIDER: "openai-compatible",
  ALLOW_EXTERNAL_AI: "true",
  LLM_BASE_URL: "https://api.deepseek.com/beta",
  LLM_MODEL: "deepseek-v4-pro",
  LLM_API_KEY: "local-test-secret",
  LLM_TIMEOUT_MS: "1000",
  LLM_MAX_TOKENS: "2400",
  PHASE3C_NATIVE_JSON_MODE: "strict-tool",
  PHASE3C_SCHEMA_VERSION: "v6-r3",
});

const READY_PREFLIGHT = Object.freeze({
  authoritativeBaselineReady: true,
  historicalIntegrityReady: true,
  runConsumed: false,
  secretEvidence: {
    oldExposedApiKeyRevoked: true,
    newServerSideSecretReady: true,
    secretBrowserExposure: false,
    secretGitExposure: false,
    secretBundleExposure: false,
    secretLogExposure: false,
    secretReportExposure: false,
  },
});

const TOKENS = Object.freeze([
  "SYN-EVIDENCE-PIPELINE-001",
  "SYN-EVIDENCE-FINANCIAL-001",
  "SYN-EVIDENCE-ENGAGEMENT-001",
  "SYN-EVIDENCE-COVERAGE-001",
  "SYN-EVIDENCE-DATA-QUALITY-001",
]);

function output() {
  return {
    facts: [{ label: "推进状态", value: "合成推进信号显示近期节奏偏慢", evidenceToken: TOKENS[0] }],
    inferences: [{ inference: "需要人工核实当前推进阻塞原因", evidenceTokens: [TOKENS[0], TOKENS[2]] }],
    evidence: [{ evidenceToken: TOKENS[0], value: "合成流程信号支持推进偏慢判断" }],
    confidence: { level: "Medium", reason: "现有合成安全证据支持中等置信度" },
    recommendedActions: [{
      action: "核实下一步推进条件",
      ownerRole: "待人工指定",
      dueWindow: "待人工确定",
      basis: "推进与决策准备信号均需人工复核",
      draftStatus: "Draft only",
      evidenceTokens: [TOKENS[0], TOKENS[2]],
    }],
    priority: "High",
    riskCategories: [{ code: "stalled", evidenceTokens: [TOKENS[0]] }],
    provider: "openai-compatible",
    model: "deepseek-v4-pro",
    modelVersion: "deepseek-v4-pro",
    fallback: { state: "not_applicable", reason: "NONE" },
    safety: {
      identityMasked: true,
      exactAmountWithheld: true,
      rawTimelineWithheld: true,
      crmWritebackPerformed: false,
      policyAssertions: {
        SAFE_CONTEXT_ONLY: true,
        NO_RAW_CRM: true,
        NO_IDENTITY: true,
        NO_EXACT_AMOUNT: true,
        NO_RAW_TIMELINE: true,
        NO_CRM_WRITEBACK: true,
      },
    },
    limitations: { codes: ["IDENTITY_MASKED", "EXACT_AMOUNT_WITHHELD", "RAW_TIMELINE_WITHHELD"] },
  };
}

function providerResponse(value = output(), { finishReason = "tool_calls" } = {}) {
  const argumentsText = typeof value === "string" ? value : JSON.stringify(value);
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id: "synthetic-r5c-r2-response",
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 150, completion_tokens: 120, total_tokens: 270 },
      choices: [{ finish_reason: finishReason, message: { tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: argumentsText } }] } }],
    }),
  };
}

async function executeWith(values) {
  let calls = 0;
  const queue = [...values];
  const summary = await executeR5CR2({
    env: ENV,
    preflightEvidence: READY_PREFLIGHT,
    fetchImpl: async () => {
      calls += 1;
      return providerResponse(queue.shift());
    },
    now: clock(),
  });
  return { calls, summary };
}

function clock() {
  let seconds = 0;
  return () => new Date(`2026-07-19T00:00:${String(seconds++).padStart(2, "0")}Z`);
}

test("v6-r3 provider profile is explicit and keeps retry disabled", () => {
  const env = buildR5CR2ProviderEnv(ENV);
  assert.equal(env.PHASE3C_SCHEMA_VERSION, "v6-r3");
  assert.equal(env.LLM_BASE_URL, "https://api.deepseek.com/beta");
  assert.equal(env.LLM_MODEL, "deepseek-v4-pro");
  assert.equal(env.LLM_CANARY_SINGLE_ATTEMPT, "true");
});

test("frozen request envelope is byte identical across rebuilds", () => {
  const first = freezeR5CR2Request({ env: ENV });
  const second = freezeR5CR2Request({ input: first.input, env: ENV });
  assert.equal(first.requestEnvelopeBytes, second.requestEnvelopeBytes);
  assert.equal(first.requestEnvelopeByteHash, second.requestEnvelopeByteHash);
  assert.equal(first.requestEnvelopeHash, second.requestEnvelopeHash);
});

test("synthetic input contains only synthetic tokens and required flags", () => {
  const input = buildR5CR2SyntheticInput();
  assert.equal(input.safeContext.testOnly, true);
  assert.equal(input.safeContext.syntheticProbe, true);
  assert.equal(input.safeContext.d365Record, false);
  assert.equal(input.safeContext.runtimeEligible, false);
  assert.equal(input.safeContext.realCanary, false);
  assert.equal(JSON.stringify(input).includes("DEMO-OPP-002"), false);
});

test("v6-r3 schema is complete and Transport v4 hash is frozen", () => {
  const frozen = freezeR5CR2Request({ env: ENV });
  const schema = frozen.body.tools[0].function.parameters;
  const lint = lintDeepSeekSchemaCompleteness(schema);
  assert.equal(lint.missingTypeAnyOfRefCount, 0);
  assert.equal(lint.missingRequiredCount, 0);
  assert.equal(lint.missingAdditionalPropertiesCount, 0);
  assert.equal(lint.unsupportedKeywordCount, 0);
  assert.equal(schemaHash(schema), "be549893663c8f2cf420a021c4ef1b2fccd1c95e0f335591e353a3920484de2b");
});

test("request is strict Tool Calling without response format fallback", () => {
  const frozen = freezeR5CR2Request({ env: ENV });
  assert.equal(lintDeepSeekRequestShapeV2(frozen.body).ok, true);
  assert.equal(frozen.body.tools[0].function.strict, true);
  assert.equal(frozen.body.tool_choice.function.name, "emit_decision_pack");
  assert.equal(frozen.body.response_format, undefined);
  assert.equal(frozen.body.thinking.type, "disabled");
  assert.equal(frozen.body.temperature, 0);
  assert.equal(frozen.body.stream, false);
});

test("offline preflight rejects an unconfirmed secret rotation", () => {
  const result = validateR5CR2OfflinePreflight({ frozen: freezeR5CR2Request({ env: ENV }), secretEvidence: { ...READY_PREFLIGHT.secretEvidence, oldExposedApiKeyRevoked: false } });
  assert.equal(result.secretReady, false);
  assert.equal(result.ready, false);
});

test("all evidence paths use only request-scoped schema enums", () => {
  const frozen = freezeR5CR2Request({ env: ENV });
  const schema = frozen.body.tools[0].function.parameters;
  assert.deepEqual(schema.properties.facts.items.properties.evidenceToken.enum, [...TOKENS].sort());
  assert.deepEqual(schema.properties.inferences.items.properties.evidenceTokens.items.enum, [...TOKENS].sort());
  assert.deepEqual(schema.properties.evidence.items.properties.evidenceToken.enum, [...TOKENS].sort());
  assert.deepEqual(schema.properties.recommendedActions.items.properties.evidenceTokens.items.enum, [...TOKENS].sort());
});

test("unknown evidence token fails closed", () => {
  const invalid = output();
  invalid.facts[0].evidenceToken = "SYN-EVIDENCE-UNKNOWN-001";
  const frozen = freezeR5CR2Request({ env: ENV });
  assert.equal(validateProviderTransportToolArgumentsV4(invalid, { evidenceTokens: frozen.evidenceAllowlist, evidenceTypeByToken: frozen.evidenceTypeByToken, provider: "openai-compatible", model: "deepseek-v4-pro", modelVersion: "deepseek-v4-pro" }).ok, false);
});

test("near-match evidence token fails closed", () => {
  const invalid = output();
  invalid.recommendedActions[0].evidenceTokens[0] = "SYN-EVIDENCE-PIPELINE-01";
  const frozen = freezeR5CR2Request({ env: ENV });
  assert.equal(validateProviderTransportToolArgumentsV4(invalid, { evidenceTokens: frozen.evidenceAllowlist, evidenceTypeByToken: frozen.evidenceTypeByToken, provider: "openai-compatible", model: "deepseek-v4-pro", modelVersion: "deepseek-v4-pro" }).ok, false);
});

test("duplicate evidence within a structured association stops Probe 1", async () => {
  const invalid = output();
  invalid.recommendedActions[0].evidenceTokens = [TOKENS[0], TOKENS[0]];
  const { calls, summary } = await executeWith([invalid, output()]);
  assert.equal(calls, 1);
  assert.equal(summary.counts.probe2Calls, 0);
  assert.equal(summary.probes[0].evidenceDuplicateCount > 0, true);
});

test("risk category evidence type incompatibility fails closed", async () => {
  const invalid = output();
  invalid.riskCategories = [{ code: "route", evidenceTokens: [TOKENS[0]] }];
  const { calls, summary } = await executeWith([invalid, output()]);
  assert.equal(calls, 1);
  assert.equal(summary.probes[0].riskCategoryEvidenceReady, false);
});

test("fixed owner due provider model and fallback values pass", () => {
  assert.equal(validateR5CR2FixedFields(output()).ready, true);
});

test("fixed owner due provider model and fallback drift fails", () => {
  for (const mutate of [
    (value) => { value.recommendedActions[0].ownerRole = "销售人员"; },
    (value) => { value.recommendedActions[0].dueWindow = "两天内"; },
    (value) => { value.provider = "other"; },
    (value) => { value.model = "other"; },
    (value) => { value.fallback.reason = "OTHER"; },
  ]) {
    const invalid = output();
    mutate(invalid);
    assert.equal(validateR5CR2FixedFields(invalid).ready, false);
  }
});

test("readable facts inferences and actions pass", () => {
  const result = validateR5CR2Readability(output());
  assert.equal(result.ready, true);
  assert.equal(result.factReadableCount, result.factCount);
  assert.equal(result.inferenceReadableCount, result.inferenceCount);
  assert.equal(result.actionReadableCount, result.actionCount);
});

test("empty meaningless truncated and forbidden text fail readability", () => {
  for (const invalidText of ["", "UNKNOWN", "内容…", "包含\n换行", "x".repeat(241)]) {
    const invalid = output();
    invalid.facts[0].value = invalidText;
    assert.equal(validateR5CR2Readability(invalid).ready, false);
  }
});

test("readability failure is not misclassified as a hallucination hard failure", async () => {
  const invalid = output();
  invalid.facts[0].value = "UNKNOWN";
  const { calls, summary } = await executeWith([invalid, output()]);
  assert.equal(calls, 1);
  assert.equal(summary.probes[0].readabilityReady, false);
  assert.equal(summary.probes[0].hallucinationHardFailureCount, 0);
  assert.equal(summary.stopReason, "OUTPUT_READABILITY_INVALID");
});

test("health score override is rejected by the strict contract", () => {
  const invalid = output();
  invalid.healthScore = 99;
  const frozen = freezeR5CR2Request({ env: ENV });
  assert.equal(validateProviderTransportToolArgumentsV4(invalid, { evidenceTokens: frozen.evidenceAllowlist, evidenceTypeByToken: frozen.evidenceTypeByToken, provider: "openai-compatible", model: "deepseek-v4-pro", modelVersion: "deepseek-v4-pro" }).ok, false);
});

test("two valid responses prove repeatability with exactly two calls", async () => {
  const { calls, summary } = await executeWith([output(), output()]);
  assert.equal(calls, 2);
  assert.equal(summary.gates.probe1Ready, true);
  assert.equal(summary.gates.probe2Ready, true);
  assert.equal(summary.gates.frozenRequestEnvelopeReady, true);
  assert.equal(summary.gates.outputTopLevelShapeRepeatabilityReady, true);
  assert.equal(summary.gates.providerRequestCompatibilityReady, true);
  assert.equal(summary.gates.providerTransportRepeatabilityReady, true);
  assert.equal(summary.gates.outputSafetyCompatibilityReady, true);
});

test("invalid Probe 1 JSON prevents Probe 2", async () => {
  const { calls, summary } = await executeWith(['{"facts":[}', output()]);
  assert.equal(calls, 1);
  assert.equal(summary.counts.externalLlmCalls, 1);
  assert.equal(summary.counts.probe2Calls, 0);
  assert.equal(summary.gates.providerRequestCompatibilityReady, false);
});

test("the executor never exceeds two external requests", async () => {
  const { calls, summary } = await executeWith([output(), output(), output()]);
  assert.equal(calls, 2);
  assert.equal(summary.counts.externalLlmCalls, 2);
  assert.equal(summary.counts.retry, 0);
  assert.equal(summary.counts.fallback, 0);
});

test("Probe 2 uses the same request bytes as Probe 1", async () => {
  const bodies = [];
  const summary = await executeR5CR2({
    env: ENV,
    preflightEvidence: READY_PREFLIGHT,
    fetchImpl: async (_url, options) => { bodies.push(options.body); return providerResponse(); },
    now: clock(),
  });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(summary.gates.frozenRequestEnvelopeReady, true);
});

test("public artifacts contain only hashes counts and validation metadata", async () => {
  const { summary } = await executeWith([output(), output()]);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "r5c-r2-"));
  await writeR5CR2Artifacts(summary, { outputDir: directory });
  const names = (await fs.readdir(directory)).sort();
  assert.deepEqual(names, [
    "phase3c-r5c-r2-evidence-validation.json",
    "phase3c-r5c-r2-readability-validation.json",
    "phase3c-r5c-r2-repeatability-report.md",
    "phase3c-r5c-r2-request-audit.json",
    "phase3c-r5c-r2-runtime-manifest.json",
    "phase3c-r5c-r2-safety-report.md",
    "phase3c-r5c-r2-transport-validation.json",
    "phase3c-r5c-r3-real-canary-decision-pack-zh.md",
  ]);
  const contents = (await Promise.all(names.map((name) => fs.readFile(path.join(directory, name), "utf8")))).join("\n");
  assert.equal(contents.includes("合成推进信号显示近期节奏偏慢"), false);
  assert.equal(contents.includes("local-test-secret"), false);
  assert.equal(contents.includes("argumentsText"), false);
  assert.equal(contents.includes("DEMO-OPP-002"), false);
});

test("request counters preserve the no CRM and no production boundary", async () => {
  const { summary } = await executeWith([output(), output()]);
  assert.equal(summary.counts.d365Get, 0);
  assert.equal(summary.counts.crmPost, 0);
  assert.equal(summary.counts.crmPatch, 0);
  assert.equal(summary.counts.crmDelete, 0);
  assert.equal(summary.counts.crmWriteback, false);
  assert.equal(summary.counts.productionRequests, 0);
  assert.equal(summary.counts.browserExternalRequests, 0);
});

test("real Canary remains unauthorized after successful synthetic repeatability", async () => {
  const { summary } = await executeWith([output(), output()]);
  assert.equal(summary.gates.realCanaryAuthorized, false);
  assert.equal(summary.realCanaryAuthorized, false);
});
