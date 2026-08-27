import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, getRequiredLocalArtifactPath, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION = "CRMAIGatewayDemo";
let FORM_ID;
let ORIGINAL_FORM_ID;
let SOURCE;
const PLACEMENT = "docs/d365/phase1b-form-field-placement.json";
const DOCS = "docs/d365";

const STATUS_SEMANTICS = [
  { key: "rfq_received", sourceValue: 100000001, labels: { "1033": "RFQ Received", "2052": "已收到询盘及报价请求（RFQ）" } },
  { key: "proposal_quoted", sourceValue: 100000002, labels: { "1033": "Proposal / Quoted", "2052": "提案 / 已报价" } },
];
const BPF_BUILD_SHEET = {
  displayName: "销售流程 - AI Demo Full Replica",
  suggestedUniqueName: "aigw_salesprocess_aidemofullreplica",
  targetTable: "opportunity",
  createMethod: "Power Apps Process Designer only; do not construct workflow clientdata through Web API.",
  stages: [
    { name: "授予资格", order: 1, steps: [
      ["parentaccountid", "客户", true],
      ["aigw_organizationgroup_choice", "组织团体", true],
      ["aigw_salesdepartment_choice", "销售部门", true],
      ["aigw_opportunitytype", "案件类型", true],
      ["aigw_opportunitydetailtype", "案件详细信息", false],
    ] },
    { name: "案件关闭", order: 2, steps: [
      ["aigw_winprobabilityrank", "受注确度", false],
      ["statuscode", "状态描述", false],
      ["aigw_wonreason_choice", "受注理由", false],
      ["aigw_lostreason_choice", "失注理由", false],
      ["actualclosedate", "受注日期", false],
    ] },
  ],
};

