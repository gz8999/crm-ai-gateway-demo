import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import {
  D6_FULL_IMPORT,
  TOKEN_FIELD,
  buildStableBatches,
  containsGuid,
  exactComplement,
  rowsFromMatrix,
  selectRemainingStateActions,
  sha256,
  validateComplementCounts,
} from "../dataverse/lib/d6-full-import-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FORMAL = path.join(ROOT, "artifacts/d365/CRM_AI_Gateway_D365_Demo_200_ImportProjection_v1.xlsx");
const PILOT = path.join(ROOT, "artifacts/d365/CRM_AI_Gateway_D365_Demo_200_CompactPilot_v1.xlsx");
const OUTPUT = path.join(ROOT, "artifacts/d365/CRM_AI_Gateway_D365_Demo_200_Remaining176_v1.xlsx");
const PRIVATE_DATA = path.join(ROOT, "local-artifacts/d365/d6-workbook-data-private.json");
const PREVIEW_DIR = path.join(ROOT, "local-artifacts/d365/d6-workbook-preview");

const [formalBytes, pilotBytes] = await Promise.all([fs.readFile(FORMAL), fs.readFile(PILOT)]);
verifyFile("Formal Projection", formalBytes, D6_FULL_IMPORT.formalWorkbook);
verifyFile("Compact Pilot", pilotBytes, D6_FULL_IMPORT.pilotWorkbook);

const [formalWorkbook, pilotWorkbook] = await Promise.all([
  SpreadsheetFile.importXlsx(await FileBlob.load(FORMAL)),
  SpreadsheetFile.importXlsx(await FileBlob.load(PILOT)),
]);

const formal = {};
const pilot = {};
const complement = {};
const headers = {};
const pilotTokenField = {
  Account: "account_token",
  Contact: "contact_token",
  Opportunity: "_import_token",
  ServiceCoverage: "_import_token",
  ActualManagement: "_import_token",
  Timeline: "_import_token",
  InteractionSignal: "_import_token",
};
for (const entity of D6_FULL_IMPORT.entities) {
  const formalParsed = rowsFromMatrix(formalWorkbook.worksheets.getItem(entity).getUsedRange().values);
  const pilotParsed = rowsFromMatrix(pilotWorkbook.worksheets.getItem(entity).getUsedRange().values, pilotTokenField[entity]);
  if (formalParsed.rows.length !== D6_FULL_IMPORT.formalCounts[entity]) throw new Error(`${entity} Formal count mismatch`);
  if (pilotParsed.rows.length !== D6_FULL_IMPORT.pilotCounts[entity]) throw new Error(`${entity} Pilot count mismatch`);
  headers[entity] = formalParsed.headers;
  formal[entity] = formalParsed.rows;
  pilot[entity] = pilotParsed.rows;
  complement[entity] = exactComplement(formalParsed.rows, pilotParsed.rows, entity);
}
validateComplementCounts(complement);
validateParents(formal, complement);

const batches = Object.fromEntries(D6_FULL_IMPORT.entities.map((entity) => {
  const prefix = {
    Account: "A",
    Contact: "C",
    Opportunity: "O",
    ServiceCoverage: "V",
    ActualManagement: "M",
    Timeline: "T",
    InteractionSignal: "S",
  }[entity];
  return [entity, buildStableBatches(complement[entity], D6_FULL_IMPORT.batchSizes[entity], prefix)];
}));
const stateActions = selectRemainingStateActions(formal.Opportunity, pilot.Opportunity);

const outputWorkbook = Workbook.create();
addSheet(outputWorkbook, "README", [
  ["key", "value"],
  ["phase", D6_FULL_IMPORT.phase],
  ["source_formal_sha256", D6_FULL_IMPORT.formalWorkbook.sha256],
  ["source_pilot_sha256", D6_FULL_IMPORT.pilotWorkbook.sha256],
  ["selection_rule", "Formal Projection exact Stable Token set MINUS Compact Pilot exact Stable Token set"],
  ["remaining_opportunities", D6_FULL_IMPORT.remainingCounts.Opportunity],
  ["remaining_explicit_records", D6_FULL_IMPORT.explicitRemaining],
  ["state_actions", "84 WinOpportunity + 8 LoseOpportunity after base import exact readback"],
  ["cleanup_authorized", false],
  ["production_requests", 0],
]);

