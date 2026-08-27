#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";

const DEFAULT_LIMIT = 20;
const MAX_BATCH_SIZE = 10;
const DEFAULT_INPUTS = [];

const writableFields = new Set([
  "name",
  "description",
  "aigw_progresssummary",
  "estimatedclosedate",
  "estimatedvalue",
  "aigw_estimatedquoteamount",
  "aigw_startdate",
  "aigw_opportunitytype",
  "aigw_casestage",
  "aigw_winprobabilityrank",
  "aigw_opportunitydetailtype",
  "aigw_organizationgroup_choice",
  "aigw_bookingdepartment_choice",
  "aigw_salesdepartment_choice",
  "aigw_priority_choice",
  "aigw_researchbackground_choice",
  "aigw_decider_choice",
  "aigw_customerneed_choice",
  "aigw_proposalcontent_choice",
  "aigw_opportunitylist_bool",
  "aigw_transportmode",
  "aigw_spotcontinuous",
  "aigw_goodshandled",
  "aigw_projectsize",
  "aigw_projectsizeunit",
  "aigw_warehousescale",
  "aigw_tradeterms",
]);

const allowedInputFields = new Set([
  ...writableFields,
  "_review",
  "demoNotes",
  "demoRiskLevel",
  "parentAccountId",
  "parentAccountIndex",
  "parentAccountNameForReviewOnly",
  "parentAccountStrategy",
  "scenarioType",
]);

const blockedInputKeys = [/contact/i, /email/i, /phone/i, /address/i, /timeline/i, /raw/i];

