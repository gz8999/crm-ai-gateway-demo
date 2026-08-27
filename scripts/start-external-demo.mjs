import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH } from "../server/ai/deepAnalysis/evidenceContract.mjs";

// Resolve the repository from this file so the launcher also works when invoked
// from a user's home directory or another shell working directory.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedProfiles = new Set([".env.external.local", ".env.glm52.local", ".env.u2.local"]);
const profileName = process.argv[2] || ".env.external.local";
if (!allowedProfiles.has(profileName)) throw new Error(`Unsupported external demo profile: ${profileName}`);
const profilePath = path.join(root, profileName);
const processStartedAt = Date.now();

async function loadEnvFile(filePath) {
  const content = await readFile(filePath, "utf8").catch(() => "");
  return content ? dotenv.parse(content) : {};
}

const base = await loadEnvFile(path.join(root, ".env"));
const profile = await loadEnvFile(profilePath);
if (!Object.keys(profile).length) {
  throw new Error(`Missing ${profileName}. Create it locally; it is ignored and must never be committed.`);
}

for (const [key, value] of Object.entries(base)) if (!(key in process.env)) process.env[key] = value;
Object.assign(process.env, profile);
process.env.GATEWAY_COLD_START_EPOCH_MS = String(processStartedAt);
process.env.GATEWAY_ENV_BASE_LOADED = String(Object.keys(base).length > 0);
process.env.GATEWAY_ENV_EXTERNAL_LOCAL_LOADED = String(Object.keys(profile).length > 0);
process.env.GATEWAY_D365_CREDENTIALS_CONFIGURED = String(Boolean(process.env.TENANT_ID && process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.DATAVERSE_URL));
process.env.GATEWAY_ENV_LOAD_MS = String(Date.now() - processStartedAt);
// The prebuilt frontend contains the separately gated Deep Analysis workspace.
process.env.VITE_FEATURE_DEEP_ANALYSIS = "true";

const required = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`External demo profile is missing: ${missing.join(", ")}`);
if (process.env.CRM_WRITEBACK_ENABLED === "true") throw new Error("External demo profile requires CRM_WRITEBACK_ENABLED=false.");

const safeSummary = {
  profile: profileName,
  dataSource: process.env.DATA_SOURCE || "hybrid",
  externalAllowed: process.env.ALLOW_EXTERNAL_AI === "true",
  provider: process.env.AI_PROVIDER || "demo",
  model: process.env.LLM_MODEL,
  timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 20000),
  deepAnalysisMaxTokens: Number(process.env.LLM_DEEP_ANALYSIS_MAX_TOKENS || 2400),
  highFidelityAvailable: process.env.DEEP_ANALYSIS_HIGH_FIDELITY_ENABLED === "true",
  contractHash: DEEP_ANALYSIS_EVIDENCE_CONTRACT_HASH,
  apiKeyConfigured: Boolean(process.env.LLM_API_KEY),
  crmWritebackEnabled: process.env.CRM_WRITEBACK_ENABLED === "true",
};
console.log(JSON.stringify(safeSummary, null, 2));
console.log(JSON.stringify({ coldStart: { processStartMs: 0, envLoadMs: Number(process.env.GATEWAY_ENV_LOAD_MS), envBaseLoaded: process.env.GATEWAY_ENV_BASE_LOADED === "true", envExternalLocalLoaded: process.env.GATEWAY_ENV_EXTERNAL_LOCAL_LOADED === "true", d365CredentialsConfigured: process.env.GATEWAY_D365_CREDENTIALS_CONFIGURED === "true" } }));

const child = spawn(process.execPath, [path.join(root, "server", "index.mjs")], {
  cwd: root,
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});
let apiReadyLogged = false;
function forwardStartupOutput(chunk, stream) {
  const text = chunk.toString();
  stream.write(text);
  if (!apiReadyLogged && text.includes("CRM AI Gateway demo: http://127.0.0.1:")) {
    apiReadyLogged = true;
    console.log(JSON.stringify({ coldStart: { apiListenReadyMs: Date.now() - processStartedAt } }));
  }
}
const stop = () => {
  if (!child.killed) child.kill("SIGTERM");
};
child.stdout.on("data", (chunk) => forwardStartupOutput(chunk, process.stdout));
child.stderr.on("data", (chunk) => forwardStartupOutput(chunk, process.stderr));
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
