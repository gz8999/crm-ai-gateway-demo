import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { createDynamicsClient } from "../server/dynamicsClient.mjs";
import { createFrozenDatasetRuntimeService } from "../server/d365/frozenDatasetRuntimeService.mjs";
import { buildHighFidelityContext, HIGH_FIDELITY_MODE } from "../server/ai/deepAnalysis/highFidelityContext.mjs";
import { runHighFidelityExternal, validateHighFidelitySelection } from "../server/ai/deepAnalysis/highFidelityProvider.mjs";
import { validateHighFidelityProviderPayload } from "../server/ai/deepAnalysis/deepAnalysisSafety.mjs";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "docs", "demo", "goal4b-r1-json-output-validation.json");
const base = dotenv.parse(await fs.readFile(path.join(ROOT, ".env"), "utf8").catch(() => ""));
const profile = dotenv.parse(await fs.readFile(path.join(ROOT, ".env.external.local"), "utf8").catch(() => ""));
const env = { ...base, ...profile, ...process.env, ALLOW_EXTERNAL_AI: "true", CRM_WRITEBACK_ENABLED: "false", DEEP_ANALYSIS_HIGH_FIDELITY_TRANSPORT: "json-object" };

const counters = { externalCalls: 0, retries: 0, fallback: 0, d365Get: 0 };

function providerFetch(input, init) {
  counters.externalCalls += 1;
  if (counters.externalCalls > 4) throw new Error("GOAL 4B-R1 call budget exceeded");
  return fetch(input, init);
}

function syntheticData() {
  return {
    entries: {
      Opportunity: [{ token: "SYN-OPP-001", id: "opp-syn-001" }],
      Timeline: [{ token: "SYN-TL-001", id: "act-syn-001", parentId: "opp-syn-001" }],
    },
    accounts: [{ accountid: "acc-syn-001", name: "Synthetic Account 001", accountnumber: "SYN-ACC-001" }],
    contacts: [{ contactid: "con-syn-001", fullname: "Synthetic Contact 001", jobtitle: "采购负责人" }],
    opportunities: [{
      opportunityid: "opp-syn-001", _parentaccountid_value: "acc-syn-001", _parentcontactid_value: "con-syn-001",
      name: "Synthetic Timeline Review", description: "Synthetic business review with one open route confirmation.",
      aigw_customernamecn: "Synthetic Customer 001", aigw_customername: "Synthetic Customer 001",
      aigw_nextaction: "Confirm the route window", aigw_nextactiondate: "2026-07-21", estimatedclosedate: "2026-08-15",
      createdon: "2026-07-01", estimatedvalue: 100000, actualvalue: 90000, aigw_yearrevenuebudget: 100000,
      aigw_yeargpmpbudget: 12000, aigw_yearrevenueactual: 90000, aigw_yeargpmpactual: 9000,
      aigw_goodshandled: "Synthetic cargo", aigw_projectsizeunit: "10 TEU", aigw_warehousescale: "Small",
      aigw_transportterms: "Synthetic terms", aigw_customerneed_choice: "Route confirmation", aigw_proposalcontent_choice: "Standard proposal",
      aigw_researchbackground_choice: "Synthetic review", aigw_decider_choice: "Procurement", aigw_transportmode: "OE",
    }],
    signals: [],
    actuals: [],
    coverages: [],
    timeline: { activities: [{ activityid: "act-syn-001", _regardingobjectid_value: "opp-syn-001", subject: "Synthetic route review", description: "Customer confirmed interest and requested route timing confirmation.", activitytypecode: "phonecall", scheduledstart: "2026-07-15" }], annotations: [] },
  };
}

function syntheticScope() {
  return { contexts: [{
    opportunityToken: "SYN-OPP-001", accountToken: "SYN-ACC-001", customerToken: "SYN-CUST-001", salesDepartment: "SYN-DEPT-01",
    opportunityState: "Active", stage: "Qualify", priority: "Medium", forecastCategory: "Pipeline", nextAction: "Confirm route window",
    transportMode: "OE", safeContext: { accountToken: "SYN-ACC-001", customerToken: "SYN-CUST-001" },
  }] };
}

function buildPayload(context, token, templateCode = "DA-02") {
  return {
    analysisContextMode: HIGH_FIDELITY_MODE, templateCode, templateVersion: "v1", redactionRuleVersion: context.redactionRuleVersion,
    highFidelityContext: context, instruction: "Analyze the identity-redacted business text and Timeline for management review.", responseLocale: "zh-CN",
  };
}

function safeResult(label, result) {
  return {
    label, ok: result.ok === true, reason: result.reason || "", diagnosticCategory: result.diagnosticCategory || "",
    requestBodyHash: result.requestBodyHash || "", requestSchemaHash: result.requestSchemaHash || "", evidenceContractHash: result.evidenceContractHash || "",
    evidenceAliasCount: result.evidenceAliasCount || 0, observation: result.observation ? {
      httpStatus: result.observation.httpStatus || null, choiceCount: result.observation.choiceCount || 0, finishReason: result.observation.finishReason || "",
      messageContentPresent: result.observation.messageContentPresent === true, messageContentType: result.observation.messageContentType || "",
      messageContentLength: result.observation.messageContentLength || 0, messageContentHash: result.observation.messageContentHash || "",
      responseBodyHash: result.observation.responseBodyHash || "", responseIdHash: result.observation.responseId ? sha256(result.observation.responseId) : "", latencyMs: result.observation.latencyMs || null,
      tokenUsage: result.observation.tokenUsage || null,
    } : null,
  };
}

