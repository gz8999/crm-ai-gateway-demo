# CRM AI Gateway -> AI Sales Action Workbench Design

## Summary

This design changes the product direction from a KPI-heavy dashboard into an action-first AI Sales Action Workbench. The first screen should answer three management questions:

1. Which opportunities need attention?
2. Why do they need attention?
3. What should each owner do next?

This design does not change Dataverse, FormXML, CRM views, app modules, business data, or LLM providers. It uses only the current safe CRM demo context and local rule-based demo insights.

## Sitemap

```text
AI Sales Action Workbench
├─ AI Cockpit
├─ Risk Radar
├─ Action Board
├─ Deal Brief
├─ Opportunities
└─ Safety Gateway
```

Deferred standalone pages:

- AI Data Doctor: shown as Data Quality Warnings inside Cockpit and Deal Brief.
- AI Pipeline Health: shown as Pipeline Snapshot inside Cockpit.

## Page Structure

### AI Cockpit

Audience: management.

Core questions:

- Which deals should leadership look at today?
- Why do they matter?
- Who should do what next?

Modules:

- AI Executive Summary
- Management Attention Queue
- Why It Matters
- Recommended Actions
- Department / Stage Risk Distribution
- Safe Context badge

Safe Context fields:

- `opportunityToken`
- `customerToken`
- `ownerToken`
- `priority`
- `opportunityStage`
- `winProbability`
- `expectedOrderStatus`
- `estimatedQuoteBand`
- `salesDepartment`
- `sanitizedProgressSummary`

### Risk Radar

Audience: sales managers.

Core questions:

- Which opportunities are becoming risky?
- What is driving the risk?
- Which Safe Context evidence supports the judgment?

Modules:

- Risk Driver Summary
- Risk Matrix
- Top Risk Cases
- Risk Evidence
- Recommended Mitigation

Safe Context fields:

- `priority`
- `expectedOrderStatus`
- `winProbability`
- `decisionMakerStatus`
- `customerNeed`
- `proposalContent`
- `sanitizedProgressSummary`
- `dataQualityFlags`

### Action Board

Audience: sales managers and sales owners.

Core questions:

- Who needs to do what this week?
- Which actions are urgent?
- Which opportunities require leadership intervention?

Modules:

- Owner Follow-up Board
- Action Type Groups
- Priority Rank
- Due Window
- Suggested CRM Update Draft

Safe Context fields:

- `ownerToken`
- `opportunityToken`
- `customerToken`
- `priority`
- `expectedOrderStatus`
- `badges`
- `next_best_actions`
- `dataQualityFlags`

### Deal Brief

Audience: sales owner, sales manager, management reviewer.

Core questions:

- What is the current status of this opportunity?
- What are the main risks?
- What is the next best action?

Modules:

- Deal Summary
- Current Status
- Risk Reasons
- Next Best Actions
- Required Materials
- Management Escalation
- Safe Context Preview

Safe Context fields:

- Single-record `safeOpportunityContext`.

### Opportunities

Purpose: searchable and filterable opportunity list. It is not the default homepage.

### Safety Gateway

Purpose: explain raw CRM -> Safe Context -> AI Output. It remains the proof page for demo safety and auditability.

## Design Preview Options

### A. Management Command Center

Best for final direction. It makes the management attention queue the center of the product. It is strongest for executive demos because it immediately shows what needs attention, why, and who should act.

### B. AI Workbench

Best for sales manager daily usage. It feels more like an AI copilot and gives the selected deal, queue, and next actions equal weight.

### C. Risk Operations Board

Best for risk reviews. It strongly communicates risk drivers, risk matrix, mitigation actions, and owner accountability.

### D. Minimal Executive Briefing

Best for short leadership readouts. It is intentionally sparse and prioritizes the top five attention deals and this week's management actions.

## Existing UI Reuse

- Reuse insight badge visual language.
- Reuse the six-part Deal Brief structure from the current AI Insight panel.
- Reuse Risk Heatmap / distribution list concepts.
- Reuse Data Safety Gateway as the safety proof page.
- Reuse action output patterns from AI Sales Actions, but reorganize them into Action Board and Deal Brief.

## UI To Downgrade Later

- Large KPI card grid becomes a secondary Pipeline Snapshot.
- Customer Portfolio is no longer a primary homepage module.
- AI Demo Assistant moves out of the main homepage flow.
- AI Sales Actions as a broad tab is split into Action Board and Deal Brief.

## Implementation Notes

- Add a static preview route at `/design-preview`.
- Keep the formal app mounted at `/`.
- Keep preview data local and safe.
- Prefix all preview CSS with `.design-preview` to avoid styling the formal app.
- Show a clear preview banner: static design preview, no Dataverse write, demoProvider only.

## Safety Rules

Preview content may show only:

- tokens
- choice labels
- yes/no labels
- amount bands
- sanitized descriptions
- sanitized progress summaries
- data quality flags

Preview content must not show:

- customer real names
- contact names
- phone numbers
- email addresses
- detailed addresses
- exact amounts
- raw timeline
- raw email, phone, or task bodies

## Tests

- Existing Safe Context, Dynamics sync, and AI Insight tests must continue to pass.
- Preview data safety test must confirm no forbidden sensitive patterns.
- Route smoke test must confirm `/design-preview` is conditionally mounted without replacing the default app.
- TypeScript and Vite build must pass.

## Recommendation

Use Option A, Management Command Center, as the final rebuild direction. Keep Option B as a secondary daily-work view for sales managers. Use Option C for Risk Radar. Use Option D as a future meeting / briefing mode.
