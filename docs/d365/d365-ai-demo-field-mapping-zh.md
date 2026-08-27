# D365 AI Demo 字段映射

> **C1-R2 Metadata 纠偏：** v4.1 已将 Contact 1 修正为 `parentcontactid`，实时 Metadata 复验通过；`primarycontactid` 出现次数为 0。Pilot Import 仍因 Owner/Department Team/Pilot 批准门禁被阻断。

## 映射原则

- `CRM`：后续工作簿可映射到当前冻结 Metadata 的业务事实。
- `DERIVE`：Gateway 或离线验证计算，不写回 CRM。
- `VALIDATION ONLY`：Scenario/Golden/清理信息，仅用于离线验证。
- `EXCLUDE`：不得写入或不得进入 Safe Context。

本文件不扩展 Schema。未在 R3C 冻结 Metadata 中实现的字段不能出现在导入 payload。

## Account 与 Contact

| 层 | 字段/概念 | 映射 | 规则 |
| --- | --- | --- | --- |
| CRM | Account 主名称 | `account.name` | 仅 synthetic 中文名称；Safe Context 使用 `A-xxx` |
| CRM | 行业 | `account.industrycode`（存在时） | 10 个行业类别；工作簿生成前按冻结 Choice 再校验 |
| CRM | Account 说明 | `account.description`（可选） | 只写 synthetic 摘要，不含地址或真实历史 |
| CRM | Contact 主名称 | `contact.firstname` / `contact.lastname` | 仅 synthetic 人名；Safe Context 不输出原值 |
| CRM | 联系人角色 | `contact.jobtitle`（存在时） | 使用业务/采购/财务/决策/运营角色文本 |
| CRM | Account 关系 | `contact.parentcustomerid` | 每 Contact 精确关联 1 个 synthetic Account |
| DERIVE | 关系成熟度 | Coverage、Opportunity、Signal 聚合 | 仅类别，不新增 CRM 字段 |
| DERIVE | Stakeholder coverage | Contact 角色覆盖 | 仅完整/部分/缺失类别 |
| VALIDATION ONLY | Account/Contact token | 离线 manifest | 不作为 AI 答案，不进入 Provider |

## Opportunity

| 业务组 | CRM 字段 | 用途 | Safe Context |
| --- | --- | --- | --- |
| 标准 | `name`, `parentaccountid`, `ownerid`, `statecode`, `statuscode` | 名称、客户、负责人、状态 | token、owner band、状态类别；不输出身份 |
| 标准 | `estimatedvalue`, `estimatedclosedate`, `actualclosedate`, `closeprobability` | 金额、日期、概率事实 | amount band、relative date state、probability band |
| 事实 | `aigw_nextaction`, `aigw_nextactiondate` | 营业确认的下一步及日期 | present flag、due state；原文和精确日期不外发 |
| 预算 | `aigw_budgetstatus` | 预算内/外 | budget category |
| 月度预算 | `aigw_m4revenuebudget`…`aigw_m3revenuebudget` | April–March 收入预算 | annual/monthly band 和 variance category |
| 月度预算 | `aigw_m4gpmpbudget`…`aigw_m3gpmpbudget` | April–March 毛利预算 | margin band/rate band |
| 月度预算 | `aigw_m4volumebudget`…`aigw_m3volumebudget` | April–March 物量预算 | volume band；允许为空 |
| 年度预算 | `aigw_yearrevenuebudget`, `aigw_yeargpmpbudget` | 年度预算总额 | bands only |
| 年度实绩 | `aigw_yearrevenueactual` | Plugin 回写的父级年度收入 | actual band/trend |
| 案件事实 | 当前 Full Replica 中已存在的阶段、类型、优先级、受注确度、需求、提案、调查背景、决裁者字段 | 构造完整案件故事 | 分类、存在性和脱敏摘要 |
| 物流事实 | 当前 Full Replica 中已存在的服务类型、货物、物量、仓库规模、运输模式字段 | 路线与方案事实 | 类别/band |
| Location | `aigw_opportunitylocation` | 复用 51 条 Active Location | 仅 `routeConsistency`，不输出原值 |
| POL/POD | `aigw_sealandpollookup`, `aigw_sealandpodlookup`, `aigw_airpollookup`, `aigw_airpodlookup` | 复用现有 POL/POD | 仅 route category/consistency |
| EXCLUDE | `aigw_yearrevenueactualcny` | Deprecated | 不写入、不展示、不进入 Safe Context |
| EXCLUDE | Scenario/Golden/AI risk | 不存在 CRM 映射 | 只在离线验证 manifest |

## Actual Management

| 业务概念 | 字段 | 规则 |
| --- | --- | --- |
| Primary Name | `aigw_name` | 使用稳定 synthetic 名称/token |
| Opportunity | `aigw_opportunityid` | 必须关联；每 Opportunity 最多 1 条 |
| 月度收入 | `aigw_aprilactualrevenue`…`aigw_marchactualrevenue` | April–March；允许 Pipeline 月份为 0 |
| 月度毛利 | `aigw_aprilactualgp`…`aigw_marchactualgp` | 与收入保持合理比率 |
| 月度 MP | `aigw_aprilactualmp`…`aigw_marchactualmp` | 按字段业务定义生成 |
| 年度收入 | `aigw_annualactualrevenue` | 等于 12 个月收入总和 |
| 年度毛利 | 无独立字段 | `DERIVE`：12 个月 GP 总和，不写入 |
| 财年 | 无字段 | 不生成；固定业务日期仅用于离线故事一致性 |
| 父级汇总 | `opportunity.aigw_yearrevenueactual` | 后续导入由 Plugin 同步并验证 |

