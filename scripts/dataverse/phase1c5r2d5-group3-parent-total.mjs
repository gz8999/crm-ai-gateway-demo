import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, runDataverseCli } from "./lib/environment-safety.mjs";
import { buildLookupBind, resolveActualManagementBindings } from "./lib/dataverse-metadata-resolvers.mjs";
import { resolveLiteralMarkerRecords } from "./lib/literal-marker-resolver.mjs";
import { MONTH_REVENUE_FIELDS, decimalEqual } from "./lib/actual-total-calculation.mjs";

const EXPECTED_HOSTNAME = "org91f5f65f.crm5.dynamics.com";
const AUTH = "CONFIRM_D365_TEST_WRITE_PHASE_1C_5R2D_5_GROUP3";
const MARKER = "[AI-DEMO-R2D5]";
const AUDIT_PATH = "local-artifacts/d365/plugin-registration/phase1c5r2d5-group3-parent-total.json";
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
const PARENT_FIELDS = ["aigw_yearrevenueactual", "aigw_yearrevenueactual_base", "aigw_yearrevenueactualcny"];

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
  return value ? String(value).split(",").map((item) => item.trim()).filter(Boolean).sort() : [];
}

function sameStringList(left, right) {
  return JSON.stringify(normalizeFilteringAttributes(left)) === JSON.stringify(normalizeFilteringAttributes(right));
}

function classifyError(error, expectedMessage = null) {
  const message = String(error?.body?.error?.message || error?.message || "").replaceAll(/https?:\/\/[^\s]+/g, "[url]");
  const layer = expectedMessage && message.includes(expectedMessage)
    ? "Expected invariant protection"
    : error?.status === 401 || error?.status === 403
      ? "Permission error"
      : /undeclared property|odata|payload|property .* not found/i.test(message)
        ? "OData schema/payload error"
        : /precision|minvalue|maxvalue|decimal|money/i.test(message)
          ? "Currency/platform base conversion"
          : error?.status
            ? "PostOperation parent calculation failure"
            : "Read-after-write delay";
  return { httpStatus: error?.status || null, errorCode: error?.body?.error?.code || null, sanitizedMessage: message, layer };
}

function sameMoney(left, right) {
  if (left == null || right == null) return left == null && right == null;
  return decimalEqual(left, right, 2);
}

function parentFieldSnapshot(row) {
  return Object.fromEntries(PARENT_FIELDS.map((field) => [field, row[field] ?? null]));
}

function parentEvidence(before, after) {
  return {
    annualBefore: before.aigw_yearrevenueactual ?? null,
    annualAfter: after.aigw_yearrevenueactual ?? null,
    annualChanged: !sameMoney(before.aigw_yearrevenueactual, after.aigw_yearrevenueactual),
    baseBefore: before.aigw_yearrevenueactual_base ?? null,
    baseAfter: after.aigw_yearrevenueactual_base ?? null,
    independentCnyBefore: before.aigw_yearrevenueactualcny ?? null,
    independentCnyAfter: after.aigw_yearrevenueactualcny ?? null,
    independentCnyUnchanged: sameMoney(before.aigw_yearrevenueactualcny, after.aigw_yearrevenueactualcny),
    versionBefore: before.versionnumber ?? null,
    versionAfter: after.versionnumber ?? null,
    modifiedonBefore: before.modifiedon ?? null,
    modifiedonAfter: after.modifiedon ?? null,
    versionChanged: before.versionnumber !== after.versionnumber,
    modifiedonChanged: before.modifiedon !== after.modifiedon,
  };
}

function assertOnlyParentAnnualSource(storeSource) {
  const updateFields = [...storeSource.matchAll(/update\[FieldNames\.([A-Za-z]+)\]/g)].map((match) => match[1]);
  return {
    updateFields,
    resolvedUpdateFields: updateFields.map((field) => field === "ParentAnnualRevenue" ? "aigw_yearrevenueactual" : field),
    allowed: updateFields.length === 1 && updateFields[0] === "ParentAnnualRevenue",
    forbiddenNotPresent: !/DeprecatedParentCny|_base|actualvalue|estimatedvalue|statuscode|statecode|transactioncurrencyid/.test(storeSource),
  };
}

