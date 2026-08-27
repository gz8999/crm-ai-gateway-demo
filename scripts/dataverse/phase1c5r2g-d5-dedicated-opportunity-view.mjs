import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, runDataverseCli } from "./lib/environment-safety.mjs";
import {
  DEDICATED_OPPORTUNITY_VIEW,
  appDescriptorHasView,
  addRequestStats,
  buildDedicatedViewPayload,
  compareDedicatedView,
  dedicatedViewRequestStatsAreSafe,
  normalizeAppDescriptor,
  normalizeId,
  stableOpportunityBusinessProjection,
  summarizeOpportunityStates,
} from "./lib/d5-dedicated-opportunity-view-contract.mjs";

const TEST_HOST = "org91f5f65f.crm5.dynamics.com";
const PRODUCTION_HOST = "lcn-crm.crm7.dynamics.com";
const PROTECTED_FORM_ID = "8db60b46-b976-f111-ab0e-00224817cb31";
const PROTECTED_FORM_HASH = "5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7";
const FULL_FORM_ID = "97a1555b-0903-408a-ac63-d63aed65b14a";
const ACTUAL_FORM_ID = "e0537d47-a5f7-45a3-b607-608e7e831700";
const BPF_ID = "7325b274-6b7c-f111-ab0e-70a8a50388b9";
const PRIVATE_PILOT_MANIFEST = "local-artifacts/d365/d365-ai-demo-200-d5-pilot-import-private.json";
const PRIVATE_AUDIT = "local-artifacts/d365/d365-ai-demo-200-dedicated-view-private.json";
const SOURCE_SELECT = "savedqueryid,name,returnedtypecode,querytype,isquickfindquery,statecode,statuscode,componentstate,ismanaged,fetchxml,layoutxml,layoutjson";

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const escapeOData = (value) => String(value).replaceAll("'", "''");
const sorted = (values) => [...values].sort((a, b) => String(a).localeCompare(String(b)));

function formAnalysis(formxml) {
  const text = String(formxml || "");
  const controls = [...text.matchAll(/<control\b[^>]*?(?:\/>|>[\s\S]*?<\/control>)/gi)].map((match) => match[0]);
  const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag)?.[1] || "";
  const bound = controls.map((control) => attr(control, "datafieldname")).filter(Boolean);
  return {
    tabs: [...text.matchAll(/<tab\b/gi)].length,
    sections: [...text.matchAll(/<section\b/gi)].length,
    controls: [...text.matchAll(/<control\b/gi)].length,
    uniqueFields: new Set(bound).size,
    nativeTimeline: controls.filter((control) => attr(control, "id") === "notescontrol" || attr(control, "name") === "aigw_timeline_control").length,
    oldTimeline: controls.filter((control) => /timeline/i.test(attr(control, "datafieldname"))).length,
  };
}

function pilotEntries(manifest) {
  return Object.entries(manifest?.records || {})
    .filter(([key]) => key.startsWith("Opportunity:"))
    .map(([key, value]) => ({ token: key.slice("Opportunity:".length), id: normalizeId(value.exactRecordId) }))
    .sort((a, b) => a.token.localeCompare(b.token));
}

function buildPilotFetch(entries) {
  const conditions = entries.map((entry) => `<condition attribute="opportunityid" operator="eq" value="${entry.id}" />`).join("");
  return `<fetch mapping="logical"><entity name="opportunity"><attribute name="opportunityid" /><attribute name="name" /><attribute name="statecode" /><attribute name="statuscode" /><attribute name="actualclosedate" /><attribute name="ownerid" /><attribute name="aigw_customernamecn" /><attribute name="modifiedon" /><filter type="or">${conditions}</filter></entity></fetch>`;
}

function buildCandidateFetch(ownerId) {
  return `<fetch mapping="logical"><entity name="opportunity"><attribute name="opportunityid" /><attribute name="name" /><attribute name="statecode" /><attribute name="statuscode" /><attribute name="ownerid" /><attribute name="aigw_customernamecn" /><filter type="and"><condition attribute="ownerid" operator="eq" value="${normalizeId(ownerId)}" /><condition attribute="aigw_customernamecn" operator="like" value="%${DEDICATED_OPPORTUNITY_VIEW.syntheticCustomerSuffix}" /></filter><order attribute="modifiedon" descending="true" /></entity></fetch>`;
}

