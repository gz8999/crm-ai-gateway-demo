import { createHash } from "node:crypto";
import { containsForbiddenProviderContent } from "../ai/providers/promptBuilder.mjs";
import { openAiCompatibleThinking } from "../ai/providers/openaiCompatibleOptions.mjs";
import { UNIFIED_OUTPUT_SCHEMA_VERSION, unifiedOutputJsonSchema } from "./comparisonSchema.mjs";
import { EXTERNAL_MODEL_RESPONSE_VERSION, requestHash } from "./externalModelContract.mjs";
import { EXTERNAL_MODEL_RESPONSE_V2_VERSION, PROVIDER_TRANSPORT_CONTRACT_V1_VERSION, PROVIDER_TRANSPORT_CONTRACT_V2_VERSION, PROVIDER_TRANSPORT_CONTRACT_V3_VERSION, PROVIDER_TRANSPORT_CONTRACT_V4_VERSION, PROVIDER_TRANSPORT_CONTRACT_V5_VERSION, PROVIDER_TRANSPORT_CONTRACT_V6_VERSION, PROVIDER_TRANSPORT_CONTRACT_V7_VERSION, validateProviderTransportToolArgumentsV6, validateProviderTransportToolArgumentsV7, validateScopedOutputSafetyV2 } from "./externalModelContractV2.mjs";
import {
  buildDeepseekDecisionToolSchemaV6R6,
  buildDeepseekDecisionToolSchemaV6R5,
  buildDeepseekDecisionToolSchemaV6R4,
  buildDeepseekDecisionToolSchemaV6R2,
  buildDeepseekDecisionToolSchemaV6R3,
  deepseekDecisionToolSchema,
  deepseekDecisionToolSchemaV2,
  deepseekDecisionToolSchemaV5,
  deepseekDecisionToolSchemaV6,
  deepseekDecisionToolSchemaV6R1,
  deepseekStrictTool,
  deepseekStrictToolV2,
  deepseekStrictToolV3,
  deepseekStrictToolV4,
  deepseekStrictToolV5,
  deepseekStrictToolV6,
  deepseekStrictToolV6R1,
  deepseekStrictToolV6R2,
  deepseekStrictToolV6R3,
  deepseekStrictToolV6R4,
  deepseekStrictToolV6R5,
  deepseekStrictToolV6R6,
  lintDeepSeekRequestShape,
  lintDeepSeekRequestShapeV2,
  mapDeepSeekToolArgumentsToCanonical,
  mapDeepSeekToolArgumentsToCanonicalV2,
  mapDeepSeekToolArgumentsToCanonicalV5,
  mapDeepSeekToolArgumentsToCanonicalV6,
  mapDeepSeekToolArgumentsToCanonicalV6R1,
  mapDeepSeekToolArgumentsToCanonicalV6R2,
  mapDeepSeekToolArgumentsToCanonicalV6R3,
  mapDeepSeekToolArgumentsToCanonicalV6R4,
  mapDeepSeekToolArgumentsToCanonicalV6R5,
  mapDeepSeekToolArgumentsToCanonicalV6R6,
  schemaHash,
} from "./deepseekStrictSchema.mjs";
import { observeProviderError } from "./providerErrorObservability.mjs";
import { extractStrictToolArguments, parseProviderSuccessEnvelope, parseStrictToolArguments } from "./providerSuccessObservability.mjs";
import { buildSafeEvidenceCatalog, validateEvidenceTypeIndex } from "./riskCategoryContract.mjs";
import { buildSafeFactCatalog } from "./safeFactCatalog.mjs";
import { buildProviderSelectionCatalog } from "./providerSelectionCatalog.mjs";

const MAX_RESPONSE_BYTES = 64 * 1024;

