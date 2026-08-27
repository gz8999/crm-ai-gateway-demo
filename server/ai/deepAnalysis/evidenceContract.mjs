import { createHash } from "node:crypto";

export const DEEP_ANALYSIS_EVIDENCE_CONTRACT_VERSION = "Deep Analysis Executive Evidence Contract v1";
export const EVIDENCE_ALIAS_LIMIT = 8;
export const EVIDENCE_ALIAS_PATTERN = /^E(?:0[1-9]|[1-8][0-9])$/u;
export const EVIDENCE_CONFIDENCE_BANDS = ["HIGH", "MEDIUM", "LOW"];

const CONTRACT_DEFINITION = {
  version: DEEP_ANALYSIS_EVIDENCE_CONTRACT_VERSION,
  topLevel: {
    required: ["executiveSummary", "timelineConclusion", "customerPosition", "decisionClarity", "keyThemes", "blockers", "contradictions", "risks", "opportunities", "recommendedActions", "evidenceAliases", "confidenceBand", "limitations"],
    additionalProperties: false,
  },
  evidenceAliases: { minItems: 1, maxItems: EVIDENCE_ALIAS_LIMIT, uniqueItems: true },
  keyThemes: { minItems: 1, maxItems: 3, fields: ["title", "analysis", "evidenceAliases"] },
  contradictions: { minItems: 0, maxItems: 3, fields: ["analysis", "evidenceAliases", "confidenceBand"] },
  otherEvidenceItems: { minItems: 0, maxItems: 3, fields: ["analysis", "evidenceAliases"] },
  recommendedActions: { minItems: 0, maxItems: 5, fields: ["action", "reason", "evidenceAliases"] },
  evidenceAliasesPerItem: { minItems: 1, maxItems: 4, uniqueItems: true },
};

export const DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH = sha256(stableStringify(CONTRACT_DEFINITION));

export function getDeepAnalysisEvidenceContract() {
  return JSON.parse(JSON.stringify({
    ...CONTRACT_DEFINITION,
    contractHash: DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
  }));
}

export function getEvidenceContractAlignment() {
  return {
    version: DEEP_ANALYSIS_EVIDENCE_CONTRACT_VERSION,
    promptContractHash: DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
    schemaContractHash: DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
    validatorContractHash: DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
    aligned: true,
  };
}

export function buildEvidenceAliasRegistry(safeEvidenceTokens = []) {
  const tokens = [...new Set(safeEvidenceTokens.filter((value) => typeof value === "string" && value.length > 0))].sort().slice(0, EVIDENCE_ALIAS_LIMIT);
  if (!tokens.length) throw new TypeError("High fidelity analysis requires request-scoped evidence.");
  const aliases = tokens.map((safeToken, index) => `E${String(index + 1).padStart(2, "0")}`);
  return {
    aliases,
    safeEvidenceTokens: tokens,
    aliasToSafeToken: Object.fromEntries(aliases.map((alias, index) => [alias, tokens[index]])),
    safeTokenToAlias: Object.fromEntries(tokens.map((safeToken, index) => [safeToken, aliases[index]])),
  };
}

export function buildHighFidelityEvidenceSchema(aliases = []) {
  const allowedAliases = [...new Set(aliases)].sort();
  if (!allowedAliases.length) throw new TypeError("High fidelity analysis requires evidence aliases.");
  // DeepSeek strict mode does not support array cardinality or uniqueItems keywords.
  // The evidence contract validator below remains authoritative for those rules.
  const aliasesSchema = () => ({ type: "array", items: { type: "string", enum: allowedAliases } });
  const themeItem = strictObject({ title: { type: "string" }, analysis: { type: "string" }, evidenceAliases: aliasesSchema() });
  const evidenceItem = strictObject({ analysis: { type: "string" }, evidenceAliases: aliasesSchema() });
  const contradictionItem = strictObject({ analysis: { type: "string" }, evidenceAliases: aliasesSchema(), confidenceBand: { type: "string", enum: EVIDENCE_CONFIDENCE_BANDS } });
  const actionItem = strictObject({ action: { type: "string" }, reason: { type: "string" }, evidenceAliases: aliasesSchema() });
  return strictObject({
    executiveSummary: { type: "string" },
    timelineConclusion: { type: "string" },
    customerPosition: { type: "string" },
    decisionClarity: { type: "string" },
    keyThemes: { type: "array", items: themeItem },
    blockers: { type: "array", items: evidenceItem },
    contradictions: { type: "array", items: contradictionItem },
    risks: { type: "array", items: evidenceItem },
    opportunities: { type: "array", items: evidenceItem },
    recommendedActions: { type: "array", items: actionItem },
    evidenceAliases: aliasesSchema(EVIDENCE_ALIAS_LIMIT),
    confidenceBand: { type: "string", enum: EVIDENCE_CONFIDENCE_BANDS },
    limitations: { type: "array", items: { type: "string" } },
  });
}

