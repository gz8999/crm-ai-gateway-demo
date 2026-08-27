import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, runDataverseCli } from "./lib/environment-safety.mjs";
import { buildLookupBind, resolveActualManagementBindings } from "./lib/dataverse-metadata-resolvers.mjs";
import { resolveLiteralMarkerRecords } from "./lib/literal-marker-resolver.mjs";
import { MONTH_REVENUE_FIELDS, calculateAnnualRevenue, decimalEqual } from "./lib/actual-total-calculation.mjs";

const EXPECTED_HOSTNAME = "org91f5f65f.crm5.dynamics.com";
const AUTH = "CONFIRM_D365_TEST_WRITE_PHASE_1C_5R2D_4_GROUP2";
const MARKER = "[AI-DEMO-R2D4]";
const AUDIT_PATH = "local-artifacts/d365/plugin-registration/phase1c5r2d4-group2-child-total.json";
const STEP_IDS = {
  preValidationCreate: "28a481a1-807d-f111-ab0e-6045bd5b2c06",
  preValidationUpdate: "3c48aba8-807d-f111-ab0e-6045bd5b2c06",
  preOperationCreate: "3f48aba8-807d-f111-ab0e-6045bd5b2c06",
  preOperationUpdate: "4248aba8-807d-f111-ab0e-6045bd5b2c06",
  postOperationCreate: "7f4ad1ae-807d-f111-ab0e-6045bd5b2c06",
  postOperationUpdate: "824ad1ae-807d-f111-ab0e-6045bd5b2c06",
  postOperationDelete: "854ad1ae-807d-f111-ab0e-6045bd5b2c06",
};
const GROUP1 = [STEP_IDS.preValidationCreate, STEP_IDS.preValidationUpdate];
const GROUP2 = [STEP_IDS.preOperationCreate, STEP_IDS.preOperationUpdate];
const GROUP3 = [STEP_IDS.postOperationCreate, STEP_IDS.postOperationUpdate, STEP_IDS.postOperationDelete];
const ALL_STEPS = [...GROUP1, ...GROUP2, ...GROUP3];
const FILTERING_ATTRIBUTES = [...MONTH_REVENUE_FIELDS, "aigw_opportunityid", "transactioncurrencyid"];
const PARENT_SELECT = "aigw_yearrevenueactual,aigw_yearrevenueactual_base,aigw_yearrevenueactualcny";
const MONEY_METADATA_SELECT = "MetadataId,LogicalName,SchemaName,AttributeType,Precision,PrecisionSource,MinValue,MaxValue,IsValidForCreate,IsValidForUpdate,IsValidForRead,RequiredLevel";

const stamp = () => new Date().toISOString();
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function responseId(response, entityLogicalName) {
  const direct = response.body?.[`${entityLogicalName}id`];
  if (direct) return direct;
  const header = response.headers?.get?.("odata-entityid") || response.headers?.get?.("location") || "";
  const match = /\(([0-9a-f-]{36})\)/i.exec(header);
  if (match) return match[1];
  throw new Error(`Dataverse create response did not contain ${entityLogicalName} id.`);
}

function normalizeFilteringAttributes(value) {
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean).sort();
}

function sameStringList(left, right) {
  return JSON.stringify(normalizeFilteringAttributes(left)) === JSON.stringify(normalizeFilteringAttributes(right));
}

function classifyError(error) {
  const message = String(error?.body?.error?.message || error?.message || "").replaceAll(/https?:\/\/[^\s]+/g, "[url]");
  const layer = error?.status === 401 || error?.status === 403
    ? "Permission error"
    : /undeclared property|odata|payload|property .* not found/i.test(message)
      ? "OData schema/payload error"
      : /precision|minvalue|maxvalue|decimal|money/i.test(message)
        ? "Dataverse metadata/precision limitation"
        : error?.status
          ? "Plugin or Dataverse validation"
          : "Network/read-after-write delay";
  return { httpStatus: error?.status || null, errorCode: error?.body?.error?.code || null, sanitizedMessage: message, layer };
}

function moneyValue(value) {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function sameMoney(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) return left == null && right == null;
  return decimalEqual(left, right, 2);
}

function assertParentUnchanged(before, after) {
  for (const field of ["aigw_yearrevenueactual", "aigw_yearrevenueactual_base", "aigw_yearrevenueactualcny"]) {
    if (!sameMoney(before[field], after[field])) throw new Error(`Parent field changed unexpectedly: ${field}.`);
  }
}

