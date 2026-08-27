export const DEMO_PROVIDER = "demo";

export function generateDemoResponse({ functionName, payload, language = "zh-CN" }) {
  if (functionName === "management-summary") {
    return generateManagementSummary(payload, language);
  }
  return generateCaseResponse(functionName, payload, language);
}

export function generateDemoChatAnswer({ question = "", context = {}, language = "zh-CN" }) {
  const intent = detectIntent(question);
  const opportunities = context.safeOpportunityContext || [];
  const aggregate = aggregateFromSafeOpportunities(opportunities, context.contextSummary || {});
  if (opportunities.length === 0) {
    return chatResult({
      intent,
      language,
      answer: "当前筛选范围内没有发现相关案件。建议调整筛选条件，或先点击 Refresh from Dynamics 同步最新 CRM Demo 数据。",
      usedPayloadKeys: Object.keys(context),
    });
  }

  const answer = {
    risk_overview: riskOverview(opportunities, aggregate),
    priority_follow_up: priorityFollowUp(opportunities),
    pipeline_summary: pipelineSummary(aggregate),
    customer_portfolio: customerPortfolio(aggregate),
    owner_action: ownerAction(aggregate),
    data_quality: dataQuality(aggregate, opportunities),
    general_summary: generalSummary(aggregate, context.contextSummary),
  }[intent];
  return chatResult({ intent, language, answer, usedPayloadKeys: Object.keys(context) });
}

function generateManagementSummary(payload, language) {
  const stageFocus = topByCount(payload.stage_mix, "stage") || "L3 Proposal";
  const riskFocus = topByCount(payload.risk_mix, "risk_level") || "High";
  const segmentFocus = topByCount(payload.business_segment_mix, "value") || "Freight Forwarding";
  const modeFocus = topByCount(payload.transport_mode_mix, "value") || "OE";
  const sourceIntro = sourceDescription(payload.context_source);

  return {
    blocked: false,
    mode: "Demo AI",
    provider: DEMO_PROVIDER,
    external_model_called: false,
    language,
    functionName: "management-summary",
    title: "AI Management Summary",
    output: [
      sourceIntro,
      `总体判断：本期筛选范围内共有 ${payload.record_count ?? 0} 个销售案件，open cases 为 ${payload.open_cases ?? 0} 个，open pipeline 处于 ${payload.open_pipeline_band || "N/A"} 区间，加权 forecast 为 ${payload.weighted_forecast_band || "N/A"}，forecast achievement 为 ${payload.forecast_achievement || "0%" }。`,
      `主要风险：高风险 pipeline 处于 ${payload.high_risk_pipeline_band || "N/A"} 区间，逾期案件 ${payload.overdue_opportunities ?? 0} 个，当前风险关注点集中在 ${riskFocus} 风险案件以及需要及时更新预计下单状态的机会。`,
      `重点业务 / 阶段：当前管理重点建议聚焦 ${segmentFocus} / ${modeFocus} 相关机会，并优先跟进 ${stageFocus} 阶段的推进质量、报价反馈和客户决策时间。`,
      `建议管理动作：请销售负责人在本周内确认高金额和逾期案件的下一步行动，复核低毛利报价边界，并补齐 CRM 关键字段。Data Quality Score 当前为 ${payload.data_quality_score ?? 0}/100，数据已通过 Gateway 脱敏后可用于 AI 辅助营业会议。`,
    ].join("\n\n"),
    usedPayloadKeys: Object.keys(payload),
  };
}

function chatResult({ intent, language, answer, usedPayloadKeys }) {
  return {
    blocked: false,
    mode: "Demo AI",
    provider: DEMO_PROVIDER,
    external_model_called: false,
    language,
    functionName: "ai-demo-chat",
    intent,
    answer,
    output: answer,
    usedPayloadKeys,
  };
}

