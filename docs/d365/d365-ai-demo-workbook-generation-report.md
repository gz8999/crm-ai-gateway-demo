# Phase 1C-5R2G-B 中文 Demo 数据工作簿生成报告

> **Historical status:** 本报告记录的 v2 工作簿已被用户拒绝，仅保留为历史证据。v3 已由 v4 取代；当前权威工作簿是 `artifacts/d365/CRM_AI_Gateway_D365_Chinese_Demo_Data_v4.xlsx`。不得使用本报告中的 v2 `Workbook Acceptance Ready` 作为导入门禁。

## 结果

- Workbook Generated: **true**
- Workbook Acceptance Ready: **true**
- Offline Workbook Generation Completed: **true**
- Demo Data Generation Completed: **true**
- Pilot Import Ready: **false**
- Full Import Ready: **false**
- Dataverse Requests: **0**
- External LLM Calls: **0**
- Workbook: `artifacts/d365/CRM_AI_Gateway_D365_Chinese_Demo_Data_v2.xlsx`
- Size: **536331 bytes**
- SHA-256: `15784d514287cc8c590325845d94cf79600af7daf324f6ad306b1744145cd6ba`

## 规模

| Account | Contact | Opportunity | Actual | Coverage | Timeline | Signal | Total |
|---:|---:|---:|---:|---:|---:|---:|---:|
|30|60|150|100|210|1400|1050|3000|

Opportunity 状态为 Active/Won/Lost=60/55/35。Actual 分配为 Won/Active/Lost=55/45/0，每 Opportunity 最多一条。

## 场景

八场景分布固定为 15/15/12/12/10/10/16/10，合计100；背景业务50。Scenario和Golden信息只在ScenarioManifest，未写入CRM数据表。

## 关系与完整性

- 每个Account精确2个Contact和5个Opportunity。
- Coverage每Account 7条，真实复合Key契约已应用；空Start Date使用Demo Token与规范化冲突键验证。
- Timeline=1400，Signal=1050，映射覆盖率=75%。
- 12组Choice/75 Options与冻结Manifest深比较通过。
- Unknown CRM Logical Names=0。
- Import Token和Cleanup均覆盖3000条；Location/POL-POD不在Cleanup中。

## 安全

工作簿不包含Dataverse GUID、真实客户身份、邮箱、电话、地址、生产hostname、凭据、Dataverse payload、Email数据或外部模型答案。Location与POL/POD只使用冻结源业务键；Safe Context样本不包含这些原值、精确金额或Timeline原文。

## 问题

P0/P1/P2=0/0/0。无阻断项。工作簿仍须在单独阶段完成Metadata预检与Pilot Import授权。
