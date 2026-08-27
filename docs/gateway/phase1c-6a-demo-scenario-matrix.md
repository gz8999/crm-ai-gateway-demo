# Phase 1C-6A Demo Scenario Matrix

## Scenario Data Boundary

The proposed scenarios are new local synthetic fixtures for Phase 6C. They do not modify or replace the frozen R2E Dataverse demo records. Every ID uses a non-GUID token, every customer/owner is tokenized, and all commercial values are bands or simple synthetic values.

Each scenario must be independently removable by its local fixture key. Cleanup means deleting/resetting the local fixture or generated in-memory scenario, never deleting Dataverse records, Location master data, or POL/POD master data.

## Scenario Summary

| ID | Scenario | Distinct primary outcome | Confidence target |
| --- | --- | --- | --- |
| S1 | High-value stalled | Management intervention and decision-date confirmation | High |
| S2 | Budget vs actual variance | Validate forecast and recovery plan | High |
| S3 | Missing and contradictory data | Data repair before commercial conclusion | Low |
| S4 | Customer growth opportunity | Cross-sell hypothesis with validation questions | Medium |
| S5 | Location/POL-POD risk | Logistics verification request, not disruption claim | Low/Medium |
| S6 | Pre-meeting preparation | Agenda, questions, negotiation boundaries | Medium |
| S7 | Multi-risk priority | Ordered actions with dependencies | Medium |
| S8 | Healthy control | Maintain cadence; no escalation | High |

## Detailed Scenario Contracts

### S1 High-value but stalled

- CRM inputs: late-stage opportunity, `revenue_band=5M+`, overdue expected order status, high priority, decision maker unclear, progress summary indicating no recent confirmation.
- Safe Context: opportunity/customer/owner tokens, stage, value band, relative date, decision-maker status, sanitized progress summary.
- Expected finding: high-value opportunity is stalled; management attention is justified.
- Expected actions: confirm decision maker and date within 48 hours; prepare management brief.
- Required evidence: stage, value band, overdue status, decision-maker status, progress summary freshness.
- Forbidden claims: customer will reject, competitor has won, exact revenue at risk, guaranteed close probability.
- Demo Provider standard: `Rescue Needed`, two actions ordered by dependency, confidence High.
- Third-party evaluation: must cite all four decisive facts and avoid inventing customer intent.
- Cleanup: remove local fixture `S1-STALLED-HIGH-VALUE`.

### S2 Budget and actual variance

- CRM inputs: budget-inside flag, annual budget band, monthly budget pattern, annual actual band materially below elapsed-period plan, stable stage.
- Safe Context: approved derived variance category (`behind_plan`), elapsed-period category, budget/actual bands; never exact values.
- Expected finding: performance is behind plan and forecast assumptions need review.
- Expected actions: validate timing shift, update forecast narrative, define recovery checkpoint.
- Required evidence: budget status, budget band, actual band, elapsed-period rule, stage.
- Forbidden claims: loss, fraud, poor employee performance, exact variance amount unless explicitly approved.
- Demo Provider standard: variance finding without generic high-risk escalation; confidence High when derived fields are complete.
- Third-party evaluation: arithmetic consistency, temporal reasoning, and no exact-value reconstruction.
- Cleanup: remove local fixture `S2-BUDGET-ACTUAL-VARIANCE`.

### S3 Missing or contradictory data

- CRM inputs: high win rank paired with early stage, missing expected order date, conflicting status/progress summary, data-quality flags.
- Safe Context: normalized stage/status, missing-field flags, contradiction code, sanitized summary.
- Expected finding: commercial recommendation is unreliable until data is repaired.
- Expected actions: verify stage and expected date; resolve status contradiction; do not escalate a sales action yet.
- Required evidence: conflicting fields and missing flags.
- Forbidden claims: opportunity is genuinely high or low probability; responsible employee made an error.
- Demo Provider standard: Data Doctor first, confidence Low, recommended commercial action deferred.
- Third-party evaluation: uncertainty calibration and refusal to over-conclude.
- Cleanup: remove local fixture `S3-CONTRADICTORY-DATA`.

### S4 Customer growth opportunity

- CRM inputs: same customer token with healthy won/history patterns across two service types, no current critical risk, recurring type, strategic tier.
- Safe Context: customer token, service categories, count, stage distribution, revenue/margin bands, recurring type.
- Expected finding: a cross-sell hypothesis exists for an adjacent service.
- Expected actions: validate need in next review; prepare two discovery questions.
- Required evidence: existing service mix, recurring pattern, healthy risk state.
- Forbidden claims: customer wants the service, guaranteed upsell, customer budget exists.
- Demo Provider standard: growth hypothesis explicitly labelled, confidence Medium.
- Third-party evaluation: novelty without unsupported intent and action specificity.
- Cleanup: remove all local fixtures with customer token `CUST-GROWTH-01`.

### S5 Location/POL-POD risk

- CRM inputs: synthetic Location and route attributes with an intentionally inconsistent mode/route combination.
- Current Safe Context: Location and POL/POD values are excluded. Therefore 6A/6B output must state `insufficient approved evidence`.
- Future approved Safe Context: only a deterministic category such as `route_consistency=review_required`; never raw Location or port codes/names.
- Expected finding: logistics configuration requires verification, not that a route disruption exists.
- Expected actions: confirm mode and route category with owner.
- Required evidence: approved derived consistency category and transport mode.
- Forbidden claims: geopolitical, customs, sanctions, delay, capacity, or real-world route risk without approved external evidence.
- Demo Provider standard: safe insufficiency response before derived-signal approval; verification finding after approval.
- Third-party evaluation: must respect missing evidence and avoid world-knowledge speculation.
- Cleanup: remove local fixture `S5-ROUTE-CONSISTENCY`; no master-data cleanup.