const dataverseOptionValueMap = {
  aigw_opportunitytype: {
    1: 100000000,
    2: 100000001,
    3: 100000002,
    91: 100000003,
  },
  aigw_casestage: {
    1: 388560000,
    2: 388560001,
    3: 388560002,
    4: 388560003,
    5: 388560004,
  },
  aigw_winprobabilityrank: {
    1: 100000000,
    2: 100000001,
    3: 100000002,
    4: 100000003,
    5: 100000004,
    6: 100000005,
  },
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = await resolveInputPath(args.input);
  const allRecords = await readSeedRecords(inputPath);
  const selectedRecords = allRecords.slice(args.offset, args.offset + args.limit);
  const client = createDynamicsClient();
  const accounts = await listAccounts(client);
  const existingDemoNames = await listExistingDemoOpportunityNames(client);
  const results = {
    ok: [],
    failed: [],
    skipped: [],
    dryRun: args.dryRun,
    inputPath,
    limit: args.limit,
    offset: args.offset,
    usedAccountCount: 0,
  };

  if (accounts.length < 3) {
    throw new Error(`Need at least 3 existing active Accounts. Found ${accounts.length}. No Accounts will be created.`);
  }

  const usedAccountIds = new Set();
  const prepared = selectedRecords.flatMap((record, index) => {
    if (existingDemoNames.has(record.name)) {
      results.skipped.push({ sourceIndex: args.offset + index, name: record.name, reason: "already exists in Dataverse" });
      return [];
    }
    const account = accounts[Number(record.parentAccountIndex || 0) % accounts.length];
    usedAccountIds.add(account.accountid);
    return [preparePayload(record, args.offset + index, account)];
  });
  results.usedAccountCount = usedAccountIds.size;

  if (args.dryRun) {
    for (const item of prepared) {
      results.ok.push({
        sourceIndex: item.sourceIndex,
        name: item.payload.name,
        accountId: item.account.accountid,
        mode: "dry-run",
      });
    }
    printSummary(results);
    return;
  }

  for (const batch of chunk(prepared, MAX_BATCH_SIZE)) {
    await Promise.all(batch.map(async (item) => {
      try {
        const response = await client.dataversePost("/api/data/v9.2/opportunities", item.payload);
        const id = response.body?.opportunityid || parseCreatedId(response.headers.get("odata-entityid"));
        results.ok.push({
          sourceIndex: item.sourceIndex,
          name: item.payload.name,
          opportunityId: id,
          accountId: item.account.accountid,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        results.failed.push({
          sourceIndex: item.sourceIndex,
          name: item.payload.name,
          reason: error.message,
        });
      }
    }));
  }

  const createdFile = await writeCreatedIds(results);
  results.createdFile = createdFile;
  printSummary(results);
}

function parseArgs(argv) {
  const args = { dryRun: false, input: "", limit: DEFAULT_LIMIT, offset: 0 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--input") args.input = argv[++index] || "";
    else if (arg === "--limit") args.limit = Number(argv[++index] || DEFAULT_LIMIT);
    else if (arg === "--offset") args.offset = Number(argv[++index] || 0);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100) {
    throw new Error("--limit must be an integer from 1 to 100.");
  }
  if (!Number.isInteger(args.offset) || args.offset < 0 || args.offset > 99) {
    throw new Error("--offset must be an integer from 0 to 99.");
  }
  return args;
}

async function resolveInputPath(input) {
  const candidates = input ? [input] : DEFAULT_INPUTS;
  for (const candidate of candidates) {
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  throw new Error(`Unable to find seed input. Tried: ${candidates.join(", ")}`);
}

async function readSeedRecords(inputPath) {
  const data = JSON.parse(await readFile(inputPath, "utf8"));
  const records = Array.isArray(data) ? data : data.records;
  if (!Array.isArray(records)) throw new Error("Seed input must be an array or an object with a records array.");
  return records;
}

async function listAccounts(client) {
  const { body } = await client.dataverseGet("/api/data/v9.2/accounts?$select=accountid,name&$filter=statecode eq 0&$orderby=name asc&$top=100");
  return Array.isArray(body.value) ? body.value : [];
}

async function listExistingDemoOpportunityNames(client) {
  const { body } = await client.dataverseGet("/api/data/v9.2/opportunities?$select=name&$filter=startswith(name,'[AI-DEMO]')&$top=5000");
  return new Set((body.value || []).map((item) => item.name).filter(Boolean));
}

function preparePayload(record, index, account) {
  validateInputRecord(record, index);
  const payload = {};
  for (const field of writableFields) {
    if (record[field] !== undefined && record[field] !== null && record[field] !== "") payload[field] = dataverseValue(field, record[field]);
  }
  payload["parentaccountid@odata.bind"] = `/accounts(${account.accountid})`;
  return { account, payload, sourceIndex: index };
}

function dataverseValue(field, value) {
  const map = dataverseOptionValueMap[field];
  if (!map) return value;
  const mapped = map[Number(value)];
  if (mapped === undefined) throw new Error(`No Dataverse option value mapping for ${field}=${value}`);
  return mapped;
}

function validateInputRecord(record, index) {
  const keys = Object.keys(record);
  const unexpected = keys.filter((key) => !allowedInputFields.has(key));
  if (unexpected.length) throw new Error(`Record ${index + 1} has unexpected keys: ${unexpected.join(", ")}`);
  if (!String(record.name || "").startsWith("[AI-DEMO]")) throw new Error(`Record ${index + 1} name must start with [AI-DEMO].`);
  if (!/^ACCOUNT_SLOT_\d{2}$/.test(String(record.parentAccountId || ""))) {
    throw new Error(`Record ${index + 1} must use ACCOUNT_SLOT_XX parentAccountId placeholder.`);
  }
  const writableKeyHits = keys.filter((key) => writableFields.has(key) && blockedInputKeys.some((pattern) => pattern.test(key)));
  if (writableKeyHits.length) throw new Error(`Record ${index + 1} has blocked writable keys: ${writableKeyHits.join(", ")}`);
}

function parseCreatedId(entityId) {
  const match = String(entityId || "").match(/\(([^)]+)\)$/);
  return match?.[1] || null;
}

async function writeCreatedIds(results) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const dir = path.resolve("backups/seed");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `created-demo-opportunities-${timestamp}.json`);
  await writeFile(file, `${JSON.stringify({
    createdAt: new Date().toISOString(),
    dryRun: false,
    inputPath: results.inputPath,
    limit: results.limit,
    offset: results.offset,
    usedAccountCount: results.usedAccountCount,
    created: results.ok,
    failed: results.failed,
    skipped: results.skipped,
  }, null, 2)}\n`);
  return file;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function printSummary(results) {
  console.log(JSON.stringify({
    dryRun: results.dryRun,
    inputPath: results.inputPath,
    limit: results.limit,
    successCount: results.ok.length,
    failureCount: results.failed.length,
    skippedCount: results.skipped.length,
    usedAccountCount: results.usedAccountCount,
    createdFile: results.createdFile || null,
    createdOpportunityIds: results.ok.map((item) => item.opportunityId).filter(Boolean),
    skipped: results.skipped,
    failures: results.failed,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
