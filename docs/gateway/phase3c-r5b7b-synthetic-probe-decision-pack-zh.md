# Phase 3C-R5B7B Synthetic Probe 决策包

本文件只生成下一阶段建议，不执行外部请求。

## 固定请求合同

- Provider、Model、Endpoint、Prompt 和 DeepSeek Strict Tool Schema V2 保持 R5B6 不变
- `max_tokens=2400`
- `thinking.type=disabled`
- `temperature=0`
- `stream=false`
- `strict=true`
- `Retry=0`
- 仅一次 Synthetic Probe
- 不发送 `response_format`

## 输入限制

输入必须满足：`testOnly=true`、`syntheticProbe=true`、`d365Record=false`、`runtimeEligible=false`、`realCanary=false`，且 Real CRM Token 与 Forbidden Field 均为 0。不得使用真实 Safe Context、真实 Canary、Scenario/Golden metadata、身份、GUID、精确金额或原始 Timeline。

## 失败处理

若下一次响应非法：

1. 仅在 Synthetic-only 门禁通过时捕获原始 `arguments`；
2. 写入 `local-artifacts/gateway/phase3c-r5b7/`，权限 `0600`；
3. 立即执行一次性 JSON 语法诊断；
4. 不修复、不重试、不进入业务评价；
5. 记录 Hash、分类、offset、行列和私有窗口；
6. 诊断完成后删除原文，并保留删除证据。

## 本阶段状态

- Synthetic Probe Authorized: `false`
- Synthetic Probe Executed: `false`
- External LLM Calls: `0`
- Provider Request Compatibility Ready: `false`
- CRM Writeback: `false`
- Production Requests: `0`

R5B7A 只证明隔离和诊断能力，不证明 Provider 兼容性。下一次 Probe 需独立授权。
