import { isReadableBusinessText } from "./safeFactCatalog.mjs";
import {
  validateCollectionCardinality,
  validateEvidenceReferenceCardinality,
} from "./decisionPackCardinalityContract.mjs";

export const PROVIDER_SELECTION_CATALOG_VERSION = "Provider Selection Catalog v1";

const INFERENCE_DEFINITIONS = Object.freeze([
  definition("INF-PIPELINE-STALL", "推进状态存在停滞信号，需要人工核实阻塞原因", ["PIPELINE_PROGRESS", "RELATIVE_DATE"]),
  definition("INF-FINANCIAL-VARIANCE", "预算与实绩信号存在偏差，需要人工复核经营影响", ["FINANCIAL_VARIANCE", "FINANCIAL_BAND"]),
  definition("INF-DECISION-READINESS", "客户决策准备度不足，需要补充关键确认", ["DECISION_READINESS", "ENGAGEMENT"]),
  definition("INF-COVERAGE-REVIEW", "当前服务覆盖存在待核实的增长或缺口信号", ["SERVICE_COVERAGE", "ACCOUNT_GROWTH"]),
  definition("INF-DATA-QUALITY", "当前数据质量可能影响判断可靠性，需要先核实事实", ["DATA_QUALITY"]),
]);

const ACTION_DEFINITIONS = Object.freeze([
  actionDefinition("ACT-CONFIRM-NEXT-STEP", "确认下一步推进条件", "依据已提供的推进证据，需由人工确认责任与执行窗口", ["PIPELINE_PROGRESS", "RELATIVE_DATE"]),
  actionDefinition("ACT-REVIEW-VARIANCE", "复核预算与实绩偏差", "依据已提供的财务区间证据，需由人工确认偏差原因", ["FINANCIAL_VARIANCE", "FINANCIAL_BAND"]),
  actionDefinition("ACT-CONFIRM-DECISION", "确认关键决策条件", "依据已提供的互动与决策准备证据，需由人工补充确认", ["DECISION_READINESS", "ENGAGEMENT"]),
  actionDefinition("ACT-REVIEW-COVERAGE", "复核服务覆盖与增长空间", "依据已提供的服务覆盖证据，需由人工确认适配范围", ["SERVICE_COVERAGE", "ACCOUNT_GROWTH"]),
  actionDefinition("ACT-RECONCILE-DATA", "核对关键数据一致性", "依据已提供的数据质量证据，需由人工先完成事实核对", ["DATA_QUALITY"]),
]);

const CONFIDENCE_DEFINITIONS = Object.freeze([
  Object.freeze({ code: "CONF-HIGH-CONSISTENT", level: "High", reason: "多项安全证据相互一致，支持较高置信度" }),
  Object.freeze({ code: "CONF-MEDIUM-PARTIAL", level: "Medium", reason: "当前安全证据支持判断，但仍有事项需要人工核实" }),
  Object.freeze({ code: "CONF-LOW-LIMITED", level: "Low", reason: "当前安全证据有限或存在矛盾，结论置信度较低" }),
]);

const EVIDENCE_TYPE_LABELS_ZH = Object.freeze({
  ACCOUNT_GROWTH: "客户增长",
  DATA_QUALITY: "数据质量",
  DECISION_READINESS: "决策准备",
  ENGAGEMENT: "客户互动",
  FINANCIAL_BAND: "财务区间",
  FINANCIAL_VARIANCE: "财务偏差",
  PIPELINE_PROGRESS: "推进状态",
  PORTFOLIO_SCOPE: "组合范围",
  RELATIVE_DATE: "相对时间",
  ROUTE_CONSISTENCY: "路线一致性",
  SERVICE_COVERAGE: "服务覆盖",
});

export function buildProviderSelectionCatalog({ evidenceTokens = [], evidenceTypeByToken = {} } = {}) {
  const allowedEvidence = [...new Set(evidenceTokens)].sort();
  const inferences = bindDefinitions(INFERENCE_DEFINITIONS, allowedEvidence, evidenceTypeByToken);
  const actions = bindDefinitions(ACTION_DEFINITIONS, allowedEvidence, evidenceTypeByToken);
  const evidence = allowedEvidence.map((evidenceToken) => ({
    evidenceToken,
    value: renderEvidenceValue(evidenceTypeByToken[evidenceToken]),
  }));
  const catalog = {
    version: PROVIDER_SELECTION_CATALOG_VERSION,
    inferences,
    actions,
    confidence: CONFIDENCE_DEFINITIONS.map((item) => ({ ...item })),
    evidence,
  };
  const validation = validateProviderSelectionCatalog(catalog, { evidenceTokens: allowedEvidence });
  if (!validation.ready) throw new TypeError(`Provider Selection Catalog rejected: ${validation.errors.join(",")}`);
  return catalog;
}

