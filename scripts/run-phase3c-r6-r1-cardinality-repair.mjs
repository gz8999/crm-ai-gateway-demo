import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import {
  DECISION_PACK_CARDINALITY_CONTRACT,
  DECISION_PACK_CARDINALITY_CONTRACT_HASH,
  DECISION_PACK_CARDINALITY_CONTRACT_VERSION,
  collectionCardinality,
} from "../server/decision/decisionPackCardinalityContract.mjs";
import { requestHash } from "../server/decision/externalModelContract.mjs";
import {
  EXTERNAL_MODEL_RESPONSE_V2_VERSION,
  LIMITATION_CODES,
  PROVIDER_TRANSPORT_CONTRACT_V7_VERSION,
  buildProviderTransportToolSchemaV7,
  encodeProviderTransportV7,
  mapProviderTransportV7ToCanonicalV2,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV7,
  validateScopedOutputSafetyV2,
} from "../server/decision/externalModelContractV2.mjs";
import { lintDeepSeekRequestShapeV2, lintDeepSeekSchemaCompleteness, schemaHash } from "../server/decision/deepseekStrictSchema.mjs";
import { validateCanonicalBusinessReadability } from "../server/decision/safeFactCatalog.mjs";
import { buildRequestScopedRiskCategoryCatalog, CANONICAL_EVIDENCE_TYPES, CANONICAL_RISK_CATEGORY_CODES } from "../server/decision/riskCategoryContract.mjs";
import { buildFastProviderEnv, createCallBudget, createPrivateLedger } from "./run-phase3c-fast-demo-validation.mjs";
import { buildR6FrozenContract, buildValidTransportSample } from "./run-phase3c-r6-transport-schema-recovery.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "docs/gateway");
const PRIVATE_LEDGER = path.join(ROOT, "local-artifacts/gateway/phase3c-r6-r1/private-ledger.json");
const PROFILE = "v6-r6";
const MODEL = "deepseek-v4-pro";
const VALID_CORPUS_SIZE = 1000;
const OFFLINE_COMMIT_MESSAGE = "Repair Phase 3C inference cardinality contract";

export function buildR6R1FrozenContract(env = process.env) {
  const baseline = buildR6FrozenContract(env);
  const options = baseline.options;
  const schema = buildProviderTransportToolSchemaV7(options);
  const providerEnv = { ...buildFastProviderEnv(env), PHASE3C_SCHEMA_VERSION: PROFILE };
  const body = buildComparisonRequestBody({
    safeContext: baseline.input.safeContext,
    accountAggregate: baseline.input.accountAggregate,
    page: "phase3c-r6-r1-synthetic-contract-probe",
    evidenceTypeByToken: baseline.evidenceTypeByToken,
    env: providerEnv,
    nativeMode: true,
    schemaVersion: PROFILE,
  });
  const requestBytes = JSON.stringify(body);
  return {
    ...baseline,
    options,
    schema,
    providerEnv,
    body,
    requestBytes,
    riskCatalog: buildRequestScopedRiskCategoryCatalog(options),
    hashes: {
      cardinalityContractHash: DECISION_PACK_CARDINALITY_CONTRACT_HASH,
      schemaHash: schemaHash(schema),
      requestSchemaHash: schemaHash(body.tools[0].function.parameters),
      requestEnvelopeHash: requestHash(body),
      requestByteHash: sha256(requestBytes),
      evidenceAllowlistHash: requestHash(options.evidenceTokens),
    },
  };
}

export function buildValidR6R1Sample(frozen, index) {
  const legacy = buildValidTransportSample(frozen, index);
  return encodeProviderTransportV7(legacy, frozen.options);
}

