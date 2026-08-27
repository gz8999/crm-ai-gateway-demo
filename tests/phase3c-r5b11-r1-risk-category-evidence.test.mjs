import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildComparisonRequestBody } from "../server/decision/comparisonProvider.mjs";
import {
  externalModelResponseJsonSchemaV2,
  mapProviderTransportToCanonicalV2WithRiskEvidence,
  providerTransportToolSchemaV1,
  providerTransportToolSchemaV2,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV2,
} from "../server/decision/externalModelContractV2.mjs";
import {
  deepseekDecisionToolSchemaV6R1,
  lintDeepSeekSchemaCompleteness,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import {
  CANONICAL_RISK_CATEGORY_CATALOG,
  CANONICAL_RISK_CATEGORY_CODES,
  buildRiskCategoryEvidenceMatrix,
  validateEvidenceTypeIndex,
  validateRiskCategoryCatalog,
  validateStructuredRiskCategoryEvidence,
} from "../server/decision/riskCategoryContract.mjs";
import {
  buildR5B11R1ProviderEnv,
  buildR5B11R1SyntheticInput,
  classifyHistoricalR5B11Failure,
  executeR5B11R1,
  freezeR5B11R1Request,
  validateR5B11R1OfflinePreflight,
  writeR5B11R1Artifacts,
} from "../scripts/run-phase3c-r5b11-r1-risk-category-revalidation.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const EVIDENCE = "SYN-EVIDENCE-DATA-QUALITY-001";
const FINANCIAL_EVIDENCE = "SYN-EVIDENCE-FINANCIAL-001";
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
    secretLogReportExposure: false,
  },
};

function transportOutput({ category = "contradiction", categoryEvidence = [EVIDENCE], actionEvidence = [EVIDENCE] } = {}) {
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
      evidenceTokens: actionEvidence,
    }],
    priority: "Monitor",
    riskCategories: [{ code: category, evidenceTokens: categoryEvidence }],
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

function validationOptions() {
  const frozen = freezeR5B11R1Request({ env });
  return { evidenceTokens: frozen.evidenceAllowlist, evidenceTypeByToken: frozen.evidenceTypeByToken };
}

test("Canonical Risk Category Catalog is the single exact source for schema runtime and UI", async () => {
  const catalog = validateRiskCategoryCatalog();
  const matrix = buildRiskCategoryEvidenceMatrix();
  const schemaCodes = providerTransportToolSchemaV2.properties.riskCategories.items.properties.code.enum;
  assert.equal(catalog.ready, true);
  assert.equal(catalog.duplicateCodeCount, 0);
  assert.equal(catalog.unknownAliasCount, 0);
  assert.deepEqual(schemaCodes, CANONICAL_RISK_CATEGORY_CODES);
  assert.deepEqual(matrix.categories.map((item) => item.code), CANONICAL_RISK_CATEGORY_CODES);
  assert.equal(CANONICAL_RISK_CATEGORY_CATALOG.categories.every((item) => item.aliases.length === 0), true);
  const deterministicSource = await fs.readFile(path.join(ROOT, "server/decision/deterministicProvider.mjs"), "utf8");
  const uiSource = await fs.readFile(path.join(ROOT, "src/decision/riskCategoryDisplay.ts"), "utf8");
  assert.match(deterministicSource, /riskCategoryContract\.mjs/);
  assert.match(uiSource, /canonical-risk-category-catalog\.json/);
});

