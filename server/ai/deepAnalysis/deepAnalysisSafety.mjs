import { safeDecisionContextKeys } from "../../decision/safeContext.mjs";
import { HIGH_FIDELITY_MODE } from "./highFidelityContext.mjs";

const FORBIDDEN_KEYS = new Set(["scenarioId", "scenarioTag", "primaryScenario", "secondarySignals", "rawOpportunity", "rawAccount", "rawContact", "timeline", "timelineText", "customerName", "contactName", "email", "phone", "address", "exactAmount", "location", "pol", "pod", "apiKey", "authorization"]);
const SAFE_TOP_LEVEL = new Set(["templateCode", "templateVersion", "safeDecisionContext", "safeAccountAggregate", "derivedSignals", "timelineExecutiveAnalysisPack", "schemaVersion", "instruction", "safeFactCatalog", "responseLocale"]);
const HIGH_FIDELITY_TOP_LEVEL = new Set(["analysisContextMode", "templateCode", "templateVersion", "highFidelityContext", "redactionRuleVersion", "instruction", "responseLocale"]);

export function validateDeepAnalysisProviderPayload(payload) {
  if (!isRecord(payload)) return fail("payload_not_object");
  if (Object.keys(payload).some((key) => !SAFE_TOP_LEVEL.has(key))) return fail("unexpected_top_level_key");
  if (!/^DA-0[1-9]$/.test(payload.templateCode) || typeof payload.templateVersion !== "string") return fail("invalid_template_identity");
  if (!isRecord(payload.safeDecisionContext) || !isRecord(payload.safeAccountAggregate)) return fail("missing_safe_context");
  if (Object.keys(payload.safeDecisionContext).some((key) => !safeDecisionContextKeys.includes(key))) return fail("unsafe_context_key");
  const unsafe = findForbidden(payload);
  if (unsafe) return fail(`forbidden_${unsafe}`);
  return { ok: true, status: "pass" };
}

export function validateHighFidelityProviderPayload(payload) {
  if (!isRecord(payload)) return fail("payload_not_object");
  if (Object.keys(payload).some((key) => !HIGH_FIDELITY_TOP_LEVEL.has(key))) return fail("unexpected_high_fidelity_top_level_key");
  if (payload.analysisContextMode !== HIGH_FIDELITY_MODE || !/^DA-0[1-9]$/.test(payload.templateCode) || typeof payload.templateVersion !== "string") return fail("invalid_high_fidelity_identity");
  const context = payload.highFidelityContext;
  if (!isRecord(context) || context.analysisContextMode !== HIGH_FIDELITY_MODE || context.customerCompanyMasked !== true || context.customerContactMasked !== true || context.crmBusinessTextIncluded !== true) return fail("high_fidelity_redaction_metadata_missing");
  if (context.exactAmountIncluded !== true || context.exactDateIncluded !== true || context.routeAndCommercialTermsIncluded !== true) return fail("high_fidelity_business_text_metadata_missing");
  const serialized = JSON.stringify(context);
  if (/"(?:accountid|contactid|opportunityid|fullname|emailaddress1|telephone1|notetext|description|rawAccount|rawContact)"\s*:/iu.test(serialized)) return fail("high_fidelity_raw_field_key");
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu.test(serialized)) return fail("high_fidelity_guid");
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(serialized)) return fail("high_fidelity_email");
  if (context.residualScan && (
    context.residualScan.rawValueMatchCount
    || context.residualScan.customerCompanyResidual
    || context.residualScan.customerContactResidual
    || context.residualScan.emailResidual
    || context.residualScan.phoneResidual
    || context.residualScan.guidResidual
    || context.residualScan.credentialResidual
    || context.residualScan.guidCount
    || context.residualScan.emailCount
    || context.residualScan.phoneCount
    || context.residualScan.credentialCount
    || context.residualScan.forbiddenKeyCount
  )) return fail("high_fidelity_residual_scan_failed");
  if (/(?:bearer\s+[A-Z0-9._-]+|sk-[A-Z0-9._-]+|(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=])/iu.test(serialized)) return fail("high_fidelity_credential");
  return { ok: true, status: "pass", analysisContextMode: HIGH_FIDELITY_MODE };
}

export function sanitizeDeepAnalysisAudit(entry) {
  const allowed = ["requestId", "templateCode", "templateVersion", "opportunityToken", "accountToken", "role", "departmentScopeStatus", "safeContextHash", "dataCategories", "missingDependencies", "provider", "latencyMs", "schemaStatus", "safetyStatus", "status", "reason", "timestamp", "analysisContextMode", "crmBusinessTextIncluded", "timelineBusinessTextIncluded", "exactAmountIncluded", "exactDateIncluded", "routeAndCommercialTermsIncluded", "customerCompanyMasked", "customerContactMasked", "redactionRuleVersion", "requestHash", "requestSchemaHash", "responseHash", "providerAlias", "modelAlias", "tokenUsage", "estimatedCost", "confirmationTimestamp", "safetyResult", "crmWritebackEnabled", "rawUnredactedCustomerIdentitySent", "identityRedactedBusinessTextSent", "httpStatus", "choiceCount", "finishReason", "toolCallsCount", "toolCallType", "functionName", "argumentsType", "argumentsLength", "argumentsHash", "diagnosticCategory", "validationErrors", "validationDiagnostics", "unknownAliasCount", "evidenceContractHash", "evidenceAliasCount", "evidenceDeduplicationApplied", "responseId"];
  return Object.fromEntries(allowed.filter((key) => Object.hasOwn(entry, key)).map((key) => [key, entry[key]]));
}

function findForbidden(value, path = "") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) { const found = findForbidden(value[index], `${path}[${index}]`); if (found) return found; }
    return "";
  }
  if (!isRecord(value)) return "";
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) return path ? `${path}.${key}` : key;
    const found = findForbidden(child, path ? `${path}.${key}` : key);
    if (found) return found;
  }
  return "";
}

function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function fail(reason) { return { ok: false, status: "blocked", reason }; }
