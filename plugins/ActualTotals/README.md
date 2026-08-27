# Actual Totals Dataverse Plugin

Local-only Phase 1C-5R2A implementation. It contains no connection strings and does not connect to Dataverse during build or tests.

## Projects

- `CrmAiGateway.ActualTotals.Core`: offline domain logic (`netstandard2.0`).
- `CrmAiGateway.ActualTotals.Plugin`: thin Dataverse `IPlugin` adapters (`net462`); it links the Core source into the same deployment DLL so Dataverse does not need a second custom assembly.
- `CrmAiGateway.ActualTotals.Core.Tests`: offline xUnit tests (`net8.0`).

The plugin writes only `aigw_actualmanagement.aigw_annualactualrevenue` in the PreOperation Target and `opportunity.aigw_yearrevenueactual` in PostOperation. It never writes CNY or `_base` fields.

## Local commands

```text
dotnet test plugins/ActualTotals/tests/CrmAiGateway.ActualTotals.Core.Tests/CrmAiGateway.ActualTotals.Core.Tests.csproj
dotnet build plugins/ActualTotals/src/CrmAiGateway.ActualTotals.Plugin/CrmAiGateway.ActualTotals.Plugin.csproj -c Release
```

The current development machine must provide a compatible .NET SDK. No SDK path is hard-coded in this repository.
