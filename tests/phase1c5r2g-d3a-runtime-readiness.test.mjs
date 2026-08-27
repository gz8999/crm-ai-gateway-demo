import assert from "node:assert/strict";
import crypto from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const sha = async (path) => crypto.createHash("sha256").update(await readFile(new URL(path, root))).digest("hex");

test("D3A adopts the exact authoritative v1.1 workbook", async () => {
  const path = "artifacts/d365/CRM_AI_Gateway_D365_Demo_200_v1_1.xlsx";
  assert.equal((await stat(new URL(path, root))).size, 952684);
  assert.equal(await sha(path), "e19e41b95c4392858e2702c0b4a239fb545697947bd556832d17734304ad28dd");
});

test("D3A adopts the exact Projection Candidate without promoting it", async () => {
  const path = "artifacts/d365/CRM_AI_Gateway_D365_Demo_200_ProjectionCandidate_v1.xlsx";
  assert.equal((await stat(new URL(path, root))).size, 566684);
  assert.equal(await sha(path), "7a3a1d5b0cc3b0a4137f9eeaf33cacd707ef07f965bf8c8478aa235cfb1a5f11");
  const recheck = await readJson("docs/d365/d365-ai-demo-200-projection-candidate-recheck.json");
  assert.equal(recheck.projectionCandidateGenerated, true);
  assert.equal(recheck.importProjectionReady, false);
});

test("D3A rechecks Customer Need, Proposal, and LCMS semantics", async () => {
  const manifest = await readJson("docs/d365/d365-ai-demo-200-d3-readiness-manifest.json");
  assert.equal(manifest.integrity.choice.customerNeedUnknownCount, 0);
  assert.equal(manifest.integrity.choice.proposalUnknownCount, 0);
  assert.equal(manifest.integrity.choice.lcmsTmsViolationCount, 0);
  assert.equal(manifest.integrity.choice.choiceSemanticConflictCount, 0);
});

test("D3A rechecks all custom-table Primary Names", async () => {
  const manifest = await readJson("docs/d365/d365-ai-demo-200-d3-readiness-manifest.json");
  assert.equal(manifest.integrity.primaryNames.ActualManagement, 130);
  assert.equal(manifest.integrity.primaryNames.ServiceCoverage, 240);
  assert.equal(manifest.integrity.primaryNames.InteractionSignal, 1350);
  assert.equal(manifest.integrity.primaryNames.duplicateCount, 0);
});

test("D3A distinguishes the legacy FieldMapping alias from Dataverse record GUIDs", async () => {
  const manifest = await readJson("docs/d365/d365-ai-demo-200-d3-readiness-manifest.json");
  assert.equal(manifest.integrity.publicWorkbookGuidAudit.businessRecordGuidCount, 0);
  assert.equal(manifest.integrity.publicWorkbookGuidAudit.structuralGuidAliasCount, 1);
  assert.equal(manifest.gates.P2Count, 2);
});

test("D3A resolves POL/POD with no blocked values", async () => {
  const manifest = await readJson("docs/d365/d365-ai-demo-200-d3-readiness-manifest.json");
  assert.deepEqual(manifest.integrity.polPod, { resolvedExactCount: 6, resolvedNormalizedCount: 5, fallbackOTRCount: 10, blockedCount: 0 });
});

test("D3A never presents OTR fallback as an exact port or airport match", async () => {
  const recheck = await readJson("docs/d365/d365-ai-demo-200-projection-candidate-recheck.json");
  assert.equal(recheck.otrFallbackCount, 10);
  assert.equal(recheck.otrFallbackPreservesOriginal, true);
  assert.equal(recheck.otrFallbackClaimsExactMatch, 0);
});

test("D3A Owner candidate is ordinary, active, interactive, licensed, and non-admin", async () => {
  const owner = await readJson("docs/d365/d365-ai-demo-200-owner-runtime-candidates.json");
  assert.equal(owner.candidates.length, 1);
  const candidate = owner.candidates[0];
  assert.equal(candidate.principalType, "systemuser");
  assert.equal(candidate.active, true);
  assert.equal(candidate.interactive, true);
  assert.equal(candidate.licensed, true);
  assert.equal(candidate.applicationUser, false);
  assert.equal(candidate.administrator, false);
  assert.equal(candidate.securityReady, true);
});

test("D3A never auto-approves an Application User or Owner mapping", async () => {
  const owner = await readJson("docs/d365/d365-ai-demo-200-owner-runtime-candidates.json");
  assert.equal(owner.candidates.some((row) => row.applicationUser), false);
  assert.equal(owner.ownerMappingApproved, false);
  assert.equal(owner.candidates.every((row) => row.approvalRequired), true);
});

test("D3A defines seven unique Owner Team names without conflicts", async () => {
  const teams = await readJson("docs/d365/d365-ai-demo-200-team-runtime-specifications.json");
  assert.equal(teams.teams.length, 7);
  assert.equal(new Set(teams.teams.map((row) => row.proposedTeamName)).size, 7);
  assert.equal(teams.teams.every((row) => row.teamType === "Owner Team"), true);
  assert.equal(teams.teamNameConflictCount, 0);
});

