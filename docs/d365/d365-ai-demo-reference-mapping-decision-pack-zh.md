# D365 AI Demo Reference Mapping 决策包

本文件只需要用户决定三项。没有任何选项在本阶段被自动批准；本阶段 Dataverse 写入为 0，Pilot 数据集和工作簿均未生成。

## 决策 1：Pilot Owner

### A. 单一测试用户

- 将 `OWNER-DEMO-01..06` 全部映射到同一个现有 Active 测试用户。
- 该候选已通过只读权限检查。
- 仅用于 Pilot；`aigw_sales` 等文本字段继续保留营业负责人业务差异。
- 不创建用户、不扩权。
- **推荐默认**。

### B. 多测试用户

- 六个 Token 各自映射到不同 Active 测试用户。
- 当前只有 2 个合格候选，少于所需 6 个，因此本轮不可执行。
- 不猜测、不创建用户。

**请批准：A 或 B。** 当前 `Owner Mapping Approved=false`。

## 决策 2：Department Team

### A. 批准三个现有 Team 候选

- 当前没有同时满足部门语义和必要安全角色的三个不同现有 Team。
- 因此本选项当前不可批准。

### B. 后续单独创建三个 Demo Team

- 建议安全 Token：`CRM-AI-DEMO-DEPT-01`、`CRM-AI-DEMO-DEPT-03`、`CRM-AI-DEMO-DEPT-04`。
- 分别对应国内合同物流、电脑采购及系统安装、重型项目物流。
- 后续独立阶段只授予 Signal 及关联 Account/Opportunity/Team 所需的最小权限，并重新执行只读权限 Gate。
- 本阶段不创建 Team、不修改成员或角色。
- **推荐默认**。

**请批准：A 或 B。** 当前 `Department Team Mapping Approved=false`、`Team Setup Required=true`。

## 决策 3：Pilot 规模

### A. 四账户 Pilot

- Account Token：`A-002 / A-006 / A-015 / A-019`。
- 规模：Account/Contact/Opportunity/Actual/Coverage=`4/8/20/12/28`。
- Timeline/Signal 完整抽取=`260/194`。
- 同时覆盖五个强制场景、三个 Sales Department、四个 Booking Department 和 Active/Won/Lost。
- **推荐默认**。

### B. 保持三账户

- 必须删除至少一个当前强制场景要求。
- 需要用户明确列出删除的场景；本阶段不会替用户降低验收范围。

**请批准：A 或 B。** 当前 `Four Account Pilot Approved=false`。

## 建议组合

- Owner：决策 1A，单一测试用户。
- Department：决策 2B，三个不同 Demo Team 的后续独立配置。
- Pilot：决策 3A，四账户 Pilot。

以上只是建议，不是批准结果。收到明确批准前：

- `Pilot Dataset Defined=false`
- `Pilot Workbook Generated=false`
- `Pilot Import Ready=false`
- `Pilot Import Authorized=false`
