const ACTIVITY_TYPES = ["phonecall", "appointment", "task", "annotation"];

export const TIMELINE_FINDING_CODES = [
  "NEXT_STEP_EXPLICIT",
  "CUSTOMER_RESPONSE_PENDING",
  "COMMITMENT_OPEN",
  "OBJECTION_PRESENT",
  "SERVICE_ISSUE_PRESENT",
  "DECISION_MAKER_SIGNAL",
  "COMPETITOR_SIGNAL",
  "PROGRESS_CONFIRMED",
  "CONTENT_CONTRADICTION",
];

export const TIMELINE_ACTION_CODES = [
  "CONFIRM_NEXT_STEP_FROM_TIMELINE",
  "FOLLOW_UP_PENDING_RESPONSE",
  "CLOSE_OPEN_COMMITMENT",
  "RESOLVE_TIMELINE_OBJECTION",
  "VERIFY_SERVICE_ISSUE",
  "CONFIRM_DECISION_ROLE",
  "REVIEW_COMPETITOR_POSITION",
];

export const TIMELINE_FINDING_TEXT = Object.freeze({
  NEXT_STEP_EXPLICIT: "Timeline 内容出现了明确的下一步，需要核对是否已落实。",
  CUSTOMER_RESPONSE_PENDING: "Timeline 内容显示仍在等待客户回应或确认。",
  COMMITMENT_OPEN: "Timeline 内容包含尚未完成的承诺，需要确认责任和节点。",
  OBJECTION_PRESENT: "Timeline 内容出现客户异议，需要确认异议是否已关闭。",
  SERVICE_ISSUE_PRESENT: "Timeline 内容涉及服务问题，需要核对处理状态。",
  DECISION_MAKER_SIGNAL: "Timeline 内容出现决策角色或审批参与信号。",
  COMPETITOR_SIGNAL: "Timeline 内容出现竞争对手或替代方案信号。",
  PROGRESS_CONFIRMED: "Timeline 内容显示本次推进有明确结果或阶段性确认。",
  CONTENT_CONTRADICTION: "Timeline 内容与其他安全信号存在待核对的不一致。",
});

export const TIMELINE_ACTION_TEXT = Object.freeze({
  CONFIRM_NEXT_STEP_FROM_TIMELINE: "按 Timeline 已记录的下一步逐项确认落实情况。",
  FOLLOW_UP_PENDING_RESPONSE: "围绕 Timeline 中未获回应的事项安排人工跟进。",
  CLOSE_OPEN_COMMITMENT: "核对 Timeline 中未完成承诺的责任边界和完成条件。",
  RESOLVE_TIMELINE_OBJECTION: "针对 Timeline 中的异议补充事实核验和回应记录。",
  VERIFY_SERVICE_ISSUE: "核对 Timeline 中服务问题的当前处理状态和证据。",
  CONFIRM_DECISION_ROLE: "确认 Timeline 提及的决策参与角色及下一步确认人。",
  REVIEW_COMPETITOR_POSITION: "根据 Timeline 中的竞争信号补充人工方案比较。",
});

export const TIMELINE_EXECUTIVE_CODES = Object.freeze({
  overall: ["PROGRESSING", "STALLED", "MIXED", "REVIEW_REQUIRED", "INSUFFICIENT"],
  momentum: ["ACCELERATING", "STABLE", "STALLING", "MIXED", "INSUFFICIENT"],
  customerPosition: ["SUPPORTIVE", "CONCERNED", "WAITING", "MIXED", "UNKNOWN"],
  decisionClarity: ["CLEAR", "PARTIAL", "UNCLEAR", "INSUFFICIENT"],
  stakeholder: ["DECISION_ROLE_PRESENT", "PROCUREMENT_ACTIVE", "MULTI_ROLE_ALIGNMENT", "ROLE_GAP", "INSUFFICIENT"],
  themes: ["NEXT_STEP", "CUSTOMER_RESPONSE", "COMMITMENT", "OBJECTION", "SERVICE_ISSUE", "DECISION", "COMPETITION", "ROUTE", "PROGRESS", "COMMERCIAL"],
  blockers: ["OPEN_COMMITMENT", "PENDING_RESPONSE", "OBJECTION", "SERVICE_ISSUE", "DECISION_GAP", "COMPETITION", "CONTRADICTION"],
  commitment: ["NO_COMMITMENTS", "COMPLETED_COMMITMENTS", "OPEN_COMMITMENTS", "MIXED_COMMITMENTS", "OVERDUE_COMMITMENTS", "INSUFFICIENT"],
  contradictions: ["STATUS_TEXT_MISMATCH", "COMMITMENT_CONFLICT", "CUSTOMER_STANCE_CONFLICT", "DATE_ORDER_CONFLICT", "NONE"],
  opportunities: ["PROGRESS", "CUSTOMER_DEMAND", "DECISION_ACCESS", "ROUTE_FIT", "SERVICE_EXPANSION", "NONE"],
  actions: ["ESCALATE_OPEN_COMMITMENT", "ALIGN_STAKEHOLDERS", "RESOLVE_OBJECTION", "REVIEW_SERVICE_ISSUE", "CONFIRM_NEXT_STEP", "RECONCILE_CONTRADICTION", "REVIEW_CUSTOMER_MOMENTUM"],
  confidence: ["HIGH", "MEDIUM", "LOW"],
});

