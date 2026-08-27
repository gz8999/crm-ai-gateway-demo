import { createHash } from "node:crypto";
import { DECISION_PACK_CARDINALITY_CONTRACT } from "./decisionPackCardinalityContract.mjs";

export const SAFE_SCHEMA_PATH_DIAGNOSTICS_VERSION = "Phase 3C R6-R1A Safe Schema Path Diagnostics v1";

export const SAFE_SCHEMA_FAILURE_CLASSES = Object.freeze([
  "MISSING_REQUIRED_PROPERTY",
  "UNEXPECTED_PROPERTY",
  "TYPE_MISMATCH",
  "ENUM_MISMATCH",
  "CONST_MISMATCH",
  "ARRAY_MIN_ITEMS",
  "ARRAY_MAX_ITEMS",
  "STRING_MIN_LENGTH",
  "STRING_MAX_LENGTH",
  "PATTERN_MISMATCH",
  "ONE_OF_MISMATCH",
  "EVIDENCE_NOT_ALLOWLISTED",
  "EVIDENCE_DUPLICATE",
  "CATEGORY_EVIDENCE_INCOMPATIBLE",
  "CARDINALITY_MISMATCH",
  "UNKNOWN_SCHEMA_FAILURE",
]);

export const SAFE_SCHEMA_DIAGNOSTIC_FIELDS = Object.freeze([
  "errorIndex",
  "failureClass",
  "instancePath",
  "schemaPath",
  "keyword",
  "expectedJsonType",
  "actualJsonType",
  "missingProperty",
  "additionalProperty",
  "allowedEnumCount",
  "enumMembership",
  "constMatched",
  "arrayLength",
  "minItems",
  "maxItems",
  "stringLength",
  "minLength",
  "maxLength",
  "patternMatched",
  "oneOfMatchCount",
  "anyOfMatchCount",
  "allOfMatchCount",
]);

const CLASS_PRIORITY = Object.freeze({
  EVIDENCE_NOT_ALLOWLISTED: 0,
  EVIDENCE_DUPLICATE: 1,
  CATEGORY_EVIDENCE_INCOMPATIBLE: 2,
  CARDINALITY_MISMATCH: 3,
  MISSING_REQUIRED_PROPERTY: 4,
  UNEXPECTED_PROPERTY: 5,
  TYPE_MISMATCH: 6,
  CONST_MISMATCH: 7,
  ENUM_MISMATCH: 8,
  ARRAY_MIN_ITEMS: 9,
  ARRAY_MAX_ITEMS: 10,
  STRING_MIN_LENGTH: 11,
  STRING_MAX_LENGTH: 12,
  PATTERN_MISMATCH: 13,
  ONE_OF_MISMATCH: 14,
  UNKNOWN_SCHEMA_FAILURE: 99,
});

export function buildSafeSchemaPathDiagnostics({
  schemaDiagnostics,
  semanticErrors = [],
  parsedValue = null,
  evidenceTokens = [],
} = {}) {
  const allowlist = new Set(Array.isArray(evidenceTokens) ? evidenceTokens : []);
  const structural = Array.isArray(schemaDiagnostics?.errors)
    ? schemaDiagnostics.errors.map((error, index) => sanitizeStructuralError(error, index, { parsedValue, allowlist }))
    : [];
  const semantic = [...new Set(Array.isArray(semanticErrors) ? semanticErrors : [])]
    .filter((error) => typeof error === "string" && error !== "not_run")
    .map((error, index) => semanticDiagnostic(error, structural.length + index, { parsedValue, allowlist }));
  const errors = [...structural, ...semantic];
  const primary = errors
    .map((error, index) => ({ error, index }))
    .sort((left, right) => diagnosticPriority(left.error) - diagnosticPriority(right.error) || left.index - right.index)[0]?.error || null;
  return {
    version: SAFE_SCHEMA_PATH_DIAGNOSTICS_VERSION,
    ready: errors.length > 0,
    primaryFailureClass: primary?.failureClass || null,
    primaryInstancePath: primary?.instancePath ?? null,
    primarySchemaPath: primary?.schemaPath ?? null,
    primaryKeyword: primary?.keyword ?? null,
    secondaryFailureCount: Math.max(0, errors.length - 1),
    errors,
    evidence: buildEvidenceDiagnostic(parsedValue, allowlist),
    rawArgumentsCount: 0,
    actualValueCount: 0,
  };
}

