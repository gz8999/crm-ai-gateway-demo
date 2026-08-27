#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const created = await readCreatedFile(args.createdFile);
  const client = createDynamicsClient();
  const results = { dryRun: !args.confirm, ok: [], skipped: [], failed: [], createdFile: args.createdFile };

  for (const item of created) {
    const id = item.opportunityId;
    if (!id) {
      results.skipped.push({ id, reason: "missing opportunityId in created IDs file" });
      continue;
    }
    try {
      const current = await getOpportunity(client, id);
      if (!current) {
        results.skipped.push({ id, reason: "record not found" });
        continue;
      }
      if (!String(current.name || "").startsWith("[AI-DEMO]")) {
        results.skipped.push({ id, name: current.name, reason: "name does not start with [AI-DEMO]" });
        continue;
      }
      if (args.confirm) await client.dataverseDelete(`/api/data/v9.2/opportunities(${id})`);
      results.ok.push({ id, name: current.name, mode: args.confirm ? "deleted" : "dry-run" });
    } catch (error) {
      results.failed.push({ id, reason: error.message });
    }
  }

  console.log(JSON.stringify({
    dryRun: results.dryRun,
    deletedOrWouldDeleteCount: results.ok.length,
    skippedCount: results.skipped.length,
    failureCount: results.failed.length,
    deletedOrWouldDelete: results.ok,
    skipped: results.skipped,
    failures: results.failed,
  }, null, 2));
}

function parseArgs(argv) {
  const args = { confirm: false, createdFile: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--confirm") args.confirm = true;
    else if (arg === "--created-file") args.createdFile = argv[++index] || "";
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.createdFile) throw new Error("Pass --created-file <created IDs json>.");
  return args;
}

async function readCreatedFile(filePath) {
  const data = JSON.parse(await readFile(filePath, "utf8"));
  const created = Array.isArray(data) ? data : data.created;
  if (!Array.isArray(created)) throw new Error("Created IDs file must be an array or contain a created array.");
  return created;
}

async function getOpportunity(client, id) {
  try {
    const { body } = await client.dataverseGet(`/api/data/v9.2/opportunities(${id})?$select=opportunityid,name`);
    return body;
  } catch (error) {
    if (/does not exist|not found|404/i.test(error.message)) return null;
    throw error;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