export const TIMELINE_EXECUTIVE_TEXT = Object.freeze({
  overall: {
    PROGRESSING: "Timeline 显示推进正在形成连续结果，但仍需按记录中的下一步完成闭环。",
    STALLED: "Timeline 显示推进动能不足，等待、未完成承诺或重复阻力正在延长决策周期。",
    MIXED: "Timeline 同时显示阶段性推进与未解决阻力，当前不能只按单一状态判断商机健康度。",
    REVIEW_REQUIRED: "Timeline 存在需要管理层核对的承诺、客户回应、异议或记录矛盾。",
    INSUFFICIENT: "Timeline 内容证据不足以形成稳定的管理层判断。",
  },
  momentum: { ACCELERATING: "推进动能在近期记录中增强。", STABLE: "推进节奏保持稳定。", STALLING: "近期推进信号弱于前期，存在停滞迹象。", MIXED: "近期记录同时包含推进和阻滞信号。", INSUFFICIENT: "记录不足，无法判断推进趋势。" },
  customerPosition: { SUPPORTIVE: "客户态度总体支持推进。", CONCERNED: "客户态度包含明确顾虑或异议。", WAITING: "客户仍在等待回应、确认或下一步安排。", MIXED: "客户同时表达兴趣与顾虑，态度尚未收敛。", UNKNOWN: "现有内容不足以判断客户态度。" },
  decisionClarity: { CLEAR: "决策角色和下一步较清晰。", PARTIAL: "已出现决策角色或审批信号，但闭环仍不完整。", UNCLEAR: "决策角色、条件或下一步仍不清晰。", INSUFFICIENT: "记录不足以判断决策清晰度。" },
  themes: {
    NEXT_STEP: "下一步与推进闭环", CUSTOMER_RESPONSE: "客户回应与等待", COMMITMENT: "承诺与执行", OBJECTION: "客户异议", SERVICE_ISSUE: "服务问题", DECISION: "决策角色与审批", COMPETITION: "竞争与替代方案", ROUTE: "路线与方案适配", PROGRESS: "阶段性进展", COMMERCIAL: "商务与预算条件",
  },
  blockers: { OPEN_COMMITMENT: "未完成承诺", PENDING_RESPONSE: "客户回应等待", OBJECTION: "客户异议未闭环", SERVICE_ISSUE: "服务问题未闭环", DECISION_GAP: "决策角色或条件缺口", COMPETITION: "竞争位置不清晰", CONTRADICTION: "记录之间存在矛盾" },
  commitment: { NO_COMMITMENTS: "未记录承诺。", COMPLETED_COMMITMENTS: "已记录承诺均已完成。", OPEN_COMMITMENTS: "存在未完成承诺，需要核对责任和完成条件。", MIXED_COMMITMENTS: "承诺有完成也有未完成，执行闭环不一致。", OVERDUE_COMMITMENTS: "存在已过期仍未完成的承诺。", INSUFFICIENT: "承诺信息不足。" },
  opportunities: { PROGRESS: "已有阶段性进展，可围绕下一步继续推进。", CUSTOMER_DEMAND: "客户需求表达较明确，可转化为下一步方案验证。", DECISION_ACCESS: "已出现决策角色信号，可争取更清晰的决策路径。", ROUTE_FIT: "路线或方案适配信号支持进一步核验服务机会。", SERVICE_EXPANSION: "服务问题或覆盖信号可转化为服务改善机会。", NONE: "当前没有足够内容支持新增机会判断。" },
  actions: { ESCALATE_OPEN_COMMITMENT: "管理层介入未完成承诺的责任确认。", ALIGN_STAKEHOLDERS: "拉齐决策角色、采购角色和内部责任人。", RESOLVE_OBJECTION: "要求形成客户异议的回应、责任人和验证节点。", REVIEW_SERVICE_ISSUE: "复核服务问题的当前状态和闭环证据。", CONFIRM_NEXT_STEP: "确认记录中下一步的实际完成情况。", RECONCILE_CONTRADICTION: "先核对存在矛盾的记录，再更新管理判断。", REVIEW_CUSTOMER_MOMENTUM: "复核客户态度变化和近期推进动能。" },
});

export function buildTimelineDigest({ activities = [], annotations = [], signals = [], now = new Date() } = {}) {
  const activityMix = Object.fromEntries(ACTIVITY_TYPES.map((type) => [type, 0]));
  for (const row of activities) {
    const type = normalizeActivityType(row.activitytypecode);
    if (type) activityMix[type] += 1;
  }
  activityMix.annotation += annotations.length;

  const activityDates = [
    ...activities.map((row) => row.actualstart || row.scheduledstart || row.actualend || row.scheduledend),
    ...annotations.map((row) => row.overriddencreatedon || row.createdon),
    ...signals.map((row) => row.aigw_activitydate),
  ].map(parseDate).filter(Boolean);
  const commitmentRows = signals.filter((row) => row.aigw_commitmentmade === true);
  const completedCommitments = commitmentRows.filter((row) => row.aigw_commitmentcompleted === true).length;
  const openCommitments = commitmentRows.length - completedCommitments;
  const objectionRows = signals.filter((row) => row.aigw_objectionpresent === true);
  const issueRows = signals.filter((row) => row.aigw_serviceissuecategory != null);
  const unresolvedIssues = issueRows.filter((row) => row.aigw_issueresolved !== true).length;

  return {
    totalActivityCount: activities.length + annotations.length,
    structuredSignalCount: signals.length,
    activityMix,
    lastActivityBand: relativeDateBand(latest(activityDates), now),
    cadence: cadenceBand(activities.length + annotations.length),
    directionMix: choiceCounts(signals, "aigw_direction"),
    resultCategoryMix: choiceCounts(signals, "aigw_resultcategory"),
    customerResponseMix: choiceCounts(signals, "aigw_customerresponselevel"),
    sentimentMix: choiceCounts(signals, "aigw_sentiment"),
    decisionMakerInvolved: signals.some((row) => row.aigw_decisionmakerinvolved === true) ? "present" : "not-recorded",
    commitmentStatus: {
      madeCount: commitmentRows.length,
      completedCount: completedCommitments,
      openCount: openCommitments,
      dueBand: dueDateBand(commitmentRows.map((row) => row.aigw_commitmentduedate), now),
    },
    objectionStatus: {
      presentCount: objectionRows.length,
      categories: uniqueChoices(objectionRows, "aigw_objectioncategory"),
      status: objectionRows.length ? "present" : "not-recorded",
    },
    competitorMentioned: signals.some((row) => row.aigw_competitormentioned === true) ? "present" : "not-recorded",
    serviceIssueStatus: {
      presentCount: issueRows.length,
      unresolvedCount: unresolvedIssues,
      resolvedCount: issueRows.length - unresolvedIssues,
      categories: uniqueChoices(issueRows, "aigw_serviceissuecategory"),
      status: unresolvedIssues ? "open" : issueRows.length ? "resolved" : "not-recorded",
    },
  };
}

