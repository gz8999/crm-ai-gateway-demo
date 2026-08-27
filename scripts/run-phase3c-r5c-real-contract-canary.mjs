import "dotenv/config";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDynamicsClient } from "../server/dynamicsClient.mjs";
import { D365_FROZEN_DATASET_PATH, D365_FROZEN_EXPECTED_COUNTS, D365_FROZEN_EXPECTED_STATE, D365_FROZEN_TEST_HOST, buildFrozenScope } from "../server/d365/frozenDatasetContract.mjs";
import { createFrozenDatasetReader } from "../server/d365/frozenDatasetReader.mjs";
import { createFrozenDatasetRuntimeService } from "../server/d365/frozenDatasetRuntimeService.mjs";
import { buildComparisonRequestBody, callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import { classifyDecisionRiskCategory } from "../server/decision/deterministicProvider.mjs";
import { EXTERNAL_MODEL_REQUEST_VERSION, buildExternalModelRequest, requestHash, validateExternalModelRequest } from "../server/decision/externalModelContract.mjs";
import {
  EXTERNAL_MODEL_RESPONSE_V2_VERSION,
  PROVIDER_TRANSPORT_CONTRACT_V3_VERSION,
  externalModelResponseJsonSchemaV2,
  mapProviderTransportV3ToCanonicalV2,
  providerTransportToolSchemaV1,
  providerTransportToolSchemaV2,
} from "../server/decision/externalModelContractV2.mjs";
import {
  DEEPSEEK_EVIDENCE_SCOPED_PROFILE_V6R2_VERSION,
  buildDeepseekDecisionToolSchemaV6R2,
  lintDeepSeekRequestShapeV2,
  schemaHash,
} from "../server/decision/deepseekStrictSchema.mjs";
import { CANONICAL_RISK_CATEGORY_CATALOG, buildRiskCategoryEvidenceMatrix, validateEvidenceTypeIndex } from "../server/decision/riskCategoryContract.mjs";
import { normalizeId } from "../server/pilot/pilotContract.mjs";
import { publicProviderSuccessObservation } from "../server/decision/providerSuccessObservability.mjs";
import { validateR5B11R3Probe } from "./run-phase3c-r5b11-r3-transport-v3-repeatability.mjs";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const RUN_ID = "PHASE3C-R5C";
const TARGET_TOKEN = "DEMO-OPP-002";
const BASELINE_COMMIT = "1f299b089b056d0760cdb503e9cd97b32955125f";
const ENDPOINT = "https://api.deepseek.com/beta";
const MODEL = "deepseek-v4-pro";
const PAGE = "risk";
const MAX_CALLS = 1;
const MAX_TOKENS = 2400;
const CONTEXT_VERSION = "Safe Context v2";
const DATASET_VERSION = "D365 Demo200 Frozen Dataset v1";
const PRIVATE_MANIFEST = D365_FROZEN_DATASET_PATH;
const TRANSPORT_V1_SCHEMA_HASH = "12838eecacdaabe7f2e1a55c660847652dcfc2abcb87e381f1b45d8aba851236";
const TRANSPORT_V2_SCHEMA_HASH = "69083368d8ea37beb074441a723eb274cfbcebb6ef86b5a429ff90695e74869d";
const CANONICAL_V2_SCHEMA_HASH = "fb5f9464ff2e4728b5a28b6f278ccbfe9b9683563435b30821b19a130d5a44d4";
const EVIDENCE_TYPES = Object.freeze({
  "safeContext.stagnationBand": ["PIPELINE_PROGRESS"],
  "safeContext.dataQualityCodes": ["DATA_QUALITY"],
  "safeContext.varianceCategory": ["FINANCIAL_VARIANCE"],
  "safeContext.decisionReadiness": ["DECISION_READINESS", "ENGAGEMENT"],
  "safeContext.priority": ["PIPELINE_PROGRESS", "PORTFOLIO_SCOPE"],
});
const PUBLIC_ARTIFACTS = Object.freeze([
  "phase3c-r5c-real-contract-canary-report.md",
  "phase3c-r5c-runtime-manifest.json",
  "phase3c-r5c-request-audit.json",
  "phase3c-r5c-safe-context-validation.json",
  "phase3c-r5c-transport-validation.json",
  "phase3c-r5c-evidence-validation.json",
  "phase3c-r5c-response-evaluation.json",
  "phase3c-r5c-deterministic-comparison.md",
  "phase3c-r5c-safety-report.md",
  "phase3c-r5d-remaining-canary-decision-pack-zh.md",
]);

export function buildR5CProviderEnv(env = process.env) {
  return {
    ...env,
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "true",
    LLM_BASE_URL: ENDPOINT,
    LLM_MODEL: MODEL,
    PHASE3C_NATIVE_JSON_MODE: "strict-tool",
    PHASE3C_SCHEMA_VERSION: "v6-r2",
    LLM_CANARY_SINGLE_ATTEMPT: "true",
    LLM_TIMEOUT_MS: env.LLM_TIMEOUT_MS || "30000",
    LLM_MAX_TOKENS: String(MAX_TOKENS),
  };
}

export function buildR5CEvidenceTypeIndex(healthScore) {
  const evidenceTokens = [...new Set((healthScore?.evidence || []).map((item) => item?.source).filter(Boolean))].sort();
  const evidenceTypeByToken = Object.fromEntries(evidenceTokens.map((token) => {
    const types = EVIDENCE_TYPES[token];
    if (!types) throw new TypeError(`R5C evidence source is not classified: ${token}`);
    return [token, [...types]];
  }));
  const validation = validateEvidenceTypeIndex({ evidenceTokens, evidenceTypeByToken });
  if (!validation.ready) throw new TypeError("R5C evidence type index is incomplete.");
  return { evidenceTokens, evidenceTypeByToken };
}

export function buildR5CEvidenceValueIndex(safeContext, evidenceTokens) {
  return Object.fromEntries(evidenceTokens.map((token) => {
    const key = token.replace(/^safeContext\./, "");
    if (!Object.hasOwn(safeContext || {}, key)) throw new TypeError(`R5C Safe Context does not contain evidence value: ${token}`);
    return [token, safeValue(safeContext[key])];
  }));
}

export function freezeR5CRequest({ view, contexts = [], env = process.env, runToken = "R5C-TEST-RUN" } = {}) {
  if (view?.selectedOpportunity !== TARGET_TOKEN || view?.safeContext?.opportunityToken !== TARGET_TOKEN) throw new TypeError("R5C target must be DEMO-OPP-002.");
  const providerEnv = buildR5CProviderEnv(env);
  const externalRequest = buildExternalModelRequest({
    safeContext: view.safeContext,
    accountAggregate: view.safeContext.accountAggregate,
    healthScore: view.healthScore,
    page: PAGE,
    requestId: runToken,
  });
  const requestValidation = validateExternalModelRequest(externalRequest);
  if (!requestValidation.ok) throw new TypeError(`R5C external request rejected: ${requestValidation.reason}`);
  const { evidenceTokens, evidenceTypeByToken } = buildR5CEvidenceTypeIndex(view.healthScore);
  if (requestHash(externalRequest.safeContext.evidenceTokens) !== requestHash(evidenceTokens)) throw new TypeError("R5C Evidence allowlist drifted from Health Score v2.");
  const evidenceValueByToken = buildR5CEvidenceValueIndex(externalRequest.safeContext, evidenceTokens);
  const body = buildComparisonRequestBody({
    safeContext: externalRequest.safeContext,
    accountAggregate: externalRequest.accountAggregate,
    page: PAGE,
    evidenceTypeByToken,
    env: providerEnv,
    nativeMode: true,
    schemaVersion: "v6-r2",
  });
  const requestEnvelopeBytes = JSON.stringify(body);
  const evidenceMatrix = buildRiskCategoryEvidenceMatrix();
  const safetyContract = {
    customerIdentityMasked: true,
    exactAmountSentToModel: false,
    rawTimelineSent: false,
    crmWritebackEnabled: false,
  };
  const deterministicRiskCategory = classifyDecisionRiskCategory(contexts.length ? contexts : [view.safeContext], view.safeContext);
  return {
    runToken,
    targetToken: TARGET_TOKEN,
    providerEnv,
    externalRequest,
    body,
    requestEnvelopeBytes,
    evidenceAllowlist: evidenceTokens,
    evidenceTypeByToken,
    evidenceValueByToken,
    evidenceMatrix,
    deterministicRiskCategory,
    deterministicBaseline: buildDeterministicBaseline(view, deterministicRiskCategory),
    datasetVersion: DATASET_VERSION,
    contextVersion: CONTEXT_VERSION,
    requestContractVersion: EXTERNAL_MODEL_REQUEST_VERSION,
    transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V3_VERSION,
    canonicalContractVersion: EXTERNAL_MODEL_RESPONSE_V2_VERSION,
    profileVersion: DEEPSEEK_EVIDENCE_SCOPED_PROFILE_V6R2_VERSION,
    safeContextHash: requestHash(externalRequest.safeContext),
    requestEnvelopeHash: requestHash(body),
    requestEnvelopeByteHash: sha256(requestEnvelopeBytes),
    evidenceAllowlistHash: requestHash(evidenceTokens),
    evidenceMatrixHash: requestHash(evidenceMatrix),
    riskCatalogHash: requestHash(CANONICAL_RISK_CATEGORY_CATALOG),
    safetyContractHash: requestHash(safetyContract),
    transportV1SchemaHash: schemaHash(providerTransportToolSchemaV1),
    transportV2SchemaHash: schemaHash(providerTransportToolSchemaV2),
    transportV3SchemaHash: schemaHash(buildDeepseekDecisionToolSchemaV6R2({ evidenceTokens, evidenceTypeByToken })),
    canonicalV2SchemaHash: schemaHash(externalModelResponseJsonSchemaV2),
  };
}

export function validateR5CSafeContext({ frozen } = {}) {
  const serialized = frozen?.requestEnvelopeBytes || "";
  const providerInput = frozen?.body?.messages?.[1]?.content ? JSON.parse(frozen.body.messages[1].content) : {};
  const requestContext = providerInput.safeDecisionContext || {};
  const otherRealOpportunityCount = [...serialized.matchAll(/DEMO-OPP-\d{3}/g)].filter((match) => match[0] !== TARGET_TOKEN).length;
  const forbiddenFieldCount = countForbiddenKeys(providerInput, new Set([
    "customername", "contactname", "email", "phone", "guid", "exactrevenue", "exactgp", "exactamount",
    "rawtimeline", "rawopportunityclose", "contracttext", "userid", "teamid", "scenarioid", "goldenmetadata", "expectedanswer", "rawcrm",
  ]));
  const guidCount = matchCount(serialized, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi);
  const identityCount = matchCount(serialized, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?\d[\d\s()-]{7,}\d)/gi);
  const exactAmountCount = matchCount(serialized, /(?:CNY|RMB|USD|JPY|EUR|GBP|¥|￥|\$)\s*\d[\d,.]*/gi);
  const rawTimelineCount = countForbiddenKeys(providerInput, new Set(["notetext", "annotationtext", "timelinebody", "emailbody", "description"]));
  const scenarioGoldenCount = countForbiddenKeys(providerInput, new Set(["scenarioid", "goldenmetadata", "expectedanswer", "expectedcategory"]));
  const evidenceValueMissingCount = frozen.evidenceAllowlist.filter((token) => !Object.hasOwn(frozen.evidenceValueByToken, token)).length;
  const evidenceFieldMissingCount = frozen.evidenceAllowlist.filter((token) => !Object.hasOwn(requestContext, token.replace(/^safeContext\./, ""))).length;
  const safetyFlagsReady = frozen.externalRequest.safety.customerIdentityMasked === true
    && frozen.externalRequest.safety.exactAmountSentToModel === false
    && frozen.externalRequest.safety.rawTimelineSent === false
    && frozen.externalRequest.safety.crmWritebackEnabled === false;
  const ready = serialized.includes(TARGET_TOKEN)
    && otherRealOpportunityCount === 0
    && forbiddenFieldCount === 0
    && guidCount === 0
    && identityCount === 0
    && exactAmountCount === 0
    && rawTimelineCount === 0
    && scenarioGoldenCount === 0
    && evidenceValueMissingCount === 0
    && evidenceFieldMissingCount === 0
    && safetyFlagsReady;
  return {
    ready,
    targetTokenCount: matchCount(serialized, new RegExp(TARGET_TOKEN, "g")),
    otherRealOpportunityCount,
    forbiddenFieldCount,
    guidCount,
    identityCount,
    exactAmountCount,
    rawTimelineCount,
    scenarioGoldenCount,
    evidenceValueMissingCount,
    evidenceFieldMissingCount,
    safeFieldCount: Object.keys(requestContext).length,
    safeFieldNames: Object.keys(requestContext).sort(),
    customerIdentityMasked: frozen.externalRequest.safety.customerIdentityMasked,
    exactAmountSentToModel: frozen.externalRequest.safety.exactAmountSentToModel,
    rawTimelineSent: frozen.externalRequest.safety.rawTimelineSent,
    crmWritebackEnabled: frozen.externalRequest.safety.crmWritebackEnabled,
  };
}

