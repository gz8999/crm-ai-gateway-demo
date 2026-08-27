export type HealthScoreGrade = "S" | "A" | "B" | "C" | "D" | "Z";
export type HealthScoreDimension = "pipeline" | "completeness" | "profitability" | "engagement" | "risk" | "confidence";
export type HealthScoreDimensions = Record<HealthScoreDimension, number>;

export type HealthScoreInsight = {
  label: string;
  detail: string;
  source: string;
};

export type HealthScoreAction = {
  title: string;
  reason: string;
  source: string;
  status: "Draft only";
};

export type HealthScoreEvidence = {
  dimension: HealthScoreDimension;
  label: string;
  value: string;
  source: string;
  score: number;
};

export type OpportunityHealthScore = {
  version: "2.0";
  healthScore: number;
  grade: HealthScoreGrade;
  dimensions: HealthScoreDimensions;
  keyStrengths: HealthScoreInsight[];
  keyRisks: HealthScoreInsight[];
  recommendedActions: HealthScoreAction[];
  evidence: HealthScoreEvidence[];
  confidence: "High" | "Medium" | "Low";
  confidenceReason: string;
  evidenceCoverage: number;
  dataQualityStatus: "clear" | "review-required" | "contradiction";
  deterministic: true;
  safeContextUsed: true;
  externalModelCalled: false;
  rawDataSent: false;
};

export type HealthRankingItem = {
  opportunityToken: string;
  opportunityState: string;
  priority: string;
  healthScore: number;
  grade: HealthScoreGrade;
  rank: number;
};

export type HealthScoreSummary = {
  count: number;
  averageScore: number;
  minimumScore: number;
  maximumScore: number;
  distribution: Record<HealthScoreGrade, number>;
  deterministic: boolean;
  safety: { rawDataSent: boolean; externalModelCalled: boolean };
};

export function scoreOpportunityHealth(safeContext: Record<string, unknown>): OpportunityHealthScore;
export function rankHealthScores(safeContexts: Array<Record<string, unknown>>): HealthRankingItem[];
export function healthGradeLabel(grade: HealthScoreGrade): string;
export function gradeForHealthScore(score: number): HealthScoreGrade;
export function summarizeHealthScores(scores: OpportunityHealthScore[]): HealthScoreSummary;
export const HEALTH_SCORE_VERSION: "2.0";
export const HEALTH_SCORE_THRESHOLDS: Readonly<Record<HealthScoreGrade, number>>;
export const HEALTH_SCORE_GRADES: readonly HealthScoreGrade[];
