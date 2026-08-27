# Phase 1C-5R2G-D5-R4 Remaining Six Win Actions

## Scope and authorization

- Environment: **TEST-ORG**
- Authorized action: official `WinOpportunity`, maximum six successful attempts
- Candidate source: frozen Compact Pilot State Action Plan plus current exact readback
- Excluded: completed Win Canary `DEMO-OPP-015`, completed Lose Canary `DEMO-OPP-026`, and all non-Pilot Opportunities
- PATCH / DELETE / Publish / BPF writes / LoseOpportunity: **0 / 0 / 0 / 0 / 0**
- Cleanup / Full Import: **not authorized / not started**

## Corrected GET-only preflight

The first GET-only preflight stopped because the local validator expected a top-level `actualEnd` property that the older D5-R2 private ledger does not contain. Live readback already showed the expected Win Canary state, close date, unique OpportunityClose, and unchanged BPF. The validator was corrected to use the frozen D5-R2 date `2026-05-01`; no Dataverse write occurred before the corrected preflight passed.

The corrected preflight confirmed:

- Explicit Pilot records: **427**
- Account / Contact / Opportunity: **7 / 9 / 24**
- ServiceCoverage / ActualManagement: **15 / 12**
- Imported Timeline / InteractionSignal: **206 / 154**
- Target BPF / duplicate / unexpected process: **24 / 0 / 0**
- BPF initial stage `授予资格`: **24/24**
- Plugin enabled / disabled: **7 / 0**
- Owner Teams / memberships / role assignments: **7 / 7 / 7**
- Initial state distribution Won / Active / Lost: **1 / 22 / 1**
- Protected business baseline mismatch: **0**

## Ordered actions

| # | Opportunity | Actual | Frozen revenue | Frozen actual end | Status | HTTP | Close | BPF |
|---:|---|---|---:|---|---:|---:|---:|---|
| 1 | DEMO-OPP-028 | ACT-017 | 45,871 | 2026-04-07 | 3 | 204 | 1 | A / None |
| 2 | DEMO-OPP-038 | ACT-021 | 2,102,671 | 2026-05-11 | 3 | 204 | 1 | A / None |
| 3 | DEMO-OPP-130 | ACT-084 | 5,634 | 2026-07-08 | 3 | 204 | 1 | A / None |
| 4 | DEMO-OPP-135 | ACT-087 | 4,073 | 2026-06-27 | 3 | 204 | 1 | A / None |
| 5 | DEMO-OPP-181 | ACT-117 | 10,872 | 2026-08-19 | 3 | 204 | 1 | A / None |
| 6 | DEMO-OPP-199 | ACT-129 | 183,875 | 2026-09-18 | 3 | 204 | 1 | A / None |

Each action was submitted once, followed by an exact readback before the next action. Every Opportunity changed from `0/1` to `1/3`; `actualclosedate` and `actualvalue` matched the frozen plan and Actual row. Each generated exactly one attachment-free OpportunityClose with the expected synthetic subject and description.

## Integrity readback

- Final Won / Active / Lost: **7 / 16 / 1**
- Win OpportunityClose / Lose OpportunityClose / total: **7 / 1 / 8**
- OpportunityClose attachments: **0**
- Explicit Pilot records: **427**
- Imported Timeline / InteractionSignal: **206 / 154**, unchanged
- ActualManagement / ServiceCoverage: **12 / 15**, unchanged
- Protected business hash before / after: `12b4fa7942f90c444cd1c8cfa4cf2f1322a027c26cca7f2bc0619f1f4c1ed56f` / same
- Protected baseline mismatch count: **0**
- Target BPF / duplicate / unexpected: **24 / 0 / 0**
- Initial BPF stage: **24/24**
- BPF definition hash before / after: `aac15b0adae5d1041df319b7dd187cc4a517c446725e6f2785e68939c015dbf8` / same
- Process Order: **0**
- Plugin enabled / disabled: **7 / 0**

## Request statistics

| Request | Count |
|---|---:|
| Standalone GET-only preflight runs / GET | 2 / 1036 |
| Apply-run preflight-tagged GET subset | 518 |
| Business CRM GET | 1230 |
| OpportunityClose GET | 150 |
| BPF GET | 536 |
| Security GET | 11 |
| Apply-run total GET | 1927 |
| Total D5-R4 GET | 2963 |
| WinOpportunity attempts / successes | 6 / 6 |
| LoseOpportunity | 0 |
| Ordinary business POST | 0 |
| PATCH / DELETE / Publish | 0 / 0 / 0 |
| BPF writes | 0 |
| Production requests | 0 |
| External LLM calls | 0 |

`Preflight-tagged GET` is a subset of the four Apply-run GET categories and is not added again to the Apply-run total. The two standalone preflights occurred before the Apply run and issued no writes.

## Findings and gates

- P0 / P1 / P2: **0 / 0 / 0**
- Remaining Win Actions Completed: **true**
- Remaining Win Readback Ready: **true**
- OpportunityClose Final Ready: **true**
- BPF Integrity Ready: **true**
- Non-Target Business Integrity Ready: **true**
- Pilot Final State Distribution Ready: **true**
- Pilot State Actions Completed: **true**
- Pilot Import Completed: **true**
- Pilot Exact Readback Ready: **true**
- Pilot Exact ID Manifest Ready: **true**
- Pilot Cleanup Manifest Ready: **true**
- Pilot Cleanup Authorized: **false**
- Cleanup Executed: **false**
- Full Import Started: **false**
- Full Import Ready: **false**
- Production Isolation Ready: **true**

Exact Dataverse IDs and request correlations are retained only in the ignored private Manifest. No cleanup or Full Import action was executed.