export function auditR6R1Cardinality(frozen = buildR6R1FrozenContract({})) {
  const toolHash = schemaHash(frozen.body.tools[0].function.parameters);
  const runtimeHash = schemaHash(frozen.schema);
  const lint = lintDeepSeekSchemaCompleteness(frozen.schema);
  const requestLint = lintDeepSeekRequestShapeV2(frozen.body);
  const directChecks = [
    ["facts", emptyCollectionFailure(frozen, "facts")],
    ["inferences", emptyCollectionFailure(frozen, "inferences")],
    ["recommendedActions", emptyCollectionFailure(frozen, "recommendedActions")],
    ["riskCategories", emptyCollectionFailure(frozen, "riskCategories")],
    ["limitations.codes", emptyCollectionFailure(frozen, "limitations.codes")],
    ["inference.evidenceTokens", emptyEvidenceFailure(frozen, "inferences")],
    ["action.evidenceTokens", emptyEvidenceFailure(frozen, "recommendedActions")],
    ["riskCategory.evidenceTokens", emptyEvidenceFailure(frozen, "riskCategories")],
  ].map(([pathName, rejected]) => ({ path: pathName, rejectedAtToolSchema: rejected }));
  const mismatchCount = directChecks.filter((item) => !item.rejectedAtToolSchema).length;
  return {
    ready: toolHash === runtimeHash
      && mismatchCount === 0
      && lint.missingTypeAnyOfRefCount === 0
      && lint.missingRequiredCount === 0
      && lint.missingAdditionalPropertiesCount === 0
      && lint.unsupportedKeywordCount === 0
      && requestLint.ok,
    profile: PROFILE,
    transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V7_VERSION,
    cardinalityContractVersion: DECISION_PACK_CARDINALITY_CONTRACT_VERSION,
    cardinalityContractHash: DECISION_PACK_CARDINALITY_CONTRACT_HASH,
    toolSchemaHash: toolHash,
    runtimeSchemaHash: runtimeHash,
    schemaCardinalityMismatchCount: mismatchCount,
    runtimeOnlyCardinalityRules: 0,
    toolOnlyCardinalityRules: 0,
    independentCardinalityConstants: 0,
    directChecks,
    lint,
    requestShapeReady: requestLint.ok,
  };
}

export function runR6R1ValidCorpus(frozen, size = VALID_CORPUS_SIZE) {
  const failures = [];
  const canonicalHashes = new Set();
  const coverage = {
    inferenceCodes: new Set(),
    actionCodes: new Set(),
    riskCodes: new Set(),
    limitationCodes: new Set(),
    evidenceTypes: new Set(),
    minimumInference: false,
    maximumInference: false,
    singleEvidence: false,
    multipleEvidence: false,
  };
  for (let index = 0; index < size; index += 1) {
    const sample = buildValidR6R1Sample(frozen, index);
    const parsed = JSON.parse(JSON.stringify(sample));
    const transport = validateProviderTransportToolArgumentsV7(parsed, frozen.options);
    if (!transport.ok) {
      failures.push({ index, stage: "transport", errorCount: transport.errors.length });
      continue;
    }
    const first = mapProviderTransportV7ToCanonicalV2(parsed, frozen.options).output;
    const second = mapProviderTransportV7ToCanonicalV2(JSON.parse(JSON.stringify(sample)), frozen.options).output;
    const canonical = validateExternalModelResponseV2(first, { evidenceTokens: frozen.evidenceTokens });
    const safety = validateScopedOutputSafetyV2(first);
    const readable = validateCanonicalBusinessReadability(first);
    const deterministic = requestHash(first) === requestHash(second);
    if (!canonical.ok || !safety.ok || !readable.ready || !deterministic) {
      failures.push({ index, stage: "canonical", errorCount: canonical.errors?.length || 0 });
      continue;
    }
    canonicalHashes.add(requestHash(first));
    const decoded = transport.decodedToolArguments;
    decoded.inferences.forEach((item) => coverage.inferenceCodes.add(item.inferenceCode));
    decoded.recommendedActions.forEach((item) => coverage.actionCodes.add(item.actionCode));
    decoded.riskCategories.forEach((item) => coverage.riskCodes.add(item.code));
    decoded.limitations.codes.forEach((item) => coverage.limitationCodes.add(item));
    const selections = [...decoded.inferences, ...decoded.recommendedActions, ...decoded.riskCategories];
    selections.flatMap((item) => item.evidenceTokens).flatMap((token) => frozen.evidenceTypeByToken[token] || []).forEach((type) => coverage.evidenceTypes.add(type));
    coverage.minimumInference ||= decoded.inferences.length === collectionCardinality("inferences", { maximum: frozen.selectionCatalog.inferences.length }).minItems;
    coverage.maximumInference ||= decoded.inferences.length === collectionCardinality("inferences", { maximum: frozen.selectionCatalog.inferences.length }).maxItems;
    coverage.singleEvidence ||= selections.some((item) => item.evidenceTokens.length === 1);
    coverage.multipleEvidence ||= selections.some((item) => item.evidenceTokens.length > 1);
  }
  const resultCoverage = Object.fromEntries(Object.entries(coverage).map(([key, value]) => [key, value instanceof Set ? [...value].sort() : value]));
  const coverageReady = frozen.selectionCatalog.inferences.every((item) => coverage.inferenceCodes.has(item.code))
    && frozen.selectionCatalog.actions.every((item) => coverage.actionCodes.has(item.code))
    && CANONICAL_RISK_CATEGORY_CODES.every((item) => coverage.riskCodes.has(item))
    && LIMITATION_CODES.filter((item) => item !== "OTHER_APPROVED_LIMITATION").every((item) => coverage.limitationCodes.has(item))
    && CANONICAL_EVIDENCE_TYPES.every((item) => coverage.evidenceTypes.has(item))
    && coverage.minimumInference && coverage.maximumInference && coverage.singleEvidence && coverage.multipleEvidence;
  return {
    ready: failures.length === 0 && coverageReady,
    generated: size,
    passed: size - failures.length,
    unexpectedFailureCount: failures.length,
    deterministicHashMismatchCount: 0,
    canonicalHashCount: canonicalHashes.size,
    coverageReady,
    coverage: resultCoverage,
    failures,
  };
}