for (const entity of D6_FULL_IMPORT.entities) {
  addSheet(outputWorkbook, entity, [headers[entity], ...complement[entity].map((row) => headers[entity].map((header) => row[header] ?? null))]);
}

const referenceRows = formalWorkbook.worksheets.getItem("ReferenceMapping").getUsedRange().values;
addSheet(outputWorkbook, "ReferenceMapping", referenceRows);

const importOrder = [["order", "entity", "remaining_rows", "batch_ids", "batch_sizes", "success_gate", "failure_gate"]];
D6_FULL_IMPORT.entities.forEach((entity, index) => {
  importOrder.push([
    index + 1,
    entity,
    complement[entity].length,
    batches[entity].map((batch) => batch.id).join(","),
    batches[entity].map((batch) => batch.size).join(","),
    "Created + Reused = expected; Failed = 0; exact readback passed",
    "Stop entire D6 at first failed batch",
  ]);
});
importOrder.push([8, "WinOpportunity", 84, "W1,W2,W3,W4,W5,W6,W7", "12,12,12,12,12,12,12", "84 official actions and exact readback", "Stop remaining actions at first failure"]);
importOrder.push([9, "LoseOpportunity", 8, "L1", "8", "8 official actions and exact readback", "Stop at first failure"]);
addSheet(outputWorkbook, "ImportOrder", importOrder);

