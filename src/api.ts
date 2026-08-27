import type { AiActionName, AiActionResult, AiDemoChatResult, AiProviderStatus, AiResult, AuditEntry, DashboardFilters, DynamicsStatus, ManagementDashboard, Opportunity, Role, TransformResult } from "./types";
import { DEFAULT_LANGUAGE } from "./config/language";
import type { AmountDisplayMode, CrmRuntimeStatus, DecisionDataSource, DecisionMode, DecisionOpportunityDetail, DecisionScenarioCatalog, DecisionView, PilotDepartmentId, PilotRuntimeStatus } from "./decision/types";
import type { ComparisonPage, ComparisonResult, ComparisonStatus } from "./decision/comparisonTypes";
import type { AnalysisContextMode, DeepAnalysisCatalog, DeepAnalysisPreview, DeepAnalysisResult, ResponseLocale } from "./deepAnalysis/types";
import type { NarrativeRuntimeStatus, NarrativeSnapshot } from "./narrative";

async function json<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options?.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body;
}

export function getOpportunities() {
  return json<{ data: Opportunity[] }>("/api/opportunities");
}

export function getManagementDashboard(filters: DashboardFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return json<{ data: ManagementDashboard }>(`/api/management-dashboard${query ? `?${query}` : ""}`);
}

export function getDynamicsStatus() {
  return json<{ data: DynamicsStatus }>("/api/dynamics/status");
}

export function getAiProviderStatus() {
  return json<{ data: AiProviderStatus }>("/api/ai/provider-status");
}

export function testDynamicsConnection() {
  return json<{ ok: boolean; data?: unknown; status?: DynamicsStatus }>("/api/dynamics/test-connection", { method: "POST" });
}

export function syncDynamics() {
  return json<{ ok: boolean; data?: { count: number; syncedDemoCount?: number; excludedNonDemoCount?: number; localTotalAfterSync?: number; scope?: string; lastRefreshTime: string; lastSyncStatus: string }; status?: DynamicsStatus }>("/api/dynamics/sync", { method: "POST" });
}

export function transformOpportunity(role: Role, opportunityId: string) {
  return json<TransformResult>("/api/gateway/transform", {
    method: "POST",
    body: JSON.stringify({ role, opportunity_id: opportunityId }),
  });
}

export function runAi(functionName: string, role: Role, opportunityId: string, safePayload: Record<string, unknown>, language = DEFAULT_LANGUAGE) {
  return json<AiResult>(`/api/ai/${functionName}`, {
    method: "POST",
    body: JSON.stringify({ role, opportunity_id: opportunityId, safePayload, language: language || DEFAULT_LANGUAGE }),
  });
}

export function chatWithAiDemo(question: string, filters: DashboardFilters, role = "management") {
  return json<AiDemoChatResult>("/api/ai-demo/chat", {
    method: "POST",
    body: JSON.stringify({ question, filters, role, language: DEFAULT_LANGUAGE }),
  });
}

export function runAiAction(actionName: AiActionName, body: Record<string, unknown>) {
  return json<AiActionResult>(`/api/ai-actions/${actionName}`, {
    method: "POST",
    body: JSON.stringify({ ...body, language: DEFAULT_LANGUAGE }),
  });
}

export function getSafeOpportunityContext(opportunityId: string) {
  return json<{ data: Record<string, unknown>; context_summary: unknown; safe_payload_keys: string[] }>(`/api/ai-context/opportunity/${opportunityId}`);
}

export function getAuditLog() {
  return json<{ data: AuditEntry[] }>("/api/audit-log");
}

export function resetAuditLog() {
  return json<{ ok: boolean }>("/api/audit-log/reset", { method: "POST" });
}

export function getDecisionScenarios() {
  return json<{ data: DecisionScenarioCatalog }>("/api/decision-scenarios");
}

export function getDecisionView(mode: DecisionMode, scenarioId = "", opportunityToken = "", signal?: AbortSignal) {
  const params = new URLSearchParams({ mode });
  if (scenarioId) params.set("scenarioId", scenarioId);
  if (opportunityToken) params.set("opportunityToken", opportunityToken);
  return json<{ data: DecisionView }>(`/api/decision-view?${params.toString()}`, { signal });
}

export function getDecisionOpportunity(opportunityToken: string, mode: DecisionMode, scenarioId = "", signal?: AbortSignal) {
  const params = new URLSearchParams({ mode });
  if (scenarioId) params.set("scenarioId", scenarioId);
  return json<{ data: DecisionOpportunityDetail }>(`/api/decision-opportunities/${encodeURIComponent(opportunityToken)}?${params.toString()}`, { signal });
}

export function getPilotRuntimeStatus(signal?: AbortSignal) {
  return json<{ data: PilotRuntimeStatus }>("/api/pilot/runtime-status", { signal });
}

export function getPilotPortfolio(department: PilotDepartmentId, opportunityToken = "", amountMode: AmountDisplayMode = "range", signal?: AbortSignal) {
  const params = new URLSearchParams({ department, amountMode });
  if (opportunityToken) params.set("opportunityToken", opportunityToken);
  return json<{ data: DecisionView }>(`/api/pilot/portfolio?${params.toString()}`, { signal });
}

