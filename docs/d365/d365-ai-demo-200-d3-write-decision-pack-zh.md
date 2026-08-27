# Demo200 D3 写入决策包

D3A 已完成只读准备。当前 Dataverse 写入、业务 CRM 读取和生产请求均为 0。

## 决策 A：Owner 映射

- **A1（推荐）**：批准六个 OWNER-DEMO Token 映射到匿名候选 `OWNER-CANDIDATE-01`。
- **A2**：不批准，并重新指定普通 Active Interactive 测试用户。

当前：`Owner Mapping Approved=false`。

## 决策 B：Team Setup

- **B1（推荐）**：批准在测试环境的 `BU-CANDIDATE-01` 创建七个独立 Owner Team；创建一个最小 Demo 角色；将批准候选加入七个 Team 并分配该角色。
- **B2**：不批准，继续保持所有 Dataverse 写入为 0。

当前：`Team Setup Authorized=false`、`Department Team Mapping Approved=false`。

## A1+B1 授权边界

只允许七个 Demo Team、一个最小角色、七个 Team 的角色分配、批准用户的七个成员关系，以及只读回读和普通用户验收。仍禁止业务数据导入、Win/Lose、现有业务 Team/生产角色修改、Full Import 与 Cleanup。
