using System;
using System.Collections.Generic;
using System.Linq;
using CrmAiGateway.ActualTotals.Core;
using Xunit;

namespace CrmAiGateway.ActualTotals.Core.Tests
{
    public sealed class ActualTotalsServiceTests
    {
        private static readonly Guid OpportunityA = Guid.Parse("11111111-1111-1111-1111-111111111111");
        private static readonly Guid OpportunityB = Guid.Parse("22222222-2222-2222-2222-222222222222");
        private static readonly Guid CurrencyA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        private static readonly Guid CurrencyB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        private static readonly Guid ActualA = Guid.Parse("33333333-3333-3333-3333-333333333333");

        [Fact]
        public void MonthlyFieldsMatchManifestOrder()
        {
            Assert.Equal(new[] { "aigw_aprilactualrevenue", "aigw_mayactualrevenue", "aigw_juneactualrevenue", "aigw_julyactualrevenue", "aigw_augustactualrevenue", "aigw_septemberactualrevenue", "aigw_octoberactualrevenue", "aigw_novemberactualrevenue", "aigw_decemberactualrevenue", "aigw_januaryactualrevenue", "aigw_februaryactualrevenue", "aigw_marchactualrevenue" }, FieldNames.MonthlyRevenue);
        }

        [Fact]
        public void CreateWithAllMonthsCalculatesAnnualTotal()
        {
            var values = MonthValues(100m);
            Assert.Equal(1200m, ActualTotalsService.CalculateAnnualRevenue(values));
        }

        [Fact]
        public void NullMonthsAreZero()
        {
            var values = MonthValues(null);
            values[FieldNames.MonthlyRevenue[0]] = 25m;
            Assert.Equal(25m, ActualTotalsService.CalculateAnnualRevenue(values));
        }

        [Fact]
        public void MoneyUsesTwoDecimalAwayFromZeroRounding()
        {
            var values = MonthValues(0m);
            values[FieldNames.MonthlyRevenue[0]] = 10.005m;
            Assert.Equal(10.01m, ActualTotalsService.CalculateAnnualRevenue(values));
        }

        [Fact]
        public void UpdatingOneMonthRecalculatesAnnualTotal()
        {
            var values = MonthValues(10m);
            values[FieldNames.MonthlyRevenue[5]] = 40m;
            Assert.Equal(150m, ActualTotalsService.CalculateAnnualRevenue(values));
        }

        [Fact]
        public void MissingOpportunityIsRejected()
        {
            var store = DefaultStore();
            Assert.Throws<ActualTotalsIntegrityException>(() => new ActualTotalsService(store).ValidateCandidate(Actual(Guid.Empty, CurrencyA), null));
        }

        [Fact]
        public void CurrencyMismatchIsRejected()
        {
            var store = DefaultStore();
            Assert.Throws<ActualTotalsIntegrityException>(() => new ActualTotalsService(store).ValidateCandidate(Actual(OpportunityA, CurrencyB), null));
        }

        [Fact]
        public void SecondRecordForOpportunityIsRejected()
        {
            var store = DefaultStore();
            store.Actuals.Add(Actual(OpportunityA, CurrencyA, ActualA));
            Assert.Throws<ActualTotalsIntegrityException>(() => new ActualTotalsService(store).ValidateCandidate(Actual(OpportunityA, CurrencyA), null));
        }

        [Fact]
        public void ReparentToOccupiedOpportunityIsRejectedExcludingCurrentRecord()
        {
            var store = DefaultStore();
            store.Opportunities[OpportunityB] = new OpportunitySnapshot { Id = OpportunityB, TransactionCurrencyId = CurrencyA };
            store.Actuals.Add(Actual(OpportunityB, CurrencyA, Guid.NewGuid()));
            Assert.Throws<ActualTotalsIntegrityException>(() => new ActualTotalsService(store).ValidateCandidate(Actual(OpportunityB, CurrencyA, ActualA), ActualA));
        }

        [Fact]
        public void ReparentRecalculatesOldAndNewOpportunity()
        {
            var store = DefaultStore();
            store.Opportunities[OpportunityB] = new OpportunitySnapshot { Id = OpportunityB, TransactionCurrencyId = CurrencyA, AnnualRevenue = 0m };
            store.Actuals.Add(Actual(OpportunityB, CurrencyA, ActualA, 250m));
            new ActualTotalsService(store).RecalculateAffectedOpportunities(OpportunityA, OpportunityB);
            Assert.Equal(new[] { OpportunityA, OpportunityB }, store.Updates.Select(update => update.OpportunityId));
            Assert.Equal(new[] { 0m, 250m }, store.Updates.Select(update => update.Value));
        }

        [Fact]
        public void DeleteRecalculatesParentToZero()
        {
            var store = DefaultStore();
            store.Opportunities[OpportunityA].AnnualRevenue = 100m;
            new ActualTotalsService(store).RecalculateOpportunity(OpportunityA);
            Assert.Equal(0m, Assert.Single(store.Updates).Value);
        }

