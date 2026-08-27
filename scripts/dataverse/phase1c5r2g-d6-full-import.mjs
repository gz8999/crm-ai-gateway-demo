import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, runDataverseCli } from "./lib/environment-safety.mjs";
import {
  D6_FULL_IMPORT,
  D6_R1_OPPORTUNITY_RECOVERY,
  D6_R2_COVERAGE_ACTUAL,
  D6_R3_TIMELINE_SIGNAL,
  D6_R4A_FULL_WIN_CANARY,
  D6_R4B_FULL_LOSE_CANARY,
  D6_R4C_FULL_STATE_ACTIONS,
  actualDesiredParentDistribution,
  annotationProjectionMode,
  assertAnnotationPayloadFields,
  assertFrozenOpportunityState,
  assertTimelineParentCheckpoint,
  buildMaximumBatches,
  buildProjectedAnnotationBody,
  buildStableBatches,
  classifyRemainingTimeline,
  containsGuid,
  fullWinCanaryRequestStatsAreSafe,
  fullLoseCanaryRequestStatsAreSafe,
  fullStateActionsRequestStatsAreSafe,
  groupSignalsBySourceActivity,
  requestStatsAreSafe,
  selectStableCanaries,
  selectCoverageCanaries,
  selectFullWinCanary,
  selectFullLoseCanary,
  assertActualCountMatchesFrozenProjection,
  expectedActualCountFromFrozenProjection,
  selectOpportunityRecoveryRows,
  selectRemainingStateActions,
  stableJson,
} from "./lib/d6-full-import-contract.mjs";
import {
  ACTUAL_REVENUE_FIELDS,
  buildRemainingWinPayload,
  classifyBpfCloseSideEffect,
  frozenAnnualActualRevenue,
} from "./lib/d5-r4-remaining-win-contract.mjs";
import {
  buildLoseOpportunityPayload,
  classifyBpfLoseSideEffect,
} from "./lib/d5-r3-lose-canary-contract.mjs";

const ROOT = new URL("../../", import.meta.url);
const EXPECTED_HOST = D6_FULL_IMPORT.expectedHost;
const PRODUCTION_HOST = D6_FULL_IMPORT.productionHost;
const PHASE = D6_FULL_IMPORT.phase;
const AUTHORIZATION = PHASE;
const FORMAL = new URL("artifacts/d365/CRM_AI_Gateway_D365_Demo_200_ImportProjection_v1.xlsx", ROOT);
const PILOT = new URL("artifacts/d365/CRM_AI_Gateway_D365_Demo_200_CompactPilot_v1.xlsx", ROOT);
const D6_DATA = new URL("local-artifacts/d365/d6-workbook-data-private.json", ROOT);
const REMAINING_WORKBOOK = new URL("artifacts/d365/CRM_AI_Gateway_D365_Demo_200_Remaining176_v1.xlsx", ROOT);
const PILOT_PRIVATE_MANIFEST = new URL("local-artifacts/d365/d365-ai-demo-200-d5-pilot-import-private.json", ROOT);
const PRIVATE_MANIFEST = new URL("local-artifacts/d365/d365-ai-demo-200-d6-full-import-private.json", ROOT);
const EXPECTED = D6_FULL_IMPORT.remainingCounts;
const BPF_ID = "7325b274-6b7c-f111-ab0e-70a8a50388b9";
const BPF_NAME = "销售流程 - AI Demo Full Replica";
const BPF_UNIQUE_NAME = "aigw_ai_demo_full_replica";
const INITIAL_STAGE = "授予资格";

