# Phase 3C-R5B11-R2 Offline Contract Repair

## Result

The offline contract defect is repaired without a Provider call, D365 request, CRM write, or historical artifact change.

- External LLM calls: `0`
- D365 GET: `0`
- CRM POST/PATCH/DELETE: `0/0/0`
- CRM writeback: `false`
- Production requests: `0`
- Provider Request Compatibility Ready: `false`
- Real Canary Authorized: `false`

## Root Cause

R5B11-R1 validated category codes and evidence tokens after the Provider response, but the Provider schema allowed every canonical category to cite every supplied token. The Provider could therefore produce a structurally valid pair that was semantically incompatible with the evidence type. The safety contract also asked the model for an array of policy codes, so a valid-looking response could omit mandatory policies and fail only during canonical validation.

## Repair

`Provider Transport Contract v3` and the explicit `v6-r2` profile add two request-scoped constraints:

1. The server derives a Safe Evidence Catalog containing only `evidenceToken` and safe `evidenceTypes`. No evidence value, expected category, Scenario, Golden metadata, identity, exact amount, or raw Timeline is added.
2. The strict Tool schema creates one `anyOf` branch for each evidence-supported category. Each branch fixes its category code and limits `evidenceTokens` to compatible tokens from the current request.
3. All six safety assertions are fixed, required booleans. The server validates them, removes the transport-only object, and deterministically emits the complete Canonical v2 `policyCodes[]`.
4. The runtime independently revalidates action evidence, category evidence compatibility, the Canonical v2 contract, and output safety. Schema acceptance alone is not trusted.
5. Mapping failures retain only safe usage and response/request/arguments hashes. No raw response or Tool Arguments are persisted.

## Offline Evidence

- Transport v1 schema hash remains `12838eecacdaabe7f2e1a55c660847652dcfc2abcb87e381f1b45d8aba851236`.
- Transport v2 schema hash remains `69083368d8ea37beb074441a723eb274cfbcebb6ef86b5a429ff90695e74869d`.
- Frozen synthetic Transport v3 schema hash is `9056533322a5b05ce7ea6be9b21f4579efc0088ff61c1a0b2e1c94a503df77eb`.
- Schema nodes: `88`; typed: `86`; `anyOf`: `2`; missing type/anyOf/ref: `0`.
- Objects: `19`; missing required: `0`; missing `additionalProperties=false`: `0`; unsupported keywords: `0`.
- Safe evidence tokens: `5`; evidence-supported categories: `8`; unsupported `route` category omitted from this request.
- Focused local tests: `14/14` passed.
- Full local tests: `694/694` passed.
- Production build and Bundle isolation: passed across `2` assets.
- Diff check and sensitive scan: passed; credential exposure `0`, public artifact GUID exposure `0`.

## Decision

The implementation is ready for a separately authorized synthetic Provider test using `v6-r2`. Offline validation cannot establish Provider serialization or repeatability, so `Provider Request Compatibility Ready` remains `false`. A real CRM Canary, Model Comparison, CRM writeback, and production deployment remain blocked.
