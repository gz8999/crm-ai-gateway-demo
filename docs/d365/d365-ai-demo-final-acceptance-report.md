# Phase 1C-5R2G-D6-R5 D365 Demo Dataset Full Acceptance & Freeze

## 结论

基于 D6-R4C 已完成的精确回读 Manifest，本阶段完成只读验收与基线冻结。R5 未发起新的 Dataverse 请求，也未修改 Dataverse、Gateway 或安全配置。

- **D365 Demo Dataset Full Acceptance Complete=true**
- **D365 Demo Dataset Frozen=true**
- **Gateway Full Dataset Integration Ready=false**
- 下一阶段：CRM AI Gateway Real Dataset Integration（尚未开始）

## 证据来源

- 当前提交基线：190185b。
- 私有精确回读：仅作为本地验证输入，不进入公开产物。
- R4C 状态动作最终回读：91/100/9，OpportunityClose 91/9/100。
- R3B Timeline/Signal 最终回读：1800/1350；Annotation Reference Date=2026-07-18。

## 数据集冻结基线

| Entity | Count | Result |
| --- | ---: | --- |
| Account | 60 | 通过 |
| Contact | 120 | 通过 |
| Opportunity | 200 | 通过 |
| ServiceCoverage | 240 | 通过 |
| ActualManagement | 130 | 通过 |
| Timeline | 1800 | 通过 |
| InteractionSignal | 1350 | 通过 |

显式业务记录总数为 **3900**。Account、Contact、Opportunity、Coverage 的父子关系和 Actual 一商机一条契约通过；Stable Token 无重复。

## 状态、活动和 BPF

- Opportunity：Won/Active/Lost = **91/100/9**。
- OpportunityClose：Win/Lose/Total = **91/9/100**；重复 0；附件 0。
- BPF：目标实例 200；初始阶段“授予资格”200/200；重复 0；异常流程 0；Process Order=0。
- Plugin：7 enabled / 0 disabled。
- Actual：月度收入合计与年度实绩收入一致；月度 GP 字段完整；状态动作没有创建 Actual。
- Timeline 仅使用 phonecall、appointment、task、annotation；Signal 来源可追溯，Missing Source=0。

## Annotation 日期契约

- 业务日期早于 Reference Date：HistoricalOverride。
- 等于 Reference Date：SameDayBodyDate，正文保留“业务节点日期”标记，不发送系统日期字段。
- 晚于 Reference Date：FutureBodyPlannedDate，正文保留“计划节点日期”标记，不发送系统日期字段。
- TL-0653 的 SameDayBodyDate 历史证据保留，未重新分类。

## Safe Context 最终规则

- 部门过滤先于 Safe Context。
- 身份只保留安全 token/类别，customerIdentityMasked=true。
- 金额只使用 range/band，exactAmountSentToModel=false。
- Timeline 只允许脱敏摘要和相对日期，rawTimelineSent=false。
- 不包含 GUID、联系人身份、精确金额、原始正文、OpportunityClose 正文、凭据、Scenario ID、Golden 答案。
- CRM 写回关闭，外部 LLM 默认关闭。

## 安全与请求

R5 新请求数为 0；本报告未发起任何 Dataverse POST/PATCH/DELETE/Publish。既有 R4C/R3B 请求证据保留在历史 Manifest 中。

- R5 Dataverse requests: **0**
- R5 production requests: **0**
- R5 external LLM calls: **0**
- R5 CRM writeback: **0**

## Cleanup

只生成未来清理 Manifest，不执行清理：Cleanup Authorized=false，Cleanup Executed=false。清理顺序为 InteractionSignal → Timeline → ActualManagement → ServiceCoverage → Opportunity → Contact → Account；BPF、Team、Role、Currency、Location、POL/POD、Choice、Schema、Solution 永不纳入本合同。

## 门禁

- P0=**0**；P1=**0**；P2=**0**。
- Production Isolation Ready=true
- External LLM Disabled=true
- CRM Writeback Disabled=true
- Safe Context Contract Ready=true
- Full Exact Readback Ready=true
- Dataset Frozen=true

- readOnlyEvidenceComplete=true
- accountReady=true
- contactReady=true
- opportunityReady=true
- coverageReady=true
- actualReady=true
- timelineReady=true
- signalReady=true
- opportunityCloseReady=true
- bpfReady=true
- pluginReady=true
- relationshipsReady=true
- choiceAndLogicalNameReady=true
- safeContextContractReady=true
- businessIntegrityReady=true
- cleanupManifestReady=true
- productionIsolationReady=true
- fullAcceptanceComplete=true
- datasetFrozen=true
- gatewayFullDatasetIntegrationReady=false
