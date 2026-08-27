# 高管演示 3 分钟脚本

## 0:00–0:30 先讲边界

“这是 D365 Frozen Dataset 的只读决策工作台，当前 200 条正式 Demo 商机全部来自测试环境。系统先过滤部门，再构建脱敏 Safe Context；确定性 Health Score 和 Decision Pack 不依赖外部模型。”

## 0:30–1:20 看组合

打开 AI Cockpit，指出 Portfolio 数量、Won/Active/Lost、Grade 分布和风险队列。切换一个部门，说明统计口径会随授权范围变化，外部模型、CRM 写回和生产请求均为关闭状态。

## 1:20–2:20 看一条商机

进入 Risk & Priority，再进入 Opportunity 360。按 Fact、Inference、Evidence、Confidence、Action 顺序讲解；展示金额区间、互动派生信号和“客户历史/外部情报尚未接入”的真实空态。

## 2:20–3:00 收束

打开 Audit & Safety，说明原始 Timeline、客户身份、GUID 和精确金额不会进入 Safe Context。若展示 Deep Analysis，先说明它是显式开启的受控模块，当前外部叙事验证尚未完成，未验证商机不会自动调用模型。
