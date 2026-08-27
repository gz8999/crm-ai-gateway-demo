# Phase 1C-6D-R1 Product Polish

## Scope And Frozen Boundaries

- The seven-page navigation, Phase 6D provider behavior, Safe Context shape, Golden evaluation rules, deterministic fixtures, and CRM boundaries remain unchanged.
- Runtime defaults remain `AI_PROVIDER=demo`, `ALLOW_EXTERNAL_AI=false`, `FEATURE_MODEL_COMPARISON=false`, and `FEATURE_DEEP_ANALYSIS=false`.
- No external model call, CRM writeback, D365/Dataverse request, or fixture mutation was performed.

## Enterprise Governance UI

`Audit & Safety` now presents the external-model capability as a governed progression: `未启用` -> `已配置` -> `安全验证通过` -> `可执行对比`. The progression is derived from existing status fields and does not change provider behavior. The current policy is `默认使用 Demo 模型`; activation requires `管理员配置 + 用户主动触发`.

The `安全模型对比` area explains that the same sanitized CRM Context is used for comparison and explicitly states that comparison does not modify CRM, send raw customer data, or replace business judgment. It also displays the comparison basis:

- client-side Safe Context hash;
- current sanitized opportunity scope;
- `CRM Safe Context` as the data source;
- raw CRM transmission set to `否`.

No API key, service URL value, authorization header, raw payload, prompt, or provider response body is rendered.

## Business Score Labels

The product UI maps engineering metrics to business-facing Chinese labels, including `事实一致性检查`, `证据覆盖检查`, `优先级一致性`, `置信等级一致性`, and `输出稳定性`. Evaluation logic and score values are unchanged.

## Independent P2 Correction

The D365 Core Schema CLI exports `main` while preserving the existing direct-entry guard. Importing the module does not execute the CLI, perform network access, or change business behavior. A regression test verifies the callable export and the existing Dataverse import-safety suite passes.

## Visual Verification

- 1440px: no page-level horizontal overflow; external capability state and comparison governance content render without overlap.
- 760px: no page-level horizontal overflow; capability progression and governance content reflow into the document flow.
- Browser console warning/error count: `0`.
- Screenshots (ignored local artifacts):
  - `local-artifacts/gateway/phase1c-6d-r1/audit-safety-1440-top.png`
  - `local-artifacts/gateway/phase1c-6d-r1/model-comparison-1440.png`
  - `local-artifacts/gateway/phase1c-6d-r1/model-comparison-760.png`

## Verification

- `npm test`: `241/241` passed.
- `npm run build`: passed.
- Production bundle isolation: passed across 2 assets.
- `git diff --check`: passed.
- Sensitive scan: passed; no credential value, API key, authorization header, service endpoint value, raw CRM payload, or external-model enablement was introduced.
- External LLM calls: `0`.
- CRM writeback: `0`.
- D365 requests: `0`.

## Findings And Gates

- P0: `0`
- P1: `0`
- P2: `0` after the independent CLI export correction.
- External Provider logic unchanged: `true`
- Safe Context unchanged: `true`
- Golden evaluation unchanged: `true`
- Demo default preserved: `true`
- External comparison default disabled: `true`
- CRM writeback disabled: `true`
- Production/D365 isolation: `true`
- Phase 1C-6D-R1 Ready: `true`

Phase 1C-6F was not started.
