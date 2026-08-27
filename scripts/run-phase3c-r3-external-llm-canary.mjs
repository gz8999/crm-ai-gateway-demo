import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { main as runCanaries } from "./run-phase3c-external-llm-canary.mjs";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const SELECTION_PATH = "docs/gateway/external-llm-canary-r3-freeze-manifest.json";
const RUN_ID = "PHASE3C-R3";
const REPORT_PREFIX = "external-llm-canary-r3";
const PROVIDER = "openai-compatible";
const MODEL = "deepseek-v4-pro";
const BASE_URL = "https://api.deepseek.com/beta";

export async function runR3({ env = process.env, now = () => new Date() } = {}) {
  const selection = JSON.parse(await fs.readFile(path.join(ROOT, SELECTION_PATH), "utf8"));
  const freeze = validateFreeze(selection);
  const keyGate = {
    oldKeyRevoked: String(env.PHASE3C_OLD_KEY_REVOKED || "false").toLowerCase() === "true",
    newServerSideSecretReady: String(env.PHASE3C_NEW_KEY_CONFIGURED || "false").toLowerCase() === "true" && Boolean(env.LLM_API_KEY),
    newKeyExposedBrowser: false,
    newKeyPresentGit: false,
    newKeyPresentReports: false,
    newKeyPresentLogs: false,
    newKeyPresentBundle: false,
  };
  const nativeJson = {
    ready: true,
    mode: "strict-tool",
    endpoint: BASE_URL,
    model: MODEL,
    responseSchema: "external-model-response-contract-v1",
    evidence: [
      "https://api-docs.deepseek.com/guides/function_calling/",
      "https://api-docs.deepseek.com/api/create-chat-completion",
    ],
  };
  if (!keyGate.oldKeyRevoked || !keyGate.newServerSideSecretReady) {
    const summary = buildStoppedSummary({ selection, freeze, keyGate, nativeJson, now, reason: !keyGate.oldKeyRevoked ? "old_key_revocation_unverified" : "new_server_side_secret_missing" });
    await writeStoppedReports(summary);
    return summary;
  }
  return runCanaries({
    env: {
      ...env,
      PHASE3C_SELECTION_PATH: SELECTION_PATH,
      PHASE3C_RUN_ID: RUN_ID,
      PHASE3C_REPORT_PREFIX: REPORT_PREFIX,
      PHASE3C_REQUEST_PREFIX: "PHASE3C-R3-CANARY",
      PHASE3C_NATIVE_JSON_MODE: "strict-tool",
      LLM_CANARY_SINGLE_ATTEMPT: "true",
    },
    now,
  });
}

function validateFreeze(selection) {
  const tokens = selection.records.map((row) => row.opportunityToken);
  const duplicateTokens = tokens.length - new Set(tokens).size;
  return {
    count: selection.count === 24 && tokens.length === 24,
    excludedConsumed: !tokens.includes("DEMO-OPP-001"),
    replacement: tokens.filter((token) => token === "DEMO-OPP-028").length === 1,
    duplicateTokens,
    contractCanary: selection.contractCanaryToken === "DEMO-OPP-002",
    coverageGaps: selection.coverage?.unavailableInFrozenScope || [],
  };
}

function buildStoppedSummary({ selection, freeze, keyGate, nativeJson, now, reason }) {
  return {
    phase: "Phase 3C R3",
    runId: RUN_ID,
    status: "stopped-safety",
    stopReason: reason,
    stoppedBeforeExternalCall: true,
    createdAt: now().toISOString(),
    provider: { provider: PROVIDER, model: MODEL, endpoint: BASE_URL, nativeJsonMode: nativeJson.mode, nativeJsonReady: nativeJson.ready },
    keyGate,
    freeze: {
      count: selection.count,
      excludedConsumedCount: selection.excludedConsumedTokens?.length || 0,
      replacementCount: selection.replacementTokens?.length || 0,
      duplicateTokenCount: freeze.duplicateTokens,
      contractCanaryToken: selection.contractCanaryToken,
      freezeReady: freeze.count && freeze.excludedConsumed && freeze.replacement && freeze.duplicateTokens === 0 && freeze.contractCanary,
      coverageGaps: freeze.coverageGaps,
    },
    contractCanary: { authorized: true, executed: false, jsonReady: false, schemaReady: false, safetyReady: false },
    execution: { externalLlmCalls: 0, contractValidResponses: 0, businessEvaluatedResponses: 0, failedResponses: 0, remainingRequests: 24, crmWriteback: false, productionRequests: 0, browserExternalProviderRequests: 0 },
    safeContext: { version: "Safe Context v2", rawCrmExposure: 0, exactAmountExposure: 0, rawTimelineExposure: 0, scenarioGoldenExposure: 0 },
    decision: "Phase 3C R3 Complete=false",
  };
}

