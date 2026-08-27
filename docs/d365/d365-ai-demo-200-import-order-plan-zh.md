# D4 导入顺序计划

本文件仅定义顺序和门禁，不包含请求 URL、Header、Token、GUID、Payload 或可执行导入代码。

| 顺序 | 对象 | 行数 | 稳定 Token | 父级依赖 | 成功门禁 | 失败门禁 |
|---:|---|---:|---|---|---|---|
| 1 | Account | 60 | account_token | 无 | 主名称和 Token 唯一 | 重复或未知字段 |
| 2 | Contact | 120 | contact_token | Account | 父 Account 已存在 | 父级缺失或 Token 重复 |
| 3 | Opportunity | 200 | _import_token | Account / Contact | 全部先 Active | Lookup 或 Choice 无法解析 |
| 4 | ServiceCoverage | 240 | _import_token | Account | 复合 Key 与窗口校验通过 | 重叠或未知 Choice |
| 5 | ActualManagement | 130 | _import_token | Opportunity | 每 Opportunity 最多一条 | 重复或父级缺失 |
| 6 | Timeline | 1800 | _import_token | Opportunity | 活动类型和 regarding 可解析 | 类型不支持或父级缺失 |
| 7 | InteractionSignal | 1350 | _import_token | Timeline | source activity 已存在 | 来源缺失或未知 Choice |
| 8 | WinOpportunity | 91 | Opportunity Token | Opportunity 子记录完成 | 官方 Action 可用 | Action 被拒绝；本阶段不执行 |
| 9 | LoseOpportunity | 9 | Opportunity Token | Opportunity 子记录完成 | 官方 Action 可用 | Action 被拒绝；本阶段不执行 |

每阶段均要求 read-before-write、稳定 Token 幂等检查、成功后只读回读。遇到未知结果只允许只读确认，不自动重试或回滚。
