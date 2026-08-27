# Phase 1C-5R2E-2A2 Localization Isolation And Protected Form Restore

## Result

**Localization Isolation Ready=true.**

Only the approved Full Replica and Protected Form definitions were patched, followed by one entity-scoped Opportunity `PublishXml`. No App, BPF, Plugin, View, Actual Management Form, or business data write was performed.

## Stable ID Mapping

| Node | Type | Protected ID retained | Full Replica new ID |
|---|---|---|---|
| Timeline `aigw_fr_summary_timeline` / `aigw_summary_timeline` | Section | `{56d20305-1c55-4534-9a13-602c229a1602}` | `{37D6B806-1B03-5A0A-A7F8-F263E755EB11}` |
| Products `Product_Line_Items` | Tab | `{79548060-31f7-4646-8c08-0296ecd4113b}` | `{3CE87D5F-5AD1-57DD-B424-DB312B273CD6}` |
| Files `documents_sharepoint` | Tab | `{2A23BF76-D291-43BA-980B-738D39C68770}` | `{0192E1B1-12EE-5676-92DB-164030D870DE}` |

The new IDs are deterministic stable GUIDs derived from the solution, Full Replica Form ID, node key, and original GUID. No other Tab, Section, Cell, or Control ID changed.

## Label Restoration

Protected Form labels were restored from the forensic JSON without guessing:

- Timeline: `Timeline / 活动`, language `1033`; no direct `2052` Tab/Section resource was present in the forensic source.
- Products: `Products`, language `1033`; no direct `2052` Tab resource was present in the forensic source.
- Files: `Files`, language `1033`; no direct `2052` Tab resource was present in the forensic source.

Protected FormXML returned to the frozen baseline hash:

`5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`

The Protected Form semantic diff after restoration is zero against the recorded baseline. The Full Replica retained `Timeline`, `产品`, and `文件` as its visible target labels.

## Hashes

| Component | Before FormXML | After FormXML | Before FormJSON | After FormJSON |
|---|---|---|---|---|
| Full Replica unpublished | `e719b3fc47c9451fa9d2c2aa07e8638c69529792cc6945bf7f6a45d4660feb9f` | isolated and then published | `ed42aee4295de90c547a65d8b4d62f925281c039a79e5c3eceecd0b963309cc6` | isolated and then published |
| Full Replica published | `049b6f1e0c396550340b41cabeafc9a79be2d5cc9da9474ded9dad03db38685a` | `2b5d3339bae2bd59fc4b34fb0dd55770ef0d3fe37fc01357be387ea225159545` | `ed42aee4295de90c547a65d8b4d62f925281c039a79e5c3eceecd0b963309cc6` | `8c637960911241d747aba83c8dfe445dbb86b274075ad9c4b3ce61bae5d83317` |
| Protected Form | `494685f0454b4d79751a245ab6c3ae73dd9b4413a5af16467c02250110c74a05` | `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7` | `94de2fe47db7300420c7fcf73c6c1ff24d830aefea9f4a1a765daf4cd728b8f9` | unchanged |

The Full Replica FormJSON was updated by exact replacement of the three existing GUID references and was confirmed parseable and synchronized after publication. No FormJSON schema was generated from scratch.

## Published Verification

- Publish endpoint: `/api/data/v9.2/PublishXml`
- ParameterXml: `<importexportxml><entities><entity>opportunity</entity></entities></importexportxml>`
- Response: HTTP 204
- Full Replica: 5 Tabs / 19 Sections / 114 Controls / 106 unique fields
- Full Replica: Inactive, non-default
- Header order unchanged: `aigw_winprobabilityrank` -> `aigw_budgetstatus` -> `ownerid`
- Subgrid unchanged: `aigw_actualmanagement_subgrid`, relationship `aigw_opportunity_actualmanagement`, View `7a00b267-977c-f111-ab0e-000d3a857307`, 10 rows
- Actual Management Form: 1 Tab / 5 Sections / 41 Controls; hash unchanged
- Actual Management View: 33 columns; FetchXML/LayoutXML/LayoutJSON hashes unchanged
- Custom BPF: Draft/Inactive
- Plugin: Assembly 1, Types 3, Steps 7, Images 6, Enabled 7 / Disabled 0
- App changes: 0
- Business writes: 0
- Production requests: 0

The Full Replica and Protected Form no longer reuse the three target GUIDs. Full Replica now contains each new GUID once in both FormXML and FormJSON; Protected Form retains the original GUIDs.

## Request Accounting

| GET | POST | PATCH | DELETE | Publish | Activation | Business writes | Production requests |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 51 | 0 | 2 | 0 | 1 | 0 | 0 | 0 |

The two PATCH requests were limited to Full Replica `formxml/formjson` and Protected Form `formxml`. The only PublishXml call was the targeted Opportunity publish.

## Next Gate

`Localization Isolation Ready=true`.

R2E-2B App Inclusion and Runtime Validation may proceed under its own authorization. Form/BPF activation, App modification, default-form changes, and synthetic seed remain separate gates.

Evidence JSON:

`local-artifacts/d365/plugin-registration/phase1c5r2e2a2-localization-isolation.json`
