import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, getRequiredLocalArtifactPath, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION_UNIQUE_NAME = "CRMAIGatewayDemo";
const SOLUTION_FRIENDLY_NAME = "CRM AI Gateway Demo";
const PUBLISHER_PREFIX = "aigw";
let FORM_ID;
let VIEW_ID;
let SOURCE_PATH;
const DOCS_DIR = "docs/d365";

const aliasMap = {
  new_organization_group: "aigw_organizationgroup_choice", new_related_department: "aigw_bookingdepartment_choice",
  new_bd_newexisting: "aigw_opportunitytype", new_status: "aigw_casestage", new_bd_group: "aigw_salesdepartment_choice",
  new_bd_relation: "aigw_opportunityrelationship", new_bd_details: "aigw_opportunitydetailtype", new_startdate: "aigw_startdate",
  new_location: "aigw_opportunityplace", new_pipeline_list: "aigw_opportunitylist_bool", new_sales: "aigw_sales",
  new_sales2: "aigw_salesperson2", new_sales3: "aigw_salesperson3", new_sales4: "aigw_salesperson4", new_sales5: "aigw_introducer",
  new_global_initiative_key: "aigw_globalinitiative", new_alps_collaboration_key: "aigw_alpscooperation", new_goods_handled: "aigw_goodshandled",
  new_project_size: "aigw_projectsize", new_project_size_unit: "aigw_projectsizeunit", new_warehouse_scale: "aigw_warehousescale",
  new_trade_terms: "aigw_tradeterms", new_transport_mode: "aigw_transportmode", new_spot_continuous: "aigw_spotcontinuous",
  new_priority: "aigw_priority_choice", new_budgeted_or_not: "aigw_budgetstatus", new_background: "aigw_researchbackground_choice",
  new_decider: "aigw_decider_choice", new_customerneed: "aigw_customerneed_choice", new_proposedsolution: "aigw_proposalcontent_choice",
  new_win_reason: "aigw_wonreason_choice", new_lost_reason: "aigw_lostreason_choice", new_estimated_quote_amount: "aigw_estimatedquoteamount",
  new_capability: "aigw_winprobabilityrank", new_year_revenue_budget: "aigw_yearrevenuebudget", crc49_year_gpmp_budget: "aigw_yeargpmpbudget",
  new_yearrevenueactural: "aigw_yearrevenueactual", new_yearrevenueactural_base: "aigw_yearrevenueactualcny",
  new_parentcontactid2: "aigw_customercontact2", new_parentcontactid3: "aigw_customercontact3", new_parentcontactid4: "aigw_customercontact4", new_parentcontactid5: "aigw_customercontact5",
  new_sealand_pol: "aigw_sealandpol", new_sealand_pod: "aigw_sealandpod", new_air_pol: "aigw_airpol", new_air_pod: "aigw_airpod",
};

const formTabOrder = ["摘要", "预算", "实绩", "产品", "文件", "相关"];
const viewColumns = [
  ["组织团体", "aigw_organizationgroup_choice", 170], ["销售部门", "aigw_salesdepartment_choice", 170], ["营业负责人", "aigw_sales", 150],
  ["案件名称", "name", 260], ["客户名称(中国語)(客户)", "aigw_customernamecn", 210], ["客户", "parentaccountid", 210],
  ["案件开始日", "aigw_startdate", 125], ["是否预算内", "aigw_budgetstatus", 120], ["联系人1", "parentcontactid", 150],
  ["客户需求", "aigw_customerneed_choice", 180], ["提案内容", "aigw_proposalcontent_choice", 200], ["预计下单日", "estimatedclosedate", 130],
  ["受注日期", "actualclosedate", 130], ["案件类型", "aigw_opportunitytype", 125], ["案件关系", "aigw_opportunityrelationship", 160],
  ["案件状态", "aigw_casestage", 145], ["案件详细信息", "aigw_opportunitydetailtype", 160], ["计上部门", "aigw_bookingdepartment_choice", 180],
  ["案件列表", "aigw_opportunitylist_bool", 125], ["全球倡议", "aigw_globalinitiative", 200], ["阿尔卑斯合作", "aigw_alpscooperation", 130],
  ["受注确度", "aigw_winprobabilityrank", 120], ["货物说明", "aigw_goodshandled", 150], ["案件物量规模单位", "aigw_projectsizeunit", 145],
  ["调查背景", "aigw_researchbackground_choice", 180], ["仓库规模", "aigw_warehousescale", 170], ["受注理由", "aigw_wonreason_choice", 160],
  ["失注理由", "aigw_lostreason_choice", 160], ["贸易条件", "aigw_tradeterms", 130], ["海运/陆运卸货港", "aigw_sealandpod", 170],
  ["海运/陆运装货港", "aigw_sealandpol", 170], ["运送模式", "aigw_transportmode", 130], ["一次性/持续性", "aigw_spotcontinuous", 130],
  ["决裁者", "aigw_decider_choice", 130], ["负责人", "ownerid", 145], ["修改时间", "modifiedon", 155],
];

