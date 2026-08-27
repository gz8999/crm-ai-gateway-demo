import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function json(path) {
  return JSON.parse(await readFile(new URL(path, root), 'utf8'));
}

const artifacts = [
  'docs/d365/d365-ai-demo-data-blueprint-zh.md',
  'docs/d365/d365-ai-demo-data-generation-contract.json',
  'docs/d365/d365-ai-demo-scenario-story-matrix-zh.md',
  'docs/d365/d365-ai-demo-field-mapping-zh.md',
  'docs/d365/d365-ai-demo-import-cleanup-plan-zh.md',
  'docs/d365/d365-ai-demo-data-validation-rules.json',
  'docs/d365/d365-ai-demo-data-contract-reconciliation.md',
];

test('R2G-A freezes the requested offline data scale and relationships', async () => {
  const contract = await json('docs/d365/d365-ai-demo-data-generation-contract.json');
  assert.deepEqual(contract.scale, {
    accounts: 30,
    contacts: 60,
    opportunities: 150,
    actualManagement: 100,
    serviceCoverage: 210,
    nativeTimeline: 1400,
    interactionSignals: 1050,
  });
  assert.equal(contract.accountContactModel.opportunitiesPerAccount * contract.scale.accounts, contract.scale.opportunities);
  assert.equal(contract.accountContactModel.contactsPerAccount * contract.scale.accounts, contract.scale.contacts);
  assert.equal(contract.coverageModel.recordsPerAccount * contract.scale.accounts, contract.scale.serviceCoverage);
  assert.equal(contract.opportunityModel.statusDistribution.active, 60);
  assert.equal(contract.opportunityModel.statusDistribution.won, 55);
  assert.equal(contract.opportunityModel.statusDistribution.lost, 35);
  assert.equal(Object.values(contract.opportunityModel.statusDistribution).reduce((sum, value) => sum + value, 0), 150);
  assert.equal(contract.opportunityModel.actualAllocation.wonWithActual + contract.opportunityModel.actualAllocation.activeWithActual, 100);
  assert.equal(contract.opportunityModel.actualAllocation.maxActualPerOpportunity, 1);
  assert.equal(contract.opportunityModel.actualAllocation.lostWithActual, 0);
});

test('R2G-A freezes eight scenario counts and a non-risk healthy control', async () => {
  const contract = await json('docs/d365/d365-ai-demo-data-generation-contract.json');
  const expected = new Map([
    ['stalled-high-value', 15], ['budget-actual-gap', 15], ['data-contradiction', 12],
    ['growth-opportunity', 12], ['location-route-risk', 10], ['meeting-prep', 10],
    ['multi-risk-priority', 16], ['healthy-control', 10],
  ]);
  assert.equal(contract.scenarioDistribution.length, 8);
  assert.equal(contract.scenarioDistribution.reduce((sum, scenario) => sum + scenario.count, 0), 100);
  for (const scenario of contract.scenarioDistribution) {
    assert.equal(scenario.count, expected.get(scenario.id));
    assert.match(scenario.defaultToken, /^DEMO-OPP-\d{3}$/);
  }
  assert.equal(contract.scenarioDistribution.find((scenario) => scenario.id === 'healthy-control').expectedPriority, 'monitor');
  assert.equal(contract.backgroundDistribution.reduce((sum, group) => sum + group.count, 0), 50);
});

test('Timeline and signal contracts are deterministic and within approved ranges', async () => {
  const contract = await json('docs/d365/d365-ai-demo-data-generation-contract.json');
  assert.equal(contract.timelineModel.distribution.reduce((sum, tier) => sum + tier.records, 0), 1400);
  assert.equal(contract.timelineModel.distribution.reduce((sum, tier) => sum + tier.opportunities, 0), 150);
  assert.equal(contract.timelineModel.minimumActivityTypesPerOpportunity, 3);
  assert.equal(contract.interactionSignalModel.total / contract.timelineModel.total, 0.75);
  assert.ok(contract.interactionSignalModel.timelineCoverageRatio >= 0.65);
  assert.ok(contract.interactionSignalModel.timelineCoverageRatio <= 0.85);
  assert.equal(contract.timelineModel.rawTextExternalLlmAllowed, false);
});

