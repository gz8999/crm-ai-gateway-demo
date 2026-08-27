# Phase 1C-5R2E-2D4B: POL/POD Lookup Implementation

This phase introduces a reusable POL/POD location master table and four required Opportunity lookups. The CSV remains an external local input and is never committed.

## Design

- Table: `aigw_polpodlocation` (Organization-owned, unmanaged)
- Primary name: `aigw_keycode` / `Key Code`
- Alternate key: `aigw_PolPodLocationKey` on `aigw_keycode`
- View: `POL/POD Lookup View - AI Demo`
- Opportunity lookups: `aigw_sealandpollookup`, `aigw_sealandpodlookup`, `aigw_airpollookup`, `aigw_airpodlookup`
- Existing String columns remain in metadata and are removed only from the Full Replica form.
- The four lookup controls share the generic Key Code view and keep their original row/cell/control placement.

## Safety boundary

The executor requires an explicit test-environment gate and publish confirmation. It rejects the production hostname, does not read or send Record ID values, does not write Key Code values to AI Safe Context, and does not touch the Protected Form, App, BPF, Plugin, Timeline, or business records. Upsert failures stop subsequent rows; no metadata or data is deleted automatically.

## Validation

The ignored audit artifact records table, key, relationship, view, form, hash, row-count, and request evidence. The expected input contract is 2,072 nonblank unique Key Code values including `9999: OTR`. The published form must remain Active, Non-default, and structurally unchanged apart from the four bindings and the POL/POD section label.

## Rollback

Rollback is a separately authorized operation. The executor does not delete the table, key, relationships, view, or imported records. The saved pre-change FormXML in the ignored audit directory is the only form restoration source for a later controlled rollback.

## Execution Result

- Table `aigw_polpodlocation` was created as an unmanaged Organization-owned table with MetadataId `b3817d79-977e-f111-ab0e-002248eb1915`; primary attribute `aigw_keycode` has MetadataId `b4817d79-977e-f111-ab0e-002248eb1915`.
- Alternate key `aigw_PolPodLocationKey` is Active. The imported set contains 2,072 unique nonblank Key Code values, including exactly one `9999: OTR`; the CSV Record ID column was not used.
- The generic lookup View is `961c12b1-987e-f111-ab0e-002248eb1915`. It contains one ascending `aigw_keycode` column and no filter or link-entity.
- Four required lookup attributes were verified against `aigw_polpodlocation`: `aigw_sealandpollookup`, `aigw_sealandpodlookup`, `aigw_airpollookup`, and `aigw_airpodlookup`. Each has one relationship and is valid for form, read, create, and update.
- The published Full Replica remains Active and Non-default with 5 Tabs, 19 Sections, 114 Controls, and 106 unique bound fields. The four former String bindings are zero; each replacement lookup binding is exactly one. FormXML/FormJSON are synchronized.
- The final published Full Replica hashes are `77b03af35e4c6e5a31588e4f593df641c2362e4761f4f6e802d5bba1b00687b5` and `33f3196b748bed44af55438603c544a850dcb058bd8ee81c2ba0b9864af1c2be`. Protected Form hashes remain `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7` and `94de2fe47db7300420c7fcf73c6c1ff24d830aefea9f4a1a765daf4cd728b8f9`.
- The browser extension was unavailable for interactive search and screenshot capture after the target tab was identified. Server-side validation confirms the lookup View and the `9999: OTR` row; browser search/select/clear remains a manual verification item.

The ignored execution evidence is stored under `local-artifacts/d365/polpod/`. No Protected Form, App, BPF, Plugin, Timeline, or business record was modified. The final corrective invocation performed one Form PATCH and two targeted PublishXml actions; no DELETE or business-data write occurred.
