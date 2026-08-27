# Phase 1C-5R2E-2D5 Opportunity Full Browser Acceptance

## Scope And Safety

- Environment: `org91f5f65f.crm5.dynamics.com`
- Modern App: `CRM AI Gateway Demo - Modern`
- App ID: `916afe4b-607e-f111-ab0e-002248eb1915`
- Full Replica: `AI Gateway Opportunity Demo - Full Replica`
- Form ID: `97a1555b-0903-408a-ac63-d63aed65b14a`
- Validation mode: browser-only visual/runtime checks plus independent read-only Dataverse GET verification.
- No record, activity, note, app, form, view, BPF, plugin, or solution write was performed.
- No production request was made.

## Modern App And Opportunity List

| Check | Result |
| --- | --- |
| App header | `CRM AI Gateway Demo - Modern` rendered successfully |
| Navigation | `Actual Management`, `Opportunities`; no duplicate or generic Entity page observed |
| Opportunity View | `所有案件 - AI Demo Full Replica` |
| View ID | `75fd4002-b7bc-4a4a-bb2d-87ac0b002cfe` |
| View route | List page loaded with search, filter, sort/view controls and visible `[AI-DEMO]` rows |
| List data | Existing demo records opened read-only; no row was edited or saved |
| Page errors | No 404, permission, form-load, or component error observed |

The approved browser session remained on the designated test hostname. The screenshot index is in `local-artifacts/d365/runtime-validation/r2e2d5/` and is intentionally ignored by Git.

## Full Replica Route And Structure

The browser showed the Full Replica visual signature on an existing `[AI-DEMO]` Opportunity. The Form GUID was not inferred from the page title: an independent published Form GET confirmed the route target and state.

| Check | Result |
| --- | --- |
| Published Form | `AI Gateway Opportunity Demo - Full Replica` / `97a1555b-0903-408a-ac63-d63aed65b14a` |
| Activation | Active |
| Default | Non-default |
| Tabs / Sections / Controls / unique fields | `5 / 19 / 115 / 106` |
| Published FormXML hash | `df276f8171c96919da092d31cc80f8837687009ce001b222ecd3b0af458f2c8e` |
| Published FormJSON hash | `e37905937b683b21676e8da07251cfe5c516034988a3a67e93afd92911e97c67` |
| Browser tabs | `摘要 → 预算 → 实绩 → 产品 → 文件` |
| Header | `受注确度 → 是否预算内 → 负责人` |
| Deprecated CNY control | `aigw_yearrevenueactualcny`: 0 |
| Wrong base binding | `actualvalue_base`: 0 observed |
| POL/POD | Four visible Lookup controls in the expected order |
| Layout quality | No undefined text, duplicate target control, horizontal overflow, or component-load error observed |

The native Timeline is present exactly once:

- FormXML control ID: `notescontrol`
- Control name: `aigw_timeline_control`
- Class ID: `{06375649-C143-495E-A496-C962E5B4488E}`
- Legacy/dropdown Timeline controls: `0`

## Five-Tab Acceptance Matrix

| Order | Tab | Evidence | Result |
| ---: | --- | --- | --- |
| 1 | 摘要 | Summary screenshot and DOM snapshot; header, actual totals, Timeline, and POL/POD visible | Pass |
| 2 | 预算 | Tab opened and screenshot captured; budget layout rendered without load error | Pass |
| 3 | 实绩 | Tab opened; Subgrid rendered with the configured empty state | Pass |
| 4 | 产品 | Tab opened and screenshot captured; no blank-tab or component error observed | Pass |
| 5 | 文件 | Tab opened and screenshot captured; no blank-tab or component error observed | Pass |

### Field State Checks

- `aigw_yearrevenueactual`: one published control, `disabled="true"`.
- `aigw_yearrevenueactual_base`: one published control, `disabled="true"`.
- `aigw_yearrevenueactualcny`: no control.
- Browser lock indicators were visible for the two annual total fields.
- No `_base` duplicate was visible in the Full Replica UI.
- The BPF shown at runtime is the platform English `Sales Process` with `Qualify → Develop → Propose → Close`; this is expected because the custom BPF remains Draft/Inactive and was not activated in this phase.

## Native Timeline

| Runtime element | Result |
| --- | --- |
| Search | `Search timeline` visible |
| New command | Visible |
| Filter / sort / refresh / more | Visible |
| Note composer | `Enter a note...` visible |
| Attachment affordance | Visible |
| Activity state | `Get started` empty state; no activity cards |
| Write behavior | No activity or note was created |

The Timeline is a real native control, not a blank section. Its empty state is expected for the current record and was not changed during validation.

## Actual Management Subgrid

The `实绩` Tab displayed one configured Subgrid with the following runtime signature:

