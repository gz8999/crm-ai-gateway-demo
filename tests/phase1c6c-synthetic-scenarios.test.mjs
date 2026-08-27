import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createApp } from "../server/app.mjs";
import { generateDecisionPortfolio, decisionPortfolioConstants } from "../server/decision/generatePortfolio.mjs";
import { getDecisionPortfolioForTests, getDecisionView, listDecisionScenarios, portfolioDefaultOpportunity, scenarioDescriptors } from "../server/decision/decisionService.mjs";

const portfolioFile = new URL("../server/data/decision-portfolio.json", import.meta.url);
const goldenFile = new URL("./fixtures/decision-scenario-goldens.json", import.meta.url);
const expectedCounts = Object.fromEntries(decisionPortfolioConstants.scenarios);

test("committed fixture is deterministic and has the fixed 20/20/10/100/100 model", async () => {
  const committed = JSON.parse(await readFile(portfolioFile, "utf8"));
  assert.deepEqual(generateDecisionPortfolio(), committed);
  assert.equal(committed.accounts.length, 20);
  assert.equal(committed.contacts.length, 20);
  assert.equal(committed.owners.length, 10);
  assert.equal(committed.opportunities.length, 100);
  assert.equal(committed.actuals.length, 100);
  assert.equal(new Set(committed.opportunities.map((item) => item.id)).size, 100);
  assert.equal(committed.opportunities.every((item) => item.id.startsWith("DEMO-6C-")), true);
  assert.equal(committed.accounts.every((account) => committed.opportunities.filter((item) => item.accountId === account.id).length === 5), true);
  assert.equal(committed.owners.every((owner) => committed.opportunities.filter((item) => item.ownerId === owner.id).length === 10), true);
});

test("every opportunity has one complete Actual with valid monthly margins", async () => {
  const committed = JSON.parse(await readFile(portfolioFile, "utf8"));
  const actualCounts = new Map();
  for (const actual of committed.actuals) {
    actualCounts.set(actual.opportunityId, (actualCounts.get(actual.opportunityId) || 0) + 1);
    assert.equal(Object.keys(actual.monthly).length, 12);
    assert.ok(actual.marginPercent >= 5 && actual.marginPercent <= 15);
    for (const month of decisionPortfolioConstants.months) {
      const row = actual.monthly[month];
      assert.ok(row);
      for (const key of ["budgetRevenue", "budgetGrossProfit", "actualRevenue", "actualGrossProfit"]) assert.equal(typeof row[key], "number");
      if (row.budgetRevenue) assert.ok(row.budgetGrossProfit / row.budgetRevenue >= 0.049 && row.budgetGrossProfit / row.budgetRevenue <= 0.151);
      if (row.actualRevenue) assert.ok(row.actualGrossProfit / row.actualRevenue >= 0.049 && row.actualGrossProfit / row.actualRevenue <= 0.151);
    }
  }
  assert.equal(committed.opportunities.every((item) => actualCounts.get(item.id) === 1), true);
});

test("scenario distribution and explicit defaults are stable", () => {
  const { rawPortfolio } = getDecisionPortfolioForTests();
  const distribution = Object.fromEntries(Object.keys(expectedCounts).map((id) => [id, rawPortfolio.opportunities.filter((item) => item.primaryScenario === id).length]));
  assert.deepEqual(distribution, expectedCounts);
  assert.equal(portfolioDefaultOpportunity, "DEMO-6C-OPP-075");
  for (const descriptor of scenarioDescriptors) {
    assert.equal(rawPortfolio.opportunities.some((item) => item.id === descriptor.defaultOpportunity && item.primaryScenario === descriptor.id), true, descriptor.id);
  }
});

