# Phase 1C-5R2E-4 Final UI Comparison and Fixes

## Result

- Environment: `org91f5f65f.crm5.dynamics.com`
- Production requests: `0`
- Dataverse writes: `0`
- Publish actions: `0`
- P0 / P1 / P2: `0 / 0 / 2`
- `R2E-5 Ready=true`

No UI definition was changed in this phase. The only observed differences were either unsupported by the reference evidence or were normal model-driven app responsive behavior. Changing them would have introduced more risk than the evidence justified.

## Reference Evidence

The comparison used all nine images in `/Users/gz/Documents/Cowart/D365 CRM截图`:

- `商机详情页1.jpeg` through `商机详情页5.jpeg`
- `商机详情页预算1.jpeg`, `商机详情页预算2.jpeg`
- `商机详情页实绩1.jpeg`, `商机详情页实绩2.jpeg`

Current-state evidence used the existing ignored screenshots under `local-artifacts/d365/runtime-validation/r2e2d5/` and the ordinary-user Closing Stage screenshot captured for R2E-3. Screenshots remain local and are not committed.

The reference confirms the two-stage process, header fields, five primary tabs, two-column summary, budget/actual sections, Timeline, POL/POD, and April-March structures. It does not show the expanded Closing Stage panel and therefore does not establish the exact localized labels for its individual steps.

## Pre-Fix Difference Matrix

| Priority | Area | Observation | Root cause | Decision |
|---|---|---|---|---|
| P2 | Closing Stage | `Status Reason` is English while its value is Chinese | BPF step has an empty `stepLabels` list; runtime falls back to the attribute display name. The browser session selected the 1033 label. | Not changed: no reference image shows the expanded Closing Stage label. |
| P2 | Closing Stage | `Actual Close Date` is English | Same fallback behavior. The 1033 attribute label is `Actual Close Date`; 2052 is `实际截止日期`. | Not changed: no reliable reference evidence for the intended BPF label. |
| Informational | Narrow viewport | Native BPF/header content compresses and the stage panel overlays part of the form while expanded | Standard model-driven app responsive layout | Accepted; no custom CSS or unsupported override added. |

P0 and P1 findings were both zero before correction.

## UI Comparison

### App And Navigation

- The app is `CRM AI Gateway Demo - Modern` on the approved test hostname.
- The left navigation retains Opportunity and Actual Management entries without a Location dependency page.
- No production hostname, permission error, 404, or component-load error is present in the reviewed evidence.

### Opportunity Form

- Header remains ordered as `受注确度` -> `是否预算内` -> `负责人`.
- Five tabs and the reference-aligned summary, budget, actuals, products, and files experience remain present.
- Current server-side shape is `5 tabs / 19 sections / 115 controls / 106 unique fields`.
- Native Timeline count is `1`; old Timeline count is `0`.
- Location is a native lookup; the old `aigw_opportunityplace` form control count is `0`.
- Actual Management subgrid, POL/POD lookups, annual blocks, locked total fields, and deprecated-field exclusions remain intact.

### BPF

- Workflow remains Active/Activated with process order `0`.
- Stages remain `授予资格` -> `案件关闭`; definition hash remains `59819cd865fd39c5a838441cad21979e4e1a08387b3bb62eab2285e07c213f08`.
- Current instance remains `221ed4a5-0780-f111-ab0e-000d3a82d194`, uniquely associated with the fixed synthetic Opportunity and active at `案件关闭`.
- The Closing Stage English text originates from empty BPF step labels plus attribute/browser-language fallback, not from the Full Replica form labels. The form itself already carries Chinese labels for the corresponding controls.

## Actual Fixes

No Dataverse customization was changed and no publish was performed.

This is intentional:

1. The two English labels are P2 and have no confirming reference screenshot.
2. A label change to an active BPF would require a controlled BPF definition lifecycle and revalidation of the existing instance.
3. Native responsive layout must not be overridden solely for pixel matching.

## Deferred Items

1. **Closing Stage localization (P2):** requires user-confirmed target labels for 1033 and 2052 before a standalone label-only BPF change.
2. **Narrow-window spacing (P2):** accepted platform behavior. Reassess only if a supported designer setting and a fixed demo viewport are specified.

## Integrity Gates

| Gate | Result |
|---|---|
| Protected Form hash | `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7` (unchanged) |
| Full Replica | `5/19/115/106`, Active, non-default |
| Active BPF stage | `案件关闭` |
| BPF instance / duplicate | `1 / 0`; fixed instance ID unchanged |
| Opportunity state / status | `0 / 1` |
| `actualclosedate` | empty |
| Opportunity business-field changes | `0` (version and modified time unchanged across phase readbacks) |
| Actual / Activity / Note | `0 / 0 / 0` |
| Process order | `0` |
| Plugin | `7 enabled / 0 disabled` |
| Active Location | `51` |
| Production requests | `0` |

## Requests And Writes

Final phase totals after the post-verification readback: `GET=42`, `POST=0`, `PATCH=0`, `DELETE=0`, `Publish=0`, `Production requests=0`. All requests were read-only GETs to the approved test hostname. Opportunity writes, BPF instance writes, and related-data writes were all zero.

## Verification

- `npm test`: `184/184 passed`
- `npm run build`: passed
- `git diff --check`: passed
- Sensitive scan: passed; no token, cookie, authorization header, client secret, password, or private key material in the committed phase report

## Final Gate

- P0: `0`
- P1: `0`
- P2: `2` accepted/deferred with reasons
- `R2E-5 Ready=true`

R2E-5 is permitted from the UI and integrity perspective. This report does not start that phase.
