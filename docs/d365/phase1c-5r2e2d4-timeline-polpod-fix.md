# Phase 1C-5R2E-2D4 Timeline and POL/POD Fix

## Conclusion

`Timeline and POLPOD Ready=false`

The phase is blocked by the requested field mapping. The four requested
logical names `new_sealand_pol`, `new_sealand_pod`, `new_air_pol`, and
`new_air_pod` do not exist in the current Opportunity Entity Metadata. The
current Full Replica instead binds four `aigw_*` String attributes. Their
target entity and relationship cannot be inferred safely, so no Form change
was made.

The Timeline section exists but is empty. It is not hidden, and it contains no
Timeline control that can be restored without first confirming the supported
control configuration.

## Read-only Evidence

| Item | Result |
|---|---|
| Full Replica unpublished | Active, Non-default, component state unmanaged |
| Full Replica unpublished FormXML hash | `85e1f450e3f5996ad1d8d20827bc9a4f2347f0af2416c9f321dc974bac497350` |
| Full Replica unpublished FormJSON hash | `8c637960911241d747aba83c8dfe445dbb86b274075ad9c4b3ce61bae5d83317` |
| Full Replica published FormXML hash | `4ab20dbf76b964b70639301a92f7fae74629c5feec99f51ce90174d604f534bf` |
| Protected Form FormXML hash | `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7` |
| Protected Form FormJSON hash | `94de2fe47db7300420c7fcf73c6c1ff24d830aefea9f4a1a765daf4cd728b8f9` |
| Full Replica structure | 5 Tabs, 19 Sections, 114 Controls |
| Full Replica Timeline Section | `aigw_fr_summary_timeline`, `{37D6B806-1B03-5A0A-A7F8-F263E755EB11}` |
| Timeline Section controls | 0 |
| Timeline Section rows | 0 |
| Timeline Section hidden | No hidden attribute found |
| Protected Timeline Section | `aigw_summary_timeline`, `{56d20305-1c55-4534-9a13-602c229a1602}` |
| Protected shared target ID present | No |

The Protected Form also has no control inside its Timeline-named section. Its
unrelated control scan found `notescontrol` and `new_aigtimelinesummary`, but
neither is sufficient evidence for the standard activities Timeline control.

## POL/POD Mapping

### Requested names

| Requested logical name | Metadata result | Form control |
|---|---|---|
| `new_sealand_pol` | Not found | 0 |
| `new_sealand_pod` | Not found | 0 |
| `new_air_pol` | Not found | 0 |
| `new_air_pod` | Not found | 0 |

### Current Full Replica bindings

| Current logical name | Attribute type | 1033/2052 label | Control type | Control count |
|---|---|---|---|---:|
| `aigw_sealandpol` | String | 海运/陆运装货港 | Text control `{270BD3DB-D9AF-4782-9025-509E298DEC0A}` | 1 |
| `aigw_sealandpod` | String | 海运/陆运卸货港 | Text control `{270BD3DB-D9AF-4782-9025-509E298DEC0A}` | 1 |
| `aigw_airpol` | String | 空运装货港 | Text control `{270BD3DB-D9AF-4782-9025-509E298DEC0A}` | 1 |
| `aigw_airpod` | String | 空运卸货港 | Text control `{270BD3DB-D9AF-4782-9025-509E298DEC0A}` | 1 |

All four current attributes are readable, form-valid, create-valid, and
update-valid String attributes. No Lookup target metadata was available for
them. No field schema, control binding, or label was changed.

## Required Stop

The requested rule says to stop when any target field is not a Lookup. That
condition is met because the requested names are absent and the actual bound
fields are String. The following actions were therefore not performed:

- No FormXML or FormJSON PATCH.
- No field type conversion.
- No guessed Lookup target table, relationship, or view.
- No Timeline control creation.
- No PublishXml.
- No App, BPF, View, Plugin, Protected Form, or business-data change.

## Minimum Migration Plan

1. Confirm the canonical field mapping: either provide the existing Lookup
   logical names and their target table/relationship, or explicitly authorize
   creation of four new Lookup columns. The current `aigw_*` String columns
   must not be converted in place.
2. If new Lookups are required, perform a separate metadata phase to create
   the columns and relationships, define valid Lookup Views, and separately
   plan any data migration. Do not guess the target table from the labels.
3. After the Lookup metadata is confirmed, update only the four Full Replica
   controls and preserve their labels/order. Keep one control per field.
4. Separately restore the standard Timeline control in the existing
   `aigw_fr_summary_timeline` section using a supported Form Designer or
   verified FormXML configuration. Use a Full Replica-specific control ID and
   do not reuse Protected Form node IDs.
5. Publish Opportunity once only after both the Lookup and Timeline gates pass,
   then perform browser-only verification without saving data.

## Request and Safety Statistics

- GET: 14, including one read-only OData projection attempt rejected with HTTP
  400 because generic Attribute Metadata does not expose `Targets`.
- POST: 0
- PATCH: 0
- DELETE: 0
- Publish: 0
- Business writes: 0
- Production requests: 0

## Next Decision

This phase must remain blocked until the canonical POL/POD Lookup metadata is
identified. No Plugin Smoke Test, BPF activation, or additional publishing is
allowed from this phase.
