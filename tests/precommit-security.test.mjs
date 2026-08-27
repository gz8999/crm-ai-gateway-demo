import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_COUNT,
  DEFAULT_SEED,
  MAX_COUNT,
  MIN_COUNT,
  generateSyntheticOpportunities,
  validateTemplates,
} from "../server/data/syntheticOpportunityGenerator.mjs";

const dataverseScripts = new URL("../scripts/dataverse/", import.meta.url);
const inventoryFile = new URL("../docs/security/dataverse-script-inventory.md", import.meta.url);
const schemaFile = new URL("../docs/reference/d365-opportunity-schema.json", import.meta.url);
const fixtureFile = new URL("../server/data/opportunities.example.json", import.meta.url);

const writeScripts = new Set([
  "add-phase1a-fields-to-solution.mjs", "apply-phase1b-m1-status-reasons.mjs", "apply-phase1c1-actual-management-table.mjs",
  "apply-phase1c2-opportunity-relationship.mjs", "apply-phase1c3-actual-management-view.mjs", "apply-phase1c3a-add-view-to-solution.mjs",
  "apply-phase1c3c-retry-add-view-to-solution.mjs", "create-phase1b-full-form.mjs", "create-phase1b-full-view.mjs",
  "patch-phase1b-m2a-demo-fields.mjs", "apply-phase1c5r2d1-registration.mjs", "phase1c5-synthetic-actuals.mjs", "phase1c5r2d3b-group1-validation.mjs", "phase1c5r2d4-group2-child-total.mjs", "phase1c5r2d5-group3-parent-total.mjs", "repair-phase1b-form-base-chinese-labels.mjs",
  "repair-phase1b-form-visual-labels.mjs", "phase1c5r2e2d4b-polpod-lookup.mjs", "phase1c5r2e2d4a-timeline-restore.mjs", "import-location-master-data.mjs", "phase1c5r2e2f2-location-schema.mjs", "phase1c-schema-mvp-core.mjs", "phase1c5r2f-form-view-security.mjs", "phase1c5r2f-r3c-runtime-probe.mjs", "phase1c5r2g-d6-full-import.mjs",
]);

test("Dataverse script inventory covers every executable script and write scripts use the shared gate", async () => {
  const files = (await readdir(dataverseScripts)).filter((name) => name.endsWith(".mjs")).sort();
  const inventory = await readFile(inventoryFile, "utf8");
  for (const file of files) {
    assert.equal(inventory.includes(`\`${file}\``), true, `${file} missing from safety inventory`);
    const source = await readFile(new URL(file, dataverseScripts), "utf8");
    assert.doesNotMatch(source, /https:\/\/(?!example)[a-z0-9-]+\.crm\d*\.dynamics\.com/i);
    if (writeScripts.has(file) && !["phase1c5r2e2d4b-polpod-lookup.mjs", "phase1c5r2e2d4a-timeline-restore.mjs", "phase1c5r2e2f2-location-schema.mjs", "phase1c-schema-mvp-core.mjs", "phase1c5r2f-form-view-security.mjs"].includes(file)) assert.match(source, /assertDataverseScriptGate\(\{ mode: "write-capable" \}\)/);
    if (["phase1a-full.mjs", "phase1c5r2e2d4b-polpod-lookup.mjs", "phase1c5r2e2d4a-timeline-restore.mjs", "phase1c5r2e2f2-location-schema.mjs", "phase1c-schema-mvp-core.mjs", "phase1c5r2f-form-view-security.mjs", "phase1c5r2f-r3a-bpf-backing-table-repair.mjs", "phase1c5r2g-d5-dedicated-opportunity-view.mjs"].includes(file)) assert.match(source, /assertDataverseScriptGate\(\{ mode: (?:apply \? )?"publish\/deploy-capable"/);
  }
  assert.equal(files.length, 50);
});

test("curated Opportunity schema contains unique project fields without environment export properties", async () => {
  const schema = JSON.parse(await readFile(schemaFile, "utf8"));
  const logicalNames = schema.fields.map((field) => field.targetLogicalName || field.sourceLogicalName);
  assert.equal(new Set(logicalNames).size, logicalNames.length);
  assert.equal(schema.fields.length > 0, true);
  for (const field of schema.fields) {
    assert.deepEqual(Object.keys(field).sort(), ["providerPayloadPolicy", "purpose", "safeContextPolicy", "sourceLogicalName", "targetLogicalName", "type"].sort());
    assert.equal(JSON.stringify(field).includes("MetadataId"), false);
    assert.equal(JSON.stringify(field).includes("controlName"), false);
    assert.equal(JSON.stringify(field).includes("hasValue"), false);
  }
});

test("repository opportunity fixture is synthetic and generator is deterministic", async () => {
  const templates = JSON.parse(await readFile(fixtureFile, "utf8"));
  assert.equal(DEFAULT_SEED, 20260711);
  assert.equal(DEFAULT_COUNT, 54);
  assert.equal(MIN_COUNT, 10);
  assert.equal(MAX_COUNT, 100);
  assert.equal(templates.length, 10);
  assert.equal(validateTemplates(templates), true);
  const first = generateSyntheticOpportunities(templates, { count: 54, seed: "public-test-seed" });
  const second = generateSyntheticOpportunities(templates, { count: 54, seed: "public-test-seed" });
  assert.deepEqual(first, second);
  assert.equal(first.every((item) => item.is_ai_demo && item.name.startsWith("[AI-DEMO]") && item.id.startsWith("DEMO-OPP-")), true);
  assert.equal(JSON.stringify(first).includes("local-artifacts"), false);
});
