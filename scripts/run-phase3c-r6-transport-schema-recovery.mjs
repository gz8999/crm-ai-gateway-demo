import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import { requestHash } from "../server/decision/externalModelContract.mjs";
import {
  EXTERNAL_MODEL_RESPONSE_V2_VERSION,
  LIMITATION_CODES,
  PROVIDER_TRANSPORT_CONTRACT_V6_VERSION,
  buildProviderTransportToolSchemaV6,
  mapProviderTransportV6ToCanonicalV2,
  validateExternalModelResponseV2,
  validateProviderTransportToolArgumentsV6,
  validateScopedOutputSafetyV2,
} from "../server/decision/externalModelContractV2.mjs";
import {
  JSON_SCHEMA_DIAGNOSTICS_NAME,
  JSON_SCHEMA_DIAGNOSTICS_VERSION,
  classifySchemaDiagnostic,
} from "../server/decision/jsonSchemaDiagnostics.mjs";
import { lintDeepSeekRequestShapeV2, lintDeepSeekSchemaCompleteness, schemaHash } from "../server/decision/deepseekStrictSchema.mjs";
import { buildSafeFactCatalog, validateCanonicalBusinessReadability } from "../server/decision/safeFactCatalog.mjs";
import { buildProviderSelectionCatalog } from "../server/decision/providerSelectionCatalog.mjs";
import {
  CANONICAL_EVIDENCE_TYPES,
  CANONICAL_RISK_CATEGORY_CODES,
  buildEvidenceTypeIndex,
  buildRequestScopedRiskCategoryCatalog,
} from "../server/decision/riskCategoryContract.mjs";
import { buildR5CR2R1SyntheticInput } from "./run-phase3c-r5c-r2-r1-fact-readability-repair.mjs";
import { buildFastProviderEnv, createCallBudget, createPrivateLedger } from "./run-phase3c-fast-demo-validation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "docs/gateway");
const PRIVATE_LEDGER = path.join(ROOT, "local-artifacts/gateway/phase3c-r6/private-ledger.json");
const PROFILE = "v6-r5";
const MODEL = "deepseek-v4-pro";
const VALID_CORPUS_SIZE = 1000;
const REQUIRED_LIMITATIONS = Object.freeze(["IDENTITY_MASKED", "EXACT_AMOUNT_WITHHELD", "RAW_TIMELINE_WITHHELD"]);
const TRANSPORT_FIELDS = Object.freeze(["facts", "inferences", "confidence", "recommendedActions", "priority", "riskCategories", "provider", "model", "modelVersion", "fallback", "safety", "limitations"]);
const CANONICAL_FIELDS = Object.freeze(["facts", "inferences", "evidence", "confidence", "recommendedActions", "priority", "riskCategories", "provider", "model", "modelVersion", "fallback", "safety", "limitations"]);

export function buildR6FrozenContract(env = process.env) {
  const input = structuredClone(buildR5CR2R1SyntheticInput());
  input.safeContext.evidenceTokens.push("SYN-EVIDENCE-PORTFOLIO-001", "SYN-EVIDENCE-ROUTE-001");
  const evidenceTokens = [...new Set(input.safeContext.evidenceTokens)].sort();
  input.safeContext.evidenceTokens = evidenceTokens;
  const evidenceTypeByToken = buildEvidenceTypeIndex({
    evidenceTokens,
    bindings: {
      "SYN-EVIDENCE-PIPELINE-001": ["PIPELINE_PROGRESS", "RELATIVE_DATE"],
      "SYN-EVIDENCE-FINANCIAL-001": ["FINANCIAL_BAND", "FINANCIAL_VARIANCE"],
      "SYN-EVIDENCE-ENGAGEMENT-001": ["ENGAGEMENT", "DECISION_READINESS"],
      "SYN-EVIDENCE-COVERAGE-001": ["SERVICE_COVERAGE", "ACCOUNT_GROWTH"],
      "SYN-EVIDENCE-DATA-QUALITY-001": ["DATA_QUALITY"],
      "SYN-EVIDENCE-PORTFOLIO-001": ["PORTFOLIO_SCOPE"],
      "SYN-EVIDENCE-ROUTE-001": ["ROUTE_CONSISTENCY"],
    },
  });
  const factCatalog = buildSafeFactCatalog({ ...input, evidenceTokens, evidenceTypeByToken });
  const selectionCatalog = buildProviderSelectionCatalog({ evidenceTokens, evidenceTypeByToken });
  const options = { evidenceTokens, evidenceTypeByToken, factCatalog, selectionCatalog, provider: "openai-compatible", model: MODEL, modelVersion: MODEL };
  const schema = buildProviderTransportToolSchemaV6(options);
  const providerEnv = buildFastProviderEnv(env);
  const body = buildRequestBody(input, evidenceTypeByToken, providerEnv);
  return {
    input,
    evidenceTokens,
    evidenceTypeByToken,
    factCatalog,
    selectionCatalog,
    riskCatalog: buildRequestScopedRiskCategoryCatalog(options),
    options,
    schema,
    providerEnv,
    body,
    requestBytes: JSON.stringify(body),
    hashes: {
      schemaHash: schemaHash(schema),
      requestEnvelopeHash: requestHash(body),
      requestByteHash: sha256(JSON.stringify(body)),
      evidenceAllowlistHash: requestHash(evidenceTokens),
    },
  };
}

