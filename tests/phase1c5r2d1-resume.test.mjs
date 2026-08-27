import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  buildPluginTypePayload,
  buildImagePayloadForMessage,
  buildResumePlan,
  buildStepPayload,
  classifyPluginTypes,
  extractId,
  findPluginTypeByDefinition,
  readAfterWriteById,
  resolvePluginTypeAfterWrite,
  validatePluginTypeDefinitions,
} from "../scripts/dataverse/apply-phase1c5r2d1-registration.mjs";

const primaryAssemblyId = "c4e5b181-767d-f111-ab0e-6045bd5b2c06";
const uniqueAssemblyId = "fd140aae-4df4-11dd-bd17-0019b9312238";
const pluginTypeId = "c4e5b181-767d-f111-ab0e-6045bd5b2c07";
const pluginTypeDefinition = {
  typename: "CrmAiGateway.ActualTotals.Plugin.ActualTotalsPreOperationPlugin",
  name: "ActualTotalsPreOperationPlugin",
  friendlyName: "Actual Totals PreOperation Plugin",
};

test("create response prefers pluginassemblyid over pluginassemblyidunique", () => {
  const id = extractId({ body: { pluginassemblyid: primaryAssemblyId, pluginassemblyidunique: uniqueAssemblyId }, headers: new Headers() }, "pluginassembly");
  assert.equal(id, primaryAssemblyId);
});

test("create response accepts OData-EntityId when body is empty", () => {
  const id = extractId({ body: {}, headers: new Headers({ "OData-EntityId": `/api/data/v9.2/pluginassemblies(${primaryAssemblyId})` }) }, "pluginassembly");
  assert.equal(id, primaryAssemblyId);
});

test("header and body primary IDs must agree", () => {
  assert.throws(() => extractId({ body: { pluginassemblyid: primaryAssemblyId }, headers: new Headers({ "OData-EntityId": `/api/data/v9.2/pluginassemblies(${uniqueAssemblyId})` }) }, "pluginassembly"), /differs/);
});

test("pluginassemblyidunique cannot substitute for the primary ID", () => {
  assert.throws(() => extractId({ body: { pluginassemblyidunique: uniqueAssemblyId }, headers: new Headers() }, "pluginassembly"), /No pluginassemblyid/);
});

test("Plugin Type binding uses only pluginassemblyid", () => {
  const payload = buildPluginTypePayload(pluginTypeDefinition, primaryAssemblyId);
  assert.equal(payload["pluginassemblyid@odata.bind"], `/pluginassemblies(${primaryAssemblyId})`);
  assert.equal(payload.typename, pluginTypeDefinition.typename);
  assert.equal(payload.name, pluginTypeDefinition.name);
  assert.equal(payload.friendlyname, pluginTypeDefinition.friendlyName);
  assert.doesNotMatch(JSON.stringify(payload), /pluginassemblyidunique/);
});

