# Phase 1C-5R2G-D3B Controlled Owner/Team Setup

## R2 Completion

Phase `D3B-R2` completed the approved recovery. The canonical minimum role is unique, the two duplicate roles are gone, and the platform-required Global depth exceptions were explicitly approved and applied. Seven distinct test-only Owner Teams now have the approved ordinary candidate as their only setup member and the canonical role as their setup role.

- Canonical role count: `1`
- Duplicate role count: `0`
- Unique privilege count: `38`
- Approved Global exceptions: `11`
- Owner Teams: `7`
- Memberships: `7`
- Team role assignments: `7`
- Business data delta: `0`
- Production requests: `0`
- B1 Controlled Setup Ready: `true`

The earlier duplicate-role and privilege-depth failures remain documented below as the first-attempt history.

## Result

Status: **BLOCKED**

The approved A1 owner mapping is recorded as `OWNER-DEMO-01` through `OWNER-DEMO-06` mapping to the single ordinary test-user candidate. No Account, Contact, Opportunity, Coverage, Actual, Timeline, Signal, or other business record was read or written.

The B1 setup stopped before Team creation because the security-role create/readback sequence produced three unmanaged roles with the approved name in the target test Business Unit. Dataverse then rejected the privilege-add request because shared activity privileges appeared more than once in the submitted privilege list.

## Environment Boundary

- Host: `org91f5f65f.crm5.dynamics.com`
- Production host requests: 0
- Publish requests: 0
- PATCH requests: 0
- DELETE requests: 0
- Business data writes: 0
- External LLM calls: 0

## Completed

- Test hostname allowlist check passed.
- Ordinary interactive non-admin candidate remained unique and valid.
- Target Business Unit remained unique.
- Seven approved Team names had no pre-existing conflict before the controlled run.
- A1 mapping was frozen locally without exposing the candidate identity in repository artifacts.
- Metadata confirmed the platform relationships `teammembership_association` and `teamroles_association`.
- Delayed GET-only readback was performed after every unknown/failed result.

## Not Completed

- Minimum business privileges were not added to any new role.
- No Owner Team was created.
- The ordinary candidate was not added to a Team.
- No Team received a role.
- Ordinary-user effective permission validation could not pass.

## Blocking Condition

Three unmanaged roles with the approved display name now exist in the target Business Unit. Each currently contains only the platform-created base privilege set. Continuing would require selecting one canonical role and deleting the two duplicate roles, then submitting a de-duplicated privilege list keyed by `PrivilegeId` and resuming Team setup.

The current authorization explicitly excludes role deletion and existing-role modification. Therefore no remediation was attempted.

## Private Evidence

Exact user, Business Unit, role, and readback identifiers are stored only in ignored local artifacts:

- `local-artifacts/d365/d365-ai-demo-200-d3b-readback-private.json`

No identifier manifest was promoted as final because the B1 setup is incomplete.

## Gates

- A1 Owner Mapping Recorded: true
- Minimum Role Ready: false
- Seven Owner Teams Ready: false
- Team Membership Ready: false
- Team Role Assignment Ready: false
- Ordinary User Permission Ready: false
- Existing Business Team Modified: false
- Existing Security Role Modified: false
- Business Import Started: false
- Production Isolation Ready: true
- P0 Count: 0
- P1 Count: 1
- B1 Controlled Setup Ready: false

## Required Separate Authorization

Before resuming, obtain explicit authorization to:

1. keep one identified role as the canonical `CRM AI Demo Department Minimal` role;
2. delete the other two newly created duplicate roles;
3. add the approved minimum privileges using a list de-duplicated by `PrivilegeId`;
4. create the seven approved Owner Teams, add the ordinary candidate, and assign only the canonical role.

No business import, Pilot workbook, projection generation, Win/Lose, cleanup, full import, or production operation is required for this remediation.
