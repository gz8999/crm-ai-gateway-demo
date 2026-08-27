import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const workbookPath = new URL('../artifacts/d365/CRM_AI_Gateway_D365_Chinese_Demo_Data_v2.xlsx', import.meta.url).pathname;
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const unzip = (entry) => execFileSync('unzip', ['-p', workbookPath, entry], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

test('R2G-B validation manifest freezes all counts, distributions and offline gates', async () => {
  const manifest = await readJson('docs/d365/d365-ai-demo-workbook-validation-manifest.json');
  assert.deepEqual(manifest.counts, {
    Account: 30,
    Contact: 60,
    Opportunity: 150,
    ActualManagement: 100,
    ServiceCoverage: 210,
    Timeline: 1400,
    InteractionSignal: 1050,
  });
  assert.equal(manifest.totalBusinessRows, 3000);
  const workbookBytes = await readFile(workbookPath);
  assert.equal(manifest.workbook.sizeBytes, workbookBytes.length);
  assert.equal(manifest.workbook.sha256, crypto.createHash('sha256').update(workbookBytes).digest('hex'));
  assert.equal(manifest.workbook.sheetCount, 14);
  assert.equal(manifest.workbook.formulaCount, 0);
  assert.deepEqual(manifest.opportunityStatus, { Active: 60, Won: 55, Lost: 35 });
  assert.deepEqual(manifest.actualDistribution, { won: 55, active: 45, lost: 0 });
  assert.deepEqual(Object.values(manifest.scenarioDistribution), [15, 15, 12, 12, 10, 10, 16, 10]);
  assert.equal(manifest.choice.fieldCount, 12);
  assert.equal(manifest.choice.optionCount, 75);
  assert.equal(manifest.choice.deepCompare, true);
  assert.equal(manifest.fieldContract.unknownCrmLogicalNames, 0);
  assert.equal(manifest.timelineSignal.coverageRatio, 0.75);
  assert.equal(manifest.p0Count, 0);
  assert.equal(manifest.p1Count, 0);
  assert.equal(manifest.p2Count, 0);
  assert.ok(manifest.validationRules.every((rule) => rule.status === 'PASS'));
  assert.equal(manifest.requests.DataverseGET, 0);
  assert.equal(manifest.requests.DataversePOST, 0);
  assert.equal(manifest.requests.DataversePATCH, 0);
  assert.equal(manifest.requests.DataverseDELETE, 0);
  assert.equal(manifest.requests.Publish, 0);
  assert.equal(manifest.requests.Production, 0);
  assert.equal(manifest.requests.ExternalLLM, 0);
  assert.equal(manifest.gates.workbookAcceptanceReady, true);
  assert.equal(manifest.gates.pilotImportReady, false);
  assert.equal(manifest.gates.fullImportReady, false);
});

test('R2G-B token and cleanup manifests cover exactly 3000 synthetic rows', async () => {
  const tokenManifest = await readJson('docs/d365/d365-ai-demo-workbook-token-manifest.json');
  const cleanup = await readJson('docs/d365/d365-ai-demo-workbook-cleanup-manifest.json');
  assert.equal(tokenManifest.count, 3000);
  assert.equal(cleanup.count, 3000);
  assert.equal(tokenManifest.generationRunToken, 'R2G-A-GEN-001');
  assert.equal(tokenManifest.workbookBuildToken, 'R2G-B-WB-001');
  assert.equal(new Set(tokenManifest.records.map((row) => row.record_token)).size, 3000);
  assert.equal(new Set(tokenManifest.records.map((row) => row.composite_idempotency_key)).size, 3000);
  assert.equal(cleanup.executionAuthorized, false);
  assert.equal(cleanup.locationAndPolPodExcluded, true);
  assert.ok(!cleanup.records.some((row) => /location|polpod/i.test(row.entity)));
  assert.deepEqual([...new Set(cleanup.records.map((row) => row.entity))], [
    'aigw_interactionsignal', 'native_timeline', 'aigw_customerservicecoverage',
    'aigw_actualmanagement', 'opportunity', 'contact', 'account',
  ]);
});

test('R2G-B workbook contains 14 filtered static sheets with frozen headers', async () => {
  const info = await stat(workbookPath);
  assert.ok(info.size > 300_000);
  const listing = execFileSync('unzip', ['-Z1', workbookPath], { encoding: 'utf8' });
  assert.equal((listing.match(/xl\/worksheets\/sheet\d+\.xml/g) ?? []).length, 14);
  assert.equal((listing.match(/xl\/tables\/table\d+\.xml/g) ?? []).length, 14);
  assert.doesNotMatch(listing, /vbaProject|externalLinks/i);
  const workbookXml = unzip('xl/workbook.xml');
  for (const name of ['使用说明','Account','Contact','Opportunity','ActualManagement','ServiceCoverage','Timeline','InteractionSignal','ChoiceMapping','ScenarioManifest','ImportTokenManifest','CleanupPlan','ValidationSummary','抽样预览']) {
    assert.match(workbookXml, new RegExp(`name="${name}"`));
  }
  assert.doesNotMatch(workbookXml, /state="hidden"/);
  const expectedRows = [15,31,61,151,101,211,1401,1051,76,151,3001,3001,36,15];
  for (let index = 1; index <= 14; index += 1) {
    const xml = unzip(`xl/worksheets/sheet${index}.xml`);
    assert.equal((xml.match(/<x:row\b/g) ?? []).length, expectedRows[index - 1]);
    assert.match(xml, /<x:pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen" \/>/);
    assert.doesNotMatch(xml, /<x:f(?:\s|>)/);
    assert.doesNotMatch(xml, /<x:mergeCells/);
    const table = unzip(`xl/tables/table${index}.xml`);
    assert.match(table, /<x:autoFilter /);
  }
  const crmDataXml = Array.from({ length: 7 }, (_, offset) => unzip(`xl/worksheets/sheet${offset + 2}.xml`)).join('\n');
  assert.doesNotMatch(crmDataXml, /scenario|golden|ai[_ ]?(?:risk|priority|answer)|aigw_yearrevenueactualcny/i);
});

test('R2G-B committed outputs contain no GUID, credentials, production host or payload', async () => {
  const paths = [
    'docs/d365/d365-ai-demo-workbook-generation-report.md',
    'docs/d365/d365-ai-demo-workbook-validation-manifest.json',
    'docs/d365/d365-ai-demo-workbook-token-manifest.json',
    'docs/d365/d365-ai-demo-workbook-cleanup-manifest.json',
    'docs/d365/d365-ai-demo-workbook-sample-review-zh.md',
  ];
  const forbidden = [
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    /lcn-crm\.crm7\.dynamics\.com/i,
    /Authorization\s*:/i,
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /client[_ -]?secret/i,
    /refresh[_ -]?token/i,
    /@(?:qq|gmail|outlook|163)\.com/i,
  ];
  for (const path of paths) {
    const content = await readFile(new URL(path, root), 'utf8');
    for (const pattern of forbidden) assert.doesNotMatch(content, pattern, `${path} matched ${pattern}`);
  }
});
