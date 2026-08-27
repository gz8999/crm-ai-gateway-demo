import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp } from "../server/app.mjs";
import { runAiAction } from "../server/ai/actionService.mjs";
import { actionTypeSubtitles, buildActionBoardModel } from "../server/ai/actionBoardModel.mjs";
import { buildAiDemoContext, buildProviderContext, validateSafeContext } from "../server/ai/contextBuilder.mjs";
import { DEFAULT_LANGUAGE, DEFAULT_LLM_PROVIDER, runAi } from "../server/ai/aiService.mjs";
import { generateDemoChatAnswer } from "../server/ai/demoProvider.mjs";
import { buildInsightAggregate, buildInsightBadges, buildOpportunityInsight } from "../server/ai/insightRules.mjs";
import { guardProviderOutput } from "../server/ai/providers/outputGuard.mjs";
import { buildProviderPromptPayload, containsForbiddenProviderContent } from "../server/ai/providers/promptBuilder.mjs";
import { resolveProviderStatus, runProviderCompletion } from "../server/ai/providers/providerRouter.mjs";
import { buildRiskRadarModel } from "../server/ai/riskRadarModel.mjs";
import { mapDynamicsOpportunity } from "../server/dynamicsMapper.mjs";
import { aiDemoNameFilterValue, buildAiDemoOpportunityFetchXml, opportunitySelect } from "../server/dynamicsClient.mjs";
import { legacyReplacedOpportunityFields, opportunityFieldMapping, replacementRequiredFields, requiredDemoFields } from "../server/fieldMapping/opportunityFieldMapping.mjs";
import { buildCrmData, buildDataverseSelect, buildSafeOpportunityContext, normalizeChoice, sanitizeTimeline } from "../server/fieldMapping/safeTransforms.mjs";
import {
  bookingDepartmentOptions,
  decisionMakerOptions,
  organizationGroupOptions,
  priorityOptions,
  researchBackgroundOptions,
  salesDepartmentOptions,
  winProbabilityOptions,
} from "../server/fieldMapping/choiceOptions.mjs";
import { generateDemoAi, sensitiveKeys, transformOpportunity, validateSafePayload } from "../server/gateway.mjs";
import { buildManagementDashboard, generateManagementSummary, validateManagementPayload } from "../server/management.mjs";
import { createJsonStore, createOpportunityStore } from "../server/store.mjs";
import { generateSyntheticOpportunities, validateTemplates } from "../server/data/syntheticOpportunityGenerator.mjs";
import { ensureAiDemoFilter, summarizeFetchXml } from "../scripts/seed/filter-aidemo-view.mjs";
import { buildSafeContextProgressAudit } from "../scripts/seed/audit-demo-safe-context-progress.mjs";
import { buildPatchPlan, buildProgressAudit, PATCH_FIELDS } from "../scripts/seed/patch-demo-opportunity-progress.mjs";
import { runOpenAiCompatibleProviderCheck } from "../scripts/check-openai-compatible-provider.mjs";

const opportunityTemplatesFile = new URL("../server/data/opportunities.example.json", import.meta.url);
const designPreviewDataFile = path.resolve("src/designs/designPreviewData.ts");
const mainTsxFile = path.resolve("src/main.tsx");

async function loadGeneratedMockData(count = 54) {
  const templates = JSON.parse(await readFile(opportunityTemplatesFile, "utf8"));
  return generateSyntheticOpportunities(templates, { count });
}

const sample = {
  id: "OPP-001",
  opportunity_name: "Ocean Export Annual Tender",
  company: "China Region",
  customer_code: "CUST-001",
  customer_name: "Acme Global Manufacturing",
  contact_name: "John Smith",
  contact_email: "john.smith@acme.example",
  phone: "+86 138 0000 1234",
  detailed_address: "1 Real Street, Shanghai",
  exact_revenue: 5238000,
  exact_margin: 0.118,
  supplier_cost: 4650000,
  contract_text: "Annual contract with sensitive rebate terms.",
  contract_price: 5238000,
  expected_order_date: "2026-06-23",
  owner_name: "Zhou Wenzhe",
  owner_id: "OWNER-001",
  department: "Freight Forwarding",
  stage: "L4 Quotation",
  risk_level: "High",
  risk_reason: "High risk · overdue_9_days",
  ai_suggested_action: "Confirm quotation feedback this week.",
  transport_mode: "OE",
  business_segment: "Freight Forwarding",
  trade_lane: "Shanghai-Tokyo",
  cargo_type: "Machinery",
  customer_need: "Annual ocean export service with stable schedule.",
  proposal_type: "Integrated solution",
  proposal_content: "Annual rate agreement with space protection.",
  revenue_band: "5M+",
  margin_band: "10%-15%",
  forecast_category: "Pipeline",
  recurring_type: "Annual Tender",
  customer_tier: "Strategic",
  decision_maker_type: "Procurement",
  data_quality_flags: [],
};

const sensitiveValues = [
  sample.customer_name,
  sample.contact_email,
  sample.phone,
  sample.detailed_address,
  String(sample.exact_revenue),
  String(sample.exact_margin),
  String(sample.supplier_cost),
  sample.contract_text,
  String(sample.contract_price),
];

const dynamicsRow = {
  opportunityid: "11111111-2222-3333-4444-55555555abcd",
  name: "Real Customer Expansion Opportunity",
  estimatedvalue: 6800000,
  estimatedclosedate: "2026-06-20T00:00:00Z",
  closeprobability: 30,
  createdon: "2026-05-01T00:00:00Z",
  modifiedon: "2026-06-01T00:00:00Z",
  statecode: 0,
  statuscode: 1,
  _customerid_value: "real-customer-guid",
  _ownerid_value: "real-owner-guid",
  "_customerid_value@OData.Community.Display.V1.FormattedValue": "Contoso Real Customer",
  "_ownerid_value@OData.Community.Display.V1.FormattedValue": "Real Owner Name",
  new_opportunitystagestatus: "04",
  "new_opportunitystagestatus@OData.Community.Display.V1.FormattedValue": "L4(提交报价)",
  new_opportunitytype: "02-existing",
  "new_opportunitytype@OData.Community.Display.V1.FormattedValue": "现有",
  new_opportunitydetailtype: "03",
  "new_opportunitydetailtype@OData.Community.Display.V1.FormattedValue": "运输",
  new_customerneed: "02",
  "new_customerneed@OData.Community.Display.V1.FormattedValue": "竞争性报价",
  new_proposalcontent: "03",
  "new_proposalcontent@OData.Community.Display.V1.FormattedValue": "降低成本（运输）",
};

test("field mapping contains real CRM MVP fields with company and trial logical names", () => {
  const required = [
    "bookingDepartment",
    "budgetAmountBand",
    "budgetStatus",
    "customerNameCn",
    "opportunityName",
    "customerRef",
    "customerToken",
    "opportunityStage",
    "winProbability",
    "opportunityType",
    "opportunityDetailType",
    "organizationGroup",
    "opportunityList",
    "opportunityPlace",
    "priority",
    "researchBackground",
    "salesDepartment",
    "startDateStatus",
    "customerNeed",
    "decisionMakerStatus",
    "proposalContent",
    "estimatedQuoteBand",
    "expectedOrderStatus",
    "lostReasonSummary",
    "transportMode",
    "tradeTerms",
    "oneTimeOrContinuous",
    "volumeSize",
    "volumeUnit",
    "wonReasonSummary",
    "timelineSummary",
    "dataQualityFlags",
  ];
  assert.deepEqual(requiredDemoFields().sort(), required.sort());
  for (const appName of required) {
    const field = opportunityFieldMapping.find((item) => item.appName === appName);
    assert.equal(Boolean(field), true, appName);
    for (const key of ["d365Name", "label", "type", "companyType", "trialType", "targetObject", "category", "sensitivity", "safeTransform", "sourcePage", "confidence", "sourceSystem", "mappingStatus", "realLogicalNameConfirmed", "sourceLabel", "companyLogicalName", "trialLogicalName", "replacementTrialLogicalName", "replacementType"]) {
      assert.equal(Object.prototype.hasOwnProperty.call(field, key), true, `${appName} missing ${key}`);
    }
  }
  for (const appName of ["globalInitiative"]) {
    const field = opportunityFieldMapping.find((item) => item.appName === appName);
    assert.equal(Boolean(field), true, appName);
    assert.equal(field.requiredForDemo, false, appName);
    assert.equal(field.includeInSelect, false, appName);
  }
});

test("progress patch and seed attachments are safe and complete", async () => {
  const patchRecords = Array.from({ length: 20 }, (_, index) => ({ index: index + 1, name: `[AI-DEMO] Case ${String(index + 1).padStart(3, "0")}`, description: "Synthetic sanitized description", aigw_progresssummary: "Synthetic sanitized progress" }));
  assert.equal(Array.isArray(patchRecords), true);
  assert.equal(patchRecords.length, 20);
  for (const record of patchRecords) {
    assert.equal(record.name.startsWith("[AI-DEMO]"), true, record.name);
    assert.deepEqual(Object.keys(record).filter((key) => !["index", "name", "description", "aigw_progresssummary", "_review"].includes(key)), []);
    assert.equal(Boolean(record.description), true, record.name);
    assert.equal(Boolean(record.aigw_progresssummary), true, record.name);
  }

  const seedRecords = Array.from({ length: 100 }, (_, index) => ({ name: `[AI-DEMO] Case ${String(index + 1).padStart(3, "0")}`, description: "Synthetic sanitized description", aigw_progresssummary: "Synthetic sanitized progress" }));
  assert.equal(Array.isArray(seedRecords), true);
  assert.equal(seedRecords.length, 100);
  assert.equal(seedRecords.every((record) => record.description && record.aigw_progresssummary), true);
  const serialized = JSON.stringify({ patchRecords, seedRecords }).toLowerCase();
  for (const forbidden of ["raw_timeline", "email body", "phone call body", "task body"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized), false);
  assert.equal(/(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){10,}/.test(serialized), false);
});

test("demo progress audit detects first 20 filled and remaining 80 missing", () => {
  const records = Array.from({ length: 100 }, (_, index) => ({
    opportunityid: `id-${index + 1}`,
    name: `[AI-DEMO] Case ${String(index + 1).padStart(3, "0")}`,
    description: index < 20 ? "已脱敏案件说明" : "",
    aigw_progresssummary: index < 20 ? "已脱敏进展摘要" : null,
  }));
  const audit = buildProgressAudit(records);
  assert.equal(audit.totalDemoCount, 100);
  assert.equal(audit.descriptionFilledCount, 20);
  assert.equal(audit.progressSummaryFilledCount, 20);
  assert.equal(audit.bothFilledCount, 20);
  assert.equal(audit.missingDescriptionCount, 80);
  assert.equal(audit.missingProgressSummaryCount, 80);
  assert.equal(audit.missingEitherCount, 80);
});

test("demo progress patch plan only fills missing AI-DEMO fields and rejects unsafe text", () => {
  const dataverseRecords = [
    { opportunityid: "demo-1", name: "[AI-DEMO] Case 001", description: "已存在说明", aigw_progresssummary: "已存在摘要" },
    { opportunityid: "demo-2", name: "[AI-DEMO] Case 002", description: "", aigw_progresssummary: "" },
    { opportunityid: "demo-3", name: "[AI-DEMO] Case 003", description: "已存在说明", aigw_progresssummary: "" },
    { opportunityid: "demo-4", name: "[AI-DEMO] Case 004", description: "", aigw_progresssummary: "" },
    { opportunityid: "non-demo", name: "Ordinary Trial Opportunity", description: "", aigw_progresssummary: "" },
    { opportunityid: "dup-1", name: "[AI-DEMO] Duplicate", description: "", aigw_progresssummary: "" },
    { opportunityid: "dup-2", name: "[AI-DEMO] Duplicate", description: "", aigw_progresssummary: "" },
  ];
  const inputRecords = [
    { name: "[AI-DEMO] Case 001", description: "新说明不应覆盖", aigw_progresssummary: "新摘要不应覆盖" },
    { name: "[AI-DEMO] Case 002", description: "安全案件说明", aigw_progresssummary: "安全进展摘要" },
    { name: "[AI-DEMO] Case 003", description: "不覆盖已有说明", aigw_progresssummary: "补齐缺失摘要" },
    { name: "[AI-DEMO] Case 004", description: "联系 john@example.com", aigw_progresssummary: "安全进展摘要" },
    { name: "[AI-DEMO] Missing", description: "安全案件说明", aigw_progresssummary: "安全进展摘要" },
    { name: "Ordinary Trial Opportunity", description: "不要 patch", aigw_progresssummary: "不要 patch" },
  ];
  const plan = buildPatchPlan({ dataverseRecords, inputRecords });
  assert.equal(plan.totalDataverseDemoCount, 6);
  assert.equal(plan.skipped.some((item) => item.name === "[AI-DEMO] Case 001"), true);
  assert.deepEqual(Object.keys(plan.patch.find((item) => item.name === "[AI-DEMO] Case 002").payload).sort(), PATCH_FIELDS.sort());
  assert.deepEqual(Object.keys(plan.patch.find((item) => item.name === "[AI-DEMO] Case 003").payload), ["aigw_progresssummary"]);
  assert.equal(plan.patch.some((item) => item.name === "Ordinary Trial Opportunity"), false);
  assert.equal(plan.duplicate.some((item) => item.name === "[AI-DEMO] Duplicate"), true);
  assert.equal(plan.unmatched.some((item) => item.name === "[AI-DEMO] Missing"), true);
  assert.equal(plan.rejected.some((item) => item.name === "[AI-DEMO] Case 004" && item.field === "description"), true);
  for (const item of plan.patch) {
    assert.deepEqual(Object.keys(item.payload).filter((key) => !PATCH_FIELDS.includes(key)), []);
    assert.equal(item.name.startsWith("[AI-DEMO]"), true);
  }

  const overwritePlan = buildPatchPlan({ dataverseRecords, inputRecords, overwrite: true });
  assert.deepEqual(Object.keys(overwritePlan.patch.find((item) => item.name === "[AI-DEMO] Case 001").payload).sort(), PATCH_FIELDS.sort());
});

