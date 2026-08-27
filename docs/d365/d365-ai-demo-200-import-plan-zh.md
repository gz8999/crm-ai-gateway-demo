# Demo200 Future Import Plan

## Status

- Authoritative workbook: Demo200 v1
- Import Projection Ready: false
- Import Projection Workbook Generated: false
- Pilot Import Ready/Authorized: false/false

## Fixed order

1. Account
2. Contact
3. Opportunity
4. ServiceCoverage
5. ActualManagement
6. Timeline
7. InteractionSignal

Won/Lost records must use official Win/Lose actions. Direct PATCH of `statecode`, `statuscode`, or `actualclosedate` is prohibited. Timeline scope is limited to phonecall, appointment, task, and annotation. No Email, attachment, BPF instance, real recipient, payload, or executable import script is generated in D1.

## Current blockers

1. Seven approved department Team mappings are not available. Complete the separate Team setup and mapping approval gate before projection or import.
2. Ten POL/POD source references do not have a proven active-master match. They require a separately approved reference mapping or master-data decision; D1 does not guess or consolidate them.

Owner candidates are available only as anonymized strategies and still require explicit approval. Until these gates are resolved, no Import Projection workbook, Pilot workbook, payload, or executable import script may be produced.
