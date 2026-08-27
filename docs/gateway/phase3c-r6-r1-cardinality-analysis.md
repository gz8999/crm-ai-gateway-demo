# Phase 3C-R6-R1 Cardinality Analysis

## Root Cause

Transport v6 represented selections as arrays without supported array cardinality keywords. Canonical v2 and the Selection Reference Validator first enforced the non-empty inference rule after Tool Schema validation. R6 therefore accepted an empty `/inferences` array structurally and rejected it later.

## Authoritative Decision

- Case: **A**
- Transport Inferences Min Items before repair: **0**
- Canonical / Runtime / Selection Min Items: **1 / 1 / 1**
- Inference Evidence Tokens Min Items: **1**
- Authoritative Inferences Min Items: **1**
- Contract / Hash: **Decision Pack Cardinality Contract v1 / `fce9a5277979b6c35d515395720892857ae7afcb756d627cfac6b1811792376b`**

## Repair

Transport v7 encodes bounded collections as required `itemNN` slot objects. This directly enforces cardinality using Provider-supported object, required, anyOf, enum and ref constructs without unsupported `minItems` or `maxItems`. Historical Transport v6 remains unchanged.

- Tool / Runtime Schema Hash: `c93f3998a705af0a3fa9de3943d66be69b64f7c2aad0b278397b3c4492b72ce6` / `c93f3998a705af0a3fa9de3943d66be69b64f7c2aad0b278397b3c4492b72ce6`
- Cardinality Mismatch / Runtime-only / Tool-only: **0 / 0 / 0**
- Independent Cardinality Constants: **0**
