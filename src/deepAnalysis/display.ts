export const SOURCE_LABELS = { crm_current: "当前 CRM", crm_history: "CRM 历史", external: "外部公开信息", internal: "公司内部知识", ai_inference: "AI 推断" } as const;
export function templateStatusClass(status: string) { return status === "可执行" ? "ready" : status === "受限" ? "limited" : "blocked"; }
export function providerPolicyLabel(policy: string) { return policy.includes("limited") ? "受控模型 · 仅安全区间" : policy.includes("external") ? "受控外部模型" : "不可执行"; }
