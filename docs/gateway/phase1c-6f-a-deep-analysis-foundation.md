# Phase 1C-6F-A Deep Analysis Foundation

## 1. Module Architecture

Phase 6F-A adds a feature-gated eighth workspace, `深度分析`, without changing the responsibilities of the frozen seven workspaces. The production default remains disabled through `VITE_FEATURE_DEEP_ANALYSIS`; controlled local validation enables both the client and server flags while keeping `AI_PROVIDER=demo`, `ALLOW_EXTERNAL_AI=false`, and model comparison disabled.

The server implementation is isolated under `server/ai/deepAnalysis/`:

- `templateRegistry.mjs`: one registry for the nine governed templates.
- `deepAnalysisContextBuilder.mjs`: resolves the existing synthetic Decision scope and builds a Safe Context-only provider input.
- `deepAnalysisSafety.mjs`: strict top-level and nested key checks plus audit allowlisting.
- `deepAnalysisDemoProvider.mjs`: deterministic, cancellable Demo analysis.
- `deepAnalysisSchema.mjs`: `deep-analysis-output-v1` contract validation.
- `deepAnalysisAudit.mjs`: in-memory metadata-only audit.
- `deepAnalysisService.mjs`: feature, role, confirmation, provider, run, cancel, result, and reset gates.

The React implementation is isolated under `src/deepAnalysis/` and does not access the Legacy raw CRM store. Results live only in the current JavaScript memory session; browser refresh returns to an empty state and no browser storage is used.

## 2. Template Registry

| Code | Template | Runtime state in 6F-A | Reason / policy |
|---|---|---|---|
| DA-01 | 客户全景与历史合作分析 | 依赖未接入 | Customer history safe aggregate is unavailable |
| DA-02 | 当前案件赢单与风险分析 | 可执行 | Deterministic Demo only |
| DA-03 | 预算、实绩与盈利分析 | 受限 | Bands and categories only; no exact amounts |
| DA-04 | 客户增长与交叉销售分析 | 依赖未接入 | Customer history and internal capability unavailable |
| DA-05 | 客户行业与外部形势分析 | 外部情报未启用 | No external facts or citations are generated |
| DA-06 | 物流方案与路线适配分析 | 受限 | Route consistency only; no raw Location/POL/POD |
| DA-07 | 会前准备与谈判策略 | 可执行 | Meeting-derived signals only; no Timeline text |
| DA-08 | 管理层综合深度报告 | 依赖未接入 | History, external, and internal sources unavailable |
| DA-09 | 自定义分析 | 禁用 | No free Prompt input in this phase |

Each registry entry includes code, title, description, role, required and optional data, unavailable dependencies, provider policy, estimated duration, enabled state, blocked reason, output sections, and version.

## 3. Explicit Confirmation Flow

Selecting an executable template performs only `POST /api/deep-analysis/preview`. It returns safe tokens, actual input categories, missing dependencies, provider policy, safety flags, and a canonical Safe Context hash. It does not run the provider and creates no audit entry.

The confirmation page separates:

- data used: current Opportunity Safe Context, Safe Account Aggregate, bands/categories, and template-specific derived signals;
- data never sent: identity, contact details, GUIDs, addresses, exact amounts, Timeline/contract/quotation text, raw Location/POL/POD, Scenario metadata, evaluation metadata, and raw fixture;
- current limitations: customer history, external intelligence, and internal capability are unavailable.

Only `开始 Demo 深度分析` sends `confirmed=true`. Page loading, navigation, template selection, and preview do not run analysis.

## 4. Provider Input And Safety

The provider receives only template code/version, existing `SafeDecisionContext`, `SafeAccountAggregate`, template-specific safe derived signals, schema version, and a generic instruction. Scenario ID is used only to resolve Gateway scope and is excluded from provider input. The payload contains no Golden evaluation metadata, raw CRM object, identity, exact amount, Timeline text, raw route master value, credential, or external provider configuration.

Even when the product amount display mode is exact, the provider continues to receive bands and categories. Both preview and result state `exactAmountSentToModel=false` and `rawDataSent=false`.

Server-side gates require:

- `FEATURE_DEEP_ANALYSIS=true`;
- role `demo-full-access`;
- an enabled template;
- explicit confirmation;
- payload safety validation;
- `AI_PROVIDER=demo`;
- `ALLOW_EXTERNAL_AI=false`.

## 5. Output Contract

`deep-analysis-output-v1` contains management summary, current CRM facts, empty customer-history/external/internal fact arrays, clearly marked AI inferences, risks, opportunities, qualitative scenarios, draft recommendations, confidence, limitations, sources, provider, and safety status.

