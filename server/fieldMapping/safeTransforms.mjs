import { marginBand, relativeDateStatus, revenueBand, stableTokenFragment } from "../logisticsFields.mjs";
import { opportunityFieldMapping } from "./opportunityFieldMapping.mjs";

export const sensitiveContextKeys = [
  "customer_name",
  "contact_name",
  "contact_email",
  "phone",
  "address",
  "detailed_address",
  "exact_revenue",
  "exact_margin",
  "supplier_cost",
  "contract_text",
  "contract_price",
  "raw_timeline",
  "meeting_transcript",
];

export function buildDataverseSelect(mapping = opportunityFieldMapping) {
  return [...new Set(mapping
    .filter((field) => field.includeInSelect
      && field.sourceSystem === "sales_trial_d365"
      && isActiveTrialMapping(field)
      && isTrialLogicalNameConfirmed(field)
      && field.d365Name)
    .map((field) => field.d365Name))].join(",");
}

export function isActiveTrialMapping(field) {
  return field?.mappingStatus === "active" || field?.mappingStatus === "active_after_trial_field_created";
}

export function isTrialLogicalNameConfirmed(field) {
  if (typeof field?.realLogicalNameConfirmed === "boolean") return field.realLogicalNameConfirmed;
  return field?.realLogicalNameConfirmed?.trial === true;
}

export function formattedValue(row, d365Name) {
  return row?.[`${d365Name}@OData.Community.Display.V1.FormattedValue`] ?? null;
}

export function normalizeChoice(rawValue, formattedLabel, options = []) {
  const value = rawValue == null ? null : String(rawValue);
  const label = formattedLabel || options.find((item) => String(item.value) === value || item.label === value)?.label || value;
  const option = options.find((item) => String(item.value) === value || item.label === label || item.normalized === label);
  return {
    value,
    label: option?.label || label || null,
    normalized: option?.normalized || option?.label || label || null,
    rank: option?.rank,
  };
}

export function normalizeLookup(rawValue, formattedLabel, prefix = "TOKEN") {
  if (!rawValue && !formattedLabel) return { token: null, display: null };
  return {
    token: `${prefix}-${stableTokenFragment(rawValue || formattedLabel)}`,
    display: formattedLabel || rawValue || null,
  };
}

export function buildCrmData(raw = {}, mapping = opportunityFieldMapping) {
  return mapping
    .filter((field) => field.includeInCrmData)
    .map((field) => {
      const value = readFieldValue(raw, field);
      return {
        label: field.label,
        appName: field.appName,
        category: field.category,
        sensitivity: field.sensitivity,
        safeTransform: field.safeTransform,
        includeInSafeContext: field.includeInSafeContext,
        sourceSystem: field.sourceSystem,
        mappingStatus: field.mappingStatus,
        realLogicalNameConfirmed: field.realLogicalNameConfirmed,
        sourceLabel: field.sourceLabel,
        value: maskForCrmData(value, field.sensitivity),
        rawPresent: value !== null && value !== undefined && value !== "",
      };
    });
}

