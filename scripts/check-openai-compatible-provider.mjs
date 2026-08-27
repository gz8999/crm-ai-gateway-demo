import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createApp } from "../server/app.mjs";
import { transformOpportunity } from "../server/gateway.mjs";

const safeDemoOpportunity = {
  id: "OPP-SAFE-001",
  opportunity_name: "[AI-DEMO] Safe Provider Connectivity Test",
  customer_code: "CUST-001",
  owner_id: "OWNER-001",
  department: "Freight Forwarding",
  stage: "L4 Quotation",
  risk_level: "High",
  transport_mode: "OE",
  expected_order_date: "2026-06-23",
  customer_need: "竞争性报价",
  proposal_content: "降低成本方案",
  revenue_band: "5M+",
  margin_band: "10%-15%",
  data_quality_flags: [],
  source: "dynamics",
  is_ai_demo: true,
  description: "安全案件说明",
  aigw_progresssummary: "客户反馈价格偏高，等待客户反馈。",
};

export async function runOpenAiCompatibleProviderCheck({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date("2026-07-02T00:00:00"),
  minimalJson = false,
} = {}) {
  const envReadiness = checkTemporaryEnv(env);
  const store = createMemoryStore();
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  Object.assign(process.env, env);
  globalThis.fetch = fetchImpl;

  const app = createApp({ store, now });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const safePayload = transformOpportunity(safeDemoOpportunity, "Sales Owner", now()).safePayload;
    const [chat, ai] = await Promise.all([
      originalFetch(`${base}/api/ai-demo/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "management", question: "哪些案件需要关注？", filters: {}, language: "zh-CN", minimalJson }),
      }).then((response) => response.json()),
      originalFetch(`${base}/api/ai/risk-analysis`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "Sales Owner", opportunity_id: safeDemoOpportunity.id, safePayload, language: "zh-CN", minimalJson }),
      }).then((response) => response.json()),
    ]);
    const audit = await originalFetch(`${base}/api/audit-log`).then((response) => response.json());
    const aiEntry = audit.data.find((entry) => entry.functionName === "risk-analysis")
      || audit.data.find((entry) => entry.functionName === "ai-demo-chat")
      || {};
    return {
      providerType: "openai-compatible",
      envReady: envReadiness.ready,
      missingEnv: envReadiness.missing,
      externalCallSucceeded: Boolean(chat.external_model_called || ai.external_model_called),
      fallbackUsed: Boolean(aiEntry.fallback_used),
      outputGuardStatus: aiEntry.output_guard_status || "",
      externalResponsePreviewSanitized: aiEntry.external_response_preview_sanitized || "",
      externalResponseParseError: aiEntry.external_response_parse_error || "",
      auditSample: pickAuditSample(aiEntry),
      endpointShape: endpointShape(env.LLM_BASE_URL),
      finalEnvFileStatus: await readDefaultEnvStatus(),
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
}

function checkTemporaryEnv(env) {
  const required = ["AI_PROVIDER", "ALLOW_EXTERNAL_AI", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"];
  const missing = required.filter((key) => !env[key]);
  return { ready: missing.length === 0, missing };
}

function createMemoryStore() {
  const audit = [];
  return {
    async listOpportunities() {
      return [safeDemoOpportunity];
    },
    async appendAudit(entry) {
      const next = { id: `audit-${audit.length + 1}`, ...entry };
      audit.push(next);
      return next;
    },
    async getAuditLog() {
      return audit;
    },
    async resetAuditLog() {
      audit.length = 0;
    },
    getDynamicsStatus() {
      return {
        dataSource: "dynamics",
        recordCount: 1,
        syncedDemoCount: 1,
        excludedNonDemoCount: 0,
        lastRefreshTime: new Date().toISOString(),
      };
    },
  };
}

function pickAuditSample(entry) {
  return Object.fromEntries([
    "provider_requested",
    "provider_used",
    "external_model_called",
    "fallback_used",
    "fallback_reason",
    "raw_data_sent",
    "safe_context_used",
    "safe_payload_keys",
    "safe_payload_char_count",
    "response_char_count",
    "language",
    "output_guard_status",
    "blocked_reason",
    "response_format_requested",
    "response_format_retry_used",
    "external_response_preview_sanitized",
    "external_response_parse_error",
  ].map((key) => [key, entry[key] ?? ""]));
}

function endpointShape(baseUrl = "") {
  const normalized = String(baseUrl || "").replace(/\/$/, "");
  return {
    hasBaseUrl: Boolean(normalized),
    includesV1: /\/v1$/.test(normalized),
    wouldPostTo: normalized ? `${normalized}/chat/completions` : "",
  };
}

async function readDefaultEnvStatus() {
  const content = await readFile(".env", "utf8").catch(() => "");
  return {
    AI_PROVIDER: readEnvValue(content, "AI_PROVIDER") || "demo",
    ALLOW_EXTERNAL_AI: readEnvValue(content, "ALLOW_EXTERNAL_AI").toLowerCase() === "true" ? "true" : "false",
  };
}

function readEnvValue(content, key) {
  const line = content.split(/\r?\n/).find((item) => item.trim().startsWith(`${key}=`));
  return line ? line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "") : "";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOpenAiCompatibleProviderCheck({ minimalJson: process.argv.includes("--minimal-json") })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({ error: error.message }, null, 2));
      process.exitCode = 1;
    });
}
