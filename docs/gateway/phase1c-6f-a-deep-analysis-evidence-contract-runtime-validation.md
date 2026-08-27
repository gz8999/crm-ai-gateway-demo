# Deep Analysis Flash Runtime Validation

## Result

`deepseek-v4-flash` passed the repaired high fidelity evidence contract.

- Synthetic Probe: 1 call, HTTP 200, `finish_reason=tool_calls`, one function call, one JSON parse, Schema/Evidence/Safety passed.
- Real Canary: `DEMO-OPP-075`, 1 call, HTTP 200, `finish_reason=tool_calls`, one function call, Schema/Evidence/Safety passed.
- Real Canary produced 8 representative Timeline evidence records and 8 Timeline facts.
- `CRM Writeback=false`, CRM POST/PATCH/DELETE=0, Production Requests=0, Browser Provider Requests=0.

## Contract Evidence

- Contract: `Deep Analysis Executive Evidence Contract v1`
- Contract Hash: `06cbc257c7b36912787556bbbc0190a39867aa586a50b2f610465ad8919477a7`
- Model-visible evidence references: request-scoped `E01-E08` aliases only.
- Real Canary evidence aliases used: 8.
- Validation diagnostics: none.
- Raw model arguments and raw response body are not stored in the public audit.

## Timing

Synthetic Probe latency was 221 ms. Real Canary latency was 25,730 ms with 11,848 total tokens. Retry count was zero for both known successful runs.

One earlier route attempt made before the final auditable request did not produce a response or audit entry; it is not counted as a successful evaluation and was not retried as an automatic recovery. The final auditable run is the result used for the readiness gate.
