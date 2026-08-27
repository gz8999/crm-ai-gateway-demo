import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { getDecisionOpportunity, getFrozenOpportunity } from "../api";
import type { AiProviderStatus } from "../types";
import type { UnifiedAiOutput } from "./contract";
import { DecisionPageHeader, DeepAnalysisReservation, EvidenceList, ExternalModelReadiness, FactList, HealthScorePanel, InferencePanel, TechnicalDetails } from "./DecisionUi";
import { booleanLabel, decisionText, deductionDimensionLabel, departmentLabel, fallbackReasonLabel, maskOpportunityToken, priorityLabel, scenarioTitle, stageLabel } from "./display";
import { filteredRiskOpportunities, portfolioScope, priorityDistribution, productActions, sortedRiskOpportunities, type RiskMetricFilter, type RiskQueueFilters } from "./productModel";
import { RiskDetailPool, riskDetailKey } from "./riskDetailPool";
import { nextQueueScrollTop } from "./riskQueueScroll";
import type { AmountDisplayMode, DecisionDataSource, DecisionOpportunityDetail, DecisionView, PilotDepartmentId } from "./types";
import type { NarrativeSnapshot } from "../narrative";

// Localized product labels retained in the formal contract: 分析视角、分析场景、高风险场景、互动安全摘要、Score Showcase、AI 综合判断、主要扣分、客户历史尚未接入、外部事实、精确金额发送模型</dt><dd>否、精确金额发送模型</dt><dd>否、原始 CRM 数据外发、CRM Writeback Disabled</dt><dd>否、输出结构校验、安全校验、引用校验、响应耗时、情报模式、建议行动、建议角色、建议期限、建议状态、行动依据、Timeline 原文发送模型</dt><dd>否。
import { NarrativePanel } from "./NarrativePanel";
import { useI18n, type TranslationKey } from "../i18n";

export type DecisionPage = "cockpit" | "risk" | "detail" | "actionBoard" | "meeting" | "portfolio";
type ProductPage = DecisionPage | "gateway" | "deepAnalysis";
type DetailState = { detail?: DecisionOpportunityDetail; error?: string };

const PAGE_COPY: Record<DecisionPage, { title: TranslationKey; description: TranslationKey }> = {
  cockpit: { title: "workspace.cockpitTitle", description: "workspace.cockpitDescription" },
  risk: { title: "workspace.riskTitle", description: "workspace.riskDescription" },
  detail: { title: "workspace.detailTitle", description: "workspace.detailDescription" },
  actionBoard: { title: "workspace.actionTitle", description: "workspace.actionDescription" },
  meeting: { title: "workspace.meetingTitle", description: "workspace.meetingDescription" },
  portfolio: { title: "workspace.portfolioTitle", description: "workspace.portfolioDescription" },
};

