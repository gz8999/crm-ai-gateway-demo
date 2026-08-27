# Phase 1C-5R2E-2E1 Actual Management Plugin Browser Smoke Test

## Decision

`Plugin Browser Smoke Ready=false`

The browser smoke test was stopped at the read-only metadata gate. No New form was opened and no business write was attempted because the requested Fiscal Year and Annual GP/MP fields are not present in the target table metadata.

## Environment And Safety

- Environment: `org91f5f65f.crm5.dynamics.com`
- Modern App: `CRM AI Gateway Demo - Modern`
- Actual table: `aigw_actualmanagement`
- Plugin assembly: `CrmAiGateway.ActualTotals.Plugin`
- Browser write execution: not started
- Production requests: `0`

The previous acceptance commit `b2e9001` was pushed to `main` before the environment preflight. Existing unrelated untracked documentation was not changed, staged, or deleted.

## Read-Only Preflight

| Check | Result |
| --- | --- |
| Target table | `aigw_actualmanagement` exists, Organization-owned, unmanaged |
| Entity set | `aigw_actualmanagements` |
| Primary name | `aigw_name` |
| Target Opportunity | Existing `[AI-DEMO]` Opportunity selected from the approved test view |
| Related Actual count | `0` |
| Opportunity currency | Present and readable |
| Plugin assembly | One matching unmanaged assembly; public key token unchanged |
| Metadata read failures in final preflight | `0` |

The full preflight evidence is stored under the ignored path:
`local-artifacts/d365/runtime-validation/r2e2e1/phase1c5r2e2e1-preflight.json`.

## Field Mapping Result

The Actual Management metadata contains 41 of the 44 fields required by this smoke-test instruction. These requested fields were not found:

| Requested logical name | Result | Consequence |
| --- | --- | --- |
| `aigw_fiscalyear` | Missing | No safe Fiscal Year type, stored value, range, or unused test year can be selected |
| `aigw_annualactualgp` | Missing | Annual GP `60` cannot be verified as a real field |
| `aigw_annualactualmp` | Missing | Annual MP `30` cannot be verified as a real field |

The following required field families were present and were not modified:

- `aigw_opportunityid`
- `transactioncurrencyid`
- `aigw_annualactualrevenue`
- April-March Revenue / GP / MP fields
- `aigw_name`

No missing field was replaced with a guessed logical name, a name-prefix semantic key, or a synthetic text field.

## Smoke-Test Execution Matrix

| Test | Status | Reason |
| --- | --- | --- |
| Actual Main Form browser layout | Not started | Metadata gate failed before browser write flow |
| Create one temporary Actual | Not executed | No valid Fiscal Year field and no Annual GP/MP fields |
| Child Annual Revenue calculation | Not executed | Would create business data before the complete test contract is known |
| Parent Opportunity total | Not executed | Dependent on blocked child create/update path |
| Duplicate same Opportunity + Fiscal Year | Not executable | Fiscal Year field does not exist |
| May Revenue update | Not executed | Test sequence is blocked before create |
| Delete and baseline restore | Not applicable | No record was created |
| Activities / Notes / Timeline writes | `0` | Explicitly prohibited |

## Request Accounting

This phase performed read-only preflight probes only. The first three schema probes were corrected without any write request; the final preflight completed successfully.

```text
GET=27
POST=0
PATCH=0
DELETE=0
Publish=0
Business writes=0
Production requests=0
Browser write operations=0
```

The GET total includes the early rejected read-only metadata-shape probes and the final successful preflight. No failed probe changed metadata or data.

## Protection State

No browser or Dataverse write was executed in this phase. Therefore:

- Full Replica, Actual Form/View, Modern App, BPF, Plugin, and Solution definitions were not modified.
- No Plugin Step, Image, security role, or publish state was changed.
- No Actual record, Opportunity field, activity, or note was created or updated.
- Synthetic seed remains blocked.

## Required Remediation Before Retry

1. Confirm whether the intended design should create `aigw_fiscalyear`, `aigw_annualactualgp`, and `aigw_annualactualmp`, or revise the smoke-test contract to match the deployed schema.
2. If metadata is changed, complete a separate metadata design, deployment, and publish gate.
3. Re-run a read-only metadata preflight and confirm the exact type/value rules before any browser write.
4. Keep the first-version one-Actual-per-Opportunity rule explicit; do not substitute a name prefix for Fiscal Year uniqueness.

Do not proceed to R2E-3 BPF Activation Readiness from this blocked smoke-test phase.