export async function main() {
const flags = {
  apply: process.argv.includes("--apply"),
  resumeOpportunityOnly: process.argv.includes(D6_R1_OPPORTUNITY_RECOVERY.flag),
  resumeCoverageActualOnly: process.argv.includes(D6_R2_COVERAGE_ACTUAL.flag),
  resumeTimelineSignalOnly: process.argv.includes(D6_R3_TIMELINE_SIGNAL.flag),
  fullWinCanaryOnly: process.argv.includes(D6_R4A_FULL_WIN_CANARY.flag),
  fullLoseCanaryOnly: process.argv.includes(D6_R4B_FULL_LOSE_CANARY.flag),
  fullStateActionsOnly: process.argv.includes(D6_R4C_FULL_STATE_ACTIONS.flag),
  confirmTest: process.argv.includes("--confirm-test-environment"),
  confirm: process.argv.includes("--confirm"),
  authorization: process.argv.find((arg) => arg.startsWith("--authorization="))?.slice("--authorization=".length) || "",
};
if ([flags.resumeOpportunityOnly, flags.resumeCoverageActualOnly, flags.resumeTimelineSignalOnly, flags.fullWinCanaryOnly, flags.fullLoseCanaryOnly, flags.fullStateActionsOnly].filter(Boolean).length > 1) throw new Error("Only one D6 recovery mode may be selected");
const { dataverseUrl } = flags.apply
  ? assertDataverseScriptGate({ mode: "write-capable" })
  : assertDataverseScriptGate({ mode: "read-only" });
const host = new URL(dataverseUrl).hostname;
if (host !== EXPECTED_HOST || host === PRODUCTION_HOST) throw new Error(`Blocked hostname: ${host}`);
if (String(process.env.AI_PROVIDER || "demo").toLowerCase() !== "demo") throw new Error("AI_PROVIDER must remain demo");
if (String(process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() === "true") throw new Error("External AI is forbidden");
const expectedAuthorization = flags.resumeOpportunityOnly
  ? D6_R1_OPPORTUNITY_RECOVERY.authorization
  : flags.resumeCoverageActualOnly
      ? D6_R2_COVERAGE_ACTUAL.authorization
      : flags.resumeTimelineSignalOnly
        ? D6_R3_TIMELINE_SIGNAL.authorization
        : flags.fullWinCanaryOnly
          ? D6_R4A_FULL_WIN_CANARY.authorization
          : flags.fullLoseCanaryOnly
          ? D6_R4B_FULL_LOSE_CANARY.authorization
            : flags.fullStateActionsOnly
              ? D6_R4C_FULL_STATE_ACTIONS.authorization
        : AUTHORIZATION;
if (flags.resumeOpportunityOnly && flags.authorization !== expectedAuthorization) throw new Error(`Opportunity recovery requires ${expectedAuthorization}`);
if (flags.resumeCoverageActualOnly && flags.authorization !== expectedAuthorization) throw new Error(`Coverage/Actual recovery requires ${expectedAuthorization}`);
if (flags.resumeTimelineSignalOnly && flags.authorization !== expectedAuthorization) throw new Error(`Timeline/Signal recovery requires ${expectedAuthorization}`);
if (flags.fullWinCanaryOnly && flags.authorization !== expectedAuthorization) throw new Error(`Full Win Canary requires ${expectedAuthorization}`);
if (flags.fullLoseCanaryOnly && flags.authorization !== expectedAuthorization) throw new Error(`Full Lose Canary requires ${expectedAuthorization}`);
if (flags.fullStateActionsOnly && flags.authorization !== expectedAuthorization) throw new Error(`Full State Actions requires ${expectedAuthorization}`);
if (flags.apply && (!flags.confirmTest || !flags.confirm || flags.authorization !== expectedAuthorization)) throw new Error(`Apply requires ${expectedAuthorization}`);

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const normalizeId = (value) => String(value || "").replace(/[{}]/g, "").toLowerCase();
const escapeValue = (value) => `'${String(value).replaceAll("'", "''")}'`;
const excelDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return new Date((Number(value) - 25569) * 86400000).toISOString().slice(0, 10);
};
const dateTime = (value, hour = "10:00:00") => `${excelDate(value)}T${hour}Z`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const compactError = (error) => ({ status: Number(error?.status || 0) || null, message: String(error?.message || error || "Unknown error").slice(0, 500) });

const [formalBytes, pilotBytes, workbook, preflight, security, runtimeMapping, selection, pilotPrivate, latestPilotReadback] = await Promise.all([
  fs.readFile(FORMAL),
  fs.readFile(PILOT),
  fs.readFile(D6_DATA, "utf8").then(JSON.parse),
  fs.readFile(new URL("local-artifacts/d365/d365-ai-demo-200-d5-preflight-private.json", ROOT), "utf8").then(JSON.parse),
  fs.readFile(new URL("local-artifacts/d365/d365-ai-demo-200-d3b-final-private.json", ROOT), "utf8").then(JSON.parse),
  fs.readFile(new URL("docs/d365/d365-ai-demo-200-runtime-token-mapping-summary.json", ROOT), "utf8").then(JSON.parse),
  fs.readFile(new URL("docs/d365/d365-ai-demo-200-pilot-selection-final.json", ROOT), "utf8").then(JSON.parse),
  fs.readFile(PILOT_PRIVATE_MANIFEST, "utf8").then(JSON.parse),
  fs.readFile(new URL("local-artifacts/d365/d5-r5-final-runtime-private.json", ROOT), "utf8").then(JSON.parse),
]);
const formalHash = sha256(formalBytes);
const pilotHash = sha256(pilotBytes);
const remainingWorkbookBytes = await fs.readFile(REMAINING_WORKBOOK);
const remainingWorkbookHash = sha256(remainingWorkbookBytes);
if (formalBytes.length !== D6_FULL_IMPORT.formalWorkbook.bytes || formalHash !== D6_FULL_IMPORT.formalWorkbook.sha256) throw new Error("Formal workbook integrity failed");
if (pilotBytes.length !== D6_FULL_IMPORT.pilotWorkbook.bytes || pilotHash !== D6_FULL_IMPORT.pilotWorkbook.sha256) throw new Error("Pilot workbook integrity failed");
if (preflight.host !== host || preflight.blockers.length || !Object.values(preflight.gates).every(Boolean)) throw new Error("D5 metadata preflight gate failed");
if (security.readback?.b1ControlledSetupReady !== true || runtimeMapping.deletedRoleResidualReferenceCount !== 0) throw new Error("Security graph gate failed");
if (pilotPrivate.host !== host || Object.keys(pilotPrivate.records || {}).length !== 427 || Object.keys(pilotPrivate.bpfReadbacks || {}).length !== 24) throw new Error("D5 Pilot private baseline gate failed");
if (!pilotPrivate.stateActions?.d5R2WinCanary || !pilotPrivate.stateActions?.d5R3LoseCanary || !pilotPrivate.stateActions?.d5R4RemainingWins) throw new Error("Completed Pilot state action evidence is required");
if (latestPilotReadback.host !== host || !Object.values(latestPilotReadback.gates || {}).every(Boolean)) throw new Error("Latest D5-R5 exact readback gate failed");
if (!flags.resumeOpportunityOnly && !flags.resumeCoverageActualOnly && !flags.resumeTimelineSignalOnly && !flags.fullWinCanaryOnly && !flags.fullLoseCanaryOnly && !flags.fullStateActionsOnly && Date.now() - Date.parse(latestPilotReadback.capturedAt) > 2 * 60 * 60 * 1000) throw new Error("Latest D5-R5 exact readback is older than two hours");

const rows = workbook.complement;
const allRows = workbook.formal;
const pilotRows = workbook.pilot;
for (const [name, expected] of Object.entries(EXPECTED)) if (rows[name]?.length !== expected) throw new Error(`${name} count mismatch`);
const tokenColumn = { Account: "_record_token", Contact: "_record_token", Opportunity: "_record_token", ServiceCoverage: "_record_token", ActualManagement: "_record_token", Timeline: "_record_token", InteractionSignal: "_record_token" };
for (const [name, values] of Object.entries(rows)) if (new Set(values.map((row) => row[tokenColumn[name]])).size !== values.length) throw new Error(`${name} token uniqueness failed`);
const pilotRecordKeys = new Set(Object.keys(pilotPrivate.records || {}));
for (const recordKey of pilotRecordKeys) if (!/^[0-9a-f-]{36}$/i.test(String(pilotPrivate.records[recordKey]?.exactRecordId || ""))) throw new Error(`Pilot exact ID missing: ${recordKey}`);

let priorPrivate;
try {
  priorPrivate = JSON.parse(await fs.readFile(PRIVATE_MANIFEST, "utf8"));
  if (priorPrivate.host !== host || priorPrivate.phase !== PHASE) throw new Error("D6 private manifest identity mismatch");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  priorPrivate = {
    phase: PHASE,
    host,
    generationRun: D6_FULL_IMPORT.generationRun,
    records: structuredClone(pilotPrivate.records),
    bpfReadbacks: structuredClone(pilotPrivate.bpfReadbacks),
    pilotStateActions: structuredClone(pilotPrivate.stateActions),
    stateActions: {},
    batchLedger: [],
    requestCounts: {},
    blockers: [],
  };
}

const historicalR3AFailureBatch = [...(priorPrivate.batchLedger || [])].reverse().find((row) =>
  row.recoveryPhase === "Phase 1C-5R2G-D6-R3A"
  && row.blocker?.message === "System date cannot be set to a date in the future",
);
const annotationProjectionReferenceDate = String(
  priorPrivate.annotationProjectionEvidence?.referenceDate
  || priorPrivate.outcome?.safety?.executionServerDate
  || "",
).slice(0, 10);
ensure(annotationProjectionReferenceDate === D6_R3_TIMELINE_SIGNAL.annotationProjectionReferenceDate, "R3A Annotation projection reference date cannot be uniquely recovered");
ensure(historicalR3AFailureBatch, "R3A TL-0653 server rejection evidence is missing");
const frozenTl0653 = rows.Timeline.find((row) => row._record_token === D6_R3_TIMELINE_SIGNAL.sameDayCanaryToken);
ensure(frozenTl0653 && excelDate(frozenTl0653.scheduledend_or_actualend) === annotationProjectionReferenceDate, "TL-0653 is not the frozen same-day Annotation");

const pilotOpportunityTokens = [...selection.opportunityTokens].sort();
const allOpportunityTokens = allRows.Opportunity.map((row) => row._record_token).sort();
const initialStageId = normalizeId(
  pilotPrivate.records[`Opportunity:${pilotOpportunityTokens[0]}`]?.bpfReadbackEvidence?.targetRow?._activestageid_value
    || pilotPrivate.bpfReadbacks[pilotOpportunityTokens[0]]?.activeStageId,
);
ensure(/^[0-9a-f-]{36}$/.test(initialStageId), "Initial BPF stage baseline is missing");

const choiceReconciliation = JSON.parse(await fs.readFile(new URL("docs/d365/d365-ai-demo-200-choice-reconciliation.json", ROOT), "utf8"));
const choiceLabels = new Map(
  (choiceReconciliation.rows || []).map((row) => [`${row.attribute}:${Number(row.metadataValue)}`, String(row.displayLabel)]),
);
function choiceLabel(attribute, value) {
  const label = choiceLabels.get(`${attribute}:${Number(value)}`);
  ensure(label, `Frozen Choice label missing: ${attribute}=${value}`);
  return label;
}

function sanitizeError(error) {
  const compact = compactError(error);
  return {
    ...compact,
    message: compact.message.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[EXACT-ID-REDACTED]"),
  };
}
function plainRecord(record) {
  return Object.fromEntries(Object.entries(record || {}).filter(([key]) => !key.includes("@")).sort(([a], [b]) => a.localeCompare(b)));
}
function normalizedPrivilegeRows(values) {
  return values.map((row) => ({ PrivilegeId: normalizeId(row.PrivilegeId), Depth: String(row.Depth) }))
    .sort((a, b) => `${a.PrivilegeId}:${a.Depth}`.localeCompare(`${b.PrivilegeId}:${b.Depth}`));
}
function expectedBpfId(token) {
  return normalizeId(privateState.records[`Opportunity:${token}`]?.targetBpfInstanceExactId
    || privateState.bpfReadbacks[token]?.targetBpfInstanceExactId);
}

async function pluginSnapshot(preflightRead = false) {
  const assemblies = await all("/api/data/v9.2/pluginassemblies?$select=pluginassemblyid&$filter=name eq 'CrmAiGateway.ActualTotals.Plugin'", "platform", preflightRead);
  if (assemblies.length !== 1) return { enabled: 0, disabled: 0, ready: false };
  const types = await all(`/api/data/v9.2/plugintypes?$select=plugintypeid&$filter=_pluginassemblyid_value eq ${normalizeId(assemblies[0].pluginassemblyid)}`, "platform", preflightRead);
  const typeIds = new Set(types.map((row) => normalizeId(row.plugintypeid)));
  const steps = await all("/api/data/v9.2/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,statecode,_plugintypeid_value", "platform", preflightRead);
  const ours = steps.filter((row) => typeIds.has(normalizeId(row._plugintypeid_value)));
  const enabled = ours.filter((row) => Number(row.statecode) === 0).length;
  const disabled = ours.length - enabled;
  return { enabled, disabled, ready: ours.length === 7 && enabled === 7 && disabled === 0 };
}

async function workflowSnapshot(preflightRead = false) {
  const row = await get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,name,uniquename,statecode,statuscode,processorder,clientdata,modifiedon`, "platform", preflightRead);
  return {
    name: row.name,
    uniqueName: row.uniquename,
    statecode: Number(row.statecode),
    statuscode: Number(row.statuscode),
    processOrder: Number(row.processorder),
    modifiedon: row.modifiedon,
    definitionHash: sha256(Buffer.from(stableJson({ clientdata: row.clientdata || "", statecode: row.statecode, statuscode: row.statuscode, processorder: row.processorder }))),
  };
}

async function bpfSnapshot(token, { poll = false, preflightRead = false } = {}) {
  const exactOpportunityId = opportunityId(token);
  const bpfSet = entitySet(BPF_UNIQUE_NAME);
  let targetRows = [];
  let processes = [];
  let attempts = 0;
  const limit = poll ? 5 : 1;
  for (attempts = 1; attempts <= limit; attempts += 1) {
    targetRows = await all(`/api/data/v9.2/${bpfSet}?$select=${primaryId(BPF_UNIQUE_NAME)},_bpf_opportunityid_value,_activestageid_value,traversedpath,statecode,statuscode,modifiedon&$filter=_bpf_opportunityid_value eq ${exactOpportunityId}`, "platform", preflightRead, ["BPFGET"]);
    const body = await get(`/api/data/v9.2/RetrieveProcessInstances(EntityId=${exactOpportunityId},EntityLogicalName='opportunity')`, "platform", preflightRead, ["BPFGET"]);
    processes = body.value || body.Processes || body.processes || [];
    if (targetRows.length === 1 && processes.length === 1) break;
    if (attempts < limit) await delay(1000);
  }
  const unexpected = processes.filter((row) => normalizeId(row._processid_value || row.ProcessDefinitionID || row.processdefinitionid || row.ProcessId || row.processid) !== normalizeId(BPF_ID));
  const row = targetRows[0] || null;
  return {
    token,
    attempts,
    instanceCount: targetRows.length,
    duplicateCount: Math.max(0, targetRows.length - 1),
    unexpectedProcessCount: unexpected.length,
    processInstanceCount: processes.length,
    instanceId: row?.[primaryId(BPF_UNIQUE_NAME)] || null,
    activeStageId: row?._activestageid_value || null,
    activeStageAlias: sameId(row?._activestageid_value, initialStageId) ? INITIAL_STAGE : null,
    traversedPath: row?.traversedpath || null,
    statecode: row?.statecode ?? null,
    statuscode: row?.statuscode ?? null,
    modifiedon: row?.modifiedon || null,
  };
}

function assertBpfSnapshot(snapshot, token, requireExistingId = false) {
  ensure(snapshot.instanceCount === 1, `BPF:${token} target instance count is ${snapshot.instanceCount}`);
  ensure(snapshot.processInstanceCount === 1, `BPF:${token} process instance count is ${snapshot.processInstanceCount}`);
  ensure(snapshot.duplicateCount === 0, `BPF:${token} duplicate instance`);
  ensure(snapshot.unexpectedProcessCount === 0, `BPF:${token} unexpected process`);
  ensure(snapshot.activeStageAlias === INITIAL_STAGE, `BPF:${token} active stage mismatch`);
  const traversed = String(snapshot.traversedPath || "").split(",").map(normalizeId).filter(Boolean);
  ensure(traversed.length === 1 && traversed[0] === initialStageId, `BPF:${token} traversed path mismatch`);
  ensure(Number(snapshot.statecode) === 0, `BPF:${token} instance is not Active`);
  if (requireExistingId) ensure(sameId(snapshot.instanceId, expectedBpfId(token)), `BPF:${token} exact instance ID changed`);
}

async function verifyBpfForOpportunity(token) {
  const existedBeforeD6 = pilotOpportunityTokens.includes(token) || Boolean(priorPrivate.bpfReadbacks?.[token]);
  const snapshot = await bpfSnapshot(token, { poll: !existedBeforeD6 });
  assertBpfSnapshot(snapshot, token, existedBeforeD6);
  const record = privateState.records[`Opportunity:${token}`];
  ensure(record, `BPF:${token} Opportunity private record missing`);
  record.targetBpfInstanceExactId = normalizeId(snapshot.instanceId);
  record.processAlias = BPF_UNIQUE_NAME;
  record.activeStageAlias = INITIAL_STAGE;
  record.instanceCount = 1;
  record.duplicateCount = 0;
  record.bpfCreatedOrReused = existedBeforeD6 ? "Reused" : "PlatformCreated";
  record.bpfReadbackEvidence = snapshot;
  privateState.bpfReadbacks[token] = {
    targetBpfInstanceExactId: normalizeId(snapshot.instanceId),
    opportunityExactId: opportunityId(token),
    processAlias: BPF_UNIQUE_NAME,
    activeStageAlias: INITIAL_STAGE,
    instanceCount: 1,
    duplicateCount: 0,
    unexpectedProcessCount: 0,
    platformCreated: !existedBeforeD6,
    createdOrReused: record.bpfCreatedOrReused,
    readbackAttempts: snapshot.attempts,
  };
  await persistPrivate();
  return snapshot;
}

async function allBpfSnapshot(tokens = allOpportunityTokens, preflightRead = false) {
  const snapshots = [];
  for (const token of tokens) {
    const snapshot = await bpfSnapshot(token, { preflightRead });
    assertBpfSnapshot(snapshot, token, true);
    snapshots.push(snapshot);
  }
  return {
    rows: snapshots,
    targetInstanceCount: snapshots.reduce((sum, row) => sum + row.instanceCount, 0),
    duplicateCount: snapshots.reduce((sum, row) => sum + row.duplicateCount, 0),
    unexpectedProcessCount: snapshots.reduce((sum, row) => sum + row.unexpectedProcessCount, 0),
    initialStageCount: snapshots.filter((row) => row.activeStageAlias === INITIAL_STAGE).length,
  };
}

async function opportunityStateSnapshot(tokens = allOpportunityTokens, preflightRead = false) {
  const snapshots = [];
  for (const token of tokens) {
    const exactId = opportunityId(token);
    const row = await get(`/api/data/v9.2/${entitySet("opportunity")}(${exactId})?$select=${select([primaryId("opportunity"), "statecode", "statuscode", "actualclosedate", "actualvalue", "aigw_yearrevenueactual", "modifiedon", "versionnumber"])}`, "business", preflightRead);
    snapshots.push({ token, statecode: Number(row.statecode), statuscode: Number(row.statuscode), actualclosedate: row.actualclosedate ?? null, actualvalue: row.actualvalue ?? null, annualActualRevenue: row.aigw_yearrevenueactual ?? null, modifiedon: row.modifiedon || null, versionnumber: row.versionnumber ?? null });
  }
  return snapshots;
}

function stateDistribution(values) {
  return {
    Won: values.filter((row) => row.statecode === 1).length,
    Active: values.filter((row) => row.statecode === 0).length,
    Lost: values.filter((row) => row.statecode === 2).length,
  };
}

async function opportunityCloseSnapshot(token, preflightRead = false) {
  const exactId = opportunityId(token);
  const closes = await all(`/api/data/v9.2/opportunitycloses?$select=activityid,subject,actualrevenue,actualend,description,_opportunityid_value,createdon,modifiedon,statecode,statuscode&$filter=_opportunityid_value eq ${exactId}`, "close", preflightRead);
  let attachmentCount = 0;
  for (const close of closes) {
    const closeId = normalizeId(close.activityid);
    attachmentCount += (await all(`/api/data/v9.2/activitymimeattachments?$select=activitymimeattachmentid&$filter=_objectid_value eq ${closeId}`, "close", preflightRead)).length;
    attachmentCount += (await all(`/api/data/v9.2/annotations?$select=annotationid&$filter=_objectid_value eq ${closeId} and isdocument eq true`, "close", preflightRead)).length;
  }
  return { token, count: closes.length, attachmentCount, rows: closes.map(plainRecord) };
}

async function allOpportunityCloses(tokens = allOpportunityTokens, preflightRead = false) {
  const rows = [];
  for (const token of tokens) rows.push(await opportunityCloseSnapshot(token, preflightRead));
  return {
    rows,
    total: rows.reduce((sum, row) => sum + row.count, 0),
    attachments: rows.reduce((sum, row) => sum + row.attachmentCount, 0),
    duplicates: rows.filter((row) => row.count > 1).length,
  };
}

async function securityAndReferencePreflight() {
  requestCounts.platformGET += 1;
  requestCounts.preflightGET += 1;
  const whoResponse = await client.dataverseGet("/api/data/v9.2/WhoAmI()");
  const serverDateHeader = whoResponse.headers.get("date");
  ensure(serverDateHeader, "Dataverse server Date header is missing");
  executionServerDate = new Date(serverDateHeader).toISOString().slice(0, 10);
  annotationProjectionModes = new Map(rows.Timeline
    .filter((row) => row.activity_entity === "annotation")
    .map((row) => [row._record_token, annotationProjectionMode(excelDate(row.scheduledend_or_actualend), annotationProjectionReferenceDate)]));
  ensure(annotationProjectionModes.get(D6_R3_TIMELINE_SIGNAL.sameDayCanaryToken) === "SameDayBodyDate", "TL-0653 projection mode drifted from SameDayBodyDate");

  const roleId = normalizeId(security.canonicalRoleId);
  const userId = normalizeId(security.approvedUserId);
  const businessUnitId = normalizeId(security.targetBusinessUnitId);
  const roles = await all(`/api/data/v9.2/roles?$select=roleid,name,ismanaged,_businessunitid_value&$filter=name eq 'CRM AI Demo Department Minimal'`, "security", true);
  ensure(roles.length === 1 && sameId(roles[0].roleid, roleId) && roles[0].ismanaged === false && sameId(roles[0]._businessunitid_value, businessUnitId), "Canonical role live readback failed");
  const currentPrivileges = (await get(`/api/data/v9.2/RetrieveRolePrivilegesRole(RoleId=${roleId})`, "security", true)).RolePrivileges || [];
  ensure(stableJson(normalizedPrivilegeRows(currentPrivileges)) === stableJson(normalizedPrivilegeRows(security.readbackEvidence.afterPrivileges)), "Canonical role privilege graph changed");
  ensure(security.readbackEvidence.uniquePrivileges.length === 38 && security.readbackEvidence.globalExceptions.length === 11 && security.readbackEvidence.deletePrivileges.length === 0 && security.readbackEvidence.unexpected.length === 0, "Canonical role frozen privilege baseline failed");

  const owner = await get(`/api/data/v9.2/systemusers(${userId})?$select=systemuserid,isdisabled,islicensed,accessmode,_businessunitid_value`, "security", true);
  ensure(sameId(owner.systemuserid, userId) && owner.isdisabled === false && owner.islicensed === true && Number(owner.accessmode) === 0 && sameId(owner._businessunitid_value, businessUnitId), "Approved owner user gate failed");
  ensure(runtimeMapping.ownerTokenMapping.approved === true && runtimeMapping.ownerTokenMapping.count === 6 && new Set(Object.values(runtimeMapping.ownerTokenMapping.mappings)).size === 1, "Owner Mapping 6/6 gate failed");

  const expectedTeams = security.sevenTeamIds.map((row) => ({ id: normalizeId(row.teamid), name: row.name }));
  const currentTeams = [];
  for (const team of expectedTeams) currentTeams.push(await get(`/api/data/v9.2/teams(${team.id})?$select=teamid,name,teamtype,isdefault,systemmanaged,_businessunitid_value`, "security", true));
  ensure(currentTeams.length === 7 && new Set(currentTeams.map((row) => normalizeId(row.teamid))).size === 7, "Seven distinct Team IDs gate failed");
  ensure(currentTeams.every((row) => Number(row.teamtype) === 0 && row.isdefault === false && row.systemmanaged === false && sameId(row._businessunitid_value, businessUnitId)), "Owner Team definition gate failed");
  ensure(currentTeams.every((row) => expectedTeams.some((team) => sameId(team.id, row.teamid) && team.name === row.name)), "Owner Team name/ID gate failed");
  const memberships = await all(`/api/data/v9.2/teammemberships?$select=systemuserid,teamid&$filter=systemuserid eq ${userId}`, "security", true);
  const scopedMemberships = memberships.filter((row) => expectedTeams.some((team) => sameId(team.id, row.teamid)));
  ensure(scopedMemberships.length === 7 && new Set(scopedMemberships.map((row) => normalizeId(row.teamid))).size === 7, "Team Membership 7/7 gate failed");
  const teamRoles = await all(`/api/data/v9.2/teamrolescollection?$select=teamid,roleid`, "security", true);
  const scopedRoles = teamRoles.filter((row) => expectedTeams.some((team) => sameId(team.id, row.teamid)) && sameId(row.roleid, roleId));
  ensure(scopedRoles.length === 7 && new Set(scopedRoles.map((row) => normalizeId(row.teamid))).size === 7, "Team Role Assignment 7/7 gate failed");

  const currency = await get(`/api/data/v9.2/${entitySet("transactioncurrency")}(${currencyId})?$select=transactioncurrencyid,isocurrencycode,statecode`, "platform", true);
  ensure(currency.isocurrencycode === "CNY" && Number(currency.statecode) === 0, "CNY reference gate failed");
  const requiredLocationNames = [...new Set(allRows.Opportunity.map((row) => String(row.aigw_opportunitylocation_token || "")))].sort();
  ensure(!requiredLocationNames.includes(""), "Formal Opportunity contains an empty Location token");
  const liveLocations = await all(`/api/data/v9.2/${entitySet("aigw_location")}?$select=aigw_locationid,aigw_name,statecode&$filter=statecode eq 0`, "platform", true);
  const locationsByName = groupByKey(liveLocations, (row) => String(row.aigw_name || ""));
  for (const name of requiredLocationNames) ensure(locationsByName.get(name)?.length === 1, `Location reference cardinality is not one: ${name}`);
  locationRefs = new Map(requiredLocationNames.map((name) => [name, locationsByName.get(name)[0]]));

  const polpodTokenFields = ["aigw_sealandpodlookup_token", "aigw_sealandpollookup_token", "aigw_airpodlookup_token", "aigw_airpollookup_token"];
  const requiredPolpodKeys = [...new Set(allRows.Opportunity.flatMap((row) => polpodTokenFields.map((field) => String(row[field] || ""))))].sort();
  ensure(!requiredPolpodKeys.includes(""), "Formal Opportunity contains an empty POL/POD token");
  const livePolpods = await all(`/api/data/v9.2/${entitySet("aigw_polpodlocation")}?$select=aigw_polpodlocationid,aigw_keycode,statecode&$filter=statecode eq 0`, "platform", true);
  const polpodsByKey = groupByKey(livePolpods, (row) => String(row.aigw_keycode || ""));
  for (const key of requiredPolpodKeys) ensure(polpodsByKey.get(key)?.length === 1, `POL/POD reference cardinality is not one: ${key}`);
  polpodRefs = new Map(requiredPolpodKeys.map((key) => [key, polpodsByKey.get(key)[0]]));
  const workflow = await workflowSnapshot(true);
  ensure(workflow.name === BPF_NAME && workflow.uniqueName === BPF_UNIQUE_NAME && workflow.statecode === 1 && workflow.statuscode === 2 && workflow.processOrder === 0 && workflow.definitionHash === "aac15b0adae5d1041df319b7dd187cc4a517c446725e6f2785e68939c015dbf8", "BPF workflow definition gate failed");
  const plugin = await pluginSnapshot(true);
  ensure(plugin.ready, "Plugin 7/0 gate failed");
  return {
    executionServerDate,
    annotationProjectionReferenceDate,
    annotationProjectionCounts: Object.fromEntries(["HistoricalOverride", "SameDayBodyDate", "FutureBodyPlannedDate"].map((mode) => [mode, [...annotationProjectionModes.values()].filter((value) => value === mode).length])),
    ownerMappingCount: runtimeMapping.ownerTokenMapping.count,
    departmentTeamMappingCount: expectedTeams.length,
    canonicalRoleCount: roles.length,
    duplicateRoleCount: 0,
    uniqueRequiredPrivileges: security.readbackEvidence.uniquePrivileges.length,
    approvedGlobalExceptions: security.readbackEvidence.globalExceptions.length,
    deletePrivileges: security.readbackEvidence.deletePrivileges.length,
    teamCount: currentTeams.length,
    membershipCount: scopedMemberships.length,
    teamRoleAssignmentCount: scopedRoles.length,
    referenceCurrencyReady: true,
    requiredLocationReferenceCount: requiredLocationNames.length,
    activeLocationMasterCount: liveLocations.length,
    requiredPolpodReferenceCount: requiredPolpodKeys.length,
    activePolpodMasterCount: livePolpods.length,
    workflow,
    plugin,
  };
}
for (const recordKey of pilotRecordKeys) {
  if (normalizeId(priorPrivate.records?.[recordKey]?.exactRecordId) !== normalizeId(pilotPrivate.records[recordKey].exactRecordId)) throw new Error(`Pilot exact ID changed in D6 private manifest: ${recordKey}`);
}

const client = createDynamicsClient({ env: { ...process.env, DATAVERSE_TIMEOUT_MS: "60000" } });
const requestCountDefaults = {
  UniqueHTTPGET: 0,
  TimelineGET: 0,
  SignalGET: 0,
  ParentOpportunityIntegrityGET: 0,
  BPFGET: 0,
  preflightGET: 0,
  businessCRMGET: 0,
  platformGET: 0,
  securityGET: 0,
  opportunityCloseGET: 0,
  ActualGET: 0,
  AccountPOST: 0,
  ContactPOST: 0,
  OpportunityPOST: 0,
  CoveragePOST: 0,
  ActualPOST: 0,
  TimelinePOST: 0,
  PhonecallPOST: 0,
  AppointmentPOST: 0,
  TaskPOST: 0,
  HistoricalAnnotationPOST: 0,
  SameDayAnnotationPOST: 0,
  FutureAnnotationPOST: 0,
  SignalPOST: 0,
  BpfInstancePOST: 0,
  BpfInstancePATCH: 0,
  BpfInstanceDELETE: 0,
  WinOpportunityAttempts: 0,
  WinOpportunitySuccess: 0,
  LoseOpportunityAttempts: 0,
  LoseOpportunitySuccess: 0,
  PATCH: 0,
  DELETE: 0,
  Publish: 0,
  BPFWrites: 0,
  TeamRoleMembershipChanges: 0,
  ProductionRequests: 0,
  ExternalLLMCalls: 0,
  OtherBusinessPOST: 0,
};
const continuingPhase = priorPrivate.phase === PHASE;
const requestCounts = continuingPhase ? { ...requestCountDefaults, ...(priorPrivate.requestCounts || {}) } : { ...requestCountDefaults };
const requestCountsAtResume = { ...requestCounts };
const stageStats = Object.fromEntries(Object.keys(EXPECTED).map((name) => [name, { attempt: 0, created: 0, reused: 0, failed: 0 }]));
const actionStats = { WinOpportunity: { attempt: 0, succeeded: 0, reused: 0, failed: 0 }, LoseOpportunity: { attempt: 0, succeeded: 0, reused: 0, failed: 0 } };
const publicLedger = [];
const privateState = {
  ...priorPrivate,
  phase: PHASE,
  host,
  generationRun: D6_FULL_IMPORT.generationRun,
  resumeHistory: [...(priorPrivate.resumeHistory || [])],
  resumeExecutionStartedAt: new Date().toISOString(),
  workbook: { formal: { bytes: formalBytes.length, sha256: formalHash }, pilot: { bytes: pilotBytes.length, sha256: pilotHash } },
  records: priorPrivate.records || structuredClone(pilotPrivate.records),
  actions: priorPrivate.actions || {},
  requestCounts,
  stageStats,
  actionStats,
  blockers: [],
  bpfReadbacks: priorPrivate.bpfReadbacks || structuredClone(pilotPrivate.bpfReadbacks),
  batchLedger: priorPrivate.batchLedger || [],
  stateActions: priorPrivate.stateActions || {},
  annotationProjectionEvidence: {
    referenceDate: annotationProjectionReferenceDate,
    source: "R3A Dataverse Date header",
    failedToken: D6_R3_TIMELINE_SIGNAL.sameDayCanaryToken,
    businessDate: excelDate(frozenTl0653.scheduledend_or_actualend),
    rejectedOverriddenCreatedOn: dateTime(frozenTl0653.scheduledend_or_actualend, "09:00:00"),
    failedRequestTimestamp: historicalR3AFailureBatch.completedAt || null,
    historicalCorrelation: priorPrivate.annotationProjectionEvidence?.historicalCorrelation || null,
    historicalCorrelationCaptured: Boolean(priorPrivate.annotationProjectionEvidence?.historicalCorrelation),
    historicalServerRejectionCount: 1,
    historicalLocalCheckpointFailureCount: 1,
  },
};
const persistPrivate = () => fs.writeFile(PRIVATE_MANIFEST, `${JSON.stringify(privateState, null, 2)}\n`);

let currentAuditClassification = null;
async function get(path, kind = "business", preflight = false, auditTags = []) {
  if (/^https?:/i.test(path) && new URL(path).hostname !== EXPECTED_HOST) {
    requestCounts.ProductionRequests += 1;
    throw new Error(`Blocked absolute GET host: ${new URL(path).hostname}`);
  }
  if (kind === "business") requestCounts.businessCRMGET += 1;
  else if (kind === "security") requestCounts.securityGET += 1;
  else if (kind === "close") requestCounts.opportunityCloseGET += 1;
  else requestCounts.platformGET += 1;
  if (preflight) requestCounts.preflightGET += 1;
  requestCounts.UniqueHTTPGET += 1;
  const tags = new Set([...(currentAuditClassification ? [currentAuditClassification] : []), ...auditTags]);
  for (const tag of tags) requestCounts[tag] += 1;
  return (await client.dataverseGet(path)).body;
}
async function all(path, kind = "business", preflight = false, auditTags = []) {
  const result = [];
  let next = path;
  while (next) {
    const body = await get(next, kind, preflight, auditTags);
    result.push(...(body.value || []));
    next = body["@odata.nextLink"]?.replace(dataverseUrl, "") || null;
  }
  return result;
}
async function post(path, body, category) {
  requestCounts[category] += 1;
  const response = await client.dataversePost(path, body);
  return {
    body: response.body,
    status: response.status,
    correlation: response.headers.get("x-ms-service-request-id") || response.headers.get("req_id") || null,
    entityId: response.headers.get("odata-entityid") || response.headers.get("OData-EntityId") || null,
  };
}
function extractId(response, primaryId) {
  const direct = response.body?.[primaryId];
  if (direct) return normalizeId(direct);
  const match = /\(([0-9a-f-]{36})\)/i.exec(response.entityId || "");
  return normalizeId(match?.[1]);
}
function entity(logicalName) { return preflight.metadata[logicalName].definition; }
function nav(key) { const value = preflight.navigation[key]; if (!value) throw new Error(`Missing navigation: ${key}`); return value; }
function refMap(rows, key) { return new Map(rows.map((row) => [String(row[key]), row])); }
function groupByKey(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, [...(groups.get(key) || []), value]);
  }
  return groups;
}
function requiredReferenceId(references, token, idField, label) {
  const row = references.get(String(token || ""));
  ensure(row, `${label} reference is unresolved: ${token || "[EMPTY]"}`);
  const exactId = normalizeId(row[idField]);
  ensure(/^[0-9a-f-]{36}$/.test(exactId), `${label} reference ID is invalid: ${token}`);
  return exactId;
}
const accountRows = new Map(allRows.Account.map((row) => [row._record_token, row]));
const contactRows = new Map(allRows.Contact.map((row) => [row._record_token, row]));
const opportunityRows = new Map(allRows.Opportunity.map((row) => [row._record_token, row]));
const timelineRows = new Map(allRows.Timeline.map((row) => [row._record_token, row]));
let executionServerDate = null;
let annotationProjectionModes = new Map();
let currentBatchId = null;
let locationRefs = new Map();
let polpodRefs = new Map();
const teamRefs = refMap(preflight.references.teams, "name");
const currencyId = normalizeId(preflight.references.baseCurrencyId);
const ownerId = normalizeId(preflight.references.ownerUser.systemuserid);
const departmentTeamId = (token) => {
  const name = runtimeMapping.departmentTeamMapping.mappings[token];
  const row = teamRefs.get(name);
  if (!row) throw new Error(`Missing approved Team alias for ${token}`);
  return normalizeId(row.teamid);
};
const accountId = (token) => recordId("Account", token);
const contactId = (token) => recordId("Contact", token);
const opportunityId = (token) => recordId("Opportunity", token);
function recordId(kind, token) {
  const value = privateState.records[`${kind}:${token}`]?.exactRecordId;
  if (!value) throw new Error(`Missing exact parent ID: ${kind}:${token}`);
  return normalizeId(value);
}

function convert(entityName, attribute, value) {
  if (value === null || value === undefined || value === "") return undefined;
  const metadata = preflight.metadata[entityName].metadata?.attributes?.[attribute] || preflight.metadata[entityName].attributes?.[attribute] || preflight.metadata[entityName].attributes?.[attribute];
  const type = preflight.metadata[entityName].attributes[attribute]?.AttributeType;
  if (type === "DateTime") return excelDate(value);
  if (type === "Boolean") return typeof value === "boolean" ? value : Number(value) === 1;
  if (["Picklist", "Integer", "BigInt", "Decimal", "Double", "Money"].includes(type)) return Number(value);
  return value;
}
function put(payload, entityName, attribute, value) {
  const converted = convert(entityName, attribute, value);
  if (converted !== undefined) payload[attribute] = converted;
}
function bind(payload, navigation, entitySet, exactId) {
  const normalized = normalizeId(exactId);
  ensure(/^[0-9a-f-]{36}$/.test(normalized), `Invalid ${navigation} bind reference`);
  payload[`${navigation}@odata.bind`] = `/${entitySet}(${normalized})`;
}
function sameId(a, b) { return normalizeId(a) === normalizeId(b); }
function ensure(condition, message) { if (!condition) throw new Error(message); }
function verifySimple(entityName, row, readback, fields) {
  for (const field of fields) {
    if (row[field] === null || row[field] === undefined || row[field] === "") continue;
    const expected = convert(entityName, field, row[field]);
    const actual = readback[field];
    if (preflight.metadata[entityName].attributes[field]?.AttributeType === "DateTime") ensure(String(actual || "").slice(0, 10) === String(expected).slice(0, 10), `${entityName}.${field} date mismatch`);
    else if (typeof expected === "number") ensure(Number(actual) === expected, `${entityName}.${field} numeric mismatch`);
    else ensure(actual === expected, `${entityName}.${field} mismatch`);
  }
}
function authorizedD6State(token) {
  const action = privateState.actions?.[token];
  if (!action?.actionStatus?.startsWith("Succeeded")) return null;
  if (action.actionType === "WinOpportunity") return { statecode: 1, statuscode: 3, actualclosedate: action.actualEnd };
  const desiredStatus = opportunityRows.get(token)?._desired_status;
  const option = preflight.statusOptions.find((item) => Number(item.state) === 2 && item.labels?.["2052"] === desiredStatus);
  ensure(option, `Opportunity:${token} resumed Lost status metadata missing`);
  return { statecode: 2, statuscode: Number(option.value), actualclosedate: action.actualEnd };
}

function completedPilotAction(token) {
  let match = null;
  const visit = (value) => {
    if (match || !value) return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== "object") return;
    if (value.opportunityToken === token && String(value.actionStatus || "").startsWith("Succeeded")) {
      match = value;
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(privateState.pilotStateActions);
  return match;
}

function frozenOpportunityState(token) {
  const d6Action = authorizedD6State(token);
  if (d6Action) return d6Action;
  const action = completedPilotAction(token);
  if (!action) return { statecode: 0, statuscode: 1, actualclosedate: null };
  const actualclosedate = action.actualEnd ? String(action.actualEnd).slice(0, 10) : excelDate(opportunityRows.get(token)?._actual_close_date_for_action);
  ensure(actualclosedate, `Opportunity:${token} frozen close date is missing`);
  return action.actionType === "WinOpportunity"
    ? { statecode: 1, statuscode: 3, actualclosedate }
    : { statecode: 2, statuscode: 4, actualclosedate };
}

async function upsert({ kind, token, parentToken = null, logicalName, find, createPayload, readById, verify, postCategory = null }) {
  const stats = stageStats[kind];
  const recordKey = `${kind}:${token}`;
  stats.attempt += 1;
  let matches;
  try { matches = await find(); } catch (error) { stats.failed += 1; throw error; }
  if (matches.length > 1) { stats.failed += 1; throw new Error(`${kind}:${token} ambiguous exact match`); }
  let result = "Reused";
  let exactRecordId;
  let correlation = null;
  let postStatus = null;
  if (matches.length === 1) {
    exactRecordId = normalizeId(matches[0][entity(logicalName).PrimaryIdAttribute]);
    if (priorPrivate.records?.[recordKey]?.exactRecordId) ensure(sameId(exactRecordId, priorPrivate.records[recordKey].exactRecordId), `${kind}:${token} private exact ID mismatch`);
    verify(matches[0], "read-before-write");
    stats.reused += 1;
  } else {
    if (!flags.apply) {
      result = "MissingDryRun";
      stats.failed += 1;
      publicLedger.push({ entity: kind, token, parentToken, result });
      return null;
    }
    let response;
    try {
      const category = postCategory || `${kind === "ServiceCoverage" ? "Coverage" : kind === "ActualManagement" ? "Actual" : kind === "InteractionSignal" ? "Signal" : kind === "Timeline" ? "Timeline" : kind}POST`;
      if (kind === "Timeline" && category !== "TimelinePOST") requestCounts.TimelinePOST += 1;
      response = await post(`/api/data/v9.2/${entity(logicalName).EntitySetName}`, createPayload(), category);
      exactRecordId = extractId(response, entity(logicalName).PrimaryIdAttribute);
      correlation = response.correlation;
      postStatus = response.status;
    } catch (error) {
      const knownNoCreate = Number(error.status) >= 400 && Number(error.status) < 500;
      if (knownNoCreate) { stats.failed += 1; throw error; }
      const afterUnknown = await find();
      if (afterUnknown.length !== 1) { stats.failed += 1; throw error; }
      exactRecordId = normalizeId(afterUnknown[0][entity(logicalName).PrimaryIdAttribute]);
      verify(afterUnknown[0], "unknown-post-readback");
      result = "CreatedAfterUnknown";
      postStatus = Number(error.status || 0) || null;
    }
    if (!exactRecordId) {
      const after = await find();
      if (after.length !== 1) { stats.failed += 1; throw new Error(`${kind}:${token} POST returned no exact ID`); }
      exactRecordId = normalizeId(after[0][entity(logicalName).PrimaryIdAttribute]);
    }
    if (result !== "CreatedAfterUnknown") result = "Created";
    stats.created += 1;
  }
  const readback = await readById(exactRecordId);
  verify(readback, "exact-readback");
  const priorRecord = privateState.records[recordKey] || null;
  privateState.records[recordKey] = {
    ...(priorRecord || {}),
    generationRun: privateState.generationRun,
    stableToken: token,
    entity: kind,
    exactRecordId,
    parentRecordId: parentToken ? Object.values(privateState.records).find((item) => item.stableToken === parentToken)?.exactRecordId || null : null,
    createdOrReused: priorRecord?.createdOrReused || (String(result).startsWith("Created") ? "Created" : "Reused"),
    d6Result: result,
    batchId: currentBatchId,
    attemptTimestamp: new Date().toISOString(),
    requestCorrelation: correlation,
    postStatus,
    readbackEvidence: readback,
    cleanupEligibility: Boolean(priorRecord?.cleanupEligibility) || result.startsWith("Created"),
    phaseResult: result,
    resumeResult: result,
  };
  publicLedger.push({ entity: kind, token, parentToken, batchId: currentBatchId, result, exactReadback: true, cleanupEligibility: privateState.records[recordKey].cleanupEligibility });
  await persistPrivate();
  return readback;
}

const entitySet = (name) => entity(name).EntitySetName;
const primaryId = (name) => entity(name).PrimaryIdAttribute;
const select = (fields) => [...new Set(fields)].join(",");

async function importAccount(row) {
  const token = row._record_token;
  return upsert({
    kind: "Account", token, logicalName: "account",
    find: async () => all(`/api/data/v9.2/${entitySet("account")}?$select=${select([primaryId("account"), "name", "accountnumber", "description", "statecode", "statuscode"])}&$filter=accountnumber eq ${escapeValue(token)} or name eq ${escapeValue(row.name)}`),
    createPayload: () => ({ name: row.name, accountnumber: row.accountnumber, description: row.description }),
    readById: (exactId) => get(`/api/data/v9.2/${entitySet("account")}(${exactId})?$select=${select([primaryId("account"), "name", "accountnumber", "description", "statecode", "statuscode"])}`),
    verify: (record) => { ensure(record.accountnumber === token, `Account:${token} token mismatch`); ensure(record.name === row.name, `Account:${token} name mismatch`); ensure(Number(record.statecode) === 0, `Account:${token} not active`); },
  });
}

async function importContact(row) {
  const token = row._record_token;
  const parentId = accountId(row.parentcustomerid_token);
  const fields = [primaryId("contact"), "lastname", "jobtitle", "_parentcustomerid_value", "statecode", "statuscode"];
  return upsert({
    kind: "Contact", token, parentToken: row.parentcustomerid_token, logicalName: "contact",
    find: async () => all(`/api/data/v9.2/${entitySet("contact")}?$select=${select(fields)}&$filter=lastname eq ${escapeValue(row.lastname)} and _parentcustomerid_value eq ${parentId}`),
    createPayload: () => { const payload = { lastname: row.lastname, jobtitle: row.jobtitle }; bind(payload, nav("contact.parentcustomerid"), entitySet("account"), parentId); return payload; },
    readById: (exactId) => get(`/api/data/v9.2/${entitySet("contact")}(${exactId})?$select=${select(fields)}`),
    verify: (record) => { ensure(record.lastname === row.lastname, `Contact:${token} name mismatch`); ensure(sameId(record._parentcustomerid_value, parentId), `Contact:${token} parent mismatch`); ensure(Number(record.statecode) === 0, `Contact:${token} not active`); },
  });
}

const opportunitySimpleFields = [
  "name", "aigw_customernamecn", "aigw_startdate", "estimatedclosedate", "aigw_budgetstatus", "aigw_organizationgroup_choice",
  "aigw_salesdepartment_choice", "aigw_sales", "aigw_customerneed_choice", "aigw_proposalcontent_choice", "aigw_opportunitytype",
  "aigw_opportunityrelationship", "aigw_casestage", "aigw_opportunitydetailtype", "aigw_bookingdepartment_choice", "aigw_opportunitylist_bool",
  "aigw_globalinitiative", "aigw_alpscooperation", "aigw_winprobabilityrank", "aigw_goodshandled", "aigw_projectsizeunit",
  "aigw_researchbackground_choice", "aigw_warehousescale", "aigw_wonreason_choice", "aigw_lostreason_choice", "aigw_tradeterms",
  "aigw_transportmode", "aigw_spotcontinuous", "aigw_decider_choice", "description", "aigw_yeargpmpbudget", "aigw_yearrevenuebudget", "aigw_projectsize",
];
const opportunityLookupFields = ["_parentaccountid_value", "_parentcontactid_value", "_ownerid_value", "_transactioncurrencyid_value", "_aigw_opportunitylocation_value", "_aigw_sealandpodlookup_value", "_aigw_sealandpollookup_value", "_aigw_airpodlookup_value", "_aigw_airpollookup_value"];
async function importOpportunity(row) {
  const token = row._record_token;
  const parentAccount = accountId(row.parentaccountid_token);
  const parentContact = contactId(row.parentcontactid_token);
  const fields = [primaryId("opportunity"), ...opportunitySimpleFields, ...opportunityLookupFields, "statecode", "statuscode", "actualclosedate", "aigw_yearrevenueactual", "modifiedon"];
  const locationId = requiredReferenceId(locationRefs, row.aigw_opportunitylocation_token, "aigw_locationid", "Location");
  const sealandPodId = requiredReferenceId(polpodRefs, row.aigw_sealandpodlookup_token, "aigw_polpodlocationid", "Sea/Land POD");
  const sealandPolId = requiredReferenceId(polpodRefs, row.aigw_sealandpollookup_token, "aigw_polpodlocationid", "Sea/Land POL");
  const airPodId = requiredReferenceId(polpodRefs, row.aigw_airpodlookup_token, "aigw_polpodlocationid", "Air POD");
  const airPolId = requiredReferenceId(polpodRefs, row.aigw_airpollookup_token, "aigw_polpodlocationid", "Air POL");
  const expectedRefs = {
    _parentaccountid_value: parentAccount,
    _parentcontactid_value: parentContact,
    _ownerid_value: ownerId,
    _transactioncurrencyid_value: currencyId,
    _aigw_opportunitylocation_value: locationId,
    _aigw_sealandpodlookup_value: sealandPodId,
    _aigw_sealandpollookup_value: sealandPolId,
    _aigw_airpodlookup_value: airPodId,
    _aigw_airpollookup_value: airPolId,
  };
  const readback = await upsert({
    kind: "Opportunity", token, parentToken: row.parentaccountid_token, logicalName: "opportunity",
    find: async () => all(`/api/data/v9.2/${entitySet("opportunity")}?$select=${select(fields)}&$filter=name eq ${escapeValue(row.name)} and _parentaccountid_value eq ${parentAccount}`),
    createPayload: () => {
      const payload = {};
      for (const field of opportunitySimpleFields) put(payload, "opportunity", field, row[field]);
      bind(payload, nav("opportunity.parentaccountid"), entitySet("account"), parentAccount);
      bind(payload, nav("opportunity.parentcontactid"), entitySet("contact"), parentContact);
      bind(payload, nav("opportunity.ownerid"), "systemusers", ownerId);
      bind(payload, nav("opportunity.transactioncurrencyid"), entitySet("transactioncurrency"), currencyId);
      bind(payload, nav("opportunity.aigw_opportunitylocation"), entitySet("aigw_location"), expectedRefs._aigw_opportunitylocation_value);
      for (const [attribute, exactId] of [["aigw_sealandpodlookup", sealandPodId], ["aigw_sealandpollookup", sealandPolId], ["aigw_airpodlookup", airPodId], ["aigw_airpollookup", airPolId]]) {
        bind(payload, nav(`opportunity.${attribute}`), entitySet("aigw_polpodlocation"), exactId);
      }
      return payload;
    },
    readById: (exactId) => get(`/api/data/v9.2/${entitySet("opportunity")}(${exactId})?$select=${select(fields)}`),
    verify: (record) => {
      ensure(record.name === row.name, `Opportunity:${token} name mismatch`);
      for (const [field, value] of Object.entries(expectedRefs)) ensure(sameId(record[field], value), `Opportunity:${token} ${field} mismatch`);
      verifySimple("opportunity", row, record, opportunitySimpleFields);
      const authorizedState = authorizedD6State(token);
      if (authorizedState) {
        ensure(Number(record.statecode) === authorizedState.statecode && Number(record.statuscode) === authorizedState.statuscode, `Opportunity:${token} resumed action state mismatch`);
        ensure(String(record.actualclosedate || "").slice(0, 10) === authorizedState.actualclosedate, `Opportunity:${token} resumed action close date mismatch`);
      } else {
        ensure(Number(record.statecode) === 0 && Number(record.statuscode) === 1, `Opportunity:${token} was not created Active`);
        ensure(record.actualclosedate === null || record.actualclosedate === undefined, `Opportunity:${token} actualclosedate was written during create`);
      }
    },
  });
  await verifyBpfForOpportunity(token);
  return readback;
}

const coverageSimpleFields = ["aigw_name", "aigw_demotoken", "aigw_servicetype", "aigw_coveragestatus", "aigw_startdate", "aigw_enddate", "aigw_nextopportunitywindow", "aigw_revenueband", "aigw_marginband", "aigw_servicesatisfaction", "aigw_lastproposaldate", "aigw_notes"];
async function importCoverage(row) {
  const token = row._record_token;
  const parentId = accountId(row.aigw_accountid_token);
  const teamId = departmentTeamId(row.aigw_responsibledepartment_token);
  const fields = [primaryId("aigw_customerservicecoverage"), ...coverageSimpleFields, "_aigw_accountid_value", "_aigw_responsibledepartment_value", "statecode", "statuscode"];
  async function find() {
    const tokenRows = await all(`/api/data/v9.2/${entitySet("aigw_customerservicecoverage")}?$select=${select(fields)}&$filter=aigw_demotoken eq ${escapeValue(token)}`);
    const dateFilter = row.aigw_startdate == null
      ? `_aigw_accountid_value eq ${parentId} and aigw_servicetype eq ${Number(row.aigw_servicetype)} and aigw_coveragestatus eq ${Number(row.aigw_coveragestatus)} and ${row.aigw_nextopportunitywindow == null ? "aigw_nextopportunitywindow eq null" : `aigw_nextopportunitywindow eq ${excelDate(row.aigw_nextopportunitywindow)}`}`
      : `_aigw_accountid_value eq ${parentId} and aigw_servicetype eq ${Number(row.aigw_servicetype)} and aigw_startdate eq ${excelDate(row.aigw_startdate)}`;
    const keyRows = await all(`/api/data/v9.2/${entitySet("aigw_customerservicecoverage")}?$select=${select(fields)}&$filter=${dateFilter}`);
    return [...new Map([...tokenRows, ...keyRows].map((item) => [normalizeId(item[primaryId("aigw_customerservicecoverage")]), item])).values()];
  }
  return upsert({
    kind: "ServiceCoverage", token, parentToken: row.aigw_accountid_token, logicalName: "aigw_customerservicecoverage", find,
    createPayload: () => { const payload = {}; for (const field of coverageSimpleFields) put(payload, "aigw_customerservicecoverage", field, row[field]); bind(payload, nav("aigw_customerservicecoverage.aigw_accountid"), entitySet("account"), parentId); bind(payload, nav("aigw_customerservicecoverage.aigw_responsibledepartment"), entitySet("team"), teamId); return payload; },
    readById: (exactId) => get(`/api/data/v9.2/${entitySet("aigw_customerservicecoverage")}(${exactId})?$select=${select(fields)}`),
    verify: (record) => { ensure(record.aigw_demotoken === token && record.aigw_name === row.aigw_name, `Coverage:${token} identity mismatch`); ensure(sameId(record._aigw_accountid_value, parentId), `Coverage:${token} parent mismatch`); ensure(sameId(record._aigw_responsibledepartment_value, teamId), `Coverage:${token} Team mismatch`); verifySimple("aigw_customerservicecoverage", row, record, coverageSimpleFields); ensure(Number(record.statecode) === 0, `Coverage:${token} not active`); },
  });
}

const actualSimpleFields = ["aigw_name", ...["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"].flatMap((month) => [`aigw_${month}actualrevenue`, `aigw_${month}actualgp`])];
async function importActual(row) {
  const token = row._record_token;
  const parentId = opportunityId(row.aigw_opportunityid_token);
  const fields = [primaryId("aigw_actualmanagement"), ...actualSimpleFields, "aigw_annualactualrevenue", "_aigw_opportunityid_value", "_transactioncurrencyid_value", "statecode", "statuscode"];
  async function find() {
    const byName = await all(`/api/data/v9.2/${entitySet("aigw_actualmanagement")}?$select=${select(fields)}&$filter=aigw_name eq ${escapeValue(row.aigw_name)}`);
    const byParent = await all(`/api/data/v9.2/${entitySet("aigw_actualmanagement")}?$select=${select(fields)}&$filter=_aigw_opportunityid_value eq ${parentId}`);
    const combined = [...new Map([...byName, ...byParent].map((item) => [normalizeId(item[primaryId("aigw_actualmanagement")]), item])).values()];
    if (byParent.length > 1 || (byParent.length === 1 && byParent[0].aigw_name !== row.aigw_name)) throw new Error(`Actual:${token} one-per-opportunity gate failed`);
    return combined;
  }
  const annual = ["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"].reduce((sum, month) => sum + Number(row[`aigw_${month}actualrevenue`] || 0), 0);
  const readback = await upsert({
    kind: "ActualManagement", token, parentToken: row.aigw_opportunityid_token, logicalName: "aigw_actualmanagement", find,
    createPayload: () => { const payload = {}; for (const field of actualSimpleFields) put(payload, "aigw_actualmanagement", field, row[field]); bind(payload, nav("aigw_actualmanagement.aigw_opportunityid"), entitySet("opportunity"), parentId); bind(payload, nav("aigw_actualmanagement.transactioncurrencyid"), entitySet("transactioncurrency"), currencyId); return payload; },
    readById: (exactId) => get(`/api/data/v9.2/${entitySet("aigw_actualmanagement")}(${exactId})?$select=${select(fields)}`),
    verify: (record) => { ensure(record.aigw_name === row.aigw_name, `Actual:${token} name mismatch`); ensure(sameId(record._aigw_opportunityid_value, parentId), `Actual:${token} parent mismatch`); ensure(sameId(record._transactioncurrencyid_value, currencyId), `Actual:${token} currency mismatch`); verifySimple("aigw_actualmanagement", row, record, actualSimpleFields); ensure(Number(record.aigw_annualactualrevenue) === annual, `Actual:${token} annual revenue mismatch`); ensure(Number(record.statecode) === 0, `Actual:${token} not active`); },
  });
  let parent = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    parent = await get(`/api/data/v9.2/${entitySet("opportunity")}(${parentId})?$select=opportunityid,aigw_yearrevenueactual,statecode,statuscode,actualclosedate,modifiedon,versionnumber`);
    if (Number(parent.aigw_yearrevenueactual) === annual) break;
    if (attempt < 5) await delay(1200);
  }
  ensure(Number(parent.aigw_yearrevenueactual) === annual, `Actual:${token} parent total mismatch`);
  const authorizedParentState = authorizedD6State(row.aigw_opportunityid_token);
  ensure(authorizedParentState ? Number(parent.statecode) === authorizedParentState.statecode : Number(parent.statecode) === 0, `Actual:${token} parent state is outside authorized action state`);
  privateState.records[`ActualManagement:${token}`].pluginParentReadback = parent;
  await persistPrivate();
  return readback;
}

const actualApprovedParentDeltaFields = new Set(["aigw_yearrevenueactual", "modifiedon", "versionnumber"]);
async function opportunityActualSyncSnapshot(opportunityToken) {
  const exactId = opportunityId(opportunityToken);
  const fields = [primaryId("opportunity"), ...opportunitySimpleFields, ...opportunityLookupFields, "statecode", "statuscode", "actualclosedate", "actualvalue", "aigw_yearrevenueactual", "modifiedon", "versionnumber"];
  const row = plainRecord(await get(`/api/data/v9.2/${entitySet("opportunity")}(${exactId})?$select=${select(fields)}`));
  const protectedBusiness = Object.fromEntries(Object.entries(row).filter(([key]) => key !== primaryId("opportunity") && !actualApprovedParentDeltaFields.has(key)));
  return {
    token: opportunityToken,
    statecode: Number(row.statecode),
    statuscode: Number(row.statuscode),
    actualclosedate: row.actualclosedate ?? null,
    annualActualRevenue: row.aigw_yearrevenueactual ?? null,
    modifiedon: row.modifiedon || null,
    versionnumber: row.versionnumber ?? null,
    ownerId: normalizeId(row._ownerid_value),
    department: row.aigw_salesdepartment_choice ?? null,
    accountId: normalizeId(row._parentaccountid_value),
    contactId: normalizeId(row._parentcontactid_value),
    protectedBusinessHash: sha256(Buffer.from(stableJson(protectedBusiness))),
  };
}

async function importActualR2(row) {
  const before = await opportunityActualSyncSnapshot(row.aigw_opportunityid_token);
  const bpfBefore = await bpfSnapshot(row.aigw_opportunityid_token);
  assertBpfSnapshot(bpfBefore, row.aigw_opportunityid_token, true);
  const readback = await importActual(row);
  if (!readback) return null;
  const after = await opportunityActualSyncSnapshot(row.aigw_opportunityid_token);
  const bpfAfter = await bpfSnapshot(row.aigw_opportunityid_token);
  assertBpfSnapshot(bpfAfter, row.aigw_opportunityid_token, true);
  const expectedAnnual = ["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"]
    .reduce((sum, month) => sum + Number(row[`aigw_${month}actualrevenue`] || 0), 0);
  ensure(after.annualActualRevenue !== null && Number(after.annualActualRevenue) === expectedAnnual, `Actual:${row._record_token} parent annual sync mismatch`);
  ensure(before.statecode === after.statecode && before.statuscode === after.statuscode, `Actual:${row._record_token} parent state/status changed`);
  ensure(before.actualclosedate === after.actualclosedate, `Actual:${row._record_token} parent actualclosedate changed`);
  ensure(before.protectedBusinessHash === after.protectedBusinessHash, `Actual:${row._record_token} unexpected parent business change`);
  ensure(sameId(bpfBefore.instanceId, bpfAfter.instanceId), `Actual:${row._record_token} BPF instance changed`);
  ensure(bpfBefore.activeStageId === bpfAfter.activeStageId && bpfBefore.traversedPath === bpfAfter.traversedPath, `Actual:${row._record_token} BPF stage/path changed`);
  const privateRecord = privateState.records[`ActualManagement:${row._record_token}`];
  privateRecord.parentBeforeHash = before.protectedBusinessHash;
  privateRecord.parentAfterHash = after.protectedBusinessHash;
  privateRecord.approvedDeltaFields = [...actualApprovedParentDeltaFields];
  privateRecord.annualActualRevenue = expectedAnnual;
  privateRecord.expectedParentSyncValue = expectedAnnual;
  privateRecord.pluginReadback = { before, after, bpfBefore, bpfAfter };
  await persistPrivate();
  return readback;
}

function timelineLogical(row) { return String(row.activity_entity); }
const PLANNED_DATE_LABEL = "【计划节点日期】";
const BUSINESS_DATE_LABEL = "【业务节点日期】";
const RECORD_CONTENT_LABEL = "【记录内容】";
function annotationMode(row) {
  ensure(timelineLogical(row) === "annotation", `Timeline:${row._record_token} is not an Annotation`);
  const mode = annotationProjectionModes.get(row._record_token)
    || annotationProjectionMode(excelDate(row.scheduledend_or_actualend), annotationProjectionReferenceDate);
  if (row._record_token === D6_R3_TIMELINE_SIGNAL.sameDayCanaryToken) ensure(mode === "SameDayBodyDate", "TL-0653 must remain SameDayBodyDate");
  return mode;
}
function annotationBody(row, mode) {
  return buildProjectedAnnotationBody(row.description_or_notetext, excelDate(row.scheduledend_or_actualend), mode);
}
function markerCount(value, marker) { return String(value || "").split(marker).length - 1; }
function timelineFields(logicalName) {
  if (logicalName === "annotation") return [primaryId(logicalName), "subject", "notetext", "_objectid_value", "_ownerid_value", "createdon", "overriddencreatedon", "isdocument", "mimetype", "filesize", "filename"];
  return [primaryId(logicalName), "subject", "description", "_regardingobjectid_value", ...(logicalName === "appointment" ? ["scheduledstart"] : []), "scheduledend", "statecode", "statuscode"];
}
async function importTimeline(row) {
  const token = row._record_token;
  const logicalName = timelineLogical(row);
  ensure(["phonecall", "appointment", "task", "annotation"].includes(logicalName), `Timeline:${token} unsupported type`);
  const parentId = opportunityId(row.regardingobjectid_token);
  const fields = timelineFields(logicalName);
  const parentLookup = logicalName === "annotation" ? "_objectid_value" : "_regardingobjectid_value";
  const projectionMode = logicalName === "annotation" ? annotationMode(row) : null;
  const bodyDateAnnotation = projectionMode === "SameDayBodyDate" || projectionMode === "FutureBodyPlannedDate";
  const postCategory = logicalName === "phonecall" ? "PhonecallPOST"
    : logicalName === "appointment" ? "AppointmentPOST"
      : logicalName === "task" ? "TaskPOST"
        : projectionMode === "HistoricalOverride" ? "HistoricalAnnotationPOST"
          : projectionMode === "SameDayBodyDate" ? "SameDayAnnotationPOST"
            : "FutureAnnotationPOST";
  const readback = await upsert({
    kind: "Timeline", token, parentToken: row.regardingobjectid_token, logicalName,
    find: async () => all(`/api/data/v9.2/${entitySet(logicalName)}?$select=${select(fields)}&$filter=subject eq ${escapeValue(row.subject)} and ${parentLookup} eq ${parentId}`),
    createPayload: () => {
      const payload = { subject: row.subject };
      if (logicalName === "annotation") {
        payload.notetext = bodyDateAnnotation ? annotationBody(row, projectionMode) : row.description_or_notetext;
        if (projectionMode === "HistoricalOverride") {
          payload.overriddencreatedon = dateTime(row.scheduledend_or_actualend, "09:00:00");
        }
        bind(payload, nav("annotation.objectid"), entitySet("opportunity"), parentId);
        assertAnnotationPayloadFields(payload, projectionMode);
      } else {
        payload.description = row.description_or_notetext;
        payload.scheduledend = dateTime(row.scheduledend_or_actualend, logicalName === "appointment" ? "10:00:00" : "12:00:00");
        if (logicalName === "appointment") payload.scheduledstart = dateTime(row.scheduledend_or_actualend, "09:00:00");
        bind(payload, nav(`${logicalName}.regardingobjectid`), entitySet("opportunity"), parentId);
      }
      return payload;
    },
    readById: (exactId) => get(`/api/data/v9.2/${entitySet(logicalName)}(${exactId})?$select=${select(fields)}`),
    verify: (record) => {
      ensure(record.subject === row.subject, `Timeline:${token} subject mismatch`);
      ensure(sameId(record[parentLookup], parentId), `Timeline:${token} regarding mismatch`);
      if (logicalName === "annotation") {
        if (bodyDateAnnotation) {
          const marker = projectionMode === "SameDayBodyDate" ? BUSINESS_DATE_LABEL : PLANNED_DATE_LABEL;
          const expectedBody = annotationBody(row, projectionMode);
          ensure(record.notetext === expectedBody, `Timeline:${token} body-date Annotation body mismatch`);
          ensure(markerCount(record.notetext, marker) === 1, `Timeline:${token} duplicate body-date marker`);
          ensure(record.notetext.includes(String(row.description_or_notetext || "")), `Timeline:${token} original body content was not preserved`);
          ensure(record.overriddencreatedon === null || record.overriddencreatedon === undefined, `Timeline:${token} body-date Annotation system override date was written`);
          ensure(record.isdocument === false, `Timeline:${token} Annotation unexpectedly became a document`);
          ensure(record.filesize === null || record.filesize === undefined || Number(record.filesize) === 0, `Timeline:${token} Annotation has a file size`);
          ensure(record.filename === null || record.filename === undefined || record.filename === "", `Timeline:${token} Annotation has a filename`);
        } else {
          ensure(record.notetext === row.description_or_notetext, `Timeline:${token} note mismatch`);
          const sourceDate = excelDate(row.scheduledend_or_actualend);
          ensure(String(record.createdon || record.overriddencreatedon || "").slice(0, 10) === sourceDate, `Timeline:${token} annotation date mismatch`);
        }
      } else {
        ensure(record.description === row.description_or_notetext, `Timeline:${token} body mismatch`);
        ensure(String(record.scheduledend || "").slice(0, 10) === excelDate(row.scheduledend_or_actualend), `Timeline:${token} date mismatch`);
        ensure(Number(record.statecode) === 0, `Timeline:${token} activity was not left Open`);
      }
    },
    postCategory,
  });
  const privateRecord = privateState.records[`Timeline:${token}`];
  privateRecord.activityEntity = logicalName;
  privateRecord.parentOpportunityId = parentId;
  privateRecord.systemCreatedOn = readback.createdon || null;
  privateRecord.businessEffectiveDate = excelDate(row.scheduledend_or_actualend);
  privateRecord.dateProjectionMode = logicalName === "annotation"
    ? projectionMode
    : logicalName === "appointment" ? "ScheduledStartScheduledEnd" : "ScheduledEnd";
  if (logicalName === "annotation") privateRecord.originalBodyHash = sha256(Buffer.from(String(row.description_or_notetext || "")));
  await persistPrivate();
  if (bodyDateAnnotation) {
    privateRecord.exactAnnotationId = privateRecord.exactRecordId;
    privateRecord.parentOpportunityId = parentId;
    privateRecord.systemCreatedOn = readback.createdon;
    privateRecord.businessEffectiveDate = excelDate(row.scheduledend_or_actualend);
    privateRecord.dateProjectionMode = projectionMode;
    privateRecord.overriddenCreatedOnSent = false;
    privateRecord.bodyMarkerCount = markerCount(readback.notetext, projectionMode === "SameDayBodyDate" ? BUSINESS_DATE_LABEL : PLANNED_DATE_LABEL);
    await persistPrivate();
  }
  return readback;
}

const signalSimpleFields = ["aigw_name", "aigw_interactiontoken", "aigw_sourceactivitytoken", "aigw_activitydate", "aigw_activitytype", "aigw_direction", "aigw_resultcategory", "aigw_nextstep", "aigw_budgetmentioned", "aigw_decisionmakerinvolved", "aigw_objectionpresent", "aigw_objectioncategory", "aigw_competitormentioned", "aigw_commitmentmade", "aigw_commitmentduedate", "aigw_commitmentcompleted", "aigw_customerresponselevel", "aigw_sentiment", "aigw_serviceissuecategory", "aigw_issueresolved", "aigw_sanitizedsummary"];
const activityTypeValues = { phonecall: 388560000, appointment: 388560001, task: 388560002, annotation: 388560003 };
async function importSignal(row) {
  const token = row._record_token;
  const parentOpp = opportunityId(row.aigw_opportunityid_token);
  const parentAccount = accountId(row.aigw_accountid_token);
  const teamId = departmentTeamId(row.aigw_salesdepartment_token);
  const source = privateState.records[`Timeline:${row.aigw_sourceactivitytoken}`];
  const sourceRow = timelineRows.get(row.aigw_sourceactivitytoken);
  ensure(source?.exactRecordId, `Signal:${token} source activity missing`);
  ensure(sourceRow, `Signal:${token} source Timeline row missing`);
  ensure(Number(row.aigw_activitytype) === activityTypeValues[sourceRow.activity_entity], `Signal:${token} source activity type mismatch`);
  ensure(excelDate(row.aigw_activitydate) === excelDate(sourceRow.scheduledend_or_actualend), `Signal:${token} business effective date mismatch`);
  ensure(!/createdon|overriddencreatedon/i.test(String(row.aigw_sanitizedsummary || "")), `Signal:${token} summary leaks system date semantics`);
  const fields = [primaryId("aigw_interactionsignal"), ...signalSimpleFields, "_aigw_opportunityid_value", "_aigw_accountid_value", "_aigw_salesdepartment_value", "statecode", "statuscode"];
  const readback = await upsert({
    kind: "InteractionSignal", token, parentToken: row.aigw_opportunityid_token, logicalName: "aigw_interactionsignal",
    find: async () => all(`/api/data/v9.2/${entitySet("aigw_interactionsignal")}?$select=${select(fields)}&$filter=aigw_interactiontoken eq ${escapeValue(token)}`),
    createPayload: () => { const payload = {}; for (const field of signalSimpleFields) put(payload, "aigw_interactionsignal", field, row[field]); bind(payload, nav("aigw_interactionsignal.aigw_opportunityid"), entitySet("opportunity"), parentOpp); bind(payload, nav("aigw_interactionsignal.aigw_accountid"), entitySet("account"), parentAccount); bind(payload, nav("aigw_interactionsignal.aigw_salesdepartment"), entitySet("team"), teamId); return payload; },
    readById: (exactId) => get(`/api/data/v9.2/${entitySet("aigw_interactionsignal")}(${exactId})?$select=${select(fields)}`),
    verify: (record) => { ensure(record.aigw_interactiontoken === token && record.aigw_name === row.aigw_name, `Signal:${token} identity mismatch`); ensure(record.aigw_sourceactivitytoken === row.aigw_sourceactivitytoken, `Signal:${token} source token mismatch`); ensure(sameId(record._aigw_opportunityid_value, parentOpp) && sameId(record._aigw_accountid_value, parentAccount), `Signal:${token} parent mismatch`); ensure(sameId(record._aigw_salesdepartment_value, teamId), `Signal:${token} Team mismatch`); verifySimple("aigw_interactionsignal", row, record, signalSimpleFields); ensure(Number(record.statecode) === 0, `Signal:${token} not active`); },
  });
  const privateRecord = privateState.records[`InteractionSignal:${token}`];
  privateRecord.sourceActivityExactId = source.exactRecordId;
  privateRecord.sourceActivityToken = row.aigw_sourceactivitytoken;
  privateRecord.parentOpportunityId = parentOpp;
  privateRecord.sourceActivityType = sourceRow.activity_entity;
  privateRecord.businessEffectiveDate = excelDate(row.aigw_activitydate);
  await persistPrivate();
  return readback;
}

const kindToLogicalName = {
  Account: "account",
  Contact: "contact",
  Opportunity: "opportunity",
  ServiceCoverage: "aigw_customerservicecoverage",
  ActualManagement: "aigw_actualmanagement",
  InteractionSignal: "aigw_interactionsignal",
};
const stableOmissions = new Set(["createdon", "modifiedon", "versionnumber", "overriddencreatedon"]);
const opportunityAuthorizedChanges = new Set(["statecode", "statuscode", "actualclosedate", "actualvalue", "aigw_yearrevenueactual"]);

function logicalNameForPrivateRecord(record) {
  if (record.entity !== "Timeline") return kindToLogicalName[record.entity];
  const source = timelineRows.get(record.stableToken);
  ensure(source?.activity_entity, `Timeline logical name missing: ${record.stableToken}`);
  return source.activity_entity;
}
function stableBusinessRecord(logicalName, record) {
  const primary = primaryId(logicalName);
  return Object.fromEntries(Object.entries(plainRecord(record)).filter(([key]) => {
    if (key === primary || stableOmissions.has(key)) return false;
    if (logicalName === "opportunity" && opportunityAuthorizedChanges.has(key)) return false;
    return true;
  }));
}
async function readPrivateRecord(recordKey, record, preflightRead = false) {
  const logicalName = logicalNameForPrivateRecord(record);
  const primary = primaryId(logicalName);
  const baseline = record.readbackEvidence || {};
  const fields = [...new Set([primary, ...Object.keys(baseline).filter((key) => !key.includes("@"))])];
  const exactId = normalizeId(record.exactRecordId);
  ensure(/^[0-9a-f-]{36}$/.test(exactId), `${recordKey} exact ID missing`);
  const body = await get(`/api/data/v9.2/${entitySet(logicalName)}(${exactId})?$select=${select(fields)}`, "business", preflightRead);
  ensure(sameId(body[primary], exactId), `${recordKey} exact ID readback mismatch`);
  const expected = stableBusinessRecord(logicalName, baseline);
  const actual = stableBusinessRecord(logicalName, body);
  ensure(stableJson(actual) === stableJson(expected), `${recordKey} protected business hash changed`);
  return { recordKey, entity: record.entity, token: record.stableToken, hash: sha256(Buffer.from(stableJson(actual))) };
}

async function fullExplicitReadback(preflightRead = false) {
  const entries = Object.entries(privateState.records).sort(([a], [b]) => a.localeCompare(b));
  ensure(entries.length === D6_FULL_IMPORT.explicitFinal, `Private explicit record count is ${entries.length}`);
  const counts = {};
  const hashes = [];
  const exactIdsByEntity = new Map();
  for (const [recordKey, record] of entries) {
    const result = await readPrivateRecord(recordKey, record, preflightRead);
    counts[result.entity] = (counts[result.entity] || 0) + 1;
    hashes.push({ key: recordKey, hash: result.hash });
    const ids = exactIdsByEntity.get(result.entity) || new Set();
    ensure(!ids.has(normalizeId(record.exactRecordId)), `${result.entity} duplicate exact ID in private manifest`);
    ids.add(normalizeId(record.exactRecordId));
    exactIdsByEntity.set(result.entity, ids);
    if (hashes.length % 100 === 0) console.log(JSON.stringify({ step: "final-exact-readback", completed: hashes.length, total: entries.length }));
  }
  for (const [entityName, expected] of Object.entries(D6_FULL_IMPORT.formalCounts)) ensure(counts[entityName] === expected, `${entityName} final exact count mismatch`);
  return { recordCount: entries.length, counts, protectedBusinessHash: sha256(Buffer.from(stableJson(hashes))) };
}

function relatedKeysForOpportunity(opportunityToken) {
  const exactOpportunityId = opportunityId(opportunityToken);
  const opportunityRow = opportunityRows.get(opportunityToken);
  const exactAccountId = accountId(opportunityRow.parentaccountid_token);
  return Object.entries(privateState.records).filter(([key, record]) => {
    if (key === `Opportunity:${opportunityToken}` || key === `Account:${opportunityRow.parentaccountid_token}` || key === `Contact:${opportunityRow.parentcontactid_token}`) return true;
    if (["ActualManagement", "Timeline", "InteractionSignal"].includes(record.entity) && sameId(record.parentRecordId, exactOpportunityId)) return true;
    return record.entity === "ServiceCoverage" && sameId(record.parentRecordId, exactAccountId);
  }).map(([key]) => key).sort();
}
async function relatedBusinessSnapshot(opportunityToken) {
  const rows = [];
  for (const key of relatedKeysForOpportunity(opportunityToken)) rows.push(await readPrivateRecord(key, privateState.records[key]));
  return { recordCount: rows.length, hash: sha256(Buffer.from(stableJson(rows))), rows };
}

async function verifyPilotBaseline() {
  const states = await opportunityStateSnapshot(pilotOpportunityTokens, true);
  const distribution = stateDistribution(states);
  ensure(stableJson(distribution) === stableJson(D6_FULL_IMPORT.pilotState), `Pilot state baseline mismatch: ${JSON.stringify(distribution)}`);
  const closes = await allOpportunityCloses(pilotOpportunityTokens, true);
  ensure(closes.total === 8 && closes.duplicates === 0 && closes.attachments === 0, "Pilot OpportunityClose baseline mismatch");
  const bpf = await allBpfSnapshot(pilotOpportunityTokens, true);
  ensure(bpf.targetInstanceCount === 24 && bpf.duplicateCount === 0 && bpf.unexpectedProcessCount === 0 && bpf.initialStageCount === 24, "Pilot BPF baseline mismatch");
  return { states: distribution, opportunityClose: { total: closes.total, duplicates: closes.duplicates, attachments: closes.attachments }, bpf: { targetInstanceCount: bpf.targetInstanceCount, duplicateCount: bpf.duplicateCount, unexpectedProcessCount: bpf.unexpectedProcessCount, initialStageCount: bpf.initialStageCount } };
}

function privateEntityCounts() {
  return Object.values(privateState.records).reduce((counts, record) => {
    counts[record.entity] = (counts[record.entity] || 0) + 1;
    return counts;
  }, {});
}

async function verifyD6R1Baseline() {
  const entries = Object.entries(privateState.records).sort(([left], [right]) => left.localeCompare(right));
  ensure(entries.length === D6_R1_OPPORTUNITY_RECOVERY.baselineExplicitRecords, `D6-R1 private baseline expected ${D6_R1_OPPORTUNITY_RECOVERY.baselineExplicitRecords} records`);
  const counts = privateEntityCounts();
  ensure(stableJson(counts) === stableJson(D6_R1_OPPORTUNITY_RECOVERY.baselineEntityCounts), `D6-R1 entity baseline mismatch: ${JSON.stringify(counts)}`);
  ensure(Object.keys(privateState.bpfReadbacks).length === D6_R1_OPPORTUNITY_RECOVERY.baselineBpfCount, "D6-R1 BPF private baseline mismatch");
  ensure(!privateState.records[`Opportunity:${D6_R1_OPPORTUNITY_RECOVERY.failedToken}`], `D6-R1 failed token already exists: ${D6_R1_OPPORTUNITY_RECOVERY.failedToken}`);

  const selection = selectOpportunityRecoveryRows(rows.Opportunity, privateState.records);
  ensure(stableJson(selection.alreadyImported.map((row) => row._record_token)) === stableJson(["DEMO-OPP-001", "DEMO-OPP-002", "DEMO-OPP-003", "DEMO-OPP-004"]), "D6-R1 existing complement Opportunity set changed");

  for (let index = 0; index < entries.length; index += 1) {
    await readPrivateRecord(entries[index][0], entries[index][1], true);
    if ((index + 1) % 100 === 0) console.log(JSON.stringify({ step: "d6-r1-baseline-readback", completed: index + 1, total: entries.length }));
  }

  const existingOpportunityTokens = Object.values(privateState.records)
    .filter((record) => record.entity === "Opportunity")
    .map((record) => record.stableToken)
    .sort();
  const states = await opportunityStateSnapshot(existingOpportunityTokens, true);
  const distribution = stateDistribution(states);
  ensure(stableJson(distribution) === stableJson({ Won: 7, Active: 20, Lost: 1 }), `D6-R1 Opportunity state baseline mismatch: ${JSON.stringify(distribution)}`);
  const closes = await allOpportunityCloses(existingOpportunityTokens, true);
  ensure(closes.total === 8 && closes.duplicates === 0 && closes.attachments === 0, "D6-R1 OpportunityClose baseline mismatch");
  const bpf = await allBpfSnapshot(existingOpportunityTokens, true);
  ensure(bpf.targetInstanceCount === 28 && bpf.initialStageCount === 28 && bpf.duplicateCount === 0 && bpf.unexpectedProcessCount === 0, "D6-R1 live BPF baseline mismatch");
  return {
    explicitRecordCount: entries.length,
    entityCounts: counts,
    existingComplementOpportunityCount: selection.alreadyImported.length,
    pendingOpportunityCount: selection.pending.length,
    firstPendingToken: selection.pending[0]._record_token,
    distribution,
    opportunityClose: { total: closes.total, duplicates: closes.duplicates, attachments: closes.attachments },
    bpf: { targetInstanceCount: bpf.targetInstanceCount, initialStageCount: bpf.initialStageCount, duplicateCount: bpf.duplicateCount, unexpectedProcessCount: bpf.unexpectedProcessCount },
  };
}

const batchPrefixes = { Account: "A", Contact: "C", Opportunity: "O", ServiceCoverage: "V", ActualManagement: "M", Timeline: "T", InteractionSignal: "S" };
const importers = { Account: importAccount, Contact: importContact, Opportunity: importOpportunity, ServiceCoverage: importCoverage, ActualManagement: importActual, Timeline: importTimeline, InteractionSignal: importSignal };
async function runEntityBatches(entityName) {
  const batches = buildStableBatches(rows[entityName], D6_FULL_IMPORT.batchSizes[entityName], batchPrefixes[entityName]);
  for (const batch of batches) {
    currentBatchId = batch.id;
    console.log(JSON.stringify({ step: "batch-start", batchId: batch.id, entity: entityName, count: batch.size }));
    const before = { ...stageStats[entityName] };
    const ledger = { batchId: batch.id, entity: entityName, expected: batch.size, startedAt: new Date().toISOString(), attempt: 0, created: 0, reused: 0, failed: 0, completed: false };
    privateState.batchLedger.push(ledger);
    await persistPrivate();
    try {
      for (const row of batch.rows) await importers[entityName](row);
      ledger.attempt = stageStats[entityName].attempt - before.attempt;
      ledger.created = stageStats[entityName].created - before.created;
      ledger.reused = stageStats[entityName].reused - before.reused;
      ledger.failed = stageStats[entityName].failed - before.failed;
      ensure(ledger.attempt === batch.size && ledger.created + ledger.reused === batch.size && ledger.failed === 0, `${batch.id} batch readback gate failed`);
      ledger.completed = true;
      ledger.completedAt = new Date().toISOString();
      await persistPrivate();
      console.log(JSON.stringify({ step: "batch-complete", batchId: batch.id, entity: entityName, attempt: ledger.attempt, created: ledger.created, reused: ledger.reused }));
    } catch (error) {
      ledger.attempt = stageStats[entityName].attempt - before.attempt;
      ledger.created = stageStats[entityName].created - before.created;
      ledger.reused = stageStats[entityName].reused - before.reused;
      ledger.failed = Math.max(1, stageStats[entityName].failed - before.failed);
      ledger.blocker = sanitizeError(error);
      ledger.completedAt = new Date().toISOString();
      await persistPrivate();
      throw error;
    } finally {
      currentBatchId = null;
    }
  }
}

async function runOpportunityRecoveryBatches() {
  const selection = selectOpportunityRecoveryRows(rows.Opportunity, privateState.records);
  const pendingTokens = new Set(selection.pending.map((row) => row._record_token));
  const batches = buildStableBatches(rows.Opportunity, D6_FULL_IMPORT.batchSizes.Opportunity, batchPrefixes.Opportunity);
  let recovered = 0;
  for (const originalBatch of batches) {
    const pendingRows = originalBatch.rows.filter((row) => pendingTokens.has(row._record_token));
    if (!pendingRows.length) continue;
    const batchId = originalBatch.id === "O1" ? "O1-R1" : originalBatch.id;
    currentBatchId = batchId;
    console.log(JSON.stringify({ step: "opportunity-recovery-batch-start", batchId, originalBatchId: originalBatch.id, count: pendingRows.length, firstToken: pendingRows[0]._record_token }));
    const before = { ...stageStats.Opportunity };
    const ledger = { batchId, originalBatchId: originalBatch.id, entity: "Opportunity", expected: pendingRows.length, startedAt: new Date().toISOString(), attempt: 0, created: 0, reused: 0, failed: 0, completed: false, recoveryPhase: D6_R1_OPPORTUNITY_RECOVERY.phase };
    privateState.batchLedger.push(ledger);
    await persistPrivate();
    try {
      for (const row of pendingRows) await importOpportunity(row);
      ledger.attempt = stageStats.Opportunity.attempt - before.attempt;
      ledger.created = stageStats.Opportunity.created - before.created;
      ledger.reused = stageStats.Opportunity.reused - before.reused;
      ledger.failed = stageStats.Opportunity.failed - before.failed;
      ensure(ledger.attempt === pendingRows.length && ledger.created === pendingRows.length && ledger.reused === 0 && ledger.failed === 0, `${batchId} Opportunity recovery readback gate failed`);
      ledger.completed = true;
      ledger.completedAt = new Date().toISOString();
      recovered += pendingRows.length;
      await persistPrivate();
      console.log(JSON.stringify({ step: "opportunity-recovery-batch-complete", batchId, created: ledger.created }));
    } catch (error) {
      ledger.attempt = stageStats.Opportunity.attempt - before.attempt;
      ledger.created = stageStats.Opportunity.created - before.created;
      ledger.reused = stageStats.Opportunity.reused - before.reused;
      ledger.failed = Math.max(1, stageStats.Opportunity.failed - before.failed);
      ledger.blocker = sanitizeError(error);
      ledger.completedAt = new Date().toISOString();
      await persistPrivate();
      throw error;
    } finally {
      currentBatchId = null;
    }
  }
  ensure(recovered === D6_R1_OPPORTUNITY_RECOVERY.pendingOpportunityCount, `D6-R1 recovered ${recovered} Opportunities`);
  return { recovered, batches: batches.filter((batch) => batch.rows.some((row) => pendingTokens.has(row._record_token))).length };
}

async function verifyD6R1OpportunityCompletion() {
  const counts = privateEntityCounts();
  const expectedCounts = { ...D6_R1_OPPORTUNITY_RECOVERY.baselineEntityCounts, Opportunity: D6_R1_OPPORTUNITY_RECOVERY.finalOpportunityCount };
  ensure(stableJson(counts) === stableJson(expectedCounts), `D6-R1 final entity counts mismatch: ${JSON.stringify(counts)}`);
  ensure(Object.keys(privateState.records).length === 767, "D6-R1 final explicit manifest count is not 767");
  ensure(Object.keys(privateState.bpfReadbacks).length === D6_R1_OPPORTUNITY_RECOVERY.finalBpfCount, "D6-R1 final private BPF count is not 200");
  const states = await opportunityStateSnapshot(allOpportunityTokens);
  const distribution = stateDistribution(states);
  ensure(stableJson(distribution) === stableJson(D6_R1_OPPORTUNITY_RECOVERY.finalPreActionState), `D6-R1 final state distribution mismatch: ${JSON.stringify(distribution)}`);
  const closes = await allOpportunityCloses(allOpportunityTokens);
  ensure(closes.total === 8 && closes.duplicates === 0 && closes.attachments === 0, "D6-R1 final OpportunityClose integrity failed");
  const bpf = await allBpfSnapshot(allOpportunityTokens);
  ensure(bpf.targetInstanceCount === 200 && bpf.initialStageCount === 200 && bpf.duplicateCount === 0 && bpf.unexpectedProcessCount === 0, "D6-R1 final BPF integrity failed");
  const plugin = await pluginSnapshot();
  ensure(plugin.ready, "D6-R1 Plugin 7/0 integrity failed");
  const workflow = await workflowSnapshot();
  ensure(workflow.definitionHash === "aac15b0adae5d1041df319b7dd187cc4a517c446725e6f2785e68939c015dbf8" && workflow.processOrder === 0, "D6-R1 BPF definition/order changed");
  return {
    explicitRecordCount: Object.keys(privateState.records).length,
    entityCounts: counts,
    distribution,
    opportunityClose: { total: closes.total, duplicates: closes.duplicates, attachments: closes.attachments },
    bpf: { targetInstanceCount: bpf.targetInstanceCount, initialStageCount: bpf.initialStageCount, duplicateCount: bpf.duplicateCount, unexpectedProcessCount: bpf.unexpectedProcessCount },
    plugin,
    workflow: { active: workflow.statecode === 1 && workflow.statuscode === 2, processOrder: workflow.processOrder, definitionHash: workflow.definitionHash },
  };
}

async function verifyD6R2Baseline() {
  const entries = Object.entries(privateState.records).sort(([left], [right]) => left.localeCompare(right));
  ensure(entries.length === D6_R2_COVERAGE_ACTUAL.baselineExplicitRecords, `D6-R2 private baseline expected ${D6_R2_COVERAGE_ACTUAL.baselineExplicitRecords} records`);
  const counts = privateEntityCounts();
  ensure(stableJson(counts) === stableJson(D6_R2_COVERAGE_ACTUAL.baselineEntityCounts), `D6-R2 entity baseline mismatch: ${JSON.stringify(counts)}`);
  ensure(Object.keys(privateState.bpfReadbacks).length === D6_R2_COVERAGE_ACTUAL.baselineBpfCount, "D6-R2 BPF private baseline mismatch");
  for (const row of rows.ServiceCoverage) ensure(!privateState.records[`ServiceCoverage:${row._record_token}`], `D6-R2 Coverage complement overlaps manifest: ${row._record_token}`);
  for (const row of rows.ActualManagement) ensure(!privateState.records[`ActualManagement:${row._record_token}`], `D6-R2 Actual complement overlaps manifest: ${row._record_token}`);

  for (let index = 0; index < entries.length; index += 1) {
    await readPrivateRecord(entries[index][0], entries[index][1], true);
    if ((index + 1) % 100 === 0) console.log(JSON.stringify({ step: "d6-r2-baseline-readback", completed: index + 1, total: entries.length }));
  }
  const states = await opportunityStateSnapshot(allOpportunityTokens, true);
  const distribution = stateDistribution(states);
  ensure(stableJson(distribution) === stableJson(D6_R2_COVERAGE_ACTUAL.expectedState), `D6-R2 Opportunity state baseline mismatch: ${JSON.stringify(distribution)}`);
  const closes = await allOpportunityCloses(allOpportunityTokens, true);
  ensure(closes.total === 8 && closes.duplicates === 0 && closes.attachments === 0, "D6-R2 OpportunityClose baseline mismatch");
  const bpf = await allBpfSnapshot(allOpportunityTokens, true);
  ensure(bpf.targetInstanceCount === 200 && bpf.initialStageCount === 200 && bpf.duplicateCount === 0 && bpf.unexpectedProcessCount === 0, "D6-R2 BPF baseline mismatch");
  const plugin = await pluginSnapshot(true);
  ensure(plugin.ready, "D6-R2 Plugin 7/0 baseline failed");
  const desiredActualParents = actualDesiredParentDistribution(rows.ActualManagement, allRows.Opportunity);
  ensure(stableJson(desiredActualParents) === stableJson(D6_R2_COVERAGE_ACTUAL.actualDesiredParentDistribution), `D6-R2 Actual desired parent distribution mismatch: ${JSON.stringify(desiredActualParents)}`);
  const canaries = selectCoverageCanaries(rows.ServiceCoverage);
  return {
    explicitRecordCount: entries.length,
    entityCounts: counts,
    distribution,
    opportunityClose: { total: closes.total, duplicates: closes.duplicates, attachments: closes.attachments },
    bpf: { targetInstanceCount: bpf.targetInstanceCount, initialStageCount: bpf.initialStageCount, duplicateCount: bpf.duplicateCount, unexpectedProcessCount: bpf.unexpectedProcessCount },
    plugin,
    desiredActualParents,
    coverageCanaries: { compositeKeyToken: canaries.compositeKey._record_token, nullStartDateToken: canaries.nullStartDate._record_token },
    actualCanaryToken: [...rows.ActualManagement].sort((a, b) => a._record_token.localeCompare(b._record_token))[0]._record_token,
  };
}

async function runD6R2LedgerRows(batchId, entityName, batchRows, importer) {
  currentBatchId = batchId;
  const before = { ...stageStats[entityName] };
  const ledger = { batchId, entity: entityName, expected: batchRows.length, startedAt: new Date().toISOString(), attempt: 0, created: 0, reused: 0, failed: 0, completed: false, recoveryPhase: D6_R2_COVERAGE_ACTUAL.phase };
  privateState.batchLedger.push(ledger);
  await persistPrivate();
  console.log(JSON.stringify({ step: "d6-r2-batch-start", batchId, entity: entityName, count: batchRows.length, firstToken: batchRows[0]?._record_token || null }));
  try {
    for (const row of batchRows) await importer(row);
    ledger.attempt = stageStats[entityName].attempt - before.attempt;
    ledger.created = stageStats[entityName].created - before.created;
    ledger.reused = stageStats[entityName].reused - before.reused;
    ledger.failed = stageStats[entityName].failed - before.failed;
    ensure(ledger.attempt === batchRows.length && ledger.created + ledger.reused === batchRows.length && ledger.failed === 0, `${batchId} D6-R2 readback gate failed`);
    ledger.completed = true;
    ledger.completedAt = new Date().toISOString();
    await persistPrivate();
    console.log(JSON.stringify({ step: "d6-r2-batch-complete", batchId, entity: entityName, created: ledger.created, reused: ledger.reused }));
  } catch (error) {
    ledger.attempt = stageStats[entityName].attempt - before.attempt;
    ledger.created = stageStats[entityName].created - before.created;
    ledger.reused = stageStats[entityName].reused - before.reused;
    ledger.failed = Math.max(1, stageStats[entityName].failed - before.failed);
    ledger.blocker = sanitizeError(error);
    ledger.completedAt = new Date().toISOString();
    await persistPrivate();
    throw error;
  } finally {
    currentBatchId = null;
  }
}

async function runD6R2CoverageActual() {
  const coverageSorted = [...rows.ServiceCoverage].sort((a, b) => a._record_token.localeCompare(b._record_token));
  const coverageCanaries = selectCoverageCanaries(coverageSorted);
  await runD6R2LedgerRows("V-CANARY-A", "ServiceCoverage", [coverageCanaries.compositeKey], importCoverage);
  await runD6R2LedgerRows("V-CANARY-B", "ServiceCoverage", [coverageCanaries.nullStartDate], importCoverage);
  const canaryTokens = new Set([coverageCanaries.compositeKey._record_token, coverageCanaries.nullStartDate._record_token]);
  await runD6R2LedgerRows("V-R2", "ServiceCoverage", coverageSorted.filter((row) => !canaryTokens.has(row._record_token)), importCoverage);
  ensure(stageStats.ServiceCoverage.attempt === 225 && stageStats.ServiceCoverage.created + stageStats.ServiceCoverage.reused === 225 && stageStats.ServiceCoverage.failed === 0, "D6-R2 Coverage stage failed");

  const actualSorted = [...rows.ActualManagement].sort((a, b) => a._record_token.localeCompare(b._record_token));
  await runD6R2LedgerRows("M-CANARY", "ActualManagement", [actualSorted[0]], importActualR2);
  await runD6R2LedgerRows("M-R2", "ActualManagement", actualSorted.slice(1), importActualR2);
  ensure(stageStats.ActualManagement.attempt === 118 && stageStats.ActualManagement.created + stageStats.ActualManagement.reused === 118 && stageStats.ActualManagement.failed === 0, "D6-R2 Actual stage failed");
  return {
    coverage: { canaryCompositeKey: coverageCanaries.compositeKey._record_token, canaryNullStartDate: coverageCanaries.nullStartDate._record_token, attempted: 225 },
    actual: { canary: actualSorted[0]._record_token, attempted: 118 },
  };
}

async function verifyD6R2Completion() {
  const counts = privateEntityCounts();
  const expectedCounts = { ...D6_R2_COVERAGE_ACTUAL.baselineEntityCounts, ServiceCoverage: 240, ActualManagement: 130 };
  ensure(stableJson(counts) === stableJson(expectedCounts), `D6-R2 final entity counts mismatch: ${JSON.stringify(counts)}`);
  ensure(Object.keys(privateState.records).length === D6_R2_COVERAGE_ACTUAL.finalExplicitRecords, "D6-R2 final explicit manifest count is not 1110");

  const formalCoverageByAccount = new Map();
  for (const row of allRows.ServiceCoverage) formalCoverageByAccount.set(row.aigw_accountid_token, [...(formalCoverageByAccount.get(row.aigw_accountid_token) || []), row._record_token].sort());
  for (const accountRow of allRows.Account) {
    const exactAccountId = accountId(accountRow._record_token);
    const live = await all(`/api/data/v9.2/${entitySet("aigw_customerservicecoverage")}?$select=${primaryId("aigw_customerservicecoverage")},aigw_demotoken,_aigw_accountid_value&$filter=_aigw_accountid_value eq ${exactAccountId}`);
    ensure(live.length === 4, `D6-R2 Coverage per Account is not four: ${accountRow._record_token}`);
    ensure(stableJson(live.map((row) => row.aigw_demotoken).sort()) === stableJson(formalCoverageByAccount.get(accountRow._record_token)), `D6-R2 Coverage token set mismatch: ${accountRow._record_token}`);
  }

  const actual = await actualUniquenessReadback();
  ensure(actual.total === 130 && actual.uniquePerOpportunity, "D6-R2 Actual uniqueness failed");
  const syncedActuals = Object.values(privateState.records).filter((record) => record.entity === "ActualManagement" && rows.ActualManagement.some((row) => row._record_token === record.stableToken));
  ensure(syncedActuals.length === 118, "D6-R2 Plugin sync evidence count is not 118");
  ensure(syncedActuals.every((record) => record.parentBeforeHash === record.parentAfterHash && record.pluginReadback?.after?.annualActualRevenue === record.expectedParentSyncValue), "D6-R2 Plugin parent sync evidence failed");

  for (const [recordKey, record] of Object.entries(privateState.records).filter(([, record]) => ["Timeline", "InteractionSignal"].includes(record.entity))) await readPrivateRecord(recordKey, record);
  const states = await opportunityStateSnapshot(allOpportunityTokens);
  const distribution = stateDistribution(states);
  ensure(stableJson(distribution) === stableJson(D6_R2_COVERAGE_ACTUAL.expectedState), `D6-R2 final state distribution mismatch: ${JSON.stringify(distribution)}`);
  const closes = await allOpportunityCloses(allOpportunityTokens);
  ensure(closes.total === 8 && closes.duplicates === 0 && closes.attachments === 0, "D6-R2 OpportunityClose integrity failed");
  const bpf = await allBpfSnapshot(allOpportunityTokens);
  ensure(bpf.targetInstanceCount === 200 && bpf.initialStageCount === 200 && bpf.duplicateCount === 0 && bpf.unexpectedProcessCount === 0, "D6-R2 BPF integrity failed");
  const plugin = await pluginSnapshot();
  ensure(plugin.ready, "D6-R2 Plugin 7/0 integrity failed");
  const workflow = await workflowSnapshot();
  ensure(workflow.definitionHash === "aac15b0adae5d1041df319b7dd187cc4a517c446725e6f2785e68939c015dbf8" && workflow.processOrder === 0, "D6-R2 BPF definition/order changed");
  return {
    explicitRecordCount: Object.keys(privateState.records).length,
    entityCounts: counts,
    coveragePerAccount: 4,
    actual,
    parentOpportunityExpectedSyncCount: syncedActuals.length,
    parentOpportunityUnexpectedBusinessChangeCount: 0,
    distribution,
    opportunityClose: { total: closes.total, duplicates: closes.duplicates, attachments: closes.attachments },
    bpf: { targetInstanceCount: bpf.targetInstanceCount, initialStageCount: bpf.initialStageCount, duplicateCount: bpf.duplicateCount, unexpectedProcessCount: bpf.unexpectedProcessCount },
    timelineDelta: 0,
    signalDelta: 0,
    plugin,
    workflow: { processOrder: workflow.processOrder, definitionHash: workflow.definitionHash },
  };
}

async function timelineParentSnapshots(tokens, preflightRead = false) {
  const uniqueTokens = [...new Set(tokens)].sort();
  const tokenById = new Map(uniqueTokens.map((token) => [opportunityId(token), token]));
  const fields = [primaryId("opportunity"), ...opportunitySimpleFields, ...opportunityLookupFields, "statecode", "statuscode", "actualclosedate", "actualvalue", "aigw_yearrevenueactual", "modifiedon", "versionnumber"];
  const opportunityRows = [];
  for (const batch of buildMaximumBatches(uniqueTokens.map((token) => ({ _record_token: token })), 50, "PARENT-")) {
    const ids = batch.rows.map((row) => opportunityId(row._record_token));
    opportunityRows.push(...await all(`/api/data/v9.2/${entitySet("opportunity")}?$select=${select(fields)}&$filter=${ids.map((id) => `${primaryId("opportunity")} eq ${id}`).join(" or ")}`, "business", preflightRead, ["ParentOpportunityIntegrityGET"]));
  }
  ensure(opportunityRows.length === uniqueTokens.length, "Timeline batch parent Opportunity count mismatch");
  const bpfRows = await all(`/api/data/v9.2/${entitySet(BPF_UNIQUE_NAME)}?$select=${primaryId(BPF_UNIQUE_NAME)},_bpf_opportunityid_value,_activestageid_value,traversedpath,statecode,statuscode`, "platform", preflightRead, ["BPFGET"]);
  const bpfByOpportunity = groupByKey(bpfRows.filter((row) => tokenById.has(normalizeId(row._bpf_opportunityid_value))), (row) => normalizeId(row._bpf_opportunityid_value));
  const snapshots = {};
  for (const rawRow of opportunityRows) {
    const row = plainRecord(rawRow);
    const exactOpportunityId = normalizeId(row[primaryId("opportunity")]);
    const token = tokenById.get(exactOpportunityId);
    const matchingBpf = bpfByOpportunity.get(exactOpportunityId) || [];
    ensure(matchingBpf.length === 1, `Timeline batch BPF count mismatch: ${token}`);
    const bpf = matchingBpf[0];
    ensure(sameId(bpf[primaryId(BPF_UNIQUE_NAME)], expectedBpfId(token)), `Timeline batch BPF instance changed: ${token}`);
    const traversed = String(bpf.traversedpath || "").split(",").map(normalizeId).filter(Boolean);
    ensure(sameId(bpf._activestageid_value, initialStageId) && traversed.length === 1 && traversed[0] === initialStageId, `Timeline batch BPF stage/path changed: ${token}`);
    const protectedBusiness = Object.fromEntries(Object.entries(row).filter(([key]) => key !== primaryId("opportunity") && !actualApprovedParentDeltaFields.has(key)));
    snapshots[token] = {
      token,
      statecode: Number(row.statecode),
      statuscode: Number(row.statuscode),
      actualclosedate: row.actualclosedate ?? null,
      protectedBusinessHash: sha256(Buffer.from(stableJson(protectedBusiness))),
      ownerId: normalizeId(row._ownerid_value),
      department: row.aigw_salesdepartment_choice ?? null,
      accountId: normalizeId(row._parentaccountid_value),
      contactId: normalizeId(row._parentcontactid_value),
      bpfInstanceId: normalizeId(bpf[primaryId(BPF_UNIQUE_NAME)]),
      bpfStageId: normalizeId(bpf._activestageid_value),
      bpfTraversedPath: bpf.traversedpath,
    };
  }
  return snapshots;
}

async function verifyFrozenOpportunityStates(batchId, preflightRead = false) {
  const states = [];
  for (const batch of buildMaximumBatches(allOpportunityTokens.map((token) => ({ _record_token: token })), 50, "STATE-")) {
    const tokenById = new Map(batch.rows.map((row) => [opportunityId(row._record_token), row._record_token]));
    const ids = [...tokenById.keys()];
    const live = await all(`/api/data/v9.2/${entitySet("opportunity")}?$select=${primaryId("opportunity")},statecode,statuscode,actualclosedate&$filter=${ids.map((id) => `${primaryId("opportunity")} eq ${id}`).join(" or ")}`, "business", preflightRead, ["ParentOpportunityIntegrityGET"]);
    ensure(live.length === batch.rows.length, `${batchId} Opportunity checkpoint count mismatch`);
    states.push(...live.map((row) => ({ token: tokenById.get(normalizeId(row[primaryId("opportunity")])), statecode: Number(row.statecode), statuscode: Number(row.statuscode), actualclosedate: row.actualclosedate ?? null })));
  }
  for (const state of states) assertFrozenOpportunityState(state, frozenOpportunityState(state.token), `${batchId} Opportunity:${state.token}`);
  const distribution = stateDistribution(states);
  ensure(stableJson(distribution) === stableJson(D6_R3_TIMELINE_SIGNAL.expectedState), `${batchId} Opportunity state checkpoint mismatch`);
  return { states, distribution };
}

async function verifyD6R3BatchIntegrity(batchId, parentTokens, beforeSnapshots) {
  const afterSnapshots = await timelineParentSnapshots(parentTokens);
  for (const token of parentTokens) {
    assertFrozenOpportunityState(afterSnapshots[token], frozenOpportunityState(token), `${batchId} Opportunity:${token}`);
    assertTimelineParentCheckpoint(beforeSnapshots[token], afterSnapshots[token], `${batchId} Opportunity:${token}`);
  }
  const { distribution } = await verifyFrozenOpportunityStates(batchId);
  const opportunityIds = new Set(allOpportunityTokens.map((token) => opportunityId(token)));

  const bpfRows = (await all(`/api/data/v9.2/${entitySet(BPF_UNIQUE_NAME)}?$select=${primaryId(BPF_UNIQUE_NAME)},_bpf_opportunityid_value,_activestageid_value,statecode`, "platform"))
    .filter((row) => opportunityIds.has(normalizeId(row._bpf_opportunityid_value)));
  const byOpportunity = groupByKey(bpfRows, (row) => normalizeId(row._bpf_opportunityid_value));
  ensure(bpfRows.length === 200 && byOpportunity.size === 200 && [...byOpportunity.values()].every((values) => values.length === 1), `${batchId} BPF duplicate checkpoint failed`);
  ensure(bpfRows.every((row) => sameId(row._activestageid_value, initialStageId) && Number(row.statecode) === 0), `${batchId} BPF stage checkpoint failed`);
  return { batchId, parentCount: parentTokens.length, opportunityState: distribution, parentCheckpointMismatchCount: 0, bpf: { targetInstanceCount: bpfRows.length, duplicateCount: 0, initialStageCount: bpfRows.length } };
}

async function validateD6R3Canary(row, kind, category) {
  const token = row._record_token;
  ensure(rows[kind].some((item) => item._record_token === token), `${kind}:${token} is outside Remaining176`);
  ensure(!privateState.records[`${kind}:${token}`], `${kind}:${token} already exists in private manifest before Canary`);
  const parentToken = kind === "Timeline" ? row.regardingobjectid_token : row.aigw_opportunityid_token;
  const parent = await get(`/api/data/v9.2/${entitySet("opportunity")}(${opportunityId(parentToken)})?$select=${primaryId("opportunity")},statecode,statuscode,actualclosedate`, "business", true, ["ParentOpportunityIntegrityGET"]);
  assertFrozenOpportunityState(parent, frozenOpportunityState(parentToken), `${kind}:${token} parent Opportunity`);
  assertBpfSnapshot(await bpfSnapshot(parentToken, { preflightRead: true }), parentToken, true);
  if (kind === "Timeline") {
    const annotationCategory = ["historicalAnnotation", "sameDayAnnotation", "futureAnnotation"].includes(category);
    ensure(timelineLogical(row) === category || annotationCategory && timelineLogical(row) === "annotation", `Timeline:${token} Canary category mismatch`);
    if (annotationCategory) {
      const expectedMode = category === "historicalAnnotation" ? "HistoricalOverride" : category === "sameDayAnnotation" ? "SameDayBodyDate" : "FutureBodyPlannedDate";
      ensure(annotationMode(row) === expectedMode, `Timeline:${token} Annotation Canary projection mismatch`);
      const parentId = opportunityId(parentToken);
      const existing = await all(`/api/data/v9.2/${entitySet("annotation")}?$select=${primaryId("annotation")},subject,_objectid_value&$filter=subject eq ${escapeValue(row.subject)} and _objectid_value eq ${parentId}`, "business", true, ["TimelineGET"]);
      ensure(existing.length === 0, `Timeline:${token} failed or duplicate Annotation residual exists`);
    }
  } else {
    const source = privateState.records[`Timeline:${row.aigw_sourceactivitytoken}`];
    const sourceRow = timelineRows.get(row.aigw_sourceactivitytoken);
    ensure(source?.exactRecordId && sourceRow, `Signal:${token} Canary source Timeline is unavailable`);
    ensure(timelineLogical(sourceRow) === category, `Signal:${token} Canary source type mismatch`);
  }
}

async function runD6R3LedgerRows(batchId, entityName, batchRows, importer, category) {
  ensure(batchRows.length > 0 && batchRows.length <= (entityName === "Timeline" ? D6_R3_TIMELINE_SIGNAL.timelineBatchMaximum : D6_R3_TIMELINE_SIGNAL.signalBatchMaximum), `${batchId} exceeds R3 batch maximum`);
  currentBatchId = batchId;
  const before = { ...stageStats[entityName] };
  const ledger = privateState.batchLedger.find((row) => row.recoveryPhase === D6_R3_TIMELINE_SIGNAL.phase && row.batchId === batchId && !row.completed && !row.blocker && Number(row.attempt || 0) === 0)
    || { batchId, entity: entityName, category, expected: batchRows.length, startedAt: new Date().toISOString(), attempt: 0, created: 0, reused: 0, failed: 0, completed: false, recoveryPhase: D6_R3_TIMELINE_SIGNAL.phase };
  if (!privateState.batchLedger.includes(ledger)) privateState.batchLedger.push(ledger);
  await persistPrivate();
  try {
    const parentTokens = [...new Set(batchRows.map((row) => entityName === "Timeline" ? row.regardingobjectid_token : row.aigw_opportunityid_token))].sort();
    const beforeSnapshots = await timelineParentSnapshots(parentTokens, true);
    for (const token of parentTokens) assertFrozenOpportunityState(beforeSnapshots[token], frozenOpportunityState(token), `${batchId} Opportunity:${token}`);
    currentAuditClassification = entityName === "Timeline" ? "TimelineGET" : "SignalGET";
    for (const row of batchRows) await importer(row);
    currentAuditClassification = null;
    ledger.attempt = stageStats[entityName].attempt - before.attempt;
    ledger.created = stageStats[entityName].created - before.created;
    ledger.reused = stageStats[entityName].reused - before.reused;
    ledger.failed = stageStats[entityName].failed - before.failed;
    ensure(ledger.attempt === batchRows.length && ledger.created + ledger.reused === batchRows.length && ledger.failed === 0, `${batchId} exact readback gate failed`);
    ledger.integrity = await verifyD6R3BatchIntegrity(batchId, parentTokens, beforeSnapshots);
    ledger.completed = true;
    ledger.completedAt = new Date().toISOString();
    await persistPrivate();
    console.log(JSON.stringify({ step: "d6-r3-batch-complete", batchId, entity: entityName, category, created: ledger.created, reused: ledger.reused }));
  } catch (error) {
    ledger.attempt = stageStats[entityName].attempt - before.attempt;
    ledger.created = stageStats[entityName].created - before.created;
    ledger.reused = stageStats[entityName].reused - before.reused;
    ledger.failed = Math.max(1, stageStats[entityName].failed - before.failed);
    ledger.blocker = sanitizeError(error);
    ledger.completedAt = new Date().toISOString();
    await persistPrivate();
    throw error;
  } finally {
    currentAuditClassification = null;
    currentBatchId = null;
  }
}

async function verifyTl0001Reuse() {
  const record = privateState.records["Timeline:TL-0001"];
  ensure(record?.exactRecordId && record.activityEntity === "phonecall", "TL-0001 private evidence is missing");
  ensure(rows.Timeline.some((row) => row._record_token === "TL-0001" && row.activity_entity === "phonecall"), "TL-0001 frozen workbook row is missing");
  await readPrivateRecord("Timeline:TL-0001", record, true);
  return { token: "TL-0001", completedAndReused: true, postAttempt: 0, exactReadback: true };
}

async function runD6R3TimelineSignal() {
  const tl0001 = await verifyTl0001Reuse();
  const timelineCountAtResume = Object.values(privateState.records).filter((record) => record.entity === "Timeline").length;
  const signalCountAtResume = Object.values(privateState.records).filter((record) => record.entity === "InteractionSignal").length;
  const remainingTimeline = rows.Timeline.filter((row) => !privateState.records[`Timeline:${row._record_token}`]);
  ensure(remainingTimeline.length === D6_R3_TIMELINE_SIGNAL.remainingTimelineCount && remainingTimeline.length === D6_R3_TIMELINE_SIGNAL.finalTimelineCount - timelineCountAtResume, `D6-R3B remaining Timeline does not match the Exact Manifest: ${remainingTimeline.length}`);
  const timelineBuckets = classifyRemainingTimeline(remainingTimeline, annotationProjectionReferenceDate);
  ensure(stableJson(Object.fromEntries(Object.entries(timelineBuckets).map(([name, values]) => [name, values.length]))) === stableJson(D6_R3_TIMELINE_SIGNAL.remainingTimelineCategories), "D6-R3B Timeline category complement mismatch");
  const timelineCanaries = selectStableCanaries(timelineBuckets);
  const sameDayCanary = timelineBuckets.sameDayAnnotation.find((row) => row._record_token === D6_R3_TIMELINE_SIGNAL.sameDayCanaryToken);
  ensure(sameDayCanary && timelineCanaries.sameDayAnnotation?._record_token === D6_R3_TIMELINE_SIGNAL.sameDayCanaryToken, "TL-0653 is not the first Same-Day Annotation Canary");
  await validateD6R3Canary(sameDayCanary, "Timeline", "sameDayAnnotation");
  await runD6R3LedgerRows("T-sameDayAnnotation-TL-0653-CANARY", "Timeline", [sameDayCanary], importTimeline, "sameDayAnnotation");

  const canaryTokens = new Set([sameDayCanary._record_token]);
  for (const category of ["historicalAnnotation", "futureAnnotation"]) {
    const canary = timelineCanaries[category];
    if (!canary) continue;
    await validateD6R3Canary(canary, "Timeline", category);
    await runD6R3LedgerRows(`T-${category}-CANARY`, "Timeline", [canary], importTimeline, category);
    canaryTokens.add(canary._record_token);
  }

  const timelineOrder = ["phonecall", "appointment", "task", "historicalAnnotation", "sameDayAnnotation", "futureAnnotation"];
  for (const category of timelineOrder) {
    const bucket = timelineBuckets[category].filter((row) => !canaryTokens.has(row._record_token));
    if (!bucket.length) continue;
    const batches = buildMaximumBatches(bucket, D6_R3_TIMELINE_SIGNAL.timelineBatchMaximum, `T-${category}-R${timelineCountAtResume}-`);
    for (const batch of batches) await runD6R3LedgerRows(batch.id, "Timeline", batch.rows, importTimeline, category);
  }
  ensure(stageStats.Timeline.attempt === remainingTimeline.length && stageStats.Timeline.created + stageStats.Timeline.reused === remainingTimeline.length && stageStats.Timeline.failed === 0, "D6-R3B Timeline import failed");

  const remainingSignals = rows.InteractionSignal.filter((row) => !privateState.records[`InteractionSignal:${row._record_token}`]);
  ensure(remainingSignals.length === D6_R3_TIMELINE_SIGNAL.remainingSignalCount && remainingSignals.length === D6_R3_TIMELINE_SIGNAL.finalSignalCount - signalCountAtResume, "D6-R3B remaining Signal does not match the Exact Manifest");
  const signalBuckets = groupSignalsBySourceActivity(remainingSignals, timelineRows);
  const signalCanaries = selectStableCanaries(signalBuckets);
  for (const category of ["phonecall", "appointment", "task", "annotation"]) {
    const bucket = signalBuckets[category];
    if (!bucket.length) continue;
    const canary = signalCanaries[category];
    await validateD6R3Canary(canary, "InteractionSignal", category);
    await runD6R3LedgerRows(`S-${category}-CANARY`, "InteractionSignal", [canary], importSignal, category);
    const batches = buildMaximumBatches(bucket.slice(1), D6_R3_TIMELINE_SIGNAL.signalBatchMaximum, `S-${category}-R${signalCountAtResume}-`);
    for (const batch of batches) await runD6R3LedgerRows(batch.id, "InteractionSignal", batch.rows, importSignal, category);
  }
  ensure(stageStats.InteractionSignal.attempt === remainingSignals.length && stageStats.InteractionSignal.created + stageStats.InteractionSignal.reused === remainingSignals.length && stageStats.InteractionSignal.failed === 0, "D6-R3B Interaction Signal import failed");
  return { tl0001, annotationProjectionReferenceDate, timelineCountAtResume, signalCountAtResume, timelineBuckets: Object.fromEntries(Object.entries(timelineBuckets).map(([name, values]) => [name, values.length])), signalBuckets: Object.fromEntries(Object.entries(signalBuckets).map(([name, values]) => [name, values.length])), timelineCanaries: Object.fromEntries(Object.entries(timelineCanaries).map(([name, row]) => [name, row?._record_token || null])), signalCanaries: Object.fromEntries(Object.entries(signalCanaries).map(([name, row]) => [name, row?._record_token || null])) };
}

async function verifyD6R3ABaseline() {
  const counts = Object.values(privateState.records).reduce((result, record) => ({ ...result, [record.entity]: (result[record.entity] || 0) + 1 }), {});
  const alreadyCompleted = Object.keys(privateState.records).length === D6_R3_TIMELINE_SIGNAL.finalExplicitRecords;
  for (const [entityName, expected] of Object.entries(D6_R3_TIMELINE_SIGNAL.baselineEntityCounts)) {
    const expectedCount = alreadyCompleted && entityName === "Timeline" ? D6_R3_TIMELINE_SIGNAL.finalTimelineCount
      : alreadyCompleted && entityName === "InteractionSignal" ? D6_R3_TIMELINE_SIGNAL.finalSignalCount
        : expected;
    ensure(counts[entityName] === expectedCount, `D6-R3B ${entityName} baseline mismatch`);
  }
  const expectedExplicit = alreadyCompleted ? D6_R3_TIMELINE_SIGNAL.finalExplicitRecords : D6_R3_TIMELINE_SIGNAL.baselineExplicitRecords;
  ensure(Object.keys(privateState.records).length === expectedExplicit && Object.keys(privateState.records).length === Object.values(counts).reduce((sum, count) => sum + count, 0), "D6-R3B private explicit count mismatch");
  ensure(Object.keys(privateState.bpfReadbacks || {}).length === 200, "D6-R3B BPF private readback count is not 200");
  const tl0001 = await verifyTl0001Reuse();
  const { distribution } = await verifyFrozenOpportunityStates("D6-R3B baseline", true);
  const closes = await allOpportunityCloses(allOpportunityTokens, true);
  ensure(closes.total === 8 && closes.duplicates === 0 && closes.attachments === 0, "D6-R3B OpportunityClose baseline failed");
  const bpf = await allBpfSnapshot(allOpportunityTokens, true);
  ensure(bpf.targetInstanceCount === 200 && bpf.initialStageCount === 200 && bpf.duplicateCount === 0 && bpf.unexpectedProcessCount === 0, "D6-R3B BPF baseline failed");
  const plugin = await pluginSnapshot();
  ensure(plugin.ready, "D6-R3B Plugin 7/0 baseline failed");
  return { explicitRecordCount: Object.keys(privateState.records).length, entityCounts: counts, alreadyCompleted, tl0001, annotationProjectionEvidence: privateState.annotationProjectionEvidence, distribution, opportunityClose: 8, bpf: { targetInstanceCount: 200, initialStageCount: 200, duplicateCount: 0, unexpectedProcessCount: 0 }, plugin };
}

async function verifyD6R3Completion() {
  ensure(Object.keys(privateState.records).length === D6_R3_TIMELINE_SIGNAL.finalExplicitRecords, "D6-R3 private explicit manifest count is not 3900");
  const explicit = await fullExplicitReadback();
  const { distribution } = await verifyFrozenOpportunityStates("D6-R3B final");
  const closes = await allOpportunityCloses(allOpportunityTokens);
  ensure(closes.total === 8 && closes.duplicates === 0 && closes.attachments === 0, "D6-R3 OpportunityClose integrity failed");
  const bpf = await allBpfSnapshot(allOpportunityTokens);
  ensure(bpf.targetInstanceCount === 200 && bpf.initialStageCount === 200 && bpf.duplicateCount === 0 && bpf.unexpectedProcessCount === 0, "D6-R3 BPF integrity failed");
  const actual = await actualUniquenessReadback();
  const plugin = await pluginSnapshot();
  ensure(plugin.ready, "D6-R3 Plugin 7/0 integrity failed");
  const workflow = await workflowSnapshot();
  ensure(workflow.definitionHash === "aac15b0adae5d1041df319b7dd187cc4a517c446725e6f2785e68939c015dbf8" && workflow.processOrder === 0, "D6-R3 BPF definition/order changed");
  const timeline = Object.values(privateState.records).filter((record) => record.entity === "Timeline");
  const signals = Object.values(privateState.records).filter((record) => record.entity === "InteractionSignal");
  ensure(timeline.length === D6_R3_TIMELINE_SIGNAL.finalTimelineCount && signals.length === D6_R3_TIMELINE_SIGNAL.finalSignalCount, "D6-R3 final Timeline/Signal count mismatch");
  ensure(new Set(timeline.map((record) => record.stableToken)).size === timeline.length, "D6-R3 duplicate Timeline token");
  ensure(new Set(signals.map((record) => record.stableToken)).size === signals.length, "D6-R3 duplicate Signal token");
  for (const signal of signals) {
    const source = privateState.records[`Timeline:${signal.sourceActivityToken || signal.readbackEvidence?.aigw_sourceactivitytoken}`];
    ensure(source?.exactRecordId, `D6-R3 Signal source missing: ${signal.stableToken}`);
  }
  return { explicit, distribution, opportunityClose: { total: closes.total, duplicates: closes.duplicates, attachments: closes.attachments }, bpf, actual, plugin, workflow, timeline: { count: timeline.length, duplicateTokenCount: 0 }, signal: { count: signals.length, duplicateTokenCount: 0, missingSourceCount: 0 } };
}

async function actualUniquenessReadback() {
  const expectedByOpportunity = new Map(allRows.ActualManagement.map((row) => [row.aigw_opportunityid_token, row]));
  for (const token of allOpportunityTokens) {
    const exactId = opportunityId(token);
    const actuals = await all(`/api/data/v9.2/${entitySet("aigw_actualmanagement")}?$select=${primaryId("aigw_actualmanagement")},aigw_name,aigw_annualactualrevenue,_aigw_opportunityid_value&$filter=_aigw_opportunityid_value eq ${exactId}`);
    const expected = expectedByOpportunity.get(token);
    ensure(actuals.length === (expected ? 1 : 0), `Actual uniqueness mismatch: ${token}`);
    if (expected) ensure(actuals[0].aigw_name === expected.aigw_name && sameId(actuals[0]._aigw_opportunityid_value, exactId), `Actual relationship mismatch: ${token}`);
    if (([...allOpportunityTokens].indexOf(token) + 1) % 25 === 0) console.log(JSON.stringify({ step: "actual-uniqueness-readback", completed: [...allOpportunityTokens].indexOf(token) + 1, total: allOpportunityTokens.length }));
  }
  return { total: expectedByOpportunity.size, uniquePerOpportunity: true };
}

async function verifyBaseFullData() {
  for (const [entityName, expected] of Object.entries(EXPECTED)) {
    const stat = stageStats[entityName];
    ensure(stat.attempt === expected && stat.created + stat.reused === expected && stat.failed === 0, `${entityName} base import stage failed`);
  }
  ensure(Object.keys(privateState.records).length === D6_FULL_IMPORT.explicitFinal, "Explicit private manifest is not 3900");
  const states = await opportunityStateSnapshot();
  const distribution = stateDistribution(states);
  const completedActions = Object.values(privateState.actions).filter((action) => action.actionStatus?.startsWith("Succeeded"));
  const completedWins = completedActions.filter((action) => action.actionType === "WinOpportunity").length;
  const completedLosses = completedActions.filter((action) => action.actionType === "LoseOpportunity").length;
  ensure(distribution.Won === 7 + completedWins && distribution.Active === 192 - completedWins - completedLosses && distribution.Lost === 1 + completedLosses, `Base full state distribution mismatch: ${JSON.stringify(distribution)}`);
  const closes = await allOpportunityCloses();
  ensure(closes.total === 8 + completedActions.length && closes.duplicates === 0 && closes.attachments === 0, "Base full OpportunityClose mismatch");
  const bpf = await allBpfSnapshot();
  ensure(bpf.targetInstanceCount === 200 && bpf.initialStageCount === 200 && bpf.duplicateCount === 0 && bpf.unexpectedProcessCount === 0, "Base full BPF mismatch");
  const actual = await actualUniquenessReadback();
  const plugin = await pluginSnapshot();
  ensure(plugin.ready, "Plugin changed during base import");
  const workflow = await workflowSnapshot();
  ensure(workflow.definitionHash === "aac15b0adae5d1041df319b7dd187cc4a517c446725e6f2785e68939c015dbf8" && workflow.processOrder === 0, "BPF definition changed during base import");
  return { explicitRecords: Object.keys(privateState.records).length, distribution, resumedStateActions: { won: completedWins, lost: completedLosses }, opportunityClose: { total: closes.total, duplicates: closes.duplicates, attachments: closes.attachments }, bpf: { targetInstanceCount: bpf.targetInstanceCount, initialStageCount: bpf.initialStageCount, duplicateCount: bpf.duplicateCount, unexpectedProcessCount: bpf.unexpectedProcessCount }, actual, plugin, workflow };
}

function buildStateCandidates() {
  const selected = selectRemainingStateActions(allRows.Opportunity, pilotRows.Opportunity);
  const actualByOpportunity = new Map(allRows.ActualManagement.map((row) => [row.aigw_opportunityid_token, row]));
  const won = selected.won.map((row) => {
    const actual = actualByOpportunity.get(row._record_token);
    ensure(actual, `Won candidate Actual missing: ${row._record_token}`);
    return {
      opportunityToken: row._record_token,
      actualToken: actual._record_token,
      actualRevenue: frozenAnnualActualRevenue(actual),
      actualEnd: excelDate(row._actual_close_date_for_action),
      actualEndSource: "_actual_close_date_for_action",
      wonReasonValue: Number(row.aigw_wonreason_choice),
      wonReasonLabel: choiceLabel("aigw_wonreason_choice", row.aigw_wonreason_choice),
      accountToken: row.parentaccountid_token,
      contactToken: row.parentcontactid_token,
      status: 3,
    };
  });
  const lost = selected.lost.map((row) => {
    const matches = preflight.statusOptions.filter((option) => Number(option.state) === 2 && option.labels?.["2052"] === row._desired_status);
    ensure(matches.length === 1, `Lost status cannot be resolved: ${row._record_token}`);
    return {
      opportunityToken: row._record_token,
      status: Number(matches[0].value),
      statusLabel: row._desired_status,
      lostReasonValue: Number(row.aigw_lostreason_choice),
      lostReasonLabel: choiceLabel("aigw_lostreason_choice", row.aigw_lostreason_choice),
      actualEnd: excelDate(row.estimatedclosedate),
      actualEndSource: "estimatedclosedate",
      expectedActualCount: expectedActualCountFromFrozenProjection(row._record_token, allRows.ActualManagement),
      accountToken: row.parentaccountid_token,
      contactToken: row.parentcontactid_token,
    };
  });
  ensure(won.length === 84 && lost.length === 8, "Remaining state action candidate counts changed");
  return { won, lost };
}

async function verifyCanaryActualRevenue(candidate) {
  const exactOpportunityId = opportunityId(candidate.opportunityToken);
  const fields = [
    primaryId("aigw_actualmanagement"),
    "aigw_name",
    "aigw_annualactualrevenue",
    ...ACTUAL_REVENUE_FIELDS,
    "_aigw_opportunityid_value",
  ];
  const actuals = await all(
    `/api/data/v9.2/${entitySet("aigw_actualmanagement")}?$select=${select(fields)}&$filter=_aigw_opportunityid_value eq ${exactOpportunityId}`,
    "business",
    true,
    ["ActualGET"],
  );
  ensure(actuals.length === 1, `R4A ${candidate.opportunityToken} Actual Count must be one`);
  const actual = actuals[0];
  const monthlyRevenue = ACTUAL_REVENUE_FIELDS.reduce((sum, field) => sum + Number(actual[field] || 0), 0);
  const annualRevenue = Number(actual.aigw_annualactualrevenue);
  ensure(Number.isFinite(annualRevenue) && annualRevenue > 0, `R4A ${candidate.opportunityToken} Actual Annual Revenue is invalid`);
  ensure(monthlyRevenue === annualRevenue, `R4A ${candidate.opportunityToken} Actual monthly revenue does not equal annual revenue`);
  ensure(annualRevenue === Number(candidate.actualRevenue), `R4A ${candidate.opportunityToken} Projection and Dataverse Actual Revenue differ`);
  ensure(sameId(actual._aigw_opportunityid_value, exactOpportunityId), `R4A ${candidate.opportunityToken} Actual parent mismatch`);
  return {
    actualToken: candidate.actualToken,
    annualRevenue,
    monthlyRevenue,
    primaryName: actual.aigw_name,
  };
}

async function verifyLostCandidateActual(candidate, preflightRead = false) {
  const exactOpportunityId = opportunityId(candidate.opportunityToken);
  const fields = [primaryId("aigw_actualmanagement"), "aigw_name", "aigw_annualactualrevenue", "_aigw_opportunityid_value"];
  const actuals = await all(
    `/api/data/v9.2/${entitySet("aigw_actualmanagement")}?$select=${select(fields)}&$filter=_aigw_opportunityid_value eq ${exactOpportunityId}`,
    "business",
    preflightRead,
    ["ActualGET"],
  );
  const expectedActualCount = Number(candidate.expectedActualCount ?? expectedActualCountFromFrozenProjection(candidate.opportunityToken, allRows.ActualManagement));
  assertActualCountMatchesFrozenProjection(actuals.length, expectedActualCount, candidate.opportunityToken);
  if (expectedActualCount === 1) {
    const frozen = allRows.ActualManagement.find((row) => row.aigw_opportunityid_token === candidate.opportunityToken);
    ensure(frozen, `Frozen Actual row is missing: ${candidate.opportunityToken}`);
    ensure(actuals[0].aigw_name === frozen.aigw_name, `Actual:${candidate.opportunityToken} frozen name mismatch`);
    ensure(sameId(actuals[0]._aigw_opportunityid_value, exactOpportunityId), `Actual:${candidate.opportunityToken} parent mismatch`);
    ensure(Number(actuals[0].aigw_annualactualrevenue) === Number(frozenAnnualActualRevenue(frozen)), `Actual:${candidate.opportunityToken} frozen annual revenue mismatch`);
  }
  return {
    expectedActualCount,
    actualCount: actuals.length,
    actualToken: actuals[0]?.[primaryId("aigw_actualmanagement")] ? normalizeId(actuals[0][primaryId("aigw_actualmanagement")]) : null,
    dataConsistent: expectedActualCount === 0 || actuals.length === 1,
  };
}

function stateHashExcluding(states, excludedToken) {
  return sha256(Buffer.from(stableJson(
    states
      .filter((state) => state.token !== excludedToken)
      .map((state) => ({ token: state.token, statecode: state.statecode, statuscode: state.statuscode, actualclosedate: state.actualclosedate ?? null }))
      .sort((left, right) => left.token.localeCompare(right.token)),
  )));
}

async function runD6R4AFullWinCanary() {
  const baseline = await verifyD6R3Completion();
  ensure(stableJson(baseline.distribution) === stableJson(D6_R4A_FULL_WIN_CANARY.expectedPreActionState), "R4A pre-action state distribution mismatch");
  ensure(baseline.opportunityClose.total === D6_R4A_FULL_WIN_CANARY.expectedPreActionOpportunityCloseCount, "R4A pre-action OpportunityClose count mismatch");
  ensure(baseline.explicit.recordCount === D6_FULL_IMPORT.explicitFinal, "R4A explicit record baseline mismatch");

  const frozenCandidates = buildStateCandidates().won;
  const liveStates = await opportunityStateSnapshot(frozenCandidates.map((candidate) => candidate.opportunityToken), true);
  const currentStateByToken = {};
  for (const state of liveStates) {
    const close = await opportunityCloseSnapshot(state.token, true);
    currentStateByToken[state.token] = { ...state, opportunityCloseCount: close.count };
  }
  const candidate = selectFullWinCanary(frozenCandidates, currentStateByToken, privateState.actions);
  ensure(candidate.opportunityToken === [...frozenCandidates].sort((left, right) => left.opportunityToken.localeCompare(right.opportunityToken))[0].opportunityToken, "R4A Canary is not the stable minimum Token");
  ensure(!privateState.actions[candidate.opportunityToken], `R4A ${candidate.opportunityToken} already has a D6 action record`);

  const actualRevenue = await verifyCanaryActualRevenue(candidate);
  const beforeStates = await opportunityStateSnapshot(allOpportunityTokens, true);
  const beforeNonCanaryHash = stateHashExcluding(beforeStates, candidate.opportunityToken);
  const result = await performStateAction(candidate, "WinOpportunity", "R4A-FULL-WIN-CANARY");
  const action = privateState.actions[candidate.opportunityToken];
  ensure(action?.actionStatus?.startsWith("Succeeded"), `R4A ${candidate.opportunityToken} WinOpportunity did not succeed`);
  action.phase = D6_R4A_FULL_WIN_CANARY.phase;
  action.actualRevenueDoubleChecked = true;
  action.actualToken = candidate.actualToken;
  action.accountToken = candidate.accountToken;
  action.contactToken = candidate.contactToken;
  action.beforeSnapshot = {
    opportunity: action.beforeState,
    bpf: action.bpfBefore,
    relatedBusinessHash: action.relatedBusinessHashBefore,
  };
  action.afterSnapshot = {
    opportunity: action.afterState,
    bpf: action.bpfAfter,
    relatedBusinessHash: action.relatedBusinessHashAfter,
  };
  await persistPrivate();

  const afterStates = await opportunityStateSnapshot(allOpportunityTokens);
  const afterDistribution = stateDistribution(afterStates);
  ensure(stableJson(afterDistribution) === stableJson(D6_R4A_FULL_WIN_CANARY.expectedPostActionState), "R4A final state distribution mismatch");
  ensure(stateHashExcluding(afterStates, candidate.opportunityToken) === beforeNonCanaryHash, "R4A non-Canary Opportunity state changed");
  const afterClose = await opportunityCloseSnapshot(candidate.opportunityToken);
  ensure(afterClose.count === 1 && afterClose.attachmentCount === 0, "R4A OpportunityClose readback failed");
  const allCloses = await allOpportunityCloses();
  ensure(allCloses.total === D6_R4A_FULL_WIN_CANARY.expectedPostActionOpportunityCloseCount && allCloses.duplicates === 0 && allCloses.attachments === 0, "R4A final OpportunityClose integrity failed");
  const explicit = await fullExplicitReadback();
  const bpf = await allBpfSnapshot();
  ensure(bpf.targetInstanceCount === 200 && bpf.initialStageCount === 200 && bpf.duplicateCount === 0 && bpf.unexpectedProcessCount === 0, "R4A BPF integrity failed");
  const plugin = await pluginSnapshot();
  ensure(plugin.ready, "R4A Plugin 7/0 integrity failed");
  const workflow = await workflowSnapshot();
  ensure(workflow.definitionHash === "aac15b0adae5d1041df319b7dd187cc4a517c446725e6f2785e68939c015dbf8" && workflow.processOrder === 0, "R4A BPF definition/order changed");
  const requestDelta = {
    ActualGET: requestCounts.ActualGET - requestCountsAtResume.ActualGET,
    WinOpportunityAttempts: requestCounts.WinOpportunityAttempts - requestCountsAtResume.WinOpportunityAttempts,
    LoseOpportunity: requestCounts.LoseOpportunityAttempts - requestCountsAtResume.LoseOpportunityAttempts,
    PATCH: requestCounts.PATCH - requestCountsAtResume.PATCH,
    DELETE: requestCounts.DELETE - requestCountsAtResume.DELETE,
    Publish: requestCounts.Publish - requestCountsAtResume.Publish,
    BPFWrites: requestCounts.BPFWrites - requestCountsAtResume.BPFWrites,
    OtherBusinessPOST: requestCounts.OtherBusinessPOST - requestCountsAtResume.OtherBusinessPOST,
    ProductionRequests: requestCounts.ProductionRequests - requestCountsAtResume.ProductionRequests,
    ExternalLLMCalls: requestCounts.ExternalLLMCalls - requestCountsAtResume.ExternalLLMCalls,
  };
  ensure(fullWinCanaryRequestStatsAreSafe(requestDelta), "R4A request boundary failed");
  privateState.r4a = {
    phase: D6_R4A_FULL_WIN_CANARY.phase,
    canaryToken: candidate.opportunityToken,
    requestDelta,
    beforeDistribution: baseline.distribution,
    afterDistribution,
    nonCanaryOpportunityStateHashUnchanged: true,
    opportunityCloseTotal: allCloses.total,
    bpfClassification: action.bpfSideEffect,
  };
  await persistPrivate();
  return {
    candidate: { ...candidate, actualRevenue: undefined },
    result,
    actualRevenue,
    beforeDistribution: baseline.distribution,
    afterDistribution,
    nonCanaryOpportunityStateHashUnchanged: true,
    opportunityClose: { count: afterClose.count, attachmentCount: afterClose.attachmentCount, total: allCloses.total, duplicates: allCloses.duplicates },
    bpf,
    explicit,
    plugin,
    workflow,
    bpfClassification: action.bpfSideEffect,
    requestDelta,
  };
}

async function verifyD6R4BFullLoseBaseline() {
  ensure(Object.keys(privateState.records).length === D6_FULL_IMPORT.explicitFinal, "R4B private explicit manifest count is not 3900");
  ensure(privateState.r4a?.canaryToken, "R4B requires the completed R4A Win canary evidence");
  const explicit = await fullExplicitReadback(true);
  const states = await opportunityStateSnapshot(allOpportunityTokens, true);
  const distribution = stateDistribution(states);
  ensure(stableJson(distribution) === stableJson(D6_R4B_FULL_LOSE_CANARY.expectedPreActionState), `R4B pre-action state distribution mismatch: ${JSON.stringify(distribution)}`);
  const closes = await allOpportunityCloses(allOpportunityTokens, true);
  ensure(closes.total === D6_R4B_FULL_LOSE_CANARY.expectedPreActionOpportunityCloseCount && closes.duplicates === 0 && closes.attachments === 0, "R4B OpportunityClose baseline mismatch");
  const bpf = await allBpfSnapshot(allOpportunityTokens, true);
  ensure(bpf.targetInstanceCount === 200 && bpf.initialStageCount === 200 && bpf.duplicateCount === 0 && bpf.unexpectedProcessCount === 0, "R4B BPF baseline mismatch");
  const plugin = await pluginSnapshot(true);
  ensure(plugin.ready, "R4B Plugin 7/0 baseline failed");
  const workflow = await workflowSnapshot(true);
  ensure(workflow.definitionHash === "aac15b0adae5d1041df319b7dd187cc4a517c446725e6f2785e68939c015dbf8" && workflow.processOrder === 0, "R4B BPF definition/order changed");

  const frozenCandidates = buildStateCandidates().lost;
  const currentStateByToken = {};
  const actualValidation = [];
  const stateByToken = new Map(states.map((state) => [state.token, state]));
  for (const candidate of frozenCandidates) {
    const state = stateByToken.get(candidate.opportunityToken);
    ensure(state, `R4B candidate state missing: ${candidate.opportunityToken}`);
    const close = await opportunityCloseSnapshot(candidate.opportunityToken, true);
    const actual = await verifyLostCandidateActual(candidate, true);
    ensure(state.statecode === 0 && state.statuscode === 1 && state.actualclosedate == null, `R4B candidate is not Active: ${candidate.opportunityToken}`);
    ensure(close.count === 0, `R4B candidate already has OpportunityClose: ${candidate.opportunityToken}`);
    currentStateByToken[candidate.opportunityToken] = { ...state, opportunityCloseCount: close.count, actualCount: actual.actualCount, expectedActualCount: actual.expectedActualCount };
    actualValidation.push({ opportunityToken: candidate.opportunityToken, expectedActualCount: actual.expectedActualCount, actualCount: actual.actualCount, dataConsistent: actual.dataConsistent });
  }
  const candidate = selectFullLoseCanary(frozenCandidates, currentStateByToken, privateState.actions);
  ensure(candidate.opportunityToken === [...frozenCandidates].sort((left, right) => left.opportunityToken.localeCompare(right.opportunityToken))[0].opportunityToken, "R4B Canary is not the stable minimum Token");
  ensure(candidate.opportunityToken === "DEMO-OPP-012", "R4B stable minimum Lost Canary changed");
  ensure(!privateState.actions[candidate.opportunityToken], `R4B ${candidate.opportunityToken} already has a D6 action record`);
  return {
    explicit,
    distribution,
    opportunityClose: { total: closes.total, duplicates: closes.duplicates, attachments: closes.attachments },
    bpf,
    plugin,
    workflow,
    candidates: frozenCandidates.map((item) => item.opportunityToken),
    actualValidation,
    candidate,
  };
}

async function runD6R4BFullLoseCanary() {
  const baseline = await verifyD6R4BFullLoseBaseline();
  const candidate = baseline.candidate;
  const beforeStates = await opportunityStateSnapshot(allOpportunityTokens, true);
  const beforeNonCanaryHash = stateHashExcluding(beforeStates, candidate.opportunityToken);
  const beforeActual = await verifyLostCandidateActual(candidate, true);
  const result = await performStateAction(candidate, "LoseOpportunity", "R4B-FULL-LOSE-CANARY");
  const action = privateState.actions[candidate.opportunityToken];
  ensure(action?.actionStatus?.startsWith("Succeeded"), `R4B ${candidate.opportunityToken} LoseOpportunity did not succeed`);
  action.phase = D6_R4B_FULL_LOSE_CANARY.phase;
  action.expectedActualCount = candidate.expectedActualCount;
  action.actualValidation = { before: beforeActual, after: null, createdByStateAction: false };
  action.beforeSnapshot = { opportunity: action.beforeState, bpf: action.bpfBefore, relatedBusinessHash: action.relatedBusinessHashBefore };
  action.afterSnapshot = { opportunity: action.afterState, bpf: action.bpfAfter, relatedBusinessHash: action.relatedBusinessHashAfter };
  await persistPrivate();

  const afterStates = await opportunityStateSnapshot(allOpportunityTokens);
  const afterDistribution = stateDistribution(afterStates);
  ensure(stableJson(afterDistribution) === stableJson(D6_R4B_FULL_LOSE_CANARY.expectedPostActionState), "R4B final state distribution mismatch");
  ensure(stateHashExcluding(afterStates, candidate.opportunityToken) === beforeNonCanaryHash, "R4B non-Canary Opportunity state changed");
  const afterActual = await verifyLostCandidateActual(candidate);
  ensure(afterActual.actualCount === beforeActual.actualCount, `R4B ${candidate.opportunityToken} state action created or removed Actual`);
  action.actualValidation.after = afterActual;
  const afterClose = await opportunityCloseSnapshot(candidate.opportunityToken);
  ensure(afterClose.count === 1 && afterClose.attachmentCount === 0 && afterClose.rows[0].actualrevenue == null, "R4B OpportunityClose readback failed");
  const allCloses = await allOpportunityCloses();
  ensure(allCloses.total === D6_R4B_FULL_LOSE_CANARY.expectedPostActionOpportunityCloseCount && allCloses.duplicates === 0 && allCloses.attachments === 0, "R4B final OpportunityClose integrity failed");
  const explicit = await fullExplicitReadback();
  const bpf = await allBpfSnapshot();
  ensure(bpf.targetInstanceCount === 200 && bpf.initialStageCount === 200 && bpf.duplicateCount === 0 && bpf.unexpectedProcessCount === 0, "R4B BPF integrity failed");
  const plugin = await pluginSnapshot();
  ensure(plugin.ready, "R4B Plugin 7/0 integrity failed");
  const workflow = await workflowSnapshot();
  ensure(workflow.definitionHash === "aac15b0adae5d1041df319b7dd187cc4a517c446725e6f2785e68939c015dbf8" && workflow.processOrder === 0, "R4B BPF definition/order changed");
  const requestDelta = {
    ActualGET: requestCounts.ActualGET - requestCountsAtResume.ActualGET,
    LoseOpportunityAttempts: requestCounts.LoseOpportunityAttempts - requestCountsAtResume.LoseOpportunityAttempts,
    LoseOpportunitySuccess: requestCounts.LoseOpportunitySuccess - requestCountsAtResume.LoseOpportunitySuccess,
    WinOpportunityAttempts: requestCounts.WinOpportunityAttempts - requestCountsAtResume.WinOpportunityAttempts,
    ActualPOST: requestCounts.ActualPOST - requestCountsAtResume.ActualPOST,
    TimelinePOST: requestCounts.TimelinePOST - requestCountsAtResume.TimelinePOST,
    SignalPOST: requestCounts.SignalPOST - requestCountsAtResume.SignalPOST,
    PATCH: requestCounts.PATCH - requestCountsAtResume.PATCH,
    DELETE: requestCounts.DELETE - requestCountsAtResume.DELETE,
    Publish: requestCounts.Publish - requestCountsAtResume.Publish,
    BPFWrites: requestCounts.BPFWrites - requestCountsAtResume.BPFWrites,
    OtherBusinessPOST: requestCounts.OtherBusinessPOST - requestCountsAtResume.OtherBusinessPOST,
    ProductionRequests: requestCounts.ProductionRequests - requestCountsAtResume.ProductionRequests,
    ExternalLLMCalls: requestCounts.ExternalLLMCalls - requestCountsAtResume.ExternalLLMCalls,
  };
  ensure(fullLoseCanaryRequestStatsAreSafe(requestDelta), "R4B request boundary failed");
  privateState.r4b = {
    phase: D6_R4B_FULL_LOSE_CANARY.phase,
    authorization: D6_R4B_FULL_LOSE_CANARY.authorization,
    canaryToken: candidate.opportunityToken,
    expectedActualCount: candidate.expectedActualCount,
    actualCountBefore: beforeActual.actualCount,
    actualCountAfter: afterActual.actualCount,
    actualCreatedByStateAction: false,
    requestDelta,
    beforeDistribution: baseline.distribution,
    afterDistribution,
    nonCanaryOpportunityStateHashUnchanged: true,
    opportunityCloseTotal: allCloses.total,
    opportunityCloseActualRevenue: null,
    bpfClassification: action.bpfSideEffect,
  };
  await persistPrivate();
  return {
    baseline,
    candidate: { ...candidate },
    result,
    actualValidation: { expectedActualCount: candidate.expectedActualCount, before: beforeActual, after: afterActual, createdByStateAction: false },
    beforeDistribution: baseline.distribution,
    afterDistribution,
    nonCanaryOpportunityStateHashUnchanged: true,
    opportunityClose: { count: afterClose.count, attachmentCount: afterClose.attachmentCount, actualRevenue: null, total: allCloses.total, duplicates: allCloses.duplicates },
    bpf,
    explicit,
    plugin,
    workflow,
    bpfClassification: action.bpfSideEffect,
    requestDelta,
  };
}

function closeMatches(closeSnapshot, candidate, payload, actionType) {
  if (closeSnapshot.count !== 1 || closeSnapshot.attachmentCount !== 0) return false;
  const row = closeSnapshot.rows[0];
  return sameId(row._opportunityid_value, opportunityId(candidate.opportunityToken))
    && row.subject === payload.OpportunityClose.subject
    && row.description === payload.OpportunityClose.description
    && String(row.actualend || "").slice(0, 10) === candidate.actualEnd
    && (actionType === "WinOpportunity" ? Number(row.actualrevenue) === Number(candidate.actualRevenue) : row.actualrevenue == null);
}

async function verifyR4CActual(candidate, actionType, preflightRead = false) {
  if (actionType === "WinOpportunity") {
    const actual = await verifyCanaryActualRevenue(candidate);
    return { expectedActualCount: 1, actualCount: 1, dataConsistent: true, annualRevenue: actual.annualRevenue, actualToken: actual.actualToken };
  }
  return verifyLostCandidateActual(candidate, preflightRead);
}

function stateHashExcludingTokens(states, excludedTokens) {
  const excluded = new Set(excludedTokens);
  return sha256(Buffer.from(stableJson(
    states
      .filter((state) => !excluded.has(state.token))
      .map((state) => ({ token: state.token, statecode: state.statecode, statuscode: state.statuscode, actualclosedate: state.actualclosedate ?? null }))
      .sort((left, right) => left.token.localeCompare(right.token)),
  )));
}

async function verifyD6R4CStateActionBaseline() {
  ensure(Object.keys(privateState.records).length === D6_FULL_IMPORT.explicitFinal, "R4C private explicit manifest count is not 3900");
  ensure(privateState.r4a?.canaryToken && privateState.r4b?.canaryToken, "R4C requires completed R4A and R4B canary evidence");
  const explicit = await fullExplicitReadback(true);
  ensure(stableJson(explicit.counts) === stableJson(D6_FULL_IMPORT.formalCounts), "R4C explicit record counts changed");
  const states = await opportunityStateSnapshot(allOpportunityTokens, true);
  const distribution = stateDistribution(states);
  ensure(stableJson(distribution) === stableJson(D6_R4C_FULL_STATE_ACTIONS.preActionState), `R4C pre-action state distribution mismatch: ${JSON.stringify(distribution)}`);
  const closes = await allOpportunityCloses(allOpportunityTokens, true);
  ensure(closes.total === D6_R4C_FULL_STATE_ACTIONS.preActionOpportunityCloseCount && closes.duplicates === 0 && closes.attachments === 0, "R4C OpportunityClose baseline mismatch");
  const bpf = await allBpfSnapshot(allOpportunityTokens, true);
  ensure(bpf.targetInstanceCount === 200 && bpf.initialStageCount === 200 && bpf.duplicateCount === 0 && bpf.unexpectedProcessCount === 0, "R4C BPF baseline mismatch");
  const plugin = await pluginSnapshot(true);
  ensure(plugin.ready, "R4C Plugin 7/0 baseline failed");
  const workflow = await workflowSnapshot(true);
  ensure(workflow.definitionHash === "aac15b0adae5d1041df319b7dd187cc4a517c446725e6f2785e68939c015dbf8" && workflow.processOrder === 0, "R4C BPF definition/order changed");

  const frozen = buildStateCandidates();
  const stateByToken = new Map(states.map((state) => [state.token, state]));
  const pending = { won: [], lost: [] };
  const actualValidation = [];
  for (const [actionType, candidates] of [["WinOpportunity", frozen.won], ["LoseOpportunity", frozen.lost]]) {
    for (const candidate of candidates) {
      const state = stateByToken.get(candidate.opportunityToken);
      ensure(state, `R4C candidate state missing: ${candidate.opportunityToken}`);
      const close = await opportunityCloseSnapshot(candidate.opportunityToken, true);
      if (Number(state.statecode) === 0 && Number(state.statuscode) === 1 && close.count === 0 && !String(privateState.actions[candidate.opportunityToken]?.actionStatus || "").startsWith("Succeeded")) {
        const actual = await verifyR4CActual(candidate, actionType, true);
        assertActualCountMatchesFrozenProjection(actual.actualCount, actual.expectedActualCount, candidate.opportunityToken);
        pending[actionType === "WinOpportunity" ? "won" : "lost"].push(candidate);
        actualValidation.push({ opportunityToken: candidate.opportunityToken, actionType, expectedActualCount: actual.expectedActualCount, actualCount: actual.actualCount, dataConsistent: actual.dataConsistent });
      }
    }
  }
  ensure(pending.won.length === D6_R4C_FULL_STATE_ACTIONS.remainingWinCandidates, `R4C Remaining Win Candidate Count mismatch: ${pending.won.length}`);
  ensure(pending.lost.length === D6_R4C_FULL_STATE_ACTIONS.remainingLoseCandidates, `R4C Remaining Lose Candidate Count mismatch: ${pending.lost.length}`);
  return {
    explicit,
    distribution,
    opportunityClose: { total: closes.total, duplicates: closes.duplicates, attachments: closes.attachments },
    bpf: { targetInstanceCount: bpf.targetInstanceCount, initialStageCount: bpf.initialStageCount, duplicateCount: bpf.duplicateCount, unexpectedProcessCount: bpf.unexpectedProcessCount },
    plugin,
    workflow,
    pending,
    actualValidation,
  };
}

async function verifyR4CBatchIntegrity(batchId, actionType, batchTokens, beforeStates) {
  const afterStates = await opportunityStateSnapshot(allOpportunityTokens);
  const succeeded = Object.values(privateState.actions || {}).filter((action) => action.phase === D6_R4C_FULL_STATE_ACTIONS.phase && String(action.actionStatus || "").startsWith("Succeeded"));
  const wins = succeeded.filter((action) => action.actionType === "WinOpportunity").length;
  const losses = succeeded.filter((action) => action.actionType === "LoseOpportunity").length;
  const distribution = stateDistribution(afterStates);
  const expectedDistribution = { Won: 8 + wins, Active: 190 - wins - losses, Lost: 2 + losses };
  ensure(stableJson(distribution) === stableJson(expectedDistribution), `${batchId} state distribution mismatch`);
  const afterCloses = await allOpportunityCloses(allOpportunityTokens);
  ensure(afterCloses.total === 10 + wins + losses && afterCloses.duplicates === 0 && afterCloses.attachments === 0, `${batchId} OpportunityClose integrity failed`);
  ensure(stateHashExcludingTokens(beforeStates, batchTokens) === stateHashExcludingTokens(afterStates, batchTokens), `${batchId} non-target Opportunity state changed`);
  const explicit = await fullExplicitReadback();
  ensure(explicit.recordCount === 3900 && explicit.counts.ActualManagement === 130 && explicit.counts.Timeline === 1800 && explicit.counts.InteractionSignal === 1350, `${batchId} explicit child count integrity failed`);
  const bpf = await allBpfSnapshot(allOpportunityTokens);
  ensure(bpf.targetInstanceCount === 200 && bpf.initialStageCount === 200 && bpf.duplicateCount === 0 && bpf.unexpectedProcessCount === 0, `${batchId} BPF integrity failed`);
  const plugin = await pluginSnapshot();
  ensure(plugin.ready, `${batchId} Plugin 7/0 integrity failed`);
  const workflow = await workflowSnapshot();
  ensure(workflow.definitionHash === "aac15b0adae5d1041df319b7dd187cc4a517c446725e6f2785e68939c015dbf8" && workflow.processOrder === 0, `${batchId} BPF definition/order changed`);
  return { batchId, actionType, distribution, opportunityClose: { total: afterCloses.total, duplicates: afterCloses.duplicates, attachments: afterCloses.attachments }, explicit, bpf, plugin, workflow, nonTargetOpportunityStateUnchanged: true };
}

async function runD6R4CActionBatches(baseline) {
  const results = [];
  const batches = [
    ...buildMaximumBatches(baseline.pending.won.map((row) => ({ ...row, _record_token: row.opportunityToken })), D6_R4C_FULL_STATE_ACTIONS.maxBatchSize, "R4C-W"),
    ...buildMaximumBatches(baseline.pending.lost.map((row) => ({ ...row, _record_token: row.opportunityToken })), D6_R4C_FULL_STATE_ACTIONS.maxBatchSize, "R4C-L"),
  ];
  for (const batch of batches) {
    currentBatchId = batch.id;
    const actionType = batch.id.startsWith("R4C-W") ? "WinOpportunity" : "LoseOpportunity";
    const batchTokens = batch.rows.map((row) => row.opportunityToken);
    const beforeStates = await opportunityStateSnapshot(allOpportunityTokens, true);
    const ledger = { batchId: batch.id, entity: actionType, expected: batch.size, startedAt: new Date().toISOString(), attempt: 0, succeeded: 0, reused: 0, failed: 0, completed: false, recoveryPhase: D6_R4C_FULL_STATE_ACTIONS.phase };
    privateState.batchLedger.push(ledger);
    await persistPrivate();
    console.log(JSON.stringify({ step: "r4c-batch-start", batchId: batch.id, actionType, count: batch.size, firstToken: batch.rows[0]?.opportunityToken || null }));
    try {
      for (const candidate of batch.rows) {
        const actualBefore = await verifyR4CActual(candidate, actionType, true);
        assertActualCountMatchesFrozenProjection(actualBefore.actualCount, actualBefore.expectedActualCount, candidate.opportunityToken);
        const result = await performStateAction(candidate, actionType, batch.id);
        const actualAfter = await verifyR4CActual(candidate, actionType, false);
        assertActualCountMatchesFrozenProjection(actualAfter.actualCount, actualAfter.expectedActualCount, candidate.opportunityToken);
        ensure(actualAfter.actualCount === actualBefore.actualCount, `${actionType}:${candidate.opportunityToken} Actual count changed during state action`);
        const action = privateState.actions[candidate.opportunityToken];
        action.phase = D6_R4C_FULL_STATE_ACTIONS.phase;
        action.expectedActualCount = actualBefore.expectedActualCount;
        action.actualValidation = { before: actualBefore, after: actualAfter, createdByStateAction: false };
        await persistPrivate();
        results.push(result);
        ledger.attempt += 1;
        ledger.succeeded += result.result.startsWith("Succeeded") ? 1 : 0;
        ledger.reused += result.result === "Reused" ? 1 : 0;
      }
      ledger.integrity = await verifyR4CBatchIntegrity(batch.id, actionType, batchTokens, beforeStates);
      ensure(ledger.attempt === batch.size && ledger.succeeded + ledger.reused === batch.size && ledger.failed === 0, `${batch.id} state action batch incomplete`);
      ledger.completed = true;
      ledger.completedAt = new Date().toISOString();
      await persistPrivate();
      console.log(JSON.stringify({ step: "r4c-batch-complete", batchId: batch.id, actionType, succeeded: ledger.succeeded, reused: ledger.reused }));
    } catch (error) {
      ledger.failed = 1;
      ledger.blocker = sanitizeError(error);
      ledger.completedAt = new Date().toISOString();
      await persistPrivate();
      throw error;
    }
  }
  return { results, batches: batches.map((batch) => ({ batchId: batch.id, actionType: batch.id.startsWith("R4C-W") ? "WinOpportunity" : "LoseOpportunity", count: batch.size })) };
}

async function verifyD6R4CFinal() {
  const explicit = await fullExplicitReadback();
  const states = await opportunityStateSnapshot(allOpportunityTokens);
  const distribution = stateDistribution(states);
  ensure(stableJson(distribution) === stableJson(D6_R4C_FULL_STATE_ACTIONS.finalState), "R4C final state distribution mismatch");
  const closes = await allOpportunityCloses(allOpportunityTokens);
  ensure(closes.total === D6_R4C_FULL_STATE_ACTIONS.finalOpportunityCloseCount && closes.duplicates === 0 && closes.attachments === 0, "R4C final OpportunityClose integrity failed");
  const bpf = await allBpfSnapshot(allOpportunityTokens);
  ensure(bpf.targetInstanceCount === 200 && bpf.initialStageCount === 200 && bpf.duplicateCount === 0 && bpf.unexpectedProcessCount === 0, "R4C final BPF integrity failed");
  const plugin = await pluginSnapshot();
  ensure(plugin.ready, "R4C final Plugin 7/0 integrity failed");
  const workflow = await workflowSnapshot();
  ensure(workflow.definitionHash === "aac15b0adae5d1041df319b7dd187cc4a517c446725e6f2785e68939c015dbf8" && workflow.processOrder === 0, "R4C final BPF definition/order changed");
  const requestDelta = {
    WinOpportunityAttempts: requestCounts.WinOpportunityAttempts - requestCountsAtResume.WinOpportunityAttempts,
    WinOpportunitySuccess: requestCounts.WinOpportunitySuccess - requestCountsAtResume.WinOpportunitySuccess,
    LoseOpportunityAttempts: requestCounts.LoseOpportunityAttempts - requestCountsAtResume.LoseOpportunityAttempts,
    LoseOpportunitySuccess: requestCounts.LoseOpportunitySuccess - requestCountsAtResume.LoseOpportunitySuccess,
    ActualPOST: requestCounts.ActualPOST - requestCountsAtResume.ActualPOST,
    TimelinePOST: requestCounts.TimelinePOST - requestCountsAtResume.TimelinePOST,
    SignalPOST: requestCounts.SignalPOST - requestCountsAtResume.SignalPOST,
    OtherBusinessPOST: requestCounts.OtherBusinessPOST - requestCountsAtResume.OtherBusinessPOST,
    PATCH: requestCounts.PATCH - requestCountsAtResume.PATCH,
    DELETE: requestCounts.DELETE - requestCountsAtResume.DELETE,
    Publish: requestCounts.Publish - requestCountsAtResume.Publish,
    BPFWrites: requestCounts.BPFWrites - requestCountsAtResume.BPFWrites,
    ProductionRequests: requestCounts.ProductionRequests - requestCountsAtResume.ProductionRequests,
    ExternalLLMCalls: requestCounts.ExternalLLMCalls - requestCountsAtResume.ExternalLLMCalls,
  };
  ensure(fullStateActionsRequestStatsAreSafe(requestDelta), "R4C request boundary failed");
  return { explicit, distribution, opportunityClose: { total: closes.total, duplicates: closes.duplicates, attachments: closes.attachments, win: distribution.Won, lose: distribution.Lost }, bpf, plugin, workflow, requestDelta, nonTargetBusinessIntegrity: true };
}

async function performStateAction(candidate, actionType, batchId) {
  const stats = actionStats[actionType];
  const exactId = opportunityId(candidate.opportunityToken);
  const priorAction = privateState.actions[candidate.opportunityToken];
  const payload = actionType === "WinOpportunity"
    ? buildRemainingWinPayload({ opportunityId: exactId, candidate })
    : buildLoseOpportunityPayload({ opportunityId: exactId, candidate });
  const expectedState = actionType === "WinOpportunity" ? 1 : 2;
  const beforeState = (await opportunityStateSnapshot([candidate.opportunityToken]))[0];
  const beforeClose = await opportunityCloseSnapshot(candidate.opportunityToken);
  if (beforeState.statecode === expectedState && beforeState.statuscode === Number(candidate.status) && beforeClose.count === 1) {
    ensure(priorAction?.actionStatus?.startsWith("Succeeded"), `${actionType}:${candidate.opportunityToken} closed without D6 action evidence`);
    ensure(closeMatches(beforeClose, candidate, payload, actionType), `${actionType}:${candidate.opportunityToken} existing close mismatch`);
    const bpf = await bpfSnapshot(candidate.opportunityToken);
    assertBpfSnapshot(bpf, candidate.opportunityToken, true);
    stats.attempt += 1;
    stats.reused += 1;
    return { token: candidate.opportunityToken, actionType, result: "Reused", batchId, bpfSideEffect: "A" };
  }
  ensure(beforeState.statecode === 0 && beforeState.statuscode === 1 && beforeState.actualclosedate == null, `${actionType}:${candidate.opportunityToken} is not Active 0/1`);
  ensure(beforeClose.count === 0, `${actionType}:${candidate.opportunityToken} already has OpportunityClose`);
  const beforeBpf = await bpfSnapshot(candidate.opportunityToken);
  assertBpfSnapshot(beforeBpf, candidate.opportunityToken, true);
  const beforeRelated = await relatedBusinessSnapshot(candidate.opportunityToken);
  stats.attempt += 1;
  let response = null;
  let actionError = null;
  try {
    response = await post(`/api/data/v9.2/${actionType}`, payload, `${actionType}Attempts`);
  } catch (error) {
    actionError = compactError(error);
    if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
      stats.failed += 1;
      throw error;
    }
  }
  let afterState = (await opportunityStateSnapshot([candidate.opportunityToken]))[0];
  if (afterState.statecode !== expectedState) {
    await delay(1200);
    afterState = (await opportunityStateSnapshot([candidate.opportunityToken]))[0];
  }
  const afterClose = await opportunityCloseSnapshot(candidate.opportunityToken);
  ensure(afterState.statecode === expectedState && afterState.statuscode === Number(candidate.status), `${actionType}:${candidate.opportunityToken} final state mismatch`);
  ensure(String(afterState.actualclosedate || "").slice(0, 10) === candidate.actualEnd, `${actionType}:${candidate.opportunityToken} actualclosedate mismatch`);
  if (actionType === "WinOpportunity") ensure(Number(afterState.actualvalue) === Number(candidate.actualRevenue), `${actionType}:${candidate.opportunityToken} actualvalue mismatch`);
  ensure(closeMatches(afterClose, candidate, payload, actionType), `${actionType}:${candidate.opportunityToken} OpportunityClose mismatch`);
  const afterBpf = await bpfSnapshot(candidate.opportunityToken);
  assertBpfSnapshot(afterBpf, candidate.opportunityToken, true);
  const classification = actionType === "WinOpportunity" ? classifyBpfCloseSideEffect(beforeBpf, afterBpf) : classifyBpfLoseSideEffect(beforeBpf, afterBpf);
  ensure(classification.ready, `${actionType}:${candidate.opportunityToken} ${classification.label}`);
  const afterRelated = await relatedBusinessSnapshot(candidate.opportunityToken);
  ensure(beforeRelated.recordCount === afterRelated.recordCount && beforeRelated.hash === afterRelated.hash, `${actionType}:${candidate.opportunityToken} non-target business data changed`);
  if (classification.severity === "P2") privateState.p2Events = [...(privateState.p2Events || []), { token: candidate.opportunityToken, actionType, code: classification.code, label: classification.label }];
  stats.succeeded += 1;
  requestCounts[`${actionType}Success`] += 1;
  const closeId = normalizeId(afterClose.rows[0].activityid);
  privateState.actions[candidate.opportunityToken] = {
    actionType,
    batchId,
    opportunityToken: candidate.opportunityToken,
    exactOpportunityId: exactId,
    opportunityCloseExactId: closeId,
    actualRevenue: actionType === "WinOpportunity" ? candidate.actualRevenue : null,
    actualEnd: candidate.actualEnd,
    requestCorrelation: response?.correlation || null,
    actionTimestamp: new Date().toISOString(),
    beforeState,
    afterState,
    bpfBefore: beforeBpf,
    bpfAfter: afterBpf,
    bpfSideEffect: classification,
    relatedBusinessHashBefore: beforeRelated.hash,
    relatedBusinessHashAfter: afterRelated.hash,
    actionStatus: actionError ? "SucceededByExactReadback" : "Succeeded",
    httpStatus: response?.status || actionError?.status || null,
    cleanupEligibility: true,
  };
  await persistPrivate();
  return { token: candidate.opportunityToken, actionType, result: privateState.actions[candidate.opportunityToken].actionStatus, batchId, bpfSideEffect: classification.code };
}

async function runActionBatches(candidates, actionType, prefix) {
  const batches = buildStableBatches(candidates.map((row) => ({ ...row, _record_token: row.opportunityToken })), D6_FULL_IMPORT.batchSizes[actionType], prefix);
  const results = [];
  for (const batch of batches) {
    console.log(JSON.stringify({ step: "action-batch-start", batchId: batch.id, actionType, count: batch.size }));
    const ledger = { batchId: batch.id, entity: actionType, expected: batch.size, startedAt: new Date().toISOString(), attempt: 0, succeeded: 0, reused: 0, failed: 0, completed: false };
    privateState.batchLedger.push(ledger);
    await persistPrivate();
    try {
      for (const candidate of batch.rows) results.push(await performStateAction(candidate, actionType, batch.id));
      const batchResults = results.filter((row) => row.batchId === batch.id);
      ledger.attempt = batchResults.length;
      ledger.succeeded = batchResults.filter((row) => row.result.startsWith("Succeeded")).length;
      ledger.reused = batchResults.filter((row) => row.result === "Reused").length;
      ensure(ledger.attempt === batch.size && ledger.succeeded + ledger.reused === batch.size, `${batch.id} action batch incomplete`);
      ledger.completed = true;
      ledger.completedAt = new Date().toISOString();
      await persistPrivate();
      console.log(JSON.stringify({ step: "action-batch-complete", batchId: batch.id, actionType, succeeded: ledger.succeeded, reused: ledger.reused }));
    } catch (error) {
      ledger.failed = 1;
      ledger.blocker = sanitizeError(error);
      ledger.completedAt = new Date().toISOString();
      await persistPrivate();
      throw error;
    }
  }
  return results;
}

async function verifyFinalFullData() {
  const explicit = await fullExplicitReadback();
  const states = await opportunityStateSnapshot();
  const distribution = stateDistribution(states);
  ensure(stableJson(distribution) === stableJson(D6_FULL_IMPORT.finalState), `Final state distribution mismatch: ${JSON.stringify(distribution)}`);
  const closes = await allOpportunityCloses();
  ensure(closes.total === 100 && closes.duplicates === 0 && closes.attachments === 0, "Final OpportunityClose integrity failed");
  const closedTokens = new Set(allRows.Opportunity.filter((row) => row._desired_state !== "开放").map((row) => row._record_token));
  ensure(closes.rows.every((row) => row.count === (closedTokens.has(row.token) ? 1 : 0)), "OpportunityClose state-plan cardinality failed");
  const bpf = await allBpfSnapshot();
  ensure(bpf.targetInstanceCount === 200 && bpf.initialStageCount === 200 && bpf.duplicateCount === 0 && bpf.unexpectedProcessCount === 0, "Final BPF integrity failed");
  const actual = await actualUniquenessReadback();
  const plugin = await pluginSnapshot();
  ensure(plugin.ready, "Final Plugin 7/0 gate failed");
  const workflow = await workflowSnapshot();
  ensure(workflow.definitionHash === "aac15b0adae5d1041df319b7dd187cc4a517c446725e6f2785e68939c015dbf8" && workflow.processOrder === 0, "Final BPF definition/order gate failed");
  return { explicit, distribution, opportunityClose: { total: closes.total, duplicates: closes.duplicates, attachments: closes.attachments, win: distribution.Won, lose: distribution.Lost }, bpf: { targetInstanceCount: bpf.targetInstanceCount, initialStageCount: bpf.initialStageCount, duplicateCount: bpf.duplicateCount, unexpectedProcessCount: bpf.unexpectedProcessCount }, actual, plugin, workflow };
}

if (false) {
async function verifyBpfForOpportunity(token) {
  const exactId = opportunityId(token);
  const set = entitySet("aigw_ai_demo_full_replica");
  const initialStageId = normalizeId(canaryPrecheck.exactIds.initialStageId);
  let targetRows = [];
  let processInstances = [];
  let attempts = 0;
  for (attempts = 1; attempts <= 5; attempts += 1) {
    targetRows = await all(`/api/data/v9.2/${set}?$select=${primaryId("aigw_ai_demo_full_replica")},_bpf_opportunityid_value,_activestageid_value,traversedpath,statecode,statuscode,createdon,modifiedon&$filter=_bpf_opportunityid_value eq ${exactId}`, "platform");
    const processBody = await get(`/api/data/v9.2/RetrieveProcessInstances(EntityId=${exactId},EntityLogicalName='opportunity')`, "platform");
    processInstances = processBody.value || processBody.Processes || processBody.processes || [];
    if (targetRows.length > 1) throw new Error(`BPF:${token} duplicate target instances`);
    if (processInstances.length > 1) throw new Error(`BPF:${token} multiple process instances`);
    if (targetRows.length === 1 && processInstances.length === 1) break;
    if (attempts < 5) await delay(1000);
  }
  ensure(targetRows.length === 1, `BPF:${token} target instance missing after ${attempts} readbacks`);
  ensure(processInstances.length === 1, `BPF:${token} process instance missing after ${attempts} readbacks`);
  const bpf = targetRows[0];
  const process = processInstances[0];
  const processId = normalizeId(process._processid_value || process.ProcessDefinitionID || process.processdefinitionid || process.ProcessId || process.processid);
  ensure(processId === normalizeId(BPF_ID), `BPF:${token} unexpected process`);
  ensure((process.Process_x002e_name || process.name) === BPF_NAME, `BPF:${token} process name mismatch`);
  ensure(normalizeId(bpf._bpf_opportunityid_value) === exactId, `BPF:${token} Opportunity mismatch`);
  ensure(normalizeId(bpf._activestageid_value) === initialStageId, `BPF:${token} active stage mismatch`);
  ensure(normalizeId(process.processstageid) === initialStageId, `BPF:${token} process stage cross-readback mismatch`);
  const traversed = String(bpf.traversedpath || "").split(",").map(normalizeId).filter(Boolean);
  ensure(traversed.length === 1 && traversed[0] === initialStageId, `BPF:${token} traversed path mismatch`);
  ensure(Number(bpf.statecode) === 0, `BPF:${token} instance is not Active`);
  ensure(Number(process.Process_x002e_statecode) === 1 && Number(process.Process_x002e_statuscode) === 2, `BPF:${token} workflow is not Active/Activated`);

  const record = privateState.records[`Opportunity:${token}`];
  ensure(record, `BPF:${token} private Opportunity record missing`);
  record.targetBpfInstanceExactId = normalizeId(bpf[primaryId("aigw_ai_demo_full_replica")]);
  record.processAlias = BPF_UNIQUE_NAME;
  record.activeStageAlias = INITIAL_STAGE;
  record.instanceCount = 1;
  record.duplicateCount = 0;
  record.platformCreated = true;
  record.bpfCreatedOrReused = "Reused";
  record.bpfReadbackEvidence = { targetRow: bpf, processInstance: process, attempts };
  privateState.bpfReadbacks[token] = {
    targetBpfInstanceExactId: record.targetBpfInstanceExactId,
    opportunityExactId: exactId,
    processAlias: BPF_UNIQUE_NAME,
    activeStageAlias: INITIAL_STAGE,
    instanceCount: 1,
    duplicateCount: 0,
    unexpectedProcessCount: 0,
    platformCreated: true,
    createdOrReused: record.bpfCreatedOrReused,
    readbackAttempts: attempts,
  };
  await persistPrivate();
  return { token, targetInstanceCount: 1, duplicateCount: 0, unexpectedProcessCount: 0, activeStageAlias: INITIAL_STAGE, traversedPathStageCount: traversed.length, readbackAttempts: attempts };
}

async function pluginSnapshot() {
  const assemblies = await all("/api/data/v9.2/pluginassemblies?$select=pluginassemblyid&$filter=name eq 'CrmAiGateway.ActualTotals.Plugin'", "platform");
  if (assemblies.length !== 1) return { enabled: 0, disabled: 0, ready: false };
  const types = await all(`/api/data/v9.2/plugintypes?$select=plugintypeid&$filter=_pluginassemblyid_value eq ${normalizeId(assemblies[0].pluginassemblyid)}`, "platform");
  const typeIds = new Set(types.map((row) => normalizeId(row.plugintypeid)));
  const steps = await all("/api/data/v9.2/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,statecode,_plugintypeid_value", "platform");
  const ours = steps.filter((row) => typeIds.has(normalizeId(row._plugintypeid_value)));
  return { enabled: ours.filter((row) => Number(row.statecode) === 0).length, disabled: ours.filter((row) => Number(row.statecode) !== 0).length, ready: ours.filter((row) => Number(row.statecode) === 0).length === 7 && ours.filter((row) => Number(row.statecode) !== 0).length === 0 };
}

async function runRows(values, importer) { for (const row of values) await importer(row); }

async function allPilotOpportunities() {
  const readbacks = [];
  for (const row of rows.Opportunity) {
    const exactId = opportunityId(row._record_token);
    readbacks.push(await get(`/api/data/v9.2/${entitySet("opportunity")}(${exactId})?$select=opportunityid,statecode,statuscode,actualclosedate,aigw_yearrevenueactual,modifiedon`));
  }
  return readbacks;
}

async function verifyFinal() {
  const opportunityReadbacks = await allPilotOpportunities();
  const distribution = opportunityReadbacks.reduce((acc, row) => { const key = Number(row.statecode) === 0 ? "Active" : Number(row.statecode) === 1 ? "Won" : Number(row.statecode) === 2 ? "Lost" : `Other:${row.statecode}`; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  ensure(distribution.Active === 24 && Object.keys(distribution).length === 1, `Base Pilot state distribution mismatch: ${JSON.stringify(distribution)}`);
  ensure(opportunityReadbacks.every((row) => Number(row.statuscode) === 1 && (row.actualclosedate === null || row.actualclosedate === undefined)), "Base Pilot Opportunity status/close-date integrity failed");
  const bpf = [];
  for (const row of rows.Opportunity) bpf.push(await verifyBpfForOpportunity(row._record_token));
  ensure(bpf.length === 24 && bpf.every((row) => row.targetInstanceCount === 1 && row.duplicateCount === 0 && row.unexpectedProcessCount === 0 && row.activeStageAlias === INITIAL_STAGE), "Final BPF integrity failed");
  for (const row of rows.ActualManagement) {
    const parent = opportunityId(row.aigw_opportunityid_token);
    const actuals = await all(`/api/data/v9.2/${entitySet("aigw_actualmanagement")}?$select=${primaryId("aigw_actualmanagement")},aigw_name&$filter=_aigw_opportunityid_value eq ${parent}`);
    ensure(actuals.length === 1 && actuals[0].aigw_name === row.aigw_name, `Final Actual uniqueness failed: ${row._record_token}`);
  }
  const actualParents = new Set(rows.ActualManagement.map((row) => row.aigw_opportunityid_token));
  for (const row of rows.Opportunity.filter((item) => !actualParents.has(item._record_token))) {
    const actuals = await all(`/api/data/v9.2/${entitySet("aigw_actualmanagement")}?$select=${primaryId("aigw_actualmanagement")}&$filter=_aigw_opportunityid_value eq ${opportunityId(row._record_token)}`);
    ensure(actuals.length === 0, `Unexpected Actual for ${row._record_token}`);
  }
  const workflow = await get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,name,uniquename,statecode,statuscode,processorder`, "platform");
  ensure(workflow.name === BPF_NAME && workflow.uniquename === BPF_UNIQUE_NAME && Number(workflow.statecode) === 1 && Number(workflow.statuscode) === 2 && Number(workflow.processorder) === 0, "Final target BPF definition gate failed");
  return { distribution, bpf: { targetInstanceCount: bpf.length, duplicateCount: 0, unexpectedProcessCount: 0, initialStageReadyCount: bpf.filter((row) => row.activeStageAlias === INITIAL_STAGE).length }, workflow: { nameAlias: BPF_UNIQUE_NAME, active: true, processOrder: 0 } };
}

