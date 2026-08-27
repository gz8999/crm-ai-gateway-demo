# Phase 1C-6E-R2 Localization & Business Label Verification

## 1. 结论

Phase 1C-6E-R2 已完成。当前正式 Decision UI 的中文业务标签、技术字段默认隐藏、Action 来源追溯、Meeting 派生值和 Audit 标签均通过门禁，现有 R1 产品结构及 v6 外部模型 UI 预留未回退。

- P0: 0
- P1: 0
- P2: 0
- External LLM calls: 0
- CRM writeback: 0
- D365/Dataverse requests: 0
- Raw CRM Product UI Exposure: 0

## 2. 检查结果与实际缺失项

开始时已具备：七页中文主导航、三层顶部结构、默认折叠技术详情、Meeting Timeline 安全声明、中文 Meeting 派生值基础映射、客户端 canonical JSON 指纹、DEV-only Legacy AI Lab、DA-02/DA-07 与 Model Comparison 禁用态。

实际缺失项：

1. `missing-decision-maker` 与 `forecast-progress-conflict` 会作为证据值直接显示。
2. `Develop` 显示为“推进中”，`Low` 显示为“低”，未达到冻结口径。
3. Portfolio 统计口径仍含 `Scope`、`Portfolio Scope`、`Scenario Scope` 和“完整本地 Portfolio”。
4. Action Board 未逐字段说明建议角色、期限、状态和行动依据的来源。
5. Audit 与右侧安全栏仍含 Provider、Fallback、Schema/Safety/Citation Validation、Latency 等英文业务标签。
6. 顶部状态条未使用“当前模型：demo”的自然中文口径。

## 3. 修改内容

- 增加业务信号中文映射及未知技术信号安全兜底。
- Fact 与 Evidence 在正式页面显示中文安全来源，不显示原始 Safe Context Key。
- `Develop` 改为“开发中”；`Low` 改为“低风险”。
- Portfolio 改为“组合范围 / 场景范围 / 统计范围 / 完整本地组合”。
- Action Board 增加字段级来源，并明确模型建议期限不是 CRM 正式期限。
- Audit、右侧安全栏和顶部状态条完成最终中文业务标签。
- 增加 R2 自动化测试并更新 R1/v6 回归断言。

## 4. 技术字段隐藏方式

正式业务页通过业务映射层展示：

| 原始技术值 | 正式显示 |
| --- | --- |
| `missing-decision-maker` | 关键决策人尚未覆盖 |
| `forecast-progress-conflict` | 预测阶段与实际推进状态不一致 |
| 未映射的连字符技术代码 | 未映射的安全信号 |
| `safeContext.priority` | 优先级来源：CRM 脱敏字段 |
| `safeContext.stagnationBand` | 推进状态来源：阶段停留与跟进频率 |

原始 `source` Key 仅存在于默认折叠的“查看技术详情”中。技术详情不包含 Raw CRM 值、身份、精确金额、Timeline 原文、Prompt、模型响应、API Key 或 Base URL。

## 5. 中文映射

- 阶段：Develop -> 开发中。
- 风险：Critical / High / Medium / Low / Monitor -> 严重 / 高风险 / 中等 / 低风险 / 正常监测。
- Meeting：within-7-days / partial / complete / low / medium / high 均使用中文业务值。
- Provider 与审计：模型提供方、是否调用外部模型、输出结构校验、安全校验、引用校验、回退原因、请求 ID、客户端上下文指纹。
- 布尔值：正式页面使用“是 / 否”。

## 6. Action 来源追溯

| 字段 | 显示规则 |
| --- | --- |
| 建议角色 | 无可靠角色时“待人工指定”；有 Provider 明确值时标注“来源：模型建议” |
| 建议期限 | 无值时“待人工确定”；有值时标注“来源：模型建议（非 CRM 正式期限）” |
| 建议状态 | `Draft only` 显示“仅草案”，不伪装为 CRM 状态 |
| 行动依据 | Provider 已提供的 reason 标注“来源：模型建议” |

未新增 2 天、7 天、30 天等统一期限，也未生成负责人或正式状态。

## 7. 外部模型 UI 预留回归

- 七项主导航保持不变。
- DA-02 与 DA-07 仍为禁用按钮。
- Model Comparison 的四个选择器仍禁用。
- 页面加载、导航和筛选不会调用外部模型。
- Schema / Safety / Citation 状态继续存在，未执行时显示“当前未执行”或“当前审计源未提供”。
- 浏览器不展示 API Key、Base URL、Prompt 或完整 Payload。
- `FEATURE_MODEL_COMPARISON=false`。
- `FEATURE_DEEP_ANALYSIS=false`。

## 8. 响应式与运行页面

| 宽度 | 范围 | 结果 |
| --- | --- | --- |
| 1440 px | 七个正式页面 | 页面级横向溢出 0；原始技术代码曝光 0 |
| 1280 px | 七个正式页面 | 页面级横向溢出 0 |
| 760 px | Audit & Safety | 页面级横向溢出 0；模型对比控件全部禁用 |

运行时进一步确认：

- 顶部显示“当前模型：demo”“外部模型未调用”“外部模型：未启用”。
- Action Board 显示来源和非正式期限说明。
- Meeting 显示“7 天内 / 部分覆盖 / 低”，并保留 Timeline 原文禁用声明。
- 页面交互期间未出现可见错误、组件失败或权限错误。

## 9. 验证

- `npm test`: 222 / 222 passed。
- `npm run build`: passed。
- Production Bundle isolation: passed，正式 bundle 不包含 Legacy AI Lab。
- `git diff --check`: passed。
- Sensitive scan: passed。
- D365/Dataverse requests: 0。
- External LLM calls: 0。
- CRM writeback: 0。

## 10. 门禁

- Business Finding Labels Ready=true
- Technical Keys Hidden By Default=true
- Technical Detail Disclosure Ready=true
- Opportunity 360 Chinese Labels Ready=true
- Action Source Attribution Ready=true
- Meeting Signal Localization Ready=true
- Portfolio Labels Localized=true
- Audit Labels Localized=true
- Provider Status Bar Localized=true
- Chinese Typography Consistency Ready=true
- External Model UI Reservation Preserved=true
- Deep Analysis Disabled=true
- Model Comparison Disabled=true
- Production Legacy Isolation Ready=true
- Responsive 1440/1280/760 Ready=true
- External LLM Disabled=true
- CRM Writeback Disabled=true
- D365 Dataverse Requests=0
- Raw CRM Product UI Exposure=0
- P0/P1=0
- Phase 1C-6E-R2 UI Baseline Frozen=true

## 11. 后续阶段状态

- Phase 1C-6D External LLM Comparison Harness: 尚未开始。
- Phase 1C-6F Deep Analysis: 尚未开始。
- 本阶段未启动任何后续工作。
