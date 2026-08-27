import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const script = fs.readFileSync(new URL("../scripts/dataverse/phase1c5r2f-form-view-security.mjs", import.meta.url), "utf8");
const { CHOICE_DEFINITIONS, extractChoiceMetadata, choiceGateStatus, gateCountStatus, buildProbeCleanupItems } = await import("../scripts/dataverse/phase1c5r2f-form-view-security.mjs");

test("R2F executor is locked to the test Dataverse hostname", () => {
  assert.match(script, /org91f5f65f\.crm5\.dynamics\.com/);
  assert.match(script, /lcn-crm\.crm7\.dynamics\.com/);
  assert.match(script, /Only the approved test hostname is allowed/);
  assert.match(script, /AI_PROVIDER/);
  assert.match(script, /ALLOW_EXTERNAL_AI/);
});

test("R2F executor defaults to dry-run and requires explicit write confirmations", () => {
  assert.match(script, /dryRun: !apply/);
  assert.match(script, /--confirm-test-environment/);
  assert.match(script, /--confirm-publish-or-deploy/);
  assert.match(script, /CONFIRM_D365_TEST_WRITE_PHASE_1C_5R2F/);
});

test("R2F scope never modifies the protected form, App, BPF or Plugin", () => {
  assert.match(script, /PROTECTED_FORM_ID/);
  assert.match(script, /No Protected Form/);
  assert.doesNotMatch(script, /systemforms\(\$\{PROTECTED_FORM_ID\}\).*patch/i);
  assert.doesNotMatch(script, /AddAppComponents|RemoveAppComponents|ActivateBPF|DeactivateBPF/);
  assert.match(script, /PublishXml/);
  assert.match(script, /const publishEntities = flags\.resumeAfterPublish \? \[\] : \[ENTITIES\.coverage, ENTITIES\.signal, ENTITIES\.opportunity\]/);
  assert.match(script, /resumeAfterPublish/);
  assert.match(script, /skipSolutionWrites/);
});

test("R2F writes only the approved forms, views, role privileges and probe prefix", () => {
  assert.match(script, /aigw_nextaction/);
  assert.match(script, /aigw_nextactiondate/);
  assert.match(script, /aigw_interactionsignal_subgrid/);
  assert.match(script, /\[AI-DEMO-SCHEMA-PROBE\]/);
  assert.match(script, /aigw_customerservicecoverages/);
  assert.match(script, /aigw_interactionsignals/);
  assert.match(script, /AddPrivilegesRole/);
  assert.match(script, /No approved Account Demo Form found/);
});

test("R2F reads local Choice options and preserves Global Choice classification", () => {
  const local = extractChoiceMetadata({
    LogicalName: "aigw_servicetype",
    AttributeType: "Picklist",
    DisplayName: { LocalizedLabels: [{ Label: "服务类型", LanguageCode: 2052 }, { Label: "Service Type", LanguageCode: 1033 }] },
    OptionSet: { IsGlobal: false, Name: "local_service_type", Options: [{ Value: 10, Label: { LocalizedLabels: [{ Label: "海运", LanguageCode: 2052 }, { Label: "Sea", LanguageCode: 1033 }] } }] },
  }, CHOICE_DEFINITIONS[0]);
  const global = extractChoiceMetadata({
    LogicalName: "aigw_activitytype",
    AttributeType: "Picklist",
    DisplayName: { LocalizedLabels: [{ Label: "活动类型", LanguageCode: 2052 }] },
    OptionSet: { IsGlobal: true, Name: "global_activity_type", Options: [{ Value: 20, Label: { LocalizedLabels: [{ Label: "会议", LanguageCode: 2052 }] } }] },
  }, CHOICE_DEFINITIONS[5]);
  assert.equal(local.isGlobal, false);
  assert.equal(local.options[0].value, 10);
  assert.equal(local.options[0].labelZh, "海运");
  assert.equal(local.fieldLabelMatches, true);
  assert.equal(global.isGlobal, true);
  assert.equal(choiceGateStatus([local, global]).localReady, true);
  assert.equal(choiceGateStatus([local, global]).globalReady, true);
});

test("R2F reports separate gate counts and keeps probe cleanup manifest order", () => {
  assert.deepEqual(gateCountStatus({ p0: 0, p1: 0, p2: 1 }), { p0Count: 0, p1Count: 0, p2Count: 1, p0GatePassed: true, p1GatePassed: true });
  assert.deepEqual(buildProbeCleanupItems({ account: "a", opportunity: "o", coverage: ["c1", "c2"], signal: ["s1", "s2", "s3"] }), [
    ["aigw_interactionsignals", "s1"], ["aigw_interactionsignals", "s2"], ["aigw_interactionsignals", "s3"],
    ["aigw_customerservicecoverages", "c1"], ["aigw_customerservicecoverages", "c2"], ["opportunities", "o"], ["accounts", "a"],
  ]);
  assert.match(script, /AddSolutionComponent was not confirmed after one controlled retry/);
  assert.match(script, /DoNotIncludeSubcomponents: true/);
});
