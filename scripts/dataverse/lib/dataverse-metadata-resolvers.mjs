const RELATIONSHIP_SELECT = [
  "SchemaName",
  "ReferencingEntity",
  "ReferencingAttribute",
  "ReferencedEntity",
  "ReferencedAttribute",
  "ReferencingEntityNavigationPropertyName",
  "ReferencedEntityNavigationPropertyName",
].join(",");

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ODATA_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function rowsOf(body) {
  if (Array.isArray(body?.value)) return body.value;
  if (body && typeof body === "object" && body.LogicalName) return [body];
  return [];
}

function requireGet(get) {
  if (typeof get !== "function") throw new TypeError("Metadata resolver requires a get function.");
}

function requireOne(rows, description) {
  if (rows.length === 0) throw new Error(`Metadata resolver blocked: no ${description} matched.`);
  if (rows.length > 1) throw new Error(`Metadata resolver blocked: multiple ${description} matches were returned.`);
  return rows[0];
}

export async function resolveEntitySetName({ get, logicalName, expectedEntitySetName } = {}) {
  requireGet(get);
  if (!logicalName || !ODATA_NAME.test(logicalName)) throw new Error("Metadata resolver requires a valid logical entity name.");
  const body = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')?$select=LogicalName,EntitySetName`);
  const row = requireOne(rowsOf(body).filter((item) => item.LogicalName === logicalName), `entity ${logicalName}`);
  if (!row.EntitySetName || !ODATA_NAME.test(row.EntitySetName)) throw new Error(`Metadata resolver blocked: entity ${logicalName} has no valid EntitySetName.`);
  if (expectedEntitySetName && row.EntitySetName !== expectedEntitySetName) {
    throw new Error(`Metadata resolver blocked: entity ${logicalName} resolved to ${row.EntitySetName}, expected ${expectedEntitySetName}.`);
  }
  return { logicalName, entitySetName: row.EntitySetName };
}

export async function resolveLookupNavigationProperty({
  get,
  sourceEntityLogicalName,
  lookupAttributeLogicalName,
  targetEntityLogicalName,
  relationshipSchemaName,
  expectedNavigationPropertyName,
} = {}) {
  requireGet(get);
  if (!sourceEntityLogicalName || !lookupAttributeLogicalName || !targetEntityLogicalName) {
    throw new Error("Metadata resolver requires source entity, lookup attribute, and target entity.");
  }
  const body = await get(`/api/data/v9.2/EntityDefinitions(LogicalName='${sourceEntityLogicalName}')/ManyToOneRelationships?$select=${RELATIONSHIP_SELECT}`);
  const matches = rowsOf(body).filter((item) => (
    item.ReferencingEntity === sourceEntityLogicalName
    && item.ReferencingAttribute === lookupAttributeLogicalName
    && item.ReferencedEntity === targetEntityLogicalName
    && (!relationshipSchemaName || item.SchemaName === relationshipSchemaName)
  ));
  const row = requireOne(matches, `lookup relationship ${sourceEntityLogicalName}.${lookupAttributeLogicalName}`);
  const navigationPropertyName = row.ReferencingEntityNavigationPropertyName;
  if (!navigationPropertyName || !ODATA_NAME.test(navigationPropertyName)) {
    throw new Error("Metadata resolver blocked: relationship has no valid referencing navigation property.");
  }
  if (expectedNavigationPropertyName && navigationPropertyName !== expectedNavigationPropertyName) {
    throw new Error(`Metadata resolver blocked: lookup ${lookupAttributeLogicalName} resolved to ${navigationPropertyName}, expected ${expectedNavigationPropertyName}.`);
  }
  return {
    sourceEntityLogicalName,
    lookupAttributeLogicalName,
    targetEntityLogicalName,
    relationshipSchemaName: row.SchemaName,
    navigationPropertyName,
    referencedAttributeLogicalName: row.ReferencedAttribute,
  };
}

export function buildLookupBind(binding, id) {
  if (!binding?.navigationPropertyName || !binding?.entitySetName) throw new Error("Lookup bind requires metadata-resolved navigation and entity set names.");
  if (!GUID.test(String(id || ""))) throw new Error("Lookup bind requires a valid GUID.");
  if (!ODATA_NAME.test(binding.navigationPropertyName) || !ODATA_NAME.test(binding.entitySetName)) throw new Error("Lookup bind contains an invalid metadata name.");
  return { [`${binding.navigationPropertyName}@odata.bind`]: `/${binding.entitySetName}(${id})` };
}

export async function resolveActualManagementBindings(get) {
  const [actualManagement, opportunity, transactionCurrency] = await Promise.all([
    resolveEntitySetName({ get, logicalName: "aigw_actualmanagement", expectedEntitySetName: "aigw_actualmanagements" }),
    resolveEntitySetName({ get, logicalName: "opportunity", expectedEntitySetName: "opportunities" }),
    resolveEntitySetName({ get, logicalName: "transactioncurrency", expectedEntitySetName: "transactioncurrencies" }),
  ]);
  const [actualOpportunityLookup, actualCurrencyLookup, opportunityCurrencyLookup] = await Promise.all([
    resolveLookupNavigationProperty({
      get,
      sourceEntityLogicalName: "aigw_actualmanagement",
      lookupAttributeLogicalName: "aigw_opportunityid",
      targetEntityLogicalName: "opportunity",
      relationshipSchemaName: "aigw_opportunity_actualmanagement",
      expectedNavigationPropertyName: "aigw_OpportunityId",
    }),
    resolveLookupNavigationProperty({
      get,
      sourceEntityLogicalName: "aigw_actualmanagement",
      lookupAttributeLogicalName: "transactioncurrencyid",
      targetEntityLogicalName: "transactioncurrency",
    }),
    resolveLookupNavigationProperty({
      get,
      sourceEntityLogicalName: "opportunity",
      lookupAttributeLogicalName: "transactioncurrencyid",
      targetEntityLogicalName: "transactioncurrency",
    }),
  ]);
  return {
    actualManagement: {
      entitySetName: actualManagement.entitySetName,
      opportunityLookup: { ...actualOpportunityLookup, entitySetName: opportunity.entitySetName },
      transactionCurrencyLookup: { ...actualCurrencyLookup, entitySetName: transactionCurrency.entitySetName },
    },
    opportunity: {
      entitySetName: opportunity.entitySetName,
      transactionCurrencyLookup: { ...opportunityCurrencyLookup, entitySetName: transactionCurrency.entitySetName },
    },
    transactionCurrency,
  };
}