export function DecisionWorkspace({ activeScopeIdentity = "", amountDisplayMode, dataSource, department, page, view, loading, error, onRetry, onOpportunityChange, onNavigate = () => undefined, providerStatus = null, railExpanded = false, onToggleRail = () => undefined, opportunitySwitchError = "", opportunitySwitching = false, scenarioId = "", selectedOpportunityToken = "", narrativeSnapshots = [] }: {
  activeScopeIdentity?: string;
  amountDisplayMode: AmountDisplayMode;
  dataSource: DecisionDataSource;
  department: PilotDepartmentId;
  page: DecisionPage;
  view: DecisionView | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onOpportunityChange: (token: string) => void;
  onNavigate?: (page: ProductPage) => void;
  providerStatus?: AiProviderStatus | null;
  railExpanded?: boolean;
  onToggleRail?: () => void;
  opportunitySwitchError?: string;
  opportunitySwitching?: boolean;
  scenarioId?: string;
  selectedOpportunityToken?: string;
  narrativeSnapshots?: NarrativeSnapshot[];
}) {
  const { t } = useI18n();
  const pool = useRef(new RiskDetailPool<DecisionOpportunityDetail>(3));
  const [detailVersion, setDetailVersion] = useState(0);
  const [riskMetricFilter, setRiskMetricFilter] = useState<RiskMetricFilter>("all");
  const errors = useRef(new Map<string, string>());
  const scopeIdentity = activeScopeIdentity || (view ? `${view.mode}|${view.scenario?.id || scenarioId}` : "empty");

  useEffect(() => {
    pool.current.cancelStale();
    return () => pool.current.cancelStale();
  }, [scopeIdentity]);

  const requestDetail = useCallback((token: string, force = false) => {
    if (!view) return;
    const activeScenario = view.mode === "scenario" ? view.scenario?.id || scenarioId : "";
    const key = riskDetailKey(dataSource === "d365-pilot" ? dataSource : view.mode, dataSource === "d365-pilot" ? department : activeScenario, token);
    if (!force && (pool.current.get(key) || errors.current.has(key))) return;
    if (force) errors.current.delete(key);
    pool.current.load(key, (signal) => (dataSource === "d365-pilot" ? getFrozenOpportunity(token, department, amountDisplayMode, signal) : getDecisionOpportunity(token, view.mode, activeScenario, signal)).then((result) => result.data))
      .then(() => setDetailVersion((current) => current + 1))
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        errors.current.set(key, loadError instanceof Error ? loadError.message : "详情读取失败");
        setDetailVersion((current) => current + 1);
      });
  }, [amountDisplayMode, dataSource, department, scenarioId, view]);

  const detailFor = useCallback((token: string): DetailState => {
    if (!view) return {};
    if (token === view.selectedOpportunity) return { detail: { mode: view.mode, scenario: view.scenario, safeContext: view.safeContext, accountAggregate: view.safeContext.accountAggregate, opportunity360: view.pack.opportunity360, healthScore: view.healthScore, amountDisplay: view.amountDisplay, runtime: view.runtime } };
    const activeScenario = view.mode === "scenario" ? view.scenario?.id || scenarioId : "";
    const key = riskDetailKey(dataSource === "d365-pilot" ? dataSource : view.mode, dataSource === "d365-pilot" ? department : activeScenario, token);
    return { detail: pool.current.get(key), error: errors.current.get(key) };
  }, [dataSource, department, detailVersion, scenarioId, view]);

  if (loading) return <LoadingState />;
  if (error || !view) return <ErrorState message={error || t("workspace.noDecisionView")} onRetry={onRetry} retryLabel={dataSource === "d365-pilot" ? t("crm.reconnect") : t("workspace.retry")} />;
  const copy = PAGE_COPY[page];
  const rail = <DecisionContextRail amountDisplayMode={amountDisplayMode} dataSource={dataSource} department={department} output={view.pack[pageOutput(page)]} providerStatus={providerStatus} view={view} expanded={railExpanded} onToggle={onToggleRail} />;

  return <section className={`decision-workspace page-${page}`} data-page={page}>
    <DecisionPageHeader title={t(copy.title)} description={t(copy.description)} />
    {page === "cockpit" ? <CockpitPage view={view} detailFor={detailFor} requestDetail={requestDetail} onOpportunityChange={onOpportunityChange} onNavigate={onNavigate} onRiskMetricSelect={(filter) => { setRiskMetricFilter(filter); onNavigate("risk"); }} providerStatus={providerStatus} rail={rail} narrativeSnapshots={narrativeSnapshots} /> : null}
    {page === "risk" ? <RiskPage view={view} detailFor={detailFor} requestDetail={requestDetail} onOpportunityChange={onOpportunityChange} opportunitySwitchError={opportunitySwitchError} opportunitySwitching={opportunitySwitching} selectedOpportunityToken={selectedOpportunityToken || view.selectedOpportunity} riskMetricFilter={riskMetricFilter} onRiskMetricFilterChange={setRiskMetricFilter} rail={rail} narrativeSnapshots={narrativeSnapshots} /> : null}
    {page === "detail" ? <Opportunity360Page providerStatus={providerStatus} view={view} rail={rail} onOpenDeepAnalysis={() => onNavigate("deepAnalysis")} narrativeSnapshots={narrativeSnapshots} /> : null}
    {page === "actionBoard" ? <ActionBoardPage view={view} rail={rail} narrativeSnapshots={narrativeSnapshots} /> : null}
    {page === "meeting" ? <MeetingPage providerStatus={providerStatus} view={view} rail={rail} onOpenDeepAnalysis={() => onNavigate("deepAnalysis")} narrativeSnapshots={narrativeSnapshots} /> : null}
    {page === "portfolio" ? <PortfolioPage view={view} rail={rail} /> : null}
  </section>;
}

function CockpitPage({ view, detailFor, requestDetail, onOpportunityChange, onNavigate, onRiskMetricSelect, providerStatus, rail, narrativeSnapshots }: PageWithQueueProps & { onNavigate: (page: ProductPage) => void; onRiskMetricSelect: (filter: RiskMetricFilter) => void; providerStatus: AiProviderStatus | null; narrativeSnapshots: NarrativeSnapshot[] }) {
  const { language, t } = useI18n();
  const actions = productActions(view).slice(0, 3);
  const topRisks = sortedRiskOpportunities(view).slice(0, 5);
  return <>
    <ScopeMetrics view={view} onSelect={onRiskMetricSelect} />
    <ExecutivePortfolioSnapshot view={view} />
    <div className="cockpit-layout product-three-column">
      <section className="top-risk-panel product-panel"><header><div><h3>{t("workspace.topRisks")}</h3><p>{t("workspace.prioritySorted")}</p></div><button onClick={() => onNavigate("risk")}>{t("workspace.viewQueue")}</button></header>{topRisks.map((item, index) => <RiskRow key={item.opportunityToken} item={item} rank={index + 1} selected={item.opportunityToken === view.selectedOpportunity} state={detailFor(item.opportunityToken)} onVisible={() => requestDetail(item.opportunityToken)} onSelect={() => onOpportunityChange(item.opportunityToken)} />)}</section>
      <div className="cockpit-main">
        <section className="management-summary product-panel"><span className={`decision-priority priority-${view.pack.cockpit.priority.toLowerCase()}`}>{priorityLabel(view.pack.cockpit.priority)}</span><h3>{t("workspace.managementSummary")}</h3><p>{decisionText(view.pack.cockpit.inference)}</p><div className="selected-summary"><strong>{maskOpportunityToken(view.selectedOpportunity)}</strong><span>{stageLabel(view.safeContext.stage)} · {decisionText(view.safeContext.stagnationBand)}</span></div></section>
        <HealthScorePanel score={view.healthScore} compact />
        <section className="top-actions product-panel"><header><div><h3>{t("workspace.topActions")}</h3><p>{t("workspace.providerActions")}</p></div><button onClick={() => onNavigate("actionBoard")}>{t("workspace.openActionBoard")}</button></header>{actions.map((action) => <article key={action.id}><strong>{decisionText(action.title)}</strong><p>{decisionText(action.reason)}</p><small>{decisionText(action.owner)} · {decisionText(action.due)}</small></article>)}</section>
        <details className="scenario-status product-panel"><summary><h3>{t("workspace.sceneDataStatus")}</h3><b className="collapsible-toggle" aria-hidden="true" /></summary><dl><dt>{t("workspace.dataSource")}</dt><dd>{view.runtime?.sourceLabel || "Local Fixture"}</dd><dt>{t("workspace.currentMode")}</dt><dd>{view.runtime ? t("workspace.frozenPortfolio") : view.mode === "portfolio" ? t("workspace.noLocalScenario") : t("workspace.currentScenario")}</dd><dt>{t("workspace.currentScenario")}</dt><dd>{view.runtime ? t("workspace.d365NoScenario") : view.scenario ? scenarioTitle(view.scenario.id, view.scenario.title) : t("workspace.noLocalScenario")}</dd><dt>{t("workspace.departmentScope")}</dt><dd>{view.runtime ? departmentLabel(view.runtime.department.id || view.runtime.department.label, language) : t("workspace.localScope")}</dd><dt>{t("workspace.dataScope")}</dt><dd>{view.scopeSummary.scopeCount} {t("workspace.maskedOpportunity")}</dd><dt>{t("workspace.intelligenceStatus")}</dt><dd>{t("workspace.crmSafeContext")}</dd></dl></details>
        <ExternalModelReadiness status={providerStatus} />
        <NarrativePanel compact collapsible snapshot={narrativeSnapshots.find((item) => item.opportunityToken === view.selectedOpportunity)} />
      </div>{rail}
    </div>
  </>;
}

