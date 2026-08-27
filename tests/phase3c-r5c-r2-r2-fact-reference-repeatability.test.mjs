import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildR5CR2R1SyntheticTransportFixture } from "../scripts/run-phase3c-r5c-r2-r1-fact-readability-repair.mjs";
import {
  buildR5CR2R2ProviderEnv,
  executeR5CR2R2,
  freezeR5CR2R2Request,
  hasConsumedR5CR2R2Run,
  validateR5CR2R2Preflight,
  writeR5CR2R2Artifacts,
} from "../scripts/run-phase3c-r5c-r2-r2-fact-reference-repeatability.mjs";

const ROOT = process.cwd();
const ENV = Object.freeze({
  LLM_API_KEY: "test-only",
  LLM_TIMEOUT_MS: "1000",
});

function authorizedPreflight() {
  return {
    externalCallsAuthorized: true,
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
}

function providerResponse(value, id = "local-r5c-r2-r2") {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id,
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 120, completion_tokens: 90, total_tokens: 210 },
      choices: [{
        finish_reason: "tool_calls",
        message: {
          tool_calls: [{
            type: "function",
            function: { name: "emit_decision_pack", arguments: JSON.stringify(value) },
          }],
        },
      }],
    }),
  };
}

function providerRawArgumentsResponse(argumentsText) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id: "local-r5c-r2-r2-invalid-json",
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 120, completion_tokens: 90, total_tokens: 210 },
      choices: [{
        finish_reason: "tool_calls",
        message: {
          tool_calls: [{
            type: "function",
            function: { name: "emit_decision_pack", arguments: argumentsText },
          }],
        },
      }],
    }),
  };
}

function fixture(frozen = freezeR5CR2R2Request({ env: ENV })) {
  return buildR5CR2R1SyntheticTransportFixture(frozen.factCatalog, frozen.evidenceTokens);
}

test("R5C-R2-R2 freezes v6-r4 and Transport v5 byte-identically", () => {
  const first = freezeR5CR2R2Request({ env: ENV });
  const second = freezeR5CR2R2Request({ env: ENV });
  assert.equal(first.providerEnv.PHASE3C_SCHEMA_VERSION, "v6-r4");
  assert.equal(first.hashes.transportV5SchemaHash, "54fce23151dce092111df36ae5238795b0728bf62c96a2b6b8a2021ac944ff12");
  assert.equal(first.hashes.riskCatalogHash, "2b5956e819b576474905b2194ed9fc7c359c2ddb4331e15f4ca2d48dd58234c6");
  assert.equal(first.hashes.evidenceMatrixHash, "af3c5253ace35854aade414087a2152bf0c0074741b5d4860032a166e22ab63c");
  assert.equal(first.hashes.safetyContractHash, "fa4a614988d97ef97f3d7509d71fce385c4160c16a0e6927d035f89a067e1768");
  assert.equal(first.hashes.fixedFieldContractHash, "6c1876a2036b67e61455f84f18033a25b2c22318d782e0046f8ca661bf7a7424");
  assert.equal(first.hashes.executionConfigHash, "58e17a25ad290fd40f3bdc0aa1ac6d8693292e3e6553c018a431658e948dcc55");
  assert.equal(first.requestEnvelopeBytes, second.requestEnvelopeBytes);
  assert.deepEqual(first.hashes, second.hashes);
  assert.deepEqual(first.executionConfig, second.executionConfig);
  assert.equal(first.executionConfig.timeoutMs, 30000);
  assert.equal(first.body.max_tokens, 2400);
  assert.equal(first.body.temperature, 0);
  assert.equal(first.body.stream, false);
  assert.equal(first.body.response_format, undefined);
});

test("Synthetic request contains no real Canary CRM identity or exact amount", () => {
  const frozen = freezeR5CR2R2Request({ env: ENV });
  const preflight = validateR5CR2R2Preflight({ frozen, ...authorizedPreflight() });
  assert.equal(preflight.inputSafety.flagsReady, true);
  assert.equal(preflight.riskCatalog.ready, true);
  assert.equal(preflight.evidenceTypeIndex.ready, true);
  assert.equal(preflight.contractReady, true);
  assert.equal(preflight.ready, true);
  assert.deepEqual(Object.entries(preflight.inputSafety).filter(([key]) => key.endsWith("Count")).map(([, value]) => value), [0, 0, 0, 0, 0, 0]);
  assert.doesNotMatch(frozen.requestEnvelopeBytes, /DEMO-OPP|org91f5f65f|lcn-crm|goldenMetadata|expectedAnswer/iu);
});

