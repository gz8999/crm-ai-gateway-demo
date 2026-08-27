# D365 AI Demo Timeline 内容规范 R2

## 1. 目的与边界

本文件定义后续中文 Demo Timeline 的故事模板和结构化映射。本阶段不创建电话、会议、任务、Note、Email、Interaction Signal 或任何业务记录。

所有内容必须是合成内容；不要使用真实客户、联系人、地址、报价、生产 GUID、真实邮件正文或真实会议纪要。原生 Timeline 负责人工阅读，`aigw_interactionsignal` 只保存 Sanitization 后的结构化事实。

固定流程：

`Raw Timeline → Sanitization → Structured Signals → Safe Timeline Summary → Gateway / External LLM`

## 2. 每条原生 Timeline 的最小内容

### 原生 Timeline 字段

- 中文主题；
- 中文正文；
- 日期；
- 活动类型：电话、会议、任务、Note、邮件沟通摘要、现场拜访、内部会议；
- Regarding：合成 Account/Opportunity Token；
- Owner / Activity Party：仅在 CRM 内部可见，模型输入不携带身份；
- 状态、结果和下一步；
- 预算、决策人、异议、竞争、承诺、响应、情绪、服务问题和解决状态。

### Interaction Signal 字段

原生活动经 Sanitization 后映射到：`aigw_interactiontoken`、`aigw_sourceactivitytoken`、`aigw_activitydate`、`aigw_activitytype`、`aigw_direction`、`aigw_resultcategory`、`aigw_nextstep`、预算/决策人/异议/竞争/承诺布尔信号、响应、情绪、服务问题、`aigw_sanitizedsummary`、部门和 Demo Token。

禁止把以下内容写入 Signal 或 Provider：客户姓名、联系人姓名、邮箱、电话、地址、真实 Activity GUID、原始 Email/Note/会议纪要、精确报价、精确金额、AI 判断结论。

## 3. 业务故事模板

每个 Opportunity 可选择 8–12 条 Timeline；模板可以组合，但不得机械地让所有案件走同一条链。括号内为推荐的 Activity Type 与 Signal 映射。

| # | 故事模板 | 推荐活动链 | 必须表达的事实 | Gateway 可派生 |
|---:|---|---|---|---|
| 1 | 需求确认 | 电话 → 会议 → 任务 | 客户问题、服务范围、下一步 | 需求清晰度、未决问题 |
| 2 | 现场调研 | 现场拜访 → Note → 内部会议 | 调研完成、作业约束、内部确认 | 调研完整度、数据缺口 |
| 3 | 方案设计 | 内部会议 → 会议 → 任务 | 方案方向、客户确认点 | 方案成熟度、决策准备度 |
| 4 | 报价 | 任务 → 邮件沟通摘要 → 电话 | 报价已发送、客户响应状态 | 报价后响应趋势 |
| 5 | 价格异议 | 电话 → 会议 → 任务 | 异议=价格、是否形成下一步 | 异议风险、承诺逾期 |
| 6 | 竞争对手介入 | 客户会议 → 内部会议 → 电话 | 竞争存在性，不保存名称 | 竞争信号强度 |
| 7 | 预算审批 | 会议 → 任务 → 电话 | 预算是否提及、审批状态 | 预算准备度 |
| 8 | 决策人会议 | 会议 → Note → 任务 | 决策人参与，不保存身份 | Stakeholder coverage |
| 9 | 客户承诺 | 电话 → 任务 | 客户承诺、承诺日期、完成情况 | 承诺逾期与可信度 |
| 10 | 内部承诺 | 内部会议 → 任务 | 内部责任类别、完成情况 | 内部阻塞信号 |
| 11 | 跟进停滞 | 任务 → 电话 → 任务 | 多次低频或无回复、下一步缺失 | 停滞、逾期、响应趋势 |
| 12 | 服务投诉 | 电话 → 会议 → 任务 | 服务问题类别、是否解决 | 未解决问题数、服务风险 |
| 13 | 整改恢复 | 内部会议 → 电话 → 任务 | 整改方案、客户响应恢复 | 恢复趋势 |
| 14 | 试运行 | 现场拜访 → 任务 → 会议 | 试运行结果、验收条件 | 决策准备度 |
| 15 | 赢单 | 会议 → 任务 → Note | 完成事实、后续交接 | 不再生成 Active 逾期风险 |
| 16 | 失单 | 电话 → 会议 → Note | 拒绝/失单事实、原因类别 | 复盘类别，不推断客户动机 |
| 17 | 续约 | 电话 → 会议 → 任务 | 当前服务、续约窗口、满意度 | 续约准备度 |
| 18 | 增购 | 会议 → 任务 → 电话 | 新服务方向、覆盖缺口、机会窗口 | Whitespace hypothesis |
| 19 | 沉睡客户重新激活 | 电话 → 邮件沟通摘要 → 任务 | 响应变化、重新联系下一步 | Reactivation signal |

