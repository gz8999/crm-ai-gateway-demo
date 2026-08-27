import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AiProviderStatus, AuditEntry } from "../types";
import { PRODUCT_FEATURES } from "../config/features";
import { getDecisionView, resetDecisionComparison, runDecisionComparison } from "../api";
import { DecisionPageHeader, ProductStatusPanel, UnifiedDecisionCard } from "./DecisionUi";
import { decisionText, departmentLabel, fallbackReasonLabel, maskOpportunityToken, scenarioTitle } from "./display";
import { externalAnalysisStatusLabel } from "./externalModelUi";
import { auditCounts, safeAuditRows, sha256Fingerprint } from "./productModel";
import type { ComparisonPage, ComparisonResult } from "./comparisonTypes";
import type { AmountDisplayMode, DecisionDataSource, DecisionScenarioCatalog, DecisionView, PilotDepartmentId, PilotRuntimeStatus } from "./types";
import type { NarrativeSnapshot } from "../narrative";
import { useI18n } from "../i18n";

// Audit allowlist labels: 模型与模型提供方、模型提供方、是否调用外部模型、输出结构校验、安全校验、引用校验、回退原因、请求 ID、客户端上下文指纹、仅展示聚合数量，不展示 Safe Context Payload 或字段值、外部模型对比尚未启用，完成安全授权和 Provider 配置后开放、使用相同脱敏 CRM Context，比较不同模型输出一致性。

