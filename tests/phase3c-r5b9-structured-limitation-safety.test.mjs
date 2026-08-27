import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  LIMITATION_CODES,
  SAFETY_POLICY_CODES,
  mapExternalModelToolArgumentsToCanonicalV2,
  renderLimitationCodesZh,
  validateExternalModelResponseV2,
  validateExternalModelToolArgumentsV2,
  validateScopedOutputSafetyV2,
} from "../server/decision/externalModelContractV2.mjs";
import {
  buildR5B9RequestMeta,
  buildR5B9SyntheticInputs,
  executeR5B9,
  validateR5B9SyntheticInput,
} from "../scripts/run-phase3c-r5b9-structured-safety-probes.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const V1_HASH = "f262cf6aa39a287393402594a8377920dcfe96d858141b398ada9ed0e7bd911e";
const env = {
  LLM_BASE_URL: "https://api.deepseek.com/beta",
  LLM_MODEL: "deepseek-v4-pro",
  LLM_API_KEY: "synthetic-only",
  LLM_TIMEOUT_MS: "1000",
};

function validToolOutput(evidenceToken = "SYN-EVIDENCE-001") {
  return {
    facts: [{ label: "Synthetic fact", value: "A safe synthetic review signal is present.", evidenceToken }],
    inferences: [{ inference: "The synthetic evidence supports manual review.", evidenceTokens: [evidenceToken] }],
    evidence: [{ evidenceToken, value: "Synthetic evidence only." }],
    confidence: { level: "Medium", reason: "One synthetic evidence token is available." },
    recommendedActions: [{ action: "Review the synthetic signal", ownerRole: "synthetic-reviewer", dueWindow: "synthetic-review-window", basis: evidenceToken, draftStatus: "Draft only" }],
    priority: "Monitor",
    riskCategories: ["synthetic-review"],
    provider: "openai-compatible",
    model: "deepseek-v4-pro",
    modelVersion: "deepseek-v4-pro",
    fallback: { state: "not_applicable", reason: "Synthetic strict Tool response." },
    safety: {
      identityMasked: true,
      exactAmountWithheld: true,
      rawTimelineWithheld: true,
      crmWritebackPerformed: false,
      policyCodes: [...SAFETY_POLICY_CODES],
    },
    limitations: { codes: ["IDENTITY_MASKED", "EXACT_AMOUNT_WITHHELD", "RAW_TIMELINE_WITHHELD"] },
  };
}

function providerResponse(output) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      id: "synthetic-r5b9-response",
      model: "deepseek-v4-pro",
      usage: { prompt_tokens: 50, completion_tokens: 80, total_tokens: 130 },
      choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "emit_decision_pack", arguments: JSON.stringify(output) } }] } }],
    }),
  };
}

async function temporaryHistoricalRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "r5b9-"));
  const dir = path.join(root, "docs", "gateway");
  await fs.mkdir(dir, { recursive: true });
  for (const name of [
    "external-model-response-contract-v1.json",
    "phase3c-r5b8-compatibility-decision.md",
    "phase3c-r5b8-provider-serialization-remediation.md",
    "phase3c-r5b8-synthetic-validation-report.md",
    "phase3c-r5b8-tool-schema-analysis.json",
  ]) await fs.copyFile(path.join(ROOT, "docs", "gateway", name), path.join(dir, name));
  return root;
}

test("R5B9 preserves Response Contract v1 byte-for-byte", async () => {
  const value = await fs.readFile(path.join(ROOT, "docs/gateway/external-model-response-contract-v1.json"));
  assert.equal(createHash("sha256").update(value).digest("hex"), V1_HASH);
});

test("Response Contract v2 accepts only approved limitation enum codes", () => {
  const output = validToolOutput();
  assert.equal(validateExternalModelToolArgumentsV2(output, { evidenceTokens: ["SYN-EVIDENCE-001"] }).ok, true);
  assert.deepEqual(output.limitations.codes.every((code) => LIMITATION_CODES.includes(code)), true);
});

test("unknown LimitationCode fails and cannot render", () => {
  const output = validToolOutput();
  output.limitations.codes = ["UNKNOWN_LIMITATION"];
  assert.equal(validateExternalModelToolArgumentsV2(output, { evidenceTokens: ["SYN-EVIDENCE-001"] }).ok, false);
  assert.deepEqual(renderLimitationCodesZh(output.limitations), []);
});

