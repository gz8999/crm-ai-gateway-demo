import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { getDecisionView, scenarioDescriptors } from "../server/decision/decisionService.mjs";
import { evaluateDecisionOutput, evaluateDecisionPack, selectDeterministicSample } from "../server/decision/evaluationEngine.mjs";

const dataset = JSON.parse(await readFile(new URL("../docs/gateway/ai-scenario-evaluation-dataset.json", import.meta.url), "utf8"));

test("evaluation dataset covers all eight scenarios without runtime import", () => {
  assert.deepEqual(dataset.scenarios.map((item) => item.scenarioId), scenarioDescriptors.map((item) => item.id));
  for (const scenario of dataset.scenarios) {
    assert.ok(scenario.expectedFacts.length > 0, scenario.scenarioId);
    assert.ok(scenario.expectedEvidence.length > 0, scenario.scenarioId);
    assert.ok(scenario.requiredActions.length > 0, scenario.scenarioId);
    assert.ok(scenario.inputSafeContext.values && typeof scenario.inputSafeContext.values === "object", scenario.scenarioId);
    assert.equal(scenario.inputSafeContext.requiredSignals.some((key) => key.includes("scenario")), false);
  }
});

test("scenario Decision Packs score against facts, evidence, actions and safety", () => {
  for (const expected of dataset.scenarios) {
    const view = getDecisionView({ mode: "scenario", scenarioId: expected.scenarioId });
    const first = evaluateDecisionPack({ pack: view.pack, safeContext: view.safeContext, scopeSummary: view.scopeSummary, expected });
    const second = evaluateDecisionPack({ pack: view.pack, safeContext: view.safeContext, scopeSummary: view.scopeSummary, expected });
    assert.deepEqual(first, second, expected.scenarioId);
    assert.equal(first.ready, true, expected.scenarioId);
    assert.equal(first.unsupportedClaimCount, 0, expected.scenarioId);
    assert.equal(first.untraceableEvidenceCount, 0, expected.scenarioId);
    assert.ok(first.scores.factAccuracy >= 80, expected.scenarioId);
    assert.ok(first.scores.evidenceCoverage >= 80, expected.scenarioId);
    assert.equal(first.scores.safetyCompliance, 100, expected.scenarioId);
  }
});

test("evaluation catches unsupported claims and untraceable evidence", () => {
  const view = getDecisionView({ mode: "scenario", scenarioId: "healthy-control" });
  const unsafe = {
    ...view.pack.risk,
    inference: "Customer said the port closure is confirmed.",
    evidence: [{ label: "bad", value: "unknown", source: "rawTimeline.body" }],
  };
  const result = evaluateDecisionOutput({ output: unsafe, safeContext: view.safeContext, expected: dataset.scenarios.find((item) => item.scenarioId === "healthy-control") });
  assert.equal(result.ready, false);
  assert.ok(result.unsupportedClaimCount > 0);
  assert.equal(result.untraceableFactCount, 0);
  assert.equal(result.untraceableEvidenceCount, 1);
  assert.equal(result.scores.safetyCompliance, 0);
});

test("deterministic evaluation sample preserves all three states", () => {
  const items = [
    { token: "A", state: "Active" },
    { token: "B", state: "Won" },
    { token: "C", state: "Lost" },
    { token: "D", state: "Active" },
  ];
  const first = selectDeterministicSample(items, { size: 3, seed: "test" });
  const second = selectDeterministicSample(items, { size: 3, seed: "test" });
  assert.deepEqual(first, second);
  assert.deepEqual(new Set(first.map((item) => item.state)), new Set(["Active", "Won", "Lost"]));
});

test("evaluation engine and quality runner expose no write path or external provider path", async () => {
  const source = await readFile(new URL("../server/decision/evaluationEngine.mjs", import.meta.url), "utf8");
  const runner = await readFile(new URL("../scripts/evaluate-ai-decision-quality.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /dataverse(Post|Patch|Delete)|fetch\([^)]*method\s*:\s*["'](?:POST|PATCH|DELETE)/i);
  assert.doesNotMatch(runner, /dataverse(Post|Patch|Delete)|ALLOW_EXTERNAL_AI\s*=\s*true|openai|anthropic/i);
  assert.match(runner, /createFrozenDatasetRuntimeService/);
});

test("runtime source cannot import evaluation or Golden metadata", async () => {
  const root = path.resolve(new URL("..", import.meta.url).pathname);
  const runtimeRoots = [path.join(root, "src"), path.join(root, "server")];
  const forbiddenImport = /(?:from|import\s*\(|require\s*\()[^\n]*(?:ai-scenario-evaluation-dataset|ai-decision-evaluation-contract|ai-evaluation-contract|decision-scenario-goldens|tests[\\/]+fixtures)/i;
  const files = [];

  async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(entryPath);
      else if (/\.(?:m?[jt]sx?|cjs)$/.test(entry.name)) files.push(entryPath);
    }
  }

  for (const directory of runtimeRoots) await collect(directory);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, forbiddenImport, path.relative(root, file));
  }
});