export function AuditSafetyPage({ amountDisplayMode, auditLog, catalog, dataSource, department, narrativeSnapshots = [], pilotRuntimeStatus, providerStatus, view }: { amountDisplayMode: AmountDisplayMode; auditLog: AuditEntry[]; catalog: DecisionScenarioCatalog | null; dataSource: DecisionDataSource; department: PilotDepartmentId; narrativeSnapshots?: NarrativeSnapshot[]; pilotRuntimeStatus: PilotRuntimeStatus | null; providerStatus: AiProviderStatus | null; view: DecisionView | null }) {
  const { language, t } = useI18n();
  const [fingerprint, setFingerprint] = useState(t("workspace.justNowRead"));
  const rows = useMemo(() => safeAuditRows(auditLog), [auditLog]);
  const counts = useMemo(() => auditCounts(auditLog), [auditLog]);

  useEffect(() => {
    let active = true;
    if (!view) { setFingerprint(t("workspace.noRecord")); return; }
    sha256Fingerprint(view.safeContext).then((value) => { if (active) setFingerprint(value); }).catch(() => { if (active) setFingerprint(t("workspace.noRecord")); });
    return () => { active = false; };
  }, [t, view]);

  return <section className="audit-safety-page" data-page="gateway">
    <DecisionPageHeader title={t("nav.audit")} description={t("deepAnalysis.description")} />
    <div className="audit-status-grid">
      <AuditSection title={t("audit.accessScope")}><dl><dt>{t("workspace.dataSource")}</dt><dd>{view?.runtime?.sourceLabel || (dataSource === "d365-pilot" ? "D365 Frozen Dataset" : "Local Fixture")}</dd><dt>{t("audit.role")}</dt><dd>{t("workspace.demoFullAccess")}</dd><dt>{t("workspace.currentDepartment")}</dt><dd>{departmentLabel(view?.runtime?.department.id || department, language)}</dd><dt>{t("audit.authorizedRecords")}</dt><dd>{view?.runtime?.recordCount ?? view?.scopeSummary.scopeCount ?? 0}</dd><dt>{t("audit.lastSync")}</dt><dd>{view?.runtime?.lastSyncTime ? formatTime(view.runtime.lastSyncTime, language) : t("workspace.localScope")}</dd><dt>Fallback</dt><dd>{view?.runtime?.fallbackStatus === "disabled" ? t("workspace.disabled") : t("workspace.noFallback")}</dd><dt>{t("workspace.currentOpportunity")}</dt><dd>{view ? maskOpportunityToken(view.selectedOpportunity) : t("workspace.noRecord")}</dd><dt>{t("workspace.amountDisplay")}</dt><dd>{amountDisplayMode === "range" ? t("workspace.amountRange") : t("workspace.exactAmountUi")}</dd><dt>{t("audit.customerIdentity")}</dt><dd>{t("deepAnalysis.masked")}</dd></dl></AuditSection>
      <AuditSection title={t("audit.securityStatus")}><dl><dt>Safe Context</dt><dd className="safe">{t("deepAnalysis.enabled")}</dd><dt>{t("audit.rawCrm")}</dt><dd className="safe">{t("deepAnalysis.no")}</dd><dt>{t("audit.exactAmountToModel")}</dt><dd className="safe">{t("deepAnalysis.no")}</dd><dt>{t("audit.timelineToModel")}</dt><dd className="safe">{t("deepAnalysis.no")}</dd><dt>{t("audit.identityToModel")}</dt><dd className="safe">{t("deepAnalysis.no")}</dd><dt>{t("audit.crmWriteback")}</dt><dd className="safe">{t("workspace.disabled")}</dd></dl></AuditSection>
      <AuditSection title={t("audit.runtimeChecks")}><dl><dt>Pilot Token Allowlist</dt><dd>{pilotRuntimeStatus?.security.pilotTokenAllowlist ? t("deepAnalysis.pass") : dataSource === "local-fixture" ? t("deepAnalysis.noContent") : t("workspace.noRecord")}</dd><dt>GET-only</dt><dd>{pilotRuntimeStatus?.security.getOnly ? t("deepAnalysis.pass") : dataSource === "local-fixture" ? t("deepAnalysis.noContent") : t("workspace.noRecord")}</dd><dt>{t("workspace.externalAvailability")}</dt><dd>{externalAnalysisStatusLabel(providerStatus)}</dd><dt>{t("workspace.externalCall")}</dt><dd>{t("deepAnalysis.no")}</dd><dt>{t("workspace.fallbackReason")}</dt><dd>{fallbackReasonLabel(providerStatus?.fallbackReason || "", language)}</dd><dt>{t("workspace.outputValidation")}</dt><dd>{localizedAuditValue(rows[0]?.schemaStatus, language, t("deepAnalysis.sourceMissing"))}</dd><dt>{t("workspace.safetyValidation")}</dt><dd>{localizedAuditValue(rows[0]?.safetyStatus, language, t("deepAnalysis.sourceMissing"))}</dd><dt>{t("workspace.citationValidation")}</dt><dd>{localizedAuditValue(rows[0]?.citationStatus, language, t("deepAnalysis.sourceMissing"))}</dd></dl></AuditSection>
    </div>

    <ProviderConfigurationStatus latestSafetyStatus={rows[0]?.safetyStatus} status={providerStatus} />

    <section className="validated-narrative-status product-panel"><header><div><h3>{t("audit.validatedNarrative")}</h3><p>{t("audit.validatedNarrativeDescription")}</p></div><span>{narrativeSnapshots.length ? t("deepAnalysis.snapshot") : t("deepAnalysis.notRun")}</span></header><dl><dt>{t("deepAnalysis.snapshot")}</dt><dd>{narrativeSnapshots.length}</dd><dt>Contract</dt><dd>{narrativeSnapshots[0]?.contractVersion || t("deepAnalysis.notRun")}</dd><dt>Live Demo</dt><dd>{t("deepAnalysis.afterConfirm")}</dd><dt>CRM Writeback</dt><dd>false</dd></dl></section>

    <section className="audit-transform-summary product-panel"><header><div><h3>{t("audit.transformSummary")}</h3><p>{t("audit.transformDescription")}</p></div></header><div><AuditCount label="Safe Context" value={view?.safeContextKeys.length ?? counts.safeFields} emptyLabel={t("workspace.noRecord")} /><AuditCount label="Redacted / removed" value={counts.removedFields} emptyLabel={t("workspace.noRecord")} /><AuditCount label="Transformed" value={counts.transformedFields} emptyLabel={t("workspace.noRecord")} /><AuditCount label="Amount bands" value={counts.amountBands} emptyLabel={t("workspace.noRecord")} /></div><section className="client-fingerprint"><span>{local(language, "客户端上下文指纹（非服务端审计凭证）", "クライアントコンテキスト指紋（サーバー監査証跡ではありません）", "Client context fingerprint (not a server audit credential)")}</span><code>{fingerprint}</code><p>{local(language, "基于当前 Safe Context 的 canonical JSON 在浏览器内计算；不会替代历史服务端审计 Hash。", "現在のSafe Contextのcanonical JSONからブラウザ内で計算され、過去のサーバー監査Hashを置き換えません。", "Calculated in the browser from canonical JSON for the current Safe Context; it does not replace the historical server audit hash.")}</p></section></section>

    <section className="safe-audit-log product-panel"><header><div><h3>{t("audit.auditLog")}</h3><p>{t("audit.auditLogDescription")}</p></div><span>{rows.length}</span></header>{rows.length ? <div className="safe-audit-table" role="table" aria-label={t("audit.auditLog")}><div className="safe-audit-head" role="row"><span>Time</span><span>Request ID</span><span>Page</span><span>Provider</span><span>External model</span><span>Latency</span><span>Schema</span><span>Safety</span><span>Citation</span><span>Fallback</span><span>Audit Hash</span></div>{rows.map((row) => <article role="row" key={row.id}><span data-label="Time">{formatTime(row.time, language)}</span><span data-label="Request ID">{localizedAuditValue(row.requestId, language)}</span><span data-label="Page">{localizedAuditValue(row.page, language)}</span><span data-label="Provider">{row.provider}</span><span data-label="External model">{localizedAuditValue(row.externalCalled, language)}</span><span data-label="Latency">{localizedAuditValue(row.latency, language)}</span><span data-label="Schema">{localizedAuditValue(row.schemaStatus, language)}</span><span data-label="Safety">{localizedAuditValue(row.safetyStatus, language)}</span><span data-label="Citation">{localizedAuditValue(row.citationStatus, language)}</span><span data-label="Fallback">{fallbackReasonLabel(row.fallback, language)}</span><span data-label="Audit Hash">{local(language, "当前审计源未提供", "現在の監査ソースでは未提供", "Not provided by the current audit source")}</span></article>)}</div> : <div className="formal-empty-state"><div className="empty-skeleton" /><h3>{t("audit.noMetadata")}</h3><p>{t("audit.noMetadataBody")}</p></div>}</section>

    <ModelComparison catalog={catalog} dataSource={dataSource} fingerprint={fingerprint} providerStatus={providerStatus} view={view} />
  </section>;
}

