import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTimelineFormXml, patchTimelineFormXml } from "../scripts/dataverse/phase1c5r2e2d4a-timeline-restore.mjs";

function fixture() {
  const tabs = Array.from({ length: 5 }, (_, index) => `<tab name="tab_${index}" id="{00000000-0000-0000-0000-00000000000${index}}"><columns><column width="100%"><sections><section name="section_${index}" id="{10000000-0000-0000-0000-00000000000${index}}"><rows /></section></sections></column></columns></tab>`).join("");
  const filler = Array.from({ length: 110 }, (_, index) => `<control id="field_${index}" datafieldname="field_${index}" classid="{270BD3DB-D9AF-4782-9025-509E298DEC0A}" />`).join("");
  const polpod = ["aigw_sealandpollookup", "aigw_sealandpodlookup", "aigw_airpollookup", "aigw_airpodlookup"].map((field, index) => `<control id="polpod_${index}" datafieldname="${field}" classid="{270BD3DB-D9AF-4782-9025-509E298DEC0A}" />`).join("");
  const business = `<section name="business" id="{20000000-0000-0000-0000-000000000001}"><rows><row><cell>${filler}${polpod}</cell></row></rows></section>`;
  const timeline = `<tab name="summary" id="{20000000-0000-0000-0000-000000000000}"><columns><column width="62%"><sections>${business}<section name="aigw_fr_summary_timeline" id="{37D6B806-1B03-5A0A-A7F8-F263E755EB11}" showlabel="true"><rows /></section></sections></column></columns></tab>`;
  return `<form><tabs>${tabs}${timeline}</tabs></form>`;
}

test("Timeline patch adds exactly one standard Timeline control to the existing section", () => {
  const before = fixture();
  const result = patchTimelineFormXml(before);
  const after = analyzeTimelineFormXml(result.formXml);
  assert.equal(result.before.timelineSection.id.toLowerCase(), "{37d6b806-1b03-5a0a-a7f8-f263e755eb11}");
  assert.equal(result.before.timelineSection.controls, 0);
  assert.equal(after.timelineSection.controls, 1);
  assert.deepEqual(after.timelineControls[0], {
    id: "aigw_timeline_control",
    uniqueid: "{a4e2d7c1-1f64-4c9a-8b73-5e0d2f6a914c}",
    classid: "{06375649-C143-495E-A496-C962E5B4488E}",
    hasActivities: true,
    activities: true,
  });
  assert.equal(after.counts.controls, result.before.counts.controls + 1);
  assert.deepEqual(after.polpodControls, result.before.polpodControls);
});

test("Timeline patch refuses a non-empty or duplicate section", () => {
  const withDuplicate = fixture().replace("<rows />", "<rows><row><cell><control id=\"existing\" classid=\"{06375649-C143-495E-A496-C962E5B4488E}\" /></cell></row></rows>");
  assert.throws(() => patchTimelineFormXml(withDuplicate), /not empty|duplicate/i);
});
