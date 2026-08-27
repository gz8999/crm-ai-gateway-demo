# Phase 1C-5R2E-2F1R Location Master Data Import

## Decision

`Location Master Data Import Ready=false`

`Location Residual Mismatch Count=not-applicable`

The name-only CSV passed every offline gate, but the Dataverse dry-run stopped at
the metadata gate. The approved test environment does not contain the required
`new_location` table, and Opportunity's current `案件场所` field is a String rather
than a Lookup. Apply was not executed and no Location records were created.

## Input Files

- Source: `new_locations_active_2026-07-14.csv` (external local file, unchanged)
- Generated input: `new_locations_name_only_2026-07-14.csv` (external local file)
- Neither CSV is stored in Git.
- Source SHA-256 before and after extraction:
  `1048e3ee2543f659ee2674014f0e27254d652ad3f543507ae0cac6cce4d58c70`
- Generated CSV SHA-256:
  `1d516e8eff694a84648f3bf47b0460c00322c779b3e17d97f9594afea0e233e5`

## Name-Only CSV Validation

| Check | Result |
| --- | ---: |
| Header | `Name` |
| Columns | 1 |
| Records | 51 |
| Blank rows | 0 |
| Empty names | 0 |
| Exact duplicates | 0 |
| Trimmed case-insensitive duplicates | 0 |
| Offline gate | Passed |

The extraction preserved source order and only trimmed leading or trailing
whitespace. It did not normalize punctuation, internal spaces, case, or numbering.

First five names:

1. `01: Beijing`
2. `02: Shanghai`
3. `03: Tianjin`
4. `04: Chongqing`
5. `05: Guangzhou`

Last five names:

1. `47. National`
2. `48. Nationwide`
3. `49. undecided`
4. `50: Nantong`
5. `91: Others`

## Dataverse Dry Run

Connected host: approved test organization only.

The required contract could not be confirmed:

| Contract | Read-back result |
| --- | --- |
| Table `new_location` | Missing |
| Entity set `new_locations` | Not applicable because the table is missing |
| Primary ID `new_locationid` | Not applicable |
| Primary name `new_name` | Not applicable |
| Opportunity case-location field | `aigw_opportunityplace` |
| Current attribute type | `String` |
| Required target | Lookup to `new_location` |
| Lookup target gate | Failed |

A read-only metadata candidate scan found no environment table matching the
required `new_location` contract. The existing `aigw_polpodlocation` table is a
separate POL/POD master and was not substituted or modified.

Because metadata validation failed before record classification, Existing Active,
Inactive conflicts, ambiguous duplicates, missing names, and residual mismatches
cannot be calculated safely.

## Apply Result

| Metric | Result |
| --- | ---: |
| Existing Active | Not queried |
| Created | 0 |
| Skipped | 0 |
| Failed creates | 0 |
| New test-environment GUIDs | None |
| Business writes | 0 |

Apply was not invoked. No partial import or rollback was needed.

## Request Accounting

```text
GET=4
POST=0
PATCH=0
DELETE=0
Publish=0
Business writes=0
Production requests=0
```

The GET count includes the failed contract lookup and read-only candidate
forensics. No request targeted the prohibited production hostname.

## Required Next Decision

The import cannot resume under the current schema. A separately authorized
schema-design phase would need to create or identify the intended Location table
and replace or supplement `aigw_opportunityplace` with a Lookup targeting that
table. This phase did not make either change.

The 51 options must not be used by R2E-5 Demo Data until the schema and Lookup
contract are explicitly resolved and a new dry-run reports zero conflicts.

## Protection Result

- Opportunity, Actual Management, Form, View, App, BPF, Plugin, and Solution: not modified
- Existing Location records: not modified, deleted, or reactivated
- Schema and Publish actions: 0
- Demo Opportunity creation: 0
- BPF activation: 0

## Local Verification

- `npm test`: passed, 179/179
- `npm run build`: passed
- `git diff --check`: passed
- Sensitive scan: passed