export function timelineDigestFacts(digest = {}) {
  if (!digest || typeof digest !== "object" || !Object.keys(digest).length) return [];
  const facts = [
    ["activityCount", "Timeline 活动数量", digest.totalActivityCount],
    ["structuredSignalCount", "Timeline 结构化信号数量", digest.structuredSignalCount],
    ["activityMix", "Timeline 活动构成", formatCounts(digest.activityMix)],
    ["lastActivityBand", "最近互动时间窗口", digest.lastActivityBand],
    ["cadence", "互动节奏", digest.cadence],
    ["directionMix", "互动方向", formatCounts(digest.directionMix)],
    ["resultCategoryMix", "互动结果", formatCounts(digest.resultCategoryMix)],
    ["customerResponseMix", "客户响应", formatCounts(digest.customerResponseMix)],
    ["sentimentMix", "互动情绪类别", formatCounts(digest.sentimentMix)],
    ["decisionMakerInvolved", "决策人参与", digest.decisionMakerInvolved],
    ["commitmentStatus", "承诺状态", formatCommitment(digest.commitmentStatus)],
    ["objectionStatus", "异议状态", formatStatus(digest.objectionStatus, "categories")],
    ["competitorMentioned", "竞争对手提及", digest.competitorMentioned],
    ["serviceIssueStatus", "服务问题状态", formatStatus(digest.serviceIssueStatus, "categories")],
  ];
  return facts
    .filter(([, , value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([key, label, value]) => ({ key, evidenceToken: `safeContext.timeline.${key}`, label, value: String(value) }));
}

export function buildTimelineContentEvidence({ activities = [], annotations = [], signals = [], timelineEntries = [], identityValues = [], routeValues = [], now = new Date() } = {}) {
  const entryById = new Map(timelineEntries.map((entry) => [String(entry.id || "").toLowerCase(), entry]));
  const signalIndex = buildTimelineSignalIndex(signals);
  const rows = [
    ...activities.map((row) => contentRow(row, false, entryById, signalIndex, identityValues, routeValues, now)),
    ...annotations.map((row) => contentRow(row, true, entryById, signalIndex, identityValues, routeValues, now)),
  ].filter(Boolean);
  return rows
    .sort((left, right) => Number(right._dateMs || 0) - Number(left._dateMs || 0) || left.evidenceToken.localeCompare(right.evidenceToken))
    .map((row, index) => {
      const { _dateMs, ...publicRow } = row;
      return { ...publicRow, relativeTimeRank: index + 1 };
    });
}

export function timelineContentFacts(evidence = []) {
  return evidence.map((item, index) => ({
    key: `content-${index + 1}`,
    evidenceToken: item.evidenceToken,
    label: `${item.activityTypeLabel}内容证据 ${index + 1}`,
    value: `${item.excerpt}${item.signalSummary ? `；结构化信号：${item.signalSummary}` : ""}；时间窗口：${item.businessDateBand}`,
  }));
}

export function buildTimelineEventExtraction({ evidence = [], digest = {} } = {}) {
  const events = evidence.map((item) => {
    const actorRole = stableActorRole(item);
    const themes = deriveThemes(item);
    const customerStance = deriveCustomerStance(item);
    const commitmentStatus = item.commitmentMade ? item.commitmentCompleted ? "completed" : item.commitmentDueBand === "overdue" ? "overdue" : "open" : "not-recorded";
    const outcome = deriveOutcome(item);
    return {
      activityToken: item.activityToken,
      activityType: item.activityType,
      relativeTime: item.relativeTime || item.businessDateBand || "not-recorded",
      relativeTimeRank: Number(item.relativeTimeRank || 0),
      actorRole,
      direction: normalizeDirection(item.direction),
      themes,
      customerStance,
      commitment: item.commitmentMade ? "已记录承诺" : "未记录承诺",
      commitmentStatus,
      objection: item.objectionCategory ? `异议类别=${item.objectionCategory}` : "未记录异议",
      decisionSignal: item.decisionMakerInvolved === true ? "决策角色已涉及" : "未记录决策角色",
      outcome,
      evidenceToken: item.evidenceToken,
      semanticSummary: buildSemanticSummary({ item, actorRole, themes, customerStance, commitmentStatus, outcome }),
      excerpt: item.semanticExcerpt || item.excerpt,
    };
  }).sort((left, right) => left.relativeTimeRank - right.relativeTimeRank || left.evidenceToken.localeCompare(right.evidenceToken));
  return { events, eventCount: events.length, coveredActivityCount: new Set(events.map((item) => item.activityToken)).size, digest };
}

export function buildTimelineExecutiveSynthesis({ evidence = [], digest = {}, maxEvidence = 8 } = {}) {
  const extraction = buildTimelineEventExtraction({ evidence, digest });
  const events = extraction.events;
  if (!events.length) return emptyExecutiveSynthesis();
  const themeCounts = countCodes(events.flatMap((item) => item.themes));
  const keyThemes = topCodes(themeCounts, 3).map((code) => ({ code, label: TIMELINE_EXECUTIVE_TEXT.themes[code], count: themeCounts[code], evidenceTokens: events.filter((item) => item.themes.includes(code)).map((item) => item.evidenceToken).slice(0, 3) }));
  const blockers = blockerScores(events, digest);
  const topBlockers = blockers.slice(0, 3).map((item) => ({ code: item.code, label: TIMELINE_EXECUTIVE_TEXT.blockers[item.code], count: item.count, evidenceTokens: item.evidenceTokens.slice(0, 3) }));
  const commitmentCode = commitmentCodeFor(digest, events);
  const contradictionCodes = contradictionCodesFor(events, digest);
  const opportunityCodes = opportunityCodesFor(events, digest);
  const representativeEvidence = selectRepresentativeEvidence(events, keyThemes, maxEvidence);
  const momentumTrend = momentumFor(events, digest);
  const customerPosition = customerPositionFor(events);
  const decisionClarity = decisionClarityFor(events, digest);
  const stakeholderDynamics = stakeholderDynamicsFor(events);
  const confidence = confidenceFor(events, digest, representativeEvidence.length, contradictionCodes);
  const limitations = [];
  if (events.length < 3) limitations.push("Timeline 内容记录较少，趋势判断置信度已下调。");
  if (representativeEvidence.length < Math.min(3, events.length)) limitations.push("可引用的语义保留证据不足，管理层结论需要人工复核。");
  if (digest.totalActivityCount > events.length) limitations.push("部分 Timeline 没有可安全提取的内容，未进入综合判断。");
  return {
    overallConclusion: TIMELINE_EXECUTIVE_TEXT.overall[overallCodeFor({ momentumTrend, topBlockers, contradictionCodes, events })],
    overallCode: overallCodeFor({ momentumTrend, topBlockers, contradictionCodes, events }),
    momentumTrend: { code: momentumTrend, statement: TIMELINE_EXECUTIVE_TEXT.momentum[momentumTrend] },
    customerPosition: { code: customerPosition, statement: TIMELINE_EXECUTIVE_TEXT.customerPosition[customerPosition] },
    decisionClarity: { code: decisionClarity, statement: TIMELINE_EXECUTIVE_TEXT.decisionClarity[decisionClarity] },
    stakeholderDynamics,
    keyThemes,
    topBlockers,
    commitmentSummary: { code: commitmentCode, statement: TIMELINE_EXECUTIVE_TEXT.commitment[commitmentCode], madeCount: Number(digest.commitmentStatus?.madeCount || 0), completedCount: Number(digest.commitmentStatus?.completedCount || 0), openCount: Number(digest.commitmentStatus?.openCount || 0) },
    contradictions: contradictionCodes.filter((code) => code !== "NONE").slice(0, 3).map((code) => ({ code, statement: contradictionText(code), evidenceTokens: contradictionEvidence(code, events).slice(0, 3) })),
    opportunitySignals: opportunityCodes.filter((code) => code !== "NONE").slice(0, 3).map((code) => ({ code, statement: TIMELINE_EXECUTIVE_TEXT.opportunities[code], evidenceTokens: opportunityEvidence(code, events).slice(0, 3) })),
    managementActions: managementActionsFor({ topBlockers, contradictionCodes, momentumTrend, events }).slice(0, 3),
    confidence: { level: confidence, reason: confidenceReason(confidence, events.length, representativeEvidence.length) },
    coverage: { level: confidenceForCoverage(events.length, representativeEvidence.length), activityCount: Number(digest.totalActivityCount || events.length), eventCount: events.length, representativeEvidenceCount: representativeEvidence.length },
    representativeEvidenceTokens: representativeEvidence.map((item) => item.evidenceToken),
    limitations,
    representativeEvidence,
    supportedCodes: { themes: keyThemes.map((item) => item.code), blockers: topBlockers.map((item) => item.code), contradictions: contradictionCodes, opportunities: opportunityCodes, managementActions: managementActionsFor({ topBlockers, contradictionCodes, momentumTrend, events }).map((item) => item.code) },
    aggregateFacts: executiveSynthesisFacts({ digest, extraction, keyThemes, topBlockers, commitmentCode, contradictionCodes, opportunityCodes, momentumTrend, customerPosition, decisionClarity, stakeholderDynamics, confidence, representativeEvidence }),
  };
}

export function timelineExecutiveSynthesisFacts(pack = {}) { return Array.isArray(pack.aggregateFacts) ? pack.aggregateFacts : []; }

export function deriveTimelineAnalysis(evidence = [], digest = {}) {
  const text = evidence.map((item) => `${item.excerpt} ${item.signalSummary}`).join(" ");
  const findings = new Set();
  const actions = new Set();
  if (/下一步|后续|安排|计划|确认/u.test(text)) { findings.add("NEXT_STEP_EXPLICIT"); actions.add("CONFIRM_NEXT_STEP_FROM_TIMELINE"); }
  if (/等待|待确认|未回复|未反馈|跟进/u.test(text) || Number(digest.commitmentStatus?.openCount) > 0) { findings.add("CUSTOMER_RESPONSE_PENDING"); actions.add("FOLLOW_UP_PENDING_RESPONSE"); }
  if (Number(digest.commitmentStatus?.openCount) > 0 || /承诺|期限|完成/u.test(text)) { findings.add("COMMITMENT_OPEN"); actions.add("CLOSE_OPEN_COMMITMENT"); }
  if (Number(digest.objectionStatus?.presentCount) > 0 || /异议|顾虑|担忧|反对/u.test(text)) { findings.add("OBJECTION_PRESENT"); actions.add("RESOLVE_TIMELINE_OBJECTION"); }
  if (Number(digest.serviceIssueStatus?.presentCount) > 0 || /问题|异常|投诉|延误/u.test(text)) { findings.add("SERVICE_ISSUE_PRESENT"); actions.add("VERIFY_SERVICE_ISSUE"); }
  if (digest.decisionMakerInvolved === "present" || /决策|审批|负责人/u.test(text)) { findings.add("DECISION_MAKER_SIGNAL"); actions.add("CONFIRM_DECISION_ROLE"); }
  if (digest.competitorMentioned === "present" || /竞品|竞争|替代方案/u.test(text)) { findings.add("COMPETITOR_SIGNAL"); actions.add("REVIEW_COMPETITOR_POSITION"); }
  if (/确认|已完成|达成|同意|通过/u.test(text) && !/未确认|未完成|等待/u.test(text)) findings.add("PROGRESS_CONFIRMED");
  return { findingCodes: [...findings], actionCodes: [...actions] };
}

function contentRow(row, isAnnotation, entryById, signalIndex, identityValues, routeValues, now) {
  const id = String(isAnnotation ? row.annotationid : row.activityid || "").toLowerCase();
  const entry = entryById.get(id);
  if (!entry?.token) return null;
  const signal = resolveTimelineSignal({
    token: entry.token,
    activityDate: row.actualstart || row.scheduledstart || row.overriddencreatedon || row.createdon,
    activityType: isAnnotation ? "annotation" : normalizeActivityType(row.activitytypecode),
  }, signalIndex);
  const subject = row.subject || "";
  const body = isAnnotation ? row.notetext : row.description;
  const excerpt = sanitizeTimelineContent([subject, body].filter(Boolean).join("："), { identityValues, routeValues });
  if (!excerpt) return null;
  const businessDate = signal?.aigw_activitydate || row.actualstart || row.scheduledstart || row.overriddencreatedon || row.createdon;
  const date = parseDate(businessDate);
  const relativeTime = relativeTimeLabel(date, now);
  const actorRole = stableActorRole({ excerpt, signalSummary: signal ? signalSummary(signal) : "", direction: signal ? choiceValue(signal, "aigw_direction") : "" });
  return {
    evidenceToken: `safeContext.timeline.content.${entry.token}`,
    activityToken: entry.token,
    activityType: isAnnotation ? "annotation" : normalizeActivityType(row.activitytypecode) || "activity",
    activityTypeLabel: isAnnotation ? "Annotation" : activityTypeLabel(normalizeActivityType(row.activitytypecode)),
    businessDateBand: relativeDateBand(date, now),
    relativeTime,
    excerpt,
    semanticExcerpt: semanticExcerpt(excerpt, actorRole, relativeTime),
    signalSummary: signal ? signalSummary(signal) : "",
    direction: signal ? choiceValue(signal, "aigw_direction") : "",
    customerResponse: signal ? choiceValue(signal, "aigw_customerresponselevel") : "",
    sentiment: signal ? choiceValue(signal, "aigw_sentiment") : "",
    commitmentMade: signal?.aigw_commitmentmade === true,
    commitmentCompleted: signal?.aigw_commitmentcompleted === true,
    commitmentDueBand: signal ? dueDateBand(signal.aigw_commitmentduedate ? [signal.aigw_commitmentduedate] : [], now) : "not-recorded",
    objectionCategory: signal ? choiceValue(signal, "aigw_objectioncategory") : "",
    serviceIssueCategory: signal ? choiceValue(signal, "aigw_serviceissuecategory") : "",
    decisionMakerInvolved: signal?.aigw_decisionmakerinvolved === true,
    competitorMentioned: signal?.aigw_competitormentioned === true,
    _dateMs: date?.getTime() || 0,
  };
}

function buildTimelineSignalIndex(signals) {
  const byToken = new Map();
  const byDateType = new Map();
  for (const signal of signals) {
    const token = normalizeTimelineToken(signal.aigw_sourceactivitytoken);
    if (token && !byToken.has(token)) byToken.set(token, signal);
    const date = normalizeTimelineDate(signal.aigw_activitydate);
    const type = normalizeActivityTypeForMatch(signal["aigw_activitytype@OData.Community.Display.V1.FormattedValue"] || signal.aigw_activitytype);
    if (!date || !type) continue;
    const key = `${date}|${type}`;
    const matches = byDateType.get(key) || [];
    matches.push(signal);
    byDateType.set(key, matches);
  }
  return { byToken, byDateType };
}

function resolveTimelineSignal({ token, activityDate, activityType }, index) {
  const exact = index.byToken.get(normalizeTimelineToken(token));
  if (exact) return exact;
  const date = normalizeTimelineDate(activityDate);
  const type = normalizeActivityTypeForMatch(activityType);
  if (!date || !type) return null;
  const matches = index.byDateType.get(`${date}|${type}`) || [];
  return matches.length === 1 ? matches[0] : null;
}

function normalizeTimelineToken(value) { return String(value ?? "").trim().toLowerCase(); }
function normalizeTimelineDate(value) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/u.test(text) ? text.slice(0, 10) : "";
}
function normalizeActivityTypeForMatch(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "4210") return "phonecall";
  if (text === "4201") return "appointment";
  if (text === "4212") return "task";
  if (/phone|call/u.test(text)) return "phonecall";
  if (/appointment|meeting|会议/u.test(text)) return "appointment";
  if (/task|任务/u.test(text)) return "task";
  if (/annotation|note|备注/u.test(text)) return "annotation";
  return text;
}

