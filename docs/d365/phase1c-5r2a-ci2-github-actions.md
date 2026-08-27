# Phase 1C-5R2A-CI2 Windows CI Runbook

This runbook prepares the Actual Totals Plugin for Windows CI only. It does not connect to Dataverse, register a Plugin, publish metadata, or seed records.

## 1. Initialize And Push Git

The current project directory is not a Git worktree and has no GitHub remote. Run these commands from the repository root after creating an empty private GitHub repository:

```text
git init
git branch -M main
git add .
git status
git commit -m "Add Actual Totals Windows CI"
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

Review `git status` before the first commit. Do not commit `.env`, `*.snk`, `plugins/ActualTotals/.ci/`, `plugins/ActualTotals/artifacts/`, `bin/`, `obj/`, or `backups/dataverse/`.

## 2. Generate The Stable Demo Key Once

Run on a controlled Windows machine with the Strong Name tool available. Do not run this inside the repository and do not print the Base64 value:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\ActualTotalsDemoSigning" | Out-Null
Set-Location "$env:USERPROFILE\ActualTotalsDemoSigning"
sn.exe -k ActualTotals.Demo.snk
$snkBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("ActualTotals.Demo.snk"))
$snkBase64 | Set-Clipboard
```

Keep one protected backup of `ActualTotals.Demo.snk` in an approved secret vault. Losing or replacing it changes the public key token and breaks stable assembly identity.

## 3. Add The GitHub Secret

In GitHub, open `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`.

- Name: `ACTUAL_TOTALS_SNK_BASE64`
- Secret: paste the clipboard value

Alternatively, with GitHub CLI authenticated on the controlled Windows machine:

```powershell
gh secret set ACTUAL_TOTALS_SNK_BASE64 --body $snkBase64
$snkBase64 = $null
Set-Clipboard -Value ""
```

The workflow fails when this secret is absent or invalid. It never generates a random fallback key.

## 4. Run The Workflow

The workflow runs for pull requests, pushes to `main` affecting relevant files, and manual dispatch.

For a manual run: open `Actions` -> `Actual Totals Plugin Windows CI` -> `Run workflow` -> select `main` -> `Run workflow`.

## 5. Download And Review The Artifact

Open the completed workflow run and download `actual-totals-plugin-windows-release`. It must contain exactly:

- `CrmAiGateway.ActualTotals.Plugin.dll`
- `build-manifest.json`
- `plugin-sha256.txt`
- `dependency-list.json`
- `test-summary.json`
- `assembly-inspection.json`

It must not contain an SNK, PDB, `bin/`, `obj/`, NuGet cache, connection string, Dataverse URL, or API key.

## 6. Evidence Required For The Next Review

Provide these results before Phase 1C-5R2B:

- GitHub workflow run URL and conclusion
- `build-manifest.json`
- `plugin-sha256.txt`
- `test-summary.json`
- `assembly-inspection.json`
- `dependency-list.json`
- confirmation that the public key token matches the approved stable Demo identity
- confirmation that `deployable` is `true`

Do not register or deploy the DLL during this phase. Synthetic Actual Management seed data remains blocked.
