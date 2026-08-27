import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION = "CRMAIGatewayDemo";
const MAPPING_PATH = "local-artifacts/d365/docs/d365/status-reason-mapping.json";
const STATUS_PATH = "/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='statuscode')/Microsoft.Dynamics.CRM.StatusAttributeMetadata?$select=LogicalName,AttributeType&$expand=OptionSet($select=Options)";
const DEFINITIONS = [
  { semanticKey: "rfq_received", sourceValue: 100000001, labels: { "1033": "RFQ Received", "2052": "已收到询盘及报价请求（RFQ）" } },
  { semanticKey: "proposal_quoted", sourceValue: 100000002, labels: { "1033": "Proposal / Quoted", "2052": "提案 / 已报价" } },
];

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const sha = (value) => createHash("sha256").update(String(value || "")).digest("hex");
const labelMap = (option) => Object.fromEntries((option.Label?.LocalizedLabels || []).map((item) => [String(item.LanguageCode), item.Label]));
const getOptions = async (client) => ((await client.dataverseGet(STATUS_PATH)).body.OptionSet?.Options || []).map((option) => ({ value: Number(option.Value), stateCode: Number(option.State), labels: labelMap(option), transitionData: option.TransitionData || null }));
const outputLabel = (labels) => ({
  "@odata.type": "Microsoft.Dynamics.CRM.Label",
  LocalizedLabels: Object.entries(labels).map(([languageCode, text]) => ({
    "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: text, LanguageCode: Number(languageCode), IsManaged: false,
  })),
  UserLocalizedLabel: { "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: labels["1033"], LanguageCode: 1033, IsManaged: false },
});
const payloadFor = (definition) => ({
  EntityLogicalName: "opportunity",
  AttributeLogicalName: "statuscode",
  StateCode: 0,
  Label: outputLabel(definition.labels),
  SolutionUniqueName: SOLUTION,
});
export function reconcileStatusSemantics(options, existingMapping = null, definitions = DEFINITIONS) {
  if (options.some((option) => option.transitionData)) throw new Error("Status transition metadata is enabled; M1 must stop before insert.");
  if (options.find((option) => option.value === 1)?.labels["1033"] !== "In Progress" || options.find((option) => option.value === 2)?.labels["1033"] !== "On Hold") throw new Error("Standard 1/2 English labels differ from the protected baseline.");
  const mapping = existingMapping?.opportunity?.statuscode || {};
  const results = definitions.map((definition) => {
    const exact = options.filter((option) => option.labels["1033"] === definition.labels["1033"] && option.labels["2052"] === definition.labels["2052"]);
    const partial = options.filter((option) => option.labels["1033"] === definition.labels["1033"] || option.labels["2052"] === definition.labels["2052"]);
    if (exact.length > 1) throw new Error(`Semantic ${definition.semanticKey} matches multiple status values.`);
    if (partial.length > exact.length) throw new Error(`Semantic ${definition.semanticKey} has a conflicting 1033 or 2052 label.`);
    const expected = mapping[definition.semanticKey];
    if (expected && (expected.stateCode !== 0 || expected.labels?.["1033"] !== definition.labels["1033"] || expected.labels?.["2052"] !== definition.labels["2052"])) throw new Error(`Mapping file conflicts with the fixed definition for ${definition.semanticKey}.`);
    if (!exact.length) {
      if (expected) throw new Error(`Mapping file points to missing status value for ${definition.semanticKey}.`);
      return { definition, state: "missing", targetValue: null };
    }
    const option = exact[0];
    if (option.stateCode !== 0) throw new Error(`Semantic ${definition.semanticKey} is not assigned to statecode=0.`);
    if (expected && expected.targetValue !== option.value) throw new Error(`Mapping file target value differs from metadata for ${definition.semanticKey}.`);
    return { definition, state: "alreadyExistsAndValid", targetValue: option.value };
  });
  if (new Set(results.filter((result) => result.targetValue !== null).map((result) => result.targetValue)).size !== results.filter((result) => result.targetValue !== null).length) throw new Error("Two semantic keys resolve to the same target value.");
  return results;
}
export function mappingFromReconciliation(reconciliation) {
  if (reconciliation.some((result) => result.state !== "alreadyExistsAndValid" || !Number.isInteger(result.targetValue))) throw new Error("Cannot write mapping until every semantic key is present and valid.");
  return { opportunity: { statuscode: Object.fromEntries(reconciliation.map(({ definition, targetValue }) => [definition.semanticKey, { sourceValue: definition.sourceValue, targetValue, stateCode: 0, labels: definition.labels }])) } };
}
function validateBefore(options, mapping) {
  return reconcileStatusSemantics(options, mapping);
}
function verifyInserted(options, returnedValues, missingDefinitions) {
  if (new Set(returnedValues).size !== returnedValues.length) throw new Error("Both semantic keys returned the same target value.");
  const reconciliation = reconcileStatusSemantics(options, null);
  for (const definition of missingDefinitions) {
    const found = reconciliation.find((result) => result.definition.semanticKey === definition.semanticKey);
    if (!found || found.targetValue !== returnedValues[missingDefinitions.indexOf(definition)]) throw new Error(`Returned target value does not match metadata for ${definition.semanticKey}.`);
  }
  return reconciliation;
}
async function readMapping(root) {
  try { return JSON.parse(await fs.readFile(path.join(root, MAPPING_PATH), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function main() {
  EXPECTED_URL = getDataverseUrl();
  assertDataverseScriptGate({ mode: "write-capable" });
  const confirm = process.argv.includes("--confirm");
  const preflightArg = process.argv.indexOf("--preflight");
  const suppliedPreflight = preflightArg >= 0 ? process.argv[preflightArg + 1] : "";
  const root = process.cwd();
  const client = createDynamicsClient();
  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: unexpected Dataverse URL");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: AI provider must remain demo and external AI disabled");
  const solution = (await client.dataverseGet(`/api/data/v9.2/solutions?$select=solutionid,friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`)).body.value?.[0];
  if (!solution || solution.ismanaged !== false || solution.friendlyname !== "CRM AI Gateway Demo") throw new Error("Safety gate failed: unmanaged target solution not confirmed");
  const publisher = (await client.dataverseGet(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix,customizationoptionvalueprefix`)).body;
  if (publisher.customizationprefix !== "aigw") throw new Error("Safety gate failed: publisher prefix is not aigw");
  const before = await getOptions(client); const existingMapping = await readMapping(root); const reconciliation = validateBefore(before, existingMapping);
  const dir = suppliedPreflight ? path.dirname(path.resolve(suppliedPreflight)) : path.join(root, "backups", "dataverse", `phase1b_m1_status_${stamp()}`);
  const preflightPath = suppliedPreflight ? path.resolve(suppliedPreflight) : path.join(dir, "01_preflight.json");
  await fs.mkdir(dir, { recursive: true });
  const missing = reconciliation.filter((result) => result.state === "missing").map((result) => result.definition);
  const preflight = { dryRun: true, endpoint: "/api/data/v9.2/InsertStatusValue", solution: SOLUTION, publisherOptionValuePrefix: publisher.customizationoptionvalueprefix, beforeHash: sha(JSON.stringify(before)), mappingHash: sha(JSON.stringify(existingMapping || {})), currentOptions: before, reconciliation: reconciliation.map((result) => ({ semanticKey: result.definition.semanticKey, state: result.state, targetValue: result.targetValue })), protectedStandardValues: [1, 2], transitionsEnabled: false, inserts: missing.map((definition) => ({ semanticKey: definition.semanticKey, payload: payloadFor(definition) })), noPublish: true, noDataChange: true };
  if (!confirm) {
    await Promise.all([fs.writeFile(path.join(dir, "00_status_metadata_before.json"), JSON.stringify(before, null, 2)), fs.writeFile(preflightPath, JSON.stringify(preflight, null, 2))]);
    console.log(JSON.stringify(preflight, null, 2));
    return;
  }
  const stored = JSON.parse(await fs.readFile(preflightPath, "utf8"));
  if (stored.beforeHash !== preflight.beforeHash || stored.mappingHash !== preflight.mappingHash) throw new Error("Status metadata or mapping changed since dry-run; no insert executed.");
  const returned = [];
  try {
    for (const definition of missing) {
      const response = await client.dataversePost("/api/data/v9.2/InsertStatusValue", payloadFor(definition));
      const newValue = response.body?.NewOptionValue;
      if (!Number.isInteger(newValue)) throw new Error(`InsertStatusValue did not return NewOptionValue for ${definition.semanticKey}.`);
      returned.push(newValue);
    }
    const after = await getOptions(client);
    const afterReconciliation = missing.length ? verifyInserted(after, returned, missing) : reconcileStatusSemantics(after, existingMapping);
    const mapping = mappingFromReconciliation(afterReconciliation);
    await Promise.all([
      fs.mkdir(path.dirname(path.join(root, MAPPING_PATH)), { recursive: true }).then(() => fs.writeFile(path.join(root, MAPPING_PATH), JSON.stringify(mapping, null, 2))),
      fs.writeFile(path.join(dir, "02_status_metadata_after.json"), JSON.stringify(after, null, 2)),
      fs.writeFile(path.join(dir, "03_status_reason_mapping.json"), JSON.stringify(mapping, null, 2)),
      fs.writeFile(path.join(dir, "04_result.json"), JSON.stringify({ returned, mapping, publishExecuted: false, dataChanged: false, rollback: "Do not delete automatically. Any DeleteStatusValue requires separate authorization." }, null, 2)),
    ]);
    console.log(JSON.stringify({ returned, mappingPath: MAPPING_PATH, publishExecuted: false, dataChanged: false }, null, 2));
  } catch (error) {
    await fs.writeFile(path.join(dir, "04_partial_or_failed.json"), JSON.stringify({ returned, error: error.message, publishExecuted: false, dataChanged: false, rollback: "No automatic DeleteStatusValue. Separate authorization is required for any rollback." }, null, 2));
    throw error;
  }
}


runDataverseCli(import.meta.url, main);
