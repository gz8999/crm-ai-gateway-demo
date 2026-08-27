import { TIMELINE_EXECUTIVE_TEXT } from "../../decision/timelineDigest.mjs";

const COMMON = {
  "zh-CN": {
    title: { "DA-02": "当前案件赢单与风险分析", "DA-03": "预算、实绩与盈利分析", "DA-06": "物流方案与路线适配分析", "DA-07": "会前准备与谈判策略" },
    summary: { STABLE_PROGRESS: "当前安全信号总体稳定，适合按既定节奏继续推进", REVIEW_REQUIRED: "当前存在需要人工核对的推进或数据质量信号", HIGH_RISK_REVIEW: "当前安全信号支持优先开展赢单风险复核", GROWTH_POTENTIAL: "当前账户聚合信号支持进一步验证增长空间" },
    risk: { STALLED_PROGRESS: "推进停滞信号需要优先复核。", FINANCIAL_VARIANCE: "预算与实绩偏差类别需要核对恢复假设。", DATA_CONTRADICTION: "当前事实一致性信号需要先完成数据确认。", ROUTE_REVIEW: "路线一致性信号需要授权人员复核。", MULTI_RISK_REVIEW: "多个风险维度同时需要管理层关注。", MEETING_PREPARATION: "会议前需要围绕待确认问题准备提问。" },
    action: { CONTINUE_MONITORING: "保持当前跟进节奏并记录下一次人工复核", CONFIRM_NEXT_STEP: "确认下一步推进条件和验收标准", RECONCILE_FACTS: "核对并统一存在差异的业务事实", REVIEW_BUDGET_ACTUAL: "复核预算与实绩区间及偏差原因", PREPARE_CUSTOMER_MEETING: "准备围绕安全信号的会议问题清单", CONFIRM_ROUTE_AND_COVERAGE: "核验路线一致性与服务覆盖范围", ALIGN_STAKEHOLDERS: "确认决策参与角色和后续人工负责人" },
    limitation: { IDENTITY_MASKED: "客户及联系人身份已脱敏。", EXACT_AMOUNT_WITHHELD: "模型仅接收金额区间，不接收精确金额。", RAW_TIMELINE_WITHHELD: "未向模型提供原始活动记录正文。", DETERMINISTIC_SCORE_AUTHORITY: "Health Score 与 Grade 由确定性引擎负责。", HUMAN_REVIEW_REQUIRED: "输出为分析草案，仍需人工确认。" },
    defaultTitle: "深度分析", inferenceLabel: "外部模型推断，不是 CRM 事实", pendingRole: "待人工指定", pendingHorizon: "待人工确定（外部模型建议，非 CRM 正式期限）", source: "外部模型推断", timelineActionReason: "该行动来自模型对全量 Timeline Executive Analysis Pack 的综合判断。", confidenceReason: "外部模型仅在安全事实范围内选择判断；确定性健康等级不由模型改写。", timelineConfidenceReason: (count) => `外部模型只选择全量 Timeline 聚合包支持的代码，并引用${count}条代表证据。`, stableOpportunity: "当前信号支持保持既定跟进节奏。", growthOpportunity: "可在人工核实当前事实后继续验证增长空间。", noExtraRisk: "当前没有额外风险代码支持升级判断。", currentCrmSource: "当前 CRM Safe Context", timelineSource: "Timeline Executive Synthesis",
    focus: { "DA-02": "赢单推进与风险", "DA-03": "预算、实绩与盈利", "DA-06": "物流路线与服务适配", "DA-07": "会前准备与谈判" },
    inference: (focus, summary, risks, none) => `围绕${focus}，外部模型选择了“${summary}”的判断方向。${risks || none}`,
    scenario: { baseline: "基准情景", optimistic: "乐观情景", risk: "风险情景", stable: "稳定", improve: "改善", worsen: "恶化", baselineText: "保持当前安全分类并由人工持续复核。", optimisticText: "关键待确认项得到核实，安全信号改善。", riskText: (confidence) => `${confidence}置信度下，未解决的关键事项仍需人工升级。` },
    confidence: { HIGH: "高", MEDIUM: "中", LOW: "低" },
  },
  "en-US": {
    title: { "DA-02": "Win Probability and Risk Analysis", "DA-03": "Budget, Actuals and Profitability Analysis", "DA-06": "Logistics Solution and Route Fit Analysis", "DA-07": "Meeting Preparation and Negotiation Strategy" },
    summary: { STABLE_PROGRESS: "Current safe signals are stable and support continuing at the planned cadence", REVIEW_REQUIRED: "Current progress or data-quality signals require human verification", HIGH_RISK_REVIEW: "Current safe signals support a prioritized win-risk review", GROWTH_POTENTIAL: "Current account aggregates support further validation of growth potential" },
    risk: { STALLED_PROGRESS: "The stalled-progress signal requires priority review.", FINANCIAL_VARIANCE: "The budget-to-actual variance requires validation of the recovery assumptions.", DATA_CONTRADICTION: "Current fact-consistency signals require data verification first.", ROUTE_REVIEW: "An authorized operator must review the route-consistency signal.", MULTI_RISK_REVIEW: "Multiple risk dimensions require management attention.", MEETING_PREPARATION: "The meeting should address the outstanding verification questions." },
    action: { CONTINUE_MONITORING: "Maintain the current follow-up cadence and record the next human review", CONFIRM_NEXT_STEP: "Confirm the next-step conditions and acceptance criteria", RECONCILE_FACTS: "Reconcile the inconsistent business facts", REVIEW_BUDGET_ACTUAL: "Review the budget and actual bands and the variance drivers", PREPARE_CUSTOMER_MEETING: "Prepare a meeting question list based on safe signals", CONFIRM_ROUTE_AND_COVERAGE: "Verify route consistency and service coverage", ALIGN_STAKEHOLDERS: "Confirm decision participants and the human owner" },
    limitation: { IDENTITY_MASKED: "Customer and contact identities are redacted.", EXACT_AMOUNT_WITHHELD: "The model receives amount bands, not exact amounts.", RAW_TIMELINE_WITHHELD: "Raw activity text was not sent to the model.", DETERMINISTIC_SCORE_AUTHORITY: "Health Score and Grade remain controlled by the deterministic engine.", HUMAN_REVIEW_REQUIRED: "The output is an analysis draft and requires human confirmation." },
    defaultTitle: "Deep Analysis", inferenceLabel: "External-model inference, not a CRM fact", pendingRole: "To be assigned by a person", pendingHorizon: "To be decided by a person (model suggestion, not a CRM due date)", source: "External-model inference", timelineActionReason: "This action is based on the model's synthesis of the full Timeline Executive Analysis Pack.", confidenceReason: "The external model selected conclusions only within the safe-fact boundary; it cannot alter the deterministic health grade.", timelineConfidenceReason: (count) => `The model selected only codes supported by the full Timeline aggregate pack and cited ${count} representative evidence items.`, stableOpportunity: "Current signals support maintaining the planned follow-up cadence.", growthOpportunity: "Growth potential can be validated after a person confirms the current facts.", noExtraRisk: "No additional risk code supports escalation.", currentCrmSource: "Current CRM Safe Context", timelineSource: "Timeline Executive Synthesis",
    focus: { "DA-02": "win progression and risk", "DA-03": "budget, actuals and profitability", "DA-06": "route and service fit", "DA-07": "meeting preparation and negotiation" },
    inference: (focus, summary, risks, none) => `For ${focus}, the external model selected the following direction: “${summary}.” ${risks || none}`,
    scenario: { baseline: "Baseline scenario", optimistic: "Upside scenario", risk: "Risk scenario", stable: "Stable", improve: "Improving", worsen: "Deteriorating", baselineText: "Maintain the current safe classification with continued human review.", optimisticText: "Key open items are verified and the safe signals improve.", riskText: (confidence) => `At ${confidence} confidence, unresolved key items still require human escalation.` },
    confidence: { HIGH: "High", MEDIUM: "Medium", LOW: "Low" },
  },
  "ja-JP": {
    title: { "DA-02": "案件の受注確度とリスク分析", "DA-03": "予算・実績・収益性分析", "DA-06": "物流方案とルート適合性分析", "DA-07": "会議準備と交渉戦略" },
    summary: { STABLE_PROGRESS: "現在の安全シグナルは概ね安定しており、計画されたペースでの継続を支持します", REVIEW_REQUIRED: "進捗またはデータ品質のシグナルには人手による確認が必要です", HIGH_RISK_REVIEW: "現在の安全シグナルは受注リスクの優先レビューを支持します", GROWTH_POTENTIAL: "現在の顧客集計シグナルは成長余地の追加検証を支持します" },
    risk: { STALLED_PROGRESS: "進捗停滞シグナルを優先的に確認する必要があります。", FINANCIAL_VARIANCE: "予算と実績の差異について回復仮説を確認する必要があります。", DATA_CONTRADICTION: "事実の整合性を先に確認する必要があります。", ROUTE_REVIEW: "ルート整合性シグナルは権限者による確認が必要です。", MULTI_RISK_REVIEW: "複数のリスク軸で経営層の確認が必要です。", MEETING_PREPARATION: "会議前に未確認事項を中心とした質問を準備する必要があります。" },
    action: { CONTINUE_MONITORING: "現在のフォロー頻度を維持し、次回の人手レビューを記録する", CONFIRM_NEXT_STEP: "次の進行条件と受入基準を確認する", RECONCILE_FACTS: "差異のある業務事実を照合する", REVIEW_BUDGET_ACTUAL: "予算・実績帯と差異要因を確認する", PREPARE_CUSTOMER_MEETING: "安全シグナルに基づく会議質問リストを準備する", CONFIRM_ROUTE_AND_COVERAGE: "ルート整合性とサービス範囲を確認する", ALIGN_STAKEHOLDERS: "意思決定参加者と担当者を確認する" },
    limitation: { IDENTITY_MASKED: "顧客と連絡先のIDは匿名化されています。", EXACT_AMOUNT_WITHHELD: "モデルには金額帯のみ送信され、正確な金額は送信されません。", RAW_TIMELINE_WITHHELD: "活動原文はモデルに送信されていません。", DETERMINISTIC_SCORE_AUTHORITY: "Health Score と Grade は決定論的エンジンが管理します。", HUMAN_REVIEW_REQUIRED: "出力は分析ドラフトであり、人手による確認が必要です。" },
    defaultTitle: "詳細分析", inferenceLabel: "外部モデルの推論であり、CRM事実ではありません", pendingRole: "人手で指定", pendingHorizon: "人手で決定（モデル提案でありCRM正式期限ではありません）", source: "外部モデル推論", timelineActionReason: "このアクションは、モデルによる全Timeline Executive Analysis Packの総合判断に基づきます。", confidenceReason: "外部モデルは安全な事実範囲内でのみ判断を選択し、決定論的な健康Gradeは変更できません。", timelineConfidenceReason: (count) => `モデルはTimeline集計パックが支持するコードだけを選択し、代表証拠${count}件を引用しました。`, stableOpportunity: "現在のシグナルは計画されたフォロー頻度の維持を支持します。", growthOpportunity: "人手で現在の事実を確認した後、成長余地を追加検証できます。", noExtraRisk: "リスク引き上げを支持する追加コードはありません。", currentCrmSource: "現在のCRM Safe Context", timelineSource: "Timeline経営層総合分析",
    focus: { "DA-02": "受注進捗とリスク", "DA-03": "予算・実績・収益性", "DA-06": "物流ルートとサービス適合", "DA-07": "会議準備と交渉" },
    inference: (focus, summary, risks, none) => `${focus}について、外部モデルは「${summary}」という判断方向を選択しました。${risks || none}`,
    scenario: { baseline: "基準シナリオ", optimistic: "楽観シナリオ", risk: "リスクシナリオ", stable: "安定", improve: "改善", worsen: "悪化", baselineText: "現在の安全分類を維持し、人手レビューを継続します。", optimisticText: "主要な未確認事項が確認され、安全シグナルが改善します。", riskText: (confidence) => `${confidence}の信頼度では、未解決の主要事項に人手によるエスカレーションが必要です。` },
    confidence: { HIGH: "高", MEDIUM: "中", LOW: "低" },
  },
};

