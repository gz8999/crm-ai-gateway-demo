# 高管演示 15 分钟脚本

## 1. 业务问题与范围（2 分钟）

说明决策者需要的是风险优先级、事实依据、下一步行动和可信边界，而不是另一套 CRM 录入页。冻结数据规模为 60/120/200/240/130/1800/1350。

## 2. 组合驾驶舱（3 分钟）

展示全部部门、Portfolio Scope、91/100/9 状态分布、S/A/B/C/D/Z 分布和 Top 风险。强调部门过滤发生在 Safe Context 之前，避免把场景统计误认为全公司统计。

## 3. 风险到证据（3 分钟）

从风险队列选一条商机，依次查看排序原因、健康维度、Fact、Inference、Evidence 和 Confidence。说明排序来自确定性规则，Action Board 只重组已有建议，不生成期限、负责人或 CRM 写回。

## 4. 会前与深度分析（3 分钟）

打开 Meeting Copilot，展示会议目标、提问和必须确认事项。若启用 Deep Analysis，先查看范围预览，再人工确认运行 deterministic Demo；未接入的客户历史、外部情报和 Timeline 原文保持空态。

## 5. 安全与下一步（4 分钟）

在 Audit & Safety 展示 Provider、Safe Context 数量、金额区间化、客户端指纹说明、`CRM Writeback=false` 和 `Production Requests=0`。外部 LLM 目前只有 5 条可持久化快照，八场景全量门禁尚未通过，因此不在本次演示中触发 Live Demo。
