import "./designPreview.css";
import type { ReactNode } from "react";
import { designOptions, previewDistributions, previewInsights, safetyLine, type PreviewInsight } from "./designPreviewData";

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "danger" | "warning" | "info" | "neutral" | "safe" }) {
  return <span className={`dp-badge ${tone}`}>{children}</span>;
}

function InsightCard({ insight, compact = false }: { insight: PreviewInsight; compact?: boolean }) {
  return (
    <article className={compact ? "dp-insight compact" : "dp-insight"}>
      <div className="dp-insight-head">
        <strong>{insight.opportunityToken}</strong>
        <span>{insight.customerToken} · {insight.ownerToken}</span>
      </div>
      <div className="dp-badge-row">
        {insight.badges.map((badge) => (
          <Badge key={badge} tone={badge.includes("Risk") || badge === "Overdue" ? "danger" : "warning"}>{badge}</Badge>
        ))}
      </div>
      <dl className="dp-ai-structure">
        <div><dt>Finding</dt><dd>{insight.finding}</dd></div>
        <div><dt>Reason</dt><dd>{insight.reason}</dd></div>
        <div><dt>Evidence</dt><dd>{insight.evidence}</dd></div>
        <div><dt>Action</dt><dd>{insight.action}</dd></div>
        <div><dt>Owner</dt><dd>{insight.ownerToken}</dd></div>
        <div><dt>Urgency</dt><dd>{insight.urgency}</dd></div>
        <div><dt>Safety</dt><dd>{safetyLine}</dd></div>
      </dl>
    </article>
  );
}

function DistributionBars({ data, title }: { data: Array<{ label: string; value: number }>; title: string }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <section className="dp-bars">
      <h4>{title}</h4>
      {data.map((item) => (
        <div key={`${title}-${item.label}`}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <i style={{ width: `${Math.max(10, (item.value / max) * 100)}%` }} />
        </div>
      ))}
    </section>
  );
}

function OptionMeta({ id }: { id: "a" | "b" | "c" | "d" }) {
  const option = designOptions.find((item) => item.id === id)!;
  return (
    <aside className="dp-option-meta">
      <div>
        <Badge tone={option.recommendation === "Highest" ? "safe" : "info"}>Recommendation: {option.recommendation}</Badge>
      </div>
      <p><strong>适合谁：</strong>{option.bestFor}</p>
      <p><strong>优点：</strong>{option.pros.join(" / ")}</p>
      <p><strong>缺点：</strong>{option.cons.join(" / ")}</p>
    </aside>
  );
}

function ManagementCommandCenter() {
  return (
    <section className="dp-option dp-command">
      <header className="dp-option-title">
        <div><span>方案 A</span><h2>Management Command Center</h2><p>管理层默认首页，先看关注队列，再看原因和动作。</p></div>
        <Badge tone="safe">{safetyLine}</Badge>
      </header>
      <div className="dp-exec-summary">
        <strong>AI Executive Summary</strong>
        <p>今日建议管理层重点关注 8 个案件：其中 3 个逾期、2 个金额区间为 10M+、4 个存在价格压力或决裁人不清。</p>
      </div>
      <div className="dp-command-grid">
        <section className="dp-panel main">
          <h3>Management Attention Queue</h3>
          {previewInsights.map((insight) => <InsightCard compact insight={insight} key={insight.opportunityToken} />)}
        </section>
        <section className="dp-panel">
          <h3>Why It Matters / Evidence</h3>
          <ul className="dp-evidence-list">
            <li><strong>Overdue + High:</strong> expectedOrderStatus and priority trigger management attention.</li>
            <li><strong>Cost Pressure:</strong> customerNeed and proposalContent show competitive pricing pressure.</li>
            <li><strong>Decision Gap:</strong> decisionMakerStatus is not clear enough for late-stage deals.</li>
          </ul>
        </section>
        <section className="dp-panel">
          <h3>Recommended Actions</h3>
          <ol className="dp-action-list">
            <li>Prepare cost breakdown for OPP-AIDEMO-014.</li>
            <li>Confirm decision path for high amount opportunities.</li>
            <li>Review overdue quote feedback before weekly sales meeting.</li>
          </ol>
        </section>
      </div>
      <div className="dp-distribution-row">
        <DistributionBars title="Department Risk Distribution" data={previewDistributions.departments} />
        <DistributionBars title="Stage Risk Distribution" data={previewDistributions.stages} />
      </div>
      <OptionMeta id="a" />
    </section>
  );
}

