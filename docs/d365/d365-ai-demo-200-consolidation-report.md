# Demo200 consolidation report

- Authoritative workbook: `CRM_AI_Gateway_D365_Demo_200_v1.xlsx`
- SHA-256: `8b5ccf042669b64a42652fde5cac901ffd599408a3dab5911cd884c0c2c9aacb`
- Size: 828128 bytes
- Business rows: 3900
- Dataset counts: {"Account":60,"Contact":120,"Opportunity":200,"ActualManagement":130,"ServiceCoverage":240,"Timeline":1800,"InteractionSignal":1350}
- State distribution: {"赢单":91,"开放":100,"丢单":9}
- Department distribution: {"06: FF":172,"04: Dept3(Project Cargo)":3,"01: Dept1(Industry)":11,"02: Dept1(Distribution)":4,"05: Dept3(Dangerous Goods)":2,"91: Others":2,"03: Dept2(LCMS)":6}
- v2/v3/v4/v4.1: retained as archive and superseded for future import.
- `Opportunity` is authoritative for projection; `所有案件_Demo` is display-only.
- `ScenarioManifest` and `SafeContextSamples` are never CRM import sources.

## Gates

- Demo200 Authoritative Workbook Ready=`true`
- Demo Data Generation Completed=`true`
- Pilot Import Ready=`false`
- Full Import Ready=`false`
