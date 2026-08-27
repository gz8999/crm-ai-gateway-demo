# Phase 1B Form Field Placement

Source rows: 117. This is a local dry-run only; no Dataverse mutation occurred.

## Supplemental mapping outside the 117-row source

- 客户名称(中国語)(客户): `aigw_customernamecn`, Opportunity-level text simulation, used in Summary and the replica View; no Account link-entity is generated.

| Source | Target | Label | Tab | Section | Col | Row | Header | View | Metadata only | Simulation | Safe Context | Provider Payload |
|---|---|---|---|---|---:|---:|---|---|---|---|---|---|
| name | name | 案件名称 | 摘要 | 商机信息 | 0 | 0 | systemTitle | true | false | none | sanitized_summary | sanitized_summary_only |
| parentaccountid | parentaccountid | 客户 | 摘要 | 商机信息 | 1 | 0 | false | true | false | none | token_or_exclude | token_only |
| statuscode | statuscode | 状态描述 | 摘要 | 商机信息 | 0 | 1 | false | false | false | none | choice_label | choice_label_only |
| parentcontactid | parentcontactid | 联系人1 | 摘要 | 商机信息 | 1 | 1 | false | true | false | none | token_or_exclude | token_only |
| new_parentcontactid2 | aigw_customercontact2 | 客户担当2 | 摘要 | 商机信息 | 0 | 2 | false | false | false | lookup_simulated_as_text | token_or_exclude | token_only |
| new_parentcontactid3 | aigw_customercontact3 | 客户担当3 | 摘要 | 商机信息 | 1 | 2 | false | false | false | lookup_simulated_as_text | token_or_exclude | token_only |
| new_parentcontactid4 | aigw_customercontact4 | 客户担当4 | 摘要 | 商机信息 | 0 | 3 | false | false | false | lookup_simulated_as_text | token_or_exclude | token_only |
| new_parentcontactid5 | aigw_customercontact5 | 客户担当5 | 摘要 | 商机信息 | 1 | 3 | false | false | false | lookup_simulated_as_text | token_or_exclude | token_only |
| new_organization_group | aigw_organizationgroup_choice | 组织团体 | 摘要 | 商机信息 | 0 | 4 | false | true | false | none | choice_label | choice_label_only |
| new_related_department | aigw_bookingdepartment_choice | 计上部门 | 摘要 | 商机信息 | 1 | 4 | false | true | false | none | choice_label | choice_label_only |
| new_bd_newexisting | aigw_opportunitytype | 案件类型 | 摘要 | 商机信息 | 0 | 5 | false | true | false | none | choice_label | choice_label_only |
| new_status | aigw_casestage | 案件状态 | 摘要 | 商机信息 | 1 | 5 | false | true | false | none | choice_label | choice_label_only |
| new_bd_group | aigw_salesdepartment_choice | 销售部门 | 摘要 | 商机信息 | 0 | 6 | false | true | false | none | choice_label | choice_label_only |
| new_bd_relation | aigw_opportunityrelationship | 案件关系 | 摘要 | 商机信息 | 1 | 6 | false | true | false | none | choice_label | choice_label_only |
| new_bd_details | aigw_opportunitydetailtype | 案件详细信息 | 摘要 | 商机信息 | 0 | 7 | false | true | false | none | choice_label | choice_label_only |
| new_startdate | aigw_startdate | 案件开始日 | 摘要 | 商机信息 | 1 | 7 | false | true | false | none | exclude | exclude |
| new_location | aigw_opportunityplace | 案件场所 | 摘要 | 商机信息 | 0 | 8 | false | false | false | lookup_simulated_as_text | region_or_mode_only | exclude |
| description | description | 说明 | 摘要 | 商机信息 | 1 | 8 | false | false | false | none | sanitized_summary | sanitized_summary_only |
| new_pipeline_list | aigw_opportunitylist_bool | 案件列表 | 摘要 | 商机信息 | 0 | 9 | false | true | false | none | choice_label | choice_label_only |
| transactioncurrencyid | transactioncurrencyid | 货币 | 摘要 | 商机信息 | 1 | 9 | false | false | false | none | region_or_mode_only | exclude |
| new_sales | aigw_sales | 营业负责人 | 摘要 | Sales Person Info | 0 | 0 | false | true | false | lookup_simulated_as_text | token_or_exclude | token_only |
| new_sales2 | aigw_salesperson2 | 营业负责人2 | 摘要 | Sales Person Info | 1 | 0 | false | false | false | lookup_simulated_as_text | region_or_mode_only | exclude |
| new_sales3 | aigw_salesperson3 | 营业负责人3 | 摘要 | Sales Person Info | 0 | 1 | false | false | false | lookup_simulated_as_text | region_or_mode_only | exclude |
| new_sales4 | aigw_salesperson4 | 营业负责人4 | 摘要 | Sales Person Info | 1 | 1 | false | false | false | lookup_simulated_as_text | region_or_mode_only | exclude |
| new_sales5 | aigw_introducer | 介绍人 | 摘要 | Sales Person Info | 0 | 2 | false | false | false | lookup_simulated_as_text | region_or_mode_only | exclude |
| new_global_initiative_key | aigw_globalinitiative | 全球倡议 | 摘要 | 商机详细信息 | 0 | 0 | false | true | false | none | choice_label | choice_label_only |
| new_alps_collaboration_key | aigw_alpscooperation | 阿尔卑斯合作 | 摘要 | 商机详细信息 | 1 | 0 | false | true | false | none | choice_label | choice_label_only |
| new_goods_handled | aigw_goodshandled | 货物说明 | 摘要 | 商机详细信息 | 0 | 1 | false | true | false | none | choice_label | choice_label_only |
| new_project_size | aigw_projectsize | 案件物量规模 | 摘要 | 商机详细信息 | 1 | 1 | false | false | false | none | exclude | exclude |
| new_project_size_unit | aigw_projectsizeunit | 案件物量規模单位 | 摘要 | 商机详细信息 | 0 | 2 | false | true | false | none | choice_label | choice_label_only |
| new_warehouse_scale | aigw_warehousescale | 仓库规模 | 摘要 | 商机详细信息 | 1 | 2 | false | true | false | none | choice_label | choice_label_only |
| new_trade_terms | aigw_tradeterms | 貿易条件 | 摘要 | 商机详细信息 | 0 | 3 | false | true | false | none | choice_label | choice_label_only |
| new_transport_mode | aigw_transportmode | 运送模式 | 摘要 | 商机详细信息 | 1 | 3 | false | true | false | none | choice_label | choice_label_only |
| new_spot_continuous | aigw_spotcontinuous | 一次性/持续性 | 摘要 | 商机详细信息 | 0 | 4 | false | true | false | none | choice_label | choice_label_only |
| new_sealand_pol | aigw_sealandpol | 海运/陆运装货港 | 摘要 | POL&POD | 0 | 0 | false | true | false | lookup_simulated_as_text | region_or_mode_only | exclude |
| new_sealand_pod | aigw_sealandpod | 海运/陆运卸货港 | 摘要 | POL&POD | 1 | 0 | false | true | false | lookup_simulated_as_text | region_or_mode_only | exclude |
| new_air_pol | aigw_airpol | 空运装货港 | 摘要 | POL&POD | 0 | 1 | false | false | false | lookup_simulated_as_text | region_or_mode_only | exclude |
| new_air_pod | aigw_airpod | 空运卸货港 | 摘要 | POL&POD | 1 | 1 | false | false | false | lookup_simulated_as_text | region_or_mode_only | exclude |
| new_priority | aigw_priority_choice | Priority | 摘要 | 汇总信息 | 0 | 0 | false | false | false | none | choice_label | choice_label_only |
| new_budgeted_or_not | aigw_budgetstatus | 是否预算内 | 摘要 | 汇总信息 | 1 | 0 | true | true | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_background | aigw_researchbackground_choice | 调查背景 | 摘要 | 汇总信息 | 0 | 1 | false | true | false | none | choice_label | choice_label_only |
| new_decider | aigw_decider_choice | 决裁者 | 摘要 | 汇总信息 | 1 | 1 | false | true | false | none | choice_label | choice_label_only |
| new_customerneed | aigw_customerneed_choice | 客户需求 | 摘要 | 汇总信息 | 0 | 2 | false | true | false | none | sanitized_summary | sanitized_summary_only |
| new_proposedsolution | aigw_proposalcontent_choice | 提案内容 | 摘要 | 汇总信息 | 1 | 2 | false | true | false | none | sanitized_summary | sanitized_summary_only |
| new_win_reason | aigw_wonreason_choice | 受注理由 | 摘要 | 汇总信息 | 0 | 3 | false | true | false | none | sanitized_summary | sanitized_summary_only |
| new_lost_reason | aigw_lostreason_choice | 失注理由 | 摘要 | 汇总信息 | 1 | 3 | false | true | false | none | sanitized_summary | sanitized_summary_only |
| statecode | statecode | 状态 | 相关 | 系统字段 | 0 | 0 | false | false | true | none | choice_label | choice_label_only |
| new_estimated_quote_amount | aigw_estimatedquoteamount | 预计报价金额 | 摘要 | 预算摘要 | 0 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| estimatedclosedate | estimatedclosedate | 预计下单日 | 摘要 | 预算摘要 | 1 | 0 | false | true | false | none | exclude | exclude |
| estimatedvalue | estimatedvalue | 预算金额 | 摘要 | 预算摘要 | 0 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_capability | aigw_winprobabilityrank | 受注确度 | 摘要 | 预算摘要 | 1 | 1 | true | true | false | none | choice_label | choice_label_only |
| crc49_capabilitya | aigw_capabilitya | Capability-A | 相关 | 保留 metadata | 0 | 0 | false | false | true | none | exclude | exclude |
| crc49_capabilityb | aigw_capabilityb | Capability-B | 相关 | 保留 metadata | 0 | 0 | false | false | true | none | exclude | exclude |
| crc49_capabilityc | aigw_capabilityc | Capability-C | 相关 | 保留 metadata | 0 | 0 | false | false | true | none | exclude | exclude |
| crc49_capabilityd | aigw_capabilityd | Capability-D | 相关 | 保留 metadata | 0 | 0 | false | false | true | none | exclude | exclude |
| crc49_capabilityzy | aigw_capabilityzy | Capability-ZY | 相关 | 保留 metadata | 0 | 0 | false | false | true | none | exclude | exclude |
| crc49_capabilitygpmpa | aigw_capabilitygpmpa | Capability(GP/MP)-A | 相关 | 保留 metadata | 0 | 0 | false | false | true | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_capabilitygpmpb | aigw_capabilitygpmpb | Capability(GP/MP)-B | 相关 | 保留 metadata | 0 | 0 | false | false | true | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_capabilitygpmpc | aigw_capabilitygpmpc | Capability(GP/MP)-C | 相关 | 保留 metadata | 0 | 0 | false | false | true | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_capabilitygpmpd | aigw_capabilitygpmpd | Capability(GP/MP)-D | 相关 | 保留 metadata | 0 | 0 | false | false | true | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_capabilitygpmpzy | aigw_capabilitygpmpzy | Capability(GP/MP)-ZY | 相关 | 保留 metadata | 0 | 0 | false | false | true | none | amount_band_or_trend | exact_amount_prohibited |
| new_year_revenue_budget | aigw_yearrevenuebudget | 年度收入预算总金额 | 摘要 | 年度预算摘要 | 0 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_year_gpmp_budget | aigw_yeargpmpbudget | 年度毛利润/边际利润预算总金额 | 摘要 | 年度预算摘要 | 1 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_revenuebudgetcapabilitypercentagevalue | aigw_revenuebudgetcapabilitypercentagevalue | 根据受注确度计算后的收入预算金额 | 摘要 | 年度预算摘要 | 0 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_gpmpbudgetprobabilityofsecuringpercentageval | aigw_gpmpbudgetprobabilityofsecuringpercentageval | 根据受注确度计算后的毛利润/边际利润预算金额 | 摘要 | 年度预算摘要 | 1 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_revenuebudgetcapabilitypercentagevalue_base | aigw_revenuebudgetcapabilitypercentagevaluebase | 根据受注确度计算后的收入预算金额(CNY) | 摘要 | 年度预算摘要 | 0 | 2 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_gpmpbudgetprobabilityofsecuringpercentageval_base | aigw_gpmpbudgetprobabilityofsecuringpercentagevalbase | 根据受注确度计算后的毛利润/边际利润预算金额 (CNY) | 摘要 | 年度预算摘要 | 1 | 2 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| actualclosedate | actualclosedate | 受注日期 | 摘要 | 实绩摘要 | 0 | 0 | false | true | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_yearrevenueactural | aigw_yearrevenueactual | 年度收入实绩总金额 | 摘要 | 实绩摘要 | 1 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_yearrevenueactural_base | aigw_yearrevenueactualcny | 年度收入实绩总金额(CNY) | 摘要 | 实绩摘要 | 0 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| actualvalue | actualvalue | 受注金额 | 摘要 | 实绩摘要 | 1 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m4_revenue_budget | aigw_m4revenuebudget | 4月收入预算金额 | 预算 | 1Q | 0 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m4_gpmp_budget | aigw_m4gpmpbudget | 4月毛利润/边际利润预算金额 | 预算 | 1Q | 1 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_m4volumebudget | aigw_m4volumebudget | 4月物量预算数 | 预算 | 1Q | 2 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m5_revenue_budget | aigw_m5revenuebudget | 5月收入预算金额 | 预算 | 1Q | 0 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m5_gpmp_budget | aigw_m5gpmpbudget | 5月毛利润/边际利润预算金额 | 预算 | 1Q | 1 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_m5volumebudget | aigw_m5volumebudget | 5月物量预算数 | 预算 | 1Q | 2 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m6_revenue_budget | aigw_m6revenuebudget | 6月收入预算金额 | 预算 | 1Q | 0 | 2 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m6_gpmp_budget | aigw_m6gpmpbudget | 6月毛利润/边际利润预算金额 | 预算 | 1Q | 1 | 2 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_m6volumebudget | aigw_m6volumebudget | 6月物量预算数 | 预算 | 1Q | 2 | 2 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m7_revenue_budget | aigw_m7revenuebudget | 7月收入预算金额 | 预算 | 2Q | 0 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m7_gpmp_budget | aigw_m7gpmpbudget | 7月毛利润/边际利润预算金额 | 预算 | 2Q | 1 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_m7volumebudget | aigw_m7volumebudget | 7月物量预算数 | 预算 | 2Q | 2 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m8_revenue_budget | aigw_m8revenuebudget | 8月收入预算金额 | 预算 | 2Q | 0 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m8_gpmp_budget | aigw_m8gpmpbudget | 8月毛利润/边际利润预算金额 | 预算 | 2Q | 1 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_m8volumebudget | aigw_m8volumebudget | 8月物量预算数 | 预算 | 2Q | 2 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m9_revenue_budget | aigw_m9revenuebudget | 9月收入预算金额 | 预算 | 2Q | 0 | 2 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m9_gpmp_budget | aigw_m9gpmpbudget | 9月毛利润/边际利润预算金额 | 预算 | 2Q | 1 | 2 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_m9volumebudget | aigw_m9volumebudget | 9月物量预算数 | 预算 | 2Q | 2 | 2 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m10_revenue_budget | aigw_m10revenuebudget | 10月收入预算金额 | 预算 | 3Q | 0 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m10_gpmp_budget | aigw_m10gpmpbudget | 10月毛利润/边际利润预算金额 | 预算 | 3Q | 1 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_m10volumebudget | aigw_m10volumebudget | 10月物量预算数 | 预算 | 3Q | 2 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m11_revenue_budget | aigw_m11revenuebudget | 11月收入预算金额 | 预算 | 3Q | 0 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m11_gpmp_budget | aigw_m11gpmpbudget | 11月毛利润/边际利润预算金额 | 预算 | 3Q | 1 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_m11volumebudget | aigw_m11volumebudget | 11月物量预算数 | 预算 | 3Q | 2 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m12_revenue_budget | aigw_m12revenuebudget | 12月收入预算金额 | 预算 | 3Q | 0 | 2 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m12_gpmp_budget | aigw_m12gpmpbudget | 12月毛利润/边际利润预算金额 | 预算 | 3Q | 1 | 2 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_m12volumebudget | aigw_m12volumebudget | 12月物量预算数 | 预算 | 3Q | 2 | 2 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m1_revenue_budget | aigw_m1revenuebudget | 1月收入预算金额 | 预算 | 4Q | 0 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m1_gpmp_budget | aigw_m1gpmpbudget | 1月毛利润/边际利润预算金额 | 预算 | 4Q | 1 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_m1volumebudget | aigw_m1volumebudget | 1月物量预算数 | 预算 | 4Q | 2 | 0 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m2_revenue_budget | aigw_m2revenuebudget | 2月收入预算金额 | 预算 | 4Q | 0 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m2_gpmp_budget | aigw_m2gpmpbudget | 2月毛利润/边际利润预算金额 | 预算 | 4Q | 1 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_m2volumebudget | aigw_m2volumebudget | 2月物量预算数 | 预算 | 4Q | 2 | 1 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m3_revenue_budget | aigw_m3revenuebudget | 3月收入预算金额 | 预算 | 4Q | 0 | 2 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| new_m3_gpmp_budget | aigw_m3gpmpbudget | 3月毛利润/边际利润预算金额 | 预算 | 4Q | 1 | 2 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| crc49_m3volumebudget | aigw_m3volumebudget | 3月物量预算数 | 预算 | 4Q | 2 | 2 | false | false | false | none | amount_band_or_trend | exact_amount_prohibited |
| pricelevelid | pricelevelid | 价目表 | 产品 | 系统产品与金额 | 0 | 0 | false | false | true | none | region_or_mode_only | exclude |
| isrevenuesystemcalculated | isrevenuesystemcalculated | 收入 | 产品 | 系统产品与金额 | 0 | 0 | false | false | true | none | amount_band_or_trend | exact_amount_prohibited |
| totallineitemamount | totallineitemamount | 明细金额 | 产品 | 系统产品与金额 | 0 | 0 | false | false | true | none | amount_band_or_trend | exact_amount_prohibited |
| discountpercentage | discountpercentage | (-)折扣(%) | 产品 | 系统产品与金额 | 0 | 0 | false | false | true | none | exclude | exclude |
| discountamount | discountamount | (-)折扣 | 产品 | 系统产品与金额 | 0 | 0 | false | false | true | none | amount_band_or_trend | exact_amount_prohibited |
| totalamountlessfreight | totalamountlessfreight | 折后金额 | 产品 | 系统产品与金额 | 0 | 0 | false | false | true | none | amount_band_or_trend | exact_amount_prohibited |
| freightamount | freightamount | (+)运费金额 | 产品 | 系统产品与金额 | 0 | 0 | false | false | true | none | amount_band_or_trend | exact_amount_prohibited |
| totaltax | totaltax | (+)总税款 | 产品 | 系统产品与金额 | 0 | 0 | false | false | true | none | amount_band_or_trend | exact_amount_prohibited |
| totalamount | totalamount | 总金额 | 产品 | 系统产品与金额 | 0 | 0 | false | false | true | none | amount_band_or_trend | exact_amount_prohibited |
| ownerid | ownerid | 负责人 | 摘要 | Sales Person Info | 1 | 2 | true | true | false | none | token_or_exclude | token_only |
