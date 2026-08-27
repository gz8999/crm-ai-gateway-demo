import { buildPilotScope } from "../pilot/pilotSafeContext.mjs";
import { PILOT_DEPARTMENTS, normalizeId, resolvePilotDepartment } from "../pilot/pilotContract.mjs";

export const D365_FROZEN_TEST_HOST = "org91f5f65f.crm5.dynamics.com";
export const D365_FROZEN_PRODUCTION_HOST = "lcn-crm.crm7.dynamics.com";
export const D365_FROZEN_DATASET_PATH = "local-artifacts/d365/d365-ai-demo-200-d6-full-import-private.json";
export const D365_FROZEN_DEFAULT_OPPORTUNITY = "DEMO-OPP-075";

export const D365_FROZEN_EXPECTED_COUNTS = Object.freeze({
  account: 60,
  contact: 120,
  opportunity: 200,
  actual: 130,
  coverage: 240,
  timeline: 1800,
  signal: 1350,
  opportunityClose: 100,
  bpf: 200,
});

export const D365_FROZEN_EXPECTED_STATE = Object.freeze({ active: 100, won: 91, lost: 9 });
export const D365_FROZEN_DEPARTMENTS = PILOT_DEPARTMENTS;

export function assertFrozenEnvironment(config, env = process.env) {
  const host = new URL(config.dataverseUrl).hostname.toLowerCase();
  if (host !== D365_FROZEN_TEST_HOST || host === D365_FROZEN_PRODUCTION_HOST) {
    throw new Error("D365 Frozen Dataset is restricted to the approved test environment.");
  }
  const provider = env.AI_PROVIDER || "demo";
  if (!["demo", "openai-compatible"].includes(provider)) throw new Error("D365 Frozen Dataset requires an approved Provider.");
  return host;
}

export function buildFrozenManifestEntries(manifest) {
  if (manifest?.host !== D365_FROZEN_TEST_HOST || manifest?.generationRun !== "R2G-A-GEN-001") {
    throw new Error("D365 Frozen Dataset manifest provenance is not approved.");
  }
  const entities = ["Account", "Contact", "Opportunity", "ActualManagement", "ServiceCoverage", "Timeline", "InteractionSignal"];
  const entries = Object.fromEntries(entities.map((entity) => [entity, []]));
  for (const record of Object.values(manifest.records || {})) {
    if (!entries[record.entity]) continue;
    const readback = record.readbackEvidence || {};
    entries[record.entity].push({
      token: String(record.stableToken || ""),
      id: normalizeId(record.exactRecordId),
      parentId: normalizeId(record.parentRecordId),
      bpfId: normalizeId(record.targetBpfInstanceExactId),
      bpfStage: String(record.activeStageAlias || ""),
      isAnnotation: record.entity === "Timeline" && Boolean(readback.annotationid),
    });
  }
  for (const entity of entities) {
    const rows = entries[entity];
    if (rows.length !== D365_FROZEN_EXPECTED_COUNTS[entityToCountKey(entity)]) throw new Error(`Frozen ${entity} allowlist count drifted.`);
    if (rows.some((row) => !row.token || !row.id) || new Set(rows.map((row) => row.token)).size !== rows.length) throw new Error(`Frozen ${entity} allowlist is incomplete or duplicated.`);
  }
  if (entries.Opportunity.some((row) => !row.bpfId || row.bpfStage !== "授予资格")) throw new Error("Frozen BPF allowlist gate failed.");
  return entries;
}

export function buildFrozenScope(snapshot, options = {}) {
  const scope = buildPilotScope(snapshot, options);
  if (options.department === "all" || !options.department) assertFullFrozenScope(scope);
  return scope;
}

export function assertFullFrozenScope(scope) {
  for (const [key, expected] of Object.entries(D365_FROZEN_EXPECTED_COUNTS)) {
    if (scope.counts[key] !== expected) throw new Error(`Frozen ${key} count drifted: expected ${expected}, found ${scope.counts[key]}.`);
  }
  if (JSON.stringify(scope.stateDistribution) !== JSON.stringify(D365_FROZEN_EXPECTED_STATE)) throw new Error("Frozen Opportunity state distribution drifted.");
  if (scope.contexts.some((item) => item.stage !== "Qualify")) throw new Error("Frozen BPF active stage drifted from the approved initial stage.");
}

export function resolveFrozenDepartment(value = "all") { return resolvePilotDepartment(value); }

function entityToCountKey(entity) {
  return { Account: "account", Contact: "contact", Opportunity: "opportunity", ActualManagement: "actual", ServiceCoverage: "coverage", Timeline: "timeline", InteractionSignal: "signal" }[entity];
}
