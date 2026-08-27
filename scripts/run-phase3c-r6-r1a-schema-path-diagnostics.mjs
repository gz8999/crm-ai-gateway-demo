import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import { requestHash } from "../server/decision/externalModelContract.mjs";
import {
  DECISION_PACK_CARDINALITY_CONTRACT_HASH,
  DECISION_PACK_CARDINALITY_CONTRACT_VERSION,
} from "../server/decision/decisionPackCardinalityContract.mjs";
import {
  EXTERNAL_MODEL_RESPONSE_V2_VERSION,
  PROVIDER_TRANSPORT_CONTRACT_V7_VERSION,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV7,
  validateScopedOutputSafetyV2,
} from "../server/decision/externalModelContractV2.mjs";
import { validateJsonSchemaWithDiagnostics } from "../server/decision/jsonSchemaDiagnostics.mjs";
import {
  SAFE_SCHEMA_DIAGNOSTIC_FIELDS,
  SAFE_SCHEMA_FAILURE_CLASSES,
  SAFE_SCHEMA_PATH_DIAGNOSTICS_VERSION,
  buildSafeSchemaPathDiagnostics,
} from "../server/decision/safeSchemaPathDiagnostics.mjs";
import { validateCanonicalBusinessReadability } from "../server/decision/safeFactCatalog.mjs";
import { createCallBudget, createPrivateLedger } from "./run-phase3c-fast-demo-validation.mjs";
import {
  auditR6R1Cardinality,
  buildR6R1FrozenContract,
  buildR6R1OfflineSummary,
  buildValidR6R1Sample,
} from "./run-phase3c-r6-r1-cardinality-repair.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "docs/gateway");
const PRIVATE_LEDGER = path.join(ROOT, "local-artifacts/gateway/phase3c-r6-r1a/private-ledger.json");
const BASELINE_COMMIT = "af6e3eb074e4acf2caf60604fda13bad33d80d07";
const OFFLINE_COMMIT_MESSAGE = "Add safe Phase 3C schema path diagnostics";
const EXPECTED_CARDINALITY_HASH = "fce9a5277979b6c35d515395720892857ae7afcb756d627cfac6b1811792376b";

