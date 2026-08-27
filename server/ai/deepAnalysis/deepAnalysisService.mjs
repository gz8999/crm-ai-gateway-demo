import { randomUUID } from "node:crypto";
import { buildDeepAnalysisPreview, normalizeResponseLocale, publicDeepAnalysisPreview } from "./deepAnalysisContextBuilder.mjs";
import { runDeepAnalysisDemo } from "./deepAnalysisDemoProvider.mjs";
import { mapDeepAnalysisSelection, runDeepAnalysisExternal } from "./deepAnalysisExternalProvider.mjs";
import { mapHighFidelitySelection, runHighFidelityExternal } from "./highFidelityProvider.mjs";
import { createDeepAnalysisAuditStore } from "./deepAnalysisAudit.mjs";
import { publicDeepAnalysisOutputValidationReason, validateDeepAnalysisOutput } from "./deepAnalysisSchema.mjs";
import { validateDeepAnalysisProviderPayload, validateHighFidelityProviderPayload } from "./deepAnalysisSafety.mjs";
import { HIGH_FIDELITY_MODE, STANDARD_SAFE_MODE, buildHighFidelityContext } from "./highFidelityContext.mjs";
import { OPENAI_COMPATIBLE_PROVIDER, resolveProviderStatus } from "../providers/providerRouter.mjs";
import { getDeepAnalysisTemplate, listDeepAnalysisTemplates } from "./templateRegistry.mjs";
import { D365_FROZEN_TEST_HOST } from "../../d365/frozenDatasetContract.mjs";

const ALLOWED_ROLE = "demo-full-access";

