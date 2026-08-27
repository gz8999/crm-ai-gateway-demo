import {
  CANONICAL_RISK_CATEGORY_CODES,
  buildRequestScopedRiskCategoryCatalog,
  validateCanonicalRiskCategoryCodes,
  validateStructuredRiskCategoryEvidence,
} from "./riskCategoryContract.mjs";
import { validateSafeFactCatalog, validateSafeFactReferences } from "./safeFactCatalog.mjs";
import {
  buildProviderSelectionCatalog,
  expandProviderSelections,
  validateProviderSelectionCatalog,
  validateProviderSelectionReferences,
} from "./providerSelectionCatalog.mjs";
import { validateJsonSchemaWithDiagnostics } from "./jsonSchemaDiagnostics.mjs";
import {
  buildRequiredSlotSchema,
  collectionCardinality,
  collectionMinimum,
  decodeRequiredSlots,
  encodeRequiredSlots,
  evidenceReferenceCardinality,
  evidenceReferenceMinimum,
} from "./decisionPackCardinalityContract.mjs";

export const EXTERNAL_MODEL_RESPONSE_V2_VERSION = "Decision Pack Model Response v2";
export const PROVIDER_TRANSPORT_CONTRACT_V1_VERSION = "Provider Transport Contract v1";
export const PROVIDER_TRANSPORT_CONTRACT_V2_VERSION = "Provider Transport Contract v2";
export const PROVIDER_TRANSPORT_CONTRACT_V3_VERSION = "Provider Transport Contract v3";
export const PROVIDER_TRANSPORT_CONTRACT_V4_VERSION = "Provider Transport Contract v4";
export const PROVIDER_TRANSPORT_CONTRACT_V5_VERSION = "Provider Transport Contract v5";
export const PROVIDER_TRANSPORT_CONTRACT_V6_VERSION = "Provider Transport Contract v6";
export const PROVIDER_TRANSPORT_CONTRACT_V7_VERSION = "Provider Transport Contract v7";

export const PROVIDER_SAFE_TEXT_PATTERN = String.raw`^[^"\\\u0000-\u001F]{1,240}$`;

export const LIMITATION_CODES = Object.freeze([
  "IDENTITY_MASKED",
  "EXACT_AMOUNT_WITHHELD",
  "RAW_TIMELINE_WITHHELD",
  "INSUFFICIENT_EVIDENCE",
  "DATA_CONTRADICTION",
  "NO_ACTUAL_DATA",
  "NO_COVERAGE_DATA",
  "STALE_INTERACTION_DATA",
  "MODEL_UNCERTAINTY",
  "OTHER_APPROVED_LIMITATION",
]);

export const SAFETY_POLICY_CODES = Object.freeze([
  "SAFE_CONTEXT_ONLY",
  "NO_RAW_CRM",
  "NO_IDENTITY",
  "NO_EXACT_AMOUNT",
  "NO_RAW_TIMELINE",
  "NO_CRM_WRITEBACK",
]);

export const LIMITATION_CODE_LABELS_ZH = Object.freeze({
  IDENTITY_MASKED: "客户及联系人身份已脱敏",
  EXACT_AMOUNT_WITHHELD: "模型仅接收金额区间，不接收精确金额",
  RAW_TIMELINE_WITHHELD: "未向模型提供原始活动记录正文",
  INSUFFICIENT_EVIDENCE: "当前证据不足，结论需人工复核",
  DATA_CONTRADICTION: "现有数据存在矛盾，需先核实事实",
  NO_ACTUAL_DATA: "当前未提供实绩数据",
  NO_COVERAGE_DATA: "当前未提供服务覆盖数据",
  STALE_INTERACTION_DATA: "互动信号可能已过期",
  MODEL_UNCERTAINTY: "模型对当前判断存在不确定性",
  OTHER_APPROVED_LIMITATION: "存在其他已批准的分析限制",
});

export const SAFETY_POLICY_CODE_LABELS_ZH = Object.freeze({
  SAFE_CONTEXT_ONLY: "仅使用安全上下文",
  NO_RAW_CRM: "未向模型发送原始 CRM 数据",
  NO_IDENTITY: "未向模型发送客户或联系人身份",
  NO_EXACT_AMOUNT: "未向模型发送精确金额",
  NO_RAW_TIMELINE: "未向模型发送原始活动记录",
  NO_CRM_WRITEBACK: "未执行 CRM 写回",
});

const text = () => ({ type: "string" });
const safeText = () => ({ type: "string", pattern: PROVIDER_SAFE_TEXT_PATTERN });
const enumString = (values) => ({ type: "string", enum: [...values] });
const fixedBoolean = (value) => ({ type: "boolean", enum: [value] });
const objectSchema = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

function limitationsSchema() {
  const standardCodes = LIMITATION_CODES.filter((code) => code !== "OTHER_APPROVED_LIMITATION");
  return {
    anyOf: [
      objectSchema({ codes: { type: "array", items: enumString(standardCodes) } }),
      objectSchema({
        codes: { type: "array", items: enumString(LIMITATION_CODES) },
        otherCodeDetail: text(),
      }),
    ],
  };
}

function baseSchema({ actionStatusKey }) {
  return objectSchema({
    facts: { type: "array", items: objectSchema({ label: text(), value: text(), evidenceToken: text() }) },
    inferences: { type: "array", items: objectSchema({ inference: text(), evidenceTokens: { type: "array", items: text() } }) },
    evidence: { type: "array", items: objectSchema({ evidenceToken: text(), value: text() }) },
    confidence: objectSchema({ level: enumString(["High", "Medium", "Low"]), reason: text() }),
    recommendedActions: {
      type: "array",
      items: objectSchema({
        action: text(),
        ownerRole: text(),
        dueWindow: text(),
        basis: text(),
        [actionStatusKey]: enumString(["Draft only"]),
      }),
    },
    priority: enumString(["Critical", "High", "Medium", "Low", "Monitor"]),
    riskCategories: { type: "array", items: text() },
    provider: text(),
    model: text(),
    modelVersion: text(),
    fallback: objectSchema({ state: enumString(["not_applicable", "used"]), reason: text() }),
    safety: objectSchema({
      identityMasked: fixedBoolean(true),
      exactAmountWithheld: fixedBoolean(true),
      rawTimelineWithheld: fixedBoolean(true),
      crmWritebackPerformed: fixedBoolean(false),
      policyCodes: { type: "array", items: enumString(SAFETY_POLICY_CODES) },
    }),
    limitations: limitationsSchema(),
  });
}