export function buildEvidenceContractPrompt(aliases = []) {
  return [
    `Contract: ${DEEP_ANALYSIS_EVIDENCE_CONTRACT_VERSION}.`,
    `Contract hash: ${DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH}.`,
    `Evidence references may use only these request-scoped aliases: ${aliases.join(", ")}.`,
    "Return one valid JSON object and no prose.",
    "keyThemes must contain 1-3 objects with title, analysis, evidenceAliases.",
    "contradictions must contain 0-3 objects with analysis, evidenceAliases, confidenceBand; use [] when no contradiction is supported.",
    "blockers, risks, and opportunities use analysis plus evidenceAliases; recommendedActions use action, reason, and evidenceAliases.",
    "Every evidenceAliases array must contain 1-4 unique aliases. Do not output any safe token, CRM identifier, or alternate evidence field.",
  ].join(" ");
}

export function validateEvidenceContract(value, { aliases = [] } = {}) {
  const diagnostics = [];
  const allowed = new Set(aliases);
  const topLevelPath = "#";
  const topLevelSchemaPath = "#/";
  if (!isRecord(value)) return diagnosticResult([diag(topLevelPath, topLevelSchemaPath, "TYPE_INVALID")]);
  const required = CONTRACT_DEFINITION.topLevel.required;
  for (const property of required) if (!Object.hasOwn(value, property)) diagnostics.push(diag(`${topLevelPath}/${property}`, `${topLevelSchemaPath}properties/${property}`, "MISSING_PROPERTY", property));
  for (const property of Object.keys(value)) if (!required.includes(property)) diagnostics.push(diag(`${topLevelPath}/${property}`, topLevelSchemaPath, "UNEXPECTED_PROPERTY"));
  for (const property of ["executiveSummary", "timelineConclusion", "customerPosition", "decisionClarity"]) if (typeof value[property] !== "string" || !value[property].length) diagnostics.push(diag(`#/` + property, `#/properties/${property}`, "TEXT_INVALID"));
  validateArray(value.keyThemes, "#/keyThemes", "#/properties/keyThemes", 1, 3, (item, index) => validateTheme(item, index, allowed, diagnostics), diagnostics);
  validateArray(value.blockers, "#/blockers", "#/properties/blockers", 0, 3, (item, index) => validateEvidenceItem(item, index, "blockers", allowed, diagnostics), diagnostics);
  validateArray(value.contradictions, "#/contradictions", "#/properties/contradictions", 0, 3, (item, index) => validateContradiction(item, index, allowed, diagnostics), diagnostics);
  validateArray(value.risks, "#/risks", "#/properties/risks", 0, 3, (item, index) => validateEvidenceItem(item, index, "risks", allowed, diagnostics), diagnostics);
  validateArray(value.opportunities, "#/opportunities", "#/properties/opportunities", 0, 3, (item, index) => validateEvidenceItem(item, index, "opportunities", allowed, diagnostics), diagnostics);
  validateArray(value.recommendedActions, "#/recommendedActions", "#/properties/recommendedActions", 0, 5, (item, index) => validateAction(item, index, allowed, diagnostics), diagnostics);
  validateAliases(value.evidenceAliases, "#/evidenceAliases", "#/properties/evidenceAliases", allowed, diagnostics, EVIDENCE_ALIAS_LIMIT);
  if (!EVIDENCE_CONFIDENCE_BANDS.includes(value.confidenceBand)) diagnostics.push(diag("#/confidenceBand", "#/properties/confidenceBand", "ENUM_INVALID"));
  validateStringArray(value.limitations, "#/limitations", "#/properties/limitations", 0, 8, diagnostics);
  return diagnosticResult(diagnostics);
}