## 4. 结构化字段规则

| 事实 | CRM / Signal 表达 | 允许的模型输入 |
|---|---|---|
| 是否涉及预算 | `aigw_budgetmentioned` | Boolean |
| 是否涉及决策人 | `aigw_decisionmakerinvolved` | Boolean，不含身份 |
| 是否存在异议 | `aigw_objectionpresent` + `aigw_objectioncategory` | Category |
| 是否提及竞争 | `aigw_competitormentioned` | Presence only |
| 是否形成承诺 | `aigw_commitmentmade` + due/completed | Count/band/state |
| 客户响应 | `aigw_customerresponselevel` | Category/trend |
| 情绪 | `aigw_sentiment` | Bounded category/trend |
| 服务问题 | `aigw_serviceissuecategory` + `aigw_issueresolved` | Category/count |
| 文字摘要 | `aigw_sanitizedsummary` | 通过脱敏扫描后的短摘要；无法证明则排除 |
| 日期 | `aigw_activitydate` | 相对窗口，不传精确日期 |

## 5. 完整中文示例

以下示例全部使用合成 Token，金额只使用区间，不使用原值。

### 示例 1：高价值停滞

| 字段 | 内容 |
|---|---|
| Opportunity Token | `DEMO-OPP-001` |
| 主题 | `方案确认后的跟进安排` |
| 活动类型 | 任务 |
| 结果 | 待客户回复 |
| 下一步 | `确认方案评审时间` |
| 预算 | 是 |
| 决策人 | 未确认 |
| 异议 | 无 |
| 竞争 | 未提及 |
| 承诺 | 否 |
| 客户响应 | 低频 |
| 情绪 | 中性 |
| 脱敏摘要 | `方案已发送，客户尚未确认下一次评审窗口。` |
| Signal | `aigw_resultcategory=待客户回复`、`aigw_customerresponselevel=低频`、`aigw_commitmentmade=false` |

### 示例 2：预算与实绩偏差

| 字段 | 内容 |
|---|---|
| Opportunity Token | `DEMO-OPP-016` |
| 主题 | `预算执行差异确认` |
| 活动类型 | 会议 |
| 结果 | 部分确认 |
| 下一步 | `补充实际作业量区间` |
| 预算 | 是 |
| 决策人 | 是 |
| 异议 | 服务能力 |
| 竞争 | 未提及 |
| 承诺 | 是，待完成 |
| 客户响应 | 正常 |
| 情绪 | 偏负面 |
| 脱敏摘要 | `预算节奏与当前执行区间存在差异，双方约定补充作业量信息。` |
| Signal | `aigw_budgetmentioned=true`、`aigw_objectioncategory=服务能力`、`aigw_commitmentcompleted=false` |

### 示例 3：数据矛盾

| 字段 | 内容 |
|---|---|
| Opportunity Token | `DEMO-OPP-031` |
| 主题 | `案件状态与下一步核对` |
| 活动类型 | 内部会议 |
| 结果 | 待内部处理 |
| 下一步 | `核对案件阶段与关闭日期` |
| 预算 | 未提及 |
| 决策人 | 否 |
| 异议 | 无 |
| 竞争 | 未提及 |
| 承诺 | 是，待完成 |
| 客户响应 | 未确认 |
| 情绪 | 未判断 |
| 脱敏摘要 | `状态字段与业务记录的时间顺序需要人工复核，未对客户事实做推断。` |
| Signal | `aigw_resultcategory=待内部处理`、`aigw_commitmentmade=true`、`aigw_commitmentcompleted=false` |

### 示例 4：增长机会

| 字段 | 内容 |
|---|---|
| Account Token | `DEMO-ACCOUNT-04` |
| 主题 | `服务覆盖扩展讨论` |
| 活动类型 | 会议 |
| 结果 | 已确认 |
| 下一步 | `评估未覆盖服务类别` |
| 预算 | 是 |
| 决策人 | 是 |
| 异议 | 无 |
| 竞争 | 未提及 |
| 承诺 | 是，已完成 |
| 客户响应 | 积极 |
| 情绪 | 正面 |
| 脱敏摘要 | `现有服务运行稳定，客户确认评估另一类未覆盖服务。` |
| Signal | `aigw_resultcategory=已确认`、`aigw_customerresponselevel=积极`、`aigw_commitmentcompleted=true` |

### 示例 5：路线核验风险

