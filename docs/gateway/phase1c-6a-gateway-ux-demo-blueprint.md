# Phase 1C-6A CRM AI Gateway UX and Demo Intelligence Blueprint

## Decision

- Scope: analysis and documentation only.
- Frozen D365 baseline: unchanged.
- Runtime AI posture: `AI_PROVIDER=demo`, `ALLOW_EXTERNAL_AI=false`, `DATA_SOURCE=hybrid`.
- External LLM calls: `0`.
- Dataverse and business-data writes: `0`.
- Production requests: `0`.
- `Phase 1C-6B Ready=true` subject to the gates in this document.

## Executive Intent

The next experience should not be a gallery of AI functions. It should help a sales manager answer five questions in order:

1. What changed in the portfolio?
2. Which opportunities require attention now?
3. What is fact versus AI inference?
4. What action should the owner take, and why?
5. Can the recommendation be trusted and safely reused?

Every AI finding must use a common decision contract:

| Layer | Required presentation |
| --- | --- |
| CRM Fact | A value or deterministic calculation from approved Safe Context |
| AI Inference | A clearly labelled interpretation, never presented as a CRM fact |
| Evidence | Field-level safe evidence with source and freshness |
| Confidence | `High`, `Medium`, or `Low` plus a reason; never a decorative percentage |
| Recommended Action | Owner, due window, expected outcome, and draft-only status |
| Provider | Requested provider, provider used, and whether an external model was called |
| Safety | Safe Context used, raw data sent=`false`, output guard and fallback status |

## Current Gateway Inventory

### Frontend pages and navigation

The frontend is a single React application whose page state is held in `App.tsx`; it does not currently use URL-addressable routes.

| Current page state | Visible purpose | Main components | Assessment |
| --- | --- | --- | --- |
| `cockpit` | Management Cockpit | KPI summary, command center, AI summary, assistant | Keep, simplify into portfolio start page |
| `risk` | Risk Radar | driver summary, stage/risk matrix, ranked cases | Keep, make evidence and confidence first-class |
| `actionBoard` | Action Board | owner/action/rank groups and CRM draft | Keep, connect actions to findings and acceptance state |
| `opportunities` | Opportunity list | filtered records and detail launch | Merge into Cockpit drill-down and global selector |
| `detail` | Deal Brief / Opportunity detail | CRM fields, process strip, Safe Context, AI insight | Redesign as Opportunity 360 |
| `gateway` | Data Safety Gateway | raw-to-safe transform, provider status, audit log | Keep as Audit & Safety; remove raw CRM values from default view |
| `actions` | Legacy AI Lab | seven action generators | Remove from primary navigation; redistribute capabilities to decision pages |

Existing focused UI components are `Opportunity360Brief`, `RiskSummary`, `NextBestActionBoard`, `CrmDataDoctor`, `ManagementMeetingCopilot`, `CustomerGrowthAgent`, and `DraftPack`. They are useful capability prototypes, but their output contracts and visual hierarchy differ.

### API inventory

| Method and endpoint | Purpose | Side effect |
| --- | --- | --- |
| GET `/api/opportunities` | List AI-demo-scoped opportunities | None |
| GET `/api/opportunities/:id` | Read one AI-demo opportunity | None |
| GET `/api/management-dashboard` | Filtered management model | None |
| GET `/api/dynamics/status` | Connection and sync status | None |
| POST `/api/dynamics/test-connection` | Test configured Dataverse connection | Connection check only |
| POST `/api/dynamics/sync` | Refresh server memory from `[AI-DEMO]` Dataverse rows | Reads Dataverse; updates in-memory cache |
| POST `/api/gateway/transform` | Convert one record to Safe Context | Appends local audit entry |
| POST `/api/ai/:functionName` | Run five case/management AI functions | Appends local audit entry |
| POST `/api/ai-demo/chat` | Management question over safe aggregate/context | Appends local audit entry |
| GET `/api/ai/provider-status` | Provider and safety posture | None |
| GET `/api/ai-context/opportunity/:id` | Safe Context preview | None |
| POST `/api/ai-actions/:actionName` | Run seven deterministic sales actions | Appends local audit entry |
| GET `/api/audit-log` | Read local JSON audit log | None |
| POST `/api/audit-log/reset` | Clear local audit log | Local file write; keep outside demo path |

