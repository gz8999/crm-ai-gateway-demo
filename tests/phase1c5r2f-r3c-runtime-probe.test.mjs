import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { CHOICE_LABELS, runProbe } from "../scripts/dataverse/phase1c5r2f-choice-solution-repair.mjs";
import { choiceSnapshotMatches, relationshipMatrix } from "../scripts/dataverse/phase1c5r2f-r3c-runtime-probe.mjs";

const relationship = (attribute, navigation, referencedEntity) => ({
  ReferencingAttribute: attribute,
  ReferencingEntityNavigationPropertyName: navigation,
  ReferencedEntity: referencedEntity,
  ReferencingEntity: "probe_entity",
  SchemaName: `Aigw_${attribute}`,
});

test("R3C resolves all lookup navigation properties and validates target entity sets", () => {
  const metadata = {
    LogicalName: "aigw_customerservicecoverage",
    ManyToOneRelationships: [relationship("aigw_accountid", "Aigw_Accountid", "account"), relationship("aigw_responsibledepartment", "Aigw_Responsibledepartment", "team")],
    lookupRequiredLevels: { aigw_accountid: "ApplicationRequired", aigw_responsibledepartment: "None" },
  };
  const matrix = relationshipMatrix(metadata, [{ attribute: "aigw_accountid", targetSet: "accounts" }, { attribute: "aigw_responsibledepartment", targetSet: "teams" }]);
  assert.deepEqual(matrix.map((item) => item.navigationProperty), ["Aigw_Accountid", "Aigw_Responsibledepartment"]);
  assert.deepEqual(matrix.map((item) => item.targetEntitySet), ["accounts", "teams"]);
  assert.ok(matrix.every((item) => item.unique));
});

test("R3C rejects a missing or ambiguous lookup instead of using logical-name bind", () => {
  const metadata = { LogicalName: "aigw_interactionsignal", ManyToOneRelationships: [relationship("aigw_accountid", "Aigw_Accountid", "account"), relationship("aigw_accountid", "Other_Account", "account")], lookupRequiredLevels: {} };
  const matrix = relationshipMatrix(metadata, [{ attribute: "aigw_accountid", targetSet: "accounts" }, { attribute: "aigw_opportunityid", targetSet: "opportunities" }]);
  assert.equal(matrix[0].unique, false);
  assert.equal(matrix[1].navigationProperty, null);
});

test("R3C frozen Choice comparison requires exact values, Chinese and English labels", () => {
  const definition = { options: ["国内运输"], englishOptions: ["Domestic Transport"] };
  const current = { attributeType: "Picklist", isGlobal: false, options: [{ value: 388560000, labels: { "2052": "国内运输", "1033": "Domestic Transport" } }] };
  const frozen = { after: { options: structuredClone(current.options) } };
  assert.equal(choiceSnapshotMatches(current, frozen, definition), true);
  frozen.after.options[0].value += 1;
  assert.equal(choiceSnapshotMatches(current, frozen, definition), false);
});

