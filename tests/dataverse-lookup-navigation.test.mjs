import fs from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLookupBind,
  resolveActualManagementBindings,
  resolveEntitySetName,
  resolveLookupNavigationProperty,
} from "../scripts/dataverse/lib/dataverse-metadata-resolvers.mjs";
import { buildSyntheticActual } from "../scripts/dataverse/lib/phase1c5-synthetic-actuals.mjs";

const GUID = "11111111-1111-1111-1111-111111111111";
const CURRENCY = "22222222-2222-2222-2222-222222222222";

const entityRows = {
  aigw_actualmanagement: { LogicalName: "aigw_actualmanagement", EntitySetName: "aigw_actualmanagements" },
  opportunity: { LogicalName: "opportunity", EntitySetName: "opportunities" },
  transactioncurrency: { LogicalName: "transactioncurrency", EntitySetName: "transactioncurrencies" },
};

const relationshipRows = {
  aigw_actualmanagement: [
    {
      SchemaName: "aigw_opportunity_actualmanagement",
      ReferencingEntity: "aigw_actualmanagement",
      ReferencingAttribute: "aigw_opportunityid",
      ReferencedEntity: "opportunity",
      ReferencedAttribute: "opportunityid",
      ReferencingEntityNavigationPropertyName: "aigw_OpportunityId",
      ReferencedEntityNavigationPropertyName: "aigw_opportunity_actualmanagement",
    },
    {
      SchemaName: "TransactionCurrency_aigw_ActualManagement",
      ReferencingEntity: "aigw_actualmanagement",
      ReferencingAttribute: "transactioncurrencyid",
      ReferencedEntity: "transactioncurrency",
      ReferencedAttribute: "transactioncurrencyid",
      ReferencingEntityNavigationPropertyName: "transactioncurrencyid",
      ReferencedEntityNavigationPropertyName: "TransactionCurrency_aigw_ActualManagement",
    },
  ],
  opportunity: [{
    SchemaName: "TransactionCurrency_Opportunity",
    ReferencingEntity: "opportunity",
    ReferencingAttribute: "transactioncurrencyid",
    ReferencedEntity: "transactioncurrency",
    ReferencedAttribute: "transactioncurrencyid",
    ReferencingEntityNavigationPropertyName: "transactioncurrencyid",
    ReferencedEntityNavigationPropertyName: "TransactionCurrency_Opportunity",
  }],
};

function fakeGet({ entities = entityRows, relationships = relationshipRows, calls = [] } = {}) {
  return async (uri) => {
    calls.push(uri);
    const entityMatch = /EntityDefinitions\(LogicalName='([^']+)'\)\?\$select=LogicalName,EntitySetName/.exec(uri);
    if (entityMatch) return entities[entityMatch[1]] || {};
    const relationshipMatch = /EntityDefinitions\(LogicalName='([^']+)'\)\/ManyToOneRelationships/.exec(uri);
    if (relationshipMatch) return { value: relationships[relationshipMatch[1]] || [] };
    throw new Error(`Unexpected metadata URI: ${uri}`);
  };
}

test("resolver preserves aigw_OpportunityId and builds the correct opportunity bind", async () => {
  const bindings = await resolveActualManagementBindings(fakeGet());
  assert.equal(bindings.actualManagement.opportunityLookup.lookupAttributeLogicalName, "aigw_opportunityid");
  assert.equal(bindings.actualManagement.opportunityLookup.navigationPropertyName, "aigw_OpportunityId");
  assert.equal(bindings.opportunity.entitySetName, "opportunities");
  assert.deepEqual(buildLookupBind(bindings.actualManagement.opportunityLookup, GUID), {
    "aigw_OpportunityId@odata.bind": `/opportunities(${GUID})`,
  });
  assert.equal(Object.hasOwn(buildLookupBind(bindings.actualManagement.opportunityLookup, GUID), "aigw_opportunityid@odata.bind"), false);
});

test("resolver matches the exact attribute and relationship schema", async () => {
  const result = await resolveLookupNavigationProperty({
    get: fakeGet(),
    sourceEntityLogicalName: "aigw_actualmanagement",
    lookupAttributeLogicalName: "aigw_opportunityid",
    targetEntityLogicalName: "opportunity",
    relationshipSchemaName: "aigw_opportunity_actualmanagement",
  });
  assert.equal(result.navigationPropertyName, "aigw_OpportunityId");
  await assert.rejects(
    resolveLookupNavigationProperty({
      get: fakeGet(),
      sourceEntityLogicalName: "aigw_actualmanagement",
      lookupAttributeLogicalName: "aigw_opportunityid",
      targetEntityLogicalName: "opportunity",
      relationshipSchemaName: "wrong_schema",
    }),
    /no lookup relationship/,
  );
});