const summaryGroups = {
  "商机信息": new Set(["name", "parentaccountid", "statuscode", "parentcontactid", "new_parentcontactid2", "new_parentcontactid3", "new_parentcontactid4", "new_parentcontactid5", "new_organization_group", "new_related_department", "new_bd_newexisting", "new_status", "new_bd_group", "new_bd_relation", "new_bd_details", "new_startdate", "new_location", "description", "new_pipeline_list", "transactioncurrencyid"]),
  "汇总信息": new Set(["new_priority", "new_budgeted_or_not", "new_background", "new_decider", "new_customerneed", "new_proposedsolution", "new_win_reason", "new_lost_reason"]),
  "预算摘要": new Set(["new_estimated_quote_amount", "estimatedclosedate", "estimatedvalue", "new_capability"]),
  "年度预算摘要": new Set(["new_year_revenue_budget", "crc49_year_gpmp_budget", "crc49_revenuebudgetcapabilitypercentagevalue", "crc49_gpmpbudgetprobabilityofsecuringpercentageval", "crc49_revenuebudgetcapabilitypercentagevalue_base", "crc49_gpmpbudgetprobabilityofsecuringpercentageval_base"]),
  "实绩摘要": new Set(["actualclosedate", "new_yearrevenueactural", "new_yearrevenueactural_base", "actualvalue"]),
  "Sales Person Info": new Set(["new_sales", "new_sales2", "new_sales3", "new_sales4", "new_sales5", "ownerid"]),
  "商机详细信息": new Set(["new_global_initiative_key", "new_alps_collaboration_key", "new_goods_handled", "new_project_size", "new_project_size_unit", "new_warehouse_scale", "new_trade_terms", "new_transport_mode", "new_spot_continuous"]),
  "POL&POD": new Set(["new_sealand_pol", "new_sealand_pod", "new_air_pol", "new_air_pod"]),
};

const productFields = new Set(["pricelevelid", "isrevenuesystemcalculated", "totallineitemamount", "discountpercentage", "discountamount", "totalamountlessfreight", "freightamount", "totaltax", "totalamount"]);
const monthly = /^(new_m(1|2|3|4|5|6|7|8|9|10|11|12)_(revenue|gpmp)_budget|crc49_m(1|2|3|4|5|6|7|8|9|10|11|12)volumebudget)$/;

