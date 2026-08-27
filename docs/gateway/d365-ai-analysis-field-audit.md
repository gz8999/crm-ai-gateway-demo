# D365 AI Analysis Field Catalog — Read-only Audit

## 执行摘要

- Environment: `https://org91f5f65f.crm5.dynamics.com`
- Dataverse GET: **589**
- POST/PATCH/DELETE/Publish: **0/0/0/0**
- Audited entities: **15**
- Catalog fields/signals: **708**
- Classification: REUSE 578, ADD 67, DERIVE 12, EXTERNAL 7, EXCLUDE 44
- Real CRM data exposure: **0**
- External LLM calls: **0**

## 当前 Schema 可复用能力

Opportunity、Actual Management、Location、POL/POD、标准活动、组织与币种 Metadata 均可读取。现有 `aigw_` 字段、Choice、Lookup、关系、Form/View presence 已纳入机器目录。CRM 继续保存事实；风险、趋势、金额偏差、停滞和优先级由 Gateway 派生。

## 必须新增的事实字段

| Entity | Field | Proposed logical name | Priority | Reason |
|---|---|---|---|---|
| account | 客户规模等级 | `aigw_customersizeband` | P1 | 避免向模型发送精确规模 |
| account | 客户类型 | `aigw_customertype` | P1 | 战略/成长/新/风险/沉睡等人工维护分类 |
| account | 客户关系阶段 | `aigw_relationshipstage` | P1 | 人工确认的关系阶段 |
| account | 细分行业 | `aigw_subindustry` | P1 | 客户稳定业务事实 |
| aigw_customerservicecoverage | Account | `aigw_accountid` | P1 | Account service coverage relationship |
| aigw_customerservicecoverage | Coverage Status | `aigw_coveragestatus` | P1 | Covered/not covered/former/stopped service fact |
| aigw_customerservicecoverage | End Date | `aigw_enddate` | P1 | Service end fact |
| aigw_customerservicecoverage | Margin Band | `aigw_marginband` | P1 | Banded service margin; no exact amount |
| aigw_customerservicecoverage | Next Opportunity Window | `aigw_nextopportunitywindow` | P1 | Human-confirmed opportunity window |
| aigw_customerservicecoverage | Responsible Department | `aigw_responsibledepartment` | P1 | Department scope fact |
| aigw_customerservicecoverage | Revenue Band | `aigw_revenueband` | P1 | Banded service revenue; no exact amount |
| aigw_customerservicecoverage | Service Type | `aigw_servicetype` | P1 | Approved service taxonomy |
| aigw_customerservicecoverage | Start Date | `aigw_startdate` | P1 | Service start fact |
| aigw_interactionsignal | Account | `aigw_accountid` | P1 | Authorized Account aggregation relationship |
| aigw_interactionsignal | Activity Date | `aigw_activitydate` | P1 | Interaction timing fact |
| aigw_interactionsignal | Activity Type | `aigw_activitytype` | P1 | Phone/meeting/task/note/email-summary category |
| aigw_interactionsignal | Budget Mentioned | `aigw_budgetmentioned` | P1 | Structured budget signal |
| aigw_interactionsignal | Commitment Completed | `aigw_commitmentcompleted` | P1 | Commitment completion fact |
| aigw_interactionsignal | Commitment Due Date | `aigw_commitmentduedate` | P1 | Commitment timing fact |
| aigw_interactionsignal | Commitment Made | `aigw_commitmentmade` | P1 | Customer/internal commitment signal |
| aigw_interactionsignal | Competitor Mentioned | `aigw_competitormentioned` | P1 | Presence only; no competitor identity |
| aigw_interactionsignal | Customer Response Level | `aigw_customerresponselevel` | P1 | Structured response intensity |
| aigw_interactionsignal | Decision Maker Involved | `aigw_decisionmakerinvolved` | P1 | Role involvement without identity |
| aigw_interactionsignal | Direction | `aigw_direction` | P1 | Inbound/outbound/internal category |
| aigw_interactionsignal | Interaction Token | `aigw_interactiontoken` | P1 | Synthetic/stable interaction token; not an activity GUID |
| aigw_interactionsignal | Next Step | `aigw_nextstep` | P1 | Human-confirmed next step |
| aigw_interactionsignal | Objection Category | `aigw_objectioncategory` | P1 | Sanitized objection category |
| aigw_interactionsignal | Objection Present | `aigw_objectionpresent` | P1 | Structured objection signal |
| aigw_interactionsignal | Opportunity | `aigw_opportunityid` | P1 | Authorized relationship to Opportunity |
| aigw_interactionsignal | Result Category | `aigw_resultcategory` | P1 | Structured interaction outcome |
| aigw_interactionsignal | Sales Department | `aigw_salesdepartment` | P1 | Department scope fact |
| aigw_interactionsignal | Sanitized Activity Summary | `aigw_sanitizedsummary` | P1 | Redacted summary without identity or raw Timeline |
| contact | 联系人角色 | `aigw_contactrole` | P1 | 结构化角色替代身份原值 |
| contact | 联系状态 | `aigw_contactstatus` | P1 | 有效/离职/待核验 |
| contact | 决策影响力 | `aigw_decisioninfluence` | P1 | 决策网络事实 |
| contact | 决策角色 | `aigw_decisionrole` | P1 | 决策人/审批人/采购等结构化角色 |
| opportunity | 预算审批状态 | `aigw_budgetapprovalstatus` | P1 | 预算事实 |
| opportunity | 竞争对手状态 | `aigw_competitorstatus` | P1 | 竞争事实 |
| opportunity | 客户承诺事项 | `aigw_customercommitment` | P1 | 客户明确承诺 |
| opportunity | 客户承诺日期 | `aigw_customercommitmentdate` | P1 | 客户承诺事实 |
| opportunity | 客户预计决策日期 | `aigw_customerdecisiondate` | P1 | 客户预期事实 |
| opportunity | 客户核心问题 | `aigw_customerproblem` | P1 | 脱敏业务事实摘要 |
| opportunity | 下一步行动 | `aigw_nextaction` | P0 | 承诺的业务行动，不是 AI 建议 |
| opportunity | 下一步行动日期 | `aigw_nextactiondate` | P0 | 停滞与逾期判断事实 |
| opportunity | 当前未决问题 | `aigw_openissues` | P1 | 人工确认的开放问题 |
| opportunity | 价格异议状态 | `aigw_priceobjectionstatus` | P1 | 异议事实 |
| opportunity | 主要异议类别 | `aigw_primaryobjectioncategory` | P1 | 结构化异议 |
| opportunity | 路线核验状态 | `aigw_routeverificationstatus` | P1 | 路线人工核验事实 |
| opportunity | 案件停滞原因 | `aigw_stagnationreason` | P1 | 人工确认原因；严重度由 Gateway 派生 |
| opportunity | 客户成功标准 | `aigw_successcriteria` | P1 | 可验证的客户标准 |
| opportunity | 招标状态 | `aigw_tenderstatus` | P1 | 招标事实 |

