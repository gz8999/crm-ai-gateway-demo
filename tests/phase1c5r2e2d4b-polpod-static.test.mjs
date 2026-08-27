import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeFormXml,
  buildKeyPayload,
  buildLookupRelationshipPayload,
  buildTablePayload,
  buildUpsertPath,
  buildViewPayload,
  parseCsvRows,
  patchPolPodFormXml,
  validateCsvRows,
} from "../scripts/dataverse/phase1c5r2e2d4b-polpod-lookup.mjs";

const items = [
  { logicalName: "aigw_sealandpollookup", old: "aigw_sealandpol", label: "海运/陆运装货港", relationship: "aigw_opportunity_sealandpollookup", schemaName: "aigw_SeaLandPolLookup" },
  { logicalName: "aigw_sealandpodlookup", old: "aigw_sealandpod", label: "海运/陆运卸货港", relationship: "aigw_opportunity_sealandpodlookup", schemaName: "aigw_SeaLandPodLookup" },
  { logicalName: "aigw_airpollookup", old: "aigw_airpol", label: "空运装货港", relationship: "aigw_opportunity_airpollookup", schemaName: "aigw_AirPolLookup" },
  { logicalName: "aigw_airpodlookup", old: "aigw_airpod", label: "空运卸货港", relationship: "aigw_opportunity_airpodlookup", schemaName: "aigw_AirPodLookup" },
];

test("POL/POD CSV parser validates the exact 2072-row contract", () => {
  const rows = Array.from({ length: 2072 }, (_, index) => {
    const key = index === 2071 ? "9999: OTR" : `${String(index + 1).padStart(4, "0")}: DEMO`;
    return `"${key}","record-${index}"`;
  });
  const parsed = parseCsvRows(["\uFEFF\"Key Code\",\"Record ID\"", ...rows].join("\n"));
  const validation = validateCsvRows(parsed);
  assert.equal(validation.rowCount, 2072);
  assert.equal(validation.blankCount, 0);
  assert.equal(validation.duplicateCount, 0);
  assert.equal(validation.containsOtr, true);
  assert.equal(validation.recordIdIgnored, true);
  assert.match(validation.keyCodeSha256, /^[0-9a-f]{64}$/);
});

test("metadata and upsert payloads use only Key Code", () => {
  const table = buildTablePayload();
  assert.equal(table.SchemaName, "aigw_PolPodLocation");
  assert.equal(table.OwnershipType, "OrganizationOwned");
  assert.equal(table.Attributes.length, 1);
  assert.equal(table.Attributes[0].SchemaName, "aigw_KeyCode");
  assert.equal(table.Attributes[0].IsPrimaryName, true);
  const key = buildKeyPayload();
  assert.deepEqual(key.KeyAttributes, ["aigw_keycode"]);
  assert.equal(buildUpsertPath("aigw_polpodlocations", "9999: OTR"), "/api/data/v9.2/aigw_polpodlocations(aigw_keycode='9999: OTR')");
});

test("all four lookups target the master table and are required", () => {
  for (const item of items) {
    const relationship = buildLookupRelationshipPayload(item);
    assert.equal(relationship.ReferencedEntity, "aigw_polpodlocation");
    assert.equal(relationship.ReferencingEntity, "opportunity");
    assert.equal(relationship.Lookup.RequiredLevel.Value, "ApplicationRequired");
    assert.equal(relationship.Lookup.SchemaName, item.schemaName);
  }
});

test("lookup view is a generic one-column ascending Key Code view", () => {
  const view = buildViewPayload(12345);
  assert.equal(view.returnedtypecode, "aigw_polpodlocation");
  assert.match(view.fetchxml, /<attribute name="aigw_keycode" \/>/);
  assert.doesNotMatch(view.fetchxml, /filter|link-entity/i);
  assert.match(view.fetchxml, /order attribute="aigw_keycode" descending="false"/);
  assert.match(view.layoutxml, /jump="aigw_keycode"/);
  assert.match(view.layoutxml, /cell name="aigw_keycode"/);
});

test("form patch preserves the existing controls while replacing only POL/POD bindings", () => {
  const controls = items.map((item) => `<control id="${item.old}-control" classid="{270BD3DB-D9AF-4782-9025-509E298DEC0A}" datafieldname="${item.old}" disabled="false" />`).join("");
  const xml = `<form><tabs><tab name="Summary"><columns><column><sections><section name="aigw_fr_summary_pol_pod"><labels><label description="POL&amp;POD" languagecode="1033" /></labels><rows><row><cell>${controls}</cell></row></rows></section></sections></column></columns></tab></tabs></form>`;
  const patched = patchPolPodFormXml(xml, "12345678-1234-1234-1234-123456789abc");
  const analysis = analyzeFormXml(patched.formXml, JSON.stringify({ fields: items.map((item) => item.logicalName) }));
  assert.equal(analysis.counts.controls, 4);
  for (const item of items) {
    assert.equal(analysis.oldControls[item.old], 0);
    assert.equal(analysis.lookupControls[item.logicalName], 1);
  }
  assert.equal(analysis.sectionLabel, "POL&POD（不适用的情况下，请输入「9999: OTR」）");
  assert.match(patched.formXml, /<ViewId>\{12345678-1234-1234-1234-123456789ABC\}<\/ViewId>/);
  assert.match(patched.formXml, /<ViewIds>\{12345678-1234-1234-1234-123456789ABC\}<\/ViewIds>/);
});

test("form patch also repairs the section label when lookup bindings already exist", () => {
  const controls = items.map((item) => `<control id="${item.logicalName}-control" classid="{270BD3DB-D9AF-4782-9025-509E298DEC0A}" datafieldname="${item.logicalName}" disabled="false" />`).join("");
  const xml = `<form><tabs><tab name="Summary"><columns><column><sections><section name="aigw_fr_summary_pol_pod"><labels><label description="POL&amp;POD" languagecode="1033" /></labels><rows><row><cell>${controls}</cell></row></rows></section></sections></column></columns></tab></tabs></form>`;
  const patched = patchPolPodFormXml(xml, "12345678-1234-1234-1234-123456789abc");
  assert.equal(analyzeFormXml(patched.formXml).sectionLabel, "POL&POD（不适用的情况下，请输入「9999: OTR」）");
});
