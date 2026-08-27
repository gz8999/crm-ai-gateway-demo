# Phase 1C-5R2C Online Test Preflight Checklist

This checklist is for a future operator. It is not an execution record. Current status is No-Go until each item is manually confirmed.

## A. Frozen local Artifact

- [ ] `CrmAiGateway.ActualTotals.Plugin.dll`
- [ ] SHA-256: `a02db984606827396467b7311f3024b586e33f4d3a024e3cb240e39ba91c6b7d`
- [ ] Public key token: `0350f79ae25dc991`
- [ ] Target: `net462`, configuration `Release`
- [ ] CI run: `29157898543`
- [ ] xUnit: `23/23`, failed `0`, skipped `0`
- [ ] Artifact contains exactly six approved files and no SNK/PDB

## B. Git

- [ ] Main SHA is the approved deployment documentation commit or a separately approved build commit
- [ ] Working tree is clean
- [ ] DLL and Artifact are not tracked
- [ ] Workflow remains `workflow_dispatch` only

## C. GitHub

- [ ] Repository is private
- [ ] `ACTUAL_TOTALS_SNK_BASE64` exists; value is never read or printed
- [ ] Successful Windows workflow run is the approved run
- [ ] Artifact was downloaded and independently hashed

## D. Future Dataverse manual checks

- [ ] Connected URL is exactly `https://org91f5f65f.crm5.dynamics.com`
- [ ] Connected organization identity is the expected test organization
- [ ] Production hostname `lcn-crm.crm7.dynamics.com` is not connected
- [ ] Solution is unmanaged `CRMAIGatewayDemo`, publisher prefix `aigw`
- [ ] Table `aigw_actualmanagement` exists
- [ ] Lookup `aigw_opportunityid` and relationship exist with expected cascade rules
- [ ] Monthly Revenue, child annual, and parent annual fields match the manifest
- [ ] Full Replica Form, Business Rule, and BPF statuses are separately reviewed
- [ ] No unexpected existing assembly, Step, or Image conflicts

## E. Go/No-Go

Any unchecked item, identity mismatch, production hostname, hash mismatch, token mismatch, or inability to create Disabled steps is No-Go. Do not upload the DLL or create registration components until a separate authorization is recorded.
