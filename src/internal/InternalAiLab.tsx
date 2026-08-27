import { useEffect, useMemo, useState } from "react";
import { chatWithAiDemo, getAiProviderStatus, getAuditLog, getDecisionScenarios, getDecisionView as fetchDecisionView, getDynamicsStatus, getManagementDashboard, getOpportunities, getSafeOpportunityContext, resetAuditLog, runAi, runAiAction, syncDynamics, testDynamicsConnection, transformOpportunity } from "../api";
import { CrmDataDoctor } from "../components/ai-actions/CrmDataDoctor";
import { CustomerGrowthAgent } from "../components/ai-actions/CustomerGrowthAgent";
import { DraftPack } from "../components/ai-actions/DraftPack";
import { ManagementMeetingCopilot } from "../components/ai-actions/ManagementMeetingCopilot";
import { NextBestActionBoard } from "../components/ai-actions/NextBestActionBoard";
import { Opportunity360Brief } from "../components/ai-actions/Opportunity360Brief";
import { RiskSummary } from "../components/ai-actions/RiskSummary";
import { DecisionContextBar, DecisionPageHeader, ProviderSafetyStrip, UnifiedDecisionCard } from "../decision/DecisionUi";
import { DecisionWorkspace, type DecisionPage } from "../decision/DecisionWorkspace";
import { adaptActionBoardItem, adaptLegacyActionResult, adaptRiskCase, placeholderOutput } from "../decision/contract";
import { scenarioTitle } from "../decision/display";
import type { AmountDisplayMode, DecisionMode, DecisionScenarioCatalog, DecisionView } from "../decision/types";
import { languages, useI18n, type Language, type TFunction } from "../i18n";
import type { ActionBoardAction, AiActionName, AiActionResult, AiDemoChatResult, AiProviderStatus, AiResult, AuditEntry, DashboardFilters, DynamicsStatus, ManagementDashboard, Opportunity, RiskRadarCase, Role, TransformResult } from "../types";

const roles: Role[] = ["Sales Owner", "Sales Manager", "Read-only User", "CRM Admin"];
const aiFunctions = [
  ["case-summary", "Case Summary"],
  ["risk-analysis", "Risk Analysis"],
  ["next-best-action", "Next Best Action"],
  ["draft-follow-up-email", "Draft Follow-up Email"],
  ["meeting-report-note", "Meeting Report Note"],
];
const sensitiveFields = new Set(["customer_name", "contact_name", "contact_email", "phone", "address", "detailed_address", "exact_revenue", "exact_margin", "supplier_cost", "contract_text", "contract_price"]);
const exampleQuestions = [
  "哪些客户本月风险最高？",
  "本周应该优先跟进哪些案件？",
  "哪些案件需要管理层介入？",
  "当前 Pipeline 最大风险在哪里？",
  "生成营业会议摘要",
];

