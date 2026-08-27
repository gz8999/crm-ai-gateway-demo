export const opportunityTypeOptions = [
  { value: 1, label: "01 新增", normalized: "New" },
  { value: 2, label: "现有", normalized: "Existing" },
  { value: 3, label: "01 现有-新增", normalized: "Existing-New" },
  { value: 91, label: "其他", normalized: "Other" },
];

export const opportunityDetailTypeOptions = [
  { value: 1, label: "仓库" },
  { value: 2, label: "仓库运营" },
  { value: 3, label: "运输" },
  { value: 4, label: "WMS（仓库管理系统）" },
  { value: 5, label: "货运代理" },
  { value: 6, label: "LCMS（运输管理系统）" },
  { value: 7, label: "物流咨询" },
  { value: 8, label: "项目物流" },
  { value: 9, label: "MH Sales" },
  { value: 10, label: "DX" },
  { value: 91, label: "其他" },
];

export const caseStageOptions = [
  { value: 1, label: "L1 Information Entry", normalized: "L1 Initial Contact" },
  { value: 2, label: "L2 Feasibility / Quotation", normalized: "L2 Need Confirmed" },
  { value: 3, label: "L3 Customer Visit / Demo", normalized: "L3 Proposal" },
  { value: 4, label: "L4 Quote Submitted", normalized: "L4 Quotation" },
  { value: 5, label: "L5 Order Received", normalized: "L5 Won" },
];

export const opportunityStageOptions = caseStageOptions;

export const winProbabilityOptions = [
  { value: 1, label: "Z", rank: 6 },
  { value: 2, label: "A", rank: 5 },
  { value: 3, label: "B", rank: 4 },
  { value: 4, label: "C", rank: 3 },
  { value: 5, label: "D", rank: 2 },
  { value: 6, label: "Y", rank: 1 },
];

export const transportModeOptions = [
  { value: 1, label: "01 AE", normalized: "AE" },
  { value: 2, label: "02 AI", normalized: "AI" },
  { value: 3, label: "03 OE", normalized: "OE" },
  { value: 4, label: "04 OI", normalized: "OI" },
  { value: 5, label: "05 CBT", normalized: "CBT" },
  { value: 6, label: "06 Domestic", normalized: "Domestic" },
  { value: 91, label: "91 Others", normalized: "Others" },
];

export const customerNeedOptions = [
  { value: 1, label: "定期竞争/招投标" },
  { value: 2, label: "竞争性报价" },
  { value: 3, label: "物流质量管理" },
  { value: 4, label: "现有客户的业务扩展" },
  { value: 5, label: "仓库搬迁" },
  { value: 6, label: "扩展新领域" },
  { value: 7, label: "对现有分包商不满意" },
  { value: 8, label: "自动化操作" },
  { value: 9, label: "WMS（仓库管理系统）" },
  { value: 10, label: "物流咨询" },
  { value: 91, label: "其他" },
];

export const proposalContentOptions = [
  { value: 1, label: "降低成本（仓库）" },
  { value: 2, label: "降低成本（操作）" },
  { value: 3, label: "降低成本（运输）" },
  { value: 4, label: "降低成本（FF）" },
  { value: 5, label: "降低成本（所有）" },
  { value: 6, label: "降低成本（其他）" },
  { value: 7, label: "仓库搬迁" },
  { value: 8, label: "物流质量管理" },
  { value: 9, label: "自动化操作" },
  { value: 10, label: "WMS（仓库管理系统）" },
  { value: 11, label: "TMS（运输管理系统）" },
  { value: 12, label: "其他系统" },
  { value: 13, label: "绿色物流" },
  { value: 14, label: "DX/可视化" },
  { value: 15, label: "物流咨询" },
  { value: 91, label: "其他" },
];

