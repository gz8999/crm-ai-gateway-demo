# Health Score Calibration Audit

## Baseline

- Contract: Opportunity Health Score Contract v1
- Component: health-score-engine-1.1.0
- Source commit: 5616845
- Dataset: 200 Opportunity / Won 91 / Active 100 / Lost 9
- Score digest: `5be880df50a466ba7ce6741593930acaf00a4349e68660f9759131c1c1f3fa7b`
- Contract hash: `e3bdaf5487a443a0d961f82fc16be17f3303e208521e750605ddc934636a56b1`

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
| Active | 100 | 71.98 | 72.7 | 5.41 | {"A":0,"B":61,"C":39,"D":0} |
| Lost | 9 | 61.87 | 60.47 | 1.89 | {"A":0,"B":0,"C":9,"D":0} |
| Won | 91 | 91.97 | 92.55 | 1.62 | {"A":91,"B":0,"C":0,"D":0} |

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
| engagement | 89.74 | 0.15 | 13.46 |
| risk | 82.06 | 0.15 | 12.31 |
| confidence | 90 | 0.05 | 4.5 |

## Status-masked test

- Score change mean/min/max: 0.07 / -2.5 / 18.8
- Changed score count: 161
- Changed grade count: 9
- Status leakage risk: Medium (state correlation 0.88, grade change rate 0.05)
- Active-only ranking remains available: true
- Conclusion: state is one evidence dimension, not the sole scoring input; masked scoring still uses safe business signals.

## Counterfactual and Active-only

- Monotonicity violations: 0
- State variants (same safe facts): Active 90.55, Won 92.55, Lost 71.25
- Active score range: 61.43–77.83; spread 16.4
- Active grade distribution: {"A":0,"B":61,"C":39,"D":0}
- Risk separation: {"riskyCount":39,"monitorCount":0,"riskyMean":65.79,"monitorMean":0,"separated":true}
- Healthy control: true

## Calibration conclusion

- Histogram: {"0-9.99":0,"10-19.990000000000002":0,"20-29.990000000000002":0,"30-39.99":0,"40-49.99":0,"50-59.99":2,"60-69.99":46,"70-79.99":61,"80-89.99":22,"90-100":69}
- Grade distribution: {"A":91,"B":61,"C":48,"D":0}
- D=0 explanation: 冻结数据最低分仍高于 D 等级下限；不为制造 D 等级而调整阈值。
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
