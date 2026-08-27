# Phase 1C-5R2G-D6 Remaining 176 Full Import

## Result

- Initial execution status: **FAILED SAFE STOP** at DEMO-OPP-005
- D6-R1 recovery status: **OPPORTUNITY RECOVERY COMPLETED**
- Full Import Authorized: **true**
- Full Import Completed / Closed: **false / false**
- Current P0 / P1 / P2: **0 / 0 / 0**
- Cleanup Authorized / Executed: **false / false**
- Production Requests / External LLM Calls: **0 / 0**

## Complement

- Exact set rule: Formal Projection minus Compact Pilot
- Counts: Account 53, Contact 111, Opportunity 176, Coverage 225, Actual 118, Timeline 1594, Signal 1196
- Explicit complement: 3473
- Pilot overlap / missing Formal token / duplicate token / missing parent: 0 / 0 / 0 / 0
- Remaining workbook: artifacts/d365/CRM_AI_Gateway_D365_Demo_200_Remaining176_v1.xlsx
- Size / SHA-256: 553212 / 52eda768b1bcabc711fd496ef2c20340a25b923e17bbf007904b05de1ceec855

## Execution

| Object | Attempt | Created | Reused | Failed | Current exact total |
|---|---:|---:|---:|---:|---:|
| Account | 53 | 53 | 0 | 0 | 60 |
| Contact | 111 | 111 | 0 | 0 | 120 |
| Opportunity | 5 | 4 | 0 | 1 | 28 |
| ServiceCoverage | 0 | 0 | 0 | 0 | 15 |
| ActualManagement | 0 | 0 | 0 | 0 | 12 |
| Timeline | 0 | 0 | 0 | 0 | 206 |
| InteractionSignal | 0 | 0 | 0 | 0 | 154 |

A1, A2 and C1-C4 completed. O1 stopped on its fifth token. No later batch or state action ran.

## Blocker and recovery evidence

- Failed token: **DEMO-OPP-005**
- Root cause: the executor reused the Pilot-only Location cache. The Formal Location '29: Suzhou' was not in that cache, producing an empty Lookup reference.
- Failed-token residual records: **0**
- Reference master result: **17/17 Location and 11/11 POL/POD resolve exactly once**
- '29: Suzhou': **resolved exactly once**
- Executor repair: Formal-wide dynamic reference readback plus exact-cardinality and non-empty bind gates.
- Resume status: **not authorized in this execution**. A new controlled recovery approval is required.

## Partial exact readback

- Explicit records: **595**
- Account / Contact / Opportunity / Coverage / Actual / Timeline / Signal: **60 / 120 / 28 / 15 / 12 / 206 / 154**
- Opportunity state Won / Active / Lost: **7 / 20 / 1**
- OpportunityClose Win / Lose / Total: **7 / 1 / 8**
- BPF Target / initial stage / duplicate / unexpected: **28 / 28 / 0 / 0**
- New OpportunityClose: **0**

## Requests and safety

- GET total: 1211 (preflight is a tagged subset, not added twice)
- Account / Contact / Opportunity POST attempts: 53 / 111 / 5
- Opportunity POST success / failed: 4 / 1
- Coverage / Actual / Timeline / Signal POST: 0 / 0 / 0 / 0
- Win / Lose: 0 / 0
- PATCH / DELETE / Publish / BPF writes / Team-Role changes: 0 / 0 / 0 / 0 / 0
- Production requests / External LLM calls: 0 / 0
- Existing non-Demo data modified: **false**
- Gateway files modified: **false**

## Local verification

- `npm test`: **448/448 passed**
- `npm run build`: **passed**, including production bundle isolation
- `git diff --check`: **passed**
- Sensitive scan: **passed**; public D6 outputs contain no GUID, credential, real identity, absolute user path, or production hostname
- XLSX ZIP integrity / re-import / formula scan: **passed / passed / 0 formulas and 0 formula errors**
- Gateway source diff: **0 files**

## Gates

