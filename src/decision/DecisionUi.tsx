import type { AiProviderStatus } from "../types";
import { PRODUCT_FEATURES } from "../config/features";
import type { UnifiedAiOutput } from "./contract";
import { booleanLabel, businessSourceLabel, decisionText, departmentLabel, fallbackReasonLabel, maskOpportunityToken, priorityLabel, scenarioTitle, stageLabel } from "./display";
import { externalAnalysisStatus, externalAnalysisStatusLabel } from "./externalModelUi";
import { healthGradeLabel } from "../services/healthScoreEngine";
import type { OpportunityHealthScore } from "../services/healthScoreEngine";
import type { AmountDisplayMode, DecisionDataSource, DecisionMode, DecisionScenarioCatalog, DecisionView, PilotDepartmentId, PilotRuntimeMetadata } from "./types";
import { useI18n } from "../i18n";

// Product label contract: 部门、分析视角、分析场景、脱敏商机、金额显示、重置、风险复核队列、高风险场景、互动安全摘要、受控阻断、安全回退、当前 CRM 事实、AI 综合判断、核心证据、建议行动、置信度、回退原因、建议角色、建议期限、建议状态、行动依据、Timeline 原文发送模型、外部模型未调用、外部模型调用、写回 CRM、CRM Writeback Disabled；当前模型：{status?.provider || "demo"}。
// Technical details stay collapsed: <details className="technical-details"><summary>查看技术详情</summary>

const PILOT_DEPARTMENT_OPTIONS: PilotDepartmentId[] = ["all", "dept1-industry", "dept1-distribution", "dept2-lcms", "dept3-project-cargo", "dept3-dangerous-goods", "ff", "others"];

export function ProviderSafetyStrip({ status, operationStatus = "", runtime = null }: { status: AiProviderStatus | null; operationStatus?: string; runtime?: PilotRuntimeMetadata | null }) {
  const { language, t } = useI18n();
  const externalStatus = externalAnalysisStatus(status);
  return (
    <section className="provider-safety-strip compact" aria-label={t("workspace.judgmentSafety")}>
      <strong>{t("workspace.dataSource")}：{runtime?.sourceLabel || "Local Fixture"}</strong><span aria-hidden="true">·</span>
      <span>{runtime ? `${runtime.recordCount} · ${formatSyncTime(runtime.lastSyncTime, language)}` : t("workspace.localScope")}</span><span aria-hidden="true">·</span>
      <strong>{t("workspace.currentModel")}：{status?.modelName || status?.provider || "demo"}</strong><span aria-hidden="true">·</span>
      <span>Safe Context {t("deepAnalysis.enabled")}</span><span aria-hidden="true">·</span>
      <span>{t("workspace.externalCall")}：{t("deepAnalysis.no")}</span><span aria-hidden="true">·</span>
      <span className={`external-status status-${externalStatus}`}>{externalAnalysisStatusLabel(status, true)}</span><span aria-hidden="true">·</span>
      <span>{t("workspace.rawDataExternal")}：{status?.rawDataSent ? t("workspace.controlledBlocked") : t("deepAnalysis.notSent")}</span><span aria-hidden="true">·</span>
      <span>{t("deepAnalysis.readOnly")}</span><span aria-hidden="true">·</span><span>{t("workspace.fallbackReason")}：{runtime?.fallbackStatus === "disabled" ? t("workspace.disabled") : t("workspace.noFallback")}</span><span className="operation-status" aria-live="polite">{operationStatus}</span>
    </section>
  );
}

