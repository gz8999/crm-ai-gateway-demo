# Phase 1C-5R0 Actual Totals Architecture Correction

## Currency distribution

- CNY: 100 Opportunities, exchange rate 1

All 100 current demo Opportunities use CNY, but seed and plugin logic must inherit each parent record's transaction currency and must not rely on this current distribution.

## Corrected field semantics

- Plugin writes only `aigw_yearrevenueactual`.
- Dataverse generates `aigw_yearrevenueactual_base`; it is readable, valid for Form, and not writable.
- `aigw_yearrevenueactualcny` is an independent legacy Money field. Retain it but deprecate it.
- A future Form-only phase should replace the visible CNY control binding with `aigw_yearrevenueactual_base`.
- This matches the source CRM field `new_yearrevenueactural_base`, whose `_base` name identifies the generated base-currency companion.

## First-version cardinality

Each Opportunity may have at most one Actual Management record. PreValidation Create rejects a second related row. Reparenting checks the destination Opportunity while excluding the current row. This rule uses the lookup, never a name prefix. No fiscal-year field is created in this version.

## Corrected plugin flow

1. PreOperation Create/Update calculates child annual Revenue from April-March and sets the Target field only when changed.
2. PostOperation Create/Update/Delete finds old/new parent IDs and reads related rows. More than one row is treated as an integrity error.
3. Update only `opportunity.aigw_yearrevenueactual`.
4. Never update `aigw_yearrevenueactualcny` or any `_base` field.
5. Dataverse maintains `aigw_yearrevenueactual_base` using the Opportunity transaction currency and exchange rate.

No Dataverse write, Form change, Plugin deployment or publish occurred in this phase.