- CRM facts are source-typed `crm_current` and reference Safe Context keys.
- AI inference is labeled `AI 推断，不是 CRM 事实`.
- Customer history facts remain empty with the UI message `客户历史尚未接入`.
- External facts remain empty with `外部行业与市场情报尚未启用`.
- Internal capability facts remain empty with `公司内部能力知识尚未接入`.
- Scenarios use only qualitative directions and never precise revenue, probability, or dates.
- Recommendations use `待人工指定`, `仅草案`, and `模型建议，非 CRM 正式期限`.
- No task, activity, appointment, email, or CRM writeback is created.

## 6. API And Runtime State

- `GET /api/deep-analysis/templates`
- `POST /api/deep-analysis/preview`
- `POST /api/deep-analysis/run`
- `POST /api/deep-analysis/:requestId/cancel`
- `DELETE /api/deep-analysis/results`
- `GET /api/deep-analysis/audit`

Run state covers waiting, Safe Context construction, safety check, Demo analysis, schema validation, safety validation, completion, cancellation, blocking, and failure. It never displays or performs an external-model call. Cancel and Reset operate only on process memory.

## 7. Audit And Permission Boundary

The current role is shown as `演示全权限 · 仅限 synthetic 数据`. Server APIs independently enforce `demo-full-access`; the UI alone is not the permission gate. Formal Sales Owner, Department Manager, Company Management, and Administrator roles remain future interface requirements, not fabricated RBAC.

Audit records only request/template IDs, safe tokens, role, department scope status, Safe Context hash, category names, missing dependencies, provider, latency, schema/safety status, result status/reason, and timestamp. It does not record provider credentials, endpoint, authorization, prompt, Safe Context payload, output body, identity, exact amount, or Timeline text.

## 8. Browser Verification

Controlled local validation used `FEATURE_DEEP_ANALYSIS=true`, `VITE_FEATURE_DEEP_ANALYSIS=true`, `AI_PROVIDER=demo`, and `ALLOW_EXTERNAL_AI=false`.

- 1440px: template, confirmation, DA-02, and DA-07 pages render without page-level horizontal overflow.
- 1280px: template page renders without page-level horizontal overflow.
- 760px: one-column Deep Analysis layout, no page-level horizontal overflow.
- Console warnings/errors: `0`.
- DA-02: current CRM facts, missing-source states, draft actions, qualitative scenarios, and safety state verified.
- DA-07: meeting window, stakeholder coverage, open-question count, and decision readiness verified; Timeline raw text absent.

Ignored screenshots:

- `local-artifacts/gateway/phase1c-6f-a/deep-analysis-templates-1440.png`
- `local-artifacts/gateway/phase1c-6f-a/deep-analysis-confirmation-1440.png`
- `local-artifacts/gateway/phase1c-6f-a/deep-analysis-da02-result-1440.png`
- `local-artifacts/gateway/phase1c-6f-a/deep-analysis-da07-result-1440.png`
- `local-artifacts/gateway/phase1c-6f-a/deep-analysis-templates-1280.png`
- `local-artifacts/gateway/phase1c-6f-a/deep-analysis-templates-760.png`

## 9. Verification

- `npm test`: 250/250 passed.
- Default `npm run build`: passed; production Deep Analysis flag remains false.
- Controlled feature build: passed.
- Production bundle isolation: passed in default and controlled builds.
- `git diff --check`: passed.
- Sensitive scan: passed.
- External LLM calls: 0.
- CRM writeback: 0.
- D365/Dataverse requests: 0.

## 10. Findings And Gates

- P0: 0
- P1: 0
- P2: 0
- Deep Analysis Template Registry Ready: true
- Deep Analysis Feature Gate Ready: true
- Deep Analysis Navigation Ready: true
- Explicit Confirmation Ready: true
- Safe Data Scope Preview Ready: true
- Deep Analysis Demo Provider Ready: true
- Deep Analysis Output Contract Ready: true
- Deep Analysis Safety Guard Ready: true
- Missing Dependency States Ready: true
- Action Source Attribution Ready: true
- Deep Analysis Audit Metadata Ready: true
- Exact Amount Model Exposure: 0
- Timeline Raw Text Model Exposure: 0
- Customer Identity Model Exposure: 0
- Golden Metadata Runtime Exposure: 0
- External LLM Calls: 0
- CRM Writeback: 0
- D365 Dataverse Requests: 0
- Responsive 1440/1280/760 Ready: true
- Phase 1C-6F-A Ready: true

## 11. Deferred Dependencies

Customer history APIs, Timeline data, external intelligence, internal knowledge, formal department/RBAC, External Live Smoke, real external providers, Demo Data Track, and Phase 6F-B remain explicitly deferred. No subsequent phase was started.
