# Phase 3C-R5C-R2-R2 Synthetic Repeatability Decision Pack

- Offline Fact Readability Repair Ready: **true**
- DeepSeek Profile: **v6-r4**
- Provider Transport Contract: **v5**
- Frozen Schema Hash: **54fce23151dce092111df36ae5238795b0728bf62c96a2b6b8a2021ac944ff12**
- Safe Fact Catalog Hash: **f5f51294486d0ece758a5da113a04b25188f24bc2c1063a1924581cf62bdb6aa**
- Maximum Proposed Synthetic Calls: **2**
- Retry / Fallback: **0 / 0**
- D365 GET / CRM Writeback / Production Requests: **0 / false / 0**
- Online Synthetic Probe Authorized: **false**
- Real Canary Authorized: **false**

下一阶段仅可在独立授权后使用字节级相同的 Synthetic Envelope 执行两次 Probe。Probe 1 任一 Transport、Fact Reference、Canonical、Readability、Evidence 或 Safety 门禁失败时必须停止，Probe 2 Calls=0。