const COMPARISON_PAGE_OPTIONS: Array<{ value: ComparisonPage; label: string }> = [
  { value: "cockpit", label: "AI 驾驶舱" }, { value: "risk", label: "风险与优先级" },
  { value: "opportunity360", label: "商机 360" }, { value: "action", label: "行动看板" },
  { value: "meeting", label: "会议副驾" }, { value: "portfolio", label: "组合洞察" },
];

function ModelComparison({ catalog, dataSource, fingerprint, providerStatus, view }: { catalog: DecisionScenarioCatalog | null; dataSource: DecisionDataSource; fingerprint: string; providerStatus: AiProviderStatus | null; view: DecisionView | null }) {
  const { language, t } = useI18n();
  const available = dataSource === "local-fixture" && PRODUCT_FEATURES.modelComparison && providerStatus?.comparisonAvailable === true;
  const initialScenario = view?.scenario?.id || "multi-risk-priority";
  const [scenarioId, setScenarioId] = useState(initialScenario);
  const [scopeView, setScopeView] = useState<DecisionView | null>(view?.mode === "scenario" ? view : null);
  const [opportunityToken, setOpportunityToken] = useState(view?.selectedOpportunity || "");
  const [page, setPage] = useState<ComparisonPage>("risk");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!available) return;
    let active = true;
    getDecisionView("scenario", scenarioId).then((response) => {
      if (!active) return;
      setScopeView(response.data);
      setOpportunityToken(response.data.defaultOpportunity);
      setResult(null);
    }).catch(() => { if (active) setMessage(local(language, "场景范围暂不可用。", "シナリオ範囲は現在利用できません。", "The scenario scope is currently unavailable.")); });
    return () => { active = false; };
  }, [available, language, scenarioId]);

  async function startComparison() {
    if (!available || !opportunityToken) return;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setState("loading"); setMessage(""); setResult(null);
    try {
      const response = await runDecisionComparison({ scenarioId, opportunityToken, page }, next.signal);
      setResult(response.data);
      setState("idle");
    } catch (error) {
      if (next.signal.aborted) { setMessage(local(language, "已取消本次安全对比。", "安全な比較をキャンセルしました。", "The safe comparison was cancelled.")); setState("idle"); return; }
      setMessage(error instanceof Error ? error.message : local(language, "安全对比暂不可用。", "安全な比較は現在利用できません。", "The safe comparison is currently unavailable."));
      setState("error");
    }
  }

  async function resetComparison() {
    controller.current?.abort();
    setResult(null); setMessage(""); setState("idle");
    if (available) await resetDecisionComparison().catch(() => undefined);
  }

  return <section className="model-comparison-placeholder product-panel"><header><div><h3>{t("audit.modelComparison")}</h3><p>{t("audit.modelComparisonDescription")}</p></div><span>{available ? t("deepAnalysis.enabled") : t("deepAnalysis.waitingConfirm")}</span></header>
    <section className="comparison-enterprise-explanation" aria-label={local(language, "安全模型对比边界", "安全なモデル比較の境界", "Safe model comparison boundary")}><strong>{local(language, "企业 AI 治理边界", "企業AIガバナンス境界", "Enterprise AI governance boundary")}</strong><ul><li>{local(language, "不会修改 CRM", "CRMを変更しません", "CRM is not modified")}</li><li>{local(language, "不会发送原始客户数据", "元の顧客データを送信しません", "Raw customer data is not sent")}</li><li>{local(language, "不会自动替代业务判断", "業務判断を自動的に置き換えません", "Business judgment is not automatically replaced")}</li></ul></section>
    <section className="comparison-basis" aria-label={local(language, "比较依据", "比較根拠", "Comparison basis")}><h3>{local(language, "比较依据", "比較根拠", "Comparison basis")}</h3><dl><dt>Safe Context Hash</dt><dd><code>{fingerprint}</code></dd><dt>{local(language, "输入范围", "入力範囲", "Input scope")}</dt><dd>{local(language, `${view?.scopeSummary.scopeCount ?? 0} 条脱敏商机`, `${view?.scopeSummary.scopeCount ?? 0}件の匿名化商談`, `${view?.scopeSummary.scopeCount ?? 0} redacted opportunities`)}</dd><dt>{t("workspace.dataSource")}</dt><dd>{view?.runtime?.sourceLabel || (dataSource === "d365-pilot" ? "D365 Frozen Dataset Safe Context" : "Local Fixture Safe Context")}</dd><dt>{local(language, "原始 CRM 发送", "元のCRM送信", "Raw CRM sent")}</dt><dd>{t("deepAnalysis.no")}</dd></dl></section>
    <div className="comparison-reservation-controls">
      <label><span>{local(language, "分析场景", "分析シナリオ", "Analysis scenario")}</span><select disabled={!available} value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{(catalog?.scenarios || []).map((item) => <option key={item.id} value={item.id}>{scenarioTitle(item.id, item.title)}</option>)}</select></label>
      <label><span>{local(language, "脱敏商机", "匿名化商談", "Redacted opportunity")}</span><select disabled={!available || !scopeView} value={opportunityToken} onChange={(event) => { setOpportunityToken(event.target.value); setResult(null); }}>{(scopeView?.opportunities || []).map((item) => <option key={item.opportunityToken} value={item.opportunityToken}>{maskOpportunityToken(item.opportunityToken)}</option>)}</select></label>
      <label><span>{local(language, "对比页面", "比較ページ", "Comparison page")}</span><select disabled={!available} value={page} onChange={(event) => { setPage(event.target.value as ComparisonPage); setResult(null); }}>{COMPARISON_PAGE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{comparisonPageLabel(item.value, language)}</option>)}</select></label>
      <label><span>{local(language, "上下文模式", "コンテキストモード", "Context mode")}</span><select disabled><option>{local(language, "仅 CRM Safe Context", "CRM Safe Contextのみ", "CRM Safe Context only")}</option></select></label>
    </div>
    {!available ? <ProductStatusPanel kind="blocked" title={local(language, "外部模型受控验证中", "外部モデルを制御付きで検証中", "External model under controlled validation")} message={local(language, "外部模型对比尚未启用，完成安全授权和 Provider 配置后开放。Provider 合同与重复性门禁尚未通过；安全门禁阻止真实调用，确定性功能不受影响。", "外部モデル比較はまだ有効ではありません。安全承認とProvider設定の完了後に利用できます。契約と再現性ゲートは未合格で、実呼び出しは安全ゲートによりブロックされています。決定論的機能には影響しません。", "External model comparison is not enabled. It becomes available after security authorization and Provider configuration. Contract and repeatability gates have not passed; real calls remain blocked and deterministic features are unaffected.")} /> : null}
    {available ? <div className="comparison-actions"><button disabled={state === "loading" || !opportunityToken} onClick={startComparison}>{local(language, "开始安全对比", "安全な比較を開始", "Start safe comparison")}</button><button disabled={state !== "loading"} onClick={() => controller.current?.abort()}>{local(language, "取消", "キャンセル", "Cancel")}</button><button onClick={resetComparison}>{local(language, "重置", "リセット", "Reset")}</button></div> : null}
    {state === "loading" ? <ProductStatusPanel kind="loading" title={local(language, "正在执行安全对比", "安全な比較を実行中", "Running safe comparison")} message={local(language, "仅向已批准 Provider 发送当前 Safe Context；页面不会自动重复调用。", "承認済みProviderに現在のSafe Contextのみを送信し、自動再実行は行いません。", "Only the current Safe Context is sent to the approved Provider; the page does not automatically repeat the call.")} /> : null}
    {message ? <ProductStatusPanel kind={state === "error" ? "error" : "fallback"} title={state === "error" ? local(language, "模型对比失败", "モデル比較に失敗", "Model comparison failed") : local(language, "模型对比状态", "モデル比較の状態", "Model comparison status")} message={message} /> : null}
    {result ? <ComparisonResultView result={result} /> : null}
    <p className="comparison-boundary">{local(language, "页面加载、导航和筛选变化均不会自动调用模型。默认结果继续来自 Demo Provider。", "ページの読み込み、ナビゲーション、フィルター変更でモデルが自動実行されることはありません。既定の結果は引き続きDemo Providerから提供されます。", "Page loads, navigation, and filter changes never call the model automatically. Default results continue to come from the Demo Provider.")}</p>
  </section>;
}

