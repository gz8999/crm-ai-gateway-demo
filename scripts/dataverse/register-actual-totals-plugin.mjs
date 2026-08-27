import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ALLOWED_TEST_HOSTNAME = "org91f5f65f.crm5.dynamics.com";
const PRODUCTION_HOSTNAME = "lcn-crm.crm7.dynamics.com";
const EXPECTED_STEP_COUNT = 7;
const EXPECTED_FILTER_COUNT = 14;

export function isDirectRun(metaUrl, argvEntry = process.argv[1]) {
  return Boolean(argvEntry) && metaUrl === pathToFileURL(argvEntry).href;
}

export function parseArgs(argv = []) {
  const result = { dryRun: true, registerDisabled: false };
  const keyName = (value) => value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") result.dryRun = true;
    else if (value === "--register-disabled") result.registerDisabled = true;
    else if (value === "--confirm-test-environment") result.confirmTestEnvironment = true;
    else if (value.startsWith("--") && argv[index + 1] && !argv[index + 1].startsWith("--")) result[keyName(value.slice(2))] = argv[++index];
    else if (value.startsWith("--")) result[keyName(value.slice(2))] = true;
  }
  return result;
}

export function validateEnvironmentUrl(value) {
  if (!value) throw new Error("--environment-url is required; no environment is contacted by this tool.");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Environment URL must be a valid HTTPS Dynamics organization root URL.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === PRODUCTION_HOSTNAME) throw new Error("Production Dataverse hostname is permanently blocked.");
  if (hostname !== ALLOWED_TEST_HOSTNAME) throw new Error("Only the explicitly approved test hostname is accepted.");
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Environment URL must be the approved HTTPS organization root URL.");
  }
  return parsed.origin;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value;
}

