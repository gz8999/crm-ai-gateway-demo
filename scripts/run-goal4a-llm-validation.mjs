import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../server/dynamicsClient.mjs";
import { createFrozenDatasetRuntimeService } from "../server/d365/frozenDatasetRuntimeService.mjs";
import { createNarrativeService } from "../server/narrative/narrativeService.mjs";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "docs", "demo");
const SNAPSHOT_PATH = path.join(ROOT, "server", "data", "validated-llm-narrative-snapshots.json");
const REAL_CANARY = "DEMO-OPP-002";
const SCENARIOS = [
  { id: "stalled-high-value", token: "DEMO-OPP-026", requiredRisk: "STALLED_PROGRESS" },
  { id: "budget-actual-gap", token: "DEMO-OPP-012", requiredRisk: "FINANCIAL_VARIANCE" },
  { id: "data-contradiction", token: "DEMO-OPP-008", requiredRisk: "DATA_CONTRADICTION" },
  { id: "growth-opportunity", token: "DEMO-OPP-001", requiredSummary: "GROWTH_POTENTIAL" },
  { id: "location-route-risk", token: "DEMO-OPP-046", requiredRisk: "ROUTE_REVIEW" },
  { id: "meeting-prep", token: "DEMO-OPP-017", requiredRisk: "MEETING_PREPARATION" },
  { id: "multi-risk-priority", token: "DEMO-OPP-056", requiredRisk: "MULTI_RISK_REVIEW" },
  { id: "healthy-control", token: "DEMO-OPP-030", healthy: true },
];
const CONTINUE_ONLY = process.env.GOAL4A_CONTINUE === "true";
const PRIOR_EXTERNAL_CALLS = 11;

const externalEnv = { ...process.env, ALLOW_EXTERNAL_AI: "true" };
const d365Env = { ...process.env, AI_PROVIDER: "demo", ALLOW_EXTERNAL_AI: "false" };
const counters = { externalCalls: 0, retries: 0, fallback: 0 };
const observations = [];

function providerFetch(input, init) {
  counters.externalCalls += 1;
  if (counters.externalCalls > 16) throw new Error("Goal 4A external call budget exceeded");
  return fetch(input, init);
}

function safeResult(result) {
  return {
    ok: Boolean(result?.ok),
    reason: result?.reason || "",
    requestToken: result?.requestToken || "",
    correlation: result?.correlation || "",
    requestBodyHash: result?.providerResult?.requestBodyHash || result?.requestBodyHash || "",
    requestSchemaHash: result?.providerResult?.requestSchemaHash || result?.requestSchemaHash || "",
    observation: result?.providerResult?.observation || result?.providerResult?.errorObservation || result?.observation || null,
    selection: result?.selection || null,
    inputSafety: result?.inputSafety || null,
  };
}

function syntheticView() {
  return {
    safeContext: {
      opportunityToken: "SYN-OPP-001",
      customerToken: "SYN-CUST-001",
      salesDepartment: "SYN-DEPT-01",
      opportunityState: "Active",
      stage: "Qualify",
      priority: "Medium",
      stagnationBand: "active",
      amountBand: "band-medium",
      marginBand: "band-medium",
      varianceCategory: "stable",
      relativeDate: "relative",
      relativeDateStatus: "current",
      routeConsistency: "consistent",
      decisionReadiness: "high",
      meetingWindow: "none",
      coverageCategory: "broad",
      trend: "stable",
      actualBand: "band-medium",
      dataQualityCodes: [],
      contradictionCodes: [],
      interactionSignal: "complete",
      evidenceTokens: ["SYN-EVID-001", "SYN-EVID-002"],
      accountAggregate: { opportunityTrend: "stable", relationshipMaturity: "established" },
    },
    healthScore: { healthScore: 84, grade: "A", dimensions: { pipeline: 84, completeness: 86, profitability: 82, engagement: 88, risk: 80, confidence: 86 } },
  };
}

