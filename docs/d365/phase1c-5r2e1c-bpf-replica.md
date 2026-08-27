# Phase 1C-5R2E-1C BPF Replica Audit

## Scope and Safety

This audit compares the reference CRM screenshots with the custom opportunity business process flow. It is limited to the approved test environment and performs read-only metadata queries. The managed default Sales Process was not changed.

No BPF definition change was necessary in this pass: the existing custom Draft already matches the stage structure visible in the screenshots. The custom process remains Draft/Inactive and no publish, activation, application change, or business-data write was performed.

## Screenshot Evidence

Reference image index:

| Category | Files | BPF evidence |
|---|---:|---|
| Summary | 5 | Top process visible |
| Actuals | 2 | Top process visible |
| Budget/other | 2 | Top process visible |
| **Total** | **9** | **9 cross-cutting observations** |

Confirmed from the screenshots:

1. Visible process caption: `销售流程`.
2. Stage count: 2.
3. Stage order: `授予资格` then `案件关闭`.
4. Current stage: `授予资格`; elapsed-day text is visible.
5. Next stage: `案件关闭`.

The screenshots do not show an expanded process stage. They therefore do not provide reliable evidence for the full Data Step list, step required markers, hidden stages, or whether the elapsed-day text is a data value or system UI.

## Current Custom BPF

The target custom process is the unmanaged Draft process named `销售流程 - AI Demo Full Replica` for `opportunity`. It is in `CRMAIGatewayDemo`, with Draft/Inactive state and no activation or publish action.

### Stage Matrix

| Order | Screenshot stage | Current custom stage | Result |
|---:|---|---|---|
| 1 | 授予资格 | 授予资格 | Match |
| 2 | 案件关闭 | 案件关闭 | Match |

The before/after matrix is identical because no write was required.

### Current Data Steps

| Stage | Label source | Logical name | Required | Metadata |
|---|---|---|---|---|
| 授予资格 | Field metadata / BPF step | `parentaccountid` | Required | Valid Opportunity Lookup; valid for read and form |
| 案件关闭 | Field metadata / BPF step | `aigw_winprobabilityrank` | Optional | Valid Opportunity Picklist; valid for read and form |
| 案件关闭 | Field metadata / BPF step | `statuscode` | Optional | Valid Opportunity Status; valid for read and form |
| 案件关闭 | Field metadata / BPF step | `actualclosedate` | Optional | Valid Opportunity DateTime; valid for read and form |

There are no missing or duplicate steps in the current custom definition. The platform clientdata exposes internal step labels (`Step_*`) rather than a reliable screenshot-confirmed display label; the logical names and field metadata are the authoritative bindings for this audit. No unconfirmed step was added.

## Default Sales Process Difference

The managed default `Sales Process` remains unchanged and has four active English stages:

1. Qualify
2. Develop
3. Propose
4. Close

The custom process intentionally has two Chinese stages matching the screenshot. The default process is managed and active; it is used only as a read-only comparison baseline.

## English Residuals and Confirmation Items

The visible stage labels are Chinese. The following items remain unresolved because the screenshots do not expose enough evidence:

- Full process display name beyond the visible `销售流程` caption.
- Expanded Data Steps and their required markers.
- Whether the elapsed-day text is a persisted field or system-rendered UI.
- Whether additional hidden stages exist outside the captured top process.
- Exact user-facing labels for each expanded BPF step; do not infer them from internal `Step_*` names.

These are `Requires User Confirmation`, not defects. A new screenshot with the stage expanded is required before claiming complete step-level visual replication.

## Outcome

- Stage-level screenshot fidelity: **Pass**.
- Step-level complete replica: **Not claimed; evidence incomplete**.
- Current step metadata: **Pass**, all four logical names are valid and unique.
- Default Sales Process: **Unchanged**.
- Custom BPF: **Draft/Inactive**.
- Plugin: **Enabled 7 / Disabled 0**, read-only confirmation.

`R2E-1C Ready=true` for the evidence-bounded stage replica. This does not authorize activation or publish and does not represent a claim that unobserved Data Steps are complete.

## Request and Protection Counts

| Operation | Count |
|---|---:|
| GET | 11 |
| POST | 0 |
| PATCH | 0 |
| DELETE | 0 |
| Publish | 0 |
| Activation | 0 |
| Business-data writes | 0 |
| Production requests | 0 |

Protected Form, Actual Management Form/View, managed Sales Process, Plugin registration state, App, and business data were not modified.

## Next Step

Stop at R2E-1C. Do not activate or publish. If full step-level replication is required, first obtain an expanded-stage screenshot and confirm the intended step list and required flags, then perform a separate Draft-only change review.
