# Phase 3C-R5B5 Synthetic Probe Decision Pack

## 状态

- R5B4 外部调用：`0`
- R5B4 Provider Request Compatibility：`false`
- R5B5 Synthetic Probe：未执行
- 真实 Canary：未授权
- CRM Writeback：`false`
- Production Requests：`0`

## 下一次 Probe 建议

1. 如果下一次观测到 `finish_reason=length`，只建议增加 `max_tokens`，不得猜测或修复响应正文。
2. 如果 Tool Call 类型、函数名或 arguments 路径错误，先修复解析器并重新申请 Probe。
3. 如果 `finish_reason=tool_calls`、Tool Call 形状正确但 arguments 仍为非法 JSON，记录为 Provider Serialization Failure，并在获得独立授权后使用：
   - `thinking.type=disabled`
   - `temperature=0`
   - strict Tool Calling
   - `stream=false`
   - `Retry=0`

## 禁止事项

本决策包不授权新的外部调用、真实 Canary、Provider/Model 切换、Schema 降级、Fixture fallback、CRM 写回或生产部署。下一阶段必须重新执行安全预检，并且最多一次调用。
