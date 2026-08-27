# Phase 1C-5R2E-5 Controlled Demo Data

## Result

- Environment: `org91f5f65f.crm5.dynamics.com`
- Current status: `Ordinary-user read-only demo acceptance complete`
- Synthetic prefix: `[AI-DEMO-R2E5]`
- Created Account / Opportunity / Actual: `1 / 2 / 1`
- Production requests: `0`
- `R2E Demo Ready=true`

The original blocked result is preserved below. A separately authorized corrected run subsequently used the One-Actual option.

## Corrected One-Actual Run

### Created Records

| Type | Name | Test-environment ID |
|---|---|---|
| Account | `[AI-DEMO-R2E5] Synthetic Logistics Account` | `bc1bfb52-2c80-f111-ab0e-000d3a82d194` |
| Opportunity | `[AI-DEMO-R2E5] Monthly Actuals Scenario` | `4d1cfb52-2c80-f111-ab0e-000d3a82d194` |
| Opportunity | `[AI-DEMO-R2E5] Pipeline Comparison Scenario` | `cf1cfb52-2c80-f111-ab0e-000d3a82d194` |
| Actual Management | `[AI-DEMO-R2E5] Four-Month Actual` | `f91cfb52-2c80-f111-ab0e-000d3a82d194` |
| Contact | `[AI-DEMO-R2E5] Synthetic Contact` | `8739f69c-4b80-f111-ab0e-000d3a82d194` |

All names use the approved prefix. The values, descriptions, dates, and amounts are synthetic. No production GUID was imported.

### Four-Month And Plugin Validation

| Field | Saved value |
|---|---:|
| April Revenue | 100 |
| May Revenue | 200 |
| June Revenue | 300 |
| July Revenue | 400 |
| Generated Annual Actual Revenue | 1,000 |
| Parent Opportunity annual Revenue | 1,000 |

- The Actual is related only to `4d1cfb52-2c80-f111-ab0e-000d3a82d194`.
- That Opportunity has exactly one Actual.
- `cf1cfb52-2c80-f111-ab0e-000d3a82d194` has zero Actuals and no parent annual total.
- The Actual inherits CNY from the Opportunity.
- Location resolves to existing `01: Beijing` (`1f4e1d38-537f-f111-ab0e-70a8a5007736`).
- All four POL/POD lookups reuse existing `9999: OTR` (`801b12b1-987e-f111-ab0e-002248eb1915`).
- No Location or POL/POD master data was created or changed.
- Neither `aigw_yearrevenueactualcny` nor any generated annual/base field was present in a create payload.
- The created Opportunity has Activity/Note counts `0/0`.

### Runtime Validation

Server-side readiness is true. Browser control timed out twice while obtaining a read-only Dynamics DOM/screenshot, and no currently controllable tab provided verifiable `CRM AI Demo User` evidence. An administrator session was not accepted as a substitute.

The following ordinary-user checks therefore remain pending:

- both Opportunities visible in the list;
- Full Replica route;
- Location and POL/POD rendering;
- one-row Actual subgrid and annual total;
- native Timeline and BPF display;
- absence of permission, loading, and console P0/P1 errors.

No browser save, create, update, or delete action occurred.

### Corrected Cleanup Manifest

Delete only these IDs, in this order, under separate cleanup authorization:

1. Actual Management: `f91cfb52-2c80-f111-ab0e-000d3a82d194`
2. Opportunity: `4d1cfb52-2c80-f111-ab0e-000d3a82d194`
3. Opportunity: `cf1cfb52-2c80-f111-ab0e-000d3a82d194`
4. Account: `bc1bfb52-2c80-f111-ab0e-000d3a82d194`

Location and POL/POD arrays are explicitly empty.

### Corrected Run Requests

```text
GET=101
POST=4
PATCH=0
DELETE=0
Publish=0
Client business creates=4
Expected Plugin parent-total side effect=1
Production requests=0
```

The first Apply attempt failed at the local test-environment classification gate before authentication or any Dataverse request. The successful Apply used process-local test classification and production denylist values; no `.env` or global authentication configuration was changed.

### Corrected Run Gates

| Gate | Result |
|---|---|
| Synthetic Data Only | true |
| Baseline Opportunity Preserved | true |
| Duplicate Demo Records | 0 |
| One Actual Per Opportunity Ready | true |
| Four Month Fields Ready | true |
| Demo Relationships Valid | true |
| Actual Totals Plugin Ready | true |
| Ordinary User Demo Runtime Ready | false - browser evidence deferred |
| Cleanup Manifest Ready | true |
| Protected Form/BPF/Plugin Integrity | true |
| Production Isolation Ready | true |
| R2E Demo Ready | false |

