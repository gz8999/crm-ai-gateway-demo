import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const workbook = new URL("../artifacts/d365/CRM_AI_Gateway_D365_Demo_200_v1.xlsx", import.meta.url).pathname;
const projection = new URL("../artifacts/d365/CRM_AI_Gateway_D365_Demo_200_Import_Projection_v1.xlsx", import.meta.url).pathname;
const pilot = new URL("../artifacts/d365/CRM_AI_Gateway_D365_Demo_200_Pilot_v1.xlsx", import.meta.url).pathname;
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));

test("D1 adopts the exact Demo200 workbook as the authoritative source", async () => {
  const bytes = await readFile(workbook);
  assert.equal((await stat(workbook)).size, 828128);
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), "8b5ccf042669b64a42652fde5cac901ffd599408a3dab5911cd884c0c2c9aacb");
  const manifest = await readJson("docs/d365/d365-ai-demo-200-metadata-preflight-manifest.json");
  assert.equal(manifest.gates.Demo200WorkbookIntegrityReady, true);
  assert.equal(manifest.gates.Demo200AuthoritativeWorkbookReady, true);
  assert.equal(manifest.gates.V2V3V4V4_1SupersededForImport, true);
});

test("D1 freezes the exact 3900-row dataset and state distribution", async () => {
  const manifest = await readJson("docs/d365/d365-ai-demo-200-metadata-preflight-manifest.json");
  assert.deepEqual(manifest.counts, {
    Account: 60,
    Contact: 120,
    Opportunity: 200,
    ActualManagement: 130,
    ServiceCoverage: 240,
    Timeline: 1800,
    InteractionSignal: 1350,
    TotalBusinessRows: 3900,
  });
  assert.deepEqual(manifest.stateDistribution, { 赢单: 91, 开放: 100, 丢单: 9 });
});

test("D1 workbook uses parentcontactid and never restores primarycontactid", () => {
  const entries = execFileSync("unzip", ["-Z1", workbook], { encoding: "utf8" })
    .split("\n")
    .filter((entry) => /^xl\/worksheets\/.*\.xml$/.test(entry));
  const worksheetXml = entries
    .map((entry) => execFileSync("unzip", ["-p", workbook, entry], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }))
    .join("\n");
  assert.match(worksheetXml, /parentcontactid/);
  assert.doesNotMatch(worksheetXml, /primarycontactid/);
});

test("D1 Actual allocation is 91 won, 39 open, zero lost, and parent-unique", async () => {
  const validation = await readJson("docs/d365/d365-ai-demo-200-validation-manifest.json");
  const rules = Object.fromEntries(validation.rules.map((rule) => [rule.id, rule]));
  assert.equal(rules["ACT-001"].passed, true);
  assert.equal(rules["ACT-001"].actual, 0);
  assert.equal(rules["ACT-002"].passed, true);
  assert.equal(rules["ACT-002"].actual, '{"赢单": 91, "开放": 39}');
  assert.equal(validation.counts.ActualManagement, 130);
});

test("D1 preserves the exact seven-department distribution", async () => {
  const manifest = await readJson("docs/d365/d365-ai-demo-200-metadata-preflight-manifest.json");
  assert.deepEqual(manifest.salesDepartmentDistribution, {
    "06: FF": 172,
    "04: Dept3(Project Cargo)": 3,
    "01: Dept1(Industry)": 11,
    "02: Dept1(Distribution)": 4,
    "05: Dept3(Dangerous Goods)": 2,
    "91: Others": 2,
    "03: Dept2(LCMS)": 6,
  });
  assert.equal(Object.keys(manifest.salesDepartmentDistribution).length, 7);
});

test("D1 validates timeline and signal integrity", async () => {
  const manifest = await readJson("docs/d365/d365-ai-demo-200-metadata-preflight-manifest.json");
  assert.deepEqual(manifest.timeline, {
    count: 1800,
    exactDuplicateCount: 0,
    normalizedUniqueRatio: 1,
    appointmentCount: 448,
    invalidAppointmentCount: 0,
  });
  assert.deepEqual(manifest.signal, { count: 1350, missingSourceCount: 0, coverageRatio: 0.75 });
});

test("D1 requires at least three Timeline types per opportunity and all eight appointment sections", async () => {
  const validation = await readJson("docs/d365/d365-ai-demo-200-validation-manifest.json");
  const rules = Object.fromEntries(validation.rules.map((rule) => [rule.id, rule]));
  assert.equal(rules["TL-001"].passed, true);
  assert.equal(rules["TL-001"].actual, 0);
  assert.equal(rules["TL-004"].passed, true);
  assert.equal(rules["TL-004"].actual, 448);
});

