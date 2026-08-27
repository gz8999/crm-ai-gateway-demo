# Phase 1C-5R2C Plugin Rollback Runbook

Rollback requires a separate approval from the designated test-environment owner. It is not automatic and was not performed in this phase.

## Trigger

Use this runbook for an unexpected Plugin error, incorrect totals, failed smoke test, registration conflict, or unsafe runtime behavior. Capture the error, UTC timestamp, affected synthetic record key, current Step status, and relevant trace evidence before changing metadata.

## Approval

The test-environment owner and the designated CRM administrator approve the rollback. Production access is never part of this procedure.

## Actions

1. Disable all seven new Steps.
2. Verify that no new Plugin executions remain active.
3. Delete the newly registered Images.
4. Delete the newly registered Steps.
5. Delete Plugin Types if the registration tool requires that cleanup.
6. Delete the Assembly only after checking for remaining dependencies.
7. Re-read metadata to confirm the Actual Management table and existing solution components remain.
8. Preserve synthetic test data until the investigation is complete; do not delete records as an automatic rollback action.

Never delete or modify `aigw_actualmanagement`, its columns, `aigw_opportunity_actualmanagement`, the Full Replica Form/View, Business Rule, BPF, Opportunity data, or Actual Management data without separate authorization.

## Recovery

After root cause correction, return to the registration dry-run, re-verify the frozen SHA-256/token, register disabled components only, and repeat grouped smoke tests. Do not enable or publish as part of rollback.
