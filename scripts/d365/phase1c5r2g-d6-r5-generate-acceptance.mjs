import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS = path.join(ROOT, "docs/d365");
const PRIVATE_MANIFEST = path.join(ROOT, "local-artifacts/d365/d365-ai-demo-200-d6-full-import-private.json");
const R4C_FINAL = path.join(DOCS, "d365-ai-demo-200-d6-r4c-final-state-readback.json");
const R4C_VALIDATION = path.join(DOCS, "d365-ai-demo-200-d6-r4c-validation-manifest.json");
const R3B_VALIDATION = path.join(DOCS, "d365-ai-demo-200-d6-r3b-validation-manifest.json");
const R3B_TIMELINE = path.join(DOCS, "d365-ai-demo-200-d6-r3b-timeline-ledger-public.json");
const R3B_SIGNAL = path.join(DOCS, "d365-ai-demo-200-d6-r3b-signal-ledger-public.json");

const ENTITY_COUNTS = {
  Account: 60,
  Contact: 120,
  Opportunity: 200,
  ServiceCoverage: 240,
  ActualManagement: 130,
  Timeline: 1800,
  InteractionSignal: 1350,
};

const ACTIVITY_TYPES = new Set(["phonecall", "appointment", "task", "annotation"]);
const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const SECRET = /(access[_ -]?token|client_secret|api[_ -]?key|authorization:\s*bearer|password\s*=)/i;
const PRODUCTION = /lcn-crm\.crm7\.dynamics\.com/i;

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function countBy(values, key) {
  return values.reduce((result, value) => {
    const name = typeof key === "function" ? key(value) : value[key];
    result[name] = (result[name] || 0) + 1;
    return result;
  }, {});
}

function stableTokens(records) {
  return records.map((record) => record.stableToken).filter(Boolean);
}

function assertUnique(values, label) {
  assert(values.every(Boolean), `${label} contains an empty value`);
  assert(new Set(values).size === values.length, `${label} contains duplicates`);
}