test("Transport v1 historical hash is unchanged and v2 is a complete strict schema", () => {
  assert.equal(schemaHash(providerTransportToolSchemaV1), "12838eecacdaabe7f2e1a55c660847652dcfc2abcb87e381f1b45d8aba851236");
  assert.notEqual(schemaHash(providerTransportToolSchemaV2), schemaHash(providerTransportToolSchemaV1));
  assert.equal(schemaHash(providerTransportToolSchemaV2), schemaHash(deepseekDecisionToolSchemaV6R1));
  const lint = lintDeepSeekSchemaCompleteness(deepseekDecisionToolSchemaV6R1);
  assert.equal(lint.missingTypeAnyOfRefCount, 0);
  assert.equal(lint.missingRequiredCount, 0);
  assert.equal(lint.missingAdditionalPropertiesCount, 0);
  assert.equal(lint.unsupportedKeywordCount, 0);
  const category = providerTransportToolSchemaV2.properties.riskCategories.items;
  assert.equal(category.type, "object");
  assert.deepEqual(category.required, ["code", "evidenceTokens"]);
  assert.equal(category.additionalProperties, false);
});

test("Risk Category evidence rejects unknown code and fuzzy aliases", () => {
  const options = validationOptions();
  for (const category of ["unknown", "Contradiction", "data_contradiction", "OTHER"] ) {
    const result = validateProviderTransportToolArgumentsV2(transportOutput({ category }), options);
    assert.equal(result.ok, false, category);
    assert.ok(result.errors.some((error) => error.includes("enum") || error === "risk_category_code_invalid"), category);
  }
});

test("Risk Category evidence rejects missing unknown duplicate and incompatible tokens", () => {
  const options = validationOptions();
  const missing = validateProviderTransportToolArgumentsV2(transportOutput({ categoryEvidence: [] }), options);
  const unknown = validateProviderTransportToolArgumentsV2(transportOutput({ categoryEvidence: ["SYN-EVIDENCE-UNKNOWN"] }), options);
  const duplicate = validateProviderTransportToolArgumentsV2(transportOutput({ categoryEvidence: [EVIDENCE, EVIDENCE] }), options);
  const incompatible = validateProviderTransportToolArgumentsV2(transportOutput({ categoryEvidence: [FINANCIAL_EVIDENCE] }), options);
  assert.ok(missing.errors.includes("risk_category_evidence_required"));
  assert.ok(unknown.errors.includes("risk_category_evidence_unknown"));
  assert.ok(duplicate.errors.includes("risk_category_evidence_duplicate"));
  assert.ok(incompatible.errors.includes("risk_category_evidence_incompatible"));
});

test("one valid Evidence Token does not support every Risk Category", () => {
  const options = validationOptions();
  const valid = validateStructuredRiskCategoryEvidence(transportOutput(), options);
  const invalid = validateStructuredRiskCategoryEvidence(transportOutput({ category: "gap" }), options);
  assert.equal(valid.ready, true);
  assert.equal(invalid.ready, false);
  assert.ok(invalid.errors.includes("risk_category_evidence_incompatible"));
});

test("Evidence Type index is complete and fails closed for missing bindings", () => {
  const frozen = freezeR5B11R1Request({ env });
  assert.equal(validateEvidenceTypeIndex({ evidenceTokens: frozen.evidenceAllowlist, evidenceTypeByToken: frozen.evidenceTypeByToken }).ready, true);
  const incomplete = structuredClone(frozen.evidenceTypeByToken);
  delete incomplete[frozen.evidenceAllowlist[0]];
  const result = validateEvidenceTypeIndex({ evidenceTokens: frozen.evidenceAllowlist, evidenceTypeByToken: incomplete });
  assert.equal(result.ready, false);
  assert.equal(result.missingTokenCount, 1);
});

test("Transport v2 mapper is deterministic and preserves category evidence outside Canonical v2", () => {
  const options = validationOptions();
  const source = transportOutput();
  const a = mapProviderTransportToCanonicalV2WithRiskEvidence(source, options);
  const b = mapProviderTransportToCanonicalV2WithRiskEvidence(source, options);
  assert.deepEqual(a, b);
  assert.deepEqual(a.output.riskCategories, ["contradiction"]);
  assert.deepEqual(a.riskCategoryEvidence, [{ code: "contradiction", evidenceTokens: [EVIDENCE] }]);
  assert.equal(Object.hasOwn(a.output.recommendedActions[0], "evidenceTokens"), false);
  assert.equal(validateExternalModelResponseV2(a.output, { evidenceTokens: options.evidenceTokens }).ok, true);
});