test("D1 keeps every Signal linked to an existing unique Timeline source", async () => {
  const validation = await readJson("docs/d365/d365-ai-demo-200-validation-manifest.json");
  const rules = Object.fromEntries(validation.rules.map((rule) => [rule.id, rule]));
  assert.equal(rules["SIG-001"].passed, true);
  assert.equal(rules["SIG-001"].actual, 0);
  assert.equal(rules["SIG-002"].actual, 0.75);
});

test("D1 keeps all business records synthetic and free of direct identifiers", async () => {
  const manifest = await readJson("docs/d365/d365-ai-demo-200-metadata-preflight-manifest.json");
  assert.deepEqual(manifest.anonymization, {
    guidCount: 0,
    emailCount: 0,
    phoneCount: 0,
    productionHostnameCount: 0,
    sourceOverlap: {
      customerNameExactOverlap: 0,
      caseNameExactOverlap: 0,
      descriptionExactOverlap: 0,
      budgetExactOverlap: 0,
      guidCount: 0,
      emailCount: 0,
      phoneCount: 0,
    },
  });
});

test("D1 proves source customer, opportunity, narrative, and budget overlap are all zero", async () => {
  const validation = await readJson("docs/d365/d365-ai-demo-200-validation-manifest.json");
  const rules = Object.fromEntries(validation.rules.map((rule) => [rule.id, rule]));
  for (const id of ["NAME-001", "NAME-002", "TEXT-001", "AMOUNT-001"]) {
    assert.equal(rules[id].passed, true, id);
    assert.equal(rules[id].actual, 0, id);
  }
});

test("D1 LCMS contract is computer procurement and deployment, never transport management", async () => {
  const contract = await readJson("docs/d365/d365-ai-demo-200-department-business-contract.json");
  const lcms = contract["03: Dept2(LCMS)"];
  for (const term of ["台式机采购", "笔记本换机", "一体机采购", "标准镜像", "系统安装", "资产标签", "数据迁移"]) {
    assert.equal(lcms.business.includes(term), true, term);
  }
  assert.deepEqual(lcms.forbidden, ["06: LCMS（运输管理系统）"]);
});

test("D1 Project Cargo and Dangerous Goods contracts retain their required business semantics", async () => {
  const contract = await readJson("docs/d365/d365-ai-demo-200-department-business-contract.json");
  assert.deepEqual(contract["04: Dept3(Project Cargo)"].business, ["重型设备出口", "生产线迁移", "大型设备搬入与安装"]);
  assert.deepEqual(contract["05: Dept3(Dangerous Goods)"].business, ["危险化学品出口", "危险品国内运输"]);
  const validation = await readJson("docs/d365/d365-ai-demo-200-validation-manifest.json");
  assert.equal(validation.rules.find((rule) => rule.id === "BIZ-001").passed, true);
});

test("D1 reconciles field and choice metadata without unknown values", async () => {
  const fields = await readJson("docs/d365/d365-ai-demo-200-field-classification.json");
  const choices = await readJson("docs/d365/d365-ai-demo-200-choice-reconciliation.json");
  const manifest = await readJson("docs/d365/d365-ai-demo-200-metadata-preflight-manifest.json");
  assert.deepEqual(fields.unknownLogicalNames, []);
  assert.equal(choices.rows.length > 0, true);
  assert.equal(choices.rows.every((row) => row.importable === true), true);
  assert.equal(manifest.gates.UnknownLogicalNames, 0);
  assert.equal(manifest.gates.UnknownChoiceValues, 0);
  assert.equal(manifest.gates.ChoiceSemanticConflictCount, 0);
});

test("D1 resolves CNY and Location but does not guess ten POL/POD references", async () => {
  const refs = await readJson("docs/d365/d365-ai-demo-200-reference-mapping-summary.json");
  assert.equal(refs.currency.resolved, true);
  assert.equal(refs.location.resolved, true);
  assert.equal(refs.location.mappings.length, 17);
  assert.equal(refs.polPod.resolved, false);
  assert.equal(refs.polPod.mappings.filter((row) => row.target === null).length, 10);
});

test("D1 treats Owner mappings as candidates and department Teams as a blocking setup", async () => {
  const owners = await readJson("docs/d365/d365-ai-demo-200-owner-candidates.json");
  const teams = await readJson("docs/d365/d365-ai-demo-200-department-team-candidates.json");
  assert.equal(owners.candidateCount, 2);
  assert.equal(owners.ownerMappingApproved, false);
  assert.equal(teams.departmentTokens.length, 7);
  assert.equal(teams.qualifiedExistingTeamCandidateCount, 0);
  assert.equal(teams.departmentTeamCandidatesReady, false);
  assert.equal(teams.teamSetupRequired, true);
  assert.equal(teams.departmentTeamMappingApproved, false);
});

