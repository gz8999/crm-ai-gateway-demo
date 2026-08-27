export function CopyButton({ text }: { text: string }) {
  return <button className="copy-button" onClick={() => navigator.clipboard?.writeText(text)}>Copy</button>;
}
