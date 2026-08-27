import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const INPUT = "docs/gateway/d365-ai-analysis-field-catalog.json";
const OUTPUT = "docs/gateway/D365_AI_Analysis_Field_Catalog.xlsx";
const runtimeModules = process.env.CODEX_WORKSPACE_NODE_MODULES;
if (!runtimeModules) throw new Error("CODEX_WORKSPACE_NODE_MODULES is required for spreadsheet authoring.");
const { SpreadsheetFile, Workbook } = await import(pathToFileURL(path.join(runtimeModules, "@oai/artifact-tool/dist/artifact_tool.mjs")).href);
const catalog = JSON.parse(await fs.readFile(INPUT, "utf8"));
const workbook = Workbook.create();

const sheets = [
  ["00_Summary", ["Metric", "Value", "Notes"], [
    ["Environment", catalog.audit.hostname, "Approved test environment"], ["Dataverse GET", catalog.audit.requests.GET, "All writes are zero"],
    ["Audited Entities", catalog.summary.auditedEntityCount, "Metadata only"], ["Catalog Fields/Signals", catalog.summary.fieldCount, "Existing plus proposed/derived/external/excluded"],
    ...Object.entries(catalog.summary.classificationCounts).map(([k,v]) => [k, v, "Primary classification"]),
    ["P0", catalog.issues.P0.length, catalog.issues.P0.join("; ") || "None"], ["P1", catalog.issues.P1.length, catalog.issues.P1.join("; ") || "None"], ["P2", catalog.issues.P2.length, catalog.issues.P2.join("; ") || "None"],
    ["Demo Data Generation Ready", catalog.gates["Demo Data Generation Ready"], "Requires no blocking must-have schema gap"],
  ]],
  ["01_Entity_Catalog", ["Entity Display Name", "Logical Name", "Ownership", "Primary Name", "Existing / Proposed", "Purpose", "AI Usage", "Recommendation", "Priority"], catalog.entities.map((e) => [e.displayName, e.logicalName, e.ownership, e.primaryName, e.existing ? "Existing" : "Proposed", e.purpose, e.aiUsage, e.recommendation, e.priority])],
  ["02_Field_Catalog", ["Entity", "Display Name CN", "Logical Name", "Schema Name", "Existing / Proposed", "Classification", "Data Type", "Max Length", "Precision", "Required Level", "IsValidForCreate", "IsValidForUpdate", "Choice Scope", "Choice Options", "Lookup Target", "Form Presence", "View Presence", "Business Definition", "Source of Truth", "AI Usage", "Scenario Coverage", "Deep Analysis Coverage", "Safe Context Mapping", "External LLM Allowed", "Contains Identity", "Contains Exact Amount", "Masking Rule", "Department Scope Relevant", "Recommendation", "Priority", "Notes"], catalog.fields.map((f) => [f.entity, f.displayNames?.["2052"] || f.displayName, f.logicalName, f.schemaName, f.existing ? "Existing" : "Proposed", f.classification, f.dataType, f.maxLength, f.precision, f.requiredLevel, f.isValidForCreate, f.isValidForUpdate, f.choiceScope, (f.choiceOptions || []).map((x) => `${x.value}:${x.labels?.["2052"] || x.label}`).join("; "), (f.lookupTarget || []).join("; "), f.formPresence, f.viewPresence, f.businessDefinition, f.sourceOfTruth, f.aiUsage, f.scenarioCoverage.join("; "), f.deepAnalysisCoverage.join("; "), f.safeContextMapping, f.externalLlmAllowed, f.containsIdentity, f.containsExactAmount, f.maskingRule, f.departmentScopeRelevant, f.recommendation, f.priority, f.notes])],
  ["03_Choice_Catalog", ["Entity", "Logical Name", "Option Value", "Chinese Label", "Other Labels", "Active / Deprecated", "Recommended Reuse", "Gap", "Scope", "Option Set Name"], catalog.choices.map((x) => [x.entity, x.logicalName, x.optionValue, x.chineseLabel, x.otherLabels, x.activeDeprecated, x.recommendedReuse, x.gap, x.scope, x.optionSetName])],
  ["04_Relationship_Catalog", ["Parent Entity", "Child Entity", "Relationship Name", "Cardinality", "Lookup Field", "Current Usage", "AI Usage", "Data Import Impact"], catalog.relationships.map((x) => Object.values(x))],
  ["05_Organization_Security", ["User Role", "Data Scope", "Current D365 Mechanism", "Demo Behavior", "Production Recommendation", "Exact Amount Permission", "Department Filter Source", "Gap"], catalog.organizationSecurity.map((x) => Object.values(x))],
  ["06_Timeline_Analysis", ["Activity Type", "Existing Fields", "Missing Signals", "DERIVE / ADD", "Safe Summary Rule", "External LLM Rule", "Import Recommendation"], catalog.timelineAnalysis.map((x) => [x.activityType, x.existingFields.join("; "), x.missingSignals.join("; "), x.deriveAdd, x.safeSummaryRule, x.externalLlmRule, x.importRecommendation])],
  ["07_AI_Scenario_Matrix", ["Scenario", "Required CRM Fields", "Optional CRM Fields", "Timeline Signals", "Account History", "External Context", "Gateway Derived Signals", "Forbidden Direct CRM Answers", "Current Gap", "Priority"], catalog.scenarioMatrix.map((x) => [x.scenarioId, x.requiredCrmFields.join("; "), x.optionalCrmFields.join("; "), x.timelineSignals.join("; "), x.accountHistory, x.externalContext, x.gatewayDerivedSignals.join("; "), x.forbiddenDirectCrmAnswers.join("; "), x.currentGap.join("; "), x.priority])],
  ["08_Deep_Analysis_Matrix", ["ID", "Analysis", "CRM Entities", "CRM Fields", "History Window", "Timeline Signals", "Account Aggregates", "External Context", "Internal Knowledge", "Safe Context Fields", "Forbidden Provider Fields", "Output Type"], catalog.deepAnalysisMatrix.map((x) => [x.id, x.name, x.crmEntities.join("; "), x.crmFields, x.historyWindow, x.timelineSignals, x.accountAggregates, x.externalContext, x.internalKnowledge, x.safeContextFields, x.forbiddenProviderFields, x.outputType])],
  ["09_Gap_Analysis", ["Gap ID", "Entity", "Requirement", "Current Capability", "REUSE / ADD / DERIVE", "Proposed Field/Table", "Proposed Type", "Suggested Choice Values", "Business Reason", "AI Reason", "Security Impact", "Migration Impact", "Priority", "Recommended Phase"], catalog.gaps.map((x) => Object.values(x))],
  ["10_Safe_Context_Map", ["CRM Source", "Transformation", "Safe Context Key", "Exact / Band / Category", "External LLM Allowed", "Masking", "Aggregation Window", "Evidence Traceability"], catalog.safeContextMap.map((x) => Object.values(x))],
  ["11_Implementation_Order", ["Order", "Future Step", "Risk", "Gate"], catalog.implementationOrder.map((x) => Object.values(x))],
  ["12_Gates", ["Gate", "Result"], Object.entries(catalog.gates)],
];

