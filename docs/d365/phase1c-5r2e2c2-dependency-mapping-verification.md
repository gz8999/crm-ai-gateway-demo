# Phase 1C-5R2E-2C2 Manual Dependency Mapping Verification

## Result

**Dependency Mapping Ready=false.** The read-only unpublished App component query does not contain either required dependency table. `ValidateApp` still reports four warnings and the same two required table components. No write, publish, or activation request was sent.

## Dependency Table Mapping

Both table identifiers were resolved dynamically through `entities` and `EntityDefinitions` before App membership was evaluated.

| Logical name | `entities.entityid` | `EntityDefinitions.MetadataId` | ObjectTypeCode | App `componenttype=1` count |
|---|---|---|---:|---:|
| `opportunityproduct` | `8a4283a8-eef3-4915-9e20-055dc136663d` | `8a4283a8-eef3-4915-9e20-055dc136663d` | 1083 | 0 |
| `sharepointdocument` | `df40ce13-715d-495d-892e-0bbe2cf15acd` | `df40ce13-715d-495d-892e-0bbe2cf15acd` | 9507 | 0 |

The generic `entity` objectid `9d0f025b-11ce-40f1-a7f4-a8088f4985aa` has a count of 0. The prior incorrect components have therefore not returned, but the correct dependency table components were not persisted by the manual App Designer save.

## Navigation

The unpublished Sitemap contains only these entity navigation pages:

- `opportunity`
- `aigw_actualmanagement`

Neither `opportunityproduct` nor `sharepointdocument` appears in navigation, as intended. There is no generic `entity` navigation page.

## Dependency Views

All three dependency Views remain present exactly once as `componenttype=26`:

| View | Object ID | Count |
|---|---|---:|
| Opportunity Product Inline Edit View: Bundle Products | `e175dfbf-8eae-4af2-9dd2-68c43c14d40f` | 1 |
| Opportunity Product Inline Edit View | `01010de7-749e-4fe6-8037-aca560a4fcbe` | 1 |
| Document Associated Grid | `0016f9f3-41cc-4276-9d11-04308d15858d` | 1 |

## Existing App Components

The original components remain correctly mapped exactly once:

- Opportunity table
- Actual Management table
- Full Replica Form
- Opportunity target View
- Actual Management target View

The Actual Management Main Form continues to exist and its definition is unchanged. It is not represented as an independent `componenttype=60` App component, matching the previously accepted App Designer behavior.

## ValidateApp

- `ValidationSuccess`: true
- Errors: 0
- Warnings: 4
- Unique required components: 2

The unresolved required components are:

- `opportunityproduct`
- `sharepointdocument`

The warnings are attached to Full Replica and the three dependency Views because their parent table dependencies are still absent from the unpublished App component collection.

## Protection Verification

- Full Replica published runtime: Inactive
- Full Replica unpublished customization: Active
- Full Replica: Non-default
- Protected Form hash unchanged: `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`
- Actual Management Form/View definitions: unchanged
- Custom BPF: Draft/Inactive
- Plugin: Enabled 7 / Disabled 0
- Old App: unchanged
- Sales trial: unchanged
- Business writes: 0
- Production requests: 0

## Controlled Publish Gate

Controlled Publish is **not allowed** from this result. The two managed dependency tables must first be included as the correct table components and then independently read back as one `componenttype=1` record each. `ValidateApp` must subsequently return success with zero errors, zero warnings, and zero required components.

Do not re-add the three Views and do not use the generic `entity` object. A further manual App Designer attempt should verify that the dependency tables are selected as App assets, not merely hidden from navigation.

## Request Accounting

- GET: 28
- POST: 0
- PATCH: 0
- DELETE: 0
- Publish: 0
- Activation: 0
- Business writes: 0
- Production requests: 0

Local evidence:

`local-artifacts/d365/plugin-registration/phase1c5r2e2c2-dependency-mapping-verification.json`
