import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, runDataverseCli } from "./lib/environment-safety.mjs";
import { buildLookupBind, resolveActualManagementBindings } from "./lib/dataverse-metadata-resolvers.mjs";
import { resolveLiteralMarkerRecords } from "./lib/literal-marker-resolver.mjs";

const EXPECTED_HOSTNAME = "org91f5f65f.crm5.dynamics.com";
const AUTH = "CONFIRM_D365_TEST_WRITE_PHASE_1C_5R2D_3D_GROUP1";
const MARKER = "[AI-DEMO-R2D3]";
const AUDIT_PATH = "local-artifacts/d365/plugin-registration/phase1c5r2d3d-group1-validation-literal-marker.json";
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
const ALL_STEPS = Object.values(STEP_IDS);

const stamp = () => new Date().toISOString();
const escapeOData = (value) => String(value).replaceAll("'", "''");
const isGuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));

function responseId(response, entityLogicalName) {
  const direct = response.body?.[`${entityLogicalName}id`];
  if (direct) return direct;
  const header = response.headers?.get?.("odata-entityid") || response.headers?.get?.("location") || "";
  const match = /\(([0-9a-f-]{36})\)/i.exec(header);
  if (match) return match[1];
  throw new Error(`Dataverse create response did not contain ${entityLogicalName} id.`);
}

function classifyError(error, expectedMessage) {
  const message = String(error?.body?.error?.message || error?.message || "").replaceAll(/https?:\/\/[^\s]+/g, "[url]");
  const enteredPlugin = message.includes(expectedMessage);
  const layer = enteredPlugin
    ? "Plugin business validation"
    : error?.status === 401 || error?.status === 403
      ? "Permission error"
      : /undeclared property|odata|payload|property .* not found/i.test(message)
        ? "OData payload/schema error"
        : error?.status
          ? "Dataverse platform validation"
          : "Network/read-after-write delay";
  return { httpStatus: error?.status || null, errorCode: error?.body?.error?.code || null, sanitizedMessage: message, layer, enteredPlugin, expectedBusinessRule: expectedMessage, passed: enteredPlugin };
}

function assertBusinessPayload(payload, bindings, { requireOpportunity = true } = {}) {
  const keys = Object.keys(payload);
  if (keys.includes("aigw_opportunityid@odata.bind")) throw new Error("Blocked payload contains the old logical-name lookup bind.");
  const opportunityKey = `${bindings.actualManagement.opportunityLookup.navigationPropertyName}@odata.bind`;
  if (requireOpportunity && !keys.includes(opportunityKey)) throw new Error("Blocked payload is missing the metadata-resolved Opportunity bind.");
  if (!keys.every((key) => key === "aigw_name" || key === "aigw_aprilactualrevenue" || key.endsWith("@odata.bind"))) throw new Error("Blocked payload contains an unauthorized field.");
  for (const key of keys.filter((item) => item.endsWith("@odata.bind"))) {
    if (!isGuid(String(payload[key]).match(/\(([0-9a-f-]{36})\)$/i)?.[1])) throw new Error(`Blocked bind has an invalid GUID: ${key}`);
  }
}

