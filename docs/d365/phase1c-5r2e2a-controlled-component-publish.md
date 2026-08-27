# Phase 1C-5R2E-2A Controlled Component Publish

## Result

**R2E-2A Ready=false.**

The environment publish gate was clear before execution: the allowed hostname was `org91f5f65f.crm5.dynamics.com`, active Solution operations were `0`, and no publish lock was reported. The App integration gap was treated as the approved R2E-2B runtime gate and was not modified.

Both requested entity-scoped `PublishXml` calls returned HTTP 204. The component read-back passed for the Full Replica, Actual Management Form, View, Subgrid, BPF, and Plugin. The phase is nevertheless blocked because the protected Opportunity Form's FormXML hash changed after the Opportunity publish.

No corrective write, activation, App change, Plugin change, or business-data write was attempted after this finding.

## Publish Results

| Entity | ParameterXml | Result |
|---|---|---|
| `aigw_actualmanagement` | `<importexportxml><entities><entity>aigw_actualmanagement</entity></entities></importexportxml>` | HTTP 204 |
| `opportunity` | `<importexportxml><entities><entity>opportunity</entity></entities></importexportxml>` | HTTP 204 |

`Publish All Customizations` was not used. No Form or BPF was activated, and no App was changed.

## Published Read-Back

- Full Replica Form: `5 Tabs / 19 Sections / 114 Controls / 106 unique fields`; still inactive and non-default. Published and unpublished definitions are structurally equivalent and FormJSON hashes match.
- Actual Management Form: `1 Tab / 5 Sections / 41 Controls`; `aigw_annualactualrevenue` remains the unique disabled control. Dataverse normalized FormXML during publication, but the canonical structure and FormJSON match the unpublished definition.
- Actual Management View: `33` columns; FetchXML, LayoutXML, and LayoutJSON remain three-way consistent with the required order.
- Subgrid: one `aigw_actualmanagement_subgrid`, relationship `aigw_opportunity_actualmanagement`, target `aigw_actualmanagement`, default View `7a00b267-977c-f111-ab0e-000d3a857307`, 10 rows, search and view selector enabled, chart disabled.
- Custom BPF: `销售流程 - AI Demo Full Replica`, Draft/Inactive; no activation or process-order change.
- Plugin: one Assembly, three Types, seven Steps, six Images, Enabled `7`, Disabled `0`; no Opportunity steps.
- App: metadata unchanged. Direct App inclusion remains deferred to R2E-2B.

## Protected Form Gate

Protected Form: `8db60b46-b976-f111-ab0e-00224817cb31`

| Hash | Frozen baseline | After Opportunity publish |
|---|---|---|
| FormXML | `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7` | `494685f0454b4d79751a245ab6c3ae73dd9b4413a5af16467c02250110c74a05` |
| FormJSON | `94de2fe47db7300420c7fcf73c6c1ff24d830aefea9f4a1a765daf4cd728b8f9` | unchanged |
| FormPresentation | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | unchanged |

The observed FormXML differences are:

- `section#aigw_summary_timeline`: `Timeline / 活动` became `Timeline`.
- `tab#Product_Line_Items`: `Products` became `产品`.
- `tab#documents_sharepoint`: `Files` became `文件`.

The change was observed immediately after the successful Opportunity `PublishXml`; this report does not infer whether it was platform publication normalization or pending protected-form customization becoming published. Because the protected hash is not unchanged, the required protection gate fails. The protected Form was not patched or otherwise corrected automatically.

## Hash Evidence

Complete before/after evidence is stored in the ignored local artifact:

`local-artifacts/d365/plugin-registration/phase1c5r2e2a-controlled-component-publish.json`

Key published hashes:

- Full Replica FormXML: `049b6f1e0c396550340b41cabeafc9a79be2d5cc9da9474ded9dad03db38685a`
- Full Replica FormJSON: `ed42aee4295de90c547a65d8b4d62f925281c039a79e5c3eceecd0b963309cc6`
- Actual Management FormXML: `a0a8c328c0bba4de1e9dd98171c65755fa65428c36e85c35eb412a6d8b61435b`
- Actual Management FormJSON: `d70e2607079c73a44b178a7de54d8276ddb1b6de0824049cb225781fe79bbf79`
- View FetchXML: `9e53a5f48f2e9063ebd94e2a839e08adcd9cd30747e86c28972e0b58f155ebfd`
- View LayoutXML: `ecf5b309da6b9fb92214ca18733cc7033e5ff64b042df2ce3ab7101d08c8c49d`
- View LayoutJSON: `917b3ffcb418cbfcca3fdb4e11ec79baac30c75266c79e99b38431a47d57869f`

## Request Accounting

| GET | POST | PATCH | DELETE | Publish attempts | Successful Publish | Activation | Business writes | Production requests |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 137 | 0 | 0 | 0 | 2 | 2 | 0 | 0 | 0 |

`PublishXml` is reported separately from ordinary POST requests. The GET total includes the controlled publish read-backs and the final read-only audit.

## Stop Condition and Next Gate

R2E-2A is blocked. Do not run another PublishXml, modify the protected Form, activate the Form/BPF, change the App, or seed business data in this phase.

First resolve the protected Form drift with an explicit owner decision: accept the three observed label changes as an approved platform/pending-customization outcome, or authorize a separate protected-form remediation. Only after that decision and a fresh read-only preflight should R2E-2B App Inclusion and Runtime Validation be considered.