function signalSummary(row) {
  const parts = [];
  const fields = [
    ["aigw_direction", "方向"], ["aigw_resultcategory", "结果"], ["aigw_customerresponselevel", "客户响应"],
    ["aigw_sentiment", "情绪"], ["aigw_objectioncategory", "异议"], ["aigw_serviceissuecategory", "服务问题"],
  ];
  for (const [field, label] of fields) { const value = choiceValue(row, field); if (value) parts.push(`${label}=${value}`); }
  if (row.aigw_commitmentmade === true) parts.push(`承诺=${row.aigw_commitmentcompleted === true ? "已完成" : "未完成"}`);
  if (row.aigw_decisionmakerinvolved === true) parts.push("决策人=涉及");
  if (row.aigw_competitormentioned === true) parts.push("竞争对手=提及");
  return parts.join("；");
}

function activityTypeLabel(value) { return ({ phonecall: "Phonecall", appointment: "Appointment", task: "Task" })[value] || "Timeline"; }

function sanitizeTimelineContent(value, { identityValues = [], routeValues = [] } = {}) {
  const escapedIdentityValues = identityValues.filter((item) => typeof item === "string" && item.trim()).sort((left, right) => right.length - left.length).map(escapeRegExp);
  const escapedRouteValues = routeValues.filter((item) => typeof item === "string" && item.trim()).sort((left, right) => right.length - left.length).map(escapeRegExp);
  let text = String(value || "");
  for (const pattern of escapedIdentityValues) text = text.replace(new RegExp(pattern, "giu"), "[客户身份已脱敏]");
  for (const pattern of escapedRouteValues) text = text.replace(new RegExp(pattern, "giu"), "[路线标识已脱敏]");
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[身份已脱敏]")
    .replace(/(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){10,}/g, "[电话已脱敏]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[标识已脱敏]")
    .replace(/(?:https?:\/\/|www\.)[^\s]+/gi, "[链接已脱敏]")
    .replace(/\b\d{4}\s*:\s*[A-Z]{5}\s*(?:至|到|->)\s*\d{4}\s*:\s*[A-Z]{5}\b/gi, "[路线标识已脱敏]")
    .replace(/(?:¥|￥|\$|CNY|RMB|USD|JPY)\s?[\d,]+(?:\.\d+)?/gi, "[金额区间]")
    .replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?\b/g, "[日期已相对化]")
    .replace(/\b\d{6,}\b/g, "[数字已区间化]")
    .replace(/(?:合同|contract|description|notetext|annotationtext|email body|phone call body)/gi, "[敏感正文已脱敏]")
    .replace(/(?<![\u4e00-\u9fa5])[\u4e00-\u9fa5]{2,4}(?=\s|[，。；：:])/g, "[身份已脱敏]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 360);
}

