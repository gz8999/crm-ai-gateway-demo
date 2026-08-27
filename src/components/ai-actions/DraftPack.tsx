import { CopyButton } from "./CopyButton";

export function DraftPack({ result }: { result: any }) {
  if (!result) return <p className="muted">Generate a reusable draft pack from Safe CRM Context.</p>;
  if (result.empty) return <p className="muted">{result.message}</p>;
  const drafts = result.drafts || {};
  const entries = Object.entries(drafts);
  return (
    <section className="draft-pack">
      {entries.map(([key, value]) => (
        <article className="action-result" key={key}>
          <header>
            <strong>{labelDraft(key)}</strong>
            <CopyButton text={String(value || "")} />
          </header>
          <pre>{String(value || "")}</pre>
        </article>
      ))}
    </section>
  );
}

function labelDraft(key: string) {
  return key
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(" ");
}
