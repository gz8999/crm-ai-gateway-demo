# Phase 1C-5R2E-2E1B Plugin Browser Smoke Contract Correction

## Decision

`Plugin Smoke Contract Ready=true`

This phase corrects the local browser smoke contract only. It does not connect to
Dataverse, modify metadata, change the Plugin, or execute the browser write test.

## Boundary

- Test environment for a future separately authorized run:
  `org91f5f65f.crm5.dynamics.com`
- Production CRM hostname is prohibited; only the approved test environment may be used.
- Dataverse schema writes: `0`
- Plugin changes or registration: `0`
- Business data writes in this phase: `0`
- Browser smoke execution: not started

## Original Contract Errors

The blocked contract incorrectly required:

- `aigw_fiscalyear`
- `aigw_annualactualgp`
- `aigw_annualactualmp`
- a selected Fiscal Year value
- duplicate detection scoped by Opportunity plus Fiscal Year
- annual GP and annual MP assertions

The reconciliation phase confirmed that none of those fields is part of the
deployed Actual Management/Form/View/Plugin contract. The old blocked preflight
remains historical evidence and was not rewritten.

## Deployed Plugin Contract

| Area | Current contract |
| --- | --- |
| Child table | `aigw_actualmanagement` |
| Parent table | `opportunity` |
| Child annual total | `aigw_annualactualrevenue` |
| Parent annual total | `aigw_yearrevenueactual` |
| Monthly source | April through March Actual Revenue |
| Null handling | Null Revenue is treated as zero |
| Currency | Actual currency must match the related Opportunity |
| Cardinality | At most one Actual Management record per Opportunity |
| Parent update | Only `opportunity.aigw_yearrevenueactual` |
| Forbidden writes | Independent CNY field and all generated `_base` fields |

Monthly GP/MP fields remain valid data fields, but annual GP/MP calculation is
outside this Plugin and this smoke contract.

## Corrected Smoke Sequence

1. Use a dedicated safe synthetic `[AI-DEMO]` Opportunity.
2. Read the related Actual count before any write; require `0`.
3. Stop if an Actual already exists. Do not delete existing data.
4. Open Actual Management Main Form and verify the current `1/5/41` layout.
5. Enter synthetic monthly Revenue values and save one Actual record.
6. Verify `aigw_annualactualrevenue` equals the April-March Revenue sum.
7. Verify `opportunity.aigw_yearrevenueactual` updates by the same amount.
8. Change one monthly Revenue value and save once.
9. Verify the child and parent annual Revenue values change accordingly.
10. Attempt one second Actual for the same Opportunity and verify Plugin rejection.
11. Close the rejected form without bypassing the rule.
12. Delete only the record created by this run.
13. Verify the parent annual Revenue is cleared or recomputed to its pre-test value.
14. Verify the Actual count and synthetic marker residue return to baseline.

The sequence must not test Fiscal Year, Annual GP, Annual MP, multiple fiscal
years, or cross-fiscal-year uniqueness.

## Synthetic Data Rules

- Use one approved `[AI-DEMO]` Opportunity only.
- Use a unique `AI-DEMO-PLUGIN-SMOKE-<UTC timestamp>` marker.
- Use visibly synthetic numeric values; never copy Opportunity amounts.
- Inherit the Opportunity transaction currency exactly.
- Do not edit ordinary Opportunity fields.
- Do not create activities, notes, or Timeline entries.
- Do not use broad name-based cleanup. Record the created Actual ID and delete
  only that ID after verification.
- If the preflight count is not zero, stop without deleting existing records.

## Expected Results

| Operation | Expected result |
| --- | --- |
| Create one Actual | Child annual Revenue is generated from 12 monthly Revenue fields |
| Create parent update | Parent `aigw_yearrevenueactual` matches the child annual Revenue |
| Update one month | Child and parent annual Revenue recalculate immediately |
| Second Actual for same Opportunity | PreValidation rejects the save; no second row persists |
| Delete created Actual | Parent total returns to its pre-test value or zero |
| Final readback | No created Actual or smoke marker remains |

## Existing Test Coverage

The existing offline Plugin tests already cover:

- Create/annual Revenue calculation
- null months and two-decimal rounding
- Update of one month
- missing Opportunity rejection
- currency mismatch rejection
- duplicate Opportunity rejection
- reparent rejection and successful reparent recalculation
- Delete/zero-child/one-child parent recalculation
- multiple-child integrity failure
- no-op parent update
- depth and SharedVariables guards
- exclusion of annual child, GP/MP, CNY, and `_base` fields from the write/filtering contract

No Plugin business behavior was changed in this phase. The pure contract module
and its Node tests are at:

`scripts/dataverse/lib/phase1c5-plugin-browser-smoke-contract.mjs`

`tests/phase1c5-plugin-browser-smoke-contract.test.mjs`

## Protection And Authorization

The future browser write run still requires separate authorization. This phase
does not authorize it. Seed remains blocked; no R2E-3 or BPF work follows.

| Protected item | Required state |
| --- | --- |
| Actual Form | `1/5/41` |
| Full Replica | `5/19/115/106`, Native Timeline `1` |
| Protected Form | Baseline hash unchanged |
| BPF | Draft/Inactive |
| Plugin | Enabled `7`, Disabled `0` |
| Business writes | `0` in this phase |
| Production requests | `0` |

## Request Accounting

This correction is local-only:

```text
GET=0
POST=0
PATCH=0
DELETE=0
Publish=0
Business writes=0
Production requests=0
```

## Verification

- `npm test`: passed
- `npm run build`: passed
- `git diff --check`: passed
- Sensitive scan: required before commit; no production access is permitted

No Dataverse request was made by this correction phase.