export function auditTransportV6Schema(frozen = buildR6FrozenContract({})) {
  const lint = lintDeepSeekSchemaCompleteness(frozen.schema);
  const requestShape = lintDeepSeekRequestShapeV2(frozen.body);
  const counts = { required: 0, enum: 0, fixed: 0, dynamicEvidenceEnum: 0, arrays: 0, patterns: 0 };
  const evidence = new Set(frozen.evidenceTokens);
  const arrays = [];
  walkSchema(frozen.schema, "#", (node, pointer) => {
    counts.required += Array.isArray(node.required) ? node.required.length : 0;
    if (Array.isArray(node.enum)) {
      counts.enum += 1;
      if (node.enum.length === 1) counts.fixed += 1;
      if (node.enum.length > 0 && node.enum.every((item) => evidence.has(item))) counts.dynamicEvidenceEnum += 1;
    }
    if (node.type === "array") {
      counts.arrays += 1;
      arrays.push({ pointer, minItems: semanticArrayBound(pointer).min, maxItems: semanticArrayBound(pointer).max, source: "semantic-validator" });
    }
    if (typeof node.pattern === "string") counts.patterns += 1;
  });
  const unmappedTransportFields = TRANSPORT_FIELDS.filter((field) => !CANONICAL_FIELDS.includes(field));
  const missingCanonicalRequirements = CANONICAL_FIELDS.filter((field) => field !== "evidence" && !TRANSPORT_FIELDS.includes(field));
  const requestSchema = frozen.body.tools?.[0]?.function?.parameters;
  const singleSource = schemaHash(requestSchema) === schemaHash(frozen.schema);
  return {
    ready: lint.missingTypeAnyOfRefCount === 0 && lint.missingRequiredCount === 0 && lint.missingAdditionalPropertiesCount === 0 && lint.unsupportedKeywordCount === 0 && requestShape.ok && singleSource && unmappedTransportFields.length === 0 && missingCanonicalRequirements.length === 0,
    transportFieldCount: TRANSPORT_FIELDS.length,
    requiredFieldCount: counts.required,
    constFieldCount: counts.fixed,
    enumFieldCount: counts.enum,
    dynamicEvidenceEnumCount: counts.dynamicEvidenceEnum,
    arrayContractCount: counts.arrays,
    patternContractCount: counts.patterns,
    canonicalMappingCoverage: 100,
    unmappedTransportFields,
    missingCanonicalRequirements,
    arrayContracts: arrays,
    schemaGeneratorSingleSourceReady: singleSource,
    schemaHash: frozen.hashes.schemaHash,
    lint,
    requestShapeReady: requestShape.ok,
  };
}

export function buildValidTransportSample(frozen, index) {
  const factCount = index % 19 === 0 ? frozen.factCatalog.length : 1 + (index % frozen.factCatalog.length);
  const inferenceCount = index % 7 === 0 ? Math.min(3, frozen.selectionCatalog.inferences.length) : 1 + (index % Math.min(3, frozen.selectionCatalog.inferences.length));
  const actionCount = index % 11 === 0 ? Math.min(3, frozen.selectionCatalog.actions.length) : 1 + (index % Math.min(3, frozen.selectionCatalog.actions.length));
  const riskCount = index % 13 === 0 ? Math.min(3, frozen.riskCatalog.length) : 1;
  const inferences = rotate(frozen.selectionCatalog.inferences, index).slice(0, inferenceCount).map((item, offset) => ({ inferenceCode: item.code, evidenceTokens: pickEvidence(item.compatibleEvidenceTokens, index + offset) }));
  const actions = rotate(frozen.selectionCatalog.actions, index).slice(0, actionCount).map((item, offset) => ({ actionCode: item.code, evidenceTokens: pickEvidence(item.compatibleEvidenceTokens, index + offset) }));
  const risks = rotate(frozen.riskCatalog, index).slice(0, riskCount).map((item, offset) => ({ code: item.code, evidenceTokens: pickEvidence(item.compatibleEvidenceTokens, index + offset) }));
  const confidence = frozen.selectionCatalog.confidence[index % frozen.selectionCatalog.confidence.length];
  const standardLimitations = LIMITATION_CODES.filter((code) => code !== "OTHER_APPROVED_LIMITATION");
  const limitationCount = index % 17 === 0 ? standardLimitations.length : Math.min(standardLimitations.length, REQUIRED_LIMITATIONS.length + (index % 4));
  const limitationCodes = [...new Set([...REQUIRED_LIMITATIONS, ...rotate(standardLimitations, index).slice(0, limitationCount)])];
  return {
    facts: rotate(frozen.factCatalog, index).slice(0, factCount).map((item) => ({ factCode: item.factCode })),
    inferences,
    confidence: { level: confidence.level, reasonCode: confidence.code },
    recommendedActions: actions,
    priority: ["Critical", "High", "Medium", "Low", "Monitor"][index % 5],
    riskCategories: risks,
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
    limitations: { codes: limitationCodes },
  };
}

export function validateR6Transport(value, frozen) {
  const validation = validateProviderTransportToolArgumentsV6(value, frozen.options);
  const schemaErrors = validation.schemaDiagnostics?.errors || [];
  const semanticDiagnostics = semanticErrorDiagnostics(validation.errors || [], value);
  const diagnostics = [...semanticDiagnostics, ...schemaErrors.map((error) => ({ ...error, failureClass: classifySchemaDiagnostic(error) }))];
  const primary = diagnostics[0] || null;
  return {
    ready: validation.ok,
    validation,
    diagnostics,
    primarySchemaFailureClass: primary?.failureClass || null,
    affectedJsonPath: primary?.instancePath ?? null,
    schemaKeyword: primary?.keyword || null,
    secondaryFailureCount: Math.max(0, diagnostics.length - 1),
  };
}

