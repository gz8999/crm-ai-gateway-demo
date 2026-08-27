# Phase 1C-5R2E-3A BPF Activation Readiness Review

## Result

`BPF Activation Readiness=false`

The BPF definition itself is internally valid and all 100 current `[AI-DEMO]` Opportunities satisfy its only required step. Activation is not yet authorized because two runtime gates remain unresolved:

1. The target BPF is not an explicit `componenttype=29` dependency of `CRM AI Gateway Demo - Modern`.
2. The inactive BPF has no generated backing table, so non-administrator backing-table privileges cannot be verified before activation. The current validation user has System Administrator and is suitable for a controlled activation pilot, but that does not prove ordinary Demo-user readiness.

No component was activated, published, reordered, or modified.

## Environment And Scope

- Environment: test organization `org91f5f65f` only
- Target BPF ID: `7325b274-6b7c-f111-ab0e-70a8a50388b9`
- Modern App: `CRM AI Gateway Demo - Modern`
- App ID: `916afe4b-607e-f111-ab0e-002248eb1915`
- Review mode: read-only
- Production requests: 0

## BPF Definition Matrix

| Property | Value | Result |
|---|---|---|
| Name | `销售流程 - AI Demo Full Replica` | Pass |
| Unique name | `aigw_ai_demo_full_replica` | Pass |
| ID | `7325b274-6b7c-f111-ab0e-70a8a50388b9` | Pass |
| Primary table | `opportunity` | Pass |
| Category | Business Process Flow (`4`) | Pass |
| Managed | No | Pass |
| State / status | Draft (`0`) / Inactive (`1`) | Protected |
| Process order | `100` | Not selected as first process |
| Solution membership | Workflow component `29` in `CRMAIGatewayDemo` | Pass |
| Branch / condition | None found | Pass |
| Child workflow / action | None found | Pass |
| Empty stage / empty field step | None | Pass |

The parsed definition contains only standard workflow, entity, stage, relationship collection, step, and control-step object-model nodes. No condition, branch, workflow invocation, or action node was found.

## Stage And Step Matrix

| Order | Stage | Stage ID | Category | Step | Field | BPF required | Metadata result | Full Replica |
|---:|---|---|---|---:|---|---|---|---|
| 1 | 授予资格 | `db7ed324-2fb8-4bbe-9c99-4af7caafa7d2` | Approval (`7`) | 1 | `parentaccountid` | Yes | Lookup; readable/create/update/form valid | One bound editable control |
| 2 | 案件关闭 | `afe08830-d2e7-4d5d-8bd1-58871fe4a87a` | Unclassified (`-1`) | 1 | `aigw_winprobabilityrank` | No | Picklist; readable/create/update/form valid | Present |
| 2 | 案件关闭 | `afe08830-d2e7-4d5d-8bd1-58871fe4a87a` | Unclassified (`-1`) | 2 | `statuscode` | No | Status; readable/create/update/form valid | Present |
| 2 | 案件关闭 | `afe08830-d2e7-4d5d-8bd1-58871fe4a87a` | Unclassified (`-1`) | 3 | `actualclosedate` | No | DateTime; readable/create/update/form valid | Present |

### Binding Safety

- Missing or invalid bindings: 0
- Duplicate steps: 0
- Empty field steps: 0
- References to `aigw_opportunityplace`: 0
- References to `aigw_yearrevenueactualcny`: 0
- References to missing fiscal-year, annual-GP, or annual-MP fields: 0
- Location field: not used by this BPF; no stale Location binding exists
- Existing `[AI-DEMO]` Opportunities checked: 100
- Existing records with `parentaccountid`: 100
- Existing records missing the required first-stage value: 0

The BPF-required flag is process-stage validation, not a global Dataverse Required Level change. Current metadata Required Level remains `None`.

## Full Replica Compatibility

- Full Replica: Active, non-default
- Structure: 5 Tabs / 19 Sections / 115 Controls / 106 unique bound fields
- `parentaccountid`: one editable bound control
- Native Timeline: 1; old Timeline controls: 0
- Actual Management Subgrid: unchanged
- POL/POD Lookups: 4, unchanged
- Location Lookup: 1; legacy Location text control: 0
- Header and body bindings: no invalid or conflicting BPF field binding found

The BPF uses fields already available on the form or directly editable in the BPF. No Timeline, Actual, POL/POD, Location, annual-total, or header definition is changed by this review.

## App Dependency

The published Modern App is unmanaged and active. Its Opportunity table component is correctly mapped:

- Opportunity component: 1
- Opportunity object ID: `30b0cd7e-0081-42e1-9a48-688442277fae`
- Target BPF component (`componenttype=29`): 0

**P1:** The target BPF is not explicitly included in the Modern App. Table inclusion alone is insufficient evidence that App users will receive the intended process. Before activation, add only this BPF as an App process dependency, keep navigation unchanged, validate the App, and publish the App under a separately authorized phase.

## Security Role Readiness

The browser validation user `Zhou Wenzhe` (`df4b1a2f-cd6d-f111-ab0d-00224818ead9`) currently has these direct roles:

