# Phase 1C-5R2E-3A1 BPF Modern App Inclusion

## Result

- `BPF App Inclusion Ready=false`
- `BPF Controlled Activation Ready=false`
- Entry to `Phase 1C-5R2E-3B`: **Not allowed**

The single authorized `AddAppComponents` action completed without an HTTP error, but immediate and delayed read-back found no `componenttype=29` component for the target BPF. The App publish gate therefore failed and no `PublishXml` request was sent.

No incorrect generic component was created, no existing App component was removed, and the App descriptor and published definition remained unchanged. The target BPF remains Draft/Inactive.

## Scope

- Environment: `org91f5f65f.crm5.dynamics.com`
- App: `CRM AI Gateway Demo - Modern`
- App ID: `916afe4b-607e-f111-ab0e-002248eb1915`
- BPF: `销售流程 - AI Demo Full Replica`
- BPF ID: `7325b274-6b7c-f111-ab0e-70a8a50388b9`
- Production requests: 0

## Preflight

| Gate | Result |
|---|---|
| Hostname | Exact test hostname |
| App identity | Correct, unmanaged, Active |
| Target BPF identity | Correct |
| Primary table | `opportunity` |
| BPF state | Draft / Inactive |
| Stages | 2: 授予资格 -> 案件关闭 |
| Steps | 4; all bindings valid |
| Target BPF App components | 0 |
| App component count | 9 |
| Full Replica | 5 / 19 / 115 / 106 |
| Native / old Timeline | 1 / 0 |
| Actual Main Form | 1 / 5 / 41 |
| Plugin Enabled / Disabled | 7 / 0 |
| Location Active / residual mismatch | 51 / 0 |
| Protected Form FormXML hash | `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7` |

## AddAppComponents Attempt

Exactly one action was sent:

- Endpoint: `AddAppComponents`
- App reference: target Modern App only
- Component collection: one `Microsoft.Dynamics.CRM.workflow`
- Workflow ID: target BPF only
- Duplicate request: none
- Retry: none

### Read-back

| Check | Before | After |
|---|---:|---:|
| Total App components | 9 | 9 |
| Target BPF `componenttype=29` | 0 | 0 |
| Generic or incorrect new components | 0 | 0 |
| Existing components removed | 0 | 0 |
| Full Replica Form component | 1 | 1 |
| Opportunity table component | 1 | 1 |
| Actual Management table component | 1 | 1 |
| Sitemap component | 1 | 1 |

Dataverse accepted the action but did not materialize a BPF App component. The evidence does not establish whether this is an inactive-process limitation, a supported-API limitation for this App type, or a platform no-op. This phase does not guess the cause and does not try a second payload.

## App Publish

- App `PublishXml`: not sent
- Publish All: not sent
- App `publishedon`: unchanged at `2026-07-13T05:21:45Z`
- App descriptor hash before/after: `72c27875386e4865aa06105720e7ddff788eff8ec06f0576dce926ab30d7a424`
- App `modifiedon`: updated by the accepted component action to `2026-07-14T07:55:05Z`

The `modifiedon` update is recorded as a metadata touch only. Component set, descriptor, Sitemap component, and published definition are unchanged.

## Navigation And Asset Protection

The component set still contains the same protected App assets:

- Opportunity table
- Actual Management table
- Full Replica Form
- Opportunity target View
- Actual Management target View
- Existing dependency Views
- Sitemap

No BPF or backing-table navigation item was created. Existing navigation order was not changed. The target BPF definition, English Sales Process, Follow up with Opportunity, Form, View, Schema, Plugin, Location, and business records were not modified.

## BPF State

- Before: Draft / Inactive, process order 100
- After: Draft / Inactive, process order 100
- Definition change: none
- Activation requests: 0
- Process-order requests: 0

The two existing managed Active Opportunity BPFs remain unchanged.

## Backing Table Gate

`EXPECTED_POST_ACTIVATION_GATE` count: **1**

The absent backing table and its not-yet-verifiable non-administrator privileges are not classified as a current P1. They remain a mandatory post-activation gate:

1. Discover the generated backing table immediately after activation.
2. Read its Logical Name, Entity Set, ObjectTypeCode, and role privileges.
3. Allow the System Administrator pilot account to perform the first technical read-back.
4. Do not allow ordinary Demo-user runtime testing until role privileges pass.
5. Do not automatically modify an unknown business role.
6. If privileges are insufficient, stop without creating a process instance or switching an existing Opportunity.

This reclassification does not override the current App-inclusion P1.

## Conditional Activation Plan

Activation remains blocked until the App component is added through a supported and independently verified method.

After App inclusion is proven:

1. Re-read the App and require exactly one target `componenttype=29`.
2. Publish only the target Modern App and verify its published component set.
3. Activate the target BPF exactly once under separate authorization.
4. Delay and read back Active state; do not retry an unknown response.
5. Discover and audit the backing table.
6. Verify System Administrator pilot privileges, then ordinary Demo-role privileges.
7. Re-read actual process order before authorizing any order change.
8. Open a safe existing `[AI-DEMO]` Opportunity read-only; do not advance a stage or save fields.
9. Authorize stage switching only in a later isolated phase.

## Recommended Process Order

Proposed future order, not applied:

1. `销售流程 - AI Demo Full Replica`
2. Keep `Follow up with Opportunity` Active
3. Keep `Sales Process` Active

The actual order must be read after activation. No name-based ordering assumption is permitted, and this phase performed no order change.

## Permission Plan

1. Use the already verified System Administrator validation user for the first technical check.
2. After backing-table generation, inspect direct and Team-derived privileges for the intended Demo user.
3. Require Opportunity access and backing-table Create/Read/Write/Append/Append To rights needed by the runtime process.
4. Stop on missing ordinary-user privileges and request separate role authorization.
5. Never broaden Basic User or an unknown business role automatically.

## Rollback Plan

If a later activation succeeds but runtime validation fails:

1. Stop without creating or switching process instances.
2. Deactivate only the custom BPF under separate authorization.
3. Restore the prior process order if a later phase changed it.
4. Keep both managed processes Active.
5. Do not delete the BPF or backing table.
6. Remove the App BPF component only if App inclusion is proven to be the failure source and removal is separately authorized.

No rollback is required for this run because no App component was created and no App publish occurred.

## Findings

### P0

None.

### P1

1. The target BPF could not be materialized as an App `componenttype=29`; required count remains 0.
2. Consequently the Modern App was not published with the BPF dependency.

### P2

1. App `modifiedon` changed after the accepted no-op action; descriptor, components, and published state did not change.
2. Process order remains intentionally deferred.
3. Runtime screenshots remain deferred until App inclusion and activation are separately authorized.

## Request Accounting

- GET: 34
- POST: 1 (`AddAppComponents`)
- PATCH: 0
- DELETE: 0
- Publish: 0
- Activation: 0
- Process-order changes: 0
- Business writes: 0
- Production requests: 0

## Final Gate

- P0: 0
- P1: 2
- P2: 3
- `EXPECTED_POST_ACTIVATION_GATE`: 1
- `BPF App Inclusion Ready=false`
- `BPF Controlled Activation Ready=false`
- Phase 1C-5R2E-3B authorization: **No**

The next safe action is a separately authorized App Designer/manual inclusion path or a proven supported API method, followed by a read-only check that finds exactly one target BPF component. Do not activate the BPF first merely to make App inclusion succeed.
