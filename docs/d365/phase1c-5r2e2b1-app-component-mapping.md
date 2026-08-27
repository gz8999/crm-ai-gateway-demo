# Phase 1C-5R2E-2B1 App Table Component Mapping Verification

## Result

**App Component Mapping Ready=false.** This read-only audit classifies the two draft table components as **B. Incorrect mapping**. No RemoveAppComponents, AddAppComponents, PublishXml, Form activation, or BPF activation was executed in this phase.

## Environment And App

- Environment: `org91f5f65f.crm5.dynamics.com`
- App ID: `e2369f51-b877-f111-ab0e-000d3a805a4c`
- App name: `CRM AI Gateway Demo`
- Published App unique ID: `ae812fe1-4723-4c03-a38b-43aadcccbaf0`
- Unpublished App unique ID: `fc0350b3-38bc-444a-ae92-5cda749e5e67`
- App: unmanaged and active

## Entity ID Cross-Reference

| LogicalName | `entities.entityid` | `EntityDefinitions.MetadataId` | ObjectTypeCode |
|---|---|---|---:|
| `opportunity` | `30b0cd7e-0081-42e1-9a48-688442277fae` | `30b0cd7e-0081-42e1-9a48-688442277fae` | 3 |
| `aigw_actualmanagement` | `e46411b2-7d7c-f111-ab0e-70a8a50388b9` | `e46411b2-7d7c-f111-ab0e-70a8a50388b9` | 11722 |

The entity metadata and `entities` records agree. The generic `entity` component type alone was not used as the failure criterion.

## Unpublished App Component Mapping

The unpublished component collection was queried using the unpublished App unique ID. Both table entries were:

| ComponentType | App `objectid` | Reverse lookup | Classification |
|---:|---|---|---|
| 1 | `9d0f025b-11ce-40f1-a7f4-a8088f4985aa` | `entity` metadata, ObjectTypeCode 9800 | B |
| 1 | `9d0f025b-11ce-40f1-a7f4-a8088f4985aa` | `entity` metadata, ObjectTypeCode 9800 | B |

For both entries:

- `rootappmodulecomponentid`: null
- `rootcomponentbehavior`: null
- `isdefault`: false

The `objectid` does not match either target table ID, and both entries point to the same non-target metadata table. This is an incorrect mapping, not insufficient evidence.

## Form And View Presence

The draft App component collection still contains:

- Full Replica Form `97a1555b-0903-408a-ac63-d63aed65b14a`
- Actual Management Form `e0537d47-a5f7-45a3-b607-608e7e831700`
- Actual Management View `7a00b267-977c-f111-ab0e-000d3a857307`
- Pre-existing Protected Form `8db60b46-b976-f111-ab0e-00224817cb31`

No component was removed. The published App remains unchanged because App PublishXml was not executed.

## ValidateApp

`ValidateApp` returned `ValidationSuccess=true`, with 0 reported errors and 10 warnings. The warnings include required Opportunity and Actual Management dependencies and the generic warning that an entity does not reference a form or view. Validation success therefore does not override the failed direct table-object mapping.

## Protection Checks

- Full Replica remains Inactive and non-default.
- Protected Form XML hash remains `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`.
- Actual Management Form/View were not modified.
- Custom BPF remains Draft/Inactive.
- Plugin remains Enabled 7 / Disabled 0.
- `Sales trial` was not modified.
- Publish=0, business writes=0, production requests=0.

## Decision

`B. Incorrect mapping`.

No Remove/Add was executed because this phase is read-only. A later repair phase must first define the supported table-component payload and separately authorize removal of the two explicit generic entity components. Form/View components must be preserved during that cleanup.

## Request Accounting

This audit: GET 8, POST 0, PATCH 0, DELETE 0, Publish 0, Activation 0, business writes 0, production requests 0.

Evidence JSON:

`local-artifacts/d365/plugin-registration/phase1c5r2e2b1-app-component-mapping.json`
