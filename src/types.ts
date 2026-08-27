export type Role = "Sales Owner" | "Sales Manager" | "Read-only User" | "CRM Admin";

export type Opportunity = {
  id: string;
  is_ai_demo?: boolean;
  opportunity_name: string;
  company: string;
  customer_code: string;
  customer_name: string;
  contact_name: string;
  contact_email: string;
  phone: string;
  exact_revenue: number;
  exact_margin: number;
  supplier_cost: number;
  contract_text: string;
  expected_order_date: string;
  owner_name: string;
  owner_id: string;
  department: string;
  stage: string;
  risk_level: string;
  risk_reason?: string;
  ai_suggested_action?: string;
  transport_mode: string;
  business_segment?: string;
  trade_lane?: string;
  cargo_type?: string;
  customer_need: string;
  proposal_type?: string;
  proposal_content: string;
  revenue_band?: string;
  margin_band?: string;
  forecast_category?: string;
  recurring_type?: string;
  customer_tier?: string;
  decision_maker_type?: string;
  data_quality_flags?: string[];
  source?: string;
};

export type OpportunityAiInsight = {
  opportunity_token: string;
  customer_token: string;
  owner_token: string;
  badges: string[];
  case_summary: string;
  current_status: string;
  main_risks: string[];
  next_best_actions: string[];
  materials_to_prepare: string[];
  executive_intervention: boolean;
  executive_intervention_reason: string;
};

export type AiInsightSummary = {
  demo_opportunity_count: number;
  high_risk_count: number;
  overdue_count: number;
  high_amount_count: number;
  executive_attention_count: number;
  follow_up_this_week_count: number;
  sales_department_distribution: Array<{ value: string; count: number }>;
  stage_distribution: Array<{ value: string; count: number }>;
  customer_need_distribution: Array<{ value: string; count: number }>;
  proposal_content_distribution: Array<{ value: string; count: number }>;
  badge_distribution: Array<{ value: string; count: number }>;
};

export type RiskRadarCase = {
  opportunityToken: string;
  customerToken: string;
  ownerToken: string;
  opportunityStage: string;
  winProbability: string;
  priority: string;
  estimatedQuoteBand: string;
  budgetAmountBand: string;
  riskLevel: "high" | "medium" | "low";
  badges: string[];
  riskReason: string;
  finding: string;
  reason: string;
  evidence: string;
  recommendedMitigation: string[];
  safety: string;
  score: number;
};

export type RiskRadarModel = {
  totalCount: number;
  driverSummary: Array<{ driver: string; count: number; mitigation: string }>;
  matrix: Array<{ stage: string; riskLevel: "high" | "medium" | "low"; count: number }>;
  riskCases: RiskRadarCase[];
  topRiskCases: RiskRadarCase[];
};

export type ActionBoardAction = {
  id: string;
  opportunityToken: string;
  customerToken: string;
  ownerToken: string;
  expectedOrderStatus: string;
  priority: string;
  winProbability: string;
  customerNeed: string;
  proposalContent: string;
  estimatedQuoteBand: string;
  decisionMakerStatus: string;
  relatedBadges: string[];
  priorityRank: "Must Win" | "Rescue Needed" | "Follow-up Now" | "Monitor" | "Low Priority";
  evidence: string;
  safety: string;
  actionType: string;
  actionSubtitle: string;
  actionTitle: string;
  actionDetail: string;
  actionReason: string;
  urgency: string;
  dueWindow: string;
  suggestedCrmUpdateDraft: string;
  score: number;
};

export type ActionBoardModel = {
  summary: {
    totalActions: number;
    urgentThisWeek: number;
    executiveEscalations: number;
    costBreakdownNeeded: number;
    decisionMakerConfirmationNeeded: number;
    overdueFollowUpNeeded: number;
  };
  ownerGroups: Array<{
    ownerToken: string;
    actionCount: number;
    urgentCount: number;
    executiveEscalationCount: number;
    actions: ActionBoardAction[];
  }>;
  actionTypeGroups: Array<{
    actionType: string;
    actionSubtitle: string;
    count: number;
    topOpportunities: string[];
    suggestedOwnerTokens: string[];
  }>;
  priorityRanks: Array<{
    rank: ActionBoardAction["priorityRank"];
    count: number;
    actionCount: number;
    topOpportunities: string[];
  }>;
  actions: ActionBoardAction[];
};

