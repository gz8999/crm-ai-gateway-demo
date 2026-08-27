import { useCallback, useSyncExternalStore } from "react";
import type { zhCN as legacyZhCN } from "./locales/zh-CN";
import { productEnUS, productJaJP, productZhCN } from "./productLocales";

// Internal AI Lab keeps the legacy locale contract as zhCN[key]; product pages use the isolated dictionaries below.

export type Language = "zh-CN" | "ja-JP" | "en-US";
export type TranslationKey = keyof typeof legacyZhCN | keyof typeof productZhCN;
export type TFunction = (key: TranslationKey, params?: Record<string, string | number>) => string;

const storageKey = "crm-ai-gateway-language";
let activeLanguage: Language = readStoredLanguage();
const languageListeners = new Set<() => void>();
const dictionaries: Record<Language, Record<string, string>> = {
  "zh-CN": productZhCN,
  "ja-JP": productJaJP,
  "en-US": productEnUS,
};

export const languages: Array<{ value: Language; labelKey: TranslationKey }> = [
  { value: "zh-CN", labelKey: "language.zhCN" },
  { value: "ja-JP", labelKey: "language.jaJP" },
  { value: "en-US", labelKey: "language.enUS" },
];

export function translate(language: Language, key: TranslationKey, params: Record<string, string | number> = {}) {
  const keyName = String(key);
  const template = dictionaries[language]?.[keyName] || dictionaries["zh-CN"]?.[keyName] || keyName;
  return Object.entries(params).reduce((text, [paramKey, value]) => text.split(`{${paramKey}}`).join(String(value)), template);
}

export function useI18n() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguageSnapshot, getServerLanguageSnapshot);

  const setLanguage = useCallback((nextLanguage: Language) => {
    const normalized = dictionaries[nextLanguage] ? nextLanguage : "zh-CN";
    if (activeLanguage === normalized) return;
    activeLanguage = normalized;
    if (typeof localStorage !== "undefined") localStorage.setItem(storageKey, normalized);
    languageListeners.forEach((listener) => listener());
  }, []);
  const t = useCallback<TFunction>((key, params) => translate(language, key, params), [language]);
  return { language, setLanguage, t };
}

export function getActiveLanguage(): Language { return activeLanguage; }

function subscribeLanguage(listener: () => void) {
  languageListeners.add(listener);
  return () => languageListeners.delete(listener);
}

function getLanguageSnapshot() { return activeLanguage; }
function getServerLanguageSnapshot() { return "zh-CN" as Language; }

function readStoredLanguage(): Language {
  if (typeof localStorage === "undefined") return "zh-CN";
  const value = localStorage.getItem(storageKey);
  return value === "ja-JP" || value === "en-US" || value === "zh-CN" ? value : "zh-CN";
}

export { productZhCN as zhCN, productJaJP as jaJP, productEnUS as enUS };