test("Safe Context excludes identity, exact monthly values, route masters, Timeline, scenarios, and Golden keys", () => {
  const { safePortfolio } = getDecisionPortfolioForTests();
  const serialized = JSON.stringify(safePortfolio);
  for (const forbidden of ["primaryScenario", "secondarySignals", "locationCode", "polCode", "podCode", "monthly", "budgetRevenue", "actualRevenue", "contactId", "name", "timeline", "scenarioId", "forbiddenClaims", "requiredText"]) {
    assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
  for (const context of safePortfolio.contexts) {
    for (const key of ["meetingWindow", "stakeholderCoverage", "openQuestionCount", "decisionReadiness"]) assert.ok(Object.hasOwn(context, key));
    for (const key of ["serviceCoverageBand", "whitespaceCategory", "opportunityTrend", "relationshipMaturity"]) assert.ok(Object.hasOwn(context.accountAggregate, key));
  }
});

test("Golden assertions cover eight differentiated, deterministic contract outputs", async () => {
  const goldens = JSON.parse(await readFile(goldenFile, "utf8"));
  const signatures = new Set();
  for (const descriptor of scenarioDescriptors) {
    const golden = goldens[descriptor.id];
    const first = getDecisionView({ mode: "scenario", scenarioId: descriptor.id });
    const second = getDecisionView({ mode: "scenario", scenarioId: descriptor.id });
    assert.deepEqual(first, second, descriptor.id);
    assert.equal(first.selectedOpportunity, golden.defaultOpportunity);
    const outputs = Object.values(first.pack);
    assert.equal(outputs.length, 6);
    for (const output of outputs) assertUnifiedOutput(output, first);
    const primary = first.pack.risk;
    assert.equal(primary.priority, golden.priority, descriptor.id);
    assert.equal(primary.confidence.level, golden.confidence, descriptor.id);
    const allText = JSON.stringify(outputs).toLowerCase();
    for (const text of golden.requiredText) assert.ok(allText.includes(text.toLowerCase()), `${descriptor.id}: ${text}`);
    for (const claim of golden.forbiddenClaims) assert.equal(allText.includes(claim.toLowerCase()), false, `${descriptor.id}: ${claim}`);
    signatures.add(`${primary.priority}|${primary.confidence.level}|${primary.inference}|${primary.recommendedAction[0].title}`);
  }
  assert.equal(signatures.size, 8);
});

test("meeting, growth, route, and healthy outputs obey scenario-specific safety constraints", () => {
  const meeting = getDecisionView({ mode: "scenario", scenarioId: "meeting-prep" });
  const meetingText = JSON.stringify(meeting.pack.meeting).toLowerCase();
  assert.match(meetingText, /meetingwindow|open questions|decision readiness/);
  assert.doesNotMatch(meetingText, /timeline|email body|phone transcript/);

  const growth = getDecisionView({ mode: "scenario", scenarioId: "growth-opportunity" });
  const growthText = JSON.stringify(growth.pack.risk).toLowerCase();
  assert.match(growthText, /hypothesis/);
  assert.match(growthText, /whitespacecategory|opportunitytrend/);

  const route = JSON.stringify(getDecisionView({ mode: "scenario", scenarioId: "location-route-risk" }).pack).toLowerCase();
  assert.match(route, /internal route|verification/);
  assert.doesNotMatch(route, /port closure|customs delay|sanction|real-world disruption/);

  const healthy = getDecisionView({ mode: "scenario", scenarioId: "healthy-control" }).pack.risk;
  assert.equal(healthy.priority, "Monitor");
  assert.equal(healthy.confidence.level, "High");
  assert.doesNotMatch(JSON.stringify(healthy).toLowerCase(), /critical|high risk|escalate immediately|stalled/);
});

test("three decision endpoints are GET-only, scoped, safe, and separate from Legacy opportunities", async () => {
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const catalog = await getJson(`${base}/api/decision-scenarios`);
    assert.equal(catalog.data.scenarios.length, 8);
    const view = await getJson(`${base}/api/decision-view?mode=portfolio`);
    assert.equal(view.data.opportunities.length, 100);
    assert.equal(view.data.selectedOpportunity, "DEMO-6C-OPP-075");
    assert.equal(JSON.stringify(view).includes("primaryScenario"), false);
    const detail = await getJson(`${base}/api/decision-opportunities/DEMO-6C-OPP-043?mode=scenario&scenarioId=growth-opportunity`);
    assert.equal(detail.data.safeContext.opportunityToken, "DEMO-6C-OPP-043");
    assert.equal((await fetch(`${base}/api/decision-view?mode=unknown`)).status, 400);
    assert.equal((await fetch(`${base}/api/decision-opportunities/DEMO-6C-OPP-001?mode=scenario&scenarioId=healthy-control`)).status, 404);
    const legacy = await getJson(`${base}/api/opportunities`);
    assert.equal(legacy.data.some((item) => String(item.id).startsWith("DEMO-6C-")), false);
  } finally {
    server.close();
  }
});

test("Golden metadata is test-only and cannot be imported by runtime source", async () => {
  const runtimeFiles = [...await walk("src"), ...await walk("server")];
  for (const file of runtimeFiles.filter((item) => /\.(tsx?|mjs)$/.test(item))) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /decision-scenario-goldens|tests\/fixtures|forbiddenClaims|requiredText/, file);
  }
  const appSource = await readFile("src/App.tsx", "utf8");
  const apiSource = await readFile("src/api.ts", "utf8");
  assert.match(appSource, /DecisionWorkspace/);
  assert.match(appSource, /resetPortfolio/);
  assert.match(apiSource, /getDecisionScenarios/);
  assert.match(apiSource, /getDecisionView/);
});

function assertUnifiedOutput(output, view) {
  for (const key of ["fact", "inference", "evidence", "confidence", "recommendedAction", "priority", "providerUsed", "fallbackReason", "safeContextUsed", "externalModelCalled", "rawDataSent"]) assert.ok(Object.hasOwn(output, key), key);
  assert.ok(output.fact.length);
  assert.ok(output.evidence.length);
  assert.ok(output.recommendedAction.length);
  assert.equal(output.providerUsed, "demo");
  assert.equal(output.safeContextUsed, true);
  assert.equal(output.externalModelCalled, false);
  assert.equal(output.rawDataSent, false);
  const traceable = new Set(["safeAggregate.scopeCount", "safeAggregate.escalatedCount"]);
  flattenKeys(view.safeContext, "safeContext", traceable);
  for (const item of [...output.fact, ...output.evidence]) assert.ok(traceable.has(item.source), `untraceable: ${item.source}`);
}

function flattenKeys(value, prefix, target) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const pathName = `${prefix}.${key}`;
    target.add(pathName);
    flattenKeys(child, pathName, target);
  }
}

async function getJson(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true, `${response.status} ${url}`);
  return response.json();
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  }))).flat();
}
