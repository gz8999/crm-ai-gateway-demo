import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildComparisonRequestBody } from "../server/decision/comparisonProvider.mjs";
import {
  SAFETY_POLICY_CODES,
  mapProviderTransportV3ToCanonicalV2,
  providerTransportToolSchemaV1,
  providerTransportToolSchemaV2,
  validateProviderTransportToolArgumentsV3,
} from "../server/decision/externalModelContractV2.mjs";
import { schemaHash } from "../server/decision/deepseekStrictSchema.mjs";
import {
  buildR5B11R3ProviderEnv,
  buildR5B11R3SyntheticInput,
  executeR5B11R3,
  freezeR5B11R3Request,
  validateR5B11R3OfflinePreflight,
  writeR5B11R3Artifacts,
} from "../scripts/run-phase3c-r5b11-r3-transport-v3-repeatability.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const DATA_QUALITY = "SYN-EVIDENCE-DATA-QUALITY-001";
const env = { LLM_API_KEY: "synthetic-test-secret", LLM_TIMEOUT_MS: "1000" };
const readyPreflight = {
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
};

function fixture() {
  const frozen = freezeR5B11R3Request({ env });
  return { evidenceTokens: frozen.evidenceAllowlist, evidenceTypeByToken: frozen.evidenceTypeByToken };
}

function transportOutput() {
  return {
    facts: [{ label: "Synthetic fact", value: "A synthetic review signal is present.", evidenceToken: DATA_QUALITY }],
    inferences: [{ inference: "The synthetic evidence supports review.", evidenceTokens: [DATA_QUALITY] }],
    evidence: [{ evidenceToken: DATA_QUALITY, value: "Synthetic evidence only." }],
    confidence: { level: "Medium", reason: "One synthetic evidence reference is available." },
    recommendedActions: [{
      action: "Review the synthetic signal",
      ownerRole: "synthetic-reviewer",
      dueWindow: "synthetic-window",
      basis: "The supplied synthetic evidence supports review.",
      draftStatus: "Draft only",
      evidenceTokens: [DATA_QUALITY],
    }],
    priority: "Monitor",
    riskCategories: [{ code: "contradiction", evidenceTokens: [DATA_QUALITY] }],
    provider: "openai-compatible",
    model: "deepseek-v4-pro",
    modelVersion: "deepseek-v4-pro",
    fallback: { state: "not_applicable", reason: "Synthetic strict Tool response." },
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

function providerResponse(output = transportOutput(), id = "synthetic-response") {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id,
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 },
      choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: JSON.stringify(output) } }] } }],
    }),
  };
}

test("v6-r2 is explicit and Transport v1 v2 v3 remain distinct", () => {
  const frozen = freezeR5B11R3Request({ env });
  assert.equal(frozen.providerEnv.PHASE3C_SCHEMA_VERSION, "v6-r2");
  assert.equal(schemaHash(providerTransportToolSchemaV1), "12838eecacdaabe7f2e1a55c660847652dcfc2abcb87e381f1b45d8aba851236");
  assert.equal(schemaHash(providerTransportToolSchemaV2), "69083368d8ea37beb074441a723eb274cfbcebb6ef86b5a429ff90695e74869d");
  assert.equal(frozen.transportV3SchemaHash, "9056533322a5b05ce7ea6be9b21f4579efc0088ff61c1a0b2e1c94a503df77eb");
  assert.notEqual(frozen.transportV3SchemaHash, frozen.transportV2SchemaHash);
});

test("two frozen Synthetic requests have identical hashes and bytes", () => {
  const first = freezeR5B11R3Request({ env });
  const second = freezeR5B11R3Request({ input: first.input, env });
  assert.equal(first.syntheticInputHash, second.syntheticInputHash);
  assert.equal(first.requestEnvelopeHash, second.requestEnvelopeHash);
  assert.equal(first.requestEnvelopeByteHash, second.requestEnvelopeByteHash);
  assert.equal(first.requestEnvelopeBytes, second.requestEnvelopeBytes);
  assert.equal(first.safetyContractHash, second.safetyContractHash);
});

