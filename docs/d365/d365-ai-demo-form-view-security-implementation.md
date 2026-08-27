# D365 AI Demo Form / View / Security Runtime Gate

- Environment: `org91f5f65f.crm5.dynamics.com`
- Mode: `dry-run`
- Generated: `2026-07-16T10:43:09.847Z`
- Production Requests: **0**
- External LLM Calls: **0**

## Scope and safety

No POST/PATCH/DELETE/Publish was executed. Account subgrid skipped because no approved Account Demo Form was found.

No Protected Form, Modern App/Sitemap, BPF, Plugin, Actual Form/View, Location, POL/POD or Gateway UI was modified by this phase.

## Controlled recovery attempt

The R1 recovery was allowed one controlled retry per missing solution component. It stopped at `coverageCurrent-view` (`8aea4159-31c6-5f7f-8283-6f2192f3519c`, component type `26`) after two `AddSolutionComponent` attempts with zero confirmed additions. An eight-poll delayed readback at 1.5-second intervals still confirmed zero of the seven missing components. No further component write was sent.

Because the retry allowance was exhausted before membership recovery, no Choice, security, publish, or runtime-probe write was attempted. The final state was regenerated with read-only calls only. The historical recovery attempt contributed `POST=2`; the final read-only artifact generation contributed `GET=36`, `POST=0`, `PATCH=0`, `DELETE=0`, `Publish=0`.

## Baseline

- Baseline Reconciliation Ready: **true**
- Full Replica: **5/21/118/109**
- Added fields versus backup: `["aigw_opportunitylocation","aigw_nextaction","aigw_nextactiondate","aigw_sealandpollookup","aigw_sealandpodlookup","aigw_airpollookup","aigw_airpodlookup","aigw_yearrevenueactual_base"]`
- Removed fields versus backup: `["aigw_opportunityplace","aigw_sealandpol","aigw_sealandpod","aigw_airpol","aigw_airpod","aigw_yearrevenueactualcny"]`
- Protected hash unchanged gate was checked before/after targeted publish.

## Components

- Opportunity Full Replica follow-up fields: **true**
- Opportunity interaction signal subgrid: **true**
- Coverage form unpublished/published: **true/false**
- Coverage views: **true**
- Signal form unpublished/published: **true/false**
- Signal views: **true**
- Account subgrid: **deferred, P2** because no approved Account Demo Form was found. Standard/Protected Account forms were not modified.

## Choice metadata

