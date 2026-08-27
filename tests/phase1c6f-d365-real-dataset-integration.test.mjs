import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createApp } from "../server/app.mjs";
import {
  D365_FROZEN_DEFAULT_OPPORTUNITY,
  D365_FROZEN_EXPECTED_COUNTS,
  D365_FROZEN_EXPECTED_STATE,
  D365_FROZEN_PRODUCTION_HOST,
  D365_FROZEN_TEST_HOST,
  assertFrozenEnvironment,
  buildFrozenManifestEntries,
  buildFrozenScope,
} from "../server/d365/frozenDatasetContract.mjs";
import { createFrozenDatasetRuntimeService } from "../server/d365/frozenDatasetRuntimeService.mjs";

test("Frozen Dataset environment is test-only with an approved Provider", () => {
  assert.equal(assertFrozenEnvironment({ dataverseUrl: `https://${D365_FROZEN_TEST_HOST}` }, { AI_PROVIDER: "demo", ALLOW_EXTERNAL_AI: "false" }), D365_FROZEN_TEST_HOST);
  assert.throws(() => assertFrozenEnvironment({ dataverseUrl: `https://${D365_FROZEN_PRODUCTION_HOST}` }, { AI_PROVIDER: "demo" }), /approved test environment/);
  assert.equal(assertFrozenEnvironment({ dataverseUrl: `https://${D365_FROZEN_TEST_HOST}` }, { AI_PROVIDER: "openai-compatible", ALLOW_EXTERNAL_AI: "true" }), D365_FROZEN_TEST_HOST);
  assert.throws(() => assertFrozenEnvironment({ dataverseUrl: `https://${D365_FROZEN_TEST_HOST}` }, { AI_PROVIDER: "unknown" }), /approved Provider/);
});

test("frozen private manifest is an exact 3900-record server-side allowlist", async () => {
  const manifest = JSON.parse(await readFile("local-artifacts/d365/d365-ai-demo-200-d6-full-import-private.json", "utf8"));
  const entries = buildFrozenManifestEntries(manifest);
  assert.deepEqual(Object.fromEntries(Object.entries(entries).map(([key, rows]) => [key, rows.length])), {
    Account: 60,
    Contact: 120,
    Opportunity: 200,
    ActualManagement: 130,
    ServiceCoverage: 240,
    Timeline: 1800,
    InteractionSignal: 1350,
  });
  assert.equal(new Set(entries.Opportunity.map((row) => row.token)).has(D365_FROZEN_DEFAULT_OPPORTUNITY), true);
  assert.equal(entries.Opportunity.every((row) => row.bpfId && row.bpfStage === "授予资格"), true);
});

test("runtime builds a 200-opportunity Safe Context scope with frozen state facts", async () => {
  const service = createFrozenDatasetRuntimeService({ reader: { read: async () => frozenSnapshot() }, now: () => new Date("2027-01-15T00:00:00Z") });
  const view = await service.getPortfolio({ department: "all", amountMode: "range" });
  assert.equal(view.runtime.sourceLabel, "D365 Frozen Dataset");
  assert.equal(view.defaultOpportunity, D365_FROZEN_DEFAULT_OPPORTUNITY);
  assert.equal(view.scopeSummary.scopeCount, 200);
  assert.deepEqual(view.runtime.counts, D365_FROZEN_EXPECTED_COUNTS);
  assert.deepEqual(view.runtime.stateDistribution, D365_FROZEN_EXPECTED_STATE);
  assert.equal(view.opportunities.length, 200);
  assert.equal(view.opportunities.filter((item) => item.scoreShowcase).length, 24);
  assert.equal(view.opportunities.every((item) => item.opportunityState && item.salesDepartment && item.mainDeductionDimension), true);
  assert.equal(view.pack.risk.providerUsed, "demo");
  assert.equal(view.pack.risk.externalModelCalled, false);
  assert.equal(view.pack.risk.rawDataSent, false);
  assert.equal(JSON.stringify(view).includes("estimatedvalue"), false);
  assert.equal(JSON.stringify(view).includes("description"), false);
  assert.equal(JSON.stringify(view).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi), null);

  const ff = await service.getPortfolio({ department: "ff" });
  assert.equal(ff.runtime.department.id, "ff");
  assert.equal(ff.safeContext.salesDepartment, "FF");
  assert.equal(ff.runtime.completePilotScope, false);
});

