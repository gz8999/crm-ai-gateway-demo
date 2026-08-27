import fs from "node:fs/promises";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { D6_FULL_IMPORT } from "./lib/d6-full-import-contract.mjs";
import { assertDataverseScriptGate, runDataverseCli } from "./lib/environment-safety.mjs";

const ROOT = new URL("../../", import.meta.url);
const TEST_HOST = D6_FULL_IMPORT.expectedHost;
const PRODUCTION_HOST = D6_FULL_IMPORT.productionHost;
const BPF_ID = "7325b274-6b7c-f111-ab0e-70a8a50388b9";
export async function main() {
const { dataverseUrl } = assertDataverseScriptGate({ mode: "read-only" });
const host = new URL(dataverseUrl).hostname;
const normalizeId = (value) => String(value || "").replace(/[{}]/g, "").toLowerCase();
const escapeValue = (value) => `'${String(value).replaceAll("'", "''")}'`;

if (host !== TEST_HOST || host === PRODUCTION_HOST) throw new Error(`Blocked hostname: ${host}`);
if (String(process.env.AI_PROVIDER || "demo").toLowerCase() !== "demo") throw new Error("AI_PROVIDER must remain demo");
if (String(process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() === "true") throw new Error("External AI is forbidden");

const [manifest, workbook, preflight, pilotReadback] = await Promise.all([
  fs.readFile(new URL("local-artifacts/d365/d365-ai-demo-200-d6-full-import-private.json", ROOT), "utf8").then(JSON.parse),
  fs.readFile(new URL("local-artifacts/d365/d6-workbook-data-private.json", ROOT), "utf8").then(JSON.parse),
  fs.readFile(new URL("local-artifacts/d365/d365-ai-demo-200-d5-preflight-private.json", ROOT), "utf8").then(JSON.parse),
  fs.readFile(new URL("local-artifacts/d365/d5-r5-final-runtime-private.json", ROOT), "utf8").then(JSON.parse),
]);
if (manifest.host !== host || preflight.host !== host || pilotReadback.host !== host) throw new Error("Frozen evidence hostname mismatch");
if (!Object.values(pilotReadback.gates || {}).every(Boolean)) throw new Error("Pilot exact-readback baseline is not ready");

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
const entitySet = (logicalName) => preflight.metadata[logicalName].definition.EntitySetName;
const primaryId = (logicalName) => preflight.metadata[logicalName].definition.PrimaryIdAttribute;
const formalByToken = Object.fromEntries(Object.entries(workbook.formal).map(([entity, rows]) => [entity, new Map(rows.map((row) => [row._record_token, row]))]));
const d6Records = Object.values(manifest.records || {}).filter((record) => record.d6Result === "Created");
const byEntity = Object.groupBy
  ? Object.groupBy(d6Records, (record) => record.entity)
  : d6Records.reduce((groups, record) => ({ ...groups, [record.entity]: [...(groups[record.entity] || []), record] }), {});
const expectedCreated = { Account: 53, Contact: 111, Opportunity: 4 };
for (const [entity, expected] of Object.entries(expectedCreated)) {
  if ((byEntity[entity] || []).length !== expected) throw new Error(`${entity} created-manifest count mismatch`);
}

const mismatches = [];
for (const record of byEntity.Account) {
  const row = await get(`/api/data/v9.2/${entitySet("account")}(${normalizeId(record.exactRecordId)})?$select=${primaryId("account")},accountnumber,name,statecode,statuscode`);
  if (normalizeId(row[primaryId("account")]) !== normalizeId(record.exactRecordId) || row.accountnumber !== record.stableToken || Number(row.statecode) !== 0 || Number(row.statuscode) !== 1) mismatches.push(`Account:${record.stableToken}`);
}
for (const record of byEntity.Contact) {
  const expected = formalByToken.Contact.get(record.stableToken);
  const row = await get(`/api/data/v9.2/${entitySet("contact")}(${normalizeId(record.exactRecordId)})?$select=${primaryId("contact")},lastname,jobtitle,_parentcustomerid_value,statecode,statuscode`);
  if (normalizeId(row[primaryId("contact")]) !== normalizeId(record.exactRecordId) || row.lastname !== expected.lastname || normalizeId(row._parentcustomerid_value) !== normalizeId(record.parentRecordId) || Number(row.statecode) !== 0 || Number(row.statuscode) !== 1) mismatches.push(`Contact:${record.stableToken}`);
}

const initialStageRecord = Object.values(manifest.records || {}).find((record) => record.bpfReadbackEvidence?.activeStageId || record.bpfReadbackEvidence?.targetRow?._activestageid_value);
const initialStageId = normalizeId(initialStageRecord?.bpfReadbackEvidence?.activeStageId || initialStageRecord?.bpfReadbackEvidence?.targetRow?._activestageid_value);
if (!/^[0-9a-f-]{36}$/.test(initialStageId)) throw new Error("Frozen initial BPF stage ID is unavailable");
const opportunityRows = [];
const bpfRows = [];
const closeRows = [];
for (const record of byEntity.Opportunity) {
  const expected = formalByToken.Opportunity.get(record.stableToken);
  const expectedContactId = normalizeId(manifest.records[`Contact:${expected.parentcontactid_token}`]?.exactRecordId);
  const row = await get(`/api/data/v9.2/${entitySet("opportunity")}(${normalizeId(record.exactRecordId)})?$select=${primaryId("opportunity")},name,_parentaccountid_value,_parentcontactid_value,statecode,statuscode,actualclosedate`);
  const ready = normalizeId(row[primaryId("opportunity")]) === normalizeId(record.exactRecordId)
    && row.name === expected.name
    && normalizeId(row._parentaccountid_value) === normalizeId(record.parentRecordId)
    && normalizeId(row._parentcontactid_value) === expectedContactId
    && Number(row.statecode) === 0
    && Number(row.statuscode) === 1
    && !row.actualclosedate;
  if (!ready) mismatches.push(`Opportunity:${record.stableToken}`);
  opportunityRows.push({ token: record.stableToken, statecode: Number(row.statecode), statuscode: Number(row.statuscode), actualclosedate: row.actualclosedate || null, ready });

  const bpfBody = await get(`/api/data/v9.2/${entitySet("aigw_ai_demo_full_replica")}?$select=${primaryId("aigw_ai_demo_full_replica")},_bpf_opportunityid_value,_activestageid_value,traversedpath,statecode,statuscode&$filter=_bpf_opportunityid_value eq ${normalizeId(record.exactRecordId)}`);
  const bpfValues = bpfBody.value || [];
  const processBody = await get(`/api/data/v9.2/RetrieveProcessInstances(EntityId=${normalizeId(record.exactRecordId)},EntityLogicalName='opportunity')`);
  const processes = processBody.value || processBody.Processes || processBody.processes || [];
  const unexpected = processes.filter((process) => normalizeId(process._processid_value || process.ProcessDefinitionID || process.processdefinitionid || process.ProcessId || process.processid) !== normalizeId(BPF_ID));
  const bpf = bpfValues[0];
  const traversed = String(bpf?.traversedpath || "").split(",").map(normalizeId).filter(Boolean);
  const bpfReady = bpfValues.length === 1
    && processes.length === 1
    && unexpected.length === 0
    && normalizeId(bpf?.[primaryId("aigw_ai_demo_full_replica")]) === normalizeId(record.targetBpfInstanceExactId)
    && normalizeId(bpf?._activestageid_value) === initialStageId
    && traversed.length === 1
    && traversed[0] === initialStageId
    && Number(bpf?.statecode) === 0;
  if (!bpfReady) mismatches.push(`BPF:${record.stableToken}`);
  bpfRows.push({ token: record.stableToken, count: bpfValues.length, processCount: processes.length, duplicate: Math.max(0, bpfValues.length - 1), unexpectedProcess: unexpected.length, initialStage: normalizeId(bpf?._activestageid_value) === initialStageId, ready: bpfReady });

  const closes = await get(`/api/data/v9.2/opportunitycloses?$select=activityid&$filter=_opportunityid_value eq ${normalizeId(record.exactRecordId)}`);
  const closeCount = (closes.value || []).length;
  if (closeCount !== 0) mismatches.push(`OpportunityClose:${record.stableToken}`);
  closeRows.push({ token: record.stableToken, count: closeCount });
}

const failedToken = "DEMO-OPP-005";
const failedExpected = formalByToken.Opportunity.get(failedToken);
const failedParentId = normalizeId(manifest.records[`Account:${failedExpected.parentaccountid_token}`]?.exactRecordId);
const failedReadback = await get(`/api/data/v9.2/${entitySet("opportunity")}?$select=${primaryId("opportunity")}&$filter=name eq ${escapeValue(failedExpected.name)} and _parentaccountid_value eq ${failedParentId}`);
const failedRecordCount = (failedReadback.value || []).length;
if (failedRecordCount !== 0) mismatches.push(`FailedTokenResidual:${failedToken}`);

const partialCounts = {
  Account: pilotReadback.exact.counts.Account + byEntity.Account.length,
  Contact: pilotReadback.exact.counts.Contact + byEntity.Contact.length,
  Opportunity: pilotReadback.exact.counts.Opportunity + byEntity.Opportunity.length,
  ServiceCoverage: pilotReadback.exact.counts.ServiceCoverage,
  ActualManagement: pilotReadback.exact.counts.ActualManagement,
  Timeline: pilotReadback.exact.counts.Timeline,
  InteractionSignal: pilotReadback.exact.counts.InteractionSignal,
};
const stateDistribution = { Won: pilotReadback.stateDistribution.Won, Active: pilotReadback.stateDistribution.Active + byEntity.Opportunity.length, Lost: pilotReadback.stateDistribution.Lost };
const result = {
  phase: `${D6_FULL_IMPORT.phase}-PARTIAL-READBACK`,
  environmentAlias: "TEST-ORG",
  capturedAt: new Date().toISOString(),
  ready: mismatches.length === 0,
  d6CreatedReadback: expectedCreated,
  failedToken,
  failedTokenResidualCount: failedRecordCount,
  partialExplicitCounts: partialCounts,
  partialExplicitRecordCount: Object.values(partialCounts).reduce((sum, value) => sum + value, 0),
  stateDistribution,
  opportunityClose: { total: pilotReadback.closes.total, win: pilotReadback.closes.win, lose: pilotReadback.closes.lose, duplicate: pilotReadback.closes.duplicate, attachments: pilotReadback.closes.attachments, newCloseCount: closeRows.reduce((sum, row) => sum + row.count, 0) },
  bpf: { total: pilotReadback.bpf.targetInstances + bpfRows.length, newCount: bpfRows.length, duplicate: bpfRows.reduce((sum, row) => sum + row.duplicate, 0), unexpectedProcess: bpfRows.reduce((sum, row) => sum + row.unexpectedProcess, 0), initialStage: pilotReadback.bpf.initialStage + bpfRows.filter((row) => row.initialStage).length },
  opportunityRows,
  bpfRows,
  closeRows,
  mismatches,
  requestCounts,
};

await fs.writeFile(new URL("local-artifacts/d365/d6-partial-readback-public.json", ROOT), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!result.ready) process.exitCode = 2;
}

runDataverseCli(import.meta.url, main);
