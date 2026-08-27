import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION = "CRMAIGatewayDemo";
const FIELDS = ["aigw_globalinitiative", "aigw_alpscooperation", "aigw_sealandpol", "aigw_sealandpod", "aigw_airpol", "aigw_airpod"];
const SCENARIOS = [
  { place: "East China Demo", seaPol: "Demo Harbor Alpha", seaPod: "Demo Harbor Delta", airPol: "Demo Air Hub Alpha", airPod: "Demo Air Hub Delta" },
  { place: "North China Demo", seaPol: "Demo Harbor Bravo", seaPod: "Demo Harbor Echo", airPol: "Demo Air Hub Bravo", airPod: "Demo Air Hub Echo" },
  { place: "South China Demo", seaPol: "Demo Harbor Charlie", seaPod: "Demo Harbor Foxtrot", airPol: "Demo Air Hub Charlie", airPod: "Demo Air Hub Foxtrot" },
  { place: "West China Demo", seaPol: "Demo Harbor Delta", seaPod: "Demo Harbor Alpha", airPol: "Demo Air Hub Delta", airPod: "Demo Air Hub Alpha" },
];
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const label = (option) => Object.fromEntries((option.Label?.LocalizedLabels || []).map((item) => [String(item.LanguageCode), item.Label]));
const hasValue = (row, field) => Object.hasOwn(row, field) && row[field] !== null;
const isDemoName = (value) => /^\[AI-DEMO\]/.test(String(value || ""));

