# Phase 1C-5R2G-D5-R5 Pilot Final Acceptance

## Result

`Pilot Final Acceptance Ready=true`

`Pilot Import Closed=true`

`Full Import Ready=false`

The final server snapshot is read-only and contains no POST, PATCH, DELETE, Publish, state action, BPF write, CRM writeback, production request or external LLM call.

## Full Readback

| Item | Expected | Readback | Result |
|---|---:|---:|---|
| Account | 7 | 7 | Pass |
| Contact | 9 | 9 | Pass |
| Opportunity | 24 | 24 | Pass |
| Service Coverage | 15 | 15 | Pass |
| Actual Management | 12 | 12 | Pass |
| Timeline | 206 | 206 | Pass |
| Interaction Signal | 154 | 154 | Pass |
| Explicit records | 427 | 427 | Pass |

Missing records, business mismatches, parent mismatches, lookup mismatches and duplicate Primary Names are all zero. The protected business hash remains `12b4fa7942f90c444cd1c8cfa4cf2f1322a027c26cca7f2bc0619f1f4c1ed56f`.

## State, Close And BPF

- Opportunity distribution: Won 7 / Active 16 / Lost 1.
- OpportunityClose: Win 7 / Lose 1 / Total 8 / duplicate 0 / attachment 0.
- Target BPF: 24 instances, 24 at `授予资格`, duplicate 0, unexpected process 0.
- Process Order: 0; definition hash unchanged.
- Actual duplicates: 0; Signal source missing: 0; Coverage window and Team mismatches: 0.
- Plugin: 7 enabled / 0 disabled.

## Ordinary User UI Acceptance

The supplied evidence is explicitly attributed to the approved ordinary non-admin Demo user in the target Modern App. It demonstrates Full Replica rendering, Won and Lost records, BPF, Timeline, Actual data, Location/POL/POD and responsive layouts without a user-facing permission, component or loading failure.

The fixed acceptance contract contains eight records across seven departments and five service families. Three unique synthetic Opportunity tokens are directly visible in the current seven attached files. The user attests that all eight fixed records were reviewed, and the existing server-side snapshot independently confirms the eight token/department/state mappings. This evidence granularity is retained as P2 rather than being rewritten as eight directly attached record images.

The DevTools images visibly contain raw Power Apps platform counters (`8` errors and `24` warnings), primarily from platform shell/resources. No custom application component failure or user-facing failure is visible. Application-specific error/warning is therefore recorded as 0/0, while the raw platform diagnostics remain a P2 disclosure.

## Gateway And Safe Context

- Safe Contexts built: 24.
- Evidence-ready scenarios: 8/8.
- Customer identity masked: true.
- Exact amount sent to model: false.
- Raw Timeline sent: false.
- CRM writeback enabled: false.
- External LLM enabled: false.
- GUID or forbidden Safe Context keys: 0.

Scenario identifiers are used only for local validation coverage and are not provider inference inputs. OpportunityClose body, Timeline body, exact amount and identity fields remain excluded.

## Requests

| Method / action | Count |
|---|---:|
| GET | 1063 |
| POST / PATCH / DELETE / Publish | 0 / 0 / 0 / 0 |
| WinOpportunity / LoseOpportunity | 0 / 0 |
| BPF writes / CRM writeback | 0 / 0 |
| Cleanup / Full Import | 0 / 0 |
| Production requests / External LLM calls | 0 / 0 |

## Issues

- P0: 0.
- P1: 0.
- P2: 2.
- P2-01: the current attachment set directly shows three unique Opportunity tokens; the remaining fixed samples rely on explicit user attestation plus exact server-side mapping.
- P2-02: raw Power Apps platform console diagnostics are visible even though no custom component or user-facing failure is shown.

## Gates

| Gate | Result |
|---|---|
| Pilot Explicit Data Integrity Ready | true |
| Pilot State Distribution Ready | true |
| OpportunityClose Integrity Ready | true |
| BPF Runtime Integrity Ready | true |
| Ordinary User D365 Runtime Ready | true |
| Seven Department UI Coverage Ready | true |
| Timeline UI Ready | true |
| Actual Coverage UI Ready | true |
| Gateway Pilot Mapping Preflight Ready | true |
| Safe Context Privacy Ready | true |
| Exact Amount Sent To Model | false |
| Raw Timeline Sent | false |
| CRM Writeback Disabled | true |
| External LLM Disabled | true |
| Business Writes | 0 |
| Production Requests | 0 |
| Pilot Final Acceptance Ready | true |
| Pilot Import Closed | true |
| Cleanup Authorized / Executed | false / false |
| Full Import Ready / Authorized | false / false |

## Evidence Boundary

Public artifacts contain synthetic tokens, counts and hashes only. Screenshot binaries remain outside Git. Exact record IDs, user/team IDs, email addresses and private manifests are not copied into these reports.
