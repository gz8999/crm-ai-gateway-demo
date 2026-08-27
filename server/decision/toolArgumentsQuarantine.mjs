import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { inspectStrictToolArgumentPath } from "./providerSuccessObservability.mjs";

export const R5B7A_CAPTURE_DIR = "local-artifacts/gateway/phase3c-r5b7";
export const R5B8_CAPTURE_DIR = "local-artifacts/gateway/phase3c-r5b8";
export const R5B10_CAPTURE_DIR = "local-artifacts/gateway/phase3c-r5b10";
export const R6_CAPTURE_DIR = "local-artifacts/gateway/phase3c-r6";
const ALLOWED_CAPTURE_DIRS = new Set([R5B7A_CAPTURE_DIR, R5B8_CAPTURE_DIR, R5B10_CAPTURE_DIR, R6_CAPTURE_DIR]);
export const TOOL_ARGUMENT_SYNTAX_CATEGORIES = Object.freeze({
  TRAILING_COMMA: "TRAILING_COMMA",
  UNESCAPED_CONTROL_CHARACTER: "UNESCAPED_CONTROL_CHARACTER",
  UNTERMINATED_STRING: "UNTERMINATED_STRING",
  INVALID_ESCAPE: "INVALID_ESCAPE",
  SINGLE_QUOTED_KEY_OR_VALUE: "SINGLE_QUOTED_KEY_OR_VALUE",
  LEADING_OR_TRAILING_TEXT: "LEADING_OR_TRAILING_TEXT",
  INVALID_NUMBER: "INVALID_NUMBER",
  MISMATCHED_BRACKET: "MISMATCHED_BRACKET",
  MARKDOWN_FENCE: "MARKDOWN_FENCE",
  DOUBLE_ENCODED_JSON: "DOUBLE_ENCODED_JSON",
  UNKNOWN_JSON_SYNTAX: "UNKNOWN_JSON_SYNTAX",
});

const RAW_FILE = "arguments.raw.txt";
const HASH_FILE = "arguments.sha256";
const PRIVATE_DIAGNOSTICS_FILE = "parse-diagnostics.private.json";

export function validateSyntheticQuarantineEligibility(input = {}) {
  const flags = {
    testOnly: input.testOnly === true,
    syntheticProbe: input.syntheticProbe === true,
    d365Record: input.d365Record === false,
    runtimeEligible: input.runtimeEligible === false,
    realCanary: input.realCanary === false,
  };
  const counts = {
    realCrmTokenCount: Number(input.realCrmTokenCount || 0),
    forbiddenFieldCount: Number(input.forbiddenFieldCount || 0),
  };
  const eligible = Object.values(flags).every(Boolean)
    && counts.realCrmTokenCount === 0
    && counts.forbiddenFieldCount === 0;
  return { eligible, flags, counts };
}

