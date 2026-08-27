using CrmAiGateway.ActualTotals.Core;
using Microsoft.Xrm.Sdk;

namespace CrmAiGateway.ActualTotals.Plugin
{
    public sealed class ActualTotalsPreValidationPlugin : IPlugin
    {
        public void Execute(System.IServiceProvider serviceProvider)
        {
            var runtime = new PluginRuntime(serviceProvider);
            if (runtime.Skip("ActualTotals.PreValidation")) return;
            PluginRuntime.Translate(() =>
            {
                var merged = EntityMapper.Merge(runtime.Target, runtime.PreImage);
                var candidate = EntityMapper.ToActual(merged);
                var exclude = runtime.Context.MessageName == "Update" ? (System.Guid?)runtime.Context.PrimaryEntityId : null;
                runtime.Totals.ValidateCandidate(candidate, exclude);
            });
        }
    }
}