## Customer Service Coverage

| 字段 | 用途 |
| --- | --- |
| `aigw_name` | synthetic 名称 |
| `aigw_accountid` | Account Lookup |
| `aigw_servicetype` | R3B 冻结 Choice |
| `aigw_coveragestatus` | 当前/历史/停止/空白状态 |
| `aigw_startdate`, `aigw_enddate` | 覆盖窗口；同客户同服务不重叠 |
| `aigw_responsibledepartment` | 负责部门事实 |
| `aigw_nextopportunitywindow` | 下一机会窗口 |
| `aigw_revenueband`, `aigw_marginband` | 区间事实，不存精确金额 |
| `aigw_servicesatisfaction` | 服务满意度 Choice |
| `aigw_lastproposaldate` | 最近提案日期 |
| `aigw_notes` | synthetic 简短说明，默认不进入 Provider |
| `aigw_demotoken` | synthetic import、read-before-write 与清理 token；不是 Alternate Key |

已部署 Coverage Alternate Key：`Aigw_CustomerservicecoverageKey = aigw_accountid + aigw_servicetype + aigw_startdate`。对 Start Date 为空的“提案中”或“未覆盖”记录，先按 Demo Token 查询，再按 Account + Service Type + Coverage Status + Next Opportunity Window 做规范化冲突检查；不宣称 Alternate Key 完整保护。

## Interaction Signal

| 字段组 | Logical Name | Safe Context 规则 |
| --- | --- | --- |
| 关系 | `aigw_accountid`, `aigw_opportunityid` | 输出父 token，不输出 GUID/名称 |
| 来源 | `aigw_sourceactivitytoken`, `aigw_activitydate`, `aigw_activitytype` | token + relative date state |
| 分类 | `aigw_direction`, `aigw_resultcategory`, `aigw_customerresponselevel`, `aigw_sentiment` | 直接使用安全类别 |
| 下一步 | `aigw_nextstep` | 人工确认的脱敏动作；没有通用下一步日期字段 |
| Two Options | `aigw_budgetmentioned`, `aigw_decisionmakerinvolved`, `aigw_objectionpresent`, `aigw_competitormentioned`, `aigw_commitmentmade`, `aigw_commitmentcompleted`, `aigw_issueresolved` | 真实 Two Options；不得映射到别名或设计外字段 |
| 异议与问题 | `aigw_objectioncategory`, `aigw_serviceissuecategory` | 安全代码，不复述原文；`hasIssue` 仅由类别/解决状态离线派生 |
| 承诺期限 | `aigw_commitmentduedate` | 只表示承诺期限；Safe Context 使用相对状态 |
| 摘要 | `aigw_sanitizedsummary` | 唯一允许进入 Gateway 的文本摘要；需先脱敏 |
| 部门/幂等 | `aigw_salesdepartment`, `aigw_demotoken` | 先按部门过滤；token 用于导入/清理 |

部署字段全集为：`aigw_name`、`aigw_interactiontoken`、`aigw_accountid`、`aigw_opportunityid`、`aigw_sourceactivitytoken`、`aigw_activitydate`、`aigw_activitytype`、`aigw_direction`、`aigw_resultcategory`、`aigw_nextstep`、`aigw_budgetmentioned`、`aigw_decisionmakerinvolved`、`aigw_objectionpresent`、`aigw_objectioncategory`、`aigw_competitormentioned`、`aigw_commitmentmade`、`aigw_commitmentduedate`、`aigw_commitmentcompleted`、`aigw_customerresponselevel`、`aigw_sentiment`、`aigw_serviceissuecategory`、`aigw_issueresolved`、`aigw_sanitizedsummary`、`aigw_salesdepartment`、`aigw_demotoken`。

## Choice 与主数据

12 个 Local Choice、75 个 Options 的唯一权威来源为 `docs/d365/d365-ai-demo-local-choice-option-values.json`。生成器必须逐字段深比较实际 value 和中文 label，不得按顺序猜值。

Opportunity 的现有 Local Choice 还必须在导入前与实时 Metadata 比较。C1 已确认 `aigw_goodshandled=21` 在当前 Metadata 中是“文具”而不是“医疗器械”；Detail 91、Goods 91、Global Initiative 91 也存在标签差异。不得在 payload 映射层静默覆盖。

Location 与 POL/POD 使用既有测试主数据。工作簿只保存后续预检可解析的业务键/token，不预置 Dataverse GUID。

Owner Token 的公开契约只引用 `OWNER-DEMO-01..06`；具体测试用户映射保存在 ignored 私有清单且必须经用户批准。`aigw_interactionsignal.aigw_salesdepartment` 的 `DEPT-01/03/04` 必须分别映射到三个不同 Team，禁止共用一个 Team；当前没有已批准映射。

## 明确不映射的内容

- AI 风险等级、AI 推荐优先级、Scenario ID、Golden required/forbidden assertions。
- 客户真实身份、真实联系方式、真实地址、生产 GUID。
- Timeline 原文、邮件正文、附件。
- 精确金额、Location/POL/POD 原值进入外部 LLM 的映射。
- 当前不存在的财年和年度实绩毛利字段。
- 设计外的下一步日期、承诺标志、决策人标志或问题标志别名；必须使用上面的已部署字段或离线派生。
