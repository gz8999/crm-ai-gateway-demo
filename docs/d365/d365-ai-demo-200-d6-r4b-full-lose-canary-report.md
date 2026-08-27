# D6-R4B Full Lose Canary Report

## Result

The single authorized Full Lose canary completed for `DEMO-OPP-012`, selected automatically as the stable Token-minimum record from the eight frozen, still-active Lost candidates.

## Corrected Actual Contract

- Frozen Projection Expected Actual Count: `0`.
- Actual Count before / after: `0 / 0`.
- Actual revenue in OpportunityClose: empty, permitted by the approved contract.
- No ActualManagement record was created by the state action.

## Readback

- Opportunity state: `0/1 -> 2/4`.
- actualclosedate: frozen date `2026-06-30`; no direct PATCH was used.
- OpportunityClose: `0 -> 1`, no attachment or duplicate.
- BPF: classification A, same instance and unchanged initial stage/path.
- Timeline / Signal / Actual / Coverage: `1800 / 1350 / 130 / 240`, unchanged.
- Other 199 Opportunity states and protected business data: unchanged.

## Boundaries

- LoseOpportunity: 1 / WinOpportunity: 0.
- Actual POST / Timeline POST / Signal POST: `0 / 0 / 0`.
- PATCH / DELETE / Publish / BPF writes: `0 / 0 / 0 / 0`.
- Production requests / external LLM calls: `0 / 0`.
- Remaining Win / Lose actions: `83 / 7`, deferred.
- Cleanup and Gateway full-dataset integration remain unauthorized.
