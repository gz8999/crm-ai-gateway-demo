# Deep Analysis Evidence Contract Repair

本轮修复高保真 Deep Analysis 的外部 Tool Calling 响应契约。此前 Flash 请求能够完成 HTTP、Tool Call 和 JSON 解析，但后置校验仍要求旧版 `statement`、`evidenceTokens` 结构，导致 `keyThemes_invalid` 与 `contradictions_invalid`。

## 修复内容

- 冻结 `Deep Analysis Executive Evidence Contract v1`，合同 Hash 为 `06cbc257c7b36912787556bbbc0190a39867aa586a50b2f610465ad8919477a7`。
- `keyThemes` 使用 `title`、`analysis`、`evidenceAliases`，数量为 1-3。
- `contradictions` 使用 `analysis`、`evidenceAliases`、`confidenceBand`，没有矛盾时必须为 `[]`。
- 所有证据引用使用每次请求独立的 `E01-E08` 别名；服务端校验通过后才映射回安全证据 Token。
- 旧的 `evidenceTokens`、`evidenceToken`、`citations`、`basis` 不再属于模型可见合同。
- 未知别名、重复别名、缺失字段和额外字段均 fail-closed。

## 安全诊断

审计只保留 `instancePath`、`schemaPath`、`reasonCode`、`missingProperty`、`duplicateIndex`、`unknownAliasCount`，不保存模型原始 Arguments、CRM 原文、真实证据 Token 或客户身份。

## 边界

CRM Writeback=false，外部请求只从服务端发起，浏览器不携带 Provider Secret。离线测试通过后，才允许按独立授权执行一次 Synthetic Probe；本轮不自动重试失败请求。
