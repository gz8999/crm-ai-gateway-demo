# Phase 1C-5R Actual Totals Calculation Architecture

## Confirmed Opportunity fields

| Field | Type | SourceType | Writable | Form read-only | Meaning |
|---|---|---:|---|---|---|
| `aigw_yearrevenueactual` | Money | 0 | true | false | 年度收入实绩总金额 |
| `aigw_yearrevenueactualcny` | Money | 0 | true | false | 年度收入实绩总金额(CNY) |

Both fields are independent unmanaged Money columns. `aigw_yearrevenueactualcny` is not an automatic base column. Each Money field also has its own Dataverse-generated `_base` companion.

## Architecture decision

- Formula/Calculated columns can calculate the 12-month total on one Actual record, but cannot synchronously aggregate an arbitrary 1:N child set into the Opportunity.
- Rollup columns model the parent aggregation but are asynchronous and do not meet the immediate-after-save requirement. They remain useful only as reconciliation.
- A synchronous plugin is recommended: PreOperation computes the child annual value; PostOperation aggregates all current-fiscal-year children and updates the parent.

## Algorithm

```text
PreOperation Create/Update:
  merged = PreImage + Target
  annual = sum(April..March Actual Revenue, null as zero)
  if rounded annual differs, set Target.aigw_annualactualrevenue = annual

PostOperation Create/Update/Delete:
  affectedParents = new and old Opportunity lookup IDs
  for each parent:
    children = active related Actual rows where aigw_fiscalyear == configured current FY
    transactionTotal = sum(children.aigw_annualactualrevenue)
    cnyBaseTotal = sum(children.aigw_annualactualrevenue_base)
    update Opportunity only when rounded values differ:
      aigw_yearrevenueactual = transactionTotal
      aigw_yearrevenueactualcny = cnyBaseTotal
```

Never write any `_base` column. Update and Delete images preserve the old parent so reparenting recalculates both sides.

## Fiscal year

Add `aigw_fiscalyear` as a required Whole Number on Actual Management before seeding. Define the value as the April fiscal-year start year. Parent totals include only the configured current fiscal year. Without this field, multiple fiscal years would be incorrectly combined.

## Safe sequence

1. 1C-5R1: create and targeted-publish `aigw_fiscalyear` on the custom table only.
2. 1C-5R2: build and unit-test the plugin assembly locally.
3. 1C-5R3: separately authorize plugin assembly, steps and images registration.
4. 1C-5R4: validate one synthetic Create, Update, Delete and reparent scenario.
5. 1C-5R5: unblock the revised Phase 1C-5 seed manifest.
6. 1C-5: create the 100 synthetic records.
7. 1C-6: full read-only totals and safety verification.

The Opportunity Form, Business Rule, BPF and Subgrid remain unpublished and unchanged in this dry-run.