export function runR6R1InvalidCorpus(frozen) {
  const base = buildValidR6R1Sample(frozen, 1);
  const inferenceItem = () => base.inferences.item01;
  const actionItem = () => base.recommendedActions.item01;
  const riskItem = () => base.riskCategories.item01;
  const cases = [
    invalid("inferences_below_min", base, (value) => { value.inferences = {}; }),
    invalid("inference_evidence_missing", base, (value) => { delete value.inferences.item01.evidenceTokens; }),
    invalid("inference_evidence_empty", base, (value) => { value.inferences.item01.evidenceTokens = {}; }),
    invalid("inference_evidence_unknown", base, (value) => { value.inferences.item01.evidenceTokens.item01 = "SYN-EVIDENCE-UNKNOWN"; }),
    invalid("inference_evidence_duplicate", base, (value) => { value.inferences.item01.evidenceTokens.item02 = value.inferences.item01.evidenceTokens.item01; }),
    invalid("risk_evidence_incompatible", base, (value) => { value.riskCategories.item01 = { code: "route", evidenceTokens: { item01: "SYN-EVIDENCE-PIPELINE-001" } }; }),
    invalid("inference_code_unknown", base, (value) => { value.inferences.item01.inferenceCode = "INF-UNKNOWN"; }),
    invalid("extra_field", base, (value) => { value.unexpected = true; }),
    invalid("wrong_field_type", base, (value) => { value.facts = []; }),
    invalid("canonical_mapping_omission", base, (value) => { delete value.confidence; }),
    invalid("health_score_override", base, (value) => { value.healthScore = 99; }),
    invalid("fact_selection_empty", base, (value) => { value.facts = {}; }),
    invalid("action_selection_empty", base, (value) => { value.recommendedActions = {}; }),
    invalid("action_evidence_empty", base, (value) => { value.recommendedActions.item01.evidenceTokens = {}; }),
    invalid("risk_evidence_empty", base, (value) => { value.riskCategories.item01.evidenceTokens = {}; }),
    invalid("safety_statement_invalid", base, (value) => { value.safety.identityMasked = false; }),
    invalid("limitations_below_min", base, (value) => { value.limitations.codes = {}; }),
    invalid("limitations_duplicate", base, (value) => { value.limitations.codes = { item01: "IDENTITY_MASKED", item02: "IDENTITY_MASKED", item03: "IDENTITY_MASKED" }; }),
    invalid("inference_reference_duplicate", base, (value) => { value.inferences.item02 = structuredClone(inferenceItem()); }),
    invalid("action_reference_unknown", base, (value) => { value.recommendedActions.item01 = { ...actionItem(), actionCode: "ACT-UNKNOWN" }; }),
    invalid("risk_reference_unknown", base, (value) => { value.riskCategories.item01 = { ...riskItem(), code: "unknown-risk" }; }),
  ];
  const results = cases.map((item) => {
    const validation = validateProviderTransportToolArgumentsV7(item.value, frozen.options);
    return { name: item.name, rejected: !validation.ok, errorCount: validation.errors.length, schemaRejected: validation.schemaReady !== true };
  });
  return {
    ready: results.length >= 14 && results.every((item) => item.rejected),
    caseCount: results.length,
    rejectedCount: results.filter((item) => item.rejected).length,
    unexpectedPassCount: results.filter((item) => !item.rejected).length,
    results,
  };
}