function RiskPage({ view, detailFor, requestDetail, onOpportunityChange, opportunitySwitchError = "", opportunitySwitching = false, selectedOpportunityToken = view.selectedOpportunity, riskMetricFilter, onRiskMetricFilterChange, rail, narrativeSnapshots }: PageWithQueueProps & { opportunitySwitchError?: string; opportunitySwitching?: boolean; selectedOpportunityToken?: string; riskMetricFilter: RiskMetricFilter; onRiskMetricFilterChange: (filter: RiskMetricFilter) => void; narrativeSnapshots: NarrativeSnapshot[] }) {
  const { t } = useI18n();
  const selected = view.opportunities.find((item) => item.opportunityToken === view.selectedOpportunity);
  return <div className="risk-product-layout product-three-column"><RiskQueue view={view} detailFor={detailFor} requestDetail={requestDetail} onOpportunityChange={onOpportunityChange} busy={opportunitySwitching} selectedOpportunityToken={selectedOpportunityToken} metricFilter={riskMetricFilter} onMetricFilterChange={onRiskMetricFilterChange} /><section className="risk-detail product-panel" aria-busy={opportunitySwitching}><header><span className={`decision-priority priority-${view.pack.risk.priority.toLowerCase()}`}>{priorityLabel(view.pack.risk.priority)}</span><div><h3>{maskOpportunityToken(view.selectedOpportunity)}</h3><p>{t("workspace.health").replace("{score}", String(selected?.healthScore ?? view.healthScore.healthScore))} · {selected?.healthGrade ?? view.healthScore.grade} · {t("workspace.deduction", { dimension: deductionLabel(selected?.mainDeductionDimension) })}</p><small>{t("workspace.dataSourceLabel")}：{view.runtime?.sourceLabel || "Local Fixture"} · {t("workspace.confidence")}：{decisionText(view.pack.risk.confidence.level)}</small></div></header>{opportunitySwitching ? <p className="risk-switch-status" role="status">{t("workspace.switching", { token: maskOpportunityToken(selectedOpportunityToken) })}</p> : null}{opportunitySwitchError ? <p className="risk-switch-status error" role="alert">{t("workspace.switchFailed", { error: opportunitySwitchError })}</p> : null}<div className="risk-decision-grid"><FactList output={view.pack.risk} /><InferencePanel output={view.pack.risk} /><EvidenceList output={view.pack.risk} /></div><NarrativePanel compact title={t("workspace.verifiedNarrative")} snapshot={narrativeSnapshots.find((item) => item.opportunityToken === view.selectedOpportunity)} /><section className="review-order"><h3>{t("workspace.reviewRequired")}</h3>{view.pack.risk.recommendedAction.map((item) => <article key={item.title}><strong>{decisionText(item.title)}</strong><p>{decisionText(item.reason)}</p><small>{t("workspace.deterministicPack")} · {t("workspace.draftOnly")}</small></article>)}</section><TechnicalDetails output={view.pack.risk} /></section>{rail}</div>;
}

