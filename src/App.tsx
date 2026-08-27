import { useEffect, useRef, useState } from "react";
import { getAiProviderStatus, getAuditLog, getCrmRuntimeStatus, getDecisionScenarios, getDecisionView, getFrozenPortfolio, getFrozenRuntimeStatus, getNarrativeSnapshots } from "./api";
import { AuditSafetyPage } from "./decision/AuditSafetyPage";
import { DecisionContextBar, ProviderSafetyStrip } from "./decision/DecisionUi";
import { DecisionWorkspace, type DecisionPage } from "./decision/DecisionWorkspace";
import { CrmConnectionWidget } from "./decision/CrmConnectionWidget";
import { departmentLabel, scenarioTitle } from "./decision/display";
import { LatestSelectionRequest } from "./decision/latestSelectionRequest";
import { DeepAnalysisPage } from "./deepAnalysis/DeepAnalysisPage";
import { PRODUCT_FEATURES } from "./config/features";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher";
import { useI18n, type TranslationKey } from "./i18n";
import type { AmountDisplayMode, DecisionDataSource, DecisionMode, DecisionScenarioCatalog, DecisionView, PilotDepartmentId, PilotRuntimeStatus } from "./decision/types";
import type { AiProviderStatus, AuditEntry } from "./types";
import type { NarrativeSnapshot } from "./narrative";

type ProductPage = DecisionPage | "gateway" | "deepAnalysis";

const NAVIGATION: Array<{ page: ProductPage; label: string }> = [
  { page: "cockpit", label: "AI 驾驶舱" },
  { page: "risk", label: "风险与优先级" },
  { page: "detail", label: "商机 360" },
  { page: "actionBoard", label: "行动看板" },
  { page: "meeting", label: "会议副驾" },
  { page: "portfolio", label: "组合洞察" },
  ...(PRODUCT_FEATURES.deepAnalysis ? [{ page: "deepAnalysis" as const, label: "深度分析" }] : []),
  { page: "gateway", label: "审计与安全" },
];

const INITIAL_DATA_SOURCE: DecisionDataSource = import.meta.env.VITE_DECISION_DATA_SOURCE === "local-fixture" ? "local-fixture" : "d365-pilot";
const INITIAL_DEEP_LINK = typeof window === "undefined" ? "" : new URL(window.location.href).searchParams.get("opportunity") || "";

const NAVIGATION_LABELS: Record<ProductPage, TranslationKey> = {
  cockpit: "nav.cockpit",
  risk: "nav.risk",
  detail: "nav.detail",
  actionBoard: "nav.actionBoard",
  meeting: "nav.meeting",
  portfolio: "nav.portfolio",
  deepAnalysis: "nav.deepAnalysis",
  gateway: "nav.audit",
};

