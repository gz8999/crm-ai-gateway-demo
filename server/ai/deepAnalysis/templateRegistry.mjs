const TEMPLATE_VERSION = "1.0";

export const DEEP_ANALYSIS_TEMPLATES = Object.freeze([
  template("DA-01", "客户全景与历史合作分析", "整合当前案件与客户历史安全聚合。", "客户负责人 / 管理层", ["当前 CRM Safe Context", "客户历史安全聚合"], [], ["客户历史尚未接入"], "blocked", "3–5 分钟", false, "客户历史安全聚合尚未接入", ["管理摘要", "当前 CRM 事实", "客户历史事实", "局限与缺失数据"]),
  template("DA-02", "当前案件赢单与风险分析", "分析当前商机的推进、数据质量与赢单风险。", "营业负责人 / 管理层", ["当前 Opportunity Safe Context", "当前 Safe Account Aggregate"], ["金额区间", "预算/实绩偏差类别"], [], "strict-external-or-demo", "约 10 秒", true, "", ["管理摘要", "当前 CRM 事实", "AI 综合推断", "风险与机会", "建议行动"]),
  template("DA-03", "预算、实绩与盈利分析", "依据区间和偏差类别分析预算、实绩与盈利信号。", "营业负责人 / 财务管理", ["金额区间", "预算/实绩偏差类别", "毛利率区间", "当前阶段"], [], [], "strict-external-or-demo-limited", "约 10 秒", true, "仅使用现有区间和类别，不生成精确金额", ["管理摘要", "当前 CRM 事实", "风险与机会", "情景分析", "建议行动"]),
  template("DA-04", "客户增长与交叉销售分析", "结合客户历史、服务覆盖和内部能力识别增长假设。", "客户负责人 / 管理层", ["客户历史", "服务覆盖", "公司内部能力"], [], ["客户历史尚未接入", "公司内部能力知识尚未接入"], "blocked", "3–5 分钟", false, "客户历史和公司内部能力尚未接入", ["客户历史事实", "公司内部能力事实", "AI 综合推断", "建议行动"]),
  template("DA-05", "客户行业与外部形势分析", "结合行业和有来源的新鲜外部情报形成判断。", "管理层 / 战略团队", ["客户行业", "外部公开情报", "来源与新鲜度"], [], ["外部行业与市场情报尚未启用"], "blocked", "3–5 分钟", false, "外部情报未启用", ["外部行业与市场事实", "来源与安全状态", "局限与缺失数据"]),
  template("DA-06", "物流方案与路线适配分析", "使用安全路线派生信号核验物流方案一致性。", "营业负责人 / 运营", ["安全路线聚合", "Location/POL/POD 安全派生信号"], ["服务能力"], ["公司内部能力知识尚未接入"], "strict-external-or-demo-limited", "约 10 秒", true, "仅提供路线一致性受限分析，不使用原始 Location/POL/POD", ["当前 CRM 事实", "AI 综合推断", "风险与机会", "建议行动"]),
  template("DA-07", "会前准备与谈判策略", "使用会议派生信号准备提问、确认事项和谈判重点。", "营业负责人", ["Meeting 安全派生信号", "当前 Opportunity Safe Context"], [], [], "strict-external-or-demo", "约 10 秒", true, "", ["管理摘要", "当前 CRM 事实", "AI 综合推断", "建议行动"]),
  template("DA-08", "管理层综合深度报告", "整合客户历史、外部情报、内部能力和当前案件。", "公司管理层", ["客户历史", "外部情报", "公司内部能力", "当前案件"], [], ["客户历史尚未接入", "外部行业与市场情报尚未启用", "公司内部能力知识尚未接入"], "blocked", "5–8 分钟", false, "关键依赖尚未接入", ["管理摘要", "客户历史事实", "外部事实", "内部能力事实", "建议行动"]),
  template("DA-09", "自定义分析", "保留给经过治理审批的自定义分析。", "管理员", [], [], ["自由 Prompt 未开放"], "blocked", "未开放", false, "本阶段禁用，不提供自由 Prompt", []),
]);

export function listDeepAnalysisTemplates({ featureEnabled = false } = {}) {
  return DEEP_ANALYSIS_TEMPLATES.map((item) => ({
    ...item,
    runtimeEnabled: featureEnabled && item.enabled,
    status: !item.enabled ? dependencyStatus(item) : item.providerPolicy.includes("limited") ? "受限" : "可执行",
  }));
}

export function getDeepAnalysisTemplate(code) {
  return DEEP_ANALYSIS_TEMPLATES.find((item) => item.code === code) || null;
}

function template(code, title, description, targetRole, requiredData, optionalData, unavailableDependencies, providerPolicy, estimatedDuration, enabled, blockedReason, outputSections) {
  return Object.freeze({ code, title, description, targetRole, requiredData, optionalData, unavailableDependencies, providerPolicy, estimatedDuration, enabled, blockedReason, outputSections, version: TEMPLATE_VERSION });
}

function dependencyStatus(item) {
  if (item.code === "DA-05") return "外部情报未启用";
  return "依赖未接入";
}