test("missing independent authorization performs zero Provider calls", async () => {
  let calls = 0;
  const summary = await executeR5CR2R2({
    env: ENV,
    fetchImpl: async () => { calls += 1; return providerResponse(fixture()); },
    preflightEvidence: { ...authorizedPreflight(), externalCallsAuthorized: false },
    recordPrivateLedger: false,
  });
  assert.equal(calls, 0);
  assert.equal(summary.status, "stopped-preflight");
  assert.equal(summary.counts.externalLlmCalls, 0);
  assert.equal(summary.preflight.contractReady, true);
  assert.equal(summary.preflight.ready, false);
});

test("two valid local Probes complete v6-r4 Transport v5 repeatability", async () => {
  let calls = 0;
  const frozen = freezeR5CR2R2Request({ env: ENV });
  const value = fixture(frozen);
  const summary = await executeR5CR2R2({
    env: ENV,
    fetchImpl: async () => { calls += 1; return providerResponse(value, `local-${calls}`); },
    preflightEvidence: authorizedPreflight(),
    recordPrivateLedger: false,
  });
  assert.equal(calls, 2);
  assert.equal(summary.status, "completed");
  assert.equal(summary.counts.externalLlmCalls, 2);
  assert.equal(summary.counts.transportV5Success, 2);
  assert.equal(summary.counts.factReferenceSuccess, 2);
  assert.equal(summary.counts.riskCategoryCompatibilitySuccess, 2);
  assert.equal(summary.counts.fixedFieldsSuccess, 2);
  assert.equal(summary.counts.safetyStatementsSuccess, 2);
  assert.equal(summary.counts.canonicalContractSuccess, 2);
  assert.equal(summary.counts.readabilitySuccess, 2);
  assert.equal(summary.counts.safetySuccess, 2);
  assert.equal(summary.counts.hallucinationHardFailure, 0);
  assert.equal(summary.probes.every((probe) => probe.attempts === 1 && probe.ready), true);
  assert.equal(summary.probes[0].requestEnvelopeByteHash, summary.probes[1].requestEnvelopeByteHash);
  assert.equal(summary.probes[0].topLevelKeySetHash, summary.probes[1].topLevelKeySetHash);
});

test("Probe 1 unknown Fact reference stops Probe 2 without retry", async () => {
  let calls = 0;
  const frozen = freezeR5CR2R2Request({ env: ENV });
  const invalid = fixture(frozen);
  invalid.facts = [{ factCode: "FACT-UNKNOWN" }];
  const summary = await executeR5CR2R2({
    env: ENV,
    fetchImpl: async () => { calls += 1; return providerResponse(invalid); },
    preflightEvidence: authorizedPreflight(),
    recordPrivateLedger: false,
  });
  assert.equal(calls, 1);
  assert.equal(summary.status, "stopped-safety");
  assert.equal(summary.probes.length, 1);
  assert.equal(summary.probes[0].ready, false);
  assert.equal(summary.probes[0].failureCategory, "TRANSPORT_V5_INVALID");
  assert.equal(summary.counts.retryCount, 0);
  assert.equal(summary.counts.fallbackCount, 0);
});

test("invalid JSON does not fabricate a downstream hallucination audit result", async () => {
  let calls = 0;
  const summary = await executeR5CR2R2({
    env: ENV,
    fetchImpl: async () => { calls += 1; return providerRawArgumentsResponse('{"facts":['); },
    preflightEvidence: authorizedPreflight(),
    recordPrivateLedger: false,
  });
  assert.equal(calls, 1);
  assert.equal(summary.probes[0].failureCategory, "ARGUMENT_JSON_INVALID");
  assert.equal(summary.probes[0].jsonParseReady, false);
  assert.equal(summary.probes[0].unsupportedClaimCount, 0);
  assert.equal(summary.probes[0].hallucinationAuditStatus, "not_run");
  assert.equal(summary.probes[0].hallucinationHardFailureCount, 0);
  assert.equal(summary.counts.hallucinationAuditCompleted, 0);
  assert.equal(summary.counts.hallucinationHardFailure, 0);
});