function Opportunity360Page({ providerStatus, view, rail, onOpenDeepAnalysis, narrativeSnapshots }: { providerStatus: AiProviderStatus | null; view: DecisionView; rail: ReactNode; onOpenDeepAnalysis: () => void; narrativeSnapshots: NarrativeSnapshot[] }) {
  const { t } = useI18n();
  const output = view.pack.opportunity360;
  return <div className="detail-product-layout product-two-column"><main className="opportunity-360-main"><section className="opportunity-overview product-panel"><div><span>{t("workspace.maskedOpportunity")}</span><strong>{maskOpportunityToken(view.selectedOpportunity)}</strong></div><div><span>{t("workspace.currentStateStage")}</span><strong>{view.safeContext.opportunityState || t("workspace.noRecord")} · {stageLabel(view.safeContext.stage)}</strong></div><div><span>{t("workspace.priority")}</span><strong>{priorityLabel(output.priority)}</strong></div><div><span>{t("workspace.readiness")}</span><strong>{decisionText(view.safeContext.decisionReadiness)}</strong></div></section><HealthScorePanel score={view.healthScore} />{view.amountDisplay ? <AmountSummary view={view} /> : null}<section className="opportunity-safe-signals product-panel"><Signal label={t("workspace.actualTrend")} value={view.safeContext.varianceCategory} /><Signal label={t("workspace.serviceCoverage")} value={view.safeContext.coverageCategory || "not-recorded"} /><Signal label={t("workspace.timelineSummary")} value={t("workspace.interactionCount", { count: view.safeContext.timelineSignalCount || 0 })} /><Signal label="Safe Context" value={t("workspace.safeContextEnabled")} /></section><NarrativePanel snapshot={narrativeSnapshots.find((item) => item.opportunityToken === view.selectedOpportunity)} title={t("workspace.verifiedNarrative")} /><DeepAnalysisReservation status={providerStatus} templateId="DA-02" title={t("deepAnalysis.riskOpportunity")} onOpen={onOpenDeepAnalysis} /><div className="opportunity-decision-grid"><FactList output={output} /><InferencePanel output={output} /><EvidenceList output={output} /><section className="product-action-summary"><h3>{t("workspace.proposedActions")}</h3>{output.recommendedAction.map((item) => <article key={item.title}><strong>{decisionText(item.title)}</strong><p>{decisionText(item.reason)}</p><small>{t("workspace.deterministicPack")} · {t("workspace.draftOnly")}</small></article>)}</section></div><section className="context-availability"><article><h3>{t("workspace.customerHistory")}</h3><strong>{t("workspace.notConnectedHistory")}</strong><p>{t("workspace.crmOnlyAnalysis")}</p></article><article><h3>{t("workspace.externalFacts")}</h3><strong>{t("workspace.externalNotEnabled")}</strong><p>{t("workspace.noApprovedExternalSources")}</p><details><summary>{t("workspace.citationSources")}</summary><span>{t("workspace.noApprovedExternalSources")}</span></details></article></section><TechnicalDetails output={output} /></main>{rail}</div>;
}

function ActionBoardPage({ view, rail, narrativeSnapshots }: { view: DecisionView; rail: ReactNode; narrativeSnapshots: NarrativeSnapshot[] }) {
  const { t } = useI18n();
  const actions = productActions(view);
  const [open, setOpen] = useState<{ id: string; mode: "detail" | "evidence" | "draft" } | null>(null);
  // The approved 建议状态 is rendered explicitly as a non-writeback Draft Only state.
  return <div className="action-product-layout product-two-column"><main className="action-board-list"><header className="product-section-heading"><div><h3>{t("workspace.actionList")}</h3><p>{maskOpportunityToken(view.selectedOpportunity)} · {t("workspace.deterministicPack")}</p></div><span>{t("workspace.draftOnly")} · {t("workspace.crmWritebackDisabled")} · {t("workspace.actionCount", { count: actions.length })}</span></header><NarrativePanel compact title={t("workspace.verifiedNarrative")} snapshot={narrativeSnapshots.find((item) => item.opportunityToken === view.selectedOpportunity)} />{actions.map((action) => <article className="action-row" key={action.id}><div className="action-row-main"><span className={`decision-priority priority-${action.priority.toLowerCase()}`}>{priorityLabel(action.priority)}</span><div><h3>{decisionText(action.title)}</h3><p>{decisionText(action.reason)}</p><small>{decisionPackSource(action.reasonSource)}</small></div></div><dl><dt>{t("workspace.role")}</dt><dd>{decisionText(action.owner)}<small>{decisionPackSource(action.ownerSource)}</small></dd><dt>{t("workspace.due")}</dt><dd>{decisionText(action.due)}<small>{decisionPackSource(action.dueSource)}</small></dd><dt>{t("workspace.status")}</dt><dd>{t("workspace.draftOnly")}<small>{t("workspace.crmWritebackDisabled")}</small></dd><dt>{t("workspace.basis")}</dt><dd>{decisionPackSource(action.reasonSource)}</dd><dt>{t("workspace.evidence")}</dt><dd>{t("workspace.actionCount", { count: action.evidenceCount })}</dd></dl><div className="action-row-buttons"><button onClick={() => setOpen({ id: action.id, mode: "detail" })}>{t("workspace.viewAction")}</button><button onClick={() => setOpen({ id: action.id, mode: "evidence" })}>{t("workspace.viewEvidence")}</button><button onClick={() => setOpen({ id: action.id, mode: "draft" })}>{t("workspace.createDraft")}</button></div>{open?.id === action.id ? <section className="local-action-preview"><strong>{open.mode === "detail" ? t("workspace.actionDetail") : open.mode === "evidence" ? t("workspace.supportingEvidence") : t("workspace.localDraft")}</strong><p>{open.mode === "evidence" ? view.pack.action.evidence.map((item) => `${decisionText(item.label)}: ${decisionText(item.value)}`).join("; ") || t("workspace.noMoreEvidence") : `${decisionText(action.title)}: ${decisionText(action.reason)}`}</p><small>{t("workspace.localOrganizeOnly")}</small></section> : null}</article>)}{!actions.length ? <EmptyPanel title={t("workspace.noActions")} body={t("workspace.noActionsBody")} /> : null}<TechnicalDetails output={view.pack.action} /></main>{rail}</div>;
}

