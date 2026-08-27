# Health Score v2 Calibration Report

## Baseline

- Contract: Opportunity Health Score Contract v2
- Component: health-score-engine-2.0.0
- Thresholds: S≥90 / A≥80 / B≥70 / C≥60 / D≥50 / Z<50
- Source commit: fce2bd6
- Dataset: 200 Opportunity / Won 91 / Active 100 / Lost 9
- Score digest: `e72abddd40ecd94cfdbae1f8d9fefbfd613e212d9a4c0f7ff14d23af6ca86f70`
- Contract hash: `7ccf36b40017a4ee3b32f9508026dc7ebdefbca05eec750a4a657984b3cd5e2c`

## Determinism

| Check | Result |
| --- | --- |
| Repetitions | 3 |
| Score Difference Count | 0 |
| Grade Difference Count | 0 |
| Evidence Difference Count | 0 |
| Ranking Difference Count | 0 |
| Ready | true |

## State and feature audit

Status correlation is an audit signal, not a claim of causality. Safe Context intentionally excludes exact amounts, identity and raw Timeline.

| State | Count | Mean | Median | Std Dev | Grades |
| --- | ---: | ---: | ---: | ---: | --- |
| Active | 100 | 71.98 | 72.7 | 5.41 | {"S":0,"A":0,"B":61,"C":39,"D":0,"Z":0} |
| Lost | 9 | 61.87 | 60.47 | 1.89 | {"S":0,"A":0,"B":0,"C":7,"D":2,"Z":0} |
| Won | 91 | 91.95 | 92.55 | 1.64 | {"S":68,"A":23,"B":0,"C":0,"D":0,"Z":0} |

| Feature | Spearman rank correlation to health score |
| --- | ---: |
| opportunityState | 0.88 |
| stage | 0 |
| actualPresence | 0.52 |
| closePresence | 0.72 |
| department | 0.07 |
| amountBand | 0 |
| timelineDensity | 0.49 |
| signalDensity | 0.49 |
| coverage | 0 |

| Dimension | Average | Weight | Weighted contribution |
| --- | ---: | ---: | ---: |
| pipeline | 77 | 0.25 | 19.25 |
| completeness | 71.41 | 0.2 | 14.28 |
| profitability | 84.09 | 0.2 | 16.82 |
| engagement | 89.69 | 0.15 | 13.45 |
| risk | 82.06 | 0.15 | 12.31 |
| confidence | 90 | 0.05 | 4.5 |

## Status-masked test

- Score change mean/min/max: 0.07 / -2.5 / 18.8
- Changed score count: 161
- Changed grade count: 11
- Status leakage risk: Medium (state correlation 0.88, grade change rate 0.06)
- Active-only ranking remains available: true
- Conclusion: state is one evidence dimension, not the sole scoring input; masked scoring still uses safe business signals.

## Counterfactual and Active-only

- Monotonicity violations: 0
- State variants (same safe facts): Active 90.55, Won 92.55, Lost 71.25
- Active score range: 61.43–77.83; spread 16.4
- Active grade distribution: {"S":0,"A":0,"B":61,"C":39,"D":0,"Z":0}
- Risk separation: {"riskyCount":39,"monitorCount":0,"riskyMean":65.79,"monitorMean":0,"separated":true}
- Healthy control: true

## Eight scenario validation

| Scenario | Default safe token | Score | Grade | Confidence | Key risks |
| --- | --- | ---: | --- | --- | ---: |
| stalled-high-value | DEMO-6C-OPP-001 | 50.15 | D | High | 4 |
| budget-actual-gap | DEMO-6C-OPP-016 | 70.9 | B | High | 2 |
| data-contradiction | DEMO-6C-OPP-031 | 50.05 | D | Low | 4 |
| growth-opportunity | DEMO-6C-OPP-043 | 74.2 | B | High | 1 |
| location-route-risk | DEMO-6C-OPP-055 | 69.7 | C | High | 3 |
| meeting-prep | DEMO-6C-OPP-065 | 71.05 | B | High | 2 |
| multi-risk-priority | DEMO-6C-OPP-075 | 37.87 | Z | Low | 4 |
| healthy-control | DEMO-6C-OPP-091 | 85.65 | A | High | 0 |

- Healthy control S/A: true (A)
- Risk grade coverage C/D/Z: true (B/C/D/Z)
- Scenario IDs remain offline evaluation metadata and never enter runtime Safe Context or Provider input.

## Calibration conclusion

- Histogram: {"0-9.99":0,"10-19.990000000000002":0,"20-29.990000000000002":0,"30-39.99":0,"40-49.99":0,"50-59.99":2,"60-69.99":46,"70-79.99":61,"80-89.99":23,"90-100":68}
- Grade distribution: {"S":68,"A":23,"B":61,"C":46,"D":2,"Z":0}
- D/Z distribution explanation: 冻结数据包含 D/Z 风险等级，等级差异由安全业务信号和六维贡献共同形成。
- Health Score Recalibration Required: false

## Health Score and Confidence separation

- High health / Low confidence: 0
- Low health / High confidence: 9
- Quality flags lowering confidence: 100
- Separation ready: true

## Canary

- Selected safe-token records: 24
- D365 runtime GET: 179
- External LLM calls: 0
- Production requests: 0
- Scenario IDs and Golden metadata are not present in runtime provider input.
