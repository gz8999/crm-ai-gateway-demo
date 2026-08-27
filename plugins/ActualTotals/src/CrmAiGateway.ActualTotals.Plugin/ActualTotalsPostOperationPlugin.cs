using System;
using CrmAiGateway.ActualTotals.Core;
using Microsoft.Xrm.Sdk;

namespace CrmAiGateway.ActualTotals.Plugin
{
    public sealed class ActualTotalsPostOperationPlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var runtime = new PluginRuntime(serviceProvider);
            if (runtime.Skip("ActualTotals.PostOperation")) return;
            PluginRuntime.Translate(() =>
            {
                var oldOpportunityId = EntityMapper.ToActual(runtime.PreImage ?? new Entity(FieldNames.ChildTable)).OpportunityId;
                var newEntity = runtime.PostImage ?? runtime.Target;
                var newOpportunityId = EntityMapper.ToActual(newEntity ?? new Entity(FieldNames.ChildTable)).OpportunityId;
                runtime.Totals.RecalculateAffectedOpportunities(oldOpportunityId, newOpportunityId);
            });
        }
    }
}