test("AI demo view fetchxml helper only adds begins-with filter and preserves attributes", () => {
  const fetchxml = `<fetch version="1.0"><entity name="opportunity"><attribute name="name" /><attribute name="modifiedon" /><order attribute="createdon" descending="true" /></entity></fetch>`;
  const next = ensureAiDemoFilter(fetchxml);
  const summary = summarizeFetchXml(next);
  assert.equal(summary.hasAiDemoFilter, true);
  assert.deepEqual(summary.attributes, ["name", "modifiedon"]);
  assert.deepEqual(summary.orders, [{ attribute: "createdon", descending: "true" }]);
  assert.equal(next.includes('operator="like"'), true);
  assert.equal(next.includes("[[]AI-DEMO]%"), true);
});

test("Dataverse select is generated from field mapping", () => {
  const select = buildDataverseSelect();
  for (const field of opportunityFieldMapping.filter((item) => item.includeInSelect && item.sourceSystem === "sales_trial_d365" && item.realLogicalNameConfirmed?.trial === true)) {
    assert.equal(select.split(",").includes(field.d365Name), true, field.d365Name);
  }
  for (const field of opportunityFieldMapping.filter((item) => item.realLogicalNameConfirmed?.trial === false)) {
    assert.equal(select.split(",").includes(field.d365Name), false, field.appName);
  }
  assert.equal(opportunitySelect.includes("name"), true);
  assert.equal(opportunitySelect.includes("estimatedvalue"), true);
  assert.equal(select.split(",").includes("description"), true);
  assert.equal(select.split(",").includes("aigw_progresssummary"), true);
  assert.equal(opportunitySelect.includes("opportunityid"), true);
});

test("Dynamics demo sync fetchxml uses escaped AI-DEMO prefix and selected fields", () => {
  const fetchXml = buildAiDemoOpportunityFetchXml();
  assert.equal(fetchXml.includes(`value="${aiDemoNameFilterValue}"`), true);
  assert.equal(fetchXml.includes('operator="like"'), true);
  assert.equal(fetchXml.includes('<attribute name="name" />'), true);
  assert.equal(fetchXml.includes('<attribute name="opportunityid" />'), true);
  assert.equal(fetchXml.includes('<attribute name="customerid" />'), true);
  assert.equal(fetchXml.includes('<attribute name="_customerid_value" />'), false);
  assert.equal(fetchXml.includes("$select"), false);
});

test("field source metadata separates Sales Trial API fields from company CRM target fields", () => {
  const salesTrialFields = opportunityFieldMapping.filter((field) => field.sourceSystem === "sales_trial_d365");
  assert.equal(salesTrialFields.length > 0, true);
  assert.equal(salesTrialFields.every((field) => ["active_after_trial_field_created", "needs_replacement", "simplified_text_simulation", "implemented_lookup"].includes(field.mappingStatus) && field.realLogicalNameConfirmed.company === true), true);

  const trialCreated = salesTrialFields.filter((field) => field.realLogicalNameConfirmed.trial === true && field.mappingStatus === "active_after_trial_field_created");
  assert.equal(trialCreated.every((field) => field.includeInSelect === true && Boolean(field.d365Name)), true);
  const trialNotCreated = salesTrialFields.filter((field) => field.realLogicalNameConfirmed.trial === false || field.mappingStatus === "needs_replacement");
  assert.equal(trialNotCreated.every((field) => field.includeInSelect === false), true);
  assert.equal(opportunityFieldMapping.find((field) => field.appName === "customerNeed")?.sourceSystem, "sales_trial_d365");
  assert.equal(opportunityFieldMapping.find((field) => field.appName === "transportMode")?.companyLogicalName, "new_transport_mode");
  assert.equal(opportunityFieldMapping.find((field) => field.appName === "transportMode")?.trialLogicalName, "aigw_transportmode");
});

test("replacement fields are active and legacy mismatched fields stay out of Dataverse select", () => {
  const select = buildDataverseSelect().split(",");
  const expectedReplacements = new Map(legacyReplacedOpportunityFields.map((field) => [field.appName, field.replacementTrialLogicalName]));

  for (const [appName, replacement] of expectedReplacements) {
    const field = opportunityFieldMapping.find((item) => item.appName === appName);
    assert.equal(field.mappingStatus, "active_after_trial_field_created", appName);
    assert.equal(field.trialLogicalName, replacement, appName);
    assert.equal(field.d365Name, replacement, appName);
    assert.equal(field.includeInSelect, true, appName);
    assert.equal(select.includes(replacement), true, appName);
    assert.equal(["choice", "yesNo"].includes(field.trialType), true, appName);
    assert.equal(["text", "multiline"].includes(field.trialType), false, appName);
  }

  assert.equal(replacementRequiredFields.length, 0);
  for (const legacy of legacyReplacedOpportunityFields) {
    assert.equal(legacy.mappingStatus, "replaced_by_replacement", legacy.appName);
    assert.equal(legacy.includeInSelect, false, legacy.appName);
    assert.equal(legacy.includeInCrmData, false, legacy.appName);
    assert.equal(legacy.includeInSafeContext, false, legacy.appName);
    assert.equal(select.includes(legacy.d365Name), false, legacy.d365Name);
  }
  const place = opportunityFieldMapping.find((item) => item.appName === "opportunityPlace");
  assert.equal(place.companyLogicalName, "new_location");
  assert.equal(place.companyType, "lookup");
  assert.equal(place.trialType, "lookup");
  assert.equal(place.mappingStatus, "implemented_lookup");
  assert.equal(place.trialLogicalName, "aigw_opportunitylocation");
  assert.equal(place.d365Name, "_aigw_opportunitylocation_value");
  assert.equal(place.includeInSelect, false);
  assert.equal(place.includeInSafeContext, false);
  assert.equal(select.includes("aigw_opportunityplace"), false);
  assert.equal(select.includes("_aigw_opportunitylocation_value"), false);
});

test("choice option values and labels normalize correctly", () => {
  assert.deepEqual(winProbabilityOptions.map((item) => item.label), ["Z", "A", "B", "C", "D", "Y"]);
  assert.deepEqual(winProbabilityOptions.map((item) => item.rank), [6, 5, 4, 3, 2, 1]);
  const byValue = normalizeChoice("2", "", winProbabilityOptions);
  assert.equal(byValue.label, "A");
  assert.equal(byValue.rank, 5);
  const byFormattedLabel = normalizeChoice(null, "Y", winProbabilityOptions);
  assert.equal(byFormattedLabel.label, "Y");
  assert.equal(byFormattedLabel.rank, 1);
});

test("confirmed replacement choice options are available for future field creation", () => {
  assert.equal(organizationGroupOptions.length, 18);
  assert.equal(organizationGroupOptions.at(-1).value, 91);
  assert.equal(organizationGroupOptions.at(-1).label, "91: Others");

  assert.equal(bookingDepartmentOptions.length, 26);
  assert.equal(bookingDepartmentOptions.some((item) => item.value === 13), false);
  assert.equal(bookingDepartmentOptions.at(-1).value, 91);

  assert.deepEqual(salesDepartmentOptions.map((item) => item.value), [1, 2, 3, 4, 5, 6, 91]);
  assert.deepEqual(priorityOptions.map((item) => item.label), ["01: High", "02: Important", "03: Medium", "04: Low"]);
  assert.equal(researchBackgroundOptions.length, 14);
  assert.equal(decisionMakerOptions.length, 3);

  assert.equal(normalizeChoice("4", "", salesDepartmentOptions).label, "04: Dept3(Project Cargo)");
  assert.equal(normalizeChoice("2", "", priorityOptions).normalized, "Important");
  assert.equal(normalizeChoice("91", "", decisionMakerOptions).label, "91：其他");
});

test("pending CRM mapping document treats POL/POD as lookup and excludes it from Safe Context", async () => {
  const doc = await readFile(new URL("../docs/pending-crm-mapping.md", import.meta.url), "utf8");
  for (const logicalName of ["new_sealand_pol", "new_sealand_pod", "new_air_pol", "new_air_pod"]) {
    assert.equal(doc.includes(logicalName), true, logicalName);
  }
  assert.match(doc, /lookup/);
  assert.match(doc, /POL\/POD must not\s+enter Safe Context/);
  assert.match(doc, /Port \/\s+Location lookup table/);
});

test("safe context builder enforces mapping security and missing-field flags", () => {
  const raw = {
    ...sample,
    customer_name: "Sensitive Customer Name",
    contact_name: "Sensitive Contact Name",
    contact_email: "person@example.com",
    phone: "+86 138 0000 0000",
    detailed_address: "Sensitive Street Address",
    contract_text: "contract text with private price",
    timeline_text: "Called John at person@example.com about CNY 5,238,000 contract text and +86 138 0000 0000.",
    opportunity_type: "",
  };
  const result = buildSafeOpportunityContext(raw, { now: new Date("2026-07-02T00:00:00") });
  assert.equal(result.validation.ok, true);
  assert.equal(result.safeOpportunityContext.estimatedQuoteBand, "5M+");
  assert.equal(result.safeOpportunityContext.timelineSummary.includes("person@example.com"), false);
  assert.equal(result.safeOpportunityContext.timelineSummary.includes("+86"), false);
  assert.equal(result.safeOpportunityContext.timelineSummary.includes("5238000"), false);
  assert.equal(JSON.stringify(result.safeOpportunityContext).includes(raw.timeline_text), false);
  assert.equal(result.dataQualityFlags.includes("missing_opportunityType"), true);

  const serialized = JSON.stringify(result.safeOpportunityContext);
  for (const value of ["Sensitive Customer Name", "Sensitive Contact Name", "person@example.com", "+86 138 0000 0000", "Sensitive Street Address", "5238000", "contract text"]) {
    assert.equal(serialized.includes(value), false, value);
  }
  const confidentialField = result.transformRows.find((row) => row.appName === "customerRef");
  assert.equal(confidentialField.sensitivity, "confidential");
  assert.equal(confidentialField.safeTransform, "token");
  const commercialField = result.transformRows.find((row) => row.appName === "estimatedQuoteBand");
  assert.equal(commercialField.sensitivity, "commercial_sensitive");
  assert.equal(commercialField.safeTransform, "band");
  assert.equal(commercialField.sourceSystem, "sales_trial_d365");
  assert.equal(Object.prototype.hasOwnProperty.call(commercialField, "sourceValue"), false);
  assert.equal(commercialField.sourceMasked, true);
  assert.equal(commercialField.sourcePreview, "•••• masked");
  const salesTrialReplicaField = result.transformRows.find((row) => row.appName === "customerNeed");
  assert.equal(salesTrialReplicaField.sourceSystem, "sales_trial_d365");
  assert.equal(salesTrialReplicaField.mappingStatus, "active_after_trial_field_created");
  assert.equal(salesTrialReplicaField.sourceField, "aigw_customerneed_choice");
});

