# Goal 4B Five-Sample Validation

## JSON Output Transport

- Transport: `response_format=json_object`
- Tool Calling: disabled for high-fidelity path
- Single JSON.parse: true
- Retry: 0
- Fallback: 0
- CRM Writeback: false

## Samples

| Sample | Role | Result |
| --- | --- | --- |
| `DEMO-OPP-075` | Existing verified representative result | Pass; reused prior high-fidelity evidence |
| `DEMO-OPP-010` | Rich high-risk / meeting-prep sample | Pass; inherited from R1 JSON output validation |
| `DEMO-OPP-030` | Healthy control | Pass; inherited from R1 JSON output validation |
| `DEMO-OPP-008` | Data contradiction | Pass |
| `DEMO-OPP-002` | Sparse / no Actual | Pass |

## Scenario Gates

- Data contradiction gate: true
- Sparse/no-Actual gate: true
- Provider Request Compatibility Ready: true
- Five Sample Validation Ready: true

No Provider full response, CRM original text, Authorization header, API key, or raw Timeline content is stored in this report.