let outcome = null;
let blocker = null;
const pluginBefore = await pluginSnapshot();
ensure(pluginBefore.ready, "Plugin 7/0 preflight failed");
await persistPrivate();
try {
  if (!flags.apply) {
    outcome = { dryRun: true, preflightReady: true };
  } else {
    await runRows(rows.Account, importAccount);
    await runRows(rows.Contact, importContact);
    await runRows(rows.Opportunity, importOpportunity);
    ensure(Object.keys(privateState.bpfReadbacks).length === 24, "Opportunity stage BPF count gate failed");
    const canaryRecord = privateState.records[`Opportunity:${CANARY_OPPORTUNITY}`];
    ensure(privateState.records["Account:A-050"]?.resumeResult === "Reused" && privateState.records["Contact:C-099"]?.resumeResult === "Reused" && canaryRecord?.resumeResult === "Reused" && canaryRecord?.bpfCreatedOrReused === "Reused", "Canary reuse gate failed");
    privateState.canary = { ready: true, opportunityToken: CANARY_OPPORTUNITY, accountReused: true, contactReused: true, opportunityReused: true, bpfInstanceReused: true, stateBeforeActions: "Active" };
    await persistPrivate();

    await runRows(rows.ServiceCoverage, importCoverage);
    await runRows(rows.ActualManagement, importActual);
    await runRows(rows.Timeline, importTimeline);
    await runRows(rows.InteractionSignal, importSignal);

    for (const [kind, expected] of Object.entries(EXPECTED)) ensure(stageStats[kind].created + stageStats[kind].reused === expected && stageStats[kind].failed === 0, `${kind} stage gate failed`);
    const final = await verifyFinal();
    const pluginAfter = await pluginSnapshot();
    ensure(pluginAfter.ready, "Plugin 7/0 final readback failed");
    outcome = { dryRun: false, preflightReady: true, baseImportCompleted: true, pilotImportCompleted: false, stateActionsDeferred: true, final, pluginBefore, pluginAfter };
  }
} catch (error) {
  blocker = compactError(error);
  privateState.blockers.push(blocker);
  outcome = { dryRun: !flags.apply, preflightReady: true, importCompleted: false };
}

