import { buildCrmData, buildSafeOpportunityContext } from "./fieldMapping/safeTransforms.mjs";

export const roles = ["Sales Owner", "Sales Manager", "Read-only User", "CRM Admin"];

export const sensitiveKeys = [
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
];

export const blockedPayloadKeys = [
  "customer_name",
  "contact_email",
  "phone",
  "address",
  "detailed_address",
  "exact_revenue",
  "exact_margin",
  "supplier_cost",
  "contract_text",
  "contract_price",
];

export function transformOpportunity(raw, role, now = new Date()) {
  if (!roles.includes(role)) throw new Error(`Unsupported role: ${role}`);

  const mapped = buildSafeOpportunityContext(raw, { now, role });
  const revenueBand = bandRevenue(Number(raw.exact_revenue || 0));
  const marginBand = bandMargin(Number(raw.exact_margin || 0));
  const expectedOrderStatus = relativeDateStatus(raw.expected_order_date, now);
  const removedFields = [...new Set(["contact_email", "phone", "supplier_cost", "contract_text", ...mapped.removedFields])];
  const transformRows = mapped.transformRows;

  const payload = {
    opportunity_id: raw.id,
    opportunity_name: mapped.safeOpportunityContext.sanitizedOpportunityTitle || raw.id,
    customer_token: customerToken(raw.id),
    department: role === "Sales Manager" ? `${raw.department} department summary` : raw.department,
    stage: raw.stage,
    risk_level: raw.risk_level,
    transport_mode: raw.transport_mode,
    expected_order_status: expectedOrderStatus,
    revenue_band: revenueBand,
    customer_need_summary: summarize(raw.customer_need),
    proposal_summary: summarize(raw.proposal_content),
    safeOpportunityContext: mapped.safeOpportunityContext,
  };

  if (role === "CRM Admin") {
    payload.contact_token = contactToken(raw.id);
    payload.owner_label = roleSafeOwner(raw);
    payload.removed_fields = removedFields;
  } else if (role === "Read-only User") {
    payload.contact_status = "removed";
    payload.owner_token = ownerToken(raw.owner_id);
  } else {
    payload.contact_token = contactToken(raw.id);
    payload.owner_label = roleSafeOwner(raw);
    payload.margin_band = marginBand;
  }

  if (role === "Sales Manager") payload.department_scope = raw.department;

  const checklist = buildChecklist(payload);
  return {
    role,
    opportunity_id: raw.id,
    raw,
    crmData: buildCrmData(raw),
    transformRows,
    safePayload: payload,
    checklist,
    removedFields,
    transformedFields: mapped.transformedFields,
    safeOpportunityContext: mapped.safeOpportunityContext,
    raw_data_sent: false,
    safe_context_used: true,
    provider: "demo",
    external_model_called: false,
    blocked: !checklist.every((item) => item.pass),
  };
}

export function validateSafePayload(payload) {
  const payloadForAi = { ...payload };
  delete payloadForAi.removed_fields;
  const serialized = JSON.stringify(payloadForAi).toLowerCase();
  const blockedKey = blockedPayloadKeys.find((key) => Object.prototype.hasOwnProperty.call(payloadForAi, key) || serialized.includes(`"${key.toLowerCase()}"`));
  if (blockedKey) return { ok: false, reason: `Blocked sensitive key in Safe AI Payload: ${blockedKey}` };

  const blockedValueHints = [
    "@",
    "contract text",
    "supplier_cost",
    "exact_revenue",
    "exact_margin",
    "contract_price",
    "detailed_address",
    "+86",
    "+1",
    "+34",
  ];
  const blockedHint = blockedValueHints.find((hint) => serialized.includes(hint));
  if (blockedHint) return { ok: false, reason: `Blocked sensitive value pattern in Safe AI Payload: ${blockedHint}` };
  return { ok: true };
}

