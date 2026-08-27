# Phase 1C-5R2E-2C1 Remove Incorrect Dependency Table Components

## Result

**Incorrect Dependency Cleanup Ready=true.** One bounded `RemoveAppComponents` request removed exactly the two authorized generic entity components from the Modern App unpublished layer. No correct table, Form, View, Sitemap, or navigation component was removed. No component was added and no publish or activation was executed.

## Authorized Components

Both preflight matches satisfied all required conditions:

| App component ID | ComponentType | ObjectID | App layer |
|---|---:|---|---|
| `8b651401-6c7e-f111-ab0e-002248eb1915` | 1 | `9d0f025b-11ce-40f1-a7f4-a8088f4985aa` | Target Modern App unpublished |
| `8d651401-6c7e-f111-ab0e-002248eb1915` | 1 | `9d0f025b-11ce-40f1-a7f4-a8088f4985aa` | Target Modern App unpublished |

Both had null `rootappmodulecomponentid` and null `rootcomponentbehavior`. No additional generic component existed.

## Remove Result

- Action: `RemoveAppComponents`
- Requests: 1
- Deduplicated removal objectid: `9d0f025b-11ce-40f1-a7f4-a8088f4985aa`
- Response: HTTP 204
- Generic entity count before: 2
- Generic entity count after: 0
- Automatic retry: none

App component count changed from 11 to 9, exactly matching removal of the two authorized records.

## Preserved Components

All required components remain exactly once:

- Opportunity table
- Actual Management table
- Full Replica Form
- Opportunity View `所有案件 - AI Demo Full Replica`
- Actual View `实绩管理 - AI Demo`
- Opportunity Product Inline Edit View: Bundle Products
- Opportunity Product Inline Edit View
- Document Associated Grid
- Modern App Sitemap

Actual Main Form `实绩管理 - AI Demo` continues to exist with its definition unchanged. It still has no independent App component, consistent with the deferred New/Open browser-routing check.

## ValidateApp

- `ValidationSuccess`: true
- Errors: 0
- Warnings: 4
- Unique required components: 2

Remaining required table components:

- Opportunity Product `8a4283a8-eef3-4915-9e20-055dc136663d`
- Sharepoint Document `df40ce13-715d-495d-892e-0bbe2cf15acd`

Warnings are reported for Full Replica and the three preserved dependency Views because those assets reference the two tables. This is expected after removing the incorrect generic mappings and remains a future App Designer dependency-resolution gate.

## Form And Protection State

- Full Replica published runtime: Inactive
- Full Replica unpublished customization: Active
- Full Replica: Non-default
- Structure: 5 Tabs / 19 Sections / 114 Controls / 106 unique bound fields
- Protected Form hash: `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`
- Actual Form/View: present and unchanged
- Old CRM AI Gateway Demo App: unchanged
- `Sales trial`: unchanged
- Custom BPF: Draft/Inactive
- Plugin: Assembly 1 / Types 3 / Steps 7 / Images 6; Enabled 7 / Disabled 0
- Production requests: 0

## Next Gate

Do not add dependencies through Web API and do not publish. The two managed table dependencies must be handled through a separately authorized Power Apps App Designer workflow or another mapping method proven not to create the generic `entity` object. The three correctly included dependency Views must be preserved without duplication.

## Request Accounting

- GET: 47
- POST: 1 (`RemoveAppComponents`)
- PATCH: 0
- DELETE: 0
- Publish: 0
- Activation: 0
- Business writes: 0
- Production requests: 0

Local evidence:

`local-artifacts/d365/plugin-registration/phase1c5r2e2c1-dependency-cleanup.json`
