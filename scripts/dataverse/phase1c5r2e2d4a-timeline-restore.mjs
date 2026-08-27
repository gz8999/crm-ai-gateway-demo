import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, runDataverseCli } from "./lib/environment-safety.mjs";

const TARGET_HOSTNAME = ["org91f5f65f", "crm5", "dynamics", "com"].join(".");
const PRODUCTION_HOSTNAME = ["lcn-crm", "crm7", "dynamics", "com"].join(".");
const AUTHORIZATION = "CONFIRM_D365_TEST_WRITE_PHASE_1C_5R2E_2D4A_TIMELINE";
const FORM_ID = "97a1555b-0903-408a-ac63-d63aed65b14a";
const PROTECTED_FORM_ID = "8db60b46-b976-f111-ab0e-00224817cb31";
const TIMELINE_SECTION = "aigw_fr_summary_timeline";
const TIMELINE_SECTION_ID = "37D6B806-1B03-5A0A-A7F8-F263E755EB11";
const TIMELINE_CONTROL_ID = "aigw_timeline_control";
const TIMELINE_CONTROL_GUID = "a4e2d7c1-1f64-4c9a-8b73-5e0d2f6a914c";
const TIMELINE_CLASS_ID = "06375649-C143-495E-A496-C962E5B4488E";
const BPF_ID = "7325b274-6b7c-f111-ab0e-70a8a50388b9";
const MODERN_APP_ID = "916afe4b-607e-f111-ab0e-002248eb1915";
const POLPOD_FIELDS = ["aigw_sealandpollookup", "aigw_sealandpodlookup", "aigw_airpollookup", "aigw_airpodlookup"];

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const normalizeId = (value) => String(value || "").replace(/[{}]/g, "").toLowerCase();
const getAttr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag)?.[1] || "";
const startTag = (xml) => /^<[^>]+>/i.exec(String(xml || ""))?.[0] || "";

function controlTokens(xml) {
  return [...String(xml || "").matchAll(/<control\b[^>]*?(?:\/>|>[\s\S]*?<\/control>)/gi)].map((match) => match[0]);
}

function sectionToken(xml, name) {
  return [...String(xml || "").matchAll(/<section\b[^>]*?(?:\/>|>[\s\S]*?<\/section>)/gi)]
    .map((match) => match[0])
    .find((section) => getAttr(startTag(section), "name") === name) || "";
}

function buildTimelineControl() {
  return `<row><cell id="{${TIMELINE_CONTROL_GUID}}" colspan="1" rowspan="20" showlabel="false" locklevel="0"><control id="${TIMELINE_CONTROL_ID}" classid="{${TIMELINE_CLASS_ID}}" disabled="false" uniqueid="{${TIMELINE_CONTROL_GUID}}"><parameters><UClientUniqueName>Timeline</UClientUniqueName><UClientModules>Activities,Notes,Posts</UClientModules><UClientDefaultModuleForCreateExperience>Notes</UClientDefaultModuleForCreateExperience><UClientShowFilterPane>true</UClientShowFilterPane><UClientExpandFilterPane>false</UClientExpandFilterPane><UClientOrderBy>descending</UClientOrderBy><UClientRecordPerPage>10</UClientRecordPerPage><UClientEnableWhatsNewFilter>false</UClientEnableWhatsNewFilter><UClientActivities>appointment,campaignactivity,campaignresponse,email,fax,incidentresolution,letter,opportunityclose,orderclose,phonecall,quoteclose,recurringappointmentmaster,socialactivity,task</UClientActivities><UClientSortActivitiesByValue>modifiedon</UClientSortActivitiesByValue><UClientDisplayActivityHeaderUsing>defaultformat</UClientDisplayActivityHeaderUsing><UClientCreateActivityUsing>quickcreateform</UClientCreateActivityUsing><UClientDisplayActivityUsing>cardform</UClientDisplayActivityUsing><UClientActivityCardMap>appointment:4201:,campaignactivity:4402:,campaignresponse:4401:,incidentresolution:4206:,email:4202:,fax:4204:,letter:4207:,opportunityclose:4208:,phonecall:4210:,task:4212:,msfp_alert:10261:,msfp_surveyinvite:10271:,msfp_surveyresponse:10273:</UClientActivityCardMap><DefaultTabId>ActivitiesTab</DefaultTabId><OrderByActivityWall>descending</OrderByActivityWall><SortActivityWall>modifiedon</SortActivityWall><EmailConversationView>true</EmailConversationView><ShowArticleTab>false</ShowArticleTab><SelectDefaultLanguage>00000000-0000-0000-0000-000000000000</SelectDefaultLanguage></parameters></control></cell></row>`;
}

