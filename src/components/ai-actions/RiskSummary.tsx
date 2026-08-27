import { CopyButton } from "./CopyButton";
import { EvidenceBadge } from "./EvidenceBadge";

export function RiskSummary({ result }: { result: any }) {
  if (!result) return <p className="muted">Generate a risk summary from Safe CRM Context.</p>;
  if (result.empty) return <p className="muted">{result.message}</p>;
  const copy = [result.risk_summary, result.management_attention, ...(result.key_drivers || [])].join("\n");
  return (
    <article className="action-result">
      <header><strong>{result.risk_level} Risk</strong><CopyButton text={copy} /></header>
      <p>{result.risk_summary}</p>
      <p><b>Management attention：</b>{result.management_attention}</p>
      <div className="evidence-list">
        {(result.key_drivers || []).map((item: string) => <EvidenceBadge key={item} value={item} />)}
      </div>
      <pre>{(result.evidence || []).join("\n")}</pre>
    </article>
  );
}
