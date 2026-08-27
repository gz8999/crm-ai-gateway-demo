import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/actual-totals-plugin-windows-ci.yml", import.meta.url);
const scriptPath = new URL("../plugins/ActualTotals/scripts/Invoke-WindowsCi.ps1", import.meta.url);
const projectPath = new URL("../plugins/ActualTotals/src/CrmAiGateway.ActualTotals.Plugin/CrmAiGateway.ActualTotals.Plugin.csproj", import.meta.url);
const manifestPath = new URL("../docs/d365/phase1c-5r2a-ci-manifest.json", import.meta.url);

test("ActualTotals workflow uses Windows and runs real .NET restore, test, build, and artifact upload", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const script = await readFile(scriptPath, "utf8");

  assert.match(workflow, /runs-on:\s*windows-latest/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:[\s\S]*branches:[\s\S]*- main/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(script, /dotnet restore \$testProject/);
  assert.match(script, /dotnet test \$testProject/);
  assert.match(script, /dotnet build \$pluginProject/);
  assert.match(script, /CrmAiGateway\.ActualTotals\.Plugin\.dll/);
});

test("ActualTotals CI keeps net462 Plugin output singular, signed, and free of deployment calls", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const script = await readFile(scriptPath, "utf8");
  const project = await readFile(projectPath, "utf8");

  assert.match(project, /<TargetFramework>net462<\/TargetFramework>/);
  assert.match(project, /<DebugType>None<\/DebugType>/);
  assert.match(script, /SignAssembly=true/);
  assert.match(workflow, /ACTUAL_TOTALS_SNK_BASE64:\s*\$\{\{ secrets\.ACTUAL_TOTALS_SNK_BASE64 \}\}/);
  assert.match(script, /ACTUAL_TOTALS_SNK_BASE64 is required/);
  assert.match(script, /FromBase64String/);
  assert.doesNotMatch(script, /\s-k\s+\$keyPath/);
  assert.match(script, /Remove-Item \$keyPath -Force/);
  assert.match(script, /oneCustomPluginDllOnly/);
  assert.doesNotMatch(`${workflow}\n${script}`, /pac\s+auth|AddSolutionComponent|PluginRegistration|crm5\.dynamics\.com/i);
  assert.doesNotMatch(script, /Copy-Item \$builtPdb/);
  assert.doesNotMatch(script.match(/\$expectedArtifacts = @[\s\S]*?\n    \)/)?.[0] ?? "", /\.pdb|\.snk/);
  assert.match(script, /stablePublicKeyTokenPresent/);
  assert.match(script, /deployable = \$deployable/);
});

test("ActualTotals CI manifest remains local-only and seed-blocked", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  assert.equal(manifest.runner, "windows-latest");
  assert.equal(manifest.dataverse.connected, false);
  assert.equal(manifest.dataverse.registration, false);
  assert.equal(manifest.dataverse.deployment, false);
  assert.equal(manifest.dataverse.dataWrites, false);
  assert.equal(manifest.seedBlocked, true);
  assert.deepEqual(manifest.artifactFiles.filter((file) => file.endsWith(".dll")), ["CrmAiGateway.ActualTotals.Plugin.dll"]);
  assert.equal(manifest.signing.secretRequired, "ACTUAL_TOTALS_SNK_BASE64");
  assert.equal(manifest.signing.randomFallback, false);
  assert.deepEqual(new Set(manifest.artifactFiles), new Set([
    "CrmAiGateway.ActualTotals.Plugin.dll",
    "build-manifest.json",
    "plugin-sha256.txt",
    "dependency-list.json",
    "test-summary.json",
    "assembly-inspection.json"
  ]));
});
