# Goal 4A 八场景验证

八个场景均使用正式 D365 Frozen Dataset 记录，模型只返回代码选择，服务器确定性展开文本。

- growth-opportunity: DEMO-OPP-001 · 契约通过但场景语义门禁未通过
- location-route-risk: DEMO-OPP-046 · 契约通过但场景语义门禁未通过
- meeting-prep: DEMO-OPP-017 · 契约通过但场景语义门禁未通过
- multi-risk-priority: DEMO-OPP-056 · 契约通过但场景语义门禁未通过
- healthy-control: DEMO-OPP-030 · 通过

本次仅执行剩余五条；前序 stalled-high-value、budget-actual-gap、data-contradiction 已调用但未持久化，本报告不将其标记为已验证。

健康对照不允许被标为 High/Critical；所有输出继续受 Evidence 与 Safe Context 门禁约束。
