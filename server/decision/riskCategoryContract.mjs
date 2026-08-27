import riskCategoryCatalog from "../../docs/gateway/canonical-risk-category-catalog.json" with { type: "json" };
import {
  validateEvidenceReferenceCardinality,
} from "./decisionPackCardinalityContract.mjs";

export const CANONICAL_RISK_CATEGORY_CATALOG = Object.freeze(riskCategoryCatalog);
export const CANONICAL_RISK_CATEGORY_CODES = Object.freeze(riskCategoryCatalog.categories.map((category) => category.code));
export const CANONICAL_RISK_CATEGORY_BY_CODE = new Map(riskCategoryCatalog.categories.map((category) => [category.code, category]));
export const CANONICAL_EVIDENCE_TYPES = Object.freeze([...new Set(riskCategoryCatalog.categories.flatMap((category) => category.allowedEvidenceTypes))].sort());

export function validateRiskCategoryCatalog(catalog = CANONICAL_RISK_CATEGORY_CATALOG) {
  const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
  const codes = categories.map((category) => category?.code);
  const duplicateCodeCount = codes.length - new Set(codes).size;
  const unknownAliasCount = categories.reduce((count, category) => count + (Array.isArray(category?.aliases) ? category.aliases.length : 0), 0);
  const missingEvidenceTypeCount = categories.filter((category) => !Array.isArray(category?.allowedEvidenceTypes) || category.allowedEvidenceTypes.length === 0).length;
  const malformedCodeCount = codes.filter((code) => typeof code !== "string" || !/^[a-z]+(?:-[a-z]+)*$/.test(code)).length;
  return {
    ready: categories.length > 0 && duplicateCodeCount === 0 && unknownAliasCount === 0 && missingEvidenceTypeCount === 0 && malformedCodeCount === 0,
    version: catalog?.version || "",
    categoryCount: categories.length,
    duplicateCodeCount,
    unknownAliasCount,
    missingEvidenceTypeCount,
    malformedCodeCount,
  };
}

export function buildRiskCategoryEvidenceMatrix(catalog = CANONICAL_RISK_CATEGORY_CATALOG) {
  return {
    version: "Risk Category Evidence Matrix v1",
    catalogVersion: catalog.version,
    categories: catalog.categories.map(({ code, allowedEvidenceTypes }) => ({ code, allowedEvidenceTypes: [...allowedEvidenceTypes] })),
  };
}

export function buildEvidenceTypeIndex({ evidenceTokens = [], bindings = {} } = {}) {
  return Object.fromEntries(evidenceTokens.map((token) => [
    token,
    [...new Set(Array.isArray(bindings[token]) ? bindings[token] : [])].sort(),
  ]));
}

export function buildSafeEvidenceCatalog({ evidenceTokens = [], evidenceTypeByToken = {} } = {}) {
  const validation = validateEvidenceTypeIndex({ evidenceTokens, evidenceTypeByToken });
  if (!validation.ready) throw new TypeError("Evidence type index is incomplete");
  return evidenceTokens.map((evidenceToken) => ({
    evidenceToken,
    evidenceTypes: [...evidenceTypeByToken[evidenceToken]].sort(),
  }));
}

export function buildRequestScopedRiskCategoryCatalog({ evidenceTokens = [], evidenceTypeByToken = {} } = {}) {
  const evidenceCatalog = buildSafeEvidenceCatalog({ evidenceTokens, evidenceTypeByToken });
  return CANONICAL_RISK_CATEGORY_CATALOG.categories.flatMap((category) => {
    const allowedEvidenceTypes = new Set(category.allowedEvidenceTypes);
    const compatibleEvidenceTokens = evidenceCatalog
      .filter((entry) => entry.evidenceTypes.some((type) => allowedEvidenceTypes.has(type)))
      .map((entry) => entry.evidenceToken);
    return compatibleEvidenceTokens.length === 0 ? [] : [{
      code: category.code,
      compatibleEvidenceTokens,
    }];
  });
}

export function validateEvidenceTypeIndex({ evidenceTokens = [], evidenceTypeByToken = {} } = {}) {
  const allowedTypes = new Set(CANONICAL_EVIDENCE_TYPES);
  const tokenSet = new Set(evidenceTokens);
  const missingTokenCount = evidenceTokens.filter((token) => !Array.isArray(evidenceTypeByToken[token]) || evidenceTypeByToken[token].length === 0).length;
  const unknownTokenCount = Object.keys(evidenceTypeByToken).filter((token) => !tokenSet.has(token)).length;
  const unknownTypeCount = Object.values(evidenceTypeByToken).flat().filter((type) => !allowedTypes.has(type)).length;
  return {
    ready: missingTokenCount === 0 && unknownTokenCount === 0 && unknownTypeCount === 0,
    missingTokenCount,
    unknownTokenCount,
    unknownTypeCount,
  };
}

export function validateStructuredRiskCategoryEvidence(value, { evidenceTokens = [], evidenceTypeByToken = {} } = {}) {
  const errors = [];
  const allowedTokens = new Set(evidenceTokens);
  const associations = [];
  const evidenceTypeIndex = validateEvidenceTypeIndex({ evidenceTokens, evidenceTypeByToken });
  if (!evidenceTypeIndex.ready) errors.push("evidence_type_index_invalid");
  if (!Array.isArray(value?.riskCategories)) return { ready: false, errors: ["risk_categories_required"], associations };
  for (const item of value.riskCategories) {
    const code = item?.code;
    const category = CANONICAL_RISK_CATEGORY_BY_CODE.get(code);
    const tokens = Array.isArray(item?.evidenceTokens) ? item.evidenceTokens : [];
    if (!category) errors.push("risk_category_code_invalid");
    const referenceCardinality = allowedTokens.size > 0
      ? validateEvidenceReferenceCardinality("riskCategory", tokens, { maximum: allowedTokens.size })
      : { reason: "min_items" };
    if (referenceCardinality.reason === "array_required" || referenceCardinality.reason === "min_items") errors.push("risk_category_evidence_required");
    if (referenceCardinality.reason === "max_items") errors.push("risk_category_evidence_limit");
    if (new Set(tokens).size !== tokens.length) errors.push("risk_category_evidence_duplicate");
    if (tokens.some((token) => !allowedTokens.has(token))) errors.push("risk_category_evidence_unknown");
    if (category) {
      const allowedTypes = new Set(category.allowedEvidenceTypes);
      for (const token of tokens) {
        const tokenTypes = Array.isArray(evidenceTypeByToken[token]) ? evidenceTypeByToken[token] : [];
        if (!tokenTypes.some((type) => allowedTypes.has(type))) errors.push("risk_category_evidence_incompatible");
      }
      associations.push({ code, evidenceTokens: [...tokens] });
    }
  }
  return { ready: errors.length === 0, errors: [...new Set(errors)], associations };
}

export function validateCanonicalRiskCategoryCodes(codes) {
  if (!Array.isArray(codes)) return { ready: false, errors: ["risk_categories_required"] };
  const errors = codes.some((code) => !CANONICAL_RISK_CATEGORY_BY_CODE.has(code)) ? ["risk_category_code_invalid"] : [];
  return { ready: errors.length === 0, errors };
}
