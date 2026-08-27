# Phase 1C-5R2E-2A1 Protected Form Drift Forensics

## Conclusion

**Classification: B. Shared localization propagation**

This is the best-supported classification. No inspected script or request artifact directly PATCHed or POSTed the Protected Form. The three changed nodes reuse the same FormXML IDs in the Full Replica, and the Protected Form now carries exactly the same 1033 labels as the Full Replica after the Opportunity publish.

The low-level solution-layer ordering cannot be independently enumerated because the tested environment does not expose a usable `solutionlayers` entity set. Therefore the report records the propagation evidence, but does not claim a definitive internal platform event.

## Environment And Form State

- Connected host: `org91f5f65f.crm5.dynamics.com`
- Production requests: `0`
- Protected Form: `8db60b46-b976-f111-ab0e-00224817cb31`
- Full Replica: `97a1555b-0903-408a-ac63-d63aed65b14a`
- Protected Form type: `2`
- Entity: `opportunity`
- Protected Form: active, non-default, unmanaged, `componentstate=0`
- Published and RetrieveUnpublishedMultiple both returned one Protected Form definition.

The standard `systemform` Web API type does not expose `modifiedon` or `modifiedby`. A read-only GET requesting `modifiedon` returned HTTP 400, `property not found on Microsoft.Dynamics.CRM.systemform`. No value was guessed or substituted.

Current hashes:

| Definition | FormXML | FormJSON | FormPresentation |
|---|---|---|---|
| Published | `494685f0454b4d79751a245ab6c3ae73dd9b4413a5af16467c02250110c74a05` | `94de2fe47db7300420c7fcf73c6c1ff24d830aefea9f4a1a765daf4cd728b8f9` | `5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9` |
| RetrieveUnpublished | `37e8ca647f3166149bae4fd45ada323d58a5015ddce84ee4fa553cf64484fd58` | `94de2fe47db7300420c7fcf73c6c1ff24d830aefea9f4a1a765daf4cd728b8f9` | `5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9` |

Published and unpublished definitions have no structural target-node difference. RetrieveUnpublished contains 88 additional `languagecode=2052` control-label resources; these are localization resources, not additional Tabs, Sections, Controls, or bindings.

## Semantic Diff

Semantic diff against the frozen Protected FormXML baseline:

- Semantic changes: **3**
- Changed structure: `0`
- Changed IDs: `0`
- Changed bindings/controls: `0`
- Changed labels: `3`
- Published versus unpublished structural changes: `0`

| Node | ID | Before, 1033 | Current, 1033 | 2052 resource |
|---|---|---|---|---|
| Section `aigw_summary_timeline` | `{56d20305-1c55-4534-9a13-602c229a1602}` | `Timeline / 活动` | `Timeline` | No direct Tab/Section 2052 label in the returned FormXML |
| Tab `Product_Line_Items` | `{79548060-31f7-4646-8c08-0296ecd4113b}` | `Products` | `产品` | No direct Tab/Section 2052 label in the returned FormXML |
| Tab `documents_sharepoint` | `{2A23BF76-D291-43BA-980B-738D39C68770}` | `Files` | `文件` | No direct Tab/Section 2052 label in the returned FormXML |

No target Control label, datafield binding, row, cell, section order, or Tab order changed.

## Full Replica Comparison

The corresponding Full Replica nodes use the same IDs and current 1033 labels:

- Timeline section: `{56d20305-1c55-4534-9a13-602c229a1602}`, `Timeline`
- Products tab: `{79548060-31f7-4646-8c08-0296ecd4113b}`, `产品`
- Files tab: `{2A23BF76-D291-43BA-980B-738D39C68770}`, `文件`

This shared-ID and matching-label pattern is evidence consistent with shared localization propagation. It is not consistent with a pure whitespace or attribute-order normalization, because the visible 1033 text changed.

## Direct Write Forensics

No direct Protected Form write was found.

- R2E-1B: PATCH target was only `systemforms(97a1555b-0903-408a-ac63-d63aed65b14a)`; Protected Form was read for hash protection. The four POSTs were option-label updates.
- R2E-1D: PATCH targets were only the Actual Management Form and View. Protected Form was read for protection verification.
- R2E-2A: requests were entity-scoped `PublishXml` calls for `aigw_actualmanagement` and `opportunity`; no PATCH/POST used the Protected Form ID.
- Git history, inspected local scripts, manifests, and request artifacts contain no direct Protected Form PATCH payload.

The drift was first observed immediately after the successful Opportunity `PublishXml`. The evidence cannot distinguish whether PublishXml materialized an existing shared localization state or caused a platform-level propagation event.

## Solution And Layer Evidence

The target solution is:

- Friendly name: `CRM AI Gateway Demo`
- Unique name: `CRMAIGatewayDemo`
- Managed: `false`

Direct solution components exist for both Forms as `componenttype=60`, and both point to the same unmanaged solution. The Protected Form component has `componentstate=0`; its root component behavior is null and its root solution component ID matches the solution root.

The environment did not provide a usable read-only layer endpoint:

- `/api/data/v9.2/solutionlayers`: HTTP 404, resource unavailable.
- `/api/data/v9.2/solutioncomponentdefinitions` with the attempted object filter: HTTP 400, property not exposed as queried.

Layer source result: **current unmanaged component confirmed; exact layer order/source not determinable**.

## Runtime Impact

The change affects runtime-visible text on the published Protected Form:

- `Timeline / 活动` now displays as `Timeline`.
- `Products` now displays as `产品`.
- `Files` now displays as `文件`.

The Full Replica already had these target labels, so its runtime visual output did not acquire a new difference from this event.

## Recommendation

No automatic restoration is recommended.

If the original Protected Form must be restored, the minimum separately authorized remediation would be to restore only these three 1033 labels, read back Published/Unpublished definitions, and perform a fresh protected-hash audit. A targeted Opportunity publish would likely be required for a restored unpublished FormXML to become runtime-visible; that publish must not be performed in this forensic phase.

R2E-2B is **not approved yet**. First obtain an explicit owner decision to accept shared localization propagation or authorize the narrowly scoped restoration. Do not activate Forms/BPFs, modify the App, or seed data while this protection decision is open.

## Request Accounting

| GET | POST | PATCH | DELETE | Publish | Business writes | Production requests |
|---:|---:|---:|---:|---:|---:|---:|
| 41 | 0 | 0 | 0 | 0 | 0 | 0 |

GET includes read-only compatibility probes and failed read-only schema probes. No write request was sent.

Evidence JSON:

`local-artifacts/d365/plugin-registration/phase1c5r2e2a1-protected-form-drift-forensics.json`
