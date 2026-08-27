# Phase 1C-5R2E-2 Controlled Publish Plan

## Gate Status

This is a plan only. The integrated pre-publish audit is currently **not ready** because the selected Sales App does not directly include the Full Replica Form or the Actual Management table. No publish or activation action is authorized by this document.

## R2E-2A: Component Publish Only

Prerequisites:

- P0 App-access issue resolved or explicitly reclassified.
- Full Replica remains inactive and non-default.
- Actual Management Main Form remains active and unpublished.
- Actual View remains active with unpublished changes.
- BPF remains Draft/Inactive.
- Plugin remains 1 assembly, 3 types, 7 enabled steps, 6 images.
- Protected Form and managed Sales Process hashes remain unchanged.

Planned order:

1. Save-only changes are already complete.
2. Publish the Opportunity table customizations containing the Full Replica Form.
3. Publish `aigw_actualmanagement` table customizations containing the relationship, Main Form, and View.
4. Re-read the published Form, View, relationship, and Subgrid references.
5. Do not activate the Full Replica Form.
6. Do not activate the custom BPF.
7. Do not set a default Form.
8. Do not modify or publish the App.

The actual supported targeted publish request and its exact scope must be approved in a separate write gate. Broad entity publication is not implied by this plan.

## R2E-2B: Published Browser Verification

After R2E-2A succeeds, verify in the selected Sales App:

1. Full Replica is selectable only after the App component gate is satisfied.
2. Header order and read-only calculated fields render correctly.
3. Summary, Budget, Actuals, Product, and Files structure remains intact.
4. Subgrid shows the approved View and relationship.
5. New/Open opens `实绩管理 - AI Demo`.
6. Actual Management shows April-March entry controls.
7. Annual Actual Revenue remains read-only.

## R2E-3: Activation and App Integration

This requires a separate authorization:

1. Activate the Full Replica Form.
2. Activate the custom BPF.
3. Add the Opportunity Full Replica Form to the selected App.
4. Add `aigw_actualmanagement`, its Main Form, and its View to the selected App where standalone navigation is required.
5. Confirm form order and default form explicitly; do not infer them from metadata.
6. Confirm security roles in Power Apps.
7. Publish the App separately.

## Rollback

- Form rollback: restore only the backed-up unpublished/published Form definition under a separate authorization.
- View rollback: restore only the backed-up FetchXML/LayoutXML/LayoutJSON.
- Relationship/table rollback: no deletion is part of this plan; use a separate metadata rollback authorization.
- App rollback: remove only the newly added App components and restore the prior form order.
- BPF rollback: do not deactivate or delete automatically; use a separate approval.

## Safety Boundary

All stages remain test-environment-only. Production access, business-data writes, Plugin changes, Seed, BPF data changes, and broad PublishXml are outside this plan.
