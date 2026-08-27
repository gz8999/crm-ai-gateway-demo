# Goal 4A 模块验收

## 正式模块

| 模块 | 验收重点 | 状态 |
| --- | --- | --- |
| AI Cockpit | 200 条 Portfolio、风险、行动、场景摘要和数据来源 | 确定性 Ready |
| Risk & Priority | 稳定排序、风险原因、状态、Grade、Evidence 和选中详情 | 确定性 Ready |
| Opportunity 360 | Fact / Inference / Evidence / Confidence / Action 分层 | 确定性 Ready |
| Action Board | 只读 Draft Only，不生成无依据负责人或期限 | 确定性 Ready |
| Meeting Copilot | 会议目标、提问、必须确认和安全 Timeline 摘要 | 确定性 Ready |
| Portfolio Intelligence | 明确 Mode、Scenario、范围数量、Scope 类型和完整性 | 确定性 Ready |
| Audit & Safety | Provider、Safe Context 数量、脱敏状态和写回边界 | 确定性 Ready |
| Deep Analysis | 受 feature flag 控制，运行前确认，不自动调用 | 验收就绪，默认关闭 |

## 统一门禁

- 默认数据源：D365 Frozen Dataset。
- 默认金额：脱敏区间；精确金额不进入 Safe Context、Provider、日志或 URL。
- 外部 Provider 不从浏览器调用。
- 失败时保留当前页面状态，不自动切换 Fixture。
- 页面展示中文业务标签，技术信息进入统一详情区域。

## 外部层状态

当前可展示 5 条已验证叙事快照，但不能宣称八场景全量验证完成。缺失快照的商机显示“当前商机未验证”，确定性 Decision Pack 继续正常工作。
