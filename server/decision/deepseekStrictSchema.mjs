import { createHash } from "node:crypto";
import {
  buildProviderTransportToolSchemaV3,
  buildProviderTransportToolSchemaV4,
  buildProviderTransportToolSchemaV5,
  buildProviderTransportToolSchemaV6,
  buildProviderTransportToolSchemaV7,
  externalModelToolSchemaV2,
  mapExternalModelToolArgumentsToCanonicalV2,
  mapProviderTransportToCanonicalV2,
  mapProviderTransportToCanonicalV2WithRiskEvidence,
  mapProviderTransportV3ToCanonicalV2,
  mapProviderTransportV4ToCanonicalV2,
  mapProviderTransportV5ToCanonicalV2,
  mapProviderTransportV6ToCanonicalV2,
  mapProviderTransportV7ToCanonicalV2,
  providerTransportToolSchemaV1,
  providerTransportToolSchemaV2,
  validateExternalModelToolArgumentsV2,
  validateProviderTransportToolArgumentsV1,
  validateProviderTransportToolArgumentsV2,
  validateProviderTransportToolArgumentsV3,
  validateProviderTransportToolArgumentsV4,
  validateProviderTransportToolArgumentsV5,
  validateProviderTransportToolArgumentsV6,
  validateProviderTransportToolArgumentsV7,
} from "./externalModelContractV2.mjs";

export const DEEPSEEK_STRICT_TOOL_SCHEMA_VERSION = "DeepSeek Decision Tool Schema v1";
export const DEEPSEEK_TOOL_NAME = "emit_decision_pack";

const text = () => ({ type: "string" });
const evidenceItem = () => objectSchema({
  label: text(),
  value: text(),
  evidenceToken: text(),
});
const actionItem = () => objectSchema({
  action: text(),
  ownerRole: text(),
  dueWindow: text(),
  basis: text(),
  draftStatus: { enum: ["Draft only"] },
});

export const deepseekDecisionToolSchema = Object.freeze(objectSchema({
  facts: { type: "array", items: evidenceItem() },
  inferences: {
    type: "array",
    items: objectSchema({ inference: text(), evidenceTokens: { type: "array", items: text() } }),
  },
  evidence: { type: "array", items: objectSchema({ evidenceToken: text(), value: text() }) },
  confidence: objectSchema({ level: { enum: ["High", "Medium", "Low"] }, reason: text() }),
  recommendedActions: { type: "array", items: actionItem() },
  priority: { enum: ["Critical", "High", "Medium", "Low", "Monitor"] },
  riskCategories: { type: "array", items: text() },
  provider: text(),
  model: text(),
  modelVersion: text(),
  fallback: objectSchema({ state: { enum: ["not_applicable", "used"] }, reason: text() }),
  safety: objectSchema({
    customerIdentityMasked: { enum: [true] },
    exactAmountSentToModel: { enum: [false] },
    rawTimelineSent: { enum: [false] },
    crmWritebackEnabled: { enum: [false] },
  }),
  limitations: { type: "array", items: text() },
}));