export default function App() {
  const { language, t } = useI18n();
  const [page, setPage] = useState<ProductPage>("cockpit");
  const [catalog, setCatalog] = useState<DecisionScenarioCatalog | null>(null);
  const [view, setView] = useState<DecisionView | null>(null);
  const [providerStatus, setProviderStatus] = useState<AiProviderStatus | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [dataSource, setDataSource] = useState<DecisionDataSource>(INITIAL_DATA_SOURCE);
  const [department, setDepartment] = useState<PilotDepartmentId>("all");
  const [pilotRuntimeStatus, setPilotRuntimeStatus] = useState<PilotRuntimeStatus | null>(null);
  const [crmRuntimeStatus, setCrmRuntimeStatus] = useState<import("./decision/types").CrmRuntimeStatus | null>(null);
  const [narrativeSnapshots, setNarrativeSnapshots] = useState<NarrativeSnapshot[]>([]);
  const [mode, setMode] = useState<DecisionMode>("portfolio");
  const [scenarioId, setScenarioId] = useState("multi-risk-priority");
  const [amountDisplayMode, setAmountDisplayMode] = useState<AmountDisplayMode>("range");
  const [railExpanded, setRailExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingOpportunity, setPendingOpportunity] = useState("");
  const [opportunitySwitchError, setOpportunitySwitchError] = useState("");
  const [status, setStatus] = useState<{ key: TranslationKey; params?: Record<string, string | number> }>({ key: "app.status.loadingPortfolio" });
  const selectionRequest = useRef(new LatestSelectionRequest<{ data: DecisionView }>());
  const viewController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (status.key !== "app.status.readyD365" || !view?.runtime) return;
    setStatus({ key: "app.status.readyD365", params: { department: departmentLabel(view.runtime.department.id || "all", language) } });
  }, [language, status.key, view?.runtime]);

  function readView(source: DecisionDataSource, nextMode: DecisionMode, nextScenario: string, opportunityToken: string, nextDepartment: PilotDepartmentId, nextAmountMode: AmountDisplayMode, signal?: AbortSignal) {
    return source === "d365-pilot"
      ? getFrozenPortfolio(nextDepartment, opportunityToken, nextAmountMode, signal)
      : getDecisionView(nextMode, nextMode === "scenario" ? nextScenario : "", opportunityToken, signal);
  }

  async function loadView(nextMode = mode, nextScenario = scenarioId, opportunityToken = "", nextSource = dataSource, nextDepartment = department, nextAmountMode = amountDisplayMode) {
    selectionRequest.current.cancel();
    viewController.current?.abort();
    const controller = new AbortController();
    viewController.current = controller;
    setPendingOpportunity("");
    setOpportunitySwitchError("");
    const preserveCurrentView = Boolean(view);
    setLoading(!preserveCurrentView);
    setError("");
    try {
      const result = await readView(nextSource, nextMode, nextScenario, opportunityToken, nextDepartment, nextAmountMode, controller.signal);
      if (controller.signal.aborted) return;
      setView(result.data);
      setStatus(nextSource === "d365-pilot" ? { key: "app.status.readyD365", params: { department: departmentLabel(result.data.runtime?.department.id || "all", language) } } : { key: "app.status.readyLocal" });
      return true;
    } catch (loadError) {
      if (controller.signal.aborted) return false;
      if (!preserveCurrentView) setError(nextSource === "d365-pilot" ? "D365 Runtime Temporarily Unavailable" : loadError instanceof Error ? loadError.message : "决策视图读取失败");
      setStatus({ key: nextSource === "d365-pilot" ? "app.status.d365ReadFailed" : "app.status.localUnavailable" });
      return false;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  async function retryRuntime() {
    if (dataSource !== "d365-pilot") return loadView();
    setError("");
    setStatus({ key: "app.status.checkingConnection" });
    try {
      const [runtime, crm] = await Promise.all([
        getFrozenRuntimeStatus(undefined, true),
        getCrmRuntimeStatus().catch(() => ({ data: null })),
      ]);
      setPilotRuntimeStatus(runtime.data);
      setCrmRuntimeStatus(crm.data);
      return loadView();
    } catch {
      setError("D365 Runtime Temporarily Unavailable");
      setStatus({ key: "app.status.checkFailed" });
      setLoading(false);
      return false;
    }
  }

  async function changeDataSource(nextSource: DecisionDataSource) {
    if (nextSource === dataSource) return;
    const applied = await loadView("portfolio", "", "", nextSource, "all", "range");
    if (!applied) return;
    setDataSource(nextSource);
    setMode("portfolio");
    setDepartment("all");
    setAmountDisplayMode("range");
  }

  async function changeDepartment(nextDepartment: PilotDepartmentId) {
    if (dataSource !== "d365-pilot") return;
    const applied = await loadView("portfolio", "", "", dataSource, nextDepartment, amountDisplayMode);
    if (applied) setDepartment(nextDepartment);
  }

  function changeMode(nextMode: DecisionMode) {
    if (dataSource === "d365-pilot") return;
    setMode(nextMode);
    loadView(nextMode, scenarioId).catch(() => undefined);
  }

  function changeScenario(nextScenarioId: string) {
    if (dataSource === "d365-pilot") return;
    setMode("scenario");
    setScenarioId(nextScenarioId);
    loadView("scenario", nextScenarioId).catch(() => undefined);
  }

  async function changeOpportunity(token: string) {
    if (!view || token === view.selectedOpportunity || token === pendingOpportunity) return;
    setPendingOpportunity(token);
    setOpportunitySwitchError("");
    setStatus({ key: "app.status.switchingOpportunity", params: { token } });
    const result = await selectionRequest.current.run((signal) => readView(dataSource, mode, scenarioId, token, department, amountDisplayMode, signal));
    if (result.status === "applied") {
      setView(result.value.data);
      setPendingOpportunity("");
      setStatus({ key: "app.status.viewReady" });
    } else if (result.status === "error") {
      setPendingOpportunity("");
      setOpportunitySwitchError(result.error instanceof Error ? result.error.message : "商机详情读取失败");
      setStatus({ key: "app.status.switchFailed" });
    }
  }

  async function changeAmountMode(nextMode: AmountDisplayMode) {
    if (nextMode === "exact" && amountDisplayMode !== "exact") {
      if (!window.confirm(t("app.exactAmountConfirm"))) return;
    }
    if (dataSource === "d365-pilot") {
      const applied = await loadView("portfolio", "", view?.selectedOpportunity || "", dataSource, department, nextMode);
      if (!applied) return;
    }
    setAmountDisplayMode(nextMode);
  }

  function resetPortfolio() {
    const token = dataSource === "d365-pilot" ? "DEMO-OPP-075" : catalog?.portfolioDefaultOpportunity || "DEMO-6C-OPP-075";
    setMode("portfolio");
    setScenarioId("multi-risk-priority");
    setDepartment("all");
    setAmountDisplayMode("range");
    loadView("portfolio", "", token, dataSource, "all", "range").catch(() => undefined);
  }

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const controller = new AbortController();
    const catalogRequest = INITIAL_DATA_SOURCE === "d365-pilot" ? Promise.resolve({ data: null }) : getDecisionScenarios();
    const viewRequest = INITIAL_DATA_SOURCE === "d365-pilot" ? getFrozenPortfolio("all", INITIAL_DEEP_LINK, "range", controller.signal) : getDecisionView("portfolio", "", INITIAL_DEEP_LINK, controller.signal);
    const runtimeRequest = INITIAL_DATA_SOURCE === "d365-pilot" ? getFrozenRuntimeStatus(controller.signal) : Promise.resolve({ data: null });
    const crmStatusRequest = INITIAL_DATA_SOURCE === "d365-pilot" ? getCrmRuntimeStatus(controller.signal).catch(() => ({ data: null })) : Promise.resolve({ data: null });
    Promise.all([catalogRequest, viewRequest, getAiProviderStatus(), getAuditLog(), runtimeRequest, crmStatusRequest, getNarrativeSnapshots(controller.signal)])
      .then(([catalogResult, viewResult, providerResult, auditResult, runtimeResult, crmResult, narrativeResult]) => {
        setCatalog(catalogResult.data);
        setView(viewResult.data);
        setProviderStatus({ ...providerResult.data, controlledValidationPending: true });
        setAuditLog(auditResult.data);
        setPilotRuntimeStatus(runtimeResult.data);
        setCrmRuntimeStatus(crmResult.data);
        setNarrativeSnapshots(narrativeResult.data);
        setStatus(INITIAL_DATA_SOURCE === "d365-pilot" ? { key: "app.status.readyD365", params: { department: t("workspace.all") } } : { key: "app.status.readyLocal" });
        setLoading(false);
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(INITIAL_DATA_SOURCE === "d365-pilot" ? "D365 Runtime Temporarily Unavailable" : loadError instanceof Error ? loadError.message : "产品数据读取失败");
        setStatus({ key: INITIAL_DATA_SOURCE === "d365-pilot" ? "app.status.d365ReadFailed" : "app.status.productUnavailable" });
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="app product-app">
      <header className="topbar product-topbar">
        <div className="gateway-brand"><p>{t("app.brandSubtitle")}</p><h1>CRM AI Gateway</h1></div>
        <nav className={`tabs${PRODUCT_FEATURES.deepAnalysis ? " with-deep-analysis" : ""}`} aria-label={t("app.mainNavigation")}>
          {NAVIGATION.map((item) => <button key={item.page} className={page === item.page ? "active" : ""} onClick={() => setPage(item.page)}>{t(NAVIGATION_LABELS[item.page])}</button>)}
        </nav>
        <div className="topbar-utility"><LanguageSwitcher /><span className="demo-access-badge">{t("app.demoAccess")}</span></div>
      </header>

      <DecisionContextBar
        amountDisplayMode={amountDisplayMode}
        catalog={catalog}
        dataSource={dataSource}
        department={department}
        mode={mode}
        onAmountDisplayModeChange={changeAmountMode}
        onDataSourceChange={changeDataSource}
        onDepartmentChange={changeDepartment}
        onModeChange={changeMode}
        onOpportunityChange={changeOpportunity}
        onReset={resetPortfolio}
        onScenarioChange={changeScenario}
        scenarioId={scenarioId}
        selectedOpportunityToken={pendingOpportunity || view?.selectedOpportunity || ""}
        view={view}
      />
      <ProviderSafetyStrip status={providerStatus} operationStatus={t(status.key, status.params)} runtime={view?.runtime || null} />

      {page === "cockpit" ? <CrmConnectionWidget status={crmRuntimeStatus} onAudit={() => setPage("gateway")} onStatusUpdate={setCrmRuntimeStatus} /> : null}

      {page === "gateway" ? (
        <AuditSafetyPage amountDisplayMode={amountDisplayMode} auditLog={auditLog} catalog={catalog} dataSource={dataSource} department={department} narrativeSnapshots={narrativeSnapshots} pilotRuntimeStatus={pilotRuntimeStatus} providerStatus={providerStatus} view={view} />
      ) : page === "deepAnalysis" ? (
        <DeepAnalysisPage amountDisplayMode={amountDisplayMode} dataSource={dataSource} department={department} narrativeSnapshots={narrativeSnapshots} scenarioId={scenarioId} view={view} />
      ) : (
        <DecisionWorkspace
          amountDisplayMode={amountDisplayMode}
          activeScopeIdentity={`${dataSource}|${department}|${mode}|${mode === "scenario" ? scenarioId : ""}`}
          dataSource={dataSource}
          department={department}
          error={error}
          loading={loading}
          onNavigate={setPage}
          onOpportunityChange={changeOpportunity}
          onRetry={retryRuntime}
          onToggleRail={() => setRailExpanded((current) => !current)}
          opportunitySwitchError={opportunitySwitchError}
          opportunitySwitching={Boolean(pendingOpportunity)}
          narrativeSnapshots={narrativeSnapshots}
          page={page}
          providerStatus={providerStatus}
          railExpanded={railExpanded}
          scenarioId={scenarioId}
          selectedOpportunityToken={pendingOpportunity || view?.selectedOpportunity || ""}
          view={view}
        />
      )}
    </main>
  );
}