test("Synthetic request excludes real Canary and forbidden runtime data", () => {
  const frozen = freezeR5B11R3Request({ env });
  const serialized = frozen.requestEnvelopeBytes;
  assert.equal(serialized.includes("SYN-OPP-001"), true);
  assert.doesNotMatch(serialized, /DEMO-OPP-002|DEMO-OPP-/i);
  const preflight = validateR5B11R3OfflinePreflight({ frozen, ...readyPreflight });
  assert.equal(preflight.ready, true);
  assert.deepEqual(preflight.requestSafety, { realCrmTokenCount: 0, guidCount: 0, identityCount: 0, exactAmountCount: 0, rawTimelineCount: 0, scenarioGoldenCount: 0 });
});

test("Action Evidence is required, allowlisted, nonempty, and nonduplicate", () => {
  const options = fixture();
  const missing = transportOutput();
  delete missing.recommendedActions[0].evidenceTokens;
  assert.equal(validateProviderTransportToolArgumentsV3(missing, options).ok, false);
  const empty = transportOutput();
  empty.recommendedActions[0].evidenceTokens = [];
  assert.equal(validateProviderTransportToolArgumentsV3(empty, options).errors.includes("action_evidence_required"), true);
  const unknown = transportOutput();
  unknown.recommendedActions[0].evidenceTokens = ["SYN-EVIDENCE-UNKNOWN"];
  assert.equal(validateProviderTransportToolArgumentsV3(unknown, options).errors.includes("action_evidence_invalid"), true);
  const duplicate = transportOutput();
  duplicate.recommendedActions[0].evidenceTokens = [DATA_QUALITY, DATA_QUALITY];
  assert.equal(validateProviderTransportToolArgumentsV3(duplicate, options).errors.includes("action_evidence_duplicate"), true);
});

test("Risk Category Evidence is required and must match its Evidence Type", () => {
  const options = fixture();
  const empty = transportOutput();
  empty.riskCategories[0].evidenceTokens = [];
  assert.equal(validateProviderTransportToolArgumentsV3(empty, options).errors.includes("risk_category_evidence_required"), true);
  const incompatible = transportOutput();
  incompatible.riskCategories = [{ code: "gap", evidenceTokens: [DATA_QUALITY] }];
  const result = validateProviderTransportToolArgumentsV3(incompatible, options);
  assert.equal(result.ok, false);
  assert.equal(result.errors.includes("risk_category_evidence_incompatible"), true);
});

test("all six Safety assertions are mandatory fixed values", () => {
  const options = fixture();
  for (const code of SAFETY_POLICY_CODES) {
    const missing = transportOutput();
    delete missing.safety.policyAssertions[code];
    assert.equal(validateProviderTransportToolArgumentsV3(missing, options).ok, false, code);
    const wrong = transportOutput();
    wrong.safety.policyAssertions[code] = false;
    assert.equal(validateProviderTransportToolArgumentsV3(wrong, options).ok, false, code);
  }
});

test("Canonical mapping is deterministic and cannot include Health Score overrides", () => {
  const options = fixture();
  const a = mapProviderTransportV3ToCanonicalV2(transportOutput(), options);
  const b = mapProviderTransportV3ToCanonicalV2(transportOutput(), options);
  assert.deepEqual(a, b);
  assert.deepEqual(a.output.safety.policyCodes, SAFETY_POLICY_CODES);
  const override = transportOutput();
  override.healthScore = 99;
  assert.equal(validateProviderTransportToolArgumentsV3(override, options).ok, false);
});

test("Probe 1 failure stops Probe 2 with zero retry and fallback", async () => {
  let calls = 0;
  const invalid = transportOutput();
  invalid.riskCategories = [{ code: "gap", evidenceTokens: [DATA_QUALITY] }];
  const summary = await executeR5B11R3({
    env,
    preflightEvidence: readyPreflight,
    fetchImpl: async () => { calls += 1; return providerResponse(invalid); },
  });
  assert.equal(calls, 1);
  assert.equal(summary.counts.externalLlmCalls, 1);
  assert.equal(summary.counts.probe2Calls, 0);
  assert.equal(summary.counts.retry, 0);
  assert.equal(summary.counts.fallback, 0);
  assert.equal(summary.gates.providerTransportRepeatabilityReady, false);
});

