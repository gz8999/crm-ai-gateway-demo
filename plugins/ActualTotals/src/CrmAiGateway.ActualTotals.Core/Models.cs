using System;
using System.Collections.Generic;

namespace CrmAiGateway.ActualTotals.Core
{
    public sealed class ActualSnapshot
    {
        public Guid Id { get; set; }
        public Guid OpportunityId { get; set; }
        public Guid TransactionCurrencyId { get; set; }
        public decimal? AnnualRevenue { get; set; }
        public IDictionary<string, decimal?> MonthlyRevenue { get; set; } = new Dictionary<string, decimal?>();
    }

    public sealed class OpportunitySnapshot
    {
        public Guid Id { get; set; }
        public Guid TransactionCurrencyId { get; set; }
        public decimal? AnnualRevenue { get; set; }
    }

    public sealed class ActualTotalsIntegrityException : Exception
    {
        public ActualTotalsIntegrityException(string message) : base(message) { }
    }
}
