# Phase 1C-5R2G-D5 Compact Pilot Controlled Import

- Environment: TEST-ORG
- C1 Authorized: **true**
- Full Import Started: **false**
- Cleanup Executed: **false**
- Production Requests: **0**
- External LLM Calls: **0**

## Current final status

- Pilot Import Completed: **true**
- Pilot State Actions Completed: **true**
- Explicit Pilot Records: **427/427**
- Final Won / Active / Lost: **7 / 16 / 1**
- Win / Lose OpportunityClose: **7 / 1**
- Target / Duplicate / Unexpected BPF: **24 / 0 / 0**
- Pilot Exact ID Manifest Ready: **true** (ignored private artifact)
- Pilot Cleanup Manifest Ready / Authorized / Executed: **true / false / false**
- Full Import Started / Ready / Authorized: **false / false / false**

The following sections preserve the historical stop-and-resume record. The current outcome is the final status above and the D5-R4 section at the end of this report.

## Workbook integrity

- Formal: 570890 bytes / af40bede1df13eb40ef5718f657d21ba570d1cc29feed5a9848616ddf5fbedea
- Compact Pilot: 90392 bytes / 789e0c620199481c4de4532d14479b075a14d32eb375b20971723b3284fc1e36

## Canary

- Token: DEMO-OPP-015
- Chain: Account 1 / Contact 1 / Opportunity 1 / Coverage 2 / Actual 1 / Timeline 12 / Signal 9
- Ready: **false**
- Partial write before stop: Account 1 / Contact 1 / Opportunity 1
- Blocking readback: target BPF backing row **1**
- Opportunity remained Active: **statecode/statuscode 0/1**, actualclosedate blank

## Import statistics

| Entity | Attempt | Created | Reused | Failed |
|---|---:|---:|---:|---:|
| Account | 1 | 1 | 0 | 0 |
| Contact | 1 | 1 | 0 | 0 |
| Opportunity | 1 | 1 | 0 | 0 |
| ServiceCoverage | 0 | 0 | 0 | 0 |
| ActualManagement | 0 | 0 | 0 | 0 |
| Timeline | 0 | 0 | 0 | 0 |
| InteractionSignal | 0 | 0 | 0 | 0 |

## State actions

- Win: 0/7
- Lose: 0/1
- Final: null
- Direct state/status/actualclosedate PATCH: **0**

## Data and safety

- Exact readback: 3/427
- Plugin: {"enabled":7,"disabled":0,"ready":true}
- BPF rows: **1** (platform-created Canary side effect; exact ID remains private)
- Coverage, Actual, Timeline and Signal import did not start, so no activity state handling occurred.
- Existing non-Pilot business data modified: **false**
- Business Data Delta: Account +1 / Contact +1 / Opportunity +1 / target BPF instance +1

## Requests

```json
{
  "preflightGET": 339,
  "businessCRMGET": 8,
  "platformGET": 17,
  "AccountPOST": 1,
  "ContactPOST": 1,
  "OpportunityPOST": 1,
  "CoveragePOST": 0,
  "ActualPOST": 0,
  "TimelinePOST": 0,
  "SignalPOST": 0,
  "WinOpportunity": 0,
  "LoseOpportunity": 0,
  "PATCH": 0,
  "DELETE": 0,
  "Publish": 0,
  "teamRoleMembershipChanges": 0,
  "productionRequests": 0,
  "externalLLMCalls": 0
}
```

## P0/P1/P2

- P0: **0**
- P1: **1**
- P2: **0** (Timeline activity completion state was not forced.)

## Gates

- c1PilotImportAuthorized: **true**
- pilotPreflightReady: **true**
- canaryReady: **false**
- accountImportReady: **false**
- contactImportReady: **false**
- opportunityImportReady: **false**
- coverageImportReady: **false**
- actualImportReady: **false**
- timelineImportReady: **false**
- signalImportReady: **false**
- winActionReady: **false**
- loseActionReady: **false**
- pilotImportCompleted: **false**
- pilotExactReadbackReady: **false**
- pilotStateDistributionReady: **false**
- pilotExactIdManifestReady: **false**
- partialExactIdManifestReady: **true**
- pilotCleanupReady: **false**
- pilotCleanupAuthorized: **false**
- cleanupExecuted: **false**
- existingBusinessDataModified: **false**
- pilotScopeExceeded: **false**
- fullImportStarted: **false**
- productionIsolationReady: **true**
- fullImportReady: **false**
- fullImportAuthorized: **false**

## Blockers

- Platform automatically created one target BPF instance for the Canary Opportunity. The hard no-BPF Canary gate failed, so all child stages and state actions stopped.

## D5-R1 BPF Contract Reconciliation and Base Resume

- BPF auto-instance contract accepted: true
- Canary Account/Contact/Opportunity/BPF reused: true
- Explicit Pilot Records Ready: 245/427
- Target / Duplicate / Unexpected BPF: 24 / 0 / 0
- Active Opportunity: 24/24
- Coverage / Actual: 15/15 / 12/12
- Timeline / Signal: 178/206 / 0/154
- Current blocker: future-dated Annotation TL-1630 rejected with HTTP 400; residual 0
- Base Pilot Data Import Completed: false
- Win/Lose: 0/0 (deferred)
- Cleanup / Full Import Authorized: false / false
- P0/P1/P2: 0/1/1

## D5-R1A Future Annotation Date Repair and Base Completion

