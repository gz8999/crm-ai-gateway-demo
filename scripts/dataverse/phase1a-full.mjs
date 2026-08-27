import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, getRequiredLocalArtifactPath, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION_UNIQUE_NAME = "CRMAIGatewayDemo";
const SOLUTION_FRIENDLY_NAME = "CRM AI Gateway Demo";
const PUBLISHER_PREFIX = "aigw";
let ORIGINAL_VIEW_ID;
let FIELD_EXPORT_PATH;
const LANGUAGE_CODE = 2052;

const aliasMap = {
  new_organization_group: "aigw_organizationgroup",
  new_related_department: "aigw_bookingdepartment",
  new_bd_newexisting: "aigw_opportunitytype",
  new_status: "aigw_casestage",
  new_bd_group: "aigw_salesdepartment",
  new_bd_relation: "aigw_opportunityrelationship",
  new_bd_details: "aigw_opportunitydetailtype",
  new_startdate: "aigw_startdate",
  new_location: "aigw_opportunityplace",
  new_pipeline_list: "aigw_opportunitylist_bool",
  new_sales: "aigw_sales",
  new_sales2: "aigw_salesperson2",
  new_sales3: "aigw_salesperson3",
  new_sales4: "aigw_salesperson4",
  new_sales5: "aigw_introducer",
  new_global_initiative_key: "aigw_globalinitiative",
  new_alps_collaboration_key: "aigw_alpscooperation",
  new_goods_handled: "aigw_goodshandled",
  new_project_size: "aigw_projectsize",
  new_project_size_unit: "aigw_projectsizeunit",
  new_warehouse_scale: "aigw_warehousescale",
  new_trade_terms: "aigw_tradeterms",
  new_transport_mode: "aigw_transportmode",
  new_spot_continuous: "aigw_spotcontinuous",
  new_priority: "aigw_priority_choice",
  new_budgeted_or_not: "aigw_budgetstatus",
  new_background: "aigw_researchbackground_choice",
  new_decider: "aigw_decider_choice",
  new_customerneed: "aigw_customerneed_choice",
  new_proposedsolution: "aigw_proposalcontent_choice",
  new_capability: "aigw_winprobabilityrank",
  new_year_revenue_budget: "aigw_yearrevenuebudget",
  crc49_year_gpmp_budget: "aigw_yeargpmpbudget",
  new_yearrevenueactural: "aigw_yearrevenueactual",
  new_yearrevenueactural_base: "aigw_yearrevenueactualcny",
  new_estimated_quote_amount: "aigw_estimatedquoteamount",
  new_parentcontactid2: "aigw_customercontact2",
  new_parentcontactid3: "aigw_customercontact3",
  new_parentcontactid4: "aigw_customercontact4",
  new_parentcontactid5: "aigw_customercontact5",
  new_sealand_pol: "aigw_sealandpol",
  new_sealand_pod: "aigw_sealandpod",
  new_air_pol: "aigw_airpol",
  new_air_pod: "aigw_airpod",
};

const replacementMap = {
  new_win_reason: "aigw_wonreason_choice",
  new_lost_reason: "aigw_lostreason_choice",
};

const client = createDynamicsClient();
const repoRoot = process.cwd();

function parseOptions(raw) {
  if (!raw) return [];
  return String(raw).split("|").map((item) => {
    const match = /^\s*(-?\d+)\s*:(.*)$/.exec(item);
    if (!match) return null;
    return { value: Number(match[1]), label: match[2].trim() };
  }).filter(Boolean);
}

function labelOf(metadata) {
  return metadata?.DisplayName?.UserLocalizedLabel?.Label
    || metadata?.DisplayName?.LocalizedLabels?.[0]?.Label
    || "";
}

function requiredLevel(value) {
  if (value === "required") return "ApplicationRequired";
  if (value === "recommended") return "Recommended";
  return "None";
}

function typeName(sourceType) {
  return {
    string: "String",
    memo: "Memo",
    lookup: "String",
    optionset: "Picklist",
    boolean: "Boolean",
    decimal: "Decimal",
    money: "Money",
    datetime: "DateTime",
  }[sourceType] || sourceType;
}