function emptyExecutiveSynthesis() {
  return {
    overallConclusion: TIMELINE_EXECUTIVE_TEXT.overall.INSUFFICIENT,
    overallCode: "INSUFFICIENT",
    momentumTrend: { code: "INSUFFICIENT", statement: TIMELINE_EXECUTIVE_TEXT.momentum.INSUFFICIENT },
    customerPosition: { code: "UNKNOWN", statement: TIMELINE_EXECUTIVE_TEXT.customerPosition.UNKNOWN },
    decisionClarity: { code: "INSUFFICIENT", statement: TIMELINE_EXECUTIVE_TEXT.decisionClarity.INSUFFICIENT },
    stakeholderDynamics: { code: "INSUFFICIENT", statement: "Timeline 没有足够的角色信息支持判断。", roles: [] },
    keyThemes: [],
    topBlockers: [],
    commitmentSummary: { code: "INSUFFICIENT", statement: TIMELINE_EXECUTIVE_TEXT.commitment.INSUFFICIENT, madeCount: 0, completedCount: 0, openCount: 0 },
    contradictions: [],
    opportunitySignals: [],
    managementActions: [],
    confidence: { level: "LOW", reason: "没有可用的 Timeline 内容事件。" },
    coverage: { level: "LOW", activityCount: 0, eventCount: 0, representativeEvidenceCount: 0 },
    representativeEvidenceTokens: [],
    limitations: ["Timeline 内容证据不足，无法形成管理层综合判断。"],
    representativeEvidence: [],
    supportedCodes: { themes: [], blockers: [], contradictions: ["NONE"], opportunities: ["NONE"], managementActions: [] },
    aggregateFacts: [{ evidenceToken: "safeContext.timeline.executive.coverage", label: "Timeline 综合覆盖度", value: "低；没有可用内容事件" }],
  };
}

function stableActorRole(item = {}) {
  const text = `${item.excerpt || ""} ${item.semanticExcerpt || ""} ${item.signalSummary || ""} ${item.direction || ""}`;
  if (/决策|审批|决裁|拍板/u.test(text)) return "CUSTOMER-DECISION-MAKER-A";
  if (/采购|招标|供应商|询价/u.test(text)) return "CUSTOMER-PROCUREMENT-B";
  if (/我方|销售|方案|报价|跟进|营业|内部/u.test(text)) return "INTERNAL-SALES-A";
  if (/内部|运营|服务|仓库|运输/u.test(text)) return "INTERNAL-OPERATIONS-B";
  if (/客户|需求|回复|反馈|异议|顾虑|希望/u.test(text)) return "CUSTOMER-OPERATIONS-A";
  const direction = normalizeDirection(item.direction);
  return direction === "outbound" ? "INTERNAL-SALES-A" : direction === "inbound" ? "CUSTOMER-OPERATIONS-A" : "CUSTOMER-OPERATIONS-A";
}

function semanticExcerpt(excerpt, actorRole, relativeTime) {
  return String(excerpt || "")
    .replace(/\[客户身份已脱敏\]|\[身份已脱敏\]/gu, actorRole)
    .replace(/\[日期已相对化\]/gu, relativeTime)
    .replace(/\[路线标识已脱敏\]/gu, "路线复杂度标记")
    .replace(/\[金额区间\]/gu, "金额区间")
    .replace(/\[数字已区间化\]/gu, "数量区间")
    .replace(/\[敏感正文已脱敏\]/gu, "业务内容")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 260);
}

