# Phase 1C-6A UI Information Architecture

## Design Principle

Organize the experience around decisions, not model names. The persistent question is: "What must I decide or do next, and what evidence supports it?"

## Proposed Navigation

| Order | Destination | Primary user job | Current capabilities absorbed |
| --- | --- | --- | --- |
| 1 | AI Cockpit | Understand portfolio movement and exceptions | Management Cockpit, AI assistant, opportunity list summary |
| 2 | Risk & Priority | Rank cases and compare risk drivers | Risk Radar, priority ranks, top-risk list |
| 3 | Opportunity 360 | Understand one case and decide the next move | Deal Brief, Opportunity 360 Brief, Risk Summary, Draft Pack |
| 4 | Action Board | Assign and track recommended next actions | Action Board, Next Best Actions |
| 5 | Meeting Copilot | Prepare a pipeline or customer meeting | Management Meeting Copilot, meeting questions, report draft |
| 6 | Portfolio Intelligence | Find growth and repair data | Growth Finder and Data Doctor as two tabs |
| 7 | Audit & Safety | Explain provenance, provider, fallback, and data boundary | Safety Gateway, provider status, transform trace, Audit Log |

Legacy AI Lab is removed from the primary navigation. Its actions survive in the relevant decision workspace.

## Global Shell

### Persistent header

- Demo environment badge: `Synthetic / Test Only`.
- Data source and last refresh.
- Provider requested and used.
- External AI status.
- Fallback state.
- Safe Context status and `Raw CRM sent: No`.
- Language and role selectors.

### Persistent context bar

- Active filters.
- Selected opportunity/customer token.
- Data freshness.
- Scenario label in demo mode.
- One-click link to the associated audit entry.

## Page Blueprints

### AI Cockpit

Purpose: move from portfolio fact to attention queue in under 30 seconds.

1. Portfolio fact strip: open count, high-risk count, overdue count, data-quality score.
2. "What changed" exceptions, not generic KPI cards.
3. Top three decisions: intervene, follow up, validate data.
4. Scenario-diverse opportunity queue with driver labels.
5. Management question input limited to supported intents.

Avoid: oversized hero copy, duplicate charts, and model-centric labels.

### Risk & Priority

1. Driver filters: stagnation, value, margin, contradiction, missing data, logistics signal.
2. Stage-by-risk matrix.
3. Ranked cases with fact, inference, confidence, and evidence preview.
4. Compare drawer for two or three cases.
5. Send to Action Board as a draft only; no CRM write.

### Opportunity 360

Tabs:

1. Decision Brief: facts, key inference, confidence, action.
2. Evidence: safe field/value/source/freshness matrix.
3. Risks & Contradictions: multiple findings with conflict markers.
4. Actions & Drafts: recommended action, owner, due window, reusable draft.
5. Meeting Prep: questions, missing information, negotiation boundary.
6. Safety Trace: provider and audit details for this generation.

The screen never shows an AI inference in the CRM Fact column. Drafts must be labelled `Not written to CRM`.

### Action Board

- Group by decision urgency first, owner second.
- Each item links to the source finding and evidence.
- State model: Proposed, Reviewed, Accepted for Demo, Dismissed. These are local demo states, not CRM writes.
- Show due window and expected impact as hypotheses.
- Separate management escalation from routine follow-up.

### Meeting Copilot

- Meeting type selector: pipeline review or single-customer preparation.
- Agenda from portfolio facts.
- Top decisions and unresolved questions.
- Evidence-linked talking points.
- Forbidden-claim checklist.
- Copyable minutes/draft that contains tokens and bands only.

No transcript ingestion is allowed under the current Safe Context contract.

### Portfolio Intelligence

**Growth Finder tab**

- Customer token portfolio pattern.
- Existing business types and safe revenue/margin bands.
- Growth hypothesis, supporting evidence, confidence, validation question.
- Never claim customer intent or guaranteed growth.

**Data Doctor tab**

- Missing, stale, contradictory, and format issues.
- Business impact separated from model impact.
- Suggested repair with no automatic Dataverse write.
- Confidence automatically reduced when critical evidence is missing.

### Audit & Safety

Default view:

- Request/audit ID and timestamp.
- Function and scenario.
- Provider requested/used.
- External model called, fallback reason, output guard.
- Safe payload keys, not raw payload values.
- Raw data sent=`false`.

Advanced view:

- Field transformation method and masked preview.
- Removed field categories.
- Safe Context validation result.
- Output validation result.

Audit reset is hidden from the main demo and requires an explicit local maintenance action.

## Shared Insight Card

Every page uses the same compact structure:

1. Finding title and severity.
2. CRM Facts.
3. AI Inference badge.
4. Evidence chips with source/freshness.
5. Confidence with reason.
6. Recommended action, owner, due window.
7. Provider/Safety footer.

Cards must support `No finding` and healthy-control states; absence of risk is not rendered as an error.

## User Flows

### Manager flow

AI Cockpit -> Risk & Priority -> compare cases -> Opportunity 360 -> accept a draft action -> Meeting Copilot -> Audit & Safety.

### Sales owner flow

Opportunity 360 -> inspect evidence -> review next action -> prepare customer questions -> copy a safe draft -> return to CRM manually.

### Data steward flow

Portfolio Intelligence -> Data Doctor -> inspect missing/contradictory fields -> view Safe Context impact -> export repair checklist; no automatic correction.

## Responsive Behavior

- Desktop: dense two-column work surface with persistent evidence drawer.
- Narrow desktop/tablet: single-column content, evidence drawer as side sheet.
- Mobile: read-only summary and action review; complex compare tables become stacked lists.
- BPF-like progress, filters, and provider strips must not overlap or force horizontal page scrolling.
- Text size remains token-based rather than viewport-scaled.

## Current-to-Target Mapping

| Current | Target | Treatment |
| --- | --- | --- |
| Management Cockpit | AI Cockpit | Simplify and make exception-driven |
| Risk Radar | Risk & Priority | Add evidence/confidence/compare |
| Action Board | Action Board | Add finding lineage and review state |
| Opportunities | AI Cockpit queue / global search | Merge |
| Deal Brief | Opportunity 360 | Redesign |
| Safety Gateway | Audit & Safety | Redesign, preserve pipeline |
| AI Lab | Distributed capabilities | Remove from primary nav |
| AI assistant | AI Cockpit supported questions | Keep with explicit intent scope |

## Acceptance Gates for 6B

- All current capabilities have one destination; no orphan feature.
- Every inference uses the shared output contract.
- Provider and safety state appear globally and on each generated result.
- Facts and inferences are visually and semantically distinct.
- No Dataverse write control is introduced.
- Current Safe Context denylist and output guard tests remain green.
- Desktop and narrow-window screenshots have no overlap, clipping, or horizontal overflow.