export function DecisionContextBar({ catalog, amountDisplayMode, dataSource, department, onAmountDisplayModeChange, onDataSourceChange, onDepartmentChange, mode, onModeChange, onOpportunityChange, onReset, onScenarioChange, scenarioId, selectedOpportunityToken, view }: {
  catalog: DecisionScenarioCatalog | null;
  amountDisplayMode: AmountDisplayMode;
  dataSource: DecisionDataSource;
  department: PilotDepartmentId;
  mode: DecisionMode;
  onDataSourceChange: (source: DecisionDataSource) => void;
  onDepartmentChange: (department: PilotDepartmentId) => void;
  onModeChange: (mode: DecisionMode) => void;
  onAmountDisplayModeChange: (mode: AmountDisplayMode) => void;
  onOpportunityChange: (token: string) => void;
  onReset: () => void;
  onScenarioChange: (scenarioId: string) => void;
  scenarioId: string;
  selectedOpportunityToken?: string;
  status?: string;
  view: DecisionView | null;
}) {
  const { language, t } = useI18n();
  return (
    <section className="decision-context-bar" aria-label={t("workspace.analysisRange")}>
      <label><span>{t("workspace.dataSource")}</span><select value={dataSource} onChange={(event) => onDataSourceChange(event.target.value as DecisionDataSource)}><option value="d365-pilot">D365 Frozen Dataset</option><option value="local-fixture">Local Fixture</option></select></label>
      <label className={dataSource === "d365-pilot" ? "department-filter" : "department-filter blocked"}><span>{t("workspace.departmentScope")}</span><select disabled={dataSource !== "d365-pilot"} value={department} onChange={(event) => onDepartmentChange(event.target.value as PilotDepartmentId)}>{PILOT_DEPARTMENT_OPTIONS.map((item) => <option key={item} value={item}>{departmentLabel(item, language)}</option>)}</select></label>
      <label><span>{t("workspace.currentMode")}</span><select disabled={dataSource === "d365-pilot"} value={mode} onChange={(event) => onModeChange(event.target.value as DecisionMode)}><option value="portfolio">{t("workspace.portfolioTitle")}</option><option value="scenario">{t("workspace.currentScenario")}</option></select></label>
      <label><span>{t("workspace.currentScenario")}</span><select disabled={dataSource === "d365-pilot" || mode !== "scenario" || !catalog} value={scenarioId} onChange={(event) => onScenarioChange(event.target.value)}>{dataSource === "d365-pilot" ? <option value={scenarioId}>{t("workspace.d365NoScenario")}</option> : null}{dataSource !== "d365-pilot" ? (catalog?.scenarios || []).map((item) => <option key={item.id} value={item.id}>{scenarioTitle(item.id, item.title)} ({item.count})</option>) : null}</select></label>
      <label className="decision-opportunity-select"><span>{t("workspace.maskedOpportunity")}</span><select disabled={!view?.opportunities.length} value={selectedOpportunityToken || view?.selectedOpportunity || ""} onChange={(event) => onOpportunityChange(event.target.value)}>{!view?.opportunities.length ? <option value="">{t("workspace.noData")}</option> : null}{(view?.opportunities || []).map((item) => <option key={item.opportunityToken} value={item.opportunityToken}>{maskOpportunityToken(item.opportunityToken)} · {stageLabel(item.stage)} · {priorityLabel(item.priority)}</option>)}</select></label>
      <fieldset className="amount-display-toggle"><legend>{t("workspace.amountDisplay")}</legend><button className={amountDisplayMode === "range" ? "active" : ""} onClick={() => onAmountDisplayModeChange("range")}>{t("workspace.amountRange")}</button><button className={amountDisplayMode === "exact" ? "active" : ""} onClick={() => onAmountDisplayModeChange("exact")}>{t("workspace.exactAmountUi")}</button></fieldset>
      <button className="decision-reset" onClick={onReset}>{t("workspace.reset")}</button>
    </section>
  );
}

function formatSyncTime(value: string, language: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? decisionText("未记录", language as "zh-CN" | "ja-JP" | "en-US") : date.toLocaleTimeString(language, { hour12: false, hour: "2-digit", minute: "2-digit" });
}

export function DecisionPageHeader({ title, description }: { title: string; description: string }) {
  const { t } = useI18n();
  return <header className="decision-page-header"><div><h2>{title}</h2><p>{description}</p></div><span>{t("workspace.readOnlySupport")}</span></header>;
}