- System Administrator (`50441a2f-cd6d-f111-ab0d-00224818ead9`)
- Basic User (`eb481a2f-cd6d-f111-ab0d-00224818ead9`)

No inherited Team role was found. System Administrator is sufficient for the controlled validation account's Opportunity and process operations.

The inactive BPF has no EntityDefinition/backing table yet (`aigw_ai_demo_full_replica` not found). Therefore backing-table privileges for non-administrator Demo roles cannot be inspected or granted in this phase.

**P1:** After controlled activation creates the backing table, perform a read-only privilege audit before allowing non-administrator users. Do not bulk-edit roles. The first runtime validation must use the already verified System Administrator pilot account.

## Existing Active Opportunity BPFs

| Process order | Name | Unique name | ID | Managed |
|---:|---|---|---|---|
| 1 | Follow up with Opportunity | `make_contact_on_opportunity` | `138acd55-4a5b-4fe8-9af7-abbe5b94745a` | Yes |
| 1 | Sales Process | `opportunitysalesprocess` | `3e8ebee6-a2bc-4451-9c5f-b146b085413a` | Yes |

The target remains inactive at order `100`. Activation alone should not be assumed to make it the default process. Existing Opportunity process instances are not bulk-switched by this review; users may retain or switch processes according to availability, security, and process order.

## Recommended Process Order

1. Keep both managed processes Active for rollback and existing-record continuity.
2. Restrict the custom BPF to the dedicated Demo role or validation users before broad rollout.
3. After App inclusion and backing-table privilege verification, put the custom BPF first only for the intended Demo audience.
4. Do not use a global default change, bulk process reassignment, or existing-record migration.

Because the two managed processes currently both report order `1`, exact ordering behavior must be re-read after activation and configured in a separately authorized step. This review does not infer a stable tie-breaker.

## Controlled Activation Plan

1. Add the target BPF to the Modern App as the only new process dependency; do not add navigation.
2. Validate and publish only the Modern App if required by the supported App Designer workflow.
3. Re-read the target BPF, app components, Full Replica, Plugin, and protected baselines.
4. Activate the target BPF once; do not retry automatically on an unknown response.
5. Re-read the generated backing table and validate privileges for the System Administrator pilot account.
6. Configure process order only after the App and privilege gates pass.
7. Keep the managed Sales Process active.
8. Do not switch existing Opportunity instances in bulk.

## Runtime Validation Plan

1. Open `CRM AI Gateway Demo - Modern` as the dedicated System Administrator pilot user.
2. Open an existing `[AI-DEMO]` Opportunity without saving it.
3. Confirm the custom process is available and the process selector contains no unexpected process.
4. Confirm stage order `授予资格` then `案件关闭`.
5. Confirm the four field bindings and required marker for `parentaccountid`.
6. Confirm Full Replica, Timeline, Actual Subgrid, POL/POD, and Location Lookup still load.
7. Verify a New form only to the point before save; do not create a record.
8. Re-read server state, process order, App components, and Plugin 7/0.

## Rollback Plan

If runtime validation fails:

1. Stop testing without modifying Opportunity records or process instances.
2. Deactivate only the custom BPF under separate authorization.
3. Restore the prior process order if it was changed.
4. Keep the BPF definition and Solution component; do not delete it.
5. Keep the managed Sales Process active throughout.
6. Remove the custom BPF App dependency only if App routing is the confirmed failure source, then publish only the affected App.
7. Re-read existing Opportunity process instances; do not bulk-switch them.

## Protection Baseline

| Gate | Result |
|---|---|
| Protected Form FormXML hash | `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7` |
| Full Replica | 5 / 19 / 115 / 106 |
| Native / old Timeline | 1 / 0 |
| Actual Main Form | 1 / 5 / 41 |
| Plugin Assembly / Types / Steps / Images | 1 / 3 / 7 / 6 |
| Plugin Enabled / Disabled | 7 / 0 |
| Location Active | 51 |
| Location residual mismatch | 0 |
| BPF | Draft / Inactive |
| Production requests | 0 |

## Findings

### P0

None.

### P1

1. Target BPF is absent from the Modern App component set.
2. The backing table does not exist while the BPF is inactive, so non-administrator role readiness cannot yet be proven.

### P2

1. Stage `案件关闭` has category `-1`; this does not invalidate the stage but should be visually confirmed after activation.
2. Full screenshot evidence for step labels and required markers remains a runtime confirmation item.
3. Two managed active BPFs share process order `1`; their tie behavior must not be guessed.

## Request Accounting

- GET: 51
- POST: 0
- PATCH: 0
- DELETE: 0
- Publish: 0
- Activation: 0
- Business writes: 0
- Production requests: 0

## Gate

- P0: 0
- P1: 2
- `BPF Activation Readiness=false`
- Entry to `R2E-3B Controlled Activation`: **Not allowed**

The next authorized phase must resolve App process inclusion and define the post-activation backing-table privilege check before any activation request is sent.