privateState.resumeExecutionCompletedAt = new Date().toISOString();
privateState.outcome = outcome;
await persistPrivate();

function sanitizeStats() { return Object.fromEntries(Object.entries(stageStats).map(([key, value]) => [key, value])); }
function cumulativeStats() {
  return Object.fromEntries(Object.entries(EXPECTED).map(([name, expected]) => {
    const records = Object.values(privateState.records).filter((record) => record.entity === name);
    const created = records.filter((record) => record.r1OriginResult === "Created" || String(record.createdOrReused).startsWith("Created")).length;
    const reused = records.filter((record) => record.r1OriginResult === "Reused" || record.createdOrReused === "Reused").length;
    const attempt = stageStats[name].attempt;
    return [name, { attempt, created, reused, failed: stageStats[name].failed, pending: Math.max(0, expected - attempt) }];
  }));
}
function requestDelta() {
  return Object.fromEntries(Object.entries(requestCounts).map(([key, value]) => [key, Number(value || 0) - Number(requestCountsAtResume[key] || 0)]));
}
function publicGates() {
  const complete = Boolean(outcome?.baseImportCompleted);
  const noFailures = Object.values(stageStats).every((stat) => stat.failed === 0);
  const bpfReady = complete && outcome.final?.bpf?.targetInstanceCount === 24 && outcome.final?.bpf?.duplicateCount === 0 && outcome.final?.bpf?.unexpectedProcessCount === 0 && outcome.final?.bpf?.initialStageReadyCount === 24;
  return {
    bpfAutoInstanceContractReady: true,
    canaryBpfIntegrityReady: canaryPrecheck.gates.targetBpfInstanceReady && canaryPrecheck.gates.targetBpfUniqueReady,
    canaryReady: privateState.canary?.ready === true,
    canaryRecordsReused: privateState.canary?.accountReused === true && privateState.canary?.contactReused === true && privateState.canary?.opportunityReused === true && privateState.canary?.bpfInstanceReused === true,
    accountImportReady: stageStats.Account.created + stageStats.Account.reused === 7 && stageStats.Account.failed === 0,
    contactImportReady: stageStats.Contact.created + stageStats.Contact.reused === 9 && stageStats.Contact.failed === 0,
    opportunityImportReady: stageStats.Opportunity.created + stageStats.Opportunity.reused === 24 && stageStats.Opportunity.failed === 0,
    opportunityCount: complete ? 24 : stageStats.Opportunity.created + stageStats.Opportunity.reused,
    targetBpfInstanceCount: complete ? outcome.final.bpf.targetInstanceCount : Object.keys(privateState.bpfReadbacks).length,
    duplicateBpfInstanceCount: complete ? outcome.final.bpf.duplicateCount : null,
    unexpectedBpfProcessCount: complete ? outcome.final.bpf.unexpectedProcessCount : null,
    coverageImportReady: stageStats.ServiceCoverage.created + stageStats.ServiceCoverage.reused === 15 && stageStats.ServiceCoverage.failed === 0,
    actualImportReady: stageStats.ActualManagement.created + stageStats.ActualManagement.reused === 12 && stageStats.ActualManagement.failed === 0,
    timelineImportReady: stageStats.Timeline.created + stageStats.Timeline.reused === 206 && stageStats.Timeline.failed === 0,
    signalImportReady: stageStats.InteractionSignal.created + stageStats.InteractionSignal.reused === 154 && stageStats.InteractionSignal.failed === 0,
    basePilotDataImportCompleted: complete && noFailures && bpfReady,
    pilotStateActionsDeferred: true,
    winOpportunityCount: 0,
    loseOpportunityCount: 0,
    pilotImportCompleted: false,
    pilotExactReadbackReady: complete && publicLedger.length === 427 && publicLedger.every((item) => item.exactReadback),
    pilotExactIdManifestReady: complete && Object.keys(privateState.records).length === 427 && Object.keys(privateState.bpfReadbacks).length === 24,
    pilotCleanupAuthorized: false,
    cleanupExecuted: false,
    existingNonPilotDataModified: false,
    pilotScopeExceeded: false,
    fullImportStarted: false,
    productionIsolationReady: requestCounts.productionRequests === 0,
    fullImportReady: false,
    fullImportAuthorized: false,
  };
}

