import assert from "node:assert/strict";
import crypto from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const workbookPath = new URL("../artifacts/d365/CRM_AI_Gateway_D365_Chinese_Demo_Data_v4_1.xlsx", import.meta.url).pathname;
const pilotWorkbookPath = new URL("../artifacts/d365/CRM_AI_Gateway_D365_Chinese_Demo_Pilot_v1.xlsx", import.meta.url).pathname;
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));

test("R2G-C1-R2 takes over the exact v4.1 workbook and corrected Contact contract", async () => {
  const bytes = await readFile(workbookPath);
  assert.equal((await stat(workbookPath)).size, 732677);
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), "1447d01c62e8e692c871ff9b0189a11bfc8eb48457a7eb47e09509878747b268");
  const manifest = await readJson("docs/d365/d365-ai-demo-v4-1-metadata-recheck-manifest.json");
  assert.deepEqual(manifest.contactLookup, { parentContactCount: 150, primaryContactCount: 0 });
  assert.equal(manifest.metadata.unknownLogicalNames.length, 0);
});

test("R2G-C1-R2 proves all corrected Choice semantics", async () => {
  const manifest = await readJson("docs/d365/d365-ai-demo-v4-1-metadata-recheck-manifest.json");
  assert.equal(manifest.metadata.unknownChoiceValues, 0);
  assert.equal(manifest.metadata.choiceSemanticConflicts, 0);
  assert.equal(manifest.choices.detail91Count, 30);
  assert.equal(manifest.choices.medicalDevices20Count, 12);
  assert.equal(manifest.choices.goods21Count, 0);
  assert.equal(manifest.choices.goods91Count, 66);
  assert.equal(manifest.choices.globalInitiative91Count, 150);
});

test("R2G-C1-R2 exposes Owner strategies as candidates and never as approvals", async () => {
  const owner = await readJson("docs/d365/d365-ai-demo-owner-mapping-candidates.json");
  assert.equal(owner.ownerCandidateMappingReady, true);
  assert.equal(owner.ownerMappingApproved, false);
  assert.equal(owner.strategies[0].rows.length, 6);
  assert.equal(owner.strategies[0].rows.every((row) => row.recommended && row.approvalRequired), true);
  assert.equal(owner.strategies[1].ready, false);
});

test("R2G-C1-R2 never aliases three Department tokens to one Team", async () => {
  const team = await readJson("docs/d365/d365-ai-demo-team-mapping-candidates.json");
  assert.deepEqual(team.rows.map((row) => row.departmentToken), ["DEPT-01", "DEPT-03", "DEPT-04"]);
  assert.equal(new Set(team.futureSetupRecommendation.map((row) => row.suggestedSecurityToken)).size, 3);
  assert.equal(team.departmentTeamCandidatesReady, false);
  assert.equal(team.departmentTeamMappingApproved, false);
  assert.equal(team.teamSetupRequired, true);
});

test("R2G-C1-R2 freezes the exact four-account recommendation and five scenarios", async () => {
  const pilot = await readJson("docs/d365/d365-ai-demo-four-account-pilot-analysis.json");
  assert.deepEqual(pilot.accountTokens, ["A-002", "A-006", "A-015", "A-019"]);
  assert.deepEqual(pilot.counts, { Account: 4, Contact: 8, Opportunity: 20, ActualManagement: 12, ServiceCoverage: 28, Timeline: 260, InteractionSignal: 194 });
  assert.equal(pilot.coverage.allRequiredScenariosCovered, true);
  assert.deepEqual(new Set(pilot.coverage.coveredScenarios), new Set(["stalled-high-value", "budget-actual-gap", "meeting-prep", "multi-risk-priority", "healthy-control"]));
  assert.equal(pilot.fourAccountPilotRecommended, true);
  assert.equal(pilot.fourAccountPilotApproved, false);
  assert.equal(pilot.pilotDatasetDefined, false);
  assert.equal(pilot.pilotWorkbookGenerated, false);
  await assert.rejects(access(pilotWorkbookPath));
});

test("R2G-C1-R2 keeps the phase GET-only and import unauthorized", async () => {
  const manifest = await readJson("docs/d365/d365-ai-demo-v4-1-metadata-recheck-manifest.json");
  assert.equal(manifest.requests.businessCRMGET, 0);
  assert.equal(manifest.requests.POST, 0);
  assert.equal(manifest.requests.PATCH, 0);
  assert.equal(manifest.requests.DELETE, 0);
  assert.equal(manifest.requests.Publish, 0);
  assert.equal(manifest.requests.productionRequests, 0);
  assert.equal(manifest.requests.externalLLMCalls, 0);
  assert.equal(manifest.gates.PilotImportReady, false);
  assert.equal(manifest.gates.PilotImportAuthorized, false);
  assert.equal(manifest.gates.FullImportReady, false);
});

test("R2G-C1-R2 public decision artifacts do not expose private principals", async () => {
  const paths = [
    "docs/d365/d365-ai-demo-v4-1-metadata-recheck-report.md",
    "docs/d365/d365-ai-demo-v4-1-metadata-recheck-manifest.json",
    "docs/d365/d365-ai-demo-owner-mapping-candidates.json",
    "docs/d365/d365-ai-demo-team-mapping-candidates.json",
    "docs/d365/d365-ai-demo-four-account-pilot-analysis.json",
    "docs/d365/d365-ai-demo-reference-mapping-decision-pack-zh.md",
  ];
  const forbidden = [
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    /crm-ai-demo-user@/i,
    /Zhou Wenzhe/i,
    /Authorization\s*:/i,
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /client[_ -]?secret/i,
    /refresh[_ -]?token/i,
  ];
  for (const path of paths) {
    const content = await readFile(new URL(path, root), "utf8");
    for (const pattern of forbidden) assert.doesNotMatch(content, pattern, `${path} matched ${pattern}`);
  }
});