export function buildSafeOpportunityContext(raw = {}, { mapping = opportunityFieldMapping, now = new Date(), role = "Sales Owner" } = {}) {
  const safe = {};
  const removedFields = [];
  const transformedFields = [];
  const transformRows = [];
  const dataQualityFlags = new Set(Array.isArray(raw.data_quality_flags) ? raw.data_quality_flags : []);

  for (const field of mapping) {
    const rawValue = readFieldValue(raw, field);
    if (field.requiredForDemo && isMissing(rawValue) && field.appName !== "dataQualityFlags") {
      dataQualityFlags.add(`missing_${field.appName}`);
    }

    const transformed = applySafeTransform(rawValue, field, raw, now);
    const includeSafe = canIncludeInSafeContext(field, transformed.value);
    if (includeSafe && field.appName !== "opportunityName") safe[field.appName] = transformed.value;
    if ((!includeSafe || transformed.removed) && !isMissing(rawValue)) removedFields.push(field.appName);
    if (transformed.changed) transformedFields.push(field.appName);
    transformRows.push({
      sourceField: field.d365Name || field.sourceLabel || field.appName,
      sourcePreview: sourcePreview(rawValue, field, role),
      sourcePresent: !isMissing(rawValue),
      sourceMasked: shouldMaskSource(field, role, rawValue),
      targetField: includeSafe ? field.appName : "removed",
      outputValue: includeSafe ? transformed.value : "removed",
      method: transformed.method,
      label: field.label,
      appName: field.appName,
      sensitivity: field.sensitivity,
      safeTransform: field.safeTransform,
      includeInSafeContext: field.includeInSafeContext,
      sourceSystem: field.sourceSystem,
      mappingStatus: field.mappingStatus,
      realLogicalNameConfirmed: field.realLogicalNameConfirmed,
      sourceLabel: field.sourceLabel,
      safeOutputPreview: preview(includeSafe ? transformed.value : "removed"),
    });
  }

  safe.opportunityToken = raw.id || token("OPP", raw.opportunity_name || raw.name);
  safe.sanitizedOpportunityTitle = sanitizeOpportunityTitle(raw.opportunity_name || raw.opportunityName || raw.name || safe.opportunityToken);
  if (!safe.opportunityStage && raw.stage) safe.opportunityStage = raw.stage;
  if (!safe.customerToken) safe.customerToken = raw.customer_code || token("CUST", raw.id || raw.customer_name);
  if (!safe.ownerToken) safe.ownerToken = token("OWNER", raw.owner_id || raw.owner_name);
  if (!safe.contactStatus) safe.contactStatus = raw.contact_name ? "available_removed" : "not_provided";
  if (!safe.dataQualityFlags) safe.dataQualityFlags = [...dataQualityFlags];
  else safe.dataQualityFlags = [...new Set([...(Array.isArray(safe.dataQualityFlags) ? safe.dataQualityFlags : []), ...dataQualityFlags])];

  return {
    safeOpportunityContext: safe,
    transformRows,
    removedFields: [...new Set(removedFields)],
    transformedFields: [...new Set(transformedFields)],
    dataQualityFlags: safe.dataQualityFlags,
    validation: validateSafeObject(safe),
  };
}

export function applySafeTransform(rawValue, field, raw = {}, now = new Date()) {
  if (field.sensitivity === "personal" || field.sensitivity === "confidential") {
    if (field.safeTransform !== "token") {
      return { value: field.appName === "contactStatus" ? (rawValue ? "available_removed" : "not_provided") : null, method: "exclude", removed: true, changed: true };
    }
  }
  if (isMissing(rawValue)) {
    return { value: null, method: field.safeTransform, removed: true, changed: false };
  }
  switch (field.safeTransform) {
    case "keep":
      return { value: normalizeKeptValue(rawValue), method: "keep", changed: false };
    case "token":
      return { value: token(tokenPrefix(field), rawValue), method: "token", changed: true };
    case "band":
      return { value: bandValue(rawValue, field), method: "band", changed: true };
    case "relativeDate":
      return { value: relativeDateStatus(String(rawValue).slice(0, 10), now), method: "relativeDate", changed: true };
    case "summarize":
      if (field.appName === "opportunityName") return { value: sanitizeOpportunityTitle(rawValue), method: "sanitizeTitle", changed: true };
      return { value: sanitizeSummaryText(rawValue), method: "summarize", changed: true };
    case "exclude":
    default:
      return { value: null, method: "exclude", removed: true, changed: true };
  }
}

export function sanitizeOpportunityTitle(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "Opportunity title not provided";
  return summarize(text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email_removed]")
    .replace(/(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){10,}/g, "[phone_removed]")
    .replace(/(¥|\$|CNY|RMB|USD|JPY)\s?\d[\d,]*(\.\d+)?/gi, "[amount_band]")
    .replace(/\b(TOTO|Contoso|Acme|Real Customer|Customer Name|敏感客户|客户名)\b/gi, "[customer_removed]"));
}

export function sanitizeTimeline(value) {
  return sanitizeSummaryText(value, "No timeline activity provided.");
}

export function sanitizeSummaryText(value, fallback = "Not provided") {
  const text = Array.isArray(value) ? value.join(" ") : String(value || "");
  if (!text) return fallback;
  return summarize(text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email_removed]")
    .replace(/(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){10,}/g, "[phone_removed]")
    .replace(/(¥|\$|CNY|RMB|USD|JPY)\s?\d[\d,]*(\.\d+)?/gi, "[amount_band]")
    .replace(/\b\d{6,}\b/g, "[number_removed]")
    .replace(/(contract|合同)[^。.\n]{0,80}/gi, "[contract_summary_removed]")
    .replace(/(raw timeline|email body|phone call body|task body)/gi, "[activity_body_removed]"));
}

