import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readinessPath = new URL("../docs/d365/phase1c-5r2b-online-deployment-readiness.md", import.meta.url);
const deploymentPlanPath = new URL("../docs/d365/phase1c-5r2c-online-test-deployment-plan.md", import.meta.url);
const registrationManifestPath = new URL("../docs/d365/phase1c-5r2b-plugin-registration-manifest.json", import.meta.url);

test("online deployment readiness is offline, seed-blocked, and tied to the verified assembly", async () => {
  const readiness = await readFile(readinessPath, "utf8");

  assert.match(readiness, /CI Ready: yes\. Online deployment prepared: yes\. Deployment executed: no\./);
  assert.match(readiness, /a02db984606827396467b7311f3024b586e33f4d3a024e3cb240e39ba91c6b7d/);
  assert.match(readiness, /0350f79ae25dc991/);
  assert.match(readiness, /Synthetic seed remains blocked/);
  assert.equal((readiness.match(/^\| [1-7] \| (?:PreValidation|PreOperation|PostOperation) \|/gm) ?? []).length, 7);
  assert.match(readiness, /seven disabled steps/);
});

test("online test deployment plan keeps the test allowlist and production denylist explicit", async () => {
  const plan = await readFile(deploymentPlanPath, "utf8");

  assert.match(plan, /https:\/\/org91f5f65f\.crm5\.dynamics\.com/);
  assert.match(plan, /https:\/\/lcn-crm\.crm7\.dynamics\.com/);
  assert.match(plan, /Production is always denied/);
  assert.match(plan, /does not need source code, the DLL, Visual Studio, VS Code, \.NET SDK, Mono, Power Platform CLI, or Plugin Registration Tool/);
  assert.match(plan, /Keep the 100-record seed blocked/);
});

test("registration build sheet remains seven-step and uses only the approved Update filters", async () => {
  const manifest = JSON.parse(await readFile(registrationManifestPath, "utf8"));
  const expectedFilters = [
    "aigw_aprilactualrevenue",
    "aigw_mayactualrevenue",
    "aigw_juneactualrevenue",
    "aigw_julyactualrevenue",
    "aigw_augustactualrevenue",
    "aigw_septemberactualrevenue",
    "aigw_octoberactualrevenue",
    "aigw_novemberactualrevenue",
    "aigw_decemberactualrevenue",
    "aigw_januaryactualrevenue",
    "aigw_februaryactualrevenue",
    "aigw_marchactualrevenue",
    "aigw_opportunityid",
    "transactioncurrencyid",
  ];

  assert.equal(manifest.dryRun, true);
  assert.equal(manifest.executable, false);
  assert.equal(manifest.registrationAuthorized, false);
  assert.equal(manifest.steps.length, 7);
  assert.deepEqual(manifest.filteringAttributes, expectedFilters);
  assert.ok(manifest.preDeploymentGates.includes("Phase 1C-5 seed remains blocked"));
});
