import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createComparisonHarness } from "../server/decision/comparisonHarness.mjs";
import { callComparisonProvider } from "../server/decision/comparisonProvider.mjs";
import { providerErrorObservationKeys } from "../server/decision/providerErrorObservability.mjs";

const strictEnv = {
  AI_PROVIDER: "openai-compatible",
  ALLOW_EXTERNAL_AI: "true",
  LLM_BASE_URL: "https://api.deepseek.com/beta",
  LLM_MODEL: "deepseek-v4-pro",
  LLM_API_KEY: "test-only-placeholder",
  PHASE3C_NATIVE_JSON_MODE: "strict-tool",
};

test("standard JSON provider errors are parsed with an allowlist and read once", async () => {
  let reads = 0;
  const body = JSON.stringify({ error: { message: "Schema rejected", type: "invalid_request_error", param: "tools", code: "invalid_request" }, ignored: "never keep" });
  const result = await callComparisonProvider({
    safeContext: { opportunityToken: "SYNTH-001", priority: "Monitor" },
    accountAggregate: { accountToken: "SYNTH-ACCOUNT-001" },
    page: "risk",
    requestCorrelation: "R5B0-JSON-001",
    env: strictEnv,
    fetchImpl: async () => ({ ok: false, status: 400, headers: new Headers({ "content-type": "application/json" }), text: async () => { reads += 1; return body; } }),
  });
  assert.equal(reads, 1);
  assert.equal(result.ok, false);
  assert.equal(result.called, true);
  assert.equal(result.httpStatus, 400);
  assert.equal(result.attempts, 1);
  assert.equal(result.errorObservation.providerErrorCode, "invalid_request");
  assert.equal(result.errorObservation.providerErrorType, "invalid_request_error");
  assert.equal(result.errorObservation.providerErrorParam, "tools");
  assert.equal(result.errorObservation.sanitizedErrorMessage, "Schema rejected");
  assert.equal(result.errorObservation.bodyAvailable, true);
  assert.match(result.errorObservation.responseBodyHash, /^[0-9a-f]{64}$/);
  assert.equal(Object.hasOwn(result.errorObservation, "ignored"), false);
});

test("nonstandard JSON keeps only provider error fields", async () => {
  const result = await callComparisonProvider({
    safeContext: { opportunityToken: "SYNTH-002", priority: "Low" },
    accountAggregate: { accountToken: "SYNTH-ACCOUNT-002" },
    page: "cockpit",
    env: strictEnv,
    fetchImpl: async () => ({ ok: false, status: 422, headers: new Headers({ "content-type": "application/json" }), text: async () => JSON.stringify({ message: "Invalid synthetic field", detail: "not recorded", secret: "never keep" }) }),
  });
  assert.equal(result.errorObservation.sanitizedErrorMessage, "Invalid synthetic field");
  assert.equal(result.errorObservation.providerErrorCode, null);
  assert.equal(Object.keys(result.errorObservation).includes("detail"), false);
  assert.equal(JSON.stringify(result.errorObservation).includes("never keep"), false);
});

test("text errors redact secrets, identity, CRM tokens, and long content", async () => {
  const body = "sk-test-key Bearer synthetic-token token client_secret=synthetic-client-secret api_key=synthetic-api-key contact@example.com +86 138 0013 8000 123e4567-e89b-12d3-a456-426614174000 DEMO-6C-OPP-002 " + "x".repeat(700);
  const result = await callComparisonProvider({
    safeContext: { opportunityToken: "SYNTH-003", priority: "Medium" },
    accountAggregate: { accountToken: "SYNTH-ACCOUNT-003" },
    page: "opportunity360",
    env: strictEnv,
    fetchImpl: async () => ({ ok: false, status: 500, headers: new Headers({ "content-type": "text/plain" }), text: async () => body }),
  });
  const message = result.errorObservation.sanitizedErrorMessage;
  assert.equal(result.errorObservation.bodyTruncated, true);
  assert.ok(message.length <= 500);
  for (const forbidden of ["sk-test-key", "Bearer synthetic-token", "synthetic-client-secret", "synthetic-api-key", "contact@example.com", "138 0013 8000", "123e4567-e89b-12d3-a456-426614174000", "DEMO-6C-OPP-002"]) assert.equal(message.includes(forbidden), false, forbidden);
  assert.match(message, /REDACTED/);
});

