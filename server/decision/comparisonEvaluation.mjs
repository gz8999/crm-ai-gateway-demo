import { createHash } from "node:crypto";
import { containsForbiddenProviderContent } from "../ai/providers/promptBuilder.mjs";

const GENERIC_FORBIDDEN = ["customer said", "email confirms", "port closure", "customs delay", "sanction", "guaranteed growth", "real-world disruption"];

export function evaluateComparison({ demoOutput, externalOutput, safeContext, previousSignature = "" }) {
  const externalText = JSON.stringify(externalOutput).toLowerCase();
  const sourceKeys = allowedSourceKeys(safeContext);
  const scores = {
    factAccuracy: overlapScore(demoOutput.fact, externalOutput.fact, "label", "value"),
    evidenceCoverage: sourceCoverage(externalOutput.evidence, sourceKeys),
    requiredActionCoverage: overlapScore(demoOutput.recommendedAction, externalOutput.recommendedAction, "title"),
    claimSafety: GENERIC_FORBIDDEN.some((claim) => externalText.includes(claim)) ? 0 : 100,
    priorityAlignment: demoOutput.priority === externalOutput.priority ? 100 : 0,
    confidenceAlignment: demoOutput.confidence.level === externalOutput.confidence.level ? 100 : 0,
    contractCompliance: 100,
    safetyCompliance: containsForbiddenProviderContent(externalOutput).ok ? 100 : 0,
    stability: previousSignature ? (previousSignature === signature(externalOutput) ? 100 : 0) : null,
  };
  if (demoOutput.priority === "Monitor" && ["Critical", "High"].includes(externalOutput.priority)) scores.priorityAlignment = 0;
  const measured = Object.values(scores).filter((value) => typeof value === "number");
  return { scores, total: Math.round(measured.reduce((sum, value) => sum + value, 0) / measured.length), signature: signature(externalOutput) };
}

export function safeContextHash(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function allowedSourceKeys(context) {
  const keys = new Set();
  for (const key of Object.keys(context)) keys.add(`safeContext.${key}`);
  for (const key of Object.keys(context.accountAggregate || {})) keys.add(`safeContext.accountAggregate.${key}`);
  keys.add("safeAggregate.scopeCount"); keys.add("safeAggregate.escalatedCount");
  return keys;
}
function sourceCoverage(items, keys) { return items.length ? Math.round(items.filter((item) => keys.has(item.source)).length / items.length * 100) : 0; }
function overlapScore(reference, candidate, ...keys) {
  if (!reference.length || !candidate.length) return 0;
  const expected = new Set(reference.map((item) => keys.map((key) => normalize(item[key])).join("|")));
  return Math.round(candidate.filter((item) => expected.has(keys.map((key) => normalize(item[key])).join("|"))).length / expected.size * 100);
}
function normalize(value) { return String(value || "").trim().toLowerCase(); }
function signature(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
