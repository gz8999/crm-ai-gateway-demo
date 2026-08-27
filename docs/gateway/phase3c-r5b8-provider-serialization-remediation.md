# Phase 3C-R5B8 DeepSeek Tool Serialization Remediation

## Root Cause

R5B7B proved that transport and Tool selection worked but generated invalid JSON. The accepted V2 parameter schema was also duplicated inside the user message. The remediation profile removed that duplication and added compact serialization guidance; both R5B8 Probes then passed one JSON parse and strict mapping. These two request changes were applied together, so neither is claimed as the sole cause. Full compatibility remains blocked because both responses repeated the forbidden safety label `raw_timeline` in limitations.

## Change

- Parameter Schema changed: **false**
- Schema relaxed: **false**
- Duplicate message Schema removed: **true**
- Tool description added: **true**
- Changed request fields: **["messages.1.content","tools.0.function.description"]**
- Unexpected changed fields: **[]**

## Result

- Status: **stopped-safety**
- HTTP: **200**
- finish_reason: **tool_calls**
- JSON parse: **true**
- Schema validation: **true**
- Evidence validation: **not-run**
- Safety validation: **false**
- Safety block: **raw_timeline**
- Provider Request Compatibility Ready: **true**
- External LLM Calls: **2/3**
- Retry: **0**
- Real Canary Authorized: **false**

No raw arguments, request body, response body, credentials, Authorization header, CRM data, or private diagnostic window is included.

Provider request compatibility is proven by HTTP 200, one completed Tool Call, one-pass JSON parsing and strict Schema mapping with Retry=0 and Fallback=0. The separate output safety hold remains active and prevents any real Canary authorization.
