# CRM AI Gateway 最终架构

## 数据与决策链

```text
D365 Frozen Dataset
  -> GET-only Read Adapter
  -> Department Filter
  -> Safe Context
  -> Deterministic Decision Engine
  -> Optional validated LLM Narrative Layer
  -> Safety / Evidence Validator
  -> Executive UI
```

正式运行时只使用测试环境的 200 条冻结 Demo 数据，当前范围为 60 Account、120 Contact、200 Opportunity、240 Coverage、130 Actual、1800 Timeline 和 1350 Interaction Signal，共 3900 条显式业务记录。

## 确定性层

Health Score v2、S/A/B/C/D/Z 等级、事实、推断、Evidence、风险、优先级、Portfolio KPI 和基础行动均由服务端确定性引擎产生。LLM 不得重算或覆盖这些结果，也不参与 CRM 写回。

## LLM 叙事层

外部模型只接收 Safe Context 的脱敏区间、派生信号和请求范围 Evidence Alias。模型只能返回 `demo-llm-narrative-contract-v1.json` 中的选择代码；服务端再将代码展开为中文叙事。原始响应、Tool Arguments、客户身份、GUID、精确金额和原始 Timeline 不落入公开产物。

本轮已使用完 16/16 的外部调用预算，其中 5 条场景快照已通过结构与安全验证并保存，8 场景语义验收和全量 LLM 快照尚未完成，因此外部 LLM 层保持 Pending。

## 产品边界

七个正式页面继续使用确定性 Decision Pack。第八个“深度分析”模块仅在 `VITE_FEATURE_DEEP_ANALYSIS=true` 且服务端 `FEATURE_DEEP_ANALYSIS=true` 的运行时显式开启；默认构建不显示入口。实时演示按钮必须用户确认，且仅允许已批准的单条调用。

## 安全状态

`CRM Writeback=false`、`Production Requests=0`、`Raw CRM Exposure=0`、`Exact Amount Sent=false`、`Raw Timeline Sent=false`。D365 读取失败时显示明确错误，不静默混入 Local Fixture。