function MeetingPage({ providerStatus, view, rail, onOpenDeepAnalysis, narrativeSnapshots }: { providerStatus: AiProviderStatus | null; view: DecisionView; rail: ReactNode; onOpenDeepAnalysis: () => void; narrativeSnapshots: NarrativeSnapshot[] }) {
  const { t } = useI18n();
  const output = view.pack.meeting;
  return <div className="meeting-product-layout product-two-column"><main className="meeting-main"><DeepAnalysisReservation status={providerStatus} templateId="DA-07" title={t("workspace.meetingPrep")} onOpen={onOpenDeepAnalysis} /><NarrativePanel compact title={t("workspace.verifiedNarrative")} snapshot={narrativeSnapshots.find((item) => item.opportunityToken === view.selectedOpportunity)} /><section className="meeting-signal-grid"><Signal label={t("workspace.state")} value={view.safeContext.opportunityState || t("workspace.noRecord")} /><Signal label={t("workspace.meetingGoal")} value={view.safeContext.meetingWindow} /><Signal label={t("workspace.timelineSummary")} value={t("workspace.interactionCount", { count: view.safeContext.timelineSignalCount || 0 })} /><Signal label={t("workspace.readiness")} value={view.safeContext.decisionReadiness} /></section><div className="meeting-agenda-grid"><section className="product-panel"><h3>{t("workspace.meetingGoal")}</h3><p>{output.recommendedAction[0] ? decisionText(output.recommendedAction[0].title) : t("workspace.noGoal")}</p></section><section className="product-panel"><h3>{t("workspace.suggestedQuestions")}</h3><p>{view.safeContext.openQuestionCount ? t("workspace.questionsPrompt", { count: view.safeContext.openQuestionCount }) : t("workspace.noQuestionSignal")}</p></section><section className="product-panel"><h3>{t("workspace.mustConfirm")}</h3>{output.evidence.map((item) => <p key={item.source}>{decisionText(item.label)}: {decisionText(item.value)}</p>)}</section><section className="product-panel"><h3>{t("workspace.objections")}</h3><p>{t("workspace.noObjection")}</p></section><section className="product-panel meeting-followup"><h3>{t("workspace.postMeeting")}</h3><p>{output.recommendedAction[0] ? decisionText(output.recommendedAction[0].reason) : t("workspace.toBeDetermined")}</p></section></div><p className="timeline-disclaimer">{t("workspace.timelineDisclaimer")}</p><TechnicalDetails output={output} /></main>{rail}</div>;
}

function PortfolioPage({ view, rail }: { view: DecisionView; rail: ReactNode }) {
  const { language, t } = useI18n();
  const scope = portfolioScope(view);
  const distribution = priorityDistribution(view);
  const account = view.safeContext.accountAggregate;
  const max = Math.max(...distribution.map((item) => item.count), 1);
  return <div className="portfolio-product-layout product-two-column"><main className="portfolio-main"><section className="portfolio-scope product-panel"><h3>{t("workspace.scopeMethod")}</h3><dl><dt>{t("workspace.currentMode")}</dt><dd>{decisionText(scope.modeLabel)}</dd><dt>{t("workspace.currentScenario")}</dt><dd>{decisionText(scope.scenarioLabel)}</dd><dt>{t("workspace.scopeCount")}</dt><dd>{scope.count}</dd><dt>{t("workspace.scopeType")}</dt><dd>{decisionText(scope.scopeLabel)}</dd><dt>{t("workspace.completeScope")}</dt><dd>{decisionText(scope.completeLabel)}</dd></dl></section><HealthPortfolioSummary view={view} /><section className="portfolio-distribution product-panel"><h3>{t("workspace.riskDistribution")}</h3>{distribution.map((item) => <div key={item.priority}><span>{priorityLabel(item.priority)}</span><div><i style={{ width: `${(item.count / max) * 100}%` }} /></div><strong>{item.count}</strong></div>)}</section><section className="portfolio-kpis"><Metric label={t("workspace.scopeCount")} value={view.scopeSummary.scopeCount} /><Metric label={t("workspace.reviewRequired")} value={view.scopeSummary.reviewRequiredCount} /><Metric label={t("workspace.criticalRisk")} value={view.scopeSummary.criticalCount + view.scopeSummary.highCount} /></section><section className="account-aggregate product-panel"><header><div><h3>{t("workspace.selectedAccountAggregate")}</h3><p>{t("workspace.notFullPortfolio")}</p></div></header><dl><dt>{t("workspace.serviceCoverage")}</dt><dd>{decisionText(account.serviceCoverageBand)}</dd><dt>{t("workspace.serviceWhitespace")}</dt><dd>{decisionText(account.whitespaceCategory)}</dd><dt>{t("workspace.opportunityTrend")}</dt><dd>{decisionText(account.opportunityTrend)}</dd><dt>{t("workspace.relationshipMaturity")}</dt><dd>{decisionText(account.relationshipMaturity)}</dd></dl></section><section className="portfolio-empty-grid"><EmptyPanel title={t("workspace.departmentRange")} body={view.runtime ? `${departmentLabel(view.runtime.department.id || view.runtime.department.label, language)} · ${t("workspace.departmentFilterBeforeSafe")}` : t("workspace.fixtureNoDepartment")} /><EmptyPanel title={t("workspace.industryDistribution")} body={t("workspace.industrySafeOnly")} /><EmptyPanel title={t("workspace.customerHistoryTrend")} body={t("workspace.currentAuthorizedAggregate")} /></section><TechnicalDetails output={view.pack.portfolio} /></main>{rail}</div>;
}