test("frozen runtime APIs are read-only and do not fall back to local data", async () => {
  const service = createFrozenDatasetRuntimeService({ reader: { read: async () => frozenSnapshot() }, now: () => new Date("2027-01-15T00:00:00Z") });
  const app = createApp({ frozenDatasetService: service, env: { AI_PROVIDER: "demo", ALLOW_EXTERNAL_AI: "false" } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const status = await waitForFrozenRuntimeStatus(base);
    assert.equal(status.data.available, true);
    assert.equal(status.data.recordCount, 200);
    assert.equal(status.data.label, "D365 Frozen Dataset");
    const view = await getJson(`${base}/api/d365-frozen/portfolio?department=all`);
    assert.equal(view.data.defaultOpportunity, D365_FROZEN_DEFAULT_OPPORTUNITY);
    const write = await fetch(`${base}/api/d365-frozen/portfolio`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(write.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("production App reads the Frozen Dataset endpoint and does not request the scenario catalog", async () => {
  const app = await readFile("src/App.tsx", "utf8");
  const api = await readFile("src/api.ts", "utf8");
  assert.match(app, /getFrozenPortfolio/);
  assert.match(app, /getFrozenRuntimeStatus/);
  assert.match(api, /\/api\/d365-frozen\//);
  assert.match(app, /INITIAL_DATA_SOURCE === "d365-pilot" \? Promise\.resolve\(\{ data: null \}\) : getDecisionScenarios/);
});

function frozenSnapshot() {
  const entries = {
    Account: Array.from({ length: 60 }, (_, index) => ({ id: `account-${index + 1}`, token: `A-${String(index + 1).padStart(3, "0")}` })),
    Contact: Array.from({ length: 120 }, (_, index) => ({ id: `contact-${index + 1}`, token: `C-${String(index + 1).padStart(3, "0")}` })),
    Opportunity: Array.from({ length: 200 }, (_, index) => ({ id: `opportunity-${index + 1}`, token: `DEMO-OPP-${String(index + 1).padStart(3, "0")}`, bpfId: `bpf-${index + 1}`, bpfStage: "授予资格" })),
    ActualManagement: Array.from({ length: 130 }, (_, index) => ({ id: `actual-${index + 1}`, token: `ACT-${String(index + 1).padStart(3, "0")}` })),
    ServiceCoverage: Array.from({ length: 240 }, (_, index) => ({ id: `coverage-${index + 1}`, token: `COV-${String(index + 1).padStart(3, "0")}` })),
    Timeline: Array.from({ length: 1800 }, (_, index) => ({ id: `timeline-${index + 1}`, token: `TL-${String(index + 1).padStart(4, "0")}` })),
    InteractionSignal: Array.from({ length: 1350 }, (_, index) => ({ id: `signal-${index + 1}`, token: `SIG-${String(index + 1).padStart(4, "0")}` })),
  };
  const accountId = (index) => `account-${(index % 60) + 1}`;
  const opportunityId = (index) => `opportunity-${(index % 200) + 1}`;
  const department = (index) => [1, 2, 3, 4, 5, 6, 91][index % 7];
  const opportunities = Array.from({ length: 200 }, (_, index) => ({
    opportunityid: `opportunity-${index + 1}`,
    statecode: index < 91 ? 1 : index < 191 ? 0 : 2,
    statuscode: index < 91 ? 3 : index < 191 ? 1 : 4,
    estimatedclosedate: index < 191 ? "2027-01-10T00:00:00Z" : "2026-12-01T00:00:00Z",
    estimatedvalue: 200000,
    actualvalue: index < 91 ? 180000 : 0,
    _parentaccountid_value: accountId(index),
    _parentcontactid_value: `contact-${(index % 120) + 1}`,
    aigw_salesdepartment_choice: department(index),
    aigw_yearrevenuebudget: 300000,
    aigw_yeargpmpbudget: 30000,
    aigw_yearrevenueactual: index < 130 ? 180000 : 0,
    aigw_budgetstatus: true,
    aigw_transportmode: index % 2 ? 1 : 3,
    _aigw_airpollookup_value: index % 2 ? "air-pol" : null,
    _aigw_airpodlookup_value: index % 2 ? "air-pod" : null,
    _aigw_sealandpollookup_value: index % 2 ? null : "sea-pol",
    _aigw_sealandpodlookup_value: index % 2 ? null : "sea-pod",
    aigw_customerneed_choice: 1,
    aigw_proposalcontent_choice: 1,
  }));
  const actuals = entries.ActualManagement.map((entry, index) => ({ aigw_actualmanagementid: entry.id, _aigw_opportunityid_value: opportunityId(index), aigw_annualactualrevenue: 180000, aigw_aprilactualgp: 18000 }));
  const coverages = entries.ServiceCoverage.map((entry, index) => ({ aigw_customerservicecoverageid: entry.id, _aigw_accountid_value: accountId(index), aigw_coveragestatus: index % 3, aigw_servicetype: index % 5 }));
  const activities = entries.Timeline.map((entry, index) => ({ activityid: entry.id, _regardingobjectid_value: opportunityId(index), activitytypecode: index % 3 ? "phonecall" : "task" }));
  const signals = entries.InteractionSignal.map((entry, index) => ({ aigw_interactionsignalid: entry.id, _aigw_accountid_value: accountId(index), _aigw_opportunityid_value: opportunityId(index), aigw_sourceactivitytoken: entries.Timeline[index % 1800].token, aigw_activitydate: "2027-01-10T00:00:00Z", aigw_decisionmakerinvolved: index % 3 === 0, aigw_objectionpresent: index % 5 === 0, aigw_commitmentmade: index % 4 === 0, aigw_commitmentcompleted: index % 8 === 0 }));
  const bpfRows = entries.Opportunity.map((entry) => ({ businessprocessflowinstanceid: entry.bpfId, _bpf_opportunityid_value: entry.id, "_activestageid_value@OData.Community.Display.V1.FormattedValue": "授予资格", statecode: 0, statuscode: 1 }));
  const closes = Array.from({ length: 100 }, (_, index) => ({ activityid: `close-${index + 1}`, _opportunityid_value: opportunityId(index) }));
  const contacts = entries.Contact.map((entry, index) => ({ contactid: entry.id, _parentcustomerid_value: accountId(Math.floor(index / 2)) }));
  const accounts = entries.Account.map((entry) => ({ accountid: entry.id }));
  return { loadedAt: "2027-01-15T00:00:00.000Z", entries, accounts, contacts, opportunities, actuals, coverages, signals, timeline: { activities, annotations: [] }, closes, bpfRows, requestStats: { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, ProductionRequests: 0, ExternalLLMCalls: 0, CRMWrites: 0 } };
}

async function getJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${body.error || "request failed"}`);
  return body;
}

async function waitForFrozenRuntimeStatus(base) {
  let latest;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    latest = await getJson(`${base}/api/d365-frozen/runtime-status`);
    if (latest.data.available && latest.data.recordCount === 200) return latest;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return latest;
}
