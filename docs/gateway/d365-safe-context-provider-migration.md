# D365 Safe Context Provider Migration

## Before and After

| Area | Before | After |
| --- | --- | --- |
| Default formal source | 6F-A Pilot route | D365 Frozen Dataset route |
| Scope | 24 approved Pilot Opportunities | 200 frozen Opportunities |
| Local Fixture | Implicitly available in decision service | Explicit `Local Fixture` mode only |
| Failure behavior | Pilot failure retained the current view | Frozen Dataset failure retains current view and never falls back |
| Provider | Deterministic Demo Provider | Same deterministic Demo Provider, now fed only by D365 Safe Context |
| Writeback | Disabled | Disabled |
| External LLM | Disabled | Disabled |

## Migration Details

The new service composes the existing `buildPilotScope` and deterministic Decision Pack builder with a separate full-dataset reader. The composition keeps the proven Fact / Inference / Evidence / Confidence / Action contract and avoids a parallel provider implementation.

The reader runs the department filter in the server-side scope builder before Safe Context creation. Exact amounts are kept only in the server-side amount display branch for an explicitly selected internal UI mode; the range-mode Safe Context and every Decision Pack contain bands only.

The runtime does not load `ScenarioManifest` or Golden metadata. Eight scenario validation remains an offline acceptance concern; runtime findings come from CRM facts, derived categorical signals and safe account aggregates.

## Compatibility

- `/api/pilot/*` remains available for 6F-A compatibility tests and consumers.
- `/api/d365-frozen/*` is the formal application path.
- Import, Reset, Legacy adapters and comparison reservations are unchanged.
- No Dataverse schema, security, form, BPF or plugin code changed.

## Operational Gate

This checkout contains no D365 client configuration in `.env`; therefore the live read gate is intentionally not claimed as executed. When test credentials are supplied, the browser smoke must prove 200 records, seven departments, status 91/100/9, no raw exposure and no writes. Production remains denied by hostname gate.
