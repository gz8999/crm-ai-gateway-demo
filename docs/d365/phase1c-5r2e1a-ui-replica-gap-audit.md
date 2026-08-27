# Phase 1C-5R2E-1A D365 商机高仿真 UI 差异审计

## 审计范围

本轮将 9 张原 CRM 截图与测试环境中 `AI Gateway Opportunity Demo - Full Replica` 的未发布 FormXML/FormJSON、相关 View、Business Rule、BPF 和 App 引用进行只读对账。没有打开或请求生产环境，没有执行任何 Dataverse 写入、发布、激活或 Seed。

截图只作为本地证据使用，未复制到仓库：

| 分类 | 数量 | 文件 |
|---|---:|---|
| 摘要 | 5 | 商机详情页1-5.jpeg |
| 实绩 | 2 | 商机详情页实绩1-2.jpeg |
| 其他（预算） | 2 | 商机详情页预算1-2.jpeg |
| BPF 横跨证据 | 9 | 所有截图均显示顶部流程；没有独立展开步骤截图 |

证据限制：当前测试实现尚未发布、未加入 App，本轮无法做同视口的渲染像素对比。当前实现侧结论来自未发布 FormXML/FormJSON 和 metadata；涉及运行时视觉表现的事项留到 R2E-1E。

## 当前基线

- 环境门禁：指定测试 hostname、预期 organization、unmanaged `CRMAIGatewayDemo`、publisher prefix `aigw` 均通过；环境专属 hostname/ID 仅保存在被忽略的本地审计产物中。
- AI 门禁：`AI_PROVIDER=demo`，`ALLOW_EXTERNAL_AI=false`。
- Full Replica：Inactive、非默认、有未发布变更、未加入 App。
- FormXML/FormJSON：主要结构同步，无 `undefined`，5 Tabs、19 Sections、114 Controls、106 unique bound fields。
- Tabs：`摘要`、`预算`、`实绩`、`Products`、`Files`。
- Summary 左栏：商机信息、Sales Person Info、商机详细信息、POL&POD。
- Summary 右栏：汇总信息、预算、年度预算、实绩、Timeline。
- Budget：1Q-4Q 四个 Section，36 个预算字段均且仅位于预算 Tab。
- Actuals：仅 1 个目标 Subgrid；table、relationship、view、10 rows、search、view selector、chart off、auto-expand off 均正确。
- Actual Management 默认 View：6 列，无 filter、无 link-entity，`modifiedon desc`。
- Actual Management Main Form：1 Tab、1 Section、1 Control，仅 `aigw_name`。
- Business Rule：Specific Form，Draft/Inactive。
- 自定义 BPF：Draft/Inactive，未加入 App。

## 截图目标

截图中的商机页具有以下稳定特征：

- Header 从左到右显示受注确度、是否预算内、负责人。
- BPF 是两个中文阶段：授予资格、案件关闭。
- Summary 使用固定左右双栏；左侧承载商机、销售人员、详细信息、POL/POD，右侧承载汇总、预算、年度预算、实绩和 Timeline。
- Budget 按 April-March 财年分成 1Q-4Q，每个季度三列：收入、毛利/边际利润、物量。
- Actuals 是关联记录 Subgrid，单行横向展示年度及月度数据；截图明确显示 Revenue、GP 和审计列，并有横向滚动。
- 截图没有证明 Actuals 是 Editable Grid，也没有显示 Form Component。最保守结论是“标准 Related Records Subgrid + 打开子记录 Main Form 录入”。

## 关键差异

### Header

字段集合正确，但顺序不同：当前是 `aigw_budgetstatus`、`aigw_winprobabilityrank`、`ownerid`，截图是受注确度、是否预算内、负责人。`ownerid` 的 1033 标签仍为 `Owner`。

### BPF

自定义 BPF 的两个阶段名称和顺序与截图一致，但只保存了最小步骤：

1. 授予资格：`parentaccountid` Required。
2. 案件关闭：`aigw_winprobabilityrank`、`statuscode`、`actualclosedate` Optional。

该 BPF 仍为 Draft/Inactive 且未加入 App。当前可用的微软托管 `Sales Process` 是 `Qualify -> Develop -> Propose -> Close` 四阶段英文流程。因此在独立完成激活、App、流程顺序和角色门禁前，运行时不会高仿真匹配截图。截图未展开 BPF 步骤，缺失步骤必须标记 `Requires User Confirmation`。

### Tabs、Sections 与标签

Summary 与 Budget 的结构已高度接近截图。主要标签差异是系统 Tab 仍显示 `Products`、`Files`，而截图显示 `产品`、`文件`。`Related` 应继续作为系统导航，不创建普通 Tab。

混合语言不能一刀切：截图本身保留 `Sales Person Info`、`Timeline`、`POL&POD` 以及部分英文业务值。后续应使用逐项批准的标签矩阵。

### Option Set 标签