test('Choice contract references the complete frozen 12-field, 75-option manifest', async () => {
  const contract = await json('docs/d365/d365-ai-demo-data-generation-contract.json');
  const choices = await json('docs/d365/d365-ai-demo-local-choice-option-values.json');
  assert.equal(choices.approvedChoiceCount, 12);
  assert.equal(choices.approvedOptionCount, 75);
  assert.equal(choices.fields.length, 12);
  assert.equal(choices.fields.reduce((sum, field) => sum + field.after.options.length, 0), 75);
  assert.ok(choices.fields.every((field) => field.ready && field.after.options.length > 0));
  assert.equal(contract.fieldSources.choiceManifest, 'docs/d365/d365-ai-demo-local-choice-option-values.json');
  assert.equal(contract.coverageModel.choiceValueSource, contract.fieldSources.choiceManifest);
  assert.equal(contract.interactionSignalModel.choiceValueSource, contract.fieldSources.choiceManifest);
});

test('Coverage key contract matches the deployed composite key and keeps demo token separate', async () => {
  const contract = await json('docs/d365/d365-ai-demo-data-generation-contract.json');
  const schema = await json('docs/d365/d365-ai-demo-schema-mvp-manifest.json');
  const implementation = await readFile(new URL('docs/d365/d365-ai-demo-schema-mvp-core-implementation.md', root), 'utf8');
  const coverage = schema.entities.find((entity) => entity.logicalName === 'aigw_customerservicecoverage');
  const coverageFields = new Set(coverage.fields.map((field) => field.logicalName));
  assert.deepEqual(contract.coverageModel.alternateKey, {
    schemaName: 'Aigw_CustomerservicecoverageKey',
    attributes: ['aigw_accountid', 'aigw_servicetype', 'aigw_startdate'],
    status: 'Active',
  });
  assert.match(implementation, /"schemaName": "Aigw_CustomerservicecoverageKey"[\s\S]*?"aigw_accountid"[\s\S]*?"aigw_servicetype"[\s\S]*?"aigw_startdate"/);
  assert.equal(contract.coverageModel.demoToken.attribute, 'aigw_demotoken');
  assert.equal(contract.coverageModel.demoToken.isAlternateKey, false);
  assert.deepEqual(contract.coverageModel.nullStartDateConflictCheck.normalizedBusinessFields, [
    'aigw_accountid', 'aigw_servicetype', 'aigw_coveragestatus', 'aigw_nextopportunitywindow',
  ]);
  for (const field of [
    ...contract.coverageModel.alternateKey.attributes,
    contract.coverageModel.demoToken.attribute,
    ...contract.coverageModel.nullStartDateConflictCheck.normalizedBusinessFields,
  ]) assert.ok(coverageFields.has(field), `unknown Coverage field ${field}`);
  assert.equal(contract.coverageModel.nullStartDateConflictCheck.alternateKeyProtectionClaimed, false);
});

test('Interaction Signal field contract deep-equals the frozen deployed Schema', async () => {
  const contract = await json('docs/d365/d365-ai-demo-data-generation-contract.json');
  const schema = await json('docs/d365/d365-ai-demo-schema-mvp-manifest.json');
  const signal = schema.entities.find((entity) => entity.logicalName === 'aigw_interactionsignal');
  const deployedFields = signal.fields.map((field) => field.logicalName);
  assert.deepEqual(contract.interactionSignalModel.deployedFieldSet, deployedFields);
  assert.equal(deployedFields.length, 25);
  const twoOptions = signal.fields.filter((field) => field.dataType === 'TwoOptions').map((field) => field.logicalName);
  assert.deepEqual(contract.interactionSignalModel.twoOptionsFields, twoOptions);
  assert.deepEqual(contract.interactionSignalModel.invalidFieldDenylist, [
    'aigw_nextstepdate', 'aigw_hascommitment', 'aigw_hasdecisionmaker', 'aigw_hasissue',
  ]);
  assert.ok(contract.interactionSignalModel.invalidFieldDenylist.every((field) => !deployedFields.includes(field)));
  assert.deepEqual(contract.interactionSignalModel.derivedOnly, ['hasIssue']);
  assert.match(contract.interactionSignalModel.dateSemantics.aigw_commitmentduedate, /commitment deadline only/);
  assert.deepEqual(contract.schemaReconciliation.unknownCrmLogicalNames, []);
  assert.equal(contract.schemaReconciliation.unknownCrmLogicalNameCount, 0);
  assert.equal(contract.schemaReconciliation.invalidNamesAreDenylistOnly, true);
});

