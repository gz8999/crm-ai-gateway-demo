import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  CHOICE_LABELS,
  buildInsertOptionValuePayload,
  buildProbeChoiceMap,
  buildTargetPublishPayload,
  cleanupProbeManifest,
  gatePassedFromCount,
  optionSetMatches,
  parseOptionSet,
  relationshipNavigation,
  resolveNewOptionValue,
  serializeWriteCounts,
} from "../scripts/dataverse/phase1c5r2f-choice-solution-repair.mjs";

test("R2 approved Choice catalog contains 12 fields and 75 options", () => {
  assert.equal(CHOICE_LABELS.length, 12);
  assert.equal(CHOICE_LABELS.reduce((sum, item) => sum + item.options.length, 0), 75);
  for (const item of CHOICE_LABELS) assert.equal(item.options.length, item.englishOptions.length);
});

test("Local InsertOptionValue payload omits guessed numeric values", () => {
  const payload = buildInsertOptionValuePayload({ entityLogicalName: "aigw_customerservicecoverage", attributeLogicalName: "aigw_servicetype", chinese: "国内运输", english: "Domestic Transport" });
  assert.equal(payload.EntityLogicalName, "aigw_customerservicecoverage");
  assert.equal(payload.AttributeLogicalName, "aigw_servicetype");
  assert.equal("OptionSetName" in payload, false);
  assert.equal("Value" in payload, false);
  assert.equal(payload.SolutionUniqueName, "CRMAIGatewayDemo");
  assert.deepEqual(payload.Label.LocalizedLabels.map((item) => [item.LanguageCode, item.Label]), [[2052, "国内运输"]]);
});

test("English label is opt-in only after language enablement is proven", () => {
  const payload = buildInsertOptionValuePayload({ entityLogicalName: "aigw_interactionsignal", attributeLogicalName: "aigw_sentiment", chinese: "正面", english: "Positive", englishLanguageCode: 1033 });
  assert.deepEqual(payload.Label.LocalizedLabels.map((item) => [item.LanguageCode, item.Label]), [[2052, "正面"], [1033, "Positive"]]);
});

test("Choice metadata parser preserves local scope, labels, values and order", () => {
  const metadata = parseOptionSet({
    MetadataId: "meta-1",
    LogicalName: "aigw_servicetype",
    SchemaName: "Aigw_Servicetype",
    AttributeType: "Picklist",
    DisplayName: { LocalizedLabels: [{ LanguageCode: 2052, Label: "服务类型" }] },
    OptionSet: {
      IsGlobal: false,
      Name: "local_service_type",
      Options: [
        { Value: 727000000, Label: { LocalizedLabels: [{ LanguageCode: 2052, Label: "国内运输" }, { LanguageCode: 1033, Label: "Domestic Transport" }] } },
      ],
    },
  });
  assert.equal(metadata.isGlobal, false);
  assert.equal(metadata.options[0].value, 727000000);
  assert.equal(metadata.options[0].labels["2052"], "国内运输");
});

test("Probe cleanup order is exact and reverse dependency order", () => {
  const items = cleanupProbeManifest({ accountId: "a", opportunityId: "o", coverages: ["c1", "c2"], signals: ["s1", "s2", "s3"] });
  assert.deepEqual(items, [
    ["aigw_interactionsignals", "s1"], ["aigw_interactionsignals", "s2"], ["aigw_interactionsignals", "s3"],
    ["aigw_customerservicecoverages", "c1"], ["aigw_customerservicecoverages", "c2"],
    ["opportunities", "o"], ["accounts", "a"],
  ]);
});

test("Partial local Choice is not accepted as the approved complete definition", () => {
  const metadata = parseOptionSet({ LogicalName: "aigw_servicetype", OptionSet: { IsGlobal: false, Name: "local_service_type", Options: [{ Value: 1, Label: { LocalizedLabels: [{ LanguageCode: 2052, Label: "错误标签" }] } }] } });
  assert.equal(optionSetMatches(metadata, CHOICE_LABELS[0]), false);
});

test("NewOptionValue response is read back without trusting a guessed number", () => {
  assert.equal(resolveNewOptionValue({ NewOptionValue: 727000123 }), 727000123);
  assert.equal(resolveNewOptionValue({ value: { newoptionvalue: "727000124" } }), 727000124);
  assert.equal(resolveNewOptionValue({ OptionSetName: "not-a-value" }), null);
});

