import { buildAiDemoContext, buildProviderContext, validateSafeContext } from "./contextBuilder.mjs";
import { buildDataDoctor } from "./actions/dataDoctor.mjs";
import { buildDraftPack } from "./actions/draftPack.mjs";
import { buildCustomerGrowth } from "./actions/customerGrowth.mjs";
import { buildMeetingCopilot } from "./actions/meetingCopilot.mjs";
import { buildNextBestActions } from "./actions/nextBestAction.mjs";
import { buildOpportunityBrief } from "./actions/opportunityBrief.mjs";
import { buildRiskSummary } from "./actions/riskSummary.mjs";

const actionMap = {
  "opportunity-brief": buildOpportunityBrief,
  "next-best-actions": buildNextBestActions,
  "risk-summary": buildRiskSummary,
  "data-doctor": buildDataDoctor,
  "meeting-copilot": buildMeetingCopilot,
  "customer-growth": buildCustomerGrowth,
  "draft-pack": buildDraftPack,
};

export function runAiAction({ actionName, opportunities, dynamicsStatus, params = {}, now = new Date() }) {
  const context = buildAiDemoContext({
    opportunities,
    filters: params.filters || {},
    dynamicsStatus,
    now,
  });
  const providerContext = buildProviderContext(context);
  const validation = validateSafeContext(providerContext);
  const providerPayload = { safeOpportunityContext: providerContext.safeOpportunityContext };
  if (!validation.ok) {
    return actionResponse({
      actionName,
      blocked: true,
      error: validation.reason,
      context,
      providerContext,
      result: null,
    });
  }
  const build = actionMap[actionName];
  if (!build) {
    return actionResponse({
      actionName,
      blocked: true,
      error: `Unsupported AI action: ${actionName}`,
      context,
      providerContext,
      result: null,
    });
  }
  const result = build({
    context: providerPayload,
    opportunity_id: params.opportunity_id,
    customer_token: params.customer_token,
    filters: params.filters || {},
    role: params.role || "management",
    language: params.language || "zh-CN",
  });
  const resultValidation = validateSafeContext({ result });
  if (!resultValidation.ok) {
    return actionResponse({
      actionName,
      blocked: true,
      error: resultValidation.reason,
      context,
      providerContext,
      result: null,
    });
  }
  return actionResponse({ actionName, blocked: false, context, providerContext, result });
}

function actionResponse({ actionName, blocked, error = "", context, providerContext, result }) {
  const safePayloadKeys = ["safeOpportunityContext"];
  const audit = {
    type: "ai_call",
    role: "management",
    opportunity_id: actionName,
    intent: actionName,
    functionName: actionName,
    status: blocked ? "blocked" : "generated",
    blocked_reason: error,
    removed_fields: ["customer_name", "contact_name", "contact_email", "phone", "address", "detailed_address", "exact_revenue", "exact_margin", "supplier_cost", "contract_text", "contract_price", "meeting_transcript"],
    safe_payload_keys: safePayloadKeys,
    context_source: context.contextSummary?.data_source || "mock",
    safe_context_enabled: true,
    provider: "demo",
    external_model_called: false,
    output_summary: JSON.stringify(result || {}).slice(0, 140),
  };
  return {
    blocked,
    error,
    result,
    context_summary: context.contextSummary,
    audit,
  };
}