export function getPilotOpportunity(opportunityToken: string, department: PilotDepartmentId, amountMode: AmountDisplayMode = "range", signal?: AbortSignal) {
  const params = new URLSearchParams({ department, amountMode });
  return json<{ data: DecisionOpportunityDetail }>(`/api/pilot/opportunities/${encodeURIComponent(opportunityToken)}?${params.toString()}`, { signal });
}

export function getPilotSafeContext(opportunityToken: string, department: PilotDepartmentId, signal?: AbortSignal) {
  const params = new URLSearchParams({ department });
  return json<{ data: { opportunityToken: string; safeContext: DecisionView["safeContext"]; safety: Record<string, boolean> } }>(`/api/pilot/safe-context/${encodeURIComponent(opportunityToken)}?${params.toString()}`, { signal });
}

export function getPilotDecisionPack(opportunityToken: string, department: PilotDepartmentId, signal?: AbortSignal) {
  const params = new URLSearchParams({ department });
  return json<{ data: { opportunityToken: string; pack: DecisionView["pack"]; provider: "demo"; externalModelCalled: false; crmWritebackEnabled: false } }>(`/api/pilot/decision-pack/${encodeURIComponent(opportunityToken)}?${params.toString()}`, { signal });
}

export function getFrozenRuntimeStatus(signal?: AbortSignal, retry = false) {
  return json<{ data: PilotRuntimeStatus }>(`/api/d365-frozen/runtime-status${retry ? "?retry=true" : ""}`, { signal });
}

export function getCrmRuntimeStatus(signal?: AbortSignal) {
  return json<{ data: CrmRuntimeStatus }>("/api/runtime/crm-status", { signal });
}

export function getFrozenPortfolio(department: PilotDepartmentId, opportunityToken = "", amountMode: AmountDisplayMode = "range", signal?: AbortSignal) {
  const params = new URLSearchParams({ department, amountMode });
  if (opportunityToken) params.set("opportunityToken", opportunityToken);
  return json<{ data: DecisionView }>(`/api/d365-frozen/portfolio?${params.toString()}`, { signal });
}

export function getFrozenOpportunity(opportunityToken: string, department: PilotDepartmentId, amountMode: AmountDisplayMode = "range", signal?: AbortSignal) {
  const params = new URLSearchParams({ department, amountMode });
  return json<{ data: DecisionOpportunityDetail }>(`/api/d365-frozen/opportunities/${encodeURIComponent(opportunityToken)}?${params.toString()}`, { signal });
}

export function getDecisionComparisonStatus() {
  return json<{ data: ComparisonStatus }>("/api/decision-comparison/status");
}

export function runDecisionComparison(input: { scenarioId: string; opportunityToken: string; page: ComparisonPage }, signal?: AbortSignal) {
  return json<{ data: ComparisonResult }>("/api/decision-comparison/run", { method: "POST", signal, body: JSON.stringify({ ...input, confirmed: true }) });
}

export function resetDecisionComparison() {
  return json<{ ok: true }>("/api/decision-comparison/reset", { method: "POST" });
}

export function getDeepAnalysisTemplates() { return json<{ data: DeepAnalysisCatalog }>("/api/deep-analysis/templates"); }
export function previewDeepAnalysis(input: { templateCode: string; mode: DecisionMode; scenarioId: string; opportunityToken: string; role: string; responseLocale?: ResponseLocale; analysisContextMode?: AnalysisContextMode; dataSource?: DecisionDataSource; department?: PilotDepartmentId }) { return json<{ data: DeepAnalysisPreview }>("/api/deep-analysis/preview", { method: "POST", body: JSON.stringify(input) }); }
export function runDeepAnalysis(input: { requestId: string; templateCode: string; mode: DecisionMode; scenarioId: string; opportunityToken: string; role: string; confirmed: true; highFidelityConfirmed?: true; responseLocale?: ResponseLocale; analysisContextMode?: AnalysisContextMode; dataSource?: DecisionDataSource; department?: PilotDepartmentId }) { return json<{ data: DeepAnalysisResult }>("/api/deep-analysis/run", { method: "POST", body: JSON.stringify(input) }); }
export function cancelDeepAnalysis(requestId: string) { return json<{ ok: boolean }>(`/api/deep-analysis/${encodeURIComponent(requestId)}/cancel`, { method: "POST" }); }
export function resetDeepAnalysis() { return json<{ ok: boolean }>("/api/deep-analysis/results", { method: "DELETE" }); }
export function getNarrativeSnapshots(signal?: AbortSignal) { return json<{ data: NarrativeSnapshot[] }>("/api/llm-narrative/snapshots", { signal }); }
export function getNarrativeStatus(signal?: AbortSignal) { return json<{ data: NarrativeRuntimeStatus }>("/api/llm-narrative/status", { signal }); }
export function runLiveNarrative(opportunityToken: string) { return json<{ data: { ok: boolean; snapshot?: NarrativeSnapshot; reason?: string } }>("/api/llm-narrative/live", { method: "POST", body: JSON.stringify({ opportunityToken, confirmed: true }) }); }