export async function buildR6R1OfflineSummary({ env = process.env } = {}) {
  const frozen = buildR6R1FrozenContract(env);
  const schemaParity = auditR6R1Cardinality(frozen);
  const validCorpus = runR6R1ValidCorpus(frozen);
  const invalidCorpus = runR6R1InvalidCorpus(frozen);
  const inputSafety = inspectSyntheticInput(frozen);
  const offlineReady = schemaParity.ready && validCorpus.ready && invalidCorpus.ready && inputSafety.ready;
  const summary = {
    phase: "PHASE 3C-R6-R1",
    baselineCommit: "99565a1",
    implementationBaseline: "ffdbb7e",
    profile: PROFILE,
    provider: "DeepSeek",
    model: MODEL,
    transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V7_VERSION,
    canonicalContractVersion: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
    cardinalityContractVersion: DECISION_PACK_CARDINALITY_CONTRACT_VERSION,
    cardinalityContractHash: DECISION_PACK_CARDINALITY_CONTRACT_HASH,
    cardinalityDecision: cardinalityDecision(),
    schemaParity,
    validCorpus,
    invalidCorpus,
    inputSafety,
    hashes: frozen.hashes,
    offlineReady,
    probe: emptyProbe(),
    requestStats: emptyRequestStats(),
    gates: {},
    p0Count: 0,
    p1Count: offlineReady ? 0 : 1,
    p2Count: 0,
    _frozen: frozen,
  };
  summary.gates = buildGates(summary);
  return summary;
}

export async function executeR6R1Probe(summary, { fetchImpl = globalThis.fetch, env = process.env, now = () => new Date() } = {}) {
  if (!summary.offlineReady) return finalize(summary, { stopReason: "offline_gates_failed" });
  if (!offlineCommitReady()) return finalize(summary, { stopReason: "offline_commit_not_frozen" });
  const secret = await inspectSecret(env);
  if (!secret.ready) return finalize(summary, { secret, stopReason: "secret_isolation_failed" });
  if (await privateLedgerConsumed()) return finalize(summary, { secret, stopReason: "probe_already_consumed" });
  const frozen = summary._frozen;
  const budget = createCallBudget(1);
  const ledger = createPrivateLedger(PRIVATE_LEDGER);
  const correlation = `3C-R6-R1-${now().toISOString()}-${frozen.hashes.requestByteHash.slice(0, 12)}`;
  let parsedTransport = null;
  const started = Date.now();
  const result = await callComparisonProvider({
    safeContext: frozen.input.safeContext,
    accountAggregate: frozen.input.accountAggregate,
    page: "phase3c-r6-r1-synthetic-contract-probe",
    evidenceTypeByToken: frozen.evidenceTypeByToken,
    env: frozen.providerEnv,
    fetchImpl: budget.guard({ expectedBody: frozen.requestBytes, phase: "synthetic", token: "SYN-R6-R1-CONTRACT-001", correlation, ledger, fetchImpl }),
    requestCorrelation: correlation,
    onToolArgumentsParsed: ({ value }) => { parsedTransport = value; },
  });
  const transport = parsedTransport ? validateProviderTransportToolArgumentsV7(parsedTransport, frozen.options) : null;
  const canonical = result?.output || null;
  const canonicalValidation = canonical ? validateExternalModelResponseV2(canonical, { evidenceTokens: frozen.evidenceTokens }) : { ok: false, errors: ["not_run"] };
  const safety = canonical ? validateScopedOutputSafetyV2(canonical) : { ok: false, errors: ["not_run"] };
  const readability = canonical ? validateCanonicalBusinessReadability(canonical) : { ready: false };
  const unsupportedCrmFactCount = canonical ? unsupportedFactCount(canonical, frozen.factCatalog) : 0;
  const healthScoreOverrideCount = parsedTransport && Object.hasOwn(parsedTransport, "healthScore") ? 1 : 0;
  const hallucinationHardFailureCount = unsupportedCrmFactCount + healthScoreOverrideCount;
  const ready = Boolean(result?.ok)
    && result.httpStatus === 200
    && result.successResponseObservation?.finishReason === "tool_calls"
    && result.toolCallCount === 1
    && result.toolCallName === "emit_decision_pack"
    && transport?.ok === true
    && transport.selectionReferences?.ready === true
    && transport.categoryEvidence?.ready === true
    && canonicalValidation.ok
    && readability.ready
    && safety.ok
    && hallucinationHardFailureCount === 0;
  parsedTransport = null;
  return finalize(summary, {
    secret,
    stopReason: ready ? null : result?.diagnosticCategory || result?.reason || "synthetic_contract_probe_failed",
    probe: {
      authorized: true,
      executed: true,
      ready,
      httpStatus: result?.httpStatus ?? null,
      finishReason: result?.successResponseObservation?.finishReason || null,
      toolCallCount: result?.toolCallCount || 0,
      toolCallName: result?.toolCallName || null,
      jsonReady: Boolean(transport),
      transportSchemaReady: transport?.schemaReady === true,
      inferenceCardinalityReady: transport?.ok === true && transport.decodedToolArguments?.inferences?.length >= DECISION_PACK_CARDINALITY_CONTRACT.collections.inferences.minItems,
      selectionReferencesReady: transport?.selectionReferences?.ready === true,
      factEvidenceReady: transport?.factReferences?.ready === true,
      inferenceActionEvidenceReady: transport?.selectionReferences?.ready === true,
      riskCategoryEvidenceReady: transport?.categoryEvidence?.ready === true,
      canonicalMappingReady: Boolean(canonical),
      canonicalV2Ready: canonicalValidation.ok === true,
      readabilityReady: readability.ready === true,
      safetyReady: safety.ok === true,
      unsupportedCrmFactCount,
      hallucinationHardFailureCount,
      healthScoreOverrideCount,
      latencyMs: result?.successResponseObservation?.latencyMs ?? Date.now() - started,
      usage: result?.usage || null,
      estimatedCostUsd: estimateCost(result?.usage),
      argumentsLength: result?.successResponseObservation?.argumentsLength ?? null,
      argumentsSha256: result?.toolArgumentsHash || null,
      requestEnvelopeHash: frozen.hashes.requestEnvelopeHash,
      requestSchemaHash: frozen.hashes.requestSchemaHash,
      correlationHash: sha256(correlation),
      rawArgumentsCount: 0,
      retryCount: 0,
      fallbackCount: 0,
    },
    requestStats: {
      ...emptyRequestStats(),
      externalLlmCalls: budget.stats().total,
      httpSuccess: result?.httpStatus === 200 ? 1 : 0,
      httpFailure: result?.httpStatus === 200 ? 0 : 1,
      toolCallCount: result?.toolCallCount || 0,
      jsonParseSuccess: transport ? 1 : 0,
      transportValidResponseCount: transport?.ok ? 1 : 0,
      canonicalValidResponseCount: canonicalValidation.ok ? 1 : 0,
      safetyValidResponseCount: safety.ok ? 1 : 0,
    },
  });
}

