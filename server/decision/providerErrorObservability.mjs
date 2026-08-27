import { createHash } from "node:crypto";

export const PROVIDER_ERROR_OBSERVABILITY_VERSION = "Provider Error Observability Contract v1";
export const MAX_SANITIZED_ERROR_MESSAGE_LENGTH = 500;

const ERROR_FIELDS = Object.freeze(["code", "type", "param", "message"]);

export async function observeProviderError(response, {
  requestCorrelation = "not-issued",
  endpointAlias = "approved-provider-endpoint",
  modelAlias = "approved-model",
  requestSchemaHash = "not-recorded",
  requestBodyHash = "not-recorded",
  responseTimestamp = new Date().toISOString(),
  maxMessageLength = MAX_SANITIZED_ERROR_MESSAGE_LENGTH,
} = {}) {
  const status = Number.isInteger(response?.status) ? response.status : 0;
  const contentType = readContentType(response);
  let body = "";
  if (typeof response?.text === "function") {
    try { body = await response.text(); } catch { body = ""; }
  }
  return buildProviderErrorObservation({
    status,
    contentType,
    body,
    requestCorrelation,
    endpointAlias,
    modelAlias,
    requestSchemaHash,
    requestBodyHash,
    responseTimestamp,
    maxMessageLength,
  });
}

export function buildProviderErrorObservation({
  status = 0,
  contentType = "",
  body = "",
  requestCorrelation = "not-issued",
  endpointAlias = "approved-provider-endpoint",
  modelAlias = "approved-model",
  requestSchemaHash = "not-recorded",
  requestBodyHash = "not-recorded",
  responseTimestamp = new Date().toISOString(),
  maxMessageLength = MAX_SANITIZED_ERROR_MESSAGE_LENGTH,
} = {}) {
  const rawBody = typeof body === "string" ? body : "";
  const bodyLength = Buffer.byteLength(rawBody, "utf8");
  const bodyAvailable = bodyLength > 0;
  const bodyHash = sha256(rawBody);
  const normalizedContentType = String(contentType || "").split(";", 1)[0].trim().toLowerCase();
  const html = normalizedContentType === "text/html" || /<html[\s>]|<!doctype\s+html/i.test(rawBody);
  const json = normalizedContentType.includes("json") || looksLikeJsonObject(rawBody);
  const parsed = json ? parseJsonObject(rawBody) : null;
  const extracted = html
    ? emptyFields()
    : json
      ? parsed ? extractJsonFields(parsed) : bodyAvailable ? { message: "Provider returned malformed JSON error payload." } : emptyFields()
      : { message: rawBody };
  const limit = Number.isInteger(maxMessageLength) && maxMessageLength > 0 ? Math.min(maxMessageLength, MAX_SANITIZED_ERROR_MESSAGE_LENGTH) : MAX_SANITIZED_ERROR_MESSAGE_LENGTH;
  const redactedMessage = html ? "" : sanitizeErrorMessage(extracted.message, Number.MAX_SAFE_INTEGER);
  const sanitizedMessage = html ? "" : sanitizeErrorMessage(redactedMessage, limit);

  return {
    providerErrorObservabilityVersion: PROVIDER_ERROR_OBSERVABILITY_VERSION,
    httpStatus: status,
    providerErrorCode: sanitizeScalar(extracted.code),
    providerErrorType: sanitizeScalar(extracted.type),
    providerErrorParam: sanitizeScalar(extracted.param),
    sanitizedErrorMessage: sanitizedMessage,
    requestCorrelationToken: safeToken(requestCorrelation),
    responseTimestamp: String(responseTimestamp),
    endpointAlias: safeAlias(endpointAlias),
    modelAlias: safeAlias(modelAlias),
    requestSchemaHash: safeHash(requestSchemaHash),
    requestBodyHash: safeHash(requestBodyHash),
    responseBodyHash: bodyHash,
    bodyTruncated: redactedMessage.length > limit,
    bodyAvailable,
    contentType: normalizedContentType || "unknown",
    bodyLength,
  };
}

export function sanitizeErrorMessage(value, maxLength = MAX_SANITIZED_ERROR_MESSAGE_LENGTH) {
  let text = typeof value === "string" ? value : "";
  text = text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_SECRET]")
    .replace(/(api[_-]?key|access[_-]?token|client[_-]?secret|authorization|cookie)\s*[:=]\s*["']?[^,\s"'}]+["']?/gi, "$1=[REDACTED]")
    .replace(/https?:\/\/[^\s"']+\?[^\s"']+/gi, "[REDACTED_URL_QUERY]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[REDACTED_GUID]")
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[REDACTED_PHONE]")
    .replace(/\bDEMO-[A-Z0-9_-]+\b/gi, "[REDACTED_CRM_TOKEN]")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 15)).trimEnd()} [TRUNCATED]`;
}

export function providerErrorObservationKeys() {
  return [
    "providerErrorObservabilityVersion", "httpStatus", "providerErrorCode", "providerErrorType", "providerErrorParam",
    "sanitizedErrorMessage", "requestCorrelationToken", "responseTimestamp", "endpointAlias", "modelAlias",
    "requestSchemaHash", "requestBodyHash", "responseBodyHash", "bodyTruncated", "bodyAvailable", "contentType", "bodyLength",
  ];
}

function parseJsonObject(body) {
  try {
    const value = JSON.parse(body);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

function looksLikeJsonObject(body) {
  return /^\s*\{/.test(body);
}

function extractJsonFields(value) {
  const source = value?.error && typeof value.error === "object" && !Array.isArray(value.error) ? value.error : value;
  return Object.fromEntries(ERROR_FIELDS.filter((key) => typeof source?.[key] === "string").map((key) => [key, source[key]]));
}

function emptyFields() { return {}; }
function readContentType(response) { return response?.headers?.get?.("content-type") || response?.headers?.["content-type"] || ""; }
function sha256(value) { return createHash("sha256").update(String(value), "utf8").digest("hex"); }
function safeHash(value) { return /^[0-9a-f]{64}$/i.test(String(value)) ? String(value).toLowerCase() : "not-recorded"; }
function safeAlias(value) { return String(value || "approved-provider").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80); }
function safeToken(value) { return String(value || "not-issued").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120); }
function sanitizeScalar(value) { return typeof value === "string" && value.length > 0 ? sanitizeErrorMessage(value, 120) : null; }
