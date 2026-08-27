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

test("business labels localize stages, priorities, derived signals, and finding codes", async () => {
  const display = await importTypeScript(new URL("../src/decision/display.ts", import.meta.url));
  assert.equal(display.stageLabel("Develop"), "开发中");
  assert.equal(display.priorityLabel("Low"), "低风险");
  assert.equal(display.decisionText("within-7-days"), "7 天内");
  assert.equal(display.decisionText("partial"), "部分覆盖");
  assert.equal(display.decisionText("missing-decision-maker"), "关键决策人尚未覆盖");
  assert.equal(display.decisionText("missing-decision-maker, forecast-progress-conflict"), "关键决策人尚未覆盖、预测阶段与实际推进状态不一致");
  assert.equal(display.decisionText("unmapped-safe-signal"), "未映射的安全信号");
});

test("business source labels hide raw Safe Context keys while technical details retain them", async () => {
  const display = await importTypeScript(new URL("../src/decision/display.ts", import.meta.url));
  const ui = await readFile(new URL("../src/decision/DecisionUi.tsx", import.meta.url), "utf8");
  assert.equal(display.businessSourceLabel("safeContext.priority"), "优先级来源：CRM 脱敏字段");
  assert.equal(display.businessSourceLabel("safeContext.stagnationBand"), "推进状态来源：阶段停留与跟进频率");
  assert.equal(display.businessSourceLabel("safeContext.unknownSignal"), "来源：CRM 安全派生信号");
  assert.match(ui, /<details className="technical-details"><summary>查看技术详情<\/summary>/);
  assert.match(ui, /<code key=\{item\.source\}>\{item\.source\}<\/code>/);
  assert.match(ui, /businessSourceLabel\(item\.source\)/);
});

test("Action Board attributes every business field without inventing ownership or CRM deadlines", async () => {
  const model = await importTypeScript(new URL("../src/decision/productModel.ts", import.meta.url));
  const workspace = await readFile(new URL("../src/decision/DecisionWorkspace.tsx", import.meta.url), "utf8");
  const output = {
    id: "safe-output", title: "Safe", priority: "High", fact: [], inference: "Review", evidence: [], confidence: { level: "High", reason: "Stable" },
    recommendedAction: [{ title: "Review", reason: "Safe evidence", owner: "Owner token", due: "Within 2 days", status: "Draft only" }], providerUsed: "demo", fallbackReason: "", safeContextUsed: true, externalModelCalled: false, rawDataSent: false,
  };
  const view = { mode: "portfolio", scenario: null, scopeSummary: { scopeCount: 1 }, opportunities: [], pack: { risk: output, action: { ...output, recommendedAction: [] }, meeting: { ...output, recommendedAction: [] }, portfolio: { ...output, recommendedAction: [] } } };
  const [action] = model.productActions(view);
  assert.equal(action.owner, "待人工指定");
  assert.equal(action.ownerSource, "待人工指定");
  assert.equal(action.dueSource, "来源：模型建议（非 CRM 正式期限）");
  assert.equal(action.statusSource, "仅草案");
  assert.equal(action.reasonSource, "来源：模型建议");
  for (const label of ["建议角色", "建议期限", "建议状态", "行动依据"]) assert.match(workspace, new RegExp(label));
});

test("formal portfolio, audit, and status strip use finalized Chinese labels", async () => {
  const [model, workspace, audit, ui] = await Promise.all([
    importTypeScript(new URL("../src/decision/productModel.ts", import.meta.url)),
    readFile(new URL("../src/decision/DecisionWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/decision/AuditSafetyPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/decision/DecisionUi.tsx", import.meta.url), "utf8"),
  ]);
  const scope = model.portfolioScope({ mode: "portfolio", scenario: null, scopeSummary: { scopeCount: 100 } });
  assert.equal(scope.scopeLabel, "组合范围");
  assert.equal(scope.completeLabel, "完整本地组合");
  assert.doesNotMatch(workspace, />Scope<|>Portfolio Scope<|>Scenario Scope</);
  for (const label of ["模型提供方", "是否调用外部模型", "输出结构校验", "安全校验", "引用校验", "回退原因", "请求 ID", "客户端上下文指纹"]) assert.match(audit, new RegExp(label));
  assert.match(ui, /当前模型：\{status\?\.provider \|\| "demo"\}/);
  assert.match(ui, /外部模型未调用/);
});

test("R2 preserves disabled external model reservations and safe runtime boundaries", async () => {
  const [features, workspace, audit, main] = await Promise.all([
    importTypeScript(new URL("../src/config/features.ts", import.meta.url)),
    readFile(new URL("../src/decision/DecisionWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/decision/AuditSafetyPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/main.tsx", import.meta.url), "utf8"),
  ]);
  assert.deepEqual(features.PRODUCT_FEATURES, { externalModelStatus: true, modelComparison: false, deepAnalysis: false });
  assert.match(workspace, /templateId="DA-02"/);
  assert.match(workspace, /templateId="DA-07"/);
  assert.match(audit, /<select disabled>/);
  assert.match(main, /import\.meta\.env\.DEV/);
  assert.doesNotMatch(`${workspace}\n${audit}`, /runExternal|callExternal|CRM writeback|Dataverse/);
});
