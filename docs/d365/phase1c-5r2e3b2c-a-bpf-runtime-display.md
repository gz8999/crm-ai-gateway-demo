# Phase 1C-5R2E-3B2C-A Ordinary User BPF Runtime Display And Instance Validation

## Result

- `Runtime Test Record Ready=true`
- `Ordinary User App Runtime Ready=true`
- `Full Replica Runtime Ready=true`
- `Target BPF Default Runtime Ready=true`
- `BPF Initial Stage Ready=true`
- `BPF Instance Creation Ready=true`
- `Opportunity Data Integrity Ready=true`
- `Phase 3B2C-A Ready=true`
- `Phase 3B2C-B Stage Advance Ready=true`

CRM AI Demo User opened the designated synthetic Opportunity in an incognito browser session. The Modern App loaded Full Replica and defaulted to the custom two-stage BPF. Dataverse created exactly one target BPF instance at the initial stage. No stage was advanced, no process was switched, and no business field was intentionally edited or saved.

## Environment And Identity

- Test hostname: `org91f5f65f.crm5.dynamics.com`
- App: `CRM AI Gateway Demo - Modern`
- Browser identity: `CRM AI Demo User`
- UPN: `crm-ai-demo-user@sgtpepperb.onmicrosoft.com`
- Browser mode: Incognito
- Production requests: 0

The screenshot shows the target App, the ordinary non-admin user identity, the selected record, Full Replica layout, and the custom BPF. Administrator browser evidence was not used.

## Test Record Selection

| Property | Baseline |
|---|---|
| Name | `[AI-DEMO] 仓储运营报价案件 001` |
| Opportunity ID | `f9b6f99b-2078-f111-ab0e-000d3a857307` |
| Owner | `# crm-ai-gateway-demo` (`7928c06a-da75-f111-ab0e-70a8a504e6f9`) |
| State / status | Active / In Progress (`0` / `1`) |
| Modified On | `2026-07-10T08:16:16Z` |
| Legacy Process ID / Stage ID | None / None |
| Target BPF instances | 0 |
| Actual Management / activities / notes | 0 / 0 / 0 |
| Business fields observed | 293 |
| Baseline business snapshot SHA-256 | `0c425f772c3302e23ea36dcc1505b3d3a7860aaf9af2785b428cf258703f9e1a` |

The record was selected because it has an explicit synthetic marker, is Active, had no BPF instance or related Actual/Timeline data, and had not been modified since July 10. No record was created or altered to prepare this test.

## Preflight

| Gate | Result |
|---|---|
| Target workflow | Active / Activated |
| Target process order / rank | 0 / first |
| Definition SHA-256 | `59819cd865fd39c5a838441cad21979e4e1a08387b3bb62eab2285e07c213f08` |
| Stages / steps | 2 / 4 |
| Modern App BPF component | 1 |
| Demo user | Enabled, licensed, normal interactive, non-admin |
| Direct roles | Basic User; CRM AI Demo BPF User |
| Team-inherited roles | None |
| Backing rows | 0 |
| Full Replica | Active, non-default; 5 / 19 / 115 / 106 |
| Native / old Timeline | 1 / 0 |
| Plugin Enabled / Disabled | 7 / 0 |
| Actual Main Form | 1 / 5 / 41 |
| Active Locations | 51 |
| Protected FormXML hash | `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7` |

## Manual Browser Evidence

The user opened the specified record without saving, changing fields, advancing a stage, switching process, closing the Opportunity, or creating an Actual record.

The screenshot confirms:

1. Chrome is in incognito mode.
2. The hostname and App are the approved test environment and Modern App.
3. The signed-in identity is CRM AI Demo User.
4. The record title is `[AI-DEMO] 仓储运营报价案件 001`.
5. Full Replica's custom Summary structure, header, tabs, Location lookup, and annual sections are visible.
6. The displayed BPF is `销售流程`, with `授予资格` active and `案件关闭` visible as the second stage.
7. No permission, process-loading, form-fallback, or component error is visible.

Ignored local evidence:

- `local-artifacts/d365/runtime-validation/r2e3b2c-a/ordinary-user-bpf-runtime.png`
- Screenshot SHA-256: `246a742044bafaa8c1cc4022a022d4f1d7ec8cc80ec9e8aa6b8a4efa82e78c2b`

