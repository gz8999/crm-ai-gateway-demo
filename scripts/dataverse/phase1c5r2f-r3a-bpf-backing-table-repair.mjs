import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, runDataverseCli } from "./lib/environment-safety.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TARGET_HOSTNAME = "org91f5f65f.crm5.dynamics.com";
const PRODUCTION_HOSTNAME = "lcn-crm.crm7.dynamics.com";
const SOLUTION = "CRMAIGatewayDemo";
const AUTHORIZATION = "CONFIRM_D365_TEST_WRITE_PHASE_1C_5R2F_R3A";
const BPF_ID = "7325b274-6b7c-f111-ab0e-70a8a50388b9";
const BPF_NAME = "销售流程 - AI Demo Full Replica";
const BPF_UNIQUE_NAME = "aigw_ai_demo_full_replica";
const BACKING_LOGICAL_NAME = "aigw_ai_demo_full_replica";
const COMPONENT_ENTITY = 1;
const COMPONENT_PROCESS = 29;
const FULL_REPLICA_FORM_ID = "97a1555b-0903-408a-ac63-d63aed65b14a";
const PROTECTED_FORM_ID = "8db60b46-b976-f111-ab0e-00224817cb31";
const ACTUAL_FORM_ID = "e0537d47-a5f7-45a3-b607-608e7e831700";
const ACTUAL_VIEW_ID = "7a00b267-977c-f111-ab0e-000d3a857307";
const EXPECTED_PROTECTED_HASH = "5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7";
const TARGET_COMPONENTS = [
  { key: "coverage-form", objectId: "8e260676-56ce-47b1-a949-3d2560eda95c", kind: "form" },
  { key: "signal-form", objectId: "2c1d6dee-2691-4abd-8b51-492534414610", kind: "form" },
  { key: "coverageCurrent-view", objectId: "8aea4159-31c6-5f7f-8283-6f2192f3519c", kind: "view" },
  { key: "coverageHistory-view", objectId: "b7fffbbf-2ad1-5370-b677-706d2f8994e6", kind: "view" },
  { key: "signalRecent-view", objectId: "09705286-f108-5f96-9784-b05cfd5dd7d8", kind: "view" },
  { key: "signalCommitments-view", objectId: "db50ed56-c339-5938-8b9e-f553e24502a7", kind: "view" },
  { key: "signalIssues-view", objectId: "761e3a59-6302-538f-beb1-7efdc7a89662", kind: "view" },
];

const normalizeId = (value) => String(value || "").replace(/[{}-]/g, "").toLowerCase();
const normalizeText = (value) => String(value || "").toLowerCase().replace(/[{}-]/g, "");
const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const formStats = (xml) => {
  const text = String(xml || "");
  return {
    tabs: (text.match(/<tab\b/gi) || []).length,
    sections: (text.match(/<section\b/gi) || []).length,
    controls: (text.match(/<control\b/gi) || []).length,
    uniqueFields: new Set([...text.matchAll(/\bdatafieldname="([^"]+)"/gi)].map((item) => item[1])).size,
  };
};
const labelValue = (label) => (label?.LocalizedLabels || []).reduce((result, item) => ({ ...result, [String(item.LanguageCode)]: item.Label }), {});
const safeError = (error) => ({ status: error?.status ?? null, message: String(error?.message || "Unknown error").replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]") });
const requestHeaders = (headers) => Object.fromEntries([...headers.entries()].filter(([key]) => /request[-_]id|correlation|entityid/i.test(key)));

function parseFlags(argv) {
  const authArg = argv.find((value) => value.startsWith("--authorization="));
  return {
    apply: argv.includes("--apply"),
    confirmTest: argv.includes("--confirm-test-environment"),
    confirm: argv.includes("--confirm"),
    confirmPublish: argv.includes("--confirm-publish-or-deploy"),
    authorization: authArg ? authArg.slice("--authorization=".length) : "",
  };
}

function assertSafety(env, url, flags) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== TARGET_HOSTNAME || parsed.hostname.toLowerCase() === PRODUCTION_HOSTNAME) throw new Error(`Only the approved test hostname is allowed: ${parsed.hostname}`);
  if (String(env.AI_PROVIDER || "demo").toLowerCase() !== "demo") throw new Error("AI_PROVIDER must remain demo.");
  if (String(env.ALLOW_EXTERNAL_AI || "false").toLowerCase() === "true") throw new Error("ALLOW_EXTERNAL_AI=true is forbidden.");
  if (flags.apply && (!flags.confirmTest || !flags.confirm || !flags.confirmPublish || flags.authorization !== AUTHORIZATION)) throw new Error(`Apply requires explicit confirmations and authorization ${AUTHORIZATION}`);
}