test("HTML errors keep metadata and hash but never retain HTML body", async () => {
  const body = "<!doctype html><html><body>sk-test-key internal details</body></html>";
  const result = await callComparisonProvider({
    safeContext: { opportunityToken: "SYNTH-004", priority: "High" },
    accountAggregate: { accountToken: "SYNTH-ACCOUNT-004" },
    page: "meeting",
    env: strictEnv,
    fetchImpl: async () => ({ ok: false, status: 502, headers: new Headers({ "content-type": "text/html; charset=utf-8" }), text: async () => body }),
  });
  assert.equal(result.errorObservation.contentType, "text/html");
  assert.equal(result.errorObservation.sanitizedErrorMessage, "");
  assert.equal(result.errorObservation.bodyAvailable, true);
  assert.equal(result.errorObservation.bodyLength, Buffer.byteLength(body));
  assert.equal(result.errorObservation.responseBodyHash, createHash("sha256").update(body).digest("hex"));
  assert.equal(JSON.stringify(result.errorObservation).includes("<html>"), false);
  assert.equal(JSON.stringify(result.errorObservation).includes("sk-test-key"), false);
});

test("empty errors remain observable without a body", async () => {
  const result = await callComparisonProvider({
    safeContext: { opportunityToken: "SYNTH-005", priority: "Monitor" },
    accountAggregate: { accountToken: "SYNTH-ACCOUNT-005" },
    page: "portfolio",
    env: strictEnv,
    fetchImpl: async () => ({ ok: false, status: 503, headers: new Headers({ "content-type": "application/json" }), text: async () => "" }),
  });
  assert.equal(result.errorObservation.httpStatus, 503);
  assert.equal(result.errorObservation.bodyAvailable, false);
  assert.equal(result.errorObservation.sanitizedErrorMessage, "");
  assert.equal(result.errorObservation.responseBodyHash, createHash("sha256").update("").digest("hex"));
});

test("strict provider errors are fail-closed with retry and fixture fallback both disabled", async () => {
  let calls = 0;
  const result = await callComparisonProvider({
    safeContext: { opportunityToken: "SYNTH-006", priority: "Monitor" },
    accountAggregate: { accountToken: "SYNTH-ACCOUNT-006" },
    page: "action",
    env: strictEnv,
    fetchImpl: async () => { calls += 1; return { ok: false, status: 429, headers: new Headers({ "content-type": "text/plain" }), text: async () => "rate limited" }; },
  });
  assert.equal(calls, 1);
  assert.equal(result.attempts, 1);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider_rate_limited");
  assert.equal(result.errorObservation.httpStatus, 429);
  assert.equal(result.fallback, undefined);
});

test("HTML, body, request, and Safe Context payloads never enter comparison audit", async () => {
  const harness = createComparisonHarness({
    env: { ...strictEnv, FEATURE_MODEL_COMPARISON: "true" },
    fetchImpl: async () => ({ ok: false, status: 400, headers: new Headers({ "content-type": "text/html" }), text: async () => "<html>authorization: Bearer synthetic-token</html>" }),
  });
  const result = await harness.compare({ confirmed: true, scenarioId: "multi-risk-priority", opportunityToken: "DEMO-6C-OPP-075", page: "risk" });
  const audit = harness.listAudit()[0];
  assert.equal(result.status, "fallback_demo");
  assert.equal(result.errorObservation.sanitizedErrorMessage, "");
  assert.equal(audit.errorObservation.bodyAvailable, true);
  const serialized = JSON.stringify(audit);
  for (const forbidden of ["<html>", "authorization", "Bearer synthetic-token", "safeDecisionContext", "externalOutput", "test-only-placeholder"]) assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  for (const key of providerErrorObservationKeys()) assert.equal(Object.hasOwn(audit.errorObservation, key), true, key);
});

test("error observations expose only the published allowlist", async () => {
  const result = await callComparisonProvider({
    safeContext: { opportunityToken: "SYNTH-007", priority: "Low" },
    accountAggregate: { accountToken: "SYNTH-ACCOUNT-007" },
    page: "risk",
    env: strictEnv,
    fetchImpl: async () => ({ ok: false, status: 400, headers: new Headers({ "content-type": "application/json" }), text: async () => JSON.stringify({ error: { message: "bad", code: "bad_request", internal: "omit" } }) }),
  });
  assert.deepEqual(Object.keys(result.errorObservation).sort(), providerErrorObservationKeys().sort());
  assert.equal(Object.hasOwn(result.errorObservation, "rawBody"), false);
  assert.equal(Object.hasOwn(result.errorObservation, "requestBody"), false);
});
