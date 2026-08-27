# Phase 3C-R5B11-R1 Risk Category Contract Repair

- Status: **stopped-safety**
- Stop Reason: **RISK_CATEGORY_EVIDENCE_INCOMPATIBLE**
- Historical Failure Classification: **B / GLOBAL_VALID_BUT_EVIDENCE_UNSUPPORTED**
- Historical Category Value Retained: **false** (P2 observability gap; no value was reconstructed)
- Historical Arguments Hash: `5769a982672168a8f227c9a74b88b823fdd18c5cda3a02da57aae60439730a59`
- Risk Category Contract Ready: **true**
- Catalog / Transport v2 / Evidence Matrix: **true / true / true**
- Probe 1 HTTP / Tool Call / JSON / Transport Schema / Action Evidence / Category Code: **true / true / true / true / true / true**
- Probe 1 Category Evidence Compatibility: **false**
- Secondary Canonical Safety Policy Contract: **incomplete**
- Probe 1 / Probe 2 Ready: **false / false**
- External LLM Calls: **1/2**
- Provider Request Compatibility Ready: **false**
- Provider Transport Repeatability Ready: **false**
- D365 GET / CRM Writeback / Production Requests: **0 / false / 0**
- Real Canary Authorized: **false**

Probe 1 returned a globally valid category code, but its cited Evidence Token type was incompatible with that category. The same parsed response also omitted one or more mandatory Safety Policy Codes. Probe 2 was therefore not called. Token usage, Tool Arguments hash, and response-body hash were not retained by the pre-hardening failure path and are reported as unavailable rather than reconstructed.

No raw request, response, Tool Arguments, Safe Context, identity, exact amount, raw Timeline, Scenario, Golden metadata, or credential is stored.