### AI functions and deterministic models

- General functions: case summary, risk analysis, next best action, follow-up email draft, meeting report note, and management summary.
- Sales actions: opportunity brief, next-best-actions, risk-summary, data-doctor, meeting-copilot, customer-growth, and draft-pack.
- Portfolio models: insight rules, Risk Radar model, Action Board model, management dashboard aggregation.
- `demoProvider` is deterministic and produces repeatable safe outputs.
- `openai-compatible` support exists but is disabled by the current environment. The router falls back to `demoProvider` if provider configuration, prompt validation, provider response, parsing, or output guard fails.

### Safe Context and provider boundary

The current pipeline is:

`CRM/mock record -> field mapping -> transform/tokenize/band/summarize/exclude -> Safe Context validation -> provider prompt allowlist -> output guard -> audit`.

Raw personal fields, exact commercial values, contract text, raw Timeline content, meeting transcripts, Location, and POL/POD are excluded. Exact revenue and margin become bands. Dates become relative status. Customer and owner identities become tokens. Commercial descriptions are sanitized summaries.

Provider audit metadata already captures provider requested/used, external model called, fallback, safe payload keys and size, response size, latency, timeout, output guard, response-format retry, blocked reason, and `raw_data_sent=false`.

### Audit and data dependencies

- Audit persistence is a local JSON store, capped at 100 records. It is demonstrable but not immutable, multi-user, or production-grade.
- Current local fixture contains 10 templates and deterministically expands to 54 synthetic opportunities by default.
- `DATA_SOURCE=hybrid` merges mapped `[AI-DEMO]` Dataverse opportunities with local synthetic opportunities by ID.
- The frozen R2E Dataverse demo records are dependencies for the D365 replica demo, not inputs to be modified by Phase 6A.

## Main Problems

### P0

None in this documentation phase.

### P1

1. Outputs do not share one enforceable fact/inference/evidence/confidence/action contract.
2. Navigation reflects implementation modules rather than the seller and manager decision flow.
3. Provider, fallback, safety, and freshness are visible in some screens but not consistently attached to every conclusion.
4. Existing generated fixtures vary values but do not intentionally cover the eight required reasoning narratives.
5. Opportunity Location and POL/POD are correctly excluded, so the requested logistics-risk scenario needs an approved derived signal rather than raw lookup values.

### P2

1. Page state is not URL-addressable, making presentation recovery and deep links harder.
2. Audit log is local JSON and resettable.
3. Confidence is absent or implicit in current outputs.
4. Legacy AI Lab duplicates capabilities and weakens the primary story.
5. Some Chinese UI strings still mix English product terms; this is acceptable where terms are deliberate but should be governed.

## Keep, Merge, Remove, Redesign

| Decision | Scope |
| --- | --- |
| Keep | Safe Context pipeline, deterministic models, provider router, output guard, audit metadata, Risk Radar scoring inputs, action drafts |
| Merge | Opportunity list into portfolio drill-down; Deal Brief and action prototypes into Opportunity 360; provider status and audit into Trust Center |
| Remove from primary navigation | Legacy AI Lab, standalone transform demo, audit reset, duplicate opportunity navigation |
| Redesign | All insight cards, confidence semantics, evidence drawer, provider/fallback badge, Meeting Copilot workflow, scenario-aware demo fixtures |

## 8-10 Minute Management Demo Storyline