function metadataSnapshot(entity) {
  return {
    LogicalName: entity?.LogicalName || null,
    SchemaName: entity?.SchemaName || null,
    MetadataId: entity?.MetadataId || null,
    DisplayName: labelValue(entity?.DisplayName),
    IsManaged: entity?.IsManaged ?? null,
    OwnershipType: entity?.OwnershipType ?? null,
    IsCustomEntity: entity?.IsCustomEntity ?? null,
    IsValidForAdvancedFind: entity?.IsValidForAdvancedFind ?? null,
    EntitySetName: entity?.EntitySetName || null,
    PrimaryIdAttribute: entity?.PrimaryIdAttribute || null,
    PrimaryNameAttribute: entity?.PrimaryNameAttribute || null,
    CreatedOn: entity?.CreatedOn || null,
    ModifiedOn: entity?.ModifiedOn || null,
    IsBPFEntity: entity?.IsBPFEntity ?? null,
  };
}

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(file));
    else result.push(file);
  }
  return result;
}

async function exportAndInspect({ post, artifactDir, backingEntityId }) {
  const response = await post("/api/data/v9.2/ExportSolution", { SolutionName: SOLUTION, Managed: false }, "export");
  const base64 = response.body?.ExportSolutionFile || response.body?.exportsolutionfile || (typeof response.body === "string" ? response.body : "");
  if (!base64 || typeof base64 !== "string") throw new Error(`ExportSolution returned no file payload; response keys=${Object.keys(response.body || {}).join(",")}`);
  const zipPath = path.join(artifactDir, `${SOLUTION}-r3a-unmanaged.zip`);
  const extractDir = path.join(artifactDir, "r3a-exported");
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.writeFile(zipPath, Buffer.from(base64, "base64"));
  await execFileAsync("unzip", ["-qq", "-o", zipPath, "-d", extractDir]);
  const inspected = await inspectExportedPackage({ extractDir, backingEntityId });
  return {
    status: "succeeded",
    httpStatus: response.status,
    responseHeaders: response.headers,
    zipPath: path.relative(ROOT, zipPath),
    extractDir: path.relative(ROOT, extractDir),
    ...inspected,
  };
}