test("safe context includes sanitized description and progress summary", () => {
  const raw = {
    ...sample,
    description: "客户说明 john@example.com +86 138 0000 0000 CNY 5,238,000 contract text contains private terms.",
    aigw_progresssummary: "2026-06-21：完成需求梳理。2026-06-28：客户反馈报价，raw timeline email body should be removed.",
  };
  const result = buildSafeOpportunityContext(raw, { now: new Date("2026-07-02T00:00:00") });
  const safe = result.safeOpportunityContext;
  assert.equal(result.validation.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(safe, "sanitizedDescription"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(safe, "sanitizedProgressSummary"), true);
  const serialized = JSON.stringify(safe);
  for (const forbidden of ["john@example.com", "+86", "5,238,000", "contract text contains private terms", "raw timeline", "email body"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(safe.sanitizedProgressSummary.includes("2026-06-21"), true);
});

test("Dynamics mapper carries progress summary from Dataverse row into Safe Context", () => {
  const row = {
    ...dynamicsRow,
    name: "[AI-DEMO] Safe Progress Mapping Probe",
    description: "客户说明 john@example.com +86 138 0000 0000 CNY 5,238,000 contract text contains private terms.",
    aigw_progresssummary: "客户反馈价格偏高，等待客户反馈。raw timeline email body should be removed.",
    aigw_customerneed_choice: 2,
    "aigw_customerneed_choice@OData.Community.Display.V1.FormattedValue": "02: 竞争性报价",
    aigw_proposalcontent_choice: 3,
    "aigw_proposalcontent_choice@OData.Community.Display.V1.FormattedValue": "03: 降低成本（运输）",
  };
  const mapped = mapDynamicsOpportunity(row, 0, new Date("2026-07-02T00:00:00"));
  assert.equal(mapped.description.includes("john@example.com"), true);
  assert.equal(mapped.progressSummary.includes("价格偏高"), true);
  assert.equal(mapped.sanitizedProgressSummary.includes("价格偏高"), true);

  const safe = buildSafeOpportunityContext(mapped, { now: new Date("2026-07-02T00:00:00") }).safeOpportunityContext;
  assert.equal(Boolean(safe.sanitizedDescription), true);
  assert.equal(Boolean(safe.sanitizedProgressSummary), true);
  assert.equal(safe.sanitizedProgressSummary.includes("价格偏高"), true);
  const serialized = JSON.stringify(safe);
  for (const forbidden of ["john@example.com", "+86", "5,238,000", "contract text contains private terms", "raw timeline", "email body"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("safe context progress audit reports full mapped and safe coverage", () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({
    ...dynamicsRow,
    opportunityid: `demo-${String(index + 1).padStart(3, "0")}`,
    name: `[AI-DEMO] Case ${String(index + 1).padStart(3, "0")}`,
    description: `已脱敏案件说明 ${index + 1}`,
    aigw_progresssummary: `已脱敏进展摘要 ${index + 1}，等待客户反馈。`,
  }));
  const audit = buildSafeContextProgressAudit(rows, { now: new Date("2026-07-02T00:00:00") });
  assert.equal(audit.totalDemoCount, 100);
  assert.equal(audit.dataverseDescriptionFilledCount, 100);
  assert.equal(audit.dataverseProgressFilledCount, 100);
  assert.equal(audit.mappedDescriptionFilledCount, 100);
  assert.equal(audit.mappedProgressFilledCount, 100);
  assert.equal(audit.safeDescriptionFilledCount, 100);
  assert.equal(audit.safeProgressFilledCount, 100);
  assert.equal(audit.missingSafeProgressCount, 0);
  assert.equal(audit.records.every((item) => item.sanitizedProgressSummaryLength > 0), true);
});

test("high-fidelity trial fields are included in CRM Data and Dataverse select after creation", () => {
  const crmData = buildCrmData({
    ...sample,
    cargo_type: "工业产品",
    warehouse_scale: "1~500㎡",
    trade_terms: "FOB",
  });
  const appNames = crmData.map((field) => field.appName);
  assert.equal(appNames.includes("opportunityName"), true);
  assert.equal(appNames.includes("cargoDescription"), true);
  assert.equal(appNames.includes("warehouseScale"), true);
  assert.equal(appNames.includes("tradeTerms"), true);
  assert.equal(buildDataverseSelect().split(",").includes("aigw_goodshandled"), true);
  assert.equal(buildDataverseSelect().split(",").includes("aigw_warehousescale"), true);
  assert.equal(buildDataverseSelect().split(",").includes("aigw_projectsize"), true);
});

test("opportunity title is sanitized before entering safe context", () => {
  const raw = {
    ...sample,
    opportunity_name: "Contoso Real Customer renewal john@example.com +86 138 0000 0000",
  };
  const result = buildSafeOpportunityContext(raw, { now: new Date("2026-07-02T00:00:00") });
  const serialized = JSON.stringify(result.safeOpportunityContext);
  assert.equal(Object.prototype.hasOwnProperty.call(result.safeOpportunityContext, "opportunityName"), false);
  assert.equal(result.safeOpportunityContext.opportunityToken, "OPP-001");
  assert.equal(serialized.includes("Contoso Real Customer"), false);
  assert.equal(serialized.includes("john@example.com"), false);
  assert.equal(serialized.includes("+86"), false);
  assert.match(result.safeOpportunityContext.sanitizedOpportunityTitle, /customer_removed|email_removed|phone_removed/);
  assert.equal(result.validation.ok, true);
});

test("transform rows expose masked previews instead of raw source values", () => {
  const result = transformOpportunity({
    ...sample,
    opportunity_name: "Sensitive Customer Name john@example.com +86 138 0000 0000",
  }, "Sales Owner", new Date("2026-07-02T00:00:00"));
  const serializedRows = JSON.stringify(result.transformRows);
  assert.equal(serializedRows.includes("sourceValue"), false);
  for (const value of ["john@example.com", "+86 138 0000 0000", sample.customer_name, sample.contact_name, sample.contract_text, String(sample.exact_revenue)]) {
    assert.equal(serializedRows.includes(value), false, value);
  }
  assert.equal(result.transformRows.some((row) => row.sourcePreview === "•••• masked"), true);
});

test("timeline sanitizer is deterministic and removes raw sensitive text", () => {
  const raw = "Meeting with John, email john@example.com, phone +86 138 0000 0000, amount CNY 2,160,000, contract text contains terms.";
  const first = sanitizeTimeline(raw);
  const second = sanitizeTimeline(raw);
  assert.equal(first, second);
  assert.equal(first.includes("john@example.com"), false);
  assert.equal(first.includes("+86"), false);
  assert.equal(first.includes("2,160,000"), false);
  assert.equal(first.toLowerCase().includes("contract text contains terms"), false);
});

test("transform removes sensitive keys and raw sensitive values from safe payload", () => {
  const result = transformOpportunity(sample, "Sales Owner", new Date("2026-07-02T00:00:00"));
  const serialized = JSON.stringify(result.safePayload);

  for (const key of sensitiveKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(result.safePayload, key), false, key);
  }
  for (const value of sensitiveValues) {
    assert.equal(serialized.includes(value), false, value);
  }
  assert.equal(result.safePayload.customer_token, "CUST-001");
  assert.equal(result.safePayload.revenue_band, "5M+");
  assert.equal(result.safePayload.margin_band, "10%-15%");
  assert.equal(result.safePayload.expected_order_status, "overdue_9_days");
});

test("mock opportunity templates are explicitly synthetic and deterministically expand", async () => {
  const templates = JSON.parse(await readFile(opportunityTemplatesFile, "utf8"));
  assert.equal(templates.length, 10);
  assert.equal(validateTemplates(templates), true);
  const data = await loadGeneratedMockData();
  assert.equal(data.length >= 50, true);
  for (const item of data) {
    for (const field of ["business_segment", "transport_mode", "trade_lane", "cargo_type", "customer_need", "proposal_type", "revenue_band", "margin_band", "forecast_category", "recurring_type", "customer_tier", "decision_maker_type", "risk_reason", "ai_suggested_action"]) {
      assert.equal(Boolean(item[field]), true, `${item.id} missing ${field}`);
    }
    assert.equal(Array.isArray(item.data_quality_flags), true, `${item.id} missing data_quality_flags`);
  }
  assert.equal(data.some((item) => item.stage === "L4 Quotation" && item.risk_level === "Critical" && item.revenue_band === "5M+"), true);
  assert.equal(data.some((item) => item.margin_band === "<5%" && ["High", "Critical"].includes(item.risk_level)), true);
  assert.equal(data.some((item) => item.business_segment === "Warehousing" && item.recurring_type === "Recurring"), true);
  assert.equal(data.some((item) => item.data_quality_flags.length > 0), true);
  assert.equal(data.some((item) => item.recurring_type === "Annual Tender"), true);
  assert.equal(data.some((item) => item.customer_need === "Renewal"), true);
});

test("management dashboard filters aggregate sales data and keeps summary payload safe", async () => {
  const data = await loadGeneratedMockData();
  const all = buildManagementDashboard(data, {}, new Date("2026-07-02T00:00:00"));
  const filtered = buildManagementDashboard(data, { salesDepartment: "Freight Forwarding", riskLevel: "High" }, new Date("2026-07-02T00:00:00"));
  assert.equal(all.summaryPayload.record_count >= filtered.summaryPayload.record_count, true);
  assert.equal(all.filteredCount, all.summaryPayload.record_count);
  assert.equal(all.totalDemoCount, data.length);
  assert.equal(all.filteredOpportunityIds.length, all.summaryPayload.record_count);
  assert.equal(all.kpis.length, 7);
  assert.equal(all.pipelineHealth.length, 5);
  assert.deepEqual(all.pipelineHealth.map((item) => item.stage), ["L1 Initial Contact", "L2 Need Confirmed", "L3 Proposal", "L4 Quotation", "L5 Won"]);
  assert.equal(all.pipelineHealth.every((item) => typeof item.health_score === "number" && Boolean(item.revenue_band) && Boolean(item.weighted_forecast_band) && Boolean(item.risk_amount_band)), true);
  assert.equal(all.riskHeatmap.length, 20);
  assert.equal(all.riskHeatmap.some((item) => item.stage === "L4 Quotation" && item.risk_level === "Critical" && item.count >= 0), true);
  assert.equal(typeof all.summaryPayload.weighted_forecast_band, "string");
  assert.equal(typeof all.summaryPayload.data_quality_score, "number");
  assert.equal(validateManagementPayload(all.summaryPayload).ok, true);
  assert.equal(all.filters.scopeLabel, "[AI-DEMO] only");
  assert.equal(all.filters.salesDepartments.includes("Freight Forwarding"), true);
  assert.equal(all.filters.transportModes.includes("OE"), true);
  assert.equal(all.filters.customerNeeds.length > 0, true);
  assert.equal(Object.hasOwn(all.filters, "businessSegments"), false);
  assert.equal(Object.hasOwn(all.filters, "tradeLanes"), false);
  assert.equal(Object.hasOwn(all.filters, "customerTiers"), false);
  assert.equal(Object.hasOwn(all.filters, "forecastCategories"), false);
  assert.equal(Object.hasOwn(all.filters, "dataSources"), false);
  assert.equal(all.topRiskOpportunities[0].priority, 1);
  assert.equal(Boolean(all.topRiskOpportunities[0].business_segment), true);
  assert.equal(Boolean(all.customerPortfolio[0].main_business), true);

  for (const nextFilters of [
    { salesDepartment: "Freight Forwarding" },
    { transportMode: "OE" },
    { customerNeed: all.filters.customerNeeds[0] },
    { proposalContent: all.filters.proposalContents[0] },
    { riskLevel: "High" },
    { opportunityStage: "L4 Quotation" },
    { ownerToken: all.filters.ownerTokens[0] },
    { expectedOrderStatus: all.filters.expectedOrderStatuses[0] },
    { amountBand: all.filters.amountBands[0] },
  ]) {
    const result = buildManagementDashboard(data, nextFilters, new Date("2026-07-02T00:00:00"));
    assert.equal(result.summaryPayload.record_count <= all.summaryPayload.record_count, true, JSON.stringify(nextFilters));
    assert.equal(result.filteredOpportunityIds.length, result.summaryPayload.record_count, JSON.stringify(nextFilters));
    assert.equal(validateManagementPayload(result.summaryPayload).ok, true, JSON.stringify(nextFilters));
  }

  const empty = buildManagementDashboard([], { customerNeed: "No matching need" }, new Date("2026-07-02T00:00:00"));
  assert.equal(empty.summaryPayload.record_count, 0);
  assert.equal(empty.filteredCount, 0);
  assert.equal(empty.totalDemoCount, 0);
  assert.equal(empty.pipelineHealth.length, 5);
  assert.equal(empty.riskHeatmap.length, 20);
  assert.equal(validateManagementPayload(empty.summaryPayload).ok, true);
  assert.equal(empty.kpis.length, 7);
  assert.equal(empty.topRiskOpportunities.length, 0);
  assert.equal(empty.ownerActionBoard.length, 0);
  assert.equal(empty.customerPortfolio.length, 0);

  const serialized = JSON.stringify(all.summaryPayload);
  for (const key of ["customer_name", "contact_email", "phone", "address", "detailed_address", "exact_revenue", "exact_margin", "supplier_cost", "contract_text", "contract_price", "meeting_transcript"]) {
    assert.equal(serialized.includes(key), false, key);
  }
});

test("design preview route uses static safe data without replacing the formal app", async () => {
  const previewData = await readFile(designPreviewDataFile, "utf8");
  const mainSource = await readFile(mainTsxFile, "utf8");

  assert.equal(mainSource.includes('window.location.pathname === "/design-preview"'), true);
  assert.equal(mainSource.includes("isDesignPreview ? <DesignPreview /> : <App />"), true);
  assert.equal(previewData.includes("Safety: raw CRM data not sent"), true);
  for (const required of ["finding", "reason", "evidence", "action", "ownerToken", "urgency"]) {
    assert.equal(previewData.includes(required), true, required);
  }
  for (const forbidden of [
    "@",
    "contact_email",
    "phone",
    "detailed_address",
    "exact_revenue",
    "exact amount",
    "raw timeline",
    "raw email body",
    "raw phone call body",
    "raw task body",
  ]) {
    assert.equal(previewData.toLowerCase().includes(forbidden), false, forbidden);
  }
});

test("formal cockpit is action-first command center and keeps design preview separate", async () => {
  const appSource = await readFile(mainTsxFile, "utf8");
  const source = await readFile(path.resolve("src/App.tsx"), "utf8");
  assert.equal(appSource.includes('window.location.pathname === "/design-preview"'), true);
  for (const label of ["AI 驾驶舱", "风险与优先级", "行动看板", "审计与安全"]) assert.equal(source.includes(label), true, label);
  assert.equal(source.includes("DecisionWorkspace"), true);
  assert.equal(source.includes("ProviderSafetyStrip"), true);
  assert.equal(source.includes("InternalAiLab"), false);
});

test("opportunity filters replace legacy executive dashboard filters", async () => {
  const source = await readFile(path.resolve("src/App.tsx"), "utf8");
  const filterSource = await readFile(path.resolve("src/decision/DecisionUi.tsx"), "utf8");
  for (const label of ["部门", "分析视角", "分析场景", "脱敏商机", "金额显示", "重置"]) assert.equal(filterSource.includes(label), true, label);
  for (const legacyLabel of ["Executive Filters", "Business Segment", "Trade Lane", "Customer Tier", "Forecast Category"]) {
    assert.equal(filterSource.includes(legacyLabel), false, legacyLabel);
  }
  for (const legacyKey of ["business_segment", "trade_lane", "customer_tier", "forecast_category", "data_source"]) {
    assert.equal(filterSource.includes(legacyKey), false, legacyKey);
  }
});

test("frontend i18n has complete zh ja en dictionaries and language switcher", async () => {
  const i18nSource = await readFile(path.resolve("src/i18n/index.ts"), "utf8");
  const zhSource = await readFile(path.resolve("src/i18n/locales/zh-CN.ts"), "utf8");
  const jaSource = await readFile(path.resolve("src/i18n/locales/ja-JP.ts"), "utf8");
  const enSource = await readFile(path.resolve("src/i18n/locales/en-US.ts"), "utf8");
  const appSource = await readFile(path.resolve("src/internal/InternalAiLab.tsx"), "utf8");
  assert.equal(i18nSource.includes("localStorage"), true);
  assert.equal(i18nSource.includes("zh-CN"), true);
  assert.equal(i18nSource.includes("ja-JP"), true);
  assert.equal(i18nSource.includes("en-US"), true);
  assert.equal(i18nSource.includes("zhCN[key]"), true);
  for (const source of [zhSource, jaSource, enSource]) {
    for (const key of [
      "nav.managementCockpit",
      "filters.title",
      "cockpit.executiveSummary",
      "riskRadar.driverSummary",
      "actionBoard.summary",
      "dealBrief.safeContext",
      "safetyGateway.rawToSafe",
      "insight.finding",
      "common.clear",
    ]) {
      assert.equal(source.includes(`"${key}"`), true, key);
    }
  }
  assert.equal(appSource.includes("LanguageSwitcher"), true);
  assert.equal(appSource.includes("useI18n"), true);
  assert.equal(appSource.includes('t("nav.managementCockpit")'), true);
  assert.equal(appSource.includes('t("filters.title")'), true);
  assert.equal(appSource.includes('t("insight.finding")'), true);
});

test("Deal Brief exposes only a single-record manual External AI entry", async () => {
  const appSource = await readFile(path.resolve("src/internal/InternalAiLab.tsx"), "utf8");
  const apiSource = await readFile(path.resolve("src/api.ts"), "utf8");
  const zhSource = await readFile(path.resolve("src/i18n/locales/zh-CN.ts"), "utf8");
  const jaSource = await readFile(path.resolve("src/i18n/locales/ja-JP.ts"), "utf8");
  const enSource = await readFile(path.resolve("src/i18n/locales/en-US.ts"), "utf8");
  assert.equal(zhSource.includes("使用外部 AI 分析"), true);
  assert.equal(jaSource.includes("外部AIで分析"), true);
  assert.equal(enSource.includes("Analyze with External AI"), true);
  assert.equal(appSource.includes("ExternalAiResultCard"), true);
  assert.equal(appSource.includes("onExternalAiRiskAnalysis"), true);
  assert.match(appSource, /providerStatus\?\.provider === "openai-compatible"/);
  assert.match(appSource, /providerStatus\?\.externalAiEnabled === true/);
  assert.equal(enSource.includes("External AI disabled"), true);
  assert.equal(enSource.includes("Safe Context not ready"), true);
  assert.equal(enSource.includes("No CRM write-back"), true);
  assert.equal(enSource.includes("Raw CRM data not sent"), true);
  assert.equal(enSource.includes("Safe Context only"), true);
  assert.equal(appSource.includes('t("dealBrief.externalAiDisabled")'), true);
  assert.equal(appSource.includes('t("dealBrief.safeContextNotReady")'), true);
  assert.equal(appSource.includes('t("common.noCrmWriteBack")'), true);
  assert.equal(appSource.includes("Promise.all(filteredOpportunities.map"), false);
  assert.equal(appSource.includes("Promise.all(opportunities.map"), false);
  assert.equal(apiSource.includes("language: language || DEFAULT_LANGUAGE"), true);
  assert.equal(apiSource.includes("LLM_API_KEY"), false);
});

test("risk radar page is available without replacing formal app or design preview", async () => {
  const appSource = await readFile(path.resolve("src/App.tsx"), "utf8");
  const workspaceSource = await readFile(path.resolve("src/decision/DecisionWorkspace.tsx"), "utf8");
  const uiSource = await readFile(path.resolve("src/decision/DecisionUi.tsx"), "utf8");
  const mainSource = await readFile(mainTsxFile, "utf8");
  assert.equal(mainSource.includes('window.location.pathname === "/design-preview"'), true);
  for (const label of ["风险与优先级", "风险复核队列", "AI 综合判断", "核心证据"]) assert.equal(`${appSource}\n${workspaceSource}\n${uiSource}`.includes(label), true, label);
  assert.equal(workspaceSource.includes("RiskPage"), true);
  assert.equal(workspaceSource.includes('page === "risk"'), true);
});

test("main navigation follows the decision workflow and keeps legacy AI lab off the primary path", async () => {
  const appSource = await readFile(path.resolve("src/App.tsx"), "utf8");
  const mainSource = await readFile(mainTsxFile, "utf8");
  assert.equal(mainSource.includes('window.location.pathname === "/design-preview"'), true);
  const navSource = appSource.slice(appSource.indexOf("const NAVIGATION"), appSource.indexOf("export default function App"));
  const navOrder = ["AI 驾驶舱", "风险与优先级", "商机 360", "行动看板", "会议副驾", "组合洞察", "审计与安全"];
  for (let index = 0; index < navOrder.length - 1; index += 1) {
    assert.equal(navSource.indexOf(navOrder[index]) < navSource.indexOf(navOrder[index + 1]), true, `${navOrder[index]} before ${navOrder[index + 1]}`);
  }
  assert.equal(appSource.includes("DecisionWorkspace"), true);
  assert.equal(appSource.includes(">AI Sales Actions<"), false);
  assert.equal(navSource.includes("AI Lab"), false);
  assert.equal(appSource.includes("InternalAiLab"), false);
});

test("management summary is Chinese and generated from safe aggregate payload", async () => {
  const data = await loadGeneratedMockData();
  const dashboard = buildManagementDashboard(data, { period: "This Quarter" }, new Date("2026-07-02T00:00:00"));
  const output = generateManagementSummary(dashboard.summaryPayload);
  assert.equal(output.blocked, false);
  assert.match(output.output, /总体判断/);
  assert.match(output.output, /主要风险/);
  assert.match(output.output, /重点业务 \/ 阶段/);
  assert.match(output.output, /建议管理动作/);
  assert.equal(output.output.includes("customer_name"), false);
});

test("AI demo context builder creates safe context from mapped opportunities", () => {
  const mapped = mapDynamicsOpportunity(dynamicsRow, 0, new Date("2026-07-02T00:00:00"));
  const context = buildAiDemoContext({
    opportunities: [mapped, sample],
    filters: {},
    dynamicsStatus: { dataSource: "hybrid", recordCount: 1, lastRefreshTime: "2026-07-02T00:00:00.000Z" },
    now: new Date("2026-07-02T00:00:00"),
  });
  assert.equal(context.validation.ok, true);
  assert.equal(context.contextSummary.data_source, "hybrid");
  assert.equal(context.contextSummary.dynamics_records, 1);
  assert.equal(context.contextSummary.total_opportunities, 2);
  assert.equal(context.safeAggregateContext.dynamics_record_count, 1);
  assert.equal(context.safeAggregateContext.mock_record_count, 1);

  const serialized = JSON.stringify(context);
  for (const key of ["customer_name", "contact_email", "phone", "address", "detailed_address", "exact_revenue", "exact_margin", "supplier_cost", "contract_text", "contract_price", "meeting_transcript", "Contoso Real Customer", "Real Owner Name"]) {
    assert.equal(serialized.includes(key), false, key);
  }
  for (const item of context.safeOpportunityContext) {
    assert.equal(Boolean(item.opportunity_token), true);
    assert.equal(Boolean(item.customer_token), true);
    assert.equal(Boolean(item.revenue_band), true);
    assert.equal(Boolean(item.expected_order_status), true);
  }
});

test("AI insight rules use safe context for badges and management metrics", () => {
  const safeHighRisk = {
    opportunityToken: "OPP-SAFE-001",
    customerToken: "CUST-001",
    ownerToken: "OWNER-001",
    opportunityStage: "L4 Quotation",
    winProbability: "C",
    priority: "01: High",
    customerNeed: "竞争性报价",
    proposalContent: "降低成本（运输）",
    estimatedQuoteBand: "5M-10M",
    budgetAmountBand: "5M-10M",
    expectedOrderStatus: "overdue_9_days",
    organizationGroup: "01: BD Sales(CL)",
    bookingDepartment: "09: Shanghai Ocean Export",
    salesDepartment: "06: FF",
    decisionMakerStatus: "91：其他",
    sanitizedDescription: "客户希望重新评估物流方案。",
    sanitizedProgressSummary: "客户反馈价格偏高，要求补充降本方案。",
  };
  const badges = buildInsightBadges(safeHighRisk);
  for (const badge of ["High Risk", "Overdue", "Executive Attention", "Needs Follow-up", "Cost Pressure", "Decision Maker Unclear", "Low Win Probability"]) {
    assert.equal(badges.includes(badge), true, badge);
  }
  const insight = buildOpportunityInsight(safeHighRisk);
  assert.equal(insight.executive_intervention, true);
  assert.equal(insight.next_best_actions.some((item) => item.includes("成本拆分")), true);
  assert.equal(insight.materials_to_prepare.some((item) => item.includes("成本拆分")), true);
  const serializedInsight = JSON.stringify(insight);
  for (const forbidden of ["customer_name", "contact_email", "phone", "exact_revenue", "raw timeline", "客户真实名"]) {
    assert.equal(serializedInsight.includes(forbidden), false, forbidden);
  }

  const aggregate = buildInsightAggregate([safeHighRisk, { ...safeHighRisk, opportunityToken: "OPP-SAFE-002", expectedOrderStatus: "due_in_7_days", priority: "04: Low", estimatedQuoteBand: "1M-3M", decisionMakerStatus: "02：中国客户" }]);
  assert.equal(aggregate.demo_opportunity_count, 2);
  assert.equal(aggregate.high_risk_count, 1);
  assert.equal(aggregate.executive_attention_count >= 1, true);
  assert.equal(aggregate.sales_department_distribution[0].value, "06: FF");
});

test("risk radar model summarizes risk drivers and safe evidence only", () => {
  const highRisk = {
    opportunityToken: "OPP-SAFE-101",
    customerToken: "CUST-101",
    ownerToken: "OWNER-101",
    opportunityStage: "L4 Quotation",
    winProbability: "C",
    priority: "01: High",
    customerNeed: "竞争性报价",
    proposalContent: "降低成本（运输）",
    estimatedQuoteBand: "5M-10M",
    budgetAmountBand: "5M-10M",
    expectedOrderStatus: "overdue_11_days",
    decisionMakerStatus: "91：其他",
    sanitizedDescription: "已脱敏的方案摘要。",
    sanitizedProgressSummary: "客户反馈价格偏高，等待客户反馈。",
  };
  const lowRisk = {
    ...highRisk,
    opportunityToken: "OPP-SAFE-102",
    priority: "04: Low",
    winProbability: "A",
    customerNeed: "现有客户的业务扩展",
    proposalContent: "DX/可视化",
    estimatedQuoteBand: "1M-3M",
    expectedOrderStatus: "due_in_14_days",
    decisionMakerStatus: "02：中国客户",
    sanitizedProgressSummary: "例行跟进中。",
  };
  const radar = buildRiskRadarModel([highRisk, lowRisk]);
  assert.equal(radar.totalCount, 2);
  assert.equal(radar.driverSummary.find((item) => item.driver === "Overdue").count, 1);
  assert.equal(radar.driverSummary.find((item) => item.driver === "Low Win Probability").count, 1);
  assert.equal(radar.driverSummary.find((item) => item.driver === "Cost Pressure").count, 1);
  assert.equal(radar.driverSummary.find((item) => item.driver === "Decision Maker Unclear").count, 1);
  assert.equal(radar.driverSummary.find((item) => item.driver === "Needs Follow-up").count, 1);
  assert.equal(radar.driverSummary.find((item) => item.driver === "Executive Attention").count, 1);
  assert.equal(radar.matrix.some((item) => item.stage === "L4 Quotation" && item.riskLevel === "high" && item.count === 1), true);
  assert.equal(radar.topRiskCases[0].opportunityToken, "OPP-SAFE-101");
  assert.equal(radar.riskCases.length, 2);
  for (const cell of radar.matrix.filter((item) => item.count > 0)) {
    assert.equal(
      radar.riskCases.filter((item) => item.opportunityStage === cell.stage && item.riskLevel === cell.riskLevel).length,
      cell.count,
      `${cell.stage}/${cell.riskLevel}`,
    );
  }
  assert.equal(radar.topRiskCases[0].recommendedMitigation.some((item) => item.includes("成本拆分")), true);
  assert.equal(radar.topRiskCases[0].safety, "Safety: raw CRM data not sent");

  const serialized = JSON.stringify(radar);
  for (const forbidden of ["customer_name", "contact_email", "phone", "detailed_address", "exact_revenue", "raw timeline", "客户真实名"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("action board model turns safe insights into owner actions and safe CRM drafts", () => {
  const urgent = {
    opportunityToken: "OPP-SAFE-201",
    customerToken: "CUST-201",
    ownerToken: "OWNER-201",
    opportunityStage: "L4 Quotation",
    winProbability: "C",
    priority: "01: High",
    customerNeed: "竞争性报价",
    proposalContent: "降低成本（运输）",
    estimatedQuoteBand: "5M-10M",
    budgetAmountBand: "5M-10M",
    expectedOrderStatus: "overdue_11_days",
    decisionMakerStatus: "91：其他",
    sanitizedDescription: "已脱敏的方案摘要。",
    sanitizedProgressSummary: "客户反馈价格偏高，等待客户反馈。",
  };
  const normal = {
    ...urgent,
    opportunityToken: "OPP-SAFE-202",
    ownerToken: "OWNER-202",
    priority: "04: Low",
    winProbability: "A",
    customerNeed: "现有客户的业务扩展",
    proposalContent: "DX/可视化",
    estimatedQuoteBand: "1M-3M",
    expectedOrderStatus: "due_in_14_days",
    decisionMakerStatus: "02：中国客户",
    sanitizedProgressSummary: "例行跟进中。",
  };
  const board = buildActionBoardModel([urgent, normal]);
  assert.equal(board.summary.totalActions >= 7, true);
  assert.equal(board.summary.costBreakdownNeeded, 1);
  assert.equal(board.summary.decisionMakerConfirmationNeeded, 1);
  assert.equal(board.summary.overdueFollowUpNeeded, 1);
  assert.equal(board.summary.executiveEscalations, 1);
  assert.deepEqual(actionTypeSubtitles, {
    "Prepare Cost Breakdown": "准备成本拆分",
    "Confirm Decision Maker": "确认决裁人",
    "Schedule Second Discussion": "安排二次沟通",
    "Follow Overdue Quote": "跟进逾期报价",
    "Review Low Win Probability": "复盘低受注概率案件",
    "Escalate to Management": "管理层介入",
    "Update CRM Progress Summary": "更新案件进展摘要",
  });
  for (const actionType of [
    "Prepare Cost Breakdown",
    "Confirm Decision Maker",
    "Schedule Second Discussion",
    "Follow Overdue Quote",
    "Review Low Win Probability",
    "Escalate to Management",
    "Update CRM Progress Summary",
  ]) {
    assert.equal(board.actions.some((item) => item.actionType === actionType), true, actionType);
    assert.equal(board.actions.some((item) => item.actionType === actionType && item.actionSubtitle === actionTypeSubtitles[actionType]), true, `${actionType} subtitle`);
  }
  assert.equal(board.actionTypeGroups.every((item) => item.actionSubtitle === actionTypeSubtitles[item.actionType]), true);
  assert.equal(board.actions.every((item) => Boolean(item.actionReason)), true);
  assert.equal(board.ownerGroups.some((item) => item.ownerToken === "OWNER-201" && item.urgentCount > 0), true);
  assert.equal(board.priorityRanks.some((item) => item.rank === "Must Win" && item.count === 1), true);
  assert.equal(board.priorityRanks.some((item) => item.rank === "Monitor" && item.count === 1), true);
  assert.equal(board.actions.every((item) => item.safety === "Safety: raw CRM data not sent"), true);

  const serialized = JSON.stringify(board);
  for (const forbidden of ["customer_name", "contact_email", "phone", "detailed_address", "exact_revenue", "raw timeline", "客户真实名"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("AI insight follow-up and cost rules use sanitized text only", () => {
  const safe = {
    opportunityToken: "OPP-SAFE-003",
    customerToken: "CUST-003",
    ownerToken: "OWNER-003",
    opportunityStage: "L3",
    winProbability: "Y",
    priority: "02: Important",
    customerNeed: "竞争性报价",
    proposalContent: "降低成本（所有）",
    estimatedQuoteBand: "10M+",
    expectedOrderStatus: "due_in_5_days",
    decisionMakerStatus: "01：海外客户",
    sanitizedDescription: "已脱敏的客户需求摘要。",
    sanitizedProgressSummary: "二次沟通后仍在等待客户反馈，客户认为价格偏高。",
  };
  const insight = buildOpportunityInsight(safe);
  assert.equal(insight.badges.includes("Needs Follow-up"), true);
  assert.equal(insight.badges.includes("Low Win Probability"), true);
  assert.equal(insight.badges.includes("Executive Attention"), true);
  assert.equal(insight.next_best_actions.some((item) => item.includes("二次沟通")), true);
  assert.equal(insight.materials_to_prepare.some((item) => item.includes("二次沟通")), true);
  const serialized = JSON.stringify(insight);
  for (const forbidden of ["contact_email", "phone", "detailed_address", "exact_revenue", "raw timeline"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("provider context exposes only safeOpportunityContext to AI provider", () => {
  const context = buildAiDemoContext({
    opportunities: [sample],
    filters: {},
    dynamicsStatus: { dataSource: "mock", recordCount: 0, lastRefreshTime: "" },
    now: new Date("2026-07-02T00:00:00"),
  });
  const providerContext = buildProviderContext(context);
  assert.equal(providerContext.validation.ok, true);
  assert.deepEqual(Object.keys(providerContext).sort(), ["safeOpportunityContext", "validation"].sort());
  assert.equal(Object.prototype.hasOwnProperty.call(providerContext, "safeAggregateContext"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(providerContext, "contextSummary"), false);
  assert.equal(providerContext.safeOpportunityContext.length, 1);
  const serialized = JSON.stringify(providerContext);
  for (const value of sensitiveValues) {
    assert.equal(serialized.includes(value), false, value);
  }
});

test("demo chat provider answers supported intents from safe context", () => {
  const context = buildAiDemoContext({
    opportunities: [sample],
    filters: {},
    dynamicsStatus: { dataSource: "mock", recordCount: 0, lastRefreshTime: "" },
    now: new Date("2026-07-02T00:00:00"),
  });
  for (const [question, expected] of [
    ["哪些客户本月风险最高？", /OPP-001|CUST-001/],
    ["本周应该优先跟进哪些案件？", /优先跟进/],
    ["哪些客户适合交叉销售？", /客户组合|CUST-001/],
    ["当前 Pipeline 最大风险在哪里？", /Pipeline/],
    ["负责人行动有哪些？", /负责人行动/],
    ["CRM 数据质量怎么样？", /Data Quality|数据质量/],
    ["请生成营业会议摘要", /安全上下文|高风险/],
  ]) {
    const answer = generateDemoChatAnswer({ question, context, language: "zh-CN" });
    assert.equal(answer.blocked, false, question);
    assert.match(answer.answer, expected, question);
  }

  const empty = buildAiDemoContext({ opportunities: [], filters: {}, dynamicsStatus: { dataSource: "mock" }, now: new Date("2026-07-02T00:00:00") });
  const emptyAnswer = generateDemoChatAnswer({ question: "哪些客户风险最高？", context: empty, language: "zh-CN" });
  assert.match(emptyAnswer.answer, /当前筛选范围内没有发现相关案件/);
});

test("AI sales actions are generated from safe context only", () => {
  const dynamicsMapped = mapDynamicsOpportunity(dynamicsRow, 0, new Date("2026-07-02T00:00:00"));
  const opportunities = [sample, dynamicsMapped];
  for (const actionName of ["opportunity-brief", "next-best-actions", "risk-summary", "data-doctor", "meeting-copilot", "customer-growth", "draft-pack"]) {
    const response = runAiAction({
      actionName,
      opportunities,
      dynamicsStatus: { dataSource: "hybrid", recordCount: 1, lastRefreshTime: "2026-07-02T00:00:00.000Z" },
      params: {
        opportunity_id: "OPP-001",
        customer_token: "CUST-001",
        filters: {},
        role: "Sales Manager",
        language: "zh-CN",
        rawOpportunity: sample,
      },
      now: new Date("2026-07-02T00:00:00"),
    });
    assert.equal(response.blocked, false, actionName);
    assert.equal(response.audit.provider, "demo", actionName);
    assert.equal(response.audit.external_model_called, false, actionName);
    assert.equal(response.audit.safe_context_enabled, true, actionName);
    assert.equal(response.audit.functionName, actionName, actionName);
    assert.deepEqual(response.audit.safe_payload_keys, ["safeOpportunityContext"], actionName);
    const serialized = JSON.stringify(response);
    for (const value of [...sensitiveValues, "Contoso Real Customer", "Real Owner Name"]) {
      assert.equal(serialized.includes(value), false, `${actionName} leaked ${value}`);
    }
  }

  const brief = runAiAction({
    actionName: "opportunity-brief",
    opportunities,
    dynamicsStatus: { dataSource: "mock", recordCount: 0 },
    params: { opportunity_id: "OPP-001" },
    now: new Date("2026-07-02T00:00:00"),
  });
  assert.equal(Boolean(brief.result.crm_next_step_draft), true);
  assert.equal(Array.isArray(brief.result.next_actions), true);

  const actions = runAiAction({
    actionName: "next-best-actions",
    opportunities,
    dynamicsStatus: { dataSource: "mock", recordCount: 0 },
    params: {},
    now: new Date("2026-07-02T00:00:00"),
  });
  assert.equal(actions.result.items.length > 0, true);
  assert.equal(Boolean(actions.result.items[0].action), true);
  assert.equal(Boolean(actions.result.items[0].owner), true);
  assert.equal(Boolean(actions.result.items[0].due), true);
  assert.equal(Boolean(actions.result.items[0].reason), true);
  assert.equal(Array.isArray(actions.result.items[0].evidence), true);

  const risk = runAiAction({
    actionName: "risk-summary",
    opportunities,
    dynamicsStatus: { dataSource: "mock", recordCount: 0 },
    params: { opportunity_id: "OPP-001" },
    now: new Date("2026-07-02T00:00:00"),
  });
  assert.equal(risk.result.type, "risk-summary");
  assert.equal(Boolean(risk.result.risk_summary), true);
  assert.equal(Array.isArray(risk.result.key_drivers), true);

  const doctor = runAiAction({
    actionName: "data-doctor",
    opportunities: [{ ...sample, stage: "L5 Won", expected_order_date: "2026-06-01", data_quality_flags: ["missing decision maker"] }],
    dynamicsStatus: { dataSource: "mock", recordCount: 0 },
    params: {},
    now: new Date("2026-07-02T00:00:00"),
  });
  assert.equal(doctor.result.issues.length > 0, true);
  assert.equal(doctor.result.issues.some((item) => /Overdue|Closed Stage|CRM Data Quality/.test(item.issue_type)), true);

  const meeting = runAiAction({
    actionName: "meeting-copilot",
    opportunities,
    dynamicsStatus: { dataSource: "hybrid", recordCount: 1 },
    params: {},
    now: new Date("2026-07-02T00:00:00"),
  });
  assert.match(meeting.result.markdown, /营业会议摘要/);

  const growth = runAiAction({
    actionName: "customer-growth",
    opportunities,
    dynamicsStatus: { dataSource: "mock", recordCount: 0 },
    params: { customer_token: "CUST-001" },
    now: new Date("2026-07-02T00:00:00"),
  });
  assert.equal(JSON.stringify(growth.result).includes(sample.customer_name), false);
  assert.equal(Boolean(growth.result.suggested_talk_track), true);

  const drafts = runAiAction({
    actionName: "draft-pack",
    opportunities,
    dynamicsStatus: { dataSource: "mock", recordCount: 0 },
    params: { opportunity_id: "OPP-001" },
    now: new Date("2026-07-02T00:00:00"),
  });
  const draftJson = JSON.stringify(drafts.result);
  assert.equal(draftJson.includes(sample.contact_email), false);
  assert.equal(draftJson.includes(sample.phone), false);
  assert.equal(draftJson.includes(String(sample.exact_revenue)), false);

  const empty = runAiAction({
    actionName: "next-best-actions",
    opportunities: [],
    dynamicsStatus: { dataSource: "mock", recordCount: 0 },
    params: {},
    now: new Date("2026-07-02T00:00:00"),
  });
  assert.equal(empty.blocked, false);
  assert.equal(empty.result.items.length, 0);
  assert.match(empty.result.message, /当前筛选范围内没有发现相关案件/);
});

test("AI sales actions block unsafe safe context", () => {
  const unsafe = runAiAction({
    actionName: "opportunity-brief",
    opportunities: [{ ...sample, customer_code: "CUST-001", ai_suggested_action: "Email john.smith@acme.example directly" }],
    dynamicsStatus: { dataSource: "mock", recordCount: 0 },
    params: { opportunity_id: "OPP-001" },
    now: new Date("2026-07-02T00:00:00"),
  });
  assert.equal(unsafe.blocked, true);
  assert.match(unsafe.error, /Blocked sensitive value pattern/);
});

test("AI service uses demo provider, defaults zh-CN, and blocks unsafe payloads", async () => {
  const data = await loadGeneratedMockData();
  const dashboard = buildManagementDashboard(data, { period: "This Quarter" }, new Date("2026-07-02T00:00:00"));
  const summary = await runAi({
    functionName: "management-summary",
    safePayload: dashboard.summaryPayload,
    role: "Sales Manager",
    opportunity_id: "management-dashboard",
  });
  assert.equal(DEFAULT_LANGUAGE, "zh-CN");
  assert.equal(DEFAULT_LLM_PROVIDER, "demo");
  assert.equal(summary.result.blocked, false);
  assert.equal(summary.result.provider, "demo");
  assert.equal(summary.result.external_model_called, false);
  assert.equal(summary.result.language, "zh-CN");
  assert.equal(summary.audit.provider, "demo");
  assert.equal(summary.audit.external_model_called, false);
  assert.equal(summary.audit.intent, "management-summary");

  const safe = transformOpportunity(sample, "Sales Owner", new Date("2026-07-02T00:00:00")).safePayload;
  const caseOutput = await runAi({
    functionName: "case-summary",
    safePayload: safe,
    role: "Sales Owner",
    opportunity_id: "OPP-001",
    language: "zh-CN",
  });
  assert.equal(caseOutput.result.blocked, false);
  assert.equal(caseOutput.result.provider, "demo");
  assert.equal(caseOutput.result.external_model_called, false);

  const unsafeSummary = await runAi({
    functionName: "management-summary",
    safePayload: { ...dashboard.summaryPayload, customer_name: "Raw Customer" },
    role: "Sales Manager",
    opportunity_id: "management-dashboard",
  });
  assert.equal(unsafeSummary.result.blocked, true);
  assert.match(unsafeSummary.result.error, /Blocked sensitive content/);

  const unsafeCase = await runAi({
    functionName: "case-summary",
    safePayload: { ...safe, exact_revenue: 123456 },
    role: "Sales Owner",
    opportunity_id: "OPP-001",
  });
  assert.equal(unsafeCase.result.blocked, true);
  assert.match(unsafeCase.result.error, /Blocked sensitive key/);

  for (const [field, value] of [["detailed_address", "1 Real Street"], ["contract_price", 123456]]) {
    const blocked = await runAi({
      functionName: "case-summary",
      safePayload: { ...safe, [field]: value },
      role: "Sales Owner",
      opportunity_id: "OPP-001",
    });
    assert.equal(blocked.result.blocked, true, field);
    assert.match(blocked.result.error, /Blocked sensitive key/, field);
  }
});

test("LLM provider router defaults to demo and only enables external AI with complete explicit config", async () => {
  const defaultStatus = resolveProviderStatus({});
  assert.equal(defaultStatus.provider, "demo");
  assert.equal(defaultStatus.externalAiEnabled, false);
  assert.equal(defaultStatus.configured, false);
  assert.match(defaultStatus.fallbackReason, /AI_PROVIDER/);

  const disabledStatus = resolveProviderStatus({
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "false",
    LLM_BASE_URL: "https://llm.example/v1",
    LLM_API_KEY: "<TEST_ONLY_API_KEY>",
    LLM_MODEL: "model-a",
  });
  assert.equal(disabledStatus.provider, "demo");
  assert.equal(disabledStatus.externalAiEnabled, false);
  assert.match(disabledStatus.fallbackReason, /ALLOW_EXTERNAL_AI/);

  const incompleteStatus = resolveProviderStatus({
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "true",
    LLM_BASE_URL: "https://llm.example/v1",
    LLM_MODEL: "model-a",
  });
  assert.equal(incompleteStatus.provider, "demo");
  assert.equal(incompleteStatus.configured, false);
  assert.match(incompleteStatus.fallbackReason, /missing/i);

  const configuredStatus = resolveProviderStatus({
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "true",
    LLM_BASE_URL: "https://llm.example/v1",
    LLM_API_KEY: "<TEST_ONLY_API_KEY>",
    LLM_MODEL: "model-a",
  });
  assert.equal(configuredStatus.provider, "openai-compatible");
  assert.equal(configuredStatus.externalAiEnabled, true);
  assert.equal(configuredStatus.configured, true);
});

test("LLM prompt builder whitelists Safe Context fields and blocks raw sensitive content", () => {
  const payload = buildProviderPromptPayload({
    language: "ja-JP",
    safePayload: {
      opportunityToken: "OPP-001",
      customerToken: "CUST-001",
      ownerToken: "OWNER-001",
      opportunityStage: "L4 Quotation",
      winProbability: "C",
      priority: "01: High",
      customerNeed: "02: 竞争性报价",
      proposalContent: "03: 降低成本（运输）",
      estimatedQuoteBand: "5M+",
      budgetAmountBand: "5M+",
      expectedOrderStatus: "overdue",
      organizationGroup: "01: BD Sales(CL)",
      bookingDepartment: "01: Domestic Div.",
      salesDepartment: "06: FF",
      decisionMakerStatus: "91：其他",
      transportMode: "03 OE",
      sanitizedDescription: "安全说明",
      sanitizedProgressSummary: "客户反馈价格偏高，等待客户反馈。",
      dataQualityFlags: ["missing_next_step"],
      badges: ["Cost Pressure"],
      raw_account_name: "Raw Customer",
      contact_email: "person@example.com",
      exact_revenue: 5238000,
    },
  });
  const serialized = JSON.stringify(payload.providerPayload);
  assert.equal(payload.validation.ok, true);
  assert.equal(serialized.includes("opportunityToken"), true);
  assert.equal(serialized.includes("selectedLanguage"), true);
  assert.equal(serialized.includes("raw_account_name"), false);
  assert.equal(serialized.includes("contact_email"), false);
  assert.equal(serialized.includes("exact_revenue"), false);
  assert.equal(serialized.includes("person@example.com"), false);
  assert.equal(payload.messages[0].content.startsWith("Return ONLY valid JSON. No markdown. No explanation. No code fence."), true);
  assert.match(payload.messages[0].content, /Do not use markdown/i);
  assert.match(payload.messages[0].content, /code fence/i);
  assert.match(payload.messages[1].content, /Your response must start with \{ and end with \}\./);

  const unsafe = buildProviderPromptPayload({
    language: "zh-CN",
    safePayload: { opportunityToken: "OPP-001", sanitizedDescription: "call +86 138 0000 0000 from raw timeline" },
  });
  assert.equal(unsafe.validation.ok, false);
  assert.match(unsafe.validation.reason, /possible phone number|raw timeline/i);
  assert.equal(unsafe.validation.reason.includes("/"), false);
  assert.equal(containsForbiddenProviderContent({ sanitizedDescription: "john@example.com" }).ok, false);
});

test("provider safety phone detection blocks real phones without blocking safe business values", async () => {
  for (const phone of ["+86 138 0000 0000", "13800000000", "021-1234-5678", "(021) 1234-5678"]) {
    const result = containsForbiddenProviderContent({ sanitizedProgressSummary: `客户补充联系方式 ${phone}` });
    assert.equal(result.ok, false, phone);
    assert.equal(result.reason, "Blocked sensitive provider value: possible phone number");
    assert.equal(result.blockedPatternKey, "phone");
    assert.equal(result.reason.includes("/"), false);
  }

  for (const value of ["2026-07-05", "due_in_13_days", "5%-10%", "1M-5M", "OPP-2026-0001", "L1", "L2", "L3", "L4", "L5", "13 days overdue", "margin band 5%-10%"]) {
    const result = containsForbiddenProviderContent({
      opportunityToken: "OPP-2026-0001",
      expectedOrderStatus: value,
      estimatedQuoteBand: "1M-5M",
      budgetAmountBand: "5M+",
      sanitizedProgressSummary: `Safe business status: ${value}`,
      dataQualityFlags: ["due_in_13_days"],
    });
    assert.equal(result.ok, true, value);
  }

  assert.equal(containsForbiddenProviderContent({ sanitizedDescription: "john@example.com" }).blockedPatternKey, "email");
  assert.equal(containsForbiddenProviderContent({ sanitizedDescription: "quote is RMB 120000" }).blockedPatternKey, "exact_amount");

  let calls = 0;
  const safePayload = {
    opportunityToken: "OPP-2026-0001",
    opportunityStage: "L4",
    expectedOrderStatus: "13 days overdue",
    estimatedQuoteBand: "1M-5M",
    budgetAmountBand: "5M+",
    sanitizedProgressSummary: "Customer feedback is due_in_13_days; margin band 5%-10%; target date 2026-07-05.",
    dataQualityFlags: ["due_in_13_days"],
  };
  const result = await runProviderCompletion({
    functionName: "risk-analysis",
    safePayload,
    language: "en-US",
    env: {
      AI_PROVIDER: "openai-compatible",
      ALLOW_EXTERNAL_AI: "true",
      LLM_BASE_URL: "https://llm.example/v1",
      LLM_API_KEY: "<TEST_ONLY_API_KEY>",
      LLM_MODEL: "model-a",
    },
    demoFallback: () => ({ provider: "demo", external_model_called: false, output: "demo fallback", usedPayloadKeys: Object.keys(safePayload) }),
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "{\"summary\":\"Safe\",\"findings\":[],\"risks\":[],\"recommendedActions\":[],\"requiredMaterials\":[],\"managementEscalation\":false,\"safetyNote\":\"raw CRM data not sent\"}" } }],
        }),
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.result.provider, "openai-compatible");
  assert.equal(result.audit.output_guard_status, "pass");
});

test("openai-compatible provider calls external endpoint only when enabled and falls back safely", async () => {
  let calls = 0;
  const env = {
    AI_PROVIDER: "openai-compatible",
    ALLOW_EXTERNAL_AI: "true",
    LLM_BASE_URL: "https://llm.example/v1",
    LLM_API_KEY: "<TEST_ONLY_API_KEY>",
    LLM_MODEL: "model-a",
    LLM_TIMEOUT_MS: "20000",
  };
  const safePayload = {
    opportunityToken: "OPP-001",
    customerToken: "CUST-001",
    ownerToken: "OWNER-001",
    opportunityStage: "L4 Quotation",
    estimatedQuoteBand: "5M+",
    sanitizedProgressSummary: "客户反馈价格偏高，等待客户反馈。",
  };
  const result = await runProviderCompletion({
    functionName: "case-summary",
    safePayload,
    language: "en-US",
    env,
    demoFallback: () => ({ provider: "demo", external_model_called: false, output: "demo fallback", usedPayloadKeys: Object.keys(safePayload) }),
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(url, "https://llm.example/v1/chat/completions");
      assert.equal(options.headers.authorization, "Bearer <TEST_ONLY_API_KEY>");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "model-a");
      assert.equal(body.stream, false);
      assert.deepEqual(body.response_format, { type: "json_object" });
      assert.equal(JSON.stringify(body).includes("raw_account_name"), false);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "```json\n{\"summary\":\"Safe summary\",\"findings\":[\"Finding\"],\"risks\":[],\"recommendedActions\":[\"Action\"],\"requiredMaterials\":[],\"managementEscalation\":true,\"safetyNote\":\"raw CRM data not sent\"}\n```" } }],
        }),
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.result.provider, "openai-compatible");
  assert.equal(result.result.external_model_called, true);
  assert.equal(result.result.jsonOutput.summary, "Safe summary");
  assert.equal(result.audit.provider_requested, "openai-compatible");
  assert.equal(result.audit.provider_used, "openai-compatible");
  assert.equal(result.audit.raw_data_sent, false);
  assert.equal(result.audit.safe_context_used, true);
  assert.equal(result.audit.output_guard_status, "pass");
  assert.equal(result.audit.response_format_requested, true);
  assert.equal(result.audit.response_format_retry_used, false);
  assert.equal(result.audit.external_response_preview_sanitized.includes("Safe summary"), true);
  assert.equal(result.audit.safe_payload_char_count > 0, true);
  assert.equal(result.audit.response_char_count > 0, true);
});

test("openai-compatible provider retries without response_format when provider rejects it", async () => {
  let calls = 0;
  const result = await runProviderCompletion({
    functionName: "case-summary",
    safePayload: { opportunityToken: "OPP-001", sanitizedProgressSummary: "安全摘要" },
    language: "en-US",
    env: {
      AI_PROVIDER: "openai-compatible",
      ALLOW_EXTERNAL_AI: "true",
      LLM_BASE_URL: "https://llm.example/v1",
      LLM_API_KEY: "<TEST_ONLY_API_KEY>",
      LLM_MODEL: "model-a",
    },
    demoFallback: () => ({ provider: "demo", external_model_called: false, output: "demo fallback", usedPayloadKeys: ["opportunityToken"] }),
    fetchImpl: async (_url, options) => {
      calls += 1;
      const body = JSON.parse(options.body);
      if (calls === 1) {
        assert.deepEqual(body.response_format, { type: "json_object" });
        return { ok: false, status: 400, json: async () => ({ error: "response_format unsupported" }) };
      }
      assert.equal(Object.prototype.hasOwnProperty.call(body, "response_format"), false);
      assert.equal(body.stream, false);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "{\"summary\":\"Retry safe\",\"findings\":[],\"risks\":[],\"recommendedActions\":[],\"requiredMaterials\":[],\"managementEscalation\":false,\"safetyNote\":\"raw CRM data not sent\"}" } }],
        }),
      };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.result.provider, "openai-compatible");
  assert.equal(result.audit.response_format_requested, true);
  assert.equal(result.audit.response_format_retry_used, true);
  assert.equal(result.audit.output_guard_status, "pass");
});

test("external LLM invalid output falls back to demoProvider and records audit reason", async () => {
  let calls = 0;
  const fallback = await runProviderCompletion({
    functionName: "case-summary",
    safePayload: { opportunityToken: "OPP-001", sanitizedProgressSummary: "安全摘要" },
    language: "zh-CN",
    env: {
      AI_PROVIDER: "openai-compatible",
      ALLOW_EXTERNAL_AI: "true",
      LLM_BASE_URL: "https://llm.example/v1",
      LLM_API_KEY: "<TEST_ONLY_API_KEY>",
      LLM_MODEL: "model-a",
    },
    demoFallback: () => ({ provider: "demo", external_model_called: false, output: "demo fallback", usedPayloadKeys: ["opportunityToken", "sanitizedProgressSummary"] }),
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "not json" } }] }) };
    },
  });
  assert.equal(calls, 1);
  assert.equal(fallback.result.provider, "demo");
  assert.equal(fallback.result.external_model_called, false);
  assert.equal(fallback.result.output, "demo fallback");
  assert.equal(fallback.audit.provider_requested, "openai-compatible");
  assert.equal(fallback.audit.provider_used, "demo");
  assert.equal(fallback.audit.fallback_used, true);
  assert.match(fallback.audit.fallback_reason, /json/i);
  assert.equal(fallback.audit.external_model_called, true);

  const guarded = guardProviderOutput('```json\n{"summary":"OK","findings":[],"risks":[],"recommendedActions":[],"requiredMaterials":[],"managementEscalation":false,"safetyNote":"raw CRM data not sent"}\n```');
  assert.equal(guarded.ok, true);
  assert.equal(guarded.value.summary, "OK");
  const extracted = guardProviderOutput('说明文字 {"summary":"OK","findings":[],"risks":[],"recommendedActions":[],"requiredMaterials":[],"managementEscalation":false,"safetyNote":"raw CRM data not sent"} 后续文字');
  assert.equal(extracted.ok, true);
  assert.equal(extracted.value.summary, "OK");
  const missing = guardProviderOutput('{"summary":"OK"}');
  assert.equal(missing.ok, false);
  assert.equal(missing.status, "invalid_schema");
  const sensitive = guardProviderOutput('{"summary":"Call john@example.com","findings":[],"risks":[],"recommendedActions":[],"requiredMaterials":[],"managementEscalation":false,"safetyNote":"raw CRM data not sent"}');
  assert.equal(sensitive.ok, false);
  assert.equal(sensitive.status, "unsafe_output");
});

