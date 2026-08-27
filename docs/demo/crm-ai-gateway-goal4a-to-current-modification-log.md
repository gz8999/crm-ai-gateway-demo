# CRM AI Gateway 修改日志

## 记录范围

本日志从 `GOAL — CRM AI Gateway Planned Function Completion & Executive Demo Freeze` 对应的提交 `0933b2f` 开始，记录至当前工作树最后一次 Timeline 管理层综合分析改造。

本日志区分三种状态：

- **已提交**：已经进入 Git commit。
- **工作树修改**：已在本地修改或新增，但尚未形成新的 Git commit。
- **仅运行验证**：执行过验证，但不代表已经完成全量外部调用、全量数据分析或生产发布。

本日志不把以下内容当作已完成事项：200 条商机全量外部分析、模型对比、CRM 写回、生产部署、D365 写入、Cleanup，以及未授权的批量模型调用。

## 1. GOAL 4A：确定性 Executive Demo 冻结

**时间**：2026-07-20  
**提交**：`0933b2f Prepare deterministic executive demo release candidate`  
**状态**：已提交

### 主要修改

- 冻结 D365 Demo 数据规模：60 Account、120 Contact、200 Opportunity、240 ServiceCoverage、130 ActualManagement、1800 Timeline、1350 InteractionSignal，共 3900 条显式业务记录。
- 冻结 Opportunity 状态分布：Won/Active/Lost=`91/100/9`。
- 将 Health Score v2、S/A/B/C/D/Z、CRM Fact、Evidence、Priority 和 Portfolio KPI 固定为服务端确定性结果，不依赖外部模型。
- 完成七个正式业务页面的演示路径：AI Cockpit、Risk & Priority、Opportunity 360、Action Board、Meeting Copilot、Portfolio Intelligence、Audit & Safety。
- 保持 D365 Frozen Dataset 的 GET-only、测试环境和 Pilot/allowlist 边界；Local Fixture 只能显式选择，不能静默 fallback。
- 保持外部模型入口为显式、人工确认、单条调用；不自动运行、不自动重试、不写回 CRM。
- 增加 Executive Demo 合同、演示商机选择、运行手册、安全声明、浏览器验收和外部 AI 延后技术待办。

### 关键文件

- `server/decision/executiveDemoContract.mjs`
- `server/pilot/pilotRuntimeService.mjs`
- `server/d365/frozenDatasetRuntimeService.mjs`
- `src/App.tsx`
- `src/decision/DecisionWorkspace.tsx`
- `src/decision/AuditSafetyPage.tsx`
- `docs/demo/executive-demo-final-acceptance.md`
- `docs/demo/executive-demo-runbook.md`
- `tests/goal4a-executive-demo-release.test.mjs`

## 2. Goal 4A：外部模型受控验证与安全停止

**时间**：2026-07-20  
**状态**：验证记录和报告已生成；没有把外部模型结果升级为默认运行依赖

### 实际结果

- 外部模型受控验证累计调用 `16/16`。
- `Retry=0`，Automatic Fallback=`0`。
- 八场景验证最终只形成 `5/8` 条可持久化外部快照；前序未形成快照的结果不追认。
- 在 `data-contradiction` 场景语义门禁不通过后安全停止；后续只执行授权范围内尚未执行的五个场景。
- 原始模型响应、Tool Arguments、Safe Context、客户身份、GUID 和精确金额没有写入公开报告。
- `CRM Writeback=false`，`Production Requests=0`。

### 结论

- 确定性 Executive Demo 可用。
- 外部模型叙事验证没有达到完整发布条件。
- 外部模型不能作为默认决策来源，也没有转入 200 条商机批量分析。

### 关键记录

- `docs/demo/gateway-final-completion-report.md`
- `docs/demo/goal4a-llm-validation-stop.md`
- `docs/demo/goal4a-llm-provider-validation.md`
- `docs/demo/goal4a-llm-snapshot-manifest.json`
- `scripts/run-goal4a-llm-validation.mjs`

## 3. Deep Analysis：从入口预留到可运行分析

**状态**：已进入 `a1a969c` 检查点提交，后续仍有工作树修改

### 主要修改

- 增加 DA-01 至 DA-09 模板注册和 feature gate。
- 建立“选择模板 → 生成范围预览 → 用户确认 → 执行分析”的显式流程。
- 增加 Deep Analysis 页面、进度、结果和安全护栏组件。
- 区分 Deterministic Demo Provider 与 External Provider。
- 统一输出 Fact、Inference、Evidence、Confidence、Action 和 Limitations。
- 增加 Schema、Safety、Evidence 引用和禁止主张校验。
- 外部模型失败时 fail-closed，不自动切回 Fixture，不写回 CRM。
- Provider Secret 只在服务端使用，不进入浏览器 Bundle。

