import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION = "CRMAIGatewayDemo";
let FORM_ID;
const FORM_NAME = "AI Gateway Opportunity Demo - Full Replica";
const TARGET_FIELDS = [
  "parentaccountid", "aigw_organizationgroup_choice", "aigw_bookingdepartment_choice", "aigw_opportunitytype", "aigw_casestage", "aigw_salesdepartment_choice", "aigw_opportunitydetailtype", "aigw_startdate", "aigw_opportunityplace", "description", "aigw_opportunitylist_bool",
  "aigw_budgetstatus", "aigw_researchbackground_choice", "aigw_decider_choice", "aigw_customerneed_choice", "aigw_proposalcontent_choice",
  "aigw_globalinitiative", "aigw_alpscooperation", "aigw_goodshandled", "aigw_projectsize", "aigw_projectsizeunit", "aigw_warehousescale", "aigw_transportmode", "aigw_spotcontinuous", "aigw_sealandpol", "aigw_sealandpod", "aigw_airpol", "aigw_airpod", "estimatedclosedate", "aigw_winprobabilityrank",
];
const EXPECTED_RULES = [
  "AI Gateway Full Replica - Required - Opportunity",
  "AI Gateway Full Replica - Required - Summary",
  "AI Gateway Full Replica - Required - Details",
];

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const sha256 = (value) => createHash("sha256").update(String(value || "")).digest("hex");
const labelFor = (metadata, lcid) => metadata?.DisplayName?.LocalizedLabels?.find((item) => item.LanguageCode === lcid)?.Label || "";
const csvValue = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const toCsv = (rows, keys) => `${keys.join(",")}\n${rows.map((row) => keys.map((key) => csvValue(Array.isArray(row[key]) ? row[key].join(" | ") : row[key])).join(",")).join("\n")}\n`;
const formFields = (xml) => new Set([...String(xml || "").matchAll(/<control\b[^>]*\bdatafieldname="([^"]+)"/g)].map((match) => match[1]));
function formControlLabels(xml) {
  const result = new Map();
  for (const match of String(xml || "").matchAll(/<cell\b[^>]*>([\s\S]*?)<\/cell>/g)) {
    const cell = match[1];
    const field = /<control\b[^>]*\bdatafieldname="([^"]+)"/.exec(cell)?.[1];
    if (!field) continue;
    const labels = Object.fromEntries([...cell.matchAll(/<label\b[^>]*\bdescription="([^"]*)"\s+languagecode="(\d+)"[^>]*\/>/g)].map((label) => [label[2], label[1]]));
    result.set(field, labels);
  }
  return result;
}