export default function App() {
  const { language, setLanguage, t } = useI18n();
  const [page, setPage] = useState<"cockpit" | "risk" | "actionBoard" | "opportunities" | "detail" | "actions" | "meeting" | "portfolio" | "gateway">("cockpit");
  const [dashboard, setDashboard] = useState<ManagementDashboard | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [managementSummary, setManagementSummary] = useState<AiResult | null>(null);
  const [assistantQuestion, setAssistantQuestion] = useState("哪些客户本月风险最高？");
  const [assistantResult, setAssistantResult] = useState<AiDemoChatResult | null>(null);
  const [actionResults, setActionResults] = useState<Partial<Record<AiActionName, AiActionResult>>>({});
  const [actionLoading, setActionLoading] = useState<AiActionName | null>(null);
  const [actionOpportunityId, setActionOpportunityId] = useState("OPP-001");
  const [actionCustomerToken, setActionCustomerToken] = useState("CUST-001");
  const [safeContextPreview, setSafeContextPreview] = useState<Record<string, unknown> | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selectedId, setSelectedId] = useState("OPP-001");
  const [role, setRole] = useState<Role>("Sales Owner");
  const [transform, setTransform] = useState<TransformResult | null>(null);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [externalAiResult, setExternalAiResult] = useState<AiResult | null>(null);
  const [externalAiLoading, setExternalAiLoading] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [dynamicsStatus, setDynamicsStatus] = useState<DynamicsStatus | null>(null);
  const [providerStatus, setProviderStatus] = useState<AiProviderStatus | null>(null);
  const [dynamicsMessage, setDynamicsMessage] = useState("");
  const [status, setStatus] = useState("Loading management cockpit...");
  const [decisionCatalog, setDecisionCatalog] = useState<DecisionScenarioCatalog | null>(null);
  const [decisionMode, setDecisionMode] = useState<DecisionMode>("portfolio");
  const [decisionScenarioId, setDecisionScenarioId] = useState("multi-risk-priority");
  const [decisionView, setDecisionView] = useState<DecisionView | null>(null);
  const [amountDisplayMode, setAmountDisplayMode] = useState<AmountDisplayMode>("range");
  const [decisionLoading, setDecisionLoading] = useState(true);
  const [decisionError, setDecisionError] = useState("");

  const safeOpportunities = Array.isArray(opportunities) ? opportunities : [];
  const filteredOpportunities = useMemo(() => {
    const ids = dashboard?.filteredOpportunityIds;
    if (!Array.isArray(ids)) return safeOpportunities;
    const idSet = new Set(ids);
    return safeOpportunities.filter((item) => idSet.has(item.id));
  }, [dashboard?.filteredOpportunityIds, safeOpportunities]);
  const selected = useMemo(() => {
    return filteredOpportunities.find((item) => item.id === selectedId) ?? filteredOpportunities[0] ?? null;
  }, [filteredOpportunities, selectedId]);

  async function refreshAudit() {
    setAuditLog((await getAuditLog()).data);
  }

  async function refreshDashboard(nextFilters = filters) {
    const result = await getManagementDashboard(nextFilters);
    setDashboard(result.data);
    setManagementSummary(null);
    setStatus("Management cockpit refreshed");
  }

  async function refreshAppData(nextFilters = filters) {
    const [opportunityResult, dashboardResult, dynamicsStatusResult, providerStatusResult] = await Promise.all([
      getOpportunities(),
      getManagementDashboard(nextFilters),
      getDynamicsStatus(),
      getAiProviderStatus(),
    ]);
    const items = Array.isArray(opportunityResult.data) ? opportunityResult.data : [];
    if (!Array.isArray(opportunityResult.data)) {
      setStatus("Failed to load opportunities. Please check DATA_SOURCE and Dynamics connection.");
    }
    setOpportunities(items);
    setDashboard(dashboardResult.data);
    setDynamicsStatus(dynamicsStatusResult.data);
    setProviderStatus(providerStatusResult.data);
    const nextId = items.some((item) => item.id === selectedId)
      ? selectedId
      : items[0]?.id || "";
    setSelectedId(nextId);
    setActionOpportunityId((current) => items.some((item) => item.id === current) ? current : nextId);
    setActionCustomerToken((current) => {
      if (items.some((item) => item.customer_code === current)) return current;
      return items[0]?.customer_code || "";
    });
    if (items.length > 0 && nextId) {
      const result = await transformOpportunity(role, nextId);
      setTransform(result);
    } else {
      setTransform(null);
    }
    await refreshAudit();
  }

  async function doTransform(nextRole = role, nextId = selectedId) {
    if (!nextId || safeOpportunities.length === 0) {
      setTransform(null);
      setStatus("No opportunities loaded. Check API connection.");
      return;
    }
    setStatus("Transforming CRM data through Gateway...");
    setAiResult(null);
    setExternalAiResult(null);
    try {
      const result = await transformOpportunity(nextRole, nextId);
      setTransform(result);
      await refreshAudit();
      setStatus(result.blocked ? "Safety checklist failed" : "Safe AI Payload generated");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Transform failed");
    }
  }

  async function loadSafeContextPreview(nextId = selectedId) {
    if (!nextId) {
      setSafeContextPreview(null);
      return;
    }
    try {
      const result = await getSafeOpportunityContext(nextId);
      setSafeContextPreview(result.data);
    } catch {
      setSafeContextPreview(null);
    }
  }

  async function callAi(functionName: string) {
    if (!transform) return;
    setStatus("Running Demo AI with Safe AI Payload only...");
    try {
      const result = await runAi(functionName, role, selectedId, transform.safePayload, language);
      setAiResult(result);
      await refreshAudit();
      setStatus("Demo AI output generated from Safe AI Payload");
    } catch (error) {
      setAiResult({ blocked: true, error: error instanceof Error ? error.message : "AI call blocked" });
      await refreshAudit();
      setStatus("AI call blocked by Gateway safety scan");
    }
  }

  async function runExternalAiRiskAnalysis() {
    if (!transform?.safePayload || !selectedId) return;
    setExternalAiLoading(true);
    setExternalAiResult(null);
    setStatus("Running single-record External AI analysis from Safe Context only...");
    try {
      const result = await runAi("risk-analysis", role, selectedId, transform.safePayload, language);
      setExternalAiResult(result);
      await refreshAudit();
      setStatus(result.provider === "openai-compatible" ? "External AI analysis completed" : "External AI fell back to demoProvider");
    } catch (error) {
      setExternalAiResult({ blocked: true, error: error instanceof Error ? error.message : "External AI call blocked" });
      await refreshAudit();
      setStatus("External AI call blocked by Gateway safety scan");
    } finally {
      setExternalAiLoading(false);
    }
  }

  async function generateSummary() {
    if (!dashboard) return;
    setStatus("Generating Chinese management summary from safe aggregate payload...");
    try {
      const result = await runAi("management-summary", "Sales Manager", "management-dashboard", dashboard.summaryPayload, language);
      setManagementSummary(result);
      await refreshAudit();
      setStatus("AI Management Summary generated from safe aggregate payload");
    } catch (error) {
      setManagementSummary({ blocked: true, error: error instanceof Error ? error.message : "Management summary blocked" });
      await refreshAudit();
      setStatus("Management summary blocked by Gateway safety scan");
    }
  }

  async function askAiDemo(question = assistantQuestion) {
    if (!question.trim()) {
      setStatus("Please enter a CRM AI Assistant question.");
      return;
    }
    setStatus("Building Safe CRM Demo Context...");
    try {
      const result = await chatWithAiDemo(question, filters);
      setAssistantQuestion(question);
      setAssistantResult(result);
      await refreshAudit();
      setStatus("CRM AI Assistant answered from Safe CRM Demo Context");
    } catch (error) {
      setAssistantResult({
        blocked: true,
        answer: "",
        error: error instanceof Error ? error.message : "AI Demo Assistant blocked",
        context_summary: {
          data_source: dynamicsStatus?.dataSource || "mock",
          dynamics_records: dynamicsStatus?.recordCount || 0,
          total_opportunities: 0,
          safe_context_enabled: true,
          last_refresh_time: dynamicsStatus?.lastRefreshTime || "",
        },
      });
      await refreshAudit();
      setStatus("AI Demo Assistant blocked by Safe Context scan");
    }
  }

  async function runSalesAction(actionName: AiActionName) {
    setActionLoading(actionName);
    setStatus(`Generating ${actionName} from Safe CRM Context...`);
    try {
      const result = await runAiAction(actionName, {
        opportunity_id: actionOpportunityId || selectedId,
        customer_token: actionCustomerToken,
        filters,
        role: "management",
      });
      setActionResults((current) => ({ ...current, [actionName]: result }));
      await refreshAudit();
      setStatus(`${actionName} generated from Safe CRM Context`);
    } catch (error) {
      const blocked: AiActionResult = {
        blocked: true,
        error: error instanceof Error ? error.message : "AI action blocked",
        result: null,
        context_summary: {
          data_source: dynamicsStatus?.dataSource || "mock",
          dynamics_records: dynamicsStatus?.recordCount || 0,
          total_opportunities: safeOpportunities.length,
          safe_context_enabled: true,
          last_refresh_time: dynamicsStatus?.lastRefreshTime || "",
        },
      };
      setActionResults((current) => ({ ...current, [actionName]: blocked }));
      await refreshAudit();
      setStatus(`${actionName} blocked by Safe Context scan`);
    } finally {
      setActionLoading(null);
    }
  }

  async function resetLog() {
    await resetAuditLog();
    await refreshAudit();
    setStatus("Audit log reset");
  }

  async function testDynamics() {
    setDynamicsMessage("Testing Dynamics connection...");
    setStatus("Testing Dynamics connection...");
    try {
      const result = await testDynamicsConnection();
      if (result.status) setDynamicsStatus(result.status);
      setDynamicsMessage("Dynamics connection succeeded.");
      setStatus("Dynamics connection succeeded");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dynamics connection failed";
      setDynamicsMessage(message);
      setStatus(message);
      const result = await getDynamicsStatus();
      setDynamicsStatus(result.data);
    }
  }

  async function refreshFromDynamics() {
    setDynamicsMessage("Refreshing from Dynamics...");
    setStatus("Refreshing from Dynamics...");
    try {
      const result = await syncDynamics();
      if (result.status) setDynamicsStatus(result.status);
      await refreshAppData(filters);
      const synced = result.data?.syncedDemoCount ?? result.data?.count ?? result.status?.syncedDemoCount ?? 0;
      const excluded = result.data?.excludedNonDemoCount ?? result.status?.excludedNonDemoCount;
      setDynamicsMessage(`Synced demo opportunities: ${synced} · Scope: [AI-DEMO] only${excluded === undefined ? "" : ` · Non-demo excluded: ${excluded}`}`);
      setStatus("Dynamics data refreshed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dynamics refresh failed";
      setDynamicsMessage(message);
      setStatus(message);
      const result = await getDynamicsStatus();
      setDynamicsStatus(result.data);
    }
  }

  function updateFilter(key: keyof DashboardFilters, value: string) {
    const nextFilters = { ...filters, [key]: value || undefined };
    setFilters(nextFilters);
    refreshDashboard(nextFilters).catch((error) => setStatus(error.message));
  }

  function clearFilters() {
    setFilters({});
    refreshDashboard({}).catch((error) => setStatus(error.message));
  }

  function changeRole(nextRole: Role) {
    setRole(nextRole);
    if (selectedId) doTransform(nextRole, selectedId);
  }

  function changeOpportunity(nextId: string) {
    setSelectedId(nextId);
    setActionOpportunityId(nextId);
    setSafeContextPreview(null);
    if (nextId) doTransform(role, nextId);
  }

  async function loadDecisionView(mode = decisionMode, scenarioId = decisionScenarioId, opportunityToken = "") {
    setDecisionLoading(true);
    setDecisionError("");
    try {
      const result = await fetchDecisionView(mode, mode === "scenario" ? scenarioId : "", opportunityToken);
      setDecisionView(result.data);
      const scenarioLabel = result.data.scenario ? scenarioTitle(result.data.scenario.id, result.data.scenario.title) : "场景聚焦";
      setStatus(`${mode === "portfolio" ? "组合视图" : scenarioLabel}已就绪`);
    } catch (error) {
      setDecisionView(null);
      setDecisionError(error instanceof Error ? error.message : "Decision view failed");
      setStatus("决策视图暂不可用");
    } finally {
      setDecisionLoading(false);
    }
  }

  function changeDecisionMode(nextMode: DecisionMode) {
    setDecisionMode(nextMode);
    loadDecisionView(nextMode, decisionScenarioId).catch(() => undefined);
  }

  function changeDecisionScenario(nextScenarioId: string) {
    setDecisionMode("scenario");
    setDecisionScenarioId(nextScenarioId);
    loadDecisionView("scenario", nextScenarioId).catch(() => undefined);
  }

  function changeDecisionOpportunity(token: string) {
    loadDecisionView(decisionMode, decisionScenarioId, token).catch(() => undefined);
  }

  function changeAmountDisplayMode(nextMode: AmountDisplayMode) {
    if (nextMode === "exact" && amountDisplayMode !== "exact") {
      const confirmed = window.confirm("精确金额仅在当前受控界面展示，不会发送给外部模型。");
      if (!confirmed) return;
    }
    setAmountDisplayMode(nextMode);
  }

  function resetDecisionPortfolio() {
    const defaultToken = decisionCatalog?.portfolioDefaultOpportunity || "DEMO-6C-OPP-075";
    setDecisionMode("portfolio");
    setDecisionScenarioId("multi-risk-priority");
    setAmountDisplayMode("range");
    loadDecisionView("portfolio", "", defaultToken).catch(() => undefined);
  }

  async function openOpportunityDetail(nextId: string) {
    setSelectedId(nextId);
    setActionOpportunityId(nextId);
    const item = safeOpportunities.find((opportunity) => opportunity.id === nextId);
    if (item?.customer_code) setActionCustomerToken(item.customer_code);
    setPage("detail");
    await doTransform(role, nextId);
    await loadSafeContextPreview(nextId);
  }

  useEffect(() => {
    if (!dashboard || safeOpportunities.length === 0) return;
    if (filteredOpportunities.length === 0) {
      if (selectedId) setSelectedId("");
      return;
    }
    const nextId = filteredOpportunities.some((item) => item.id === selectedId)
      ? selectedId
      : filteredOpportunities[0].id;
    if (nextId !== selectedId) {
      setSelectedId(nextId);
      setActionOpportunityId(nextId);
      setSafeContextPreview(null);
    }
  }, [dashboard, filteredOpportunities, safeOpportunities.length, selectedId]);

  useEffect(() => {
    Promise.all([getOpportunities(), getManagementDashboard({}), getDynamicsStatus(), getAiProviderStatus()])
      .then(async ([opportunityResult, dashboardResult, dynamicsStatusResult, providerStatusResult]) => {
        const items = Array.isArray(opportunityResult.data) ? opportunityResult.data : [];
        setOpportunities(items);
        setDashboard(dashboardResult.data);
        setDynamicsStatus(dynamicsStatusResult.data);
        setProviderStatus(providerStatusResult.data);
        const initialId = items[0]?.id || "";
        setSelectedId(initialId);
        setActionOpportunityId(initialId);
        setActionCustomerToken(items[0]?.customer_code || "");
        if (items.length > 0 && initialId) {
          const result = await transformOpportunity(role, initialId);
          setTransform(result);
        } else if (!Array.isArray(opportunityResult.data)) {
          setStatus("Failed to load opportunities. Please check DATA_SOURCE and Dynamics connection.");
          setTransform(null);
          await refreshAudit();
          return;
        } else {
          setStatus("No opportunities loaded. Check API connection.");
          setTransform(null);
          await refreshAudit();
          return;
        }
        await refreshAudit();
        setStatus("AI 驾驶舱已就绪");
      })
      .catch(() => setStatus("Failed to load opportunities. Please check DATA_SOURCE and Dynamics connection."));
  }, []);

  useEffect(() => {
    Promise.all([getDecisionScenarios(), fetchDecisionView("portfolio")])
      .then(([catalogResult, viewResult]) => {
        setDecisionCatalog(catalogResult.data);
        setDecisionView(viewResult.data);
        setDecisionLoading(false);
        setDecisionError("");
      })
      .catch((error) => {
        setDecisionLoading(false);
        setDecisionError(error instanceof Error ? error.message : "Decision portfolio failed to load");
      });
  }, []);

  return (
    <main className="app">
      <header className="topbar">
        <div className="gateway-brand">
          <p>{t("app.subtitle")}</p>
          <h1>{t("app.title")}</h1>
        </div>
        <nav className="tabs">
          <button className={page === "cockpit" ? "active" : ""} onClick={() => setPage("cockpit")}>AI 驾驶舱</button>
          <button className={page === "risk" ? "active" : ""} onClick={() => setPage("risk")}>风险与优先级</button>
          <button className={page === "detail" ? "active" : ""} onClick={() => setPage("detail")}>商机 360</button>
          <button className={page === "actionBoard" ? "active" : ""} onClick={() => setPage("actionBoard")}>行动看板</button>
          <button className={page === "meeting" ? "active" : ""} onClick={() => setPage("meeting")}>会议副驾</button>
          <button className={page === "portfolio" ? "active" : ""} onClick={() => setPage("portfolio")}>组合洞察</button>
          <button className={page === "gateway" ? "active" : ""} onClick={() => setPage("gateway")}>审计与安全</button>
        </nav>
        <div className="topbar-utility">
          <span className="demo-access-badge">演示全权限</span>
          <span className={transform?.blocked ? "status danger" : "status"}>{status}</span>
        </div>
      </header>
      <ProviderSafetyStrip status={providerStatus} />
      <DecisionContextBar
        amountDisplayMode={amountDisplayMode}
        catalog={decisionCatalog}
        dataSource="local-fixture"
        department="all"
        mode={decisionMode}
        onDataSourceChange={() => undefined}
        onDepartmentChange={() => undefined}
        onModeChange={changeDecisionMode}
        onAmountDisplayModeChange={changeAmountDisplayMode}
        onOpportunityChange={changeDecisionOpportunity}
        onReset={resetDecisionPortfolio}
        onScenarioChange={changeDecisionScenario}
        scenarioId={decisionScenarioId}
        status={status}
        view={decisionView}
      />

      {(["cockpit", "risk", "detail", "actionBoard", "meeting", "portfolio"] as DecisionPage[]).includes(page as DecisionPage) ? (
        <DecisionWorkspace amountDisplayMode={amountDisplayMode} dataSource="local-fixture" department="all" page={page as DecisionPage} view={decisionView} loading={decisionLoading} error={decisionError} onRetry={() => loadDecisionView()} onOpportunityChange={changeDecisionOpportunity} />
      ) : page === "opportunities" ? (
        <OpportunityListPage
          dashboard={dashboard}
          dynamicsStatus={dynamicsStatus}
          onOpenOpportunity={openOpportunityDetail}
          onRefreshDynamics={refreshFromDynamics}
          opportunities={filteredOpportunities}
          t={t}
        />
      ) : page === "actions" ? (
        <AiSalesActions
          actionCustomerToken={actionCustomerToken}
          actionLoading={actionLoading}
          actionOpportunityId={actionOpportunityId}
          actionResults={actionResults}
          dynamicsStatus={dynamicsStatus}
          filters={filters}
          onCustomerChange={setActionCustomerToken}
          onOpportunityChange={setActionOpportunityId}
          onRunAction={runSalesAction}
          opportunities={filteredOpportunities}
          t={t}
        />
      ) : (
        <DataSafetyGateway
          aiResult={aiResult}
          auditLog={auditLog}
          onAi={callAi}
          onResetLog={resetLog}
          onRoleChange={changeRole}
          onTransform={() => doTransform()}
          onOpportunityChange={changeOpportunity}
          opportunities={filteredOpportunities}
          role={role}
          selected={selected}
          selectedId={selectedId}
          providerStatus={providerStatus}
          transform={transform}
          t={t}
        />
      )}
    </main>
  );
}

