# Phase 1C-5R2E-2C3 Solution Dependency Verification

## Result

**Solution Dependency Ready=false** under the strict zero-warning gate. Both required tables are now correctly present in `CRMAIGatewayDemo` as metadata-only Entity components, but `ValidateApp` still reports four warnings and the same two required table components.

The remaining warnings are classified as **ALM dependency warnings**. No further `AddAppComponents` call is recommended.

## Solution Components

Solution:

- Unique name: `CRMAIGatewayDemo`
- Friendly name: CRM AI Gateway Demo
- Managed: No
- Version: `1.0.0.0`

| Logical name | Entity ID / objectid | Solution component ID | Type | Root behavior | Rooted subcomponents |
|---|---|---|---:|---|---:|
| `opportunityproduct` | `8a4283a8-eef3-4915-9e20-055dc136663d` | `bba6e99a-777e-f111-ab0e-002248eb1915` | 1 | `DoNotIncludeSubcomponents` (1) | 0 |
| `sharepointdocument` | `df40ce13-715d-495d-892e-0bbe2cf15acd` | `bca6e99a-777e-f111-ab0e-002248eb1915` | 1 | `DoNotIncludeSubcomponents` (1) | 0 |

Each table has exactly one root Entity component. Neither root includes all subcomponents, and no Solution component is rooted beneath either newly included table component. This is consistent with the manual **Include table metadata** selection and provides no evidence that all table objects or unrelated assets were added.

## Modern App State

The unpublished Modern App still contains no direct table component for either dependency. It also contains no generic `entity` component:

| App component | Count |
|---|---:|
| `opportunityproduct` Entity | 0 |
| `sharepointdocument` Entity | 0 |
| Generic `entity` objectid | 0 |

Navigation remains limited to:

- `opportunity`
- `aigw_actualmanagement`

The two dependency tables do not appear in the Sitemap.

## Dependency Views

All three dependency Views remain included exactly once:

| View | Object ID | Count |
|---|---|---:|
| Opportunity Product Inline Edit View: Bundle Products | `e175dfbf-8eae-4af2-9dd2-68c43c14d40f` | 1 |
| Opportunity Product Inline Edit View | `01010de7-749e-4fe6-8037-aca560a4fcbe` | 1 |
| Document Associated Grid | `0016f9f3-41cc-4276-9d11-04308d15858d` | 1 |

Opportunity, Actual Management, Full Replica, Opportunity target View, and Actual Management target View also remain included exactly once.

## ValidateApp

- ValidationSuccess: true
- Errors: 0
- Warnings: 4
- Unique required components: 2

The only required components are:

- `opportunityproduct`
- `sharepointdocument`

The four warnings originate from Full Replica and the three dependent Views. They continue because the tables are not direct unpublished App components, even though both table metadata roots are now present in the owning Solution.

## Warning Classification

Classification: **ALM dependency warning**.

Evidence:

1. Both referenced system tables exist in the current environment.
2. Both are now explicit metadata-only Entity components of the same unmanaged Solution.
3. Their three required Views are already App components.
4. `ValidateApp` succeeds with no errors and reports no dependency other than these two tables.
5. The App contains no generic or incorrectly mapped Entity component.

This classification is an environment-specific deployment assessment, not a claim that the warnings disappeared. The warnings still matter for ALM/export dependency review. In the current test environment, the referenced system tables already exist and the owning Solution now carries their metadata roots, so the evidence supports a separately authorized controlled publish with an explicit exception for these four known warnings.

Do not call `AddAppComponents` again. Before any export to another environment, validate that the exported Solution includes both Entity roots and run dependency validation against the target environment.

## Protection Verification

- Full Replica unpublished: Active
- Full Replica published runtime: Inactive
- Full Replica: Non-default
- Protected Form hash unchanged: `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`
- Actual Management Form/View: unchanged
- Custom BPF: Draft/Inactive
- Plugin: Enabled 7 / Disabled 0
- Old App: unchanged
- Sales trial: unchanged
- Business writes: 0
- Production requests: 0

## Recommendation

**Recommend entering a separately authorized same-environment Controlled Publish only if its preflight explicitly accepts the four known ALM warnings and verifies that no new warnings or required components appear.** The strict `Warnings=0` gate remains unmet, so this phase itself is not Ready.

## Request Accounting

- GET: 26
- POST: 0
- PATCH: 0
- DELETE: 0
- Publish: 0
- Activation: 0
- Business writes: 0
- Production requests: 0

Local evidence:

`local-artifacts/d365/plugin-registration/phase1c5r2e2c3-solution-dependency-verification.json`
