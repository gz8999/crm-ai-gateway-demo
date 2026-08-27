# Phase 3C-R5B3 Synthetic Probe Decision Pack

## 目的

本文件只是下一阶段的离线决策包，不构成外部调用授权。R5B2 已完成 V2 strict Tool Schema 节点完整性修复，但 `Provider Request Compatibility Ready=false` 必须保持到 R5B3 真实 Synthetic Probe 成功后。

## Probe 边界

- 使用 `DeepSeek Decision Tool Schema v2`。
- 只使用完全合成、非 D365、非 CRM、非真实 Canary 的 Fixture。
- Provider、模型和请求结构沿用已批准的 DeepSeek strict Tool Calling 配置。
- 最多一次外部请求，`Retry=0`，不自动 fallback。
- 不发送客户身份、联系人身份、GUID、精确金额、精确 GP、原始 Timeline、合同正文、Scenario ID 或 Golden Metadata。
- `CRM Writeback=false`、D365 GET=0、Production Requests=0。

## Probe 前置条件

1. 独立授权 R5B3 Synthetic Probe。
2. 重新核对服务端 Secret 状态，但不得把 Secret 写入报告、日志、Bundle 或请求回显。
3. 冻结 V2 request hash 和 V2 schema hash。
4. 在本地再次确认 `Missing Type/AnyOf/Ref=0`、`Missing Required=0`、`Missing additionalProperties=0`、`Unsupported Keyword=0`。
5. 首次响应必须同时通过 Transport、Tool Call、JSON、Schema、Evidence、Safety 和 Hallucination Audit。

## 停止条件

出现非法 JSON、Schema 失败、Evidence 不存在、敏感信息、编造 CRM 事实、需要 Retry、需要切换 Provider/Model 或需要 CRM 写回时，立即 fail-closed 并停止。不得将失败 Probe 计为 Provider Compatibility Ready。

## 预期结果

| 门禁 | R5B2 状态 | R5B3 成功后 |
| --- | --- | --- |
| DeepSeek Strict Schema Offline Ready | `true` | `true` |
| Provider Request Compatibility Ready | `false` | 由一次成功 Probe 证明 |
| Synthetic Probe Authorized | `false` | 需独立授权 |
| External LLM Calls | `0` | 最多 `1` |
| CRM Writeback | `false` | `false` |

不得在本阶段执行 Probe、真实 Canary、Model Comparison 或 CRM Writeback。
