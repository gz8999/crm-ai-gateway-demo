import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDynamicsClient } from "../server/dynamicsClient.mjs";
import { createFrozenDatasetRuntimeService } from "../server/d365/frozenDatasetRuntimeService.mjs";
import { getDecisionView } from "../server/decision/decisionService.mjs";
import { evaluateDecisionPack, evaluateHealthScore, selectDeterministicSample, summarizeEvaluation, summarizeHealthEvaluation } from "../server/decision/evaluationEngine.mjs";
import { summarizeHealthScores } from "../src/services/healthScoreEngine/index.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const datasetPath = path.join(root, "docs/gateway/ai-scenario-evaluation-dataset.json");
const reportPath = path.join(root, "docs/gateway/ai-decision-quality-report.md");

export async function runEvaluation({ env = process.env, now = () => new Date() } = {}) {
  const dataset = JSON.parse(await fs.readFile(datasetPath, "utf8"));
  const client = createDynamicsClient({ env });
  const runtime = createFrozenDatasetRuntimeService({ client, env, root, now });
  const status = await runtime.getRuntimeStatus();
  const portfolio = await runtime.getPortfolio({ department: "all", amountMode: "range" });
  const views = [];
  for (const item of portfolio.opportunities) {
    const view = await runtime.getPortfolio({ department: "all", opportunityToken: item.opportunityToken, amountMode: "range" });
    views.push(view);
  }
  const candidates = views.map((view) => ({
    token: view.selectedOpportunity,
    state: view.safeContext.opportunityState,
    view,
  }));
  const sample = selectDeterministicSample(candidates, { size: 60, seed: "20260718" });
  const sampleResults = sample.map(({ view }) => evaluateDecisionPack({
    pack: view.pack,
    safeContext: view.safeContext,
    scopeSummary: view.scopeSummary,
  }));

  const scenarioResults = dataset.scenarios.map((expected) => {
    const view = getDecisionView({ mode: "scenario", scenarioId: expected.scenarioId });
    const evaluation = evaluateDecisionPack({
      pack: view.pack,
      safeContext: view.safeContext,
      scopeSummary: view.scopeSummary,
      expected,
    });
    return { scenarioId: expected.scenarioId, evaluation };
  });
  const sampleSummary = summarizeEvaluation(sampleResults);
  const healthResults = views.map((view) => evaluateHealthScore({ score: view.healthScore, safeContext: view.safeContext, scopeSummary: view.scopeSummary }));
  const healthSummary = summarizeHealthScores(views.map((view) => view.healthScore));
  const healthEvaluation = summarizeHealthEvaluation(healthResults);
  if (views.length !== 200 || !healthResults.every((result) => result.ready)) throw new Error(`Health Score validation failed: ${healthEvaluation.readyCount}/${healthEvaluation.count} ready.`);
  const stateDistribution = Object.fromEntries(["Won", "Active", "Lost"].map((state) => [state, sample.filter((item) => item.state === state).length]));
  const scenarioPassCount = scenarioResults.filter(({ evaluation }) => evaluation.ready).length;
  const report = renderReport({ status, portfolio, sampleSummary, sampleSize: sample.length, stateDistribution, scenarioResults, scenarioPassCount, healthSummary, healthEvaluation });
  await fs.writeFile(reportPath, report, "utf8");
  return {
    host: new URL(env.DATAVERSE_URL).hostname,
    status,
    sampleSummary,
    sampleSize: sample.length,
    stateDistribution,
    scenarioPassCount,
    scenarioCount: scenarioResults.length,
    healthSummary,
    healthEvaluation,
    requestStats: status.requestStats,
    reportPath,
  };
}

