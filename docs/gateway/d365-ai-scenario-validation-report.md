# D365 AI Scenario Validation Report

## Validation Principle

Scenario names are used only by offline acceptance documentation and tests. They are not read by the D365 runtime, are not placed in Safe Context, and are not passed to the Demo Provider as inference rules. Runtime findings are derived from CRM facts and safe categorical signals.

## Eight Decision Lenses

| Lens | CRM evidence required | Safe derived signal | Runtime safety result |
| --- | --- | --- | --- |
| stalled-high-value | state, timing, amount band, progress signals | severe stagnation plus high revenue band | High or Critical only when evidence supports it |
| budget-actual-gap | budget/actual aggregates and margin bands | material negative variance | High with variance evidence |
| data-contradiction | missing fields, inconsistent budget/state/close facts | contradiction and missing codes | Lower confidence; no invented fact |
| growth-opportunity | account coverage and sibling opportunity aggregates | whitespace, trend and relationship maturity | Hypothesis only; no customer identity |
| location-route-risk | transport mode and lookup presence | route consistency | Verification recommendation only; no external disruption claim |
| meeting-prep | meetingWindow, stakeholderCoverage, openQuestionCount, decisionReadiness | meeting readiness | No Timeline raw text, email or transcript |
| multi-risk-priority | multiple independent safe signals | combined priority | Queue ordering uses evidence, not a hidden score |
| healthy-control | aligned timing, data quality and progress signals | healthy cadence | Monitor / High confidence; no fabricated High/Critical risk |

## Acceptance Checks

- All eight lenses have a documented evidence path in the frozen D365 contract and prior acceptance evidence.
- Fact, inference, evidence and recommended action are generated as separate fields.
- Evidence sources refer to Safe Context keys or account aggregates only.
- Meeting Copilot uses only four safe meeting-derived fields and explicitly excludes Timeline raw text.
- Growth Opportunity uses account-level aggregates and is labeled a hypothesis.
- Location findings do not claim real-world delay, customs, sanctions, carrier events or external intelligence.
- Healthy Control cannot be upgraded to High/Critical by a healthy-only context.
- No scenario ID, Golden label or expected answer appears in the D365 API payload, Safe Context or Provider input.

## Live Status

The injected 200-record runtime tests pass. A live D365 GET smoke is pending because this local checkout has no configured D365 URL/credentials. That pending operational check is intentionally separate from the code-level safety gate.
