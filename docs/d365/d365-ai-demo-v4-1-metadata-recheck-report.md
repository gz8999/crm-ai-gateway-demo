# Phase 1C-5R2G-C1-R2 v4.1 Metadata Recheck

## 边界与证据

- 环境：仅测试环境，hostname 在请求前精确校验。
- Dataverse：仅 GET。
- Business CRM record GET：**0**。
- POST/PATCH/DELETE/Publish：**0/0/0/0**。
- Production requests：**0**。
- External LLM calls：**0**。
- 公开文件只包含安全 Token、计数、Metadata 结论和批准状态；用户、Team、邮箱及记录 ID 仅保存在 ignored 私有文件。

## v4.1 接管与离线复验

| 项目 | 结果 |
| --- | --- |
| 原 v4 SHA-256 | `f08a94a3caa62950dbaa96e2767e39afe6c79072296394db9d8736a3b2f683fd`，未变化 |
| v4.1 大小 | 732,677 bytes |
| v4.1 SHA-256 | `1447d01c62e8e692c871ff9b0189a11bfc8eb48457a7eb47e09509878747b268` |
| XLSX re-import / ZIP | 通过 / 通过 |
| Formula error | 0 |
| 业务行 | 3,000 |
| 稳定业务 Token、父子关系、Scenario | 保持 |

v4.1 的业务差异仅为已批准的 Contact lookup 修正和四组 Choice 语义修正。`workbook_build_token` 更新为 v4.1 构建标识，不改变稳定记录 Token。

## Contact 与 Choice

- `parentcontactid`：150 条。
- `primarycontactid`：0 条。
- Unknown logical names：0。
- Unknown Choice values：0。
- Choice semantic conflicts：0。
- `aigw_opportunitydetailtype=91`：30 条，标签 `91: 其他`。
- `aigw_goodshandled=20` 医疗器械：12 条。
- `aigw_goodshandled=21`：0 条。
- `aigw_goodshandled=91`：66 条，标签 `91: 其他`。
- `aigw_globalinitiative=91`：150 条，标签 `91: 无`。

Opportunity Type 与 Case Stage 继续使用已批准的简化中文显示文本；Value 未变化，作为已知 P2，不作为 Choice 冲突。

## Owner 候选

只考虑启用、正常交互、非 Application User，并对 Account、Contact、Opportunity、Coverage 和 Signal 所需读写/Append 权限进行只读交叉检查。

- 合格 Active interactive 用户：2。
- 满足 Pilot ownership 访问条件：2。
- 方案 A：六个 Owner Token 共用一个专用测试用户，候选可形成，推荐用于 Pilot。
- 方案 B：需要 6 个不同用户；当前只存在 2 个合格候选，不能形成。
- `Owner Candidate Mapping Ready=true`。
- `Owner Mapping Approved=false`。

方案 A 的具体测试用户仅在 ignored 私有清单中，不在公开报告中披露。

## Department Team 候选

只接受非默认 Owner Team，并要求具备可验证的部门业务语义和后续 Signal 权限。环境中存在 37 个非默认 Owner Team，但没有任何一个同时满足：

1. 已批准的 `DEPT-01/03/04` 业务语义；
2. 可证明的必要安全角色；
3. 三个 Token 各自唯一映射。

因此不把随机生成名称或无角色 Team 冒充业务部门候选：

- `Department Team Candidates Ready=false`。
- `Department Team Mapping Approved=false`。
- `Team Setup Required=true`。

后续需单独批准创建三个 Demo Owner Team，并在独立阶段验证最小 Signal/Account/Opportunity/Team 权限；本阶段没有创建 Team、成员或角色。

## 四账户 Pilot 建议

推荐 Token 精确为：`A-002 / A-006 / A-015 / A-019`。

| Entity | 完整抽取数量 |
| --- | ---: |
| Account | 4 |
| Contact | 8 |
| Opportunity | 20 |
| Actual Management | 12 |
| Service Coverage | 28 |
| Timeline | 260 |
| Interaction Signal | 194 |

20 条 Opportunity 的 Timeline 故事全部抽取，未截断。194 条 Signal 是这些 Timeline 当前已有 Signal 的完整集合；Pilot 子集比例为 74.615%，全量工作簿仍严格为 1,050/1,400=75%。本阶段没有为了凑整而新增 Signal。

覆盖验证通过：Sales Department 01/03/04、Booking Department 01/26/02/09、Active/Won/Lost、仓储/运输/物流咨询/电脑采购及系统安装/项目物流，以及五个强制场景全部存在。

`Four Account Pilot Recommended=true`，但 `Four Account Pilot Approved=false`、`Pilot Dataset Defined=false`、`Pilot Workbook Generated=false`。

## 请求统计

| 类别 | GET/写入数 |
| --- | ---: |
| Metadata GET | 100 |
| SystemUser Reference GET | 2 |
| Team Reference GET | 1 |
| Security Metadata GET | 47 |
| Business Unit Metadata GET | 1 |
| Business CRM GET | 0 |
| POST / PATCH / DELETE / Publish | 0 / 0 / 0 / 0 |
| Production Requests | 0 |
| External LLM Calls | 0 |

Security Metadata GET 包含 1 次被服务端以 HTTP 400 拒绝的诊断查询；未重试为写入、未降级到业务数据读取，也未访问其他环境。

## 问题与门禁

- P0：0。
- P1：1。缺少三个可批准且具备必要权限的不同 Department Team。
- P2：2。简化中文标签；四账户子集 Signal 比例 74.615% 而全量仍为 75%。

- V4.1 Integrity Ready=`true`
- Contact Lookup Contract Ready=`true`
- Choice Metadata Contract Ready=`true`
- Owner Candidate Mapping Ready=`true`
- Owner Mapping Approved=`false`
- Department Team Candidates Ready=`false`
- Team Setup Required=`true`
- Four Account Pilot Recommended=`true`
- Four Account Pilot Approved=`false`
- Reference Mapping Decision Pack Ready=`true`
- Pilot Import Ready=`false`
- Pilot Import Authorized=`false`
- Full Import Ready=`false`
