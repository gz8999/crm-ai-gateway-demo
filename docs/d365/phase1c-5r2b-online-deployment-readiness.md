# Actual Totals Plugin Online Deployment Readiness

## Decision

**CI Ready: yes. Online deployment prepared: yes. Deployment executed: no.**

This review is offline only. It does not authenticate to Dataverse, register a Plugin, publish customizations, or write data. Synthetic seed remains blocked.

## Verified Assembly

| Property | Verified value |
|---|---|
| Assembly | `CrmAiGateway.ActualTotals.Plugin` |
| Target framework | `.NET Framework 4.6.2` (`net462`) |
| Registration model | Sandbox / Database |
| DLL SHA-256 | `a02db984606827396467b7311f3024b586e33f4d3a024e3cb240e39ba91c6b7d` |
| Public key token | `0350f79ae25dc991` |
| Strong-name signed | Yes |
| Custom assembly dependencies | None; Core source is linked into the Plugin DLL |
| CI run | `29157898543` |
| Node tests | 101 passed |
| xUnit tests | 23 passed, 0 failed, 0 skipped |

The downloaded artifact contains exactly the Plugin DLL plus five verification files. It contains no PDB, SNK, connection string, Dataverse URL, credential, or additional custom DLL.

## Plugin Types

The assembly exposes exactly these `IPlugin` implementations:

1. `CrmAiGateway.ActualTotals.Plugin.ActualTotalsPreValidationPlugin`
2. `CrmAiGateway.ActualTotals.Plugin.ActualTotalsPreOperationPlugin`
3. `CrmAiGateway.ActualTotals.Plugin.ActualTotalsPostOperationPlugin`

## Registration Build Sheet

All steps target `aigw_actualmanagement`, use synchronous execution, and must initially remain disabled.

| Order | Type | Message | Stage | Rank | Images |
|---:|---|---|---|---:|---|
| 1 | PreValidation | Create | 10 | 10 | None |
| 2 | PreValidation | Update | 10 | 10 | `PreImage` |
| 3 | PreOperation | Create | 20 | 20 | None |
| 4 | PreOperation | Update | 20 | 20 | `PreImage` |
| 5 | PostOperation | Create | 40 | 30 | `PostImage` |
| 6 | PostOperation | Update | 40 | 30 | `PreImage`, `PostImage` |
| 7 | PostOperation | Delete | 40 | 30 | `PreImage` |

### Update Filtering Attributes

Use this exact set for all three Update steps:

`aigw_aprilactualrevenue`, `aigw_mayactualrevenue`, `aigw_juneactualrevenue`, `aigw_julyactualrevenue`, `aigw_augustactualrevenue`, `aigw_septemberactualrevenue`, `aigw_octoberactualrevenue`, `aigw_novemberactualrevenue`, `aigw_decemberactualrevenue`, `aigw_januaryactualrevenue`, `aigw_februaryactualrevenue`, `aigw_marchactualrevenue`, `aigw_opportunityid`, `transactioncurrencyid`.

Do not include annual totals, GP, MP, status fields, `modifiedon`, or any `_base` field.

### Images

- PreValidation Update and PreOperation Update, alias `PreImage`: lookup, currency, child annual revenue, and the 12 monthly Revenue fields.
- PostOperation Create, alias `PostImage`: the same complete Actual snapshot because `EntityMapper.ToActual` reads the full snapshot shape.
- PostOperation Update, aliases `PreImage` and `PostImage`: the same complete Actual snapshot for old/new parent identification and reparent safety.
- PostOperation Delete, alias `PreImage`: the same complete Actual snapshot; Target is unavailable after deletion.
- Never select All Attributes.

## Offline Logic Review

- Child: `aigw_actualmanagement`; parent: `opportunity`; lookup: `aigw_opportunityid`.
- PreOperation sums April through March Revenue only, treats null as zero, and rounds to two decimals AwayFromZero.
- PreOperation writes only `aigw_annualactualrevenue` on the Target; it does not call Update on the current child.
- PostOperation writes only `opportunity.aigw_yearrevenueactual`, and only when the rounded value changes.
- Zero child records produces parent total zero; one child uses its annual total; more than one is an integrity error.
- Delete recalculates the old Opportunity. Reparent recalculates both old and new Opportunities.
- Child currency must match the Opportunity, and each Opportunity is limited to one Actual Management record.
- Depth and SharedVariables provide recursion protection; the Plugin does not register on Opportunity.
- The Plugin never writes `aigw_yearrevenueactualcny`, `aigw_yearrevenueactual_base`, or any `_base` field.

## Deployment Gate

Before any online action, an operator must separately confirm the test organization URL, identity, privileges, solution, table/field metadata, assembly hash, public key token, seven disabled steps, and image definitions. Any production hostname, metadata mismatch, token mismatch, or unexpected existing registration blocks deployment.

Rollback order is: disable Steps, delete Images, delete Steps, then delete the Assembly after dependency verification. Do not delete tables, columns, forms, views, relationships, or business data.
