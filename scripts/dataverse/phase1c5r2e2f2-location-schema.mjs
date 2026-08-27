import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, runDataverseCli } from "./lib/environment-safety.mjs";

const HOST = ["org91f5f65f", "crm5", "dynamics", "com"].join(".");
const SOLUTION = "CRMAIGatewayDemo";
const TABLE = "aigw_location";
const TABLE_SCHEMA = "aigw_Location";
const PRIMARY_NAME = "aigw_name";
const PRIMARY_SCHEMA = "aigw_Name";
const LOOKUP = "aigw_opportunitylocation";
const LOOKUP_SCHEMA = "aigw_OpportunityLocation";
const RELATIONSHIP = "aigw_location_opportunities";
const VIEW_NAME = "Location Lookup View - AI Demo";
const FORM_ID = "97a1555b-0903-408a-ac63-d63aed65b14a";
const PROTECTED_FORM_ID = "8db60b46-b976-f111-ab0e-00224817cb31";
const APP_ID = "916afe4b-607e-f111-ab0e-002248eb1915";
const BPF_ID = "7325b274-6b7c-f111-ab0e-70a8a50388b9";
const OLD_FIELD = "aigw_opportunityplace";
const LOOKUP_CLASS = "{270BD3DB-D9AF-4782-9025-509E298DEC0A}";

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const lower = (value) => String(value || "").toLowerCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const is404 = (error) => Number(error?.status) === 404;

function labels(english, chinese) {
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.Label",
    LocalizedLabels: [
      { "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: english, LanguageCode: 1033 },
      { "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: chinese, LanguageCode: 2052 },
    ],
  };
}

export function buildTablePayload() {
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
    SchemaName: TABLE_SCHEMA,
    DisplayName: labels("Location", "Location"),
    DisplayCollectionName: labels("Locations", "Locations"),
    OwnershipType: "OrganizationOwned",
    IsActivity: false,
    HasActivities: false,
    HasNotes: false,
    Attributes: [{
      "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
      AttributeType: "String",
      AttributeTypeName: { Value: "StringType" },
      SchemaName: PRIMARY_SCHEMA,
      DisplayName: labels("Name", "Name"),
      RequiredLevel: { Value: "ApplicationRequired", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
      MaxLength: 200,
      FormatName: { Value: "Text" },
      IsPrimaryName: true,
    }],
  };
}

export function buildRelationshipPayload() {
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
    SchemaName: RELATIONSHIP,
    ReferencedEntity: TABLE,
    ReferencingEntity: "opportunity",
    CascadeConfiguration: { Assign: "NoCascade", Delete: "Restrict", Merge: "NoCascade", Reparent: "NoCascade", Share: "NoCascade", Unshare: "NoCascade", RollupView: "NoCascade" },
    Lookup: {
      "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
      SchemaName: LOOKUP_SCHEMA,
      DisplayName: labels("Case Location (Location)", "案件场所（Location）"),
      RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
    },
  };
}

export function buildViewPayload(objectTypeCode) {
  const fetchxml = `<fetch version="1.0" mapping="logical"><entity name="${TABLE}"><attribute name="${PRIMARY_NAME}" /><filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter><order attribute="${PRIMARY_NAME}" descending="false" /></entity></fetch>`;
  const layoutxml = `<grid name="resultset" object="${objectTypeCode}" jump="${PRIMARY_NAME}" select="1" icon="1" preview="1"><row name="result" id="aigw_locationid"><cell name="${PRIMARY_NAME}" width="300" /></row></grid>`;
  return { name: VIEW_NAME, returnedtypecode: TABLE, querytype: 0, isquickfindquery: false, fetchxml, layoutxml };
}

function normalizeFetchXml(value) {
  return String(value || "").replace(/\s+savedqueryid="[^"]*"/i, "");
}

function attr(tag, name) {
  return new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag)?.[1] || "";
}

function controls(xml) {
  return [...String(xml).matchAll(/<control\b[^>]*?(?:\/>|>[\s\S]*?<\/control>)/gi)].map((match) => match[0]);
}