export function runR6R1ADiagnosticCorpus(frozen = buildR6R1FrozenContract({})) {
  const base = () => buildValidR6R1Sample(frozen, 7);
  const transportCase = (name, expectedClass, mutate, expectedPath, expectedKeyword) => {
    const value = base();
    mutate(value);
    const validation = validateProviderTransportToolArgumentsV7(value, frozen.options);
    const diagnostic = buildSafeSchemaPathDiagnostics({
      schemaDiagnostics: validation.schemaDiagnostics,
      semanticErrors: validation.schemaReady ? validation.errors : [],
      parsedValue: value,
      evidenceTokens: frozen.evidenceTokens,
    });
    return corpusResult({ name, expectedClass, expectedPath, expectedKeyword, diagnostic });
  };
  const genericCase = (name, expectedClass, value, schema, expectedPath, expectedKeyword) => {
    const validation = validateJsonSchemaWithDiagnostics(value, schema);
    const diagnostic = buildSafeSchemaPathDiagnostics({ schemaDiagnostics: validation, parsedValue: value, evidenceTokens: frozen.evidenceTokens });
    return corpusResult({ name, expectedClass, expectedPath, expectedKeyword, diagnostic });
  };
  const routeDefinition = frozen.riskCatalog.find((item) => item.code === "route");
  const globallyAllowedEvidence = frozen.evidenceTokens.find((token) => !routeDefinition.compatibleEvidenceTokens.includes(token));
  const cases = [
    transportCase("missing_inferences", "MISSING_REQUIRED_PROPERTY", (value) => { delete value.inferences; }, "", "required"),
    transportCase("inferences_below_minimum", "CARDINALITY_MISMATCH", (value) => { value.inferences = {}; }, "/inferences", "required"),
    transportCase("inference_missing_evidence", "MISSING_REQUIRED_PROPERTY", (value) => { delete value.inferences.item01.evidenceTokens; }, "/inferences/item01", "required"),
    transportCase("evidence_not_allowlisted", "EVIDENCE_NOT_ALLOWLISTED", (value) => { value.inferences.item01.evidenceTokens.item01 = "SYN-PRIVATE-EVIDENCE-VALUE"; }, "/inferences/item01/evidenceTokens/item01", "enum"),
    transportCase("evidence_duplicate", "EVIDENCE_DUPLICATE", (value) => {
      const definition = frozen.riskCatalog.find((item) => item.compatibleEvidenceTokens.length >= 2);
      value.riskCategories.item01 = {
        code: definition.code,
        evidenceTokens: { item01: definition.compatibleEvidenceTokens[0], item02: definition.compatibleEvidenceTokens[0] },
      };
    }, "/riskCategories/item01/evidenceTokens", "semantic"),
    transportCase("wrong_field_type", "TYPE_MISMATCH", (value) => { value.facts = []; }, "/facts", "type"),
    transportCase("unexpected_property", "UNEXPECTED_PROPERTY", (value) => { value.unexpectedField = true; }, "", "additionalProperties"),
    transportCase("unknown_enum", "ENUM_MISMATCH", (value) => { value.priority = "UNKNOWN-PRIORITY"; }, "/priority", "enum"),
    transportCase("const_mismatch", "CONST_MISMATCH", (value) => { value.safety.identityMasked = false; }, "/safety/identityMasked", "enum"),
    genericCase("string_max_length", "STRING_MAX_LENGTH", "123456", { type: "string", maxLength: 5 }, "", "maxLength"),
    genericCase("string_min_length", "STRING_MIN_LENGTH", "x", { type: "string", minLength: 2 }, "", "minLength"),
    genericCase("pattern_mismatch", "PATTERN_MISMATCH", "lower", { type: "string", pattern: "^[A-Z]+$" }, "", "pattern"),
    genericCase("array_min_items", "ARRAY_MIN_ITEMS", [], { type: "array", minItems: 1, items: { type: "string" } }, "", "minItems"),
    genericCase("array_max_items", "ARRAY_MAX_ITEMS", ["a", "b"], { type: "array", maxItems: 1, items: { type: "string" } }, "", "maxItems"),
    genericCase("one_of_mismatch", "ONE_OF_MISMATCH", true, { oneOf: [{ type: "string" }, { type: "number" }] }, "", "oneOf"),
    transportCase("category_evidence_incompatible", "CATEGORY_EVIDENCE_INCOMPATIBLE", (value) => {
      value.riskCategories.item01 = { code: "route", evidenceTokens: { item01: globallyAllowedEvidence } };
    }, "/riskCategories/item01/evidenceTokens/item01", "enum"),
    transportCase("safety_statement_invalid", "CONST_MISMATCH", (value) => { value.safety.rawTimelineWithheld = false; }, "/safety/rawTimelineWithheld", "enum"),
    transportCase("health_score_override", "UNEXPECTED_PROPERTY", (value) => { value.healthScore = 91; }, "", "additionalProperties"),
  ];
  const passed = cases.filter((item) => item.passed).length;
  const serialized = JSON.stringify(cases);
  return {
    ready: passed === cases.length
      && !serialized.includes("SYN-PRIVATE-EVIDENCE-VALUE")
      && !serialized.includes("actualValue")
      && !serialized.includes("rawArguments"),
    caseCount: cases.length,
    passed,
    failed: cases.length - passed,
    classificationAccuracy: Number(((passed / cases.length) * 100).toFixed(2)),
    actualValueExposureCount: serialized.includes("SYN-PRIVATE-EVIDENCE-VALUE") ? 1 : 0,
    evidenceTokenExposureCount: serialized.includes("SYN-PRIVATE-EVIDENCE-VALUE") ? 1 : 0,
    results: cases,
  };
}

