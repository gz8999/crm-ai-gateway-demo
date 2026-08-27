import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runnerPath = new URL("../scripts/dataverse/phase1c5r2d5-group3-parent-total.mjs", import.meta.url);

test("Group 3 runner enables only the three PostOperation steps and preserves Group 1/2 rollback", async () => {
  const source = await readFile(runnerPath, "utf8");
  assert.match(source, /const GROUP3 = \[/);
  assert.match(source, /Group 3 Parent Total Ready=true/);
  assert.match(source, /Group 3 Parent Total Ready=false/);
  assert.doesNotMatch(source, /PublishXml|publishxml/i);
  assert.match(source, /resolveLiteralMarkerRecords/);
  assert.match(source, /CONFIRM_D365_TEST_WRITE_PHASE_1C_5R2D_5_GROUP3/);
});

test("Group 3 parent writer is restricted to the transaction annual field", async () => {
  const source = await readFile(new URL("../plugins/ActualTotals/src/CrmAiGateway.ActualTotals.Plugin/DataverseActualTotalsStore.cs", import.meta.url), "utf8");
  assert.match(source, /update\[FieldNames\.ParentAnnualRevenue\]/);
  assert.doesNotMatch(source, /DeprecatedParentCny|_base|actualvalue|estimatedvalue|statuscode|statecode|transactioncurrencyid/);
});

test("Group 3 audit covers the explicit CNY, base, reparent, no-op and deferred integrity boundaries", async () => {
  const source = await readFile(runnerPath, "utf8");
  for (const marker of ["aigw_yearrevenueactual_base", "aigw_yearrevenueactualcny", "oldOpportunityIdFromPreImage", "noOpParentUpdate", "Not Executable Without Bypassing Validation", "Not Executable Without Violating Group 1 Invariant"]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Group 3 reads the Opportunity lookup through its OData value property", async () => {
  const source = await readFile(runnerPath, "utf8");
  assert.match(source, /_aigw_opportunityid_value/);
  assert.doesNotMatch(source, /\$select=aigw_actualmanagementid,aigw_opportunityid,/);
});
