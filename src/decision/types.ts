import type { UnifiedAiOutput } from "./contract";
import type { HealthRankingItem, OpportunityHealthScore } from "../services/healthScoreEngine";

export type DecisionMode = "portfolio" | "scenario";
export type AmountDisplayMode = "range" | "exact";
export type DecisionDataSource = "d365-pilot" | "local-fixture";
export type PilotDepartmentId = "all" | "dept1-industry" | "dept1-distribution" | "dept2-lcms" | "dept3-project-cargo" | "dept3-dangerous-goods" | "ff" | "others";

export type DecisionScenarioDescriptor = {
  id: string;
  title: string;
  summary: string;
  count: number;
  defaultOpportunity: string;
};

export type SafeAccountAggregate = {
  accountToken: string;
  serviceCoverageBand: string;
  whitespaceCategory: string;
  opportunityTrend: string;
  relationshipMaturity: string;
};

export type SafeDecisionContext = {
  opportunityToken: string;
  customerToken: string;
  accountToken: string;
  ownerToken: string;
  salesDepartment?: string;
  opportunityState?: string;
  stage: string;
  priority: string;
  forecastCategory: string;
  relativeDateStatus: string;
  stagnationBand: string;
  revenueBand: string;
  marginBand: string;
  budgetBand: string;
  actualBand: string;
  amountBand?: string;
  annualRevenueBand?: string;
  annualMarginBand?: string;
  varianceCategory: string;
  budgetVarianceBand?: string;
  marginVarianceBand?: string;
  trend?: string;
  elapsedPeriodCategory: string;
  dataQualityCodes: string[];
  missingCodes: string[];
  contradictionCodes: string[];
  transportMode: string;
  routeConsistency: string;
  needSummary: string;
  proposalSummary: string;
  progressSummary: string;
  meetingWindow: string;
  stakeholderCoverage: string;
  openQuestionCount: number;
  decisionReadiness: string;
  closeFact?: string;
  timelineSignalCount?: number;
  coverageCategory?: string;
  accountAggregate: SafeAccountAggregate;
};

export type ScenarioDecisionPack = {
  cockpit: UnifiedAiOutput;
  risk: UnifiedAiOutput;
  opportunity360: UnifiedAiOutput;
  action: UnifiedAiOutput;
  meeting: UnifiedAiOutput;
  portfolio: UnifiedAiOutput;
};

export type DecisionView = {
  mode: DecisionMode;
  scenario: DecisionScenarioDescriptor | null;
  scopeSummary: { scopeCount: number; criticalCount: number; highCount: number; reviewRequiredCount: number };
  defaultOpportunity: string;
  selectedOpportunity: string;
  opportunities: Array<{
    opportunityToken: string;
    ownerToken: string;
    stage: string;
    priority: string;
    opportunityState?: string;
    salesDepartment?: string;
    healthScore: number;
    healthGrade: "S" | "A" | "B" | "C" | "D" | "Z";
    healthRank: number;
    mainDeductionDimension?: "pipeline" | "completeness" | "profitability" | "engagement" | "risk" | "confidence";
    scoreShowcase?: boolean;
    reviewRequired?: boolean;
  }>;
  safeContext: SafeDecisionContext;
  safeContextKeys: string[];
  pack: ScenarioDecisionPack;
  healthScore: OpportunityHealthScore;
  healthRanking: HealthRankingItem[];
  amountDisplay?: DecisionAmountDisplay;
  runtime?: PilotRuntimeMetadata;
};

export type DecisionOpportunityDetail = {
  mode: DecisionMode;
  scenario: DecisionScenarioDescriptor | null;
  safeContext: SafeDecisionContext;
  accountAggregate: SafeAccountAggregate;
  opportunity360: UnifiedAiOutput;
  healthScore: OpportunityHealthScore;
  amountDisplay?: DecisionAmountDisplay;
  runtime?: PilotRuntimeMetadata;
};

export type DecisionScenarioCatalog = {
  defaultMode: DecisionMode;
  portfolioDefaultOpportunity: string;
  scenarios: DecisionScenarioDescriptor[];
};

export type DecisionAmountDisplay = {
  mode: AmountDisplayMode;
  currency: string;
  values: Record<string, number | string>;
};

export type PilotRuntimeMetadata = {
  dataSource: "d365-pilot";
  sourceLabel: string;
  lastSyncTime: string;
  recordCount: number;
  fallbackStatus: "disabled";
  securityStatus: "safe-read-only";
  department: { id: PilotDepartmentId; label: string };
  completePilotScope: boolean;
  counts: Record<string, number>;
  stateDistribution: { active: number; won: number; lost: number };
};

export type PilotRuntimeStatus = {
  dataSource: "d365-pilot";
  label: string;
  available: boolean;
  runtimeState?: "starting" | "ready" | "failed";
  lastSyncTime: string;
  recordCount: number;
  counts: Record<string, number>;
  stateDistribution: { active: number; won: number; lost: number };
  departments: Array<{ id: PilotDepartmentId; label: string; opportunityCount: number; stateDistribution: { active: number; won: number; lost: number } }>;
  security: {
    hostnameAllowlist: boolean;
    pilotTokenAllowlist: boolean;
    getOnly: boolean;
    fallbackStatus: "disabled";
    customerIdentityMasked: boolean;
    exactAmountSentToModel: false;
    rawTimelineSent: false;
    crmWritebackEnabled: false;
    externalLlmEnabled: false;
    productionRequests: number;
  };
  requestStats: Record<string, number>;
};

export type CrmRuntimeStatus = {
  connectionStatus: "connected" | "unavailable" | "unknown";
  dataSourceMode: "hybrid" | "d365-pilot" | "local-fixture";
  accessMode: "GET-only";
  datasetVersion: string;
  datasetGeneratedAt: string;
  gatewayLoadedAt: string;
  lastSuccessfulD365ReadAt: string;
  statusCheckedAt: string;
  counts: Record<string, number>;
  requestStats: Record<string, number>;
  crmWritebackEnabled: false;
  productionAccess: false;
  sourceAlias: string;
};
