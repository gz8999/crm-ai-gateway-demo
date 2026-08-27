# Phase 1C-5R2E-1D Actual Management Monthly Entry Experience

## Result

`R2E-1D Ready=true`.

The only existing `aigw_actualmanagement` Main Form was an unmanaged, active form containing only `aigw_name`. It was enhanced in place and renamed `实绩管理 - AI Demo`. This preserves the Subgrid New/Open route without creating an inactive duplicate that the runtime cannot select.

The form was already Active before this phase. No Activate operation was executed; its new definition remains unpublished and non-default. The target View also remains Active with unpublished changes. Publish, App, BPF, Plugin, schema, and business-data writes were all excluded.

## Main Form

- ID reference: `D365_ACTUAL_MANAGEMENT_FORM_ID`.
- Name: `实绩管理 - AI Demo`.
- Type: Main Form (`type=2`).
- Managed: false.
- State: pre-existing Active, non-default, unpublished changes present.
- Main Forms for the table: exactly 1.
- App references: 0.

### Hashes

| Definition | Before | After |
|---|---|---|
| FormXML | `e9d9cc15a7767b0336ebcc19bf1e6278b036f8a45af995ddbc2ea2c9252f3593` | `f3940322eef8320e95b8a6db97b6d79e3632dc93355abe1e8f402204313815ad` |
| FormJSON | `cf763534556c6f8d48000baef07b1d2ba9833a450cc0e6b0bd11ab84febd1558` | `d70e2607079c73a44b178a7de54d8276ddb1b6de0824049cb225781fe79bbf79` |

The platform regenerated FormJSON. It contains all 41 bound fields and the read-only annual control, so no Designer Save-only synchronization step is required.

### Counts

| Item | Before | After |
|---|---:|---:|
| Tabs | 1 | 1 |
| Sections | 1 | 5 |
| Controls | 1 | 41 |
| Unique bound fields | 1 | 41 |

## Layout

### Basic Information / 基本信息

1. `aigw_name` / 实绩名称.
2. `aigw_opportunityid` / 相关商机.
3. `transactioncurrencyid` / 交易币种.
4. `aigw_expectedorderdate` / 预计下单日.
5. `aigw_annualactualrevenue` / 年度收入实绩总金额, read-only.

### Fiscal quarters

Each quarter is a three-column section. Rows are months; columns are Revenue, GP, and MP.

| Section | Months | Revenue | GP | MP |
|---|---|---:|---:|---:|
| 1Q | April, May, June | editable | editable | editable |
| 2Q | July, August, September | editable | editable | editable |
| 3Q | October, November, December | editable | editable | editable |
| 4Q | January, February, March | editable | editable | editable |

All 36 monthly controls are present. Labels use English 1033 resources and Chinese 2052 resources. No JavaScript, PCF, Business Rule, `_base` control, duplicate annual control, or table RequiredLevel change was introduced.

MP is included in the entry Form because the fields exist and the requested entry layout explicitly includes Revenue/GP/MP. MP is not included in the default wide View because the supplied screenshots visibly establish Revenue and GP columns but do not establish MP columns.

## Annual read-only audit

- `aigw_annualactualrevenue`: exactly 1 accessible Main Form control, `disabled=true` in FormXML and FormJSON.
- April-March Revenue controls: 12, all editable.
- April-March GP controls: 12, all editable.
- April-March MP controls: 12, all editable.
- `_base` controls: 0.
- Plugin filtering remains unchanged; annual is still excluded from Update filtering attributes.

## Wide View

The existing `实绩管理 - AI Demo` SavedQuery was updated; no additional View was created.

### Before: 6 columns

`aigw_name`, `aigw_opportunityid`, `aigw_expectedorderdate`, `aigw_annualactualrevenue`, `aigw_annualactualrevenue_base`, `modifiedon`.

### After: 33 columns

1. Name, related Opportunity, transaction currency, expected order date, annual actual Revenue.
2. April-March in fiscal order, with Revenue then GP for each month.
3. Created By, Created On, Modified By, Modified On, matching the visible audit-column evidence.

The unpublished FetchXML, LayoutXML, and LayoutJSON have identical names, order, and widths. The View has no filter or link-entity, remains sorted by `modifiedon descending`, contains one annual column, and contains no `_base` or deprecated CNY field. The unpublished FetchXML executed successfully and returned zero rows.

## Subgrid route

- Control: `aigw_actualmanagement_subgrid`.
- Target: `aigw_actualmanagement`.
- Relationship: `aigw_opportunity_actualmanagement`.
- Default View reference: `D365_ACTUAL_MANAGEMENT_VIEW_ID`.
- Lookup: `aigw_opportunityid`.

The Opportunity Form Subgrid definition and hash are unchanged. The relationship metadata confirms that Opportunity is the referenced entity and `aigw_opportunityid` is the referencing lookup. Because the enhanced form is the table's only active Main Form, New/Open routes resolve to it after the unpublished changes are eventually published. Related-record create context can prepopulate the Opportunity lookup. No record was created to test runtime navigation in this phase.

The Plugin's one-Actual-per-Opportunity rule remains enabled and unchanged.

## Protection verification

- Actual Totals Plugin Steps: Enabled 7 / Disabled 0.
- Full Replica Opportunity Form hashes: unchanged.
- Protected Opportunity Form hashes: unchanged.
- Business Rule: Draft/Inactive.
- BPF: Draft/Inactive.
- App: unchanged.
- Field schema and RequiredLevel: unchanged.
- Publish: 0.
- Activate/Deactivate operations: 0.
- Business-data writes: 0.
- Production requests: 0.

## Remaining gaps

### P0

- The new Form/View definitions are unpublished. Runtime visual verification remains blocked until the separate publish gate.
- The custom Opportunity BPF remains Draft/Inactive and requires R2E-1C.

### P1

- Whether MP should appear in the default wide View remains `Requires User Confirmation`.
- The 33-column View intentionally requires horizontal scrolling; a concise operational View should remain available or be added later.
- New/Open navigation and relationship-context prepopulation were validated from metadata only because this phase prohibited creating a test record.

## Request accounting

| GET | POST | PATCH | DELETE | Publish | Activation | Business writes | Production requests |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 50 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |

The two PATCH requests updated only the existing Actual Management Main Form definition/name and the target SavedQuery definition. Rollback requires separate authorization and restores only the backed-up Form and View definitions; no physical metadata deletion is needed.
