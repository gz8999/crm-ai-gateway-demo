export function openAiCompatibleThinking(env = process.env) {
  const mode = String(env.LLM_THINKING_MODE || "disabled").trim().toLowerCase();
  return mode === "omit" ? {} : { thinking: { type: mode || "disabled" } };
}
