type Language = "zh-CN" | "ja-JP" | "en-US";

function getActiveLanguage(): Language {
  if (typeof window === "undefined") return "zh-CN";
  const value = window.localStorage.getItem("crm-ai-gateway-language");
  return value === "ja-JP" || value === "en-US" ? value : "zh-CN";
}

const PRIORITY_LABELS: Record<Language, Record<string, string>> = {
  "zh-CN": {
  Critical: "严重",
  High: "高风险",
  Medium: "中等",
  Low: "低风险",
  Monitor: "正常监测",
  },
  "ja-JP": { Critical: "重大", High: "高リスク", Medium: "中", Low: "低リスク", Monitor: "通常監視" },
  "en-US": { Critical: "Critical", High: "High risk", Medium: "Medium", Low: "Low risk", Monitor: "Normal monitoring" },
};

const STAGE_LABELS: Record<Language, Record<string, string>> = {
  "zh-CN": {
  Qualify: "授予资格",
  Develop: "开发中",
  Propose: "提案中",
  Close: "案件关闭",
  },
  "ja-JP": { Qualify: "適格性確認", Develop: "開発中", Propose: "提案中", Close: "案件終了" },
  "en-US": { Qualify: "Qualify", Develop: "Develop", Propose: "Propose", Close: "Closed" },
};

export function priorityLabel(value: string, language = getActiveLanguage()) {
  return PRIORITY_LABELS[language][value] || value;
}

export function stageLabel(value: string, language = getActiveLanguage()) {
  return STAGE_LABELS[language][value] || value;
}

export function maskOpportunityToken(value: string) {
  const suffix = value.match(/(\d{3})$/)?.[1];
  return suffix ? `SAFE-OPP-${suffix}` : "SAFE-OPP";
}

export function booleanLabel(value: boolean, language = getActiveLanguage()) {
  return language === "ja-JP" ? value ? "はい" : "いいえ" : language === "en-US" ? value ? "Yes" : "No" : value ? "是" : "否";
}

const DEPARTMENT_LABELS: Record<Language, Record<string, string>> = {
  "zh-CN": { all: "全部部门", "dept1-industry": "Dept1 Industry", "dept1-distribution": "Dept1 Distribution", "dept2-lcms": "Dept2 LCMS", "dept3-project-cargo": "Dept3 Project Cargo", "dept3-dangerous-goods": "Dept3 Dangerous Goods", ff: "FF", others: "Others" },
  "ja-JP": { all: "すべての部門", "dept1-industry": "Dept1 Industry", "dept1-distribution": "Dept1 Distribution", "dept2-lcms": "Dept2 LCMS", "dept3-project-cargo": "Dept3 Project Cargo", "dept3-dangerous-goods": "Dept3 Dangerous Goods", ff: "FF", others: "その他" },
  "en-US": { all: "All departments", "dept1-industry": "Dept1 Industry", "dept1-distribution": "Dept1 Distribution", "dept2-lcms": "Dept2 LCMS", "dept3-project-cargo": "Dept3 Project Cargo", "dept3-dangerous-goods": "Dept3 Dangerous Goods", ff: "FF", others: "Others" },
};

const DEPARTMENT_ALIASES: Record<string, string> = { "全部部门": "all", "すべての部門": "all", "All departments": "all" };

export function departmentLabel(value: string, language = getActiveLanguage()) {
  const id = DEPARTMENT_ALIASES[value] || value;
  return DEPARTMENT_LABELS[language][id] || value;
}

const DEDUCTION_LABELS: Record<Language, Record<string, string>> = {
  "zh-CN": { pipeline: "推进", completeness: "完整度", profitability: "盈利", engagement: "互动", risk: "风险", confidence: "置信" },
  "ja-JP": { pipeline: "推進", completeness: "完全性", profitability: "収益性", engagement: "関与", risk: "リスク", confidence: "信頼度" },
  "en-US": { pipeline: "Pipeline", completeness: "Completeness", profitability: "Profitability", engagement: "Engagement", risk: "Risk", confidence: "Confidence" },
};

export function deductionDimensionLabel(value?: string, language = getActiveLanguage()) {
  return DEDUCTION_LABELS[language][value || ""] || (language === "ja-JP" ? "未記録" : language === "en-US" ? "Not recorded" : "未记录");
}