function ComparisonResultView({ result }: { result: ComparisonResult }) {
  if (result.status !== "completed" || !result.externalOutput || !result.demoOutput) return <ProductStatusPanel kind="fallback" title="已安全回退 Demo" message={result.fallbackReason || "外部模型对比未完成。"} />;
  return <div className="comparison-results"><section className="comparison-metadata"><dl><dt>请求 ID</dt><dd>{result.requestId}</dd><dt>模型提供方 / 模型</dt><dd>{result.provider} / {result.model}</dd><dt>响应耗时</dt><dd>{result.latencyMs} ms</dd><dt>输出结构校验</dt><dd>{result.schemaStatus}</dd><dt>安全校验</dt><dd>{result.safetyStatus}</dd><dt>引用校验</dt><dd>{result.citationStatus}</dd><dt>回退原因</dt><dd>{result.fallbackReason || "无"}</dd><dt>综合评分</dt><dd>{result.evaluation?.total ?? "未记录"}</dd></dl></section><div className="comparison-output-grid"><section><h3>Demo Provider</h3><UnifiedDecisionCard compact output={result.demoOutput} /></section><section><h3>External Provider</h3><UnifiedDecisionCard compact output={result.externalOutput} /></section></div>{result.evaluation ? <section className="comparison-score-grid">{Object.entries(result.evaluation.scores).map(([key, value]) => <article key={key}><span>{scoreLabel(key)}</span><strong>{value === null ? "待复测" : value}</strong></article>)}</section> : null}</div>;
}