const sha = (value) => createHash("sha256").update(String(value || "")).digest("hex");
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const label = (value) => value?.UserLocalizedLabel?.Label || value?.LocalizedLabels?.[0]?.Label || "";
const q = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = (rows, keys) => [keys.join(","), ...rows.map((row) => keys.map((key) => q(row[key])).join(","))].join("\n") + "\n";
const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] || "";
const tagStarts = (xml, name) => [...String(xml || "").matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map((match) => match[0]);
const boundFields = (xml) => [...String(xml || "").matchAll(/<control\b[^>]*\bdatafieldname="([^"]+)"/g)].map((match) => match[1]);
function findAllStages(value, out = []) {
  if (!value || typeof value !== "object") return out;
  if (String(value.__class || "").includes("StageStep")) out.push(value);
  for (const child of Object.values(value)) findAllStages(child, out);
  return out;
}
function stageSteps(stage) {
  const fields = [];
  const visit = (node, required = false) => {
    if (!node || typeof node !== "object") return;
    const nowRequired = required || node.isProcessRequired === true;
    if (node.dataFieldName) fields.push({ logicalName: node.dataFieldName, required: nowRequired, label: node.controlDisplayName || node.dataFieldName });
    for (const child of Object.values(node)) visit(child, nowRequired);
  };
  visit(stage);
  return [...new Map(fields.map((field) => [field.logicalName, field])).values()];
}
function controlledFields(clientdata) {
  const values = new Set();
  for (const match of String(clientdata || "").matchAll(/attributes\.get\(['"]([^'"]+)['"]\)/g)) values.add(match[1]);
  return [...values].sort();
}
function plainForm(xml) {
  return {
    tabs: tagStarts(xml, "tab").map((tag) => attr(tag, "name")),
    sections: tagStarts(xml, "section").map((tag) => attr(tag, "name")),
    fields: [...new Set(boundFields(xml))].sort(),
  };
}
function safeJson(value) { return JSON.stringify(value, null, 2); }

export async function main() {
  EXPECTED_URL = getDataverseUrl();
  FORM_ID = getRequiredEnvironmentId("D365_FULL_REPLICA_FORM_ID");
  ORIGINAL_FORM_ID = getRequiredEnvironmentId("D365_ORIGINAL_FORM_ID");
  SOURCE = getRequiredLocalArtifactPath("D365_OPPORTUNITY_RAW_EXPORT_PATH");
  const root = process.cwd();
  const client = createDynamicsClient();
  const get = async (url) => (await client.dataverseGet(url)).body;
  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: unexpected Dataverse URL");
  if ((process.env.AI_PROVIDER || "demo") !== "demo") throw new Error("Safety gate failed: AI_PROVIDER must be demo");
  if ((process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: ALLOW_EXTERNAL_AI must be false");

  const [source, placement, who, orgs, solutionResponse, attributesResponse, status, workflowsResponse, fullForm, originalForm] = await Promise.all([
    fs.readFile(path.join(root, SOURCE), "utf8").then(JSON.parse),
    fs.readFile(path.join(root, PLACEMENT), "utf8").then(JSON.parse),
    get("/api/data/v9.2/WhoAmI()"),
    get("/api/data/v9.2/organizations?$select=name,organizationid,languagecode"),
    get(`/api/data/v9.2/solutions?$select=solutionid,friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=LogicalName,AttributeType,RequiredLevel,IsValidForCreate,IsValidForUpdate,IsManaged,IsCustomAttribute,SourceType,DisplayName"),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='statuscode')/Microsoft.Dynamics.CRM.StatusAttributeMetadata?$select=LogicalName,AttributeType&$expand=OptionSet($select=Options)"),
    get("/api/data/v9.2/workflows?$select=workflowid,name,uniquename,category,primaryentity,statecode,statuscode,ismanaged,clientdata,processorder&$filter=primaryentity eq 'opportunity'"),
    get(`/api/data/v9.2/systemforms(${FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,isdefault,formactivationstate,componentstate,formxml,formjson,formpresentation,versionnumber`),
    get(`/api/data/v9.2/systemforms(${ORIGINAL_FORM_ID})?$select=formid,formxml,formjson,formpresentation`),
  ]);
  if (source.length !== 117) throw new Error(`Source audit must contain 117 rows, found ${source.length}`);
  const solution = solutionResponse.value?.[0];
  if (!solution || solution.ismanaged !== false || solution.friendlyname !== "CRM AI Gateway Demo") throw new Error("Safety gate failed: solution is not the expected unmanaged solution");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix,customizationoptionvalueprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Safety gate failed: publisher prefix is not aigw");
  if (fullForm.isdefault !== false || fullForm.formactivationstate !== 0) throw new Error("Safety gate failed: Full Replica Form must remain inactive and non-default");

  const byTarget = new Map((attributesResponse.value || []).map((item) => [item.LogicalName, item]));
  const matrix = placement.matrix || placement;
  const bySource = new Map(matrix.map((item) => [item.sourceLogicalName, item]));
  const targetFields = [...new Set(matrix.map((item) => item.targetLogicalName).filter((name) => byTarget.has(name)))];
  const fetchXml = `<fetch><entity name="opportunity"><attribute name="opportunityid" />${targetFields.map((name) => `<attribute name="${name}" />`).join("")}<filter><condition attribute="name" operator="like" value="[[]AI-DEMO]%" /></filter></entity></fetch>`;
  const demoRows = (await get(`/api/data/v9.2/opportunities?fetchXml=${encodeURIComponent(fetchXml)}`)).value || [];
  const rowHasValue = (row, field) => {
    const attribute = byTarget.get(field);
    const keys = [field];
    if (["Lookup", "Customer", "Owner"].includes(attribute?.AttributeType)) keys.push(`_${field}_value`);
    return keys.some((key) => Object.hasOwn(row, key) && row[key] !== null);
  };
  const nullCount = (field) => demoRows.filter((row) => !rowHasValue(row, field)).length;
  const formFields = new Set(plainForm(fullForm.formxml).fields);
  const businessRules = (workflowsResponse.value || []).filter((workflow) => workflow.category === 2);
  const ruleFields = new Set(businessRules.flatMap((rule) => controlledFields(rule.clientdata)));

  const requiredAudit = source.map((field) => {
    const placementRow = bySource.get(field.fieldLogicalName);
    const targetLogicalName = placementRow?.targetLogicalName || field.fieldLogicalName;
    const target = byTarget.get(targetLogicalName);
    const sourceRequired = field.required || "optional";
    const targetRequired = target?.RequiredLevel?.Value || "missing";
    const isCalculated = target?.SourceType === 1;
    const isRollup = target?.SourceType === 2;
    const isReadOnly = target && (!target.IsValidForCreate || !target.IsValidForUpdate);
    const special = ["statecode", "statuscode", "ownerid", "actualvalue"].includes(targetLogicalName);
    const currentDemoNullCount = target ? nullCount(targetLogicalName) : demoRows.length;
    let recommendedAction = "keep_current";
    let risk = "low";
    if (!target) { recommendedAction = "missing_metadata_investigate"; risk = "high"; }
    else if (targetRequired === "SystemRequired") recommendedAction = "platform_system_required_no_change";
    else if (special) { recommendedAction = targetLogicalName === "actualvalue" ? "manual_review_standard_money_field" : "platform_status_or_owner_no_change"; risk = "medium"; }
    else if (sourceRequired === "required" && targetRequired !== "ApplicationRequired") {
      if (isCalculated || isRollup || isReadOnly) { recommendedAction = "do_not_change_calculated_rollup_or_readonly"; risk = "high"; }
      else if (currentDemoNullCount > 0) { recommendedAction = "backfill_demo_data_before_business_required"; risk = "high"; }
      else if (ruleFields.has(targetLogicalName)) { recommendedAction = "review_business_rule_before_business_required"; risk = "medium"; }
      else { recommendedAction = "candidate_set_business_required"; risk = "medium"; }
    } else if (sourceRequired !== "required" && ["ApplicationRequired", "SystemRequired"].includes(targetRequired)) recommendedAction = "do_not_downgrade_existing_platform_requirement";
    return {
      sourceLogicalName: field.fieldLogicalName, targetLogicalName, displayLabel: target ? label(target.DisplayName) : field.label,
      sourceRequired, targetRequired, targetType: target?.AttributeType || "missing", isCalculated, isRollup, isReadOnly: Boolean(isReadOnly),
      formVisible: formFields.has(targetLogicalName), formRequiredIndicator: formFields.has(targetLogicalName) ? "platformDerivedFromRequiredLevel" : "notOnFullReplicaForm",
      referencedByBusinessRule: ruleFields.has(targetLogicalName), currentDemoNullCount, recommendedAction, risk,
    };
  });

  const statusOptions = (status.OptionSet?.Options || []).map((option) => ({
    value: option.Value, stateCode: option.State, labels: Object.fromEntries((option.Label?.LocalizedLabels || []).map((item) => [item.LanguageCode, item.Label])), transitionData: option.TransitionData || null,
  }));
  const existingStatusValues = new Set(statusOptions.map((option) => option.value));
  const statusAudit = {
    currentOptions: statusOptions,
    demoStatusUsage: Object.fromEntries(statusOptions.map((option) => [option.value, demoRows.filter((row) => row.statuscode === option.value).length])),
    transitionsEnabled: statusOptions.some((option) => Boolean(option.transitionData)),
    standardLocalization: [
      { value: 1, englishPreserved: statusOptions.find((option) => option.value === 1)?.labels?.["1033"] === "In Progress", add2052: "有效案件", operation: "UpdateOptionValue", mergeLabels: true, nonBlocking: true },
      { value: 2, englishPreserved: statusOptions.find((option) => option.value === 2)?.labels?.["1033"] === "On Hold", add2052: "无效案件", operation: "UpdateOptionValue", mergeLabels: true, nonBlocking: true },
    ],
    newValues: STATUS_SEMANTICS.map((semantic) => ({ ...semantic, stateCode: 0, sourceValueAlreadyUsed: existingStatusValues.has(semantic.sourceValue), targetValue: null, operation: "InsertStatusValue", mustReadNewOptionValue: true })),
  };

  const bpfs = (workflowsResponse.value || []).filter((workflow) => workflow.category === 4).map((workflow) => {
    let parsed; try { parsed = JSON.parse(workflow.clientdata || "{}"); } catch { parsed = {}; }
    return {
      workflowId: workflow.workflowid, name: workflow.name, uniqueName: workflow.uniquename, managed: workflow.ismanaged,
      active: workflow.statecode === 1 && workflow.statuscode === 2, processOrder: workflow.processorder,
      stages: findAllStages(parsed).map((stage, index) => ({ order: index + 1, stageId: stage.stageId || stage.stepLabels?.list?.[0]?.labelId || null, name: stage.stepLabels?.list?.find((item) => item.languageCode === 1033)?.description || stage.description, steps: stageSteps(stage) })),
    };
  });
  const standardSalesProcess = bpfs.find((bpf) => bpf.uniqueName === "opportunitysalesprocess");
  const instanceEntity = await get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunitysalesprocess')?$select=EntitySetName");
  const instanceFetch = `<fetch aggregate="true"><entity name="opportunitysalesprocess"><attribute name="businessprocessflowinstanceid" alias="count" aggregate="count" /><attribute name="activestageid" alias="active_stage" groupby="true" /><link-entity name="opportunity" from="opportunityid" to="opportunityid"><filter><condition attribute="name" operator="like" value="[[]AI-DEMO]%" /></filter></link-entity></entity></fetch>`;
  const instanceRows = (await get(`/api/data/v9.2/${instanceEntity.EntitySetName}?fetchXml=${encodeURIComponent(instanceFetch)}`)).value || [];
  const bpfAudit = { currentOpportunityBpfs: bpfs, previewProcessSource: standardSalesProcess || null, demoInstances: instanceRows, buildSheet: BPF_BUILD_SHEET, writeBlocked: true,
    designerPhases: ["M3-A audit/build sheet", "M3-B user creates and saves draft in Power Apps", "M3-C Codex read-only verification", "M3-D separately authorize activation", "M3-E separately configure roles/order/App", "M3-F separately decide instance strategy"],
  };

  const manifests = {
    generatedAt: new Date().toISOString(), dryRun: true,
    safetyGate: { dataverseUrl: EXPECTED_URL, solution: SOLUTION, publisherPrefix: "aigw", aiProvider: "demo", allowExternalAi: false, protectedFormId: FORM_ID, protectedOriginalFormId: ORIGINAL_FORM_ID },
    M1_statusReason: {
      allowedOperation: "POST InsertStatusValue only after separate authorization", noPublish: true, noDataChange: true,
      optionalLocalization: statusAudit.standardLocalization, inserts: statusAudit.newValues,
      postInsertStopConditions: ["duplicate returned target value", "returned value already existed", "stateCode is not 0", "1033 or 2052 label mismatch", "transition metadata blocks use"],
      mappingOutput: { path: "local-artifacts/d365/docs/d365/status-reason-mapping.json", writeOnlyAfterBothVerified: true, noNumericValueMayBeHardcodedElsewhere: true },
      rollback: "Do not automatically delete a newly created status reason. Record returned values and require a separate explicit authorization for any DeleteStatusValue action.",
    },
    M2_requiredLevel: {
      allowedOperation: "Metadata update only after separate authorization", noDataChange: true, noBusinessRuleChange: true,
      candidates: requiredAudit.filter((item) => item.recommendedAction === "candidate_set_business_required").map((item) => item.targetLogicalName),
      blockers: requiredAudit.filter((item) => item.recommendedAction !== "candidate_set_business_required" && item.sourceRequired === "required").map((item) => ({ field: item.targetLogicalName, action: item.recommendedAction })),
      publishImpact: "If metadata is changed, publish only opportunity after explicit authorization; no broad publish.",
      rollback: "RequiredLevel rollback is a separate authorized metadata update after confirming no SystemRequired or existing platform requirement is lowered.",
    },
    M3_bpf: {
      createMethod: "Power Apps Process Designer by user only", noWebApiWorkflowConstruction: true, noActivation: true, noProcessOrderOrRoleOrAppChange: true, noRecordInstanceOrProcessSwitch: true,
      buildSheet: BPF_BUILD_SHEET, verification: ["workflow ID", "processstage IDs and order", "data steps", "solution membership", "draft state"],
      futureInstancePolicy: "Do not use deprecated SetProcess. Design against the new BPF instance entity only after it exists and official supported behavior is verified.",
      rollback: "Keep draft inactive. Any deletion or deactivation of the new BPF requires separate authorization and never touches Microsoft managed Sales Process.",
    },
  };

  const date = stamp(); const backup = path.join(root, "backups", "dataverse", `phase1b_m0_${date}`); await fs.mkdir(backup, { recursive: true }); await fs.mkdir(path.join(root, DOCS), { recursive: true });
  const files = {
    "phase1b-m0-status-reason-audit.json": safeJson(statusAudit),
    "phase1b-m0-required-level-audit.json": safeJson({ total: requiredAudit.length, rows: requiredAudit }),
    "phase1b-m0-required-level-audit.csv": csv(requiredAudit, ["sourceLogicalName", "targetLogicalName", "displayLabel", "sourceRequired", "targetRequired", "targetType", "isCalculated", "isRollup", "isReadOnly", "formVisible", "formRequiredIndicator", "referencedByBusinessRule", "currentDemoNullCount", "recommendedAction", "risk"]),
    "phase1b-m0-bpf-audit.json": safeJson(bpfAudit),
    "phase1b-m0-write-manifests.json": safeJson(manifests),
  };
  const statusMd = `# Phase 1B M0 Status Reason Audit\n\nRead-only audit. No Dataverse write occurred.\n\n- Publisher option value prefix: \`${publisher.customizationoptionvalueprefix}\`\n- Current [AI-DEMO] usage: ${safeJson(statusAudit.demoStatusUsage)}\n- Transition metadata enabled: \`${statusAudit.transitionsEnabled}\`\n- New values use \`InsertStatusValue\` without a fixed target value; returned \`NewOptionValue\` is authoritative.\n- Standard 1/2 English labels remain unchanged. Chinese localization is optional/non-blocking and uses \`UpdateOptionValue\` with \`MergeLabels=true\`.\n`;
  const bpfMd = `# Phase 1B M0 BPF Audit\n\nRead-only audit. The current managed \`Sales Process\` is the Full Replica preview source: ${standardSalesProcess?.stages?.map((stage) => stage.name).join(" -> ") || "not found"}.\n\n## Approved build sheet\n\n- Display name: ${BPF_BUILD_SHEET.displayName}\n- Suggested unique name: ${BPF_BUILD_SHEET.suggestedUniqueName}\n- Target table: opportunity\n- Creation path: Power Apps Process Designer by user only\n\n${BPF_BUILD_SHEET.stages.map((stage) => `### ${stage.order}. ${stage.name}\n${stage.steps.map(([logicalName, displayName, required]) => `- \`${logicalName}\` | ${displayName} | Required: ${required ? "Yes" : "No"}`).join("\n")}`).join("\n\n")}\n\nThe two close-reason fields remain optional. Conditional required behavior is explicitly deferred to a separate Business Rule design.\n`;
  const buildSheet = `# Sales Process - AI Demo Full Replica: Designer Build Sheet\n\n## Scope\n\nCreate manually in Power Apps Process Designer:\n\n\`Sales Trial -> Solutions -> CRM AI Gateway Demo -> New -> Automation -> Process -> Business process flow\`\n\nSave as a draft only. Do not activate, set process order, configure security roles, add to an App, or create/switch process instances.\n\n## Definition\n\n- Display name: \`${BPF_BUILD_SHEET.displayName}\`\n- Suggested unique name: \`${BPF_BUILD_SHEET.suggestedUniqueName}\`\n- Primary table: \`opportunity\`\n- Solution: \`CRMAIGatewayDemo\`\n\n${BPF_BUILD_SHEET.stages.map((stage) => `## Stage ${stage.order}: ${stage.name}\n\n| Order | Logical name | Display label | Required |\n|---:|---|---|---|\n${stage.steps.map(([logicalName, displayName, required], index) => `| ${index + 1} | \`${logicalName}\` | ${displayName} | ${required ? "Yes" : "No"} |`).join("\n")}\n`).join("\n")}\n## Post-save verification (M3-C)\n\nVerify only: workflow ID, processstage IDs and order, each data step, required flags, solution membership, draft/inactive state, and no impact to the managed \`Sales Process\`.\n\n## Deferred\n\n- Conditional required rule: won -> \`aigw_wonreason_choice\`; lost -> \`aigw_lostreason_choice\`.\n- Activation, security roles, process order, App integration, and all BPF instance decisions.\n- Do not use deprecated \`SetProcess\`.\n`;
  await Promise.all(Object.entries(files).map(([name, content]) => fs.writeFile(path.join(root, DOCS, name), content, "utf8")));
  await Promise.all([
    fs.writeFile(path.join(root, DOCS, "phase1b-m0-status-reason-audit.md"), statusMd, "utf8"),
    fs.writeFile(path.join(root, DOCS, "phase1b-m0-bpf-audit.md"), bpfMd, "utf8"),
    fs.writeFile(path.join(root, DOCS, "phase1b-m3-bpf-designer-build-sheet.md"), buildSheet, "utf8"),
    fs.writeFile(path.join(backup, "full-replica-unpublished-formxml.xml"), fullForm.formxml, "utf8"),
    fs.writeFile(path.join(backup, "full-replica-unpublished-formjson.json"), fullForm.formjson, "utf8"),
    fs.writeFile(path.join(backup, "m0-readonly-summary.json"), safeJson({ whoAmI: who, organization: orgs.value?.[0], solution, publisher: { prefix: publisher.customizationprefix, optionValuePrefix: publisher.customizationoptionvalueprefix }, fullForm: { isdefault: fullForm.isdefault, formactivationstate: fullForm.formactivationstate, hashes: { formxml: sha(fullForm.formxml), formjson: sha(fullForm.formjson) } }, originalHashes: { formxml: sha(originalForm.formxml), formjson: sha(originalForm.formjson), formpresentation: sha(originalForm.formpresentation) } }), "utf8"),
  ]);
  const validations = { sourceRows: requiredAudit.length, requiredCsvRows: requiredAudit.length, allTargetsMapped: requiredAudit.every((item) => item.targetLogicalName), noMutationMethods: true, formInactive: fullForm.formactivationstate === 0, formNonDefault: fullForm.isdefault === false, aiSafe: (process.env.AI_PROVIDER || "demo") === "demo" && (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() === "false" };
  if (validations.sourceRows !== 117 || !validations.allTargetsMapped || !validations.formInactive || !validations.formNonDefault || !validations.aiSafe) throw new Error(`Validation failed: ${safeJson(validations)}`);
  console.log(safeJson({ backup: path.relative(root, backup), files: Object.keys(files).concat(["phase1b-m0-status-reason-audit.md", "phase1b-m0-bpf-audit.md"]), validations, summary: { demoCount: demoRows.length, statusOptions: statusOptions.length, requiredCandidates: manifests.M2_requiredLevel.candidates.length, businessRules: businessRules.length, bpfs: bpfs.length, demoBpfInstances: instanceRows, publisherOptionValuePrefix: publisher.customizationoptionvalueprefix } }));
}


runDataverseCli(import.meta.url, main);