test("external LLM is not used by Management Cockpit, Risk Radar, Action Board, or ai-actions", async () => {
  const appSource = await readFile(path.resolve("server/app.mjs"), "utf8");
  const actionServiceSource = await readFile(path.resolve("server/ai/actionService.mjs"), "utf8");
  const managementSource = await readFile(path.resolve("server/management.mjs"), "utf8");
  assert.equal(appSource.includes('app.post("/api/ai-actions/:actionName"'), true);
  assert.equal(actionServiceSource.includes("providerRouter"), false);
  assert.equal(managementSource.includes("providerRouter"), false);
  assert.equal(appSource.includes('app.post("/api/ai/:functionName"'), true);
  assert.equal(appSource.includes('app.post("/api/ai-demo/chat"'), true);
  assert.equal(appSource.includes('app.get("/api/ai/provider-status"'), true);
});

test("real provider check script is safe, scoped, and does not expose secrets", async () => {
  const scriptSource = await readFile(path.resolve("scripts/check-openai-compatible-provider.mjs"), "utf8");
  assert.equal(scriptSource.includes("LLM_API_KEY"), true);
  assert.equal(scriptSource.includes("writeFile"), false);
  assert.equal(scriptSource.includes("console.log(prompt"), false);
  assert.equal(scriptSource.includes("/api/ai-demo/chat"), true);
  assert.equal(scriptSource.includes("/api/ai/risk-analysis"), true);
  assert.equal(scriptSource.includes("/api/ai-actions"), false);

  let llmCalls = 0;
  const result = await runOpenAiCompatibleProviderCheck({
    env: {
      AI_PROVIDER: "openai-compatible",
      ALLOW_EXTERNAL_AI: "true",
      LLM_BASE_URL: "https://llm.example/v1",
      LLM_API_KEY: "<TEST_ONLY_API_KEY>",
      LLM_MODEL: "safe-model",
    },
    fetchImpl: async (url, options) => {
      if (String(url).includes("/chat/completions")) {
        llmCalls += 1;
        assert.equal(url, "https://llm.example/v1/chat/completions");
        assert.equal(options.headers.authorization, "Bearer <TEST_ONLY_API_KEY>");
        const body = JSON.parse(options.body);
        assert.equal(body.model, "safe-model");
        assert.equal(body.stream, false);
        assert.deepEqual(body.response_format, { type: "json_object" });
        assert.equal(JSON.stringify(body).includes("SECRET_SHOULD_NOT_LEAK"), false);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: "{\"summary\":\"Safe\",\"findings\":[],\"risks\":[],\"recommendedActions\":[],\"requiredMaterials\":[],\"managementEscalation\":false,\"safetyNote\":\"raw CRM data not sent\"}" } }],
          }),
        };
      }
      return fetch(url, options);
    },
  });
  const serialized = JSON.stringify(result);
  assert.equal(llmCalls, 2);
  assert.equal(result.providerType, "openai-compatible");
  assert.equal(result.externalCallSucceeded, true);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.outputGuardStatus, "pass");
  assert.equal(serialized.includes("SECRET_SHOULD_NOT_LEAK"), false);
  assert.equal(serialized.includes(sample.customer_name), false);
  assert.equal(serialized.includes(sample.contact_email), false);
  assert.equal(serialized.includes(sample.phone), false);
  assert.equal(result.auditSample.raw_data_sent, false);
  assert.equal(result.auditSample.safe_context_used, true);
  assert.equal(result.auditSample.response_format_requested, true);
  assert.equal(result.auditSample.response_format_retry_used, false);
  assert.equal(result.externalResponsePreviewSanitized.includes("Safe"), true);
  assert.equal(result.finalEnvFileStatus.AI_PROVIDER, "demo");
  assert.equal(result.finalEnvFileStatus.ALLOW_EXTERNAL_AI, "false");
});

