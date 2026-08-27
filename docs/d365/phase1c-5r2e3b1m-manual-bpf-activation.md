# Phase 1C-5R2E-3B1M Manual BPF Activation Verification

## Result

- Manual Activation Result: **Verified**
- `BPF Technical Activation Ready=true`
- `BPF Demo User Permission Ready=false`
- `BPF Runtime Test Ready=false`

The target BPF is Active, its definition and process order are unchanged, and its backing table was generated successfully with zero rows. The System Administrator validation account has all required backing-table privileges. The ordinary `Basic User` role has none of the five required privileges, so ordinary Demo-user runtime testing remains blocked.

No activation, deactivation, publish, process-order change, role change, process instance, or business-data write was performed by this verification.

## Environment

- Test hostname: `org91f5f65f.crm5.dynamics.com`
- Production requests: 0
- Workflow ID: `7325b274-6b7c-f111-ab0e-70a8a50388b9`
- Workflow: `销售流程 - AI Demo Full Replica`

## Workflow State

| Property | Result |
|---|---|
| State | Active (`1`) |
| Status | Activated (`2`) |
| Primary entity | `opportunity` |
| Process order | `100`, unchanged |
| Stage count | 2 |
| Step count | 4 |
| Definition SHA-256 | `59819cd865fd39c5a838441cad21979e4e1a08387b3bb62eab2285e07c213f08` |
| Definition changed from pre-activation | No |
| Modern App BPF component | Exactly 1, component type `29` |

### Stage And Step Definition

| Order | Stage | Step fields |
|---:|---|---|
| 1 | 授予资格 | `parentaccountid` |
| 2 | 案件关闭 | `aigw_winprobabilityrank`, `statuscode`, `actualclosedate` |

No Stage, Step, field binding, process order, or workflow definition mutation was observed.

## Backing Table Metadata

The table was discovered dynamically by enumerating all `IsBPFEntity=true` entities and correlating Workflow unique name, Display Name, unmanaged state, activation timing, and Metadata identity.

| Property | Value |
|---|---|
| Display Name | `销售流程 - AI Demo Full Replica` |
| Logical Name | `aigw_ai_demo_full_replica` |
| Schema Name | `aigw_ai_demo_full_replica` |
| Entity Set Name | `aigw_ai_demo_full_replicas` |
| Metadata ID | `27dc1d23-5c7f-f111-ab0e-70a8a5007736` |
| Object Type Code | `11730` |
| Primary ID | `businessprocessflowinstanceid` |
| Primary Name | `bpf_name` |
| Managed | No |
| Metadata readable | Yes |

### Solution Membership

The generated Entity component is currently present in:

- Active Solution, unmanaged
- Default Solution, unmanaged

No direct Entity component membership was found in `CRMAIGatewayDemo`. The Workflow itself remains a component of `CRMAIGatewayDemo`. This is recorded as an ALM follow-up and does not invalidate current-environment technical activation, but export/import readiness must be checked before packaging the activated BPF.

## Backing Table Data

- Entity Set query: successful
- Row count: **0**
- Existing process instances: 0
- Related Opportunity records: none
- Delete or cleanup action: none required

The result agrees with the manual evidence that no Opportunity was opened or switched into the new process and no process instance was created.

## Permission Result

### Zhou Wenzhe

- System user ID: `df4b1a2f-cd6d-f111-ab0d-00224818ead9`
- Direct roles:
  - System Administrator
  - Basic User

No permission was changed by this phase.

### System Administrator

The complete 12,915-row role privilege collection was paged to completion. All required backing-table privileges are assigned:

| Privilege | Assigned |
|---|---|
| Read | Yes |
| Create | Yes |
| Write | Yes |
| Append | Yes |
| Append To | Yes |

`Administrator Permission Result=true`

Zhou Wenzhe can technically read and use the BPF because this role is assigned directly. This result applies to the administrator validation identity only.

### Ordinary Demo Role

The complete `Basic User` role privilege collection was read. It does not contain any of the five new backing-table privileges:

| Privilege | Assigned to Basic User |
|---|---|
| Read | No |
| Create | No |
| Write | No |
| Append | No |
| Append To | No |

`Ordinary Demo Role Permission Result=false`

Administrator access is not used to infer ordinary-role readiness. Do not modify `Basic User` automatically. A dedicated Demo role or separately authorized privilege update is required before ordinary Demo-user runtime validation.

## Active Opportunity BPF Matrix

| Process order | Name | Workflow ID | Managed |
|---:|---|---|---|
| 1 | Follow up with Opportunity | `138acd55-4a5b-4fe8-9af7-abbe5b94745a` | Yes |
| 1 | Sales Process | `3e8ebee6-a2bc-4451-9c5f-b146b085413a` | Yes |
| 100 | 销售流程 - AI Demo Full Replica | `7325b274-6b7c-f111-ab0e-70a8a50388b9` | No |

No process order was changed. The target is Active but remains behind both existing order-1 processes. Runtime routing or default selection must not be inferred before a separately authorized process-order decision.

## Protection Verification

| Gate | Result |
|---|---|
| Full Replica | Active, non-default; 5 / 19 / 115 / 106 |
| Native Timeline | 1 |
| Protected Form FormXML hash | `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7` |
| Protected Form FormJSON hash | `94de2fe47db7300420c7fcf73c6c1ff24d830aefea9f4a1a765daf4cd728b8f9` |
| Plugin Enabled / Disabled | 7 / 0 |
| Actual Main Form | 1 / 5 / 41 |
| Location Active | 51 |
| Opportunity business writes | 0 |
| Production requests | 0 |

## Findings

### P0

None.

### P1

1. Ordinary `Basic User` lacks Read, Create, Write, Append, and Append To privileges for the new BPF backing table. Ordinary Demo-user runtime validation is blocked.

### P2

1. The backing Entity is present only in Active and Default Solution component membership; `CRMAIGatewayDemo` ALM membership requires a separate export-readiness review.
2. The target process remains at order `100`, behind two managed processes at order `1`.

## Request Accounting

- GET: 40
- POST: 0
- PATCH: 0
- DELETE: 0
- Publish: 0
- Activation / Deactivation: 0
- Process-order changes: 0
- Security-role changes: 0
- BPF instances created: 0
- Opportunity business writes: 0
- Production requests: 0

## Final Gate

- `BPF Technical Activation Ready=true`
- `BPF Demo User Permission Ready=false`
- `BPF Runtime Test Ready=false`

The next phase must not perform ordinary-user runtime testing. A separately authorized decision is required for a dedicated Demo-role privilege update and process order. An administrator-only, read-only technical browser check may be planned separately, but it was not performed in this phase.
