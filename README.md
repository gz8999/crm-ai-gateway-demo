# Sales AI Management Cockpit

## D365 demo data status

The authoritative offline dataset is `CRM_AI_Gateway_D365_Chinese_Demo_Data_v4.xlsx`. Its offline validation is complete, but the Phase 1C-5R2G-C1 GET-only Metadata preflight found unresolved field, Choice, Owner/Team mapping, and three-Account Pilot-selection gates. `Pilot Import Ready=false`; no Pilot or full import is authorized.

Lightweight management demo showing how an AI Gateway can safely support Dynamics 365 Sales Trial or an existing company CRM.

The default page opens as an Executive Cockpit for department and company leaders, not as a technical JSON console:

- KPI cards for won revenue, open pipeline, weighted forecast, forecast achievement, high-risk pipeline, overdue opportunities, and data quality score.
- Pipeline Health by L1-L5.
- Risk Heatmap by stage and risk level.
- Top Risk Opportunities.
- Owner Action Board.
- Customer Portfolio.
- Chinese AI Management Summary for sales meetings.
- Opportunity List and CRM-style Opportunity Detail pages for a clear CRM demo flow.
- CRM AI Assistant that answers natural-language management questions from the current Safe CRM Demo Context.
- AI Sales Actions that turn Safe CRM Context into opportunity briefs, action boards, meeting material, data repair suggestions, customer growth ideas, and draft packs.

The original Gateway Console remains available in the `Data Safety Gateway` tab to explain how raw CRM fields are transformed before AI use.

## Run

```bash
npm install
npm run build
npm run server
```

Open:

```text
http://127.0.0.1:8790
```

For development:

```bash
npm run dev:full
```

## Optional Dynamics 365 / Dataverse Connection

Create `.env` in the project root:

```text
DATA_SOURCE=mock
TENANT_ID=
CLIENT_ID=
CLIENT_SECRET=
DATAVERSE_URL=
AI_PROVIDER=demo
ALLOW_EXTERNAL_AI=false
OPENAI_API_KEY=
OPENAI_MODEL=
```

Supported `DATA_SOURCE` values:

- `mock`: use local JSON mock data only.
- `dynamics`: use read-only Dataverse opportunities only.
- `hybrid`: merge Dataverse opportunities with local mock data.

For Dynamics 365 Sales Trial, set:

```text
DATA_SOURCE=hybrid
TENANT_ID=<your-tenant-id>
CLIENT_ID=<your-entra-app-client-id>
CLIENT_SECRET=<your-client-secret>
DATAVERSE_URL=https://<your-org>.crm*.dynamics.com
```

The Dataverse connector is read-only. It queries only:

```text
/api/data/v9.2/opportunities
```

with `$select` limited to:

```text
opportunityid, name, estimatedvalue, estimatedclosedate, closeprobability, createdon, modifiedon, statecode, statuscode, _customerid_value, _ownerid_value
```

Raw Dataverse rows are not persisted to local JSON files. Dynamics rows are mapped into tokenized demo opportunities before they reach the Cockpit, Gateway tab, or AI functions.

For the current demo, `Refresh from Dynamics` is the import/sync action. Local CSV/Excel import is intentionally not part of this stage.

### Field Mapping Boundary

The field mapping layer separates three sources:

- `sales_trial_d365`: confirmed Dynamics 365 Sales Trial Web API fields. Only these fields can enter the current Dataverse `$select`.
- `company_crm_video`: target fields identified from the company CRM operation video. These are design targets only until IT / CRM admins confirm real API logical names.
- `ai_gateway`: values derived inside the Gateway, such as tokens, sanitized titles, safe summaries, and data quality flags.

Company CRM target fields marked `pending_real_api_mapping` are shown in Data Safety Gateway as future mapping targets. They are not queried from the Sales Trial API.

## Security Reminder

Do not commit secrets or real CRM exports.

- Do not commit `.env`.
- Do not commit Entra client secrets, API keys, tenant credentials, or Dataverse connection secrets.
- Do not commit real customer names, contact names, phone numbers, email addresses, detailed addresses, contract text, exact prices, or exported raw Dataverse rows.
- Do not commit `server/data/audit-log.json`; audit events can contain demo traces and should stay local.
- Use `.env.example` as the safe template for sharing configuration names.

## AI / LLM Provider

Current default:

```text
LLM_PROVIDER=demo
```

The demo provider is a local fallback. It does not call OpenAI, DeepSeek, or any external model endpoint. AI outputs are generated from Safe AI Payloads or Safe Aggregate Payloads only.

