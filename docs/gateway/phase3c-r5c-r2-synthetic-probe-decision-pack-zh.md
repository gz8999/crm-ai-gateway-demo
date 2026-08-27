# Phase 3C-R5C-R2 Synthetic Probe 决策包

## 当前状态

- Transport v4 / `v6-r3` 离线修复：**Ready**
- Provider Request Compatibility Ready：**false**
- Synthetic Probe Authorized：**false**
- Real Canary Authorized：**false**

## 建议的下一步

仅在新的独立人工授权下执行完全合成、非 CRM 的 Probe：

- External LLM Calls：最多 `2`，用于相同请求的重复性验证；
- Provider / Model / Endpoint：保持当前批准配置；
- Profile：`v6-r3`；
- Transport：Provider Transport Contract v4；
- `thinking.type=disabled`；
- `temperature=0`；
- `max_tokens=2400`；
- `stream=false`；
- `strict=true`；
- `Retry=0`；
- 不发送 `response_format`；
- D365 GET=0；
- CRM Writeback=false；
- Production Requests=0。

两次响应都必须一次 `JSON.parse` 成功，并通过 Schema、Canonical Mapping、Evidence、Safety 和 Hallucination Audit。任一次失败立即停止，不修复、不重试。

即使 Synthetic Probe 通过，也不得自动继续真实 Canary。真实 Canary 仍需新的独立授权。
