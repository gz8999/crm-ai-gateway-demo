using System;
using System.Collections.Generic;

namespace CrmAiGateway.ActualTotals.Core
{
    public interface IActualTotalsStore
    {
        OpportunitySnapshot GetOpportunity(Guid opportunityId);
        IReadOnlyList<ActualSnapshot> GetActuals(Guid opportunityId, Guid? excludingActualId = null);
        void UpdateOpportunityAnnualRevenue(Guid opportunityId, decimal annualRevenue);
    }
}