test("Step creation omits Disabled status until the post-create PATCH", () => {
  const payload = buildStepPayload({
    displayName: "Demo Step",
    businessPurpose: "Demo",
    stage: 10,
    mode: 0,
    rank: 10,
    deploymentCode: 0,
    message: "Create",
    filteringAttributes: [],
  }, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333");
  assert.equal("statuscode" in payload, false);
  assert.equal(payload.mode, 0);
});

test("Create PostImage uses Id while Update and Delete images use Target", () => {
  const image = { name: "PostImage", alias: "PostImage", type: "PostImage", fields: ["aigw_name"] };
  assert.equal(buildImagePayloadForMessage(image, primaryAssemblyId, "Create").messagepropertyname, "Id");
  assert.equal(buildImagePayloadForMessage({ ...image, type: "PreImage" }, primaryAssemblyId, "Update").messagepropertyname, "Target");
  assert.equal(buildImagePayloadForMessage({ ...image, type: "PreImage" }, primaryAssemblyId, "Delete").messagepropertyname, "Target");
});

test("invalid assembly IDs are rejected before binding", () => {
  assert.throws(() => buildPluginTypePayload(pluginTypeDefinition, uniqueAssemblyId.replace(/.$/, "x")), /primary pluginassemblyid/);
});

test("Plugin Type definitions require stable unique friendly names", () => {
  const definitions = [
    { typename: "TypeA", name: "NameA", friendlyName: "Friendly A" },
    { typename: "TypeB", name: "NameB", friendlyName: "Friendly B" },
    { typename: "TypeC", name: "NameC", friendlyName: "Friendly C" },
  ];
  assert.deepEqual(validatePluginTypeDefinitions(definitions), definitions);
  assert.throws(() => validatePluginTypeDefinitions(definitions.map((item, index) => index === 2 ? { ...item, friendlyName: "" } : item)), /friendlyName/);
  assert.throws(() => validatePluginTypeDefinitions(definitions.map((item, index) => index === 2 ? { ...item, friendlyName: "Friendly A" } : item)), /friendlyNames must be unique/);
});

test("manifest Plugin Type definitions carry typename, name and friendlyName", async () => {
  const manifest = JSON.parse(await fs.readFile(new URL("../docs/d365/phase1c-5r2b-plugin-registration-manifest.json", import.meta.url), "utf8"));
  assert.equal(validatePluginTypeDefinitions(manifest.pluginTypes).length, 3);
  for (const definition of manifest.pluginTypes) {
    const payload = buildPluginTypePayload(definition, primaryAssemblyId);
    assert.equal(payload.friendlyname, definition.friendlyName);
  }
});

test("resume plan reuses exactly one existing assembly", () => {
  assert.deepEqual(buildResumePlan({ assemblyCount: 1, existingPluginTypeCount: 1, missingPluginTypeCount: 2, conflictingPluginTypeCount: 0, stepCount: 0, imageCount: 0 }), {
    resumeExistingAssembly: true,
    createAssembly: false,
    updateAssembly: false,
    deleteAssembly: false,
    plannedPluginTypes: 3,
    plannedPluginTypeCreates: 2,
    plannedPluginTypeUpdates: 0,
    plannedPluginTypeDeletes: 0,
    plannedSteps: 7,
    plannedStepCreates: 7,
    plannedStepUpdates: 0,
    plannedStepDeletes: 0,
    plannedImages: 6,
    plannedImageCreates: 6,
    plannedImageUpdates: 0,
    plannedImageDeletes: 0,
    plannedEnabledSteps: 0,
  });
});

test("resume plan stops when assembly is missing or ambiguous", () => {
  assert.throws(() => buildResumePlan({ assemblyCount: 0, existingPluginTypeCount: 1, missingPluginTypeCount: 2, conflictingPluginTypeCount: 0, stepCount: 0, imageCount: 0 }), /exactly one/);
  assert.throws(() => buildResumePlan({ assemblyCount: 2, existingPluginTypeCount: 1, missingPluginTypeCount: 2, conflictingPluginTypeCount: 0, stepCount: 0, imageCount: 0 }), /exactly one/);
});

test("resume plan accepts one existing and two missing Plugin Types", () => {
  const plan = buildResumePlan({ assemblyCount: 1, existingPluginTypeCount: 1, missingPluginTypeCount: 2, conflictingPluginTypeCount: 0, stepCount: 0, imageCount: 0 });
  assert.equal(plan.plannedPluginTypeCreates, 2);
});

test("resume plan stops on conflicts and accepts partial Steps and Images", () => {
  assert.throws(() => buildResumePlan({ assemblyCount: 1, existingPluginTypeCount: 1, missingPluginTypeCount: 2, conflictingPluginTypeCount: 1, stepCount: 0, imageCount: 0 }), /conflicting/);
  assert.equal(buildResumePlan({ assemblyCount: 1, existingPluginTypeCount: 1, missingPluginTypeCount: 2, conflictingPluginTypeCount: 0, existingStepCount: 1, missingStepCount: 6, conflictingStepCount: 0, existingImageCount: 0, missingImageCount: 6, conflictingImageCount: 0 }).plannedStepCreates, 6);
  assert.equal(buildResumePlan({ assemblyCount: 1, existingPluginTypeCount: 1, missingPluginTypeCount: 2, conflictingPluginTypeCount: 0, existingStepCount: 7, missingStepCount: 0, conflictingStepCount: 0, existingImageCount: 1, missingImageCount: 5, conflictingImageCount: 0 }).plannedImageCreates, 5);
  assert.throws(() => buildResumePlan({ assemblyCount: 1, existingPluginTypeCount: 1, missingPluginTypeCount: 2, conflictingPluginTypeCount: 0, existingStepCount: 1, missingStepCount: 6, conflictingStepCount: 1, existingImageCount: 0, missingImageCount: 6, conflictingImageCount: 0 }), /Steps/);
  assert.throws(() => buildResumePlan({ assemblyCount: 1, existingPluginTypeCount: 1, missingPluginTypeCount: 2, conflictingPluginTypeCount: 0, existingStepCount: 7, missingStepCount: 0, conflictingStepCount: 0, existingImageCount: 1, missingImageCount: 5, conflictingImageCount: 1 }), /Images/);
});

test("resume source has no Assembly create, update, or delete operation", async () => {
  const source = await fs.readFile(new URL("../scripts/dataverse/apply-phase1c5r2d1-registration.mjs", import.meta.url), "utf8");
  assert.match(source, /resumeExistingAssembly/);
  assert.doesNotMatch(source, /dataversePost\("\/api\/data\/v9\.2\/pluginassemblies"/);
  assert.doesNotMatch(source, /dataversePatch\(`\/api\/data\/v9\.2\/pluginassemblies/);
  assert.doesNotMatch(source, /dataverseDelete\(`\/api\/data\/v9\.2\/pluginassemblies/);
});

test("resume source never uses pluginassemblyidunique for an OData bind", async () => {
  const source = await fs.readFile(new URL("../scripts/dataverse/apply-phase1c5r2d1-registration.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /pluginassemblyidunique[^\n]*odata\.bind/);
  assert.match(source, /"pluginassemblyid@odata\.bind"/);
});

test("resume plan never plans enabled Steps", () => {
  assert.equal(buildResumePlan({ assemblyCount: 1, existingPluginTypeCount: 1, missingPluginTypeCount: 2, conflictingPluginTypeCount: 0, stepCount: 0, imageCount: 0 }).plannedEnabledSteps, 0);
});

test("resume plan has the frozen child component counts", () => {
  const plan = buildResumePlan({ assemblyCount: 1, existingPluginTypeCount: 1, missingPluginTypeCount: 2, conflictingPluginTypeCount: 0, stepCount: 0, imageCount: 0 });
  assert.equal(plan.plannedPluginTypes, 3);
  assert.equal(plan.plannedPluginTypeCreates, 2);
  assert.equal(plan.plannedSteps, 7);
  assert.equal(plan.plannedStepCreates, 7);
  assert.equal(plan.plannedImages, 6);
  assert.equal(plan.plannedImageCreates, 6);
});

test("resume executor requires explicit resume mode", async () => {
  const source = await fs.readFile(new URL("../scripts/dataverse/apply-phase1c5r2d1-registration.mjs", import.meta.url), "utf8");
  assert.match(source, /requires --resume-existing-assembly/);
});

test("resume executor does not contain an Assembly content upload", async () => {
  const source = await fs.readFile(new URL("../scripts/dataverse/apply-phase1c5r2d1-registration.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /const dllContent/);
  assert.doesNotMatch(source, /content: dllContent/);
});

test("frozen primary Assembly ID is a normal Dataverse GUID", () => {
  const payload = buildPluginTypePayload({ typename: "Example", name: "Example", friendlyName: "Example Friendly" }, primaryAssemblyId);
  assert.equal(payload["pluginassemblyid@odata.bind"].includes(uniqueAssemblyId), false);
  assert.equal(payload["pluginassemblyid@odata.bind"].includes(pluginTypeId), false);
});

test("read-after-write retries a transient missing GET without another POST", async () => {
  let calls = 0;
  const result = await readAfterWriteById(async () => {
    calls += 1;
    return calls === 2 ? { plugintypeid: pluginTypeId } : { value: [] };
  }, "/plugintypes/id", "type", { delays: [0, 0], sleep: async () => {} });
  assert.equal(calls, 2);
  assert.equal(result.row.plugintypeid, pluginTypeId);
  assert.equal(result.delayed, true);
});

test("read-after-write allows five attempts then returns unresolved", async () => {
  let calls = 0;
  const result = await readAfterWriteById(async () => { calls += 1; return { value: [] }; }, "/plugintypes/id", "type", { delays: [0, 0, 0, 0, 0], sleep: async () => {} });
  assert.equal(calls, 5);
  assert.equal(result.row, null);
});

test("five delayed ID reads fall back to an exact collection match without reposting", async () => {
  let idReads = 0;
  let collectionReads = 0;
  const definition = { typename: "TypeB", name: "NameB", friendlyName: "Friendly B" };
  const result = await resolvePluginTypeAfterWrite(async (endpoint) => {
    if (endpoint.includes("plugintypes(")) {
      idReads += 1;
      return { value: [] };
    }
    collectionReads += 1;
    return { value: [{ plugintypeid: pluginTypeId, typename: definition.typename, name: definition.name, friendlyname: definition.friendlyName, _pluginassemblyid_value: primaryAssemblyId }] };
  }, pluginTypeId, definition, primaryAssemblyId, { delays: [0, 0, 0, 0, 0], sleep: async () => {} });
  assert.equal(idReads, 5);
  assert.equal(collectionReads, 1);
  assert.equal(result.status, "created-after-read-delay");
  assert.equal(result.row.plugintypeid, pluginTypeId);
});

test("duplicate recovery reuses only an exact Plugin Type match", async () => {
  const definition = { typename: "TypeB", name: "NameB", friendlyName: "Friendly B" };
  const exact = await findPluginTypeByDefinition(async () => ({ value: [{ plugintypeid: pluginTypeId, typename: definition.typename, name: definition.name, friendlyname: definition.friendlyName, _pluginassemblyid_value: primaryAssemblyId }] }), definition, primaryAssemblyId);
  assert.equal(exact.plugintypeid, pluginTypeId);
  await assert.rejects(() => findPluginTypeByDefinition(async () => ({ value: [{ plugintypeid: pluginTypeId, typename: definition.typename, name: "Wrong", friendlyname: definition.friendlyName, _pluginassemblyid_value: primaryAssemblyId }] }), definition, primaryAssemblyId), /conflict/);
});

test("partial Plugin Type classification reuses exact matches and creates only missing definitions", () => {
  const definitions = [
    { typename: "TypeA", name: "NameA", friendlyName: "Friendly A" },
    { typename: "TypeB", name: "NameB", friendlyName: "Friendly B" },
    { typename: "TypeC", name: "NameC", friendlyName: "Friendly C" },
  ];
  const rows = [{ plugintypeid: pluginTypeId, typename: "TypeA", name: "NameA", friendlyname: "Friendly A", _pluginassemblyid_value: primaryAssemblyId }];
  const result = classifyPluginTypes(definitions, rows, primaryAssemblyId);
  assert.equal(result.existing.length, 1);
  assert.equal(result.missing.length, 2);
  assert.equal(result.conflicting.length, 0);
});

test("partial Plugin Type classification blocks a conflicting existing definition", () => {
  const definitions = [{ typename: "TypeA", name: "NameA", friendlyName: "Friendly A" }, { typename: "TypeB", name: "NameB", friendlyName: "Friendly B" }, { typename: "TypeC", name: "NameC", friendlyName: "Friendly C" }];
  const rows = [{ plugintypeid: pluginTypeId, typename: "TypeA", name: "WrongName", friendlyname: "Friendly A", _pluginassemblyid_value: primaryAssemblyId }];
  const result = classifyPluginTypes(definitions, rows, primaryAssemblyId);
  assert.equal(result.conflicting.length, 1);
  assert.equal(result.missing.length, 2);
});