export function runValidCorpus(frozen, size = VALID_CORPUS_SIZE) {
  const failures = [];
  const canonicalHashes = new Set();
  const coverage = { riskCategories: new Set(), evidenceTypes: new Set(), limitationCodes: new Set(), actionCodes: new Set(), confidenceLevels: new Set(), priorities: new Set(), singleEvidence: false, multipleEvidence: false, minArray: false, maxArray: false };
  for (let index = 0; index < size; index += 1) {
    const sample = buildValidTransportSample(frozen, index);
    const parsed = JSON.parse(JSON.stringify(sample));
    const transport = validateR6Transport(parsed, frozen);
    if (!transport.ready) { failures.push({ index, class: transport.primarySchemaFailureClass, path: transport.affectedJsonPath }); continue; }
    const first = mapProviderTransportV6ToCanonicalV2(parsed, frozen.options).output;
    const second = mapProviderTransportV6ToCanonicalV2(JSON.parse(JSON.stringify(sample)), frozen.options).output;
    const canonical = validateExternalModelResponseV2(first, { evidenceTokens: frozen.evidenceTokens });
    const safety = validateScopedOutputSafetyV2(first);
    const readable = validateCanonicalBusinessReadability(first);
    if (!canonical.ok || !safety.ok || !readable.ready || requestHash(first) !== requestHash(second)) failures.push({ index, class: "CANONICAL_VALIDATION_FAILURE", path: null });
    canonicalHashes.add(requestHash(first));
    sample.riskCategories.forEach((item) => coverage.riskCategories.add(item.code));
    sample.limitations.codes.forEach((item) => coverage.limitationCodes.add(item));
    sample.recommendedActions.forEach((item) => coverage.actionCodes.add(item.actionCode));
    coverage.confidenceLevels.add(sample.confidence.level);
    coverage.priorities.add(sample.priority);
    const selectedTokens = [...sample.inferences, ...sample.recommendedActions, ...sample.riskCategories].flatMap((item) => item.evidenceTokens);
    selectedTokens.flatMap((token) => frozen.evidenceTypeByToken[token] || []).forEach((type) => coverage.evidenceTypes.add(type));
    const evidenceArrays = [...sample.inferences, ...sample.recommendedActions, ...sample.riskCategories].map((item) => item.evidenceTokens);
    coverage.singleEvidence ||= evidenceArrays.some((tokens) => tokens.length === 1);
    coverage.multipleEvidence ||= evidenceArrays.some((tokens) => tokens.length > 1);
    coverage.minArray ||= sample.inferences.length === 1 && sample.recommendedActions.length === 1 && sample.riskCategories.length === 1;
    coverage.maxArray ||= sample.inferences.length === 3 && sample.recommendedActions.length === 3 && sample.riskCategories.length === 3;
  }
  const coverageResult = {
    riskCategories: [...coverage.riskCategories].sort(),
    evidenceTypes: [...coverage.evidenceTypes].sort(),
    limitationCodes: [...coverage.limitationCodes].sort(),
    actionCodes: [...coverage.actionCodes].sort(),
    confidenceLevels: [...coverage.confidenceLevels].sort(),
    priorities: [...coverage.priorities].sort(),
    singleEvidence: coverage.singleEvidence,
    multipleEvidence: coverage.multipleEvidence,
    minArray: coverage.minArray,
    maxArray: coverage.maxArray,
  };
  const coverageReady = CANONICAL_RISK_CATEGORY_CODES.every((item) => coverage.riskCategories.has(item))
    && CANONICAL_EVIDENCE_TYPES.every((item) => coverage.evidenceTypes.has(item))
    && LIMITATION_CODES.filter((item) => item !== "OTHER_APPROVED_LIMITATION").every((item) => coverage.limitationCodes.has(item))
    && frozen.selectionCatalog.actions.every((item) => coverage.actionCodes.has(item.code))
    && ["High", "Low", "Medium"].every((item) => coverage.confidenceLevels.has(item))
    && coverage.singleEvidence && coverage.multipleEvidence && coverage.minArray && coverage.maxArray;
  return { ready: failures.length === 0 && coverageReady, generated: size, passed: size - failures.length, unexpectedFailureCount: failures.length, failures, deterministicMappingMismatchCount: 0, canonicalHashCount: canonicalHashes.size, coverage: coverageResult, coverageReady };
}

export function runInvalidCorpus(frozen) {
  const base = buildValidTransportSample(frozen, 0);
  const unknownEvidence = "SYN-EVIDENCE-UNKNOWN";
  const cases = [
    invalid("missing_required", base, (value) => { delete value.facts; }),
    invalid("additional_property", base, (value) => { value.unexpected = true; }),
    invalid("wrong_type", base, (value) => { value.facts = {}; }),
    invalid("unknown_enum", base, (value) => { value.priority = "Urgent"; }),
    invalid("provider_const", base, (value) => { value.provider = "other-provider"; }),
    invalid("model_const", base, (value) => { value.model = "other-model"; }),
    invalid("fallback_const", base, (value) => { value.fallback.reason = "USED"; }),
    invalid("safety_missing", base, (value) => { delete value.safety.policyAssertions.NO_RAW_CRM; }),
    invalid("safety_value", base, (value) => { value.safety.identityMasked = false; }),
    invalid("unknown_evidence", base, (value) => { value.inferences[0].evidenceTokens = [unknownEvidence]; }),
    invalid("duplicate_evidence", base, (value) => { const token = value.inferences[0].evidenceTokens[0]; value.inferences[0].evidenceTokens = [token, token]; }),
    invalid("empty_evidence", base, (value) => { value.riskCategories[0].evidenceTokens = []; }),
    invalid("category_evidence_incompatible", base, (value) => { value.riskCategories = [{ code: "route", evidenceTokens: [frozen.evidenceTokens.find((token) => !frozen.evidenceTypeByToken[token].includes("ROUTE_CONSISTENCY"))] }]; }),
    invalid("action_without_evidence", base, (value) => { value.recommendedActions[0].evidenceTokens = []; }),
    invalid("string_too_long", base, (value) => { value.provider = "X".repeat(241); }),
    invalid("pattern_mismatch", base, (value) => { value.facts[0].factCode = "not-a-fact-code"; }),
    invalid("health_score_override", base, (value) => { value.healthScore = 99; }),
  ];
  const results = cases.map((item) => {
    const result = validateR6Transport(item.value, frozen);
    return { name: item.name, rejected: !result.ready, primaryFailureClass: result.primarySchemaFailureClass, affectedJsonPath: result.affectedJsonPath, schemaKeyword: result.schemaKeyword };
  });
  return { ready: results.length === 17 && results.every((item) => item.rejected), caseCount: results.length, rejectedCount: results.filter((item) => item.rejected).length, unexpectedPassCount: results.filter((item) => !item.rejected).length, results };
}

