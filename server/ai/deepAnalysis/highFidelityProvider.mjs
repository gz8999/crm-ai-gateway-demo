import { createHash } from "node:crypto";
import { observeProviderError } from "../../decision/providerErrorObservability.mjs";
import { parseStrictToolArguments } from "../../decision/providerSuccessObservability.mjs";
import { openAiCompatibleThinking } from "../providers/openaiCompatibleOptions.mjs";
import { buildTimelineExecutiveSynthesis, TIMELINE_EXECUTIVE_CODES, TIMELINE_EXECUTIVE_TEXT } from "../../decision/timelineDigest.mjs";
import { HIGH_FIDELITY_MODE, isBusinessSignalTrue } from "./highFidelityContext.mjs";
import { validateHighFidelityProviderPayload } from "./deepAnalysisSafety.mjs";
import { deepAnalysisText, localizedTimelineText, normalizeDeepAnalysisLocale } from "./deepAnalysisLocalization.mjs";
import {
  DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
  DEEP_ANALYSIS_EVIDENCE_CONTRACT_VERSION,
  buildEvidenceAliasRegistry,
  buildEvidenceContractPrompt,
  buildHighFidelityEvidenceSchema,
  normalizeEvidenceSelection,
  validateEvidenceContract,
} from "./evidenceContract.mjs";

export const HIGH_FIDELITY_TOOL_NAME = "emit_high_fidelity_deep_analysis";
export const HIGH_FIDELITY_CONTRACT = "deep-analysis-high-fidelity-v1";
export const HIGH_FIDELITY_REFERENCE_TRANSPORT = "reference-only";
export const HIGH_FIDELITY_RICH_TOOL_TRANSPORT = "rich-tool";

const HIGH_FIDELITY_REFERENCE_LIMITATION_CODES = Object.freeze([
  "NO_CUSTOMER_HISTORY",
  "NO_EXTERNAL_INTELLIGENCE",
  "NO_INTERNAL_CAPABILITY",
  "HUMAN_REVIEW_REQUIRED",
  "LIMITED_TIMELINE_COVERAGE",
]);

export function buildHighFidelityTool(evidenceAliases = []) {
  const aliases = [...new Set(evidenceAliases)].sort();
  if (!aliases.length) throw new TypeError("High fidelity analysis requires evidence aliases.");
  return {
    type: "function",
    function: {
      name: HIGH_FIDELITY_TOOL_NAME,
      description: `Return compact valid JSON through one function call for identity-redacted high fidelity analysis under ${DEEP_ANALYSIS_EVIDENCE_CONTRACT_VERSION}. Every string must use valid JSON escaping; do not emit raw line breaks, markdown, prose, or a JSON string containing another JSON document. Cite only request-scoped evidence aliases and keep all actions as drafts. Contract hash: ${DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH}.`,
      strict: true,
      parameters: buildHighFidelityEvidenceSchema(aliases),
    },
  };
}

export function buildHighFidelityRequest({ payload, env = process.env, evidenceRegistry = null } = {}) {
  const registry = evidenceRegistry || buildEvidenceAliasRegistry(collectEvidenceTokens(payload.highFidelityContext));
  const context = providerContext(payload.highFidelityContext, registry);
  const outputSchema = JSON.stringify(buildHighFidelityEvidenceSchema(registry.aliases));
  const outputLanguage = deepAnalysisOutputLanguage(payload.responseLocale);
  return {
    model: String(env.LLM_MODEL || "deepseek-v4-pro"),
    messages: [
      {
        role: "system",
      content: `Return one JSON object only. ${outputLanguage} Apply that language to every natural-language value, including the title, executive summary, Timeline synthesis, themes, risks, opportunities, scenarios, actions, evidence summaries, confidence reason, and limitations. Do not copy the source language when writing analysis; quote source text only when strictly required as evidence. Do not use tools, function calls, markdown fences, prose before or after the JSON, or a second JSON encoding. Every string value must use valid JSON escaping: escape quotation marks and backslashes and represent line breaks with JSON escapes. ${buildEvidenceContractPrompt(registry.aliases).replace("Return exactly one tool call and no prose.", "Return exactly one JSON object and no prose.")} The exact output shape is the following JSON Schema; emit every required top-level key exactly as named and no other key: ${outputSchema} Keep each natural-language field concise, summarize Timeline themes across records instead of copying entries, and use no more than three items in themes, blockers, contradictions, risks, opportunities, or actions. Ground every Timeline conclusion in distinct evidence-backed facts. Do not repeat the same sentence across executiveSummary, timelineConclusion, keyThemes, blockers, contradictions, or recommendedActions. Analyze the supplied identity-redacted CRM business original text and Timeline records. Preserve business dates and amounts when relevant, never identify the customer, and never claim CRM writeback.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          analysisContextMode: HIGH_FIDELITY_MODE,
          responseLocale: payload.responseLocale || "zh-CN",
          contract: HIGH_FIDELITY_CONTRACT,
          evidenceContractVersion: DEEP_ANALYSIS_EVIDENCE_CONTRACT_VERSION,
          evidenceContractHash: DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
          evidenceAliases: registry.aliases,
          context,
          boundaries: [
            "Customer company, contact, email, phone, address, and CRM identifiers have been replaced with stable aliases.",
            "Timeline business text may be analyzed across records.",
            "Amounts, dates, routes, and commercial terms may be used for analysis.",
            "Every action is a Draft Recommendation, not a CRM instruction.",
            "Output request-scoped evidenceAliases only; never output safe evidence tokens or CRM identifiers.",
          ],
        }),
      },
    ],
    ...openAiCompatibleThinking(env),
    temperature: 0,
    max_tokens: boundedNumber(env.LLM_DEEP_ANALYSIS_MAX_TOKENS || 1800, 1800, 600, 4000),
    stream: false,
    response_format: { type: "json_object" },
  };
}

function deepAnalysisOutputLanguage(locale) {
  if (locale === "ja-JP") return "Write all natural-language output in Japanese.";
  if (locale === "en-US") return "Write all natural-language output in English.";
  return "Write all natural-language output in Simplified Chinese.";
}

export function buildHighFidelityReferenceSchema(aliases = []) {
  const allowedAliases = [...new Set(aliases)].sort();
  if (!allowedAliases.length) throw new TypeError("High fidelity reference transport requires evidence aliases.");
  const codes = highFidelityReferenceCodes();
  const properties = {
    overallCode: enumSchema(codes.overall),
    momentumCode: enumSchema(codes.momentum),
    customerPositionCode: enumSchema(codes.customerPosition),
    decisionClarityCode: enumSchema(codes.decisionClarity),
    commitmentCode: enumSchema(codes.commitment),
    confidenceBand: enumSchema(codes.confidence),
  };
  addReferenceSlots(properties, "stakeholderCode", codes.stakeholder, 3);
  addReferenceSlots(properties, "themeCode", codes.themes, 3, { requiredFirst: true });
  addReferenceSlots(properties, "blockerCode", codes.blockers, 3);
  addReferenceSlots(properties, "contradictionCode", codes.contradictions, 3);
  addReferenceSlots(properties, "riskCode", codes.blockers, 3);
  addReferenceSlots(properties, "opportunityCode", codes.opportunities, 3);
  addReferenceSlots(properties, "actionCode", codes.actions, 3);
  addReferenceSlots(properties, "representativeEvidenceAlias", allowedAliases, 8, { requiredFirst: true });
  addReferenceSlots(properties, "limitationCode", HIGH_FIDELITY_REFERENCE_LIMITATION_CODES, 8);
  return strictObject(properties);
}

export function buildHighFidelityReferenceRequest({ payload, env = process.env, evidenceRegistry = null } = {}) {
  const registry = evidenceRegistry || buildEvidenceAliasRegistry(collectEvidenceTokens(payload.highFidelityContext));
  const catalog = buildHighFidelityReferenceCatalog(payload.highFidelityContext, registry);
  const context = providerContext(payload.highFidelityContext, registry);
  const model = String(env.LLM_MODEL || "deepseek-v4-pro");
  const maxTokens = model.trim().toLowerCase() === "u2" ? 8000 : 2400;
  const tool = {
    type: "function",
    function: {
      name: HIGH_FIDELITY_TOOL_NAME,
      description: `Return one compact reference selection object for ${DEEP_ANALYSIS_EVIDENCE_CONTRACT_VERSION}. Do not generate free text or arrays. Use only catalog codes and request-scoped evidence aliases. Use fixed slots: themeCode1 is required and themeCode2/themeCode3 may be NONE; opportunityCode1-3 and actionCode1-3 are each a code or NONE; every other slot is a code or NONE, with representativeEvidenceAlias1 required and representativeEvidenceAlias2-8 optional. Never duplicate a non-NONE code. The server expands slots into readable analysis. Contract hash: ${DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH}.`,
      strict: true,
      parameters: buildHighFidelityReferenceSchema(registry.aliases),
    },
  };
  return {
    model,
    messages: [
      {
        role: "system",
        content: `Return exactly one ${HIGH_FIDELITY_TOOL_NAME} tool call and no prose. Return only enum codes and evidence aliases from the supplied catalog. Do not output arrays, natural-language strings, CRM identifiers, customer identity, exact values, or a second JSON document. Use fixed scalar slots only: themeCode1 is required; themeCode2 and themeCode3 are a theme code or NONE; opportunityCode1-3 and actionCode1-3 are a code or NONE; stakeholderCode1-3, blockerCode1-3, contradictionCode1-3, riskCode1-3, and limitationCode1-8 are a code or NONE; representativeEvidenceAlias1 is required and representativeEvidenceAlias2-8 are an alias or NONE. Never duplicate a non-NONE value. Choose only the most decision-relevant codes from the identity-redacted CRM business text and Timeline records. Use ${payload.responseLocale || "zh-CN"} when the server expands the result.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          analysisContextMode: HIGH_FIDELITY_MODE,
          responseLocale: payload.responseLocale || "zh-CN",
          contract: HIGH_FIDELITY_CONTRACT,
          evidenceContractVersion: DEEP_ANALYSIS_EVIDENCE_CONTRACT_VERSION,
          evidenceContractHash: DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
          evidenceAliases: registry.aliases,
          slotContract: {
            themeCode1: "required theme code",
            themeCode2: "theme code or NONE",
            themeCode3: "theme code or NONE",
            opportunityCode1: "opportunity code or NONE",
            opportunityCode2: "opportunity code or NONE",
            opportunityCode3: "opportunity code or NONE",
            actionCode1: "action code or NONE",
            actionCode2: "action code or NONE",
            actionCode3: "action code or NONE",
            representativeEvidenceAlias1: "required request-scoped alias",
            representativeEvidenceAlias2: "alias or NONE",
            representativeEvidenceAlias3: "alias or NONE",
            representativeEvidenceAlias4: "alias or NONE",
            representativeEvidenceAlias5: "alias or NONE",
            representativeEvidenceAlias6: "alias or NONE",
            representativeEvidenceAlias7: "alias or NONE",
            representativeEvidenceAlias8: "alias or NONE",
          },
          selectionCatalog: catalog.publicCatalog,
          context,
          boundaries: [
            "CRM业务原文和Timeline业务原文已经完成身份脱敏",
            "模型只能返回枚举代码和请求级证据别名",
            "服务端会根据选中代码确定性展开可读分析",
            "所有行动均为Draft Recommendation，不是CRM指令",
          ],
        }),
      },
    ],
    ...openAiCompatibleThinking(env),
    temperature: 0,
    max_tokens: boundedNumber(env.LLM_DEEP_ANALYSIS_MAX_TOKENS || 1200, 1200, 600, maxTokens),
    stream: false,
    tools: [tool],
    tool_choice: { type: "function", function: { name: HIGH_FIDELITY_TOOL_NAME } },
  };
}

