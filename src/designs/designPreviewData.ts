export type PreviewInsight = {
  opportunityToken: string;
  customerToken: string;
  ownerToken: string;
  opportunityStage: string;
  winProbability: string;
  priority: string;
  customerNeed: string;
  proposalContent: string;
  estimatedQuoteBand: string;
  budgetAmountBand: string;
  expectedOrderStatus: string;
  organizationGroup: string;
  bookingDepartment: string;
  salesDepartment: string;
  decisionMakerStatus: string;
  transportMode: string;
  sanitizedDescription: string;
  sanitizedProgressSummary: string;
  dataQualityFlags: string[];
  badges: string[];
  finding: string;
  reason: string;
  evidence: string;
  action: string;
  urgency: string;
};

export type DesignOption = {
  id: "a" | "b" | "c" | "d";
  title: string;
  subtitle: string;
  bestFor: string;
  pros: string[];
  cons: string[];
  recommendation: string;
};

export const previewInsights: PreviewInsight[] = [
  {
    opportunityToken: "OPP-AIDEMO-014",
    customerToken: "CUST-014",
    ownerToken: "OWNER-003",
    opportunityStage: "L4 Quote Submitted",
    winProbability: "C",
    priority: "01: High",
    customerNeed: "竞争性报价",
    proposalContent: "降低成本（运输）",
    estimatedQuoteBand: "5M-10M",
    budgetAmountBand: "5M-10M",
    expectedOrderStatus: "overdue_9_days",
    organizationGroup: "01: BD Sales(CL)",
    bookingDepartment: "09: Shanghai Ocean Export",
    salesDepartment: "06: FF",
    decisionMakerStatus: "91: Others",
    transportMode: "03 OE",
    sanitizedDescription: "客户正在比较多个物流方案，关注报价边界、运输稳定性和服务范围。",
    sanitizedProgressSummary: "客户反馈价格偏高，要求补充降本方案；预计下单时间已过，需要二次沟通。",
    dataQualityFlags: ["decision_maker_unclear"],
    badges: ["High Risk", "Overdue", "Cost Pressure", "Decision Maker Unclear"],
    finding: "高优先级报价案件已逾期，且存在价格压力。",
    reason: "该案件金额区间较高，当前阶段已到报价提交后，客户仍在等待降本说明。",
    evidence: "priority=High, expectedOrderStatus=overdue_9_days, customerNeed=竞争性报价, proposalContent=降低成本（运输）",
    action: "由 OWNER-003 本周安排二次沟通，准备成本拆分表和替代方案。",
    urgency: "This week",
  },
  {
    opportunityToken: "OPP-AIDEMO-027",
    customerToken: "CUST-027",
    ownerToken: "OWNER-006",
    opportunityStage: "L3 Customer Visit / Demo",
    winProbability: "Y",
    priority: "02: Important",
    customerNeed: "现有客户的业务扩展",
    proposalContent: "DX/可视化",
    estimatedQuoteBand: "10M+",
    budgetAmountBand: "10M+",
    expectedOrderStatus: "due_in_12_days",
    organizationGroup: "08: LTW Sales",
    bookingDepartment: "01: Domestic Div.",
    salesDepartment: "03: Dept2(LCMS)",
    decisionMakerStatus: "02: 中国客户",
    transportMode: "06 Domestic",
    sanitizedDescription: "现有客户正在评估持续性仓储和可视化改善方案。",
    sanitizedProgressSummary: "客户等待内部确认，销售需要补充阶段收益和实施计划。",
    dataQualityFlags: [],
    badges: ["Executive Attention", "Low Win Probability", "Needs Follow-up"],
    finding: "大金额机会仍处于较低受注确度。",
    reason: "金额区间为 10M+，但 winProbability=Y，需要尽快确认客户决策条件。",
    evidence: "estimatedQuoteBand=10M+, winProbability=Y, customerNeed=现有客户的业务扩展",
    action: "由 OWNER-006 更新决策条件，准备管理层汇报摘要。",
    urgency: "Next 7 days",
  },
  {
    opportunityToken: "OPP-AIDEMO-042",
    customerToken: "CUST-042",
    ownerToken: "OWNER-002",
    opportunityStage: "L2 Feasibility / Quotation",
    winProbability: "B",
    priority: "03: Medium",
    customerNeed: "物流质量管理",
    proposalContent: "自动化操作",
    estimatedQuoteBand: "1M-3M",
    budgetAmountBand: "1M-3M",
    expectedOrderStatus: "due_in_21_days",
    organizationGroup: "05: Suzhou branch",
    bookingDepartment: "05: Suzhou branch",
    salesDepartment: "01: Dept1(Industry)",
    decisionMakerStatus: "01: 海外客户",
    transportMode: "05 CBT",
    sanitizedDescription: "客户关注作业稳定性、质量追踪和自动化改善。",
    sanitizedProgressSummary: "方案方向已确认，下一步需要准备实施范围和数据质量说明。",
    dataQualityFlags: ["missing_next_step_date"],
    badges: ["Needs Follow-up"],
    finding: "数据质量信息不完整，可能影响下阶段判断。",
    reason: "下一步日期缺失，销售节奏难以被管理层跟踪。",
    evidence: "dataQualityFlags=missing_next_step_date, stage=L2 Feasibility / Quotation",
    action: "由 OWNER-002 补充下一步日期和客户确认事项。",
    urgency: "Before next review",
  },
];

