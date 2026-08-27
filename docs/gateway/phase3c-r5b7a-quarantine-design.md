# Phase 3C-R5B7A Synthetic Tool Arguments Quarantine

本阶段仅建立离线隔离能力，不调用 External LLM，不读取 D365，不产生真实 Provider 响应文件。

## Synthetic-only 门禁

只有以下条件同时满足时，后续独立 Synthetic Probe 才可捕获原始 Tool Arguments：

- `testOnly=true`
- `syntheticProbe=true`
- `d365Record=false`
- `runtimeEligible=false`
- `realCanary=false`
- `Real CRM Token Count=0`
- `Forbidden Field Count=0`

任一条件不满足时，提取器只返回安全失败元数据，不创建隔离目录或原文文件。

## 隔离位置与权限

原文仅允许写入 Git ignored 的 `local-artifacts/gateway/phase3c-r5b7/`：

- `arguments.raw.txt`：权限 `0600`
- `arguments.sha256`：权限 `0600`
- `parse-diagnostics.private.json`：权限 `0600`

目录权限为 `0700`。原文不进入 Console、公开 Markdown/JSON、测试 Snapshot、Bundle 或 Audit UI。本轮没有真实 Provider 响应，因此没有生成实际隔离文件。

## 解析合同

提取路径固定为：

`choices[0].message.tool_calls[0].function.arguments`

只允许去除 UTF-8 BOM、首尾空白，然后对原始参数执行一次 `JSON.parse`。禁止容错解析、补括号、删逗号、自动转义、二次解析、正文截取和 LLM 修复。修复后的结果不得进入业务评价。

## 诊断分类

分类器只提供诊断，不改变 Provider 成功状态：

`TRAILING_COMMA`、`UNESCAPED_CONTROL_CHARACTER`、`UNTERMINATED_STRING`、`INVALID_ESCAPE`、`SINGLE_QUOTED_KEY_OR_VALUE`、`LEADING_OR_TRAILING_TEXT`、`INVALID_NUMBER`、`MISMATCHED_BRACKET`、`MARKDOWN_FENCE`、`DOUBLE_ENCODED_JSON`、`UNKNOWN_JSON_SYNTAX`。

公开诊断只保留长度、SHA-256、UTF-8/BOM、首尾字符类别、括号/引号计数、错误类型、offset、行列和分类。错误前后最多80字符的 escaped 窗口仅存于私有诊断文件。

## 生命周期

下一阶段完成后，先记录原文 Hash 和分类，再删除 `arguments.raw.txt`。私有诊断中保留删除前 Hash、删除后文件存在性和删除状态。未授权时不捕获，未执行时不创建真实响应文件。

## 状态

- External LLM Calls: `0`
- D365 GET: `0`
- CRM Writeback: `false`
- Provider Request Compatibility Ready: `false`
- R5B7B Synthetic Probe: 仅生成决策包，未执行