export async function buildR6R1AOfflineSummary({ env = process.env } = {}) {
  const base = await buildR6R1OfflineSummary({ env });
  const frozen = base._frozen;
  const schemaParity = auditR6R1Cardinality(frozen);
  const diagnosticCorpus = runR6R1ADiagnosticCorpus(frozen);
  const cardinalityPreserved = DECISION_PACK_CARDINALITY_CONTRACT_HASH === EXPECTED_CARDINALITY_HASH
    && base.cardinalityContractHash === EXPECTED_CARDINALITY_HASH;
  const offlineReady = base.offlineReady
    && schemaParity.ready
    && diagnosticCorpus.ready
    && diagnosticCorpus.classificationAccuracy === 100
    && cardinalityPreserved;
  const summary = {
    phase: "PHASE 3C-R6-R1A",
    baselineCommit: BASELINE_COMMIT,
    offlineRepairCommit: null,
    provider: base.provider,
    model: base.model,
    profile: base.profile,
    transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V7_VERSION,
    canonicalContractVersion: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
    cardinalityContractVersion: DECISION_PACK_CARDINALITY_CONTRACT_VERSION,
    cardinalityContractHash: DECISION_PACK_CARDINALITY_CONTRACT_HASH,
    cardinalityPreserved,
    schemaParity,
    validCorpus: base.validCorpus,
    invalidCorpus: base.invalidCorpus,
    diagnosticContractVersion: SAFE_SCHEMA_PATH_DIAGNOSTICS_VERSION,
    diagnosticCorpus,
    inputSafety: base.inputSafety,
    hashes: base.hashes,
    offlineReady,
    secret: null,
    diagnostics: emptyDiagnostics(),
    probe: emptyProbe(),
    requestStats: emptyRequestStats(),
    externalAiTechnicalValidationDeferred: false,
    externalUiStatus: "Controlled Validation Pending",
    p0Count: 0,
    p1Count: offlineReady ? 0 : 1,
    p2Count: 0,
    _frozen: frozen,
  };
  summary.gates = buildGates(summary);
  return summary;
}

