import type { Language } from "../i18n";
import type { DeepAnalysisTemplate } from "./types";

type TemplateText = Pick<DeepAnalysisTemplate, "title" | "description" | "targetRole" | "estimatedDuration" | "blockedReason">;

const localizedTemplates: Record<Language, Record<string, TemplateText>> = {
  "zh-CN": {},
  "ja-JP": {
    "DA-01": text("顧客全体像と取引履歴分析", "現在の案件と顧客履歴の安全な集計を統合します。", "顧客担当 / 経営層", "3〜5分", "顧客履歴の安全な集計は未接続です"),
    "DA-02": text("現在案件の受注可能性とリスク分析", "現在の商談の進行、データ品質、受注リスクを分析します。", "営業責任者 / 経営層", "約10秒", ""),
    "DA-03": text("予算・実績・収益性分析", "金額帯と差異区分から予算、実績、収益性のシグナルを分析します。", "営業責任者 / 財務管理", "約10秒", "既存の金額帯と区分のみを使用し、正確な金額は生成しません"),
    "DA-04": text("顧客成長とクロスセル分析", "顧客履歴、サービスカバレッジ、社内能力から成長仮説を特定します。", "顧客担当 / 経営層", "3〜5分", "顧客履歴と社内能力ナレッジは未接続です"),
    "DA-05": text("顧客業界と外部環境分析", "業界情報と出典のある最新外部情報を組み合わせて判断します。", "経営層 / 戦略チーム", "3〜5分", "外部インテリジェンスは未有効化です"),
    "DA-06": text("物流方案とルート適合性分析", "安全なルート派生シグナルで物流方案の整合性を確認します。", "営業責任者 / オペレーション", "約10秒", "原始 Location/POL/POD を使わず、ルート整合性の限定分析のみを提供します"),
    "DA-07": text("会議準備と交渉戦略", "会議派生シグナルから質問、確認事項、交渉の重点を準備します。", "営業責任者", "約10秒", ""),
    "DA-08": text("経営層向け総合詳細レポート", "顧客履歴、外部情報、社内能力、現在案件を統合します。", "経営層", "5〜8分", "主要な依存データは未接続です"),
    "DA-09": text("カスタム分析", "ガバナンス承認済みのカスタム分析用です。", "管理者", "未提供", "この段階では無効で、自由入力 Prompt は提供しません"),
  },
  "en-US": {
    "DA-01": text("Customer overview and relationship history", "Combine the current case with safe customer-history aggregates.", "Account owner / Management", "3–5 min", "Safe customer-history aggregates are not connected"),
    "DA-02": text("Current opportunity win and risk analysis", "Analyze progress, data quality, and win risk for the current opportunity.", "Sales lead / Management", "About 10 sec", ""),
    "DA-03": text("Budget, actuals, and profitability analysis", "Analyze budget, actual, and profitability signals from bands and variance categories.", "Sales lead / Finance", "About 10 sec", "Uses existing bands and categories only; no exact amounts are generated"),
    "DA-04": text("Customer growth and cross-sell analysis", "Identify growth hypotheses from customer history, service coverage, and internal capabilities.", "Account owner / Management", "3–5 min", "Customer history and internal capability knowledge are not connected"),
    "DA-05": text("Customer industry and external outlook", "Combine industry context with sourced, current external intelligence.", "Management / Strategy", "3–5 min", "External intelligence is not enabled"),
    "DA-06": text("Logistics solution and route-fit analysis", "Validate logistics-solution consistency using safe route-derived signals.", "Sales lead / Operations", "About 10 sec", "Provides limited route-consistency analysis without raw Location/POL/POD values"),
    "DA-07": text("Meeting preparation and negotiation strategy", "Use meeting-derived signals to prepare questions, confirmations, and negotiation priorities.", "Sales lead", "About 10 sec", ""),
    "DA-08": text("Executive comprehensive deep-analysis report", "Combine customer history, external intelligence, internal capabilities, and the current case.", "Executive management", "5–8 min", "Required dependencies are not connected"),
    "DA-09": text("Custom analysis", "Reserved for governance-approved custom analysis.", "Administrator", "Not available", "Disabled in this phase; free-form prompts are not available"),
  },
};

export function localizeDeepAnalysisTemplate(template: DeepAnalysisTemplate, language: Language): DeepAnalysisTemplate {
  return { ...template, ...(localizedTemplates[language][template.code] || {}) };
}

function text(title: string, description: string, targetRole: string, estimatedDuration: string, blockedReason: string): TemplateText {
  return { title, description, targetRole, estimatedDuration, blockedReason };
}
