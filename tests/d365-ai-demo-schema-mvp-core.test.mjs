import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AUTHORIZATION,
  KEY_DEFINITIONS,
  RELATIONSHIPS,
  SOLUTION,
  TARGET_HOSTNAME,
  buildAttributePayload,
  buildEntityPayload,
  buildKeyPayload,
  buildRelationshipPayload,
  fieldSchemaName,
  labels,
  main,
  parseFlags,
} from "../scripts/dataverse/phase1c-schema-mvp-core.mjs";

const manifest = JSON.parse(await readFile(new URL("../docs/d365/d365-ai-demo-schema-mvp-manifest.json", import.meta.url), "utf8"));
const source = await readFile(new URL("../scripts/dataverse/phase1c-schema-mvp-core.mjs", import.meta.url), "utf8");

test("Core Schema manifest stays within the approved MVP scope", () => {
  assert.deepEqual(manifest.scope.included, [
    "opportunity.aigw_nextaction",
    "opportunity.aigw_nextactiondate",
    "aigw_customerservicecoverage",
    "aigw_interactionsignal",
  ]);
  assert.equal(manifest.entities.length, 3);
  assert.equal(manifest.entities.find((entity) => entity.logicalName === "aigw_customerservicecoverage").fields.length, 14);
  assert.equal(manifest.entities.find((entity) => entity.logicalName === "aigw_interactionsignal").fields.length, 25);
  assert.equal(manifest.choices.localChoicePlans.length, 12);
  assert.equal(manifest.choices.localChoicePlans.every((choice) => choice.options.every((option) => typeof option === "string")), true);
});

test("Choice, labels, relationship and key payloads are deterministic and bilingual", () => {
  const label = labels("Next Action", "下一步行动");
  assert.deepEqual(label.LocalizedLabels.map((item) => item.LanguageCode), [1033, 2052]);
  const field = { logicalName: "aigw_nextaction", schemaName: "Aigw_Nextaction", displayNameEn: "Next Action", displayNameZh: "下一步行动", dataType: "SingleLineOfText", maxLength: 500, requiredLevel: "None" };
  const payload = buildAttributePayload(field);
  assert.equal(payload["@odata.type"], "Microsoft.Dynamics.CRM.StringAttributeMetadata");
  assert.equal(payload.MaxLength, 500);
  assert.equal(payload.RequiredLevel.Value, "None");
  assert.equal(payload.DisplayName.LocalizedLabels.find((item) => item.LanguageCode === 2052).Label, "下一步行动");
  assert.equal(fieldSchemaName("aigw_interactiontoken"), "Aigw_Interactiontoken");
  assert.equal(RELATIONSHIPS.length, 5);
  const relationship = buildRelationshipPayload(RELATIONSHIPS[0], [{ logicalName: "aigw_accountid", schemaName: "Aigw_Accountid", displayNameEn: "Account", displayNameZh: "客户" }]);
  assert.equal(relationship.ReferencedEntity, "account");
  assert.equal(relationship.ReferencingEntity, "aigw_customerservicecoverage");
  assert.equal(relationship.CascadeConfiguration.Delete, "Restrict");
  assert.equal(buildKeyPayload(KEY_DEFINITIONS[1]).KeyAttributes[0], "aigw_interactiontoken");
  assert.equal(buildEntityPayload("aigw_customerservicecoverage", manifest.entities[1]).OwnershipType, "UserOwned");
});

test("Script uses the test hostname gate, publish gate and dry-run default", () => {
  assert.equal(TARGET_HOSTNAME, "org91f5f65f.crm5.dynamics.com");
  assert.equal(SOLUTION, "CRMAIGatewayDemo");
  assert.match(AUTHORIZATION, /^CONFIRM_D365_TEST_WRITE_/);
  assert.deepEqual(parseFlags([]), { apply: false, dryRun: true, authorized: false });
  assert.equal(parseFlags(["--apply", `--authorization=${AUTHORIZATION}`]).authorized, true);
  assert.equal(source.includes('assertDataverseScriptGate({ mode: "publish/deploy-capable"'), true);
  assert.match(source, /TARGET_HOSTNAME/);
  assert.match(source, /PRODUCTION_HOSTNAME/);
  assert.doesNotMatch(source, /lcn-crm\.crm7\.dynamics\.com/);
});

test("Core executor exports main without running the CLI during import", () => {
  assert.equal(typeof main, "function");
  assert.match(source, /export async function main\(/);
  assert.equal(source.match(/export async function main\(/g)?.length, 1);
});

test("Core executor never mutates forms, views, apps, security, BPF or business records", () => {
  assert.doesNotMatch(source, /dataversePatch|dataverseDelete/);
  assert.doesNotMatch(source, /POST\s+\/api\/data\/v9\.2\/(systemforms|savedqueries|appmodules|workflows|systemusers|roles|opportunities|accounts|contacts|annotations|phonecalls|appointments|tasks|emails)/i);
  assert.doesNotMatch(source, /PublishAll|PublishAllXml|CreateOrganization|AddUserToRole/i);
  assert.match(source, /RelationshipDefinitions/);
  assert.match(source, /AddSolutionComponent/);
  assert.match(source, /PublishXml/);
  assert.equal((source.match(/client\.dataversePost/g) || []).length, 1);
  assert.equal((source.match(/client\.dataverseGet/g) || []).length, 1);
});

test("Required relationship and alternate-key scope has no activity hard relationship", () => {
  assert.equal(RELATIONSHIPS.some((item) => item.from === "phonecall" || item.from === "appointment" || item.from === "task" || item.from === "email"), false);
  assert.deepEqual(KEY_DEFINITIONS.map((item) => item.attributes), [
    ["aigw_accountid", "aigw_servicetype", "aigw_startdate"],
    ["aigw_interactiontoken"],
  ]);
});

test("Solution membership verifies entity-root subcomponents without guessing direct IDs", () => {
  assert.match(source, /rootcomponentbehavior/);
  assert.match(source, /entity-root-subcomponent/);
  assert.match(source, /Number\(root\.rootcomponentbehavior\) !== 0/);
});