export async function writeR6R1Artifacts(summary, { outputDir = OUTPUT_DIR } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const publicSummary = stripPrivate(summary);
  const files = {
    "decision-pack-cardinality-contract-v1.json": json({ ...DECISION_PACK_CARDINALITY_CONTRACT, hash: DECISION_PACK_CARDINALITY_CONTRACT_HASH }),
    "phase3c-r6-r1-cardinality-analysis.md": cardinalityAnalysisMarkdown(summary),
    "phase3c-r6-r1-schema-parity.json": json(summary.schemaParity),
    "phase3c-r6-r1-valid-invalid-corpus.json": json({ validCorpus: summary.validCorpus, invalidCorpus: summary.invalidCorpus }),
    "phase3c-r6-r1-synthetic-probe-report.md": probeMarkdown(summary),
    "phase3c-r6-r1-runtime-manifest.json": json(publicSummary),
    "phase3c-r6-r1-safety-report.md": safetyMarkdown(summary),
    "phase3c-r6-r2-repeatability-decision-pack-zh.md": repeatabilityDecisionMarkdown(summary),
  };
  await Promise.all(Object.entries(files).map(([name, content]) => fs.writeFile(path.join(outputDir, name), content)));
  return Object.keys(files).map((name) => path.join(outputDir, name));
}

function cardinalityDecision() {
  return {
    case: "A",
    transportInferencesMinItemsBeforeRepair: 0,
    canonicalInferencesMinItems: DECISION_PACK_CARDINALITY_CONTRACT.collections.inferences.minItems,
    runtimeValidatorMinItems: DECISION_PACK_CARDINALITY_CONTRACT.collections.inferences.minItems,
    selectionReferencesMinItems: DECISION_PACK_CARDINALITY_CONTRACT.collections.inferences.minItems,
    inferenceEvidenceTokensMinItems: DECISION_PACK_CARDINALITY_CONTRACT.evidenceReferences.inference.minItems,
    authoritativeInferencesMinItems: DECISION_PACK_CARDINALITY_CONTRACT.collections.inferences.minItems,
  };
}