function assertActualPayload(payload, bindings) {
  const allowed = new Set(["aigw_name", ...MONTH_REVENUE_FIELDS, `${bindings.actualManagement.opportunityLookup.navigationPropertyName}@odata.bind`, `${bindings.actualManagement.transactionCurrencyLookup.navigationPropertyName}@odata.bind`]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) throw new Error("Synthetic Actual payload contains an unauthorized field.");
  if (Object.keys(payload).includes("aigw_annualactualrevenue") || Object.keys(payload).some((key) => key.endsWith("_base"))) throw new Error("Synthetic payload must not write annual or base fields.");
  if (Object.prototype.hasOwnProperty.call(payload, "aigw_opportunityid@odata.bind")) throw new Error("Synthetic payload contains the old logical-name lookup bind.");
}

async function readWithRetry(get, uri, predicate, label) {
  let last;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const row = await get(uri);
      if (!predicate || predicate(row)) return row;
      last = new Error(`${label} read-after-write predicate did not pass.`);
    } catch (error) {
      last = error;
    }
    await sleep(500);
  }
  throw last || new Error(`${label} was not readable after write.`);
}

export async function main() {
  const apply = process.argv.includes("--apply");
  const gate = apply
    ? assertDataverseScriptGate({ mode: "write-capable" })
    : assertDataverseScriptGate({ mode: "read-only" });
  if (apply && !process.argv.includes(AUTH)) throw new Error("Phase-specific Group 2 authorization phrase is required.");
  const URL = gate.dataverseUrl;
  if (new globalThis.URL(URL).hostname !== EXPECTED_HOSTNAME) throw new Error("Only the designated test Dataverse environment is allowed.");
  if (String(process.env.AI_PROVIDER || "demo") !== "demo" || String(process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("AI safety gate failed.");

  const root = process.cwd();
  const file = path.join(root, AUDIT_PATH);
  const audit = {
    phase: "1C-5R2D-4",
    dryRun: !apply,
    startedAt: stamp(),
    environment: { hostname: new globalThis.URL(URL).hostname, organization: "org91f5f65f", productionRequests: 0 },
    metadata: {},
    attributes: {},
    steps: { before: [], enablement: [], afterEnablement: [], after: [] },
    synthetic: { opportunities: [], actuals: [] },
    tests: [],
    cleanup: { deletedActualIds: [], deletedOpportunityIds: [], errors: [], remainingOpportunities: null, remainingActuals: null },
    requestCounts: { GET: 0, POST: 0, PATCH: 0, DELETE: 0 },
    publishActions: 0,
    writesExecuted: false,
    finalDecision: "Blocked",
  };
  const writeAudit = async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(audit, null, 2));
  };

  const client = createDynamicsClient();
  const get = async (uri) => { audit.requestCounts.GET += 1; return (await client.dataverseGet(uri)).body; };
  const post = async (uri, body) => { audit.requestCounts.POST += 1; audit.writesExecuted = true; return client.dataversePost(uri, body); };
  const patch = async (uri, body) => { audit.requestCounts.PATCH += 1; audit.writesExecuted = true; return client.dataversePatch(uri, body); };
  const remove = async (uri) => { audit.requestCounts.DELETE += 1; audit.writesExecuted = true; return client.dataverseDelete(uri); };

  const step = async (id) => {
    const row = await get(`/api/data/v9.2/sdkmessageprocessingsteps(${id})?$select=sdkmessageprocessingstepid,name,statecode,statuscode,stage,mode,rank,filteringattributes,_sdkmessageid_value,_sdkmessagefilterid_value`);
    const [message, filter] = await Promise.all([
      row._sdkmessageid_value ? get(`/api/data/v9.2/sdkmessages(${row._sdkmessageid_value})?$select=name`) : {},
      row._sdkmessagefilterid_value ? get(`/api/data/v9.2/sdkmessagefilters(${row._sdkmessagefilterid_value})?$select=primaryobjecttypecode`) : {},
    ]);
    return { ...row, messageName: message.name || null, primaryObjectTypeCode: filter.primaryobjecttypecode || null };
  };
  const setStepState = async (id, statecode) => {
    await patch(`/api/data/v9.2/sdkmessageprocessingsteps(${id})`, { statecode });
    return step(id);
  };

  let bindings;
  let createdActualIds = [];
  let createdOpportunityIds = [];
  let group2Attempted = false;
  try {
    bindings = await resolveActualManagementBindings(get);
    audit.metadata.bindings = {
      opportunityLookupLogicalName: bindings.actualManagement.opportunityLookup.lookupAttributeLogicalName,
      opportunityNavigationProperty: bindings.actualManagement.opportunityLookup.navigationPropertyName,
      opportunityEntitySetName: bindings.opportunity.entitySetName,
      actualManagementEntitySetName: bindings.actualManagement.entitySetName,
      actualCurrencyNavigationProperty: bindings.actualManagement.transactionCurrencyLookup.navigationPropertyName,
      opportunityCurrencyNavigationProperty: bindings.opportunity.transactionCurrencyLookup.navigationPropertyName,
    };
    if (bindings.opportunity.entitySetName !== "opportunities" || bindings.actualManagement.entitySetName !== "aigw_actualmanagements" || bindings.transactionCurrency.entitySetName !== "transactioncurrencies") throw new Error("Metadata EntitySet safety assertion failed.");

    const [cnyRows, jpyRows, orgRows, markerOppsRaw, markerActualsRaw, assembliesRaw, ...attributeRows] = await Promise.all([
      get("/api/data/v9.2/transactioncurrencies?$select=transactioncurrencyid,isocurrencycode,statecode&$filter=isocurrencycode eq 'CNY'"),
      get("/api/data/v9.2/transactioncurrencies?$select=transactioncurrencyid,isocurrencycode,statecode,currencyprecision,exchangerate&$filter=isocurrencycode eq 'JPY'"),
      get("/api/data/v9.2/organizations?$select=_basecurrencyid_value"),
      get(`/api/data/v9.2/opportunities?$select=opportunityid,name&$filter=startswith(name,'${MARKER}')`),
      get(`/api/data/v9.2/aigw_actualmanagements?$select=aigw_actualmanagementid,aigw_name&$filter=startswith(aigw_name,'${MARKER}')`),
      get("/api/data/v9.2/pluginassemblies?$select=pluginassemblyid,name,publickeytoken&$filter=name eq 'CrmAiGateway.ActualTotals.Plugin'"),
      ...[...MONTH_REVENUE_FIELDS, "aigw_annualactualrevenue"].map((field) => get(`/api/data/v9.2/EntityDefinitions(LogicalName='aigw_actualmanagement')/Attributes(LogicalName='${field}')/Microsoft.Dynamics.CRM.MoneyAttributeMetadata?$select=${MONEY_METADATA_SELECT}`)),
    ]);

    const cny = cnyRows.value || [];
    const jpy = jpyRows.value || [];
    const markerOppScan = resolveLiteralMarkerRecords(markerOppsRaw.value || [], MARKER);
    const markerActualScan = resolveLiteralMarkerRecords((markerActualsRaw.value || []).map((row) => ({ ...row, name: row.aigw_name })), MARKER);
    const assemblies = assembliesRaw.value || [];
    const attributeMetadata = Object.fromEntries(attributeRows.map((row) => [row.LogicalName, row]));
    audit.attributes = attributeMetadata;
    audit.metadata.currencies = {
      cnyCount: cny.length,
      jpyCount: jpy.length,
      cnyBaseMatches: cny.length === 1 && String(orgRows.value?.[0]?._basecurrencyid_value || "").toLowerCase() === String(cny[0]?.transactioncurrencyid || "").toLowerCase(),
      jpyActive: jpy.length === 1 && jpy[0].statecode === 0,
      jpyPrecision: jpy[0]?.currencyprecision ?? null,
      jpyExchangeRate: jpy[0]?.exchangerate ?? null,
    };
    audit.metadata.markerServerCandidateCounts = { opportunities: markerOppsRaw.value?.length || 0, actuals: markerActualsRaw.value?.length || 0 };
    audit.metadata.markerExactCounts = { opportunities: markerOppScan.literalMatchCount, actuals: markerActualScan.literalMatchCount };
    audit.metadata.markerRejectedCandidateCounts = { opportunities: markerOppScan.rejectedCandidateCount, actuals: markerActualScan.rejectedCandidateCount };
    audit.metadata.markerGatePassed = markerOppScan.literalMatchCount === 0 && markerActualScan.literalMatchCount === 0;
    audit.metadata.componentCounts = { assembly: assemblies.length, pluginTypes: 0, steps: 0, images: 0 };

    if (assemblies.length !== 1) throw new Error(`Preflight blocked: expected one matching assembly, found ${assemblies.length}.`);
    const typeRows = (await get(`/api/data/v9.2/plugintypes?$select=plugintypeid,typename&$filter=_pluginassemblyid_value eq ${assemblies[0].pluginassemblyid}`)).value || [];
    const stepRows = [];
    for (const type of typeRows) stepRows.push(...((await get(`/api/data/v9.2/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,statecode,stage,mode,rank,_plugintypeid_value&$filter=_plugintypeid_value eq ${type.plugintypeid}`)).value || []));
    const imageFilter = ALL_STEPS.map((id) => `_sdkmessageprocessingstepid_value eq ${id}`).join(" or ");
    const imageRows = await get(`/api/data/v9.2/sdkmessageprocessingstepimages?$select=sdkmessageprocessingstepimageid,_sdkmessageprocessingstepid_value&$filter=${imageFilter}`);
    audit.metadata.componentCounts = { assembly: assemblies.length, pluginTypes: typeRows.length, steps: stepRows.length, images: (imageRows.value || []).length };
    audit.steps.before = await Promise.all(ALL_STEPS.map((id) => step(id)));
    const byId = new Map(audit.steps.before.map((row) => [row.sdkmessageprocessingstepid, row]));
    const expectedStep = (id, messageName, stage, rank, filtering) => {
      const row = byId.get(id);
      if (!row || row.name !== `Actual Totals - ${messageName}` || row.messageName !== messageName.split(" - ").at(-1) || row.primaryObjectTypeCode !== "aigw_actualmanagement" || row.stage !== stage || row.mode !== 0 || row.rank !== rank || !sameStringList(row.filteringattributes, filtering)) return false;
      return true;
    };
    const stepContracts = [
      [STEP_IDS.preValidationCreate, "PreValidation - Create", 10, 10, []],
      [STEP_IDS.preValidationUpdate, "PreValidation - Update", 10, 10, FILTERING_ATTRIBUTES],
      [STEP_IDS.preOperationCreate, "PreOperation - Create", 20, 20, []],
      [STEP_IDS.preOperationUpdate, "PreOperation - Update", 20, 20, FILTERING_ATTRIBUTES],
      [STEP_IDS.postOperationCreate, "PostOperation - Create", 40, 30, []],
      [STEP_IDS.postOperationUpdate, "PostOperation - Update", 40, 30, FILTERING_ATTRIBUTES],
      [STEP_IDS.postOperationDelete, "PostOperation - Delete", 40, 30, []],
    ];
    const contractsValid = stepContracts.every(([id, label, stage, rank, filtering]) => expectedStep(id, label, stage, rank, filtering));
    const allDisabled = audit.steps.before.every((row) => row.statecode === 1);
    const group1Enabled = GROUP1.every((id) => byId.get(id)?.statecode === 0);
    const group2Disabled = GROUP2.every((id) => byId.get(id)?.statecode === 1);
    const group3Disabled = GROUP3.every((id) => byId.get(id)?.statecode === 1);
    const stateGate = group1Enabled && group2Disabled && group3Disabled && audit.steps.before.filter((row) => row.statecode === 0).length === 2;
    const attributesValid = [...MONTH_REVENUE_FIELDS, "aigw_annualactualrevenue"].every((field) => attributeMetadata[field]?.AttributeType === "Money" && attributeMetadata[field]?.IsValidForRead === true);
    const preflightReady = audit.metadata.currencies.cnyBaseMatches && audit.metadata.currencies.jpyActive && audit.metadata.currencies.jpyPrecision === 0 && Number(audit.metadata.currencies.jpyExchangeRate) === 20 && audit.metadata.markerGatePassed && contractsValid && stateGate && !allDisabled && audit.metadata.componentCounts.assembly === 1 && audit.metadata.componentCounts.pluginTypes === 3 && audit.metadata.componentCounts.steps === 7 && audit.metadata.componentCounts.images === 6 && attributesValid;
    audit.metadata.preflight = { contractsValid, stateGate, allDisabled, group1Enabled, group2Disabled, group3Disabled, attributesValid, ready: preflightReady };
    if (!preflightReady) throw new Error(`Preflight blocked: ${JSON.stringify(audit.metadata.preflight)}`);

    const cnyId = cny[0].transactioncurrencyid;
    const jpyId = jpy[0].transactioncurrencyid;
    const moneyPrecision = Number(attributeMetadata.aigw_annualactualrevenue.Precision ?? 2);
    audit.metadata.moneyPrecision = moneyPrecision;
    audit.metadata.monthlyPrecision = Object.fromEntries(MONTH_REVENUE_FIELDS.map((field) => [field, Number(attributeMetadata[field].Precision ?? 2)]));
    audit.metadata.ranges = Object.fromEntries([...MONTH_REVENUE_FIELDS, "aigw_annualactualrevenue"].map((field) => [field, { min: attributeMetadata[field].MinValue, max: attributeMetadata[field].MaxValue }]));
    if (!apply) {
      audit.finalDecision = "Group 2 dry-run Ready=true";
      audit.completedAt = stamp();
      await writeAudit();
      console.log(JSON.stringify({ audit: file, preflight: audit.metadata.preflight, marker: audit.metadata.markerServerCandidateCounts, exactMarker: audit.metadata.markerExactCounts, plannedStepEnablements: 2, plannedGroup3Enablements: 0, plannedPublishActions: 0, writesExecuted: false, finalDecision: audit.finalDecision }, null, 2));
      return;
    }

    const setEnabled = async (id) => {
      const row = await setStepState(id, 0);
      audit.steps.enablement.push(row);
      if (row.statecode !== 0) throw new Error(`Group 2 step ${id} did not become enabled.`);
    };
    group2Attempted = true;
    await setEnabled(STEP_IDS.preOperationCreate);
    await setEnabled(STEP_IDS.preOperationUpdate);
    audit.steps.afterEnablement = await Promise.all(ALL_STEPS.map((id) => step(id)));
    if (audit.steps.afterEnablement.filter((row) => row.statecode === 0).length !== 4 || audit.steps.afterEnablement.filter((row) => row.statecode === 1).length !== 3) throw new Error("Group 2 enablement state mismatch before smoke tests.");

    const opportunityPayload = (name, currencyId) => ({ name, ...buildLookupBind(bindings.opportunity.transactionCurrencyLookup, currencyId) });
    const actualPayload = (name, opportunityId, currencyId, months = {}) => {
      const payload = { aigw_name: name, ...buildLookupBind(bindings.actualManagement.opportunityLookup, opportunityId), ...buildLookupBind(bindings.actualManagement.transactionCurrencyLookup, currencyId) };
      for (const field of MONTH_REVENUE_FIELDS) if (Object.prototype.hasOwnProperty.call(months, field)) payload[field] = months[field];
      assertActualPayload(payload, bindings);
      return payload;
    };
    const createOpportunity = async (name, currencyId) => {
      const response = await post(`/api/data/v9.2/${bindings.opportunity.entitySetName}`, opportunityPayload(name, currencyId));
      const id = responseId(response, "opportunity");
      createdOpportunityIds.push(id);
      await readWithRetry(get, `/api/data/v9.2/${bindings.opportunity.entitySetName}(${id})?$select=opportunityid,name,_transactioncurrencyid_value`, (row) => row.name === name && String(row._transactioncurrencyid_value || "").toLowerCase() === String(currencyId).toLowerCase(), "Synthetic Opportunity");
      audit.synthetic.opportunities.push({ id, name, currencyId });
      return id;
    };
    const createActual = async (name, opportunityId, currencyId, months = {}) => {
      const response = await post(`/api/data/v9.2/${bindings.actualManagement.entitySetName}`, actualPayload(name, opportunityId, currencyId, months));
      const id = responseId(response, "aigw_actualmanagement");
      createdActualIds.push(id);
      audit.synthetic.actuals.push({ id, name, opportunityId });
      return id;
    };
    const readActual = (id, fields = ["aigw_annualactualrevenue", ...MONTH_REVENUE_FIELDS]) => get(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${id})?$select=${fields.join(",")}`);
    const readParent = (id) => get(`/api/data/v9.2/${bindings.opportunity.entitySetName}(${id})?$select=${PARENT_SELECT}`);
    const expectedResult = (input, expected, actual, parentBefore, parentAfter, extra = {}) => ({ passed: true, input, expectedAnnual: expected, actualAnnual: moneyValue(actual.aigw_annualactualrevenue), parentBefore, parentAfter, parentUnchanged: true, ...extra });
    const runTest = async (name, action) => {
      try {
        const result = await action();
        audit.tests.push({ name, ...result });
      } catch (error) {
        const failure = { name, passed: false, ...classifyError(error) };
        audit.tests.push(failure);
        throw error;
      }
    };

    await runTest("Test 1 Create all Revenue null", async () => {
      const opportunityId = await createOpportunity(`${MARKER} CHILD-TOTAL-1-CNY`, cnyId);
      const parentBefore = await readParent(opportunityId);
      const childId = await createActual(`${MARKER}-ACTUAL-1`, opportunityId, cnyId, Object.fromEntries(MONTH_REVENUE_FIELDS.map((field) => [field, null])));
      const actual = await readActual(childId);
      const parentAfter = await readParent(opportunityId);
      if (!decimalEqual(actual.aigw_annualactualrevenue, 0, moneyPrecision) || !sameMoney(parentBefore.aigw_yearrevenueactual, parentAfter.aigw_yearrevenueactual)) throw new Error("Null Revenue Create total or parent invariant failed.");
      return expectedResult("12 null values", 0, actual, parentBefore, parentAfter);
    });

    await runTest("Test 2 Create one month", async () => {
      const opportunityId = await createOpportunity(`${MARKER} CHILD-TOTAL-2-CNY`, cnyId);
      const parentBefore = await readParent(opportunityId);
      const input = { aigw_aprilactualrevenue: 100.25 };
      const childId = await createActual(`${MARKER}-ACTUAL-2`, opportunityId, cnyId, input);
      const actual = await readActual(childId);
      const parentAfter = await readParent(opportunityId);
      if (!decimalEqual(actual.aigw_annualactualrevenue, 100.25, moneyPrecision)) throw new Error("One-month Revenue total mismatch.");
      assertParentUnchanged(parentBefore, parentAfter);
      return expectedResult(input, 100.25, actual, parentBefore, parentAfter);
    });

    await runTest("Test 3 Create integer 12-month sum", async () => {
      const opportunityId = await createOpportunity(`${MARKER} CHILD-TOTAL-3-CNY`, cnyId);
      const parentBefore = await readParent(opportunityId);
      const input = Object.fromEntries(MONTH_REVENUE_FIELDS.map((field, index) => [field, (index + 1) * 100]));
      const childId = await createActual(`${MARKER}-ACTUAL-3`, opportunityId, cnyId, input);
      const actual = await readActual(childId);
      const parentAfter = await readParent(opportunityId);
      if (!decimalEqual(actual.aigw_annualactualrevenue, 7800, moneyPrecision)) throw new Error("Integer 12-month Revenue total mismatch.");
      assertParentUnchanged(parentBefore, parentAfter);
      return expectedResult(input, 7800, actual, parentBefore, parentAfter);
    });

    await runTest("Test 4 Create decimal sum", async () => {
      const opportunityId = await createOpportunity(`${MARKER} CHILD-TOTAL-4-CNY`, cnyId);
      const parentBefore = await readParent(opportunityId);
      const input = { aigw_aprilactualrevenue: 10.10, aigw_mayactualrevenue: 20.20, aigw_juneactualrevenue: 30.30 };
      const childId = await createActual(`${MARKER}-ACTUAL-4`, opportunityId, cnyId, input);
      const actual = await readActual(childId);
      const parentAfter = await readParent(opportunityId);
      if (!decimalEqual(actual.aigw_annualactualrevenue, 60.60, moneyPrecision)) throw new Error("Decimal Revenue total mismatch.");
      assertParentUnchanged(parentBefore, parentAfter);
      return expectedResult(input, 60.60, actual, parentBefore, parentAfter);
    });

    const canMidpoint = moneyPrecision >= 2 && MONTH_REVENUE_FIELDS.every((field) => Number(attributeMetadata[field].Precision ?? 2) >= 3) && Number(attributeMetadata.aigw_aprilactualrevenue.MinValue) <= 0 && Number(attributeMetadata.aigw_aprilactualrevenue.MaxValue) >= 1.005 && Number(attributeMetadata.aigw_annualactualrevenue.MinValue) <= 0 && Number(attributeMetadata.aigw_annualactualrevenue.MaxValue) >= 1.01;
    if (canMidpoint) {
      await runTest("Test 5 AwayFromZero positive midpoint", async () => {
        const opportunityId = await createOpportunity(`${MARKER} CHILD-TOTAL-5-CNY`, cnyId);
        const parentBefore = await readParent(opportunityId);
        const input = { aigw_aprilactualrevenue: 1.005 };
        const childId = await createActual(`${MARKER}-ACTUAL-5`, opportunityId, cnyId, input);
        const actual = await readActual(childId);
        const parentAfter = await readParent(opportunityId);
        if (!decimalEqual(actual.aigw_annualactualrevenue, 1.01, 2)) throw new Error("Positive midpoint did not round AwayFromZero.");
        assertParentUnchanged(parentBefore, parentAfter);
        return expectedResult(input, 1.01, actual, parentBefore, parentAfter);
      });
    } else {
      audit.tests.push({ name: "Test 5 AwayFromZero positive midpoint", passed: true, status: "Not Executable Due To Source Precision", reason: "Online source or target Money precision/range cannot safely represent 1.005." });
    }

    const canNegativeMidpoint = canMidpoint && Number(attributeMetadata.aigw_aprilactualrevenue.MinValue) <= -1.005 && Number(attributeMetadata.aigw_annualactualrevenue.MinValue) <= -1.01;
    if (canNegativeMidpoint) {
      await runTest("Test 6 AwayFromZero negative midpoint", async () => {
        const opportunityId = await createOpportunity(`${MARKER} CHILD-TOTAL-6-CNY`, cnyId);
        const parentBefore = await readParent(opportunityId);
        const input = { aigw_aprilactualrevenue: -1.005 };
        const childId = await createActual(`${MARKER}-ACTUAL-6`, opportunityId, cnyId, input);
        const actual = await readActual(childId);
        const parentAfter = await readParent(opportunityId);
        if (!decimalEqual(actual.aigw_annualactualrevenue, -1.01, 2)) throw new Error("Negative midpoint did not round AwayFromZero.");
        assertParentUnchanged(parentBefore, parentAfter);
        return expectedResult(input, -1.01, actual, parentBefore, parentAfter);
      });
    } else {
      audit.tests.push({ name: "Test 6 AwayFromZero negative midpoint", passed: true, status: "Not Executable Due To Metadata Precision", reason: "Online source or target Money precision/range cannot safely represent -1.005." });
    }

    await runTest("Test 7 Update one month with PreImage merge", async () => {
      const opportunityId = await createOpportunity(`${MARKER} CHILD-TOTAL-7-CNY`, cnyId);
      const parentBefore = await readParent(opportunityId);
      const childId = await createActual(`${MARKER}-ACTUAL-7`, opportunityId, cnyId, { aigw_aprilactualrevenue: 100, aigw_mayactualrevenue: 200 });
      await patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childId})`, { aigw_mayactualrevenue: 250 });
      const actual = await readActual(childId);
      const parentAfter = await readParent(opportunityId);
      if (!decimalEqual(actual.aigw_annualactualrevenue, 350, moneyPrecision) || !decimalEqual(actual.aigw_aprilactualrevenue, 100, moneyPrecision)) throw new Error("Single-month Update merge failed.");
      assertParentUnchanged(parentBefore, parentAfter);
      return expectedResult({ before: 300, update: { aigw_mayactualrevenue: 250 } }, 350, actual, parentBefore, parentAfter);
    });

    await runTest("Test 8 Update month to null", async () => {
      const opportunityId = await createOpportunity(`${MARKER} CHILD-TOTAL-8-CNY`, cnyId);
      const parentBefore = await readParent(opportunityId);
      const childId = await createActual(`${MARKER}-ACTUAL-8`, opportunityId, cnyId, { aigw_aprilactualrevenue: 100, aigw_mayactualrevenue: 200 });
      await patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childId})`, { aigw_mayactualrevenue: null });
      const actual = await readActual(childId);
      const parentAfter = await readParent(opportunityId);
      if (!decimalEqual(actual.aigw_annualactualrevenue, 100, moneyPrecision) || actual.aigw_mayactualrevenue !== null) throw new Error("Clear-to-null Update failed.");
      assertParentUnchanged(parentBefore, parentAfter);
      return expectedResult({ before: 300, update: { aigw_mayactualrevenue: null } }, 100, actual, parentBefore, parentAfter);
    });

    await runTest("Test 9 Update multiple months", async () => {
      const opportunityId = await createOpportunity(`${MARKER} CHILD-TOTAL-9-CNY`, cnyId);
      const parentBefore = await readParent(opportunityId);
      const childId = await createActual(`${MARKER}-ACTUAL-9`, opportunityId, cnyId, { aigw_aprilactualrevenue: 10, aigw_mayactualrevenue: 20, aigw_juneactualrevenue: 30 });
      await patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childId})`, { aigw_aprilactualrevenue: 100, aigw_juneactualrevenue: 300 });
      const actual = await readActual(childId);
      const parentAfter = await readParent(opportunityId);
      if (!decimalEqual(actual.aigw_annualactualrevenue, 420, moneyPrecision)) throw new Error("Multi-month Update merge failed.");
      assertParentUnchanged(parentBefore, parentAfter);
      return expectedResult({ before: 60, update: { aigw_aprilactualrevenue: 100, aigw_juneactualrevenue: 300 } }, 420, actual, parentBefore, parentAfter);
    });

    await runTest("Test 10 Update non-filtering field", async () => {
      const opportunityId = await createOpportunity(`${MARKER} CHILD-TOTAL-10-CNY`, cnyId);
      const parentBefore = await readParent(opportunityId);
      const childId = await createActual(`${MARKER}-ACTUAL-10`, opportunityId, cnyId, { aigw_aprilactualrevenue: 42 });
      const before = await readActual(childId);
      await patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childId})`, { aigw_name: `${MARKER}-ACTUAL-10-RENAMED` });
      const after = await readActual(childId);
      const parentAfter = await readParent(opportunityId);
      if (!decimalEqual(after.aigw_annualactualrevenue, before.aigw_annualactualrevenue, moneyPrecision)) throw new Error("Non-filtering Update changed annual total.");
      assertParentUnchanged(parentBefore, parentAfter);
      return expectedResult({ field: "aigw_name" }, before.aigw_annualactualrevenue, after, parentBefore, parentAfter, { filteringAttributesHonored: true });
    });

    await runTest("Test 11 Manual annual overwrite behavior", async () => {
      const opportunityId = await createOpportunity(`${MARKER} CHILD-TOTAL-11-CNY`, cnyId);
      const parentBefore = await readParent(opportunityId);
      const childId = await createActual(`${MARKER}-ACTUAL-11`, opportunityId, cnyId, { aigw_aprilactualrevenue: 11 });
      await patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childId})`, { aigw_annualactualrevenue: 999999 });
      const actual = await readActual(childId);
      const parentAfter = await readParent(opportunityId);
      if (!decimalEqual(actual.aigw_annualactualrevenue, 999999, moneyPrecision)) throw new Error("Manual annual overwrite was not preserved under current filtering configuration.");
      assertParentUnchanged(parentBefore, parentAfter);
      return expectedResult({ field: "aigw_annualactualrevenue", value: 999999 }, 999999, actual, parentBefore, parentAfter, { manualOverwriteAllowed: true, recommendation: "Keep the annual field read-only in the Form; do not add it to filtering without a separate design review." });
    });

    await runTest("Test 12 JPY child total", async () => {
      const opportunityId = await createOpportunity(`${MARKER} CHILD-TOTAL-12-JPY`, jpyId);
      const parentBefore = await readParent(opportunityId);
      const input = { aigw_aprilactualrevenue: 100, aigw_mayactualrevenue: 200 };
      const childId = await createActual(`${MARKER}-ACTUAL-12-JPY`, opportunityId, jpyId, input);
      const actual = await readActual(childId);
      const parentAfter = await readParent(opportunityId);
      if (!decimalEqual(actual.aigw_annualactualrevenue, 300, moneyPrecision)) throw new Error("JPY child total mismatch.");
      assertParentUnchanged(parentBefore, parentAfter);
      return expectedResult(input, 300, actual, parentBefore, parentAfter, { currency: "JPY", baseFieldsWrittenExplicitly: false });
    });

    for (const id of createdActualIds) {
      try { await remove(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${id})`); audit.cleanup.deletedActualIds.push(id); } catch (error) { audit.cleanup.errors.push({ type: "actual", id, ...classifyError(error) }); }
    }
    for (const id of createdOpportunityIds) {
      try { await remove(`/api/data/v9.2/${bindings.opportunity.entitySetName}(${id})`); audit.cleanup.deletedOpportunityIds.push(id); } catch (error) { audit.cleanup.errors.push({ type: "opportunity", id, ...classifyError(error) }); }
    }
    const remainingOppsRaw = await get(`/api/data/v9.2/${bindings.opportunity.entitySetName}?$select=opportunityid,name&$filter=startswith(name,'${MARKER}')`);
    const remainingActualsRaw = await get(`/api/data/v9.2/${bindings.actualManagement.entitySetName}?$select=aigw_actualmanagementid,aigw_name&$filter=startswith(aigw_name,'${MARKER}')`);
    const remainingOppScan = resolveLiteralMarkerRecords(remainingOppsRaw.value || [], MARKER);
    const remainingActualScan = resolveLiteralMarkerRecords((remainingActualsRaw.value || []).map((row) => ({ ...row, name: row.aigw_name })), MARKER);
    audit.cleanup.remainingOpportunities = remainingOppScan.literalMatchCount;
    audit.cleanup.remainingActuals = remainingActualScan.literalMatchCount;
    if (audit.cleanup.remainingOpportunities !== 0 || audit.cleanup.remainingActuals !== 0 || audit.cleanup.errors.length) throw new Error("Synthetic cleanup did not reach literal marker zero.");
    audit.steps.after = await Promise.all(ALL_STEPS.map((id) => step(id)));
    const finalEnabled = audit.steps.after.filter((row) => row.statecode === 0).length;
    const finalDisabled = audit.steps.after.filter((row) => row.statecode === 1).length;
    if (finalEnabled !== 4 || finalDisabled !== 3 || !GROUP3.every((id) => audit.steps.after.find((row) => row.sdkmessageprocessingstepid === id)?.statecode === 1)) throw new Error("Final Group 2 step state mismatch.");
    audit.finalDecision = "Group 2 Child Total Ready=true";
    audit.completedAt = stamp();
    await writeAudit();
    console.log(JSON.stringify({ audit: file, tests: audit.tests, finalStepState: audit.steps.after, cleanup: audit.cleanup, requestCounts: audit.requestCounts, publishActions: 0, productionRequests: 0, finalDecision: audit.finalDecision }, null, 2));
  } catch (error) {
    audit.error = { ...classifyError(error), message: String(error?.message || error) };
    if (apply && group2Attempted) {
      try {
        const current = await Promise.all(GROUP2.map((id) => step(id)));
        for (const row of current) if (row.statecode === 0) await setStepState(row.sdkmessageprocessingstepid, 1);
        audit.rollback = { group2Disabled: true, finalStates: await Promise.all(ALL_STEPS.map((id) => step(id))) };
      } catch (rollbackError) {
        audit.rollback = { group2Disabled: false, error: String(rollbackError?.message || rollbackError) };
      }
    }
    if (apply && bindings) {
      for (const id of createdActualIds) {
        try { await remove(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${id})`); audit.cleanup.deletedActualIds.push(id); } catch (cleanupError) { audit.cleanup.errors.push({ type: "actual", id, ...classifyError(cleanupError) }); }
      }
      for (const id of createdOpportunityIds) {
        try { await remove(`/api/data/v9.2/${bindings.opportunity.entitySetName}(${id})`); audit.cleanup.deletedOpportunityIds.push(id); } catch (cleanupError) { audit.cleanup.errors.push({ type: "opportunity", id, ...classifyError(cleanupError) }); }
      }
    }
    audit.finalDecision = "Group 2 Child Total Ready=false";
    audit.completedAt = stamp();
    await writeAudit();
    throw error;
  }
}

runDataverseCli(import.meta.url, main);
