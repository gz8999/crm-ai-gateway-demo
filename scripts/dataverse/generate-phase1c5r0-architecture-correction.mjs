import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let URL;
let FORM_ID;
const FIELDS = ["aigw_yearrevenueactual", "aigw_yearrevenueactual_base", "aigw_yearrevenueactualcny"];

export async function main() {
  URL = getDataverseUrl();
  FORM_ID = getRequiredEnvironmentId("D365_FULL_REPLICA_FORM_ID");
  const root = process.cwd();
  const client = createDynamicsClient();
  if (client.config.dataverseUrl !== URL) throw new Error("Dataverse URL gate failed");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("AI safety gate failed");
  const get = async (uri) => (await client.dataverseGet(uri)).body;
  const [metadata, form, opportunityRows, actualRows] = await Promise.all([
    Promise.all(FIELDS.map((field) => get(`/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='${field}')/Microsoft.Dynamics.CRM.MoneyAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,AttributeType,SourceType,IsValidForCreate,IsValidForUpdate,IsValidForRead,IsValidForForm,IsManaged,Precision,PrecisionSource,RequiredLevel,DisplayName,CalculationOf`))),
    get(`/api/data/v9.2/systemforms(${FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formxml`),
    get("/api/data/v9.2/opportunities?$select=opportunityid,name,_transactioncurrencyid_value&$filter=contains(name,'AI-DEMO')&$top=5000"),
    get("/api/data/v9.2/aigw_actualmanagements?$select=aigw_actualmanagementid,_aigw_opportunityid_value,_transactioncurrencyid_value&$top=5000"),
  ]);
  const opportunities = opportunityRows.value.filter((row) => row.name?.startsWith("[AI-DEMO]"));
  const currencyIds = [...new Set(opportunities.map((row) => row._transactioncurrencyid_value))];
  const currencies = (await get(`/api/data/v9.2/transactioncurrencies?$select=transactioncurrencyid,currencyname,isocurrencycode,currencysymbol,exchangerate&$filter=${currencyIds.map((id) => `transactioncurrencyid eq ${id}`).join(" or ")}`)).value || [];
  const fieldAudit = metadata.map((item) => ({
    logicalName: item.LogicalName,
    schemaName: item.SchemaName,
    metadataId: item.MetadataId,
    type: item.AttributeType,
    sourceType: item.SourceType,
    calculationOf: item.CalculationOf,
    isValidForForm: item.IsValidForForm,
    isValidForRead: item.IsValidForRead,
    isValidForCreate: item.IsValidForCreate,
    isValidForUpdate: item.IsValidForUpdate,
    labels: Object.fromEntries((item.DisplayName?.LocalizedLabels || []).map((label) => [label.LanguageCode, label.Label])),
    currentFormControl: form.formxml.match(new RegExp(`<control\\b[^>]*datafieldname="${item.LogicalName}"[^>]*>`))?.[0] || null,
  }));
  const distribution = currencyIds.map((id) => ({ transactionCurrencyId: id, count: opportunities.filter((row) => row._transactioncurrencyid_value === id).length, currency: currencies.find((item) => item.transactioncurrencyid === id) }));
  const mismatchedExistingChildren = actualRows.value.filter((child) => {
    const parent = opportunities.find((row) => row.opportunityid === child._aigw_opportunityid_value);
    return parent && parent._transactioncurrencyid_value !== child._transactioncurrencyid_value;
  });
  const manifest = {
    phase: "1C-5R0",
    dryRun: true,
    writesExecuted: false,
    targetEnvironment: URL,
    currencyDistribution: distribution,
    opportunityFieldMapping: {
      transactionTotal: "aigw_yearrevenueactual",
      generatedBaseTotal: "aigw_yearrevenueactual_base",
      deprecatedIndependentCnyField: "aigw_yearrevenueactualcny",
      pluginWrites: ["aigw_yearrevenueactual"],
      pluginNeverWrites: ["aigw_yearrevenueactual_base", "aigw_yearrevenueactualcny", "any _base field"],
      formFutureBinding: { current: "aigw_yearrevenueactualcny", proposed: "aigw_yearrevenueactual_base", executableThisPhase: false },
    },
    plugin: {
      table: "aigw_actualmanagement",
      annualSourceFields: ["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"].map((month) => `aigw_${month}actualrevenue`),
      filteringAttributes: ["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"].map((month) => `aigw_${month}actualrevenue`).concat(["aigw_opportunityid", "transactioncurrencyid"]),
      ignoredFilteringAttributes: ["aigw_annualactualrevenue"],
      firstVersionCardinality: "At most one Actual Management record per Opportunity",
      preOperation: "Merge Target and PreImage; set Target.aigw_annualactualrevenue to rounded sum of 12 monthly Revenue fields only when changed.",
      postOperation: "Recalculate old/new parents; require zero or one related Actual row; update only opportunity.aigw_yearrevenueactual when changed.",
      currencyRule: "Actual Management transactioncurrencyid must equal related Opportunity transactioncurrencyid.",
      uniqueness: { create: "PreValidation query by aigw_opportunityid; reject if any record exists", updateReparent: "PreValidation query new Opportunity excluding current record; reject if occupied", databaseAlternateKeyAvailable: false, limitation: "Dataverse alternate keys cannot enforce uniqueness on a lookup alone in this design; synchronous validation is the first-version guard." },
      recursion: ["Depth and SharedVariables guard", "PreOperation Target mutation instead of child Update", "Parent update only when rounded total differs"],
    },
    seed: { blocked: true, expectedOpportunityCount: opportunities.length, existingActualCount: actualRows.value.length, existingCurrencyMismatchCount: mismatchedExistingChildren.length, currencyInheritanceRequired: true, annualChildFieldExcludedFromPayload: true, opportunityTotalsExcludedFromPayload: true },
    futureFormChange: { required: true, targetFormId: FORM_ID, replaceControlBinding: { from: "aigw_yearrevenueactualcny", to: "aigw_yearrevenueactual_base" }, preserveDeprecatedField: true, saveOnlyThenValidate: true, publishSeparateGate: true },
    rollback: { thisPhase: "No Dataverse changes", futurePlugin: "Disable/unregister only newly registered steps under separate authorization", futureForm: "Restore exact unpublished FormXML/FormJSON baseline under separate authorization", futureSeed: "Delete only execution-recorded Actual IDs; plugin recalculates parent totals" },
  };
  const md = `# Phase 1C-5R0 Actual Totals Architecture Correction\n\n## Currency distribution\n\n${distribution.map((item) => `- ${item.currency?.isocurrencycode || "Unknown"}: ${item.count} Opportunities, exchange rate ${item.currency?.exchangerate}`).join("\n")}\n\nAll 100 current demo Opportunities use CNY, but seed and plugin logic must inherit each parent record's transaction currency and must not rely on this current distribution.\n\n## Corrected field semantics\n\n- Plugin writes only \`aigw_yearrevenueactual\`.\n- Dataverse generates \`aigw_yearrevenueactual_base\`; it is readable, valid for Form, and not writable.\n- \`aigw_yearrevenueactualcny\` is an independent legacy Money field. Retain it but deprecate it.\n- A future Form-only phase should replace the visible CNY control binding with \`aigw_yearrevenueactual_base\`.\n- This matches the source CRM field \`new_yearrevenueactural_base\`, whose \`_base\` name identifies the generated base-currency companion.\n\n## First-version cardinality\n\nEach Opportunity may have at most one Actual Management record. PreValidation Create rejects a second related row. Reparenting checks the destination Opportunity while excluding the current row. This rule uses the lookup, never a name prefix. No fiscal-year field is created in this version.\n\n## Corrected plugin flow\n\n1. PreOperation Create/Update calculates child annual Revenue from April-March and sets the Target field only when changed.\n2. PostOperation Create/Update/Delete finds old/new parent IDs and reads related rows. More than one row is treated as an integrity error.\n3. Update only \`opportunity.aigw_yearrevenueactual\`.\n4. Never update \`aigw_yearrevenueactualcny\` or any \`_base\` field.\n5. Dataverse maintains \`aigw_yearrevenueactual_base\` using the Opportunity transaction currency and exchange rate.\n\nNo Dataverse write, Form change, Plugin deployment or publish occurred in this phase.\n`;
  await Promise.all([
    fs.writeFile(path.join(root, "docs", "d365", "phase1c-5r0-field-currency-audit.json"), JSON.stringify({ fields: fieldAudit, opportunityCount: opportunities.length, currencyDistribution: distribution, existingActualCount: actualRows.value.length, existingCurrencyMismatches: mismatchedExistingChildren }, null, 2)),
    fs.writeFile(path.join(root, "docs", "d365", "phase1c-5r0-architecture-correction.md"), md),
    fs.writeFile(path.join(root, "docs", "d365", "phase1c-5r-plugin-write-manifest.json"), JSON.stringify(manifest, null, 2)),
  ]);
  console.log(JSON.stringify({ writesExecuted: false, opportunityCount: opportunities.length, currencyDistribution: distribution, fields: fieldAudit, existingActualCount: actualRows.value.length, existingCurrencyMismatchCount: mismatchedExistingChildren.length }, null, 2));
}


runDataverseCli(import.meta.url, main);