DeepSeek provider support is reserved for a future integration. It is not enabled in the current build, and no `DEEPSEEK_API_KEY` is required.

## Language

The current default language is:

```text
zh-CN
```

AI requests include a lightweight `language` parameter. The backend also defaults to `zh-CN` when no language is supplied. Full UI i18n and Japanese / English page switching are reserved for future work.

## Executive Cockpit Demo Route

Step 1: Click `Test Connection`.

Step 2: Click `Refresh from Dynamics`.

Step 3: Review the Executive Cockpit KPI cards.

Step 4: Use filters to switch business views:

- Scope
- Period
- Department
- Owner
- Business Segment
- Transport Mode
- Trade Lane
- Cargo Type
- Stage
- Risk Level
- Customer Tier
- Recurring Type
- Forecast Category
- Data Source

Step 5: Review Pipeline Health, Risk Heatmap, and Top Risk Opportunities.

Step 6: Click `Generate` to create the Chinese AI Management Summary. The summary is generated only from a Safe Aggregate Payload, not from raw CRM JSON.

Step 7: Ask the CRM AI Assistant questions such as:

- 哪些客户本月风险最高？
- 本周应该优先跟进哪些案件？
- 哪些案件需要管理层介入？
- 当前 Pipeline 最大风险在哪里？
- 生成营业会议摘要

Step 8: Open the `Data Safety Gateway` tab to inspect脱敏、Safe Payload 和 Audit Log.

## AI Sales Action Layer

The `AI Sales Actions` tab is not a replacement for Dynamics dashboards. It is a safe action layer above Dynamics CRM / company CRM:

```text
Mapped CRM opportunities
-> Safe CRM Context
-> Demo provider
-> Sales action material
-> Audit Log
```

Current behavior:

- All output comes from the local demo provider.
- No external LLM is called.
- No email is sent.
- No task, note, next step, or CRM field is written back to Dynamics.
- Frontend requests send only safe parameters such as `opportunity_id`, `customer_token`, `filters`, `role`, and `language`.
- Backend reads the current mapped opportunities and rebuilds Safe CRM Context before every action.

Available action modules:

- Opportunity 360 AI Brief
- Next Best Action Board
- Risk Summary
- CRM Data Doctor
- Management Meeting Copilot
- Customer Growth / Cross-sell Agent
- Draft Pack

Future extension points are reserved for DeepSeek / Azure OpenAI / OpenAI providers, approval-based CRM write-back, and Japanese / English output templates. These are not enabled in the current build.

## AI Sales Actions Demo Route

Step 1: Click `Refresh from Dynamics`.

Step 2: Review the `Executive Cockpit`.

Step 3: Open `AI Sales Actions`.

Step 4: Select a high-risk Opportunity.

Step 5: Generate `Opportunity 360 AI Brief`.

Step 6: Review `Next Best Action Board`.

Step 7: Run `CRM Data Doctor`.

Step 8: Generate `Management Meeting Copilot`.

Step 9: Select a customer token and generate `Customer Growth / Cross-sell Agent`.

Step 10: Generate `Draft Pack`.

Step 11: Open `Data Safety Gateway` / `Audit Log` to prove that raw CRM data did not enter the AI provider.

## Closed-loop CRM Gateway Demo Route

Step 1: Click `Test Connection`.

Step 2: Click `Import / Refresh from Dynamics` from the Opportunities page or `Refresh from Dynamics` from the Executive Cockpit.

Step 3: Open `Opportunities` and review the opportunity list.

Step 4: Click a high-risk opportunity to open the CRM-style detail page.

Step 5: Review the four demo zones on the detail page:

- `CRM Data`
- `Safe Context`
- `AI Output`
- `Audit Log`

Step 6: Generate the required AI Sales Actions:

- Opportunity Brief
- Next Best Action
- Risk Summary
- Data Quality Check

Step 7: Show that each AI action is based on `safeOpportunityContext`, uses `provider=demo`, and has `external_model_called=false`.

Step 8: Use `Data Safety Gateway` when management wants to inspect the raw-to-safe transformation table and the audit history.

## CRM AI Assistant

The CRM AI Assistant uses the currently loaded demo data as context:

```text
Dynamics Demo Opportunity
-> Refresh from Dynamics
-> mapped opportunities in memory
-> AI Context Builder
-> Safe CRM Demo Context
-> Demo AI answer
```