### 解决的问题

此前“深度分析不可用”或只显示空结构，主要由以下条件共同造成：

1. 功能入口默认受开关控制；
2. 外部 Provider 未配置或未通过安全/合同验证时，服务会明确拒绝执行；
3. 旧输出合同以结构化摘要为主，没有足够的 Timeline 内容证据；
4. 外部模型 Tool Arguments、Schema、Evidence 和安全合同多次触发 fail-closed。

### 关键文件

- `server/ai/deepAnalysis/deepAnalysisService.mjs`
- `server/ai/deepAnalysis/deepAnalysisSchema.mjs`
- `server/ai/deepAnalysis/deepAnalysisContextBuilder.mjs`
- `server/ai/deepAnalysis/deepAnalysisDemoProvider.mjs`
- `server/ai/deepAnalysis/deepAnalysisExternalProvider.mjs`
- `src/deepAnalysis/DeepAnalysisPage.tsx`
- `src/deepAnalysis/AnalysisConfirmation.tsx`
- `src/deepAnalysis/AnalysisResult.tsx`
- `src/deepAnalysis/DeepAnalysisSafetyRail.tsx`
- `tests/goal4a-planned-functions.test.mjs`
- `tests/goal4a-llm-narrative.test.mjs`

## 4. Timeline 内容深度分析：从结构化信号扩展到内容证据

**状态**：已在 `a1a969c` 检查点中完成基础实现；单条外部运行已验证

### 服务端和 Safe Context

- 从已授权的 D365 Pilot 范围读取活动标题、正文摘要、Annotation 内容和 Interaction Signal。
- 每条 Timeline 内容先转换为脱敏内容证据，再进入 Deep Analysis 上下文。
- 删除或遮蔽客户名称、联系人身份、邮箱、电话、GUID、精确金额、精确日期、URL 和敏感字段标识。
- 保留下一步、异议、承诺、决策角色、竞争信号、服务问题和推进结果等业务语义。
- 对外仍只发送脱敏证据 Token、固定代码和摘要；`rawTimelineSent=false`。

### 外部模型合同

- Tool Schema 增加 Timeline 专用选择项：
  - `timelineFindingCodes`
  - `timelineActionCodes`
  - `timelineEvidenceTokens`
- 模型只能从 Safe Context allowlist 中选择证据 Token 和固定代码。
- 服务端确定性展开 Timeline 判断和行动草案，不能由模型直接写入 CRM。
- Timeline 行动不自动生成负责人、期限或 CRM 状态。

### 实际验证

针对 `DEMO-OPP-075` 完成一次真实外部模型运行：

- Timeline 内容证据：8 条
- Timeline 内容判断：3 条
- Timeline 行动建议：1 条
- Schema、Safety、Citation：通过
- `rawTimelineSent=false`
- `exactAmountSentToModel=false`
- `customerIdentitySent=false`
- `crmWritebackEnabled=false`

这只证明 `DEMO-OPP-075` 的受控链路，不代表 200 条商机已经逐条完成外部 Timeline 分析。

## 5. 当前最后任务：Timeline 管理层综合分析重构

**状态**：工作树修改，尚未形成最终提交

### 改造目标

将“逐条 Timeline finding/card”改为跨全部 Timeline 事件的管理层综合结论。系统保留单条代表证据，但默认页面先呈现推进判断、客户立场、决策清晰度、利益相关方动态、阻塞项、承诺和下一步行动。

### 新合同

服务端新增 `Timeline Executive Synthesis`，包括：

- `overallConclusion`
- `momentumTrend`
- `customerPosition`
- `decisionClarity`
- `stakeholderDynamics`
- `keyThemes`，最多 3 项
- `topBlockers`，最多 3 项
- `commitmentSummary`
- `contradictions`，最多 3 项
- `opportunitySignals`，最多 3 项
- `managementActions`，最多 3 项
- `confidence`
- `coverage`
- `representativeEvidenceTokens`，最多 8 项
- `limitations`

### 两阶段处理

