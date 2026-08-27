# Phase 1C-5R2E-2D1 Opportunity Runtime Form Access Forensics

## Result

**Runtime Form Access Understood=true.** The effective Opportunity form-access registry does not return `AI Gateway Opportunity Demo - Full Replica` for the browser user, even though the published FormXML says `Everyone`, `FallbackForm=true`, and `Order=2`. The runtime selector and a direct `formid` request confirm the same exclusion. This is classified as **A: effective Full Replica form access does not include the test user**, with a published FormXML/access-registry inconsistency that must be normalized through Form settings.

No Dataverse write, publish, activation, form-order change, fallback change, security-role change, or business record save was performed.

## Test User

| Item | Value |
|---|---|
| User | `Zhou Wenzhe` |
| `systemuserid` | `df4b1a2f-cd6d-f111-ab0d-00224818ead9` |
| Business unit | `org91f5f65f` (`4c441a2f-cd6d-f111-ab0d-00224818ead9`) |
| Direct roles | `System Administrator`, `Basic User` |
| Team-inherited roles | None |
| Team membership | Default owner team `org91f5f65f`; no inherited role |

The authenticated Application User used for metadata reads is `# crm-ai-gateway-demo` (`7928c06a-da75-f111-ab0e-70a8a504e6f9`) and also has `System Administrator`. `RetrieveFilteredForms` returned the same five Opportunity Main Forms for both identities and excluded Full Replica for both.

## Form Access Comparison

### Full Replica

| Property | Result |
|---|---|
| Form ID | `97a1555b-0903-408a-ac63-d63aed65b14a` |
| Published state | Active |
| Default | No |
| App inclusion | Exactly one published and one unpublished `componenttype=60` reference; both point to Full Replica |
| Published FormXML access condition | `Everyone=true`, `FallbackForm=true`, `Order=2`, no explicit Role IDs |
| Effective browser-user access | **Excluded** by `RetrieveFilteredForms` |
| Effective Application User access | **Excluded** by `RetrieveFilteredForms` |
| Runtime selector | Absent |
| FormXML SHA-256 | `2b5d3339bae2bd59fc4b34fb0dd55770ef0d3fe37fc01357be387ea225159545` |

The `Everyone` condition in FormXML does not match the authoritative effective-access result. The safest interpretation is a stale or unsynchronized form-access registration created during clone/activation/publication, not proof that App inclusion is missing.

### Sales Trial

| Property | Result |
|---|---|
| Form ID | `3d863315-c806-41ba-9c8d-a8577bcaa131` |
| Published state | Active |
| Default | No |
| App inclusion | Not selected by the Modern App |
| Published FormXML access condition | Specific roles, `FallbackForm=true`, `Order=4` |
| Roles | `System Administrator`, `System Customizer` |
| Browser-user match | Yes, through direct `System Administrator` role |
| Effective access | Included by `RetrieveFilteredForms` and present in selector |

Sales Trial is accessible because the browser user has its assigned System Administrator role. Its observed selection on ordinary `New` is compatible with Dynamics retaining the user's previously selected form in that browser; form order does not override an explicit recent selection.

## Effective Form Order

For both the browser user and Application User, `RetrieveFilteredForms` returned:

1. `AI Gateway Opportunity Demo` (`8db60b46-b976-f111-ab0e-00224817cb31`), order 2, Everyone, fallback
2. `Opportunity` (`a837e4a7-01b8-4f82-a475-be9abd67e667`), order 2, Everyone, fallback
3. `Sales Insights` (`595978a6-704c-4aec-aab8-34f3927c1cda`), order 3, Everyone, fallback
4. `Sales Trial` (`3d863315-c806-41ba-9c8d-a8577bcaa131`), order 4, System Administrator/System Customizer, fallback
5. `Lead qualification opportunity form` (`2ad2c7ff-e6fa-ee11-9f89-7c1e521a5763`), order 100, Everyone, not fallback