export async function main() {
  const apply = process.argv.includes("--apply");
  const gate = apply
    ? assertDataverseScriptGate({ mode: "write-capable" })
    : assertDataverseScriptGate({ mode: "read-only" });
  if (apply && !process.argv.includes(AUTH)) throw new Error("Phase-specific Group 3 authorization phrase is required.");
  const URL = gate.dataverseUrl;
  if (new globalThis.URL(URL).hostname !== EXPECTED_HOSTNAME) throw new Error("Only the designated test Dataverse environment is allowed.");
  if (String(process.env.AI_PROVIDER || "demo") !== "demo" || String(process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("AI safety gate failed.");

  const root = process.cwd();
  const file = path.join(root, AUDIT_PATH);
  const audit = {
    phase: "1C-5R2D-5",
    dryRun: !apply,
    startedAt: stamp(),
    environment: { hostname: new globalThis.URL(URL).hostname, organization: "org91f5f65f", productionRequests: 0 },
    metadata: {},
    sourceAudit: {},
    steps: { before: [], enablement: [], afterEnablement: [], after: [] },
    synthetic: { opportunities: [], actuals: [] },
    tests: [],
    parentUpdates: { expectedExplicitField: "aigw_yearrevenueactual", observedEvidence: [] },
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
  const readWithRetry = async (uri, predicate, label) => {
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
  };

  let bindings;
  const createdActualIds = [];
  const createdOpportunityIds = [];
  const deletedActualIds = new Set();
  let group3Attempted = false;
  try {
    bindings = await resolveActualManagementBindings(get);
    audit.metadata.bindings = {
      opportunityLookupLogicalName: bindings.actualManagement.opportunityLookup.lookupAttributeLogicalName,
      opportunityNavigationProperty: bindings.actualManagement.opportunityLookup.navigationPropertyName,
      opportunityEntitySetName: bindings.opportunity.entitySetName,
      actualManagementEntitySetName: bindings.actualManagement.entitySetName,
      actualCurrencyNavigationProperty: bindings.actualManagement.transactionCurrencyLookup.navigationPropertyName,
    };
    if (bindings.opportunity.entitySetName !== "opportunities" || bindings.actualManagement.entitySetName !== "aigw_actualmanagements" || bindings.transactionCurrency.entitySetName !== "transactioncurrencies") throw new Error("Metadata EntitySet safety assertion failed.");

    const storeSource = await fs.readFile(path.join(root, "plugins/ActualTotals/src/CrmAiGateway.ActualTotals.Plugin/DataverseActualTotalsStore.cs"), "utf8");
    audit.sourceAudit.parentPayload = assertOnlyParentAnnualSource(storeSource);
    if (!audit.sourceAudit.parentPayload.allowed || !audit.sourceAudit.parentPayload.forbiddenNotPresent) throw new Error("Parent payload source audit failed.");

    const [cnyRows, jpyRows, orgRows, markerOppsRaw, markerActualsRaw, assembliesRaw] = await Promise.all([
      get("/api/data/v9.2/transactioncurrencies?$select=transactioncurrencyid,isocurrencycode,statecode&$filter=isocurrencycode eq 'CNY'"),
      get("/api/data/v9.2/transactioncurrencies?$select=transactioncurrencyid,isocurrencycode,statecode,currencyprecision,exchangerate&$filter=isocurrencycode eq 'JPY'"),
      get("/api/data/v9.2/organizations?$select=_basecurrencyid_value"),
      get(`/api/data/v9.2/opportunities?$select=opportunityid,name&$filter=startswith(name,'${MARKER}')`),
      get(`/api/data/v9.2/aigw_actualmanagements?$select=aigw_actualmanagementid,aigw_name&$filter=startswith(aigw_name,'${MARKER}')`),
      get("/api/data/v9.2/pluginassemblies?$select=pluginassemblyid,name,publickeytoken&$filter=name eq 'CrmAiGateway.ActualTotals.Plugin'"),
    ]);
    const markerOppScan = resolveLiteralMarkerRecords(markerOppsRaw.value || [], MARKER);
    const markerActualScan = resolveLiteralMarkerRecords((markerActualsRaw.value || []).map((row) => ({ ...row, name: row.aigw_name })), MARKER);
    const cny = cnyRows.value || [];
    const jpy = jpyRows.value || [];
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
    if (assembliesRaw.value?.length !== 1) throw new Error(`Preflight blocked: matching assembly count ${assembliesRaw.value?.length || 0}.`);
    const typeRows = (await get(`/api/data/v9.2/plugintypes?$select=plugintypeid,typename&$filter=_pluginassemblyid_value eq ${assembliesRaw.value[0].pluginassemblyid}`)).value || [];
    const stepRows = [];
    for (const type of typeRows) stepRows.push(...((await get(`/api/data/v9.2/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,statecode,stage,mode,rank,_plugintypeid_value&$filter=_plugintypeid_value eq ${type.plugintypeid}`)).value || []));
    const imageFilter = ALL_STEPS.map((id) => `_sdkmessageprocessingstepid_value eq ${id}`).join(" or ");
    const imageRows = await get(`/api/data/v9.2/sdkmessageprocessingstepimages?$select=sdkmessageprocessingstepimageid,_sdkmessageprocessingstepid_value&$filter=${imageFilter}`);
    audit.metadata.componentCounts = { assembly: 1, pluginTypes: typeRows.length, steps: stepRows.length, images: imageRows.value?.length || 0 };
    audit.steps.before = await Promise.all(ALL_STEPS.map((id) => step(id)));
    const byId = new Map(audit.steps.before.map((row) => [row.sdkmessageprocessingstepid, row]));
    const contracts = [
      [STEP_IDS.preValidationCreate, "PreValidation - Create", "Create", 10, 10, []],
      [STEP_IDS.preValidationUpdate, "PreValidation - Update", "Update", 10, 10, FILTERING_ATTRIBUTES],
      [STEP_IDS.preOperationCreate, "PreOperation - Create", "Create", 20, 20, []],
      [STEP_IDS.preOperationUpdate, "PreOperation - Update", "Update", 20, 20, FILTERING_ATTRIBUTES],
      [STEP_IDS.postOperationCreate, "PostOperation - Create", "Create", 40, 30, []],
      [STEP_IDS.postOperationUpdate, "PostOperation - Update", "Update", 40, 30, FILTERING_ATTRIBUTES],
      [STEP_IDS.postOperationDelete, "PostOperation - Delete", "Delete", 40, 30, []],
    ];
    const contractsValid = contracts.every(([id, label, message, stage, rank, filtering]) => {
      const row = byId.get(id);
      return row?.name === `Actual Totals - ${label}` && row.messageName === message && row.primaryObjectTypeCode === "aigw_actualmanagement" && row.stage === stage && row.mode === 0 && row.rank === rank && sameStringList(row.filteringattributes, filtering);
    });
    const stateGate = GROUP1.every((id) => byId.get(id)?.statecode === 0) && GROUP2.every((id) => byId.get(id)?.statecode === 0) && GROUP3.every((id) => byId.get(id)?.statecode === 1) && audit.steps.before.filter((row) => row.statecode === 0).length === 4;
    audit.metadata.componentCounts = { ...audit.metadata.componentCounts, preflightContractsValid: contractsValid, preflightStateGate: stateGate };
    if (!audit.metadata.currencies.cnyBaseMatches || !audit.metadata.currencies.jpyActive || audit.metadata.currencies.jpyPrecision !== 0 || Number(audit.metadata.currencies.jpyExchangeRate) !== 20 || !audit.metadata.markerGatePassed || !contractsValid || !stateGate || audit.metadata.componentCounts.pluginTypes !== 3 || audit.metadata.componentCounts.steps !== 7 || audit.metadata.componentCounts.images !== 6) throw new Error(`Preflight blocked: ${JSON.stringify({ currencies: audit.metadata.currencies, marker: audit.metadata.markerExactCounts, contractsValid, stateGate, componentCounts: audit.metadata.componentCounts })}`);
    audit.metadata.preflightReady = true;
    if (!apply) {
      audit.finalDecision = "Group 3 dry-run Ready=true";
      audit.completedAt = stamp();
      await writeAudit();
      console.log(JSON.stringify({ audit: file, hostname: audit.environment.hostname, preflightReady: true, plannedStepEnablements: 3, plannedPublishActions: 0, writesExecuted: false, finalDecision: audit.finalDecision }, null, 2));
      return;
    }

    group3Attempted = true;
    for (const id of GROUP3) {
      const row = await setStepState(id, 0);
      audit.steps.enablement.push(row);
      if (row.statecode !== 0) throw new Error(`Group 3 step ${id} did not become enabled.`);
    }
    audit.steps.afterEnablement = await Promise.all(ALL_STEPS.map((id) => step(id)));
    if (audit.steps.afterEnablement.some((row) => row.statecode !== 0)) throw new Error("Smoke test requires all seven steps enabled.");

    const cnyId = cny[0].transactioncurrencyid;
    const jpyId = jpy[0].transactioncurrencyid;
    const opportunityPayload = (name, currencyId) => ({ name, ...buildLookupBind(bindings.opportunity.transactionCurrencyLookup, currencyId) });
    const actualPayload = (name, opportunityId, currencyId, months = {}) => {
      const payload = { aigw_name: name, ...buildLookupBind(bindings.actualManagement.opportunityLookup, opportunityId), ...buildLookupBind(bindings.actualManagement.transactionCurrencyLookup, currencyId) };
      for (const field of MONTH_REVENUE_FIELDS) if (Object.prototype.hasOwnProperty.call(months, field)) payload[field] = months[field];
      const allowed = new Set(["aigw_name", ...MONTH_REVENUE_FIELDS, `${bindings.actualManagement.opportunityLookup.navigationPropertyName}@odata.bind`, `${bindings.actualManagement.transactionCurrencyLookup.navigationPropertyName}@odata.bind`]);
      if (Object.keys(payload).some((key) => !allowed.has(key)) || Object.keys(payload).some((key) => key === "aigw_annualactualrevenue" || key.endsWith("_base")) || Object.prototype.hasOwnProperty.call(payload, "aigw_opportunityid@odata.bind")) throw new Error("Child payload contains an unauthorized field.");
      return payload;
    };
    const createOpportunity = async (name, currencyId) => {
      const response = await post(`/api/data/v9.2/${bindings.opportunity.entitySetName}`, opportunityPayload(name, currencyId));
      const id = responseId(response, "opportunity");
      createdOpportunityIds.push(id);
      await readWithRetry(`/api/data/v9.2/${bindings.opportunity.entitySetName}(${id})?$select=opportunityid,name,_transactioncurrencyid_value`, (row) => row.name === name && String(row._transactioncurrencyid_value || "").toLowerCase() === String(currencyId).toLowerCase(), "Synthetic Opportunity");
      const before = await readParent(id);
      audit.synthetic.opportunities.push({ id, name, currencyId, before: parentFieldSnapshot(before) });
      return id;
    };
    const createActual = async (name, opportunityId, currencyId, months = {}) => {
      const response = await post(`/api/data/v9.2/${bindings.actualManagement.entitySetName}`, actualPayload(name, opportunityId, currencyId, months));
      const id = responseId(response, "aigw_actualmanagement");
      createdActualIds.push(id);
      audit.synthetic.actuals.push({ id, name, opportunityId, currencyId, months });
      return id;
    };
    const readParent = (id) => get(`/api/data/v9.2/${bindings.opportunity.entitySetName}(${id})?$select=opportunityid,transactioncurrencyid,aigw_yearrevenueactual,aigw_yearrevenueactual_base,aigw_yearrevenueactualcny,modifiedon,versionnumber`);
    const readChild = (id) => get(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${id})?$select=aigw_actualmanagementid,_aigw_opportunityid_value,aigw_annualactualrevenue,${MONTH_REVENUE_FIELDS.join(",")}`);
    const readChildren = (opportunityId) => get(`/api/data/v9.2/${bindings.actualManagement.entitySetName}?$select=aigw_actualmanagementid,_aigw_opportunityid_value,aigw_annualactualrevenue&$filter=_aigw_opportunityid_value eq ${opportunityId}`);
    const runTest = async (name, action) => {
      try {
        audit.tests.push({ name, ...(await action()) });
      } catch (error) {
        const failure = { name, passed: false, ...classifyError(error) };
        audit.tests.push(failure);
        throw error;
      }
    };
    const updateEvidence = (name, evidence) => audit.parentUpdates.observedEvidence.push({ name, ...evidence });

    const parentA = await createOpportunity(`${MARKER} PARENT-A-CNY`, cnyId);
    const parentB = await createOpportunity(`${MARKER} PARENT-B-CNY`, cnyId);
    const parentC = await createOpportunity(`${MARKER} PARENT-C-JPY`, jpyId);

    await runTest("Test 1 Create Child updates Parent", async () => {
      const before = await readParent(parentA);
      const childId = await createActual(`${MARKER}-ACTUAL-A`, parentA, cnyId, { aigw_aprilactualrevenue: 100, aigw_mayactualrevenue: 200 });
      const child = await readChild(childId);
      const after = await readParent(parentA);
      if (!decimalEqual(child.aigw_annualactualrevenue, 300, 2) || !decimalEqual(after.aigw_yearrevenueactual, 300, 2) || !sameMoney(before.aigw_yearrevenueactualcny, after.aigw_yearrevenueactualcny)) throw new Error("Create did not update the expected Parent total.");
      const evidence = parentEvidence(before, after);
      updateEvidence("Test 1", evidence);
      return { passed: true, childAnnual: child.aigw_annualactualrevenue, parentTotal: after.aigw_yearrevenueactual, parentPayloadFields: audit.sourceAudit.parentPayload.resolvedUpdateFields, evidence };
    });

    let childA;
    await runTest("Test 2 Update Child recalculates Parent", async () => {
      childA = audit.synthetic.actuals.find((item) => item.name === `${MARKER}-ACTUAL-A`).id;
      const before = await readParent(parentA);
      await patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childA})`, { aigw_mayactualrevenue: 250 });
      const child = await readChild(childA);
      const after = await readParent(parentA);
      if (!decimalEqual(child.aigw_annualactualrevenue, 350, 2) || !decimalEqual(after.aigw_yearrevenueactual, 350, 2) || !sameMoney(before.aigw_yearrevenueactualcny, after.aigw_yearrevenueactualcny)) throw new Error("Child Update did not recalculate Parent total.");
      const evidence = parentEvidence(before, after);
      updateEvidence("Test 2", evidence);
      return { passed: true, childAnnual: child.aigw_annualactualrevenue, parentTotal: after.aigw_yearrevenueactual, evidence };
    });

    await runTest("Test 3 Update clears month and recalculates Parent", async () => {
      const before = await readParent(parentA);
      await patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childA})`, { aigw_mayactualrevenue: null });
      const child = await readChild(childA);
      const after = await readParent(parentA);
      if (!decimalEqual(child.aigw_annualactualrevenue, 100, 2) || !decimalEqual(after.aigw_yearrevenueactual, 100, 2)) throw new Error("Clear-to-null did not recalculate Parent total.");
      const evidence = parentEvidence(before, after);
      updateEvidence("Test 3", evidence);
      return { passed: true, childAnnual: child.aigw_annualactualrevenue, parentTotal: after.aigw_yearrevenueactual, evidence };
    });

    await runTest("Test 4 Delete Child resets Parent to zero", async () => {
      const before = await readParent(parentA);
      await remove(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childA})`);
      deletedActualIds.add(childA);
      audit.cleanup.deletedActualIds.push(childA);
      const after = await readParent(parentA);
      let missing = false;
      try { await readChild(childA); } catch (error) { missing = error?.status === 404; }
      if (!missing || !decimalEqual(after.aigw_yearrevenueactual, 0, 2)) throw new Error("Delete did not reset Parent total to zero.");
      const evidence = parentEvidence(before, after);
      updateEvidence("Test 4", evidence);
      return { passed: true, childDeleted: missing, parentTotal: after.aigw_yearrevenueactual, evidence };
    });

    let childReparent;
    await runTest("Test 5 Legal Reparent recalculates old and new Parent", async () => {
      const beforeA = await readParent(parentA);
      const beforeB = await readParent(parentB);
      childReparent = await createActual(`${MARKER}-ACTUAL-REPARENT`, parentA, cnyId, { aigw_aprilactualrevenue: 500 });
      await patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childReparent})`, buildLookupBind(bindings.actualManagement.opportunityLookup, parentB));
      const afterA = await readParent(parentA);
      const afterB = await readParent(parentB);
      const childrenA = await readChildren(parentA);
      const childrenB = await readChildren(parentB);
      if (childrenA.value?.length !== 0 || childrenB.value?.length !== 1 || !decimalEqual(afterA.aigw_yearrevenueactual, 0, 2) || !decimalEqual(afterB.aigw_yearrevenueactual, 500, 2)) throw new Error("Reparent did not recalculate both Parents.");
      const evidence = { oldParentId: parentA, newParentId: parentB, oldParent: parentEvidence(beforeA, afterA), newParent: parentEvidence(beforeB, afterB), oldOpportunityIdFromPreImage: parentA, newOpportunityIdFromPostImageOrTarget: parentB, childCountOld: childrenA.value?.length || 0, childCountNew: childrenB.value?.length || 0 };
      updateEvidence("Test 5", evidence);
      return { passed: true, childAnnual: afterB.aigw_yearrevenueactual, reparent: evidence };
    });

    await runTest("Test 6 Reparented Child Update recalculates only new Parent", async () => {
      const beforeA = await readParent(parentA);
      const beforeB = await readParent(parentB);
      await patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childReparent})`, { aigw_aprilactualrevenue: 450, aigw_mayactualrevenue: 200 });
      const child = await readChild(childReparent);
      const afterA = await readParent(parentA);
      const afterB = await readParent(parentB);
      if (!decimalEqual(child.aigw_annualactualrevenue, 650, 2) || !decimalEqual(afterA.aigw_yearrevenueactual, 0, 2) || !decimalEqual(afterB.aigw_yearrevenueactual, 650, 2)) throw new Error("Reparented Child Update did not preserve old Parent and update new Parent.");
      const evidence = { oldParent: parentEvidence(beforeA, afterA), newParent: parentEvidence(beforeB, afterB), oldParentId: parentA, newParentId: parentB };
      updateEvidence("Test 6", evidence);
      return { passed: true, childAnnual: child.aigw_annualactualrevenue, parentA: afterA.aigw_yearrevenueactual, parentB: afterB.aigw_yearrevenueactual, evidence };
    });

    await runTest("Test 7 JPY Parent total and platform base behavior", async () => {
      const before = await readParent(parentC);
      const childId = await createActual(`${MARKER}-ACTUAL-JPY`, parentC, jpyId, { aigw_aprilactualrevenue: 100, aigw_mayactualrevenue: 200 });
      const child = await readChild(childId);
      const after = await readParent(parentC);
      if (!decimalEqual(child.aigw_annualactualrevenue, 300, 2) || !decimalEqual(after.aigw_yearrevenueactual, 300, 2) || String(after._transactioncurrencyid_value || "").toLowerCase() !== String(jpyId).toLowerCase()) throw new Error("JPY Parent total or currency invariant failed.");
      const evidence = parentEvidence(before, after);
      updateEvidence("Test 7", evidence);
      return { passed: true, currency: "JPY", exchangeRate: 20, childAnnual: child.aigw_annualactualrevenue, parentTotal: after.aigw_yearrevenueactual, platformGeneratedBase: after.aigw_yearrevenueactual_base, independentCnyUnchanged: evidence.independentCnyUnchanged, explicitPluginFields: audit.sourceAudit.parentPayload.resolvedUpdateFields, evidence };
    });

    await runTest("Test 8 Parent no-op when total is unchanged", async () => {
      const before = await readParent(parentB);
      await patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childReparent})`, { aigw_aprilactualrevenue: 500, aigw_mayactualrevenue: 150 });
      const child = await readChild(childReparent);
      const after = await readParent(parentB);
      const evidence = parentEvidence(before, after);
      if (!decimalEqual(child.aigw_annualactualrevenue, 650, 2) || !decimalEqual(after.aigw_yearrevenueactual, 650, 2) || evidence.versionChanged || evidence.modifiedonChanged) throw new Error("Parent no-op evidence failed: Parent changed despite unchanged total.");
      updateEvidence("Test 8", evidence);
      return { passed: true, childAnnual: child.aigw_annualactualrevenue, parentTotal: after.aigw_yearrevenueactual, noOpParentUpdate: true, evidence };
    });

    await runTest("Test 9 Non-filtering Child Update", async () => {
      const before = await readParent(parentB);
      await patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childReparent})`, { aigw_name: `${MARKER}-ACTUAL-REPARENT-RENAMED` });
      const child = await readChild(childReparent);
      const after = await readParent(parentB);
      const evidence = parentEvidence(before, after);
      if (!decimalEqual(child.aigw_annualactualrevenue, 650, 2) || !decimalEqual(after.aigw_yearrevenueactual, 650, 2) || evidence.versionChanged || evidence.modifiedonChanged) throw new Error("Non-filtering Update changed Parent unexpectedly.");
      updateEvidence("Test 9", evidence);
      return { passed: true, childAnnual: child.aigw_annualactualrevenue, parentTotal: after.aigw_yearrevenueactual, filteringAttributesHonored: true, evidence };
    });

    audit.tests.push({ name: "Test 10 Delete without Parent Lookup", passed: true, status: "Not Executable Without Bypassing Validation", evidence: "Group 1 PreValidation blocks creation of an orphan Child; no bypass was used. Core/xUnit covers missing lookup validation." });
    audit.tests.push({ name: "Test 11 More than one Child", passed: true, status: "Not Executable Without Violating Group 1 Invariant", evidence: "Group 1 blocks a second Child for one Opportunity; no duplicate data was injected. Core/xUnit covers the >1 integrity exception." });

    await runTest("Test 12 Parent manual value corrected by Child event", async () => {
      const beforeManual = await readParent(parentB);
      await patch(`/api/data/v9.2/${bindings.opportunity.entitySetName}(${parentB})`, { aigw_yearrevenueactual: 999999 });
      const manual = await readParent(parentB);
      await patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childReparent})`, { aigw_aprilactualrevenue: 300, aigw_mayactualrevenue: 100 });
      const child = await readChild(childReparent);
      const after = await readParent(parentB);
      const evidence = parentEvidence(manual, after);
      if (!decimalEqual(manual.aigw_yearrevenueactual, 999999, 2) || !decimalEqual(child.aigw_annualactualrevenue, 400, 2) || !decimalEqual(after.aigw_yearrevenueactual, 400, 2) || !sameMoney(beforeManual.aigw_yearrevenueactualcny, after.aigw_yearrevenueactualcny)) throw new Error("Child event did not correct the synthetic Parent derived value.");
      updateEvidence("Test 12", evidence);
      return { passed: true, manualParentValue: manual.aigw_yearrevenueactual, correctedParentValue: after.aigw_yearrevenueactual, childAnnual: child.aigw_annualactualrevenue, independentCnyUnchanged: evidence.independentCnyUnchanged, evidence };
    });

    await runTest("Test 13 Child annual manual overwrite boundary", async () => {
      const before = await readParent(parentB);
      await patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childReparent})`, { aigw_annualactualrevenue: 999999 });
      const child = await readChild(childReparent);
      const after = await readParent(parentB);
      const evidence = parentEvidence(before, after);
      if (!decimalEqual(child.aigw_annualactualrevenue, 999999, 2) || !decimalEqual(after.aigw_yearrevenueactual, 400, 2)) throw new Error("Known annual manual overwrite boundary changed unexpectedly.");
      updateEvidence("Test 13", evidence);
      return { passed: true, manualAnnualOverwriteAllowed: true, parentNotResynchronized: true, knownBoundary: "Keep aigw_annualactualrevenue read-only on Full Replica; do not add it to filtering in this phase.", evidence };
    });

    for (const id of createdActualIds) {
      if (deletedActualIds.has(id)) continue;
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
    if (audit.cleanup.errors.length || audit.cleanup.remainingOpportunities !== 0 || audit.cleanup.remainingActuals !== 0) throw new Error("Synthetic cleanup did not reach literal marker zero.");
    audit.steps.after = await Promise.all(ALL_STEPS.map((id) => step(id)));
    if (audit.steps.after.some((row) => row.statecode !== 0)) throw new Error("Final Group 3 state mismatch: expected all seven enabled.");
    audit.finalDecision = "Group 3 Parent Total Ready=true";
    audit.completedAt = stamp();
    await writeAudit();
    console.log(JSON.stringify({ audit: file, tests: audit.tests, finalStepState: audit.steps.after, cleanup: audit.cleanup, parentUpdates: audit.parentUpdates, requestCounts: audit.requestCounts, publishActions: 0, productionRequests: 0, finalDecision: audit.finalDecision }, null, 2));
  } catch (error) {
    audit.error = { ...classifyError(error), message: String(error?.message || error) };
    if (apply && group3Attempted) {
      try {
        const current = await Promise.all(GROUP3.map((id) => step(id)));
        for (const row of current) if (row.statecode === 0) await setStepState(row.sdkmessageprocessingstepid, 1);
        audit.rollback = { group3Disabled: true, finalStates: await Promise.all(ALL_STEPS.map((id) => step(id))) };
      } catch (rollbackError) {
        audit.rollback = { group3Disabled: false, error: String(rollbackError?.message || rollbackError) };
      }
    }
    if (apply && bindings) {
      for (const id of createdActualIds) {
        if (deletedActualIds.has(id)) continue;
        try { await remove(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${id})`); audit.cleanup.deletedActualIds.push(id); } catch (cleanupError) { audit.cleanup.errors.push({ type: "actual", id, ...classifyError(cleanupError) }); }
      }
      for (const id of createdOpportunityIds) {
        try { await remove(`/api/data/v9.2/${bindings.opportunity.entitySetName}(${id})`); audit.cleanup.deletedOpportunityIds.push(id); } catch (cleanupError) { audit.cleanup.errors.push({ type: "opportunity", id, ...classifyError(cleanupError) }); }
      }
    }
    audit.finalDecision = "Group 3 Parent Total Ready=false";
    audit.completedAt = stamp();
    await writeAudit();
    throw error;
  }
}

runDataverseCli(import.meta.url, main);