function sha256(value) { return createHash("sha256").update(String(value), "utf8").digest("hex"); }

async function runExternal(label, context, token, templateCode = "DA-02") {
  const payload = buildPayload(context, token, templateCode);
  const safety = validateHighFidelityProviderPayload(payload);
  if (!safety.ok) throw new Error(`${label} Safe Context blocked: ${safety.reason}`);
  const result = await runHighFidelityExternal({ payload, requestId: `goal4b-r1-${label.toLowerCase().replaceAll(/[^a-z0-9]+/giu, "-")}`, env, fetchImpl: providerFetch });
  const safe = safeResult(label, result);
  if (!result.ok) throw new Error(`${label} stopped: ${result.reason}`);
  return safe;
}

try {
  const syntheticContext = buildHighFidelityContext({ data: syntheticData(), scope: syntheticScope(), opportunityToken: "SYN-OPP-001", now: new Date("2026-07-21T00:00:00Z") });
  const synthetic = [];
  const resumeSecond = process.env.GOAL4B_R1_RESUME_SECOND === "true";
  const freshPair = process.env.GOAL4B_R1_FRESH_PAIR === "true";
  if (freshPair) {
    synthetic.push(await runExternal("synthetic-03", syntheticContext, "SYN-OPP-001"));
    synthetic.push(await runExternal("synthetic-04", syntheticContext, "SYN-OPP-001"));
  } else {
    if (resumeSecond) synthetic.push({ label: "synthetic-01", ok: false, reason: "argument_schema_invalid", requestBodyHash: "", requestSchemaHash: "", evidenceContractHash: "", evidenceAliasCount: 0, observation: null });
    else synthetic.push(await runExternal("synthetic-01", syntheticContext, "SYN-OPP-001"));
    synthetic.push(await runExternal("synthetic-02", syntheticContext, "SYN-OPP-001"));
  }

  const real = [];
  if (freshPair || !resumeSecond) {
    const client = createDynamicsClient({ env });
    const frozen = createFrozenDatasetRuntimeService({ client, env, root: ROOT });
    for (const token of ["DEMO-OPP-010", "DEMO-OPP-030"]) {
      const loaded = await frozen.getAnalysisContext({ opportunityToken: token, department: "all" });
      counters.d365Get += 1;
      if (!loaded) throw new Error(`D365 context unavailable: ${token}`);
      real.push(await runExternal(token, buildHighFidelityContext({ data: loaded.data, scope: loaded.scope, opportunityToken: loaded.opportunityToken, now: new Date("2026-07-21T00:00:00Z") }), token, token === "DEMO-OPP-030" ? "DA-02" : "DA-07"));
    }
  }

  const summary = {
    phase: "GOAL 4B-R1", transport: "response_format=json_object", toolsSent: false, toolChoiceSent: false,
    singleContentParse: true, repair: false, retryCount: counters.retries, fallbackCount: counters.fallback,
    synthetic, real, priorExternalLlmCalls: freshPair ? 2 : resumeSecond ? 1 : 0, externalLlmCalls: (freshPair ? 2 : resumeSecond ? 1 : 0) + counters.externalCalls, newExternalLlmCalls: counters.externalCalls, d365Get: counters.d365Get, crmWriteback: false, productionRequests: 0,
    validationScope: ["Synthetic 2/2", "DEMO-OPP-010", "DEMO-OPP-030"],
    stableTransportReady: [...synthetic, ...real].every((item) => item.ok) && synthetic.length === 2 && synthetic[0].requestBodyHash === synthetic[1].requestBodyHash,
  };
  await fs.writeFile(REPORT, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ phase: summary.phase, transport: summary.transport, externalLlmCalls: summary.externalLlmCalls, newExternalLlmCalls: summary.newExternalLlmCalls, d365Get: summary.d365Get, synthetic: synthetic.map(({ label, ok, reason, observation }) => ({ label, ok, reason, finishReason: observation?.finishReason || "", contentLength: observation?.messageContentLength || 0 })), real: real.map(({ label, ok, reason, observation }) => ({ label, ok, reason, finishReason: observation?.finishReason || "", contentLength: observation?.messageContentLength || 0 })), stableTransportReady: summary.stableTransportReady }, null, 2));
} catch (error) {
  const summary = {
    phase: "GOAL 4B-R1", transport: "response_format=json_object", toolsSent: false, toolChoiceSent: false,
    singleContentParse: true, repair: false, retryCount: counters.retries, fallbackCount: counters.fallback,
    externalLlmCalls: counters.externalCalls, d365Get: counters.d365Get, crmWriteback: false, productionRequests: 0,
    validationScope: ["Synthetic 2/2", "DEMO-OPP-010", "DEMO-OPP-030"],
    stoppedOnFailure: true, stopReason: String(error?.message || "validation_stopped").replaceAll(/secret|key|authorization/giu, "redacted"),
    realExecuted: 0, stableTransportReady: false,
  };
  await fs.writeFile(REPORT, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
  console.error(summary.stopReason);
  process.exitCode = 1;
}
