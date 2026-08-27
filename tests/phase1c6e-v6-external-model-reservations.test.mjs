import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { createApp } from "../server/app.mjs";

async function importTypeScript(path) {
  const source = await readFile(path, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

test("v6 feature flags reserve status while deep analysis and comparison stay disabled", async () => {
  const { PRODUCT_FEATURES } = await importTypeScript(new URL("../src/config/features.ts", import.meta.url));
  assert.deepEqual(PRODUCT_FEATURES, { externalModelStatus: true, modelComparison: false, deepAnalysis: false });
});

test("external model UI maps disabled, incomplete, and ready states without triggering calls", async () => {
  const statusUi = await importTypeScript(new URL("../src/decision/externalModelUi.ts", import.meta.url));
  assert.equal(statusUi.externalAnalysisStatus(null), "disabled");
  assert.equal(statusUi.externalAnalysisStatusLabel(null, true), "外部模型：未启用");
  assert.equal(statusUi.externalAnalysisStatus({ providerRequested: "openai-compatible", externalAiEnabled: false, configured: false, fallbackReason: "Missing external LLM config: LLM_API_KEY" }), "configuration_missing");
  assert.equal(statusUi.externalAnalysisStatus({ providerRequested: "openai-compatible", externalAiEnabled: true, configured: true }), "ready");
});

test("provider status exposes configuration booleans and limits but never credentials", async () => {
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/provider-status`);
    assert.equal(response.ok, true);
    const body = await response.json();
    for (const key of ["baseUrlConfigured", "apiKeyConfigured", "modelConfigured", "timeoutMs", "retryPolicy", "maxResponseTokens", "schemaVersion", "lastConnectionCheckResult"]) assert.ok(Object.hasOwn(body.data, key), key);
    const serialized = JSON.stringify(body);
    for (const forbidden of ["LLM_API_KEY", "authorization", "Bearer ", "client_secret", "apiKeyValue", "baseUrlValue"]) assert.equal(serialized.includes(forbidden), false, forbidden);
  } finally {
    server.close();
  }
});

test("formal UI reserves external model status, DA-02, DA-07, and comparison without enabling actions", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const ui = await readFile(new URL("../src/decision/DecisionUi.tsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../src/decision/DecisionWorkspace.tsx", import.meta.url), "utf8");
  const audit = await readFile(new URL("../src/decision/AuditSafetyPage.tsx", import.meta.url), "utf8");
  const nav = app.slice(app.indexOf("const NAVIGATION"), app.indexOf("export default function App"));
  assert.match(nav, /PRODUCT_FEATURES\.deepAnalysis \? \[\{ page: "deepAnalysis" as const, label: "深度分析" \}\] : \[\]/);
  assert.match(ui, /externalAnalysisStatusLabel\(status, true\)/);
  assert.match(ui, /disabled={!PRODUCT_FEATURES\.deepAnalysis}/);
  assert.match(workspace, /templateId="DA-02"/);
  assert.match(workspace, /templateId="DA-07"/);
  assert.match(workspace, /Timeline 原文发送模型<\/dt><dd>否/);
  for (const label of ["输出结构校验", "安全校验", "引用校验", "响应耗时", "情报模式"]) assert.match(workspace, new RegExp(label));
  assert.match(audit, /模型与模型提供方/);
  assert.match(audit, /模型对比/);
  assert.match(audit, /外部模型对比尚未启用，完成安全授权和 Provider 配置后开放。/);
  assert.doesNotMatch(`${app}\n${workspace}\n${audit}`, /confirmAndRun|runExternal|callExternal|POST|PATCH/);
});

test("Audit configuration remains status-only and comparison controls are disabled", async () => {
  const audit = await readFile(new URL("../src/decision/AuditSafetyPage.tsx", import.meta.url), "utf8");
  for (const label of ["服务地址配置", "访问密钥配置", "外部调用授权", "请求超时", "重试策略", "最大响应", "输出结构版本", "最近连接检查"]) assert.match(audit, new RegExp(label));
  assert.match(audit, /<select disabled>/);
  assert.match(audit, /页面加载、导航和筛选变化均不会自动调用模型/);
    assert.doesNotMatch(audit, /LLM_API_KEY|process\.env|authorization\s*:\s*|Bearer\s+|完整 Safe Context|JSON\.stringify\(view\.safeContext\)/);
});

test("v6 defines loading, empty, error, blocked, and fallback product states", async () => {
  const ui = await readFile(new URL("../src/decision/DecisionUi.tsx", import.meta.url), "utf8");
  for (const state of ["loading", "empty", "error", "blocked", "fallback"]) assert.match(ui, new RegExp(`\\"${state}\\"`));
  assert.match(ui, /受控阻断/);
  assert.match(ui, /安全回退/);
});
