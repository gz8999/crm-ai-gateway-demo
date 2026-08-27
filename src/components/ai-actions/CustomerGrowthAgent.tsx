import { CopyButton } from "./CopyButton";

export function CustomerGrowthAgent({ result }: { result: any }) {
  if (!result) return <p className="muted">Generate customer growth insight from a customer token.</p>;
  if (result.empty) return <p className="muted">{result.message}</p>;
  const copy = [result.customer_profile, result.recommendation_reason, result.suggested_talk_track, result.next_action].join("\n");
  return (
    <article className="action-result">
      <header><strong>{result.customer_token}</strong><CopyButton text={copy} /></header>
      <p>{result.customer_profile}</p>
      <p><b>主要业务：</b>{(result.main_business_types || []).join(" / ")}</p>
      <p><b>潜在追加方向：</b>{(result.potential_growth_directions || []).join(" / ")}</p>
      <p><b>推荐理由：</b>{result.recommendation_reason}</p>
      <pre>{result.suggested_talk_track}</pre>
      <p><b>下一步行动：</b>{result.next_action}</p>
    </article>
  );
}