export function analyzeTimelineFormXml(formXml, formJson = "") {
  const xml = String(formXml || "");
  const tabs = [...xml.matchAll(/<tab\b/g)].length;
  const sections = [...xml.matchAll(/<section\b/g)].length;
  const controls = controlTokens(xml);
  const section = sectionToken(xml, TIMELINE_SECTION);
  const targetSectionId = getAttr(startTag(section), "id");
  const timelineControls = controls.filter((control) => new RegExp(`\\bclassid="\\{${TIMELINE_CLASS_ID}\\}"`, "i").test(control));
  const boundFields = [...xml.matchAll(/<control\b[^>]*\bdatafieldname="([^"]+)"/gi)].map((match) => match[1]);
  return {
    formXmlHash: sha256(xml),
    formJsonHash: sha256(formJson),
    counts: { tabs, sections, controls: controls.length, uniqueBoundFields: new Set(boundFields).size },
    timelineSection: { found: Boolean(section), id: targetSectionId, expectedId: `{${TIMELINE_SECTION_ID}}`, controls: section ? controlTokens(section).length : 0, hasRows: /<rows\b[^>]*>\s*<row\b/i.test(section), visible: Boolean(section) && !/\bvisible="false"|\bshowlabel="false"/i.test(startTag(section)) },
    timelineControls: timelineControls.map((control) => ({ id: getAttr(startTag(control), "id"), uniqueid: getAttr(startTag(control), "uniqueid"), classid: getAttr(startTag(control), "classid"), hasActivities: /<UClientModules>Activities,Notes,Posts<\/UClientModules>/i.test(control), activities: /<UClientActivities>[^<]+<\/UClientActivities>/i.test(control) })),
    polpodControls: Object.fromEntries(POLPOD_FIELDS.map((field) => [field, boundFields.filter((value) => value === field).length])),
    hasUndefined: /undefined/i.test(xml) || /undefined/i.test(String(formJson || "")),
  };
}

export function formJsonHasTimeline(formJson) {
  const text = String(formJson || "");
  return [TIMELINE_CONTROL_GUID, TIMELINE_CONTROL_ID, TIMELINE_CLASS_ID]
    .every((token) => text.toLowerCase().includes(token.toLowerCase()));
}

function isTimelineApplied(analysis, formJson) {
  const control = analysis.timelineControls[0];
  return analysis.counts.tabs === 5
    && analysis.counts.sections === 19
    && analysis.counts.controls === 115
    && analysis.timelineSection.controls === 1
    && analysis.timelineControls.length === 1
    && control?.id === TIMELINE_CONTROL_ID
    && normalizeId(control.uniqueid) === normalizeId(TIMELINE_CONTROL_GUID)
    && normalizeId(control.classid) === normalizeId(TIMELINE_CLASS_ID)
    && control.hasActivities
    && control.activities
    && formJsonHasTimeline(formJson)
    && !analysis.hasUndefined;
}

export function patchTimelineFormXml(formXml) {
  const before = analyzeTimelineFormXml(formXml);
  if (!before.timelineSection.found) throw new Error(`Target Timeline section ${TIMELINE_SECTION} was not found.`);
  if (normalizeId(before.timelineSection.id) !== normalizeId(TIMELINE_SECTION_ID)) throw new Error("Timeline section ID mismatch; refusing to write.");
  if (before.timelineSection.controls !== 0) throw new Error("Timeline section is not empty; refusing to overwrite existing controls.");
  if (before.timelineControls.length !== 0) throw new Error("A Timeline control already exists elsewhere; refusing to create a duplicate.");
  if (Object.values(before.polpodControls).some((count) => count !== 1)) throw new Error("POL/POD control invariant failed; refusing to modify the form.");
  const section = sectionToken(formXml, TIMELINE_SECTION);
  const rowsMatch = /<rows\s*\/\s*>/i.exec(section) || /<rows\s*>\s*<\/rows\s*>/i.exec(section);
  if (!rowsMatch) throw new Error("Timeline section rows are not empty; refusing to replace layout content.");
  const replacement = section.replace(rowsMatch[0], `<rows>${buildTimelineControl()}</rows>`);
  const patched = String(formXml).replace(section, replacement);
  const after = analyzeTimelineFormXml(patched);
  if (after.timelineSection.controls !== 1 || after.timelineControls.length !== 1 || after.timelineControls[0].id !== TIMELINE_CONTROL_ID || normalizeId(after.timelineControls[0].uniqueid) !== normalizeId(TIMELINE_CONTROL_GUID) || !after.timelineControls[0].hasActivities || !after.timelineControls[0].activities) throw new Error("Generated Timeline control failed local validation.");
  if (after.counts.controls !== before.counts.controls + 1 || after.counts.tabs !== before.counts.tabs || after.counts.sections !== before.counts.sections || JSON.stringify(after.polpodControls) !== JSON.stringify(before.polpodControls)) throw new Error("Form structure changed outside the new Timeline control.");
  return { formXml: patched, before, after };
}

