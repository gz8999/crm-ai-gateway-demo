import fs from "node:fs/promises";
import path from "node:path";
import {
  D365_FROZEN_DATASET_PATH,
  D365_FROZEN_EXPECTED_COUNTS,
  assertFrozenEnvironment,
  buildFrozenManifestEntries,
} from "./frozenDatasetContract.mjs";
import { normalizeId } from "../pilot/pilotContract.mjs";

const CUSTOM_ENTITIES = ["aigw_actualmanagement", "aigw_customerservicecoverage", "aigw_interactionsignal", "aigw_ai_demo_full_replica"];
const BATCH_SIZE = 25;
const DEFAULT_READ_CONCURRENCY = 4;
const MAX_READ_CONCURRENCY = 6;
const ACTUAL_MONTHS = ["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"];

export function createFrozenDatasetReader({ client, env = process.env, root = process.cwd(), now = () => new Date(), startupDiagnostics = null } = {}) {
  if (!client?.dataverseGet || !client?.config) throw new TypeError("A configured Dataverse client is required.");
  const host = assertFrozenEnvironment(client.config, env);
  const requestStats = { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, ProductionRequests: 0, ExternalLLMCalls: 0, CRMWrites: 0 };
  const limit = createRequestLimiter(resolveReadConcurrency(env));

  async function get(endpoint) {
    return limit(async () => {
      const url = new URL(endpoint, `${client.config.dataverseUrl}/`);
      if (url.hostname.toLowerCase() !== host) {
        requestStats.ProductionRequests += 1;
        throw new Error("D365 Frozen Dataset request host is not allowed.");
      }
      requestStats.GET += 1;
      startupDiagnostics?.d365Get();
      return (await client.dataverseGet(endpoint)).body;
    });
  }

  async function getAll(endpoint) {
    const rows = [];
    let next = endpoint;
    while (next) {
      const body = await get(next);
      rows.push(...(body.value || []));
      next = body["@odata.nextLink"] || "";
    }
    return rows;
  }

  async function fetchByIds({ entitySet, idField, ids, select }) {
    const batches = await Promise.all(chunks(ids, BATCH_SIZE).map(async (group) => {
      const filter = group.map((id) => `${idField} eq ${normalizeId(id)}`).join(" or ");
      return getAll(`/api/data/v9.2/${entitySet}?$select=${select.join(",")}&$filter=${encodeURIComponent(filter)}`);
    }));
    return batches.flat();
  }

  async function fetchByParentIds({ entitySet, parentField, ids, select }) {
    const batches = await Promise.all(chunks(ids, BATCH_SIZE).map(async (group) => {
      const filter = group.map((id) => `${parentField} eq ${normalizeId(id)}`).join(" or ");
      return getAll(`/api/data/v9.2/${entitySet}?$select=${select.join(",")}&$filter=${encodeURIComponent(filter)}`);
    }));
    return batches.flat();
  }

  async function read() {
    const manifest = JSON.parse(await fs.readFile(path.join(root, D365_FROZEN_DATASET_PATH), "utf8"));
    const entries = buildFrozenManifestEntries(manifest);
    const metadataEntries = await Promise.all(CUSTOM_ENTITIES.map(async (logicalName) => [logicalName, await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')?$select=LogicalName,EntitySetName,PrimaryIdAttribute`)]));
    const metadata = Object.fromEntries(metadataEntries);
    const opportunityIds = entries.Opportunity.map((item) => item.id);
    const annotationEntries = entries.Timeline.filter((item) => item.isAnnotation);
    const activityEntries = entries.Timeline.filter((item) => !item.isAnnotation);
    const [opportunities, accounts, contacts, actuals, coverages, signals, activityRows, annotationRows, closes, bpfRows] = await Promise.all([
      fetchByIds({
      entitySet: "opportunities", idField: "opportunityid", ids: entries.Opportunity.map((item) => item.id),
      select: [
        "opportunityid", "name", "statecode", "statuscode", "actualclosedate", "actualvalue", "estimatedvalue", "estimatedclosedate", "closeprobability",
        "_parentaccountid_value", "_parentcontactid_value", "_ownerid_value", "aigw_salesdepartment_choice", "aigw_casestage", "aigw_priority_choice",
        "aigw_winprobabilityrank", "aigw_budgetstatus", "aigw_yearrevenuebudget", "aigw_yeargpmpbudget", "aigw_yearrevenueactual",
        "aigw_nextaction", "aigw_nextactiondate", "aigw_transportmode", "aigw_customerneed_choice", "aigw_proposalcontent_choice",
        "aigw_researchbackground_choice", "aigw_decider_choice", "aigw_startdate", "aigw_opportunitytype", "aigw_opportunitydetailtype",
        "description", "createdon", "aigw_customernamecn", "aigw_tradeterms", "aigw_goodshandled", "aigw_projectsizeunit", "aigw_warehousescale", "aigw_opportunityrelationship", "aigw_opportunityplace", "aigw_spotcontinuous", "aigw_globalinitiative", "aigw_alpscooperation",
        "_aigw_opportunitylocation_value", "_aigw_sealandpollookup_value", "_aigw_sealandpodlookup_value", "_aigw_airpollookup_value", "_aigw_airpodlookup_value",
      ],
      }),
      fetchByIds({ entitySet: "accounts", idField: "accountid", ids: entries.Account.map((item) => item.id), select: ["accountid", "accountnumber", "name", "industrycode", "websiteurl", "telephone1", "address1_line1", "address1_city", "address1_postalcode", "createdon"] }),
      fetchByIds({ entitySet: "contacts", idField: "contactid", ids: entries.Contact.map((item) => item.id), select: ["contactid", "fullname", "jobtitle", "emailaddress1", "telephone1", "address1_line1", "address1_city", "address1_postalcode", "_parentcustomerid_value", "createdon"] }),
      fetchByIds({
      entitySet: metadata.aigw_actualmanagement.EntitySetName, idField: metadata.aigw_actualmanagement.PrimaryIdAttribute, ids: entries.ActualManagement.map((item) => item.id),
      select: [metadata.aigw_actualmanagement.PrimaryIdAttribute, "_aigw_opportunityid_value", "aigw_annualactualrevenue", ...ACTUAL_MONTHS.flatMap((month) => [`aigw_${month}actualrevenue`, `aigw_${month}actualgp`]), "modifiedon"],
      }),
      fetchByIds({
      entitySet: metadata.aigw_customerservicecoverage.EntitySetName, idField: metadata.aigw_customerservicecoverage.PrimaryIdAttribute, ids: entries.ServiceCoverage.map((item) => item.id),
      select: [metadata.aigw_customerservicecoverage.PrimaryIdAttribute, "_aigw_accountid_value", "aigw_servicetype", "aigw_coveragestatus", "aigw_startdate", "aigw_enddate", "_aigw_responsibledepartment_value", "aigw_nextopportunitywindow", "aigw_revenueband", "aigw_marginband", "aigw_servicesatisfaction", "aigw_lastproposaldate", "modifiedon"],
      }),
      fetchByIds({
      entitySet: metadata.aigw_interactionsignal.EntitySetName, idField: metadata.aigw_interactionsignal.PrimaryIdAttribute, ids: entries.InteractionSignal.map((item) => item.id),
      select: [metadata.aigw_interactionsignal.PrimaryIdAttribute, "_aigw_accountid_value", "_aigw_opportunityid_value", "aigw_sourceactivitytoken", "aigw_activitydate", "aigw_activitytype", "aigw_direction", "aigw_resultcategory", "aigw_nextstep", "aigw_budgetmentioned", "aigw_decisionmakerinvolved", "aigw_objectionpresent", "aigw_objectioncategory", "aigw_competitormentioned", "aigw_commitmentmade", "aigw_commitmentduedate", "aigw_commitmentcompleted", "aigw_customerresponselevel", "aigw_sentiment", "aigw_serviceissuecategory", "aigw_issueresolved", "_aigw_salesdepartment_value", "modifiedon"],
      }),
      fetchByIds({ entitySet: "activitypointers", idField: "activityid", ids: activityEntries.map((item) => item.id), select: ["activityid", "activitytypecode", "subject", "description", "_regardingobjectid_value", "scheduledstart", "scheduledend", "actualstart", "actualend", "statecode", "statuscode", "modifiedon"] }),
      fetchByIds({ entitySet: "annotations", idField: "annotationid", ids: annotationEntries.map((item) => item.id), select: ["annotationid", "subject", "notetext", "_objectid_value", "createdon", "overriddencreatedon", "isdocument", "modifiedon"] }),
      fetchByParentIds({ entitySet: "opportunitycloses", parentField: "_opportunityid_value", ids: opportunityIds, select: ["activityid", "_opportunityid_value", "actualend", "statecode", "statuscode"] }),
      fetchByParentIds({ entitySet: metadata.aigw_ai_demo_full_replica.EntitySetName, parentField: "_bpf_opportunityid_value", ids: opportunityIds, select: [metadata.aigw_ai_demo_full_replica.PrimaryIdAttribute, "_bpf_opportunityid_value", "_activestageid_value", "traversedpath", "statecode", "statuscode", "modifiedon"] }),
    ]);

    assertCounts({ accounts, contacts, opportunities, actuals, coverages, timeline: [...activityRows, ...annotationRows], signals, closes, bpfRows });
    assertRelations({ entries, accounts, contacts, opportunities, actuals, coverages, signals, activityRows, annotationRows, closes, bpfRows, bpfIdAttribute: metadata.aigw_ai_demo_full_replica.PrimaryIdAttribute });
    return { loadedAt: now().toISOString(), host, entries, accounts, contacts, opportunities, actuals, coverages, signals, timeline: { activities: activityRows, annotations: annotationRows }, closes, bpfRows, requestStats: { ...requestStats } };
  }

  return { read, requestStats };
}

function chunks(values, size) { const result = []; for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size)); return result; }

function resolveReadConcurrency(env) {
  const value = Number(env.FROZEN_DATASET_READ_CONCURRENCY || DEFAULT_READ_CONCURRENCY);
  return Number.isInteger(value) ? Math.min(Math.max(value, 1), MAX_READ_CONCURRENCY) : DEFAULT_READ_CONCURRENCY;
}

export function createRequestLimiter(concurrency) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new TypeError("Frozen Dataset request concurrency must be a positive integer.");
  let active = 0;
  const queue = [];
  const drain = () => {
    while (active < concurrency && queue.length) {
      active += 1;
      const next = queue.shift();
      Promise.resolve()
        .then(next.load)
        .then(next.resolve, next.reject)
        .finally(() => { active -= 1; drain(); });
    }
  };
  return (load) => new Promise((resolve, reject) => { queue.push({ load, resolve, reject }); drain(); });
}

