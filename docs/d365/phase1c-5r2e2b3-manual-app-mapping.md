# Phase 1C-5R2E-2B3B Manual App Designer Repair Verification

## Result

**Manual App Mapping Ready=false.** The Power Apps App Designer save did not produce the required unpublished table-component mapping for either target table. The two generic `entity` components remain, and the current App sitemap contains Opportunity but not Actual Management. No component was removed, no App was published, and no Form or BPF was activated.

## Environment And App

- Environment: `org91f5f65f.crm5.dynamics.com`
- App ID: `e2369f51-b877-f111-ab0e-000d3a805a4c`
- App: `CRM AI Gateway Demo`
- Unique name: `CRMAIGatewayDemoApp`
- Managed: false
- Published App unique ID: `ae812fe1-4723-4c03-a38b-43aadcccbaf0`
- Unpublished App unique ID: `fc0350b3-38bc-444a-ae92-5cda749e5e67`
- App publish executed in this phase: no

## Table Component Mapping

The entity metadata IDs and `entities.entityid` values agree:

| Target | Expected `objectid` / `entityid` | ObjectTypeCode | Unpublished direct component count |
|---|---|---:|---:|
| `opportunity` | `30b0cd7e-0081-42e1-9a48-688442277fae` | 3 | 0 |
| `aigw_actualmanagement` | `e46411b2-7d7c-f111-ab0e-70a8a50388b9` | 11722 | 0 |

The unpublished App still contains two incorrect table components:

| `appmodulecomponentid` | ComponentType | `objectid` | Reverse mapping |
|---|---:|---|---|
| `a56e36a3-1f7e-f111-ab0e-6045bd5b2c06` | 1 | `9d0f025b-11ce-40f1-a7f4-a8088f4985aa` | `entity`, ObjectTypeCode 9800 |
| `a66e36a3-1f7e-f111-ab0e-6045bd5b2c06` | 1 | `9d0f025b-11ce-40f1-a7f4-a8088f4985aa` | `entity`, ObjectTypeCode 9800 |

Both have null `rootappmodulecomponentid` and null `rootcomponentbehavior`. This phase did not remove them because cleanup requires separate authorization after dependency analysis.

## Form And View Inclusion

The required assets remain present exactly once in the unpublished App:

- Full Replica Form `97a1555b-0903-408a-ac63-d63aed65b14a`
- Actual Management Main Form `e0537d47-a5f7-45a3-b607-608e7e831700`
- Actual Management View `7a00b267-977c-f111-ab0e-000d3a857307`

No Form or View definition was changed.

## Pages And Navigation

The current App sitemap contains one entity subarea:

- `aigw_subarea_opportunities` -> `opportunity`

Opportunity is therefore present in navigation. No `aigw_actualmanagement` subarea is present, so Actual Management navigation is not confirmed in the saved unpublished definition. The unpublished App descriptor also reports zero embedded Components, AppElements, and AppComponents.Entities; it does not provide contrary evidence of an Actual Management page.

## ValidateApp

`ValidateApp` was invoked through its read-only GET function endpoint.

- `ValidationSuccess`: true
- Errors: 0
- Warnings: 7
- Unique required components: 16

The required component set explicitly includes:

- Opportunity, component type 1, `30b0cd7e-0081-42e1-9a48-688442277fae`
- Actual Management, component type 1, `e46411b2-7d7c-f111-ab0e-70a8a50388b9`

Other warnings describe dependencies of the included forms and views, plus the generic warning that an entity does not reference a form or view. `ValidationSuccess=true` does not establish correct target table inclusion when the required target tables are still reported as dependencies and the direct component mapping is absent.

## Protection Verification

- Full Replica: Inactive, non-default, 5 Tabs / 19 Sections / 114 Controls
- Protected Form XML hash: `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7` (unchanged)
- Actual Management Form: 1 Tab / 5 Sections / 41 Controls
- Custom BPF: Draft/Inactive
- Plugin: Assembly 1 / Types 3 / Steps 7 / Images 6; Enabled 7 / Disabled 0
- `Sales trial`: unchanged and managed
- Business writes: 0
- Production requests: 0

## Decision

Do not activate Full Replica or publish the App. The next action must be a separate App Designer correction or narrowly authorized cleanup after confirming why the Designer save retained the two generic components and omitted the Actual Management sitemap entry. This phase did not perform automatic deletion.

## Request Accounting

- GET: 58, including preliminary read-only compatibility queries and two complete verification passes
- POST: 0
- PATCH: 0
- DELETE: 0
- Publish: 0
- Activation: 0
- Business writes: 0
- Production requests: 0

Local evidence:

`local-artifacts/d365/plugin-registration/phase1c5r2e2b3b-manual-app-mapping.json`