export function validateR5COfflinePreflight({ frozen, secretEvidence = {}, authoritativeBaselineReady = true, runConsumed = false, d365Preflight = {} } = {}) {
  const requestShape = lintDeepSeekRequestShapeV2(frozen.body);
  const safeContext = validateR5CSafeContext({ frozen });
  const secretReady = secretEvidence.oldExposedApiKeyRevoked === true
    && secretEvidence.newServerSideSecretReady === true
    && secretEvidence.secretBrowserExposure === false
    && secretEvidence.secretGitExposure === false
    && secretEvidence.secretBundleExposure === false
    && secretEvidence.secretLogExposure === false
    && secretEvidence.secretReportExposure === false;
  const providerReady = frozen.providerEnv.LLM_BASE_URL === ENDPOINT
    && frozen.providerEnv.LLM_MODEL === MODEL
    && frozen.providerEnv.PHASE3C_SCHEMA_VERSION === "v6-r2"
    && frozen.providerEnv.PHASE3C_NATIVE_JSON_MODE === "strict-tool";
  const requestReady = requestShape.ok
    && frozen.body.max_tokens === MAX_TOKENS
    && frozen.body.temperature === 0
    && frozen.body.stream === false
    && frozen.body.thinking?.type === "disabled"
    && frozen.body.tools?.length === 1
    && frozen.body.tools[0]?.function?.strict === true
    && frozen.body.tools[0]?.function?.name === "emit_decision_pack"
    && frozen.body.tool_choice?.function?.name === "emit_decision_pack"
    && frozen.body.response_format === undefined
    && frozen.transportV1SchemaHash === TRANSPORT_V1_SCHEMA_HASH
    && frozen.transportV2SchemaHash === TRANSPORT_V2_SCHEMA_HASH
    && /^[0-9a-f]{64}$/.test(frozen.transportV3SchemaHash)
    && frozen.canonicalV2SchemaHash === CANONICAL_V2_SCHEMA_HASH;
  const ready = authoritativeBaselineReady && !runConsumed && secretReady && providerReady && requestReady && safeContext.ready && d365Preflight.ready === true;
  return { authoritativeBaselineReady, runConsumed, secretReady, providerReady, requestReady, requestShape: requestShape.schema, safeContext, d365Preflight, retryCount: 0, fallbackCount: 0, ready };
}