const gates = publicGates();
const p0 = requestCounts.productionRequests || requestCounts.PATCH || requestCounts.DELETE || requestCounts.Publish || requestCounts.teamRoleMembershipChanges || requestCounts.BpfInstancePOST || requestCounts.BpfInstancePATCH || requestCounts.BpfInstanceDELETE ? 1 : 0;
const p1 = blocker || (flags.apply && !gates.basePilotDataImportCompleted) ? 1 : 0;
const p2 = flags.apply && gates.timelineImportReady ? 1 : 0;
const createdTokens = Object.values(privateState.records).filter((item) => item.cleanupEligibility).map((item) => ({ entity: item.entity, token: item.stableToken }));
const cleanupGroups = ["InteractionSignal", "Timeline", "ActualManagement", "ServiceCoverage", "Opportunity", "Contact", "Account"].map((entityName) => ({ entity: entityName, tokens: createdTokens.filter((item) => item.entity === entityName).map((item) => item.token) }));
const bpfPublicRows = rows.Opportunity.map((row) => ({ opportunityToken: row._record_token, targetInstanceCount: privateState.bpfReadbacks[row._record_token]?.instanceCount ?? 0, duplicateCount: privateState.bpfReadbacks[row._record_token]?.duplicateCount ?? null, unexpectedProcessCount: privateState.bpfReadbacks[row._record_token]?.unexpectedProcessCount ?? null, activeStageAlias: privateState.bpfReadbacks[row._record_token]?.activeStageAlias ?? null, createdOrReused: privateState.bpfReadbacks[row._record_token]?.createdOrReused ?? null }));
const cumulativeStageStats = cumulativeStats();
const publicBase = { phase: PHASE, environmentAlias: "TEST-ORG", generatedAt: new Date().toISOString(), contract: { explicitPilotRecords: 427, expectedPlatformBpfInstances: 24, manualBpfWritesAllowed: false, nextStageAllowed: false, finishAllowed: false, stateActionsDeferred: true }, workbooks: { formal: { bytes: formalBytes.length, sha256: formalHash }, pilot: { bytes: pilotBytes.length, sha256: pilotHash } }, expectedCounts: EXPECTED, stageStats: cumulativeStageStats, resumeExecutionStageStats: sanitizeStats(), actionStats, requestCounts, resumeRequestCounts: requestDelta(), p0, p1, p2, gates, blockers: blocker ? [blocker] : [], validatorRecovery: { token: "TL-1630", historicalPostRejected: true, exactRetryAuthorized: true, futureAnnotationContract: "BodyPlannedDate" } };

