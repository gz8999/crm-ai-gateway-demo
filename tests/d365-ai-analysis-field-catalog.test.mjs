import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assertAuditEnvironment, createGetOnlyAuditClient } from "../scripts/audit-d365-ai-analysis-field-catalog.mjs";

test("field catalog audit accepts only the approved test environment", () => {
  assert.equal(assertAuditEnvironment({ DATAVERSE_URL: "https://org91f5f65f.crm5.dynamics.com", AI_PROVIDER: "demo", ALLOW_EXTERNAL_AI: "false" }), "https://org91f5f65f.crm5.dynamics.com");
  assert.throws(() => assertAuditEnvironment({ DATAVERSE_URL: "https://lcn-crm.crm7.dynamics.com" }), /P0/);
  assert.throws(() => assertAuditEnvironment({ DATAVERSE_URL: "https://org91f5f65f.crm5.dynamics.com", ALLOW_EXTERNAL_AI: "true" }), /external AI/);
});

test("audit client exposes GET only and counts requests", async () => {
  const client = createGetOnlyAuditClient({ dataverseGet: async (endpoint) => ({ body: { endpoint } }) });
  assert.deepEqual(Object.keys(client).sort(), ["get", "getCount"]);
  await client.get("/metadata");
  assert.equal(client.getCount(), 1);
});

test("generated catalog is complete, safe, and internally consistent", () => {
  const catalog = JSON.parse(fs.readFileSync("docs/gateway/d365-ai-analysis-field-catalog.json", "utf8"));
  assert.equal(catalog.audit.hostname, "org91f5f65f.crm5.dynamics.com");
  assert.deepEqual(catalog.audit.requests, { GET: catalog.audit.requests.GET, POST: 0, PATCH: 0, DELETE: 0, Publish: 0 });
  assert.equal(catalog.audit.productionRequests, 0);
  assert.equal(catalog.audit.externalLlmCalls, 0);
  assert.ok(catalog.summary.auditedEntityCount >= 15);
  assert.ok(catalog.fields.length > 150);
  assert.deepEqual([...new Set(catalog.fields.map((f) => f.classification))].sort(), ["ADD", "DERIVE", "EXCLUDE", "EXTERNAL", "REUSE"]);
  for (const field of catalog.fields) {
    assert.ok(["ADD", "DERIVE", "EXCLUDE", "EXTERNAL", "REUSE"].includes(field.classification));
    assert.equal(typeof field.containsIdentity, "boolean");
    assert.equal(typeof field.containsExactAmount, "boolean");
    if (field.containsExactAmount) assert.equal(field.externalLlmAllowed, false);
    if (field.containsIdentity) assert.equal(field.externalLlmAllowed, false);
  }
  assert.deepEqual(catalog.scenarioMatrix.map((x) => x.scenarioId), ["stalled-high-value", "budget-actual-gap", "data-contradiction", "growth-opportunity", "location-route-risk", "meeting-prep", "multi-risk-priority", "healthy-control"]);
  assert.deepEqual(catalog.deepAnalysisMatrix.map((x) => x.id), ["DA-01", "DA-02", "DA-03", "DA-04", "DA-05", "DA-06", "DA-07", "DA-08", "DA-09"]);
  const serialized = JSON.stringify(catalog);
  assert.doesNotMatch(serialized, /Bearer |client_secret|access_token|refresh_token|lcn-crm\.crm7/i);
  assert.doesNotMatch(serialized, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  assert.equal(catalog.gates["D365 Schema Writes"], 0);
  assert.equal(catalog.gates["Dataverse Business Writes"], 0);
  assert.equal(catalog.gates["Real CRM Data Exposure"], 0);
});

test("audit implementation contains no Dataverse write calls", () => {
  const source = fs.readFileSync("scripts/audit-d365-ai-analysis-field-catalog.mjs", "utf8");
  assert.doesNotMatch(source, /dataverse(Post|Patch|Delete)|PublishXml|AddSolutionComponent/);
  assert.doesNotMatch(source, /\.post\(|\.patch\(|\.delete\(/i);
});
