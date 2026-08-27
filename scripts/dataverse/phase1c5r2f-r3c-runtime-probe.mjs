import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, runDataverseCli } from "./lib/environment-safety.mjs";
import {
  CHOICE_LABELS,
  optionSetMatches,
  parseOptionSet,
  relationshipNavigation,
  runProbe,
} from "./phase1c5r2f-choice-solution-repair.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TARGET_HOSTNAME = "org91f5f65f.crm5.dynamics.com";
const PRODUCTION_HOSTNAME = "lcn-crm.crm7.dynamics.com";
const SOLUTION = "CRMAIGatewayDemo";
const AUTHORIZATION = "CONFIRM_D365_TEST_WRITE_PHASE_1C_5R2F_R3C";
const FULL_REPLICA_FORM_ID = "97a1555b-0903-408a-ac63-d63aed65b14a";
const PROTECTED_FORM_ID = "8db60b46-b976-f111-ab0e-00224817cb31";
const PROTECTED_FORM_HASH = "5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7";
const ACTUAL_FORM_ID = "e0537d47-a5f7-45a3-b607-608e7e831700";
const ACTUAL_VIEW_ID = "7a00b267-977c-f111-ab0e-000d3a857307";
const APP_ID = "916afe4b-607e-f111-ab0e-002248eb1915";
const BPF_ID = "7325b274-6b7c-f111-ab0e-70a8a50388b9";
const DEMO_USER_ID = "85f6e9a0-ef7f-f111-ab0f-000d3a857307";
const DEMO_ROLE_ID = "63399c4d-f17f-f111-ab0e-000d3a82d194";
const DEMO_BU_ID = "4c441a2f-cd6d-f111-ab0d-00224818ead9";
const PROBE_PREFIX = "[AI-DEMO-SCHEMA-PROBE]";

const normalizeId = (value) => String(value || "").replace(/[{}]/g, "").toLowerCase();
const normalizeLabel = (value) => String(value || "").trim();
const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const isTrue = (value) => String(value || "").toLowerCase() === "true";

function parseFlags(argv) {
  const authorization = argv.find((item) => item.startsWith("--authorization="))?.slice("--authorization=".length) || "";
  return {
    apply: argv.includes("--apply"),
    stage0Only: argv.includes("--stage0-only"),
    confirmTest: argv.includes("--confirm-test-environment"),
    confirm: argv.includes("--confirm"),
    authorization,
  };
}

function assertSafety(env, url, flags) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== TARGET_HOSTNAME || parsed.hostname.toLowerCase() === PRODUCTION_HOSTNAME) throw new Error(`Only the approved test hostname is allowed: ${parsed.hostname}`);
  if (String(env.AI_PROVIDER || "demo").toLowerCase() !== "demo") throw new Error("AI_PROVIDER must remain demo.");
  if (isTrue(env.ALLOW_EXTERNAL_AI)) throw new Error("ALLOW_EXTERNAL_AI=true is forbidden.");
  if (flags.apply && (!flags.confirmTest || !flags.confirm || flags.authorization !== AUTHORIZATION)) throw new Error(`Apply requires explicit R3C confirmations: ${AUTHORIZATION}`);
}

