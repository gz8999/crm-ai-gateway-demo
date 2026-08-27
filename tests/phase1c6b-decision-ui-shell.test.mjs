import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appPath = new URL("../src/App.tsx", import.meta.url);
const contractPath = new URL("../src/decision/contract.ts", import.meta.url);
const uiPath = new URL("../src/decision/DecisionUi.tsx", import.meta.url);
const serverPath = new URL("../server/app.mjs", import.meta.url);

test("decision navigation exposes the seven 6B workspaces and hides Legacy AI Lab", async () => {
  const source = await readFile(appPath, "utf8");
  const nav = source.slice(source.indexOf("const NAVIGATION"), source.indexOf("export default function App"));
  for (const label of ["AI 驾驶舱", "风险与优先级", "商机 360", "行动看板", "会议副驾", "组合洞察", "审计与安全"]) {
    assert.ok(nav.includes(label), `missing navigation label: ${label}`);
  }
  assert.doesNotMatch(nav, /aiLab|Legacy AI Lab/);
  assert.match(source, /DecisionWorkspace/);
});

test("unified output contract includes decision, provider, fallback, and safety fields", async () => {
  const source = await readFile(contractPath, "utf8");
  for (const field of ["fact", "inference", "evidence", "confidence", "recommendedAction", "priority", "providerUsed", "fallbackReason", "safeContextUsed", "externalModelCalled", "rawDataSent"]) {
    assert.match(source, new RegExp(`\\b${field}\\b`));
  }
  assert.match(source, /adaptRiskCase/);
  assert.match(source, /adaptActionBoardItem/);
  assert.match(source, /adaptLegacyActionResult/);
});

test("decision UI separates facts, inference, evidence, actions, confidence, and provider safety", async () => {
  const source = `${await readFile(uiPath, "utf8")}\n${await readFile(new URL("../src/decision/DecisionWorkspace.tsx", import.meta.url), "utf8")}`;
  for (const label of ["当前 CRM 事实", "AI 综合判断", "建议行动", "核心证据", "置信度", "当前模型", "回退原因", "Safe Context", "外部模型调用", "原始 CRM 数据外发"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /写回 CRM/);
});

test("provider status API exposes fallback without changing the existing endpoint", async () => {
  const source = await readFile(serverPath, "utf8");
  assert.match(source, /app\.get\("\/api\/ai\/provider-status"/);
  assert.match(source, /fallbackReason: status\.fallbackReason \|\| ""/);
  assert.match(source, /rawDataSent: false/);
});

test("new decision layer does not contain CRM writeback or sensitive raw field access", async () => {
  const source = `${await readFile(contractPath, "utf8")}\n${await readFile(uiPath, "utf8")}`;
  assert.doesNotMatch(source, /fetch\(|axios|PATCH|DELETE|customer_name|contact_email|exact_revenue|contract_text|meeting_transcript|aigw_opportunitylocation|polpod/i);
});
