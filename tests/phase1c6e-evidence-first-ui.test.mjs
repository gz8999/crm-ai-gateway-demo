import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appPath = new URL("../src/App.tsx", import.meta.url);
const uiPath = new URL("../src/decision/DecisionUi.tsx", import.meta.url);
const workspacePath = new URL("../src/decision/DecisionWorkspace.tsx", import.meta.url);
const displayPath = new URL("../src/decision/display.ts", import.meta.url);
const stylesPath = new URL("../src/styles.css", import.meta.url);

test("6E defaults to Chinese evidence-first navigation and hides the language control", async () => {
  const source = await readFile(appPath, "utf8");
  for (const label of ["AI 驾驶舱", "风险与优先级", "商机 360", "行动看板", "会议副驾", "组合洞察", "审计与安全"]) assert.match(source, new RegExp(label));
  assert.doesNotMatch(source.match(/<header className="topbar">([\s\S]*?)<\/header>/)?.[1] || "", /LanguageSwitcher/);
});

test("6F uses the approved D365 department catalog and keeps exact amount session-only", async () => {
  const app = await readFile(appPath, "utf8");
  const ui = await readFile(uiPath, "utf8");
  const display = await readFile(displayPath, "utf8");
  const locales = await readFile(new URL("../src/i18n/productLocales.ts", import.meta.url), "utf8");
  for (const department of ["全部部门", "Dept1 Industry", "Dept1 Distribution", "Dept2 LCMS", "Dept3 Project Cargo", "Dept3 Dangerous Goods", "FF", "Others"]) {
    assert.match(`${ui}\n${display}`, new RegExp(department));
  }
  assert.match(ui, /disabled={dataSource !== "d365-pilot"}/);
  assert.match(app, /useState<AmountDisplayMode>\("range"\)/);
  assert.match(locales, /精确金额仅在当前受控界面展示，不会发送给外部模型。/);
  assert.doesNotMatch(`${app}\n${ui}`, /localStorage|sessionStorage|URLSearchParams/);
});

test("6E masks opportunity identity and presents the three-column decision chain", async () => {
  const display = await readFile(displayPath, "utf8");
  const workspace = await readFile(workspacePath, "utf8");
  assert.match(display, /SAFE-OPP-/);
  for (const className of ["risk-queue", "opportunity-decision-grid", "decision-context-rail"]) assert.match(workspace, new RegExp(className));
  assert.match(workspace, /客户历史尚未接入/);
  assert.match(workspace, /外部事实/);
  assert.match(workspace, /精确金额发送模型<\/dt><dd>否/);
});

test("6E responsive rules cover desktop, compact desktop, and narrow viewport", async () => {
  const styles = await readFile(stylesPath, "utf8");
  assert.match(styles, /grid-template-columns:\s*minmax\(250px, 290px\) minmax\(500px, 1fr\) minmax\(240px, 280px\)/);
  assert.match(styles, /@media \(max-width: 1280px\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\.evidence-workspace-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
});
