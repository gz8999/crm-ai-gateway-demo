using System;
using System.Collections.Generic;
using CrmAiGateway.ActualTotals.Core;
using Microsoft.Xrm.Sdk;

namespace CrmAiGateway.ActualTotals.Plugin
{
    internal static class EntityMapper
    {
        public static Entity Merge(Entity target, Entity image)
        {
            var merged = image == null ? new Entity(target.LogicalName, target.Id) : new Entity(image.LogicalName, image.Id);
            if (image != null) foreach (var pair in image.Attributes) merged[pair.Key] = pair.Value;
            if (target != null) foreach (var pair in target.Attributes) merged[pair.Key] = pair.Value;
            return merged;
        }

        public static ActualSnapshot ToActual(Entity entity)
        {
            var monthly = new Dictionary<string, decimal?>();
            foreach (var field in FieldNames.MonthlyRevenue) monthly[field] = GetMoney(entity, field);
            return new ActualSnapshot
            {
                Id = entity.Id,
                OpportunityId = entity.GetAttributeValue<EntityReference>(FieldNames.OpportunityLookup)?.Id ?? Guid.Empty,
                TransactionCurrencyId = entity.GetAttributeValue<EntityReference>(FieldNames.TransactionCurrency)?.Id ?? Guid.Empty,
                AnnualRevenue = GetMoney(entity, FieldNames.ChildAnnualRevenue),
                MonthlyRevenue = monthly
            };
        }

        public static decimal? GetMoney(Entity entity, string field)
        {
            return entity != null && entity.Contains(field) ? entity.GetAttributeValue<Money>(field)?.Value : null;
        }
    }
}
