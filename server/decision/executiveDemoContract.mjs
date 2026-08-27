export const SCORE_SHOWCASE_TOKENS = Object.freeze([
  "DEMO-OPP-001", "DEMO-OPP-002", "DEMO-OPP-003", "DEMO-OPP-004",
  "DEMO-OPP-005", "DEMO-OPP-006", "DEMO-OPP-007", "DEMO-OPP-008",
  "DEMO-OPP-009", "DEMO-OPP-010", "DEMO-OPP-011", "DEMO-OPP-012",
  "DEMO-OPP-013", "DEMO-OPP-014", "DEMO-OPP-015", "DEMO-OPP-016",
  "DEMO-OPP-017", "DEMO-OPP-018", "DEMO-OPP-019", "DEMO-OPP-026",
  "DEMO-OPP-030", "DEMO-OPP-046", "DEMO-OPP-056", "DEMO-OPP-057",
]);

export const EXECUTIVE_DEMO_SCENARIOS = Object.freeze([
  "stalled-high-value",
  "budget-actual-gap",
  "data-contradiction",
  "growth-opportunity",
  "location-route-risk",
  "meeting-prep",
  "multi-risk-priority",
  "healthy-control",
]);

export const EXTERNAL_AI_RELEASE_STATUS = Object.freeze({
  code: "controlled_validation_pending",
  zh: "受控验证中",
  en: "Controlled Validation Pending",
  providerRequestCompatibilityReady: false,
  providerRepeatabilityReady: false,
  realCanaryAuthorized: false,
});

export function isScoreShowcaseToken(token) {
  return SCORE_SHOWCASE_TOKENS.includes(token);
}
