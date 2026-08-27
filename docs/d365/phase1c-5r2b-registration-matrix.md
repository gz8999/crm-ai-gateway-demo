# Phase 1C-5R2B Final Registration Matrix

This matrix is a future registration specification only. All seven steps start Disabled. No Step, Image, Assembly, or Plugin Type was created in this phase.

Primary entity: `aigw_actualmanagement`
Execution: synchronous (`mode=0`)
Deployment: Server (`deploymentCode=0`)
Isolation: Sandbox (`isolationCode=2`)

| # | Logical identifier | Plugin type | Message | Stage | Rank | Filtering | Images | Purpose |
|---:|---|---|---|---|---:|---|---|---|
| 1 | `actualTotals.preValidation.create` | PreValidation | Create | 10 | 10 | None | None | Validate lookup, currency, and one-child invariant |
| 2 | `actualTotals.preValidation.update` | PreValidation | Update | 10 | 10 | 14 Revenue/lookup/currency fields | PreImage | Validate merged update and reparent |
| 3 | `actualTotals.preOperation.create` | PreOperation | Create | 20 | 20 | None | None | Calculate child annual Revenue |
| 4 | `actualTotals.preOperation.update` | PreOperation | Update | 20 | 20 | 14 Revenue/lookup/currency fields | PreImage | Calculate child annual Revenue from merged months |
| 5 | `actualTotals.postOperation.create` | PostOperation | Create | 40 | 30 | None | PostImage | Recalculate new parent |
| 6 | `actualTotals.postOperation.update` | PostOperation | Update | 40 | 30 | 14 Revenue/lookup/currency fields | PreImage + PostImage | Recalculate old and new parents |
| 7 | `actualTotals.postOperation.delete` | PostOperation | Delete | 40 | 30 | None | PreImage | Recalculate old parent |

All image aliases are exactly `PreImage` or `PostImage`. Image fields are the complete snapshot set declared in the JSON manifest because `EntityMapper.ToActual` reads lookup, currency, annual, and all 12 monthly Revenue keys. No image uses All Attributes.

If a registration tool cannot create a Disabled step, this is a manual Go/No-Go gate: register nothing until the operator confirms that the step can be disabled immediately before any business test.