export async function main() {
  assertDataverseScriptGate({ mode: "write-capable" });
  if (!process.argv.includes(AUTH)) throw new Error("Phase-specific Group 1 authorization phrase is required.");
  const URL = getDataverseUrl();
  if (new globalThis.URL(URL).hostname !== EXPECTED_HOSTNAME) throw new Error("Only the designated test Dataverse environment is allowed.");
  if (String(process.env.AI_PROVIDER || "demo") !== "demo" || String(process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("AI safety gate failed.");
  const root = process.cwd();
  const audit = {
    phase: "1C-5R2D-3D",
    startedAt: stamp(),
    environment: { hostname: new globalThis.URL(URL).hostname, organization: "org91f5f65f", productionRequests: 0 },
    metadata: {},
    steps: { before: [], enablement: [], after: [] },
    synthetic: { opportunities: [], actuals: [] },
    tests: [],
    cleanup: { deletedActualIds: [], deletedOpportunityIds: [], errors: [] },
    requestCounts: { GET: 0, POST: 0, PATCH: 0, DELETE: 0 },
    publishActions: 0,
    writesExecuted: false,
    finalDecision: "Blocked",
  };
  const file = path.join(root, AUDIT_PATH);
  const writeAudit = async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(audit, null, 2));
  };
  const client = createDynamicsClient();
  const get = async (uri) => {
    audit.requestCounts.GET += 1;
    const result = await client.dataverseGet(uri);
    return result.body;
  };
  const post = async (uri, body) => {
    audit.requestCounts.POST += 1;
    audit.writesExecuted = true;
    return client.dataversePost(uri, body);
  };
  const patch = async (uri, body) => {
    audit.requestCounts.PATCH += 1;
    audit.writesExecuted = true;
    return client.dataversePatch(uri, body);
  };
  const remove = async (uri) => {
    audit.requestCounts.DELETE += 1;
    audit.writesExecuted = true;
    return client.dataverseDelete(uri);
  };
  const step = async (id) => get(`/api/data/v9.2/sdkmessageprocessingsteps(${id})?$select=sdkmessageprocessingstepid,name,statecode,statuscode,stage,mode,rank`);
  const setStepState = async (id, statecode) => {
    await patch(`/api/data/v9.2/sdkmessageprocessingsteps(${id})`, { statecode });
    return step(id);
  };
  const actualSet = "aigw_actualmanagements";
  const opportunitySet = "opportunities";
  const currencySet = "transactioncurrencies";
  let bindings;
  let createdActualIds = [];
  let createdOpportunityIds = [];
  let group1Attempted = false;
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
    if (bindings.opportunity.entitySetName !== opportunitySet) throw new Error("Opportunity EntitySetName safety assertion failed.");
    if (bindings.actualManagement.entitySetName !== actualSet) throw new Error("Actual Management EntitySetName safety assertion failed.");
    if (bindings.transactionCurrency.entitySetName !== currencySet) throw new Error("Transaction currency EntitySetName safety assertion failed.");
    const [cnyRows, jpyRows, orgRows, markerOppsRaw, markerActualsRaw, assemblyRows] = await Promise.all([
      get(`/api/data/v9.2/${currencySet}?$select=transactioncurrencyid,isocurrencycode,statecode&$filter=isocurrencycode eq 'CNY'`),
      get(`/api/data/v9.2/${currencySet}?$select=transactioncurrencyid,isocurrencycode,statecode,currencyprecision,exchangerate&$filter=isocurrencycode eq 'JPY'`),
      get("/api/data/v9.2/organizations?$select=_basecurrencyid_value"),
      get(`/api/data/v9.2/${opportunitySet}?$select=opportunityid,name&$filter=startswith(name,'${MARKER}')`),
      get(`/api/data/v9.2/${actualSet}?$select=aigw_actualmanagementid,aigw_name&$filter=startswith(aigw_name,'${MARKER}')`),
      get("/api/data/v9.2/pluginassemblies?$select=pluginassemblyid,name,publickeytoken&$filter=name eq 'CrmAiGateway.ActualTotals.Plugin'"),
    ]);
    const cny = cnyRows.value || [];
    const jpy = jpyRows.value || [];
    const markerOppScan = resolveLiteralMarkerRecords(markerOppsRaw.value || [], MARKER);
    const markerActualScan = resolveLiteralMarkerRecords((markerActualsRaw.value || []).map((row) => ({ ...row, name: row.aigw_name })), MARKER);
    const markerOpps = { ...markerOppsRaw, value: markerOppScan.literalRecords };
    const markerActuals = { ...markerActualsRaw, value: markerActualScan.literalRecords };
    const cnyId = cny[0]?.transactioncurrencyid;
    const jpyId = jpy[0]?.transactioncurrencyid;
    audit.metadata.currencies = { cnyCount: cny.length, jpyCount: jpy.length, cnyBaseMatches: orgRows.value?.[0]?._basecurrencyid_value === cnyId, jpyActive: jpy.length === 1 && jpy[0].statecode === 0, jpyPrecision: jpy[0]?.currencyprecision ?? null, jpyExchangeRate: jpy[0]?.exchangerate ?? null };
    const assemblies = assemblyRows.value || [];
    const typeRows = assemblies.length === 1 ? await get(`/api/data/v9.2/plugintypes?$select=plugintypeid,typename&$filter=_pluginassemblyid_value eq ${assemblies[0].pluginassemblyid}`) : { value: [] };
    const typeIds = typeRows.value || [];
    const stepRows = [];
    for (const type of typeIds) stepRows.push(...((await get(`/api/data/v9.2/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,statecode,stage,mode,rank,_plugintypeid_value&$filter=_plugintypeid_value eq ${type.plugintypeid}`)).value || []));
    const before = await Promise.all(ALL_STEPS.map((id) => step(id)));
    const targetImageFilter = ALL_STEPS.map((id) => `_sdkmessageprocessingstepid_value eq ${id}`).join(" or ");
    const imageRows = await get(`/api/data/v9.2/sdkmessageprocessingstepimages?$select=sdkmessageprocessingstepimageid,_sdkmessageprocessingstepid_value&$filter=${targetImageFilter}`);
    audit.steps.before = before;
    audit.metadata.componentCounts = { assembly: assemblies.length, pluginTypes: typeIds.length, steps: stepRows.length, images: (imageRows.value || []).length };
    audit.metadata.markerServerCandidateCounts = { opportunities: markerOppsRaw.value?.length || 0, actuals: markerActualsRaw.value?.length || 0 };
    audit.metadata.markerExactCounts = { opportunities: markerOpps.value.length, actuals: markerActuals.value.length };
    audit.metadata.markerRejectedCandidateCounts = { opportunities: markerOppScan.rejectedCandidateCount, actuals: markerActualScan.rejectedCandidateCount };
    audit.metadata.markerGatePassed = markerOppScan.literalMatchCount === 0 && markerActualScan.literalMatchCount === 0;
    const preflightReady = audit.metadata.currencies.cnyBaseMatches && audit.metadata.currencies.jpyActive && audit.metadata.currencies.jpyPrecision === 0 && Number(audit.metadata.currencies.jpyExchangeRate) === 20 && assemblies.length === 1 && typeIds.length === 3 && stepRows.length === 7 && (imageRows.value || []).length === 6 && before.every((item) => item.statecode === 1) && markerOpps.value.length === 0 && markerActuals.value.length === 0;
    if (!preflightReady) throw new Error(`Preflight blocked: ${JSON.stringify({ currencies: audit.metadata.currencies, componentCounts: audit.metadata.componentCounts, allStepsDisabled: before.every((item) => item.statecode === 1), markerServerCandidates: audit.metadata.markerServerCandidateCounts, markerExact: audit.metadata.markerExactCounts })}`);
    group1Attempted = true;
    for (const id of GROUP1) {
      const after = await setStepState(id, 0);
      audit.steps.enablement.push(after);
      if (after.statecode !== 0) throw new Error(`Group 1 step ${id} did not become enabled.`);
    }
    audit.steps.afterEnablement = await Promise.all(ALL_STEPS.map((id) => step(id)));
    if (audit.steps.afterEnablement.filter((item) => item.statecode === 0).length !== 2) throw new Error("Unexpected enabled step count before smoke tests.");
    const opportunityPayload = (name, currencyId) => {
      const payload = { name };
      Object.assign(payload, buildLookupBind(bindings.opportunity.transactionCurrencyLookup, currencyId));
      if (Object.keys(payload).some((key) => key === "transactioncurrencyid@odata.bind") && bindings.opportunity.transactionCurrencyLookup.navigationPropertyName !== "transactioncurrencyid") {
        throw new Error("Currency bind key did not come from metadata as expected.");
      }
      return payload;
    };
    const actualPayload = (name, opportunityId, currencyId, includeOpportunity = true) => {
      const payload = { aigw_name: name, aigw_aprilactualrevenue: 100 };
      if (includeOpportunity) Object.assign(payload, buildLookupBind(bindings.actualManagement.opportunityLookup, opportunityId));
      Object.assign(payload, buildLookupBind(bindings.actualManagement.transactionCurrencyLookup, currencyId));
      assertBusinessPayload(payload, bindings, { requireOpportunity: includeOpportunity });
      return payload;
    };
    const createOpportunity = async (name, currencyId) => {
      const response = await post(`/api/data/v9.2/${bindings.opportunity.entitySetName}`, opportunityPayload(name, currencyId));
      const id = responseId(response, "opportunity");
      createdOpportunityIds.push(id);
      const row = await get(`/api/data/v9.2/${bindings.opportunity.entitySetName}(${id})?$select=opportunityid,name,_transactioncurrencyid_value`);
      if (row.name !== name || row._transactioncurrencyid_value?.toLowerCase() !== currencyId.toLowerCase() || !row.name.startsWith(MARKER)) throw new Error("Synthetic Opportunity read-after-write verification failed.");
      audit.synthetic.opportunities.push({ id, name, currencyId });
      return id;
    };
    const createActual = async (name, opportunityId, currencyId, includeOpportunity = true) => {
      const payload = actualPayload(name, opportunityId, currencyId, includeOpportunity);
      const response = await post(`/api/data/v9.2/${bindings.actualManagement.entitySetName}`, payload);
      const id = responseId(response, "aigw_actualmanagement");
      createdActualIds.push(id);
      audit.synthetic.actuals.push({ id, name });
      return id;
    };
    const expectBlocked = async (name, action, expectedMessage) => {
      try {
        await action();
        audit.tests.push({ name, passed: false, expectedBusinessRule: expectedMessage, actual: "operation unexpectedly succeeded" });
        throw new Error(`${name} was not blocked by the expected Plugin rule.`);
      } catch (error) {
        if (error.message === `${name} was not blocked by the expected Plugin rule.`) throw error;
        const result = classifyError(error, expectedMessage);
        audit.tests.push({ name, ...result });
        if (!result.passed) throw new Error(`${name} did not reach the expected Plugin validation: ${result.sanitizedMessage}`);
      }
    };
    const a = await createOpportunity(`${MARKER} DEMO-A-CNY`, cnyId);
    const b = await createOpportunity(`${MARKER} DEMO-B-CNY`, cnyId);
    const c = await createOpportunity(`${MARKER} DEMO-C-JPY`, jpyId);
    const childA = await createActual(`${MARKER}-ACTUAL-A`, a, cnyId);
    audit.tests.push({ name: "Test 1 normal Create", passed: true, recordId: childA, expected: "success" });
    await expectBlocked("Test 2 missing Opportunity Lookup", () => createActual(`${MARKER}-ACTUAL-MISSING`, a, cnyId, false), "Actual Management requires an Opportunity lookup.");
    await expectBlocked("Test 3 duplicate Create", () => createActual(`${MARKER}-ACTUAL-DUPLICATE`, a, cnyId), "Each Opportunity may have at most one Actual Management record.");
    await expectBlocked("Test 4 Create currency mismatch", () => createActual(`${MARKER}-ACTUAL-MISMATCH`, c, cnyId), "Actual Management currency must match the related Opportunity currency.");
    const parentBefore = await get(`/api/data/v9.2/${bindings.opportunity.entitySetName}(${a})?$select=aigw_yearrevenueactual`);
    const childBefore = await get(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childA})?$select=aigw_annualactualrevenue`);
    await patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childA})`, { aigw_aprilactualrevenue: 123.45 });
    const childAfter = await get(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childA})?$select=aigw_annualactualrevenue`);
    const parentAfter = await get(`/api/data/v9.2/${bindings.opportunity.entitySetName}(${a})?$select=aigw_yearrevenueactual`);
    if (childAfter.aigw_annualactualrevenue !== childBefore.aigw_annualactualrevenue || parentAfter.aigw_yearrevenueactual !== parentBefore.aigw_yearrevenueactual) throw new Error("Totals changed while only PreValidation steps were enabled.");
    audit.tests.push({ name: "Test 5 legal Update", passed: true, parentTotalUnchanged: true, childAnnualUnchanged: true });
    await patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childA})`, buildLookupBind(bindings.actualManagement.opportunityLookup, b));
    audit.tests.push({ name: "Test 6 legal Reparent", passed: true, targetOpportunityId: b });
    const childA2 = await createActual(`${MARKER}-ACTUAL-A2`, a, cnyId);
    await expectBlocked("Test 7 conflicting Reparent", () => patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childA2})`, buildLookupBind(bindings.actualManagement.opportunityLookup, b)), "Each Opportunity may have at most one Actual Management record.");
    await expectBlocked("Test 8 Update currency mismatch", () => patch(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${childA2})`, buildLookupBind(bindings.actualManagement.transactionCurrencyLookup, jpyId)), "Actual Management currency must match the related Opportunity currency.");
    audit.tests.push({ name: "Payload schema regression", passed: true, oldIncorrectLookupKeyPresent: false, createPayloadLookupKey: `${bindings.actualManagement.opportunityLookup.navigationPropertyName}@odata.bind` });
    for (const id of createdActualIds) {
      try { await remove(`/api/data/v9.2/${bindings.actualManagement.entitySetName}(${id})`); audit.cleanup.deletedActualIds.push(id); } catch (error) { audit.cleanup.errors.push({ type: "actual", id, message: error.message }); }
    }
    for (const id of createdOpportunityIds) {
      try { await remove(`/api/data/v9.2/${bindings.opportunity.entitySetName}(${id})`); audit.cleanup.deletedOpportunityIds.push(id); } catch (error) { audit.cleanup.errors.push({ type: "opportunity", id, message: error.message }); }
    }
    const remainingOppsRaw = await get(`/api/data/v9.2/${bindings.opportunity.entitySetName}?$select=opportunityid,name&$filter=startswith(name,'${MARKER}')`);
    const remainingActualsRaw = await get(`/api/data/v9.2/${bindings.actualManagement.entitySetName}?$select=aigw_actualmanagementid,aigw_name&$filter=startswith(aigw_name,'${MARKER}')`);
    const remainingOppScan = resolveLiteralMarkerRecords(remainingOppsRaw.value || [], MARKER);
    const remainingActualScan = resolveLiteralMarkerRecords((remainingActualsRaw.value || []).map((row) => ({ ...row, name: row.aigw_name })), MARKER);
    const remainingOpps = { ...remainingOppsRaw, value: remainingOppScan.literalRecords };
    const remainingActuals = { ...remainingActualsRaw, value: remainingActualScan.literalRecords };
    if ((remainingOpps.value || []).length || (remainingActuals.value || []).length || audit.cleanup.errors.length) throw new Error("Synthetic cleanup did not reach zero.");
    audit.steps.after = await Promise.all(ALL_STEPS.map((id) => step(id)));
    if (audit.steps.after.filter((item) => item.statecode === 0).length !== 2 || audit.steps.after.filter((item) => item.statecode === 1).length !== 5) throw new Error("Final Group 1 step state mismatch.");
    audit.cleanup.remainingOpportunities = remainingOpps.value?.length || 0;
    audit.cleanup.remainingActuals = remainingActuals.value?.length || 0;
    audit.finalDecision = "Group 1 Validation Ready=true";
    audit.completedAt = stamp();
    await writeAudit();
    console.log(JSON.stringify({ audit: file, navigationProperty: bindings.actualManagement.opportunityLookup.navigationPropertyName, entitySetName: bindings.opportunity.entitySetName, tests: audit.tests, finalStepState: audit.steps.after, requestCounts: audit.requestCounts, finalDecision: audit.finalDecision }, null, 2));
  } catch (error) {
    audit.error = { message: error.message, stack: error.stack };
    try {
      if (group1Attempted) {
        for (const id of GROUP1) await setStepState(id, 1);
        audit.rollback = { group1Disabled: true, finalStates: await Promise.all(ALL_STEPS.map((id) => step(id))) };
      } else {
        audit.rollback = { group1Disabled: false, writesBeforeFailure: 0 };
      }
    } catch (rollbackError) {
      audit.rollback = { group1Disabled: false, error: rollbackError.message };
    }
    for (const id of createdActualIds) {
      try { await remove(`/api/data/v9.2/${bindings?.actualManagement?.entitySetName || actualSet}(${id})`); audit.cleanup.deletedActualIds.push(id); } catch (cleanupError) { audit.cleanup.errors.push({ type: "actual", id, message: cleanupError.message }); }
    }
    for (const id of createdOpportunityIds) {
      try { await remove(`/api/data/v9.2/${bindings?.opportunity?.entitySetName || opportunitySet}(${id})`); audit.cleanup.deletedOpportunityIds.push(id); } catch (cleanupError) { audit.cleanup.errors.push({ type: "opportunity", id, message: cleanupError.message }); }
    }
    audit.finalDecision = "Group 1 Validation Ready=false";
    audit.completedAt = stamp();
    await writeAudit();
    throw error;
  }
}

runDataverseCli(import.meta.url, main);
