# D365 AI Demo 场景故事矩阵

## 分布

| 场景 | 数量 | 稳定默认记录 | CRM 事实设计 | Gateway 派生 | 禁止结论 |
| --- | ---: | --- | --- | --- | --- |
| stalled-high-value | 15 | DEMO-OPP-001 | 高金额带、Active、长时间无推进、下一步过期 | 停滞带、行动逾期、优先核验 | 不声称必然丢单，不输出精确金额 |
| budget-actual-gap | 15 | DEMO-OPP-016 | 预算与已过月份实绩存在显著差异 | variance category、run-rate band | 不把未结束月份当已失败 |
| data-contradiction | 12 | DEMO-OPP-031 | 高受注确度但决裁者/承诺/下一步缺失或冲突 | contradiction codes、completeness band | 不补写缺失事实，不断言客户已承诺 |
| growth-opportunity | 12 | DEMO-OPP-043 | 历史覆盖、当前服务和空白服务组合 | whitespace category、coverage trend | 只能提出增长假设，不断言客户会购买 |
| location-route-risk | 10 | DEMO-OPP-055 | 运输模式与 Location/POL/POD 组合需要复核 | route consistency、verification need | 不声明现实延误、制裁、海关或事故 |
| meeting-prep | 10 | DEMO-OPP-065 | 即将会面、角色覆盖、未决问题、决策准备度 | meeting window、stakeholder coverage、question count | 不读取或复述 Timeline 原文 |
| multi-risk-priority | 16 | DEMO-OPP-075 | 停滞、差异、数据缺口和互动信号并存 | 风险排序和最小行动集 | 不将推断伪装为 CRM 事实 |
| healthy-control | 10 | DEMO-OPP-091 | 阶段、下一步、预算/实绩和互动一致 | healthy indicators、monitor | 不生成 High/Critical 或虚假告警 |

核心场景合计 100 条。其余 50 条为 normal-business 10、mild-risk 8、renewal 8、upsell 7、new-customer 7、won-implementation 4、lost-review 3、historical-service 3。

## 场景共同结构

每条场景故事必须包含：

1. CRM Fact：实际存入 CRM 的业务事实。
2. Timeline Story：按时间连续的 synthetic 活动。
3. Interaction Signal：由部分 Timeline 脱敏映射的结构化信号。
4. Gateway Derived Signal：风险、趋势、覆盖度、矛盾和优先级。
5. Evidence：只能引用 Safe Context 字段或聚合指标。
6. Recommended Action：明确为建议，不写回 CRM。

Scenario ID、期望答案、禁止结论和优先级标签只进入离线验证 manifest。CRM 记录中不得创建 `AI High Risk`、`Expected Finding` 或同类答案型字段。

## 内容质量规则

- 同一场景内应有不同阶段、服务类型和行动，不得模板化成完全相同故事。
- healthy-control 的事实必须一致，且不使用缺失字段人为制造风险。
- growth-opportunity 必须基于 Account 级 Coverage 历史聚合。
- meeting-prep 只使用会议窗口、利益相关者覆盖、未决问题数和决策准备度等安全派生信号。
- location-route-risk 只建议核验路线适配，不接入外部实时事件。
- 金额只在 synthetic CRM 事实层保留，Scenario 评价只使用区间和差异类别。
