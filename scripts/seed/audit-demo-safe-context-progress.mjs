#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { mapDynamicsOpportunity } from "../../server/dynamicsMapper.mjs";
import { buildSafeOpportunityContext } from "../../server/fieldMapping/safeTransforms.mjs";

export async function main(argv = process.argv.slice(2), { client = createDynamicsClient(), now = new Date() } = {}) {
  const args = parseArgs(argv);
  const rows = await listDemoRows(client);
  const audit = buildSafeContextProgressAudit(rows, { now });
  const logPath = await writeAuditLog({ createdAt: new Date().toISOString(), ...audit });
  const output = args.details ? { ...audit, logPath } : {
    totalDemoCount: audit.totalDemoCount,
    dataverseDescriptionFilledCount: audit.dataverseDescriptionFilledCount,
    dataverseProgressFilledCount: audit.dataverseProgressFilledCount,
    mappedDescriptionFilledCount: audit.mappedDescriptionFilledCount,
    mappedProgressFilledCount: audit.mappedProgressFilledCount,
    safeDescriptionFilledCount: audit.safeDescriptionFilledCount,
    safeProgressFilledCount: audit.safeProgressFilledCount,
    missingSafeProgressCount: audit.missingSafeProgressCount,
    logPath,
  };
  console.log(JSON.stringify(output, null, 2));
  return { audit, logPath, output };
}

export async function listDemoRows(client) {
  if (typeof client.listDynamicsOpportunityScope === "function") {
    return (await client.listDynamicsOpportunityScope()).rows || [];
  }
  return client.listDynamicsOpportunities();
}

export function buildSafeContextProgressAudit(rows = [], { now = new Date() } = {}) {
  const records = (Array.isArray(rows) ? rows : []).map((row, index) => {
    const mapped = mapDynamicsOpportunity(row, index, now);
    const safe = buildSafeOpportunityContext(mapped, { now }).safeOpportunityContext;
    const mappedDescription = mapped.description || mapped.sanitizedDescription;
    const mappedProgressSummary = mapped.progressSummary || mapped.sanitizedProgressSummary;
    return {
      name: row.name || "",
      opportunityid: row.opportunityid || "",
      hasDataverseDescription: hasText(row.description),
      hasDataverseProgressSummary: hasText(row.aigw_progresssummary),
      hasMappedDescription: hasText(mappedDescription),
      hasMappedProgressSummary: hasText(mappedProgressSummary),
      hasSafeDescription: hasText(safe.sanitizedDescription),
      hasSafeProgressSummary: hasText(safe.sanitizedProgressSummary),
      sanitizedDescriptionLength: textLength(safe.sanitizedDescription),
      sanitizedProgressSummaryLength: textLength(safe.sanitizedProgressSummary),
    };
  });

  return {
    totalDemoCount: records.length,
    dataverseDescriptionFilledCount: records.filter((item) => item.hasDataverseDescription).length,
    dataverseProgressFilledCount: records.filter((item) => item.hasDataverseProgressSummary).length,
    mappedDescriptionFilledCount: records.filter((item) => item.hasMappedDescription).length,
    mappedProgressFilledCount: records.filter((item) => item.hasMappedProgressSummary).length,
    safeDescriptionFilledCount: records.filter((item) => item.hasSafeDescription).length,
    safeProgressFilledCount: records.filter((item) => item.hasSafeProgressSummary).length,
    missingSafeProgressCount: records.filter((item) => !item.hasSafeProgressSummary).length,
    records,
  };
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
  const file = path.join(dir, `audit-demo-safe-context-progress-${timestamp}.json`);
  await writeFile(file, `${JSON.stringify(audit, null, 2)}\n`);
  return file;
}

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function textLength(value) {
  return String(value || "").trim().length;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
