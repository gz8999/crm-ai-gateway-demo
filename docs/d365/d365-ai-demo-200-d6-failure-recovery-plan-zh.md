# D6 失败恢复计划

## 冻结状态

- 已完成：A1、A2、C1-C4。
- 部分批次：O1 已创建 DEMO-OPP-001 至 DEMO-OPP-004；DEMO-OPP-005 创建失败且残留为 0。
- 当前精确记录数：595；BPF 28；OpportunityClose 8。
- 本轮不回滚、不删除、不继续后续批次。

## 根因与修复

原执行器从 Pilot 预检缓存加载 Location，只覆盖 12 条 Pilot 引用。Formal Projection 需要 17 条，DEMO-OPP-005 的 '29: Suzhou' 未进入缓存，导致空 Lookup bind。修复后，执行器在首个 Opportunity 写入前读取全部 Active Location/POL-POD，并对 Formal 所需 17/11 个 Token 做精确一条校验；所有 OData bind 同时拒绝空值或非法 ID。

## 恢复前强制门禁

1. 取得新的 D6 Recovery 明确授权。
2. 再次只读确认 Pilot + D6 partial 的 595 条显式记录和 28 条 BPF。
3. 再次确认 17/17 Location、11/11 POL/POD，缺失和重复均为 0。
4. 从 O1 / DEMO-OPP-005 恢复；A/C 和 DEMO-OPP-001..004 必须 read-before-write 后 Reused。
5. 任一不一致立即停止，不执行 Coverage、Actual、Timeline、Signal 或状态动作。
6. 全部 3900 条显式记录通过前，Win/Lose 必须保持 0。

## 禁止

不自动回滚，不删除，不 PATCH，不修改 BPF、Schema、Choice、权限或 Gateway，不访问生产，不执行 Cleanup。