function detectIntent(question) {
  const text = String(question || "").toLowerCase();
  if (/数据质量|异常|缺失|quality|missing|error/.test(text)) return "data_quality";
  if (/负责人|销售担当|owner|担当/.test(text)) return "owner_action";
  if (/客户组合|重点客户|交叉销售|cross|portfolio|客户/.test(text)) return "customer_portfolio";
  if (/pipeline|预测|阶段|达成|forecast/.test(text)) return "pipeline_summary";
  if (/本周|优先|跟进|行动|follow|priority|action/.test(text)) return "priority_follow_up";
  if (/风险|危险|管理层介入|高风险|risk|escalat/.test(text)) return "risk_overview";
  return "general_summary";
}

function riskOverview(opportunities, aggregate) {
  const risky = topRisk(opportunities);
  if (risky.length === 0) return "当前筛选范围内没有发现高风险或逾期案件。建议继续保持 CRM 下一步行动和预计下单日期更新。";
  return [
    `当前主要风险集中在 ${aggregate.high_risk_count ?? risky.length} 个高风险案件，逾期案件 ${aggregate.overdue_count ?? 0} 个。建议管理层优先查看以下机会：`,
    ...risky.map((item, index) => `${index + 1}. ${item.opportunity_token} / ${item.customer_token}：${item.stage}，${item.risk_level}，${item.revenue_band}，原因：${item.risk_reason}。建议：${item.ai_suggested_action}`),
  ].join("\n");
}

function priorityFollowUp(opportunities) {
  const items = topRisk(opportunities).slice(0, 5);
  if (items.length === 0) return "当前筛选范围内没有发现需要优先跟进的高风险案件。建议检查是否已同步最新 CRM Demo 数据。";
  return [
    "本周建议优先跟进以下案件：",
    ...items.map((item, index) => `${index + 1}. ${item.opportunity_token} / ${item.customer_token}：${item.expected_order_status}，${item.stage}，${item.ai_suggested_action}`),
  ].join("\n");
}

function pipelineSummary(aggregate) {
  const stage = topByCount(aggregate.stage_distribution, "stage") || "N/A";
  const risk = topByCount(aggregate.risk_distribution, "risk_level") || "N/A";
  return [
    `当前 Pipeline 共 ${aggregate.total_opportunities ?? 0} 个机会，高风险 ${aggregate.high_risk_count ?? 0} 个，逾期 ${aggregate.overdue_count ?? 0} 个。`,
    `阶段分布重点在 ${stage}，风险分布重点在 ${risk}。建议结合 Stage Health 检查报价阶段和预计下单日期是否及时更新。`,
  ].join("\n");
}

function customerPortfolio(aggregate) {
  const customers = aggregate.customer_portfolio_summary || [];
  if (customers.length === 0) return "当前筛选范围内没有客户组合数据。";
  return [
    "客户组合建议如下：",
    ...customers.slice(0, 5).map((item, index) => `${index + 1}. ${item.customer_token}：${item.cases} 个案件，${item.won_cases ?? 0} 个 won，收入 ${item.revenue_grade}，毛利 ${item.margin_grade}，主营 ${item.main_business || "Mixed"}。建议：${item.ai_recommendation}`),
  ].join("\n");
}

function ownerAction(aggregate) {
  const owners = aggregate.owner_action_summary || [];
  if (owners.length === 0) return "当前筛选范围内没有负责人行动数据。";
  return [
    "负责人行动建议如下：",
    ...owners.slice(0, 5).map((item, index) => `${index + 1}. ${item.owner_label}：open ${item.open_cases}，high risk ${item.high_risk}，overdue ${item.overdue}，weighted forecast ${item.weighted_forecast_band}。${item.ai_comment}`),
  ].join("\n");
}