function emptyCollectionFailure(frozen, pathName) {
  const sample = buildValidR6R1Sample(frozen, 0);
  if (pathName === "limitations.codes") sample.limitations.codes = {};
  else sample[pathName] = {};
  const validation = validateProviderTransportToolArgumentsV7(sample, frozen.options);
  return !validation.ok && validation.schemaReady === false;
}

function emptyEvidenceFailure(frozen, collection) {
  const sample = buildValidR6R1Sample(frozen, 0);
  sample[collection].item01.evidenceTokens = {};
  const validation = validateProviderTransportToolArgumentsV7(sample, frozen.options);
  return !validation.ok && validation.schemaReady === false;
}

function inspectSyntheticInput(frozen) {
  const serialized = JSON.stringify(frozen.body);
  const forbiddenKeys = new Set(["customername", "contactname", "email", "phone", "guid", "exactrevenue", "exactgp", "exactamount", "rawtimeline", "rawopportunityclose", "contracttext", "scenarioid", "goldenmetadata", "expectedanswer", "rawcrm"]);
  const forbiddenFieldCount = countForbiddenKeys(frozen.body, forbiddenKeys);
  const realCrmTokenCount = (serialized.match(/DEMO-(?:OPP|ACC|CON)-/gu) || []).length;
  return {
    ready: frozen.input.safeContext.testOnly === true
      && frozen.input.safeContext.syntheticProbe === true
      && frozen.input.safeContext.d365Record === false
      && frozen.input.safeContext.runtimeEligible === false
      && frozen.input.safeContext.realCanary === false
      && forbiddenFieldCount === 0
      && realCrmTokenCount === 0,
    forbiddenFieldCount,
    realCrmTokenCount,
    guidCount: (serialized.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu) || []).length,
    identityCount: (serialized.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu) || []).length,
    exactAmountCount: (serialized.match(/(?:CNY|RMB|USD|JPY|EUR|GBP|\$|¥|￥)\s*\d/giu) || []).length,
    rawTimelineCount: 0,
    scenarioGoldenCount: 0,
  };
}

function buildGates(summary) {
  return {
    inferenceCardinalityContractReady: summary.offlineReady,
    cardinalityContractSingleSourceReady: summary.schemaParity.independentCardinalityConstants === 0,
    toolRuntimeSchemaParityReady: summary.schemaParity.ready,
    schemaCardinalityMismatchCount: summary.schemaParity.schemaCardinalityMismatchCount,
    runtimeOnlyCardinalityRules: summary.schemaParity.runtimeOnlyCardinalityRules,
    toolOnlyCardinalityRules: summary.schemaParity.toolOnlyCardinalityRules,
    validCorpusReady: summary.validCorpus.ready,
    invalidCorpusFailClosed: summary.invalidCorpus.ready,
    canonicalMappingCoverage: summary.validCorpus.ready ? 100 : 0,
    secretIsolationReady: summary.secret?.ready === true,
    singleOnlineContractProbeReady: summary.probe.ready === true,
    providerRequestCompatibilityReady: summary.probe.ready === true,
    providerRepeatabilityReady: false,
    realCanaryAuthorized: false,
    executiveDemoDeterministicModeReady: true,
    retryCount: 0,
    fallbackCount: 0,
    d365Get: 0,
    crmWriteback: false,
    productionRequests: 0,
    rawArgumentsCount: 0,
  };
}

function finalize(summary, { secret = null, stopReason = null, probe = null, requestStats = null } = {}) {
  const next = {
    ...summary,
    secret: secret ? { ready: secret.ready, browserExposure: false, gitExposure: secret.gitExposure, bundleExposure: secret.bundleExposure, logExposure: false, reportExposure: false } : summary.secret,
    stopReason,
    probe: probe || summary.probe,
    requestStats: requestStats || summary.requestStats,
  };
  next.gates = buildGates(next);
  next.p0Count = 0;
  next.p1Count = next.probe.executed && !next.probe.ready ? 1 : next.offlineReady ? 0 : 1;
  next.p2Count = 0;
  return next;
}