| Time | Step | Management question | Evidence shown |
| --- | --- | --- | --- |
| 0:00-0:45 | Safety opening | What data is this using? | Demo provider, external disabled, Safe Context and freshness status |
| 0:45-2:00 | AI Cockpit | What changed and where should I look? | Portfolio facts, ranked exceptions, data quality |
| 2:00-3:15 | Risk Radar | Which cases require intervention? | Differentiated drivers, safe evidence, confidence |
| 3:15-5:00 | Opportunity 360 | Why is one case risky? | CRM facts versus inference, evidence drawer, contradictions |
| 5:00-6:15 | Action Board | What should happen next? | Owner, due date, recommended action, CRM draft |
| 6:15-7:15 | Meeting Copilot | What do I need before the meeting? | Questions, missing facts, safe briefing pack |
| 7:15-8:00 | Growth Finder / Data Doctor | Where is upside and what data blocks it? | Growth hypothesis and data-quality issues kept separate |
| 8:00-9:00 | Audit & Safety | Can we trust and reproduce this? | Provider used, fallback, safe keys, output guard, audit ID |
| 9:00-10:00 | Model comparison explanation | What would a third-party model add? | Same Safe Context, scoring rubric, no external call in this phase |

## Standard AI Output Contract

Future API/UI work must return and render:

```json
{
  "facts": [],
  "inferences": [],
  "evidence": [],
  "confidence": { "level": "High|Medium|Low", "reason": "" },
  "recommendedActions": [],
  "forbiddenClaimsAvoided": [],
  "provider": {
    "requested": "demo",
    "used": "demo",
    "externalModelCalled": false,
    "fallbackUsed": false
  },
  "safety": {
    "safeContextUsed": true,
    "rawDataSent": false,
    "outputGuard": "pass"
  },
  "auditId": ""
}
```

Confidence rules:

- High: all decisive signals are direct Safe Context facts and no contradiction is present.
- Medium: inference combines at least two facts or a sanitized summary, with no critical missing field.
- Low: missing/contradictory data materially affects the conclusion; the output must ask for verification.
- No model may claim probability, causality, customer intent, regulatory impact, route disruption, or guaranteed revenue without approved evidence.

## 6B-6E Minimal Route

| Phase | Minimal implementation | Entry gate | Exit gate |
| --- | --- | --- | --- |
| 6B UX shell and output contract | Route model, decision-flow navigation, shared Insight Card, Evidence Drawer, Provider/Safety strip; no new AI logic | 6A docs approved; frozen R2E tests pass | Current capabilities accessible; no raw data regression; responsive screenshots pass |
| 6C scenario intelligence | Eight local fixtures, scenario assertions, differentiated deterministic outputs, confidence rules | 6B contract stable | All scenarios produce distinct expected findings/actions; forbidden claims tests pass |
| 6D model comparison harness | Offline/sandbox evaluator over identical Safe Context; external execution only under separate authorization | 6C golden outputs approved; external AI remains disabled by default | Reproducible rubric, redacted artifacts, no raw data, explicit fallback results |
| 6E demo hardening | 8-10 minute script, deep links, resettable local demo state, accessibility/responsive/performance acceptance | 6B-6D accepted | P0/P1=0, deterministic rehearsal passes, audit and production isolation verified |

## Risks and Decisions Required

1. Approve whether 6B may add URL routing or must retain in-memory navigation.
2. Approve the exact confidence vocabulary and whether confidence is rule-derived only.
3. Decide whether Location/POL-POD may contribute only coarse derived risk categories in 6C. Raw names and codes remain forbidden.
4. Decide whether Audit Log remains a demo-only local artifact or needs an append-only store later.
5. External provider benchmarking requires a separate authorization, approved endpoint, data-processing review, and an unchanged Safe Context allowlist.
6. Decide whether Growth Finder remains a hypothesis tool or may use account-level safe aggregates in a later phase.

## 6B Readiness

`Phase 1C-6B Ready=true` because the current capabilities, safety boundary, target IA, shared output contract, scenario requirements, and implementation gates are defined without changing the frozen D365 baseline. 6B must not begin until separately authorized.
