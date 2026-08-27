# Phase 3C-R5C-R1 Serialization Hardening

## Result

- Status: **offline repair complete**
- External LLM Calls: **0**
- D365 GET: **0**
- CRM Writeback: **false**
- Production Requests: **0**
- Provider Request Compatibility Ready: **false**

## Root Cause Boundary

R5C reached HTTP 200, one completed Tool Call, the expected function name, and a string `arguments` value, then failed the only permitted `JSON.parse`. The response body and Tool Arguments were intentionally not stored, so the exact malformed character cannot be recovered from historical evidence.

The request-scoped real schema was not larger than the successful Synthetic schema: it was 5518 bytes with seven risk-category branches, versus 5685 bytes and eight branches. Schema size or `anyOf` branch count is therefore not supported as the cause.

The remaining controllable risk was the Transport v3 output surface. Facts, evidence, inferences, actions, provider metadata, and fallback text still accepted unrestricted strings, while evidence references outside risk categories were enforced only after parsing. [DeepSeek documents strict Tool Calling as a beta feature](https://api-docs.deepseek.com/guides/tool_calls), and its API reference still requires clients to validate generated function arguments.

## Repair

An explicit opt-in `v6-r3` profile and Provider Transport Contract v4 were added. Existing profiles and historical evidence remain unchanged.

Transport v4:

- binds every Fact, Inference, Evidence, Action, and Risk Category evidence reference to the request allowlist in the JSON Schema;
- constrains free text to one line, at most 240 characters, with no double quote, backslash, or control character;
- fixes owner and due window to `待人工指定` and `待人工确定`;
- fixes Provider, Model, fallback, safety, and limitation paths where the server already knows the value;
- preserves `additionalProperties=false`, all required fields, Action Evidence, Risk Category Evidence, and Canonical v2 mapping;
- keeps one standard `JSON.parse`, no repair, no retry, and no fallback.

The Provider success path now also retains content-free diagnostics on a parse failure: length, hashes, character classes, bracket counts, parse error location, token usage, and latency. It never stores Tool Arguments or the response body.

## Verification

- R5C-shaped v6-r3 Schema Hash: `63e279545bc601ff16d89c4cad4ede283c029c25c647ca13506106de1b07e27e`
- Missing Type / AnyOf / Ref: `0`
- Missing Required: `0`
- Missing `additionalProperties=false`: `0`
- Unsupported Keyword: `0`
- Historical v1/v2 hashes unchanged: **true**
- Local valid Tool response: **pass**
- Quote, backslash, newline, control character, oversized text: **fail-closed**
- Unknown evidence, invented owner/deadline, Provider/Model drift: **fail-closed**
- Invalid JSON raw content exposure: **0**

This repair is offline only. A new, separately authorized Synthetic Probe must prove DeepSeek acceptance and repeatability before any new real Canary is considered.
