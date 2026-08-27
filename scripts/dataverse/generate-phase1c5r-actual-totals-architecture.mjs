import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let URL;
let FORM_ID;
const fields = ["aigw_yearrevenueactual", "aigw_yearrevenueactualcny"];

export async function main() {
  URL = getDataverseUrl();
  FORM_ID = getRequiredEnvironmentId("D365_FULL_REPLICA_FORM_ID");
  const root = process.cwd();
  const client = createDynamicsClient();
  if (client.config.dataverseUrl !== URL) throw new Error("Dataverse URL safety gate failed");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("AI safety gate failed");
  const get = async (uri) => (await client.dataverseGet(uri)).body;
  const [metadata, form, actualAttributes] = await Promise.all([
    Promise.all(fields.map((field) => get(`/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='${field}')/Microsoft.Dynamics.CRM.MoneyAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,AttributeType,SourceType,IsValidForCreate,IsValidForUpdate,IsValidForRead,IsManaged,Precision,PrecisionSource,MinValue,MaxValue,RequiredLevel,DisplayName,CalculationOf`))),
    get(`/api/data/v9.2/systemforms(${FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formxml`),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='aigw_actualmanagement')/Attributes?$select=LogicalName,AttributeType,SourceType,IsValidForCreate,IsValidForUpdate"),
  ]);
  const audit = metadata.map((item) => {
    const control = form.formxml.match(new RegExp(`<control\\b[^>]*datafieldname="${item.LogicalName}"[^>]*>`))?.[0] || null;
    return { ...item, labels: Object.fromEntries((item.DisplayName?.LocalizedLabels || []).map((label) => [label.LanguageCode, label.Label])), formControl: control, formDisabled: /disabled="true"/.test(control || ""), independentBusinessMoneyField: true, automaticBaseField: `${item.LogicalName}_base` };
  });
  const monthRevenueFields = ["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"].map((month) => `aigw_${month}actualrevenue`);
  const attributeNames = new Set((actualAttributes.value || []).map((item) => item.LogicalName));
  const manifest = {
    phase: "1C-5R",
    dryRun: true,
    blocked: true,
    writesExecuted: false,
    targetEnvironment: URL,
    recommendation: "Synchronous Dataverse plugin",
    opportunityTargets: audit.map(({ LogicalName, SchemaName, MetadataId, AttributeType, SourceType, Precision, PrecisionSource, IsValidForUpdate, formDisabled, automaticBaseField }) => ({ logicalName: LogicalName, schemaName: SchemaName, metadataId: MetadataId, type: AttributeType, sourceType: SourceType, precision: Precision, precisionSource: PrecisionSource, writable: IsValidForUpdate, formReadOnly: formDisabled, automaticBaseField })),
    fiscalYear: { recommended: true, field: "aigw_fiscalyear", type: "Whole Number", meaning: "Fiscal year start year; 2026 means April 2026 through March 2027", requiredLevel: "ApplicationRequired", aggregation: "Only records matching configured current fiscal year are included in Opportunity totals", configuration: "Plugin secure/unsecure configuration CurrentFiscalYearStart; replace with an explicit Opportunity reporting-year field if users must switch year interactively" },
    plugin: {
      assemblyProposal: "CrmAiGateway.ActualTotals",
      table: "aigw_actualmanagement",
      filteringAttributes: [...monthRevenueFields, "aigw_opportunityid", "transactioncurrencyid"],
      steps: [
        { message: "Create", stage: "PreOperation", mode: "Synchronous", purpose: "Set child annual total from 12 Target monthly Revenue values" },
        { message: "Create", stage: "PostOperation", mode: "Synchronous", purpose: "Aggregate current-fiscal-year related children and update Opportunity" },
        { message: "Update", stage: "PreOperation", mode: "Synchronous", filteringAttributes: [...monthRevenueFields, "aigw_opportunityid", "transactioncurrencyid"], preImage: [...monthRevenueFields, "aigw_opportunityid", "transactioncurrencyid", "aigw_fiscalyear", "aigw_annualactualrevenue"], purpose: "Merge Target with PreImage and set child annual total without issuing a child Update" },
        { message: "Update", stage: "PostOperation", mode: "Synchronous", filteringAttributes: [...monthRevenueFields, "aigw_opportunityid", "transactioncurrencyid"], preImage: ["aigw_opportunityid", "aigw_fiscalyear"], postImage: ["aigw_opportunityid", "aigw_fiscalyear", "aigw_annualactualrevenue", "aigw_annualactualrevenue_base"], purpose: "Recalculate old and new Opportunity when lookup/fiscal year changes" },
        { message: "Delete", stage: "PostOperation", mode: "Synchronous", preImage: ["aigw_opportunityid", "aigw_fiscalyear"], purpose: "Recalculate the former Opportunity after deletion" }
      ],
      recursionGuards: ["Return for Depth > 1 when invoked by this plugin path", "Set annual value in PreOperation Target instead of calling Update on the same child", "Compare currency-rounded values before Opportunity Update", "Use SharedVariables operation marker"],
      cny: { childTransactionTotal: "aigw_annualactualrevenue", childBaseTotal: "aigw_annualactualrevenue_base generated by Dataverse", opportunityTransactionTotal: "aigw_yearrevenueactual", opportunityCnyTotal: "aigw_yearrevenueactualcny is an independent Money field, not _base", rule: "Never write a _base field. Sum child generated base values for CNY. In this CNY-base demo environment, write that numeric base sum to the explicit CNY field. Before supporting non-CNY Opportunity currencies, validate its display semantics or replace it with a fixed-CNY decimal/money design." },
      monthlyFieldsVerified: monthRevenueFields.every((field) => attributeNames.has(field)),
    },
    seedGate: { phase1c5Blocked: true, annualFieldRemovedFromPayload: true, opportunityAnnualFieldsNeverSeeded: true, unblockOnlyAfter: ["aigw_fiscalyear created and published on custom table", "plugin assembly and all synchronous steps registered", "single-record Create/Update/Delete/reparent validation passes", "currency/base aggregation validation passes"] },
    rollback: { metadata: "Do not delete automatically. Disable/unregister only the new plugin steps under separate authorization; retain assembly until dependencies are checked.", data: "Plugin deployment creates no records. Future seed rollback deletes only execution-recorded actual IDs; Opportunity totals must then be recalculated by the plugin.", fiscalField: "Do not physically delete without separate metadata deletion authorization." }
  };
  const md = `# Phase 1C-5R Actual Totals Calculation Architecture\n\n## Confirmed Opportunity fields\n\n| Field | Type | SourceType | Writable | Form read-only | Meaning |\n|---|---|---:|---|---|---|\n${audit.map((item) => `| \`${item.LogicalName}\` | ${item.AttributeType} | ${item.SourceType} | ${item.IsValidForUpdate} | ${item.formDisabled} | ${item.labels[2052] || item.labels[1033]} |`).join("\n")}\n\nBoth fields are independent unmanaged Money columns. \`aigw_yearrevenueactualcny\` is not an automatic base column. Each Money field also has its own Dataverse-generated \`_base\` companion.\n\n## Architecture decision\n\n- Formula/Calculated columns can calculate the 12-month total on one Actual record, but cannot synchronously aggregate an arbitrary 1:N child set into the Opportunity.\n- Rollup columns model the parent aggregation but are asynchronous and do not meet the immediate-after-save requirement. They remain useful only as reconciliation.\n- A synchronous plugin is recommended: PreOperation computes the child annual value; PostOperation aggregates all current-fiscal-year children and updates the parent.\n\n## Algorithm\n\n\`\`\`text\nPreOperation Create/Update:\n  merged = PreImage + Target\n  annual = sum(April..March Actual Revenue, null as zero)\n  if rounded annual differs, set Target.aigw_annualactualrevenue = annual\n\nPostOperation Create/Update/Delete:\n  affectedParents = new and old Opportunity lookup IDs\n  for each parent:\n    children = active related Actual rows where aigw_fiscalyear == configured current FY\n    transactionTotal = sum(children.aigw_annualactualrevenue)\n    cnyBaseTotal = sum(children.aigw_annualactualrevenue_base)\n    update Opportunity only when rounded values differ:\n      aigw_yearrevenueactual = transactionTotal\n      aigw_yearrevenueactualcny = cnyBaseTotal\n\`\`\`\n\nNever write any \`_base\` column. Update and Delete images preserve the old parent so reparenting recalculates both sides.\n\n## Fiscal year\n\nAdd \`aigw_fiscalyear\` as a required Whole Number on Actual Management before seeding. Define the value as the April fiscal-year start year. Parent totals include only the configured current fiscal year. Without this field, multiple fiscal years would be incorrectly combined.\n\n## Safe sequence\n\n1. 1C-5R1: create and targeted-publish \`aigw_fiscalyear\` on the custom table only.\n2. 1C-5R2: build and unit-test the plugin assembly locally.\n3. 1C-5R3: separately authorize plugin assembly, steps and images registration.\n4. 1C-5R4: validate one synthetic Create, Update, Delete and reparent scenario.\n5. 1C-5R5: unblock the revised Phase 1C-5 seed manifest.\n6. 1C-5: create the 100 synthetic records.\n7. 1C-6: full read-only totals and safety verification.\n\nThe Opportunity Form, Business Rule, BPF and Subgrid remain unpublished and unchanged in this dry-run.\n`;
  await Promise.all([
    fs.writeFile(path.join(root, "docs", "d365", "phase1c-5r-opportunity-field-audit.json"), JSON.stringify(audit, null, 2)),
    fs.writeFile(path.join(root, "docs", "d365", "phase1c-5r-actual-totals-architecture.md"), md),
    fs.writeFile(path.join(root, "docs", "d365", "phase1c-5r-plugin-write-manifest.json"), JSON.stringify(manifest, null, 2)),
  ]);
  console.log(JSON.stringify({ writesExecuted: false, opportunityFields: audit.map((item) => ({ logicalName: item.LogicalName, type: item.AttributeType, sourceType: item.SourceType, formDisabled: item.formDisabled })), monthlyFieldsVerified: manifest.plugin.monthlyFieldsVerified, files: ["docs/d365/phase1c-5r-opportunity-field-audit.json", "docs/d365/phase1c-5r-actual-totals-architecture.md", "docs/d365/phase1c-5r-plugin-write-manifest.json"] }, null, 2));
}


runDataverseCli(import.meta.url, main);