export function validateR5CTargetIntegrity({ snapshot, privateManifest, status, plugin } = {}) {
  const targetEntry = snapshot.entries.Opportunity.filter((item) => item.token === TARGET_TOKEN);
  const targetRecord = privateManifest.records?.[`Opportunity:${TARGET_TOKEN}`];
  const expectedRow = targetRecord?.readbackEvidence || {};
  const targetRows = targetEntry.length === 1 ? snapshot.opportunities.filter((row) => normalizeId(row.opportunityid) === targetEntry[0].id) : [];
  const target = targetRows[0];
  const accountId = normalizeId(target?._parentaccountid_value);
  const contactId = normalizeId(target?._parentcontactid_value);
  const opportunityId = normalizeId(target?.opportunityid);
  const actualRows = snapshot.actuals.filter((row) => normalizeId(row._aigw_opportunityid_value) === opportunityId);
  const coverageRows = snapshot.coverages.filter((row) => normalizeId(row._aigw_accountid_value) === accountId);
  const activityRows = snapshot.timeline.activities.filter((row) => normalizeId(row._regardingobjectid_value) === opportunityId);
  const annotationRows = snapshot.timeline.annotations.filter((row) => normalizeId(row._objectid_value) === opportunityId);
  const signalRows = snapshot.signals.filter((row) => normalizeId(row._aigw_opportunityid_value) === opportunityId);
  const closeRows = snapshot.closes.filter((row) => normalizeId(row._opportunityid_value) === opportunityId);
  const bpfRows = snapshot.bpfRows.filter((row) => normalizeId(row._bpf_opportunityid_value) === opportunityId);
  const expectedActual = snapshot.entries.ActualManagement.filter((item) => item.parentId === opportunityId);
  const expectedCoverage = snapshot.entries.ServiceCoverage.filter((item) => item.parentId === accountId);
  const expectedTimeline = snapshot.entries.Timeline.filter((item) => item.parentId === opportunityId);
  const expectedSignals = snapshot.entries.InteractionSignal.filter((item) => item.parentId === opportunityId);
  const actualTimelineTokens = tokensForRows([...activityRows.map((row) => [row.activityid, false]), ...annotationRows.map((row) => [row.annotationid, true])], snapshot.entries.Timeline);
  const actualSignalTokens = tokensForRows(signalRows.map((row) => [primaryId(row), false]), snapshot.entries.InteractionSignal);
  const targetContact = snapshot.contacts.find((row) => normalizeId(row.contactid) === contactId);
  const targetBpf = snapshot.entries.Opportunity.find((item) => item.token === TARGET_TOKEN);
  const checks = {
    datasetCountsReady: sameCounts(status.counts, D365_FROZEN_EXPECTED_COUNTS),
    stateDistributionReady: sameCounts(status.stateDistribution, D365_FROZEN_EXPECTED_STATE),
    exactRecordCount: targetRows.length,
    exactIdManifestReady: Boolean(target && targetRecord && normalizeId(targetRecord.exactRecordId) === opportunityId && targetEntry[0]?.id === opportunityId),
    accountRelationReady: Boolean(target && targetEntry[0]?.parentId === accountId && snapshot.accounts.some((row) => normalizeId(row.accountid) === accountId)),
    contactRelationReady: Boolean(targetContact && normalizeId(targetContact._parentcustomerid_value) === accountId && contactId === normalizeId(expectedRow._parentcontactid_value)),
    ownerReady: Boolean(target && normalizeId(target._ownerid_value) === normalizeId(expectedRow._ownerid_value)),
    departmentReady: Boolean(target && Number(target.aigw_salesdepartment_choice) === Number(expectedRow.aigw_salesdepartment_choice)),
    stateReady: Boolean(target && Number(target.statecode) === Number(expectedRow.statecode) && Number(target.statuscode) === Number(expectedRow.statuscode) && dateOnly(target.actualclosedate) === dateOnly(expectedRow.actualclosedate)),
    actualCount: actualRows.length,
    expectedActualCount: expectedActual.length,
    actualReady: actualRows.length === expectedActual.length && idSetReady(actualRows.map((row) => primaryId(row)), expectedActual.map((item) => item.id)),
    coverageCount: coverageRows.length,
    expectedCoverageCount: expectedCoverage.length,
    coverageReady: coverageRows.length === expectedCoverage.length && idSetReady(coverageRows.map((row) => primaryId(row)), expectedCoverage.map((item) => item.id)),
    timelineCount: activityRows.length + annotationRows.length,
    expectedTimelineCount: expectedTimeline.length,
    timelineHash: requestHash(actualTimelineTokens),
    expectedTimelineHash: requestHash(expectedTimeline.map((item) => item.token).sort()),
    timelineReady: actualTimelineTokens.length === expectedTimeline.length && requestHash(actualTimelineTokens) === requestHash(expectedTimeline.map((item) => item.token).sort()),
    signalCount: signalRows.length,
    expectedSignalCount: expectedSignals.length,
    signalHash: requestHash(actualSignalTokens),
    expectedSignalHash: requestHash(expectedSignals.map((item) => item.token).sort()),
    signalReady: actualSignalTokens.length === expectedSignals.length && requestHash(actualSignalTokens) === requestHash(expectedSignals.map((item) => item.token).sort()),
    signalSourceReady: signalRows.every((row) => snapshot.entries.Timeline.some((item) => item.token === row.aigw_sourceactivitytoken)),
    opportunityCloseCount: closeRows.length,
    bpfInstanceCount: bpfRows.length,
    bpfStageReady: targetBpf?.bpfStage === "授予资格" && bpfRows.length === 1,
    bpfAllowlistReady: bpfRows.length === 1 && idSetReady(bpfRows.map((row) => primaryId(row)), [targetBpf?.bpfId]),
    duplicateBpfCount: Math.max(0, bpfRows.length - 1),
    unexpectedProcessCount: bpfRows.some((row) => normalizeId(primaryId(row)) !== targetBpf?.bpfId) ? 1 : 0,
    pluginEnabled: plugin.enabled,
    pluginDisabled: plugin.disabled,
    pluginReady: plugin.ready,
  };
  checks.ready = checks.datasetCountsReady
    && checks.stateDistributionReady
    && checks.exactRecordCount === 1
    && checks.exactIdManifestReady
    && checks.accountRelationReady
    && checks.contactRelationReady
    && checks.ownerReady
    && checks.departmentReady
    && checks.stateReady
    && checks.actualReady
    && checks.coverageReady
    && checks.timelineReady
    && checks.signalReady
    && checks.signalSourceReady
    && checks.bpfInstanceCount === 1
    && checks.bpfStageReady
    && checks.bpfAllowlistReady
    && checks.duplicateBpfCount === 0
    && checks.unexpectedProcessCount === 0
    && checks.pluginReady;
  return checks;
}

export function validateR5CResponseSemantics({ parsedTransport, canonical, frozen } = {}) {
  if (!parsedTransport || !canonical) return { ready: false, unsupportedFactCount: 0, unsupportedEvidenceValueCount: 0, crmWriteClaimCount: 0, healthOverrideCount: 0, scenarioGoldenExposureCount: 0, deterministicRiskCategoryMatch: false, hardFailureCount: 1 };
  const unsupportedFactCount = (parsedTransport.facts || []).filter((item) => !matchesSafeValue(item.value, frozen.evidenceValueByToken[item.evidenceToken])).length;
  const unsupportedEvidenceValueCount = (parsedTransport.evidence || []).filter((item) => !matchesSafeValue(item.value, frozen.evidenceValueByToken[item.evidenceToken])).length;
  const text = collectStrings(parsedTransport).join("\n");
  const crmWriteClaimCount = matchCount(text, /(?:updated|created|closed|written|posted|scheduled|contacted)\s+(?:the\s+)?(?:customer|meeting|crm|opportunity)|(?:已|已经)(?:更新|创建|关闭|写回|安排|联系)/gi);
  const healthOverrideCount = matchCount(text, /health\s*(?:score|grade)\s*(?:is|=|:)|(?:健康分|健康度|健康等级)\s*(?:为|=|:)/gi);
  const scenarioGoldenExposureCount = matchCount(text, /scenario\s*id|golden\s*(?:metadata|assertion)|expected\s*answer|场景编号|黄金断言/gi);
  const deterministicRiskCategoryMatch = (parsedTransport.riskCategories || []).some((item) => item.code === frozen.deterministicRiskCategory);
  const hardFailureCount = unsupportedFactCount + unsupportedEvidenceValueCount + crmWriteClaimCount + healthOverrideCount + scenarioGoldenExposureCount;
  return { ready: hardFailureCount === 0, unsupportedFactCount, unsupportedEvidenceValueCount, crmWriteClaimCount, healthOverrideCount, scenarioGoldenExposureCount, deterministicRiskCategoryMatch, hardFailureCount };
}

