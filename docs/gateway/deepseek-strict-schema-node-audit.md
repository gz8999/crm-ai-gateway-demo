# Phase 3C-R5B2 DeepSeek Strict Schema Node Audit

## 状态

本轮仅完成离线 Schema 修复与递归审计，不发起新的 Synthetic Probe，不访问 D365，不调用外部模型，不执行 CRM 写回。

| 项目 | 结果 |
| --- | --- |
| 基线 | `ca56fa0`（R5B1 synthetic probe stop） |
| DeepSeek Strict Schema Offline Ready | `true` |
| Provider Request Compatibility Ready | `false`，必须由后续 R5B3 Synthetic Probe 证明 |
| External LLM Calls R5B2 | `0` |
| D365 GET | `0` |
| CRM Writeback | `false` |
| Production Requests | `0` |

## 根因

R5B1 的 HTTP 400 明确指出 strict Tool 参数 Schema 中缺少 `type`、`anyOf` 或 `$ref`。冻结的 V1 Schema 在 enum-only 节点上只声明了 `enum`，因此不能满足 DeepSeek strict Tool 的节点契约。V1 文档、R2-R5B1 证据和历史结论保持不变。

V1 递归审计发现 8 个缺失节点：

```text
#/properties/confidence/properties/level
#/properties/recommendedActions/items/properties/draftStatus
#/properties/priority
#/properties/fallback/properties/state
#/properties/safety/properties/customerIdentityMasked
#/properties/safety/properties/exactAmountSentToModel
#/properties/safety/properties/rawTimelineSent
#/properties/safety/properties/crmWritebackEnabled
```

## 修复

新增 V2 Schema，保留统一合同字段、枚举值、Evidence 约束、Safety 字段、Action 字段和 `additionalProperties=false`。仅为 enum-only 节点补充由枚举值推导出的原始类型：字符串枚举使用 `type=string`，布尔枚举使用 `type=boolean`。V1 导出保持不变；V2 通过显式 `PHASE3C_SCHEMA_VERSION=v2` opt-in，默认仍使用 V1。

V2 不引入 `$ref` 或 `anyOf`，因此递归审计中的 Ref/AnyOf 数量为零并不表示跳过检查；linter 仍覆盖这些节点类型，并对 `$defs` 目标递归审计。纯 `$ref` 节点不会被强行附加兄弟约束。

## Linter 结果

| 指标 | V1 | V2 |
| --- | ---: | ---: |
| Total Schema Node Count | 41 | 41 |
| Typed Node Count | 33 | 41 |
| AnyOf Node Count | 0 | 0 |
| Ref Node Count | 0 | 0 |
| Missing Type/AnyOf/Ref Count | 8 | 0 |
| Object Count | 8 | 8 |
| Missing Required Count | 0 | 0 |
| Missing additionalProperties Count | 0 | 0 |
| Missing Array Items Count | 0 | 0 |
| Unsupported Keyword Count | 0 | 0 |
| V2 Schema Hash | `476cecc436dc452abc50988d337d779398159e8e0a4003bc8aa6153cbdab22b7` | |

## 验证范围

本轮本地 Synthetic Fixture 覆盖 enum-only、enum+type、array items、anyOf 分支、`$defs`、纯 `$ref`、嵌套额外属性、缺失必填字段、Evidence 引用、Canonical Mapping 和“不得补造事实”。V2 请求构造为显式 opt-in，未发起网络请求。

## 下一步边界

R5B3 如获独立授权，可使用 V2 Schema 进行最多一次 Synthetic Probe，Retry 必须为 0；在 Probe 成功前不得将 `Provider Request Compatibility Ready` 改为 `true`，也不得进入真实 Canary、Model Comparison 或 CRM Writeback。
