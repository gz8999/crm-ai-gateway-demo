import test from "node:test";
import assert from "node:assert/strict";
import {
  DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
  DEEP_ANALYSIS_EVIDENCE_CONTRACT_VERSION,
  buildEvidenceAliasRegistry,
  buildEvidenceContractPrompt,
  buildHighFidelityEvidenceSchema,
  getEvidenceContractAlignment,
  normalizeEvidenceSelection,
  validateEvidenceContract,
} from "../server/ai/deepAnalysis/evidenceContract.mjs";

const aliases = ["E01", "E02", "E03"];

test("evidence contract exposes one aligned hash and request-scoped aliases", () => {
  const registry = buildEvidenceAliasRegistry(["safe.timeline.001", "safe.crm.business", "safe.timeline.002"]);
  assert.deepEqual(registry.aliases, ["E01", "E02", "E03"]);
  assert.equal(registry.aliasToSafeToken.E01, "safe.crm.business");
  assert.equal(registry.safeTokenToAlias["safe.timeline.001"], "E02");
  assert.deepEqual(getEvidenceContractAlignment(), {
    version: DEEP_ANALYSIS_EVIDENCE_CONTRACT_VERSION,
    promptContractHash: DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
    schemaContractHash: DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
    validatorContractHash: DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
    aligned: true,
  });
  assert.match(buildEvidenceContractPrompt(aliases), /E01, E02, E03/u);
  assert.doesNotMatch(buildEvidenceContractPrompt(aliases), /evidenceTokens|citations|basis/u);
});

test("strict high fidelity schema keeps every object closed and removes legacy evidence fields", () => {
  const schema = buildHighFidelityEvidenceSchema(aliases);
  const objectNodes = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "object") {
      objectNodes.push(node);
      assert.equal(node.additionalProperties, false);
      assert.deepEqual(node.required, Object.keys(node.properties));
    }
    if (node.properties) Object.values(node.properties).forEach(visit);
    if (node.items) visit(node.items);
    if (node.anyOf) node.anyOf.forEach(visit);
  };
  visit(schema);
  assert.ok(objectNodes.length >= 7);
  assert.equal(Object.hasOwn(schema.properties, "evidenceTokens"), false);
  assert.equal(Object.hasOwn(schema.properties, "citations"), false);
  assert.doesNotMatch(JSON.stringify(schema), /"(?:minItems|maxItems|uniqueItems)"/u);
  const valid = validSelection();
  assert.equal(validateEvidenceContract(valid, { aliases }).ok, true);
  assert.equal(validateEvidenceContract({ ...valid, keyThemes: [] }, { aliases }).ok, false);
  assert.equal(validateEvidenceContract({ ...valid, keyThemes: [{ ...valid.keyThemes[0], evidenceAliases: ["E01", "E01"] }] }, { aliases }).ok, false);
});

test("valid contract normalizes aliases only after strict validation", () => {
  const selection = validSelection();
  const validation = validateEvidenceContract(selection, { aliases });
  assert.equal(validation.ok, true);
  const normalized = normalizeEvidenceSelection(selection, { E01: "safe-001", E02: "safe-002", E03: "safe-003" });
  assert.deepEqual(normalized.safeEvidenceTokens, ["safe-001"]);
  assert.deepEqual(normalized.keyThemes[0].safeEvidenceTokens, ["safe-001"]);
  assert.equal(normalized.evidenceDeduplicationApplied, false);
});

test("unknown and duplicate aliases fail closed with safe diagnostics", () => {
  const unknown = validateEvidenceContract({ ...validSelection(), evidenceAliases: ["E99"] }, { aliases });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.unknownAliasCount, 1);
  assert.equal(unknown.diagnostics[0].reasonCode, "UNKNOWN_ALIAS");
  assert.equal(unknown.diagnostics[0].instancePath, "#/evidenceAliases/0");

  const duplicate = validateEvidenceContract({ ...validSelection(), evidenceAliases: ["E01", "E01"] }, { aliases });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.diagnostics.some((item) => item.reasonCode === "DUPLICATE_ALIAS" && item.duplicateIndex === 0), true);
});

test("legacy evidence shapes and missing arrays are rejected without inventing facts", () => {
  const legacy = { ...validSelection(), keyThemes: [{ statement: "legacy", evidenceTokens: ["E01"] }] };
  const legacyResult = validateEvidenceContract(legacy, { aliases });
  assert.equal(legacyResult.ok, false);
  assert.equal(legacyResult.diagnostics.some((item) => item.reasonCode === "UNEXPECTED_PROPERTY"), true);
  assert.equal(legacyResult.diagnostics.some((item) => item.reasonCode === "MISSING_PROPERTY" && item.missingProperty === "title"), true);

  const missing = validateEvidenceContract({ ...validSelection(), contradictions: undefined }, { aliases });
  assert.equal(missing.ok, false);
  assert.equal(missing.diagnostics.some((item) => item.reasonCode === "ARRAY_INVALID" && item.instancePath === "#/contradictions"), true);
});

function validSelection() {
  return {
    executiveSummary: "summary",
    timelineConclusion: "timeline",
    customerPosition: "position",
    decisionClarity: "clarity",
    keyThemes: [{ title: "theme", analysis: "analysis", evidenceAliases: ["E01"] }],
    blockers: [],
    contradictions: [],
    risks: [],
    opportunities: [],
    recommendedActions: [],
    evidenceAliases: ["E01"],
    confidenceBand: "MEDIUM",
    limitations: [],
  };
}
