# Pending Company CRM Mapping

This document lists the items that must be confirmed with IT / CRM administrators before the company CRM fields can be connected to a real API.

## 1. Source Label to API Logical Name

For each field identified from the company CRM video, confirm:

- screen label / sourceLabel
- real API logical name
- object/table name
- data type
- whether the field can be read by the AI Gateway integration user

Until confirmed, these fields stay in `opportunityFieldMapping` as:

- `sourceSystem: "company_crm_video"`
- `mappingStatus: "pending_real_api_mapping"`
- `realLogicalNameConfirmed: false`
- `includeInSelect: false`

## 2. Choice Option Values

For choice fields, confirm both:

- display label, such as 案件状态 or 案件类型
- raw option value returned by the API

The current screenshots are enough for demo labels, but not enough for production API mapping.

## 3. POL / POD

Confirmed company CRM model:

- `new_sealand_pol` is a lookup.
- `new_sealand_pod` is a lookup.
- `new_air_pol` is a lookup.
- `new_air_pod` is a lookup.

Sales Trial phase one will not create the related lookup tables. Keep POL/POD
as an empty placeholder or text simulation in the demo only. POL/POD must not
enter Safe Context.

If high-fidelity route modeling is required later, create a dedicated Port /
Location lookup table first, then map POL/POD lookups to tokenized route
signals. For Safe Context, do not expose overly detailed route points. Prefer
derived values such as:

- `routeType`
- `originRegion`
- `destinationRegion`

## 4. Timeline API Source

Confirm where timeline/follow-up data comes from:

- note
- email
- phone call
- task
- meeting record
- custom activity table

Raw timeline text must never be sent to AI. The Gateway should sanitize it first and only send a deterministic sanitized summary.

## 5. Field Permissions

Confirm field-level read permissions for:

- customer/contact identifiers
- phone/email/address
- budget/actual/quote amounts
- contract text and attachments
- internal cost or margin fields
- timeline and meeting content

Personal, confidential, and commercial-sensitive fields must be masked, tokenized, banded, summarized, or excluded before AI use.

## 6. Sales Trial Demo Type Mismatches

These fields exist in the Sales Trial demo, but their current Trial type does
not match the exported company CRM type. They are marked in
`opportunityFieldMapping` as `mappingStatus: "needs_replacement"` and are
excluded from the generated Dataverse `$select` until the replacement field is
created and confirmed.

| Company label | Company logical name | Company type | Current Trial field | Current Trial type | Replacement field |
|---|---|---|---|---|---|
| 组织团体 | `new_organization_group` | optionset | `aigw_organizationgroup` | text | `aigw_organizationgroup_choice` |
| 计上部门 | `new_related_department` | optionset | `aigw_bookingdepartment` | text | `aigw_bookingdepartment_choice` |
| 销售部门 | `new_bd_group` | optionset | `aigw_salesdepartment` | text | `aigw_salesdepartment_choice` |
| 案件列表 | `new_pipeline_list` | boolean | `aigw_opportunitylist` | text | `aigw_opportunitylist_bool` |
| Priority | `new_priority` | optionset | `aigw_priority` | text | `aigw_priority_choice` |
| 调查背景 | `new_background` | optionset, pending final confirmation | `aigw_researchbackground` | text | `aigw_researchbackground_choice` |
| 决裁者 | `new_decider` | optionset | `aigw_decider` | text | `aigw_decider_choice` |
| 客户需求 | `new_customerneed` | optionset | `aigw_customerneed` | multiline | `aigw_customerneed_choice` |
| 提案内容 | `new_proposedsolution` | optionset | `aigw_proposalcontent` | multiline | `aigw_proposalcontent_choice` |

`aigw_opportunityplace` maps to company field `new_location`, which is a lookup
in the real CRM. The Trial field is only a text simulation, so it is marked as
`mappingStatus: "simplified_text_simulation"` and excluded from Safe Context.
Do not build AI logic on the raw text field.

The replacement field options for 组织团体, 计上部门, 销售部门, Priority,
调查背景, and 决裁者 are now confirmed from the company CRM export. These
fields are ready for the replacement creation plan, but no Dataverse field
creation should happen until the next explicit execution phase.

## 7. Confirmed Replacement Field Plan

