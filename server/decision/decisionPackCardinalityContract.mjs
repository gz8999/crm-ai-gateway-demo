import { createHash } from "node:crypto";

export const DECISION_PACK_CARDINALITY_CONTRACT_VERSION = "Decision Pack Cardinality Contract v1";

export const DECISION_PACK_CARDINALITY_CONTRACT = deepFreeze({
  version: DECISION_PACK_CARDINALITY_CONTRACT_VERSION,
  representation: {
    providerCollections: "required_slots",
    slotKeyPattern: "itemNN",
    rationale: "DeepSeek strict Tool Schema does not support minItems or maxItems",
  },
  collections: {
    facts: { minItems: 1, maxItems: "fact_catalog_size" },
    inferences: { minItems: 1, maxItems: 3 },
    evidence: { minItems: 1, maxItems: "selected_unique_evidence_size" },
    recommendedActions: { minItems: 1, maxItems: 3 },
    riskCategories: { minItems: 1, maxItems: "risk_catalog_size" },
    "limitations.codes": { minItems: 1, maxItems: "approved_limitation_code_count" },
  },
  evidenceReferences: {
    fact: { minItems: 1, maxItems: 1, source: "safe_fact_catalog" },
    inference: { minItems: 1, maxItems: "compatible_evidence_count" },
    action: { minItems: 1, maxItems: "compatible_evidence_count" },
    riskCategory: { minItems: 1, maxItems: "compatible_evidence_count" },
  },
});

export const DECISION_PACK_CARDINALITY_CONTRACT_HASH = createHash("sha256")
  .update(canonicalJson(DECISION_PACK_CARDINALITY_CONTRACT))
  .digest("hex");

export function collectionCardinality(path, { maximum } = {}) {
  const rule = DECISION_PACK_CARDINALITY_CONTRACT.collections[path];
  if (!rule) throw new TypeError(`Unknown Decision Pack collection: ${path}`);
  return resolveRule(rule, maximum);
}

export function collectionMinimum(path) {
  const rule = DECISION_PACK_CARDINALITY_CONTRACT.collections[path];
  if (!rule) throw new TypeError(`Unknown Decision Pack collection: ${path}`);
  return rule.minItems;
}

export function evidenceReferenceCardinality(kind, { maximum } = {}) {
  const rule = DECISION_PACK_CARDINALITY_CONTRACT.evidenceReferences[kind];
  if (!rule) throw new TypeError(`Unknown Decision Pack evidence reference: ${kind}`);
  return resolveRule(rule, maximum);
}

export function evidenceReferenceMinimum(kind) {
  const rule = DECISION_PACK_CARDINALITY_CONTRACT.evidenceReferences[kind];
  if (!rule) throw new TypeError(`Unknown Decision Pack evidence reference: ${kind}`);
  return rule.minItems;
}

export function validateCollectionCardinality(path, value, options = {}) {
  const { minItems, maxItems } = collectionCardinality(path, options);
  return validateArrayBounds(value, minItems, maxItems);
}

export function validateEvidenceReferenceCardinality(kind, value, options = {}) {
  const { minItems, maxItems } = evidenceReferenceCardinality(kind, options);
  return validateArrayBounds(value, minItems, maxItems);
}

export function requiredSlotKey(index) {
  if (!Number.isInteger(index) || index < 0 || index > 98) throw new RangeError("Slot index must be between 0 and 98");
  return `item${String(index + 1).padStart(2, "0")}`;
}

export function buildRequiredSlotSchema(itemSchema, { minItems, maxItems }) {
  assertBounds(minItems, maxItems);
  const branches = [];
  for (let count = minItems; count <= maxItems; count += 1) {
    const properties = Object.fromEntries(Array.from({ length: count }, (_, index) => [requiredSlotKey(index), structuredClone(itemSchema)]));
    branches.push({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
  }
  return branches.length === 1 ? branches[0] : { anyOf: branches };
}

export function encodeRequiredSlots(items, { minItems, maxItems }) {
  assertBounds(minItems, maxItems);
  if (!Array.isArray(items) || items.length < minItems || items.length > maxItems) throw new TypeError("Collection cardinality rejected");
  return Object.fromEntries(items.map((item, index) => [requiredSlotKey(index), structuredClone(item)]));
}

export function decodeRequiredSlots(value, { minItems, maxItems }) {
  assertBounds(minItems, maxItems);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Required slot object rejected");
  const keys = Object.keys(value).sort();
  if (keys.length < minItems || keys.length > maxItems) throw new TypeError("Required slot cardinality rejected");
  const expected = Array.from({ length: keys.length }, (_, index) => requiredSlotKey(index));
  if (keys.some((key, index) => key !== expected[index])) throw new TypeError("Required slot sequence rejected");
  return expected.map((key) => structuredClone(value[key]));
}

function validateArrayBounds(value, minItems, maxItems) {
  if (!Array.isArray(value)) return { ready: false, minItems, maxItems, actualItems: null, reason: "array_required" };
  if (value.length < minItems) return { ready: false, minItems, maxItems, actualItems: value.length, reason: "min_items" };
  if (value.length > maxItems) return { ready: false, minItems, maxItems, actualItems: value.length, reason: "max_items" };
  return { ready: true, minItems, maxItems, actualItems: value.length, reason: null };
}

function resolveRule(rule, maximum) {
  const maxItems = Number.isInteger(rule.maxItems) ? rule.maxItems : maximum;
  if (!Number.isInteger(maxItems)) throw new TypeError(`A resolved maximum is required for ${rule.maxItems}`);
  assertBounds(rule.minItems, maxItems);
  return { minItems: rule.minItems, maxItems, maximumSource: rule.maxItems };
}

function assertBounds(minItems, maxItems) {
  if (!Number.isInteger(minItems) || !Number.isInteger(maxItems) || minItems < 0 || maxItems < minItems || maxItems > 99) {
    throw new RangeError("Invalid Decision Pack cardinality bounds");
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
