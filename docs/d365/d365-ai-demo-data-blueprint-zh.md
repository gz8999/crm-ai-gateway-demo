# D365 AI 中文 Demo 数据蓝图

> **Phase 1C-5R2G-C1 状态：** v2 已被用户拒绝，v3 已由 v4 取代，v4 为唯一权威工作簿。v4 离线 3000 行复验通过，但只读 Metadata 预检发现 5 组 P1；Pilot Dataset、Pilot Workbook 和 Pilot Import 均未就绪。详见 `d365-ai-demo-v4-metadata-preflight-report.md`。

## 1. 阶段边界

本文件冻结 Phase 1C-5R2G-A 的离线数据设计。设计基线为 Core Schema `a3734ca`、Form/View/Security `6299ed2`、Solution 修复 `a476213`、Local Choice 修复 `b6b0ebf` 和最终 Runtime Gate `43e9455b58259c414e5815942fea960be25c431d`。

本阶段没有连接 Dataverse，没有生成正式 XLSX、CSV、Dataverse payload 或导入脚本，也没有创建业务记录。Dataverse GET/POST/PATCH/DELETE/Publish、生产请求和外部 LLM 调用均为 0。

## 2. 冻结规模

| 对象 | 数量 | 设计说明 |
| --- | ---: | --- |
| Account | 30 | 10 个行业，每行业 3 家，全为匿名 synthetic 客户 |
| Contact | 60 | 每客户 2 人，覆盖业务联系人和决策/审批联系人 |
| Opportunity | 150 | 每客户 5 条；Active/Won/Lost=`60/55/35` |
| Actual Management | 100 | 55 条 Won + 45 条 Active；每 Opportunity 最多 1 条 |
| Customer Service Coverage | 210 | 每客户 7 条，表达当前、历史、停止和空白服务 |
| Native Timeline | 1400 | 4 种原生活动；每案件至少 3 种类型 |
| Interaction Signal | 1050 | Timeline 覆盖率 75%，只存脱敏结构化信号 |

固定业务日期为 `2027-01-15`，财务月份按 `2026-04-01` 至 `2027-03-31`。生成器不得使用执行当天日期，以保证故事、相对日期和测试稳定。

## 3. 中文业务内容

所有面向用户的客户、联系人、案件、活动摘要和服务覆盖内容使用简体中文。Logical Name、Schema Name、token 和 API 结构保持英文。客户与联系人不使用真实企业、人员、地址、邮箱或电话号码。

稳定标识：

- 客户：`A-001` 至 `A-030`
- 联系人：`C-001` 至 `C-060`
- 商机：`DEMO-OPP-001` 至 `DEMO-OPP-150`
- 本次生成批次：`R2G-A-GEN-001`

## 4. Account 与 Contact

10 个行业为汽车与零部件、消费品、电子与半导体、医药与医疗、工业制造、化工与材料、零售与电商、能源与基础设施、食品与冷链、跨境贸易。每行业精确 3 个 Account，每 Account 精确 5 个 Opportunity 和 2 个 Contact。

每个 Account 至少具备：

1. 业务联系人：负责日常需求、进度与方案确认。
2. 决策或审批联系人：承担采购、财务审批、决策影响或最终确认角色。

身份只在 synthetic CRM 内以匿名名称存在。Safe Context 仅输出 Account/Contact token、角色类别、stakeholder coverage 和 relationship band。

## 5. Opportunity 与 Actual

每条 Opportunity 要形成可解释的业务事实链：客户需求、调查背景、提案内容、案件阶段、优先级、受注确度、预算状态、下一步行动、服务/货物/运输模式、Location、POL/POD 以及预算或实绩事实。

状态冻结为：

- Active：60
- Won：55
- Lost：35

Actual 分配冻结为：

- 全部 55 条 Won 有 1 条 Actual。
- 60 条 Active 中稳定选择 45 条有 1 条 Actual，15 条没有 Actual。
- Lost 不创建 Actual。
- 总数 100，任何 Opportunity 不得超过 1 条，符合已部署 Plugin 契约。

Actual 使用 April–March 的收入、毛利和 MP 字段。`aigw_annualactualrevenue` 为已存年度收入，父 Opportunity 的 `aigw_yearrevenueactual` 由 Plugin 同步。年度实绩毛利没有独立字段，只从 12 个月 GP 派生；当前也没有财年字段，不得生成或猜测这两个字段。

## 6. Coverage 历史

