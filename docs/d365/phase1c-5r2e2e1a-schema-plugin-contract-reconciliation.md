# Phase 1C-5R2E-2E1A Actual Management Schema and Plugin Contract Reconciliation

## Decision

**Plugin Smoke Contract Ready=false**

本轮仅执行只读回读。三项请求字段均未在当前测试环境的 Actual Management 元数据中找到；未创建、修改或删除字段、表单、View、App、BPF、Plugin、Solution 或业务记录。

字段按用户允许的三类逐项分类：

| Requested field | Metadata | Form | View | Deployed Plugin | Classification |
|---|---|---|---|---|---|
| `aigw_fiscalyear` | absent | absent | absent | absent | **B. FIELD_DESIGN_MISSING** |
| `aigw_annualactualgp` | absent | absent | absent | absent | **C. FEATURE_NOT_IN_SCOPE** |
| `aigw_annualactualmp` | absent | absent | absent | absent | **C. FEATURE_NOT_IN_SCOPE** |

没有证据表明这些名称是现有字段的错误 logical name，因此本轮不判为 A. CONTRACT_NAME_MISMATCH。

## Environment And Safety

| Item | Result |
|---|---|
| Connected hostname | `org91f5f65f.crm5.dynamics.com` |
| Organization ID | `2f6326b2-1d75-f111-b27b-000d3a80bc9d` |
| Production hostname | blocked by exact-host gate |
| POST / PATCH / DELETE / Publish | 0 / 0 / 0 / 0 |
| Business data writes | 0 |
| Production requests | 0 |
| Read requests in this audit | GET=28 |
| Read failures | 0 |

## Actual Management Table

| Property | Value |
|---|---|
| Logical name | `aigw_actualmanagement` |
| Schema name | `aigw_ActualManagement` |
| Entity set | `aigw_actualmanagements` |
| Object type code | `11722` |
| Ownership | `OrganizationOwned` |
| Primary name | `aigw_name` |
| Metadata ID | `e46411b2-7d7c-f111-ab0e-70a8a50388b9` |
| Managed | `false` |
| Custom field rows returned | 79 |

Attribute-level Metadata does not expose an independent state/status property. The table below records the available create/update/read, managed, secured and SourceType information; for these fields `SourceType=0 (Simple)` is treated as neither calculated nor rollup.

### All Custom Attributes Returned

