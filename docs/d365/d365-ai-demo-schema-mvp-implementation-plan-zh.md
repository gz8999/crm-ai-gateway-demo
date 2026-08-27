# D365 AI Demo Schema MVP 实施计划 R2

## 1. 本轮状态

本文件是受控实施计划，不是执行记录。本阶段已明确禁止 Dataverse Schema 写入、Demo 数据生成、Form/View 修改、权限修改和 Gateway 代码修改。

当前事实来源：`docs/gateway/d365-ai-analysis-field-catalog.json`。既有目录审计证据为测试环境 GET=589、Schema Writes=0、Business Writes=0、Production Requests=0、External LLM Calls=0。

## 2. 实施总顺序

```text
设计批准
  → 只读冲突检查
  → Solution / Choice 预检
  → Opportunity 字段
  → Customer Service Coverage 表
  → AI Interaction Signal 表
  → 关系、Alternate Key、权限
  → Form / View / 子网格
  → Sanitization / Safe Context 回读
  → 小样本 Schema Runtime Gate
  → 独立 Demo Data 设计和生成阶段
```

任一阶段遇到名称冲突、定义不一致、Solution lock、权限不明、FormJSON/FormXML 不同步、429 或超时，都停止写入并只读回读。

## 3. Stage 0：设计批准与只读预检

### 必查项目

- hostname 精确为 `org91f5f65f.crm5.dynamics.com`；
- `CRMAIGatewayDemo` Solution 和 Publisher Prefix `aigw`；
- `aigw_nextaction`、`aigw_nextactiondate`、`aigw_customerservicecoverage`、`aigw_interactionsignal` 无命名冲突；
- 旧 `aigw_opportunityplace` 保留，不删除、不改类型、不迁移值；
- `aigw_polpodlocation` 不复用；
- Protected Form、Full Replica、Actual Form/View、BPF、Plugin、Modern App 和现有 Demo 数据基线不变；
- 相关 Global Choice、Team、Business Unit、Security Role 只读回读；
- 所有写请求计数仍为 0。

### Stop Conditions

出现名称冲突、业务定义冲突、未知部门权限、未知 Choice Value 或生产 hostname 时，输出阻断原因，不猜测、不创建、不删除。

## 4. Stage 1：Opportunity 事实字段

### 创建定义

| 字段 | 定义 |
|---|---|
| `aigw_nextaction` | Single Line of Text，最大 500，Optional，Auditing=On，Create/Update=True |
| `aigw_nextactiondate` | Date Only，Optional，Auditing=On，Create/Update=True |

两项均必须携带 `MSCRM.SolutionUniqueName=CRMAIGatewayDemo`。写入后动态回读 Attribute Metadata、Display Name、Schema Name、ValidForCreate/Update、MaxLength、DateOnly 行为和 Audit 配置。

### 业务规则

本阶段不创建 Business Rule。实施设计只记录：有行动无日期、有日期无行动、日期顺序错误、Active 逾期、Won/Lost 不再产生新逾期。后续规则必须先通过现有记录回归验证。

## 5. Stage 2：Customer Service Coverage

### 创建定义

- Display Name：客户服务覆盖 / Customer Service Coverage
- Logical Name：`aigw_customerservicecoverage`
- Ownership：User/Team-owned
- Primary Name：`aigw_name`，Single Line of Text，200，Business Required
- Owner Team：负责部门对应 Team
- 关系：`account` 1:N Coverage；Delete=Restrict
- 业务唯一性：`aigw_accountid + aigw_servicetype + aigw_startdate`；历史窗口重叠由验证器检查

字段定义、Choice 语义和脱敏规则以 [Schema MVP Design](./d365-ai-demo-schema-mvp-design-zh.md) 与 [Choice Plan](./d365-ai-demo-schema-mvp-choice-plan-zh.md) 为准。

### 记录规则

- `已覆盖`、`曾经覆盖`、`已停止` 必须有 Start Date；`曾经覆盖`、`已停止`必须有 End Date；
- `提案中`可以没有 Start Date，但必须有 Next Opportunity Window 或人工说明；
- 一项服务停止后重新提案或重新覆盖，新增历史记录，不更新原记录为当前状态；
- `Revenue Band` 与 `Margin Band` 只保存区间，不保存精确金额；
- `aigw_notes` 只保存脱敏说明；`aigw_demotoken` 只服务于 Demo 清理。

## 6. Stage 3：AI Interaction Signal

### 创建定义

- Display Name：AI互动信号 / AI Interaction Signal
- Logical Name：`aigw_interactionsignal`
- Ownership：User/Team-owned
- Primary Name：`aigw_name`，200，Business Required
- `aigw_interactiontoken`：100，Business Required，Alternate Key
- Account Lookup：必填；Opportunity Lookup：可选
- `aigw_salesdepartment`：Team Lookup，必填，用于权限过滤
- Delete：对 Account/Opportunity 建议 Restrict；对原生 Activity 不建立强关系

### Sanitization 入口

只有通过 Sanitization 检查的记录才可以写入 Signal。检查项目：

