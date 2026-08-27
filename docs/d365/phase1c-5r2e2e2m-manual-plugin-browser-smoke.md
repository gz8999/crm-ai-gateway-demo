# Phase 1C-5R2E-2E2M-FINAL Manual-Assisted Plugin Browser Smoke

## Decision

- `Plugin Browser Smoke Ready=true`
- `Test Data Residual Count=0`
- `Manual Browser Evidence Ready=true`
- `Server-side Cleanup Evidence Ready=true`
- R2E-3 BPF Activation readiness review is permitted under separate authorization.

This finalization performed read-only reconciliation only. It did not repeat the
browser business operations or modify Dataverse configuration or data.

## Background And Evidence Boundary

The original automated 2E2 attempt stopped before browser navigation because the
browser-control channel was unavailable. The user later executed the corrected
Revenue-only smoke sequence manually in the published Modern App and explicitly
confirmed Create, Update, duplicate rejection and Delete behavior.

Historical reports remain unchanged:

- `phase1c-5r2e2e1-plugin-browser-smoke.md`: blocked obsolete contract
- `phase1c-5r2e2e1a-schema-plugin-contract-reconciliation.md`: schema/contract analysis
- `phase1c-5r2e2e1b-plugin-smoke-contract-correction.md`: corrected Revenue-only contract
- `phase1c-5r2e2e2-plugin-browser-smoke.md`: automated channel stopped before writes
- Commit `5381e124897cd2a94fd1ac36faf97edfa492a5bf`: automated preflight report

The automated preflight selected Opportunity `f9b6f99b-2078-f111-ab0e-000d3a857307`,
but its current parent value remains null, so it cannot be treated as the later
manual test record. Read-only reconciliation across the 100 `[AI-DEMO]` records
found exactly one Opportunity with no Actual and a numeric-zero parent result:

- ID: `4aeedfec-2478-f111-ab0e-7ced8dff46e2`
- Name: `[AI-DEMO] 项目物流报价案件 076`

This matches the established manual runtime record visible in prior UI evidence.
The created Actual ID was not retained in repository or local audit evidence and
is not guessed in this report.

## Current Plugin Contract

- Each Opportunity may have at most one Actual Management record.
- April through March Revenue is summed into
  `aigw_actualmanagement.aigw_annualactualrevenue`.
- The parent write target is `opportunity.aigw_yearrevenueactual`.
- Delete of the only child writes numeric `0` to the parent.
- Dataverse maintains `aigw_yearrevenueactual_base` automatically.
- The Plugin does not write deprecated `aigw_yearrevenueactualcny`.
- Fiscal Year and annual GP/MP are outside the deployed contract.

Source audit found zero Plugin references to `aigw_fiscalyear`,
`aigw_annualactualgp`, or `aigw_annualactualmp`.

## Manual Browser Acceptance Matrix

| Operation | Evidence | Result |
| --- | --- | --- |
| Create | Created from the Opportunity Actual Management Subgrid; Related Opportunity auto-populated; Currency valid; April Revenue=10000; May Revenue=20000 | Pass |
| Child calculation | Annual Actual Revenue automatically became 30000 | Pass |
| Parent write-back | Opportunity annual actual Revenue became 30000 | Pass |
| Update | The same Actual record was updated; user confirmed child annual Revenue and parent Revenue recalculated correctly; Actual count remained one | Pass |
| GP/MP protection | No annual GP/MP assertion was made and no accidental annual GP/MP field write is part of the contract | Pass |
| Duplicate | A second Actual for the same Opportunity was rejected by the Plugin and did not persist | Pass |
| Delete | The created Actual was deleted; related Actual count returned to zero | Pass |
| Parent rollback | `aigw_yearrevenueactual` is now numeric `0`, not null | Pass |
| Cleanup | No related Actual and no `AI Smoke Test Actual` row remains | Pass |

The exact Update amount was not retained. The user explicitly confirmed correct
recalculation and parent synchronization; this is classified as evidence-detail
P2 rather than a functional failure.

## Server-Side Cleanup Evidence

For Opportunity 076:

- Related Actual Management count: 0
- `AI Smoke Test Actual` residual count across the environment: 0
- Parent `aigw_yearrevenueactual`: numeric `0`
- Generated `aigw_yearrevenueactual_base`: numeric `0`
- Deprecated independent `aigw_yearrevenueactualcny`: null and not written
- Test Data Residual Count: 0

No Actual record ID could be checked directly because the manual operation did
not persist that ID. The zero related count and zero marker-name count provide
the current server-side cleanup proof.

## Plugin Registration

| Component | Count / state |
| --- | ---: |
| Assembly | 1 |
| Plugin Types | 3 |
| Steps | 7 |
| Images | 6 |
| Enabled / Disabled | 7 / 0 |

## Protection Baseline

- Full Replica: 5 tabs / 19 sections / 115 controls / 106 unique fields
- Native Timeline / old Timeline: 1 / 0
- Location Lookup / old opportunity-place control: 1 / 0
- Actual Management Form: 1 tab / 5 sections / 41 controls
- Actual Management View definitions: present and unchanged by this finalization
- Protected Form XML hash:
  `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`
- Protected Form JSON hash:
  `94de2fe47db7300420c7fcf73c6c1ff24d830aefea9f4a1a765daf4cd728b8f9`
- BPF: Draft / Inactive
- Modern App: unchanged
- POL/POD table and four Opportunity Lookups: unchanged
- Location: 51 Active, Missing=0, Residual Mismatch Count=0
- Opportunity business writes in this finalization: 0
- Production requests: 0

## Evidence Index

- User's explicit manual acceptance statement in the 2E2M-FINAL authorization
- Historical read-only evidence:
  `local-artifacts/d365/runtime-validation/r2e2e2/`
- Existing Opportunity 076 UI evidence in ignored runtime-validation screenshots
- No dedicated Plugin smoke screenshots or manual Actual ID were persisted

## Historical Browser Operations

These operations occurred before this read-only finalization and are not included
in the request counts below:

- Actual Create: 1 persisted
- Actual Update: 1
- Duplicate Create: 1 attempted, 0 persisted
- Actual Delete: 1
- Final residual: 0

## Finalization Request Accounting

```text
GET=30
POST=0
PATCH=0
DELETE=0
Publish=0
Business writes=0
Production requests=0
```

## Issues And Gate

- P0: 0
- P1: 0
- P2: 3
  - Dedicated manual Plugin smoke screenshots were not retained.
  - The Update's exact final amount was not retained.
  - The deleted Actual record ID was not retained.

The manual Create/Update/Duplicate/Delete matrix, numeric-zero parent rollback,
zero residual data and unchanged Plugin/protection state satisfy the final gate.

`Plugin Browser Smoke Ready=true`

`Test Data Residual Count=0`