export function buildHighFidelityRichToolRequest({ payload, env = process.env, evidenceRegistry = null } = {}) {
  const registry = evidenceRegistry || buildEvidenceAliasRegistry(collectEvidenceTokens(payload.highFidelityContext));
  const context = providerContext(payload.highFidelityContext, registry);
  const model = String(env.LLM_MODEL || "u2");
  const maxTokens = model.trim().toLowerCase() === "u2" ? 8000 : 4000;
  const tool = buildHighFidelityTool(registry.aliases);
  const contractPrompt = buildEvidenceContractPrompt(registry.aliases)
    .replace("Return one valid JSON object and no prose.", `Return the complete object as arguments to the forced ${HIGH_FIDELITY_TOOL_NAME} function call and no prose.`);
  return {
    model,
    messages: [
      {
        role: "system",
        content: `Return exactly one ${HIGH_FIDELITY_TOOL_NAME} function call and no prose. ${deepAnalysisOutputLanguage(payload.responseLocale)} Write a detailed, decision-useful analysis grounded in distinct evidence aliases. The executive summary should synthesize the situation, momentum, customer position, key blockers, and management implication. Timeline conclusion, customer position, and decision clarity should each explain the evidence-backed reasoning instead of repeating the summary. Populate 2-3 supported themes and, when evidence permits, 2-3 blockers, risks, opportunities, and 3-5 draft recommended actions with specific reasons. Do not pad unsupported sections, repeat sentences, identify the customer, output CRM identifiers, or claim CRM writeback. ${contractPrompt}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          analysisContextMode: HIGH_FIDELITY_MODE,
          responseLocale: payload.responseLocale || "zh-CN",
          contract: HIGH_FIDELITY_CONTRACT,
          evidenceContractVersion: DEEP_ANALYSIS_EVIDENCE_CONTRACT_VERSION,
          evidenceContractHash: DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
          evidenceAliases: registry.aliases,
          context,
          boundaries: [
            "Customer company, contact, email, phone, address, and CRM identifiers have been replaced with stable aliases.",
            "Timeline business text may be analyzed across records.",
            "Amounts, dates, routes, and commercial terms may be used for analysis.",
            "Every action is a Draft Recommendation, not a CRM instruction.",
            "Output request-scoped evidenceAliases only; never output safe evidence tokens or CRM identifiers.",
          ],
        }),
      },
    ],
    ...openAiCompatibleThinking(env),
    temperature: 0,
    max_tokens: boundedNumber(env.LLM_DEEP_ANALYSIS_MAX_TOKENS || 4000, 4000, 1200, maxTokens),
    stream: false,
    tools: [tool],
    tool_choice: { type: "function", function: { name: HIGH_FIDELITY_TOOL_NAME } },
  };
}

export function validateHighFidelityReferenceSelection(value, { aliases = [], timelineAliases = [], requireSlotShape = false } = {}) {
  const errors = [];
  const codes = highFidelityReferenceCodes();
  const normalized = normalizeReferenceSelectionShape(value, { aliases, requireSlotShape });
  if (!normalized.ok) return normalized;
  value = normalized.value;
  const expected = ["overallCode", "momentumCode", "customerPositionCode", "decisionClarityCode", "stakeholderCodes", "themeCodes", "blockerCodes", "commitmentCode", "contradictionCodes", "riskCodes", "opportunityCodes", "actionCodes", "representativeEvidenceAliases", "confidenceBand", "limitationCodes"];
  if (!isRecord(value)) return { ok: false, errors: ["selection_object_required"] };
  for (const key of expected) if (!Object.hasOwn(value, key)) errors.push(`missing:${key}`);
  for (const key of Object.keys(value)) if (!expected.includes(key)) errors.push(`unexpected:${key}`);
  const enumFields = {
    overallCode: codes.overall,
    momentumCode: codes.momentum,
    customerPositionCode: codes.customerPosition,
    decisionClarityCode: codes.decisionClarity,
    commitmentCode: codes.commitment,
    confidenceBand: codes.confidence,
  };
  for (const [key, allowed] of Object.entries(enumFields)) if (!allowed.includes(value[key])) errors.push(`enum:${key}`);
  const arrayFields = {
    stakeholderCodes: [codes.stakeholder, 3],
    themeCodes: [codes.themes, 3],
    blockerCodes: [codes.blockers, 3],
    contradictionCodes: [codes.contradictions, 3],
    riskCodes: [codes.blockers, 3],
    opportunityCodes: [codes.opportunities, 3],
    actionCodes: [codes.actions, 3],
    representativeEvidenceAliases: [aliases, 8],
    limitationCodes: [HIGH_FIDELITY_REFERENCE_LIMITATION_CODES, 8],
  };
  for (const [key, [allowed, maximum]] of Object.entries(arrayFields)) {
    const values = value[key];
    if (!Array.isArray(values)) { errors.push(`array:${key}`); continue; }
    if (values.length > maximum) errors.push(`max:${key}`);
    if (new Set(values).size !== values.length) errors.push(`duplicate:${key}`);
    if (values.some((item) => !allowed.includes(item))) errors.push(`enum_array:${key}`);
  }
  if (Array.isArray(value.themeCodes) && value.themeCodes.length === 0) errors.push("theme_required");
  if (Array.isArray(value.representativeEvidenceAliases) && value.representativeEvidenceAliases.length === 0) errors.push("evidence_required");
  if (timelineAliases.length && Array.isArray(value.representativeEvidenceAliases) && !value.representativeEvidenceAliases.some((alias) => timelineAliases.includes(alias))) errors.push("timeline_evidence_required");
  return { ok: errors.length === 0, errors: [...new Set(errors)], value };
}

function normalizeReferenceSelectionShape(value, { aliases = [], requireSlotShape = false } = {}) {
  if (!isRecord(value)) return { ok: false, errors: ["selection_object_required"] };
  const scalarFields = ["overallCode", "momentumCode", "customerPositionCode", "decisionClarityCode", "commitmentCode", "confidenceBand"];
  const arrayFields = {
    stakeholderCodes: ["stakeholderCode", 3],
    themeCodes: ["themeCode", 3, true],
    blockerCodes: ["blockerCode", 3],
    contradictionCodes: ["contradictionCode", 3],
    riskCodes: ["riskCode", 3],
    opportunityCodes: ["opportunityCode", 3],
    actionCodes: ["actionCode", 3],
    representativeEvidenceAliases: ["representativeEvidenceAlias", 8, true],
    limitationCodes: ["limitationCode", 8],
  };
  const slotKeys = Object.values(arrayFields).flatMap(([prefix, count]) => Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`));
  const hasSlotShape = slotKeys.some((key) => Object.hasOwn(value, key));
  if (!hasSlotShape) {
    if (requireSlotShape) return { ok: false, errors: ["selection_slots_required"] };
    return { ok: true, value };
  }
  const expected = [...scalarFields, ...slotKeys];
  const errors = [];
  for (const key of expected) if (!Object.hasOwn(value, key)) errors.push(`missing:${key}`);
  for (const key of Object.keys(value)) if (!expected.includes(key)) errors.push(`unexpected:${key}`);
  const normalized = Object.fromEntries(scalarFields.map((key) => [key, value[key]]));
  for (const [field, [prefix, count, requiredFirst]] of Object.entries(arrayFields)) {
    const values = [];
    for (let index = 1; index <= count; index += 1) {
      const key = `${prefix}${index}`;
      const item = value[key];
      if (typeof item !== "string") errors.push(`slot:${key}`);
      else if (requiredFirst && index === 1 && item === "NONE") errors.push(`required:${key}`);
      else if (item !== "NONE") values.push(item);
    }
    normalized[field] = values;
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], value: normalized };
}

