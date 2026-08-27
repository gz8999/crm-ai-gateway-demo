# Phase 1C-5R2B Filtering Attributes Audit

The manifest and `FieldNames.UpdateFilteringAttributes` share one ordered set of exactly 14 names:

1. `aigw_aprilactualrevenue`
2. `aigw_mayactualrevenue`
3. `aigw_juneactualrevenue`
4. `aigw_julyactualrevenue`
5. `aigw_augustactualrevenue`
6. `aigw_septemberactualrevenue`
7. `aigw_octoberactualrevenue`
8. `aigw_novemberactualrevenue`
9. `aigw_decemberactualrevenue`
10. `aigw_januaryactualrevenue`
11. `aigw_februaryactualrevenue`
12. `aigw_marchactualrevenue`
13. `aigw_opportunityid`
14. `transactioncurrencyid`

The same set is used by all three Update steps. Create and Delete have no filtering attributes; the manifest represents this as JSON `null`.

The following are explicitly excluded: `aigw_annualactualrevenue`, `aigw_yearrevenueactual`, `aigw_yearrevenueactualcny`, GP, MP, `statecode`, `statuscode`, `modifiedon`, `createdon`, `ownerid`, and every `_base` field. The source constant is the only monthly-field list used by the Plugin; the manifest is checked against it offline.
