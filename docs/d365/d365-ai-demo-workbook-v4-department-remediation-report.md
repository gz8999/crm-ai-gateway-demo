# CRM AI Gateway D365 中文 Demo 数据 v4 修复报告

## 本轮修复

根据用户确认的实际部门业务关系，重新设计了全部 150 条商机及其 Timeline/Signal：

- `01: Dept1(Industry)`：国内合同物流，108 条。
- `03: Dept2(LCMS)`：电脑采购及系统安装，30 条。
- `04: Dept3(Project Cargo)`：重型设备出口安装搬运，12 条。

## Department / Booking 关系

- Dept1 → `01: Domestic Div.` 或 `26: Domestic Div East Shanghai WH`
- Dept2 → `26: Domestic Div East Shanghai WH`
- Dept3 → `02: International Div.` 或 `09: Shanghai Ocean Export`

全量 150/150 通过。

## 案件详细信息

- Dept1：仓库运营 45、运输 42、物流咨询 21。
- Dept2：Others 30。
- Dept3：项目物流 12。
- `06: LCMS（运输管理系统）`：0 条。

## 案件名称与案件信息

- 案件名称 150/150 唯一。
- 名称、描述、客户需求、项目范围均按部门主营业务生成。
- 案件类型仅使用：新增、现有、现有-新增、其他。
- 案件状态仅使用：信息录入、可行性研究/报价、客户访问演示、提交报价、收到订单。

## Timeline 与 Signal

- Timeline：1,400 条。
- 精确重复：0。
- 规范化唯一率：98.93%。
- 会议简报：370 条。
- Signal：1,050 条，全部重新与新业务内容对齐。

## 安全与门禁

- Dataverse 请求：0。
- External LLM 调用：0。
- GUID：0。
- 生产环境 hostname：0。
- P0/P1/P2：0/0/0。
- Workbook Technical Validation Ready：true。
- Workbook User Acceptance Ready：false。
- Pilot Import Ready：false。