test("D3A maps each DEPT token to one distinct Team specification", async () => {
  const teams = await readJson("docs/d365/d365-ai-demo-200-team-runtime-specifications.json");
  assert.deepEqual(teams.teams.map((row) => row.teamToken), ["DEPT-01", "DEPT-02", "DEPT-03", "DEPT-04", "DEPT-05", "DEPT-06", "DEPT-91"]);
  assert.equal(teams.distinctTeamPerDepartmentToken, true);
  assert.equal(teams.teams.every((row) => row.creationApproved === false), true);
});

test("D3A minimal role contains no Delete permission", async () => {
  const role = await readJson("docs/d365/d365-ai-demo-200-role-delta-analysis.json");
  assert.equal(role.permissions.every((row) => row.delete === false), true);
  assert.equal(role.containsDelete, false);
});

test("D3A minimal role contains no Customization, Publish, or security administration", async () => {
  const role = await readJson("docs/d365/d365-ai-demo-200-role-delta-analysis.json");
  assert.equal(role.containsCustomizationOrPublish, false);
  assert.equal(role.privilegesExplicitlyDenied.includes("Customization"), true);
  assert.equal(role.privilegesExplicitlyDenied.includes("Publish"), true);
  assert.equal(role.privilegesExplicitlyDenied.includes("Security role administration"), true);
  assert.equal(role.roleReuseCandidateReady, false);
  assert.equal(role.roleCreationRequired, true);
});

test("D3A freezes the compact Pilot at 7/9/24/12/15/206/154", async () => {
  const pilot = await readJson("docs/d365/d365-ai-demo-200-compact-pilot-recheck.json");
  assert.deepEqual(pilot.counts, { Account: 7, Contact: 9, Opportunity: 24, ActualManagement: 12, ServiceCoverage: 15, Timeline: 206, InteractionSignal: 154 });
  assert.equal(pilot.coversAllSevenDepartments, true);
  assert.equal(pilot.coversAllEightScenarios, true);
  assert.equal(pilot.compactPilotApproved, false);
  assert.equal(pilot.pilotWorkbookGenerated, false);
});

test("D3A Projection Candidate has safe tokens, no GUID, no payload, and no direct state patch columns", async () => {
  const recheck = await readJson("docs/d365/d365-ai-demo-200-projection-candidate-recheck.json");
  assert.equal(recheck.lookupsUseSafeTokens, true);
  assert.equal(recheck.guidCount, 0);
  assert.equal(recheck.apiPayloadPresent, false);
  assert.equal(recheck.executableImportScriptPresent, false);
  assert.deepEqual(recheck.directStateStatusCreateOrPatchColumns, []);
  assert.deepEqual(recheck.actualCloseDateReferences, ["_actual_close_date_for_action"]);
  assert.equal(recheck.ownerMappingApprovalTrueCount, 0);
  assert.equal(recheck.departmentTeamApprovalTrueCount, 0);
});

test("D3A remains GET-only, production-isolated, and import unauthorized", async () => {
  const manifest = await readJson("docs/d365/d365-ai-demo-200-d3-readiness-manifest.json");
  assert.equal(manifest.requests.businessCRMGET, 0);
  for (const key of ["POST", "PATCH", "DELETE", "Publish", "productionRequests", "externalLLMCalls"]) assert.equal(manifest.requests[key], 0, key);
  assert.equal(manifest.gates.TeamSetupAuthorized, false);
  assert.equal(manifest.gates.PilotImportReady, false);
  assert.equal(manifest.gates.PilotImportAuthorized, false);
  assert.equal(manifest.gates.FullImportReady, false);
  await assert.rejects(access(new URL("artifacts/d365/CRM_AI_Gateway_D365_Demo_200_Pilot_v1.xlsx", root)));
});

test("D3A public artifacts expose no private identity, GUID, credential, or production host", async () => {
  const paths = [
    "docs/d365/d365-ai-demo-200-d3-readiness-report.md",
    "docs/d365/d365-ai-demo-200-d3-readiness-manifest.json",
    "docs/d365/d365-ai-demo-200-owner-runtime-candidates.json",
    "docs/d365/d365-ai-demo-200-team-runtime-specifications.json",
    "docs/d365/d365-ai-demo-200-role-delta-analysis.json",
    "docs/d365/d365-ai-demo-200-team-setup-execution-plan-zh.md",
    "docs/d365/d365-ai-demo-200-team-setup-rollback-plan.json",
    "docs/d365/d365-ai-demo-200-d3-write-decision-pack-zh.md",
    "docs/d365/d365-ai-demo-200-projection-candidate-recheck.json",
    "docs/d365/d365-ai-demo-200-compact-pilot-recheck.json",
  ];
  const forbidden = [
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    /lcn-crm\.crm7\.dynamics\.com/i,
    /Authorization\s*:/i,
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    /client[_ -]?secret|refresh[_ -]?token|access[_ -]?token/i,
  ];
  for (const path of paths) {
    const content = await readFile(new URL(path, root), "utf8");
    for (const pattern of forbidden) assert.doesNotMatch(content, pattern, `${path} matched ${pattern}`);
  }
});