- FullImportAuthorized=**true**
- ComplementManifestReady=**true**
- RemainingTokenOverlapCount=**0**
- RemainingExplicitRecordCount=**3473**
- AccountImportReady=**true**
- ContactImportReady=**true**
- OpportunityImportReady=**false**
- NewOpportunityCount=**4**
- NewTargetBPFCount=**4**
- TotalTargetBPFCount=**28**
- CoverageImportReady=**false**
- ActualImportReady=**false**
- TimelineImportReady=**false**
- SignalImportReady=**false**
- BaseFullDataImportCompleted=**false**
- RemainingWinCandidateCount=**84**
- RemainingLoseCandidateCount=**8**
- RemainingStateActionsCompleted=**false**
- FinalStateDistributionReady=**false**
- OpportunityCloseFinalReady=**false**
- FullExactReadbackReady=**false**
- PartialExactReadbackReady=**true**
- FullExactIDManifestReady=**false**
- PartialExactIDManifestReady=**true**
- FullCleanupManifestReady=**false**
- CleanupAuthorized=**false**
- CleanupExecuted=**false**
- ExistingNonDemoDataModified=**false**
- ProductionIsolationReady=**true**
- GatewayFullDatasetIntegrationReady=**false**
- FullImportCompleted=**false**
- FullImportClosed=**false**

## D6-R1 controlled recovery

The initial safe-stop evidence above is retained as history. Under the later D6-R1 authorization, the executor resumed from DEMO-OPP-005 using the existing 595-record Exact ID Manifest and the repaired Formal-wide reference resolution.

- Recovery Opportunity attempt / created / reused / failed: **172 / 172 / 0 / 0**
- Completed batches: **O1-R1, O2, O3, O4, O5, O6, O7, O8**
- Final Opportunity / target BPF: **200 / 200**
- Initial-stage BPF / duplicate / unexpected process: **200 / 0 / 0**
- Final explicit manifest records: **767**
- Final state Won / Active / Lost: **7 / 192 / 1**
- OpportunityClose total: **8**
- Coverage / Actual / Timeline / Signal writes: **0 / 0 / 0 / 0**
- Win / Lose / PATCH / DELETE / Publish / BPF writes: **0 / 0 / 0 / 0 / 0 / 0**
- Production requests / External LLM calls: **0 / 0**

D6-R1 completes only the Opportunity stage. Coverage, Actual, Timeline, Signal, state actions, Cleanup, and Gateway full-dataset integration remain unauthorized and incomplete.

## D6-R2 Coverage and Actual controlled import

D6-R1 baseline was frozen in commit `24a0bad735843680a27cb37e3d55c9214f22df27`. Under D6-R2 authorization, the executor imported only the remaining Coverage and Actual complements.

- Coverage: attempt / created / reused / failed / final = **225 / 225 / 0 / 0 / 240**
- Actual: attempt / created / reused / failed / final = **118 / 118 / 0 / 0 / 130**
- Coverage Canaries: **COV-002 / COV-004**, both passed
- Actual Canary: **ACT-001**, passed
- Coverage per Account: **4**
- One Actual per Opportunity: **true**
- Parent Opportunity sync / unexpected business changes: **118 / 0**
- Explicit records: **1110**
- State: Won / Active / Lost = **7 / 192 / 1**
- BPF target / initial / duplicate / unexpected = **200 / 200 / 0 / 0**
- Timeline / Signal delta = **0 / 0**
- Timeline, Signal, Win/Lose, Cleanup and Gateway full-dataset integration remain incomplete and unauthorized.

## D6-R3 Timeline/Signal controlled import

- Result: **FAILED SAFE STOP** after one successful Timeline Canary exact readback.
- No Signal, state action, cleanup or retry was performed.
- See `d365-ai-demo-200-d6-r3-timeline-signal-import-report.md` for the public failure evidence.

## D6-R3A Timeline/Signal resume

- Result: **FAILED SAFE STOP** at TL-0653.
- Current Timeline / Signal: **1568 / 154**.
- Full Import remains incomplete; state actions and Cleanup remain deferred.

## D6-R3B Timeline/Signal completion

- Frozen Annotation reference date: **2026-07-18**.
- TL-0653 completed as **SameDayBodyDate** without system date fields.
- Timeline / Signal: **1800 / 1350**; explicit records: **3900**.
- Opportunity state and BPF remain **7/192/1** and **200/200/0/0**.
- Remaining 84 Win and 8 Lose actions, Cleanup and Gateway full-dataset integration remain deferred.
