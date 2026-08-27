# Phase 1C-5R2G-D4 Readiness Report

## 结论

D4 已完成离线 Formal Import Projection 与 Compact Pilot 工作簿生成、重导入、ZIP 完整性、公式错误、关键表视觉检查和 Token/安全边界校验。没有导入业务数据，也没有执行 Win/Lose、Cleanup 或任何 Dataverse 业务记录操作。

- Import Projection Ready: **true**
- Pilot Workbook Ready: **true**
- Pilot Import Authorized: **false**
- Full Import Ready: **false**
- Business Data Generation Started: **false**

## 输入与基线

- 基线 Commit: 3fd49f17ec26e9f355d1d35ce89f58a549e6312a
- 权威 v1.1 工作簿: 952684 bytes, SHA-256 e19e41b95c4392858e2702c0b4a239fb545697947bd556832d17734304ad28dd
- Projection Candidate: 566684 bytes, SHA-256 7a3a1d5b0cc3b0a4137f9eeaf33cacd707ef07f965bf8c8478aa235cfb1a5f11
- 生成方式: 保留冻结业务值，仅做正式技术投影、工作表规范化和 Pilot Token 过滤。

## 生成结果

Formal Projection: [CRM_AI_Gateway_D365_Demo_200_ImportProjection_v1.xlsx](../../artifacts/d365/CRM_AI_Gateway_D365_Demo_200_ImportProjection_v1.xlsx)

- 570890 bytes
- SHA-256: af40bede1df13eb40ef5718f657d21ba570d1cc29feed5a9848616ddf5fbedea
- 15 sheets, no ScenarioManifest, SafeContextSamples or 所有案件_Demo
- Full dry-run rows: Account 60 / Contact 120 / Opportunity 200 / ServiceCoverage 240 / ActualManagement 130 / Timeline 1800 / InteractionSignal 1350

Compact Pilot: [CRM_AI_Gateway_D365_Demo_200_CompactPilot_v1.xlsx](../../artifacts/d365/CRM_AI_Gateway_D365_Demo_200_CompactPilot_v1.xlsx)

- 90392 bytes
- SHA-256: 789e0c620199481c4de4532d14479b075a14d32eb375b20971723b3284fc1e36
- 10 sheets
- Exact rows: Account 7 / Contact 9 / Opportunity 24 / ActualManagement 12 / ServiceCoverage 15 / Timeline 206 / InteractionSignal 154

## D3B-R2 安全接管回读

- Owner Token Mapping: 6/6
- Department Team Mapping: 7/7
- Distinct Owner Teams: 7
- Canonical role assignments: 7
- Memberships: 7
- Deleted-role residual references: 0
- Canonical role count: 1; duplicate role count: 0
- Unique privileges: 38; approved Global exceptions: 11
- Delete / Customization / Publish privileges: 0 / 0 / 0

本阶段安全回读只读取 Metadata、Reference Master 和 User/Team/Role 结构：Metadata GET 6、Reference GET 3、Security GET 11，共 GET 20；Business CRM GET 0。

## Dry Run 验证

- Account/Contact/Opportunity 父子关系: PASS
- Actual 每个 Opportunity 最多一条: PASS
- Timeline 父 Opportunity、日期故事与活动类型: PASS
- Interaction Signal 来源 Timeline 完整性: PASS
- Owner/Department Alias 可解析: PASS
- Currency/Location/POL-POD 只读参考解析: PASS
- Unknown Choice: 0
- Unknown Logical Name: 0
- POL/POD Blocked: 0
- Primary Name duplicates: 0
- Required blank values: 0
- XLSX ZIP integrity: PASS
- XLSX re-import: PASS
- Formula errors: 0
- 25 个工作表完成首屏视觉渲染检查。

## State / Action Plan

- Active: 100，创建后保持 Open，不执行动作。
- Won: 91，先以 Active 创建，后续仅允许官方 WinOpportunity Action；本阶段 0 次。
- Lost: 9，先以 Active 创建，后续仅允许官方 LoseOpportunity Action；本阶段 0 次。
- 不直接 PATCH statecode/statuscode/actualclosedate。

## Pilot 决策

- C1: 批准 Compact Pilot 业务数据导入，范围固定为 7/9/24/12/15/206/154。
- C2: 不批准，保持 Business Data Writes=0。
- 默认: **C1 Approved=false**，因此本阶段不具备 Pilot Import 授权。

## 清理边界

Cleanup Authorized=false、Cleanup Ready=false。预定反向顺序为 InteractionSignal → Timeline → ActualManagement → ServiceCoverage → Opportunity → Contact → Account。Currency、Location、POL/POD、Owner/User、七个 Demo Team、Canonical Role、Choice、Schema、BPF、Solution 均不进入清理。

## 问题分级

- P0: 0
- P1: 0
- P2: 2：Pilot C1/C2 决策待人工确认；Win/Lose 动作仍为计划项。

## 请求统计

| 类型 | 数量 |
|---|---:|
| Metadata GET | 6 |
| Reference GET | 3 |
| User/Team/Role GET | 11 |
| Business CRM GET | 0 |
| POST / PATCH / DELETE / Publish | 0 / 0 / 0 / 0 |
| WinOpportunity / LoseOpportunity | 0 / 0 |
| Team/Role/Membership changes | 0 |
| Production Requests | 0 |
| External LLM Calls | 0 |
| Push | 0 |

## Gate Matrix

| Gate | Result |
|---|---|
| Workbook Generated | true |
| Workbook Sheets Ready | true |
| Dataset Count Ready | true |
| Formal Projection Ready | true |
| Compact Pilot Ready | true |
| Token Mapping Ready | true |
| State Action Plan Ready | true |
| Cleanup Contract Ready | true |
| P0 Gate Passed | true |
| P1 Gate Passed | true |
| Dataverse Requests | 0 |
| Pilot Import Ready | false |
| Pilot Import Authorized | false |
| Full Import Ready | false |

下一步只能在单独批准 C1 后再进行 Pilot Import 设计与门禁；本报告不授权执行导入。