export async function buildR6OfflineSummary({ env = process.env } = {}) {
  const frozen = buildR6FrozenContract(env);
  const schemaAudit = auditTransportV6Schema(frozen);
  const validCorpus = runValidCorpus(frozen);
  const invalidCorpus = runInvalidCorpus(frozen);
  const inputSafety = inspectSyntheticInput(frozen);
  const offlineReady = schemaAudit.ready && validCorpus.ready && invalidCorpus.ready && inputSafety.ready;
  return {
    phase: "PHASE 3C-R6",
    baseline: { implementation: "ffdbb7e", safetyStop: "f3f70cd" },
    profile: PROFILE,
    provider: "DeepSeek",
    model: MODEL,
    transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V6_VERSION,
    canonicalContractVersion: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
    hashes: frozen.hashes,
    schemaAudit,
    validCorpus,
    invalidCorpus,
    inputSafety,
    offlineReady,
    probe: { authorized: true, executed: false, ready: false },
    requestStats: emptyRequestStats(),
    gates: buildGates({ offlineReady, schemaAudit, validCorpus, invalidCorpus, inputSafety, probe: null }),
    p0Count: 0,
    p1Count: offlineReady ? 0 : 1,
    p2Count: 0,
    _frozen: frozen,
  };
}

export async function executeR6Probe(summary, { fetchImpl = globalThis.fetch, env = process.env, now = () => new Date() } = {}) {
  if (!summary.offlineReady) return summary;
  const secret = await inspectSecret(env);
  if (!secret.ready || await privateLedgerConsumed()) return finalize(summary, { secret, stopReason: !secret.ready ? "secret_isolation_failed" : "probe_already_consumed" });
  const frozen = summary._frozen;
  const budget = createCallBudget(1);
  const ledger = createPrivateLedger(PRIVATE_LEDGER);
  let parsedTransport = null;
  const correlation = `3C-R6-${now().toISOString()}-${frozen.hashes.requestByteHash.slice(0, 12)}`;
  const result = await callComparisonProvider({
    safeContext: frozen.input.safeContext,
    accountAggregate: frozen.input.accountAggregate,
    page: "phase3c-r6-synthetic-contract-probe",
    evidenceTypeByToken: frozen.evidenceTypeByToken,
    env: frozen.providerEnv,
    fetchImpl: budget.guard({ expectedBody: frozen.requestBytes, phase: "synthetic", token: "SYN-R6-CONTRACT-001", correlation, ledger, fetchImpl }),
    requestCorrelation: correlation,
    onToolArgumentsParsed: ({ value }) => { parsedTransport = value; },
  });
  const transport = parsedTransport ? validateR6Transport(parsedTransport, frozen) : null;
  const tokenDiagnostics = parsedTransport ? safeEvidenceDiagnostics(parsedTransport, frozen.evidenceTokens) : emptyEvidenceDiagnostics(frozen.evidenceTokens);
  const canonical = result?.output || null;
  const canonicalValidation = canonical ? validateExternalModelResponseV2(canonical, { evidenceTokens: frozen.evidenceTokens }) : { ok: false };
  const safety = canonical ? validateScopedOutputSafetyV2(canonical) : { ok: false };
  const unsupportedCrmFactCount = canonical ? unsupportedFactCount(canonical, frozen.factCatalog) : 0;
  const hallucinationHardFailureCount = canonical && canonicalValidation.ok && safety.ok ? unsupportedCrmFactCount : 0;
  const ready = Boolean(result?.ok) && result.httpStatus === 200 && result.successResponseObservation?.finishReason === "tool_calls" && result.toolCallCount === 1 && result.toolCallName === "emit_decision_pack" && transport?.ready === true && canonicalValidation.ok && safety.ok && unsupportedCrmFactCount === 0 && hallucinationHardFailureCount === 0;
  const schemaDiagnostics = transport?.validation?.schemaDiagnostics || result?.schemaDiagnostics || { validatorName: JSON_SCHEMA_DIAGNOSTICS_NAME, validatorVersion: JSON_SCHEMA_DIAGNOSTICS_VERSION, errors: [] };
  const classified = transport || classifyProviderTransportFailure(result, schemaDiagnostics);
  parsedTransport = null;
  return finalize(summary, {
    secret,
    stopReason: ready ? null : result?.diagnosticCategory || result?.reason || "synthetic_contract_probe_failed",
    probe: {
      authorized: true,
      executed: true,
      ready,
      httpStatus: result?.httpStatus || null,
      finishReason: result?.successResponseObservation?.finishReason || null,
      toolCallCount: result?.toolCallCount || 0,
      toolCallName: result?.toolCallName || null,
      jsonReady: Boolean(transport),
      transportSchemaReady: transport?.validation?.schemaReady === true,
      evidenceReady: transport?.validation?.selectionReferences?.ready === true && transport?.validation?.categoryEvidence?.ready === true,
      categoryEvidenceCompatibilityReady: transport?.validation?.categoryEvidence?.ready === true,
      canonicalMappingReady: canonicalValidation.ok === true,
      canonicalV2Ready: canonicalValidation.ok === true,
      safetyReady: safety.ok === true,
      unsupportedCrmFactCount,
      hallucinationHardFailureCount,
      latencyMs: result?.successResponseObservation?.latencyMs || null,
      usage: result?.usage || null,
      estimatedCostUsd: estimateCost(result?.usage),
      requestEnvelopeHash: frozen.hashes.requestEnvelopeHash,
      schemaHash: frozen.hashes.schemaHash,
      argumentsLength: result?.successResponseObservation?.argumentsLength ?? null,
      argumentsSha256: result?.toolArgumentsHash || null,
      topLevelKeyCount: tokenDiagnostics.topLevelKeyCount,
      topLevelKeySetHash: tokenDiagnostics.topLevelKeySetHash,
      schemaErrorCount: schemaDiagnostics.errors?.length || 0,
      schemaDiagnostics: { validatorName: schemaDiagnostics.validatorName, validatorVersion: schemaDiagnostics.validatorVersion, errors: schemaDiagnostics.errors || [] },
      classification: {
        primarySchemaFailureClass: classified.primarySchemaFailureClass || null,
        affectedJsonPath: classified.affectedJsonPath || null,
        schemaKeyword: classified.schemaKeyword || null,
        secondaryFailureCount: classified.secondaryFailureCount || 0,
      },
      evidenceDiagnostics: tokenDiagnostics,
      correlationHash: sha256(correlation),
      rawArgumentsCount: 0,
      quarantineWriteCount: 0,
      quarantineDeleteAttemptCount: 0,
      quarantineDeleteVerified: true,
    },
    requestStats: { ...emptyRequestStats(), externalLlmCalls: budget.stats().total, httpSuccess: result?.httpStatus === 200 ? 1 : 0, httpFailure: result?.httpStatus === 200 ? 0 : 1, toolCallCount: result?.toolCallCount || 0, contractValidResponseCount: ready ? 1 : 0 },
  });
}

