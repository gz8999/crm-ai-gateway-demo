# Phase 3C-R5B1 Synthetic Strict Tool Probe

- Status: **stopped-safety**
- External LLM Calls R5B1: **1/1**
- Request token: `R5B1-SYNTH-TOOL-001`
- Input: completely synthetic, non-CRM, non-D365
- Retry: **0**
- Fixture fallback: **0**
- D365 GET: **0**
- CRM Writeback: **false**
- Production Requests: **0**
- Stop Reason: **provider_http_400**
- P0/P1/P2: **0/1/0**

## Synthetic Input

- testOnly=true
- d365Record=false
- runtimeEligible=false
- realCanary=false
- syntheticProbe=true
- Forbidden Field Count: **0**
- Real CRM Token Count: **0**
- Request Hash Ready: **true**

## Provider Request

- Provider: **openai-compatible**
- Model: **deepseek-v4-pro**
- Endpoint Alias: **deepseek-beta**
- Single Tool: **emit_decision_pack**
- strict=true: **true**
- additionalProperties=false: **true**
- Forced tool choice: **{"type":"function","function":{"name":"emit_decision_pack"}}**
- stream=false: **false**
- response_format sent: **false**
- Request Schema Hash: `a376afe2f6bd222b626d40413c6b971e5993d673785d371520487cda5ad2b1d2`
- Request Body Hash: `d995cab903283135357cba25f2b942845ea8666184d752b7c35fd9fed25cc0fe`

## Validation

- HTTP Success: **false**
- Tool Call: **false** (none)
- JSON: **false**
- Schema: **false**
- Canonical Mapping: **false**
- Evidence: **false**
- Unsupported Claim Count: **0**
- Safety: **false**
- Provider Request Compatibility: **false**
- P0/P1/P2: **0/1/0**

No raw request, Safe Context, API key, Authorization header or raw response body is stored. Real Canary execution remains unauthorized.