export function classifySafeSchemaFailure(error, { parsedValue = null, allowlist = new Set() } = {}) {
  const instancePath = typeof error?.instancePath === "string" ? error.instancePath : "";
  const keyword = error?.keyword;
  if (isEvidencePath(instancePath) && keyword === "enum") {
    const value = valueAtPointer(parsedValue, instancePath);
    if (!allowlist.has(value)) return "EVIDENCE_NOT_ALLOWLISTED";
    if (instancePath.startsWith("/riskCategories/")) return "CATEGORY_EVIDENCE_INCOMPATIBLE";
  }
  if (keyword === "required" && isCardinalitySlotFailure(instancePath, error?.missingProperty)) return "CARDINALITY_MISMATCH";
  if (keyword === "required") return "MISSING_REQUIRED_PROPERTY";
  if (keyword === "additionalProperties") return "UNEXPECTED_PROPERTY";
  if (keyword === "type") return "TYPE_MISMATCH";
  if (keyword === "const") return "CONST_MISMATCH";
  if (keyword === "enum") return Number(error?.allowedEnumCount) === 1 ? "CONST_MISMATCH" : "ENUM_MISMATCH";
  if (keyword === "minItems") return "ARRAY_MIN_ITEMS";
  if (keyword === "maxItems") return "ARRAY_MAX_ITEMS";
  if (keyword === "minLength") return "STRING_MIN_LENGTH";
  if (keyword === "maxLength") return "STRING_MAX_LENGTH";
  if (keyword === "pattern") return "PATTERN_MISMATCH";
  if (["oneOf", "anyOf", "allOf"].includes(keyword)) return "ONE_OF_MISMATCH";
  return "UNKNOWN_SCHEMA_FAILURE";
}

function sanitizeStructuralError(error, errorIndex, context) {
  const instancePath = safePointer(error?.instancePath, "");
  const failureClass = classifySafeSchemaFailure({ ...error, instancePath }, context);
  const cardinality = cardinalityMetadata(instancePath, error, context.parsedValue);
  return allowlistedDiagnostic({
    errorIndex,
    failureClass,
    instancePath,
    schemaPath: safePointer(error?.schemaPath, "#"),
    keyword: safeKeyword(error?.keyword),
    expectedJsonType: safeJsonType(error?.expectedJsonType ?? error?.expectedType),
    actualJsonType: safeJsonType(error?.actualJsonType),
    missingProperty: safePropertyName(error?.missingProperty),
    additionalProperty: safePropertyName(error?.additionalProperty ?? error?.unexpectedProperty),
    allowedEnumCount: nonNegativeInteger(error?.allowedEnumCount),
    enumMembership: booleanOrNull(error?.enumMembership),
    constMatched: booleanOrNull(error?.constMatched ?? error?.fixedValueMatched),
    arrayLength: cardinality.arrayLength ?? nonNegativeInteger(error?.arrayLength),
    minItems: cardinality.minItems ?? nonNegativeInteger(error?.minItems),
    maxItems: cardinality.maxItems ?? nonNegativeInteger(error?.maxItems),
    stringLength: nonNegativeInteger(error?.stringLength),
    minLength: nonNegativeInteger(error?.minLength),
    maxLength: nonNegativeInteger(error?.maxLength),
    patternMatched: booleanOrNull(error?.patternMatched),
    oneOfMatchCount: nonNegativeInteger(error?.oneOfMatchCount),
    anyOfMatchCount: nonNegativeInteger(error?.anyOfMatchCount),
    allOfMatchCount: nonNegativeInteger(error?.allOfMatchCount),
  });
}

