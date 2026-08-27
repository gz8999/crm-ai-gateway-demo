# Phase 1C-5R2E-2D Browser Runtime UI And Routing Validation

## Result

**Browser Runtime Validation Ready=false.** The published Modern App loads and both intended navigation items work, but Opportunity runtime routing does not honor the configured Full Replica form selection. Both `New` and an existing `[AI-DEMO]` record opened a different Opportunity Main Form. The Full Replica was also absent from the runtime form selector.

No record was created, edited, saved, or deleted. The custom BPF remains Draft/Inactive and the Actual Totals Plugin remains Enabled 7 / Disabled 0.

## App Launch And Navigation

| Check | Result |
|---|---|
| Modern App loads | Pass |
| Opportunity navigation | Pass |
| Actual Management navigation | Pass |
| Opportunity Product hidden from navigation | Pass |
| SharePoint Document hidden from navigation | Pass |
| Generic Entity page absent | Pass |
| Component load error | None observed on list pages |

The app opened successfully as `CRM AI Gateway Demo - Modern`. Its left navigation contains only `Actual Management` and `Opportunities` under the app group.

## Opportunity Runtime Routing

The Opportunity default View is correct:

- `所有案件 - AI Demo Full Replica`
- 100 records loaded

Runtime form routing is not correct:

| Route | Expected | Observed | Result |
|---|---|---|---|
| Opportunity View -> New | `AI Gateway Opportunity Demo - Full Replica` | `Sales Trial` | P0 |
| Existing `[AI-DEMO]` record | Full Replica | Standard/non-Full-Replica Opportunity form | P0 |
| Direct record URL with target `formid` | Full Replica | `AI Gateway Opportunity Demo` | P0 |
| Runtime form selector | Full Replica available | Full Replica absent | P0 |

The runtime form selector exposed `AI Gateway Opportunity Demo`, `Opportunity`, `Sales Insights`, `Sales Trial`, and `Lead qualification opportunity form`. It did not expose `AI Gateway Opportunity Demo - Full Replica`.

Dataverse metadata independently confirms that Form `97a1555b-0903-408a-ac63-d63aed65b14a` is an Active, non-default Opportunity Main Form named `AI Gateway Opportunity Demo - Full Replica`. The mismatch is therefore a runtime App/Form availability or security-routing issue, not an inactive Form definition.

Because the intended Form could not be opened through the App, the following browser checks are blocked rather than inferred from metadata:

- five target Tabs and their labels;
- target Header order and read-only presentation;
- deprecated CNY field absence at runtime;
- Products and Files target-tab behavior;
- Actual Management Subgrid New/Open routing.

The default English four-stage Sales Process is visible. This is expected while the custom BPF remains Draft/Inactive and is not itself a failure.

## Actual Management Runtime

| Check | Result |
|---|---|
| Default View `实绩管理 - AI Demo` | Pass |
| New route opens target Main Form | Pass |
| Main Form title identifies `实绩管理 - AI Demo` | Pass |
| One Tab / five Sections | Pass |
| Sections Basic Information, 1Q, 2Q, 3Q, 4Q | Pass |
| April-March Revenue/GP/MP visible | Pass |
| Monthly Revenue fields editable | Pass |
| Annual Actual Revenue unique and locked | Pass |
| Opportunity Lookup visible | Pass |
| Transaction Currency visible | Pass |
| `_base` control visible | No |
| Form load error | None observed |

The Main Form is structurally usable. Its field and section labels render primarily in English, which remains a high-fidelity localization issue.

## Subgrid Route

Subgrid runtime validation was not attempted after the Opportunity routing P0 was confirmed. Opening the wrong Opportunity form means the target `aigw_actualmanagement_subgrid` is unavailable, so creating a temporary Opportunity would not test the intended path.

No temporary Opportunity was created. Cleanup was therefore not required and residual test data is zero.

## UI Issues

### P0

1. Full Replica is not selected at Opportunity runtime. New and existing records route to other Opportunity forms.
2. Full Replica is absent from the runtime form selector despite Active metadata and explicit App component membership.
3. Full Replica Tabs, Header, read-only fields, and Subgrid cannot receive browser acceptance until routing is repaired.

### P1

1. Opportunity View columns contain mixed Chinese/English labels, including `Topic is required`, `Account`, `Contact`, `Est. close date`, and `Actual Close Date`.
2. Actual Management Main Form and View field labels render primarily in English rather than the intended Chinese UI labels.

### P2

1. The Actual Management wide View requires horizontal navigation; only the leading month columns are visible in the initial viewport.

## Protection Verification

- Connected hostname: approved test organization only
- Full Replica metadata: Active, non-default
- Protected Form FormXML SHA-256: `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`
- Actual Management Form/View: unchanged
- Custom BPF: Draft/Inactive
- Plugin: Assembly 1 / Types 3 / Steps 7 / Images 6 / Enabled 7 / Disabled 0
- Old App and Sales trial: unchanged
- Published App validation: Success, Errors 0, accepted ALM Warnings 4
- Form/App/View/Plugin metadata writes: 0
- Business writes: 0
- Production requests: 0

## Evidence

Screenshots are stored only under ignored local artifacts:

- `local-artifacts/d365/runtime-validation/r2e2d/01-app-navigation.png`
- `local-artifacts/d365/runtime-validation/r2e2d/02-opportunity-view.png`
- `local-artifacts/d365/runtime-validation/r2e2d/03-opportunity-new-routing-p0.png`
- `local-artifacts/d365/runtime-validation/r2e2d/04-opportunity-existing-routing-p0.png`
- `local-artifacts/d365/runtime-validation/r2e2d/05-actual-management-view.png`
- `local-artifacts/d365/runtime-validation/r2e2d/06-actual-management-main-form.png`
- `local-artifacts/d365/runtime-validation/r2e2d/07-full-replica-selector-missing-p0.png`

## Request Accounting

- Explicit Dataverse read-only GET: 27
- POST: 0
- PATCH: 0
- DELETE: 0
- Publish: 0
- Activation: 0
- Business writes: 0
- Production requests: 0

Browser page resources and internal read-only XHR calls are not represented as individual API request counts.

## Next Gate

Do not enter the Plugin Browser Smoke Test. First repair Full Replica runtime availability/selection for the current user and Modern App, republish only the required App customization if authorized, and repeat this phase from Opportunity `New` through Subgrid New routing.
