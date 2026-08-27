import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MONTH_REVENUE_FIELDS, calculateAnnualRevenue, mergeRevenueFields, roundDecimalAwayFromZero } from "../scripts/dataverse/lib/actual-total-calculation.mjs";

const runnerPath = new URL("../scripts/dataverse/phase1c5r2d4-group2-child-total.mjs", import.meta.url);

test("Group 2 calculation sums the exact April-March Revenue fields only", () => {
  assert.equal(MONTH_REVENUE_FIELDS.length, 12);
  assert.equal(calculateAnnualRevenue({ aigw_aprilactualrevenue: 10.10, aigw_mayactualrevenue: 20.20, aigw_juneactualrevenue: 30.30 }), 60.6);
  assert.equal(calculateAnnualRevenue(Object.fromEntries(MONTH_REVENUE_FIELDS.map((field, index) => [field, (index + 1) * 100])), {}), 7800);
});

test("Group 2 calculation treats null as zero and merges Target over PreImage", () => {
  const preImage = { aigw_aprilactualrevenue: 100, aigw_mayactualrevenue: 200 };
  const target = { aigw_mayactualrevenue: null };
  const merged = mergeRevenueFields(preImage, target);
  assert.equal(merged.aigw_aprilactualrevenue, 100);
  assert.equal(merged.aigw_mayactualrevenue, null);
  assert.equal(calculateAnnualRevenue(preImage, target), 100);
});

test("Group 2 rounding uses AwayFromZero for positive and negative midpoints", () => {
  assert.equal(roundDecimalAwayFromZero("1.005", 2), 1.01);
  assert.equal(roundDecimalAwayFromZero("-1.005", 2), -1.01);
});

test("Group 2 runner keeps Group 3 disabled and has no publish path", async () => {
  const source = await readFile(runnerPath, "utf8");
  assert.match(source, /const GROUP3 = \[/);
  assert.match(source, /Group 2 Child Total Ready=true/);
  assert.doesNotMatch(source, /PublishXml|publishxml/i);
  assert.match(source, /resolveLiteralMarkerRecords/);
  assert.match(source, /CONFIRM_D365_TEST_WRITE_PHASE_1C_5R2D_4_GROUP2/);
});

test("Group 2 payload does not write child annual or generated base fields", async () => {
  const source = await readFile(runnerPath, "utf8");
  assert.match(source, /aigw_annualactualrevenue/);
  assert.match(source, /Synthetic payload must not write annual or base fields/);
  assert.match(source, /aigw_yearrevenueactual_base,aigw_yearrevenueactualcny/);
});
