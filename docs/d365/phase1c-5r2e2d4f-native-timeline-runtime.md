# Phase 1C-5R2E-2D4F Native Timeline Runtime Validation

## Scope And Safety

- Environment: `org91f5f65f.crm5.dynamics.com`
- Modern App: `CRM AI Gateway Demo - Modern`
- App ID: `916afe4b-607e-f111-ab0e-002248eb1915`
- Full Replica: `AI Gateway Opportunity Demo - Full Replica`
- Form ID: `97a1555b-0903-408a-ac63-d63aed65b14a`
- Validation mode: screenshot review plus read-only Dataverse verification
- No activity, note, business record, form, app, BPF, plugin, or publish write was performed.

## Screenshot Evidence

The supplied screenshots show the published Modern App and an Opportunity record in the target environment. The browser address includes the approved test hostname and Modern App ID. The screenshots were not copied into Git.

| Runtime check | Evidence |
| --- | --- |
| App route | `CRM AI Gateway Demo - Modern` visible in the app header |
| Opportunity route | Opportunity record and `Opportunities` navigation visible |
| Full Replica visual signature | 5 Chinese tabs, expected header order, actual totals lock icons, four POL/POD lookup controls |
| Timeline search | `Search timeline` visible |
| Timeline command area | New, bookmark, filter, sort, refresh, and more controls visible |
| Note composer | `Enter a note...` visible with attachment affordance |
| Activity state | `Get started` empty state visible; no activity cards present |
| Blank-region check | Passed; Timeline is rendered, not a plain empty section |

The screenshot itself does not expose the Form GUID. Therefore the direct GUID assertion comes from the independent published Form read-back below; the visual route is consistent with the Full Replica signature.

## Published Form Read-Back

| Check | Result |
| --- | --- |
| Form name / ID | `AI Gateway Opportunity Demo - Full Replica` / `97a1555b-0903-408a-ac63-d63aed65b14a` |
| State | Active |
| Default | No |
| Tabs / Sections / Controls / unique bound fields | `5 / 19 / 115 / 106` |
| Native Timeline controls | `1` |
| Legacy/dropdown Timeline controls | `0` |
| Timeline FormXML ID | `notescontrol` |
| Timeline name | `aigw_timeline_control` |
| Class ID | `{06375649-C143-495E-A496-C962E5B4488E}` |
| Activities | Meeting, Email, Phone Call, Task supported; recurring appointment also persisted by the platform |
| Notes | Enabled |
| Undefined references | `0` |

The Timeline is visibly usable at runtime: search, command controls, note entry, and the expected empty state are present. No activity or note was created for this validation.

## Protected Components

- Protected Form XML hash remains the frozen baseline: `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`.
- Custom BPF `销售流程 - AI Demo Full Replica` remains Draft/Inactive.
- Plugin state remains one Assembly, three Types, seven enabled Steps, zero disabled Steps, and six Images.
- Modern App, Actual Management Form, Actual Management View, and business data were not modified.

## Issues

| Priority | Item | Decision |
| --- | --- | --- |
| P0 | No runtime blocker observed | None |
| P1 | No Timeline rendering or routing blocker observed | None |
| P2 | Screenshot does not display the Form GUID directly | Covered by server-side published Form read-back |
| P2 | No activity cards are present | Expected empty state; no activity creation was authorized |

## Request Accounting

Successful verification run: `GET=12`, `POST=0`, `PATCH=0`, `DELETE=0`, `Publish=0`, business writes `=0`, production requests `=0`.

An initial read-only compatibility probe attempted an unsupported `systemform.modifiedon` select and was rejected by Dataverse; it performed no write. The query was corrected to supported properties and rerun successfully.

Evidence: `local-artifacts/d365/runtime-validation/phase1c5r2e2d4f-native-timeline-runtime.json`.

## Decision

`Native Timeline Runtime Ready=true`

The native Timeline renders in the published Full Replica, the empty state is normal, and all protected component gates pass. It is acceptable to continue the broader R2E-2D browser acceptance. This phase stops before Plugin Smoke Test, BPF activation, or any browser write.