export const DEEPSEEK_STRICT_TOOL_SCHEMA_V2_VERSION = "DeepSeek Decision Tool Schema v2";
export const DEEPSEEK_SERIALIZATION_PROFILE_V3_VERSION = "DeepSeek Decision Tool Serialization Profile v3";
export const DEEPSEEK_SERIALIZATION_TOOL_DESCRIPTION = "Emit one compact decision pack that exactly matches the parameter schema. Keep string values concise and single-line, use standard JSON escaping, and call this function exactly once.";
export const DEEPSEEK_SERIALIZATION_PROFILE_V4_VERSION = "DeepSeek Decision Tool Serialization Profile v4";
export const DEEPSEEK_SERIALIZATION_TOOL_DESCRIPTION_V4 = "Emit one compact decision pack that exactly matches the parameter schema. Keep string values concise and single-line, use standard JSON escaping, and call this function exactly once. Describe limitations only as sanitized context limitations; never repeat prohibited input field labels, identities, or amount values.";
export const DEEPSEEK_STRUCTURED_SAFETY_PROFILE_V5_VERSION = "DeepSeek Decision Tool Structured Safety Profile v5";
export const DEEPSEEK_STRUCTURED_SAFETY_TOOL_DESCRIPTION_V5 = "Emit one compact decision pack that exactly matches the parameter schema. Keep strings concise and single-line, call this function exactly once, and express every limitation and safety policy only through the approved enum code paths. Do not repeat code names or prohibited field labels in facts, inferences, evidence, action text, basis, reasons, or other details.";
export const DEEPSEEK_STRUCTURED_ACTION_EVIDENCE_PROFILE_V6_VERSION = "DeepSeek Decision Tool Structured Action Evidence Profile v6";
export const DEEPSEEK_STRUCTURED_ACTION_EVIDENCE_TOOL_DESCRIPTION_V6 = "Emit one compact decision pack that exactly matches the parameter schema. Call this function exactly once. For every recommended action, put the supporting supplied evidence tokens in evidenceTokens and keep basis as a concise explanation. Use only approved limitation and safety policy enum codes.";
export const DEEPSEEK_RISK_CATEGORY_EVIDENCE_PROFILE_V6R1_VERSION = "DeepSeek Decision Tool Risk Category Evidence Profile v6-r1";
export const DEEPSEEK_RISK_CATEGORY_EVIDENCE_TOOL_DESCRIPTION_V6R1 = "Emit one compact decision pack that exactly matches the parameter schema. Call this function exactly once. For every action and risk category, cite one or more exact supplied evidence tokens. Select risk category codes only from the schema enum. Keep explanations concise and use only approved limitation and safety policy enum codes.";
export const DEEPSEEK_EVIDENCE_SCOPED_PROFILE_V6R2_VERSION = "DeepSeek Decision Tool Evidence Scoped Profile v6-r2";
export const DEEPSEEK_EVIDENCE_SCOPED_TOOL_DESCRIPTION_V6R2 = "Emit one compact decision pack that exactly matches the parameter schema. Call this function exactly once. Select only a risk category and evidence token combination permitted by the request-scoped schema. Include every required safety assertion exactly as defined. Keep explanations concise and do not emit health score fields.";
export const DEEPSEEK_SERIALIZATION_HARDENED_PROFILE_V6R3_VERSION = "DeepSeek Decision Tool Serialization Hardened Profile v6-r3";
export const DEEPSEEK_SERIALIZATION_HARDENED_TOOL_DESCRIPTION_V6R3 = "Emit one compact decision pack that exactly matches the parameter schema. Call this function exactly once. Use only request-scoped evidence tokens. Every free-text value must be concise, single-line, and contain no quotation mark, backslash, or control character. Use the fixed owner, due-window, provider, model, fallback, safety, and limitation values exactly as constrained by the schema.";
export const DEEPSEEK_FACT_REFERENCE_PROFILE_V6R4_VERSION = "DeepSeek Decision Tool Fact Reference Profile v6-r4";
export const DEEPSEEK_FACT_REFERENCE_TOOL_DESCRIPTION_V6R4 = "Emit one compact decision pack that exactly matches the parameter schema. Call this function exactly once. Select facts only by exact factCode from the supplied Safe Fact Catalog. Never generate, rewrite, or copy fact labels or values. Use only request-scoped evidence tokens and all fixed safety values exactly as constrained.";
export const DEEPSEEK_REFERENCE_ONLY_PROFILE_V6R5_VERSION = "DeepSeek Decision Tool Reference Only Profile v6-r5";
export const DEEPSEEK_REFERENCE_ONLY_TOOL_DESCRIPTION_V6R5 = "Emit one compact selection object that exactly matches the parameter schema. Call this function exactly once. Return only exact catalog codes, evidence tokens, enum values, and fixed safety fields. Do not generate any free text. The server expands every selected reference deterministically.";
export const DEEPSEEK_CARDINALITY_PROFILE_V6R6_VERSION = "DeepSeek Decision Tool Cardinality Profile v6-r6";
export const DEEPSEEK_CARDINALITY_TOOL_DESCRIPTION_V6R6 = "Emit one compact selection object that exactly matches the parameter schema. Call this function exactly once. Each required-slot object must use consecutive itemNN keys and contain at least the schema-required number of selections. Return only exact catalog codes, evidence tokens, enum values, and fixed safety fields. Do not generate free text.";

