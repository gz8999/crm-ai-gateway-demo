import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { generateR5Artifacts, loadR5Evidence } from "../scripts/d365/phase1c5r2g-d6-r5-generate-acceptance.mjs";

test("D6-R5 exact readback freezes the full 3900-record dataset", async () => {
  const { artifacts } = await generateR5Artifacts();
  assert.equal(artifacts.evidence.explicitRecordCount, 3900);
  assert.deepEqual(artifacts.evidence.counts, {
    Account: 60,
    Contact: 120,
    Opportunity: 200,
    ServiceCoverage: 240,
    ActualManagement: 130,
    Timeline: 1800,
    InteractionSignal: 1350,
  });
  assert.deepEqual(artifacts.evidence.state, {
    Won: 91,
    Active: 100,
    Lost: 9,
    opportunityClose: { win: 91, lose: 9, total: 100, duplicate: 0, attachments: 0 },
  });
});

test("D6-R5 validates relationships, actual arithmetic, BPF and signal sources", async () => {
  const { artifacts } = await generateR5Artifacts();
  assert.equal(artifacts.evidence.relationshipChecks.contactPerAccount, true);
  assert.equal(artifacts.evidence.relationshipChecks.opportunityPerAccount, true);
  assert.equal(artifacts.evidence.relationshipChecks.coveragePerAccount, true);
  assert.equal(artifacts.evidence.relationshipChecks.actualOnePerOpportunity, true);
  assert.equal(artifacts.evidence.actualRevenueIntegrity, true);
  assert.equal(artifacts.evidence.actualGpIntegrity, true);
  assert.equal(artifacts.evidence.signal.missingSource, 0);
  assert.equal(artifacts.evidence.bpf.targetInstanceCount, 200);
  assert.equal(artifacts.evidence.bpf.initialStage, "授予资格");
});

test("D6-R5 preserves annotation date rules and never exports private IDs", async () => {
  const { artifacts, files } = await generateR5Artifacts();
  assert.equal(artifacts.evidence.timeline.referenceDate, "2026-07-18");
  assert.deepEqual(artifacts.evidence.timeline.annotationModes, {
    HistoricalOverride: 224,
    SameDayBodyDate: 1,
    FutureBodyPlannedDate: 7,
  });
  for (const [name, value] of Object.entries(files)) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    assert.doesNotMatch(text, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, name);
    assert.doesNotMatch(text, /lcn-crm\.crm7\.dynamics\.com/i, name);
  }
});

test("D6-R5 keeps the private exact manifest ignored and records R5 as read-only", async () => {
  const { artifacts } = await generateR5Artifacts();
  const { privateManifest } = await loadR5Evidence();
  assert.equal(Object.keys(privateManifest.records).length, 3900);
  assert.equal(Object.keys(privateManifest.bpfReadbacks).length, 200);
  assert.equal(artifacts.requests.dataverseRequestsInR5, 0);
  assert.equal(artifacts.requests.productionRequests, 0);
  assert.equal(artifacts.requests.externalLlmCalls, 0);
  assert.match(fs.readFileSync(new URL("../.gitignore", import.meta.url), "utf8"), /local-artifacts/);
  assert.equal(artifacts.gates.fullAcceptanceComplete, true);
  assert.equal(artifacts.gates.datasetFrozen, true);
});
