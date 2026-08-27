# D365 Compact Pilot Gateway Mapping Preflight

## Scope

This preflight uses the frozen Compact Pilot read-only snapshot only. It does not enable an external provider, alter the Gateway UI, write CRM data, or publish a full Safe Context payload.

| Source | Pilot count | Gateway use |
|---|---:|---|
| Account | 7 | Safe account token and authorized department scope |
| Opportunity | 24 | State, status, BPF stage, relative dates and amount bands |
| Actual Management | 12 | Annual/monthly totals converted to bands and variance categories |
| Service Coverage | 15 | Service and coverage categories with evidence tokens |
| Timeline | 206 | Activity type, relative date and evidence token only |
| Interaction Signal | 154 | Structured response, sentiment, objection and commitment signals |
| OpportunityClose | 8 | Presence and outcome only; close body excluded |

## Mapping Result

- All 24 Pilot Opportunities map to a Safe Context.
- Seven approved sales-department scopes are represented.
- Won / Active / Lost is preserved as `7 / 16 / 1`.
- OpportunityClose is treated as platform evidence and never as an inferred reason.
- All eight AI scenarios have at least one evidence-ready Pilot record.
- BPF stage is a CRM fact; it is not used to invent win/loss causality.

## Scenario Coverage

| Scenario | Evidence-ready tokens | Ready |
|---|---:|---|
| stalled-high-value | 1 | true |
| budget-actual-gap | 4 | true |
| data-contradiction | 2 | true |
| growth-opportunity | 1 | true |
| location-route-risk | 1 | true |
| meeting-prep | 3 | true |
| multi-risk-priority | 5 | true |
| healthy-control | 3 | true |

The remaining four Pilot Opportunities are background-business records. They remain mappable but are not used as scenario labels in provider input.

## Safe Context Boundary

Allowed content is limited to synthetic tokens, department scope, state/stage, amount and variance bands, coverage categories, structured Interaction Signals, relative Timeline dates, and evidence tokens.

Excluded content includes customer/contact display identity, Dataverse GUIDs, exact amounts, raw Timeline text, Team/User identity, OpportunityClose body, Golden answers, and scenario identifiers used as inference inputs.

| Gate | Result |
|---|---|
| customerIdentityMasked | true |
| exactAmountSentToModel | false |
| rawTimelineSent | false |
| crmWritebackEnabled | false |
| externalLlmEnabled | false |
| Contexts containing GUID | 0 |
| Contexts containing forbidden keys | 0 |

## Conclusion

`Gateway Pilot Mapping Preflight Ready=true`

`Safe Context Privacy Ready=true`

This is a mapping preflight only. Full Import, external LLM use, CRM writeback and Cleanup remain unauthorized.