// V2 keeps the frozen V1 contract and only adds the explicit primitive type
// required by strict providers for enum-only nodes.
export const deepseekDecisionToolSchemaV2 = Object.freeze(addEnumTypes(deepseekDecisionToolSchema));
export const deepseekDecisionToolSchemaV5 = externalModelToolSchemaV2;
export const deepseekDecisionToolSchemaV6 = providerTransportToolSchemaV1;
export const deepseekDecisionToolSchemaV6R1 = providerTransportToolSchemaV2;

export function deepseekStrictTool() {
  return {
    type: "function",
    function: {
      name: DEEPSEEK_TOOL_NAME,
      strict: true,
      parameters: deepseekDecisionToolSchema,
    },
  };
}

export function deepseekStrictToolV2() {
  return {
    type: "function",
    function: {
      name: DEEPSEEK_TOOL_NAME,
      strict: true,
      parameters: deepseekDecisionToolSchemaV2,
    },
  };
}

export function deepseekStrictToolV3() {
  return {
    type: "function",
    function: {
      name: DEEPSEEK_TOOL_NAME,
      description: DEEPSEEK_SERIALIZATION_TOOL_DESCRIPTION,
      strict: true,
      parameters: deepseekDecisionToolSchemaV2,
    },
  };
}

export function deepseekStrictToolV4() {
  return {
    type: "function",
    function: {
      name: DEEPSEEK_TOOL_NAME,
      description: DEEPSEEK_SERIALIZATION_TOOL_DESCRIPTION_V4,
      strict: true,
      parameters: deepseekDecisionToolSchemaV2,
    },
  };
}

export function deepseekStrictToolV5() {
  return {
    type: "function",
    function: {
      name: DEEPSEEK_TOOL_NAME,
      description: DEEPSEEK_STRUCTURED_SAFETY_TOOL_DESCRIPTION_V5,
      strict: true,
      parameters: deepseekDecisionToolSchemaV5,
    },
  };
}

export function deepseekStrictToolV6() {
  return {
    type: "function",
    function: {
      name: DEEPSEEK_TOOL_NAME,
      description: DEEPSEEK_STRUCTURED_ACTION_EVIDENCE_TOOL_DESCRIPTION_V6,
      strict: true,
      parameters: deepseekDecisionToolSchemaV6,
    },
  };
}

export function deepseekStrictToolV6R1() {
  return {
    type: "function",
    function: {
      name: DEEPSEEK_TOOL_NAME,
      description: DEEPSEEK_RISK_CATEGORY_EVIDENCE_TOOL_DESCRIPTION_V6R1,
      strict: true,
      parameters: deepseekDecisionToolSchemaV6R1,
    },
  };
}

export function buildDeepseekDecisionToolSchemaV6R2(options = {}) {
  return buildProviderTransportToolSchemaV3(options);
}

export function deepseekStrictToolV6R2(options = {}) {
  return {
    type: "function",
    function: {
      name: DEEPSEEK_TOOL_NAME,
      description: DEEPSEEK_EVIDENCE_SCOPED_TOOL_DESCRIPTION_V6R2,
      strict: true,
      parameters: buildDeepseekDecisionToolSchemaV6R2(options),
    },
  };
}

export function buildDeepseekDecisionToolSchemaV6R3(options = {}) {
  return buildProviderTransportToolSchemaV4(options);
}

