# M2-B Specific Form Business Rule Build Sheet

- Name: `AI Gateway Full Replica - Required Fields`
- Scope: Specific form -> `AI Gateway Opportunity Demo - Full Replica`
- Form ID: `<FULL_REPLICA_FORM_ID>`
- Condition: `name` Contains Data
- Create as: Draft/inactive only

## Actions

1. Set Business Required: `parentaccountid` (Account)
2. Set Business Required: `aigw_organizationgroup_choice` (组织团体)
3. Set Business Required: `aigw_bookingdepartment_choice` (计上部门)
4. Set Business Required: `aigw_opportunitytype` (案件类型)
5. Set Business Required: `aigw_casestage` (案件状态)
6. Set Business Required: `aigw_salesdepartment_choice` (销售部门)
7. Set Business Required: `aigw_opportunitydetailtype` (案件详细信息)
8. Set Business Required: `aigw_startdate` (案件开始日)
9. Set Business Required: `aigw_opportunityplace` (案件场所)
10. Set Business Required: `description` (Description)
11. Set Business Required: `aigw_opportunitylist_bool` (案件列表)
12. Set Business Required: `aigw_budgetstatus` (是否预算内)
13. Set Business Required: `aigw_researchbackground_choice` (调查背景)
14. Set Business Required: `aigw_decider_choice` (决裁者)
15. Set Business Required: `aigw_customerneed_choice` (客户需求)
16. Set Business Required: `aigw_proposalcontent_choice` (提案内容)
17. Set Business Required: `aigw_globalinitiative` (全球倡议)
18. Set Business Required: `aigw_alpscooperation` (阿尔卑斯合作)
19. Set Business Required: `aigw_goodshandled` (货物说明)
20. Set Business Required: `aigw_projectsize` (案件物量规模)
21. Set Business Required: `aigw_projectsizeunit` (案件物量规模单位)
22. Set Business Required: `aigw_warehousescale` (仓库规模)
23. Set Business Required: `aigw_transportmode` (运送模式)
24. Set Business Required: `aigw_spotcontinuous` (一次性/持续性)
25. Set Business Required: `aigw_sealandpol` (海运/陆运装货港)
26. Set Business Required: `aigw_sealandpod` (海运/陆运卸货港)
27. Set Business Required: `aigw_airpol` (空运装货港)
28. Set Business Required: `aigw_airpod` (空运卸货港)
29. Set Business Required: `estimatedclosedate` (Est. close date)
30. Set Business Required: `aigw_winprobabilityrank` (受注确度)

## Explicit exclusions

- `actualvalue`
- `statuscode`
- `parentcontactid`
- `aigw_customercontact2`
- `aigw_customercontact3`
- `aigw_customercontact4`
- `aigw_customercontact5`
- `aigw_wonreason_choice`
- `aigw_lostreason_choice`
- `actualclosedate`