function buildHighFidelityReferenceCatalog(context = {}, registry) {
  const codes = highFidelityReferenceCodes();
  const labels = {
    overall: Object.fromEntries(codes.overall.map((code) => [code, TIMELINE_EXECUTIVE_TEXT.overall[code]])),
    momentum: Object.fromEntries(codes.momentum.map((code) => [code, TIMELINE_EXECUTIVE_TEXT.momentum[code]])),
    customerPosition: Object.fromEntries(codes.customerPosition.map((code) => [code, TIMELINE_EXECUTIVE_TEXT.customerPosition[code]])),
    decisionClarity: Object.fromEntries(codes.decisionClarity.map((code) => [code, TIMELINE_EXECUTIVE_TEXT.decisionClarity[code]])),
    themes: Object.fromEntries(codes.themes.map((code) => [code, TIMELINE_EXECUTIVE_TEXT.themes[code]])),
    blockers: Object.fromEntries(codes.blockers.map((code) => [code, TIMELINE_EXECUTIVE_TEXT.blockers[code]])),
    opportunities: Object.fromEntries(codes.opportunities.map((code) => [code, TIMELINE_EXECUTIVE_TEXT.opportunities[code]])),
    actions: Object.fromEntries(codes.actions.map((code) => [code, TIMELINE_EXECUTIVE_TEXT.actions[code]])),
  };
  const timelineAliases = (context.timelineBusinessRecords || [])
    .map((item) => registry.safeTokenToAlias[item.evidenceToken])
    .filter(Boolean);
  return {
    codes,
    timelinePack: buildHighFidelityTimelinePack(context),
    timelineAliases,
    publicCatalog: { codes, labels, evidenceAliases: registry.aliases, timelineEvidenceAliases: timelineAliases },
  };
}

export function buildHighFidelityTimelinePack(context = {}) {
  const signals = Array.isArray(context.interactionSignals) ? context.interactionSignals : [];
  const signalIndex = buildTimelineSignalIndex(signals);
  const records = Array.isArray(context.timelineBusinessRecords) ? context.timelineBusinessRecords : [];
  let matchedSignalCount = 0;
  const evidence = records.map((item) => {
    const resolvedSignal = resolveTimelineSignal(item, signalIndex);
    if (resolvedSignal) matchedSignalCount += 1;
    const signal = resolvedSignal || {};
    const signalSummary = [signal.direction, signal.responseLevel, signal.sentiment, signal.issueCategory]
      .filter(Boolean).join("；");
    return {
      evidenceToken: item.evidenceToken,
      activityToken: item.evidenceToken,
      activityType: item.activityType,
      activityTypeLabel: item.activityType,
      businessDateBand: item.businessDate || "时间未记录",
      relativeTime: item.businessDate || "时间未记录",
      excerpt: [item.subject, item.businessText].filter(Boolean).join("："),
      semanticExcerpt: [item.subject, item.businessText].filter(Boolean).join("："),
      signalSummary,
      direction: signal.direction || "",
      customerResponse: signal.responseLevel || "",
      sentiment: signal.sentiment || "",
      commitmentMade: isBusinessSignalTrue(signal.commitmentMade),
      commitmentCompleted: isBusinessSignalTrue(signal.commitmentCompleted),
      commitmentDueBand: signal.commitmentDueDate ? "已记录期限" : "not-recorded",
      objectionCategory: isBusinessSignalTrue(signal.objectionPresent) ? "已记录异议" : "",
      serviceIssueCategory: signal.issueCategory || "",
      decisionMakerInvolved: isBusinessSignalTrue(signal.decisionMakerInvolved),
      competitorMentioned: false,
    };
  });
  const madeCount = evidence.filter((item) => item.commitmentMade).length;
  const completedCount = evidence.filter((item) => item.commitmentMade && item.commitmentCompleted).length;
  const digest = {
    totalActivityCount: evidence.length,
    structuredSignalCount: matchedSignalCount,
    commitmentStatus: { madeCount, completedCount, openCount: Math.max(0, madeCount - completedCount) },
    decisionMakerInvolved: evidence.some((item) => item.decisionMakerInvolved) ? "present" : "absent",
    objectionStatus: { presentCount: evidence.filter((item) => item.objectionCategory).length },
    serviceIssueStatus: { presentCount: evidence.filter((item) => item.serviceIssueCategory).length },
    activityMix: Object.fromEntries(evidence.reduce((map, item) => map.set(item.activityType, (map.get(item.activityType) || 0) + 1), new Map())),
  };
  const synthesis = buildTimelineExecutiveSynthesis({ evidence, digest });
  return { ...synthesis, evidence, coverage: { ...synthesis.coverage, structuredSignalCount: matchedSignalCount } };
}

