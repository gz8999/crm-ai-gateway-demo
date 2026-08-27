# D365 Real Dataset Integration Report

## Result Summary

The Gateway now has a separate, GET-only D365 Frozen Dataset read path. The formal App calls `/api/d365-frozen/*`; the old Pilot API remains a compatibility path and is not used by the formal App.

## Implementation Gates

| Gate | Result |
| --- | --- |
| D365 Frozen Dataset allowlist and test host | true |
| Read Adapter Ready | true |
| Safe Context Builder Ready | true |
| Decision Pack Migration Ready | true |
| AI Cockpit reads Frozen Dataset route | true in code/tests |
| Risk ranking uses Safe Context facts | true in code/tests |
| Opportunity 360 uses Safe Context facts | true in code/tests |
| Meeting Copilot uses derived signal only | true in code/tests |
| Portfolio Intelligence uses 200-record scope | true in code/tests |
| Raw CRM Exposure | 0 in response assertions |
| CRM Writeback | false |
| External LLM | false |
| Production Isolation | true in code/tests |
| Live D365 Connected in this checkout | pending; no local D365 configuration |

## Verified Offline Counts

The private server-side manifest contains the frozen 3900-record allowlist. Injected runtime tests verify 60/120/200/240/130/1800/1350, 100 OpportunityClose, 200 BPF instances, status 91/100/9, fixed default `DEMO-OPP-075`, department filtering before Safe Context, and GET-only route behavior.

## Request Boundary

No Dataverse request, CRM writeback, external model call or production request was made by this implementation run. The live read contract remains disabled until a test-only Dataverse configuration is supplied. No credential, private manifest, GUID or screenshot is committed.

## Modified Files

- `server/d365/frozenDatasetContract.mjs`
- `server/d365/frozenDatasetReader.mjs`
- `server/d365/frozenDatasetRuntimeService.mjs`
- `server/pilot/pilotRuntimeService.mjs` (parameterized compatibility composition only)
- `server/app.mjs`
- `src/api.ts`
- `src/App.tsx`
- `src/decision/DecisionWorkspace.tsx`
- `src/decision/DecisionUi.tsx`
- `src/decision/AuditSafetyPage.tsx`
- `src/decision/productModel.ts`
- `tests/phase1c6f-d365-real-dataset-integration.test.mjs`
- six files under `docs/gateway/`

## Deferred Work

No external LLM comparison, model evaluation, CRM writeback, cleanup, production deployment or expansion of the Gateway allowlist is included in this phase.