export function normalizeEvidenceSelection(value, aliasToSafeToken = {}) {
  const toSafe = (aliases) => aliases.map((alias) => aliasToSafeToken[alias]);
  const item = (entry, fields) => ({ ...fields(entry), safeEvidenceTokens: toSafe(entry.evidenceAliases) });
  return {
    executiveSummary: value.executiveSummary,
    timelineConclusion: value.timelineConclusion,
    customerPosition: value.customerPosition,
    decisionClarity: value.decisionClarity,
    keyThemes: value.keyThemes.map((entry) => item(entry, (source) => ({ title: source.title, analysis: source.analysis }))),
    blockers: value.blockers.map((entry) => item(entry, (source) => ({ analysis: source.analysis }))),
    contradictions: value.contradictions.map((entry) => item(entry, (source) => ({ analysis: source.analysis, confidenceBand: source.confidenceBand }))),
    risks: value.risks.map((entry) => item(entry, (source) => ({ analysis: source.analysis }))),
    opportunities: value.opportunities.map((entry) => item(entry, (source) => ({ analysis: source.analysis }))),
    recommendedActions: value.recommendedActions.map((entry) => item(entry, (source) => ({ action: source.action, reason: source.reason }))),
    safeEvidenceTokens: toSafe(value.evidenceAliases),
    confidenceBand: value.confidenceBand,
    limitations: [...value.limitations],
    evidenceDeduplicationApplied: false,
  };
}

function validateArray(value, instancePath, schemaPath, minItems, maxItems, validateItem, diagnostics) {
  if (!Array.isArray(value)) { diagnostics.push(diag(instancePath, schemaPath, "ARRAY_INVALID")); return; }
  if (value.length < minItems) diagnostics.push(diag(instancePath, schemaPath, "MIN_ITEMS"));
  if (value.length > maxItems) diagnostics.push(diag(instancePath, schemaPath, "MAX_ITEMS"));
  value.forEach((item, index) => validateItem(item, index));
}

function validateTheme(item, index, allowed, diagnostics) {
  const path = `#/keyThemes/${index}`;
  validateObjectKeys(item, ["title", "analysis", "evidenceAliases"], path, "#/properties/keyThemes/items", diagnostics);
  if (!isRecord(item) || typeof item.title !== "string" || !item.title.length) diagnostics.push(diag(`${path}/title`, "#/properties/keyThemes/items/properties/title", "TEXT_INVALID"));
  if (!isRecord(item) || typeof item.analysis !== "string" || !item.analysis.length) diagnostics.push(diag(`${path}/analysis`, "#/properties/keyThemes/items/properties/analysis", "TEXT_INVALID"));
  validateAliases(item?.evidenceAliases, `${path}/evidenceAliases`, "#/properties/keyThemes/items/properties/evidenceAliases", allowed, diagnostics, 4);
}

function validateEvidenceItem(item, index, field, allowed, diagnostics) {
  const path = `#/${field}/${index}`;
  validateObjectKeys(item, ["analysis", "evidenceAliases"], path, `#/properties/${field}/items`, diagnostics);
  if (!isRecord(item) || typeof item.analysis !== "string" || !item.analysis.length) diagnostics.push(diag(`${path}/analysis`, `#/properties/${field}/items/properties/analysis`, "TEXT_INVALID"));
  validateAliases(item?.evidenceAliases, `${path}/evidenceAliases`, `#/properties/${field}/items/properties/evidenceAliases`, allowed, diagnostics, 4);
}

function validateContradiction(item, index, allowed, diagnostics) {
  const path = `#/contradictions/${index}`;
  validateObjectKeys(item, ["analysis", "evidenceAliases", "confidenceBand"], path, "#/properties/contradictions/items", diagnostics);
  if (!isRecord(item) || typeof item.analysis !== "string" || !item.analysis.length) diagnostics.push(diag(`${path}/analysis`, "#/properties/contradictions/items/properties/analysis", "TEXT_INVALID"));
  validateAliases(item?.evidenceAliases, `${path}/evidenceAliases`, "#/properties/contradictions/items/properties/evidenceAliases", allowed, diagnostics, 4);
  if (!EVIDENCE_CONFIDENCE_BANDS.includes(item?.confidenceBand)) diagnostics.push(diag(`${path}/confidenceBand`, "#/properties/contradictions/items/properties/confidenceBand", "ENUM_INVALID"));
}