export function validateRegistrationManifest(manifest) {
  if (!manifest || manifest.dryRun !== true || manifest.executable !== false) throw new Error("Registration manifest must remain dryRun=true and executable=false.");
  if (manifest.registrationAuthorized !== false) throw new Error("Registration manifest must remain unauthorized.");
  if (manifest.primaryEntity !== "aigw_actualmanagement") throw new Error("Primary entity does not match the approved table.");
  if (!manifest.artifact || manifest.artifact.assemblyName !== "CrmAiGateway.ActualTotals.Plugin") throw new Error("Assembly identity does not match the frozen Artifact.");
  if (manifest.artifact.targetFramework !== "net462" || manifest.artifact.configuration !== "Release") throw new Error("Assembly build identity does not match the frozen Artifact.");
  if (!/^[a-f0-9]{64}$/i.test(manifest.artifact.sha256)) throw new Error("Manifest SHA-256 is missing or malformed.");
  if (manifest.artifact.publicKeyToken !== "0350f79ae25dc991") throw new Error("Manifest public key token does not match the frozen identity.");
  if (!Array.isArray(manifest.steps) || manifest.steps.length !== EXPECTED_STEP_COUNT) throw new Error("Manifest must contain exactly seven steps.");
  if (!Array.isArray(manifest.filteringAttributes) || manifest.filteringAttributes.length !== EXPECTED_FILTER_COUNT || new Set(manifest.filteringAttributes).size !== EXPECTED_FILTER_COUNT) throw new Error("Manifest must contain exactly fourteen unique filtering attributes.");
  const updateSteps = manifest.steps.filter((step) => step.message === "Update");
  if (updateSteps.length !== 3 || updateSteps.some((step) => JSON.stringify(step.filteringAttributes) !== JSON.stringify(manifest.filteringAttributes))) throw new Error("All three Update steps must use the ordered manifest filtering set.");
  for (const step of manifest.steps) {
    if (step.initialState !== "Disabled") throw new Error(`Step ${step.logicalIdentifier} is not Disabled by default.`);
    if (step.mode !== 0 || step.modeName !== "Synchronous" || step.deployment !== "Server" || step.isolation !== "Sandbox") throw new Error(`Step ${step.logicalIdentifier} has an unsupported execution configuration.`);
    for (const image of step.images || []) {
      if (!image.alias || image.alias !== image.name || !Array.isArray(image.fields) || image.fields.length === 0) throw new Error(`Image on ${step.logicalIdentifier} is incomplete.`);
      if (image.fields.includes("All Attributes")) throw new Error(`Image on ${step.logicalIdentifier} uses All Attributes.`);
    }
  }
  if (manifest.dataverse?.connected !== false || manifest.dataverse?.registration !== false || manifest.dataverse?.stepsCreated !== false || manifest.dataverse?.imagesCreated !== false || manifest.dataverse?.publish !== false || manifest.dataverse?.dataWrites !== false) throw new Error("Manifest contains an unsafe online execution state.");
  if (manifest.seedBlocked !== true) throw new Error("Synthetic seed must remain blocked.");
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${label}: ${error.message}`);
  }
}

export async function buildDryRunPlan({ environmentUrl, dllPath, manifestPath, expectedSha256, expectedPublicKeyToken = "0350f79ae25dc991", registerDisabled = false }) {
  const approvedEnvironment = validateEnvironmentUrl(environmentUrl);
  const resolvedDllPath = path.resolve(requireString(dllPath, "--dll-path"));
  const resolvedManifestPath = path.resolve(requireString(manifestPath, "--manifest-path"));
  const manifest = await readJson(resolvedManifestPath, "registration manifest");
  validateRegistrationManifest(manifest);
  const dll = await fs.readFile(resolvedDllPath);
  const actualSha256 = sha256(dll);
  const expected = (expectedSha256 || manifest.artifact.sha256).toLowerCase();
  if (actualSha256 !== expected || actualSha256 !== manifest.artifact.sha256.toLowerCase()) throw new Error("DLL SHA-256 does not match both the expected value and registration manifest.");
  if (expectedPublicKeyToken !== manifest.artifact.publicKeyToken) throw new Error("Expected public key token does not match registration manifest.");

  const artifactDirectory = path.dirname(resolvedDllPath);
  const inspection = await readJson(path.join(artifactDirectory, "assembly-inspection.json"), "assembly inspection");
  if (inspection.passed !== true || inspection.assemblyName !== manifest.artifact.assemblyName || inspection.publicKeyToken !== expectedPublicKeyToken || inspection.strongNameSigned !== true) throw new Error("Assembly inspection does not match the frozen identity.");
  if (inspection.sha256 !== actualSha256) throw new Error("Assembly inspection SHA-256 does not match the DLL.");

  return {
    dryRun: true,
    writesExecuted: false,
    networkRequests: 0,
    environmentUrl: approvedEnvironment,
    productionHostnameBlocked: PRODUCTION_HOSTNAME,
    assembly: {
      name: manifest.artifact.assemblyName,
      dllPath: resolvedDllPath,
      sha256: actualSha256,
      publicKeyToken: expectedPublicKeyToken,
      targetFramework: manifest.artifact.targetFramework,
      isolation: manifest.artifact.isolation,
      deployment: manifest.artifact.deployment
    },
    initialStepState: registerDisabled ? "Disabled" : "Disabled (planned default)",
    pluginTypes: manifest.pluginTypes,
    steps: manifest.steps.map(({ logicalIdentifier, displayName, pluginType, message, stage, stageName, mode, modeName, rank, filteringAttributes, images }) => ({ logicalIdentifier, displayName, pluginType, message, stage, stageName, mode, modeName, rank, filteringAttributes, images: images.map(({ name, alias, fields }) => ({ name, alias, fields })) })),
    nextAction: "Stop. Future online registration requires a separately authorized implementation and manual test-environment approval."
  };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.environmentUrl) throw new Error("Dry-run requires --environment-url; no environment is contacted.");
  if (!args.dllPath || !args.manifestPath) throw new Error("Dry-run requires --dll-path and --manifest-path.");
  if (args.dryRun !== true) throw new Error("Online registration is intentionally unavailable in this phase; use --dry-run.");
  const plan = await buildDryRunPlan({
    environmentUrl: args.environmentUrl,
    dllPath: args.dllPath,
    manifestPath: args.manifestPath,
    expectedSha256: args.expectedSha256,
    expectedPublicKeyToken: args.expectedPublicKeyToken || "0350f79ae25dc991",
    registerDisabled: args.registerDisabled
  });
  console.log(JSON.stringify(plan, null, 2));
  return plan;
}

if (isDirectRun(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