const SCENARIO_TITLES: Record<string, string> = {
  "stalled-high-value": "高价值停滞",
  "budget-actual-gap": "预算与实绩偏差",
  "data-contradiction": "数据矛盾",
  "growth-opportunity": "增长机会",
  "location-route-risk": "地点与路线风险",
  "meeting-prep": "会前准备",
  "multi-risk-priority": "多风险优先级",
  "healthy-control": "健康对照",
};

export function scenarioTitle(id: string, fallback: string, language = getActiveLanguage()) {
  if (language === "en-US") return id.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ") || fallback;
  if (language === "ja-JP") return ({ "stalled-high-value": "高価値案件の停滞", "budget-actual-gap": "予算と実績の差異", "data-contradiction": "データ矛盾", "growth-opportunity": "成長機会", "location-route-risk": "地点・ルートリスク", "meeting-prep": "会議準備", "multi-risk-priority": "複合リスク優先度", "healthy-control": "健全性対照" } as Record<string, string>)[id] || fallback;
  return SCENARIO_TITLES[id] || fallback;
}

export function fallbackReasonLabel(value: string, language = getActiveLanguage()) {
  if (!value || value === "None" || value === "无") return language === "ja-JP" ? "なし" : language === "en-US" ? "None" : "无";
  if (value === "AI_PROVIDER is not openai-compatible.") return language === "ja-JP" ? "デモモード：互換外部モデル未設定" : language === "en-US" ? "Demo mode: no compatible external model configured" : "演示模式：未配置外部兼容模型";
  if (value === "ALLOW_EXTERNAL_AI is not true.") return language === "ja-JP" ? "外部AIは未承認" : language === "en-US" ? "External AI is not authorized" : "外部 AI 未授权";
  if (value.startsWith("Missing external LLM config:")) return language === "ja-JP" ? "外部モデル設定が不完全" : language === "en-US" ? "External model configuration is incomplete" : "外部模型配置不完整";
  return value;
}

