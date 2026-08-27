# Demo200 Metadata preflight

## Environment

- Host: `org91f5f65f.crm5.dynamics.com`
- Metadata/Reference reads only; Business CRM reads and writes are zero.

## Results

- Unknown logical names: 0
- Unknown Choice values: 0
- Choice semantic conflicts: 0
- CNY resolved: true
- Location values resolved: true (17 distinct)
- POL/POD values resolved: false (11 resolved, 10 blocked; no guessed mapping)
- Owner candidate strategies ready: true; approved: false
- Existing department Team candidates ready: false; Team setup required: true

## P1 blockers

1. Seven independently approved department Team mappings are not available. No Team was created and no existing Team was auto-approved.
2. Ten workbook POL/POD references have no exact or safely normalized match in the active master: `NRT: Tokyo Narita`, `PEK: Beijing Capital`, `AMS: Amsterdam`, `SZX: Shenzhen Baoan`, `SIN: Singapore`, `CAN: Guangzhou Baiyun`, `PVG: Shanghai Pudong`, `LAX: Los Angeles`, `0404: CNTNJ`, and `DXB: Dubai`.

Owner mapping remains a separate approval gate: two anonymized implementation-principal candidates were found, but neither strategy was approved in D1.

## Requests

- metadataGET: 104
- choiceMetadataGET: 43
- relationshipMetadataGET: 15
- referenceMasterGET: 3
- systemUserGET: 2
- teamGET: 1
- securityMetadataGET: 46
- businessCRMGET: 0
- POST: 0
- PATCH: 0
- DELETE: 0
- Publish: 0
- productionRequests: 0
- externalLLMCalls: 0

## Gate

Import Projection Ready=`false`. P0/P1/P2=`0/2/2`. The projection and Pilot workbooks are not generated while either P1 remains.
