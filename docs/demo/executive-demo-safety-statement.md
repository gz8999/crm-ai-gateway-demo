# Executive Demo Safety Statement

## Runtime Boundary

- Data source: `D365 Frozen Dataset` in `org91f5f65f.crm5.dynamics.com`.
- Dataverse access: GET-only and limited to the frozen Demo200 allowlist.
- CRM writeback: disabled. POST/PATCH/DELETE/Publish are not part of the runtime.
- External LLM auto run: disabled. External status is `Controlled Validation Pending` / `受控验证中`.
- Controlled validation budget: 16/16 calls used; 5/8 scenario snapshots are retained. This does not authorize a live demo call or imply full eight-scenario validation.
- Production access: disabled; the production hostname is denied.

## Safe Context

Customer and contact identities, Dataverse GUIDs, exact amounts, raw Timeline text, raw OpportunityClose text, Scenario IDs, Golden metadata, and expected answers are excluded from model-safe context. Exact amounts may be displayed only after explicit UI confirmation and never enter Safe Context, logs, URLs, local storage, provider input, or audit prose.

The deterministic Health Score v2 and Decision Pack use only allowlisted facts, amount bands, derived signals, relative dates, evidence tokens, and safe summaries. Actions remain `Draft Only`; `CRM Writeback Disabled` is visible in the Action Board.

## Failure Behavior

If the D365 read-only runtime is unavailable, the product displays `D365 Runtime Temporarily Unavailable` and does not silently switch to Local Fixture. A future pre-generated snapshot may be shown only with the explicit label `Frozen Runtime Snapshot`; it must never be described as live data.
