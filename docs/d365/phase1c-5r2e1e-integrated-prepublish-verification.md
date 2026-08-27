# Phase 1C-5R2E-1E Integrated Pre-Publish Verification

## Conclusion

**Pre-Publish Verification Ready=false.**

The component-level metadata gates pass, but the current Sales trial App does not directly include the Full Replica Opportunity Form or the Actual Management table. This is a P0 runtime-access blocker under the current gate. No App change was made because this phase is read-only.

The complete raw read-back, hashes, component IDs, and environment-specific metadata are stored only in the ignored local artifact:

`local-artifacts/d365/plugin-registration/phase1c5r2e1e-integrated-prepublish-verification.json`

## Form Verification

### Full Replica Opportunity Form

- Form: `AI Gateway Opportunity Demo - Full Replica`
- Type: Main Form
- Published state: Inactive, non-default
- Unpublished state: Inactive, non-default, unpublished
- Tabs: 5
- Sections: 19
- Controls: 114
- Unique bound fields: 106
- FormXML/FormJSON major-field structure: synchronized
- Undefined or empty invalid references: none detected
- Header order: `aigw_winprobabilityrank` -> `aigw_budgetstatus` -> `ownerid`
- `aigw_yearrevenueactual`: one control, read-only
- `aigw_yearrevenueactual_base`: one control, read-only
- `aigw_yearrevenueactualcny`: zero controls
- `actualvalue_base`: zero controls
- Products label: `产品`
- Files label: `文件`

The protected Opportunity Form hashes match the frozen R2E-1B baseline. The Full Replica hashes also match the previously verified unpublished baseline.

### Actual Management Main Form

- Unpublished target name: `实绩管理 - AI Demo`
- Published version remains the previous `Information` definition until publication.
- One Main Form exists for the table.
- Target unpublished form: 1 Tab, 5 Sections, 41 Controls, 41 unique bound fields.
- April-March Revenue, GP, and MP: 36 controls present.
- Monthly Revenue: editable.
- `aigw_annualactualrevenue`: one control, read-only.
- `aigw_opportunityid`: visible and bound correctly.
- `transactioncurrencyid`: visible and bound correctly.
- `_base` controls: zero.
- Form/View unpublished hashes match the frozen R2E-1D baseline.

Runtime New/Open routing was not exercised in this read-only pass. Metadata shows one active Main Form and a valid relationship, which is sufficient for the publish plan but not a browser-level proof.

## Actual Management View

`实绩管理 - AI Demo` currently has 33 columns. FetchXML attributes, LayoutXML cells, and LayoutJSON columns match one another in name and order:

1. `aigw_name`
2. `aigw_opportunityid`
3. `transactioncurrencyid`
4. `aigw_expectedorderdate`
5. `aigw_annualactualrevenue`
6. April-March Revenue and GP pairs in fiscal order
7. `createdby`, `createdon`, `modifiedby`, `modifiedon`

The View has no filter or link-entity and remains sorted by `modifiedon` descending. It contains one Annual column, no deprecated CNY field, and no incorrect `_base` field. MP columns remain outside the View by the confirmed R2E-1D scope and are recorded as P2.

## Subgrid and Relationship

The Full Replica contains exactly one target Subgrid:

- Control: `aigw_actualmanagement_subgrid`
- Target table: `aigw_actualmanagement`
- Relationship: `aigw_opportunity_actualmanagement`
- Default View: `实绩管理 - AI Demo`
- Rows: 10
- Search: on
- View selector: on
- Chart: off
- Duplicate target Subgrids: none

The relationship metadata confirms Opportunity as the referenced table and `aigw_opportunityid` as the referencing lookup.

## BPF and Business Rule

Custom BPF:

- Metadata name: `销售流程 - AI Demo Full Replica`
- Visible stage labels: `授予资格` -> `案件关闭`
- Steps: `parentaccountid` Required; `aigw_winprobabilityrank`, `statuscode`, and `actualclosedate` Optional
- All four step fields are valid Opportunity metadata fields.
- State: Draft/Inactive
- Default managed `Sales Process`: unchanged, English four-stage process

The screenshot only confirms the collapsed visible caption `销售流程`. Expanded step labels, required markers, and hidden stages remain `Requires User Confirmation`; they do not automatically block the first UI Demo.

Business Rule `AI Gateway Full Replica - Required - Opportunity` remains Draft/Inactive and Specific Form scoped to the Full Replica. No Column RequiredLevel change was detected.

## Plugin Verification

- Assembly: 1
- Plugin Types: 3
- Steps: 7
- Images: 6
- Enabled / Disabled: 7 / 0
- Update filtering attributes: 14
- Steps on `opportunity` for this Assembly: 0
- All seven steps target `aigw_actualmanagement`.

## App Visibility

Read-only `appmodules` and `appmodulecomponents` queries found:

| App | Active | Opportunity table | Full Replica Form | Actual Management table | Actual Form/View |
|---|---|---|---|---|---|
| CRM AI Gateway Demo | Yes | Not directly confirmed | No | No | No |
| Sales trial | Yes | Yes | No | No | No |

Form order and security-role assignment are not exposed by the queried App component collection and require a Power Apps UI check. Browser switching to the Full Replica was not performed in this metadata-only phase.

### Required App Follow-up

1. Add the Full Replica Main Form to the selected Sales App and confirm form order.
2. Add `aigw_actualmanagement` and its Main Form/View to the selected Sales App, if the standalone table must be navigable.
3. Confirm security roles for both tables and forms.
4. Verify browser New/Open routing after publication.
5. Publish the App separately.

## Priority List

### P0 - Publish Blocking

- Sales trial App does not directly include the Full Replica Form or Actual Management table. Runtime access is not ready.

### P1 - High Fidelity / Release Review

- The BPF metadata name contains the technical suffix; only the visible screenshot caption `销售流程` is confirmed.
- App form order and security-role assignment still require UI confirmation.

### P2 - Demo Optimization

- MP columns are not in the 33-column View.
- Browser-level New/Open and form switching have not been tested.

### P3 - Later Scope

- Expanded BPF step visual replication after an expanded-stage screenshot is supplied.
- Optional App navigation and View refinements.

## Proposed Execution Order

The sequence below is a plan only and was not executed:

### R2E-2A: Controlled Component Publish

- Publish Opportunity customizations containing the Full Replica Form.
- Publish `aigw_actualmanagement` customizations containing its relationship, Main Form, and View.
- Do not activate the Full Replica Form.
- Do not activate the BPF.
- Do not modify or publish the App.
- Do not set a default Form.

This step is currently held by the P0 App-access gate.

### R2E-2B: Browser Verification

- Verify published Full Replica structure and Header.
- Verify Actual Management New/Open routing.
- Verify Subgrid relationship, View, and row settings.
- Verify calculated fields remain read-only.

### R2E-3: App and Activation Gate

- Separately activate the Full Replica Form after browser verification.
- Separately activate the custom BPF after stage/step confirmation.
- Add target components to the selected App.
- Set form order/default only with explicit confirmation.
- Publish the App separately.

## Request Accounting

| GET | POST | PATCH | DELETE | Publish | Activation | Business writes | Production requests |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 36 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

No production hostname was contacted. No Form, View, BPF, Plugin, App, security role, default form, or business data was modified.
