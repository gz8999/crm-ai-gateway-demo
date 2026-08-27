# Phase 1C-5R2E-2D2B Runtime Form Routing

## Result

The single authorized Opportunity-scoped `PublishXml` completed successfully.
Server-side form access and `RetrieveFilteredForms` verification passed. Browser
New/Open and Form Selector verification could not be completed because the
existing authenticated browser extension stopped responding while reading the
Dynamics page. No browser save or record mutation was attempted.

`Runtime Form Routing Ready=false`

The remaining gate is browser-only validation. Do not send another `PublishXml`.

## Publish

| Item | Result |
|---|---|
| Scope | Opportunity only |
| Endpoint | `/api/data/v9.2/PublishXml` |
| Requests | 1 |
| Response | HTTP 204, empty body |
| Retry | None |
| App publish | 0 |
| BPF activation | 0 |
| Business data writes | 0 |
| Production requests | 0 |

## Access Configuration

| Definition | Before | After |
|---|---|---|
| Full Replica unpublished | System Administrator only; `Fallback=false` | Unchanged |
| Full Replica published | Everyone; `Fallback=true` | System Administrator only; `Fallback=false` |
| Form order | 2 | 2 |
| Default | false | false |
| Activation | Active | Active |

The published and unpublished definitions now contain the same role-only access
condition. `RetrieveFilteredForms` for the designated test user returned the
Full Replica form, with `targetIncluded=true`.

## Protection Checks

- Protected Form hash unchanged.
- Sales Trial hash unchanged.
- Modern App descriptor hash unchanged and no App publish was performed.
- Business Rule remains Draft/Inactive.
- Custom BPF remains Draft/Inactive.
- Plugin remains one assembly, three types, seven enabled steps, zero disabled steps.
- No Form PATCH, App modification, BPF activation, default-form change, or business-data write occurred.

## Browser Gate

The authenticated Chrome tab was identified as the designated test environment,
but the browser control extension became unresponsive during page observation.
The following checks therefore remain pending and must be performed in a fresh
authenticated browser session:

1. Modern App > Opportunity > New opens the Full Replica form.
2. An existing `[AI-DEMO]` Opportunity opens the Full Replica form.
3. The Form Selector contains the Full Replica form.
4. A direct Full Replica `formid` route does not fall back to another form.
5. No record is saved or changed.

The server-side result is not substituted for these browser checks.

## Evidence

The ignored local execution evidence is stored under:

`local-artifacts/d365/runtime-validation/phase1c5r2e2b-runtime-form-routing.json`

It records the pre/post access conditions, the HTTP 204 response, delayed GET
read-back, protection checks, and request counts without containing credentials.

## Next Step

Run only the browser runtime validation gate. If the browser confirms New/Open
and Selector routing, update the gate to ready. Do not publish the App again,
activate the BPF, change Form order, or change security roles.
