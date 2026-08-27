# D365 AI Demo Schema MVP 设计 R2

## 0. 文档定位

本文件是后续 100–150 条中文 Demo CRM 数据的 Schema 设计，不是 Metadata 审计结果，也不是数据导入文件。

本轮只复用已完成的只读目录：

- [D365 AI Analysis Field Catalog](../gateway/d365-ai-analysis-field-audit.md)
- 目录 JSON：`docs/gateway/d365-ai-analysis-field-catalog.json`
- 目录审计证据：测试环境 Dataverse GET 589 次，Schema Writes=0，Business Writes=0，Production Requests=0，External LLM Calls=0

本轮不连接 Dataverse，不创建表、字段、Choice、关系、Form、View 或数据。

## 1. 范围与冻结边界

环境约束仅允许测试环境：`org91f5f65f.crm5.dynamics.com`。生产环境 `lcn-crm.crm7.dynamics.com` 永不访问。

本 MVP 只设计以下内容：

1. Opportunity 事实字段 `aigw_nextaction` 与 `aigw_nextactiondate`。
2. Account 级 Customer Service Coverage 表 `aigw_customerservicecoverage`。
3. 结构化、脱敏的 AI Interaction Signal 表 `aigw_interactionsignal`。

不纳入本轮：Customer Relationship History、External Intelligence Snapshot、全部 67 个 ADD 候选字段、AI 风险结论字段、AI 增长机会 Boolean、Golden 标签、Gateway 代码和 Demo 数据。

## 2. 设计原则

| 层次 | 责任 | 不允许的行为 |
|---|---|---|
| CRM | 保存营业人员确认的业务事实、结构化状态和脱敏信号 | 保存 AI 最终答案、风险结论或 Golden 标签 |
| Gateway | 根据权限过滤后的 Safe Context 计算趋势、覆盖度、风险和优先级 | 将精确金额、身份或原始 Timeline 发送给 Provider |
| AI Provider | 生成可解释的判断和建议 | 把推断写回 CRM，或把缺失事实补成事实 |
| Timeline | 保留人工查看的原生沟通记录 | 全量复制到 Interaction Signal 或外部模型 |
| Interaction Signal | 保存经过 Sanitization 的结构化互动事实 | 保存客户姓名、Activity GUID、原始正文或 AI 结论 |

全局安全不变量：`rawDataSent=false`、`exactAmountSentToModel=false`、`customerIdentityMasked=true`、`externalModelCalled=false`（Demo 阶段）。部门权限过滤必须发生在 Safe Context 构建之前。

## 3. MVP 实体总览

| 中文业务名称 | Technical Entity | Ownership | 作用 | 本轮状态 |
|---|---|---|---|---|
| 商机 | `opportunity` | 现有 User-owned | 当前案件事实 | REUSE |
| 客户服务覆盖 | `aigw_customerservicecoverage` | 拟 User/Team-owned | Account × 服务类型 × 覆盖历史 | ADD，设计完成 |
| AI 互动信号 | `aigw_interactionsignal` | 拟 User/Team-owned | 结构化脱敏互动事实 | ADD，设计完成 |
| 客户 | `account` | 现有 User-owned | Account 聚合来源 | REUSE |
| 联系人 | `contact` | 现有 User-owned | 决策关系来源，身份不外发 | REUSE |
| 原生活动 | `phonecall`、`appointment`、`task`、`annotation`、`email` | 平台现有 | Timeline 原始事实 | REUSE，原文排除 |

### 3.1 Ownership 选择

两张新增表均设计为 **User/Team-owned**，默认由负责部门对应的 Owner Team 持有：

- 允许部门负责人、管理层和授权跨部门团队按角色读取。
- 不把 Organization-owned 作为默认，避免所有拥有表权限的用户自动看到跨部门覆盖和互动事实。
- `aigw_responsibledepartment`、`aigw_salesdepartment` 采用 Team Lookup 设计；它们是授权过滤输入，不是发送给模型的部门 GUID。
- 实施时必须验证目标 Team、Business Unit、Security Role 与现有组织结构，不得猜测或批量修改权限。

## 4. Opportunity 事实字段设计

### 4.1 字段定义