function semanticDiagnostic(errorCode, errorIndex, context) {
  const metadata = semanticMetadata(errorCode, context);
  return allowlistedDiagnostic({
    errorIndex,
    failureClass: metadata.failureClass,
    instancePath: metadata.instancePath,
    schemaPath: `#/semantic/${safeKeyword(errorCode)}`,
    keyword: "semantic",
    expectedJsonType: metadata.expectedJsonType,
    actualJsonType: metadata.actualJsonType,
    missingProperty: null,
    additionalProperty: null,
    allowedEnumCount: null,
    enumMembership: metadata.enumMembership,
    constMatched: null,
    arrayLength: metadata.arrayLength,
    minItems: metadata.minItems,
    maxItems: metadata.maxItems,
    stringLength: null,
    minLength: null,
    maxLength: null,
    patternMatched: null,
    oneOfMatchCount: null,
    anyOfMatchCount: null,
    allOfMatchCount: null,
  });
}

function semanticMetadata(errorCode, { parsedValue, allowlist }) {
  if (/evidence_duplicate$/u.test(errorCode)) return {
    failureClass: "EVIDENCE_DUPLICATE",
    instancePath: firstEvidencePath(parsedValue, (tokens) => tokens.length !== new Set(tokens).size),
    expectedJsonType: "object",
    actualJsonType: "object",
    enumMembership: true,
  };
  if (/evidence_(?:unknown|invalid)$/u.test(errorCode)) return {
    failureClass: "EVIDENCE_NOT_ALLOWLISTED",
    instancePath: firstEvidencePath(parsedValue, (tokens) => tokens.some((token) => !allowlist.has(token))),
    expectedJsonType: "string",
    actualJsonType: "string",
    enumMembership: false,
  };
  if (/risk_category_evidence_incompatible|evidence_incompatible/u.test(errorCode)) return {
    failureClass: "CATEGORY_EVIDENCE_INCOMPATIBLE",
    instancePath: errorCode.startsWith("risk_") ? "/riskCategories" : "/inferences",
    expectedJsonType: "string",
    actualJsonType: "string",
    enumMembership: true,
  };
  if (/required|limit|cardinality|decode_invalid/u.test(errorCode)) {
    const instancePath = errorCode.startsWith("action_") ? "/recommendedActions"
      : errorCode.startsWith("risk_") ? "/riskCategories"
      : errorCode.startsWith("fact_") ? "/facts"
      : errorCode.startsWith("selected_evidence") ? "/evidence"
      : "/inferences";
    const bounds = contractBounds(instancePath);
    return {
      failureClass: "CARDINALITY_MISMATCH",
      instancePath,
      expectedJsonType: "object",
      actualJsonType: jsonType(valueAtPointer(parsedValue, instancePath)),
      arrayLength: effectiveSlotCount(valueAtPointer(parsedValue, instancePath)),
      minItems: bounds?.minItems ?? null,
      maxItems: bounds?.maxItems ?? null,
    };
  }
  return {
    failureClass: "UNKNOWN_SCHEMA_FAILURE",
    instancePath: "",
    expectedJsonType: null,
    actualJsonType: jsonType(parsedValue),
  };
}

function cardinalityMetadata(instancePath, error, parsedValue) {
  if (error?.keyword !== "required" || !isCardinalitySlotFailure(instancePath, error?.missingProperty)) return {};
  const bounds = contractBounds(instancePath);
  return {
    arrayLength: effectiveSlotCount(valueAtPointer(parsedValue, instancePath)),
    minItems: bounds?.minItems ?? null,
    maxItems: bounds?.maxItems ?? null,
  };
}

function contractBounds(instancePath) {
  if (instancePath === "/facts") return DECISION_PACK_CARDINALITY_CONTRACT.collections.facts;
  if (instancePath === "/inferences") return DECISION_PACK_CARDINALITY_CONTRACT.collections.inferences;
  if (instancePath === "/recommendedActions") return DECISION_PACK_CARDINALITY_CONTRACT.collections.recommendedActions;
  if (instancePath === "/riskCategories") return DECISION_PACK_CARDINALITY_CONTRACT.collections.riskCategories;
  if (instancePath === "/limitations/codes") return DECISION_PACK_CARDINALITY_CONTRACT.collections["limitations.codes"];
  if (/^\/inferences\/item\d+\/evidenceTokens$/u.test(instancePath)) return DECISION_PACK_CARDINALITY_CONTRACT.evidenceReferences.inference;
  if (/^\/recommendedActions\/item\d+\/evidenceTokens$/u.test(instancePath)) return DECISION_PACK_CARDINALITY_CONTRACT.evidenceReferences.action;
  if (/^\/riskCategories\/item\d+\/evidenceTokens$/u.test(instancePath)) return DECISION_PACK_CARDINALITY_CONTRACT.evidenceReferences.riskCategory;
  return null;
}