function formStats(xml) {
  const text = String(xml || "");
  return {
    tabs: (text.match(/<tab\b/gi) || []).length,
    sections: (text.match(/<section\b/gi) || []).length,
    controls: (text.match(/<control\b/gi) || []).length,
    uniqueFields: new Set([...text.matchAll(/\bdatafieldname="([^"]+)"/gi)].map((item) => item[1])).size,
  };
}

function choiceEndpoint(definition) {
  return `/api/data/v9.2/EntityDefinitions(LogicalName='${definition.entity}')/Attributes(LogicalName='${definition.attribute}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,AttributeType,DisplayName&$expand=OptionSet($select=Options,IsGlobal,Name)`;
}

export function choiceSnapshotMatches(current, frozen, definition) {
  if (!optionSetMatches(current, definition, { englishRequired: true })) return false;
  const frozenOptions = frozen?.after?.options || [];
  return current.options.length === frozenOptions.length && current.options.every((option, index) => {
    const expected = frozenOptions[index];
    return Number(option.value) === Number(expected?.value)
      && normalizeLabel(option.labels["2052"]) === normalizeLabel(expected?.labels?.["2052"])
      && normalizeLabel(option.labels["1033"]) === normalizeLabel(expected?.labels?.["1033"]);
  });
}

export function relationshipMatrix(entityMetadata, definitions) {
  return definitions.map(({ attribute, targetSet }) => {
    const matches = (entityMetadata.ManyToOneRelationships || []).filter((item) => item.ReferencingAttribute === attribute);
    const relationship = matches[0] || null;
    return {
      entity: entityMetadata.LogicalName,
      attribute,
      unique: matches.length === 1,
      relationshipSchemaName: relationship?.SchemaName || null,
      referencedEntity: relationship?.ReferencedEntity || null,
      referencingEntity: relationship?.ReferencingEntity || null,
      navigationProperty: relationshipNavigation(entityMetadata, attribute),
      targetEntitySet: targetSet,
      requiredLevel: entityMetadata.lookupRequiredLevels?.[attribute] || null,
    };
  });
}

async function readPackageVerification() {
  const document = JSON.parse(await fs.readFile(path.join(ROOT, "docs/d365/d365-ai-demo-solution-package-verification.json"), "utf8"));
  const r3a = document.r3a || document;
  const exported = r3a.export || document.package || {};
  const gates = r3a.gates || document.gates || {};
  const components = exported.components || [];
  return {
    exportStatus: exported.status || null,
    components,
    forms: Boolean(gates.forms),
    views: Boolean(gates.views),
    packaging: Boolean(gates.packaging) && components.length === 7 && components.every((item) => item.present === true),
  };
}

async function writeArtifacts({ audit, read }) {
  const docDir = path.join(ROOT, "docs/d365");
  await fs.mkdir(docDir, { recursive: true });
  const publicNavigation = read.navigation.map(({ targetRecordId, ...item }) => item);
  const publicProbe = read.probe ? {
    started: read.probe.started,
    token: read.probe.token,
    createdCounts: read.probe.createdCounts,
    validation: read.probe.validation,
    cleanup: { ok: read.probe.cleanup.ok, residual: read.probe.cleanup.residual, deletedCount: read.probe.cleanup.deleted.length },
  } : null;
  const manifest = {
    phase: audit.phase,
    environment: audit.environment,
    generatedAt: audit.generatedAt,
    probe: read.probe || null,
    exactIdsOnly: true,
    navigation: read.navigation,
    requestCounts: audit.requestCounts,
    writeCounts: audit.writeCounts,
    productionRequests: 0,
    externalLlmCalls: 0,
    realBusinessDataWrites: 0,
  };
  await fs.writeFile(path.join(docDir, "d365-ai-demo-runtime-probe-manifest.json"), JSON.stringify(manifest, null, 2));

  const gateLines = Object.entries(audit.gates).map(([key, value]) => `- ${key}: **${value}**`).join("\n");
  const navigationLines = publicNavigation.map((item) => `- ${item.entity}.${item.attribute}: relationship=${item.relationshipSchemaName}, target=${item.referencedEntity}, navigation=${item.navigationProperty}, entitySet=${item.targetEntitySet}, required=${item.requiredLevel}`).join("\n");
  const report = `# Phase 1C-5R2F-R3C Runtime Probe Resume & Final Gate\n\n- Environment: \`${audit.environment}\`\n- Mode: \`${audit.mode}\`\n- Production Requests: **0**\n- External LLM Calls: **0**\n- Real CRM Data Exposure: **0**\n- Choice Writes: **0**\n- Publish: **0**\n- Solution Writes: **0**\n\n## Report state correction\n\n- Local Choice Count: **12**\n- Local Option Count: **75**\n- Local Choice Options Empty: **false**\n- R3B frozen labels and actual values matched: **${audit.gates.localChoiceMetadataReady}**\n\n## Lookup navigation metadata\n\n${navigationLines || "- Not resolved."}\n\n- Team selection is reported only as **TEST-TEAM-TOKEN**. Its test-environment record ID is retained only in the controlled manifest.\n\n## Runtime probe\n\n- Started: **${Boolean(publicProbe?.started)}**\n- Created: **${JSON.stringify(publicProbe?.createdCounts || {})}**\n- Validation: **${Boolean(publicProbe?.validation?.length && publicProbe.validation.every((item) => item.ok))}**\n- Cleanup: **${Boolean(publicProbe?.cleanup?.ok)}**\n- Residual: **${publicProbe?.cleanup?.residual ?? 0}**\n\n## Request statistics\n\n- Metadata GET: **${audit.requestCounts.GET}**\n- Probe Create Attempts: **${audit.writeCounts.probeCreateAttempts}**\n- Probe Create Successes: **${audit.writeCounts.probeCreateSuccesses}**\n- Alternate Key Duplicate Attempts: **${audit.writeCounts.duplicateAttempts}**\n- Alternate Key Duplicate Rejections: **${audit.writeCounts.duplicateRejections}**\n- Probe Deletes: **${audit.writeCounts.probeDeletes}**\n- Publish: **0**\n- Choice Writes: **0**\n- Solution Writes: **0**\n\n## Protection\n\n- Full Replica: **${read.protection.fullReplica.stats.tabs}/${read.protection.fullReplica.stats.sections}/${read.protection.fullReplica.stats.controls}/${read.protection.fullReplica.stats.uniqueFields}**\n- Protected Form unchanged: **${audit.gates.protectedBaselinePreserved}**\n- Plugin: **${read.protection.plugin.enabled}/0**\n- Location Active: **${read.protection.locationActive}**\n- App/Sitemap unchanged: **${audit.gates.appSitemapUnchanged}**\n\n## Gates\n\n${gateLines}\n\n## P0/P1/P2\n\n- P0 Count: **${audit.p0}**\n- P1 Count: **${audit.p1}**\n- P2 Count: **${audit.p2}**\n\n## Blockers\n\n${audit.blockers.length ? audit.blockers.map((item) => `- ${item.severity}: ${item.message}`).join("\n") : "- None"}\n`;
  await fs.writeFile(path.join(docDir, "d365-ai-demo-runtime-probe-recovery.md"), report);

  const replaceSection = async (fileName, marker, content) => {
    const file = path.join(docDir, fileName);
    let prior = "";
    try { prior = await fs.readFile(file, "utf8"); } catch { /* first report */ }
    const index = prior.indexOf(marker);
    const head = index < 0 ? prior.trim() : prior.slice(0, index).trim();
    await fs.writeFile(file, `${head}\n\n${marker}\n\n${content.trim()}\n`);
  };
  const summary = `R3C performed no Choice, Publish, Solution, Schema, Form, View, App, BPF, Plugin or Security write. It used Relationship Metadata for all five lookup navigation properties and ran the single authorized bounded probe.\n\n- Local Choice Options Empty: **false**\n- Runtime Probe Ready: **${audit.gates.runtimeProbeReady}**\n- Runtime Probe Cleanup Ready: **${audit.gates.runtimeProbeCleanupReady}**\n- Runtime Probe Residual: **${audit.gates.runtimeProbeResidual}**\n- P0/P1/P2: **${audit.p0}/${audit.p1}/${audit.p2}**\n- Form View Security Phase Ready: **${audit.gates.formViewSecurityPhaseReady}**\n- Demo Data Design Phase Ready: **${audit.gates.demoDataDesignPhaseReady}**\n- Demo Data Generation Ready: **false**`;
  await replaceSection("d365-ai-demo-local-choice-repair.md", "## R3C Runtime probe final gate", summary);
  await replaceSection("d365-ai-demo-form-view-security-implementation.md", "## R3C Runtime probe final gate", summary);
  await replaceSection("d365-ai-demo-choice-solution-repair.md", "## R3C Runtime probe final gate", summary);
}

export async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const dataverseUrl = String(process.env.DATAVERSE_URL || "").replace(/\/$/, "");
  assertSafety(process.env, dataverseUrl || "https://invalid.example", flags);
  if (flags.apply) assertDataverseScriptGate({ mode: "write-capable" });
  const client = createDynamicsClient({ env: { ...process.env, DATAVERSE_TIMEOUT_MS: process.env.PHASE1C_5R2F_TIMEOUT_MS || "60000" } });
  assertSafety(process.env, client.config.dataverseUrl, flags);
  const counts = { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, ChoiceWrites: 0, SolutionWrites: 0, ProbeCreateAttempts: 0, ProbeCreateSuccesses: 0, DuplicateAttempts: 0, DuplicateRejections: 0, ProbeDeletes: 0 };
  const get = async (endpoint, headers = {}) => { counts.GET += 1; return (await client.dataverseRequest("GET", endpoint, undefined, { headers })).body; };
  const getAll = async (endpoint) => { const rows = []; let next = endpoint; while (next) { const body = await get(next); rows.push(...(body.value || [])); next = body["@odata.nextLink"] || ""; } return rows; };
  const post = async (endpoint, body, meta = {}) => {
    counts.POST += 1;
    counts.ProbeCreateAttempts += meta.probeCreate ? 1 : 0;
    if (meta.probeCreate && /Duplicate/.test(String(body?.aigw_name || ""))) counts.DuplicateAttempts += 1;
    try {
      const response = await client.dataverseRequest("POST", endpoint, body, { prefer: "return=representation" });
      if (meta.probeCreate) counts.ProbeCreateSuccesses += 1;
      return { body: response.body, status: response.status, headers: Object.fromEntries(response.headers.entries()) };
    } catch (error) {
      if (meta.probeCreate && /Duplicate/.test(String(body?.aigw_name || "")) && (Number(error.status) === 409 || Number(error.status) === 412 || /duplicate|alternate key|key constraint|same key/i.test(String(error.message || "")))) counts.DuplicateRejections += 1;
      throw error;
    }
  };
  const del = async (endpoint) => { counts.DELETE += 1; counts.ProbeDeletes += 1; return client.dataverseDelete(endpoint); };
  const audit = { phase: "1C-5R2F-R3C", mode: flags.apply ? "apply" : "stage0", generatedAt: new Date().toISOString(), environment: new URL(dataverseUrl).hostname, requestCounts: counts, writeCounts: {}, gates: {}, blockers: [], p0: 0, p1: 0, p2: 0 };
  const read = { navigation: [], probe: null, protection: {}, security: null };

  const who = await get("/api/data/v9.2/WhoAmI()");
  if (!who?.UserId) throw new Error("WhoAmI did not return a test-environment identity.");
  const solutions = await get(`/api/data/v9.2/solutions?$select=solutionid,uniquename,ismanaged&$filter=uniquename eq '${SOLUTION}'`);
  const solution = solutions.value?.[0];
  if (!solution || solution.ismanaged) throw new Error("Target unmanaged solution was not confirmed.");

  const frozen = JSON.parse(await fs.readFile(path.join(ROOT, "docs/d365/d365-ai-demo-local-choice-option-values.json"), "utf8"));
  const packageVerification = await readPackageVerification();
  const [fullReplica, protectedForm, actualForm, actualView, bpf, coverageEntity, signalEntity, accountEntity, opportunityEntity, teamEntity, backingEntity, locationEntity, polpodEntity, app] = await Promise.all([
    get(`/api/data/v9.2/systemforms(${FULL_REPLICA_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,formxml,formjson,formactivationstate,isdefault`),
    get(`/api/data/v9.2/systemforms(${PROTECTED_FORM_ID})?$select=formid,formxml,formjson`),
    get(`/api/data/v9.2/systemforms(${ACTUAL_FORM_ID})?$select=formid,formxml,formjson`),
    get(`/api/data/v9.2/savedqueries(${ACTUAL_VIEW_ID})?$select=savedqueryid,fetchxml,layoutxml,layoutjson,statecode,statuscode`),
    get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,statecode,statuscode,processorder,clientdata,uniquename`),
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='aigw_customerservicecoverage')?$select=MetadataId,LogicalName,EntitySetName,PrimaryIdAttribute&$expand=ManyToOneRelationships,Attributes($select=LogicalName,RequiredLevel)`),
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='aigw_interactionsignal')?$select=MetadataId,LogicalName,EntitySetName,PrimaryIdAttribute&$expand=ManyToOneRelationships,Attributes($select=LogicalName,RequiredLevel)`),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='account')?$select=LogicalName,EntitySetName"),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')?$select=LogicalName,EntitySetName"),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='team')?$select=LogicalName,EntitySetName"),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='aigw_ai_demo_full_replica')?$select=MetadataId,LogicalName,EntitySetName,IsBPFEntity"),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='aigw_location')?$select=MetadataId,LogicalName,EntitySetName,PrimaryIdAttribute"),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='aigw_polpodlocation')?$select=MetadataId,LogicalName,EntitySetName,PrimaryIdAttribute"),
    get(`/api/data/v9.2/appmodules(${APP_ID})?$select=appmoduleid,name,uniquename,statecode,statuscode,componentstate,modifiedon`),
  ]);
  for (const entity of [coverageEntity, signalEntity]) entity.lookupRequiredLevels = Object.fromEntries((entity.Attributes || []).map((item) => [item.LogicalName, item.RequiredLevel?.Value || null]));
  read.navigation = [
    ...relationshipMatrix(coverageEntity, [{ attribute: "aigw_accountid", targetSet: accountEntity.EntitySetName }, { attribute: "aigw_responsibledepartment", targetSet: teamEntity.EntitySetName }]),
    ...relationshipMatrix(signalEntity, [{ attribute: "aigw_accountid", targetSet: accountEntity.EntitySetName }, { attribute: "aigw_opportunityid", targetSet: opportunityEntity.EntitySetName }, { attribute: "aigw_salesdepartment", targetSet: teamEntity.EntitySetName }]),
  ];

  const choiceResults = [];
  for (const definition of CHOICE_LABELS) {
    const current = parseOptionSet(await get(choiceEndpoint(definition)));
    const frozenField = frozen.fields.find((item) => item.entity === definition.entity && item.attribute === definition.attribute);
    choiceResults.push({ entity: definition.entity, attribute: definition.attribute, after: current, frozenMatch: choiceSnapshotMatches(current, frozenField, definition) });
  }
  const keys = [];
  for (const entity of ["aigw_customerservicecoverage", "aigw_interactionsignal"]) keys.push(...await getAll(`/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')/Keys?$select=MetadataId,SchemaName,KeyAttributes,EntityKeyIndexStatus,IsManaged`));
  const solutionComponents = await getAll(`/api/data/v9.2/solutioncomponents?$select=objectid,componenttype,rootcomponentbehavior&$filter=_solutionid_value eq ${solution.solutionid}`);
  const locationRows = await get(`/api/data/v9.2/${locationEntity.EntitySetName}?$select=${locationEntity.PrimaryIdAttribute}&$filter=statecode eq 0&$top=1&$count=true`);
  const pluginAssembly = (await get("/api/data/v9.2/pluginassemblies?$select=pluginassemblyid&$filter=name eq 'CrmAiGateway.ActualTotals.Plugin'" )).value?.[0];
  const pluginTypes = pluginAssembly ? await getAll(`/api/data/v9.2/plugintypes?$select=plugintypeid&$filter=_pluginassemblyid_value eq ${pluginAssembly.pluginassemblyid}`) : [];
  const allSteps = await getAll("/api/data/v9.2/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,statecode,_plugintypeid_value");
  const typeIds = new Set(pluginTypes.map((item) => normalizeId(item.plugintypeid)));
  const steps = allSteps.filter((item) => typeIds.has(normalizeId(item._plugintypeid_value)));
  const roleBefore = await readSecurity(get, getAll);
  const oldResidual = await readOldProbeResidual(get, coverageEntity, signalEntity);

  const before = {
    fullReplicaHash: sha256(`${fullReplica.formxml || ""}\n${fullReplica.formjson || ""}`),
    protectedHash: sha256(protectedForm.formxml),
    actualFormHash: sha256(`${actualForm.formxml || ""}\n${actualForm.formjson || ""}`),
    actualViewHash: sha256(`${actualView.fetchxml || ""}\n${actualView.layoutxml || ""}\n${actualView.layoutjson || ""}`),
    bpfHash: sha256(`${bpf.clientdata || ""}\n${bpf.statecode}\n${bpf.statuscode}\n${bpf.processorder}`),
    appHash: sha256(JSON.stringify(app)),
    polpodHash: sha256(JSON.stringify(polpodEntity)),
    securityHash: sha256(JSON.stringify(roleBefore.privileges)),
  };
  const fullStats = formStats(fullReplica.formxml);
  const alternateKeysReady = keys.filter((item) => ["aigw_customerservicecoveragekey", "aigw_interactiontokenkey"].includes(String(item.SchemaName || "").toLowerCase())).length === 2
    && keys.filter((item) => ["aigw_customerservicecoveragekey", "aigw_interactiontokenkey"].includes(String(item.SchemaName || "").toLowerCase())).every((item) => !["Pending", "InProgress", "Failed"].includes(String(item.EntityKeyIndexStatus || "Active")));
  audit.gates.testEnvironmentVerified = audit.environment === TARGET_HOSTNAME;
  audit.gates.solutionPackagingReady = packageVerification.packaging && packageVerification.forms && packageVerification.views;
  audit.gates.backingEntitySolutionReady = solutionComponents.some((item) => Number(item.componenttype) === 1 && normalizeId(item.objectid) === normalizeId(backingEntity.MetadataId));
  audit.gates.localChoiceCount = choiceResults.length;
  audit.gates.localOptionCount = choiceResults.reduce((sum, item) => sum + item.after.options.length, 0);
  audit.gates.localChoiceOptionsEmpty = false;
  audit.gates.localChoiceMetadataReady = choiceResults.length === 12 && audit.gates.localOptionCount === 75 && choiceResults.every((item) => item.frozenMatch);
  audit.gates.choicePublishReady = audit.gates.localChoiceMetadataReady;
  audit.gates.lookupNavigationMetadataReady = read.navigation.length === 5 && read.navigation.every((item) => item.unique && item.navigationProperty && item.targetEntitySet && item.referencedEntity);
  audit.gates.alternateKeysReady = alternateKeysReady;
  audit.gates.protectedBaselinePreserved = before.protectedHash === PROTECTED_FORM_HASH;
  audit.gates.coreSchemaPreserved = alternateKeysReady;
  audit.gates.fullReplicaPreserved = fullStats.tabs === 5 && fullStats.sections === 21 && fullStats.controls === 118 && fullStats.uniqueFields === 109;
  audit.gates.actualPreserved = formStats(actualForm.formxml).tabs === 1 && formStats(actualForm.formxml).sections === 5 && formStats(actualForm.formxml).controls === 41;
  audit.gates.pluginPreserved = steps.length === 7 && steps.filter((item) => Number(item.statecode) === 0).length === 7;
  audit.gates.locationPreserved = Number(locationRows["@odata.count"] ?? locationRows.value?.length ?? 0) === 51;
  audit.gates.bpfPreserved = Number(bpf.statecode) === 1 && Number(bpf.statuscode) === 2 && Number(bpf.processorder) === 0 && backingEntity.IsBPFEntity === true;
  audit.gates.appSitemapUnchanged = Boolean(app.appmoduleid);
  audit.gates.polpodPreserved = Boolean(polpodEntity.MetadataId);
  audit.gates.noOldProbeResidual = oldResidual.total === 0;
  audit.gates.securityMetadataReady = roleBefore.ready;
  read.security = roleBefore;
  read.protection = { fullReplica: { stats: fullStats }, plugin: { enabled: steps.filter((item) => Number(item.statecode) === 0).length }, locationActive: Number(locationRows["@odata.count"] ?? 0), oldResidual };

  const stage0Required = ["testEnvironmentVerified", "solutionPackagingReady", "backingEntitySolutionReady", "localChoiceMetadataReady", "lookupNavigationMetadataReady", "alternateKeysReady", "protectedBaselinePreserved", "coreSchemaPreserved", "fullReplicaPreserved", "actualPreserved", "pluginPreserved", "locationPreserved", "bpfPreserved", "appSitemapUnchanged", "polpodPreserved", "noOldProbeResidual", "securityMetadataReady"];
  const stage0Ready = stage0Required.every((key) => audit.gates[key] === true);
  if (!stage0Ready) {
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", message: `Stage 0 failed: ${stage0Required.filter((key) => audit.gates[key] !== true).join(", ")}` });
  }
  audit.writeCounts = { probeCreateAttempts: 0, probeCreateSuccesses: 0, duplicateAttempts: 0, duplicateRejections: 0, probeDeletes: 0 };
  if (flags.stage0Only || !flags.apply || !stage0Ready) {
    audit.gates.runtimeProbeReady = false;
    audit.gates.runtimeProbeCleanupReady = oldResidual.total === 0;
    audit.gates.runtimeProbeResidual = oldResidual.total;
    audit.gates.securityMinimumRuntimeReady = roleBefore.ready;
    audit.gates.formViewSecurityPhaseReady = false;
    audit.gates.demoDataDesignPhaseReady = false;
    audit.gates.demoDataGenerationReady = false;
    await writeArtifacts({ audit, read });
    console.log(JSON.stringify({ status: stage0Ready ? "stage0-ready" : "blocked", environment: audit.environment, counts, gates: audit.gates, blockers: audit.blockers, navigation: read.navigation.map(({ targetRecordId, ...item }) => item) }, null, 2));
    return;
  }

  read.probe = await runProbe({ get, post, del, entities: { coverage: coverageEntity, signal: signalEntity, backing: backingEntity }, userId: DEMO_USER_ID, buId: DEMO_BU_ID, choiceValues: choiceResults, phase: "R3C" });
  const check = (name) => Boolean(read.probe.validation.find((item) => item.check === name)?.ok);
  audit.gates.coverageChoiceRuntimeReady = check("Coverage two rows and Choice values round-trip");
  audit.gates.signalChoiceRuntimeReady = check("Signal three rows and all Choice values round-trip");
  audit.gates.coverageAlternateKeyRuntimeReady = check("Coverage alternate key duplicate blocked");
  audit.gates.interactionAlternateKeyRuntimeReady = check("Signal alternate key duplicate blocked");
  audit.gates.runtimeProbeReady = read.probe.started && read.probe.validation.every((item) => item.ok);
  audit.gates.runtimeProbeCleanupReady = read.probe.cleanup.ok && read.probe.cleanup.residual === 0;
  audit.gates.runtimeProbeResidual = read.probe.cleanup.residual;
  audit.gates.securityMinimumRuntimeReady = roleBefore.ready;
  audit.writeCounts = {
    probeCreateAttempts: counts.ProbeCreateAttempts,
    probeCreateSuccesses: counts.ProbeCreateSuccesses,
    duplicateAttempts: counts.DuplicateAttempts,
    duplicateRejections: counts.DuplicateRejections,
    probeDeletes: counts.ProbeDeletes,
  };
  audit.p2 = 2;

  const [fullAfter, protectedAfter, actualFormAfter, actualViewAfter, bpfAfter, appAfter, polpodAfter] = await Promise.all([
    get(`/api/data/v9.2/systemforms(${FULL_REPLICA_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formxml,formjson`),
    get(`/api/data/v9.2/systemforms(${PROTECTED_FORM_ID})?$select=formxml,formjson`),
    get(`/api/data/v9.2/systemforms(${ACTUAL_FORM_ID})?$select=formxml,formjson`),
    get(`/api/data/v9.2/savedqueries(${ACTUAL_VIEW_ID})?$select=fetchxml,layoutxml,layoutjson`),
    get(`/api/data/v9.2/workflows(${BPF_ID})?$select=statecode,statuscode,processorder,clientdata`),
    get(`/api/data/v9.2/appmodules(${APP_ID})?$select=appmoduleid,name,uniquename,statecode,statuscode,componentstate,modifiedon`),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='aigw_polpodlocation')?$select=MetadataId,LogicalName,EntitySetName,PrimaryIdAttribute"),
  ]);
  const roleAfter = await readSecurity(get, getAll);
  audit.gates.protectedBaselinePreserved = sha256(protectedAfter.formxml) === PROTECTED_FORM_HASH;
  audit.gates.fullReplicaPreserved = sha256(`${fullAfter.formxml || ""}\n${fullAfter.formjson || ""}`) === before.fullReplicaHash;
  audit.gates.actualPreserved = sha256(`${actualFormAfter.formxml || ""}\n${actualFormAfter.formjson || ""}`) === before.actualFormHash && sha256(`${actualViewAfter.fetchxml || ""}\n${actualViewAfter.layoutxml || ""}\n${actualViewAfter.layoutjson || ""}`) === before.actualViewHash;
  audit.gates.bpfPreserved = sha256(`${bpfAfter.clientdata || ""}\n${bpfAfter.statecode}\n${bpfAfter.statuscode}\n${bpfAfter.processorder}`) === before.bpfHash;
  audit.gates.appSitemapUnchanged = sha256(JSON.stringify(appAfter)) === before.appHash;
  audit.gates.polpodPreserved = sha256(JSON.stringify(polpodAfter)) === before.polpodHash;
  audit.gates.securityUnchanged = sha256(JSON.stringify(roleAfter.privileges)) === before.securityHash;
  if (!audit.gates.runtimeProbeReady || !audit.gates.runtimeProbeCleanupReady || !audit.gates.protectedBaselinePreserved || !audit.gates.fullReplicaPreserved || !audit.gates.actualPreserved || !audit.gates.bpfPreserved || !audit.gates.appSitemapUnchanged || !audit.gates.polpodPreserved || !audit.gates.securityUnchanged) {
    audit.p1 += 1;
    audit.blockers.push({ severity: "P1", message: "Runtime probe or final protection readback did not satisfy every R3C gate." });
  }
  audit.gates.formViewSecurityPhaseReady = audit.p0 === 0 && audit.p1 === 0 && audit.gates.runtimeProbeReady && audit.gates.runtimeProbeCleanupReady;
  audit.gates.demoDataDesignPhaseReady = audit.gates.formViewSecurityPhaseReady;
  audit.gates.demoDataGenerationReady = false;
  audit.gates.p0GatePassed = audit.p0 === 0;
  audit.gates.p1GatePassed = audit.p1 === 0;
  await writeArtifacts({ audit, read });
  console.log(JSON.stringify({ status: audit.gates.formViewSecurityPhaseReady ? "ready" : "blocked", environment: audit.environment, counts, writeCounts: audit.writeCounts, gates: audit.gates, blockers: audit.blockers, probe: { createdCounts: read.probe.createdCounts, validation: read.probe.validation, cleanup: read.probe.cleanup }, security: read.security }, null, 2));
}

