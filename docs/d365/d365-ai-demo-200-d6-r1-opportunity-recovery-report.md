# Phase 1C-5R2G-D6-R1 Opportunity Recovery

## Result

- Execution scope: **Opportunity only**
- Recovery authorization: **true**
- Recovery baseline: **595 explicit records / 28 Opportunities / 28 target BPF instances**
- First recovery token: **DEMO-OPP-005**
- Opportunity recovery: **172 attempted / 172 created / 0 reused / 0 failed**
- Final Opportunity count: **200**
- Final target BPF count: **200**
- P0 / P1 / P2: **0 / 0 / 0**
- Production requests / External LLM calls: **0 / 0**

## Recovery execution

The executor resumed from the exact private manifest and used the repaired Formal-wide Location and POL/POD lookup resolution. It did not recreate Account, Contact, DEMO-OPP-001 through DEMO-OPP-004, any existing Opportunity, or any BPF instance.

| Batch | First token | Expected | Created | Failed |
|---|---|---:|---:|---:|
| O1-R1 | DEMO-OPP-005 | 18 | 18 | 0 |
| O2 | DEMO-OPP-025 | 22 | 22 | 0 |
| O3 | DEMO-OPP-051 | 22 | 22 | 0 |
| O4 | DEMO-OPP-075 | 22 | 22 | 0 |
| O5 | DEMO-OPP-101 | 22 | 22 | 0 |
| O6 | DEMO-OPP-123 | 22 | 22 | 0 |
| O7 | DEMO-OPP-151 | 22 | 22 | 0 |
| O8 | DEMO-OPP-175 | 22 | 22 | 0 |

## Final exact readback

- Explicit records currently represented in the Exact ID Manifest: **767**
- Account / Contact / Opportunity: **60 / 120 / 200**
- ServiceCoverage / ActualManagement / Timeline / InteractionSignal: **15 / 12 / 206 / 154**
- Opportunity Won / Active / Lost: **7 / 192 / 1**
- OpportunityClose total / duplicate / attachment: **8 / 0 / 0**
- Target BPF / initial stage / duplicate / unexpected process: **200 / 200 / 0 / 0**
- BPF definition and process order: **unchanged / 0**
- Plugin enabled / disabled: **7 / 0**

## R1 request delta

- Preflight GET: **869**
- Business CRM GET: **1191**
- Platform GET: **888**
- Security GET: **12**
- OpportunityClose GET: **300**
- Opportunity POST: **172**
- Account / Contact / Coverage / Actual / Timeline / Signal POST: **0 / 0 / 0 / 0 / 0 / 0**
- WinOpportunity / LoseOpportunity: **0 / 0**
- PATCH / DELETE / Publish / BPF writes: **0 / 0 / 0 / 0**
- Team, role, or membership changes: **0**
- Production requests / External LLM calls: **0 / 0**

GET categories are audit tags and may overlap; they must not be summed as a network request total.

## Authorization boundary

This run did not import ServiceCoverage, ActualManagement, Timeline, or InteractionSignal. It did not perform WinOpportunity, LoseOpportunity, Cleanup, or Gateway full-dataset integration. The full D6 import remains incomplete and requires a separate continuation authorization.

## Gates

- D6R1OpportunityRecoveryAuthorized=**true**
- D6R1BaselineReady=**true**
- D6R1OpportunityRecoveryCompleted=**true**
- OpportunityImportReady=**true**
- NewOpportunityCount=**176**
- NewTargetBPFCount=**176**
- TotalTargetBPFCount=**200**
- CoverageAuthorized=**false**
- ActualAuthorized=**false**
- TimelineAuthorized=**false**
- SignalAuthorized=**false**
- StateActionsAuthorized=**false**
- BaseFullDataImportCompleted=**false**
- CleanupAuthorized=**false**
- CleanupExecuted=**false**
- GatewayFullDatasetIntegrationReady=**false**
- ProductionIsolationReady=**true**
- FullImportCompleted=**false**
- FullImportClosed=**false**
