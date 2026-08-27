import type { ActionBoardAction, AiActionName, AiActionResult, AiProviderStatus, RiskRadarCase } from "../types";

export type DecisionPriority = "Critical" | "High" | "Medium" | "Low" | "Monitor";
export type ConfidenceLevel = "High" | "Medium" | "Low";

export type DecisionFact = {
  label: string;
  value: string;
  source: string;
};

export type DecisionEvidence = {
  label: string;
  value: string;
  source: string;
};

export type DecisionConfidence = {
  level: ConfidenceLevel;
  reason: string;
};

export type DecisionRecommendedAction = {
  title: string;
  reason: string;
  owner: string;
  due: string;
  status: "Draft only";
};

export type UnifiedAiOutput = {
  id: string;
  title: string;
  fact: DecisionFact[];
  inference: string;
  evidence: DecisionEvidence[];
  confidence: DecisionConfidence;
  recommendedAction: DecisionRecommendedAction[];
  priority: DecisionPriority;
  providerUsed: string;
  fallbackReason: string;
  safeContextUsed: boolean;
  externalModelCalled: boolean;
  rawDataSent: boolean;
};

export type ProviderErrorObservation = {
  providerErrorObservabilityVersion: string;
  httpStatus: number;
  providerErrorCode: string | null;
  providerErrorType: string | null;
  providerErrorParam: string | null;
  sanitizedErrorMessage: string;
  requestCorrelationToken: string;
  responseTimestamp: string;
  endpointAlias: string;
  modelAlias: string;
  requestSchemaHash: string;
  requestBodyHash: string;
  responseBodyHash: string;
  bodyTruncated: boolean;
  bodyAvailable: boolean;
  contentType: string;
  bodyLength: number;
};

type ProviderAudit = {
  provider_used?: string;
  fallback_reason?: string;
  safe_context_used?: boolean;
  external_model_called?: boolean;
  raw_data_sent?: boolean;
  error_observation?: ProviderErrorObservation;
};

export function providerBoundary(status?: AiProviderStatus | null, audit: ProviderAudit = {}) {
  return {
    providerUsed: audit.provider_used || status?.provider || "demo",
    fallbackReason: audit.fallback_reason || status?.fallbackReason || "",
    safeContextUsed: audit.safe_context_used ?? status?.safeContextOnly ?? true,
    externalModelCalled: audit.external_model_called ?? false,
    rawDataSent: audit.raw_data_sent ?? status?.rawDataSent ?? false,
  };
}

export function adaptRiskCase(item: RiskRadarCase, status?: AiProviderStatus | null): UnifiedAiOutput {
  const evidence = splitEvidence(item.evidence);
  return {
    id: `risk:${item.opportunityToken}`,
    title: item.finding,
    fact: [
      fact("Opportunity", item.opportunityToken),
      fact("Stage", item.opportunityStage),
      fact("Amount band", item.estimatedQuoteBand),
      fact("Win probability", item.winProbability),
    ],
    inference: item.reason,
    evidence,
    confidence: confidenceFor(evidence, item.badges.includes("Decision Maker Unclear")),
    recommendedAction: (item.recommendedMitigation || []).slice(0, 3).map((title) => action(title, item.reason, item.ownerToken, "Next review")),
    priority: riskPriority(item.riskLevel),
    ...providerBoundary(status),
  };
}

export function adaptActionBoardItem(item: ActionBoardAction, status?: AiProviderStatus | null): UnifiedAiOutput {
  const evidence = splitEvidence(item.evidence);
  return {
    id: `action:${item.id}`,
    title: item.actionTitle,
    fact: [
      fact("Opportunity", item.opportunityToken),
      fact("Priority rank", item.priorityRank),
      fact("Due window", item.dueWindow),
    ],
    inference: item.actionReason,
    evidence,
    confidence: confidenceFor(evidence, false),
    recommendedAction: [action(item.actionDetail, item.actionReason, item.ownerToken, item.dueWindow)],
    priority: actionPriority(item.priorityRank),
    ...providerBoundary(status),
  };
}

