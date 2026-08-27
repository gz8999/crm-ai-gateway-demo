import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createApp } from "../server/app.mjs";
import { PILOT_DEFAULT_OPPORTUNITY, PILOT_PRODUCTION_HOST, PILOT_TEST_HOST, assertPilotEnvironment, hasGuid } from "../server/pilot/pilotContract.mjs";
import { createPilotRuntimeService } from "../server/pilot/pilotRuntimeService.mjs";
import { assertFullPilotScope, buildPilotScope } from "../server/pilot/pilotSafeContext.mjs";

const OPPORTUNITY_TOKENS = ["015", "019", "026", "028", "031", "038", "056", "062", "081", "085", "086", "092", "130", "133", "135", "139", "142", "146", "155", "170", "181", "194", "196", "199"].map((suffix) => `DEMO-OPP-${suffix}`);

test("Pilot environment allows only the approved test host and approved Providers", () => {
  assert.equal(assertPilotEnvironment({ dataverseUrl: `https://${PILOT_TEST_HOST}` }, { AI_PROVIDER: "demo", ALLOW_EXTERNAL_AI: "false" }), PILOT_TEST_HOST);
  assert.throws(() => assertPilotEnvironment({ dataverseUrl: `https://${PILOT_PRODUCTION_HOST}` }, { AI_PROVIDER: "demo" }), /restricted/);
  assert.equal(assertPilotEnvironment({ dataverseUrl: `https://${PILOT_TEST_HOST}` }, { AI_PROVIDER: "openai-compatible", ALLOW_EXTERNAL_AI: "true" }), PILOT_TEST_HOST);
  assert.throws(() => assertPilotEnvironment({ dataverseUrl: `https://${PILOT_TEST_HOST}` }, { AI_PROVIDER: "unknown" }), /approved Provider/);
});

test("full Pilot scope preserves the frozen 24-record facts and filters departments before Safe Context", () => {
  const snapshot = pilotSnapshot();
  const all = buildPilotScope(snapshot, { department: "all", now: new Date("2027-01-15T00:00:00Z") });
  assertFullPilotScope(all);
  assert.deepEqual(all.counts, { opportunity: 24, account: 7, contact: 9, actual: 12, coverage: 15, timeline: 206, signal: 154, opportunityClose: 8, bpf: 24 });
  assert.deepEqual(all.stateDistribution, { active: 16, won: 7, lost: 1 });
  assert.equal(all.contexts.every((context) => context.stage === "Qualify"), true);
  assert.equal(all.contexts.every((context) => context.opportunityToken.startsWith("DEMO-OPP-")), true);

  const ff = buildPilotScope(snapshot, { department: "ff", now: new Date("2027-01-15T00:00:00Z") });
  assert.equal(ff.counts.opportunity, 17);
  assert.equal(ff.contexts.every((context) => context.salesDepartment === "FF"), true);
  assert.equal(ff.contexts.every((context) => context.accountAggregate.accountToken === context.accountToken), true);
});

test("Pilot runtime returns deterministic Decision Packs while keeping exact amounts outside Safe Context", async () => {
  const service = createPilotRuntimeService({ reader: { read: async () => pilotSnapshot() }, now: () => new Date("2027-01-15T00:00:00Z") });
  const view = await service.getPortfolio({ department: "all" });
  assert.equal(view.defaultOpportunity, PILOT_DEFAULT_OPPORTUNITY);
  assert.equal(view.scopeSummary.scopeCount, 24);
  assert.equal(view.amountDisplay.mode, "range");
  assert.equal(view.pack.risk.providerUsed, "demo");
  assert.equal(view.pack.risk.externalModelCalled, false);
  assert.equal(view.pack.risk.rawDataSent, false);
  assert.equal(hasGuid(view), false);
  assert.equal(Object.hasOwn(view.safeContext, "timelineContentEvidence"), false);
  assert.doesNotMatch(JSON.stringify(view.safeContext).toLowerCase(), /estimatedvalue|actualvalue|scenario|golden|timeline.*text|notetext/);

  const internalAnalysisContext = await service.getPortfolio({ department: "all", includeTimelineContent: true });
  assert.equal(Object.hasOwn(internalAnalysisContext.safeContext, "timelineContentEvidence"), true);

  const exact = await service.getOpportunity({ opportunityToken: PILOT_DEFAULT_OPPORTUNITY, department: "all", amountMode: "exact" });
  assert.equal(exact.amountDisplay.mode, "exact");
  assert.equal(typeof exact.amountDisplay.values.estimatedValue, "number");
  assert.equal(Object.values(exact.safeContext).includes(exact.amountDisplay.values.estimatedValue), false);

  const safe = await service.getSafeContext({ opportunityToken: PILOT_DEFAULT_OPPORTUNITY, department: "all" });
  assert.deepEqual(safe.safety, { customerIdentityMasked: true, exactAmountSentToModel: false, rawTimelineSent: false, crmWritebackEnabled: false, externalLlmEnabled: false });
  assert.doesNotMatch(JSON.stringify(safe), /\b\d{8}-\d{4}-\d{4}-\d{4}-\d{12}\b/);
});