export function validateProviderSelectionCatalog(catalog, { evidenceTokens = [] } = {}) {
  const errors = [];
  const allowedEvidence = new Set(evidenceTokens);
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) return { ready: false, errors: ["selection_catalog_required"] };
  if (catalog.version !== PROVIDER_SELECTION_CATALOG_VERSION) errors.push("selection_catalog_version_invalid");
  validateDefinitions(catalog.inferences, "inference", allowedEvidence, errors, ["code", "text", "compatibleEvidenceTokens"]);
  validateDefinitions(catalog.actions, "action", allowedEvidence, errors, ["action", "basis", "code", "compatibleEvidenceTokens"]);
  validateConfidence(catalog.confidence, errors);
  validateEvidence(catalog.evidence, allowedEvidence, errors);
  return {
    ready: errors.length === 0,
    errors: [...new Set(errors)],
    counts: {
      inferences: Array.isArray(catalog.inferences) ? catalog.inferences.length : 0,
      actions: Array.isArray(catalog.actions) ? catalog.actions.length : 0,
      confidence: Array.isArray(catalog.confidence) ? catalog.confidence.length : 0,
      evidence: Array.isArray(catalog.evidence) ? catalog.evidence.length : 0,
    },
  };
}

export function validateProviderSelectionReferences(value, catalog) {
  const errors = [];
  const inferenceByCode = new Map(catalog.inferences.map((item) => [item.code, item]));
  const actionByCode = new Map(catalog.actions.map((item) => [item.code, item]));
  const confidenceByCode = new Map(catalog.confidence.map((item) => [item.code, item]));
  const evidenceByToken = new Map(catalog.evidence.map((item) => [item.evidenceToken, item]));

  validateSelectedItems(value?.inferences, inferenceByCode, "inference", "inferences", errors);
  validateSelectedItems(value?.recommendedActions, actionByCode, "action", "recommendedActions", errors);
  const confidence = confidenceByCode.get(value?.confidence?.reasonCode);
  if (!confidence || confidence.level !== value?.confidence?.level) errors.push("confidence_reference_invalid");

  const selectedEvidence = new Set();
  for (const item of [...(value?.inferences || []), ...(value?.recommendedActions || []), ...(value?.riskCategories || [])]) {
    for (const token of item?.evidenceTokens || []) selectedEvidence.add(token);
  }
  const selectedEvidenceCardinality = validateCollectionCardinality("evidence", [...selectedEvidence], { maximum: evidenceByToken.size });
  if (selectedEvidenceCardinality.reason === "min_items") errors.push("selected_evidence_required");
  if (selectedEvidenceCardinality.reason === "max_items") errors.push("selected_evidence_limit");
  if ([...selectedEvidence].some((token) => !evidenceByToken.has(token))) errors.push("selected_evidence_unknown");

  return {
    ready: errors.length === 0,
    errors: [...new Set(errors)],
    selectedEvidenceTokens: [...selectedEvidence].sort(),
  };
}

export function expandProviderSelections(value, catalog) {
  const inferenceByCode = new Map(catalog.inferences.map((item) => [item.code, item]));
  const actionByCode = new Map(catalog.actions.map((item) => [item.code, item]));
  const confidenceByCode = new Map(catalog.confidence.map((item) => [item.code, item]));
  const evidenceByToken = new Map(catalog.evidence.map((item) => [item.evidenceToken, item]));
  const references = validateProviderSelectionReferences(value, catalog);
  if (!references.ready) throw new TypeError(`Provider selection references rejected: ${references.errors.join(",")}`);
  return {
    inferences: [...value.inferences]
      .sort((left, right) => left.inferenceCode.localeCompare(right.inferenceCode))
      .map((item) => ({ inference: inferenceByCode.get(item.inferenceCode).text, evidenceTokens: [...item.evidenceTokens].sort() })),
    evidence: references.selectedEvidenceTokens.map((evidenceToken) => ({ ...evidenceByToken.get(evidenceToken) })),
    confidence: {
      level: value.confidence.level,
      reason: confidenceByCode.get(value.confidence.reasonCode).reason,
    },
    recommendedActions: [...value.recommendedActions]
      .sort((left, right) => left.actionCode.localeCompare(right.actionCode))
      .map((item) => {
        const definition = actionByCode.get(item.actionCode);
        return {
          action: definition.action,
          ownerRole: "待人工指定",
          dueWindow: "待人工确定",
          basis: definition.basis,
          draftStatus: "Draft only",
          evidenceTokens: [...item.evidenceTokens].sort(),
        };
      }),
  };
}