test("D1 freezes a 25-opportunity pilot covering departments, scenarios, states, and business types", async () => {
  const candidate = await readJson("docs/d365/d365-ai-demo-200-pilot-candidate-manifest.json");
  assert.equal(candidate.opportunityTokens.length, 25);
  assert.equal(new Set(candidate.opportunityTokens).size, 25);
  assert.equal(Object.keys(candidate.departmentDistribution).length, 7);
  assert.deepEqual(candidate.departmentDistribution, candidate.quota);
  assert.equal(candidate.requiredScenarios.every((value) => candidate.scenarios.includes(value)), true);
  assert.equal(candidate.requiredBusiness.every((value) => candidate.businessCoverage.includes(value)), true);
  assert.deepEqual(new Set(candidate.states), new Set(["开放", "赢单", "丢单"]));
  assert.equal(candidate.pilotCandidateDefined, true);
  assert.equal(candidate.pilotWorkbookGenerated, false);
  assert.equal(candidate.pilotImportReady, false);
  assert.equal(candidate.pilotImportAuthorized, false);
});

test("D1 keeps projection and import blocked while P1 findings remain", async () => {
  const manifest = await readJson("docs/d365/d365-ai-demo-200-metadata-preflight-manifest.json");
  assert.equal(manifest.p0.length, 0);
  assert.equal(manifest.p1.length, 2);
  assert.equal(manifest.p2.length, 2);
  assert.equal(manifest.gates.ImportProjectionReady, false);
  assert.equal(manifest.gates.ImportProjectionWorkbookGenerated, false);
  assert.equal(manifest.gates.PilotImportReady, false);
  assert.equal(manifest.gates.PilotImportAuthorized, false);
  assert.equal(manifest.gates.FullImportReady, false);
  await assert.rejects(access(projection));
  await assert.rejects(access(pilot));
});

test("D1 remains GET-only and production-isolated", async () => {
  const manifest = await readJson("docs/d365/d365-ai-demo-200-metadata-preflight-manifest.json");
  assert.equal(manifest.requests.businessCRMGET, 0);
  assert.equal(manifest.requests.POST, 0);
  assert.equal(manifest.requests.PATCH, 0);
  assert.equal(manifest.requests.DELETE, 0);
  assert.equal(manifest.requests.Publish, 0);
  assert.equal(manifest.requests.productionRequests, 0);
  assert.equal(manifest.requests.externalLLMCalls, 0);
  assert.equal(manifest.gates.DataverseWrites, 0);
  assert.equal(manifest.gates.BusinessCRMReads, 0);
});

test("D1 token and cleanup contracts cover all records without authorizing cleanup", async () => {
  const tokens = await readJson("docs/d365/d365-ai-demo-200-token-manifest.json");
  const cleanup = await readJson("docs/d365/d365-ai-demo-200-cleanup-contract.json");
  assert.equal(tokens.length, 3900);
  assert.equal(new Set(tokens.map((row) => row.composite_idempotency_key)).size, 3900);
  assert.deepEqual(cleanup.requiredOrder, ["InteractionSignal", "Timeline", "ActualManagement", "ServiceCoverage", "Opportunity", "Contact", "Account"]);
  assert.equal(cleanup.executionAuthorized, false);
  assert.equal(cleanup.cleanupReady, false);
});

test("D1 public decision artifacts do not expose principals, credentials, production, or Dataverse GUIDs", async () => {
  const paths = [
    "docs/d365/d365-ai-demo-200-consolidation-report.md",
    "docs/d365/d365-ai-demo-200-metadata-preflight-report.md",
    "docs/d365/d365-ai-demo-200-metadata-preflight-manifest.json",
    "docs/d365/d365-ai-demo-200-field-classification.json",
    "docs/d365/d365-ai-demo-200-choice-reconciliation.json",
    "docs/d365/d365-ai-demo-200-reference-mapping-summary.json",
    "docs/d365/d365-ai-demo-200-owner-candidates.json",
    "docs/d365/d365-ai-demo-200-department-team-candidates.json",
    "docs/d365/d365-ai-demo-200-pilot-candidate-manifest.json",
    "docs/d365/d365-ai-demo-200-import-plan-zh.md",
    "docs/d365/d365-ai-demo-200-cleanup-contract.json",
  ];
  const forbidden = [
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    /lcn-crm\.crm7\.dynamics\.com/i,
    /Authorization\s*:/i,
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /client[_ -]?secret/i,
    /refresh[_ -]?token/i,
    /access[_ -]?token/i,
    /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  ];
  for (const path of paths) {
    const content = await readFile(new URL(path, root), "utf8");
    for (const pattern of forbidden) assert.doesNotMatch(content, pattern, `${path} matched ${pattern}`);
  }
});