const TIMELINE_EN = {
  overall: { PROGRESSING: "Timeline shows continuous progress, while the recorded next steps still require closure.", STALLED: "Timeline shows weak momentum; waiting, open commitments or recurring friction are extending the decision cycle.", MIXED: "Timeline contains both progress and unresolved friction, so opportunity health cannot be judged from one status alone.", REVIEW_REQUIRED: "Timeline contains commitments, customer responses, objections or record conflicts that require management review.", INSUFFICIENT: "Timeline evidence is insufficient for a stable management judgment." },
  momentum: { ACCELERATING: "Recent records show increasing momentum.", STABLE: "The progression cadence is stable.", STALLING: "Recent progress signals are weaker and indicate potential stalling.", MIXED: "Recent records contain both progress and friction.", INSUFFICIENT: "There is insufficient evidence to assess momentum." },
  customerPosition: { SUPPORTIVE: "The customer's position generally supports progress.", CONCERNED: "The customer has expressed material concerns or objections.", WAITING: "The customer is waiting for a response, confirmation or next-step arrangement.", MIXED: "The customer shows both interest and concern; the position has not converged.", UNKNOWN: "Available content is insufficient to assess the customer position." },
  decisionClarity: { CLEAR: "Decision roles and next steps are clear.", PARTIAL: "Decision-role or approval signals exist, but closure is incomplete.", UNCLEAR: "Decision roles, conditions or next steps remain unclear.", INSUFFICIENT: "There is insufficient evidence to assess decision clarity." },
  themes: { NEXT_STEP: "Next steps and closure", CUSTOMER_RESPONSE: "Customer response and waiting", COMMITMENT: "Commitments and execution", OBJECTION: "Customer objections", SERVICE_ISSUE: "Service issues", DECISION: "Decision roles and approval", COMPETITION: "Competition and alternatives", ROUTE: "Route and solution fit", PROGRESS: "Milestone progress", COMMERCIAL: "Commercial and budget conditions" },
  blockers: { OPEN_COMMITMENT: "Open commitment", PENDING_RESPONSE: "Pending customer response", OBJECTION: "Unresolved customer objection", SERVICE_ISSUE: "Unresolved service issue", DECISION_GAP: "Decision-role or condition gap", COMPETITION: "Unclear competitive position", CONTRADICTION: "Conflicting records" },
  commitment: { NO_COMMITMENTS: "No commitments are recorded.", COMPLETED_COMMITMENTS: "All recorded commitments are complete.", OPEN_COMMITMENTS: "Open commitments require confirmation of ownership and completion conditions.", MIXED_COMMITMENTS: "Completed and open commitments coexist, indicating inconsistent closure.", OVERDUE_COMMITMENTS: "One or more commitments are overdue and incomplete.", INSUFFICIENT: "Commitment information is insufficient." },
  opportunities: { PROGRESS: "Milestone progress supports advancing the next step.", CUSTOMER_DEMAND: "Customer demand is sufficiently explicit to validate a next-step solution.", DECISION_ACCESS: "Decision-role signals support clarifying the decision path.", ROUTE_FIT: "Route or solution-fit signals support further service-opportunity validation.", SERVICE_EXPANSION: "Service or coverage signals may support a service-improvement opportunity.", NONE: "Current content does not support a new opportunity judgment." },
  actions: { ESCALATE_OPEN_COMMITMENT: "Escalate ownership of open commitments to management.", ALIGN_STAKEHOLDERS: "Align decision roles, procurement roles and internal owners.", RESOLVE_OBJECTION: "Define a response, owner and validation point for customer objections.", REVIEW_SERVICE_ISSUE: "Review the current service-issue status and closure evidence.", CONFIRM_NEXT_STEP: "Confirm whether the recorded next step was completed.", RECONCILE_CONTRADICTION: "Reconcile conflicting records before updating the management judgment.", REVIEW_CUSTOMER_MOMENTUM: "Review changes in customer position and recent momentum." },
};

