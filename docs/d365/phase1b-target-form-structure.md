# Target Form Structure

Form draft: `AI Gateway Opportunity Demo - Full Replica`. The original Form ID `<ORIGINAL_FORM_ID>` is protected.

## Header

- System title: `name`
- `aigw_winprobabilityrank`
- `aigw_budgetstatus`
- `ownerid`

## Summary

- 商机信息: `name`, `parentaccountid`, `statuscode`, `parentcontactid`, `aigw_customercontact2`, `aigw_customercontact3`, `aigw_customercontact4`, `aigw_customercontact5`, `aigw_organizationgroup_choice`, `aigw_bookingdepartment_choice`, `aigw_opportunitytype`, `aigw_casestage`, `aigw_salesdepartment_choice`, `aigw_opportunityrelationship`, `aigw_opportunitydetailtype`, `aigw_startdate`, `aigw_opportunityplace`, `description`, `aigw_opportunitylist_bool`, `transactioncurrencyid`
- 汇总信息: `aigw_priority_choice`, `aigw_budgetstatus`, `aigw_researchbackground_choice`, `aigw_decider_choice`, `aigw_customerneed_choice`, `aigw_proposalcontent_choice`, `aigw_wonreason_choice`, `aigw_lostreason_choice`
- 预算摘要: `aigw_estimatedquoteamount`, `estimatedclosedate`, `estimatedvalue`, `aigw_winprobabilityrank`
- 年度预算摘要: `aigw_yearrevenuebudget`, `aigw_yeargpmpbudget`, `aigw_revenuebudgetcapabilitypercentagevalue`, `aigw_gpmpbudgetprobabilityofsecuringpercentageval`, `aigw_revenuebudgetcapabilitypercentagevaluebase`, `aigw_gpmpbudgetprobabilityofsecuringpercentagevalbase`
- 实绩摘要: `actualclosedate`, `aigw_yearrevenueactual`, `aigw_yearrevenueactualcny`, `actualvalue`
- Sales Person Info: `aigw_sales`, `aigw_salesperson2`, `aigw_salesperson3`, `aigw_salesperson4`, `aigw_introducer`, `ownerid`
- 商机详细信息: `aigw_globalinitiative`, `aigw_alpscooperation`, `aigw_goodshandled`, `aigw_projectsize`, `aigw_projectsizeunit`, `aigw_warehousescale`, `aigw_tradeterms`, `aigw_transportmode`, `aigw_spotcontinuous`
- POL&POD: `aigw_sealandpol`, `aigw_sealandpod`, `aigw_airpol`, `aigw_airpod`

## Budget

Four independent sections, each with three columns: revenue budget, GP/MP budget, volume budget.

## Actuals

Placeholder only. `writeBlocked=true`; no verified related entity or relationship exists in current metadata.

## Product, Files, Related

System structure retained without additional functionality.