export function diagnoseToolArguments(argumentsText, { parseOutcome = null } = {}) {
  const text = typeof argumentsText === "string" ? argumentsText : "";
  const bomPresent = text.startsWith("\uFEFF");
  const normalized = text.replace(/^\uFEFF/, "").trim();
  const utf8Valid = isValidUnicodeString(text);
  const error = normalizeParseOutcome(parseOutcome) || parseOnce(normalized);
  const category = classifySyntax(normalized, error);
  const offset = error?.offset ?? null;
  const brackets = bracketStack(normalized);
  const controlOffsets = findControlCharacterOffsets(normalized);
  const publicDiagnostics = {
    argumentsLength: text.length,
    argumentsSha256: sha256(text),
    utf8Valid,
    bomPresent,
    firstCharacterCategory: characterCategory(normalized, "first"),
    lastCharacterCategory: characterCategory(normalized, "last"),
    leftBraceCount: countCharacter(text, "{"),
    rightBraceCount: countCharacter(text, "}"),
    leftBracketCount: countCharacter(text, "["),
    rightBracketCount: countCharacter(text, "]"),
    quoteCount: countCharacter(text, '"'),
    parseErrorType: error?.type || null,
    parseErrorMessage: error?.ok ? null : safeParseErrorMessage(error, offset),
    parseErrorOffset: offset,
    parseErrorLine: offset === null ? null : lineColumn(normalized, offset).line,
    parseErrorColumn: offset === null ? null : lineColumn(normalized, offset).column,
    syntaxCategory: category,
    braceBalance: countCharacter(normalized, "{") - countCharacter(normalized, "}"),
    bracketBalance: countCharacter(normalized, "[") - countCharacter(normalized, "]"),
    stringStateAtEnd: isUnterminatedString(normalized) ? "open" : "closed",
    firstInvalidControlCharacterType: controlOffsets.length ? codePointType(normalized.codePointAt(controlOffsets[0])) : null,
    invalidEscapeType: hasInvalidEscape(normalized) ? "invalid_json_escape" : null,
    surroundingCodePointClasses: offset === null ? [] : codePointClassesAround(normalized, offset),
    trailingDataPresent: hasLeadingOrTrailingText(normalized),
    truncationIndicators: {
      unbalancedBraces: countCharacter(normalized, "{") !== countCharacter(normalized, "}"),
      unbalancedBrackets: countCharacter(normalized, "[") !== countCharacter(normalized, "]"),
      unterminatedString: isUnterminatedString(normalized),
      mismatchedBracket: brackets.mismatched,
    },
  };
  const privateDiagnostics = {
    ...publicDiagnostics,
    escapedErrorWindow: offset === null ? "" : escapedWindow(normalized, offset),
    escapedRepresentation: boundedEscapedRepresentation(normalized),
    escapedRepresentationTruncated: normalized.length > 512,
    controlCharacterOffsets: controlOffsets,
    bracketStack: brackets,
  };
  return { publicDiagnostics, privateDiagnostics, parsedValue: error?.ok ? error.value : null };
}

export function extractSyntheticToolArguments(envelope, eligibility, { onArguments = null } = {}) {
  const gate = validateSyntheticQuarantineEligibility(eligibility);
  if (!gate.eligible) return { ok: false, captured: false, reason: "synthetic_quarantine_ineligible", gate };
  let argumentsText = null;
  const inspected = inspectStrictToolArgumentPath(envelope, { onArguments: (value) => { argumentsText = value; onArguments?.(value); } });
  if (!inspected.ok || typeof argumentsText !== "string") {
    return { ok: false, captured: false, reason: inspected.reason || "arguments_unavailable", gate, inspected };
  }
  const diagnostics = diagnoseToolArguments(argumentsText);
  return { ok: true, captured: false, gate, inspected, diagnostics };
}

export async function captureSyntheticToolArguments({ envelope, eligibility, repoRoot = process.cwd(), now = () => new Date() } = {}) {
  let argumentsText = null;
  const extracted = extractSyntheticToolArguments(envelope, eligibility, { onArguments: (value) => { argumentsText = value; } });
  if (!extracted.ok || typeof argumentsText !== "string") return extracted;
  const written = await writeSyntheticToolArgumentQuarantine({ argumentsText, eligibility, repoRoot, now });
  return { ...extracted, captured: true, publicDiagnostics: written.publicDiagnostics, privateFiles: written };
}

