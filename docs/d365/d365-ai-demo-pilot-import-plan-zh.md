# D365 AI Demo Pilot Import 计划

## 当前门禁

本文件仅定义未来执行顺序，不包含 payload、写入函数或可执行导入代码。

- Pilot Dataset Defined=`false`
- Pilot Workbook Generated=`false`
- Pilot Import Ready=`false`
- Pilot Import Authorized=`false`
- Full Import Ready=`false`

阻断项是 v4 工作簿 Metadata/Choice/Lookup 差异以及 3 Account Pilot 约束不可满足。解决前不得开始 C2。

## 待批准修正

1. 将工作簿 Contact 1 映射从不存在的 `primarycontactid` 修正为 `parentcontactid`。
2. 修正 Choice 标签/值冲突，不修改 Dataverse Choice。
3. 为 `OWNER-DEMO-01..06` 提供明确、唯一且 Active 的测试环境 Owner 映射。
4. 为 `DEPT-01/03/04` 提供明确、唯一且 Active 的 Team 映射。
5. 在以下方案中单独批准一个：
   - 将 Pilot 扩展为 4 Account/8 Contact/20 Opportunity/28 Coverage；或
   - 保持 3 Account，但减少强制场景；或
   - 生成后续 v5，在不改变全量场景分布的前提下重新分散 Account 场景。

## 未来导入顺序

1. Account
2. Contact
3. Opportunity
4. Customer Service Coverage
5. Actual Management
6. Native Timeline
7. Interaction Signal

每一步必须使用 Stable Token、Generation Run Token、Pilot Run Token 和 read-before-write。实际创建成功后，才把测试环境 Record ID 写入 ignored private manifest。

## 状态处理

- Active Opportunity 保持 Active。
- Won 必须使用平台官方 Win 动作。
- Lost 必须使用平台官方 Lose 动作。
- 不直接 PATCH `statecode`、`statuscode` 或 `actualclosedate`。
- Win/Lose 必须是未来 C2 的显式授权操作，不属于本阶段。

## 对象规则

### Actual

- Opportunity 建立后创建。
- 每个 Opportunity 最多一条。
- 子表年度收入使用 `aigw_annualactualrevenue`；父级插件目标为 Opportunity `aigw_yearrevenueactual`。
- 不写 `aigw_yearrevenueactualcny`、财年或不存在的年度 GP 字段。

### Timeline

- Opportunity 状态和父记录稳定后创建。
- 仅 phonecall、appointment、task、annotation。
- 不创建 Email、附件或 BPF instance。

### Signal

- 对应 Timeline 已创建且 source token 已解析后创建。
- `aigw_salesdepartment` 必须绑定到已批准 Team 映射。
- 不保存 Timeline 原文、身份、精确金额、Scenario 或 AI 答案。

## 失败与清理

首个错误后停止后续创建，不自动回滚。清理只能在单独授权后按精确 ID 逆序执行：Signal、Timeline、Actual、Coverage、Opportunity、Contact、Account。不得模糊删除，也不得清理 Location、POL/POD、Owner、User、Team、Choice 或 Schema。

## C1-R2 推荐合同（未批准）

- 推荐 Account：`A-002/A-006/A-015/A-019`。
- 推荐规模：Account/Contact/Opportunity/Actual/Coverage/Timeline/Signal=`4/8/20/12/28/260/194`。
- Owner：单一合格测试用户候选可形成，但映射尚未批准。
- Department：必须使用三个不同 Team；当前无合格现成候选，`Team Setup Required=true`。
- `Pilot Dataset Defined=false`、`Pilot Workbook Generated=false`、`Pilot Import Authorized=false`。

只有用户明确完成三项决策并在后续阶段通过 Team 权限 Gate 后，才允许定义 Pilot 数据集。本文件仍不包含 payload 或可执行写入逻辑。
