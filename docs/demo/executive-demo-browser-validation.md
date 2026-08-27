# Executive Demo Browser Validation

Status: Passed on 2026-07-20.

## Runtime

- Frontend: `http://127.0.0.1:5173/`
- API: `http://127.0.0.1:8790/`
- Data source: `D365 Frozen Dataset`
- Authorized opportunities: 200
- Default fallback: disabled
- Provider status: `Controlled Validation Pending`
- External LLM calls: 0
- CRM writes: 0

## Responsive Results

| Viewport | Official pages checked | Page-level overflow | Result |
| --- | ---: | ---: | --- |
| 1440x900 | 7/7 | 0 | Pass |
| 1205x767 | 7/7 | 0 | Pass |
| 758x900 | 7/7 | 0 | Pass |

The seven checked pages were AI Cockpit, Risk & Priority, Opportunity 360,
Action Board, Meeting Copilot, Portfolio Intelligence, and Audit & Safety.
Navigation remained reachable at every viewport and the 758px navigation used
its intended internal scrolling behavior.

## Interaction Checks

- Score Showcase filter returned exactly 24 of 200 D365 opportunities.
- Grade `Z` produced the explicit empty state `当前筛选没有商机。`.
- `Dept1 Industry` returned 11 records and retained the statement that the
  department filter is applied before Safe Context construction.
- Exact CRM amount display was available for the authorized internal UI while
  Audit continued to report `Exact Amount Sent=false`.
- Audit displayed `Controlled Validation Pending`, the blocked external-call
  state, `CRM Writeback=false`, `Raw Timeline Sent=false`, and
  `Production Access=false`.
- Initial loading completed without a mixed or partial data source. The D365
  failure path is covered by automated fail-closed tests and does not silently
  switch to Local Fixture.

## Runtime Evidence

- Opportunity state distribution: Won 91 / Active 100 / Lost 9.
- Health Grade distribution: S 68 / A 23 / B 61 / C 46 / D 2 / Z 0.
- Browser console errors/warnings: 0/0.
- External provider requests from the browser: 0.
- D365 request audit: GET 179; POST/PATCH/DELETE/Publish 0/0/0/0.
- Customer identity, Dataverse GUIDs, raw Timeline, and exact amounts were not
  exposed through Safe Context or the Audit business body.
