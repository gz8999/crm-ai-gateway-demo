import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { createApp } from "../server/app.mjs";
import { buildDeepAnalysisPreview } from "../server/ai/deepAnalysis/deepAnalysisContextBuilder.mjs";
import { createDeepAnalysisService } from "../server/ai/deepAnalysis/deepAnalysisService.mjs";
import { publicDeepAnalysisOutputValidationReason, validateDeepAnalysisOutput } from "../server/ai/deepAnalysis/deepAnalysisSchema.mjs";
import { validateDeepAnalysisProviderPayload } from "../server/ai/deepAnalysis/deepAnalysisSafety.mjs";
import { DEEP_ANALYSIS_TEMPLATES, getDeepAnalysisTemplate, listDeepAnalysisTemplates } from "../server/ai/deepAnalysis/templateRegistry.mjs";

const enabledEnv = Object.freeze({ FEATURE_DEEP_ANALYSIS: "true", AI_PROVIDER: "demo", ALLOW_EXTERNAL_AI: "false" });
const defaultInput = Object.freeze({ role: "demo-full-access", templateCode: "DA-02", mode: "scenario", scenarioId: "multi-risk-priority", opportunityToken: "DEMO-6C-OPP-075" });

test("feature flag defaults off and conditionally adds the eighth navigation", async () => {
  const [features, app] = await Promise.all([readFile(new URL("../src/config/features.ts", import.meta.url), "utf8"), readFile(new URL("../src/App.tsx", import.meta.url), "utf8")]);
  const compiled = ts.transpileModule(features, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const imported = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  assert.equal(imported.PRODUCT_FEATURES.deepAnalysis, false);
  assert.match(features, /VITE_FEATURE_DEEP_ANALYSIS === "true"/);
  assert.match(app, /PRODUCT_FEATURES\.deepAnalysis \?/);
  assert.match(app, /label: "深度分析"/);
});

test("registry defines nine stable templates and honest dependency states", () => {
  assert.deepEqual(DEEP_ANALYSIS_TEMPLATES.map((item) => item.code), ["DA-01", "DA-02", "DA-03", "DA-04", "DA-05", "DA-06", "DA-07", "DA-08", "DA-09"]);
  assert.equal(new Set(DEEP_ANALYSIS_TEMPLATES.map((item) => item.code)).size, 9);
  for (const item of DEEP_ANALYSIS_TEMPLATES) for (const key of ["code", "title", "description", "targetRole", "requiredData", "optionalData", "unavailableDependencies", "providerPolicy", "estimatedDuration", "enabled", "blockedReason", "outputSections", "version"]) assert.ok(Object.hasOwn(item, key), `${item.code}:${key}`);
  assert.equal(getDeepAnalysisTemplate("DA-02").enabled, true);
  assert.equal(getDeepAnalysisTemplate("DA-07").enabled, true);
  assert.equal(getDeepAnalysisTemplate("DA-09").enabled, false);
  for (const item of DEEP_ANALYSIS_TEMPLATES.filter((template) => !template.enabled)) assert.ok(item.blockedReason, item.code);
  assert.equal(listDeepAnalysisTemplates({ featureEnabled: false }).every((item) => item.runtimeEnabled === false), true);
});

test("preview is explicit, safe, and does not run the provider", () => {
  const template = getDeepAnalysisTemplate("DA-07");
  const preview = buildDeepAnalysisPreview({ template, ...defaultInput, templateCode: undefined });
  assert.equal(preview.externalModelCalled, false);
  assert.equal(validateDeepAnalysisProviderPayload(preview.providerInput).ok, true);
  const serialized = JSON.stringify(preview.providerInput);
  for (const forbidden of ["multi-risk-priority", "scenarioId", "primaryScenario", "golden", "timelineText", "customerName", "exactAmount", "locationCode", "polCode", "podCode", "monthly"]) assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  for (const meetingKey of ["meetingWindow", "stakeholderCoverage", "openQuestionCount", "decisionReadiness"]) assert.ok(Object.hasOwn(preview.providerInput.derivedSignals, meetingKey), meetingKey);
});

test("run requires feature, role, explicit confirmation, and configured external mode", async () => {
  await assert.rejects(() => createDeepAnalysisService({ env: {} }).run({ ...defaultInput, confirmed: true }), /feature is disabled/);
  await assert.rejects(() => createDeepAnalysisService({ env: enabledEnv }).run({ ...defaultInput, role: "administrator", confirmed: true }), /role is not authorized/);
  await assert.rejects(() => createDeepAnalysisService({ env: enabledEnv }).run(defaultInput), /Explicit confirmation required/);
  await assert.rejects(() => createDeepAnalysisService({ env: { ...enabledEnv, AI_PROVIDER: "openai-compatible", ALLOW_EXTERNAL_AI: "true" } }).run({ ...defaultInput, confirmed: true }), /External deep analysis provider is not configured/);
});

test("deterministic output validates and keeps unavailable fact sources empty", async () => {
  const service = createDeepAnalysisService({ env: enabledEnv });
  const first = await service.run({ ...defaultInput, requestId: "deep-test-001", confirmed: true });
  const second = await service.run({ ...defaultInput, requestId: "deep-test-002", confirmed: true });
  assert.equal(first.status, "完成");
  assert.equal(validateDeepAnalysisOutput(first.output).ok, true);
  assert.deepEqual(first.output.customerHistoryFacts, []);
  assert.deepEqual(first.output.externalFacts, []);
  assert.deepEqual(first.output.internalCapabilityFacts, []);
  assert.equal(first.output.aiInferences.every((item) => item.label === "AI 推断，不是 CRM 事实"), true);
  assert.deepEqual({ ...first.output, requestId: "stable" }, { ...second.output, requestId: "stable" });
  const text = JSON.stringify(first.output);
  assert.doesNotMatch(text, /\b\d{4}-\d{2}-\d{2}\b|[$€£¥]\s?\d|guaranteed|confirmed external/i);
  assert.equal(first.output.recommendedActions.every((item) => item.suggestedRole === "待人工指定" && ["仅草案", "Draft"].includes(item.status) && item.suggestedHorizon.includes("非 CRM 正式期限")), true);
});

test("output validation reports only an allowlisted contract reason", async () => {
  const service = createDeepAnalysisService({ env: enabledEnv });
  const valid = await service.run({ ...defaultInput, requestId: "deep-validation-reason-001", confirmed: true });
  const validation = validateDeepAnalysisOutput({ ...valid.output, timelineExecutiveSynthesis: {} });
  assert.equal(validation.ok, false);
  assert.equal(validation.reason, "invalid_timeline_executive_synthesis");
  assert.equal(publicDeepAnalysisOutputValidationReason(validation), "invalid_timeline_executive_synthesis");
  assert.equal(publicDeepAnalysisOutputValidationReason({ reason: "invalid_customer_name:secret" }), "output_contract_invalid");
});

test("cancellation and reset affect only process memory", async () => {
  const service = createDeepAnalysisService({ env: enabledEnv });
  const pending = service.run({ ...defaultInput, requestId: "deep-cancel-001", confirmed: true });
  assert.equal(service.cancel("deep-cancel-001"), true);
  const cancelled = await pending;
  assert.equal(cancelled.status, "已取消");
  assert.equal(service.listAudit()[0].status, "cancelled");
  service.reset();
  assert.equal(service.listAudit().length, 0);
  assert.equal(service.getResult("deep-cancel-001"), null);
});

test("API is gated, preview-only before confirmation, resettable, and audit is allowlisted", async () => {
  const app = createApp({ env: enabledEnv });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const catalog = await requestJson(`${base}/api/deep-analysis/templates`);
    assert.equal(catalog.data.featureEnabled, true);
    const preview = await requestJson(`${base}/api/deep-analysis/preview`, { method: "POST", body: JSON.stringify(defaultInput) });
    assert.equal(preview.data.provider, "demo");
    assert.equal(JSON.stringify(preview).includes("providerInput"), false);
    assert.equal((await requestJson(`${base}/api/deep-analysis/audit`)).data.length, 0);
    const run = await requestJson(`${base}/api/deep-analysis/run`, { method: "POST", body: JSON.stringify({ ...defaultInput, requestId: "deep-api-001", confirmed: true }) });
    assert.equal(run.data.status, "完成");
    const audit = (await requestJson(`${base}/api/deep-analysis/audit`)).data[0];
    for (const key of ["requestId", "templateCode", "templateVersion", "opportunityToken", "accountToken", "role", "departmentScopeStatus", "safeContextHash", "dataCategories", "missingDependencies", "provider", "latencyMs", "schemaStatus", "safetyStatus", "status", "timestamp"]) assert.ok(Object.hasOwn(audit, key), key);
    const auditText = JSON.stringify(audit);
    for (const forbidden of ["providerInput", "safeDecisionContext", "executiveSummary", "apiKey", "baseUrl", "authorization", "exactAmount", "timelineText"]) assert.equal(auditText.includes(forbidden), false, forbidden);
    await requestJson(`${base}/api/deep-analysis/results`, { method: "DELETE" });
    assert.equal((await requestJson(`${base}/api/deep-analysis/audit`)).data.length, 0);
  } finally { server.close(); }
});

