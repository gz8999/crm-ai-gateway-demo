import { sanitizeDeepAnalysisAudit } from "./deepAnalysisSafety.mjs";

export function createDeepAnalysisAuditStore({ now = () => new Date() } = {}) {
  const entries = [];
  return {
    push(entry) {
      const safe = sanitizeDeepAnalysisAudit({ ...entry, timestamp: now().toISOString() });
      entries.unshift(safe);
      if (entries.length > 50) entries.length = 50;
      return { ...safe };
    },
    list: () => entries.map((item) => ({ ...item })),
    clear: () => { entries.length = 0; },
  };
}
