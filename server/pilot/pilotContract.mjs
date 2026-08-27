export const PILOT_TEST_HOST = "org91f5f65f.crm5.dynamics.com";
export const PILOT_PRODUCTION_HOST = "lcn-crm.crm7.dynamics.com";
export const PILOT_DEFAULT_OPPORTUNITY = "DEMO-OPP-199";
export const PILOT_SELECTION_PATH = "docs/d365/d365-ai-demo-200-pilot-selection-final.json";
export const PILOT_PRIVATE_MANIFEST_PATH = "local-artifacts/d365/d365-ai-demo-200-d5-pilot-import-private.json";

export const PILOT_DEPARTMENTS = [
  { id: "all", label: "全部部门", choiceValue: null },
  { id: "dept1-industry", label: "Dept1 Industry", choiceValue: 1 },
  { id: "dept1-distribution", label: "Dept1 Distribution", choiceValue: 2 },
  { id: "dept2-lcms", label: "Dept2 LCMS", choiceValue: 3 },
  { id: "dept3-project-cargo", label: "Dept3 Project Cargo", choiceValue: 4 },
  { id: "dept3-dangerous-goods", label: "Dept3 Dangerous Goods", choiceValue: 5 },
  { id: "ff", label: "FF", choiceValue: 6 },
  { id: "others", label: "Others", choiceValue: 91 },
];

export const PILOT_EXPECTED_COUNTS = Object.freeze({
  account: 7,
  contact: 9,
  opportunity: 24,
  actual: 12,
  coverage: 15,
  timeline: 206,
  signal: 154,
  opportunityClose: 8,
  bpf: 24,
});

export function assertPilotEnvironment(config, env = process.env) {
  const host = new URL(config.dataverseUrl).hostname.toLowerCase();
  if (host !== PILOT_TEST_HOST || host === PILOT_PRODUCTION_HOST) {
    throw new Error("D365 Pilot is restricted to the approved test environment.");
  }
  const provider = env.AI_PROVIDER || "demo";
  if (!["demo", "openai-compatible"].includes(provider)) throw new Error("D365 Pilot requires an approved Provider.");
  return host;
}

export function resolvePilotDepartment(value = "all") {
  const department = PILOT_DEPARTMENTS.find((item) => item.id === value);
  if (!department) throw new TypeError("Unknown Pilot department scope.");
  return department;
}

export function normalizeId(value) {
  return String(value || "").replace(/[{}]/g, "").toLowerCase();
}

export function hasGuid(value) {
  return /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(JSON.stringify(value));
}