test("two valid local Probes prove byte-stable repeatability with a two-call maximum", async () => {
  let calls = 0;
  const bodies = [];
  const summary = await executeR5B11R3({
    env,
    preflightEvidence: readyPreflight,
    fetchImpl: async (_url, options) => { calls += 1; bodies.push(options.body); return providerResponse(transportOutput(), `synthetic-${calls}`); },
  });
  assert.equal(calls, 2);
  assert.equal(new Set(bodies).size, 1);
  assert.equal(summary.counts.externalLlmCalls, 2);
  assert.equal(summary.counts.transportV3Success, 2);
  assert.equal(summary.counts.actionEvidenceSuccess, 2);
  assert.equal(summary.counts.riskCategoryEvidenceSuccess, 2);
  assert.equal(summary.counts.categoryEvidenceCompatibilitySuccess, 2);
  assert.equal(summary.counts.safetyStatementSuccess, 2);
  assert.equal(summary.counts.canonicalMappingSuccess, 2);
  assert.equal(summary.counts.canonicalContractSuccess, 2);
  assert.equal(summary.counts.evidenceSuccess, 2);
  assert.equal(summary.counts.safetySuccess, 2);
  assert.equal(summary.counts.hallucinationHardFailure, 0);
  assert.equal(summary.counts.retry, 0);
  assert.equal(summary.counts.fallback, 0);
  assert.equal(summary.counts.d365Get, 0);
  assert.equal(summary.counts.crmPost, 0);
  assert.equal(summary.counts.crmPatch, 0);
  assert.equal(summary.counts.crmDelete, 0);
  assert.equal(summary.counts.crmWriteback, false);
  assert.equal(summary.counts.productionRequests, 0);
  assert.equal(summary.gates.providerRequestCompatibilityReady, true);
  assert.equal(summary.gates.providerTransportRepeatabilityReady, true);
  assert.equal(summary.gates.realCanaryAuthorized, false);
});

test("preflight failure performs no Provider call", async () => {
  let calls = 0;
  const summary = await executeR5B11R3({
    env,
    preflightEvidence: { ...readyPreflight, secretEvidence: { ...readyPreflight.secretEvidence, oldExposedApiKeyRevoked: false } },
    fetchImpl: async () => { calls += 1; return providerResponse(); },
  });
  assert.equal(calls, 0);
  assert.equal(summary.counts.externalLlmCalls, 0);
});

test("R3 writes exactly seven public artifacts without raw content", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "r5b11-r3-artifacts-"));
  try {
    const summary = await executeR5B11R3({ env, preflightEvidence: readyPreflight, fetchImpl: async () => providerResponse() });
    await writeR5B11R3Artifacts(summary, { outputDir });
    const files = (await fs.readdir(outputDir)).sort();
    assert.deepEqual(files, [
      "phase3c-r5b11-r3-evidence-validation.json",
      "phase3c-r5b11-r3-repeatability-report.md",
      "phase3c-r5b11-r3-request-audit.json",
      "phase3c-r5b11-r3-runtime-manifest.json",
      "phase3c-r5b11-r3-safety-report.md",
      "phase3c-r5b11-r3-transport-validation.json",
      "phase3c-r5c-real-canary-decision-pack-v4-zh.md",
    ]);
    const publicText = (await Promise.all(files.map((file) => fs.readFile(path.join(outputDir, file), "utf8")))).join("\n");
    assert.equal(publicText.includes("A synthetic review signal is present."), false);
    assert.equal(publicText.includes("The supplied synthetic evidence supports review."), false);
    assert.equal(publicText.includes("synthetic-test-secret"), false);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("R3 source has no D365, CRM write, production, retry, fallback, or secret path", async () => {
  const source = await fs.readFile(path.join(ROOT, "scripts/run-phase3c-r5b11-r3-transport-v3-repeatability.mjs"), "utf8");
  assert.doesNotMatch(source, /org91f5f65\.crm5\.dynamics\.com|lcn-crm\.crm7\.dynamics\.com|WinOpportunity|LoseOpportunity|api\/data\/v9/i);
  assert.doesNotMatch(source, /jsonrepair|stripMarkdown|removeTrailingComma|secondParse|tolerantParser/i);
  assert.doesNotMatch(source, /(?:^|[\s"'=])sk-[A-Za-z0-9_-]{20,}(?=$|[\s"'])/);
  const input = buildR5B11R3SyntheticInput();
  const v6 = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: "test", env: buildR5B11R3ProviderEnv(env), nativeMode: true, schemaVersion: "v6" });
  const v6r2 = freezeR5B11R3Request({ input, env }).body;
  assert.notEqual(schemaHash(v6.tools[0].function.parameters), schemaHash(v6r2.tools[0].function.parameters));
});
