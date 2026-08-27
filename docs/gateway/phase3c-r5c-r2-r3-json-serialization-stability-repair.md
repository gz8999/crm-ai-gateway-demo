# Phase 3C-R5C-R2-R3 JSON Serialization Stability Repair

## Root Cause

Probe 1 and Probe 2 used byte-identical request envelopes and both reached the expected Tool Call. Probe 1 parsed successfully; Probe 2 returned invalid Tool Arguments JSON. This isolates the failure to Provider-side Tool Arguments serialization nondeterminism rather than endpoint, extraction path, schema hash, or client retry behavior. DeepSeek's own API contract requires callers to validate generated function arguments because they may not always be valid JSON.

Transport v5 still exposed six provider-generated free-text nodes. Transport v6 removes all of them: the Provider may emit only catalog codes, request-scoped evidence tokens, enum values, and fixed booleans. The server deterministically expands those references into readable Canonical v2 content.

## Offline Result

- Profile / Transport: **v6-r5 / v6**
- Transport v5 free-text nodes: **6**
- Transport v6 free-text nodes: **0**
- Transport v6 enum-only string coverage: **true**
- Deterministic mapping: **1000 iterations / 1 canonical hash**
- Canonical / Readability / Safety: **true / true / true**
- Historical R5C-R2-R2 evidence unchanged: **true**
- External LLM Calls / D365 GET / CRM Writeback / Production: **0 / 0 / false / 0**
- Provider Request Compatibility Ready: **false**

This offline repair removes the identified serialization risk surface but does not claim online Provider repeatability. A new Synthetic Probe requires separate authorization.
