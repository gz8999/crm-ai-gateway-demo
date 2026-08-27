import { CopyButton } from "./CopyButton";

export function ManagementMeetingCopilot({ result }: { result: any }) {
  if (!result) return <p className="muted">Generate meeting materials from Safe CRM Context.</p>;
  return (
    <article className="action-result">
      <header><strong>营业会议材料</strong><CopyButton text={result.markdown || ""} /></header>
      <pre>{result.markdown}</pre>
    </article>
  );
}