function providerTransportSchema() {
  const schema = baseSchema({ actionStatusKey: "draftStatus" });
  const action = schema.properties.recommendedActions.items;
  action.properties.evidenceTokens = { type: "array", items: text() };
  action.required.push("evidenceTokens");
  return schema;
}

function providerTransportSchemaV2() {
  const schema = providerTransportSchema();
  schema.properties.riskCategories = {
    type: "array",
    items: objectSchema({
      code: enumString(CANONICAL_RISK_CATEGORY_CODES),
      evidenceTokens: { type: "array", items: text() },
    }),
  };
  return schema;
}

function providerTransportSchemaV3(options) {
  const schema = providerTransportSchemaV2();
  const requestCatalog = buildRequestScopedRiskCategoryCatalog(options);
  if (requestCatalog.length === 0) throw new TypeError("No evidence-supported risk category is available");
  schema.properties.riskCategories = {
    type: "array",
    items: {
      anyOf: requestCatalog.map(({ code, compatibleEvidenceTokens }) => objectSchema({
        code: enumString([code]),
        evidenceTokens: { type: "array", items: enumString(compatibleEvidenceTokens) },
      })),
    },
  };
  schema.properties.safety = objectSchema({
    identityMasked: fixedBoolean(true),
    exactAmountWithheld: fixedBoolean(true),
    rawTimelineWithheld: fixedBoolean(true),
    crmWritebackPerformed: fixedBoolean(false),
    policyAssertions: objectSchema(Object.fromEntries(SAFETY_POLICY_CODES.map((code) => [code, fixedBoolean(true)]))),
  });
  return schema;
}

function providerTransportSchemaV4(options) {
  const schema = providerTransportSchemaV3(options);
  const evidenceTokens = [...new Set(options?.evidenceTokens || [])].sort();
  if (evidenceTokens.length === 0) throw new TypeError("No request-scoped evidence token is available");
  const evidenceToken = enumString(evidenceTokens);

  schema.properties.facts.items.properties.label = safeText();
  schema.properties.facts.items.properties.value = safeText();
  schema.properties.facts.items.properties.evidenceToken = evidenceToken;
  schema.properties.inferences.items.properties.inference = safeText();
  schema.properties.inferences.items.properties.evidenceTokens.items = evidenceToken;
  schema.properties.evidence.items.properties.evidenceToken = evidenceToken;
  schema.properties.evidence.items.properties.value = safeText();
  schema.properties.confidence.properties.reason = safeText();
  schema.properties.recommendedActions.items.properties.action = safeText();
  schema.properties.recommendedActions.items.properties.ownerRole = enumString(["待人工指定"]);
  schema.properties.recommendedActions.items.properties.dueWindow = enumString(["待人工确定"]);
  schema.properties.recommendedActions.items.properties.basis = safeText();
  schema.properties.recommendedActions.items.properties.evidenceTokens.items = evidenceToken;
  schema.properties.provider = enumString([String(options?.provider || "openai-compatible")]);
  schema.properties.model = enumString([String(options?.model || "deepseek-v4-pro")]);
  schema.properties.modelVersion = enumString([String(options?.modelVersion || options?.model || "deepseek-v4-pro")]);
  schema.properties.fallback.properties.state = enumString(["not_applicable"]);
  schema.properties.fallback.properties.reason = enumString(["NONE"]);
  for (const branch of schema.properties.limitations.anyOf || []) {
    if (branch.properties?.otherCodeDetail) branch.properties.otherCodeDetail = safeText();
  }
  return schema;
}

function providerTransportSchemaV5(options) {
  const schema = providerTransportSchemaV4(options);
  const catalogValidation = validateSafeFactCatalog(options?.factCatalog, { evidenceTokens: options?.evidenceTokens || [] });
  if (!catalogValidation.ready) throw new TypeError("Safe Fact Catalog is invalid");
  const factCodes = options.factCatalog.map((item) => item.factCode).sort();
  schema.properties.facts = {
    type: "array",
    items: objectSchema({ factCode: enumString(factCodes) }),
  };
  return schema;
}

function providerTransportSchemaV6(options) {
  const scoped = providerTransportSchemaV5(options);
  const selectionCatalog = options?.selectionCatalog || buildProviderSelectionCatalog(options);
  const catalogValidation = validateProviderSelectionCatalog(selectionCatalog, { evidenceTokens: options?.evidenceTokens || [] });
  if (!catalogValidation.ready) throw new TypeError("Provider Selection Catalog is invalid");
  const standardLimitationCodes = LIMITATION_CODES.filter((code) => code !== "OTHER_APPROVED_LIMITATION");
  return objectSchema({
    facts: scoped.properties.facts,
    inferences: {
      type: "array",
      items: {
        anyOf: selectionCatalog.inferences.map((item) => objectSchema({
          inferenceCode: enumString([item.code]),
          evidenceTokens: { type: "array", items: enumString(item.compatibleEvidenceTokens) },
        })),
      },
    },
    confidence: {
      anyOf: selectionCatalog.confidence.map((item) => objectSchema({
        level: enumString([item.level]),
        reasonCode: enumString([item.code]),
      })),
    },
    recommendedActions: {
      type: "array",
      items: {
        anyOf: selectionCatalog.actions.map((item) => objectSchema({
          actionCode: enumString([item.code]),
          evidenceTokens: { type: "array", items: enumString(item.compatibleEvidenceTokens) },
        })),
      },
    },
    priority: scoped.properties.priority,
    riskCategories: scoped.properties.riskCategories,
    provider: scoped.properties.provider,
    model: scoped.properties.model,
    modelVersion: scoped.properties.modelVersion,
    fallback: scoped.properties.fallback,
    safety: scoped.properties.safety,
    limitations: objectSchema({ codes: { type: "array", items: enumString(standardLimitationCodes) } }),
  });
}

