using System;
using System.Collections.Generic;
using CrmAiGateway.ActualTotals.Core;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace CrmAiGateway.ActualTotals.Plugin
{
    internal sealed class DataverseActualTotalsStore : IActualTotalsStore
    {
        private readonly IOrganizationService service;
        public DataverseActualTotalsStore(IOrganizationService service) { this.service = service; }

        public OpportunitySnapshot GetOpportunity(Guid opportunityId)
        {
            var entity = service.Retrieve(FieldNames.OpportunityTable, opportunityId, new ColumnSet(FieldNames.TransactionCurrency, FieldNames.ParentAnnualRevenue));
            return new OpportunitySnapshot
            {
                Id = entity.Id,
                TransactionCurrencyId = entity.GetAttributeValue<EntityReference>(FieldNames.TransactionCurrency)?.Id ?? Guid.Empty,
                AnnualRevenue = EntityMapper.GetMoney(entity, FieldNames.ParentAnnualRevenue)
            };
        }

        public IReadOnlyList<ActualSnapshot> GetActuals(Guid opportunityId, Guid? excludingActualId = null)
        {
            var query = new QueryExpression(FieldNames.ChildTable)
            {
                ColumnSet = new ColumnSet(FieldNames.OpportunityLookup, FieldNames.TransactionCurrency, FieldNames.ChildAnnualRevenue)
            };
            query.Criteria.AddCondition(FieldNames.OpportunityLookup, ConditionOperator.Equal, opportunityId);
            if (excludingActualId.HasValue && excludingActualId.Value != Guid.Empty) query.Criteria.AddCondition(FieldNames.ChildId, ConditionOperator.NotEqual, excludingActualId.Value);
            var result = new List<ActualSnapshot>();
            foreach (var entity in service.RetrieveMultiple(query).Entities) result.Add(EntityMapper.ToActual(entity));
            return result;
        }

        public void UpdateOpportunityAnnualRevenue(Guid opportunityId, decimal annualRevenue)
        {
            var update = new Entity(FieldNames.OpportunityTable, opportunityId);
            update[FieldNames.ParentAnnualRevenue] = new Money(annualRevenue);
            service.Update(update);
        }
    }
}