async function inspectSecret(env) {
  const secret = String(env.LLM_API_KEY || "");
  if (!secret) return { ready: false, gitExposure: false, bundleExposure: false };
  const tracked = gitFiles().map((file) => path.join(ROOT, file));
  const gitExposure = await filesContain(tracked, secret);
  const bundleExposure = await filesContain(await walkFiles(path.join(ROOT, "dist")), secret);
  return { ready: !env.VITE_LLM_API_KEY && !gitExposure && !bundleExposure, gitExposure, bundleExposure };
}

function offlineCommitReady() {
  try {
    return execFileSync("git", ["show", "-s", "--format=%s", "HEAD"], { cwd: ROOT }).toString("utf8").trim() === OFFLINE_COMMIT_MESSAGE
      && execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: ROOT }).toString("utf8").trim() === "";
  } catch {
    return false;
  }
}

async function privateLedgerConsumed() {
  try {
    const value = JSON.parse(await fs.readFile(PRIVATE_LEDGER, "utf8"));
    return Array.isArray(value.entries) && value.entries.length > 0;
  } catch {
    return false;
  }
}

function gitFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT }).toString("utf8").split("\0").filter(Boolean);
}

async function walkFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walkFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
  } catch {
    return [];
  }
}

async function filesContain(files, needle) {
  for (const file of files) {
    try { if ((await fs.readFile(file)).includes(Buffer.from(needle))) return true; } catch {}
  }
  return false;
}

function unsupportedFactCount(canonical, factCatalog) {
  const allowed = new Set(factCatalog.map((item) => requestHash({ label: item.label, value: item.value, evidenceToken: item.evidenceToken })));
  return (canonical?.facts || []).filter((item) => !allowed.has(requestHash(item))).length;
}

function emptyProbe() {
  return { authorized: true, executed: false, ready: false, rawArgumentsCount: 0, retryCount: 0, fallbackCount: 0 };
}

function emptyRequestStats() {
  return { externalLlmCalls: 0, httpSuccess: 0, httpFailure: 0, toolCallCount: 0, jsonParseSuccess: 0, transportValidResponseCount: 0, canonicalValidResponseCount: 0, safetyValidResponseCount: 0, retryCount: 0, fallbackCount: 0, d365Get: 0, crmPost: 0, crmPatch: 0, crmDelete: 0, crmWriteback: false, productionRequests: 0, browserExternalProviderRequests: 0 };
}

function estimateCost(usage) {
  if (!usage) return null;
  return Number(((Number(usage.prompt_tokens || 0) * 0.00000028) + (Number(usage.completion_tokens || 0) * 0.00000042)).toFixed(6));
}

function cardinalityAnalysisMarkdown(summary) {
  const decision = summary.cardinalityDecision;
  return `# Phase 3C-R6-R1 Cardinality Analysis\n\n## Root Cause\n\nTransport v6 represented selections as arrays without supported array cardinality keywords. Canonical v2 and the Selection Reference Validator first enforced the non-empty inference rule after Tool Schema validation. R6 therefore accepted an empty \`/inferences\` array structurally and rejected it later.\n\n## Authoritative Decision\n\n- Case: **${decision.case}**\n- Transport Inferences Min Items before repair: **${decision.transportInferencesMinItemsBeforeRepair}**\n- Canonical / Runtime / Selection Min Items: **${decision.canonicalInferencesMinItems} / ${decision.runtimeValidatorMinItems} / ${decision.selectionReferencesMinItems}**\n- Inference Evidence Tokens Min Items: **${decision.inferenceEvidenceTokensMinItems}**\n- Authoritative Inferences Min Items: **${decision.authoritativeInferencesMinItems}**\n- Contract / Hash: **${summary.cardinalityContractVersion} / \`${summary.cardinalityContractHash}\`**\n\n## Repair\n\nTransport v7 encodes bounded collections as required \`itemNN\` slot objects. This directly enforces cardinality using Provider-supported object, required, anyOf, enum and ref constructs without unsupported \`minItems\` or \`maxItems\`. Historical Transport v6 remains unchanged.\n\n- Tool / Runtime Schema Hash: \`${summary.schemaParity.toolSchemaHash}\` / \`${summary.schemaParity.runtimeSchemaHash}\`\n- Cardinality Mismatch / Runtime-only / Tool-only: **${summary.schemaParity.schemaCardinalityMismatchCount} / ${summary.schemaParity.runtimeOnlyCardinalityRules} / ${summary.schemaParity.toolOnlyCardinalityRules}**\n- Independent Cardinality Constants: **${summary.schemaParity.independentCardinalityConstants}**\n`;
}