function assertCounts({ accounts, contacts, opportunities, actuals, coverages, timeline, signals, closes, bpfRows }) {
  const actual = { account: accounts.length, contact: contacts.length, opportunity: opportunities.length, actual: actuals.length, coverage: coverages.length, timeline: timeline.length, signal: signals.length, opportunityClose: closes.length, bpf: bpfRows.length };
  for (const [key, expected] of Object.entries(D365_FROZEN_EXPECTED_COUNTS)) if (actual[key] !== expected) throw new Error(`Frozen ${key} readback is incomplete: expected ${expected}, found ${actual[key]}.`);
}

function assertRelations({ entries, accounts, contacts, opportunities, actuals, coverages, signals, activityRows, annotationRows, closes, bpfRows, bpfIdAttribute }) {
  const accountIds = new Set(accounts.map((row) => normalizeId(row.accountid)));
  const opportunityIds = new Set(opportunities.map((row) => normalizeId(row.opportunityid)));
  const timelineTokens = new Set(entries.Timeline.map((item) => item.token));
  if (accountIds.size !== accounts.length || opportunityIds.size !== opportunities.length) throw new Error("Frozen parent records are not unique.");
  if (contacts.some((row) => !accountIds.has(normalizeId(row._parentcustomerid_value)))) throw new Error("Frozen Contact parent mapping failed.");
  const actualParents = actuals.map((row) => normalizeId(row._aigw_opportunityid_value));
  if (actualParents.some((id) => !opportunityIds.has(id)) || new Set(actualParents).size !== actualParents.length) throw new Error("Frozen Actual uniqueness or parent mapping failed.");
  if (coverages.some((row) => !accountIds.has(normalizeId(row._aigw_accountid_value)))) throw new Error("Frozen Coverage parent mapping failed.");
  if (signals.some((row) => !opportunityIds.has(normalizeId(row._aigw_opportunityid_value)) || !accountIds.has(normalizeId(row._aigw_accountid_value)) || !timelineTokens.has(String(row.aigw_sourceactivitytoken || "")))) throw new Error("Frozen Interaction Signal source mapping failed.");
  if (activityRows.some((row) => !opportunityIds.has(normalizeId(row._regardingobjectid_value))) || annotationRows.some((row) => !opportunityIds.has(normalizeId(row._objectid_value)))) throw new Error("Frozen Timeline parent mapping failed.");
  if (closes.some((row) => !opportunityIds.has(normalizeId(row._opportunityid_value)))) throw new Error("Frozen OpportunityClose parent mapping failed.");
  const bpfParents = bpfRows.map((row) => normalizeId(row._bpf_opportunityid_value));
  if (bpfParents.some((id) => !opportunityIds.has(id)) || new Set(bpfParents).size !== opportunityIds.size) throw new Error("Frozen BPF uniqueness or parent mapping failed.");
  const expectedBpfIds = new Set(entries.Opportunity.map((item) => item.bpfId));
  if (bpfRows.some((row) => !expectedBpfIds.has(normalizeId(row[bpfIdAttribute])))) throw new Error("Frozen BPF allowlist contains an unexpected instance.");
}
