import type { NarrativeSnapshot } from "../narrative";
import { useI18n } from "../i18n";

export function NarrativePanel({ snapshot, compact = false, collapsible = false, title }: { snapshot?: NarrativeSnapshot; compact?: boolean; collapsible?: boolean; title?: string }) {
  const { t } = useI18n();
  const resolvedTitle = title || t("workspace.verifiedNarrative");
  const status = snapshot?.confidenceBand || t("narrative.currentUnverified");
  const body = snapshot ? <><p className="narrative-summary">{snapshot.executiveSummary}</p>{snapshot.riskExplanation.length ? <section><h4>{t("narrative.riskExplanation")}</h4><ul>{snapshot.riskExplanation.slice(0, compact ? 2 : 4).map((item) => <li key={item}>{item}</li>)}</ul></section> : null}{snapshot.recommendedActionDraft.length ? <section><h4>{t("narrative.actionDraft")}</h4>{snapshot.recommendedActionDraft.slice(0, compact ? 1 : 3).map((item) => <article key={item.action}><strong>{item.action}</strong><span>{item.status} · {item.ownerRole} · {item.dueWindow}</span><small>Evidence: {item.evidence.join(", ")}</small></article>)}</section> : null}{!compact ? <footer><span>Evidence {snapshot.evidence.map((item) => item.alias).join(", ") || t("workspace.noRecord")}</span><span>{snapshot.providerAlias} · {snapshot.contractVersion}</span><span>CRM Writeback=false</span></footer> : null}</> : <p>{t("narrative.pendingBody")}</p>;
  const className = `narrative-panel product-panel${compact ? " compact" : ""}${snapshot ? "" : " pending"}${collapsible ? " collapsible" : ""}`;
  if (collapsible) return <details className={className} aria-label={resolvedTitle} data-contract-label="Validated LLM Analysis Snapshot"><summary><div><span>{t("narrative.eyebrow")}</span><h3>{resolvedTitle}</h3></div><strong>{status}</strong><b className="collapsible-toggle" aria-hidden="true" /></summary><div className="narrative-panel-body">{body}</div></details>;
  return <section className={className} aria-label={resolvedTitle} data-contract-label="Validated LLM Analysis Snapshot"><header><div><span>{t("narrative.eyebrow")}</span><h3>{resolvedTitle}</h3></div><strong>{status}</strong></header>{body}</section>;
}
