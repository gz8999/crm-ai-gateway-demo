import fs from "node:fs/promises";
import path from "node:path";
import {
  PILOT_EXPECTED_COUNTS,
  PILOT_PRIVATE_MANIFEST_PATH,
  PILOT_SELECTION_PATH,
  assertPilotEnvironment,
  normalizeId,
} from "./pilotContract.mjs";

const CUSTOM_ENTITIES = ["aigw_actualmanagement", "aigw_customerservicecoverage", "aigw_interactionsignal", "aigw_ai_demo_full_replica"];
const BATCH_SIZE = 25;
const ACTUAL_MONTHS = ["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"];

export function createPilotDataverseReader({ client, env = process.env, root = process.cwd(), now = () => new Date() } = {}) {
  if (!client?.dataverseGet || !client?.config) throw new TypeError("A configured Dataverse client is required.");
  const host = assertPilotEnvironment(client.config, env);
  const requestStats = { GET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0, ProductionRequests: 0, ExternalLLMCalls: 0, CRMWrites: 0 };

  async function get(endpoint) {
    const url = new URL(endpoint, `${client.config.dataverseUrl}/`);
    if (url.hostname.toLowerCase() !== host) {
      requestStats.ProductionRequests += 1;
      throw new Error("D365 Pilot request host is not allowed.");
    }
    requestStats.GET += 1;
    return (await client.dataverseGet(endpoint)).body;
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
    const rows = [];
    for (const group of chunks(ids, BATCH_SIZE)) {
      const filter = group.map((id) => `${idField} eq ${normalizeId(id)}`).join(" or ");
      rows.push(...await getAll(`/api/data/v9.2/${entitySet}?$select=${select.join(",")}&$filter=${encodeURIComponent(filter)}`));
    }
    return rows;
  }

  async function fetchByParentIds({ entitySet, parentField, ids, select }) {
    const rows = [];
    for (const group of chunks(ids, BATCH_SIZE)) {
      const filter = group.map((id) => `${parentField} eq ${normalizeId(id)}`).join(" or ");
      rows.push(...await getAll(`/api/data/v9.2/${entitySet}?$select=${select.join(",")}&$filter=${encodeURIComponent(filter)}`));
    }
    return rows;
  }

  async function read() {
    const selection = JSON.parse(await fs.readFile(path.join(root, PILOT_SELECTION_PATH), "utf8"));
    const manifest = JSON.parse(await fs.readFile(path.join(root, PILOT_PRIVATE_MANIFEST_PATH), "utf8"));
    const entries = buildManifestEntries(selection, manifest);
    const metadata = {};
    for (const logicalName of CUSTOM_ENTITIES) {
      const body = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')?$select=LogicalName,EntitySetName,PrimaryIdAttribute`);
      metadata[logicalName] = body;
    }

    const opportunities = await fetchByIds({
      entitySet: "opportunities",
      idField: "opportunityid",
      ids: entries.Opportunity.map((item) => item.id),
      select: [
        "opportunityid", "name", "statecode", "statuscode", "actualclosedate", "actualvalue", "estimatedvalue", "estimatedclosedate", "closeprobability",
        "_parentaccountid_value", "_parentcontactid_value", "aigw_salesdepartment_choice", "aigw_casestage", "aigw_priority_choice",
        "aigw_winprobabilityrank", "aigw_budgetstatus", "aigw_yearrevenuebudget", "aigw_yeargpmpbudget", "aigw_yearrevenueactual",
        "aigw_nextaction", "aigw_nextactiondate", "aigw_transportmode", "aigw_customerneed_choice", "aigw_proposalcontent_choice",
        "aigw_researchbackground_choice", "aigw_decider_choice", "aigw_startdate", "aigw_opportunitytype", "aigw_opportunitydetailtype",
        "_aigw_opportunitylocation_value", "_aigw_sealandpollookup_value", "_aigw_sealandpodlookup_value", "_aigw_airpollookup_value", "_aigw_airpodlookup_value",
      ],
    });
    const accounts = await fetchByIds({ entitySet: "accounts", idField: "accountid", ids: entries.Account.map((item) => item.id), select: ["accountid", "name", "industrycode", "createdon"] });
    const contacts = await fetchByIds({ entitySet: "contacts", idField: "contactid", ids: entries.Contact.map((item) => item.id), select: ["contactid", "jobtitle", "_parentcustomerid_value", "createdon"] });
    const actuals = await fetchByIds({
      entitySet: metadata.aigw_actualmanagement.EntitySetName,
      idField: metadata.aigw_actualmanagement.PrimaryIdAttribute,
      ids: entries.ActualManagement.map((item) => item.id),
      select: [
        metadata.aigw_actualmanagement.PrimaryIdAttribute, "_aigw_opportunityid_value", "aigw_annualactualrevenue",
        ...ACTUAL_MONTHS.flatMap((month) => [`aigw_${month}actualrevenue`, `aigw_${month}actualgp`]),
        "modifiedon",
      ],
    });
    const coverages = await fetchByIds({
      entitySet: metadata.aigw_customerservicecoverage.EntitySetName,
      idField: metadata.aigw_customerservicecoverage.PrimaryIdAttribute,
      ids: entries.ServiceCoverage.map((item) => item.id),
      select: [
        metadata.aigw_customerservicecoverage.PrimaryIdAttribute, "_aigw_accountid_value", "aigw_servicetype", "aigw_coveragestatus",
        "aigw_startdate", "aigw_enddate", "_aigw_responsibledepartment_value", "aigw_nextopportunitywindow", "aigw_revenueband",
        "aigw_marginband", "aigw_servicesatisfaction", "aigw_lastproposaldate", "modifiedon",
      ],
    });
    const signals = await fetchByIds({
      entitySet: metadata.aigw_interactionsignal.EntitySetName,
      idField: metadata.aigw_interactionsignal.PrimaryIdAttribute,
      ids: entries.InteractionSignal.map((item) => item.id),
      select: [
        metadata.aigw_interactionsignal.PrimaryIdAttribute, "_aigw_accountid_value", "_aigw_opportunityid_value", "aigw_sourceactivitytoken",
        "aigw_activitydate", "aigw_activitytype", "aigw_direction", "aigw_resultcategory", "aigw_nextstep", "aigw_budgetmentioned",
        "aigw_decisionmakerinvolved", "aigw_objectionpresent", "aigw_objectioncategory", "aigw_competitormentioned", "aigw_commitmentmade",
        "aigw_commitmentduedate", "aigw_commitmentcompleted", "aigw_customerresponselevel", "aigw_sentiment", "aigw_serviceissuecategory",
        "aigw_issueresolved", "_aigw_salesdepartment_value", "modifiedon",
      ],
    });
    const annotationEntries = entries.Timeline.filter((item) => item.isAnnotation);
    const activityEntries = entries.Timeline.filter((item) => !item.isAnnotation);
    const activityRows = await fetchByIds({
      entitySet: "activitypointers", idField: "activityid", ids: activityEntries.map((item) => item.id),
      select: ["activityid", "activitytypecode", "subject", "description", "_regardingobjectid_value", "scheduledstart", "scheduledend", "actualstart", "actualend", "statecode", "statuscode", "modifiedon"],
    });
    const annotationRows = await fetchByIds({
      entitySet: "annotations", idField: "annotationid", ids: annotationEntries.map((item) => item.id),
      select: ["annotationid", "subject", "notetext", "_objectid_value", "createdon", "overriddencreatedon", "isdocument", "modifiedon"],
    });
    const opportunityIds = entries.Opportunity.map((item) => item.id);
    const closes = await fetchByParentIds({
      entitySet: "opportunitycloses", parentField: "_opportunityid_value", ids: opportunityIds,
      select: ["activityid", "_opportunityid_value", "actualend", "statecode", "statuscode"],
    });
    const bpfIds = entries.Opportunity.map((item) => item.bpfId);
    const bpfRows = await fetchByIds({
      entitySet: metadata.aigw_ai_demo_full_replica.EntitySetName,
      idField: metadata.aigw_ai_demo_full_replica.PrimaryIdAttribute,
      ids: bpfIds,
      select: [metadata.aigw_ai_demo_full_replica.PrimaryIdAttribute, "_bpf_opportunityid_value", "_activestageid_value", "traversedpath", "statecode", "statuscode", "modifiedon"],
    });

    assertCount("Account", accounts, PILOT_EXPECTED_COUNTS.account);
    assertCount("Contact", contacts, PILOT_EXPECTED_COUNTS.contact);
    assertCount("Opportunity", opportunities, PILOT_EXPECTED_COUNTS.opportunity);
    assertCount("Actual", actuals, PILOT_EXPECTED_COUNTS.actual);
    assertCount("Coverage", coverages, PILOT_EXPECTED_COUNTS.coverage);
    assertCount("Timeline", [...activityRows, ...annotationRows], PILOT_EXPECTED_COUNTS.timeline);
    assertCount("Signal", signals, PILOT_EXPECTED_COUNTS.signal);
    assertCount("OpportunityClose", closes, PILOT_EXPECTED_COUNTS.opportunityClose);
    assertCount("BPF", bpfRows, PILOT_EXPECTED_COUNTS.bpf);
    assertRelations({ entries, accounts, contacts, opportunities, actuals, coverages, signals, activityRows, annotationRows, closes, bpfRows });

    return {
      loadedAt: now().toISOString(), host, entries, accounts, contacts, opportunities, actuals, coverages, signals,
      timeline: { activities: activityRows, annotations: annotationRows }, closes, bpfRows,
      requestStats: { ...requestStats },
    };
  }

  return { read, requestStats };
}

