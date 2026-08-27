# Phase 1C-5R2F-R3A BPF Backing Table Solution Dependency Repair

- Environment: `org91f5f65f.crm5.dynamics.com`
- Solution: `CRMAIGatewayDemo`
- No Choice, Form/View, BPF definition, Publish, Probe or business-record write was executed by this phase. The unmanaged export is package deployment output, not a Dataverse publish.

## BPF and backing table proof

- BPF: **销售流程 - AI Demo Full Replica**
- Workflow ID: `7325b274-6b7c-f111-ab0e-70a8a50388b9`
- Unique name: `aigw_ai_demo_full_replica`
- Primary entity: `opportunity`
- Backing logical name: `aigw_ai_demo_full_replica`
- IsBPFEntity: **true**
- Identity correlation: **true**

## Original membership and controlled repair

- Backing entity in target Solution before repair: **false**
- Backing entity in target Solution after repair: **true**
- Backing entity Solution count observed: **3**
- AddSolutionComponent: **confirmed** (one shell-only Entity root add)
- Add readback: **confirmed by delayed readback; componenttype=1, rootcomponentbehavior=1**
- Shell-only: **true**

## Export and package verification

- Export status: **succeeded**
- Export path: `local-artifacts/d365/phase1c5r2f-r3a/CRMAIGatewayDemo-r3a-unmanaged.zip`
- BPF package dependency: **true**
- Backing entity package evidence: `solution.xml` RootComponent `type=1`, `schemaName=aigw_ai_demo_full_replica`, `behavior=1`; `customizations.xml` Entity `aigw_ai_demo_full_replica` with `EntitySetName=aigw_ai_demo_full_replicas` and `IsBPFEntity=1`. Export packages do not carry the Dataverse MetadataId for this generated BPF entity, so `MetadataId` is intentionally not used as the package-presence test.
- Package error: none

| Kind | Component | Object ID | Present |
|---|---|---|---|
| form | coverage-form | 8e260676-56ce-47b1-a949-3d2560eda95c | true |
| form | signal-form | 2c1d6dee-2691-4abd-8b51-492534414610 | true |
| view | coverageCurrent-view | 8aea4159-31c6-5f7f-8283-6f2192f3519c | true |
| view | coverageHistory-view | b7fffbbf-2ad1-5370-b677-706d2f8994e6 | true |
| view | signalRecent-view | 09705286-f108-5f96-9784-b05cfd5dd7d8 | true |
| view | signalCommitments-view | db50ed56-c339-5938-8b9e-f553e24502a7 | true |
| view | signalIssues-view | 761e3a59-6302-538f-beb1-7efdc7a89662 | true |

## Protection

- Full Replica: **5/21/118/109**
- Protected Form unchanged: **true**
- Actual Form/View preserved: **true**
- Plugin: **7 enabled / 0 disabled**
- Location Active: **51**
- BPF state/status/order unchanged: **true**

## Gates

- testEnvironmentVerified: **true**
- bpfMetadataVerified: **true**
- bpfBackingEntityVerified: **true**
- backingEntityMembershipReady: **true**
- backingEntityShellOnly: **true**
- solutionExportReady: **true**
- bpfPackageDependencyReady: **true**
- solutionPackageFormsReady: **true**
- solutionPackageViewsReady: **true**
- formViewPackageMembershipReady: **true**
- solutionPackagingReady: **true**
- protectedBaselinePreserved: **true**
- coreSchemaPreserved: **true**
- choiceRepairStarted: **false**
- choiceWrites: **true**
- runtimeProbeStarted: **false**
- businessRecordWrites: **true**
- p0GatePassed: **true**
- p1GatePassed: **false**
- nextChoiceRepairReady: **true**
- P0 Count: **0**
- P1 Count: **0**
- P2 Count: **0**
- Choice Repair Started: **false**
- Choice Writes: **0**
- Runtime Probe Started: **false**
- Business Record Writes: **0**
- Production Requests: **0**
- External LLM Calls: **0**

## Request statistics

- Captured final apply session: `GET=34`, `POST=1`, `PATCH=0`, `DELETE=0`, `Publish=0`, `ExportSolution=1`.
- Controlled membership action: `AddSolutionComponent=1`, confirmed by delayed readback as `componenttype=1` and `rootcomponentbehavior=1`.
- Known R3A mutation total: `POST=2`, `AddSolutionComponent=1`, `ExportSolution=1`, `Publish=0`, `PATCH=0`, `DELETE=0`.
- The initial Add process did not emit its final CLI JSON, so its readback GET count is not merged into the captured 34-GET apply session. No further export retry was performed after the captured successful export.

## Blockers

- None.

## Next phase

Next Phase Choice Repair Ready is **true**. Choice repair must remain a separate authorized phase.