export type TransformRow = {
  sourceField: string;
  sourcePreview?: string;
  sourcePresent?: boolean;
  sourceMasked?: boolean;
  targetField: string;
  outputValue: unknown;
  method: string;
  label?: Record<string, string>;
  appName?: string;
  sensitivity?: string;
  safeTransform?: string;
  includeInSafeContext?: boolean;
  sourceSystem?: string;
  mappingStatus?: string;
  realLogicalNameConfirmed?: boolean | { company: boolean; trial: boolean };
  sourceLabel?: string;
  safeOutputPreview?: string;
};

export type CrmDataField = {
  label: Record<string, string>;
  appName: string;
  category: string;
  sensitivity: string;
  safeTransform: string;
  includeInSafeContext: boolean;
  sourceSystem?: string;
  mappingStatus?: string;
  realLogicalNameConfirmed?: boolean | { company: boolean; trial: boolean };
  sourceLabel?: string;
  value: unknown;
  rawPresent: boolean;
};

export type ChecklistItem = {
  label: string;
  pass: boolean;
};

export type TransformResult = {
  role: Role;
  opportunity_id: string;
  raw: Opportunity;
  crmData?: CrmDataField[];
  transformRows: TransformRow[];
  safePayload: Record<string, unknown>;
  checklist: ChecklistItem[];
  removedFields: string[];
  transformedFields?: string[];
  safeOpportunityContext?: Record<string, unknown>;
  raw_data_sent?: boolean;
  safe_context_used?: boolean;
  provider?: string;
  external_model_called?: boolean;
  blocked: boolean;
};

export type AiResult = {
  blocked: boolean;
  mode?: string;
  functionName?: string;
  title?: string;
  output?: string;
  answer?: string;
  jsonOutput?: {
    summary: string;
    findings: string[];
    risks: string[];
    recommendedActions: string[];
    requiredMaterials: string[];
    managementEscalation: boolean;
    safetyNote: string;
  };
  usedPayloadKeys?: string[];
  error?: string;
  provider?: string;
  external_model_called?: boolean;
  language?: string;
  audit?: Pick<AuditEntry,
    | "provider_used"
    | "external_model_called"
    | "fallback_used"
    | "fallback_reason"
    | "output_guard_status"
    | "response_format_requested"
    | "response_format_retry_used"
    | "safe_context_used"
    | "raw_data_sent"
    | "blocked_pattern_key"
  >;
};

export type AiDemoContextSummary = {
  data_source: string;
  dynamics_records: number;
  total_opportunities: number;
  safe_context_enabled: boolean;
  last_refresh_time: string;
};

export type AiDemoChatResult = {
  blocked: boolean;
  answer: string;
  error?: string;
  provider?: string;
  external_model_called?: boolean;
  intent?: string;
  context_summary: AiDemoContextSummary;
  audit?: AuditEntry;
};

export type AiProviderStatus = {
  provider: "demo" | "openai-compatible" | string;
  providerRequested?: string;
  externalAiEnabled: boolean;
  configured: boolean;
  safeContextOnly: boolean;
  rawDataSent: boolean;
  fallbackReason?: string;
  baseUrlConfigured?: boolean;
  apiKeyConfigured?: boolean;
  modelConfigured?: boolean;
  modelName?: string;
  timeoutMs?: number;
  retryPolicy?: string;
  maxResponseTokens?: number;
  schemaVersion?: string;
  lastConnectionCheckAt?: string;
  lastConnectionCheckResult?: string;
  comparisonFeatureEnabled?: boolean;
  comparisonAvailable?: boolean;
  controlledValidationPending?: boolean;
};

export type AiActionName = "opportunity-brief" | "next-best-actions" | "risk-summary" | "data-doctor" | "meeting-copilot" | "customer-growth" | "draft-pack";

export type AiActionResult = {
  blocked: boolean;
  error?: string;
  result: Record<string, unknown> | null;
  context_summary: AiDemoContextSummary;
  audit?: AuditEntry;
};

