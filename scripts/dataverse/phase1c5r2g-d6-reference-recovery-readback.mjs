import fs from "node:fs/promises";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { D6_FULL_IMPORT } from "./lib/d6-full-import-contract.mjs";
import { assertDataverseScriptGate, runDataverseCli } from "./lib/environment-safety.mjs";

const ROOT = new URL("../../", import.meta.url);
const TEST_HOST = D6_FULL_IMPORT.expectedHost;
const PRODUCTION_HOST = D6_FULL_IMPORT.productionHost;
export async function main() {
const { dataverseUrl } = assertDataverseScriptGate({ mode: "read-only" });
const host = new URL(dataverseUrl).hostname;

if (host !== TEST_HOST || host === PRODUCTION_HOST) throw new Error(`Blocked hostname: ${host}`);
if (String(process.env.AI_PROVIDER || "demo").toLowerCase() !== "demo") throw new Error("AI_PROVIDER must remain demo");
if (String(process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() === "true") throw new Error("External AI is forbidden");

const [workbook, preflight] = await Promise.all([
  fs.readFile(new URL("local-artifacts/d365/d6-workbook-data-private.json", ROOT), "utf8").then(JSON.parse),
  fs.readFile(new URL("local-artifacts/d365/d365-ai-demo-200-d5-preflight-private.json", ROOT), "utf8").then(JSON.parse),
]);
if (preflight.host !== host) throw new Error("Frozen preflight hostname mismatch");

const client = createDynamicsClient({ env: { ...process.env, DATAVERSE_TIMEOUT_MS: "60000" } });
const requestCounts = { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, ProductionRequests: 0 };

async function get(path) {
  if (/^https?:/i.test(path) && new URL(path).hostname !== TEST_HOST) {
    requestCounts.ProductionRequests += 1;
    throw new Error(`Blocked absolute GET host: ${new URL(path).hostname}`);
  }
  requestCounts.GET += 1;
  return (await client.dataverseGet(path)).body;
}

async function all(path) {
  const values = [];
  let next = path;
  while (next) {
    const body = await get(next);
    values.push(...(body.value || []));
    next = body["@odata.nextLink"]?.replace(dataverseUrl, "") || null;
  }
  return values;
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, [...(groups.get(key) || []), value]);
  }
  return groups;
}

const entitySet = (logicalName) => preflight.metadata[logicalName].definition.EntitySetName;
const opportunities = workbook.formal.Opportunity;
const locationNames = [...new Set(opportunities.map((row) => String(row.aigw_opportunitylocation_token || "")))].sort();
const polpodFields = ["aigw_sealandpodlookup_token", "aigw_sealandpollookup_token", "aigw_airpodlookup_token", "aigw_airpollookup_token"];
const polpodKeys = [...new Set(opportunities.flatMap((row) => polpodFields.map((field) => String(row[field] || ""))))].sort();
if (locationNames.includes("") || polpodKeys.includes("")) throw new Error("Formal reference token is empty");

await get("/api/data/v9.2/WhoAmI()");
const locations = await all(`/api/data/v9.2/${entitySet("aigw_location")}?$select=aigw_locationid,aigw_name,statecode&$filter=statecode eq 0`);
const polpods = await all(`/api/data/v9.2/${entitySet("aigw_polpodlocation")}?$select=aigw_polpodlocationid,aigw_keycode,statecode&$filter=statecode eq 0`);
const locationsByName = groupBy(locations, (row) => String(row.aigw_name || ""));
const polpodsByKey = groupBy(polpods, (row) => String(row.aigw_keycode || ""));
const locationResults = locationNames.map((name) => ({ name, count: locationsByName.get(name)?.length || 0 }));
const polpodResults = polpodKeys.map((key) => ({ key, count: polpodsByKey.get(key)?.length || 0 }));
const missingLocations = locationResults.filter((row) => row.count === 0);
const duplicateLocations = locationResults.filter((row) => row.count > 1);
const missingPolpods = polpodResults.filter((row) => row.count === 0);
const duplicatePolpods = polpodResults.filter((row) => row.count > 1);
const ready = missingLocations.length === 0 && duplicateLocations.length === 0 && missingPolpods.length === 0 && duplicatePolpods.length === 0;

const privateResult = {
  phase: `${D6_FULL_IMPORT.phase}-REFERENCE-RECOVERY`,
  host,
  capturedAt: new Date().toISOString(),
  ready,
  required: {
    locations: locationNames.map((name) => ({ name, exactId: locationsByName.get(name)?.[0]?.aigw_locationid || null })),
    polpods: polpodKeys.map((key) => ({ key, exactId: polpodsByKey.get(key)?.[0]?.aigw_polpodlocationid || null })),
  },
  requestCounts,
};
const publicResult = {
  phase: privateResult.phase,
  environmentAlias: "TEST-ORG",
  capturedAt: privateResult.capturedAt,
  ready,
  requiredLocationCount: locationNames.length,
  activeLocationMasterCount: locations.length,
  requiredPolpodCount: polpodKeys.length,
  activePolpodMasterCount: polpods.length,
  locationResults,
  polpodResults,
  suzhouResolvedExactlyOnce: locationResults.some((row) => row.name === "29: Suzhou" && row.count === 1),
  missingLocationCount: missingLocations.length,
  duplicateLocationCount: duplicateLocations.length,
  missingPolpodCount: missingPolpods.length,
  duplicatePolpodCount: duplicatePolpods.length,
  requestCounts,
};

await fs.writeFile(new URL("local-artifacts/d365/d6-reference-recovery-readback-private.json", ROOT), `${JSON.stringify(privateResult, null, 2)}\n`);
await fs.writeFile(new URL("local-artifacts/d365/d6-reference-recovery-readback-public.json", ROOT), `${JSON.stringify(publicResult, null, 2)}\n`);
console.log(JSON.stringify(publicResult, null, 2));
if (!ready) process.exitCode = 2;
}

runDataverseCli(import.meta.url, main);
