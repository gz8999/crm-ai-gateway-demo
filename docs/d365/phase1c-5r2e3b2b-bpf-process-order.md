# Phase 1C-5R2E-3B2B Controlled BPF Process Order Change

## Result

- `BPF Process Order Ready=true`
- `Target BPF First Priority=true`
- `BPF Runtime Test Ready=true`
- Phase 3B2C may proceed under separate authorization.

The custom Opportunity BPF was moved to first priority with one conditional update. No BPF definition, stage, step, App, form, view, plugin, business record, or BPF instance was changed.

## Environment And Scope

- Test hostname: `org91f5f65f.crm5.dynamics.com`
- Target BPF: `销售流程 - AI Demo Full Replica`
- Workflow ID: `7325b274-6b7c-f111-ab0e-70a8a50388b9`
- Target App: `CRM AI Gateway Demo - Modern`
- Production requests: 0

All preflight gates passed: the target was Active/Activated, its definition and 2-stage/4-step structure matched the baseline, CRM AI Demo User remained non-admin with the required permissions, the backing table had zero rows, and all protected components matched their baselines.

## Order Before Change

| Rank | Process | Workflow ID | Process order | Layer | In target App | Available to demo user |
|---:|---|---|---:|---|---|---|
| 1 | Follow up with Opportunity | `138acd55-4a5b-4fe8-9af7-abbe5b94745a` | 1 | Managed | No | Not evaluated |
| 2 | Sales Process | `3e8ebee6-a2bc-4451-9c5f-b146b085413a` | 1 | Managed | No | Not evaluated |
| 3 | 销售流程 - AI Demo Full Replica | `7325b274-6b7c-f111-ab0e-70a8a50388b9` | 100 | Unmanaged | Yes | Yes |

The two managed workflows shared order 1. Their relative order was retained as returned by Dataverse.

## Controlled Write

The workflow `processorder` attribute was confirmed readable and updateable through Metadata. One ETag-guarded update set only the target workflow's `processorder` to 0.

| Item | Result |
|---|---|
| Update attempts | 1 |
| HTTP result | 204 No Content |
| Automatic retry | No |
| Correlation ID | Not returned |
| Other workflow updates | 0 |

## Order After Change

| Rank | Process | Workflow ID | Process order | State | Layer |
|---:|---|---|---:|---|---|
| 1 | 销售流程 - AI Demo Full Replica | `7325b274-6b7c-f111-ab0e-70a8a50388b9` | 0 | Active/Activated | Unmanaged |
| 2 | Follow up with Opportunity | `138acd55-4a5b-4fe8-9af7-abbe5b94745a` | 1 | Active | Managed |
| 3 | Sales Process | `3e8ebee6-a2bc-4451-9c5f-b146b085413a` | 1 | Active | Managed |

Dataverse retained non-contiguous values `0/1/1`. This is accepted because the target is unambiguously first and neither managed workflow was rewritten. Both standard workflows remain Active.

## Integrity And Protection

| Gate | Result |
|---|---|
| Target BPF state/status | Active / Activated (`1` / `2`) |
| Target definition | Unchanged |
| Stages / steps | 2 / 4, unchanged |
| Modern App target BPF components | 1 |
| Backing table rows | 0 |
| Full Replica | 5 / 19 / 115 / 106 |
| Native Timeline | 1 |
| Protected Form | Baseline hash unchanged |
| Plugin Enabled / Disabled | 7 / 0 |
| Actual Main Form | 1 / 5 / 41 |
| Active Locations | 51 |
| CRM AI Demo User roles | Unchanged |
| Opportunity business writes | 0 |
| BPF instance writes | 0 |
| Production requests | 0 |

## Rollback Plan

Rollback requires separate authorization. Restore only the target workflow to `processorder=100` with a fresh ETag-protected update, then read back all three Active Opportunity BPFs. Leave Follow up with Opportunity and Sales Process at order 1. Do not deactivate, delete, or edit any process, and do not modify or bulk-switch existing BPF instances or Opportunities.

## Findings

### P0

None.

### P1

None.

### P2

1. Dataverse retained normalized non-contiguous values `0/1/1`; target-first ordering is nevertheless explicit.
2. Ordinary-user BPF runtime behavior has not yet been tested. This phase only authorizes the separately controlled Phase 3B2C test.
3. Backing-table ALM membership remains a separate follow-up item and did not affect this order change.

## Request Accounting

- GET: 31
- POST: 0
- PATCH: 1
- DELETE: 0
- Publish: 0
- Activation / Deactivation: 0
- Opportunity business writes: 0
- BPF instance writes: 0
- Production requests: 0

## Final Gate

- `BPF Process Order Ready=true`
- `Target BPF First Priority=true`
- `BPF Runtime Test Ready=true`

`BPF Runtime Test Ready=true` means the order and protection prerequisites now permit Phase 3B2C under separate authorization. No ordinary-user runtime test was executed in this phase.
