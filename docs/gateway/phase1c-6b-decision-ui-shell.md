# Phase 1C-6B Decision UI Shell and Unified AI Output Contract

## Decision

- Implementation boundary: Gateway frontend, compatibility types, provider-status response, tests, and this report only.
- D365/Dataverse changes: `0`.
- CRM business writes introduced: `0`.
- Runtime posture: `AI_PROVIDER=demo`, `ALLOW_EXTERNAL_AI=false`.
- External model calls during implementation: `0`.
- Formal 6C scenarios added: `0`.

## Navigation

### Before

The primary navigation exposed Management Cockpit, Risk Radar, Action Board, Opportunities, Deal Brief, Safety Gateway, and Legacy AI Lab. This followed implementation modules and duplicated capabilities.

### After

The persistent decision navigation is:

1. AI Cockpit
2. Risk & Priority
3. Opportunity 360
4. Action Board
5. Meeting Copilot
6. Portfolio Intelligence
7. Audit & Safety

The opportunity selector moved to the persistent context bar. Legacy AI Lab remains in source for compatibility but has no primary-navigation control. Its deterministic action components are reused by Meeting Copilot and Portfolio Intelligence. Existing opportunity-list and Legacy page states remain available internally and were not deleted.

## Page and Route Matrix

| Page | Existing capability reused | 6B shell behavior |
| --- | --- | --- |
| AI Cockpit | Management Cockpit and top risk | Portfolio summary plus unified top-decision card |
| Risk & Priority | Risk Radar | Ranked risk, evidence, confidence, and action contract |
| Opportunity 360 | Deal Brief | Safe facts and record-specific decision contract |
| Action Board | Action Board | Source evidence, priority, confidence, and draft-only action |
| Meeting Copilot | Management Meeting Copilot | Read-only generation shell; no email or Activity creation |
| Portfolio Intelligence | Customer Growth Agent and CRM Data Doctor | Growth Finder/Data Doctor segmented workspace |
| Audit & Safety | Data Safety Gateway and Audit Log | Existing transform/audit functions with global provider boundary |

Navigation remains in-memory in 6B. URL routing and deep links remain a 6E hardening item.

## Unified Output Contract

`src/decision/contract.ts` defines `UnifiedAiOutput` with:

- `fact`
- `inference`
- `evidence`
- `confidence`
- `recommendedAction`
- `priority`
- `providerUsed`
- `fallbackReason`
- `safeContextUsed`
- `externalModelCalled`
- `rawDataSent`

Facts and evidence carry a source. Confidence uses `High`, `Medium`, or `Low` plus a reason and is never rendered as a CRM fact or percentage. Recommended actions carry owner, due window, reason, and `Draft only` status.

## Compatibility Adapter

The backend response shape is unchanged. `adaptRiskCase`, `adaptActionBoardItem`, and `adaptLegacyActionResult` translate current deterministic models into the shared UI contract. The adapter selects only known safe token, band, summary, evidence, and action fields. Existing provider endpoints, imports, reset, deterministic fallback, and action generators remain available.

The provider-status response now includes its existing router `fallbackReason`; this is additive and does not change current clients. `AiProviderStatus.fallbackReason` is optional for backward compatibility.

## Visual Semantics

- CRM Fact: neutral cool background and field/source rows.
- AI Inference: warm evidence-review background and explicit `Inference is not a CRM fact` note.
- Recommended Action: blue work surface with owner, due window, and draft-only status.
- Evidence: source-labelled chips.
- Confidence: a separate panel with level and reason.
- Provider/Safety: persistent strip plus result footer.

The shell uses dense operational layouts, 6px-or-smaller radii, stable grids, and narrow-window stacking. It does not introduce a landing page, hero marketing composition, decorative imagery, or nested promotional cards.

## Safety Status

Every page receives the persistent status strip:

- Provider used
- Fallback reason
- Safe Context status
- External model status
- Raw CRM sent
- Synthetic/Test boundary

New decision components contain no CRM write endpoint and do not read raw identity, exact commercial values, Timeline text, Location, or POL/POD. They consume existing Safe Context-derived models only. Meeting Copilot is explicitly labelled as a read-only draft. Action Board remains a local recommendation surface.

## Modified Files

- `src/App.tsx`
- `src/styles.css`
- `src/types.ts`
- `src/decision/contract.ts`
- `src/decision/DecisionUi.tsx`
- `server/app.mjs`
- `tests/phase1c6b-decision-ui-shell.test.mjs`
- `docs/gateway/phase1c-6b-decision-ui-shell.md`

## Deferred Work

1. 6C owns the eight formal synthetic scenarios and differentiated golden outputs.
2. URL-addressable routing and presentation recovery remain deferred.
3. Audit persistence remains local and resettable.
4. Meeting drafts remain deterministic and read-only; no transcript ingestion is allowed.
5. Location and POL/POD remain excluded until an approved derived signal exists.
6. External provider comparison requires separate 6D authorization.

## Issues

- P0: `0`.
- P1: `0`.
- P2: in-memory navigation has no deep links; Audit Log remains local; the existing legacy implementation remains in the bundle although hidden from navigation.

## Verification

The 6B tests assert the seven destinations, hidden Legacy navigation, complete output contract, fact/inference/action separation, provider/fallback/safety display, additive provider response, absence of new writeback code, and absence of sensitive raw-field access in the new decision layer.

Browser verification covered the running full stack at 1280x720 and a 760px narrow viewport. The body stayed within the viewport at both widths; the seven-item navigation intentionally becomes an internally scrollable toolbar at the narrow breakpoint. Meeting Copilot rendered the shared CRM Fact, AI Inference, Recommended Action, Evidence, confidence, and provider/safety regions. Browser console errors and warnings were `0`.

## Gates

- Main Navigation Ready=`true`
- Decision UI Shell Ready=`true`
- Unified AI Output Contract Ready=`true`
- Fact Inference Action Separation Ready=`true`
- Evidence And Confidence Ready=`true`
- Provider Safety Status Ready=`true`
- Legacy Compatibility Ready=`true`
- CRM Writeback Disabled=`true`
- External LLM Disabled=`true`
- Raw CRM Data Exposure=`0`
- Existing Import Reset Ready=`true`
- P0/P1=`0`
- Phase 1C-6C Ready=`true`
