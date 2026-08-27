# Phase 1C-5R2E-2B4 New Modern App Mapping Verification

## Result

**Modern App Mapping Ready=false.** The new Modern App has correct direct table-component mappings for Opportunity and Actual Management, with zero generic `entity` components. It remains blocked because its sitemap contains only an unbound placeholder SubArea and therefore exposes neither target table in navigation. No App publish, Form/BPF activation, or component modification was performed.

## App Identity And State

- Name: `CRM AI Gateway Demo - Modern`
- App ID: `916afe4b-607e-f111-ab0e-002248eb1915`
- Unique name: `aigw_CRMAIGatewayDemoModern`
- Client type: 4 (Modern model-driven App definition)
- Managed: false
- Component state: 1 (unpublished)
- Published row: absent
- Published date: null
- Same-name unpublished App count: 1

The App is visible only through `RetrieveUnpublishedMultiple`, which confirms that it is a new unpublished definition rather than a published App with pending changes.

## Table Component Mapping

| Table | Expected `entityid` / `objectid` | ObjectTypeCode | Component count | Mapping |
|---|---|---:|---:|---|
| `opportunity` | `30b0cd7e-0081-42e1-9a48-688442277fae` | 3 | 1 | Correct |
| `aigw_actualmanagement` | `e46411b2-7d7c-f111-ab0e-70a8a50388b9` | 11722 | 1 | Correct |

The unpublished components are:

- Opportunity component: `af6a9389-607e-f111-ab0e-002248eb1915`
- Actual Management component: `ae6a9389-607e-f111-ab0e-002248eb1915`
- Generic `entity` objectid `9d0f025b-11ce-40f1-a7f4-a8088f4985aa`: 0

## Sitemap And Navigation

The App has one Sitemap component:

- Sitemap ID: `8d6afe4b-607e-f111-ab0e-002248eb1915`
- Name: `CRM AI Gateway Demo - Modern`
- Sitemap component ID: `b06a9389-607e-f111-ab0e-002248eb1915`

Its only SubArea is:

- ID: `subarea_2d170ab2`
- Entity: null
- URL: null
- Label: `子区域 1`

Navigation result:

- Opportunity: absent
- Actual Management: absent

The correct table components are present, but the blank placeholder SubArea does not make either table reachable through App navigation.

## Form And View Availability

The target records exist and their definitions are unchanged:

- Actual Main Form `e0537d47-a5f7-45a3-b607-608e7e831700`: exists, 1 Tab / 5 Sections / 41 Controls
- Actual View `7a00b267-977c-f111-ab0e-000d3a857307`: exists
- Full Replica `97a1555b-0903-408a-ac63-d63aed65b14a`: Inactive, non-default, not explicitly included in the Modern App

Explicit App component counts are zero for Full Replica, Actual Main Form, and Actual View. `ValidateApp` reports that both tables do not explicitly reference a Form or View and that App users would therefore see all Forms and Views. This fallback confirms availability but does not satisfy a later controlled-form-selection gate.

## ValidateApp

- `ValidationSuccess`: true
- Errors: 0
- Warnings: 2
- Required components: 0

Warnings:

- Actual Management does not reference a Form or View; users will see all Forms and Views.
- Opportunity does not reference a Form or View; users will see all Forms and Views.

## Protection Verification

- Old App `e2369f51-b877-f111-ab0e-000d3a805a4c`: published identity, unpublished identity, and component set unchanged from the 2B3B baseline
- Protected Form hash: unchanged at `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`
- Actual Main Form/View: unchanged
- Custom BPF: Draft/Inactive
- Plugin: Assembly 1 / Types 3 / Steps 7 / Images 6; Enabled 7 / Disabled 0
- `Sales trial`: unchanged
- Business writes: 0
- Production requests: 0

## Decision

Do not activate Full Replica yet. Return to the Modern App Designer and replace or configure the blank `子区域 1` so that the navigation contains explicit Opportunity and Actual Management table pages. A later verification should also decide whether to explicitly select Full Replica, Actual Main Form, and Actual View instead of relying on the all-forms/all-views fallback.

## Request Accounting

- GET: 60, including compatibility discovery and the final complete verification pass
- POST: 0
- PATCH: 0
- DELETE: 0
- Publish: 0
- Activation: 0
- Business writes: 0
- Production requests: 0

Local evidence:

`local-artifacts/d365/plugin-registration/phase1c5r2e2b4-modern-app-verification.json`
