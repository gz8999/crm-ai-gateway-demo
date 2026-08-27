using System.Collections.Generic;

namespace CrmAiGateway.ActualTotals.Core
{
    public static class FieldNames
    {
        public const string ChildTable = "aigw_actualmanagement";
        public const string ChildId = "aigw_actualmanagementid";
        public const string OpportunityTable = "opportunity";
        public const string OpportunityId = "opportunityid";
        public const string OpportunityLookup = "aigw_opportunityid";
        public const string TransactionCurrency = "transactioncurrencyid";
        public const string ChildAnnualRevenue = "aigw_annualactualrevenue";
        public const string ParentAnnualRevenue = "aigw_yearrevenueactual";
        public const string DeprecatedParentCny = "aigw_yearrevenueactualcny";

        public static readonly IReadOnlyList<string> MonthlyRevenue = new[]
        {
            "aigw_aprilactualrevenue",
            "aigw_mayactualrevenue",
            "aigw_juneactualrevenue",
            "aigw_julyactualrevenue",
            "aigw_augustactualrevenue",
            "aigw_septemberactualrevenue",
            "aigw_octoberactualrevenue",
            "aigw_novemberactualrevenue",
            "aigw_decemberactualrevenue",
            "aigw_januaryactualrevenue",
            "aigw_februaryactualrevenue",
            "aigw_marchactualrevenue"
        };

        public static IReadOnlyList<string> UpdateFilteringAttributes
        {
            get
            {
                var fields = new List<string>(MonthlyRevenue)
                {
                    OpportunityLookup,
                    TransactionCurrency
                };
                return fields;
            }
        }
    }
}