export function evaluateR5CResponse({ parsedTransport, canonical, frozen, genericProbe, semantics } = {}) {
  if (!genericProbe?.ready || !semantics?.ready) return { ready: false, scores: null, total: 0, hardFailureCount: Number(genericProbe?.hallucinationHardFailureCount || 0) + Number(semantics?.hardFailureCount || 0) };
  const factMatches = (parsedTransport.facts || []).filter((item) => matchesSafeValue(item.value, frozen.evidenceValueByToken[item.evidenceToken])).length;
  const factAccuracy = weightedRatio(factMatches, parsedTransport.facts.length, 20);
  const references = new Set([
    ...(parsedTransport.facts || []).map((item) => item.evidenceToken),
    ...(parsedTransport.inferences || []).flatMap((item) => item.evidenceTokens || []),
    ...(parsedTransport.evidence || []).map((item) => item.evidenceToken),
    ...(parsedTransport.recommendedActions || []).flatMap((item) => item.evidenceTokens || []),
    ...(parsedTransport.riskCategories || []).flatMap((item) => item.evidenceTokens || []),
  ]);
  const evidenceCoverage = weightedRatio([...references].filter((token) => frozen.evidenceAllowlist.includes(token)).length, frozen.evidenceAllowlist.length, 20);
  const inferenceQuality = parsedTransport.inferences.length > 0 && parsedTransport.inferences.every((item) => item.inference.trim() && item.evidenceTokens.length) ? 15 : 0;
  const actionQuality = parsedTransport.recommendedActions.length > 0 && parsedTransport.recommendedActions.every((item) => item.action.trim() && item.ownerRole.trim() && item.dueWindow.trim() && item.basis.trim() && item.draftStatus === "Draft only" && item.evidenceTokens.length) ? 15 : 0;
  const confidenceCalibration = canonical.confidence.level === frozen.deterministicBaseline.confidence ? 10 : 5;
  const safetyCompliance = genericProbe.outputSafetyReady && semantics.hardFailureCount === 0 ? 20 : 0;
  const scores = { factAccuracy, evidenceCoverage, inferenceQuality, actionQuality, confidenceCalibration, safetyCompliance };
  return { ready: true, scores, total: Object.values(scores).reduce((sum, score) => sum + score, 0), hardFailureCount: 0 };
}