| 中文显示名 | English display name | Logical Name | Schema Name | Data Type | Required Level | Create/Update | Auditing | Search/Form/View | 业务定义 |
|---|---|---|---|---|---|---|---|---|---|
| 下一步行动 | Next Action | `aigw_nextaction` | `Aigw_Nextaction` | Single Line of Text | Optional | Yes / Yes | On | Quick Find 可搜；Full Replica 表单；Opportunity 视图可选列 | 营业人员确认的下一步业务动作，不是 AI 建议 |
| 下一步行动日期 | Next Action Date | `aigw_nextactiondate` | `Aigw_Nextactiondate` | Date Only | Optional | Yes / Yes | On | Full Replica 表单；Opportunity 视图可选列 | 营业人员确认的计划日期，不是系统推测日期 |

建议 `aigw_nextaction` 最大长度 500；`aigw_nextactiondate` 使用 Date Only，不保存时间和时区。两项均不写入 Protected Form；只允许加入 `AI营业跟进` Section 的 Full Replica。

### 4.2 Form / View 位置

- Form：`AI Gateway Opportunity Demo - Full Replica` 的 Summary Tab，新建 `AI营业跟进` Section。
- 字段顺序：1. 下一步行动；2. 下一步行动日期。
- View：`所有案件 - AI Demo Full Replica` 增加两列仅在实施验收中确认，不改受保护原始 View。
- 默认不加入 Sitemap，不创建新的 Opportunity 页面。
- Form Required 状态保持 Optional；“有行动必须有日期”属于后续 Conditional Business Rule 设计，不在本轮创建。

### 4.3 日期与一致性规则

| 情形 | 规则 | Safe Context |
|---|---|---|
| 有行动、无日期 | 允许保存；标记数据不完整 | `nextActionPresent=true`、`nextActionDueState=missing` |
| 有日期、无行动 | 允许保存；提示人工补充行动 | `nextActionPresent=false`、`nextActionDueState=missing` |
| 日期早于 Opportunity 开始日期 | 保留事实，标记异常 | `nextActionDueState=invalid_order` |
| 日期早于今天且案件 Active | 视为逾期 | `overdue`，再映射到 `nextActionOverdueBand` |
| 日期未来 0–7 天 | 临近到期 | `due_soon` |
| 日期未来超过 7 天 | 未来计划 | `future` |
| Active 且无日期 | 未知/缺失 | `missing` |
| Won / Lost | 不再生成新的逾期风险；保留历史日期 | `completed` 或 `not_applicable` |
| 日期晚于实际关闭日期 | 标记时序矛盾，不自动更正 | `invalid_order` |

外部模型只接收相对状态和区间，例如 `overdue`、`due_soon`、`future`、`missing`，不接收精确日期。

## 5. Customer Service Coverage 设计

### 5.1 业务模型

一个 Account 可有多条覆盖记录，每条记录表达一个服务类型在一个历史窗口内的状态。停止服务、再次提案和重新覆盖都新增历史记录，不覆盖旧记录。

覆盖状态：`已覆盖`、`提案中`、`未覆盖`、`曾经覆盖`、`已停止`、`待确认`。

服务覆盖由 CRM 事实表达；`serviceCoverageBand`、`coveredServiceCategories`、`uncoveredServiceCategories`、`formerServiceCategories`、`stoppedServiceCategories`、`whitespaceCategory` 由 Gateway 派生。

### 5.2 表与字段

表中文名：客户服务覆盖 / Customer Service Coverage  
Logical Name：`aigw_customerservicecoverage`  
Ownership：User/Team-owned  
Primary Name：`aigw_name`，Single Line of Text，200 字符，Business Required；建议只保存合成 Token + 服务类别 + 窗口，例如 `DEMO-ACCOUNT-01｜国际海运｜当前覆盖`。

审计策略：除 `aigw_demotoken` 外，所有业务事实字段 Auditing=On；`aigw_demotoken` 仅为 Demo 清理键，Auditing=Off。所有字段均支持 Read；Create/Update 由后续角色矩阵决定。

