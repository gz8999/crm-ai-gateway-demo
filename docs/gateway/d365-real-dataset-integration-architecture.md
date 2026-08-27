# D365 Real Dataset Integration Architecture

## Scope

本阶段把 CRM AI Gateway 的正式决策读取链接到测试环境冻结的 D365 Demo Dataset。读取器只接受 `org91f5f65f.crm5.dynamics.com`，只使用服务端私有 Exact ID Manifest 解析 3900 条已验收记录，不把 Manifest、GUID 或凭据发送到浏览器。

冻结范围：60 Account、120 Contact、200 Opportunity、240 ServiceCoverage、130 ActualManagement、1800 Timeline、1350 InteractionSignal，显式业务记录合计 3900；Opportunity 状态为 Won/Active/Lost = 91/100/9，OpportunityClose=100，目标 BPF=200 且全部处于初始阶段。

## Runtime Flow

```text
D365 GET-only client
  -> test-host and AI-provider gate
  -> server-side frozen Exact ID allowlist
  -> metadata + exact record reads
  -> parent/child/count/BPF/state assertions
  -> department filter
  -> Safe Context builder
  -> deterministic Demo Provider
  -> Decision Pack
  -> seven decision workspaces
```

`/api/d365-frozen/*` 是正式应用使用的只读 API。旧 `/api/pilot/*` 保留为兼容入口，但不再是正式首页的读取路径。读取失败时返回明确错误，前端保留当前视图，不回退到 Local Fixture，也不显示混合数据。

## Components

| Component | Responsibility |
| --- | --- |
| `server/d365/frozenDatasetContract.mjs` | 测试 hostname、冻结计数、部门目录、稳定默认商机、Manifest provenance gate |
| `server/d365/frozenDatasetReader.mjs` | 仅 GET；Metadata、精确 ID 分批读取、父子关系和数量校验 |
| `server/d365/frozenDatasetRuntimeService.mjs` | 复用现有 Safe Context/Decision Pack 链，切换为 200 条冻结数据 |
| `server/pilot/pilotSafeContext.mjs` | 既有 Safe Context 派生逻辑，部门筛选先于构建 |
| `server/decision/deterministicProvider.mjs` | 仅消费 Safe Context，生成统一 Decision Pack |
| `server/app.mjs` | 新增 `/api/d365-frozen/*` GET 路由，保留旧 API |
| `src/App.tsx` / `src/api.ts` | 正式首页读取 Frozen Dataset，Local Fixture 只作为显式模式 |

## Security Boundary

- `AI_PROVIDER` 必须为 `demo`，`ALLOW_EXTERNAL_AI` 不得为 `true`。
- 生产 hostname 在环境 gate 和每次 GET 的 URL gate 中拒绝。
- Reader 没有 POST、PATCH、DELETE 或 Publish 调用路径。
- Safe Context 仅输出稳定 token、类别、区间、状态、BPF 阶段、脱敏派生信号和证据来源。
- 客户名称、联系人身份、GUID、精确金额、原始 Timeline/Annotation/OpportunityClose 正文、User/Team 身份和 Scenario/Golden metadata 不出现在运行时公开响应。
- CRM Writeback=0，External LLM Calls=0；本阶段不修改 D365 数据。

## Data Source Modes

产品选择器将正式模式显示为 `D365 Frozen Dataset`，内部保留 `d365-pilot` 类型值以兼容 6F-A 客户端契约和测试。`Local Fixture` 仍可被明确选择，但不参与默认 D365 读取，也不会作为失败回退。

## Live Validation Note

本地仓库的 `.env` 未配置 `DATAVERSE_URL`、租户或应用凭据，因此本轮只执行了注入式冻结数据验证和静态安全验证；没有发起 D365 请求。接入测试环境配置后应执行一次 GET-only browser smoke，并把结果追加到运行时报告，不得把本地 Fixture 当作线上证据。
