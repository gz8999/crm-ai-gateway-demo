# Phase 1C-6D External LLM Comparison Harness

## 1. 结论

Phase 1C-6D 已完成受控的 Demo Provider 与 OpenAI-compatible Provider 对比 Harness。正式默认环境仍为 Demo Provider，外部调用与 Model Comparison 默认禁用；所有自动化外部调用验证均使用本地 Mock Provider。

- P0: 0
- P1: 0
- P2: 1（并行未提交的 D365 CLI 脚本使仓库全量测试出现 1 个非 6D 失败）
- External Live Smoke Ready: false
- D365/Dataverse requests: 0
- CRM writeback: 0
- Production requests: 0

## 2. Provider 与调用门禁

外部调用必须同时满足：

1. `FEATURE_MODEL_COMPARISON=true`。
2. 前端构建显式设置 `VITE_FEATURE_MODEL_COMPARISON=true`。
3. `ALLOW_EXTERNAL_AI=true`。
4. `AI_PROVIDER=openai-compatible`。
5. Base URL、API Key、Model 配置完整。
6. 用户点击“开始安全对比”。
7. Safe Context 敏感内容检查通过。

默认配置不满足上述门禁，因此页面加载、导航、筛选和页面切换均不会调用外部模型。失败时返回内存中的 Demo fallback 结果及脱敏 fallback reason，不暴露内部错误或凭据。

Provider Adapter 限制：

- 单次请求 timeout。
- 最多一次重试，仅用于 timeout、429 或 5xx。
- 最大响应 64 KiB。
- 最大输出 token 由服务端限制，默认 1200。
- 请求使用 JSON-only response format。
- 输出必须符合 `unified-ai-output-v1`。
- 敏感内容或 Healthy Control 非法升级会阻断并回退 Demo。

## 3. 相同 Safe Context 对比

Provider 输入仅包含：

- `SafeDecisionContext`。
- `SafeAccountAggregate`。
- 当前六页之一的页面类型。
- Unified Output JSON Schema 与版本。
- 通用、安全的分析指令。

Payload 不包含 Scenario ID、Scenario Tag、测试评价元数据、Raw fixture、Legacy 数据、客户身份、精确金额、Timeline 原文、Location/POL-POD 原值或真实 CRM 数据。

Demo 与 External 的对比以同一 Selected Safe Context 和同一页面为单位。Demo 输出来自既有 deterministic provider；External 输出不会替换正式六页内容，仅在 Audit & Safety 的对比区域展示。

## 4. Structured Output 与安全校验

严格 Schema 要求：

- `id`、`title`、`fact`、`inference`、`evidence`、`confidence`、`recommendedAction`、`priority`。
- 禁止未知顶级字段。
- Fact/Evidence 必须包含 label/value/source。
- Confidence 和 Priority 必须来自固定枚举。
- Action 必须保持 `Draft only`。
- 数量和字符串长度均受限。

校验顺序：Payload safety -> Provider transport -> response size -> JSON envelope -> JSON output -> Unified Schema -> response safety -> Healthy Control guard -> deterministic evaluation。

## 5. Golden Blind 代码评分

运行时评分不导入测试 Golden fixture，也不读取 Scenario ID。运行时只使用 Demo 输出、External 输出和当前 Safe Context 计算：

- Fact Accuracy
- Evidence Coverage
- Required Action Coverage
- Forbidden Claim Safety
- Priority Alignment
- Confidence Alignment
- Contract Compliance
- Safety Compliance
- Stability

测试专用 Golden metadata 位于 `tests/fixtures`，只在 External 响应完成后由测试层读取并验证三类指定场景。静态隔离测试继续保证 `src/**` 和 `server/**` 无法导入该文件或其评价字段。

## 6. Audit

仅在当前 Node 进程内存保存：

- request ID
- Safe Context SHA-256 hash
- provider/model
- scope count
- latency
- schema/safety/citation status
- fallback reason
- evaluation score
- timestamp

不保存 API Key、Base URL、Authorization Header、完整 Prompt、Raw fixture、完整 Safe Context、外部响应正文、客户身份或精确金额。Reset 清空内存结果与对比审计。

## 7. Model Comparison UI

复用 `审计与安全 -> 模型对比`，未增加主导航。

- Scenario、脱敏商机和六个页面选择。
- Demo / External 并排输出。
- Provider、Model、Latency、Schema、Safety、Citation、Fallback。
- 九项确定性评分卡。
- 用户主动触发、调用中取消、手动 Reset。
- 页面切换不会自动调用。
- 失败只影响对比区域，正式 Demo Provider 页面不受影响。
- 默认 Feature Flag 关闭时保持 6E-R2 的禁用占位状态。

## 8. Mock 验证

本地 Mock OpenAI-compatible server 覆盖：

- success
- timeout
- 401
- 429
- 5xx
- non-JSON envelope
- schema invalid
- sensitive response
- oversized response
- forbidden claim score
- retry success
- Demo fallback
- cancellation
- stability repeat
- manual reset

场景验证：`multi-risk-priority`、`data-contradiction`、`healthy-control`。Healthy Control 被升级为 High/Critical 时强制阻断并回退 Demo。

## 9. 浏览器验证

受控本地 Feature Flag + Mock Provider 验证：

- 页面打开后 comparison audit count = 0。
- 点击一次后 audit count = 1。
- Demo/External、综合评分和所有校验元数据可见。
- Reset 后 audit count = 0，结果清空。
- 1440 px: 模型对比完成态无页面级横向溢出。
- 1280 px: 模型对比完成态无页面级横向溢出。
- 760 px: 两列输出转为单列，无页面级横向溢出。
- 未观察到可见页面错误、组件崩溃或自动重复调用。

验证结束后恢复默认 Demo Provider、External disabled 和 Feature Flag disabled 服务。

## 10. 验证结果

- 6D tests: 9 / 9 passed。
- Gateway/6C/6E targeted regression: passed。
- `npm run build`: passed。
- Production Bundle isolation: passed。
- `git diff --check`: passed。
- Sensitive scan: passed。
- Full `npm test`: 6D 与既有 Gateway tests passed；工作区并行新增的未提交 D365 CLI 脚本因缺少其自身测试要求的 `export main` 造成 1 个非 6D 失败。本阶段未修改或提交该独立文件。

## 11. 门禁

- OpenAI Compatible Provider Ready=true
- Explicit External Call Gate Ready=true
- Same Safe Context Comparison Ready=true
- Structured Output Validation Ready=true
- Golden Blind Evaluation Ready=true
- Forbidden Claims Evaluation Ready=true
- Provider Comparison UI Ready=true
- Safe Audit Metadata Ready=true
- Demo Default Preserved=true
- CRM Writeback Disabled=true
- Raw CRM Data Exposure=0
- Credential Exposure=0
- External Live Smoke Ready=false
- P0/P1=0
- Phase 1C-6D Ready=true

## 12. 后续状态

Phase 1C-6F 尚未开始。本阶段未实现客户历史、Timeline、外部情报、深度分析或 Demo Data 扩展。