        [Fact]
        public void ZeroChildrenUpdatesParentToZero()
        {
            var store = DefaultStore();
            store.Opportunities[OpportunityA].AnnualRevenue = null;
            new ActualTotalsService(store).RecalculateOpportunity(OpportunityA);
            Assert.Equal(0m, Assert.Single(store.Updates).Value);
        }

        [Fact]
        public void OneChildUpdatesParentToAnnualTotal()
        {
            var store = DefaultStore();
            store.Actuals.Add(Actual(OpportunityA, CurrencyA, ActualA, 345.67m));
            new ActualTotalsService(store).RecalculateOpportunity(OpportunityA);
            Assert.Equal(345.67m, Assert.Single(store.Updates).Value);
        }

        [Fact]
        public void MultipleChildrenRaiseIntegrityError()
        {
            var store = DefaultStore();
            store.Actuals.Add(Actual(OpportunityA, CurrencyA, ActualA, 10m));
            store.Actuals.Add(Actual(OpportunityA, CurrencyA, Guid.NewGuid(), 20m));
            Assert.Throws<ActualTotalsIntegrityException>(() => new ActualTotalsService(store).RecalculateOpportunity(OpportunityA));
        }

        [Fact]
        public void UnchangedParentIsNotUpdated()
        {
            var store = DefaultStore();
            store.Opportunities[OpportunityA].AnnualRevenue = 100m;
            store.Actuals.Add(Actual(OpportunityA, CurrencyA, ActualA, 100m));
            new ActualTotalsService(store).RecalculateOpportunity(OpportunityA);
            Assert.Empty(store.Updates);
        }

        [Fact]
        public void DepthGuardSkipsNestedExecution()
        {
            Assert.True(ExecutionGuard.ShouldSkip(2, new Dictionary<string, object>(), "marker"));
        }

        [Fact]
        public void SharedVariableGuardSkipsDuplicateStageExecution()
        {
            var shared = new Dictionary<string, object>();
            Assert.False(ExecutionGuard.ShouldSkip(1, shared, "marker"));
            Assert.True(ExecutionGuard.ShouldSkip(1, shared, "marker"));
        }

        [Fact]
        public void ParentWriterSurfaceCannotWriteCnyOrBaseFields()
        {
            Assert.Equal("aigw_yearrevenueactual", FieldNames.ParentAnnualRevenue);
            Assert.DoesNotContain("_base", FieldNames.ParentAnnualRevenue);
            Assert.NotEqual(FieldNames.DeprecatedParentCny, FieldNames.ParentAnnualRevenue);
        }

        [Fact]
        public void UpdateFilteringAttributesExcludeGeneratedAnnualAndProfitFields()
        {
            Assert.Equal(14, FieldNames.UpdateFilteringAttributes.Count);
            Assert.DoesNotContain(FieldNames.ChildAnnualRevenue, FieldNames.UpdateFilteringAttributes);
            Assert.DoesNotContain(FieldNames.UpdateFilteringAttributes, field => field.EndsWith("actualgp") || field.EndsWith("actualmp"));
        }

        private static Dictionary<string, decimal?> MonthValues(decimal? value)
        {
            return FieldNames.MonthlyRevenue.ToDictionary(field => field, field => value);
        }

        private static ActualSnapshot Actual(Guid opportunityId, Guid currencyId, Guid? id = null, decimal? annual = null)
        {
            return new ActualSnapshot { Id = id ?? Guid.NewGuid(), OpportunityId = opportunityId, TransactionCurrencyId = currencyId, AnnualRevenue = annual, MonthlyRevenue = MonthValues(0m) };
        }

        private static FakeStore DefaultStore()
        {
            var store = new FakeStore();
            store.Opportunities[OpportunityA] = new OpportunitySnapshot { Id = OpportunityA, TransactionCurrencyId = CurrencyA, AnnualRevenue = 50m };
            return store;
        }

        private sealed class FakeStore : IActualTotalsStore
        {
            public Dictionary<Guid, OpportunitySnapshot> Opportunities { get; } = new Dictionary<Guid, OpportunitySnapshot>();
            public List<ActualSnapshot> Actuals { get; } = new List<ActualSnapshot>();
            public List<(Guid OpportunityId, decimal Value)> Updates { get; } = new List<(Guid OpportunityId, decimal Value)>();
            public OpportunitySnapshot GetOpportunity(Guid opportunityId) => Opportunities.ContainsKey(opportunityId) ? Opportunities[opportunityId] : null;
            public IReadOnlyList<ActualSnapshot> GetActuals(Guid opportunityId, Guid? excludingActualId = null) => Actuals.Where(actual => actual.OpportunityId == opportunityId && (!excludingActualId.HasValue || actual.Id != excludingActualId.Value)).ToList();
            public void UpdateOpportunityAnnualRevenue(Guid opportunityId, decimal annualRevenue) => Updates.Add((opportunityId, annualRevenue));
        }
    }
}