const DECISION_TEXT: Record<string, string> = {
  "Executive decision summary": "管理层决策摘要",
  "Risk and priority finding": "风险与优先级判断",
  "Opportunity 360 assessment": "商机 360 判断",
  "Recommended action plan": "建议行动方案",
  "Meeting preparation": "会议准备",
  "Portfolio intelligence": "组合洞察",
  "Management view: Multiple safe signals indicate that this case should lead the management review queue.": "管理视角：多项安全信号表明该商机应进入管理层优先复核队列。",
  "Multiple safe signals indicate that this case should lead the management review queue.": "多项安全信号表明该商机应进入管理层优先复核队列。",
  "Run an evidence review": "开展证据复核",
  "Resolve the highest-impact safe signals before changing the forecast.": "在调整预测前，先核实影响最大的安全信号。",
  "Action sequencing: Multiple safe signals indicate that this case should lead the management review queue.": "行动排序：该商机存在多项安全风险信号，应优先完成证据复核。",
  "Deterministic assessment from sanitized categorical signals.": "基于脱敏分类信号的确定性判断。",
  "A high-value opportunity appears stalled and warrants a focused unblock review.": "高价值商机存在明显停滞，需要聚焦排除推进障碍。",
  "Actual performance is materially below the sanitized budget range.": "实际表现明显低于脱敏后的预算区间。",
  "The forecast signal should be treated cautiously until the data contradiction is resolved.": "数据矛盾解决前，应谨慎使用当前预测信号。",
  "The internal route configuration needs verification; no external disruption is asserted.": "内部路线配置需要核验；当前不对外部中断作任何断言。",
  "The opportunity is progressing at a healthy cadence; continue normal monitoring.": "商机正按健康节奏推进，建议保持常规监测。",
  "Management view: The opportunity is progressing at a healthy cadence; continue normal monitoring.": "管理视角：商机正按健康节奏推进，建议保持常规监测。",
  "Hypothesis: the account may support a targeted cross-sell conversation; validate with the account owner.": "假设：该客户可能适合开展定向交叉销售；需与客户负责人核实。",
  "The meeting should focus on unresolved decision questions and stakeholder alignment.": "会议应聚焦尚未解决的决策问题和关键人对齐。",
  "The meeting appears prepared; preserve the current agenda.": "会议准备度良好，建议保持当前议程。",
  "The scoped portfolio contains escalated cases that should be sequenced ahead of routine monitoring.": "当前组合包含升级案件，应优先于常规监测事项处理。",
  "The scoped portfolio has no escalation signal.": "当前组合没有升级处理信号。",
  "High-value and severe-stagnation bands are both present.": "高价值与严重停滞信号同时存在。",
  "The material variance category is derived from complete monthly aggregates.": "重大偏差信号来自完整的月度聚合。",
  "Contradictory or missing safe fields reduce decision confidence.": "安全字段的矛盾或缺失降低了决策置信度。",
  "Only internal route-consistency metadata is available.": "当前仅有内部路线一致性元数据。",
  "Safe indicators are aligned and no escalation signal is present.": "安全指标一致，未发现升级信号。",
  "Growth is a hypothesis based on account-level safe aggregates.": "增长机会仅是基于客户级安全聚合的待验证假设。",
  "Meeting guidance uses derived readiness signals only and excludes communication content.": "会议建议仅使用派生准备度信号，不包含沟通原文。",
  "Confirm the next decision milestone": "确认下一决策里程碑",
  "A dated milestone can test whether the opportunity remains actionable.": "明确日期的里程碑可验证商机是否仍具可执行性。",
  "Review the recovery assumptions": "复核恢复假设",
  "Reconcile the budget cadence with recorded actual bands.": "将预算节奏与已记录的实绩区间进行核对。",
  "Resolve the flagged fields": "解决被标记字段",
  "Improve data quality before relying on the forecast.": "在依赖预测前先提升数据质量。",
  "Verify routing master data": "核验路线主数据",
  "Confirm the sanitized route combination with an authorized operator.": "由授权运营人员确认脱敏路线组合。",
  "Maintain the current cadence": "保持当前推进节奏",
  "No risk escalation is supported by the safe evidence.": "安全证据不支持风险升级。",
  "Validate the whitespace hypothesis": "验证服务空白假设",
  "Use account planning to confirm whether the inferred service gap is real.": "通过客户规划确认推断的服务缺口是否真实存在。",
  "Prepare a question-led agenda": "准备问题导向的会议议程",
  "Address the safe open-question count without using communication transcripts.": "仅根据安全的待确认问题数量准备议程，不使用沟通原文。",
  "Owner token": "脱敏负责人",
  "Within 2 days": "2 天内",
  "Within 3 days": "3 天内",
  "This week": "本周内",
  "Before forecast review": "预测复核前",
  "Before quotation": "报价前",
  "Next scheduled review": "下次计划复核",
  "Next account review": "下次客户复核",
  "Before meeting": "会议前",
  "Draft only": "仅草案",
  "Priority": "优先级",
  "Progress": "推进状态",
  "Stage": "阶段",
  "Data quality": "数据质量",
  "Revenue band": "收入区间",
  "Budget band": "预算区间",
  "Actual band": "实绩区间",
  "Date status": "日期状态",
  "Variance": "偏差",
  "Forecast": "预测类别",
  "Readiness": "决策准备度",
  "Contradictions": "矛盾信号",
  "Mode": "运输模式",
  "Route consistency": "路线一致性",
  "Route check": "路线核验",
  "Service coverage": "服务覆盖",
  "Relationship": "关系成熟度",
  "Whitespace": "服务空白",
  "Trend": "商机趋势",
  "Meeting window": "会议窗口",
  "Stakeholder coverage": "关键人覆盖",
  "Open questions": "待确认问题",
  "Decision readiness": "决策准备度",
  "Progress signal": "推进信号",
  "Scoped opportunities": "范围内商机",
  "Escalated priority": "升级处理",
  "Scope count": "范围数量",
  "Escalated count": "升级数量",
  "Critical": "严重",
  "High": "高风险",
  "Medium": "中等",
  "Low": "低风险",
  "clear": "正常",
  "none": "无",
  "review": "待复核",
  "severe": "严重停滞",
  "watch": "需要关注",
  "active": "正常推进",
  "within-7-days": "7 天内",
  "within-30-days": "30 天内",
  "no-meeting": "暂无会议安排",
  "complete": "完整覆盖",
  "partial": "部分覆盖",
  "limited": "覆盖不足",
  "high": "高",
  "medium": "中等",
  "low": "低",
  "broad": "广泛覆盖",
  "moderate": "适度覆盖",
  "narrow": "覆盖较少",
  "cross-sell-potential": "存在交叉销售空间",
  "selective-whitespace": "存在选择性服务空白",
  "limited-whitespace": "服务空白有限",
  "expanding": "持续增长",
  "stable": "趋势稳定",
  "quiet": "近期平稳",
  "established": "成熟关系",
  "developing": "发展中关系",
  "new": "新关系",
  "material-negative": "重大负向偏差",
  "negative": "负向偏差",
  "positive": "正向偏差",
  "on-plan": "符合计划",
  "not-applicable": "不适用",
  "review-required": "需要复核",
  "consistent": "一致",
  "overdue": "已逾期",
  "near-term": "近期",
  "future": "计划中",
  "Pipeline": "Pipeline",
  "Upside": "上行机会",
  "待人工指定": "待人工指定",
  "待人工确定": "待人工确定",
};

