# D365 AI Demo Schema MVP Choice 方案 R2

## 1. 方案边界

本文件只定义中文业务标签和语义，不创建 Choice，也不填写 Dataverse Option Value。所有写入必须在后续实施阶段通过 Metadata 完成。

已有目录中存在大量 Entity Local Choice，但没有证据证明它们与本 MVP 的业务语义、生命周期和标签完全一致。因此：

1. 先查找完全匹配的 Global Choice。
2. 只有在以下条件全部满足时才复用：标签语义完全相同、Active、Scope 可用、当前方案不引入旧业务别名、字段类型兼容。
3. 找不到完全匹配时采用新的 Local Choice。
4. 禁止复制、猜测或手工写死已有 Option Value。
5. 实施脚本必须保存“Choice 名称、返回的 Option Value、语言标签、Active 状态”回读证据。

## 2. Choice 设计清单

以下“建议 Scope”是设计建议，不代表当前 Dataverse 已创建。

| 中文业务名称 | English technical purpose | 绑定字段 | 建议 Scope | 选项标签 |
|---|---|---|---|---|
| 服务类型 | Service Type | `aigw_servicetype` | Local Choice，除非已有完全匹配 Global Choice | 国内运输；国际海运；国际空运；铁路运输；仓储运营；门店配送；冷链物流；跨境电商物流；供应链解决方案；其他 |
| 覆盖状态 | Coverage Status | `aigw_coveragestatus` | Local Choice | 已覆盖；提案中；未覆盖；曾经覆盖；已停止；待确认 |
| 活动类型 | Activity Type | `aigw_activitytype` | Local Choice | 电话；会议；任务；Note；邮件沟通摘要；现场拜访；内部会议 |
| 互动方向 | Direction | `aigw_direction` | Local Choice | 客户→我方；我方→客户；内部 |
| 结果类别 | Result Category | `aigw_resultcategory` | Local Choice | 已确认；部分确认；待客户回复；待内部处理；延期；拒绝；完成；无结果 |
| 异议类别 | Objection Category | `aigw_objectioncategory` | Local Choice | 价格；时效；服务能力；实施周期；合同条款；系统接口；合规；其他 |
| 客户响应程度 | Customer Response Level | `aigw_customerresponselevel` | Local Choice | 积极；正常；低频；无回复；明确拒绝 |
| 情绪 | Sentiment | `aigw_sentiment` | Local Choice | 正面；中性；偏负面；负面；未判断 |
| 服务问题类别 | Service Issue Category | `aigw_serviceissuecategory` | Local Choice | 运输时效；服务质量；计费；系统接口；仓储作业；合规；其他 |
| 收入区间 | Revenue Band | `aigw_revenueband` | Local Choice | 无收入；低；中；高；战略级；未确认 |
| 毛利区间 | Margin Band | `aigw_marginband` | Local Choice | 负毛利；低；正常；较高；未确认 |
| 服务满意度 | Service Satisfaction | `aigw_servicesatisfaction` | Local Choice | 很满意；满意；一般；需改善；未确认 |

## 3. Option Value 规则

- 本文件不写数字值、十六进制值或现有 Option Value。
- 实施顺序必须是：读取已有定义 → 精确匹配判断 → 复用或创建 → 回读返回值 → 写入字段映射清单。
- 任何同名但语义不同的 Choice 都不能复用。
- 中英文标签必须成对保存；业务界面默认简体中文，技术审计保留英文 technical name。
- `Other/其他` 只用于确实无法归类的事实，不应成为 AI 推断的兜底答案。
- `未确认` 与空值不同：`未确认` 表示人工明确知道“暂未确认”；空值表示尚未采集。

## 4. 事实与派生边界

Choice 只保存营业人员、运营人员或 Sanitization 流程确认的事实；以下内容不得创建为 Choice：

- AI High Risk、AI Growth Opportunity、AI Recommended Action；
- Golden Scenario ID、expected answer、forbidden claim；
- Provider 名称或模型评分；
- 客户姓名、联系人姓名、竞争对手名称；
- 原始 Timeline 文本或情绪原句。

Gateway 可从 Choice 计算 `serviceCoverageBand`、`whitespaceCategory`、`customerResponseTrend`、`sentimentTrend`、`objectionCountBand` 等 Safe Context，但不把派生结果写回 CRM。

## 5. Choice 与字段关系

### Customer Service Coverage

- `aigw_servicetype` → 服务类型。
- `aigw_coveragestatus` → 覆盖状态。
- `aigw_revenueband` / `aigw_marginband` → 区间事实，禁止精确金额。
- `aigw_servicesatisfaction` → 人工确认的服务体验区间。

### AI Interaction Signal

- `aigw_activitytype` → 结构化活动类别，不等同于原生 Activity Type 的 GUID 或正文。
- `aigw_direction` → 互动方向。
- `aigw_resultcategory` → 结果类别。
- `aigw_objectioncategory` → 已脱敏异议类别。
- `aigw_customerresponselevel` / `aigw_sentiment` → 受限事实类别，不是模型答案。
- `aigw_serviceissuecategory` → 服务问题类别；`aigw_issueresolved` 保存是否已解决事实。

## 6. 实施前 Choice Gate

只有满足以下条件，Choice Design 才能进入 Schema Implementation：

- 所有标签通过业务负责人确认；
- Global Choice 复用检查有 Metadata 证据；
- 新 Local Choice 没有与现有字段重名或语义冲突；
- 语言标签、默认值、空值语义和停用策略已确认；
- 任何现有 Option Value 未被猜测或复制；
- Safe Context 映射只引用标签语义，不依赖未经回读的数字值。

当前结论：`Choice Design Ready=true`，`Choice Implementation Ready=false`。本阶段 Schema Writes=0。
