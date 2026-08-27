# AI Decision Quality Report

## Scope

本报告由只读评价脚本生成。评价输入为 D365 Frozen Dataset 的 Safe Context 与 Decision Pack；不读取原始 Timeline 正文，不调用外部 LLM，不执行 CRM 写回。

- Dataset: D365 Frozen Dataset
- Scope: 200 条 Opportunity
- Deterministic sample: 60 条，seed=20260718
- Sample state coverage: Won 25 / Active 32 / Lost 3
- Runtime provider: demo
- Safe Context: enabled
- External LLM calls: 0
- CRM writeback: 0

## Evaluation Contract

每个页面输出均按 Fact Accuracy、Evidence Coverage、Inference Quality、Confidence Quality、Action Quality 和 Safety Compliance 六个维度评分，分数范围为 0–100。总体分数为六项算术平均。样本中的“Decision accuracy”是契约一致性代理指标，要求事实、证据、契约和安全检查通过，不把它表述为真实业务赢单准确率。

## Frozen Dataset Sample Result

| Dimension | Score |
| --- | ---: |
| factAccuracy | 100 |
| evidenceCoverage | 100 |
| inferenceQuality | 100 |
| confidenceQuality | 84.3 |
| actionQuality | 100 |
| safetyCompliance | 100 |
| Overall | 97.38 |

- Contract-ready outputs: 60/60
- Decision accuracy proxy: 60/60
- Unsupported claim count: 0
- Untraceable fact count: 0
- Untraceable evidence count: 0
- Contract violation count: 0

## Eight Scenario Validation

离线场景期望值仅用于本报告和测试，未进入 Gateway runtime、Safe Context 或 Provider 输入。

| Scenario | Result | Overall | Unsupported claims |
| --- | --- | ---: | ---: |
| stalled-high-value | PASS | 97.5 | 0 |
| budget-actual-gap | PASS | 97.5 | 0 |
| data-contradiction | PASS | 97.5 | 0 |
| growth-opportunity | PASS | 97.5 | 0 |
| location-route-risk | PASS | 97.5 | 0 |
| meeting-prep | PASS | 97.5 | 0 |
| multi-risk-priority | PASS | 97.5 | 0 |
| healthy-control | PASS | 99.58 | 0 |

- Scenario pass: 8/8
- Healthy control must remain Monitor/High confidence and not escalate; this is enforced by the offline scenario assertions.

## Health Score v2 Validation

Health Score v2 由 Safe Context 的六个安全维度确定性计算，采用 S/A/B/C/D/Z 六级，不读取原始 CRM 对象，不调用外部模型。

- Scored opportunities: 200
- Average / minimum / maximum: 80.61 / 59.8 / 93.22
- Grade distribution: S 68 / A 23 / B 61 / C 46 / D 2 / Z 0
- Health Score Deterministic: true
- Evidence Coverage Ready: true
- 200 Opportunity Scoring Ready: true
- Evaluation Framework Integrated: true

## Safety Validation

- customerIdentityMasked=true
- exactAmountSentToModel=false
- rawTimelineSent=false
- crmWritebackEnabled=false
- externalLlmEnabled=false
- GUID/identity/raw Timeline exposure=0 in the evaluated public contract
- Production requests=0

## Runtime Readback

- Accounts=60; Contacts=120; Opportunities=200
- Actual=130; Coverage=240; Timeline=1800; Signal=1350
- OpportunityClose=100; BPF=200
- State distribution: Won=91, Active=100, Lost=9
- Last sync=2026-07-18T17:25:53.549Z

## Limitations

本阶段建立的是确定性、可重放的决策质量基线。Inference quality 和 Action quality 评价的是 Safe Context 约束、证据链和输出契约，不替代人工业务判断，也不声称预测真实客户行为。External LLM、Model Comparison、CRM Writeback 和生产部署仍未启用。

## Goal 3B-Final Health Score v2 Addendum

- Baseline contract: Opportunity Health Score Contract v2
- Contract hash: `7ccf36b40017a4ee3b32f9508026dc7ebdefbca05eec750a4a657984b3cd5e2c`
- Score Difference Count: 0
- Evidence Difference Count: 0
- Ranking Difference Count: 0
- Active-only spread: 16.4
- Monotonicity violations: 0
- Scenario calibration ready: true
- Risk C/D/Z coverage: true
- Canary safe-token count: 24
- External LLM Calls: 0
- External LLM Canary Authorized: false
- Health Score Calibration Ready: true
