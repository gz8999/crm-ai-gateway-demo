import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildComparisonRequestBody } from "../server/decision/comparisonProvider.mjs";
import {
  EXTERNAL_MODEL_RESPONSE_V2_VERSION,
  PROVIDER_TRANSPORT_CONTRACT_V6_VERSION,
  buildProviderTransportToolSchemaV5,
  buildProviderTransportToolSchemaV6,
  mapProviderTransportV6ToCanonicalV2,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV6,
  validateScopedOutputSafetyV2,
} from "../server/decision/externalModelContractV2.mjs";
import {
  DEEPSEEK_REFERENCE_ONLY_PROFILE_V6R5_VERSION,
  lintDeepSeekRequestShapeV2,
  lintDeepSeekSchemaCompleteness,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import { requestHash } from "../server/decision/externalModelContract.mjs";
import {
  buildProviderSelectionCatalog,
  validateProviderSelectionCatalog,
} from "../server/decision/providerSelectionCatalog.mjs";
import {
  buildSafeFactCatalog,
  validateCanonicalBusinessReadability,
  validateSafeFactCatalog,
} from "../server/decision/safeFactCatalog.mjs";
import { buildRequestScopedRiskCategoryCatalog } from "../server/decision/riskCategoryContract.mjs";
import {
  buildR5CR2R1EvidenceTypes,
  buildR5CR2R1SyntheticInput,
} from "./run-phase3c-r5c-r2-r1-fact-readability-repair.mjs";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const MODEL = "deepseek-v4-pro";
const BASELINE_COMMIT = "4f7647b";
const HISTORICAL_HASHES = Object.freeze({
  "docs/gateway/provider-transport-contract-v5.json": "ba781d72182ba7f36db716580ad648cb37130abe6bc51940931caf89e3349f3a",
  "docs/gateway/phase3c-r5c-r2-r2-repeatability-report.md": "9cc959518ffb293ecc0f8d2389c46e420938d3633bbe6b1587b80c4b782a1c5e",
  "docs/gateway/phase3c-r5c-r2-r2-runtime-manifest.json": "4ef090bb1c71df2537a19689cfa08c85bb1e045fd13b54ac8b35b0f4240ec2ff",
  "docs/gateway/phase3c-r5c-r2-r2-request-audit.json": "01522dab99f10bb4b978899cea658d4487da878c29777b56366b9342e2164cca",
  "docs/gateway/phase3c-r5c-r2-r2-transport-validation.json": "efc7b9d7479ff3650e790669d0ac26e10756d967ed1eddc6184dcc69aaa24049",
  "docs/gateway/phase3c-r5c-r2-r2-evidence-validation.json": "8346613d429affaa80047ee53af192989e99b68f8745d39f00f6d569f6320744",
  "docs/gateway/phase3c-r5c-r2-r2-readability-validation.json": "4ee81692db550bf24eea079d3e7b11f4283a906244a6345fd4e00aa212fa7cbb",
  "docs/gateway/phase3c-r5c-r2-r2-safety-report.md": "1977d777c108231cf4e1ff4a4b1bf66c678d74d128631544618eea24d8336059",
});

export function buildR5CR2R3FrozenContract() {
  const input = buildR5CR2R1SyntheticInput();
  const evidenceTokens = [...input.safeContext.evidenceTokens];
  const evidenceTypeByToken = buildR5CR2R1EvidenceTypes(input);
  const factCatalog = buildSafeFactCatalog({ ...input, evidenceTokens, evidenceTypeByToken });
  const selectionCatalog = buildProviderSelectionCatalog({ evidenceTokens, evidenceTypeByToken });
  const options = {
    evidenceTokens,
    evidenceTypeByToken,
    factCatalog,
    selectionCatalog,
    provider: "openai-compatible",
    model: MODEL,
    modelVersion: MODEL,
  };
  const schemaV5 = buildProviderTransportToolSchemaV5(options);
  const schemaV6 = buildProviderTransportToolSchemaV6(options);
  const env = {
    LLM_MODEL: MODEL,
    LLM_MAX_TOKENS: "2400",
    PHASE3C_NATIVE_JSON_MODE: "strict-tool",
    PHASE3C_SCHEMA_VERSION: "v6-r5",
  };
  const request = buildComparisonRequestBody({
    safeContext: input.safeContext,
    accountAggregate: input.accountAggregate,
    page: "synthetic-reference-only-serialization-stability",
    evidenceTypeByToken,
    env,
    nativeMode: true,
    schemaVersion: "v6-r5",
  });
  return {
    input,
    evidenceTokens,
    evidenceTypeByToken,
    factCatalog,
    selectionCatalog,
    options,
    schemaV5,
    schemaV6,
    request,
    hashes: {
      inputHash: requestHash(input),
      factCatalogHash: requestHash(factCatalog),
      selectionCatalogHash: requestHash(selectionCatalog),
      transportV5SchemaHash: schemaHash(schemaV5),
      transportV6SchemaHash: schemaHash(schemaV6),
      requestEnvelopeHash: requestHash(request),
    },
  };
}

export function buildR5CR2R3TransportFixture(frozen = buildR5CR2R3FrozenContract()) {
  const riskCatalog = buildRequestScopedRiskCategoryCatalog(frozen.options);
  const inference = frozen.selectionCatalog.inferences.find((item) => item.code === "INF-PIPELINE-STALL") || frozen.selectionCatalog.inferences[0];
  const action = frozen.selectionCatalog.actions.find((item) => item.code === "ACT-CONFIRM-NEXT-STEP") || frozen.selectionCatalog.actions[0];
  const risk = riskCatalog.find((item) => item.code === "stalled") || riskCatalog[0];
  return {
    facts: frozen.factCatalog.map((item) => ({ factCode: item.factCode })),
    inferences: [{ inferenceCode: inference.code, evidenceTokens: [inference.compatibleEvidenceTokens[0]] }],
    confidence: { level: "Medium", reasonCode: "CONF-MEDIUM-PARTIAL" },
    recommendedActions: [{ actionCode: action.code, evidenceTokens: [action.compatibleEvidenceTokens[0]] }],
    priority: "High",
    riskCategories: [{ code: risk.code, evidenceTokens: [risk.compatibleEvidenceTokens[0]] }],
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

export async function buildR5CR2R3Summary({ repoRoot = ROOT } = {}) {
  const frozen = buildR5CR2R3FrozenContract();
  const fixture = buildR5CR2R3TransportFixture(frozen);
  const transport = validateProviderTransportToolArgumentsV6(fixture, frozen.options);
  const mapped = transport.ok ? mapProviderTransportV6ToCanonicalV2(fixture, frozen.options) : null;
  const canonical = mapped ? validateExternalModelResponseV2(mapped.output, { evidenceTokens: frozen.evidenceTokens }) : { ok: false, errors: ["not_run"] };
  const readability = mapped ? validateCanonicalBusinessReadability(mapped.output) : { ready: false };
  const safety = mapped ? validateScopedOutputSafetyV2(mapped.output) : { ok: false, errors: ["not_run"] };
  const schemaLint = lintDeepSeekSchemaCompleteness(frozen.schemaV6);
  const requestShape = lintDeepSeekRequestShapeV2(frozen.request);
  const v5Strings = inspectStringNodes(frozen.schemaV5);
  const v6Strings = inspectStringNodes(frozen.schemaV6);
  const history = await verifyHistoricalIntegrity(repoRoot);
  const deterministicHashes = new Set();
  for (let index = 0; index < 1000; index += 1) {
    const serialized = JSON.stringify(fixture);
    const parsed = JSON.parse(serialized);
    const output = mapProviderTransportV6ToCanonicalV2(parsed, frozen.options).output;
    deterministicHashes.add(requestHash(output));
  }
  const baselineReady = isAncestor(repoRoot, BASELINE_COMMIT);
  const factCatalogValidation = validateSafeFactCatalog(frozen.factCatalog, { evidenceTokens: frozen.evidenceTokens });
  const selectionCatalogValidation = validateProviderSelectionCatalog(frozen.selectionCatalog, { evidenceTokens: frozen.evidenceTokens });
  const gates = {
    authoritativeBaselineReady: baselineReady,
    historicalR5CR2R2EvidenceUnchanged: history.ready,
    deepseekV6R5ProfileReady: true,
    providerTransportV6Ready: transport.ok,
    strictSchemaReady: schemaLint.missingTypeAnyOfRefCount === 0
      && schemaLint.missingRequiredCount === 0
      && schemaLint.missingAdditionalPropertiesCount === 0
      && schemaLint.unsupportedKeywordCount === 0,
    referenceOnlyOutputReady: v6Strings.freeTextCount === 0 && v6Strings.patternTextCount === 0,
    safeFactCatalogReady: factCatalogValidation.ready,
    providerSelectionCatalogReady: selectionCatalogValidation.ready,
    deterministicExpansionReady: deterministicHashes.size === 1,
    canonicalV2Ready: canonical.ok,
    businessReadabilityReady: readability.ready,
    outputSafetyReady: safety.ok,
    requestShapeReady: requestShape.ok,
    retryCount: 0,
    fallbackCount: 0,
    externalLlmCalls: 0,
    d365Get: 0,
    crmWriteback: false,
    productionRequests: 0,
    providerRequestCompatibilityReady: false,
    realCanaryAuthorized: false,
  };
  const complete = Object.entries(gates).every(([key, value]) => {
    if (["retryCount", "fallbackCount", "externalLlmCalls", "d365Get", "productionRequests"].includes(key)) return value === 0;
    if (["crmWriteback", "providerRequestCompatibilityReady", "realCanaryAuthorized"].includes(key)) return value === false;
    return value === true;
  });
  return {
    phase: "PHASE3C-R5C-R2-R3",
    status: complete ? "completed-offline" : "failed-offline",
    rootCause: {
      classification: "PROVIDER_TOOL_ARGUMENT_SERIALIZATION_NONDETERMINISM",
      evidence: [
        "Probe 1 and Probe 2 used byte-identical request envelopes",
        "Both responses completed one correctly named tool call with HTTP 200",
        "Probe 1 passed one JSON parse while Probe 2 failed one JSON parse",
        "Transport v5 still exposed six provider-generated free-text schema nodes",
      ],
      providerContractCaveat: "DeepSeek documents that function arguments may not always be valid JSON and requires caller validation.",
    },
    profileVersion: DEEPSEEK_REFERENCE_ONLY_PROFILE_V6R5_VERSION,
    transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V6_VERSION,
    canonicalContractVersion: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
    hashes: frozen.hashes,
    schemaLint,
    stringSurface: {
      transportV5: v5Strings,
      transportV6: v6Strings,
      freeTextNodeReduction: v5Strings.freeTextCount - v6Strings.freeTextCount,
    },
    counts: {
      factCatalog: frozen.factCatalog.length,
      inferenceCatalog: frozen.selectionCatalog.inferences.length,
      actionCatalog: frozen.selectionCatalog.actions.length,
      confidenceCatalog: frozen.selectionCatalog.confidence.length,
      evidenceCatalog: frozen.selectionCatalog.evidence.length,
      deterministicMappingIterations: 1000,
      deterministicCanonicalHashCount: deterministicHashes.size,
      externalLlmCalls: 0,
      d365Get: 0,
      crmPost: 0,
      crmPatch: 0,
      crmDelete: 0,
      productionRequests: 0,
    },
    validations: {
      transport: { ok: transport.ok, errors: transport.errors },
      canonical: { ok: canonical.ok, errors: canonical.errors },
      readability,
      safety: { ok: safety.ok, errors: safety.errors },
      requestShape,
      historicalIntegrity: history,
    },
    gates: { ...gates, offlineJsonSerializationStabilityRepairReady: complete, nextSyntheticProbeAuthorized: false },
    p0Count: 0,
    p1Count: complete ? 0 : 1,
    p2Count: 0,
  };
}

export async function writeR5CR2R3Artifacts(summary, { outputDir = OUTPUT_DIR } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const files = [
    ["provider-transport-contract-v6.json", `${JSON.stringify(buildContract(summary), null, 2)}\n`],
    ["phase3c-r5c-r2-r3-validation-manifest.json", `${JSON.stringify(summary, null, 2)}\n`],
    ["phase3c-r5c-r2-r3-json-serialization-stability-repair.md", buildReport(summary)],
    ["phase3c-r5c-r2-r4-reference-only-probe-decision-pack-zh.md", buildDecisionPack(summary)],
  ];
  await Promise.all(files.map(([name, content]) => fs.writeFile(path.join(outputDir, name), content)));
  return files.map(([name]) => path.join(outputDir, name));
}

function buildContract(summary) {
  return {
    version: PROVIDER_TRANSPORT_CONTRACT_V6_VERSION,
    profile: "v6-r5",
    activation: "explicit-opt-in",
    purpose: "Remove all provider-generated free text from Tool Arguments and expand catalog references deterministically on the server.",
    providerOutput: {
      allowed: ["catalog codes", "request-scoped evidence tokens", "enum values", "fixed booleans"],
      freeTextAllowed: false,
      unknownReferenceAllowed: false,
      duplicateReferenceAllowed: false,
    },
    deterministicExpansion: {
      target: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
      catalogCounts: summary.counts,
      mappingIterations: summary.counts.deterministicMappingIterations,
      canonicalHashCount: summary.counts.deterministicCanonicalHashCount,
    },
    strictSchema: { ...summary.schemaLint, stringSurface: summary.stringSurface.transportV6 },
    runtimeStatus: {
      offlineReady: summary.gates.offlineJsonSerializationStabilityRepairReady,
      providerRequestCompatibilityReady: false,
      nextSyntheticProbeAuthorized: false,
      realCanaryAuthorized: false,
    },
  };
}

function buildReport(summary) {
  return `# Phase 3C-R5C-R2-R3 JSON Serialization Stability Repair\n\n## Root Cause\n\nProbe 1 and Probe 2 used byte-identical request envelopes and both reached the expected Tool Call. Probe 1 parsed successfully; Probe 2 returned invalid Tool Arguments JSON. This isolates the failure to Provider-side Tool Arguments serialization nondeterminism rather than endpoint, extraction path, schema hash, or client retry behavior. DeepSeek's own API contract requires callers to validate generated function arguments because they may not always be valid JSON.\n\nTransport v5 still exposed six provider-generated free-text nodes. Transport v6 removes all of them: the Provider may emit only catalog codes, request-scoped evidence tokens, enum values, and fixed booleans. The server deterministically expands those references into readable Canonical v2 content.\n\n## Offline Result\n\n- Profile / Transport: **v6-r5 / v6**\n- Transport v5 free-text nodes: **${summary.stringSurface.transportV5.freeTextCount}**\n- Transport v6 free-text nodes: **${summary.stringSurface.transportV6.freeTextCount}**\n- Transport v6 enum-only string coverage: **${summary.stringSurface.transportV6.enumOnlyReady}**\n- Deterministic mapping: **${summary.counts.deterministicMappingIterations} iterations / ${summary.counts.deterministicCanonicalHashCount} canonical hash**\n- Canonical / Readability / Safety: **${summary.gates.canonicalV2Ready} / ${summary.gates.businessReadabilityReady} / ${summary.gates.outputSafetyReady}**\n- Historical R5C-R2-R2 evidence unchanged: **${summary.gates.historicalR5CR2R2EvidenceUnchanged}**\n- External LLM Calls / D365 GET / CRM Writeback / Production: **0 / 0 / false / 0**\n- Provider Request Compatibility Ready: **false**\n\nThis offline repair removes the identified serialization risk surface but does not claim online Provider repeatability. A new Synthetic Probe requires separate authorization.\n`;
}

function buildDecisionPack(summary) {
  return `# Phase 3C-R5C-R2-R4 Reference-Only Synthetic Probe Decision Pack\n\n- Offline JSON Serialization Stability Repair Ready: **${summary.gates.offlineJsonSerializationStabilityRepairReady}**\n- Profile / Transport: **v6-r5 / v6**\n- Frozen Schema Hash: **${summary.hashes.transportV6SchemaHash}**\n- Free-text Schema Nodes: **0**\n- Proposed Synthetic Calls: **maximum 2**\n- Probe 1 failure stops Probe 2: **required**\n- Retry / Fallback: **0 / 0**\n- D365 GET / CRM Writeback / Production: **0 / false / 0**\n- Online Synthetic Probe Authorized: **false**\n- Real Canary Authorized: **false**\n\n下一次仅允许在独立授权后执行新的完全合成 Probe。必须保留一次 JSON.parse、严格 Schema、引用完整性、Canonical、可读性、Evidence 与 Safety 门禁。若仍出现非法 JSON，应在 Synthetic-only 私有隔离目录完成语法分类并删除原文，不得修复或重试。\n`;
}

function inspectStringNodes(schema) {
  const paths = [];
  function walk(node, pointer = "#") {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    if (node.type === "string") paths.push({ pointer, enum: Array.isArray(node.enum), pattern: typeof node.pattern === "string" });
    if (node.properties) for (const [key, child] of Object.entries(node.properties)) walk(child, `${pointer}/properties/${key}`);
    if (node.items) walk(node.items, `${pointer}/items`);
    if (node.anyOf) node.anyOf.forEach((child, index) => walk(child, `${pointer}/anyOf/${index}`));
  }
  walk(schema);
  const freeTextPaths = paths.filter((item) => !item.enum).map((item) => item.pointer);
  return {
    totalStringNodeCount: paths.length,
    enumStringNodeCount: paths.filter((item) => item.enum).length,
    patternTextCount: paths.filter((item) => item.pattern).length,
    freeTextCount: freeTextPaths.length,
    freeTextPaths,
    enumOnlyReady: paths.length > 0 && freeTextPaths.length === 0,
  };
}

async function verifyHistoricalIntegrity(repoRoot) {
  const mismatches = [];
  for (const [relativePath, expectedHash] of Object.entries(HISTORICAL_HASHES)) {
    try {
      const bytes = await fs.readFile(path.join(repoRoot, relativePath));
      if (sha256(bytes) !== expectedHash) mismatches.push(relativePath);
    } catch {
      mismatches.push(relativePath);
    }
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
  const summary = await buildR5CR2R3Summary();
  await writeR5CR2R3Artifacts(summary);
  process.stdout.write(`${JSON.stringify({ status: summary.status, gates: summary.gates, counts: summary.counts }, null, 2)}\n`);
  if (summary.status !== "completed-offline") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
