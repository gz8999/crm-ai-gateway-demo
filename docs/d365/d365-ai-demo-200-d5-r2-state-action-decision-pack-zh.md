# Phase 1C-5R2G-D5-R2 State Action Decision Pack

## Current gate

- Base Pilot Data Import Completed: **true**
- Explicit readback: **427/427**
- Opportunity distribution: **Active 23 / Won 1 / Lost 0**
- Target BPF instances: **24**, duplicate 0, unexpected 0
- Plugin: **7 enabled / 0 disabled**
- `DEMO-OPP-015` Win Canary: **authorized and completed once**
- Remaining State Actions Authorized: **false**

## Frozen candidates

### Completed WinOpportunity Canary (1)

- `DEMO-OPP-015`: Status 3; Actual End 2026-05-01; HTTP 204; exact readback passed

### Remaining WinOpportunity candidates (6, not authorized)

- `DEMO-OPP-028`: 已签约; proposed close date 2026-04-07
- `DEMO-OPP-038`: 已签约; proposed close date 2026-05-11
- `DEMO-OPP-130`: 已签约; proposed close date 2026-07-08
- `DEMO-OPP-135`: 已签约; proposed close date 2026-06-27
- `DEMO-OPP-181`: 已签约; proposed close date 2026-08-19
- `DEMO-OPP-199`: 已签约; proposed close date 2026-09-18

### Completed LoseOpportunity Canary (1)

- `DEMO-OPP-026`: Status 4; Actual End 2026-05-18; HTTP 204; exact readback passed

## Required separate authorization

A future phase must authorize the remaining six exact Win actions. It must snapshot BPF instances and Opportunity state, execute standard Dataverse actions only, stop on the first failure, and perform exact readback. Direct PATCH of state, status, or actual close date is not part of this decision pack.

Cleanup and Full Import remain outside scope.

## D5-R2 Canary outcome

- WinOpportunity attempts / successes: **1 / 1**
- OpportunityClose: **0 -> 1**
- Imported Timeline: **12 -> 12**
- Activity aggregate: **9 -> 10** (OpportunityClose only)
- BPF side-effect classification: **A / None**
- Other 23 Opportunities: **Active and unchanged**
- PATCH / DELETE / Publish / BPF writes: **0 / 0 / 0 / 0**
- Production requests / External LLM calls: **0 / 0**
- Remaining Win authorized: **false**

## D5-R3 Lose Canary outcome

- Candidate source: frozen State Action Plan and Compact Pilot intersection
- Candidate / count: `DEMO-OPP-026` / **1**
- LoseOpportunity attempts / successes: **1 / 1**
- Status / Actual End: **4 / 2026-05-18**
- Opportunity state: **0/1 -> 2/4**
- OpportunityClose: **0 -> 1**, attachments 0
- Imported Timeline: **10 -> 10**; Activity aggregate: **8 -> 9**
- BPF side-effect classification: **A / None**
- Win Canary `DEMO-OPP-015`: **unchanged**
- Other 22 Opportunities: **Active and unchanged**
- Pilot distribution: **Won 1 / Active 22 / Lost 1**
- PATCH / DELETE / Publish / BPF writes: **0 / 0 / 0 / 0**
- Production requests / External LLM calls: **0 / 0**
- Remaining six Win actions authorized: **false**