| 中文显示名 | English display name | Logical Name | Data Type | Required Level | Choice / Lookup | Safe Context | 外部 LLM |
|---|---|---|---|---|---|---|---|
| 名称 | Name | `aigw_name` | Single Line of Text, 200 | Required | — | 不直接发送，仅用于 CRM 展示/去重 | No |
| 客户 | Account | `aigw_accountid` | Lookup | Required | Target=`account` | Account token；不发送 GUID/名称 | No |
| 服务类型 | Service Type | `aigw_servicetype` | Choice | Required | `Service Type` 本地 Choice | 规范化服务类别 | Yes |
| 覆盖状态 | Coverage Status | `aigw_coveragestatus` | Choice | Required | `Coverage Status` 本地 Choice | 覆盖状态 | Yes |
| 开始日期 | Start Date | `aigw_startdate` | Date Only | Conditional | Covered/former/stopped 时必填 | 相对时间类别 | Yes |
| 结束日期 | End Date | `aigw_enddate` | Date Only | Conditional | Former/stopped 时必填 | 是否已停止及相对时间 | Yes |
| 负责部门 | Responsible Department | `aigw_responsibledepartment` | Lookup | Required | Target=`team` | 部门类别/授权范围，不发送 GUID | No |
| 下次机会窗口 | Next Opportunity Window | `aigw_nextopportunitywindow` | Date Only | Optional | — | `nextOpportunityWindowState` | Yes |
| 收入区间 | Revenue Band | `aigw_revenueband` | Choice | Optional | `Revenue Band` 本地 Choice | 区间 | Yes |
| 毛利区间 | Margin Band | `aigw_marginband` | Choice | Optional | `Margin Band` 本地 Choice | 区间 | Yes |
| 服务满意度 | Service Satisfaction | `aigw_servicesatisfaction` | Choice | Optional | 本地 Choice | `satisfactionBand` | Yes |
| 最近提案日期 | Last Proposal Date | `aigw_lastproposaldate` | Date Only | Optional | — | 相对时间状态 | Yes |
| 脱敏说明 | Sanitized Notes | `aigw_notes` | Multiline Text, 1000 | Optional | — | 仅允许已脱敏摘要 | Conditional |
| Demo Token | Demo Token | `aigw_demotoken` | Single Line of Text, 100 | Optional | — | 测试清理键；不进 Safe Context | No |

`aigw_notes` 不是原始 Notes 容器；写入前必须通过脱敏和长度检查，不能包含客户姓名、联系人、邮箱、电话、地址、报价原值或 Timeline 原文。若无法证明安全，Safe Context 只使用结构化字段。

### 5.3 历史、关系与去重

- `account` 1:N `aigw_customerservicecoverage`。
- Delete 建议 Restrict，避免误删 Account 时丢失覆盖历史。
- `aigw_responsibledepartment` 关联 Team；跨部门查看通过已授权角色/团队，不通过公开字段绕过权限。
- 业务 Alternate Key 设计为 `(aigw_accountid, aigw_servicetype, aigw_startdate)`，开始历史时 Start Date 必须有值；同一服务的重新覆盖使用新的开始日期。
- 对 `未覆盖`、`提案中` 且尚无开始日期的草稿，导入器必须使用规范化业务复合键执行幂等检查；不在本轮额外增加 `coveragekey` 字段。
- `aigw_demotoken` 可作为 Demo 数据安全清理键，但不得成为生产业务唯一性规则。

## 6. AI Interaction Signal 设计

### 6.1 业务模型

表中文名：AI互动信号 / AI Interaction Signal  
Logical Name：`aigw_interactionsignal`  
Ownership：User/Team-owned  
Primary Name：`aigw_name`，Single Line of Text，200 字符，Business Required。  
用途：保存从原生 Timeline 经 Sanitization 得到的结构化事实，不替代 `phonecall`、`appointment`、`task`、`annotation`、`email`。

审计策略：除 `aigw_demotoken` 外，所有结构化事实、关系、日期和脱敏摘要字段 Auditing=On；`aigw_demotoken` Auditing=Off。所有字段的 Create/Update 权限按普通 Read 角色与 Sanitization 角色分离。

### 6.2 字段定义

