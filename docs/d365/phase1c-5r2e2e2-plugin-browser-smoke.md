# Phase 1C-5R2E-2E2 Controlled Plugin Browser Smoke Test

## Decision

`Plugin Browser Smoke Ready=false`

`Test Data Residual Count=0`

The Dataverse read-only preflight passed, but the browser-control channel failed
before any CRM page was opened. The authorized browser-only Create, Update,
duplicate rejection, and Delete sequence was therefore not executed. No API
write was substituted for the required browser UI flow.

## Execution-Preflight Gates

| Gate | Result |
| --- | --- |
| Connected environment | Approved test hostname confirmed |
| Production requests | `0` |
| Plugin components | 1 Assembly / 3 Types / 7 Steps / 6 Images |
| Plugin state | Enabled `7` / Disabled `0` |
| Custom BPF | Draft / Inactive |
| Full Replica | 5 Tabs / 19 Sections / 115 Controls / 106 unique fields |
| Native Timeline | `1`; old Timeline `0` |
| Actual Main Form | 1 Tab / 5 Sections / 41 Controls |
| Protected Form | Restored baseline hash unchanged |

## Test Opportunity Selection

The GET-only preflight found 100 synthetic `[AI-DEMO]` Opportunities satisfying
the test boundary. A deterministic candidate was selected with:

- name prefix `[AI-DEMO]`;
- related Actual Management count `0`;
- valid transaction currency;
- parent `aigw_yearrevenueactual=null` before the test;
- parent base and deprecated independent CNY values also `null`.

The exact candidate ID and synthetic name are retained only in the ignored local
audit evidence. No real customer or production record was selected.

The deployed Plugin source and offline tests require the parent value after
deleting its only child to be numeric `0`, not `null`. This distinction was
recorded before any write.

## Browser Execution

| Operation | Result |
| --- | --- |
| Open Modern App | Not executed; browser control unavailable before navigation |
| Create first Actual | Not executed |
| Verify child Revenue `6000` | Not executed |
| Verify parent Revenue `6000` | Not executed |
| Update April Revenue and verify `9000` | Not executed |
| Attempt duplicate | Not executed |
| Verify duplicate rejection | Not executed |
| Delete first Actual | Not required; no record was created |
| Verify parent rollback to numeric `0` | Not executed |

The browser failure occurred outside Dataverse and did not produce an HTTP
request, save, or partial business operation.

## Currency, Base, And Deprecated Fields

- The selected Opportunity has a valid transaction currency.
- No Actual record was created, so currency inheritance was not exercised.
- No generated `_base` field was written.
- `aigw_yearrevenueactualcny` was not written.
- No parent or child business value changed.

## Cleanup And Residual Proof

The selected Opportunity had zero related Actual records before the attempted
browser phase. Because no browser write began, there was no `createdActualId`
to clean up. Final residual count for this phase is `0`.

Local evidence:

- `local-artifacts/d365/runtime-validation/r2e2e2/phase1c5r2e2e2-preflight.json`
- `local-artifacts/d365/runtime-validation/r2e2e2/phase1c5r2e2e2-plugin-browser-smoke.json`

## Screenshot Index

No screenshots were created. The browser failed before the Modern App could be
opened, and no synthetic form or record existed to capture.

## Request Accounting

```text
GET=31
POST=0
PATCH=0
DELETE=0
Publish=0
Business writes=0
Production requests=0
```

GET count combines the full component-protection readback (`28`) and the
candidate Opportunity preflight (`3`).

Business write detail:

- First Actual Create: `0`
- First Actual Update: `0`
- Duplicate Create attempt: `0`
- First Actual Delete: `0`
- Failed attempts persisted: `0`

## Issues

- P0: none. No production access, data mutation, residual record, or Plugin
  state change occurred.
- P1: browser automation unavailable, so Create/Update/Duplicate/Delete and
  parent recalculation could not be validated.
- P2: none recorded; no runtime UI was reached.

## Protection Result

- Actual Management metadata, Form, and View were not modified.
- Full Replica, Native Timeline, Protected Form, Modern App, and BPF were not
  modified.
- Plugin remained Enabled `7` / Disabled `0`.
- No Publish, activation, schema change, seed, or business-data write occurred.

## Verification

- `npm test`: passed, 171/171
- `npm run build`: passed
- `git diff --check`: passed
- Sensitive scan: passed

R2E-3 BPF Activation is not permitted. The browser smoke must be rerun under a
separate continuation once browser control is available; the existing read-only
candidate remains only a preflight result and is not reserved.