function buildTimelineSignalIndex(signals) {
  const byToken = new Map();
  const byDateType = new Map();
  for (const signal of signals) {
    const token = normalizeTimelineToken(signal.activityToken);
    if (token && !byToken.has(token)) byToken.set(token, signal);
    const date = normalizeTimelineDate(signal.activityDate);
    const type = normalizeTimelineActivityType(signal.activityType);
    if (!date || !type) continue;
    const key = `${date}|${type}`;
    const matches = byDateType.get(key) || [];
    matches.push(signal);
    byDateType.set(key, matches);
  }
  return { byToken, byDateType };
}

function resolveTimelineSignal(item, index) {
  for (const candidate of [item.evidenceToken, item.activityToken]) {
    const signal = index.byToken.get(normalizeTimelineToken(candidate));
    if (signal) return signal;
  }
  const date = normalizeTimelineDate(item.businessDate || item.activityDate);
  const type = normalizeTimelineActivityType(item.activityType);
  if (!date || !type) return null;
  const matches = index.byDateType.get(`${date}|${type}`) || [];
  return matches.length === 1 ? matches[0] : null;
}

function normalizeTimelineToken(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeTimelineDate(value) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/u.test(text) ? text.slice(0, 10) : "";
}

function normalizeTimelineActivityType(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "4210") return "phonecall";
  if (text === "4201") return "appointment";
  if (text === "4212") return "task";
  if (/phone|call/u.test(text)) return "phonecall";
  if (/appointment|meeting|会议/u.test(text)) return "appointment";
  if (/task|任务/u.test(text)) return "task";
  if (/annotation|note|备注/u.test(text)) return "annotation";
  return text;
}

function highFidelityReferenceCodes() {
  return {
    overall: [...TIMELINE_EXECUTIVE_CODES.overall],
    momentum: [...TIMELINE_EXECUTIVE_CODES.momentum],
    customerPosition: [...TIMELINE_EXECUTIVE_CODES.customerPosition, "UNKNOWN"],
    decisionClarity: [...TIMELINE_EXECUTIVE_CODES.decisionClarity],
    stakeholder: [...TIMELINE_EXECUTIVE_CODES.stakeholder],
    themes: [...TIMELINE_EXECUTIVE_CODES.themes],
    blockers: [...TIMELINE_EXECUTIVE_CODES.blockers],
    commitment: [...TIMELINE_EXECUTIVE_CODES.commitment],
    contradictions: [...TIMELINE_EXECUTIVE_CODES.contradictions],
    opportunities: [...TIMELINE_EXECUTIVE_CODES.opportunities],
    actions: [...TIMELINE_EXECUTIVE_CODES.actions],
    confidence: ["HIGH", "MEDIUM", "LOW"],
  };
}

function expandHighFidelityReferenceSelection(value, registry, locale = "zh-CN") {
  const text = localizedTimelineText(locale);
  const ui = highFidelityUiText(locale);
  const aliases = value.representativeEvidenceAliases;
  const safeEvidenceTokens = aliases.map((alias) => registry.aliasToSafeToken[alias]).filter(Boolean);
  const refs = () => [...safeEvidenceTokens];
  const theme = (code) => ({ title: text.themes[code], analysis: text.themes[code], safeEvidenceTokens: refs() });
  const blocker = (code) => ({ analysis: text.blockers[code], safeEvidenceTokens: refs() });
  const contradiction = (code) => ({ analysis: code === "NONE" ? ui.noContradiction : `${ui.timelineReview}: ${code}`, confidenceBand: value.confidenceBand, safeEvidenceTokens: refs() });
  const opportunity = (code) => ({ analysis: text.opportunities[code], safeEvidenceTokens: refs() });
  const action = (code) => ({ action: text.actions[code], reason: ui.referenceActionReason, safeEvidenceTokens: refs() });
  const overall = text.overall[value.overallCode];
  return {
    executiveSummary: `${overall} ${text.momentum[value.momentumCode]} ${text.customerPosition[value.customerPositionCode]}`,
    timelineConclusion: overall,
    customerPosition: text.customerPosition[value.customerPositionCode],
    decisionClarity: text.decisionClarity[value.decisionClarityCode],
    keyThemes: value.themeCodes.slice(0, 3).map(theme),
    blockers: value.blockerCodes.slice(0, 3).map(blocker),
    contradictions: value.contradictionCodes.filter((code) => code !== "NONE").slice(0, 3).map(contradiction),
    risks: value.riskCodes.slice(0, 3).map(blocker),
    opportunities: value.opportunityCodes.filter((code) => code !== "NONE").slice(0, 3).map(opportunity),
    recommendedActions: value.actionCodes.slice(0, 3).map(action),
    safeEvidenceTokens,
    confidenceBand: value.confidenceBand,
    limitations: value.limitationCodes.map((code) => ui.limitations[code] || code),
  };
}