export function ExternalModelReadiness({ status, latestAnalysis }: { status: AiProviderStatus | null; latestAnalysis?: string }) {
  const { t } = useI18n();
  const state = externalAnalysisStatus(status);
  return <details className={`external-readiness-banner status-${state}`} aria-label={t("workspace.externalAvailability")}><summary><span>{t("workspace.externalAvailability")}</span><strong>{externalAnalysisStatusLabel(status)}</strong><b className="collapsible-toggle" aria-hidden="true" /></summary><dl><dt>{t("workspace.latestDeepAnalysis")}</dt><dd>{latestAnalysis || t("workspace.noRecord")}</dd><dt>{t("workspace.autoCall")}</dt><dd>{t("workspace.disabled")}</dd></dl></details>;
}

export function DeepAnalysisReservation({ status, templateId, title, onOpen }: { status: AiProviderStatus | null; templateId: string; title: string; onOpen?: () => void }) {
  const { t } = useI18n();
  const state = externalAnalysisStatus(status);
  const descriptionId = `deep-analysis-${templateId.toLowerCase()}`;
  return <section className={`deep-analysis-reservation status-${state}`} aria-label={`${title} deep analysis`}><div><span>{templateId}</span><h3>{title}</h3><p id={descriptionId}>{PRODUCT_FEATURES.deepAnalysis ? t("deepAnalysis.scopeDescription") : t("deepAnalysis.unavailable")}</p></div><button disabled={!PRODUCT_FEATURES.deepAnalysis} aria-describedby={descriptionId} onClick={onOpen}>{t("nav.deepAnalysis")}</button></section>;
}

export function ProductStatusPanel({ kind, title, message }: { kind: "loading" | "empty" | "error" | "blocked" | "fallback"; title: string; message: string }) {
  const { t } = useI18n();
  return <section className={`product-status-panel status-${kind}`} role={kind === "error" || kind === "blocked" ? "status" : undefined}><span>{kind === "blocked" ? t("workspace.controlledBlocked") : kind === "fallback" ? t("workspace.safeFallback") : t("workspace.status")}</span><h3>{title}</h3><p>{message}</p></section>;
}

export function FactList({ output }: { output: UnifiedAiOutput }) {
  const { t } = useI18n();
  return <section className="product-fact-list"><h3>{t("workspace.currentCrmFacts")}</h3>{output.fact.map((item) => <dl key={`${item.label}-${item.value}`}><dt>{decisionText(item.label)}</dt><dd>{decisionText(item.value)}<small>{businessSourceLabel(item.source)}</small></dd></dl>)}{!output.fact.length ? <p className="empty-copy">{t("workspace.noFacts")}</p> : null}</section>;
}

export function EvidenceList({ output }: { output: UnifiedAiOutput }) {
  const { t } = useI18n();
  return <section className="product-evidence-list"><h3>{t("workspace.coreEvidence")}</h3>{output.evidence.map((item) => <div key={`${item.label}-${item.value}`}><span>{decisionText(item.label)}</span><strong>{decisionText(item.value)}</strong><small>{businessSourceLabel(item.source)}</small></div>)}{!output.evidence.length ? <p className="empty-copy">{t("workspace.noTraceableEvidence")}</p> : null}</section>;
}

export function InferencePanel({ output }: { output: UnifiedAiOutput }) {
  const { t } = useI18n();
  return <section className="product-inference"><h3>{t("workspace.aiJudgment")}</h3><p>{decisionText(output.inference)}</p><small>{t("workspace.aiNotCrmFact")}</small></section>;
}