function HealthPortfolioSummary({ view }: { view: DecisionView }) {
  const { language, t } = useI18n();
  const scores = view.healthRanking.map((item) => item.healthScore);
  const average = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;
  const distribution = ["S", "A", "B", "C", "D", "Z"].map((grade) => [grade, view.healthRanking.filter((item) => item.grade === grade).length] as const);
  return <section className="health-portfolio-summary product-panel"><header><div><h3>{t("workspace.healthScore")}</h3><p>{t("workspace.currentRangeOnly", { scope: view.runtime ? departmentLabel(view.runtime.department.id || view.runtime.department.label, language) : view.mode === "portfolio" ? t("workspace.portfolioTitle") : t("workspace.currentScenario") })}</p></div><strong>{t("workspace.average", { value: average })}</strong></header><div>{distribution.map(([grade, count]) => <span key={grade}>{grade} {count}</span>)}</div><small>{t("workspace.deterministicScore")}</small></section>;
}

type PageWithQueueProps = { view: DecisionView; detailFor: (token: string) => DetailState; requestDetail: (token: string, force?: boolean) => void; onOpportunityChange: (token: string) => void; rail: ReactNode };

function RiskQueue({ view, detailFor, requestDetail, onOpportunityChange, busy = false, selectedOpportunityToken = view.selectedOpportunity, metricFilter = "all", onMetricFilterChange = () => undefined }: Omit<PageWithQueueProps, "rail"> & { busy?: boolean; selectedOpportunityToken?: string; metricFilter?: RiskMetricFilter; onMetricFilterChange?: (filter: RiskMetricFilter) => void }) {
  const { language, t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [filters, setFilters] = useState<RiskQueueFilters>({ grade: "all", state: "all", highRiskOnly: false, showcaseOnly: false });
  const listRef = useRef<HTMLDivElement>(null);
  const rowElements = useRef(new Map<string, HTMLDivElement>());
  const clickedToken = useRef("");
  const initialRiskSelectionApplied = useRef(false);
  const deepLinkedToken = useRef(typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("opportunity") || "");
  const items = filteredRiskOpportunities(view, filters, metricFilter);
  useEffect(() => {
    if (initialRiskSelectionApplied.current) return;
    initialRiskSelectionApplied.current = true;
    if (deepLinkedToken.current) return;
    const firstToken = items[0]?.opportunityToken;
    if (firstToken && selectedOpportunityToken !== firstToken) onOpportunityChange(firstToken);
    listRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [items, onOpportunityChange, selectedOpportunityToken]);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (deepLinkedToken.current && selectedOpportunityToken === deepLinkedToken.current) {
      const row = rowElements.current.get(selectedOpportunityToken);
      if (!row) return;
      const nextTop = nextQueueScrollTop({ scrollTop: list.scrollTop, clientHeight: list.clientHeight, rowTop: row.offsetTop, rowHeight: row.offsetHeight });
      if (nextTop !== list.scrollTop) list.scrollTo({ top: nextTop, behavior: "auto" });
      deepLinkedToken.current = "";
      return;
    }
    if (clickedToken.current === selectedOpportunityToken) {
      clickedToken.current = "";
      return;
    }
    list.scrollTo({ top: 0, behavior: "auto" });
  }, [selectedOpportunityToken]);
  useEffect(() => {
    const selected = selectedOpportunityToken || view.selectedOpportunity;
    if (items.length && !items.some((item) => item.opportunityToken === selected)) onOpportunityChange(items[0].opportunityToken);
    listRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [filters.grade, filters.state, filters.highRiskOnly, filters.showcaseOnly, metricFilter]);
  return <aside className={`risk-queue product-panel${mobileOpen ? " mobile-open" : ""}`} aria-label={t("workspace.riskQueue")} aria-busy={busy}><header><div><h3>{t("workspace.riskQueue")}</h3><p>{items.length} / {view.opportunities.length} · {view.runtime ? departmentLabel(view.runtime.department.id || view.runtime.department.label, language) : t("workspace.currentRange")}</p></div><button className="mobile-queue-toggle" onClick={() => setMobileOpen((current) => !current)}>{mobileOpen ? t("workspace.closeQueue") : t("workspace.openQueue")}</button></header><section className="risk-queue-filters" aria-label={t("workspace.riskQueue")}><label><span>{t("workspace.grade")}</span><select value={filters.grade} onChange={(event) => setFilters((current) => ({ ...current, grade: event.target.value as RiskQueueFilters["grade"] }))}><option value="all">{t("workspace.all")}</option>{["S", "A", "B", "C", "D", "Z"].map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select></label><label><span>{t("workspace.state")}</span><select value={filters.state} onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value as RiskQueueFilters["state"] }))}><option value="all">{t("workspace.all")}</option><option value="Active">Active</option><option value="Won">Won</option><option value="Lost">Lost</option></select></label><label className="risk-filter-check"><input type="checkbox" checked={filters.highRiskOnly} onChange={(event) => setFilters((current) => ({ ...current, highRiskOnly: event.target.checked }))} /><span>{t("workspace.highRisk")}</span></label><label className="risk-filter-check"><input type="checkbox" checked={filters.showcaseOnly} onChange={(event) => setFilters((current) => ({ ...current, showcaseOnly: event.target.checked }))} /><span>{t("workspace.scoreShowcase")}</span></label></section><div className="risk-queue-list" ref={listRef}>{items.map((item, index) => <RiskRow key={item.opportunityToken} item={item} rank={index + 1} selected={item.opportunityToken === selectedOpportunityToken} state={detailFor(item.opportunityToken)} onVisible={() => requestDetail(item.opportunityToken)} onSelect={() => { clickedToken.current = item.opportunityToken; onOpportunityChange(item.opportunityToken); }} onElement={(element) => { if (element) rowElements.current.set(item.opportunityToken, element); else rowElements.current.delete(item.opportunityToken); }} onRetry={() => requestDetail(item.opportunityToken, true)} />)}{!items.length ? <p className="risk-filter-empty">{t("workspace.noFilteredOpportunities")}</p> : null}</div><footer>{t("workspace.queueFooter")}</footer></aside>;
}

