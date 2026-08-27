import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import {
  PROVIDER_TRANSPORT_CONTRACT_V5_VERSION,
  mapProviderTransportV5ToCanonicalV2,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV5,
  validateScopedOutputSafetyV2,
} from "../server/decision/externalModelContractV2.mjs";
import {
  DEEPSEEK_FACT_REFERENCE_PROFILE_V6R4_VERSION,
  buildDeepseekDecisionToolSchemaV6R4,
  lintDeepSeekRequestShapeV2,
  lintDeepSeekSchemaCompleteness,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import { buildEvidenceTypeIndex } from "../server/decision/riskCategoryContract.mjs";
import {
  buildSafeFactCatalog,
  isReadableBusinessText,
  validateCanonicalBusinessReadability,
  validateSafeFactCatalog,
} from "../server/decision/safeFactCatalog.mjs";
import {
  buildR5CR2R1OfflineSummary,
  buildR5CR2R1SyntheticInput,
} from "../scripts/run-phase3c-r5c-r2-r1-fact-readability-repair.mjs";
import { buildR5CR2SyntheticInput, freezeR5CR2Request, validateR5CR2Readability } from "../scripts/run-phase3c-r5c-r2-v6r3-repeatability.mjs";

const ROOT = process.cwd();
const ENV = Object.freeze({
  AI_PROVIDER: "openai-compatible",
  ALLOW_EXTERNAL_AI: "true",
  LLM_BASE_URL: "https://api.deepseek.com/beta",
  LLM_MODEL: "deepseek-v4-pro",
  LLM_API_KEY: "test-only",
  LLM_TIMEOUT_MS: "1000",
  LLM_MAX_TOKENS: "2400",
  PHASE3C_NATIVE_JSON_MODE: "strict-tool",
  PHASE3C_SCHEMA_VERSION: "v6-r4",
  LLM_CANARY_SINGLE_ATTEMPT: "true",
});
const INPUT = buildR5CR2SyntheticInput();
const EVIDENCE_TYPES = buildEvidenceTypeIndex({
  evidenceTokens: INPUT.safeContext.evidenceTokens,
  bindings: {
    "SYN-EVIDENCE-PIPELINE-001": ["PIPELINE_PROGRESS", "RELATIVE_DATE"],
    "SYN-EVIDENCE-FINANCIAL-001": ["FINANCIAL_BAND", "FINANCIAL_VARIANCE"],
    "SYN-EVIDENCE-ENGAGEMENT-001": ["ENGAGEMENT", "DECISION_READINESS"],
    "SYN-EVIDENCE-COVERAGE-001": ["SERVICE_COVERAGE", "ACCOUNT_GROWTH"],
    "SYN-EVIDENCE-DATA-QUALITY-001": ["DATA_QUALITY"],
  },
});

function options() {
  const factCatalog = buildSafeFactCatalog({
    ...INPUT,
    evidenceTokens: INPUT.safeContext.evidenceTokens,
    evidenceTypeByToken: EVIDENCE_TYPES,
  });
  return {
    evidenceTokens: INPUT.safeContext.evidenceTokens,
    evidenceTypeByToken: EVIDENCE_TYPES,
    factCatalog,
    provider: "openai-compatible",
    model: "deepseek-v4-pro",
    modelVersion: "deepseek-v4-pro",
  };
}

function output(factCodes = ["FACT-AMOUNT-BAND", "FACT-OPPORTUNITY-STATE", "FACT-PIPELINE-STAGE"]) {
  const pipeline = "SYN-EVIDENCE-PIPELINE-001";
  return {
    facts: factCodes.map((factCode) => ({ factCode })),
    inferences: [{ inference: "当前推进条件仍需人工核实", evidenceTokens: [pipeline] }],
    evidence: [{ evidenceToken: pipeline, value: "合成流程证据支持当前判断" }],
    confidence: { level: "Medium", reason: "当前安全证据支持中等置信度" },
    recommendedActions: [{
      action: "核实下一步推进条件",
      ownerRole: "待人工指定",
      dueWindow: "待人工确定",
      basis: "当前流程证据仍需人工复核",
      draftStatus: "Draft only",
      evidenceTokens: [pipeline],
    }],
    priority: "High",
    riskCategories: [{ code: "stalled", evidenceTokens: [pipeline] }],
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

function providerResponse(value) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id: "offline-v6-r4-response",
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 },
      choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: JSON.stringify(value) } }] } }],
    }),
  };
}

test("v6-r4 and Transport v5 are explicit opt-in versions", () => {
  assert.equal(DEEPSEEK_FACT_REFERENCE_PROFILE_V6R4_VERSION, "DeepSeek Decision Tool Fact Reference Profile v6-r4");
  assert.equal(PROVIDER_TRANSPORT_CONTRACT_V5_VERSION, "Provider Transport Contract v5");
});