function providerTransportSchemaV7(options) {
  const scoped = providerTransportSchemaV6(options);
  const selectionCatalog = options.selectionCatalog;
  const riskCatalog = buildRequestScopedRiskCategoryCatalog(options);
  const standardLimitationCodes = LIMITATION_CODES.filter((code) => code !== "OTHER_APPROVED_LIMITATION");
  const factBounds = collectionCardinality("facts", { maximum: options.factCatalog.length });
  const inferenceBounds = collectionCardinality("inferences", { maximum: selectionCatalog.inferences.length });
  const actionBounds = collectionCardinality("recommendedActions", { maximum: selectionCatalog.actions.length });
  const riskBounds = collectionCardinality("riskCategories", { maximum: riskCatalog.length });
  const limitationBounds = collectionCardinality("limitations.codes", { maximum: standardLimitationCodes.length });
  const schema = objectSchema({
    facts: buildRequiredSlotSchema({ $ref: "#/$defs/factSelection" }, factBounds),
    inferences: buildRequiredSlotSchema({ $ref: "#/$defs/inferenceSelection" }, inferenceBounds),
    confidence: scoped.properties.confidence,
    recommendedActions: buildRequiredSlotSchema({ $ref: "#/$defs/actionSelection" }, actionBounds),
    priority: scoped.properties.priority,
    riskCategories: buildRequiredSlotSchema({ $ref: "#/$defs/riskCategorySelection" }, riskBounds),
    provider: scoped.properties.provider,
    model: scoped.properties.model,
    modelVersion: scoped.properties.modelVersion,
    fallback: scoped.properties.fallback,
    safety: scoped.properties.safety,
    limitations: objectSchema({
      codes: buildRequiredSlotSchema({ $ref: "#/$defs/limitationCode" }, limitationBounds),
    }),
  });
  schema.$defs = {
    factSelection: objectSchema({ factCode: enumString(options.factCatalog.map((item) => item.factCode).sort()) }),
    inferenceSelection: {
      anyOf: selectionCatalog.inferences.map((item) => objectSchema({
        inferenceCode: enumString([item.code]),
        evidenceTokens: buildRequiredSlotSchema(
          enumString(item.compatibleEvidenceTokens),
          evidenceReferenceCardinality("inference", { maximum: item.compatibleEvidenceTokens.length }),
        ),
      })),
    },
    actionSelection: {
      anyOf: selectionCatalog.actions.map((item) => objectSchema({
        actionCode: enumString([item.code]),
        evidenceTokens: buildRequiredSlotSchema(
          enumString(item.compatibleEvidenceTokens),
          evidenceReferenceCardinality("action", { maximum: item.compatibleEvidenceTokens.length }),
        ),
      })),
    },
    riskCategorySelection: {
      anyOf: riskCatalog.map((item) => objectSchema({
        code: enumString([item.code]),
        evidenceTokens: buildRequiredSlotSchema(
          enumString(item.compatibleEvidenceTokens),
          evidenceReferenceCardinality("riskCategory", { maximum: item.compatibleEvidenceTokens.length }),
        ),
      })),
    },
    limitationCode: enumString(standardLimitationCodes),
  };
  return schema;
}

export const externalModelResponseJsonSchemaV2 = Object.freeze(baseSchema({ actionStatusKey: "status" }));
export const externalModelToolSchemaV2 = Object.freeze(baseSchema({ actionStatusKey: "draftStatus" }));
export const providerTransportToolSchemaV1 = Object.freeze(providerTransportSchema());
export const providerTransportToolSchemaV2 = Object.freeze(providerTransportSchemaV2());

export function buildProviderTransportToolSchemaV3(options = {}) {
  return providerTransportSchemaV3(options);
}

export function buildProviderTransportToolSchemaV4(options = {}) {
  return providerTransportSchemaV4(options);
}

export function buildProviderTransportToolSchemaV5(options = {}) {
  return providerTransportSchemaV5(options);
}

export function buildProviderTransportToolSchemaV6(options = {}) {
  return providerTransportSchemaV6(options);
}

export function buildProviderTransportToolSchemaV7(options = {}) {
  return providerTransportSchemaV7(normalizeProviderV7Options(options));
}

export function validateExternalModelToolArgumentsV2(value, options = {}) {
  return validateAgainstContract(value, externalModelToolSchemaV2, { ...options, actionStatusKey: "draftStatus" });
}

export function validateExternalModelResponseV2(value, options = {}) {
  return validateAgainstContract(value, externalModelResponseJsonSchemaV2, { ...options, actionStatusKey: "status" });
}

export function mapExternalModelToolArgumentsToCanonicalV2(value, options = {}) {
  const toolValidation = validateExternalModelToolArgumentsV2(value, options);
  if (!toolValidation.ok) throw new TypeError(`Response Contract v2 Tool arguments rejected: ${toolValidation.errors.join(",")}`);
  const canonical = {
    ...value,
    recommendedActions: value.recommendedActions.map(({ draftStatus, ...action }) => ({ ...action, status: draftStatus })),
  };
  const responseValidation = validateExternalModelResponseV2(canonical, options);
  if (!responseValidation.ok) throw new TypeError(`Response Contract v2 canonical output rejected: ${responseValidation.errors.join(",")}`);
  return canonical;
}

export function validateProviderTransportToolArgumentsV1(value, { evidenceTokens = [] } = {}) {
  const errors = [];
  validateNode(value, providerTransportToolSchemaV1, "$", errors);
  const allowedEvidence = new Set(evidenceTokens);
  for (const action of value?.recommendedActions || []) {
    if (!Array.isArray(action?.evidenceTokens) || action.evidenceTokens.length === 0) {
      errors.push("action_evidence_required");
      continue;
    }
    if (new Set(action.evidenceTokens).size !== action.evidenceTokens.length) errors.push("action_evidence_duplicate");
    if (action.evidenceTokens.some((token) => !allowedEvidence.has(token))) errors.push("action_evidence_invalid");
  }
  const mappedToolArguments = mapTransportActionsToV2ToolArguments(value);
  const canonicalContract = validateExternalModelToolArgumentsV2(mappedToolArguments, { evidenceTokens });
  if (!canonicalContract.ok) errors.push(...canonicalContract.errors.map((error) => `canonical:${error}`));
  return { ok: errors.length === 0, errors: [...new Set(errors)], mappedToolArguments };
}

