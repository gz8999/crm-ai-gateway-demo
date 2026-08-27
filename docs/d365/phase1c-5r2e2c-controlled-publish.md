# Phase 1C-5R2E-2C Controlled Form And Modern App Publish

## Result

**Controlled Publish Ready=false.** Dependency metadata and the pre-publish Form/App protection gates passed, but the single bounded `AddAppComponents` request mapped both required table components to the generic `entity` object. The three required Views mapped correctly. The execution stopped immediately before ValidateApp-after-add and before both planned PublishXml operations.

## Dependency Metadata

All five ValidateApp dependencies exist with unambiguous metadata:

| Dependency | Type | ID | Exists | Active | Initial App inclusion |
|---|---:|---|---|---|---:|
| Opportunity Product | Entity (1) | `8a4283a8-eef3-4915-9e20-055dc136663d` | Yes | Entity metadata has no Active/Inactive state | 0 |
| Sharepoint Document | Entity (1) | `df40ce13-715d-495d-892e-0bbe2cf15acd` | Yes | Entity metadata has no Active/Inactive state | 0 |
| Opportunity Product Inline Edit View: Bundle Products | View (26) | `e175dfbf-8eae-4af2-9dd2-68c43c14d40f` | Yes | Active | 0 |
| Opportunity Product Inline Edit View | View (26) | `01010de7-749e-4fe6-8037-aca560a4fcbe` | Yes | Active | 0 |
| Document Associated Grid | View (26) | `0016f9f3-41cc-4276-9d11-04308d15858d` | Yes | Active | 0 |

The two entity IDs match both `EntityDefinitions.MetadataId` and `entities.entityid`. The three managed Views are Active and their returned table types are correct.

## AddAppComponents Result

One `AddAppComponents` request containing only the five required dependencies returned HTTP 204.

Correct read-back:

| Dependency | Resulting component ID | Count |
|---|---|---:|
| Opportunity Product Inline Edit View: Bundle Products | `8e651401-6c7e-f111-ab0e-002248eb1915` | 1 |
| Opportunity Product Inline Edit View | `8f651401-6c7e-f111-ab0e-002248eb1915` | 1 |
| Document Associated Grid | `91651401-6c7e-f111-ab0e-002248eb1915` | 1 |

Incorrect read-back:

| Requested table | Expected objectid | Correct count | Resulting component |
|---|---|---:|---|
| Opportunity Product | `8a4283a8-eef3-4915-9e20-055dc136663d` | 0 | Generic `entity` |
| Sharepoint Document | `df40ce13-715d-495d-892e-0bbe2cf15acd` | 0 | Generic `entity` |

Two generic components were created:

- `8b651401-6c7e-f111-ab0e-002248eb1915`
- `8d651401-6c7e-f111-ab0e-002248eb1915`
- objectid for both: `9d0f025b-11ce-40f1-a7f4-a8088f4985aa`
- reverse mapping: logical name `entity`, ObjectTypeCode 9800

The existing Opportunity, Actual Management, Opportunity View, Actual View, Full Replica Form, and Sitemap components remained present exactly once.

## ValidateApp

Before dependency addition:

- `ValidationSuccess`: true
- Errors: 0
- Warnings: 1
- Required components: 5, matching the approved dependency set exactly

After dependency addition:

- Not executed because the generic entity mapping gate required an immediate stop

## Publish Results

- Opportunity PublishXml: not attempted
- Modern App PublishXml: not attempted
- Publish count: 0

Full Replica remains:

- Published runtime: Inactive
- Unpublished customization: Active
- Non-default
- 5 Tabs / 19 Sections / 114 Controls / 106 unique bound fields
- Form definition hashes unchanged at the last read-back before the blocked dependency write

## Protection Status

The complete pre-write gate confirmed:

- Protected Form hash: `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`
- Actual Form/View: unchanged
- Old CRM AI Gateway Demo App: unchanged
- `Sales trial`: unchanged
- Custom BPF: Draft/Inactive
- Plugin: Enabled 7 / Disabled 0
- Business writes: 0
- Production requests: 0

No component definition, Form order, security role, BPF, Plugin, or business record was modified. Only the Modern App unpublished component collection changed through the one authorized AddAppComponents action.

## Next Gate

Do not publish Opportunity or the Modern App. A separately authorized repair must address the two generic entity components and establish the two managed table dependencies through a supported App Designer or verified mapping path. The three correctly added dependency Views must not be duplicated. No automatic cleanup, retry, or App publish is permitted from this result.

## Request Accounting

- GET: 46, including the initial preflight compatibility attempt and the complete execution pass
- POST: 1 (`AddAppComponents`)
- PATCH: 0
- DELETE: 0
- Publish: 0
- Activation: 0
- Business writes: 0
- Production requests: 0

Local evidence:

`local-artifacts/d365/plugin-registration/phase1c5r2e2c-controlled-publish.json`
