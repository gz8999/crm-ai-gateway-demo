import { pathToFileURL } from "node:url";

const DYNAMICS_HOSTNAME = /^[a-z0-9-]+\.crm\d*\.dynamics\.com$/i;

export function isDirectRun(metaUrl, argvEntry = process.argv[1]) {
  if (!argvEntry) return false;
  return metaUrl === pathToFileURL(argvEntry).href;
}

export function runDataverseCli(metaUrl, main, { onError = (error) => console.error(error.stack || error.message) } = {}) {
  if (!isDirectRun(metaUrl)) return false;
  import("dotenv/config")
    .then(() => main())
    .catch((error) => {
      onError(error);
      process.exitCode = 1;
    });
  return true;
}

export function getDataverseUrl(env = process.env) {
  const raw = String(env.DATAVERSE_URL || "").trim().replace(/\/$/, "");
  if (!raw) throw new Error("DATAVERSE_URL is required; no default environment is configured.");

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("DATAVERSE_URL must be a valid HTTPS Dynamics URL.");
  }
  if (parsed.protocol !== "https:" || !DYNAMICS_HOSTNAME.test(parsed.hostname) || parsed.pathname !== "/") {
    throw new Error("DATAVERSE_URL must be an HTTPS Dynamics organization root URL.");
  }
  return parsed.origin;
}

export function assertDataverseScriptGate({ mode, argv = process.argv.slice(2), env = process.env } = {}) {
  const dataverseUrl = getDataverseUrl(env);
  if (mode === "read-only") return { dataverseUrl, mode };
  if (!new Set(["write-capable", "publish/deploy-capable"]).has(mode)) throw new Error(`Unknown Dataverse script mode: ${mode}`);
  if (String(env.DATAVERSE_ENVIRONMENT_KIND || "").toLowerCase() !== "test") {
    throw new Error("Write-capable scripts require DATAVERSE_ENVIRONMENT_KIND=test.");
  }

  const forbiddenHostnames = String(env.DATAVERSE_PRODUCTION_HOSTNAMES || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!forbiddenHostnames.length) throw new Error("DATAVERSE_PRODUCTION_HOSTNAMES must be configured before any write-capable script can run.");
  const hostname = new URL(dataverseUrl).hostname.toLowerCase();
  if (forbiddenHostnames.includes(hostname)) throw new Error("Production Dataverse hostname is blocked.");
  if (!argv.includes("--confirm-test-environment")) throw new Error("Explicit --confirm-test-environment is required.");
  if (!argv.includes("--confirm")) throw new Error("Explicit --confirm is required before a write-capable script can run.");
  if (mode === "publish/deploy-capable" && !argv.includes("--confirm-publish-or-deploy")) {
    throw new Error("Explicit --confirm-publish-or-deploy is required.");
  }
  return { dataverseUrl, mode };
}

export function getRequiredEnvironmentId(name, env = process.env) {
  const value = String(env[name] || "").trim().replace(/[{}]/g, "").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error(`${name} must be configured as a valid environment component ID.`);
  }
  return value;
}

export function getRequiredLocalArtifactPath(name, env = process.env) {
  const value = String(env[name] || "").trim().replace(/\\/g, "/");
  if (!value || value.startsWith("/") || /^[a-z]:\//i.test(value) || value.includes("..") || !value.startsWith("local-artifacts/")) {
    throw new Error(`${name} must be a repository-relative path under local-artifacts/.`);
  }
  return value;
}