Full Replica has no effective position because it is not in the available-form result.

## App And Routing

Published and unpublished Modern App definitions are synchronized:

- App: `916afe4b-607e-f111-ab0e-002248eb1915`
- Descriptor hash: `72c27875386e4865aa06105720e7ddff788eff8ec06f0576dce926ab30d7a424`
- Explicit Opportunity Main Forms: one
- Explicit Form: Full Replica
- Other explicit Opportunity Main Forms: zero

This rules out an unpublished/published App-selection mismatch as the primary cause.

| Browser route | Requested | Observed | Resolved Form ID |
|---|---|---|---|
| Normal `New` | No explicit form | `Sales Trial` | `3d863315-c806-41ba-9c8d-a8577bcaa131` |
| Existing `[AI-DEMO]` with target `formid` | Full Replica | `AI Gateway Opportunity Demo` | `8db60b46-b976-f111-ab0e-00224817cb31` |
| Runtime selector | Full Replica present | Full Replica absent; five effective forms shown | N/A |

The requested Full Replica ID remains in the URL, but the client resolves to an accessible fallback form. A private/incognito context was not available through the controlled Chrome surface, and no sign-in or credential workaround was attempted. This does not weaken the server-side finding because `RetrieveFilteredForms` independently excludes Full Replica before browser caching is involved.

## Script And Form Routing Audit

Full Replica contains only Microsoft first-party Opportunity, Forecasting, Documents, and Sales Copilot libraries/handlers. FormXML/FormJSON contains no `formSelector`, `navigateTo`, `openForm`, `setCurrentItem`, or `Xrm.Navigation` routing reference. No custom handler forces another Form ID.

Classification **D** is therefore rejected. Classification **C** is not the primary cause because published/unpublished App selections match and the server-side filtered-form response already excludes Full Replica. Classification **B** explains why Sales Trial is chosen after exclusion, but not why Full Replica is absent.

## Root Cause Classification

**A: Full Replica effective form access does not include the test user.**

Confidence is high for the effective-access failure and moderate for its storage-level cause. The inconsistency is specifically:

- FormXML advertises Everyone/fallback/order 2;
- Dataverse `RetrieveFilteredForms` excludes the Form for both tested System Administrator identities;
- runtime Form Selector excludes it;
- direct `formid` is ignored in favor of an accessible fallback;
- App selection is correct and no script forces rerouting.

## Minimal Repair, Not Executed

1. Create or reuse a dedicated role such as `CRM AI Gateway Demo Full Replica User` with only the required Opportunity/App privileges.
2. Assign that role only to the browser test user or approved demo users.
3. In Opportunity Form settings, set Full Replica to **Specific security roles** and select only that dedicated role. Do not use global default and do not change Sales Trial.
4. Keep Full Replica non-default and non-fallback. Place it first only within the available Main Form order if required for that role.
5. Save and publish only the authorized Opportunity form-access customization, then rerun `RetrieveFilteredForms`, normal New, direct `formid`, existing record, and selector tests.

Toggling and saving the explicit role assignment is intentional: it forces the platform to regenerate the effective access registration instead of trusting the inconsistent cloned FormXML condition.

## Request Accounting

- Explicit Dataverse GET: 27
- Browser read-only navigations/evidence: existing authenticated session; no save
- POST: 0
- PATCH: 0
- DELETE: 0
- Publish: 0
- Activation: 0
- Business writes: 0
- Production requests: 0

The ignored local evidence is stored at `local-artifacts/d365/runtime-validation/phase1c5r2e2d1-runtime-form-access-forensics.json`.

## References

- Microsoft Learn: [Control access to model-driven app forms](https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/control-access-forms)
- Microsoft Learn: [RetrieveFilteredForms Web API function](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrievefilteredforms?view=dataverse-latest)
- Microsoft Learn: [Assign model-driven app form order](https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/assign-form-order)