export function generateDemoAi(functionName, safePayload) {
  const validation = validateSafePayload(safePayload);
  if (!validation.ok) return { blocked: true, error: validation.reason };
  return {
    blocked: false,
    mode: "Demo AI",
    functionName,
    title: titleFor(functionName),
    output: legacyOutput(functionName, safePayload),
    usedPayloadKeys: Object.keys(safePayload),
  };
}

function legacyOutput(functionName, safePayload) {
  const name = safePayload.opportunity_name || safePayload.opportunity_id;
  const risk = safePayload.risk_level;
  const revenue = safePayload.revenue_band;
  const margin = safePayload.margin_band || "not visible for this role";
  const due = safePayload.expected_order_status;
  return {
    "case-summary": `${name} is at ${safePayload.stage} with ${revenue} revenue potential. Customer and contact identities are tokenized before AI use.`,
    "risk-analysis": `Risk level is ${risk}. Main indicators are expected order status ${due}, stage ${safePayload.stage}, and margin band ${margin}.`,
    "next-best-action": `Confirm quotation feedback, update expected order status, and prepare a service-stability explanation for ${safePayload.customer_token}.`,
    "draft-follow-up-email": `Subject: Follow-up on ${safePayload.transport_mode} proposal\n\nDear ${safePayload.customer_token},\n\nThank you for reviewing our proposal. We will follow up on service scope, schedule stability, and next decision timing. No personal contact data or exact commercial values are included in this draft.`,
    "meeting-report-note": `${safePayload.customer_token}: ${name}. Status ${safePayload.stage}; risk ${risk}; recommended management focus is follow-up on ${due} and next action confirmation.`,
  }[functionName] || `${name} is at ${safePayload.stage} with ${revenue} revenue potential. Customer and contact identities are tokenized before AI use.`;
}

function customerToken(id = "OPP-001") {
  return `CUST-${id.split("-")[1] || "001"}`;
}

function contactToken(id = "OPP-001") {
  return `CONTACT-${id.split("-")[1] || "001"}`;
}

function ownerToken(ownerId = "OWNER-001") {
  return ownerId.replace("OWNER", "OWNER-TOKEN");
}

function roleSafeOwner(raw) {
  return raw.owner_id === "OWNER-001" ? "Current user owner" : "Assigned CRM owner";
}

function bandRevenue(value) {
  if (value < 1000000) return "<1M";
  if (value < 3000000) return "1M-3M";
  if (value < 5000000) return "3M-5M";
  return "5M+";
}

function bandMargin(value) {
  if (value < 0.05) return "<5%";
  if (value < 0.1) return "5%-10%";
  if (value < 0.15) return "10%-15%";
  return "15%+";
}

function relativeDateStatus(dateString, now) {
  const date = new Date(`${dateString}T00:00:00`);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `overdue_${Math.abs(days)}_days`;
  if (days === 0) return "due_today";
  return `due_in_${days}_days`;
}

function summarize(text = "") {
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function buildChecklist(payload) {
  const serialized = JSON.stringify(payload).toLowerCase();
  return [
    { label: "No customer name", pass: !serialized.includes("customer_name") },
    { label: "No contact email", pass: !serialized.includes("@") && !serialized.includes("contact_email") },
    { label: "No detailed address", pass: !serialized.includes("detailed_address") && !serialized.includes("address") },
    { label: "No exact revenue", pass: !serialized.includes("exact_revenue") },
    { label: "No exact margin", pass: !serialized.includes("exact_margin") },
    { label: "No supplier cost", pass: !serialized.includes("supplier_cost") },
    { label: "No contract text", pass: !serialized.includes("contract_text") },
    { label: "No contract price", pass: !serialized.includes("contract_price") },
  ];
}

function titleFor(functionName) {
  return {
    "case-summary": "Case Summary",
    "risk-analysis": "Risk Analysis",
    "next-best-action": "Next Best Action",
    "draft-follow-up-email": "Draft Follow-up Email",
    "meeting-report-note": "Meeting Report Note",
  }[functionName] || "AI Output";
}