test("Pilot APIs are GET-only and use injected allowlisted service results", async () => {
  const service = createPilotRuntimeService({ reader: { read: async () => pilotSnapshot() }, now: () => new Date("2027-01-15T00:00:00Z") });
  const app = createApp({ pilotService: service });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const status = await getJson(`${base}/api/pilot/runtime-status`);
    assert.equal(status.data.recordCount, 24);
    assert.equal(status.data.departments.length, 8);
    assert.equal(status.data.departments.filter((item) => item.id !== "all").length, 7);
    const view = await getJson(`${base}/api/pilot/portfolio?department=ff`);
    assert.equal(view.data.scopeSummary.scopeCount, 17);
    const detail = await getJson(`${base}/api/pilot/opportunities/${view.data.defaultOpportunity}?department=ff`);
    assert.equal(detail.data.runtime.department.id, "ff");
    const safe = await getJson(`${base}/api/pilot/safe-context/${view.data.defaultOpportunity}?department=ff`);
    assert.equal(safe.data.safety.exactAmountSentToModel, false);
    const pack = await getJson(`${base}/api/pilot/decision-pack/${view.data.defaultOpportunity}?department=ff`);
    assert.equal(pack.data.provider, "demo");

    const write = await fetch(`${base}/api/pilot/portfolio`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(write.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Pilot implementation has no write calls, production access, raw Timeline exposure, or runtime Scenario metadata", async () => {
  const files = (await readdir(path.resolve("server/pilot"))).filter((name) => name.endsWith(".mjs"));
  const sources = await Promise.all(files.map((name) => readFile(path.resolve("server/pilot", name), "utf8")));
  const source = sources.join("\n");
  const readerSource = await readFile(path.resolve("server/pilot/pilotDataverseReader.mjs"), "utf8");
  assert.doesNotMatch(source, /dataverse(?:Post|Patch|Delete)|PublishXml/);
  assert.equal((source.match(new RegExp(PILOT_PRODUCTION_HOST.replaceAll(".", "\\."), "g")) || []).length, 1, "production hostname appears only in the denylist constant");
  assert.match(readerSource, /notetext/);
  assert.match(source, /buildTimelineContentEvidence/);
  assert.doesNotMatch(source, /primaryScenario|secondarySignals|Golden Assertions|expectedAnswer/);

  const appSource = await readFile(path.resolve("src/App.tsx"), "utf8");
  const localeSource = await readFile(path.resolve("src/i18n/productLocales.ts"), "utf8");
  assert.match(appSource, /INITIAL_DATA_SOURCE[\s\S]+d365-pilot/);
  assert.match(appSource, /app\.status\.d365ReadFailed/);
  assert.match(localeSource, /D365 Pilot 读取失败，未切换本地数据/);
  assert.doesNotMatch(appSource, /catch[\s\S]{0,160}getDecisionView\("portfolio"/);
});

function pilotSnapshot() {
  const departmentValues = [1, 2, 2, 3, 4, 5, ...Array(17).fill(6), 91];
  const accountIds = Array.from({ length: 7 }, (_, index) => `account-${index + 1}`);
  const opportunityIds = OPPORTUNITY_TOKENS.map((_, index) => `opportunity-${index + 1}`);
  const entries = {
    Account: accountIds.map((id, index) => ({ id, token: `DEMO-ACC-${index + 1}` })),
    Contact: Array.from({ length: 9 }, (_, index) => ({ id: `contact-${index + 1}`, token: `DEMO-CON-${index + 1}` })),
    Opportunity: opportunityIds.map((id, index) => ({ id, token: OPPORTUNITY_TOKENS[index], bpfId: `bpf-${index + 1}`, bpfStage: "授予资格" })),
    ActualManagement: Array.from({ length: 12 }, (_, index) => ({ id: `actual-${index + 1}`, token: `DEMO-ACT-${index + 1}` })),
    ServiceCoverage: Array.from({ length: 15 }, (_, index) => ({ id: `coverage-${index + 1}`, token: `DEMO-COV-${index + 1}` })),
    Timeline: Array.from({ length: 206 }, (_, index) => ({ id: `timeline-${index + 1}`, token: `DEMO-TL-${index + 1}` })),
    InteractionSignal: Array.from({ length: 154 }, (_, index) => ({ id: `signal-${index + 1}`, token: `DEMO-SIG-${index + 1}` })),
  };
  const opportunities = opportunityIds.map((id, index) => ({
    opportunityid: id,
    statecode: index < 7 ? 1 : index === 7 ? 2 : 0,
    statuscode: index < 7 ? 3 : index === 7 ? 4 : 1,
    estimatedclosedate: index >= 8 ? "2026-12-01T00:00:00Z" : "2026-06-01T00:00:00Z",
    estimatedvalue: 200000 + index * 10000,
    actualvalue: index < 8 ? 150000 + index * 10000 : 0,
    _parentaccountid_value: accountIds[index % accountIds.length],
    _parentcontactid_value: `contact-${(index % 9) + 1}`,
    aigw_salesdepartment_choice: departmentValues[index],
    aigw_yearrevenuebudget: 300000,
    aigw_yeargpmpbudget: 30000,
    aigw_yearrevenueactual: index < 12 ? 180000 : 0,
    aigw_budgetstatus: true,
    aigw_transportmode: index % 2 ? 1 : 3,
    _aigw_airpollookup_value: index % 2 ? "air-pol" : null,
    _aigw_airpodlookup_value: index % 2 ? "air-pod" : null,
    _aigw_sealandpollookup_value: index % 2 ? null : "sea-pol",
    _aigw_sealandpodlookup_value: index % 2 ? null : "sea-pod",
    aigw_customerneed_choice: 1,
    aigw_proposalcontent_choice: 1,
  }));
  const actuals = Array.from({ length: 12 }, (_, index) => ({ aigw_actualmanagementid: `actual-${index + 1}`, _aigw_opportunityid_value: opportunityIds[index], aigw_annualactualrevenue: 180000, aigw_aprilactualgp: 18000 }));
  const coverages = Array.from({ length: 15 }, (_, index) => ({ aigw_customerservicecoverageid: `coverage-${index + 1}`, _aigw_accountid_value: accountIds[index % 7], aigw_coveragestatus: index % 3, aigw_servicetype: index % 5 }));
  const signals = Array.from({ length: 154 }, (_, index) => ({ aigw_interactionsignalid: `signal-${index + 1}`, _aigw_accountid_value: accountIds[index % 7], _aigw_opportunityid_value: opportunityIds[index % 24], aigw_sourceactivitytoken: `DEMO-TL-${index + 1}`, aigw_activitydate: "2027-01-17T00:00:00Z", aigw_decisionmakerinvolved: index % 3 === 0, aigw_objectionpresent: index % 5 === 0, aigw_commitmentmade: index % 4 === 0, aigw_commitmentcompleted: index % 8 === 0 }));
  const activities = Array.from({ length: 206 }, (_, index) => ({ activityid: `timeline-${index + 1}`, _regardingobjectid_value: opportunityIds[index % 24], activitytypecode: index % 3 ? "phonecall" : "task" }));
  const bpfRows = opportunityIds.map((id, index) => ({ businessprocessflowinstanceid: `bpf-${index + 1}`, _bpf_opportunityid_value: id, "_activestageid_value@OData.Community.Display.V1.FormattedValue": "授予资格", statecode: 0, statuscode: 1 }));
  return {
    loadedAt: "2027-01-15T00:00:00.000Z",
    entries,
    accounts: accountIds.map((accountid) => ({ accountid })),
    contacts: Array.from({ length: 9 }, (_, index) => ({ contactid: `contact-${index + 1}`, _parentcustomerid_value: accountIds[index % 7] })),
    opportunities,
    actuals,
    coverages,
    signals,
    timeline: { activities, annotations: [] },
    closes: opportunityIds.slice(0, 8).map((id, index) => ({ activityid: `close-${index + 1}`, _opportunityid_value: id })),
    bpfRows,
    requestStats: { GET: 27, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, ProductionRequests: 0, ExternalLLMCalls: 0, CRMWrites: 0 },
  };
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) assert.fail(`${response.status} ${await response.text()}`);
  return response.json();
}
