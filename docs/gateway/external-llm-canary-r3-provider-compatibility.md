# Phase 3C-R3 Provider Compatibility

- Provider: openai-compatible
- Model: deepseek-v4-pro
- Native JSON mode: **strict-tool**
- Native JSON ready: **true**
- Endpoint: `https://api.deepseek.com/beta`
- Contract: `external-model-response-contract-v1` with strict Tool Calling parameters and `additionalProperties=false`.
- Official evidence: [Function Calling strict mode](https://api-docs.deepseek.com/guides/function_calling/), [Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion).
- JSON-only prompt fallback is not used for R3.
- External call performed: **false**; key gate stopped the run before transport.
