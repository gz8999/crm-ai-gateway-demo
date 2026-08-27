# Phase 1C-6C Synthetic Scenarios and Golden Assertions

## Scope and safety

Phase 1C-6C adds a deterministic, local-only decision portfolio. It does not modify D365 or Dataverse, does not write CRM records, and does not call an external model. Runtime output remains fixed to `providerUsed=demo`, `externalModelCalled=false`, `rawDataSent=false`, and `safeContextUsed=true`.

The existing 54-record legacy dataset, Import flow, Audit Reset flow, APIs, and the 6B compatibility adapter remain separate and unchanged.

## Data model

The committed fixture is generated from a fixed seed and verified by regenerating it during tests.

| Entity | Count | Contract |
| --- | ---: | --- |
| Accounts | 20 | Five opportunities per account |
| Contacts | 20 | One synthetic contact token per account |
| Owners | 10 | Ten opportunities per owner |
| Opportunities | 100 | Stable `DEMO-6C-OPP-*` tokens |
| Actuals | 100 | Exactly one per opportunity |

Every Actual contains April-March budget revenue, budget margin, actual revenue, and actual margin. Margin rates are restricted to 5%, 8%, 10%, 12%, or 15%. Pipeline records retain a complete 12-month shape even when actual values are zero. No GUID, customer identity, address, credential, Location value, or POL/POD value is present.

## Scenario matrix

| Scenario | Count | Stable default opportunity |
| --- | ---: | --- |
| `stalled-high-value` | 15 | `DEMO-6C-OPP-001` |
| `budget-actual-gap` | 15 | `DEMO-6C-OPP-016` |
| `data-contradiction` | 12 | `DEMO-6C-OPP-031` |
| `growth-opportunity` | 12 | `DEMO-6C-OPP-043` |
| `location-route-risk` | 10 | `DEMO-6C-OPP-055` |
| `meeting-prep` | 10 | `DEMO-6C-OPP-065` |
| `multi-risk-priority` | 16 | `DEMO-6C-OPP-075` |
| `healthy-control` | 10 | `DEMO-6C-OPP-091` |

Portfolio Mode defaults explicitly to `DEMO-6C-OPP-075`. No default depends on array order or object enumeration.

## Safe Context

The Safe Context Builder converts fixture records into tokens, bands, categories, and sanitized summaries. It includes stage, priority, forecast category, relative-date state, revenue/margin/budget/actual bands, variance and elapsed-period categories, data-quality codes, transport mode, route consistency, and sanitized need/proposal/progress summaries.

Meeting Prep uses only safe derived signals: `meetingWindow`, `stakeholderCoverage`, `openQuestionCount`, and `decisionReadiness`. Timeline, email, call, meeting, and note text are excluded.

Growth Opportunity uses account-level safe aggregates computed across the complete portfolio: `serviceCoverageBand`, `whitespaceCategory`, `opportunityTrend`, and `relationshipMaturity`. Account names, contacts, exact amounts, and sibling raw records are not exposed.

Scenario IDs and scenario tags are used only for server-side scope selection and UI labels. They are absent from Safe Context and provider inputs. Exact monthly values, Location/POL-POD values, raw identities, addresses, credentials, Golden labels, expected answers, and forbidden claims are also excluded.

## Deterministic provider

The decision provider accepts only `SafeDecisionContext` and `SafeAccountAggregate`. Its rules inspect safe signals such as stagnation, variance, contradictions, route consistency, meeting readiness, whitespace, and healthy indicators. It produces a six-page `ScenarioDecisionPack` for Cockpit, Risk, Opportunity 360, Action, Meeting, and Portfolio.

Each result conforms to the 6B `UnifiedAiOutput` contract and visually separates CRM Fact, AI Inference, Evidence, Confidence, and Recommended Action. Growth conclusions remain hypotheses. Route findings recommend verification and never assert real disruption, sanctions, customs events, or delays. Healthy controls return `Monitor` with High confidence and no false escalation.

## Read-only APIs

- `GET /api/decision-scenarios` returns safe selector descriptors, counts, and stable defaults.
- `GET /api/decision-view?mode=portfolio|scenario&scenarioId=...` returns safe scope aggregates, selectors, the stable selected opportunity, and the six-page decision pack.
- `GET /api/decision-opportunities/:opportunityToken?mode=...&scenarioId=...` returns only the in-scope Safe Context, safe account aggregate, and Opportunity 360 output.

Unknown modes and scenarios return 400. Missing or out-of-scope opportunity tokens return 404. None of these responses contains raw fixture records or Golden metadata.

## UI integration

The shared Context Bar now provides Portfolio/Scenario mode, a curated scenario selector, a safe opportunity selector, and Reset Portfolio. The default is Portfolio Mode. Selecting a scenario chooses its explicit stable default; navigation across the six decision pages preserves mode, scenario, and opportunity. Reset restores Portfolio Mode and `DEMO-6C-OPP-075` without writing server state.

The six decision pages consume the same selected `ScenarioDecisionPack`. Audit & Safety reports the current mode, safe keys, provider, fallback, external-call state, and raw-data state without exposing the fixture. Existing Import, Audit Reset, legacy APIs, and compatibility behavior remain intact.

## Golden isolation and assertions

Golden evaluation metadata resides only at `tests/fixtures/decision-scenario-goldens.json`. Static dependency tests scan runtime source and reject imports or references to the Golden fixture. Tests also confirm that build/runtime data does not contain Golden metadata, Safe Context contains no scenario or expected-answer keys, and API responses expose no Golden fields.

Golden assertions cover all eight scenarios and all six outputs: contract completeness, facts/evidence/actions, evidence traceability, required findings/actions, forbidden claims, priority/confidence, provider safety, determinism, cross-scenario differentiation, meeting Timeline exclusion, account-aggregate growth evidence, route-risk restraint, healthy-control behavior, and zero raw CRM exposure.

## Browser verification

The app was exercised against the local full dev runtime with Scenario Focus and `healthy-control`, then independently checked with system Chrome at 1280x900 and 760x900. Both widths rendered all seven navigation entries, selectors, scope metrics, and decision content with no page-level horizontal overflow or invalid geometry. The 760px navigation uses a compact two-row layout. No application console or page errors were observed; the only 1280 run message was a non-functional missing favicon request.

## Changed components

- Deterministic generator and committed fixture
- Safe Context and account aggregate builder
- Deterministic decision provider and decision service
- Three read-only API routes
- Shared decision types and Decision Workspace UI
- Portfolio/Scenario Context Bar and responsive styles
- Golden fixtures and Phase 6C regression tests

## Issues

- P0: 0
- P1: 0
- P2: 1 - the development server does not provide a favicon; this has no decision-workflow or safety impact.

## Verification

- `npm test`: 197/197 passed
- `npm run build`: passed
- `git diff --check`: passed
- Sensitive scan: passed; no credential, production hostname, absolute user path, raw CRM identity, or external-model enablement introduced
- 1280px browser smoke: passed
- 760px browser smoke: passed

## Completion gates

- Eight Scenarios Ready=true
- Safe Context Fixtures Ready=true
- Unified Contract Compliance=true
- Golden Assertions Ready=true
- Forbidden Claims Ready=true
- Healthy Control Ready=true
- Scenario UI Integration Ready=true
- Deterministic Demo Provider Ready=true
- Import Reset Ready=true
- CRM Writeback Disabled=true
- External LLM Disabled=true
- Raw CRM Data Exposure=0
- P0/P1=0
- Phase 1C-6D Ready=true
