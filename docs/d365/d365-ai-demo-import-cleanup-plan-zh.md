# D365 AI Demo 导入与清理计划

## 1. 当前状态

本文件只定义未来执行契约，不是导入脚本，也不包含 Dataverse payload。当前：

- Offline Workbook Generation Ready=`true`
- Pilot Import Ready=`false`
- Full Import Ready=`false`
- Demo Data Generation Started=`false`
- V4 Authoritative Workbook=`true`
- Metadata Schema Preflight Ready=`false`
- Choice Metadata Preflight Ready=`false`
- Lookup Resolution Ready=`false`
- Pilot Dataset Defined=`false`

C1-R2 已确认 v4.1 字段和 Choice 预检通过，并推荐四账户 Pilot；但 Owner 映射未批准、Department Team 需后续设置、四账户 Pilot 未批准，因此当前状态不变。不得把候选或推荐解释为导入授权。

C1 只读预检存在 P1，禁止生成或执行 Pilot 写入。未来顺序以 `d365-ai-demo-pilot-import-plan-zh.md` 为准。

## 2. 工作簿生成前置条件

1. 使用 `2027-01-15` 固定业务日期生成。
2. 读取冻结 Schema Manifest 与 12/75 Choice Manifest。
3. 生成 30/60/150/100/210/1400/1050 条离线行。
4. 运行 `d365-ai-demo-data-validation-rules.json` 全部规则。
5. 产出离线 validation manifest、精确 token 清单和清理 manifest。
6. 不生成 Dataverse GUID，不连接测试或生产环境。

## 3. 未来导入顺序

1. Account
2. Contact
3. Opportunity
4. Actual Management
5. Customer Service Coverage
6. Native Timeline（phonecall、appointment、task、annotation）
7. Interaction Signal

Location 和 POL/POD 是既有主数据，只解析并引用，不导入。

## 4. 幂等规则

- 每条记录必须有稳定 token。Coverage 的 `aigw_demotoken` 仅用于 synthetic import、read-before-write 和 cleanup，不是 Dataverse Alternate Key。
- 幂等键为 `generationRunToken + recordToken`。
- 每次写入前按 token/read-before-write 查询。
- 已存在且定义一致时跳过；不自动覆盖未知记录。
- 发现重复、Inactive 冲突、父记录缺失或 Choice 不匹配时停止整批写入。
- 单条失败后停止后续写入，不自动删除已成功记录。

Coverage 的正式 Alternate Key 是 `Aigw_CustomerservicecoverageKey`，属性精确为 `aigw_accountid + aigw_servicetype + aigw_startdate`。Start Date 为空的“提案中”或“未覆盖”记录必须执行两层检查：先按 `aigw_demotoken` 查询，再比较 Account + Service Type + Coverage Status + Next Opportunity Window 的规范化组合。该分支不能标记为受 Alternate Key 完整保护。

## 5. 未来 Pilot Import 门禁

Pilot 需要单独授权，并且至少满足：

- 工作簿全量规则通过，P0/P1=0。
- 测试 hostname allowlist 与生产 denylist 生效。
- Metadata 只读预检确认所有字段、Lookup、Choice、Alternate Key 和 Plugin 状态。
- 使用极小批次验证 Account -> Contact -> Opportunity -> Actual -> Coverage -> Timeline -> Signal。
- Plugin 对父 Opportunity 年度实绩回写符合预期。
- 不修改既有 `[AI-DEMO]` 或真实业务数据。

## 6. 清理顺序

严格按依赖反序：

1. Interaction Signal
2. Native Timeline
3. Actual Management
4. Customer Service Coverage
5. Opportunity
6. Contact
7. Account

清理 manifest 必须记录每个稳定 token、测试环境生成 ID、父 token、创建结果和清理状态。Location 与 POL/POD 永远不进入清理 manifest。

## 7. Partial Failure

发生首个失败后：

- 停止后续创建。
- 不自动回滚或批量删除。
- 输出已创建 token/ID、失败 token、HTTP 状态和后续安全重跑范围。
- 重跑时自动跳过已存在且一致的记录。
- 只有经单独授权才按清理 manifest 删除本批 synthetic 记录。

## 8. 安全边界

- 不导入生产 GUID、Owner、CreatedOn、ModifiedOn 或来源状态。
- 不创建 Location/POL/POD 主数据。
- 不写 `aigw_yearrevenueactualcny`。
- 不把 Scenario/Golden/AI 答案写入 CRM。
- 不创建或发送 Email；邮件型故事使用 annotation 脱敏摘要。
- 不将客户身份、精确金额或 Timeline 原文发送给外部模型。
- Interaction Signal 只允许使用冻结的 25 个部署字段；`aigw_commitmentduedate` 只保存承诺期限，通用下一步日期和 `hasIssue` 只做离线派生，不写 CRM。
