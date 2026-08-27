import { enrichLogisticsOpportunity } from "../logisticsFields.mjs";

export const DEFAULT_SEED = 20260711;
export const DEFAULT_COUNT = 54;
export const MIN_COUNT = 10;
export const MAX_COUNT = 100;

export function generateSyntheticOpportunities(templates, { count = DEFAULT_COUNT, seed = DEFAULT_SEED } = {}) {
  validateTemplates(templates);
  const total = Number(count);
  if (!Number.isInteger(total) || total < MIN_COUNT || total > MAX_COUNT) {
    throw new Error(`Synthetic opportunity count must be between ${MIN_COUNT} and ${MAX_COUNT}.`);
  }

  return Array.from({ length: total }, (_, index) => {
    const number = index + 1;
    const serial = String(number).padStart(3, "0");
    const template = templates[index % templates.length];
    const variation = stableNumber(`${seed}|${number}`);
    const exactRevenue = 500000 + (variation % 56) * 100000;
    const exactMargin = Number((0.04 + (variation % 13) / 100).toFixed(2));
    const month = String(7 + (index % 5)).padStart(2, "0");
    const day = String(10 + (index % 18)).padStart(2, "0");
    const opportunityName = `[AI-DEMO] Opportunity ${serial}`;
    const stage = ["L1 Initial Contact", "L2 Need Confirmed", "L3 Proposal", "L4 Quotation", "L5 Won"][index % 5];
    const riskLevel = stage !== "L5 Won" && exactRevenue >= 4500000 ? "Critical" : stage !== "L5 Won" && exactMargin < 0.08 ? "High" : exactMargin < 0.1 ? "Medium" : "Low";

    return enrichLogisticsOpportunity({
      ...template,
      id: `DEMO-OPP-${serial}`,
      is_ai_demo: true,
      name: opportunityName,
      opportunity_name: opportunityName,
      company: `Demo Region ${String((index % 4) + 1).padStart(2, "0")}`,
      department: template.business_segment,
      customer_code: `DEMO-CUST-${serial}`,
      customer_name: `Demo Customer ${serial}`,
      contact_name: `Demo Contact ${serial}`,
      contact_email: `demo-contact-${serial}@example.invalid`,
      phone: `DEMO-PHONE-${serial}`,
      detailed_address: `Demo Region ${String((index % 4) + 1).padStart(2, "0")}`,
      exact_revenue: exactRevenue,
      exact_margin: exactMargin,
      supplier_cost: Math.round(exactRevenue * (1 - exactMargin)),
      contract_text: `Synthetic demo agreement ${serial}`,
      contract_price: exactRevenue,
      expected_order_date: `2026-${month}-${day}`,
      owner_name: `Demo Owner ${String((index % 8) + 1).padStart(2, "0")}`,
      owner_id: `DEMO-OWNER-${String((index % 8) + 1).padStart(2, "0")}`,
      modified_on: `2026-07-${String(1 + (index % 9)).padStart(2, "0")}`,
      stage,
      risk_level: riskLevel,
      customer_need: number % 9 === 0 ? "Renewal" : template.customer_need,
      recurring_type: number % 7 === 0 ? "Annual Tender" : number % 2 === 0 ? "Recurring" : "One-time",
      data_quality_flags: number % 11 === 0 ? ["stale_activity"] : [],
      source: "synthetic-generator",
    }, index, new Date("2026-07-01T00:00:00Z"));
  });
}

export function validateTemplates(templates) {
  if (!Array.isArray(templates) || templates.length < 5 || templates.length > 10) throw new Error("Repository fixture must contain 5 to 10 templates.");
  for (const [index, item] of templates.entries()) {
    const serialized = JSON.stringify(item);
    if (item.is_ai_demo !== true || !String(item.name || "").startsWith("[AI-DEMO]")) throw new Error(`Template ${index + 1} is not explicitly AI-DEMO.`);
    if (!String(item.id || "").startsWith("DEMO-TEMPLATE-")) throw new Error(`Template ${index + 1} has an unsafe ID.`);
    if (item.contact_email && !String(item.contact_email).endsWith("@example.invalid")) throw new Error(`Template ${index + 1} has a non-reserved email.`);
    if (item.phone && !String(item.phone).startsWith("DEMO-PHONE-")) throw new Error(`Template ${index + 1} has a phone-like value.`);
    if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(serialized)) throw new Error(`Template ${index + 1} contains a CRM-like GUID.`);
  }
  return true;
}

function stableNumber(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
