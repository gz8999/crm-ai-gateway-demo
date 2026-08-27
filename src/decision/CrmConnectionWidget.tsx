import { useState } from "react";
import { getCrmRuntimeStatus } from "../api";
import { useI18n, type TranslationKey } from "../i18n";
import type { CrmRuntimeStatus } from "./types";

const COUNT_LABELS: Array<[string, TranslationKey]> = [
  ["account", "crm.count.account"], ["contact", "crm.count.contact"], ["opportunity", "crm.count.opportunity"], ["coverage", "crm.count.coverage"],
  ["actual", "crm.count.actual"], ["timeline", "crm.count.timeline"], ["signal", "crm.count.signal"], ["opportunityClose", "crm.count.opportunityClose"], ["bpf", "crm.count.bpf"], ["explicitRecords", "crm.count.explicitRecords"],
];

export function CrmConnectionWidget({ status, onAudit, onStatusUpdate }: { status: CrmRuntimeStatus | null; onAudit: () => void; onStatusUpdate?: (status: CrmRuntimeStatus) => void }) {
  const { language, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const current = status?.connectionStatus || "unknown";
  async function check() {
    if (checking) return;
    setChecking(true); setCheckError("");
    try { const response = await getCrmRuntimeStatus(); onStatusUpdate?.(response.data); } catch (error) { setCheckError(error instanceof Error ? t("crm.statusUnavailable") : t("crm.statusUnavailable")); }
    finally { setChecking(false); }
  }
  const counts = status?.counts || {};
  return <section className="crm-connection-widget product-panel" aria-label={t("crm.connection")}>
    <button className="crm-connection-summary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span className={`connection-dot ${current}`} aria-hidden="true" />
      <span><strong>{t("crm.connection")}</strong><small>{current === "connected" ? t("crm.connected") : current === "unavailable" ? t("crm.unavailable") : t("crm.unknown")} · {t("crm.opportunityCount", { count: counts.opportunity ?? t("crm.unknownValue") })}</small></span>
      <b>{open ? t("crm.collapse") : t("crm.details")}</b>
    </button>
    {open ? <div className="crm-connection-drawer">
      <header><h3>{t("crm.detailsTitle")}</h3><span>{status?.sourceAlias || t("crm.unknown")}</span></header>
      <dl><dt>{t("crm.dataMode")}</dt><dd>{status?.dataSourceMode || t("crm.unknownValue")}</dd><dt>{t("crm.accessMode")}</dt><dd>{t("crm.getOnly")}</dd><dt>{t("crm.productionAccess")}</dt><dd>{t("crm.falseValue")}</dd><dt>{t("crm.writeback")}</dt><dd>{t("crm.falseValue")}</dd><dt>{t("crm.gatewayLoaded")}</dt><dd>{formatTimestamp(status?.gatewayLoadedAt, language, t("crm.unknownValue"))}</dd><dt>{t("crm.lastD365Read")}</dt><dd>{formatTimestamp(status?.lastSuccessfulD365ReadAt, language, t("crm.unknownValue"))}</dd><dt>{t("crm.statusChecked")}</dt><dd>{formatTimestamp(status?.statusCheckedAt, language, t("crm.unknownValue"))}</dd><dt>{t("crm.timezone")}</dt><dd>{t("crm.timezoneValue")}</dd></dl>
      <div className="crm-count-grid">{COUNT_LABELS.map(([key, labelKey]) => <span key={key}><small>{t(labelKey)}</small><strong>{counts[key] ?? t("deepAnalysis.unavailableValue")}</strong></span>)}</div>
      <div className="crm-request-safety"><span>{t("crm.d365Get")} {numberValue(status?.requestStats?.D365GET ?? status?.requestStats?.d365Get, t("crm.unknownValue"))}</span><span>{t("crm.post")} 0</span><span>{t("crm.patch")} 0</span><span>{t("crm.delete")} 0</span><span>{t("crm.publish")} 0</span></div>
      <footer><button onClick={check} disabled={checking}>{checking ? t("crm.checking") : t("crm.reconnect")}</button><button onClick={onAudit}>{t("crm.audit")}</button>{checkError ? <p role="alert">{checkError}</p> : null}</footer>
    </div> : null}
  </section>;
}

function formatTimestamp(value: string | undefined, language: "zh-CN" | "ja-JP" | "en-US", unknown: string) { if (!value || value === "unknown") return unknown; const date = new Date(value); return Number.isNaN(date.getTime()) ? unknown : new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(date); }
function numberValue(value: number | undefined, unknown: string) { return typeof value === "number" ? value : unknown; }