const TIMELINE_JA = {
  overall: { PROGRESSING: "Timelineは継続的な進展を示していますが、記録された次のステップの完了確認が必要です。", STALLED: "Timelineは進行力の低下を示し、待機・未完了の約束・反復する障害が意思決定期間を延ばしています。", MIXED: "Timelineには進展と未解決の障害が混在しており、単一状態だけでは健全性を判断できません。", REVIEW_REQUIRED: "Timelineには経営層の確認が必要な約束、顧客回答、異議または記録矛盾があります。", INSUFFICIENT: "安定した経営判断を形成するにはTimeline証拠が不足しています。" },
  momentum: { ACCELERATING: "最近の記録では進行力が高まっています。", STABLE: "進行ペースは安定しています。", STALLING: "最近の進捗シグナルは弱く、停滞の可能性があります。", MIXED: "最近の記録には進展と障害が混在しています。", INSUFFICIENT: "進行力を判断する証拠が不足しています。" },
  customerPosition: { SUPPORTIVE: "顧客姿勢は概ね進行を支持しています。", CONCERNED: "顧客は明確な懸念または異議を示しています。", WAITING: "顧客は回答、確認または次の手配を待っています。", MIXED: "顧客は関心と懸念の両方を示し、姿勢は収束していません。", UNKNOWN: "顧客姿勢を判断する内容が不足しています。" },
  decisionClarity: { CLEAR: "意思決定役割と次のステップは明確です。", PARTIAL: "意思決定役割または承認シグナルはありますが、完了していません。", UNCLEAR: "意思決定役割、条件または次のステップが不明確です。", INSUFFICIENT: "意思決定の明確性を判断する証拠が不足しています。" },
  themes: { NEXT_STEP: "次のステップと完了", CUSTOMER_RESPONSE: "顧客回答と待機", COMMITMENT: "約束と実行", OBJECTION: "顧客異議", SERVICE_ISSUE: "サービス問題", DECISION: "意思決定役割と承認", COMPETITION: "競争と代替案", ROUTE: "ルートと方案適合", PROGRESS: "段階的進展", COMMERCIAL: "商務と予算条件" },
  blockers: { OPEN_COMMITMENT: "未完了の約束", PENDING_RESPONSE: "顧客回答待ち", OBJECTION: "未解決の顧客異議", SERVICE_ISSUE: "未解決のサービス問題", DECISION_GAP: "意思決定役割または条件の不足", COMPETITION: "競争位置が不明確", CONTRADICTION: "記録間の矛盾" },
  commitment: { NO_COMMITMENTS: "約束は記録されていません。", COMPLETED_COMMITMENTS: "記録された約束はすべて完了しています。", OPEN_COMMITMENTS: "未完了の約束について担当と完了条件の確認が必要です。", MIXED_COMMITMENTS: "完了と未完了の約束が混在し、完了状況が一貫していません。", OVERDUE_COMMITMENTS: "期限超過かつ未完了の約束があります。", INSUFFICIENT: "約束情報が不足しています。" },
  opportunities: { PROGRESS: "段階的進展に基づき次のステップを進められます。", CUSTOMER_DEMAND: "顧客需要が明確で、次の方案検証につなげられます。", DECISION_ACCESS: "意思決定役割シグナルに基づき、判断経路を明確化できます。", ROUTE_FIT: "ルートまたは方案適合シグナルはサービス機会の追加検証を支持します。", SERVICE_EXPANSION: "サービスまたはカバレッジシグナルは改善機会につながる可能性があります。", NONE: "新たな機会判断を支持する内容が不足しています。" },
  actions: { ESCALATE_OPEN_COMMITMENT: "未完了の約束の担当確認に経営層を関与させる。", ALIGN_STAKEHOLDERS: "意思決定役割、調達役割、社内担当を整合する。", RESOLVE_OBJECTION: "顧客異議への回答、担当、検証点を定義する。", REVIEW_SERVICE_ISSUE: "サービス問題の現状と完了証拠を確認する。", CONFIRM_NEXT_STEP: "記録された次のステップの完了状況を確認する。", RECONCILE_CONTRADICTION: "矛盾する記録を照合してから経営判断を更新する。", REVIEW_CUSTOMER_MOMENTUM: "顧客姿勢の変化と最近の進行力を確認する。" },
};