- Future Annotation Date Contract: **Resolved**
- TL-1630 corrected POST / success: **1 / 1**
- Future Annotation count: **4**
- Timeline: **206/206**, final failed 0, historical server rejection retained 1
- Interaction Signal: **154/154**, missing source 0
- Explicit Pilot Records: **427/427**
- Opportunities: **Active 24 / Won 0 / Lost 0**
- Target BPF: **24**, duplicate 0, unexpected 0, initial stage 24
- Plugin: **7/0**
- Win/Lose/Cleanup/Full Import: **not authorized**
- P0/P1/P2: **0/0/1**

## D5-R2 Single WinOpportunity State Action Canary

- Target: `DEMO-OPP-015`
- Official WinOpportunity attempts / successes: **1 / 1**
- Result: **HTTP 204**, Status 3
- Actual Revenue / Actual End: **3898 / 2026-05-01**
- Opportunity state: **0/1 -> 1/3**
- OpportunityClose: **0 -> 1**, attachments 0
- Imported Timeline: **12 -> 12**; Activity aggregate: **9 -> 10**
- Target BPF: same instance, stage and path; classification **A / None**
- Pilot distribution: **Won 1 / Active 23 / Lost 0**
- Explicit Pilot records: **427/427**
- Non-Canary business-data hash: **unchanged**
- Plugin: **7/0**
- PATCH / DELETE / Publish / BPF writes: **0/0/0/0**
- Production requests / External LLM calls: **0/0**
- P0/P1/P2: **0/0/0**
- Remaining Win/Lose, Cleanup and Full Import: **not authorized**

## D5-R3 Single LoseOpportunity State Action Canary

- Target selected automatically from frozen plan: `DEMO-OPP-026`
- Frozen Lost Status / Actual End / Lost Reason: **4 / 2026-05-18 / 07: 提案细节**
- Official LoseOpportunity attempts / successes: **1 / 1**
- Result: **HTTP 204**
- Opportunity state: **0/1 -> 2/4**
- OpportunityClose: **0 -> 1**, Actual Revenue blank, attachments 0
- Imported Timeline: **10 -> 10**; Activity aggregate: **8 -> 9**
- Actual / Signal / Coverage / Account / Contact: **unchanged**
- Target BPF: same instance, state, status, stage and path; classification **A / None**
- D5-R2 Win Canary: **unchanged**
- Pilot distribution: **Won 1 / Active 22 / Lost 1**
- Explicit Pilot records / Target BPF: **427 / 24**
- Duplicate BPF / Unexpected Process: **0 / 0**
- Plugin: **7/0**
- PATCH / DELETE / Publish / BPF writes / other state actions: **0/0/0/0/0**
- Production requests / External LLM calls: **0/0**
- P0/P1/P2: **0/0/0**
- Remaining six Win actions, Cleanup and Full Import: **not authorized**

## D5-R4 Remaining Six Win Actions and Pilot Finalization

- Automatically selected, stable order: `DEMO-OPP-028`, `DEMO-OPP-038`, `DEMO-OPP-130`, `DEMO-OPP-135`, `DEMO-OPP-181`, `DEMO-OPP-199`
- Official WinOpportunity attempts / successes: **6 / 6**
- HTTP status: **204 for all six**
- Per-action OpportunityClose: **1**, attachments **0**
- Per-action BPF classification: **A / None for all six**
- Final state distribution: **Won 7 / Active 16 / Lost 1**
- OpportunityClose: **Win 7 / Lose 1 / Total 8**
- Explicit Pilot records: **427/427**
- Timeline / Signal / Actual / Coverage: **206 / 154 / 12 / 15**
- Target / Duplicate / Unexpected BPF: **24 / 0 / 0**, initial stage **24/24**
- Protected business hash: **unchanged**, mismatch count **0**
- BPF definition hash and Process Order: **unchanged / 0**
- Plugin: **7/0**
- PATCH / DELETE / Publish / BPF writes / LoseOpportunity: **0/0/0/0/0**
- Production requests / External LLM calls: **0/0**
- P0/P1/P2: **0/0/0**
- Pilot State Actions Completed / Pilot Import Completed: **true / true**
- Cleanup Authorized / Executed: **false / false**
- Full Import Started / Ready: **false / false**

## D5-R5 Pilot Final Acceptance and Gateway Mapping Preflight

- Read-only explicit-record readback: **427/427**.
- Entity counts: Account 7 / Contact 9 / Opportunity 24 / Coverage 15 / Actual 12 / Timeline 206 / Signal 154.
- Missing / business mismatch / parent mismatch / lookup mismatch / duplicate Primary Name: **0 / 0 / 0 / 0 / 0**.
- State distribution: **Won 7 / Active 16 / Lost 1**.
- OpportunityClose: **Win 7 / Lose 1 / Total 8**, duplicate 0, attachments 0.
- BPF: **24**, initial stage 24, duplicate 0, unexpected process 0, Process Order 0, definition unchanged.
- Actual duplicate / missing Signal source / Coverage conflict / Coverage Team mismatch: **0 / 0 / 0 / 0**.
- Plugin: **7/0**.
- Ordinary non-admin user runtime: **accepted** from supplied screenshots and user attestation; current attachment set directly identifies three unique tokens, with the remaining fixed sample coverage confirmed by the exact server mapping (P2 evidence granularity).
- Console: no custom application/user-facing failure observed; raw Power Apps platform counters remain disclosed as P2.
- Gateway Safe Context: **24/24 mapped**, **8/8 scenarios evidence-ready**, identity masked, exact amount excluded, raw Timeline excluded.
- GET: **1063**; POST/PATCH/DELETE/Publish/Win/Lose/BPF write/CRM writeback: **0**.
- Production requests / External LLM calls: **0/0**.
- P0/P1/P2: **0/0/2**.
- Pilot Final Acceptance Ready / Pilot Import Closed: **true / true**.
- Cleanup Authorized / Executed: **false / false**.
- Full Import Ready / Authorized: **false / false**.