| # | Logical name | Schema name | 1033 | 2052 | Type | Required | Create | Update | Read | SourceType | Calculated | Rollup | Secured | Managed | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `aigw_actualmanagementid` | `aigw_ActualManagementId` | Actual Management | 实绩管理 | UniqueidentifierType | SystemRequired | true | false | true | unknown | unknown | unknown | false | false | unmanaged |
| 2 | `aigw_annualactualrevenue` | `aigw_AnnualActualRevenue` | Annual Actual Revenue | 年度实绩收入 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 3 | `aigw_annualactualrevenue_base` | `aigw_annualactualrevenue_Base` | Annual Actual Revenue (Base) | 年度实绩收入(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 4 | `aigw_aprilactualgp` | `aigw_AprilActualGP` | April Actual GP | 4月实绩毛利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 5 | `aigw_aprilactualgp_base` | `aigw_aprilactualgp_Base` | April Actual GP (Base) | 4月实绩毛利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 6 | `aigw_aprilactualmp` | `aigw_AprilActualMP` | April Actual MP | 4月实绩边际利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 7 | `aigw_aprilactualmp_base` | `aigw_aprilactualmp_Base` | April Actual MP (Base) | 4月实绩边际利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 8 | `aigw_aprilactualrevenue` | `aigw_AprilActualRevenue` | April Actual Revenue | 4月实绩收入 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 9 | `aigw_aprilactualrevenue_base` | `aigw_aprilactualrevenue_Base` | April Actual Revenue (Base) | 4月实绩收入(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 10 | `aigw_augustactualgp` | `aigw_AugustActualGP` | August Actual GP | 8月实绩毛利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 11 | `aigw_augustactualgp_base` | `aigw_augustactualgp_Base` | August Actual GP (Base) | 8月实绩毛利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 12 | `aigw_augustactualmp` | `aigw_AugustActualMP` | August Actual MP | 8月实绩边际利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 13 | `aigw_augustactualmp_base` | `aigw_augustactualmp_Base` | August Actual MP (Base) | 8月实绩边际利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 14 | `aigw_augustactualrevenue` | `aigw_AugustActualRevenue` | August Actual Revenue | 8月实绩收入 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 15 | `aigw_augustactualrevenue_base` | `aigw_augustactualrevenue_Base` | August Actual Revenue (Base) | 8月实绩收入(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 16 | `aigw_decemberactualgp` | `aigw_DecemberActualGP` | December Actual GP | 12月实绩毛利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 17 | `aigw_decemberactualgp_base` | `aigw_decemberactualgp_Base` | December Actual GP (Base) | 12月实绩毛利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 18 | `aigw_decemberactualmp` | `aigw_DecemberActualMP` | December Actual MP | 12月实绩边际利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 19 | `aigw_decemberactualmp_base` | `aigw_decemberactualmp_Base` | December Actual MP (Base) | 12月实绩边际利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 20 | `aigw_decemberactualrevenue` | `aigw_DecemberActualRevenue` | December Actual Revenue | 12月实绩收入 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 21 | `aigw_decemberactualrevenue_base` | `aigw_decemberactualrevenue_Base` | December Actual Revenue (Base) | 12月实绩收入(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 22 | `aigw_expectedorderdate` | `aigw_ExpectedOrderDate` | Expected Order Date | 预计下单日 | DateTimeType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 23 | `aigw_februaryactualgp` | `aigw_FebruaryActualGP` | February Actual GP | 2月实绩毛利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 24 | `aigw_februaryactualgp_base` | `aigw_februaryactualgp_Base` | February Actual GP (Base) | 2月实绩毛利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 25 | `aigw_februaryactualmp` | `aigw_FebruaryActualMP` | February Actual MP | 2月实绩边际利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 26 | `aigw_februaryactualmp_base` | `aigw_februaryactualmp_Base` | February Actual MP (Base) | 2月实绩边际利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 27 | `aigw_februaryactualrevenue` | `aigw_FebruaryActualRevenue` | February Actual Revenue | 2月实绩收入 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 28 | `aigw_februaryactualrevenue_base` | `aigw_februaryactualrevenue_Base` | February Actual Revenue (Base) | 2月实绩收入(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 29 | `aigw_januaryactualgp` | `aigw_JanuaryActualGP` | January Actual GP | 1月实绩毛利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 30 | `aigw_januaryactualgp_base` | `aigw_januaryactualgp_Base` | January Actual GP (Base) | 1月实绩毛利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 31 | `aigw_januaryactualmp` | `aigw_JanuaryActualMP` | January Actual MP | 1月实绩边际利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 32 | `aigw_januaryactualmp_base` | `aigw_januaryactualmp_Base` | January Actual MP (Base) | 1月实绩边际利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 33 | `aigw_januaryactualrevenue` | `aigw_JanuaryActualRevenue` | January Actual Revenue | 1月实绩收入 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 34 | `aigw_januaryactualrevenue_base` | `aigw_januaryactualrevenue_Base` | January Actual Revenue (Base) | 1月实绩收入(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 35 | `aigw_julyactualgp` | `aigw_JulyActualGP` | July Actual GP | 7月实绩毛利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 36 | `aigw_julyactualgp_base` | `aigw_julyactualgp_Base` | July Actual GP (Base) | 7月实绩毛利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 37 | `aigw_julyactualmp` | `aigw_JulyActualMP` | July Actual MP | 7月实绩边际利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 38 | `aigw_julyactualmp_base` | `aigw_julyactualmp_Base` | July Actual MP (Base) | 7月实绩边际利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 39 | `aigw_julyactualrevenue` | `aigw_JulyActualRevenue` | July Actual Revenue | 7月实绩收入 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 40 | `aigw_julyactualrevenue_base` | `aigw_julyactualrevenue_Base` | July Actual Revenue (Base) | 7月实绩收入(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 41 | `aigw_juneactualgp` | `aigw_JuneActualGP` | June Actual GP | 6月实绩毛利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 42 | `aigw_juneactualgp_base` | `aigw_juneactualgp_Base` | June Actual GP (Base) | 6月实绩毛利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 43 | `aigw_juneactualmp` | `aigw_JuneActualMP` | June Actual MP | 6月实绩边际利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 44 | `aigw_juneactualmp_base` | `aigw_juneactualmp_Base` | June Actual MP (Base) | 6月实绩边际利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 45 | `aigw_juneactualrevenue` | `aigw_JuneActualRevenue` | June Actual Revenue | 6月实绩收入 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 46 | `aigw_juneactualrevenue_base` | `aigw_juneactualrevenue_Base` | June Actual Revenue (Base) | 6月实绩收入(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 47 | `aigw_marchactualgp` | `aigw_MarchActualGP` | March Actual GP | 3月实绩毛利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 48 | `aigw_marchactualgp_base` | `aigw_marchactualgp_Base` | March Actual GP (Base) | 3月实绩毛利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 49 | `aigw_marchactualmp` | `aigw_MarchActualMP` | March Actual MP | 3月实绩边际利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 50 | `aigw_marchactualmp_base` | `aigw_marchactualmp_Base` | March Actual MP (Base) | 3月实绩边际利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 51 | `aigw_marchactualrevenue` | `aigw_MarchActualRevenue` | March Actual Revenue | 3月实绩收入 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 52 | `aigw_marchactualrevenue_base` | `aigw_marchactualrevenue_Base` | March Actual Revenue (Base) | 3月实绩收入(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 53 | `aigw_mayactualgp` | `aigw_MayActualGP` | May Actual GP | 5月实绩毛利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 54 | `aigw_mayactualgp_base` | `aigw_mayactualgp_Base` | May Actual GP (Base) | 5月实绩毛利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 55 | `aigw_mayactualmp` | `aigw_MayActualMP` | May Actual MP | 5月实绩边际利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 56 | `aigw_mayactualmp_base` | `aigw_mayactualmp_Base` | May Actual MP (Base) | 5月实绩边际利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 57 | `aigw_mayactualrevenue` | `aigw_MayActualRevenue` | May Actual Revenue | 5月实绩收入 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 58 | `aigw_mayactualrevenue_base` | `aigw_mayactualrevenue_Base` | May Actual Revenue (Base) | 5月实绩收入(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 59 | `aigw_name` | `aigw_Name` | Actual Name | 实绩名称 | StringType | ApplicationRequired | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 60 | `aigw_novemberactualgp` | `aigw_NovemberActualGP` | November Actual GP | 11月实绩毛利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 61 | `aigw_novemberactualgp_base` | `aigw_novemberactualgp_Base` | November Actual GP (Base) | 11月实绩毛利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 62 | `aigw_novemberactualmp` | `aigw_NovemberActualMP` | November Actual MP | 11月实绩边际利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 63 | `aigw_novemberactualmp_base` | `aigw_novemberactualmp_Base` | November Actual MP (Base) | 11月实绩边际利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 64 | `aigw_novemberactualrevenue` | `aigw_NovemberActualRevenue` | November Actual Revenue | 11月实绩收入 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 65 | `aigw_novemberactualrevenue_base` | `aigw_novemberactualrevenue_Base` | November Actual Revenue (Base) | 11月实绩收入(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 66 | `aigw_octoberactualgp` | `aigw_OctoberActualGP` | October Actual GP | 10月实绩毛利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 67 | `aigw_octoberactualgp_base` | `aigw_octoberactualgp_Base` | October Actual GP (Base) | 10月实绩毛利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 68 | `aigw_octoberactualmp` | `aigw_OctoberActualMP` | October Actual MP | 10月实绩边际利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 69 | `aigw_octoberactualmp_base` | `aigw_octoberactualmp_Base` | October Actual MP (Base) | 10月实绩边际利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 70 | `aigw_octoberactualrevenue` | `aigw_OctoberActualRevenue` | October Actual Revenue | 10月实绩收入 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 71 | `aigw_octoberactualrevenue_base` | `aigw_octoberactualrevenue_Base` | October Actual Revenue (Base) | 10月实绩收入(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 72 | `aigw_opportunityid` | `aigw_OpportunityId` | Related Opportunity | 相关商机 | LookupType | ApplicationRequired | true | true | true | unknown | unknown | unknown | false | false | unmanaged |
| 73 | `aigw_opportunityidname` | `aigw_OpportunityIdName` |  |  | StringType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 74 | `aigw_septemberactualgp` | `aigw_SeptemberActualGP` | September Actual GP | 9月实绩毛利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 75 | `aigw_septemberactualgp_base` | `aigw_septemberactualgp_Base` | September Actual GP (Base) | 9月实绩毛利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 76 | `aigw_septemberactualmp` | `aigw_SeptemberActualMP` | September Actual MP | 9月实绩边际利润 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 77 | `aigw_septemberactualmp_base` | `aigw_septemberactualmp_Base` | September Actual MP (Base) | 9月实绩边际利润(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |
| 78 | `aigw_septemberactualrevenue` | `aigw_SeptemberActualRevenue` | September Actual Revenue | 9月实绩收入 | MoneyType | None | true | true | true | 0 (Simple) | false | false | false | false | unmanaged |
| 79 | `aigw_septemberactualrevenue_base` | `aigw_septemberactualrevenue_Base` | September Actual Revenue (Base) | 9月实绩收入(基础货币) | MoneyType | None | false | false | true | 0 (Simple) | false | false | false | false | unmanaged |

### Opportunity Target Amount Fields

| Logical name | Schema name | Type | 1033 | 2052 | Required | Create | Update | Read | SourceType | Secured | Managed | CalculationOf |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `aigw_yearrevenueactual` | `Aigw_Yearrevenueactual` | MoneyType | 年度收入实绩总金额 | 年度收入实绩总金额 | None | true | true | true | 0 (Simple) | false | false |  |
| `aigw_yearrevenueactual_base` | `aigw_yearrevenueactual_Base` | MoneyType | 年度收入实绩总金额 (Base) | 年度收入实绩总金额(基础货币) | None | false | false | true | 0 (Simple) | false | false | aigw_yearrevenueactual |
| `aigw_yearrevenueactualcny` | `Aigw_Yearrevenueactualcny` | MoneyType | 年度收入实绩总金额(CNY) | 年度收入实绩总金额(CNY) | None | true | true | true | 0 (Simple) | false | false |  |
| `transactioncurrencyid` | `TransactionCurrencyId` | LookupType | Currency | 货币 | ApplicationRequired | true | true | true | unknown | false | true |  |

The current parent contract is `opportunity.aigw_yearrevenueactual`. Its generated base companion `aigw_yearrevenueactual_base` exists, is read-only for create/update, and reports `CalculationOf=aigw_yearrevenueactual`. The independent deprecated field `aigw_yearrevenueactualcny` exists but is not written by the Plugin.

## Actual Management Main Form

| Property | Published | Unpublished/current |
|---|---|---|
| Form ID | `e0537d47-a5f7-45a3-b607-608e7e831700` | same |
| Form name | `实绩管理 - AI Demo` | same |
| FormXML SHA-256 | `a0a8c328c0bba4de1e9dd98171c65755fa65428c36e85c35eb412a6d8b61435b` | `f3940322eef8320e95b8a6db97b6d79e3632dc93355abe1e8f402204313815ad` |
| FormJSON SHA-256 | `d70e2607079c73a44b178a7de54d8276ddb1b6de0824049cb225781fe79bbf79` | `d70e2607079c73a44b178a7de54d8276ddb1b6de0824049cb225781fe79bbf79` |
| Tabs / Sections / Controls | 1 / 5 / 41 | same readback |
| Annual Revenue controls | 1 | same |
| Annual Revenue read-only | `disabled=true` | same |
| Fiscal Year controls | 0 | same |
| Annual GP controls | 0 | same |
| Annual MP controls | 0 | same |
| Opportunity lookup controls | 1 | same |
| Currency controls | 1 | same |

### All 41 Controls

| # | Control ID | Bound attribute | Label 1033 / 2052 | Tab | Section | Row/Col | Class ID | Disabled | Visible |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `aigw_actualentry_aigw_name` | `aigw_name` | Actual Name / 实绩名称 | `aigw_actualentry_tab` | `aigw_actualentry_basic` | 1/1 | {4273EDBD-AC1D-40d3-9FB2-095C621B552D} | false | default |
| 2 | `aigw_actualentry_aigw_opportunityid` | `aigw_opportunityid` | Related Opportunity / 相关商机 | `aigw_actualentry_tab` | `aigw_actualentry_basic` | 1/2 | {270BD3DB-D9AF-4782-9025-509E298DEC0A} | false | default |
| 3 | `aigw_actualentry_transactioncurrencyid` | `transactioncurrencyid` | Transaction Currency / 交易币种 | `aigw_actualentry_tab` | `aigw_actualentry_basic` | 2/1 | {270BD3DB-D9AF-4782-9025-509E298DEC0A} | false | default |
| 4 | `aigw_actualentry_aigw_expectedorderdate` | `aigw_expectedorderdate` | Expected Order Date / 预计下单日 | `aigw_actualentry_tab` | `aigw_actualentry_basic` | 2/2 | {5B773807-9FB2-42db-97C3-7A91EFF8ADFF} | false | default |
| 5 | `aigw_actualentry_aigw_annualactualrevenue` | `aigw_annualactualrevenue` | Annual Actual Revenue / 年度收入实绩总金额 | `aigw_actualentry_tab` | `aigw_actualentry_basic` | 3/1 | {533B9E00-756B-4312-95A0-DC888637AC78} | true | default |
| 6 | `aigw_actualentry_aigw_aprilactualrevenue` | `aigw_aprilactualrevenue` | April Actual Revenue / 4月实绩收入 | `aigw_actualentry_tab` | `aigw_actualentry_q1` | 1/1 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 7 | `aigw_actualentry_aigw_aprilactualgp` | `aigw_aprilactualgp` | April Actual GP / 4月实绩毛利润 | `aigw_actualentry_tab` | `aigw_actualentry_q1` | 1/2 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 8 | `aigw_actualentry_aigw_aprilactualmp` | `aigw_aprilactualmp` | April Actual MP / 4月实绩边际利润 | `aigw_actualentry_tab` | `aigw_actualentry_q1` | 1/3 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 9 | `aigw_actualentry_aigw_mayactualrevenue` | `aigw_mayactualrevenue` | May Actual Revenue / 5月实绩收入 | `aigw_actualentry_tab` | `aigw_actualentry_q1` | 2/1 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 10 | `aigw_actualentry_aigw_mayactualgp` | `aigw_mayactualgp` | May Actual GP / 5月实绩毛利润 | `aigw_actualentry_tab` | `aigw_actualentry_q1` | 2/2 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 11 | `aigw_actualentry_aigw_mayactualmp` | `aigw_mayactualmp` | May Actual MP / 5月实绩边际利润 | `aigw_actualentry_tab` | `aigw_actualentry_q1` | 2/3 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 12 | `aigw_actualentry_aigw_juneactualrevenue` | `aigw_juneactualrevenue` | June Actual Revenue / 6月实绩收入 | `aigw_actualentry_tab` | `aigw_actualentry_q1` | 3/1 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 13 | `aigw_actualentry_aigw_juneactualgp` | `aigw_juneactualgp` | June Actual GP / 6月实绩毛利润 | `aigw_actualentry_tab` | `aigw_actualentry_q1` | 3/2 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 14 | `aigw_actualentry_aigw_juneactualmp` | `aigw_juneactualmp` | June Actual MP / 6月实绩边际利润 | `aigw_actualentry_tab` | `aigw_actualentry_q1` | 3/3 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 15 | `aigw_actualentry_aigw_julyactualrevenue` | `aigw_julyactualrevenue` | July Actual Revenue / 7月实绩收入 | `aigw_actualentry_tab` | `aigw_actualentry_q2` | 1/1 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 16 | `aigw_actualentry_aigw_julyactualgp` | `aigw_julyactualgp` | July Actual GP / 7月实绩毛利润 | `aigw_actualentry_tab` | `aigw_actualentry_q2` | 1/2 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 17 | `aigw_actualentry_aigw_julyactualmp` | `aigw_julyactualmp` | July Actual MP / 7月实绩边际利润 | `aigw_actualentry_tab` | `aigw_actualentry_q2` | 1/3 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 18 | `aigw_actualentry_aigw_augustactualrevenue` | `aigw_augustactualrevenue` | August Actual Revenue / 8月实绩收入 | `aigw_actualentry_tab` | `aigw_actualentry_q2` | 2/1 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 19 | `aigw_actualentry_aigw_augustactualgp` | `aigw_augustactualgp` | August Actual GP / 8月实绩毛利润 | `aigw_actualentry_tab` | `aigw_actualentry_q2` | 2/2 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 20 | `aigw_actualentry_aigw_augustactualmp` | `aigw_augustactualmp` | August Actual MP / 8月实绩边际利润 | `aigw_actualentry_tab` | `aigw_actualentry_q2` | 2/3 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 21 | `aigw_actualentry_aigw_septemberactualrevenue` | `aigw_septemberactualrevenue` | September Actual Revenue / 9月实绩收入 | `aigw_actualentry_tab` | `aigw_actualentry_q2` | 3/1 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 22 | `aigw_actualentry_aigw_septemberactualgp` | `aigw_septemberactualgp` | September Actual GP / 9月实绩毛利润 | `aigw_actualentry_tab` | `aigw_actualentry_q2` | 3/2 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 23 | `aigw_actualentry_aigw_septemberactualmp` | `aigw_septemberactualmp` | September Actual MP / 9月实绩边际利润 | `aigw_actualentry_tab` | `aigw_actualentry_q2` | 3/3 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 24 | `aigw_actualentry_aigw_octoberactualrevenue` | `aigw_octoberactualrevenue` | October Actual Revenue / 10月实绩收入 | `aigw_actualentry_tab` | `aigw_actualentry_q3` | 1/1 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 25 | `aigw_actualentry_aigw_octoberactualgp` | `aigw_octoberactualgp` | October Actual GP / 10月实绩毛利润 | `aigw_actualentry_tab` | `aigw_actualentry_q3` | 1/2 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 26 | `aigw_actualentry_aigw_octoberactualmp` | `aigw_octoberactualmp` | October Actual MP / 10月实绩边际利润 | `aigw_actualentry_tab` | `aigw_actualentry_q3` | 1/3 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 27 | `aigw_actualentry_aigw_novemberactualrevenue` | `aigw_novemberactualrevenue` | November Actual Revenue / 11月实绩收入 | `aigw_actualentry_tab` | `aigw_actualentry_q3` | 2/1 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 28 | `aigw_actualentry_aigw_novemberactualgp` | `aigw_novemberactualgp` | November Actual GP / 11月实绩毛利润 | `aigw_actualentry_tab` | `aigw_actualentry_q3` | 2/2 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 29 | `aigw_actualentry_aigw_novemberactualmp` | `aigw_novemberactualmp` | November Actual MP / 11月实绩边际利润 | `aigw_actualentry_tab` | `aigw_actualentry_q3` | 2/3 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 30 | `aigw_actualentry_aigw_decemberactualrevenue` | `aigw_decemberactualrevenue` | December Actual Revenue / 12月实绩收入 | `aigw_actualentry_tab` | `aigw_actualentry_q3` | 3/1 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 31 | `aigw_actualentry_aigw_decemberactualgp` | `aigw_decemberactualgp` | December Actual GP / 12月实绩毛利润 | `aigw_actualentry_tab` | `aigw_actualentry_q3` | 3/2 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 32 | `aigw_actualentry_aigw_decemberactualmp` | `aigw_decemberactualmp` | December Actual MP / 12月实绩边际利润 | `aigw_actualentry_tab` | `aigw_actualentry_q3` | 3/3 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 33 | `aigw_actualentry_aigw_januaryactualrevenue` | `aigw_januaryactualrevenue` | January Actual Revenue / 1月实绩收入 | `aigw_actualentry_tab` | `aigw_actualentry_q4` | 1/1 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 34 | `aigw_actualentry_aigw_januaryactualgp` | `aigw_januaryactualgp` | January Actual GP / 1月实绩毛利润 | `aigw_actualentry_tab` | `aigw_actualentry_q4` | 1/2 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 35 | `aigw_actualentry_aigw_januaryactualmp` | `aigw_januaryactualmp` | January Actual MP / 1月实绩边际利润 | `aigw_actualentry_tab` | `aigw_actualentry_q4` | 1/3 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 36 | `aigw_actualentry_aigw_februaryactualrevenue` | `aigw_februaryactualrevenue` | February Actual Revenue / 2月实绩收入 | `aigw_actualentry_tab` | `aigw_actualentry_q4` | 2/1 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 37 | `aigw_actualentry_aigw_februaryactualgp` | `aigw_februaryactualgp` | February Actual GP / 2月实绩毛利润 | `aigw_actualentry_tab` | `aigw_actualentry_q4` | 2/2 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 38 | `aigw_actualentry_aigw_februaryactualmp` | `aigw_februaryactualmp` | February Actual MP / 2月实绩边际利润 | `aigw_actualentry_tab` | `aigw_actualentry_q4` | 2/3 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 39 | `aigw_actualentry_aigw_marchactualrevenue` | `aigw_marchactualrevenue` | March Actual Revenue / 3月实绩收入 | `aigw_actualentry_tab` | `aigw_actualentry_q4` | 3/1 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 40 | `aigw_actualentry_aigw_marchactualgp` | `aigw_marchactualgp` | March Actual GP / 3月实绩毛利润 | `aigw_actualentry_tab` | `aigw_actualentry_q4` | 3/2 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |
| 41 | `aigw_actualentry_aigw_marchactualmp` | `aigw_marchactualmp` | March Actual MP / 3月实绩边际利润 | `aigw_actualentry_tab` | `aigw_actualentry_q4` | 3/3 | {533B9E00-756B-4312-95A0-DC888637AC78} | false | default |

结论：Form 的 41 个控件均绑定到当前存在的字段或平台控件；没有“控件存在但属性不存在”的异常。缺失的 Fiscal Year、Annual GP、Annual MP 没有控件。年度 Revenue 唯一控件绑定 `aigw_annualactualrevenue` 且 `disabled=true`；Opportunity lookup 和 Currency 均可读写。

## Actual Management View

| Property | Result |
|---|---|
| View | `实绩管理 - AI Demo` |
| SavedQuery ID | `7a00b267-977c-f111-ab0e-000d3a857307` |
| Returned type | `aigw_actualmanagement` |
| FetchXML columns | 33 |
| LayoutXML columns | 33 |
| Fetch/Layout order | identical for all 33 columns |
| FetchXML hash | `9e53a5f48f2e9063ebd94e2a839e08adcd9cd30747e86c28972e0b58f155ebfd` |
| LayoutXML hash | `ecf5b309da6b9fb92214ca18733cc7033e5ff64b042df2ce3ab7101d08c8c49d` |
| LayoutJSON hash | `917b3ffcb418cbfcca3fdb4e11ec79baac30c75266c79e99b38431a47d57869f` |
| Fiscal Year in View | false |
| Annual Revenue in View | true |
| Annual GP in View | false |
| Annual MP in View | false |

| Order | Layout field | Fetch field/order |
| --- | --- | --- |
| 1 | `aigw_name` | same order |
| 2 | `aigw_opportunityid` | same order |
| 3 | `transactioncurrencyid` | same order |
| 4 | `aigw_expectedorderdate` | same order |
| 5 | `aigw_annualactualrevenue` | same order |
| 6 | `aigw_aprilactualrevenue` | same order |
| 7 | `aigw_aprilactualgp` | same order |
| 8 | `aigw_mayactualrevenue` | same order |
| 9 | `aigw_mayactualgp` | same order |
| 10 | `aigw_juneactualrevenue` | same order |
| 11 | `aigw_juneactualgp` | same order |
| 12 | `aigw_julyactualrevenue` | same order |
| 13 | `aigw_julyactualgp` | same order |
| 14 | `aigw_augustactualrevenue` | same order |
| 15 | `aigw_augustactualgp` | same order |
| 16 | `aigw_septemberactualrevenue` | same order |
| 17 | `aigw_septemberactualgp` | same order |
| 18 | `aigw_octoberactualrevenue` | same order |
| 19 | `aigw_octoberactualgp` | same order |
| 20 | `aigw_novemberactualrevenue` | same order |
| 21 | `aigw_novemberactualgp` | same order |
| 22 | `aigw_decemberactualrevenue` | same order |
| 23 | `aigw_decemberactualgp` | same order |
| 24 | `aigw_januaryactualrevenue` | same order |
| 25 | `aigw_januaryactualgp` | same order |
| 26 | `aigw_februaryactualrevenue` | same order |
| 27 | `aigw_februaryactualgp` | same order |
| 28 | `aigw_marchactualrevenue` | same order |
| 29 | `aigw_marchactualgp` | same order |
| 30 | `createdby` | same order |
| 31 | `createdon` | same order |
| 32 | `modifiedby` | same order |
| 33 | `modifiedon` | same order |

The View contains monthly Revenue and GP columns, but no monthly MP columns and no annual GP/MP/Fiscal Year columns. This is consistent with the current deployed View definition and is recorded as scope, not a guessed field mapping.

## Plugin Registration And Source Contract

| Item | Readback |
|---|---|
| Assembly | `CrmAiGateway.ActualTotals.Plugin` |
| Assembly count | 1 |
| Public key token | `0350f79ae25dc991` |
| Plugin types | 3 |
| Steps | 7 |
| Images | 6 |
| Enabled / Disabled | 7 / 0 |

### Steps

| Step | Stage | Mode | Rank | Filtering attributes | State |
| --- | --- | --- | --- | --- | --- |
| Actual Totals - PreValidation - Create | 10 | 0 | 10 | none | Enabled |
| Actual Totals - PreValidation - Update | 10 | 0 | 10 | aigw_aprilactualrevenue,aigw_mayactualrevenue,aigw_juneactualrevenue,aigw_julyactualrevenue,aigw_augustactualrevenue,aigw_septemberactualrevenue,aigw_octoberactualrevenue,aigw_novemberactualrevenue,aigw_decemberactualrevenue,aigw_januaryactualrevenue,aigw_februaryactualrevenue,aigw_marchactualrevenue,aigw_opportunityid,transactioncurrencyid | Enabled |
| Actual Totals - PreOperation - Create | 20 | 0 | 20 | none | Enabled |
| Actual Totals - PreOperation - Update | 20 | 0 | 20 | aigw_aprilactualrevenue,aigw_mayactualrevenue,aigw_juneactualrevenue,aigw_julyactualrevenue,aigw_augustactualrevenue,aigw_septemberactualrevenue,aigw_octoberactualrevenue,aigw_novemberactualrevenue,aigw_decemberactualrevenue,aigw_januaryactualrevenue,aigw_februaryactualrevenue,aigw_marchactualrevenue,aigw_opportunityid,transactioncurrencyid | Enabled |
| Actual Totals - PostOperation - Create | 40 | 0 | 30 | none | Enabled |
| Actual Totals - PostOperation - Update | 40 | 0 | 30 | aigw_aprilactualrevenue,aigw_mayactualrevenue,aigw_juneactualrevenue,aigw_julyactualrevenue,aigw_augustactualrevenue,aigw_septemberactualrevenue,aigw_octoberactualrevenue,aigw_novemberactualrevenue,aigw_decemberactualrevenue,aigw_januaryactualrevenue,aigw_februaryactualrevenue,aigw_marchactualrevenue,aigw_opportunityid,transactioncurrencyid | Enabled |
| Actual Totals - PostOperation - Delete | 40 | 0 | 30 | none | Enabled |

### Images

| Name | Alias | Image type | Attributes |
| --- | --- | --- | --- |
| PreImage | PreImage | 0 | aigw_opportunityid,transactioncurrencyid,aigw_annualactualrevenue,aigw_aprilactualrevenue,aigw_mayactualrevenue,aigw_juneactualrevenue,aigw_julyactualrevenue,aigw_augustactualrevenue,aigw_septemberactualrevenue,aigw_octoberactualrevenue,aigw_novemberactualrevenue,aigw_decemberactualrevenue,aigw_januaryactualrevenue,aigw_februaryactualrevenue,aigw_marchactualrevenue |
| PreImage | PreImage | 0 | aigw_opportunityid,transactioncurrencyid,aigw_annualactualrevenue,aigw_aprilactualrevenue,aigw_mayactualrevenue,aigw_juneactualrevenue,aigw_julyactualrevenue,aigw_augustactualrevenue,aigw_septemberactualrevenue,aigw_octoberactualrevenue,aigw_novemberactualrevenue,aigw_decemberactualrevenue,aigw_januaryactualrevenue,aigw_februaryactualrevenue,aigw_marchactualrevenue |
| PostImage | PostImage | 1 | aigw_opportunityid,transactioncurrencyid,aigw_annualactualrevenue,aigw_aprilactualrevenue,aigw_mayactualrevenue,aigw_juneactualrevenue,aigw_julyactualrevenue,aigw_augustactualrevenue,aigw_septemberactualrevenue,aigw_octoberactualrevenue,aigw_novemberactualrevenue,aigw_decemberactualrevenue,aigw_januaryactualrevenue,aigw_februaryactualrevenue,aigw_marchactualrevenue |
| PreImage | PreImage | 0 | aigw_opportunityid,transactioncurrencyid,aigw_annualactualrevenue,aigw_aprilactualrevenue,aigw_mayactualrevenue,aigw_juneactualrevenue,aigw_julyactualrevenue,aigw_augustactualrevenue,aigw_septemberactualrevenue,aigw_octoberactualrevenue,aigw_novemberactualrevenue,aigw_decemberactualrevenue,aigw_januaryactualrevenue,aigw_februaryactualrevenue,aigw_marchactualrevenue |
| PostImage | PostImage | 1 | aigw_opportunityid,transactioncurrencyid,aigw_annualactualrevenue,aigw_aprilactualrevenue,aigw_mayactualrevenue,aigw_juneactualrevenue,aigw_julyactualrevenue,aigw_augustactualrevenue,aigw_septemberactualrevenue,aigw_octoberactualrevenue,aigw_novemberactualrevenue,aigw_decemberactualrevenue,aigw_januaryactualrevenue,aigw_februaryactualrevenue,aigw_marchactualrevenue |
| PreImage | PreImage | 0 | aigw_opportunityid,transactioncurrencyid,aigw_annualactualrevenue,aigw_aprilactualrevenue,aigw_mayactualrevenue,aigw_juneactualrevenue,aigw_julyactualrevenue,aigw_augustactualrevenue,aigw_septemberactualrevenue,aigw_octoberactualrevenue,aigw_novemberactualrevenue,aigw_decemberactualrevenue,aigw_januaryactualrevenue,aigw_februaryactualrevenue,aigw_marchactualrevenue |

### Implemented Field Contract

- Monthly Revenue source fields: `aigw_aprilactualrevenue`, `aigw_mayactualrevenue`, `aigw_juneactualrevenue`, `aigw_julyactualrevenue`, `aigw_augustactualrevenue`, `aigw_septemberactualrevenue`, `aigw_octoberactualrevenue`, `aigw_novemberactualrevenue`, `aigw_decemberactualrevenue`, `aigw_januaryactualrevenue`, `aigw_februaryactualrevenue`, `aigw_marchactualrevenue`.
- Monthly GP fields exist in the table and Form, but are not read, summed or written by this Plugin.
- Monthly MP fields exist in the table and Form, but are not read, summed or written by this Plugin.
- Child annual field written in PreOperation: `aigw_annualactualrevenue`.
- Parent field written in PostOperation: `aigw_yearrevenueactual`.
- Parent deprecated independent CNY field is not written: `aigw_yearrevenueactualcny`.
- No `_base` field is written by the Plugin.
- Lookup and currency validation fields: `aigw_opportunityid`, `transactioncurrencyid`.
- Create validation rejects a second Actual for the same Opportunity; it does not filter by Fiscal Year because no Fiscal Year field exists.
- Update filtering attributes are the 12 Revenue fields plus `aigw_opportunityid` and `transactioncurrencyid`; `aigw_annualactualrevenue`, GP, MP and all `_base` fields are excluded.
- PreImage fields: `aigw_opportunityid`, `transactioncurrencyid`, `aigw_annualactualrevenue`, and the 12 Revenue fields.
- PostImage fields: the same current implementation set; Delete uses PreImage to recover the old Opportunity.
- SharedVariables/depth guard is implemented in the Plugin adapter; it does not introduce any missing business field.

Direct answers:

1. The deployed Plugin does **not** reference `aigw_fiscalyear`.
2. The deployed Plugin does **not** reference `aigw_annualactualgp`.
3. The deployed Plugin does **not** reference `aigw_annualactualmp`.
4. The prior Fiscal Year uniqueness scenario did not reach browser execution: the metadata preflight stopped before opening the New form. The current runtime uniqueness rule is Opportunity-wide, not Fiscal-Year-specific.
5. Annual GP/MP aggregation is not part of the current Plugin implementation; only annual Revenue is implemented.

## Repository Reference Matrix

| Source category | Files | Finding |
|---|---|---|
| Dataverse metadata / architecture scripts | `scripts/dataverse/generate-phase1c5r-actual-totals-architecture.mjs` | Earliest planning source for recommended `aigw_fiscalyear`; it is a dry-run design, not a deployed field or Plugin contract. |
| Architecture documentation | `docs/d365/phase1c-5r-actual-totals-architecture.md` | Repeats the Fiscal Year proposal and future sequence; not current metadata. |
| Form generation / View scripts | `scripts/dataverse/apply-phase1c1-actual-management-table.mjs`, `scripts/dataverse/apply-phase1c3-actual-management-view.mjs` | Target the deployed 40 business fields and the current View; no requested missing logical names. |
| Plugin source | `plugins/ActualTotals/src/CrmAiGateway.ActualTotals.Core/FieldNames.cs` and adapter/store files | Canonical contract contains monthly Revenue, child annual Revenue, parent annual Revenue, lookup and currency only; no three missing fields. |
| Plugin tests | `plugins/ActualTotals/tests/` and `tests/phase1c5-plugin-static.test.mjs` | Assert Revenue-only filtering and explicitly exclude GP/MP from Plugin filtering; no annual GP/MP or Fiscal Year runtime contract. |
| Synthetic seed | `scripts/dataverse/lib/phase1c5-synthetic-actuals.mjs` | Generates monthly Revenue/GP/MP; annual Revenue is a Plugin-produced value; no Fiscal Year or annual GP/MP payload. |
| Browser smoke test | `docs/d365/phase1c-5r2e2e1-plugin-browser-smoke.md` and ignored local preflight evidence | The blocked smoke contract introduced the three requested names as required fields; it was stopped before any browser write. |
| Validation reports | `docs/d365/phase1c-5r2e2e1-plugin-browser-smoke.md` | Correctly records all three fields as missing and recommends a separate design decision; no schema change was executed. |

The repository does not contain a deployed Form/View/Plugin mapping for the three names. The Fiscal Year name first appears as a forward-looking architecture recommendation; the annual GP/MP names appear as smoke-test assumptions rather than deployed schema.

## Baseline And Protection Readback

| Protected item | Current readback |
|---|---|
| Full Replica | 5 Tabs / 19 Sections / 115 Controls / 106 unique business-bound fields; Active; Non-default; native Timeline=1; old Timeline=0 |
| Protected Form | FormXML hash `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`, equal to restored baseline; no write performed |
| Actual Management Form | 1 Tab / 5 Sections / 41 Controls; current View/Form read only |
| Actual Management View | 33 FetchXML/LayoutXML columns; hashes recorded above |
| Custom BPF | `销售流程 - AI Demo Full Replica`; state/status `0/1`, unchanged readback |
| Modern App | `CRM AI Gateway Demo - Modern`; unmanaged; no write performed |
| Plugin | 1 Assembly / 3 Types / 7 Steps / 6 Images; 7 enabled / 0 disabled |
| Business records | No reads of record contents and no writes in this audit |

## Conclusions And Boundary

### `aigw_fiscalyear` — B. FIELD_DESIGN_MISSING

The field is absent from table metadata, Form, View and deployed Plugin. It is present only as a prior architecture recommendation for multi-fiscal-year filtering. Do not create it in this phase. A future field design must decide type, required level, April-to-March meaning, uniqueness scope, and Plugin aggregation behavior before any metadata write.

### `aigw_annualactualgp` — C. FEATURE_NOT_IN_SCOPE

Monthly GP fields exist, but the current Form/View/Plugin contract does not include an annual GP field or annual GP aggregation. Do not add a field merely to satisfy the blocked smoke test.

### `aigw_annualactualmp` — C. FEATURE_NOT_IN_SCOPE

Monthly MP fields exist, but the current Form/View/Plugin contract does not include an annual MP field or annual MP aggregation. Do not add a field merely to satisfy the blocked smoke test.

### Recommended repair boundary

- Dataverse Schema change: **not required for the current deployed Revenue-only Plugin contract**; Fiscal Year needs a separate design gate only if multi-year records are a requirement.
- Plugin change: **not required for current scope**; annual GP/MP would require a separately authorized design and implementation if the business explicitly requires them.
- Browser Smoke Test: **must be revised in a later separately authorized change** to use only deployed fields and the current Opportunity-wide one-child invariant. This reconciliation did not modify that test contract.
- Seed remains blocked; no browser smoke retry is authorized by this phase.

## Audit Result

`Plugin Smoke Contract Ready=false`

Reason: the requested smoke contract requires three fields that are absent from the deployed schema, and its Fiscal Year uniqueness expectation does not match the deployed Opportunity-wide uniqueness rule. No Dataverse Schema or Plugin change was made.

## Verification

- npm test: **passed, 167/167**.
- npm run build: **passed**.
- git diff --check: **passed**.
- sensitive scan: **passed**; no production hostname, credential, token or connection-string finding in the committed report.

No R2E-3, seed, browser smoke retry, BPF activation, or metadata change follows from this report.
