import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildDryRunPlan, validateEnvironmentUrl, validateRegistrationManifest } from "../scripts/dataverse/register-actual-totals-plugin.mjs";

const manifestPath = new URL("../docs/d365/phase1c-5r2b-plugin-registration-manifest.json", import.meta.url);

test("registration dry-run accepts only the approved test hostname", () => {
  assert.equal(validateEnvironmentUrl("https://org91f5f65f.crm5.dynamics.com"), "https://org91f5f65f.crm5.dynamics.com");
  assert.throws(() => validateEnvironmentUrl("https://lcn-crm.crm7.dynamics.com"), /permanently blocked/);
  assert.throws(() => validateEnvironmentUrl("https://example.crm.dynamics.com"), /approved test hostname/);
  assert.throws(() => validateEnvironmentUrl("http://org91f5f65f.crm5.dynamics.com"), /approved HTTPS/);
});

test("registration manifest is seven-step, fourteen-filter, disabled, and seed-blocked", async () => {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  validateRegistrationManifest(manifest);
  assert.equal(manifest.steps.length, 7);
  assert.equal(manifest.filteringAttributes.length, 14);
  assert.equal(manifest.steps.filter((step) => step.message === "Update").length, 3);
  assert.ok(manifest.steps.find((step) => step.message === "Delete").images.some((image) => image.alias === "PreImage"));
  assert.equal(manifest.artifact.publicKeyToken, "0350f79ae25dc991");
  assert.equal(manifest.seedBlocked, true);
});

test("dry-run verifies a synthetic DLL offline and performs zero network requests", async () => {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "actual-totals-registration-"));
  const dll = Buffer.from("synthetic offline plugin artifact");
  const sha256 = crypto.createHash("sha256").update(dll).digest("hex");
  const testManifest = structuredClone(manifest);
  testManifest.artifact.sha256 = sha256;
  testManifest.artifact.source = "synthetic/CrmAiGateway.ActualTotals.Plugin.dll";
  const dllPath = path.join(temporaryDirectory, "CrmAiGateway.ActualTotals.Plugin.dll");
  const localManifestPath = path.join(temporaryDirectory, "manifest.json");
  await fs.writeFile(dllPath, dll);
  await fs.writeFile(localManifestPath, JSON.stringify(testManifest));
  await fs.writeFile(path.join(temporaryDirectory, "assembly-inspection.json"), JSON.stringify({
    passed: true,
    assemblyName: "CrmAiGateway.ActualTotals.Plugin",
    strongNameSigned: true,
    publicKeyToken: "0350f79ae25dc991",
    sha256
  }));
  const plan = await buildDryRunPlan({
    environmentUrl: "https://org91f5f65f.crm5.dynamics.com",
    dllPath,
    manifestPath: localManifestPath,
    expectedSha256: sha256,
    expectedPublicKeyToken: "0350f79ae25dc991"
  });
  assert.equal(plan.dryRun, true);
  assert.equal(plan.writesExecuted, false);
  assert.equal(plan.networkRequests, 0);
  assert.equal(plan.steps.length, 7);
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

test("dry-run does not expose an online registration branch", async () => {
  const source = await fs.readFile(new URL("../scripts/dataverse/register-actual-totals-plugin.mjs", import.meta.url), "utf8");
  assert.match(source, /Online registration is intentionally unavailable/);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /createDynamicsClient/);
  assert.doesNotMatch(source, /PluginRegistration|AddSolutionComponent|OrganizationService/);
});