test("additionalProperties fails at nested nodes", () => {
  const output = validToolOutput();
  output.limitations.unapproved = true;
  assert.equal(validateExternalModelToolArgumentsV2(output, { evidenceTokens: ["SYN-EVIDENCE-001"] }).ok, false);
});

test("unknown SafetyPolicyCode fails", () => {
  const output = validToolOutput();
  output.safety.policyCodes.push("UNKNOWN_POLICY");
  assert.equal(validateExternalModelToolArgumentsV2(output, { evidenceTokens: ["SYN-EVIDENCE-001"] }).ok, false);
});

test("approved RAW_TIMELINE_WITHHELD code passes only at limitation path", () => {
  const output = validToolOutput();
  assert.equal(validateScopedOutputSafetyV2(output).ok, true);
  output.facts[0].value = "raw_timeline";
  assert.equal(validateScopedOutputSafetyV2(output).ok, false);
});

test("raw_timeline in Fact fails", () => {
  const output = validToolOutput();
  output.facts[0].value = "The raw_timeline label is present.";
  assert.match(validateScopedOutputSafetyV2(output).errors.join(","), /forbidden_label:\$\.facts\[0\]\.value/);
});

test("raw_timeline in Action basis fails", () => {
  const output = validToolOutput();
  output.recommendedActions[0].basis = "SYN-EVIDENCE-001 raw_timeline";
  assert.match(validateScopedOutputSafetyV2(output).errors.join(","), /recommendedActions\[0\]\.basis/);
});

test("scanner has no global substring allowlist", () => {
  const output = validToolOutput();
  output.fallback.reason = "RAW_TIMELINE_WITHHELD";
  assert.equal(validateScopedOutputSafetyV2(output).ok, false);
});

test("local Chinese limitation mapping is deterministic and filters unknown codes", () => {
  const limitations = { codes: ["RAW_TIMELINE_WITHHELD", "IDENTITY_MASKED", "UNKNOWN"] };
  assert.deepEqual(renderLimitationCodesZh(limitations), ["未向模型提供原始活动记录正文", "客户及联系人身份已脱敏"]);
  assert.deepEqual(renderLimitationCodesZh(limitations), renderLimitationCodesZh(limitations));
});

test("OTHER detail is allowed only with OTHER code and remains safety-scanned", () => {
  const output = validToolOutput();
  output.limitations = { codes: ["OTHER_APPROVED_LIMITATION"], otherCodeDetail: "Synthetic source is limited." };
  assert.equal(validateExternalModelToolArgumentsV2(output, { evidenceTokens: ["SYN-EVIDENCE-001"] }).ok, true);
  delete output.limitations.codes;
  assert.equal(validateExternalModelToolArgumentsV2(output, { evidenceTokens: ["SYN-EVIDENCE-001"] }).ok, false);
  output.limitations = { codes: ["OTHER_APPROVED_LIMITATION"], otherCodeDetail: "raw_timeline" };
  assert.equal(validateExternalModelToolArgumentsV2(output, { evidenceTokens: ["SYN-EVIDENCE-001"] }).ok, false);
});

test("otherCodeDetail without OTHER code fails", () => {
  const output = validToolOutput();
  output.limitations.otherCodeDetail = "Synthetic detail.";
  assert.equal(validateExternalModelToolArgumentsV2(output, { evidenceTokens: ["SYN-EVIDENCE-001"] }).ok, false);
});

test("model output cannot override deterministic health fields", () => {
  const output = validToolOutput();
  output.healthScore = 99;
  assert.equal(validateExternalModelToolArgumentsV2(output, { evidenceTokens: ["SYN-EVIDENCE-001"] }).ok, false);
  assert.equal(validateScopedOutputSafetyV2(output).ok, false);
});

test("synthetic evidence token validates through canonical mapping", () => {
  const canonical = mapExternalModelToolArgumentsToCanonicalV2(validToolOutput(), { evidenceTokens: ["SYN-EVIDENCE-001"] });
  assert.equal(canonical.recommendedActions[0].status, "Draft only");
  assert.equal(validateExternalModelResponseV2(canonical, { evidenceTokens: ["SYN-EVIDENCE-001"] }).ok, true);
});

test("Action basis without a Fact or Evidence reference fails", () => {
  const output = validToolOutput();
  output.recommendedActions[0].basis = "unsupported synthetic basis";
  assert.equal(validateExternalModelToolArgumentsV2(output, { evidenceTokens: ["SYN-EVIDENCE-001"] }).ok, false);
});

