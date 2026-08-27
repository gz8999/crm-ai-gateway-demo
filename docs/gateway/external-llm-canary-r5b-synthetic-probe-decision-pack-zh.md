# Phase 3C-R5B Synthetic Probe Decision Pack

## Status

本文件只是一份后续决策包，不是执行授权。R5A 未选择或调用新的真实 Canary，也未进行外部模型请求。

## Proposed Boundary

R5B 如获得独立授权，先使用项目内完全 synthetic 的非 CRM fixture 验证 Provider Tool Calling 外形。Probe 不读取 D365、Dataverse、Legacy 数据或真实客户信息，不使用真实 Opportunity Token，不进入 Model Comparison，不写回 CRM。

## Required Canary Shape

- 已消耗的两条记录必须排除；
- 保留现有未消耗集合中的 22 条覆盖候选；
- 自动补入 2 条 synthetic replacement，以维持原观察维度覆盖；
- 新 Contract Canary 必须由稳定排序自动选择，不得人工指定；
- 先执行 1 条 Contract Canary，严格单次请求；其余请求必须在 Contract、Safety、Evidence 和 Hallucination 检查全部通过后另行确认。

## Probe Payload

仅允许：

- Safe Context v2 的脱敏字段形状；
- provider/model/version 元数据；
- `DeepSeek Decision Tool Schema v1`；
- 通用分析指令。

禁止：

- raw CRM、客户或联系人身份、GUID、精确金额、原始 Timeline、合同内容；
- Scenario ID、Golden metadata、expected answer；
- API Key、Authorization Header、完整 Prompt 或完整响应正文进入日志/报告；
- CRM 写回、邮件、Activity、生产请求。

## Required Evidence Capture

若后续授权执行，必须保存脱敏的 HTTP status、Provider error code/type/param/message（如响应提供），request token、latency、usage、cost 和 safety result。响应体缺失时必须显式记录 `Provider Error Body Observability Gap=true`，不得重试同一请求补采集。

## Recommendation

当前不建议自动进入 R5B。先由人工确认 Provider 错误正文的安全观测方式和独立调用授权，再启动仅 synthetic 的 Contract Probe。R5A 已完成离线 schema 修复，但没有把离线通过误报为 Provider live compatibility 已确认。