await fs.writeFile(new URL("local-artifacts/d365/d5-r1a-runtime-validation.json", ROOT), `${JSON.stringify(publicBase, null, 2)}\n`);
await fs.writeFile(new URL("local-artifacts/d365/d5-r1a-runtime-ledger.json", ROOT), `${JSON.stringify({ phase: publicBase.phase, records: publicLedger }, null, 2)}\n`);
await fs.writeFile(new URL("local-artifacts/d365/d5-r1a-runtime-bpf.json", ROOT), `${JSON.stringify({ phase: publicBase.phase, targetProcessAlias: BPF_UNIQUE_NAME, initialStageAlias: INITIAL_STAGE, targetInstanceCount: outcome?.final?.bpf?.targetInstanceCount ?? Object.keys(privateState.bpfReadbacks).length, duplicateInstanceCount: outcome?.final?.bpf?.duplicateCount ?? null, unexpectedProcessCount: outcome?.final?.bpf?.unexpectedProcessCount ?? null, processOrder: outcome?.final?.workflow?.processOrder ?? 0, workflowActive: outcome?.final?.workflow?.active ?? true, manualBpfWrites: { POST: 0, PATCH: 0, DELETE: 0 }, opportunities: bpfPublicRows }, null, 2)}\n`);
await fs.writeFile(new URL("local-artifacts/d365/d5-r1a-runtime-base.json", ROOT), `${JSON.stringify({ phase: publicBase.phase, explicitPilotRecordCount: publicLedger.filter((item) => item.exactReadback).length, byEntity: cumulativeStageStats, resumeExecutionByEntity: sanitizeStats(), finalOpportunityDistribution: outcome?.final?.distribution || null, relationshipReadbackReady: gates.pilotExactReadbackReady, choiceReadbackReady: preflight.gates.choiceValuesReady, plugin: outcome?.pluginAfter || pluginBefore, stateActionsDeferred: true, WinOpportunity: 0, LoseOpportunity: 0 }, null, 2)}\n`);
await fs.writeFile(new URL("local-artifacts/d365/d5-r1a-runtime-cleanup.json", ROOT), `${JSON.stringify({ phase: publicBase.phase, cleanupManifestReady: gates.pilotExactIdManifestReady, cleanupAuthorized: false, cleanupExecuted: false, directBpfDeleteAuthorized: false, reverseOrder: cleanupGroups, opportunityCascadeRule: { deleteOpportunityFirst: false, afterFutureOpportunityDeleteReadOnlyVerifyBpfCascade: true, residualBpfAction: "STOP_AND_REQUEST_SEPARATE_AUTHORIZATION" }, excluded: ["Currency", "Location", "POL/POD", "Owner/User", "Demo Teams", "Canonical Role", "Choice", "Schema", "BPF", "Solution"] }, null, 2)}\n`);
await fs.writeFile(new URL("local-artifacts/d365/d5-r1a-runtime-state-actions.md", ROOT), `# D5-R1A 状态动作决策包\n\n- 基础数据导入：${gates.basePilotDataImportCompleted ? "完成" : "未完成"}\n- 当前 Opportunity 状态：Active ${outcome?.final?.distribution?.Active ?? 0} / Won 0 / Lost 0\n- WinOpportunity：0，本阶段未授权\n- LoseOpportunity：0，本阶段未授权\n- PATCH state/status/actualclosedate：0\n- 下一步：仅在基础数据和 24 条 BPF 完整性回读通过后，等待单独授权。\n`);