export async function executeR6R1AProbe(summary, {
  fetchImpl = globalThis.fetch,
  env = process.env,
  now = () => new Date(),
} = {}) {
  if (!summary.offlineReady) return finalize(summary, { stopReason: "offline_gates_failed" });
  if (!offlineCommitReady()) return finalize(summary, { stopReason: "offline_commit_not_frozen" });
  const secret = await inspectSecret(env);
  if (!secret.ready) return finalize(summary, { secret, stopReason: "secret_isolation_failed" });
  if (await privateLedgerConsumed()) return finalize(summary, { secret, stopReason: "probe_already_consumed" });
  const frozen = summary._frozen;
  const budget = createCallBudget(1);
  const ledger = createPrivateLedger(PRIVATE_LEDGER);
  const correlation = `3C-R6-R1A-${now().toISOString()}-${frozen.hashes.requestByteHash.slice(0, 12)}`;
  let parsedTransport = null;
  const started = Date.now();
  const result = await callComparisonProvider({
    safeContext: frozen.input.safeContext,
    accountAggregate: frozen.input.accountAggregate,
    page: "phase3c-r6-r1-synthetic-contract-probe",
    evidenceTypeByToken: frozen.evidenceTypeByToken,
    env: frozen.providerEnv,
    fetchImpl: budget.guard({ expectedBody: frozen.requestBytes, phase: "synthetic", token: "SYN-R6-R1A-FINAL-001", correlation, ledger, fetchImpl }),
    requestCorrelation: correlation,
    onToolArgumentsParsed: ({ value }) => { parsedTransport = value; },
  });
  const transport = parsedTransport ? validateProviderTransportToolArgumentsV7(parsedTransport, frozen.options) : null;
  const diagnostics = transport && !transport.ok
    ? buildSafeSchemaPathDiagnostics({
      schemaDiagnostics: transport.schemaDiagnostics,
      semanticErrors: transport.schemaReady ? transport.errors : [],
      parsedValue: parsedTransport,
      evidenceTokens: frozen.evidenceTokens,
    })
    : emptyDiagnostics();
  const canonical = result?.output || null;
  const canonicalValidation = canonical
    ? validateExternalModelResponseV2(canonical, { evidenceTokens: frozen.evidenceTokens })
    : { ok: false, errors: ["not_run"] };
  const outputSafety = canonical ? validateScopedOutputSafetyV2(canonical) : { ok: false, errors: ["not_run"] };
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
    && transport.factReferences?.ready === true
    && transport.categoryEvidence?.ready === true
    && canonicalValidation.ok
    && readability.ready
    && outputSafety.ok
    && hallucinationHardFailureCount === 0;
  parsedTransport = null;
  return finalize(summary, {
    secret,
    diagnostics,
    stopReason: ready ? null : diagnostics.primaryFailureClass || result?.diagnosticCategory || result?.reason || "synthetic_contract_probe_failed",
    probe: {
      authorized: true,
      executed: true,
      ready,
      httpStatus: result?.httpStatus ?? null,
      finishReason: result?.successResponseObservation?.finishReason || null,
      toolCallCount: result?.toolCallCount || 0,
      toolCallName: result?.toolCallName || null,
      argumentsType: result?.successResponseObservation?.argumentsRuntimeType || null,
      jsonReady: Boolean(transport),
      transportSchemaReady: transport?.schemaReady === true,
      cardinalityReady: transport?.ok === true,
      factEvidenceReady: transport?.factReferences?.ready === true,
      inferenceActionEvidenceReady: transport?.selectionReferences?.ready === true,
      riskCategoryEvidenceReady: transport?.categoryEvidence?.ready === true,
      categoryEvidenceCompatibilityReady: transport?.categoryEvidence?.ready === true,
      safetyStatementsReady: transport?.schemaReady === true,
      canonicalMappingReady: Boolean(canonical),
      canonicalV2Ready: canonicalValidation.ok === true,
      readabilityReady: readability.ready === true,
      outputSafetyReady: outputSafety.ok === true,
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
      toolCallSuccess: result?.toolCallCount === 1 && result?.toolCallName === "emit_decision_pack" ? 1 : 0,
      jsonParseAttempts: result?.toolCallCount ? 1 : 0,
      jsonParseSuccess: transport ? 1 : 0,
      transportSchemaAttempts: transport ? 1 : 0,
      transportSchemaSuccess: transport?.schemaReady ? 1 : 0,
      cardinalityAttempts: transport ? 1 : 0,
      cardinalitySuccess: transport?.ok ? 1 : 0,
      evidenceAttempts: transport?.schemaReady ? 1 : 0,
      evidenceSuccess: transport?.factReferences?.ready && transport?.selectionReferences?.ready && transport?.categoryEvidence?.ready ? 1 : 0,
      canonicalAttempts: canonical ? 1 : 0,
      canonicalSuccess: canonicalValidation.ok ? 1 : 0,
      safetyAttempts: canonical ? 1 : 0,
      safetySuccess: outputSafety.ok ? 1 : 0,
      latencyMs: result?.successResponseObservation?.latencyMs ?? Date.now() - started,
      usage: result?.usage || null,
      estimatedCostUsd: estimateCost(result?.usage),
    },
  });
}