function columnName(index) {
  let result = ""; let n = index + 1;
  while (n) { n -= 1; result = String.fromCharCode(65 + (n % 26)) + result; n = Math.floor(n / 26); }
  return result;
}
for (const [name, headers, rows] of sheets) {
  const sheet = workbook.worksheets.add(name); sheet.showGridLines = false;
  const matrix = [headers, ...rows.map((row) => row.map((v) => v === undefined || v === null ? "" : v))];
  const last = `${columnName(headers.length - 1)}${matrix.length}`;
  sheet.getRange(`A1:${last}`).values = matrix;
  sheet.freezePanes.freezeRows(1);
  const header = sheet.getRange(`A1:${columnName(headers.length - 1)}1`);
  header.format = { fill: "#15375B", font: { bold: true, color: "#FFFFFF" }, wrapText: true, verticalAlignment: "center" };
  header.format.rowHeightPx = 34;
  const body = sheet.getRange(`A2:${last}`);
  body.format = { font: { color: "#1F2937", size: 10 }, verticalAlignment: "top", wrapText: true, borders: { bottom: { style: "thin", color: "#E5E7EB" } } };
  body.format.rowHeightPx = 32;
  sheet.getRange(`A1:${last}`).format.autofitColumns();
  for (let i = 0; i < headers.length; i++) {
    const col = sheet.getRange(`${columnName(i)}1:${columnName(i)}${matrix.length}`);
    const long = /Definition|Reason|Usage|Notes|Rule|Fields|Context|Recommendation|Transformation|Coverage|Impact|Gap|Purpose/i.test(headers[i]);
    col.format.columnWidthPx = long ? 260 : Math.min(190, Math.max(90, String(headers[i]).length * 11));
  }
  if (name === "02_Field_Catalog") {
    sheet.freezePanes.freezeColumns(3);
    sheet.getRange(`F2:F${matrix.length}`).conditionalFormats.add("containsText", { text: "ADD", format: { fill: "#FFF1C2", font: { color: "#7A4D00", bold: true } } });
    sheet.getRange(`F2:F${matrix.length}`).conditionalFormats.add("containsText", { text: "EXCLUDE", format: { fill: "#FDE2E2", font: { color: "#9B1C1C", bold: true } } });
  }
  if (matrix.length > 1) sheet.tables.add(`A1:${last}`, true, `${name.replace(/[^A-Za-z0-9]/g, "")}Table`).style = "TableStyleMedium2";
}

const summary = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 5000, output: "json" });
console.log(summary.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "formula error scan" });
console.log(errors.ndjson);
await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(OUTPUT);
const previewDir = "local-artifacts/gateway/d365-ai-field-catalog-previews";
await fs.mkdir(previewDir, { recursive: true });
for (const [name, headers, rows] of sheets) {
  const previewRange = `A1:${columnName(Math.min(headers.length, 10) - 1)}${Math.min(rows.length + 1, 20)}`;
  const preview = await workbook.render({ sheetName: name, range: previewRange, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${name}.png`), new Uint8Array(await preview.arrayBuffer()));
}
console.log(JSON.stringify({ output: OUTPUT, sheets: sheets.length, previews: previewDir }, null, 2));