export function adaptLegacyActionResult(
  actionName: AiActionName,
  response?: AiActionResult,
  status?: AiProviderStatus | null,
): UnifiedAiOutput | null {
  if (!response || response.blocked || !response.result) return null;
  const result = response.result as Record<string, unknown>;
  const evidenceValues = stringArray(result.evidence).length
    ? stringArray(result.evidence)
    : stringArray(result.key_drivers);
  const evidence = evidenceValues.map((value, index) => ({ label: `Evidence ${index + 1}`, value, source: "Safe CRM Context" }));
  const opportunityToken = safeText(result.opportunity_token) || "Portfolio scope";
  const inference = firstText(result, ["risk_summary", "one_line_summary", "customer_profile", "repair_plan", "markdown", "message"])
    || "Generate the existing deterministic action to view its decision output.";
  const nextActions = stringArray(result.next_actions);
  const itemActions = Array.isArray(result.items)
    ? result.items.slice(0, 3).map((item) => safeText((item as Record<string, unknown>).action)).filter(Boolean)
    : [];
  const recommended = [...nextActions, ...itemActions].slice(0, 3);
  return {
    id: `legacy:${actionName}:${opportunityToken}`,
    title: actionTitle(actionName),
    fact: [fact("Scope", opportunityToken), fact("Source", "Safe CRM Context")],
    inference,
    evidence,
    confidence: confidenceFor(evidence, evidence.length === 0),
    recommendedAction: (recommended.length ? recommended : ["Review the generated draft before any manual CRM action."])
      .map((title) => action(title, "Deterministic demoProvider recommendation", "Owner token", "Next review")),
    priority: actionName === "risk-summary" ? "High" : actionName === "data-doctor" ? "Medium" : "Monitor",
    ...providerBoundary(status, response.audit || {}),
  };
}

export function placeholderOutput(title: string, status?: AiProviderStatus | null): UnifiedAiOutput {
  return {
    id: `placeholder:${title}`,
    title,
    fact: [fact("Data state", "Local placeholder; no CRM record selected")],
    inference: "No AI inference has been generated.",
    evidence: [],
    confidence: { level: "Low", reason: "No generated result is available." },
    recommendedAction: [],
    priority: "Monitor",
    ...providerBoundary(status),
  };
}

function fact(label: string, value: string): DecisionFact {
  return { label, value: value || "Not provided", source: "Safe CRM Context" };
}

function action(title: string, reason: string, owner: string, due: string): DecisionRecommendedAction {
  return { title, reason, owner: owner || "Owner token", due, status: "Draft only" };
}

function splitEvidence(value = ""): DecisionEvidence[] {
  return String(value).split(" · ").filter(Boolean).map((item, index) => ({
    label: `Evidence ${index + 1}`,
    value: item,
    source: "Safe CRM Context",
  }));
}

function confidenceFor(evidence: DecisionEvidence[], uncertain: boolean): DecisionConfidence {
  if (uncertain || evidence.length === 0) return { level: "Low", reason: "Critical evidence is missing or requires verification." };
  if (evidence.length >= 3) return { level: "High", reason: "The inference is supported by three or more safe evidence points." };
  return { level: "Medium", reason: "The inference is supported by limited safe evidence." };
}

function riskPriority(value: RiskRadarCase["riskLevel"]): DecisionPriority {
  return value === "high" ? "High" : value === "medium" ? "Medium" : "Low";
}

function actionPriority(value: ActionBoardAction["priorityRank"]): DecisionPriority {
  if (value === "Must Win" || value === "Rescue Needed") return "High";
  if (value === "Follow-up Now") return "Medium";
  return "Monitor";
}

function actionTitle(value: AiActionName) {
  return {
    "opportunity-brief": "Opportunity 360 Brief",
    "next-best-actions": "Next Best Actions",
    "risk-summary": "Risk Summary",
    "data-doctor": "Data Doctor",
    "meeting-copilot": "Meeting Copilot",
    "customer-growth": "Growth Finder",
    "draft-pack": "Draft Pack",
  }[value];
}

function firstText(result: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = safeText(result[key]);
    if (value) return value.split("\n").find(Boolean) || value;
  }
  return "";
}

function safeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