## 建议新增的表

- **AI Interaction Signal** (`aigw_interactionsignal`): 结构化、脱敏的互动信号；不复制原始 Timeline [P1]
- **Customer Service Coverage** (`aigw_customerservicecoverage`): Account 级服务覆盖、停止服务和机会窗口事实 [P1]
- **Customer Relationship History** (`aigw_customerrelationshiphistory`): 跨 Opportunity 的关系阶段历史（仅在审计/事件模型确有需求时） [P2]
- **External Intelligence Snapshot** (`aigw_externalintelligencesnapshot`): 优先 Gateway 独立存储；若需审计留痕则保存版本化摘要 [P2]

## Timeline 结构化建议

Raw Timeline 必须保留在 CRM：

`Raw Timeline → Sanitization → Structured Signals → Safe Timeline Summary → External LLM`

原始 subject、description、notetext、收发件人和 ActivityParty 身份不得发送外部模型。Email 仅完成 Metadata 审计；当前无法证明创建未发送 Email 不会触发自动化，因此 Demo 优先使用 annotation 保存脱敏沟通摘要。

## Customer Service Coverage

当前 Opportunity 快照不能表达客户已覆盖、未覆盖、曾合作和停止服务的时间历史。建议新增 Account 级 `aigw_customerservicecoverage` 保存事实，Gateway 再派生 whitespaceCategory 和增长机会；禁止保存“AI 已识别增长机会”。

