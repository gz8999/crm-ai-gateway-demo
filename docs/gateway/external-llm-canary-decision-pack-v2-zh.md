# External LLM Canary Decision Pack（离线准备）

本文件仅用于未来人工审批前的离线决策包准备。未发送给任何外部 Provider，不进入 Runtime Safe Context，不包含 Dataverse GUID、客户身份、精确金额或 Timeline 原文。

## 当前状态

- Canary records: 24 条安全 Token（见 selection manifest）
- 八场景校准：通过；healthy-control=A；风险等级覆盖=B/C/D/Z
- External LLM Calls: 0
- External LLM Canary Authorized: false
- 默认 Provider: deterministic
- Model Comparison: Not Executed

## 八类离线评价镜头

| Scenario | Required Facts | Required Evidence | Required Actions | Confidence expectation | Forbidden claims |
| --- | ---: | ---: | ---: | --- | ---: |
| stalled-high-value | 2 | 1 | 1 | High | 4 |
| budget-actual-gap | 2 | 1 | 1 | High | 3 |
| data-contradiction | 2 | 1 | 1 | Low | 2 |
| growth-opportunity | 2 | 2 | 1 | Medium | 3 |
| location-route-risk | 2 | 1 | 1 | Medium | 4 |
| meeting-prep | 2 | 2 | 1 | Medium | 4 |
| multi-risk-priority | 2 | 2 | 1 | Medium | 2 |
| healthy-control | 2 | 1 | 1 | High | 4 |

Future external evaluation must use the same Safe Context request contract and score responses only after they return. Scenario IDs, Golden metadata and expected answers remain evaluation-only and must never enter Provider payload.