- 无客户姓名、联系人姓名、邮箱、电话、地址；
- 无原始 Activity GUID、Email GUID、ActivityParty GUID；
- 无原始 Email、Note、会议纪要、电话正文；
- 无精确报价、精确金额和未脱敏日期；
- 无 AI 判断、风险等级、Golden 标签；
- 摘要长度不超过 1000，结构化字段与摘要语义一致。

### 去重与删除行为

- 首要幂等键为 `aigw_interactiontoken`；
- `aigw_sourceactivitytoken` 仅用于脱敏追踪，不是原 GUID；
- 原生 Activity 删除后 Signal 保留，避免历史分析被级联删除；
- Account/Opportunity 删除默认 Restrict，先完成历史归档和权限审批；
- 写入失败时不自动重复创建、不批量回滚，输出 token 和失败原因。

## 7. Stage 4：Solution、关系与权限

### Solution 归属

所有新增表、字段、关系、Choice、View 和必要 Form 组件必须进入 `CRMAIGatewayDemo` Solution。每次写入前检查组件是否已存在，超时后只读回读，不重复创建。

### 权限建议

| 对象 | 普通业务用户 | 运营/Sanitization 角色 | 管理层 |
|---|---|---|---|
| Customer Service Coverage | Read；按 Owner Team/授权范围 | Read/Create/Write/Append/Append To | Read，跨部门按授权 |
| AI Interaction Signal | Read；禁止原文写入 | Read/Create/Write/Append/Append To | Read，跨部门按授权 |
| Opportunity 新字段 | 随 Opportunity 现有权限 | 依业务流程授权 | 随现有角色 |

不得自动修改未知角色。实施后必须分别验证普通 Demo 用户、运营角色和管理层的有效权限；管理员通过不等于普通用户通过。

## 8. Stage 5：Form / View / App

### Opportunity

只修改 Full Replica：Summary → `AI营业跟进` → `aigw_nextaction`、`aigw_nextactiondate`。Protected Form 不改，旧 `aigw_opportunityplace` 不删除。

### Customer Service Coverage

- Main Form：覆盖状态、服务类型、时间窗口、区间、负责部门和脱敏说明；
- Active Coverage View：Account、Service Type、Coverage Status、Responsible Department、Next Opportunity Window；
- 历史 Coverage View：Start/End Date、状态、服务类型；
- Account 子网格：只显示授权范围；
- MVP 不加入 Sitemap。

### AI Interaction Signal

- Main Form：日期、活动类别、方向、结果、下一步、结构化标记和脱敏摘要；
- Opportunity/Account 子网格：Recent Interaction Signals；
- 默认只读，Sanitization 角色有限编辑；
- MVP 不加入 Sitemap，不新增 Timeline 页面。

每次 Form 修改后必须回读 FormXML/FormJSON 语义同步、控件唯一、Protected Form hash 不变；不执行 Publish All。

## 9. Stage 6：Safe Context Runtime Gate

先执行部门权限过滤，再生成 Safe Context。最小运行时验证：

1. 输入为 `[AI-DEMO]` synthetic 记录或结构化 Signal；
2. 输出只包含 token/category/band/relative state；
3. 精确金额、身份、GUID、原文、Owner Name、Department GUID 均为 0；
4. `rawDataSent=false`、`exactAmountSentToModel=false`、`externalModelCalled=false`；
5. `aigw_nextactiondate` 只生成日期状态；
6. Coverage 只生成覆盖类别和 whitespace，不生成“AI 已识别增长机会”字段；
7. Signal 只使用结构化字段与已扫描摘要。

## 10. Stage 7：Demo Data 之前的门禁

只有以下条件全部成立，才允许另行设计 Demo 数据：

- Schema Metadata 结构与 manifest 一致；
- 两张表关系、权限、Form/View 和 Alternate Key 回读一致；
- 普通用户可读取，Sanitization 角色可按授权写入；
- 现有 Protected Form、BPF、Plugin、Actual、POL/POD 和 App 无变化；
- 100–150 条数据生成器只使用已批准字段；
- Interaction Signal 不包含原始 Timeline；
- P0/P1=0，Production Requests=0，Business Writes=0（本设计阶段）；
- 另行授权后才能进入 Schema Runtime 和 Data Generation 阶段。

## 11. 回滚边界

本轮无回滚动作，因为没有写入。未来若某一步写入后失败：

- 先停止后续写入；
- 只回读已创建组件；
- 不删除已存在的业务字段或历史数据；
- 只按单个新增组件的受控回滚方案处理；
- 不修改 Protected Form、BPF、Plugin、现有 Demo 数据或权限；
- 不使用删除 Schema 作为自动失败恢复。

## 12. 实施状态

| Gate | 状态 |
|---|---|
| Schema Design Ready | true |
| Schema Implementation Ready | false，等待单独授权 |
| Demo Data Design Ready | false，等待 Schema Runtime Gate |
| Schema Writes | 0 |
| Business Writes | 0 |
| Production Requests | 0 |
| External LLM Calls | 0 |

