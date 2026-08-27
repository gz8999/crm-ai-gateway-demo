import { buildLookupBind } from "./dataverse-metadata-resolvers.mjs";

export const MONTHS = ["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"];
export const MONEY_FIELDS = ["aigw_annualactualrevenue", ...MONTHS.flatMap((month) => [`aigw_${month}actualrevenue`, `aigw_${month}actualgp`, `aigw_${month}actualmp`])];
export const TARGET_FIELDS = ["aigw_name", "aigw_expectedorderdate", ...MONEY_FIELDS];
const factors = [0.82, 0.91, 1.03, 0.95, 1.08, 1.14, 0.89, 1.01, 1.12, 0.94, 1.06, 1.15];
const round = (value) => Math.round(value * 100) / 100;

export function buildSyntheticActual(opportunity, index, bindings) {
  if (!bindings?.actualManagement?.opportunityLookup || !bindings.actualManagement.transactionCurrencyLookup) {
    throw new Error("Synthetic Actual payload requires metadata-resolved lookup bindings.");
  }
  const sequence = index + 1;
  const base = 86000 + (index % 10) * 7500 + Math.floor(index / 10) * 2300;
  const gpRatio = 0.22 + (index % 5) * 0.012;
  const mpRatio = 0.11 + (index % 4) * 0.009;
  const payload = {
    aigw_name: `[AI-DEMO-ACTUAL] ${String(sequence).padStart(3, "0")}`,
    aigw_expectedorderdate: `2026-${String(4 + (index % 9)).padStart(2, "0")}-${String(5 + (index % 20)).padStart(2, "0")}`,
  };
  Object.assign(
    payload,
    buildLookupBind(bindings.actualManagement.opportunityLookup, opportunity.opportunityid),
    buildLookupBind(bindings.actualManagement.transactionCurrencyLookup, opportunity.transactioncurrencyid),
  );
  let annualRevenue = 0;
  const monthlyChecks = [];
  MONTHS.forEach((month, monthIndex) => {
    const revenue = round(base * factors[monthIndex] + ((index * 137 + monthIndex * 311) % 1900));
    const gp = round(revenue * gpRatio);
    const mp = round(revenue * mpRatio);
    payload[`aigw_${month}actualrevenue`] = revenue;
    payload[`aigw_${month}actualgp`] = gp;
    payload[`aigw_${month}actualmp`] = mp;
    annualRevenue = round(annualRevenue + revenue);
    monthlyChecks.push({ month, revenue, gp, mp, gpRatio: round(gp / revenue), mpRatio: round(mp / revenue), valid: revenue > gp && gp > mp && mp >= 0 });
  });
  return {
    semanticKey: `actual_${String(sequence).padStart(3, "0")}`,
    opportunityId: opportunity.opportunityid,
    transactionCurrencyId: opportunity.transactioncurrencyid,
    syntheticName: payload.aigw_name,
    payload,
    validation: {
      annualRevenue,
      monthlyRevenueSum: round(MONTHS.reduce((sum, month) => sum + payload[`aigw_${month}actualrevenue`], 0)),
      gpRatioRange: [Math.min(...monthlyChecks.map((item) => item.gpRatio)), Math.max(...monthlyChecks.map((item) => item.gpRatio))],
      mpRatioRange: [Math.min(...monthlyChecks.map((item) => item.mpRatio)), Math.max(...monthlyChecks.map((item) => item.mpRatio))],
      monthlyChecks,
      valid: monthlyChecks.every((item) => item.valid) && annualRevenue === round(MONTHS.reduce((sum, month) => sum + payload[`aigw_${month}actualrevenue`], 0)),
    },
  };
}

const equalNumber = (a, b) => Math.abs(Number(a) - Number(b)) <= 0.01;
export function recordMatches(existing, planned) {
  if (existing.aigw_name !== planned.syntheticName) return false;
  if (String(existing._aigw_opportunityid_value || "").toLowerCase() !== planned.opportunityId.toLowerCase()) return false;
  if (String(existing._transactioncurrencyid_value || "").toLowerCase() !== planned.transactionCurrencyId.toLowerCase()) return false;
  if (existing.aigw_expectedorderdate !== planned.payload.aigw_expectedorderdate) return false;
  return MONEY_FIELDS.every((field) => equalNumber(existing[field], field === "aigw_annualactualrevenue" ? planned.validation.annualRevenue : planned.payload[field]));
}

export function reconcileSyntheticActuals(plans, existingRows) {
  const byOpportunity = new Map();
  for (const row of existingRows) {
    const key = String(row._aigw_opportunityid_value || "").toLowerCase();
    if (!byOpportunity.has(key)) byOpportunity.set(key, []);
    byOpportunity.get(key).push(row);
  }
  const result = { alreadyExistsAndValid: [], missing: [], conflicts: [] };
  for (const plan of plans) {
    const rows = byOpportunity.get(plan.opportunityId.toLowerCase()) || [];
    if (rows.length === 0) result.missing.push(plan);
    else if (rows.length === 1 && recordMatches(rows[0], plan)) result.alreadyExistsAndValid.push(plan);
    else result.conflicts.push({ plan, existingRecordIds: rows.map((row) => row.aigw_actualmanagementid), reason: rows.length > 1 ? "multiple related records" : "existing record differs from synthetic plan" });
  }
  return result;
}