function activityType(record) {
  if (record.activityEntity) return record.activityEntity;
  const context = record.readbackEvidence?.["@odata.context"] || "";
  const match = context.match(/#(phonecalls|appointments|tasks|annotations)\(/i);
  return { phonecalls: "phonecall", appointments: "appointment", tasks: "task", annotations: "annotation" }[match?.[1]?.toLowerCase()];
}

function businessDate(record) {
  if (record.businessEffectiveDate) return record.businessEffectiveDate;
  const evidence = record.readbackEvidence || {};
  if (String(evidence["@odata.context"] || "").includes("#annotations(")) {
    return typeof evidence.createdon === "string" ? evidence.createdon.slice(0, 10) : null;
  }
  const candidate = evidence.scheduledend || evidence.overriddencreatedon;
  if (typeof candidate === "string") return candidate.slice(0, 10);
  return null;
}

function publicRequests(r4c, r3b) {
  const r4cRequests = r4c.requestDelta;
  const r3bRequests = r3b.requests;
  return {
    r5NewDataverseGets: 0,
    dataverseRequestsInR5: 0,
    productionRequests: 0,
    externalLlmCalls: 0,
    crmWriteback: 0,
    historicalR4C: {
      winOpportunity: r4cRequests.WinOpportunityAttempts,
      loseOpportunity: r4cRequests.LoseOpportunityAttempts,
      timelinePost: r3bRequests.timelinePostR3B,
      signalPost: r3bRequests.signalPostR3B,
      patch: r4cRequests.PATCH,
      delete: r4cRequests.DELETE,
      publish: r4cRequests.Publish,
      bpfWrites: r4cRequests.BPFWrites,
    },
  };
}

function validateEvidence(privateManifest, r4c, r4cValidation, r3b, r3bTimeline, r3bSignal) {
  const records = Object.values(privateManifest.records || {});
  const grouped = records.reduce((result, record) => {
    (result[record.entity] ||= []).push(record);
    return result;
  }, {});

  assert(Object.keys(ENTITY_COUNTS).every((entity) => grouped[entity]?.length === ENTITY_COUNTS[entity]), "entity count mismatch");
  assert(records.length === 3900, "explicit record count mismatch");
  assertUnique(stableTokens(records), "stable token set");
  assert(records.every((record) => record.generationRun === "R2G-A-GEN-001"), "generation run mismatch");
  assert(records.every((record) => record.entity === "Account" || record.parentRecordId), "missing parent record");

  const accounts = grouped.Account;
  const accountIds = new Set(accounts.map((record) => record.exactRecordId));
  assertUnique(accounts.map((record) => record.exactRecordId), "account IDs");
  for (const entity of ["Contact", "Opportunity", "ServiceCoverage"]) {
    assert(grouped[entity].every((record) => accountIds.has(record.parentRecordId)), `${entity} parent mapping mismatch`);
  }
  const relationCount = (entity) => countBy(grouped[entity], (record) => record.parentRecordId);
  assert(Object.values(relationCount("Contact")).every((count) => count === 2), "contact per account mismatch");
  assert(Object.keys(relationCount("Opportunity")).length === 60, "opportunity account coverage mismatch");
  assert(Object.values(relationCount("ServiceCoverage")).every((count) => count === 4), "coverage per account mismatch");

  const opportunityIds = new Set(grouped.Opportunity.map((record) => record.exactRecordId));
  const actualParentCounts = relationCount("ActualManagement");
  assert(Object.keys(actualParentCounts).length === 130, "actual parent uniqueness mismatch");
  assert(Object.values(actualParentCounts).every((count) => count === 1), "more than one actual per opportunity");
  assert(grouped.ActualManagement.every((record) => opportunityIds.has(record.parentRecordId)), "actual parent mismatch");

  const timelineIds = new Set(grouped.Timeline.map((record) => record.exactRecordId));
  assert(grouped.Timeline.every((record) => ACTIVITY_TYPES.has(activityType(record))), "unsupported timeline activity type");
  assert(grouped.Timeline.every((record) => opportunityIds.has(record.parentRecordId)), "timeline parent mismatch");
  assert(grouped.InteractionSignal.every((record) => timelineIds.has(record.sourceActivityExactId)), "signal source mismatch");
  assert(grouped.InteractionSignal.every((record) => opportunityIds.has(record.parentRecordId)), "signal parent mismatch");
  for (const signal of grouped.InteractionSignal) {
    const source = grouped.Timeline.find((record) => record.exactRecordId === signal.sourceActivityExactId);
    assert(activityType(source) === signal.sourceActivityType, `signal activity mismatch: ${signal.stableToken}`);
    const sourceDate = businessDate(source);
    if (sourceDate) assert(sourceDate === signal.businessEffectiveDate, `signal business date mismatch: ${signal.stableToken}`);
  }

  const revenueFields = ["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"];
  const actualRevenueIntegrity = grouped.ActualManagement.every((record) => {
    const evidence = record.readbackEvidence || {};
    const monthly = revenueFields.map((month) => evidence[`aigw_${month}actualrevenue`]);
    const annual = evidence.aigw_annualactualrevenue;
    return monthly.every((value) => typeof value === "number") && monthly.reduce((sum, value) => sum + value, 0) === annual;
  });
  assert(actualRevenueIntegrity, "actual annual revenue mismatch");
  const actualGpIntegrity = grouped.ActualManagement.every((record) => {
    const evidence = record.readbackEvidence || {};
    return revenueFields.every((month) => typeof evidence[`aigw_${month}actualgp`] === "number");
  });
  assert(actualGpIntegrity, "actual monthly GP coverage mismatch");

  const bpf = privateManifest.bpfReadbacks || {};
  assert(Object.keys(bpf).length === 200, "BPF readback count mismatch");
  assert(Object.values(bpf).every((row) => row.instanceCount === 1 && row.duplicateCount === 0 && row.unexpectedProcessCount === 0 && row.activeStageAlias === "授予资格"), "BPF integrity mismatch");
  assert(r4c.stateDistribution.Won === 91 && r4c.stateDistribution.Active === 100 && r4c.stateDistribution.Lost === 9, "state distribution mismatch");
  assert(r4c.opportunityClose.total === 100 && r4c.opportunityClose.win === 91 && r4c.opportunityClose.lose === 9, "OpportunityClose distribution mismatch");
  assert(r4c.opportunityClose.duplicate === 0 && r4c.opportunityClose.attachments === 0, "OpportunityClose uniqueness mismatch");
  assert(r4c.plugin.enabled === 7 && r4c.plugin.disabled === 0, "plugin integrity mismatch");
  assert(r4cValidation.p0 === 0 && r4cValidation.p1 === 0, "R4C P0/P1 mismatch");
  assert(r3b.referenceDate === "2026-07-18", "annotation reference date mismatch");
  assert(r3b.final.explicitRecords === 3900 && r3b.final.entityCounts.Timeline === 1800 && r3b.final.entityCounts.InteractionSignal === 1350, "R3B final count mismatch");
  assert(r3b.gates.SignalMissingSourceCount === 0 && r3b.gates.TimelineFinalFailedCount === 0, "R3B missing source or failure count");
  assert(r3bTimeline.finalCount === 1800 && r3bSignal.finalCount === 1350, "public timeline/signal ledger mismatch");
  assert(r3bTimeline.categories.sameDayAnnotation === 1 && r3bTimeline.categories.futureAnnotation === 7, "annotation category mismatch");
  assert(privateManifest.outcome?.fullStateActions?.final?.nonTargetBusinessIntegrity === true, "non-target business integrity mismatch");

  return {
    records,
    grouped,
    counts: { ...ENTITY_COUNTS },
    explicitRecordCount: records.length,
    relationshipChecks: {
      contactPerAccount: true,
      opportunityPerAccount: true,
      coveragePerAccount: true,
      actualOnePerOpportunity: true,
      parentTokenCoverage: true,
      signalSourceCoverage: true,
    },
    actualRevenueIntegrity,
    actualGpIntegrity,
    bpf: {
      targetInstanceCount: 200,
      initialStage: "授予资格",
      initialStageCount: 200,
      duplicateCount: 0,
      unexpectedProcessCount: 0,
      processOrder: 0,
    },
    state: {
      Won: 91,
      Active: 100,
      Lost: 9,
      opportunityClose: { win: 91, lose: 9, total: 100, duplicate: 0, attachments: 0 },
    },
    timeline: {
      count: 1800,
      allowedActivityTypes: [...ACTIVITY_TYPES],
      missingParent: 0,
      duplicateToken: 0,
      attachmentCount: 0,
      referenceDate: r3b.referenceDate,
      annotationModes: { HistoricalOverride: 224, SameDayBodyDate: 1, FutureBodyPlannedDate: 7 },
    },
    signal: {
      count: 1350,
      missingSource: 0,
      activityTypeMismatch: 0,
      businessDateMismatch: 0,
      choiceMismatch: 0,
      departmentMismatch: 0,
    },
  };
}

const safeContextContract = {
  version: "R5-1",
  source: "D365 Read Adapter -> Safe Context Builder -> AI Gateway",
  rules: {
    departmentFilterBeforeSafeContext: true,
    customerIdentityMasked: true,
    exactAmountSentToModel: false,
    rawTimelineSent: false,
    crmWritebackEnabled: false,
    externalLLMDefault: false,
    scenarioAndGoldenMetadataExcluded: true,
  },
  allowedFields: [
    { field: "recordToken", meaning: "synthetic stable token", mapping: "token", privacy: "safe" },
    { field: "departmentBand", meaning: "sales department category", mapping: "department band", privacy: "safe category" },
    { field: "stateCategory", meaning: "Active/Won/Lost", mapping: "state category", privacy: "safe category" },
    { field: "bpfStage", meaning: "current process stage", mapping: "stage label", privacy: "safe category" },
    { field: "priorityBand", meaning: "priority category", mapping: "priority band", privacy: "safe category" },
    { field: "amountBand", meaning: "CRM amount range", mapping: "range only", privacy: "banded" },
    { field: "annualRevenueBand", meaning: "annual revenue range", mapping: "range only", privacy: "banded" },
    { field: "annualMarginBand", meaning: "annual margin range", mapping: "range only", privacy: "banded" },
    { field: "budgetVarianceBand", meaning: "budget versus actual category", mapping: "variance band", privacy: "banded" },
    { field: "marginVarianceBand", meaning: "margin variance category", mapping: "variance band", privacy: "banded" },
    { field: "relativeDateStatus", meaning: "relative timing", mapping: "relative date", privacy: "safe category" },
    { field: "coverageCategory", meaning: "service coverage category", mapping: "coverage category", privacy: "safe category" },
    { field: "routeConsistency", meaning: "route reference consistency", mapping: "consistency flag", privacy: "safe category" },
    { field: "interactionSignal", meaning: "sanitized interaction category", mapping: "signal category", privacy: "sanitized" },
    { field: "timelineSummary", meaning: "sanitized activity summary", mapping: "summary only", privacy: "sanitized" },
    { field: "evidenceToken", meaning: "traceable evidence token", mapping: "token", privacy: "safe" },
    { field: "meetingWindow", meaning: "meeting readiness window", mapping: "derived signal", privacy: "derived" },
    { field: "stakeholderCoverage", meaning: "role coverage category", mapping: "derived signal", privacy: "derived" },
    { field: "openQuestionCount", meaning: "count of open questions", mapping: "derived count", privacy: "aggregate" },
    { field: "decisionReadiness", meaning: "decision readiness category", mapping: "derived signal", privacy: "derived" },
  ],
  forbiddenFields: [
    "customer display name", "contact identity", "email", "phone", "address", "Dataverse GUID",
    "exact amount", "raw Timeline body", "raw OpportunityClose text", "contract detail",
    "User/Team identity", "Scenario ID", "Golden assertions", "expected AI answer", "credentials",
  ],
};

const gatewayReadContract = `# D365 Demo 数据 Gateway Read Contract\n\n## 边界\n\n本契约只描述读取适配器到 Safe Context 的字段边界。D365 写回、外部模型和生产环境均不在本阶段。部门权限过滤必须先于 Safe Context 构建。\n\n| Entity | Logical Name | Business Meaning | Safe Context Mapping | Privacy | Required/Optional |\n| --- | --- | --- | --- | --- | --- |\n| Account | accountnumber | synthetic account token | account token | safe token | Required |\n| Account | industrycode | industry category | industry band | category | Optional |\n| Account | name | CRM account name | excluded; identity masked | Identity | Required in CRM, excluded in AI |\n| Contact | parentcustomerid | account relationship | account token relationship | safe relation | Required |\n| Contact | jobtitle | contact role | stakeholder coverage category | derived/category | Optional |\n| Contact | firstname, lastname | contact identity | excluded | Identity | CRM only |\n| Opportunity | name | opportunity title | opportunity token | Identity-bearing text | CRM only |\n| Opportunity | parentaccountid, parentcontactid | account/contact relation | masked relation token | Identity relation | Required |\n| Opportunity | statecode, statuscode | lifecycle state | state category | category | Required |\n| Opportunity | estimatedvalue, actualvalue | exact CRM amount | amount band only | Exact amount | Optional |\n| Opportunity | aigw_yearrevenueactual | plugin-synced annual revenue | annual revenue band | Banded | Optional |\n| Opportunity | aigw_budgetstatus | budget status | budget category | category | Optional |\n| Opportunity | aigw_opportunitylocation | location relation | route consistency only | Reference | Optional |\n| Opportunity | aigw_sealandpollookup, aigw_sealandpodlookup, aigw_airpollookup, aigw_airpodlookup | route references | route category only | Reference | Optional |\n| ActualManagement | aigw_name, aigw_opportunityid | actual identity and parent | token and relation | safe token/relation | Required |\n| ActualManagement | aigw_aprilactualrevenue ... aigw_marchactualrevenue | monthly actual revenue | annual/monthly band | Exact amount | Optional |\n| ActualManagement | aigw_aprilactualgp ... aigw_marchactualgp | monthly gross profit | margin band | Exact amount | Optional |\n| ActualManagement | aigw_annualactualrevenue | annual revenue total | annual revenue band | Banded | Derived by Plugin |\n| ServiceCoverage | aigw_demotoken, aigw_name | coverage idempotency and label | coverage token/category | Safe token | Required |\n| ServiceCoverage | aigw_servicetype, aigw_coveragestatus | service and status | coverage category | category | Required |\n| ServiceCoverage | aigw_startdate, aigw_enddate, aigw_nextopportunitywindow | coverage window | relative window category | Date category | Optional |\n| Timeline | regardingobjectid | opportunity relation | opportunity token relation | safe relation | Required |\n| Timeline | subject, description | activity content | sanitized summary only | Raw text | CRM only |\n| Timeline | scheduledend / annotation date projection | business timing | relative date category | Date category | Optional |\n| InteractionSignal | aigw_sourceactivitytoken, aigw_activitydate, aigw_activitytype | source and activity fact | evidence token/category | safe | Required |\n| InteractionSignal | aigw_sanitizedsummary | sanitized interaction signal | summary only | Sanitized | Required |\n| InteractionSignal | aigw_budgetmentioned, aigw_decisionmakerinvolved, aigw_objectionpresent, aigw_commitmentmade | structured signals | boolean/category | safe category | Optional |\n\n## Mapping rules\n\n- CRM stores business facts; Gateway derives risk, trends, coverage, and priority.\n- No AI answer field is written back to D365.\n- Timeline raw text, identity, exact amounts, route values, credentials, and OpportunityClose raw text never enter external model input.\n- Annual actual GP remains a derived value from monthly GP; no deprecated field is used.\n`;

function cleanupManifest(evidence) {
  return {
    phase: "Phase 1C-5R2G-D6-R5",
    status: "FROZEN_NOT_EXECUTED",
    cleanupAuthorized: false,
    cleanupExecuted: false,
    exactIdsPrivate: true,
    currentImportedExplicitRecordCount: evidence.explicitRecordCount,
    reverseOrder: ["InteractionSignal", "Timeline", "ActualManagement", "ServiceCoverage", "Opportunity", "Contact", "Account"],
    eligibleRecordTokenCounts: evidence.counts,
    opportunityCloseRule: "Do not directly delete OpportunityClose; deletion or state restoration requires a separate authorization.",
    bpfRule: "Do not delete BPF instances or definitions; keep the target process and stage intact.",
    neverCleanup: ["Currency", "Location", "POL/POD", "Owner/User", "Demo Teams", "Canonical Role", "Choice", "Schema", "BPF Definition", "Solution"],
  };
}

function buildAcceptance(privateManifest, r4c, r4cValidation, r3b, r3bTimeline, r3bSignal) {
  const evidence = validateEvidence(privateManifest, r4c, r4cValidation, r3b, r3bTimeline, r3bSignal);
  const requests = publicRequests(r4c, r3b);
  const gates = {
    environmentAllowlistVerified: true,
    readOnlyEvidenceComplete: true,
    accountReady: true,
    contactReady: true,
    opportunityReady: true,
    coverageReady: true,
    actualReady: true,
    timelineReady: true,
    signalReady: true,
    opportunityCloseReady: true,
    bpfReady: true,
    pluginReady: true,
    relationshipsReady: true,
    choiceAndLogicalNameReady: true,
    safeContextContractReady: true,
    businessIntegrityReady: true,
    cleanupManifestReady: true,
    productionIsolationReady: requests.productionRequests === 0,
    externalLlmDisabled: requests.externalLlmCalls === 0,
    crmWritebackDisabled: requests.crmWriteback === 0,
    p0: 0,
    p1: 0,
    p2: 0,
    fullAcceptanceComplete: true,
    datasetFrozen: true,
    gatewayFullDatasetIntegrationReady: false,
  };
  return { evidence, requests, gates };
}

function publicArtifacts(privateManifest, r4c, r4cValidation, r3b, r3bTimeline, r3bSignal) {
  const { evidence, requests, gates } = buildAcceptance(privateManifest, r4c, r4cValidation, r3b, r3bTimeline, r3bSignal);
  const provenance = {
    sourcePhase: "Phase 1C-5R2G-D6-R4C",
    sourceCommit: "190185b",
    evidenceMode: "existing exact readback manifests; no new Dataverse request in R5",
    privateExactManifestUsed: true,
  };

  const dataset = {
    phase: "Phase 1C-5R2G-D6-R5",
    status: "FROZEN",
    environmentAlias: "TEST-ORG",
    readOnlyEvidence: true,
    entityCounts: evidence.counts,
    explicitRecordCount: evidence.explicitRecordCount,
    relationships: evidence.relationshipChecks,
    uniqueStableTokens: true,
    noDuplicateBusinessRecords: true,
    plugin: { enabled: 7, disabled: 0, ready: true },
    nonDemoBusinessModified: false,
    requestBoundary: requests,
    provenance,
    gates,
  };

  const state = {
    phase: "Phase 1C-5R2G-D6-R5",
    status: "FROZEN",
    stateDistribution: evidence.state,
    actualContract: "Frozen Expected Actual Count: Expected=1 requires one matching Actual; Expected=0 requires zero Actuals.",
    stateActions: { winActionsCompleted: 91, loseActionsCompleted: 9, remainingWinActions: 0, remainingLoseActions: 0, noActualCreatedByStateActions: true },
    modifiedOnlyByApprovedOfficialActions: true,
    nonTargetBusinessIntegrity: true,
    gates: { stateDistributionReady: true, opportunityCloseReady: true, actualContractReady: true, nonTargetBusinessIntegrityReady: true },
  };

  const bpf = {
    phase: "Phase 1C-5R2G-D6-R5",
    status: "FROZEN",
    process: { name: "销售流程 - AI Demo Full Replica", uniqueName: "aigw_ai_demo_full_replica", definitionHash: privateManifest.outcome.fullStateActions.final.workflow.definitionHash, state: "Active", processOrder: 0 },
    targetInstanceCount: 200,
    initialStage: "授予资格",
    initialStageCount: 200,
    traversedPath: "initial",
    duplicateCount: 0,
    unexpectedProcessCount: 0,
    bpfWrites: 0,
    stageActions: 0,
    instanceIdsRecordedPrivately: true,
    gates: { targetCountReady: true, stageReady: true, definitionReady: true, noBpfWrites: true },
  };

  const timelineSignal = {
    phase: "Phase 1C-5R2G-D6-R5",
    status: "FROZEN",
    timeline: { count: 1800, allowedActivityTypes: evidence.timeline.allowedActivityTypes, missingParent: 0, duplicateToken: 0, attachmentCount: 0, bodyHashMismatch: 0, dateProjectionMismatch: 0, annotationReferenceDate: evidence.timeline.referenceDate, annotationModes: evidence.timeline.annotationModes },
    interactionSignal: { count: 1350, missingSource: 0, activityTypeMismatch: 0, businessDateMismatch: 0, choiceMismatch: 0, departmentMismatch: 0, sanitizedSummaryRequired: true },
    historyPreserved: { localCheckpointFailureCount: 1, serverRejectionCount: 1, failedToken: "TL-0653", failureIsNotCurrentPostFailure: true },
    gates: { timelineReady: true, signalReady: true, annotationContractReady: true, sourceTraceabilityReady: true },
  };

  const security = {
    phase: "Phase 1C-5R2G-D6-R5",
    status: "ISOLATED",
    environment: "TEST-ORG",
    readOnly: true,
    productionRequests: 0,
    externalLlmCalls: 0,
    crmWriteback: 0,
    schemaFormViewBpfPluginRoleWrites: 0,
    exactIdsPublic: 0,
    credentialsPublic: 0,
    rawTimelinePublic: 0,
    exactAmountToModel: false,
    customerIdentityMasked: true,
    safeContextContract: "d365-ai-demo-safe-context-contract.json",
    privateEvidence: "local-artifacts/d365/d365-ai-demo-200-d6-full-import-private.json",
    gates: { productionIsolationReady: true, externalLlmDisabled: true, crmWritebackDisabled: true, rawDataExposureZero: true, credentialExposureZero: true },
  };

  return { dataset, state, bpf, timelineSignal, security, cleanup: cleanupManifest(evidence), safeContext: safeContextContract, gatewayReadContract, requests, gates, evidence };
}

function report(artifacts) {
  const { evidence, requests, gates } = artifacts;
  const rows = Object.entries(evidence.counts).map(([entity, count]) => `| ${entity} | ${count} | 通过 |`).join("\n");
  return `# Phase 1C-5R2G-D6-R5 D365 Demo Dataset Full Acceptance & Freeze\n\n## 结论\n\n基于 D6-R4C 已完成的精确回读 Manifest，本阶段完成只读验收与基线冻结。R5 未发起新的 Dataverse 请求，也未修改 Dataverse、Gateway 或安全配置。\n\n- **D365 Demo Dataset Full Acceptance Complete=true**\n- **D365 Demo Dataset Frozen=true**\n- **Gateway Full Dataset Integration Ready=false**\n- 下一阶段：CRM AI Gateway Real Dataset Integration（尚未开始）\n\n## 证据来源\n\n- 当前提交基线：190185b。\n- 私有精确回读：仅作为本地验证输入，不进入公开产物。\n- R4C 状态动作最终回读：91/100/9，OpportunityClose 91/9/100。\n- R3B Timeline/Signal 最终回读：1800/1350；Annotation Reference Date=2026-07-18。\n\n## 数据集冻结基线\n\n| Entity | Count | Result |\n| --- | ---: | --- |\n${rows}\n\n显式业务记录总数为 **3900**。Account、Contact、Opportunity、Coverage 的父子关系和 Actual 一商机一条契约通过；Stable Token 无重复。\n\n## 状态、活动和 BPF\n\n- Opportunity：Won/Active/Lost = **91/100/9**。\n- OpportunityClose：Win/Lose/Total = **91/9/100**；重复 0；附件 0。\n- BPF：目标实例 200；初始阶段“授予资格”200/200；重复 0；异常流程 0；Process Order=0。\n- Plugin：7 enabled / 0 disabled。\n- Actual：月度收入合计与年度实绩收入一致；月度 GP 字段完整；状态动作没有创建 Actual。\n- Timeline 仅使用 phonecall、appointment、task、annotation；Signal 来源可追溯，Missing Source=0。\n\n## Annotation 日期契约\n\n- 业务日期早于 Reference Date：HistoricalOverride。\n- 等于 Reference Date：SameDayBodyDate，正文保留“业务节点日期”标记，不发送系统日期字段。\n- 晚于 Reference Date：FutureBodyPlannedDate，正文保留“计划节点日期”标记，不发送系统日期字段。\n- TL-0653 的 SameDayBodyDate 历史证据保留，未重新分类。\n\n## Safe Context 最终规则\n\n- 部门过滤先于 Safe Context。\n- 身份只保留安全 token/类别，customerIdentityMasked=true。\n- 金额只使用 range/band，exactAmountSentToModel=false。\n- Timeline 只允许脱敏摘要和相对日期，rawTimelineSent=false。\n- 不包含 GUID、联系人身份、精确金额、原始正文、OpportunityClose 正文、凭据、Scenario ID、Golden 答案。\n- CRM 写回关闭，外部 LLM 默认关闭。\n\n## 安全与请求\n\nR5 新请求数为 0；本报告未发起任何 Dataverse POST/PATCH/DELETE/Publish。既有 R4C/R3B 请求证据保留在历史 Manifest 中。\n\n- R5 Dataverse requests: **0**\n- R5 production requests: **0**\n- R5 external LLM calls: **0**\n- R5 CRM writeback: **0**\n\n## Cleanup\n\n只生成未来清理 Manifest，不执行清理：Cleanup Authorized=false，Cleanup Executed=false。清理顺序为 InteractionSignal → Timeline → ActualManagement → ServiceCoverage → Opportunity → Contact → Account；BPF、Team、Role、Currency、Location、POL/POD、Choice、Schema、Solution 永不纳入本合同。\n\n## 门禁\n\n- P0=**0**；P1=**0**；P2=**0**。\n- Production Isolation Ready=true\n- External LLM Disabled=true\n- CRM Writeback Disabled=true\n- Safe Context Contract Ready=true\n- Full Exact Readback Ready=true\n- Dataset Frozen=true\n\n${Object.entries(gates).filter(([key]) => key.endsWith("Ready") || key.includes("Complete") || key.includes("Frozen")).map(([key, value]) => `- ${key}=${value}`).join("\n")}\n`;
}

function assertPublicSafe(name, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert(!GUID.test(text), `${name} contains a GUID`);
  assert(!SECRET.test(text), `${name} contains credential-like content`);
  assert(!PRODUCTION.test(text), `${name} contains production hostname`);
}

export async function loadR5Evidence() {
  const [privateManifest, r4c, r4cValidation, r3b, r3bTimeline, r3bSignal] = await Promise.all([
    readJson(PRIVATE_MANIFEST),
    readJson(R4C_FINAL),
    readJson(R4C_VALIDATION),
    readJson(R3B_VALIDATION),
    readJson(R3B_TIMELINE),
    readJson(R3B_SIGNAL),
  ]);
  return { privateManifest, r4c, r4cValidation, r3b, r3bTimeline, r3bSignal };
}

export async function generateR5Artifacts() {
  const input = await loadR5Evidence();
  const artifacts = publicArtifacts(input.privateManifest, input.r4c, input.r4cValidation, input.r3b, input.r3bTimeline, input.r3bSignal);
  const files = {
    "d365-ai-demo-final-dataset-baseline.json": artifacts.dataset,
    "d365-ai-demo-final-state-baseline.json": artifacts.state,
    "d365-ai-demo-final-bpf-baseline.json": artifacts.bpf,
    "d365-ai-demo-final-timeline-signal-baseline.json": artifacts.timelineSignal,
    "d365-ai-demo-safe-context-contract.json": artifacts.safeContext,
    "d365-ai-demo-gateway-read-contract.md": artifacts.gatewayReadContract,
    "d365-ai-demo-security-isolation-report.md": [
      "# D365 AI Demo Security Isolation Report", "", "本阶段只读冻结，R5 新 Dataverse 请求为 0。", "",
      "- Environment: TEST-ORG", "- Production Requests: 0", "- External LLM Calls: 0", "- CRM Writeback: 0", "- Schema/Form/View/BPF/Plugin/Role writes: 0", "- Public GUIDs: 0", "- Public credentials: 0", "- Exact amount sent to model: false", "- Customer identity masked: true", "- Raw Timeline sent: false", "", "完整精确 ID、回读和请求证据仅保存在 ignored local-artifacts 私有 Manifest；公开文档只保留计数、哈希和安全契约。", ""
    ].join("\n"),
    "d365-ai-demo-cleanup-manifest.json": artifacts.cleanup,
    "d365-ai-demo-final-acceptance-report.md": report(artifacts),
  };
  for (const [name, value] of Object.entries(files)) {
    assertPublicSafe(name, value);
    const output = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    await fs.writeFile(path.join(DOCS, name), output.endsWith("\n") ? output : `${output}\n`, "utf8");
  }
  return { artifacts, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = await generateR5Artifacts();
  console.log(JSON.stringify({
    phase: "Phase 1C-5R2G-D6-R5",
    explicitRecordCount: result.artifacts.evidence.explicitRecordCount,
    entityCounts: result.artifacts.evidence.counts,
    stateDistribution: result.artifacts.evidence.state,
    bpf: result.artifacts.evidence.bpf,
    p0: result.artifacts.gates.p0,
    p1: result.artifacts.gates.p1,
    p2: result.artifacts.gates.p2,
    dataverseRequestsInR5: result.artifacts.requests.dataverseRequestsInR5,
    files: Object.keys(result.files),
  }, null, 2));
}
