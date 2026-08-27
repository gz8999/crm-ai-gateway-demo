# Executive Demo Runbook

## Before the Session

1. Confirm the local `.env` points to `org91f5f65f.crm5.dynamics.com`, `AI_PROVIDER=demo`, and `ALLOW_EXTERNAL_AI=false` without displaying secrets.
2. Start the existing full development runtime with `npm run dev:full`.
3. Open `http://127.0.0.1:5173/` and confirm `D365 Frozen Dataset`, 200 records, all departments, amount bands, and `受控验证中`.
4. Keep the browser at 1440px for the main demo. Keep 1205x767 and 758px checks available as recovery evidence.
5. Do not open developer-only AI Lab, trigger model comparison, use exact amount mode unless asked, or change the data source to Local Fixture.
6. The current controlled LLM validation has consumed its 16-call budget but has only 5/8 persisted scenario snapshots. Treat external narrative as optional and pending; do not use the Live Demo button in this release candidate.

## Demonstration Controls

- Global department filter always runs before Safe Context construction.
- Default amount mode is the masked band view.
- Score Showcase is a boolean label on 24 existing D365 opportunities; it is not a Scenario field.
- Use `DEMO-OPP-056` for high-risk meeting preparation and `DEMO-OPP-017` for healthy follow-up.
- Use the eight-token selection in `executive-demo-opportunity-selection.json` for the guided story.

## Failure Handling

- D365 read failure: stop navigation and show `D365 Runtime Temporarily Unavailable`; do not select Local Fixture as a substitute.
- Optional snapshot: only use a pre-approved artifact visibly labeled `Frozen Runtime Snapshot` and state that it is not live.
- External AI question: show Audit & Safety and explain that the deterministic layer is ready, while the eight-scenario external narrative gate remains pending; no live call is performed.
- Browser issue: reload once. Do not alter D365 data, enable writeback, or change provider configuration during the meeting.

## After the Session

Stop the local service if no longer needed. Do not run cleanup, import, external Canary, production deployment, or push as part of GOAL 4A.
