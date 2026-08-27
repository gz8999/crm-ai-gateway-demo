# Phase 1C-6E v6 External Model UI Reservations

Date: 2026-07-16

## Scope

This change applies the current-stage UI requirements from `CRM_AI_Gateway_UI_Design_Spec_Codex_v6`. It reserves the governed product path for future external model comparison and deep analysis without enabling either capability.

The following runtime boundaries remain fixed:

- `AI_PROVIDER=demo`
- `ALLOW_EXTERNAL_AI=false`
- External LLM calls: 0
- CRM writeback: 0
- D365/Dataverse requests: 0
- Seven formal navigation modules only
- No customer history, external intelligence, department dimension, or Timeline source text fabricated

## Implemented

### Global Status

The single-line safety status now renders a truthful external model state. In the default environment it displays `外部模型：未启用`. The state model defines the complete v6 vocabulary for disabled, incomplete, ready, confirmation, context building, provider call, schema/safety/citation validation, completed, fallback, blocked, and failed states. Only states supported by current runtime evidence are rendered.

### Feature Flags

| Flag | Value | Meaning |
| --- | --- | --- |
| `externalModelStatus` | `true` | Non-sensitive Provider status is visible |
| `modelComparison` | `false` | Comparison execution is unavailable |
| `deepAnalysis` | `false` | The eighth module and analysis execution are unavailable |

No global enable switch was added.

### Judgment And Safety Rail

The compact rail now includes Provider, model, external call status, Safe Context, amount display, and intelligence mode. Its expanded state adds:

- Fallback
- Raw data sent
- Exact amount sent to model
- Timeline source text sent to model
- Schema Validation
- Safety Validation
- Citation Validation
- Latency
- access scope and masked opportunity token

Unknown values display `当前未执行` or `当前审计源未提供`.

### Business Page Reservations

- AI Cockpit shows external model availability, last-analysis evidence status, and automatic-call state. It never triggers analysis.
- Opportunity 360 exposes disabled `DA-02` placement, last-state explanatory copy, external-fact empty state, and a citation/source drawer with no invented sources.
- Meeting Copilot exposes disabled `DA-07` placement and retains the explicit statement that Timeline source text is not read or displayed.
- The eighth `深度分析` navigation item remains absent because customer-history aggregation, permissions, and confirmation orchestration are not implemented.

All `进行深度分析` buttons are disabled through the product feature flag.

### Model And Provider Governance

The Provider status endpoint now returns non-sensitive configuration metadata only:

- Provider requested/used
- configuration booleans for Base URL, API key, and model
- approved model name when configured
- timeout
- response-format compatibility retry policy
- maximum response token limit
- output schema version
- last connection-check state

It never returns Base URL values, API keys, authorization headers, prompts, payloads, or credentials.

Audit & Safety now provides a formal `模型与 Provider` section and a disabled `模型对比` reservation. Four comparison selectors are visible but disabled. There is no action button and no automatic request on load, navigation, or filter change.

The audit table adds latency and citation-validation columns. Missing audit evidence remains `未记录`; the client fingerprint remains explicitly labeled `客户端上下文指纹（非服务端审计凭证）`.

### Shared States

The product layer now defines consistent loading, empty, error, blocked, and fallback presentation states. Blocked and fallback states provide text explanations and do not expose request bodies or provider errors.

## Security Evidence

- Formal `App` imports only read-only Decision, Provider status, and allowlisted Audit APIs.
- No external provider endpoint was called during implementation or browser validation.
- No API key, Base URL value, raw Safe Context, prompt, response body, customer identity, exact amount, Timeline source text, Golden metadata, or absolute local path is included in committed runtime changes.
- Production bundle isolation still excludes the DEV-only AI Lab.
- The department selector remains a blocked CRM-field placeholder; no synthetic department mapping was created.

## Browser Verification

Seven formal pages were checked at 1440px, 1280px, and 760px.

- Page-level horizontal overflow: 0 across all 21 checks.
- Console warning/error count: 0.
- Global external state: `外部模型：未启用`.
- Opportunity 360: `DA-02`, disabled.
- Meeting Copilot: `DA-07`, disabled.
- Model Comparison selectors: 4/4 disabled.
- Visible credential/Base URL values: 0.

Ignored screenshot evidence:

- `local-artifacts/gateway/phase1c-6e-v6/01-cockpit-1440.png`
- `local-artifacts/gateway/phase1c-6e-v6/02-opportunity-360-1440.png`
- `local-artifacts/gateway/phase1c-6e-v6/03-meeting-1440.png`
- `local-artifacts/gateway/phase1c-6e-v6/04-audit-1440.png`
- `local-artifacts/gateway/phase1c-6e-v6/05-audit-760.png`

## Verification

- `npm test`: 217/217 passed.
- `npm run build`: passed.
- Production bundle isolation: passed across 2 assets.
- `git diff --check`: passed.
- Sensitive scan: passed.

## Issues And Deferred Capabilities

- P0: 0
- P1: 0
- P2: 4 expected deferred integrations
  - CRM-backed department dimension
  - customer history safe aggregate
  - approved external intelligence with citations
  - active Model Comparison and Deep Analysis workflows

These are explicit future-phase items, not hidden failures. Phase 6D execution and Phase 6F Deep Analysis remain unstarted.

## Gates

- Evidence First Layout Ready=true
- Fluent Enterprise Visual Ready=true
- Chinese Default Locale Ready=true
- External Model UI Reservation Ready=true
- External Provider Configuration Status Ready=true
- External Model Global Status Ready=true
- External Model Comparison Placeholder Ready=true
- Deep Analysis External Entry Reserved=true
- External Analysis State Model Ready=true
- Schema Validation UI Ready=true
- Safety Validation UI Ready=true
- Citation Validation UI Ready=true
- External Model Explicit Trigger Enabled=false
- Deep Analysis Module Enabled=false
- External Call Auto Trigger=0
- External Provider Direct Browser Call=0
- API Key Browser Exposure=0
- Exact Amount Sent To Model=false
- Timeline Raw Text Sent To Model=false
- CRM Writeback Disabled=true
- External LLM Default Disabled=true
- Raw CRM Data Exposure=0
- Credential Exposure=0
- Responsive 1440 Ready=true
- Responsive 1280 Ready=true
- Responsive 760 Ready=true
- P0/P1=0
