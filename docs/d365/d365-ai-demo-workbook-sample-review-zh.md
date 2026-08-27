# 中文 Demo 工作簿抽样审查

## 抽样范围

抽样14条Opportunity：八个核心场景默认记录各1条、healthy-control额外2条、背景业务4条。每条同时检查Account、Contact、Coverage、Timeline、Signal和Safe Context摘要。

## 质量结论

- **中文自然度**：通过。标题、需求、行动和活动摘要使用简体中文业务表达，没有真实企业或人员信息。
- **故事连续性**：通过。Timeline按日期推进，从需求、方案、异议/承诺到阶段小结；每条至少3种活动类型。
- **场景差异**：通过。停滞、预算偏差、数据矛盾、增长、路线、会前、多风险和健康对照使用不同事实组合。
- **数据自洽**：通过。状态、Actual分配、预算/实绩、Coverage历史和Signal映射相互一致。
- **模板化重复**：未发现阻断性重复。所有活动由稳定阶段词汇与场景子句组合，但保留统一审计语言，这是受控Demo的一致性设计。
- **healthy-control**：10条均为Monitor，不含High/Critical或人为缺失风险。
- **字段分离**：CRM Fact与Validation Only在抽样表中分栏；未展示外部模型答案。

## 安全复核

Safe Context样本仅包含token、类别、band、相对日期状态和计数区间，不含身份、GUID、精确金额、Location/POL/POD原值或Timeline原文。
