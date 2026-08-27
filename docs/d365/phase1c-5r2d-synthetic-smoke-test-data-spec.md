# Phase 1C-5R2D Synthetic Smoke-Test Data Specification

Design only. No Opportunity, Actual Management, or other record is created by this document. The general 100-record seed remains blocked.

Use six explicitly synthetic Opportunities with non-GUID identifiers:

| Key | Currency | Purpose |
|---|---|---|
| `DEMO-OPP-A` | CNY | Baseline with no Actual |
| `DEMO-OPP-B` | CNY | Baseline for a normal Actual |
| `DEMO-OPP-C` | Synthetic non-CNY | Currency mismatch rejection |
| `DEMO-OPP-D` | CNY | Reparent destination/source scenario |
| `DEMO-OPP-E` | CNY | Delete and zero-parent scenario |
| `DEMO-OPP-F` | CNY | Duplicate-child rejection scenario |

All names, accounts, contacts, addresses, amounts, and identifiers must be visibly synthetic, use the approved local synthetic fixture contract, and contain no production CRM values. The operator should create only the minimum records needed for the single-record smoke cases and delete or retain them according to the separately approved rollback decision.