export function mapProviderTransportToCanonicalV2(value, options = {}) {
  const validation = validateProviderTransportToolArgumentsV1(value, options);
  if (!validation.ok) throw new TypeError(`Provider Transport Contract v1 rejected: ${validation.errors.join(",")}`);
  return mapExternalModelToolArgumentsToCanonicalV2(validation.mappedToolArguments, options);
}

export function validateProviderTransportToolArgumentsV2(value, { evidenceTokens = [], evidenceTypeByToken = {} } = {}) {
  const schemaErrors = [];
  validateNode(value, providerTransportToolSchemaV2, "$", schemaErrors);
  const errors = [...schemaErrors];
  const actionValidation = validateStructuredActionEvidence(value, evidenceTokens);
  errors.push(...actionValidation.errors);
  const categoryValidation = validateStructuredRiskCategoryEvidence(value, { evidenceTokens, evidenceTypeByToken });
  errors.push(...categoryValidation.errors);
  const mappedToolArguments = mapTransportV2ToV2ToolArguments(value);
  const canonicalContract = validateExternalModelToolArgumentsV2(mappedToolArguments, { evidenceTokens });
  if (!canonicalContract.ok) errors.push(...canonicalContract.errors.map((error) => `canonical:${error}`));
  const canonicalCategories = validateCanonicalRiskCategoryCodes(mappedToolArguments?.riskCategories);
  if (!canonicalCategories.ready) errors.push(...canonicalCategories.errors.map((error) => `canonical:${error}`));
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    schemaReady: schemaErrors.length === 0,
    schemaErrors: [...new Set(schemaErrors)],
    actionEvidence: actionValidation,
    categoryEvidence: categoryValidation,
    canonicalContract,
    mappedToolArguments,
    riskCategoryEvidence: categoryValidation.associations,
  };
}

export function mapProviderTransportToCanonicalV2WithRiskEvidence(value, options = {}) {
  const validation = validateProviderTransportToolArgumentsV2(value, options);
  if (!validation.ok) throw new TypeError(`Provider Transport Contract v2 rejected: ${validation.errors.join(",")}`);
  const output = mapExternalModelToolArgumentsToCanonicalV2(validation.mappedToolArguments, options);
  return { output, riskCategoryEvidence: validation.riskCategoryEvidence };
}

export function validateProviderTransportToolArgumentsV3(value, { evidenceTokens = [], evidenceTypeByToken = {} } = {}) {
  return validateProviderTransportToolArgumentsScoped(value, { evidenceTokens, evidenceTypeByToken }, buildProviderTransportToolSchemaV3);
}

export function validateProviderTransportToolArgumentsV4(value, { evidenceTokens = [], evidenceTypeByToken = {}, provider, model, modelVersion } = {}) {
  return validateProviderTransportToolArgumentsScoped(value, { evidenceTokens, evidenceTypeByToken, provider, model, modelVersion }, buildProviderTransportToolSchemaV4);
}

export function validateProviderTransportToolArgumentsV5(value, { evidenceTokens = [], evidenceTypeByToken = {}, factCatalog = [], provider, model, modelVersion } = {}) {
  const options = { evidenceTokens, evidenceTypeByToken, factCatalog, provider, model, modelVersion };
  let schema;
  try {
    schema = buildProviderTransportToolSchemaV5(options);
  } catch {
    return failedFactReferenceValidation(value, ["fact_catalog_invalid"]);
  }
  const schemaErrors = [];
  validateNode(value, schema, "$", schemaErrors);
  const catalogValidation = validateSafeFactCatalog(factCatalog, { evidenceTokens });
  const factReferences = validateSafeFactReferences(value?.facts, factCatalog);
  if (schemaErrors.length || !catalogValidation.ready || !factReferences.ready) {
    return failedFactReferenceValidation(value, [...schemaErrors, ...catalogValidation.errors, ...factReferences.errors]);
  }
  const expanded = { ...value, facts: factReferences.facts };
  const validation = validateProviderTransportToolArgumentsV4(expanded, options);
  const errors = [...validation.errors];
  return {
    ...validation,
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    schemaReady: true,
    schemaErrors: [],
    factCatalog: catalogValidation,
    factReferences,
    expandedToolArguments: expanded,
  };
}

