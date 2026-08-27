# Phase 3C-R5B11-R2 Synthetic Probe 决策包

## 当前状态

离线修复已完成，但本文件不构成外部调用授权。

- `Provider Transport Contract v3`：已就绪
- DeepSeek Profile：`v6-r2`
- Provider Request Compatibility Ready：`false`
- Synthetic Probe Authorized：`false`
- Real Canary Authorized：`false`

## 建议验证顺序

后续需单独授权两次完全合成、非 CRM 的 Strict Tool Probe：

1. Contract Probe：最多一次请求，验证 HTTP、Tool Call、单次 JSON.parse、v3 Schema、Evidence、Canonical Mapping 和 Safety。
2. Repeatability Probe：仅在 Contract Probe 全部通过后执行，使用完全相同的 Provider、Model、Endpoint、Prompt、Synthetic 输入、Schema Hash 和输出预算。

任一 Probe 失败立即停止，不重试、不切换 Provider/Model、不降级 Schema、不修复响应后计为成功。

## 固定请求边界

- 仅使用完全合成输入和 Safe Evidence Catalog。
- `safeEvidenceCatalog` 只包含 Evidence Token 与安全 Evidence Type。
- `riskCategories` 只能使用请求级 Schema 中出现的类别和兼容 Token 组合。
- 六项 `policyAssertions` 必须全部存在并匹配固定布尔值。
- 服务端继续执行 Evidence、Canonical v2 和 Safety 二次校验。
- External LLM 总调用上限由后续授权明确，本阶段调用数为 `0`。

## 禁止

- D365 GET 或真实 Safe Context
- 真实 Opportunity、Customer、Timeline 或 Signal
- Scenario、Golden metadata 或 Expected Answer
- CRM POST/PATCH/DELETE 或 Writeback
- Production 请求
- Browser 直连 Provider
- Retry、Fixture fallback、response_format fallback
- Model Comparison 或真实 Canary

## 成功判定

只有两次独立 Synthetic Probe 均完整通过，才可考虑将 `Provider Request Compatibility Ready` 设为 `true`。真实 Canary 仍需再次独立授权。
