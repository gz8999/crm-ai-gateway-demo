import type { AiProviderStatus } from "../types";

type Language = "zh-CN" | "ja-JP" | "en-US";

function getActiveLanguage(): Language {
  if (typeof window === "undefined") return "zh-CN";
  const value = window.localStorage.getItem("crm-ai-gateway-language");
  return value === "ja-JP" || value === "en-US" ? value : "zh-CN";
}

export type ExternalAnalysisStatus =
  | "controlled_validation_pending"
  | "disabled"
  | "configuration_missing"
  | "ready"
  | "awaiting_confirmation"
  | "building_safe_context"
  | "calling_provider"
  | "validating_schema"
  | "validating_safety"
  | "validating_citations"
  | "completed"
  | "fallback_demo"
  | "blocked"
  | "failed";

const STATUS_LABELS: Record<ExternalAnalysisStatus, string> = {
  controlled_validation_pending: "受控验证中",
  disabled: "外部模型未启用",
  configuration_missing: "Provider 配置不完整",
  ready: "外部模型已就绪",
  awaiting_confirmation: "等待用户确认",
  building_safe_context: "正在构建安全上下文",
  calling_provider: "正在进行深度分析",
  validating_schema: "正在校验输出结构",
  validating_safety: "正在执行安全校验",
  validating_citations: "正在校验外部来源",
  completed: "分析完成",
  fallback_demo: "外部模型不可用，已回退 Demo",
  blocked: "调用已被安全策略阻断",
  failed: "分析失败",
};

export function externalAnalysisStatus(status: AiProviderStatus | null): ExternalAnalysisStatus {
  if (status?.controlledValidationPending) return "controlled_validation_pending";
  if (!status || status.providerRequested === "demo") return "disabled";
  if (!status.externalAiEnabled || !status.configured) return "configuration_missing";
  return "ready";
}

export function externalAnalysisStatusLabel(status: AiProviderStatus | null, prefixed = false, language: Language = getActiveLanguage()) {
  const state = externalAnalysisStatus(status);
  const localized = language === "en-US" ? ({ controlled_validation_pending: "Controlled validation pending", disabled: "External model disabled", configuration_missing: "Provider configuration incomplete", ready: "External model ready" } as Record<string, string>)[state]
    : language === "ja-JP" ? ({ controlled_validation_pending: "制御検証中", disabled: "外部モデル無効", configuration_missing: "Provider設定未完了", ready: "外部モデル準備完了" } as Record<string, string>)[state]
      : STATUS_LABELS[state];
  const label = localized || STATUS_LABELS[state];
  if (!prefixed) return label;
  const prefix = language === "en-US" ? "External model: " : language === "ja-JP" ? "外部モデル：" : "外部模型：";
  return `${prefix}${label.replace(/^外部模型/u, "").replace(/^外部モデル/u, "").replace(/^External model/iu, "").trim()}`;
}

export function validationStatusLabel(value: string | undefined) {
  return value || "当前未执行";
}
