import { enrichLogisticsOpportunity, stableTokenFragment } from "./logisticsFields.mjs";
import { opportunityFieldMapping } from "./fieldMapping/opportunityFieldMapping.mjs";
import { formattedValue, isActiveTrialMapping, isTrialLogicalNameConfirmed, normalizeChoice, normalizeLookup } from "./fieldMapping/safeTransforms.mjs";

const stageByProbability = [
  { min: 80, stage: "L5 Won" },
  { min: 60, stage: "L4 Quotation" },
  { min: 35, stage: "L3 Proposal" },
  { min: 15, stage: "L2 Need Confirmed" },
  { min: 0, stage: "L1 Initial Contact" },
];

export function mapDynamicsOpportunity(row, index = 0, now = new Date()) {
  const sourceId = row.opportunityid || `DYN-${String(index + 1).padStart(4, "0")}`;
  const seed = `${sourceId}|${row.name || ""}`;
  const shortId = stableTokenFragment(seed);
  const revenue = Number(row.estimatedvalue || 0);
  const probability = Number(row.closeprobability || 0);
  const expectedDate = normalizeDate(row.estimatedclosedate);
  const stage = stageFromProbability(probability, row.statecode);
  const customerLookup = normalizeLookup(row._customerid_value, formattedValue(row, "_customerid_value"), "CUST");
  const ownerLookup = normalizeLookup(row._ownerid_value, formattedValue(row, "_ownerid_value"), "OWNER");
  const mappedFields = mapFieldsFromRow(row);
  const missingFlags = missingDemoFlags(mappedFields);

  return enrichLogisticsOpportunity({
    id: `DYN-${shortId}`,
    is_ai_demo: String(row.name || "").startsWith("[AI-DEMO]"),
    opportunity_name: safeOpportunityName(shortId),
    company: "Dynamics 365 Sales Trial",
    customer_code: customerLookup.token || `CUST-${shortId}`,
    customer_name: `Tokenized Customer ${shortId}`,
    contact_name: `Tokenized Contact ${shortId}`,
    contact_email: "removed",
    phone: "removed",
    exact_revenue: revenue,
    exact_margin: syntheticMargin(probability, revenue),
    supplier_cost: 0,
    contract_text: "removed",
    expected_order_date: expectedDate,
    owner_name: `Owner ${shortId}`,
    owner_id: ownerLookup.token || `OWNER-${stableTokenFragment(row._ownerid_value || `owner-${index}`)}`,
    department: "Dynamics Sales",
    stage,
    risk_level: riskLevel({ expectedDate, probability, revenue, stage }, now),
    customer_need: "Dynamics opportunity imported through read-only Dataverse connection.",
    proposal_content: "Safe mapped sales opportunity. Raw Dataverse customer, owner, and contact values are not exposed to AI.",
    ...presentFields(mappedFields),
    progressSummary: mappedFields.sanitizedProgressSummary || "",
    opportunity_name: safeOpportunityName(shortId),
    opportunityName: safeOpportunityName(shortId),
    customerRef: customerLookup.token,
    customerToken: customerLookup.token || `CUST-${shortId}`,
    contactStatus: mappedFields.contactStatus || "not_provided",
    ownerToken: ownerLookup.token || `OWNER-${stableTokenFragment(row._ownerid_value || `owner-${index}`)}`,
    opportunityStage: mappedFields.opportunityStage || stage,
    winProbability: normalizedWinProbability(mappedFields.winProbability, probability),
    estimatedQuoteBand: revenue,
    expectedOrderDate: expectedDate,
    source: "dynamics",
    created_on: normalizeDate(row.createdon),
    modified_on: normalizeDate(row.modifiedon),
    status_code: row.statuscode ?? "",
    state_code: row.statecode ?? "",
    data_quality_flags: missingFlags,
  }, index, now);
}