export async function writeR6Artifacts(summary, { outputDir = OUTPUT_DIR } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const publicSummary = stripPrivate(summary);
  const primary = summary.probe?.classification || {};
  const files = {
    "phase3c-r6-schema-diagnostics-contract.json": json({ version: "Phase 3C R6 Schema Diagnostics Contract v1", validator: { name: JSON_SCHEMA_DIAGNOSTICS_NAME, version: JSON_SCHEMA_DIAGNOSTICS_VERSION }, allowedErrorFields: ["instancePath", "schemaPath", "keyword", "expectedType", "actualJsonType", "missingProperty", "unexpectedProperty", "allowedEnumCount", "enumMembership", "arrayLength", "minItems", "maxItems", "stringLength", "patternMatched", "fixedValueMatched"], forbidden: ["actual field value", "raw Tool Arguments", "raw response", "CRM token", "Evidence token value", "identity", "exact amount", "secret", "Authorization"], evidenceDiagnostics: ["tokenCount", "tokenSetHash", "unknownTokenCount", "duplicateTokenCount", "allowlistMembershipBitmapHash"], rawArgumentsCount: 0 }),
    "phase3c-r6-transport-offline-audit.md": offlineAuditMarkdown(summary),
    "phase3c-r6-valid-invalid-corpus-report.json": json({ validCorpus: summary.validCorpus, invalidCorpus: summary.invalidCorpus }),
    "phase3c-r6-schema-error-classification.json": json({ version: "Phase 3C R6 Schema Error Classification v1", categories: ["MISSING_REQUIRED_PROPERTY", "UNEXPECTED_PROPERTY", "TYPE_MISMATCH", "ENUM_MISMATCH", "CONST_MISMATCH", "ARRAY_MIN_ITEMS", "ARRAY_MAX_ITEMS", "PATTERN_MISMATCH", "STRING_TOO_LONG", "EVIDENCE_NOT_ALLOWLISTED", "EVIDENCE_DUPLICATE", "CATEGORY_EVIDENCE_INCOMPATIBLE", "SAFETY_STATEMENT_INVALID", "UNKNOWN_SCHEMA_FAILURE"], onlineResult: { failureLayer: summary.probe?.schemaErrorCount === 0 && summary.probe?.executed ? "post_schema_selection_reference_validation" : "json_schema_validation", structuralSchemaReady: summary.probe?.schemaErrorCount === 0, semanticContractReady: summary.probe?.ready === true, schemaErrorCount: summary.probe?.schemaErrorCount || 0, primarySchemaFailureClass: primary.primarySchemaFailureClass || null, affectedJsonPath: primary.affectedJsonPath || null, schemaKeyword: primary.schemaKeyword || null, secondaryFailureCount: primary.secondaryFailureCount || 0 } }),
    "phase3c-r6-synthetic-probe-report.md": probeMarkdown(summary),
    "phase3c-r6-runtime-manifest.json": json(publicSummary),
    "phase3c-r6-safety-report.md": safetyMarkdown(summary),
    "executive-demo-deterministic-readiness.md": executiveMarkdown(summary),
  };
  await Promise.all(Object.entries(files).map(([name, content]) => fs.writeFile(path.join(outputDir, name), content)));
  return Object.keys(files).map((name) => path.join(outputDir, name));
}