function deriveThemes(item = {}) {
  const text = `${item.semanticExcerpt || item.excerpt || ""} ${item.signalSummary || ""}`;
  const themes = [];
  if (/下一步|后续|安排|计划|确认/u.test(text)) themes.push("NEXT_STEP");
  if (/等待|回复|反馈|客户响应|未回应/u.test(text) || item.customerResponse) themes.push("CUSTOMER_RESPONSE");
  if (item.commitmentMade || /承诺|期限|完成/u.test(text)) themes.push("COMMITMENT");
  if (item.objectionCategory || /异议|顾虑|担忧|反对/u.test(text)) themes.push("OBJECTION");
  if (item.serviceIssueCategory || /服务问题|异常|投诉|延误/u.test(text)) themes.push("SERVICE_ISSUE");
  if (item.decisionMakerInvolved || /决策|审批|决裁/u.test(text)) themes.push("DECISION");
  if (item.competitorMentioned || /竞品|竞争|替代方案/u.test(text)) themes.push("COMPETITION");
  if (/路线|港口|运输|仓库|方案适配/u.test(text)) themes.push("ROUTE");
  if (/预算|报价|价格|成本|毛利|商务/u.test(text)) themes.push("COMMERCIAL");
  if (/确认|已完成|达成|同意|通过/u.test(text) && !/未确认|未完成|等待/u.test(text)) themes.push("PROGRESS");
  return [...new Set(themes)];
}

function deriveCustomerStance(item = {}) {
  const text = `${item.semanticExcerpt || item.excerpt || ""} ${item.signalSummary || ""} ${item.customerResponse || ""} ${item.sentiment || ""}`;
  if (/等待|未回复|未反馈|待确认|customerresponselevel=low|negative|消极|担忧|异议|顾虑/u.test(text)) return /异议|顾虑|担忧|negative|消极/u.test(text) ? "concerned" : "waiting";
  if (/positive|积极|满意|同意|确认|达成|通过/u.test(text)) return "supportive";
  return "neutral";
}

function deriveOutcome(item = {}) {
  const text = `${item.semanticExcerpt || item.excerpt || ""} ${item.signalSummary || ""}`;
  if (/已完成|达成|同意|通过|结果=成功|result=success/u.test(text)) return "progress";
  if (/未完成|等待|未回复|未反馈|逾期|问题|异常|异议/u.test(text)) return "blocked";
  return "neutral";
}

function normalizeDirection(value) {
  const text = String(value || "").toLowerCase();
  if (/outbound|outgoing|我方|发出|主动/u.test(text)) return "outbound";
  if (/inbound|incoming|客户|收到|反馈/u.test(text)) return "inbound";
  return "unknown";
}

function buildSemanticSummary({ item, actorRole, themes, customerStance, commitmentStatus, outcome }) {
  const themeLabels = themes.slice(0, 2).map((code) => TIMELINE_EXECUTIVE_TEXT.themes[code]).filter(Boolean);
  const parts = [`${actorRole}在${item.relativeTime || item.businessDateBand || "未记录时间"}产生${item.activityTypeLabel || item.activityType || "Timeline"}记录`];
  if (themeLabels.length) parts.push(`主题：${themeLabels.join("、")}`);
  parts.push(`客户态度：${customerStanceText(customerStance)}`);
  if (commitmentStatus !== "not-recorded") parts.push(`承诺：${commitmentStatusText(commitmentStatus)}`);
  parts.push(`结果：${outcomeText(outcome)}`);
  return parts.join("；");
}

function customerStanceText(value) { return { supportive: "支持推进", concerned: "存在顾虑", waiting: "等待回应", neutral: "中性", unknown: "未知" }[value] || "未知"; }
function commitmentStatusText(value) { return { completed: "已完成", open: "未完成", overdue: "已逾期" }[value] || "未记录"; }
function outcomeText(value) { return { progress: "出现阶段性进展", blocked: "存在阻滞或待确认事项", neutral: "未记录明确结果" }[value] || "未记录明确结果"; }

function countCodes(values) { return values.reduce((result, value) => { if (value) result[value] = (result[value] || 0) + 1; return result; }, {}); }
function topCodes(counts, limit) { return Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, limit).map(([code]) => code); }

function blockerScores(events, digest) {
  const scores = [];
  const add = (code, count, sourceCodes) => { if (count > 0) scores.push({ code, count, evidenceTokens: events.filter((event) => event.themes.some((theme) => sourceCodes.includes(theme)) || (code === "DECISION_GAP" && event.decisionSignal === "未记录决策角色")).map((event) => event.evidenceToken) }); };
  add("OPEN_COMMITMENT", Number(digest.commitmentStatus?.openCount || 0), ["COMMITMENT"]);
  add("PENDING_RESPONSE", events.filter((event) => event.customerStance === "waiting").length, ["CUSTOMER_RESPONSE"]);
  add("OBJECTION", events.filter((event) => event.themes.includes("OBJECTION")).length, ["OBJECTION"]);
  add("SERVICE_ISSUE", events.filter((event) => event.themes.includes("SERVICE_ISSUE")).length, ["SERVICE_ISSUE"]);
  const decisionSignals = events.filter((event) => event.decisionSignal !== "未记录决策角色");
  if (!decisionSignals.length && events.length >= 3) add("DECISION_GAP", 1, ["DECISION"]);
  add("COMPETITION", events.filter((event) => event.themes.includes("COMPETITION")).length, ["COMPETITION"]);
  return scores.sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
}

function commitmentCodeFor(digest, events) {
  const made = Number(digest.commitmentStatus?.madeCount || events.filter((event) => event.commitmentStatus !== "not-recorded").length);
  const open = Number(digest.commitmentStatus?.openCount || events.filter((event) => ["open", "overdue"].includes(event.commitmentStatus)).length);
  const completed = Number(digest.commitmentStatus?.completedCount || events.filter((event) => event.commitmentStatus === "completed").length);
  if (!made) return "NO_COMMITMENTS";
  if (open && events.some((event) => event.commitmentStatus === "overdue")) return "OVERDUE_COMMITMENTS";
  if (open && completed) return "MIXED_COMMITMENTS";
  if (open) return "OPEN_COMMITMENTS";
  return completed ? "COMPLETED_COMMITMENTS" : "INSUFFICIENT";
}

function contradictionCodesFor(events, digest) {
  const codes = [];
  if (Number(digest.commitmentStatus?.completedCount || 0) > 0 && Number(digest.commitmentStatus?.openCount || 0) > 0) codes.push("COMMITMENT_CONFLICT");
  if (events.some((event) => event.customerStance === "supportive") && events.some((event) => event.customerStance === "concerned")) codes.push("CUSTOMER_STANCE_CONFLICT");
  if (events.some((event) => event.outcome === "progress") && events.some((event) => event.outcome === "blocked")) codes.push("STATUS_TEXT_MISMATCH");
  return codes.length ? [...new Set(codes)] : ["NONE"];
}

