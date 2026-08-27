# Actual Totals Plugin Online Test Deployment Plan

## Status And Environment Gate

This is an execution plan, not an authorization or execution record. No Dataverse request has been made by this phase.

- Allowed test environment: `https://org91f5f65f.crm5.dynamics.com`
- Prohibited production environment: `https://lcn-crm.crm7.dynamics.com`
- Target solution: `CRMAIGatewayDemo`
- Expected assembly token: `0350f79ae25dc991`
- Expected DLL SHA-256: `a02db984606827396467b7311f3024b586e33f4d3a024e3cb240e39ba91c6b7d`

The operator must stop before upload if the connected organization URL is not an exact match for the allowed test URL. Production is always denied.

## Recommended Deployment Method

Use the Microsoft Plugin Registration Tool from a separate, controlled administrator workstation. It provides explicit Assembly, Step, and Image registration and makes the disabled-first sequence visible. The company Windows demonstration computer does not need this tool.

- Plugin Registration Tool: recommended for this one-assembly, seven-step controlled registration. Requires a test-environment account with Plugin Assembly and SDK Message Processing Step privileges, normally System Administrator or an approved equivalent role.
- Power Platform CLI: suitable for solution and package automation, but not preferred here because the current task needs deliberate Step/Image review and no automated environment connection.
- Controlled deployment script: only after a separately reviewed dry-run, explicit test-host denylist gate, and independent deployment authorization. It is not part of this phase.

Never use production credentials, a production connection, or the browser demonstration computer for administration.

## Deployment Sequence

1. Obtain separate deployment authorization and record the approved DLL SHA-256.
2. On the controlled administrator workstation, connect only to the allowed test URL.
3. Verify organization identity, solution name, target table, lookup, currency field, monthly Revenue fields, and parent annual field.
4. Register `CrmAiGateway.ActualTotals.Plugin.dll` as Sandbox / Database.
5. Verify the assembly name, version, token, and the three expected Plugin Types before adding Steps.
6. Register the seven synchronous Steps from the readiness build sheet.
7. Add only the listed PreImage/PostImage aliases and attributes; never use All Attributes.
8. Disable all seven Steps immediately and verify their metadata while disabled.
9. Confirm Update filtering attributes contain only the 12 Revenue fields, lookup, and transaction currency.
10. Enable one stage group at a time: PreValidation, PreOperation, then PostOperation. Validate after each group.
11. Run single-record synthetic verification only after all metadata checks pass.
12. Keep the 100-record seed blocked until single-record Create, Update, Delete, and Reparent tests pass.
13. Form publication remains a separate authorization and is not required to register the Plugin.

## Test Cases

Use one explicitly synthetic Opportunity and synthetic Actual Management values.

1. Create one Actual Management record with one monthly Revenue value; verify child annual and parent annual totals.
2. Fill all 12 Revenue months; verify the two-decimal annual sum.
3. Modify one month; verify child and parent totals update immediately.
4. Leave selected months null; verify they contribute zero.
5. Delete the child; verify parent annual becomes zero.
6. Attempt a second child for the same Opportunity; verify the operation is blocked.
7. Attempt a mismatched transaction currency; verify the operation is blocked.
8. Reparent the child; verify both old and new Opportunities are recalculated.
9. Verify `aigw_yearrevenueactual` changes only when needed.
10. Verify Dataverse automatically updates `aigw_yearrevenueactual_base`; confirm the Plugin does not write it.

Also confirm that deprecated CNY, GP, MP, status, and `_base` fields are not written by the Plugin.

## Rollback

1. Disable all seven new Steps.
2. Confirm no Plugin execution remains active.
3. Delete registered Images.
4. Delete the seven Steps.
5. Delete the Assembly only after confirming no remaining component dependency.
6. Do not delete or change the Actual Management table, Opportunity fields, relationship, view, form, or business records.

## Browser Demonstration

The company Windows computer only needs Edge or Chrome and access to the test D365 organization. The presenter opens the Full Replica Opportunity form, creates or edits a related Actual Management record in the Subgrid, saves, and observes the annual actual amount update. The demonstration computer does not need source code, the DLL, Visual Studio, VS Code, .NET SDK, Mono, Power Platform CLI, or Plugin Registration Tool.