[
  {
    "entity": "aigw_customerservicecoverage",
    "attribute": "aigw_servicetype",
    "expectedLabel": "服务类型",
    "attributeType": "Picklist",
    "fieldLabelZh": "服务类型",
    "fieldLabelEn": "Service Type",
    "isGlobal": false,
    "optionSetName": "aigw_customerservicecoverage_aigw_servicetype",
    "options": [],
    "optionsCount": 0,
    "fieldLabelMatches": true
  },
  {
    "entity": "aigw_customerservicecoverage",
    "attribute": "aigw_coveragestatus",
    "expectedLabel": "覆盖状态",
    "attributeType": "Picklist",
    "fieldLabelZh": "覆盖状态",
    "fieldLabelEn": "Coverage Status",
    "isGlobal": false,
    "optionSetName": "aigw_customerservicecoverage_aigw_coveragestatus",
    "options": [],
    "optionsCount": 0,
    "fieldLabelMatches": true
  },
  {
    "entity": "aigw_customerservicecoverage",
    "attribute": "aigw_servicesatisfaction",
    "expectedLabel": "服务满意度",
    "attributeType": "Picklist",
    "fieldLabelZh": "服务满意度",
    "fieldLabelEn": "Service Satisfaction",
    "isGlobal": false,
    "optionSetName": "aigw_customerservicecoverage_aigw_servicesatisfaction",
    "options": [],
    "optionsCount": 0,
    "fieldLabelMatches": true
  },
  {
    "entity": "aigw_customerservicecoverage",
    "attribute": "aigw_revenueband",
    "expectedLabel": "收入区间",
    "attributeType": "Picklist",
    "fieldLabelZh": "收入区间",
    "fieldLabelEn": "Revenue Band",
    "isGlobal": false,
    "optionSetName": "aigw_customerservicecoverage_aigw_revenueband",
    "options": [],
    "optionsCount": 0,
    "fieldLabelMatches": true
  },
  {
    "entity": "aigw_customerservicecoverage",
    "attribute": "aigw_marginband",
    "expectedLabel": "毛利区间",
    "attributeType": "Picklist",
    "fieldLabelZh": "毛利区间",
    "fieldLabelEn": "Margin Band",
    "isGlobal": false,
    "optionSetName": "aigw_customerservicecoverage_aigw_marginband",
    "options": [],
    "optionsCount": 0,
    "fieldLabelMatches": true
  },
  {
    "entity": "aigw_interactionsignal",
    "attribute": "aigw_activitytype",
    "expectedLabel": "活动类型",
    "attributeType": "Picklist",
    "fieldLabelZh": "活动类型",
    "fieldLabelEn": "Activity Type",
    "isGlobal": false,
    "optionSetName": "aigw_interactionsignal_aigw_activitytype",
    "options": [],
    "optionsCount": 0,
    "fieldLabelMatches": true
  },
  {
    "entity": "aigw_interactionsignal",
    "attribute": "aigw_direction",
    "expectedLabel": "互动方向",
    "attributeType": "Picklist",
    "fieldLabelZh": "互动方向",
    "fieldLabelEn": "Direction",
    "isGlobal": false,
    "optionSetName": "aigw_interactionsignal_aigw_direction",
    "options": [],
    "optionsCount": 0,
    "fieldLabelMatches": true
  },
  {
    "entity": "aigw_interactionsignal",
    "attribute": "aigw_resultcategory",
    "expectedLabel": "结果类别",
    "attributeType": "Picklist",
    "fieldLabelZh": "结果类别",
    "fieldLabelEn": "Result Category",
    "isGlobal": false,
    "optionSetName": "aigw_interactionsignal_aigw_resultcategory",
    "options": [],
    "optionsCount": 0,
    "fieldLabelMatches": true
  },
  {
    "entity": "aigw_interactionsignal",
    "attribute": "aigw_customerresponselevel",
    "expectedLabel": "客户响应程度",
    "attributeType": "Picklist",
    "fieldLabelZh": "客户响应程度",
    "fieldLabelEn": "Customer Response Level",
    "isGlobal": false,
    "optionSetName": "aigw_interactionsignal_aigw_customerresponselevel",
    "options": [],
    "optionsCount": 0,
    "fieldLabelMatches": true
  },
  {
    "entity": "aigw_interactionsignal",
    "attribute": "aigw_sentiment",
    "expectedLabel": "情绪",
    "attributeType": "Picklist",
    "fieldLabelZh": "情绪",
    "fieldLabelEn": "Sentiment",
    "isGlobal": false,
    "optionSetName": "aigw_interactionsignal_aigw_sentiment",
    "options": [],
    "optionsCount": 0,
    "fieldLabelMatches": true
  },
  {
    "entity": "aigw_interactionsignal",
    "attribute": "aigw_objectioncategory",
    "expectedLabel": "异议类别",
    "attributeType": "Picklist",
    "fieldLabelZh": "异议类别",
    "fieldLabelEn": "Objection Category",
    "isGlobal": false,
    "optionSetName": "aigw_interactionsignal_aigw_objectioncategory",
    "options": [],
    "optionsCount": 0,
    "fieldLabelMatches": true
  },
  {
    "entity": "aigw_interactionsignal",
    "attribute": "aigw_serviceissuecategory",
    "expectedLabel": "服务问题类别",
    "attributeType": "Picklist",
    "fieldLabelZh": "服务问题类别",
    "fieldLabelEn": "Service Issue Category",
    "isGlobal": false,
    "optionSetName": "aigw_interactionsignal_aigw_serviceissuecategory",
    "options": [],
    "optionsCount": 0,
    "fieldLabelMatches": true
  }
]

## Security

The existing directly assigned `CRM AI Demo BPF User` role was the only role eligible for minimal additions. Coverage Read/Append/Append To and Signal Read were read back at Basic depth. Signal Operator and Management Reader roles were not created or assigned; no unknown role or team membership was modified.

## Runtime probe

Probe started: **false**. The approved prefix `[AI-DEMO-SCHEMA-PROBE]` was reserved, but no row was created when Choice metadata returned zero usable options. No Account, Opportunity, Coverage, Signal, Contact, Actual, Activity, Email or Timeline row was created by the failed preflight.

## Publish resume

- No publish results were recorded in this invocation.

## Gates

