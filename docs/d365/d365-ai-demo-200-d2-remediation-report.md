# Demo200 D2 离线修复报告

## 输入完整性

- 权威 v1：`CRM_AI_Gateway_D365_Demo_200_v1(1).xlsx`
- Size：828128 bytes
- SHA-256：`8b5ccf042669b64a42652fde5cac901ffd599408a3dab5911cd884c0c2c9aacb`
- 原文件未覆盖。

## 已完成

1. **自然语言与 Choice 分离**
   - `客户需求`、`提案内容`继续作为业务叙述。
   - 新增 Customer Need / Proposal Content 技术 Value、Metadata Label 和派生依据。
   - 200/200 均有合法 Choice；Unknown=`0`。
   - LCMS 电脑采购映射到“其他系统”，TMS 使用数=`0`。

2. **三个自定义表 Primary Name**
   - Actual=`130/130`
   - Coverage=`240/240`
   - Signal=`1350/1350`
   - 重复=`0`，长度超过200=`0`。

3. **POL/POD**
   - Distinct Exact=`6`
   - Distinct Normalized=`5`
   - Distinct OTR Fallback=`10`
   - Blocked=`0`
   - 原始机场/港口标签保留；OTR不声明为精确匹配。

4. **Coverage语义**
   - Service Type映射到较宽Metadata值时，通过`aigw_name`和`aigw_notes`保留原服务类别。

5. **Compact Pilot**
   - MILP最优解：Account=`7`、Contact=`9`、Opportunity=`24`
   - Actual/Coverage/Timeline/Signal=`12/15/206/154`
   - 覆盖7个销售部门、8个核心场景、开放/赢单/丢单及全部要求业务类型。

## 产物

- v1.1：`CRM_AI_Gateway_D365_Demo_200_v1_1.xlsx`
- Projection Candidate：`CRM_AI_Gateway_D365_Demo_200_ProjectionCandidate_v1.xlsx`

## 剩余阻断

P0/P1/P2=`0/2/3`

P1：

1. Owner Mapping尚未批准；
2. 七个部门Team尚未创建或批准。

因此：

- Projection Candidate Generated=`true`
- Import Projection Ready=`false`
- Pilot Workbook Generated=`false`
- Pilot Import Ready=`false`
- Pilot Import Authorized=`false`