test("Probe 1 readability failure stops Probe 2 after deterministic Fact mapping", async () => {
  let calls = 0;
  const frozen = freezeR5CR2R2Request({ env: ENV });
  const invalid = fixture(frozen);
  invalid.inferences[0].inference = "NONE";
  const summary = await executeR5CR2R2({
    env: ENV,
    fetchImpl: async () => { calls += 1; return providerResponse(invalid); },
    preflightEvidence: authorizedPreflight(),
    recordPrivateLedger: false,
  });
  assert.equal(calls, 1);
  assert.equal(summary.probes[0].failureCategory, "BUSINESS_READABILITY_INVALID");
  assert.equal(summary.probes[0].factReferenceReady, true);
  assert.equal(summary.probes[0].readabilityReady, false);
});

test("duplicate Evidence Token stops Probe 1 without normalization or retry", async () => {
  let calls = 0;
  const frozen = freezeR5CR2R2Request({ env: ENV });
  const invalid = fixture(frozen);
  invalid.inferences[0].evidenceTokens = [
    "SYN-EVIDENCE-PIPELINE-001",
    "SYN-EVIDENCE-PIPELINE-001",
  ];
  const summary = await executeR5CR2R2({
    env: ENV,
    fetchImpl: async () => { calls += 1; return providerResponse(invalid); },
    preflightEvidence: authorizedPreflight(),
    recordPrivateLedger: false,
  });
  assert.equal(calls, 1);
  assert.equal(summary.probes.length, 1);
  assert.equal(summary.probes[0].failureCategory, "EVIDENCE_TOKEN_DUPLICATE");
  assert.equal(summary.probes[0].evidenceDuplicateCount, 1);
  assert.equal(summary.counts.retryCount, 0);
});

test("risk category and Evidence type mismatch stops before Probe 2", async () => {
  let calls = 0;
  const frozen = freezeR5CR2R2Request({ env: ENV });
  const invalid = fixture(frozen);
  invalid.riskCategories = [{ code: "gap", evidenceTokens: ["SYN-EVIDENCE-PIPELINE-001"] }];
  const summary = await executeR5CR2R2({
    env: ENV,
    fetchImpl: async () => { calls += 1; return providerResponse(invalid); },
    preflightEvidence: authorizedPreflight(),
    recordPrivateLedger: false,
  });
  assert.equal(calls, 1);
  assert.equal(summary.probes[0].riskCategoryCompatibilityReady, false);
  assert.equal(summary.probes[0].failureCategory, "RISK_CATEGORY_EVIDENCE_INVALID");
});

test("fixed owner due window provider model and fallback cannot be rewritten", async () => {
  const cases = [
    (value) => { value.recommendedActions[0].ownerRole = "销售经理"; },
    (value) => { value.recommendedActions[0].dueWindow = "7天内"; },
    (value) => { value.provider = "DeepSeek"; },
    (value) => { value.model = "another-model"; },
    (value) => { value.fallback.state = "used"; },
  ];
  for (const mutate of cases) {
    let calls = 0;
    const frozen = freezeR5CR2R2Request({ env: ENV });
    const invalid = fixture(frozen);
    mutate(invalid);
    const summary = await executeR5CR2R2({
      env: ENV,
      fetchImpl: async () => { calls += 1; return providerResponse(invalid); },
      preflightEvidence: authorizedPreflight(),
      recordPrivateLedger: false,
    });
    assert.equal(calls, 1);
    assert.equal(summary.probes[0].fixedFieldsReady, false);
    assert.equal(summary.probes[0].failureCategory, "FIXED_FIELDS_INVALID");
  }
});

