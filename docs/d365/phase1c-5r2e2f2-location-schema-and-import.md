# Phase 1C-5R2E-2F2 Location Schema And Import

## Decision

- `Server-side Ready=true`
- `Runtime Validation Deferred=false`
- `Location Schema Runtime Ready=true`
- `Server-side Import Ready=true`
- `Location Schema and Import Ready=true`
- `Location Residual Mismatch Count=0`

The Location schema, Opportunity Lookup, View, Full Replica binding and targeted
publication are complete. Manual runtime evidence confirms the published native
Lookup opens in Full Replica without permission, target, component, or loading
errors. The R2 resume imported and independently verified all 51 Location master
records. The user then completed the populated Lookup and search checks in the
published Modern App without selecting or saving a Location.

## Environment And Baseline

- Host: approved test organization only
- Solution: `CRMAIGatewayDemo`, unmanaged, publisher prefix `aigw`
- Protected Form XML hash: `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`
- Protected Form JSON hash: `94de2fe47db7300420c7fcf73c6c1ff24d830aefea9f4a1a765daf4cd728b8f9`
- Full Replica before: 5 tabs / 19 sections / 115 controls / 106 unique fields
- Plugin: 1 Assembly / 3 Types / 7 enabled Steps / 0 disabled Steps
- BPF: Draft / Inactive
- `aigw_polpodlocation`: independently present and unchanged

## Created Schema

| Component | Definition | ID |
| --- | --- | --- |
| Location table | `aigw_location`, Organization-owned | `6e19e1da-4e7f-f111-ab0e-70a8a5007736` |
| Primary name | `aigw_name`, String 200, Business Required | `6f19e1da-4e7f-f111-ab0e-70a8a5007736` |
| Entity Set | `aigw_locations` | Metadata-derived |
| Primary ID | `aigw_locationid` | Metadata-derived |
| Opportunity Lookup | `aigw_opportunitylocation`, Optional | `bf91d1c5-a078-40e3-9bb0-8afa1d1c54b4` |
| Relationship | `aigw_location_opportunities` | `5475a62b-4f7f-f111-ab0e-70a8a5007736` |
| Lookup View | `Location Lookup View - AI Demo` | `f882ce37-4f7f-f111-ab0e-70a8a5007736` |

The relationship targets `aigw_location`; Delete is Restrict and Assign, Merge,
Reparent, Share and Unshare are NoCascade. The View filters `statecode=0`, contains
only `aigw_name`, and sorts ascending.

The table is a root Solution component with Include Subcomponents. No separate
Location navigation page was added to the Modern App.

## Full Replica Replacement

- Old Dataverse column `aigw_opportunityplace`: retained as unmanaged String
- Old Full Replica control count: 0
- New `aigw_opportunitylocation` control count: 1
- Native Timeline: 1; old Timeline controls: 0
- Actual Management Subgrid: 1
- POL/POD Lookup controls: 4, unchanged
- Final structure: 5 / 19 / 115 / 106
- FormXML and FormJSON both bind the new Lookup
- Full Replica remains Active and Non-default

Form hashes after the replacement and before publication:

- FormXML: `4e51dc08537c1652ddb3759a88ab8f10fc5da7ea6d9a21528f436f631affd0ed`
- FormJSON: `1087e1ba7368b71e8501564e6c129cf9b0f7ff7dc7a5a8410ba5038e62e68f3d`

Published FormXML contains platform normalization and hashes to
`e14ce539637a17daee5bfdf974fda8d1c57c0a8ec4f3546f0bc37036d8418421`;
the semantic structure and FormJSON are unchanged.

## Runtime And Security

The implementation Application User has System Administrator, System Customizer,
Sales Manager and Salesperson roles. This is sufficient for schema implementation
and the planned read/create verification. No business role was modified.