export function analyzeForm(formxml, formjson = "") {
  const bound = controls(formxml).map((control) => attr(control, "datafieldname")).filter(Boolean);
  return {
    hashes: { formxml: sha256(formxml), formjson: sha256(formjson) },
    tabs: [...String(formxml).matchAll(/<tab\b/gi)].length,
    sections: [...String(formxml).matchAll(/<section\b/gi)].length,
    controls: [...String(formxml).matchAll(/<control\b/gi)].length,
    uniqueFields: new Set(bound).size,
    oldFieldControls: bound.filter((item) => item === OLD_FIELD).length,
    lookupControls: bound.filter((item) => item === LOOKUP).length,
    timelineControls: controls(formxml).filter((item) => attr(item, "name") === "aigw_timeline_control" || attr(item, "id") === "notescontrol").length,
    oldTimelineControls: controls(formxml).filter((item) => /timeline/i.test(attr(item, "datafieldname"))).length,
    subgridControls: controls(formxml).filter((item) => attr(item, "id") === "aigw_actualmanagement_subgrid").length,
    polPodLookups: ["aigw_sealandpollookup", "aigw_sealandpodlookup", "aigw_airpollookup", "aigw_airpodlookup"].map((field) => bound.filter((item) => item === field).length),
    jsonHasLookup: new RegExp(`(?:DataFieldName|datafieldname)\\\"?[:=]\\\"${LOOKUP}\\\"`, "i").test(String(formjson || "")),
    jsonHasOldField: new RegExp(`(?:DataFieldName|datafieldname)\\\"?[:=]\\\"${OLD_FIELD}\\\"`, "i").test(String(formjson || "")),
  };
}

export function patchLocationControl(formxml, viewId) {
  const tokens = controls(formxml).filter((control) => attr(control, "datafieldname") === OLD_FIELD);
  const existing = controls(formxml).filter((control) => attr(control, "datafieldname") === LOOKUP);
  if (tokens.length === 0 && existing.length === 1) return { formxml, changed: false, controlId: attr(existing[0], "id") };
  if (tokens.length !== 1 || existing.length) throw new Error(`Unsafe Location control state: old=${tokens.length}, new=${existing.length}.`);
  const original = tokens[0];
  const opening = /^<control\b[^>]*>/i.exec(original)?.[0] || original;
  let next = opening.replace(/\bdatafieldname="[^"]*"/i, `datafieldname="${LOOKUP}"`);
  next = /\bclassid="[^"]*"/i.test(next) ? next.replace(/\bclassid="[^"]*"/i, `classid="${LOOKUP_CLASS}"`) : next.replace(/>$/, ` classid="${LOOKUP_CLASS}">`);
  next = next.replace(/\s*\/>$/i, "").replace(/>$/i, "");
  const parameters = `<parameters><ViewId>{${String(viewId).toUpperCase()}}</ViewId><ViewIds>{${String(viewId).toUpperCase()}}</ViewIds></parameters>`;
  return { formxml: String(formxml).replace(original, `${next}>${parameters}</control>`), changed: true, controlId: attr(original, "id") };
}

function assertFormGate(analysis) {
  if (analysis.tabs !== 5 || analysis.sections !== 19 || analysis.controls !== 115 || analysis.uniqueFields !== 106 || analysis.lookupControls !== 1 || analysis.oldFieldControls !== 0 || analysis.timelineControls !== 1 || analysis.oldTimelineControls !== 0 || analysis.subgridControls !== 1 || analysis.polPodLookups.some((count) => count !== 1)) {
    throw new Error(`Full Replica structure gate failed: ${JSON.stringify(analysis)}`);
  }
}

