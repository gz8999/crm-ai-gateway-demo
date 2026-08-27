# Phase 1C-5R2G-D5-R4 剩余 WinOpportunity 决策包

## 当前状态

- D5-R2 Win Canary `DEMO-OPP-015`: 已完成一次，完整性通过
- D5-R3 Lose Canary `DEMO-OPP-026`: 已完成一次，完整性通过
- Pilot 分布: **Won 1 / Active 22 / Lost 1**
- Target BPF: **24**，Duplicate 0，Unexpected 0
- Plugin: **7/0**
- 剩余 Win Actions Authorized: **false**

## 冻结剩余候选

| 顺序 | Token | 目标状态 | 冻结计划关闭日 | 当前授权 |
|---:|---|---|---|---|
| 1 | `DEMO-OPP-028` | Won | 2026-04-07 | false |
| 2 | `DEMO-OPP-038` | Won | 2026-05-11 | false |
| 3 | `DEMO-OPP-130` | Won | 2026-07-08 | false |
| 4 | `DEMO-OPP-135` | Won | 2026-06-27 | false |
| 5 | `DEMO-OPP-181` | Won | 2026-08-19 | false |
| 6 | `DEMO-OPP-199` | Won | 2026-09-18 | false |

## 后续授权前必须重新确认

1. 每个候选仍为 Active `0/1`，`actualclosedate` 为空，OpportunityClose 为 0。
2. 冻结 Actual Revenue、Actual End 和 Won Reason 可由 Projection 唯一解析。
3. 每个候选恰有一个目标 BPF，实例、阶段与路径符合当前合同。
4. D5-R2 Win 与 D5-R3 Lose Canary 及其两条 OpportunityClose 保持不变。
5. 每次仅执行官方 `WinOpportunity`，不得 PATCH 关闭字段；首个失败立即停止。
6. Cleanup、Full Import、BPF 写入与生产请求继续禁止。

## 预期完成分布

若未来六条 Win 全部获得单独授权且成功，Compact Pilot 预期为 `Won 7 / Active 16 / Lost 1`。该预期不构成本阶段授权，也不得据此启动任何 Action。

## 回滚与清理边界

- 当前平台关闭活动：Win 1 条、Lose 1 条。
- 后续每次 Win 会再生成一条 OpportunityClose，必须写入私有 Exact ID Manifest。
- 不允许直接 PATCH 恢复 Open，不允许直接删除 BPF。
- 清理必须由独立阶段授权；当前 `Pilot Cleanup Authorized=false`。
