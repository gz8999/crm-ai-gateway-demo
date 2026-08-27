# D365 Demo 数据 Gateway Read Contract

## 边界

本契约只描述读取适配器到 Safe Context 的字段边界。D365 写回、外部模型和生产环境均不在本阶段。部门权限过滤必须先于 Safe Context 构建。

| Entity | Logical Name | Business Meaning | Safe Context Mapping | Privacy | Required/Optional |
| --- | --- | --- | --- | --- | --- |
| Account | accountnumber | synthetic account token | account token | safe token | Required |
| Account | industrycode | industry category | industry band | category | Optional |
| Account | name | CRM account name | excluded; identity masked | Identity | Required in CRM, excluded in AI |
| Contact | parentcustomerid | account relationship | account token relationship | safe relation | Required |
| Contact | jobtitle | contact role | stakeholder coverage category | derived/category | Optional |
| Contact | firstname, lastname | contact identity | excluded | Identity | CRM only |
| Opportunity | name | opportunity title | opportunity token | Identity-bearing text | CRM only |
| Opportunity | parentaccountid, parentcontactid | account/contact relation | masked relation token | Identity relation | Required |
| Opportunity | statecode, statuscode | lifecycle state | state category | category | Required |
| Opportunity | estimatedvalue, actualvalue | exact CRM amount | amount band only | Exact amount | Optional |
| Opportunity | aigw_yearrevenueactual | plugin-synced annual revenue | annual revenue band | Banded | Optional |
| Opportunity | aigw_budgetstatus | budget status | budget category | category | Optional |
| Opportunity | aigw_opportunitylocation | location relation | route consistency only | Reference | Optional |
| Opportunity | aigw_sealandpollookup, aigw_sealandpodlookup, aigw_airpollookup, aigw_airpodlookup | route references | route category only | Reference | Optional |
| ActualManagement | aigw_name, aigw_opportunityid | actual identity and parent | token and relation | safe token/relation | Required |
| ActualManagement | aigw_aprilactualrevenue ... aigw_marchactualrevenue | monthly actual revenue | annual/monthly band | Exact amount | Optional |
| ActualManagement | aigw_aprilactualgp ... aigw_marchactualgp | monthly gross profit | margin band | Exact amount | Optional |
| ActualManagement | aigw_annualactualrevenue | annual revenue total | annual revenue band | Banded | Derived by Plugin |
| ServiceCoverage | aigw_demotoken, aigw_name | coverage idempotency and label | coverage token/category | Safe token | Required |
| ServiceCoverage | aigw_servicetype, aigw_coveragestatus | service and status | coverage category | category | Required |
| ServiceCoverage | aigw_startdate, aigw_enddate, aigw_nextopportunitywindow | coverage window | relative window category | Date category | Optional |
| Timeline | regardingobjectid | opportunity relation | opportunity token relation | safe relation | Required |
| Timeline | subject, description | activity content | sanitized summary only | Raw text | CRM only |
| Timeline | scheduledend / annotation date projection | business timing | relative date category | Date category | Optional |
| InteractionSignal | aigw_sourceactivitytoken, aigw_activitydate, aigw_activitytype | source and activity fact | evidence token/category | safe | Required |
| InteractionSignal | aigw_sanitizedsummary | sanitized interaction signal | summary only | Sanitized | Required |
| InteractionSignal | aigw_budgetmentioned, aigw_decisionmakerinvolved, aigw_objectionpresent, aigw_commitmentmade | structured signals | boolean/category | safe category | Optional |

## Mapping rules

- CRM stores business facts; Gateway derives risk, trends, coverage, and priority.
- No AI answer field is written back to D365.
- Timeline raw text, identity, exact amounts, route values, credentials, and OpportunityClose raw text never enter external model input.
- Annual actual GP remains a derived value from monthly GP; no deprecated field is used.
