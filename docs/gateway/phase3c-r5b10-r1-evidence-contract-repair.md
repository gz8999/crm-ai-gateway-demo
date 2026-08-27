# Phase 3C-R5B10-R1 Evidence Contract Repair

## Root Cause

R5B10 Variant A did not reproduce the R5B8 end-to-end gate because the response validation profiles differed:

- R5B8 historical evidence validation covered Fact, Evidence, and Inference references.
- R5B10 additionally required every Action `basis` string to contain an exact Evidence Token.
- The R5B8/v4 Tool Schema defined `basis` only as a string, and its Prompt requested a source-backed basis without requiring a literal token.

The observed Variant A response was valid JSON and passed strict Schema, Canonical Mapping, and Safety. It failed only the later `action_basis_invalid` rule. This is an evidence-contract parity gap, not proof of a Tool Arguments serialization failure.

## Repair

The repair keeps Contract v1, Contract v2, and all R5B8-R5B10 historical evidence unchanged.

1. Historical and hardened evidence validation now have separate named rule profiles and SHA-256 fingerprints.
2. `Provider Transport Contract v1` adds required `recommendedActions[].evidenceTokens`.
3. Every Action Evidence Token must belong to the supplied Safe Context allowlist.
4. The deterministic Mapper prefixes the approved token list to Canonical v2 `basis`, preserves the original explanation, removes the transport-only field, and performs the existing Canonical v2 validation.
5. A new explicit `v6` DeepSeek profile uses this Transport Contract. It remains opt-in and is not selected by existing runtime defaults.

## Safety Boundaries

- External LLM Calls: **0**
- D365 GET: **0**
- CRM POST/PATCH/DELETE: **0/0/0**
- CRM Writeback: **false**
- Production Requests: **0**
- Retry/Fallback: **0/0**
- Real Canary Authorized: **false**

No Provider response, real Safe Context, CRM data, secret, or production endpoint was used.

## Offline Result

- Historical Control Validation Parity Ready: **true**
- Structured Action Evidence Contract Ready: **true**
- Provider Transport Contract v1 Ready: **true**
- Strict Schema Completeness Ready: **true**
- Deterministic Canonical Mapping Ready: **true**
- Canonical Contract v2 Preserved: **true**
- Existing v5 Profile Preserved: **true**
- Provider Request Compatibility Ready: **false**
- Real Canary Authorized: **false**

Provider compatibility and repeatability require a separately authorized Synthetic Probe using the unchanged v6 envelope. This repair does not authorize or execute that call.
