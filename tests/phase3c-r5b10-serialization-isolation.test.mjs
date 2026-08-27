import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  analyzeR5B10EnvelopeDiff,
  buildR5B10SharedInput,
  buildR5B10Variants,
  executeR5B10,
  validateVariantVariables,
  writeR5B10Artifacts,
} from "../scripts/run-phase3c-r5b10-serialization-isolation.mjs";
import {
  R5B10_CAPTURE_DIR,
  diagnoseToolArguments,
  finalizeSyntheticToolArgumentQuarantine,
  writeSyntheticToolArgumentQuarantine,
} from "../server/decision/toolArgumentsQuarantine.mjs";
import { requestHash } from "../server/decision/externalModelContract.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const env = {
  LLM_BASE_URL: "https://api.deepseek.com/beta",
  LLM_MODEL: "deepseek-v4-pro",
  LLM_API_KEY: "test-only",
  LLM_TIMEOUT_MS: "1000",
};
const historicalHashes = {
  "external-model-response-contract-v1.json": "f262cf6aa39a287393402594a8377920dcfe96d858141b398ada9ed0e7bd911e",
  "external-model-response-contract-v2.json": "0d0d932b0a552fae01d7522668892963b9c1bd14beef9095534793e2c395e241",
  "phase3c-r5b8-compatibility-decision.md": "abc159ac60ce87f4bc7a139444476e56efb9e91dfa49e519523bb608b1adaa12",
  "phase3c-r5b9-runtime-manifest.json": "603917aea6ad1d78012b18c82944120d9ec58cac42d907da3422caf5ad12aa10",
};

function oldArguments(evidenceToken) {
  return {
    facts: [{ label: "Synthetic fact", value: "A synthetic review signal is present.", evidenceToken }],
    inferences: [{ inference: "The synthetic evidence supports review.", evidenceTokens: [evidenceToken] }],
    evidence: [{ evidenceToken, value: "Synthetic evidence only." }],
    confidence: { level: "Medium", reason: "One synthetic evidence token is available." },
    recommendedActions: [{ action: "Review the synthetic signal", ownerRole: "synthetic-reviewer", dueWindow: "synthetic-window", basis: evidenceToken, draftStatus: "Draft only" }],
    priority: "Monitor",
    riskCategories: ["synthetic-review"],
    provider: "openai-compatible",
    model: "deepseek-v4-pro",
    modelVersion: "deepseek-v4-pro",
    fallback: { state: "not_applicable", reason: "Synthetic strict Tool response." },
    safety: { customerIdentityMasked: true, exactAmountSentToModel: false, rawTimelineSent: false, crmWritebackEnabled: false },
    limitations: ["Synthetic context only."],
  };
}

function currentArguments(evidenceToken) {
  return {
    ...oldArguments(evidenceToken),
    safety: {
      identityMasked: true,
      exactAmountWithheld: true,
      rawTimelineWithheld: true,
      crmWritebackPerformed: false,
      policyCodes: ["SAFE_CONTEXT_ONLY", "NO_RAW_CRM", "NO_IDENTITY", "NO_EXACT_AMOUNT", "NO_RAW_TIMELINE", "NO_CRM_WRITEBACK"],
    },
    limitations: { codes: ["IDENTITY_MASKED", "EXACT_AMOUNT_WITHHELD", "RAW_TIMELINE_WITHHELD"] },
  };
}

function providerResponse(argumentsText) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id: "synthetic-r5b10-response",
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 50, completion_tokens: 80, total_tokens: 130 },
      choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: argumentsText } }] } }],
    }),
  };
}

function validResponseForRequest(options) {
  const request = JSON.parse(options.body);
  const providerInput = JSON.parse(request.messages[1].content);
  const evidenceToken = providerInput.safeDecisionContext.evidenceTokens[0];
  const current = Object.hasOwn(request.tools[0].function.parameters.properties.safety.properties, "policyCodes");
  return providerResponse(JSON.stringify(current ? currentArguments(evidenceToken) : oldArguments(evidenceToken)));
}

async function temporaryHistoricalRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "r5b10-"));
  const directory = path.join(root, "docs", "gateway");
  await fs.mkdir(directory, { recursive: true });
  for (const name of Object.keys(historicalHashes)) {
    await fs.copyFile(path.join(ROOT, "docs", "gateway", name), path.join(directory, name));
  }
  return root;
}

