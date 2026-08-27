import { containsForbiddenProviderContent } from "./promptBuilder.mjs";

export async function callOpenAiCompatibleProvider({
  messages = [],
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const timeoutMs = Number(env.LLM_TIMEOUT_MS || 20000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let responseFormatRetryUsed = false;
  try {
    const baseUrl = String(env.LLM_BASE_URL || "").replace(/\/$/, "");
    const requestUrl = `${baseUrl}/chat/completions`;
    const requestOptions = (withResponseFormat) => ({
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.LLM_API_KEY}`,
      },
      body: JSON.stringify(buildRequestBody({ messages, env, withResponseFormat })),
    });
    let response = await fetchImpl(requestUrl, requestOptions(true));
    if (!response.ok && response.status === 400) {
      responseFormatRetryUsed = true;
      response = await fetchImpl(requestUrl, requestOptions(false));
    }
    if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
    const json = await response.json().catch((error) => {
      throw new Error(`LLM response JSON parse failed: ${error.message}`);
    });
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM response was empty.");
    return {
      content,
      responseFormatRequested: true,
      responseFormatRetryUsed,
      responsePreviewSanitized: sanitizedResponsePreview(content),
      parseError: "",
    };
  } catch (error) {
    const reason = error?.name === "AbortError" ? "LLM request timeout." : error?.message || "LLM request failed.";
    return {
      error: reason,
      responseFormatRequested: true,
      responseFormatRetryUsed,
      responsePreviewSanitized: "",
      parseError: reason,
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildRequestBody({ messages, env, withResponseFormat }) {
  return {
    model: env.LLM_MODEL,
    messages,
    max_tokens: Number(env.LLM_MAX_TOKENS || 1200),
    temperature: Number(env.LLM_TEMPERATURE || 0.2),
    stream: false,
    ...(withResponseFormat ? { response_format: { type: "json_object" } } : {}),
  };
}

function sanitizedResponsePreview(content) {
  const preview = String(content || "").slice(0, 200);
  return containsForbiddenProviderContent(preview).ok ? preview : "[blocked_sensitive_preview]";
}