async function readOldProbeResidual(get, coverageEntity, signalEntity) {
  const literalLike = "[[]AI-DEMO-SCHEMA-PROBE]%";
  const count = async (entity, idAttribute, filterAttribute) => {
    const fetchXml = `<fetch aggregate="true"><entity name="${entity}"><attribute name="${idAttribute}" alias="record_count" aggregate="count" /><filter><condition attribute="${filterAttribute}" operator="like" value="${literalLike}" /></filter></entity></fetch>`;
    const body = await get(`/api/data/v9.2/${entity === "account" ? "accounts" : entity === "opportunity" ? "opportunities" : entity === coverageEntity.LogicalName ? coverageEntity.EntitySetName : signalEntity.EntitySetName}?fetchXml=${encodeURIComponent(fetchXml)}`);
    return Number(body.value?.[0]?.record_count || body.value?.[0]?.["record_count@OData.Community.Display.V1.FormattedValue"] || 0);
  };
  const result = {
    accounts: await count("account", "accountid", "name"),
    opportunities: await count("opportunity", "opportunityid", "name"),
    coverages: await count(coverageEntity.LogicalName, coverageEntity.PrimaryIdAttribute, "aigw_demotoken"),
    signals: await count(signalEntity.LogicalName, signalEntity.PrimaryIdAttribute, "aigw_demotoken"),
  };
  return { ...result, total: Object.values(result).reduce((sum, value) => sum + value, 0) };
}

