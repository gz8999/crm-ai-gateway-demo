import { validateCollectionCardinality } from "./decisionPackCardinalityContract.mjs";

export const SAFE_FACT_CATALOG_VERSION = "Safe Fact Catalog v1";

const SAFE_TEXT_PATTERN = /^[^"\\\u0000-\u001F]{1,240}$/u;
const CODE_ONLY_PATTERN = /^[A-Z0-9_:-]+$/u;

const DISPLAY_VALUES = Object.freeze({
  Active: "进行中",
  Won: "已赢单",
  Lost: "已丢单",
  Qualification: "授予资格",
  MEDIUM_BAND: "中等区间",
  POSITIVE_BAND: "正向区间",
  SYNTHETIC_REVIEW_BAND: "合成复核区间",
  SYNTHETIC_REVIEW_WINDOW: "合成复核时间窗口",
  partial: "部分覆盖",
  "synthetic-complete": "合成数据完整",
  "synthetic-review": "合成复核空间",
  "synthetic-stable": "合成稳定趋势",
  "synthetic-developing": "合成发展中关系",
});

const FACT_SPECS = Object.freeze([
  spec("FACT-OPPORTUNITY-STATE", "safeContext", "state", "商机状态", ["PIPELINE_PROGRESS"]),
  spec("FACT-PIPELINE-STAGE", "safeContext", "stage", "流程阶段", ["PIPELINE_PROGRESS"]),
  spec("FACT-AMOUNT-BAND", "safeContext", "amountBand", "金额区间", ["FINANCIAL_BAND"]),
  spec("FACT-MARGIN-BAND", "safeContext", "marginBand", "毛利区间", ["FINANCIAL_BAND"]),
  spec("FACT-BUDGET-VARIANCE", "safeContext", "budgetVarianceBand", "预算偏差区间", ["FINANCIAL_VARIANCE"]),
  spec("FACT-RELATIVE-DATE", "safeContext", "relativeDate", "相对时间窗口", ["RELATIVE_DATE"]),
  spec("FACT-TIMELINE-SUMMARY", "safeContext", "timelineSummary", "互动摘要", ["ENGAGEMENT"]),
  spec("FACT-INTERACTION-SIGNAL", "safeContext", "interactionSignal", "互动信号", ["ENGAGEMENT", "DECISION_READINESS"]),
  spec("FACT-COVERAGE-STATUS", "safeContext", "coverageStatus", "服务覆盖状态", ["SERVICE_COVERAGE"]),
  spec("FACT-DATA-QUALITY", "safeContext", "dataQualitySignal", "数据质量", ["DATA_QUALITY"]),
  spec("FACT-ACCOUNT-COVERAGE", "accountAggregate", "serviceCoverageBand", "客户服务覆盖", ["SERVICE_COVERAGE"]),
  spec("FACT-WHITESPACE", "accountAggregate", "whitespaceCategory", "交叉销售空间", ["ACCOUNT_GROWTH"]),
  spec("FACT-OPPORTUNITY-TREND", "accountAggregate", "opportunityTrend", "商机趋势", ["PIPELINE_PROGRESS"]),
  spec("FACT-RELATIONSHIP-MATURITY", "accountAggregate", "relationshipMaturity", "客户关系成熟度", ["ENGAGEMENT"]),
]);

export function buildSafeFactCatalog({ safeContext = {}, accountAggregate = {}, evidenceTokens = [], evidenceTypeByToken = {} } = {}) {
  const sources = { safeContext, accountAggregate };
  const allowedEvidence = new Set(evidenceTokens);
  const entries = FACT_SPECS.flatMap((definition) => {
    const sourceValue = sources[definition.source]?.[definition.key];
    if (typeof sourceValue !== "string" || sourceValue.trim() === "") return [];
    const evidenceToken = selectEvidenceToken(definition.evidenceTypes, evidenceTypeByToken, allowedEvidence);
    if (!evidenceToken) return [];
    return [{
      factCode: definition.factCode,
      label: definition.label,
      value: renderFactValue(definition.label, sourceValue),
      evidenceToken,
    }];
  });
  const validation = validateSafeFactCatalog(entries, { evidenceTokens });
  if (!validation.ready) throw new TypeError(`Safe Fact Catalog rejected: ${validation.errors.join(",")}`);
  return entries;
}

export function validateSafeFactCatalog(catalog, { evidenceTokens = [] } = {}) {
  const errors = [];
  const allowedEvidence = new Set(evidenceTokens);
  if (!Array.isArray(catalog) || catalog.length === 0) return { ready: false, errors: ["fact_catalog_required"], count: 0 };
  const codes = [];
  for (const item of catalog) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push("fact_catalog_item_invalid");
      continue;
    }
    const keys = Object.keys(item).sort();
    if (keys.join(",") !== "evidenceToken,factCode,label,value") errors.push("fact_catalog_item_shape_invalid");
    if (typeof item.factCode !== "string" || !/^FACT-[A-Z0-9-]+$/u.test(item.factCode)) errors.push("fact_code_invalid");
    else codes.push(item.factCode);
    if (!isReadableBusinessText(item.label)) errors.push("fact_label_unreadable");
    if (!isReadableBusinessText(item.value)) errors.push("fact_value_unreadable");
    if (!allowedEvidence.has(item.evidenceToken)) errors.push("fact_evidence_unknown");
  }
  if (codes.length !== new Set(codes).size) errors.push("fact_code_duplicate");
  return { ready: errors.length === 0, errors: [...new Set(errors)], count: catalog.length };
}