async function executeWithFailureAt(failureCall = 0) {
  const repoRoot = await temporaryHistoricalRoot();
  let calls = 0;
  try {
    const summary = await executeR5B10({
      env,
      repoRoot,
      fetchImpl: async (_url, options) => {
        calls += 1;
        return failureCall === calls ? providerResponse('{"facts":[') : validResponseForRequest(options);
      },
    });
    return { summary, calls };
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
}

test("R5B10 shared Synthetic Input Hash is identical across four variants", () => {
  const variants = buildR5B10Variants({ env });
  assert.equal(new Set(variants.map((variant) => variant.sharedSyntheticInputHash)).size, 1);
  assert.equal(variants[0].sharedSyntheticInputHash, requestHash(buildR5B10SharedInput()));
});

test("R5B10 variants change only approved prompt and schema variables", () => {
  const result = validateVariantVariables(buildR5B10Variants({ env }));
  assert.equal(result.aToBPromptOnly, true);
  assert.equal(result.aToCSchemaOnly, true);
  assert.equal(result.bToDSchemaOnly, true);
  assert.equal(result.cToDPromptOnly, true);
  assert.equal(result.allBodiesShareCommonRuntimeSettings, true);
  assert.equal(result.allSharedInputHashesMatch, true);
});

test("R5B10 offline envelope diff names exact JSON paths and structural metrics", () => {
  const diff = analyzeR5B10EnvelopeDiff({ env });
  assert.ok(diff.systemPromptDiffPaths.includes("$.messages[0].content"));
  assert.ok(diff.toolParameterDiffPaths.length > 0);
  assert.ok(diff.requiredDiffPaths.length > 0);
  assert.ok(diff.enumDiffPaths.length > 0);
  assert.ok(diff.stats.r5b9.objectCount > diff.stats.r5b8.objectCount);
  assert.ok(diff.stats.r5b9.schemaCharacterLength > diff.stats.r5b8.schemaCharacterLength);
});

test("Variant A failure stops B C and D", async () => {
  const { summary, calls } = await executeWithFailureAt(1);
  assert.equal(calls, 1);
  assert.equal(summary.counts.variantACalls, 1);
  assert.equal(summary.counts.variantBCalls, 0);
  assert.equal(summary.regressionClassification, "Provider Output Stability Not Proven");
});

test("Variant B failure stops C and D", async () => {
  const { summary, calls } = await executeWithFailureAt(2);
  assert.equal(calls, 2);
  assert.equal(summary.knownGoodControlReproduced, true);
  assert.equal(summary.promptDeltaSuspected, true);
  assert.equal(summary.counts.variantCCalls, 0);
  assert.equal(summary.counts.variantDCalls, 0);
});

test("Variant C failure stops D", async () => {
  const { summary, calls } = await executeWithFailureAt(3);
  assert.equal(calls, 3);
  assert.equal(summary.promptDeltaVariantReady, true);
  assert.equal(summary.schemaDeltaSuspected, true);
  assert.equal(summary.counts.variantDCalls, 0);
});

test("Variant D failure classifies prompt and schema interaction", async () => {
  const { summary, calls } = await executeWithFailureAt(4);
  assert.equal(calls, 4);
  assert.equal(summary.schemaDeltaVariantReady, true);
  assert.equal(summary.promptSchemaInteractionSuspected, true);
  assert.equal(summary.currentEnvelopeSinglePassReady, false);
});

test("four passing variants reach single-pass only and do not authorize a real Canary", async () => {
  const { summary, calls } = await executeWithFailureAt(0);
  assert.equal(calls, 4);
  assert.equal(summary.counts.jsonParseSuccess, 4);
  assert.equal(summary.counts.schemaSuccess, 4);
  assert.equal(summary.counts.canonicalSuccess, 4);
  assert.equal(summary.counts.evidenceSuccess, 4);
  assert.equal(summary.counts.safetySuccess, 4);
  assert.equal(summary.currentEnvelopeSinglePassReady, true);
  assert.equal(summary.realCanaryAuthorized, false);
});

test("JSON diagnostics do not mutate input or expose raw arguments", () => {
  const raw = '{"facts":[{"value":"synthetic"}],}';
  const before = `${raw}`;
  const result = diagnoseToolArguments(raw);
  assert.equal(raw, before);
  assert.equal(result.publicDiagnostics.argumentsSha256.length, 64);
  assert.equal(JSON.stringify(result.publicDiagnostics).includes("synthetic"), false);
  assert.equal(Object.hasOwn(result.publicDiagnostics, "escapedErrorWindow"), false);
});

test("R5B10 quarantine deletes raw arguments and keeps private evidence", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "r5b10-quarantine-"));
  try {
    const eligibility = { testOnly: true, syntheticProbe: true, d365Record: false, runtimeEligible: false, realCanary: false, realCrmTokenCount: 0, forbiddenFieldCount: 0 };
    await writeSyntheticToolArgumentQuarantine({ argumentsText: '{"facts":[]', eligibility, repoRoot, captureDir: R5B10_CAPTURE_DIR });
    const result = await finalizeSyntheticToolArgumentQuarantine({ repoRoot, captureDir: R5B10_CAPTURE_DIR });
    assert.equal(result.rawFileExistsAfterDeletion, false);
    await assert.rejects(fs.stat(path.join(repoRoot, R5B10_CAPTURE_DIR, "arguments.raw.txt")));
    const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, R5B10_CAPTURE_DIR, "parse-diagnostics.private.json"), "utf8"));
    assert.equal(manifest.lifecycle, "deleted");
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test("R5B10 preserves frozen Contract v1 v2 and R5B8 R5B9 evidence hashes", async () => {
  for (const [name, expected] of Object.entries(historicalHashes)) {
    const value = await fs.readFile(path.join(ROOT, "docs", "gateway", name));
    assert.equal(createHash("sha256").update(value).digest("hex"), expected, name);
  }
});

