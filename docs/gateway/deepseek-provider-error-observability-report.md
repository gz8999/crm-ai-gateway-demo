# DeepSeek Provider Error Observability

## Scope

Phase 3C-R5B0 hardens HTTP error visibility without making a new external model call. The implementation applies to the comparison Provider path and keeps the prior R2, R3, R4 and R5A evidence unchanged. No D365 request, CRM write, production request or real Canary selection was performed.

## Safe Error Contract

Only the fields in `provider-error-observability-contract-v1.json` are retained. A non-2xx response is read once, hashed, reduced to an allowlisted error summary, and returned as a fail-closed result. The comparison Harness passes that safe object into its in-memory Audit allowlist; it never passes the request body, Safe Context payload or provider response body.

| Response | Recorded | Not recorded |
| --- | --- | --- |
| JSON error | status, code, type, param, sanitized message, hashes | unknown JSON properties and raw JSON |
| Nonstandard JSON | top-level allowlist fields only | arbitrary fields |
| `text/plain` | sanitized and capped message, status, hash, length | raw text and secrets |
| HTML | content type, status, hash, length, availability | HTML body and page markup |
| Empty body | status, empty-body hash, `bodyAvailable=false` | body text |

## Provider Behavior

The Provider now performs a single attempt for non-2xx responses. It does not retry, mutate the request, relax the schema, or silently switch to a fixture. The result contains the preserved HTTP status and safe error observation, while the UI receives a generic localized fallback reason.

The strict Tool Calling path remains fail-closed. Existing R4 HTTP 400 evidence still records the historical response-body observability gap; it is not rewritten by this phase.

## Test Coverage

Local-only tests cover standard and nonstandard JSON, text, HTML, empty bodies, API key/Bearer/client-secret redaction, email/phone/GUID/CRM-token redaction, length limits, body-read-once behavior, response hashing, single-attempt behavior, zero fixture fallback, Harness Audit isolation, and published allowlist keys.

No test invokes DeepSeek, D365 or Dataverse. No test writes CRM data.

## Verification

- `npm test`: 543/543 passed.
- `npm run build`: passed; production bundle isolation passed across 2 assets.
- `git diff --check`: passed.
- Sensitive scan: passed; no credential-shaped value in runtime or committed delivery files.
- `npm run evaluate:quality`: intentionally not executed. The existing command performs D365 Frozen Dataset GET requests, which is explicitly outside the R5B0 boundary. This is a safety-preserving skip, not a Provider implementation failure.

## R5B0 Gate Result

| Gate | Result |
| --- | --- |
| Provider Error Observability Contract Ready | true |
| JSON Error Parsing Ready | true |
| Text Error Parsing Ready | true |
| HTML Error Safe Handling Ready | true |
| Empty Error Body Handling Ready | true |
| Secret Redaction Ready | true |
| Raw Error Body Exposure | 0 |
| Request Body Exposure | 0 |
| Safe Context Log Exposure | 0 |
| Error Body Hash Ready | true |
| Fail Closed Ready | true |
| Retry Count | 0 |
| Fixture Fallback Count | 0 |
| Synthetic Probe Decision Pack Ready | true |
| Synthetic Probe Authorized | false |
| External LLM Calls R5B0 | 0 |
| CRM Writeback | false |
| Production Requests | 0 |
| P0 / P1 / P2 | 0 / 0 / 0 |

## R5B1 Boundary

The R5B1 decision pack is preparation only. It defines a fully synthetic, non-CRM strict Tool Calling probe with at most one request and zero retries. It does not contain Scenario Golden metadata, customer identity, real evidence or D365 data, and it is not authorized or executed in R5B0.
