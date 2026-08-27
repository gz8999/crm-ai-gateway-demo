import { CopyButton } from "./CopyButton";

export function CrmDataDoctor({ result }: { result: any }) {
  const issues = result?.issues || [];
  if (issues.length === 0) return <p className="muted">{result?.message || "No CRM data quality issues in current scope."}</p>;
  return (
    <section className="action-result">
      <div className="score-strip"><strong>Data Quality Score</strong><span>{result.score}/100</span><CopyButton text={result.repair_plan || ""} /></div>
      <p>{result.repair_plan}</p>
      <table className="dense-table">
        <thead><tr><th>Issue Type</th><th>Severity</th><th>Opportunity</th><th>Customer</th><th>Owner</th><th>Evidence</th><th>Impact</th><th>Suggested Fix</th><th>Draft</th></tr></thead>
        <tbody>{issues.map((item: any) => <tr key={`${item.issue_type}-${item.opportunity_token}`}><td>{item.issue_type}</td><td>{item.severity}</td><td>{item.opportunity_token}</td><td>{item.customer_token}</td><td>{item.owner}</td><td>{(item.evidence || []).join(" / ")}</td><td>{item.business_impact}</td><td>{item.suggested_fix}</td><td>{item.draft_crm_update}</td></tr>)}</tbody>
      </table>
    </section>
  );
}
