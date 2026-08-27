import { languages, useI18n } from "./index";

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();
  return <label className="language-switcher">
    <span>{t("language.label")}</span>
    <select aria-label={t("language.label")} value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
      {languages.map((item) => <option key={item.value} value={item.value}>{t(item.labelKey)}</option>)}
    </select>
  </label>;
}
