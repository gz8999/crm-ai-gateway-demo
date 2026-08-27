# External Provider Harness Architecture

## Gate

Goal 3B uses the deterministic provider only. `External LLM Canary Authorized=false` and `externalProvidersEnabled=false` are hard runtime gates.

## Providers

- DeterministicProvider: enabled; consumes Safe Context and returns the existing Decision Pack.
- OpenAICompatibleProvider: disabled; no network path in the Goal 3B provider interface.
- AzureOpenAIProvider: disabled; reserved contract only.
- AnthropicCompatibleProvider: disabled; reserved contract only.
- DisabledExternalProvider: explicit refusal with a safe fallback reason.

Every provider envelope reserves request ID, model version, token usage, estimated cost, latency, safety status, timeout/abort metadata and retry policy. No credential or Authorization header is logged or sent by this Goal.

## Future comparison

The same Safe Context request may be evaluated only after an independent authorization. Golden metadata remains in the test/evaluation side and is never passed to a provider. CRM writeback, browser-direct calls and automatic fallback to an external model remain disabled.

Current harness status: provider=deterministic, externalEnabled=false, externalCalls=0.