export const designOptions: DesignOption[] = [
  {
    id: "a",
    title: "Management Command Center",
    subtitle: "管理层默认首页，中心是 Management Attention Queue。",
    bestFor: "公司管理层、部门负责人、营业会议。",
    pros: ["最直接回答哪些案件要看", "行动导向强", "适合作为最终主方向"],
    cons: ["销售个人操作区较弱", "需要控制队列排序解释"],
    recommendation: "Highest",
  },
  {
    id: "b",
    title: "AI Workbench",
    subtitle: "销售经理 AI 工作台，队列、行动、单案简报并排。",
    bestFor: "销售经理日常推进和周度复盘。",
    pros: ["Copilot 感强", "Next Best Action 突出", "适合现场演示 AI 如何帮忙推进"],
    cons: ["信息密度高", "移动端需要更强折叠"],
    recommendation: "High",
  },
  {
    id: "c",
    title: "Risk Operations Board",
    subtitle: "风险运营中心，突出风险驱动和缓解动作。",
    bestFor: "风险复盘、报价压力、逾期案件管理。",
    pros: ["风险逻辑最清楚", "管理介入理由强", "适合作为 Risk Radar"],
    cons: ["机会增长表达偏弱", "不适合作为唯一首页"],
    recommendation: "Medium-high",
  },
  {
    id: "d",
    title: "Minimal Executive Briefing",
    subtitle: "极简管理简报，少图少字，只保留 Top 5 和本周动作。",
    bestFor: "老板快速浏览、会议投屏、移动端查看。",
    pros: ["最克制", "不堆功能", "汇报感强"],
    cons: ["探索能力弱", "销售经理操作深度不足"],
    recommendation: "Medium",
  },
];

export const previewDistributions = {
  departments: [
    { label: "06: FF", value: 34 },
    { label: "03: Dept2(LCMS)", value: 23 },
    { label: "01: Dept1(Industry)", value: 18 },
    { label: "04: Project Cargo", value: 12 },
  ],
  stages: [
    { label: "L4 Quote Submitted", value: 28 },
    { label: "L3 Customer Visit", value: 24 },
    { label: "L2 Quotation", value: 21 },
    { label: "L1 Information Entry", value: 16 },
  ],
  riskDrivers: [
    { label: "Overdue", value: 18 },
    { label: "Cost Pressure", value: 15 },
    { label: "Low Win Probability", value: 13 },
    { label: "Decision Maker Unclear", value: 9 },
  ],
};

export const safetyLine = "Safety: raw CRM data not sent";