async function runHighFidelityToolExternal({ payload, requestId, env = process.env, fetchImpl = globalThis.fetch, signal } = {}) {
  const validation = validateHighFidelityProviderPayload(payload);
  if (!validation.ok) return fail("high_fidelity_context_blocked", { validation });
  const evidenceRegistry = buildEvidenceAliasRegistry(collectEvidenceTokens(payload.highFidelityContext));
  const transport = highFidelityTransport(env);
  const richToolTransport = transport === HIGH_FIDELITY_RICH_TOOL_TRANSPORT;
  const catalog = richToolTransport ? null : buildHighFidelityReferenceCatalog(payload.highFidelityContext, evidenceRegistry);
  const requestBody = richToolTransport
    ? buildHighFidelityRichToolRequest({ payload, env, evidenceRegistry })
    : buildHighFidelityReferenceRequest({ payload, env, evidenceRegistry });
  const requestBodyHash = sha256(JSON.stringify(requestBody));
  const requestSchemaHash = sha256(JSON.stringify(requestBody.tools[0].function.parameters));
  const baseUrl = String(env.LLM_BASE_URL || "").replace(/\/$/u, "");
  if (!baseUrl || !env.LLM_API_KEY) return fail("external_provider_not_configured", { requestBodyHash, requestSchemaHash });
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timeoutMs = boundedNumber(env.LLM_TIMEOUT_MS || 60000, 60000, 100, 120000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify(requestBody),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const endpointAlias = richToolTransport ? "openai-compatible-high-fidelity-rich-tool" : "deepseek-beta-high-fidelity-reference";
      const errorObservation = await observeProviderError(response, { requestCorrelation: requestId, endpointAlias, modelAlias: env.LLM_MODEL || "deepseek-v4-flash", requestSchemaHash, requestBodyHash });
      return fail(`provider_http_${response.status}`, { called: true, httpStatus: response.status, errorObservation, requestBodyHash, requestSchemaHash, latencyMs });
    }
    const rawResponse = await response.text();
    const responseBodyHash = sha256(rawResponse);
    let envelope;
    try { envelope = JSON.parse(rawResponse); } catch { return fail("provider_response_not_json", { called: true, httpStatus: response.status, responseBodyHash, requestBodyHash, requestSchemaHash, latencyMs }); }
    const choices = Array.isArray(envelope?.choices) ? envelope.choices : [];
    const functionCall = choices[0]?.message?.tool_calls?.[0]?.function;
    const toolCalls = choices[0]?.message?.tool_calls;
    const observation = {
      httpStatus: response.status,
      modelAlias: typeof envelope?.model === "string" ? envelope.model : (env.LLM_MODEL || "deepseek-v4-flash"),
      choiceCount: choices.length,
      finishReason: choices[0]?.finish_reason || "",
      toolCallsCount: Array.isArray(toolCalls) ? toolCalls.length : 0,
      toolCallType: toolCalls?.[0]?.type || "",
      functionName: functionCall?.name || "",
      argumentsType: typeof functionCall?.arguments,
      argumentsLength: typeof functionCall?.arguments === "string" ? functionCall.arguments.length : 0,
      argumentsHash: typeof functionCall?.arguments === "string" ? sha256(functionCall.arguments) : "",
      responseBodyHash,
      responseId: typeof envelope?.id === "string" ? envelope.id : "",
      latencyMs,
      tokenUsage: sanitizeUsage(envelope?.usage),
      referenceOnlyTransport: !richToolTransport,
      richToolTransport,
    };
    if (observation.finishReason !== "tool_calls") return fail("tool_call_not_completed", { called: true, observation, requestBodyHash, requestSchemaHash });
    if (!Array.isArray(toolCalls) || toolCalls.length !== 1 || observation.toolCallType !== "function") return fail("tool_call_shape_invalid", { called: true, observation, requestBodyHash, requestSchemaHash });
    if (observation.functionName !== HIGH_FIDELITY_TOOL_NAME) return fail("tool_name_invalid", { called: true, observation, requestBodyHash, requestSchemaHash });
    if (observation.argumentsType !== "string") return fail("argument_type_invalid", { called: true, observation, requestBodyHash, requestSchemaHash });
    const parsed = parseStrictToolArguments(functionCall.arguments, { observation });
    if (!parsed.ok) return fail(parsed.category.toLowerCase(), { called: true, diagnosticCategory: parsed.category, observation: parsed.observation, requestBodyHash, requestSchemaHash });
    if (richToolTransport) {
      const initialValidation = validateHighFidelitySelection(parsed.value, { aliases: evidenceRegistry.aliases });
      const boundedSelection = normalizeRichToolSelection(parsed.value, initialValidation);
      const selectionValidation = boundedSelection.applied
        ? validateHighFidelitySelection(boundedSelection.value, { aliases: evidenceRegistry.aliases })
        : initialValidation;
      if (!selectionValidation.ok) return fail("argument_schema_invalid", { called: true, observation: parsed.observation, validation: selectionValidation, requestBodyHash, requestSchemaHash });
      return {
        ok: true,
        called: true,
        selection: normalizeEvidenceSelection(boundedSelection.value, evidenceRegistry.aliasToSafeToken),
        observation: parsed.observation,
        requestBodyHash,
        requestSchemaHash,
        requestId,
        payload,
        evidenceContractHash: DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
        evidenceAliasCount: evidenceRegistry.aliases.length,
        evidenceDeduplicationApplied: boundedSelection.evidenceAliasesApplied,
        richToolTransport: true,
      };
    }
    const selectionValidation = validateHighFidelityReferenceSelection(parsed.value, { aliases: evidenceRegistry.aliases, timelineAliases: catalog.timelineAliases, requireSlotShape: true });
    if (!selectionValidation.ok) return fail("argument_schema_invalid", { called: true, observation: parsed.observation, validation: selectionValidation, requestBodyHash, requestSchemaHash });
    return {
      ok: true,
      called: true,
      selection: expandHighFidelityReferenceSelection(selectionValidation.value, evidenceRegistry, payload.responseLocale),
      observation: parsed.observation,
      requestBodyHash,
      requestSchemaHash,
      requestId,
      evidenceContractHash: DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
      evidenceAliasCount: evidenceRegistry.aliases.length,
      referenceOnlyTransport: true,
    };
  } catch (error) {
    return fail(error?.name === "AbortError" ? "provider_timeout" : "provider_network_error", { called: true, requestBodyHash, requestSchemaHash, latencyMs: Date.now() - started });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function runHighFidelityExternal({ payload, requestId, env = process.env, fetchImpl = globalThis.fetch, signal } = {}) {
  const transport = highFidelityTransport(env);
  if (transport === HIGH_FIDELITY_REFERENCE_TRANSPORT || transport === HIGH_FIDELITY_RICH_TOOL_TRANSPORT) {
    return runHighFidelityToolExternal({ payload, requestId, env, fetchImpl, signal });
  }
  const validation = validateHighFidelityProviderPayload(payload);
  if (!validation.ok) return fail("high_fidelity_context_blocked", { validation });
  const evidenceRegistry = buildEvidenceAliasRegistry(collectEvidenceTokens(payload.highFidelityContext));
  const requestBody = buildHighFidelityRequest({ payload, env, evidenceRegistry });
  const requestBodyHash = sha256(JSON.stringify(requestBody));
  const requestSchemaHash = sha256(JSON.stringify(buildHighFidelityEvidenceSchema(evidenceRegistry.aliases)));
  const baseUrl = String(env.LLM_BASE_URL || "").replace(/\/$/u, "");
  if (!baseUrl || !env.LLM_API_KEY) return fail("external_provider_not_configured", { requestBodyHash, requestSchemaHash });
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timeoutMs = boundedNumber(env.LLM_TIMEOUT_MS || 60000, 60000, 100, 120000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify(requestBody),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const errorObservation = await observeProviderError(response, { requestCorrelation: requestId, endpointAlias: "deepseek-beta-high-fidelity", modelAlias: env.LLM_MODEL || "deepseek-v4-pro", requestSchemaHash, requestBodyHash });
      return fail(`provider_http_${response.status}`, { called: true, httpStatus: response.status, errorObservation, requestBodyHash, requestSchemaHash, latencyMs });
    }
    const rawResponse = await response.text();
    const responseBodyHash = sha256(rawResponse);
    let envelope;
    try { envelope = JSON.parse(rawResponse); } catch { return fail("provider_response_not_json", { called: true, httpStatus: response.status, responseBodyHash, requestBodyHash, requestSchemaHash, latencyMs }); }
    const choices = Array.isArray(envelope?.choices) ? envelope.choices : [];
    const message = choices[0]?.message;
    const content = message?.content;
    const observation = {
      httpStatus: response.status,
      modelAlias: typeof envelope?.model === "string" ? envelope.model : (env.LLM_MODEL || "deepseek-v4-pro"),
      choiceCount: choices.length,
      finishReason: choices[0]?.finish_reason || "",
      messageContentPresent: Object.hasOwn(message || {}, "content"),
      messageContentType: typeof content,
      messageContentLength: typeof content === "string" ? content.length : 0,
      messageContentHash: typeof content === "string" ? sha256(content) : "",
      responseBodyHash,
      responseId: typeof envelope?.id === "string" ? envelope.id : "",
      latencyMs,
      tokenUsage: sanitizeUsage(envelope?.usage),
      estimatedCost: estimateCost(envelope?.usage, env),
    };
    if (observation.finishReason === "length") return fail("output_truncated", { called: true, observation, requestBodyHash, requestSchemaHash });
    if (typeof content !== "string") return fail("message_content_type_invalid", { called: true, observation, requestBodyHash, requestSchemaHash });
    if (!content.trim()) return fail("message_content_empty", { called: true, observation, requestBodyHash, requestSchemaHash });
    const parsedContent = parseHighFidelityJsonContent(content, observation);
    if (!parsedContent.ok) {
      return fail("message_content_json_invalid", {
        called: true,
        diagnosticCategory: "MESSAGE_CONTENT_JSON_INVALID",
        observation: parsedContent.observation,
        requestBodyHash,
        requestSchemaHash,
      });
    }
    const selection = parsedContent.value;
    const selectionValidation = validateHighFidelitySelection(selection, { aliases: evidenceRegistry.aliases });
    if (!selectionValidation.ok) return fail("argument_schema_invalid", { called: true, observation, validation: selectionValidation, evidenceContractHash: DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH, evidenceAliasCount: evidenceRegistry.aliases.length, requestBodyHash, requestSchemaHash });
    const normalizedSelection = normalizeEvidenceSelection(selection, evidenceRegistry.aliasToSafeToken);
    return {
      ok: true,
      called: true,
      selection: normalizedSelection,
      observation,
      requestBodyHash,
      requestSchemaHash,
      requestId,
      payload,
      evidenceContractHash: DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
      evidenceAliasCount: evidenceRegistry.aliases.length,
      evidenceDeduplicationApplied: false,
    };
  } catch (error) {
    return fail(error?.name === "AbortError" ? "provider_timeout" : "provider_network_error", { called: true, requestBodyHash, requestSchemaHash, latencyMs: Date.now() - started });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function highFidelityTransport(env = process.env) {
  const requested = String(env.DEEP_ANALYSIS_HIGH_FIDELITY_TRANSPORT || "json").trim().toLowerCase();
  if (requested === HIGH_FIDELITY_REFERENCE_TRANSPORT) return HIGH_FIDELITY_REFERENCE_TRANSPORT;
  if (requested === HIGH_FIDELITY_RICH_TOOL_TRANSPORT) return HIGH_FIDELITY_RICH_TOOL_TRANSPORT;
  return "json";
}

export function validateHighFidelitySelection(value, options = {}) {
  const normalizedOptions = Array.isArray(options) ? { aliases: options } : options;
  const result = validateEvidenceContract(value, { aliases: normalizedOptions.aliases || [] });
  const errors = [...new Set(result.diagnostics.map((diagnostic) => diagnosticFieldError(diagnostic)))];
  return { ...result, errors };
}

function normalizeRichToolSelection(value, validation) {
  const diagnostics = Array.isArray(validation?.diagnostics) ? validation.diagnostics : [];
  const evidenceAliasPath = /^#\/(?:evidenceAliases|(?:keyThemes|blockers|contradictions|risks|opportunities|recommendedActions)\/\d+\/evidenceAliases)(?:\/\d+)?$/u;
  const themeTitlePath = /^#\/keyThemes\/\d+\/title$/u;
  const optionalEmptyArrayPath = /^#\/(blockers|contradictions|risks|opportunities|recommendedActions|limitations)$/u;
  const isEvidenceAliasDiagnostic = (item) => (
    (item.reasonCode === "MAX_ITEMS" || item.reasonCode === "DUPLICATE_ALIAS")
    && evidenceAliasPath.test(item.instancePath || "")
  );
  const isThemeTitleDiagnostic = (item) => (
    (item.reasonCode === "MISSING_PROPERTY" || item.reasonCode === "TEXT_INVALID")
    && themeTitlePath.test(item.instancePath || "")
  );
  const isOmittedOptionalArrayDiagnostic = (item) => {
    const match = optionalEmptyArrayPath.exec(item.instancePath || "");
    return Boolean(
      match
      && (item.reasonCode === "MISSING_PROPERTY" || item.reasonCode === "ARRAY_INVALID")
      && !Object.hasOwn(value, match[1])
    );
  };
  const repairable = diagnostics.length > 0 && diagnostics.every((item) => (
    isEvidenceAliasDiagnostic(item)
    || isThemeTitleDiagnostic(item)
    || isOmittedOptionalArrayDiagnostic(item)
  ));
  if (!repairable || !isRecord(value)) return { value, applied: false, evidenceAliasesApplied: false };

  const boundAliases = (aliases) => Array.isArray(aliases) ? [...new Set(aliases)].slice(0, 4) : aliases;
  const normalized = { ...value, evidenceAliases: boundAliases(value.evidenceAliases) };
  for (const field of ["blockers", "contradictions", "risks", "opportunities", "recommendedActions", "limitations"]) {
    if (!Object.hasOwn(value, field)) normalized[field] = [];
  }
  for (const field of ["keyThemes", "blockers", "contradictions", "risks", "opportunities", "recommendedActions"]) {
    if (!Array.isArray(normalized[field])) continue;
    normalized[field] = normalized[field].map((item) => {
      if (!isRecord(item)) return item;
      const normalizedItem = { ...item, evidenceAliases: boundAliases(item.evidenceAliases) };
      if (field === "keyThemes" && (typeof item.title !== "string" || !item.title.trim())) {
        normalizedItem.title = themeTitleFromAnalysis(item.analysis);
      }
      return normalizedItem;
    });
  }
  return {
    value: normalized,
    applied: true,
    evidenceAliasesApplied: diagnostics.some(isEvidenceAliasDiagnostic),
  };
}

function themeTitleFromAnalysis(value) {
  const analysis = typeof value === "string" ? value.trim() : "";
  const [firstClause = ""] = analysis.split(/[\r\n。！？；]+/u);
  return crop(firstClause.trim() || analysis, 80);
}

export function mapHighFidelitySelection({ selection, payload, requestId, model = "deepseek-v4-pro" } = {}) {
  const locale = normalizeDeepAnalysisLocale(payload.responseLocale);
  const text = deepAnalysisText(locale);
  const ui = highFidelityUiText(locale);
  const context = payload.highFidelityContext;
  const timeline = Array.isArray(context.timelineBusinessRecords) ? context.timelineBusinessRecords : [];
  const timelinePack = buildHighFidelityTimelinePack(context);
  const timelineEvidenceByToken = new Map((timelinePack.evidence || []).map((item) => [item.evidenceToken, item]));
  const selectedTokens = new Set(selection.safeEvidenceTokens);
  const enrichTimelineEvidence = (items) => items.map((item) => ({ ...item, ...(timelineEvidenceByToken.get(item.evidenceToken) || {}) }));
  const selectedTimeline = enrichTimelineEvidence(timelinePack.representativeEvidence.filter((item) => selectedTokens.has(item.evidenceToken)).slice(0, 8));
  const fallbackTimeline = enrichTimelineEvidence(timelinePack.representativeEvidence.slice(0, 8));
  const evidence = (selectedTimeline.length ? selectedTimeline : fallbackTimeline).map((item) => ({
    evidenceToken: item.evidenceToken,
    relativeTime: item.relativeTime || item.businessDate || ui.businessDateMissing,
    activityType: item.activityType || "Timeline",
    summary: crop([item.summary, item.excerpt, item.signalSummary].filter(Boolean).join("；"), 3000),
    supports: [ui.timelineOriginal],
  }));
  const references = selection.safeEvidenceTokens;
  const makeItems = (items, prefix) => uniqueModelItems(items).map((item, index) => ({ code: `${prefix}-${index + 1}`, label: crop(dedupeNarrative(item.title || item.analysis), 300), statement: crop(dedupeNarrative(item.analysis), 300), evidenceTokens: item.safeEvidenceTokens }));
  const commitment = timelinePack.commitmentSummary || {};
  const synthesis = {
    overallConclusion: crop(dedupeNarrative(selection.timelineConclusion), 3000),
    overallCode: "HIGH_FIDELITY_TEXT",
    momentumTrend: { code: "HIGH_FIDELITY_TEXT", statement: crop(dedupeNarrative(selection.executiveSummary), 1000) },
    customerPosition: { code: "HIGH_FIDELITY_TEXT", statement: crop(dedupeNarrative(selection.customerPosition), 1000) },
    decisionClarity: { code: "HIGH_FIDELITY_TEXT", statement: crop(dedupeNarrative(selection.decisionClarity), 1000) },
    stakeholderDynamics: { code: "HIGH_FIDELITY_TEXT", statement: crop(dedupeNarrative(selection.customerPosition), 1000), roles: [] },
    keyThemes: makeItems(selection.keyThemes, "HF-THEME"),
    topBlockers: makeItems(selection.blockers, "HF-BLOCKER"),
    commitmentSummary: {
      code: timelinePack.commitmentSummary?.code || "HIGH_FIDELITY_TEXT",
      statement: `${ui.commitmentSummary} ${formatCommitmentCounts(commitment, locale)}`,
      madeCount: Number(commitment.madeCount || 0),
      completedCount: Number(commitment.completedCount || 0),
      openCount: Number(commitment.openCount || 0),
    },
    contradictions: makeItems(selection.contradictions, "HF-CONTRADICTION"),
    opportunitySignals: uniqueModelItems(selection.opportunities).map((item, index) => ({ code: `HF-OPPORTUNITY-${index + 1}`, statement: crop(dedupeNarrative(item.analysis), 300), evidenceTokens: item.safeEvidenceTokens })),
    managementActions: uniqueModelItems(selection.recommendedActions).slice(0, 3).map((item, index) => ({ code: `HF-ACTION-${index + 1}`, statement: crop(item.action, 300), status: "Draft", evidenceTokens: item.safeEvidenceTokens })),
    confidence: { level: confidenceText(selection.confidenceBand, text), reason: ui.evidenceConfidence },
    coverage: { ...timelinePack.coverage, level: timeline.length ? ui.timelineConnected : ui.noTimeline, activityCount: timeline.length, eventCount: timeline.length, representativeEvidenceCount: evidence.length },
    representativeEvidenceTokens: evidence.map((item) => item.evidenceToken),
    limitations: selection.limitations,
    representativeEvidence: evidence,
  };
  const crmFacts = flattenFacts(context.businessFacts, "highFidelity.crm.business").concat(flattenFacts(context.financialFacts, "highFidelity.crm.financial")).concat(flattenFacts(context.routeAndCommercialTerms, "highFidelity.crm.commercial"));
  const enrichedByToken = new Map((timelinePack.evidence || timelinePack.representativeEvidence).map((item) => [item.evidenceToken, item]));
  const timelineFacts = timeline.map((item) => {
    const enriched = enrichedByToken.get(item.evidenceToken);
    const value = [item.subject, item.businessText, enriched?.signalSummary ? `结构化信号：${enriched.signalSummary}` : ""].filter(Boolean).join(ui.separator);
    return { label: `${item.activityType} ${ui.businessOriginal}`, value: crop(value || ui.notReturned, 3000), source: `highFidelity.timeline.${item.evidenceToken}`, sourceType: "crm_current" };
  });
  return {
    requestId,
    templateCode: payload.templateCode,
    templateVersion: payload.templateVersion,
    title: text.title[payload.templateCode] || ui.defaultTitle,
    executiveSummary: crop(selection.executiveSummary, 3000),
    crmFacts,
    timelineFacts,
    timelineFindings: [],
    timelineExecutiveSynthesis: synthesis,
    timelineEvidence: evidence,
    customerHistoryFacts: [],
    externalFacts: [],
    internalCapabilityFacts: [],
    aiInferences: [
      { label: text.inferenceLabel, statement: crop(dedupeNarrative(selection.customerPosition), 3000), evidenceRefs: references },
      { label: text.inferenceLabel, statement: crop(dedupeNarrative(selection.decisionClarity), 3000), evidenceRefs: references },
    ],
    risks: selection.risks.map((item) => crop(dedupeNarrative(item.analysis), 3000)),
    opportunities: selection.opportunities.map((item) => crop(dedupeNarrative(item.analysis), 3000)),
    scenarios: [{ name: text.scenario.baseline, direction: text.scenario.stable, summary: ui.baselineScenario }, { name: text.scenario.optimistic, direction: text.scenario.improve, summary: ui.optimisticScenario }, { name: text.scenario.risk, direction: text.scenario.worsen, summary: ui.riskScenario }],
    recommendedActions: selection.recommendedActions.map((item) => ({ action: crop(dedupeNarrative(item.action), 3000), reason: crop(dedupeNarrative(item.reason), 3000), suggestedRole: text.pendingRole, suggestedHorizon: text.pendingHorizon, evidenceRefs: item.safeEvidenceTokens, source: text.source, status: "Draft" })),
    confidence: { level: confidenceText(selection.confidenceBand, text), reason: ui.highFidelityConfidence },
    limitations: [...selection.limitations, ui.singleOpportunityLimitation],
    sources: [...crmFacts.map((item) => ({ type: ui.crmBusinessFact, ref: item.source })), ...timelineFacts.map((item) => ({ type: ui.timelineBusinessOriginal, ref: item.source }))],
    provider: { used: "openai-compatible", policy: "server-side-high-fidelity-identity-redacted", model, externalModelCalled: true },
    safety: {
      safeContextUsed: true,
      analysisContextMode: HIGH_FIDELITY_MODE,
      crmBusinessTextIncluded: true,
      timelineBusinessTextIncluded: true,
      exactAmountIncluded: true,
      exactDateIncluded: true,
      routeAndCommercialTermsIncluded: true,
      customerCompanyMasked: true,
      customerContactMasked: true,
      rawUnredactedCustomerIdentitySent: false,
      identityRedactedBusinessTextSent: true,
      customerIdentitySent: false,
      crmWritebackEnabled: false,
      externalLlmEnabled: true,
    },
  };
}

function providerContext(context = {}, registry) {
  const { confirmation: _confirmation, residualScan: _residualScan, ...safe } = context;
  return aliasEvidenceReferences(safe, registry);
}

function aliasEvidenceReferences(value, registry, parentKey = "") {
  if (Array.isArray(value)) return value.map((item) => aliasEvidenceReferences(item, registry, parentKey));
  if (!isRecord(value)) return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (["evidenceToken", "activityToken", "sourceToken", "safeEvidenceToken"].includes(key)) {
      const alias = typeof child === "string" ? registry.safeTokenToAlias[child] : null;
      output[key === "evidenceToken" ? "evidenceAlias" : key === "activityToken" ? "sourceEvidenceAlias" : "evidenceAlias"] = alias || null;
      continue;
    }
    if (key === "evidenceTokens" || key === "safeEvidenceTokens" || key === "sourceEvidenceTokens") {
      const aliases = Array.isArray(child) ? child.map((token) => registry.safeTokenToAlias[token]).filter(Boolean) : [];
      output[key === "sourceEvidenceTokens" ? "sourceEvidenceAliases" : "evidenceAliases"] = aliases;
      continue;
    }
    output[key] = aliasEvidenceReferences(child, registry, key || parentKey);
  }
  return output;
}

function collectEvidenceTokens(context = {}) {
  const timeline = Array.isArray(context.timelineBusinessRecords) ? context.timelineBusinessRecords.map((item) => item.evidenceToken) : [];
  return [...new Set([...timeline, "highFidelity.crm.business", "highFidelity.crm.financial", "highFidelity.crm.commercial"].filter((item) => typeof item === "string" && item.length > 0))].sort();
}

function diagnosticFieldError(diagnostic) {
  if (diagnostic.reasonCode === "UNEXPECTED_PROPERTY") return "output_shape_invalid";
  const match = /^#\/(executiveSummary|timelineConclusion|customerPosition|decisionClarity|keyThemes|blockers|contradictions|risks|opportunities|recommendedActions|evidenceAliases|confidenceBand|limitations)/u.exec(diagnostic.instancePath || "");
  return match ? `${match[1]}_invalid` : "output_schema_invalid";
}

function flattenFacts(value, prefix) { return Object.entries(value || {}).filter(([, item]) => item !== null && item !== undefined && item !== "" && !Array.isArray(item)).map(([label, item]) => ({ label, value: crop(String(item), 3000), source: `${prefix}.${label}`, sourceType: "crm_current" })); }
function confidenceText(value, text = deepAnalysisText("zh-CN")) { return text.confidence[value] || text.confidence.MEDIUM; }
function dedupeNarrative(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const parts = text.split(/\n+|(?<=[。！？；])\s*/u).map((part) => part.trim()).filter(Boolean);
  const seen = new Set();
  return parts.filter((part) => {
    const key = part.replace(/[\s，。！？；：:、,.!?]/gu, "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(" ");
}
function uniqueModelItems(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const identity = [item?.analysis || item?.action || item?.title, item?.reason]
      .filter(Boolean)
      .join("|")
      .trim()
      .replace(/\s+/gu, " ");
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
function formatCommitmentCounts(commitment = {}, locale = "zh-CN") {
  const made = Number(commitment.madeCount || 0);
  const completed = Number(commitment.completedCount || 0);
  const open = Number(commitment.openCount || 0);
  if (locale === "en-US") return `Made ${made}; completed ${completed}; open ${open}.`;
  if (locale === "ja-JP") return `作成 ${made} 件・完了 ${completed} 件・未完了 ${open} 件。`;
  return `已作出 ${made} 项 · 已完成 ${completed} 项 · 未完成 ${open} 项。`;
}

function highFidelityUiText(locale) {
  const normalized = normalizeDeepAnalysisLocale(locale);
  if (normalized === "en-US") return { noContradiction: "No clear contradiction was found.", timelineReview: "Timeline requires review", referenceActionReason: "This recommendation is deterministically expanded from the Timeline code and request-scoped evidence aliases selected by the model.", limitations: { NO_CUSTOMER_HISTORY: "Customer history is not connected.", NO_EXTERNAL_INTELLIGENCE: "External industry intelligence is not connected.", NO_INTERNAL_CAPABILITY: "Internal capability knowledge is not connected.", HUMAN_REVIEW_REQUIRED: "Conclusions and actions require human review.", LIMITED_TIMELINE_COVERAGE: "Timeline coverage is limited and confidence has been reduced." }, businessDateMissing: "Business date not returned", separator: ": ", timelineOriginal: "Identity-redacted Timeline original", commitmentSummary: "Commitments, due dates and completion status are synthesized from the Timeline business text.", evidenceConfidence: "The high-fidelity business text is identity redacted and the model cited request-scoped evidence tokens.", timelineConnected: "High-fidelity Timeline connected", noTimeline: "No Timeline", businessOriginal: "business original", notReturned: "Not returned", defaultTitle: "High-fidelity CRM Deep Analysis", baselineScenario: "The current synthesis is based on identity-redacted business text and requires human review.", optimisticScenario: "Progress conditions may improve if key commitments are completed by their business dates.", riskScenario: "Progress risk may increase if Timeline blockers and contradictions remain unresolved.", highFidelityConfidence: "High-fidelity mode uses only identity-redacted CRM business text and evidence tokens.", singleOpportunityLimitation: "High-fidelity mode runs for the current opportunity only and does not write back to CRM.", crmBusinessFact: "Identity-redacted CRM business fact", timelineBusinessOriginal: "Identity-redacted Timeline business original" };
  if (normalized === "ja-JP") return { noContradiction: "明確な矛盾は確認されませんでした。", timelineReview: "Timelineの確認が必要", referenceActionReason: "この提案は、モデルが選択したTimelineコードとリクエスト範囲の証拠エイリアスから決定論的に展開されます。", limitations: { NO_CUSTOMER_HISTORY: "顧客履歴は未接続です。", NO_EXTERNAL_INTELLIGENCE: "外部業界情報は未接続です。", NO_INTERNAL_CAPABILITY: "社内能力知識は未接続です。", HUMAN_REVIEW_REQUIRED: "結論とアクションには人手レビューが必要です。", LIMITED_TIMELINE_COVERAGE: "Timelineカバレッジが限定的なため、信頼度を下げています。" }, businessDateMissing: "業務日付未返却", separator: "：", timelineOriginal: "ID匿名化Timeline原文", commitmentSummary: "約束、期限、完了状態はTimeline業務原文から総合判断しています。", evidenceConfidence: "高精度業務原文はID匿名化され、モデルはリクエスト範囲の証拠Tokenを引用しています。", timelineConnected: "高精度Timeline接続済み", noTimeline: "Timelineなし", businessOriginal: "業務原文", notReturned: "未返却", defaultTitle: "高精度CRM詳細分析", baselineScenario: "ID匿名化業務原文に基づく現在の総合判断であり、人手レビューが必要です。", optimisticScenario: "主要な約束が業務日付どおりに実行されれば、進行条件が改善する可能性があります。", riskScenario: "Timelineの阻害要因と矛盾が未解決の場合、進行リスクが拡大する可能性があります。", highFidelityConfidence: "高精度モードはID匿名化されたCRM業務原文と証拠Tokenのみを使用します。", singleOpportunityLimitation: "高精度モードは現在の1商談だけに実行され、CRMへ書き戻しません。", crmBusinessFact: "ID匿名化CRM業務事実", timelineBusinessOriginal: "ID匿名化Timeline業務原文" };
  return { noContradiction: "当前未发现明确矛盾。", timelineReview: "Timeline 需要核对", referenceActionReason: "该建议由模型选择的 Timeline 代码和请求级证据别名确定性展开。", limitations: { NO_CUSTOMER_HISTORY: "客户历史尚未接入。", NO_EXTERNAL_INTELLIGENCE: "外部行业情报尚未接入。", NO_INTERNAL_CAPABILITY: "内部能力知识尚未接入。", HUMAN_REVIEW_REQUIRED: "结论和行动均需人工复核。", LIMITED_TIMELINE_COVERAGE: "Timeline 覆盖有限，置信度已下调。" }, businessDateMissing: "业务日期未返回", separator: "：", timelineOriginal: "Timeline 原文（身份脱敏）", commitmentSummary: "承诺、截止日期和完成状态基于 Timeline 业务原文综合判断。", evidenceConfidence: "高保真业务原文已身份脱敏，并由模型引用请求范围内证据 Token。", timelineConnected: "高保真 Timeline 已接入", noTimeline: "无 Timeline", businessOriginal: "业务原文", notReturned: "未返回", defaultTitle: "高保真 CRM 深度分析", baselineScenario: "基于身份脱敏业务原文的当前综合判断，需人工复核。", optimisticScenario: "关键承诺按业务日期落实后，推进条件可能改善。", riskScenario: "若 Timeline 中的阻塞和矛盾未解决，推进风险可能扩大。", highFidelityConfidence: "高保真模式仅使用身份脱敏后的 CRM 业务原文和证据 Token。", singleOpportunityLimitation: "高保真模式仅对当前单条 Opportunity 执行，不构成 CRM 写回。", crmBusinessFact: "身份脱敏 CRM 业务事实", timelineBusinessOriginal: "身份脱敏 Timeline 业务原文" };
}
function crop(value, length) { return String(value || "").slice(0, length); }
function boundedNumber(value, fallback, min, max) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback; }
function sanitizeUsage(value) { if (!value || typeof value !== "object") return null; const keys = ["prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens"]; const output = Object.fromEntries(keys.filter((key) => Number.isFinite(Number(value[key]))).map((key) => [key, Number(value[key])])); return Object.keys(output).length ? output : null; }
function estimateCost(usage, env) { const total = Number(usage?.total_tokens); const perThousand = Number(env.LLM_ESTIMATED_COST_PER_1K_USD || 0); return Number.isFinite(total) && Number.isFinite(perThousand) ? Number((total / 1000 * perThousand).toFixed(8)) : null; }
function sha256(value) { return createHash("sha256").update(String(value), "utf8").digest("hex"); }
function parseHighFidelityJsonContent(content, observation = {}) {
  const normalized = content.replace(/^\uFEFF/u, "").trim();
  try {
    const value = JSON.parse(normalized);
    return { ok: true, value, observation: { ...observation, jsonParseErrorType: null, jsonParseErrorPosition: null } };
  } catch (error) {
    return {
      ok: false,
      observation: {
        ...observation,
        jsonParseErrorType: error?.name || "SyntaxError",
        jsonParseErrorPosition: parseJsonErrorPosition(error),
      },
    };
  }
}
function parseJsonErrorPosition(error) {
  const message = String(error?.message || "");
  const match = /position\s+(\d+)/iu.exec(message);
  return match ? Number(match[1]) : null;
}
function addReferenceSlots(properties, prefix, values, count, { requiredFirst = false } = {}) {
  for (let index = 1; index <= count; index += 1) {
    const optional = !requiredFirst || index > 1;
    properties[`${prefix}${index}`] = {
      type: "string",
      description: optional ? "Select one catalog value or NONE." : "Select one required catalog value.",
      enum: optional ? ["NONE", ...values] : [...values],
    };
  }
}

function strictObject(properties) { return { type: "object", properties, required: Object.keys(properties), additionalProperties: false }; }
function enumSchema(values) { return { type: "string", enum: [...values] }; }
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function fail(reason, extra = {}) { return { ok: false, ...extra, reason }; }