function candidateLogicalName(field) {
  if (aliasMap[field.fieldLogicalName]) return aliasMap[field.fieldLogicalName];
  if (replacementMap[field.fieldLogicalName]) return replacementMap[field.fieldLogicalName];
  if (field.fieldLogicalName.startsWith("new_parentcontactid")) {
    return `aigw_customercontact${field.fieldLogicalName.slice(-1)}`;
  }
  const stripped = field.fieldLogicalName.replace(/^(new|crc49)_/, "").replaceAll("_", "");
  return field.fieldLogicalName.startsWith("new_") || field.fieldLogicalName.startsWith("crc49_")
    ? `aigw_${stripped}`
    : field.fieldLogicalName;
}

function displayLabel(field, logicalName) {
  if (logicalName === "aigw_wonreason_choice") return "受注理由";
  if (logicalName === "aigw_lostreason_choice") return "失注理由";
  return field.label;
}

function toCsv(rows) {
  const keys = ["sourceLogicalName", "sourceLabel", "sourceType", "required", "trialLogicalName", "trialType", "status", "reuse", "create", "typeConflict", "replacement", "form", "view", "safeContext", "providerPayloadAllowed"];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [keys.join(","), ...rows.map((row) => keys.map((key) => quote(row[key])).join(","))].join("\n") + "\n";
}

async function getJson(pathname) {
  return (await client.dataverseGet(pathname)).body;
}

