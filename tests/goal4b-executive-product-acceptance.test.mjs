import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("Goal 4B keeps the deep analysis entrance explicitly gated and externally configurable", async () => {
  const [app, features, example, launcher] = await Promise.all([
    read("src/App.tsx"),
    read("src/config/features.ts"),
    read(".env.example"),
    read("scripts/start-external-demo.mjs"),
  ]);
  assert.match(app, /PRODUCT_FEATURES\.deepAnalysis/);
  assert.match(app, /page: "deepAnalysis"/);
  assert.match(features, /VITE_FEATURE_DEEP_ANALYSIS/);
  assert.match(example, /VITE_FEATURE_DEEP_ANALYSIS=true/);
  assert.match(example, /DEEP_ANALYSIS_HIGH_FIDELITY_ENABLED=false/);
  assert.match(launcher, /\.env\.external\.local/);
  assert.match(launcher, /VITE_FEATURE_DEEP_ANALYSIS = "true"/);
  assert.match(launcher, /CRM_WRITEBACK_ENABLED/);
  assert.match(launcher, /fileURLToPath\(import\.meta\.url\)/);
  assert.match(launcher, /"--prefix", root, "run", "dev:full"/);
});

test("Goal 4B exposes only safe CRM runtime status and keeps reconnect GET-only", async () => {
  const [app, widget, api] = await Promise.all([
    read("server/app.mjs"),
    read("src/decision/CrmConnectionWidget.tsx"),
    read("src/api.ts"),
  ]);
  assert.match(app, /app\.get\("\/api\/runtime\/crm-status"/);
  assert.match(app, /crmWritebackEnabled: false/);
  assert.match(app, /productionAccess: false/);
  assert.doesNotMatch(app, /app\.post\("\/api\/runtime\/crm-status"/);
  assert.match(widget, /getCrmRuntimeStatus\(\)/);
  assert.match(widget, /onStatusUpdate/);
  assert.match(api, /export function getCrmRuntimeStatus/);
});

test("Goal 4B high fidelity stays explicit, confirmed, and locale-aware", async () => {
  const [page, service, provider, locales] = await Promise.all([
    read("src/deepAnalysis/DeepAnalysisPage.tsx"),
    read("server/ai/deepAnalysis/deepAnalysisService.mjs"),
    read("server/ai/deepAnalysis/highFidelityProvider.mjs"),
    read("src/i18n/productLocales.ts"),
  ]);
  assert.match(page, /const analysisContextMode: AnalysisContextMode = enabled \? "high_fidelity_identity_redacted"/);
  assert.match(page, /highFidelityConfirmed: preview\.analysisContextMode === "high_fidelity_identity_redacted" \? true : undefined/);
  assert.match(page, /responseLocale: language/);
  assert.match(service, /High fidelity analysis confirmation required/);
  assert.match(provider, /identity-redacted/);
  assert.match(provider, /responseLocale/);
  assert.match(locales, /nav\.deepAnalysis/);
});

test("Goal 4B reports the current provider stop without claiming compatibility", async () => {
  const [report, final] = await Promise.all([
    read("docs/demo/goal4b-five-sample-validation.md"),
    read("docs/demo/goal4b-final-acceptance.md"),
  ]);
  assert.match(report, /Transport: `response_format=json_object`/);
  assert.match(report, /Provider Request Compatibility Ready: true/);
  assert.doesNotMatch(report, /data_contradiction_semantic_gate_failed/);
  assert.doesNotMatch(report, /sparse_no_actual_semantic_gate_failed/);
  assert.doesNotMatch(report, /semantic gate failed/);
  assert.match(final, /Goal 4B Ready=false/);
  assert.match(final, /CRM Writeback: false/);
  assert.match(final, /Production Requests: 0/);
});

test("Goal 4B R2 sample validation does not overwrite independent browser acceptance evidence", async () => {
  const runner = await read("scripts/run-goal4b-r2-final-validation.mjs");
  assert.match(runner, /await fs\.writeFile\(FIVE_SAMPLE_MD/);
  for (const unrelatedReport of ["goal4b-browser-validation", "goal4b-localization-checklist", "goal4b-crm-widget-acceptance", "goal4b-risk-initial-position"]) {
    assert.doesNotMatch(runner, new RegExp(unrelatedReport));
  }
});

test("Goal 4B risk queue selects the first ranked row on initial entry unless deep linked", async () => {
  const workspace = await read("src/decision/DecisionWorkspace.tsx");
  assert.match(workspace, /initialRiskSelectionApplied/);
  assert.match(workspace, /if \(deepLinkedToken\.current\) return;/);
  assert.match(workspace, /const firstToken = items\[0\]\?\.opportunityToken;/);
  assert.match(workspace, /selectedOpportunityToken !== firstToken\) onOpportunityChange\(firstToken\)/);
  assert.match(workspace, /listRef\.current\?\.scrollTo\(\{ top: 0, behavior: "auto" \}\)/);
});