async function pluginSnapshot(getAll) {
  const assemblies = await getAll("/api/data/v9.2/pluginassemblies?$select=pluginassemblyid,name&$filter=name eq 'CrmAiGateway.ActualTotals.Plugin'");
  if (assemblies.length !== 1) return { assemblyCount: assemblies.length, typeCount: 0, stepCount: 0, enabled: 0, disabled: 0 };
  const types = await getAll(`/api/data/v9.2/plugintypes?$select=plugintypeid,_pluginassemblyid_value&$filter=_pluginassemblyid_value eq ${assemblies[0].pluginassemblyid}`);
  const typeFilter = types.map((type) => `_plugintypeid_value eq ${type.plugintypeid}`).join(" or ");
  const steps = typeFilter ? await getAll(`/api/data/v9.2/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,statecode,statuscode&$filter=${encodeURIComponent(typeFilter)}`) : [];
  return {
    assemblyCount: assemblies.length,
    typeCount: types.length,
    stepCount: steps.length,
    enabled: steps.filter((step) => Number(step.statecode) === 0).length,
    disabled: steps.filter((step) => Number(step.statecode) !== 0).length,
  };
}

function publicSummary(audit) {
  return {
    phase: audit.phase,
    mode: audit.mode,
    status: audit.status,
    blocker: audit.blocker || null,
    view: {
      name: DEDICATED_OPPORTUNITY_VIEW.name,
      created: Boolean(audit.result?.viewCreated),
      solutionMembership: Boolean(audit.result?.solutionMembership),
      appMembership: Boolean(audit.result?.appMembership),
      publishedInApp: Boolean(audit.result?.publishedInApp),
    },
    currentRows: audit.result?.currentRows ?? audit.preflight?.candidateCount ?? null,
    stateDistribution: audit.result?.stateDistribution ?? audit.preflight?.stateDistribution ?? null,
    oldViewRows: audit.result?.oldViewRows ?? audit.preflight?.oldViewRows ?? null,
    requestStats: audit.taskRequestStats || audit.requestStats,
  };
}

