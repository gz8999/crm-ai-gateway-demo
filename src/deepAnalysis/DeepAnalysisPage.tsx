import { useEffect, useRef, useState } from "react";
import { cancelDeepAnalysis, getDeepAnalysisTemplates, previewDeepAnalysis, resetDeepAnalysis, runDeepAnalysis } from "../api";
import { useI18n } from "../i18n";
import { departmentLabel, maskOpportunityToken, priorityLabel, stageLabel } from "../decision/display";
import type { AmountDisplayMode, DecisionDataSource, DecisionView, PilotDepartmentId } from "../decision/types";
import { NarrativePanel } from "../decision/NarrativePanel";
import type { NarrativeSnapshot } from "../narrative";
import { AnalysisConfirmation } from "./AnalysisConfirmation";
import { AnalysisProgress } from "./AnalysisProgress";
import { AnalysisResult } from "./AnalysisResult";
import { DeepAnalysisRenderBoundary } from "./DeepAnalysisRenderBoundary";
import { DeepAnalysisSafetyRail } from "./DeepAnalysisSafetyRail";
import { TemplateList } from "./TemplateList";
import type { AnalysisContextMode, DeepAnalysisCatalog, DeepAnalysisPhase, DeepAnalysisPreview, DeepAnalysisResult, DeepAnalysisTemplate } from "./types";

type Session = { selectedCode: string; preview: DeepAnalysisPreview | null; result: DeepAnalysisResult | null; phase: DeepAnalysisPhase; responseLocale: string };
let session: Session = { selectedCode: "", preview: null, result: null, phase: "未开始", responseLocale: "zh-CN" };
const ROLE = "demo-full-access";

