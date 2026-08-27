# Phase 1C-5R2G-D6-R2 Coverage and Actual Controlled Import

## Result

- Environment: **TEST-ORG**
- D6-R1 baseline commit: **24a0bad735843680a27cb37e3d55c9214f22df27**
- Coverage / Actual import: **COMPLETED**
- P0 / P1 / P2: **0 / 0 / 0**
- Production requests / External LLM calls: **0 / 0**
- Timeline, Signal, Win/Lose, Cleanup and Gateway expansion: **not executed**

## Baseline and complement

- Baseline explicit records: 767
- Baseline counts: Account 60, Contact 120, Opportunity 200, Coverage 15, Actual 12, Timeline 206, Signal 154
- Remaining complement: Coverage 225, Actual 118
- Overlap / duplicate token / missing parent: 0 / 0 / 0
- Desired Actual parent distribution: Won 84, Active 34, Lost 0

## Canary

- Coverage composite-key Canary: **COV-002**, passed
- Coverage null-start Canary: **COV-004**, normalized conflict count 0, passed
- Actual Canary: **ACT-001**, annual sum, parent sync, state, BPF and protected hash passed

## Import statistics

| Entity | Attempt | Created | Reused | Failed | Final |
|---|---:|---:|---:|---:|---:|
| ServiceCoverage | 225 | 225 | 0 | 0 | 240 |
| ActualManagement | 118 | 118 | 0 | 0 | 130 |

- Coverage per Account: **4/4**
- One Actual per Opportunity: **true**
- Parent Opportunity expected sync / unexpected business change: **118 / 0**
- Approved parent delta: aigw_yearrevenueactual, modifiedon, versionnumber

## Final readback

- Explicit records: **1110**
- Account / Contact / Opportunity / Coverage / Actual / Timeline / Signal: **60 / 120 / 200 / 240 / 130 / 206 / 154**
- Opportunity Won / Active / Lost: **7 / 192 / 1**
- OpportunityClose: **8**
- BPF target / initial / duplicate / unexpected: **200 / 200 / 0 / 0**
- Plugin enabled / disabled: **7 / 0**
- Timeline / Signal delta: **0 / 0**

## Request delta

- GET: business 3194, platform 1377, security 12, close 472; preflight 1746 is a tagged subset
- Coverage / Actual POST: **225 / 118**
- Timeline / Signal POST: **0 / 0**
- Win / Lose: **0 / 0**
- PATCH / DELETE / Publish / BPF writes: **0 / 0 / 0 / 0**
- Production / External LLM: **0 / 0**

## Verification

- `npm test`: **459/459 passed**
- `npm run build`: **passed**
- Production bundle isolation: **passed**
- `git diff --check`: **passed**
- Public GUID / credential / production host / absolute path scan: **passed**
- Gateway source diff: **0 files**
- Private Exact ID Manifest: **present and gitignored**

## Gates

- d6R1BaselineCommitCreated=**true**
- remainingCoverageComplementReady=**true**
- remainingActualComplementReady=**true**
- coverageCanaryCompositeKeyReady=**true**
- coverageCanaryNullStartDateReady=**true**
- coverageImportReady=**true**
- coverageFinalCount=**240**
- coveragePerAccountReady=**true**
- actualCanaryReady=**true**
- actualImportReady=**true**
- actualFinalCount=**130**
- oneActualPerOpportunityReady=**true**
- annualActualRevenueIntegrityReady=**true**
- parentOpportunityPluginSyncReady=**true**
- parentUnexpectedBusinessChangeCount=**0**
- opportunityStateIntegrityReady=**true**
- bpfRuntimeIntegrityReady=**true**
- timelineSignalIntegrityReady=**true**
- d6R2CoverageActualImportCompleted=**true**
- baseFullDataImportCompleted=**false**
- fullImportCompleted=**false**
- stateActionsDeferred=**true**
- cleanupAuthorized=**false**
- cleanupExecuted=**false**
- gatewayFullDatasetIntegrationReady=**false**
- productionIsolationReady=**true**