Manual evidence captured on 2026-07-14 shows the approved test hostname, the
published Modern App, and an existing `[AI-DEMO]` Opportunity routed to Full
Replica. The `案件场所` field renders as a native Lookup and expands to the expected
empty state before master-data import. No Location was selected and the
Opportunity was not saved. There was no permission error, invalid Lookup target,
component failure, or infinite loading state.

The runtime result also confirms that the App can resolve the Location dependency
without adding a Location navigation page. The validation user can read and open
the Lookup; no role changes were required. The screenshot remains outside Git in
the local runtime-evidence source supplied by the user.

## Phase 2F2B Import

Dry-run and Apply were attempted. Apply performed no Dataverse write. The
external name-only CSV remains unchanged and outside Git.

| Metric | Result |
| --- | ---: |
| CSV intended rows | 51 |
| Dry Run classification | Ready: 0 existing / 51 missing / 0 conflicts |
| Existing Active | 0 |
| Created | 0 |
| Skipped | 0 |
| Failed | 0 |
| Business writes | 0 |

## Protection And Issues

- P0: 0
- P1: 0
- P2: 0
- Protected Form: unchanged
- Actual Management Form/View/Schema: unchanged
- Plugin and BPF: unchanged
- Opportunity business records: unchanged
- Demo Opportunity creation: 0
- Production requests: 0

## Request Accounting

The cumulative implementation session included dry-runs, delayed timeout
reconciliation, semantic forensics and final verification:

```text
GET=113
POST=5
PATCH=1
DELETE=0
Publish=2
Business writes=0
Production requests=0
```

POST comprises one table create (completed after client timeout), one relationship
create, one View create, and two targeted PublishXml calls. PATCH is the Full
Replica FormXML binding replacement. No App publish was required or performed.

The 2F2A gate is passed. Phase 2F2B Location dry-run and import may resume under a
separate execution authorization; this verification performed no Location import.

## Runtime Gate Read-Back

The final read-only supplement used 15 Dataverse GET requests and no writes:

```text
GET=15
POST=0
PATCH=0
DELETE=0
Publish=0
Business writes=0
Production requests=0
```

It reconfirmed `aigw_opportunitylocation` as the single Full Replica Lookup,
targeting `aigw_location` through `aigw_location_opportunities`; the old
`aigw_opportunityplace` control count is zero. Full Replica remains 5/19/115/106
with one native Timeline. Protected Form hashes remain at baseline, the BPF is
Draft/Inactive, and the plugin protection gate remains 7 enabled / 0 disabled.

## Phase 2F2B Attempt - 2026-07-14

### CSV Final Validation

- Header: exactly `Name`
- Logical lines: 52
- Data rows / valid names: 51 / 51
- Empty names: 0
- Exact duplicates: 0
- Trimmed case-insensitive duplicates: 0
- Extra columns: 0
- Source metadata, production GUID, state, owner and timestamp columns: absent
- Original order and internal punctuation: preserved
- First five: `01: Beijing`, `02: Shanghai`, `03: Tianjin`, `04: Chongqing`, `05: Guangzhou`
- Last five: `47. National`, `48. Nationwide`, `49. undecided`, `50: Nantong`, `91: Others`

### Dry Run Classification

| Classification | Count |
| --- | ---: |
| Existing Active | 0 |
| Existing Inactive | 0 |
| Missing | 51 |
| Ambiguous Duplicate | 0 |
| Dataverse empty names | 0 |

All 51 CSV names were in the create plan and no names were in the skip or
conflict lists. The dry run used four GET requests and zero writes.

### Apply Result

The first Apply invocation stopped before its first POST because the importer
referenced an undefined `ENTITY_SET` symbol instead of the Metadata-derived
`entitySetName`. The source was repaired surgically and a regression test was
added. The failed invocation recorded GET=6, POST=0 and Business writes=0.

After the fix passed its focused tests and the full test suite, the second Apply
invocation stopped while acquiring an authentication token because the identity
endpoint network request failed. It did not reach the Dataverse POST. Per the
single-failure stop rule, the importer was not run a third time.

A final read-only dry run confirmed that the environment still has Existing
Active=0 and Missing=51. Therefore no partial import or residual created record
exists.

