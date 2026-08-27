import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";
import { resolveActualManagementBindings } from "./lib/dataverse-metadata-resolvers.mjs";
import { buildSyntheticActual, MONEY_FIELDS, reconcileSyntheticActuals, TARGET_FIELDS } from "./lib/phase1c5-synthetic-actuals.mjs";

let URL;
const AUTH = "CONFIRM_D365_TEST_WRITE_PHASE_1C_5_SYNTHETIC_ACTUALS";
const MANIFEST = "local-artifacts/d365/docs/d365/phase1c-5-synthetic-actuals-manifest.json";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = () => new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
const escapeOData = (value) => value.replaceAll("'", "''");

async function readState(client, entitySets) {
  const get = async (uri) => (await client.dataverseGet(uri)).body;
  const [entity, attributes, relationships, opportunities, actuals] = await Promise.all([
    get("/api/data/v9.2/EntityDefinitions(LogicalName='aigw_actualmanagement')?$select=LogicalName,EntitySetName,OwnershipType,IsManaged,PrimaryNameAttribute"),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='aigw_actualmanagement')/Attributes?$select=LogicalName,AttributeType,IsValidForCreate,IsValidForUpdate,RequiredLevel"),
    get("/api/data/v9.2/RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata?$select=SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,CascadeConfiguration&$filter=SchemaName eq 'aigw_opportunity_actualmanagement'"),
    get(`/api/data/v9.2/${entitySets.opportunityEntitySetName}?$select=opportunityid,name,_transactioncurrencyid_value&$filter=contains(name,'AI-DEMO')&$orderby=name asc&$top=5000`),
    get(`/api/data/v9.2/${entitySets.actualManagementEntitySetName}?$select=aigw_actualmanagementid,aigw_name,_aigw_opportunityid_value,_transactioncurrencyid_value,aigw_expectedorderdate,${MONEY_FIELDS.join(",")}&$top=5000`),
  ]);
  return { entity, attributes: attributes.value || [], relationship: relationships.value?.[0], opportunities: (opportunities.value || []).filter((row) => row.name?.startsWith("[AI-DEMO]")).map((row) => ({ ...row, transactioncurrencyid: row._transactioncurrencyid_value })), actuals: actuals.value || [] };
}

function validateState(state) {
  const names = new Map(state.attributes.map((item) => [item.LogicalName, item]));
  const missingFields = TARGET_FIELDS.filter((field) => !names.has(field));
  const notWritable = TARGET_FIELDS.filter((field) => field !== "aigw_name" && names.has(field) && names.get(field).IsValidForCreate === false);
  const relationshipValid = state.relationship?.ReferencedEntity === "opportunity" && state.relationship?.ReferencingEntity === "aigw_actualmanagement" && state.relationship?.ReferencingAttribute === "aigw_opportunityid";
  return {
    entityValid: state.entity.LogicalName === "aigw_actualmanagement" && state.entity.OwnershipType === "OrganizationOwned" && state.entity.IsManaged === false,
    opportunityCount: state.opportunities.length,
    actualRecordCount: state.actuals.length,
    missingFields,
    notWritable,
    relationshipValid,
    currencyResolved: state.opportunities.every((row) => Boolean(row.transactioncurrencyid)),
  };
}

