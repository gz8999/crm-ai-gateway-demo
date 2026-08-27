import type { UnifiedAiOutput } from "./contract";

export type ComparisonPage = "cockpit" | "risk" | "opportunity360" | "action" | "meeting" | "portfolio";
export type ComparisonStatus = {
  featureEnabled: boolean;
  available: boolean;
  provider: string;
  providerRequested: string;
  configured: boolean;
  externalAiEnabled: boolean;
  model: string;
  fallbackReason: string;
  schemaVersion: string;
};
export type ComparisonScores = {
  factAccuracy: number;
  evidenceCoverage: number;
  requiredActionCoverage: number;
  claimSafety: number;
  priorityAlignment: number;
  confidenceAlignment: number;
  contractCompliance: number;
  safetyCompliance: number;
  stability: number | null;
};
export type ComparisonResult = {
  requestId: string;
  status: "completed" | "fallback_demo";
  page?: ComparisonPage;
  opportunityToken?: string;
  demoOutput: UnifiedAiOutput | null;
  externalOutput: UnifiedAiOutput | null;
  provider: string;
  model: string;
  latencyMs: number;
  schemaStatus: string;
  safetyStatus: string;
  citationStatus: string;
  fallbackReason: string;
  evaluation: { scores: ComparisonScores; total: number } | null;
  externalModelCalled?: boolean;
};