test("Transport v2 cannot override deterministic Health Score fields", () => {
  const output = transportOutput();
  output.healthScore = 99;
  const result = validateProviderTransportToolArgumentsV2(output, validationOptions());
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("$:extra:healthScore"));
});

test("R5B11-R1 request is strict safe and contains no expected Risk Scenario or Golden answer", () => {
  const frozen = freezeR5B11R1Request({ env });
  const serialized = JSON.stringify(frozen.body);
  const preflight = validateR5B11R1OfflinePreflight({ frozen, ...readyPreflight });
  assert.equal(preflight.ready, true);
  assert.equal(preflight.evidenceTypeIndex.ready, true);
  assert.equal(frozen.providerEnv.PHASE3C_SCHEMA_VERSION, "v6-r1");
  assert.equal(/expectedRisk|expectedCategory|expectedAnswer|scenarioId|goldenMetadata|goldenLabel/i.test(serialized), false);
  assert.equal(/DEMO-OPP-002|DEMO-OPP-/i.test(serialized), false);
  assert.equal(serialized.includes("SYN-OPP-001"), true);
  assert.equal(frozen.body.max_tokens, 2400);
  assert.equal(frozen.body.temperature, 0);
  assert.equal(frozen.body.stream, false);
  assert.equal(frozen.body.tools[0].function.strict, true);
});

test("v6-r1 is explicit and leaves v6 Transport v1 unchanged", () => {
  const input = buildR5B11R1SyntheticInput();
  const v6 = buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: "test", env: { ...buildR5B11R1ProviderEnv(env), PHASE3C_SCHEMA_VERSION: "v6" }, nativeMode: true, schemaVersion: "v6" });
  const v6r1 = freezeR5B11R1Request({ input, env }).body;
  assert.equal(v6.tools[0].function.parameters.properties.riskCategories.items.type, "string");
  assert.equal(v6r1.tools[0].function.parameters.properties.riskCategories.items.type, "object");
});

test("historical R5B11 evidence is unchanged and missing returned value is not reconstructed", async () => {
  const expected = {
    "provider-transport-contract-v1.json": "dc001720da99f95116e1abc47d8a559225c2c3908edc75f5d47822603964893f",
    "phase3c-r5b11-v6-repeatability-report.md": "ac413718a86a4f369f90bec813e3e96a1beb9ee3b298fe99e337a93c3e9bef4d",
    "phase3c-r5b11-runtime-manifest.json": "2e896ad1e412263c27a2829277221fead29adc3e08ca3326c6d305069d861e2e",
  };
  for (const [name, hash] of Object.entries(expected)) {
    const content = await fs.readFile(path.join(ROOT, "docs/gateway", name));
    assert.equal(createHash("sha256").update(content).digest("hex"), hash, name);
  }
  const classification = classifyHistoricalR5B11Failure();
  assert.equal(classification.classification, "B");
  assert.equal(classification.returnedCategoryCodeRetained, false);
  assert.equal(classification.returnedCategoryCodeHash, null);
});

test("Probe 1 failure prevents Probe 2 with zero retry and fallback", async () => {
  let calls = 0;
  const summary = await executeR5B11R1({
    env,
    preflightEvidence: readyPreflight,
    fetchImpl: async () => {
      calls += 1;
      return providerResponse(transportOutput({ category: "gap", categoryEvidence: [EVIDENCE] }));
    },
  });
  assert.equal(calls, 1);
  assert.equal(summary.counts.externalLlmCalls, 1);
  assert.equal(summary.counts.probe2Calls, 0);
  assert.equal(summary.counts.retry, 0);
  assert.equal(summary.counts.fallback, 0);
  assert.equal(summary.gates.providerRequestCompatibilityReady, false);
});

