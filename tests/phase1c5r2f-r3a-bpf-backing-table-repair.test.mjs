import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildBackingEntityShellPayload,
  cleanupPackageResult,
  inspectExportedPackage,
  packageContainsTargets,
} from "../scripts/dataverse/phase1c5r2f-r3a-bpf-backing-table-repair.mjs";

test("R3A shell-only Entity AddSolutionComponent payload is constrained", () => {
  const payload = buildBackingEntityShellPayload({ componentId: "meta-id" });
  assert.deepEqual(payload, {
    ComponentId: "meta-id",
    ComponentType: 1,
    SolutionUniqueName: "CRMAIGatewayDemo",
    AddRequiredComponents: false,
    DoNotIncludeSubcomponents: true,
  });
});

test("R3A package gate requires BPF, backing entity, forms and views", () => {
  const ready = {
    bpf: { ready: true },
    backingEntity: { ready: true },
    formsReady: true,
    viewsReady: true,
  };
  assert.equal(packageContainsTargets(ready), true);
  assert.equal(packageContainsTargets({ ...ready, viewsReady: false }), false);
  assert.equal(packageContainsTargets(null), false);
  assert.deepEqual(cleanupPackageResult({ status: "succeeded" }).files, []);
});

test("R3A package inspection accepts generated BPF entity root evidence without MetadataId", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "r3a-package-"));
  try {
    await fs.writeFile(path.join(directory, "solution.xml"), '<RootComponent type="1" schemaName="aigw_ai_demo_full_replica" behavior="1" /><RootComponent type="29" id="{7325b274-6b7c-f111-ab0e-70a8a50388b9}" />');
    await fs.writeFile(path.join(directory, "customizations.xml"), '<Entity><entity Name="aigw_ai_demo_full_replica"><EntitySetName>aigw_ai_demo_full_replicas</EntitySetName><IsBPFEntity>1</IsBPFEntity></entity></Entity>');
    for (const id of ["8e260676-56ce-47b1-a949-3d2560eda95c", "2c1d6dee-2691-4abd-8b51-492534414610", "8aea4159-31c6-5f7f-8283-6f2192f3519c", "b7fffbbf-2ad1-5370-b677-706d2f8994e6", "09705286-f108-5f96-9784-b05cfd5dd7d8", "db50ed56-c339-5938-8b9e-f553e24502a7", "761e3a59-6302-538f-beb1-7efdc7a89662"]) {
      await fs.appendFile(path.join(directory, "customizations.xml"), id);
    }
    const result = await inspectExportedPackage({ extractDir: directory, backingEntityId: "27dc1d23-5c7f-f111-ab0e-70a8a5007736" });
    assert.equal(result.backingEntity.idPresent, false);
    assert.equal(result.backingEntity.rootComponentPresent, true);
    assert.equal(result.backingEntity.definitionPresent, true);
    assert.equal(result.packageDependencyReady, true);
    assert.equal(packageContainsTargets(result), true);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("R3A source keeps the test-only and single-action safety boundaries", async () => {
  const source = await fs.readFile(new URL("../scripts/dataverse/phase1c5r2f-r3a-bpf-backing-table-repair.mjs", import.meta.url), "utf8");
  assert.match(source, /org91f5f65f\.crm5\.dynamics\.com/);
  assert.match(source, /lcn-crm\.crm7\.dynamics\.com/);
  assert.match(source, /AddSolutionComponent/);
  assert.match(source, /ExportSolution/);
  assert.match(source, /const delays = \[2000, 5000, 10000, 20000\]/);
  assert.match(source, /DoNotIncludeSubcomponents: true/);
  assert.match(source, /ComponentType: COMPONENT_ENTITY/);
  assert.doesNotMatch(source, /InsertOptionValue|PublishXml|PublishAllXml/);
  assert.doesNotMatch(source, /\/api\/data\/v9\.2\/(accounts|opportunities)\b/);
});