function RiskRow({ item, rank, selected, state, onVisible, onSelect, onElement, onRetry }: { item: DecisionView["opportunities"][number]; rank: number; selected: boolean; state: DetailState; onVisible: () => void; onSelect: () => void; onElement?: (element: HTMLDivElement | null) => void; onRetry?: () => void }) {
  const { t } = useI18n();
  const rowRef = useRef<HTMLDivElement>(null);
  const setRowRef = useCallback((element: HTMLDivElement | null) => { rowRef.current = element; onElement?.(element); }, [onElement]);
  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) { onVisible(); return; }
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) onVisible(); }, { rootMargin: "80px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [onVisible]);
  const detail = state.detail;
  return <div ref={setRowRef} className={`risk-row${selected ? " selected" : ""}`}><button onClick={onSelect} aria-current={selected ? "true" : undefined}><span className="risk-rank">#{rank}</span><span className={`risk-level priority-${item.priority.toLowerCase()}`}>{priorityLabel(item.priority)}</span><strong>{maskOpportunityToken(item.opportunityToken)}{item.scoreShowcase ? <b className="score-showcase-tag">{t("workspace.scoreShowcase")}</b> : null}</strong><small>{item.opportunityState || t("workspace.noRecord")} · {t("workspace.health", { score: item.healthScore })} · {item.healthGrade} · {t("workspace.deduction", { dimension: deductionLabel(item.mainDeductionDimension) })}</small><p>{detail ? decisionText(detail.opportunity360.inference) : state.error ? t("workspace.unavailableDetail") : t("workspace.readingReason")}</p><em>{detail ? `${detail.opportunity360.evidence.length} · ${item.salesDepartment || t("workspace.noRecord")}` : t("workspace.evidenceReading")}</em></button>{state.error && onRetry ? <button className="risk-retry" onClick={onRetry}>{t("workspace.retryDetail")}</button> : null}</div>;
}

function DecisionContextRail({ amountDisplayMode, dataSource, department, output, providerStatus, view, expanded, onToggle }: { amountDisplayMode: AmountDisplayMode; dataSource: DecisionDataSource; department: PilotDepartmentId; output: UnifiedAiOutput; providerStatus: AiProviderStatus | null; view: DecisionView; expanded: boolean; onToggle: () => void }) {
  const { language, t } = useI18n();
  return <aside className={`decision-context-rail${expanded ? " expanded" : " compact"}`} aria-label={t("workspace.judgmentSafety")}><header><h3>{t("workspace.judgmentSafety")}</h3><button aria-expanded={expanded} onClick={onToggle}>{expanded ? t("workspace.collapse") : t("workspace.expand")}</button></header><section className={`rail-confidence confidence-${output.confidence.level.toLowerCase()}`}><span>{t("workspace.confidence")}</span><strong>{decisionText(output.confidence.level)}</strong>{expanded ? <p>{decisionText(output.confidence.reason)}</p> : null}</section><dl><dt>{t("workspace.dataSource")}</dt><dd>{view.runtime?.sourceLabel || (dataSource === "d365-pilot" ? "D365 Frozen Dataset" : "Local Fixture")}</dd><dt>{t("workspace.provider")}</dt><dd>{output.providerUsed}</dd><dt>{t("workspace.currentModel")}</dt><dd>{providerStatus?.modelName || "Demo rules"}</dd><dt>{t("workspace.externalCall")}</dt><dd>{booleanLabel(output.externalModelCalled)}</dd><dt>Safe Context</dt><dd>{booleanLabel(output.safeContextUsed)}</dd><dt>{t("workspace.amountDisplay")}</dt><dd>{amountDisplayMode === "range" ? t("workspace.amountRange") : t("workspace.exactAmountUi")}</dd><dt>{t("workspace.intelligenceMode")}</dt><dd>{t("workspace.crmOnly")}</dd>{expanded ? <><dt>{t("workspace.fallbackReason")}</dt><dd>{output.fallbackReason ? fallbackReasonLabel(output.fallbackReason, language) : t("workspace.noFallback")}</dd><dt>{t("workspace.rawDataExternal")}</dt><dd>{booleanLabel(output.rawDataSent)}</dd><dt>{t("workspace.exactAmountSent")}</dt><dd>{t("deepAnalysis.no")}</dd><dt>{t("workspace.timelineSent")}</dt><dd>{t("deepAnalysis.no")}</dd><dt>{t("workspace.outputValidation")}</dt><dd>{t("workspace.notExecuted")}</dd><dt>{t("workspace.safetyValidation")}</dt><dd>{t("workspace.notExecuted")}</dd><dt>{t("workspace.citationValidation")}</dt><dd>{t("workspace.noRecord")}</dd><dt>{t("workspace.responseLatency")}</dt><dd>{t("workspace.noRecord")}</dd><dt>{t("workspace.currentPermission")}</dt><dd>{t("workspace.demoFullAccess")}</dd><dt>{t("workspace.currentDepartment")}</dt><dd>{departmentLabel(view.runtime?.department.id || view.runtime?.department.label || department, language)}</dd><dt>{t("workspace.currentOpportunity")}</dt><dd>{maskOpportunityToken(view.selectedOpportunity)}</dd></> : null}</dl></aside>;
}

