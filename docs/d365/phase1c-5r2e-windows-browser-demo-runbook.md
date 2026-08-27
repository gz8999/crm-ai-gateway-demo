# Phase 1C-5R2E Windows Browser Demo and Handoff Runbook

This is the main operating handoff for the closed R2E demo. The frozen closure report is `phase1c-5r2e-final-closure.md`. Use only the approved test environment and the controlled synthetic records listed below.

## Requirements

- Edge or Chrome
- Network access to `org91f5f65f.crm5.dynamics.com`
- `CRM AI Demo User`, the pre-validated non-administrator account
- App `CRM AI Gateway Demo - Modern` (`916afe4b-607e-f111-ab0e-002248eb1915`)

The computer does not need VS Code, Visual Studio, .NET SDK, Mono, Git, GitHub CLI, Plugin Registration Tool, source code, or the DLL.

## Demo Flow

1. Sign in to the approved test organization and open the Modern App.
2. Open Opportunities and confirm the Full Replica form, native Timeline, Location Lookup, and POL/POD controls.
3. Open `[AI-DEMO-R2E5] Monthly Actuals Scenario` (`4d1cfb52-2c80-f111-ab0e-000d3a82d194`).
4. Show the Actual Management Subgrid and its single child (`f91cfb52-2c80-f111-ab0e-000d3a82d194`).
5. Show April-July Revenue `100/200/300/400`, GP `10/20/30/40`, child annual Revenue `1000`, and parent annual Revenue `1000`.
6. Open `[AI-DEMO-R2E5] Pipeline Comparison Scenario` (`cf1cfb52-2c80-f111-ab0e-000d3a82d194`).
7. Show budget status `预算内`, April-March Revenue `50000` per month, GP `5000` per month, and annual totals `600000/60000`.
8. Show the BPF and explain that the accepted runtime instance is already at `案件关闭`; do not operate it.
9. Explain the AI Gateway safety boundary without invoking an external LLM.

The demo is read-only. Do not create, modify, save, delete, close, publish, or change a process. Annual Actual GP is presented as a derived total of the monthly GP fields because no independent annual Actual GP field exists.

## Frozen Baseline

- `R2E Demo Ready=true`
- P0 / P1 / P2: `0 / 0 / 1`
- Full Replica: `5 / 19 / 115 / 106`
- Native / Old Timeline: `1 / 0`
- Plugin Steps: Enabled `7`, Disabled `0`
- Active Locations: `51`
- BPF Process Order: `0`
- Production requests: `0`
- Test baseline: `184/184 passed`

Latest functional baseline before closure documentation: `3a70a0b13e339e1a5428869f5d84ea399fee3d84`.

## Protected Evidence Record

Do not modify or clean up:

- Opportunity `f9b6f99b-2078-f111-ab0e-000d3a857307`
- BPF instance `221ed4a5-0780-f111-ab0e-000d3a82d194`
- Accepted stage `案件关闭`

## Cleanup Manifest

Cleanup requires separate authorization and must run in dependency order:

1. Actual `f91cfb52-2c80-f111-ab0e-000d3a82d194`
2. Opportunities `4d1cfb52-2c80-f111-ab0e-000d3a82d194` and `cf1cfb52-2c80-f111-ab0e-000d3a82d194`
3. Contact `8739f69c-4b80-f111-ab0e-000d3a82d194`
4. Account `bc1bfb52-2c80-f111-ab0e-000d3a82d194`

Never include Location or POL/POD master data in cleanup.

## Forbidden Actions

- Never access `lcn-crm.crm7.dynamics.com`.
- Do not create, edit, save, delete, close, or reassign records.
- Do not advance, finish, switch, activate, or deactivate a BPF.
- Do not add Timeline activities or notes.
- Do not publish or change App, Form, View, Plugin, Schema, or permissions.
- Do not invoke external LLMs with CRM content.

## Emergency Handling

- Subgrid or amount stale: use Refresh once, then reopen the record; never save or recreate data.
- Plugin or component error: capture the time and visible message, then stop; never disable a Step during the demo.
- Wrong form or fields: stop and report the route; do not edit metadata.
- Login or permission issue: stop and use the documented evidence; do not change roles live.
- Production hostname: close the tab immediately and report a P0.

## Handoff Status

Phase 1C-5R2E is closed. The next phase is `未定义` and no later work is authorized by this runbook.