export type DashboardFilters = {
  opportunityStage?: string;
  winProbability?: string;
  riskLevel?: string;
  priority?: string;
  salesDepartment?: string;
  bookingDepartment?: string;
  organizationGroup?: string;
  opportunityType?: string;
  customerNeed?: string;
  proposalContent?: string;
  transportMode?: string;
  spotContinuous?: string;
  expectedOrderStatus?: string;
  amountBand?: string;
  ownerToken?: string;
};

export type ManagementDashboard = {
  filters: {
    scopeLabel?: string;
    stages: string[];
    winProbabilities?: string[];
    riskLevels: string[];
    priorities?: string[];
    salesDepartments?: string[];
    bookingDepartments?: string[];
    organizationGroups?: string[];
    opportunityTypes?: string[];
    customerNeeds?: string[];
    proposalContents?: string[];
    transportModes: string[];
    spotContinuousOptions?: string[];
    expectedOrderStatuses?: string[];
    amountBands?: string[];
    ownerTokens?: string[];
  };
  appliedFilters: DashboardFilters;
  filteredOpportunityIds?: string[];
  filteredCount?: number;
  totalDemoCount?: number;
  summaryPayload: Record<string, unknown>;
  kpis: Array<{ label: string; value: string; meta: string; description: string }>;
  pipelineHealth: Array<{
    stage: string;
    count: number;
    revenue_band: string;
    weighted_forecast_band: string;
    risk_amount_band: string;
    overdue_count: number;
    health_score: number;
  }>;
  riskHeatmap?: Array<{
    stage: string;
    risk_level: string;
    count: number;
  }>;
  topRiskOpportunities: Array<{
    priority?: number;
    opportunity_id: string;
    opportunity_name?: string;
    customer_token: string;
    owner_label: string;
    stage: string;
    business_segment?: string;
    transport_mode: string;
    revenue_band: string;
    margin_band: string;
    risk_level: string;
    expected_order_status: string;
    reason: string;
    ai_suggested_action?: string;
    score: number;
  }>;
  ownerActionBoard: Array<{
    owner_label: string;
    open_cases: number;
    high_risk: number;
    overdue: number;
    weighted_forecast_band: string;
    ai_comment: string;
  }>;
  customerPortfolio: Array<{
    customer_token: string;
    cases: number;
    won_cases?: number;
    revenue_grade: string;
    margin_grade: string;
    main_business?: string;
    ai_recommendation: string;
  }>;
  aiInsightSummary?: AiInsightSummary;
  aiInsightsByOpportunity?: Record<string, OpportunityAiInsight>;
  riskRadar?: RiskRadarModel;
  actionBoard?: ActionBoardModel;
};

export type DynamicsStatus = {
  dataSource: "mock" | "dynamics" | "hybrid" | string;
  isConfigured: boolean;
  canRefresh: boolean;
  lastRefreshTime: string;
  lastSyncStatus: string;
  recordCount: number;
  dataverseMatchedCount?: number;
  syncedDemoCount?: number;
  excludedNonDemoCount?: number;
  localTotalAfterSync?: number;
  previousLocalCount?: number;
  totalDataverseOpportunities?: number;
  scope?: string;
  lastError: string;
  dataverseUrl?: string;
};

export type AuditEntry = {
  id: string;
  timestamp: string;
  type: "transform" | "ai_call";
  role: Role;
  opportunity_id: string;
  removed_fields?: string[];
  safe_payload_keys?: string[];
  checklist_result?: string;
  intent?: string;
  functionName?: string;
  status?: string;
  blocked_reason?: string;
  output_summary?: string;
  provider?: string;
  external_model_called?: boolean;
  context_source?: string;
  safe_context_enabled?: boolean;
  raw_data_sent?: boolean;
  safe_context_used?: boolean;
  transformed_fields?: string[];
  provider_requested?: string;
  provider_used?: string;
  fallback_used?: boolean;
  fallback_reason?: string;
  safe_payload_char_count?: number;
  response_char_count?: number;
  request_id?: string;
  duration_ms?: number;
  timeout_ms?: number;
  language?: string;
  output_guard_status?: string;
  response_format_requested?: boolean;
  response_format_retry_used?: boolean;
  external_response_preview_sanitized?: string;
  external_response_parse_error?: string;
  blocked_pattern_key?: string;
};
