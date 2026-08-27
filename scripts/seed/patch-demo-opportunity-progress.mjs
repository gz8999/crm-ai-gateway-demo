#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { aiDemoNameFilterValue, createDynamicsClient } from "../../server/dynamicsClient.mjs";

export const PATCH_FIELDS = ["description", "aigw_progresssummary"];

const DEFAULT_INPUTS = [];

const MAX_BATCH_SIZE = 20;
const aiDemoPrefix = "[AI-DEMO]";
const blockedTextPatterns = [
  { label: "email", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { label: "phone", pattern: /(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){10,}/ },
  { label: "detailed address", pattern: /详细地址|detailed_address|street|road|avenue|building/i },
  { label: "exact amount", pattern: /(?:CNY|RMB|USD|JPY|¥|\$)\s?\d[\d,]*(?:\.\d+)?/i },
  { label: "exact amount", pattern: /\d{1,3}(?:,\d{3})+(?:\.\d+)?/ },
  { label: "raw timeline", pattern: /raw[_\s-]?timeline/i },
  { label: "raw email body", pattern: /raw email body|email body/i },
  { label: "raw phone call body", pattern: /raw phone call body|phone call body/i },
  { label: "raw task body", pattern: /raw task body|task body/i },
];

export async function main(argv = process.argv.slice(2), { client = createDynamicsClient() } = {}) {
  const args = parseArgs(argv);
  const inputPath = await resolveInputPath(args.input);
  const inputRecords = await readInputRecords(inputPath);
  const dataverseRecords = await listDemoProgressRecords(client);
  const plan = buildPatchPlan({ dataverseRecords, inputRecords, overwrite: args.overwrite });
  const results = {
    createdAt: new Date().toISOString(),
    dryRun: !args.confirm,
    overwrite: args.overwrite,
    inputPath,
    plan,
    patched: [],
    failed: [],
  };

  if (args.confirm) {
    for (const batch of chunk(plan.patch, MAX_BATCH_SIZE)) {
      await Promise.all(batch.map(async (item) => {
        try {
          await client.dataversePatch(`/api/data/v9.2/opportunities(${item.opportunityId})`, item.payload);
          results.patched.push({
            name: item.name,
            opportunityId: item.opportunityId,
            fields: Object.keys(item.payload),
          });
        } catch (error) {
          results.failed.push({
            name: item.name,
            opportunityId: item.opportunityId,
            reason: error.message,
          });
        }
      }));
    }
  }

  const logPath = await writePatchLog(results);
  const output = summarizePatchResults(results, logPath);
  console.log(JSON.stringify(output, null, 2));
  return { ...results, logPath, output };
}

export function parseArgs(argv) {
  const args = { confirm: false, input: "", overwrite: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--confirm") args.confirm = true;
    else if (arg === "--dry-run") args.confirm = false;
    else if (arg === "--overwrite") args.overwrite = true;
    else if (arg === "--input") args.input = argv[++index] || "";
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

export async function resolveInputPath(input) {
  const candidates = input ? [input] : DEFAULT_INPUTS;
  for (const candidate of candidates) {
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  throw new Error(`Unable to find with_progress input. Tried: ${candidates.join(", ")}`);
}

export async function readInputRecords(inputPath) {
  const data = JSON.parse(await readFile(inputPath, "utf8"));
  const records = Array.isArray(data) ? data : data.records;
  if (!Array.isArray(records)) throw new Error("Input must be an array or an object with a records array.");
  return records;
}

export async function listDemoProgressRecords(client) {
  const fetchXml = `<fetch version="1.0" mapping="logical"><entity name="opportunity"><attribute name="opportunityid" /><attribute name="name" /><attribute name="description" /><attribute name="aigw_progresssummary" /><filter type="and"><condition attribute="name" operator="like" value="${aiDemoNameFilterValue}" /></filter><order attribute="name" /></entity></fetch>`;
  const { body } = await client.dataverseGet(`/api/data/v9.2/opportunities?fetchXml=${encodeURIComponent(fetchXml)}`);
  return Array.isArray(body.value) ? body.value : [];
}

export function buildProgressAudit(records) {
  const source = Array.isArray(records) ? records : [];
  const withDescription = source.filter((item) => hasText(item.description));
  const withProgress = source.filter((item) => hasText(item.aigw_progresssummary));
  const both = source.filter((item) => hasText(item.description) && hasText(item.aigw_progresssummary));
  const missingDescription = source.filter((item) => !hasText(item.description));
  const missingProgress = source.filter((item) => !hasText(item.aigw_progresssummary));
  const missingEither = source.filter((item) => !hasText(item.description) || !hasText(item.aigw_progresssummary));
  return {
    totalDemoCount: source.length,
    descriptionFilledCount: withDescription.length,
    progressSummaryFilledCount: withProgress.length,
    bothFilledCount: both.length,
    missingDescriptionCount: missingDescription.length,
    missingProgressSummaryCount: missingProgress.length,
    missingEitherCount: missingEither.length,
    records: source.map((item) => ({
      opportunityId: item.opportunityid,
      name: item.name,
      descriptionPresent: hasText(item.description),
      progressSummaryPresent: hasText(item.aigw_progresssummary),
    })),
  };
}

export function buildPatchPlan({ dataverseRecords, inputRecords, overwrite = false }) {
  const inputByName = new Map((Array.isArray(inputRecords) ? inputRecords : []).map((item) => [item.name, item]));
  const dataverseByName = new Map();
  const duplicateNames = new Set();
  for (const record of dataverseRecords || []) {
    if (!String(record.name || "").startsWith(aiDemoPrefix)) continue;
    if (dataverseByName.has(record.name)) duplicateNames.add(record.name);
    const list = dataverseByName.get(record.name) || [];
    list.push(record);
    dataverseByName.set(record.name, list);
  }

  const plan = {
    overwrite,
    totalDataverseDemoCount: [...dataverseByName.values()].reduce((sum, list) => sum + list.length, 0),
    patch: [],
    skipped: [],
    unmatched: [],
    duplicate: [],
    rejected: [],
  };

  for (const [name, records] of dataverseByName.entries()) {
    if (duplicateNames.has(name) || records.length > 1) {
      plan.duplicate.push({ name, count: records.length, reason: "duplicate [AI-DEMO] Opportunity names in Dataverse" });
      continue;
    }
    const current = records[0];
    const input = inputByName.get(name);
    if (!input) {
      plan.unmatched.push({ name, opportunityId: current.opportunityid, reason: "no matching record in with_progress input" });
      continue;
    }
    const payload = {};
    for (const field of PATCH_FIELDS) {
      if (!overwrite && hasText(current[field])) continue;
      const value = String(input[field] || "").trim();
      if (!value) {
        plan.rejected.push({ name, opportunityId: current.opportunityid, field, reason: "input field is empty" });
        continue;
      }
      const blocked = blockedTextPatterns.find((item) => item.pattern.test(value));
      if (blocked) {
        plan.rejected.push({ name, opportunityId: current.opportunityid, field, reason: `blocked sensitive pattern: ${blocked.label}` });
        continue;
      }
      payload[field] = value;
    }
    if (Object.keys(payload).length) {
      plan.patch.push({ name, opportunityId: current.opportunityid, payload });
    } else {
      plan.skipped.push({ name, opportunityId: current.opportunityid, reason: overwrite ? "no safe payload generated" : "description and progress summary already filled" });
    }
  }

  for (const input of inputRecords || []) {
    if (String(input.name || "").startsWith(aiDemoPrefix) && !dataverseByName.has(input.name)) {
      plan.unmatched.push({ name: input.name, reason: "input record has no matching Dataverse [AI-DEMO] opportunity" });
    }
  }

  return plan;
}

export function summarizePatchResults(results, logPath) {
  const plan = results.plan;
  return {
    dryRun: results.dryRun,
    overwrite: results.overwrite,
    totalDataverseDemoCount: plan.totalDataverseDemoCount,
    plannedPatchCount: plan.patch.length,
    patchedCount: results.patched.length,
    skippedCount: plan.skipped.length,
    failedCount: results.failed.length,
    unmatchedCount: plan.unmatched.length,
    duplicateCount: plan.duplicate.length,
    rejectedCount: plan.rejected.length,
    logPath,
    rejected: plan.rejected,
    duplicate: plan.duplicate,
    unmatched: plan.unmatched,
    failures: results.failed,
  };
}

async function writePatchLog(results) {
  const timestamp = timestampForFile();
  const dir = path.resolve("backups/seed");
  await mkdir(dir, { recursive: true });
  const prefix = results.dryRun ? "demo-opportunity-progress-patch-missing" : "patched-demo-opportunity-progress-missing";
  const file = path.join(dir, `${prefix}-${timestamp}.json`);
  await writeFile(file, `${JSON.stringify(results, null, 2)}\n`);
  return file;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function timestampForFile() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
