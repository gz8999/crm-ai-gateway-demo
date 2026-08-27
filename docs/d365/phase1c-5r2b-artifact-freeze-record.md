# Phase 1C-5R2B Artifact Freeze Record

This is an offline record. No Dataverse authentication, request, registration, enablement, publish, or data write was performed.

| Property | Frozen value |
|---|---|
| GitHub Actions run | `29157898543` |
| Successful CI commit | `8ab2b5d17de64d6a99adaaa57caf9de1d6d868e9` |
| DLL | `CrmAiGateway.ActualTotals.Plugin.dll` |
| Assembly | `CrmAiGateway.ActualTotals.Plugin` |
| Target framework | `net462` |
| Configuration | `Release` |
| SHA-256 | `a02db984606827396467b7311f3024b586e33f4d3a024e3cb240e39ba91c6b7d` |
| Public key token | `0350f79ae25dc991` |
| Node tests in CI | `101/101` |
| xUnit | `23/23`, failed `0`, skipped `0` |
| Dependency allowlist | Passed; Microsoft.Xrm.Sdk plus framework assemblies only |
| Assembly inspection | Passed; three expected Plugin types, no custom Core DLL |
| Secret scan | Passed |

The verified Artifact contains exactly the DLL and five verification JSON/text files. It contains no SNK, PDB, credentials, connection string, environment metadata snapshot, or business data. The downloaded directory remains ignored by Git.

## Frozen Plugin Types

1. `CrmAiGateway.ActualTotals.Plugin.ActualTotalsPreValidationPlugin`
2. `CrmAiGateway.ActualTotals.Plugin.ActualTotalsPreOperationPlugin`
3. `CrmAiGateway.ActualTotals.Plugin.ActualTotalsPostOperationPlugin`

The assembly is ready for a future, separately authorized test-environment registration. It has not been registered.