function xmlEscape(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function csv(rows, keys) { const q = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`; return [keys.join(","), ...rows.map((r) => keys.map((k) => q(r[k])).join(","))].join("\n") + "\n"; }
function dateStamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
function targetTypeName(sourceType) { return { string: "String", memo: "Memo", lookup: "Lookup", optionset: "Picklist", boolean: "Boolean", decimal: "Decimal", money: "Money", datetime: "DateTime" }[sourceType] || sourceType; }
function localName(field) {
  if (aliasMap[field.fieldLogicalName]) return aliasMap[field.fieldLogicalName];
  if (field.fieldLogicalName.startsWith("crc49_capability")) return `aigw_${field.fieldLogicalName.slice(6)}`;
  const monthlyRevenue = /^new_m(\d+)_(revenue|gpmp)_budget$/.exec(field.fieldLogicalName);
  if (monthlyRevenue) return `aigw_m${monthlyRevenue[1]}${monthlyRevenue[2]}budget`;
  const monthlyVolume = /^crc49_m(\d+)volumebudget$/.exec(field.fieldLogicalName);
  if (monthlyVolume) return `aigw_m${monthlyVolume[1]}volumebudget`;
  const weighted = field.fieldLogicalName.replace(/^crc49_/, "").replaceAll("_", "");
  if (field.fieldLogicalName.startsWith("crc49_")) return `aigw_${weighted}`;
  return field.fieldLogicalName;
}
function placement(field) {
  const source = field.fieldLogicalName;
  if (monthly.test(source)) {
    const month = Number((/^new_m(\d+)_|^crc49_m(\d+)/.exec(source) || [])[1] || (/^crc49_m(\d+)/.exec(source) || [])[1]);
    const quarter = month >= 4 && month <= 6 ? "1Q" : month >= 7 && month <= 9 ? "2Q" : month >= 10 ? "3Q" : "4Q";
    const quarterMonths = { "1Q": [4, 5, 6], "2Q": [7, 8, 9], "3Q": [10, 11, 12], "4Q": [1, 2, 3] }[quarter];
    const columnIndex = source.includes("revenue") ? 0 : source.includes("gpmp") ? 1 : 2;
    return { targetFormTab: "预算", targetSection: quarter, columnIndex, rowIndex: quarterMonths.indexOf(month), displayOrder: columnIndex * 10 + quarterMonths.indexOf(month), metadataOnly: false, visible: true, disabled: false, readOnlyRecommendation: "editable" };
  }
  for (const [section, fields] of Object.entries(summaryGroups)) if (fields.has(source)) {
    const index = [...fields].indexOf(source);
    return { targetFormTab: "摘要", targetSection: section, columnIndex: index % 2, rowIndex: Math.floor(index / 2), displayOrder: index + 1, metadataOnly: false, visible: true, disabled: false, readOnlyRecommendation: section.includes("年度") || section === "实绩摘要" ? "readOnlyWhenCalculated" : "editable" };
  }
  if (productFields.has(source)) return { targetFormTab: "产品", targetSection: "系统产品与金额", columnIndex: 0, rowIndex: 0, displayOrder: 0, metadataOnly: true, visible: false, disabled: true, readOnlyRecommendation: "systemManaged" };
  if (["statecode", "createdon", "modifiedon"].includes(source)) return { targetFormTab: "相关", targetSection: "系统字段", columnIndex: 0, rowIndex: 0, displayOrder: 0, metadataOnly: true, visible: false, disabled: true, readOnlyRecommendation: "systemManaged" };
  return { targetFormTab: "相关", targetSection: "保留 metadata", columnIndex: 0, rowIndex: 0, displayOrder: 0, metadataOnly: true, visible: false, disabled: true, readOnlyRecommendation: "notOnReplica" };
}
function simulationType(field, target) {
  if (["new_parentcontactid2", "new_parentcontactid3", "new_parentcontactid4", "new_parentcontactid5", "new_sales", "new_sales2", "new_sales3", "new_sales4", "new_sales5"].includes(field.fieldLogicalName)) return "lookup_simulated_as_text";
  if (["new_location", "new_sealand_pol", "new_sealand_pod", "new_air_pol", "new_air_pod"].includes(field.fieldLogicalName)) return "lookup_simulated_as_text";
  if (target === "aigw_customernamecn") return "opportunity_text_simulation";
  return "none";
}
function policies(field, target, sourceType) {
  if (target === "aigw_customernamecn" || ["parentaccountid", "parentcontactid", "ownerid", "aigw_sales", "aigw_customercontact2", "aigw_customercontact3", "aigw_customercontact4", "aigw_customercontact5"].includes(target)) return ["token_or_exclude", "token_only"];
  if (sourceType === "money" || /budget|actual|amount|revenue|gpmp/i.test(field.fieldLogicalName)) return ["amount_band_or_trend", "exact_amount_prohibited"];
  if (["memo", "string"].includes(sourceType) || ["description", "new_customerneed", "new_proposedsolution", "new_win_reason", "new_lost_reason"].includes(field.fieldLogicalName)) return ["sanitized_summary", "sanitized_summary_only"];
  if (sourceType === "lookup") return ["region_or_mode_only", "exclude"];
  if (["optionset", "boolean"].includes(sourceType)) return ["choice_label", "choice_label_only"];
  return ["exclude", "exclude"];
}
function controlClass(sourceType) { return { String: "text", Memo: "textarea", Lookup: "lookup", Picklist: "choice", Boolean: "boolean", Decimal: "decimal", Money: "currency", DateTime: "date" }[sourceType] || "text"; }
function xmlValid(xml) {
  const stack = [];
  const clean = xml.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?.*?\?>/g, "");
  for (const token of clean.match(/<[^>]+>/g) || []) {
    if (/^<\//.test(token)) { const name = token.slice(2, -1).trim(); if (stack.pop() !== name) return { ok: false, error: `Mismatched closing tag: ${name}` }; }
    else if (!/^<!/.test(token) && !/\/>$/.test(token)) stack.push((/^<\s*([^\s/>]+)/.exec(token) || [])[1]);
  }
  return stack.length ? { ok: false, error: `Unclosed tag: ${stack.at(-1)}` } : { ok: true };
}
function formXml(matrix) {
  const sections = ["商机信息", "汇总信息", "预算摘要", "年度预算摘要", "实绩摘要", "Sales Person Info", "商机详细信息", "POL&POD"];
  const lines = ["<?xml version=\"1.0\" encoding=\"utf-8\"?>", "<!-- Draft only. Not a Dataverse import payload. -->", "<form name=\"AI Gateway Opportunity Demo - Full Replica\" type=\"main\" entity=\"opportunity\" writeBlocked=\"true\">", "  <header>", "    <systemTitle field=\"name\" />"];
  for (const name of ["aigw_winprobabilityrank", "aigw_budgetstatus", "ownerid"]) { const row = matrix.find((x) => x.targetLogicalName === name); lines.push(`    <control id=\"header_${name}\" datafieldname=\"${name}\" label=\"${xmlEscape(row?.targetLabel || name)}\" classid=\"${controlClass(row?.targetType)}\" visible=\"true\" disabled=\"false\" readOnly=\"false\" />`); }
  lines.push("  </header>", "  <tabs>", "    <tab name=\"摘要\" columns=\"2\">");
  for (const section of sections) {
    const fields = matrix.filter((x) => x.targetFormTab === "摘要" && x.targetSection === section && !x.metadataOnly).sort((a, b) => a.displayOrder - b.displayOrder);
    lines.push(`      <section name=\"${xmlEscape(section)}\" columns=\"2\">`);
    if (section === "商机信息") lines.push("        <control id=\"aigw_fullreplica_aigw_customernamecn\" datafieldname=\"aigw_customernamecn\" label=\"客户名称(中国語)(客户)\" row=\"1\" column=\"0\" classid=\"text\" visible=\"true\" disabled=\"false\" readOnly=\"editable\" simulationType=\"opportunity_text_simulation\" />");
    for (const field of fields) lines.push(`        <control id=\"aigw_fullreplica_${field.targetLogicalName}\" datafieldname=\"${field.targetLogicalName}\" label=\"${xmlEscape(field.targetLabel)}\" row=\"${field.rowIndex}\" column=\"${field.columnIndex}\" classid=\"${controlClass(field.targetType)}\" visible=\"${field.visible}\" disabled=\"${field.disabled}\" readOnly=\"${field.readOnlyRecommendation}\" />`);
    lines.push("      </section>");
  }
  lines.push("      <section name=\"Timeline\" columns=\"1\"><placeholder controlid=\"timeline_existing_configuration\" visible=\"true\" writeBlocked=\"true\" /></section>", "    </tab>", "    <tab name=\"预算\" columns=\"3\">");
  for (const quarter of ["1Q", "2Q", "3Q", "4Q"]) { lines.push(`      <section name=\"${quarter}\" columns=\"3\">`); for (const field of matrix.filter((x) => x.targetFormTab === "预算" && x.targetSection === quarter).sort((a, b) => a.columnIndex - b.columnIndex || a.rowIndex - b.rowIndex)) lines.push(`        <control id=\"aigw_fullreplica_${field.targetLogicalName}\" datafieldname=\"${field.targetLogicalName}\" label=\"${xmlEscape(field.targetLabel)}\" row=\"${field.rowIndex}\" column=\"${field.columnIndex}\" classid=\"${controlClass(field.targetType)}\" visible=\"true\" disabled=\"false\" readOnly=\"editable\" />`); lines.push("      </section>"); }
  lines.push("    </tab>", "    <tab name=\"实绩\" columns=\"1\"><section name=\"实绩_Subgrid_Placeholder\" columns=\"1\"><placeholder controlid=\"actuals_subgrid_placeholder\" writeBlocked=\"true\" reason=\"No verified related entity or relationship in test metadata\" /></section></tab>", "    <tab name=\"产品\" systemRetained=\"true\"><section name=\"系统产品与金额\" columns=\"1\"><placeholder controlid=\"product_system_components\" writeBlocked=\"true\" /></section></tab>", "    <tab name=\"文件\" systemRetained=\"true\"><section name=\"documents_sharepoint\" columns=\"1\"><placeholder controlid=\"documents_system_components\" writeBlocked=\"true\" /></section></tab>", "    <tab name=\"相关\" systemRetained=\"true\"><section name=\"related_navigation\" columns=\"1\"><placeholder controlid=\"related_system_navigation\" writeBlocked=\"true\" /></section></tab>", "  </tabs>", "</form>");
  return lines.join("\n") + "\n";
}
function fetchXml() { return `<fetch version=\"1.0\" output-format=\"xml-platform\" mapping=\"logical\" distinct=\"false\"><entity name=\"opportunity\">${viewColumns.map(([, name]) => `<attribute name=\"${name}\" />`).join("")}<filter type=\"and\"><condition attribute=\"name\" operator=\"like\" value=\"[[]AI-DEMO]%\" /></filter><order attribute=\"modifiedon\" descending=\"true\" /></entity></fetch>`; }
function layoutXml() { return `<grid name=\"resultset\" object=\"3\" jump=\"name\" select=\"1\" icon=\"1\" preview=\"1\"><row name=\"result\" id=\"opportunityid\">${viewColumns.map(([, name, width]) => `<cell name=\"${name}\" width=\"${width}\" />`).join("")}</row></grid>`; }

export async function main() {
  EXPECTED_URL = getDataverseUrl();
  FORM_ID = getRequiredEnvironmentId("D365_ORIGINAL_FORM_ID");
  VIEW_ID = getRequiredEnvironmentId("D365_ORIGINAL_VIEW_ID");
  SOURCE_PATH = getRequiredLocalArtifactPath("D365_OPPORTUNITY_RAW_EXPORT_PATH");
  const root = process.cwd(); const client = createDynamicsClient(); const get = async (url) => (await client.dataverseGet(url)).body;
  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: unexpected Dataverse URL");
  if ((process.env.AI_PROVIDER || "demo") !== "demo") throw new Error("Safety gate failed: AI_PROVIDER must be demo");
  if ((process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: ALLOW_EXTERNAL_AI must be false");
  const [who, organizations, solutions, attrs, form, view, entities, oneToMany, forms] = await Promise.all([
    get("/api/data/v9.2/WhoAmI()"), get("/api/data/v9.2/organizations?$select=name,organizationid"),
    get("/api/data/v9.2/solutions?$select=solutionid,friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq 'CRMAIGatewayDemo'"),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,DisplayName,RequiredLevel,IsManaged"),
    get(` /api/data/v9.2/systemforms(${FORM_ID})?$select=formid,name,type,formactivationstate,objecttypecode,formxml`.trim()),
    get(` /api/data/v9.2/savedqueries(${VIEW_ID})?$select=savedqueryid,name,returnedtypecode,statecode,fetchxml,layoutxml,layoutjson`.trim()),
    get("/api/data/v9.2/EntityDefinitions?$select=LogicalName,SchemaName,DisplayName"),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/OneToManyRelationships?$select=SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,RelationshipType"),
    get("/api/data/v9.2/systemforms?$select=formid,name,type,formxml&$filter=objecttypecode eq 'opportunity'")
  ]);
  const solution = solutions.value?.[0]; if (!solution || solution.ismanaged !== false || solution.friendlyname !== SOLUTION_FRIENDLY_NAME) throw new Error("Safety gate failed: unmanaged solution not confirmed");
  const publishers = await get(`/api/data/v9.2/publishers?$select=publisherid,customizationprefix&$filter=publisherid eq ${solution._publisherid_value}`);
  if (publishers.value?.[0]?.customizationprefix !== PUBLISHER_PREFIX) throw new Error("Safety gate failed: publisher prefix is not aigw");
  const source = JSON.parse(await fs.readFile(path.join(root, SOURCE_PATH), "utf8"));
  if (source.length !== 117) throw new Error(`Expected 117 source rows, found ${source.length}`);
  const byLogical = new Map((attrs.value || []).map((a) => [a.LogicalName, a]));
  const matrix = source.map((field) => {
    const targetLogicalName = localName(field); const target = byLogical.get(targetLogicalName); const p = placement(field); const [safeContextPolicy, providerPayloadPolicy] = policies(field, targetLogicalName, field.type);
    const sourceExpected = targetTypeName(field.type); const actual = target?.AttributeType || ""; const simulation = simulationType(field, targetLogicalName);
    const platformTypeCompatible = (field.fieldLogicalName === "statuscode" && actual === "Status") || (field.fieldLogicalName === "statecode" && actual === "State") || (field.fieldLogicalName === "ownerid" && actual === "Owner");
    return { sourceLogicalName: field.fieldLogicalName, targetLogicalName, sourceLabel: field.label, targetLabel: target?.DisplayName?.UserLocalizedLabel?.Label || field.label, sourceType: field.type, targetType: actual || sourceExpected, targetExists: Boolean(target), targetFormTab: p.targetFormTab, targetSection: p.targetSection, columnIndex: p.columnIndex, rowIndex: p.rowIndex, displayOrder: p.displayOrder, headerPlacement: field.fieldLogicalName === "name" ? "systemTitle" : ["new_capability", "new_budgeted_or_not", "ownerid"].includes(field.fieldLogicalName), viewPlacement: viewColumns.some(([, name]) => name === targetLogicalName), metadataOnly: p.metadataOnly, simulationType: simulation, typeMismatch: Boolean(target && actual !== sourceExpected && simulation === "none" && !platformTypeCompatible), specialControl: simulation !== "none" ? simulation : productFields.has(field.fieldLogicalName) ? "system_product_control" : controlClass(actual || sourceExpected), visible: p.visible, disabled: p.disabled, readOnlyRecommendation: p.readOnlyRecommendation, safeContextPolicy, providerPayloadPolicy };
  });
  const duplicateSource = matrix.filter((row, index) => matrix.findIndex((x) => x.sourceLogicalName === row.sourceLogicalName) !== index);
  const supplementalMappings = [{ sourceLogicalName: "supplemental_customer_name_cn", targetLogicalName: "aigw_customernamecn", sourceLabel: "客户名称(中国語)(客户)", targetLabel: byLogical.get("aigw_customernamecn")?.DisplayName?.UserLocalizedLabel?.Label || "客户名称(中国語)(客户)", sourceType: "string", targetType: byLogical.get("aigw_customernamecn")?.AttributeType || "", targetExists: byLogical.has("aigw_customernamecn"), targetFormTab: "摘要", targetSection: "商机信息", columnIndex: 0, rowIndex: 1, displayOrder: 3, headerPlacement: false, viewPlacement: true, metadataOnly: false, simulationType: "opportunity_text_simulation", typeMismatch: false, specialControl: "text", visible: true, disabled: false, readOnlyRecommendation: "editable", safeContextPolicy: "token_or_exclude", providerPayloadPolicy: "token_only" }];
  const formRows = [...matrix.filter((row) => !row.metadataOnly), ...supplementalMappings]; const formMissing = formRows.filter((row) => !row.targetExists);
  const viewMissing = viewColumns.filter(([, name]) => !byLogical.has(name));
  const fetch = fetchXml(); const layout = layoutXml(); const formDraft = formXml(matrix);
  const formDataFields = [...formDraft.matchAll(/datafieldname=\"([^\"]+)\"/g)].map((match) => match[1]);
  const validations = { sourceRows: matrix.length, duplicateSourceLogicalNames: duplicateSource.map((x) => x.sourceLogicalName), formFieldCount: formRows.length, formMissingMetadata: formMissing.map((x) => x.targetLogicalName), formDraftMissingMetadata: [...new Set(formDataFields.filter((name) => !byLogical.has(name)))], viewColumnCount: viewColumns.length, viewMissingMetadata: viewMissing.map((x) => x[1]), fetchXml: xmlValid(fetch), layoutXml: xmlValid(layout), formXml: xmlValid(formDraft), fetchLayoutOneToOne: viewColumns.every(([, name]) => fetch.includes(`attribute name=\"${name}\"`) && layout.includes(`cell name=\"${name}\"`)), monthlyBudgetOnly: matrix.filter((x) => monthly.test(x.sourceLogicalName)).every((x) => x.targetFormTab === "预算"), noAllFieldsInSummary: matrix.filter((x) => x.targetFormTab === "摘要").length < matrix.length };
  const actualMatches = (entities.value || []).filter((e) => /实绩|actual|performance/i.test(JSON.stringify(e.DisplayName || ""))).map((e) => ({ logicalName: e.LogicalName, displayName: e.DisplayName?.UserLocalizedLabel?.Label || e.DisplayName?.LocalizedLabels?.[0]?.Label || "" }));
  const formSubgrids = []; for (const item of forms.value || []) for (const match of String(item.formxml || "").matchAll(/<control[^>]*id=\"([^\"]+)\"[^>]*indicationOfSubgrid=\"true\"[^>]*>([\s\S]*?)<\/control>/g)) formSubgrids.push({ formId: item.formid, formName: item.name, controlId: match[1], hasActualKeyword: /实绩|actual|performance/i.test(match[0]), snippet: match[0].slice(0, 240) });
  const stamp = dateStamp(); const backupDir = path.join(root, "backups", "dataverse", `phase1b_dryrun_${stamp}`); const docs = path.join(root, DOCS_DIR); await fs.mkdir(backupDir, { recursive: true }); await fs.mkdir(docs, { recursive: true });
  const safety = { dataverseUrl: client.config.dataverseUrl, organization: organizations.value?.[0], whoAmI: { userId: who.UserId, organizationId: who.OrganizationId }, solution, publisherPrefix: PUBLISHER_PREFIX, aiProvider: "demo", allowExternalAi: false, readOnly: true };
  await fs.writeFile(path.join(backupDir, "00_safety_gate.json"), JSON.stringify(safety, null, 2)); await fs.writeFile(path.join(backupDir, "01_opportunity_attributes.json"), JSON.stringify(attrs, null, 2)); await fs.writeFile(path.join(backupDir, "02_target_form_metadata.json"), JSON.stringify(form, null, 2)); await fs.writeFile(path.join(backupDir, "03_target_view_metadata.json"), JSON.stringify(view, null, 2)); await fs.writeFile(path.join(backupDir, "04_actuals_metadata_audit.json"), JSON.stringify({ actualMatches, oneToMany: oneToMany.value, formSubgrids }, null, 2));
  const mdTable = matrix.map((x) => `| ${x.sourceLogicalName} | ${x.targetLogicalName} | ${x.sourceLabel} | ${x.targetFormTab} | ${x.targetSection} | ${x.columnIndex} | ${x.rowIndex} | ${x.headerPlacement} | ${x.viewPlacement} | ${x.metadataOnly} | ${x.simulationType} | ${x.safeContextPolicy} | ${x.providerPayloadPolicy} |`).join("\n");
  const md = `# Phase 1B Form Field Placement\n\nSource rows: ${matrix.length}. This is a local dry-run only; no Dataverse mutation occurred.\n\n## Supplemental mapping outside the 117-row source\n\n- 客户名称(中国語)(客户): \`aigw_customernamecn\`, Opportunity-level text simulation, used in Summary and the replica View; no Account link-entity is generated.\n\n| Source | Target | Label | Tab | Section | Col | Row | Header | View | Metadata only | Simulation | Safe Context | Provider Payload |\n|---|---|---|---|---|---:|---:|---|---|---|---|---|---|\n${mdTable}\n`;
  const structure = `# Target Form Structure\n\nForm draft: \`AI Gateway Opportunity Demo - Full Replica\`. The original Form ID \`${FORM_ID}\` is protected.\n\n## Header\n\n- System title: \`name\`\n- \`aigw_winprobabilityrank\`\n- \`aigw_budgetstatus\`\n- \`ownerid\`\n\n## Summary\n\n${Object.keys(summaryGroups).map((name) => `- ${name}: ${matrix.filter((x) => x.targetFormTab === "摘要" && x.targetSection === name && !x.metadataOnly).map((x) => `\`${x.targetLogicalName}\``).join(", ")}`).join("\n")}\n\n## Budget\n\nFour independent sections, each with three columns: revenue budget, GP/MP budget, volume budget.\n\n## Actuals\n\nPlaceholder only. \`writeBlocked=true\`; no verified related entity or relationship exists in current metadata.\n\n## Product, Files, Related\n\nSystem structure retained without additional functionality.\n`;
  const actualsMd = `# Actuals Subgrid Audit\n\n## Result\n\nNo reusable Opportunity-related actuals-management entity or relationship was found. The only display-name match was \`dataperformance\` (Data Performance Dashboard), which is not an identified Opportunity actuals relationship. Current Opportunity Form subgrids do not expose an actuals grid.\n\n## Phase 1B decision\n\n- Full actuals grid replication: blocked\n- Draft Form placeholder: allowed, \`writeBlocked=true\`\n- Dataverse write this phase: none\n\n## Future full implementation dependencies\n\n1. A dedicated actuals-management table.\n2. Opportunity lookup on that table.\n3. One-to-many relationship to Opportunity.\n4. Monthly revenue, GP/MP, volume and audit fields.\n5. A public/system view for the grid.\n6. A subgrid control bound to the confirmed relationship.\n\nEstimated future metadata: one table, one lookup, one relationship, one view, one subgrid control, and 36 monthly value fields plus annual/audit fields.\n`;
  const mappingRows = viewColumns.map(([label, logicalName, width], index) => ({ displayOrder: index + 1, sourceLabel: label, targetLogicalName: logicalName, targetExists: byLogical.has(logicalName), targetType: byLogical.get(logicalName)?.AttributeType || "", width, fetchAttribute: logicalName, layoutCell: logicalName, usesLinkEntity: false, alias: "", sort: index === 35 ? "modifiedon desc" : "" }));
  const manifest = { dryRun: true, safetyGate: { expectedDataverseUrl: EXPECTED_URL, expectedSolution: SOLUTION_UNIQUE_NAME, expectedPublisherPrefix: PUBLISHER_PREFIX, aiProvider: "demo", allowExternalAi: false }, source: SOURCE_PATH, originalComponents: { protectedFormId: FORM_ID, protectedViewId: VIEW_ID }, nextWrite: { createSystemform: { name: "AI Gateway Opportunity Demo - Full Replica", entity: "opportunity", draft: "phase1b-full-replica-formxml-draft.xml" }, createSavedquery: { name: "所有案件 - AI Demo Full Replica", entity: "opportunity", fetchXmlDraft: "phase1b-full-replica-fetchxml-draft.xml", layoutXmlDraft: "phase1b-full-replica-layoutxml-draft.xml" }, actualsSubgrid: { blocked: true, reason: "No verified related entity or relationship" } }, forbidden: ["modify_original_form", "modify_original_view", "modify_app", "create_bpf", "create_fields", "create_data", "publish_broadly"], publishScopeAfterConfirm: ["new systemform", "new savedquery"], appUpdate: "explicit separate authorization required", rollback: ["remove new form from app", "remove new view from app", "delete or deactivate only new copied components after separate confirmation", "original IDs remain unchanged"] };
  const files = {
    "phase1b-form-field-placement.md": md, "phase1b-form-field-placement.json": JSON.stringify({ generatedAt: new Date().toISOString(), source: SOURCE_PATH, matrix, supplementalMappings, validations }, null, 2),
    "phase1b-form-field-placement.csv": csv(matrix, ["sourceLogicalName", "targetLogicalName", "sourceLabel", "targetLabel", "sourceType", "targetType", "targetExists", "targetFormTab", "targetSection", "columnIndex", "rowIndex", "displayOrder", "headerPlacement", "viewPlacement", "metadataOnly", "simulationType", "typeMismatch", "specialControl", "visible", "disabled", "readOnlyRecommendation", "safeContextPolicy", "providerPayloadPolicy"]),
    "phase1b-target-form-structure.md": structure, "phase1b-full-replica-formxml-draft.xml": formDraft, "phase1b-full-replica-fetchxml-draft.xml": fetch, "phase1b-full-replica-layoutxml-draft.xml": layout,
    "phase1b-view-column-mapping.csv": csv(mappingRows, ["displayOrder", "sourceLabel", "targetLogicalName", "targetExists", "targetType", "width", "fetchAttribute", "layoutCell", "usesLinkEntity", "alias", "sort"]),
    "phase1b-actuals-subgrid-audit.md": actualsMd, "phase1b-write-manifest.json": JSON.stringify(manifest, null, 2)
  };
  await Promise.all(Object.entries(files).map(([name, content]) => fs.writeFile(path.join(docs, name), content, "utf8")));
  await fs.writeFile(path.join(backupDir, "05_generation_validation.json"), JSON.stringify({ validations, generatedFiles: Object.keys(files) }, null, 2));
  if (validations.sourceRows !== 117 || validations.duplicateSourceLogicalNames.length || validations.formMissingMetadata.length || validations.formDraftMissingMetadata.length || validations.viewMissingMetadata.length || !validations.fetchXml.ok || !validations.layoutXml.ok || !validations.formXml.ok || !validations.fetchLayoutOneToOne || !validations.monthlyBudgetOnly || !validations.noAllFieldsInSummary) throw new Error(`Validation failed: ${JSON.stringify(validations)}`);
  console.log(JSON.stringify({ backupDir: path.relative(root, backupDir), generatedFiles: Object.keys(files), validations, actuals: { matchingEntities: actualMatches.map((x) => x.logicalName), subgrids: formSubgrids.length, actualsSubgridFound: formSubgrids.some((x) => x.hasActualKeyword) } }, null, 2));
}


runDataverseCli(import.meta.url, main);