export async function main() {
  EXPECTED_URL = getDataverseUrl();
  assertDataverseScriptGate({ mode: "write-capable" });
  const confirm = process.argv.includes("--confirm");
  const index = process.argv.indexOf("--preflight");
  const suppliedPreflight = index >= 0 ? process.argv[index + 1] : "";
  const root = process.cwd();
  const client = createDynamicsClient();
  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: unexpected Dataverse URL");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: AI provider must remain demo and external AI disabled");
  const solution = (await client.dataverseGet(`/api/data/v9.2/solutions?$select=friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`)).body.value?.[0];
  if (!solution || solution.friendlyname !== "CRM AI Gateway Demo" || solution.ismanaged !== false) throw new Error("Safety gate failed: target solution is not the expected unmanaged solution");
  const publisher = (await client.dataverseGet(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`)).body;
  if (publisher.customizationprefix !== "aigw") throw new Error("Safety gate failed: publisher prefix is not aigw");

  const [attributes, globalInitiative, alps] = await Promise.all([
    Promise.all(FIELDS.map(async (field) => (await client.dataverseGet(`/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='${field}')?$select=LogicalName,AttributeType`)).body)),
    client.dataverseGet("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='aigw_globalinitiative')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)"),
    client.dataverseGet("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='aigw_alpscooperation')/Microsoft.Dynamics.CRM.BooleanAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=TrueOption,FalseOption)"),
  ]);
  const expectedTypes = { aigw_globalinitiative: "Picklist", aigw_alpscooperation: "Boolean", aigw_sealandpol: "String", aigw_sealandpod: "String", aigw_airpol: "String", aigw_airpod: "String" };
  for (const attribute of attributes) if (attribute.AttributeType !== expectedTypes[attribute.LogicalName]) throw new Error(`Unexpected type for ${attribute.LogicalName}: ${attribute.AttributeType}`);
  const noneOption = (globalInitiative.body.OptionSet?.Options || []).find((option) => /(^|:)\s*(None|无|Others)\s*$/i.test(label(option)["1033"] || "") || /(^|:)\s*(None|无|Others)\s*$/i.test(label(option)["2052"] || ""));
  if (!noneOption) throw new Error("No safe None/无/Others option exists for aigw_globalinitiative; no patch plan generated.");
  if (Number(alps.body.OptionSet?.FalseOption?.Value) !== 0) throw new Error("aigw_alpscooperation false option is not value 0.");
  const fetch = `<fetch><entity name="opportunity"><attribute name="opportunityid" /><attribute name="name" /><attribute name="modifiedon" /><attribute name="statuscode" />${FIELDS.map((field) => `<attribute name="${field}" />`).join("")}<filter><condition attribute="name" operator="like" value="[[]AI-DEMO]%" /></filter><order attribute="name" /></entity></fetch>`;
  const rows = (await client.dataverseGet(`/api/data/v9.2/opportunities?fetchXml=${encodeURIComponent(fetch)}`)).body.value || [];
  if (rows.length !== 100) throw new Error(`Expected exactly 100 [AI-DEMO] opportunities, found ${rows.length}`);
  if (rows.some((row) => !isDemoName(row.name))) throw new Error("Demo filter returned a non-[AI-DEMO] opportunity; no patch plan generated.");
  const plan = rows.map((row, rowIndex) => {
    const scenario = SCENARIOS[rowIndex % SCENARIOS.length];
    const proposed = {
      aigw_globalinitiative: Number(noneOption.Value),
      aigw_alpscooperation: false,
      aigw_sealandpol: scenario.seaPol,
      aigw_sealandpod: scenario.seaPod,
      aigw_airpol: scenario.airPol,
      aigw_airpod: scenario.airPod,
    };
    const before = Object.fromEntries(FIELDS.map((field) => [field, hasValue(row, field) ? row[field] : null]));
    const patch = Object.fromEntries(FIELDS.filter((field) => before[field] === null).map((field) => [field, proposed[field]]));
    return { opportunityid: row.opportunityid, name: row.name, modifiedon: row.modifiedon, statuscode: row.statuscode, before, patch, unchangedFields: FIELDS.filter((field) => before[field] !== null), scenario: scenario.place };
  });
  const counts = Object.fromEntries(FIELDS.map((field) => [field, plan.filter((item) => item.before[field] === null).length]));
  const allPlannedValues = plan.flatMap((item) => Object.values(item.patch));
  if (allPlannedValues.some((value) => typeof value === "string" && !value.includes("Demo"))) throw new Error("Planned text values must remain explicitly synthetic.");
  const currentHash = hash(plan.map(({ opportunityid, name, modifiedon, statuscode, before }) => ({ opportunityid, name, modifiedon, statuscode, before })));
  const dir = suppliedPreflight ? path.dirname(path.resolve(suppliedPreflight)) : path.join(root, "backups", "dataverse", `phase1b_m2a_demo_data_${stamp()}`);
  const preflightPath = suppliedPreflight ? path.resolve(suppliedPreflight) : path.join(dir, "01_dry_run_manifest.json");
  await fs.mkdir(dir, { recursive: true });
  const manifest = { dryRun: !confirm, target: { dataverseUrl: EXPECTED_URL, solution: SOLUTION, entity: "opportunity", nameScope: "[AI-DEMO] only" }, totalDemoCount: rows.length, emptyCountsBefore: counts, syntheticValues: { globalInitiative: { value: Number(noneOption.Value), labels: label(noneOption) }, alpsCooperation: { value: false, labels: label(alps.body.OptionSet?.FalseOption) }, scenarios: SCENARIOS }, records: plan, nonDemoRecordsAffected: 0, preflightHash: currentHash, allowedFields: FIELDS, publishExecuted: false, rollback: { strategy: "Restore only fields listed in each record.patch from that record.before, only after a future explicit authorization and modifiedon concurrency check.", records: plan.filter((item) => Object.keys(item.patch).length).map(({ opportunityid, name, modifiedon, before, patch }) => ({ opportunityid, name, modifiedon, before, fieldsChanged: Object.keys(patch) })) } };
  if (!confirm) {
    await Promise.all([fs.writeFile(path.join(dir, "00_before_records.json"), JSON.stringify(plan.map(({ opportunityid, name, modifiedon, statuscode, before }) => ({ opportunityid, name, modifiedon, statuscode, before })), null, 2)), fs.writeFile(preflightPath, JSON.stringify(manifest, null, 2))]);
    console.log(JSON.stringify({ dryRun: true, manifest: path.relative(root, preflightPath), totalDemoCount: rows.length, emptyCountsBefore: counts, recordsWithChanges: plan.filter((item) => Object.keys(item.patch).length).length, nonDemoRecordsAffected: 0, publishExecuted: false }, null, 2));
    return;
  }
  const stored = JSON.parse(await fs.readFile(preflightPath, "utf8"));
  const snapshot = (items) => items.map(({ opportunityid, name, modifiedon, statuscode, before }) => ({ opportunityid, name, modifiedon, statuscode, before }));
  if (!Array.isArray(stored.records) || JSON.stringify(snapshot(stored.records)) !== JSON.stringify(snapshot(plan))) throw new Error("[AI-DEMO] record IDs, status, modified timestamps, or target values changed since dry-run; no PATCH executed.");
  const changed = plan.filter((item) => Object.keys(item.patch).length);
  const results = []; const failed = [];
  try {
    for (let offset = 0; offset < changed.length; offset += 20) {
      for (const item of changed.slice(offset, offset + 20)) {
        try {
          await client.dataversePatch(`/api/data/v9.2/opportunities(${item.opportunityid})`, item.patch);
          results.push({ opportunityid: item.opportunityid, name: item.name, fieldsChanged: Object.keys(item.patch) });
        } catch (error) {
          failed.push({ opportunityid: item.opportunityid, name: item.name, reason: error.message });
          throw error;
        }
      }
    }
  } catch (error) {
    await fs.writeFile(path.join(dir, "02_partial_or_failed.json"), JSON.stringify({ results, failed, publishExecuted: false, rollback: "Restore only fields listed in the manifest for results, after separate authorization and modifiedon concurrency checks." }, null, 2));
    throw error;
  }
  const afterRows = (await client.dataverseGet(`/api/data/v9.2/opportunities?fetchXml=${encodeURIComponent(fetch)}`)).body.value || [];
  const afterEmpty = Object.fromEntries(FIELDS.map((field) => [field, afterRows.filter((row) => !hasValue(row, field)).length]));
  const afterById = new Map(afterRows.map((row) => [row.opportunityid, row]));
  const rowValidation = plan.map((item) => {
    const after = afterById.get(item.opportunityid);
    const statusUnchanged = after?.statuscode === item.statuscode;
    const plannedValuesMatch = Object.entries(item.patch).every(([field, value]) => after?.[field] === value);
    const existingValuesPreserved = item.unchangedFields.every((field) => after?.[field] === item.before[field]);
    return { opportunityid: item.opportunityid, name: item.name, statusUnchanged, plannedValuesMatch, existingValuesPreserved };
  });
  if (afterRows.length !== 100 || Object.values(afterEmpty).some((count) => count !== 0) || rowValidation.some((item) => !item.statusUnchanged || !item.plannedValuesMatch || !item.existingValuesPreserved)) throw new Error("Post-patch validation failed; do not run additional writes.");
  await fs.writeFile(path.join(dir, "02_patch_result.json"), JSON.stringify({ results, failed, afterEmpty, rowValidation, publishExecuted: false, dataScope: "[AI-DEMO] only" }, null, 2));
  console.log(JSON.stringify({ patched: results.length, skipped: plan.length - results.length, failed: failed.length, fieldCounts: Object.fromEntries(FIELDS.map((field) => [field, results.filter((item) => item.fieldsChanged.includes(field)).length])), afterEmpty, publishExecuted: false }, null, 2));
}


runDataverseCli(import.meta.url, main);