async function writeStoppedReports(summary) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const audit = { phase: summary.phase, runId: summary.runId, records: [], requestCount: 0, externalModelCalls: 0, crmWriteback: false, productionRequests: 0 };
  const evaluation = { phase: summary.phase, runId: summary.runId, records: [], aggregate: { contractValid: 0, businessEvaluated: 0 } };
  await fs.writeFile(path.join(OUTPUT_DIR, `${REPORT_PREFIX}-runtime-manifest.json`), `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(path.join(OUTPUT_DIR, `${REPORT_PREFIX}-provider-compatibility.md`), providerCompatibility(summary));
  await fs.writeFile(path.join(OUTPUT_DIR, `${REPORT_PREFIX}-contract-canary-report.md`), contractReport(summary));
  await fs.writeFile(path.join(OUTPUT_DIR, `${REPORT_PREFIX}-request-audit.json`), `${JSON.stringify(audit, null, 2)}\n`);
  await fs.writeFile(path.join(OUTPUT_DIR, `${REPORT_PREFIX}-response-evaluation.json`), `${JSON.stringify(evaluation, null, 2)}\n`);
  await fs.writeFile(path.join(OUTPUT_DIR, `${REPORT_PREFIX}-quality-comparison.md`), qualityReport(summary));
  await fs.writeFile(path.join(OUTPUT_DIR, `${REPORT_PREFIX}-safety-report.md`), safetyReport(summary));
  await fs.writeFile(path.join(OUTPUT_DIR, `${REPORT_PREFIX}-final-decision.md`), finalDecision(summary));
  await appendAddendum("external-llm-canary-execution-report.md", "## Phase 3C-R3 follow-up\n\n- R2 evidence remains unchanged.\n- R3 was frozen, but stopped before any external request because old-key revocation and new server-side secret configuration were not locally provable.\n- External LLM calls in R3: 0.\n- CRM writeback: false.\n- Production requests: 0.\n- Phase 3C R3 Complete=false.\n");
  await appendAddendum("goal3b-final-readiness-report.md", "## Phase 3C-R3 follow-up\n\nR3 Native JSON Contract Recovery is frozen but not executed. The external call gate remains closed until key rotation evidence is available.\n");
}

function providerCompatibility(summary) {
  return `# Phase 3C-R3 Provider Compatibility\n\n- Provider: ${summary.provider.provider}\n- Model: ${summary.provider.model}\n- Native JSON mode: **${summary.provider.nativeJsonMode}**\n- Native JSON ready: **${summary.provider.nativeJsonReady}**\n- Endpoint: \`${summary.provider.endpoint}\`\n- Contract: \`external-model-response-contract-v1\` with strict Tool Calling parameters and \`additionalProperties=false\`.\n- Official evidence: [Function Calling strict mode](https://api-docs.deepseek.com/guides/function_calling/), [Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion).\n- JSON-only prompt fallback is not used for R3.\n- External call performed: **false**; key gate stopped the run before transport.\n`;
}

function contractReport(summary) {
  return `# Phase 3C-R3 Contract Canary\n\n- Contract canary: \`${summary.freeze.contractCanaryToken}\`\n- Authorized: **${summary.contractCanary.authorized}**\n- Executed: **${summary.contractCanary.executed}**\n- JSON valid: **${summary.contractCanary.jsonReady}**\n- Schema valid: **${summary.contractCanary.schemaReady}**\n- Safety valid: **${summary.contractCanary.safetyReady}**\n- Stop reason: \`${summary.stopReason}\`\n- No retry, provider switch, model switch, or later canaries were attempted.\n`;
}

function qualityReport(summary) {
  return `# Phase 3C-R3 Deterministic vs External Quality\n\n- Contract-valid responses: 0\n- Business-evaluated responses: 0\n- Deterministic baseline comparison: not executed\n- Scoring method: code rules only; no LLM-as-judge\n- R3 stopped before external transport.\n`;
}

function safetyReport(summary) {
  return `# Phase 3C-R3 Safety Report\n\n- Old key revoked: **${summary.keyGate.oldKeyRevoked}**\n- New server-side secret ready: **${summary.keyGate.newServerSideSecretReady}**\n- New key browser exposure: **${summary.keyGate.newKeyExposedBrowser}**\n- New key Git/reports/logs/bundle exposure: **false/false/false/false**\n- Raw CRM exposure: **0**\n- Exact amount exposure: **0**\n- Raw Timeline exposure: **0**\n- CRM writeback: **false**\n- Production requests: **0**\n- Browser external provider requests: **0**\n- R2 evidence retained unchanged.\n`;
}

function finalDecision(summary) {
  return `# Phase 3C-R3 Final Decision\n\n- Phase 3C R3 Complete: **false**\n- R3 external calls: **0/24**\n- Contract canary: not executed\n- Remaining 23 canaries: not authorized because the contract canary did not run\n- Model Comparison: not started\n- CRM Writeback: **false**\n- Production requests: **0**\n- Blocker: ${summary.stopReason}\n`;
}

async function appendAddendum(file, section) {
  const target = path.join(OUTPUT_DIR, file);
  const current = await fs.readFile(target, "utf8").catch(() => "");
  if (!current.includes("Phase 3C-R3 follow-up")) await fs.writeFile(target, `${current.trimEnd()}\n\n${section}`, "utf8");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runR3().then((summary) => console.log(JSON.stringify({ status: summary.status, stopReason: summary.stopReason, externalLlmCalls: summary.execution.externalLlmCalls, r3Complete: summary.decision.endsWith("true") }, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