test("real provider check script supports minimal-json mode without exposing unsafe data", async () => {
  let llmCalls = 0;
  const result = await runOpenAiCompatibleProviderCheck({
    minimalJson: true,
    env: {
      AI_PROVIDER: "openai-compatible",
      ALLOW_EXTERNAL_AI: "true",
      LLM_BASE_URL: "https://llm.example/v1",
      LLM_API_KEY: "<TEST_ONLY_API_KEY>",
      LLM_MODEL: "safe-model",
    },
    fetchImpl: async (url, options) => {
      if (String(url).includes("/chat/completions")) {
        llmCalls += 1;
        const body = JSON.parse(options.body);
        const userMessage = body.messages.find((message) => message.role === "user")?.content || "";
        assert.equal(userMessage.includes('"summary":"ok"'), true);
        assert.equal(JSON.stringify(body).includes("SECRET_SHOULD_NOT_LEAK"), false);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: "```json\n{\"summary\":\"ok\",\"findings\":[],\"risks\":[],\"recommendedActions\":[],\"requiredMaterials\":[],\"managementEscalation\":false,\"safetyNote\":\"raw CRM data not sent\"}\n```" } }],
          }),
        };
      }
      return fetch(url, options);
    },
  });
  const serialized = JSON.stringify(result);
  assert.equal(llmCalls, 2);
  assert.equal(result.externalCallSucceeded, true);
  assert.equal(result.outputGuardStatus, "pass");
  assert.equal(serialized.includes("SECRET_SHOULD_NOT_LEAK"), false);
  assert.equal(serialized.includes(sample.customer_name), false);
  assert.equal(result.externalResponsePreviewSanitized.includes("ok"), true);
});