Corrected-run issue count: P0=`0`, P1=`1` (ordinary-user browser evidence unavailable), P2=`0`.

## Business Completeness Correction

### Verified Field Contract

| Business meaning | Logical name | Type | Metadata required | Form required | Result |
|---|---|---|---|---|---|
| April-July actual GP | `aigw_aprilactualgp`, `aigw_mayactualgp`, `aigw_juneactualgp`, `aigw_julyactualgp` | Money | None | Optional | Updated on the existing Actual |
| Annual actual Revenue | `aigw_annualactualrevenue` | Money | None | Read-only control | Plugin-managed, remains 1,000 |
| Annual actual GP | none | Not present | N/A | N/A | Derived for demo only; no Dataverse field exists |
| Sales Person 1 | `aigw_sales` | String | None | Optional | Set to `[AI-DEMO-R2E5] Demo Sales Owner` |
| Sales Person 2-4 | `aigw_salesperson2`, `aigw_salesperson3`, `aigw_salesperson4` | String | None | Optional | Remain empty |
| Customer Contact 1 | `parentcontactid` | Lookup to Contact | None | Optional | Bound to the synthetic Contact |
| Customer Contact 2-5 | `aigw_customercontact2` through `aigw_customercontact5` | String | None | Optional | Remain empty |
| Budget classification | `aigw_budgetstatus` | Boolean | None | Optional | `false` / 预算外 |
| April-March budget Revenue | `aigw_m4revenuebudget` through `aigw_m3revenuebudget` | Money | None | Optional | Not applicable; no writes |
| April-March budget GP | `aigw_m4gpmpbudget` through `aigw_m3gpmpbudget` | Money | None | Optional | Not applicable; no writes |
| April-March budget volume | `aigw_m4volumebudget` through `aigw_m3volumebudget` | Decimal | None | Optional | Optional; no writes |
| Annual budget Revenue / GP | `aigw_yearrevenuebudget`, `aigw_yeargpmpbudget` | Decimal | None | Optional | Not applicable; no writes |

The deployed Plugin reads only the 12 monthly Revenue fields, writes `aigw_annualactualrevenue`, and synchronizes `opportunity.aigw_yearrevenueactual`. Monthly GP/MP and annual GP/MP are outside its write contract. The annual GP value below is therefore a transparent report calculation, not a persisted or implied Plugin result.

### Data Correction Result

| Measure | April | May | June | July | Annual/derived |
|---|---:|---:|---:|---:|---:|
| Actual Revenue | 100 | 200 | 300 | 400 | 1,000 (stored Plugin total) |
| Actual GP | 10 | 20 | 30 | 40 | 100 (derived) |
| GP margin | 10% | 10% | 10% | 10% | 10% (derived) |

- Actual count remains `1` for the primary Opportunity and `0` for the comparison Opportunity.
- Parent annual Revenue remains `1,000`; no deprecated CNY field was written.
- The primary Opportunity is explicitly budget-outside, so monthly and annual budget writes were correctly skipped.
- Sales Person 1 and Contact 1 now have synthetic values; Sales Person 2-4 remain empty.
- Contact `8739f69c-4b80-f111-ab0e-000d3a82d194` is related only to the synthetic Account.
- Activity/Note delta is `0/0`; the protected baseline Opportunity has zero field changes.

### Required Rule Matrix

| Rule | Target behavior | Implemented now | Reason |
|---|---|---|---|
| Sales Person 1 | Required | No | Current column and form are optional; a global change could block unrelated existing records |
| Sales Person 2-4 | Optional | Already optional | Matches requested rule |
| Customer Contact 1 | Required | No | Current lookup and form are optional; requires a separately reviewed form/data-readiness change |
| Actual GP when corresponding Revenue > 0 | Conditional required; margin 5%-15% | No | Requires conditional validation, not a static Required Level |
| Budget Revenue/GP for budget-inside projects | Conditional required for all 12 months | No | Requires a Business Rule or equivalent conditional validation and regression review |
| Budget volume | Optional | Already optional | Matches requested rule |
| Calculated, summary, base, hidden, deprecated fields | Never required | Unchanged | Protected from accidental configuration |

No Form, Metadata, Business Rule, Plugin, or publication change was made. These conditional requirements require a separately authorized configuration phase with an existing-record impact audit and ordinary-user save-flow regression test.

