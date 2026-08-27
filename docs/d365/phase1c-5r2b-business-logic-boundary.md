# Phase 1C-5R2B Business Logic Boundary

| Surface | Allowed behavior |
|---|---|
| Child table | `aigw_actualmanagement` |
| Parent table | `opportunity` |
| Lookup | `aigw_opportunityid` |
| Child total | `aigw_annualactualrevenue` |
| Parent total | `aigw_yearrevenueactual` |
| Monthly source | April through March Revenue fields from `FieldNames.MonthlyRevenue` |
| Rounding | `decimal`, 2 places, `MidpointRounding.AwayFromZero` |
| Nulls | Treated as zero |
| Cardinality | Zero child -> parent zero; one child -> child annual; more than one -> integrity error |
| Currency | Child currency must match the related Opportunity |
| Reparent | Recalculate old and new Opportunity |
| Delete | Recalculate old Opportunity |
| Write to child | Only Target annual total during PreOperation; no child service update |
| Write to parent | Only `opportunity.aigw_yearrevenueactual`, and only when changed |
| Forbidden writes | `aigw_yearrevenueactualcny`, `aigw_yearrevenueactual_base`, and every `_base` field |
| Record selection | No `[AI-DEMO]` name, owner, customer, or data-prefix dependency |

This boundary is derived from the frozen source and CI Artifact. Synthetic seed remains blocked until a separately authorized online deployment and single-record smoke test.
