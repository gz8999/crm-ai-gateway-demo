# D6-R4B Full Lose Canary Decision Pack

R4B-R1 已修正 Actual 门禁：Actual Count 必须匹配冻结 Projection Expected Actual Count。

- 自动选择并完成：`DEMO-OPP-012`。
- Frozen Expected Actual Count=0；Actual Count=0，状态动作未创建 Actual。
- Opportunity 状态：8/191/1 -> 8/190/2。
- OpportunityClose：9 -> 10；Lose OpportunityClose 的 actualrevenue 为空，符合契约。
- BPF 保持 200 条、初始阶段“授予资格”、重复 0、异常流程 0。
- 其余 Win=83、Lose=7；Cleanup、Full Import 关闭和 Gateway 全量接入仍未授权。