export function DeepAnalysisPage({ amountDisplayMode, dataSource, department, narrativeSnapshots = [], scenarioId, view }: { amountDisplayMode: AmountDisplayMode; dataSource: DecisionDataSource; department: PilotDepartmentId; narrativeSnapshots?: NarrativeSnapshot[]; scenarioId: string; view: DecisionView | null }) {
  const { language, t } = useI18n();
  const sessionMatchesLanguage = session.responseLocale === language;
  const previousLanguage = useRef(language);
  const [catalog, setCatalog] = useState<DeepAnalysisCatalog | null>(null);
  const [selectedCode, setSelectedCode] = useState(session.selectedCode);
  const [preview, setPreview] = useState<DeepAnalysisPreview | null>(sessionMatchesLanguage && session.preview?.analysisContextMode !== "high_fidelity_identity_redacted" ? session.preview : null);
  const [result, setResult] = useState<DeepAnalysisResult | null>(sessionMatchesLanguage && session.result?.output?.safety.analysisContextMode !== "high_fidelity_identity_redacted" ? session.result : null);
  const [phase, setPhase] = useState<DeepAnalysisPhase>(sessionMatchesLanguage ? session.phase : "未开始");
  const [highFidelityConfirmed, setHighFidelityConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");

  useEffect(() => { getDeepAnalysisTemplates().then((response) => setCatalog(response.data)).catch((loadError) => setError(loadError instanceof Error ? loadError.message : t("deepAnalysis.unavailable"))); }, [t]);
  useEffect(() => { session = { selectedCode, preview, result, phase, responseLocale: language }; }, [language, phase, preview, result, selectedCode]);
  useEffect(() => {
    if (previousLanguage.current === language) return;
    previousLanguage.current = language;
    if (requestId) void cancelDeepAnalysis(requestId).catch(() => undefined);
    setPreview(null);
    setResult(null);
    setPhase("未开始");
    setError("");
    setRequestId("");
    setHighFidelityConfirmed(false);
    session = { selectedCode, preview: null, result: null, phase: "未开始", responseLocale: language };
  }, [language, requestId, selectedCode]);

  async function selectTemplate(template: DeepAnalysisTemplate) {
    if (!view || !template.runtimeEnabled) return;
    setError(""); setSelectedCode(template.code); setResult(null); setPhase("构建 Safe Context");
    try {
      const response = await previewDeepAnalysis({ templateCode: template.code, mode: view.mode, scenarioId: view.mode === "scenario" ? scenarioId : "", opportunityToken: view.selectedOpportunity, role: ROLE, responseLocale: language, analysisContextMode: "standard_safe", dataSource, department });
      setPreview(response.data); setPhase("等待确认");
    } catch (previewError) { setError(previewError instanceof Error ? previewError.message : t("deepAnalysis.unavailable")); setPhase("已阻断"); }
  }

  async function toggleHighFidelity(enabled: boolean) {
    if (!selected || !view || !preview?.highFidelityAvailable) return;
    setHighFidelityConfirmed(false); setError(""); setPhase("构建 Safe Context");
    const analysisContextMode: AnalysisContextMode = enabled ? "high_fidelity_identity_redacted" : "standard_safe";
    try {
      const response = await previewDeepAnalysis({ templateCode: selected.code, mode: view.mode, scenarioId: view.mode === "scenario" ? scenarioId : "", opportunityToken: view.selectedOpportunity, role: ROLE, responseLocale: language, analysisContextMode, dataSource, department });
      setPreview(response.data); setPhase("等待确认");
    } catch (previewError) { setError(previewError instanceof Error ? previewError.message : t("deepAnalysis.unavailable")); setPhase("已阻断"); }
  }

  async function confirmRun() {
    if (!view || !preview) return;
    const nextRequestId = createRequestId();
    setRequestId(nextRequestId); setError(""); setPhase(preview.provider === "openai-compatible" ? "模型分析中" : "Demo 分析中");
    try {
      const response = await runDeepAnalysis({ requestId: nextRequestId, templateCode: preview.templateCode, mode: view.mode, scenarioId: view.mode === "scenario" ? scenarioId : "", opportunityToken: view.selectedOpportunity, role: ROLE, confirmed: true, highFidelityConfirmed: preview.analysisContextMode === "high_fidelity_identity_redacted" ? true : undefined, responseLocale: language, analysisContextMode: preview.analysisContextMode || "standard_safe", dataSource, department });
      if (response.data.preview.responseLocale !== language) throw new Error(t("deepAnalysis.localeMismatch"));
      setResult(response.data); setHighFidelityConfirmed(false); setPhase(response.data.status === "已取消" ? "已取消" : "完成");
    } catch (runError) { setError(runError instanceof Error ? runError.message : t("deepAnalysis.unavailable")); setPhase("失败"); }
  }

  async function cancelRun() { if (requestId) await cancelDeepAnalysis(requestId).catch(() => undefined); setPhase("已取消"); }
  async function reset() { await resetDeepAnalysis().catch(() => undefined); setSelectedCode(""); setPreview(null); setResult(null); setPhase("未开始"); setError(""); setRequestId(""); setHighFidelityConfirmed(false); }
  const selected = catalog?.templates.find((item) => item.code === selectedCode) || null;
  const validatedSnapshot = narrativeSnapshots.find((item) => item.opportunityToken === view?.selectedOpportunity) || null;
  const running = ["构建 Safe Context", "安全检查", "模型分析中", "Demo 分析中", "输出结构校验", "安全校验"].includes(phase);

  return <section className="deep-analysis-page decision-workspace" data-page="deep-analysis"><header className="decision-page-header"><div><span>{t("deepAnalysis.eyebrow")}</span><h2>{t("deepAnalysis.heading")}</h2><p>{t("deepAnalysis.description")}</p></div><div><strong>{dataSource === "d365-pilot" ? t("crm.dataSourceD365") : t("crm.dataSourceFixture")} · {t("deepAnalysis.crmWritebackLabel")}={t("deepAnalysis.no")}</strong><button onClick={reset}>{t("deepAnalysis.reset")}</button></div></header>
    {error ? <section className="deep-error" role="alert"><strong>{t("deepAnalysis.unavailable")}</strong><span>{error}</span></section> : null}
    {validatedSnapshot ? <NarrativePanel snapshot={validatedSnapshot} title={t("deepAnalysis.snapshot")} /> : <SnapshotEmptyState view={view} />}
    <div className="deep-analysis-shell"><TemplateList templates={catalog?.templates || []} selectedCode={selectedCode} onSelect={selectTemplate} /><main className="deep-analysis-main">
      {!preview && !result ? <ScopeOverview amountDisplayMode={amountDisplayMode} view={view} /> : null}
      {preview && selected && phase === "等待确认" ? <AnalysisConfirmation preview={preview} template={selected} onConfirm={confirmRun} onCancel={reset} onHighFidelityToggle={toggleHighFidelity} highFidelityConfirmed={highFidelityConfirmed} onHighFidelityConfirmChange={setHighFidelityConfirmed} running={running} /> : null}
      {["构建 Safe Context", "安全检查", "模型分析中", "Demo 分析中", "输出结构校验", "安全校验"].includes(phase) ? <AnalysisProgress phase={phase} onCancel={cancelRun} /> : null}
      {result ? <DeepAnalysisRenderBoundary resetKey={result.requestId} onReset={reset} title={t("deepAnalysis.renderFailed")} body={t("deepAnalysis.renderFailedBody")} action={t("deepAnalysis.returnTemplates")}><AnalysisResult result={result} onReset={reset} /></DeepAnalysisRenderBoundary> : null}
      {phase === "已取消" && !result ? <section className="deep-result-empty product-panel"><h3>{t("deepAnalysis.cancelled")}</h3><p>{t("deepAnalysis.cancelledBody")}</p><button onClick={reset}>{t("deepAnalysis.returnTemplates")}</button></section> : null}
    </main><DeepAnalysisSafetyRail preview={preview} result={result} /></div>
  </section>;
}

function createRequestId() {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  if (typeof webCrypto?.getRandomValues === "function") {
    const values = webCrypto.getRandomValues(new Uint32Array(4));
    return `deep-${values[0].toString(16)}-${values[1].toString(16)}-${values[2].toString(16)}-${values[3].toString(16)}`;
  }
  return `deep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function SnapshotEmptyState({ view }: { view: DecisionView | null }) {
  const { language, t } = useI18n();
  const opportunity = view?.opportunities.find((item) => item.opportunityToken === view.selectedOpportunity);
  return <section className="deep-result-empty deep-snapshot-empty product-panel">
    <div className="deep-empty-opportunity"><span>{t("deepAnalysis.currentOpportunityCode")}</span><strong>{view ? maskOpportunityToken(view.selectedOpportunity) : t("deepAnalysis.unavailableValue")}</strong></div>
    <div className="deep-empty-summary"><header><h3>{t("deepAnalysis.noSnapshotTitle")}</h3><p>{t("deepAnalysis.snapshotPromptBody")}</p></header><dl><div><dt>{t("workspace.currentStateStage")}</dt><dd>{view ? `${view.safeContext.opportunityState || t("workspace.noRecord")} · ${stageLabel(view.safeContext.stage)}` : t("deepAnalysis.unavailableValue")}</dd></div><div><dt>{t("workspace.departmentScope")}</dt><dd>{opportunity?.salesDepartment || (view?.runtime ? departmentLabel(view.runtime.department.id || view.runtime.department.label, language) : t("deepAnalysis.unavailableValue"))}</dd></div><div><dt>{t("workspace.priority")}</dt><dd>{opportunity ? priorityLabel(opportunity.priority) : t("deepAnalysis.unavailableValue")}</dd></div><div><dt>{t("workspace.opportunityHealth")}</dt><dd>{opportunity ? `${opportunity.healthScore} · ${opportunity.healthGrade}` : t("deepAnalysis.unavailableValue")}</dd></div></dl></div>
  </section>;
}

function ScopeOverview({ amountDisplayMode, view }: { amountDisplayMode: AmountDisplayMode; view: DecisionView | null }) {
  const { t } = useI18n();
  return <section className="deep-scope-overview product-panel"><header><div><h3>{t("deepAnalysis.scopeTitle")}</h3><p>{t("deepAnalysis.scopeDescription")}</p></div><span>{t("deepAnalysis.notStarted")}</span></header><dl><dt>{t("deepAnalysis.currentRole")}</dt><dd>{t("app.demoAccess")}</dd><dt>{t("deepAnalysis.departmentScope")}</dt><dd>{t("deepAnalysis.unavailableValue")}</dd><dt>{t("deepAnalysis.opportunityToken")}</dt><dd>{view?.selectedOpportunity || t("deepAnalysis.unavailableValue")}</dd><dt>{t("deepAnalysis.accountToken")}</dt><dd>{view?.safeContext.accountToken || t("deepAnalysis.unavailableValue")}</dd><dt>{t("deepAnalysis.dateRange")}</dt><dd>{t("deepAnalysis.currentSnapshot")}</dd><dt>{t("deepAnalysis.amountMode")}</dt><dd>{amountDisplayMode === "range" ? t("deepAnalysis.amountRange") : t("deepAnalysis.exactAmountUi")}</dd><dt>{t("deepAnalysis.provider")}</dt><dd>{t("deepAnalysis.serverConfigured")}</dd><dt>{t("deepAnalysis.externalCall")}</dt><dd>{t("deepAnalysis.afterConfirm")}</dd></dl><section><h3>{t("deepAnalysis.dependencies")}</h3><p>{t("deepAnalysis.dependenciesBody")}</p></section></section>;
}
