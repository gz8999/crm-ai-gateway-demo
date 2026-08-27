# Phase 1C-5R2E-2B2 Repair App Table Components

## Result

**App Table Repair Ready=false.** The requested bounded repair was executed and stopped after the single correct-table `AddAppComponents` call failed its read-back mapping gate. No App publish or Form/BPF activation was attempted.

## Before Snapshot

- Environment: `org91f5f65f.crm5.dynamics.com`
- App: `CRM AI Gateway Demo`
- App ID: `e2369f51-b877-f111-ab0e-000d3a805a4c`
- Unpublished App unique ID: `fc0350b3-38bc-444a-ae92-5cda749e5e67`
- Wrong component object ID: `9d0f025b-11ce-40f1-a7f4-a8088f4985aa`
- Wrong component IDs:
  - `323faabe-157e-f111-ab0e-6045bd5b2c06`
  - `343faabe-157e-f111-ab0e-6045bd5b2c06`

Both wrong components were `componenttype=1`, had the same wrong object ID, and had null `rootappmodulecomponentid` and `rootcomponentbehavior`.

Correct entity references were verified before the write:

| Table | `entityid` | `MetadataId` | ObjectTypeCode |
|---|---|---|---:|
| `opportunity` | `30b0cd7e-0081-42e1-9a48-688442277fae` | `30b0cd7e-0081-42e1-9a48-688442277fae` | 3 |
| `aigw_actualmanagement` | `e46411b2-7d7c-f111-ab0e-70a8a50388b9` | `e46411b2-7d7c-f111-ab0e-70a8a50388b9` | 11722 |

Full Replica, Actual Management Form, Actual Management View, and Protected Form were present before the repair.

## Writes Executed

1. `RemoveAppComponents` once, using the deduplicated wrong `entityid` `9d0f025b-11ce-40f1-a7f4-a8088f4985aa`; response HTTP 204.
2. Immediate read-back confirmed wrong object ID count 0. Forms and View remained present, so no restore request was needed.
3. `AddAppComponents` once with only:
   - `entityid=30b0cd7e-0081-42e1-9a48-688442277fae`
   - `entityid=e46411b2-7d7c-f111-ab0e-70a8a50388b9`
   - `@odata.type=Microsoft.Dynamics.CRM.entity`
   Response HTTP 204.

## Read-Back Result

The two newly added table components again resolved to:

- `componenttype=1`
- `objectid=9d0f025b-11ce-40f1-a7f4-a8088f4985aa`
- LogicalName `entity`
- ObjectTypeCode `9800`

Direct membership for `opportunity` and `aigw_actualmanagement` remained zero. The same wrong object ID appeared twice again. This confirms the problem is the platform/API table-component mapping behavior, not the source `entityid` values.

Full Replica, Actual Management Form, Actual Management View, and Protected Form remained present. No component restore was required.

## Protection Checks

- Full Replica: still Inactive, non-default; 5 Tabs / 19 Sections / 114 Controls
- Protected Form hash unchanged: `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`
- Actual Management Form hashes unchanged
- Actual Management View hashes unchanged
- BPF: Draft/Inactive
- Plugin: Enabled 7 / Disabled 0
- `Sales trial`: unchanged
- App PublishXml: 0
- Form/BPF activation: 0
- Business writes: 0
- Production requests: 0

`ValidateApp` was not executed because the direct table mapping gate failed immediately after AddAppComponents. No automatic retry or cleanup was performed.

## Request Accounting

- GET: 30
- POST actions: 2 (`RemoveAppComponents` x1, `AddAppComponents` x1)
- PATCH: 0
- DELETE: 0
- Publish: 0
- Activation: 0
- Business writes: 0
- Production requests: 0

Evidence JSON:

`local-artifacts/d365/plugin-registration/phase1c5r2e2b2-app-table-repair.json`

## Next Gate

Do not publish the App or activate the Form. A separate repair design is required, likely through the Power Apps App Designer or an API/SDK representation that preserves the target table logical name instead of converting both entries to the generic `entity` component.