function AiWorkbench() {
  const selected = previewInsights[0];
  return (
    <section className="dp-option dp-workbench">
      <header className="dp-option-title">
        <div><span>方案 B</span><h2>AI Workbench</h2><p>销售管理 AI 工作台，队列、下一步动作、单案简报同屏。</p></div>
        <Badge tone="safe">{safetyLine}</Badge>
      </header>
      <div className="dp-today-summary">AI 今日总结：优先处理逾期报价、价格压力和决策人不清三类案件。</div>
      <div className="dp-workbench-grid">
        <section className="dp-panel">
          <h3>Risk / Opportunity Queue</h3>
          {previewInsights.map((item) => (
            <button className="dp-queue-item" key={item.opportunityToken}>
              <strong>{item.opportunityToken}</strong>
              <span>{item.opportunityStage} · {item.estimatedQuoteBand}</span>
              <small>{item.badges.slice(0, 2).join(" / ")}</small>
            </button>
          ))}
        </section>
        <section className="dp-panel action">
          <h3>Next Best Action Board</h3>
          {previewInsights.map((item, index) => (
            <article className="dp-action-card" key={item.opportunityToken}>
              <strong>#{index + 1} {item.action}</strong>
              <span>{item.ownerToken} · {item.urgency}</span>
            </article>
          ))}
        </section>
        <section className="dp-panel">
          <h3>Selected Deal Brief</h3>
          <InsightCard insight={selected} />
        </section>
      </div>
      <div className="dp-mini-row">
        <span>Safe Context Enabled</span>
        <span>Data Quality Warnings: {previewInsights.flatMap((item) => item.dataQualityFlags).length}</span>
        <span>Provider: demoProvider / rule-based</span>
      </div>
      <OptionMeta id="b" />
    </section>
  );
}

function RiskOperationsBoard() {
  return (
    <section className="dp-option dp-risk">
      <header className="dp-option-title">
        <div><span>方案 C</span><h2>Risk Operations Board</h2><p>风险运营中心，突出风险驱动、风险矩阵和缓解动作。</p></div>
        <Badge tone="safe">{safetyLine}</Badge>
      </header>
      <div className="dp-risk-layout">
        <section className="dp-panel">
          <h3>Risk Driver Summary</h3>
          <DistributionBars title="Risk Drivers" data={previewDistributions.riskDrivers} />
        </section>
        <section className="dp-panel matrix">
          <h3>Risk Matrix</h3>
          <div className="dp-risk-matrix">
            {["L1", "L2", "L3", "L4", "L5"].map((stage) => (
              <span key={stage}>{stage}</span>
            ))}
            {["Low", "Medium", "High", "Critical"].map((risk, row) => (
              ["2", "5", "8", "12", "3"].map((count, col) => (
                <b className={row > 1 ? "hot" : ""} key={`${risk}-${col}`}>{risk} {count}</b>
              ))
            ))}
          </div>
        </section>
        <section className="dp-panel">
          <h3>Top Risk Cases</h3>
          {previewInsights.map((item) => <InsightCard compact insight={item} key={item.opportunityToken} />)}
        </section>
      </div>
      <section className="dp-panel mitigation">
        <h3>Mitigation Actions / Owner Follow-up</h3>
        <div className="dp-mitigation-grid">
          {previewInsights.map((item) => (
            <article key={item.opportunityToken}>
              <strong>{item.ownerToken}</strong>
              <p>{item.action}</p>
              <small>{item.evidence}</small>
            </article>
          ))}
        </div>
      </section>
      <OptionMeta id="c" />
    </section>
  );
}

function MinimalExecutiveBriefing() {
  return (
    <section className="dp-option dp-minimal">
      <header className="dp-option-title">
        <div><span>方案 D</span><h2>Minimal Executive Briefing</h2><p>极简管理层简报，只保留 Top 5 和本周动作。</p></div>
        <Badge tone="safe">{safetyLine}</Badge>
      </header>
      <section className="dp-briefing-summary">
        <strong>AI Summary</strong>
        <p>本周管理层重点看 5 个案件：主要风险来自逾期报价、低受注确度、价格压力和决裁人不清。</p>
      </section>
      <div className="dp-briefing-grid">
        <section className="dp-panel">
          <h3>Top 5 Attention Deals</h3>
          {previewInsights.map((item, index) => (
            <article className="dp-minimal-deal" key={item.opportunityToken}>
              <strong>{index + 1}. {item.opportunityToken}</strong>
              <p>{item.finding}</p>
            </article>
          ))}
        </section>
        <section className="dp-panel">
          <h3>This Week Management Actions</h3>
          <ol className="dp-action-list">
            {previewInsights.map((item) => <li key={item.opportunityToken}>{item.action}</li>)}
          </ol>
        </section>
      </div>
      <div className="dp-three-charts">
        <DistributionBars title="Stage" data={previewDistributions.stages.slice(0, 3)} />
        <DistributionBars title="Department" data={previewDistributions.departments.slice(0, 3)} />
        <DistributionBars title="Driver" data={previewDistributions.riskDrivers.slice(0, 3)} />
      </div>
      <OptionMeta id="d" />
    </section>
  );
}

export default function DesignPreview() {
  return (
    <main className="design-preview">
      <header className="dp-hero">
        <div>
          <p>Static design preview · no Dataverse write · demoProvider only</p>
          <h1>CRM AI Gateway {"->"} AI Sales Action Workbench</h1>
          <span>Action-first IA: which deals need attention, why, and who should do what next.</span>
        </div>
        <a href="/">Back to current app</a>
      </header>
      <section className="dp-map">
        <strong>IA Sitemap</strong>
        <span>AI Cockpit</span>
        <span>Risk Radar</span>
        <span>Action Board</span>
        <span>Deal Brief</span>
        <span>Opportunities</span>
        <span>Safety Gateway</span>
      </section>
      <ManagementCommandCenter />
      <AiWorkbench />
      <RiskOperationsBoard />
      <MinimalExecutiveBriefing />
    </main>
  );
}
