import 'dotenv/config';
import { createDynamicsClient } from '../server/dynamicsClient.mjs';
import { createFrozenDatasetRuntimeService } from '../server/d365/frozenDatasetRuntimeService.mjs';
import { buildHighFidelityContext, HIGH_FIDELITY_MODE } from '../server/ai/deepAnalysis/highFidelityContext.mjs';
import { runHighFidelityExternal } from '../server/ai/deepAnalysis/highFidelityProvider.mjs';
import { validateHighFidelityProviderPayload } from '../server/ai/deepAnalysis/deepAnalysisSafety.mjs';

const env = { ...process.env, ALLOW_EXTERNAL_AI: 'true', CRM_WRITEBACK_ENABLED: 'false', DEEP_ANALYSIS_HIGH_FIDELITY_TRANSPORT: 'json-object' };

const client = createDynamicsClient({ env, rootPath: process.cwd() });
const frozen = createFrozenDatasetRuntimeService({ client, env, root: process.cwd() });
const loaded = await frozen.getAnalysisContext({ opportunityToken: 'DEMO-OPP-010', department: 'all' });
if (!loaded) throw new Error('context unavailable');
const context = buildHighFidelityContext({ data: loaded.data, scope: loaded.scope, opportunityToken: loaded.opportunityToken, now: new Date('2026-07-21T00:00:00Z') });
const payload = {
  analysisContextMode: HIGH_FIDELITY_MODE,
  templateCode: 'DA-07',
  templateVersion: 'v1',
  redactionRuleVersion: context.redactionRuleVersion,
  highFidelityContext: context,
  instruction: 'Analyze the identity-redacted business text and Timeline for management review.',
  responseLocale: 'zh-CN',
};

const safety = validateHighFidelityProviderPayload(payload);
console.log('safety ok', safety.ok, safety.reason || '');

const result = await runHighFidelityExternal({
  payload,
  requestId: 'debug-demo-opp-010',
  env,
  fetchImpl: (input, init) => {
    console.log('request url', String(input));
    return fetch(input, init);
  },
});
console.log('result ok', result.ok, 'reason', result.reason || '');
if (!result.ok) {
  console.log('diagnosticCategory', result.diagnosticCategory || '');
  console.log('validation', JSON.stringify(result.validation, null, 2));
  console.log('observation', JSON.stringify(result.observation, null, 2));
}