function dataQuality(aggregate, opportunities) {
  const flagged = opportunities.filter((item) => Array.isArray(item.data_quality_flags) && item.data_quality_flags.length > 0);
  if (flagged.length === 0) return `当前 Data Quality Score 为 ${aggregate.data_quality_score ?? 100}/100，筛选范围内未发现明显数据质量异常。`;
  return [
    `当前 Data Quality Score 为 ${aggregate.data_quality_score ?? 0}/100，建议优先修复以下 CRM 数据质量问题：`,
    ...flagged.slice(0, 5).map((item, index) => `${index + 1}. ${item.opportunity_token} / ${item.customer_token}：${item.data_quality_flags.join(", ")}。`),
  ].join("\n");
}

function generalSummary(aggregate, contextSummary = {}) {
  return [
    sourceDescription(contextSummary.data_source || aggregate.context_source),
    `当前安全上下文包含 ${aggregate.total_opportunities ?? 0} 个机会，其中 Dynamics ${aggregate.dynamics_record_count ?? 0} 个、mock ${aggregate.mock_record_count ?? 0} 个。`,
    `高风险 ${aggregate.high_risk_count ?? 0} 个，逾期 ${aggregate.overdue_count ?? 0} 个，Data Quality Score 为 ${aggregate.data_quality_score ?? 0}/100。建议从 Top Risk Opportunities、Owner Action Board 和 Customer Portfolio 三个角度安排本周管理动作。`,
  ].join("\n");
}

function topRisk(opportunities) {
  return [...opportunities]
    .filter((item) => ["High", "Critical"].includes(item.risk_level) || String(item.expected_order_status || "").startsWith("overdue"))
    .sort((a, b) => riskScore(b) - riskScore(a))
    .slice(0, 5);
}

function aggregateFromSafeOpportunities(opportunities, contextSummary = {}) {
  const source = Array.isArray(opportunities) ? opportunities : [];
  return {
    total_opportunities: source.length,
    dynamics_record_count: Number(contextSummary.dynamics_records || source.filter((item) => item.data_source === "dynamics").length),
    mock_record_count: source.filter((item) => item.data_source !== "dynamics").length,
    context_source: contextSummary.data_source || "mock",
    high_risk_count: source.filter((item) => ["High", "Critical"].includes(item.risk_level)).length,
    overdue_count: source.filter((item) => String(item.expected_order_status || "").startsWith("overdue")).length,
    data_quality_score: safeDataQualityScore(source),
    stage_distribution: topCounts(source, (item) => item.stage).map(({ value, count }) => ({ stage: value, count })),
    risk_distribution: topCounts(source, (item) => item.risk_level).map(({ value, count }) => ({ risk_level: value, count })),
    customer_portfolio_summary: customerSummary(source),
    owner_action_summary: ownerSummary(source),
  };
}