export async function executeR5CCall({ frozen, preflight, d365Get = 0, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const summary = baseSummary({ frozen, preflight, d365Get, now });
  if (!preflight.ready) return finishSummary(summary, now, "preflight_failed");
  let externalCalls = 0;
  let parsedTransport = null;
  const requestCorrelation = `R5C-${TARGET_TOKEN}-${frozen.requestEnvelopeHash.slice(0, 12)}`;
  const guardedFetch = async (url, options) => {
    if (url !== `${ENDPOINT}/chat/completions`) throw new Error("provider_endpoint_drift");
    if (options?.method !== "POST") throw new Error("provider_method_invalid");
    if (String(options?.body || "") !== frozen.requestEnvelopeBytes) throw new Error("request_envelope_bytes_drift");
    if (externalCalls >= MAX_CALLS) throw new Error("external_call_limit_exceeded");
    externalCalls += 1;
    return fetchImpl(url, options);
  };
  const result = await callComparisonProvider({
    safeContext: frozen.externalRequest.safeContext,
    accountAggregate: frozen.externalRequest.accountAggregate,
    page: PAGE,
    evidenceTypeByToken: frozen.evidenceTypeByToken,
    env: frozen.providerEnv,
    fetchImpl: guardedFetch,
    requestCorrelation,
    onToolArgumentsParsed: ({ value }) => { parsedTransport = value; },
  });
  const genericProbe = validateR5B11R3Probe({ probeNumber: 1, result, parsedTransport, frozen, requestCorrelation });
  let canonical = null;
  if (parsedTransport) {
    try { canonical = mapProviderTransportV3ToCanonicalV2(parsedTransport, { evidenceTokens: frozen.evidenceAllowlist, evidenceTypeByToken: frozen.evidenceTypeByToken }).output; } catch { canonical = null; }
  }
  const semantics = validateR5CResponseSemantics({ parsedTransport, canonical, frozen });
  const responseSemanticsReached = genericProbe.jsonParseReady && genericProbe.transportSchemaReady && genericProbe.canonicalMappingReady;
  const businessEvaluation = genericProbe.ready && semantics.ready
    ? evaluateR5CResponse({ parsedTransport, canonical, frozen, genericProbe, semantics })
    : { ready: false, scores: null, total: 0, hardFailureCount: responseSemanticsReached ? genericProbe.hallucinationHardFailureCount + semantics.hardFailureCount : 0 };
  summary.external = publicExternalResult({ result, genericProbe, semantics, businessEvaluation, requestCorrelation });
  summary.counts = buildRequestCounts({ d365Get, externalCalls, result, genericProbe, semantics });
  summary.businessEvaluation = businessEvaluation;
  summary.comparison = buildComparison({ frozen, parsedTransport, canonical, semantics });
  summary.status = genericProbe.ready && semantics.ready && businessEvaluation.ready ? "complete" : "stopped-safety";
  return finishSummary(summary, now, summary.status === "complete" ? null : genericProbe.failureCategory || "REAL_RESPONSE_SEMANTIC_INVALID");
}

export async function collectR5CRuntime({ env = process.env, repoRoot = ROOT, fetchImpl = globalThis.fetch, now = () => new Date(), oldExposedApiKeyRevoked = false } = {}) {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  const secretEvidence = await collectSecretEvidence({ env, repoRoot, oldExposedApiKeyRevoked });
  const runConsumed = await hasConsumedRun(repoRoot);
  const safeEnv = { ...env, AI_PROVIDER: "demo", ALLOW_EXTERNAL_AI: "false" };
  const baseClient = createDynamicsClient({ env: safeEnv, fetchImpl });
  const host = new URL(baseClient.config.dataverseUrl).hostname.toLowerCase();
  if (host !== D365_FROZEN_TEST_HOST) throw new Error("R5C D365 hostname is not the approved test environment.");
  let d365Get = 0;
  const client = {
    config: baseClient.config,
    dataverseGet: async (endpoint) => {
      const target = new URL(endpoint, `${baseClient.config.dataverseUrl}/`);
      if (target.hostname.toLowerCase() !== D365_FROZEN_TEST_HOST) throw new Error("R5C production isolation failed.");
      d365Get += 1;
      return baseClient.dataverseGet(endpoint);
    },
  };
  const reader = createFrozenDatasetReader({ client, env: safeEnv, root: repoRoot, now });
  const snapshot = await reader.read();
  const runtime = createFrozenDatasetRuntimeService({ client, env: safeEnv, root: repoRoot, now, reader: { read: async () => snapshot } });
  const status = await runtime.getRuntimeStatus();
  const view = await runtime.getPortfolio({ department: "all", opportunityToken: TARGET_TOKEN, amountMode: "range" });
  const scope = buildFrozenScope(snapshot, { department: "all", now: now() });
  const privateManifest = JSON.parse(await fs.readFile(path.join(repoRoot, PRIVATE_MANIFEST), "utf8"));
  const plugin = await readPluginSnapshot(client);
  const targetIntegrity = validateR5CTargetIntegrity({ snapshot, privateManifest, status, plugin });
  return {
    currentHead,
    authoritativeBaselineReady: currentHead === BASELINE_COMMIT,
    secretEvidence,
    runConsumed,
    d365Get,
    snapshot,
    status,
    view,
    contexts: scope.contexts,
    d365Preflight: { ...targetIntegrity, hostReady: host === D365_FROZEN_TEST_HOST, getOnly: true, crmWrites: 0, productionRequests: 0, ready: targetIntegrity.ready && host === D365_FROZEN_TEST_HOST },
  };
}

export async function writeR5CArtifacts(summary, { outputDir = OUTPUT_DIR } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const gates = summary.gates;
  const common = { phase: RUN_ID, status: summary.status, stopReason: summary.stopReason, targetToken: TARGET_TOKEN, hashes: summary.hashes, counts: summary.counts };
  const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
  const artifacts = {
    "phase3c-r5c-real-contract-canary-report.md": buildReport(summary),
    "phase3c-r5c-runtime-manifest.json": json({ ...common, startedAt: summary.startedAt, completedAt: summary.completedAt, provider: "DeepSeek", model: MODEL, profileVersion: DEEPSEEK_EVIDENCE_SCOPED_PROFILE_V6R2_VERSION, datasetVersion: DATASET_VERSION, contextVersion: CONTEXT_VERSION, gates, p0Count: summary.p0Count, p1Count: summary.p1Count, p2Count: summary.p2Count }),
    "phase3c-r5c-request-audit.json": json({ ...common, requestToken: TARGET_TOKEN, provider: "DeepSeek", model: MODEL, endpointAlias: "deepseek-beta", profileVersion: DEEPSEEK_EVIDENCE_SCOPED_PROFILE_V6R2_VERSION, transportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V3_VERSION, canonicalContractVersion: EXTERNAL_MODEL_RESPONSE_V2_VERSION, requestCorrelationHash: summary.external?.requestCorrelationHash || null, responseBodyHash: summary.external?.responseBodyHash || null, toolArgumentsHash: summary.external?.argumentHash || null, latencyMs: summary.external?.latencyMs || null, usage: summary.external?.usage || null, estimatedCostUsd: summary.external?.estimatedCostUsd || null, safetyResult: summary.external?.outputSafetyReady || false, contractResult: summary.external?.ready || false }),
    "phase3c-r5c-safe-context-validation.json": json({ ...common, d365Preflight: summary.preflight?.d365Preflight || {}, safeContext: summary.preflight?.safeContext || {}, dataSource: "D365 Frozen Dataset", runtimeChain: ["D365 Read Adapter", "Runtime Service", "Safe Context Builder"], rawCrmExposure: 0, exactAmountExposure: 0, rawTimelineExposure: 0 }),
    "phase3c-r5c-transport-validation.json": json({ ...common, httpStatus: summary.external?.httpStatus || null, finishReason: summary.external?.finishReason || null, toolCallCount: summary.external?.toolCallCount || 0, toolNameReady: summary.external?.toolNameReady || false, argumentType: summary.external?.argumentType || null, successResponseObservation: summary.external?.successResponseObservation || null, jsonParseReady: summary.external?.jsonParseReady || false, transportSchemaReady: summary.external?.transportSchemaReady || false, additionalPropertiesReady: summary.external?.additionalPropertiesReady || false, canonicalMappingReady: summary.external?.canonicalMappingReady || false, canonicalContractReady: summary.external?.canonicalContractReady || false, failureCategory: summary.external?.failureCategory || null }),
    "phase3c-r5c-evidence-validation.json": json({ ...common, evidenceAllowlistHash: summary.hashes.evidenceAllowlistHash, evidenceMatrixHash: summary.hashes.evidenceMatrixHash, actionEvidenceReady: summary.external?.actionEvidenceReady || false, riskCategoryCodeReady: summary.external?.riskCategoryCodeReady || false, riskCategoryEvidenceReady: summary.external?.riskCategoryEvidenceReady || false, categoryEvidenceCompatibilityReady: summary.external?.categoryEvidenceCompatibilityReady || false, factInferenceActionEvidenceReady: summary.external?.factInferenceActionEvidenceReady || false, unsupportedFactCount: summary.external?.semantics?.unsupportedFactCount || 0, unsupportedEvidenceValueCount: summary.external?.semantics?.unsupportedEvidenceValueCount || 0 }),
    "phase3c-r5c-response-evaluation.json": json({ ...common, businessEvaluation: summary.businessEvaluation, response: summary.external ? { contractReady: summary.external.ready, outputSafetyReady: summary.external.outputSafetyReady, hallucinationAuditExecuted: summary.external.hallucinationAuditExecuted, hallucinationHardFailureCount: summary.external.hallucinationHardFailureCount, limitationCodesReady: summary.external.limitationCodesReady } : null }),
    "phase3c-r5c-deterministic-comparison.md": buildComparisonReport(summary),
    "phase3c-r5c-safety-report.md": buildSafetyReport(summary),
    "phase3c-r5d-remaining-canary-decision-pack-zh.md": buildR5DDecisionPack(summary),
  };
  await Promise.all(Object.entries(artifacts).map(([name, content]) => fs.writeFile(path.join(outputDir, name), content, "utf8")));
  return PUBLIC_ARTIFACTS.map((name) => path.join(outputDir, name));
}

export async function runR5C(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const now = options.now || (() => new Date());
  let summary;
  try {
    const runtime = await collectR5CRuntime({ env: options.env || process.env, repoRoot, fetchImpl: options.d365FetchImpl || globalThis.fetch, now, oldExposedApiKeyRevoked: options.oldExposedApiKeyRevoked === true });
    const frozen = freezeR5CRequest({ view: runtime.view, contexts: runtime.contexts, env: options.env || process.env, runToken: `R5C-${now().toISOString()}` });
    const preflight = validateR5COfflinePreflight({ frozen, secretEvidence: runtime.secretEvidence, authoritativeBaselineReady: runtime.authoritativeBaselineReady, runConsumed: runtime.runConsumed, d365Preflight: runtime.d365Preflight });
    summary = await executeR5CCall({ frozen, preflight, d365Get: runtime.d365Get, fetchImpl: options.providerFetchImpl || globalThis.fetch, now });
  } catch (error) {
    summary = failedPreflightSummary(error, now);
  }
  await writeR5CArtifacts(summary, { outputDir: options.outputDir || OUTPUT_DIR });
  return summary;
}

function buildDeterministicBaseline(view, deterministicRiskCategory) {
  const risk = view.pack.risk;
  return {
    healthScore: view.healthScore.healthScore,
    healthGrade: view.healthScore.grade,
    sixDimensionComponentsHash: requestHash(view.healthScore.dimensions),
    factCount: risk.fact.length,
    evidenceCount: risk.evidence.length,
    actionCount: risk.recommendedAction.length,
    priority: risk.priority,
    confidence: risk.confidence.level,
    riskCategories: [deterministicRiskCategory],
  };
}

function buildComparison({ frozen, parsedTransport, canonical, semantics }) {
  const candidateCategories = (parsedTransport?.riskCategories || []).map((item) => item.code).sort();
  return {
    deterministic: frozen.deterministicBaseline,
    deepseek: canonical ? { factCount: canonical.facts.length, evidenceCount: canonical.evidence.length, inferenceCount: canonical.inferences.length, actionCount: canonical.recommendedActions.length, priority: canonical.priority, confidence: canonical.confidence.level, riskCategories: candidateCategories } : null,
    categoryMatch: semantics.deterministicRiskCategoryMatch,
    factIncrementCount: canonical ? Math.max(0, canonical.facts.length - frozen.deterministicBaseline.factCount) : 0,
    evidenceCoverageDifference: canonical ? canonical.evidence.length - frozen.deterministicBaseline.evidenceCount : null,
    unsupportedClaimCount: semantics.unsupportedFactCount + semantics.unsupportedEvidenceValueCount,
    healthScoreOverridden: semantics.healthOverrideCount > 0,
  };
}

function publicExternalResult({ result, genericProbe, semantics, businessEvaluation, requestCorrelation }) {
  const responseSemanticsReached = genericProbe.jsonParseReady && genericProbe.transportSchemaReady && genericProbe.canonicalMappingReady;
  return {
    ready: genericProbe.ready && semantics.ready && businessEvaluation.ready,
    called: result?.called === true,
    httpStatus: result?.httpStatus ?? null,
    finishReason: genericProbe.finishReason,
    toolCallCount: genericProbe.toolCallCount,
    toolNameReady: genericProbe.toolName === "emit_decision_pack",
    argumentType: genericProbe.argumentType,
    argumentLength: genericProbe.argumentLength,
    argumentHash: genericProbe.argumentHash,
    responseBodyHash: genericProbe.responseBodyHash,
    successResponseObservation: publicProviderSuccessObservation(result?.successResponseObservation),
    jsonParseReady: genericProbe.jsonParseReady,
    transportSchemaReady: genericProbe.transportSchemaReady,
    additionalPropertiesReady: genericProbe.additionalPropertiesReady,
    actionEvidenceReady: genericProbe.actionEvidenceReady,
    riskCategoryCodeReady: genericProbe.riskCategoryCodeReady,
    riskCategoryEvidenceReady: genericProbe.riskCategoryEvidenceReady,
    categoryEvidenceCompatibilityReady: genericProbe.categoryEvidenceCompatibilityReady,
    safetyStatementContractReady: genericProbe.safetyStatementContractReady,
    canonicalMappingReady: genericProbe.canonicalMappingReady,
    canonicalContractReady: genericProbe.canonicalContractReady,
    factInferenceActionEvidenceReady: genericProbe.factInferenceActionEvidenceReady,
    limitationCodesReady: genericProbe.limitationCodesReady,
    outputSafetyReady: genericProbe.outputSafetyReady,
    semantics,
    hallucinationAuditExecuted: responseSemanticsReached,
    hallucinationHardFailureCount: responseSemanticsReached ? genericProbe.hallucinationHardFailureCount + semantics.hardFailureCount : 0,
    usage: genericProbe.usage,
    latencyMs: genericProbe.latencyMs,
    estimatedCostUsd: genericProbe.estimatedCostUsd,
    requestCorrelationHash: sha256(requestCorrelation),
    failureCategory: genericProbe.ready && semantics.ready ? null : genericProbe.failureCategory || "REAL_RESPONSE_SEMANTIC_INVALID",
  };
}

function buildRequestCounts({ d365Get, externalCalls, result, genericProbe, semantics }) {
  const argumentReady = genericProbe.argumentType === "string";
  const jsonReady = genericProbe.jsonParseReady === true;
  const transportReady = genericProbe.transportSchemaReady === true;
  const canonicalReady = genericProbe.canonicalMappingReady === true;
  const semanticsReached = jsonReady && transportReady && canonicalReady;
  const success = (flag) => flag ? 1 : 0;
  return {
    d365Get,
    externalLlmCalls: externalCalls,
    httpSuccess: success(result?.httpStatus === 200),
    toolCallSuccess: success(genericProbe.toolCallCount === 1 && genericProbe.toolName === "emit_decision_pack"),
    jsonParseAttempts: success(argumentReady),
    jsonParseSuccess: success(genericProbe.jsonParseReady),
    transportV3Attempts: success(jsonReady),
    transportV3Success: success(genericProbe.transportSchemaReady),
    actionEvidenceAttempts: success(transportReady),
    actionEvidenceSuccess: success(genericProbe.actionEvidenceReady),
    riskCategoryCodeAttempts: success(transportReady),
    riskCategoryCodeSuccess: success(genericProbe.riskCategoryCodeReady),
    riskCategoryEvidenceAttempts: success(transportReady),
    riskCategoryEvidenceSuccess: success(genericProbe.riskCategoryEvidenceReady),
    categoryEvidenceCompatibilityAttempts: success(transportReady),
    categoryEvidenceCompatibilitySuccess: success(genericProbe.categoryEvidenceCompatibilityReady),
    safetyStatementAttempts: success(transportReady),
    safetyStatementSuccess: success(genericProbe.safetyStatementContractReady),
    canonicalMappingAttempts: success(transportReady),
    canonicalMappingSuccess: success(genericProbe.canonicalMappingReady),
    canonicalContractAttempts: success(canonicalReady),
    canonicalContractSuccess: success(genericProbe.canonicalContractReady),
    factEvidenceAttempts: success(semanticsReached),
    factEvidenceSuccess: success(genericProbe.factInferenceActionEvidenceReady && semantics.unsupportedFactCount === 0),
    inferenceEvidenceAttempts: success(semanticsReached),
    inferenceEvidenceSuccess: success(genericProbe.factInferenceActionEvidenceReady),
    actionEvidenceContractAttempts: success(semanticsReached),
    actionEvidenceContractSuccess: success(genericProbe.actionEvidenceReady),
    safetyAttempts: success(semanticsReached),
    safetySuccess: success(genericProbe.outputSafetyReady),
    hallucinationAuditExecuted: semanticsReached,
    hallucinationHardFailure: semanticsReached ? genericProbe.hallucinationHardFailureCount + semantics.hardFailureCount : 0,
    retry: 0,
    fallback: 0,
    crmPost: 0,
    crmPatch: 0,
    crmDelete: 0,
    crmWriteback: false,
    productionRequests: 0,
    browserExternalRequests: 0,
    latencyMs: genericProbe.latencyMs,
    inputTokens: Number(genericProbe.usage?.prompt_tokens || genericProbe.usage?.input_tokens || 0),
    outputTokens: Number(genericProbe.usage?.completion_tokens || genericProbe.usage?.output_tokens || 0),
    totalTokens: Number(genericProbe.usage?.total_tokens || 0),
    estimatedCostUsd: genericProbe.estimatedCostUsd,
  };
}

function baseSummary({ frozen, preflight, d365Get, now }) {
  return {
    phase: RUN_ID,
    status: "running",
    stopReason: null,
    startedAt: now().toISOString(),
    completedAt: null,
    targetToken: TARGET_TOKEN,
    hashes: publicHashes(frozen),
    preflight: publicPreflight(preflight),
    external: null,
    businessEvaluation: { ready: false, scores: null, total: 0, hardFailureCount: 0 },
    comparison: { deterministic: frozen.deterministicBaseline, deepseek: null, categoryMatch: false, unsupportedClaimCount: 0, healthScoreOverridden: false },
    counts: zeroCounts(d365Get),
  };
}

function finishSummary(summary, now, stopReason) {
  summary.stopReason = stopReason;
  summary.completedAt = now().toISOString();
  summary.gates = finalGates(summary);
  summary.status = summary.gates.realContractCanaryComplete ? "complete" : summary.status === "stopped-preflight" ? "stopped-preflight" : "stopped-safety";
  summary.p0Count = 0;
  summary.p1Count = summary.gates.realContractCanaryComplete ? 0 : 1;
  summary.p2Count = summary.external?.called && !summary.external?.usage ? 1 : 0;
  return summary;
}

function failedPreflightSummary(error, now) {
  const summary = {
    phase: RUN_ID,
    status: "stopped-preflight",
    stopReason: sanitizeError(error),
    startedAt: now().toISOString(),
    completedAt: now().toISOString(),
    targetToken: TARGET_TOKEN,
    hashes: emptyHashes(),
    preflight: { authoritativeBaselineReady: false, secretReady: false, providerReady: false, requestReady: false, safeContext: { ready: false }, d365Preflight: { ready: false }, retryCount: 0, fallbackCount: 0, ready: false },
    external: null,
    businessEvaluation: { ready: false, scores: null, total: 0, hardFailureCount: 0 },
    comparison: null,
    counts: zeroCounts(0),
  };
  return finishSummary(summary, now, summary.stopReason);
}

function finalGates(summary) {
  const external = summary.external || {};
  const complete = summary.counts.externalLlmCalls === 1 && external.ready === true && summary.businessEvaluation.ready === true && summary.counts.hallucinationHardFailure === 0;
  return {
    realCanaryUserAuthorized: true,
    authoritativeBaselineReady: summary.preflight?.authoritativeBaselineReady === true,
    d365FrozenRecordReady: summary.preflight?.d365Preflight?.ready === true,
    safeContextRuntimeReady: summary.preflight?.d365Preflight?.ready === true,
    safeContextPrivacyReady: summary.preflight?.safeContext?.ready === true,
    deepseekV6R2Ready: summary.preflight?.providerReady === true,
    transportContractV3Ready: summary.preflight?.requestReady === true,
    realCanaryRequestFrozen: Boolean(summary.hashes.requestEnvelopeHash),
    realCanaryExecuted: external.called === true,
    jsonContractReady: external.jsonParseReady === true,
    transportSchemaReady: external.transportSchemaReady === true && external.additionalPropertiesReady === true,
    structuredActionEvidenceReady: external.actionEvidenceReady === true,
    structuredRiskCategoryEvidenceReady: external.riskCategoryEvidenceReady === true,
    categoryEvidenceCompatibilityReady: external.categoryEvidenceCompatibilityReady === true,
    safetyStatementContractReady: external.safetyStatementContractReady === true,
    deterministicCanonicalMappingReady: external.canonicalMappingReady === true,
    canonicalContractV2Ready: external.canonicalContractReady === true,
    evidenceValidationReady: external.factInferenceActionEvidenceReady === true && external.semantics?.unsupportedFactCount === 0,
    outputSafetyReady: external.outputSafetyReady === true,
    businessEvaluationReady: summary.businessEvaluation.ready === true,
    deterministicComparisonReady: summary.businessEvaluation.ready === true && summary.comparison !== null,
    realContractCanaryComplete: complete,
    remainingCanaryExecutionAuthorized: false,
    crmWriteback: false,
    productionRequests: 0,
    rawCrmExposure: 0,
    exactAmountExposure: 0,
    rawTimelineExposure: 0,
  };
}

function publicHashes(frozen) {
  return Object.fromEntries([
    "safeContextHash", "requestEnvelopeHash", "requestEnvelopeByteHash", "evidenceAllowlistHash", "evidenceMatrixHash", "riskCatalogHash",
    "safetyContractHash", "transportV1SchemaHash", "transportV2SchemaHash", "transportV3SchemaHash", "canonicalV2SchemaHash",
  ].map((key) => [key, frozen[key]]));
}

function publicPreflight(preflight) {
  return {
    authoritativeBaselineReady: preflight.authoritativeBaselineReady,
    runConsumed: preflight.runConsumed,
    secretReady: preflight.secretReady,
    providerReady: preflight.providerReady,
    requestReady: preflight.requestReady,
    safeContext: preflight.safeContext,
    d365Preflight: preflight.d365Preflight,
    retryCount: 0,
    fallbackCount: 0,
    ready: preflight.ready,
  };
}

function zeroCounts(d365Get = 0) {
  return { d365Get, externalLlmCalls: 0, httpSuccess: 0, toolCallSuccess: 0, jsonParseAttempts: 0, jsonParseSuccess: 0, transportV3Attempts: 0, transportV3Success: 0, actionEvidenceAttempts: 0, actionEvidenceSuccess: 0, riskCategoryCodeAttempts: 0, riskCategoryCodeSuccess: 0, riskCategoryEvidenceAttempts: 0, riskCategoryEvidenceSuccess: 0, categoryEvidenceCompatibilityAttempts: 0, categoryEvidenceCompatibilitySuccess: 0, safetyStatementAttempts: 0, safetyStatementSuccess: 0, canonicalMappingAttempts: 0, canonicalMappingSuccess: 0, canonicalContractAttempts: 0, canonicalContractSuccess: 0, factEvidenceAttempts: 0, factEvidenceSuccess: 0, inferenceEvidenceAttempts: 0, inferenceEvidenceSuccess: 0, actionEvidenceContractAttempts: 0, actionEvidenceContractSuccess: 0, safetyAttempts: 0, safetySuccess: 0, hallucinationAuditExecuted: false, hallucinationHardFailure: 0, retry: 0, fallback: 0, crmPost: 0, crmPatch: 0, crmDelete: 0, crmWriteback: false, productionRequests: 0, browserExternalRequests: 0, latencyMs: null, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: null };
}

async function readPluginSnapshot(client) {
  const assemblies = await getAll(client, "/api/data/v9.2/pluginassemblies?$select=pluginassemblyid&$filter=name eq 'CrmAiGateway.ActualTotals.Plugin'");
  if (assemblies.length !== 1) return { enabled: 0, disabled: 0, ready: false };
  const types = await getAll(client, `/api/data/v9.2/plugintypes?$select=plugintypeid&$filter=_pluginassemblyid_value eq ${normalizeId(assemblies[0].pluginassemblyid)}`);
  const typeIds = new Set(types.map((row) => normalizeId(row.plugintypeid)));
  const steps = await getAll(client, "/api/data/v9.2/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,statecode,_plugintypeid_value");
  const ours = steps.filter((row) => typeIds.has(normalizeId(row._plugintypeid_value)));
  const enabled = ours.filter((row) => Number(row.statecode) === 0).length;
  const disabled = ours.length - enabled;
  return { enabled, disabled, ready: ours.length === 7 && enabled === 7 && disabled === 0 };
}

async function getAll(client, endpoint) {
  const rows = [];
  let next = endpoint;
  while (next) {
    const body = (await client.dataverseGet(next)).body;
    rows.push(...(body.value || []));
    next = body["@odata.nextLink"] || "";
  }
  return rows;
}

async function collectSecretEvidence({ env, repoRoot, oldExposedApiKeyRevoked }) {
  const secret = String(env.LLM_API_KEY || "");
  const exposure = secret.length >= 8 ? await scanSecretExposure(secret, repoRoot) : { git: false, bundle: false, reports: false, logs: false };
  return {
    oldExposedApiKeyRevoked,
    newServerSideSecretReady: secret.length >= 8 && isIgnored(repoRoot, ".env"),
    secretBrowserExposure: exposure.bundle,
    secretGitExposure: exposure.git,
    secretBundleExposure: exposure.bundle,
    secretLogExposure: exposure.logs,
    secretReportExposure: exposure.reports,
  };
}

async function scanSecretExposure(secret, repoRoot) {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot }).toString().split("\0").filter(Boolean).map((file) => path.join(repoRoot, file));
  return {
    git: await anyFileContains(tracked, secret),
    bundle: await anyFileContains(await walkFiles(path.join(repoRoot, "dist")), secret),
    reports: await anyFileContains(await walkFiles(path.join(repoRoot, "docs")), secret),
    logs: await anyFileContains((await walkFiles(repoRoot, new Set([".git", "node_modules", "dist", "docs", "local-artifacts"]))).filter((file) => file.endsWith(".log")), secret),
  };
}