export async function inspectExportedPackage({ extractDir, backingEntityId }) {
  const files = await listFiles(extractDir);
  const xmlFiles = files.filter((file) => file.toLowerCase().endsWith(".xml"));
  const xmlText = (await Promise.all(xmlFiles.map((file) => fs.readFile(file, "utf8")))).join("\n");
  const packageText = normalizeText(xmlText);
  const componentResults = TARGET_COMPONENTS.map((component) => ({ ...component, present: packageText.includes(normalizeId(component.objectId)) }));
  const bpfIdPresent = packageText.includes(normalizeId(BPF_ID));
  const bpfNamePresent = packageText.includes(normalizeText(BPF_UNIQUE_NAME)) || packageText.includes(normalizeText(BPF_NAME));
  const backingIdPresent = packageText.includes(normalizeId(backingEntityId));
  const backingNamePresent = packageText.includes(normalizeText(BACKING_LOGICAL_NAME));
  const backingRootPresent = /<RootComponent\b[^>]*type=["']1["'][^>]*schemaName=["']aigw_ai_demo_full_replica["'][^>]*behavior=["']1["']/i.test(xmlText);
  const backingDefinitionPresent = /<entity\b[^>]*Name=["']aigw_ai_demo_full_replica["'][\s\S]*?<IsBPFEntity>1<\/IsBPFEntity>/i.test(xmlText);
  const solutionXml = files.find((file) => path.basename(file).toLowerCase() === "solution.xml");
  const customizationsXml = files.find((file) => path.basename(file).toLowerCase() === "customizations.xml");
  const formsReady = componentResults.filter((item) => item.kind === "form").every((item) => item.present);
  const viewsReady = componentResults.filter((item) => item.kind === "view").every((item) => item.present);
  const backingReady = backingNamePresent && backingRootPresent && backingDefinitionPresent;
  return {
    files: files.map((file) => path.relative(extractDir, file)),
    xmlFiles: xmlFiles.map((file) => path.relative(extractDir, file)),
    solutionXml: Boolean(solutionXml),
    customizationsXml: Boolean(customizationsXml),
    bpf: { idPresent: bpfIdPresent, namePresent: bpfNamePresent, ready: bpfIdPresent && bpfNamePresent },
    backingEntity: { idPresent: backingIdPresent, logicalNamePresent: backingNamePresent, rootComponentPresent: backingRootPresent, definitionPresent: backingDefinitionPresent, ready: backingReady },
    components: componentResults,
    formsReady,
    viewsReady,
    packageDependencyReady: bpfIdPresent && bpfNamePresent && backingReady,
    hash: sha256(xmlText),
  };
}

async function readAll(get, endpoint) {
  const rows = [];
  let next = endpoint;
  while (next) {
    const body = await get(next);
    rows.push(...(body.value || []));
    next = body["@odata.nextLink"] || "";
  }
  return rows;
}

export function buildBackingEntityShellPayload({ componentId, solutionUniqueName = SOLUTION }) {
  return { ComponentId: componentId, ComponentType: COMPONENT_ENTITY, SolutionUniqueName: solutionUniqueName, AddRequiredComponents: false, DoNotIncludeSubcomponents: true };
}

export function packageContainsTargets(packageResult) {
  return Boolean(packageResult?.bpf?.ready && packageResult?.backingEntity?.ready && packageResult?.formsReady && packageResult?.viewsReady);
}

export function cleanupPackageResult(packageResult) {
  if (!packageResult) return null;
  return {
    ...packageResult,
    responseHeaders: packageResult.responseHeaders || {},
    files: packageResult.files || [],
    xmlFiles: packageResult.xmlFiles || [],
  };
}

export async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const dataverseUrl = String(process.env.DATAVERSE_URL || "").replace(/\/$/, "");
  assertSafety(process.env, dataverseUrl || "https://invalid.example", flags);
  if (flags.apply) assertDataverseScriptGate({ mode: "publish/deploy-capable" });
  const client = createDynamicsClient({ env: { ...process.env, DATAVERSE_TIMEOUT_MS: process.env.PHASE1C_5R2F_TIMEOUT_MS || "60000" } });
  assertSafety(process.env, client.config.dataverseUrl, flags);
  const counts = { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, AddSolutionComponent: 0, ExportSolution: 0, ChoiceWrites: 0, RuntimeProbe: 0, BusinessWrites: 0 };
  const get = async (endpoint) => { counts.GET += 1; return (await client.dataverseRequest("GET", endpoint)).body; };
  const post = async (endpoint, body, kind) => { counts.POST += 1; if (kind === "add") counts.AddSolutionComponent += 1; if (kind === "export") counts.ExportSolution += 1; const result = await client.dataverseRequest("POST", endpoint, body, { prefer: "return=representation" }); return { body: result.body, status: result.status, responseHeaders: requestHeaders(result.headers) }; };
  const environment = new URL(client.config.dataverseUrl).hostname;
  const artifactDir = path.join(ROOT, "local-artifacts/d365/phase1c5r2f-r3a");
  const audit = { phase: "1C-5R2F-R3A", mode: flags.apply ? "apply" : "dry-run", environment, solution: null, bpf: null, backingEntity: null, memberships: null, addSolutionComponent: null, export: null, gates: {}, blockers: [], requestCounts: counts, productionRequests: 0, externalLlmCalls: 0, choiceWrites: 0, businessWrites: 0, p0: 0, p1: 0, p2: 0 };

  const solutionRows = await get(`/api/data/v9.2/solutions?$select=solutionid,friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`);
  const solution = solutionRows.value?.[0];
  if (!solution || solution.ismanaged) throw new Error("Target unmanaged solution was not confirmed.");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=publisherid,customizationprefix,customizationoptionvalueprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Publisher prefix is not aigw.");
  audit.solution = { id: solution.solutionid, uniqueName: solution.uniquename, friendlyName: solution.friendlyname, isManaged: solution.ismanaged, publisherPrefix: publisher.customizationprefix, optionValuePrefix: publisher.customizationoptionvalueprefix || null };
  audit.gates.testEnvironmentVerified = environment === TARGET_HOSTNAME;

  const workflow = await get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,name,uniquename,category,type,statecode,statuscode,primaryentity,ismanaged,processorder,modifiedon`);
  const backingRaw = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${BACKING_LOGICAL_NAME}')`);
  const backing = metadataSnapshot(backingRaw);
  audit.bpf = { workflowId: workflow.workflowid, name: workflow.name, uniqueName: workflow.uniquename, category: workflow.category, type: workflow.type, statecode: workflow.statecode, statuscode: workflow.statuscode, primaryEntity: workflow.primaryentity, isManaged: workflow.ismanaged, processOrder: workflow.processorder, modifiedOn: workflow.modifiedon };
  audit.backingEntity = backing;
  audit.gates.bpfMetadataVerified = normalizeId(workflow.workflowid) === normalizeId(BPF_ID) && workflow.name === BPF_NAME && workflow.uniquename === BPF_UNIQUE_NAME && workflow.primaryentity === "opportunity";
  audit.gates.bpfBackingEntityVerified = backing.LogicalName === BACKING_LOGICAL_NAME && backing.MetadataId && backing.IsBPFEntity === true && workflow.uniquename === backing.LogicalName;
  if (!audit.gates.bpfMetadataVerified || !audit.gates.bpfBackingEntityVerified) {
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", key: "bpf-backing-mismatch", message: "BPF or generated backing entity metadata did not match the approved identity." });
    await writeArtifacts(audit);
    console.log(JSON.stringify({ status: "blocked", ...audit }, null, 2));
    return;
  }

  const workflowComponents = await readAll(get, `/api/data/v9.2/solutioncomponents?$select=objectid,componenttype,rootcomponentbehavior,_solutionid_value,rootsolutioncomponentid&$filter=objectid eq ${BPF_ID}`);
  const backingComponents = await readAll(get, `/api/data/v9.2/solutioncomponents?$select=objectid,componenttype,rootcomponentbehavior,_solutionid_value,rootsolutioncomponentid&$filter=objectid eq ${backing.MetadataId}`);
  const backingSolutionIds = [...new Set(backingComponents.map((item) => item._solutionid_value).filter(Boolean))];
  const solutionMemberships = [];
  for (const solutionId of backingSolutionIds) {
    const rows = await get(`/api/data/v9.2/solutions(${solutionId})?$select=solutionid,friendlyname,uniquename,ismanaged`);
    solutionMemberships.push(rows);
  }
  audit.memberships = { targetSolutionId: solution.solutionid, bpfComponents: workflowComponents, backingEntityComponents: backingComponents, backingEntitySolutions: solutionMemberships, inTargetSolution: backingComponents.some((item) => normalizeId(item._solutionid_value) === normalizeId(solution.solutionid)), otherSolutionCount: solutionMemberships.filter((item) => normalizeId(item.solutionid) !== normalizeId(solution.solutionid)).length };
  audit.gates.backingEntityMembershipReady = audit.memberships.inTargetSolution;

  if (!audit.gates.backingEntityMembershipReady && flags.apply) {
    const payload = buildBackingEntityShellPayload({ componentId: backing.MetadataId });
    const action = { method: "POST", endpoint: "/api/data/v9.2/AddSolutionComponent", payload, status: null, responseHeaders: {}, readback: [] };
    try {
      const response = await post(action.endpoint, payload, "add");
      action.status = response.status;
      action.responseHeaders = response.responseHeaders;
    } catch (error) {
      action.error = safeError(error);
    }
    const delays = [2000, 5000, 10000, 20000];
    for (const delay of delays) {
      await sleep(delay);
      const rows = await readAll(get, `/api/data/v9.2/solutioncomponents?$select=objectid,componenttype,rootcomponentbehavior,_solutionid_value,rootsolutioncomponentid&$filter=_solutionid_value eq ${solution.solutionid} and objectid eq ${backing.MetadataId} and componenttype eq ${COMPONENT_ENTITY}`);
      action.readback.push({ delayMs: delay, rows });
      if (rows.length) break;
    }
    const confirmed = action.readback.at(-1)?.rows?.length > 0;
    action.confirmed = confirmed;
    action.shellOnly = confirmed && Number(action.readback.at(-1).rows[0].rootcomponentbehavior) === 1;
    audit.addSolutionComponent = action;
    audit.gates.backingEntityMembershipReady = confirmed;
    audit.gates.backingEntityShellOnly = action.shellOnly;
    if (!confirmed || !action.shellOnly) {
      audit.p1 += 1;
      audit.blockers.push({ severity: "P1", key: "backing-entity-add-unconfirmed", message: confirmed ? "Backing entity membership was found but rootcomponentbehavior was not shell-only." : "The single AddSolutionComponent action was not confirmed by delayed readback." });
      await writeArtifacts(audit);
      console.log(JSON.stringify({ status: "blocked", ...audit }, null, 2));
      return;
    }
  } else if (!audit.gates.backingEntityMembershipReady) {
    audit.addSolutionComponent = { status: "not-run", reason: "dry-run; explicit apply is required" };
  } else {
    audit.addSolutionComponent = { status: "not-needed", reason: "backing entity already belongs to target Solution" };
    const row = backingComponents.find((item) => normalizeId(item._solutionid_value) === normalizeId(solution.solutionid));
    audit.gates.backingEntityShellOnly = Number(row?.rootcomponentbehavior) === 1;
  }

  if (!audit.gates.backingEntityMembershipReady || (flags.apply && audit.gates.backingEntityShellOnly !== true)) {
    audit.p1 += flags.apply ? 1 : 0;
    if (!flags.apply) audit.blockers.push({ severity: "P1", key: "backing-membership-missing", message: "Backing entity membership is missing; dry-run stopped before AddSolutionComponent." });
    await writeArtifacts(audit);
    console.log(JSON.stringify({ status: "blocked", ...audit }, null, 2));
    return;
  }

  if (!flags.apply) {
    audit.blockers.push({ severity: "P1", key: "apply-required", message: "Dry-run confirmed the missing membership; no AddSolutionComponent or ExportSolution was sent." });
    await writeArtifacts(audit);
    console.log(JSON.stringify({ status: "dry-run", ...audit }, null, 2));
    return;
  }

  try {
    audit.export = await exportAndInspect({ post, artifactDir, backingEntityId: backing.MetadataId });
  } catch (error) {
    audit.export = { status: "failed", error: safeError(error), responseHeaders: {} };
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", key: "solution-export-failed", message: audit.export.error.message });
    await writeArtifacts(audit);
    console.log(JSON.stringify({ status: "blocked", ...audit }, null, 2));
    return;
  }
  audit.gates.solutionExportReady = audit.export.status === "succeeded";
  audit.gates.bpfPackageDependencyReady = Boolean(audit.export.packageDependencyReady);
  audit.gates.solutionPackageFormsReady = Boolean(audit.export.formsReady);
  audit.gates.solutionPackageViewsReady = Boolean(audit.export.viewsReady);
  audit.gates.formViewPackageMembershipReady = audit.gates.solutionPackageFormsReady && audit.gates.solutionPackageViewsReady;
  audit.gates.solutionPackagingReady = audit.gates.solutionExportReady && audit.gates.bpfPackageDependencyReady && audit.gates.formViewPackageMembershipReady;
  if (!audit.gates.solutionPackagingReady) {
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", key: "solution-package-incomplete", message: "The unmanaged export completed but did not contain every required BPF, backing entity, Form and View target." });
  }

  const baseline = await readProtectionBaseline(get);
  audit.protection = baseline;
  audit.gates.protectedBaselinePreserved = baseline.protectedFormUnchanged && baseline.fullReplicaReady && baseline.actualFormReady && baseline.actualViewUnchanged && baseline.pluginReady && baseline.locationActive === 51 && baseline.alternateKeysReady && baseline.bpfStateUnchanged;
  audit.gates.coreSchemaPreserved = baseline.alternateKeysReady;
  audit.gates.choiceRepairStarted = false;
  audit.gates.choiceWrites = counts.ChoiceWrites === 0;
  audit.gates.runtimeProbeStarted = false;
  audit.gates.businessRecordWrites = counts.BusinessWrites === 0;
  audit.gates.p0GatePassed = audit.p0 === 0;
  audit.gates.p1GatePassed = audit.p1 === 0;
  audit.gates.nextChoiceRepairReady = audit.gates.solutionPackagingReady && audit.gates.protectedBaselinePreserved && audit.p0 === 0 && audit.p1 === 0;
  await writeArtifacts(audit);
  console.log(JSON.stringify({ status: audit.gates.nextChoiceRepairReady ? "ready" : "blocked", ...audit }, null, 2));
}

