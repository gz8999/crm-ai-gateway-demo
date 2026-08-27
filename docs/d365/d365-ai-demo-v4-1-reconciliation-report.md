# CRM AI Gateway D365 中文 Demo 数据 v4.1 修正报告

## 文件

- 原始 v4：保持不变
- 原始 v4 SHA-256：`f08a94a3caa62950dbaa96e2767e39afe6c79072296394db9d8736a3b2f683fd`
- 派生 v4.1：`CRM_AI_Gateway_D365_Chinese_Demo_Data_v4_1.xlsx`
- v4.1 大小：732,677 bytes
- v4.1 SHA-256：`1447d01c62e8e692c871ff9b0189a11bfc8eb48457a7eb47e09509878747b268`

## 已修正

1. Opportunity Contact Lookup
   - `primarycontactid` → `parentcontactid`
   - 150 条 Contact Token 保持不变。

2. Opportunity Detail
   - Value `91`
   - `91: Others` → `91: 其他`
   - 30 条。

3. Goods — 医疗器械
   - 错误 Value/Label：`21 / 21: 医疗器械`
   - 修正为：`20 / 20: 医疗器械`
   - 12 条。

4. Goods — 其他
   - Value `91`
   - `91: Others` → `91: 其他`
   - 66 条。

5. Global Initiative
   - Value `91`
   - `91: Others` → `91: 无`
   - 150 条。

## 保持不变

- Account/Contact/Opportunity/Actual/Coverage/Timeline/Signal：
  `30/60/150/100/210/1400/1050`
- 总业务数据：3,000
- 稳定 Token、父子关系、部门分布、场景分布
- Timeline 与 Interaction Signal 业务内容
- Dataverse 写入：0
- 生产请求：0
- 外部 LLM：0

## 验证

- `parentcontactid`：存在
- `primarycontactid`：不存在
- 医疗器械 Value 20：12 条
- Goods Value 21：0 条
- Detail 91 标签冲突：0
- Goods 91 标签冲突：0
- Global Initiative 91 标签冲突：0
- XLSX 重导入：通过
- 公式错误扫描：0

## 剩余阻断

P0/P1/P2=`0/3/1`

P1：

1. `OWNER-DEMO-01..06` 尚无批准的 Active Owner 映射；
2. `DEPT-01/03/04` 尚无批准的三个不同 Active Team 映射；
3. 3 Account Pilot 无法覆盖五个强制场景。

P2：

- Opportunity Type 与 Case Stage 使用用户批准的简化中文显示标签，不阻断 Pilot 设计。

## 门禁

- Workbook Technical Validation Ready=`true`
- Contact Lookup Contract Ready=`true`
- Choice Metadata Contract Ready=`true`
- Lookup Resolution Ready=`false`
- Pilot Dataset Defined=`false`
- Pilot Import Ready=`false`
- Pilot Import Authorized=`false`
