export const providerAllowedFields = [
  "opportunityToken",
  "customerToken",
  "ownerToken",
  "opportunityStage",
  "winProbability",
  "priority",
  "customerNeed",
  "proposalContent",
  "estimatedQuoteBand",
  "budgetAmountBand",
  "expectedOrderStatus",
  "organizationGroup",
  "bookingDepartment",
  "salesDepartment",
  "decisionMakerStatus",
  "transportMode",
  "sanitizedDescription",
  "sanitizedProgressSummary",
  "dataQualityFlags",
  "badges",
  "riskBadges",
];

const aliases = {
  opportunityToken: ["opportunityToken", "opportunity_token"],
  customerToken: ["customerToken", "customer_token"],
  ownerToken: ["ownerToken", "owner_token"],
  opportunityStage: ["opportunityStage", "stage"],
  winProbability: ["winProbability"],
  priority: ["priority"],
  customerNeed: ["customerNeed", "customer_need"],
  proposalContent: ["proposalContent", "proposal_content"],
  estimatedQuoteBand: ["estimatedQuoteBand", "revenue_band"],
  budgetAmountBand: ["budgetAmountBand"],
  expectedOrderStatus: ["expectedOrderStatus", "expected_order_status"],
  organizationGroup: ["organizationGroup"],
  bookingDepartment: ["bookingDepartment"],
  salesDepartment: ["salesDepartment"],
  decisionMakerStatus: ["decisionMakerStatus"],
  transportMode: ["transportMode", "transport_mode"],
  sanitizedDescription: ["sanitizedDescription"],
  sanitizedProgressSummary: ["sanitizedProgressSummary"],
  dataQualityFlags: ["dataQualityFlags", "data_quality_flags"],
  badges: ["badges"],
  riskBadges: ["riskBadges", "risk_badges"],
};

const forbiddenKeys = [
  "raw_dataverse_row",
  "customer_name",
  "contact_name",
  "contact_email",
  "phone",
  "address",
  "detailed_address",
  "exact_revenue",
  "exact_margin",
  "supplier_cost",
  "contract_text",
  "contract_price",
  "meeting_transcript",
  "raw_timeline",
  "raw_email_body",
  "raw_phone_call_body",
  "raw_task_body",
  "attachment_content",
  "contract_original",
];

const safePhoneScanFields = new Set([
  "opportunityToken",
  "customerToken",
  "ownerToken",
  "opportunityStage",
  "winProbability",
  "priority",
  "estimatedQuoteBand",
  "budgetAmountBand",
  "expectedOrderStatus",
  "dataQualityFlags",
  "badges",
  "riskBadges",
  "selectedLanguage",
]);

const forbiddenValueChecks = [
  { key: "email", reason: "Blocked sensitive provider value: possible email", test: (value) => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) },
  { key: "phone", reason: "Blocked sensitive provider value: possible phone number", test: (value, path) => !path.some((item) => safePhoneScanFields.has(item)) && hasPossiblePhoneNumber(value) },
  { key: "exact_amount", reason: "Blocked sensitive provider value: possible exact amount", test: (value) => /\b(?:cny|rmb|usd|eur|jpy|¥|\$)\s?\d{4,}/i.test(value) || /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/.test(value) },
  { key: "raw_timeline", reason: "Blocked sensitive provider value: raw timeline", test: (value) => /raw\s*timeline/i.test(value) },
  { key: "raw_email_body", reason: "Blocked sensitive provider value: raw email body", test: (value) => /raw\s*email\s*body/i.test(value) },
  { key: "raw_phone_call_body", reason: "Blocked sensitive provider value: raw phone call body", test: (value) => /raw\s*phone\s*call\s*body/i.test(value) },
  { key: "raw_task_body", reason: "Blocked sensitive provider value: raw task body", test: (value) => /raw\s*task\s*body/i.test(value) },
  { key: "contract_or_attachment", reason: "Blocked sensitive provider value: contract or attachment content", test: (value) => /contract\s*text|attachment\s*content/i.test(value) },
  { key: "address", reason: "Blocked sensitive provider value: possible detailed address", test: (value) => /detailed\s*address/i.test(value) },
];

export function buildProviderPromptPayload({ safePayload = {}, language = "zh-CN", functionName = "case-summary", question = "", minimalJson = false } = {}) {
  const source = unwrapSafePayload(safePayload);
  const projected = projectAllowedFields(source);
  const providerPayload = Array.isArray(projected) ? { safeOpportunityContext: projected } : projected;
  providerPayload.selectedLanguage = normalizeLanguage(language);
  const contentValidation = containsForbiddenProviderContent(providerPayload);
  if (!contentValidation.ok) {
    return {
      providerPayload,
      messages: [],
      validation: contentValidation,
      safePayloadKeys: Array.isArray(safePayload?.safeOpportunityContext) ? ["safeOpportunityContext"] : Object.keys(providerPayload),
    };
  }

  return {
    providerPayload,
    messages: [
      { role: "system", content: buildSystemPrompt(providerPayload.selectedLanguage) },
      {
        role: "user",
        content: buildUserPrompt({ functionName, question, providerPayload, minimalJson }),
      },
    ],
    validation: { ok: true },
    safePayloadKeys: Array.isArray(safePayload?.safeOpportunityContext) ? ["safeOpportunityContext"] : Object.keys(providerPayload),
  };
}