test("R3C bounded probe creates Coverage and Signal, rejects both duplicates, and cleans exact IDs", async () => {
  const choiceValues = CHOICE_LABELS.map((definition) => ({ entity: definition.entity, attribute: definition.attribute, after: { options: definition.options.map((label, index) => ({ value: 388560000 + index, labels: { "2052": label, "1033": definition.englishOptions[index] } })) } }));
  const coverageEntity = {
    LogicalName: "aigw_customerservicecoverage", EntitySetName: "aigw_customerservicecoverages", PrimaryIdAttribute: "aigw_customerservicecoverageid",
    ManyToOneRelationships: [relationship("aigw_accountid", "Aigw_Accountid", "account"), relationship("aigw_responsibledepartment", "Aigw_Responsibledepartment", "team")],
  };
  const signalEntity = {
    LogicalName: "aigw_interactionsignal", EntitySetName: "aigw_interactionsignals", PrimaryIdAttribute: "aigw_interactionsignalid",
    ManyToOneRelationships: [relationship("aigw_accountid", "Aigw_Accountid", "account"), relationship("aigw_opportunityid", "Aigw_Opportunityid", "opportunity"), relationship("aigw_salesdepartment", "Aigw_Salesdepartment", "team")],
  };
  const backingEntity = { LogicalName: "aigw_ai_demo_full_replica", EntitySetName: "aigw_ai_demo_full_replicas", PrimaryIdAttribute: "businessprocessflowinstanceid" };
  const created = { coverages: [], signals: [] };
  const deleted = [];
  let accountId = null;
  let opportunityId = null;
  const post = async (endpoint, payload) => {
    if (payload.aigw_name?.includes("Duplicate")) throw Object.assign(new Error("alternate key duplicate"), { status: 412 });
    if (endpoint.endsWith("/accounts")) { accountId = "account-1"; return { body: { accountid: accountId }, status: 201 }; }
    if (endpoint.endsWith("/opportunities")) { opportunityId = "opportunity-1"; return { body: { opportunityid: opportunityId }, status: 201 }; }
    if (endpoint.endsWith("/aigw_customerservicecoverages")) {
      const id = `coverage-${created.coverages.length + 1}`;
      created.coverages.push({ ...payload, aigw_customerservicecoverageid: id, _aigw_accountid_value: accountId, _aigw_responsibledepartment_value: "team-1" });
      return { body: { aigw_customerservicecoverageid: id }, status: 201 };
    }
    const id = `signal-${created.signals.length + 1}`;
    created.signals.push({ ...payload, aigw_interactionsignalid: id, _aigw_accountid_value: accountId, _aigw_opportunityid_value: opportunityId, _aigw_salesdepartment_value: "team-1" });
    return { body: { aigw_interactionsignalid: id }, status: 201 };
  };
  const get = async (endpoint) => {
    if (endpoint.startsWith("/api/data/v9.2/teams?")) return { value: [{ teamid: "team-1", teamtype: 0 }] };
    if (endpoint.startsWith("/api/data/v9.2/transactioncurrencies?")) return { value: [{ transactioncurrencyid: "currency-1" }] };
    if (endpoint.includes("aigw_customerservicecoverages?$select")) return { value: created.coverages };
    if (endpoint.includes("aigw_interactionsignals?$select")) return { value: created.signals };
    if (endpoint.includes("aigw_ai_demo_full_replicas?")) return { value: [] };
    if (endpoint.includes("accounts(account-1)") || endpoint.includes("opportunities(opportunity-1)")) {
      if (deleted.some((item) => endpoint.startsWith(item))) throw Object.assign(new Error("not found"), { status: 404 });
      return endpoint.includes("opportunities") ? { opportunityid: opportunityId, _parentaccountid_value: accountId, statecode: 0 } : { accountid: accountId };
    }
    throw Object.assign(new Error("not found"), { status: 404 });
  };
  const del = async (endpoint) => { deleted.push(endpoint); };
  const result = await runProbe({ get, post, del, entities: { coverage: coverageEntity, signal: signalEntity, backing: backingEntity }, userId: "user-1", buId: "bu-1", choiceValues, phase: "R3C-TEST" });
  assert.equal(result.validation.every((item) => item.ok), true);
  assert.deepEqual(result.createdCounts, { account: 1, opportunity: 1, coverage: 2, signal: 3 });
  assert.equal(result.cleanup.ok, true);
  assert.equal(result.cleanup.residual, 0);
  assert.equal(deleted.length, 7);
  assert.deepEqual(deleted.slice(0, 3), ["/api/data/v9.2/aigw_interactionsignals(signal-1)", "/api/data/v9.2/aigw_interactionsignals(signal-2)", "/api/data/v9.2/aigw_interactionsignals(signal-3)"]);
});

test("R3C source has no Choice, Publish, Solution, Schema, Form or View write path", async () => {
  const source = await fs.readFile(new URL("../scripts/dataverse/phase1c5r2f-r3c-runtime-probe.mjs", import.meta.url), "utf8");
  assert.match(source, /org91f5f65f\.crm5\.dynamics\.com/);
  assert.match(source, /lcn-crm\.crm7\.dynamics\.com/);
  assert.doesNotMatch(source, /InsertOptionValue|OrderOption|PublishXml|PublishAllXml|AddSolutionComponent|ExportSolution/);
  assert.doesNotMatch(source, /dataverseRequest\("PATCH"/);
  assert.match(source, /localChoiceOptionsEmpty = false/);
  assert.match(source, /\[\[\]AI-DEMO-SCHEMA-PROBE\]%/);
});