`aigw_customerservicecoverage` 每 Account 7 条，共 210 条。已部署 Dataverse Alternate Key 为 `Aigw_CustomerservicecoverageKey`，由 `aigw_accountid + aigw_servicetype + aigw_startdate` 构成。`aigw_demotoken` 只用于 synthetic import、read-before-write 和 cleanup，不是 Alternate Key。同一客户、同一服务的时间窗口不得重叠。历史必须同时覆盖：

- 当前覆盖
- 曾经覆盖
- 已停止
- 空白机会

服务类型、覆盖状态、满意度、收入带和毛利带使用 R3B 冻结的 Local Choice 实际值，不在生成器中重新编号。

当“提案中”或“未覆盖”记录的 Start Date 为空时，三字段 Alternate Key 不能提供完整业务保护。后续导入器必须先按 `aigw_demotoken` 查询，再执行 Account + Service Type + Status + Next Opportunity Window 的规范化冲突检查；不得声称该记录已由 Dataverse Alternate Key 完整防重。

## 7. Timeline 故事

Timeline 总数 1400：

- 40 条战略或高风险 Opportunity × 18 条 = 720
- 60 条核心标准 Opportunity × 8 条 = 480
- 50 条背景 Opportunity × 4 条 = 200

活动类型为 phonecall、appointment、task 和 annotation。每条 Opportunity 至少出现 3 种类型，按日期和稳定 token 排序。故事应从需求发现、方案推进、异议/承诺到下一步形成连续时间线，不堆叠孤立事件。

本阶段不生成邮件发送。需要表达邮件沟通时使用 annotation 保存脱敏摘要，避免触发自动发送或工作流。Timeline 原文不进入 Safe Context 或外部模型。

## 8. Interaction Signal

1050 条 `aigw_interactionsignal` 映射至 1400 条 Timeline，覆盖率精确为 75%。处理链为：

`原生 Timeline -> 脱敏 -> Interaction Signal -> Safe Summary -> Gateway`

Signal 只能保存已部署字段：关系和来源 token、Activity 日期/类型、方向、结果、下一步文本、预算/决策人/异议/竞争对手/承诺等 Two Options、承诺期限与完成状态、客户响应、情绪、服务问题类别与解决状态、脱敏摘要、销售部门和 Demo Token。`aigw_commitmentduedate` 仅表示承诺期限，不是通用下一步日期；`hasIssue` 只能离线派生。不得包含身份、GUID、精确金额、Timeline 原文、AI 风险结论、Scenario ID 或 Golden Assertion。

## 9. 八场景与健康对照

100 条核心 Opportunity 分配给八个 Scenario，另外 50 条作为正常业务背景。Scenario 和 Golden 标签只存在于离线验证清单，绝不进入 CRM 字段或 Provider 输入。

`healthy-control` 必须由一致的阶段、行动、预算/实绩和互动事实构成，只允许正常监控结论，不得为了演示制造高风险。

## 10. 金额、Location 与 POL/POD

CRM synthetic 记录可以保存精确预算和实绩，且月度毛利率保持合理。Gateway Safe Context 只能输出 amount band、margin band、variance category 和 trend，固定 `exactAmountSentToModel=false`。

Location 仅复用现有 51 条 Active `aigw_location`。POL/POD 仅复用 `aigw_polpodlocation` 与四个现有 Lookup。不得新增、修改或清理主数据；Safe Context 不输出 Location、POL 或 POD 原值，只输出 route consistency 等派生类别。

## 11. 完成结论

- Demo Data Design Ready=`true`
- Offline Workbook Generation Ready=`true`
- Demo Data Generation Started=`false`
- Pilot Import Ready=`false`
- Full Import Ready=`false`

权威 v4 已完成离线生成和用户验收。下一步必须先完成离线字段/Choice 修正、Owner/Team Token 映射和 Pilot 规模决策；在 C1 P1 清零前不得进入 Pilot Import。

## 12. C1-R2 决策基线

修正后的权威派生工作簿为 v4.1；`parentcontactid` 和 Choice 语义已通过实时 Metadata 复验。Pilot 默认建议更新为四账户 `A-002/A-006/A-015/A-019`，但批准状态仍为 false。Owner 推荐单一测试用户方案；Signal Department 必须使用三个不同 Team，当前环境没有满足语义和权限的现成候选，需后续单独设置。以上不改变 30/60/150/100/210/1400/1050 的全量设计。
