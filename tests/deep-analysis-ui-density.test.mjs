import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDeepAnalysisPreview } from "../server/ai/deepAnalysis/deepAnalysisContextBuilder.mjs";
import { buildHighFidelityRequest } from "../server/ai/deepAnalysis/highFidelityProvider.mjs";
import { getDeepAnalysisTemplate } from "../server/ai/deepAnalysis/templateRegistry.mjs";

test("deep analysis keeps CRM facts and sources compact by default", async () => {
  const [result, styles] = await Promise.all([
    readFile(new URL("../src/deepAnalysis/AnalysisResult.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);

  assert.match(result, /deep-fact-summary/);
  assert.match(result, /deep-fact-details/);
  assert.match(result, /description/);
  assert.match(result, /groupSources/);
  assert.match(result, /deep-source-reference-grid/);
  assert.match(styles, /deep-fact-summary p[^}]*-webkit-line-clamp: 4/s);
  assert.match(styles, /deep-fact-detail-grid[^}]*max-height: 320px[^}]*overflow: auto/s);
  assert.match(styles, /deep-source-reference-grid[^}]*max-height: 240px[^}]*overflow: auto/s);
});

test("deep analysis empty state prominently displays the masked opportunity code", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../src/deepAnalysis/DeepAnalysisPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /maskOpportunityToken\(view\.selectedOpportunity\)/);
  assert.match(page, /deep-snapshot-empty/);
  assert.match(page, /deep-empty-opportunity/);
  assert.match(page, /deep-empty-summary/);
  assert.match(page, /deepAnalysis\.currentOpportunityCode/);
  assert.match(page, /workspace\.currentStateStage/);
  assert.match(page, /workspace\.departmentScope/);
  assert.match(page, /workspace\.priority/);
  assert.match(page, /workspace\.opportunityHealth/);
  assert.match(styles, /deep-snapshot-empty[^}]*grid-template-columns: minmax\(220px, \.34fr\) minmax\(0, 1fr\)/s);
  assert.match(styles, /deep-empty-summary dl[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/s);
});

