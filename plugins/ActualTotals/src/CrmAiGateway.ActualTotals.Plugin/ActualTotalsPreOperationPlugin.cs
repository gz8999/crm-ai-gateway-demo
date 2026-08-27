using CrmAiGateway.ActualTotals.Core;
using Microsoft.Xrm.Sdk;

namespace CrmAiGateway.ActualTotals.Plugin
{
    public sealed class ActualTotalsPreOperationPlugin : IPlugin
    {
        public void Execute(System.IServiceProvider serviceProvider)
        {
            var runtime = new PluginRuntime(serviceProvider);
            if (runtime.Skip("ActualTotals.PreOperation")) return;
            PluginRuntime.Translate(() =>
            {
                var merged = EntityMapper.Merge(runtime.Target, runtime.PreImage);
                var snapshot = EntityMapper.ToActual(merged);
                var total = ActualTotalsService.CalculateAnnualRevenue(snapshot.MonthlyRevenue);
                if (ActualTotalsService.MoneyChanged(snapshot.AnnualRevenue, total)) runtime.Target[FieldNames.ChildAnnualRevenue] = new Money(total);
            });
        }
    }
}
