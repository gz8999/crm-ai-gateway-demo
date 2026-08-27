import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildR5B11ProviderEnv,
  executeR5B11,
  freezeR5B11Request,
  validateR5B11OfflinePreflight,
  writeR5B11Artifacts,
} from "../scripts/run-phase3c-r5b11-v6-repeatability.mjs";
import {
  mapProviderTransportToCanonicalV2,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV1,
} from "../server/decision/externalModelContractV2.mjs";
import { buildComparisonRequestBody } from "../server/decision/comparisonProvider.mjs";
import { buildR5B10SharedInput } from "../scripts/run-phase3c-r5b10-serialization-isolation.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const EVIDENCE = "SYN-EVIDENCE-001";
const env = {
  LLM_API_KEY: "synthetic-test-secret",
  LLM_TIMEOUT_MS: "1000",
};
const readyPreflight = {
  authoritativeBaselineReady: true,
  secretEvidence: {
    oldExposedApiKeyRevoked: true,
    newServerSideSecretReady: true,
    secretBrowserExposure: false,
    secretGitExposure: false,
    secretBundleExposure: false,
    secretLogReportExposure: false,
  },
};

function transportOutput(evidenceTokens = [EVIDENCE]) {
  return {
    facts: [{ label: "Synthetic fact", value: "A synthetic review signal is present.", evidenceToken: EVIDENCE }],
    inferences: [{ inference: "The synthetic evidence supports review.", evidenceTokens: [EVIDENCE] }],
    evidence: [{ evidenceToken: EVIDENCE, value: "Synthetic evidence only." }],
    confidence: { level: "Medium", reason: "One synthetic evidence reference is available." },
    recommendedActions: [{
      action: "Review the synthetic signal",
      ownerRole: "synthetic-reviewer",
      dueWindow: "synthetic-window",
      basis: "The supplied synthetic evidence supports review.",
      draftStatus: "Draft only",
      evidenceTokens,
    }],
    priority: "Monitor",
    riskCategories: ["synthetic-review"],
    provider: "openai-compatible",
    model: "deepseek-v4-pro",
    modelVersion: "deepseek-v4-pro",
    fallback: { state: "not_applicable", reason: "Synthetic strict Tool response." },
    safety: {
      identityMasked: true,
      exactAmountWithheld: true,
      rawTimelineWithheld: true,
      crmWritebackPerformed: false,
      policyCodes: ["SAFE_CONTEXT_ONLY", "NO_RAW_CRM", "NO_IDENTITY", "NO_EXACT_AMOUNT", "NO_RAW_TIMELINE", "NO_CRM_WRITEBACK"],
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

test("R5B11 explicitly opts into v6 and leaves v2 through v5 unchanged", () => {
  const input = buildR5B10SharedInput();
  for (const version of ["v2", "v3", "v4", "v5"]) {
    const providerEnv = { ...buildR5B11ProviderEnv(env), PHASE3C_SCHEMA_VERSION: version };
    const body = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: "test", env: providerEnv, nativeMode: true, schemaVersion: version });
    assert.equal(Object.hasOwn(body.tools[0].function.parameters.properties.recommendedActions.items.properties, "evidenceTokens"), false, version);
  }
  const frozen = freezeR5B11Request({ input, env });
  assert.equal(frozen.body.tools[0].function.parameters.properties.recommendedActions.items.required.includes("evidenceTokens"), true);
  assert.equal(frozen.providerEnv.PHASE3C_SCHEMA_VERSION, "v6");
});

test("R5B11 preflight freezes a strict safe request with stable hashes", () => {
  const a = freezeR5B11Request({ env });
  const b = freezeR5B11Request({ env });
  assert.equal(a.syntheticInputHash, b.syntheticInputHash);
  assert.equal(a.requestEnvelopeHash, b.requestEnvelopeHash);
  assert.equal(a.transportSchemaHash, b.transportSchemaHash);
  assert.equal(a.canonicalSchemaHash, b.canonicalSchemaHash);
  assert.equal(a.evidenceAllowlistHash, b.evidenceAllowlistHash);
  const preflight = validateR5B11OfflinePreflight({ frozen: a, ...readyPreflight });
  assert.equal(preflight.ready, true);
  assert.equal(a.body.max_tokens, 2400);
  assert.equal(a.body.temperature, 0);
  assert.equal(a.body.stream, false);
  assert.equal(a.body.tools[0].function.strict, true);
});

test("Action evidenceTokens are required and empty arrays fail closed", () => {
  const missing = transportOutput();
  delete missing.recommendedActions[0].evidenceTokens;
  assert.equal(validateProviderTransportToolArgumentsV1(missing, { evidenceTokens: [EVIDENCE] }).ok, false);
  const empty = transportOutput([]);
  const result = validateProviderTransportToolArgumentsV1(empty, { evidenceTokens: [EVIDENCE] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("action_evidence_required"));
});

test("unknown duplicate and fuzzy Action evidence tokens fail without repair", () => {
  const unknown = validateProviderTransportToolArgumentsV1(transportOutput(["SYN-EVIDENCE-999"]), { evidenceTokens: [EVIDENCE] });
  const duplicate = validateProviderTransportToolArgumentsV1(transportOutput([EVIDENCE, EVIDENCE]), { evidenceTokens: [EVIDENCE] });
  const fuzzy = validateProviderTransportToolArgumentsV1(transportOutput(["SYN-EVIDENCE-01"]), { evidenceTokens: [EVIDENCE] });
  assert.ok(unknown.errors.includes("action_evidence_invalid"));
  assert.ok(duplicate.errors.includes("action_evidence_duplicate"));
  assert.ok(fuzzy.errors.includes("action_evidence_invalid"));
});

test("Canonical basis mapping is deterministic and removes transport-only fields", () => {
  const source = transportOutput();
  const a = mapProviderTransportToCanonicalV2(source, { evidenceTokens: [EVIDENCE] });
  const b = mapProviderTransportToCanonicalV2(source, { evidenceTokens: [EVIDENCE] });
  assert.deepEqual(a, b);
  assert.equal(a.recommendedActions[0].basis, `[${EVIDENCE}] ${source.recommendedActions[0].basis}`);
  assert.equal(Object.hasOwn(a.recommendedActions[0], "evidenceTokens"), false);
  assert.equal(validateExternalModelResponseV2(a, { evidenceTokens: [EVIDENCE] }).ok, true);
});

test("two passing Synthetic probes use byte-stable envelopes and complete repeatability", async () => {
  const requestBodies = [];
  let calls = 0;
  const summary = await executeR5B11({
    env,
    preflightEvidence: readyPreflight,
    fetchImpl: async (_url, options) => {
      calls += 1;
      requestBodies.push(options.body);
      return providerResponse(transportOutput(), `synthetic-${calls}`);
    },
  });
  assert.equal(calls, 2);
  assert.equal(new Set(requestBodies).size, 1);
  assert.equal(summary.counts.externalLlmCalls, 2);
  assert.equal(summary.counts.transportSchemaSuccess, 2);
  assert.equal(summary.counts.actionEvidenceValidationSuccess, 2);
  assert.equal(summary.counts.canonicalContractSuccess, 2);
  assert.equal(summary.counts.evidenceValidationSuccess, 2);
  assert.equal(summary.counts.safetySuccess, 2);
  assert.equal(summary.gates.providerRequestCompatibilityReady, true);
  assert.equal(summary.gates.providerTransportRepeatabilityReady, true);
  assert.equal(summary.gates.realCanaryAuthorized, false);
});

test("Probe 1 failure prevents Probe 2 and preserves retry fallback zero", async () => {
  let calls = 0;
  const summary = await executeR5B11({
    env,
    preflightEvidence: readyPreflight,
    fetchImpl: async () => {
      calls += 1;
      return providerResponse(transportOutput(["SYN-EVIDENCE-UNKNOWN"]));
    },
  });
  assert.equal(calls, 1);
  assert.equal(summary.counts.externalLlmCalls, 1);
  assert.equal(summary.counts.probe2Calls, 0);
  assert.equal(summary.counts.retry, 0);
  assert.equal(summary.counts.fallback, 0);
  assert.equal(summary.gates.providerRequestCompatibilityReady, false);
});

test("R5B11 never exceeds two external calls", async () => {
  let calls = 0;
  const summary = await executeR5B11({
    env,
    preflightEvidence: readyPreflight,
    fetchImpl: async () => { calls += 1; return providerResponse(); },
  });
  assert.equal(calls, 2);
  assert.equal(summary.counts.externalLlmCalls, 2);
});

test("R5B11 request excludes real Canary CRM identity and forbidden fields", () => {
  const body = freezeR5B11Request({ env }).body;
  const serialized = JSON.stringify(body);
  const providerInput = body.messages[1].content;
  assert.equal(serialized.includes("DEMO-OPP-002"), false);
  assert.equal(serialized.includes("DEMO-OPP-"), false);
  assert.equal(/customerName|contactName|exactRevenue|rawTimeline|scenarioId|goldenMetadata|expectedAnswer/i.test(providerInput), false);
  assert.equal(serialized.includes("SYN-OPP-001"), true);
});

test("preflight failure executes zero Provider calls", async () => {
  let calls = 0;
  const summary = await executeR5B11({
    env,
    preflightEvidence: { ...readyPreflight, secretEvidence: { ...readyPreflight.secretEvidence, oldExposedApiKeyRevoked: false } },
    fetchImpl: async () => { calls += 1; return providerResponse(); },
  });
  assert.equal(calls, 0);
  assert.equal(summary.counts.externalLlmCalls, 0);
  assert.equal(summary.status, "stopped-preflight");
});

test("R5B11 public artifacts contain no raw request response or Tool Arguments", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "r5b11-artifacts-"));
  try {
    const summary = await executeR5B11({ env, preflightEvidence: readyPreflight, fetchImpl: async () => providerResponse() });
    await writeR5B11Artifacts(summary, { outputDir });
    const files = await fs.readdir(outputDir);
    assert.equal(files.length, 7);
    const publicText = (await Promise.all(files.map((file) => fs.readFile(path.join(outputDir, file), "utf8")))).join("\n");
    assert.equal(publicText.includes("A synthetic review signal is present."), false);
    assert.equal(publicText.includes("The supplied synthetic evidence supports review."), false);
    assert.equal(publicText.includes("synthetic-test-secret"), false);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("R5B11 source has zero D365 CRM write production retry and fallback paths", async () => {
  const source = await fs.readFile(path.join(ROOT, "scripts/run-phase3c-r5b11-v6-repeatability.mjs"), "utf8");
  assert.equal(/org91f5f65\.crm5\.dynamics\.com|lcn-crm\.crm7\.dynamics\.com|DEMO-OPP-002/i.test(source), false);
  assert.equal(/WinOpportunity|LoseOpportunity|\bPATCH\b|\bDELETE\b|Publish/i.test(source), false);
  assert.equal(/sk-[A-Za-z0-9_-]{20,}/.test(source), false);
  assert.equal(/jsonrepair|stripMarkdown|removeTrailingComma|secondParse|tolerantParser/i.test(source), false);
});

test("committed R5B11 evidence preserves the one-call Risk Category safety stop", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(ROOT, "docs/gateway/phase3c-r5b11-runtime-manifest.json"), "utf8"));
  assert.equal(manifest.stopReason, "RISK_CATEGORY_INVALID");
  assert.equal(manifest.counts.externalLlmCalls, 1);
  assert.equal(manifest.counts.probe1Calls, 1);
  assert.equal(manifest.counts.probe2Calls, 0);
  assert.equal(manifest.counts.jsonParseSuccess, 1);
  assert.equal(manifest.counts.transportSchemaSuccess, 1);
  assert.equal(manifest.counts.actionEvidenceValidationSuccess, 1);
  assert.equal(manifest.counts.canonicalContractSuccess, 1);
  assert.equal(manifest.counts.evidenceValidationSuccess, 1);
  assert.equal(manifest.counts.safetySuccess, 1);
  assert.equal(manifest.gates.providerRequestCompatibilityReady, false);
  assert.equal(manifest.gates.providerTransportRepeatabilityReady, false);
  assert.equal(manifest.gates.realCanaryAuthorized, false);
});