1. **Event Extraction**：每条 Timeline 提取稳定 Actor Role、相对时间、方向、客户回应、承诺、异议、服务问题、决策人参与、竞争信号等安全语义。
2. **Executive Synthesis**：服务端跨全部事件计算推进趋势、阻塞项、承诺状态、矛盾、机会信号、决策清晰度和代表证据；外部模型只接收聚合包与最多 8 条语义证据，不接收 Timeline 原文。

### UI 变化

Timeline 区域改为：

- 管理层结论
- Momentum / 推进趋势
- 客户立场与决策动态
- 主题、阻塞项、承诺、矛盾、机会信号
- 管理层行动草案
- Confidence / Coverage
- 折叠的“查看分析依据”，默认不展开逐条证据

行动保持 `Draft` /“仅草案”，不生成没有来源的负责人、期限或 CRM 状态。

### 当前改动范围

- `server/decision/timelineDigest.mjs`
- `server/ai/deepAnalysis/deepAnalysisContextBuilder.mjs`
- `server/ai/deepAnalysis/deepAnalysisDemoProvider.mjs`
- `server/ai/deepAnalysis/deepAnalysisExternalProvider.mjs`
- `server/ai/deepAnalysis/deepAnalysisSafety.mjs`
- `server/ai/deepAnalysis/deepAnalysisSchema.mjs`
- `server/pilot/pilotRuntimeService.mjs`
- `server/app.mjs`
- `src/deepAnalysis/AnalysisResult.tsx`
- `src/deepAnalysis/types.ts`
- `src/styles.css`
- `tests/timeline-executive-synthesis.test.mjs`
- 相关 Deep Analysis、D365 Pilot Runtime、Timeline Digest 测试

## 6. 当前验证状态

### 已完成

- `npm test`：当前 Timeline 综合分析改造的本地全量结果为 `877/877` 通过。
- `npm run build`：通过 TypeScript、Vite 和 Production Bundle Isolation。
- 生产 Bundle 未包含 D365 Secret、Provider Secret、Legacy AI Lab 或 Raw CRM Product UI 入口。
- Timeline 语义脱敏、代表证据数量上限、Evidence Token 引用、健康对照和矛盾场景测试已加入。

### 本轮收尾已确认

- UI 默认状态不显示 `safeContext.*` 技术来源键，技术来源已移入折叠详情。
- “查看分析依据”最多展示 8 条代表证据，并包含相对时间、活动类型、语义摘要、支持结论和 Evidence Token。
- `npm test` 为 `877/877`，`npm run build` 和 Production Bundle Isolation 通过，`git diff --check` 通过。
- 生产源码与 `dist` 敏感扫描无真实凭据；测试中的 `test-only-secret` 仅为既有占位值。
- Timeline 综合分析改造已提交：`8a2d906 Redesign Timeline analysis for executive synthesis`；本日志本身不纳入该 Commit。

## 7. 全局安全和业务边界

截至本日志覆盖范围，以下边界保持不变：

| 边界 | 状态 |
|---|---|
| D365 业务写入 | `0` |
| CRM Writeback | `false` |
| Production Requests | `0` |
| Raw CRM / 原始 Timeline 外发 | `0` / `false` |
| 精确金额进入外部模型 | `false` |
| 客户/联系人身份进入外部模型 | `false` |
| GUID 进入公开产物或外部模型 | `0` |
| 自动 Retry | `0` |
| 自动 Fixture Fallback | `0` |
| 200 条商机批量外部分析 | 未执行 |
| Full Import / Cleanup | 未执行 |

## 8. Git 与交付状态

- Goal 4A 基线提交：`0933b2f Prepare deterministic executive demo release candidate`。
- 当前 Timeline 内容分析检查点：`a1a969c Checkpoint current Timeline content analysis implementation`。
- Timeline 综合分析最终提交：`8a2d906 Redesign Timeline analysis for executive synthesis`。
- 本日志本身是独立整理文档，仍保持为未跟踪文件，未混入 Timeline 实现提交。
- 未提交或未跟踪的 D365 工作簿、截图、私有 Manifest 和无关文档不属于本日志交付范围。
- 未执行 Push。

## 9. 最终结论

从 Goal 4A 开始，系统完成了：

1. 确定性 Executive Demo 冻结；
2. DA-01 至 DA-09 深度分析入口和安全合同；
3. 受控外部模型验证及安全停止；
4. Timeline 脱敏内容证据链路；
5. Timeline 管理层综合分析的两阶段重构。

当前最准确的交付结论是：**Gateway 已具备对单条授权商机进行受控 Timeline 深度分析的能力，当前没有完成 200 条商机的全量外部分析，也没有执行 CRM 写回或生产部署。**