export function deepseekStrictToolV6R3(options = {}) {
  return {
    type: "function",
    function: {
      name: DEEPSEEK_TOOL_NAME,
      description: DEEPSEEK_SERIALIZATION_HARDENED_TOOL_DESCRIPTION_V6R3,
      strict: true,
      parameters: buildDeepseekDecisionToolSchemaV6R3(options),
    },
  };
}

export function buildDeepseekDecisionToolSchemaV6R4(options = {}) {
  return buildProviderTransportToolSchemaV5(options);
}

export function deepseekStrictToolV6R4(options = {}) {
  return {
    type: "function",
    function: {
      name: DEEPSEEK_TOOL_NAME,
      description: DEEPSEEK_FACT_REFERENCE_TOOL_DESCRIPTION_V6R4,
      strict: true,
      parameters: buildDeepseekDecisionToolSchemaV6R4(options),
    },
  };
}

export function buildDeepseekDecisionToolSchemaV6R5(options = {}) {
  return buildProviderTransportToolSchemaV6(options);
}

export function deepseekStrictToolV6R5(options = {}) {
  return {
    type: "function",
    function: {
      name: DEEPSEEK_TOOL_NAME,
      description: DEEPSEEK_REFERENCE_ONLY_TOOL_DESCRIPTION_V6R5,
      strict: true,
      parameters: buildDeepseekDecisionToolSchemaV6R5(options),
    },
  };
}

export function buildDeepseekDecisionToolSchemaV6R6(options = {}) {
  return buildProviderTransportToolSchemaV7(options);
}

export function deepseekStrictToolV6R6(options = {}) {
  return {
    type: "function",
    function: {
      name: DEEPSEEK_TOOL_NAME,
      description: DEEPSEEK_CARDINALITY_TOOL_DESCRIPTION_V6R6,
      strict: true,
      parameters: buildDeepseekDecisionToolSchemaV6R6(options),
    },
  };
}

export function lintDeepSeekSchema(schema = deepseekDecisionToolSchema) {
  const unsupported = new Set();
  const missingAdditionalProperties = [];
  const missingRequired = [];
  const missingItems = [];
  const objectNodes = [];
  const allowedKeywords = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "anyOf", "$ref", "$defs", "pattern"]);
  const unsupportedKeywords = new Set([
    "minLength", "maxLength", "minItems", "maxItems", "nullable", "oneOf", "allOf", "not",
    "dependentRequired", "unevaluatedProperties", "patternProperties", "propertyNames", "contains", "const",
  ]);

  function walk(node, path) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    for (const key of Object.keys(node)) {
      if (!allowedKeywords.has(key)) unsupported.add(key);
      if (unsupportedKeywords.has(key)) unsupported.add(key);
    }
    if (node.type === null || (Array.isArray(node.type) && node.type.includes("null"))) unsupported.add("type:null");
    if (node.type === "object") {
      objectNodes.push(path);
      const properties = node.properties;
      const required = node.required;
      if (node.additionalProperties !== false) missingAdditionalProperties.push(path);
      if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
        missingRequired.push(path);
      } else if (!Array.isArray(required) || Object.keys(properties).some((key) => !required.includes(key)) || required.some((key) => !Object.hasOwn(properties, key))) {
        missingRequired.push(path);
      }
      if (properties && typeof properties === "object") for (const [key, child] of Object.entries(properties)) walk(child, `${path}.properties.${key}`);
    }
    if (node.type === "array") {
      if (!node.items || typeof node.items !== "object") missingItems.push(path);
      else walk(node.items, `${path}.items`);
    }
    if (Array.isArray(node.anyOf)) node.anyOf.forEach((child, index) => walk(child, `${path}.anyOf[${index}]`));
    if (node.$defs && typeof node.$defs === "object") for (const [key, child] of Object.entries(node.$defs)) walk(child, `${path}.$defs.${key}`);
  }

  let serializable = true;
  try { JSON.stringify(schema); } catch { serializable = false; }
  walk(schema, "$" );
  return {
    serializable,
    objectCount: objectNodes.length,
    requiredCoverageCount: objectNodes.length - missingRequired.length,
    missingRequiredCount: missingRequired.length,
    missingAdditionalPropertiesCount: missingAdditionalProperties.length,
    missingArrayItemsCount: missingItems.length,
    unsupportedKeywordCount: unsupported.size,
    unsupportedKeywords: [...unsupported].sort(),
    missingRequiredPaths: missingRequired,
    missingAdditionalPropertiesPaths: missingAdditionalProperties,
    missingArrayItemsPaths: missingItems,
    schemaHash: schemaHash(schema),
  };
}

