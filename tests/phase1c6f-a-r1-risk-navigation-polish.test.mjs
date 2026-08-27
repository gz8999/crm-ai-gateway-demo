import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTypeScript(path) {
  const source = await readFile(path, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

test("latest opportunity selection aborts superseded requests and only applies the final result", async () => {
  const { LatestSelectionRequest } = await importTypeScript(new URL("../src/decision/latestSelectionRequest.ts", import.meta.url));
  const request = new LatestSelectionRequest();
  const aborted = [];
  const pending = new Map();
  const loader = (token) => (signal) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => { aborted.push(token); reject(new DOMException("aborted", "AbortError")); }, { once: true });
    pending.set(token, resolve);
  });

  const a = request.run(loader("A"));
  const b = request.run(loader("B"));
  const c = request.run(loader("C"));
  pending.get("C")("C");

  assert.deepEqual(await Promise.all([a, b, c]), [
    { status: "stale" },
    { status: "stale" },
    { status: "applied", value: "C" },
  ]);
  assert.deepEqual(aborted, ["A", "B"]);
});

test("queue scroll calculation leaves visible rows fixed and contains offscreen alignment", async () => {
  const { nextQueueScrollTop } = await importTypeScript(new URL("../src/decision/riskQueueScroll.ts", import.meta.url));
  assert.equal(nextQueueScrollTop({ scrollTop: 200, clientHeight: 400, rowTop: 240, rowHeight: 124 }), 200);
  assert.equal(nextQueueScrollTop({ scrollTop: 200, clientHeight: 400, rowTop: 100, rowHeight: 124 }), 92);
  assert.equal(nextQueueScrollTop({ scrollTop: 200, clientHeight: 400, rowTop: 650, rowHeight: 124 }), 382);
});

test("cockpit risk metrics navigate with exact queue filters", async () => {
  const model = await importTypeScript(new URL("../src/decision/productModel.ts", import.meta.url));
  const filters = { grade: "all", state: "all", highRiskOnly: false, showcaseOnly: false };
  const view = {
    opportunities: [
      { opportunityToken: "CRITICAL", priority: "Critical", healthScore: 20, healthGrade: "Z", reviewRequired: true },
      { opportunityToken: "HIGH", priority: "High", healthScore: 40, healthGrade: "D", reviewRequired: false },
      { opportunityToken: "REVIEW", priority: "Medium", healthScore: 65, healthGrade: "C", reviewRequired: true },
      { opportunityToken: "CLEAR", priority: "Low", healthScore: 85, healthGrade: "A", reviewRequired: false },
    ],
  };

  assert.deepEqual(model.filteredRiskOpportunities(view, filters, "critical").map((item) => item.opportunityToken), ["CRITICAL"]);
  assert.deepEqual(model.filteredRiskOpportunities(view, filters, "high").map((item) => item.opportunityToken), ["HIGH"]);
  assert.deepEqual(model.filteredRiskOpportunities(view, filters, "review").map((item) => item.opportunityToken), ["CRITICAL", "REVIEW"]);
});

test("cockpit metric cards are actionable and use the manual verification label", async () => {
  const [workspace, locales] = await Promise.all([
    readFile(new URL("../src/decision/DecisionWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/i18n/productLocales.ts", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /onClick=\{\(\) => onSelect\("critical"\)\}/);
  assert.match(workspace, /onClick=\{\(\) => onSelect\("high"\)\}/);
  assert.match(workspace, /onClick=\{\(\) => onSelect\("review"\)\}/);
  assert.match(workspace, /onNavigate\("risk"\)/);
  assert.match(locales, /"workspace\.reviewRequired": "需人工核验"/);
});

test("opportunity switching is local, scope-aware, and does not use ancestor scrolling", async () => {
  const [app, workspace, styles] = await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/decision/DecisionWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  const changeOpportunity = app.slice(app.indexOf("async function changeOpportunity"), app.indexOf("function changeAmountMode"));
  assert.match(changeOpportunity, /selectionRequest\.current\.run/);
  assert.match(changeOpportunity, /setPendingOpportunity\(token\)/);
  assert.doesNotMatch(changeOpportunity, /loadView\(|setLoading\(/);
  assert.match(workspace, /activeScopeIdentity/);
  assert.match(workspace, /aria-busy={busy}/);
  assert.match(workspace, /aria-busy={opportunitySwitching}/);
  assert.doesNotMatch(workspace, /scrollIntoView/);
  assert.match(workspace, /nextQueueScrollTop/);
  assert.match(styles, /\.risk-row[^}]*height:\s*124px[^}]*overflow-anchor:\s*none/s);
  assert.match(styles, /\.risk-queue-list[^}]*scrollbar-gutter:\s*stable[^}]*overscroll-behavior:\s*contain/s);
});

test("deep analysis precedes Audit only when the feature adds the eighth navigation", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const navigation = app.slice(app.indexOf("const NAVIGATION"), app.indexOf("const INITIAL_DATA_SOURCE"));
  const portfolio = navigation.indexOf('page: "portfolio"');
  const deep = navigation.indexOf('page: "deepAnalysis"');
  const audit = navigation.indexOf('page: "gateway"');
  assert.ok(portfolio < deep && deep < audit);
  assert.match(navigation, /PRODUCT_FEATURES\.deepAnalysis \? \[\{ page: "deepAnalysis" as const, label: "深度分析" \}\] : \[\]/);
  assert.equal(navigation.trim().endsWith("];"), true);
  assert.equal(navigation.lastIndexOf('page: "gateway"'), audit);
});