- 受注确度：当前值标签为 `A/B/C/D/Y/Z`，截图为带序号的 `02: A` 等格式。
- 是否预算内：当前为 `预算内/预算外`，截图为 `01: 预算内` 等格式。
- 调查背景、决裁者、客户需求、提案内容的关键截图值与当前编号中文标签基本一致。
- `aigw_opportunitytype` 与 `aigw_casestage` 同时存在早期英文值和另一组编号中文值，存在语义重复与选择歧义。

任何 Choice 修正都必须先做 value/label 语义审计；本阶段不删除、不覆盖、不重建 option value。

### 实绩体验

当前 Subgrid 的关系与基础参数正确，但 View 只有：名称、相关商机、预计下单日、年度实绩收入、年度实绩收入 base、修改时间。截图目标则是宽表：年度合计、April-March 月度 Revenue/GP，末尾还有创建/修改审计列。

更严重的是，当前 Actual Management Main Form 只有 `aigw_name`，没有 Opportunity、币种、预计下单日、12 个月 Revenue/GP/MP，也没有只读年度合计。即使 Subgrid 可见，用户仍没有完整安全的录入入口。

### 自动计算字段

| 字段 | 当前控件 | 只读 | 结论 |
|---|---:|---:|---|
| `aigw_annualactualrevenue` | Actual Management Main Form 中 0 | 不适用 | 添加到录入 Form 时必须只读 |
| `aigw_yearrevenueactual` | Full Replica 中 1 | 否 | **Fail，P0** |
| `aigw_yearrevenueactual_base` | Full Replica 中 1 | 是 | Pass |
| `aigw_yearrevenueactualcny` | Full Replica 中 0 | 不适用 | Pass |

`aigw_yearrevenueactual` 是 Plugin 派生值，目前可手工编辑，构成发布阻断。

## 优先级

### P0 发布阻断

1. 将 Full Replica 中 `aigw_yearrevenueactual` 设为只读。
2. 建立可用的 Actual Management Main Form；月度字段可编辑，`aigw_annualactualrevenue` 必须只读。
3. 自定义两阶段 BPF 尚未激活、未加入 App；默认四阶段英文 Sales Process 与截图不符。
4. Full Replica 仍 Inactive、未发布、未加入 App，尚不能完成运行时视觉验收。

### P1 高仿真必须修正

1. Header 顺序调整为受注确度、是否预算内、负责人，并处理 Owner 基础语言标签。
2. `Products/Files` 调整为 `产品/文件`，Related 保持系统导航。
3. 受注确度、预算内标签缺少截图中的编号格式。
4. Opportunity Type、Case Stage 存在重复语义 option families，需要专门对账。
5. Actuals 默认 View 缺少 April-March 月度列和截图中的审计列。
6. 保留 Related Records Subgrid 架构，但补齐子记录录入 Form 与命令行为。

### P2 Demo 前优化

1. 建立“有意保留英文”的标签白名单，避免把 Sales Person Info、Timeline、POL&POD 误翻译。
2. 同时提供高仿真宽表 View 与更易扫描的 6 列简洁 View。

### P3 后续范围

1. 产品、文件、相关仅保留系统结构，不扩展产品或 SharePoint 功能。
2. 多财年实绩仍不在本版范围；继续保持每个 Opportunity 最多一条 Actual Management。

## Requires User Confirmation

1. 原实绩网格是否支持 inline edit，还是点击名称打开子记录 Form。
2. MP 月度字段是否必须出现在默认网格；截图明确显示 Revenue/GP，但未明确显示 MP。
3. BPF 每个阶段的完整 Data Step 和 Required 设置。
4. 实绩命令是允许“新建”、只允许“添加现有”，还是两者都允许。
5. Actual Management Main Form 是否复用预算页的四季度三列布局。
6. 默认高仿真 View 是否必须保留 Created By/On、Modified By/On 四个审计列。
7. 实绩 Tab 内的 Section 标题应显示“实绩”，还是隐藏标题只展示网格。

## 后续实施顺序

1. **R2E-1B 中文标签**：Header 顺序、Products/Files、混合语言白名单、Choice 标签 dry-run。
2. **R2E-1C BPF 复刻**：确认步骤，Designer Save only，只读验证；激活、App、顺序、角色继续拆成独立门禁。
3. **R2E-1D 实绩录入体验**：Actual Management Main Form、只读合计、月度 View、Subgrid 命令与 FormJSON 同步。
4. **R2E-1E 发布前综合核验**：同视口视觉对比、FormXML/FormJSON、BPF/App 可见性、Plugin 派生字段锁定、回滚与 targeted publish gate。

## 请求统计

| GET | POST | PATCH | DELETE | Publish | Business writes | Production requests |
|---:|---:|---:|---:|---:|---:|---:|
| 31 | 0 | 0 | 0 | 0 | 0 | 0 |

`UI Replica Gap Audit Ready=true`。这表示审计产物可供下一阶段使用，不表示当前 UI 已达到发布条件。
