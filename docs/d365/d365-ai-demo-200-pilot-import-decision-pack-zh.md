# D4 Compact Pilot Import Decision Pack

## 当前决策

默认选择 **C2：不批准，保持 Business Data Writes=0**。

## C1：批准 Compact Pilot

若后续明确批准，范围严格固定为：

- Account 7
- Contact 9
- Opportunity 24
- ActualManagement 12
- ServiceCoverage 15
- Timeline 206
- InteractionSignal 154

C1 不等于批准 Full 200 Import，不等于批准生产环境，不等于批准 Cleanup、Schema/Choice 修改、外部 LLM 或现有业务数据修改。

## C2：保持零写入

继续保留工作簿、Token、导入顺序和清理契约，但不发送任何业务数据请求。当前 D4 处于 C2 状态。

## Pilot 门禁

必须在单独授权后重新确认：测试环境、权限、Reference Master、Choice、父子关系、幂等策略和清理清单。任何门禁失败都停止，不执行部分导入。

## D5 C1 Compact Pilot execution

- Authorized: true
- Completed: false
- Exact Readback: false
- State Distribution: false
- Cleanup Authorized: false
- Full Import Authorized: false
- P0/P1/P2: 0/1/0
- Partial Created: Account 1 / Contact 1 / Opportunity 1
- Unexpected target BPF instance: 1
- Stop point: before Coverage / Actual / Timeline / Signal / Win / Lose
