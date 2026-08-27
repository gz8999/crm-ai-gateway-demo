# Phase 1C-6E Evidence-First Fluent UI

## Scope

Implemented the safe frontend baseline from `CRM_AI_Gateway_UI_Design_Spec_Codex_v5.md`. This change does not modify D365, Dataverse, the 100-record decision fixture, deterministic provider rules, Golden assertions, or external-AI configuration.

Runtime boundary remains:

- `AI_PROVIDER=demo`
- `ALLOW_EXTERNAL_AI=false`
- CRM writeback disabled
- External model calls disabled
- Raw CRM data sent: false

## Implemented

### Information architecture

- Default Chinese seven-module navigation: AI Cockpit, Risk & Priority, Opportunity 360, Action Board, Meeting Copilot, Portfolio Intelligence, Audit & Safety.
- Legacy AI Lab remains outside the primary navigation and its code is preserved.
- Language selector is hidden until translation coverage is complete.
- Desktop decision workspace uses three explicit regions:
  - masked opportunity and risk queue;
  - CRM Fact, AI Inference, Evidence, and Recommended Action chain;
  - sticky Confidence, Provider, Safety, Scope, and Intelligence status rail.

### Safe interaction

- Opportunity tokens are displayed as `SAFE-OPP-NNN`; raw decision fixture tokens are not shown as customer identity.
- Amount defaults to range mode. Exact amount mode requires a session-only confirmation and is never written to URL or browser storage.
- The UI states explicitly that exact amounts are not sent to a model.
- Department is the first filter but remains disabled with `CRM 部门字段待接入`; no synthetic department values were invented.
- Customer history and external facts are represented as blocked/insufficient states rather than fabricated content.

### Visual system

- Fluent-style navy command surface, restrained borders and shadows, compact enterprise density, and 6px-or-less panel radii.
- CRM Fact, AI Inference, Recommended Action, and Evidence use separate semantic bands.
- Loading, empty/error, and read-only states are explicit.
- Native provider and safety status remains visible across all decision pages.

### Localization

- Navigation, filters, page names, state labels, priorities, stages, common deterministic findings, confidence reasons, actions, and provider fallback messages are localized in the display layer.
- Deterministic provider output and Golden metadata were not changed.

## Browser verification

Verified against the running local demo at `http://127.0.0.1:5173/`:

| Viewport | Result |
| --- | --- |
| 1440 x 900 | Three columns rendered at 290 / 795 / 280 px; no page-level horizontal overflow |
| 1280 x 900 | Compact three columns rendered at 240 / 735 / 230 px; no page-level horizontal overflow |
| 760 x 900 | Single-column flow; selected risk only; context rail becomes non-sticky; no page-level horizontal overflow |

Interaction verification:

- Scenario Focus -> Healthy Control selected stable default `DEMO-6C-OPP-091` and scope 10.
- Navigation to Portfolio Intelligence retained mode, scenario, and opportunity.
- Reset restored Portfolio Mode, `multi-risk-priority`, and `DEMO-6C-OPP-075`.
- Browser console errors/warnings: 0.

## Deferred dependencies

These items require separate backend or CRM authorization and were not fabricated:

- Real CRM department field and authorized department value mapping.
- Exact amount data retrieval and permission service.
- Customer-history aggregate API.
- External intelligence sources, citations, and freshness metadata.
- Safe Timeline summary service.
- Deep Analysis top-level module and explicit external-provider workflow.

## Files

- `src/App.tsx`
- `src/decision/DecisionUi.tsx`
- `src/decision/DecisionWorkspace.tsx`
- `src/decision/display.ts`
- `src/decision/types.ts`
- `src/styles.css`
- `tests/gateway.test.mjs`
- `tests/phase1c6b-decision-ui-shell.test.mjs`
- `tests/phase1c6e-evidence-first-ui.test.mjs`

## Gates

- Chinese Default UI Ready=true
- Evidence-First Information Architecture Ready=true
- Fluent Enterprise Visual Baseline Ready=true
- Fact Inference Evidence Action Separation Ready=true
- Masked Customer Identity Ready=true
- Amount Range Default Ready=true
- Exact Amount Session Confirmation Ready=true
- Exact Amount Model Exposure=0
- Department Filter Uses Verified CRM Field=false
- Customer History Integration Ready=false
- External Intelligence Integration Ready=false
- Deep Analysis Ready=false
- External LLM Disabled=true
- CRM Writeback Disabled=true
- Raw CRM Data Exposure=0
- Responsive 1440/1280/760 Ready=true
- Browser Console P0/P1=0

The frontend baseline is ready for product review. Backend-dependent specification gates remain deferred and must not be represented as complete.