export const goodsHandledOptions = [
  { value: 1, label: "汽车零部件" },
  { value: 2, label: "电子元件" },
  { value: 3, label: "家用电器" },
  { value: 4, label: "家居用品" },
  { value: 5, label: "工业产品" },
  { value: 6, label: "食品" },
  { value: 7, label: "药品" },
  { value: 8, label: "化学品" },
  { value: 9, label: "危险品" },
  { value: 10, label: "纺织品" },
  { value: 11, label: "半导体" },
  { value: 12, label: "建筑材料" },
  { value: 13, label: "机械零部件" },
  { value: 14, label: "图书" },
  { value: 15, label: "服装" },
  { value: 16, label: "玩具" },
  { value: 17, label: "化妆品" },
  { value: 18, label: "农产品" },
  { value: 19, label: "饮料" },
  { value: 20, label: "医疗器械" },
  { value: 21, label: "文具" },
  { value: 22, label: "钢铁产品" },
  { value: 23, label: "塑料制品" },
  { value: 24, label: "橡胶制品" },
  { value: 25, label: "木材" },
  { value: 26, label: "纸制品" },
  { value: 27, label: "玻璃制品" },
  { value: 28, label: "陶瓷制品" },
  { value: 29, label: "电池" },
  { value: 30, label: "燃料" },
  { value: 31, label: "冷冻食品" },
  { value: 32, label: "LCMS" },
  { value: 33, label: "重型货物" },
  { value: 91, label: "其他" },
];

export const cargoDescriptionOptions = goodsHandledOptions;

export const projectSizeUnitOptions = [
  { value: 1, label: "Case" },
  { value: 2, label: "Pallet" },
  { value: 3, label: "Carton" },
  { value: 4, label: "Piece" },
  { value: 5, label: "Ton" },
  { value: 6, label: "Kg" },
  { value: 7, label: "CBM" },
  { value: 8, label: "TEU" },
  { value: 9, label: "FEU" },
  { value: 10, label: "Shipment" },
  { value: 11, label: "Order" },
  { value: 12, label: "Other" },
];

export const warehouseScaleOptions = [
  { value: 1, label: "1~500㎡" },
  { value: 2, label: "501~1,000㎡" },
  { value: 3, label: "1,001~2,000㎡" },
  { value: 4, label: "2,001~3,000㎡" },
  { value: 5, label: "3,001~5,000㎡" },
  { value: 6, label: "5,001~7,500㎡" },
  { value: 7, label: "7,501~10,000㎡" },
  { value: 8, label: "10,001~15,000㎡" },
  { value: 9, label: "15,001~20,000㎡" },
  { value: 10, label: "20,001㎡ over" },
  { value: 11, label: "No warehouse operations" },
  { value: 91, label: "Others" },
];

export const tradeTermsOptions = [
  { value: 1, label: "EXW" },
  { value: 2, label: "FCA" },
  { value: 3, label: "FOB" },
  { value: 4, label: "CFR" },
  { value: 5, label: "CPT" },
  { value: 6, label: "CIF" },
  { value: 7, label: "CIP" },
  { value: 8, label: "DAP" },
  { value: 9, label: "DDU" },
  { value: 10, label: "DDP" },
  { value: 11, label: "Not Yet Determined" },
  { value: 12, label: "Others" },
];

export const budgetStatusOptions = [
  { value: 0, label: "预算外", normalized: "Unbudgeted" },
  { value: 1, label: "预算内", normalized: "Budgeted" },
];

export const opportunityListOptions = [
  { value: 0, label: "否 / 不进入列表", normalized: "No" },
  { value: 1, label: "是 / 进入列表", normalized: "Yes" },
];

export const yesNoOptions = [
  { value: 1, label: "Yes" },
  { value: 2, label: "No" },
];