test("public artifacts contain hashes and validation only", async () => {
  const frozen = freezeR5CR2R2Request({ env: ENV });
  const summary = await executeR5CR2R2({
    env: ENV,
    fetchImpl: async () => providerResponse(fixture(frozen)),
    preflightEvidence: authorizedPreflight(),
    recordPrivateLedger: false,
  });
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "r5c-r2-r2-"));
  const files = await writeR5CR2R2Artifacts(summary, { outputDir });
  assert.equal(files.length, 8);
  const publicText = (await Promise.all(files.map((file) => fs.readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(publicText, /SYNTHETIC_LOGISTICS|timelineSummary|authorization\s*:\s*Bearer|sk-[A-Za-z0-9_-]{12,}/iu);
  assert.doesNotMatch(publicText, /"arguments"\s*:|"safeContext"\s*:|"rawResponse"\s*:/iu);
  await fs.rm(outputDir, { recursive: true, force: true });
});

test("private dispatch ledger records before fake network and blocks future consumption", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "r5c-r2-r2-ledger-"));
  const privateLedgerPath = path.join(directory, "private.json");
  const frozen = freezeR5CR2R2Request({ env: ENV });
  const summary = await executeR5CR2R2({
    env: ENV,
    fetchImpl: async () => providerResponse(fixture(frozen)),
    preflightEvidence: authorizedPreflight(),
    privateLedgerPath,
  });
  const ledger = JSON.parse(await fs.readFile(privateLedgerPath, "utf8"));
  const mode = (await fs.stat(privateLedgerPath)).mode & 0o777;
  assert.equal(summary.status, "completed");
  assert.equal(ledger.dispatches.length, 2);
  assert.equal(mode, 0o600);
  assert.equal(await hasConsumedR5CR2R2Run(ROOT, privateLedgerPath), true);
  assert.equal(JSON.stringify(ledger).includes("Authorization"), false);
  await fs.rm(directory, { recursive: true, force: true });
});

test("R5C-R2-R2 executor has no D365 CRM write retry or fallback path", async () => {
  const source = await fs.readFile(path.join(ROOT, "scripts/run-phase3c-r5c-r2-r2-fact-reference-repeatability.mjs"), "utf8");
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:d365|dataverse)[^"']*["']/iu);
  assert.doesNotMatch(source, /\b(?:WinOpportunity|LoseOpportunity)\s*\(/u);
  assert.match(source, /MAX_CALLS = 2/u);
  assert.match(source, /retryCount: 0/u);
  assert.match(source, /fallbackCount: 0/u);
});

test("provider environment is fixed to the approved single endpoint and profile", () => {
  const env = buildR5CR2R2ProviderEnv({ LLM_API_KEY: "test-only" });
  assert.equal(env.LLM_BASE_URL, "https://api.deepseek.com/beta");
  assert.equal(env.LLM_MODEL, "deepseek-v4-pro");
  assert.equal(env.PHASE3C_SCHEMA_VERSION, "v6-r4");
  assert.equal(env.LLM_CANARY_SINGLE_ATTEMPT, "true");
});

test("committed authorization preflight keeps every online gate closed", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(ROOT, "docs/gateway/phase3c-r5c-r2-r2-authorization-preflight.json"), "utf8"));
  assert.equal(manifest.gates.requestContractReady, true);
  assert.equal(manifest.gates.factReadabilityContractReady, true);
  assert.equal(manifest.gates.riskCategoryCatalogReady, true);
  assert.equal(manifest.gates.evidenceTypeMatrixReady, true);
  assert.equal(manifest.gates.safetyContractFrozen, true);
  assert.equal(manifest.gates.fixedFieldContractFrozen, true);
  assert.equal(manifest.gates.executionConfigFrozen, true);
  assert.equal(manifest.gates.privateDispatchLedgerReady, true);
  assert.equal(manifest.gates.privateDispatchLedgerGitIgnored, true);
  assert.equal(manifest.gates.externalCallsAuthorized, false);
  assert.equal(manifest.gates.providerRequestCompatibilityReady, false);
  assert.equal(manifest.gates.providerTransportRepeatabilityReady, false);
  assert.equal(manifest.gates.realCanaryAuthorized, false);
  assert.equal(manifest.counts.externalLlmCalls, 0);
  assert.equal(manifest.counts.d365Get, 0);
  assert.equal(manifest.counts.crmPost + manifest.counts.crmPatch + manifest.counts.crmDelete, 0);
});
