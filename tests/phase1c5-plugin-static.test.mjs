import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = "plugins/ActualTotals";
const fieldNames = fs.readFileSync(`${root}/src/CrmAiGateway.ActualTotals.Core/FieldNames.cs`, "utf8");
const store = fs.readFileSync(`${root}/src/CrmAiGateway.ActualTotals.Plugin/DataverseActualTotalsStore.cs`, "utf8");
const manifest = JSON.parse(fs.readFileSync("docs/d365/phase1c-5r2b-plugin-registration-manifest.json", "utf8"));

test("Phase 1C-5R2A plugin uses manifest monthly Revenue fields only", () => {
  const source = JSON.parse(fs.readFileSync("docs/d365/phase1c-1r-missing-fields-resume-manifest.json", "utf8"));
  const expected = source.reconciliation.missing.filter((field) => /actualrevenue$/.test(field) && !field.includes("annual"));
  assert.equal(expected.length, 12);
  for (const field of expected) assert.match(fieldNames, new RegExp(`"${field}"`));
  assert.doesNotMatch(fieldNames, /actualgp"|actualmp"/);
});

test("Phase 1C-5R2A parent writer cannot write CNY or base fields", () => {
  assert.match(store, /update\[FieldNames\.ParentAnnualRevenue\]/);
  assert.doesNotMatch(store, /DeprecatedParentCny|_base/);
  assert.deepEqual(manifest.writeSurface.parent, ["aigw_yearrevenueactual"]);
  assert.ok(manifest.writeSurface.forbidden.includes("aigw_yearrevenueactualcny"));
});

test("Phase 1C-5R2B Update filtering attributes exclude generated annual", () => {
  assert.equal(manifest.filteringAttributes.length, 14);
  assert.ok(!manifest.filteringAttributes.includes("aigw_annualactualrevenue"));
  assert.equal(manifest.steps.length, 7);
});
