# Phase 1C-5R2G-A-R1 Demo Data Schema Contract Reconciliation

## 范围与证据

本轮仅修正离线设计契约，权威来源为：

- `d365-ai-demo-schema-mvp-core-implementation.md`
- `d365-ai-demo-schema-mvp-design-zh.md`
- `d365-ai-demo-local-choice-option-values.json`
- Runtime Gate 基线 Commit `43e9455b58259c414e5815942fea960be25c431d`

Dataverse requests=`0`，External LLM calls=`0`。没有生成 XLSX、CSV、payload 或 import script，也没有修改 Schema、Form、View、Choice 或 Gateway。

## 修正 1：Coverage 唯一性

R2G-A 误将 `aigw_demotoken` 标记为 Alternate Key。部署证据显示真实定义为：

`Aigw_CustomerservicecoverageKey = aigw_accountid + aigw_servicetype + aigw_startdate`

最终契约：

- `aigw_demotoken` 仅用于 synthetic import、read-before-write 和 cleanup。
- `aigw_demotoken.isAlternateKey=false`。
- 对有 Start Date 的 Coverage，三字段复合键参与 Dataverse 唯一性保护。
- 对 Start Date 为空的“提案中”或“未覆盖”，先按 Demo Token 查询，再按 Account + Service Type + Status + Next Opportunity Window 做规范化冲突检查。
- 空 Start Date 分支不得宣称受 Alternate Key 完整保护。

## 修正 2：Interaction Signal

最终部署字段集合为 25 个：

`aigw_name`, `aigw_interactiontoken`, `aigw_accountid`, `aigw_opportunityid`, `aigw_sourceactivitytoken`, `aigw_activitydate`, `aigw_activitytype`, `aigw_direction`, `aigw_resultcategory`, `aigw_nextstep`, `aigw_budgetmentioned`, `aigw_decisionmakerinvolved`, `aigw_objectionpresent`, `aigw_objectioncategory`, `aigw_competitormentioned`, `aigw_commitmentmade`, `aigw_commitmentduedate`, `aigw_commitmentcompleted`, `aigw_customerresponselevel`, `aigw_sentiment`, `aigw_serviceissuecategory`, `aigw_issueresolved`, `aigw_sanitizedsummary`, `aigw_salesdepartment`, `aigw_demotoken`。

Two Options 精确为：

`aigw_budgetmentioned`, `aigw_decisionmakerinvolved`, `aigw_objectionpresent`, `aigw_competitormentioned`, `aigw_commitmentmade`, `aigw_commitmentcompleted`, `aigw_issueresolved`。

语义约束：

- `aigw_nextstep` 保存人工确认的下一步文本，没有通用下一步日期字段。
- `aigw_commitmentduedate` 只表示承诺期限。
- `hasIssue` 只能从问题类别和解决状态离线派生，不写 CRM。
- 旧契约中的四个设计外别名已从所有 CRM 映射删除，并由 P1 denylist 测试保护。

## 验证结果

新增规则：`SCHEMA-REF-001/002`、`KEY-001/002`、`SIGNAL-001/002` 和 `COV-002`。测试直接从冻结 Schema Manifest 读取 Signal 字段，并与生成契约做深比较。

- Unknown CRM Logical Names=`0`
- Coverage Alternate Key Contract Ready=`true`
- Coverage Demo Token Contract Ready=`true`
- Interaction Signal Field Contract Ready=`true`
- Validation Contract Ready=`true`
- Schema Contract Reconciled=`true`
- P0/P1=`0/0`
- Demo Data Design Ready=`true`
- Offline Workbook Generation Ready=`true`
- Demo Data Generation Started=`false`
- Pilot Import Ready=`false`

## 未改变内容

规模继续为 `30/60/150/100/210/1400/1050`，八场景分布继续为 `15/15/12/12/10/10/16/10`。Timeline、Signal 数量、安全契约、Location/POL-POD 复用和 Import/Cleanup 总体顺序均未变化。