test("safe fact catalog is deterministic evidence-backed and business-readable", () => {
  const first = options().factCatalog;
  const second = options().factCatalog;
  assert.deepEqual(first, second);
  assert.equal(first.length, 14);
  assert.equal(validateSafeFactCatalog(first, { evidenceTokens: INPUT.safeContext.evidenceTokens }).ready, true);
  assert.equal(first.every((fact) => isReadableBusinessText(fact.label) && isReadableBusinessText(fact.value)), true);
  assert.equal(first.some((fact) => fact.value === "MEDIUM_BAND"), false);
  assert.equal(first.find((fact) => fact.factCode === "FACT-AMOUNT-BAND")?.value, "金额区间为中等区间");
});

test("fact catalog rejects duplicate codes unreadable values and unknown evidence", () => {
  const catalog = options().factCatalog;
  const duplicate = [...catalog, structuredClone(catalog[0])];
  assert.equal(validateSafeFactCatalog(duplicate, { evidenceTokens: INPUT.safeContext.evidenceTokens }).ready, false);
  const unreadable = structuredClone(catalog);
  unreadable[0].value = "MEDIUM_BAND";
  assert.equal(validateSafeFactCatalog(unreadable, { evidenceTokens: INPUT.safeContext.evidenceTokens }).errors.includes("fact_value_unreadable"), true);
  const unknownEvidence = structuredClone(catalog);
  unknownEvidence[0].evidenceToken = "SYN-EVIDENCE-UNKNOWN-001";
  assert.equal(validateSafeFactCatalog(unknownEvidence, { evidenceTokens: INPUT.safeContext.evidenceTokens }).errors.includes("fact_evidence_unknown"), true);
});

test("Transport v5 schema accepts only request-scoped fact codes", () => {
  const schema = buildDeepseekDecisionToolSchemaV6R4(options());
  const factItem = schema.properties.facts.items;
  assert.deepEqual(Object.keys(factItem.properties), ["factCode"]);
  assert.equal(factItem.additionalProperties, false);
  assert.deepEqual(factItem.required, ["factCode"]);
  assert.deepEqual(factItem.properties.factCode.enum, options().factCatalog.map((fact) => fact.factCode).sort());
  const lint = lintDeepSeekSchemaCompleteness(schema);
  assert.equal(lint.missingTypeAnyOfRefCount, 0);
  assert.equal(lint.missingRequiredCount, 0);
  assert.equal(lint.missingAdditionalPropertiesCount, 0);
  assert.equal(lint.unsupportedKeywordCount, 0);
});

test("provider cannot emit or override fact labels and values", () => {
  const invalid = output();
  invalid.facts = [{ factCode: "FACT-AMOUNT-BAND", label: "模型标签", value: "MEDIUM_BAND" }];
  const result = validateProviderTransportToolArgumentsV5(invalid, options());
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.includes(":extra:label") || error.includes(":extra:value")), true);
});

test("unknown duplicate and near-match fact references fail closed", () => {
  for (const facts of [
    [{ factCode: "FACT-UNKNOWN" }],
    [{ factCode: "FACT-AMOUNT-BAND" }, { factCode: "FACT-AMOUNT-BAND" }],
    [{ factCode: "FACT-AMOUNT-BANDS" }],
  ]) {
    const invalid = output();
    invalid.facts = facts;
    assert.equal(validateProviderTransportToolArgumentsV5(invalid, options()).ok, false);
  }
});

test("empty fact references fail closed", () => {
  const invalid = output([]);
  const result = validateProviderTransportToolArgumentsV5(invalid, options());
  assert.equal(result.ok, false);
  assert.equal(result.errors.includes("fact_reference_required"), true);
});

test("fact references map deterministically to unchanged Canonical v2", () => {
  const first = mapProviderTransportV5ToCanonicalV2(output(["FACT-PIPELINE-STAGE", "FACT-AMOUNT-BAND"]), options());
  const second = mapProviderTransportV5ToCanonicalV2(output(["FACT-AMOUNT-BAND", "FACT-PIPELINE-STAGE"]), options());
  assert.deepEqual(first.output, second.output);
  assert.deepEqual(first.output.facts.map(({ label, value }) => ({ label, value })), [
    { label: "金额区间", value: "金额区间为中等区间" },
    { label: "流程阶段", value: "流程阶段为授予资格" },
  ]);
  assert.equal(validateExternalModelResponseV2(first.output, { evidenceTokens: INPUT.safeContext.evidenceTokens }).ok, true);
  assert.equal(validateR5CR2Readability(first.output).ready, true);
  assert.deepEqual(validateCanonicalBusinessReadability(first.output), validateR5CR2Readability(first.output));
  assert.equal(validateScopedOutputSafetyV2(first.output).ok, true);
});