export const organizationGroupOptions = [
  { value: 1, label: "01: BD Sales(CL)" },
  { value: 2, label: "02: BD Sales(FF)" },
  { value: 3, label: "03: Dalian branch" },
  { value: 4, label: "04: Beijing branch" },
  { value: 5, label: "05: Suzhou branch" },
  { value: 6, label: "06: Chongqing branch" },
  { value: 7, label: "07: EHB Sales" },
  { value: 8, label: "08: LTW Sales" },
  { value: 9, label: "09: LHK Sales" },
  { value: 10, label: "10: AL sales" },
  { value: 11, label: "11: Wuxi branch" },
  { value: 12, label: "12: Qingdao branch" },
  { value: 13, label: "13: Guangzhou branch" },
  { value: 14, label: "14: Shenzhen branch" },
  { value: 15, label: "15: Zhuhai branch" },
  { value: 16, label: "16: KA(FF)" },
  { value: 17, label: "17: CS(FF)" },
  { value: 91, label: "91: Others" },
];

export const bookingDepartmentOptions = [
  { value: 1, label: "01: Domestic Div." },
  { value: 2, label: "02: International Div." },
  { value: 3, label: "03: Beijing branch" },
  { value: 4, label: "04: Dalian branch" },
  { value: 5, label: "05: Suzhou branch" },
  { value: 6, label: "06: Chongqing branch" },
  { value: 7, label: "07: Shanghai Air Export" },
  { value: 8, label: "08: Shanghai Air Import" },
  { value: 9, label: "09: Shanghai Ocean Export" },
  { value: 10, label: "10: Shanghai Ocean Import" },
  { value: 11, label: "11: Wuxi branch" },
  { value: 12, label: "12: Qingdao branch" },
  { value: 14, label: "14: Guangzhou branch" },
  { value: 15, label: "15: Zhuhai branch" },
  { value: 16, label: "16: Shenzhen branch" },
  { value: 17, label: "17: [FCC]" },
  { value: 18, label: "18: [EHB]" },
  { value: 19, label: "19: [LHK]" },
  { value: 20, label: "20: [LTW]" },
  { value: 21, label: "21: [VSE]" },
  { value: 22, label: "22: [AL]" },
  { value: 23, label: "23: LD other country" },
  { value: 24, label: "24: LD Japan" },
  { value: 25, label: "25: LD others" },
  { value: 26, label: "26: Domestic Div East Shanghai WH" },
  { value: 91, label: "91: Others" },
];

export const salesDepartmentOptions = [
  { value: 1, label: "01: Dept1(Industry)" },
  { value: 2, label: "02: Dept1(Distribution)" },
  { value: 3, label: "03: Dept2(LCMS)" },
  { value: 4, label: "04: Dept3(Project Cargo)" },
  { value: 5, label: "05: Dept3(Dangerous Goods)" },
  { value: 6, label: "06: FF" },
  { value: 91, label: "91: Others" },
];

export const priorityOptions = [
  { value: 1, label: "01: High", normalized: "High" },
  { value: 2, label: "02: Important", normalized: "Important" },
  { value: 3, label: "03: Medium", normalized: "Medium" },
  { value: 4, label: "04: Low", normalized: "Low" },
];

export const researchBackgroundOptions = [
  { value: 1, label: "01: 联系" },
  { value: 2, label: "02: 来自日本 LD 的关系" },
  { value: 3, label: "03: 来自其他国家 LD 的关系" },
  { value: 4, label: "04: 来自我们网站的咨询" },
  { value: 5, label: "05: 来自客户的电话" },
  { value: 6, label: "06: 定期竞争/招投标" },
  { value: 7, label: "07: 我方的接洽" },
  { value: 8, label: "08: Routing Order" },
  { value: 9, label: "09: 销售线索" },
  { value: 10, label: "10: 来自合作公司的关系" },
  { value: 11, label: "11: 来自日立集团的关系" },
  { value: 12, label: "12: 来自Alps的关系" },
  { value: 13, label: "13: 过去案件的再访" },
  { value: 91, label: "91: 其他" },
];

export const decisionMakerOptions = [
  { value: 1, label: "01：海外客户" },
  { value: 2, label: "02：中国客户" },
  { value: 91, label: "91：其他" },
];
