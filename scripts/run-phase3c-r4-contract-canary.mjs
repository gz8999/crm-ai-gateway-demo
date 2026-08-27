import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main as runCanaries } from "./run-phase3c-external-llm-canary.mjs";

const ROOT = process.cwd();
const SELECTION_PATH = "docs/gateway/external-llm-canary-r3-freeze-manifest.json";
const OUTPUT_DIR = path.join(ROOT, "docs", "gateway");
const RUN_ID = "PHASE3C-R4";
const REPORT_PREFIX = "external-llm-canary-r4";
const CONTRACT_TOKEN = "DEMO-OPP-002";

export function validateR4Freeze(selection) {
  const tokens = (selection?.records || []).map((row) => row.opportunityToken);
  return {
    count: selection?.count === 24 && tokens.length === 24,
    consumedExcluded: !tokens.includes("DEMO-OPP-001"),
    contractToken: tokens[0] === CONTRACT_TOKEN && selection?.contractCanaryToken === CONTRACT_TOKEN,
    unique: new Set(tokens).size === tokens.length,
  };
}

export function buildR4Env(env = process.env) {
  return {
    ...env,
    PHASE3C_SELECTION_PATH: SELECTION_PATH,
    PHASE3C_RUN_ID: RUN_ID,
    PHASE3C_REPORT_PREFIX: REPORT_PREFIX,
    PHASE3C_REQUEST_PREFIX: "PHASE3C-R4-CONTRACT",
    PHASE3C_NATIVE_JSON_MODE: "strict-tool",
    PHASE3C_CANARY_LIMIT: "1",
    LLM_CANARY_SINGLE_ATTEMPT: "true",
  };
}

export async function runR4({ env = process.env, now = () => new Date() } = {}) {
  const selection = JSON.parse(await fs.readFile(path.join(ROOT, SELECTION_PATH), "utf8"));
  const freeze = validateR4Freeze(selection);
  if (!freeze.count || !freeze.consumedExcluded || !freeze.contractToken || !freeze.unique) {
    throw new Error("R4 Contract Canary freeze is not valid.");
  }
  const oldKeyRevoked = String(env.PHASE3C_OLD_KEY_REVOKED || "false").toLowerCase() === "true";
  const newSecretReady = String(env.PHASE3C_NEW_KEY_CONFIGURED || "false").toLowerCase() === "true" && Boolean(env.LLM_API_KEY);
  if (!oldKeyRevoked || !newSecretReady) {
    const result = {
      phase: "Phase 3C-R4",
      runId: RUN_ID,
      status: "stopped-safety",
      stopReason: !oldKeyRevoked ? "old_key_revocation_unverified" : "new_server_side_secret_missing",
      contractCanary: CONTRACT_TOKEN,
      externalLlmCalls: 0,
      contractValid: false,
      safetyValid: false,
      hallucinationAudit: false,
      remainingCanaries: 23,
    };
    await writeContractReport(result, now);
    return result;
  }
  try {
    const summary = await runCanaries({ env: buildR4Env(env), now });
    const first = summary.results?.[0] || null;
    const result = {
      phase: "Phase 3C-R4",
      runId: RUN_ID,
      status: summary.status,
      stopReason: summary.stopReason || null,
      contractCanary: CONTRACT_TOKEN,
      externalLlmCalls: summary.requestStats?.externalLlmCalls || 0,
      contractValid: first?.responseContract === "pass",
      safetyValid: first?.safetyResult === "pass",
      hallucinationAudit: first?.hallucinationAudit === "pass",
      deterministicComparison: first?.deterministicBaseline || null,
      remainingCanaries: 23,
      remainingExecutionAuthorized: false,
    };
    await writeContractReport(result, now);
    return result;
  } catch (error) {
    const runtimePath = path.join(OUTPUT_DIR, `${REPORT_PREFIX}-runtime-manifest.json`);
    const runtime = JSON.parse(await fs.readFile(runtimePath, "utf8").catch(() => "{}"));
    const first = runtime.aggregate?.completed ? runtime.aggregate : null;
    const result = {
      phase: "Phase 3C-R4",
      runId: RUN_ID,
      status: "stopped-safety",
      stopReason: runtime.stopReason || error.phase3c?.reason || error.message,
      contractCanary: CONTRACT_TOKEN,
      externalLlmCalls: runtime.requestStats?.externalLlmCalls || error.phase3c?.externalLlmCalls || 0,
      contractValid: Boolean(first?.allResponseContractsPass),
      safetyValid: Boolean(first?.allSafetyPass),
      hallucinationAudit: Boolean(first?.allSafetyPass),
      remainingCanaries: 23,
      remainingExecutionAuthorized: false,
    };
    await writeContractReport(result, now);
    return result;
  }
}

async function writeContractReport(result, now) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIR, `${REPORT_PREFIX}-contract-canary-report.md`), [
    "# Phase 3C-R4 Contract Canary",
    "",
    `- Contract Canary: \`${result.contractCanary}\``,
    `- External calls: **${result.externalLlmCalls}/1**`,
    `- Tool/JSON contract: **${result.contractValid}**`,
    `- Schema: **${result.contractValid}**`,
    `- Safety: **${result.safetyValid}**`,
    `- Hallucination audit: **${result.hallucinationAudit}**`,
    `- Stop reason: **${result.stopReason || "contract canary completed"}**`,
    "- Retry: **0**",
    "- Remaining 23 canaries: **not executed**",
    "- Remaining execution authorization: **false**",
    `- Recorded at: ${now().toISOString()}`,
    "",
  ].join("\n"));
  await fs.writeFile(path.join(OUTPUT_DIR, `${REPORT_PREFIX}-final-decision.md`), [
    "# Phase 3C-R4 Final Decision",
    "",
    `- Contract Canary Ready: **${Boolean(result.contractValid && result.safetyValid && result.hallucinationAudit)}**`,
    "- Remaining 23 canaries: **not started**",
    "- CRM Writeback: **false**",
    "- Production Requests: **0**",
    "- Model Comparison: **not started**",
    `- Phase 3C-R4 Complete: **false**`,
    "",
  ].join("\n"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runR4({ env: process.env })
    .then((result) => console.log(JSON.stringify({ status: result.status, stopReason: result.stopReason, contractCanary: result.contractCanary, externalLlmCalls: result.externalLlmCalls, remainingCanaries: result.remainingCanaries, contractReady: result.contractValid && result.safetyValid && result.hallucinationAudit }, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
