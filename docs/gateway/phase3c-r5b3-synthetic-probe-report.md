# Phase 3C-R5B3 DeepSeek V2 Synthetic Strict Tool Probe

- Status: **stopped-safety**
- External LLM Calls R5B3: **1/1**
- Request token: `R5B3-SYNTH-V2-001`
- Input: completely synthetic, non-CRM, non-D365
- Retry: **0**
- Fixture fallback: **0**
- D365 GET: **0**
- CRM Writeback: **false**
- Production Requests: **0**

## Synthetic Input Safety

- testOnly=true
- syntheticProbe=true
- d365Record=false
- runtimeEligible=false
- realCanary=false
- Forbidden Field Count: **0**
- Real CRM Token Count: **0**
- Identity Count: **0**
- Exact Amount Count: **0**
- Raw Timeline Count: **0**
- Scenario/Golden Count: **0**

## V2 Request

- Provider: **openai-compatible**
- Model Alias: **deepseek-v4-pro**
- Endpoint Alias: **deepseek-beta**
- Schema: **DeepSeek Decision Tool Schema v2**
- Schema Hash: `476cecc436dc452abc50988d337d779398159e8e0a4003bc8aa6153cbdab22b7`
- Single Tool: **true**
- Tool Name: **emit_decision_pack**
- strict=true: **true**
- additionalProperties=false: **true**
- Forced tool choice: **{"type":"function","function":{"name":"emit_decision_pack"}}**
- stream=false: **false**
- response_format sent: **false**
- Retry: **0**

## Validation

- HTTP Success: **false**
- Tool Call: **false**
- JSON: **false**
- Schema V2: **false**
- Canonical Mapping: **false**
- Evidence: **false**
- Hallucination Audit: **false**
- Unsupported Claim Count: **0**
- Safety: **false**

## Boundary

Provider Request Compatibility Ready: **false**. Real Canary Authorized=false, Remaining Canary Execution Authorized=false, Phase 3C Complete=false. No raw request, Safe Context, Secret, Authorization header or raw response body is stored.
