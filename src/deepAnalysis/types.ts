import type { DecisionMode } from "../decision/types";

export type DeepAnalysisTemplate = {
  code: string; title: string; description: string; targetRole: string; requiredData: string[]; optionalData: string[]; unavailableDependencies: string[]; providerPolicy: string; estimatedDuration: string; enabled: boolean; runtimeEnabled: boolean; blockedReason: string; outputSections: string[]; version: string; status: "可执行" | "受限" | "依赖未接入" | "外部情报未启用";
};

export type DeepAnalysisCatalog = { featureEnabled: boolean; role: "demo-full-access"; provider: "demo" | "openai-compatible"; externalModelAvailable: boolean; templates: DeepAnalysisTemplate[] };
export type AnalysisContextMode = "standard_safe" | "high_fidelity_identity_redacted";
export type ResponseLocale = "zh-CN" | "ja-JP" | "en-US";

export type DeepAnalysisPreview = {
  templateCode: string; templateVersion: string; opportunityToken: string; accountToken: string; role: string; departmentScopeStatus: string; mode: DecisionMode; dataTimeRange: string; amountMode: string; availableData: string[]; missingDependencies: string[]; providerPolicy: string; provider: "demo" | "openai-compatible"; externalModelAvailable: boolean; externalModelCalled: false; safeContextUsed: true; rawDataSent?: boolean; exactAmountSentToModel?: boolean; timelineRawTextSent?: boolean; sanitizedTimelineEvidenceSent?: boolean; safeContextHash: string; neverSent: string[]; currentLimitations: string[]; analysisContextMode?: AnalysisContextMode; highFidelityAvailable?: boolean; highFidelityConfirmationRequired?: boolean; responseLocale?: ResponseLocale; crmBusinessTextIncluded?: boolean; timelineBusinessTextIncluded?: boolean; exactAmountIncluded?: boolean; exactDateIncluded?: boolean; routeAndCommercialTermsIncluded?: boolean; customerCompanyMasked?: boolean; customerContactMasked?: boolean; redactionRuleVersion?: string; rawUnredactedCustomerIdentitySent?: boolean; identityRedactedBusinessTextSent?: boolean; crmWritebackEnabled?: boolean;
};

export type DeepAnalysisFact = { label: string; value: string; source: string; sourceType: "crm_current" };
export type TimelineSynthesisItem = { code: string; label?: string; statement?: string; count?: number; evidenceTokens: string[]; status?: "Draft" };
export type TimelineExecutiveSynthesis = {
  overallConclusion: string;
  overallCode: string;
  momentumTrend: { code: string; statement: string };
  customerPosition: { code: string; statement: string };
  decisionClarity: { code: string; statement: string };
  stakeholderDynamics: { code: string; statement: string; roles?: string[] };
  keyThemes: TimelineSynthesisItem[];
  topBlockers: TimelineSynthesisItem[];
  commitmentSummary: { code: string; statement: string; madeCount: number; completedCount: number; openCount: number };
  contradictions: TimelineSynthesisItem[];
  opportunitySignals: TimelineSynthesisItem[];
  managementActions: TimelineSynthesisItem[];
  confidence: { level: string; reason: string };
  coverage: { level: string; activityCount: number; eventCount: number; representativeEvidenceCount: number };
  representativeEvidenceTokens: string[];
  limitations: string[];
  representativeEvidence: TimelineEvidence[];
};
export type TimelineEvidence = { evidenceToken: string; relativeTime: string; activityType: string; summary: string; supports: string[] };
export type DeepAnalysisOutput = {
  requestId: string; templateCode: string; templateVersion: string; title: string; executiveSummary: string; crmFacts: DeepAnalysisFact[]; timelineFacts: DeepAnalysisFact[]; timelineFindings: Array<{ label: string; statement: string; evidenceRefs: string[] }>; timelineExecutiveSynthesis: TimelineExecutiveSynthesis; timelineEvidence: TimelineEvidence[]; customerHistoryFacts: DeepAnalysisFact[]; externalFacts: DeepAnalysisFact[]; internalCapabilityFacts: DeepAnalysisFact[]; aiInferences: Array<{ label: string; statement: string; evidenceRefs: string[] }>; risks: string[]; opportunities: string[]; scenarios: Array<{ name: string; direction: string; summary: string }>; recommendedActions: Array<{ action: string; reason: string; suggestedRole: string; suggestedHorizon: string; evidenceRefs: string[]; source: string; status: string }>; confidence: { level: string; reason: string }; limitations: string[]; sources: Array<{ type: string; ref: string }>; provider: { used: "demo" | "openai-compatible"; policy: string; model?: string; externalModelCalled: boolean }; safety: { safeContextUsed: true; rawDataSent?: false; exactAmountSentToModel?: false; timelineRawTextSent?: false; sanitizedTimelineEvidenceSent?: boolean; customerIdentitySent: false; crmWritebackEnabled: false; externalLlmEnabled: boolean; analysisContextMode?: AnalysisContextMode; crmBusinessTextIncluded?: boolean; timelineBusinessTextIncluded?: boolean; exactAmountIncluded?: boolean; exactDateIncluded?: boolean; routeAndCommercialTermsIncluded?: boolean; customerCompanyMasked?: boolean; customerContactMasked?: boolean; rawUnredactedCustomerIdentitySent?: boolean; identityRedactedBusinessTextSent?: boolean };
};

export type DeepAnalysisResult = { requestId: string; status: string; progress: string[]; preview: DeepAnalysisPreview; output: DeepAnalysisOutput | null; schemaStatus: string; safetyStatus: string; citationStatus: string; latencyMs: number };
export type DeepAnalysisPhase = "未开始" | "等待确认" | "构建 Safe Context" | "安全检查" | "模型分析中" | "Demo 分析中" | "输出结构校验" | "安全校验" | "完成" | "已取消" | "已阻断" | "失败";