export function validateSafeFactReferences(references, catalog) {
  const errors = [];
  const byCode = new Map((Array.isArray(catalog) ? catalog : []).map((item) => [item.factCode, item]));
  const cardinality = validateCollectionCardinality("facts", references, { maximum: byCode.size });
  if (cardinality.reason === "array_required" || cardinality.reason === "min_items") return { ready: false, errors: ["fact_reference_required"], facts: [] };
  if (cardinality.reason === "max_items") errors.push("fact_reference_limit");
  const codes = [];
  for (const item of references) {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).length !== 1 || typeof item.factCode !== "string") {
      errors.push("fact_reference_shape_invalid");
      continue;
    }
    codes.push(item.factCode);
    if (!byCode.has(item.factCode)) errors.push("fact_reference_unknown");
  }
  if (codes.length !== new Set(codes).size) errors.push("fact_reference_duplicate");
  const facts = errors.length === 0
    ? [...codes].sort().map((code) => {
      const { label, value, evidenceToken } = byCode.get(code);
      return { label, value, evidenceToken };
    })
    : [];
  return { ready: errors.length === 0, errors: [...new Set(errors)], facts };
}

export function isReadableBusinessText(value) {
  if (typeof value !== "string" || !SAFE_TEXT_PATTERN.test(value)) return false;
  const text = value.trim();
  if (!text || CODE_ONLY_PATTERN.test(text) || /^(?:N\/?A|NONE|UNKNOWN|NULL|TBD|待定|未知|无)$/iu.test(text)) return false;
  if (/(?:…|\.{3})\s*$/u.test(text)) return false;
  return (text.match(/[\p{L}\p{N}]/gu) || []).length >= 2;
}

export function validateCanonicalBusinessReadability(value) {
  const groups = {
    facts: (value?.facts || []).flatMap((item) => [item?.label, item?.value]),
    inferences: (value?.inferences || []).map((item) => item?.inference),
    evidence: (value?.evidence || []).map((item) => item?.value),
    confidence: [value?.confidence?.reason],
    actions: (value?.recommendedActions || []).flatMap((item) => [item?.action, item?.basis]),
  };
  const strings = Object.values(groups).flat();
  const emptyTextCount = strings.filter((item) => typeof item !== "string" || item.trim() === "").length;
  const overlongTextCount = strings.filter((item) => typeof item === "string" && [...item].length > 240).length;
  const forbiddenCharacterCount = strings.filter((item) => typeof item === "string" && /["\\\u0000-\u001f]/u.test(item)).length;
  const truncatedTextCount = strings.filter((item) => typeof item === "string" && ([...item].length === 240 || /(?:…|\.{3})\s*$/u.test(item))).length;
  const meaninglessTextCount = strings.filter((item) => !isReadableBusinessText(item)).length;
  const factReadableCount = (value?.facts || []).filter((item) => isReadableBusinessText(item?.label) && isReadableBusinessText(item?.value)).length;
  const inferenceReadableCount = (value?.inferences || []).filter((item) => isReadableBusinessText(item?.inference)).length;
  const actionReadableCount = (value?.recommendedActions || []).filter((item) => isReadableBusinessText(item?.action) && isReadableBusinessText(item?.basis)).length;
  const meaningLossCount = meaninglessTextCount + truncatedTextCount;
  return {
    ready: emptyTextCount === 0
      && overlongTextCount === 0
      && forbiddenCharacterCount === 0
      && truncatedTextCount === 0
      && meaninglessTextCount === 0
      && factReadableCount === (value?.facts || []).length
      && inferenceReadableCount === (value?.inferences || []).length
      && actionReadableCount === (value?.recommendedActions || []).length,
    totalTextCount: strings.length,
    emptyTextCount,
    overlongTextCount,
    forbiddenCharacterCount,
    truncatedTextCount,
    meaninglessTextCount,
    meaningLossCount,
    factCount: (value?.facts || []).length,
    factReadableCount,
    inferenceCount: (value?.inferences || []).length,
    inferenceReadableCount,
    actionCount: (value?.recommendedActions || []).length,
    actionReadableCount,
  };
}

function spec(factCode, source, key, label, evidenceTypes) {
  return Object.freeze({ factCode, source, key, label, evidenceTypes });
}

function selectEvidenceToken(requiredTypes, evidenceTypeByToken, allowedEvidence) {
  return Object.keys(evidenceTypeByToken)
    .filter((token) => allowedEvidence.has(token))
    .sort()
    .find((token) => (evidenceTypeByToken[token] || []).some((type) => requiredTypes.includes(type))) || "";
}

function renderFactValue(label, sourceValue) {
  const value = sourceValue.trim();
  const display = DISPLAY_VALUES[value] || humanizeCode(value);
  const separator = /^[\x00-\x7F]/u.test(display) ? " " : "";
  return `${label}为${separator}${display}`;
}

function humanizeCode(value) {
  if (!CODE_ONLY_PATTERN.test(value) && !/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/u.test(value)) return value;
  return value.replace(/[_-]+/g, " ").toLowerCase();
}