function validateSelectedItems(items, definitions, prefix, collectionPath, errors) {
  const cardinality = validateCollectionCardinality(collectionPath, items, { maximum: definitions.size });
  if (cardinality.reason === "array_required" || cardinality.reason === "min_items") {
    errors.push(`${prefix}_selection_required`);
    return;
  }
  if (cardinality.reason === "max_items") errors.push(`${prefix}_selection_limit`);
  const codeKey = `${prefix}Code`;
  const codes = [];
  for (const item of items) {
    const definition = definitions.get(item?.[codeKey]);
    codes.push(item?.[codeKey]);
    if (!definition) {
      errors.push(`${prefix}_reference_unknown`);
      continue;
    }
    const evidenceCardinality = validateEvidenceReferenceCardinality(prefix, item.evidenceTokens, { maximum: definition.compatibleEvidenceTokens.length });
    if (evidenceCardinality.reason === "array_required" || evidenceCardinality.reason === "min_items") errors.push(`${prefix}_evidence_required`);
    else if (evidenceCardinality.reason === "max_items") errors.push(`${prefix}_evidence_limit`);
    else if (new Set(item.evidenceTokens).size !== item.evidenceTokens.length) errors.push(`${prefix}_evidence_duplicate`);
    else if (item.evidenceTokens.some((token) => !definition.compatibleEvidenceTokens.includes(token))) errors.push(`${prefix}_evidence_incompatible`);
  }
  if (codes.length !== new Set(codes).size) errors.push(`${prefix}_reference_duplicate`);
}

function validateDefinitions(items, prefix, allowedEvidence, errors, expectedKeys) {
  if (!Array.isArray(items) || items.length === 0) {
    errors.push(`${prefix}_catalog_required`);
    return;
  }
  const codes = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).sort().join(",") !== [...expectedKeys].sort().join(",")) {
      errors.push(`${prefix}_catalog_shape_invalid`);
      continue;
    }
    codes.push(item.code);
    if (!new RegExp(`^${prefix === "action" ? "ACT" : "INF"}-[A-Z0-9-]+$`, "u").test(item.code)) errors.push(`${prefix}_code_invalid`);
    for (const key of prefix === "action" ? ["action", "basis"] : ["text"]) if (!isReadableBusinessText(item[key])) errors.push(`${prefix}_${key}_unreadable`);
    if (!Array.isArray(item.compatibleEvidenceTokens) || item.compatibleEvidenceTokens.length === 0 || item.compatibleEvidenceTokens.some((token) => !allowedEvidence.has(token))) errors.push(`${prefix}_evidence_invalid`);
  }
  if (codes.length !== new Set(codes).size) errors.push(`${prefix}_code_duplicate`);
}

function validateConfidence(items, errors) {
  if (!Array.isArray(items) || items.length !== 3) {
    errors.push("confidence_catalog_invalid");
    return;
  }
  const levels = new Set();
  for (const item of items) {
    if (Object.keys(item).sort().join(",") !== "code,level,reason" || !/^CONF-[A-Z0-9-]+$/u.test(item.code) || !["High", "Medium", "Low"].includes(item.level) || !isReadableBusinessText(item.reason)) errors.push("confidence_catalog_item_invalid");
    levels.add(item.level);
  }
  if (levels.size !== 3) errors.push("confidence_level_coverage_invalid");
}

function validateEvidence(items, allowedEvidence, errors) {
  if (!Array.isArray(items) || items.length !== allowedEvidence.size) {
    errors.push("evidence_catalog_invalid");
    return;
  }
  const tokens = [];
  for (const item of items) {
    if (Object.keys(item).sort().join(",") !== "evidenceToken,value" || !allowedEvidence.has(item.evidenceToken) || !isReadableBusinessText(item.value)) errors.push("evidence_catalog_item_invalid");
    tokens.push(item.evidenceToken);
  }
  if (tokens.length !== new Set(tokens).size) errors.push("evidence_catalog_duplicate");
}

function bindDefinitions(definitions, evidenceTokens, evidenceTypeByToken) {
  return definitions.flatMap((item) => {
    const compatibleEvidenceTokens = evidenceTokens.filter((token) => (evidenceTypeByToken[token] || []).some((type) => item.evidenceTypes.includes(type)));
    if (compatibleEvidenceTokens.length === 0) return [];
    const { evidenceTypes, ...publicItem } = item;
    return [{ ...publicItem, compatibleEvidenceTokens }];
  });
}

function renderEvidenceValue(types) {
  const labels = [...new Set(Array.isArray(types) ? types : [])].sort().flatMap((type) => EVIDENCE_TYPE_LABELS_ZH[type] ? [EVIDENCE_TYPE_LABELS_ZH[type]] : []);
  if (labels.length === 0) throw new TypeError("Evidence type label is unavailable");
  return `已提供脱敏的${labels.join("、")}证据`;
}

function definition(code, text, evidenceTypes) {
  return Object.freeze({ code, text, evidenceTypes: Object.freeze(evidenceTypes) });
}

function actionDefinition(code, action, basis, evidenceTypes) {
  return Object.freeze({ code, action, basis, evidenceTypes: Object.freeze(evidenceTypes) });
}