const DECISION_TEXT_JA: Record<string, string> = {
  "Management view: The opportunity is progressing at a healthy cadence; continue normal monitoring.": "経営視点：商談は健全なペースで進行しています。通常のモニタリングを継続してください。",
  "The opportunity is progressing at a healthy cadence; continue normal monitoring.": "商談は健全なペースで進行しています。通常のモニタリングを継続してください。",
  "Management view: Multiple safe signals indicate that this case should lead the management review queue.": "経営視点：複数の安全シグナルにより、この商談は管理レビューを優先すべきです。",
  "A high-value opportunity appears stalled and warrants a focused unblock review.": "高価値の商談に停滞が見られ、集中的な障害解消レビューが必要です。",
  "Actual performance is materially below the sanitized budget range.": "実績は匿名化された予算帯を大きく下回っています。",
  "The forecast signal should be treated cautiously until the data contradiction is resolved.": "データ矛盾が解消されるまで、現在の予測シグナルは慎重に扱う必要があります。",
  "The internal route configuration needs verification; no external disruption is asserted.": "社内ルート構成の確認が必要です。外部障害は断定していません。",
  "Hypothesis: the account may support a targeted cross-sell conversation; validate with the account owner.": "仮説：この顧客には対象を絞ったクロスセルの余地があります。顧客担当者による確認が必要です。",
  "The meeting should focus on unresolved decision questions and stakeholder alignment.": "会議では未解決の意思決定事項と関係者の整合に集中する必要があります。",
  "The meeting appears prepared; preserve the current agenda.": "会議準備は整っています。現在の議題を維持してください。",
  "Run an evidence review": "証拠レビューを実施",
  "Resolve the highest-impact safe signals before changing the forecast.": "予測を変更する前に、影響度の高い安全シグナルを確認してください。",
  "Confirm the next decision milestone": "次の意思決定マイルストーンを確認",
  "A dated milestone can test whether the opportunity remains actionable.": "日付付きのマイルストーンにより、商談が引き続き実行可能か確認できます。",
  "Review the recovery assumptions": "回復前提を確認",
  "Reconcile the budget cadence with recorded actual bands.": "予算の進行と記録済み実績帯を照合してください。",
  "Resolve the flagged fields": "フラグ付き項目を解消",
  "Improve data quality before relying on the forecast.": "予測を利用する前にデータ品質を改善してください。",
  "Verify routing master data": "ルートマスターデータを確認",
  "Confirm the sanitized route combination with an authorized operator.": "権限を持つ担当者が匿名化済みルート組合せを確認してください。",
  "Maintain the current cadence": "現在の進行ペースを維持",
  "No risk escalation is supported by the safe evidence.": "安全な証拠はリスクの引き上げを支持していません。",
  "Validate the whitespace hypothesis": "サービス空白の仮説を検証",
  "Use account planning to confirm whether the inferred service gap is real.": "アカウントプランニングで推定サービスギャップが実在するか確認してください。",
  "Prepare a question-led agenda": "質問主導の議題を準備",
  "Address the safe open-question count without using communication transcripts.": "コミュニケーション原文を使わず、安全な未確認事項の件数に基づいて議題を準備してください。",
  "Within 2 days": "2日以内", "Within 3 days": "3日以内", "This week": "今週中", "Before forecast review": "予測レビュー前", "Before quotation": "見積前", "Next scheduled review": "次回予定レビュー", "Next account review": "次回顧客レビュー", "Before meeting": "会議前",
  "High": "高", "Medium": "中", "Low": "低", "clear": "正常", "review": "要確認", "active": "通常進行", "Draft only": "ドラフトのみ",
};
const DECISION_TEXT_REVERSE = Object.fromEntries(Object.entries(DECISION_TEXT).map(([source, translated]) => [translated, source]));

