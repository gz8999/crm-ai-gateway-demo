# D365 AI Demo Full Replica Baseline Reconciliation

- Environment: `org91f5f65f.crm5.dynamics.com`
- Mode: `dry-run`
- Baseline Ready: **true**
- Current structure: 5 tabs / 21 sections / 118 controls / 109 unique fields
- Current hash: `9a7716dcb6e6acbdb03d00c7afc73f878af7e51e94e5c9e9bbc1e24e8e1f5b4c`
- Protected Form hash: `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`

## Difference

`addedFields`: ["aigw_opportunitylocation","aigw_nextaction","aigw_nextactiondate","aigw_sealandpollookup","aigw_sealandpodlookup","aigw_airpollookup","aigw_airpodlookup","aigw_yearrevenueactual_base"]

`removedFields`: ["aigw_opportunityplace","aigw_sealandpol","aigw_sealandpod","aigw_airpol","aigw_airpod","aigw_yearrevenueactualcny"]

The pre-phase reconciliation baseline was 5/19/115/107; the final readback above includes the approved R2F additions. No control was removed automatically.

## Scope

This phase does not modify the Protected Form, Account standard forms, Modern App/Sitemap, BPF, Plugin, or existing business records.