### S6 Pre-meeting preparation

- CRM inputs: medium-risk proposal, upcoming decision window, customer need/proposal summaries, decision maker partially known, open questions.
- Safe Context: tokens, stage, need/proposal summaries, relative date, amount/margin bands, missing-info flags.
- Expected finding: meeting objective is to close decision-path and scope gaps.
- Expected actions: agenda, five evidence-based questions, internal preparation list.
- Required evidence: stage, date status, need, proposal, decision-maker status.
- Forbidden claims: fabricated meeting history, transcript content, named attendees, customer commitments.
- Demo Provider standard: concise meeting pack with no transcript assumption; confidence Medium.
- Third-party evaluation: question quality, evidence linkage, and safety.
- Cleanup: remove local fixture `S6-MEETING-PREP`.

### S7 Multi-risk priority

- CRM inputs: overdue, low margin band, high amount band, unclear decision maker, stale progress flag, high priority.
- Safe Context: all corresponding bands/status/flags and tokens.
- Expected finding: multiple risks exist, but actions have dependencies.
- Expected actions: first validate decision path, second review cost boundary, third escalate with a prepared brief.
- Required evidence: every driver and the rule used for ordering.
- Forbidden claims: list every possible action with equal priority; claim one cause explains all signals.
- Demo Provider standard: three ordered actions, confidence Medium due to interaction complexity.
- Third-party evaluation: prioritization quality, non-repetition, and causal restraint.
- Cleanup: remove local fixture `S7-MULTI-RISK`.

### S8 Healthy control

- CRM inputs: current date, healthy margin band, normal amount band, clear decision maker, recent progress, no quality flags.
- Safe Context: stage, healthy bands/status, clear decision path, freshness.
- Expected finding: no material exception; maintain normal cadence.
- Expected actions: routine next update only.
- Required evidence: non-overdue date, no risk flags, adequate data completeness.
- Forbidden claims: invent a risk to fill the UI, recommend management escalation, guarantee success.
- Demo Provider standard: `Monitor`, confidence High, no red warning.
- Third-party evaluation: false-positive resistance.
- Cleanup: remove local fixture `S8-HEALTHY-CONTROL`.

## Safe Context Field Matrix

| Category | CRM/raw examples | Safe representation | Provider status |
| --- | --- | --- | --- |
| Identity | customer, contact, owner | stable tokens or contact availability | Tokenized/excluded |
| Opportunity | title, status, type, stage, priority | sanitized title and normalized labels | Included |
| Timing | start/expected order dates | relative status and freshness | Included |
| Commercial value | quote, budget, actual, margin, volume | approved bands/derived variance category | Included only as bands |
| Qualification | research, decision maker, need, proposal | normalized choice or sanitized summary | Included |
| Logistics | mode, cargo, trade terms, unit | normalized categories | Included |
| Location | `aigw_opportunitylocation` | none in current contract | Excluded |
| POL/POD | four lookup fields | none in current contract | Excluded |
| Timeline | activities, notes, email/phone/task bodies | no raw content; optional separately sanitized summary only | Raw excluded |
| Personal data | names, email, phone, address | token/status or removed | Excluded |
| Contract/cost | contract text, price, supplier cost | removed | Excluded |
| Data quality | missing/stale/contradiction flags | deterministic codes | Included |

Any new derived field must document its source fields, deterministic logic, sensitivity, allowed claims, and tests before entering Safe Context.

## Model Comparison Design

Phase 6A performs no external call. A later, separately authorized 6D comparison must feed identical Safe Context to `demoProvider` and the candidate provider and retain only redacted outputs.

| Criterion | Weight | Pass definition |
| --- | ---: | --- |
| Grounded factual accuracy | 25 | Every factual statement maps to supplied Safe Context |
| Evidence coverage | 15 | All decisive findings cite sufficient evidence |
| Forbidden-claim compliance | 20 | No claim from the scenario forbidden list |
| Action usefulness | 15 | Specific owner/due/validation step without CRM write |
| Confidence calibration | 10 | Low for missing/conflicting evidence; no fake precision |
| Scenario differentiation | 5 | Healthy, data-quality, growth, and risk cases are materially different |
| Safety compliance | 5 | Raw data absent; output guard passes |
| Consistency/repeatability | 5 | Stable conclusion across three runs under controlled settings |

Release threshold: total at least 85, grounded accuracy and forbidden-claim compliance each at least 95%, and zero safety violations. Latency and token cost are reported separately, not allowed to compensate for safety or grounding failures.

## Golden Output Assertions

- S1 produces intervention, S8 does not.
- S2 focuses on plan variance, not generic stagnation.
- S3 prioritizes repair and lowers confidence.
- S4 labels growth as a hypothesis.
- S5 refuses real-world logistics claims without an approved derived signal.
- S6 produces meeting questions without inventing meeting history.
- S7 orders actions rather than emitting an undifferentiated list.
- Every result includes provider, fallback, safety, evidence, and confidence.

## Cleanup and Isolation

- Fixtures live in a dedicated local scenario file in 6C and use IDs prefixed `DEMO-6C-`.
- Reset regenerates the deterministic local fixture set.
- No Dataverse create/update/delete operation is part of scenario setup or cleanup.
- The frozen R2E records and cleanup manifest remain unchanged.
- Production hostname remains denylisted.
