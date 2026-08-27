# Phase 3C-R5C-R2-R2 Fact Reference Repeatability

- Status: **stopped-safety**
- Stop Reason: **ARGUMENT_JSON_INVALID**
- Profile / Transport / Canonical: **v6-r4 / v5 / v2**
- Probe 1 / Probe 2: **true / false**
- Probe 1 HTTP / Latency / Tokens: **200 / 15522 ms / 5272**
- Probe 2 HTTP / Latency / Tokens: **200 / 14141 ms / 5217**
- External LLM Calls: **2/2**
- JSON / Transport / Fact Reference / Risk Category / Fixed Fields / Safety Statements / Canonical / Evidence / Readability / Safety: **1/1/1/1/1/1/1/1/1/1**
- Hallucination Audit: **1 completed / 0 hard failures**
- Top-level Structure Repeatability Ready: **false**
- Provider Request Compatibility Ready: **false**
- Provider Transport Repeatability Ready: **false**
- Output Safety Compatibility Ready: **false**
- D365 GET / CRM Writeback / Production Requests: **0 / false / 0**
- Real Canary Authorized: **false**

Probe 2 failed before semantic validation because its Tool Arguments were not valid JSON. Downstream Evidence, Readability, Safety, and Hallucination checks were not run for Probe 2. No raw request, response, Tool Arguments, Synthetic input, credential, Authorization header, CRM identity, exact amount, raw Timeline, Scenario, or Golden metadata is stored.