export function lintDeepSeekSchemaCompleteness(schema = deepseekDecisionToolSchema) {
  const unsupported = new Set();
  const unsupportedKeywords = new Set([
    "minLength", "maxLength", "minItems", "maxItems", "nullable", "oneOf", "allOf", "not",
    "dependentRequired", "unevaluatedProperties", "patternProperties", "propertyNames", "contains", "const",
  ]);
  const allowedKeywords = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "anyOf", "$ref", "$defs", "pattern"]);
  const missingTypeAnyOfRefPaths = [];
  const missingRequiredPaths = [];
  const missingAdditionalPropertiesPaths = [];
  const missingArrayItemsPaths = [];
  const objectPaths = [];
  let totalSchemaNodeCount = 0;
  let typedNodeCount = 0;
  let anyOfNodeCount = 0;
  let refNodeCount = 0;

  function walk(node, path) {
    if (!isSchemaNode(node)) return;
    totalSchemaNodeCount += 1;
    for (const key of Object.keys(node)) {
      if (!allowedKeywords.has(key)) unsupported.add(key);
      if (unsupportedKeywords.has(key)) unsupported.add(key);
    }
    if (Object.hasOwn(node, "type")) typedNodeCount += 1;
    if (Array.isArray(node.anyOf)) anyOfNodeCount += 1;
    if (typeof node.$ref === "string") refNodeCount += 1;
    if (!Object.hasOwn(node, "type") && !Array.isArray(node.anyOf) && typeof node.$ref !== "string") {
      missingTypeAnyOfRefPaths.push(path);
    }
    if (node.type === "object") {
      objectPaths.push(path);
      const properties = node.properties;
      const required = node.required;
      if (node.additionalProperties !== false) missingAdditionalPropertiesPaths.push(path);
      if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
        missingRequiredPaths.push(path);
      } else if (!Array.isArray(required) || Object.keys(properties).some((key) => !required.includes(key)) || required.some((key) => !Object.hasOwn(properties, key))) {
        missingRequiredPaths.push(path);
      }
      if (properties && typeof properties === "object") for (const [key, child] of Object.entries(properties)) walk(child, `${path}/properties/${escapeJsonPointer(key)}`);
    }
    if (node.type === "array") {
      if (!isSchemaNode(node.items)) missingArrayItemsPaths.push(path);
      else walk(node.items, `${path}/items`);
    }
    if (Array.isArray(node.anyOf)) node.anyOf.forEach((child, index) => walk(child, `${path}/anyOf/${index}`));
    if (node.$defs && typeof node.$defs === "object" && !Array.isArray(node.$defs)) {
      for (const [key, child] of Object.entries(node.$defs)) walk(child, `${path}/$defs/${escapeJsonPointer(key)}`);
    }
  }

  let serializable = true;
  try { JSON.stringify(schema); } catch { serializable = false; }
  walk(schema, "#");
  return {
    serializable,
    totalSchemaNodeCount,
    typedNodeCount,
    anyOfNodeCount,
    refNodeCount,
    missingTypeAnyOfRefCount: missingTypeAnyOfRefPaths.length,
    missingTypeAnyOfRefPaths,
    objectCount: objectPaths.length,
    requiredCoverageCount: objectPaths.length - missingRequiredPaths.length,
    missingRequiredCount: missingRequiredPaths.length,
    missingRequiredPaths,
    missingAdditionalPropertiesCount: missingAdditionalPropertiesPaths.length,
    missingAdditionalPropertiesPaths,
    missingArrayItemsCount: missingArrayItemsPaths.length,
    missingArrayItemsPaths,
    unsupportedKeywordCount: unsupported.size,
    unsupportedKeywords: [...unsupported].sort(),
    schemaHash: schemaHash(schema),
  };
}