test("UI requires confirmation and never auto-runs deep analysis", async () => {
  const [page, confirmation, api, app, productLocales] = await Promise.all([readFile(new URL("../src/deepAnalysis/DeepAnalysisPage.tsx", import.meta.url), "utf8"), readFile(new URL("../src/deepAnalysis/AnalysisConfirmation.tsx", import.meta.url), "utf8"), readFile(new URL("../src/api.ts", import.meta.url), "utf8"), readFile(new URL("../src/App.tsx", import.meta.url), "utf8"), readFile(new URL("../src/i18n/productLocales.ts", import.meta.url), "utf8")]);
  assert.match(confirmation, /deepAnalysis\.startDemo/);
  assert.match(confirmation, /deepAnalysis\.neverSend/);
  assert.match(confirmation, /deepAnalysis\.demoWillRun/);
  assert.match(confirmation, /type="button"/);
  assert.match(confirmation, /event\.preventDefault\(\)/);
  assert.match(confirmation, /!running && \(!high \|\| highFidelityConfirmed\)/);
  assert.match(productLocales, /deepAnalysis\.startDemo/);
  assert.match(productLocales, /deepAnalysis\.neverSend/);
  assert.match(productLocales, /deepAnalysis\.demoWillRun/);
  assert.match(page, /previewDeepAnalysis/);
  assert.match(page, /confirmed: true/);
  assert.doesNotMatch(page, /const nextRequestId = crypto\.randomUUID\(\)/);
  assert.match(page, /function createRequestId\(\)/);
  assert.match(page, /getRandomValues/);
  assert.doesNotMatch(app, /runDeepAnalysis|previewDeepAnalysis/);
  assert.match(api, /\/api\/deep-analysis\/run/);
  assert.doesNotMatch(page, /localStorage|sessionStorage|正在调用外部模型/);
});