export async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes("--confirm") && args.includes(AUTHORIZATION);
  const safety = assertDataverseScriptGate({ mode: "publish/deploy-capable" });
  if (!confirmed) throw new Error(`Explicit --confirm ${AUTHORIZATION} is required.`);
  if (safety.dataverseUrl !== `https://${TARGET_HOSTNAME}` || new URL(safety.dataverseUrl).hostname === PRODUCTION_HOSTNAME) throw new Error("Safety gate failed: only the approved test environment is allowed.");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || String(process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("AI safety gate failed: provider must be demo and external AI disabled.");

  const client = createDynamicsClient();
  const get = async (uri) => (await client.dataverseGet(uri)).body;
  const auditDir = path.join(process.cwd(), "local-artifacts", "d365", "plugin-registration");
  const backupDir = path.join(process.cwd(), "backups", "dataverse", `phase1c5r2e2d4a_timeline_restore_${stamp()}`);
  await fs.mkdir(auditDir, { recursive: true });
  await fs.mkdir(backupDir, { recursive: true });
  const auditPath = path.join(auditDir, "phase1c5r2e2d4a-timeline-restore.json");
  const audit = { phase: "1C-5R2E-2D4A", target: { hostname: TARGET_HOSTNAME, formId: FORM_ID, protectedFormId: PROTECTED_FORM_ID, section: TIMELINE_SECTION, sectionId: TIMELINE_SECTION_ID, controlId: TIMELINE_CONTROL_ID, controlGuid: TIMELINE_CONTROL_GUID }, requestCounts: { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, businessWrites: 0, productionRequests: 0 }, browser: { status: "not-run", reason: "Browser validation is performed separately after server-side publish." } };
  const read = async (uri) => { audit.requestCounts.GET += 1; return get(uri); };
  const formUri = `/api/data/v9.2/systemforms(${FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,formxml,formjson,formactivationstate,isdefault,componentstate,versionnumber`;
  const protectedUri = `/api/data/v9.2/systemforms(${PROTECTED_FORM_ID})?$select=formid,name,formxml,formjson,formactivationstate,isdefault,componentstate,versionnumber`;
  const [fullBefore, protectedBefore, bpfBefore, appBefore] = await Promise.all([
    read(formUri),
    read(protectedUri),
    read(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,name,statecode,statuscode,category,primaryentity,modifiedon`),
    read(`/api/data/v9.2/appmodules(${MODERN_APP_ID})?$select=appmoduleid,name,uniquename,modifiedon,componentstate`),
  ]);
  const before = analyzeTimelineFormXml(fullBefore.formxml, fullBefore.formjson);
  const protectedBeforeHash = { formXml: sha256(protectedBefore.formxml), formJson: sha256(protectedBefore.formjson) };
  const timelineAlreadyApplied = isTimelineApplied(before, fullBefore.formjson);
  const emptyTimelineBaseline = before.counts.controls === 114 && before.timelineSection.controls === 0 && before.timelineControls.length === 0;
  if (fullBefore.formactivationstate !== 1 || fullBefore.isdefault !== false || before.counts.tabs !== 5 || before.counts.sections !== 19 || before.hasUndefined || (!emptyTimelineBaseline && !timelineAlreadyApplied)) throw new Error("Full Replica preflight gate failed.");
  if (before.timelineSection.visible !== true || before.timelineSection.id.toLowerCase() !== `{${TIMELINE_SECTION_ID.toLowerCase()}}`) throw new Error("Timeline section visibility or ID preflight gate failed.");
  if (normalizeId(protectedBefore.formid) === normalizeId(FORM_ID)) throw new Error("Protected and Full Replica form IDs unexpectedly match.");
  await fs.writeFile(path.join(backupDir, "full-replica-formxml-before.xml"), fullBefore.formxml, "utf8");
  await fs.writeFile(path.join(backupDir, "protected-formxml-before.xml"), protectedBefore.formxml, "utf8");
  const patched = timelineAlreadyApplied
    ? { formXml: fullBefore.formxml, before, after: before }
    : patchTimelineFormXml(fullBefore.formxml);
  audit.preflight = { fullReplica: { state: { formactivationstate: fullBefore.formactivationstate, isdefault: fullBefore.isdefault, componentstate: fullBefore.componentstate }, before }, protectedForm: { hashes: protectedBeforeHash, state: { formactivationstate: protectedBefore.formactivationstate, isdefault: protectedBefore.isdefault, componentstate: protectedBefore.componentstate } }, bpf: bpfBefore, app: appBefore, patch: { formXmlHash: patched.after.formXmlHash, patchSkippedAlreadyApplied: timelineAlreadyApplied, formJsonSynchronized: formJsonHasTimeline(fullBefore.formjson), sectionIdPreserved: true, protectedFormNotTouched: true, polpodControlsPreserved: true } };
  let fullAfterPatch = fullBefore;
  if (!timelineAlreadyApplied) {
    audit.requestCounts.PATCH += 1;
    await client.dataversePatch(`/api/data/v9.2/systemforms(${FORM_ID})`, { formxml: patched.formXml });
    fullAfterPatch = await read(formUri);
  }
  const afterPatch = analyzeTimelineFormXml(fullAfterPatch.formxml, fullAfterPatch.formjson);
  const formJsonSynchronized = formJsonHasTimeline(fullAfterPatch.formjson);
  if (!isTimelineApplied(afterPatch, fullAfterPatch.formjson) || !formJsonSynchronized) throw new Error("Post-PATCH Form validation failed; PublishXml was not sent.");
  audit.afterPatch = { hashes: { formXml: afterPatch.formXmlHash, formJson: afterPatch.formJsonHash }, analysis: afterPatch, formJsonSynchronized, patchSkippedAlreadyApplied: timelineAlreadyApplied };
  audit.requestCounts.POST += 1;
  audit.requestCounts.Publish += 1;
  const publishResponse = await client.dataversePost("/api/data/v9.2/PublishXml", { ParameterXml: "<importexportxml><entities><entity>opportunity</entity></entities></importexportxml>" });
  audit.publish = { status: publishResponse.status, scope: "opportunity", targeted: true };
  const [publishedFull, unpublishedFull, protectedAfter, bpfAfter, appAfter] = await Promise.all([
    read(`/api/data/v9.2/systemforms(${FORM_ID})?$select=formid,name,formxml,formjson,formactivationstate,isdefault,componentstate,versionnumber`),
    read(formUri),
    read(protectedUri),
    read(`/api/data/v9.2/workflows(${BPF_ID})?$select=workflowid,name,statecode,statuscode,category,primaryentity,modifiedon`),
    read(`/api/data/v9.2/appmodules(${MODERN_APP_ID})?$select=appmoduleid,name,uniquename,modifiedon,componentstate`),
  ]);
  const publishedAnalysis = analyzeTimelineFormXml(publishedFull.formxml, publishedFull.formjson);
  const unpublishedAnalysis = analyzeTimelineFormXml(unpublishedFull.formxml, unpublishedFull.formjson);
  const protectedAfterHash = { formXml: sha256(protectedAfter.formxml), formJson: sha256(protectedAfter.formjson) };
  audit.afterPublish = { published: { state: { formactivationstate: publishedFull.formactivationstate, isdefault: publishedFull.isdefault, componentstate: publishedFull.componentstate }, analysis: publishedAnalysis }, unpublished: { state: { formactivationstate: unpublishedFull.formactivationstate, isdefault: unpublishedFull.isdefault, componentstate: unpublishedFull.componentstate }, analysis: unpublishedAnalysis }, protectedForm: { before: protectedBeforeHash, after: protectedAfterHash, unchanged: JSON.stringify(protectedBeforeHash) === JSON.stringify(protectedAfterHash) }, bpfUnchanged: JSON.stringify({ name: bpfBefore.name, statecode: bpfBefore.statecode, statuscode: bpfBefore.statuscode, modifiedon: bpfBefore.modifiedon }) === JSON.stringify({ name: bpfAfter.name, statecode: bpfAfter.statecode, statuscode: bpfAfter.statuscode, modifiedon: bpfAfter.modifiedon }), appUnchanged: JSON.stringify({ name: appBefore.name, uniquename: appBefore.uniquename, modifiedon: appBefore.modifiedon, componentstate: appBefore.componentstate }) === JSON.stringify({ name: appAfter.name, uniquename: appAfter.uniquename, modifiedon: appAfter.modifiedon, componentstate: appAfter.componentstate }) };
  audit.ready = publishedFull.formactivationstate === 1 && publishedFull.isdefault === false && publishedAnalysis.timelineControls.length === 1 && publishedAnalysis.counts.tabs === 5 && publishedAnalysis.counts.sections === 19 && publishedAnalysis.counts.controls === 115 && audit.afterPublish.protectedForm.unchanged && audit.afterPublish.bpfUnchanged && audit.afterPublish.appUnchanged;
  audit.rollback = { method: "Restore the exact pre-PATCH Full Replica formxml from the local backup under a separately authorized PATCH, then re-read before any publish.", backupDir: path.relative(process.cwd(), backupDir), requiresSeparateAuthorization: true };
  await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), "utf8");
  console.log(JSON.stringify(audit, null, 2));
  if (!audit.ready) throw new Error("Timeline restore post-publish verification failed.");
}

runDataverseCli(import.meta.url, main);