function AmountSummary({ view }: { view: DecisionView }) {
  const { t } = useI18n();
  const amount = view.amountDisplay!;
  const labels: Record<string, string> = { estimatedValue: t("workspace.estimatedAmount"), annualBudgetRevenue: t("workspace.annualBudgetRevenue"), annualBudgetMargin: t("workspace.annualBudgetMargin"), annualActualRevenue: t("workspace.annualActualRevenue"), actualValue: t("workspace.actualValue") };
  return <section className="opportunity-amount-summary product-panel" aria-label={t("workspace.amountDisplay")}><header><div><h3>{amount.mode === "exact" ? t("workspace.realCrmAmount") : t("workspace.maskedAmount")}</h3><p>{amount.mode === "exact" ? t("workspace.amountInternalOnly") : t("workspace.amountDefault")}</p></div><span>{amount.mode === "exact" ? amount.currency : t("workspace.safeBand")}</span></header><div>{Object.entries(amount.values).map(([key, value]) => <article key={key}><span>{labels[key] || key}</span><strong>{amount.mode === "exact" ? formatAmount(value, amount.currency) : decisionText(String(value))}</strong></article>)}</div></section>;
}

function formatAmount(value: number | string, currency: string) {
  if (typeof value !== "number") return String(value);
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: currency || "CNY", maximumFractionDigits: 2 }).format(value);
}

function ScopeMetrics({ view, onSelect }: { view: DecisionView; onSelect: (filter: RiskMetricFilter) => void }) { const { t } = useI18n(); return <section className="decision-scope-metrics" aria-label={t("workspace.analysisRange")}><Metric label={t("workspace.scopeCount")} value={view.scopeSummary.scopeCount} /><Metric label={t("workspace.criticalRisk")} value={view.scopeSummary.criticalCount} tone="critical" onClick={() => onSelect("critical")} /><Metric label={t("workspace.highRiskMetric")} value={view.scopeSummary.highCount} tone="high" onClick={() => onSelect("high")} /><Metric label={t("workspace.reviewRequired")} value={view.scopeSummary.reviewRequiredCount} onClick={() => onSelect("review")} /></section>; }
function ExecutivePortfolioSnapshot({ view }: { view: DecisionView }) {
  const { t } = useI18n();
  const state = view.runtime?.stateDistribution || { won: 0, active: 0, lost: 0 };
  const grades = ["S", "A", "B", "C", "D", "Z"].map((grade) => ({ grade, count: view.healthRanking.filter((item) => item.grade === grade).length }));
  return <section className="executive-portfolio-snapshot product-panel" aria-label={t("workspace.externalValidation")}><div><strong>{t("workspace.stateDistribution")}</strong><span>Won {state.won}</span><span>Active {state.active}</span><span>Lost {state.lost}</span></div><div><strong>{t("workspace.healthGrade")}</strong>{grades.map((item) => <span key={item.grade}>{item.grade} {item.count}</span>)}</div><small>{t("workspace.externalValidation")}</small></section>;
}
function Signal({ label, value }: { label: string; value: string }) { return <article><span>{label}</span><strong>{decisionText(value)}</strong></article>; }
function EmptyPanel({ title, body }: { title: string; body: string }) { return <article className="formal-empty-state"><div className="empty-skeleton" /><h3>{title}</h3><p>{body}</p></article>; }
function LoadingState() { const { t } = useI18n(); return <section className="decision-workspace-state" aria-live="polite"><div className="skeleton-line wide"/><div className="skeleton-line"/><div className="skeleton-panel"/><span>{t("workspace.justNowRead")}</span></section>; }
function ErrorState({ message, onRetry, retryLabel }: { message: string; onRetry: () => void; retryLabel: string }) { const { t } = useI18n(); return <section className="decision-workspace-state error" role="alert"><strong>{t("workspace.decisionUnavailable")}</strong><span>{message}</span><button onClick={onRetry}>{retryLabel}</button></section>; }
function Metric({ label, value, tone = "", onClick }: { label: string; value: number; tone?: string; onClick?: () => void }) { return onClick ? <button type="button" className={`scope-metric ${tone}`} onClick={onClick} aria-label={`${label} ${value}`}><span>{label}</span><strong>{value}</strong></button> : <article className={tone}><span>{label}</span><strong>{value}</strong></article>; }
function pageOutput(page: DecisionPage): keyof DecisionView["pack"] { return page === "detail" ? "opportunity360" : page === "actionBoard" ? "action" : page; }
function deductionLabel(value?: string) { return deductionDimensionLabel(value); }
function decisionPackSource(value: string) { return decisionText(value.replace("模型建议", "确定性 Decision Pack")); }
