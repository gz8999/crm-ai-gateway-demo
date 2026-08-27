#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { buildProgressAudit, listDemoProgressRecords } from "./patch-demo-opportunity-progress.mjs";

export async function main(argv = process.argv.slice(2), { client = createDynamicsClient() } = {}) {
  const args = parseArgs(argv);
  const records = await listDemoProgressRecords(client);
  const audit = buildProgressAudit(records);
  const logPath = await writeAuditLog({ createdAt: new Date().toISOString(), ...audit });
  const output = args.details ? { ...audit, logPath } : {
    totalDemoCount: audit.totalDemoCount,
    descriptionFilledCount: audit.descriptionFilledCount,
    progressSummaryFilledCount: audit.progressSummaryFilledCount,
    bothFilledCount: audit.bothFilledCount,
    missingDescriptionCount: audit.missingDescriptionCount,
    missingProgressSummaryCount: audit.missingProgressSummaryCount,
    missingEitherCount: audit.missingEitherCount,
    logPath,
  };
  console.log(JSON.stringify(output, null, 2));
  return { audit, logPath, output };
}

function parseArgs(argv) {
  const args = { details: false };
  for (const arg of argv) {
    if (arg === "--details") args.details = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function writeAuditLog(audit) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const dir = path.resolve("backups/seed");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `audit-demo-opportunity-progress-${timestamp}.json`);
  await writeFile(file, `${JSON.stringify(audit, null, 2)}\n`);
  return file;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