export function validateProviderTransportToolArgumentsV6(value, {
  evidenceTokens = [], evidenceTypeByToken = {}, factCatalog = [], selectionCatalog, provider, model, modelVersion,
} = {}) {
  const options = {
    evidenceTokens,
    evidenceTypeByToken,
    factCatalog,
    selectionCatalog: selectionCatalog || buildProviderSelectionCatalog({ evidenceTokens, evidenceTypeByToken }),
    provider,
    model,
    modelVersion,
  };
  let schema;
  try {
    schema = buildProviderTransportToolSchemaV6(options);
  } catch {
    return failedSelectionReferenceValidation(value, ["selection_catalog_invalid"]);
  }
  const schemaValidation = validateJsonSchemaWithDiagnostics(value, schema);
  const schemaErrors = schemaValidation.legacyErrors;
  const factCatalogValidation = validateSafeFactCatalog(factCatalog, { evidenceTokens });
  const factReferences = validateSafeFactReferences(value?.facts, factCatalog);
  const selectionCatalogValidation = validateProviderSelectionCatalog(options.selectionCatalog, { evidenceTokens });
  const selectionReferences = validateProviderSelectionReferences(value, options.selectionCatalog);
  const categoryValidation = validateStructuredRiskCategoryEvidence(value, { evidenceTokens, evidenceTypeByToken });
  const errors = [
    ...schemaErrors,
    ...factCatalogValidation.errors,
    ...factReferences.errors,
    ...selectionCatalogValidation.errors,
    ...selectionReferences.errors,
    ...categoryValidation.errors,
  ];
  if (!Array.isArray(value?.riskCategories) || value.riskCategories.length < collectionMinimum("riskCategories")) errors.push("risk_category_required");
  if (!Array.isArray(value?.limitations?.codes) || value.limitations.codes.length < collectionMinimum("limitations.codes")) errors.push("limitations_codes_required");
  for (const required of ["IDENTITY_MASKED", "EXACT_AMOUNT_WITHHELD", "RAW_TIMELINE_WITHHELD"]) {
    if (!value?.limitations?.codes?.includes(required)) errors.push(`limitation_required:${required}`);
  }
  if (errors.length) return failedSelectionReferenceValidation(value, errors, {
    schemaDiagnostics: schemaValidation,
    schemaErrors,
    factCatalogValidation,
    factReferences,
    selectionCatalogValidation,
    selectionReferences,
    categoryValidation,
  });

  const expanded = expandProviderSelections(value, options.selectionCatalog);
  const evidenceByToken = new Map(options.selectionCatalog.evidence.map((item) => [item.evidenceToken, item]));
  const evidenceTokenSet = new Set([
    ...factReferences.facts.map((item) => item.evidenceToken),
    ...selectionReferences.selectedEvidenceTokens,
  ]);
  const mappedToolArguments = {
    facts: factReferences.facts,
    inferences: expanded.inferences,
    evidence: [...evidenceTokenSet].sort().map((token) => ({ ...evidenceByToken.get(token) })),
    confidence: expanded.confidence,
    recommendedActions: expanded.recommendedActions.map(({ evidenceTokens: actionEvidence, basis, ...action }) => ({
      ...action,
      basis: formatStructuredBasis(basis, actionEvidence),
    })),
    priority: value.priority,
    riskCategories: value.riskCategories.map((item) => item.code),
    provider: value.provider,
    model: value.model,
    modelVersion: value.modelVersion,
    fallback: value.fallback,
    safety: {
      identityMasked: value.safety.identityMasked,
      exactAmountWithheld: value.safety.exactAmountWithheld,
      rawTimelineWithheld: value.safety.rawTimelineWithheld,
      crmWritebackPerformed: value.safety.crmWritebackPerformed,
      policyCodes: [...SAFETY_POLICY_CODES],
    },
    limitations: value.limitations,
  };
  const canonicalContract = validateExternalModelToolArgumentsV2(mappedToolArguments, { evidenceTokens });
  if (!canonicalContract.ok) errors.push(...canonicalContract.errors.map((error) => `canonical:${error}`));
  const canonicalCategories = validateCanonicalRiskCategoryCodes(mappedToolArguments.riskCategories);
  if (!canonicalCategories.ready) errors.push(...canonicalCategories.errors.map((error) => `canonical:${error}`));
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    schemaReady: schemaErrors.length === 0,
    schemaErrors: [...new Set(schemaErrors)],
    schemaDiagnostics: schemaValidation,
    factCatalog: factCatalogValidation,
    factReferences,
    selectionCatalog: selectionCatalogValidation,
    selectionReferences,
    actionEvidence: { ready: selectionReferences.ready, errors: selectionReferences.errors },
    categoryEvidence: categoryValidation,
    canonicalContract,
    mappedToolArguments,
    riskCategoryEvidence: categoryValidation.associations,
  };
}

export function encodeProviderTransportV7(value, options = {}) {
  const normalized = normalizeProviderV7Options(options);
  const riskCatalog = buildRequestScopedRiskCategoryCatalog(normalized);
  const inferenceByCode = new Map(normalized.selectionCatalog.inferences.map((item) => [item.code, item]));
  const actionByCode = new Map(normalized.selectionCatalog.actions.map((item) => [item.code, item]));
  const riskByCode = new Map(riskCatalog.map((item) => [item.code, item]));
  const encodeEvidence = (kind, item, definition) => ({
    ...item,
    evidenceTokens: encodeRequiredSlots(
      item.evidenceTokens,
      evidenceReferenceCardinality(kind, { maximum: definition.compatibleEvidenceTokens.length }),
    ),
  });
  return {
    ...value,
    facts: encodeRequiredSlots(value.facts, collectionCardinality("facts", { maximum: normalized.factCatalog.length })),
    inferences: encodeRequiredSlots(
      value.inferences.map((item) => encodeEvidence("inference", item, requiredDefinition(inferenceByCode, item.inferenceCode))),
      collectionCardinality("inferences", { maximum: normalized.selectionCatalog.inferences.length }),
    ),
    recommendedActions: encodeRequiredSlots(
      value.recommendedActions.map((item) => encodeEvidence("action", item, requiredDefinition(actionByCode, item.actionCode))),
      collectionCardinality("recommendedActions", { maximum: normalized.selectionCatalog.actions.length }),
    ),
    riskCategories: encodeRequiredSlots(
      value.riskCategories.map((item) => encodeEvidence("riskCategory", item, requiredDefinition(riskByCode, item.code))),
      collectionCardinality("riskCategories", { maximum: riskCatalog.length }),
    ),
    limitations: {
      codes: encodeRequiredSlots(
        value.limitations.codes,
        collectionCardinality("limitations.codes", { maximum: LIMITATION_CODES.length - 1 }),
      ),
    },
  };
}

export function decodeProviderTransportV7(value, options = {}) {
  const normalized = normalizeProviderV7Options(options);
  const riskCatalog = buildRequestScopedRiskCategoryCatalog(normalized);
  const inferenceByCode = new Map(normalized.selectionCatalog.inferences.map((item) => [item.code, item]));
  const actionByCode = new Map(normalized.selectionCatalog.actions.map((item) => [item.code, item]));
  const riskByCode = new Map(riskCatalog.map((item) => [item.code, item]));
  const decodeEvidence = (kind, item, definition) => ({
    ...item,
    evidenceTokens: decodeRequiredSlots(
      item.evidenceTokens,
      evidenceReferenceCardinality(kind, { maximum: definition.compatibleEvidenceTokens.length }),
    ),
  });
  const inferences = decodeRequiredSlots(value.inferences, collectionCardinality("inferences", { maximum: normalized.selectionCatalog.inferences.length }))
    .map((item) => decodeEvidence("inference", item, requiredDefinition(inferenceByCode, item.inferenceCode)));
  const recommendedActions = decodeRequiredSlots(value.recommendedActions, collectionCardinality("recommendedActions", { maximum: normalized.selectionCatalog.actions.length }))
    .map((item) => decodeEvidence("action", item, requiredDefinition(actionByCode, item.actionCode)));
  const riskCategories = decodeRequiredSlots(value.riskCategories, collectionCardinality("riskCategories", { maximum: riskCatalog.length }))
    .map((item) => decodeEvidence("riskCategory", item, requiredDefinition(riskByCode, item.code)));
  return {
    ...value,
    facts: decodeRequiredSlots(value.facts, collectionCardinality("facts", { maximum: normalized.factCatalog.length })),
    inferences,
    recommendedActions,
    riskCategories,
    limitations: {
      codes: decodeRequiredSlots(value.limitations.codes, collectionCardinality("limitations.codes", { maximum: LIMITATION_CODES.length - 1 })),
    },
  };
}