| Company label | Company logical name | Replacement field | Replacement type | Old field to hide | Safe Context |
|---|---|---|---|---|---|
| 组织团体 | `new_organization_group` | `aigw_organizationgroup_choice` | Choice | `aigw_organizationgroup` | keep label |
| 计上部门 | `new_related_department` | `aigw_bookingdepartment_choice` | Choice | `aigw_bookingdepartment` | keep label |
| 销售部门 | `new_bd_group` | `aigw_salesdepartment_choice` | Choice | `aigw_salesdepartment` | keep label |
| Priority | `new_priority` | `aigw_priority_choice` | Choice | `aigw_priority` | keep label |
| 调查背景 | `new_background` | `aigw_researchbackground_choice` | Choice | `aigw_researchbackground` | keep label |
| 决裁者 | `new_decider` | `aigw_decider_choice` | Choice | `aigw_decider` | keep label |
| 客户需求 | `new_customerneed` | `aigw_customerneed_choice` | Choice | `aigw_customerneed` | summarize / normalized label |
| 提案内容 | `new_proposedsolution` | `aigw_proposalcontent_choice` | Choice | `aigw_proposalcontent` | summarize / normalized label |
| 案件列表 | `new_pipeline_list` | `aigw_opportunitylist_bool` | Yes/No | `aigw_opportunitylist` | keep yes/no |

## 8. Confirmed Replacement Options

### organizationGroupOptions

| Value | Label |
|---:|---|
| 1 | 01: BD Sales(CL) |
| 2 | 02: BD Sales(FF) |
| 3 | 03: Dalian branch |
| 4 | 04: Beijing branch |
| 5 | 05: Suzhou branch |
| 6 | 06: Chongqing branch |
| 7 | 07: EHB Sales |
| 8 | 08: LTW Sales |
| 9 | 09: LHK Sales |
| 10 | 10: AL sales |
| 11 | 11: Wuxi branch |
| 12 | 12: Qingdao branch |
| 13 | 13: Guangzhou branch |
| 14 | 14: Shenzhen branch |
| 15 | 15: Zhuhai branch |
| 16 | 16: KA(FF) |
| 17 | 17: CS(FF) |
| 91 | 91: Others |

### bookingDepartmentOptions

| Value | Label |
|---:|---|
| 1 | 01: Domestic Div. |
| 2 | 02: International Div. |
| 3 | 03: Beijing branch |
| 4 | 04: Dalian branch |
| 5 | 05: Suzhou branch |
| 6 | 06: Chongqing branch |
| 7 | 07: Shanghai Air Export |
| 8 | 08: Shanghai Air Import |
| 9 | 09: Shanghai Ocean Export |
| 10 | 10: Shanghai Ocean Import |
| 11 | 11: Wuxi branch |
| 12 | 12: Qingdao branch |
| 14 | 14: Guangzhou branch |
| 15 | 15: Zhuhai branch |
| 16 | 16: Shenzhen branch |
| 17 | 17: [FCC] |
| 18 | 18: [EHB] |
| 19 | 19: [LHK] |
| 20 | 20: [LTW] |
| 21 | 21: [VSE] |
| 22 | 22: [AL] |
| 23 | 23: LD other country |
| 24 | 24: LD Japan |
| 25 | 25: LD others |
| 26 | 26: Domestic Div East Shanghai WH |
| 91 | 91: Others |

### salesDepartmentOptions

| Value | Label |
|---:|---|
| 1 | 01: Dept1(Industry) |
| 2 | 02: Dept1(Distribution) |
| 3 | 03: Dept2(LCMS) |
| 4 | 04: Dept3(Project Cargo) |
| 5 | 05: Dept3(Dangerous Goods) |
| 6 | 06: FF |
| 91 | 91: Others |

### priorityOptions

| Value | Label |
|---:|---|
| 1 | 01: High |
| 2 | 02: Important |
| 3 | 03: Medium |
| 4 | 04: Low |

### researchBackgroundOptions

| Value | Label |
|---:|---|
| 1 | 01: 联系 |
| 2 | 02: 来自日本 LD 的关系 |
| 3 | 03: 来自其他国家 LD 的关系 |
| 4 | 04: 来自我们网站的咨询 |
| 5 | 05: 来自客户的电话 |
| 6 | 06: 定期竞争/招投标 |
| 7 | 07: 我方的接洽 |
| 8 | 08: Routing Order |
| 9 | 09: 销售线索 |
| 10 | 10: 来自合作公司的关系 |
| 11 | 11: 来自日立集团的关系 |
| 12 | 12: 来自Alps的关系 |
| 13 | 13: 过去案件的再访 |
| 91 | 91: 其他 |

### decisionMakerOptions

| Value | Label |
|---:|---|
| 1 | 01：海外客户 |
| 2 | 02：中国客户 |
| 91 | 91：其他 |
