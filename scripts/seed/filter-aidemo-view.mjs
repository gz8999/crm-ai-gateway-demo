import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";

export const DEFAULT_VIEW_ID = "";
export const AIDEMO_PREFIX = "[AI-DEMO]";

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    confirm: false,
    rollbackFile: "",
    viewId: DEFAULT_VIEW_ID,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--confirm") args.confirm = true;
    else if (item === "--view-id") args.viewId = argv[++index] || args.viewId;
    else if (item === "--rollback") args.rollbackFile = argv[++index] || "";
  }
  return args;
}

export function ensureAiDemoFilter(fetchxml = "") {
  const condition = `<condition attribute="name" operator="like" value="[[]AI-DEMO]%" />`;
  if (fetchxml.includes('attribute="name"') && fetchxml.includes("[[]AI-DEMO]%")) {
    return ensureOrder(fetchxml);
  }

  if (/<filter\b[^>]*>/i.test(fetchxml)) {
    return ensureOrder(fetchxml.replace(/<filter\b([^>]*)>/i, `<filter$1>\n      ${condition}`));
  }

  const filterBlock = `<filter type="and">\n      ${condition}\n    </filter>`;
  if (/<order\b/i.test(fetchxml)) {
    return ensureOrder(fetchxml.replace(/<order\b/i, `${filterBlock}\n    <order`));
  }
  return ensureOrder(fetchxml.replace(/<\/entity>/i, `    ${filterBlock}\n  </entity>`));
}

export function summarizeFetchXml(fetchxml = "") {
  return {
    hasAiDemoFilter: fetchxml.includes("[[]AI-DEMO]%") || (fetchxml.includes(AIDEMO_PREFIX) && fetchxml.includes('operator="begins-with"')),
    attributes: [...fetchxml.matchAll(/<attribute name="([^"]+)"/g)].map((match) => match[1]),
    orders: [...fetchxml.matchAll(/<order attribute="([^"]+)"(?: descending="([^"]+)")?/g)].map((match) => ({
      attribute: match[1],
      descending: match[2] || "false",
    })),
  };
}

export async function backupView(view, timestamp = timestampId()) {
  const dir = path.resolve("backups/view");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `All_Cases_Logistics_AI_Demo_before_aidemo_filter_${timestamp}.json`);
  await writeFile(file, JSON.stringify({
    timestamp,
    viewId: view.savedqueryid || DEFAULT_VIEW_ID,
    name: view.name,
    returnedtypecode: view.returnedtypecode,
    statecode: view.statecode,
    statuscode: view.statuscode,
    fetchxml: view.fetchxml,
    layoutxml: view.layoutxml,
    layoutjson: view.layoutjson,
  }, null, 2));
  return file;
}

export async function run({ confirm = false, rollbackFile = "", viewId = DEFAULT_VIEW_ID } = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(viewId)) throw new Error("A valid explicit --view-id is required.");
  const client = createDynamicsClient();
  if (rollbackFile) return rollback(client, rollbackFile, confirm);

  const { body: view } = await client.dataverseGet(`/api/data/v9.2/savedqueries(${viewId})?$select=savedqueryid,name,returnedtypecode,statecode,statuscode,fetchxml,layoutxml,layoutjson`);
  const backupPath = await backupView(view);
  const before = summarizeFetchXml(view.fetchxml);
  const nextFetchXml = ensureAiDemoFilter(view.fetchxml || "");
  const after = summarizeFetchXml(nextFetchXml);
  const preview = await verifyFetchXml(client, nextFetchXml);

  if (confirm) {
    await client.dataversePatch(`/api/data/v9.2/savedqueries(${viewId})`, { fetchxml: nextFetchXml });
    await publishOpportunity(client);
  }

  const verified = confirm
    ? await client.dataverseGet(`/api/data/v9.2/savedqueries(${viewId})?$select=name,returnedtypecode,statecode,statuscode,fetchxml,layoutxml,layoutjson`).then(({ body }) => ({
      view: {
        active: body.statecode === 0,
        returnedtypecode: body.returnedtypecode,
        hasAiDemoFilter: summarizeFetchXml(body.fetchxml).hasAiDemoFilter,
        layoutXmlUnchanged: body.layoutxml === view.layoutxml,
        layoutJsonUnchanged: body.layoutjson === view.layoutjson,
      },
    }))
    : { view: null };

  return {
    mode: confirm ? "confirmed" : "dry-run",
    backupPath,
    before,
    after,
    preview,
    publish: confirm ? "PublishXml submitted for opportunity entity" : "dry-run; not published",
    verified,
  };
}

async function rollback(client, rollbackFile, confirm) {
  const backup = JSON.parse(await readFile(rollbackFile, "utf8"));
  if (!confirm) {
    return {
      mode: "rollback-dry-run",
      backupPath: rollbackFile,
      viewId: backup.viewId,
      fetchSummary: summarizeFetchXml(backup.fetchxml),
      message: "Use --confirm to restore this fetchxml.",
    };
  }
  await client.dataversePatch(`/api/data/v9.2/savedqueries(${backup.viewId})`, { fetchxml: backup.fetchxml });
  await publishOpportunity(client);
  return {
    mode: "rollback-confirmed",
    backupPath: rollbackFile,
    viewId: backup.viewId,
    restoredSummary: summarizeFetchXml(backup.fetchxml),
    publish: "PublishXml submitted for opportunity entity",
  };
}

async function verifyFetchXml(client, fetchxml) {
  const encoded = encodeURIComponent(fetchxml);
  const { body } = await client.dataverseGet(`/api/data/v9.2/opportunities?fetchXml=${encoded}`);
  const rows = Array.isArray(body.value) ? body.value : [];
  return {
    count: rows.length,
    allAiDemo: rows.every((item) => String(item.name || "").startsWith(AIDEMO_PREFIX)),
    sampleNames: rows.slice(0, 10).map((item) => item.name),
  };
}

async function publishOpportunity(client) {
  await client.dataversePost("/api/data/v9.2/PublishXml", {
    ParameterXml: "<importexportxml><entities><entity>opportunity</entity></entities></importexportxml>",
  });
}

function ensureOrder(fetchxml) {
  if (/<order\b/i.test(fetchxml)) return fetchxml;
  return fetchxml.replace(/<\/entity>/i, `    <order attribute="modifiedon" descending="true" />\n  </entity>`);
}

function timestampId() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(parseArgs())
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