function contradictionText(code) { return { STATUS_TEXT_MISMATCH: "Timeline 同时出现阶段性进展与阻滞记录，需要确认当前真实状态。", COMMITMENT_CONFLICT: "Timeline 同时出现已完成和未完成承诺，需要核对承诺口径。", CUSTOMER_STANCE_CONFLICT: "客户态度在支持推进与顾虑/等待之间变化，需要确认最新立场。", DATE_ORDER_CONFLICT: "Timeline 日期顺序存在待核对异常。" }[code] || "当前未发现明确矛盾。"; }
function contradictionEvidence(code, events) { return events.filter((event) => code === "COMMITMENT_CONFLICT" ? event.commitmentStatus !== "not-recorded" : code === "CUSTOMER_STANCE_CONFLICT" ? ["supportive", "concerned", "waiting"].includes(event.customerStance) : true).map((event) => event.evidenceToken); }

function opportunityCodesFor(events, digest) {
  const codes = [];
  if (events.some((event) => event.themes.includes("PROGRESS"))) codes.push("PROGRESS");
  if (events.some((event) => event.themes.includes("NEXT_STEP") || event.themes.includes("CUSTOMER_RESPONSE"))) codes.push("CUSTOMER_DEMAND");
  if (events.some((event) => event.themes.includes("DECISION"))) codes.push("DECISION_ACCESS");
  if (events.some((event) => event.themes.includes("ROUTE")) && digest.serviceIssueStatus?.status !== "open") codes.push("ROUTE_FIT");
  return codes.length ? [...new Set(codes)] : ["NONE"];
}
function opportunityEvidence(code, events) { const themes = { PROGRESS: ["PROGRESS"], CUSTOMER_DEMAND: ["NEXT_STEP", "CUSTOMER_RESPONSE"], DECISION_ACCESS: ["DECISION"], ROUTE_FIT: ["ROUTE"], SERVICE_EXPANSION: ["SERVICE_ISSUE"] }[code] || []; return events.filter((event) => event.themes.some((theme) => themes.includes(theme))).map((event) => event.evidenceToken); }

function selectRepresentativeEvidence(events, keyThemes, limit) {
  const selected = [];
  for (const theme of keyThemes) {
    const candidate = events.find((event) => event.themes.includes(theme.code));
    if (candidate && !selected.some((item) => item.evidenceToken === candidate.evidenceToken)) selected.push(candidate);
  }
  for (const event of events) {
    if (selected.length >= limit) break;
    if (!selected.some((item) => item.evidenceToken === event.evidenceToken)) selected.push(event);
  }
  return selected.slice(0, limit).map((event) => ({ evidenceToken: event.evidenceToken, relativeTime: event.relativeTime, activityType: event.activityType, summary: event.semanticSummary, supports: event.themes.slice(0, 3).map((code) => TIMELINE_EXECUTIVE_TEXT.themes[code]).filter(Boolean) }));
}

function momentumFor(events, digest) {
  const recent = events.slice(0, Math.max(1, Math.ceil(events.length / 3)));
  const progress = recent.filter((event) => event.outcome === "progress").length;
  const blocked = recent.filter((event) => event.outcome === "blocked").length + Number(digest.commitmentStatus?.openCount || 0);
  if (events.length < 3) return "INSUFFICIENT";
  if (progress >= blocked + 2) return "ACCELERATING";
  if (blocked >= progress + 2) return "STALLING";
  if (progress && blocked) return "MIXED";
  return "STABLE";
}
function customerPositionFor(events) { const counts = countCodes(events.map((event) => event.customerStance).filter((stance) => stance !== "neutral")); const top = topCodes(counts, 1)[0]; if (!top || !counts[top]) return "UNKNOWN"; if (counts[top] < Math.max(2, Math.ceil(events.length / 3))) return "MIXED"; return { supportive: "SUPPORTIVE", concerned: "CONCERNED", waiting: "WAITING" }[top] || "UNKNOWN"; }
function decisionClarityFor(events, digest) { if (digest.decisionMakerInvolved === "present" && events.some((event) => event.themes.includes("NEXT_STEP"))) return "CLEAR"; if (digest.decisionMakerInvolved === "present" || events.some((event) => event.themes.includes("DECISION"))) return "PARTIAL"; return events.length >= 3 ? "UNCLEAR" : "INSUFFICIENT"; }
function stakeholderDynamicsFor(events) { const roles = [...new Set(events.map((event) => event.actorRole))]; const hasDecision = roles.includes("CUSTOMER-DECISION-MAKER-A"); const hasProcurement = roles.includes("CUSTOMER-PROCUREMENT-B"); const code = hasDecision && hasProcurement ? "MULTI_ROLE_ALIGNMENT" : hasDecision ? "DECISION_ROLE_PRESENT" : hasProcurement ? "PROCUREMENT_ACTIVE" : roles.length > 1 ? "ROLE_GAP" : "INSUFFICIENT"; return { code, roles, statement: { DECISION_ROLE_PRESENT: "已出现决策角色，但仍需确认其对下一步的实际承诺。", PROCUREMENT_ACTIVE: "采购角色参与明显，商务条件可能影响推进。", MULTI_ROLE_ALIGNMENT: "决策和采购角色均有记录，需继续确认角色间是否一致。", ROLE_GAP: "存在多个参与角色，但关键决策责任尚未清晰。", INSUFFICIENT: "Timeline 没有足够的角色信息支持判断。" }[code] }; }
function confidenceFor(events, digest, representativeCount, contradictionCodes = []) { if (events.length >= 6 && representativeCount >= 3 && !contradictionCodes.some((code) => code !== "NONE")) return "HIGH"; if (events.length >= 3 && representativeCount >= 2) return "MEDIUM"; return "LOW"; }
function confidenceForCoverage(eventCount, representativeCount) { return eventCount >= 6 && representativeCount >= 3 ? "HIGH" : eventCount >= 3 && representativeCount >= 2 ? "MEDIUM" : "LOW"; }
function confidenceReason(level, eventCount, representativeCount) { return `${level === "HIGH" ? "记录覆盖较充分" : level === "MEDIUM" ? "记录覆盖有限但可形成初步综合" : "记录或代表证据不足"}；已提取${eventCount}条事件，保留${representativeCount}条代表证据。`; }
function overallCodeFor({ momentumTrend, topBlockers, contradictionCodes, events }) { if (!events.length) return "INSUFFICIENT"; if (contradictionCodes.some((code) => code !== "NONE") || topBlockers.length >= 2) return "REVIEW_REQUIRED"; if (momentumTrend === "STALLING") return "STALLED"; if (momentumTrend === "MIXED") return "MIXED"; return "PROGRESSING"; }

