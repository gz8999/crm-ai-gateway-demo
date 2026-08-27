# Phase 1C-5R2E-2D3 Browser Full Replica Routing

## Result

`Browser Full Replica Routing Ready=false`

The authenticated browser session could enumerate the target test-environment
tabs, but the Dynamics page became unresponsive when the existing Opportunity
tab was claimed and refreshed. No browser save, record mutation, or server-side
write was attempted.

This is `Browser Automation Unavailable`, not evidence that the published form
routing is incorrect. The server-side access and publish checks remain the
source of truth until the browser-only gate is completed.

## Verification Matrix

| Check | Result | Evidence |
|---|---|---|
| Modern App opens | Not verified | Browser page control timed out |
| Opportunity > New form ID | Not verified | No New action executed |
| Existing `[AI-DEMO]` form ID | Not verified | Existing page was not safely re-read after refresh |
| Direct Full Replica `formid` route | Not verified | No new navigation attempted |
| Form Selector | Not verified | Page DOM unavailable |
| 5 Tabs and Header order | Not verified | Browser DOM unavailable |
| Annual fields read-only | Not verified | Browser DOM unavailable |
| Actual Management Subgrid | Not verified | Browser DOM unavailable |
| New record saved | No | No save action was attempted |
| Existing record changed | No | No edit action was attempted |

## Required Manual Checks

In a fresh authenticated session for the test environment, verify only the
following:

1. Open `CRM AI Gateway Demo - Modern` and enter Opportunities.
2. Click `New`, record the actual form name and `formid`, then cancel without saving.
3. Open one existing `[AI-DEMO]` Opportunity and record the actual form name,
   `formid`, and Form Selector entries.
4. Open the same record with the Full Replica `formid` and confirm no fallback.
5. Confirm the five tabs, Header order, read-only annual fields, hidden
   deprecated CNY field, and the Actual Management Subgrid.

Do not activate the BPF, publish again, modify configuration, or save data as
part of this browser-only check.

## Evidence and Safety

- Requested screenshot directory: `local-artifacts/d365/runtime-validation/r2e2d3/`
- Screenshots captured: 0, because the browser page could not be controlled
  reliably.
- Dataverse writes in this phase: 0
- Business data writes: 0
- Production requests: 0
- Publish/Activation actions: 0
- No App, Form, View, BPF, Plugin, or security configuration was changed.

## Next Step

Repeat only the browser runtime validation after the authenticated browser
session is responsive. Do not issue another `PublishXml` request.