function scenarioCheck(selection, plan, view) {
  const risk = selection?.riskExplanationCodes || [];
  if (plan.healthy) return !risk.includes("HIGH_RISK_REVIEW") && !risk.includes("MULTI_RISK_REVIEW") && selection?.summaryCode !== "HIGH_RISK_REVIEW";
  if (plan.id === "data-contradiction") return risk.includes("DATA_CONTRADICTION") || (view?.safeContext?.contradictionCodes?.length > 0 && selection?.limitationCodes?.includes("HUMAN_REVIEW_REQUIRED"));
  if (plan.requiredRisk) return risk.includes(plan.requiredRisk);
  return selection?.summaryCode === plan.requiredSummary;
}

async function writeJson(file, value) {
  await fs.writeFile(path.join(REPORT_DIR, file), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function writeMarkdown(file, body) {
  await fs.writeFile(path.join(REPORT_DIR, file), `${body.trim()}\n`, { mode: 0o600 });
}

async function main() {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const preflight = {
    providerConfigured: Boolean(externalEnv.LLM_BASE_URL && externalEnv.LLM_API_KEY && externalEnv.LLM_MODEL),
    externalAuthorization: externalEnv.ALLOW_EXTERNAL_AI === "true",
    browserDirectCalls: 0,
    crmWriteback: false,
    productionRequests: 0,
    retryCount: counters.retries,
    fallbackCount: counters.fallback,
    syntheticInput: { testOnly: true, syntheticProbe: true, d365Record: false, runtimeEligible: false, realCanary: false, realCrmTokenCount: 0, forbiddenFieldCount: 0 },
  };
  if (!preflight.providerConfigured) throw new Error("Goal 4A provider configuration is incomplete; no external call was issued.");

  const client = createDynamicsClient({ env: d365Env });
  const frozen = createFrozenDatasetRuntimeService({ client, env: d365Env, root: ROOT });
  const narrative = createNarrativeService({
    env: externalEnv,
    root: ROOT,
    snapshotPath: SNAPSHOT_PATH,
    frozenOpportunityLoader: (token) => frozen.getOpportunity({ opportunityToken: token, department: "all", amountMode: "range" }),
  });

  const syntheticResults = [];
  let canaryResult = { ok: true, skipped: CONTINUE_ONLY, reason: CONTINUE_ONLY ? "previously_passed_in_prior_run" : "" };
  if (!CONTINUE_ONLY) {
    for (const requestToken of ["GOAL4A-R5-SYN-01", "GOAL4A-R5-SYN-02"]) {
      const result = await narrative.execute({ view: syntheticView(), token: "SYN-OPP-001", requestToken, phase: "synthetic", testOnly: true, syntheticProbe: true, d365Record: false, runtimeEligible: false, realCanary: false, fetchImpl: providerFetch });
      syntheticResults.push(safeResult(result));
      if (!result.ok) throw new Error(`Synthetic validation failed at ${requestToken}: ${result.reason || "unknown"}`);
    }
    if (syntheticResults[0].requestBodyHash !== syntheticResults[1].requestBodyHash) throw new Error("Synthetic request body hashes are not repeatable.");
    const canaryView = await frozen.getOpportunity({ opportunityToken: REAL_CANARY, department: "all", amountMode: "range" });
    const canary = await narrative.execute({ view: canaryView, token: REAL_CANARY, requestToken: "GOAL4A-R5-REAL-CANARY-002", phase: "real-canary", testOnly: false, syntheticProbe: false, d365Record: true, runtimeEligible: true, realCanary: true, fetchImpl: providerFetch });
    canaryResult = safeResult(canary);
    if (!canary.ok) throw new Error(`Real contract canary failed: ${canary.reason || "unknown"}`);
  }

  const scenarioResults = [];
  const scenarioPlans = CONTINUE_ONLY ? SCENARIOS.slice(3) : SCENARIOS;
  for (const plan of scenarioPlans) {
    const view = await frozen.getOpportunity({ opportunityToken: plan.token, department: "all", amountMode: "range" });
    if (!view) throw new Error(`Scenario opportunity unavailable: ${plan.token}`);
    const result = await narrative.execute({ view, token: plan.token, requestToken: `GOAL4A-R5-SCENARIO-${plan.id}`, phase: "scenario", testOnly: false, syntheticProbe: false, d365Record: true, runtimeEligible: true, realCanary: true, fetchImpl: providerFetch });
    const safe = safeResult(result);
    const passed = Boolean(result.ok && scenarioCheck(result.selection, plan, view));
    scenarioResults.push({ scenario: plan.id, opportunityToken: plan.token, passed, selection: safe.selection, result: safe });
    if (!result.ok) throw new Error(`Scenario contract failed: ${plan.id}`);
  }

  await narrative.persist();
  const runtimeStatus = await frozen.getRuntimeStatus();
  const narrativeStatus = await narrative.status();
  const cumulativeExternalCalls = CONTINUE_ONLY ? PRIOR_EXTERNAL_CALLS + counters.externalCalls : counters.externalCalls;
  const fullScenarioReady = scenarioResults.length === SCENARIOS.length && scenarioResults.every((item) => item.passed);
  const snapshotReady = narrativeStatus.validatedSnapshotCount === SCENARIOS.length;
  const externalLayerReady = fullScenarioReady && snapshotReady;
  const publicManifest = {
    version: "goal4a-validated-llm-snapshot-manifest-v1",
    contractVersion: narrativeStatus.contractVersion,
    providerProfile: narrativeStatus.providerProfile,
    snapshotCount: narrativeStatus.validatedSnapshotCount,
    priorScenarioCallsNotPersisted: CONTINUE_ONLY ? ["stalled-high-value", "budget-actual-gap", "data-contradiction"] : [],
    snapshotTokens: narrativeStatus.validatedTokens,
    realContractCanary: REAL_CANARY,
    syntheticRepeatability: CONTINUE_ONLY
      ? { calls: 2, completedInPriorRun: true, byteStable: true }
      : { calls: syntheticResults.length, requestBodyHash: syntheticResults[0]?.requestBodyHash || "", byteStable: true },
    liveDemo: { approvedToken: narrativeStatus.liveApprovedToken, explicitUserConfirmation: true, automaticRun: false, callUsed: narrativeStatus.liveCallUsed },
    safety: { rawCrmExposure: 0, exactAmountExposure: 0, rawTimelineExposure: 0, crmWriteback: false, productionRequests: 0 },
  };
  await writeJson("goal4a-llm-snapshot-manifest.json", publicManifest);
  await writeJson("goal4a-llm-provider-validation.json", { preflight, synthetic: syntheticResults, realCanary: canaryResult, scenarioCount: scenarioResults.length, externalCalls: cumulativeExternalCalls, newExternalCalls: counters.externalCalls, retries: counters.retries, fallback: counters.fallback, externalLayerReady });
  await writeJson("goal4a-eight-scenario-validation.json", { scenarios: scenarioResults.map(({ scenario, opportunityToken, passed, selection }) => ({ scenario, opportunityToken, passed, selection })), priorScenarioCallsNotPersisted: CONTINUE_ONLY ? ["stalled-high-value", "budget-actual-gap", "data-contradiction"] : [], coverage: { scenarios: 8, departments: 7, states: ["Won", "Active", "Lost"], grades: ["S", "A", "B", "C", "D"] } });
  await writeMarkdown("goal4a-llm-provider-validation.md", `# Goal 4A 外部 LLM 受控验证\n\n- 新独立合同：${narrativeStatus.contractVersion}\n- Synthetic Probe：${CONTINUE_ONLY ? "2/2（前序运行已通过，本次未重试）" : "2/2，通过请求哈希一致性校验"}\n- Real Contract Canary：${REAL_CANARY}，${CONTINUE_ONLY ? "前序运行已通过，本次未重试" : "1/1"}\n- 八场景验证：${fullScenarioReady ? "8/8" : `本次 ${scenarioResults.length}/8；全量未完成`}\n- 可持久化快照：${narrativeStatus.validatedSnapshotCount}/8\n- 外部调用总数：${cumulativeExternalCalls}/16（本次新增 ${counters.externalCalls}）\n- Retry：0\n- Automatic Fallback：0\n- CRM Writeback：false\n- Raw CRM / Exact Amount / Raw Timeline：0 / 0 / 0\n\n${CONTINUE_ONLY ? "前序三条场景调用未形成持久化快照，本次不追认其结果；需独立授权后续补偿验证。" : ""}\nProvider 原始响应、Tool Arguments、客户身份、GUID 和精确金额不写入公开产物。`);
  await writeMarkdown("goal4a-real-canary-report.md", `# Goal 4A Real Contract Canary\n\n目标记录：\`${REAL_CANARY}\`\n\n- 结果：前序受控运行通过\n- 本次动作：${CONTINUE_ONLY ? "未重试" : "执行一次"}\n- 合同：${narrativeStatus.contractVersion}\n- Provider Profile：${narrativeStatus.providerProfile}\n- Health Score 与 Grade：由确定性引擎保留，不由模型覆盖\n- Evidence：仅使用 Safe Context allowlist\n- CRM Writeback：false\n`);
  await writeMarkdown("goal4a-eight-scenario-validation.md", `# Goal 4A 八场景验证\n\n八个场景均使用正式 D365 Frozen Dataset 记录，模型只返回代码选择，服务器确定性展开文本。\n\n${scenarioResults.map((item) => `- ${item.scenario}: ${item.opportunityToken} · ${item.passed ? "通过" : "契约通过但场景语义门禁未通过"}`).join("\n")}\n\n${CONTINUE_ONLY ? "本次仅执行剩余五条；前序 stalled-high-value、budget-actual-gap、data-contradiction 已调用但未持久化，本报告不将其标记为已验证。" : ""}\n\n健康对照不允许被标为 High/Critical；所有输出继续受 Evidence 与 Safe Context 门禁约束。`);
  await writeMarkdown("gateway-final-completion-report.md", `# CRM AI Gateway Planned Function Completion\n\n- D365 Frozen Dataset：${runtimeStatus.recordCount} 条 Opportunity\n- 显式数据集：3900 条\n- Deterministic Decision Layer：Ready\n- Validated External LLM Layer：${externalLayerReady ? "Ready" : "Pending：需要补齐未持久化的场景快照"}\n- Narrative Snapshot：${narrativeStatus.validatedSnapshotCount}/8 条\n- Live Demo：仅允许用户主动确认的单条调用，当前未自动执行\n- CRM Writeback：false\n- Production Requests：0\n- External LLM Calls：${cumulativeExternalCalls}/16\n\nHealth Score、CRM Facts、Evidence、Priority 和 Portfolio KPI 始终以确定性引擎为准。`);
  await fs.writeFile(path.join(ROOT, "server", "data", "goal4a-validation-ledger.json"), `${JSON.stringify({ version: "goal4a-validation-ledger-v1", externalCalls: cumulativeExternalCalls, newExternalCalls: counters.externalCalls, requestTokens: ["GOAL4A-R5-SYN-01", "GOAL4A-R5-SYN-02", "GOAL4A-R5-REAL-CANARY-002", ...SCENARIOS.map((item) => `GOAL4A-R5-SCENARIO-${item.id}`)], safety: publicManifest.safety }, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ok: true, externalCalls: cumulativeExternalCalls, newExternalCalls: counters.externalCalls, synthetic: CONTINUE_ONLY ? 2 : syntheticResults.length, realCanary: canaryResult.ok, scenarios: scenarioResults.length, snapshots: narrativeStatus.validatedSnapshotCount, externalLayerReady, d365: runtimeStatus.recordCount, requestStats: runtimeStatus.requestStats }, null, 2));
}

main().catch(async (error) => {
  const safeMessage = error instanceof Error ? error.message : "Goal 4A validation stopped";
  await writeMarkdown("goal4a-llm-validation-stop.md", `# Goal 4A 外部验证停止\n\n- 原因：${safeMessage.replaceAll(/秘密|密钥|Authorization/gu, "安全原因") }\n- External LLM Calls：${counters.externalCalls}\n- Retry：${counters.retries}\n- Automatic Fallback：${counters.fallback}\n- CRM Writeback：false\n- Production Requests：0\n`);
  console.error(safeMessage);
  process.exitCode = 1;
});
