# CRM AI Gateway D365 200条脱敏 Demo 数据生成报告

## 输入与边界

- 参考文件：`所有案件+7-17.xlsx`
- 参考行数：2,917
- 使用范围：字段结构、Choice、销售部门比例、计上部门/业务类型/运输模式的聚合关系
- 未复制：客户名称、联系人、营业负责人、案件名称、案件说明、GUID、精确金额
- Dataverse 请求：0
- Production 请求：0
- External LLM：0

## 数据规模

| 对象 | 数量 |
|---|---:|
| Account | 60 |
| Contact | 120 |
| Opportunity | 200 |
| ActualManagement | 130 |
| ServiceCoverage | 240 |
| Timeline | 1,800 |
| InteractionSignal | 1,350 |
| 业务数据合计 | 3,900 |

## 销售部门比例

- `06: FF`：172
- `01: Dept1(Industry)`：11
- `03: Dept2(LCMS)`：6
- `02: Dept1(Distribution)`：4
- `04: Dept3(Project Cargo)`：3
- `05: Dept3(Dangerous Goods)`：2
- `91: Others`：2

该分布以源表比例为基础，并为小部门设置至少2条样本，以保证全部部门可被演示和验证。

## 商机与时间线

- 状态：开放/赢单/丢单=`100/91/9`
- 案件名称：200/200唯一
- 每条案件：5–12条Timeline
- Timeline总数：1,800
- 精确重复：0
- 规范化唯一率：100%
- Appointment：448条，全部具有8段会议简报
- Signal：1,350条，来源全部存在，覆盖率75%

## 脱敏

- 客户名称与源表精确重合：0
- 案件名称与源表精确重合：0
- 案件说明与源表精确重合：0
- 年度预算金额与源表精确重合：0
- GUID/Email/电话号码/生产Hostname：0/0/0/0

## 工作簿

- 文件：`CRM_AI_Gateway_D365_Demo_200_v1.xlsx`
- 大小：828,128 bytes
- SHA-256：`8b5ccf042669b64a42652fde5cac901ffd599408a3dab5911cd884c0c2c9aacb`
- XLSX重导入：通过
- 公式错误：0
- Workbook Technical Validation Ready=`true`
- Workbook User Acceptance Ready=`false`
- Pilot Import Ready=`false`