function parseKnownBindings(clientdata) {
  const text = String(clientdata || "");
  const patterns = [
    /attributes\.get\(['"]([^'"]+)['"]\)/g,
    /(?:dataFieldName|fieldName|attributeName|attribute)\s*[:=]\s*['"]([^'"]+)['"]/g,
    /["'](?:dataFieldName|fieldName|attributeName|attribute)["']\s*:\s*["']([^"']+)["']/g,
  ];
  const bindings = new Set();
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) bindings.add(match[1]);
  return [...bindings].sort();
}

function detectScope(clientdata) {
  const text = String(clientdata || "");
  const normalized = text.toLowerCase();
  return {
    specificFormReferenceFound: normalized.includes(FORM_ID),
    targetFormId: new RegExp(FORM_ID, "i").test(text) ? FORM_ID : null,
    scopeHint: /specific\s*form/i.test(text) ? "Specific Form" : null,
  };
}

function describeType(metadata) {
  if (!metadata) return "missing";
  return metadata.AttributeType || metadata.AttributeTypeName?.Value || "unknown";
}

function optionSetName(metadata) {
  return metadata?.OptionSet?.Name || metadata?.GlobalOptionSet?.Name || "";
}

export async function main() {
  EXPECTED_URL = getDataverseUrl();
  FORM_ID = getRequiredEnvironmentId("D365_FULL_REPLICA_FORM_ID");
  const root = process.cwd();
  const client = createDynamicsClient();
  const get = async (url) => (await client.dataverseGet(url)).body;

  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: unexpected Dataverse URL");
  if ((process.env.AI_PROVIDER || "demo") !== "demo") throw new Error("Safety gate failed: AI_PROVIDER must be demo");
  if ((process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: ALLOW_EXTERNAL_AI must be false");

  const [solutionResponse, form, attributeResponse, workflowResponse] = await Promise.all([
    get(`/api/data/v9.2/solutions?$select=friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
    get(`/api/data/v9.2/systemforms(${FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,isdefault,formactivationstate,formxml,formjson`),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=LogicalName,SchemaName,DisplayName,AttributeType,RequiredLevel,IsCustomAttribute,IsManaged"),
    get("/api/data/v9.2/workflows?$select=workflowid,name,uniquename,category,statecode,statuscode,ismanaged,clientdata,createdon,modifiedon&$filter=primaryentity eq 'opportunity' and category eq 2"),
  ]);

  const solution = solutionResponse.value?.[0];
  if (!solution || solution.friendlyname !== "CRM AI Gateway Demo" || solution.ismanaged !== false) throw new Error("Safety gate failed: expected unmanaged CRMAIGatewayDemo solution");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Safety gate failed: publisher prefix must be aigw");
  if (form.name !== FORM_NAME || form.isdefault !== false || form.formactivationstate !== 0) throw new Error("Safety gate failed: Full Replica form is not the protected inactive, non-default form");

  const attributes = attributeResponse.value || [];
  const metadataByLogicalName = new Map(attributes.map((item) => [item.LogicalName, item]));
  const choiceLogicalNames = TARGET_FIELDS.filter((logicalName) => ["Picklist", "State", "Status"].includes(metadataByLogicalName.get(logicalName)?.AttributeType));
  const choiceNames = new Map(await Promise.all(choiceLogicalNames.map(async (logicalName) => {
    const response = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='${logicalName}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Name)`);
    return [logicalName, response.OptionSet?.Name || ""];
  })));
  const fullReplicaFields = formFields(form.formxml);
  const controlLabels = formControlLabels(form.formxml);
  const displayNameIndex = new Map();
  for (const item of attributes) {
    for (const [locale, text] of [["1033", labelFor(item, 1033)], ["2052", labelFor(item, 2052)]]) {
      const key = `${locale}:${text.trim().toLocaleLowerCase()}`;
      if (!text.trim()) continue;
      displayNameIndex.set(key, [...(displayNameIndex.get(key) || []), item.LogicalName]);
    }
  }

  const rows = TARGET_FIELDS.map((logicalName) => {
    const metadata = metadataByLogicalName.get(logicalName);
    if (!metadata) throw new Error(`Target field missing from metadata: ${logicalName}`);
    const displayName1033 = labelFor(metadata, 1033);
    const displayName2052 = labelFor(metadata, 2052);
    const same1033 = (displayNameIndex.get(`1033:${displayName1033.trim().toLocaleLowerCase()}`) || []).filter((name) => name !== logicalName);
    const same2052 = (displayNameIndex.get(`2052:${displayName2052.trim().toLocaleLowerCase()}`) || []).filter((name) => name !== logicalName);
    const duplicateNames = [...new Set([...same1033, ...same2052])].sort();
    const identifiers = [`Logical name: ${logicalName}`, `Schema name: ${metadata.SchemaName || "(none)"}`];
    if (duplicateNames.length) identifiers.push(`Use schema/logical name to distinguish from: ${duplicateNames.join(", ")}`);
    return {
      logicalName,
      schemaName: metadata.SchemaName || "",
      displayName1033,
      displayName2052,
      attributeType: describeType(metadata),
      optionSetName: choiceNames.get(logicalName) || optionSetName(metadata),
      isCustomAttribute: Boolean(metadata.IsCustomAttribute),
      isManaged: Boolean(metadata.IsManaged),
      currentRequiredLevel: metadata.RequiredLevel?.Value || "",
      inFullReplicaForm: fullReplicaFields.has(logicalName),
      formControlLabel1033: controlLabels.get(logicalName)?.["1033"] || "",
      formControlLabel2052: controlLabels.get(logicalName)?.["2052"] || "",
      designerDisplayName: displayName2052 || displayName1033,
      hasDuplicateDisplayName: duplicateNames.length > 0,
      duplicateLogicalNames: duplicateNames,
      uniqueIdentification: identifiers.join("; "),
    };
  });

  const relevantRules = (workflowResponse.value || []).filter((rule) => EXPECTED_RULES.includes(rule.name) || rule.name.startsWith("AI Gateway Full Replica - Required"));
  const ruleAudit = relevantRules.map((rule) => ({
    workflowId: rule.workflowid,
    name: rule.name,
    uniqueName: rule.uniquename,
    statecode: rule.statecode,
    statuscode: rule.statuscode,
    isManaged: Boolean(rule.ismanaged),
    createdon: rule.createdon,
    modifiedon: rule.modifiedon,
    scope: detectScope(rule.clientdata),
    recognizedActionOrConditionFields: parseKnownBindings(rule.clientdata),
    clientdataHash: sha256(rule.clientdata),
  }));
  const visibleTwoActions = ruleAudit.flatMap((rule) => rule.recognizedActionOrConditionFields.map((logicalName) => ({ ruleName: rule.name, workflowId: rule.workflowId, logicalName }))).slice(0, 2);

  const organisationDuplicates = attributes.filter((item) => [labelFor(item, 1033), labelFor(item, 2052)].some((text) => /organization group|组织团体/i.test(text || ""))).map((item) => ({ logicalName: item.LogicalName, schemaName: item.SchemaName, displayName1033: labelFor(item, 1033), displayName2052: labelFor(item, 2052), type: describeType(item) }));
  const customerAttributes = attributes.filter((item) => [labelFor(item, 1033), labelFor(item, 2052)].some((text) => /customer|客户/i.test(text || ""))).map((item) => ({ logicalName: item.LogicalName, displayName1033: labelFor(item, 1033), displayName2052: labelFor(item, 2052), type: describeType(item) }));
  const nameMetadata = metadataByLogicalName.get("name");

  const report = {
    readOnly: true,
    generatedAt: new Date().toISOString(),
    safety: { dataverseUrl: EXPECTED_URL, solution: SOLUTION, publisherPrefix: publisher.customizationprefix, aiProvider: "demo", allowExternalAi: false, formId: FORM_ID, formName: FORM_NAME },
    fields: rows,
    collisionChecks: { organizationGroup: organisationDuplicates, customerCandidates: customerAttributes, name: { logicalName: "name", displayName1033: labelFor(nameMetadata, 1033), displayName2052: labelFor(nameMetadata, 2052), designerDisplayName: labelFor(nameMetadata, 2052) || labelFor(nameMetadata, 1033) } },
    currentDraftRules: { found: ruleAudit.length > 0, rules: ruleAudit, firstTwoRecognizedBindings: visibleTwoActions, note: ruleAudit.length ? "Bindings are only reported when recoverable from saved workflow clientdata. This audit never infers unsaved Designer selections." : "No saved matching draft Business Rule metadata exists. Unsaved Designer selections cannot be read through Dataverse." },
    recommendation: {
      selected: "B",
      reason: "Use Power Apps Business Rule Designer with this logical-name mapping. Dataverse exposes Business Rules as process metadata, but Microsoft documents authoring the Specific Form scope in the designer; constructing undocumented clientdata is not a stable or approved creation method.",
      nextStep: "Create the three rules manually as Draft/Inactive, then run a read-only M2-B3 validator against the saved workflow metadata.",
    },
  };

  const docsDir = path.join(root, "docs", "d365");
  const backupDir = path.join(root, "backups", "dataverse", `phase1b_m2b_business_rule_field_audit_${stamp()}`);
  await fs.mkdir(docsDir, { recursive: true });
  await fs.mkdir(backupDir, { recursive: true });
  const columns = ["logicalName", "schemaName", "displayName1033", "displayName2052", "attributeType", "optionSetName", "isCustomAttribute", "isManaged", "currentRequiredLevel", "inFullReplicaForm", "formControlLabel1033", "formControlLabel2052", "designerDisplayName", "hasDuplicateDisplayName", "duplicateLogicalNames", "uniqueIdentification"];
  await Promise.all([
    fs.writeFile(path.join(docsDir, "phase1b-m2b-business-rule-field-mapping.json"), JSON.stringify(report, null, 2)),
    fs.writeFile(path.join(docsDir, "phase1b-m2b-business-rule-field-mapping.csv"), toCsv(rows, columns)),
    fs.writeFile(path.join(backupDir, "01_full_replica_unpublished_formxml.xml"), form.formxml),
    fs.writeFile(path.join(backupDir, "02_full_replica_unpublished_formjson.json"), form.formjson),
    fs.writeFile(path.join(backupDir, "03_business_rule_field_mapping.json"), JSON.stringify(report, null, 2)),
  ]);
  console.log(JSON.stringify({ readOnly: true, fieldsAudited: rows.length, duplicateDisplayNameFields: rows.filter((row) => row.hasDuplicateDisplayName).map((row) => ({ logicalName: row.logicalName, duplicateLogicalNames: row.duplicateLogicalNames })), savedMatchingDraftRules: ruleAudit.length, firstTwoRecognizedBindings: visibleTwoActions, reportFiles: ["docs/d365/phase1b-m2b-business-rule-field-mapping.json", "docs/d365/phase1b-m2b-business-rule-field-mapping.csv"], backupDir: path.relative(root, backupDir) }, null, 2));
}


runDataverseCli(import.meta.url, main);
