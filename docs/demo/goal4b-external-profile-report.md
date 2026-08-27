# Goal 4B External Demo Profile

The ignored `.env.external.local` profile is configured for the approved OpenAI-compatible DeepSeek Flash endpoint and keeps CRM writeback disabled. The launcher merges that profile only for `npm run dev:external-demo`, explicitly sets `VITE_FEATURE_DEEP_ANALYSIS=true` for the external demo build, prints a secret-free startup summary and rejects writeback-enabled configuration.

The checked-in `.env.example` remains safe by default:

```text
AI_PROVIDER=demo
ALLOW_EXTERNAL_AI=false
CRM_WRITEBACK_ENABLED=false
DEEP_ANALYSIS_EXTERNAL_ENABLED=false
DEEP_ANALYSIS_DEFAULT_PROVIDER=demo
DEEP_ANALYSIS_HIGH_FIDELITY_ENABLED=false
DEEP_ANALYSIS_HIGH_FIDELITY_TRANSPORT=text
```

No API key, authorization header or secret value is included in this report or the production bundle.

The high-fidelity provider also contains an explicit, opt-in `reference-only` transport for a separately authorized probe. It returns only catalog codes and request-scoped evidence aliases, then expands the result deterministically on the server. It is not enabled by the safe default profile and was validated only with local fixtures in this phase.
