import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";
import { compareViewDefinition } from "./lib/phase1c3-view-reconciliation.mjs";

let URL;
const SOLUTION = "CRMAIGatewayDemo";
let VIEW_ID;
const TABLE = "aigw_actualmanagement";
const RETRY_MANIFEST = "docs/d365/phase1c-3b-add-view-to-solution-retry-manifest.json";
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const normalizeId = (value) => String(value || "").replace(/[{}]/g, "").toLowerCase();

export async function main() {
  URL = getDataverseUrl();
  VIEW_ID = getRequiredEnvironmentId("D365_ACTUAL_MANAGEMENT_VIEW_ID");
  const root = process.cwd();
  const client = createDynamicsClient();
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
  const safeGetAll = async (url) => {
    try { return { supported: true, rows: await getAll(url), error: null }; }
    catch (error) { return { supported: false, rows: [], error: error.message }; }
  };
  if (client.config.dataverseUrl !== URL) throw new Error("Safety gate failed: URL mismatch.");
  if ((process.env.AI_PROVIDER || "demo") !== "demo" || (process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: AI must remain demo/disabled.");

  const [solutionRows, view, entity] = await Promise.all([
    get(`/api/data/v9.2/solutions?$select=solutionid,uniquename,friendlyname,ismanaged&$filter=uniquename eq '${SOLUTION}'`),
    get(`/api/data/v9.2/savedqueries(${VIEW_ID})?$select=savedqueryid,name,returnedtypecode,querytype,isquickfindquery,fetchxml,layoutxml,layoutjson,statecode,statuscode,ismanaged`),
    get(`/api/data/v9.2/EntityDefinitions(LogicalName='${TABLE}')?$select=MetadataId,LogicalName,ObjectTypeCode,IsManaged`),
  ]);
  const solution = solutionRows.value?.[0];
  if (!solution || solution.ismanaged !== false) throw new Error("Safety gate failed: unmanaged solution missing.");
  const componentSelect = "solutioncomponentid,objectid,componenttype,_solutionid_value,rootcomponentbehavior,rootsolutioncomponentid";
  const exactFilter = `_solutionid_value eq ${solution.solutionid} and componenttype eq 26 and objectid eq ${VIEW_ID}`;
  const typeFilter = `_solutionid_value eq ${solution.solutionid} and componenttype eq 26`;
  const objectFilter = `objectid eq ${VIEW_ID}`;
  const rootFilter = `_solutionid_value eq ${solution.solutionid} and componenttype eq 1 and objectid eq ${entity.MetadataId}`;
  const [methodA, methodB, methodC, rootResult, navigationResult] = await Promise.all([
    safeGetAll(`/api/data/v9.2/solutioncomponents?$select=${componentSelect}&$filter=${exactFilter}`),
    safeGetAll(`/api/data/v9.2/solutioncomponents?$select=${componentSelect}&$filter=${typeFilter}`),
    safeGetAll(`/api/data/v9.2/solutioncomponents?$select=${componentSelect}&$filter=${objectFilter}`),
    safeGetAll(`/api/data/v9.2/solutioncomponents?$select=${componentSelect}&$filter=${rootFilter}`),
    safeGetAll(`/api/data/v9.2/solutions(${solution.solutionid})/solution_solutioncomponent?$select=${componentSelect}`),
  ]);
  const rootComponent = rootResult.rows[0] || null;
  const children = rootComponent
    ? await safeGetAll(`/api/data/v9.2/solutioncomponents?$select=${componentSelect}&$filter=_solutionid_value eq ${solution.solutionid} and rootsolutioncomponentid eq ${rootComponent.solutioncomponentid}`)
    : { supported: true, rows: [], error: null };
  const type26Resolved = await Promise.all(methodB.rows.map(async (component) => {
    try {
      const savedQuery = await get(`/api/data/v9.2/savedqueries(${normalizeId(component.objectid)})?$select=savedqueryid,name,returnedtypecode`);
      return { ...component, savedQuery };
    } catch (error) {
      return { ...component, savedQuery: null, resolutionError: error.message };
    }
  }));
  const navigationMatch = navigationResult.rows.filter((item) => item.componenttype === 26 && normalizeId(item.objectid) === VIEW_ID);
  const indirectMatches = children.rows.filter((item) => normalizeId(item.objectid) === VIEW_ID || (item.componenttype === 26 && normalizeId(item.objectid) === VIEW_ID));
  const implicitlyIncludedByRoot = rootComponent?.rootcomponentbehavior === 0 && view.returnedtypecode === TABLE;
  const audit = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    environment: URL,
    solution,
    view: { id: view.savedqueryid, name: view.name, definitionMismatches: compareViewDefinition(view, entity.ObjectTypeCode), statecode: view.statecode, statuscode: view.statuscode, ismanaged: view.ismanaged },
    previousResponseRecoverability: {
      statusCode: "not persisted; only known to be 2xx because no client exception was raised",
      headers: "not persisted",
      rawResponseBody: "not persisted",
      responseId: "unknown",
      clientWrapperBehavior: "dataversePost returns {body, headers, status}; C3A discarded the returned object, so body.id could not be logged",
    },
    previousPayload: { ComponentId: VIEW_ID, ComponentType: 26, SolutionUniqueName: SOLUTION, AddRequiredComponents: false, DoNotIncludeSubcomponents: "omitted", IncludedComponentSettingsValues: "omitted" },
    membershipQueries: {
      methodAExactCombinedFilter: methodA,
      methodBAllType26InTargetSolution: { ...methodB, resolvedSavedQueries: type26Resolved },
      methodCObjectIdAcrossAllSolutions: methodC,
      solutionNavigationCollection: { ...navigationResult, matchingViewComponents: navigationMatch },
    },
    rootComponentAudit: {
      tableMetadataId: entity.MetadataId,
      rootComponent,
      rootComponentBehavior: rootComponent?.rootcomponentbehavior ?? null,
      childQuery: children,
      matchingIndirectViewComponents: indirectMatches,
      implicitlyIncludedByRoot,
      inclusionMode: indirectMatches.length ? "explicit_child_component" : implicitlyIncludedByRoot ? "implicit_all_subcomponents" : "not_included",
      directlyIncluded: methodA.rows.length === 1,
      indirectlyIncluded: indirectMatches.length > 0 || implicitlyIncludedByRoot,
    },
    conclusions: {
      directMembershipExists: methodA.rows.length === 1 || navigationMatch.length === 1,
      objectAppearsInAnySolution: methodC.rows.length > 0,
      targetSolutionType26Count: methodB.rows.length,
      rootTableCarriesViewIndirectly: indirectMatches.length > 0 || implicitlyIncludedByRoot,
    },
  };
  const retryManifest = {
    phase: "1C-3B-Retry",
    dryRun: true,
    executable: !audit.conclusions.directMembershipExists && !audit.conclusions.rootTableCarriesViewIndirectly,
    authorizationPhrase: "CONFIRM_D365_TEST_WRITE_PHASE_1C_3B_RETRY_ADD_VIEW_TO_SOLUTION",
    targetEnvironment: URL,
    solution: SOLUTION,
    savedQueryId: VIEW_ID,
    prerequisite: "Re-run all read-only membership queries immediately before POST; if any direct component exists, skip as alreadyExistsAndValid.",
    request: {
      method: "POST",
      endpoint: "/api/data/v9.2/AddSolutionComponent",
      payload: { ComponentId: VIEW_ID, ComponentType: 26, SolutionUniqueName: SOLUTION, AddRequiredComponents: false, DoNotIncludeSubcomponents: true },
    },
    responseHandling: {
      persist: ["status", "body", "body.id", "selected response headers", "JSON-serialized body as rawResponseBodyEquivalent"],
      authoritativeResponseIdPath: "response.body.id",
      responseIdMeaning: "solutioncomponent.solutioncomponentid",
      membershipReadback: [
        `GET /api/data/v9.2/solutioncomponents(<response.body.id>)`,
        `GET /api/data/v9.2/solutioncomponents?$filter=_solutionid_value eq ${solution.solutionid} and componenttype eq 26 and objectid eq ${VIEW_ID}`,
        `GET /api/data/v9.2/solutions(${solution.solutionid})/solution_solutioncomponent?$filter=componenttype eq 26 and objectid eq ${VIEW_ID}`,
      ],
    },
    timeoutPolicy: { postCalls: 1, retriesInSameRun: 0, pollAttempts: 8, pollIntervalMs: 1500 },
    forbidden: ["SavedQuery create/update/delete", "Form/Subgrid", "PublishXml", "Business Rule/BPF activation", "data writes", "Phase 1C-4"],
  };
  const backupDir = path.join(root, "backups", "dataverse", `phase1c3b_membership_audit_${stamp()}`);
  await fs.mkdir(backupDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(backupDir, "01_membership_audit.json"), `${JSON.stringify(audit, null, 2)}\n`),
    fs.writeFile(path.join(root, RETRY_MANIFEST), `${JSON.stringify(retryManifest, null, 2)}\n`),
    fs.writeFile(path.join(backupDir, "02_retry_manifest.json"), `${JSON.stringify(retryManifest, null, 2)}\n`),
  ]);
  console.log(JSON.stringify({ readOnly: true, backupDir: path.relative(root, backupDir), retryManifest: RETRY_MANIFEST, previousResponseRecoverability: audit.previousResponseRecoverability, membership: audit.conclusions, querySupport: { methodA: methodA.supported, methodB: methodB.supported, methodC: methodC.supported, solutionNavigation: navigationResult.supported, rootChildren: children.supported }, rootComponent: audit.rootComponentAudit.rootComponent, retryRequired: retryManifest.executable }, null, 2));
}


runDataverseCli(import.meta.url, main);