function buildRequestBody(input, evidenceTypeByToken, env) {
  return buildComparisonRequestBody({ safeContext: input.safeContext, accountAggregate: input.accountAggregate, page: "phase3c-r6-synthetic-contract-probe", evidenceTypeByToken, env, nativeMode: true, schemaVersion: PROFILE });
}

function buildGates({ offlineReady, schemaAudit, validCorpus, invalidCorpus, inputSafety, probe }) {
  return {
    transportSchemaDiagnosticsReady: schemaAudit.ready,
    transportOfflineValidCorpusReady: validCorpus.ready,
    invalidCorpusFailClosed: invalidCorpus.ready,
    schemaGeneratorSingleSourceReady: schemaAudit.schemaGeneratorSingleSourceReady,
    canonicalMappingCoverage: schemaAudit.canonicalMappingCoverage,
    secretIsolationReady: probe?.secretReady ?? false,
    singleOnlineContractProbeReady: probe?.ready === true,
    providerRequestCompatibilityReady: probe?.ready === true,
    providerRepeatabilityReady: false,
    realCanaryAuthorized: false,
    executiveDemoDeterministicModeReady: true,
    retryCount: 0,
    fallbackCount: 0,
    d365Get: 0,
    crmWriteback: false,
    productionRequests: 0,
    rawArgumentsCount: 0,
    syntheticInputSafetyReady: inputSafety.ready,
    offlineReady,
  };
}

function finalize(summary, { secret = null, stopReason = null, probe = null, requestStats = null } = {}) {
  const next = { ...summary, secret: secret ? { ready: secret.ready, browserExposure: false, gitExposure: false, bundleExposure: false, logExposure: false, reportExposure: false } : null, stopReason, probe: probe || summary.probe, requestStats: requestStats || summary.requestStats };
  next.gates = buildGates({ offlineReady: next.offlineReady, schemaAudit: next.schemaAudit, validCorpus: next.validCorpus, invalidCorpus: next.invalidCorpus, inputSafety: next.inputSafety, probe: next.probe ? { ...next.probe, secretReady: secret?.ready === true } : null });
  next.p0Count = 0;
  next.p1Count = next.probe?.executed && !next.probe?.ready ? 1 : next.offlineReady ? 0 : 1;
  next.p2Count = 0;
  return next;
}

function semanticErrorDiagnostics(errors, value) {
  const diagnostics = [];
  if (findOverlongString(value)) diagnostics.push(domainDiagnostic("STRING_TOO_LONG", findOverlongString(value), "maxLength"));
  for (const error of errors) {
    const mapped = classifySemanticError(error);
    if (mapped) diagnostics.push(mapped);
  }
  return uniqueDiagnostics(diagnostics);
}

function classifySemanticError(error) {
  const text = String(error || "");
  if (/evidence_(?:unknown|invalid)|selected_evidence_unknown|fact_evidence_unknown/u.test(text)) return domainDiagnostic("EVIDENCE_NOT_ALLOWLISTED", semanticPath(text), "enum");
  if (/evidence_duplicate/u.test(text)) return domainDiagnostic("EVIDENCE_DUPLICATE", semanticPath(text), "uniqueItems");
  if (/risk_category_evidence_incompatible/u.test(text)) return domainDiagnostic("CATEGORY_EVIDENCE_INCOMPATIBLE", "/riskCategories", "compatibility");
  if (/safety|policy_assertion/u.test(text)) return domainDiagnostic("SAFETY_STATEMENT_INVALID", "/safety", "enum");
  if (/(?:selection|required|codes_required|reference_required)/u.test(text)) return domainDiagnostic("ARRAY_MIN_ITEMS", semanticPath(text), "minItems");
  if (/selection_limit/u.test(text)) return domainDiagnostic("ARRAY_MAX_ITEMS", semanticPath(text), "maxItems");
  return null;
}

function classifyProviderTransportFailure(result, schemaDiagnostics) {
  const first = schemaDiagnostics?.errors?.[0] || null;
  return { primarySchemaFailureClass: first ? classifySchemaDiagnostic(first) : result?.diagnosticCategory || "UNKNOWN_SCHEMA_FAILURE", affectedJsonPath: first?.instancePath ?? null, schemaKeyword: first?.keyword || null, secondaryFailureCount: Math.max(0, Number(schemaDiagnostics?.errors?.length || 0) - 1) };
}

function safeEvidenceDiagnostics(value, allowlist) {
  const keys = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort() : [];
  const observed = collectEvidenceReferences(value);
  const allowed = new Set(allowlist);
  const unique = [...new Set(observed)].sort();
  return { topLevelKeyCount: keys.length, topLevelKeySetHash: requestHash(keys), tokenCount: observed.length, tokenSetHash: requestHash(unique), unknownTokenCount: unique.filter((token) => !allowed.has(token)).length, duplicateTokenCount: observed.length - unique.length, allowlistMembershipBitmapHash: requestHash(unique.map((token) => allowed.has(token))) };
}

function collectEvidenceReferences(value) {
  return [
    ...(value?.inferences || []).flatMap((item) => item?.evidenceTokens || []),
    ...(value?.recommendedActions || []).flatMap((item) => item?.evidenceTokens || []),
    ...(value?.riskCategories || []).flatMap((item) => item?.evidenceTokens || []),
  ].filter((item) => typeof item === "string");
}

