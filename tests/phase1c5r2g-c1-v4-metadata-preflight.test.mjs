import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const workbookPath = new URL('../artifacts/d365/CRM_AI_Gateway_D365_Chinese_Demo_Data_v4.xlsx', import.meta.url).pathname;
const pilotPath = new URL('../artifacts/d365/CRM_AI_Gateway_D365_Chinese_Demo_Pilot_v1.xlsx', import.meta.url).pathname;
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));

test('R2G-C1 takes over the exact user-approved v4 workbook', async () => {
  const bytes = await readFile(workbookPath);
  const info = await stat(workbookPath);
  assert.equal(info.size, 731565);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), 'f08a94a3caa62950dbaa96e2767e39afe6c79072296394db9d8736a3b2f683fd');
  execFileSync('unzip', ['-t', workbookPath], { stdio: 'pipe' });
  const listing = execFileSync('unzip', ['-Z1', workbookPath], { encoding: 'utf8' });
  assert.equal((listing.match(/xl\/worksheets\/sheet\d+\.xml/g) ?? []).length, 18);
  assert.doesNotMatch(listing, /vbaProject|externalLinks/i);
});

test('R2G-C1 repeats all v4 offline department and business gates', async () => {
  const manifest = await readJson('docs/d365/d365-ai-demo-v4-metadata-preflight-manifest.json');
  assert.deepEqual(manifest.counts, {
    Account: 30, Contact: 60, Opportunity: 150, ActualManagement: 100,
    ServiceCoverage: 210, Timeline: 1400, InteractionSignal: 1050, totalBusinessRows: 3000,
  });
  assert.deepEqual(manifest.departmentDistribution.salesDepartment, { '01': 108, '03': 30, '04': 12 });
  assert.deepEqual(manifest.departmentDistribution.bookingDepartment, { '01': 63, '26': 75, '02': 6, '09': 6 });
  assert.deepEqual(manifest.departmentDistribution.opportunityDetail, { '02': 45, '03': 42, '07': 21, '91': 30, '08': 12 });
  assert.equal(manifest.departmentDistribution.forbiddenDetail06Count, 0);
  assert.equal(manifest.offlineValidation.opportunityTypeChineseReady, true);
  assert.equal(manifest.offlineValidation.caseStageChineseReady, true);
  assert.equal(manifest.offlineValidation.opportunityNamesUnique, true);
  assert.equal(manifest.offlineValidation.opportunityBusinessNarrativeReady, true);
  assert.deepEqual(manifest.offlineValidation.actualDistribution, { won: 55, active: 45, lost: 0 });
  assert.equal(manifest.offlineValidation.coverageWindowOverlapCount, 0);
  assert.equal(manifest.offlineValidation.timelineExactDuplicateCount, 0);
  assert.ok(manifest.offlineValidation.timelineNormalizedUniqueRatio >= 0.95);
  assert.equal(manifest.offlineValidation.timelineBusinessAlignmentReady, true);
  assert.equal(manifest.offlineValidation.interactionSignalCoverageRatio, 0.75);
  assert.equal(manifest.offlineValidation.interactionSignalBusinessAlignmentReady, true);
});

test('R2G-C1 preserves GET-only evidence and reports Metadata blockers without weakening gates', async () => {
  const manifest = await readJson('docs/d365/d365-ai-demo-v4-metadata-preflight-manifest.json');
  assert.equal(manifest.metadata.unknownLogicalNames.length, 1);
  assert.equal(manifest.metadata.unknownLogicalNames[0].workbookField, 'primarycontactid');
  assert.equal(manifest.metadata.unknownLogicalNames[0].deployedField, 'parentcontactid');
  assert.equal(manifest.metadata.unknownChoiceValues, 0);
  assert.equal(manifest.metadata.choiceConflicts.length, 4);
  assert.equal(manifest.references.location.ready, true);
  assert.equal(manifest.references.polPod.ready, true);
  assert.equal(manifest.references.currency.ready, true);
  assert.equal(manifest.references.coverageTeam.ready, true);
  assert.equal(manifest.references.owner.ready, false);
  assert.equal(manifest.references.signalDepartmentTeam.ready, false);
  assert.deepEqual(manifest.requests, {
    metadataGET: 129, referenceMasterGET: 6, syntheticConflictCheckGET: 0,
    businessCRMRecordGET: 0, POST: 0, PATCH: 0, DELETE: 0, Publish: 0,
    productionRequests: 0, externalLLMCalls: 0,
  });
  assert.deepEqual(manifest.issues, { p0: 0, p1: 5, p2: 1 });
  assert.equal(manifest.gates.metadataSchemaPreflightReady, false);
  assert.equal(manifest.gates.choiceMetadataPreflightReady, false);
  assert.equal(manifest.gates.lookupResolutionReady, false);
  assert.equal(manifest.gates.pilotImportReady, false);
  assert.equal(manifest.gates.pilotImportAuthorized, false);
});

test('R2G-C1 proves the approved three-account Pilot is infeasible and does not emit a misleading workbook', async () => {
  const pilot = await readJson('docs/d365/d365-ai-demo-pilot-selection-manifest.json');
  assert.equal(pilot.selectionStatus, 'BLOCKED');
  assert.equal(pilot.exhaustiveSelectionResult.threeAccountCombinationCount, 4060);
  assert.equal(pilot.exhaustiveSelectionResult.conformingThreeAccountCount, 0);
  assert.equal(pilot.exhaustiveSelectionResult.minimumConformingAccountCount, 4);
  assert.equal(pilot.exhaustiveSelectionResult.conformingFourAccountCount, 1);
  assert.deepEqual(pilot.recommendedContractChangeCandidate.accountTokens, ['A-002', 'A-006', 'A-015', 'A-019']);
  assert.equal(pilot.pilotDatasetDefined, false);
  assert.equal(pilot.pilotWorkbookGenerated, false);
  await assert.rejects(access(pilotPath));
});

test('R2G-C1 public outputs contain no private record IDs, credentials, production host, or write authorization', async () => {
  const paths = [
    'docs/d365/d365-ai-demo-v4-consolidation-report.md',
    'docs/d365/d365-ai-demo-v4-metadata-preflight-report.md',
    'docs/d365/d365-ai-demo-v4-metadata-preflight-manifest.json',
    'docs/d365/d365-ai-demo-v4-lookup-resolution-summary.json',
    'docs/d365/d365-ai-demo-pilot-selection-manifest.json',
    'docs/d365/d365-ai-demo-pilot-import-plan-zh.md',
    'docs/d365/d365-ai-demo-pilot-cleanup-contract.json',
  ];
  const forbidden = [
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    /lcn-crm\.crm7\.dynamics\.com/i,
    /Authorization\s*:/i,
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /client[_ -]?secret/i,
    /refresh[_ -]?token/i,
  ];
  for (const path of paths) {
    const content = await readFile(new URL(path, root), 'utf8');
    for (const pattern of forbidden) assert.doesNotMatch(content, pattern, `${path} matched ${pattern}`);
  }
  const cleanup = await readJson('docs/d365/d365-ai-demo-pilot-cleanup-contract.json');
  assert.equal(cleanup.executionAuthorized, false);
  assert.deepEqual(cleanup.records, []);
});