export function lintDeepSeekRequestShape(body) {
  const errors = [];
  const expectedKeys = new Set(["model", "messages", "tools", "tool_choice", "temperature", "max_tokens", "thinking", "stream"]);
  for (const key of Object.keys(body || {})) if (!expectedKeys.has(key)) errors.push(`unexpected:${key}`);
  for (const key of expectedKeys) if (!Object.hasOwn(body || {}, key)) errors.push(`missing:${key}`);
  if (body?.response_format !== undefined) errors.push("response_format_forbidden");
  if (body?.stream !== false) errors.push("stream_must_be_false");
  if (body?.tools?.length !== 1) errors.push("single_tool_required");
  const tool = body?.tools?.[0];
  if (tool?.function?.name !== DEEPSEEK_TOOL_NAME) errors.push("tool_name_mismatch");
  if (tool?.function?.strict !== true) errors.push("strict_required");
  const schema = lintDeepSeekSchema(tool?.function?.parameters);
  if (!schema.serializable || schema.unsupportedKeywordCount || schema.missingRequiredCount || schema.missingAdditionalPropertiesCount || schema.missingArrayItemsCount) errors.push("schema_not_compatible");
  if (body?.tool_choice?.type !== "function" || body?.tool_choice?.function?.name !== DEEPSEEK_TOOL_NAME) errors.push("tool_choice_mismatch");
  return { ok: errors.length === 0, errors, schema };
}

export function lintDeepSeekRequestShapeV2(body) {
  const shape = lintDeepSeekRequestShape(body);
  const parameters = body?.tools?.[0]?.function?.parameters;
  const completeness = lintDeepSeekSchemaCompleteness(parameters);
  const errors = [...shape.errors];
  if (completeness.missingTypeAnyOfRefCount || completeness.missingRequiredCount || completeness.missingAdditionalPropertiesCount || completeness.missingArrayItemsCount || completeness.unsupportedKeywordCount) {
    errors.push("schema_node_completeness_invalid");
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], schema: completeness };
}

export function validateDeepSeekToolArguments(value, { evidenceTokens = [] } = {}) {
  return validateDeepSeekToolArgumentsWithSchema(value, { evidenceTokens, schema: deepseekDecisionToolSchema });
}

export function validateDeepSeekToolArgumentsV2(value, { evidenceTokens = [] } = {}) {
  return validateDeepSeekToolArgumentsWithSchema(value, { evidenceTokens, schema: deepseekDecisionToolSchemaV2 });
}