test("deep analysis formal page does not expose the obsolete single-opportunity live demo", async () => {
  const page = await readFile(new URL("../src/deepAnalysis/DeepAnalysisPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /runLiveNarrative/);
  assert.doesNotMatch(page, /deep-live-control/);
  assert.doesNotMatch(page, /DEMO-OPP-002/);
});

test("cockpit secondary status modules are collapsed by default", async () => {
  const [workspace, decisionUi, narrative, styles] = await Promise.all([
    readFile(new URL("../src/decision/DecisionWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/decision/DecisionUi.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/decision/NarrativePanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /<details className="scenario-status product-panel">/);
  assert.match(workspace, /<NarrativePanel compact collapsible/);
  assert.match(decisionUi, /<details className=\{`external-readiness-banner/);
  assert.match(narrative, /if \(collapsible\) return <details/);
  assert.doesNotMatch(styles, /content:\s*"收起"/u);
  assert.match(styles, /details\[open\] > summary \.collapsible-toggle::before/);
});

test("language selection defaults to Chinese and is forwarded to deep analysis", async () => {
  const [i18n, display, page, templateList, templateLocalization, result, boundary, provider, highFidelity, locales] = await Promise.all([
    readFile(new URL("../src/i18n/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/decision/display.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/deepAnalysis/DeepAnalysisPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/deepAnalysis/TemplateList.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/deepAnalysis/templateLocalization.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/deepAnalysis/AnalysisResult.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/deepAnalysis/DeepAnalysisRenderBoundary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/ai/deepAnalysis/deepAnalysisExternalProvider.mjs", import.meta.url), "utf8"),
    readFile(new URL("../server/ai/deepAnalysis/highFidelityProvider.mjs", import.meta.url), "utf8"),
    readFile(new URL("../server/ai/deepAnalysis/deepAnalysisLocalization.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(i18n, /if \(typeof localStorage === "undefined"\) return "zh-CN"/);
  assert.match(display, /Management view: The opportunity is progressing at a healthy cadence; continue normal monitoring/);
  assert.match(display, /管理视角：商机正按健康节奏推进/);
  assert.match(page, /responseLocale: language/g);
  assert.match(page, /session\.responseLocale === language/);
  assert.match(page, /previousLanguage\.current === language/);
  assert.match(page, /setResult\(null\)/);
  assert.match(page, /response\.data\.preview\.responseLocale !== language/);
  assert.match(templateList, /localizeDeepAnalysisTemplate\(template, language\)/);
  assert.match(templateLocalization, /現在案件の受注可能性とリスク分析/);
  assert.match(templateLocalization, /Current opportunity win and risk analysis/);
  assert.doesNotMatch(result, /未返回可验证|未命名情景|待人工指定|相关方动态/);
  assert.doesNotMatch(boundary, /深度分析结果渲染失败|返回的结果结构不完整|返回模板/);
  assert.match(provider, /normalizeDeepAnalysisLocale\(payload\.responseLocale\)/);
  assert.match(highFidelity, /normalizeDeepAnalysisLocale\(payload\.responseLocale\)/);
  assert.match(highFidelity, /Write all natural-language output in Japanese/);
  assert.match(highFidelity, /Write all natural-language output in English/);
  assert.match(locales, /"en-US"/);
  assert.match(locales, /"ja-JP"/);
});

test("deep analysis preview and model request use the selected response language", () => {
  const safeContext = { opportunityToken: "DEMO-OPP-TEST", accountToken: "A-TEST", elapsedPeriodCategory: "pipeline", timelineDigest: {}, timelineContentEvidence: [], varianceCategory: "within-band", accountAggregate: {}, stage: "qualify", priority: "medium", stagnationBand: "recent", revenueBand: "medium", marginBand: "medium" };
  const decisionView = { mode: "portfolio", safeContext, runtime: { department: { label: "Dept" }, sourceLabel: "D365 Frozen Dataset", dataSource: "d365-pilot" } };
  const preview = buildDeepAnalysisPreview({ template: getDeepAnalysisTemplate("DA-02"), responseLocale: "ja-JP", decisionView });
  assert.equal(preview.responseLocale, "ja-JP");
  assert.equal(preview.neverSent[0], "顧客名");
  assert.equal(preview.currentLimitations[0], "顧客履歴は未接続");
  assert.ok(preview.availableData.includes("金額帯"));

  const request = buildHighFidelityRequest({
    payload: { responseLocale: "ja-JP", highFidelityContext: { crmBusinessFacts: [{ evidenceToken: "EVID-1", value: "synthetic" }], timelineBusinessRecords: [] } },
    env: { LLM_MODEL: "test-model" },
  });
  assert.match(request.messages[0].content, /Write all natural-language output in Japanese/);
  assert.match(request.messages[0].content, /including the title, executive summary, Timeline synthesis/);
});

test("runtime labels and long-language layouts use the localization boundary", async () => {
  const [display, decisionUi, workspace, audit, result, locales, styles] = await Promise.all([
    readFile(new URL("../src/decision/display.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/decision/DecisionUi.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/decision/DecisionWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/decision/AuditSafetyPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/deepAnalysis/AnalysisResult.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/i18n/productLocales.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(display, /export function departmentLabel/);
  assert.match(display, /All departments/);
  assert.match(display, /export function deductionDimensionLabel/);
  assert.match(display, /Pipeline risk/);
  assert.match(display, /External model configuration is incomplete/);
  assert.match(decisionUi, /departmentLabel\(item, language\)/);
  assert.match(workspace, /decisionText\(scope\.completeLabel\)/);
  assert.match(workspace, /decisionText\(action\.owner\)/);
  assert.match(audit, /Model and provider/);
  assert.match(audit, /Client context fingerprint/);
  assert.match(result, /deepAnalysis\.crmOriginalNotice/);
  assert.match(locales, /Identity-redacted CRM original text follows and retains its source language/);
  assert.match(styles, /deep-safety-rail > dl[^}]*minmax\(76px, \.85fr\)/s);
  assert.match(styles, /@media \(max-width: 1500px\) and \(min-width: 761px\)/);
});
