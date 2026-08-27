# Sales Process - AI Demo Full Replica: Designer Build Sheet

## Scope

Create manually in Power Apps Process Designer:

`Sales Trial -> Solutions -> CRM AI Gateway Demo -> New -> Automation -> Process -> Business process flow`

Save as a draft only. Do not activate, set process order, configure security roles, add to an App, or create/switch process instances.

## Definition

- Display name: `销售流程 - AI Demo Full Replica`
- Suggested unique name: `aigw_salesprocess_aidemofullreplica`
- Primary table: `opportunity`
- Solution: `CRMAIGatewayDemo`

## Stage 1: 授予资格

| Order | Logical name | Display label | Required |
|---:|---|---|---|
| 1 | `parentaccountid` | 客户 | Yes |
| 2 | `aigw_organizationgroup_choice` | 组织团体 | Yes |
| 3 | `aigw_salesdepartment_choice` | 销售部门 | Yes |
| 4 | `aigw_opportunitytype` | 案件类型 | Yes |
| 5 | `aigw_opportunitydetailtype` | 案件详细信息 | No |

## Stage 2: 案件关闭

| Order | Logical name | Display label | Required |
|---:|---|---|---|
| 1 | `aigw_winprobabilityrank` | 受注确度 | No |
| 2 | `statuscode` | 状态描述 | No |
| 3 | `aigw_wonreason_choice` | 受注理由 | No |
| 4 | `aigw_lostreason_choice` | 失注理由 | No |
| 5 | `actualclosedate` | 受注日期 | No |

## Post-save verification (M3-C)

Verify only: workflow ID, processstage IDs and order, each data step, required flags, solution membership, draft/inactive state, and no impact to the managed `Sales Process`.

## Deferred

- Conditional required rule: won -> `aigw_wonreason_choice`; lost -> `aigw_lostreason_choice`.
- Activation, security roles, process order, App integration, and all BPF instance decisions.
- Do not use deprecated `SetProcess`.
