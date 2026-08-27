# Phase 1C-5R2E-1B Chinese Label, Header and Read-Only Alignment

## Result

`R2E-1B Ready=true`.

The approved test environment passed the hostname, unmanaged solution, publisher, AI, Form-state, protected-component, and Plugin-step gates. The target Full Replica remains Inactive, non-default, unpublished, and absent from the App. No publish, activation, business-data write, Plugin change, BPF change, View change, or production request occurred.

## Form hashes

| Definition | Before | After |
|---|---|---|
| Unpublished FormXML | `d2732b3b655143fc89db2374603e88fb5dae14c7ec8bd23818b4825ae2ece8ab` | `e719b3fc47c9451fa9d2c2aa07e8638c69529792cc6945bf7f6a45d4660feb9f` |
| Unpublished FormJSON | `946f0ba58d6eec109847ef274c610574e08dcddce7ff12d83db12a61b0fe63c2` | `ed42aee4295de90c547a65d8b4d62f925281c039a79e5c3eceecd0b963309cc6` |

The platform regenerated FormJSON during the FormXML update. The resulting JSON reflects the new Header order and both read-only controls, so a Designer Save-only synchronization step is not required for this phase.

The normal published Form definition retained its prior hashes. Only the unpublished Full Replica definition changed.

## Read-only controls

| Field | Controls | Disabled | Result |
|---|---:|---:|---|
| `aigw_yearrevenueactual` | 1 | 1 | Pass |
| `aigw_yearrevenueactual_base` | 1 | 1 | Pass |
| `aigw_yearrevenueactualcny` | 0 | n/a | Pass |
| `actualvalue_base` | 0 | n/a | Pass |

No Column metadata or schema was changed.

## Header

Before:

1. `aigw_budgetstatus` / 是否预算内
2. `aigw_winprobabilityrank` / 受注确度
3. `ownerid` / Owner

After:

1. `aigw_winprobabilityrank` / 受注确度
2. `aigw_budgetstatus` / 是否预算内
3. `ownerid` / 负责人

No other Header control existed, so no unrelated Header field was removed.

## Form label changes

### Tabs

- `摘要`, `预算`, and `实绩` were retained.
- `Products` -> `产品`.
- `Files` -> `文件`.
- Related remains system navigation. It was not converted into or renamed as a normal Form tab.

### Business sections

The 14 business-section labels were normalized to the approved source labels: 商机信息、Sales Person Info、商机详细信息、POL&POD、汇总信息、预算、年度预算、实绩、Timeline、1Q、2Q、3Q、4Q、实绩.

The five system-owned Product/Documents sections were preserved because the reference screenshots do not show their internal headings and this phase does not modify system behavior.

### Bound controls

The 1033 and 2052 control labels were aligned without changing any binding:

| Logical name | Label |
|---|---|
| `name` | 案件名称 |
| `parentaccountid` | 客户 |
| `statuscode` | 状态描述 |
| `parentcontactid` | 联系人1 |
| `description` | 说明 |
| `transactioncurrencyid` | 货币 |
| `estimatedclosedate` | 预计下单日 |
| `estimatedvalue` | 预算金额 |
| `actualclosedate` | 受注日期 |
| `actualvalue` | 受注金额 |
| `ownerid` | 负责人 |

## Choice labels

Only screenshot-confirmed labels were changed. `UpdateOptionValue` used `MergeLabels=true`; no option value was added, removed, or changed.

| Field | Value | Before | After |
|---|---:|---|---|
| `aigw_winprobabilityrank` | `100000001` | `A` | `02: A` (1033/2052) |
| `aigw_budgetstatus` | `1` | `预算内` | `01: 预算内` (1033/2052) |
| `aigw_opportunitytype` | `2` | `02：现有` | `02: 现有` (1033/2052) |
| `statuscode` | `1` | 1033 `In Progress`; 2052 `正在进行` | 1033 preserved; 2052 `有效案件` |

Priority required no write: its existing labels already match the reference (`01: High`, `02: Important`, `03: Medium`, `04: Low`). Other option labels without direct screenshot evidence were left unchanged.

## English whitelist

The following English text remains intentionally:

- `Priority`: explicitly shown in the reference screenshot.
- `Sales Person Info`: explicitly shown in the reference screenshot.
- `Timeline`: Microsoft system control and screenshot label.
- `POL&POD`: business-domain abbreviation shown in the screenshot.
- `1Q`-`4Q`: screenshot quarter notation.
- Product and Documents internal system-section labels and product pricing controls: not visible in the reference and outside the active business scope.
- `CNY`, `GP`, and `MP`: currency and business abbreviations, not untranslated prose.

## Structural verification

- Tabs: 5.
- Sections: 19.
- Controls: 114.
- Unique bound fields: 106; no binding was removed.
- Actuals target Subgrid: exactly 1; its relationship, View, and parameters were not changed.
- `undefined`: none in FormXML or FormJSON.
- Header order is identical in FormXML and FormJSON.
- Protected Form FormXML/FormJSON/FormPresentation hashes are unchanged.
- Plugin Steps: Enabled 7 / Disabled 0.
- Target Form: Inactive, non-default, unpublished.
- App references: 0.

## Remaining gaps

### P0

- Actual Management Main Form still contains only the primary name. The monthly entry form and read-only `aigw_annualactualrevenue` control remain for R2E-1D.
- The custom two-stage BPF remains Draft/Inactive and outside the App; the separate R2E-1C gates remain required.
- Full Replica remains intentionally unpublished and outside the App until R2E-1E.

### P1

- Numbering for unobserved win-probability and budget-status options was not inferred.
- Duplicate semantic option families in Opportunity Type and Case Stage still require a separate value/label audit.
- The Actuals default View still lacks the screenshot's April-March wide monthly columns.
- Product/Documents internal English system labels remain intentionally unchanged.

## Request accounting

| GET | POST | PATCH | DELETE | Publish | Business writes | Production requests |
|---:|---:|---:|---:|---:|---:|---:|
| 66 | 4 | 1 | 0 | 0 | 0 | 0 |

The four POST requests were `UpdateOptionValue` label updates. The single PATCH updated only the target unpublished `systemform.formxml`.

Rollback requires separate authorization: restore the captured unpublished FormXML and restore only the four changed option labels with `MergeLabels=true`. No physical metadata deletion is required.