It does not write back to Dynamics. It does not send raw CRM data to the AI provider. When `DATA_SOURCE=hybrid`, the assistant context can include both mapped Dynamics opportunities and local mock logistics opportunities.

The assistant displays:

- Context Source: Mock / Dynamics / Hybrid
- Dynamics Records
- Total Opportunities in Context
- Last Refresh Time
- Safe Context Enabled

The current demo provider supports basic management intents:

- risk overview
- priority follow-up
- pipeline summary
- customer portfolio
- owner action
- data quality
- general summary

## Data Safety Gateway Demo Route

Use the `Data Safety Gateway` tab to show how raw CRM data is transformed:

- `customer_name` -> `customer_token`
- `contact_email` -> `removed`
- `estimated_revenue` -> `revenue_band`
- `estimated_margin` -> `margin_band`
- `expected_order_date` -> `expected_order_status`
- `owner_name` -> role-safe label or token

Then run individual AI functions and show the Audit Log:

- Case Summary
- Risk Analysis
- Next Best Action
- Draft Follow-up Email
- Meeting Report Note

## Safety Rules

All AI outputs must use either a Safe AI Payload or a Safe Aggregate Payload. AI calls are blocked if the payload contains:

- `customer_name`
- `contact_email`
- `phone`
- `exact_revenue`
- `exact_margin`
- `supplier_cost`
- `contract_text`
- `meeting_transcript`

AI audit entries include:

- role
- intent / AI function
- provider
- external model called flag
- safe payload keys
- blocked reason, when applicable

In the current build, `provider=demo` and `external_model_called=false`.

The AI Demo Assistant uses a Safe CRM Demo Context. Each opportunity in that context may include only tokenized or banded fields such as opportunity token, customer token, owner token, stage, logistics segment, transport mode, revenue band, margin band, risk level, expected order status, suggested action, and data source.

The demo uses 50+ mock logistics CRM opportunities. It does not use real customer data, Microsoft / Dynamics 365 logos, Microsoft source code, or a required OpenAI API key.

## API

- `GET /api/opportunities`
- `GET /api/opportunities/:id`
- `GET /api/management-dashboard`
- `GET /api/dynamics/status`
- `POST /api/dynamics/test-connection`
- `POST /api/dynamics/sync`
- `POST /api/gateway/transform`
- `POST /api/ai/:functionName`
- `POST /api/ai-demo/chat`
- `GET /api/ai-context/opportunity/:id`
- `POST /api/ai-actions/opportunity-brief`
- `POST /api/ai-actions/next-best-actions`
- `POST /api/ai-actions/risk-summary`
- `POST /api/ai-actions/data-doctor`
- `POST /api/ai-actions/meeting-copilot`
- `POST /api/ai-actions/customer-growth`
- `POST /api/ai-actions/draft-pack`
- `GET /api/audit-log`
- `POST /api/audit-log/reset`

`GET /api/management-dashboard` supports:

- `scope`
- `company`
- `department`
- `owner`
- `period`
- `business_segment`
- `transport_mode`
- `trade_lane`
- `cargo_type`
- `stage`
- `risk_level`
- `customer_tier`
- `recurring_type`
- `forecast_category`
- `data_source`

`POST /api/ai/:functionName` accepts:

- `role`
- `opportunity_id`
- `safePayload`
- `language`, default `zh-CN`

`POST /api/ai-actions/:actionName` accepts only safe action parameters:

- `opportunity_id`
- `customer_token`
- `filters`
- `role`
- `language`, default `zh-CN`

Supported AI functions:

- `management-summary`
- `case-summary`
- `risk-analysis`
- `next-best-action`
- `draft-follow-up-email`
- `meeting-report-note`

`POST /api/ai-demo/chat` accepts:

- `question`
- `filters`
- `role`
- `language`, default `zh-CN`

It returns:

- `answer`
- `context_summary`
- `audit`

## Verify

```bash
npm test
npm run build
npm audit --json
```

## Dynamics Link Check

When `.env` is configured for Dataverse, these checks should remain healthy:

- `GET /api/dynamics/status`: returns data source, configured status, Dynamics record count, last refresh time, and last sync status. It never returns secrets.
- `POST /api/dynamics/test-connection`: verifies the Entra application user can call Dataverse.
- `POST /api/dynamics/sync`: refreshes the in-memory mapped Dynamics opportunities.

For a successful hybrid demo, the status should show:

- `dataSource=hybrid`
- `isConfigured=true`
- `canRefresh=true`
- `recordCount > 0`
- non-empty `lastRefreshTime` after refresh