| Result | Count |
| --- | ---: |
| Created | 0 |
| Skipped | 0 |
| Failed before POST | 1 |
| Actual persisted rows | 0 |
| Residual mismatch | 51 |

No test-environment Location GUID was generated. No Opportunity, Form, View,
App, BPF, Plugin, Actual Management, POL/POD, or Solution component was changed.

### 2F2B Request Accounting

For completed structured Dataverse runs in this attempt:

```text
GET=14
POST=0
PATCH=0
DELETE=0
Publish=0
Business writes=0
Production requests=0
```

The interrupted authentication attempt failed before a Dataverse HTTP request
was sent and is not counted as a Dataverse GET or POST.

### 2F2B Gate

- `Server-side Import Ready=false`
- `Runtime Validation Deferred=true`
- `Location Schema Runtime Ready=true`
- `Location Schema and Import Ready=false`
- `Location Residual Mismatch Count=51`
- P0: 0
- P1: 1 - all 51 Location rows remain missing because Apply stopped before POST
- P2: 0
- Later Demo Data use of `aigw_opportunitylocation`: not yet allowed

The next authorized execution must start with a fresh dry run. It may safely
reuse the idempotent importer after authentication network availability is
confirmed; it must not modify or delete existing records.

## Phase 2F2B-R2 Resume - 2026-07-14

Authentication and all protection gates were revalidated before Apply. The new
dry run returned CSV=51, Existing Active=0, Existing Inactive=0, Missing=51 and
Ambiguous Duplicate=0. The importer then created all 51 missing rows sequentially
with read-before-write and the name-only payload. No retry or network-failure
reconciliation was needed.

| Name | Test environment Location ID | HTTP |
| --- | --- | ---: |
| `01: Beijing` | `1f4e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `02: Shanghai` | `204e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `03: Tianjin` | `214e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `04: Chongqing` | `224e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `05: Guangzhou` | `234e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `06: Shenzhen` | `244e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `07: Hangzhou` | `254e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `08: Nanjing` | `264e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `09: Wuhan` | `274e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `10: Chengdu` | `284e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `11: Xi'an` | `294e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `12: Qingdao` | `2a4e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `13: Dalian` | `2b4e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `14: Changchun` | `2c4e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `15: Shenyang` | `2d4e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `16: Harbin` | `2e4e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `17: Fuzhou` | `2f4e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `18: Xiamen` | `304e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `19: Kunming` | `314e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `20: Guiyang` | `324e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `21: Nanning` | `334e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `22: Haikou` | `344e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `23: Hefei` | `354e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `24: Taiyuan` | `364e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `25: Shijiazhuang` | `374e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `26: Zhengzhou` | `384e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `27: Changsha` | `394e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `28: Nanchang` | `3a4e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `29: Suzhou` | `3b4e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `30: Wuxi` | `3c4e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `31: Changzhou` | `3d4e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `32: Ningbo` | `3e4e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `33: Wenzhou` | `3f4e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `34: Jiaxing` | `404e1d38-537f-f111-ab0e-70a8a5007736` | 201 |
| `35: Huzhou` | `87e71c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `36: Jinhua` | `88e71c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `37: Taizhou` | `8ae71c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `38: Zhuhai` | `3ee81c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `39: Shantou` | `74e81c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `40: Yangzhou` | `02e91c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `41: Hongkong` | `7ae91c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `42: Taiwan` | `94e91c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `43: LD Gr.Other country` | `95e91c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `44: Japan` | `96e91c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `45.Shandong/Beijing` | `97e91c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `46.Taicang` | `98e91c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `47. National` | `99e91c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `48. Nationwide` | `9ae91c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `49. undecided` | `9be91c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `50: Nantong` | `9ce91c3e-537f-f111-ab0e-70a8a5007736` | 201 |
| `91: Others` | `9de91c3e-537f-f111-ab0e-70a8a5007736` | 201 |

### R2 Integrity Verification