export async function main({ argv = process.argv.slice(2), env = process.env } = {}) {
  const apply = argv.includes("--apply");
  if (apply) assertDataverseScriptGate({ mode: "publish/deploy-capable" });
  const dataverseUrl = new URL(getDataverseUrl(env));
  if (dataverseUrl.protocol !== "https:" || lower(dataverseUrl.hostname) !== HOST || dataverseUrl.pathname !== "/") throw new Error("Only the approved test organization is allowed.");
  const client = createDynamicsClient({ env });
  if (lower(new URL(client.config.dataverseUrl).hostname) !== HOST) throw new Error("Dataverse client host mismatch.");
  const audit = { phase: "1C-5R2E-2F2A", mode: apply ? "apply" : "dry-run", requestCounts: { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, businessWrites: 0, productionRequests: 0 }, created: {}, skipped: {}, status: "running" };
  const request = async (method, endpoint, body, headers = {}) => {
    if (lower(new URL(client.config.dataverseUrl).hostname) !== HOST) { audit.requestCounts.productionRequests += 1; throw new Error("Production request blocked."); }
    audit.requestCounts[method] += 1;
    if (method === "GET") return client.dataverseGet(endpoint);
    if (method === "POST") return client.dataversePost(endpoint, body, { headers });
    if (method === "PATCH") return client.dataversePatch(endpoint, body, { headers });
    throw new Error(`Unsupported method ${method}.`);
  };
  const get = async (endpoint) => (await request("GET", endpoint)).body;
  const maybe = async (endpoint) => { try { return await get(endpoint); } catch (error) { if (is404(error)) return null; throw error; } };
  const post = (endpoint, body) => request("POST", endpoint, body, { "MSCRM.SolutionUniqueName": SOLUTION });
  const patch = (endpoint, body) => request("PATCH", endpoint, body, { "MSCRM.SolutionUniqueName": SOLUTION });
  const outputDir = path.join(process.cwd(), "local-artifacts", "d365", "location-schema", `phase1c5r2e2f2_${new Date().toISOString().replace(/[-:.]/g, "")}`);
  await fs.mkdir(outputDir, { recursive: true });
  const persist = () => fs.writeFile(path.join(outputDir, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`);

  const solutions = await get(`/api/data/v9.2/solutions?$select=solutionid,uniquename,friendlyname,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`);
  if (solutions.value?.length !== 1 || solutions.value[0].friendlyname !== "CRM AI Gateway Demo" || solutions.value[0].ismanaged !== false) throw new Error("Solution gate failed.");
  const solution = solutions.value[0];
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Publisher prefix gate failed.");

  const unpublishedEndpoint = `/api/data/v9.2/systemforms(${FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,formxml,formjson,formactivationstate,isdefault`;
  const fullBefore = await get(unpublishedEndpoint);
  const protectedBefore = await get(`/api/data/v9.2/systemforms(${PROTECTED_FORM_ID})?$select=formid,name,formxml,formjson`);
  const beforeAnalysis = analyzeForm(fullBefore.formxml, fullBefore.formjson);
  const sourceBinding = beforeAnalysis.oldFieldControls === 1 && beforeAnalysis.lookupControls === 0;
  const targetBinding = beforeAnalysis.oldFieldControls === 0 && beforeAnalysis.lookupControls === 1;
  if (fullBefore.name !== "AI Gateway Opportunity Demo - Full Replica" || fullBefore.formactivationstate !== 1 || fullBefore.isdefault !== false || beforeAnalysis.tabs !== 5 || beforeAnalysis.sections !== 19 || beforeAnalysis.controls !== 115 || beforeAnalysis.uniqueFields !== 106 || (!sourceBinding && !targetBinding) || beforeAnalysis.timelineControls !== 1) throw new Error(`Full Replica preflight failed: ${JSON.stringify(beforeAnalysis)}`);
  const oldAttribute = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='${OLD_FIELD}')?$select=LogicalName,AttributeType,IsManaged`);
  if (oldAttribute.AttributeType !== "String") throw new Error("Old opportunity place column is not String.");
  const bpf = await get(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,name,statecode,statuscode`);
  if (bpf.statecode !== 0 || bpf.statuscode !== 1) throw new Error("BPF must remain Draft/Inactive.");
  const assemblies = await get("/api/data/v9.2/pluginassemblies?$select=pluginassemblyid,name&$filter=name eq 'CrmAiGateway.ActualTotals.Plugin'");
  if (assemblies.value?.length !== 1) throw new Error("Plugin Assembly protection gate failed.");
  const pluginTypes = await get(`/api/data/v9.2/plugintypes?$select=plugintypeid&$filter=_pluginassemblyid_value eq ${assemblies.value[0].pluginassemblyid}`);
  if (pluginTypes.value?.length !== 3) throw new Error("Plugin Type protection gate failed.");
  const typeFilter = pluginTypes.value.map((item) => `_eventhandler_value eq ${item.plugintypeid}`).join(" or ");
  const pluginSteps = await get(`/api/data/v9.2/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,statecode,statuscode&$filter=${typeFilter}`);
  const enabledSteps = (pluginSteps.value || []).filter((row) => row.statecode === 0);
  const disabledSteps = (pluginSteps.value || []).filter((row) => row.statecode !== 0);
  if (pluginSteps.value?.length !== 7 || enabledSteps.length !== 7 || disabledSteps.length !== 0) throw new Error("Plugin 7/0 protection gate failed.");
  const polPod = await get("/api/data/v9.2/EntityDefinitions(LogicalName='aigw_polpodlocation')?$select=MetadataId,LogicalName");
  const app = await get(`/api/data/v9.2/appmodules(${APP_ID})?$select=appmoduleid,name,uniquename,ismanaged`);
  if (app.ismanaged === true) throw new Error("Modern App is unexpectedly managed.");

  let entity = await maybe(`/api/data/v9.2/EntityDefinitions(LogicalName='${TABLE}')?$select=MetadataId,LogicalName,SchemaName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,ObjectTypeCode,OwnershipType,IsManaged`);
  const existingLookup = await maybe(`/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='${LOOKUP}')/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,AttributeType,Targets,RequiredLevel,IsManaged`);
  const relationships = await get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/ManyToOneRelationships?$select=MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,CascadeConfiguration,IsManaged");
  let relationship = (relationships.value || []).find((item) => lower(item.SchemaName) === RELATIONSHIP);
  const viewsBefore = entity ? await get(`/api/data/v9.2/savedqueries?$select=savedqueryid,name,returnedtypecode,querytype,fetchxml,layoutxml,statecode,statuscode,ismanaged&$filter=returnedtypecode eq '${TABLE}' and name eq '${VIEW_NAME}'`) : { value: [] };
  if (!apply) {
    audit.preflight = { solution, publisherPrefix: publisher.customizationprefix, entityExists: Boolean(entity), lookupExists: Boolean(existingLookup), relationshipExists: Boolean(relationship), viewCount: viewsBefore.value?.length || 0, fullReplica: beforeAnalysis, protectedHashes: { formxml: sha256(protectedBefore.formxml), formjson: sha256(protectedBefore.formjson) }, bpf, polPod, app, oldAttribute };
    audit.status = entity || existingLookup || relationship || viewsBefore.value?.length ? "dry_run_existing_components_require_exact_reconciliation" : "dry_run_ready";
    await persist();
    console.log(JSON.stringify({ status: audit.status, preflight: audit.preflight, requestCounts: audit.requestCounts, auditDir: path.relative(process.cwd(), outputDir) }, null, 2));
    return audit;
  }

  if (!entity) {
    await post("/api/data/v9.2/EntityDefinitions", buildTablePayload());
    audit.created.table = true;
    for (let attempt = 0; attempt < 12 && !entity; attempt += 1) { await sleep(attempt ? 1500 : 500); entity = await maybe(`/api/data/v9.2/EntityDefinitions(LogicalName='${TABLE}')?$select=MetadataId,LogicalName,SchemaName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,ObjectTypeCode,OwnershipType,IsManaged`); }
  }
  if (!entity || entity.SchemaName !== TABLE_SCHEMA || entity.OwnershipType !== "OrganizationOwned" || entity.PrimaryNameAttribute !== PRIMARY_NAME || !entity.EntitySetName || !entity.PrimaryIdAttribute || entity.IsManaged === true) throw new Error("Location table definition mismatch.");
  const primary = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TABLE}')/Attributes(LogicalName='${PRIMARY_NAME}')/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,MaxLength,RequiredLevel,IsValidForCreate,IsValidForRead,IsManaged`);
  if (primary.SchemaName !== PRIMARY_SCHEMA || primary.MaxLength !== 200 || primary.RequiredLevel?.Value !== "ApplicationRequired" || primary.IsValidForCreate !== true || primary.IsValidForRead !== true || primary.IsManaged === true) throw new Error("Location primary name definition mismatch.");

  let lookup = existingLookup;
  if (!lookup) {
    if (relationship) throw new Error("Relationship name exists without expected Lookup.");
    await post("/api/data/v9.2/RelationshipDefinitions", buildRelationshipPayload());
    audit.created.relationship = true;
    for (let attempt = 0; attempt < 12 && !lookup; attempt += 1) { await sleep(attempt ? 1200 : 500); lookup = await maybe(`/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='${LOOKUP}')/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,AttributeType,Targets,RequiredLevel,IsManaged`); }
    const afterRelations = await get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/ManyToOneRelationships?$select=MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,CascadeConfiguration,IsManaged");
    relationship = (afterRelations.value || []).find((item) => lower(item.SchemaName) === RELATIONSHIP);
  }
  if (!lookup || lookup.SchemaName !== LOOKUP_SCHEMA || lookup.AttributeType !== "Lookup" || lookup.RequiredLevel?.Value !== "None" || !lookup.Targets?.includes(TABLE) || lookup.IsManaged === true || !relationship || relationship.ReferencedEntity !== TABLE || relationship.ReferencingEntity !== "opportunity" || relationship.ReferencingAttribute !== LOOKUP || relationship.CascadeConfiguration?.Delete !== "Restrict") throw new Error("Location Lookup/relationship definition mismatch.");

  let views = await get(`/api/data/v9.2/savedqueries?$select=savedqueryid,name,returnedtypecode,querytype,fetchxml,layoutxml,statecode,statuscode,ismanaged&$filter=returnedtypecode eq '${TABLE}' and name eq '${VIEW_NAME}'`);
  if ((views.value || []).length > 1) throw new Error("Duplicate Location lookup views exist.");
  let view = views.value?.[0];
  const expectedView = buildViewPayload(entity.ObjectTypeCode);
  if (!view) {
    await post("/api/data/v9.2/savedqueries", expectedView);
    audit.created.view = true;
    views = await get(`/api/data/v9.2/savedqueries?$select=savedqueryid,name,returnedtypecode,querytype,fetchxml,layoutxml,statecode,statuscode,ismanaged&$filter=returnedtypecode eq '${TABLE}' and name eq '${VIEW_NAME}'`);
    view = views.value?.[0];
  }
  if (!view || view.statecode !== 0 || view.statuscode !== 1 || view.ismanaged === true || normalizeFetchXml(view.fetchxml) !== normalizeFetchXml(expectedView.fetchxml) || view.layoutxml !== expectedView.layoutxml) throw new Error("Location lookup view definition mismatch.");

  const draft = patchLocationControl(fullBefore.formxml, view.savedqueryid);
  const draftAnalysis = analyzeForm(draft.formxml, fullBefore.formjson);
  assertFormGate(draftAnalysis);
  if (draft.changed) { await patch(`/api/data/v9.2/systemforms(${FORM_ID})`, { formxml: draft.formxml }); audit.created.formPatched = true; }
  const fullAfterPatch = await get(unpublishedEndpoint);
  const afterPatchAnalysis = analyzeForm(fullAfterPatch.formxml, fullAfterPatch.formjson);
  assertFormGate(afterPatchAnalysis);
  if (!afterPatchAnalysis.jsonHasLookup || afterPatchAnalysis.jsonHasOldField) throw new Error("FormJSON did not synchronize with the Location Lookup replacement.");

  const publish = async (entityName) => { audit.requestCounts.POST += 1; audit.requestCounts.Publish += 1; return client.dataversePost("/api/data/v9.2/PublishXml", { ParameterXml: `<importexportxml><entities><entity>${entityName}</entity></entities></importexportxml>` }); };
  await publish(TABLE);
  await publish("opportunity");
  const published = await get(`/api/data/v9.2/systemforms(${FORM_ID})?$select=formid,name,formxml,formjson,formactivationstate,isdefault`);
  const publishedAnalysis = analyzeForm(published.formxml, published.formjson);
  assertFormGate(publishedAnalysis);
  const protectedAfter = await get(`/api/data/v9.2/systemforms(${PROTECTED_FORM_ID})?$select=formid,name,formxml,formjson`);
  if (sha256(protectedBefore.formxml) !== sha256(protectedAfter.formxml) || sha256(protectedBefore.formjson) !== sha256(protectedAfter.formjson)) throw new Error("Protected Form changed.");
  audit.schema = { entity, primary, lookup, relationship, view };
  audit.form = { before: beforeAnalysis, afterPatch: afterPatchAnalysis, published: publishedAnalysis, protectedBefore: { formxml: sha256(protectedBefore.formxml), formjson: sha256(protectedBefore.formjson) }, protectedAfter: { formxml: sha256(protectedAfter.formxml), formjson: sha256(protectedAfter.formjson) } };
  audit.protection = { bpfDraftInactive: true, polPodUnchanged: polPod.LogicalName === "aigw_polpodlocation", appModified: false, opportunityBusinessWrites: 0 };
  audit.status = "server_side_schema_ready_runtime_pending";
  await persist();
  console.log(JSON.stringify({ status: audit.status, schema: audit.schema, form: audit.form, protection: audit.protection, requestCounts: audit.requestCounts, auditDir: path.relative(process.cwd(), outputDir) }, null, 2));
  return audit;
}

runDataverseCli(import.meta.url, main);