test("Choice readback can accept the environment's deferred English labels", () => {
  const metadata = parseOptionSet({ LogicalName: "aigw_servicetype", AttributeType: "Picklist", OptionSet: { IsGlobal: false, Options: [{ Value: 727000000, Label: { LocalizedLabels: [{ LanguageCode: 2052, Label: "国内运输" }] } }, { Value: 727000001, Label: { LocalizedLabels: [{ LanguageCode: 2052, Label: "国际海运" }] } }, { Value: 727000002, Label: { LocalizedLabels: [{ LanguageCode: 2052, Label: "国际空运" }] } }, { Value: 727000003, Label: { LocalizedLabels: [{ LanguageCode: 2052, Label: "铁路运输" }] } }, { Value: 727000004, Label: { LocalizedLabels: [{ LanguageCode: 2052, Label: "仓储运营" }] } }, { Value: 727000005, Label: { LocalizedLabels: [{ LanguageCode: 2052, Label: "门店配送" }] } }, { Value: 727000006, Label: { LocalizedLabels: [{ LanguageCode: 2052, Label: "冷链物流" }] } }, { Value: 727000007, Label: { LocalizedLabels: [{ LanguageCode: 2052, Label: "跨境电商物流" }] } }, { Value: 727000008, Label: { LocalizedLabels: [{ LanguageCode: 2052, Label: "供应链解决方案" }] } }, { Value: 727000009, Label: { LocalizedLabels: [{ LanguageCode: 2052, Label: "其他" }] } }] } });
  assert.equal(optionSetMatches(metadata, CHOICE_LABELS[0]), true);
  assert.equal(optionSetMatches(metadata, CHOICE_LABELS[0], { englishRequired: true }), false);
});

test("Probe uses actual readback Choice values by label", () => {
  const map = buildProbeChoiceMap([{ entity: "aigw_customerservicecoverage", attribute: "aigw_servicetype", after: { options: [{ value: 88, labels: { "2052": "国内运输" } }] } }]);
  assert.equal(map.aigw_customerservicecoverage.aigw_servicetype["国内运输"], 88);
});

test("Probe resolves Dataverse lookup navigation names from metadata", () => {
  const metadata = { ManyToOneRelationships: [{ ReferencingAttribute: "aigw_accountid", ReferencingEntityNavigationPropertyName: "Aigw_Accountid" }] };
  assert.equal(relationshipNavigation(metadata, "aigw_accountid"), "Aigw_Accountid");
  assert.equal(relationshipNavigation(metadata, "missing", "fallback"), "fallback");
});

test("Targeted publish contains exactly the two approved entities", () => {
  assert.deepEqual(buildTargetPublishPayload(), { ParameterXml: "<importexportxml><entities><entity>aigw_customerservicecoverage</entity><entity>aigw_interactionsignal</entity></entities></importexportxml>" });
});

test("Write counts and gates keep numeric counts separate from readiness booleans", () => {
  const counts = serializeWriteCounts({ ChoiceInsert: 0, ProbeCreate: 0, ProbeDelete: 0 });
  assert.deepEqual(counts, { choiceWrites: 0, businessProbeCreates: 0, businessProbeDeletes: 0, businessRecordWrites: 0 });
  assert.equal(gatePassedFromCount(0), true);
  assert.equal(gatePassedFromCount(1), false);
});

test("Cleanup accepts dynamic metadata entity sets but only exact manifest IDs", () => {
  assert.deepEqual(cleanupProbeManifest({ signalSet: "signals", coverageSet: "coverages", signals: ["s"], coverages: ["c"], opportunityId: "o", accountId: "a" }), [["signals", "s"], ["coverages", "c"], ["opportunities", "o"], ["accounts", "a"]]);
});

test("R3B source keeps the test hostname and forbids package/schema mutation paths", async () => {
  const source = await fs.readFile(new URL("../scripts/dataverse/phase1c5r2f-choice-solution-repair.mjs", import.meta.url), "utf8");
  assert.match(source, /org91f5f65f\.crm5\.dynamics\.com/);
  assert.match(source, /lcn-crm\.crm7\.dynamics\.com/);
  assert.match(source, /InsertOptionValue/);
  assert.doesNotMatch(source, /ExportSolution/);
  assert.doesNotMatch(source, /AddSolutionComponent/);
  assert.doesNotMatch(source, /PublishAllXml/);
  assert.doesNotMatch(source, /choiceWrites\s*[:=]\s*true/);
  assert.doesNotMatch(source, /businessRecordWrites\s*[:=]\s*true/);
});