function RiskRadarPage({ dashboard, providerStatus, t }: { dashboard: ManagementDashboard | null; providerStatus: AiProviderStatus | null; t: TFunction }) {
  const riskRadar = dashboard?.riskRadar;
  const [selectedCell, setSelectedCell] = useState<{ stage: string; riskLevel: "high" | "medium" | "low" } | null>(null);
  const [selectedCaseToken, setSelectedCaseToken] = useState("");
  const riskCases = selectedCell ? (riskRadar?.riskCases || []) : (riskRadar?.topRiskCases || []);
  const filteredCases = selectedCell
    ? riskCases.filter((item) => matchesRiskCell(item, selectedCell))
    : riskCases;

  useEffect(() => {
    if (!filteredCases.length) {
      if (selectedCaseToken) setSelectedCaseToken("");
      return;
    }
    if (!filteredCases.some((item) => item.opportunityToken === selectedCaseToken)) {
      setSelectedCaseToken(filteredCases[0].opportunityToken);
    }
  }, [filteredCases, selectedCaseToken]);

  if (!dashboard || !riskRadar) {
    return <section className="risk-radar-page loading">{t("common.loading")}</section>;
  }

  const selectedCase = filteredCases.find((item) => item.opportunityToken === selectedCaseToken) || filteredCases[0] || null;

  return (
    <section className="risk-radar-page">
      <section className="risk-radar-hero">
        <div>
          <p>{t("riskRadar.title")}</p>
          <h2>{t("riskRadar.subtitle")}</h2>
          <span>{riskRadar.totalCount} {t("riskRadar.description")}</span>
        </div>
        <SafetyNotice t={t} />
      </section>

      <UnifiedDecisionCard output={selectedCase ? adaptRiskCase(selectedCase, providerStatus) : placeholderOutput("Risk decision", providerStatus)} />

      <Panel title={t("riskRadar.driverSummary")}>
        <div className="risk-driver-summary">
          {riskRadar.driverSummary.map((driver) => (
            <article key={driver.driver}>
              <span>{driver.driver}</span>
              <strong>{driver.count}</strong>
              <small>{driver.mitigation}</small>
            </article>
          ))}
        </div>
      </Panel>

      <section className="risk-radar-grid">
        <Panel title={t("riskRadar.matrix")}>
          <RiskMatrix matrix={riskRadar.matrix} selectedCell={selectedCell} onSelect={setSelectedCell} t={t} />
        </Panel>
        <Panel title={t("riskRadar.topRiskCases")}>
          <TopRiskCases cases={filteredCases} onSelect={setSelectedCaseToken} selectedToken={selectedCase?.opportunityToken || ""} t={t} />
        </Panel>
        <Panel title={t("riskRadar.evidencePanel")}>
          <RiskEvidencePanel riskCase={selectedCase} t={t} />
        </Panel>
      </section>
    </section>
  );
}

function matchesRiskCell(item: RiskRadarCase, cell: { stage: string; riskLevel: "high" | "medium" | "low" }) {
  return normalizeMatrixValue(item.opportunityStage) === normalizeMatrixValue(cell.stage) && item.riskLevel === cell.riskLevel;
}

function normalizeMatrixValue(value = "") {
  return String(value).trim().toLowerCase();
}