export function validateSafeObject(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  const blockedKey = sensitiveContextKeys.find((key) => serialized.includes(`"${key.toLowerCase()}"`));
  if (blockedKey) return { ok: false, reason: `Blocked sensitive key in Safe Context: ${blockedKey}` };
  const blockedHint = ["@", "+86", "+1", "+34", "contract text", "real street", "exact_revenue", "exact_margin"].find((hint) => serialized.includes(hint));
  if (blockedHint) return { ok: false, reason: `Blocked sensitive value pattern in Safe Context: ${blockedHint}` };
  return { ok: true };
}

export function readFieldValue(raw, field) {
  if (Object.prototype.hasOwnProperty.call(raw, field.appName)) return raw[field.appName];
  if (field.crmDataKey && Object.prototype.hasOwnProperty.call(raw, field.crmDataKey)) return raw[field.crmDataKey];
  if (Object.prototype.hasOwnProperty.call(raw, field.d365Name)) return raw[field.d365Name];
  return null;
}

function canIncludeInSafeContext(field, value) {
  if (!field.includeInSafeContext) return false;
  if (value === null || value === undefined) return false;
  if (["personal", "confidential"].includes(field.sensitivity) && field.safeTransform !== "token") return field.appName === "contactStatus";
  if (field.sensitivity === "commercial_sensitive" && !["band", "token", "summarize"].includes(field.safeTransform)) return false;
  return true;
}

function maskForCrmData(value, sensitivity) {
  if (value === null || value === undefined || value === "") return null;
  if (["personal", "confidential"].includes(sensitivity)) return "•••• masked";
  return value;
}

function sourcePreview(value, field, role) {
  if (isMissing(value)) return "Not provided / 未填写";
  if (field.appName === "opportunityName") return sanitizeOpportunityTitle(value);
  if (shouldMaskSource(field, role, value)) return "•••• masked";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function shouldMaskSource(field, role, value) {
  if (isMissing(value)) return false;
  if (field.appName === "opportunityName" && containsSensitivePattern(value)) return true;
  if (["personal", "confidential", "commercial_sensitive"].includes(field.sensitivity)) return true;
  if (role !== "CRM Admin") return false;
  const text = String(value).toLowerCase();
  return ["@", "+86", "+1", "+34", "contract", "合同", "address", "street"].some((hint) => text.includes(hint));
}

function containsSensitivePattern(value) {
  const text = String(value).toLowerCase();
  return ["@", "+86", "+1", "+34", "toto", "contoso", "acme", "real customer", "敏感客户", "客户名"].some((hint) => text.includes(hint));
}

function bandValue(value, field) {
  const numeric = Number(value || 0);
  if (field.appName.toLowerCase().includes("margin")) return marginBand(numeric);
  if (field.appName.toLowerCase().includes("volume")) return volumeBand(numeric);
  return revenueBand(numeric);
}

function volumeBand(value) {
  if (value <= 0) return "not_provided";
  if (value < 100) return "<100";
  if (value < 500) return "100-500";
  if (value < 1000) return "500-1,000";
  return "1,000+";
}

function normalizeKeptValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && value !== null) return value.normalized || value.label || value.value || null;
  return value;
}

function summarize(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "Not provided";
  return text.length > 800 ? `${text.slice(0, 797)}...` : text;
}

function token(prefix, value) {
  if (!value) return `${prefix}-UNKNOWN`;
  const existing = String(value);
  if (existing.startsWith(`${prefix}-`)) return existing;
  return `${prefix}-${stableTokenFragment(existing)}`;
}

function tokenPrefix(field) {
  if (field.appName.toLowerCase().includes("customer")) return "CUST";
  if (field.appName.toLowerCase().includes("owner")) return "OWNER";
  if (field.appName.toLowerCase().includes("pol") || field.appName.toLowerCase().includes("pod")) return "PORT";
  return "TOKEN";
}

function isMissing(value) {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function preview(value) {
  if (value === null || value === undefined || value === "") return "Not provided / 未填写";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}
