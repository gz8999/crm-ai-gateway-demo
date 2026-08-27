import test from "node:test";
import assert from "node:assert/strict";
import {
  PLUGIN_BROWSER_SMOKE_CONTRACT,
  SMOKE_REQUIRED_FIELDS,
  SMOKE_UNSUPPORTED_FIELDS,
  validatePluginBrowserSmokeMetadata,
} from "../scripts/dataverse/lib/phase1c5-plugin-browser-smoke-contract.mjs";

test("browser smoke contract matches the deployed Revenue-only model", () => {
  const result = validatePluginBrowserSmokeMetadata(SMOKE_REQUIRED_FIELDS);
  assert.deepEqual(result.missingRequiredFields, []);
  assert.deepEqual(result.unsupportedFieldsPresent, []);
  assert.equal(result.ready, true);
  assert.equal(PLUGIN_BROWSER_SMOKE_CONTRACT.annualRevenue.parentTarget, "aigw_yearrevenueactual");
  assert.equal(PLUGIN_BROWSER_SMOKE_CONTRACT.uniqueness.maximumRelatedActuals, 1);
  assert.equal(PLUGIN_BROWSER_SMOKE_CONTRACT.uniqueness.fiscalYearField, null);
});

test("browser smoke contract does not require unsupported fields", () => {
  for (const field of SMOKE_UNSUPPORTED_FIELDS) {
    assert.equal(SMOKE_REQUIRED_FIELDS.includes(field), false);
    assert.equal(PLUGIN_BROWSER_SMOKE_CONTRACT.excludedAssertions.some((item) => item.toLowerCase().includes(field)), false);
  }
  assert.deepEqual(PLUGIN_BROWSER_SMOKE_CONTRACT.excludedAssertions, [
    "fiscal-year selection",
    "annual GP total",
    "annual MP total",
    "multi-fiscal-year uniqueness",
  ]);
});

test("metadata gate reports only missing deployed fields", () => {
  const result = validatePluginBrowserSmokeMetadata(["aigw_name", "aigw_opportunityid"]);
  assert.equal(result.ready, false);
  assert.equal(result.missingRequiredFields.includes("aigw_annualactualrevenue"), true);
  assert.deepEqual(result.unsupportedFieldsPresent, []);
});

test("contract sequence has no data or configuration side effects", () => {
  assert.deepEqual(PLUGIN_BROWSER_SMOKE_CONTRACT.sequence, [
    "read-only preflight",
    "create one synthetic Actual",
    "verify child and parent annual Revenue",
    "update one monthly Revenue",
    "verify both annual Revenue values changed",
    "reject a second Actual for the same Opportunity",
    "delete the created Actual",
    "verify the parent total is restored",
    "verify no smoke record remains",
  ]);
});