function RiskMatrix({
  matrix,
  onSelect,
  selectedCell,
  t,
}: {
  matrix: NonNullable<ManagementDashboard["riskRadar"]>["matrix"];
  onSelect: (cell: { stage: string; riskLevel: "high" | "medium" | "low" } | null) => void;
  selectedCell: { stage: string; riskLevel: "high" | "medium" | "low" } | null;
  t: TFunction;
}) {
  const stages = [...new Set(matrix.map((item) => item.stage))];
  const riskLevels: Array<"high" | "medium" | "low"> = ["high", "medium", "low"];
  if (!stages.length) return <EmptyState label={t("empty.noRiskMatrix")} />;
  return (
    <div className="risk-matrix">
      <div className="risk-matrix-header">
        <span>{t("riskRadar.stage")}</span>
        {riskLevels.map((level) => <span key={level}>{level}</span>)}
      </div>
      {stages.map((stage) => (
        <div className="risk-matrix-row" key={stage}>
          <strong>{stage}</strong>
          {riskLevels.map((riskLevel) => {
            const count = matrix.find((item) => item.stage === stage && item.riskLevel === riskLevel)?.count || 0;
            const active = selectedCell?.stage === stage && selectedCell.riskLevel === riskLevel;
            return (
              <button className={`${riskLevel} ${active ? "active" : ""}`} key={riskLevel} onClick={() => onSelect(active ? null : { stage, riskLevel })}>
                {count}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TopRiskCases({ cases, onSelect, selectedToken, t }: { cases: RiskRadarCase[]; onSelect: (token: string) => void; selectedToken: string; t: TFunction }) {
  if (!cases.length) return <EmptyState label={t("empty.noRiskCases")} />;
  return (
    <div className="top-risk-cases">
      {cases.map((item) => (
        <button className={item.opportunityToken === selectedToken ? "active" : ""} key={item.opportunityToken} onClick={() => onSelect(item.opportunityToken)}>
          <div>
            <strong>{item.opportunityToken}</strong>
            <span>{item.ownerToken}</span>
          </div>
          <InsightBadges badges={item.badges} />
          <dl>
            <dt>Stage</dt><dd>{item.opportunityStage}</dd>
            <dt>Win</dt><dd>{item.winProbability}</dd>
            <dt>Amount</dt><dd>{item.estimatedQuoteBand}</dd>
          </dl>
          <p>{item.riskReason}</p>
        </button>
      ))}
    </div>
  );
}

function RiskEvidencePanel({ riskCase, t }: { riskCase: RiskRadarCase | null; t: TFunction }) {
  if (!riskCase) return <EmptyState label={t("empty.selectRiskCase")} />;
  return (
    <div className="risk-evidence-panel">
      <InsightField label={t("insight.finding")} value={riskCase.finding} />
      <InsightField label={t("insight.reason")} value={riskCase.reason} />
      <InsightField label={t("insight.evidence")} value={riskCase.evidence} />
      <section className="mitigation-panel">
        <h4>{t("riskRadar.recommendedMitigation")}</h4>
        <ul>{riskCase.recommendedMitigation.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <InsightField label={t("insight.safety")} value={riskCase.safety} />
    </div>
  );
}

type ActionFilter = { kind: "all" | "owner" | "type" | "rank"; value: string };

function ActionBoardPage({ dashboard, providerStatus, t }: { dashboard: ManagementDashboard | null; providerStatus: AiProviderStatus | null; t: TFunction }) {
  const actionBoard = dashboard?.actionBoard;
  const [filter, setFilter] = useState<ActionFilter>({ kind: "all", value: "" });
  const [selectedActionId, setSelectedActionId] = useState("");
  const actions = filterActions(actionBoard?.actions || [], filter);

  useEffect(() => {
    if (!actions.length) {
      if (selectedActionId) setSelectedActionId("");
      return;
    }
    if (!actions.some((item) => item.id === selectedActionId)) {
      setSelectedActionId(actions[0].id);
    }
  }, [actions, selectedActionId]);

  if (!dashboard || !actionBoard) {
    return <section className="action-board-page loading">{t("common.loading")}</section>;
  }

  const selectedAction = actions.find((item) => item.id === selectedActionId) || actions[0] || null;

  return (
    <section className="action-board-page">
      <section className="action-board-hero">
        <div>
          <p>{t("actionBoard.title")}</p>
          <h2>{t("actionBoard.subtitle")}</h2>
          <span>{t("actionBoard.description")}</span>
        </div>
        <SafetyNotice t={t} />
      </section>

      <ActionSummary summary={actionBoard.summary} t={t} />

      <UnifiedDecisionCard output={selectedAction ? adaptActionBoardItem(selectedAction, providerStatus) : placeholderOutput("Priority action", providerStatus)} />

      <section className="action-board-grid">
        <Panel title={t("actionBoard.ownerBoard")}>
          <OwnerFollowUpBoard groups={actionBoard.ownerGroups} onFilter={(owner) => setFilter({ kind: "owner", value: owner })} selected={filter} t={t} />
        </Panel>
        <Panel title={t("actionBoard.actionList")}>
          <ActionList actions={actions} filter={filter} onClearFilter={() => setFilter({ kind: "all", value: "" })} onSelect={setSelectedActionId} selectedId={selectedAction?.id || ""} t={t} />
        </Panel>
        <Panel title={t("actionBoard.suggestedDraft")}>
          <ActionDraftPanel action={selectedAction} t={t} />
        </Panel>
      </section>

      <section className="action-board-footer">
        <Panel title={t("actionBoard.actionTypeGroups")}>
          <ActionTypeGroups groups={actionBoard.actionTypeGroups} onFilter={(actionType) => setFilter({ kind: "type", value: actionType })} selected={filter} />
        </Panel>
        <Panel title={t("actionBoard.priorityRank")}>
          <PriorityRankGroups groups={actionBoard.priorityRanks} onFilter={(rank) => setFilter({ kind: "rank", value: rank })} selected={filter} />
        </Panel>
      </section>
    </section>
  );
}

function ActionSummary({ summary, t }: { summary: NonNullable<ManagementDashboard["actionBoard"]>["summary"]; t: TFunction }) {
  const metrics = [
    ["Total Actions", summary.totalActions],
    ["Urgent This Week", summary.urgentThisWeek],
    ["Executive Escalations", summary.executiveEscalations],
    ["Cost Breakdown Needed", summary.costBreakdownNeeded],
    ["Decision Maker Confirmation Needed", summary.decisionMakerConfirmationNeeded],
    ["Overdue Follow-up Needed", summary.overdueFollowUpNeeded],
  ];
  return (
    <Panel title={t("actionBoard.summary")}>
      <div className="action-summary-grid">
        {metrics.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function OwnerFollowUpBoard({
  groups,
  onFilter,
  selected,
  t,
}: {
  groups: NonNullable<ManagementDashboard["actionBoard"]>["ownerGroups"];
  onFilter: (owner: string) => void;
  selected: ActionFilter;
  t: TFunction;
}) {
  if (!groups.length) return <EmptyState label={t("empty.noOwnerActions")} />;
  return (
    <div className="owner-followup-board">
      <p className="owner-token-note">{t("actionBoard.ownerTokenized")}</p>
      {groups.map((group) => (
        <button className={selected.kind === "owner" && selected.value === group.ownerToken ? "active" : ""} key={group.ownerToken} onClick={() => onFilter(group.ownerToken)}>
          <strong>{group.ownerToken}</strong>
          <span>{group.actionCount} actions</span>
          <small>{group.urgentCount} urgent · {group.executiveEscalationCount} escalations</small>
        </button>
      ))}
    </div>
  );
}

function ActionList({
  actions,
  filter,
  onClearFilter,
  onSelect,
  selectedId,
  t,
}: {
  actions: ActionBoardAction[];
  filter: ActionFilter;
  onClearFilter: () => void;
  onSelect: (id: string) => void;
  selectedId: string;
  t: TFunction;
}) {
  if (!actions.length) return <EmptyState label={t("empty.noActions")} />;
  return (
    <div className="action-list">
      <div className="action-list-filter">
        <span>{filter.kind === "all" ? "All actions" : `${filter.kind}: ${filter.value}`}</span>
        {filter.kind !== "all" ? <button onClick={onClearFilter}>{t("common.clear")}</button> : null}
      </div>
      {actions.map((item) => (
        <button className={item.id === selectedId ? "active" : ""} key={item.id} onClick={() => onSelect(item.id)}>
          <div>
            <strong>{item.actionType} / {item.actionSubtitle}</strong>
            <span>{item.ownerToken} · {item.dueWindow}</span>
          </div>
          <small>{item.opportunityToken} · {item.actionTitle} · {item.priorityRank}</small>
          <InsightBadges badges={item.relatedBadges} />
          <p><b>{t("insight.reason")}:</b> {item.actionReason}</p>
          <p><b>{t("insight.evidence")}:</b> {item.evidence}</p>
        </button>
      ))}
    </div>
  );
}

function ActionDraftPanel({ action, t }: { action: ActionBoardAction | null; t: TFunction }) {
  if (!action) return <EmptyState label={t("empty.selectAction")} />;
  return (
    <div className="action-draft-panel">
      <InsightField label={t("insight.finding")} value={`${action.actionType} / ${action.actionSubtitle}`} />
      <InsightField label={t("insight.reason")} value={action.actionReason} />
      <InsightField label={t("insight.action")} value={action.actionDetail} />
      <InsightField label={t("insight.owner")} value={action.ownerToken} />
      <InsightField label={t("insight.urgency")} value={`${action.urgency} · ${action.dueWindow}`} />
      <InsightField label={t("insight.evidence")} value={action.evidence} />
      <section className="crm-update-draft">
        <h4>{t("actionBoard.suggestedDraft")}</h4>
        <p>{action.suggestedCrmUpdateDraft}</p>
        <small>{t("actionBoard.draftOnly")}</small>
      </section>
      <InsightField label={t("insight.safety")} value={action.safety} />
    </div>
  );
}

function ActionTypeGroups({
  groups,
  onFilter,
  selected,
}: {
  groups: NonNullable<ManagementDashboard["actionBoard"]>["actionTypeGroups"];
  onFilter: (actionType: string) => void;
  selected: ActionFilter;
}) {
  return (
    <div className="action-type-groups">
      {groups.map((group) => (
        <button className={selected.kind === "type" && selected.value === group.actionType ? "active" : ""} key={group.actionType} onClick={() => onFilter(group.actionType)}>
          <strong>{group.actionType}</strong>
          <em>{group.actionSubtitle}</em>
          <span>{group.count}</span>
          <small>Top: {group.topOpportunities.join(", ") || "-"}</small>
          <small>Owners: {group.suggestedOwnerTokens.join(", ") || "-"}</small>
        </button>
      ))}
    </div>
  );
}

function PriorityRankGroups({
  groups,
  onFilter,
  selected,
}: {
  groups: NonNullable<ManagementDashboard["actionBoard"]>["priorityRanks"];
  onFilter: (rank: ActionBoardAction["priorityRank"]) => void;
  selected: ActionFilter;
}) {
  return (
    <div className="priority-rank-groups">
      {groups.map((group) => (
        <button className={selected.kind === "rank" && selected.value === group.rank ? "active" : ""} key={group.rank} onClick={() => onFilter(group.rank)}>
          <strong>{group.rank}</strong>
          <span>{group.count} deals · {group.actionCount} actions</span>
          <small>{group.topOpportunities.join(", ") || "No current cases"}</small>
        </button>
      ))}
    </div>
  );
}

function filterActions(actions: ActionBoardAction[], filter: ActionFilter) {
  if (filter.kind === "owner") return actions.filter((item) => item.ownerToken === filter.value);
  if (filter.kind === "type") return actions.filter((item) => item.actionType === filter.value);
  if (filter.kind === "rank") return actions.filter((item) => item.priorityRank === filter.value);
  return actions;
}

function ManagementCockpit({
  dashboard,
  dynamicsMessage,
  dynamicsStatus,
  filters,
  onClearFilters,
  onRefreshDynamics,
  onTestDynamics,
  onUpdateFilter,
  providerStatus,
  t,
}: {
  dashboard: ManagementDashboard | null;
  dynamicsMessage: string;
  dynamicsStatus: DynamicsStatus | null;
  filters: DashboardFilters;
  onClearFilters: () => void;
  onRefreshDynamics: () => void;
  onTestDynamics: () => void;
  onUpdateFilter: (key: keyof DashboardFilters, value: string) => void;
  providerStatus: AiProviderStatus | null;
  t: TFunction;
}) {
  const attentionItems = useMemo(() => buildAttentionItems(dashboard), [dashboard]);
  const [selectedAttentionId, setSelectedAttentionId] = useState("");
  useEffect(() => {
    if (!attentionItems.length) return;
    if (!attentionItems.some((item) => item.id === selectedAttentionId)) {
      setSelectedAttentionId(attentionItems[0].id);
    }
  }, [attentionItems, selectedAttentionId]);
  const selectedAttention = attentionItems.find((item) => item.id === selectedAttentionId) || attentionItems[0] || null;

  if (!dashboard) {
    return <section className="cockpit loading">{t("common.loading")}</section>;
  }

  return (
    <section className="cockpit executive">
      <StatusStrip
        dynamicsMessage={dynamicsMessage}
        dynamicsStatus={dynamicsStatus}
        onRefreshDynamics={onRefreshDynamics}
        onTestDynamics={onTestDynamics}
        providerStatus={providerStatus}
        t={t}
      />

      <FilterBar
        dashboard={dashboard}
        filters={filters}
        onClearFilters={onClearFilters}
        onUpdateFilter={onUpdateFilter}
        t={t}
      />

      <AiExecutiveSummary dashboard={dashboard} attentionItems={attentionItems} selected={selectedAttention} t={t} />

      <UnifiedDecisionCard
        compact
        output={dashboard.riskRadar?.topRiskCases[0]
          ? adaptRiskCase(dashboard.riskRadar.topRiskCases[0], providerStatus)
          : placeholderOutput("Portfolio decision", providerStatus)}
      />

      <section className="command-center-grid">
        <Panel title={t("cockpit.attentionQueue")}>
          <ManagementAttentionQueue items={attentionItems} onSelect={setSelectedAttentionId} selectedId={selectedAttention?.id || ""} t={t} />
        </Panel>
        <Panel title={t("cockpit.whyItMatters")}>
          <WhyItMattersPanel item={selectedAttention} t={t} />
        </Panel>
        <Panel title={t("cockpit.recommendedActions")}>
          <RecommendedActionsPanel item={selectedAttention} t={t} />
        </Panel>
      </section>

      <RiskDistributionFooter dashboard={dashboard} t={t} />
    </section>
  );
}

type AttentionItem = {
  id: string;
  rank: number;
  score: number;
  insight: NonNullable<ManagementDashboard["aiInsightsByOpportunity"]>[string];
  finding: string;
  reason: string;
  evidence: string;
  action: string;
  owner: string;
  urgency: string;
  safety: string;
};

const attentionBadgeWeights: Record<string, number> = {
  "High Risk": 120,
  Overdue: 95,
  "Executive Attention": 80,
  "Needs Follow-up": 60,
  "Cost Pressure": 50,
  "Decision Maker Unclear": 45,
  "Low Win Probability": 35,
};

function buildAttentionItems(dashboard: ManagementDashboard | null): AttentionItem[] {
  return Object.entries(dashboard?.aiInsightsByOpportunity || {})
    .map(([id, insight]) => {
      const score = insight.badges.reduce((sum, badge) => sum + (attentionBadgeWeights[badge] || 10), 0);
      return {
        id,
        rank: 0,
        score,
        insight,
        finding: findingForInsight(insight),
        reason: insight.main_risks[0] || insight.current_status,
        evidence: evidenceForInsight(insight),
        action: insight.next_best_actions[0] || "保持例行跟进，更新客户反馈和下一步行动。",
        owner: insight.owner_token,
        urgency: urgencyForInsight(insight),
        safety: "Safety: raw CRM data not sent",
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 10)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function findingForInsight(insight: AttentionItem["insight"]) {
  if (insight.badges.includes("High Risk")) return "高优先级案件存在逾期或关键风险，需要管理层关注。";
  if (insight.badges.includes("Executive Attention")) return "金额区间较高，建议纳入管理层关注清单。";
  if (insight.badges.includes("Cost Pressure")) return "客户需求或提案内容显示价格压力，需要准备成本拆分。";
  if (insight.badges.includes("Decision Maker Unclear")) return "决裁者或决策路径不清，可能影响推进节奏。";
  if (insight.badges.includes("Low Win Probability")) return "受注确度偏低，需要复盘报价和推进策略。";
  return "当前案件需要销售负责人持续跟进并更新 CRM 状态。";
}

function evidenceForInsight(insight: AttentionItem["insight"]) {
  return [
    insight.current_status,
    insight.badges.length ? `Badges: ${insight.badges.join(", ")}` : "Badges: Normal",
    `Customer token: ${insight.customer_token}`,
  ].join(" · ");
}

function urgencyForInsight(insight: AttentionItem["insight"]) {
  if (insight.badges.includes("High Risk") || insight.badges.includes("Overdue")) return "This week";
  if (insight.badges.includes("Needs Follow-up")) return "Next 7 days";
  if (insight.badges.includes("Executive Attention")) return "Before next management review";
  return "Before next pipeline review";
}

function AiExecutiveSummary({ attentionItems, dashboard, selected, t }: { attentionItems: AttentionItem[]; dashboard: ManagementDashboard; selected: AttentionItem | null; t: TFunction }) {
  const summary = dashboard.aiInsightSummary;
  return (
    <section className="ai-executive-summary">
      <div>
        <span>{t("cockpit.executiveSummary")}</span>
        <h2>{t("cockpit.summaryTitle", { count: attentionItems.length })}</h2>
        <p>
          {summary
            ? `${summary.high_risk_count} high risk · ${summary.overdue_count} overdue · ${summary.executive_attention_count} executive attention · ${summary.follow_up_this_week_count} follow-up this week.`
            : t("common.emptyState")}
        </p>
      </div>
      <aside>
        <strong>{selected?.id || "No selected opportunity"}</strong>
        <span>{selected?.finding || t("empty.noAttention")}</span>
        <small>{t("common.safeContextOnly")} · {t("common.rawCrmDataNotSent")} · {t("common.noCrmWriteBack")}</small>
      </aside>
    </section>
  );
}

function ManagementAttentionQueue({ items, onSelect, selectedId, t }: { items: AttentionItem[]; onSelect: (id: string) => void; selectedId: string; t: TFunction }) {
  if (!items.length) return <EmptyState label={t("empty.noAttention")} />;
  return (
    <div className="attention-queue">
      {items.map((item) => (
        <button className={item.id === selectedId ? "active" : ""} key={item.id} onClick={() => onSelect(item.id)}>
          <span>#{item.rank}</span>
          <strong>{item.id}</strong>
          <InsightBadges badges={item.insight.badges} />
          <small>{item.owner} · {item.urgency}</small>
        </button>
      ))}
    </div>
  );
}

function WhyItMattersPanel({ item, t }: { item: AttentionItem | null; t: TFunction }) {
  if (!item) return <EmptyState label={t("empty.noAttention")} />;
  return (
    <div className="why-panel">
      <InsightField label={t("insight.finding")} value={item.finding} />
      <InsightField label={t("insight.reason")} value={item.reason} />
      <InsightField label={t("insight.evidence")} value={item.evidence} />
      <InsightField label={t("insight.safety")} value={item.safety} />
    </div>
  );
}

function RecommendedActionsPanel({ item, t }: { item: AttentionItem | null; t: TFunction }) {
  if (!item) return <EmptyState label={t("common.emptyState")} />;
  return (
    <div className="recommended-actions">
      <InsightField label={t("insight.action")} value={item.action} />
      <InsightField label={t("insight.owner")} value={item.owner} />
      <InsightField label={t("insight.urgency")} value={item.urgency} />
      <section>
        <h4>{t("insight.requiredMaterials")}</h4>
        <ul>{item.insight.materials_to_prepare.map((material) => <li key={material}>{material}</li>)}</ul>
      </section>
      <section className={item.insight.executive_intervention ? "executive-yes" : ""}>
        <h4>{t("insight.managementEscalation")}</h4>
        <p>{item.insight.executive_intervention ? "建议介入" : "暂不需要"} · {item.insight.executive_intervention_reason}</p>
      </section>
    </div>
  );
}

function InsightField({ label, value }: { label: string; value: string }) {
  return <section><h4>{label}</h4><p>{value}</p></section>;
}

function SafetyNotice({ t }: { t: TFunction }) {
  return (
    <div className="safety-notice" aria-label="AI safety boundary">
      <span>{t("common.safeContextOnly")}</span>
      <span>{t("common.rawCrmDataNotSent")}</span>
      <span>{t("common.noCrmWriteBack")}</span>
    </div>
  );
}

function RiskDistributionFooter({ dashboard, t }: { dashboard: ManagementDashboard; t: TFunction }) {
  const summary = dashboard.aiInsightSummary;
  if (!summary) return null;
  return (
    <section className="risk-distribution-footer">
      <Panel title={t("cockpit.departmentDistribution")}>
        <DistributionList title="Sales Department" data={summary.sales_department_distribution} />
      </Panel>
      <Panel title={t("cockpit.stageDistribution")}>
        <DistributionList title="Stage" data={summary.stage_distribution} />
      </Panel>
      <Panel title={t("cockpit.pipelineSnapshot")}>
        <div className="pipeline-snapshot">
          <span>Total: <strong>{summary.demo_opportunity_count}</strong></span>
          <span>High Risk: <strong>{summary.high_risk_count}</strong></span>
          <span>Overdue: <strong>{summary.overdue_count}</strong></span>
          <span>High Amount: <strong>{summary.high_amount_count}</strong></span>
        </div>
        <div className="safe-note">Secondary snapshot only. Main cockpit is action-first.</div>
      </Panel>
    </section>
  );
}

function AiInsightOverview({ dashboard }: { dashboard: ManagementDashboard }) {
  const summary = dashboard.aiInsightSummary;
  if (!summary) return null;
  const metrics = [
    ["Demo Opportunity Total", summary.demo_opportunity_count],
    ["High Risk", summary.high_risk_count],
    ["Overdue", summary.overdue_count],
    ["High Amount", summary.high_amount_count],
    ["Executive Attention", summary.executive_attention_count],
    ["Follow-up This Week", summary.follow_up_this_week_count],
  ];
  return (
    <section className="cockpit-grid insight-overview">
      <Panel title="AI Insight Overview">
        <div className="insight-metrics">
          {metrics.map(([label, value]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
        <div className="safe-note">Based on Safe CRM Context only: tokens, bands, choice labels, sanitized description and progress summary.</div>
      </Panel>
      <Panel title="Safe Distribution Signals">
        <div className="distribution-grid">
          <DistributionList title="Sales Department" data={summary.sales_department_distribution} />
          <DistributionList title="Stage" data={summary.stage_distribution} />
          <DistributionList title="Customer Need" data={summary.customer_need_distribution} />
          <DistributionList title="Proposal Content" data={summary.proposal_content_distribution} />
        </div>
      </Panel>
    </section>
  );
}

function DistributionList({ data, title }: { data: Array<{ value: string; count: number }>; title: string }) {
  const max = Math.max(1, ...data.map((item) => item.count));
  return (
    <section className="distribution-list">
      <h4>{title}</h4>
      {data.length === 0 ? <p className="muted">No data</p> : null}
      {data.slice(0, 5).map((item) => (
        <div key={`${title}-${item.value}`}>
          <span>{item.value}</span>
          <strong>{item.count}</strong>
          <i style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }} />
        </div>
      ))}
    </section>
  );
}

function AiDemoAssistant({
  dynamicsStatus,
  onAsk,
  onQuestionChange,
  question,
  result,
}: {
  dynamicsStatus: DynamicsStatus | null;
  onAsk: (question?: string) => void;
  onQuestionChange: (question: string) => void;
  question: string;
  result: AiDemoChatResult | null;
}) {
  const summary = result?.context_summary;
  return (
    <Panel title="CRM AI Assistant" className="ai-demo-assistant" action={<button onClick={() => onAsk()}>Ask</button>}>
      <div className="assistant-layout">
        <section className="assistant-input">
          <label className="field compact">
            <span>Ask about current CRM Demo Data</span>
            <textarea value={question} onChange={(event) => onQuestionChange(event.target.value)} rows={4} />
          </label>
          <div className="question-chips">
            {exampleQuestions.map((item) => <button key={item} onClick={() => { onQuestionChange(item); onAsk(item); }}>{item}</button>)}
          </div>
        </section>
        <section className={result?.blocked ? "assistant-answer blocked" : "assistant-answer"}>
          <strong>{result?.blocked ? "Blocked by Safe Context" : "AI Demo Answer"}</strong>
          <p>{result?.answer || result?.error || "输入问题后，AI Demo Assistant 将基于当前筛选后的 Safe CRM Demo Context 回答。"}</p>
          <div className="context-badges">
            <span>Context Source: {labelDataSource(summary?.data_source || dynamicsStatus?.dataSource)}</span>
            <span>Dynamics Records: {summary?.dynamics_records ?? dynamicsStatus?.recordCount ?? 0}</span>
            <span>Total Opportunities: {summary?.total_opportunities ?? "-"}</span>
            <span>Last Refresh Time: {formatTime(summary?.last_refresh_time || dynamicsStatus?.lastRefreshTime)}</span>
            <span>Safe Context: Enabled</span>
          </div>
        </section>
      </div>
    </Panel>
  );
}

function OpportunityListPage({
  dashboard,
  dynamicsStatus,
  onOpenOpportunity,
  onRefreshDynamics,
  opportunities,
  t,
}: {
  dashboard: ManagementDashboard | null;
  dynamicsStatus: DynamicsStatus | null;
  onOpenOpportunity: (id: string) => void;
  onRefreshDynamics: () => void;
  opportunities: Opportunity[];
  t: TFunction;
}) {
  const insights = dashboard?.aiInsightsByOpportunity || {};
  return (
    <section className="opportunity-page">
      <section className="record-commandbar">
        <div>
          <p>Sales / Opportunities</p>
          <h2>{t("opportunities.title")}</h2>
          <span className="muted">Filtered Opportunities: {dashboard?.filteredCount ?? opportunities.length} / {dashboard?.totalDemoCount ?? opportunities.length}</span>
        </div>
        <div className="record-actions">
          <span>{t("common.dataSource")}: {labelDataSource(dynamicsStatus?.dataSource)}</span>
          <span>{t("common.dynamicsRecords")}: {dynamicsStatus?.recordCount ?? 0}</span>
          <button onClick={onRefreshDynamics}>{t("common.importRefreshFromDynamics")}</button>
        </div>
      </section>

      <Panel title={t("opportunities.open")}>
        <div className="table-scroll">
          <table className="dense-table opportunity-list-table">
            <thead>
              <tr>
                <th>Opportunity</th><th>Customer</th><th>Owner</th><th>Stage</th><th>AI Badges</th><th>Segment</th><th>Transport</th><th>Revenue</th><th>Margin</th><th>Risk</th><th>Next AI Action</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.length === 0 ? <tr><td colSpan={11}><EmptyState label={t("empty.noOpportunitiesFiltered")} /></td></tr> : null}
              {opportunities.map((item) => (
                <tr className="clickable-row" key={item.id} onClick={() => onOpenOpportunity(item.id)}>
                  <td><strong>{item.id}</strong><span>{item.opportunity_name}</span></td>
                  <td>{item.customer_code}</td>
                  <td>{item.owner_id}</td>
                  <td>{item.stage}</td>
                  <td><InsightBadges badges={insights[item.id]?.badges || []} /></td>
                  <td>{item.business_segment || "-"}</td>
                  <td>{item.transport_mode}</td>
                  <td>{item.revenue_band || "-"}</td>
                  <td>{item.margin_band || "-"}</td>
                  <td><RiskBadge value={item.risk_level} /></td>
                  <td>{item.ai_suggested_action || "Generate AI action"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}

function OpportunityDetailPage({
  actionLoading,
  actionResults,
  auditLog,
  dashboard,
  externalAiLoading,
  externalAiResult,
  onBack,
  onExternalAiRiskAnalysis,
  onRunAction,
  opportunity,
  providerStatus,
  safeContextPreview,
  transform,
  t,
}: {
  actionLoading: AiActionName | null;
  actionResults: Partial<Record<AiActionName, AiActionResult>>;
  auditLog: AuditEntry[];
  dashboard: ManagementDashboard | null;
  externalAiLoading: boolean;
  externalAiResult: AiResult | null;
  onBack: () => void;
  onExternalAiRiskAnalysis: () => void;
  onRunAction: (actionName: AiActionName) => void;
  opportunity: Opportunity | null;
  providerStatus: AiProviderStatus | null;
  safeContextPreview: Record<string, unknown> | null;
  transform: TransformResult | null;
  t: TFunction;
}) {
  if (!opportunity) return <section className="opportunity-page"><EmptyState label={t("empty.noOpportunitySelected")} /></section>;
  const recentAudit = auditLog.filter((entry) => entry.opportunity_id === opportunity.id || entry.functionName?.includes("summary") || entry.safe_context_enabled).slice(0, 8);
  const insight = dashboard?.aiInsightsByOpportunity?.[opportunity.id];
  const decisionCase = dashboard?.riskRadar?.riskCases.find((item) => item.opportunityToken === opportunity.id) || null;
  const externalAiEnabled = providerStatus?.provider === "openai-compatible" && providerStatus?.externalAiEnabled === true;
  const safeContextReady = Boolean(transform?.safePayload && !transform.blocked);
  const externalDisabledReason = externalAiEnabled ? t("dealBrief.safeContextNotReady") : t("dealBrief.externalAiDisabled");
  return (
    <section className="opportunity-page detail">
      <section className="record-commandbar">
        <div>
          <p>Sales / Opportunities / {opportunity.id}</p>
          <h2>{opportunity.opportunity_name}</h2>
        </div>
        <div className="record-actions">
          <button onClick={onBack}>{t("dealBrief.backToList")}</button>
          <button onClick={() => onRunAction("opportunity-brief")}>{t("dealBrief.opportunityBrief")}</button>
          <button onClick={() => onRunAction("next-best-actions")}>{t("dealBrief.nextBestAction")}</button>
          <button onClick={() => onRunAction("risk-summary")}>{t("dealBrief.riskSummary")}</button>
          <button onClick={() => onRunAction("data-doctor")}>{t("dealBrief.dataQualityCheck")}</button>
        </div>
      </section>

      <SafetyNotice t={t} />
      <UnifiedDecisionCard output={decisionCase ? adaptRiskCase(decisionCase, providerStatus) : placeholderOutput("Opportunity decision", providerStatus)} />

      <section className="record-header">
        <div><span>Customer</span><strong>{opportunity.customer_code}</strong></div>
        <div><span>Owner</span><strong>{opportunity.owner_id}</strong></div>
        <div><span>Stage</span><strong>{opportunity.stage}</strong></div>
        <div><span>Revenue Band</span><strong>{opportunity.revenue_band || "-"}</strong></div>
        <div><span>Margin Band</span><strong>{opportunity.margin_band || "-"}</strong></div>
        <div><span>Risk</span><strong><RiskBadge value={opportunity.risk_level} /></strong></div>
      </section>

      <section className="process-flow">
        {["L1 Initial Contact", "L2 Need Confirmed", "L3 Proposal", "L4 Quotation", "L5 Won"].map((stage) => (
          <span className={opportunity.stage === stage ? "active" : ""} key={stage}>{stage}</span>
        ))}
      </section>

      <section className="demo-loop-grid">
        <Panel title={t("dealBrief.crmData")}>
          {transform?.crmData?.length ? (
            <CrmDataByCategory fields={transform.crmData} />
          ) : (
            <div className="form-grid">
              <DetailField label="Business Segment" value={valueOrEmpty(opportunity.business_segment)} />
              <DetailField label="Transport Mode" value={valueOrEmpty(opportunity.transport_mode)} />
              <DetailField label="Trade Lane" value={valueOrEmpty(opportunity.trade_lane)} />
              <DetailField label="Cargo Type" value={valueOrEmpty(opportunity.cargo_type)} />
              <DetailField label="Forecast Category" value={valueOrEmpty(opportunity.forecast_category)} />
              <DetailField label="Expected Order Date" value={valueOrEmpty(opportunity.expected_order_date)} />
              <DetailField label="Customer Need" value={valueOrEmpty(opportunity.customer_need)} />
              <DetailField label="AI Suggested Action" value={valueOrEmpty(opportunity.ai_suggested_action)} />
            </div>
          )}
        </Panel>

        <Panel title={t("dealBrief.safeContext")}>
          <SafeProgressSummaryPanel safeContextPreview={safeContextPreview} t={t} />
          {safeContextPreview ? <JsonPanel value={safeContextPreview} /> : <p className="muted">Safe Context will load after opening the record. Provider input key: safeOpportunityContext.</p>}
          <div className="safe-note">Safe Context only · Raw CRM data not sent · No CRM write-back.</div>
          {transform?.checklist ? (
            <div className="mini-checklist">
              {transform.checklist.map((item) => <span className={item.pass ? "pass" : "fail"} key={item.label}>{item.pass ? "✓" : "!"} {item.label}</span>)}
            </div>
          ) : null}
        </Panel>

        <Panel title={t("dealBrief.aiInsight")}>
          <AiInsightPanel insight={insight} t={t} />
        </Panel>

        <Panel title={t("dealBrief.externalAi")}>
          <div className="external-ai-entry">
            <button
              className="primary"
              disabled={!externalAiEnabled || !safeContextReady || externalAiLoading}
              onClick={onExternalAiRiskAnalysis}
            >
              {externalAiLoading ? t("common.generating") : t("dealBrief.externalAiAnalyze")}
            </button>
            <div className="safe-note">{t("common.safeContextOnly")} · {t("common.rawCrmDataNotSent")} · {t("common.noCrmWriteBack")}</div>
            {!externalAiEnabled || !safeContextReady ? <p className="muted">{externalDisabledReason}</p> : null}
          </div>
          <ExternalAiResultCard result={externalAiResult} t={t} />
        </Panel>

        <Panel title={t("dealBrief.aiOutput")}>
          <div className="detail-actions">
            <ActionPanel actionName="opportunity-brief" loading={actionLoading} onRun={onRunAction} result={actionResults["opportunity-brief"]} title="Opportunity Brief">
              <Opportunity360Brief result={actionResults["opportunity-brief"]?.result} />
            </ActionPanel>
            <ActionPanel actionName="next-best-actions" loading={actionLoading} onRun={onRunAction} result={actionResults["next-best-actions"]} title="Next Best Action">
              <NextBestActionBoard result={actionResults["next-best-actions"]?.result} />
            </ActionPanel>
            <ActionPanel actionName="risk-summary" loading={actionLoading} onRun={onRunAction} result={actionResults["risk-summary"]} title="Risk Summary">
              <RiskSummary result={actionResults["risk-summary"]?.result} />
            </ActionPanel>
            <ActionPanel actionName="data-doctor" loading={actionLoading} onRun={onRunAction} result={actionResults["data-doctor"]} title="Data Quality Check">
              <CrmDataDoctor result={actionResults["data-doctor"]?.result} />
            </ActionPanel>
          </div>
        </Panel>

        <Panel title={t("dealBrief.auditLog")}>
          <div className="audit-list detail-audit">
            {recentAudit.length === 0 ? <p className="muted">Run an AI action to create audit events.</p> : null}
            {recentAudit.map((entry) => (
              <article key={entry.id}>
                <strong>{entry.type === "transform" ? "Gateway Transform" : `AI ${entry.functionName}`}</strong>
                <span>{entry.timestamp}</span>
                <p>{entry.role} · {entry.opportunity_id} · {entry.status || entry.checklist_result}</p>
                {entry.safe_payload_keys ? <small>Provider input: {entry.safe_payload_keys.join(", ")}</small> : null}
                {entry.type === "ai_call" ? <small>Provider: {entry.provider || "demo"} · External model called: {String(Boolean(entry.external_model_called))}</small> : null}
              </article>
            ))}
          </div>
        </Panel>
      </section>
    </section>
  );
}

function ExternalAiResultCard({ result, t }: { result: AiResult | null; t: TFunction }) {
  if (!result) return <p className="muted">External AI result will appear here after a manual single-record analysis.</p>;
  const audit = result.audit || {};
  const providerUsed = audit.provider_used || result.provider || "demo";
  const json = result.jsonOutput;
  const fallbackReason = displayFallbackReason(audit.fallback_reason, audit.blocked_pattern_key);
  return (
    <article className={result.blocked ? "ai-output blocked external-ai-result" : "ai-output external-ai-result"}>
      <div className="form-grid">
        <DetailField label={t("dealBrief.providerUsed")} value={String(providerUsed)} />
        <DetailField label="external_model_called" value={String(Boolean(audit.external_model_called ?? result.external_model_called))} />
        <DetailField label="fallback_used" value={String(Boolean(audit.fallback_used))} />
        <DetailField label={t("dealBrief.outputGuardStatus")} value={String(audit.output_guard_status || "-")} />
        <DetailField label="safe_context_used" value={String(audit.safe_context_used === true)} />
        <DetailField label="raw_data_sent" value={String(audit.raw_data_sent === true)} />
        <DetailField label={t("dealBrief.responseFormat")} value={`requested=${String(Boolean(audit.response_format_requested))}; retry=${String(Boolean(audit.response_format_retry_used))}`} />
      </div>
      {fallbackReason ? <p className="muted"><strong>{t("dealBrief.fallbackReason")}:</strong> {fallbackReason}</p> : null}
      {json ? (
        <div className="external-ai-json">
          <DetailField label="summary" value={json.summary || "-"} />
          <ExternalAiList label="findings" values={json.findings} />
          <ExternalAiList label="risks" values={json.risks} />
          <ExternalAiList label="recommendedActions" values={json.recommendedActions} />
          <ExternalAiList label="requiredMaterials" values={json.requiredMaterials} />
          <DetailField label="managementEscalation" value={String(json.managementEscalation)} />
          <DetailField label="safetyNote" value={json.safetyNote || "raw CRM data not sent"} />
        </div>
      ) : (
        <p>{result.output || result.answer || result.error || "-"}</p>
      )}
      <div className="safe-note">{t("common.safeContextOnly")} · {t("common.rawCrmDataNotSent")} · {t("common.noCrmWriteBack")}</div>
    </article>
  );
}

function displayFallbackReason(reason = "", blockedPatternKey = "") {
  if (!reason) return "";
  if (blockedPatternKey === "phone") return "External AI blocked by safety guard: possible phone number.";
  if (blockedPatternKey === "email") return "External AI blocked by safety guard: possible email.";
  if (blockedPatternKey === "exact_amount") return "External AI blocked by safety guard: possible exact amount.";
  if (reason.includes("/")) return "External AI blocked by safety guard.";
  return reason;
}

function ExternalAiList({ label, values = [] }: { label: string; values?: string[] }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      {values.length ? (
        <ul>
          {values.map((value, index) => <li key={`${label}-${index}`}>{value}</li>)}
        </ul>
      ) : <strong>-</strong>}
    </div>
  );
}

function CrmDataByCategory({ fields }: { fields: NonNullable<TransformResult["crmData"]> }) {
  const groups = fields.reduce<Record<string, typeof fields>>((acc, field) => {
    acc[field.category] = acc[field.category] || [];
    acc[field.category].push(field);
    return acc;
  }, {});
  return (
    <div className="crm-category-list">
      {Object.entries(groups).map(([category, items]) => (
        <section key={category}>
          <h4>{category}</h4>
          <div className="form-grid">
            {items.map((field) => (
              <DetailField
                key={field.appName}
                label={field.label?.["zh-CN"] || field.appName}
                value={valueOrEmpty(field.value)}
                meta={`${field.appName} · ${field.sensitivity} · ${sourceSystemLabel(field.sourceSystem)}${field.mappingStatus === "pending_real_api_mapping" ? " · Pending real CRM API mapping / 待确认真实 CRM API 字段名" : ""}`}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DetailField({ label, meta, value }: { label: string; meta?: string; value: string }) {
  return <div className="detail-field"><span>{label}</span><strong>{value}</strong>{meta ? <small>{meta}</small> : null}</div>;
}

function SafeProgressSummaryPanel({ safeContextPreview, t }: { safeContextPreview: Record<string, unknown> | null; t: TFunction }) {
  if (!safeContextPreview) return null;
  const description = stringValue(safeContextPreview.sanitizedDescription);
  const progress = stringValue(safeContextPreview.sanitizedProgressSummary);
  return (
    <section className="safe-progress-summary">
      <h4>{t("dealBrief.safeProgress")}</h4>
      <DetailField label="sanitizedDescription" value={valueOrEmpty(description)} meta={`${description.length} chars · sanitized`} />
      <DetailField label="sanitizedProgressSummary" value={valueOrEmpty(progress)} meta={`${progress.length} chars · sanitized`} />
    </section>
  );
}

function AiInsightPanel({ insight, t }: { insight?: NonNullable<ManagementDashboard["aiInsightsByOpportunity"]>[string]; t: TFunction }) {
  if (!insight) return <EmptyState label={t("common.emptyState")} />;
  return (
    <div className="ai-insight-panel">
      <InsightBadges badges={insight.badges} />
      <section>
        <h4>{t("insight.caseSummary")}</h4>
        <p>{insight.case_summary}</p>
      </section>
      <section>
        <h4>{t("insight.currentStatus")}</h4>
        <p>{insight.current_status}</p>
      </section>
      <section>
        <h4>{t("insight.mainRisks")}</h4>
        <ul>{insight.main_risks.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section className="next-action-section">
        <h4>{t("insight.nextActions")}</h4>
        <ul>{insight.next_best_actions.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section>
        <h4>{t("insight.materials")}</h4>
        <ul>{insight.materials_to_prepare.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section className={insight.executive_intervention ? "executive-yes" : ""}>
        <h4>{t("insight.executiveIntervention")}</h4>
        <p>{insight.executive_intervention ? "建议介入" : "暂不需要"} · {insight.executive_intervention_reason}</p>
      </section>
    </div>
  );
}

function InsightBadges({ badges }: { badges: string[] }) {
  if (!badges.length) return <span className="insight-badge neutral">Normal</span>;
  return (
    <div className="insight-badges">
      {badges.map((badge) => <span className={`insight-badge ${badgeTone(badge)}`} key={badge}>{badge}</span>)}
    </div>
  );
}

function badgeTone(badge: string) {
  if (["High Risk", "Overdue"].includes(badge)) return "danger";
  if (["Executive Attention", "Cost Pressure", "Decision Maker Unclear", "Low Win Probability"].includes(badge)) return "warning";
  return "info";
}

function MeetingCopilotShell({
  actionLoading,
  actionResults,
  onRunAction,
  providerStatus,
}: {
  actionLoading: AiActionName | null;
  actionResults: Partial<Record<AiActionName, AiActionResult>>;
  onRunAction: (actionName: AiActionName) => void;
  providerStatus: AiProviderStatus | null;
}) {
  const result = actionResults["meeting-copilot"];
  const output = adaptLegacyActionResult("meeting-copilot", result, providerStatus) || placeholderOutput("Meeting preparation", providerStatus);
  return (
    <section className="decision-shell-page">
      <DecisionPageHeader title="Meeting Copilot" description="Prepare a safe pre-meeting brief, questions, and negotiation focus without creating CRM activities." />
      <div className="decision-shell-toolbar">
        <span>Safe context only · Read-only draft · No email or activity creation</span>
        <button disabled={Boolean(actionLoading)} onClick={() => onRunAction("meeting-copilot")}>{actionLoading === "meeting-copilot" ? "Generating..." : "Generate pre-meeting brief"}</button>
      </div>
      <UnifiedDecisionCard output={output} />
      <Panel title="Pre-meeting workspace">
        {result?.blocked ? <p className="danger-text">{result.error}</p> : <ManagementMeetingCopilot result={result?.result} />}
      </Panel>
    </section>
  );
}

function PortfolioIntelligenceShell({
  actionLoading,
  actionResults,
  onRunAction,
  providerStatus,
}: {
  actionLoading: AiActionName | null;
  actionResults: Partial<Record<AiActionName, AiActionResult>>;
  onRunAction: (actionName: AiActionName) => void;
  providerStatus: AiProviderStatus | null;
}) {
  const [mode, setMode] = useState<"growth" | "doctor">("growth");
  const actionName: AiActionName = mode === "growth" ? "customer-growth" : "data-doctor";
  const result = actionResults[actionName];
  const output = adaptLegacyActionResult(actionName, result, providerStatus) || placeholderOutput(mode === "growth" ? "Growth Finder" : "Data Doctor", providerStatus);
  return (
    <section className="decision-shell-page">
      <DecisionPageHeader title="Portfolio Intelligence" description="Combine growth discovery and data quality review in one management workflow." />
      <div className="decision-segmented" role="tablist" aria-label="Portfolio intelligence mode">
        <button className={mode === "growth" ? "active" : ""} onClick={() => setMode("growth")}>Growth Finder</button>
        <button className={mode === "doctor" ? "active" : ""} onClick={() => setMode("doctor")}>Data Doctor</button>
      </div>
      <div className="decision-shell-toolbar">
        <span>Portfolio aggregates and tokenized context only · No CRM write-back</span>
        <button disabled={Boolean(actionLoading)} onClick={() => onRunAction(actionName)}>{actionLoading === actionName ? "Generating..." : `Generate ${mode === "growth" ? "growth findings" : "data findings"}`}</button>
      </div>
      <UnifiedDecisionCard output={output} />
      <Panel title={mode === "growth" ? "Growth Finder" : "Data Doctor"}>
        {result?.blocked ? <p className="danger-text">{result.error}</p> : mode === "growth" ? <CustomerGrowthAgent result={result?.result} /> : <CrmDataDoctor result={result?.result} />}
      </Panel>
    </section>
  );
}

function AiSalesActions({
  actionCustomerToken,
  actionLoading,
  actionOpportunityId,
  actionResults,
  dynamicsStatus,
  filters,
  onCustomerChange,
  onOpportunityChange,
  onRunAction,
  opportunities,
  t,
}: {
  actionCustomerToken: string;
  actionLoading: AiActionName | null;
  actionOpportunityId: string;
  actionResults: Partial<Record<AiActionName, AiActionResult>>;
  dynamicsStatus: DynamicsStatus | null;
  filters: DashboardFilters;
  onCustomerChange: (value: string) => void;
  onOpportunityChange: (value: string) => void;
  onRunAction: (actionName: AiActionName) => void;
  opportunities: Opportunity[];
  t: TFunction;
}) {
  const customerTokens = [...new Set(opportunities.map((item) => item.customer_code).filter(Boolean))];
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  return (
    <section className="ai-actions-page">
      <section className="actions-hero">
        <div>
          <p>{t("nav.aiLab")} / Legacy Prototype</p>
          <h2>Legacy AI action prototypes retained for comparison</h2>
          <span>Main demo path uses {t("nav.managementCockpit")}, {t("nav.riskRadar")}, {t("nav.actionBoard")}, {t("nav.dealBrief")}, and {t("nav.safetyGateway")} · Active Filters: {activeFilterCount}</span>
        </div>
        <div className="actions-selectors">
          <label className="field compact">
            <span>Opportunity</span>
            <select disabled={opportunities.length === 0} value={actionOpportunityId} onChange={(event) => onOpportunityChange(event.target.value)}>
              {opportunities.length === 0 ? <option value="">No opportunities loaded</option> : null}
              {opportunities.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.customer_code}</option>)}
            </select>
          </label>
          <label className="field compact">
            <span>Customer Token</span>
            <select disabled={customerTokens.length === 0} value={actionCustomerToken} onChange={(event) => onCustomerChange(event.target.value)}>
              {customerTokens.length === 0 ? <option value="">No customers loaded</option> : null}
              {customerTokens.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </section>

      <div className="context-badges actions-context">
        <span>Data Source: {labelDataSource(dynamicsStatus?.dataSource)}</span>
        <span>Dynamics Records: {dynamicsStatus?.recordCount ?? 0}</span>
        <span>Last Refresh: {formatTime(dynamicsStatus?.lastRefreshTime)}</span>
        <span>Safe Context: Enabled</span>
      </div>

      <section className="actions-grid">
        <ActionPanel
          actionName="opportunity-brief"
          loading={actionLoading}
          onRun={onRunAction}
          result={actionResults["opportunity-brief"]}
          title="Opportunity 360 AI Brief"
        >
          <Opportunity360Brief result={actionResults["opportunity-brief"]?.result} />
        </ActionPanel>

        <ActionPanel
          actionName="next-best-actions"
          loading={actionLoading}
          onRun={onRunAction}
          result={actionResults["next-best-actions"]}
          title="Next Best Action Board"
        >
          <NextBestActionBoard result={actionResults["next-best-actions"]?.result} />
        </ActionPanel>

        <ActionPanel
          actionName="risk-summary"
          loading={actionLoading}
          onRun={onRunAction}
          result={actionResults["risk-summary"]}
          title="Risk Summary"
        >
          <RiskSummary result={actionResults["risk-summary"]?.result} />
        </ActionPanel>

        <ActionPanel
          actionName="data-doctor"
          loading={actionLoading}
          onRun={onRunAction}
          result={actionResults["data-doctor"]}
          title="CRM Data Doctor"
        >
          <CrmDataDoctor result={actionResults["data-doctor"]?.result} />
        </ActionPanel>

        <ActionPanel
          actionName="meeting-copilot"
          loading={actionLoading}
          onRun={onRunAction}
          result={actionResults["meeting-copilot"]}
          title="Management Meeting Copilot"
        >
          <ManagementMeetingCopilot result={actionResults["meeting-copilot"]?.result} />
        </ActionPanel>

        <ActionPanel
          actionName="customer-growth"
          loading={actionLoading}
          onRun={onRunAction}
          result={actionResults["customer-growth"]}
          title="Customer Growth / Cross-sell Agent"
        >
          <CustomerGrowthAgent result={actionResults["customer-growth"]?.result} />
        </ActionPanel>

        <ActionPanel
          actionName="draft-pack"
          loading={actionLoading}
          onRun={onRunAction}
          result={actionResults["draft-pack"]}
          title="Draft Pack"
        >
          <DraftPack result={actionResults["draft-pack"]?.result} />
        </ActionPanel>
      </section>
    </section>
  );
}

function ActionPanel({
  actionName,
  children,
  loading,
  onRun,
  result,
  title,
}: {
  actionName: AiActionName;
  children: React.ReactNode;
  loading: AiActionName | null;
  onRun: (actionName: AiActionName) => void;
  result?: AiActionResult;
  title: string;
}) {
  return (
    <Panel
      className={result?.blocked ? "action-panel blocked" : "action-panel"}
      title={title}
      action={<button disabled={Boolean(loading)} onClick={() => onRun(actionName)}>{loading === actionName ? "Generating..." : "Generate"}</button>}
    >
      {result?.blocked ? <p className="danger-text">{result.error}</p> : children}
      <div className="action-meta">
        <span>Based on Safe CRM Context</span>
        <span>Provider: Demo</span>
        <span>External Model Called: false</span>
      </div>
    </Panel>
  );
}

function DataSafetyGateway({
  aiResult,
  auditLog,
  onAi,
  onOpportunityChange,
  onResetLog,
  onRoleChange,
  onTransform,
  opportunities,
  providerStatus,
  role,
  selected,
  selectedId,
  transform,
  t,
}: {
  aiResult: AiResult | null;
  auditLog: AuditEntry[];
  onAi: (functionName: string) => void;
  onOpportunityChange: (id: string) => void;
  onResetLog: () => void;
  onRoleChange: (role: Role) => void;
  onTransform: () => void;
  opportunities: Opportunity[];
  providerStatus: AiProviderStatus | null;
  role: Role;
  selected: Opportunity | null;
  selectedId: string;
  transform: TransformResult | null;
  t: TFunction;
}) {
  return (
    <section className="gateway-layout">
      <aside className="column left">
        <Panel title={t("safetyGateway.demoControls")}>
          <label className="field">
            <span>Demo Role Selector</span>
            <select value={role} onChange={(event) => onRoleChange(event.target.value as Role)}>
              {roles.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Opportunity Selector</span>
            <select disabled={opportunities.length === 0} value={selectedId} onChange={(event) => onOpportunityChange(event.target.value)}>
              {opportunities.length === 0 ? <option value="">Loading opportunities...</option> : null}
              {opportunities.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.opportunity_name}</option>)}
            </select>
          </label>
          <button className="primary" disabled={opportunities.length === 0} onClick={onTransform}>Run Gateway Transform</button>
        </Panel>

        <Panel title={t("safetyGateway.rawCrmData")}>
          {selected ? <JsonPanel value={selected as unknown as Record<string, unknown>} sensitive /> : <p className="muted">No opportunities loaded. Check API connection.</p>}
        </Panel>
      </aside>

      <section className="column middle">
        <Panel title={t("safetyGateway.transformTable")}>
          <table className="transform-table">
            <thead><tr><th>Field</th><th>Raw</th><th>Safety</th><th>Safe Output Preview</th></tr></thead>
            <tbody>
              {(transform?.transformRows || []).map((row) => (
                <tr key={row.sourceField}>
                  <td className={sensitiveFields.has(row.sourceField) || ["personal", "confidential", "commercial_sensitive"].includes(row.sensitivity || "") ? "sensitive" : ""}>
                    <strong>{row.label?.["zh-CN"] || row.sourceField}</strong>
                    <span>{row.appName || row.sourceField} · {sourceSystemLabel(row.sourceSystem)}</span>
                    {row.mappingStatus === "pending_real_api_mapping" ? <span>Pending real CRM API mapping / 待确认真实 CRM API 字段名</span> : null}
                  </td>
                  <td>
                    <strong>{row.sourcePreview || "Not provided / 未填写"}</strong>
                    <span>{row.sourcePresent ? (row.sourceMasked ? "masked" : "visible preview") : "not provided"}</span>
                  </td>
                  <td>
                    <strong>{row.sensitivity || "business"}</strong>
                    <span>{row.safeTransform || row.method} · Safe Context: {row.includeInSafeContext ? "yes" : "no"}</span>
                  </td>
                  <td><strong>{row.targetField}</strong><span>{row.safeOutputPreview || valueOrEmpty(row.outputValue)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title={t("safetyGateway.safePayload")}>
          <JsonPanel value={transform?.safePayload || {}} />
        </Panel>

        <Panel title={t("safetyGateway.safetyChecklist")}>
          <div className="checklist">
            {(transform?.checklist || []).map((item) => (
              <div className={item.pass ? "pass" : "fail"} key={item.label}>
                <span>{item.pass ? "✓" : "!"}</span>{item.label}
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <aside className="column right">
        <Panel title="AI Provider Status">
          <div className="provider-status">
            <DetailField label="AI Provider" value={providerStatus?.provider || "demo"} />
            <DetailField label="External AI" value={providerStatus?.externalAiEnabled ? "enabled" : "disabled"} />
            <DetailField label="Safe Context only" value={String(providerStatus?.safeContextOnly ?? true)} />
            <DetailField label="Raw CRM data not sent" value={String(providerStatus?.rawDataSent === false)} />
          </div>
        </Panel>

        <Panel title={t("safetyGateway.aiButtons")}>
          <div className="ai-buttons">
            {aiFunctions.map(([key, label]) => (
              <button disabled={!transform || transform.blocked} key={key} onClick={() => onAi(key)}>{label}</button>
            ))}
          </div>
        </Panel>

        <Panel title={t("safetyGateway.aiOutput")}>
          {aiResult ? (
            <article className={aiResult.blocked ? "ai-output blocked" : "ai-output"}>
              <strong>{aiResult.title || "Safety Error"}</strong>
              <p>{aiResult.output || aiResult.error}</p>
              {aiResult.provider ? <small>Provider: {aiResult.provider} · External model called: {String(aiResult.external_model_called)}</small> : null}
              {aiResult.usedPayloadKeys ? <small>Used payload keys: {aiResult.usedPayloadKeys.join(", ")}</small> : null}
            </article>
          ) : <p className="muted">Choose an AI function after the Safe AI Payload passes the checklist.</p>}
        </Panel>

        <Panel title={t("safetyGateway.auditLog")} action={<button onClick={onResetLog}>Reset</button>}>
          <div className="audit-list">
            {auditLog.length === 0 ? <p className="muted">No audit events yet.</p> : null}
            {auditLog.map((entry) => (
              <article key={entry.id}>
                <strong>{entry.type === "transform" ? "Gateway Transform" : `AI ${entry.functionName}`}</strong>
                <span>{entry.timestamp}</span>
                <p>{entry.role} · {entry.opportunity_id} · {entry.status || entry.checklist_result}</p>
                {entry.type === "ai_call" ? <small>Provider: {entry.provider || "demo"} · External model called: {String(Boolean(entry.external_model_called))}</small> : null}
                {role === "CRM Admin" && entry.removed_fields ? <small>Removed: {entry.removed_fields.join(", ")}</small> : null}
                {entry.blocked_reason ? <small className="danger-text">{entry.blocked_reason}</small> : null}
              </article>
            ))}
          </div>
        </Panel>
      </aside>
    </section>
  );
}

function valueOrEmpty(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not provided / 未填写";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Not provided / 未填写";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function sourceSystemLabel(sourceSystem?: string) {
  if (sourceSystem === "sales_trial_d365") return "Sales Trial API Field";
  if (sourceSystem === "ai_gateway") return "AI Gateway Derived Field";
  return "Company CRM Target Field";
}

function FilterSelect({ allLabel = "All", label, onChange, options, value }: { allLabel?: string; label: string; onChange: (value: string) => void; options: string[]; value: string }) {
  return (
    <label className="field compact">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  );
}

function StatusStrip({
  dynamicsMessage,
  dynamicsStatus,
  onRefreshDynamics,
  onTestDynamics,
  providerStatus,
  t,
}: {
  dynamicsMessage: string;
  dynamicsStatus: DynamicsStatus | null;
  onRefreshDynamics: () => void;
  onTestDynamics: () => void;
  providerStatus: AiProviderStatus | null;
  t: TFunction;
}) {
  return (
    <section className="status-strip">
      <div className="status-metrics">
        <StatusMetric label={t("common.dataSource")} value={labelDataSource(dynamicsStatus?.dataSource)} />
        <StatusMetric label="Configured" value={dynamicsStatus?.isConfigured ? "Yes" : "No"} />
        <StatusMetric label="Demo Synced Opportunities" value={String(dynamicsStatus?.syncedDemoCount ?? dynamicsStatus?.recordCount ?? 0)} />
        <StatusMetric label="Non-demo Excluded" value={String(dynamicsStatus?.excludedNonDemoCount ?? 0)} />
        <StatusMetric label="Local Total After Sync" value={String(dynamicsStatus?.localTotalAfterSync ?? dynamicsStatus?.recordCount ?? 0)} />
        <StatusMetric label={t("common.lastRefreshTime")} value={formatTime(dynamicsStatus?.lastRefreshTime)} />
        <StatusMetric label="AI Provider" value={providerStatus?.provider || "demo"} />
        <StatusMetric label="External AI" value={providerStatus?.externalAiEnabled ? "enabled" : "disabled"} />
      </div>
      <div className="status-controls">
        <span className={dynamicsStatus?.lastError ? "source-error" : "source-ok"}>{dynamicsStatus?.lastSyncStatus || "idle"}</span>
        <button onClick={onTestDynamics} disabled={!dynamicsStatus?.isConfigured}>{t("common.testConnection")}</button>
        <button onClick={onRefreshDynamics} disabled={!dynamicsStatus?.canRefresh}>{t("common.refreshFromDynamics")}</button>
      </div>
      {dynamicsMessage || dynamicsStatus?.lastError ? <p className={dynamicsStatus?.lastError ? "source-error-text" : "source-message"}>{dynamicsMessage || dynamicsStatus?.lastError}</p> : null}
    </section>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function LanguageSwitcher({ language, onChange, t }: { language: Language; onChange: (language: Language) => void; t: TFunction }) {
  return (
    <label className="language-switcher">
      <span>{t("language.label")}</span>
      <select value={language} onChange={(event) => onChange(event.target.value as Language)}>
        {languages.map((item) => <option key={item.value} value={item.value}>{t(item.labelKey)}</option>)}
      </select>
    </label>
  );
}

function FilterBar({
  dashboard,
  filters,
  onClearFilters,
  onUpdateFilter,
  t,
}: {
  dashboard: ManagementDashboard;
  filters: DashboardFilters;
  onClearFilters: () => void;
  onUpdateFilter: (key: keyof DashboardFilters, value: string) => void;
  t: TFunction;
}) {
  const filteredCount = dashboard.filteredCount ?? Number(dashboard.summaryPayload.record_count || 0);
  const totalDemoCount = dashboard.totalDemoCount ?? Number(dashboard.summaryPayload.record_count || 0);
  return (
    <Panel
      title={t("filters.title")}
      className="filters-panel opportunity-filters"
      action={<button onClick={onClearFilters}>{t("common.clear")}</button>}
    >
      <div className="filter-status-row">
        <span className="scope-badge">{dashboard.filters.scopeLabel || "[AI-DEMO] only"}</span>
        <strong>{t("filters.filteredOpportunities")}: {filteredCount} / {totalDemoCount}</strong>
      </div>
      <div className="filters-grid primary-filters">
        <FilterSelect allLabel={t("common.clearFilters")} label={t("filters.stage")} value={filters.opportunityStage || ""} options={dashboard.filters.stages} onChange={(value) => onUpdateFilter("opportunityStage", value)} />
        <FilterSelect allLabel={t("common.clearFilters")} label={t("filters.riskLevel")} value={filters.riskLevel || ""} options={dashboard.filters.riskLevels} onChange={(value) => onUpdateFilter("riskLevel", value)} />
        <FilterSelect allLabel={t("common.clearFilters")} label={t("filters.priority")} value={filters.priority || ""} options={dashboard.filters.priorities || []} onChange={(value) => onUpdateFilter("priority", value)} />
        <FilterSelect allLabel={t("common.clearFilters")} label={t("filters.salesDepartment")} value={filters.salesDepartment || ""} options={dashboard.filters.salesDepartments || []} onChange={(value) => onUpdateFilter("salesDepartment", value)} />
        <FilterSelect allLabel={t("common.clearFilters")} label={t("filters.bookingDepartment")} value={filters.bookingDepartment || ""} options={dashboard.filters.bookingDepartments || []} onChange={(value) => onUpdateFilter("bookingDepartment", value)} />
        <FilterSelect allLabel={t("common.clearFilters")} label={t("filters.customerNeed")} value={filters.customerNeed || ""} options={dashboard.filters.customerNeeds || []} onChange={(value) => onUpdateFilter("customerNeed", value)} />
        <FilterSelect allLabel={t("common.clearFilters")} label={t("filters.proposalContent")} value={filters.proposalContent || ""} options={dashboard.filters.proposalContents || []} onChange={(value) => onUpdateFilter("proposalContent", value)} />
        <FilterSelect allLabel={t("common.clearFilters")} label={t("filters.winProbability")} value={filters.winProbability || ""} options={dashboard.filters.winProbabilities || []} onChange={(value) => onUpdateFilter("winProbability", value)} />
      </div>
      <div className="filters-grid secondary-filters">
        <FilterSelect allLabel={t("common.clearFilters")} label={t("filters.opportunityType")} value={filters.opportunityType || ""} options={dashboard.filters.opportunityTypes || []} onChange={(value) => onUpdateFilter("opportunityType", value)} />
        <FilterSelect allLabel={t("common.clearFilters")} label={t("filters.transportMode")} value={filters.transportMode || ""} options={dashboard.filters.transportModes} onChange={(value) => onUpdateFilter("transportMode", value)} />
        <FilterSelect allLabel={t("common.clearFilters")} label={t("filters.spotContinuous")} value={filters.spotContinuous || ""} options={dashboard.filters.spotContinuousOptions || []} onChange={(value) => onUpdateFilter("spotContinuous", value)} />
        <FilterSelect allLabel={t("common.clearFilters")} label={t("filters.amountBand")} value={filters.amountBand || ""} options={dashboard.filters.amountBands || []} onChange={(value) => onUpdateFilter("amountBand", value)} />
        <FilterSelect allLabel={t("common.clearFilters")} label={t("filters.expectedOrderStatus")} value={filters.expectedOrderStatus || ""} options={dashboard.filters.expectedOrderStatuses || []} onChange={(value) => onUpdateFilter("expectedOrderStatus", value)} />
        <FilterSelect allLabel={t("common.clearFilters")} label={t("filters.ownerToken")} value={filters.ownerToken || ""} options={dashboard.filters.ownerTokens || []} onChange={(value) => onUpdateFilter("ownerToken", value)} />
        <FilterSelect allLabel={t("common.clearFilters")} label={t("filters.organizationGroup")} value={filters.organizationGroup || ""} options={dashboard.filters.organizationGroups || []} onChange={(value) => onUpdateFilter("organizationGroup", value)} />
      </div>
    </Panel>
  );
}

function KpiHeroCard({ item, tone }: { item: { label: string; value: string; meta: string; description: string }; tone: string }) {
  return (
    <article className={`kpi-card kpi-${tone}`} title={item.description}>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      <p>{item.meta}</p>
      <small>{kpiRiskLabel(item.label, item.value)}</small>
    </article>
  );
}

function RiskHeatmap({ data }: { data: Array<{ stage: string; risk_level: string; count: number }> }) {
  const stages = ["L1 Initial Contact", "L2 Need Confirmed", "L3 Proposal", "L4 Quotation", "L5 Won"];
  const risks = ["Low", "Medium", "High", "Critical"];
  const maxCount = Math.max(1, ...data.map((item) => item.count || 0));
  if (data.length === 0) return <EmptyState label="No risk heatmap data available." />;
  return (
    <div className="heatmap">
      <div className="heatmap-grid">
        <span />
        {stages.map((stage) => <strong key={stage}>{stage.replace(" ", "\n")}</strong>)}
        {risks.map((risk) => (
          <div className="heatmap-row" key={risk}>
            <strong>{risk}</strong>
            {stages.map((stage) => {
              const count = data.find((item) => item.stage === stage && item.risk_level === risk)?.count || 0;
              return <span className={`heat-cell heat-${risk.toLowerCase()}`} key={`${stage}-${risk}`} style={{ opacity: 0.25 + (count / maxCount) * 0.75 }}>{count}</span>;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="empty-state">{label}</div>;
}

function RiskBadge({ value }: { value: string }) {
  return <span className={`risk risk-${value.toLowerCase()}`}>{value}</span>;
}

function kpiTone(label: string, index: number) {
  if (label.includes("Risk") || label.includes("Overdue")) return "danger";
  if (label.includes("Forecast") || label.includes("Quality")) return "blue";
  return ["green", "blue", "amber", "purple"][index % 4];
}

function kpiRiskLabel(label: string, value: string) {
  if (label.includes("High Risk") || label.includes("Overdue")) return "Management attention";
  if (label.includes("Data Quality")) return "Gateway readiness";
  if (label.includes("Forecast")) return "Forecast control";
  return value === "0" ? "No data in scope" : "Healthy operating signal";
}

function labelDataSource(value?: string) {
  if (value === "dynamics") return "Dynamics 365";
  if (value === "hybrid") return "Hybrid";
  return "Mock";
}

function formatTime(value?: string) {
  if (!value) return "Not refreshed";
  return new Date(value).toLocaleString();
}

function Panel({ action, children, className = "", title }: { action?: React.ReactNode; children: React.ReactNode; className?: string; title: string }) {
  return (
    <section className={`panel ${className}`}>
      <header><h2>{title}</h2>{action}</header>
      {children}
    </section>
  );
}

function JsonPanel({ sensitive = false, value }: { sensitive?: boolean; value: Record<string, unknown> }) {
  return (
    <div className="json-panel">
      {Object.entries(value).map(([key, val]) => (
        <div className={sensitive && sensitiveFields.has(key) ? "json-row sensitive" : "json-row"} key={key}>
          <span>{key}</span>
          <code>{JSON.stringify(val)}</code>
        </div>
      ))}
    </div>
  );
}
