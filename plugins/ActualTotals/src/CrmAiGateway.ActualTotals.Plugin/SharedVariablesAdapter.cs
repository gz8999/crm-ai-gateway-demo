using System;
using System.Collections.Generic;

namespace CrmAiGateway.ActualTotals.Plugin
{
    internal static class SharedVariablesAdapter
    {
        public static IDictionary<string, object> ToDictionary(IEnumerable<KeyValuePair<string, object>> values)
        {
            var result = new Dictionary<string, object>(StringComparer.Ordinal);
            if (values == null) return result;
            foreach (var pair in values) result[pair.Key] = pair.Value;
            return result;
        }
    }
}
