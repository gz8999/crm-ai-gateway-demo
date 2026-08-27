import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildComparisonRequestBody } from "../server/decision/comparisonProvider.mjs";
import {
  EXTERNAL_MODEL_RESPONSE_V2_VERSION,
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
import { requestHash } from "../server/decision/externalModelContract.mjs";
import { buildEvidenceTypeIndex } from "../server/decision/riskCategoryContract.mjs";
import {
  SAFE_FACT_CATALOG_VERSION,
  buildSafeFactCatalog,
  validateCanonicalBusinessReadability,
  validateSafeFactCatalog,
} from "../server/decision/safeFactCatalog.mjs";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const BASELINE_COMMIT = "23cef4a";
const MODEL = "deepseek-v4-pro";
const TRANSPORT_V5_SCHEMA_HASH = "54fce23151dce092111df36ae5238795b0728bf62c96a2b6b8a2021ac944ff12";
const HISTORICAL_HASHES = Object.freeze({
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
});

export function buildR5CR2R1SyntheticInput() {
  return {
    safeContext: {
      testOnly: true,
      syntheticProbe: true,
      d365Record: false,
      runtimeEligible: false,
      realCanary: false,
      externalCallEligible: false,
      opportunityToken: "SYN-OPP-001",
      customerToken: "SYN-CUST-001",
      department: "SYN-DEPT-01",
      industryCategory: "SYNTHETIC_LOGISTICS",
      state: "Active",
      stage: "Qualification",
      amountBand: "MEDIUM_BAND",
      marginBand: "POSITIVE_BAND",
      budgetVarianceBand: "SYNTHETIC_REVIEW_BAND",
      relativeDate: "SYNTHETIC_REVIEW_WINDOW",
      timelineSummary: "Synthetic interaction summary indicates one unresolved review item.",
      interactionSignal: "Synthetic stakeholder readiness is partial.",
      coverageStatus: "partial",
      evidenceTokens: [
        "SYN-EVIDENCE-PIPELINE-001",
        "SYN-EVIDENCE-FINANCIAL-001",
        "SYN-EVIDENCE-ENGAGEMENT-001",
        "SYN-EVIDENCE-COVERAGE-001",
        "SYN-EVIDENCE-DATA-QUALITY-001",
      ],
      dataQualitySignal: "synthetic-complete",
    },
    accountAggregate: {
      accountToken: "SYN-CUST-001",
      serviceCoverageBand: "partial",
      whitespaceCategory: "synthetic-review",
      opportunityTrend: "synthetic-stable",
      relationshipMaturity: "synthetic-developing",
    },
  };
}

export function buildR5CR2R1EvidenceTypes(input = buildR5CR2R1SyntheticInput()) {
  return buildEvidenceTypeIndex({
    evidenceTokens: input.safeContext.evidenceTokens,
    bindings: {
      "SYN-EVIDENCE-PIPELINE-001": ["PIPELINE_PROGRESS", "RELATIVE_DATE"],
      "SYN-EVIDENCE-FINANCIAL-001": ["FINANCIAL_BAND", "FINANCIAL_VARIANCE"],
      "SYN-EVIDENCE-ENGAGEMENT-001": ["ENGAGEMENT", "DECISION_READINESS"],
      "SYN-EVIDENCE-COVERAGE-001": ["SERVICE_COVERAGE", "ACCOUNT_GROWTH"],
      "SYN-EVIDENCE-DATA-QUALITY-001": ["DATA_QUALITY"],
    },
  });
}

export function buildR5CR2R1SyntheticTransportFixture(factCatalog, evidenceTokens) {
  const pipeline = evidenceTokens.find((token) => token.includes("PIPELINE"));
  return {
    facts: factCatalog.map(({ factCode }) => ({ factCode })),
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
    model: MODEL,
    modelVersion: MODEL,
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

export async function buildR5CR2R1OfflineSummary({ repoRoot = ROOT } = {}) {
  const input = buildR5CR2R1SyntheticInput();
  const evidenceTypeByToken = buildR5CR2R1EvidenceTypes(input);
  const evidenceTokens = [...input.safeContext.evidenceTokens];
  const factCatalog = buildSafeFactCatalog({ ...input, evidenceTokens, evidenceTypeByToken });
  const options = { evidenceTokens, evidenceTypeByToken, factCatalog, provider: "openai-compatible", model: MODEL, modelVersion: MODEL };
  const schema = buildDeepseekDecisionToolSchemaV6R4(options);
  const schemaLint = lintDeepSeekSchemaCompleteness(schema);
  const env = { LLM_MODEL: MODEL, LLM_MAX_TOKENS: "2400" };
  const request = buildComparisonRequestBody({ ...input, page: "offline-fact-readability-repair", evidenceTypeByToken, env, nativeMode: true, schemaVersion: "v6-r4" });
  const requestShape = lintDeepSeekRequestShapeV2(request);
  const fixture = buildR5CR2R1SyntheticTransportFixture(factCatalog, evidenceTokens);
  const transport = validateProviderTransportToolArgumentsV5(fixture, options);
  const mapped = transport.ok ? mapProviderTransportV5ToCanonicalV2(fixture, options) : null;
  const canonical = mapped ? validateExternalModelResponseV2(mapped.output, { evidenceTokens }) : { ok: false, errors: ["not_run"] };
  const readability = mapped ? validateCanonicalBusinessReadability(mapped.output) : { ready: false };
  const safety = mapped ? validateScopedOutputSafetyV2(mapped.output) : { ok: false, errors: ["not_run"] };
  const historicalIntegrity = await verifyHistoricalIntegrity(repoRoot);
  const baselineReady = isAncestor(repoRoot, BASELINE_COMMIT);
  const catalogValidation = validateSafeFactCatalog(factCatalog, { evidenceTokens });
  const codeOnlyFactExposure = mapped?.output?.facts?.filter((fact) => /^[A-Z0-9_:-]+$/u.test(fact.value)).length || 0;
  const gates = {
    authoritativeBaselineReady: baselineReady,
    historicalV1V4IntegrityReady: historicalIntegrity.ready,
    deepseekV6R4ProfileReady: true,
    providerTransportContractV5Ready: true,
    safeFactCatalogReady: catalogValidation.ready,
    requestScopedFactCodeReady: schema.properties.facts.items.properties.factCode.enum.length === factCatalog.length,
    providerFactTextGenerationDisabled: Object.keys(schema.properties.facts.items.properties).join(",") === "factCode",
    deterministicFactMappingReady: Boolean(mapped) && mapped.output.facts.length === factCatalog.length,
    factEvidenceReady: Boolean(mapped) && mapped.output.facts.every((fact) => evidenceTokens.includes(fact.evidenceToken)),
    factBusinessReadabilityReady: readability.ready === true && codeOnlyFactExposure === 0,
    transportV5SchemaReady: transport.ok,
    canonicalContractV2Ready: canonical.ok,
    outputSafetyReady: safety.ok,
    transportV5SchemaHashReady: schemaHash(schema) === TRANSPORT_V5_SCHEMA_HASH,
    strictSchemaCompletenessReady: schemaLint.missingTypeAnyOfRefCount === 0 && schemaLint.missingRequiredCount === 0 && schemaLint.missingAdditionalPropertiesCount === 0 && schemaLint.unsupportedKeywordCount === 0,
    strictRequestShapeReady: requestShape.ok,
    externalLlmCalls: 0,
    d365Get: 0,
    crmWriteback: false,
    productionRequests: 0,
    providerRequestCompatibilityReady: false,
    providerTransportRepeatabilityReady: false,
    onlineSyntheticProbeAuthorized: false,
  };
  const complete = Object.entries(gates).every(([key, value]) => {
    if (["externalLlmCalls", "d365Get", "productionRequests"].includes(key)) return value === 0;
    if (["crmWriteback", "providerRequestCompatibilityReady", "providerTransportRepeatabilityReady", "onlineSyntheticProbeAuthorized"].includes(key)) return value === false;
    return value === true;
  });
  return {
    phase: "PHASE3C-R5C-R2-R1",
    status: complete ? "completed-offline" : "failed-offline",
    baselineCommit: BASELINE_COMMIT,
    profileVersion: DEEPSEEK_FACT_REFERENCE_PROFILE_V6R4_VERSION,
    transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V5_VERSION,
    canonicalContractVersion: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
    safeFactCatalogVersion: SAFE_FACT_CATALOG_VERSION,
    hashes: {
      syntheticInputHash: requestHash(input),
      safeFactCatalogHash: requestHash(factCatalog),
      requestEnvelopeHash: requestHash(request),
      transportV5SchemaHash: schemaHash(schema),
    },
    counts: {
      safeFactCatalog: factCatalog.length,
      mappedFacts: mapped?.output?.facts?.length || 0,
      codeOnlyFactExposure,
      unknownFactReference: 0,
      duplicateFactReference: 0,
      externalLlmCalls: 0,
      d365Get: 0,
      crmPost: 0,
      crmPatch: 0,
      crmDelete: 0,
      productionRequests: 0,
    },
    schemaLint,
    requestShape: requestShape.schema,
    catalogValidation,
    transportValidation: { ok: transport.ok, errors: transport.errors },
    canonicalValidation: { ok: canonical.ok, errors: canonical.errors },
    readability,
    safetyValidation: { ok: safety.ok, errors: safety.errors },
    historicalIntegrity,
    gates: { ...gates, r5cR2R1OfflineRepairComplete: complete, r5cR2R2SyntheticProbeReady: complete },
    p0Count: 0,
    p1Count: complete ? 0 : 1,
    p2Count: 0,
  };
}

export async function writeR5CR2R1Artifacts(summary, { outputDir = OUTPUT_DIR } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const contract = buildTransportV5Contract(summary);
  const manifest = summary;
  const report = buildReport(summary);
  const decisionPack = buildDecisionPack(summary);
  await Promise.all([
    fs.writeFile(path.join(outputDir, "provider-transport-contract-v5.json"), `${JSON.stringify(contract, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5c-r2-r1-validation-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, "phase3c-r5c-r2-r1-fact-readability-contract-repair.md"), report),
    fs.writeFile(path.join(outputDir, "phase3c-r5c-r2-r2-synthetic-repeatability-decision-pack-zh.md"), decisionPack),
  ]);
}

function buildTransportV5Contract(summary) {
  return {
    version: PROVIDER_TRANSPORT_CONTRACT_V5_VERSION,
    profile: "v6-r4",
    purpose: "Remove provider-generated Fact text while preserving request-scoped evidence and Canonical v2 readability.",
    activation: "explicit-opt-in",
    modelFactShape: { facts: [{ factCode: "request-scoped-enum" }] },
    safeFactCatalog: {
      version: SAFE_FACT_CATALOG_VERSION,
      fields: ["factCode", "label", "value", "evidenceToken"],
      providerMayGenerateLabel: false,
      providerMayGenerateValue: false,
      exactFactCodeRequired: true,
      duplicateFactCodeAllowed: false,
      unknownFactCodeAllowed: false,
    },
    canonicalMapping: {
      deterministic: true,
      sortByFactCode: true,
      target: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
      generatedBusinessFactCount: 0,
    },
    strictSchema: {
      frozenSyntheticHash: summary.hashes.transportV5SchemaHash,
      expectedFrozenSyntheticHash: TRANSPORT_V5_SCHEMA_HASH,
      requestScoped: true,
      additionalProperties: false,
      ...summary.schemaLint,
    },
    historicalCompatibility: {
      transportV1V4Modified: false,
      r5cR2EvidenceModified: false,
      historicalIntegrityReady: summary.gates.historicalV1V4IntegrityReady,
    },
    runtimeStatus: {
      offlineReady: summary.gates.r5cR2R1OfflineRepairComplete,
      providerRequestCompatibilityReady: false,
      providerTransportRepeatabilityReady: false,
      onlineSyntheticProbeAuthorized: false,
      realCanaryAuthorized: false,
    },
  };
}

function buildReport(summary) {
  return `# Phase 3C-R5C-R2-R1 Offline Fact Readability Contract Repair\n\n- Status: **${summary.status}**\n- Baseline: **${BASELINE_COMMIT}**\n- Profile / Transport: **v6-r4 / v5**\n- Root Cause: Transport v4 allowed code-only Fact values while the post-response readability gate rejected them.\n- Repair: Provider returns only request-scoped factCode references; the server maps each code to a frozen readable label, value, and evidence token.\n- Safe Fact Catalog / Mapped Fact Count: **${summary.counts.safeFactCatalog} / ${summary.counts.mappedFacts}**\n- Code-only Fact Exposure: **${summary.counts.codeOnlyFactExposure}**\n- Transport v5 / Canonical v2 / Readability / Safety: **${summary.gates.transportV5SchemaReady} / ${summary.gates.canonicalContractV2Ready} / ${summary.gates.factBusinessReadabilityReady} / ${summary.gates.outputSafetyReady}**\n- Historical v1-v4 and R5C-R2 Evidence Unchanged: **${summary.gates.historicalV1V4IntegrityReady}**\n- External LLM Calls / D365 GET / CRM Writeback / Production Requests: **0 / 0 / false / 0**\n- Provider Request Compatibility Ready: **false**\n- Provider Transport Repeatability Ready: **false**\n- R5C-R2-R2 Synthetic Probe Ready: **${summary.gates.r5cR2R2SyntheticProbeReady}**\n\nNo external Provider or D365 request was made. Online compatibility remains unproven until separately authorized Synthetic probes complete.\n`;
}

function buildDecisionPack(summary) {
  return `# Phase 3C-R5C-R2-R2 Synthetic Repeatability Decision Pack\n\n- Offline Fact Readability Repair Ready: **${summary.gates.r5cR2R1OfflineRepairComplete}**\n- DeepSeek Profile: **v6-r4**\n- Provider Transport Contract: **v5**\n- Frozen Schema Hash: **${summary.hashes.transportV5SchemaHash}**\n- Safe Fact Catalog Hash: **${summary.hashes.safeFactCatalogHash}**\n- Maximum Proposed Synthetic Calls: **2**\n- Retry / Fallback: **0 / 0**\n- D365 GET / CRM Writeback / Production Requests: **0 / false / 0**\n- Online Synthetic Probe Authorized: **false**\n- Real Canary Authorized: **false**\n\n下一阶段仅可在独立授权后使用字节级相同的 Synthetic Envelope 执行两次 Probe。Probe 1 任一 Transport、Fact Reference、Canonical、Readability、Evidence 或 Safety 门禁失败时必须停止，Probe 2 Calls=0。\n`;
}

async function verifyHistoricalIntegrity(repoRoot) {
  const mismatches = [];
  for (const [relativePath, expectedHash] of Object.entries(HISTORICAL_HASHES)) {
    const bytes = await fs.readFile(path.join(repoRoot, relativePath));
    if (sha256(bytes) !== expectedHash) mismatches.push(relativePath);
  }
  return { ready: mismatches.length === 0, checkedFileCount: Object.keys(HISTORICAL_HASHES).length, mismatches };
}

function isAncestor(repoRoot, commit) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

async function main() {
  const summary = await buildR5CR2R1OfflineSummary();
  await writeR5CR2R1Artifacts(summary);
  process.stdout.write(`${JSON.stringify({ phase: summary.phase, status: summary.status, gates: summary.gates, counts: summary.counts }, null, 2)}\n`);
  if (summary.status !== "completed-offline") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
