using System;
using System.Collections.Generic;
using System.Linq;

namespace CrmAiGateway.ActualTotals.Core
{
    public sealed class ActualTotalsService
    {
        public const int MoneyPrecision = 2;
        private readonly IActualTotalsStore store;

        public ActualTotalsService(IActualTotalsStore store)
        {
            this.store = store ?? throw new ArgumentNullException(nameof(store));
        }

        public static decimal RoundMoney(decimal value)
        {
            return Math.Round(value, MoneyPrecision, MidpointRounding.AwayFromZero);
        }

        public static decimal CalculateAnnualRevenue(IDictionary<string, decimal?> monthlyRevenue)
        {
            if (monthlyRevenue == null) throw new ArgumentNullException(nameof(monthlyRevenue));
            return RoundMoney(FieldNames.MonthlyRevenue.Sum(field => monthlyRevenue.ContainsKey(field) ? monthlyRevenue[field] ?? 0m : 0m));
        }

        public static bool MoneyChanged(decimal? current, decimal next)
        {
            return !current.HasValue || RoundMoney(current.Value) != RoundMoney(next);
        }

        public void ValidateCandidate(ActualSnapshot candidate, Guid? excludingActualId)
        {
            if (candidate == null) throw new ArgumentNullException(nameof(candidate));
            if (candidate.OpportunityId == Guid.Empty) throw new ActualTotalsIntegrityException("Actual Management requires an Opportunity lookup.");
            if (candidate.TransactionCurrencyId == Guid.Empty) throw new ActualTotalsIntegrityException("Actual Management requires a transaction currency.");

            var opportunity = store.GetOpportunity(candidate.OpportunityId);
            if (opportunity == null) throw new ActualTotalsIntegrityException("The related Opportunity does not exist.");
            if (opportunity.TransactionCurrencyId != candidate.TransactionCurrencyId) throw new ActualTotalsIntegrityException("Actual Management currency must match the related Opportunity currency.");
            if (store.GetActuals(candidate.OpportunityId, excludingActualId).Count > 0) throw new ActualTotalsIntegrityException("Each Opportunity may have at most one Actual Management record.");
        }

        public void RecalculateOpportunity(Guid opportunityId)
        {
            if (opportunityId == Guid.Empty) return;
            var actuals = store.GetActuals(opportunityId);
            if (actuals.Count > 1) throw new ActualTotalsIntegrityException("Opportunity has more than one Actual Management record.");
            var total = actuals.Count == 0 ? 0m : RoundMoney(actuals[0].AnnualRevenue ?? 0m);
            var opportunity = store.GetOpportunity(opportunityId);
            if (opportunity == null) throw new ActualTotalsIntegrityException("The related Opportunity does not exist.");
            if (MoneyChanged(opportunity.AnnualRevenue, total)) store.UpdateOpportunityAnnualRevenue(opportunityId, total);
        }

        public void RecalculateAffectedOpportunities(Guid oldOpportunityId, Guid newOpportunityId)
        {
            foreach (var id in new[] { oldOpportunityId, newOpportunityId }.Where(id => id != Guid.Empty).Distinct()) RecalculateOpportunity(id);
        }
    }

    public static class ExecutionGuard
    {
        public static bool ShouldSkip(int depth, IDictionary<string, object> sharedVariables, string marker)
        {
            if (depth > 1) return true;
            if (sharedVariables != null && sharedVariables.ContainsKey(marker)) return true;
            if (sharedVariables != null) sharedVariables[marker] = true;
            return false;
        }
    }
}
