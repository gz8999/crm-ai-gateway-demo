# Phase 1C-5R2G-C1 Metadata Preflight

## Boundary

- Environment: test hostname only.
- Dataverse operations: GET only.
- Business CRM record reads: **0**.
- POST/PATCH/DELETE/Publish: **0/0/0/0**.
- Production requests: **0**.
- External LLM calls: **0**.
- Real CRM business data exposure: **0**.

Public evidence contains only logical metadata, safe workbook tokens, counts, and readiness. Test-environment record IDs are restricted to the ignored private manifest.

## Entity and field preflight

The preflight read EntitySet, primary ID/name, ownership, attribute, relationship, key, solution component, and role metadata for the required entities. Native Timeline fields for phone call, appointment, task, and annotation were present.

One workbook logical name is unknown:

| Workbook sheet | Workbook field | Deployed result | Required correction |
| --- | --- | --- | --- |
| Opportunity | `primarycontactid` | Not present | Map Contact 1 to deployed `parentcontactid` after a separate offline workbook correction |

The deployed Opportunity lookup targets include Account, Contact, Currency, Owner, Location, and the four POL/POD lookups. Actual targets Opportunity/Currency; Coverage targets Account/Team; Signal targets Account/Opportunity/Team.

Annual Actual semantics are unchanged: the child Actual row stores `aigw_annualactualrevenue`; the plugin synchronizes the parent Opportunity field `aigw_yearrevenueactual`. The deprecated `aigw_yearrevenueactualcny` is not generated.

## Choice preflight

- Unknown Choice values: **0**.
- Choice value conflicts: **1 semantic group**.
- Choice label conflicts: **3 groups**.

| Attribute | Value | Workbook label | Current metadata label | Impact |
| --- | ---: | --- | --- | --- |
| `aigw_opportunitydetailtype` | 91 | `91: Others` | `91: 其他` | Label correction required for 30 rows |
| `aigw_goodshandled` | 21 | `21: 医疗器械` | `21: 文具` | Semantic value/label correction required for 12 rows; current Medical Devices value is 20 |
| `aigw_goodshandled` | 91 | `91: Others` | `91: 其他` | Label correction required for 66 rows |
| `aigw_globalinitiative` | 91 | `91: Others` | `91: 无` | Semantic label correction required for 150 rows |

Opportunity Type and Case Stage use the explicitly approved simplified Chinese workbook display labels while preserving the deployed numeric values. This controlled presentation normalization is recorded as P2 rather than silently treated as exact metadata text.

## Reference masters

| Reference | Safe tokens | Result |
| --- | ---: | --- |
| Location | 51 distinct workbook values | All resolve uniquely to active records |
| POL/POD | 7 distinct workbook values including `9999: OTR` | All resolve uniquely to active records |
| Currency | `CNY` | Resolves uniquely |
| Coverage responsible Team | `TEST-TEAM-TOKEN` | Existing approved mapping revalidated |
| Owner | `OWNER-DEMO-01..06` | No approved unique mapping |
| Signal sales department Team | `DEPT-01`, `DEPT-03`, `DEPT-04` | No approved unique mapping |

The sales-person and introducer columns are deployed String attributes, not Dataverse lookups; their synthetic text therefore does not require reference-record resolution.

## Actual, Coverage, and Timeline

- Actual = 100; Won/Active/Lost = **55/45/0**; duplicate Opportunity Actual = 0.
- Coverage = 210; seven per Account; composite key contract remains Account + Service Type + Start Date; overlapping windows = 0.
- Timeline = 1400; exact duplicates = 0; every Opportunity has at least three native activity types; all appointment briefings contain the required eight sections.
- Signal = 1050; every source token exists; Timeline coverage = 75%.
- Email and attachments are outside the import design.
- Timeline creation is not designed to create or switch BPF instances.

## Pilot feasibility

An exhaustive 30-choose-3 check found **0** three-Account subsets satisfying the mandatory five scenarios together with departments, booking departments, statuses, and Actual count 8-12.

The only four-Account solution is `A-002`, `A-006`, `A-015`, `A-019`. It would contain 8 Contacts, 20 Opportunities, 12 Actuals, and 28 Coverage rows before Timeline sampling, so it cannot be silently substituted for the approved 3/6/15/21 Pilot contract.

## Issues

- P0: **0**
- P1: **5**
- P2: **1**

Pilot selection and workbook generation remain blocked pending an explicit offline contract/workbook correction. No Dataverse change is required to resolve the workbook logical-name and Choice issues; Owner/Team mappings require an approved test-environment reference-mapping decision.

## C1-R2 v4.1 recheck update

The original C1 findings above remain historical evidence. The accepted v4.1 derivative now resolves `parentcontactid` and all four Choice conflicts: Unknown Logical Names/Choice Values/Semantic Conflicts=`0/0/0`. Owner strategy A has a viable read-only candidate but remains unapproved. No three distinct secured, business-semantic Department Team candidates exist, so Team setup remains the only technical P1. The four-account recommendation is frozen at `A-002/A-006/A-015/A-019` with complete Timeline/Signal extraction `260/194`; it is not yet an approved Pilot dataset.
