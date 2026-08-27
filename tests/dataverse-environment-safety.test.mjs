import assert from "node:assert/strict";
import test from "node:test";
import { assertDataverseScriptGate, getDataverseUrl } from "../scripts/dataverse/lib/environment-safety.mjs";

const testEnv = {
  DATAVERSE_URL: "https://example.crm.dynamics.com",
  DATAVERSE_ENVIRONMENT_KIND: "test",
  DATAVERSE_PRODUCTION_HOSTNAMES: "production.crm.dynamics.com",
};

test("Dataverse URL has no default and accepts only HTTPS organization roots", () => {
  assert.throws(() => getDataverseUrl({}), /required/);
  assert.throws(() => getDataverseUrl({ DATAVERSE_URL: "http://example.crm.dynamics.com" }), /HTTPS/);
  assert.throws(() => getDataverseUrl({ DATAVERSE_URL: "https://example.com" }), /Dynamics/);
  assert.equal(getDataverseUrl(testEnv), "https://example.crm.dynamics.com");
});

test("read-only scripts need only a valid explicit URL", () => {
  assert.equal(assertDataverseScriptGate({ mode: "read-only", env: { DATAVERSE_URL: testEnv.DATAVERSE_URL } }).mode, "read-only");
});

test("write-capable scripts require test classification, denylist and explicit confirmation", () => {
  assert.throws(() => assertDataverseScriptGate({ mode: "write-capable", env: testEnv, argv: [] }), /confirm-test-environment/);
  assert.throws(() => assertDataverseScriptGate({ mode: "write-capable", env: { ...testEnv, DATAVERSE_ENVIRONMENT_KIND: "" }, argv: ["--confirm-test-environment", "--confirm"] }), /ENVIRONMENT_KIND/);
  assert.throws(() => assertDataverseScriptGate({ mode: "write-capable", env: { ...testEnv, DATAVERSE_PRODUCTION_HOSTNAMES: "" }, argv: ["--confirm-test-environment", "--confirm"] }), /PRODUCTION_HOSTNAMES/);
  assert.throws(() => assertDataverseScriptGate({ mode: "write-capable", env: testEnv, argv: ["--confirm-test-environment"] }), /Explicit --confirm/);
  assert.equal(assertDataverseScriptGate({ mode: "write-capable", env: testEnv, argv: ["--confirm-test-environment", "--confirm"] }).mode, "write-capable");
});

test("production hostname is always blocked", () => {
  const env = { ...testEnv, DATAVERSE_PRODUCTION_HOSTNAMES: "example.crm.dynamics.com" };
  assert.throws(() => assertDataverseScriptGate({ mode: "write-capable", env, argv: ["--confirm-test-environment", "--confirm"] }), /Production/);
});

test("publish/deploy scripts require an independent confirmation", () => {
  assert.throws(() => assertDataverseScriptGate({ mode: "publish/deploy-capable", env: testEnv, argv: ["--confirm-test-environment", "--confirm"] }), /confirm-publish-or-deploy/);
  assert.equal(assertDataverseScriptGate({ mode: "publish/deploy-capable", env: testEnv, argv: ["--confirm-test-environment", "--confirm", "--confirm-publish-or-deploy"] }).mode, "publish/deploy-capable");
});
