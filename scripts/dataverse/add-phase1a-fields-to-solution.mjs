import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION_UNIQUE_NAME = "CRMAIGatewayDemo";
const SOLUTION_FRIENDLY_NAME = "CRM AI Gateway Demo";
const PUBLISHER_PREFIX = "aigw";
const client = createDynamicsClient();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const get = async (url) => (await client.dataverseGet(url)).body;

export async function main() {
  EXPECTED_URL = getDataverseUrl();
  assertDataverseScriptGate({ mode: "write-capable" });
  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: unexpected Dataverse URL");
  if ((process.env.AI_PROVIDER || "demo") !== "demo") throw new Error("Safety gate failed: AI_PROVIDER must be demo");
  if ((process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: ALLOW_EXTERNAL_AI must be false");
  const solutions = await get(`/api/data/v9.2/solutions?$select=solutionid,friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION_UNIQUE_NAME}'`);
  const solution = solutions.value?.[0];
  if (!solution || solution.ismanaged !== false || solution.friendlyname !== SOLUTION_FRIENDLY_NAME) throw new Error("Safety gate failed: unmanaged solution not confirmed");
  const publishers = await get(`/api/data/v9.2/publishers?$select=publisherid,customizationprefix&$filter=publisherid eq ${solution._publisherid_value}`);
  if (publishers.value?.[0]?.customizationprefix !== PUBLISHER_PREFIX) throw new Error("Safety gate failed: publisher prefix is not aigw");
  const dirs = (await fs.readdir(path.join(process.cwd(), "backups", "dataverse")))
    .filter((name) => /^phase1a_full_\d{8}T\d{6}Z$/.test(name)).sort();
  const latest = dirs.at(-1);
  if (!latest) throw new Error("No Phase 1A-FULL backup found");
  const root = path.join(process.cwd(), "backups", "dataverse");
  const created = new Map();
  for (const dir of dirs) {
    const file = path.join(root, dir, "10_field_creation_results.json");
    try {
      const rows = JSON.parse(await fs.readFile(file, "utf8"));
      for (const row of rows) if (row.status === "created") created.set(row.logicalName, row);
    } catch { /* older interrupted run */ }
  }
  const results = [];
  for (const [logicalName, source] of created) {
    const metadata = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='${logicalName}')?$select=MetadataId,LogicalName,AttributeType`);
    const metadataId = metadata.MetadataId;
    try {
      await client.dataversePost("/api/data/v9.2/AddSolutionComponent", { ComponentId: metadataId, ComponentType: 2, SolutionUniqueName: SOLUTION_UNIQUE_NAME, AddRequiredComponents: false });
      results.push({ logicalName, metadataId, status: "added", sourceRun: source });
    } catch (error) {
      results.push({ logicalName, metadataId, status: "failed", error: error.message, sourceRun: source });
    }
    await sleep(2500);
  }
  const output = { timestamp: new Date().toISOString(), solution: SOLUTION_UNIQUE_NAME, publisherPrefix: PUBLISHER_PREFIX, fieldsConsidered: created.size, added: results.filter((row) => row.status === "added").length, failed: results.filter((row) => row.status === "failed").length, results };
  await fs.writeFile(path.join(root, latest, "16_solution_component_results.json"), JSON.stringify(output, null, 2), "utf8");
  console.log(JSON.stringify({ backupDir: path.join("backups", "dataverse", latest), ...output, results: results.map(({ logicalName, metadataId, status, error }) => ({ logicalName, metadataId, status, error })) }, null, 2));
}


runDataverseCli(import.meta.url, main);