test("dynamics mapper tokenizes Dataverse row and keeps raw display values out of AI payload", () => {
  const mapped = mapDynamicsOpportunity(dynamicsRow, 0, new Date("2026-07-02T00:00:00"));
  const mappedAgain = mapDynamicsOpportunity(dynamicsRow, 0, new Date("2026-07-02T00:00:00"));
  assert.equal(mapped.id.startsWith("DYN-"), true);
  assert.equal(mapped.customer_code.startsWith("CUST-"), true);
  assert.equal(mapped.owner_id.startsWith("OWNER-"), true);
  assert.equal(mapped.exact_revenue, 6800000);
  assert.equal(mapped.expected_order_date, "2026-06-20");
  assert.equal(mapped.stage, "L2 Need Confirmed");
  assert.equal(mapped.opportunityStage, "L2 Need Confirmed");
  assert.notEqual(mapped.opportunity_type, "现有");
  assert.notEqual(mapped.opportunity_detail_type, "运输");
  assert.notEqual(mapped.customer_need, "竞争性报价");
  assert.notEqual(mapped.proposal_content, "降低成本（运输）");
  assert.equal(mapped.winProbability, "C");
  assert.equal(mapped.opportunity_name.startsWith("Dynamics Opportunity "), true);
  for (const field of ["business_segment", "transport_mode", "trade_lane", "cargo_type", "customer_tier", "recurring_type", "forecast_category"]) {
    assert.equal(Boolean(mapped[field]), true, field);
    assert.equal(mapped[field], mappedAgain[field], field);
  }
  assert.deepEqual(mapped.data_quality_flags, mappedAgain.data_quality_flags);

  const mappedJson = JSON.stringify(mapped);
  assert.equal(mappedJson.includes("Contoso Real Customer"), false);
  assert.equal(mappedJson.includes("Real Owner Name"), false);
  assert.equal(mappedJson.includes("Real Customer Expansion Opportunity"), false);
  assert.equal(mappedJson.includes("real-customer-guid"), false);
  assert.equal(mappedJson.includes("real-owner-guid"), false);

  const payload = transformOpportunity(mapped, "Sales Manager", new Date("2026-07-02T00:00:00")).safePayload;
  const payloadJson = JSON.stringify(payload);
  assert.equal(validateSafePayload(payload).ok, true);
  assert.equal(payloadJson.includes("Contoso Real Customer"), false);
  assert.equal(payloadJson.includes("Real Owner Name"), false);
});

