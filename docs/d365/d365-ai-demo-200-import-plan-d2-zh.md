# Demo200 D2 后续导入计划

## 当前状态

- Projection Candidate Generated=true
- Import Projection Ready=false
- Owner Mapping Approved=false
- Department Team Mapping Approved=false
- Pilot Workbook Generated=false

## 固定导入顺序

1. Account
2. Contact
3. Opportunity
4. ServiceCoverage
5. ActualManagement
6. Timeline
7. InteractionSignal

## D2已解决

- 自然语言与Choice错误映射
- Actual/Coverage/Signal必填Primary Name
- 10个POL/POD未解析值改为显式OTR fallback并保留原始显示值
- Compact Pilot从23 Account缩减为7 Account

## 写入前必须完成

1. 批准一个普通Active测试用户作为6个Owner Token的映射。
2. 创建并批准7个互相独立的部门Owner Team。
3. 为七个Team分配最小安全角色并完成普通用户运行时验证。
4. 生成正式Import Projection及Pilot Workbook。
5. 用户再次明确授权Pilot Import。

Won/Lost必须使用官方Win/Lose动作，不得直接PATCH statecode/statuscode/actualclosedate。
