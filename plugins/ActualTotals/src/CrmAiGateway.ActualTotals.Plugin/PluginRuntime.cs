using System;
using CrmAiGateway.ActualTotals.Core;
using Microsoft.Xrm.Sdk;

namespace CrmAiGateway.ActualTotals.Plugin
{
    internal sealed class PluginRuntime
    {
        public IPluginExecutionContext Context { get; }
        public IOrganizationService Service { get; }
        public ITracingService Trace { get; }
        public ActualTotalsService Totals { get; }

        public PluginRuntime(IServiceProvider provider)
        {
            Context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            Trace = (ITracingService)provider.GetService(typeof(ITracingService));
            var factory = (IOrganizationServiceFactory)provider.GetService(typeof(IOrganizationServiceFactory));
            Service = factory.CreateOrganizationService(Context.UserId);
            Totals = new ActualTotalsService(new DataverseActualTotalsStore(Service));
        }

        public Entity Target => Context.InputParameters.Contains("Target") ? Context.InputParameters["Target"] as Entity : null;
        public Entity PreImage => Context.PreEntityImages.Contains("PreImage") ? Context.PreEntityImages["PreImage"] : null;
        public Entity PostImage => Context.PostEntityImages.Contains("PostImage") ? Context.PostEntityImages["PostImage"] : null;

        public bool Skip(string marker)
        {
            var sharedVariables = SharedVariablesAdapter.ToDictionary(Context.SharedVariables);
            var shouldSkip = ExecutionGuard.ShouldSkip(Context.Depth, sharedVariables, marker);
            if (!shouldSkip && sharedVariables.ContainsKey(marker)) Context.SharedVariables[marker] = sharedVariables[marker];
            return shouldSkip;
        }

        public static void Translate(Action action)
        {
            try { action(); }
            catch (ActualTotalsIntegrityException error) { throw new InvalidPluginExecutionException(error.Message, error); }
        }
    }
}
