import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertDataverseScriptGate,
  isDirectRun,
  runDataverseCli,
} from "../scripts/dataverse/lib/environment-safety.mjs";

const scriptsDirectory = new URL("../scripts/dataverse/", import.meta.url);

test("all Dataverse CLI modules import without configuration, network, exit, or main side effects", async () => {
  const scripts = (await readdir(scriptsDirectory)).filter((name) => name.endsWith(".mjs")).sort();
  const savedEnvironment = { ...process.env };
  const savedFetch = globalThis.fetch;
  const savedExit = process.exit;
  let fetchCalls = 0;
  let exitCalls = 0;

  for (const name of Object.keys(process.env)) {
    if (name.startsWith("DATAVERSE_") || name.startsWith("D365_") || ["TENANT_ID", "CLIENT_ID", "CLIENT_SECRET"].includes(name)) {
      delete process.env[name];
    }
  }
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Network access is forbidden while importing Dataverse CLI modules.");
  };
  process.exit = () => {
    exitCalls += 1;
    throw new Error("process.exit is forbidden while importing Dataverse CLI modules.");
  };

  try {
    for (const script of scripts) {
      await import(new URL(`${script}?import-safety=${encodeURIComponent(script)}`, scriptsDirectory));
    }
  } finally {
    globalThis.fetch = savedFetch;
    process.exit = savedExit;
    for (const name of Object.keys(process.env)) delete process.env[name];
    Object.assign(process.env, savedEnvironment);
  }

  assert.equal(fetchCalls, 0);
  assert.equal(exitCalls, 0);
});

test("Dataverse CLI sources defer configuration and guard direct execution", async () => {
  const scripts = (await readdir(scriptsDirectory)).filter((name) => name.endsWith(".mjs")).sort();
  for (const script of scripts) {
    const source = await readFile(new URL(script, scriptsDirectory), "utf8");
    assert.doesNotMatch(source, /^import "dotenv\/config";/m, `${script} imports dotenv at module load`);
    assert.doesNotMatch(source, /^const .*get(?:DataverseUrl|RequiredEnvironmentId|RequiredLocalArtifactPath)\(/m, `${script} resolves environment configuration at module load`);
    assert.doesNotMatch(source, /^main\(\)\.catch/m, `${script} executes main without the shared direct-run gate`);
    assert.doesNotMatch(source, /^\s*await\s+(?:main|fetch)\(/m, `${script} has a top-level execution side effect`);
    assert.match(source, /export async function main\(/, `${script} does not export main`);
    if (script === "register-actual-totals-plugin.mjs") {
      assert.match(source, /if \(isDirectRun\(import\.meta\.url\)\)/, `${script} does not use a direct-run guard`);
    } else {
      assert.match(source, /runDataverseCli\(import\.meta\.url, main\);/, `${script} does not use the shared CLI gate`);
    }
  }
});

test("the CLI gate runs only for a direct entry and supports injected offline safety configuration", async () => {
  let mainCalls = 0;
  assert.equal(isDirectRun("file:///module.mjs", undefined), false);
  assert.equal(runDataverseCli("file:///module.mjs", async () => { mainCalls += 1; }), false);
  assert.equal(mainCalls, 0);

  const offline = assertDataverseScriptGate({
    mode: "read-only",
    env: { DATAVERSE_URL: "https://example.crm.dynamics.com" },
  });
  assert.equal(offline.dataverseUrl, "https://example.crm.dynamics.com");
});

test("explicit main invocation resolves Dataverse configuration and fails when it is absent", async () => {
  const { main } = await import("../scripts/dataverse/apply-phase1b-m1-status-reasons.mjs?explicit-main-test");
  const saved = process.env.DATAVERSE_URL;
  delete process.env.DATAVERSE_URL;
  try {
    await assert.rejects(main(), /DATAVERSE_URL is required/);
  } finally {
    if (saved === undefined) delete process.env.DATAVERSE_URL;
    else process.env.DATAVERSE_URL = saved;
  }
});
