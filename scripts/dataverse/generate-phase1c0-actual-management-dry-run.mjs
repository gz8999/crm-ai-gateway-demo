import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION = "CRMAIGatewayDemo";
let FORM_ID;
const TARGET_TABLE = "aigw_actualmanagement";
const RELATIONSHIP = "aigw_opportunity_actualmanagement";
const VIEW_NAME = "实绩管理 - AI Demo";
const MONTHS = [
  ["april", "April", "4月"], ["may", "May", "5月"], ["june", "June", "6月"],
  ["july", "July", "7月"], ["august", "August", "8月"], ["september", "September", "9月"],
  ["october", "October", "10月"], ["november", "November", "11月"], ["december", "December", "12月"],
  ["january", "January", "1月"], ["february", "February", "2月"], ["march", "March", "3月"],
];
const MEASURES = [
  ["actualrevenue", "Actual Revenue", "实绩收入"],
  ["actualgp", "Actual GP", "实绩毛利润"],
  ["actualmp", "Actual MP", "实绩边际利润"],
];

const hash = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const nowStamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const labels = (label) => Object.fromEntries((label?.LocalizedLabels || []).map((item) => [String(item.LanguageCode), item.Label]));
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const xmlEscape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const labelText = (label) => Object.values(labels(label)).join(" ");
const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));

