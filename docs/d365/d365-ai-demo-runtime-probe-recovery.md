# Phase 1C-5R2F-R3C Runtime Probe Resume & Final Gate

- Environment: `org91f5f65f.crm5.dynamics.com`
- Mode: `apply`
- Production Requests: **0**
- External LLM Calls: **0**
- Real CRM Data Exposure: **0**
- Choice Writes: **0**
- Publish: **0**
- Solution Writes: **0**

## Report state correction

- Local Choice Count: **12**
- Local Option Count: **75**
- Local Choice Options Empty: **false**
- R3B frozen labels and actual values matched: **true**

## Lookup navigation metadata

- aigw_customerservicecoverage.aigw_accountid: relationship=aigw_account_customerservicecoverage, target=account, navigation=Aigw_Accountid, entitySet=accounts, required=ApplicationRequired
- aigw_customerservicecoverage.aigw_responsibledepartment: relationship=aigw_team_customerservicecoverage_responsibledepartment, target=team, navigation=Aigw_Responsibledepartment, entitySet=teams, required=ApplicationRequired
- aigw_interactionsignal.aigw_accountid: relationship=aigw_account_interactionsignal, target=account, navigation=Aigw_Accountid, entitySet=accounts, required=ApplicationRequired
- aigw_interactionsignal.aigw_opportunityid: relationship=aigw_opportunity_interactionsignal, target=opportunity, navigation=Aigw_Opportunityid, entitySet=opportunities, required=None
- aigw_interactionsignal.aigw_salesdepartment: relationship=aigw_team_interactionsignal_salesdepartment, target=team, navigation=Aigw_Salesdepartment, entitySet=teams, required=ApplicationRequired

- Team selection is reported only as **TEST-TEAM-TOKEN**. Its test-environment record ID is retained only in the controlled manifest.

## Runtime probe

- Started: **true**
- Created: **{"account":1,"opportunity":1,"coverage":2,"signal":3}**
- Validation: **true**
- Cleanup: **true**
- Residual: **0**

The six required Account/Opportunity, Coverage, Signal and Alternate Key checks all passed during the single probe. The final auxiliary BPF read initially used an incorrect hard-coded primary ID. No second probe was run. A read-only Metadata recovery resolved the actual primary ID as `businessprocessflowinstanceid`, confirmed `IsBPFEntity=true`, found zero rows for the probe Opportunity, and the request audit confirmed zero BPF writes.

## Request statistics

- Metadata GET: **196** total for R3C (including two Stage 0 reads and read-only recovery); the single apply invocation used **78** GET requests.
- Probe Create Attempts: **9**
- Probe Create Successes: **7**
- Alternate Key Duplicate Attempts: **2**
- Alternate Key Duplicate Rejections: **2**
- Probe Deletes: **7**
- Publish: **0**
- Choice Writes: **0**
- Solution Writes: **0**

## Protection

- Full Replica: **5/21/118/109**
- Protected Form unchanged: **true**
- Plugin: **7/0**
- Location Active: **51**
- App/Sitemap unchanged: **true**

## Gates

- testEnvironmentVerified: **true**
- solutionPackagingReady: **true**
- backingEntitySolutionReady: **true**
- localChoiceCount: **12**
- localOptionCount: **75**
- localChoiceOptionsEmpty: **false**
- localChoiceMetadataReady: **true**
- choicePublishReady: **true**
- lookupNavigationMetadataReady: **true**
- alternateKeysReady: **true**
- protectedBaselinePreserved: **true**
- coreSchemaPreserved: **true**
- fullReplicaPreserved: **true**
- actualPreserved: **true**
- pluginPreserved: **true**
- locationPreserved: **true**
- bpfPreserved: **true**
- appSitemapUnchanged: **true**
- polpodPreserved: **true**
- noOldProbeResidual: **true**
- securityMetadataReady: **true**
- coverageChoiceRuntimeReady: **true**
- signalChoiceRuntimeReady: **true**
- coverageAlternateKeyRuntimeReady: **true**
- interactionAlternateKeyRuntimeReady: **true**
- runtimeProbeReady: **true**
- runtimeProbeCleanupReady: **true**
- runtimeProbeResidual: **0**
- securityMinimumRuntimeReady: **true**
- securityUnchanged: **true**
- formViewSecurityPhaseReady: **true**
- demoDataDesignPhaseReady: **true**
- demoDataGenerationReady: **false**
- p0GatePassed: **true**
- p1GatePassed: **true**

## P0/P1/P2

- P0 Count: **0**
- P1 Count: **0**
- P2 Count: **2**

Accepted P2 items: the Account subgrid remains deferred because no approved Account Demo Form exists, and production multi-role runtime validation remains deferred. Neither changes the verified minimum role metadata or blocks Demo Data Design.

## Blockers

- None