- Total / Active / Inactive: 51 / 51 / 0
- Missing / normalized duplicate keys / empty names: 0 / 0 / 0
- Idempotent post-import dry run: Existing Active=51, Missing=0
- Exact results: each of Beijing, Shanghai, Tianjin,
  `45.Shandong/Beijing`, `49. undecided` and `91: Others` returned once
- Search `Shanghai`: `02: Shanghai`
- Search `Beijing`: `01: Beijing`, `45.Shandong/Beijing`
- Ascending order begins Beijing, Shanghai, Tianjin and ends undecided, Nantong,
  Others
- CSV-external records: 0
- Opportunity business writes: 0

### R2 Runtime And Final Gate

Browser control failed during initialization before reaching CRM, so no browser
request or write occurred. The imported data is server-side ready, but the user
must expand `案件场所` in the Modern App and capture the populated Lookup plus the
Shanghai and Beijing search results without selecting or saving a value.

- `Server-side Import Ready=true`
- `Runtime Validation Deferred=true`
- `Location Schema and Import Ready=false`
- `Location Residual Mismatch Count=0`
- P0: 0
- P1: 1 - populated Lookup browser evidence is pending
- P2: 0
- Demo Data use: blocked until the runtime evidence gate passes

### R2 Request Accounting

```text
GET=103
POST=51
PATCH=0
DELETE=0
Publish=0
Business writes=51 (aigw_location Create only)
Production requests=0
```

The GET total covers preflight protection (15), initial dry run (4), Apply
read-before-write and final readback (56), post-import idempotence dry run (4),
post-import protection (15), and exact/search integrity queries (9).

## Phase 2F2B-R3 Manual Runtime Finalization - 2026-07-14

The user manually validated the populated Lookup in the approved test
environment and `CRM AI Gateway Demo - Modern`:

- An existing `[AI-DEMO]` Opportunity opened in Full Replica.
- `案件场所` rendered as the native `aigw_opportunitylocation` Lookup.
- The Lookup expanded and displayed `01: Beijing`, `02: Shanghai`,
  `03: Tianjin`, and `91: Others`.
- Searching `Shanghai` returned `02: Shanghai`.
- Searching `Beijing` returned `01: Beijing` and `45.Shandong/Beijing`.
- There was no permission, invalid-target, component-load, blank, or infinite-load
  error.
- No Location was selected and the Opportunity was not modified or saved.

### Screenshot Index

No new R3 image file was attached to the repository workspace or placed in the
ignored runtime-validation directory. The runtime result above is recorded from
the user's explicit manual verification statement; no screenshot path is
invented. Existing unrelated runtime screenshots remain ignored and unchanged.

### R3 Independent Read-Back

- Active / Inactive / empty Location rows: 51 / 0 / 0
- Normalized duplicate keys: 0
- CSV Missing / Inactive conflict / Ambiguous duplicate: 0 / 0 / 0
- Location Residual Mismatch Count: 0
- Lookup: `aigw_opportunitylocation`, type Lookup, target `aigw_location`
- Full Replica: 5 / 19 / 115 / 106
- New Lookup / old String controls: 1 / 0
- Native / old Timeline controls: 1 / 0
- Protected Form hashes: unchanged at baseline
- Plugin: 7 enabled / 0 disabled
- BPF: Draft / Inactive
- Actual Management, POL/POD, Modern App and Opportunity data: unchanged

```text
GET=21
POST=0
PATCH=0
DELETE=0
Publish=0
Business writes=0
Production requests=0
```

### Final Gate

- P0: 0
- P1: 0
- P2: 1 - no new R3 screenshot file was supplied; the explicit manual result is
  accepted as runtime evidence
- `Runtime Validation Deferred=false`
- `Location Schema Runtime Ready=true`
- `Server-side Import Ready=true`
- `Location Schema and Import Ready=true`
- `Location Residual Mismatch Count=0`
- Later Demo Data may use `aigw_opportunitylocation` under its own authorization.
