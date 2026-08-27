import { MONTHS } from "./phase1c5-synthetic-actuals.mjs";

export const SMOKE_UNSUPPORTED_FIELDS = Object.freeze([
  "aigw_fiscalyear",
  "aigw_annualactualgp",
  "aigw_annualactualmp",
]);

export const SMOKE_MONTHLY_REVENUE_FIELDS = Object.freeze(
  MONTHS.map((month) => `aigw_${month}actualrevenue`),
);

export const SMOKE_MONTHLY_PROFIT_FIELDS = Object.freeze(
  MONTHS.flatMap((month) => [
    `aigw_${month}actualgp`,
    `aigw_${month}actualmp`,
  ]),
);

export const SMOKE_REQUIRED_FIELDS = Object.freeze([
  "aigw_name",
  "aigw_opportunityid",
  "transactioncurrencyid",
  ...SMOKE_MONTHLY_REVENUE_FIELDS,
  ...SMOKE_MONTHLY_PROFIT_FIELDS,
  "aigw_annualactualrevenue",
]);

export const PLUGIN_BROWSER_SMOKE_CONTRACT = Object.freeze({
  version: "1.0",
  table: "aigw_actualmanagement",
  parentTable: "opportunity",
  requiredFields: SMOKE_REQUIRED_FIELDS,
  unsupportedFields: SMOKE_UNSUPPORTED_FIELDS,
  uniqueness: {
    scope: "opportunity",
    lookup: "aigw_opportunityid",
    maximumRelatedActuals: 1,
    fiscalYearField: null,
  },
  annualRevenue: {
    sourceFields: SMOKE_MONTHLY_REVENUE_FIELDS,
    childTarget: "aigw_annualactualrevenue",
    parentTarget: "aigw_yearrevenueactual",
    nullAsZero: true,
  },
  excludedAssertions: [
    "fiscal-year selection",
    "annual GP total",
    "annual MP total",
    "multi-fiscal-year uniqueness",
  ],
  sequence: [
    "read-only preflight",
    "create one synthetic Actual",
    "verify child and parent annual Revenue",
    "update one monthly Revenue",
    "verify both annual Revenue values changed",
    "reject a second Actual for the same Opportunity",
    "delete the created Actual",
    "verify the parent total is restored",
    "verify no smoke record remains",
  ],
});

export function validatePluginBrowserSmokeMetadata(logicalNames) {
  const available = new Set(logicalNames || []);
  return {
    missingRequiredFields: SMOKE_REQUIRED_FIELDS.filter((field) => !available.has(field)),
    unsupportedFieldsPresent: SMOKE_UNSUPPORTED_FIELDS.filter((field) => available.has(field)),
    ready: SMOKE_REQUIRED_FIELDS.every((field) => available.has(field)),
  };
}
