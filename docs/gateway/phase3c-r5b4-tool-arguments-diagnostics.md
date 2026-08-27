# Phase 3C-R5B4 HTTP 200 Tool Arguments Diagnostics

## Scope

R5B4 is an offline-only hardening phase. It does not call an external Provider, read D365, select a real Canary, or write CRM. R5B3 evidence remains immutable.

## Extraction Path

Strict Tool Calling reads only:

`choices[0].message.tool_calls[0].function.arguments`

The extractor also requires:

- `finish_reason` is present and equals `tool_calls`;
- `tool_calls` is an array with exactly one entry;
- the entry type is `function`;
- the function name is `emit_decision_pack`;
- `arguments` is a string.

`message.content`, `reasoning_content`, the complete `tool_calls` object, the complete `function` object, and streaming `delta` fields are never used as Tool Arguments sources. `stream=false` remains part of the request contract.

## Parsing Contract

Only UTF-8 BOM removal, leading/trailing whitespace removal, one `JSON.parse`, and the existing strict Schema validation are allowed. Markdown fences, explanatory text, bracket repair, field completion, double parsing, object stringification, and LLM repair fail closed.

## Failure Categories

| Category | Meaning |
| --- | --- |
| `OUTPUT_TRUNCATED` | `finish_reason=length` |
| `TOOL_CALL_NOT_COMPLETED` | Missing or non-`tool_calls` finish reason |
| `TOOL_CALL_SHAPE_INVALID` | Missing, multiple, or non-function Tool Call |
| `TOOL_NAME_INVALID` | Function name is not `emit_decision_pack` |
| `ARGUMENT_TYPE_INVALID` | Arguments are not a string |
| `ARGUMENT_EMPTY` | Arguments are empty after allowed normalization |
| `ARGUMENT_JSON_INVALID` | The single JSON parse failed |
| `ARGUMENT_SCHEMA_INVALID` | JSON parsed, but strict contract validation failed |

Legacy Provider reason strings remain compatible for existing callers; the new `diagnosticCategory` carries the precise classification.

## Safe Success Observation

Only metadata is retained: status, choice and Tool Call cardinality, finish reason, content/reasoning presence, function metadata, argument runtime type/length/hash, first/last non-whitespace character categories, bracket counts, parse error type/position, token counts, response ID/correlation, timestamp, and latency. Raw arguments, raw response, request body, Safe Context, credentials, and authorization headers are not retained.

## Verification

- External LLM Calls R5B4: `0`
- D365 GET: `0`
- CRM Writeback: `false`
- Production Requests: `0`
- Retry: `0`
- Fixture fallback: `0`
- Local Mock tests: `569/569` full suite passed
- `evaluate:quality`: not run because it performs D365 GET

R5B3 Provider Request Compatibility remains `false`. R5B4 only makes the next probe diagnosable; it does not authorize or execute that probe.
