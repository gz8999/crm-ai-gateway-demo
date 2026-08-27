import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";

export const AIDEMO_PREFIX = "[AI-DEMO]";

export async function run() {
  const client = createDynamicsClient();
  const fetchxml = `<fetch version="1.0" count="5000"><entity name="opportunity"><attribute name="opportunityid" /><attribute name="name" /><attribute name="createdon" /><attribute name="modifiedon" /><attribute name="ownerid" /><filter><condition attribute="name" operator="not-like" value="[[]AI-DEMO]%" /></filter><order attribute="modifiedon" descending="true" /></entity></fetch>`;
  const { body } = await client.dataverseGet(`/api/data/v9.2/opportunities?fetchXml=${encodeURIComponent(fetchxml)}`);
  const records = Array.isArray(body.value) ? body.value.map((item) => ({
    opportunityid: item.opportunityid,
    name: item.name,
    createdon: item.createdon,
    modifiedon: item.modifiedon,
    owner_token: token("OWNER", item._ownerid_value || item.ownerid),
  })) : [];
  const dir = path.resolve("backups/seed");
  await mkdir(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const file = path.join(dir, `non-demo-opportunities-dry-run-${timestamp}.json`);
  await writeFile(file, JSON.stringify({
    timestamp,
    mode: "dry-run",
    deleted: 0,
    count: records.length,
    records,
  }, null, 2));
  return {
    mode: "dry-run",
    deleted: 0,
    count: records.length,
    file,
    sample: records.slice(0, 20),
    message: "No records were deleted, deactivated, or updated.",
  };
}

function token(prefix, value) {
  if (!value) return `${prefix}-UNKNOWN`;
  let hash = 0;
  for (const char of String(value)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `${prefix}-${String(hash % 10000).padStart(4, "0")}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