const report = `# Phase 1C-5R2G-D5-R1 BPF Contract Reconciliation and Base Pilot Resume\n\n- Environment: TEST-ORG\n- R1 Authorized: **true**\n- BPF auto-instance contract: **accepted**\n- Explicit records: **${publicLedger.filter((item) => item.exactReadback).length}/427**\n- Target BPF instances: **${outcome?.final?.bpf?.targetInstanceCount ?? Object.keys(privateState.bpfReadbacks).length}/24**\n- Win/Lose: **0/0**\n- Cleanup / Full Import: **not authorized**\n\n## Canary reuse\n\n- Account / Contact / Opportunity / BPF reused: **${gates.canaryRecordsReused}**\n- Business field delta before resume: **0**\n- Initial stage: **${INITIAL_STAGE}**\n\n## Import statistics\n\n| Entity | Attempt | Created | Reused | Failed |\n|---|---:|---:|---:|---:|\n${Object.entries(stageStats).map(([name, stat]) => `| ${name} | ${stat.attempt} | ${stat.created} | ${stat.reused} | ${stat.failed} |`).join("\n")}\n\n## BPF integrity\n\n- Target instances: ${outcome?.final?.bpf?.targetInstanceCount ?? 0}\n- Duplicate instances: ${outcome?.final?.bpf?.duplicateCount ?? "not final"}\n- Unexpected processes: ${outcome?.final?.bpf?.unexpectedProcessCount ?? "not final"}\n- Initial-stage ready: ${outcome?.final?.bpf?.initialStageReadyCount ?? 0}/24\n- Manual BPF POST/PATCH/DELETE: 0/0/0\n\n## State and safety\n\n- Final base distribution: ${JSON.stringify(outcome?.final?.distribution || null)}\n- Plugin: ${JSON.stringify(outcome?.pluginAfter || pluginBefore)}\n- Existing non-Pilot data modified: false\n- Production requests / External LLM: 0 / 0\n\n## Requests\n\n\`\`\`json\n${JSON.stringify(requestCounts, null, 2)}\n\`\`\`\n\n## P0/P1/P2\n\n- P0: **${p0}**\n- P1: **${p1}**\n- P2: **${p2}** (Timeline activities remain Open; no PATCH closure was authorized.)\n\n## Gates\n\n${Object.entries(gates).map(([key, value]) => `- ${key}: **${value}**`).join("\n")}\n\n## Blockers\n\n${blocker ? `- ${blocker.message}` : "- None"}\n`;
await fs.writeFile(new URL("local-artifacts/d365/d5-r1a-runtime-report.md", ROOT), report);