| 字段 | 内容 |
|---|---|
| Opportunity Token | `DEMO-OPP-055` |
| 主题 | `运输方案路线核验` |
| 活动类型 | 现场拜访 |
| 结果 | 待内部处理 |
| 下一步 | `完成路线与作业约束核验` |
| 预算 | 未提及 |
| 决策人 | 否 |
| 异议 | 时效 |
| 竞争 | 未提及 |
| 承诺 | 否 |
| 客户响应 | 正常 |
| 情绪 | 偏负面 |
| 脱敏摘要 | `路线一致性尚未确认，需由运营人员核验作业约束。` |
| Signal | `aigw_objectioncategory=时效`、`aigw_resultcategory=待内部处理` |

### 示例 6：会前准备

| 字段 | 内容 |
|---|---|
| Opportunity Token | `DEMO-OPP-065` |
| 主题 | `会前问题清单确认` |
| 活动类型 | 任务 |
| 结果 | 已确认 |
| 下一步 | `准备服务范围和实施周期问题` |
| 预算 | 是 |
| 决策人 | 是 |
| 异议 | 实施周期 |
| 竞争 | 未提及 |
| 承诺 | 否 |
| 客户响应 | 正常 |
| 情绪 | 中性 |
| 脱敏摘要 | `已确认会议窗口和需确认的问题，未读取 Timeline 原文。` |
| Signal | `aigw_decisionmakerinvolved=true`、`aigw_objectioncategory=实施周期` |

### 示例 7：多风险优先级

| 字段 | 内容 |
|---|---|
| Opportunity Token | `DEMO-OPP-075` |
| 主题 | `多项未决事项排序` |
| 活动类型 | 内部会议 |
| 结果 | 待内部处理 |
| 下一步 | `按预算、路线和决策人三个缺口排序` |
| 预算 | 是 |
| 决策人 | 未确认 |
| 异议 | 价格 |
| 竞争 | 已提及，但不保存名称 |
| 承诺 | 是，逾期 |
| 客户响应 | 低频 |
| 情绪 | 偏负面 |
| 脱敏摘要 | `多个结构化信号同时存在，先核对证据，再安排人工行动。` |
| Signal | `aigw_objectioncategory=价格`、`aigw_competitormentioned=true`、`aigw_commitmentcompleted=false` |

### 示例 8：健康对照

| 字段 | 内容 |
|---|---|
| Opportunity Token | `DEMO-OPP-091` |
| 主题 | `健康案件例行确认` |
| 活动类型 | 会议 |
| 结果 | 完成 |
| 下一步 | `按既定窗口继续跟进` |
| 预算 | 是 |
| 决策人 | 是 |
| 异议 | 无 |
| 竞争 | 未提及 |
| 承诺 | 是，已完成 |
| 客户响应 | 积极 |
| 情绪 | 正面 |
| 脱敏摘要 | `预算、响应和承诺状态一致，没有未解决的异常信号。` |
| Signal | `aigw_resultcategory=完成`、`aigw_customerresponselevel=积极`、`aigw_commitmentcompleted=true` |

## 6. 全量生成规则

### 100 条 Opportunity

- 目标范围：800–1,200 条原生 Timeline；
- 每条 Opportunity 8–12 条，至少包含 3 种 Activity Type；
- 15–20% 包含价格/服务异议；
- 10–15% 包含竞争存在信号；
- 10% 健康对照，不产生 High/Critical 风险；
- 互动日期按相对窗口分布：近期、正常跟进、逾期、长期停滞；
- 每个 Account 可关联多条 Opportunity，但 Signal 只能暴露 Account token 和聚合趋势。

### 150 条 Opportunity

- 目标范围：1,200–1,600 条原生 Timeline；
- 保持同样的场景分布比例，但使用不同活动链长度和组合；
- 续约、增购、服务投诉和整改恢复必须各有独立样本；
- 健康对照至少 10 条，禁止为了平衡数量制造风险。

### 数据质量与清理

- 每条 Signal 的 `aigw_interactiontoken` 全局唯一；
- 每条记录带 `aigw_demotoken`，仅用于测试清理；
- 清理顺序：Signal → Coverage → Actual → Opportunity → Contact/Account（按关系反向处理）；
- 不删除原生 Timeline 以“模拟清理”，Demo 结束时按清单逐条删除合成记录；
- 生成失败即停止，不批量回滚未知业务数据。

## 7. Timeline Runtime Gate

进入数据生成前必须证明：

- 原生 Timeline 可正常查看；
- Sanitization 能拦截身份、精确金额、原文和 GUID；
- Interaction Signal 与原生 Timeline 的链路可追溯但不共享原 GUID；
- Safe Context 中只出现类别、区间、趋势和相对时间；
- `rawDataSent=false`、`exactAmountSentToModel=false`、`externalModelCalled=false`；
- 任何 AI 结论不回写 CRM；
- 100–150 条数据生成器不会进入生产环境。