function scoreLabel(key: string) { return ({ factAccuracy: "事实一致性检查", evidenceCoverage: "证据覆盖检查", requiredActionCoverage: "建议行动覆盖", claimSafety: "禁止结论检查", priorityAlignment: "优先级一致性", confidenceAlignment: "置信等级一致性", contractCompliance: "输出契约检查", safetyCompliance: "安全边界检查", stability: "输出稳定性" } as Record<string, string>)[key] || key; }

function ProviderConfigurationStatus({ latestSafetyStatus, status }: { latestSafetyStatus?: string; status: AiProviderStatus | null }) {
  const { language, t } = useI18n();
  const configured = Boolean(status?.baseUrlConfigured && status?.apiKeyConfigured && status?.modelConfigured);
  void latestSafetyStatus;
  const notRecorded = t("workspace.noRecord");
  const notExecuted = t("workspace.notExecuted");
  return <section className="provider-configuration product-panel"><header><div><h3>{local(language, "模型与模型提供方", "モデルとProvider", "Model and provider")}</h3><p>{local(language, "仅展示服务端配置状态，不展示密钥、服务地址、Prompt 或 Payload。", "サーバー設定状態のみを表示し、キー、サービスURL、Prompt、Payloadは表示しません。", "Only server configuration status is shown; secrets, service URLs, prompts, and payloads are hidden.")}</p></div><span>{local(language, "受控验证中", "制御付き検証中", "Controlled validation pending")}</span></header><section className="external-capability-status"><div><span>{local(language, "外部模型能力", "外部モデル機能", "External model capability")}</span><strong>{local(language, "受控验证中", "制御付き検証中", "Controlled validation pending")}</strong></div><ol><CapabilityStep active={false} complete={configured} label={local(language, "服务端配置", "サーバー設定", "Server configuration")} /><CapabilityStep active label={local(language, "合同验证", "契約検証", "Contract validation")} complete={false} /><CapabilityStep active={false} complete={false} label={local(language, "重复性验证", "再現性検証", "Repeatability validation")} /><CapabilityStep active={false} complete={false} label={local(language, "真实 Canary", "実Canary", "Real canary")} /></ol><dl><dt>{local(language, "当前策略", "現在の方針", "Current policy")}</dt><dd>{local(language, "确定性 Demo 模式", "決定論的Demoモード", "Deterministic demo mode")}</dd><dt>{local(language, "基础策略", "基本方針", "Base policy")}</dt><dd>{local(language, "默认使用 Demo 模型", "既定でDemoモデルを使用", "Use the demo model by default")}</dd><dt>{local(language, "受控启用", "制御付き有効化", "Controlled enablement")}</dt><dd>{local(language, "管理员配置 + 用户主动触发", "管理者設定 + ユーザーによる明示実行", "Administrator configuration + explicit user action")}</dd><dt>{local(language, "未启用", "未有効", "Not enabled")}</dt><dd>{configured ? "false" : "true"}</dd><dt>{local(language, "已配置", "設定済み", "Configured")}</dt><dd>{configured ? "true" : "false"}</dd><dt>{local(language, "安全验证通过", "安全検証合格", "Safety validation passed")}</dt><dd>false</dd><dt>{local(language, "可执行对比", "比較実行可能", "Comparison executable")}</dt><dd>false</dd><dt>{local(language, "演示影响", "デモへの影響", "Demo impact")}</dt><dd>{local(language, "无，确定性功能不受影响", "なし。決定論的機能への影響はありません", "None; deterministic features are unaffected")}</dd></dl></section><dl><dt>{local(language, "模型提供方类型", "Provider種別", "Provider type")}</dt><dd>{status?.providerRequested || "demo"}</dd><dt>{t("workspace.currentModel")}</dt><dd>{status?.modelName || decisionText("未配置", language)}</dd><dt>{local(language, "服务地址配置", "サービスURL設定", "Service URL configuration")}</dt><dd>{configuredLabel(status?.baseUrlConfigured, language)}</dd><dt>{local(language, "访问密钥配置", "アクセスキー設定", "Access key configuration")}</dt><dd>{configuredLabel(status?.apiKeyConfigured, language)}</dd><dt>{local(language, "模型配置", "モデル設定", "Model configuration")}</dt><dd>{configuredLabel(status?.modelConfigured, language)}</dd><dt>{local(language, "外部调用授权", "外部呼び出し承認", "External call authorization")}</dt><dd>{status?.externalAiEnabled ? t("deepAnalysis.enabled") : t("workspace.disabled")}</dd><dt>{local(language, "请求超时", "リクエストタイムアウト", "Request timeout")}</dt><dd>{status?.timeoutMs ? `${status.timeoutMs} ms` : notRecorded}</dd><dt>{local(language, "重试策略", "再試行ポリシー", "Retry policy")}</dt><dd>{status?.retryPolicy === "response-format-once" ? local(language, "仅结构格式兼容重试 1 次", "構造形式互換の再試行1回のみ", "One response-format compatibility retry only") : notRecorded}</dd><dt>{local(language, "最大响应", "最大レスポンス", "Maximum response")}</dt><dd>{status?.maxResponseTokens ? `${status.maxResponseTokens} tokens` : notRecorded}</dd><dt>{local(language, "输出结构版本", "出力スキーマ版", "Output schema version")}</dt><dd>{status?.schemaVersion || notRecorded}</dd><dt>{local(language, "最近连接检查", "直近の接続確認", "Latest connection check")}</dt><dd>{status?.lastConnectionCheckAt || notExecuted}</dd><dt>{local(language, "连接检查结果", "接続確認結果", "Connection check result")}</dt><dd>{status?.lastConnectionCheckResult === "not-run" ? notExecuted : status?.lastConnectionCheckResult || notRecorded}</dd><dt>D365 Data Source</dt><dd>true</dd><dt>D365 GET-only</dt><dd>true</dd><dt>CRM Writeback</dt><dd>false</dd><dt>External LLM Auto Run</dt><dd>false</dd><dt>Customer Identity Masked</dt><dd>true</dd><dt>Exact Amount Sent</dt><dd>false</dd><dt>Raw Timeline Sent</dt><dd>false</dd><dt>Production Access</dt><dd>false</dd><dt>{local(language, "Provider 合同", "Provider契約", "Provider contract")}</dt><dd>{local(language, "尚未通过", "未合格", "Not passed")}</dd><dt>{local(language, "安全门禁", "安全ゲート", "Safety gate")}</dt><dd>{local(language, "已阻止真实调用", "実呼び出しをブロック済み", "Real calls blocked")}</dd></dl></section>;
}

