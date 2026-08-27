import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Goal 4A runtime keeps Deep Analysis explicitly feature-gated", () => {
  const features = read("src/config/features.ts");
  assert.match(features, /VITE_FEATURE_DEEP_ANALYSIS === "true"/);
  assert.doesNotMatch(features, /deepAnalysis:\s*true/);
  const server = read("server/ai/deepAnalysis/deepAnalysisService.mjs");
  assert.match(server, /FEATURE_DEEP_ANALYSIS/);
  assert.match(server, /External deep analysis provider is not configured/);
  assert.match(server, /runDeepAnalysisExternal/);
});

test("Goal 4A narrative routes stay server-side and read-only", () => {
  const app = read("server/app.mjs");
  assert.match(app, /app\.get\("\/api\/llm-narrative\/snapshots"/);
  assert.match(app, /app\.post\("\/api\/llm-narrative\/live"/);
  assert.match(app, /confirmed: request\.body\?\.confirmed === true/);
  const client = read("src/api.ts");
  assert.match(client, /getNarrativeSnapshots/);
  assert.match(client, /runLiveNarrative/);
});

test("Goal 4A pages render validated narrative state without raw provider content", () => {
  const panel = read("src/decision/NarrativePanel.tsx");
  assert.match(panel, /Validated LLM Analysis Snapshot/);
  assert.match(panel, /CRM Writeback=false/);
  assert.doesNotMatch(panel, /rawResponse|toolArguments|Safe Context Payload/);
  const deep = read("src/deepAnalysis/DeepAnalysisPage.tsx");
  const confirmation = read("src/deepAnalysis/AnalysisConfirmation.tsx");
  const productLocales = read("src/i18n/productLocales.ts");
  assert.match(deep, /AnalysisConfirmation/);
  assert.match(confirmation, /onConfirm/);
  assert.match(productLocales, /DEMO-OPP-002/);
  assert.match(productLocales, /deepAnalysis\.liveDescription[^\n]*最多一次/);
});

test("Goal 4A current external result is fail-closed and bounded", () => {
  const report = read("docs/demo/gateway-final-completion-report.md");
  assert.match(report, /Validated External LLM Layer：Pending/);
  assert.match(report, /Narrative Snapshot：5\/8/);
  assert.match(report, /External LLM Calls：16\/16/);
  assert.match(report, /CRM Writeback：false/);
});