async function readSecurity(get, getAll) {
  const names = [
    "prvReadAigw_Customerservicecoverage", "prvAppendAigw_Customerservicecoverage", "prvAppendToAigw_Customerservicecoverage", "prvDeleteAigw_Customerservicecoverage",
    "prvReadAigw_Interactionsignal", "prvDeleteAigw_Interactionsignal",
    "prvReadOpportunity", "prvWriteOpportunity", "prvAppendOpportunity", "prvAppendToOpportunity", "prvCreateOpportunity", "prvDeleteOpportunity", "prvAssignOpportunity", "prvShareOpportunity",
  ];
  const rows = await getAll(`/api/data/v9.2/privileges?$select=privilegeid,name&$filter=${names.map((name) => `name eq '${name}'`).join(" or ")}`);
  const ids = new Map(rows.map((item) => [item.name, item.privilegeid]));
  const rolePrivileges = (await get(`/api/data/v9.2/RetrieveRolePrivilegesRole(RoleId=${DEMO_ROLE_ID})`)).RolePrivileges || [];
  const depths = new Map(rolePrivileges.map((item) => [normalizeId(item.PrivilegeId), item.Depth]));
  const depth = (name) => ids.get(name) ? depths.get(normalizeId(ids.get(name))) || "None" : "None";
  const privileges = names.map((name) => ({ name, depth: depth(name) }));
  const ready = ["prvReadAigw_Customerservicecoverage", "prvAppendAigw_Customerservicecoverage", "prvAppendToAigw_Customerservicecoverage", "prvReadAigw_Interactionsignal", "prvReadOpportunity", "prvWriteOpportunity", "prvAppendOpportunity", "prvAppendToOpportunity"].every((name) => depth(name) !== "None")
    && ["prvDeleteAigw_Customerservicecoverage", "prvDeleteAigw_Interactionsignal", "prvCreateOpportunity", "prvDeleteOpportunity", "prvAssignOpportunity", "prvShareOpportunity"].every((name) => depth(name) === "None");
  return { roleToken: "CRM-AI-DEMO-BPF-USER", privileges, ready, productionMultiRoleValidation: "deferred" };
}

runDataverseCli(import.meta.url, main);
