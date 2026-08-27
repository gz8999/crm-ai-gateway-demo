import test from "node:test";
import assert from "node:assert/strict";
import { buildSyntheticActual, MONTHS, reconcileSyntheticActuals } from "../scripts/dataverse/lib/phase1c5-synthetic-actuals.mjs";

const opportunity = { opportunityid: "11111111-1111-1111-1111-111111111111", transactioncurrencyid: "22222222-2222-2222-2222-222222222222" };
const bindings = {
  actualManagement: {
    opportunityLookup: { navigationPropertyName: "aigw_OpportunityId", entitySetName: "opportunities" },
    transactionCurrencyLookup: { navigationPropertyName: "transactioncurrencyid", entitySetName: "transactioncurrencies" },
  },
};
test("Phase 1C-5 creates deterministic valid synthetic financials", () => {
  const plan = buildSyntheticActual(opportunity, 0, bindings);
  assert.equal(plan.syntheticName, "[AI-DEMO-ACTUAL] 001");
  assert.equal(plan.validation.valid, true);
  assert.equal(plan.validation.annualRevenue, plan.validation.monthlyRevenueSum);
  assert.equal(Object.hasOwn(plan.payload, "aigw_annualactualrevenue"), false);
  assert.equal(new Set(MONTHS.map((month) => plan.payload[`aigw_${month}actualrevenue`])).size > 1, true);
  assert.equal(Object.keys(plan.payload).some((key) => key.endsWith("_base")), false);
});

test("Phase 1C-5 reconciliation handles missing, valid and conflict records", () => {
  const plan = buildSyntheticActual(opportunity, 0, bindings);
  assert.equal(reconcileSyntheticActuals([plan], []).missing.length, 1);
  const row = { aigw_actualmanagementid: "33333333-3333-3333-3333-333333333333", _aigw_opportunityid_value: opportunity.opportunityid, _transactioncurrencyid_value: opportunity.transactioncurrencyid, aigw_name: plan.syntheticName, aigw_expectedorderdate: plan.payload.aigw_expectedorderdate };
  for (const [key, value] of Object.entries(plan.payload)) if (key.startsWith("aigw_") && typeof value === "number") row[key] = value;
  row.aigw_annualactualrevenue = plan.validation.annualRevenue;
  assert.equal(reconcileSyntheticActuals([plan], [row]).alreadyExistsAndValid.length, 1);
  row.aigw_annualactualrevenue += 1;
  assert.equal(reconcileSyntheticActuals([plan], [row]).conflicts.length, 1);
});