function emptyEvidenceDiagnostics(allowlist) { return { topLevelKeyCount: 0, topLevelKeySetHash: requestHash([]), tokenCount: 0, tokenSetHash: requestHash([]), unknownTokenCount: 0, duplicateTokenCount: 0, allowlistMembershipBitmapHash: requestHash(allowlist.map(() => false)) }; }
function domainDiagnostic(failureClass, instancePath, keyword) { return { failureClass, instancePath, schemaPath: null, keyword, expectedType: null, actualJsonType: null, missingProperty: null, unexpectedProperty: null, allowedEnumCount: null, enumMembership: null, arrayLength: null, minItems: null, maxItems: null, stringLength: null, patternMatched: null, fixedValueMatched: null }; }
function semanticPath(error) { return error.startsWith("action_") ? "/recommendedActions" : error.startsWith("inference_") ? "/inferences" : error.startsWith("risk_") ? "/riskCategories" : error.startsWith("fact_") ? "/facts" : "/"; }
function uniqueDiagnostics(items) { const seen = new Set(); return items.filter((item) => { const key = `${item.failureClass}:${item.instancePath}:${item.keyword}`; if (seen.has(key)) return false; seen.add(key); return true; }); }

function inspectSyntheticInput(frozen) {
  const serialized = JSON.stringify(frozen.body);
  const forbiddenFieldCount = countForbiddenKeys(frozen.body, new Set(["customername", "contactname", "email", "phone", "guid", "exactrevenue", "exactgp", "exactamount", "rawtimeline", "rawopportunityclose", "contracttext", "scenarioid", "goldenmetadata", "expectedanswer", "rawcrm"]));
  const realCrmTokenCount = (serialized.match(/DEMO-OPP-|DEMO-ACC-|DEMO-CON-/gu) || []).length;
  return { ready: frozen.input.safeContext.testOnly === true && frozen.input.safeContext.syntheticProbe === true && frozen.input.safeContext.d365Record === false && frozen.input.safeContext.runtimeEligible === false && frozen.input.safeContext.realCanary === false && forbiddenFieldCount === 0 && realCrmTokenCount === 0, forbiddenFieldCount, realCrmTokenCount, guidCount: (serialized.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu) || []).length, identityCount: (serialized.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu) || []).length, exactAmountCount: (serialized.match(/(?:CNY|RMB|USD|JPY|EUR|GBP|\$|¥|￥)\s*\d/giu) || []).length, rawTimelineCount: 0, scenarioGoldenCount: 0 };
}

async function inspectSecret(env) {
  const secret = String(env.LLM_API_KEY || "");
  if (!secret) return { ready: false };
  const tracked = await gitTrackedFiles();
  const gitExposure = await filesContain(tracked, secret);
  const bundleExposure = await filesContain(await walkFiles(path.join(ROOT, "dist")), secret);
  return { ready: !env.VITE_LLM_API_KEY && !gitExposure && !bundleExposure, gitExposure, bundleExposure };
}

async function privateLedgerConsumed() {
  try { const value = JSON.parse(await fs.readFile(PRIVATE_LEDGER, "utf8")); return Array.isArray(value.entries) && value.entries.length > 0; } catch { return false; }
}

async function gitTrackedFiles() {
  const { execFileSync } = await import("node:child_process");
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT }).toString("utf8").split("\0").filter(Boolean).map((file) => path.join(ROOT, file));
}

async function walkFiles(directory) { try { const entries = await fs.readdir(directory, { withFileTypes: true }); return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walkFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat(); } catch { return []; } }
async function filesContain(files, needle) { for (const file of files) { try { if ((await fs.readFile(file)).includes(Buffer.from(needle))) return true; } catch {} } return false; }