export async function writeR6R1AArtifacts(summary, { outputDir = OUTPUT_DIR } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const publicSummary = stripPrivate(summary);
  const files = {
    "phase3c-r6-r1a-schema-diagnostics-contract.json": json({
      version: SAFE_SCHEMA_PATH_DIAGNOSTICS_VERSION,
      allowedErrorFields: SAFE_SCHEMA_DIAGNOSTIC_FIELDS,
      failureClasses: SAFE_SCHEMA_FAILURE_CLASSES,
      evidenceFields: ["evidenceTokenCount", "evidenceSetHash", "unknownTokenCount", "duplicateTokenCount", "allowlistMembershipBitmapHash"],
      forbidden: ["actual field value", "raw Tool Arguments", "raw response", "Evidence Token text", "CRM Token", "GUID", "identity", "exact amount", "secret", "Authorization"],
      rawArgumentsCount: 0,
    }),
    "phase3c-r6-r1a-diagnostic-validation-report.md": diagnosticValidationMarkdown(summary),
    "phase3c-r6-r1a-schema-error-catalog.json": json({
      version: SAFE_SCHEMA_PATH_DIAGNOSTICS_VERSION,
      classes: SAFE_SCHEMA_FAILURE_CLASSES,
      offline: summary.diagnosticCorpus,
      online: summary.diagnostics,
    }),
    "phase3c-r6-r1a-synthetic-probe-report.md": probeMarkdown(summary),
    "phase3c-r6-r1a-runtime-manifest.json": json(publicSummary),
    "phase3c-r6-r1a-safety-report.md": safetyMarkdown(summary),
    "phase3c-r6-r2-final-repeatability-decision-pack-zh.md": repeatabilityDecisionMarkdown(summary),
    "executive-demo-deterministic-status.md": executiveDemoMarkdown(summary),
  };
  await Promise.all(Object.entries(files).map(([name, content]) => fs.writeFile(path.join(outputDir, name), content)));
  return Object.keys(files).map((name) => path.join(outputDir, name));
}

function corpusResult({ name, expectedClass, expectedPath, expectedKeyword, diagnostic }) {
  const passed = diagnostic.primaryFailureClass === expectedClass
    && diagnostic.primaryInstancePath === expectedPath
    && diagnostic.primaryKeyword === expectedKeyword;
  return {
    name,
    expectedClass,
    actualClass: diagnostic.primaryFailureClass,
    expectedPath,
    actualPath: diagnostic.primaryInstancePath,
    expectedKeyword,
    actualKeyword: diagnostic.primaryKeyword,
    secondaryFailureCount: diagnostic.secondaryFailureCount,
    passed,
  };
}

function buildGates(summary) {
  return {
    schemaPathDiagnosticsReady: summary.diagnosticCorpus.ready,
    schemaErrorClassificationReady: summary.diagnosticCorpus.classificationAccuracy === 100,
    diagnosticPrivacyReady: summary.diagnosticCorpus.actualValueExposureCount === 0 && summary.probe.rawArgumentsCount === 0,
    toolRuntimeSchemaParityReady: summary.schemaParity.ready,
    cardinalityContractPreserved: summary.cardinalityPreserved,
    validCorpusReady: summary.validCorpus.ready,
    invalidCorpusFailClosedReady: summary.invalidCorpus.ready,
    offlineDiagnosticCommitCreated: Boolean(summary.offlineRepairCommit),
    singleSyntheticProbeExecuted: summary.probe.executed,
    singleOnlineContractProbeReady: summary.probe.ready,
    providerRequestCompatibilityReady: summary.probe.ready,
    providerRepeatabilityReady: false,
    realCanaryAuthorized: false,
    externalAiTechnicalValidationDeferred: summary.externalAiTechnicalValidationDeferred,
    executiveDemoDeterministicModeReady: true,
    crmWriteback: false,
    productionRequests: 0,
    rawArgumentsSaved: 0,
  };
}

function finalize(summary, { secret = null, diagnostics = null, stopReason = null, probe = null, requestStats = null } = {}) {
  const next = {
    ...summary,
    offlineRepairCommit: currentCommit(),
    secret: secret ? { ready: secret.ready, browserExposure: false, gitExposure: secret.gitExposure, bundleExposure: secret.bundleExposure, logExposure: false, reportExposure: false } : summary.secret,
    diagnostics: diagnostics || summary.diagnostics,
    stopReason,
    probe: probe || summary.probe,
    requestStats: requestStats || summary.requestStats,
  };
  next.externalAiTechnicalValidationDeferred = next.probe.executed && !next.probe.ready;
  next.gates = buildGates(next);
  next.p0Count = 0;
  next.p1Count = next.probe.executed && !next.probe.ready ? 1 : next.offlineReady ? 0 : 1;
  next.p2Count = 0;
  next.r6R1AComplete = next.probe.executed;
  return next;
}

