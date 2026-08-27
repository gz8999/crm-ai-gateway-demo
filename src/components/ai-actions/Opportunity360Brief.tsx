import { CopyButton } from "./CopyButton";
import { EvidenceBadge } from "./EvidenceBadge";

export function Opportunity360Brief({ result }: { result: any }) {
  if (!result) return <p className="muted">Generate an Opportunity 360 brief from Safe CRM Context.</p>;
  if (result.empty) return <p className="muted">{result.message}</p>;
  const copy = [
    result.one_line_summary,
    result.stage_judgement,
    result.main_risks,
    ...(result.next_actions || []),
    result.crm_next_step_draft,
  ].join("\n");
  return (
    <article className="action-result">
      <header><strong>{result.opportunity_token}</strong><CopyButton text={copy} /></header>
      <p>{result.one_line_summary}</p>
      <p><b>阶段判断：</b>{result.stage_judgement}</p>
      <p><b>风险判断：</b>{result.main_risks}</p>
      <p><b>缺失信息：</b>{(result.missing_information || []).join(" / ")}</p>
      <p><b>客户推进策略：</b>{result.customer_strategy}</p>
      <ul>{(result.next_actions || []).map((item: string) => <li key={item}>{item}</li>)}</ul>
      <p><b>管理层介入：</b>{result.management_escalation}</p>
      <div className="evidence-list">{(result.evidence || []).map((item: string) => <EvidenceBadge key={item} value={item} />)}</div>
      <pre>{result.crm_next_step_draft}</pre>
    </article>
  );
}