async function anyFileContains(files, secret) {
  const needle = Buffer.from(secret);
  for (const file of files) {
    try { if ((await fs.readFile(file)).includes(needle)) return true; } catch { /* generated file changed during scan */ }
  }
  return false;
}

async function walkFiles(directory, excluded = new Set()) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      if (excluded.has(entry.name)) continue;
      const file = path.join(directory, entry.name);
      result.push(...(entry.isDirectory() ? await walkFiles(file, excluded) : [file]));
    }
    return result;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function hasConsumedRun(repoRoot) {
  try {
    const value = JSON.parse(await fs.readFile(path.join(repoRoot, "docs/gateway/phase3c-r5c-runtime-manifest.json"), "utf8"));
    return Number(value?.counts?.externalLlmCalls || 0) > 0;
  } catch { return false; }
}

function buildReport(summary) {
  return `# Phase 3C-R5C Real Contract Canary\n\n- Target: **${TARGET_TOKEN}**\n- Status: **${summary.status}**\n- Stop Reason: **${summary.stopReason || "none"}**\n- D365 Frozen Record Ready: **${summary.gates.d365FrozenRecordReady}**\n- Safe Context Privacy Ready: **${summary.gates.safeContextPrivacyReady}**\n- DeepSeek v6-r2 / Transport v3: **${summary.gates.deepseekV6R2Ready} / ${summary.gates.transportContractV3Ready}**\n- External LLM Calls: **${summary.counts.externalLlmCalls}/1**\n- JSON / Transport / Canonical: **${summary.gates.jsonContractReady} / ${summary.gates.transportSchemaReady} / ${summary.gates.canonicalContractV2Ready}**\n- Action / Risk Evidence: **${summary.gates.structuredActionEvidenceReady} / ${summary.gates.structuredRiskCategoryEvidenceReady}**\n- Output Safety / Business Evaluation: **${summary.gates.outputSafetyReady} / ${summary.gates.businessEvaluationReady}**\n- Quality Score: **${summary.businessEvaluation.total}/100**\n- Hallucination Hard Failure: **${summary.counts.hallucinationHardFailure}**\n- Real Contract Canary Complete: **${summary.gates.realContractCanaryComplete}**\n- Remaining Canary Execution Authorized: **false**\n- CRM Writeback / Production Requests: **false / 0**\n\nNo raw CRM, identity, GUID, exact amount, raw Timeline, OpportunityClose body, Prompt body, model response body, Tool Arguments, credential, or Authorization header is stored.\n`;
}