### Updated Cleanup Manifest

Delete only under separate cleanup authorization, in this order:

1. Actual Management `f91cfb52-2c80-f111-ab0e-000d3a82d194`
2. Opportunities `4d1cfb52-2c80-f111-ab0e-000d3a82d194`, `cf1cfb52-2c80-f111-ab0e-000d3a82d194`
3. Contact `8739f69c-4b80-f111-ab0e-000d3a82d194`
4. Account `bc1bfb52-2c80-f111-ab0e-000d3a82d194`

Location and POL/POD remain excluded.

### Correction Requests And Protection

```text
Read-only mapping: GET=12
Correction run: GET=20, POST=1, PATCH=2, DELETE=0, Publish=0
Protection read-back: GET=15
Business writes: Contact create=1, Actual update=1, Opportunity update=1
Budget writes=0
Production requests=0
```

Protection read-back: Protected Form hash unchanged; Full Replica `5/19/115/106`; Timeline `1/0`; Plugin `1/3/7/0`; protected BPF instance remains unique at `案件关闭`; Location and master data unchanged.

Correction issue count: P0=`0`, P1=`1` (ordinary-user read-only runtime evidence remains deferred), P2=`1` (annual GP is derived because no annual GP field exists).

## Ordinary User Read-Only Demo Acceptance

The user-provided `CRM AI Demo User` runtime evidence confirms that the primary synthetic Opportunity opens in Full Replica and renders Sales Person 1, Contact 1, Location, all POL/POD lookups, the single Actual row, Timeline, and BPF without a permission or loading error. No administrator session was used as acceptance evidence.

Runtime observations:

- Opportunity 1 routes to Full Replica and shows the populated synthetic Sales Person 1 and Contact 1.
- Budget status is 预算外; budget month completion is not applicable to this record.
- Actual subgrid count is `1`; Opportunity 2 Actual count is `0`.
- April-July Revenue is `100/200/300/400`; April-July GP is `10/20/30/40`.
- Annual Actual Revenue and parent annual Revenue are both `1,000`.
- Derived annual GP is `100`, with a derived margin of `10%`; no annual GP schema field was added.
- Timeline contains no Activity or Note.
- BPF, Location, and POL/POD render without permission, target, or component errors.

An independent post-acceptance server read-back used GET requests only and confirmed all five fixed IDs, their relationships, the one-Actual cardinality, values, and unchanged timestamps. It also confirmed:

```text
GET=16
POST=0
PATCH=0
DELETE=0
Publish=0
Business writes=0
Production requests=0
```

Protected Form hash remains `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`; Full Replica remains `5/19/115/106` with Timeline `1/0`; the BPF definition hash and process order remain unchanged; Plugin remains `1 Assembly / 3 Types / 7 enabled / 0 disabled`.

Final issue count: P0=`0`, P1=`0`, P2=`1` (annual GP remains an explicit derived calculation).

### Final Gates

| Gate | Result |
|---|---|
| Ordinary User Demo Runtime Ready | true |
| Synthetic Data Only | true |
| Demo Relationships Valid | true |
| One Actual Per Opportunity Ready | true |
| Four Month Revenue And GP Ready | true |
| Actual Totals Plugin Ready | true |
| Baseline Opportunity Preserved | true |
| Cleanup Manifest Ready | true |
| Production Isolation Ready | true |
| P0/P1 | `0/0` |
| R2E Demo Ready | true |

## Final Business Completeness

The final dataset now separates two complementary scenarios without adding records:

1. Opportunity 1 remains the budget-outside actuals scenario.
2. Opportunity 2 is the budget-inside budget scenario.

### Opportunity 2 Field Mapping

| Meaning | Logical name | Metadata result |
|---|---|---|
| Budget status | `aigw_budgetstatus` | Boolean, writable |
| Sales Person 1 | `aigw_sales` | String, writable |
| Contact 1 | `parentcontactid` | Contact lookup, writable |
| April-March Revenue budget | `aigw_m4revenuebudget` through `aigw_m3revenuebudget` | Money, writable, `SourceType=0` |
| April-March GP budget | `aigw_m4gpmpbudget` through `aigw_m3gpmpbudget` | Money, writable, `SourceType=0` |
| April-March volume budget | `aigw_m4volumebudget` through `aigw_m3volumebudget` | Decimal, optional, left empty |
| Annual Revenue budget | `aigw_yearrevenuebudget` | Decimal, writable, `SourceType=0` |
| Annual GP budget | `aigw_yeargpmpbudget` | Decimal, writable, `SourceType=0` |

