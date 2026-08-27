# Phase 3C-R5A Error Diagnosis

## Scope

本阶段仅做离线兼容性修复与本地验证，不发起新的外部模型请求，不读取新的 CRM 数据，不执行 CRM 写回。

R2、R3、R4 历史报告保持原样。R4 的唯一请求为已消耗的 `DEMO-OPP-002`，本诊断不重试该记录。

## R4 Sanitized Evidence

| Item | Result |
| --- | --- |
| HTTP status | 400 |
| Provider error code | unavailable; not stored |
| Provider error type | unavailable; not stored |
| Provider error param | unavailable; not stored |
| Provider error message | unavailable; not stored |
| Request token | `PHASE3C-R4-CONTRACT-01` |
| Provider / model | openai-compatible / `deepseek-v4-pro` |
| Native mode | strict Tool Calling |
| Attempts | 1 |
| Response contract | not reached |
| CRM writeback | false |
| Production requests | 0 |
| Provider error body | not stored in R4 audit |

`Provider Error Body Observability Gap=true`。现有 R4 审计只保留状态码、请求摘要哈希、延迟和安全统计，没有保存 Provider 错误正文、Authorization、完整请求体或 Safe Context。R5A 不通过重发请求补日志，因此无法把 HTTP 400 的具体 Provider 错误码、参数或消息确认成事实。

## Request Shape Audit

R4 strict request 的结构审计基于已部署代码和本地请求契约完成，未读取或打印任何运行时密钥：

- 顶层业务请求键：`model`、`messages`、`tools`、`tool_choice`、`temperature`、`max_tokens`、`thinking`、`stream`。
- 单一 Tool：`emit_decision_pack`。
- `function.strict=true`。
- `tool_choice` 强制选择同名 function。
- strict mode 不同时发送 `response_format`。
- `thinking.type=disabled`，`stream=false`，单次调用由运行门禁约束。

## Compatibility Assessment

R4 之前的 Tool 参数复用了统一响应 schema。该 schema 含 Provider 专用 strict subset 中不应依赖的长度/数组数量约束、`const` 和可空/空对象表示风险。由于 R4 没有保存 Provider 错误正文，本文只把这些列为兼容性风险，不声称它们是 400 的已证实单一根因。

R5A 新增独立 `DeepSeek Decision Tool Schema v1`，只使用结构化对象、数组、字符串、枚举和布尔枚举等严格子集；每个 object 都完整列出 `required` 并设置 `additionalProperties=false`。Provider 的 `draftStatus` 由服务端映射为统一合同的 `status`，不生成事实、不改变 Evidence 语义。

## Historical Boundary

已消耗且不得重试：

- `DEMO-OPP-001`
- `DEMO-OPP-002`

下一阶段如获独立授权，必须从未消耗集合中保留 22 条并自动补入 2 条替代记录。本阶段不冻结、不选择、不调用新的 Canary。

## Gate Result

- R4 Failure Evidence Preserved=true
- Provider Error Body Ready=false
- Provider Error Observability Gap=true
- DeepSeek Strict Request Shape Ready=true（离线）
- External LLM Calls R5A=0
