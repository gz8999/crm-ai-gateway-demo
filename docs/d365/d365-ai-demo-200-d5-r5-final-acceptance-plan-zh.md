# Phase 1C-5R2G-D5-R5 Compact Pilot 最终验收计划

## 当前冻结基线

- Explicit Pilot Records: 427
- Account / Contact / Opportunity: 7 / 9 / 24
- ServiceCoverage / ActualManagement: 15 / 12
- Imported Timeline / InteractionSignal: 206 / 154
- Won / Active / Lost: 7 / 16 / 1
- Win / Lose OpportunityClose: 7 / 1
- Target BPF / Duplicate / Unexpected: 24 / 0 / 0
- BPF Stage `授予资格`: 24/24
- Plugin: 7 Enabled / 0 Disabled
- Cleanup Authorized / Executed: false / false
- Full Import Started / Ready: false / false

## R5 建议范围

R5 仅做最终只读验收，不自动授权 Cleanup 或 Full Import：

1. 使用公开 Token 与 ignored 私有 Exact ID Manifest 交叉回读 427 条记录。
2. 核验 24 条 Opportunity 的状态分布、8 条唯一 OpportunityClose 和附件数 0。
3. 核验 24 条目标 BPF 均唯一、Process 正确、Stage/Path 未推进。
4. 核验 Timeline 206、Signal 154、Actual 12、Coverage 15 及业务 Hash。
5. 核验普通测试用户在 Modern App 中只读打开 Pilot 样本；不得推进 BPF、创建 Timeline 或修改业务字段。
6. 核验 Cleanup Manifest 的依赖反序和 Exact ID 覆盖，但不执行 Cleanup。
7. 单独形成 Full Import 决策；R5 通过不等于 Full Import 获得授权。

## 停止条件

- 任一 Pilot Token 缺失或重复。
- OpportunityClose 数量不是 8，或存在附件。
- BPF Instance 缺失、重复、Stage/Path 漂移或出现其他 Process。
- 非状态动作业务 Hash 变化。
- Plugin 不为 7/0。
- 出现生产请求、业务写入或未授权 Cleanup。

## 预期门禁

- Compact Pilot Final Acceptance Ready=true/false
- Pilot Exact Readback Ready=true/false
- Ordinary User Runtime Ready=true/false
- Cleanup Manifest Validation Ready=true/false
- Cleanup Authorized=false
- Cleanup Executed=false
- Full Import Authorized=false
- Full Import Started=false

本计划不包含任何 Dataverse 写入。执行 R5 或 Full Import 前必须获得独立授权。