test("v6-r4 request carries the safe fact catalog and no output schema copy", () => {
  const body = buildComparisonRequestBody({ ...INPUT, page: "offline-fact-repair", evidenceTypeByToken: EVIDENCE_TYPES, env: ENV, nativeMode: true, schemaVersion: "v6-r4" });
  const user = JSON.parse(body.messages[1].content);
  assert.equal(user.providerTransportContractVersion, PROVIDER_TRANSPORT_CONTRACT_V5_VERSION);
  assert.deepEqual(user.safeFactCatalog, options().factCatalog);
  assert.equal(user.outputSchema, undefined);
  assert.match(body.messages[0].content, /Select each fact only by exact factCode/);
  assert.equal(lintDeepSeekRequestShapeV2(body).ok, true);
});

test("v6-r3 request and Transport v4 schema hash remain unchanged", () => {
  const frozen = freezeR5CR2Request({ input: INPUT, env: { ...ENV, PHASE3C_SCHEMA_VERSION: "v6-r3" } });
  const user = JSON.parse(frozen.body.messages[1].content);
  assert.equal(user.safeFactCatalog, undefined);
  assert.equal(frozen.transportV4SchemaHash, "be549893663c8f2cf420a021c4ef1b2fccd1c95e0f335591e353a3920484de2b");
});

