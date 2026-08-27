# Phase 3C-R5B6 Increased Output Budget Synthetic Strict Tool Probe

- Status: **stopped-safety**
- External LLM Calls: **1/1**
- HTTP Status: **200**
- Finish reason: **tool_calls**
- Retry: **0**
- Fixture fallback: **0**
- D365 GET: **0**
- CRM Writeback: **false**
- Production Requests: **0**
- Provider Request Compatibility Ready: **false**

## Configuration Diff

- Changed Fields: **["max_tokens"]**
- Unexpected Changed Fields: **[]**
- max_tokens: **1200 -> 2400**

## Preflight

- Server-side secret ready: **true**
- Schema Hash: 476cecc436dc452abc50988d337d779398159e8e0a4003bc8aa6153cbdab22b7
- Missing Type/AnyOf/Ref: **0**
- Missing Required: **0**
- Missing additionalProperties: **0**
- Unsupported Keywords: **0**
- Synthetic forbidden fields: **0**
- Real CRM tokens: **0**

## Observable Response

- Choices: **1**
- Tool Calls: **1**
- Tool type/name: **function / emit_decision_pack**
- Arguments type/length: **string / 4919**
- Arguments SHA-256: 139ddd7d00bbb563ffee5e72129a4a31650195d025167fe74e35ebaf2d6ae7e4
- Completion tokens: **1475** / max **2400**
- Latency: **14968 ms**
- Estimated cost: **0.001475 USD**

## Validation

- HTTP Transport: **true**
- Finish Reason: **true**
- Tool Call: **true**
- Argument String: **true**
- JSON: **false**
- Schema V2: **false**
- Canonical Mapping: **false**
- Evidence: **false**
- Safety: **false**
- Unsupported Claim Count: **0**

No raw arguments, request body, response body, Synthetic input, Safe Context, credentials, or authorization header is stored. Real Canary Authorized=false and Phase 3C Complete=false.
