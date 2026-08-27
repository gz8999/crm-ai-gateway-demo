import { createHash } from "node:crypto";
import { normalizeId } from "../../pilot/pilotContract.mjs";

export const HIGH_FIDELITY_MODE = "high_fidelity_identity_redacted";
export const STANDARD_SAFE_MODE = "standard_safe";
export const REDACTION_RULE_VERSION = "identity-redaction-v1";

export function isBusinessSignalTrue(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) return false;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y", "是", "有", "已作出", "已完成", "已参与", "存在", "present", "made", "completed"].includes(normalized);
}

const GUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const PHONE_PATTERN = /(?<!\d)(?!\d{4}-\d{2}-\d{2})(?:\+?\d[\d ()-]{6,}\d)(?!\d)/gu;
const URL_QUERY_SECRET_PATTERN = /([?&](?:token|secret|key|api_key|access_token|client_secret|customer|account|contact|client|tenant|org|organization)=)[^&#\s]+/giu;
const CREDENTIAL_PATTERN = /(?:bearer\s+[A-Z0-9._-]+|sk-[A-Z0-9._-]+|(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*[^\s,;]+)/giu;
const DIRECT_ACCOUNT_ID_PATTERN = /((?:合同(?:编号|号)|客户(?:编号|号)|账号)\s*[:：#]?\s*)[A-Z0-9][A-Z0-9-]{2,}/giu;

export function buildHighFidelityContext({ data, scope, opportunityToken, now = new Date(), diagnostics = false } = {}) {
  if (!data || !scope) throw new TypeError("High fidelity context requires an authorized server snapshot.");
  const opportunityEntry = data.entries.Opportunity.find((entry) => entry.token === opportunityToken);
  if (!opportunityEntry) throw new Error("High fidelity opportunity is outside the frozen allowlist.");
  const opportunityRow = data.opportunities.find((row) => normalizeId(row.opportunityid) === normalizeId(opportunityEntry.id));
  if (!opportunityRow) throw new Error("High fidelity opportunity record is unavailable.");
  const accountId = normalizeId(opportunityRow._parentaccountid_value);
  const contactId = normalizeId(opportunityRow._parentcontactid_value);
  const identity = buildStableIdentityDictionary(data);
  const account = data.accounts.find((row) => normalizeId(row.accountid) === accountId) || {};
  const contact = data.contacts.find((row) => normalizeId(row.contactid) === contactId) || {};
  const opportunitySignals = data.signals.filter((row) => normalizeId(row._aigw_opportunityid_value) === normalizeId(opportunityEntry.id));
  const actual = data.actuals.find((row) => normalizeId(row._aigw_opportunityid_value) === normalizeId(opportunityEntry.id)) || null;
  const coverages = data.coverages.filter((row) => normalizeId(row._aigw_accountid_value) === accountId);
  const timelineEntries = data.entries.Timeline.filter((entry) => normalizeId(entry.parentId) === normalizeId(opportunityEntry.id));
  const activities = data.timeline.activities.filter((row) => normalizeId(row._regardingobjectid_value) === normalizeId(opportunityEntry.id));
  const annotations = data.timeline.annotations.filter((row) => normalizeId(row._objectid_value) === normalizeId(opportunityEntry.id));
  const timeline = [...activities.map((row) => timelineRecord(row, timelineEntries, identity)), ...annotations.map((row) => timelineRecord(row, timelineEntries, identity))]
    .sort((left, right) => String(left.businessDate).localeCompare(String(right.businessDate)) || left.evidenceToken.localeCompare(right.evidenceToken));
  const safeContext = scope.contexts.find((item) => item.opportunityToken === opportunityToken);
  if (!safeContext) throw new Error("High fidelity opportunity is outside the department scope.");
  const allowedSafeTokens = uniqueIdentityValues([
    opportunityToken,
    safeContext.accountToken,
    safeContext.customerToken,
    safeContext.safeContext?.accountToken,
    safeContext.safeContext?.customerToken,
  ]);
  const redacted = {
    analysisContextMode: HIGH_FIDELITY_MODE,
    redactionRuleVersion: REDACTION_RULE_VERSION,
    opportunityToken,
    customerToken: safeContext.customerToken,
    department: safeContext.salesDepartment,
    stage: safeContext.stage,
    opportunityState: safeContext.opportunityState,
    businessFacts: {
      opportunitySubject: redact(opportunityRow.name, identity),
      opportunityDescription: redact(opportunityRow.description, identity),
      customer: identity.accountPseudonyms.get(accountId) || "CUSTOMER-COMPANY-REDACTED",
      contact: identity.contactPseudonyms.get(contactId) || "CUSTOMER-CONTACT-REDACTED",
      contactRole: redact(contact.jobtitle, identity),
      state: safeContext.opportunityState,
      stage: safeContext.stage,
      priority: safeContext.priority,
      forecastCategory: safeContext.forecastCategory,
      nextAction: redact(opportunityRow.aigw_nextaction, identity),
      nextActionDate: dateOnly(opportunityRow.aigw_nextactiondate),
      estimatedCloseDate: dateOnly(opportunityRow.estimatedclosedate),
      actualCloseDate: dateOnly(opportunityRow.actualclosedate),
      createdDate: dateOnly(opportunityRow.createdon),
      customerAlias: redact(opportunityRow.aigw_customernamecn || opportunityRow.aigw_customername, identity),
      goodsHandled: redact(formatted(opportunityRow, "aigw_goodshandled"), identity),
      projectSize: redact(opportunityRow.aigw_projectsizeunit, identity),
      warehouseScale: redact(opportunityRow.aigw_warehousescale, identity),
      tradeTerms: redact(formatted(opportunityRow, "aigw_tradeterms"), identity),
      opportunityRelationship: redact(formatted(opportunityRow, "aigw_opportunityrelationship"), identity),
      opportunityPlace: redact(formatted(opportunityRow, "aigw_opportunityplace"), identity),
    },
    financialFacts: {
      currency: "CNY",
      estimatedValue: numberOrNull(opportunityRow.estimatedvalue),
      actualValue: numberOrNull(opportunityRow.actualvalue),
      annualBudgetRevenue: numberOrNull(opportunityRow.aigw_yearrevenuebudget),
      annualBudgetMargin: numberOrNull(opportunityRow.aigw_yeargpmpbudget),
      annualActualRevenue: numberOrNull(opportunityRow.aigw_yearrevenueactual ?? actual?.aigw_annualactualrevenue),
      annualActualGrossProfit: actual ? annualGrossProfit(actual) : null,
      annualBudgetMarginRate: ratio(opportunityRow.aigw_yeargpmpbudget, opportunityRow.aigw_yearrevenuebudget),
      annualActualMarginRate: actual ? ratio(annualGrossProfit(actual), opportunityRow.aigw_yearrevenueactual ?? actual.aigw_annualactualrevenue) : null,
      monthly: actual ? actualMonths(actual) : [],
    },
    routeAndCommercialTerms: {
      transportMode: formatted(opportunityRow, "aigw_transportmode") || safeContext.transportMode,
      location: redact(formatted(opportunityRow, "_aigw_opportunitylocation_value"), identity),
      seaPOL: redact(formatted(opportunityRow, "_aigw_sealandpollookup_value"), identity),
      seaPOD: redact(formatted(opportunityRow, "_aigw_sealandpodlookup_value"), identity),
      airPOL: redact(formatted(opportunityRow, "_aigw_airpollookup_value"), identity),
      airPOD: redact(formatted(opportunityRow, "_aigw_airpodlookup_value"), identity),
      customerNeed: redact(formatted(opportunityRow, "aigw_customerneed_choice"), identity),
      proposalContent: redact(formatted(opportunityRow, "aigw_proposalcontent_choice"), identity),
      researchBackground: redact(formatted(opportunityRow, "aigw_researchbackground_choice"), identity),
      decider: redact(formatted(opportunityRow, "aigw_decider_choice"), identity),
      transportTerms: redact(opportunityRow.aigw_transportterms, identity),
    },
    timelineBusinessRecords: timeline,
    interactionSignals: opportunitySignals.map((row) => ({
      activityToken: String(row.aigw_sourceactivitytoken || "").trim(),
      activityDate: dateOnly(row.aigw_activitydate),
      activityType: formatted(row, "aigw_activitytype") || String(row.aigw_activitytype || ""),
      direction: formatted(row, "aigw_direction") || String(row.aigw_direction || ""),
      result: formatted(row, "aigw_resultcategory") || String(row.aigw_resultcategory || ""),
      nextStep: redact(row.aigw_nextstep, identity),
      budgetMentioned: isBusinessSignalTrue(row.aigw_budgetmentioned),
      decisionMakerInvolved: isBusinessSignalTrue(row.aigw_decisionmakerinvolved),
      objectionPresent: isBusinessSignalTrue(row.aigw_objectionpresent),
      commitmentMade: isBusinessSignalTrue(row.aigw_commitmentmade),
      commitmentDueDate: dateOnly(row.aigw_commitmentduedate),
      commitmentCompleted: isBusinessSignalTrue(row.aigw_commitmentcompleted),
      responseLevel: formatted(row, "aigw_customerresponselevel") || String(row.aigw_customerresponselevel || ""),
      sentiment: formatted(row, "aigw_sentiment") || String(row.aigw_sentiment || ""),
      issueCategory: formatted(row, "aigw_serviceissuecategory") || String(row.aigw_serviceissuecategory || ""),
      issueResolved: isBusinessSignalTrue(row.aigw_issueresolved),
    })),
    serviceCoverage: coverages.map((row) => ({
      serviceType: formatted(row, "aigw_servicetype") || String(row.aigw_servicetype || ""),
      status: formatted(row, "aigw_coveragestatus") || String(row.aigw_coveragestatus || ""),
      startDate: dateOnly(row.aigw_startdate),
      endDate: dateOnly(row.aigw_enddate),
      nextOpportunityWindow: redact(row.aigw_nextopportunitywindow, identity),
      satisfaction: formatted(row, "aigw_servicesatisfaction") || String(row.aigw_servicesatisfaction || ""),
    })),
    safeDecisionContext: redactSafeContext(safeContext, identity, allowedSafeTokens),
    confirmation: { explicit: true, confirmedAt: now.toISOString() },
  };
  // Safe Context identifiers are explicitly allowlisted; all other identity values remain blocked.
  const scan = scanRedactedContext(redacted, identity, { allowedIdentityValues: allowedSafeTokens });
  if (!scan.ok) {
    const error = new Error(`High fidelity identity residual detected: ${scan.reason}`);
    if (diagnostics) error.residualScan = scan.summary;
    throw error;
  }
  return {
    ...redacted,
    residualScan: scan.summary,
    customerCompanyMasked: true,
    customerContactMasked: true,
    exactAmountIncluded: true,
    exactDateIncluded: true,
    routeAndCommercialTermsIncluded: true,
    crmBusinessTextIncluded: true,
    timelineBusinessTextIncluded: timeline.some((item) => item.businessText.length > 0),
  };
}

export function buildStableIdentityDictionary(data = {}) {
  const accountPseudonyms = new Map();
  const contactPseudonyms = new Map();
  const rawIdentityValues = [];
  const companyIdentityValues = [];
  const contactIdentityValues = [];
  const accounts = [...(data.accounts || [])].sort((left, right) => String(left.accountid).localeCompare(String(right.accountid)));
  accounts.forEach((row, index) => {
    const id = normalizeId(row.accountid);
    const pseudonym = `CUSTOMER-COMPANY-${letter(index)}`;
    accountPseudonyms.set(id, pseudonym);
    const values = identityFields(row);
    rawIdentityValues.push(...values);
    companyIdentityValues.push(...values);
  });
  const contacts = [...(data.contacts || [])].sort((left, right) => String(left.contactid).localeCompare(String(right.contactid)));
  const roleCounts = new Map();
  contacts.forEach((row) => {
    const id = normalizeId(row.contactid);
    const role = contactRole(row.jobtitle);
    const count = roleCounts.get(role) || 0;
    roleCounts.set(role, count + 1);
    const pseudonym = `CUSTOMER-${role}-${letter(count)}`;
    contactPseudonyms.set(id, pseudonym);
    const values = identityFields(row);
    rawIdentityValues.push(...values);
    contactIdentityValues.push(...values);
  });
  const opportunities = [...(data.opportunities || [])].sort((left, right) => String(left.opportunityid).localeCompare(String(right.opportunityid)));
  const rawToPseudonym = new Map();
  accounts.forEach((row, index) => identityFields(row).filter(Boolean).forEach((value) => rawToPseudonym.set(String(value), `CUSTOMER-COMPANY-${letter(index)}`)));
  contacts.forEach((row) => identityFields(row).filter(Boolean).forEach((value) => rawToPseudonym.set(String(value), contactPseudonyms.get(normalizeId(row.contactid)))));
  opportunities.forEach((row) => {
    const aliases = [row.aigw_customernamecn, row.aigw_customername].filter(Boolean).map(String);
    rawIdentityValues.push(...aliases);
    companyIdentityValues.push(...aliases);
    aliases.forEach((value) => rawToPseudonym.set(value, accountPseudonyms.get(normalizeId(row._parentaccountid_value)) || "CUSTOMER-COMPANY-REDACTED"));
  });
  return {
    accountPseudonyms,
    contactPseudonyms,
    rawToPseudonym,
    rawIdentityValues: uniqueIdentityValues(rawIdentityValues),
    companyIdentityValues: uniqueIdentityValues(companyIdentityValues),
    contactIdentityValues: uniqueIdentityValues(contactIdentityValues),
  };
}

export function scanRedactedContext(value, identity, { allowedIdentityValues = [] } = {}) {
  const serialized = JSON.stringify(value);
  const allowedTokens = uniqueIdentityValues(allowedIdentityValues);
  const identityScanText = maskApprovedSafeTokens(serialized, allowedTokens);
  const rawValueMatches = identity.rawIdentityValues.filter((item) => containsIdentity(identityScanText, item));
  const customerCompanyResidual = identity.companyIdentityValues.filter((item) => containsIdentity(identityScanText, item)).length;
  const customerContactResidual = identity.contactIdentityValues.filter((item) => containsIdentity(identityScanText, item)).length;
  const guidCount = (serialized.match(GUID_PATTERN) || []).length;
  const emailCount = (serialized.match(EMAIL_PATTERN) || []).length;
  const phoneCount = (serialized.match(PHONE_PATTERN) || []).length;
  const credentialCount = (serialized.match(CREDENTIAL_PATTERN) || []).length;
  const forbiddenKeyCount = (serialized.match(/"(?:accountid|contactid|opportunityid|fullname|emailaddress1|telephone1|notetext|description|rawAccount|rawContact)"/giu) || []).length;
  const summary = { rawValueMatchCount: rawValueMatches.length, rawValueMatchLengths: rawValueMatches.map((item) => String(item).length), rawValueMatchHashes: rawValueMatches.map((item) => sha256(item)), customerCompanyResidual, customerContactResidual, emailResidual: emailCount, phoneResidual: phoneCount, guidResidual: guidCount, credentialResidual: credentialCount, guidCount, emailCount, phoneCount, credentialCount, forbiddenKeyCount, allowlistedSafeTokenCount: allowedTokens.length, serializedLength: serialized.length };
  return { ok: rawValueMatches.length === 0 && customerCompanyResidual === 0 && customerContactResidual === 0 && guidCount === 0 && emailCount === 0 && phoneCount === 0 && credentialCount === 0 && forbiddenKeyCount === 0, reason: rawValueMatches.length ? "raw_identity_value" : guidCount ? "guid" : emailCount ? "email" : phoneCount ? "phone" : credentialCount ? "credential" : forbiddenKeyCount ? "forbidden_key" : "", summary };
}

function timelineRecord(row, entries, identity) {
  const id = normalizeId(row.activityid || row.annotationid);
  const entry = entries.find((item) => normalizeId(item.id) === id);
  const annotation = Boolean(row.annotationid);
  const sourceText = annotation ? String(row.notetext || "") : String(row.description || "");
  const businessDate = annotation
    ? annotationBusinessDate(sourceText, row.overriddencreatedon || row.createdon)
    : dateOnly(row.scheduledstart || row.actualstart || row.actualend);
  return {
    evidenceToken: entry?.token || `TL-REDACTED-${sha256(id).slice(0, 10)}`,
    businessDate,
    activityType: annotation ? "annotation" : normalizeActivityType(row.activitytypecode),
    subject: redact(row.subject, identity),
    businessText: redact(sourceText, identity),
    dateSource: annotation ? "annotation.business-date" : "activity.business-date",
  };
}

function normalizeActivityType(value) {
  const type = String(value || "").trim().toLowerCase();
  if (type === "4210") return "phonecall";
  if (type === "4201") return "appointment";
  if (type === "4212") return "task";
  if (/phone|call/u.test(type)) return "phonecall";
  if (/appointment|meeting|会议/u.test(type)) return "appointment";
  if (/task|任务/u.test(type)) return "task";
  return type || "activity";
}

function annotationBusinessDate(text, fallback) {
  const markedDate = String(text).match(/【(?:业务节点日期|计划节点日期)】\s*(\d{4}-\d{2}-\d{2})/u)?.[1];
  return markedDate || dateOnly(fallback);
}

function identityFields(row) { return [row.name, row.fullname, row.aigw_customernamecn, row.aigw_customername, row.emailaddress1, row.telephone1, row.websiteurl, row.address1_line1, row.address1_postalcode, row.accountnumber]; }
function contactRole(value) { const text = String(value || "").toLowerCase(); if (/(采购|procurement|purchase)/u.test(text)) return "PROCUREMENT"; if (/(财务|finance|决策|decision)/u.test(text)) return "DECISION-MAKER"; if (/(运营|operation|业务)/u.test(text)) return "OPERATION"; return "CONTACT"; }
function redact(value, identity) {
  let output = String(value ?? "");
  for (const original of identity.rawIdentityValues) if (original.length >= 2) output = output.replace(new RegExp(escapeRegExp(original), "giu"), pseudonymFor(original, identity) || "CUSTOMER-REDACTED");
  return output.replace(URL_QUERY_SECRET_PATTERN, "$1REDACTED").replace(DIRECT_ACCOUNT_ID_PATTERN, "$1CUSTOMER-IDENTITY-REDACTED").replace(CREDENTIAL_PATTERN, "CREDENTIAL-REDACTED").replace(EMAIL_PATTERN, "CONTACT-EMAIL-REDACTED").replace(PHONE_PATTERN, "CONTACT-PHONE-REDACTED").replace(GUID_PATTERN, "CRM-ID-REDACTED");
}
function redactSafeContext(value, identity, allowedTokens) {
  if (Array.isArray(value)) return value.map((item) => redactSafeContext(item, identity, allowedTokens));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactSafeContext(item, identity, allowedTokens)]));
  if (typeof value !== "string") return value;
  const placeholders = allowedTokens.map((token, index) => [`__SAFE_TOKEN_${index}__`, token]);
  const protectedValue = placeholders.reduce((output, [placeholder, token]) => output.replace(new RegExp(escapeRegExp(token), "giu"), placeholder), value);
  const redactedValue = redact(protectedValue, identity);
  return placeholders.reduce((output, [placeholder, token]) => output.replaceAll(placeholder, token), redactedValue);
}
function pseudonymFor(original, identity) { return identity.rawToPseudonym.get(String(original)) || "CUSTOMER-IDENTITY-REDACTED"; }
function containsIdentity(serialized, value) { return String(value || "").length >= 2 && serialized.toLowerCase().includes(String(value).toLowerCase()); }
function uniqueIdentityValues(values) { return [...new Set(values.filter(Boolean).map(String))].sort((a, b) => b.length - a.length); }
function maskApprovedSafeTokens(serialized, tokens) {
  return tokens.reduce((output, token) => output.replace(new RegExp(escapeRegExp(token), "giu"), "SAFE-TOKEN-REDACTED"), serialized);
}
function formatted(row, field) { return String(row?.[`${field}@OData.Community.Display.V1.FormattedValue`] || ""); }
function actualMonths(row) { return ["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"].map((month) => ({ month, revenue: numberOrNull(row[`aigw_${month}actualrevenue`]), grossProfit: numberOrNull(row[`aigw_${month}actualgp`]) })); }
function annualGrossProfit(row) { return actualMonths(row).reduce((sum, month) => sum + (month.grossProfit || 0), 0); }
function ratio(numerator, denominator) { const top = numberOrNull(numerator); const bottom = numberOrNull(denominator); return top !== null && bottom ? Number((top / bottom).toFixed(6)) : null; }
function numberOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function dateOnly(value) { const text = String(value || ""); return text ? text.slice(0, 10) : ""; }
function letter(value) { let number = value; let output = ""; do { output = String.fromCharCode(65 + (number % 26)) + output; number = Math.floor(number / 26) - 1; } while (number >= 0); return output; }
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function sha256(value) { return createHash("sha256").update(String(value), "utf8").digest("hex"); }