async function writeJson(dir, filename, value) {
  await fs.writeFile(path.join(dir, filename), JSON.stringify(value, null, 2), "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function typedOptions(logicalName, type) {
  const metadataType = type === "Picklist" ? "PicklistAttributeMetadata" : "BooleanAttributeMetadata";
  const expand = type === "Picklist"
    ? "OptionSet($select=Options)"
    : "OptionSet($select=TrueOption,FalseOption)";
  try {
    const body = await getJson(`/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='${logicalName}')/Microsoft.Dynamics.CRM.${metadataType}?$select=LogicalName,AttributeType&$expand=${expand}`);
    return { ok: true, body };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function optionPairsFromMetadata(body, type) {
  if (type === "Picklist") {
    return (body?.OptionSet?.Options || []).map((option) => ({
      value: Number(option.Value),
      label: option.Label?.UserLocalizedLabel?.Label || option.Label?.LocalizedLabels?.[0]?.Label || "",
    }));
  }
  return [
    { value: 0, label: body?.OptionSet?.FalseOption?.Label?.UserLocalizedLabel?.Label || body?.OptionSet?.FalseOption?.Label?.LocalizedLabels?.[0]?.Label || "" },
    { value: 1, label: body?.OptionSet?.TrueOption?.Label?.UserLocalizedLabel?.Label || body?.OptionSet?.TrueOption?.Label?.LocalizedLabels?.[0]?.Label || "" },
  ];
}

function compareOptions(expected, actual) {
  const actualByValue = new Map(actual.map((option) => [option.value, option.label]));
  const missing = expected.filter((option) => !actualByValue.has(option.value));
  const labelMismatches = expected.filter((option) => actualByValue.has(option.value) && actualByValue.get(option.value) !== option.label)
    .map((option) => ({ value: option.value, expected: option.label, actual: actualByValue.get(option.value) }));
  return { missing, labelMismatches, valueConflict: false };
}

function buildAttributeBody(field, logicalName) {
  const label = displayLabel(field, logicalName);
  const base = {
    SchemaName: logicalName,
    DisplayName: { LocalizedLabels: [{ Label: label, LanguageCode: LANGUAGE_CODE }] },
    RequiredLevel: { Value: requiredLevel(field.required) },
    Description: { LocalizedLabels: [{ Label: `AI Gateway demo field: ${label}`, LanguageCode: LANGUAGE_CODE }] },
  };
  if (field.type === "string" || field.type === "lookup") {
    return { "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata", ...base, MaxLength: 4000, FormatName: { Value: "Text" } };
  }
  if (field.type === "memo") {
    return { "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata", ...base, MaxLength: 1048576, Format: "TextArea" };
  }
  if (field.type === "decimal") {
    return { "@odata.type": "Microsoft.Dynamics.CRM.DecimalAttributeMetadata", ...base, Precision: 2, MinValue: -100000000000, MaxValue: 100000000000 };
  }
  if (field.type === "money") {
    return { "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata", ...base, PrecisionSource: 2, MinValue: -100000000000000, MaxValue: 100000000000000 };
  }
  if (field.type === "optionset") {
    return {
      "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
      ...base,
      OptionSet: { IsGlobal: false, OptionSetType: "Picklist", Options: parseOptions(field.options).map((option) => ({ Value: option.value, Label: { LocalizedLabels: [{ Label: option.label, LanguageCode: LANGUAGE_CODE }] } })) },
    };
  }
  if (field.type === "boolean") {
    const options = parseOptions(field.options);
    const falseOption = options.find((option) => option.value === 0) || { value: 0, label: "No" };
    const trueOption = options.find((option) => option.value === 1) || { value: 1, label: "Yes" };
    return {
      "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
      ...base,
      OptionSet: {
        TrueOption: { Value: trueOption.value, Label: { LocalizedLabels: [{ Label: trueOption.label, LanguageCode: LANGUAGE_CODE }] } },
        FalseOption: { Value: falseOption.value, Label: { LocalizedLabels: [{ Label: falseOption.label, LanguageCode: LANGUAGE_CODE }] } },
      },
    };
  }
  return null;
}

async function addToSolution(metadataId) {
  await client.dataversePost("/api/data/v9.2/AddSolutionComponent", {
    ComponentId: metadataId,
    ComponentType: 2,
    SolutionUniqueName: SOLUTION_UNIQUE_NAME,
    AddRequiredComponents: false,
  });
}

export async function main() {
  EXPECTED_URL = getDataverseUrl();
  ORIGINAL_VIEW_ID = getRequiredEnvironmentId("D365_ORIGINAL_VIEW_ID");
  FIELD_EXPORT_PATH = getRequiredLocalArtifactPath("D365_OPPORTUNITY_RAW_EXPORT_PATH");
  assertDataverseScriptGate({ mode: "publish/deploy-capable" });
  const config = client.config;
  if (config.dataverseUrl !== EXPECTED_URL) throw new Error(`Safety gate failed: DATAVERSE_URL=${config.dataverseUrl || "<empty>"}`);
  if ((process.env.AI_PROVIDER || "demo") !== "demo") throw new Error("Safety gate failed: AI_PROVIDER must be demo");
  if ((process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: ALLOW_EXTERNAL_AI must be false");
  const whoAmI = (await client.testConnection());
  const organization = await getJson("/api/data/v9.2/organizations?$select=name,organizationid");
  const solutions = await getJson(`/api/data/v9.2/solutions?$select=solutionid,friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION_UNIQUE_NAME}'`);
  const solution = solutions.value?.[0];
  if (!solution || solution.ismanaged !== false || solution.friendlyname !== SOLUTION_FRIENDLY_NAME) throw new Error("Safety gate failed: unmanaged CRM AI Gateway Demo solution not confirmed");
  const publishers = await getJson(`/api/data/v9.2/publishers?$select=publisherid,uniquename,friendlyname,customizationprefix&$filter=publisherid eq ${solution._publisherid_value}`);
  const publisher = publishers.value?.[0];
  if (!publisher || publisher.customizationprefix !== PUBLISHER_PREFIX) throw new Error("Safety gate failed: publisher prefix is not aigw");
  const entityPath = "/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')";
  const entity = await getJson(`${entityPath}?$select=MetadataId,LogicalName,SchemaName,CanCreateAttributes,CanCreateForms,CanCreateViews`);
  if (entity.LogicalName !== "opportunity" || entity.CanCreateAttributes?.Value !== true) throw new Error("Safety gate failed: opportunity cannot be safely extended");

  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const backupDir = path.join(repoRoot, "backups", "dataverse", `phase1a_full_${timestamp}`);
  await fs.mkdir(backupDir, { recursive: true });
  const exportData = JSON.parse(await fs.readFile(path.join(repoRoot, FIELD_EXPORT_PATH), "utf8"));
  const attributes = await getJson(`${entityPath}/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,DisplayName,RequiredLevel,IsCustomAttribute,IsManaged`);
  const attributeByLogical = new Map((attributes.value || []).map((item) => [item.LogicalName, item]));
  const form = await getJson("/api/data/v9.2/systemforms?$select=formid,name,type,objecttypecode,formxml&$filter=objecttypecode eq 'opportunity' and name eq 'AI Gateway Opportunity Demo'");
  const view = await getJson(`/api/data/v9.2/savedqueries?$select=savedqueryid,name,returnedtypecode,fetchxml,layoutxml,layoutjson,statecode&$filter=savedqueryid eq ${ORIGINAL_VIEW_ID}`);
  await writeJson(backupDir, "00_safety_gate.json", { dataverseUrl: config.dataverseUrl, organization, whoAmI, solution, publisher, aiProvider: "demo", allowExternalAi: false });
  await writeJson(backupDir, "01_field_export_source.json", { source: FIELD_EXPORT_PATH, fieldCount: exportData.length, fields: exportData });
  await writeJson(backupDir, "02_current_opportunity_entity.json", entity);
  await writeJson(backupDir, "03_current_opportunity_attributes.json", attributes);
  await writeJson(backupDir, "04_target_form_metadata.json", form);
  await writeJson(backupDir, "05_target_view_metadata.json", view);

  const audit = exportData.map((field) => {
    const trialLogicalName = candidateLogicalName(field);
    const existing = attributeByLogical.get(trialLogicalName);
    const expectedType = typeName(field.type);
    const typeConflict = Boolean(existing && existing.AttributeType && existing.AttributeType.toLowerCase() !== expectedType.toLowerCase());
    const isReplacement = Boolean(replacementMap[field.fieldLogicalName]);
    return {
      sourceLogicalName: field.fieldLogicalName,
      sourceLabel: field.label,
      sourceType: field.type,
      required: field.required,
      sourceOptions: parseOptions(field.options),
      trialLogicalName,
      trialDisplayName: labelOf(existing),
      trialType: existing?.AttributeType || "",
      status: typeConflict ? "type_conflict" : existing ? "reusable" : "missing",
      reuse: Boolean(existing && !typeConflict),
      create: Boolean(!existing && !typeConflict),
      typeConflict,
      replacement: isReplacement,
      form: true,
      view: ["name", "parentaccountid", "parentcontactid", "ownerid", "statuscode", "estimatedclosedate", "modifiedon"].includes(field.fieldLogicalName),
      safeContext: !["lookup", "money"].includes(field.type),
      providerPayloadAllowed: false,
    };
  });
  const missingCreationPlan = audit.filter((row) => row.create).map((row) => ({ ...row, displayName: row.sourceLabel, attributeType: typeName(row.sourceType) }));
  for (const conflict of audit.filter((row) => row.typeConflict)) {
    const replacementLogicalName = replacementMap[conflict.sourceLogicalName];
    if (replacementLogicalName && !attributeByLogical.has(replacementLogicalName)) {
      missingCreationPlan.push({ ...conflict, trialLogicalName: replacementLogicalName, displayName: conflict.sourceLabel, attributeType: "Picklist", create: true, replacement: true, typeConflict: false });
    }
  }
  const optionFields = exportData.filter((field) => ["optionset", "boolean"].includes(field.type));
  const optionAudit = [];
  for (const field of optionFields) {
    const logicalName = candidateLogicalName(field);
    const existing = attributeByLogical.get(logicalName);
    if (!existing) {
      optionAudit.push({ sourceLogicalName: field.fieldLogicalName, trialLogicalName: logicalName, status: "new_field_options_in_create_plan", expected: parseOptions(field.options) });
      continue;
    }
    const read = await typedOptions(logicalName, typeName(field.type));
    if (!read.ok) {
      optionAudit.push({ sourceLogicalName: field.fieldLogicalName, trialLogicalName: logicalName, status: "read_error", error: read.error });
      continue;
    }
    const actual = optionPairsFromMetadata(read.body, typeName(field.type));
    const comparison = compareOptions(parseOptions(field.options), actual);
    optionAudit.push({ sourceLogicalName: field.fieldLogicalName, trialLogicalName: logicalName, status: comparison.missing.length || comparison.labelMismatches.length ? "label_or_option_mismatch" : "matched", expected: parseOptions(field.options), actual, ...comparison });
  }
  const valueConflicts = optionAudit.filter((item) => item.valueConflict);
  await writeJson(backupDir, "06_full_field_audit.json", audit);
  await fs.writeFile(path.join(backupDir, "06_full_field_audit.csv"), toCsv(audit), "utf8");
  await writeJson(backupDir, "07_missing_field_creation_plan.json", missingCreationPlan);
  await writeJson(backupDir, "08_option_boolean_audit_before.json", optionAudit);
  await writeJson(backupDir, "09_type_conflict_plan.json", audit.filter((row) => row.typeConflict));
  if (valueConflicts.length) throw new Error(`Option value conflict detected; no writes performed: ${valueConflicts.map((item) => item.trialLogicalName).join(", ")}`);

  const creationResults = [];
  for (const plan of missingCreationPlan) {
    if (attributeByLogical.has(plan.trialLogicalName)) {
      creationResults.push({ logicalName: plan.trialLogicalName, status: "already_exists_skip" });
      continue;
    }
    const source = exportData.find((field) => field.fieldLogicalName === plan.sourceLogicalName) || { ...exportData.find((field) => replacementMap[field.fieldLogicalName] === plan.sourceLogicalName), type: "optionset", options: "" };
    const body = buildAttributeBody(source, plan.trialLogicalName);
    if (!body) { creationResults.push({ logicalName: plan.trialLogicalName, status: "unsupported_type", sourceType: source.type }); continue; }
    try {
      const response = await client.dataversePost(`${entityPath}/Attributes`, body);
      let metadataId = response.headers.get("odata-entityid")?.split("(")[1]?.split(")")[0] || null;
      if (!metadataId) {
        await sleep(2500);
        const createdMetadata = await getJson(`${entityPath}/Attributes(LogicalName='${plan.trialLogicalName}')?$select=MetadataId,LogicalName`);
        metadataId = createdMetadata.MetadataId || null;
      }
      if (metadataId) await addToSolution(metadataId);
      creationResults.push({ logicalName: plan.trialLogicalName, status: "created", sourceLogicalName: plan.sourceLogicalName, type: body["@odata.type"], metadataId, addedToSolution: Boolean(metadataId) });
    } catch (error) {
      creationResults.push({ logicalName: plan.trialLogicalName, status: "failed", sourceLogicalName: plan.sourceLogicalName, error: error.name === "AbortError" ? "Dataverse request timed out" : error.message });
    }
    await writeJson(backupDir, "10_field_creation_progress.json", creationResults);
    await sleep(2500);
  }
  await writeJson(backupDir, "10_field_creation_results.json", creationResults);
  const created = creationResults.filter((item) => item.status === "created");
  let publish = { status: "not_needed", reason: "No fields created" };
  if (created.length) {
    try {
      const publishXml = "<importexportxml><entities><entity>opportunity</entity></entities></importexportxml>";
      publish = (await client.dataversePost("/api/data/v9.2/PublishXml", { ParameterXml: publishXml })).body;
      publish = { status: "published", scope: "opportunity", response: publish };
    } catch (error) { publish = { status: "publish_failed", scope: "opportunity", error: error.message }; }
  }
  await writeJson(backupDir, "11_publish_result.json", publish);
  const after = await getJson(`${entityPath}/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,DisplayName,RequiredLevel,IsCustomAttribute,IsManaged`);
  const afterNames = new Set((after.value || []).map((item) => item.LogicalName));
  const expectedNames = missingCreationPlan.map((item) => item.trialLogicalName);
  const verification = { expectedNewOrReplacementCount: expectedNames.length, presentCount: expectedNames.filter((name) => afterNames.has(name)).length, missingAfterWrite: expectedNames.filter((name) => !afterNames.has(name)), createdCount: created.length, failedCount: creationResults.filter((item) => item.status === "failed").length };
  await writeJson(backupDir, "12_opportunity_attributes_after.json", after);
  await writeJson(backupDir, "13_option_boolean_audit_result.json", optionAudit);
  await writeJson(backupDir, "14_verification.json", verification);
  await writeJson(backupDir, "15_phase1a_full_summary.json", { timestamp: new Date().toISOString(), backupDir: path.relative(repoRoot, backupDir), safety: { dataverseUrl: config.dataverseUrl, solution: SOLUTION_UNIQUE_NAME, publisherPrefix: PUBLISHER_PREFIX, aiProvider: "demo", allowExternalAi: false }, counts: { fieldExport: exportData.length, reusable: audit.filter((row) => row.reuse).length, missingBeforeWrite: missingCreationPlan.length, created: created.length, failed: verification.failedCount, typeConflicts: audit.filter((row) => row.typeConflict).length, optionsetFields: optionFields.filter((field) => field.type === "optionset").length, booleanFields: optionFields.filter((field) => field.type === "boolean").length }, verification, publish, noFormViewBpfDemoDataChanges: true });
  console.log(JSON.stringify({ backupDir: path.relative(repoRoot, backupDir), auditRows: audit.length, creationPlan: missingCreationPlan.length, created: created.length, failed: verification.failedCount, valueConflicts: valueConflicts.length, publish, verification }, null, 2));
}


runDataverseCli(import.meta.url, main);