## 部门与权限

Demo 可复用现有组织团体、计上部门、销售部门和营业负责人 Choice/Lookup 做展示筛选。生产应以 Business Unit、Owner Team、Security Role/Field Security 为授权真相；后端必须先按本人/本部门/下级团队/多部门范围过滤，再构建 Safe Context。精确金额权限不得由普通业务字段模拟。

## 金额与脱敏

所有 Money 和预算/实绩金额字段均标记 `Contains Exact Amount=true`。CRM 内部可以按角色显示，Safe Context 只生成 amountBand、annualRevenueBand、annualMarginBand、budgetVarianceBand、marginVarianceBand 和 elapsedPeriodAchievementBand。全局门禁：`exactAmountSentToModel=false`。

## 八个 AI 场景

- **stalled-high-value**: Gap: opportunity.aigw_nextactiondate
- **budget-actual-gap**: current required field set covered
- **data-contradiction**: current required field set covered
- **growth-opportunity**: Gap: aigw_customerservicecoverage.coveragestatus
- **location-route-risk**: current required field set covered
- **meeting-prep**: Gap: opportunity.aigw_nextactiondate
- **multi-risk-priority**: current required field set covered
- **healthy-control**: current required field set covered

## 深度分析模块

DA-01 至 DA-09 均已建立 CRM entity、历史窗口、Timeline、Account aggregate、External Context、Safe Context 与禁止 Provider 字段矩阵。详见 Excel `08_Deep_Analysis_Matrix` 与 JSON。

## P0 / P1 / P2

- P0: 0
- P1: Required scenario facts need approved schema: opportunity.aigw_nextactiondate, aigw_customerservicecoverage.coveragestatus
- P2: Annual Actual GP has no independent deployed field; derive from monthly GP unless separately approved; External intelligence storage remains a design choice; Email create safety cannot be proven from Metadata alone

## 下一步建议

先批准 P0/P1 ADD 字段与 Interaction Signal / Customer Service Coverage 的独立 Schema 设计，再重新生成 100–200 条 Demo 数据。不得直接由本报告触发 Schema 写入。

## Gates

- D365 Metadata Audit Ready=**true**
- Account Field Catalog Ready=**true**
- Contact Field Catalog Ready=**true**
- Opportunity Field Catalog Ready=**true**
- Actual Field Catalog Ready=**true**
- Timeline Field Catalog Ready=**true**
- Department Security Catalog Ready=**true**
- Amount Privacy Catalog Ready=**true**
- AI Scenario Field Matrix Ready=**true**
- Deep Analysis Field Matrix Ready=**true**
- Safe Context Mapping Ready=**true**
- REUSE ADD DERIVE Classification Ready=**true**
- Machine Readable Catalog Ready=**true**
- D365 Schema Writes=**0**
- Dataverse Business Writes=**0**
- External LLM Calls=**0**
- Production Requests=**0**
- Credential Exposure=**0**
- Real CRM Data Exposure=**0**
- P0/P1=**0/P1**
- Demo Data Generation Ready=**false**

## Validation

- `npm test`: 211/211 passed after the final catalog update.
- `npm run build`: an earlier audit-phase run passed (`tsc`, Vite, production bundle isolation). The final rerun is blocked by unrelated concurrent UI worktree changes: `src/internal/InternalAiLab.tsx` does not pass the newly required `providerStatus` prop to `DecisionWorkspace`. This audit did not modify or stage any `src/`, `server/`, CSS, Decision Workspace, Provider, fixture, or UI test file.
- `git diff --check`: passed for the audit deliverables.
- Sensitive scan: JSON/Markdown/scripts contain no token, private key, credential value, CRM GUID, production hostname, or raw CRM payload. XLSX cell contents (`xl/sharedStrings.xml`) passed the same scan.
- Workbook verification: 13 required sheets imported successfully; representative ranges and all-sheet previews were rendered under ignored `local-artifacts`.