function managementActionsFor({ topBlockers, contradictionCodes, momentumTrend, events }) {
  const codes = [];
  if (contradictionCodes.some((code) => code !== "NONE")) codes.push("RECONCILE_CONTRADICTION");
  for (const blocker of topBlockers) {
    const map = { OPEN_COMMITMENT: "ESCALATE_OPEN_COMMITMENT", PENDING_RESPONSE: "CONFIRM_NEXT_STEP", OBJECTION: "RESOLVE_OBJECTION", SERVICE_ISSUE: "REVIEW_SERVICE_ISSUE", DECISION_GAP: "ALIGN_STAKEHOLDERS", COMPETITION: "REVIEW_CUSTOMER_MOMENTUM" };
    if (map[blocker.code]) codes.push(map[blocker.code]);
  }
  if (momentumTrend === "STALLING" || momentumTrend === "MIXED") codes.push("REVIEW_CUSTOMER_MOMENTUM");
  return [...new Set(codes)].slice(0, 3).map((code) => ({ code, statement: TIMELINE_EXECUTIVE_TEXT.actions[code], status: "Draft", evidenceTokens: [...new Set(topBlockers.flatMap((item) => item.evidenceTokens))].slice(0, 3) }));
}

function executiveSynthesisFacts({ digest, extraction, keyThemes, topBlockers, commitmentCode, contradictionCodes, opportunityCodes, momentumTrend, customerPosition, decisionClarity, stakeholderDynamics, confidence, representativeEvidence }) {
  const facts = [
    ["safeContext.timeline.executive.coverage", "Timeline 综合覆盖度", `${confidenceForCoverage(extraction.eventCount, representativeEvidence.length)}；事件${extraction.eventCount}条；代表证据${representativeEvidence.length}条`],
    ["safeContext.timeline.executive.overall", "Timeline 管理层结论", TIMELINE_EXECUTIVE_TEXT.overall[overallCodeFor({ momentumTrend, topBlockers, contradictionCodes, events: extraction.events })]],
    ["safeContext.timeline.executive.momentum", "Timeline 推进态势", TIMELINE_EXECUTIVE_TEXT.momentum[momentumTrend]],
    ["safeContext.timeline.executive.customerPosition", "客户态度", TIMELINE_EXECUTIVE_TEXT.customerPosition[customerPosition]],
    ["safeContext.timeline.executive.decisionClarity", "决策清晰度", TIMELINE_EXECUTIVE_TEXT.decisionClarity[decisionClarity]],
    ["safeContext.timeline.executive.themes", "主要主题", keyThemes.map((item) => item.label).join("；") || "未记录"],
    ["safeContext.timeline.executive.blockers", "主要阻力", topBlockers.map((item) => item.label).join("；") || "未记录"],
    ["safeContext.timeline.executive.commitment", "承诺与执行", TIMELINE_EXECUTIVE_TEXT.commitment[commitmentCode]],
    ["safeContext.timeline.executive.contradictions", "矛盾与异常", contradictionCodes.filter((code) => code !== "NONE").map(contradictionText).join("；") || "未发现明确矛盾"],
    ["safeContext.timeline.executive.stakeholders", "利益相关者动态", stakeholderDynamics.statement],
    ["safeContext.timeline.executive.eventMix", "Timeline 活动构成", formatCounts(digest.activityMix)],
  ];
  for (const item of representativeEvidence) facts.push([item.evidenceToken, `代表证据：${item.activityType}`, `${item.relativeTime}；${item.summary}`]);
  return facts.filter(([, , value]) => value && String(value).trim()).map(([evidenceToken, label, value]) => ({ evidenceToken, label, value: String(value) }));
}

function relativeTimeLabel(date, now) { if (!date) return "时间未记录"; const days = Math.round((date.getTime() - now.getTime()) / 86_400_000); if (days < -90) return "90天以前"; if (days < -30) return "31-90天前"; if (days < -7) return "8-30天前"; if (days < 0) return "近7天前"; if (days === 0) return "今天"; if (days <= 7) return "未来7天内"; return "未来30天内"; }

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function normalizeActivityType(value) {
  const type = String(value || "").toLowerCase();
  if (type === "4210") return "phonecall";
  if (type === "4201") return "appointment";
  if (type === "4212") return "task";
  if (type.includes("phone")) return "phonecall";
  if (type.includes("appointment") || type.includes("meeting")) return "appointment";
  if (type.includes("task")) return "task";
  return "";
}

function choiceCounts(rows, field) {
  const counts = {};
  for (const row of rows) {
    const value = choiceValue(row, field);
    if (value) counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function uniqueChoices(rows, field) { return Object.keys(choiceCounts(rows, field)).sort(); }

function choiceValue(row, field) {
  const formatted = row?.[`${field}@OData.Community.Display.V1.FormattedValue`];
  if (formatted !== undefined && formatted !== null && String(formatted).trim()) return safeCategory(formatted);
  const raw = row?.[field];
  if (raw === true) return "是";
  if (raw === false) return "否";
  if (raw === undefined || raw === null || String(raw).trim() === "") return "";
  return safeCategory(`code-${raw}`);
}

function safeCategory(value) { return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 48); }
function formatCounts(value) { const entries = Object.entries(value || {}).filter(([, count]) => Number(count) > 0); return entries.length ? entries.map(([key, count]) => `${key}=${count}`).join("；") : "未记录"; }
function formatCommitment(value = {}) { return `已作出${Number(value.madeCount || 0)}项；已完成${Number(value.completedCount || 0)}项；未完成${Number(value.openCount || 0)}项；期限${value.dueBand || "未记录"}`; }
function formatStatus(value = {}, categoriesKey) {
  const status = value.status || "not-recorded";
  const categories = Array.isArray(value[categoriesKey]) && value[categoriesKey].length ? `；类别${value[categoriesKey].join("、")}` : "";
  if (Object.hasOwn(value, "unresolvedCount")) return `${status}；未解决${Number(value.unresolvedCount || 0)}项；已解决${Number(value.resolvedCount || 0)}项${categories}`;
  return `${status}；出现${Number(value.presentCount || 0)}项${categories}`;
}
function dueDateBand(values, now) { const dates = values.map(parseDate).filter(Boolean); if (!dates.length) return "not-recorded"; const days = Math.min(...dates.map((date) => (date.getTime() - now.getTime()) / 86_400_000)); if (days < 0) return "overdue"; if (days <= 7) return "within-7-days"; if (days <= 30) return "within-30-days"; return "future"; }
function relativeDateBand(date, now) { if (!date) return "not-recorded"; const days = (date.getTime() - now.getTime()) / 86_400_000; if (days < -30) return "older-than-30-days"; if (days < 0) return "within-30-days-ago"; if (days <= 7) return "upcoming-within-7-days"; if (days <= 30) return "upcoming-within-30-days"; return "future-over-30-days"; }
function cadenceBand(total) { if (!total) return "none"; if (total <= 2) return "light"; if (total <= 5) return "steady"; return "active"; }
function latest(values) { return values.length ? new Date(Math.max(...values.map((value) => value.getTime()))) : null; }
function parseDate(value) { const date = new Date(value || ""); return Number.isNaN(date.getTime()) ? null : date; }