export function HealthScorePanel({ score, compact = false }: { score: OpportunityHealthScore; compact?: boolean }) {
  const { t } = useI18n();
  const labels = { pipeline: t("workspace.dimensionPipeline"), completeness: t("workspace.dimensionCompleteness"), profitability: t("workspace.dimensionProfitability"), engagement: t("workspace.dimensionEngagement"), risk: t("workspace.dimensionRisk"), confidence: t("workspace.dimensionConfidence") } as const;
  return <section className={`health-score-panel product-panel${compact ? " compact" : ""}`} aria-label={t("workspace.opportunityHealth")}>
    <header><div><span>{t("workspace.certaintyScore")}</span><h3>{t("workspace.opportunityHealth")}</h3></div><div className={`health-score-grade grade-${score.grade.toLowerCase()}`}><strong>{score.healthScore}</strong><span>{score.grade} · {decisionText(healthGradeLabel(score.grade))}</span></div></header>
    <div className="health-score-dimensions">{Object.entries(score.dimensions).map(([dimension, value]) => <div key={dimension}><span>{labels[dimension as keyof typeof labels]}</span><strong>{value}</strong><i><b style={{ width: `${value}%` }} /></i></div>)}</div>
    <div className="health-score-quality"><span>{t("workspace.judgmentConfidence")}：{score.confidence}</span><span>{t("workspace.evidenceCoverage")}：{score.evidenceCoverage}%</span><span>{t("workspace.dataQuality")}：{score.dataQualityStatus === "clear" ? t("workspace.clear") : score.dataQualityStatus === "contradiction" ? t("workspace.contradiction") : t("workspace.review")}</span></div>
    {!compact ? <div className="health-score-insights"><section><h4>{t("workspace.mainStrengths")}</h4>{score.keyStrengths.length ? score.keyStrengths.map((item) => <p key={item.source}><strong>{decisionText(item.label)}</strong><span>{decisionText(item.detail)}</span></p>) : <p>{t("workspace.noExtraStrength")}</p>}</section><section><h4>{t("workspace.mainRisks")}</h4>{score.keyRisks.length ? score.keyRisks.map((item) => <p key={item.source}><strong>{decisionText(item.label)}</strong><span>{decisionText(item.detail)}</span></p>) : <p>{t("workspace.noSignificantRisk")}</p>}</section></div> : null}
    <small className="health-score-note">{t("workspace.safeContextSource", { version: score.version })}</small>
  </section>;
}

export function TechnicalDetails({ output }: { output: UnifiedAiOutput }) {
  const { t } = useI18n();
  return <details className="technical-details"><summary>{t("workspace.technicalDetails")}</summary><dl><dt>{t("workspace.currentModel")}</dt><dd>{output.providerUsed}</dd><dt>{t("workspace.fallbackReason")}</dt><dd>{fallbackReasonLabel(output.fallbackReason)}</dd><dt>Safe Context</dt><dd>{booleanLabel(output.safeContextUsed)}</dd><dt>{t("workspace.externalCall")}</dt><dd>{booleanLabel(output.externalModelCalled)}</dd><dt>{t("workspace.rawDataExternal")}</dt><dd>{booleanLabel(output.rawDataSent)}</dd></dl><div>{output.fact.map((item) => <code key={item.source}>{item.source}</code>)}{output.evidence.map((item) => <code key={item.source}>{item.source}</code>)}</div></details>;
}

export function UnifiedDecisionCard({ output, compact = false, showConfidence = true }: { output: UnifiedAiOutput; compact?: boolean; showConfidence?: boolean }) {
  const { t } = useI18n();
  return <article className={`unified-decision-card${compact ? " compact" : ""}`}><header><div><span className={`decision-priority priority-${output.priority.toLowerCase()}`}>{priorityLabel(output.priority)}</span><h3>{decisionText(output.title)}</h3></div>{showConfidence ? <div className={`decision-confidence confidence-${output.confidence.level.toLowerCase()}`}><span>{t("workspace.confidence")}</span><strong>{decisionText(output.confidence.level)}</strong></div> : null}</header><div className="decision-contract-grid"><FactList output={output} /><InferencePanel output={output} /><section className="decision-actions"><h3>{t("workspace.proposedActions")}</h3>{output.recommendedAction.map((item) => <div key={`${item.title}-${item.reason}`}><strong>{decisionText(item.title)}</strong><p>{decisionText(item.reason)}</p></div>)}</section></div><EvidenceList output={output} /><TechnicalDetails output={output} /></article>;
}