function CapabilityStep({ active, complete, label }: { active: boolean; complete: boolean; label: string }) { return <li className={`${active ? "active" : ""}${complete ? " complete" : ""}`}><i aria-hidden="true" /><span>{label}</span></li>; }

function AuditSection({ title, children }: { title: string; children: ReactNode }) { return <section className="audit-status-section product-panel"><h3>{title}</h3>{children}</section>; }
function AuditCount({ label, value, emptyLabel }: { label: string; value: number | null | undefined; emptyLabel: string }) { return <article><span>{label}</span><strong>{value === null || value === undefined ? emptyLabel : value}</strong></article>; }
function localizedAuditValue(value: string | undefined, language: "zh-CN" | "ja-JP" | "en-US", empty = "") {
  if (!value) return empty;
  const labels: Record<string, [string, string, string]> = {
    "未记录": ["未记录", "記録なし", "Not recorded"],
    "未请求": ["未请求", "未要求", "Not requested"],
    "安全转换": ["安全转换", "安全変換", "Safety transform"],
    "安全 AI 请求": ["安全 AI 请求", "安全なAIリクエスト", "Safe AI request"],
    "否": ["否", "いいえ", "No"],
    "无": ["无", "なし", "None"],
  };
  const translated = labels[value];
  return translated ? translated[language === "ja-JP" ? 1 : language === "en-US" ? 2 : 0] : decisionText(value, language);
}
function comparisonPageLabel(value: ComparisonPage, language: "zh-CN" | "ja-JP" | "en-US") {
  const labels: Record<ComparisonPage, [string, string, string]> = {
    cockpit: ["AI 驾驶舱", "AIコックピット", "AI Cockpit"],
    risk: ["风险与优先级", "リスクと優先順位", "Risk & Priority"],
    opportunity360: ["商机 360", "商談360", "Opportunity 360"],
    action: ["行动看板", "アクションボード", "Action Board"],
    meeting: ["会议副驾", "ミーティングコパイロット", "Meeting Copilot"],
    portfolio: ["组合洞察", "ポートフォリオインテリジェンス", "Portfolio Intelligence"],
  };
  const translated = labels[value];
  return translated[language === "ja-JP" ? 1 : language === "en-US" ? 2 : 0];
}
function configuredLabel(value: boolean | undefined, language: "zh-CN" | "ja-JP" | "en-US") { return value ? local(language, "已配置", "設定済み", "Configured") : local(language, "未配置", "未設定", "Not configured"); }
function formatTime(value: string, language: "zh-CN" | "ja-JP" | "en-US") { const date = new Date(value); return Number.isNaN(date.getTime()) ? decisionText("未记录", language) : date.toLocaleString(language, { hour12: false }); }
function local(language: "zh-CN" | "ja-JP" | "en-US", zh: string, ja: string, en: string) { return language === "ja-JP" ? ja : language === "en-US" ? en : zh; }