export async function main({ argv = process.argv.slice(2), env = process.env } = {}) {
  const apply = argv.includes("--apply");
  assertDataverseScriptGate({ mode: apply ? "publish/deploy-capable" : "read-only", argv, env });
  const dataverseUrl = new URL(getDataverseUrl(env));
  if (dataverseUrl.hostname.toLowerCase() !== TEST_HOST || dataverseUrl.hostname.toLowerCase() === PRODUCTION_HOST) throw new Error("Only the approved test Dataverse organization is allowed.");
  if ((env.AI_PROVIDER || "demo") !== "demo" || String(env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("AI safety gate failed.");

  const root = process.cwd();
  const privatePath = path.join(root, PRIVATE_AUDIT);
  const client = createDynamicsClient({ env: { ...env, DATAVERSE_TIMEOUT_MS: env.DEDICATED_VIEW_TIMEOUT_MS || "90000" } });
  if (new URL(client.config.dataverseUrl).hostname.toLowerCase() !== TEST_HOST) throw new Error("Dataverse client host mismatch.");
  const audit = {
    phase: "Phase 1C-5R2G-D5 Dedicated Opportunity View",
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    host: TEST_HOST,
    status: "running",
    requestStats: { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, OpportunityWrites: 0, BusinessWrites: 0, ProductionRequests: 0, ExternalLLMCalls: 0 },
  };
  const request = async (method, endpoint, body, options = {}) => {
    if (new URL(client.config.dataverseUrl).hostname.toLowerCase() !== TEST_HOST) {
      audit.requestStats.ProductionRequests += 1;
      throw new Error("Production or unknown Dataverse host blocked.");
    }
    if (method === "GET") { audit.requestStats.GET += 1; return client.dataverseGet(endpoint); }
    if (method === "POST") { audit.requestStats.POST += 1; return client.dataversePost(endpoint, body, options); }
    throw new Error(`Unsupported request method: ${method}`);
  };
  const get = async (endpoint) => (await request("GET", endpoint)).body;
  const post = (endpoint, body, options = {}) => request("POST", endpoint, body, options);
  const getAll = async (endpoint) => {
    const rows = [];
    let next = endpoint;
    while (next) {
      const body = await get(next);
      rows.push(...(body.value || []));
      next = body["@odata.nextLink"] || "";
    }
    return rows;
  };
  const executeFetch = (fetchXml) => getAll(`/api/data/v9.2/opportunities?fetchXml=${encodeURIComponent(fetchXml)}`);
  const appComponents = (appUniqueId) => getAll(`/api/data/v9.2/appmodulecomponents?$select=appmodulecomponentid,objectid,componenttype,isdefault,rootcomponentbehavior&$filter=_appmoduleidunique_value eq ${appUniqueId}`);

  try {
    const pilotManifest = JSON.parse(await fs.readFile(path.join(root, PRIVATE_PILOT_MANIFEST), "utf8"));
    const entries = pilotEntries(pilotManifest);
    if (entries.length !== DEDICATED_OPPORTUNITY_VIEW.expectedCurrentCount || entries.some((entry) => !entry.id)) throw new Error("Private Pilot manifest does not contain exactly 24 resolved Opportunity records.");

    const [whoAmI, solutionRows, sourceView, ownerRows, app, protectedForm, fullForm, actualForm, bpf, locationCount, pilotRows, oldViewRows, plugin] = await Promise.all([
      get("/api/data/v9.2/WhoAmI"),
      get(`/api/data/v9.2/solutions?$select=solutionid,uniquename,friendlyname,ismanaged&$filter=uniquename eq '${DEDICATED_OPPORTUNITY_VIEW.solutionUniqueName}'`),
      get(`/api/data/v9.2/savedqueries(${DEDICATED_OPPORTUNITY_VIEW.sourceViewId})?$select=${SOURCE_SELECT}`),
      get(`/api/data/v9.2/systemusers?$select=systemuserid,fullname,isdisabled,accessmode,applicationid&$filter=fullname eq '${escapeOData(DEDICATED_OPPORTUNITY_VIEW.ownerDisplayName)}' and isdisabled eq false`),
      get(`/api/data/v9.2/appmodules(${DEDICATED_OPPORTUNITY_VIEW.appId})?$select=appmoduleid,appmoduleidunique,name,uniquename,ismanaged,statecode,statuscode,componentstate,descriptor,publishedon`),
      get(`/api/data/v9.2/systemforms(${PROTECTED_FORM_ID})?$select=formid,formxml`),
      get(`/api/data/v9.2/systemforms(${FULL_FORM_ID})?$select=formid,name,isdefault,formactivationstate,formxml,formjson`),
      get(`/api/data/v9.2/systemforms(${ACTUAL_FORM_ID})?$select=formid,name,formxml,formjson`),
      get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,name,statecode,statuscode,processorder,clientdata`),
      get("/api/data/v9.2/aigw_locations?$select=aigw_locationid&$filter=statecode eq 0&$count=true&$top=1"),
      executeFetch(buildPilotFetch(entries)),
      getAll(`/api/data/v9.2/opportunities?savedQuery=${DEDICATED_OPPORTUNITY_VIEW.sourceViewId}`),
      pluginSnapshot(getAll),
    ]);
    if (!whoAmI.UserId) throw new Error("WhoAmI failed.");
    if (solutionRows.value?.length !== 1 || solutionRows.value[0].ismanaged !== false) throw new Error("Target unmanaged Solution gate failed.");
    if (sourceView.name !== "所有案件 - AI Demo Full Replica") throw new Error("Frozen source View gate failed.");
    if (ownerRows.value?.length !== 1 || ownerRows.value[0].accessmode !== 0 || ownerRows.value[0].applicationid) throw new Error("Approved ordinary Demo owner could not be resolved uniquely.");
    if (app.name !== "CRM AI Gateway Demo - Modern" || app.ismanaged !== false || app.statecode !== 0) throw new Error("Target Modern App gate failed.");
    if (sha256(protectedForm.formxml) !== PROTECTED_FORM_HASH) throw new Error("Protected Form hash gate failed.");
    const full = formAnalysis(fullForm.formxml);
    const actual = formAnalysis(actualForm.formxml);
    if (full.tabs !== 5 || full.sections !== 21 || full.controls !== 118 || full.uniqueFields !== 108 || full.nativeTimeline !== 1 || full.oldTimeline !== 0 || fullForm.formactivationstate !== 1 || fullForm.isdefault !== false) throw new Error(`Full Replica gate failed: ${JSON.stringify(full)}`);
    if (actual.tabs !== 1 || actual.sections !== 5 || actual.controls !== 41) throw new Error(`Actual Form gate failed: ${JSON.stringify(actual)}`);
    if (bpf.statecode !== 1 || bpf.statuscode !== 2 || bpf.processorder !== 0) throw new Error("BPF Active/Activated order gate failed.");
    if (Number(locationCount["@odata.count"]) !== 51) throw new Error("Location count gate failed.");
    if (plugin.assemblyCount !== 1 || plugin.typeCount !== 3 || plugin.stepCount !== 7 || plugin.enabled !== 7 || plugin.disabled !== 0) throw new Error("Plugin 7/0 gate failed.");
    if (pilotRows.length !== 24 || sorted(pilotRows.map((row) => normalizeId(row.opportunityid))).join("|") !== sorted(entries.map((entry) => entry.id)).join("|")) throw new Error("Pilot exact-record readback gate failed.");

    const ownerId = normalizeId(ownerRows.value[0].systemuserid);
    const candidateRows = await executeFetch(buildCandidateFetch(ownerId));
    const stateDistribution = summarizeOpportunityStates(candidateRows);
    const candidateIds = sorted(candidateRows.map((row) => normalizeId(row.opportunityid)));
    const pilotIds = sorted(entries.map((entry) => entry.id));
    if (candidateRows.length !== 24 || candidateIds.join("|") !== pilotIds.join("|")) throw new Error("Dedicated View candidate filter does not resolve the exact 24 Pilot Opportunities.");
    const expectedStates = DEDICATED_OPPORTUNITY_VIEW.expectedCurrentStates;
    if (stateDistribution.open !== expectedStates.open || stateDistribution.won !== expectedStates.won || stateDistribution.lost !== expectedStates.lost || stateDistribution.other !== 0) throw new Error("Pilot state distribution gate failed.");
    if (oldViewRows.length !== 100) throw new Error(`Legacy View isolation gate failed: expected 100, found ${oldViewRows.length}.`);

    const [existingViews, initialComponents, initialUnpublishedApp] = await Promise.all([
      getAll(`/api/data/v9.2/savedqueries?$select=${SOURCE_SELECT}&$filter=name eq '${escapeOData(DEDICATED_OPPORTUNITY_VIEW.name)}' and returnedtypecode eq 'opportunity'`),
      appComponents(app.appmoduleidunique),
      get(`/api/data/v9.2/appmodules(${DEDICATED_OPPORTUNITY_VIEW.appId})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=appmoduleidunique,descriptor,componentstate,publishedon`),
    ]);
    const initialUnpublishedComponents = await appComponents(initialUnpublishedApp.appmoduleidunique);
    if (existingViews.length > 1) throw new Error("Duplicate dedicated Opportunity Views already exist.");
    let priorAudit = null;
    try { priorAudit = JSON.parse(await fs.readFile(privatePath, "utf8")); } catch {}
    const priorWriteExecution = priorAudit?.priorExecution || (priorAudit?.mode === "apply" ? {
      status: priorAudit.status,
      blocker: priorAudit.blocker || null,
      requestStats: priorAudit.requestStats,
      existingViewAtStart: priorAudit.preflight?.existingView ?? null,
    } : null);
    if (priorWriteExecution) audit.priorExecution = priorWriteExecution;
    audit.priorTaskRequestStats = priorAudit?.taskRequestStats || priorAudit?.requestStats || null;
    audit.originalBaseline = priorAudit?.originalBaseline || {
      appComponentCountBefore: priorAudit?.result?.appComponentCountBefore ?? priorAudit?.preflight?.appComponentCount ?? initialComponents.length,
      existingViewAtStart: priorAudit?.priorExecution?.existingViewAtStart ?? priorAudit?.preflight?.existingView ?? Boolean(existingViews[0]),
    };
    const viewId = normalizeId(existingViews[0]?.savedqueryid || priorAudit?.preflight?.plannedViewId || randomUUID());
    const expectedView = buildDedicatedViewPayload({ sourceView, viewId, ownerId });
    if (existingViews[0] && compareDedicatedView(existingViews[0], expectedView).length) throw new Error(`Existing dedicated View definition drifted: ${compareDedicatedView(existingViews[0], expectedView).join(", ")}.`);

    const sitemapId = JSON.parse(app.descriptor).appInfo.Components.find((component) => Number(component.Type) === 62)?.Id;
    if (!sitemapId) throw new Error("Modern App SiteMap component could not be resolved.");
    const sitemap = await get(`/api/data/v9.2/sitemaps(${normalizeId(sitemapId)})?$select=sitemapid,sitemapxml,componentstate`);
    const pilotHash = sha256(JSON.stringify(stableOpportunityBusinessProjection(pilotRows)));
    audit.preflight = {
      plannedViewId: viewId,
      sourceViewHash: sha256(JSON.stringify({ fetchxml: sourceView.fetchxml, layoutxml: sourceView.layoutxml, layoutjson: sourceView.layoutjson })),
      sourceViewCount: oldViewRows.length,
      pilotHash,
      candidateCount: candidateRows.length,
      stateDistribution,
      oldViewRows: oldViewRows.length,
      appComponentCount: initialComponents.length,
      unpublishedAppComponentCount: initialUnpublishedComponents.length,
      unpublishedAppContainsView: initialUnpublishedComponents.filter((component) => Number(component.componenttype) === 26 && normalizeId(component.objectid) === viewId).length,
      appDescriptorHash: sha256(app.descriptor),
      appNormalizedDescriptorHash: sha256(JSON.stringify(normalizeAppDescriptor(app.descriptor, viewId))),
      sitemapHash: sha256(sitemap.sitemapxml),
      protectedFormHash: sha256(protectedForm.formxml),
      fullReplica: full,
      actualForm: actual,
      bpf: { active: bpf.statecode === 1 && bpf.statuscode === 2, processOrder: bpf.processorder, definitionHash: sha256(bpf.clientdata) },
      plugin,
      locationActive: Number(locationCount["@odata.count"]),
      existingView: Boolean(existingViews[0]),
      requestedWrites: existingViews[0] ? ["AddSolutionComponent if missing", "AddAppComponents if missing", "Publish Modern App if required"] : ["Create SavedQuery", "AddSolutionComponent if missing", "AddAppComponents", "Publish Modern App"],
      forbiddenWrites: ["Opportunity PATCH", "Business record POST", "DELETE", "Opportunity entity PublishXml", "Form/BPF/Plugin/Schema changes"],
    };

    if (!apply) {
      audit.status = "dry-run-ready";
      audit.taskRequestStats = addRequestStats(audit.priorTaskRequestStats, audit.requestStats);
      await fs.mkdir(path.dirname(privatePath), { recursive: true });
      await fs.writeFile(privatePath, `${JSON.stringify(audit, null, 2)}\n`);
      console.log(JSON.stringify(publicSummary(audit), null, 2));
      return;
    }
    if (!priorAudit?.preflight || priorAudit.preflight.plannedViewId !== viewId || priorAudit.preflight.sourceViewHash !== audit.preflight.sourceViewHash || priorAudit.preflight.pilotHash !== pilotHash || priorAudit.preflight.appDescriptorHash !== audit.preflight.appDescriptorHash || priorAudit.preflight.sitemapHash !== audit.preflight.sitemapHash) {
      throw new Error("Dry-run snapshot is absent or stale; no write performed. Run dry-run again.");
    }

    let view = existingViews[0] || null;
    let viewCreated = false;
    if (!view) {
      try {
        await post("/api/data/v9.2/savedqueries", expectedView, { headers: { "MSCRM.SolutionUniqueName": DEDICATED_OPPORTUNITY_VIEW.solutionUniqueName } });
      } catch (error) {
        await sleep(3000);
        const uncertain = await getAll(`/api/data/v9.2/savedqueries?$select=${SOURCE_SELECT}&$filter=name eq '${escapeOData(DEDICATED_OPPORTUNITY_VIEW.name)}' and returnedtypecode eq 'opportunity'`);
        if (uncertain.length !== 1 || compareDedicatedView(uncertain[0], expectedView).length) throw error;
      }
      const created = await getAll(`/api/data/v9.2/savedqueries?$select=${SOURCE_SELECT}&$filter=name eq '${escapeOData(DEDICATED_OPPORTUNITY_VIEW.name)}' and returnedtypecode eq 'opportunity'`);
      if (created.length !== 1 || normalizeId(created[0].savedqueryid) !== viewId || compareDedicatedView(created[0], expectedView).length) throw new Error("SavedQuery create readback failed.");
      view = created[0];
      viewCreated = true;
    }

    const solutionId = normalizeId(solutionRows.value[0].solutionid);
    const readSolutionMembership = async () => (await getAll(`/api/data/v9.2/solutioncomponents?$select=solutioncomponentid,objectid,componenttype,_solutionid_value,rootcomponentbehavior&$filter=_solutionid_value eq ${solutionId} and componenttype eq 26`)).filter((component) => normalizeId(component.objectid) === viewId);
    let solutionMembership = await readSolutionMembership();
    if (!solutionMembership.length) {
      const payload = { ComponentId: viewId, ComponentType: 26, SolutionUniqueName: DEDICATED_OPPORTUNITY_VIEW.solutionUniqueName, AddRequiredComponents: false, DoNotIncludeSubcomponents: true };
      try { await post("/api/data/v9.2/AddSolutionComponent", payload); }
      catch (error) { await sleep(3000); solutionMembership = await readSolutionMembership(); if (solutionMembership.length !== 1) throw error; }
      solutionMembership = await readSolutionMembership();
    }
    if (solutionMembership.length !== 1) throw new Error("Dedicated View Solution membership gate failed.");

    let currentUnpublishedApp = await get(`/api/data/v9.2/appmodules(${DEDICATED_OPPORTUNITY_VIEW.appId})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=appmoduleidunique,descriptor,componentstate,publishedon`);
    let components = await appComponents(currentUnpublishedApp.appmoduleidunique);
    let appMembership = components.filter((component) => Number(component.componenttype) === 26 && normalizeId(component.objectid) === viewId);
    const hadUnpublishedMembership = appMembership.length === 1;
    if (!appMembership.length) {
      const payload = { AppId: DEDICATED_OPPORTUNITY_VIEW.appId, Components: [{ savedqueryid: viewId, "@odata.type": "Microsoft.Dynamics.CRM.savedquery" }] };
      try { await post("/api/data/v9.2/AddAppComponents", payload); }
      catch (error) {
        await sleep(3000);
        currentUnpublishedApp = await get(`/api/data/v9.2/appmodules(${DEDICATED_OPPORTUNITY_VIEW.appId})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=appmoduleidunique,descriptor,componentstate,publishedon`);
        components = await appComponents(currentUnpublishedApp.appmoduleidunique);
        appMembership = components.filter((component) => Number(component.componenttype) === 26 && normalizeId(component.objectid) === viewId);
        if (appMembership.length !== 1) throw error;
      }
      currentUnpublishedApp = await get(`/api/data/v9.2/appmodules(${DEDICATED_OPPORTUNITY_VIEW.appId})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=appmoduleidunique,descriptor,componentstate,publishedon`);
      components = await appComponents(currentUnpublishedApp.appmoduleidunique);
      appMembership = components.filter((component) => Number(component.componenttype) === 26 && normalizeId(component.objectid) === viewId);
    }
    const expectedUnpublishedCount = initialUnpublishedComponents.length + (hadUnpublishedMembership ? 0 : 1);
    if (appMembership.length !== 1 || components.length !== expectedUnpublishedCount) throw new Error("Modern App unpublished component membership gate failed.");
    const validation = await get(`/api/data/v9.2/ValidateApp(AppModuleId=${DEDICATED_OPPORTUNITY_VIEW.appId})`);
    if (validation.AppValidationResponse?.ValidationSuccess === false) throw new Error("ValidateApp failed after adding the dedicated View.");

    const unpublishedApp = await get(`/api/data/v9.2/appmodules(${DEDICATED_OPPORTUNITY_VIEW.appId})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=appmoduleidunique,descriptor,componentstate,publishedon`);
    const publishedBefore = await get(`/api/data/v9.2/appmodules(${DEDICATED_OPPORTUNITY_VIEW.appId})?$select=appmoduleidunique,descriptor,componentstate,publishedon`);
    const publishedComponentsBefore = await appComponents(publishedBefore.appmoduleidunique);
    const publishedHasView = publishedComponentsBefore.filter((component) => Number(component.componenttype) === 26 && normalizeId(component.objectid) === viewId).length;
    const needsPublish = publishedHasView !== 1 || appDescriptorHasView(publishedBefore.descriptor, viewId) !== 1 || publishedBefore.appmoduleidunique !== unpublishedApp.appmoduleidunique;
    if (needsPublish) {
      audit.requestStats.Publish += 1;
      const parameterXml = `<importexportxml><appmodules><appmodule>${DEDICATED_OPPORTUNITY_VIEW.appId}</appmodule></appmodules></importexportxml>`;
      try { await client.dataversePost("/api/data/v9.2/PublishXml", { ParameterXml: parameterXml }); }
      catch (error) {
        await sleep(5000);
        const delayed = await get(`/api/data/v9.2/appmodules(${DEDICATED_OPPORTUNITY_VIEW.appId})?$select=descriptor,componentstate,publishedon`);
        if (appDescriptorHasView(delayed.descriptor, viewId) !== 1) throw error;
      }
    }

    const appAfter = await get(`/api/data/v9.2/appmodules(${DEDICATED_OPPORTUNITY_VIEW.appId})?$select=appmoduleid,appmoduleidunique,name,statecode,statuscode,componentstate,descriptor,publishedon`);
    const componentsAfter = await appComponents(appAfter.appmoduleidunique);
    const [viewAfter, viewUnpublished, sourceViewAfter, appUnpublishedAfter, sitemapAfter, candidateAfter, savedQueryAfter, oldViewAfter, pilotAfter, protectedAfter, fullAfter, actualAfter, bpfAfter, locationAfter, pluginAfter] = await Promise.all([
      get(`/api/data/v9.2/savedqueries(${viewId})?$select=${SOURCE_SELECT}`),
      get(`/api/data/v9.2/savedqueries(${viewId})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=${SOURCE_SELECT}`),
      get(`/api/data/v9.2/savedqueries(${DEDICATED_OPPORTUNITY_VIEW.sourceViewId})?$select=${SOURCE_SELECT}`),
      get(`/api/data/v9.2/appmodules(${DEDICATED_OPPORTUNITY_VIEW.appId})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=appmoduleidunique,descriptor,componentstate,publishedon`),
      get(`/api/data/v9.2/sitemaps(${normalizeId(sitemapId)})?$select=sitemapid,sitemapxml,componentstate`),
      executeFetch(buildCandidateFetch(ownerId)),
      getAll(`/api/data/v9.2/opportunities?savedQuery=${viewId}`),
      getAll(`/api/data/v9.2/opportunities?savedQuery=${DEDICATED_OPPORTUNITY_VIEW.sourceViewId}`),
      executeFetch(buildPilotFetch(entries)),
      get(`/api/data/v9.2/systemforms(${PROTECTED_FORM_ID})?$select=formid,formxml`),
      get(`/api/data/v9.2/systemforms(${FULL_FORM_ID})?$select=formid,name,isdefault,formactivationstate,formxml,formjson`),
      get(`/api/data/v9.2/systemforms(${ACTUAL_FORM_ID})?$select=formid,name,formxml,formjson`),
      get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,name,statecode,statuscode,processorder,clientdata`),
      get("/api/data/v9.2/aigw_locations?$select=aigw_locationid&$filter=statecode eq 0&$count=true&$top=1"),
      pluginSnapshot(getAll),
    ]);
    const stateAfter = summarizeOpportunityStates(candidateAfter);
    const componentWithoutNew = (rows) => rows.filter((component) => !(Number(component.componenttype) === 26 && normalizeId(component.objectid) === viewId)).map((component) => `${component.componenttype}:${normalizeId(component.objectid)}`).sort();
    const pilotAfterHash = sha256(JSON.stringify(stableOpportunityBusinessProjection(pilotAfter)));
    const fullAfterAnalysis = formAnalysis(fullAfter.formxml);
    const actualAfterAnalysis = formAnalysis(actualAfter.formxml);
    audit.taskRequestStats = addRequestStats(audit.priorTaskRequestStats, audit.requestStats);
    const gates = {
      viewDefinition: viewAfter.componentstate === 0 && compareDedicatedView(viewAfter, expectedView).length === 0 && compareDedicatedView(viewUnpublished, expectedView).length === 0,
      currentRows: candidateAfter.length === 24 && savedQueryAfter.length === 24,
      stateDistribution: stateAfter.open === 16 && stateAfter.won === 7 && stateAfter.lost === 1 && stateAfter.other === 0,
      solutionMembership: solutionMembership.length === 1,
      appMembership: componentsAfter.filter((component) => Number(component.componenttype) === 26 && normalizeId(component.objectid) === viewId).length === 1,
      publishedInApp: appAfter.componentstate === 0 && appDescriptorHasView(appAfter.descriptor, viewId) === 1 && appAfter.descriptor === appUnpublishedAfter.descriptor,
      appOtherComponents: JSON.stringify(componentWithoutNew(initialComponents)) === JSON.stringify(componentWithoutNew(componentsAfter)),
      appDescriptor: sha256(JSON.stringify(normalizeAppDescriptor(appAfter.descriptor, viewId))) === audit.preflight.appNormalizedDescriptorHash,
      sitemap: sha256(sitemapAfter.sitemapxml) === audit.preflight.sitemapHash,
      oldView: oldViewAfter.length === 100 && sha256(JSON.stringify({ fetchxml: sourceViewAfter.fetchxml, layoutxml: sourceViewAfter.layoutxml, layoutjson: sourceViewAfter.layoutjson })) === audit.preflight.sourceViewHash,
      pilotBusinessData: pilotAfterHash === pilotHash,
      protectedForm: sha256(protectedAfter.formxml) === PROTECTED_FORM_HASH,
      fullReplica: JSON.stringify(fullAfterAnalysis) === JSON.stringify(full),
      actualForm: JSON.stringify(actualAfterAnalysis) === JSON.stringify(actual),
      bpf: bpfAfter.statecode === bpf.statecode && bpfAfter.statuscode === bpf.statuscode && bpfAfter.processorder === bpf.processorder && sha256(bpfAfter.clientdata) === sha256(bpf.clientdata),
      plugin: JSON.stringify(pluginAfter) === JSON.stringify(plugin),
      location: Number(locationAfter["@odata.count"]) === 51,
      requestSafety: dedicatedViewRequestStatsAreSafe(audit.taskRequestStats),
    };
    audit.result = {
      viewCreated: viewCreated || (audit.originalBaseline.existingViewAtStart === false && Number(audit.taskRequestStats.POST || 0) > 0),
      solutionMembership: gates.solutionMembership,
      appMembership: gates.appMembership,
      publishedInApp: gates.publishedInApp,
      currentRows: savedQueryAfter.length,
      stateDistribution: stateAfter,
      oldViewRows: oldViewAfter.length,
      appComponentCountBefore: audit.originalBaseline.appComponentCountBefore,
      appComponentCountAfter: componentsAfter.length,
      appActive: appAfter.statecode === 0 && appAfter.statuscode === 1,
      directRuntimeUrl: `${dataverseUrl.origin}/main.aspx?appid=${DEDICATED_OPPORTUNITY_VIEW.appId}&pagetype=entitylist&etn=opportunity&viewid=${viewId}&viewtype=1039`,
      exactIdsStoredOnlyInPrivateAudit: true,
      gates,
    };
    audit.status = Object.values(gates).every(Boolean) ? "complete" : "blocked";
    if (audit.status !== "complete") audit.blocker = `Post-write gates failed: ${Object.entries(gates).filter(([, value]) => !value).map(([key]) => key).join(", ")}`;
    if (!dedicatedViewRequestStatsAreSafe(audit.taskRequestStats)) throw new Error("Request safety gate failed.");
    await fs.mkdir(path.dirname(privatePath), { recursive: true });
    await fs.writeFile(privatePath, `${JSON.stringify(audit, null, 2)}\n`);
    console.log(JSON.stringify(publicSummary(audit), null, 2));
    if (audit.status !== "complete") process.exitCode = 1;
  } catch (error) {
    audit.status = "blocked";
    audit.blocker = error.message;
    audit.errorStatus = error.status || null;
    await fs.mkdir(path.dirname(privatePath), { recursive: true });
    await fs.writeFile(privatePath, `${JSON.stringify(audit, null, 2)}\n`);
    console.log(JSON.stringify(publicSummary(audit), null, 2));
    process.exitCode = 1;
  }
}

runDataverseCli(import.meta.url, main);
