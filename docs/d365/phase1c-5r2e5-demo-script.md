# Phase 1C-5R2E-5 Demo Script

## Status

This 5-8 minute route has a server-verified One-Actual dataset and completed `CRM AI Demo User` read-only acceptance.

## Preconditions

- Use `CRM AI Demo User`, never an administrator, for the presentation.
- Open only `CRM AI Gateway Demo - Modern` in `org91f5f65f.crm5.dynamics.com`.
- Confirm the selected record begins with `[AI-DEMO-R2E5]`.
- Confirm the corrected dataset follows the deployed one-Actual-per-Opportunity contract.
- Primary demonstration Opportunity: `[AI-DEMO-R2E5] Monthly Actuals Scenario` (`4d1cfb52-2c80-f111-ab0e-000d3a82d194`).
- Comparison Opportunity: `[AI-DEMO-R2E5] Pipeline Comparison Scenario` (`cf1cfb52-2c80-f111-ab0e-000d3a82d194`).
- Do not invoke an external LLM. AI explanations must describe the Safe Context boundary only.

## 5-8 Minute Route

### 1. Login And App Boundary (30 seconds)

Sign in as the ordinary demo user and open the Modern App. Point out that the navigation is intentionally limited to Opportunities and Actual Management.

### 2. Opportunity List (30-45 seconds)

Open the demo Opportunity view, filter/search for `[AI-DEMO-R2E5]`, and select only the execution-recorded synthetic Opportunity. Do not open unrelated records.

### 3. Full Replica Overview (60 seconds)

Show the Full Replica name, header, and five tabs. Explain that it remains non-default and is exposed through the dedicated app and role configuration.

### 4. Location And POL/POD (45 seconds)

Show the Location lookup and POL/POD lookups without changing selections. Explain that Location and POL/POD are controlled test master data and are not sent to an external AI provider.

### 5. Monthly Actuals And Annual Revenue (90 seconds)

Open the Actual Management subgrid. Under the approved one-Actual option, open the single synthetic Actual read-only and show the populated month fields and generated Annual Actual Revenue. Return to the Opportunity and show the synchronized parent annual Revenue total.

Do not claim that four child rows are supported. The current Plugin permits one Actual per Opportunity.

Show April-July Revenue `100/200/300/400` and GP `10/20/30/40`. Explain that Annual Actual Revenue `1,000` and the parent Revenue `1,000` are Plugin-managed, while annual GP `100` and margin `10%` are transparent demo calculations because the current data model has no annual actual GP field.

Show Sales Person 1 as `[AI-DEMO-R2E5] Demo Sales Owner` and Contact 1 as `[AI-DEMO-R2E5] Synthetic Contact`. The record is budget-outside, so do not claim that monthly budget fields were completed or validated in this scenario.

### 5A. Budget-Inside Comparison (60 seconds)

Open `[AI-DEMO-R2E5] Pipeline Comparison Scenario` read-only. Show that it is budget-inside, uses the same synthetic Sales Person 1 and Contact 1, and has no Actual row. In the Budget tab, show April-March Revenue `50,000` and GP `5,000` per month, annual Revenue `600,000`, annual GP `60,000`, and the consistent 10% margin. Budget volume remains intentionally empty.

Do not edit or save the record. The annual budget fields are explicitly stored totals, not Plugin-generated values.

### 6. Timeline (30 seconds)

Show the native Timeline empty state and controls. Do not create an Activity or Note.

### 7. BPF (45 seconds)

Show the active two-stage BPF. Do not click Next Stage, Previous Stage, Finish, Close as Won, Close as Lost, or Switch Process.

### 8. AI Gateway Safety Boundary (60 seconds)

Explain that only mapped, sanitized Safe Context enters the demo AI layer. Raw Timeline content, customer identifiers, exact Location/POL/POD values, credentials, tokens, and production data are excluded. External LLM calls remain disabled for this route.

### 9. Close (20 seconds)

Return to the Opportunity summary without saving. Confirm that the demonstration was read-only.

## Forbidden Clicks

- Save after changing any field
- New Account, Opportunity, Actual, Activity, or Note
- Next/Previous Stage, Finish, Switch Process
- Close as Won / Close as Lost
- Delete
- Publish or designer links
- Any record without the `[AI-DEMO-R2E5]` prefix

## Exception Handling

- **Wrong form or record:** stop immediately; do not save or navigate through another record.
- **Permission or component error:** capture a local screenshot, close the form, and report P1.
- **Actual count greater than one:** stop; do not delete or repair during the demo.
- **Annual total mismatch:** stop; do not hand-edit the parent total.
- **Unexpected activity/note:** stop and preserve evidence; do not clean it up without a separate manifest.
- **Production hostname:** close the tab immediately and report P0.

## Readiness

- Script structure ready: `true`
- Controlled dataset ready: `true`
- Ordinary-user runtime acceptance ready: `true`
- `R2E Demo Ready=true`

## Corrected One-Actual Run

The route must show one Actual row containing April-July Revenue `100/200/300/400`, generated Annual Actual Revenue `1,000`, and parent annual Revenue `1,000`. The comparison Opportunity must show no Actual row. At the time of the corrected data run, runtime acceptance was pending because browser control could not capture a verifiable ordinary-user session; an administrator session was not accepted as a substitute.

The initial automation-only runtime evidence gap above is retained as history. Final acceptance used the user-provided ordinary-user evidence and an independent GET-only server read-back; no administrator runtime evidence was substituted.

## Business Completeness Presenter Notes

- Sales Person 1 and Contact 1 are populated with synthetic demo values; fields 2-4 remain optional.
- The record is explicitly 预算外. Do not navigate to or describe budget months as completed data.
- Actual GP values are `10/20/30/40`; compute `100 / 1,000 = 10%` aloud if useful.
- Do not describe annual GP as a Plugin field or persisted total.
- Required/conditional-required behavior is a documented follow-up configuration, not part of this demo run.

## Final Acceptance

- Ordinary user: `CRM AI Demo User`
- Full Replica, Location, POL/POD, one-row Actual subgrid, Timeline, and BPF: accepted
- Permission or component P0/P1 errors: none
- Runtime business writes: `0`
- Final P0/P1/P2: `0/0/1`
- `R2E Demo Ready=true`

## Final Business Completeness Route

The demo now has two distinct records:

- Opportunity 1: budget-outside, one Actual, four populated Revenue/GP months.
- Opportunity 2: budget-inside, 12 populated Revenue/GP budget months, no Actual.

Final ordinary-user screenshots now confirm Opportunity 2's Budget tab, budget-inside status, representative monthly values, populated Sales Person 1 and Contact 1, and annual totals. The GET-only read-back confirms the complete April-March sequence. No further data or configuration change is required.

## Budget Scenario Runtime Acceptance

- Runtime user: `CRM AI Demo User`
- App/Form: Modern App / Full Replica
- Budget status: `01: 预算内`
- Monthly Revenue/GP: `50,000/5,000` for April-March
- Annual Revenue/GP: `600,000/60,000`
- Actual count: `0`
- Permission/component errors: none
- Runtime writes: `0`
- Final P0/P1/P2: `0/0/1`
- `R2E Demo Ready=true`