export async function writeSyntheticToolArgumentQuarantine({ argumentsText, eligibility, parseOutcome = null, repoRoot = process.cwd(), captureDir = R5B7A_CAPTURE_DIR, phase = "Phase 3C-R5B7A", diagnosticsMetadata = {}, now = () => new Date() } = {}) {
  const gate = validateSyntheticQuarantineEligibility(eligibility);
  if (!gate.eligible) throw new Error("Synthetic quarantine eligibility failed");
  if (typeof argumentsText !== "string") throw new TypeError("Synthetic tool arguments must be a string");
  if (!ALLOWED_CAPTURE_DIRS.has(captureDir)) throw new Error("Synthetic quarantine capture directory is not allowlisted");
  const directory = path.join(repoRoot, captureDir);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const diagnosis = diagnoseToolArguments(argumentsText, { parseOutcome });
  const rawPath = path.join(directory, RAW_FILE);
  const hashPath = path.join(directory, HASH_FILE);
  const diagnosticsPath = path.join(directory, PRIVATE_DIAGNOSTICS_FILE);
  await fs.writeFile(rawPath, argumentsText, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(rawPath, 0o600);
  await fs.writeFile(hashPath, `${diagnosis.publicDiagnostics.argumentsSha256}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(hashPath, 0o600);
  const privateManifest = {
    phase,
    capturedAt: now().toISOString(),
    captureReason: "Synthetic-only Tool Arguments diagnostics",
    lifecycle: "pending-deletion",
    ...diagnosis.privateDiagnostics,
    diagnosticsMetadata: allowlistedDiagnosticsMetadata(diagnosticsMetadata),
    files: { raw: RAW_FILE, hash: HASH_FILE, diagnostics: PRIVATE_DIAGNOSTICS_FILE },
  };
  await fs.writeFile(diagnosticsPath, `${JSON.stringify(privateManifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(diagnosticsPath, 0o600);
  return {
    captured: true,
    privateDirectory: captureDir,
    rawFile: RAW_FILE,
    hashFile: HASH_FILE,
    diagnosticsFile: PRIVATE_DIAGNOSTICS_FILE,
    publicDiagnostics: diagnosis.publicDiagnostics,
  };
}

export async function finalizeSyntheticToolArgumentQuarantine({ repoRoot = process.cwd(), captureDir = R5B7A_CAPTURE_DIR, now = () => new Date() } = {}) {
  if (!ALLOWED_CAPTURE_DIRS.has(captureDir)) throw new Error("Synthetic quarantine capture directory is not allowlisted");
  const directory = path.join(repoRoot, captureDir);
  const rawPath = path.join(directory, RAW_FILE);
  const diagnosticsPath = path.join(directory, PRIVATE_DIAGNOSTICS_FILE);
  const raw = await fs.readFile(rawPath, "utf8");
  const rawHash = sha256(raw);
  await fs.unlink(rawPath);
  let existing = {};
  try { existing = JSON.parse(await fs.readFile(diagnosticsPath, "utf8")); } catch { existing = {}; }
  const lifecycle = {
    ...existing,
    lifecycle: "deleted",
    rawArgumentsHashBeforeDeletion: rawHash,
    rawFileExistsAfterDeletion: false,
    deletedAt: now().toISOString(),
    deletionStatus: "deleted",
  };
  await fs.writeFile(diagnosticsPath, `${JSON.stringify(lifecycle, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(diagnosticsPath, 0o600);
  return {
    deleted: true,
    rawArgumentsHashBeforeDeletion: rawHash,
    rawFileExistsAfterDeletion: false,
    deletionStatus: "deleted",
    diagnosticsFile: PRIVATE_DIAGNOSTICS_FILE,
  };
}

function parseOnce(text) {
  if (!text) return { ok: false, type: "SyntaxError", offset: null, message: "empty" };
  try { return { ok: true, value: JSON.parse(text) }; } catch (error) {
    const offset = parseErrorOffset(error);
    return { ok: false, type: error?.name || "SyntaxError", offset, message: String(error?.message || "") };
  }
}

function normalizeParseOutcome(outcome) {
  if (!outcome) return null;
  if (outcome instanceof Error) {
    return { ok: false, type: outcome.name || "SyntaxError", offset: parseErrorOffset(outcome), message: String(outcome.message || "") };
  }
  if (typeof outcome === "object" && outcome.ok === true) return { ok: true, value: outcome.value };
  if (typeof outcome === "object") {
    return {
      ok: false,
      type: outcome.type || outcome.error?.name || "SyntaxError",
      offset: Number.isInteger(outcome.offset) ? outcome.offset : parseErrorOffset(outcome.error || outcome),
      message: String(outcome.message || outcome.error?.message || ""),
    };
  }
  return null;
}

function allowlistedDiagnosticsMetadata(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(["toolSchemaHash", "requestSchemaHash", "requestBodyHash"]
    .filter((key) => /^[0-9a-f]{64}$/.test(String(value[key] || "")))
    .map((key) => [key, String(value[key])]));
}

function boundedEscapedRepresentation(text) {
  const head = text.slice(0, 256);
  const tail = text.length > 512 ? text.slice(-256) : text.slice(256);
  return JSON.stringify(text.length > 512 ? `${head}\n[TRUNCATED]\n${tail}` : `${head}${tail}`);
}

function classifySyntax(text, error) {
  if (!text) return TOOL_ARGUMENT_SYNTAX_CATEGORIES.UNKNOWN_JSON_SYNTAX;
  if (/^```(?:json)?\s|```$/.test(text)) return TOOL_ARGUMENT_SYNTAX_CATEGORIES.MARKDOWN_FENCE;
  if (error?.ok) return typeof error.value === "string" ? TOOL_ARGUMENT_SYNTAX_CATEGORIES.DOUBLE_ENCODED_JSON : null;
  if (hasUnescapedControlCharacter(text)) return TOOL_ARGUMENT_SYNTAX_CATEGORIES.UNESCAPED_CONTROL_CHARACTER;
  if (isUnterminatedString(text)) return TOOL_ARGUMENT_SYNTAX_CATEGORIES.UNTERMINATED_STRING;
  if (hasInvalidEscape(text)) return TOOL_ARGUMENT_SYNTAX_CATEGORIES.INVALID_ESCAPE;
  if (hasSingleQuotedKeyOrValue(text)) return TOOL_ARGUMENT_SYNTAX_CATEGORIES.SINGLE_QUOTED_KEY_OR_VALUE;
  if (hasLeadingOrTrailingText(text)) return TOOL_ARGUMENT_SYNTAX_CATEGORIES.LEADING_OR_TRAILING_TEXT;
  if (hasInvalidNumber(text)) return TOOL_ARGUMENT_SYNTAX_CATEGORIES.INVALID_NUMBER;
  if (bracketStack(text).mismatched) return TOOL_ARGUMENT_SYNTAX_CATEGORIES.MISMATCHED_BRACKET;
  if (/,\s*[}\]]/.test(text)) return TOOL_ARGUMENT_SYNTAX_CATEGORIES.TRAILING_COMMA;
  return TOOL_ARGUMENT_SYNTAX_CATEGORIES.UNKNOWN_JSON_SYNTAX;
}

function hasUnescapedControlCharacter(text) {
  let inString = false;
  let escaped = false;
  for (const character of text) {
    if (escaped) { escaped = false; continue; }
    if (character === "\\" && inString) { escaped = true; continue; }
    if (character === '"') { inString = !inString; continue; }
    if (inString && character.charCodeAt(0) < 0x20) return true;
  }
  return false;
}

function isUnterminatedString(text) {
  let inString = false;
  let escaped = false;
  for (const character of text) {
    if (escaped) { escaped = false; continue; }
    if (character === "\\" && inString) { escaped = true; continue; }
    if (character === '"') inString = !inString;
  }
  return inString;
}

function hasInvalidEscape(text) {
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && text[index - 1] !== "\\") { inString = !inString; continue; }
    if (!inString || character !== "\\") continue;
    const next = text[index + 1];
    if (!next || !'"\\/bfnrtu'.includes(next)) return true;
    if (next === "u" && !/^[0-9a-fA-F]{4}$/.test(text.slice(index + 2, index + 6))) return true;
    index += next === "u" ? 5 : 1;
  }
  return false;
}

function hasSingleQuotedKeyOrValue(text) { return /(?:^|[,{[]|:)\s*'/.test(text) || /'\s*(?:,|}|\])/.test(text); }
function hasLeadingOrTrailingText(text) { return !/^[{[]/.test(text) || /[}\]]\s+[^}\]]+$/.test(text); }
function hasInvalidNumber(text) { return /(?:^|[,:\[]\s*)-?0\d+|(?:^|[,:\[]\s*)-?\d+\.(?:\D|$)|(?:^|[,:\[]\s*)-?\d+[eE][+-]?(?:\D|$)/.test(text); }

function bracketStack(text) {
  const stack = [];
  const pairs = { "}": "{", "]": "[" };
  let inString = false;
  let escaped = false;
  let mismatched = false;
  for (const character of text) {
    if (escaped) { escaped = false; continue; }
    if (character === "\\" && inString) { escaped = true; continue; }
    if (character === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (character === "{" || character === "[") stack.push(character);
    if (character === "}" || character === "]") {
      if (stack.pop() !== pairs[character]) mismatched = true;
    }
  }
  return { mismatched: mismatched || stack.length > 0, remaining: stack };
}

function findControlCharacterOffsets(text) {
  const offsets = [];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (escaped) { escaped = false; continue; }
    if (character === "\\" && inString) { escaped = true; continue; }
    if (character === '"') { inString = !inString; continue; }
    if (inString && character.charCodeAt(0) < 0x20) offsets.push(index);
  }
  return offsets;
}

function escapedWindow(text, offset) {
  return JSON.stringify(text.slice(Math.max(0, offset - 80), Math.min(text.length, offset + 81)));
}
function lineColumn(text, offset) {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  const column = offset - before.lastIndexOf("\n");
  return { line, column };
}
function parseErrorOffset(error) {
  const match = String(error?.message || "").match(/(?:position|column)\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}
function safeParseErrorMessage(error, offset) {
  const type = String(error?.type || "SyntaxError").replace(/[^A-Za-z]/g, "") || "SyntaxError";
  return offset === null ? type : `${type} at offset ${offset}`;
}
function codePointClassesAround(text, offset) {
  const start = Math.max(0, offset - 3);
  const end = Math.min(text.length, offset + 4);
  return Array.from(text.slice(start, end), (character) => codePointType(character.codePointAt(0)));
}
function codePointType(codePoint) {
  if (!Number.isInteger(codePoint)) return null;
  if (codePoint < 0x20 || codePoint === 0x7f) return "control";
  if (codePoint >= 0x30 && codePoint <= 0x39) return "digit";
  if ((codePoint >= 0x41 && codePoint <= 0x5a) || (codePoint >= 0x61 && codePoint <= 0x7a)) return "ascii-letter";
  if ([0x7b, 0x7d, 0x5b, 0x5d].includes(codePoint)) return "bracket";
  if ([0x22, 0x27].includes(codePoint)) return "quote";
  if ([0x2c, 0x3a].includes(codePoint)) return "delimiter";
  if (codePoint <= 0x7f) return "ascii-other";
  return "unicode";
}
function characterCategory(text, position) {
  if (!text) return null;
  const character = position === "last" ? text.at(-1) : text[0];
  if (character === "{") return "left-brace";
  if (character === "}") return "right-brace";
  if (character === "[") return "left-bracket";
  if (character === "]") return "right-bracket";
  if (character === '"') return "quote";
  if (/\d/.test(character)) return "digit";
  if (/[A-Za-z]/.test(character)) return "ascii-letter";
  return "other";
}
function countCharacter(text, character) { return [...text].filter((item) => item === character).length; }
function sha256(value) { return createHash("sha256").update(String(value), "utf8").digest("hex"); }
function isValidUnicodeString(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xDC00 || next > 0xDFFF) return false;
      index += 1;
    } else if (code >= 0xDC00 && code <= 0xDFFF) return false;
  }
  return true;
}