export function normalizeDeepAnalysisLocale(value) {
  return value === "en-US" || value === "ja-JP" ? value : "zh-CN";
}

export function deepAnalysisText(value) {
  return COMMON[normalizeDeepAnalysisLocale(value)];
}

export function localizedTimelineText(value) {
  const locale = normalizeDeepAnalysisLocale(value);
  return locale === "en-US" ? TIMELINE_EN : locale === "ja-JP" ? TIMELINE_JA : TIMELINE_EXECUTIVE_TEXT;
}

const STAKEHOLDER = {
  "zh-CN": { DECISION_ROLE_PRESENT: "已出现决策角色，但仍需确认其对下一步的实际承诺。", PROCUREMENT_ACTIVE: "采购角色参与明显，商务条件可能影响推进。", MULTI_ROLE_ALIGNMENT: "决策和采购角色均有记录，需继续确认角色间是否一致。", ROLE_GAP: "存在多个参与角色，但关键决策责任尚未清晰。", INSUFFICIENT: "Timeline 没有足够的角色信息支持判断。" },
  "en-US": { DECISION_ROLE_PRESENT: "A decision role is present, but its commitment to the next step still requires confirmation.", PROCUREMENT_ACTIVE: "Procurement participation is material and commercial conditions may affect progress.", MULTI_ROLE_ALIGNMENT: "Decision and procurement roles are recorded; alignment between them still requires confirmation.", ROLE_GAP: "Multiple participants are present, but decision accountability remains unclear.", INSUFFICIENT: "Timeline does not contain enough role information for a judgment." },
  "ja-JP": { DECISION_ROLE_PRESENT: "意思決定役割は確認できますが、次のステップへの実際のコミットメント確認が必要です。", PROCUREMENT_ACTIVE: "調達役割の参加が明確で、商務条件が進行に影響する可能性があります。", MULTI_ROLE_ALIGNMENT: "意思決定役割と調達役割が記録されていますが、両者の整合確認が必要です。", ROLE_GAP: "複数の参加者はいますが、主要な意思決定責任が不明確です。", INSUFFICIENT: "役割を判断するTimeline情報が不足しています。" },
};

