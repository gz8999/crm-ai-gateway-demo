import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const auditPath = new URL("../src/decision/AuditSafetyPage.tsx", import.meta.url);

test("Audit presents external model capability as a governed enterprise progression", async () => {
  const source = await readFile(auditPath, "utf8");
  for (const label of ["外部模型能力", "未启用", "已配置", "安全验证通过", "可执行对比", "默认使用 Demo 模型", "管理员配置 + 用户主动触发"]) assert.ok(source.includes(label), label);
  assert.match(source, /comparisonAvailable === true/);
  assert.doesNotMatch(source, /\{status\?\.apiKey|\{status\?\.baseUrl|authorization\s*:\s*|Bearer\s+/i);
});

test("Model Comparison explains governance boundaries and shows safe comparison basis", async () => {
  const source = await readFile(auditPath, "utf8");
  const locales = await readFile(new URL("../src/i18n/productLocales.ts", import.meta.url), "utf8");
  for (const text of ["安全模型对比", "使用相同脱敏 CRM Context，比较不同模型输出一致性", "不会修改 CRM", "不会发送原始客户数据", "不会自动替代业务判断", "比较依据", "Safe Context Hash", "输入范围", "原始 CRM 发送"]) assert.match(source, new RegExp(text));
  assert.match(locales, /workspace\.dataSource[^\n]*数据来源/);
  assert.match(source, /view\?\.scopeSummary\.scopeCount/);
  assert.match(source, /t\("deepAnalysis\.no"\)/);
});

test("score cards use business Chinese rather than engineering metric names", async () => {
  const source = await readFile(auditPath, "utf8");
  for (const text of ["事实一致性检查", "证据覆盖检查", "优先级一致性", "置信等级一致性", "输出稳定性"]) assert.match(source, new RegExp(text));
  for (const text of ["Fact Accuracy", "Evidence Coverage", "Priority Alignment", "Confidence Alignment", "Stability"]) assert.doesNotMatch(source, new RegExp(text));
});

test("R1 keeps comparison and deep analysis defaults disabled", async () => {
  const features = await readFile(new URL("../src/config/features.ts", import.meta.url), "utf8");
  assert.match(features, /VITE_FEATURE_MODEL_COMPARISON === "true"/);
  assert.match(features, /VITE_FEATURE_DEEP_ANALYSIS === "true"/);
  assert.doesNotMatch(features, /deepAnalysis: true[,\n]/);
});