const SYSTEM_TEXT_EN: Record<string, string> = {
  "待人工指定": "To be assigned by a person",
  "待人工确定": "To be determined by a person",
  "来源：模型建议": "Source: model recommendation",
  "来源：模型建议（非 CRM 正式期限）": "Source: model recommendation (not an official CRM due date)",
  "来源：确定性 Decision Pack": "Source: deterministic Decision Pack",
  "来源：CRM 安全派生信号": "Source: CRM safe derived signal",
  "仅草案": "Draft only",
  "推进风险": "Pipeline risk",
  "停滞、逾期或缺少下一步信号降低了推进健康度。": "Stagnation, overdue work, or missing next-step signals reduce pipeline health.",
  "事实完整度不足": "Insufficient fact completeness",
  "缺失或矛盾的业务事实需要在依赖预测前补核。": "Missing or contradictory business facts require verification before the forecast is relied upon.",
  "客户互动风险": "Customer engagement risk",
  "关键人、互动或待确认问题信号不足。": "Stakeholder, engagement, or open-question signals are insufficient.",
  "综合风险暴露": "Combined risk exposure",
  "多个安全风险信号叠加，需要按证据优先复核。": "Multiple safe risk signals overlap and require evidence-prioritized review.",
  "卓越": "Excellent", "健康": "Healthy", "稳定": "Stable", "需关注": "Needs attention", "高风险": "High risk", "严重风险": "Critical risk", "未评估": "Not assessed",
  "无": "None", "未记录": "Not recorded", "未执行": "Not executed", "未配置": "Not configured",
  "不使用 Scenario": "Scenario not used", "组合视图": "Portfolio view", "场景聚焦": "Scenario focus", "全部本地组合": "All local combinations", "组合范围": "Portfolio scope", "场景范围": "Scenario scope", "完整本地组合": "Complete local portfolio", "场景筛选范围": "Scenario-filtered scope",
};

const SYSTEM_TEXT_JA: Record<string, string> = {
  "待人工指定": "担当者の指定待ち", "待人工确定": "担当者の確認待ち", "来源：模型建议": "出典：モデル提案", "来源：模型建议（非 CRM 正式期限）": "出典：モデル提案（CRM正式期限ではありません）", "来源：确定性 Decision Pack": "出典：決定論的Decision Pack", "来源：CRM 安全派生信号": "出典：CRM安全派生シグナル", "仅草案": "ドラフトのみ",
  "推进风险": "推進リスク", "停滞、逾期或缺少下一步信号降低了推进健康度。": "停滞、期限超過、次のステップ不足により推進健全度が低下しています。", "事实完整度不足": "事実の完全性不足", "缺失或矛盾的业务事实需要在依赖预测前补核。": "欠落または矛盾する業務事実は、予測を利用する前に確認が必要です。", "客户互动风险": "顧客エンゲージメントリスク", "关键人、互动或待确认问题信号不足。": "関係者、エンゲージメント、未確認事項のシグナルが不足しています。", "综合风险暴露": "複合リスク露出", "多个安全风险信号叠加，需要按证据优先复核。": "複数の安全リスクシグナルが重なっており、証拠優先で確認が必要です。",
  "卓越": "卓越", "健康": "健全", "稳定": "安定", "需关注": "要注意", "高风险": "高リスク", "严重风险": "重大リスク", "未评估": "未評価",
  "无": "なし", "未记录": "未記録", "未执行": "未実行", "未配置": "未設定", "不使用 Scenario": "Scenarioは未使用", "组合视图": "ポートフォリオ表示", "场景聚焦": "シナリオフォーカス", "全部本地组合": "ローカル全体", "组合范围": "ポートフォリオ範囲", "场景范围": "シナリオ範囲", "完整本地组合": "完全なローカルポートフォリオ", "场景筛选范围": "シナリオ絞り込み範囲",
};

