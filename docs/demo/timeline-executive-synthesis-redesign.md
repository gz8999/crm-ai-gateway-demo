# Timeline Executive Synthesis 重构报告

## 目标

将逐条 Timeline finding 改为面向管理层的全量 Timeline 综合分析。页面默认回答推进态势、客户立场、决策动态、主要阻力、承诺执行差距、矛盾和管理层行动；单条活动仅作为折叠后的代表证据。

## 实现

- Stage 1 在服务端对每条已授权 Timeline 生成隐藏 Event Extraction，保留稳定角色 Token、相对时间、方向、主题、客户立场、承诺、异议、决策信号、结果和 Evidence Token。
- Stage 2 跨全部事件进行主题去重、趋势判断、承诺完成与逾期识别、责任缺口、矛盾检测、客户态度变化、决策清晰度和管理介入建议。
- Executive Synthesis 输出整体结论、推进趋势、客户立场、决策清晰度、利益相关者动态、最多 3 个主题、最多 3 个阻力、承诺摘要、最多 3 个矛盾、最多 3 个机会、最多 3 个行动、置信度、覆盖度、最多 8 个代表证据和局限。
- 外部模型只接收聚合后的 Executive Analysis Pack 与最多 8 条语义保留证据，不接收全部 Timeline 正文。

## 语义保留型脱敏

- 身份转换为稳定角色 Token，例如 `CUSTOMER-DECISION-MAKER-A` 和 `INTERNAL-SALES-A`。
- 日期保留相对时间和时间窗口，不发送原始敏感日期。
- 金额转换为区间、利润区间和偏差区间。
- 地点和路线转换为区域、运输模式和复杂度类别。
- 保留承诺内容、承诺状态、异议对象、决策角色、下一步、执行结果和责任缺口。

## UI

默认 Timeline 区域显示：管理层结论、推进态势、客户态度与决策动态、主要主题、主要阻力、承诺与执行差距、矛盾与异常、机会信号、管理层行动、Confidence 和 Coverage。

“查看分析依据”折叠区最多显示 8 条代表证据，包含相对时间、活动类型、一句话语义摘要、支持结论和 Evidence Token。`safeContext.*` 等技术来源键默认隐藏，只在独立技术详情中按需展开。行动均标记为 `Draft`，不生成无来源的负责人、期限或 CRM 状态。

## 样本验证

覆盖以下五类样本：

1. `DEMO-OPP-075`：能形成跨事件的推进、阻力和承诺综合。
2. Timeline 丰富的高风险商机：输出 `REVIEW_REQUIRED`，识别多个阻力和逾期承诺。
3. 健康对照：输出 `PROGRESSING`，不生成 `DECISION_GAP` 或虚假高风险。
4. 矛盾样本：保留矛盾代码并将置信度降低至 `MEDIUM`。
5. Timeline 较少样本：置信度和覆盖度为 `LOW`，明确说明记录不足。

## 安全结果

- `rawTimelineSent=false`
- `customerIdentitySent=false`
- `exactAmountSentToModel=false`
- `GUID Exposure=0`
- `CRM Writeback=false`
- `Production Requests=0`
- 外部请求仅允许服务端显式受控路径；默认 Demo Provider 不调用外部模型。

## 验证

- `npm test`：877/877 通过
- `npm run build`：通过
- Production Bundle Isolation：通过
- `git diff --check`：通过
- 生产源码与 `dist` 敏感扫描：通过；测试中仅保留既有 `test-only-secret` 占位值

本轮未执行 200 条商机批量外部分析、CRM 写回、D365 写入、Cleanup 或生产部署。真实外部 Timeline 深度分析验证仍只覆盖 `DEMO-OPP-075`。