export function createDeepAnalysisService({ env = process.env, now = () => new Date(), fetchImpl = globalThis.fetch, contextLoader = null, highFidelityContextLoader = null } = {}) {
  const results = new Map();
  const running = new Map();
  const audit = createDeepAnalysisAuditStore({ now });
  const featureEnabled = () => String(env.FEATURE_DEEP_ANALYSIS).toLowerCase() === "true";
  const externalFeatureEnabled = () => env.DEEP_ANALYSIS_EXTERNAL_ENABLED === undefined || String(env.DEEP_ANALYSIS_EXTERNAL_ENABLED).toLowerCase() === "true";
  const highFidelityFeatureEnabled = () => env.DEEP_ANALYSIS_HIGH_FIDELITY_ENABLED === undefined || String(env.DEEP_ANALYSIS_HIGH_FIDELITY_ENABLED).toLowerCase() === "true";

  function providerMode() {
    const status = resolveProviderStatus(env);
    const externalModelAvailable = externalFeatureEnabled() && status.provider === OPENAI_COMPATIBLE_PROVIDER && status.externalAiEnabled === true;
    return { provider: status.provider, externalModelAvailable, highFidelityAvailable: externalModelAvailable && highFidelityFeatureEnabled(), status };
  }

  function templates() {
    const mode = providerMode();
    return { featureEnabled: featureEnabled(), role: ALLOWED_ROLE, provider: mode.provider, externalModelAvailable: mode.externalModelAvailable, templates: listDeepAnalysisTemplates({ featureEnabled: featureEnabled() }) };
  }

  async function preview(input = {}) {
    assertFeature();
    assertRole(input.role);
    const template = assertTemplate(input.templateCode);
    const mode = providerMode();
    const analysisContextMode = input.analysisContextMode === HIGH_FIDELITY_MODE ? HIGH_FIDELITY_MODE : STANDARD_SAFE_MODE;
    if (analysisContextMode === HIGH_FIDELITY_MODE) assertHighFidelityPreconditions(input, mode);
    const decisionView = await loadDecisionView(input);
    const highFidelityContext = analysisContextMode === HIGH_FIDELITY_MODE ? await loadHighFidelityContext(input) : null;
    const built = buildDeepAnalysisPreview({ template, mode: input.mode, scenarioId: input.scenarioId, opportunityToken: input.opportunityToken, role: input.role, provider: mode.provider, externalModelAvailable: mode.externalModelAvailable, highFidelityAvailable: mode.highFidelityAvailable, responseLocale: normalizeResponseLocale(input.responseLocale), decisionView, analysisContextMode, highFidelityContext });
    const safety = analysisContextMode === HIGH_FIDELITY_MODE ? validateHighFidelityProviderPayload(built.providerInput) : validateDeepAnalysisProviderPayload(built.providerInput);
    if (!safety.ok) throw serviceError(400, "Deep analysis Safe Context blocked");
    return publicDeepAnalysisPreview(built);
  }

  async function run(input = {}) {
    assertFeature();
    assertRole(input.role);
    if (input.confirmed !== true) throw serviceError(400, "Explicit confirmation required");
    const template = assertTemplate(input.templateCode);
    const provider = providerMode();
    const analysisContextMode = input.analysisContextMode === HIGH_FIDELITY_MODE ? HIGH_FIDELITY_MODE : STANDARD_SAFE_MODE;
    if (analysisContextMode === HIGH_FIDELITY_MODE) {
      assertHighFidelityPreconditions(input, provider);
      if (input.highFidelityConfirmed !== true) throw serviceError(400, "High fidelity analysis confirmation required");
    }
    if (provider.status.providerRequested === OPENAI_COMPATIBLE_PROVIDER && !provider.externalModelAvailable) throw serviceError(503, "External deep analysis provider is not configured");
    const requestId = typeof input.requestId === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(input.requestId) ? input.requestId : randomUUID();
    const controller = new AbortController();
    const started = Date.now();
    let built = null;
    let safety = { status: "not-run" };
    running.set(requestId, controller);
    try {
      const decisionView = await loadDecisionView(input);
      const highFidelityContext = analysisContextMode === HIGH_FIDELITY_MODE ? await loadHighFidelityContext(input) : null;
      built = buildDeepAnalysisPreview({ template, mode: input.mode, scenarioId: input.scenarioId, opportunityToken: input.opportunityToken, role: input.role, provider: provider.provider, externalModelAvailable: provider.externalModelAvailable, highFidelityAvailable: provider.highFidelityAvailable, responseLocale: normalizeResponseLocale(input.responseLocale), decisionView, analysisContextMode, highFidelityContext });
      safety = analysisContextMode === HIGH_FIDELITY_MODE ? validateHighFidelityProviderPayload(built.providerInput) : validateDeepAnalysisProviderPayload(built.providerInput);
      if (!safety.ok) throw serviceError(400, "Deep analysis Safe Context blocked");
      if (controller.signal.aborted) throw new DOMException("Deep analysis cancelled", "AbortError");
      const execution = provider.externalModelAvailable
        ? await runExternal({ payload: built.providerInput, requestId, template, env, signal: controller.signal, fetchImpl })
        : { output: await runDeepAnalysisDemo({ payload: built.providerInput, requestId, signal: controller.signal }), telemetry: null };
      const output = execution.output;
      const schema = validateDeepAnalysisOutput(output);
      if (!schema.ok) throw outputValidationError(schema);
      const result = { requestId, status: "完成", progress: ["构建 Safe Context", "安全检查", provider.externalModelAvailable ? "模型分析中" : "Demo 分析中", "输出结构校验", "安全校验", "完成"], preview: publicDeepAnalysisPreview(built), output, schemaStatus: "pass", safetyStatus: "pass", citationStatus: "pass", latencyMs: Date.now() - started };
      results.set(requestId, result);
      audit.push(auditEntry(result, built, "completed", "", execution.telemetry));
      return result;
    } catch (error) {
      if (error?.name === "AbortError") {
        const result = { requestId, status: "已取消", progress: ["已取消"], preview: publicDeepAnalysisPreview(built), output: null, schemaStatus: "not-run", safetyStatus: "pass", citationStatus: "not-run", latencyMs: Date.now() - started };
        results.set(requestId, result);
        audit.push(auditEntry(result, built, "cancelled", "user_cancelled", null));
        return result;
      }
      if (!built) throw error;
      audit.push(auditEntry({ requestId, output: null, latencyMs: Date.now() - started, schemaStatus: "fail", safetyStatus: safety.status }, built, "failed", auditFailureReason(error), error?.telemetry || null));
      throw error;
    } finally { running.delete(requestId); }
  }

  function cancel(requestId) { const controller = running.get(requestId); if (!controller) return false; controller.abort(); return true; }
  function reset() { for (const controller of running.values()) controller.abort(); running.clear(); results.clear(); audit.clear(); }
  async function runExternal({ payload, requestId: externalRequestId, template, env: providerEnv, signal, fetchImpl: providerFetch }) {
    if (payload.analysisContextMode === HIGH_FIDELITY_MODE) {
      const providerResult = await runHighFidelityExternal({ payload, requestId: externalRequestId, env: providerEnv, signal, fetchImpl: providerFetch });
      if (!providerResult.ok) {
        const error = serviceError(502, formatProviderFailure("External high fidelity analysis", providerResult));
        error.telemetry = providerResult;
        throw error;
      }
      return { output: mapHighFidelitySelection({ selection: providerResult.selection, payload, requestId: externalRequestId, model: String(providerEnv.LLM_MODEL || "deepseek-v4-pro") }), telemetry: providerResult };
    }
    const providerResult = await runDeepAnalysisExternal({ payload, requestId: externalRequestId, env: providerEnv, signal, fetchImpl: providerFetch });
    if (!providerResult.ok) {
      const error = serviceError(502, formatProviderFailure("External deep analysis", providerResult));
      error.telemetry = providerResult;
      throw error;
    }
    return { output: mapDeepAnalysisSelection({ selection: providerResult.selection, payload, requestId: externalRequestId, factCatalog: providerResult.factCatalog, observation: providerResult.observation, model: String(providerEnv.LLM_MODEL || "deepseek-v4-pro"), template }), telemetry: providerResult };
  }

  async function loadDecisionView(input) {
    if (input.dataSource !== "d365-pilot") return null;
    if (typeof contextLoader !== "function") throw serviceError(503, "D365 Deep Analysis context is not configured");
    const view = await contextLoader({ opportunityToken: input.opportunityToken, department: input.department || "all" });
    if (!view) throw serviceError(404, "Deep analysis opportunity not found in D365 scope");
    return view;
  }

  async function loadHighFidelityContext(input) {
    if (typeof highFidelityContextLoader !== "function") throw serviceError(503, "High fidelity D365 context is not configured");
    const loaded = await highFidelityContextLoader({ opportunityToken: input.opportunityToken, department: input.department || "all" });
    if (!loaded) throw serviceError(404, "High fidelity opportunity not found in D365 scope");
    return buildHighFidelityContext({ data: loaded.data, scope: loaded.scope, opportunityToken: loaded.opportunityToken, now: now() });
  }

  function assertFeature() { if (!featureEnabled()) throw serviceError(403, "Deep analysis feature is disabled"); }
  function assertRole(role) { if (role !== ALLOWED_ROLE) throw serviceError(403, "Deep analysis role is not authorized"); }
  function assertTemplate(code) { const template = getDeepAnalysisTemplate(code); if (!template) throw serviceError(404, "Deep analysis template not found"); if (!template.enabled) throw serviceError(409, template.blockedReason || "Deep analysis template is blocked"); return template; }

  return { templates, preview, run, cancel, reset, listAudit: audit.list, getResult: (requestId) => results.get(requestId) || null };

  function assertHighFidelityPreconditions(input, mode) {
    if (input.dataSource !== "d365-pilot") throw serviceError(409, "High fidelity analysis requires the approved D365 Pilot data source");
    let host = "";
    try { host = new URL(String(env.DATAVERSE_URL || "")).hostname.toLowerCase(); } catch { host = ""; }
    if (host !== D365_FROZEN_TEST_HOST) throw serviceError(409, "High fidelity analysis requires the approved D365 test environment");
    if (!mode.highFidelityAvailable || mode.provider !== OPENAI_COMPATIBLE_PROVIDER) throw serviceError(503, "High fidelity external provider is not ready");
    if (writebackEnabled(env)) throw serviceError(409, "High fidelity analysis requires CRM Writeback=false");
    if (input.role !== ALLOWED_ROLE) throw serviceError(403, "High fidelity analysis role is not authorized");
  }
}