test("R5B10 has no heuristic JSON repair path", async () => {
  const source = await fs.readFile(path.join(ROOT, "scripts", "run-phase3c-r5b10-serialization-isolation.mjs"), "utf8");
  assert.equal(/jsonrepair|repairJson|stripMarkdown|removeTrailingComma|closeMissingBracket|secondParse|tolerantParser/i.test(source), false);
  assert.equal((source.match(/parseStrictToolArguments\(/g) || []).length, 1);
});

test("R5B10 has no retry or fixture fallback", async () => {
  const { summary } = await executeWithFailureAt(1);
  assert.equal(summary.counts.retry, 0);
  assert.equal(summary.counts.fallback, 0);
  assert.equal(summary.externalLlmCalls, 1);
});

test("R5B10 rejects deterministic health overrides", async () => {
  const repoRoot = await temporaryHistoricalRoot();
  let calls = 0;
  try {
    const summary = await executeR5B10({
      env,
      repoRoot,
      fetchImpl: async (_url, options) => {
        calls += 1;
        const request = JSON.parse(options.body);
        const providerInput = JSON.parse(request.messages[1].content);
        const output = oldArguments(providerInput.safeDecisionContext.evidenceTokens[0]);
        output.healthScore = 99;
        return providerResponse(JSON.stringify(output));
      },
    });
    assert.equal(calls, 1);
    assert.equal(summary.variants[0].ready, false);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test("R5B10 request accounting keeps D365 CRM write and production at zero", async () => {
  const { summary } = await executeWithFailureAt(0);
  assert.equal(summary.counts.d365Get, 0);
  assert.equal(summary.counts.crmPost, 0);
  assert.equal(summary.counts.crmPatch, 0);
  assert.equal(summary.counts.crmDelete, 0);
  assert.equal(summary.counts.crmWriteback, false);
  assert.equal(summary.counts.productionRequests, 0);
});

test("R5B10 source contains no D365 production write or embedded secret", async () => {
  const source = await fs.readFile(path.join(ROOT, "scripts", "run-phase3c-r5b10-serialization-isolation.mjs"), "utf8");
  assert.equal(/org91f5f65\.crm5\.dynamics\.com|lcn-crm\.crm7\.dynamics\.com/i.test(source), false);
  assert.equal(/sk-[A-Za-z0-9]{20,}/.test(source), false);
  assert.equal(/WinOpportunity|LoseOpportunity|\bPATCH\b|\bDELETE\b|Publish/i.test(source), false);
});

test("R5B10 Synthetic request contains no real Canary token", () => {
  const serialized = JSON.stringify(buildR5B10Variants({ env }));
  assert.equal(serialized.includes("DEMO-OPP-002"), false);
  assert.equal(serialized.includes("DEMO-OPP-"), false);
  assert.equal(serialized.includes("SYN-OPP-"), true);
});

test("R5B10 artifacts mark unexecuted variants as Not Executed and omit raw text", async () => {
  const repoRoot = await temporaryHistoricalRoot();
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "r5b10-artifacts-"));
  try {
    const summary = await executeR5B10({ env, repoRoot, fetchImpl: async () => providerResponse('{"facts":[') });
    await writeR5B10Artifacts(summary, { outputDir });
    const validation = JSON.parse(await fs.readFile(path.join(outputDir, "phase3c-r5b10-response-validation.json"), "utf8"));
    assert.equal(validation.variants[1].status, "Not Executed");
    const publicFiles = (await fs.readdir(outputDir)).map((name) => path.join(outputDir, name));
    const content = (await Promise.all(publicFiles.map((name) => fs.readFile(name, "utf8")))).join("\n");
    assert.equal(content.includes('{"facts":['), false);
    assert.equal(content.includes("escapedErrorWindow"), false);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("R5B10 Variant request timeout and single-call behavior are explicit", async () => {
  const source = await fs.readFile(path.join(ROOT, "scripts", "run-phase3c-r5b10-serialization-isolation.mjs"), "utf8");
  assert.match(source, /AbortController/);
  assert.match(source, /MAX_CALLS = 4/);
  assert.equal(/for\s*\([^)]*attempt|while\s*\([^)]*retry/i.test(source), false);
});
