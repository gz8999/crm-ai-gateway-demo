# Phase 1C-5R2E-3B2A-R2V Opportunity Permission Correction Final Verification

## Result

- `Non-admin Demo Test User Ready=true`
- `BPF Demo User Permission Ready=true`
- `App Access Ready=true`
- `Full Replica Access Ready=true`
- `BPF Process Order Change Ready=true`
- `BPF Runtime Test Ready=false`

The interactive user, dedicated role, App sharing, BPF backing-table permissions, and Full Replica form access remain valid. The final Opportunity correction is now present: two independent read paths agree that Read, Write, Append, and Append To are assigned at Organization depth, while Create, Delete, Assign, and Share remain unassigned. No role, App, process order, BPF instance, Opportunity, or other Dataverse data was changed.

## Environment

- Test hostname: `org91f5f65f.crm5.dynamics.com`
- Production requests: 0
- Target App: `CRM AI Gateway Demo - Modern`
- Target BPF: `销售流程 - AI Demo Full Replica`
- Backing table: `aigw_ai_demo_full_replica`

## Test User

| Property | Result |
|---|---|
| Display name | CRM AI Demo User |
| User principal name | `crm-ai-demo-user@sgtpepperb.onmicrosoft.com` |
| System user ID | `85f6e9a0-ef7f-f111-ab0f-000d3a857307` |
| Enabled | Yes |
| Access mode | Normal interactive (`0`) |
| Application User | No |
| Support / delegated identity | No |
| Dataverse licensed | Yes |
| System Administrator | No |
| System Customizer | No |
| Environment Maker | No |
| Team-inherited roles | None |

### Direct Roles

1. `Basic User` (`eb481a2f-cd6d-f111-ab0d-00224818ead9`)
2. `CRM AI Demo BPF User` (`63399c4d-f17f-f111-ab0e-000d3a82d194`)

The role assignments are direct and both roles belong to the user's Business Unit. The user-supplied manual runtime evidence confirms that this identity can sign in interactively, open the Modern App, and display the Opportunity list without writing data.

## Dedicated Role

The unmanaged `CRM AI Demo BPF User` role exists exactly once and is directly assigned to the target user.

### Backing Table Privileges

| Privilege | Depth | Result |
|---|---:|---|
| Read | Organization | Pass |
| Create | Organization | Pass |
| Write | Organization | Pass |
| Append | Organization | Pass |
| Append To | Organization | Pass |
| Delete | None | Pass |
| Assign | None / not exposed for this table | Pass |
| Share | None / not exposed for this table | Pass |

The required five privileges are supplied by the dedicated role rather than inferred from an administrator account.

### Additional Role Privileges

The dedicated role contains a broad platform baseline in addition to the BPF permissions. Material extra data privileges include:

- Account: Read at Organization depth; Create, Write, Delete, Assign, Share, Append, and Append To at User depth.
- Location: Read, Create, Write, Append, and Append To at Organization depth; no Delete.
- Actual Management: Read at Organization depth.
- Opportunity: Read, Write, Append, and Append To at Organization depth; no Create, Delete, Assign, or Share.
- Workflow and App Module: Read privileges are present.
- Standard platform privileges for metadata, user settings, timeline, import, SharePoint integration, and other first-party capabilities are also present.

No Delete, Assign, or Share permission is assigned for `aigw_ai_demo_full_replica`. The broader non-BPF baseline was not modified and should receive a separate least-privilege review before production reuse.

## Effective Business Permissions

Effective permissions were calculated from the complete privilege collections of both direct roles. There are no Team roles to add.

| Resource | Required | Effective result |
|---|---|---|
| Opportunity | Read | Pass, Organization depth |
| Opportunity | Write | Pass, Organization depth |
| Opportunity | Append | Pass, Organization depth |
| Opportunity | Append To | Pass, Organization depth |
| Opportunity | Create | Pass, not assigned |
| Opportunity | Delete | Pass, not assigned |
| Opportunity | Assign | Pass, not assigned |
| Opportunity | Share | Pass, not assigned |
| Account | Read | Pass, Organization depth |
| Actual Management | Read | Pass, Organization depth |
| Location | Read | Pass, Organization depth |
| BPF definition | Read / use definition | Pass, `prvReadWorkflow` assigned |
| Model-driven App | Read | Pass, `prvReadAppModule` assigned |