export function validateProviderTransportToolArgumentsV7(value, options = {}) {
  let normalized;
  let schema;
  try {
    normalized = normalizeProviderV7Options(options);
    schema = providerTransportSchemaV7(normalized);
  } catch {
    return failedSelectionReferenceValidation(value, ["selection_catalog_invalid"]);
  }
  const schemaValidation = validateJsonSchemaWithDiagnostics(value, schema);
  if (!schemaValidation.ok) {
    return failedSelectionReferenceValidation(value, schemaValidation.legacyErrors, {
      schemaDiagnostics: schemaValidation,
      schemaErrors: schemaValidation.legacyErrors,
    });
  }
  let decodedToolArguments;
  try {
    decodedToolArguments = decodeProviderTransportV7(value, normalized);
  } catch {
    return failedSelectionReferenceValidation(value, ["required_slot_decode_invalid"], {
      schemaDiagnostics: schemaValidation,
      schemaErrors: [],
    });
  }
  const validation = validateProviderTransportToolArgumentsV6(decodedToolArguments, normalized);
  return {
    ...validation,
    schemaReady: true,
    schemaErrors: [],
    schemaDiagnostics: schemaValidation,
    decodedToolArguments,
  };
}

function validateProviderTransportToolArgumentsScoped(value, options, schemaBuilder) {
  const { evidenceTokens = [], evidenceTypeByToken = {} } = options;
  let schema;
  try {
    schema = schemaBuilder(options);
  } catch {
    return {
      ok: false,
      errors: ["evidence_type_index_invalid"],
      schemaReady: false,
      schemaErrors: ["evidence_type_index_invalid"],
      actionEvidence: { ready: false, errors: ["not_run"] },
      categoryEvidence: { ready: false, errors: ["not_run"], associations: [] },
      canonicalContract: { ok: false, errors: ["not_run"] },
      mappedToolArguments: value,
      riskCategoryEvidence: [],
    };
  }
  const schemaErrors = [];
  validateNode(value, schema, "$", schemaErrors);
  const errors = [...schemaErrors];
  const actionValidation = validateStructuredActionEvidence(value, evidenceTokens);
  errors.push(...actionValidation.errors);
  const categoryValidation = validateStructuredRiskCategoryEvidence(value, { evidenceTokens, evidenceTypeByToken });
  errors.push(...categoryValidation.errors);
  if (!Array.isArray(value?.riskCategories) || value.riskCategories.length === 0) errors.push("risk_category_required");
  const mappedToolArguments = mapTransportV3ToV2ToolArguments(value);
  const canonicalContract = validateExternalModelToolArgumentsV2(mappedToolArguments, { evidenceTokens });
  if (!canonicalContract.ok) errors.push(...canonicalContract.errors.map((error) => `canonical:${error}`));
  const canonicalCategories = validateCanonicalRiskCategoryCodes(mappedToolArguments?.riskCategories);
  if (!canonicalCategories.ready) errors.push(...canonicalCategories.errors.map((error) => `canonical:${error}`));
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    schemaReady: schemaErrors.length === 0,
    schemaErrors: [...new Set(schemaErrors)],
    actionEvidence: actionValidation,
    categoryEvidence: categoryValidation,
    canonicalContract,
    mappedToolArguments,
    riskCategoryEvidence: categoryValidation.associations,
  };
}

export function mapProviderTransportV3ToCanonicalV2(value, options = {}) {
  const validation = validateProviderTransportToolArgumentsV3(value, options);
  if (!validation.ok) throw new TypeError(`Provider Transport Contract v3 rejected: ${validation.errors.join(",")}`);
  const output = mapExternalModelToolArgumentsToCanonicalV2(validation.mappedToolArguments, options);
  return { output, riskCategoryEvidence: validation.riskCategoryEvidence };
}

export function mapProviderTransportV4ToCanonicalV2(value, options = {}) {
  const validation = validateProviderTransportToolArgumentsV4(value, options);
  if (!validation.ok) throw new TypeError(`Provider Transport Contract v4 rejected: ${validation.errors.join(",")}`);
  const output = mapExternalModelToolArgumentsToCanonicalV2(validation.mappedToolArguments, options);
  return { output, riskCategoryEvidence: validation.riskCategoryEvidence };
}

export function mapProviderTransportV5ToCanonicalV2(value, options = {}) {
  const validation = validateProviderTransportToolArgumentsV5(value, options);
  if (!validation.ok) throw new TypeError(`Provider Transport Contract v5 rejected: ${validation.errors.join(",")}`);
  const output = mapExternalModelToolArgumentsToCanonicalV2(validation.mappedToolArguments, options);
  return { output, riskCategoryEvidence: validation.riskCategoryEvidence, factReferences: validation.factReferences };
}

export function mapProviderTransportV6ToCanonicalV2(value, options = {}) {
  const validation = validateProviderTransportToolArgumentsV6(value, options);
  if (!validation.ok) throw new TypeError(`Provider Transport Contract v6 rejected: ${validation.errors.join(",")}`);
  const output = mapExternalModelToolArgumentsToCanonicalV2(validation.mappedToolArguments, options);
  return {
    output,
    riskCategoryEvidence: validation.riskCategoryEvidence,
    factReferences: validation.factReferences,
    selectionReferences: validation.selectionReferences,
  };
}

export function mapProviderTransportV7ToCanonicalV2(value, options = {}) {
  const validation = validateProviderTransportToolArgumentsV7(value, options);
  if (!validation.ok) throw new TypeError(`Provider Transport Contract v7 rejected: ${validation.errors.join(",")}`);
  const output = mapExternalModelToolArgumentsToCanonicalV2(validation.mappedToolArguments, options);
  return {
    output,
    riskCategoryEvidence: validation.riskCategoryEvidence,
    factReferences: validation.factReferences,
    selectionReferences: validation.selectionReferences,
  };
}

