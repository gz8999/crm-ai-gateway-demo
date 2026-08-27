import assert from "node:assert/strict";
import test from "node:test";
import { analyzeForm, buildRelationshipPayload, buildTablePayload, buildViewPayload, patchLocationControl } from "../scripts/dataverse/phase1c5r2e2f2-location-schema.mjs";

test("Location table contains only its required primary name", () => {
  const payload = buildTablePayload();
  assert.equal(payload.SchemaName, "aigw_Location");
  assert.equal(payload.OwnershipType, "OrganizationOwned");
  assert.equal(payload.Attributes.length, 1);
  assert.equal(payload.Attributes[0].SchemaName, "aigw_Name");
  assert.equal(payload.Attributes[0].MaxLength, 200);
  assert.equal(payload.Attributes[0].RequiredLevel.Value, "ApplicationRequired");
});

test("Location relationship is optional and restrictive", () => {
  const payload = buildRelationshipPayload();
  assert.equal(payload.SchemaName, "aigw_location_opportunities");
  assert.equal(payload.ReferencedEntity, "aigw_location");
  assert.equal(payload.ReferencingEntity, "opportunity");
  assert.equal(payload.Lookup.SchemaName, "aigw_OpportunityLocation");
  assert.equal(payload.Lookup.RequiredLevel.Value, "None");
  assert.equal(payload.CascadeConfiguration.Delete, "Restrict");
  for (const key of ["Assign", "Merge", "Reparent", "Share", "Unshare"]) assert.equal(payload.CascadeConfiguration[key], "NoCascade");
});

test("Location view is active-only, name-only and ascending", () => {
  const view = buildViewPayload(12345);
  assert.match(view.fetchxml, /attribute name="aigw_name"/);
  assert.match(view.fetchxml, /condition attribute="statecode" operator="eq" value="0"/);
  assert.match(view.fetchxml, /order attribute="aigw_name" descending="false"/);
  assert.doesNotMatch(view.layoutxml, /modifiedon|ownerid/i);
  assert.match(view.layoutxml, /object="12345"/);
});

test("Location form patch replaces one binding in place", () => {
  const xml = '<form><tabs><tab><sections><section><rows><row><cell id="cell"><labels><label description="案件场所" languagecode="2052" /></labels><control id="old" classid="text" datafieldname="aigw_opportunityplace" disabled="false" /></cell></row></rows></section></sections></tab></tabs></form>';
  const result = patchLocationControl(xml, "11111111-1111-1111-1111-111111111111");
  assert.equal(result.changed, true);
  assert.match(result.formxml, /datafieldname="aigw_opportunitylocation"/);
  assert.doesNotMatch(result.formxml, /datafieldname="aigw_opportunityplace"/);
  assert.match(result.formxml, /ViewId>\{11111111-1111-1111-1111-111111111111\}/);
  const analysis = analyzeForm(result.formxml, JSON.stringify({ datafieldname: "aigw_opportunitylocation" }));
  assert.equal(analysis.lookupControls, 1);
  assert.equal(analysis.oldFieldControls, 0);
  assert.equal(analysis.jsonHasLookup, true);
});