async function appendSection(pathName, marker, content) {
  const safePathName = pathName.includes("pilot-import-report")
    ? "local-artifacts/d365/d5-r1a-runtime-pilot-report.md"
    : "local-artifacts/d365/d5-r1a-runtime-recovery-plan.md";
  const path = new URL(safePathName, ROOT);
  const prior = await fs.readFile(path, "utf8").catch((error) => error?.code === "ENOENT" ? "" : Promise.reject(error));
  const index = prior.indexOf(marker);
  const head = (index >= 0 ? prior.slice(0, index) : prior).trimEnd();
  await fs.writeFile(path, `${head}\n\n${marker}\n\n${content.trim()}\n`);
}
await appendSection("docs/d365/d365-ai-demo-200-d5-pilot-import-report.md", "## D5-R1 BPF Contract Reconciliation and Base Resume", `- BPF auto-instance contract accepted: true\n- Canary Account/Contact/Opportunity/BPF reused: ${gates.canaryRecordsReused}\n- Explicit Pilot Records Ready: ${publicLedger.filter((item) => item.exactReadback).length}/427\n- Target BPF Instances: ${outcome?.final?.bpf?.targetInstanceCount ?? Object.keys(privateState.bpfReadbacks).length}/24\n- Duplicate / Unexpected BPF: ${outcome?.final?.bpf?.duplicateCount ?? "not final"} / ${outcome?.final?.bpf?.unexpectedProcessCount ?? "not final"}\n- Base Pilot Data Import Completed: ${gates.basePilotDataImportCompleted}\n- Win/Lose: 0/0 (deferred)\n- Cleanup / Full Import Authorized: false / false\n- P0/P1/P2: ${p0}/${p1}/${p2}`);
await appendSection("docs/d365/d365-ai-demo-200-d5-failure-recovery-plan-zh.md", "## D5-R1 契约协调结果", `- 原阻断已按用户授权修订为预期平台副作用：每个 Pilot Opportunity 精确 1 条目标 BPF。\n- 当前基础数据状态：${gates.basePilotDataImportCompleted ? "完成" : "阻断"}。\n- 当前阻断：${blocker ? blocker.message : "无"}。\n- Win/Lose、Cleanup、Full Import 仍未授权。\n- 未来 Cleanup 先删除显式子记录和 Opportunity，再只读验证 BPF 级联；BPF 残留时停止并请求独立授权。`);

console.log(JSON.stringify({ mode: flags.apply ? "apply" : "dry-run", blocker, stageStats, actionStats, requestCounts, p0, p1, p2, gates }, null, 2));
if (blocker || (flags.apply && !gates.basePilotDataImportCompleted)) process.exitCode = 2;
}

let d6Safety = null;
let d6PilotBaseline = null;
let d6Base = null;
let d6Actions = { won: [], lost: [] };
let d6Final = null;
let d6R1Baseline = null;
let d6R1Recovery = null;
let d6R1Final = null;
let d6R2Baseline = null;
let d6R2Execution = null;
let d6R2Final = null;
let d6R3Baseline = null;
let d6R3Execution = null;
let d6R3Final = null;
let d6R4AResult = null;
let d6R4BResult = null;
let d6R4CResult = null;
let d6Blocker = null;

try {
  d6Safety = await securityAndReferencePreflight();
  d6PilotBaseline = await verifyPilotBaseline();
  if (flags.resumeOpportunityOnly) {
    d6R1Baseline = await verifyD6R1Baseline();
    if (flags.apply) {
      d6R1Recovery = await runOpportunityRecoveryBatches();
      d6R1Final = await verifyD6R1OpportunityCompletion();
    }
  } else if (flags.resumeCoverageActualOnly) {
    d6R2Baseline = await verifyD6R2Baseline();
    if (flags.apply) {
      d6R2Execution = await runD6R2CoverageActual();
      d6R2Final = await verifyD6R2Completion();
    }
  } else if (flags.resumeTimelineSignalOnly) {
    d6R3Baseline = await verifyD6R3ABaseline();
    if (flags.apply) {
      d6R3Execution = d6R3Baseline.alreadyCompleted
        ? { alreadyCompleted: true, timelinePostAttempts: 0, signalPostAttempts: 0 }
        : await runD6R3TimelineSignal();
      d6R3Final = await verifyD6R3Completion();
    }
  } else if (flags.fullWinCanaryOnly) {
    if (flags.apply) d6R4AResult = await runD6R4AFullWinCanary();
  } else if (flags.fullLoseCanaryOnly) {
    if (flags.apply) d6R4BResult = await runD6R4BFullLoseCanary();
  } else if (flags.fullStateActionsOnly) {
    d6R4CResult = await verifyD6R4CStateActionBaseline();
    if (flags.apply) {
      const execution = await runD6R4CActionBatches(d6R4CResult);
      const final = await verifyD6R4CFinal();
      d6R4CResult = { ...d6R4CResult, execution, final };
    }
  } else if (flags.apply) {
    for (const entityName of D6_FULL_IMPORT.entities) await runEntityBatches(entityName);
    d6Base = await verifyBaseFullData();
    const candidates = buildStateCandidates();
    d6Actions.won = await runActionBatches(candidates.won, "WinOpportunity", "W");
    d6Actions.lost = await runActionBatches(candidates.lost, "LoseOpportunity", "L");
    d6Final = await verifyFinalFullData();
  }
} catch (error) {
  d6Blocker = sanitizeError(error);
  privateState.blockers.push(d6Blocker);
}

privateState.requestCounts = requestCounts;
privateState.stageStats = stageStats;
privateState.actionStats = actionStats;
privateState.executionCompletedAt = new Date().toISOString();
privateState.outcome = {
  mode: flags.apply ? "apply" : "dry-run",
  executionScope: flags.resumeOpportunityOnly ? "D6-R1-Opportunity-Only" : flags.resumeCoverageActualOnly ? "D6-R2-Coverage-Actual-Only" : flags.resumeTimelineSignalOnly ? "D6-R3-Timeline-Signal-Only" : flags.fullWinCanaryOnly ? "D6-R4A-Full-Win-Canary-Only" : flags.fullLoseCanaryOnly ? "D6-R4B-Full-Lose-Canary-Only" : flags.fullStateActionsOnly ? "D6-R4C-Full-State-Actions" : "D6-Full",
  safety: d6Safety,
  pilotBaseline: d6PilotBaseline,
  opportunityRecovery: { baseline: d6R1Baseline, execution: d6R1Recovery, final: d6R1Final },
  coverageActualRecovery: { baseline: d6R2Baseline, execution: d6R2Execution, final: d6R2Final },
  timelineSignalRecovery: { baseline: d6R3Baseline, execution: d6R3Execution, final: d6R3Final },
  fullWinCanary: d6R4AResult,
  fullLoseCanary: d6R4BResult,
  fullStateActions: d6R4CResult,
  base: d6Base,
  actions: d6Actions,
  final: d6Final,
  blocker: d6Blocker,
};
await persistPrivate();

function cumulativeCreatedReused(entityName) {
  const records = Object.values(privateState.records).filter((record) => record.entity === entityName);
  return {
    expected: D6_FULL_IMPORT.formalCounts[entityName],
    remainingExpected: D6_FULL_IMPORT.remainingCounts[entityName],
    attempt: stageStats[entityName].attempt,
    created: stageStats[entityName].created,
    reused: stageStats[entityName].reused,
    failed: stageStats[entityName].failed,
    exactManifestCount: records.length,
  };
}
const d6StageSummary = Object.fromEntries(D6_FULL_IMPORT.entities.map((entityName) => [entityName, cumulativeCreatedReused(entityName)]));
const publicBatchLedger = privateState.batchLedger.map((batch) => ({
  batchId: batch.batchId,
  entity: batch.entity,
  expected: batch.expected,
  attempt: batch.attempt,
  created: batch.created ?? null,
  reused: batch.reused ?? null,
  succeeded: batch.succeeded ?? null,
  failed: batch.failed,
  completed: batch.completed,
  blocker: batch.blocker || null,
}));
const completed = Boolean(flags.apply && d6Final && !d6Blocker);
const opportunityRecoveryCompleted = Boolean(flags.apply && flags.resumeOpportunityOnly && d6R1Final && !d6Blocker);
const coverageActualRecoveryCompleted = Boolean(flags.apply && flags.resumeCoverageActualOnly && d6R2Final && !d6Blocker);
const timelineSignalRecoveryCompleted = Boolean(flags.apply && flags.resumeTimelineSignalOnly && d6R3Final && !d6Blocker);
const fullWinCanaryCompleted = Boolean(flags.apply && flags.fullWinCanaryOnly && d6R4AResult && !d6Blocker);
const fullLoseCanaryCompleted = Boolean(flags.apply && flags.fullLoseCanaryOnly && d6R4BResult && !d6Blocker);
const fullStateActionsCompleted = Boolean(flags.apply && flags.fullStateActionsOnly && d6R4CResult?.final && !d6Blocker);
const r4cSucceededActions = Object.values(privateState.actions || {}).filter((action) => action.phase === D6_R4C_FULL_STATE_ACTIONS.phase && String(action.actionStatus || "").startsWith("Succeeded"));
const r4cSucceededWins = r4cSucceededActions.filter((action) => action.actionType === "WinOpportunity").length;
const r4cSucceededLosses = r4cSucceededActions.filter((action) => action.actionType === "LoseOpportunity").length;
const requestSafety = requestStatsAreSafe(requestCounts);
const d6Gates = {
  fullImportAuthorized: true,
  d6R1OpportunityRecoveryAuthorized: flags.resumeOpportunityOnly,
  d6R1BaselineReady: Boolean(d6R1Baseline),
  d6R1OpportunityRecoveryCompleted: opportunityRecoveryCompleted,
  d6R2CoverageActualAuthorized: flags.resumeCoverageActualOnly,
  d6R2BaselineReady: Boolean(d6R2Baseline),
  d6R2CoverageActualImportCompleted: coverageActualRecoveryCompleted,
  d6R4AFullWinCanaryAuthorized: flags.fullWinCanaryOnly,
  d6R4AFullWinCanaryCompleted: fullWinCanaryCompleted,
  d6R4BFullLoseCanaryAuthorized: flags.fullLoseCanaryOnly,
  d6R4BFullLoseCanaryCompleted: fullLoseCanaryCompleted,
  d6R4CFullStateActionsAuthorized: flags.fullStateActionsOnly,
  d6R4CFullStateActionsCompleted: fullStateActionsCompleted,
  complementManifestReady: true,
  remainingTokenOverlapCount: 0,
  remainingExplicitRecordCount: D6_FULL_IMPORT.explicitRemaining,
  accountImportReady: d6StageSummary.Account.exactManifestCount === 60,
  contactImportReady: d6StageSummary.Contact.exactManifestCount === 120,
  opportunityImportReady: (completed || opportunityRecoveryCompleted) && d6StageSummary.Opportunity.exactManifestCount === 200,
  newOpportunityCount: Math.max(0, d6StageSummary.Opportunity.exactManifestCount - 24),
  newTargetBpfCount: Math.max(0, Object.keys(privateState.bpfReadbacks).length - 24),
  totalTargetBpfCount: d6Final?.bpf?.targetInstanceCount ?? d6R1Final?.bpf?.targetInstanceCount ?? d6Base?.bpf?.targetInstanceCount ?? Object.keys(privateState.bpfReadbacks).length,
  coverageImportReady: (completed || coverageActualRecoveryCompleted) && d6StageSummary.ServiceCoverage.exactManifestCount === 240,
  actualImportReady: (completed || coverageActualRecoveryCompleted) && d6StageSummary.ActualManagement.exactManifestCount === 130,
  timelineImportReady: (completed || timelineSignalRecoveryCompleted) && d6StageSummary.Timeline.exactManifestCount === 1800,
  signalImportReady: (completed || timelineSignalRecoveryCompleted) && d6StageSummary.InteractionSignal.exactManifestCount === 1350,
  baseFullDataImportCompleted: Boolean(d6Base || d6R3Final || d6R4AResult || d6R4BResult?.baseline || d6R4CResult?.baseline),
  coverageAuthorized: !flags.resumeOpportunityOnly,
  actualAuthorized: !flags.resumeOpportunityOnly,
  timelineAuthorized: flags.resumeTimelineSignalOnly || (!flags.resumeOpportunityOnly && !flags.resumeCoverageActualOnly),
  signalAuthorized: flags.resumeTimelineSignalOnly || (!flags.resumeOpportunityOnly && !flags.resumeCoverageActualOnly),
  stateActionsAuthorized: !flags.resumeOpportunityOnly && !flags.resumeCoverageActualOnly && !flags.resumeTimelineSignalOnly && !flags.fullWinCanaryOnly && !flags.fullLoseCanaryOnly && !flags.fullStateActionsOnly,
  coverageFinalCount: d6StageSummary.ServiceCoverage.exactManifestCount,
  coveragePerAccountReady: Boolean(d6R2Final?.coveragePerAccount === 4),
  actualFinalCount: d6StageSummary.ActualManagement.exactManifestCount,
  oneActualPerOpportunityReady: Boolean(d6R2Final?.actual?.uniquePerOpportunity),
  annualActualRevenueIntegrityReady: Boolean(d6R2Final?.actual?.uniquePerOpportunity),
  parentOpportunityPluginSyncReady: Boolean(d6R2Final?.parentOpportunityExpectedSyncCount === 118 && d6R2Final?.parentOpportunityUnexpectedBusinessChangeCount === 0),
  parentUnexpectedBusinessChangeCount: d6R2Final?.parentOpportunityUnexpectedBusinessChangeCount ?? null,
  opportunityStateIntegrityReady: Boolean(
    (d6R4CResult?.final && stableJson(d6R4CResult.final.distribution) === stableJson(D6_R4C_FULL_STATE_ACTIONS.finalState))
    ||
    (d6R4AResult && stableJson(d6R4AResult.afterDistribution) === stableJson(D6_R4A_FULL_WIN_CANARY.expectedPostActionState))
    || (d6R4BResult && stableJson(d6R4BResult.afterDistribution) === stableJson(D6_R4B_FULL_LOSE_CANARY.expectedPostActionState))
    || ((d6R3Final || d6R2Final) && stableJson((d6R3Final || d6R2Final).distribution) === stableJson(D6_R2_COVERAGE_ACTUAL.expectedState)),
  ),
  bpfRuntimeIntegrityReady: Boolean((d6R4CResult?.final?.bpf || d6R4BResult?.bpf || d6R4AResult?.bpf || d6R3Final?.bpf || d6R2Final?.bpf)?.targetInstanceCount === 200 && (d6R4CResult?.final?.bpf || d6R4BResult?.bpf || d6R4AResult?.bpf || d6R3Final?.bpf || d6R2Final?.bpf)?.duplicateCount === 0 && (d6R4CResult?.final?.bpf || d6R4BResult?.bpf || d6R4AResult?.bpf || d6R3Final?.bpf || d6R2Final?.bpf)?.unexpectedProcessCount === 0),
  timelineSignalIntegrityReady: Boolean(
    d6R3Final
    && d6R3Final.timeline?.count === D6_R3_TIMELINE_SIGNAL.finalTimelineCount
    && d6R3Final.timeline?.duplicateTokenCount === 0
    && d6R3Final.signal?.count === D6_R3_TIMELINE_SIGNAL.finalSignalCount
    && d6R3Final.signal?.duplicateTokenCount === 0
    && d6R3Final.signal?.missingSourceCount === 0
  ),
  remainingWinCandidateCount: fullStateActionsCompleted ? 0 : (fullWinCanaryCompleted || Boolean(privateState.r4a?.canaryToken) ? 83 : 84),
  remainingLoseCandidateCount: fullStateActionsCompleted ? 0 : (fullLoseCanaryCompleted || Boolean(privateState.r4b?.canaryToken) ? 7 : 8),
  remainingStateActionsCompleted: fullStateActionsCompleted || (completed && d6Actions.won.length === 84 && d6Actions.lost.length === 8),
  finalStateDistributionReady: fullStateActionsCompleted || (completed && stableJson(d6Final.distribution) === stableJson(D6_FULL_IMPORT.finalState)),
  opportunityCloseFinalReady: fullStateActionsCompleted || (completed && d6Final.opportunityClose.total === 100 && d6Final.opportunityClose.duplicates === 0 && d6Final.opportunityClose.attachments === 0),
  fullExactReadbackReady: Boolean((d6R4CResult?.final?.explicit || d6R4BResult?.explicit || d6R4AResult?.explicit || d6Final?.explicit || d6R3Final?.explicit)?.recordCount === 3900),
  fullExactIdManifestReady: Boolean((completed || timelineSignalRecoveryCompleted || fullWinCanaryCompleted || fullLoseCanaryCompleted || fullStateActionsCompleted) && Object.keys(privateState.records).length === 3900 && Object.keys(privateState.bpfReadbacks).length === 200),
  fullCleanupManifestReady: false,
  cleanupAuthorized: false,
  cleanupExecuted: false,
  existingNonDemoDataModified: false,
  productionIsolationReady: requestCounts.ProductionRequests === 0,
  gatewayFullDatasetIntegrationReady: false,
  fullImportCompleted: completed,
  fullImportClosed: completed,
};
const d6P0 = requestSafety ? 0 : 1;
const requiredExecutionCompleted = flags.resumeOpportunityOnly ? opportunityRecoveryCompleted : flags.resumeCoverageActualOnly ? coverageActualRecoveryCompleted : flags.resumeTimelineSignalOnly ? timelineSignalRecoveryCompleted : flags.fullWinCanaryOnly ? fullWinCanaryCompleted : flags.fullLoseCanaryOnly ? fullLoseCanaryCompleted : flags.fullStateActionsOnly ? fullStateActionsCompleted : completed;
const d6P1 = d6Blocker || (flags.apply && !requiredExecutionCompleted) ? 1 : 0;
const d6P2 = (privateState.p2Events || []).length;
const publicD6R3Final = d6R3Final ? {
  ...d6R3Final,
  bpf: {
    targetInstanceCount: d6R3Final.bpf.targetInstanceCount,
    initialStageCount: d6R3Final.bpf.initialStageCount,
    duplicateCount: d6R3Final.bpf.duplicateCount,
    unexpectedProcessCount: d6R3Final.bpf.unexpectedProcessCount,
  },
} : null;
const publicD6R4BResult = d6R4BResult ? {
  ...d6R4BResult,
  candidate: {
    opportunityToken: d6R4BResult.candidate.opportunityToken,
    status: d6R4BResult.candidate.status,
    statusLabel: d6R4BResult.candidate.statusLabel,
    actualEnd: d6R4BResult.candidate.actualEnd,
    expectedActualCount: d6R4BResult.candidate.expectedActualCount,
  },
  baseline: {
    explicit: { recordCount: d6R4BResult.baseline.explicit.recordCount, counts: d6R4BResult.baseline.explicit.counts },
    distribution: d6R4BResult.baseline.distribution,
    opportunityClose: d6R4BResult.baseline.opportunityClose,
    bpf: { targetInstanceCount: d6R4BResult.baseline.bpf.targetInstanceCount, initialStageCount: d6R4BResult.baseline.bpf.initialStageCount, duplicateCount: d6R4BResult.baseline.bpf.duplicateCount, unexpectedProcessCount: d6R4BResult.baseline.bpf.unexpectedProcessCount },
  },
} : null;
const publicD6R4CResult = d6R4CResult ? {
  baseline: {
    distribution: d6R4CResult.distribution,
    opportunityClose: d6R4CResult.opportunityClose,
    bpf: d6R4CResult.bpf,
    pendingWinCount: d6R4CResult.pending?.won?.length ?? null,
    pendingLoseCount: d6R4CResult.pending?.lost?.length ?? null,
    actualValidation: (d6R4CResult.actualValidation || []).map((item) => ({
      opportunityToken: item.opportunityToken,
      actionType: item.actionType,
      expectedActualCount: item.expectedActualCount,
      actualCount: item.actualCount,
      dataConsistent: item.dataConsistent,
    })),
  },
  execution: d6R4CResult.execution ? {
    batches: d6R4CResult.execution.batches,
    results: d6R4CResult.execution.results,
  } : null,
  final: d6R4CResult.final ? {
    distribution: d6R4CResult.final.distribution,
    opportunityClose: d6R4CResult.final.opportunityClose,
    bpf: {
      targetInstanceCount: d6R4CResult.final.bpf.targetInstanceCount,
      initialStageCount: d6R4CResult.final.bpf.initialStageCount,
      duplicateCount: d6R4CResult.final.bpf.duplicateCount,
      unexpectedProcessCount: d6R4CResult.final.bpf.unexpectedProcessCount,
    },
    explicit: {
      recordCount: d6R4CResult.final.explicit.recordCount,
      counts: d6R4CResult.final.explicit.counts,
    },
    requestDelta: d6R4CResult.final.requestDelta,
    nonTargetBusinessIntegrity: d6R4CResult.final.nonTargetBusinessIntegrity,
  } : null,
} : null;
const publicRuntime = {
  phase: PHASE,
  executionPhase: flags.resumeOpportunityOnly ? D6_R1_OPPORTUNITY_RECOVERY.phase : flags.resumeCoverageActualOnly ? D6_R2_COVERAGE_ACTUAL.phase : flags.resumeTimelineSignalOnly ? D6_R3_TIMELINE_SIGNAL.phase : flags.fullWinCanaryOnly ? D6_R4A_FULL_WIN_CANARY.phase : flags.fullLoseCanaryOnly ? D6_R4B_FULL_LOSE_CANARY.phase : flags.fullStateActionsOnly ? D6_R4C_FULL_STATE_ACTIONS.phase : PHASE,
  executionScope: flags.resumeOpportunityOnly ? "Opportunity-Only" : flags.resumeCoverageActualOnly ? "Coverage-Actual-Only" : flags.resumeTimelineSignalOnly ? "Timeline-Signal-Only" : flags.fullWinCanaryOnly ? "Full-Win-Canary-Only" : flags.fullLoseCanaryOnly ? "Full-Lose-Canary-Only" : flags.fullStateActionsOnly ? "Full-State-Actions" : "Full-D6",
  environmentAlias: "TEST-ORG",
  mode: flags.apply ? "apply" : "dry-run",
  generatedAt: new Date().toISOString(),
  workbook: {
    formal: { bytes: formalBytes.length, sha256: formalHash },
    pilot: { bytes: pilotBytes.length, sha256: pilotHash },
    remaining: { ...workbook.output, bytes: remainingWorkbookBytes.length, sha256: remainingWorkbookHash },
  },
  complement: { counts: D6_FULL_IMPORT.remainingCounts, explicit: D6_FULL_IMPORT.explicitRemaining, pilotTokenOverlap: 0 },
  safety: d6Safety,
  pilotBaseline: d6PilotBaseline,
  opportunityRecovery: { baseline: d6R1Baseline, execution: d6R1Recovery, final: d6R1Final },
  coverageActualRecovery: { baseline: d6R2Baseline, execution: d6R2Execution, final: d6R2Final },
  timelineSignalRecovery: { baseline: d6R3Baseline, execution: d6R3Execution, final: publicD6R3Final },
  fullWinCanary: d6R4AResult ? {
    candidate: d6R4AResult.candidate,
    result: d6R4AResult.result,
    beforeDistribution: d6R4AResult.beforeDistribution,
    afterDistribution: d6R4AResult.afterDistribution,
    opportunityClose: d6R4AResult.opportunityClose,
    bpfClassification: d6R4AResult.bpfClassification,
    nonCanaryOpportunityStateHashUnchanged: d6R4AResult.nonCanaryOpportunityStateHashUnchanged,
  } : null,
  fullLoseCanary: publicD6R4BResult ? {
    candidate: publicD6R4BResult.candidate,
    result: publicD6R4BResult.result,
    actualValidation: publicD6R4BResult.actualValidation,
    beforeDistribution: publicD6R4BResult.beforeDistribution,
    afterDistribution: publicD6R4BResult.afterDistribution,
    opportunityClose: publicD6R4BResult.opportunityClose,
    bpfClassification: publicD6R4BResult.bpfClassification,
    nonCanaryOpportunityStateHashUnchanged: publicD6R4BResult.nonCanaryOpportunityStateHashUnchanged,
    requestDelta: publicD6R4BResult.requestDelta,
  } : null,
  fullStateActions: publicD6R4CResult,
  stageStats: d6StageSummary,
  batchLedger: publicBatchLedger,
  base: d6Base,
  stateActions: {
    expected: { win: 84, lose: 8 },
    winResults: d6Actions.won,
    loseResults: d6Actions.lost,
    stats: actionStats,
    p2Events: privateState.p2Events || [],
  },
  final: d6Final,
  requestCounts,
  requestDelta: Object.fromEntries(Object.entries(requestCounts).map(([key, value]) => [key, Number(value) - Number(requestCountsAtResume[key] || 0)])),
  p0: d6P0,
  p1: d6P1,
  p2: d6P2,
  gates: d6Gates,
  blockers: d6Blocker ? [d6Blocker] : [],
};
ensure(!containsGuid(publicRuntime), "Public D6 runtime contains an exact GUID");
await fs.writeFile(new URL("local-artifacts/d365/d6-runtime-public.json", ROOT), `${JSON.stringify(publicRuntime, null, 2)}\n`);

console.log(JSON.stringify({ mode: publicRuntime.mode, blocker: d6Blocker, stageStats: d6StageSummary, actionStats, requestCounts, p0: d6P0, p1: d6P1, p2: d6P2, gates: d6Gates }, null, 2));
if (d6Blocker || (flags.apply && !requiredExecutionCompleted)) process.exitCode = 2;
}

runDataverseCli(import.meta.url, main);
