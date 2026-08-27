# Phase 3C-R5B1 Synthetic Probe 决策包

## 状态

`Synthetic Probe Authorized=false`

本文件只冻结下一阶段的安全边界，不执行 Probe，不选择真实 Canary，不调用外部模型。

## Probe 定义

- 输入：完全合成、非 CRM、非 D365 的最小 Safe Transport fixture。
- 目的：验证 Transport、严格 Tool Calling、JSON 解析与 Schema 兼容性。
- Provider：经人工授权后使用已配置的单一 Provider。
- 模式：strict Tool Calling，固定输出函数名和严格 JSON Schema。
- 最大请求：1 次。
- Retry：0。
- CRM Writeback：false。
- D365/Dataverse 请求：0。
- Production Requests：0。
- Scenario ID、Golden metadata、真实 Evidence：不进入请求。

## 允许验证

1. 请求是否仅包含 synthetic probe context、通用指令和输出 Schema。
2. Provider 是否发出唯一的 Tool Call。
3. Tool Arguments 是否为合法 JSON。
4. 输出是否通过严格 Schema 和安全检查。
5. 失败时是否只返回安全错误观测对象并 fail-closed。

## 禁止事项

- 不使用 `DEMO-OPP-*` 或其他真实/已冻结 Canary。
- 不发送客户、联系人、GUID、精确金额、Timeline 原文、合同内容或 Golden metadata。
- 不自动重试，不切换 Provider，不自动回退 Fixture。
- 不写回 CRM，不发送邮件，不创建 Activity，不访问生产。

## 放行条件

只有人工明确授权 R5B1，且以下条件全部满足时才可执行一次 Probe：

- 服务端密钥状态已由人工确认；
- 浏览器、Git、日志和报告不含凭据；
- 请求安全字段和 Schema hash 已冻结；
- `External LLM Calls R5B1` 当前为 `0`；
- 失败时保留 HTTP status、correlation 和安全 hash，不保留原始正文。
