# Phase 3C-FAST Synthetic Repeatability

- Baseline: `ffdbb7e`
- Provider / Model / Profile: DeepSeek / deepseek-v4-pro / v6-r5
- Transport / Canonical: Provider Transport Contract v6 / Decision Pack Model Response v2
- Stop Reason: ARGUMENT_SCHEMA_INVALID
- Phase runtime / quality validation / total D365 GET: 0 / 179 / 179
- CRM Writeback / Production Requests: false / 0

- Probe count: 1/2
- Repeatability Ready: false
- Canonical hash count: not-complete
- Retry / Fallback: 0 / 0

| Probe | HTTP | Finish reason | JSON | Transport v6 | Canonical v2 | Failure |
| --- | ---: | --- | --- | --- | --- | --- |
| SYNTHETIC-1 | 200 | tool_calls | true | false | false | ARGUMENT_SCHEMA_INVALID |

Probe 1 failure stopped Probe 2 before dispatch. No response body or Tool Arguments were persisted.