export async function callComparisonProvider({ safeContext, accountAggregate, page, evidenceTypeByToken = {}, env = process.env, fetchImpl = globalThis.fetch, signal, requestCorrelation = "not-issued", onToolArgumentsParseFailure = null, onToolArgumentsParsed = null } = {}) {
  const timeoutMs = boundedNumber(env.LLM_TIMEOUT_MS, 20000, 100, 60000);
  const nativeStrict = env.PHASE3C_NATIVE_JSON_MODE === "strict-tool";
  const strictProfile = nativeStrict && ["v2", "v3", "v4", "v5", "v6", "v6-r1", "v6-r2", "v6-r3", "v6-r4", "v6-r5", "v6-r6"].includes(env.PHASE3C_SCHEMA_VERSION) ? env.PHASE3C_SCHEMA_VERSION : "v1";
  const schemaV2 = ["v2", "v3", "v4", "v5", "v6", "v6-r1", "v6-r2", "v6-r3", "v6-r4", "v6-r5", "v6-r6"].includes(strictProfile);
  const structuredSafetyV2 = ["v5", "v6", "v6-r1", "v6-r2", "v6-r3", "v6-r4", "v6-r5", "v6-r6"].includes(strictProfile);
  const structuredActionEvidence = ["v6", "v6-r1", "v6-r2", "v6-r3", "v6-r4", "v6-r5", "v6-r6"].includes(strictProfile);
  const structuredRiskCategoryEvidence = ["v6-r1", "v6-r2", "v6-r3", "v6-r4", "v6-r5", "v6-r6"].includes(strictProfile);
  const evidenceScopedTransport = ["v6-r2", "v6-r3", "v6-r4", "v6-r5", "v6-r6"].includes(strictProfile);
  const serializationHardenedTransport = ["v6-r3", "v6-r4", "v6-r5", "v6-r6"].includes(strictProfile);
  const factReferenceTransport = ["v6-r4", "v6-r5", "v6-r6"].includes(strictProfile);
  const referenceOnlyTransport = ["v6-r5", "v6-r6"].includes(strictProfile);
  const cardinalityTransport = strictProfile === "v6-r6";
  const payloadSafety = containsForbiddenProviderContent({ safeDecisionContext: safeContext, safeAccountAggregate: accountAggregate });
  if (!payloadSafety.ok) return { ok: false, called: false, reason: "safe_context_rejected", safetyStatus: "blocked" };
  const evidenceOptions = {
    evidenceTokens: safeContext?.evidenceTokens || [],
    evidenceTypeByToken,
    provider: "openai-compatible",
    model: String(env.LLM_MODEL || "deepseek-v4-pro"),
    modelVersion: String(env.LLM_MODEL || "deepseek-v4-pro"),
  };
  if (evidenceScopedTransport && !validateEvidenceTypeIndex(evidenceOptions).ready) {
    return { ok: false, called: false, reason: "evidence_type_index_invalid", safetyStatus: "not-run" };
  }
  if (factReferenceTransport) {
    try {
      evidenceOptions.factCatalog = buildSafeFactCatalog({ safeContext, accountAggregate, ...evidenceOptions });
      if (referenceOnlyTransport) evidenceOptions.selectionCatalog = buildProviderSelectionCatalog(evidenceOptions);
    } catch {
      return { ok: false, called: false, reason: "safe_fact_catalog_invalid", safetyStatus: "not-run" };
    }
  }
  const baseUrl = String(env.LLM_BASE_URL || "").replace(/\/$/, "");
  const body = buildComparisonRequestBody({ safeContext, accountAggregate, page, evidenceTypeByToken, env, nativeMode: nativeStrict, schemaVersion: strictProfile });
  const requestBodyHash = requestHash(body);
  const requestSchemaHash = schemaHash(nativeStrict ? (cardinalityTransport ? buildDeepseekDecisionToolSchemaV6R6(evidenceOptions) : referenceOnlyTransport ? buildDeepseekDecisionToolSchemaV6R5(evidenceOptions) : factReferenceTransport ? buildDeepseekDecisionToolSchemaV6R4(evidenceOptions) : serializationHardenedTransport ? buildDeepseekDecisionToolSchemaV6R3(evidenceOptions) : evidenceScopedTransport ? buildDeepseekDecisionToolSchemaV6R2(evidenceOptions) : structuredRiskCategoryEvidence ? deepseekDecisionToolSchemaV6R1 : structuredActionEvidence ? deepseekDecisionToolSchemaV6 : structuredSafetyV2 ? deepseekDecisionToolSchemaV5 : schemaV2 ? deepseekDecisionToolSchemaV2 : deepseekDecisionToolSchema) : unifiedOutputJsonSchema);
  if (nativeStrict) {
    const requestShape = schemaV2 ? lintDeepSeekRequestShapeV2(body) : lintDeepSeekRequestShape(body);
    if (!requestShape.ok) return { ok: false, called: false, reason: "strict_request_shape_invalid", safetyStatus: "not-run", requestShape };
  }
  let lastReason = "provider_failed";
  const maxAttempts = 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const callStarted = Date.now();
    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${env.LLM_API_KEY}` },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        lastReason = httpReason(response.status);
        const errorObservation = await observeProviderError(response, {
          requestCorrelation,
          endpointAlias: nativeStrict ? "deepseek-beta" : "openai-compatible",
          modelAlias: env.LLM_MODEL || "not-configured",
          requestSchemaHash,
          requestBodyHash,
        });
        return { ok: false, called: true, reason: lastReason, httpStatus: response.status, safetyStatus: "not-run", attempts: attempt + 1, errorObservation };
      }
      const raw = await response.text();
      if (Buffer.byteLength(raw) > MAX_RESPONSE_BYTES) return { ok: false, called: true, reason: "response_too_large", safetyStatus: "not-run", httpStatus: response.status };
      const responseLatencyMs = Date.now() - callStarted;
      const parsedEnvelope = parseProviderSuccessEnvelope(raw, { maxTokens: body.max_tokens, requestCorrelation, latencyMs: responseLatencyMs });
      if (!parsedEnvelope.ok) return { ok: false, called: true, reason: "provider_response_not_json", diagnosticCategory: "SUCCESS_RESPONSE_JSON_INVALID", successResponseObservation: parsedEnvelope.observation, safetyStatus: "not-run", httpStatus: response.status, attempts: attempt + 1, requestBodyHash, requestSchemaHash };
      const envelope = parsedEnvelope.envelope;
      const successResponseObservation = { ...parsedEnvelope.observation, httpStatus: response.status };
      const message = envelope?.choices?.[0]?.message;
      let content = message?.content;
      let toolCallObservation = successResponseObservation;
      if (nativeStrict) {
        const extracted = extractStrictToolArguments(envelope, { toolName: "emit_decision_pack", observation: successResponseObservation });
        toolCallObservation = extracted.observation;
        if (!extracted.ok) return { ok: false, called: true, reason: legacyReasonForDiagnostic(extracted.category), diagnosticCategory: extracted.category, successResponseObservation: toolCallObservation, safetyStatus: "not-run", httpStatus: response.status, attempts: attempt + 1, requestBodyHash, requestSchemaHash, toolCallCount: toolCallObservation.toolCallsCount, toolCallName: toolCallObservation.functionName };
        content = extracted.argumentsText;
      }
      if (typeof content !== "string") return { ok: false, called: true, reason: "provider_content_missing", diagnosticCategory: nativeStrict ? "ARGUMENT_TYPE_INVALID" : "TOOL_CALL_SHAPE_INVALID", successResponseObservation: toolCallObservation, safetyStatus: "not-run", httpStatus: response.status };
      if (Buffer.byteLength(content) > MAX_RESPONSE_BYTES) return { ok: false, called: true, reason: "response_too_large", safetyStatus: "not-run", httpStatus: response.status };
      let output;
      if (nativeStrict) {
        const parsedArguments = parseStrictToolArguments(content, {
          observation: toolCallObservation,
          onParseFailure: ({ error, normalizedArguments }) => onToolArgumentsParseFailure?.({ argumentsText: content, error, normalizedArguments }),
          onParseSuccess: ({ value, normalizedArguments }) => onToolArgumentsParsed?.({ argumentsText: content, value, normalizedArguments }),
        });
        if (!parsedArguments.ok) return {
          ok: false,
          called: true,
          reason: legacyReasonForDiagnostic(parsedArguments.category),
          diagnosticCategory: parsedArguments.category,
          successResponseObservation: parsedArguments.observation,
          safetyStatus: "not-run",
          httpStatus: response.status,
          attempts: attempt + 1,
          requestBodyHash,
          requestSchemaHash,
          ...(serializationHardenedTransport ? {
            responseBodyHash: sha256(raw),
            toolArgumentsHash: sha256(content),
            usage: sanitizeUsage(envelope.usage),
          } : {}),
          toolCallCount: toolCallObservation.toolCallsCount,
          toolCallName: toolCallObservation.functionName,
        };
        output = parsedArguments.value;
      } else {
        try { output = JSON.parse(content); } catch (error) {
          if (error instanceof SyntaxError) return { ok: false, called: true, reason: "output_not_json", safetyStatus: "not-run", httpStatus: response.status };
          return { ok: false, called: true, reason: "output_contract_invalid", safetyStatus: "not-run", httpStatus: response.status, contractError: error.message };
        }
      }
      let riskCategoryEvidence = [];
      try {
        if (referenceOnlyTransport) {
          const transportValidation = cardinalityTransport
            ? validateProviderTransportToolArgumentsV7(output, evidenceOptions)
            : validateProviderTransportToolArgumentsV6(output, evidenceOptions);
          if (!transportValidation.ok) return {
            ok: false,
            called: true,
            reason: "output_contract_invalid",
            diagnosticCategory: "ARGUMENT_SCHEMA_INVALID",
            successResponseObservation: toolCallObservation,
            safetyStatus: "not-run",
            httpStatus: response.status,
            attempts: attempt + 1,
            usage: sanitizeUsage(envelope.usage),
            requestBodyHash,
            requestSchemaHash,
            responseBodyHash: sha256(raw),
            toolCallCount: toolCallObservation.toolCallsCount,
            toolCallName: toolCallObservation.functionName,
            toolArgumentsHash: sha256(content),
            schemaDiagnostics: transportValidation.schemaDiagnostics,
            transportErrors: transportValidation.errors,
            canonicalMappingReady: false,
          };
        }
        if (nativeStrict) output = cardinalityTransport
          ? (() => {
            const mapped = mapDeepSeekToolArgumentsToCanonicalV6R6(output, evidenceOptions);
            riskCategoryEvidence = mapped.riskCategoryEvidence;
            return mapped.output;
          })()
          : referenceOnlyTransport
          ? (() => {
            const mapped = mapDeepSeekToolArgumentsToCanonicalV6R5(output, evidenceOptions);
            riskCategoryEvidence = mapped.riskCategoryEvidence;
            return mapped.output;
          })()
          : factReferenceTransport
          ? (() => {
            const mapped = mapDeepSeekToolArgumentsToCanonicalV6R4(output, evidenceOptions);
            riskCategoryEvidence = mapped.riskCategoryEvidence;
            return mapped.output;
          })()
          : serializationHardenedTransport
          ? (() => {
            const mapped = mapDeepSeekToolArgumentsToCanonicalV6R3(output, evidenceOptions);
            riskCategoryEvidence = mapped.riskCategoryEvidence;
            return mapped.output;
          })()
          : evidenceScopedTransport
          ? (() => {
            const mapped = mapDeepSeekToolArgumentsToCanonicalV6R2(output, evidenceOptions);
            riskCategoryEvidence = mapped.riskCategoryEvidence;
            return mapped.output;
          })()
          : structuredRiskCategoryEvidence
          ? (() => {
            const mapped = mapDeepSeekToolArgumentsToCanonicalV6R1(output, evidenceOptions);
            riskCategoryEvidence = mapped.riskCategoryEvidence;
            return mapped.output;
          })()
          : structuredActionEvidence
          ? mapDeepSeekToolArgumentsToCanonicalV6(output, { evidenceTokens: safeContext?.evidenceTokens || [] })
          : structuredSafetyV2
            ? mapDeepSeekToolArgumentsToCanonicalV5(output, { evidenceTokens: safeContext?.evidenceTokens || [] })
          : schemaV2
            ? mapDeepSeekToolArgumentsToCanonicalV2(output)
            : mapDeepSeekToolArgumentsToCanonical(output);
      } catch (error) {
        return {
          ok: false,
          called: true,
          reason: "output_contract_invalid",
          diagnosticCategory: "ARGUMENT_SCHEMA_INVALID",
          successResponseObservation: toolCallObservation,
          safetyStatus: "not-run",
          httpStatus: response.status,
          attempts: attempt + 1,
          contractError: error.message,
          usage: sanitizeUsage(envelope.usage),
          requestBodyHash,
          requestSchemaHash,
          responseBodyHash: sha256(raw),
          toolCallCount: nativeStrict ? toolCallObservation.toolCallsCount : 0,
          toolCallName: nativeStrict ? toolCallObservation.functionName : null,
          toolArgumentsHash: nativeStrict ? sha256(content) : null,
          canonicalMappingReady: false,
        };
      }
      const safety = structuredSafetyV2 ? validateScopedOutputSafetyV2(output) : containsForbiddenProviderContent(output);
      if (!safety.ok) return {
        ok: false,
        called: true,
        reason: "sensitive_output_rejected",
        safetyStatus: "blocked",
        blockedPatternKey: safety.blockedPatternKey || "",
        httpStatus: response.status,
        attempts: attempt + 1,
        usage: sanitizeUsage(envelope.usage),
        requestBodyHash,
        requestSchemaHash,
        responseBodyHash: sha256(raw),
        toolCallCount: nativeStrict ? toolCallObservation.toolCallsCount : 0,
        toolCallName: nativeStrict ? toolCallObservation.functionName : null,
        toolArgumentsHash: nativeStrict ? sha256(content) : null,
        successResponseObservation: toolCallObservation,
        canonicalMappingReady: nativeStrict,
      };
      return {
        ok: true,
        called: true,
        output,
        attempts: attempt + 1,
        safetyStatus: "pass",
        schemaVersion: nativeStrict ? (structuredSafetyV2 ? EXTERNAL_MODEL_RESPONSE_V2_VERSION : EXTERNAL_MODEL_RESPONSE_VERSION) : UNIFIED_OUTPUT_SCHEMA_VERSION,
        transportContractVersion: cardinalityTransport ? PROVIDER_TRANSPORT_CONTRACT_V7_VERSION : referenceOnlyTransport ? PROVIDER_TRANSPORT_CONTRACT_V6_VERSION : factReferenceTransport ? PROVIDER_TRANSPORT_CONTRACT_V5_VERSION : serializationHardenedTransport ? PROVIDER_TRANSPORT_CONTRACT_V4_VERSION : evidenceScopedTransport ? PROVIDER_TRANSPORT_CONTRACT_V3_VERSION : structuredRiskCategoryEvidence ? PROVIDER_TRANSPORT_CONTRACT_V2_VERSION : structuredActionEvidence ? PROVIDER_TRANSPORT_CONTRACT_V1_VERSION : null,
        nativeJsonMode: nativeStrict ? "strict-tool" : "json-object",
        usage: sanitizeUsage(envelope.usage),
        providerModel: typeof envelope.model === "string" ? envelope.model : String(env.LLM_MODEL || ""),
        httpStatus: response.status,
        requestBodyHash,
        requestSchemaHash,
        responseBodyHash: sha256(raw),
        toolCallCount: nativeStrict ? toolCallObservation.toolCallsCount : 0,
        toolCallName: nativeStrict ? toolCallObservation.functionName : null,
        toolArgumentsHash: nativeStrict ? sha256(content) : null,
        successResponseObservation: toolCallObservation,
        canonicalMappingReady: nativeStrict,
        riskCategoryEvidence: structuredRiskCategoryEvidence ? riskCategoryEvidence : [],
      };
    } catch (error) {
      lastReason = error?.name === "AbortError" ? "provider_timeout" : "provider_network_error";
      if (signal?.aborted) return { ok: false, called: true, reason: "request_cancelled", safetyStatus: "not-run" };
      return { ok: false, called: true, reason: lastReason, safetyStatus: "not-run", attempts: attempt + 1 };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  return { ok: false, called: true, reason: lastReason, safetyStatus: "not-run" };
}

export function buildComparisonPayload({ safeContext, accountAggregate, page, evidenceTypeByToken = {}, providerModel = "deepseek-v4-pro", nativeMode = false, schemaVersion = "v1" }) {
  const evidenceScopedTransport = ["v6-r2", "v6-r3", "v6-r4", "v6-r5", "v6-r6"].includes(schemaVersion);
  const serializationHardenedTransport = ["v6-r3", "v6-r4", "v6-r5", "v6-r6"].includes(schemaVersion);
  const factReferenceTransport = ["v6-r4", "v6-r5", "v6-r6"].includes(schemaVersion);
  const referenceOnlyTransport = ["v6-r5", "v6-r6"].includes(schemaVersion);
  const cardinalityTransport = schemaVersion === "v6-r6";
  const structuredRiskCategoryEvidence = ["v6-r1", "v6-r2", "v6-r3", "v6-r4", "v6-r5", "v6-r6"].includes(schemaVersion);
  const structuredActionEvidence = ["v6", "v6-r1", "v6-r2", "v6-r3", "v6-r4", "v6-r5", "v6-r6"].includes(schemaVersion);
  const structuredSafetyV2 = ["v5", "v6", "v6-r1", "v6-r2", "v6-r3", "v6-r4", "v6-r5", "v6-r6"].includes(schemaVersion);
  const factCatalog = factReferenceTransport ? buildSafeFactCatalog({ safeContext, accountAggregate, evidenceTokens: safeContext?.evidenceTokens || [], evidenceTypeByToken }) : [];
  const selectionCatalog = referenceOnlyTransport ? buildProviderSelectionCatalog({ evidenceTokens: safeContext?.evidenceTokens || [], evidenceTypeByToken }) : null;
  const evidenceOptions = { evidenceTokens: safeContext?.evidenceTokens || [], evidenceTypeByToken, factCatalog, selectionCatalog, provider: "openai-compatible", model: providerModel, modelVersion: providerModel };
  const strictSchema = cardinalityTransport
    ? buildDeepseekDecisionToolSchemaV6R6(evidenceOptions)
    : referenceOnlyTransport
    ? buildDeepseekDecisionToolSchemaV6R5(evidenceOptions)
    : factReferenceTransport
    ? buildDeepseekDecisionToolSchemaV6R4(evidenceOptions)
    : serializationHardenedTransport
    ? buildDeepseekDecisionToolSchemaV6R3(evidenceOptions)
    : evidenceScopedTransport
    ? buildDeepseekDecisionToolSchemaV6R2(evidenceOptions)
    : structuredRiskCategoryEvidence
      ? deepseekDecisionToolSchemaV6R1
    : structuredActionEvidence
      ? deepseekDecisionToolSchemaV6
      : structuredSafetyV2
        ? deepseekDecisionToolSchemaV5
        : ["v2", "v3", "v4"].includes(schemaVersion)
          ? deepseekDecisionToolSchemaV2
          : deepseekDecisionToolSchema;
  const serializationProfile = nativeMode && ["v3", "v4", "v5", "v6", "v6-r1", "v6-r2", "v6-r3", "v6-r4", "v6-r5", "v6-r6"].includes(schemaVersion);
  return {
    instruction: cardinalityTransport
      ? "Analyze only the supplied sanitized context. Call emit_decision_pack exactly once. Populate every required-slot object with consecutive itemNN keys exactly as constrained by the Tool Schema. Return only exact catalog codes, request-scoped evidence tokens, enum values, and fixed safety fields. Do not generate free text, identity, exact amounts, raw communication content, scenario metadata, Golden metadata, or health score fields."
      : referenceOnlyTransport
      ? "Analyze only the supplied sanitized context. Call emit_decision_pack exactly once. Return only exact catalog codes, request-scoped evidence tokens, enum values, and fixed safety fields. Do not generate any free text because the server expands every selected reference deterministically. Do not emit identity, exact amounts, raw communication content, scenario metadata, Golden metadata, or health score fields."
      : factReferenceTransport
      ? "Analyze only the supplied sanitized context. Call emit_decision_pack exactly once. Select each fact only by exact factCode from the Safe Fact Catalog. Never generate, copy, or rewrite fact labels or values because the server maps them deterministically. Use only exact request-scoped evidence tokens. Keep all remaining free text concise, single-line, and free of quotation marks, backslashes, and control characters. Do not emit identity, exact amounts, raw communication content, scenario metadata, Golden metadata, or health score fields."
      : serializationHardenedTransport
      ? "Analyze only the supplied sanitized context. Call emit_decision_pack exactly once. Use only exact evidence tokens allowed by the request-scoped schema. Every free-text value must be concise, single-line, and contain no quotation mark, backslash, or control character. Use the fixed owner, due-window, provider, model, fallback, safety, and limitation values exactly as constrained. Do not emit identity, exact amounts, raw communication content, scenario metadata, Golden metadata, or health score fields."
      : evidenceScopedTransport
      ? "Analyze only the supplied sanitized context. Call emit_decision_pack exactly once. The Safe Evidence Catalog declares each allowed evidence token and its safe type. Select only a risk category and evidence token combination permitted by the request-scoped tool schema. Include every required safety assertion. Do not emit aliases, expected answers, health score fields, identity, exact amounts, or raw communication content. All actions are Draft only."
      : structuredRiskCategoryEvidence
      ? "Analyze only the supplied sanitized synthetic context. Call emit_decision_pack exactly once. For every recommended action and every risk category, provide a non-empty evidenceTokens array containing only exact tokens from the supplied Safe Context. Select each risk category code only from the tool schema enum and do not emit aliases or free-text categories. Keep basis concise, use only schema-approved limitation and safety policy enum codes, and do not emit or override health score, grade, or dimensions. All actions are Draft only."
      : structuredActionEvidence
      ? "Analyze only the supplied sanitized synthetic context. Call emit_decision_pack exactly once. For every recommended action, provide a non-empty evidenceTokens array containing only exact tokens from the supplied Safe Context; keep basis as a concise explanation and do not embed identity, exact amounts, or raw communication content. Use only schema-approved limitation and safety policy enum codes. Do not emit or override health score, grade, or dimensions. All actions are Draft only."
      : structuredSafetyV2
      ? "Analyze only the supplied sanitized synthetic context. Call emit_decision_pack exactly once. Use only supplied evidence tokens. Express limitations and safety declarations only with the schema-approved enum codes and only at their designated paths. Keep facts, inferences, evidence, confidence reasons, action text, basis, due windows, and fallback reason free of field labels, identities, exact amounts, raw communication content, scenario metadata, Golden metadata, or claims that CRM work was performed. Do not emit or override health score, grade, or dimensions. All actions are Draft only and must cite supplied evidence."
      : nativeMode
      ? "Analyze only the supplied sanitized decision context. The model must call emit_decision_pack exactly once. Do not write markdown or prose. Use only evidence tokens from the supplied Safe Context. Do not infer identities, exact amounts, communication content, route events, or external facts. All actions are Draft only and must use a source-backed basis."
      : "Analyze only the supplied sanitized decision context. Return one valid JSON object matching the supplied schema; do not return markdown or prose. A minimal shape is {\"id\":\"...\",\"title\":\"...\",\"fact\":[{\"label\":\"...\",\"value\":\"...\",\"source\":\"safeContext.<field>\"}],\"inference\":\"...\",\"evidence\":[{\"label\":\"...\",\"value\":\"...\",\"source\":\"safeContext.<field>\"}],\"confidence\":{\"level\":\"Medium\",\"reason\":\"...\"},\"recommendedAction\":[{\"title\":\"...\",\"reason\":\"...\",\"owner\":\"待人工指定\",\"due\":\"待人工确定\",\"status\":\"Draft only\"}],\"priority\":\"Medium\"}. Separate facts, inference, evidence, confidence, and draft actions. Every fact and evidence source must exactly use safeContext.<field> or safeContext.accountAggregate.<field>; never use another source label. Do not infer identities, exact amounts, communication content, route events, or external facts.",
    providerInput: {
      safeDecisionContext: safeContext,
      safeAccountAggregate: accountAggregate,
      ...(evidenceScopedTransport ? { safeEvidenceCatalog: buildSafeEvidenceCatalog(evidenceOptions) } : {}),
      ...(factReferenceTransport ? { safeFactCatalog: factCatalog } : {}),
      ...(referenceOnlyTransport ? {
        safeInferenceCatalog: selectionCatalog.inferences,
        safeActionCatalog: selectionCatalog.actions,
        safeConfidenceCatalog: selectionCatalog.confidence,
      } : {}),
      requestedPage: page,
      outputSchemaVersion: nativeMode ? (structuredSafetyV2 ? EXTERNAL_MODEL_RESPONSE_V2_VERSION : EXTERNAL_MODEL_RESPONSE_VERSION) : UNIFIED_OUTPUT_SCHEMA_VERSION,
      ...(cardinalityTransport
        ? { providerTransportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V7_VERSION }
        : referenceOnlyTransport
        ? { providerTransportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V6_VERSION }
        : factReferenceTransport
        ? { providerTransportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V5_VERSION }
        : serializationHardenedTransport
        ? { providerTransportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V4_VERSION }
        : evidenceScopedTransport
        ? { providerTransportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V3_VERSION }
        : structuredRiskCategoryEvidence
        ? { providerTransportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V2_VERSION }
        : structuredActionEvidence
          ? { providerTransportContractVersion: PROVIDER_TRANSPORT_CONTRACT_V1_VERSION }
          : {}),
      ...(!serializationProfile ? { outputSchema: nativeMode ? strictSchema : unifiedOutputJsonSchema } : {}),
    },
  };
}

export function buildComparisonRequestBody({ safeContext, accountAggregate, page, evidenceTypeByToken = {}, env = process.env, nativeMode = false, schemaVersion = "v1" } = {}) {
  const providerModel = String(env.LLM_MODEL || "deepseek-v4-pro");
  const payload = buildComparisonPayload({ safeContext, accountAggregate, page, evidenceTypeByToken, providerModel, nativeMode, schemaVersion });
  const factCatalog = ["v6-r4", "v6-r5", "v6-r6"].includes(schemaVersion) ? buildSafeFactCatalog({ safeContext, accountAggregate, evidenceTokens: safeContext?.evidenceTokens || [], evidenceTypeByToken }) : [];
  const selectionCatalog = ["v6-r5", "v6-r6"].includes(schemaVersion) ? buildProviderSelectionCatalog({ evidenceTokens: safeContext?.evidenceTokens || [], evidenceTypeByToken }) : null;
  const evidenceOptions = { evidenceTokens: safeContext?.evidenceTokens || [], evidenceTypeByToken, factCatalog, selectionCatalog, provider: "openai-compatible", model: providerModel, modelVersion: providerModel };
  return {
    model: env.LLM_MODEL,
    messages: [{ role: "system", content: payload.instruction }, { role: "user", content: JSON.stringify(payload.providerInput) }],
    ...openAiCompatibleThinking(env),
    max_tokens: boundedNumber(env.LLM_MAX_TOKENS, 1200, 100, 4000),
    temperature: 0,
    stream: false,
    ...(nativeMode ? {
      tools: [strictDecisionTool(schemaVersion, evidenceOptions)],
      tool_choice: { type: "function", function: { name: "emit_decision_pack" } },
    } : { response_format: { type: "json_object" } }),
  };
}

function strictDecisionTool(schemaVersion = "v1", options = {}) {
  if (schemaVersion === "v6-r6") return deepseekStrictToolV6R6(options);
  if (schemaVersion === "v6-r5") return deepseekStrictToolV6R5(options);
  if (schemaVersion === "v6-r4") return deepseekStrictToolV6R4(options);
  if (schemaVersion === "v6-r3") return deepseekStrictToolV6R3(options);
  if (schemaVersion === "v6-r2") return deepseekStrictToolV6R2(options);
  if (schemaVersion === "v6-r1") return deepseekStrictToolV6R1();
  if (schemaVersion === "v6") return deepseekStrictToolV6();
  if (schemaVersion === "v5") return deepseekStrictToolV5();
  if (schemaVersion === "v4") return deepseekStrictToolV4();
  if (schemaVersion === "v3") return deepseekStrictToolV3();
  return schemaVersion === "v2" ? deepseekStrictToolV2() : deepseekStrictTool();
}

function httpReason(status) { return status === 401 ? "provider_unauthorized" : status === 429 ? "provider_rate_limited" : status >= 500 ? "provider_unavailable" : `provider_http_${status}`; }
function boundedNumber(value, fallback, min, max) { const number = Number(value || fallback); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback; }
function legacyReasonForDiagnostic(category) {
  if (category === "TOOL_CALL_NOT_COMPLETED") return "tool_call_count_invalid";
  if (category === "TOOL_CALL_SHAPE_INVALID") return "tool_call_count_invalid";
  if (category === "TOOL_NAME_INVALID") return "tool_call_name_invalid";
  if (category === "ARGUMENT_JSON_INVALID") return "output_not_json";
  if (category === "ARGUMENT_SCHEMA_INVALID") return "output_contract_invalid";
  return "provider_content_missing";
}

function sanitizeUsage(value) {
  if (!value || typeof value !== "object") return null;
  const keys = ["prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens"];
  const usage = Object.fromEntries(keys.filter((key) => Number.isFinite(Number(value[key]))).map((key) => [key, Number(value[key])]));
  return Object.keys(usage).length ? usage : null;
}

function sha256(value) { return createHash("sha256").update(String(value), "utf8").digest("hex"); }