export async function main() {
  EXPECTED_URL = getDataverseUrl();
  FORM_ID = getRequiredEnvironmentId("D365_FULL_REPLICA_FORM_ID");
  const root = process.cwd();
  const docs = path.join(root, "docs", "d365");
  const backup = path.join(root, "backups", "dataverse", `phase1c0_actual_management_${nowStamp()}`);
  const client = createDynamicsClient();
  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: Dataverse URL mismatch.");
  if ((process.env.AI_PROVIDER || "demo") !== "demo") throw new Error("Safety gate failed: AI_PROVIDER must be demo.");
  if ((process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: ALLOW_EXTERNAL_AI must be false.");
  const get = async (url) => (await client.dataverseGet(url)).body;
  const getAll = async (url) => {
    const rows = [];
    let next = url;
    while (next) {
      const body = await get(next);
      rows.push(...(body.value || []));
      next = body["@odata.nextLink"] || "";
    }
    return rows;
  };

  const [solutionResponse, entityDefinitions, opportunityRelationships, opportunityForms, unpublishedForm, organization, cnyCurrencies, demoCountResponse] = await Promise.all([
    get(`/api/data/v9.2/solutions?$select=solutionid,uniquename,friendlyname,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
    getAll("/api/data/v9.2/EntityDefinitions?$select=MetadataId,LogicalName,SchemaName,EntitySetName,PrimaryNameAttribute,ObjectTypeCode,OwnershipType,IsCustomEntity,IsManaged,DisplayName,DisplayCollectionName"),
    getAll("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/OneToManyRelationships?$select=MetadataId,SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,IsManaged,CascadeConfiguration"),
    getAll("/api/data/v9.2/systemforms?$select=formid,name,objecttypecode,type,formxml,ismanaged&$filter=objecttypecode eq 'opportunity'"),
    get(`/api/data/v9.2/systemforms(${FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished?$select=formid,name,formxml,formjson,formactivationstate,isdefault,componentstate`),
    get("/api/data/v9.2/organizations?$select=organizationid,name,languagecode,_basecurrencyid_value"),
    get("/api/data/v9.2/transactioncurrencies?$select=transactioncurrencyid,currencyname,isocurrencycode,currencyprecision,exchangerate&$filter=isocurrencycode eq 'CNY'"),
    get(`/api/data/v9.2/opportunities?fetchXml=${encodeURIComponent(`<fetch aggregate="true"><entity name="opportunity"><attribute name="opportunityid" alias="count" aggregate="count"/><filter><condition attribute="name" operator="like" value="[[]AI-DEMO]%"/></filter></entity></fetch>`)}`),
  ]);
  const solution = solutionResponse.value?.[0];
  if (!solution || solution.friendlyname !== "CRM AI Gateway Demo" || solution.ismanaged !== false) throw new Error("Safety gate failed: unmanaged solution mismatch.");
  const publisher = await get(`/api/data/v9.2/publishers(${solution._publisherid_value})?$select=customizationprefix`);
  if (publisher.customizationprefix !== "aigw") throw new Error("Safety gate failed: publisher prefix mismatch.");
  if (unpublishedForm.formactivationstate !== 0 || unpublishedForm.isdefault !== false || unpublishedForm.componentstate !== 1) throw new Error("Safety gate failed: Full Replica form is not inactive/non-default/unpublished.");

  const referenceNames = ["aigw_yearrevenueactual", "aigw_yearrevenueactualcny", "aigw_m4revenuebudget", "aigw_m4gpmpbudget"];
  const moneyReferences = [];
  for (const logicalName of referenceNames) {
    moneyReferences.push(await get(`/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='${logicalName}')/Microsoft.Dynamics.CRM.MoneyAttributeMetadata?$select=MetadataId,LogicalName,SchemaName,AttributeType,Precision,PrecisionSource,MinValue,MaxValue,IsBaseCurrency,RequiredLevel`));
  }

  const candidatePattern = /(实绩|业绩|actual|performance|revenue)/i;
  const candidateEntities = entityDefinitions.filter((entity) => candidatePattern.test(`${entity.LogicalName} ${entity.SchemaName} ${labelText(entity.DisplayName)} ${labelText(entity.DisplayCollectionName)}`) || ["dataperformance", "opportunityproduct"].includes(entity.LogicalName));
  const targetCollision = entityDefinitions.find((entity) => entity.LogicalName === TARGET_TABLE) || null;
  const candidateViews = [];
  for (const entity of candidateEntities) {
    try {
      const views = await getAll(`/api/data/v9.2/savedqueries?$select=savedqueryid,name,returnedtypecode,statecode,ismanaged,fetchxml,layoutxml&$filter=returnedtypecode eq '${entity.LogicalName}'`);
      candidateViews.push(...views.map((view) => ({ ...view, entity: entity.LogicalName })));
    } catch {
      // Some virtual/system tables reject SavedQuery filtering; the table remains in the audit.
    }
  }

  const subgridControls = [];
  const scanSubgrids = (form) => {
    const regex = /<control\b[^>]*indicationOfSubgrid="true"[^>]*>[\s\S]*?<\/control>/gi;
    for (const match of String(form.formxml || "").matchAll(regex)) {
      const xml = match[0];
      subgridControls.push({
        formId: form.formid,
        formName: form.name,
        controlId: /\bid="([^"]+)"/.exec(xml)?.[1] || "",
        targetEntity: /<TargetEntityType>([^<]*)<\/TargetEntityType>/.exec(xml)?.[1] || "",
        relationshipName: /<RelationshipName>([^<]*)<\/RelationshipName>/.exec(xml)?.[1] || "",
        viewId: /<ViewId>([^<]*)<\/ViewId>/.exec(xml)?.[1] || "",
      });
    }
  };
  opportunityForms.forEach(scanSubgrids);
  scanSubgrids(unpublishedForm);
  const uniqueSubgridControls = [...new Map(subgridControls.map((control) => [`${control.formId}:${control.controlId}:${control.targetEntity}:${control.relationshipName}`, control])).values()];

  const relevantRelationships = opportunityRelationships.filter((relationship) => candidatePattern.test(`${relationship.SchemaName} ${relationship.ReferencingEntity} ${relationship.ReferencingAttribute}`) || relationship.ReferencingEntity === "opportunityproduct");
  const relationshipCollision = opportunityRelationships.find((relationship) => relationship.SchemaName.toLowerCase() === RELATIONSHIP.toLowerCase()) || null;
  const reusableCandidates = candidateEntities.map((entity) => {
    const related = relevantRelationships.filter((relationship) => relationship.ReferencingEntity === entity.LogicalName);
    const views = candidateViews.filter((view) => view.entity === entity.LogicalName);
    const subgrids = uniqueSubgridControls.filter((control) => control.targetEntity === entity.LogicalName);
    let assessment = "Not suitable";
    if (entity.LogicalName === "dataperformance") assessment = "System Data Performance Dashboard metadata; unrelated to Opportunity actual results.";
    else if (entity.LogicalName === "opportunityproduct") assessment = "Standard opportunity line-item table; product/revenue semantics and lifecycle do not match monthly actual management.";
    else if (related.length) assessment = "Related candidate requires manual semantic confirmation; no direct actual-management match identified.";
    return { logicalName: entity.LogicalName, schemaName: entity.SchemaName, displayNames: labels(entity.DisplayName), ownershipType: entity.OwnershipType, isCustomEntity: entity.IsCustomEntity, isManaged: entity.IsManaged, relatedOpportunityRelationships: related, savedQueries: views.map((view) => ({ savedqueryid: view.savedqueryid, name: view.name, statecode: view.statecode })), existingOpportunitySubgrids: subgrids, assessment };
  });

  const annualReference = moneyReferences.find((item) => item.LogicalName === "aigw_yearrevenueactual");
  const monthlyReference = moneyReferences.find((item) => item.LogicalName === "aigw_m4revenuebudget");
  const monthlyGpReference = moneyReferences.find((item) => item.LogicalName === "aigw_m4gpmpbudget");
  const moneyPolicy = (reference) => ({ precision: reference.Precision, precisionSource: reference.PrecisionSource, minValue: reference.MinValue, maxValue: reference.MaxValue, isBaseCurrency: reference.IsBaseCurrency, referenceField: reference.LogicalName });
  const fields = [
    { logicalName: "aigw_name", schemaName: "aigw_Name", label1033: "Actual Name", label2052: "实绩名称", type: "String", precision: null, minValue: null, maxValue: null, maxLength: 200, requiredLevel: "ApplicationRequired", currencyStrategy: "Not applicable", safeContextPolicy: "Tokenize as actualRecordToken; never send the name.", providerPayloadPolicy: "Forbidden raw value" },
    { logicalName: "aigw_opportunityid", schemaName: "aigw_OpportunityId", label1033: "Related Opportunity", label2052: "相关商机", type: "Lookup(opportunity)", precision: null, minValue: null, maxValue: null, maxLength: null, requiredLevel: "ApplicationRequired", currencyStrategy: "Not applicable", safeContextPolicy: "Use opportunityToken only.", providerPayloadPolicy: "Forbidden record ID and raw opportunity name" },
    { logicalName: "aigw_expectedorderdate", schemaName: "aigw_ExpectedOrderDate", label1033: "Expected Order Date", label2052: "预计下单日", type: "DateTime(DateOnly)", precision: null, minValue: "1900-01-01", maxValue: "9999-12-30", maxLength: null, requiredLevel: "None", currencyStrategy: "Not applicable", safeContextPolicy: "Derive fiscal period or overdue/due-soon category only.", providerPayloadPolicy: "Exact date forbidden" },
    { logicalName: "aigw_annualactualrevenue", schemaName: "aigw_AnnualActualRevenue", label1033: "Annual Actual Revenue", label2052: "年度实绩收入", type: "Money", ...moneyPolicy(annualReference), maxLength: null, requiredLevel: "None", currencyStrategy: "Transaction-currency Money; Dataverse automatically creates aigw_annualactualrevenue_base. Because the environment base currency is CNY, the generated base value is the authoritative CNY conversion.", safeContextPolicy: "Amount band and annual trend only; never expose both transaction and base exact values.", providerPayloadPolicy: "Exact transaction/base amounts forbidden" },
  ];
  for (const [monthLogical, monthEnglish, monthChinese] of MONTHS) {
    for (const [measureLogical, measureEnglish, measureChinese] of MEASURES) {
      const reference = measureLogical === "actualrevenue" ? monthlyReference : monthlyGpReference;
      fields.push({ logicalName: `aigw_${monthLogical}${measureLogical}`, schemaName: `aigw_${monthEnglish}${measureEnglish.replaceAll(" ", "")}`, label1033: `${monthEnglish} ${measureEnglish}`, label2052: `${monthChinese}${measureChinese}`, type: "Money", ...moneyPolicy(reference), maxLength: null, requiredLevel: "None", currencyStrategy: `Transaction-currency Money; Dataverse creates aigw_${monthLogical}${measureLogical}_base automatically.`, safeContextPolicy: "Monthly band/trend/variance/anomaly derivation only.", providerPayloadPolicy: "Exact monthly amount forbidden" });
    }
  }

  const viewColumns = [
    ["aigw_name", 240], ["aigw_opportunityid", 240], ["aigw_expectedorderdate", 130],
    ["aigw_annualactualrevenue", 150], ["aigw_annualactualrevenue_base", 170], ["modifiedon", 140],
  ];
  const fetchXml = `<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">\n  <entity name="${TARGET_TABLE}">\n${viewColumns.map(([name]) => `    <attribute name="${name}" />`).join("\n")}\n    <order attribute="modifiedon" descending="true" />\n  </entity>\n</fetch>\n`;
  const layoutXml = `<grid name="resultset" object="{ACTUAL_MANAGEMENT_OBJECT_TYPE_CODE}" jump="aigw_name" select="1" icon="1" preview="1">\n  <row name="result" id="aigw_actualmanagementid">\n${viewColumns.map(([name, width]) => `    <cell name="${name}" width="${width}" />`).join("\n")}\n  </row>\n</grid>\n`;
  const subgridXml = `<section name="aigw_fr_actuals_information" id="{508807DB-004E-4481-912A-CE6BA43CF6BC}" showlabel="true" columns="1">\n  <labels><label description="实绩" languagecode="1033" /></labels>\n  <rows><row><cell id="{ACTUAL_MANAGEMENT_SUBGRID_CELL_ID}" showlabel="true">\n    <labels><label description="实绩管理" languagecode="1033" /></labels>\n    <control id="aigw_actualmanagement_subgrid" classid="{E7A81278-8635-4d9e-8D4D-59480B391C5B}" indicationOfSubgrid="true">\n      <parameters>\n        <TargetEntityType>${TARGET_TABLE}</TargetEntityType>\n        <RelationshipName>${RELATIONSHIP}</RelationshipName>\n        <ViewId>{ACTUAL_MANAGEMENT_VIEW_ID}</ViewId>\n        <ViewIds>{ACTUAL_MANAGEMENT_VIEW_ID}</ViewIds>\n        <IsUserView>false</IsUserView>\n        <RecordsPerPage>10</RecordsPerPage>\n        <AutoExpand>Fixed</AutoExpand>\n        <EnableViewPicker>false</EnableViewPicker>\n        <EnableQuickFind>true</EnableQuickFind>\n      </parameters>\n    </control>\n  </cell></row></rows>\n</section>\n`;

  const relationshipDesign = {
    schemaName: RELATIONSHIP,
    referencedEntity: "opportunity",
    referencingEntity: TARGET_TABLE,
    lookup: { logicalName: "aigw_opportunityid", schemaName: "aigw_OpportunityId", requiredLevel: "ApplicationRequired" },
    cascadeConfiguration: { Assign: "NoCascade", Delete: "Restrict", Merge: "NoCascade", Reparent: "NoCascade", Share: "NoCascade", Unshare: "NoCascade", RollupView: "NoCascade" },
    rationale: "Restrict prevents deleting an Opportunity that still has actual records; all other operations avoid implicit propagation.",
  };
  const currentFormAudit = {
    formId: FORM_ID,
    formXmlSha256: hash(unpublishedForm.formxml),
    formJsonSha256: hash(unpublishedForm.formjson),
    actualsTabFound: unpublishedForm.formxml.includes('name="aigw_fr_tab_actuals"'),
    actualsSectionFound: unpublishedForm.formxml.includes('name="aigw_fr_actuals_information"'),
    actualManagementSubgridFound: unpublishedForm.formxml.includes(`TargetEntityType>${TARGET_TABLE}<`),
  };
  if (!currentFormAudit.actualsTabFound || !currentFormAudit.actualsSectionFound || currentFormAudit.actualManagementSubgridFound) throw new Error("Form audit gate failed: expected empty Actuals target section was not found.");
  const seedManifest = {
    dryRun: true,
    targetTable: TARGET_TABLE,
    sourceFilter: "opportunity.name begins with [AI-DEMO]",
    currentSourceCount: Number(demoCountResponse.value?.[0]?.count || 0),
    plannedRecordCount: 100,
    recordsPerOpportunity: 1,
    identifiers: { actualNamePattern: "[AI-DEMO-ACTUAL] ACT-0001..0100", association: "Resolve the current Opportunity ID at execution time; do not persist IDs in provider payloads." },
    generation: {
      currency: "CNY synthetic records only",
      annualRevenue: "Sum of April-March synthetic monthly revenue",
      annualRevenueBase: "Dataverse-generated aigw_annualactualrevenue_base; never PATCH directly. With CNY transaction currency and exchange rate 1, it must equal annualRevenue.",
      monthlyRevenue: "Deterministic demo-only values by record index and month; no imported CRM amounts",
      monthlyGp: "10%-18% of monthly revenue",
      monthlyMp: "6%-12% of monthly revenue and never above GP or revenue",
      expectedOrderDate: "Synthetic fiscal-year dates only",
    },
    invariants: ["GP <= Revenue", "MP <= GP", "MP <= Revenue", "No real names/routes/amounts/notes", "No Opportunity fields modified"],
    rollback: { method: "Delete only rows whose created IDs are recorded by the Phase 1C-5 execution log.", fieldLevel: "Each create log records all submitted fields with before=null; never PATCH pre-existing actual rows during rollback." },
  };

  const phase = (id, title, authorizationPhrase, writes, prerequisites, validation, publishImpact, rollback, extra = {}) => ({ phase: id, title, dryRun: true, authorizationPhrase, targetEnvironment: EXPECTED_URL, solution: SOLUTION, writes, prerequisites, validation, publishImpact, rollback, forbidden: ["Production CRM", "Existing Business Rule/BPF activation or modification", "Opportunity data mutation unless explicitly stated", "External LLM", "Broad PublishXml"], ...extra });
  const localizedLabel = (english, chinese) => ({ "@odata.type": "Microsoft.Dynamics.CRM.Label", LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: english, LanguageCode: 1033 }, { "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: chinese, LanguageCode: 2052 }] });
  const requiredLevel = (value) => ({ Value: value, CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" });
  const attributePayload = (field) => {
    const common = { SchemaName: field.schemaName, DisplayName: localizedLabel(field.label1033, field.label2052), RequiredLevel: requiredLevel(field.requiredLevel) };
    if (field.type === "Money") return { "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata", ...common, Precision: field.precision, PrecisionSource: field.precisionSource, MinValue: field.minValue, MaxValue: field.maxValue };
    if (field.type === "DateTime(DateOnly)") return { "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", ...common, Format: "DateOnly" };
    throw new Error(`Unsupported Phase 1C-1 attribute type: ${field.type}`);
  };
  const primaryField = fields.find((field) => field.logicalName === "aigw_name");
  const c1AdditionalFields = fields.filter((field) => !["aigw_name", "aigw_opportunityid"].includes(field.logicalName));
  const entityCreatePayload = { "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata", SchemaName: "aigw_ActualManagement", DisplayName: localizedLabel("Actual Management", "实绩管理"), DisplayCollectionName: localizedLabel("Actual Management", "实绩管理"), OwnershipType: "OrganizationOwned", IsActivity: false, HasActivities: false, HasNotes: false, IsAuditEnabled: { Value: true }, Attributes: [{ "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata", AttributeType: "String", AttributeTypeName: { Value: "StringType" }, SchemaName: primaryField.schemaName, DisplayName: localizedLabel(primaryField.label1033, primaryField.label2052), RequiredLevel: requiredLevel("ApplicationRequired"), MaxLength: 200, FormatName: { Value: "Text" }, IsPrimaryName: true }] };
  const relationshipCreatePayload = { "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata", SchemaName: RELATIONSHIP, ReferencedEntity: "opportunity", ReferencingEntity: TARGET_TABLE, CascadeConfiguration: relationshipDesign.cascadeConfiguration, Lookup: { "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata", SchemaName: "aigw_OpportunityId", DisplayName: localizedLabel("Related Opportunity", "相关商机"), RequiredLevel: requiredLevel("ApplicationRequired") } };
  const savedQueryCreatePayload = { name: VIEW_NAME, returnedtypecode: TARGET_TABLE, querytype: 0, isquickfindquery: false, fetchxml: fetchXml, layoutxml: layoutXml };
  const customTablePublishParameterXml = `<importexportxml><entities><entity>${TARGET_TABLE}</entity></entities></importexportxml>`;
  const manifests = [
    phase("1C-1", "Create Actual Management table and non-lookup fields", "CONFIRM_D365_TEST_WRITE_PHASE_1C_1_TABLE_FIELDS", { createEntity: { logicalName: TARGET_TABLE, ownershipType: "OrganizationOwned", primaryNameAttribute: "aigw_name" }, primaryFieldCreatedWithTable: "aigw_name", additionalFields: c1AdditionalFields.map((field) => field.logicalName), counts: { businessFieldsAfterPhase: 39, primaryFields: 1, additionalAttributePosts: 38, opportunityLookupFields: 0 }, webApiDryRun: { headers: { "MSCRM.SolutionUniqueName": SOLUTION }, requests: [{ method: "POST", endpoint: "/api/data/v9.2/EntityDefinitions", payload: entityCreatePayload }, ...c1AdditionalFields.map((field) => ({ method: "POST", endpoint: `/api/data/v9.2/EntityDefinitions(LogicalName='${TARGET_TABLE}')/Attributes`, logicalName: field.logicalName, payload: attributePayload(field) }))] } }, ["Target table and all 39 Phase 1C-1 logical names remain absent", "Unmanaged solution and aigw publisher gates pass", "AI remains demo/disabled"], ["Read created EntityDefinition", "Verify primary plus 38 additional fields", "Verify types, precision, min/max, labels and solution membership", "Verify aigw_opportunityid and relationship remain absent"], "Strictly no publish in Phase 1C-1. A later publish request may target only aigw_actualmanagement; if Dataverse requires opportunity publication, stop.", "Record every created MetadataId. Do not physically delete without separate authorization; if rollback is authorized, delete only the new custom table, which removes only its new fields."),
    phase("1C-2", "Atomically create Opportunity lookup and relationship", "CONFIRM_D365_TEST_WRITE_PHASE_1C_2_RELATIONSHIP", { atomicWrite: true, createRelationship: relationshipDesign, counts: { lookupFieldsCreated: 1, relationshipsCreated: 1, totalBusinessFieldsAfterPhase: 40 }, webApiDryRun: { headers: { "MSCRM.SolutionUniqueName": SOLUTION }, requests: [{ method: "POST", endpoint: "/api/data/v9.2/RelationshipDefinitions", payload: relationshipCreatePayload }] } }, ["Phase 1C-1 table and 39 fields exist", "aigw_opportunityid and relationship remain absent", "No actual records exist", "Current Opportunity metadata hash is backed up"], ["Insert is one RelationshipDefinitions request containing the Lookup", "Read relationship and lookup metadata", "Verify ApplicationRequired", "Verify Delete=Restrict and other cascades=NoCascade", "Verify Opportunity fields/data are unchanged"], "Strictly no publish in Phase 1C-2. The relationship is expected to become publishable through the new referencing table only. If Dataverse requires publishing opportunity, stop and report.", "Atomic request prevents intentional partial creation. Record relationship/lookup MetadataIds; physical deletion requires separate authorization and must occur before any dependent view/subgrid/data."),
    phase("1C-3", "Create general Actual Management system view", "CONFIRM_D365_TEST_WRITE_PHASE_1C_3_VIEW", { createSavedQuery: { name: VIEW_NAME, defaultForSubgrid: true, demoOnly: false, fetchXmlFile: "docs/d365/phase1c0-actual-management-view-fetchxml-draft.xml", layoutXmlFile: "docs/d365/phase1c0-actual-management-view-layoutxml-draft.xml", columns: viewColumns.map(([logicalName, width]) => ({ logicalName, width })) }, optionalDemoOnlyMainList: { deferred: true, suggestedName: "实绩管理 - AI Demo Only", defaultForSubgrid: false }, webApiDryRun: { headers: { "MSCRM.SolutionUniqueName": SOLUTION }, requests: [{ method: "POST", endpoint: "/api/data/v9.2/savedqueries", payload: savedQueryCreatePayload }] } }, ["Table and relationship metadata IDs exist", "ObjectTypeCode is read from created table", "Draft LayoutXML object placeholder is replaced from metadata", "aigw_annualactualrevenue_base exists as the generated base Money attribute"], ["Read SavedQuery", "Verify six columns and widths", "Verify no filter or link-entity", "Execute FetchXML", "Verify modifiedon descending"], "No PublishXml in Phase 1C-3. View visibility in App is not required.", "Record the new SavedQuery ID. Delete only that ID after separate delete authorization; never modify an existing view."),
    phase("1C-4", "Add related-records Subgrid to Full Replica Actuals section", "CONFIRM_D365_TEST_WRITE_PHASE_1C_4_SUBGRID", { patchNewFormOnly: FORM_ID, sectionName: "aigw_fr_actuals_information", subgridDraftFile: "docs/d365/phase1c0-actual-management-subgrid-formxml-draft.xml", writeBlockedUntilIdsResolved: ["relationship metadata", "savedqueryid", "ObjectTypeCode"] }, ["Table/relationship/view are available to Form Designer", "Current unpublished FormXML hash matches the Phase 1C-0 baseline", "New view ID is resolved"], ["RetrieveUnpublished FormXML/FormJSON", "Verify exactly one Subgrid", "Verify Only related records and relationship/view IDs", "Designer Save only, then confirm FormJSON sync"], "No publish in this phase. Designer Save may normalize FormXML/FormJSON.", "Restore the exact pre-1C-4 unpublished FormXML backup; do not change the protected original form."),
    phase("1C-5", "Create one synthetic actual record per AI-DEMO Opportunity", "CONFIRM_D365_TEST_WRITE_PHASE_1C_5_DEMO_RECORDS", { createRecordsFrom: "docs/d365/phase1c0-actual-management-seed-manifest.json", plannedCount: 100 }, ["Target table is published and Web API EntitySetName is available", "Exactly 100 AI-DEMO Opportunities are re-read", "No existing AI-DEMO-ACTUAL row conflicts", "CNY currency ID is resolved at execution time"], ["100 records created", "One per AI-DEMO Opportunity", "GP/MP invariants", "No Opportunity changes", "No non-demo relationships"], "Records require the table/relationship to be published first; this phase is writeBlocked until the required Phase 1C-7 metadata publish has completed.", "Delete only IDs recorded by the seed execution log; field-level log retains submitted values and before=null.", { executionOrderNote: "Although numbered 1C-5, seed execution must occur after the table/relationship metadata publish." }),
    phase("1C-6", "Read-only end-to-end validation", "CONFIRM_D365_TEST_READ_PHASE_1C_6_VALIDATE", { none: true }, ["Relevant prior phase completed"], ["Metadata/relationship/view/subgrid/record counts", "Protected Form/View/BR/BPF hashes", "No external AI", "Safe Context contains only derived bands/trends"], "None; GET only.", "Not applicable."),
    phase("1C-7", "Explicit targeted publish gate", "CONFIRM_D365_TEST_WRITE_PHASE_1C_7_PUBLISH", { publishableNow: { scope: ["aigw_actualmanagement table", "its attributes", "its lookup/relationship", "its system view"], expectedToRequireOpportunityPublish: false, webApiDryRun: { method: "POST", endpoint: "/api/data/v9.2/PublishXml", payload: { ParameterXml: customTablePublishParameterXml } } }, blockedFromThisManifest: { fullReplicaOpportunityForm: true, reason: "Web API PublishXml form publication can require publishing the opportunity entity. This manifest must not publish opportunity. Keep the Form/Subgrid unpublished unless a separately proven component-specific Designer publish is authorized." }, broadPublishForbidden: true, stopConditions: ["ParameterXml would include opportunity", "Dataverse reports opportunity must be published", "PublishAllXml or broad entity publication is required"] }, ["All custom table component IDs known", "C1/C2 performed without publish", "View has no Demo filter", "Backups and hashes current", "No unresolved custom-table placeholder"], ["Only aigw_actualmanagement becomes published", "Relationship and generated base attributes are usable", "View executes and has no filter", "Opportunity component state and protected Form hashes remain unchanged"], "Targeted entity publish of the new custom table is supported in principle. Relationship publication should be satisfied by publishing its referencing custom table. Any requirement to publish opportunity is an immediate stop condition.", "Publishing is not fully reversible. Retain all metadata backups; remove new components from App/solution references and seek separate physical-delete authorization if abandonment is required.", { safeSequence: ["Target-publish only aigw_actualmanagement before seed or Form Designer binding.", "Add and Save the Subgrid only after the custom table is available.", "Do not publish the Opportunity Form under this manifest."] }),
  ];

  const audit = {
    generatedAt: new Date().toISOString(), readOnly: true,
    safety: { dataverseUrl: EXPECTED_URL, organization: organization.value?.[0]?.name, solution: SOLUTION, solutionId: solution.solutionid, publisherPrefix: publisher.customizationprefix, targetForm: FORM_ID, aiProvider: "demo", allowExternalAi: false },
    ownershipRecommendation: { selected: "OrganizationOwned", rationale: ["No owner field or row assignment/sharing complexity is needed for the management demo.", "Security is controlled with table-level role privileges; users with read access see all actual records.", "Auditing remains available when IsAuditEnabled=true, independent of ownership."], userTeamOwnedTradeoff: "Adds ownerid, assign/share privileges and row-level access complexity; use only if owner-based actual-record security becomes a real requirement." },
    existingObjectAudit: { targetTableCollision: targetCollision, relationshipCollision, reusableCandidates, opportunityRelationshipMatches: relevantRelationships, currentOpportunitySubgrids: uniqueSubgridControls, conclusion: "No existing entity/relationship/view/subgrid is a safe semantic match. Create a dedicated organization-owned aigw_actualmanagement table. Do not reuse dataperformance or opportunityproduct." },
    moneyMetadataReferences: moneyReferences,
    baseCurrency: { organization: organization.value?.[0], cny: cnyCurrencies.value?.[0], confirmedCnyBaseCurrency: organization.value?.[0]?._basecurrencyid_value === cnyCurrencies.value?.[0]?.transactioncurrencyid, sourceReferenceConclusion: { sourceLogicalName: "new_yearrevenueactural_base", isIndependentBusinessField: false, evidence: "The project reference uses the Dataverse _base suffix. It is the automatic base-currency companion of new_yearrevenueactural, not an independently maintained business amount.", revisedDesign: "Do not create aigw_annualactualrevenuecny. Use generated aigw_annualactualrevenue_base in the View and keep exact transaction/base values out of AI payloads.", existingOpportunitySimulationField: "aigw_yearrevenueactualcny remains untouched; this revision only changes the new Actual Management table dry-run." } },
    tableDesign: { displayName1033: "Actual Management", displayName2052: "实绩管理", pluralName1033: "Actual Management", pluralName2052: "实绩管理", logicalName: TARGET_TABLE, schemaName: "aigw_ActualManagement", entitySetNameProposal: "aigw_actualmanagements", ownershipType: "OrganizationOwned", primaryName: "aigw_name", auditEnabled: true },
    relationshipDesign, fields, fieldCounts: { totalBusinessFieldsAfterRelationship: 40, phase1C1FieldsIncludingPrimary: 39, phase1C1AdditionalAttributePosts: 38, phase1C2LookupFields: 1, monthlyFields: 36, generatedBaseFieldsNotCountedAsBusinessFields: 37 }, viewDesign: { name: VIEW_NAME, defaultForSubgrid: true, demoOnly: false, columns: viewColumns.map(([logicalName, width], index) => ({ order: index + 1, logicalName, width })), orderBy: "modifiedon desc", filters: [], linkEntities: [], optionalDemoOnlyMainListView: "Deferred; if later needed, create a separate non-default view.", fetchXmlHash: hash(fetchXml), layoutXmlHash: hash(layoutXml) },
    currentFormAudit,
    subgridDesign: { targetFormId: FORM_ID, tab: "aigw_fr_tab_actuals", section: "aigw_fr_actuals_information", label: "实绩管理", controlId: "aigw_actualmanagement_subgrid", relationshipName: RELATIONSHIP, defaultViewId: "{ACTUAL_MANAGEMENT_VIEW_ID}", records: "Only related records", formJsonRisk: "High enough to require Power Apps Designer Save only and a post-save RetrieveUnpublished FormXML/FormJSON synchronization gate.", designerSaveRequired: true, writeBlocked: true },
    seedDesign: seedManifest,
    aiSafety: { providerState: { AI_PROVIDER: "demo", ALLOW_EXTERNAL_AI: false }, forbidden: ["Exact monthly/annual amounts", "Customer/opportunity/actual record names", "Record IDs", "Contacts", "Raw notes"], allowedDerived: ["Amount bands", "Trend direction", "Budget variance band", "GP/MP ratio band", "Anomalous months", "Annual summary trend"], implementationBoundary: "No Safe Context or provider payload changes in Phase 1C-0." },
    manifests: manifests.map((manifest) => ({ phase: manifest.phase, file: `docs/d365/phase${manifest.phase.toLowerCase().replace("-", "-")}-${manifest.phase === "1C-1" ? "table-fields" : manifest.phase === "1C-2" ? "relationship" : manifest.phase === "1C-3" ? "view" : manifest.phase === "1C-4" ? "subgrid" : manifest.phase === "1C-5" ? "demo-records" : manifest.phase === "1C-6" ? "validation" : "publish"}-manifest.json`, authorizationPhrase: manifest.authorizationPhrase })),
  };

  const fieldHeaders = ["logicalName", "schemaName", "label1033", "label2052", "type", "precision", "precisionSource", "minValue", "maxValue", "maxLength", "requiredLevel", "currencyStrategy", "safeContextPolicy", "providerPayloadPolicy"];
  const fieldCsv = `${fieldHeaders.join(",")}\n${fields.map((field) => fieldHeaders.map((key) => csvCell(field[key])).join(",")).join("\n")}\n`;
  const fieldTable = fields.map((field) => `| \`${field.logicalName}\` | \`${field.schemaName}\` | ${field.label1033} | ${field.label2052} | ${field.type} | ${field.precision ?? "-"} | ${field.minValue ?? "-"} | ${field.maxValue ?? "-"} | ${field.requiredLevel} | ${field.safeContextPolicy} |`).join("\n");
  const phaseTable = manifests.map((manifest) => `| ${manifest.phase} | ${manifest.title} | \`${manifest.authorizationPhrase}\` | ${manifest.publishImpact} |`).join("\n");
  const markdown = `# Phase 1C-0 Actual Management Read-only Audit\n\n## Safety result\n\n- Environment: \`${EXPECTED_URL}\`\n- Solution: \`${SOLUTION}\` (unmanaged)\n- Publisher: \`aigw\`\n- AI: \`AI_PROVIDER=demo\`, \`ALLOW_EXTERNAL_AI=false\`\n- Dataverse writes: none\n- Full Replica FormXML SHA-256: \`${currentFormAudit.formXmlSha256}\`\n- Full Replica FormJSON SHA-256: \`${currentFormAudit.formJsonSha256}\`\n\n## Existing object audit\n\nNo reusable Actual Management table, Opportunity 1:N relationship, system view, or Opportunity Form Subgrid was found. \`dataperformance\` is a system Data Performance Dashboard object. \`opportunityproduct\` is a managed line-item table. Neither matches monthly actual revenue/GP/MP semantics. Proposed table and relationship names are currently ${targetCollision || relationshipCollision ? "blocked by a collision" : "free of metadata collisions"}.\n\n## Recommended table\n\nUse an organization-owned \`${TARGET_TABLE}\` table with auditing enabled. Organization ownership avoids owner assignment/sharing complexity and matches a management-wide demo. User/team ownership should be reconsidered only if row-level owner security becomes a requirement.\n\nThe design contains **${fields.length} business fields**: primary name, Opportunity lookup, expected order date, two annual Money fields, and 36 monthly Money fields. The lookup is created with the relationship in Phase 1C-2. Money precision/min/max follow current Opportunity metadata, not guessed defaults.\n\n## Field design\n\n| Logical name | Schema name | 1033 | 2052 | Type | Precision | Min | Max | Required | Safe Context |\n|---|---|---|---|---|---:|---:|---:|---|---|\n${fieldTable}\n\n## Currency strategy\n\nThe environment base currency is CNY. Normal Money columns use transaction currency and Dataverse-generated \`_base\` fields. The explicit \`aigw_annualactualrevenuecny\` mirrors the supplied source structure but is not itself an automatic base field; synthetic rows must use CNY and validation must reconcile it with the generated base amount.\n\n## Relationship\n\n\`${RELATIONSHIP}\` creates required lookup \`aigw_opportunityid\`. Delete behavior is \`Restrict\`; all assignment/share/reparent/merge cascades are \`NoCascade\`. Opportunity deletion never silently deletes actual records.\n\n## View and Subgrid\n\nThe view \`${VIEW_NAME}\` has six columns, filters through related Opportunity names beginning with \`[AI-DEMO]\`, and sorts \`modifiedon desc\`. The Subgrid draft targets Full Replica → Actuals → \`aigw_fr_actuals_information\`, uses only related records, and remains write-blocked until table, relationship and SavedQuery IDs exist. After Form Designer Save only, FormXML/FormJSON synchronization must be revalidated before publication.\n\n## Seed design\n\nPlan one synthetic actual row per current AI-DEMO Opportunity (${seedManifest.currentSourceCount} currently found). No real customers, routes, notes or imported amounts are used. GP and MP are derived from synthetic revenue and cannot exceed it. Rollback deletes only IDs created and recorded by the seed run.\n\n## AI boundary\n\nExact amounts, names, IDs, contacts and raw notes are forbidden from provider payloads. Safe Context may later expose only bands, trends, variance bands, ratio bands and anomaly indicators. External AI remains disabled.\n\n## Phase manifests\n\n| Phase | Scope | Authorization | Publish impact |\n|---|---|---|---|\n${phaseTable}\n\n## Execution dependency\n\nPhase numbers describe component ownership, not an unconditional execution order. Creating seed rows requires table/relationship metadata to be published. The safest order is: 1C-1 → 1C-2 → 1C-3 → metadata validation → narrowly scoped 1C-7 table publish → 1C-4 Subgrid Save only → FormJSON validation → narrowly scoped form publish → 1C-5 seed → 1C-6 final read-only validation. Any required broad Opportunity publish is a stop condition.\n`;
  const revisedMarkdown = markdown
    .replace("two annual Money fields", "one annual Money field")
    .replace("The explicit `aigw_annualactualrevenuecny` mirrors the supplied source structure but is not itself an automatic base field; synthetic rows must use CNY and validation must reconcile it with the generated base amount.", "The real reference field is `new_yearrevenueactural_base`; its `_base` suffix identifies the Dataverse-generated base-currency companion, not an independent business field. The revised design does not create `aigw_annualactualrevenuecny`; the View uses generated `aigw_annualactualrevenue_base`. Exact transaction and base values remain forbidden from AI payloads.")
    .replace("The view `实绩管理 - AI Demo` has six columns, filters through related Opportunity names beginning with `[AI-DEMO]`, and sorts `modifiedon desc`.", "The default Subgrid view `实绩管理 - AI Demo` has six columns, no filter and no link-entity, and sorts `modifiedon desc`. Demo-only filtering belongs only to the seed phase; a separate optional Demo-only main-list view may be designed later but cannot be the Subgrid default.")
    .replace("narrowly scoped form publish → 1C-5 seed", "keep the Opportunity Form unpublished unless a separately proven component-specific Designer publish is authorized → 1C-5 seed");

  await fs.mkdir(docs, { recursive: true });
  await fs.mkdir(backup, { recursive: true });
  const files = {
    audit: path.join(docs, "phase1c0-actual-management-audit.json"),
    auditMd: path.join(docs, "phase1c0-actual-management-audit.md"),
    fields: path.join(docs, "phase1c0-actual-management-fields.csv"),
    fetch: path.join(docs, "phase1c0-actual-management-view-fetchxml-draft.xml"),
    layout: path.join(docs, "phase1c0-actual-management-view-layoutxml-draft.xml"),
    subgrid: path.join(docs, "phase1c0-actual-management-subgrid-formxml-draft.xml"),
    seed: path.join(docs, "phase1c0-actual-management-seed-manifest.json"),
  };
  await Promise.all([
    fs.writeFile(files.audit, `${JSON.stringify(audit, null, 2)}\n`),
    fs.writeFile(files.auditMd, revisedMarkdown),
    fs.writeFile(files.fields, fieldCsv),
    fs.writeFile(files.fetch, fetchXml),
    fs.writeFile(files.layout, layoutXml),
    fs.writeFile(files.subgrid, subgridXml),
    fs.writeFile(files.seed, `${JSON.stringify(seedManifest, null, 2)}\n`),
    fs.writeFile(path.join(backup, "01_readonly_metadata_audit.json"), `${JSON.stringify({ candidateEntities: reusableCandidates, opportunityRelationships: relevantRelationships, candidateViews, subgridControls: uniqueSubgridControls, moneyReferences, organization: organization.value, cnyCurrencies: cnyCurrencies.value, currentFormAudit }, null, 2)}\n`),
    fs.writeFile(path.join(backup, "02_full_replica_unpublished_formxml.xml"), unpublishedForm.formxml),
    fs.writeFile(path.join(backup, "03_full_replica_unpublished_formjson.json"), unpublishedForm.formjson),
  ]);
  const manifestNames = ["table-fields", "relationship", "view", "subgrid", "demo-records", "validation", "publish"];
  await Promise.all(manifests.map((manifest, index) => fs.writeFile(path.join(docs, `phase1c-${index + 1}-${manifestNames[index]}-manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`)));

  console.log(JSON.stringify({
    readOnly: true,
    safety: audit.safety,
    existing: { candidateCount: reusableCandidates.length, reusableCount: 0, targetCollision: Boolean(targetCollision), relationshipCollision: Boolean(relationshipCollision), opportunitySubgridCount: uniqueSubgridControls.length, actualManagementSubgridCount: uniqueSubgridControls.filter((control) => control.targetEntity === TARGET_TABLE).length },
    design: { ownership: "OrganizationOwned", fieldCount: fields.length, monthlyFieldCount: fields.filter((field) => MONTHS.some(([month]) => field.logicalName.startsWith(`aigw_${month}`))).length, viewColumnCount: viewColumns.length, seedCount: seedManifest.plannedRecordCount },
    files: [...Object.values(files).map((file) => path.relative(root, file)), ...manifestNames.map((name, index) => `docs/d365/phase1c-${index + 1}-${name}-manifest.json`)],
    backup: path.relative(root, backup),
  }, null, 2));
}


runDataverseCli(import.meta.url, main);