export function mapDynamicsOpportunities(rows, now = new Date()) {
  return rows.map((row, index) => mapDynamicsOpportunity(row, index, now));
}

function safeOpportunityName(shortId) {
  return `Dynamics Opportunity ${shortId}`;
}

function mapFieldsFromRow(row) {
  const mapped = {};
  for (const field of opportunityFieldMapping) {
    if (field.sourceSystem !== "sales_trial_d365" || !isActiveTrialMapping(field) || !isTrialLogicalNameConfirmed(field) || !field.d365Name) continue;
    const raw = row[field.d365Name];
    const label = formattedValue(row, field.d365Name);
    const value = normalizeField(raw, label, field);
    mapped[field.appName] = value;
    if (field.crmDataKey && value !== null && value !== undefined && value !== "") mapped[field.crmDataKey] = crmDataValue(value, field);
  }
  return mapped;
}

function presentFields(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

function normalizeField(raw, label, field) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (field.type === "choice") return normalizeChoice(raw, label, field.choiceOptions).normalized;
  if (field.type === "lookup") return normalizeLookup(raw, label, tokenPrefix(field)).token;
  if (["currency", "decimal", "number", "wholeNumber"].includes(field.type)) return Number(raw);
  if (field.type === "date") return normalizeDate(raw);
  if (field.type === "yesNo") return normalizeYesNo(raw, label);
  if (field.type === "token") return normalizeLookup(raw, label, tokenPrefix(field)).token;
  return String(label || raw);
}

function crmDataValue(value, field) {
  if (field.type === "lookup") return value;
  return value;
}

function missingDemoFlags(mappedFields) {
  return opportunityFieldMapping
    .filter((field) => field.requiredForDemo && (mappedFields[field.appName] === null || mappedFields[field.appName] === undefined || mappedFields[field.appName] === ""))
    .map((field) => `missing_${field.appName}`);
}

function normalizeYesNo(raw, label) {
  const text = String(label || raw).toLowerCase();
  if (["true", "yes", "1", "是"].includes(text)) return "Yes";
  if (["false", "no", "0", "否"].includes(text)) return "No";
  return String(label || raw);
}

function tokenPrefix(field) {
  if (field.appName.toLowerCase().includes("customer")) return "CUST";
  if (field.appName.toLowerCase().includes("owner")) return "OWNER";
  if (field.appName.toLowerCase().includes("pol") || field.appName.toLowerCase().includes("pod")) return "PORT";
  return "TOKEN";
}

function stageFromProbability(probability, stateCode) {
  if (Number(stateCode) === 1) return "L5 Won";
  return stageByProbability.find((item) => probability >= item.min)?.stage || "L1 Initial Contact";
}

function winProbabilityFromProbability(probability) {
  if (probability >= 90) return "Z";
  if (probability >= 70) return "A";
  if (probability >= 50) return "B";
  if (probability >= 30) return "C";
  if (probability >= 10) return "D";
  return "Y";
}

function normalizedWinProbability(mappedValue, probability) {
  if (["Z", "A", "B", "C", "D", "Y"].includes(mappedValue)) return mappedValue;
  return winProbabilityFromProbability(probability);
}

function riskLevel({ expectedDate, probability, revenue, stage }, now) {
  if (stage === "L5 Won") return "Low";
  const overdueDays = dateDiffDays(expectedDate, now) * -1;
  if (overdueDays > 14 && revenue >= 5000000) return "Critical";
  if (overdueDays > 0 && probability < 40) return "High";
  if (revenue >= 5000000 && probability < 50) return "High";
  if (overdueDays > 0 || probability < 35) return "Medium";
  return "Low";
}

function syntheticMargin(probability, revenue) {
  if (revenue >= 5000000 && probability < 40) return 0.07;
  if (probability >= 70) return 0.15;
  if (probability >= 45) return 0.11;
  return 0.08;
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function dateDiffDays(dateString, now) {
  const date = new Date(`${dateString}T00:00:00`);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}
