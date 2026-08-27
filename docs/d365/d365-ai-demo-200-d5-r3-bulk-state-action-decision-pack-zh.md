# Phase 1C-5R2G-D5-R3 批量状态动作决策包

## 当前状态

- D5-R2 单条 `WinOpportunity` Canary：**成功**
- 已赢单：`DEMO-OPP-015`
- Pilot 状态分布：**Won 1 / Active 23 / Lost 0**
- Target BPF：**24**，Duplicate 0，Unexpected Process 0
- Canary BPF 关闭副作用：**A / None**
- Explicit Pilot Records：**427/427**
- Plugin：**7 enabled / 0 disabled**
- Production Requests：**0**

## 待决策动作

剩余动作当前均未授权：

### WinOpportunity（6条）

- `DEMO-OPP-028`
- `DEMO-OPP-038`
- `DEMO-OPP-130`
- `DEMO-OPP-135`
- `DEMO-OPP-181`
- `DEMO-OPP-199`

### LoseOpportunity（1条）

- `DEMO-OPP-026`

## 建议授权边界

若后续授权 D5-R3，应冻结每条 Token、官方 Action 类型、Status、Actual End、Actual Revenue 或 Close Subject/Description，并在首个失败时停止。每个动作都必须使用 read-before-write、单次 Action、未知响应后只读回读，以及逐条 OpportunityClose/BPF/子记录完整性验证。

禁止直接 PATCH `statecode`、`statuscode` 或 `actualclosedate`。不得推进或完成 BPF，不得重建 BPF Instance，不得将剩余动作与 Cleanup 或 Full Import 合并授权。

## Canary 提供的证据

- 官方 `WinOpportunity` 可按冻结契约成功执行。
- OpportunityClose 精确新增 1，Imported Timeline 不变。
- 目标 BPF Instance、Stage、Path 和状态均未变化。
- 非 Canary Opportunity 与全部受保护子记录 Hash 未变化。

该证据只证明单条 Canary 契约可行，不构成剩余动作授权。

## 当前门禁

- Bulk State Action Ready: **false**
- Remaining Win Actions Authorized: **false**
- Lose Action Authorized: **false**
- Pilot State Actions Completed: **false**
- Pilot Import Completed: **false**
- Cleanup Authorized / Executed: **false / false**
- Full Import Authorized / Started: **false / false**

下一步必须由用户对精确动作集合另行授权。