| 中文显示名 | English display name | Logical Name | Data Type | Required Level | 说明 / Safe Context |
|---|---|---|---|---|---|
| 名称 | Name | `aigw_name` | Text, 200 | Required | CRM 展示名，不进 Provider |
| 互动 Token | Interaction Token | `aigw_interactiontoken` | Text, 100 | Required | 稳定非 GUID Token；唯一键 |
| 客户 | Account | `aigw_accountid` | Lookup(account) | Required | 授权聚合关系；Provider 仅收 Account token |
| 商机 | Opportunity | `aigw_opportunityid` | Lookup(opportunity) | Optional | 可选案件范围；不发送 GUID |
| 来源活动 Token | Source Activity Token | `aigw_sourceactivitytoken` | Text, 100 | Optional | 仅保存不可逆/非 GUID Token；不保存原 Activity GUID |
| 活动日期 | Activity Date | `aigw_activitydate` | Date Only | Required | Provider 仅收相对日期类别 |
| 活动类型 | Activity Type | `aigw_activitytype` | Choice | Required | 电话、会议、任务、Note 等类别 |
| 互动方向 | Direction | `aigw_direction` | Choice | Required | 客户→我方、我方→客户、内部 |
| 结果类别 | Result Category | `aigw_resultcategory` | Choice | Optional | 已确认、待回复、延期等 |
| 下一步 | Next Step | `aigw_nextstep` | Text, 500 | Optional | 人工确认的动作，不是 AI 建议 |
| 提及预算 | Budget Mentioned | `aigw_budgetmentioned` | Two Options | Optional | 只表示是否提及 |
| 决策人参与 | Decision Maker Involved | `aigw_decisionmakerinvolved` | Two Options | Optional | 不保存决策人身份 |
| 存在异议 | Objection Present | `aigw_objectionpresent` | Two Options | Optional | 是否存在异议 |
| 异议类别 | Objection Category | `aigw_objectioncategory` | Choice | Optional | 价格、时效、能力等 |
| 提及竞争对手 | Competitor Mentioned | `aigw_competitormentioned` | Two Options | Optional | 只保存存在性，不保存名称 |
| 形成承诺 | Commitment Made | `aigw_commitmentmade` | Two Options | Optional | 客户或内部承诺 |
| 承诺日期 | Commitment Due Date | `aigw_commitmentduedate` | Date Only | Optional | Provider 仅收逾期/临近状态 |
| 承诺完成 | Commitment Completed | `aigw_commitmentcompleted` | Two Options | Optional | 完成事实 |
| 客户响应程度 | Customer Response Level | `aigw_customerresponselevel` | Choice | Optional | 积极、正常、低频、无回复、拒绝 |
| 情绪 | Sentiment | `aigw_sentiment` | Choice | Optional | 受限类别，不是 AI 结论 |
| 服务问题类别 | Service Issue Category | `aigw_serviceissuecategory` | Choice | Optional | 结构化服务问题 |
| 问题已解决 | Issue Resolved | `aigw_issueresolved` | Two Options | Optional | 解决事实 |
| 脱敏摘要 | Sanitized Summary | `aigw_sanitizedsummary` | Multiline Text, 1000 | Conditional | 只存脱敏摘要；不得是原文或 AI 答案 |
| 销售部门 | Sales Department | `aigw_salesdepartment` | Lookup(team) | Required | 用于权限范围；不发送 GUID |
| Demo Token | Demo Token | `aigw_demotoken` | Text, 100 | Optional | 只用于合成数据清理 |

### 6.3 关系、源活动和去重

- `account` 1:N `aigw_interactionsignal`，Delete 建议 Restrict。
- `opportunity` 1:N `aigw_interactionsignal`，Delete 建议 Restrict；Opportunity 为空时仍可作为 Account 级互动。
- 不建立对原生 Activity 的强关系，避免误删活动时级联删除结构化事实。
- `aigw_sourceactivitytoken` 只做可追溯的脱敏 Token；原 Activity 删除后 Signal 保留，Source token 仍可用于审计，但不代表可访问原文。
- Alternate Key：`aigw_interactiontoken` 唯一。导入器在写入前按 normalized token 查询，遇到重复则跳过或报告冲突。
- 不使用源 Activity GUID、Email GUID、ActivityParty GUID 作为唯一键或 Safe Context 字段。

### 6.4 Form / View

- Main Form：结构化信号摘要、状态、下一步、响应、异议和脱敏摘要；默认只读。
- Opportunity 子网格：`Recent Interaction Signals`，默认最近窗口，列只显示类别、日期区间、响应和结果。
- Account 子网格：最近互动趋势和未完成承诺区间。
- 不加入左侧 Sitemap，除非后续明确需要专门运营入口。
- 有限编辑只授予 Sanitization/运营专用角色；普通 Demo 用户默认 Read。

## 7. 原生 Timeline 与 Interaction Signal

固定流程：

`Raw Timeline → Sanitization → Interaction Signal → Safe Timeline Summary → Gateway / External LLM`

原生 Timeline 负责人工查看电话、会议、任务、Note 和邮件沟通摘要；Interaction Signal 负责结构化统计、权限过滤后的 Safe Context 和脱敏模型输入。

邮件正文、会议纪要、电话正文、Note 原文、收发件人和 ActivityParty 身份永不全量外发。若无法证明创建 Email 不触发发送自动化，Demo 后续优先使用 `annotation` 保存脱敏沟通摘要；本阶段不创建任何 Timeline 数据。

