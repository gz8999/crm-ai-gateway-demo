import fs from "node:fs/promises";
import path from "node:path";
import { callDemoNarrativeProvider } from "./narrativeProvider.mjs";
import {
  DEMO_NARRATIVE_CONTRACT_VERSION,
  DEMO_NARRATIVE_PROVIDER_PROFILE,
  buildNarrativeProviderInput,
  expandDemoNarrative,
  narrativeRequestHash,
  validateNarrativeProviderInput,
} from "./narrativeContract.mjs";

export const DEFAULT_NARRATIVE_SNAPSHOT_PATH = path.join(process.cwd(), "server", "data", "validated-llm-narrative-snapshots.json");
export const APPROVED_LIVE_NARRATIVE_TOKEN = "DEMO-OPP-002";

export function createNarrativeService({ env = process.env, now = () => new Date(), snapshotPath = DEFAULT_NARRATIVE_SNAPSHOT_PATH, frozenOpportunityLoader = null, provider = callDemoNarrativeProvider } = {}) {
  let snapshots = new Map();
  let loaded = false;
  let liveCallUsed = false;

  async function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    try {
      const parsed = JSON.parse(await fs.readFile(snapshotPath, "utf8"));
      const rows = Array.isArray(parsed) ? parsed : parsed?.snapshots;
      if (Array.isArray(rows)) for (const row of rows) if (validateSnapshot(row).ok) snapshots.set(row.opportunityToken, structuredClone(row));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async function listSnapshots() { await ensureLoaded(); return [...snapshots.values()].map(publicSnapshot); }
  async function getSnapshot(token) { await ensureLoaded(); const row = snapshots.get(token); return row ? publicSnapshot(row) : null; }
  async function status() {
    await ensureLoaded();
    return {
      contractVersion: DEMO_NARRATIVE_CONTRACT_VERSION,
      providerProfile: DEMO_NARRATIVE_PROVIDER_PROFILE,
      validatedSnapshotCount: snapshots.size,
      validatedTokens: [...snapshots.keys()].sort(),
      liveApprovedToken: APPROVED_LIVE_NARRATIVE_TOKEN,
      externalAutoRun: false,
      liveCallUsed,
      crmWriteback: false,
      productionRequests: 0,
      rawCrmExposure: 0,
      exactAmountExposure: 0,
      rawTimelineExposure: 0,
    };
  }

  async function execute({ view, token, requestToken, phase = "scenario", testOnly = false, syntheticProbe = false, d365Record = true, runtimeEligible = true, realCanary = true, fetchImpl = globalThis.fetch } = {}) {
    if (!view || view.safeContext?.opportunityToken !== token) return { ok: false, reason: "narrative_target_drift" };
    const evidence = buildEvidenceAliases(view);
    const input = buildNarrativeProviderInput({ safeContext: view.safeContext, healthScore: view.healthScore, evidenceAliases: evidence.aliases, testOnly, syntheticProbe, d365Record, runtimeEligible, realCanary });
    const inputValidation = validateNarrativeProviderInput(input);
    if (!inputValidation.ok) return { ok: false, reason: "narrative_input_rejected", inputValidation };
    const correlation = `${requestToken || `${phase}-${token}`}-${narrativeRequestHash(input).slice(0, 12)}`;
    const result = await provider({ providerInput: input, evidenceAliases: evidence.aliases, env, fetchImpl, requestCorrelation: correlation });
    if (!result.ok) return { ok: false, reason: result.reason || "narrative_provider_failed", providerResult: publicProviderResult(result), inputSafety: inputValidation, requestToken: requestToken || "", correlation };
    const snapshot = expandDemoNarrative({
      selection: result.selection,
      safeContext: view.safeContext,
      healthScore: { healthScore: view.healthScore.healthScore, grade: view.healthScore.grade },
      evidenceByAlias: evidence.byAlias,
      provider: "DeepSeek",
      model: String(env.LLM_MODEL || "deepseek-v4-pro"),
      requestMeta: {
        requestHash: result.requestBodyHash,
        responseHash: result.observation?.responseBodyHash || "",
        validatedAt: now().toISOString(),
        latencyMs: result.observation?.latencyMs || 0,
        tokenUsage: result.observation?.tokenUsage || null,
        estimatedCostUsd: estimateCost(result.observation?.tokenUsage, env),
      },
    });
    const ready = validateSnapshot(snapshot, { allowSynthetic: testOnly === true && syntheticProbe === true });
    if (!ready.ok) return { ok: false, reason: "narrative_snapshot_invalid", snapshotValidation: ready, providerResult: publicProviderResult(result) };
    if (phase !== "synthetic") snapshots.set(token, snapshot);
    return { ok: true, snapshot: publicSnapshot(snapshot), selection: result.selection, providerResult: publicProviderResult(result), inputSafety: inputValidation, evidenceAliases: evidence.aliases, phase, requestToken: requestToken || "", correlation };
  }

  async function runLive({ confirmed = false, token = APPROVED_LIVE_NARRATIVE_TOKEN, fetchImpl = globalThis.fetch } = {}) {
    if (confirmed !== true) return { ok: false, status: 400, reason: "explicit_confirmation_required" };
    if (liveCallUsed) return { ok: false, status: 409, reason: "live_call_already_used" };
    if (token !== APPROVED_LIVE_NARRATIVE_TOKEN) return { ok: false, status: 403, reason: "live_token_not_approved" };
    if (!frozenOpportunityLoader) return { ok: false, status: 503, reason: "frozen_runtime_unavailable" };
    if (String(env.ALLOW_EXTERNAL_AI).toLowerCase() !== "true") return { ok: false, status: 403, reason: "external_ai_not_enabled" };
    liveCallUsed = true;
    const view = await frozenOpportunityLoader(token);
    return execute({ view, token, requestToken: `LIVE-${token}-${now().toISOString()}`, phase: "live", d365Record: true, runtimeEligible: true, realCanary: true, fetchImpl });
  }

  async function persist() {
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    const payload = { label: "Validated LLM Analysis Snapshot", contractVersion: DEMO_NARRATIVE_CONTRACT_VERSION, snapshots: [...snapshots.values()].map(publicSnapshot) };
    await fs.writeFile(snapshotPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  }

  return { ensureLoaded, listSnapshots, getSnapshot, status, execute, runLive, persist, validateSnapshot };
}

export function buildEvidenceAliases(view) {
  const explicit = Array.isArray(view?.safeContext?.evidenceTokens) ? view.safeContext.evidenceTokens : [];
  const healthSources = [
    ...(Array.isArray(view?.healthScore?.evidence) ? view.healthScore.evidence.map((item) => item?.source) : []),
    ...(Array.isArray(view?.healthScore?.keyRisks) ? view.healthScore.keyRisks.map((item) => item?.source) : []),
    ...(Array.isArray(view?.healthScore?.recommendedActions) ? view.healthScore.recommendedActions.map((item) => item?.source) : []),
  ];
  const allowSyntheticEvidence = /^SYN-OPP-\d{3}$/u.test(view?.safeContext?.opportunityToken || "");
  const tokens = [...new Set([...explicit, ...healthSources])]
    .filter((token) => typeof token === "string" && (/^safeContext\.[A-Za-z][A-Za-z0-9]*$/u.test(token) || (allowSyntheticEvidence && /^SYN-EVID-\d{3}$/u.test(token))))
    .sort()
    .slice(0, 8);
  const aliases = tokens.map((_, index) => `E${String(index + 1).padStart(2, "0")}`);
  return { aliases, byAlias: Object.fromEntries(aliases.map((alias, index) => [alias, tokens[index]])) };
}

export function validateSnapshot(value, { allowSynthetic = false } = {}) {
  const errors = [];
  if (!value || value.label !== "Validated LLM Analysis Snapshot") errors.push("label_invalid");
  const tokenPattern = allowSynthetic ? /^(?:DEMO-OPP|SYN-OPP)-\d{3}$/ : /^DEMO-OPP-\d{3}$/;
  if (!tokenPattern.test(value?.opportunityToken || "")) errors.push("token_invalid");
  if (!Number.isFinite(Number(value?.healthScore)) || !["S", "A", "B", "C", "D", "Z"].includes(value?.healthGrade)) errors.push("health_invalid");
  for (const key of ["executiveSummary", "riskExplanation", "recommendedActionDraft", "limitationStatement", "evidence"]) if (!value || (typeof value[key] !== "string" && !Array.isArray(value[key]))) errors.push(`${key}_invalid`);
  if (!Array.isArray(value?.evidence) || value.evidence.some((item) => !item?.alias || !item?.token)) errors.push("evidence_invalid");
  if (value?.externalModelCalled !== true || value?.crmWriteback !== false || value?.safetyResult !== "pass") errors.push("safety_invalid");
  const serialized = JSON.stringify(value || {}).toLowerCase();
  for (const forbidden of ["customername", "contactname", "email", "phone", "rawtimeline", "exactrevenue", "exactgp", "guid", "scenarioid", "golden", "authorization", "api_key"]) if (serialized.includes(forbidden)) errors.push(`forbidden:${forbidden}`);
  if (/(?:¥|￥|\$|CNY|RMB)\s*\d[\d,.]*/i.test(JSON.stringify(value || {}))) errors.push("exact_amount_exposure");
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function publicSnapshot(value) { return structuredClone(value); }
function publicProviderResult(value) { return { httpStatus: value.httpStatus || value.observation?.httpStatus || 0, reason: value.reason || "", diagnosticCategory: value.diagnosticCategory || "", observation: value.observation || null, validation: value.validation || null, requestBodyHash: value.requestBodyHash || "", requestSchemaHash: value.requestSchemaHash || "" }; }
function estimateCost(usage, env) { const total = Number(usage?.total_tokens || 0); const perThousand = Number(env.LLM_ESTIMATED_COST_PER_1K_USD || 0); return Number.isFinite(total * perThousand / 1000) ? Number((total * perThousand / 1000).toFixed(6)) : 0; }
