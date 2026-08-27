# Phase 1C-5R2G-D5-R1 BPF Contract Reconciliation and Base Pilot Resume

- Environment: TEST-ORG
- BPF auto-instance contract: **accepted**
- Explicit records: **245/427**
- Target BPF instances: **24/24**
- Win/Lose: **0/0**
- Cleanup / Full Import: **not authorized**

## Canary and BPF

- Canary Account / Contact / Opportunity / BPF reused: **true / true / true / true**
- Target / duplicate / unexpected BPF: **24 / 0 / 0**
- Initial stage ready: **24/24**
- Manual BPF POST/PATCH/DELETE: **0/0/0**

## Import statistics

| Entity | Attempt | Created | Reused | Failed | Pending |
|---|---:|---:|---:|---:|---:|
| Account | 7 | 6 | 1 | 0 | 0 |
| Contact | 9 | 8 | 1 | 0 | 0 |
| Opportunity | 24 | 23 | 1 | 0 | 0 |
| ServiceCoverage | 15 | 15 | 0 | 0 | 0 |
| ActualManagement | 12 | 12 | 0 | 0 | 0 |
| Timeline | 179 | 178 | 0 | 1 | 27 |
| InteractionSignal | 0 | 0 | 0 | 0 | 154 |

The first R1 run's `TL-0122` annotation warning was a local validator false negative. GET-only readback confirmed the requested date in `createdon`; the controlled resume reused its exact ID and did not POST it again.

The controlled resume then stopped at the first real platform rejection: future-dated annotation `TL-1630` requested `2026-07-30` while the environment date was `2026-07-17`. Dataverse returned HTTP 400; exact GET readback confirmed residual count 0. No date substitution or frozen projection change was made.

## State and safety

- Opportunity distribution: **Active 24 / Won 0 / Lost 0**
- Plugin: **Enabled 7 / Disabled 0**
- Existing non-Pilot data modified: **false**
- Production requests / External LLM: **0 / 0**

## Requests

```json
{
  "preflightGET": 7,
  "businessCRMGET": 713,
  "platformGET": 130,
  "AccountPOST": 6,
  "ContactPOST": 8,
  "OpportunityPOST": 23,
  "CoveragePOST": 15,
  "ActualPOST": 12,
  "TimelinePOST": 179,
  "SignalPOST": 0,
  "BpfInstancePOST": 0,
  "BpfInstancePATCH": 0,
  "BpfInstanceDELETE": 0,
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
- P1: **1** (future-dated Annotation cannot be created without a separately approved projection rule)
- P2: **1** (the local annotation date validator was corrected; no Dataverse data changed)

## Gates

- bpfAutoInstanceContractReady: **true**
- canaryBpfIntegrityReady: **true**
- canaryReady: **true**
- canaryRecordsReused: **true**
- accountImportReady: **true**
- contactImportReady: **true**
- opportunityImportReady: **true**
- opportunityCount: **24**
- targetBpfInstanceCount: **24**
- duplicateBpfInstanceCount: **0**
- unexpectedBpfProcessCount: **0**
- coverageImportReady: **true**
- actualImportReady: **true**
- timelineImportReady: **false**
- signalImportReady: **false**
- basePilotDataImportCompleted: **false**
- pilotStateActionsDeferred: **true**
- winOpportunityCount: **0**
- loseOpportunityCount: **0**
- pilotImportCompleted: **false**
- pilotExactReadbackReady: **false**
- pilotExactIdManifestReady: **false**
- partialExactIdManifestReady: **true**
- pilotCleanupAuthorized: **false**
- cleanupExecuted: **false**
- existingNonPilotDataModified: **false**
- pilotScopeExceeded: **false**
- fullImportStarted: **false**
- productionIsolationReady: **true**
- fullImportReady: **false**
- fullImportAuthorized: **false**

## Blocker

- `TL-1630`: System date cannot be set to a date in the future; residual record count **0**.

## D5-R1A Base Pilot Completion

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