export function validateScopedOutputSafetyV2(value) {
  const errors = [];
  const blockedPaths = [];
  const forbiddenKeys = new Set([
    "customername", "contactname", "email", "phone", "guid", "exactrevenue", "exactgp", "exactamount",
    "rawtimeline", "rawopportunityclose", "contracttext", "scenarioid", "goldenmetadata", "expectedanswer", "rawcrm",
    "healthscore", "healthgrade", "healthdimensions", "dimensions",
  ]);
  const forbiddenLabel = /raw_timeline|exact_amount|customer_identity|\bguid\b/i;
  const guid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const exactAmount = /(?:CNY|RMB|USD|JPY|EUR|GBP|\$|¥|￥)\s*\d[\d,.]*/i;
  const crmWriteClaim = /\b(?:wrote|written|updated|created|closed|posted)\s+(?:to\s+)?(?:the\s+)?CRM\b|CRM\s+writeback\s+(?:completed|performed)/i;

  function walk(node, path) {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        const childPath = `${path}.${key}`;
        if (forbiddenKeys.has(key.toLowerCase())) {
          errors.push(`forbidden_key:${childPath}`);
          blockedPaths.push(childPath);
        }
        walk(child, childPath);
      }
      return;
    }
    if (typeof node !== "string") return;
    if (isApprovedCodePath(path, node)) return;
    const reason = forbiddenLabel.test(node)
      ? "forbidden_label"
      : guid.test(node)
        ? "guid"
        : email.test(node)
          ? "identity"
          : exactAmount.test(node)
            ? "exact_amount"
            : crmWriteClaim.test(node)
              ? "crm_write_claim"
              : "";
    if (reason) {
      errors.push(`${reason}:${path}`);
      blockedPaths.push(path);
    }
  }

  walk(value, "$" );
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    blockedPaths: [...new Set(blockedPaths)],
    businessForbiddenLabelCount: [...new Set(errors)].filter((error) => error.startsWith("forbidden_label:")).length,
  };
}

export function renderLimitationCodesZh(limitations) {
  const codes = Array.isArray(limitations?.codes) ? limitations.codes : [];
  return codes.flatMap((code) => Object.hasOwn(LIMITATION_CODE_LABELS_ZH, code) ? [LIMITATION_CODE_LABELS_ZH[code]] : []);
}

export function renderSafetyPolicyCodesZh(policyCodes) {
  return (Array.isArray(policyCodes) ? policyCodes : []).flatMap((code) => Object.hasOwn(SAFETY_POLICY_CODE_LABELS_ZH, code) ? [SAFETY_POLICY_CODE_LABELS_ZH[code]] : []);
}

function validateAgainstContract(value, schema, { evidenceTokens = [], actionStatusKey }) {
  const errors = [];
  validateNode(value, schema, "$", errors);
  if (!value || typeof value !== "object" || Array.isArray(value)) errors.push("output_not_object");
  for (const key of ["facts", "inferences", "evidence", "recommendedActions"]) {
    if (!Array.isArray(value?.[key]) || value[key].length < collectionMinimum(key)) errors.push(`${key}_required`);
  }
  if (!Array.isArray(value?.limitations?.codes) || value.limitations.codes.length < collectionMinimum("limitations.codes")) errors.push("limitations_codes_required");
  const hasOther = value?.limitations?.codes?.includes("OTHER_APPROVED_LIMITATION") === true;
  const hasOtherDetail = Object.hasOwn(value?.limitations || {}, "otherCodeDetail");
  if (hasOther !== hasOtherDetail) errors.push("limitations_other_detail_contract");
  if (hasOtherDetail && !nonEmpty(value.limitations.otherCodeDetail)) errors.push("limitations_other_detail_empty");
  const allowedEvidence = new Set(evidenceTokens);
  const factLabels = new Set();
  for (const fact of value?.facts || []) {
    if (!nonEmpty(fact?.label) || !nonEmpty(fact?.value) || !allowedEvidence.has(fact?.evidenceToken)) errors.push("fact_evidence_invalid");
    if (nonEmpty(fact?.label)) factLabels.add(fact.label);
  }
  for (const evidence of value?.evidence || []) if (!nonEmpty(evidence?.value) || !allowedEvidence.has(evidence?.evidenceToken)) errors.push("evidence_reference_invalid");
  for (const inference of value?.inferences || []) {
    if (!nonEmpty(inference?.inference) || !Array.isArray(inference?.evidenceTokens) || inference.evidenceTokens.length < evidenceReferenceMinimum("inference") || inference.evidenceTokens.some((token) => !allowedEvidence.has(token))) errors.push("inference_evidence_invalid");
  }
  for (const action of value?.recommendedActions || []) {
    const basisReady = [...allowedEvidence, ...factLabels].some((reference) => nonEmpty(reference) && action?.basis?.includes(reference));
    if (!nonEmpty(action?.action) || !nonEmpty(action?.ownerRole) || !nonEmpty(action?.dueWindow) || !basisReady || action?.[actionStatusKey] !== "Draft only") errors.push("action_contract_invalid");
  }
  if (value?.safety?.identityMasked !== true || value?.safety?.exactAmountWithheld !== true || value?.safety?.rawTimelineWithheld !== true || value?.safety?.crmWritebackPerformed !== false) errors.push("safety_flags_invalid");
  const requiredPolicyCodes = ["SAFE_CONTEXT_ONLY", "NO_RAW_CRM", "NO_IDENTITY", "NO_EXACT_AMOUNT", "NO_RAW_TIMELINE", "NO_CRM_WRITEBACK"];
  if (!Array.isArray(value?.safety?.policyCodes) || requiredPolicyCodes.some((code) => !value.safety.policyCodes.includes(code))) errors.push("safety_policy_codes_incomplete");
  const scopedSafety = validateScopedOutputSafetyV2(value);
  if (!scopedSafety.ok) errors.push(...scopedSafety.errors.map((error) => `safety:${error}`));
  return { ok: errors.length === 0, errors: [...new Set(errors)], scopedSafety };
}

function isApprovedCodePath(path, value) {
  if (/^\$\.limitations\.codes\[\d+\]$/.test(path)) return LIMITATION_CODES.includes(value);
  if (/^\$\.safety\.policyCodes\[\d+\]$/.test(path)) return SAFETY_POLICY_CODES.includes(value);
  return false;
}