export function containsForbiddenProviderContent(value) {
  const serialized = JSON.stringify(value || {});
  const lower = serialized.toLowerCase();
  const blockedKey = forbiddenKeys.find((key) => lower.includes(`"${key.toLowerCase()}"`));
  if (blockedKey) return { ok: false, reason: `Blocked sensitive provider key: ${blockedKey}`, blockedPatternKey: `key:${blockedKey}` };
  for (const entry of flattenStringValues(value)) {
    const blocked = forbiddenValueChecks.find((check) => check.test(entry.value, entry.path));
    if (blocked) return { ok: false, reason: blocked.reason, blockedPatternKey: blocked.key };
  }
  return { ok: true };
}

function flattenStringValues(value, path = []) {
  if (value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number") return [{ value: String(value), path }];
  if (Array.isArray(value)) return value.flatMap((item, index) => flattenStringValues(item, [...path, String(index)]));
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => flattenStringValues(item, [...path, key]));
  }
  return [];
}

function hasPossiblePhoneNumber(value) {
  const normalized = String(value || "");
  const candidates = normalized.match(/(?:\+\d{1,3}[\s.-]*)?(?:\(?0\d{2,3}\)?[\s.-]*)?\d[\d\s().-]{8,}\d/g) || [];
  return candidates.some((candidate) => isPhoneCandidate(candidate));
}

function isPhoneCandidate(candidate) {
  if (isSafeNumericBusinessValue(candidate)) return false;
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 10) return false;
  if (/^1[3-9]\d{9}$/.test(digits)) return true;
  if (/^(?:86)?1[3-9]\d{9}$/.test(digits)) return true;
  if (/^0\d{9,11}$/.test(digits) && /[-()\s]/.test(candidate)) return true;
  if (/^\d{10,13}$/.test(digits) && candidate.trim().startsWith("+")) return true;
  return false;
}

function isSafeNumericBusinessValue(value) {
  const trimmed = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    || /^due_in_\d+_days$/i.test(trimmed)
    || /^\d+\s+days?\s+overdue$/i.test(trimmed)
    || /^\d+%?-\d+%$/.test(trimmed)
    || /^\d+M-\d+M$/i.test(trimmed)
    || /^[A-Z]+-\d{4}-\d{4}$/i.test(trimmed)
    || /^L[1-5]$/i.test(trimmed)
    || /^margin band \d+%?-\d+%$/i.test(trimmed);
}

function projectAllowedFields(source) {
  if (Array.isArray(source)) return source.map((item) => projectAllowedFields(item));
  if (!source || typeof source !== "object") return {};
  return Object.fromEntries(providerAllowedFields.flatMap((field) => {
    const value = firstPresent(source, aliases[field] || [field]);
    return value === undefined || value === null || value === "" ? [] : [[field, value]];
  }));
}

function unwrapSafePayload(safePayload) {
  if (Array.isArray(safePayload?.safeOpportunityContext)) return safePayload.safeOpportunityContext;
  if (safePayload?.safeOpportunityContext && typeof safePayload.safeOpportunityContext === "object") return safePayload.safeOpportunityContext;
  return safePayload || {};
}

function firstPresent(source, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  }
  return undefined;
}

function normalizeLanguage(language) {
  return ["zh-CN", "ja-JP", "en-US"].includes(language) ? language : "zh-CN";
}

function buildSystemPrompt(language) {
  return [
    "Return ONLY valid JSON. No markdown. No explanation. No code fence.",
    "You are CRM AI Gateway's sales assistant.",
    "Use only the provided Safe Context. Raw CRM data was not sent.",
    "Do not infer or reveal real customer names, contact names, phone numbers, emails, detailed addresses, exact amounts, raw timeline, email/phone/task bodies, contract text, or attachment content.",
    "Do not use markdown.",
    "Do not wrap output in ```json or any code fence.",
    "Do not add text before or after the JSON object.",
    "Do not add Chinese explanation paragraphs outside JSON.",
    `Respond in ${language}. Only change the output language; do not translate tokens, amount bands, schema keys, or Safe Context keys.`,
    "Return strict JSON with keys: summary, findings, risks, recommendedActions, requiredMaterials, managementEscalation, safetyNote.",
    'safetyNote must be exactly "raw CRM data not sent".',
  ].join("\n");
}

function buildUserPrompt({ functionName, question, providerPayload, minimalJson }) {
  const contract = minimalJson
    ? {
      summary: "ok",
      findings: [],
      risks: [],
      recommendedActions: [],
      requiredMaterials: [],
      managementEscalation: false,
      safetyNote: "raw CRM data not sent",
    }
    : {
      summary: "",
      findings: [],
      risks: [],
      recommendedActions: [],
      requiredMaterials: [],
      managementEscalation: false,
      safetyNote: "raw CRM data not sent",
    };
  return [
    JSON.stringify({
      task: minimalJson ? "minimal-json-connectivity-check" : functionName,
      question: minimalJson ? "Return the minimal JSON responseContract exactly." : String(question || "").slice(0, 500),
      responseContract: contract,
      safeOpportunityContext: providerPayload,
    }),
    "Your response must start with { and end with }.",
  ].join("\n");
}