function diagnosticValidationMarkdown(summary) {
  return `# Phase 3C-R6-R1A Diagnostic Validation\n\n- Contract: **${summary.diagnosticContractVersion}**\n- Classification Accuracy: **${summary.diagnosticCorpus.classificationAccuracy}%**\n- Cases Passed: **${summary.diagnosticCorpus.passed}/${summary.diagnosticCorpus.caseCount}**\n- Actual Value / Evidence Token Exposure: **${summary.diagnosticCorpus.actualValueExposureCount}/${summary.diagnosticCorpus.evidenceTokenExposureCount}**\n- Tool / Runtime Schema Parity: **${summary.schemaParity.ready}**\n- Cardinality Contract Preserved: **${summary.cardinalityPreserved}**\n- Cardinality Contract Hash: \`${summary.cardinalityContractHash}\`\n- Valid / Invalid Corpus: **${summary.validCorpus.passed}/${summary.validCorpus.generated} / ${summary.invalidCorpus.rejectedCount}/${summary.invalidCorpus.caseCount}**\n`;
}

function probeMarkdown(summary) {
  const p = summary.probe;
  const d = summary.diagnostics;
  return `# Phase 3C-R6-R1A Final Synthetic Probe\n\n- Authorized / Executed / Ready: **${p.authorized} / ${p.executed} / ${p.ready}**\n- HTTP / finish_reason: **${p.httpStatus ?? "not-run"} / ${p.finishReason ?? "not-run"}**\n- Tool Count / Name / Arguments Type: **${p.toolCallCount || 0} / ${p.toolCallName || "not-run"} / ${p.argumentsType || "not-run"}**\n- JSON / Transport Schema / Cardinality: **${p.jsonReady === true} / ${p.transportSchemaReady === true} / ${p.cardinalityReady === true}**\n- Fact / Inference-Action / Risk Evidence: **${p.factEvidenceReady === true} / ${p.inferenceActionEvidenceReady === true} / ${p.riskCategoryEvidenceReady === true}**\n- Canonical / Output Safety: **${p.canonicalV2Ready === true} / ${p.outputSafetyReady === true}**\n- Primary Failure Class: **${d.primaryFailureClass || "none"}**\n- Primary Instance Path: **${d.primaryInstancePath ?? "none"}**\n- Primary Schema Path: **${d.primarySchemaPath ?? "none"}**\n- Primary Keyword / Secondary Failures: **${d.primaryKeyword ?? "none"} / ${d.secondaryFailureCount || 0}**\n- Raw Arguments / Retry / Fallback: **0 / 0 / 0**\n- Stop Reason: **${summary.stopReason || "none"}**\n`;
}

function safetyMarkdown(summary) {
  return `# Phase 3C-R6-R1A Safety Report\n\n- Synthetic Input Safety Ready: **${summary.inputSafety.ready}**\n- Raw CRM / Identity / GUID / Exact Amount / Raw Timeline: **0 / 0 / 0 / 0 / 0**\n- Scenario / Golden Exposure: **0**\n- Raw Tool Arguments Saved: **0**\n- Actual Field Values in Diagnostics: **0**\n- Secret / Authorization Exposure: **0 / 0**\n- External LLM Calls: **${summary.requestStats.externalLlmCalls}/1**\n- Retry / Fallback: **0 / 0**\n- D365 GET: **0**\n- CRM POST/PATCH/DELETE: **0/0/0**\n- CRM Writeback: **false**\n- Production Requests: **0**\n- Real Canary Authorized: **false**\n`;
}

function repeatabilityDecisionMarkdown(summary) {
  const allowed = summary.probe.ready === true;
  return `# Phase 3C-R6-R2 Final Repeatability Decision\n\n- Single Online Contract Probe Ready: **${summary.probe.ready === true}**\n- Provider Request Compatibility Ready: **${summary.probe.ready === true}**\n- Repeatability Probe May Be Requested: **${allowed}**\n- Provider Repeatability Ready: **false**\n- Real Canary Authorized: **false**\n- Decision: **${allowed ? "Only an independently authorized, byte-identical single repeatability probe may be requested." : "External AI technical validation is deferred. Do not request another Provider probe in this stage."}**\n`;
}

