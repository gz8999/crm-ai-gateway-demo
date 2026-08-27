import { containsForbiddenProviderContent } from "./promptBuilder.mjs";

const requiredKeys = ["summary", "findings", "risks", "recommendedActions", "requiredMaterials", "managementEscalation", "safetyNote"];

export function guardProviderOutput(content) {
  const extracted = extractJson(String(content || ""));
  if (!extracted) return { ok: false, status: "invalid_json", reason: "Provider output was not valid JSON." };
  let value;
  try {
    value = JSON.parse(extracted);
  } catch {
    return { ok: false, status: "invalid_json", reason: "Provider output JSON could not be parsed." };
  }
  const missing = requiredKeys.find((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (missing) return { ok: false, status: "invalid_schema", reason: `Provider output missing key: ${missing}` };
  for (const key of ["findings", "risks", "recommendedActions", "requiredMaterials"]) {
    if (!Array.isArray(value[key])) return { ok: false, status: "invalid_schema", reason: `Provider output key must be array: ${key}` };
  }
  if (typeof value.managementEscalation !== "boolean") {
    return { ok: false, status: "invalid_schema", reason: "Provider output managementEscalation must be boolean." };
  }
  if (value.safetyNote !== "raw CRM data not sent") {
    return { ok: false, status: "invalid_schema", reason: "Provider output safetyNote is invalid." };
  }
  const safety = containsForbiddenProviderContent(value);
  if (!safety.ok) return { ok: false, status: "unsafe_output", reason: safety.reason, blockedPatternKey: safety.blockedPatternKey };
  return { ok: true, status: "pass", value };
}

export function renderGuardedOutput(value) {
  return [
    value.summary,
    ...value.findings.map((item) => `Finding: ${item}`),
    ...value.risks.map((item) => `Risk: ${item}`),
    ...value.recommendedActions.map((item) => `Action: ${item}`),
    ...value.requiredMaterials.map((item) => `Required material: ${item}`),
    `Management escalation: ${value.managementEscalation ? "yes" : "no"}`,
    `Safety: ${value.safetyNote}`,
  ].filter(Boolean).join("\n");
}

function extractJson(content) {
  const codeBlock = content.match(/```json\s*([\s\S]*?)```/i);
  if (codeBlock) return codeBlock[1].trim();
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const embedded = firstJsonObject(trimmed);
  if (embedded) return embedded;
  return "";
}

function firstJsonObject(content) {
  const start = content.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return content.slice(start, index + 1);
    }
  }
  return "";
}