function validateDeepSeekToolArgumentsWithSchema(value, { evidenceTokens = [], schema } = {}) {
  const errors = [];
  validateNode(value, schema, "$", errors, schema);
  if (!isRecord(value)) errors.push("output_not_object");
  if (!Array.isArray(value?.facts) || value.facts.length === 0) errors.push("facts_required");
  if (!Array.isArray(value?.inferences) || value.inferences.length === 0) errors.push("inferences_required");
  if (!Array.isArray(value?.evidence) || value.evidence.length === 0) errors.push("evidence_required");
  if (!Array.isArray(value?.recommendedActions) || value.recommendedActions.length === 0) errors.push("recommendedActions_required");
  if (!Array.isArray(value?.limitations) || value.limitations.length === 0 || value.limitations.some((item) => typeof item !== "string" || item.length === 0)) errors.push("limitations_required");
  if (value?.facts?.some((item) => !nonEmpty(item?.label) || !nonEmpty(item?.value) || !nonEmpty(item?.evidenceToken))) errors.push("fact_fields");
  if (value?.inferences?.some((item) => !nonEmpty(item?.inference) || !Array.isArray(item?.evidenceTokens) || item.evidenceTokens.length === 0)) errors.push("inference_fields");
  if (value?.evidence?.some((item) => !nonEmpty(item?.evidenceToken) || !nonEmpty(item?.value))) errors.push("evidence_fields");
  if (value?.recommendedActions?.some((item) => !nonEmpty(item?.action) || !nonEmpty(item?.ownerRole) || !nonEmpty(item?.dueWindow) || !nonEmpty(item?.basis) || item?.draftStatus !== "Draft only")) errors.push("action_fields");
  if (value?.confidence && !["High", "Medium", "Low"].includes(value.confidence.level)) errors.push("confidence_level");
  if (value?.priority && !["Critical", "High", "Medium", "Low", "Monitor"].includes(value.priority)) errors.push("priority");
  if (value?.safety && (value.safety.customerIdentityMasked !== true || value.safety.exactAmountSentToModel !== false || value.safety.rawTimelineSent !== false || value.safety.crmWritebackEnabled !== false)) errors.push("safety_flags");
  const allowedEvidence = new Set(evidenceTokens);
  if (allowedEvidence.size) {
    for (const fact of value?.facts || []) if (!allowedEvidence.has(fact.evidenceToken)) errors.push("fact:evidence");
    for (const item of value?.evidence || []) if (!allowedEvidence.has(item.evidenceToken)) errors.push("evidence:source");
    for (const item of value?.inferences || []) for (const token of item.evidenceTokens || []) if (!allowedEvidence.has(token)) errors.push("inference:evidence");
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function mapDeepSeekToolArgumentsToCanonical(value, options = {}) {
  const validation = validateDeepSeekToolArguments(value, options);
  if (!validation.ok) throw new TypeError(`DeepSeek tool arguments rejected: ${validation.errors.join(",")}`);
  return mapCanonicalActions(value);
}

export function mapDeepSeekToolArgumentsToCanonicalV2(value, options = {}) {
  const validation = validateDeepSeekToolArgumentsV2(value, options);
  if (!validation.ok) throw new TypeError(`DeepSeek tool arguments rejected: ${validation.errors.join(",")}`);
  return mapCanonicalActions(value);
}

export function validateDeepSeekToolArgumentsV5(value, options = {}) {
  return validateExternalModelToolArgumentsV2(value, options);
}

export function mapDeepSeekToolArgumentsToCanonicalV5(value, options = {}) {
  return mapExternalModelToolArgumentsToCanonicalV2(value, options);
}

export function validateDeepSeekToolArgumentsV6(value, options = {}) {
  return validateProviderTransportToolArgumentsV1(value, options);
}

export function mapDeepSeekToolArgumentsToCanonicalV6(value, options = {}) {
  return mapProviderTransportToCanonicalV2(value, options);
}

export function validateDeepSeekToolArgumentsV6R1(value, options = {}) {
  return validateProviderTransportToolArgumentsV2(value, options);
}

export function mapDeepSeekToolArgumentsToCanonicalV6R1(value, options = {}) {
  return mapProviderTransportToCanonicalV2WithRiskEvidence(value, options);
}

export function validateDeepSeekToolArgumentsV6R2(value, options = {}) {
  return validateProviderTransportToolArgumentsV3(value, options);
}

export function mapDeepSeekToolArgumentsToCanonicalV6R2(value, options = {}) {
  return mapProviderTransportV3ToCanonicalV2(value, options);
}

export function validateDeepSeekToolArgumentsV6R3(value, options = {}) {
  return validateProviderTransportToolArgumentsV4(value, options);
}

export function mapDeepSeekToolArgumentsToCanonicalV6R3(value, options = {}) {
  return mapProviderTransportV4ToCanonicalV2(value, options);
}

export function validateDeepSeekToolArgumentsV6R4(value, options = {}) {
  return validateProviderTransportToolArgumentsV5(value, options);
}

export function mapDeepSeekToolArgumentsToCanonicalV6R4(value, options = {}) {
  return mapProviderTransportV5ToCanonicalV2(value, options);
}

export function validateDeepSeekToolArgumentsV6R5(value, options = {}) {
  return validateProviderTransportToolArgumentsV6(value, options);
}

export function mapDeepSeekToolArgumentsToCanonicalV6R5(value, options = {}) {
  return mapProviderTransportV6ToCanonicalV2(value, options);
}

export function validateDeepSeekToolArgumentsV6R6(value, options = {}) {
  return validateProviderTransportToolArgumentsV7(value, options);
}

export function mapDeepSeekToolArgumentsToCanonicalV6R6(value, options = {}) {
  return mapProviderTransportV7ToCanonicalV2(value, options);
}

function mapCanonicalActions(value) {
  return {
    ...value,
    recommendedActions: value.recommendedActions.map(({ draftStatus, ...action }) => ({ ...action, status: draftStatus })),
  };
}

export function schemaHash(schema) {
  return createHash("sha256").update(canonicalJson(schema)).digest("hex");
}

function validateNode(value, schema, path, errors, rootSchema) {
  if (!schema || typeof schema !== "object") return;
  if (schema.$ref) {
    const ref = schema.$ref.replace(/^#\/$defs\//, "");
    validateNode(value, rootSchema.$defs?.[ref], path, errors, rootSchema);
    return;
  }
  if (Array.isArray(schema.anyOf)) {
    const branchErrors = schema.anyOf.map((branch) => { const branchResult = []; validateNode(value, branch, path, branchResult, rootSchema); return branchResult; });
    if (!branchErrors.some((branch) => branch.length === 0)) errors.push(`${path}:anyOf`);
    return;
  }
  if (schema.enum && !schema.enum.some((item) => Object.is(item, value))) errors.push(`${path}:enum`);
  if (schema.type === "object") {
    if (!isRecord(value)) { errors.push(`${path}:object`); return; }
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) errors.push(`${path}:missing:${key}`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties || {}, key)) errors.push(`${path}:extra:${key}`);
      else validateNode(value[key], schema.properties[key], `${path}.${key}`, errors, rootSchema);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) { errors.push(`${path}:array`); return; }
    for (let index = 0; index < value.length; index += 1) validateNode(value[index], schema.items, `${path}[${index}]`, errors, rootSchema);
  } else if (schema.type === "string") {
    if (typeof value !== "string") errors.push(`${path}:string`);
    else if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${path}:pattern`);
  } else if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${path}:number`);
  } else if (schema.type === "integer") {
    if (!Number.isInteger(value)) errors.push(`${path}:integer`);
  } else if (schema.type === "boolean") {
    if (typeof value !== "boolean") errors.push(`${path}:boolean`);
  }
}

function objectSchema(properties) { return { type: "object", properties, required: Object.keys(properties), additionalProperties: false }; }
function addEnumTypes(node) {
  if (Array.isArray(node)) return node.map(addEnumTypes);
  if (!node || typeof node !== "object") return node;
  const copy = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, addEnumTypes(value)]));
  if (!Object.hasOwn(copy, "type") && !Object.hasOwn(copy, "anyOf") && !Object.hasOwn(copy, "$ref") && Array.isArray(copy.enum)) {
    copy.type = enumType(copy.enum);
  }
  return copy;
}
function enumType(values) {
  if (values.every((value) => typeof value === "string")) return "string";
  if (values.every((value) => typeof value === "boolean")) return "boolean";
  if (values.every((value) => Number.isInteger(value))) return "integer";
  if (values.every((value) => typeof value === "number" && Number.isFinite(value))) return "number";
  throw new TypeError("V2 enum values must share a JSON primitive type");
}
function isSchemaNode(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function escapeJsonPointer(value) { return String(value).replaceAll("~", "~0").replaceAll("/", "~1"); }
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function nonEmpty(value) { return typeof value === "string" && value.length > 0; }
function canonicalJson(value) { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`; return JSON.stringify(value); }
