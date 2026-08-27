import { templateStatusClass } from "./display";
import type { DeepAnalysisTemplate } from "./types";
import { useI18n } from "../i18n";
import { localizeDeepAnalysisTemplate } from "./templateLocalization";

export function TemplateList({ templates, selectedCode, onSelect }: { templates: DeepAnalysisTemplate[]; selectedCode: string; onSelect: (template: DeepAnalysisTemplate) => void }) {
  const { language, t } = useI18n();
  const statusLabel = (status: DeepAnalysisTemplate["status"]) => status === "可执行" ? t("deepAnalysis.runtimeReady") : status === "受限" ? t("deepAnalysis.runtimeLimited") : t("deepAnalysis.runtimeBlocked");
  const providerLabel = (policy: string) => policy.includes("limited") ? t("deepAnalysis.providerLimited") : policy.includes("external") ? t("deepAnalysis.providerExternal") : t("deepAnalysis.providerBlocked");
  return <aside className="deep-template-list product-panel" aria-label={t("deepAnalysis.templates")}><header><h3>{t("deepAnalysis.templates")}</h3><span>{t("deepAnalysis.templateCount")}</span></header><div>{templates.map((template) => {
    const localized = localizeDeepAnalysisTemplate(template, language);
    return <article className={`${templateStatusClass(template.status)}${selectedCode === template.code ? " selected" : ""}`} key={template.code}><button disabled={!template.runtimeEnabled} onClick={() => onSelect(template)}><span>{template.code}</span><strong>{localized.title}</strong><small>{localized.targetRole}</small><em>{statusLabel(template.status)} · {localized.estimatedDuration}</em></button><p>{template.runtimeEnabled ? providerLabel(template.providerPolicy) : localized.blockedReason}</p></article>;
  })}</div></aside>;
}