The annual fields are ordinary fields rather than calculated or rollup fields. Their values were explicitly written as the arithmetic sums of the 12 monthly values. April Revenue is Metadata `Recommended`; it is not Business Required and was populated as part of the complete scenario. No Required Level or Business Rule was changed.

### Opportunity 2 Budget Values

| Fiscal month order | Revenue budget | GP budget | Margin | Volume |
|---|---:|---:|---:|---|
| April | 50,000 | 5,000 | 10% | empty |
| May | 50,000 | 5,000 | 10% | empty |
| June | 50,000 | 5,000 | 10% | empty |
| July | 50,000 | 5,000 | 10% | empty |
| August | 50,000 | 5,000 | 10% | empty |
| September | 50,000 | 5,000 | 10% | empty |
| October | 50,000 | 5,000 | 10% | empty |
| November | 50,000 | 5,000 | 10% | empty |
| December | 50,000 | 5,000 | 10% | empty |
| January | 50,000 | 5,000 | 10% | empty |
| February | 50,000 | 5,000 | 10% | empty |
| March | 50,000 | 5,000 | 10% | empty |
| **Annual** | **600,000** | **60,000** | **10%** | **empty** |

Sales Person 1 is `[AI-DEMO-R2E5] Demo Sales Owner`; Contact 1 reuses synthetic Contact `8739f69c-4b80-f111-ab0e-000d3a82d194`. Sales Person 2-4 remain empty and optional. Opportunity 2 remains without an Actual record.

### Final Integrity Read-Back

- Opportunity 1 and its Actual have unchanged timestamps and values.
- Opportunity 1 Actual count=`1`; Opportunity 2 Actual count=`0`.
- Prefix counts remain Account/Opportunity/Actual=`1/2/1`; no Account, Opportunity, Actual, or Contact was created.
- Opportunity 2 Activity/Note delta=`0/0`.
- Protected Form, BPF, Full Replica, Plugin, Location, POL/POD, and master data were not modified.
- Cleanup IDs and deletion order are unchanged; the ignored manifest now records the two scenario purposes.

```text
Dry-run GET=10, writes=0
Apply GET=17, PATCH=1, POST=0, DELETE=0, Publish=0
Protection GET=15
Prefix audit GET=4
Production requests=0
```

Final-business-completeness issues: P0=`0`, P1=`0`, P2=`1` (annual actual GP remains derived).

## Ordinary User Budget Scenario Final Acceptance

Two user-provided screenshots from `CRM AI Demo User`, retained outside Git, complete the runtime evidence:

- Screenshot 1 shows `CRM AI Gateway Demo - Modern`, the `[AI-DEMO-R2E5] Pipeline Comparison Scenario`, Full Replica's Budget tab, budget-inside status, and April-December Revenue/GP values of `50,000/5,000`. Budget volume is visibly empty.
- Screenshot 2 shows the same Full Replica record, Contact 1, Sales Person 1, `01: 预算内`, annual Revenue `600,000`, and annual GP `60,000`, without a permission or component error.

The screenshot viewport does not expose January-March simultaneously; the final GET-only Dataverse read-back independently confirms all 12 Revenue values are `50,000` and all 12 GP values are `5,000`. It also confirms Contact 1, Sales Person 1, budget-inside status, annual totals, and Actual count `0`.

Final post-acceptance evidence:

```text
Scenario read-back: GET=10, POST/PATCH/DELETE/Publish=0
Protection read-back: GET=15, POST/PATCH/DELETE/Publish=0
Prefix/count audit: GET=4, POST/PATCH/DELETE/Publish=0
Business writes=0
Production requests=0
```

Opportunity 1 and its Actual remain unchanged. Prefix counts remain Account/Opportunity/Actual=`1/2/1`; Activity/Note delta remains `0/0`; Protected Form hash, BPF definition/instance, Full Replica `5/19/115/106`, Plugin `7/0`, Location, and POL/POD remain unchanged.

### Final Runtime Gates

| Gate | Result |
|---|---|
| Ordinary User Demo Runtime Ready | true |
| Budget Scenario Runtime Ready | true |
| Demo Data Integrity Ready | true |
| Production Isolation Ready | true |
| P0/P1 | `0/0` |
| R2E Demo Ready | true |

## Blocking Contract Conflict

The requested dataset requires four Actual Management records under one Opportunity while also requiring that no duplicate rejection occur. The deployed and tested Plugin contract permits **at most one Actual Management record per Opportunity**.