export async function main() {
  URL = getDataverseUrl();
  assertDataverseScriptGate({ mode: "write-capable" });
  const root = process.cwd();
  const confirmAt = process.argv.indexOf("--confirm");
  const confirmed = confirmAt >= 0 && process.argv[confirmAt + 1] === AUTH;
  const client = createDynamicsClient();
  if (client.config.dataverseUrl !== URL) throw new Error("Dataverse URL safety gate failed");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("AI safety gate failed");
  const get = async (uri) => (await client.dataverseGet(uri)).body;
  const bindings = await resolveActualManagementBindings(get);
  const state = await readState(client, {
    opportunityEntitySetName: bindings.opportunity.entitySetName,
    actualManagementEntitySetName: bindings.actualManagement.entitySetName,
  });
  const checks = validateState(state);
  if (!checks.entityValid || checks.opportunityCount !== 100 || checks.missingFields.length || checks.notWritable.length || !checks.relationshipValid || !checks.currencyResolved) throw new Error(`Preflight blocked: ${JSON.stringify(checks)}`);
  const opportunities = [...state.opportunities].sort((a, b) => a.opportunityid.localeCompare(b.opportunityid));
  const plans = opportunities.map((opportunity, index) => buildSyntheticActual(opportunity, index, bindings));
  if (!plans.every((plan) => plan.validation.valid)) throw new Error("Synthetic financial invariant failed");
  const reconciliation = reconcileSyntheticActuals(plans, state.actuals);
  if (reconciliation.conflicts.length) throw new Error(`Existing record conflict: ${JSON.stringify(reconciliation.conflicts)}`);
  const manifest = {
    phase: "1C-5",
    dryRun: !confirmed,
    targetEnvironment: URL,
    solution: "CRMAIGatewayDemo",
    table: "aigw_actualmanagement",
    entitySet: state.entity.EntitySetName,
    generatedAt: new Date().toISOString(),
    safety: { aiProvider: "demo", allowExternalAi: false, opportunityScope: "[AI-DEMO] only", opportunityMutation: false, externalAiDataSent: false },
    currentState: checks,
    metadataBindings: {
      opportunityEntitySetName: bindings.opportunity.entitySetName,
      actualManagementEntitySetName: bindings.actualManagement.entitySetName,
      opportunityLookupAttribute: bindings.actualManagement.opportunityLookup.lookupAttributeLogicalName,
      opportunityNavigationProperty: bindings.actualManagement.opportunityLookup.navigationPropertyName,
      opportunityBindKey: `${bindings.actualManagement.opportunityLookup.navigationPropertyName}@odata.bind`,
      transactionCurrencyNavigationProperty: bindings.actualManagement.transactionCurrencyLookup.navigationPropertyName,
      transactionCurrencyBindKey: `${bindings.actualManagement.transactionCurrencyLookup.navigationPropertyName}@odata.bind`,
    },
    reconciliation: { alreadyExistsAndValidCount: reconciliation.alreadyExistsAndValid.length, missingCount: reconciliation.missing.length, conflictCount: 0 },
    currency: { strategy: "Each Actual Management record inherits its related Opportunity transactioncurrencyid", distribution: Object.entries(opportunities.reduce((acc, row) => { acc[row.transactioncurrencyid] = (acc[row.transactioncurrencyid] || 0) + 1; return acc; }, {})).map(([transactionCurrencyId, count]) => ({ transactionCurrencyId, count })), baseFieldsWritten: false, mismatchPolicy: "conflict" },
    requests: plans.map((plan) => ({ semanticKey: plan.semanticKey, opportunityId: plan.opportunityId, syntheticName: plan.syntheticName, method: "POST", endpoint: `/api/data/v9.2/${bindings.actualManagement.entitySetName}`, payload: plan.payload, validation: plan.validation })),
    rollback: { mode: "delete-created-record-ids-only", automatic: false, requiresSeparateAuthorization: true, warning: "Delete only IDs recorded by this execution. Never delete by broad name filter." },
    blocked: true,
    blockedReasons: ["Synchronous Actual Totals plugin is not deployed and verified", "One-Actual-record-per-Opportunity plugin guard is not deployed and verified"],
    pluginDeploymentVerified: false,
    singleRecordConstraintVerified: false,
    annualRevenuePolicy: "Monthly Revenue fields are source data. aigw_annualactualrevenue must be generated by the synchronous plugin and is not present in seed payloads.",
    executionPolicy: { idempotencyKey: "Opportunity lookup + syntheticName semantic key", alreadyValid: "skip", conflict: "stop before writes", postError: "poll by Opportunity lookup and synthetic name up to 8 times at 1.5 seconds; never retry POST in the same run", verifyAfterEveryCreate: true },
    expectedPosts: reconciliation.missing.length,
  };
  const manifestPath = path.join(root, MANIFEST);
  if (!confirmed) {
    const dir = path.join(root, "backups", "dataverse", `phase1c5_synthetic_actuals_dry_run_${stamp()}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    await fs.writeFile(path.join(root, "docs", "d365", "phase1c-5-demo-records-manifest.json"), JSON.stringify({ phase: "1C-5", supersededBy: MANIFEST, authorizationPhrase: AUTH, plannedCount: plans.length, writeExecuted: false }, null, 2));
    await fs.writeFile(path.join(dir, "01_current_state.json"), JSON.stringify({ ...checks, actualRecordIds: state.actuals.map((row) => row.aigw_actualmanagementid) }, null, 2));
    await fs.writeFile(path.join(dir, "02_opportunity_actual_mapping.json"), JSON.stringify(plans.map(({ opportunityId, syntheticName, semanticKey }) => ({ opportunityId, syntheticName, semanticKey })), null, 2));
    await fs.writeFile(path.join(dir, "03_rollback_manifest.json"), JSON.stringify({ createdRecordIds: [], plannedNames: plans.map((plan) => plan.syntheticName), automatic: false, requiresSeparateAuthorization: true }, null, 2));
    console.log(JSON.stringify({ mode: "dry-run", directory: dir, manifest: manifestPath, checks, reconciliation: manifest.reconciliation, expectedPosts: manifest.expectedPosts }, null, 2));
    return;
  }
  const saved = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (saved.blocked || saved.pluginDeploymentVerified !== true || saved.singleRecordConstraintVerified !== true) throw new Error("Phase 1C-5 is blocked until the synchronous totals plugin and one-record-per-Opportunity guard are deployed and verified");
  if (saved.requests.length !== 100) throw new Error("Saved manifest does not contain exactly 100 plans");
  const drift = saved.requests.some((request, index) => request.opportunityId !== plans[index].opportunityId || JSON.stringify(request.payload) !== JSON.stringify(plans[index].payload));
  if (drift) throw new Error("Manifest drift detected; no writes performed");
  const executionDir = path.join(root, "backups", "dataverse", `phase1c5_synthetic_actuals_execute_${stamp()}`);
  await fs.mkdir(executionDir, { recursive: true });
  const log = { created: [], createdAfterPostError: [], skippedAlreadyValid: reconciliation.alreadyExistsAndValid.map((plan) => plan.syntheticName), failed: [], unexecuted: [], writeStartedAt: new Date().toISOString() };
  for (let index = 0; index < reconciliation.missing.length; index += 1) {
    const plan = reconciliation.missing[index];
    let response;
    let postError;
    try { response = await client.dataversePost(`/api/data/v9.2/${bindings.actualManagement.entitySetName}`, plan.payload); } catch (error) { postError = error; }
    let found;
    for (let attempt = 0; attempt < 8 && !found; attempt += 1) {
      if (attempt) await sleep(1500);
      const name = escapeOData(plan.syntheticName);
      const rows = (await client.dataverseGet(`/api/data/v9.2/${bindings.actualManagement.entitySetName}?$select=aigw_actualmanagementid,aigw_name,_aigw_opportunityid_value,_transactioncurrencyid_value,aigw_expectedorderdate,${MONEY_FIELDS.join(",")}&$filter=_aigw_opportunityid_value eq ${plan.opportunityId} and aigw_name eq '${name}'`)).body.value || [];
      if (rows.length === 1 && reconcileSyntheticActuals([plan], rows).alreadyExistsAndValid.length === 1) found = rows[0];
      else if (rows.length > 0) throw new Error(`Created row mismatch for ${plan.syntheticName}`);
    }
    if (!found) {
      log.failed.push({ syntheticName: plan.syntheticName, reason: postError?.message || "Created record was not readable" });
      log.unexecuted.push(...reconciliation.missing.slice(index + 1).map((item) => item.syntheticName));
      break;
    }
    const entry = { syntheticName: plan.syntheticName, recordId: found.aigw_actualmanagementid, responseStatus: response?.status || null };
    (postError ? log.createdAfterPostError : log.created).push(entry);
  }
  await fs.writeFile(path.join(executionDir, "01_execution_log.json"), JSON.stringify(log, null, 2));
  await fs.writeFile(path.join(executionDir, "02_rollback_manifest.json"), JSON.stringify({ recordIds: [...log.created, ...log.createdAfterPostError].map((item) => item.recordId), automatic: false, requiresSeparateAuthorization: true }, null, 2));
  console.log(JSON.stringify({ mode: "confirm", executionDir, log }, null, 2));
}


runDataverseCli(import.meta.url, main);
