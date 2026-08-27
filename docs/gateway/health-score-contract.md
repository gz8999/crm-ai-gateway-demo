# Opportunity Health Score v2 Contract

## Purpose

Health Score 是 Gateway 第一层的确定性决策信号，用于把安全 CRM 事实整理成可解释的健康度、风险排序和待复核顺序。它不是赢单概率，不写回 CRM，也不调用外部 LLM。

## Input Boundary

Engine 只接受 `SafeDecisionContext`。输入必须是经过部门权限过滤、身份脱敏、金额区间化和 Timeline 派生后的安全字段。以下内容不得进入引擎：精确金额、月度明细、客户或联系人身份、GUID、原始 Timeline、描述正文、Golden metadata 和 Scenario ID。

## Dimensions And Weights

| Dimension | Weight | Meaning |
| --- | ---: | --- |
| pipeline | 25% | 阶段、相对日期、停滞和下一步信号 |
| completeness | 20% | 缺失事实、矛盾信号、关键角色和决策准备度 |
| profitability | 20% | 毛利区间、预算/实绩偏差区间和实绩可用性 |
| engagement | 15% | 互动信号、关键角色覆盖、会议窗口和待确认问题 |
| risk | 15% | 优先级、逾期、停滞、矛盾、缺失和路线一致性 |
| confidence | 5% | 证据质量、缺失程度和覆盖广度 |

各维度范围为 0–100。总分为加权和并保留两位小数。

## Grade

| Score | Grade | 中文说明 |
| ---: | --- | --- |
| 90–100 | S | 卓越 |
| 80–89.99 | A | 健康 |
| 70–79.99 | B | 稳定 |
| 60–69.99 | C | 需关注 |
| 50–59.99 | D | 高风险 |
| 0–49.99 | Z | 严重风险 |

## Output Contract

每条结果包含 `healthScore`、`grade`、六项 `dimensions`、优势、风险、建议行动和六条证据。每条证据必须带有可回溯到 Safe Context 或安全聚合的 `source`。建议行动保持 `Draft only`，不创建任务、不分配负责人、不生成无依据期限。

## Calibration And Confidence

Health Score v2 由 `health-score-engine-2.0.0` 按 `six-dimensions-v1` 权重确定性计算，并将分数划分为 S/A/B/C/D/Z 六级。`confidence`、`evidenceCoverage` 和 `dataQualityStatus` 是独立的证据质量输出，不是健康分数的别名，也不得被解释为赢单概率。缺失、矛盾、互动稀疏或覆盖狭窄时，置信度可以下降而健康分保持不变。

冻结校准必须记录评分契约、源 Commit、数据集状态分布、分数摘要和稳定排序摘要。反事实检查使用中性安全上下文验证停滞、逾期和矛盾信号的单调方向；状态只作为一个证据维度，不得成为唯一排序依据。

固定安全标记：

- `deterministic=true`
- `safeContextUsed=true`
- `externalModelCalled=false`
- `rawDataSent=false`

## Ranking And Integration

风险队列先按既有优先级排序，再按 Health Score 从低到高排序，最后以稳定 Opportunity Token 作为平局键。组合模式返回当前范围的健康排名和 S/A/B/C/D/Z 分布；场景模式只统计当前场景范围。页面展示分数、等级、六维解释和证据来源，不显示原始 CRM 数据。

## Evaluation Gates

- Health Score Deterministic=true
- Evidence Coverage Ready=true
- 200 Opportunity Scoring Ready=true
- Evaluation Framework Integrated=true
- Raw CRM Exposure=0
- External LLM=false
- CRM Writeback=false

这些门禁由 `evaluate:quality` 对 D365 Frozen Dataset 的 200 条只读 Safe Context 执行，并写入 `ai-decision-quality-report.md`。