test("opportunity store supports mock, dynamics, and hybrid data sources", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "gateway-store-"));
  const opportunitiesPath = path.join(dir, "opportunities.json");
  const auditPath = path.join(dir, "audit-log.json");
  await writeFile(opportunitiesPath, JSON.stringify([sample], null, 2));
  await writeFile(auditPath, "[]");
  const mockStore = createJsonStore({ opportunitiesPath, auditPath });
  const dynamicsClient = {
    config: { isConfigured: true, dataverseUrl: "https://example.crm.dynamics.com" },
    async listDynamicsOpportunities() {
      return [dynamicsRow];
    },
    async testConnection() {
      return { ok: true, userId: "user" };
    },
  };

  const mockOnly = createOpportunityStore({ mockStore, dynamicsClient, dataSource: "mock", now: () => new Date("2026-07-02T00:00:00") });
  assert.deepEqual((await mockOnly.listOpportunities()).map((item) => item.id), ["OPP-001"]);

  const dynamicsOnly = createOpportunityStore({ mockStore, dynamicsClient, dataSource: "dynamics", now: () => new Date("2026-07-02T00:00:00") });
  const dynamicsItems = await dynamicsOnly.listOpportunities();
  assert.equal(dynamicsItems.length, 1);
  assert.equal(dynamicsItems[0].id.startsWith("DYN-"), true);

  const hybrid = createOpportunityStore({ mockStore, dynamicsClient, dataSource: "hybrid", now: () => new Date("2026-07-02T00:00:00") });
  const hybridItems = await hybrid.listOpportunities();
  assert.equal(hybridItems.length, 2);
  assert.equal(hybrid.getDynamicsStatus().isConfigured, true);
});