const TECHNICAL_SIGNAL_LABELS: Record<string, string> = {
  "missing-decision-maker": "关键决策人尚未覆盖",
  "forecast-progress-conflict": "预测阶段与实际推进状态不一致",
};

const BUSINESS_SOURCE_LABELS: Record<string, string> = {
  "safeContext.priority": "优先级来源：CRM 脱敏字段",
  "safeContext.stagnationBand": "推进状态来源：阶段停留与跟进频率",
  "safeContext.dataQualityCodes": "数据质量来源：CRM 脱敏质量信号",
};

export function decisionText(value: string, language = getActiveLanguage()) {
  if (language === "en-US" && SYSTEM_TEXT_EN[value]) return SYSTEM_TEXT_EN[value];
  if (language === "ja-JP" && SYSTEM_TEXT_JA[value]) return SYSTEM_TEXT_JA[value];
  const completeMatch = value.match(/^完整\s+(\d+)\s+条冻结数据$/);
  if (completeMatch && language !== "zh-CN") return language === "ja-JP" ? `凍結データ全${completeMatch[1]}件` : `Complete frozen dataset: ${completeMatch[1]} records`;
  const departmentScopeMatch = value.match(/^部门筛选范围\s+·\s+(.+)$/);
  if (departmentScopeMatch && language !== "zh-CN") return language === "ja-JP" ? `部門フィルター範囲 · ${departmentLabel(departmentScopeMatch[1], language)}` : `Department-filtered scope · ${departmentLabel(departmentScopeMatch[1], language)}`;
  const canonical = DECISION_TEXT_REVERSE[value] || value;
  if (language === "en-US") return canonical;
  if (canonical.startsWith("Management view: ")) {
    const statement = canonical.slice("Management view: ".length);
    const localized = language === "ja-JP" ? DECISION_TEXT_JA[statement] : DECISION_TEXT[statement];
    if (localized) return language === "ja-JP" ? `経営視点：${localized}` : `管理视角：${localized}`;
  }
  if (language === "ja-JP" && DECISION_TEXT_JA[canonical]) return DECISION_TEXT_JA[canonical];
  if (language === "zh-CN" && DECISION_TEXT[value]) return DECISION_TEXT[value];
  if (TECHNICAL_SIGNAL_LABELS[value]) return TECHNICAL_SIGNAL_LABELS[value];
  const signals = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (signals.length > 1 && signals.every(isTechnicalSignal)) {
    return signals.map((item) => TECHNICAL_SIGNAL_LABELS[item] || "未映射的安全信号").join("、");
  }
  return isTechnicalSignal(value) ? "未映射的安全信号" : value;
}

export function businessSourceLabel(source: string, language = getActiveLanguage()) {
  if (language === "en-US") return source.startsWith("safeAggregate.") ? "Source: CRM safe aggregate" : source.startsWith("safeContext.") ? "Source: CRM safe derived signal" : "Source: safe decision output";
  if (language === "ja-JP") return source.startsWith("safeAggregate.") ? "出典：CRM安全集計" : source.startsWith("safeContext.") ? "出典：CRM安全派生シグナル" : "出典：安全意思決定出力";
  if (BUSINESS_SOURCE_LABELS[source]) return BUSINESS_SOURCE_LABELS[source];
  if (source.startsWith("safeAggregate.")) return "来源：CRM 安全聚合指标";
  if (source.startsWith("safeContext.")) return "来源：CRM 安全派生信号";
  return "来源：安全决策输出";
}

function isTechnicalSignal(value: string) {
  return /^safe(?:Context|Aggregate)\.[A-Za-z0-9.]+$/.test(value)
    || /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(value);
}