test("UI isolates malformed deep-analysis results instead of blanking the workspace", async () => {
  const [page, result, boundary, productLocales] = await Promise.all([readFile(new URL("../src/deepAnalysis/DeepAnalysisPage.tsx", import.meta.url), "utf8"), readFile(new URL("../src/deepAnalysis/AnalysisResult.tsx", import.meta.url), "utf8"), readFile(new URL("../src/deepAnalysis/DeepAnalysisRenderBoundary.tsx", import.meta.url), "utf8"), readFile(new URL("../src/i18n/productLocales.ts", import.meta.url), "utf8")]);
  assert.match(page, /DeepAnalysisRenderBoundary/);
  assert.match(page, /深度分析结果渲染失败|AnalysisResult/);
  assert.match(result, /normalizeOutput/);
  assert.match(result, /stringArray\(item\.supports\)/);
  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(boundary, /this\.props\.body/);
  assert.match(productLocales, /未写回 CRM/);
  assert.match(productLocales, /CRM への書き戻しはありません/);
  assert.match(productLocales, /Nothing was written back to CRM/);
});

async function requestJson(url, options = {}) {
  const response = await fetch(url, { headers: { "content-type": "application/json" }, ...options });
  if (!response.ok) assert.fail(`${response.status}:${url}:${await response.text()}`);
  return response.json();
}
