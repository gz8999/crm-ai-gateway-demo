# Phase 1C-5R2G-D5-R3 Single LoseOpportunity Canary

## Scope

- Environment: **TEST-ORG**
- Authorized write: one official `LoseOpportunity` for the sole frozen Compact Pilot Lost candidate
- Remaining Win actions, direct PATCH, DELETE, Publish, BPF writes, Cleanup and Full Import: **not authorized**
- Production requests / External LLM calls: **0 / 0**

## Frozen candidate

- Token: `DEMO-OPP-026`
- Selection: automatic intersection of the frozen State Action Plan and frozen Compact Pilot
- Lost Candidate Count: **1**
- Lost Status: **4 / 已取消**, uniquely confirmed by current Metadata
- Lost Reason: **7 / 07: 提案细节**
- Planned Actual End: **2026-05-18**, sourced from the frozen `estimatedclosedate`
- Expected relationship tokens: Account `A-040`, Contact `C-080`, Owner `OWNER-DEMO-02`, Department `6`

## Preflight

- Explicit Pilot records: **427/427**
- Entity counts: Account 7, Contact 9, Opportunity 24, ServiceCoverage 15, ActualManagement 12, Timeline 206, InteractionSignal 154
- Target related records: Actual 0, Imported Timeline 10, Interaction Signal 7, Coverage 2
- Target Opportunity: **0/1**, `actualclosedate` blank, OpportunityClose 0
- Target BPF: one target instance, duplicate 0, unexpected process 0, stage `授予资格`, path length 1
- All Pilot BPF: target 24, duplicate 0, unexpected 0
- Existing Win Canary `DEMO-OPP-015`: **1/3**, Actual End 2026-05-01, OpportunityClose 1, BPF unchanged
- Pilot state distribution: **Won 1 / Active 23 / Lost 0**
- Business baseline mismatch count: **0**
- Plugin: **7 enabled / 0 disabled**
- Preflight Ready: **true**

## Official action

- Endpoint contract: official `LoseOpportunity`
- Action attempts / successes: **1 / 1**
- HTTP result: **204**
- Direct `statecode` / `statuscode` / `actualclosedate` PATCH: **0**
- Opportunity state: **0/1 -> 2/4**
- Actual Close Date: **blank -> 2026-05-18**
- `actualvalue`: **blank -> blank**; no value change was required

## OpportunityClose readback

- Count: **0 -> 1**
- Subject: `[AI-DEMO] Lose DEMO-OPP-026`
- Actual End: **2026-05-18**
- Description: synthetic token and frozen synthetic lost reason only
- Actual Revenue: **blank**
- Attachments / document notes: **0 / 0**
- Activity aggregate: **8 -> 9**, exactly one platform OpportunityClose added

## BPF readback

- Instance identity: **unchanged**
- Instance count / duplicate / unexpected: **1 / 0 / 0**
- State / Status: **0/1 -> 0/1**
- Active Stage: **授予资格 -> 授予资格**
- Traversed Path length: **1 -> 1**
- Modified On: **unchanged**
- Classification: **A / BPF Lose Side Effect=None**

## Business integrity

- Target protected business hash: `00d0082ce693a02a77a50545ddeb723d7cdd64d6d2b7d2cdb02f0a97458f3573` before and after
- Imported Timeline: **10 -> 10**, hash unchanged
- Interaction Signal: **7 -> 7**, hash unchanged
- Actual Management: **0 -> 0**, hash unchanged
- Coverage: **2 -> 2**, hash unchanged
- Account / Contact: hashes unchanged
- Annotation: **2 -> 2**, hash unchanged
- Existing Win Canary: state, close record, BPF and private action ledger unchanged
- Other 22 Opportunities: Active and unchanged
- Final Pilot state distribution: **Won 1 / Active 22 / Lost 1**
- Explicit Pilot records: **427/427**
- Target BPF instances: **24**, duplicate 0, unexpected 0
- Plugin: **7/0**

## Requests

| Request | Count |
|---|---:|
| Preflight GET | 509 |
| Business CRM GET | 868 |
| OpportunityClose GET | 10 |
| BPF GET | 142 |
| LoseOpportunity Attempts | 1 |
| LoseOpportunity Success | 1 |
| WinOpportunity | 0 |
| PATCH | 0 |
| DELETE | 0 |
| Publish | 0 |
| BPF Writes | 0 |
| Other State Actions | 0 |
| Production Requests | 0 |
| External LLM Calls | 0 |

## Findings and gates

- P0 / P1 / P2: **0 / 0 / 0**
- Lose Canary Authorized: **true**
- Lose Candidate Uniqueness Ready: **true**
- Lose Canary Preflight Ready: **true**
- Lose Canary Action Executed: **true**
- Lose Canary Readback Ready: **true**
- Opportunity Lost State Ready: **true**
- OpportunityClose Ready: **true**
- Actual Close Date Integrity Ready: **true**
- Imported Timeline Integrity Ready: **true**
- Interaction Signal Integrity Ready: **true**
- Actual Management Integrity Ready: **true**
- BPF Instance Integrity Ready: **true**
- Win Canary Integrity Preserved: **true**
- Non-Canary Opportunity Integrity Ready: **true**
- Production Isolation Ready: **true**
- Remaining Win Actions Authorized: **false**
- Pilot State Actions Completed: **false**
- Pilot Import Completed: **false**
- Pilot Cleanup Authorized: **false**
- Cleanup Executed: **false**
- Full Import Started: **false**

## Verification

- `npm test`: **388/388 passed**
- `npm run build`: **passed**, including production bundle isolation
- `git diff --check`: **passed**
- Public sensitive scan: **passed**; GUID, environment hostname, credential, token and absolute-path exposure 0

The phase stops here. No remaining Win action, Cleanup, or Full Import was started.
