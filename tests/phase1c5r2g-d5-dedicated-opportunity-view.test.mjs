import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEDICATED_OPPORTUNITY_VIEW,
  addRequestStats,
  appDescriptorHasView,
  buildDedicatedViewPayload,
  compareDedicatedView,
  dedicatedViewRequestStatsAreSafe,
  normalizeAppDescriptor,
  stableOpportunityBusinessProjection,
  summarizeOpportunityStates,
} from "../scripts/dataverse/lib/d5-dedicated-opportunity-view-contract.mjs";

const sourceView = {
  fetchxml: '<fetch version="1.0" savedqueryid="75fd4002-b7bc-4a4a-bb2d-87ac0b002cfe"><entity name="opportunity"><attribute name="name" /><attribute name="aigw_customernamecn" /><attribute name="ownerid" /><filter type="and"><condition attribute="name" operator="like" value="[[]AI-DEMO]%" /></filter><order attribute="modifiedon" descending="true" /></entity></fetch>',
  layoutxml: '<grid name="resultset"><row name="result" id="opportunityid"><cell name="name" width="300" /></row></grid>',
  layoutjson: '{"Rows":[{"Cells":[{"Name":"name","Width":300}]}]}',
};
const viewId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";

test("dedicated view freezes the shared name and current Pilot contract", () => {
  assert.equal(DEDICATED_OPPORTUNITY_VIEW.name, "AI Gateway Demo 200 - Full Replica");
  assert.equal(DEDICATED_OPPORTUNITY_VIEW.expectedCurrentCount, 24);
  assert.deepEqual(DEDICATED_OPPORTUNITY_VIEW.expectedCurrentStates, { open: 16, won: 7, lost: 1 });
});

test("dedicated view clones layout and changes only ID plus filter", () => {
  const payload = buildDedicatedViewPayload({ sourceView, viewId, ownerId });
  assert.equal(payload.layoutxml, sourceView.layoutxml);
  assert.equal(payload.layoutjson, sourceView.layoutjson);
  assert.match(payload.fetchxml, new RegExp(`savedqueryid="${viewId}"`));
  assert.match(payload.fetchxml, new RegExp(`attribute="ownerid" operator="eq" value="${ownerId}"`));
  assert.match(payload.fetchxml, /attribute="aigw_customernamecn" operator="like" value="%（演示）有限公司"/);
  assert.doesNotMatch(payload.fetchxml, /attribute="name" operator="like" value="\[\[\]AI-DEMO\]%"/);
  assert.match(payload.fetchxml, /<order attribute="modifiedon" descending="true" \/>/);
});

test("dedicated view contract rejects an unexpected source filter", () => {
  assert.throws(() => buildDedicatedViewPayload({ sourceView: { ...sourceView, fetchxml: sourceView.fetchxml.replace("[[]AI-DEMO]%", "other") }, viewId, ownerId }), /legacy/);
});

test("definition comparison detects drift and accepts the frozen payload", () => {
  const payload = buildDedicatedViewPayload({ sourceView, viewId, ownerId });
  assert.deepEqual(compareDedicatedView({ ...payload, statecode: 0, statuscode: 1 }, payload), []);
  assert.deepEqual(compareDedicatedView({ ...payload, fetchxml: payload.fetchxml.replace("ownerid", "name") }, payload), ["fetchxml"]);
});

test("state summary keeps Open, Won, and Lost in the same view", () => {
  const rows = [...Array(16).fill({ statecode: 0 }), ...Array(7).fill({ statecode: 1 }), { statecode: 2 }];
  assert.deepEqual(summarizeOpportunityStates(rows), { open: 16, won: 7, lost: 1, other: 0 });
});

test("business projection ignores OData annotations and platform timestamps", () => {
  const base = {
    opportunityid: ownerId,
    name: "合成商机",
    statecode: 0,
    statuscode: 1,
    actualclosedate: null,
    _ownerid_value: viewId,
    aigw_customernamecn: "合成客户（演示）有限公司",
  };
  const before = [{ ...base, modifiedon: "2026-07-17T01:00:00Z", "ownerid@OData.Community.Display.V1.FormattedValue": "旧标签" }];
  const after = [{ ...base, modifiedon: "2026-07-17T02:00:00Z", "ownerid@OData.Community.Display.V1.FormattedValue": "新标签" }];
  assert.deepEqual(stableOpportunityBusinessProjection(before), stableOpportunityBusinessProjection(after));
});

test("request statistics preserve prior metadata writes across verification runs", () => {
  assert.deepEqual(
    addRequestStats({ GET: 70, POST: 2, Publish: 1 }, { GET: 20, POST: 0, Publish: 0 }),
    { GET: 90, POST: 2, Publish: 1 },
  );
});

test("app descriptor helpers isolate the one new View component", () => {
  const descriptor = { appInfo: { PublishedOn: "today", VersionNumber: "2", Components: [{ Id: viewId, Type: 26 }, { Id: ownerId, Type: 1 }] } };
  assert.equal(appDescriptorHasView(descriptor, viewId), 1);
  assert.deepEqual(normalizeAppDescriptor(descriptor, viewId), { appInfo: { Components: [{ Id: ownerId, Type: 1 }] } });
});

test("request contract allows metadata writes but no business mutation", () => {
  const safe = { POST: 3, PATCH: 0, DELETE: 0, Publish: 1, OpportunityWrites: 0, BusinessWrites: 0, ProductionRequests: 0, ExternalLLMCalls: 0 };
  assert.equal(dedicatedViewRequestStatsAreSafe(safe), true);
  for (const unsafe of [{ POST: 4 }, { PATCH: 1 }, { DELETE: 1 }, { Publish: 2 }, { OpportunityWrites: 1 }, { BusinessWrites: 1 }, { ProductionRequests: 1 }, { ExternalLLMCalls: 1 }]) {
    assert.equal(dedicatedViewRequestStatsAreSafe({ ...safe, ...unsafe }), false);
  }
});

test("executor contains app-only PublishXml and no Opportunity mutation call", async () => {
  const source = await readFile(new URL("../scripts/dataverse/phase1c5r2g-d5-dedicated-opportunity-view.mjs", import.meta.url), "utf8");
  assert.match(source, /<appmodules><appmodule>/);
  assert.doesNotMatch(source, /<entities><entity>opportunity<\/entity><\/entities>/);
  assert.doesNotMatch(source, /dataversePatch|dataverseDelete/);
  assert.doesNotMatch(source, /\/api\/data\/v9\.2\/opportunities\([^)]*\)["'`]/);
});

test("private IDs remain under the ignored local-artifacts boundary", async () => {
  const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  const source = await readFile(new URL("../scripts/dataverse/phase1c5r2g-d5-dedicated-opportunity-view.mjs", import.meta.url), "utf8");
  assert.match(gitignore, /^local-artifacts\/$/m);
  assert.match(source, /local-artifacts\/d365\/d365-ai-demo-200-dedicated-view-private\.json/);
});
