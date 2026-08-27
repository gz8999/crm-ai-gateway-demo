# Phase 1C-6F-A Browser Acceptance

## Scope

- Frontend: `http://127.0.0.1:5173/`
- API: `http://127.0.0.1:8790/`
- Data source: D365 Pilot
- Default scope: all departments, 24 opportunities
- Default opportunity: `SAFE-OPP-199`

## Results

All seven product pages loaded from the same D365 Pilot decision pack: AI Cockpit, Risk & Priority, Opportunity 360, Action Board, Meeting Copilot, Portfolio Intelligence, and Audit & Safety.

The browser confirmed D365 Pilot as the active source, 24 authorized records, demo provider, Safe Context enabled, external model not called, raw data not sent, read-only mode, and fallback disabled. The FF department selection returned 17 records. Amount band and exact UI display modes both worked; Safe Context remained band-only.

| Viewport | Page-level horizontal overflow | Result |
| --- | ---: | --- |
| 1440px | 0 | Ready |
| 1205x767 | 0 | Ready |
| 758px | 0 | Ready |

Console errors/warnings were `0/0`. Evidence screenshots are stored only in ignored `local-artifacts/gateway/phase1c-6f-a/`.

## Gates

- Seven navigation entries: Ready
- Department filtering: Ready
- Amount display switching: Ready
- Last-selection-wins: Ready by interaction request guard and automated coverage
- D365 read error without fixture fallback: Ready
- Responsive acceptance: Ready
- Browser console: Ready