function mapTransportActionsToV2ToolArguments(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return {
    ...value,
    recommendedActions: Array.isArray(value.recommendedActions)
      ? value.recommendedActions.map(({ evidenceTokens, basis, ...action }) => ({
        ...action,
        basis: formatStructuredBasis(basis, evidenceTokens),
      }))
      : value.recommendedActions,
  };
}

function mapTransportV2ToV2ToolArguments(value) {
  const mapped = mapTransportActionsToV2ToolArguments(value);
  if (!mapped || typeof mapped !== "object" || Array.isArray(mapped)) return mapped;
  return {
    ...mapped,
    riskCategories: Array.isArray(value.riskCategories) ? value.riskCategories.map((item) => item.code) : value.riskCategories,
  };
}

function mapTransportV3ToV2ToolArguments(value) {
  const mapped = mapTransportV2ToV2ToolArguments(value);
  if (!mapped || typeof mapped !== "object" || Array.isArray(mapped)) return mapped;
  const safety = Object.fromEntries(Object.entries(value?.safety || {}).filter(([key]) => key !== "policyAssertions"));
  return {
    ...mapped,
    safety: {
      ...safety,
      policyCodes: [...SAFETY_POLICY_CODES],
    },
  };
}

function validateStructuredActionEvidence(value, evidenceTokens) {
  const errors = [];
  const allowedEvidence = new Set(evidenceTokens);
  for (const action of value?.recommendedActions || []) {
    if (!Array.isArray(action?.evidenceTokens) || action.evidenceTokens.length === 0) {
      errors.push("action_evidence_required");
      continue;
    }
    if (new Set(action.evidenceTokens).size !== action.evidenceTokens.length) errors.push("action_evidence_duplicate");
    if (action.evidenceTokens.some((token) => !allowedEvidence.has(token))) errors.push("action_evidence_invalid");
  }
  return { ready: errors.length === 0, errors: [...new Set(errors)] };
}

function failedFactReferenceValidation(value, errors) {
  return {
    ok: false,
    errors: [...new Set(errors)],
    schemaReady: false,
    schemaErrors: [...new Set(errors)],
    actionEvidence: { ready: false, errors: ["not_run"] },
    categoryEvidence: { ready: false, errors: ["not_run"], associations: [] },
    canonicalContract: { ok: false, errors: ["not_run"] },
    mappedToolArguments: value,
    riskCategoryEvidence: [],
    factCatalog: { ready: false, errors: [...new Set(errors)] },
    factReferences: { ready: false, errors: [...new Set(errors)], facts: [] },
  };
}

function failedSelectionReferenceValidation(value, errors, details = {}) {
  const structuralSchemaReady = Array.isArray(details.schemaErrors)
    ? details.schemaErrors.length === 0
    : false;
  return {
    ok: false,
    errors: [...new Set(errors)],
    schemaReady: structuralSchemaReady,
    schemaErrors: [...new Set(details.schemaErrors || errors)],
    schemaDiagnostics: details.schemaDiagnostics || { ok: false, errors: [] },
    actionEvidence: { ready: false, errors: ["not_run"] },
    categoryEvidence: details.categoryValidation || { ready: false, errors: ["not_run"], associations: [] },
    canonicalContract: { ok: false, errors: ["not_run"] },
    mappedToolArguments: value,
    riskCategoryEvidence: [],
    factCatalog: details.factCatalogValidation || { ready: false, errors: ["not_run"] },
    factReferences: details.factReferences || { ready: false, errors: ["not_run"], facts: [] },
    selectionCatalog: details.selectionCatalogValidation || { ready: false, errors: ["not_run"] },
    selectionReferences: details.selectionReferences || { ready: false, errors: ["not_run"], selectedEvidenceTokens: [] },
  };
}

function formatStructuredBasis(basis, evidenceTokens) {
  const references = Array.isArray(evidenceTokens) ? evidenceTokens.join(",") : "";
  return `[${references}] ${typeof basis === "string" ? basis : ""}`.trim();
}

function validateNode(value, schema, path, errors) {
  if (Array.isArray(schema?.anyOf)) {
    const branchErrors = schema.anyOf.map((branch) => { const result = []; validateNode(value, branch, path, result); return result; });
    if (!branchErrors.some((branch) => branch.length === 0)) errors.push(`${path}:anyOf`);
    return;
  }
  if (schema?.enum && !schema.enum.some((item) => Object.is(item, value))) errors.push(`${path}:enum`);
  if (schema?.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) { errors.push(`${path}:object`); return; }
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) errors.push(`${path}:missing:${key}`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties || {}, key)) errors.push(`${path}:extra:${key}`);
      else validateNode(value[key], schema.properties[key], `${path}.${key}`, errors);
    }
  } else if (schema?.type === "array") {
    if (!Array.isArray(value)) { errors.push(`${path}:array`); return; }
    value.forEach((item, index) => validateNode(item, schema.items, `${path}[${index}]`, errors));
  } else if (schema?.type === "string") {
    if (typeof value !== "string") errors.push(`${path}:string`);
    else if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${path}:pattern`);
  }
  else if (schema?.type === "boolean" && typeof value !== "boolean") errors.push(`${path}:boolean`);
}

function nonEmpty(value) { return typeof value === "string" && value.trim().length > 0; }

function normalizeProviderV7Options(options) {
  const evidenceTokens = options?.evidenceTokens || [];
  const evidenceTypeByToken = options?.evidenceTypeByToken || {};
  const factCatalog = options?.factCatalog || [];
  const selectionCatalog = options?.selectionCatalog || buildProviderSelectionCatalog({ evidenceTokens, evidenceTypeByToken });
  const normalized = { ...options, evidenceTokens, evidenceTypeByToken, factCatalog, selectionCatalog };
  if (!validateSafeFactCatalog(factCatalog, { evidenceTokens }).ready) throw new TypeError("Safe Fact Catalog is invalid");
  if (!validateProviderSelectionCatalog(selectionCatalog, { evidenceTokens }).ready) throw new TypeError("Provider Selection Catalog is invalid");
  return normalized;
}

function requiredDefinition(definitions, code) {
  const definition = definitions.get(code);
  if (!definition) throw new TypeError("Unknown provider selection code");
  return definition;
}