Independent evidence:

1. `scripts/dataverse/lib/phase1c5-plugin-browser-smoke-contract.mjs` freezes `maximumRelatedActuals: 1` with uniqueness scoped to `aigw_opportunityid`.
2. `docs/d365/phase1c-5r2e2e1b-plugin-smoke-contract-correction.md` defines the deployed cardinality as one Actual per Opportunity.
3. `ActualTotalsService` raises an integrity exception when an Opportunity has more than one related Actual.
4. The enabled PreValidation Create step is designed to reject the second Actual before it persists.

Consequently, the following requirements cannot simultaneously be true without changing the authorized scope:

- one Opportunity has four Actual records;
- no duplicate rejection is triggered;
- Plugin remains unchanged at `7 enabled / 0 disabled`;
- P1 is zero.

No attempt was made to bypass the Plugin, disable a step, reinterpret four records as four month fields, or partially create Account/Opportunity records.

## Read-Only Preflight

Exact FetchXML literal-prefix matching returned:

| Entity | Existing `[AI-DEMO-R2E5]` records |
|---|---:|
| Account | 0 |
| Opportunity | 0 |
| Actual Management | 0 |

The first two exploratory prefix queries used an unsafe bracket representation and returned unfiltered environment rows. Those results were rejected as invalid evidence. The final query used the repository-established FetchXML pattern `like '[[]AI-DEMO-R2E5]%'` and is the authoritative result.

Active Location count remains `51`; no Location or POL/POD row was created or changed.

## Protected Baseline

| Item | Read-back result |
|---|---|
| Protected Opportunity | `f9b6f99b-2078-f111-ab0e-000d3a857307` |
| BPF instance | `221ed4a5-0780-f111-ab0e-000d3a82d194`, count/duplicate `1/0` |
| Active stage | `案件关闭` |
| Opportunity state/status | `0/1` |
| `actualclosedate` | empty |
| Actual/Activity/Note | `0/0/0` |
| Process order | `0` |
| Protected Form hash | `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7` |
| Full Replica | `5/19/115/106`, Timeline `1/0` |
| Plugin | `7 enabled / 0 disabled` |

The protected Opportunity `modifiedon` and `versionnumber` remain unchanged from the R2E-4 baseline.

## Created Data

None. There are no new IDs, relationships, monetary values, BPF instances, activities, notes, or cleanup targets from this phase.

## Cleanup Manifest

The phase created nothing, so the immediate cleanup manifest is empty:

```text
accounts=[]
opportunities=[]
actualManagement=[]
activities=[]
notes=[]
```

For a separately authorized corrected run, cleanup must delete only execution-recorded IDs in this order:

1. Actual Management records created by that run;
2. Opportunities created by that run;
3. the Account created by that run;
4. read back the prefix and require zero residual rows.

Location and POL/POD master data must never be included in cleanup.

## Safe Resolution Options

One option must be explicitly authorized before retrying:

1. **One-Actual option:** create one Actual under one Opportunity and populate four distinct monthly Revenue fields on that single record. This preserves the current Plugin contract.
2. **Four-Opportunity option:** create four synthetic Opportunities and one Actual under each. This preserves the current Plugin contract but expands the requested minimum dataset.
3. **Schema/Plugin redesign:** support multiple Actual rows per Opportunity with a new uniqueness dimension. This is a separate architecture, schema, Plugin, registration, and migration phase and is not recommended merely for demo data.

## Requests And Writes

```text
GET=27
POST=0
PATCH=0
DELETE=0
Publish=0
Business writes=0
Production requests=0
```

## Issues And Gates

- P0: `0`
- P1: `1` - requested four-child dataset conflicts with deployed one-child cardinality
- P2: `0`

| Gate | Result |
|---|---|
| Synthetic Data Only | true (no data created) |
| Baseline Opportunity Preserved | true |
| Duplicate Demo Records | 0 |
| Demo Relationships Valid | false (dataset not created) |
| Actual Month Uniqueness | false (dataset not created) |
| Actual Totals Plugin Ready | true for its deployed one-Actual contract |
| Ordinary User Demo Runtime Ready | false |
| Cleanup Manifest Ready | true (empty current manifest plus ordered future template) |
| Protected Form/BPF/Plugin Integrity | true |
| Production Requests | 0 |
| P0/P1 | `0/1` |
| R2E Demo Ready | false |

## Local Verification

- `npm test`: `184/184 passed`
- `npm run build`: passed
- `git diff --check`: passed
- Sensitive scan: passed
