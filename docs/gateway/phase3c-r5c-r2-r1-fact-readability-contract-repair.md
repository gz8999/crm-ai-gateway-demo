# Phase 3C-R5C-R2-R1 Offline Fact Readability Contract Repair

- Status: **completed-offline**
- Baseline: **23cef4a**
- Profile / Transport: **v6-r4 / v5**
- Root Cause: Transport v4 allowed code-only Fact values while the post-response readability gate rejected them.
- Repair: Provider returns only request-scoped factCode references; the server maps each code to a frozen readable label, value, and evidence token.
- Safe Fact Catalog / Mapped Fact Count: **14 / 14**
- Code-only Fact Exposure: **0**
- Transport v5 / Canonical v2 / Readability / Safety: **true / true / true / true**
- Historical v1-v4 and R5C-R2 Evidence Unchanged: **true**
- External LLM Calls / D365 GET / CRM Writeback / Production Requests: **0 / 0 / false / 0**
- Provider Request Compatibility Ready: **false**
- Provider Transport Repeatability Ready: **false**
- R5C-R2-R2 Synthetic Probe Ready: **true**

No external Provider or D365 request was made. Online compatibility remains unproven until separately authorized Synthetic probes complete.