test("two valid probes use byte-identical requests and complete repeatability", async () => {
  const requestBodies = [];
  let calls = 0;
  const summary = await executeR5B11R1({
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
  assert.equal(summary.counts.transportV2Success, 2);
  assert.equal(summary.counts.actionEvidenceSuccess, 2);
  assert.equal(summary.counts.riskCategoryCodeSuccess, 2);
  assert.equal(summary.counts.riskCategoryEvidenceSuccess, 2);
  assert.equal(summary.counts.categoryEvidenceCompatibilitySuccess, 2);
  assert.equal(summary.counts.canonicalMappingSuccess, 2);
  assert.equal(summary.counts.canonicalContractSuccess, 2);
  assert.equal(summary.counts.evidenceSuccess, 2);
  assert.equal(summary.counts.safetySuccess, 2);
  assert.equal(summary.gates.providerRequestCompatibilityReady, true);
  assert.equal(summary.gates.providerTransportRepeatabilityReady, true);
  assert.equal(summary.gates.realCanaryAuthorized, false);
});

test("R5B11-R1 never exceeds two calls and preflight failure performs zero calls", async () => {
  let readyCalls = 0;
  const completed = await executeR5B11R1({ env, preflightEvidence: readyPreflight, fetchImpl: async () => { readyCalls += 1; return providerResponse(); } });
  assert.equal(readyCalls, 2);
  assert.equal(completed.counts.externalLlmCalls, 2);
  let blockedCalls = 0;
  const blocked = await executeR5B11R1({ env, preflightEvidence: { ...readyPreflight, secretEvidence: { ...readyPreflight.secretEvidence, oldExposedApiKeyRevoked: false } }, fetchImpl: async () => { blockedCalls += 1; return providerResponse(); } });
  assert.equal(blockedCalls, 0);
  assert.equal(blocked.counts.externalLlmCalls, 0);
});

test("R5B11-R1 writes exactly nine safe public artifacts", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "r5b11-r1-artifacts-"));
  try {
    const summary = await executeR5B11R1({ env, preflightEvidence: readyPreflight, fetchImpl: async () => providerResponse() });
    await writeR5B11R1Artifacts(summary, { outputDir });
    const files = (await fs.readdir(outputDir)).sort();
    assert.deepEqual(files, [
      "canonical-risk-category-catalog.json",
      "phase3c-r5b11-r1-contract-repair-report.md",
      "phase3c-r5b11-r1-evidence-validation.json",
      "phase3c-r5b11-r1-runtime-manifest.json",
      "phase3c-r5b11-r1-safety-report.md",
      "phase3c-r5b11-r1-transport-validation.json",
      "phase3c-r5c-real-canary-decision-pack-v3-zh.md",
      "provider-transport-contract-v2.json",
      "risk-category-evidence-matrix.json",
    ]);
    const publicText = (await Promise.all(files.map((file) => fs.readFile(path.join(outputDir, file), "utf8")))).join("\n");
    assert.equal(publicText.includes("A synthetic review signal is present."), false);
    assert.equal(publicText.includes("The supplied synthetic evidence supports review."), false);
    assert.equal(publicText.includes("synthetic-test-secret"), false);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("R5B11-R1 source contains no D365 write retry fallback or expected answer path", async () => {
  const source = await fs.readFile(path.join(ROOT, "scripts/run-phase3c-r5b11-r1-risk-category-revalidation.mjs"), "utf8");
  assert.equal(/org91f5f65\.crm5\.dynamics\.com|lcn-crm\.crm7\.dynamics\.com/i.test(source), false);
  assert.equal(/WinOpportunity|LoseOpportunity|jsonrepair|stripMarkdown|removeTrailingComma|secondParse|tolerantParser/i.test(source), false);
  assert.equal(/ALLOWED_RISK_CATEGORIES|expectedRisk\s*:|expectedCategory\s*:/i.test(source), false);
  assert.equal(/(?:^|[\s"'=])sk-[A-Za-z0-9_-]{20,}(?=$|[\s"'])/.test(source), false);
  assert.equal(externalModelResponseJsonSchemaV2.properties.riskCategories.items.type, "string");
});