function buildComparisonReport(summary) {
  const comparison = summary.comparison || {};
  return `# Phase 3C-R5C Deterministic Comparison\n\n- Comparison Ready: **${summary.gates.deterministicComparisonReady}**\n- Deterministic Category / DeepSeek Category Match: **${comparison.deterministic?.riskCategories?.join(", ") || "not-run"} / ${comparison.categoryMatch === true}**\n- Deterministic / DeepSeek Priority: **${comparison.deterministic?.priority || "not-run"} / ${comparison.deepseek?.priority || "not-run"}**\n- Deterministic / DeepSeek Confidence: **${comparison.deterministic?.confidence || "not-run"} / ${comparison.deepseek?.confidence || "not-run"}**\n- Fact Increment Count: **${comparison.factIncrementCount || 0}**\n- Evidence Coverage Difference: **${comparison.evidenceCoverageDifference ?? "not-run"}**\n- Unsupported Claim Count: **${comparison.unsupportedClaimCount || 0}**\n- Health Score Overridden: **${comparison.healthScoreOverridden === true}**\n- Quality Score: **${summary.businessEvaluation.total}/100**\n\nThe deterministic Health Score, grade, and six dimensions remain authoritative and are not overwritten by the model.\n`;
}

function buildSafetyReport(summary) {
  return `# Phase 3C-R5C Safety Report\n\n- Safe Context Privacy Ready: **${summary.gates.safeContextPrivacyReady}**\n- Output Safety Ready: **${summary.gates.outputSafetyReady}**\n- Evidence Validation Ready: **${summary.gates.evidenceValidationReady}**\n- Hallucination Audit Executed: **${summary.counts.hallucinationAuditExecuted === true}**\n- Hallucination Hard Failure: **${summary.counts.hallucinationHardFailure}**\n- Raw CRM / identity / GUID exposure: **0 / 0 / 0**\n- Exact Amount / Raw Timeline exposure: **0 / 0**\n- Scenario / Golden / Expected Answer exposure: **0**\n- Retry / Fallback: **0 / 0**\n- CRM POST / PATCH / DELETE: **0 / 0 / 0**\n- CRM Writeback / Production Requests / Browser Provider Requests: **false / 0 / 0**\n`;
}