## 8. Safe Context 映射

### Opportunity

`aigw_nextaction` → `nextActionPresent`、不传原文；`aigw_nextactiondate` → `nextActionDueState`、`nextActionOverdueBand`，只传 missing/overdue/due_soon/future/completed/invalid_order。

### Customer Service Coverage

提供：`serviceCoverageBand`、`coveredServiceCategories`、`uncoveredServiceCategories`、`formerServiceCategories`、`stoppedServiceCategories`、`whitespaceCategory`、`nextOpportunityWindowState`、`satisfactionBand`。Account、Team、Department 均以 token/category 使用。

### Interaction Signal

提供：`interactionCountBand`、`interactionFrequencyTrend`、`lastMeaningfulContactState`、`decisionMakerCoverage`、`objectionCountBand`、`competitorMentionState`、`overdueCommitmentCountBand`、`customerResponseTrend`、`sentimentTrend`、`unresolvedIssueCountBand`。

Provider 禁止接收：Customer Name、Contact Name、Account GUID、Opportunity GUID、Activity GUID、精确金额、精确日期、Owner Name、Department GUID、原始 Timeline/Note/Email、Location/POL/POD 原值、AI 结论和 Golden 标签。

## 9. Choice 与中文业务标签

Choice 设计详见 [Choice 方案](./d365-ai-demo-schema-mvp-choice-plan-zh.md)。实施前优先查找完全匹配的现有 Global Choice；没有完全匹配时采用 Local Choice。不得猜测已有 Option Value，所有新 Option Value 由 Dataverse 实施脚本在创建时生成并回读。

## 10. Form / View / App 边界

- 只允许后续修改 Full Replica；Protected Form 不改。
- 两张新表的 Form/View 以中文业务标签为主，技术 Key 置于元数据或展开详情，不进入默认业务界面。
- Customer Service Coverage、AI Interaction Signal 默认不新增 Sitemap；Account/Opportunity 子网格承载入口。
- 不修改 App、BPF、Plugin、权限或现有 Demo 数据。

## 11. 后续数据容量与故事支持

- 100 条 Opportunity：建议 800–1,200 条原生 Timeline，约 8–12 条/Opportunity。
- 150 条 Opportunity：建议 1,200–1,600 条原生 Timeline。
- 每条 Timeline 至少可表达主题、正文、日期、活动类型、结果、下一步、下一步日期、预算、决策人、异议、竞争、承诺、响应、情绪、服务问题、解决状态和脱敏摘要。
- Interaction Signal 对应每条可分析的脱敏互动；不要求一条原生活动一定产生 Signal，需有 Sanitization 结果和权限证据。

## 12. 门禁与结论

| Gate | 结果 | 说明 |
|---|---|---|
| Schema MVP Scope Frozen | true | 仅两个字段、两张表 |
| Chinese Business Documentation Ready | true | 五份交付物均为中文业务说明 + Technical IDs |
| Opportunity Next Action Design Ready | true | 字段、日期状态和一致性规则已定义 |
| Customer Service Coverage Design Ready | true | Ownership、历史、关系、去重已定义 |
| Interaction Signal Design Ready | true | 脱敏、关系、去重、源活动行为已定义 |
| Timeline Content Specification Ready | true | 19 个故事模板和示例见专用文档 |
| Choice Design Ready | true | 选项清单完成，数值待实施回读 |
| Ownership Design Ready | true | User/Team-owned + Owner Team |
| Relationship Design Ready | true | Account/Opportunity 关系与 Restrict 行为已定义 |
| Form View Design Ready | true | Full Replica 原位设计和两表只读视图已定义 |
| Safe Context Mapping Ready | true | Provider 白名单/黑名单已定义 |
| Schema Writes | 0 | 本轮无 Dataverse 写入 |
| Business Writes | 0 | 本轮无业务数据操作 |
| Production Requests | 0 | 未访问生产 |
| External LLM Calls | 0 | 未调用模型 |
| P0/P1 | 0/0 | 设计缺口已转为实施门禁，不作为当前缺陷 |
| Schema Design Ready | true | 设计产物完整 |
| Schema Implementation Ready | false | 本轮明确禁止创建 Schema，须另行授权和回读 |
| Demo Data Design Ready | false | 必须先完成 Schema 实施与运行时 Gate |

下一步只能是独立的 Schema Implementation 评审；本文件不会触发任何创建、发布或导入操作。