test("synthetic inputs are distinct, non-CRM and ineligible for real runtime", () => {
  const inputs = buildR5B9SyntheticInputs();
  assert.equal(inputs.length, 2);
  assert.notEqual(inputs[0].safeContext.opportunityToken, inputs[1].safeContext.opportunityToken);
  for (const input of inputs) {
    const result = validateR5B9SyntheticInput(input);
    assert.equal(result.ready, true);
    assert.equal(input.safeContext.externalCallEligible, false);
    assert.equal(result.realCrmTokenCount, 0);
  }
});

test("R5B9 v5 request is strict, schema-complete and excludes local Chinese labels", () => {
  const request = buildR5B9RequestMeta(buildR5B9SyntheticInputs()[0], { env });
  assert.equal(request.shapeReady, true);
  assert.equal(request.strict, true);
  assert.equal(request.singleTool, true);
  assert.equal(request.responseFormatSent, false);
  assert.deepEqual(request.nodeCompleteness, {
    missingTypeAnyOfRefCount: 0,
    missingRequiredCount: 0,
    missingAdditionalPropertiesCount: 0,
    missingArrayItemsCount: 0,
    unsupportedKeywordCount: 0,
  });
  assert.equal(JSON.stringify(request.body).includes("未向模型提供原始活动记录正文"), false);
});

test("Probe 1 failure prevents Probe 2 and keeps retry/fallback zero", async () => {
  const repoRoot = await temporaryHistoricalRoot();
  let calls = 0;
  try {
    const bad = validToolOutput();
    bad.facts[0].value = "raw_timeline";
    const result = await executeR5B9({ env, repoRoot, fetchImpl: async () => { calls += 1; return providerResponse(bad); } });
    assert.equal(calls, 1);
    assert.equal(result.syntheticProbe1Calls, 1);
    assert.equal(result.syntheticProbe2Calls, 0);
    assert.equal(result.externalLlmCalls, 1);
    assert.equal(result.retryCount, 0);
    assert.equal(result.fixtureFallbackCount, 0);
    assert.equal(result.providerRequestCompatibilityReady, false);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test("two passing Probes complete contracts with a hard two-call maximum", async () => {
  const repoRoot = await temporaryHistoricalRoot();
  let calls = 0;
  try {
    const result = await executeR5B9({
      env,
      repoRoot,
      fetchImpl: async (_url, options) => {
        calls += 1;
        assert.equal(options.method, "POST");
        const request = JSON.parse(options.body);
        const providerInput = JSON.parse(request.messages[1].content);
        const evidenceToken = providerInput.safeDecisionContext.evidenceTokens[0];
        return providerResponse(validToolOutput(evidenceToken));
      },
    });
    assert.equal(calls, 2);
    assert.equal(result.externalLlmCalls, 2);
    assert.equal(result.syntheticProbe1Ready, true);
    assert.equal(result.syntheticProbe2Ready, true);
    assert.equal(result.jsonParseSuccess, 2);
    assert.equal(result.schemaValidationSuccess, 2);
    assert.equal(result.canonicalMappingSuccess, 2);
    assert.equal(result.evidenceValidationSuccess, 2);
    assert.equal(result.safetyValidationSuccess, 2);
    assert.equal(result.providerRequestCompatibilityReady, true);
    assert.equal(result.outputSafetyCompatibilityReady, true);
    assert.equal(result.realCanaryAuthorized, false);
    assert.equal(result.crmWriteback, false);
    assert.equal(result.d365Get, 0);
    assert.equal(result.productionRequests, 0);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test("R5B9 source has no D365, CRM write, production, retry, fallback, or embedded secret path", async () => {
  const source = await fs.readFile(path.join(ROOT, "scripts/run-phase3c-r5b9-structured-safety-probes.mjs"), "utf8");
  assert.equal(/org91f5f65\.crm5\.dynamics\.com|lcn-crm\.crm7\.dynamics\.com/i.test(source), false);
  assert.equal(/sk-[A-Za-z0-9]{20,}/.test(source), false);
  assert.equal(/WinOpportunity|LoseOpportunity|\bPATCH\b|\bDELETE\b|Publish/i.test(source), false);
  assert.equal(/maxAttempts\s*=\s*[2-9]|fixtureFallbackCount:\s*[1-9]/.test(source), false);
});