function isEvidencePath(instancePath) {
  return /\/evidenceTokens(?:\/|$)/u.test(instancePath);
}

function isCardinalitySlotFailure(instancePath, missingProperty) {
  return /^item\d+$/u.test(String(missingProperty || "")) && Boolean(contractBounds(instancePath));
}

function buildEvidenceDiagnostic(parsedValue, allowlist) {
  const tokens = collectEvidenceTokens(parsedValue);
  const unique = [...new Set(tokens)].sort();
  const bitmap = tokens.map((token) => allowlist.has(token) ? "1" : "0").join("");
  return {
    evidenceTokenCount: tokens.length,
    evidenceSetHash: sha256(JSON.stringify(unique)),
    unknownTokenCount: tokens.filter((token) => !allowlist.has(token)).length,
    duplicateTokenCount: tokens.length - unique.length,
    allowlistMembershipBitmapHash: sha256(bitmap),
  };
}

function collectEvidenceTokens(value) {
  const tokens = [];
  walk(value, null, tokens);
  return tokens;
}

function walk(value, key, tokens) {
  if (!value || typeof value !== "object") return;
  if (key === "evidenceTokens") {
    collectLeafStrings(value, tokens);
    return;
  }
  for (const [childKey, child] of Object.entries(value)) walk(child, childKey, tokens);
}

function collectLeafStrings(value, output) {
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const child of Object.values(value)) collectLeafStrings(child, output);
}

function firstEvidencePath(value, predicate) {
  const paths = [];
  findEvidencePaths(value, "", predicate, paths);
  return paths[0] || "/evidence";
}

function findEvidencePaths(value, pointer, predicate, output) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${pointer}/${escapePointer(key)}`;
    if (key === "evidenceTokens") {
      const tokens = [];
      collectLeafStrings(child, tokens);
      if (predicate(tokens)) output.push(childPath);
    } else {
      findEvidencePaths(child, childPath, predicate, output);
    }
  }
}

function valueAtPointer(root, pointer) {
  if (!pointer) return root;
  if (!root || typeof root !== "object" || !pointer.startsWith("/")) return undefined;
  return pointer.slice(1).split("/").reduce((node, part) => node?.[part.replaceAll("~1", "/").replaceAll("~0", "~")], root);
}

function allowlistedDiagnostic(value) {
  return Object.fromEntries(SAFE_SCHEMA_DIAGNOSTIC_FIELDS.map((field) => [field, value[field] ?? null]));
}

function diagnosticPriority(error) {
  if (error?.failureClass === "ONE_OF_MISMATCH" && error?.keyword === "oneOf") return 5;
  return CLASS_PRIORITY[error?.failureClass] ?? 99;
}

function safePointer(value, fallback) {
  if (typeof value !== "string") return fallback;
  return /^[#/]?(?:[A-Za-z0-9_$~.-]|\/(?:[A-Za-z0-9_$~.-]|~[01])*)*$/u.test(value) ? value : `sha256:${sha256(value)}`;
}

function safePropertyName(value) {
  if (typeof value !== "string") return null;
  return /^[A-Za-z_$][A-Za-z0-9_$-]{0,63}$/u.test(value) ? value : `sha256:${sha256(value)}`;
}

function safeKeyword(value) {
  return typeof value === "string" && /^[A-Za-z0-9_$-]{1,80}$/u.test(value) ? value : "unknown";
}

function safeJsonType(value) {
  return ["array", "boolean", "integer", "null", "number", "object", "string", "undefined"].includes(value) ? value : null;
}

function jsonType(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}

function effectiveSlotCount(value) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return 0;
  return Object.keys(value).filter((key) => /^item\d+$/u.test(key)).length;
}

function nonNegativeInteger(value) { return Number.isInteger(value) && value >= 0 ? value : null; }
function booleanOrNull(value) { return typeof value === "boolean" ? value : null; }
function escapePointer(value) { return String(value).replaceAll("~", "~0").replaceAll("/", "~1"); }
function sha256(value) { return createHash("sha256").update(String(value)).digest("hex"); }
