# Phase 1C-5R2G-D5 失败恢复计划

- 首个失败后停止，不跳过父级。
- 不自动删除、回滚、扩大权限、修改 Schema 或切换 Owner/Team。
- 仅使用私有 Exact ID Manifest 和稳定 Token 做精确修复。
- Cleanup 未授权；Full Import 未授权。
- 未知 POST/Action 结果只允许精确 GET 回读，不重复提交。
- 当前阻断：Canary Opportunity 创建后平台自动生成 1 条目标 BPF instance，不满足 D5 Canary 的“未创建 BPF”硬门禁。
- 已保留：Account `A-050`、Contact `C-099`、Opportunity `DEMO-OPP-015` 及其私有 Exact ID 证据。
- 未开始：Coverage、Actual、Timeline、Signal、WinOpportunity、LoseOpportunity。
- 后续必须单独决定：接受该平台自动副作用并修订 Canary 契约，或另行授权精确 Cleanup。当前不执行任一方案。

## D5-R1 契约协调结果

- BPF 自动实例已纳入契约：24 条 Opportunity 对应 24 条目标实例，重复及其他流程均为 0。
- Canary Account、Contact、Opportunity、BPF 均精确复用。
- 当前显式记录：245/427；Timeline 178/206；Signal 0/154。
- 首个真实阻断：未来日期 Annotation `TL-1630`（2026-07-30）被平台 HTTP 400 拒绝；精确 GET 确认残留 0。
- 不得自动改日期、跳过记录或放宽冻结数据契约；需单独批准未来日期 Annotation 投影规则后再恢复。
- Win/Lose、Cleanup、Full Import 仍未授权。

## D5-R1A Annotation 日期修复结果

- Future Annotation Date Contract: **Resolved**
- TL-1630 corrected POST / success: **1 / 1**
- Future Annotation count: **4**
- Timeline: **206/206**, final failed 0, historical server rejection retained 1
- Interaction Signal: **154/154**, missing source 0
- Explicit Pilot Records: **427/427**
- Opportunities: **Active 24 / Won 0 / Lost 0**
- Target BPF: **24**, duplicate 0, unexpected 0, initial stage 24
- Plugin: **7/0**
- Win/Lose/Cleanup/Full Import: **not authorized**
- P0/P1/P2: **0/0/1**
- Cleanup 仍按私有 Exact ID 反向依赖顺序执行，当前未授权。
