# DeepSeek Strict Schema Compatibility Report

## Result

`DeepSeek Strict Schema Offline Ready=true`

本结论只表示本地 schema、请求外形、fixture 验证和 canonical mapping 已通过；不表示已重新调用 DeepSeek。R5A 外部调用数为 0。

## Provider Schema

- Schema: `DeepSeek Decision Tool Schema v1`
- Tool: `emit_decision_pack`
- Strict: `true`
- Canonical action mapping: `draftStatus` -> `status`
- Canonical response fields retained: `facts`、`inferences`、`evidence`、`confidence`、`recommendedActions`、`priority`、`riskCategories`、`provider`、`model`、`modelVersion`、`fallback`、`safety`、`limitations`
- Optional business information is represented by required fields with empty arrays or explicit enum values; no omission-based semantics are used.

## Recursive Linter Result

| Metric | Result |
| --- | ---: |
| Object Count | 8 |
| Required Coverage Count | 8 |
| Missing Required Count | 0 |
| Missing `additionalProperties=false` Count | 0 |
| Missing Array Items Count | 0 |
| Unsupported Schema Keyword Count | 0 |
| Schema Hash | `a376afe2f6bd222b626d40413c6b971e5993d673785d371520487cda5ad2b1d2` |

The linter rejects the R5A forbidden classes including `minLength`, `maxLength`, `minItems`, `maxItems`, `nullable`, `type:null`, `oneOf`, `allOf`, `not`, `dependentRequired`, `unevaluatedProperties`, `patternProperties`, `propertyNames`, `contains` and `const`.

## Request Contract

The local request-shape test verifies:

- exactly one `emit_decision_pack` function tool;
- `function.strict=true`;
- matching `tool_choice.function.name`;
- `stream=false` and disabled thinking;
- no `response_format` in strict Tool Calling mode;
- serializable parameters and zero linter errors.

## Canonical Mapping

The mapper performs only these transformations:

1. Strict Tool Arguments are schema-validated.
2. `recommendedActions[].draftStatus` is renamed to canonical `recommendedActions[].status`.
3. The required fallback object remains an object with `state` and `reason`.

Unknown nested keys, missing fields, wrong types, invalid confidence/priority, unsupported Evidence Tokens, empty limitations and incomplete Actions are rejected. No CRM fact, Evidence, identity, amount or timeline content is created by the mapper.

## Local Fixture Coverage

Synthetic tests cover valid minimal/full responses and fail-closed cases for nested extra keys, missing required fields, wrong types, unknown Evidence Tokens, invalid confidence, invalid priority, empty limitations and missing Action fields. No fixture contains a CRM GUID, credential, customer identity, exact amount or raw Timeline.

## Boundary

- R2/R3/R4 historical reports: unchanged.
- R5A external calls: 0.
- CRM writeback: false.
- Production requests: 0.
- New real Canary: none.