The required Opportunity permission contract is complete and contains none of the four prohibited rights.

### Correction Read-Back

The final verification read the role through two independent paths:

1. `roleprivileges_association` returned exactly `prvReadOpportunity`, `prvWriteOpportunity`, `prvAppendOpportunity`, and `prvAppendToOpportunity` among the eight Opportunity rights checked.
2. `RetrieveRolePrivilegesRole` returned `Global` for the same four rights and no depth for Create, Delete, Assign, or Share.

The two paths agree, so no delayed second read was required. This phase did not modify the role.

## App And Form Access

The Modern App is Active and Unmanaged. Its role associations include both `Basic User` and `CRM AI Demo BPF User`. The target BPF is included exactly once as `componenttype=29` and points to workflow `7325b274-6b7c-f111-ab0e-70a8a50388b9`.

The App still exposes the expected Opportunity and Actual Management experience. The user's manual runtime evidence confirms successful App and Opportunity-list access.

The supported `RetrieveFilteredForms` function was executed for CRM AI Demo User. It returned five Opportunity Main Forms with Full Replica first, including:

1. Full Replica `97a1555b-0903-408a-ac63-d63aed65b14a`
2. Protected Form `8db60b46-b976-f111-ab0e-00224817cb31`
3. Three other available Opportunity Main Forms

This proves the target user is not excluded by the Full Replica security-role condition. No form was opened or saved by this server-side verification.

## BPF State

| Property | Result |
|---|---|
| State / status | Active / Activated (`1` / `2`) |
| Primary entity | `opportunity` |
| Process order | 100, unchanged |
| Stages / steps | 2 / 4, unchanged |
| Definition SHA-256 | `59819cd865fd39c5a838441cad21979e4e1a08387b3bb62eab2285e07c213f08` |
| Backing Entity Set | `aigw_ai_demo_full_replicas` |
| Backing rows | 0 |
| Modern App BPF components | 1 |

No BPF instance exists and no process-order operation was executed.

## Protection Verification

| Gate | Result |
|---|---|
| Full Replica | Active, non-default; 5 / 19 / 115 / 106 |
| Native Timeline / old Timeline | 1 / 0 |
| Protected Form FormXML hash | `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7` |
| Protected Form FormJSON hash | `94de2fe47db7300420c7fcf73c6c1ff24d830aefea9f4a1a765daf4cd728b8f9` |
| Plugin Assembly / Types / Steps | 1 / 3 / 7 |
| Plugin Enabled / Disabled | 7 / 0 |
| Actual Main Form | 1 / 5 / 41 |
| Location Active | 51 |
| Opportunity business writes | 0 |
| BPF instance writes | 0 |
| Production requests | 0 |

## Findings

### P0

None.

### P1

None.

### P2

1. The dedicated role contains a broader first-party baseline than the five BPF backing-table privileges; review least privilege separately before production reuse.
2. The target process remains at order 100 behind the existing order-1 processes.
3. Ordinary-user Opportunity/BPF runtime testing has not been performed and remains explicitly blocked.

## Request Accounting

- GET: 22
- POST: 0
- PATCH: 0
- DELETE: 0
- Publish: 0
- Activation / Deactivation: 0
- Process-order changes: 0
- Security-role writes: 0
- User-role assignments: 0
- BPF instance writes: 0
- Opportunity business writes: 0
- Production requests: 0

All 22 requests completed as read-only GET operations. Both permission paths agreed on the first read, so no delayed repeat was used.

## Final Gate

- `Non-admin Demo Test User Ready=true`
- `BPF Demo User Permission Ready=true`
- `App Access Ready=true`
- `Full Replica Access Ready=true`
- `BPF Process Order Change Ready=true`
- `BPF Runtime Test Ready=false`

The permission prerequisite for a separately authorized Process Order phase is complete. This verification does not authorize or perform the order change, and `BPF Runtime Test Ready` remains false until that later phase succeeds.