- Control: `aigw_actualmanagement_subgrid`
- Relationship: `aigw_opportunity_actualmanagement`
- View: `实绩管理 - AI Demo`
- View ID: `7a00b267-977c-f111-ab0e-000d3a857307`
- Related-records behavior: rendered as related records for the current Opportunity
- Search: visible
- View selector: visible in the control configuration/read-back
- Rows: 10 in the saved definition
- Runtime rows: 0; normal empty state
- Duplicate target Subgrid: none observed

The Subgrid loaded without a relationship, table, or infinite-loading error. No Actual Management record was created.

## Actual Management Page

| Check | Result |
| --- | --- |
| Navigation | `Actual Management` opened successfully |
| View | `实绩管理 - AI Demo` / `7a00b267-977c-f111-ab0e-000d3a857307` |
| View grid | Loaded with the configured 33-column view and no rows |
| Empty state | `We didn't find anything to show here`, `Rows: 0` |
| Main Form | Not opened because no existing safe demo Actual record was present; no record was created to force this path |

Independent metadata read-back confirmed the Actual Management Main Form:

- `实绩管理 - AI Demo` / `e0537d47-a5f7-45a3-b607-608e7e831700`
- `1 / 5 / 41` Tabs / Sections / Controls
- `aigw_annualactualrevenue`: one control, `disabled="true"`
- No `_base` control

## Server-Side Read-Back And Protection

| Component | Current result |
| --- | --- |
| Full Replica | Active, Non-default, `5 / 19 / 115 / 106` |
| Native Timeline | 1; `notescontrol`; legacy count 0 |
| Actual Form | `1 / 5 / 41`; annual field read-only |
| Actual View | 33 columns; unmanaged; target table `aigw_actualmanagement` |
| Opportunity View | Correct name, target type `opportunity`, unmanaged |
| Protected Form | XML hash remains `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7` |
| Custom BPF | `销售流程 - AI Demo Full Replica`; Draft/Inactive |
| Plugin | 1 Assembly, 3 Types, 7 Steps enabled, 0 disabled, 6 Images |
| App | Published Modern App read-back unchanged during this phase |

The published and unpublished Full Replica FormXML hashes are different (`df276f...f2c8e` vs `ff7e28...59c7c`), while both definitions retain the required 5/19/115/106 structure and native Timeline. The difference is recorded as a non-blocking publish-layer observation; no write or corrective action was taken during this read-only acceptance.

## Screenshot Index

| File | Evidence |
| --- | --- |
| `01-modern-app-navigation.png` | Modern App header and navigation |
| `02-opportunity-list.png` | Opportunity View and existing demo rows |
| `03-full-replica-summary.png` | Full Replica Summary, header, actual totals, Timeline, POL/POD |
| `04-budget-tab.png` | Budget Tab |
| `05-actuals-tab.png` | Actuals Tab and empty Actual Management Subgrid |
| `06-products-tab.png` | Products Tab |
| `07-files-tab.png` | Files Tab |
| `08-timeline.png` | Timeline close-up |
| `09-actual-management-view.png` | Actual Management View empty state |

## Issues

| Priority | Finding | Decision |
| --- | --- | --- |
| P0 | No page-open, routing, production-access, or business-write blocker | None |
| P1 | No critical Tab, Timeline, Subgrid, read-only, or Actual Management page blocker | None |
| P2 | Published and unpublished Full Replica XML hashes differ although runtime structure and visual acceptance pass | Record for a future save/publish hygiene review; no change made here |
| P2 | Actual Management grid has no rows, so browser opening of an existing Actual Main Form was not applicable | Do not seed data solely for this acceptance |
| P2 | Runtime BPF remains the expected English Sales Process until the custom BPF is separately activated | Expected and outside this phase |
| P2 | Actual Management column captions remain platform/runtime English in the empty grid | Cosmetic follow-up; View structure and order are valid |

## Request Accounting

The independent Dataverse verification performed only GET requests:

```text
GET=14
POST=0
PATCH=0
DELETE=0
Publish=0
Business writes=0
Production requests=0
```

Browser operations were navigation, tab selection, scrolling, DOM inspection, and screenshots only. No New, Save, activity, note, Delete, or form-edit operation was executed.

Evidence JSON: `local-artifacts/d365/runtime-validation/phase1c5r2e2d5-opportunity-browser-acceptance.json`.

## Decision

`Opportunity Browser Acceptance Ready=true`

The Modern App, Opportunity View, Full Replica, native Timeline, Actual Management Subgrid, and Actual Management View are usable for the read-only demo path. The next Plugin Browser Smoke Test may be authorized separately, but it was not executed in this phase. BPF activation and all business-data write tests remain out of scope.
