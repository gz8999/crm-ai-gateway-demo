# GOAL 4B-R1 JSON Output Transport

## Scope

The normal high-fidelity Deep Analysis transport now uses the OpenAI-compatible
`response_format: {"type":"json_object"}` mode. It no longer sends `tools` or
`tool_choice`, and it no longer reads function-call arguments.

The `reference-only` transport remains separate and unchanged because it is a
different deterministic code-selection mode with its own regression coverage.

## Validation Contract

- Evidence contract: `Deep Analysis Executive Evidence Contract v1`
- Evidence Contract hash remains the value exported by the existing contract module.
- The server reads `choices[0].message.content`.
- Provider content is normalized only by removing a leading UTF-8 BOM and trimming outer whitespace.
- The content is parsed exactly once with `JSON.parse`.
- Schema, evidence-alias, and safety validation remain server-side and unchanged.
- Invalid JSON, empty content, non-string content, truncation, unknown aliases, and schema violations fail closed.
- There is no repair, retry, or fixture fallback.

## Safety Boundary

The request still uses the identity-redacted high-fidelity context and request-scoped
evidence aliases. CRM writeback remains disabled. Raw provider content is not returned
in failure results; only safe hashes and bounded diagnostics are retained.

## Verification Status

Offline transport and regression tests cover:

- JSON object mode request shape;
- absence of `tools` and `tool_choice` on the normal path;
- one-pass JSON parsing;
- malformed, empty, and non-string message content fail-closed behavior;
- unchanged Evidence Contract validation;
- unchanged reference-only Tool Calling behavior.

External sample validation is deliberately limited to the authorized Synthetic 2/2,
`DEMO-OPP-010`, and `DEMO-OPP-030` checks. The remaining samples are not run in this phase.
