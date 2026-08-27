import { CopyButton } from "./CopyButton";

export function NextBestActionBoard({ result }: { result: any }) {
  const items = result?.items || [];
  if (items.length === 0) return <p className="muted">{result?.message || "No action items in current scope."}</p>;
  return (
    <div className="table-scroll">
      <table className="dense-table action-table">
        <thead><tr><th>Priority</th><th>Action</th><th>Opportunity</th><th>Customer</th><th>Owner</th><th>Due</th><th>Reason</th><th>Evidence</th><th>Impact</th><th>Draft</th></tr></thead>
        <tbody>
          {items.map((item: any) => (
            <tr key={`${item.priority}-${item.opportunity_token}`}>
              <td>{item.priority}</td><td>{item.action}</td><td>{item.opportunity_token}</td><td>{item.customer_token}</td><td>{item.owner}</td><td>{item.due}</td><td>{item.reason}</td><td>{(item.evidence || []).join(" / ")}</td><td>{item.expected_impact}</td><td>{item.draft_crm_update}<CopyButton text={item.draft_crm_update} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