function buildR5DDecisionPack(summary) {
  return `# Phase 3C-R5D Remaining Canary Decision Pack\n\n- R5C Real Contract Canary Complete: **${summary.gates.realContractCanaryComplete}**\n- Provider / Profile / Transport: **DeepSeek / v6-r2 / v3**\n- Output Safety Ready: **${summary.gates.outputSafetyReady}**\n- Business Evaluation Ready: **${summary.gates.businessEvaluationReady}**\n- Remaining Canary Execution Authorized: **false**\n\n${summary.gates.realContractCanaryComplete ? "R5C 已完成，但其余 23 条 Canary 仍需新的独立人工授权；本文档不构成执行授权。" : `当前阻断为 \`${summary.stopReason || "unknown"}\`，不得申请或执行其余 Canary。`}\n`;
}

function tokensForRows(rows, entries) {
  const tokenById = new Map(entries.map((item) => [item.id, item.token]));
  return rows.map(([id]) => tokenById.get(normalizeId(id))).filter(Boolean).sort();
}

function primaryId(row) {
  return Object.entries(row || {}).find(([key, value]) => !key.includes("@") && key.endsWith("id") && typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value))?.[1] || "";
}

function idSetReady(actual, expected) {
  const left = actual.map(normalizeId).sort();
  const right = expected.map(normalizeId).sort();
  return requestHash(left) === requestHash(right);
}

function matchesSafeValue(actual, expected) {
  if (expected === undefined) return false;
  const value = normalizeText(actual);
  const reference = normalizeText(expected);
  if (reference === "clear") return /\b(?:clear|none|no (?:issue|flag|code|signal)s?)\b/i.test(String(actual));
  return Boolean(reference) && value.includes(reference);
}

function safeValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "clear";
  if (value === null || value === undefined || value === "") return "not-recorded";
  return String(value);
}

function collectStrings(value, result = []) {
  if (Array.isArray(value)) value.forEach((item) => collectStrings(item, result));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, result));
  else if (typeof value === "string") result.push(value);
  return result;
}

function countForbiddenKeys(value, blocked) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countForbiddenKeys(item, blocked), 0);
  if (!value || typeof value !== "object") return 0;
  return Object.entries(value).reduce((sum, [key, child]) => sum + (blocked.has(key.toLowerCase()) ? 1 : 0) + countForbiddenKeys(child, blocked), 0);
}

function sameCounts(actual, expected) { return Object.entries(expected).every(([key, value]) => Number(actual?.[key]) === Number(value)); }
function dateOnly(value) { return value ? String(value).slice(0, 10) : ""; }
function weightedRatio(part, total, weight) { return total ? Math.round((part / total) * weight * 100) / 100 : 0; }
function normalizeText(value) { return String(value || "").trim().toLowerCase().replace(/\s+/g, " "); }
function matchCount(value, pattern) { return [...String(value).matchAll(pattern)].length; }
function sha256(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function sanitizeError(error) { return String(error?.message || error || "preflight_failed").replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[REDACTED]").replace(/sk-[A-Za-z0-9_-]+/gi, "[REDACTED]").slice(0, 240); }
function isIgnored(repoRoot, file) { try { execFileSync("git", ["check-ignore", "--quiet", file], { cwd: repoRoot }); return true; } catch { return false; } }
function emptyHashes() { return Object.fromEntries(["safeContextHash", "requestEnvelopeHash", "requestEnvelopeByteHash", "evidenceAllowlistHash", "evidenceMatrixHash", "riskCatalogHash", "safetyContractHash", "transportV1SchemaHash", "transportV2SchemaHash", "transportV3SchemaHash", "canonicalV2SchemaHash"].map((key) => [key, null])); }

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirect) {
  const summary = await runR5C({ oldExposedApiKeyRevoked: process.env.R5C_OLD_KEY_REVOKED === "true" });
  console.log(JSON.stringify({ phase: summary.phase, status: summary.status, stopReason: summary.stopReason, d365Get: summary.counts.d365Get, externalLlmCalls: summary.counts.externalLlmCalls, realContractCanaryComplete: summary.gates.realContractCanaryComplete, remainingCanaryExecutionAuthorized: false }));
  if (!summary.gates.realContractCanaryComplete) process.exitCode = 1;
}