async function readProtectionBaseline(get) {
  const [fullReplica, protectedForm, actualForm, actualView, bpf, locationRows, pluginAssemblies] = await Promise.all([
    get(`/api/data/v9.2/systemforms(${FULL_REPLICA_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,formxml,formactivationstate,isdefault`),
    get(`/api/data/v9.2/systemforms(${PROTECTED_FORM_ID})?$select=formid,formxml`),
    get(`/api/data/v9.2/systemforms(${ACTUAL_FORM_ID})?$select=formid,formxml`),
    get(`/api/data/v9.2/savedqueries(${ACTUAL_VIEW_ID})?$select=savedqueryid,name,fetchxml,layoutxml,statecode,statuscode`),
    get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,statecode,statuscode,processorder`),
    get(`/api/data/v9.2/aigw_locations?$select=aigw_locationid&$filter=statecode eq 0&$count=true&$top=1`),
    get(`/api/data/v9.2/pluginassemblies?$select=pluginassemblyid,name&$filter=name eq 'CrmAiGateway.ActualTotals.Plugin'`),
  ]);
  const locationActive = Number(locationRows["@odata.count"] ?? locationRows.value?.length ?? 0);
  const pluginAssembly = pluginAssemblies.value?.[0];
  let enabledSteps = 0;
  let disabledSteps = 0;
  if (pluginAssembly) {
    const types = await readAll(get, `/api/data/v9.2/plugintypes?$select=plugintypeid&$filter=_pluginassemblyid_value eq ${pluginAssembly.pluginassemblyid}`);
    const typeIds = new Set(types.map((item) => normalizeId(item.plugintypeid)));
    const steps = await readAll(get, "/api/data/v9.2/sdkmessageprocessingsteps?$select=statecode,_plugintypeid_value");
    const ownedSteps = steps.filter((item) => typeIds.has(normalizeId(item._plugintypeid_value)));
    enabledSteps = ownedSteps.filter((item) => Number(item.statecode) === 0).length;
    disabledSteps = ownedSteps.filter((item) => Number(item.statecode) !== 0).length;
  }
  const keyRows = [];
  for (const entity of ["aigw_customerservicecoverage", "aigw_interactionsignal"]) {
    const keys = await readAll(get, `/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')/Keys?$select=SchemaName,EntityKeyIndexStatus,IsManaged`);
    keyRows.push(...keys);
  }
  return {
    fullReplica: formStats(fullReplica.formxml),
    fullReplicaReady: formStats(fullReplica.formxml).tabs === 5 && formStats(fullReplica.formxml).sections === 21 && formStats(fullReplica.formxml).controls === 118 && formStats(fullReplica.formxml).uniqueFields === 109 && fullReplica.formactivationstate === 1 && fullReplica.isdefault === false,
    protectedFormHash: sha256(protectedForm.formxml),
    protectedFormUnchanged: sha256(protectedForm.formxml) === EXPECTED_PROTECTED_HASH,
    actualForm: formStats(actualForm.formxml),
    actualFormReady: formStats(actualForm.formxml).tabs === 1 && formStats(actualForm.formxml).sections === 5 && formStats(actualForm.formxml).controls === 41,
    actualViewUnchanged: Boolean(actualView.savedqueryid && actualView.statecode === 0),
    bpfState: bpf,
    bpfStateUnchanged: Number(bpf.statecode) === 1 && Number(bpf.statuscode) === 2 && Number(bpf.processorder) === 0,
    locationActive,
    plugin: { assembly: pluginAssembly || null, enabledSteps, disabledSteps },
    pluginReady: enabledSteps === 7 && disabledSteps === 0,
    alternateKeys: keyRows,
    alternateKeysReady: keyRows.length === 2 && keyRows.every((item) => !item.IsManaged && !["Pending", "InProgress", "Failed"].includes(String(item.EntityKeyIndexStatus || "Active"))),
  };
}

async function writeArtifacts(audit) {
  const docsDir = path.join(ROOT, "docs/d365");
  await fs.mkdir(docsDir, { recursive: true });
  const cleanAudit = JSON.parse(JSON.stringify(audit));
  cleanAudit.export = cleanupPackageResult(cleanAudit.export);
  const componentDocument = {
    phase: audit.phase,
    environment: audit.environment,
    solution: audit.solution,
    bpf: audit.bpf,
    backingEntity: audit.backingEntity,
    memberships: audit.memberships,
    addSolutionComponent: audit.addSolutionComponent,
    requestCounts: audit.requestCounts,
    gates: audit.gates,
    blockers: audit.blockers,
    protection: audit.protection || null,
  };
  await fs.writeFile(path.join(docsDir, "d365-ai-demo-bpf-backing-table-component.json"), JSON.stringify(componentDocument, null, 2));
  const packagePath = path.join(docsDir, "d365-ai-demo-solution-package-verification.json");
  let priorPackage = {};
  try { priorPackage = JSON.parse(await fs.readFile(packagePath, "utf8")); } catch { /* first R3A run */ }
  await fs.writeFile(packagePath, JSON.stringify({ ...priorPackage, phase: audit.phase, environment: audit.environment, solution: audit.solution, r3a: { export: cleanAudit.export, gates: { bpfPackageDependency: Boolean(audit.gates.bpfPackageDependencyReady), forms: Boolean(audit.gates.solutionPackageFormsReady), views: Boolean(audit.gates.solutionPackageViewsReady), packaging: Boolean(audit.gates.solutionPackagingReady) }, requestCounts: audit.requestCounts }, requestCounts: audit.requestCounts }, null, 2));
  const reportPath = path.join(docsDir, "d365-ai-demo-bpf-backing-table-repair.md");
  await fs.writeFile(reportPath, buildReport(cleanAudit));
  const choiceReportPath = path.join(docsDir, "d365-ai-demo-choice-solution-repair.md");
  let choiceReport = "";
  try { choiceReport = await fs.readFile(choiceReportPath, "utf8"); } catch { /* first R3A run */ }
  const marker = "## R3A BPF backing table dependency repair";
  if (!choiceReport.includes(marker)) {
    choiceReport += `\n\n${marker}\n\n- The R2 packaging diagnostic found that ExportSolution was rejected because the target BPF backing entity was not included in the unmanaged Solution.\n- R3A is restricted to the backing entity root dependency; Choice Insert, Choice Publish and Runtime Probe remain **not started**.\n- See [d365-ai-demo-bpf-backing-table-repair.md](d365-ai-demo-bpf-backing-table-repair.md) and the component JSON for this phase's evidence.\n`;
    await fs.writeFile(choiceReportPath, choiceReport);
  }
}

function buildReport(audit) {
  const exportResult = audit.export || { status: "not-run" };
  const components = exportResult.components || [];
  const rows = components.map((item) => `| ${item.kind} | ${item.key} | ${item.objectId} | ${item.present ? "true" : "false"} |`).join("\n") || "| - | Not inspected | - | - |";
  const readback = audit.addSolutionComponent?.readback?.map((item) => `${item.delayMs}ms=${item.rows?.length || 0}`).join(", ") || "not run";
  const gates = Object.entries({ ...audit.gates, "P0 Count": audit.p0, "P1 Count": audit.p1, "P2 Count": audit.p2, "Choice Repair Started": false, "Choice Writes": audit.choiceWrites, "Runtime Probe Started": false, "Business Record Writes": audit.businessWrites, "Production Requests": audit.productionRequests, "External LLM Calls": audit.externalLlmCalls }).map(([key, value]) => `- ${key}: **${value}**`).join("\n");
  return `# Phase 1C-5R2F-R3A BPF Backing Table Solution Dependency Repair\n\n- Environment: \`${audit.environment}\`\n- Solution: \`${audit.solution?.uniqueName || SOLUTION}\`\n- No Choice, Form/View, Publish, Probe or business-record write was executed by this phase.\n\n## BPF and backing table proof\n\n- BPF: **${audit.bpf?.name || "unknown"}**\n- Workflow ID: \`${audit.bpf?.workflowId || BPF_ID}\`\n- Unique name: \`${audit.bpf?.uniqueName || "unknown"}\`\n- Primary entity: \`${audit.bpf?.primaryEntity || "unknown"}\`\n- Backing logical name: \`${audit.backingEntity?.LogicalName || "unknown"}\`\n- IsBPFEntity: **${audit.backingEntity?.IsBPFEntity ?? false}**\n- Identity correlation: **${audit.gates.bpfBackingEntityVerified || false}**\n\n## Original membership and controlled repair\n\n- Backing entity already in target Solution: **${audit.memberships?.inTargetSolution || false}**\n- Backing entity Solution count observed: **${audit.memberships?.backingEntitySolutions?.length || 0}**\n- AddSolutionComponent: **${audit.addSolutionComponent?.status || (audit.addSolutionComponent?.confirmed ? "confirmed" : "not-run")}**\n- Add readback: **${readback}**\n- Shell-only: **${audit.gates.backingEntityShellOnly || false}**\n\n## Export and package verification\n\n- Export status: **${exportResult.status}**\n- Export path: \`${exportResult.zipPath || "not created"}\`\n- BPF package dependency: **${audit.gates.bpfPackageDependencyReady || false}**\n- Package error: ${exportResult.error?.message || "none"}\n\n| Kind | Component | Object ID | Present |\n|---|---|---|---|\n${rows}\n\n## Protection\n\n- Full Replica: **${audit.protection?.fullReplica?.tabs ?? "not read"}/${audit.protection?.fullReplica?.sections ?? "not read"}/${audit.protection?.fullReplica?.controls ?? "not read"}/${audit.protection?.fullReplica?.uniqueFields ?? "not read"}**\n- Protected Form unchanged: **${audit.gates.protectedBaselinePreserved || false}**\n- Actual Form/View preserved: **${audit.protection?.actualFormReady && audit.protection?.actualViewUnchanged ? "true" : "false"}**\n- Plugin: **${audit.protection?.plugin?.enabledSteps ?? 0} enabled / ${audit.protection?.plugin?.disabledSteps ?? 0} disabled**\n- Location Active: **${audit.protection?.locationActive ?? "not read"}**\n- BPF state/status/order unchanged: **${audit.protection?.bpfStateUnchanged || false}**\n\n## Gates\n\n${gates}\n\n## Request statistics\n\n\`${JSON.stringify(audit.requestCounts)}\`\n\n## Blockers\n\n${audit.blockers.length ? audit.blockers.map((item) => `- ${item.severity}: ${item.message}`).join("\n") : "- None"}\n\n## Next phase\n\nNext Phase Choice Repair Ready is **${audit.gates.nextChoiceRepairReady || false}**. Choice repair must remain a separate authorized phase.\n`;
}

runDataverseCli(import.meta.url, main);
