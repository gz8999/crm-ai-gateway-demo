import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildLocationPayload,
  classifyLocations,
  findOpportunityLocationLookups,
  parseArguments,
  validateLocationCsv,
  validateTargetEnvironment,
} from "../scripts/dataverse/import-location-master-data.mjs";

test("Location CSV accepts one Name column and preserves internal punctuation", () => {
  const result = validateLocationCsv("\uFEFFName\n  01: Beijing  \n45.Shandong/Beijing\n\n91: Others\n");
  assert.equal(result.ready, true);
  assert.equal(result.originalRowCount, 5);
  assert.equal(result.validNameCount, 3);
  assert.equal(result.blankRowCount, 1);
  assert.deepEqual(result.names, ["01: Beijing", "45.Shandong/Beijing", "91: Others"]);
});

test("Location CSV blocks extra source metadata columns before import", () => {
  const result = validateLocationCsv('"LocationId","Name","StateCode","State","CreatedOn"\n"source-id","01: Beijing","0","Active","timestamp"\n');
  assert.equal(result.ready, false);
  assert.equal(result.extraColumnCount, 4);
  assert.equal(result.rowColumnMismatchCount, 1);
  assert.deepEqual(result.names, ["01: Beijing"]);
});

test("Location CSV blocks exact and normalized duplicates", () => {
  const exact = validateLocationCsv("Name\n01: Beijing\n01: Beijing\n");
  assert.equal(exact.exactDuplicateCount, 1);
  assert.equal(exact.ready, false);
  const normalized = validateLocationCsv("Name\n01: Beijing\n  01: BEIJING  \n");
  assert.equal(normalized.exactDuplicateCount, 0);
  assert.equal(normalized.normalizedDuplicateCount, 1);
  assert.equal(normalized.ready, false);
});

test("Location reconciliation separates active, inactive, missing and ambiguous rows", () => {
  const result = classifyLocations(["A", "B", "C", "D"], [
    { aigw_locationid: "1", aigw_name: " a ", statecode: 0 },
    { aigw_locationid: "2", aigw_name: "B", statecode: 1 },
    { aigw_locationid: "3", aigw_name: "D", statecode: 0 },
    { aigw_locationid: "4", aigw_name: "d", statecode: 0 },
  ]);
  assert.equal(result.existingActive.length, 1);
  assert.equal(result.existingInactive.length, 1);
  assert.deepEqual(result.missing, [{ name: "C" }]);
  assert.equal(result.ambiguousDuplicate.length, 1);
});

test("Location create payload contains only the trimmed primary name", () => {
  assert.deepEqual(buildLocationPayload(" 45.Shandong/Beijing "), { aigw_name: "45.Shandong/Beijing" });
});

test("Location import defaults to dry-run and apply remains explicit", () => {
  assert.deepEqual(parseArguments(["--source", "/external/locations.csv"]), { source: "/external/locations.csv", apply: false, dryRun: true });
  assert.deepEqual(parseArguments(["--source", "/external/locations.csv", "--apply"]), { source: "/external/locations.csv", apply: true, dryRun: false });
  assert.throws(() => parseArguments(["--apply"]), /--source is required/);
});

test("Location import accepts only the approved test hostname", () => {
  assert.equal(validateTargetEnvironment("https://org91f5f65f.crm5.dynamics.com"), "https://org91f5f65f.crm5.dynamics.com");
  assert.throws(() => validateTargetEnvironment("https://example.crm.dynamics.com"), /approved test/);
});

test("Opportunity location Lookup resolves only the new project lookup", () => {
  const attributes = [
    { LogicalName: "aigw_opportunitylocation", SchemaName: "aigw_OpportunityLocation", DisplayName: { LocalizedLabels: [{ LanguageCode: 2052, Label: "案件场所（Location）" }] }, Targets: ["aigw_location"], IsValidForRead: true },
    { LogicalName: "aigw_airpollookup", SchemaName: "aigw_AirPolLookup", DisplayName: { LocalizedLabels: [{ LanguageCode: 2052, Label: "空运装货港" }] }, Targets: ["aigw_polpodlocation"], IsValidForRead: true },
  ];
  assert.deepEqual(findOpportunityLocationLookups(attributes), [{ logicalName: "aigw_opportunitylocation", schemaName: "aigw_OpportunityLocation", displayNames: { "2052": "案件场所（Location）" }, targets: ["aigw_location"], isValidForRead: true }]);
});

test("Location create uses the Metadata-derived Entity Set", () => {
  const source = fs.readFileSync(new URL("../scripts/dataverse/import-location-master-data.mjs", import.meta.url), "utf8");
  assert.match(source, /\/api\/data\/v9\.2\/\$\{entitySetName\}/);
  assert.doesNotMatch(source, /\$\{ENTITY_SET\}/);
});
