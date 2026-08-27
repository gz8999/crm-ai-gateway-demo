import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptPath = new URL("../plugins/ActualTotals/scripts/Invoke-WindowsCi.ps1", import.meta.url);
const gitignorePath = new URL("../.gitignore", import.meta.url);

test("Plugin packaging creates and safely rebuilds only artifacts Release", async () => {
  const script = await readFile(scriptPath, "utf8");
  assert.match(script, /\$ErrorActionPreference = "Stop"/);
  assert.match(script, /function Assert-SafeReleaseDirectory/);
  assert.match(script, /function Initialize-ReleaseDirectory/);
  assert.match(script, /IsNullOrWhiteSpace\(\$ReleaseDirectory\)/);
  assert.match(script, /outside the repository/);
  assert.match(script, /outside the ActualTotals artifact root/);
  assert.match(script, /must end exactly at artifacts\/Release/);
  assert.match(script, /Refusing to clean a protected repository or Plugin directory/);
  assert.match(script, /Remove-Item -LiteralPath \$safeRelease -Recurse -Force/);
  assert.match(script, /New-Item -ItemType Directory -Path \$safeRelease -Force/);
  assert.match(script, /Test-Path -LiteralPath \$safeRelease -PathType Container/);
  assert.doesNotMatch(script, /Remove-Item\s+\$repo\b/);
  assert.doesNotMatch(script, /Remove-Item\s+\$pluginRoot\b/);
});

test("Plugin packaging copies only the DLL and validates six exact outputs", async () => {
  const script = await readFile(scriptPath, "utf8");
  assert.match(script, /Assert-ArtifactFile \$builtDll "Expected Plugin DLL"/);
  assert.match(script, /Copy-Item -LiteralPath \$builtDll -Destination \$artifactDll/);
  assert.doesNotMatch(script, /Copy-Item[^\n]*(?:\.pdb|\.snk|bin\/Release|bin\\Release)/i);
  assert.match(script, /Release artifact must not contain nested directories/);
  assert.match(script, /Release artifact must contain exactly six files/);
  const expected = script.match(/\$expectedArtifacts = @\(([\s\S]*?)\n    \)/)?.[1] ?? "";
  const names = [...expected.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(names.sort(), [
    "CrmAiGateway.ActualTotals.Plugin.dll",
    "assembly-inspection.json",
    "build-manifest.json",
    "dependency-list.json",
    "plugin-sha256.txt",
    "test-summary.json",
  ].sort());
});

test("Plugin artifact output remains ignored and machine-relative", async () => {
  const [script, gitignore] = await Promise.all([readFile(scriptPath, "utf8"), readFile(gitignorePath, "utf8")]);
  assert.match(gitignore, /^plugins\/ActualTotals\/artifacts\/$/m);
  assert.doesNotMatch(script, /[A-Z]:\\Users\\|\/Users\/|\/tmp\//i);
  assert.match(script, /\$repo = \(Resolve-Path \$RepositoryRoot\)\.Path/);
  assert.match(script, /\$artifactRoot = \[IO\.Path\]::GetFullPath/);
});
