# Phase 1C-5R2G-D3A Readiness Report

## D2 接管与复验

- v1.1 与 Projection Candidate 的 size/SHA、ZIP、re-import 和公式错误检查全部通过。
- 数据数量为 60/120/200/130/240/1800/1350。Customer Need/Proposal Unknown、LCMS TMS violation、Primary Name duplicate、POL/POD blocked 均为 0。
- POL/POD 为 Exact/Normalized/OTR/Blocked=6/5/10/0；OTR 仅为 fallback，未声明精确机场或港口匹配。
- v1.1 的业务数据 Sheet 中 Dataverse record GUID=0；FieldMapping 中保留 1 个 GUID 形态的旧源 Schema alias。Projection Candidate GUID=0。

## Runtime readiness

- 合格普通候选：1；Active、Interactive、Licensed、非 Application/Integration、非管理员，基础 CRM 权限通过 RolePrivileges 回读。
- 目标 Business Unit：唯一且 Active，公开 alias 为 `BU-CANDIDATE-01`。
- 七个拟建 Owner Team 名称冲突：0；当前不创建 Team。
- 可复用最小角色：0；建议后续经批准创建 `CRM AI Demo Department Minimal`。该规格不含 Delete、Customization、Publish 或安全管理权限。
- Reference Master：CNY=1、Location=51、POL/POD=2072。

## Projection 与 Pilot

- Projection Candidate 保持技术候选，不是正式 Import Projection；Owner/Team approval 均为 false。
- Compact Pilot=7/9/24/12/15/206/154，覆盖七部门、八场景、三种状态与要求业务类型。未生成 Pilot Workbook。

## Issues

- P0/P1/P2=0/0/2。P2：环境中无可复用最小角色，后续批准 D3B 时需创建；FieldMapping 中有 1 个非记录、非导入值的 GUID 形态旧源 Schema alias。Owner/Team 的人工批准是预期决策门禁，不视为 D3A P1。