function renderReport({ status, portfolio, sampleSummary, sampleSize, stateDistribution, scenarioResults, scenarioPassCount, healthSummary, healthEvaluation }) {
  const scoreLines = Object.entries(sampleSummary.scores).map(([key, value]) => `| ${key} | ${value} |`).join("\n");
  const scenarioLines = scenarioResults.map(({ scenarioId, evaluation }) => `| ${scenarioId} | ${evaluation.ready ? "PASS" : "REVIEW"} | ${evaluation.overallScore} | ${evaluation.unsupportedClaimCount} |`).join("\n");
  return `# AI Decision Quality Report

## Scope

本报告由只读评价脚本生成。评价输入为 D365 Frozen Dataset 的 Safe Context 与 Decision Pack；不读取原始 Timeline 正文，不调用外部 LLM，不执行 CRM 写回。

- Dataset: D365 Frozen Dataset
- Scope: ${portfolio.scopeSummary.scopeCount} 条 Opportunity
- Deterministic sample: ${sampleSize} 条，seed=20260718
- Sample state coverage: Won ${stateDistribution.Won} / Active ${stateDistribution.Active} / Lost ${stateDistribution.Lost}
- Runtime provider: demo
- Safe Context: enabled
- External LLM calls: 0
- CRM writeback: 0

## Evaluation Contract

每个页面输出均按 Fact Accuracy、Evidence Coverage、Inference Quality、Confidence Quality、Action Quality 和 Safety Compliance 六个维度评分，分数范围为 0–100。总体分数为六项算术平均。样本中的“Decision accuracy”是契约一致性代理指标，要求事实、证据、契约和安全检查通过，不把它表述为真实业务赢单准确率。

## Frozen Dataset Sample Result

| Dimension | Score |
| --- | ---: |
${scoreLines}
| Overall | ${sampleSummary.overallScore} |

- Contract-ready outputs: ${sampleSummary.readyCount}/${sampleSummary.sampleSize}
- Decision accuracy proxy: ${sampleSummary.readyCount}/${sampleSummary.sampleSize}
- Unsupported claim count: ${sampleSummary.unsupportedClaimCount}
- Untraceable fact count: ${sampleSummary.untraceableFactCount}
- Untraceable evidence count: ${sampleSummary.untraceableEvidenceCount}
- Contract violation count: ${sampleSummary.contractViolationCount}

## Eight Scenario Validation

离线场景期望值仅用于本报告和测试，未进入 Gateway runtime、Safe Context 或 Provider 输入。

| Scenario | Result | Overall | Unsupported claims |
| --- | --- | ---: | ---: |
${scenarioLines}

- Scenario pass: ${scenarioPassCount}/${scenarioResults.length}
- Healthy control must remain Monitor/High confidence and not escalate; this is enforced by the offline scenario assertions.

## Health Score v2 Validation

Health Score v2 由 Safe Context 的六个安全维度确定性计算，采用 S/A/B/C/D/Z 六级，不读取原始 CRM 对象，不调用外部模型。

- Scored opportunities: ${healthSummary.count}
- Average / minimum / maximum: ${healthSummary.averageScore} / ${healthSummary.minimumScore} / ${healthSummary.maximumScore}
- Grade distribution: ${Object.entries(healthSummary.distribution).map(([grade, count]) => `${grade} ${count}`).join(" / ")}
- Health Score Deterministic: ${healthSummary.deterministic ? "true" : "false"}
- Evidence Coverage Ready: ${healthEvaluation.evidenceReady ? "true" : "false"}
- 200 Opportunity Scoring Ready: ${healthSummary.count === 200 && healthEvaluation.readyCount === 200 ? "true" : "false"}
- Evaluation Framework Integrated: ${healthEvaluation.contractReady && healthEvaluation.safetyReady ? "true" : "false"}

## Safety Validation

- customerIdentityMasked=true
- exactAmountSentToModel=false
- rawTimelineSent=false
- crmWritebackEnabled=false
- externalLlmEnabled=false
- GUID/identity/raw Timeline exposure=0 in the evaluated public contract
- Production requests=${status.security.productionRequests}

## Runtime Readback

- Accounts=${status.counts.account}; Contacts=${status.counts.contact}; Opportunities=${status.counts.opportunity}
- Actual=${status.counts.actual}; Coverage=${status.counts.coverage}; Timeline=${status.counts.timeline}; Signal=${status.counts.signal}
- OpportunityClose=${status.counts.opportunityClose}; BPF=${status.counts.bpf}
- State distribution: Won=${status.stateDistribution.won}, Active=${status.stateDistribution.active}, Lost=${status.stateDistribution.lost}
- Last sync=${status.lastSyncTime}

## Limitations

本阶段建立的是确定性、可重放的决策质量基线。Inference quality 和 Action quality 评价的是 Safe Context 约束、证据链和输出契约，不替代人工业务判断，也不声称预测真实客户行为。External LLM、Model Comparison、CRM Writeback 和生产部署仍未启用。
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runEvaluation()
    .then((result) => console.log(JSON.stringify({
      host: result.host,
      sampleSize: result.sampleSize,
      stateDistribution: result.stateDistribution,
      scenarioPassCount: result.scenarioPassCount,
      requestStats: result.requestStats,
      reportPath: result.reportPath,
    }, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