test("local mock maps v6-r4 fact references with one attempt and no fallback", async () => {
  let calls = 0;
  const result = await callComparisonProvider({
    ...INPUT,
    page: "offline-fact-repair",
    evidenceTypeByToken: EVIDENCE_TYPES,
    env: ENV,
    fetchImpl: async () => { calls += 1; return providerResponse(output()); },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 1);
  assert.equal(result.transportContractVersion, PROVIDER_TRANSPORT_CONTRACT_V5_VERSION);
  assert.equal(result.output.facts.every((fact) => isReadableBusinessText(fact.value)), true);
});

test("invalid local mock fact reference fails after one attempt and never retries", async () => {
  let calls = 0;
  const invalid = output(["FACT-UNKNOWN"]);
  const result = await callComparisonProvider({
    ...INPUT,
    page: "offline-fact-repair",
    evidenceTypeByToken: EVIDENCE_TYPES,
    env: ENV,
    fetchImpl: async () => { calls += 1; return providerResponse(invalid); },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "output_contract_invalid");
  assert.equal(result.attempts, 1);
});

test("missing evidence type index blocks before provider fetch", async () => {
  let calls = 0;
  const result = await callComparisonProvider({
    ...INPUT,
    page: "offline-fact-repair",
    evidenceTypeByToken: {},
    env: ENV,
    fetchImpl: async () => { calls += 1; return providerResponse(output()); },
  });
  assert.equal(calls, 0);
  assert.equal(result.called, false);
  assert.equal(result.reason, "evidence_type_index_invalid");
});

test("historical Transport v1-v4 and R5C-R2 evidence remain byte unchanged", async () => {
  const expected = {
    "docs/gateway/provider-transport-contract-v1.json": "dc001720da99f95116e1abc47d8a559225c2c3908edc75f5d47822603964893f",
    "docs/gateway/provider-transport-contract-v2.json": "3c7b8d6a9f24f8f8c9d01aa5278e5208dde1e331d11a6b85ede1f105a998a885",
    "docs/gateway/provider-transport-contract-v3.json": "c7f2b1bec3d69202e7053ac1f4ff0a0208a29a13bbb5659efc3d9a20a24d96fa",
    "docs/gateway/provider-transport-contract-v4.json": "2a6150a09f798cae7741a271e1033450ecb12454f01c12216b32de0bd59917c6",
    "docs/gateway/phase3c-r5c-r2-repeatability-report.md": "dd5f215ec24aa571228016f1b359528f6cab7c1fb9da9de3c3b3821fa6f6609a",
    "docs/gateway/phase3c-r5c-r2-runtime-manifest.json": "963869eafb8d3746e1a7130204fdae0a823d873c3182fe4534df4db2d4b074c9",
    "docs/gateway/phase3c-r5c-r2-request-audit.json": "01ff740c4b73b74751308601208a2714d07d24cef2299ce7665c88de0f2e51d3",
    "docs/gateway/phase3c-r5c-r2-transport-validation.json": "8a2837b396115f70c7c2c8f5959bda938d673edc5e5975168131fb026dd9b32c",
    "docs/gateway/phase3c-r5c-r2-evidence-validation.json": "b291b723585ac6506fb09d28c622a401c27010d4b432587b2a3b53477ecd6be8",
    "docs/gateway/phase3c-r5c-r2-readability-validation.json": "61f6b6e33b8076f40814f901e13a196b4e83e77df969e3114709507642e1ec75",
    "docs/gateway/phase3c-r5c-r2-safety-report.md": "2d576ebde67c6c6896e177879dcf49ed5b5f3754e653061af12ff30f14fe8039",
    "docs/gateway/phase3c-r5c-r3-real-canary-decision-pack-zh.md": "56f38124cb5953b31aa9d8d6ceed6364c02d4c852d544f94dfadcd4bfc854b50",
  };
  for (const [file, hash] of Object.entries(expected)) {
    const bytes = await fs.readFile(path.join(ROOT, file));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hash, file);
  }
});

test("offline repair source has no D365 or external execution path", async () => {
  const files = [
    "server/decision/safeFactCatalog.mjs",
    "server/decision/externalModelContractV2.mjs",
    "server/decision/deepseekStrictSchema.mjs",
    "scripts/run-phase3c-r5c-r2-r1-fact-readability-repair.mjs",
  ];
  const source = (await Promise.all(files.map((file) => fs.readFile(path.join(ROOT, file), "utf8")))).join("\n");
  assert.doesNotMatch(source, /org91f5f65f|lcn-crm|WinOpportunity|LoseOpportunity/);
  const runner = await fs.readFile(path.join(ROOT, files.at(-1)), "utf8");
  assert.doesNotMatch(runner, /dotenv|LLM_API_KEY|callComparisonProvider|\bfetch\s*\(/u);
});

test("Transport v5 schema hash is deterministic", () => {
  const first = buildDeepseekDecisionToolSchemaV6R4(options());
  const second = buildDeepseekDecisionToolSchemaV6R4(options());
  assert.equal(schemaHash(first), schemaHash(second));
});

test("offline summary closes all repair gates without network or CRM access", async () => {
  const summary = await buildR5CR2R1OfflineSummary();
  assert.equal(summary.status, "completed-offline");
  assert.equal(summary.hashes.transportV5SchemaHash, "54fce23151dce092111df36ae5238795b0728bf62c96a2b6b8a2021ac944ff12");
  assert.equal(summary.gates.r5cR2R1OfflineRepairComplete, true);
  assert.equal(summary.gates.r5cR2R2SyntheticProbeReady, true);
  assert.equal(summary.gates.providerRequestCompatibilityReady, false);
  assert.equal(summary.gates.providerTransportRepeatabilityReady, false);
  assert.equal(summary.gates.onlineSyntheticProbeAuthorized, false);
  assert.equal(summary.counts.externalLlmCalls, 0);
  assert.equal(summary.counts.d365Get, 0);
  assert.equal(summary.counts.crmPost + summary.counts.crmPatch + summary.counts.crmDelete, 0);
});

test("offline Synthetic input is frozen locally and contains no real CRM eligibility", () => {
  const input = buildR5CR2R1SyntheticInput();
  assert.equal(input.safeContext.testOnly, true);
  assert.equal(input.safeContext.syntheticProbe, true);
  assert.equal(input.safeContext.d365Record, false);
  assert.equal(input.safeContext.runtimeEligible, false);
  assert.equal(input.safeContext.realCanary, false);
  assert.equal(input.safeContext.externalCallEligible, false);
  assert.match(JSON.stringify(input), /SYN-OPP-001/u);
  assert.doesNotMatch(JSON.stringify(input), /DEMO-OPP|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu);
});

test("public R5C-R2-R1 artifacts contain only offline evidence and keep online gates closed", async () => {
  const files = [
    "docs/gateway/provider-transport-contract-v5.json",
    "docs/gateway/phase3c-r5c-r2-r1-validation-manifest.json",
    "docs/gateway/phase3c-r5c-r2-r1-fact-readability-contract-repair.md",
    "docs/gateway/phase3c-r5c-r2-r2-synthetic-repeatability-decision-pack-zh.md",
  ];
  const content = (await Promise.all(files.map((file) => fs.readFile(path.join(ROOT, file), "utf8")))).join("\n");
  const contract = JSON.parse(await fs.readFile(path.join(ROOT, files[0]), "utf8"));
  const manifest = JSON.parse(await fs.readFile(path.join(ROOT, files[1]), "utf8"));
  assert.equal(contract.strictSchema.frozenSyntheticHash, "54fce23151dce092111df36ae5238795b0728bf62c96a2b6b8a2021ac944ff12");
  assert.equal(contract.runtimeStatus.onlineSyntheticProbeAuthorized, false);
  assert.equal(manifest.gates.providerRequestCompatibilityReady, false);
  assert.equal(manifest.gates.onlineSyntheticProbeAuthorized, false);
  assert.doesNotMatch(content, /Authorization|Bearer\s+|sk-[A-Za-z0-9]{12,}|client_secret|timelineSummary\s*[:=]/iu);
});
