# Phase 3C External LLM Controlled Canary Evaluation

- Status: **stopped-safety**
- Environment: org91f5f65f.crm5.dynamics.com
- Run: **PHASE3C-R4**
- Provider: openai-compatible / deepseek-v4-pro
- Native JSON mode: **strict-tool** (`/beta` Tool Calling)
- Safe Context: **Safe Context v2**
- External calls: **1/1**
- CRM writeback: **false**
- Production requests: **0**
- Stop reason: **provider_http_400**
- Audit reason: **none**

## Frozen selection

The frozen selection contains 24 records; this run executed only 1 contract canary record(s). Provider input contained Safe Context v2 only; scenario IDs, Golden metadata and raw CRM were excluded.

## Read-only D365 preflight

- GET: 179
- POST/PATCH/DELETE/Publish: 0/0/0/0
- Frozen scope: 200 opportunities, 1800 Timeline records, 1350 Interaction Signals
- State distribution: {"active":100,"won":91,"lost":9}

## Outcome

Execution stopped after 0 completed canaries; no later canaries were attempted.
