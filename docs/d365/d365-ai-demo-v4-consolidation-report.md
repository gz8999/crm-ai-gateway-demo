# Phase 1C-5R2G-C1 v4 Workbook Consolidation

## Authority

- v2: **Rejected By User**. Historical file retained with SHA-256 `15784d514287cc8c590325845d94cf79600af7daf324f6ad306b1744145cd6ba`.
- v3: **Superseded By v4**. No v3 binary was supplied to this repository; status is retained as project history.
- v4: **Authoritative Workbook**.
- v4 path: `artifacts/d365/CRM_AI_Gateway_D365_Chinese_Demo_Data_v4.xlsx`
- v4 size: **731565 bytes**.
- v4 SHA-256: `f08a94a3caa62950dbaa96e2767e39afe6c79072296394db9d8736a3b2f683fd`.
- Original v4 was copied byte-for-byte and was not resaved or normalized.

## Offline validation

| Entity | Rows |
| --- | ---: |
| Account | 30 |
| Contact | 60 |
| Opportunity | 150 |
| Actual Management | 100 |
| Service Coverage | 210 |
| Timeline | 1400 |
| Interaction Signal | 1050 |
| Total business rows | 3000 |

The complete offline recheck passed the row, parent-token, department, booking department, opportunity detail, name uniqueness, narrative, Actual uniqueness, Coverage window, Timeline source, and Signal 75% rules. Timeline exact duplicate count is 0 and normalized uniqueness is 98.93%.

Department distributions remain:

- Sales Department: Dept1/Dept2/Dept3 = **108/30/12**.
- Booking Department 01/26/02/09 = **63/75/6/6**.
- Opportunity Detail 02/03/07/91/08 = **45/42/21/30/12**.
- Forbidden `06: LCMS` use = **0**.
- Opportunity Type is the four approved Chinese display labels.
- Case Stage is the five approved Chinese display labels.

## Metadata preflight outcome

The test-environment GET-only preflight found five P1 blocker groups:

1. Workbook `Opportunity.primarycontactid` is not a deployed logical name. The deployed Contact 1 lookup is `parentcontactid`.
2. `OWNER-DEMO-01` through `OWNER-DEMO-06` have no approved one-to-one mapping to active test-environment Owner records.
3. `DEPT-01`, `DEPT-03`, and `DEPT-04` are supplied for the `aigw_interactionsignal.aigw_salesdepartment` Team lookup, but no approved token-to-Team mapping exists.
4. Current Choice metadata conflicts with workbook labels for Opportunity Detail value 91, Goods value 21, Goods value 91, and Global Initiative value 91. The Goods value 21 conflict is semantic, not cosmetic.
5. No three-Account subset can cover all five mandatory Pilot scenarios. The minimum conforming account count is four.

No workbook field, token, or Choice value was changed to hide these findings.

## State

- V4 Workbook Integrity Ready=`true`
- V4 Authoritative Workbook Ready=`true`
- V4 Workbook Technical Validation Ready=`true`
- V4 Workbook Accepted For Metadata Preflight=`true`
- V4 Workbook User Acceptance Ready=`true`
- Metadata Schema Preflight Ready=`false`
- Choice Metadata Preflight Ready=`false`
- Lookup Resolution Ready=`false`
- Pilot Dataset Defined=`false`
- Pilot Workbook Generated=`false`
- Demo Data Generation Completed=`true` (offline data only)
- Pilot Import Ready=`false`
- Pilot Import Authorized=`false`
- Full Import Ready=`false`

No Pilot workbook was generated because doing so would present a known non-importable package as executable.