function topCounts(items, pick) {
  const counts = items.reduce((map, item) => {
    const key = pick(item) || "Unspecified";
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
  return Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

function customerSummary(items) {
  const grouped = groupBy(items, (item) => item.customer_token);
  return Object.entries(grouped).map(([customer_token, rows]) => ({
    customer_token,
    cases: rows.length,
    won_cases: rows.filter((item) => item.stage === "L5 Won").length,
    revenue_grade: topByCount(topCounts(rows, (item) => item.revenue_band), "value") || "N/A",
    margin_grade: topByCount(topCounts(rows, (item) => item.margin_band), "value") || "N/A",
    main_business: topByCount(topCounts(rows, (item) => item.business_segment), "value") || "Mixed",
    ai_recommendation: rows.some((item) => ["High", "Critical"].includes(item.risk_level))
      ? "先稳定高风险案件，再讨论追加业务。"
      : "可探索交叉销售机会。",
  })).sort((a, b) => b.cases - a.cases);
}

function ownerSummary(items) {
  const grouped = groupBy(items, (item) => item.owner_token);
  return Object.entries(grouped).map(([owner_label, rows]) => ({
    owner_label,
    open_cases: rows.filter((item) => item.stage !== "L5 Won").length,
    high_risk: rows.filter((item) => ["High", "Critical"].includes(item.risk_level)).length,
    overdue: rows.filter((item) => String(item.expected_order_status || "").startsWith("overdue")).length,
    weighted_forecast_band: "safe banded context",
    ai_comment: rows.some((item) => String(item.expected_order_status || "").startsWith("overdue"))
      ? "请优先更新逾期案件下一步。"
      : "保持当前推进节奏。",
  })).sort((a, b) => b.high_risk - a.high_risk || b.overdue - a.overdue);
}

function safeDataQualityScore(items) {
  if (items.length === 0) return 100;
  const issues = items.reduce((sum, item) => sum + (Array.isArray(item.data_quality_flags) ? item.data_quality_flags.length : 0), 0);
  return Math.max(0, Math.min(100, 100 - issues * 4));
}

function groupBy(items, pick) {
  return items.reduce((map, item) => {
    const key = pick(item) || "Unspecified";
    if (!map[key]) map[key] = [];
    map[key].push(item);
    return map;
  }, {});
}

function riskScore(item) {
  const riskWeight = { Low: 1, Medium: 2, High: 4, Critical: 5 }[item.risk_level] || 1;
  const overdueWeight = String(item.expected_order_status || "").startsWith("overdue") ? 3 : 0;
  const marginWeight = item.margin_band === "<5%" || item.margin_band === "5%-10%" ? 2 : 0;
  const valueWeight = item.revenue_band === "5M+" ? 2 : 0;
  return riskWeight + overdueWeight + marginWeight + valueWeight;
}

function sourceDescription(source) {
  if (source === "hybrid") return "本摘要基于当前已同步的 CRM Demo 数据和物流 mock 补充数据生成。";
  if (source === "dynamics") return "本摘要基于当前已同步的 CRM Demo 数据生成。";
  return "本摘要基于本地物流 mock demo 数据生成。";
}

function generateCaseResponse(functionName, payload, language) {
  const name = payload.opportunity_name || payload.opportunity_id;
  const risk = payload.risk_level;
  const revenue = payload.revenue_band;
  const margin = payload.margin_band || "not visible for this role";
  const due = payload.expected_order_status;

  const outputs = {
    "case-summary": `${name} is at ${payload.stage} with ${revenue} revenue potential. Customer and contact identities are tokenized before AI use.`,
    "risk-analysis": `Risk level is ${risk}. Main indicators are expected order status ${due}, stage ${payload.stage}, and margin band ${margin}.`,
    "next-best-action": `Confirm quotation feedback, update expected order status, and prepare a service-stability explanation for ${payload.customer_token}.`,
    "draft-follow-up-email": `Subject: Follow-up on ${payload.transport_mode} proposal\n\nDear ${payload.customer_token},\n\nThank you for reviewing our proposal. We will follow up on service scope, schedule stability, and next decision timing. No personal contact data or exact commercial values are included in this draft.`,
    "meeting-report-note": `${payload.customer_token}: ${name}. Status ${payload.stage}; risk ${risk}; recommended management focus is follow-up on ${due} and next action confirmation.`,
  };

  return {
    blocked: false,
    mode: "Demo AI",
    provider: DEMO_PROVIDER,
    external_model_called: false,
    language,
    functionName,
    title: titleFor(functionName),
    output: outputs[functionName] || outputs["case-summary"],
    usedPayloadKeys: Object.keys(payload),
  };
}

function topByCount(items = [], key) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return [...items].sort((a, b) => Number(b.count || 0) - Number(a.count || 0))[0]?.[key] || "";
}

function titleFor(functionName) {
  return {
    "case-summary": "Case Summary",
    "risk-analysis": "Risk Analysis",
    "next-best-action": "Next Best Action",
    "draft-follow-up-email": "Draft Follow-up Email",
    "meeting-report-note": "Meeting Report Note",
  }[functionName] || "AI Output";
}
