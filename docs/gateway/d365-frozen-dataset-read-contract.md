# D365 Frozen Dataset Read Contract

## Endpoint Contract

正式 Gateway 只调用以下 GET API：

| Endpoint | Scope |
| --- | --- |
| `GET /api/d365-frozen/runtime-status` | 冻结计数、状态分布、七部门统计、安全状态 |
| `GET /api/d365-frozen/portfolio` | 指定部门范围的 200 条或部门子集 Decision View |
| `GET /api/d365-frozen/opportunities/:token` | 指定冻结 Opportunity 的 Safe Context 和 Opportunity 360 |
| `GET /api/d365-frozen/safe-context/:token` | 指定记录 Safe Context |
| `GET /api/d365-frozen/decision-pack/:token` | 指定记录六页 Decision Pack |

所有 Token 必须来自服务端 `local-artifacts/d365/d365-ai-demo-200-d6-full-import-private.json` 的冻结记录集合。客户端不能提交任意 CRM 查询、GUID、FetchXML 或实体名。

## Frozen Counts

| Entity | Count |
| --- | ---: |
| Account | 60 |
| Contact | 120 |
| Opportunity | 200 |
| ActualManagement | 130 |
| ServiceCoverage | 240 |
| Timeline | 1800 |
| InteractionSignal | 1350 |
| OpportunityClose | 100 |
| Target BPF | 200 |

## Required Readback Assertions

- Stable Token 唯一，Manifest provenance 为 `R2G-A-GEN-001`。
- Account、Contact、Opportunity、Coverage、Actual、Timeline、Signal 数量精确匹配冻结目标。
- Contact、Coverage、Actual、Signal、Timeline、OpportunityClose 的父关系完整。
- 每条 Opportunity 恰有一个目标 BPF；Duplicate=0；Unexpected Process=0；初始阶段为 `授予资格`。
- Opportunity 状态为 Won/Active/Lost = 91/100/9。
- Reader 加载失败会清空缓存 Promise，下一次明确重试仍为 GET，不会混入旧或本地数据。

## Safe Context Allowlist

允许字段包括：`opportunityToken`、`accountToken`、部门类别、状态类别、BPF 阶段、优先级、金额区间、预算/实绩偏差区间、覆盖类别、路线一致性、相对日期、数据质量代码、会议派生信号、Account 级安全聚合和证据来源。

禁止字段包括：客户显示名称、联系人身份、Dataverse GUID、精确金额、原始 Timeline/Annotation/OpportunityClose 正文、Location/POL/POD 原值、User/Team 身份、凭据、Scenario ID、Golden metadata 和 AI 答案。

## Method Boundary

Reader 源码只使用 `client.dataverseGet`。本阶段不提供 D365 写方法、不提供状态动作、不提供 BPF 写入、不提供 Cleanup，也不扩展 Gateway allowlist。