test("zero, multiple, and target-mismatch metadata results block before business payload creation", async () => {
  const empty = fakeGet({ relationships: { ...relationshipRows, aigw_actualmanagement: [] } });
  await assert.rejects(resolveLookupNavigationProperty({ get: empty, sourceEntityLogicalName: "aigw_actualmanagement", lookupAttributeLogicalName: "aigw_opportunityid", targetEntityLogicalName: "opportunity" }), /no lookup relationship/);

  const multiple = fakeGet({ relationships: { ...relationshipRows, aigw_actualmanagement: [relationshipRows.aigw_actualmanagement[0], { ...relationshipRows.aigw_actualmanagement[0], SchemaName: "duplicate_relationship" }] } });
  await assert.rejects(resolveLookupNavigationProperty({ get: multiple, sourceEntityLogicalName: "aigw_actualmanagement", lookupAttributeLogicalName: "aigw_opportunityid", targetEntityLogicalName: "opportunity" }), /multiple lookup relationship/);

  const mismatch = fakeGet({ relationships: { ...relationshipRows, aigw_actualmanagement: [{ ...relationshipRows.aigw_actualmanagement[0], ReferencedEntity: "account" }] } });
  await assert.rejects(resolveLookupNavigationProperty({ get: mismatch, sourceEntityLogicalName: "aigw_actualmanagement", lookupAttributeLogicalName: "aigw_opportunityid", targetEntityLogicalName: "opportunity" }), /no lookup relationship/);
});

test("entity set resolver uses metadata and rejects an unexpected set", async () => {
  const resolved = await resolveEntitySetName({ get: fakeGet(), logicalName: "transactioncurrency", expectedEntitySetName: "transactioncurrencies" });
  assert.equal(resolved.entitySetName, "transactioncurrencies");
  await assert.rejects(resolveEntitySetName({ get: fakeGet(), logicalName: "opportunity", expectedEntitySetName: "wrongSet" }), /expected wrongSet/);
});

test("currency lookups resolve independently and preserve their navigation casing", async () => {
  const bindings = await resolveActualManagementBindings(fakeGet());
  assert.equal(bindings.actualManagement.transactionCurrencyLookup.navigationPropertyName, "transactioncurrencyid");
  assert.equal(bindings.opportunity.transactionCurrencyLookup.navigationPropertyName, "transactioncurrencyid");
  assert.deepEqual(buildLookupBind(bindings.actualManagement.transactionCurrencyLookup, CURRENCY), {
    "transactioncurrencyid@odata.bind": `/transactioncurrencies(${CURRENCY})`,
  });
});

test("create and reparent payloads use only resolver-generated bind fields", async () => {
  const bindings = await resolveActualManagementBindings(fakeGet());
  const plan = buildSyntheticActual({ opportunityid: GUID, transactioncurrencyid: CURRENCY }, 0, bindings);
  assert.equal(plan.payload["aigw_OpportunityId@odata.bind"], `/opportunities(${GUID})`);
  assert.equal(plan.payload["transactioncurrencyid@odata.bind"], `/transactioncurrencies(${CURRENCY})`);
  assert.equal(Object.hasOwn(plan.payload, "aigw_opportunityid@odata.bind"), false);
  const reparent = buildLookupBind(bindings.actualManagement.opportunityLookup, "33333333-3333-3333-3333-333333333333");
  assert.equal(reparent["aigw_OpportunityId@odata.bind"], "/opportunities(33333333-3333-3333-3333-333333333333)");
});

test("offline dry-run uses supplied metadata bindings without network access", () => {
  const plan = buildSyntheticActual({ opportunityid: GUID, transactioncurrencyid: CURRENCY }, 1, {
    actualManagement: {
      opportunityLookup: { navigationPropertyName: "aigw_OpportunityId", entitySetName: "opportunities" },
      transactionCurrencyLookup: { navigationPropertyName: "transactioncurrencyid", entitySetName: "transactioncurrencies" },
    },
  });
  assert.equal(plan.payload["aigw_OpportunityId@odata.bind"], `/opportunities(${GUID})`);
});

test("business actuals code does not contain the old logical-name bind", async () => {
  const source = await fs.readFile(new URL("../scripts/dataverse/lib/phase1c5-synthetic-actuals.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /aigw_opportunityid@odata\.bind/);
});

test("invalid bind identifiers are rejected", () => {
  assert.throws(() => buildLookupBind({ navigationPropertyName: "aigw_OpportunityId", entitySetName: "opportunities" }, "not-a-guid"), /valid GUID/);
});
