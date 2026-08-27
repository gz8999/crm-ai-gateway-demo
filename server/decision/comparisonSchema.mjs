export const COMPARISON_PAGES = ["cockpit", "risk", "opportunity360", "action", "meeting", "portfolio"];
export const UNIFIED_OUTPUT_SCHEMA_VERSION = "unified-ai-output-v1";

export const unifiedOutputJsonSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "fact", "inference", "evidence", "confidence", "recommendedAction", "priority"],
  properties: {
    id: { type: "string", maxLength: 120 },
    title: { type: "string", maxLength: 200 },
    fact: { type: "array", minItems: 1, maxItems: 12, items: evidenceItemSchema() },
    inference: { type: "string", minLength: 1, maxLength: 2000 },
    evidence: { type: "array", minItems: 1, maxItems: 12, items: evidenceItemSchema() },
    confidence: {
      type: "object",
      additionalProperties: false,
      required: ["level", "reason"],
      properties: { level: { enum: ["High", "Medium", "Low"] }, reason: { type: "string", maxLength: 500 } },
    },
    recommendedAction: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "reason", "owner", "due", "status"],
        properties: {
          title: { type: "string", maxLength: 300 },
          reason: { type: "string", maxLength: 1000 },
          owner: { type: "string", maxLength: 120 },
          due: { type: "string", maxLength: 120 },
          status: { const: "Draft only" },
        },
      },
    },
    priority: { enum: ["Critical", "High", "Medium", "Low", "Monitor"] },
  },
});

export function validateUnifiedOutput(value) {
  if (!isRecord(value)) return fail("output_not_object");
  const allowed = new Set(Object.keys(unifiedOutputJsonSchema.properties));
  if (Object.keys(value).some((key) => !allowed.has(key))) return fail("unexpected_output_key");
  for (const key of unifiedOutputJsonSchema.required) if (!Object.hasOwn(value, key)) return fail(`missing_${key}`);
  if (!text(value.id, 120) || !text(value.title, 200) || !text(value.inference, 2000)) return fail("invalid_text_field");
  if (!validateItems(value.fact) || !validateItems(value.evidence)) return fail("invalid_fact_or_evidence");
  if (!isRecord(value.confidence) || !["High", "Medium", "Low"].includes(value.confidence.level) || !text(value.confidence.reason, 500)) return fail("invalid_confidence");
  if (!["Critical", "High", "Medium", "Low", "Monitor"].includes(value.priority)) return fail("invalid_priority");
  if (!Array.isArray(value.recommendedAction) || value.recommendedAction.length < 1 || value.recommendedAction.length > 8) return fail("invalid_actions");
  for (const action of value.recommendedAction) {
    if (!isRecord(action) || !text(action.title, 300) || !text(action.reason, 1000) || !text(action.owner, 120) || !text(action.due, 120) || action.status !== "Draft only") return fail("invalid_action");
  }
  return { ok: true, status: "pass" };
}

function evidenceItemSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["label", "value", "source"],
    properties: {
      label: { type: "string", maxLength: 200 },
      value: { type: "string", maxLength: 1000 },
      source: { type: "string", maxLength: 160 },
    },
  };
}

function validateItems(items) {
  return Array.isArray(items) && items.length >= 1 && items.length <= 12 && items.every((item) => isRecord(item) && text(item.label, 200) && text(item.value, 1000) && text(item.source, 160));
}
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function text(value, max) { return typeof value === "string" && value.length > 0 && value.length <= max; }
function fail(reason) { return { ok: false, status: "invalid_schema", reason }; }