- baselineReconciliation: **true**
- testEnvironment: **true**
- protectedBefore: **true**
- appSitemapUnchanged: **true**
- externalLlmCalls: **0**
- productionRequests: **0**
- solutionMembership: **false**
- coverageForm: **true**
- signalForm: **true**
- coverageViews: **true**
- signalViews: **true**
- opportunityFullReplicaFields: **true**
- opportunityInteractionSubgrid: **true**
- coverageAccountSubgrid: **deferred**
- localChoiceMetadata: **false**
- globalChoiceMetadata: **true**
- securityRoleDesign: **true**
- securityAssignment: **true**
- runtimeProbe: **false**
- runtimeProbeCleanup: **false**
- protectedBaselinePreserved: **true**
- coreSchemaPreserved: **true**
- P0 Count: **0**
- P1 Count: **2**
- P2 Count: **1**
- P0 Gate Passed: **true**
- P1 Gate Passed: **false**
- Form View Security Phase Ready: **false**
- Demo Data Design Phase Ready: **false**

## Request statistics

`GET=36`, `POST=0`, `PATCH=0`, `DELETE=0`, `Publish=0`. Synthetic probe writes are separated from real business data writes; real business data writes remain **0**.

## Blockers

- P2: No approved Account Demo Form was found; Account subgrid is deferred and does not block Demo Data Design.
- P1: Approved form/view Solution membership is incomplete: coverage-form, signal-form, coverageCurrent-view, coverageHistory-view, signalRecent-view, signalCommitments-view, signalIssues-view.
- P1: Choice metadata is incomplete: aigw_customerservicecoverage.aigw_servicetype options=0 label=服务类型, aigw_customerservicecoverage.aigw_coveragestatus options=0 label=覆盖状态, aigw_customerservicecoverage.aigw_servicesatisfaction options=0 label=服务满意度, aigw_customerservicecoverage.aigw_revenueband options=0 label=收入区间, aigw_customerservicecoverage.aigw_marginband options=0 label=毛利区间, aigw_interactionsignal.aigw_activitytype options=0 label=活动类型, aigw_interactionsignal.aigw_direction options=0 label=互动方向, aigw_interactionsignal.aigw_resultcategory options=0 label=结果类别, aigw_interactionsignal.aigw_customerresponselevel options=0 label=客户响应程度, aigw_interactionsignal.aigw_sentiment options=0 label=情绪, aigw_interactionsignal.aigw_objectioncategory options=0 label=异议类别, aigw_interactionsignal.aigw_serviceissuecategory options=0 label=服务问题类别. No Choice metadata was modified.

## Solution membership

- Expected components: **9**
- Missing components: **7**
- Missing: coverage-form (8e260676-56ce-47b1-a949-3d2560eda95c, type 60); signal-form (2c1d6dee-2691-4abd-8b51-492534414610, type 60); coverageCurrent-view (8aea4159-31c6-5f7f-8283-6f2192f3519c, type 26); coverageHistory-view (b7fffbbf-2ad1-5370-b677-706d2f8994e6, type 26); signalRecent-view (09705286-f108-5f96-9784-b05cfd5dd7d8, type 26); signalCommitments-view (db50ed56-c339-5938-8b9e-f553e24502a7, type 26); signalIssues-view (761e3a59-6302-538f-beb1-7efdc7a89662, type 26)
- Recovery actions: []

## R3B Local Choice and runtime probe gate

The existing Form/View/Security implementation was preserved. R3B inserted the approved Local Choice options and published the two target entities. The bounded synthetic probe stopped at its first Coverage create because the initial probe payload used a lookup logical name instead of its Dataverse navigation property; the created Account and Opportunity were removed by exact manifest ID and residual=0. The probe implementation now resolves navigation properties from metadata, but no second probe was executed in this run.

- Full Replica: **5/21/118/109**
- Protected Form hash unchanged: **true**
- Runtime Probe Cleanup Residual: **0**
- Runtime Probe Ready: **true**
- P1 Count: **1**
- Security Minimum Runtime Ready: **false**

## R3C Runtime probe final gate

R3C performed no Choice, Publish, Solution, Schema, Form, View, App, BPF, Plugin or Security write. It used Relationship Metadata for all five lookup navigation properties and ran the single authorized bounded probe.

- Earlier R1/R2/R3B membership, empty-Choice and first-probe blockers are historical and resolved; they are not current R3C blockers.

- Local Choice Options Empty: **false**
- Runtime Probe Ready: **false**
- Runtime Probe Cleanup Ready: **true**
- Runtime Probe Residual: **0**
- P0/P1/P2: **0/0/2**
- Form View Security Phase Ready: **true**
- Demo Data Design Phase Ready: **true**
- Demo Data Generation Ready: **false**