The screenshot is excluded from Git because it includes login identity evidence.

## BPF Instance Read-Back

| Property | Result |
|---|---|
| Instance count | 1 |
| Instance ID | `221ed4a5-0780-f111-ab0e-000d3a82d194` |
| Opportunity | `f9b6f99b-2078-f111-ab0e-000d3a857307` |
| Process | `7325b274-6b7c-f111-ab0e-70a8a50388b9` |
| State / status | Active / Active (`0` / `1`) |
| Active stage | `授予资格` (`db7ed324-2fb8-4bbe-9c99-4af7caafa7d2`) |
| Traversed path | Initial stage only: `db7ed324-2fb8-4bbe-9c99-4af7caafa7d2` |
| Created On | `2026-07-15T04:42:58Z` |
| Created By | CRM AI Demo User (`85f6e9a0-ef7f-f111-ab0f-000d3a857307`) |
| Duplicate instances | 0 |
| Standard BPF instances created | 0 |

The instance behavior is the single platform-generated write authorized for this phase. It is correctly associated and was not deleted or rolled back.

## Opportunity Integrity

| Check | Before | After | Result |
|---|---|---|---|
| State / status | 0 / 1 | 0 / 1 | Unchanged |
| Legacy Process ID / Stage ID | None / None | None / None | Unchanged |
| Actual Management records | 0 | 0 | Unchanged |
| Activities | 0 | 0 | Unchanged |
| Notes | 0 | 0 | Unchanged |
| Modified On | `2026-07-10T08:16:16Z` | `2026-07-15T04:42:57Z` | Platform initialization timestamp change |

The coarse snapshot hash changed because the Dataverse row's system-maintained audit/version properties changed when the first BPF instance was initialized. The Opportunity timestamp changed one second before the BPF row was created. A read-only audit query returned no audited business-field changes. No state, status, process field, related business record, activity, or note changed, and the screenshot shows the record as saved without user edits. This is classified as the explicitly allowed P2 initialization behavior, not an Opportunity business write.

## Post-Read Protection

| Gate | Result |
|---|---|
| Target BPF | Active / Activated, order 0 |
| Target definition hash | Unchanged |
| Target stages / steps | 2 / 4, unchanged |
| Managed BPFs | Both Active, order 1 |
| Modern App target BPF components | 1 |
| Full Replica | 5 / 19 / 115 / 106 |
| Native / old Timeline | 1 / 0 |
| Protected Form hashes | Unchanged |
| Plugin Enabled / Disabled | 7 / 0 |
| Actual Main Form | 1 / 5 / 41 |
| Active Locations | 51 |
| Opportunity business writes | 0 |
| Production requests | 0 |

## Findings

### P0

None.

### P1

None.

### P2

1. Initial BPF instance creation updated the Opportunity `Modified On` system timestamp even though no business field was edited or saved.
2. The dedicated role retains the previously documented broad first-party baseline, which remains a separate least-privilege follow-up.
3. The screenshot proves the runtime form by its unique structure and server-side routing gates rather than displaying the Form GUID directly.

## Request And Write Accounting

- Codex Dataverse GET: 67
- Browser GET and asset requests: not instrumented by Codex
- Codex POST: 0
- Codex PATCH: 0
- Codex DELETE: 0
- Publish: 0
- Activation / deactivation: 0
- Platform-created target BPF instances: 1
- Duplicate BPF instances: 0
- Opportunity business writes: 0
- Actual Management writes: 0
- Timeline activity / note writes: 0
- Location writes: 0
- Production requests: 0

The 67 GET count includes failed read-only metadata probes used to correct Team membership, process-stage ordering, and `RetrieveFilteredForms` query shapes. No failed probe used a write verb.

## Final Gate

- `Runtime Test Record Ready=true`
- `Ordinary User App Runtime Ready=true`
- `Full Replica Runtime Ready=true`
- `Target BPF Default Runtime Ready=true`
- `BPF Initial Stage Ready=true`
- `BPF Instance Creation Ready=true`
- `Opportunity Data Integrity Ready=true`
- `Phase 3B2C-A Ready=true`
- `Phase 3B2C-B Stage Advance Ready=true`

Phase 3B2C-B is permitted only under separate authorization. No stage advancement was performed in this phase.