test('Safe Context, master data and CRM-answer exclusions are explicit', async () => {
  const contract = await json('docs/d365/d365-ai-demo-data-generation-contract.json');
  assert.equal(contract.safeContext.rawDataSent, false);
  assert.equal(contract.safeContext.exactAmountSentToModel, false);
  assert.equal(contract.safeContext.customerIdentityMasked, true);
  assert.equal(contract.safeContext.departmentFilterBeforeBuild, true);
  for (const forbidden of ['customer name', 'exact amount', 'raw timeline text', 'scenario id', 'golden metadata']) {
    assert.ok(contract.safeContext.excluded.includes(forbidden));
  }
  assert.equal(contract.locationAndRoute.activeLocationCount, 51);
  assert.equal(contract.locationAndRoute.createMasterData, false);
  assert.equal(contract.locationAndRoute.safeContextUsesRawValues, false);
  assert.equal(contract.opportunityModel.scenarioFieldsInCrm, false);
  assert.ok(contract.opportunityModel.deprecatedWriteDenylist.includes('opportunity.aigw_yearrevenueactualcny'));
});

test('Import, cleanup and offline execution boundaries remain closed', async () => {
  const contract = await json('docs/d365/d365-ai-demo-data-generation-contract.json');
  const cleanup = contract.importAndCleanup.cleanupOrder;
  assert.ok(cleanup.indexOf('aigw_interactionsignal') < cleanup.indexOf('native timeline'));
  assert.ok(cleanup.indexOf('native timeline') < cleanup.indexOf('opportunity'));
  assert.ok(cleanup.indexOf('aigw_actualmanagement') < cleanup.indexOf('opportunity'));
  assert.ok(cleanup.indexOf('aigw_customerservicecoverage') < cleanup.indexOf('account'));
  assert.ok(cleanup.indexOf('opportunity') < cleanup.indexOf('contact'));
  assert.ok(cleanup.indexOf('contact') < cleanup.indexOf('account'));
  assert.equal(contract.importAndCleanup.locationAndPolPodExcludedFromCleanup, true);
  assert.equal(contract.executionBoundary.dataverseRequests, 0);
  assert.equal(contract.executionBoundary.externalLlmCalls, 0);
  assert.equal(contract.executionBoundary.formalWorkbookGenerated, false);
  assert.equal(contract.executionBoundary.dataversePayloadGenerated, false);
  assert.equal(contract.gates.demoDataDesignReady, true);
  assert.equal(contract.gates.offlineWorkbookGenerationReady, true);
  assert.equal(contract.gates.demoDataGenerationStarted, false);
  assert.equal(contract.gates.pilotImportReady, false);
  assert.equal(contract.gates.fullImportReady, false);
});

test('Validation rules cover required gates and every deliverable is present', async () => {
  const rules = await json('docs/d365/d365-ai-demo-data-validation-rules.json');
  const ids = new Set(rules.rules.map((rule) => rule.id));
  for (const required of ['COUNT-001', 'SCHEMA-REF-001', 'SCHEMA-REF-002', 'KEY-001', 'KEY-002', 'SIGNAL-001', 'SIGNAL-002', 'REL-001', 'ACT-001', 'CHOICE-001', 'COV-001', 'COV-002', 'TL-001', 'SIG-001', 'SCN-001', 'SCN-003', 'SAFE-001', 'FIELD-002', 'TOKEN-001', 'CLEAN-001', 'ISOLATION-001', 'OFFLINE-001']) {
    assert.ok(ids.has(required), `missing validation rule ${required}`);
  }
  assert.equal(rules.completion.p0Allowed, 0);
  assert.equal(rules.completion.p1Allowed, 0);
  for (const path of artifacts) {
    const content = await readFile(new URL(path, root), 'utf8');
    assert.ok(content.length > 200, `${path} is unexpectedly small`);
  }
});

test('R2G-A deliverables contain no environment, credentials or absolute user paths', async () => {
  const forbidden = [
    /lcn-crm\.crm7\.dynamics\.com/i,
    /\/Users\/gz\//,
    /Authorization\s*:/i,
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /client[_ -]?secret/i,
    /refresh[_ -]?token/i,
  ];
  for (const path of artifacts) {
    const content = await readFile(new URL(path, root), 'utf8');
    for (const pattern of forbidden) assert.doesNotMatch(content, pattern, `${path} matched ${pattern}`);
  }
});
