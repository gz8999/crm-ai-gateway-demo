# Phase 1C-5R2E-3B2C-C BPF Runtime Final Acceptance

## Final Acceptance Summary

`R2E-3 Ready=true`.

The target synthetic Opportunity and existing custom BPF instance passed the final read-only runtime acceptance in `org91f5f65f.crm5.dynamics.com`. User-supplied runtime evidence shows CRM AI Demo User in CRM AI Gateway Demo - Modern with `案件关闭` active and expanded. No stage, field, process, or related-data action was performed in this phase.

## Fixed Runtime Scope

| Item | Verified value |
|---|---|
| App ID | `916afe4b-607e-f111-ab0e-002248eb1915` |
| Opportunity ID | `f9b6f99b-2078-f111-ab0e-000d3a857307` |
| Workflow ID | `7325b274-6b7c-f111-ab0e-70a8a50388b9` |
| BPF Instance ID | `221ed4a5-0780-f111-ab0e-000d3a82d194` |
| Current stage | `案件关闭` (`afe08830-d2e7-4d5d-8bd1-58871fe4a87a`) |
| Process Order | `0` |
| User class | CRM AI Demo User, ordinary non-administrator |

## Ordinary User Runtime Evidence

The supplied screenshot shows:

- approved test hostname and CRM AI Gateway Demo - Modern;
- the fixed `[AI-DEMO] 仓储运营报价案件 001` Opportunity;
- `授予资格` completed and `案件关闭` active;
- the Closing Stage flyout expanded without a permission or component error;
- `完成` visible but not selected;
- command-bar Close as Won and Close as Lost entries visible but not selected.

The screenshot is stored only in ignored local evidence at `local-artifacts/d365/runtime-validation/r2e3b2c-c/closing-stage-readonly.png`. SHA-256: `afbf1e9e9982ed207c1535829ab636c9a17f41e4e7183d62bcb5fa3941df27d6`.

## Closing Stage UI

| Step | Logical name | BPF required | Runtime value | Lock/interaction observation | Result |
|---|---|---:|---|---|---|
| 受注确度 | `aigw_winprobabilityrank` | No | `B` | Dropdown affordance visible; no lock indicator | Pass |
| Status Reason | `statuscode` | No | `有效案件` | Dropdown affordance visible; no lock indicator | Pass |
| Actual Close Date | `actualclosedate` | No | Empty | Date-picker affordance visible; no lock indicator | Pass |

All three steps remain Optional in the frozen BPF definition. The check marks beside the populated steps are runtime completion indicators, not a Dataverse Required Level change. No field was edited or saved.

## Before And After Read-Back

The independently collected preflight and post-read snapshots are byte-equivalent after removing their collection timestamps.

| Gate | Before | After | Result |
|---|---|---|---|
| Active stage | 案件关闭 | 案件关闭 | Pass |
| Instance ID | Fixed target ID | Same | Pass |
| Instance / duplicate | 1 / 0 | 1 / 0 | Pass |
| Traversed path | 授予资格, 案件关闭 | Same | Pass |
| Opportunity state/status | 0 / 1 | 0 / 1 | Pass |
| Actual close date | Empty | Empty | Pass |
| Opportunity modified/version | Frozen post-advance values | Same | Pass |
| Opportunity business-field delta | 0 | 0 | Pass |
| Actual / Activity / Note | 0 / 0 / 0 | 0 / 0 / 0 | Pass |
| Process Order | 0 | 0 | Pass |
| BPF definition hash | `59819cd865fd39c5a838441cad21979e4e1a08387b3bb62eab2285e07c213f08` | Same | Pass |
| Protected Form hash | `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7` | Same | Pass |
| Full Replica | 5 / 19 / 115 / 106 | Same | Pass |
| Plugin Enabled / Disabled | 7 / 0 | 7 / 0 | Pass |
| App BPF component count | 1 | 1 | Pass |

Full Replica remains Active and Non-default with Native/Old Timeline `1/0`, one Actual Management Subgrid, one Location Lookup, and four POL/POD Lookups.

## Requests And Writes

- Successful preflight GET: 15
- Successful post-read GET: 15
- Diagnostic GET before correcting a read-only App relationship property: 11, ending in HTTP 400
- Total Dataverse GET: 41
- POST: 0
- PATCH: 0
- DELETE: 0
- Publish: 0
- Runtime field changes: 0
- BPF instance changes: 0
- Opportunity business writes: 0
- Actual / Activity / Note writes: 0 / 0 / 0
- Production requests: 0

The first local audit invocation failed before network access because of an ignored-script import path and is not counted as a request. Browser network-request volume cannot be reconstructed from the supplied static screenshot; the server-side before/after snapshots prove zero persisted change during this phase.

## Findings

### P0

None.

### P1

None.

### P2

1. The Closing Stage uses the English runtime labels `Status Reason` and `Actual Close Date`; this is a localization fidelity item, not a functional or permission failure.
2. A static screenshot cannot provide an exact browser network-request count. Server-side read-back provides the authoritative zero-write evidence.

## Integrity Gates

- `Ordinary User Runtime Evidence Ready=true`
- `Closing Stage Display Ready=true`
- `Closing Stage Permission Ready=true`
- `BPF Instance Identity Ready=true`
- `BPF Instance Uniqueness Ready=true`
- `Opportunity State Integrity Ready=true`
- `Opportunity Status Integrity Ready=true`
- `Opportunity Actual Close Date Integrity Ready=true`
- `Opportunity Business Data Integrity Ready=true`
- `Related Data Integrity Ready=true`
- `Protected Form Integrity Ready=true`
- `BPF Definition Integrity Ready=true`
- `Process Order Integrity Ready=true`
- `Plugin Integrity Ready=true`
- `Production Isolation Ready=true`
- `R2E-3 Ready=true`
- `R2E-4 Ready=true`

`R2E-4 Ready=true` means the completed R2E-3 gates permit a separately authorized release-hardening phase. R2E-4 was not started.