export function buildManifestEntries(selection, manifest) {
  const expectedTokens = {
    Account: selection.accountTokens || [], Contact: selection.contactTokens || [], Opportunity: selection.opportunityTokens || [],
    ActualManagement: selection.actualTokens || [], ServiceCoverage: selection.coverageTokens || [], Timeline: selection.timelineTokens || [],
    InteractionSignal: selection.signalTokens || [],
  };
  const entries = Object.fromEntries(Object.keys(expectedTokens).map((entity) => [entity, []]));
  for (const [key, record] of Object.entries(manifest.records || {})) {
    if (!entries[record.entity]) continue;
    const token = record.stableToken || key.slice(key.indexOf(":") + 1);
    entries[record.entity].push({
      token, id: normalizeId(record.exactRecordId), parentId: normalizeId(record.parentRecordId),
      bpfId: normalizeId(record.targetBpfInstanceExactId), bpfStage: record.activeStageAlias || "",
      isAnnotation: record.entity === "Timeline" && Boolean(record.readbackEvidence?.annotationid),
    });
  }
  for (const [entity, tokens] of Object.entries(expectedTokens)) {
    const actualTokens = entries[entity].map((item) => item.token).sort();
    if (actualTokens.join("|") !== [...tokens].sort().join("|") || entries[entity].some((item) => !item.id)) {
      throw new Error(`Pilot ${entity} allowlist does not match the frozen selection.`);
    }
  }
  if (entries.Opportunity.some((item) => !item.bpfId || item.bpfStage !== "授予资格")) throw new Error("Pilot BPF manifest gate failed.");
  return entries;
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function assertCount(label, rows, expected) {
  if (rows.length !== expected) throw new Error(`${label} readback is incomplete: expected ${expected}, found ${rows.length}.`);
}

function assertRelations({ entries, accounts, contacts, opportunities, actuals, coverages, signals, activityRows, annotationRows, closes, bpfRows }) {
  const accountIds = new Set(accounts.map((row) => normalizeId(row.accountid)));
  const opportunityIds = new Set(opportunities.map((row) => normalizeId(row.opportunityid)));
  const timelineTokens = new Set(entries.Timeline.map((item) => item.token));
  if (accountIds.size !== accounts.length || opportunityIds.size !== opportunities.length) throw new Error("Pilot parent records are not unique.");
  if (contacts.some((row) => !accountIds.has(normalizeId(row._parentcustomerid_value)))) throw new Error("Pilot Contact parent mapping failed.");
  const actualParents = actuals.map((row) => normalizeId(row._aigw_opportunityid_value));
  if (actualParents.some((id) => !opportunityIds.has(id)) || new Set(actualParents).size !== actualParents.length) throw new Error("Pilot Actual uniqueness or parent mapping failed.");
  if (coverages.some((row) => !accountIds.has(normalizeId(row._aigw_accountid_value)))) throw new Error("Pilot Coverage parent mapping failed.");
  if (signals.some((row) => !opportunityIds.has(normalizeId(row._aigw_opportunityid_value)) || !accountIds.has(normalizeId(row._aigw_accountid_value)) || !timelineTokens.has(String(row.aigw_sourceactivitytoken || "")))) throw new Error("Pilot Interaction Signal source mapping failed.");
  if (activityRows.some((row) => !opportunityIds.has(normalizeId(row._regardingobjectid_value))) || annotationRows.some((row) => !opportunityIds.has(normalizeId(row._objectid_value)))) throw new Error("Pilot Timeline parent mapping failed.");
  if (closes.some((row) => !opportunityIds.has(normalizeId(row._opportunityid_value)))) throw new Error("Pilot OpportunityClose parent mapping failed.");
  const bpfParents = bpfRows.map((row) => normalizeId(row._bpf_opportunityid_value));
  if (bpfParents.some((id) => !opportunityIds.has(id)) || new Set(bpfParents).size !== opportunityIds.size) throw new Error("Pilot BPF uniqueness or parent mapping failed.");
}