const actualByOpportunity = new Map(formal.ActualManagement.map((row) => [row.aigw_opportunityid_token, row]));
const statePlan = [["opportunity_token", "desired_state", "desired_status", "actual_close_date", "actual_revenue", "action", "batch_id"]];
for (const row of stateActions.won) {
  statePlan.push([row[TOKEN_FIELD], row._desired_state, row._desired_status, row._actual_close_date_for_action, annualActualRevenue(actualByOpportunity.get(row[TOKEN_FIELD])), "WinOpportunity", actionBatchId(row, stateActions.won, "W", 12)]);
}
for (const row of stateActions.lost) {
  statePlan.push([row[TOKEN_FIELD], row._desired_state, row._desired_status, row._actual_close_date_for_action, null, "LoseOpportunity", "L1"]);
}
for (const row of stateActions.active) {
  statePlan.push([row[TOKEN_FIELD], row._desired_state, row._desired_status, null, null, "None", null]);
}
statePlan.splice(1, statePlan.length - 1, ...statePlan.slice(1).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
addSheet(outputWorkbook, "StateActionPlan", statePlan);

const manifestRows = [["entity", "stable_token", "parent_tokens", "batch_id", "pilot_overlap", "generation_run"]];
for (const entity of D6_FULL_IMPORT.entities) {
  for (const batch of batches[entity]) {
    for (const row of batch.rows) manifestRows.push([entity, row[TOKEN_FIELD], parentTokens(entity, row).join(","), batch.id, false, D6_FULL_IMPORT.generationRun]);
  }
}
addSheet(outputWorkbook, "RemainingTokenManifest", manifestRows);

const validationRows = [["gate", "expected", "actual", "passed"]];
for (const entity of D6_FULL_IMPORT.entities) validationRows.push([`${entity} remaining count`, D6_FULL_IMPORT.remainingCounts[entity], complement[entity].length, D6_FULL_IMPORT.remainingCounts[entity] === complement[entity].length]);
validationRows.push(["Remaining explicit record count", D6_FULL_IMPORT.explicitRemaining, Object.values(complement).reduce((sum, rows) => sum + rows.length, 0), true]);
validationRows.push(["Pilot token overlap", 0, 0, true]);
validationRows.push(["Missing formal token", 0, 0, true]);
validationRows.push(["Duplicate remaining token", 0, 0, true]);
validationRows.push(["Parent token missing", 0, 0, true]);
validationRows.push(["Remaining Win candidates", 84, stateActions.won.length, stateActions.won.length === 84]);
validationRows.push(["Remaining Lose candidates", 8, stateActions.lost.length, stateActions.lost.length === 8]);
validationRows.push(["Dataverse requests during workbook build", 0, 0, true]);
addSheet(outputWorkbook, "ValidationSummary", validationRows);

await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.mkdir(path.dirname(PRIVATE_DATA), { recursive: true });
await fs.mkdir(PREVIEW_DIR, { recursive: true });

for (const sheet of outputWorkbook.worksheets.items) {
  const used = sheet.getUsedRange();
  const maxPreviewRows = Math.min(25, used.values.length);
  const maxPreviewCols = Math.min(12, used.values[0]?.length || 1);
  const range = `A1:${columnName(maxPreviewCols)}${maxPreviewRows}`;
  const preview = await outputWorkbook.render({ sheetName: sheet.name, range, scale: 1, format: "png" });
  await fs.writeFile(path.join(PREVIEW_DIR, `${sheet.name}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const exported = await SpreadsheetFile.exportXlsx(outputWorkbook);
await exported.save(OUTPUT);

const privatePayload = {
  phase: D6_FULL_IMPORT.phase,
  generationRun: D6_FULL_IMPORT.generationRun,
  source: {
    formal: { path: path.relative(ROOT, FORMAL), bytes: formalBytes.length, sha256: sha256(formalBytes) },
    pilot: { path: path.relative(ROOT, PILOT), bytes: pilotBytes.length, sha256: sha256(pilotBytes) },
  },
  formal,
  pilot,
  complement,
  batches: Object.fromEntries(Object.entries(batches).map(([entity, values]) => [entity, values.map((batch) => ({ id: batch.id, tokens: batch.rows.map((row) => row[TOKEN_FIELD]) }))])),
  stateActions: {
    won: stateActions.won.map((row) => row[TOKEN_FIELD]),
    lost: stateActions.lost.map((row) => row[TOKEN_FIELD]),
    active: stateActions.active.map((row) => row[TOKEN_FIELD]),
  },
  output: { path: path.relative(ROOT, OUTPUT) },
};
if (containsGuid(privatePayload)) throw new Error("Prepared workbook data unexpectedly contains a GUID");
await fs.writeFile(PRIVATE_DATA, `${JSON.stringify(privatePayload, null, 2)}\n`);

const outputBytes = await fs.readFile(OUTPUT);
console.log(JSON.stringify({
  output: path.relative(ROOT, OUTPUT),
  bytes: outputBytes.length,
  sha256: sha256(outputBytes),
  counts: Object.fromEntries(D6_FULL_IMPORT.entities.map((entity) => [entity, complement[entity].length])),
  stateActions: { won: stateActions.won.length, lost: stateActions.lost.length, active: stateActions.active.length },
  sheets: outputWorkbook.worksheets.items.map((sheet) => sheet.name),
  dataverseRequests: 0,
}, null, 2));

function verifyFile(label, bytes, expected) {
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) throw new Error(`${label} integrity mismatch`);
}

function validateParents(allRows, remainingRows) {
  const sets = Object.fromEntries(Object.entries(allRows).map(([entity, rows]) => [entity, new Set(rows.map((row) => String(row[TOKEN_FIELD]))) ]));
  const checks = [
    ["Contact", "parentcustomerid_token", "Account"],
    ["Opportunity", "parentaccountid_token", "Account"],
    ["Opportunity", "parentcontactid_token", "Contact"],
    ["ServiceCoverage", "aigw_accountid_token", "Account"],
    ["ActualManagement", "aigw_opportunityid_token", "Opportunity"],
    ["Timeline", "regardingobjectid_token", "Opportunity"],
    ["InteractionSignal", "aigw_opportunityid_token", "Opportunity"],
    ["InteractionSignal", "aigw_accountid_token", "Account"],
    ["InteractionSignal", "aigw_sourceactivitytoken", "Timeline"],
  ];
  for (const [entity, field, parent] of checks) {
    for (const row of remainingRows[entity]) if (!sets[parent].has(String(row[field]))) throw new Error(`${entity}:${row[TOKEN_FIELD]} missing ${parent} parent ${row[field]}`);
  }
}

function parentTokens(entity, row) {
  const fields = {
    Account: [],
    Contact: ["parentcustomerid_token"],
    Opportunity: ["parentaccountid_token", "parentcontactid_token"],
    ServiceCoverage: ["aigw_accountid_token"],
    ActualManagement: ["aigw_opportunityid_token"],
    Timeline: ["regardingobjectid_token"],
    InteractionSignal: ["aigw_opportunityid_token", "aigw_accountid_token", "aigw_sourceactivitytoken"],
  }[entity];
  return fields.map((field) => row[field]).filter(Boolean);
}

function annualActualRevenue(row) {
  if (!row) throw new Error("Won Opportunity is missing its frozen Actual row");
  return ["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"]
    .reduce((sum, month) => sum + Number(row[`aigw_${month}actualrevenue`] || 0), 0);
}

function actionBatchId(row, rows, prefix, size) {
  const index = rows.findIndex((candidate) => candidate[TOKEN_FIELD] === row[TOKEN_FIELD]);
  return `${prefix}${Math.floor(index / size) + 1}`;
}

function addSheet(workbook, name, matrix) {
  const normalized = matrix.map((row) => row.map((value) => value === undefined ? null : value));
  const sheet = workbook.worksheets.add(name);
  const rowCount = normalized.length;
  const columnCount = Math.max(1, ...normalized.map((row) => row.length));
  const padded = normalized.map((row) => [...row, ...Array(columnCount - row.length).fill(null)]);
  const range = sheet.getRange(`A1:${columnName(columnCount)}${rowCount}`);
  range.values = padded;
  sheet.freezePanes.freezeRows(1);
  sheet.showGridLines = false;
  const header = sheet.getRange(`A1:${columnName(columnCount)}1`);
  header.format = { fill: "#12395B", font: { bold: true, color: "#FFFFFF" }, wrapText: true, verticalAlignment: "center" };
  header.format.rowHeight = 30;
  range.format.font = { name: "Aptos", size: 10 };
  range.format.verticalAlignment = "top";
  range.format.borders = { insideHorizontal: { style: "thin", color: "#E4EAF0" } };
  range.format.autofitColumns();
  range.format.autofitRows();
  if (rowCount > 1) {
    const dataRange = sheet.getRange(`A2:${columnName(columnCount)}${rowCount}`);
    dataRange.format.wrapText = false;
    dataRange.format.rowHeight = 24;
  }
  for (let column = 0; column < columnCount; column += 1) {
    const values = padded.slice(0, Math.min(rowCount, 60)).map((row) => String(row[column] ?? ""));
    const width = Math.min(44, Math.max(11, ...values.map((value) => Math.min(44, value.length + 2))));
    sheet.getRangeByIndexes(0, column, rowCount, 1).format.columnWidth = width;
    const label = String(padded[0][column] || "").toLowerCase();
    if (/date|start|end|created|modified/.test(label)) sheet.getRangeByIndexes(1, column, Math.max(1, rowCount - 1), 1).format.numberFormat = "yyyy-mm-dd";
  }
  if (rowCount > 1 && columnCount > 1) sheet.tables.add(`A1:${columnName(columnCount)}${rowCount}`, true, `D6${name.replace(/[^A-Za-z0-9]/g, "")}Table`);
  return sheet;
}

function columnName(columnCount) {
  let value = columnCount;
  let output = "";
  while (value > 0) {
    value -= 1;
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output || "A";
}
