using System;
using System.Collections.Generic;
using CrmAiGateway.ActualTotals.Core;
using CrmAiGateway.ActualTotals.Plugin;
using Xunit;

namespace CrmAiGateway.ActualTotals.Core.Tests
{
    public sealed class SharedVariablesAdapterTests
    {
        [Fact]
        public void EmptyCollectionCreatesEmptyOrdinalDictionary()
        {
            var result = SharedVariablesAdapter.ToDictionary(Array.Empty<KeyValuePair<string, object>>());
            Assert.Empty(result);
            Assert.False(result.ContainsKey("guard"));
        }

        [Fact]
        public void ValuesKeepTheirKeysAndRuntimeTypes()
        {
            var reference = new object();
            var source = new[]
            {
                new KeyValuePair<string, object>("enabled", true),
                new KeyValuePair<string, object>("count", 3),
                new KeyValuePair<string, object>("reference", reference),
            };

            var result = SharedVariablesAdapter.ToDictionary(source);

            Assert.True((bool)result["enabled"]);
            Assert.Equal(3, (int)result["count"]);
            Assert.Same(reference, result["reference"]);
        }

        [Fact]
        public void ExistingGuardMarkerIsRecognized()
        {
            var result = SharedVariablesAdapter.ToDictionary(new[]
            {
                new KeyValuePair<string, object>("actual-totals", true),
            });

            Assert.True(ExecutionGuard.ShouldSkip(1, result, "actual-totals"));
        }

        [Fact]
        public void NewGuardMarkerRequiresExplicitSdkCollectionWriteBack()
        {
            var sdkLikeCollection = new Dictionary<string, object>(StringComparer.Ordinal);
            var copied = SharedVariablesAdapter.ToDictionary(sdkLikeCollection);

            Assert.False(ExecutionGuard.ShouldSkip(1, copied, "actual-totals"));
            Assert.False(sdkLikeCollection.ContainsKey("actual-totals"));

            sdkLikeCollection["actual-totals"] = copied["actual-totals"];
            Assert.True((bool)sdkLikeCollection["actual-totals"]);
        }
    }
}