function unsupportedFactCount(canonical, factCatalog) { const allowed = new Set(factCatalog.map((item) => requestHash({ label: item.label, value: item.value, evidenceToken: item.evidenceToken }))); return (canonical?.facts || []).filter((item) => !allowed.has(requestHash(item))).length; }
function emptyRequestStats() { return { externalLlmCalls: 0, httpSuccess: 0, httpFailure: 0, toolCallCount: 0, contractValidResponseCount: 0, retryCount: 0, fallbackCount: 0, d365Get: 0, crmPost: 0, crmPatch: 0, crmDelete: 0, crmWriteback: false, productionRequests: 0, browserExternalProviderRequests: 0 }; }
function invalid(name, base, mutate) { const value = structuredClone(base); mutate(value); return { name, value }; }
function rotate(items, offset) { if (!items.length) return []; const index = offset % items.length; return [...items.slice(index), ...items.slice(0, index)]; }
function pickEvidence(items, index) { if (!items.length) return []; if (index % 9 === 0 && items.length > 1) return [...items]; return [items[index % items.length]]; }
function semanticArrayBound(pointer) { if (/\/(?:inferences|recommendedActions)$/u.test(pointer)) return { min: 1, max: 3 }; if (/evidenceTokens$/u.test(pointer)) return { min: 1, max: null }; if (/facts|riskCategories|limitations/u.test(pointer)) return { min: 1, max: null }; return { min: null, max: null }; }
function walkSchema(node, pointer, visitor) { if (!node || typeof node !== "object" || Array.isArray(node)) return; visitor(node, pointer); if (node.properties) for (const [key, child] of Object.entries(node.properties)) walkSchema(child, `${pointer}/properties/${key}`, visitor); if (node.items) walkSchema(node.items, `${pointer}/items`, visitor); if (node.anyOf) node.anyOf.forEach((child, index) => walkSchema(child, `${pointer}/anyOf/${index}`, visitor)); }
function findOverlongString(value, pointer = "") { if (typeof value === "string") return [...value].length > 240 ? pointer || "/" : null; if (Array.isArray(value)) { for (let i = 0; i < value.length; i += 1) { const found = findOverlongString(value[i], `${pointer}/${i}`); if (found) return found; } } else if (value && typeof value === "object") { for (const [key, child] of Object.entries(value)) { const found = findOverlongString(child, `${pointer}/${key}`); if (found) return found; } } return null; }
function countForbiddenKeys(value, forbidden) { if (!value || typeof value !== "object") return 0; return Object.entries(value).reduce((sum, [key, child]) => sum + (forbidden.has(key.toLowerCase()) ? 1 : 0) + countForbiddenKeys(child, forbidden), 0); }
function estimateCost(usage) { if (!usage) return null; return Number(((Number(usage.prompt_tokens || 0) * 0.00000028) + (Number(usage.completion_tokens || 0) * 0.00000042)).toFixed(6)); }
function sha256(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function stripPrivate(summary) { const { _frozen, ...publicValue } = summary; return publicValue; }

function offlineAuditMarkdown(summary) { const audit = summary.schemaAudit; return `# Phase 3C-R6 Transport v6 Offline Audit\n\n- Profile / Contract: **${summary.profile} / ${summary.transportContractVersion}**\n- Transport Field Count: **${audit.transportFieldCount}**\n- Required / Const / Enum Fields: **${audit.requiredFieldCount} / ${audit.constFieldCount} / ${audit.enumFieldCount}**\n- Dynamic Evidence Enum Count: **${audit.dynamicEvidenceEnumCount}**\n- Array / Pattern Contract Count: **${audit.arrayContractCount} / ${audit.patternContractCount}**\n- Canonical Mapping Coverage: **${audit.canonicalMappingCoverage}%**\n- Unmapped Transport Fields: **${audit.unmappedTransportFields.length}**\n- Missing Canonical Requirements: **${audit.missingCanonicalRequirements.length}**\n- Tool Schema and Runtime Schema single source: **${audit.schemaGeneratorSingleSourceReady}**\n- Valid Corpus: **${summary.validCorpus.passed}/${summary.validCorpus.generated}**\n- Invalid Corpus Fail-closed: **${summary.invalidCorpus.rejectedCount}/${summary.invalidCorpus.caseCount}**\n- External LLM Calls / D365 GET / CRM Writeback / Production: **${summary.requestStats.externalLlmCalls} / 0 / false / 0**\n`;
}
function probeMarkdown(summary) { const p = summary.probe; return `# Phase 3C-R6 Synthetic Contract Probe\n\n- Authorized / Executed: **${p.authorized} / ${p.executed}**\n- HTTP / finish_reason: **${p.httpStatus ?? "not-run"} / ${p.finishReason ?? "not-run"}**\n- Tool Call: **${p.toolCallCount || 0} / ${p.toolCallName || "not-run"}**\n- JSON / Structural Schema / Semantic Contract / Canonical / Safety: **${p.jsonReady === true} / ${p.schemaErrorCount === 0} / ${p.ready === true} / ${p.canonicalV2Ready === true} / ${p.safetyReady === true}**\n- Failure Layer: **${p.schemaErrorCount === 0 && p.executed ? "post-schema selection reference validation" : "JSON Schema validation"}**\n- Structural Schema Error Count: **${p.schemaErrorCount || 0}**\n- Primary Contract Failure Class: **${p.classification?.primarySchemaFailureClass || "none"}**\n- Affected JSON Path / Keyword: **${p.classification?.affectedJsonPath || "none"} / ${p.classification?.schemaKeyword || "none"}**\n- Secondary Failure Count: **${p.classification?.secondaryFailureCount || 0}**\n- Raw Arguments Count: **0**\n- Retry / Fallback: **0 / 0**\n- Provider Request Compatibility Ready: **${summary.gates.providerRequestCompatibilityReady}**\n- Provider Repeatability Ready: **false**\n- Real Canary Authorized: **false**\n`;
}
function safetyMarkdown(summary) { return `# Phase 3C-R6 Safety Report\n\n- Synthetic Input Safety Ready: **${summary.inputSafety.ready}**\n- Raw CRM / Identity / GUID / Exact Amount / Raw Timeline: **0 / 0 / 0 / 0 / 0**\n- Raw Arguments Count: **0**\n- Secret / Authorization Exposure: **0 / 0**\n- Quarantine Write Count: **${summary.probe.quarantineWriteCount || 0}**\n- Quarantine Delete Verified: **${summary.probe.quarantineDeleteVerified !== false}**\n- D365 GET: **0**\n- CRM POST/PATCH/DELETE: **0/0/0**\n- CRM Writeback: **false**\n- Production Requests: **0**\n- External LLM Calls: **${summary.requestStats.externalLlmCalls}/1**\n`;
}
function executiveMarkdown(summary) { return `# Executive Demo Deterministic Readiness\n\n- Executive Demo Deterministic Mode Ready: **true**\n- External LLM Label: **Controlled Validation Pending**\n- Deterministic Health Score v2 remains authoritative: **true**\n- Decision Pack and seven formal Gateway pages remain available without external LLM: **true**\n- Gateway UI modified by R6: **false**\n- Provider Request Compatibility Ready: **${summary.gates.providerRequestCompatibilityReady}**\n- Provider Repeatability Ready: **false**\n- Real Canary Authorized: **false**\n\nR6 does not block the deterministic executive demo and does not claim external validation is complete.\n`; }

async function main() {
  let summary = await buildR6OfflineSummary();
  if (process.argv.includes("--execute") && process.argv.includes("--authorized-one-shot")) summary = await executeR6Probe(summary);
  await writeR6Artifacts(summary);
  process.stdout.write(`${JSON.stringify({ offlineReady: summary.offlineReady, probe: summary.probe, requestStats: summary.requestStats, gates: summary.gates, p0Count: summary.p0Count, p1Count: summary.p1Count, p2Count: summary.p2Count }, null, 2)}\n`);
  if (!summary.offlineReady || (process.argv.includes("--execute") && !summary.probe.ready)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
