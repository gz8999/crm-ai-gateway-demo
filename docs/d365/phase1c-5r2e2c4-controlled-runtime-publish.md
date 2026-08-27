# Phase 1C-5R2E-2C4 Controlled Runtime Publish

## Result

**Controlled Runtime Publish Ready=false.** The targeted Opportunity `PublishXml` request was aborted by the client before an HTTP response was received. The execution stopped immediately and did not send the Modern App publish request. A delayed read-only check confirmed that Dataverse completed the Opportunity publish on the server.

This is a partial publish result:

- Opportunity publish: `completed_after_client_abort`
- Modern App publish: not sent
- Automatic retry: none

## Pre-Publish Gates

All gates passed before the single Opportunity publish request:

- Full Replica unpublished: Active
- Full Replica published runtime: Inactive
- Full Replica: Non-default
- Structure: 5 Tabs / 19 Sections / 114 Controls / 106 unique bound fields
- Header: `aigw_winprobabilityrank` → `aigw_budgetstatus` → `ownerid`
- `aigw_yearrevenueactual`: one control, read-only
- `aigw_yearrevenueactual_base`: one control, read-only
- `aigw_yearrevenueactualcny`: zero controls
- `actualvalue_base`: zero controls
- Protected Form hash matched the restored baseline
- Actual Management Form/View unchanged
- Opportunity and Actual Management navigation present
- Full Replica was the only explicit Opportunity Form component
- Opportunity and Actual Management target Views present exactly once
- Generic `entity` App component count: 0
- Plugin: Enabled 7 / Disabled 0
- Custom BPF: Draft/Inactive
- Both dependency tables existed in `CRMAIGatewayDemo` as metadata-only Solution components

## ValidateApp Before Publish

- ValidationSuccess: true
- Errors: 0
- Warnings: 4
- Unique required components: 2

The warning component set was exactly:

- Full Replica Form
- Opportunity Product Inline Edit View: Bundle Products
- Opportunity Product Inline Edit View
- Document Associated Grid

The required component set was exactly:

- `opportunityproduct`
- `sharepointdocument`

No additional warning, error, or required component was present.

## Opportunity Publish

Targeted parameter:

```xml
<importexportxml><entities><entity>opportunity</entity></entities></importexportxml>
```

Client result:

- HTTP status: unavailable
- Error: `This operation was aborted`
- Retry: not attempted

Delayed read-only server result:

- Full Replica published runtime: Active
- Full Replica: Non-default
- Published structure: 5 / 19 / 114 / 106
- Published and unpublished semantic projection hashes: equal
- Published FormXML SHA-256: `2b5d3339bae2bd59fc4b34fb0dd55770ef0d3fe37fc01357be387ea225159545`
- Unpublished FormXML SHA-256: `374921cee60b4972a6620b97278d3df921274c3615c1e291b7c42df38305bb2f`
- Published and unpublished FormJSON SHA-256: `8c637960911241d747aba83c8dfe445dbb86b274075ad9c4b3ce61bae5d83317`

The raw FormXML hashes differ because the published and unpublished platform representations differ, but their normalized control projection is identical and all required counts and bindings match.

## ValidateApp After Opportunity Publish

- ValidationSuccess: true
- Errors: 0
- Warnings: 4
- Unique required components: 2
- Warning signature unchanged: Yes
- Required component set unchanged: Yes

The four accepted ALM warnings remained exactly the pre-publish set. No new warning, error, or dependency appeared.

## Modern App Publish

Modern App `PublishXml` was **not sent** because the Opportunity request raised a client-side abort and the run was required to stop.

Read-back confirms:

- Published Modern App row count: 0
- Unpublished Modern App remains present
- Unpublished component state: Unpublished
- Opportunity navigation remains present
- Actual Management navigation remains present
- App content was not modified by this phase

## Protection Verification

- Protected Form hash: `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`
- Actual Management Form/View: unchanged
- Custom BPF: Draft/Inactive
- Plugin: Enabled 7 / Disabled 0
- Old App: unchanged
- Sales trial: unchanged
- AddAppComponents: 0
- RemoveAppComponents: 0
- Form/View/App content updates: 0
- Activation actions: 0
- Business writes: 0
- Production requests: 0

## Request Accounting

Combined execution and read-back evidence:

- GET: 58
- POST actions excluding PublishXml: 0
- PATCH: 0
- DELETE: 0
- PublishXml attempts: 1, Opportunity only
- Successful server-side entity publish observed: 1
- Modern App PublishXml: 0
- Activation: 0
- Business writes: 0
- Production requests: 0

## Next Gate

Browser Runtime Validation is not yet authorized because the Modern App has not been published.

The safest next phase is a separately authorized **Modern App publish only** resume. It must:

1. Not republish Opportunity.
2. Confirm Full Replica published runtime is already Active and Non-default.
3. Confirm the four warning signatures remain unchanged.
4. Publish only App ID `916afe4b-607e-f111-ab0e-002248eb1915`.
5. Read back published navigation, the sole Opportunity Form selection, and both target Views.
6. Stop without retry on any timeout, lock, or new validation issue.

Local evidence:

- `local-artifacts/d365/plugin-registration/phase1c5r2e2c4-controlled-runtime-publish.json`
- `local-artifacts/d365/plugin-registration/phase1c5r2e2c4-post-abort-readback.json`
