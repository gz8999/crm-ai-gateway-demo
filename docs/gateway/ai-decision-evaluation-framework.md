# AI Decision Quality Evaluation Framework

## 目标与边界

本框架用于评价 CRM AI Gateway 的 Decision Pack 是否有事实依据、证据可追溯、推断克制、置信度合理、行动可执行且符合安全边界。它是离线和只读评价能力，不改变 D365 数据、Schema、权限、Provider 规则或正式页面。

固定边界：`AI_PROVIDER=demo`、`ALLOW_EXTERNAL_AI=false`、CRM Writeback=0、External LLM Calls=0、Production Requests=0。评价引擎不接收 raw CRM object、Timeline 原文、精确金额、身份信息、GUID 或 Golden metadata。

本框架现已包含确定性 Opportunity Health Score 评价。Health Score 使用六个 Safe Context 维度进行加权计算，并与 Decision Pack 的事实、证据和安全契约分别校验；详见 `health-score-contract.md`。

## 评价链路

```text
D365 Frozen Dataset (GET only)
        |
        v
Department scope -> Safe Context Builder -> deterministic demoProvider
        |                                      |
        +-------------- Decision Pack ---------+
                         |
                         v
                  Evaluation Engine
                         |
        Contract / Facts / Evidence / Inference / Confidence / Actions / Safety
```

评价元数据位于 `docs/gateway/ai-scenario-evaluation-dataset.json`，只由显式评价脚本和测试读取。正式 `server/` 与 `src/` 运行链不导入该文件，也不导入 6C Golden fixture。

## 六项评分

每个页面输出得到 0–100 分，Decision Pack 总分为六项平均值：

| 维度 | 检查内容 |
| --- | --- |
| Fact Accuracy | 每个 Fact 的 source 存在于 Safe Context 或安全聚合，value 与源值一致 |
| Evidence Coverage | Evidence source 可追溯，且覆盖场景所需证据 |
| Inference Quality | 推断非空、引用允许的事实、满足场景要求，不出现禁止结论 |
| Confidence Quality | priority/confidence 与场景期望和数据质量信号一致，缺失或矛盾时不虚高 |
| Action Quality | Action 有标题、理由和 Draft only 状态，来自现有证据，不补造期限、负责人或 CRM 状态 |
| Safety Compliance | provider、安全布尔值、身份脱敏、精确金额和 Timeline 边界全部满足 |

报告同时记录：Unsupported Claim Count、Untraceable Evidence Count、Contract Violation Count。Decision accuracy 使用契约一致性代理指标，不宣称是真实赢单预测准确率。

## 场景评价

8 个现有场景均有输入安全信号、Expected Facts、Expected Evidence、Expected Priority、Expected Confidence、Required Actions 和 Forbidden Claims：

- stalled-high-value
- budget-actual-gap
- data-contradiction
- growth-opportunity
- location-route-risk
- meeting-prep
- multi-risk-priority
- healthy-control

Meeting Prep 只能使用 `meetingWindow`、`stakeholderCoverage`、`openQuestionCount`、`decisionReadiness` 等派生信号，不读取 Timeline 原文。Growth Opportunity 必须引用 Account 安全聚合并标记为 hypothesis。Location 场景只能建议内部核验。Healthy Control 只能返回 Monitor/High confidence，不制造 High 或 Critical 风险。

## 冻结数据抽样

评价脚本以固定 seed `20260718` 对 D365 Frozen Dataset 做 60 条确定性伪随机抽样，并强制覆盖 Won、Active、Lost 三种状态。脚本先读取全量 Safe Context，再在内存中评价 Decision Pack；不会为评价调用任何写 API。

## 安全验收

必须保持：

- `customerIdentityMasked=true`
- `exactAmountSentToModel=false`
- `rawTimelineSent=false`
- `crmWritebackEnabled=false`
- `externalLlmEnabled=false`
- GUID、身份、精确金额、raw Timeline、Scenario ID、Golden metadata 暴露为 0

## 执行方式

```text
npm run evaluate:quality
```

该命令要求当前环境已配置测试 Dataverse 只读连接；运行时由 Frozen Dataset hostname allowlist、Demo provider 和外部模型禁用门禁保护。没有有效配置时不应改用 Local Fixture 或静默降级。

## 完成门禁

- Evaluation Contract Ready=true
- 8 Scenario Dataset Ready=true
- Evaluation Engine Ready=true
- Baseline Rules Ready=true
- Decision Quality Report Ready=true
- Safety Validation Ready=true
- External LLM=false
- CRM Writeback=false
- Production Isolation=true

本阶段不启动 External LLM、Model Comparison、Production Deployment 或 CRM Writeback。
