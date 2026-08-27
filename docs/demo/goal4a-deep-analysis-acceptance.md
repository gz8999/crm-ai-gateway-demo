# Goal 4A 深度分析验收

## 开关

默认构建不启用入口。演示运行时必须同时设置：

```text
VITE_FEATURE_DEEP_ANALYSIS=true
FEATURE_DEEP_ANALYSIS=true
```

这两个值只作为本地运行时环境变量，不写入源码默认值，也不进入生产默认 Bundle。

## 运行契约

1. 先选择模板，再生成范围预览。
2. 预览展示当前 Safe Context、角色和数据可用性。
3. 用户明确确认后才运行 deterministic Demo 分析。
4. 结果必须通过 Schema、Safety 和 Evidence 校验。
5. 外部 Live Demo 仅允许 `DEMO-OPP-002`，必须再次确认，最多一次，不自动重试或 fallback。
6. 客户历史、外部情报、Timeline 原文和 CRM 写回保持未接入。

## 已验证项

- DA-01 至 DA-09 模板注册和 feature gate 已有离线覆盖。
- Deep Analysis 运行保持 `AI_PROVIDER=demo`、`ALLOW_EXTERNAL_AI=false`。
- 取消、重置和失败状态不写 CRM。
- 没有有效叙事快照时显示空态，不自动发起模型调用。