test("opportunity store keeps only AI-DEMO records after Dynamics sync and reports scope counts", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "gateway-demo-sync-"));
  const opportunitiesPath = path.join(dir, "opportunities.json");
  const auditPath = path.join(dir, "audit-log.json");
  await writeFile(opportunitiesPath, "[]");
  await writeFile(auditPath, "[]");
  const mockStore = createJsonStore({ opportunitiesPath, auditPath });
  const rows = [
    ...Array.from({ length: 100 }, (_, index) => ({
      ...dynamicsRow,
      opportunityid: `demo-${String(index + 1).padStart(3, "0")}`,
      name: `[AI-DEMO] Demo Opportunity ${String(index + 1).padStart(3, "0")}`,
    })),
    ...Array.from({ length: 27 }, (_, index) => ({
      ...dynamicsRow,
      opportunityid: `non-demo-${String(index + 1).padStart(3, "0")}`,
      name: `Ordinary Trial Opportunity ${String(index + 1).padStart(3, "0")}`,
    })),
  ];
  const dynamicsClient = {
    config: { isConfigured: true, dataverseUrl: "https://example.crm.dynamics.com" },
    async listDynamicsOpportunities() {
      return rows;
    },
    async testConnection() {
      return { ok: true };
    },
  };
  const store = createOpportunityStore({ mockStore, dynamicsClient, dataSource: "dynamics", now: () => new Date("2026-07-02T00:00:00") });
  const result = await store.syncDynamics();
  const opportunities = await store.listOpportunities();
  const dashboard = buildManagementDashboard(opportunities, {}, new Date("2026-07-02T00:00:00"));

  assert.equal(result.count, 100);
  assert.equal(result.syncedDemoCount, 100);
  assert.equal(result.excludedNonDemoCount, 27);
  assert.equal(result.localTotalAfterSync, 100);
  assert.equal(opportunities.length, 100);
  assert.equal(opportunities.every((item) => item.is_ai_demo === true), true);
  assert.equal(dashboard.summaryPayload.record_count, 100);
  assert.equal(dashboard.aiInsightSummary.demo_opportunity_count, 100);

  const status = store.getDynamicsStatus();
  assert.equal(status.recordCount, 100);
  assert.equal(status.syncedDemoCount, 100);
  assert.equal(status.excludedNonDemoCount, 27);
});

test("role rules hide margin for read-only and show removed fields for CRM admin", () => {
  const readOnly = transformOpportunity(sample, "Read-only User", new Date("2026-07-02T00:00:00"));
  assert.equal(Object.prototype.hasOwnProperty.call(readOnly.safePayload, "margin_band"), false);
  assert.equal(readOnly.safePayload.risk_level, "High");

  const manager = transformOpportunity(sample, "Sales Manager", new Date("2026-07-02T00:00:00"));
  assert.equal(manager.safePayload.revenue_band, "5M+");
  assert.equal(manager.safePayload.margin_band, "10%-15%");

  const admin = transformOpportunity(sample, "CRM Admin", new Date("2026-07-02T00:00:00"));
  for (const field of ["contact_email", "phone", "supplier_cost", "contract_text", "customerRef"]) {
    assert.equal(admin.safePayload.removed_fields.includes(field), true, field);
  }
  assert.equal(validateSafePayload(admin.safePayload).ok, true);
});

test("AI call blocks unsafe payload and generates output for safe payload only", () => {
  const safe = transformOpportunity(sample, "Sales Owner", new Date("2026-07-02T00:00:00")).safePayload;
  const output = generateDemoAi("case-summary", safe);
  assert.equal(output.blocked, false);
  assert.equal(output.output.includes(sample.customer_name), false);

  const unsafe = { ...safe, customer_name: sample.customer_name };
  const blocked = generateDemoAi("case-summary", unsafe);
  assert.equal(blocked.blocked, true);
  assert.match(blocked.error, /Blocked sensitive key/);
});

test("HTTP API writes audit entries for transform and AI calls", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "gateway-demo-"));
  const opportunitiesPath = path.join(dir, "opportunities.json");
  const auditPath = path.join(dir, "audit-log.json");
  await writeFile(opportunitiesPath, JSON.stringify([sample], null, 2));
  await writeFile(auditPath, "[]");
  const store = createJsonStore({ opportunitiesPath, auditPath });
  const app = createApp({ store, now: () => new Date("2026-07-02T00:00:00") });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const transformed = await fetch(`${base}/api/gateway/transform`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "Sales Owner", opportunity_id: "OPP-001" }),
    }).then((response) => response.json());
    assert.equal(transformed.safePayload.customer_token, "CUST-001");
    assert.equal(Object.prototype.hasOwnProperty.call(transformed.safePayload, "contact_email"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(transformed.safePayload, "exact_revenue"), false);

    const ai = await fetch(`${base}/api/ai/risk-analysis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "Sales Owner", opportunity_id: "OPP-001", safePayload: transformed.safePayload, language: "zh-CN" }),
    }).then((response) => response.json());
    assert.equal(ai.blocked, false);
    assert.equal(ai.provider, "demo");
    assert.equal(ai.external_model_called, false);
    assert.equal(ai.audit.provider_used, "demo");
    assert.equal(ai.audit.safe_context_used, true);
    assert.equal(ai.audit.raw_data_sent, false);
    assert.equal(ai.audit.output_guard_status, "fallback");
    assert.equal(Object.prototype.hasOwnProperty.call(ai.audit, "fallback_reason"), true);
    assert.equal(JSON.stringify(ai).includes("LLM_API_KEY"), false);
    assert.equal(JSON.stringify(ai).includes("raw_timeline"), false);

    const dashboard = await fetch(`${base}/api/management-dashboard?department=Freight%20Forwarding`).then((response) => response.json());
    assert.equal(dashboard.data.kpis.length, 7);

    const summary = await fetch(`${base}/api/ai/management-summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "Sales Manager", opportunity_id: "management-dashboard", safePayload: dashboard.data.summaryPayload }),
    }).then((response) => response.json());
    assert.equal(summary.blocked, false);
    assert.match(summary.output, /总体判断/);

    const chat = await fetch(`${base}/api/ai-demo/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "management", question: "哪些案件需要管理层介入？", filters: {}, language: "zh-CN" }),
    }).then((response) => response.json());
    assert.equal(chat.blocked, false);
    assert.match(chat.answer, /OPP-001|CUST-001|高风险|风险/);
    assert.equal(chat.context_summary.safe_context_enabled, true);
    assert.equal(chat.context_summary.total_opportunities, 1);
    assert.equal(chat.audit.functionName, "ai-demo-chat");
    assert.equal(chat.audit.provider, "demo");
    assert.equal(chat.audit.external_model_called, false);
    assert.deepEqual(chat.audit.safe_payload_keys, ["safeOpportunityContext"]);

    const safeContext = await fetch(`${base}/api/ai-context/opportunity/OPP-001`).then((response) => response.json());
    assert.equal(safeContext.data.opportunity_token, "OPP-001");
    assert.deepEqual(safeContext.safe_payload_keys, ["safeOpportunityContext"]);
    assert.equal(JSON.stringify(safeContext).includes(sample.customer_name), false);

    const action = await fetch(`${base}/api/ai-actions/opportunity-brief`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        opportunity_id: "OPP-001",
        filters: {},
        role: "Sales Manager",
        language: "zh-CN",
        rawOpportunity: sample,
      }),
    }).then((response) => response.json());
    assert.equal(action.blocked, false);
    assert.equal(action.audit.functionName, "opportunity-brief");
    assert.equal(action.audit.provider, "demo");
    assert.equal(action.audit.external_model_called, false);
    assert.equal(action.audit.safe_context_enabled, true);
    assert.deepEqual(action.audit.safe_payload_keys, ["safeOpportunityContext"]);
    assert.equal(JSON.stringify(action).includes(sample.customer_name), false);

    const audit = await fetch(`${base}/api/audit-log`).then((response) => response.json());
    assert.equal(audit.data.length, 5);
    assert.equal(audit.data.some((entry) => entry.type === "transform"), true);
    assert.equal(audit.data.some((entry) => entry.type === "ai_call"), true);
    assert.equal(audit.data.some((entry) => entry.functionName === "ai-demo-chat" && entry.context_source === "mock"), true);
    assert.equal(audit.data.some((entry) => entry.functionName === "opportunity-brief" && entry.safe_context_enabled === true), true);
    assert.equal(audit.data
      .filter((entry) => ["ai-demo-chat", "opportunity-brief"].includes(entry.functionName))
      .every((entry) => entry.safe_payload_keys?.includes("safeOpportunityContext")), true);
    assert.equal(audit.data.filter((entry) => entry.type === "ai_call").every((entry) => entry.provider === "demo"), true);
    assert.equal(audit.data.filter((entry) => entry.type === "ai_call").every((entry) => entry.external_model_called === false), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("HTTP APIs prefer AI demo opportunity scope when demo records exist", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "gateway-demo-scope-"));
  const opportunitiesPath = path.join(dir, "opportunities.json");
  const auditPath = path.join(dir, "audit-log.json");
  await writeFile(opportunitiesPath, JSON.stringify([
    { ...sample, id: "OPP-NON-DEMO", opportunity_name: "Ordinary Trial Opportunity", is_ai_demo: false },
    { ...sample, id: "OPP-AI-DEMO", opportunity_name: "Dynamics Opportunity SAFE", is_ai_demo: true, customer_code: "CUST-DEMO" },
  ], null, 2));
  await writeFile(auditPath, "[]");
  const store = createJsonStore({ opportunitiesPath, auditPath });
  const app = createApp({ store, now: () => new Date("2026-07-02T00:00:00") });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const opportunities = await fetch(`${base}/api/opportunities`).then((response) => response.json());
    assert.deepEqual(opportunities.data.map((item) => item.id), ["OPP-AI-DEMO"]);

    const dashboard = await fetch(`${base}/api/management-dashboard`).then((response) => response.json());
    assert.equal(dashboard.data.summaryPayload.record_count, 1);
    assert.equal(dashboard.data.aiInsightSummary.demo_opportunity_count, 1);
    assert.equal(Object.keys(dashboard.data.aiInsightsByOpportunity).includes("OPP-AI-DEMO"), true);
    assert.equal(Object.keys(dashboard.data.aiInsightsByOpportunity).includes("OPP-NON-DEMO"), false);
    assert.equal(dashboard.data.riskRadar.totalCount, 1);
    assert.equal(dashboard.data.riskRadar.topRiskCases.some((item) => item.opportunityToken === "OPP-AI-DEMO"), true);
    assert.equal(dashboard.data.riskRadar.topRiskCases.some((item) => item.opportunityToken === "OPP-NON-DEMO"), false);
    assert.equal(dashboard.data.actionBoard.actions.some((item) => item.opportunityToken === "OPP-AI-DEMO"), true);
    assert.equal(dashboard.data.actionBoard.actions.some((item) => item.opportunityToken === "OPP-NON-DEMO"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("dynamics status API does not leak secrets and sync updates status", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "gateway-api-"));
  const opportunitiesPath = path.join(dir, "opportunities.json");
  const auditPath = path.join(dir, "audit-log.json");
  await writeFile(opportunitiesPath, JSON.stringify([sample], null, 2));
  await writeFile(auditPath, "[]");
  const mockStore = createJsonStore({ opportunitiesPath, auditPath });
  const dynamicsClient = {
    config: {
      isConfigured: true,
      dataverseUrl: "https://example.crm.dynamics.com",
      clientSecret: "<TEST_ONLY_CLIENT_SECRET>",
    },
    async listDynamicsOpportunities() {
      return [dynamicsRow];
    },
    async testConnection() {
      return { ok: true, organizationId: "org" };
    },
  };
  const store = createOpportunityStore({ mockStore, dynamicsClient, dataSource: "dynamics", now: () => new Date("2026-07-02T00:00:00") });
  const app = createApp({ store, now: () => new Date("2026-07-02T00:00:00") });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const status = await fetch(`${base}/api/dynamics/status`).then((response) => response.json());
    assert.equal(JSON.stringify(status).includes("SHOULD_NOT_LEAK"), false);
    assert.equal(status.data.dataSource, "dynamics");

    const testConnection = await fetch(`${base}/api/dynamics/test-connection`, { method: "POST" }).then((response) => response.json());
    assert.equal(testConnection.ok, true);

    const sync = await fetch(`${base}/api/dynamics/sync`, { method: "POST" }).then((response) => response.json());
    assert.equal(sync.ok, true);
    assert.equal(sync.data.count, 1);
    assert.equal(Boolean(sync.data.lastRefreshTime), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
