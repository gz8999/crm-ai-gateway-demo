# Phase 1C-5R2G-D5-R2 Single WinOpportunity Canary

## Scope and result

- Environment alias: `TEST-ORG`
- Authorized target: `DEMO-OPP-015`
- Official action: `WinOpportunity`
- Attempts / successes: **1 / 1**
- HTTP result: **204**
- Direct `statecode` / `statuscode` / `actualclosedate` PATCH: **0**
- Remaining Win, Lose, Cleanup and Full Import authorization: **false**

The action used `Status=3`, the frozen and live-confirmed Actual revenue **3898**, and Actual End **2026-05-01**. The request description contained only the synthetic token and synthetic won reason. Exact record identifiers and request correlation evidence remain in the ignored private manifest.

## Preflight

| Gate | Result |
|---|---:|
| Explicit Pilot records | 427/427 |
| Opportunity | 24 |
| All Opportunity Active | 24 |
| Target BPF instances | 24 |
| Duplicate / unexpected BPF | 0 / 0 |
| Imported Timeline / Signal | 206 / 154 |
| Canary Actual | 1 (`ACT-008`) |
| Frozen / live Actual revenue | 3898 / 3898 |
| Canary OpportunityClose | 0 |
| Quote | 0 |
| Plugin enabled / disabled | 7 / 0 |
| Process order | 0 |
| Production requests | 0 |

## Opportunity before and after

| Field | Before | After |
|---|---:|---:|
| State / Status | `0/1` | `1/3` |
| Actual Close Date | null | `2026-05-01` |
| Actual Value | null | 3898 |
| Annual Actual Revenue | 3898 | 3898 |
| Protected business-field hash | unchanged | unchanged |

`modifiedon` and `versionnumber` changed as the expected platform consequence of the official close action. The protected business-field hash remained identical.

## OpportunityClose readback

- Count: **0 -> 1**
- Unique target relationship: **ready**
- Subject: `[AI-DEMO] Win DEMO-OPP-015`
- Actual Revenue / Actual End: **3898 / 2026-05-01**
- Synthetic description: **true**
- Identity, email, phone, GUID, Timeline text or AI judgment in description: **none**
- Attachments: **0**
- Imported Timeline: **12 -> 12**, unchanged
- Activity aggregate: **9 -> 10**, expected `OpportunityClose` delta only

## BPF observation

The target BPF remained the same single instance. State/status, active stage `授予资格`, traversed path and platform timestamp were unchanged. Duplicate and unexpected-process counts remained zero.

- Classification: **A**
- Label: `BPF Close Side Effect=None`
- Manual BPF writes: **0**

## Business integrity

All protected hashes were unchanged for the explicit Pilot record set, the other 23 Opportunities, Canary protected fields, Actual Management, imported Timeline, Interaction Signal, Service Coverage, Account, Contact and annotation records. The final state distribution is:

- Won: **1**
- Active: **23**
- Lost: **0**

The explicit Pilot record count remains **427**. Platform `OpportunityClose` is reported separately and is not mixed into the imported Timeline count. Existing non-Pilot data modified: **false**.

## Requests

| Request | Count |
|---|---:|
| Preflight GET | 503 |
| Business CRM GET | 866 |
| OpportunityClose GET | 4 |
| BPF GET | 138 |
| WinOpportunity attempts / successes | 1 / 1 |
| LoseOpportunity | 0 |
| PATCH / DELETE / Publish | 0 / 0 / 0 |
| BPF writes / other state actions | 0 / 0 |
| Production requests | 0 |
| External LLM calls | 0 |

## Issues

- P0: **0**
- P1: **0**
- P2: **0**

## Gates

| Gate | Result |
|---|---:|
| Win Canary Authorized | true |
| Win Canary Preflight Ready | true |
| Win Canary Action Executed | true |
| Win Canary Readback Ready | true |
| Opportunity Won State Ready | true |
| OpportunityClose Ready | true |
| Actual Revenue Integrity Ready | true |
| Actual Close Date Integrity Ready | true |
| Imported Timeline Integrity Ready | true |
| Interaction Signal Integrity Ready | true |
| Actual Management Integrity Ready | true |
| BPF Instance Integrity Ready | true |
| BPF Platform Side Effect Classification | A |
| Non-Canary Opportunity Integrity Ready | true |
| Pilot State Distribution | Won 1 / Active 23 / Lost 0 |
| Remaining Win Actions Authorized | false |
| Lose Action Authorized | false |
| Pilot State Actions Completed | false |
| Pilot Import Completed | false |
| Pilot Cleanup Authorized | false |
| Cleanup Executed | false |
| Full Import Started | false |
| Production Isolation Ready | true |

## Stop boundary

No second state action was executed. The remaining six Win actions, one Lose action, any state restoration, OpportunityClose deletion, Cleanup and Full Import require separate authorization.