function validateAction(item, index, allowed, diagnostics) {
  const path = `#/recommendedActions/${index}`;
  validateObjectKeys(item, ["action", "reason", "evidenceAliases"], path, "#/properties/recommendedActions/items", diagnostics);
  if (!isRecord(item) || typeof item.action !== "string" || !item.action.length) diagnostics.push(diag(`${path}/action`, "#/properties/recommendedActions/items/properties/action", "TEXT_INVALID"));
  if (!isRecord(item) || typeof item.reason !== "string" || !item.reason.length) diagnostics.push(diag(`${path}/reason`, "#/properties/recommendedActions/items/properties/reason", "TEXT_INVALID"));
  validateAliases(item?.evidenceAliases, `${path}/evidenceAliases`, "#/properties/recommendedActions/items/properties/evidenceAliases", allowed, diagnostics, 4);
}

function validateAliases(value, instancePath, schemaPath, allowed, diagnostics, maxItems = 4) {
  if (!Array.isArray(value)) { diagnostics.push(diag(instancePath, schemaPath, "ARRAY_INVALID")); return; }
  if (value.length < 1) diagnostics.push(diag(instancePath, schemaPath, "MIN_ITEMS"));
  if (value.length > maxItems) diagnostics.push(diag(instancePath, schemaPath, "MAX_ITEMS"));
  const seen = new Map();
  let unknownAliasCount = 0;
  value.forEach((alias, index) => {
    if (typeof alias !== "string" || !EVIDENCE_ALIAS_PATTERN.test(alias) || !allowed.has(alias)) {
      unknownAliasCount += 1;
      diagnostics.push(diag(`${instancePath}/${index}`, schemaPath, "UNKNOWN_ALIAS", undefined, undefined, unknownAliasCount));
    }
    if (seen.has(alias)) diagnostics.push(diag(`${instancePath}/${index}`, schemaPath, "DUPLICATE_ALIAS", undefined, seen.get(alias), unknownAliasCount));
    else seen.set(alias, index);
  });
}

function validateStringArray(value, instancePath, schemaPath, minItems, maxItems, diagnostics) {
  if (!Array.isArray(value)) { diagnostics.push(diag(instancePath, schemaPath, "ARRAY_INVALID")); return; }
  if (value.length < minItems) diagnostics.push(diag(instancePath, schemaPath, "MIN_ITEMS"));
  if (value.length > maxItems) diagnostics.push(diag(instancePath, schemaPath, "MAX_ITEMS"));
  value.forEach((item, index) => { if (typeof item !== "string") diagnostics.push(diag(`${instancePath}/${index}`, schemaPath, "TEXT_INVALID")); });
}

function validateObjectKeys(value, expected, instancePath, schemaPath, diagnostics) {
  if (!isRecord(value)) { diagnostics.push(diag(instancePath, schemaPath, "OBJECT_INVALID")); return; }
  for (const key of expected) if (!Object.hasOwn(value, key)) diagnostics.push(diag(`${instancePath}/${key}`, `${schemaPath}/properties/${key}`, "MISSING_PROPERTY", key));
  for (const key of Object.keys(value)) if (!expected.includes(key)) diagnostics.push(diag(`${instancePath}/${key}`, schemaPath, "UNEXPECTED_PROPERTY"));
}

function diagnosticResult(diagnostics) {
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    unknownAliasCount: diagnostics.reduce((count, item) => count + (item.reasonCode === "UNKNOWN_ALIAS" ? 1 : 0), 0),
    evidenceDeduplicationApplied: false,
  };
}
function diag(instancePath, schemaPath, reasonCode, missingProperty = "", duplicateIndex = null, unknownAliasCount = 0) { return { instancePath, schemaPath, reasonCode, missingProperty, duplicateIndex, unknownAliasCount }; }
function strictObject(properties) { return { type: "object", properties, required: Object.keys(properties), additionalProperties: false }; }
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha256(value) { return createHash("sha256").update(String(value), "utf8").digest("hex"); }