function auditEntry(result, built, status, reason, telemetry) {
  const observation = telemetry?.observation || {};
  return {
    requestId: result.requestId,
    templateCode: built.templateCode,
    templateVersion: built.templateVersion,
    opportunityToken: built.opportunityToken,
    accountToken: built.accountToken,
    role: built.role,
    departmentScopeStatus: built.departmentScopeStatus,
    safeContextHash: built.safeContextHash,
    dataCategories: built.availableData,
    missingDependencies: built.missingDependencies,
    provider: result.output?.provider?.used || built.provider,
    latencyMs: result.latencyMs,
    schemaStatus: result.schemaStatus,
    safetyStatus: result.safetyStatus,
    status,
    reason,
    analysisContextMode: built.analysisContextMode,
    crmBusinessTextIncluded: built.crmBusinessTextIncluded,
    timelineBusinessTextIncluded: built.timelineBusinessTextIncluded,
    exactAmountIncluded: built.exactAmountIncluded,
    exactDateIncluded: built.exactDateIncluded,
    routeAndCommercialTermsIncluded: built.routeAndCommercialTermsIncluded,
    customerCompanyMasked: built.customerCompanyMasked,
    customerContactMasked: built.customerContactMasked,
    redactionRuleVersion: built.redactionRuleVersion,
    requestHash: telemetry?.requestBodyHash || "",
    requestSchemaHash: telemetry?.requestSchemaHash || "",
    responseHash: observation.responseBodyHash || "",
    providerAlias: built.provider,
    modelAlias: observation.modelAlias || result.output?.provider?.model || "",
    tokenUsage: observation.tokenUsage || null,
    estimatedCost: telemetry?.estimatedCost ?? null,
    httpStatus: observation.httpStatus || telemetry?.httpStatus || 0,
    choiceCount: observation.choiceCount || 0,
    finishReason: observation.finishReason || "",
    toolCallsCount: observation.toolCallsCount || 0,
    toolCallType: observation.toolCallType || "",
    functionName: observation.functionName || "",
    argumentsType: observation.argumentsType || "",
    argumentsLength: observation.argumentsLength || 0,
    argumentsHash: observation.argumentsHash || "",
    diagnosticCategory: telemetry?.diagnosticCategory || "",
    validationErrors: Array.isArray(telemetry?.validation?.errors) ? telemetry.validation.errors.slice(0, 12) : [],
    validationDiagnostics: Array.isArray(telemetry?.validation?.diagnostics) ? telemetry.validation.diagnostics.slice(0, 30).map((item) => ({
      instancePath: typeof item.instancePath === "string" ? item.instancePath : "",
      schemaPath: typeof item.schemaPath === "string" ? item.schemaPath : "",
      reasonCode: typeof item.reasonCode === "string" ? item.reasonCode : "",
      missingProperty: typeof item.missingProperty === "string" ? item.missingProperty : "",
      duplicateIndex: Number.isInteger(item.duplicateIndex) ? item.duplicateIndex : null,
      unknownAliasCount: Number.isInteger(item.unknownAliasCount) ? item.unknownAliasCount : 0,
    })) : [],
    unknownAliasCount: Number.isInteger(telemetry?.validation?.unknownAliasCount) ? telemetry.validation.unknownAliasCount : 0,
    evidenceContractHash: typeof telemetry?.evidenceContractHash === "string" ? telemetry.evidenceContractHash : "",
    evidenceAliasCount: Number.isInteger(telemetry?.evidenceAliasCount) ? telemetry.evidenceAliasCount : 0,
    evidenceDeduplicationApplied: telemetry?.evidenceDeduplicationApplied === true,
    responseId: observation.responseId || "",
    confirmationTimestamp: built.analysisContextMode === HIGH_FIDELITY_MODE ? built.providerInput?.highFidelityContext?.confirmation?.confirmedAt || "" : "",
    safetyResult: result.safetyStatus,
    crmWritebackEnabled: Boolean(result.output?.safety?.crmWritebackEnabled),
    rawUnredactedCustomerIdentitySent: result.output?.safety?.rawUnredactedCustomerIdentitySent,
    identityRedactedBusinessTextSent: result.output?.safety?.identityRedactedBusinessTextSent,
  };
}
function serviceError(status, message) { const error = new Error(message); error.status = status; return error; }
function outputValidationError(validation) {
  const reason = publicDeepAnalysisOutputValidationReason(validation);
  const error = serviceError(500, `Deep analysis output validation failed: ${reason}`);
  error.code = "deep_analysis_output_validation_failed";
  error.outputValidationReason = reason;
  return error;
}
function auditFailureReason(error) {
  if (typeof error?.outputValidationReason === "string") return `output_validation:${error.outputValidationReason}`;
  return error?.message || "validation_failed";
}
function formatProviderFailure(prefix, providerResult) {
  const observation = providerResult?.observation || {};
  const details = [
    observation.finishReason ? `finish_reason=${observation.finishReason}` : "",
    Number.isFinite(observation.toolCallsCount) ? `tool_calls=${observation.toolCallsCount}` : "",
    observation.argumentsType ? `arguments_type=${observation.argumentsType}` : "",
    Array.isArray(providerResult?.validation?.errors) && providerResult.validation.errors.length ? `validation=${providerResult.validation.errors.slice(0, 8).join("|")}` : "",
  ].filter(Boolean).join(", ");
  return `${prefix} failed: ${providerResult?.reason || "provider_error"}${details ? ` (${details})` : ""}`;
}
function writebackEnabled(env) { return [env.CRM_WRITEBACK_ENABLED, env.ALLOW_CRM_WRITEBACK, env.CRM_WRITEBACK].some((value) => String(value || "").toLowerCase() === "true"); }