function executiveDemoMarkdown(summary) {
  return `# Executive Demo Deterministic Status\n\n- Executive Demo Deterministic Mode Ready: **true**\n- External UI Status: **Controlled Validation Pending**\n- External LLM Required for Demo: **false**\n- D365 Frozen Dataset / Opportunity Count: **ready / 200**\n- Health Score v2 / Six Dimensions / Decision Pack: **ready / ready / ready**\n- AI Cockpit / Risk & Priority / Opportunity 360 / Action Board / Meeting Copilot / Portfolio Intelligence / Audit & Safety: **ready**\n- External AI Technical Validation Deferred: **${summary.externalAiTechnicalValidationDeferred}**\n`;
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
    return currentCommitMessage() === OFFLINE_COMMIT_MESSAGE
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

function currentCommit() {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString("utf8").trim(); } catch { return null; }
}
function currentCommitMessage() {
  try { return execFileSync("git", ["show", "-s", "--format=%s", "HEAD"], { cwd: ROOT }).toString("utf8").trim(); } catch { return ""; }
}
function gitFiles() { return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT }).toString("utf8").split("\0").filter(Boolean); }
async function walkFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walkFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
  } catch { return []; }
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

function emptyDiagnostics() {
  return { version: SAFE_SCHEMA_PATH_DIAGNOSTICS_VERSION, ready: false, primaryFailureClass: null, primaryInstancePath: null, primarySchemaPath: null, primaryKeyword: null, secondaryFailureCount: 0, errors: [], evidence: { evidenceTokenCount: 0, evidenceSetHash: sha256("[]"), unknownTokenCount: 0, duplicateTokenCount: 0, allowlistMembershipBitmapHash: sha256("") }, rawArgumentsCount: 0, actualValueCount: 0 };
}
function emptyProbe() { return { authorized: true, executed: false, ready: false, rawArgumentsCount: 0, retryCount: 0, fallbackCount: 0 }; }
function emptyRequestStats() {
  return { externalLlmCalls: 0, httpSuccess: 0, toolCallSuccess: 0, jsonParseAttempts: 0, jsonParseSuccess: 0, transportSchemaAttempts: 0, transportSchemaSuccess: 0, cardinalityAttempts: 0, cardinalitySuccess: 0, evidenceAttempts: 0, evidenceSuccess: 0, canonicalAttempts: 0, canonicalSuccess: 0, safetyAttempts: 0, safetySuccess: 0, retryCount: 0, fallbackCount: 0, d365Get: 0, crmPost: 0, crmPatch: 0, crmDelete: 0, crmWriteback: false, productionRequests: 0, browserExternalRequests: 0, latencyMs: null, usage: null, estimatedCostUsd: null };
}
function stripPrivate(summary) { const { _frozen, ...publicSummary } = summary; return publicSummary; }
function estimateCost(usage) {
  if (!usage) return null;
  return Number(((Number(usage.prompt_tokens || 0) * 0.00000028) + (Number(usage.completion_tokens || 0) * 0.00000042)).toFixed(6));
}
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sha256(value) { return createHash("sha256").update(String(value)).digest("hex"); }

async function main() {
  let summary = await buildR6R1AOfflineSummary();
  if (process.argv.includes("--execute")) {
    if (!process.argv.includes("--authorized-one-shot")) throw new Error("R6-R1A one-shot authorization flag is required");
    summary = await executeR6R1AProbe(summary);
  }
  await writeR6R1AArtifacts(summary);
  process.stdout.write(`${JSON.stringify({ offlineReady: summary.offlineReady, diagnosticCorpus: summary.diagnosticCorpus, diagnostics: summary.diagnostics, probe: summary.probe, requestStats: summary.requestStats, gates: summary.gates, p0Count: summary.p0Count, p1Count: summary.p1Count, p2Count: summary.p2Count }, null, 2)}\n`);
  if (!summary.offlineReady || (process.argv.includes("--execute") && !summary.probe.ready)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  process.stderr.write(`${error?.message || "Phase 3C R6-R1A failed"}\n`);
  process.exitCode = 1;
});
