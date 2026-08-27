import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const sha = async (path) => crypto.createHash("sha256").update(await readFile(new URL(path, root))).digest("hex");

const validationPath = "docs/d365/d365-ai-demo-200-d4-validation-manifest.json";
const formalPath = "artifacts/d365/CRM_AI_Gateway_D365_Demo_200_ImportProjection_v1.xlsx";
const pilotPath = "artifacts/d365/CRM_AI_Gateway_D365_Demo_200_CompactPilot_v1.xlsx";

function worksheetRowCount(file, sheetIndex) {
  const xml = execFileSync("unzip", ["-p", file, `xl/worksheets/sheet${sheetIndex}.xml`], { encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
  return (xml.match(/<(?:x:)?row\b/g) ?? []).length;
}

function workbookXml(file) {
  const entries = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" }).split("\n").filter(Boolean).filter((entry) => entry.startsWith("xl/") && entry.endsWith(".xml"));
  return entries.map((entry) => execFileSync("unzip", ["-p", file, entry], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 })).join("\n");
}

function worksheetCellValues(file) {
  const entries = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" }).split("\n").filter(Boolean).filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry));
  return entries.map((entry) => {
    const xml = execFileSync("unzip", ["-p", file, entry], { encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
    return [...xml.matchAll(/<(?:x:)?(?:v|t)>([\s\S]*?)<\/(?:x:)?(?:v|t)>/g)].map((match) => match[1]).join("\n");
  }).join("\n");
}

test("D4 freezes exact formal and compact workbook hashes and counts", async () => {
  const manifest = await readJson(validationPath);
  assert.equal(await sha(formalPath), manifest.outputWorkbooks.formal.sha256);
  assert.equal(await sha(pilotPath), manifest.outputWorkbooks.pilot.sha256);
  assert.deepEqual(manifest.sourceCounts, { Account: 60, Contact: 120, Opportunity: 200, ServiceCoverage: 240, ActualManagement: 130, Timeline: 1800, InteractionSignal: 1350 });
  assert.deepEqual(manifest.pilotCounts, { Account: 7, Contact: 9, Opportunity: 24, ActualManagement: 12, ServiceCoverage: 15, Timeline: 206, InteractionSignal: 154 });
  const formalSheets = ["README", "Account", "Contact", "Opportunity", "ActualManagement", "ServiceCoverage", "Timeline", "InteractionSignal", "ReferenceMapping", "ChoiceMapping", "PrimaryNameProjection", "CompactPilot", "ValidationSummary", "StateActionPlan", "ImportOrder"];
  const pilotSheets = ["Account", "Contact", "Opportunity", "ActualManagement", "ServiceCoverage", "Timeline", "InteractionSignal", "README", "StateActionPlan", "ImportOrder"];
  const formalXml = workbookXml(formalPath);
  const pilotXml = workbookXml(pilotPath);
  for (const name of ["ScenarioManifest", "SafeContextSamples", "所有案件_Demo"]) {
    assert.doesNotMatch(formalXml, new RegExp(name));
    assert.doesNotMatch(pilotXml, new RegExp(name));
  }
  assert.equal(formalSheets.length, 15);
  assert.equal(pilotSheets.length, 10);
  const formalData = { Account: 60, Contact: 120, Opportunity: 200, ActualManagement: 130, ServiceCoverage: 240, Timeline: 1800, InteractionSignal: 1350 };
  const pilotData = manifest.pilotCounts;
  for (const [index, name] of formalSheets.entries()) {
    if (formalData[name]) assert.equal(worksheetRowCount(formalPath, index + 1), formalData[name] + 1, name);
  }
  for (const [index, name] of pilotSheets.entries()) {
    if (pilotData[name]) assert.equal(worksheetRowCount(pilotPath, index + 1), pilotData[name] + 1, name);
  }
});

test("D4 keeps state actions plan-only and preserves zero business requests", async () => {
  const manifest = await readJson(validationPath);
  const plan = await readJson("docs/d365/d365-ai-demo-200-state-action-plan.json");
  assert.deepEqual(plan.groups.map((row) => [row.stateGroup, row.count]), [["Active", 100], ["Won", 91], ["Lost", 9]]);
  assert.equal(plan.authorized, false);
  assert.deepEqual(plan.requestsExecuted, { winOpportunity: 0, loseOpportunity: 0 });
  assert.equal(manifest.boundaries.businessRecordGET, 0);
  for (const key of ["post", "patch", "delete", "publish", "winOpportunity", "loseOpportunity", "productionRequests", "externalLlmCalls"]) assert.equal(manifest.boundaries[key], 0, key);
  assert.equal(manifest.gates.pilotImportAuthorized, false);
  assert.equal(manifest.gates.fullImportReady, false);
});

test("D4 preserves runtime aliases and pilot token integrity", async () => {
  const mapping = await readJson("docs/d365/d365-ai-demo-200-runtime-token-mapping-summary.json");
  const selection = await readJson("docs/d365/d365-ai-demo-200-pilot-selection-final.json");
  assert.equal(mapping.ownerTokenMapping.count, 6);
  assert.equal(mapping.departmentTeamMapping.count, 7);
  assert.equal(mapping.distinctTeamCount, 7);
  assert.equal(mapping.canonicalRoleAssignmentCount, 7);
  assert.equal(mapping.membershipCount, 7);
  assert.equal(mapping.deletedRoleResidualReferenceCount, 0);
  for (const key of ["accountTokens", "contactTokens", "opportunityTokens", "actualTokens", "coverageTokens", "timelineTokens", "signalTokens"]) {
    assert.equal(new Set(selection[key]).size, selection[key].length, key);
  }
  assert.deepEqual(selection.counts, { Account: 7, Contact: 9, Opportunity: 24, ActualManagement: 12, ServiceCoverage: 15, Timeline: 206, InteractionSignal: 154 });
  assert.equal(selection.approved, false);
  assert.equal(selection.coverage.departments, true);
  assert.equal(selection.coverage.coreScenarios, true);
  assert.equal(selection.coverage.signalSourceIntegrity, true);
});

test("D4 public artifacts contain no GUID, production host, credential, or executable request material", async () => {
  const paths = [
    validationPath,
    "docs/d365/d365-ai-demo-200-d4-readiness-report.md",
    "docs/d365/d365-ai-demo-200-runtime-token-mapping-summary.json",
    "docs/d365/d365-ai-demo-200-state-action-plan.json",
    "docs/d365/d365-ai-demo-200-import-contract.json",
    "docs/d365/d365-ai-demo-200-pilot-selection-final.json",
    "docs/d365/d365-ai-demo-200-cleanup-contract-final.json",
    "docs/d365/d365-ai-demo-200-import-order-plan-zh.md",
    "docs/d365/d365-ai-demo-200-pilot-import-decision-pack-zh.md",
  ];
  const forbidden = [
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    /lcn-crm\.crm7\.dynamics\.com/i,
    /org91f5f65f\.crm5\.dynamics\.com/i,
    /Authorization\s*:/i,
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /client[_ -]?secret|refresh[_ -]?token|access[_ -]?token/i,
  ];
  for (const path of paths) {
    const content = await readFile(new URL(path, root), "utf8");
    for (const pattern of forbidden) assert.doesNotMatch(content, pattern, `${path} matched ${pattern}`);
  }
  for (const file of [formalPath, pilotPath]) {
    const content = worksheetCellValues(file);
    for (const pattern of forbidden) assert.doesNotMatch(content, pattern, `${file} matched ${pattern}`);
  }
});

test("D4 cleanup contract is reverse dependency order and remains unauthorized", async () => {
  const cleanup = await readJson("docs/d365/d365-ai-demo-200-cleanup-contract-final.json");
  assert.deepEqual(cleanup.reverseOrder, ["InteractionSignal", "Timeline", "ActualManagement", "ServiceCoverage", "Opportunity", "Contact", "Account"]);
  assert.equal(cleanup.cleanupAuthorized, false);
  assert.equal(cleanup.cleanupReady, false);
  assert.equal(cleanup.excludedFromCleanup.includes("seven demo teams"), true);
});
