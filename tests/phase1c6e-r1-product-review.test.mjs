import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const appPath = new URL("../src/App.tsx", import.meta.url);
const mainPath = new URL("../src/main.tsx", import.meta.url);
const workspacePath = new URL("../src/decision/DecisionWorkspace.tsx", import.meta.url);
const uiPath = new URL("../src/decision/DecisionUi.tsx", import.meta.url);
const auditPath = new URL("../src/decision/AuditSafetyPage.tsx", import.meta.url);
const stylesPath = new URL("../src/styles.css", import.meta.url);

async function importTypeScript(path) {
  const source = await readFile(path, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

test("formal product has three compact rows and seven differentiated workspaces", async () => {
  const [app, workspace, ui] = await Promise.all([readFile(appPath, "utf8"), readFile(workspacePath, "utf8"), readFile(uiPath, "utf8")]);
  for (const label of ["AI 驾驶舱", "风险与优先级", "商机 360", "行动看板", "会议副驾", "组合洞察", "审计与安全"]) assert.match(app, new RegExp(label));
  assert.match(app, /product-topbar/);
  assert.match(app, /DecisionContextBar/);
  assert.match(app, /ProviderSafetyStrip/);
  for (const page of ["CockpitPage", "RiskPage", "Opportunity360Page", "ActionBoardPage", "MeetingPage", "PortfolioPage"]) assert.match(workspace, new RegExp(`function ${page}`));
  for (const label of ["部门", "分析视角", "分析场景", "脱敏商机", "金额显示", "重置"]) assert.match(ui, new RegExp(label));
});

test("formal App statically imports no Legacy AI Lab or raw CRM operations", async () => {
  const [app, main] = await Promise.all([readFile(appPath, "utf8"), readFile(mainPath, "utf8")]);
  for (const forbidden of ["InternalAiLab", "getOpportunities", "transformOpportunity", "runAiFunction", "importOpportunities", "resetDemoData"]) assert.doesNotMatch(app, new RegExp(forbidden));
  assert.doesNotMatch(main, /^import .*InternalAiLab/m);
  assert.match(main, /import\.meta\.env\.DEV\s*&&\s*window\.location\.pathname === "\/internal\/ai-lab"/);
  assert.match(main, /import\("\.\/internal\/InternalAiLab"\)/);
  assert.match(main, /InternalRouteUnavailable/);
});

test("formal audit is allowlisted and never renders Safe Context payload", async () => {
  const audit = await readFile(auditPath, "utf8");
  assert.match(audit, /客户端上下文指纹（非服务端审计凭证）/);
  assert.match(audit, /当前审计源未提供/);
  assert.match(audit, /仅展示聚合数量，不展示 Safe Context Payload 或字段值/);
  assert.match(audit, /外部模型对比尚未启用，完成安全授权和 Provider 配置后开放。/);
  assert.doesNotMatch(audit, /JSON\.stringify\(view\.safeContext\)|<pre>|customer_name|contact_email|contract_text/);
});

test("product model keeps actions source-bound and scope labels explicit", async () => {
  const model = await importTypeScript(new URL("../src/decision/productModel.ts", import.meta.url));
  const output = {
    id: "safe-output", title: "Safe", priority: "High", fact: [], inference: "Review", evidence: [{ label: "Evidence", value: "Band", source: "safeContext.stage" }], confidence: { level: "High", reason: "Stable" },
    recommendedAction: [{ title: "Review", reason: "Safe evidence", owner: "Owner token" }], providerUsed: "demo", fallbackReason: "", safeContextUsed: true, externalModelCalled: false, rawDataSent: false,
  };
  const view = { mode: "scenario", scenario: { title: "Risk focus" }, scopeSummary: { scopeCount: 12 }, opportunities: [{ priority: "High", opportunityToken: "B" }, { priority: "Critical", opportunityToken: "C" }, { priority: "High", opportunityToken: "A" }], pack: { risk: output, action: { ...output, recommendedAction: [] }, meeting: { ...output, recommendedAction: [] }, portfolio: { ...output, recommendedAction: [] } } };
  const [action] = model.productActions(view);
  assert.equal(action.owner, "待人工指定");
  assert.equal(action.due, "待人工确定");
  assert.equal(action.status, "待人工确定");
  assert.deepEqual(model.sortedRiskOpportunities(view).map((item) => item.opportunityToken), ["C", "A", "B"]);
  assert.deepEqual(model.portfolioScope(view), { modeLabel: "场景聚焦", scenarioLabel: "Risk focus", scopeLabel: "场景范围", count: 12, completeLabel: "场景筛选范围" });
  assert.equal(model.canonicalJson({ z: 1, a: { y: 2, x: [3, 1] } }), '{"a":{"x":[3,1],"y":2},"z":1}');
});

test("risk detail scheduler deduplicates, caches, limits concurrency, and cancels stale scope", async () => {
  const { RiskDetailPool, riskDetailKey } = await importTypeScript(new URL("../src/decision/riskDetailPool.ts", import.meta.url));
  const pool = new RiskDetailPool(3);
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const releases = [];
  const loader = (value) => (signal) => new Promise((resolve, reject) => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    const abort = () => { active -= 1; reject(new DOMException("aborted", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    releases.push(() => { signal.removeEventListener("abort", abort); active -= 1; resolve(value); });
  });
  const sameA = pool.load("portfolio|portfolio|A", loader("A"));
  const sameB = pool.load("portfolio|portfolio|A", loader("duplicate"));
  assert.equal(sameA, sameB);
  const promises = [sameA, pool.load("B", loader("B")), pool.load("C", loader("C")), pool.load("D", loader("D"))];
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(maxActive, 3);
  assert.equal(calls, 3);
  releases.shift()();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 4);
  for (const release of releases.splice(0)) release();
  assert.deepEqual(await Promise.all(promises), ["A", "B", "C", "D"]);
  assert.equal(await pool.load("portfolio|portfolio|A", loader("not-called")), "A");
  assert.equal(calls, 4);
  const stale = pool.load("stale", loader("stale"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  pool.cancelStale();
  await assert.rejects(stale, { name: "AbortError" });
  assert.equal(riskDetailKey("scenario", "healthy-control", "DEMO"), "scenario|healthy-control|DEMO");
});

test("responsive product CSS keeps navigation scrollable and Audit in document flow", async () => {
  const styles = await readFile(stylesPath, "utf8");
  assert.match(styles, /@media \(max-width: 1280px\)/);
  const mobile = styles.slice(styles.lastIndexOf("@media (max-width: 760px)"));
  assert.match(mobile, /\.product-app \.tabs[^}]*overflow-x:\s*auto/s);
  assert.match(mobile, /\.product-app \.decision-context-bar[^}]*grid-template-columns:\s*1fr/s);
  assert.match(mobile, /\.decision-context-rail[^}]*position:\s*static/s);
  assert.match(mobile, /\.audit-status-grid[^}]*grid-template-columns:\s*1fr/s);
});
