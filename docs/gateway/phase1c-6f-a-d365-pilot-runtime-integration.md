# Phase 1C-6F-A D365 Pilot Runtime Integration

## Outcome

The Gateway now supports two explicit sources: D365 Pilot and Local Fixture. Development defaults to D365 Pilot. D365 failures are surfaced and never silently replaced with local or mixed data.

The server reads only the frozen 24-opportunity Pilot allowlist from the test environment. Entity set names are resolved from Metadata, and every business request is an exact GET by an approved private runtime identifier. Credentials and Dataverse identifiers remain server-side.

## Runtime Facts

| Fact | Count |
| --- | ---: |
| Account | 7 |
| Contact | 9 |
| Opportunity | 24 |
| Actual Management | 12 |
| Service Coverage | 15 |
| Imported Timeline | 206 |
| Interaction Signal | 154 |
| Opportunity Close | 8 |
| Target BPF instance | 24 |

Opportunity state distribution is Won/Active/Lost = `7/16/1`. Each opportunity has one target BPF instance at the initial Qualify stage. Opportunity Close is mapped only as a closing fact and is not counted as imported Timeline.

## Department And Amount Controls

Department filtering is applied before Safe Context construction. Counts are: all 24, Dept1 Industry 1, Dept1 Distribution 2, Dept2 LCMS 1, Dept3 Project Cargo 1, Dept3 Dangerous Goods 1, FF 17, Others 1.

The UI defaults to amount bands. Authorized users may switch the current UI to exact CRM amounts, but Safe Context and provider input always retain bands and trends only. Exact amounts are not placed in URLs, browser storage, audit text, logs, exports, or provider payloads.

## API And Safety

The five Pilot endpoints are GET-only and enforce the test hostname plus frozen token allowlist. They do not accept arbitrary CRM queries and do not return customer/contact identity, Dataverse GUIDs, raw Timeline content, raw closing descriptions, or internal security identifiers.

Runtime scenario and Golden metadata are not loaded by D365 Pilot. The deterministic demo provider receives only filtered Safe Context. CRM writeback and external LLM use remain disabled.

## Browser Acceptance

All seven pages passed at 1440px, 1205x767, and 758px with no page-level horizontal overflow. FF filtering returned 17 records, amount display switching worked, and console errors/warnings were `0/0`.

## Request And Write Boundary

- Readback GET: 27 for the validated uncached Pilot snapshot
- POST/PATCH/DELETE/Publish: 0/0/0/0
- CRM writeback: 0
- Production requests: 0
- External LLM calls: 0

## Gates

- D365 Pilot Data Source Ready: true
- Pilot Token Allowlist Ready: true
- Pilot Opportunity Count: 24
- Seven Department Mapping Ready: true
- Department Filter Before Safe Context Ready: true
- State Distribution Ready: true
- OpportunityClose Mapping Ready: true
- BPF Fact Mapping Ready: true
- Actual Coverage Timeline Signal Ready: true
- Safe Context Privacy Ready: true
- Customer Identity Masked: true
- Exact Amount Sent To Model: false
- Raw Timeline Sent: false
- Scenario Golden Runtime Isolation Ready: true
- CRM Writeback Disabled: true
- External LLM Disabled: true
- Production Bundle Isolation Ready: true
- Responsive 1440 Ready: true
- Responsive 1205x767 Ready: true
- Responsive 758 Ready: true
- Console Errors/Warnings: 0/0
- P0/P1/P2: 0/0/0
- Phase 1C-6F-A Ready: true
- Full Import Ready: false
- Cleanup Authorized: false
