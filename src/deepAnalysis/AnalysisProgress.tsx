import type { DeepAnalysisPhase } from "./types";
import { useI18n } from "../i18n";

const STEPS: DeepAnalysisPhase[] = ["构建 Safe Context", "安全检查", "模型分析中", "输出结构校验", "安全校验", "完成"];
export function AnalysisProgress({ phase, onCancel }: { phase: DeepAnalysisPhase; onCancel: () => void }) {
  const { t } = useI18n();
  const labels: Record<DeepAnalysisPhase, string> = { "未开始": t("deepAnalysis.notStarted"), "等待确认": t("deepAnalysis.waitingConfirm"), "构建 Safe Context": t("deepAnalysis.phaseBuild"), "安全检查": t("deepAnalysis.phaseSafety"), "模型分析中": t("deepAnalysis.phaseModel"), "Demo 分析中": t("deepAnalysis.phaseDemo"), "输出结构校验": t("deepAnalysis.phaseOutput"), "安全校验": t("deepAnalysis.phaseSafetyOutput"), "完成": t("deepAnalysis.phaseComplete"), "已取消": t("deepAnalysis.cancelled"), "已阻断": t("deepAnalysis.unavailable"), "失败": t("deepAnalysis.unavailable") };
  return <section className="deep-analysis-progress product-panel" aria-live="polite"><header><div><h3>{t("deepAnalysis.progressTitle")}</h3><p>{t("deepAnalysis.progressDescription")}</p></div><strong>{labels[phase]}</strong></header><ol>{STEPS.map((step) => <li className={step === phase ? "active" : ""} key={step}>{labels[step]}</li>)}</ol><button onClick={onCancel}>{t("deepAnalysis.cancelAnalysis")}</button></section>;
}