const CONTRADICTION = {
  "zh-CN": { STATUS_TEXT_MISMATCH: "Timeline 同时出现阶段性进展与阻滞记录，需要确认当前真实状态。", COMMITMENT_CONFLICT: "Timeline 同时出现已完成和未完成承诺，需要核对承诺口径。", CUSTOMER_STANCE_CONFLICT: "客户态度在支持推进与顾虑/等待之间变化，需要确认最新立场。", DATE_ORDER_CONFLICT: "Timeline 日期顺序存在待核对异常。", NONE: "当前未发现明确矛盾。" },
  "en-US": { STATUS_TEXT_MISMATCH: "Timeline contains both milestone progress and stalled records; the current state requires confirmation.", COMMITMENT_CONFLICT: "Timeline contains both completed and open commitments; the commitment baseline requires reconciliation.", CUSTOMER_STANCE_CONFLICT: "The customer position shifts between support and concern or waiting; the latest position requires confirmation.", DATE_ORDER_CONFLICT: "Timeline date order contains an anomaly that requires review.", NONE: "No clear contradiction was found." },
  "ja-JP": { STATUS_TEXT_MISMATCH: "Timelineに段階的進展と停滞の両方があり、現在の実態確認が必要です。", COMMITMENT_CONFLICT: "Timelineに完了済みと未完了の約束が混在し、基準の照合が必要です。", CUSTOMER_STANCE_CONFLICT: "顧客姿勢が支持と懸念・待機の間で変化しており、最新姿勢の確認が必要です。", DATE_ORDER_CONFLICT: "Timelineの日付順序に確認が必要な異常があります。", NONE: "明確な矛盾は確認されませんでした。" },
};

export function localizedStakeholderText(code, locale) {
  const catalog = STAKEHOLDER[normalizeDeepAnalysisLocale(locale)];
  return catalog[code] || catalog.INSUFFICIENT;
}

export function localizedContradictionText(code, locale) {
  const catalog = CONTRADICTION[normalizeDeepAnalysisLocale(locale)];
  return catalog[code] || catalog.NONE;
}