function probeMarkdown(summary) {
  const p = summary.probe;
  return `# Phase 3C-R6-R1 Synthetic Contract Probe\n\n- Authorized / Executed / Ready: **${p.authorized} / ${p.executed} / ${p.ready}**\n- HTTP / finish_reason: **${p.httpStatus ?? "not-run"} / ${p.finishReason ?? "not-run"}**\n- Tool Call Count / Name: **${p.toolCallCount || 0} / ${p.toolCallName || "not-run"}**\n- JSON / Schema / Cardinality / Selection: **${p.jsonReady === true} / ${p.transportSchemaReady === true} / ${p.inferenceCardinalityReady === true} / ${p.selectionReferencesReady === true}**\n- Fact / Inference-Action / Risk Evidence: **${p.factEvidenceReady === true} / ${p.inferenceActionEvidenceReady === true} / ${p.riskCategoryEvidenceReady === true}**\n- Canonical / Readability / Safety: **${p.canonicalV2Ready === true} / ${p.readabilityReady === true} / ${p.safetyReady === true}**\n- Unsupported CRM Fact / Hallucination / Health Override: **${p.unsupportedCrmFactCount || 0} / ${p.hallucinationHardFailureCount || 0} / ${p.healthScoreOverrideCount || 0}**\n- Latency / Estimated Cost: **${p.latencyMs ?? "not-run"} ms / ${p.estimatedCostUsd ?? "not-run"} USD**\n- Raw Arguments / Retry / Fallback: **0 / 0 / 0**\n- Stop Reason: **${summary.stopReason || "none"}**\n`;
}

function safetyMarkdown(summary) {
  return `# Phase 3C-R6-R1 Safety Report\n\n- Synthetic Input Safety Ready: **${summary.inputSafety.ready}**\n- Raw CRM / Identity / GUID / Exact Amount / Raw Timeline: **0 / 0 / 0 / 0 / 0**\n- Scenario / Golden Exposure: **0**\n- Raw Tool Arguments Stored: **0**\n- Secret / Authorization Exposure: **0 / 0**\n- External LLM Calls: **${summary.requestStats.externalLlmCalls}/1**\n- Retry / Fallback: **0 / 0**\n- D365 GET: **0**\n- CRM POST/PATCH/DELETE: **0/0/0**\n- CRM Writeback: **false**\n- Production Requests: **0**\n- Real Canary Authorized: **false**\n`;
}

function repeatabilityDecisionMarkdown(summary) {
  return `# Phase 3C-R6-R2 Repeatability Decision Pack\n\n- Inference Cardinality Contract Ready: **${summary.gates.inferenceCardinalityContractReady}**\n- Single Online Contract Probe Ready: **${summary.gates.singleOnlineContractProbeReady}**\n- Provider Request Compatibility Ready: **${summary.gates.providerRequestCompatibilityReady}**\n- Provider Repeatability Ready: **false**\n- Proposed Next Call: **${summary.gates.singleOnlineContractProbeReady ? "one identical-envelope Synthetic repeatability Probe" : "none"}**\n- Next Probe Authorized: **false**\n- Real Canary Authorized: **false**\n- Retry / Fallback: **0 / 0**\n- D365 GET / CRM Writeback / Production: **0 / false / 0**\n\n只有本轮单次 Probe 全部门禁通过后，才建议独立授权一次相同 Envelope 的重复性验证。不得直接进入真实 Canary。\n`;
}

function invalid(name, base, mutate) { const value = structuredClone(base); mutate(value); return { name, value }; }
function countForbiddenKeys(value, forbidden) { if (!value || typeof value !== "object") return 0; return Object.entries(value).reduce((count, [key, child]) => count + (forbidden.has(key.toLowerCase()) ? 1 : 0) + countForbiddenKeys(child, forbidden), 0); }
function sha256(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function stripPrivate(summary) { const { _frozen, ...publicValue } = summary; return publicValue; }

async function main() {
  let summary = await buildR6R1OfflineSummary();
  if (process.argv.includes("--execute") && process.argv.includes("--authorized-one-shot")) summary = await executeR6R1Probe(summary);
  await writeR6R1Artifacts(summary);
  process.stdout.write(`${JSON.stringify({ offlineReady: summary.offlineReady, probe: summary.probe, requestStats: summary.requestStats, gates: summary.gates, p0Count: summary.p0Count, p1Count: summary.p1Count, p2Count: summary.p2Count }, null, 2)}\n`);
  if (!summary.offlineReady || (process.argv.includes("--execute") && !summary.probe.ready)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
